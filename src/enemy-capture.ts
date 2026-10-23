import { ENEMY_TYPES, type Combat, type Enemy, type EnemyKind } from './combat';
export const CAPTURE_RATES: Record<EnemyKind, number> = {
  normal: .60, fast: .56, tank: .25,
  'draft-crystal-swarm': .58, 'draft-spore-bomber': .48, 'draft-treasure-runner': .20,
  'spore-floater': .50, 'crystal-crawler': .22, 'scarlet-flower': .44,
  'moondew-shell': .38, 'molten-fruit': .34, 'frost-fluff': .27,
  'nightshade-bat': .54, 'thunder-bell': .42, 'toxic-shroom': .46,
  'sand-shell': .24, 'mirror-wisp': .30, 'abyss-lantern': .36,
};

export const CAPTURE_RANGE = 2.5;
export const CAPTURE_HEALTH = .4;
export const SEAL_SECONDS = 1.6;
export const SEAL_WINDOW = [.58, .82] as const;
export interface CaptureAttempt { enemy: Enemy; id: number; success: boolean | null; time: number; resultTime: number; announced?:boolean }
export class EnemyCapture {
  pending?: CaptureAttempt;
  cooldown = 0;
  chances = 1;
  granted = 1;
  caught: Partial<Record<EnemyKind, number>> = {};
  message = '敌人生命降至40%后，靠近按 E · 点击收缩环封印';
  constructor(private readonly random = Math.random, private readonly onCaught: (kind: EnemyKind) => void = () => {}) {}
  eligible(combat: Combat, enemy: Enemy) {
    return enemy.active && enemy.hp > 0 && !enemy.rank && !enemy.captureLocked && enemy.spawnTime <= 0 && enemy.hp <= combat.enemyHealth(enemy)*CAPTURE_HEALTH;
  }
  nearest(combat: Combat, player: {x:number;z:number}) {
    let target: Enemy | undefined, distance = CAPTURE_RANGE;
    for (const enemy of combat.enemies) {
      const d = Math.hypot(enemy.x-player.x,enemy.z-player.z);
      if (d <= distance && this.eligible(combat,enemy) && !combat.covered(player.x,player.z,enemy.x,enemy.z)) { target=enemy; distance=d; }
    }
    return target;
  }
  attempt(combat: Combat, player: {x: number; z: number}) {
    if (this.pending || this.cooldown > 0 || combat.hp <= 0 || this.chances <= 0) return false;
    const enemy = this.nearest(combat,player);
    if (!enemy) { this.message = '先削弱敌人至40%生命，再靠近至2.5单位内按 E'; return false; }
    this.chances--; this.cooldown=3;
    enemy.captureLocked=true; enemy.captureScale=1;
    this.pending={enemy,id:enemy.id,success:null,time:0,resultTime:0};
    this.message=`${ENEMY_TYPES[enemy.kind].name} · 在金色区间点击封印 · 成功率${Math.round(CAPTURE_RATES[enemy.kind]*100)}%`;
    return true;
  }
  submit() {
    const p=this.pending;
    if (!p || p.success !== null) return false;
    const progress=p.time/SEAL_SECONDS;
    p.success=progress>=SEAL_WINDOW[0] && progress<=SEAL_WINDOW[1] && this.random()<CAPTURE_RATES[p.enemy.kind];
    return true;
  }
  /** Treasure drops grant at most two extra seals over the entire run. */
  grant() { if (this.granted>=3) return false; this.chances++;this.granted++;this.message='拾获封印符 · 捕捉机会 +1';return true; }
  cancel() {
    const p=this.pending;
    if (p && p.enemy.id===p.id) {p.enemy.captureLocked=false;p.enemy.captureScale=1;}
    this.pending=undefined;
  }
  step(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.cooldown=Math.max(0,this.cooldown-dt);
    const p=this.pending;
    if (!p) return;
    if (!p.enemy.active || p.enemy.id!==p.id || p.enemy.hp<=0 || p.enemy.rank) {this.cancel();this.message='目标已离场，捕捉取消';return;}
    if (p.success===null) {
      p.time+=dt;
      if (p.time>=SEAL_SECONDS) p.success=false;
      return;
    }
    p.resultTime+=dt;
    if (p.success) p.enemy.captureScale=Math.max(.02,1-p.resultTime/.65);
    if (p.resultTime<.7 || p.time+p.resultTime<1.4) return;
    const kind=p.enemy.kind, success=p.success;
    if (success) {p.enemy.active=false;this.caught[kind]=(this.caught[kind]??0)+1;}
    this.cancel();
    this.message=`${ENEMY_TYPES[kind].name} · ${success?'捕捉成功，已送入囚坊':'封印破裂，可继续战斗'}`;
    if (success) this.onCaught(kind);
  }
}
