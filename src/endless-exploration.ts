import type { Combat } from './combat';
import type { RunFlow } from './run-flow';
import type { Obstacle } from './world';
import { directorStage, releaseLeadIn } from './wave-director';
import { ENDLESS_REGIONS } from './endless-regions';

export type ExplorationKind = 'sealed-chest' | 'lost-workshop';
export type ExplorationState = 'available' | 'active' | 'completed' | 'abandoned' | 'expired' | 'failed';
export const EXPLORATION_RULES = { duration: 20, radius: 3, leaveRadius: 7, arrivals: 6, arrivalInterval: 3 } as const;
export function explorationPlacementCandidates(kind:ExplorationKind,player:{x:number;z:number},
  view?:{x:number;z:number;halfWidth:number;halfDepth:number}){
  const area=view??{...player,halfWidth:18,halfDepth:12};
  // Shared by automatic events and the local feature-test entry points.
  const margin=kind==='lost-workshop'?8:6;
  return [{x:player.x,z:area.z-area.halfDepth-margin},
    {x:area.x-area.halfWidth-margin,z:player.z},{x:area.x+area.halfWidth+margin,z:player.z},
    {x:player.x,z:area.z+area.halfDepth+margin}];
}
export interface ExplorationEvent {
  kind: ExplorationKind; state: ExplorationState; wave: number; x: number; z: number;
  elapsed: number; arrivals: number; arrivalClock: number;
}

/** One optional exploration per cycle, separate from the existing third-wave altar. */
export class EndlessExploration {
  event?: ExplorationEvent;
  private offeredCycle = 0;
  get present() { return !!this.event && (this.event.state === 'available' || this.event.state === 'active'); }
  reset() { this.event = undefined; this.offeredCycle = 0; }
  canOffer(run:RunFlow) { return run.endless&&run.phase==='fighting'&&!run.isBossWave&&!this.present&&this.offeredCycle!==run.cycle; }
  offer(kind: ExplorationKind, run: RunFlow, point: {x:number;z:number}) {
    if (!this.canOffer(run)) return false;
    this.offeredCycle = run.cycle;
    this.event = { kind, state: 'available', wave: run.wave, ...point, elapsed: 0, arrivals: 0, arrivalClock: 2 };
    return true;
  }
  nearby(player: {x:number;z:number}) {
    return !!this.event && this.present && Math.hypot(player.x-this.event.x, player.z-this.event.z) <= EXPLORATION_RULES.radius;
  }
  start(player: {x:number;z:number}) {
    if (!this.event || this.event.state !== 'available' || !this.nearby(player)) return false;
    this.event.state = 'active'; return true;
  }
  completeWorkshop() {
    if (this.event?.kind !== 'lost-workshop' || this.event.state !== 'active') return false;
    this.event.state = 'completed'; return true;
  }
  cancelWorkshop() { if (this.event?.kind === 'lost-workshop' && this.event.state === 'active') this.event.state = 'available'; }
  abandon() { if (this.present) this.event!.state = 'abandoned'; }

  step(dt: number, run: RunFlow, combat: Combat, player: {x:number;z:number}, obstacles: readonly Obstacle[], allowOffer = true,
    view?:{x:number;z:number;halfWidth:number;halfDepth:number}) {
    const event = this.event;
    if (this.present && event) {
      if (combat.hp <= 0) { event.state = 'failed'; return; }
      if (run.wave !== event.wave || run.phase !== 'fighting' || run.remaining <= 0) { event.state = 'expired'; return; }
      if (event.state === 'active' && Math.hypot(player.x-event.x,player.z-event.z) > EXPLORATION_RULES.leaveRadius) {
        event.state = 'abandoned'; return;
      }
      if (event.state !== 'active' || event.kind !== 'sealed-chest') return;
      event.elapsed = Math.min(EXPLORATION_RULES.duration, event.elapsed + dt);
      if (event.elapsed >= EXPLORATION_RULES.duration && !combat.progression.awaitingChoice) {
        event.state = 'completed';
        const reward = combat.grantTreasure(1, event, false, ENDLESS_REGIONS[run.region].rewardBias);
        reward.coins = 0;
        return;
      }
      event.arrivalClock = Math.max(0, event.arrivalClock - dt);
      if (event.arrivalClock > 0 || event.arrivals >= EXPLORATION_RULES.arrivals) return;
      event.arrivalClock = EXPLORATION_RULES.arrivalInterval;
      // No backlog, extra enemy class, or dangerous arrival inside a release window.
      if (directorStage(run.waveInCycle,run.waveElapsed,true,run.cycleIndex).beat === 'release'
        || releaseLeadIn(run.waveInCycle,run.waveElapsed,true,run.cycleIndex)
        || combat.enemies.filter(e=>e.active).length >= run.definition.cap) return;
      const kind = combat.endlessRoster?.allows('normal',combat.enemies) ? 'normal' : 'draft-crystal-swarm';
      combat.spawnSwarm(player,1,run.definition.cap,kind,{fastCap:0,tankCap:0,sporeAllowed:false,
        crystalAllowed:kind==='draft-crystal-swarm',crystalCap:Math.floor(run.definition.cap*.4),kinds:[kind]});
      event.arrivals++;
      return;
    }
    if (!allowOffer || !this.canOffer(run)) return;
    const kind: ExplorationKind = run.cycle % 2 ? 'sealed-chest' : 'lost-workshop';
    if(!ENDLESS_REGIONS[run.region].events.includes(kind))return;
    const wave = kind === 'sealed-chest' ? 2 : 4;
    if (run.waveInCycle !== wave || run.waveElapsed < 8 || run.waveElapsed > 18) return;
    // The chest and its 2.5m scenery clearing must start beyond the visible field.
    const candidates=explorationPlacementCandidates(kind,player,view);
    const point = candidates.find(p=>
      obstacles.every(o=>Math.hypot(o.x-p.x,o.z-p.z)>o.radius+2)
      && combat.enemies.every(e=>!e.active||Math.hypot(e.x-p.x,e.z-p.z)>3));
    if (point) this.offer(kind,run,point);
  }
}
