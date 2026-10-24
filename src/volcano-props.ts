import { VOLCANO_PROPS } from './volcano-art';

export { VOLCANO_PROPS, VOLCANO_ATLAS_SIZE } from './volcano-art';

/** Open temple axes and the central fire inlay share their obstacle exclusion space. */
export function volcanoPassage(x:number,z:number,padding=0) {
  return volcanoPassageDistance(x,z)<=padding;
}

export function volcanoPassageDistance(x:number,z:number) {
  const dx=x-Math.round(x/32)*32,dz=z-Math.round(z/32)*32;
  return Math.min(Math.abs(dx)-4.2,Math.abs(dz)-4.2,Math.max(Math.abs(dx),Math.abs(dz))-4.8);
}

/** Two feet for the paired pillars, otherwise one circular base; shared by all consumers. */
export function volcanoFootprints(variant:number,scale:number) {
  if(variant===11)return [{x:-.77*scale,z:0,radius:.53*scale},{x:.77*scale,z:0,radius:.53*scale}];
  return [{x:0,z:0,radius:VOLCANO_PROPS[variant].radius*scale}];
}

/** Transparent padding and tall flames do not shift the rock's actual ground contact. */
export function volcanoVisualExtent(variant:number,scale:number) {
  const prop=VOLCANO_PROPS[variant];
  const width=prop.height*(prop.rect[2]-prop.rect[0])/(prop.rect[3]-prop.rect[1])*scale;
  return Math.max(width*prop.anchor[0],width*(1-prop.anchor[0]),...volcanoFootprints(variant,scale).map(p=>Math.abs(p.x)+p.radius));
}
