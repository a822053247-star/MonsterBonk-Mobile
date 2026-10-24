import type { RunFlow } from './run-flow';

/** One optional event on wave three of each six-wave cycle; never carries into wave four. */
export class EndlessAltarEvent {
  present=false;
  readonly position={x:0,z:0};
  private offeredCycle=0;
  private offeredWave=0;
  update(run:RunFlow,player:{x:number;z:number},enemies:readonly {active:boolean;x:number;z:number}[]){
    if(this.present&&(run.wave!==this.offeredWave||run.phase!=='fighting')){this.present=false;return 'remove';}
    if(!run.endless||run.phase!=='fighting'||run.waveInCycle!==3||run.waveElapsed<8||this.offeredCycle===run.cycle)return null;
    this.offeredCycle=run.cycle;this.offeredWave=run.wave;this.present=true;
    const spots=[{x:player.x,z:player.z-8},{x:player.x-8,z:player.z-3},{x:player.x+8,z:player.z-3}];
    Object.assign(this.position,spots.find(p=>!enemies.some(e=>e.active&&Math.hypot(e.x-p.x,e.z-p.z)<6.5))??spots[0]);
    return 'spawn';
  }
  consume(){this.present=false;}
  reset(){this.present=false;this.offeredCycle=0;this.offeredWave=0;}
}
