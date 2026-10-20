/** Formal-mode grass blob: short committed rolls, a rooted warning, then one thorn pulse. */
export const GRASS_BLOB = {
  roll: .6, rest: .2, rollSpeed: 1.25, turnPerRoll: .8,
  range: 2, radius: 1.4, windup: .75, active: .2, recovery: 1,
  cooldown: 1.35, nearbyWarningCap: 2, interruptKnockback: 2, interruptedRecovery: .6,
} as const;

export interface GrassRollState { grassCycle?: number; grassRollX?: number; grassRollZ?: number; grassRollDistance?: number }
export const GRASS_ROLL_VISUAL = { circumference: .9375, rootSettle: .18, maxTilt: .14, crowdThreshold: 12, minimumMotion: .25 } as const;
export function grassCrowdMotionScale(count:number) {
  return Math.max(GRASS_ROLL_VISUAL.minimumMotion,Math.min(1,GRASS_ROLL_VISUAL.crowdThreshold/Math.max(1,count)));
}

/** Small upright tilts replace full rotations; dense crowds attenuate motion further. */
export function grassBlobRoll(enemy: GrassRollState & {intent:string;intentTime:number}, motionScale=1) {
  const direction = (enemy.grassRollX ?? 1) < -.05 ? 1 : -1;
  const progress=Math.max(0,Math.min(1,(enemy.grassRollDistance ?? 0)/GRASS_ROLL_VISUAL.circumference));
  const angle=Math.sin(progress*Math.PI)*GRASS_ROLL_VISUAL.maxTilt*Math.max(0,Math.min(1,motionScale));
  let settle = 0;
  if (enemy.intent === 'windup') settle = Math.min(1,(GRASS_BLOB.windup-enemy.intentTime)/GRASS_ROLL_VISUAL.rootSettle);
  else if (enemy.intent !== 'chase') return 0;
  else if ((enemy.grassCycle ?? 0) >= GRASS_BLOB.roll) settle = ((enemy.grassCycle ?? 0)-GRASS_BLOB.roll)/GRASS_BLOB.rest;
  settle = Math.max(0,Math.min(1,settle));
  if(settle>=1) return 0;
  return direction*angle*(1-settle*settle*(3-2*settle));
}

/** Integrates moving/resting portions even across a large timestep; heading is committed per roll. */
export function stepGrassRoll(state: GrassRollState, dt: number, dx: number, dz: number, speed: number, out: {x:number;z:number}) {
  let remaining = dt, phase = state.grassCycle ?? 0;
  out.x = out.z = 0;
  const cycle = GRASS_BLOB.roll+GRASS_BLOB.rest;
  while (remaining > 1e-8) {
    if (phase < 1e-8) {
      state.grassRollDistance = 0;
      const desired = Math.atan2(dx,dz);
      const previous = state.grassRollX === undefined ? desired : Math.atan2(state.grassRollX,state.grassRollZ!);
      const delta = Math.atan2(Math.sin(desired-previous),Math.cos(desired-previous));
      const angle = previous+Math.max(-GRASS_BLOB.turnPerRoll,Math.min(GRASS_BLOB.turnPerRoll,delta));
      state.grassRollX = Math.sin(angle); state.grassRollZ = Math.cos(angle);
    }
    const rolling = phase < GRASS_BLOB.roll-1e-8;
    const slice = Math.min(remaining,(rolling ? GRASS_BLOB.roll : cycle)-phase);
    if (rolling) {
      out.x += (state.grassRollX ?? dx)*speed*GRASS_BLOB.rollSpeed*slice;
      out.z += (state.grassRollZ ?? dz)*speed*GRASS_BLOB.rollSpeed*slice;
    }
    remaining -= slice; phase += slice;
    if (phase >= cycle-1e-8) phase = 0;
    else if (Math.abs(phase-GRASS_BLOB.roll)<1e-8) phase = GRASS_BLOB.roll;
  }
  state.grassCycle = phase;
  out.x /= dt; out.z /= dt;
}

/** Restrained body compression, with rooted attack anticipation kept readable. */
export function grassBlobPose(enemy: GrassRollState & {intent:string;intentTime:number}, pose:{bob:number;lean:number;squash:number}) {
  if (enemy.intent === 'windup') {
    const p = 1-enemy.intentTime/GRASS_BLOB.windup;
    pose.bob=0; pose.lean=Math.sin(p*24)*.018*p; pose.squash=-.08-.17*p;
  } else if (enemy.intent === 'pounce') {
    pose.bob=.08; pose.lean=0; pose.squash=.12;
  } else if (enemy.intent === 'recover') {
    pose.bob=0; pose.lean=0; pose.squash=-.1*Math.min(1,enemy.intentTime/GRASS_BLOB.recovery);
  } else {
    const phase=enemy.grassCycle ?? 0;
    const moving=phase<GRASS_BLOB.roll;
    pose.bob=0; pose.lean=0;
    pose.squash=moving ? -.025 : -.015;
  }
}
