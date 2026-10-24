import { VIEW_25D } from './camera-25d';

export type AltarPoint={x:number;z:number};
export const ALTAR_LAYOUT={width:8.4,height:8.4/Math.sin(VIEW_25D.pitch),artHeight:.24,depthCompensation:.65} as const;
const smoothstep=(x:number,a:number,b:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export const altarReliefHeight=(v:number)=>.12+smoothstep(v,.2,.55)*.28+Math.max(0,v-.5)*3.6;

/** Project the painted surface onto the ground plane used by creature feet. UV V grows upwards. */
export function altarGroundPoint(u:number,v:number):AltarPoint{
  const h=altarReliefHeight(v);
  return {x:(u-.5)*ALTAR_LAYOUT.width,z:(.5-v)*ALTAR_LAYOUT.height+h*ALTAR_LAYOUT.depthCompensation-(h+ALTAR_LAYOUT.artHeight)/Math.tan(VIEW_25D.pitch)};
}

// Trace the inner stone railing and the three front steps, excluding columns, plants and the bowl.
const floorUV=[ [.5,.525],[.72,.51],[.845,.455],[.89,.38],[.84,.31],[.73,.265],[.68,.25],
  [.32,.25],[.27,.265],[.16,.31],[.11,.38],[.155,.455],[.28,.51] ];
const outlineUV=[...floorUV.slice(0,7),[.73,.18],[.775,.1],[.74,.06],[.64,.042],[.36,.042],
  [.26,.06],[.225,.1],[.27,.18],...floorUV.slice(7)];
export const ALTAR_FLOOR=floorUV.map(([u,v])=>altarGroundPoint(u,v));
export const ALTAR_OUTLINE=outlineUV.map(([u,v])=>altarGroundPoint(u,v));
export const ALTAR_EDGES=ALTAR_OUTLINE.map((a,i)=>({a,b:ALTAR_OUTLINE[(i+1)%ALTAR_OUTLINE.length],gate:i>=9&&i<=11}));

export function insideAltarPolygon(p:AltarPoint,polygon:readonly AltarPoint[]){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside;
}
export function crossesAltarGate(from:AltarPoint,to:AltarPoint){
  const dx=to.x-from.x,dz=to.z-from.z;
  return ALTAR_EDGES.some(({a,b,gate})=>{
    if(!gate)return false;
    const ex=b.x-a.x,ez=b.z-a.z,denom=dx*ez-dz*ex;if(Math.abs(denom)<1e-9)return false;
    const ax=a.x-from.x,az=a.z-from.z,t=(ax*ez-az*ex)/denom,u=(ax*dz-az*dx)/denom;
    return t>=0&&t<=1&&u>=0&&u<=1;
  });
}

/** Small swept substeps and circle/segment contacts preserve sliding while preventing dash tunnelling. */
export function resolveAltarWalls(to:AltarPoint,from:AltarPoint,radius:number){
  const dx=to.x-from.x,dz=to.z-from.z,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/(radius*.3)));
  const p={...from};
  for(let step=0;step<steps;step++){
    const previous={...p};p.x+=dx/steps;p.z+=dz/steps;
    for(let pass=0;pass<3;pass++)for(const {a,b,gate} of ALTAR_EDGES){
      if(gate)continue;
      const ex=b.x-a.x,ez=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*ex+(p.z-a.z)*ez)/(ex*ex+ez*ez)));
      const x=a.x+ex*t,z=a.z+ez*t,nx=p.x-x,nz=p.z-z,d=Math.hypot(nx,nz);
      if(d>=radius)continue;
      const oldX=previous.x-x,oldZ=previous.z-z,oldD=Math.hypot(oldX,oldZ);
      const ux=d>1e-6?nx/d:oldD>1e-6?oldX/oldD:ez/Math.hypot(ex,ez);
      const uz=d>1e-6?nz/d:oldD>1e-6?oldZ/oldD:-ex/Math.hypot(ex,ez);
      p.x=x+ux*(radius+.001);p.z=z+uz*(radius+.001);
    }
    // An outside correction must never turn a side contact into a valid entrance.
    if(insideAltarPolygon(previous,ALTAR_OUTLINE)!==insideAltarPolygon(p,ALTAR_OUTLINE)&&!crossesAltarGate(previous,p))Object.assign(p,previous);
  }
  Object.assign(to,p);
}
