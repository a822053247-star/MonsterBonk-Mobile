import type { Combat, Enemy } from './combat';
import type { CrownthornAction } from './crownthorn-animation';

type Point = { x: number; z: number };
export const ENCOUNTER_RULES = {
  hostileShots: 16, bossHp: 6000, bossRadius: 1.05, bossSpawn: 1.5, bossSupportCap: 120,
  waveHealth: [1,1.2,1.5,1.8,2.2,1.8],
  bossSpeed: 1.8, dashSpeed: 15, dashDuration: .65, dashWindup: 1.1,
  spreadWindup: 1, spreadSpeed: 6, spreadLife: 2, shotRadius: .24,
  eliteHp: 480, eliteRadius: 1, elitePulseRadius: 3.4, eliteWindup: 1.3,
  elitePulseCooldown: 2.9, elitePulseDamage: 20,
  meleeWindup: .55, meleeActive: .16, meleeRecovery: .9,
} as const;
/** Predict only when locking a warning. Bounded curvature makes an unchanged
 * circular path readable to enemies; a subsequent reversal invalidates the aim. */
export function predictPosition(player: Point, vx: number, vz: number, turn: number, seconds: number): Point {
  const sine=Math.abs(turn)<.01?seconds:Math.sin(turn*seconds)/turn;
  const cosine=Math.abs(turn)<.01?0:(1-Math.cos(turn*seconds))/turn;
  return {x:player.x+vx*sine-vz*cosine,z:player.z+vx*cosine+vz*sine};
}
export type BossState = 'approach' | 'spread-windup' | 'spread' | 'dash-windup' | 'dash' | 'summon-windup' | 'summon' | 'recover' | 'dying' | 'defeated';
export interface HostileShot { active: boolean; x: number; z: number; previousX: number; previousZ: number; vx: number; vz: number; life: number }

/** Formal-run behavior only. Clocks are simulation clocks; renderers never call damage. */
export class EnemyChallenge {
  enabled = false;
  wave = 0;
  boss?: Enemy;
  elite?: Enemy;
  bossState: BossState = 'approach';
  bossTime = 0;
  aimX = 0;
  aimZ = 1;
  eliteTime = 0;
  eliteCooldown = 2;
  elitePulsing = false;
  private pulseDue = false;
  private pattern = 0;
  private motion = { x: 0, z: 0 };
  readonly shots: HostileShot[] = Array.from({ length: ENCOUNTER_RULES.hostileShots }, () => ({ active: false, x: 0, z: 0, previousX: 0, previousZ: 0, vx: 0, vz: 0, life: 0 }));
  get enraged() { return !!this.boss?.active && this.boss.hp <= ENCOUNTER_RULES.bossHp / 2; }
  get defeated() { return this.bossState === 'defeated'; }
  get dying() { return this.bossState === 'dying' || this.defeated; }
  get action(): CrownthornAction | null {
    if (this.dying) return 'death';
    if (this.bossState.startsWith('spread')) return 'spread-cast';
    if (this.bossState.startsWith('summon')) return 'summon';
    if (this.bossState === 'dash-windup') return 'dash-windup';
    if (this.bossState === 'dash') return 'dash';
    return this.bossState === 'approach' ? null : this.enraged ? 'enraged-idle' : 'idle';
  }
  clearShots() { for (const s of this.shots) s.active = false; }
  reset() {
    this.enabled = false; this.wave = 0; this.boss = this.elite = undefined;
    this.bossState = 'approach'; this.bossTime = this.eliteTime = this.pattern = 0;
    this.eliteCooldown = 2; this.elitePulsing = this.pulseDue = false; this.aimX = 0; this.aimZ = 1;
    this.clearShots();
  }
  beginWave(wave: number) { this.reset(); this.enabled = true; this.wave = wave; }
  beforeTick(dt: number) {
    this.pulseDue = false;
    if (this.bossState === 'dying') { this.bossTime += dt; if (this.bossTime >= 1) this.bossState = 'defeated'; }
  }
  killedBoss(combat: Combat) {
    combat.clearSpecialEvents();
    this.bossState = 'dying'; this.bossTime = 0; this.clearShots();
    if(this.boss) { this.boss.previousX=this.boss.x; this.boss.previousZ=this.boss.z; this.boss.walkX=this.boss.walkZ=0; }
    // Victory presentation cannot be interrupted by leftover summons; no fake kills/rewards.
    for (const enemy of combat.enemies) if (enemy !== this.boss) enemy.active = false;
  }
  spawnBoss(combat: Combat, player: Point) {
    if (this.boss) return this.boss;
    this.boss = combat.spawnRank('boss', player);
    if (this.boss) { this.bossState = 'approach'; this.bossTime = 0; this.pattern = 0; }
    return this.boss;
  }
  spawnElite(combat: Combat, player: Point) {
    if (!this.elite) this.elite = combat.spawnRank('elite', player);
    return this.elite;
  }
  private transition(state: BossState) { this.bossState = state; this.bossTime = 0; }
  /** Keep normal navigation/cover sliding, replacing only the chosen attack's velocity. */
  movement(enemy: Enemy, dt: number, player: Point, combat: Combat, x: number, z: number) {
    this.motion.x = x; this.motion.z = z;
    if (enemy === this.boss) {
      this.bossTime += dt;
      const distance = Math.hypot(player.x-enemy.x, player.z-enemy.z);
      const tempo = this.enraged ? .8 : 1;
      if (this.bossState === 'approach' && (distance < 8 || this.bossTime > 3)) {
        const state=(['spread-windup', 'dash-windup', 'summon-windup'] as const)[this.pattern++ % 3];
        // A bounded lead punishes an unchanged orbit, but the displayed locked
        // warning never follows the player. Reversing/side-stepping stays safe.
        const lead=(state==='dash-windup'?ENCOUNTER_RULES.dashWindup:ENCOUNTER_RULES.spreadWindup)*tempo+(state==='dash-windup'?.35:.7);
        const predicted=predictPosition(player,combat.playerVelocityX,combat.playerVelocityZ,combat.playerTurnRate,lead);
        const tx=predicted.x-enemy.x, tz=predicted.z-enemy.z;
        const length=Math.max(.001,Math.hypot(tx,tz)); this.aimX=tx/length; this.aimZ=tz/length;
        if(length<=.001) this.aimZ=1;
        this.transition(state);
      } else if (this.bossState === 'spread-windup' && this.bossTime >= ENCOUNTER_RULES.spreadWindup * tempo) {
        const angle = Math.atan2(this.aimX,this.aimZ);
        for (let i = -2; i <= 2; i++) {
          const shot = this.shots.find(s => !s.active); if (!shot) break;
          const vx = Math.sin(angle+i*.35), vz = Math.cos(angle+i*.35), speed = ENCOUNTER_RULES.spreadSpeed*(this.enraged ? 1.15 : 1);
          const sx = enemy.x, sz = enemy.z;
          Object.assign(shot,{active:true,x:sx,z:sz,previousX:sx,previousZ:sz,vx:vx*speed,vz:vz*speed,life:ENCOUNTER_RULES.spreadLife});
        }
        this.transition('spread');
      } else if (this.bossState === 'dash-windup' && this.bossTime >= ENCOUNTER_RULES.dashWindup * tempo) this.transition('dash');
      else if (this.bossState === 'dash' && this.bossTime >= ENCOUNTER_RULES.dashDuration) this.transition('recover');
      else if (this.bossState === 'summon-windup' && this.bossTime >= .9 * tempo) {
        for (let i = 0; i < 3 && combat.enemies.filter(e => e.active).length < ENCOUNTER_RULES.bossSupportCap; i++) combat.spawnEncounter('normal', enemy, 2.8, 4.2);
        this.transition('summon');
      } else if ((this.bossState === 'spread' || this.bossState === 'summon') && this.bossTime >= .7) this.transition('recover');
      else if (this.bossState === 'recover' && this.bossTime >= (this.enraged ? 1.06 : 1.4)) this.transition('approach');
      if (this.bossState === 'dash') { this.motion.x = this.aimX*ENCOUNTER_RULES.dashSpeed; this.motion.z = this.aimZ*ENCOUNTER_RULES.dashSpeed; }
      else if (this.bossState !== 'approach') this.motion.x = this.motion.z = 0;
      else { this.motion.x *= ENCOUNTER_RULES.bossSpeed/.75; this.motion.z *= ENCOUNTER_RULES.bossSpeed/.75; }
    } else if (enemy === this.elite) {
      if (this.elitePulsing) {
        this.eliteTime += dt; this.motion.x = this.motion.z = 0;
        if (this.eliteTime >= ENCOUNTER_RULES.eliteWindup) { this.pulseDue = true; this.elitePulsing = false; this.eliteCooldown = ENCOUNTER_RULES.elitePulseCooldown; }
      } else {
        this.eliteCooldown = Math.max(0,this.eliteCooldown-dt);
        // A spore explosion has its own warning; avoid starting two major warnings together.
        const sporeWarning = combat.sporeExplosions.some(e => e.active && !e.detonated);
        if (!this.eliteCooldown && !sporeWarning && Math.hypot(player.x-enemy.x, player.z-enemy.z)<6) {
          this.elitePulsing=true; this.eliteTime=0; this.motion.x=this.motion.z=0;
        }
      }
    }
    return this.motion;
  }
  advanceHazards(dt: number, combat: Combat, player: Point, previous: Point) {
    if (this.dying) { this.clearShots(); return; }
    if (this.pulseDue && this.elite?.active && Math.hypot(player.x-this.elite.x,player.z-this.elite.z) < ENCOUNTER_RULES.elitePulseRadius+.62
      && !combat.covered(this.elite.x,this.elite.z,player.x,player.z)) combat.hitPlayer(ENCOUNTER_RULES.elitePulseDamage);
    for (const shot of this.shots) {
      if (!shot.active) continue;
      shot.previousX=shot.x; shot.previousZ=shot.z;
      const travel=Math.min(dt,shot.life);
      shot.x+=shot.vx*travel; shot.z+=shot.vz*travel; shot.life-=dt;
      const wall = combat.hostileWallHit(shot.previousX,shot.previousZ,shot.x,shot.z,ENCOUNTER_RULES.shotRadius);
      const hit = combat.hostilePlayerHit(shot.previousX-previous.x,shot.previousZ-previous.z,shot.x-player.x,shot.z-player.z,ENCOUNTER_RULES.shotRadius+.62);
      if (hit < wall && hit !== Infinity) { combat.hitPlayer(12); shot.active=false; }
      else if (wall !== Infinity || shot.life<=0) shot.active=false;
    }
  }
  inspect() {
    return { enabled:this.enabled,wave:this.wave,boss:this.boss ? {id:this.boss.id,hp:this.boss.hp,maxHp:this.boss.maxHp,x:this.boss.x,z:this.boss.z,spawning:this.boss.spawnTime>0,
      state:this.bossState,time:this.bossTime,enraged:this.enraged,aimX:this.aimX,aimZ:this.aimZ} : null,
      elite:this.elite?.active ? {id:this.elite.id,hp:this.elite.hp,pulsing:this.elitePulsing,time:this.eliteTime} : null,
      shots:this.shots.filter(s=>s.active).map(s=>({x:s.x,z:s.z,vx:s.vx,vz:s.vz})),limit:ENCOUNTER_RULES.hostileShots };
  }
}
