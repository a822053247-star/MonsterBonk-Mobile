import { ENEMY_TYPES, type Combat, type Enemy, type EnemyKind } from './combat';
export const CAPTURE_RATES: Record<EnemyKind, number> = {
  normal: .60, fast: .56, tank: .25,
  'draft-crystal-swarm': .58, 'draft-spore-bomber': .48, 'draft-treasure-runner': .20,
  'spore-floater': .50, 'crystal-crawler': .22, 'scarlet-flower': .44,
  'moondew-shell': .38, 'molten-fruit': .34, 'frost-fluff': .27,
  'nightshade-bat': .54, 'thunder-bell': .42, 'toxic-shroom': .46,
  'sand-shell': .24, 'mirror-wisp': .30, 'abyss-lantern': .36,
};

export const CAPTURE_RANGE = 15;
export { CAPTURE_HEALTH } from './capture-rules';
export const SEAL_SECONDS = 1.6;
export const SEAL_WINDOW = [.58, .82] as const;
export const SEAL_EXCELLENT_WINDOW = [.66, .74] as const;
export const SEAL_EXCELLENT_BONUS = .2;
export const SEAL_RESULT_SECONDS = 1;
export const SEAL_RETRIES = 5;
export const SEAL_RETRY_SECONDS = 3;
export type SealGrade = 'miss' | 'good' | 'excellent';
export function sealGrade(progress: number): SealGrade {
  if (progress >= SEAL_EXCELLENT_WINDOW[0] && progress <= SEAL_EXCELLENT_WINDOW[1]) return 'excellent';
  return progress >= SEAL_WINDOW[0] && progress <= SEAL_WINDOW[1] ? 'good' : 'miss';
}
export function sealChance(kind: EnemyKind, grade: SealGrade) {
  return grade === 'miss' ? 0 : Math.min(1, CAPTURE_RATES[kind] + (grade === 'excellent' ? SEAL_EXCELLENT_BONUS : 0));
}
export interface CaptureAttempt { enemy: Enemy; id: number; success: boolean | null; grade?: SealGrade; retriesLeft: number; retrying: boolean; time: number; resultTime: number; announced?:boolean }
export class EnemyCapture {
  pending?: CaptureAttempt;
  cooldown = 0;
  readonly chances = Infinity;
  caught: Partial<Record<EnemyKind, number>> = {};
  message = '寻找带捕捉标记的幻兽 · 按 E 封印';
  constructor(private readonly random = Math.random, private readonly onCaught: (kind: EnemyKind) => void = () => {}) {}
  eligible(combat: Combat, enemy: Enemy) {
    return !enemy.captureLocked && combat.isCaptureReady(enemy);
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
    if (this.pending || this.cooldown > 0 || combat.hp <= 0) return false;
    const enemy = this.nearest(combat,player);
    if (!enemy) { this.message = `寻找带捕捉标记的幻兽，在${CAPTURE_RANGE}单位内按 E`; return false; }
    this.cooldown=3;
    enemy.captureLocked=true; enemy.captureScale=1;
    this.pending={enemy,id:enemy.id,success:null,retriesLeft:SEAL_RETRIES,retrying:false,time:0,resultTime:0};
    this.message=`${ENEMY_TYPES[enemy.kind].name} · 青色合格，金色优秀 · 优秀成功率额外 +20 个百分点`;
    return true;
  }
  submit() {
    const p=this.pending;
    if (!p || p.success !== null) return false;
    const progress=p.time/SEAL_SECONDS;
    this.judge(p,sealGrade(progress));
    return true;
  }
  private judge(p: CaptureAttempt, grade: SealGrade) {
    p.grade=grade;
    p.success=grade!=='miss' && this.random()<sealChance(p.enemy.kind,grade);
    p.retrying=grade==='miss' && p.retriesLeft>0;
  }
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
      if (p.time>=SEAL_SECONDS) this.judge(p,'miss');
      return;
    }
    p.resultTime+=dt;
    if(p.retrying){
      if(p.resultTime>=SEAL_RETRY_SECONDS){
        p.retriesLeft--;p.retrying=false;p.grade=undefined;p.success=null;
        p.time=0;p.resultTime=0;p.announced=false;
      }
      return;
    }
    p.enemy.captureScale=Math.max(.02,1-p.resultTime/.65);
    if (p.resultTime<SEAL_RESULT_SECONDS || p.time+p.resultTime<1.4) return;
    const kind=p.enemy.kind, success=p.success;
    p.enemy.active=false;
    if (success) this.caught[kind]=(this.caught[kind]??0)+1;
    this.cancel();
    this.message=`${ENEMY_TYPES[kind].name} · ${success?'已捕捉到幻兽囚坊':'捕捉失败，目标已消失'}`;
    if (success) this.onCaught(kind);
  }
}
