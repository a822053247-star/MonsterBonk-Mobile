import type { Obstacle } from './world';
import { ENDLESS_REGIONS, ruinsRoad, type EndlessRegionId } from './endless-regions';
import { RUINS_PROPS } from './ruins-props';
import { SNOWFIELD_PROPS, snowfieldPassage } from './snowfield-props';
import { volcanoPassage, volcanoFootprints, volcanoVisualExtent } from './volcano-props';

export const TERRAIN_PIXELS_PER_UNIT = 16;
type TerrainContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const lerp = (a: number, b: number, t: number) => (1 - t) * a + t * b;

export const CHUNK_SIZE = 64;
const HALF = CHUNK_SIZE / 2;
const TERRAIN_STEP = .125;
const CONTOUR_STEP = .5;
const EDGE_DISPLACEMENT = .1325;
const GRASS = ENDLESS_REGIONS.meadow.palette.base;
const SAND = '#c5b354';
const SOIL = '#c49d49';
type Surface = 'grass' | 'soil' | 'sand' | 'stone' | 'path' | 'snow' | 'ice' | 'snowbank' | 'moss' | 'rubble' | 'basalt' | 'ash' | 'cooled-rock' | 'magma';
const SURFACE_COLORS: Record<Surface, string> = { magma:'#a43520',basalt:'#4c3032',ash:'#713c30','cooled-rock':'#75382c',moss:'#4f6b5b',rubble:'#60756a',snow:'#c5d9e0',ice:'#8eb6c9',snowbank:'#afcbd7',grass: GRASS, soil: SOIL, sand: SAND, stone: ENDLESS_REGIONS.ruins.palette.stone, path: ENDLESS_REGIONS.ruins.palette.path };

export interface MeadowProp { x: number; z: number; variant: number; scale: number }
export interface InfiniteChunkLayout {
  cx: number; cz: number; seed: string; obstacles: Obstacle[];
  trees: MeadowProp[]; rocks: MeadowProp[]; cacti: MeadowProp[];
  flowers: MeadowProp[]; grass: MeadowProp[];
  region?: EndlessRegionId; pillars?: MeadowProp[]; snowProps?: MeadowProp[]; volcanoProps?: MeadowProp[];
}

export function chunkCoordinates(x: number, z: number) {
  return { cx: Math.floor((x + HALF) / CHUNK_SIZE), cz: Math.floor((z + HALF) / CHUNK_SIZE) };
}

function seedHash(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function hashAt(seed: number, x: number, z: number) {
  let hash = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function noise(seed: number, x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const top = lerp(hashAt(seed, ix, iz), hashAt(seed, ix + 1, iz), u);
  const bottom = lerp(hashAt(seed, ix, iz + 1), hashAt(seed, ix + 1, iz + 1), u);
  return lerp(top, bottom, v);
}

function contourField(seed: number, x: number, z: number) {
  return filteredContour(seed, Math.round(x / CONTOUR_STEP), Math.round(z / CONTOUR_STEP));
}

function rawContour(seed: number, x: number, z: number) {
  return noise(seed, x / 26, z / 26) * .76 +
    noise(seed ^ 0x7f4a, x / 9, z / 9) * .19 + noise(seed ^ 0x12ef, x / 3, z / 3) * .05;
}

type ContourPoint = { x: number; z: number; raw: number; value?: number };
const contourCaches = new Map<number, Map<string, ContourPoint>>();
const MIN_SAND_VERTICES = 64;

/** Reject small connected sand islands in absolute world coordinates. Bounded
 * searches cross chunk borders, so loading order and texture seams cannot change
 * the verdict. Cache storage is capped independently of travel distance. */
function filteredContour(seed: number, x: number, z: number, raw?: number) {
  let cache = contourCaches.get(seed);
  if (!cache) {
    if (contourCaches.size >= 2) contourCaches.delete(contourCaches.keys().next().value!);
    cache = new Map(); contourCaches.set(seed, cache);
  }
  if (cache.size > 65_536) cache.clear();
  const pointAt = (px: number, pz: number, supplied?: number) => {
    const key = px + ':' + pz;
    let p = cache!.get(key);
    if (!p) {
      p = { x: px, z: pz, raw: supplied ?? rawContour(seed, px * CONTOUR_STEP, pz * CONTOUR_STEP) };
      if (p.raw <= .53) p.value = p.raw;
      cache!.set(key, p);
    }
    return p;
  };
  const first = pointAt(x, z, raw);
  if (first.value !== undefined) return first.value;
  const queue = [first], seen = new Set<ContourPoint>(queue);
  let large = false;
  search: for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const next = pointAt(p.x + dx, p.z + dz);
      if (next.raw <= .53 || seen.has(next)) continue;
      if (next.value !== undefined) { large = next.value > .53; break search; }
      seen.add(next); queue.push(next);
      if (queue.length >= MIN_SAND_VERTICES) { large = true; break search; }
    }
  }
  for (const p of queue) p.value = large ? p.raw : Math.min(.52, 1.06 - p.raw);
  return first.value!;
}

function edgeTerrain(seed: number, x: number, z: number, field: number, gradient: number): Surface {
  // Edge decoration may nibble an existing sand region, but cannot introduce a
  // new sand pixel into grass or resurrect a sand island removed by the filter.
  if (field <= .53) return 'grass';
  // Rounded larger lobes plus short, uneven grass tips and nicks, all in world
  // space. Apply detail only along the contour, never as noise over the whole map.
  // Scale by the local slope so diagonal and vertical edges receive the same
  // world-space detail as shallow edges, without oversized teeth on flat contours.
  if (Math.abs(field - .53) < gradient * EDGE_DISPLACEMENT) {
    // Keep the perturbation slope below the underlying contour slope. Stronger
    // high-frequency offsets can fold one boundary into detached sand flecks.
    field += Math.min(0, gradient * ((noise(seed ^ 0x5f37, x / .7, z / .7) - .5) * .24 +
      (noise(seed ^ 0x91ab, x / .19, z / .19) - .5) * .025));
  }
  if (field <= .53) return 'grass';
  // Exposed ochre soil sits between the grass lip and the open sand. Vary its
  // width independently of the grass silhouette so it breaks, widens and tucks
  // into little notches instead of becoming a uniform stroke around the region.
  if (field - .53 < gradient * .3) {
    const width = Math.max(0, -.04 + noise(seed ^ 0x3c6e, x / .9, z / .9) * .32);
    if (field - .53 < gradient * width) return 'soil';
  }
  return 'sand';
}

function terrainAt(seed: number, x: number, z: number): Surface {
  const wx = Math.floor(x / TERRAIN_STEP) * TERRAIN_STEP;
  const wz = Math.floor(z / TERRAIN_STEP) * TERRAIN_STEP;
  const left = Math.floor(wx / CONTOUR_STEP) * CONTOUR_STEP;
  const top = Math.floor(wz / CONTOUR_STEP) * CONTOUR_STEP;
  const u = (wx - left) / CONTOUR_STEP, v = (wz - top) / CONTOUR_STEP;
  const a = contourField(seed, left, top), b = contourField(seed, left + CONTOUR_STEP, top);
  const c = contourField(seed, left, top + CONTOUR_STEP), d = contourField(seed, left + CONTOUR_STEP, top + CONTOUR_STEP);
  const field = lerp(lerp(a, b, u), lerp(c, d, u), v);
  const dx = lerp(b - a, d - c, v) / CONTOUR_STEP;
  const dz = lerp(c - a, d - b, u) / CONTOUR_STEP;
  return edgeTerrain(seed, wx, wz, field, Math.sqrt(dx * dx + dz * dz));
}

function snowSurface(seed:number,x:number,z:number): Surface {
  // Broad organic basins, with a quiet snow shore; all three surfaces are walkable.
  const field=noise(seed^0x51ce,x/24,z/24)*.82+noise(seed^0x1ce,x/7,z/7)*.18;
  return field>.57?'ice':field>.52?'snowbank':'snow';
}

function volcanoSurface(seed:number,x:number,z:number): Surface {
  return hashAt(seed^0x1a7a,Math.floor(x/2),Math.floor(z/2))>.67?'cooled-rock':'basalt';
}

function ruinsSurface(seed:number,x:number,z:number): Surface {
  if(ruinsRoad(x,z))return 'path';
  const field=noise(seed^0x3a91,x/21,z/21)*.75+noise(seed^0x4b81,x/6,z/6)*.25;
  return field>.60?'moss':'stone';
}

type GroundRgb = readonly [number,number,number];
function feather(low:number,high:number,value:number) {
  const t=Math.max(0,Math.min(1,(value-low)/(high-low)));
  return t*t*(3-2*t);
}
/** Layer stone/inlay colors without allocating a fresh RGB array for every layer. */
function tintGround(color:[number,number,number],r:number,g:number,b:number,t:number) {
  color[0]=lerp(color[0],r,t);color[1]=lerp(color[1],g,t);color[2]=lerp(color[2],b,t);
}

function ruinsGroundColor(seed:number,x:number,z:number):GroundRgb {
  const row=Math.floor(z/2),column=Math.floor(x/2);
  const lx=x-column*2,lz=z-row*2;
  const tile=hashAt(seed^0x49a1,column,row);
  const grain=noise(seed^0x947a,x/.3,z/.3)-.5;
  const dx=x-Math.round(x/32)*32,dz=z-Math.round(z/32)*32;
  const square=Math.max(Math.abs(dx),Math.abs(dz));
  const court=1-feather(13.92,14.08,square);
  const shade=(tile-.5)*9+grain*3;
  const color:[number,number,number]=[69+shade,94+shade,104+shade];
  tintGround(color,85+shade,116+shade,126+shade,court*.65);
  // Square flagstones with narrow recessed seams and a fine lit upper edge.
  const edge=Math.min(lx,2-lx,lz,2-lz);
  tintGround(color,42,67,77,(1-feather(.025,.065,edge))*.72);
  const bevel=(1-feather(.015,.06,Math.abs(lz-.09)))*feather(.08,.16,lx)*feather(.08,.16,2-lx);
  tintGround(color,133,164,167,bevel*.28);
  const crack=Math.abs(lz-(.32+lx*.57+.045*Math.sin(lx*9+tile*4)));
  tintGround(color,44,70,77,(1-feather(.008,.04,crack))*(tile>.82 ? .38 : 0));
  const growth=noise(seed^0x3a91,x/.85,z/.85);
  const moss=feather(.6,.78,growth)*(1-feather(.07,.28,edge))*(.35+.4*(1-court));
  tintGround(color,99,125,63,moss*.65);
  // Inlaid square-court edging, with broad openings along both straight axes.
  const gate=1-feather(4.1,4.3,Math.min(Math.abs(dx),Math.abs(dz)));
  const border=(1-feather(.035,.10,Math.abs(square-13.3)))*(1-gate);
  tintGround(color,37,65,75,border*.6);
  const inlay=Math.abs(dx)+Math.abs(dz);
  tintGround(color,40,70,82,(1-feather(2.65,2.8,inlay))*.55);
  tintGround(color,134,165,171,(1-feather(.035,.105,Math.abs(inlay-2.5)))*.65);
  tintGround(color,52,91,105,(1-feather(.03,.085,Math.abs(inlay-2.15)))*.55);
  // A four-facet cyan crystal, baked into the floor rather than a fake interaction.
  const crystal=1-feather(.73,.83,inlay);
  const left=dx<0,upper=dz<0;
  tintGround(color,left?(upper?150:34):(upper?61:25),left?(upper?231:177):(upper?213:135),
    left?(upper?243:220):(upper?240:190),crystal*.92);
  const markerX=Math.abs(Math.abs(dx)-4),markerZ=Math.abs(Math.abs(dz)-4);
  const marker=markerX+markerZ;
  tintGround(color,56,140,162,(1-feather(.035,.09,Math.abs(marker-.34)))*.55);
  return color;
}

/** Most courts are dormant terrain; only rare ritual sites receive a landmark/inlay. */
function volcanoCourtTheme(seed:number,x:number,z:number) {
  const roll=hashAt(seed^0x71e1,x,z);
  return roll<.20?0:roll<.64?1:roll<.84?2:roll<.93?3:4;
}

function volcanoGroundColor(seed:number,x:number,z:number):GroundRgb {
  const row=Math.floor(z/2),column=Math.floor(x/2),lx=x-column*2,lz=z-row*2;
  const tile=hashAt(seed^0x1a7a,column,row);
  const grain=noise(seed^0x114b,x/.28,z/.28)-.5;
  const mottling=noise(seed^0x79b1,x/.85,z/.85)-.5;
  const detail=(tile-.5)*8+grain*5+mottling*6;
  const color:[number,number,number]=[83+detail,59+detail*.8,61+detail*.8];
  const edge=Math.min(lx,2-lx,lz,2-lz);
  // Ordinary joints are quiet stone recesses, not a glowing wire grid.
  tintGround(color,46,33,36,(1-feather(.025,.065,edge))*.43);
  const bevel=(1-feather(.018,.065,Math.abs(lz-.10)))*feather(.1,.2,lx)*feather(.1,.2,2-lx);
  tintGround(color,128,100,91,bevel*.14);
  // Rare, short branching fractures with varied orientation replace repeated diagonals.
  if(tile>.94) {
    const turn=hashAt(seed^0x783a,column,row);
    const u=turn<.5?lx:lz,v=turn<.5?lz:lx;
    const flipped=turn<.25||turn>.75?2-v:v;
    const path=.3+turn*.4+u*.36+Math.max(0,u-.65)*.4-Math.max(0,u-1.25)*.65;
    const branchMask=feather(.65,.8,u)*(1-feather(1.15,1.35,u));
    const branch=branchMask>.01?Math.abs(flipped-(1.2-(u-.85)*.9)):10;
    const fracture=Math.min(Math.abs(flipped-path),branch);
    const ends=feather(.12,.3,u)*(1-feather(1.65,1.9,u));
    tintGround(color,43,28,30,(1-feather(.018,.06,fracture))*ends*.75);
    tintGround(color,229,83,20,(1-feather(.009,.03,fracture))*ends*.62);
  }
  const dx=x-Math.round(x/32)*32,dz=z-Math.round(z/32)*32;
  if(volcanoCourtTheme(seed,Math.round(x/32),Math.round(z/32))!==4)return color;
  const diamond=Math.abs(dx)+Math.abs(dz);
  tintGround(color,51,35,36,(1-feather(1.65,1.8,diamond))*.45);
  tintGround(color,142,106,91,(1-feather(.025,.075,Math.abs(diamond-1.55)))*.4);
  const crystal=1-feather(.48,.56,diamond),left=dx<0,upper=dz<0;
  tintGround(color,left?(upper?255:244):(upper?255:197),
    left?(upper?221:112):(upper?161:58),left?(upper?87:21):(upper?34:15),crystal*.98);
  return color;
}

/** Continuous world-color lattice, interpolated into EVERY texel. No 4px color blocks.
 * Yield both lattice/raster rows for the existing 3ms fallback slicing contract.
 * putImageData ignores canvas transforms: mirror rows explicitly for the worker bitmap.
 */
function* smoothRegionGround(ctx:TerrainContext,left:number,top:number,sample:(x:number,z:number)=>GroundRgb,direct=false):Generator<void> {
  const size=CHUNK_SIZE*TERRAIN_PIXELS_PER_UNIT;
  if(direct) {
    const pixels=ctx.createImageData(size,size),flip=ctx.getTransform().d<0;
    for(let y=0;y<size;y++) {
      yield;
      let target=(flip?size-1-y:y)*size*4;
      for(let x=0;x<size;x++,target+=4) {
        if(x%64===0)yield;
        const rgb=sample(left+(x+.5)/TERRAIN_PIXELS_PER_UNIT,top+(y+.5)/TERRAIN_PIXELS_PER_UNIT);
        pixels.data[target]=rgb[0];pixels.data[target+1]=rgb[1];pixels.data[target+2]=rgb[2];pixels.data[target+3]=255;
      }
    }
    ctx.putImageData(pixels,0,0);return;
  }
  const stride=4,vertices=size/stride+1;
  const colors=new Float32Array(vertices*vertices*3);
  for(let z=0;z<vertices;z++) {
    yield;
    for(let x=0;x<vertices;x++) {
      const rgb=sample(left+x*stride/TERRAIN_PIXELS_PER_UNIT,top+z*stride/TERRAIN_PIXELS_PER_UNIT);
      const index=(z*vertices+x)*3;
      colors[index]=rgb[0];colors[index+1]=rgb[1];colors[index+2]=rgb[2];
    }
  }
  const pixels=ctx.createImageData(size,size),flip=ctx.getTransform().d<0;
  for(let y=0;y<size;y++) {
    yield;
    const gy=(y+.5)/stride,iy=Math.floor(gy),v=gy-iy;
    let target=(flip?size-1-y:y)*size*4;
    for(let x=0;x<size;x++,target+=4) {
      const gx=(x+.5)/stride,ix=Math.floor(gx),u=gx-ix;
      const i=(iy*vertices+ix)*3,j=i+vertices*3;
      for(let channel=0;channel<3;channel++)pixels.data[target+channel]=lerp(
        lerp(colors[i+channel],colors[i+3+channel],u),
        lerp(colors[j+channel],colors[j+3+channel],u),v);
      pixels.data[target+3]=255;
    }
  }
  ctx.putImageData(pixels,0,0);
}

export function sampleInfiniteTerrain(seed: string, x: number, z: number, region: EndlessRegionId = 'meadow') {
  if (region === 'volcano') return volcanoSurface(seedHash(seed),x,z);
  if (region === 'snowfield') return snowSurface(seedHash(seed),x,z);
  if (region === 'ruins') return ruinsSurface(seedHash(seed),x,z);
  return terrainAt(seedHash(seed), x, z) === 'grass' ? 'grass' : 'sand';
}

export function sampleInfiniteSurface(seed: string, x: number, z: number, region: EndlessRegionId = 'meadow'): Surface {
  if (region === 'volcano') return volcanoSurface(seedHash(seed),x,z);
  if (region === 'snowfield') return snowSurface(seedHash(seed),x,z);
  if (region === 'ruins') return ruinsSurface(seedHash(seed),x,z);
  return terrainAt(seedHash(seed), x, z);
}

/** Sparse, seeded scenery. Only trunks and rocks participate in collision. */
function* layoutSteps(seed: string, cx: number, cz: number, region: EndlessRegionId = 'meadow'): Generator<void, InfiniteChunkLayout> {
  const layout: InfiniteChunkLayout = { cx, cz, seed, region, obstacles: [], trees: [], rocks: [], cacti: [], flowers: [], grass: [], pillars: [] };
  const hash = seedHash(seed), left = cx * CHUNK_SIZE - HALF, top = cz * CHUNK_SIZE - HALF;
  if(region==='volcano') {
    layout.volcanoProps=[];
    const dormant=[1,2,6,13,15,20,21],accents=[7,13,15,18],landmarks=[5,8,12];
    // One environmental vignette per court, rather than filling every quadrant.
    // Ordinary cooled rock dominates; molten pools and ritual landmarks are rarer.
    for(let z=8;z<CHUNK_SIZE;z+=16)for(let x=8;x<CHUNK_SIZE;x+=16) {
      yield;
      const nx=Math.round((left+x)/32)*32,nz=Math.round((top+z)/32)*32;
      const sx=Math.sign(left+x-nx),sz=Math.sign(top+z-nz),gx=nx/32,gz=nz/32;
      const theme=volcanoCourtTheme(hash,gx,gz);
      const quadrant=(sx<0?1:0)+(sz<0?2:0);
      if(theme===0||quadrant!==Math.floor(hashAt(hash^0x71a0,gx,gz)*4))continue;
      for(let side=0;side<2;side++) {
        yield;
        if(side===1&&hashAt(hash^0x71a1,gx,gz)>.35)continue;
        const wx=nx+sx*(side===0?9.4:12.1);
        const wz=nz+sz*(side===0?9.4:8.0);
        const roll=hashAt(hash^(0x71d0+side),gx,gz);
        const variant=side===1?accents[Math.floor(roll*accents.length)]
          :theme===1?dormant[Math.floor(roll*dormant.length)]:theme===2?9
          :theme===3?(roll<.7?4:10):landmarks[Math.floor(roll*landmarks.length)];
        const scale=side===1 ? .60 : theme===4 ? 1 : .9;
        const extent=volcanoVisualExtent(variant,scale)+.2;
        const px=wx-left,pz=wz-top;
        if(Math.hypot(wx,wz)<8+extent||volcanoPassage(wx,wz,extent))continue;
        if(px<extent||pz<extent||px+extent>CHUNK_SIZE||pz+extent>CHUNK_SIZE)continue;
        const feet=volcanoFootprints(variant,scale).map(f=>({x:wx+f.x,z:wz+f.z,radius:f.radius}));
        if(feet.some(f=>layout.obstacles.some(o=>Math.hypot(o.x-f.x,o.z-f.z)<o.radius+f.radius+.45)))continue;
        layout.volcanoProps.push({x:px,z:pz,variant,scale});
        layout.obstacles.push(...feet);
      }
    }
    return layout;
  }
  if(region==='snowfield') {
    layout.snowProps=[];
    // World-aligned candidates; open crosses connect across positive/negative chunks.
    for(let z=8;z<CHUNK_SIZE;z+=16) {
      yield;
      for(let x=8;x<CHUNK_SIZE;x+=16) {
        const gx=(left+x)/16,gz=(top+z)/16;
        const px=x+(hashAt(hash^0x501,gx,gz)-.5)*3;
        const pz=z+(hashAt(hash^0x502,gx,gz)-.5)*3;
        const wx=left+px,wz=top+pz;
        if(hashAt(hash^0x503,gx,gz)<.15)continue;
        const variant=Math.floor(hashAt(hash^0x504,gx,gz)*SNOWFIELD_PROPS.length);
        const definition=SNOWFIELD_PROPS[variant];
        const scale=.85+hashAt(hash^0x505,gx,gz)*.25;
        const radius=definition.radius*scale;
        if(Math.hypot(wx,wz)<8+radius||snowfieldPassage(wx,wz,radius))continue;
        layout.snowProps.push({x:px,z:pz,variant,scale});
        // Every supplied sprite, including the frozen pool and low slabs, is solid.
        layout.obstacles.push({x:wx,z:wz,radius});
      }
    }
    return layout;
  }
  if (region === 'ruins') {
    // Four mirrored quadrants around each 32-unit court. Absolute ownership
    // keeps mirrored props stable across chunk borders without creating a wall.
    for (let z=8;z<CHUNK_SIZE;z+=16) for(let x=8;x<CHUNK_SIZE;x+=16) {
      yield;
      const nx=Math.round((left+x)/32)*32,nz=Math.round((top+z)/32)*32;
      const sx=Math.sign(left+x-nx),sz=Math.sign(top+z-nz),gx=nx/32,gz=nz/32;
      for(let side=0;side<3;side++) {
        yield;
        if(side===2&&hashAt(hash^0x52d3,gx,gz)<.45)continue;
        const wx=nx+sx*(side===0?7.2:side===1?12.2:9.8);
        const wz=nz+sz*(side===0?7.2:side===1?12.2:6.1);
        const px=wx-left,pz=wz-top;
        const roll=hashAt(hash^(0x9137+side),gx,gz);
        const variant=side===0?4:side===1?(roll<.5?0:roll<.82?7:2):[1,3,5,6][Math.floor(roll*4)];
        const prop=RUINS_PROPS[variant],scale=side===0?1:side===1?1.08:.72;
        const [leftPixel,topPixel,rightPixel,bottomPixel]=prop.rect;
        const padding=Math.max(prop.radius,prop.height*(rightPixel-leftPixel)/(bottomPixel-topPixel)/2)*scale+.2;
        if(Math.hypot(wx,wz)<8+padding||ruinsRoad(wx,wz,padding))continue;
        if(px<padding||pz<padding||px+padding>CHUNK_SIZE||pz+padding>CHUNK_SIZE)continue;
        if(layout.obstacles.some(o=>Math.hypot(o.x-wx,o.z-wz)<o.radius+padding+.6))continue;
        layout.pillars!.push({x:px,z:pz,variant,scale});
        if(prop.radius>0)layout.obstacles.push({x:wx,z:wz,radius:prop.radius*scale});
      }
    }
    return layout;
  }
  for (let z = 4; z < CHUNK_SIZE; z += 8) {
    yield;
    for (let x = 4; x < CHUNK_SIZE; x += 8) {
      yield;
      const gx = Math.floor((left + x) / 8), gz = Math.floor((top + z) / 8);
      const px = x + (hashAt(hash ^ 0xab31, gx, gz) - .5) * 4;
      const pz = z + (hashAt(hash ^ 0xcd53, gx, gz) - .5) * 4;
      const wx = left + px, wz = top + pz;
      if (Math.hypot(wx, wz) < 8) continue;
      const chance = hashAt(hash ^ 0xfe72, gx, gz);
      const surface = sampleInfiniteSurface(seed, wx, wz);
      const prop = { x: px, z: pz, variant: Math.floor(hashAt(hash ^ 0x71da, gx, gz) * 3),
        scale: .85 + hashAt(hash ^ 0x8ace, gx, gz) * .3 };
      if (surface === 'grass' && chance < .43) {
        layout.trees.push(prop);
        layout.obstacles.push({ x: wx, z: wz, radius: .65 * prop.scale });
      } else if (surface === 'sand' && chance < .43) {
        layout.cacti.push(prop);
        layout.obstacles.push({ x: wx, z: wz, radius: .5 * prop.scale });
      } else if (chance > .76) {
        layout.rocks.push(prop);
        layout.obstacles.push({ x: wx, z: wz, radius: .42 * prop.scale });
      }
    }
  }
  for (let z = 2; z < CHUNK_SIZE; z += 4) {
    yield;
    for (let x = 2; x < CHUNK_SIZE; x += 4) {
      yield;
      const gx = Math.floor((left + x) / 4), gz = Math.floor((top + z) / 4);
      const px = x + (hashAt(hash ^ 0x4391, gx, gz) - .5) * 2;
      const pz = z + (hashAt(hash ^ 0xb461, gx, gz) - .5) * 2;
      const wx = left + px, wz = top + pz;
      if (sampleInfiniteSurface(seed, wx, wz) !== 'grass' ||
        layout.obstacles.some(o => Math.hypot(o.x - wx, o.z - wz) < o.radius + .65)) continue;
      const chance = hashAt(hash ^ 0xd692, gx, gz);
      const prop = { x: px, z: pz, variant: 0, scale: .8 + hashAt(hash ^ 0x2459, gx, gz) * .4 };
      if (chance >= .12 && chance < .28) layout.flowers.push(prop);
      else if (chance >= .28 && chance < .48) layout.grass.push(prop);
    }
  }
  return layout;
}

export function generateInfiniteChunk(seed: string, cx: number, cz: number, region: EndlessRegionId = 'meadow'): InfiniteChunkLayout {
  const steps = layoutSteps(seed, cx, cz, region);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

/** Cache the small noise lattice once per bake rather than hashing per texel. */
function chunkNoise(seed: number, left: number, top: number, scale: number) {
  const minX = Math.floor(left / scale), minZ = Math.floor(top / scale);
  const width = Math.floor((left + CHUNK_SIZE) / scale) - minX + 2;
  const height = Math.floor((top + CHUNK_SIZE) / scale) - minZ + 2;
  const lattice = new Float64Array(width * height);
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++)
    lattice[z * width + x] = hashAt(seed, minX + x, minZ + z);
  return (x: number, z: number) => {
    const sx = x / scale, sz = z / scale, ix = Math.floor(sx), iz = Math.floor(sz);
    const fx = sx - ix, fz = sz - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const index = (iz - minZ) * width + ix - minX;
    return lerp(
      lerp(lattice[index], lattice[index + 1], u),
      lerp(lattice[index + width], lattice[index + width + 1], u), v);
  };
}

export function* terrainSteps(seedText: string, cx: number, cz: number, ctx: TerrainContext, region: EndlessRegionId = 'meadow'): Generator<void, InfiniteChunkLayout> {
  const layout = yield* layoutSteps(seedText, cx, cz, region);
  const size = CHUNK_SIZE * TERRAIN_PIXELS_PER_UNIT;
  ctx.imageSmoothingEnabled = false;
  const seed = seedHash(layout.seed);
  const left = layout.cx * CHUNK_SIZE - HALF, top = layout.cz * CHUNK_SIZE - HALF;
  if(region==='volcano') {
    yield* smoothRegionGround(ctx,left,top,(x,z)=>volcanoGroundColor(seed,x,z),true);
    return layout;
  }
  if(region==='snowfield') {
    ctx.fillStyle=SURFACE_COLORS.snow;ctx.fillRect(0,0,size,size);
    const step=4; // Same crisp pixel scale as the meadow, without a tiled-grid look.
    for(let z=0;z<size;z+=step) {
      yield;
      let start=0,current:Surface='snow';
      for(let x=0;x<=size;x+=step) {
        const surface=x<size?snowSurface(seed,left+x/16,top+z/16):null;
        if(surface!==current) {
          if(current!=='snow') {
            ctx.fillStyle=SURFACE_COLORS[current];ctx.fillRect(start,z,x-start,step);
          }
          start=x;if(surface)current=surface;
        }
      }
    }
    // Sparse wind-carved snow strokes and pale ice facets, never collision props.
    for(let z=0;z<64;z+=2) {
      yield;
      for(let x=0;x<64;x+=2) {
        const wx=left+x,wz=top+z,r=hashAt(seed^0x70aa,wx,wz);
        if(r>.30)continue;
        const px=x*16+5,pz=z*16+10;
        const surface=snowSurface(seed,wx+.7,wz+.7);
        if(surface!==snowSurface(seed,wx+1.6,wz+.9)||surface==='snowbank')continue;
        ctx.fillStyle=surface==='ice'?(r<.1?'#b3d5df':'#9fc5d4'):(r<.1?'#deebed':'#bbd1db');
        ctx.fillRect(px,pz,10+Math.floor(r*20),2);
        ctx.fillRect(px+4,pz-2,6,2);
        if(r<.08)ctx.fillRect(px+11,pz+3,5,2);
      }
    }
    return layout;
  }
  if (region === 'ruins') {
    yield* smoothRegionGround(ctx,left,top,(x,z)=>ruinsGroundColor(seed,x,z),true);
    return layout;
  }
  const broad = chunkNoise(seed, left, top, 26);
  const medium = chunkNoise(seed ^ 0x7f4a, left, top, 9);
  const fine = chunkNoise(seed ^ 0x12ef, left, top, 3);
  // Share contour vertices between finer raster samples. This keeps the finer,
  // irregular silhouette inexpensive when recycling nine distant chunks at once.
  const vertices = CHUNK_SIZE / CONTOUR_STEP + 1;
  const contour = new Float64Array(vertices * vertices);
  for (let z = 0; z < vertices; z++) {
    yield;
    for (let x = 0; x < vertices; x++) {
      if (x % 8 === 0) yield;
      const wx = left + x * CONTOUR_STEP, wz = top + z * CONTOUR_STEP;
      const raw = broad(wx, wz) * .76 + medium(wx, wz) * .19 + fine(wx, wz) * .05;
      contour[z * vertices + x] = filteredContour(seed, Math.round(wx / CONTOUR_STEP), Math.round(wz / CONTOUR_STEP), raw);
    }
  }
  const step = TERRAIN_STEP * TERRAIN_PIXELS_PER_UNIT;
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, size, size);
  // Paint contiguous color runs, including the independently shaped soil fringe.
  for (let z = 0; z < size; z += step) {
    yield;
    let start = 0;
    let current: Surface = 'grass';
    const gz = z / (CONTOUR_STEP * TERRAIN_PIXELS_PER_UNIT), iz = Math.floor(gz), v = gz - iz;
    for (let x = 0; x <= size; x += step) {
      const wx = left + x / TERRAIN_PIXELS_PER_UNIT, wz = top + z / TERRAIN_PIXELS_PER_UNIT;
      let surface: Surface | null = null;
      if (x < size) {
        const gx = x / (CONTOUR_STEP * TERRAIN_PIXELS_PER_UNIT), ix = Math.floor(gx), u = gx - ix;
        const i = iz * vertices + ix;
        const field = lerp(
          lerp(contour[i], contour[i + 1], u),
          lerp(contour[i + vertices], contour[i + vertices + 1], u), v);
        const dx = lerp(contour[i + 1] - contour[i],
          contour[i + vertices + 1] - contour[i + vertices], v) / CONTOUR_STEP;
        const dz = lerp(contour[i + vertices] - contour[i],
          contour[i + vertices + 1] - contour[i + 1], u) / CONTOUR_STEP;
        surface = edgeTerrain(seed, wx, wz, field, Math.sqrt(dx * dx + dz * dz));
      }
      if (surface !== current) {
        if (current !== 'grass' && x > start) {
          ctx.fillStyle = SURFACE_COLORS[current];
          ctx.fillRect(start, z, x - start, step);
        }
        start = x;
        if (surface) current = surface;
      }
    }
  }
  // Sparse flat ground marks, never sprites or collision objects. Each motif stays
  // inside its world-aligned 2x2 cell so neighboring chunks need no blending.
  const pixel = 2;
  for (let z = 0; z < CHUNK_SIZE; z += 2) {
    yield;
    for (let x = 0; x < CHUNK_SIZE; x += 2) {
      yield;
      const wx = left + x, wz = top + z;
      const random = hashAt(seed ^ 0x6a09, wx / 2, wz / 2);
      if (random > .58) continue;
      const px = x * TERRAIN_PIXELS_PER_UNIT + 4 + Math.floor(hashAt(seed, wx, wz) * 9) * pixel;
      const pz = z * TERRAIN_PIXELS_PER_UNIT + 4 + Math.floor(hashAt(seed ^ 0xbb67, wx, wz) * 9) * pixel;
      const kind = terrainAt(seed, left + px / TERRAIN_PIXELS_PER_UNIT, top + pz / TERRAIN_PIXELS_PER_UNIT);
      if (kind === 'soil') continue;
      if (terrainAt(seed, left + (px + 8) / TERRAIN_PIXELS_PER_UNIT, top + (pz + 8) / TERRAIN_PIXELS_PER_UNIT) !== kind) continue;
      if (kind === 'grass') {
        // Separate, tapered blades rather than a joined U-shaped ground stamp.
        // Small shifts in count, height and lean avoid a repeated pictogram.
        const variation = hashAt(seed ^ 0x83e1, wx, wz);
        const blades = 1 + Math.floor(variation * 3);
        ctx.fillStyle = random < .2 ? '#409846' : '#328e40';
        for (let blade = 0; blade < blades; blade++) {
          const height = 2 + Math.floor(hashAt(seed ^ (blade + 0x392a), wx, wz) * 3);
          const bx = px + blade * 3;
          const by = pz + 5 - (blade % 2);
          const lean = variation < .5 ? -1 : 1;
          ctx.fillRect(bx, by - height + 1, 1, height);
          ctx.fillRect(bx + lean, by - height, 1, 2);
        }
      } else {
        ctx.fillStyle = random < .16 ? '#b8a04c' : '#c29f4d';
        ctx.fillRect(px, pz + pixel, pixel * 4, pixel);
        ctx.fillRect(px + pixel, pz, pixel * 2, pixel * 3);
      }
    }
  }
  return layout;
}

