/** Presentation only: capture readiness never changes collision or combat stats. */
export const CAPTURE_READY_SCALE = 1.3;

/** One gentle shimmer every 2.4 seconds, offset between creatures. */
export function captureShimmer(time:number,id:number,reducedMotion:boolean) {
  if(reducedMotion)return .16;
  const wave=(1+Math.sin(time*Math.PI*2/2.4+id*2.39996))/2;
  return .08+.3*wave**3;
}
