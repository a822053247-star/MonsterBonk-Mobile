import type { Combat, Enemy } from './combat';
import { FORMAL_SPAWN_CAPS } from './spawn-layout';
import type { CrownthornAction } from './crownthorn-animation';
import { ELITE_QUAKE_DURATION, type EliteQuakeEvent } from './elite-quake';
import { ARENA_HALF_EXTENT, PLAYER_COLLISION_RADIUS } from './arena-boundary';
import { endlessBossDefinition, type EndlessBossDefinition } from './endless-boss';

type Point = { x: number; z: number };
export const ENCOUNTER_RULES = {
  hostileShots: 16, bossHp: 6000, bossRadius: 1.05, bossSpawn: 1.5, bossSupportCap: FORMAL_SPAWN_CAPS[5],
  waveHealth: [1,1.15,1.35,1.5,1.75,1.4],
  bossSpeed: 1.8, dashSpeed: 15, dashDuration: .85, dashWindup: 1.1,
  spreadWindup: 1, spreadSpeed: 6, spreadLife: 2, shotRadius: .24,
  eliteHp: 480, eliteRadius: 1, elitePulseRadius: 3.4, eliteWindup: 1.3,
  elitePulseCooldown: 2.9, elitePulseDamage: 20,
  meleeWindup: .55, meleeActive: .16, meleeRecovery: .9,
} as const;
export const CAMPAIGN_ELITE_QUAKE = { warning: 2.2, cooldown: 3.6, reaction: .8, escapeMargin: .9, sideDistance: 5.5 } as const;
export const CAMPAIGN_BOSS = { spreadCount: 7, enragedSpreadCount: 9, dashDuration: ENCOUNTER_RULES.dashDuration } as const;
const CAMPAIGN_BOSS_PATTERN = ['spread-windup', 'dash-windup', 'summon-windup', 'dash-windup'] as const;
/** Predict only when locking a warning. Bounded curvature makes an unchanged
 * circular path readable to enemies; a subsequent reversal invalidates the aim. */
export function predictPosition(player: Point, vx: number, vz: number, turn: number, seconds: number): Point {
  const sine=Math.abs(turn)<.01?seconds:Math.sin(turn*seconds)/turn;
  const cosine=Math.abs(turn)<.01?0:(1-Math.cos(turn*seconds))/turn;
  return {x:player.x+vx*sine-vz*cosine,z:player.z+vx*cosine+vz*sine};
}
export type BossState = 'approach' | 'spread-windup' | 'spread' | 'dash-windup' | 'dash' | 'summon-windup' | 'summon' | 'quake-windup' | 'quake' | 'recover' | 'dying' | 'defeated';
export interface HostileShot { style?: 'spore' | 'crystal' | 'petal' | 'thunder' | 'toxic' | 'boss'; active: boolean; x: number; z: number; previousX: number; previousZ: number; vx: number; vz: number; life: number }

/** Formal-run behavior only. Clocks are simulation clocks; renderers never call damage. */
export class EnemyChallenge {
  enabled = false;
  wave = 0;
  boss?: Enemy;
  bossProfile?: EndlessBossDefinition;
  readonly bossQuake: EliteQuakeEvent = {active:false,age:0,x:0,z:0};
  readonly bossQuakeTarget = {x:0,z:0};
  private bossQuakeDue = false;
  private quakeCount = 0;
  get bossName() { return this.bossProfile?.name ?? '荆冠兽王'; }
  elite?: Enemy;
  bossState: BossState = 'approach';
  /** Set by Endless RunFlow when the Boss reaches its target time. */
  forceEnraged = false;
  releaseWindow = false;
  bossTime = 0;
  aimX = 0;
  aimZ = 1;
  eliteTime = 0;
  eliteCooldown = 2;
  elitePulsing = false;
  eliteWindupDuration: number = ENCOUNTER_RULES.eliteWindup;
  readonly eliteQuake: EliteQuakeEvent = { active: false, age: 0, x: 0, z: 0 };
  readonly eliteQuakeAftershocks: EliteQuakeEvent[] = Array.from({ length: 2 }, () => ({ active: false, age: 0, x: 0, z: 0 }));
  readonly eliteQuakeTargets = Array.from({ length: 3 }, () => ({ active: false, x: 0, z: 0 }));
  private pulseDue = false;
  private pattern = 0;
  private campaign = true;
  private motion = { x: 0, z: 0 };
  readonly shots: HostileShot[] = Array.from({ length: ENCOUNTER_RULES.hostileShots }, () => ({ active: false, x: 0, z: 0, previousX: 0, previousZ: 0, vx: 0, vz: 0, life: 0 }));
  get enraged() {
    return !!this.boss?.active && (this.forceEnraged || this.boss.hp <= (this.boss.maxHp ?? ENCOUNTER_RULES.bossHp) / 2);
  }
  get defeated() { return this.bossState === 'defeated'; }
  get dashDuration() { return this.bossProfile?.dashDuration ?? CAMPAIGN_BOSS.dashDuration; }
  get dashSpeed() { return this.bossProfile?.dashSpeed ?? ENCOUNTER_RULES.dashSpeed; }
  get dashWindupDuration() { return this.bossProfile ? 1.1 : this.enraged ? .95 : 1.1; }
  get spreadWindupDuration() { return this.bossProfile ? 1.2 : this.enraged ? .9 : 1; }
  get spreadCount() { return this.bossProfile ? this.bossProfile.shotCount + (this.enraged ? 2 : 0) : this.enraged ? CAMPAIGN_BOSS.enragedSpreadCount : CAMPAIGN_BOSS.spreadCount; }
  get shotSpeed() { return this.bossProfile?.shotSpeed ?? ENCOUNTER_RULES.spreadSpeed*(this.enraged?1.1:1); }
  get shotLife() { return this.bossProfile?.shotLife ?? ENCOUNTER_RULES.spreadLife; }
  get quakeWindupDuration() { return 1.3; }
  get dying() { return this.bossState === 'dying' || this.defeated; }
  get action(): CrownthornAction | null {
    if (this.dying) return 'death';
    if (this.bossState.startsWith('spread')) return 'spread-cast';
    if (this.bossState.startsWith('summon')) return 'summon';
    if (this.bossState === 'dash-windup') return 'dash-windup';
    if (this.bossState === 'dash') return 'dash';
    return this.bossState === 'approach' ? null : this.enraged ? 'enraged-idle' : 'idle';
  }
  clearShots() { for (const s of this.shots) { s.active = false; s.style = undefined; } }
  freezeEnemy(enemy: Enemy) {
    if (enemy !== this.elite) return;
    this.elitePulsing = this.pulseDue = false; this.eliteTime = 0;
    for (const target of this.eliteQuakeTargets) target.active = false;
    this.eliteCooldown = Math.max(.75, this.eliteCooldown);
  }
  reset() {
    this.enabled = false; this.releaseWindow = false; this.wave = 0; this.boss = this.elite = undefined;
    this.campaign = true;
    this.bossProfile = undefined; this.bossQuakeDue = false; this.quakeCount = 0;
    Object.assign(this.bossQuake,{active:false,age:0,x:0,z:0});
    this.bossQuakeTarget.x = this.bossQuakeTarget.z = 0;
    this.bossState = 'approach'; this.forceEnraged = false; this.bossTime = this.eliteTime = this.pattern = 0;
    this.eliteCooldown = 2; this.elitePulsing = this.pulseDue = false; this.aimX = 0; this.aimZ = 1;
    Object.assign(this.eliteQuake, { active: false, age: 0, x: 0, z: 0 });
    this.eliteWindupDuration = ENCOUNTER_RULES.eliteWindup;
    for (const event of this.eliteQuakeAftershocks) Object.assign(event, { active: false, age: 0, x: 0, z: 0 });
    for (const target of this.eliteQuakeTargets) target.active = false;
    this.clearShots();
  }
  beginWave(wave: number, continuous = false, campaign = true) {
    if (continuous && this.enabled && wave === this.wave + 1 && wave <= 5) {
      // An unfinished wave-four elite keeps its pulse/health into wave five.
      this.wave = wave; return;
    }
    this.reset(); this.enabled = true; this.wave = wave; this.campaign = campaign;
  }
  beforeTick(dt: number) {
    this.pulseDue = false;
    this.bossQuakeDue = false;
    if (this.bossQuake.active) { this.bossQuake.age += dt; if(this.bossQuake.age>=ELITE_QUAKE_DURATION)this.bossQuake.active=false; }
    if (this.eliteQuake.active) {
      this.eliteQuake.age += dt;
      if (this.eliteQuake.age >= ELITE_QUAKE_DURATION) this.eliteQuake.active = false;
    }
    for (const event of this.eliteQuakeAftershocks) if (event.active) {
      event.age += dt;
      if (event.age >= ELITE_QUAKE_DURATION) event.active = false;
    }
    if (this.bossState === 'dying') { this.bossTime += dt; if (this.bossTime >= 1) this.bossState = 'defeated'; }
  }
  killedBoss(combat: Combat) {
    combat.clearSpecialEvents();
    this.bossState = 'dying'; this.bossTime = 0; this.clearShots();
    this.bossQuake.active = this.bossQuakeDue = false;
    if(this.boss) { this.boss.previousX=this.boss.x; this.boss.previousZ=this.boss.z; this.boss.walkX=this.boss.walkZ=0; }
    // Victory presentation cannot be interrupted by leftover summons; no fake kills/rewards.
    for (const enemy of combat.enemies) if (enemy !== this.boss) enemy.active = false;
  }
  spawnBoss(combat: Combat, player: Point) {
    if (this.boss) return this.boss;
    this.bossProfile = combat.endlessRoster ? endlessBossDefinition(combat.endlessCycleIndex) : undefined;
    this.boss = combat.spawnRank('boss', player);
    if (this.boss) { this.forceEnraged = false; this.bossState = 'approach'; this.bossTime = 0; this.pattern = 0; }
    return this.boss;
  }
  spawnElite(combat: Combat, player: Point) {
    if (!this.elite) this.elite = combat.spawnRank('elite', player);
    return this.elite;
  }
  private transition(state: BossState) { this.bossState = state; this.bossTime = 0; }
  /** Only cast if a straight, walkable escape fits inside the campaign boundary. */
  private lockCampaignQuake(combat: Combat, player: Point) {
    const radius = ENCOUNTER_RULES.elitePulseRadius + PLAYER_COLLISION_RADIUS;
    const distance = radius + CAMPAIGN_ELITE_QUAKE.escapeMargin;
    const limit = ARENA_HALF_EXTENT - PLAYER_COLLISION_RADIUS - .15;
    const preferred = Math.atan2(-player.z, -player.x);
    for (let i = 0; i < 24; i++) {
      const offset = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI / 12;
      const angle = preferred + offset, ux = Math.cos(angle), uz = Math.sin(angle);
      const endX = player.x + ux * distance, endZ = player.z + uz * distance;
      if (Math.abs(endX) > limit || Math.abs(endZ) > limit) continue;
      const blocked = combat.hostileWallHit(player.x,player.z,endX,endZ,PLAYER_COLLISION_RADIUS+.12)!==Infinity;
      if (blocked) continue;
      Object.assign(this.eliteQuakeTargets[0], { active: true, x: player.x, z: player.z });
      for (let j = 0; j < 2; j++) {
        // Both side circles sit behind the escape direction and cannot close that route.
        const sign = j ? 1 : -1, spread = CAMPAIGN_ELITE_QUAKE.sideDistance;
        const x = player.x + (-ux * .65 - uz * .76 * sign) * spread;
        const z = player.z + (-uz * .65 + ux * .76 * sign) * spread;
        const active = Math.abs(x) <= limit && Math.abs(z) <= limit
          && combat.hostileWallHit(x,z,x,z,.3)===Infinity;
        Object.assign(this.eliteQuakeTargets[j+1], { active, x, z });
      }
      this.eliteWindupDuration = Math.max(CAMPAIGN_ELITE_QUAKE.warning,
        CAMPAIGN_ELITE_QUAKE.reaction + distance / Math.max(.1, 4.6 * combat.stats.moveMultiplier) + .2);
      return true;
    }
    return false;
  }
  /** Keep normal navigation/cover sliding, replacing only the chosen attack's velocity. */
  movement(enemy: Enemy, dt: number, player: Point, combat: Combat, x: number, z: number) {
    this.motion.x = x; this.motion.z = z;
    if (enemy === this.boss) {
      this.bossTime += dt;
      const distance = Math.hypot(player.x-enemy.x, player.z-enemy.z);
      const tempo = this.enraged ? .8 : 1;
      if (this.bossState === 'approach' && (distance < 8 || this.bossTime > 3)) {
        const pattern = this.bossProfile ? (this.enraged ? this.bossProfile.enragedPattern : this.bossProfile.pattern) : CAMPAIGN_BOSS_PATTERN;
        const state=pattern[(this.pattern++ + (this.bossProfile && combat.endlessCycleIndex >= 4 ? 1 : 0)) % pattern.length];
        // A bounded lead punishes an unchanged orbit, but the displayed locked
        // warning never follows the player. Reversing/side-stepping stays safe.
        const lead=(state==='dash-windup'?this.dashWindupDuration:this.spreadWindupDuration)+(state==='dash-windup'?.35:.7);
        const predicted=predictPosition(player,combat.playerVelocityX,combat.playerVelocityZ,combat.playerTurnRate,lead);
        const tx=predicted.x-enemy.x, tz=predicted.z-enemy.z;
        const length=Math.max(.001,Math.hypot(tx,tz)); this.aimX=tx/length; this.aimZ=tz/length;
        if(length<=.001) this.aimZ=1;
        if(this.bossProfile?.kind==='crystal-crawler' && this.enraged) {
          const angle=Math.atan2(this.aimX,this.aimZ)+(this.pattern%2?.3:-.3);
          this.aimX=Math.sin(angle);this.aimZ=Math.cos(angle);
        }
        if (state === 'quake-windup') {
          const side = this.enraged && this.quakeCount++ % 2 ? 5.5 : 0;
          this.bossQuakeTarget.x = enemy.x + this.aimZ * side;
          this.bossQuakeTarget.z = enemy.z - this.aimX * side;
        }
        this.transition(state);
      } else if (this.bossState === 'spread-windup' && this.bossTime >= this.spreadWindupDuration) {
        const angle = Math.atan2(this.aimX,this.aimZ);
        // Keep the readable 1.4-radian cone and its side escape routes while
        // filling it more densely. No extra volleys overlap the next charge.
        const count = this.spreadCount;
        for (let i = 0; i < count; i++) {
          const shot = this.shots.find(s => !s.active); if (!shot) break;
          const offset = -.7 + i * 1.4 / (count - 1);
          const vx = Math.sin(angle+offset), vz = Math.cos(angle+offset), speed = this.shotSpeed;
          const sx = enemy.x, sz = enemy.z;
          Object.assign(shot,{style:this.bossProfile?.kind==='crystal-crawler'?'crystal':this.bossProfile?'thunder':'boss',active:true,x:sx,z:sz,previousX:sx,previousZ:sz,vx:vx*speed,vz:vz*speed,life:this.shotLife});
        }
        this.transition('spread');
      } else if (this.bossState === 'dash-windup' && this.bossTime >= this.dashWindupDuration) this.transition('dash');
      else if (this.bossState === 'quake-windup' && this.bossTime >= this.quakeWindupDuration) { this.bossQuakeDue=true; this.transition('quake'); }
      else if (this.bossState === 'dash' && this.bossTime >= this.dashDuration) this.transition('recover');
      else if (this.bossState === 'summon-windup' && this.bossTime >= .9 * tempo) {
        for (let i = 0; i < 3 && combat.enemies.filter(e => e.active).length < ENCOUNTER_RULES.bossSupportCap; i++) combat.spawnEncounter('normal', enemy, 2.8, 4.2);
        this.transition('summon');
      } else if ((this.bossState === 'spread' || this.bossState === 'summon' || this.bossState === 'quake') && this.bossTime >= .7) this.transition('recover');
      else if (this.bossState === 'recover' && this.bossTime >= (this.bossProfile ? 1.5 : this.enraged ? 1.15 : 1.4)) this.transition('approach');
      if (this.bossState === 'dash') { this.motion.x = this.aimX*this.dashSpeed; this.motion.z = this.aimZ*this.dashSpeed; }
      else if (this.bossState !== 'approach') this.motion.x = this.motion.z = 0;
      else { const speed = this.bossProfile ? this.bossProfile.speed / combat.enemySpeed(enemy) : ENCOUNTER_RULES.bossSpeed/.75; this.motion.x *= speed; this.motion.z *= speed; }
    } else if (enemy === this.elite) {
      if (this.elitePulsing) {
        this.eliteTime += dt; this.motion.x = this.motion.z = 0;
        if (this.eliteTime >= this.eliteWindupDuration) { this.pulseDue = true; this.elitePulsing = false; this.eliteCooldown = this.eliteQuakeTargets[0].active ? (this.releaseWindow ? 5.5 : CAMPAIGN_ELITE_QUAKE.cooldown) : ENCOUNTER_RULES.elitePulseCooldown; }
      } else {
        this.eliteCooldown = Math.max(0,this.eliteCooldown-dt);
        // A spore explosion has its own warning; avoid starting two major warnings together.
        const sporeWarning = combat.sporeExplosions.some(e => e.active && !e.detonated);
        if (!this.eliteCooldown && !sporeWarning && Math.hypot(player.x-enemy.x, player.z-enemy.z)<6) {
          const campaign = this.campaign && this.wave >= 4 && this.wave <= 5;
          if (campaign && !this.lockCampaignQuake(combat, player)) { this.eliteCooldown = .8; return this.motion; }
          if (!campaign) this.eliteWindupDuration = ENCOUNTER_RULES.eliteWindup;
          this.elitePulsing=true; this.eliteTime=0; this.motion.x=this.motion.z=0;
        }
      }
    }
    return this.motion;
  }
  advanceHazards(dt: number, combat: Combat, player: Point, previous: Point) {
    if (this.dying) { this.clearShots(); return; }
    if(this.bossQuakeDue && this.boss?.active) {
      Object.assign(this.bossQuake,{active:true,age:0,x:this.bossQuakeTarget.x,z:this.bossQuakeTarget.z});
      if(Math.hypot(player.x-this.bossQuake.x,player.z-this.bossQuake.z)<ENCOUNTER_RULES.elitePulseRadius+PLAYER_COLLISION_RADIUS
        && !combat.covered(this.bossQuake.x,this.bossQuake.z,player.x,player.z)) combat.hitPlayer(ENCOUNTER_RULES.elitePulseDamage);
    }
    if (this.pulseDue && this.elite?.active) {
      const locked = this.eliteQuakeTargets[0].active;
      const source = locked ? this.eliteQuakeTargets[0] : this.elite;
      Object.assign(this.eliteQuake, { active: true, age: 0, x: source.x, z: source.z });
      if (locked) for (let i = 0; i < this.eliteQuakeAftershocks.length; i++) {
        const target = this.eliteQuakeTargets[i+1];
        Object.assign(this.eliteQuakeAftershocks[i], { active: target.active, age: 0, x: target.x, z: target.z });
      }
      const hit = (point: Point) => Math.hypot(player.x-point.x,player.z-point.z) < ENCOUNTER_RULES.elitePulseRadius + PLAYER_COLLISION_RADIUS
        && !combat.covered(point.x,point.z,player.x,player.z);
      if (locked ? this.eliteQuakeTargets.some(target => target.active && hit(target)) : hit(source)) combat.hitPlayer(ENCOUNTER_RULES.elitePulseDamage);
      for (const target of this.eliteQuakeTargets) target.active = false;
    }
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
      name:this.bossName,kind:this.boss.kind,state:this.bossState,time:this.bossTime,enraged:this.enraged,aimX:this.aimX,aimZ:this.aimZ} : null,
      elite:this.elite?.active ? {id:this.elite.id,hp:this.elite.hp,pulsing:this.elitePulsing,time:this.eliteTime} : null,
      shots:this.shots.filter(s=>s.active).map(s=>({x:s.x,z:s.z,vx:s.vx,vz:s.vz})),limit:ENCOUNTER_RULES.hostileShots };
  }
}
