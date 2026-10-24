import * as THREE from 'three';
import { crop, pixelTexture } from './world-sample';
import type { Obstacle } from './world';
import type { SpawnViewport } from './spawn-layout';
import { CHUNK_SIZE, chunkCoordinates, type InfiniteChunkLayout } from './infinite-terrain';
import { TerrainBaker, releaseTerrainImage, type PreparedTerrain } from './infinite-terrain-baker';
import { ENDLESS_REGIONS, type EndlessRegionId } from './endless-regions';
import { RUINS_ATLAS_SIZE, RUINS_PROPS } from './ruins-props';
import { SNOWFIELD_ATLAS_SIZE, SNOWFIELD_PROPS } from './snowfield-props';
import { VOLCANO_ATLAS_SIZE, VOLCANO_PROPS, volcanoFootprints } from './volcano-props';
export { CHUNK_SIZE, chunkCoordinates, generateInfiniteChunk, sampleInfiniteTerrain, sampleInfiniteSurface } from './infinite-terrain';
export type { MeadowProp, InfiniteChunkLayout } from './infinite-terrain';
const HALF = CHUNK_SIZE / 2;
const ACTIVE_RADIUS = 1;

type Chunk = { group: THREE.Group; groundTexture: THREE.Texture; material: THREE.MeshBasicMaterial;
  instances: THREE.InstancedMesh[]; layout: InfiniteChunkLayout;
  occluders: { type:number; index:number; x:number; z:number; width:number; height:number; faded:boolean }[] };

/** Tiny native pixel sprites complement the challenge-map tree and rock atlas. */
function meadowDetail(kind: 'flower' | 'grass') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const rect = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
  };
  if (kind === 'flower') {
    rect('#35723c', 7, 7, 2, 8); rect('#56863a', 4, 10, 3, 2); rect('#78a744', 9, 11, 3, 2);
    rect('#d3a15d', 5, 3, 6, 6); rect('#f5dfa1', 6, 2, 4, 2);
    rect('#f5dfa1', 4, 4, 3, 3); rect('#f5dfa1', 9, 4, 3, 3);
    rect('#f5dfa1', 6, 7, 4, 2); rect('#e4b348', 7, 4, 2, 3);
  } else {
    // A loose fan of curved blades, with thin tips and no rectangular base.
    rect('#307b3b', 7, 11, 2, 4);
    rect('#449343', 6, 9, 1, 4); rect('#449343', 5, 7, 1, 3);
    rect('#579e49', 4, 6, 1, 2); rect('#579e49', 3, 5, 1, 2);
    rect('#529d47', 7, 6, 1, 7); rect('#63a84d', 6, 3, 1, 4);
    rect('#76b255', 6, 2, 1, 2);
    rect('#468b40', 9, 10, 1, 4); rect('#539b46', 10, 8, 1, 3);
    rect('#69a74d', 11, 7, 1, 2); rect('#69a74d', 12, 6, 1, 2);
  }
  return { texture: pixelTexture(canvas), aspect: 1 };
}

/** Code-native pixel art shares one texture across all ruin chunks. */
function ruinPillarArt() {
  const canvas=document.createElement('canvas');canvas.width=32;canvas.height=48;
  const ctx=canvas.getContext('2d')!;
  const rect=(color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  rect('#344d52',6,41,21,5);rect('#839c98',5,39,22,4);
  rect('#577271',10,19,13,21);rect('#a6bbb0',10,19,4,20);rect('#73918b',14,19,6,20);
  rect('#415e61',20,20,3,20);rect('#abc6bd',8,17,17,4);
  rect('#4a6870',11,29,9,2);rect('#4a6870',12,35,3,4);
  rect('#438f9a',11,7,11,10);rect('#77d1d3',13,3,7,15);rect('#b6f1e4',14,1,4,14);
  rect('#77d1d3',11,9,11,5);rect('#d6fff0',14,4,2,6);
  return {texture:pixelTexture(canvas),aspect:32/48};
}

/** Resource-failure placeholder only; production uses the user's unmodified pixels. */
function volcanoFallbackArt() {
  const canvas=document.createElement('canvas');canvas.width=32;canvas.height=40;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#302c32';ctx.fillRect(3,23,26,14);ctx.fillRect(7,10,19,23);
  ctx.fillStyle='#645654';ctx.fillRect(8,9,15,7);ctx.fillRect(4,25,9,8);
  ctx.fillStyle='#bb4825';ctx.fillRect(18,16,2,16);ctx.fillRect(13,29,7,2);
  ctx.fillStyle='#f59b3a';ctx.fillRect(18,21,1,8);
  return {texture:pixelTexture(canvas),aspect:32/40};
}

/** Nine GPU slots; CPU terrain is queued separately from frame rendering. */
export function createInfiniteWorld(initialSeed: string, onChange = () => {}, onError: (error: unknown) => void = () => {},
  prepareTexture: (texture: THREE.Texture) => void = () => {}) {
  const group = new THREE.Group();
  group.name = '无尽草场'; group.visible = false;
  const obstacles: Obstacle[] = [];
  let eventClearing:{x:number;z:number;radius:number}|null=null;
  const outsideClearing=(x:number,z:number,padding=0)=>!eventClearing||Math.hypot(x-eventClearing.x,z-eventClearing.z)>eventClearing.radius+padding;
  const refreshObstacles=()=>{
    const visible=Array.from(chunks.values()).flatMap(chunk=>{
      if(chunk.layout.region!=='volcano')return chunk.layout.obstacles.filter(o=>outsideClearing(o.x,o.z,2));
      // A paired pillar is one visible prop: clear or restore BOTH feet with its root.
      return (chunk.layout.volcanoProps??[]).flatMap(prop=>{
        const x=prop.x+chunk.group.position.x,z=prop.z+chunk.group.position.z;
        if(!outsideClearing(x,z,2))return [];
        return volcanoFootprints(prop.variant,prop.scale).map(foot=>({x:x+foot.x,z:z+foot.z,radius:foot.radius}));
      });
    });
    obstacles.splice(0,obstacles.length,...visible);
  };
  const chunks = new Map<string, Chunk>(), recycled: Chunk[] = [];
  const prepared = new Map<string, PreparedTerrain>();
  const baker = new TerrainBaker();
  const groundGeometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
  const spriteGeometry = new THREE.PlaneGeometry(1, 1);
  spriteGeometry.translate(0, .5, 0);
  const dummy = new THREE.Object3D();
  let art: { texture: THREE.Texture; aspect: number }[] = [];
  let spriteMaterials: THREE.MeshBasicMaterial[] = [];
  let artReady = false, enabled = false;
  let ruinsAtlas = false;
  let snowAtlas = false;
  let volcanoAtlas = false;
  let seed = initialSeed, disposed = false, centerX = 0, centerZ = 0;
  let region: EndlessRegionId = 'meadow';
  let lastX = NaN, lastZ = NaN, directionX = 0, directionZ = 0, plan = '';
  let epoch = 0, frame = 0, inFlight: string | undefined;
  type Coordinate = { cx: number; cz: number };
  let required = new Map<string, Coordinate>(), ahead = new Map<string, Coordinate>(), focus = new Map<string, Coordinate>();
  const keyOf = (cx: number, cz: number) => cx + ':' + cz;
  const isWanted = (key: string) => required.has(key) || ahead.has(key);
  const complete = () => required.size > 0 && [...required.keys()].every(key => chunks.has(key));
  const playable = () => focus.size > 0 && [...focus.keys()].every(key => chunks.has(key));
  const clearPrepared = () => {
    for (const result of prepared.values()) releaseTerrainImage(result.image);
    prepared.clear();
  };
  const cancel = () => {
    epoch++; cancelAnimationFrame(frame); frame = 0; baker.cancel(); inFlight = undefined;
    clearPrepared(); required.clear(); ahead.clear(); focus.clear(); plan = '';
    lastX = lastZ = NaN; directionX = directionZ = 0;
  };
  const release = () => {
    for (const chunk of chunks.values()) { group.remove(chunk.group); recycled.push(chunk); }
    chunks.clear(); obstacles.length = 0;
  };
  const place = (chunk: Chunk) => {
    const { cx, cz } = chunk.layout;
    chunk.group.name = 'chunk:' + cx + ':' + cz;
    chunk.group.position.set(cx * CHUNK_SIZE - HALF, 0, cz * CHUNK_SIZE - HALF);
    const layout = chunk.layout;
    const lists = [0, 1, 2].map(variant => layout.trees.filter(p => p.variant === variant));
    lists.push(layout.rocks, layout.flowers, layout.grass, layout.cacti, layout.pillars ?? [], layout.snowProps ?? [], layout.volcanoProps ?? []);
    const heights = [4.2, 4.2, 4.6, .7, 1.05, .9, 2.5, 2.8, 2.6, 2.6];
    chunk.occluders.length=0;
    for (let type = 0; type < lists.length; type++) {
      const props=lists[type].filter(p=>outsideClearing(p.x+chunk.group.position.x,p.z+chunk.group.position.z,2));
      const mesh = chunk.instances[type]; mesh.count = props.length;
      props.forEach((prop, index) => {
        const volcanoDefinition=type===9&&volcanoAtlas?VOLCANO_PROPS[prop.variant]:undefined;
        const definition=type===7?RUINS_PROPS[prop.variant]:type===8?SNOWFIELD_PROPS[prop.variant]:volcanoDefinition;
        const hasAtlas=type===7?ruinsAtlas:type===8?snowAtlas:volcanoAtlas;
        const atlasSize=type===7?RUINS_ATLAS_SIZE:type===8?SNOWFIELD_ATLAS_SIZE:VOLCANO_ATLAS_SIZE;
        const height = (definition&&hasAtlas?definition.height:heights[type]) * prop.scale;
        let aspect=art[type].aspect;
        if(type>=7){
          const uv=mesh.geometry.getAttribute('ruinUvRect') as THREE.InstancedBufferAttribute;
          const alpha=mesh.geometry.getAttribute('ruinOpacity') as THREE.InstancedBufferAttribute;
          if(definition&&hasAtlas){
            const [left,top,right,bottom]=definition.rect;
            aspect=(right-left)/(bottom-top);
            uv.setXYZW(index,left/atlasSize.width,1-bottom/atlasSize.height,
              right/atlasSize.width,1-top/atlasSize.height);
          }else uv.setXYZW(index,0,0,1,1);
          alpha.setX(index,1);
          chunk.occluders.push({type,index,x:prop.x+chunk.group.position.x,z:prop.z+chunk.group.position.z,
            width:height*aspect,height,faded:false});
        }
        const anchor=volcanoDefinition?.anchor??[.5,1];
        const footOffset=(1-anchor[1])*height*Math.SQRT1_2;
        dummy.position.set(prop.x-(anchor[0]-.5)*height*aspect, .025-footOffset, prop.z+footOffset);
        dummy.rotation.set(-Math.PI / 4, 0, 0);
        dummy.scale.set(height * aspect, height, 1); dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      if(type>=7){
        mesh.geometry.getAttribute('ruinUvRect').needsUpdate=true;
        mesh.geometry.getAttribute('ruinOpacity').needsUpdate=true;
      }
    }
    return chunk;
  };
  const configureTexture = (texture: THREE.Texture, image: PreparedTerrain['image'], terrainRegion:EndlessRegionId) => {
    texture.image = image; texture.flipY = !('close' in image);
    texture.colorSpace = THREE.SRGBColorSpace;
    const smooth=terrainRegion==='ruins'||terrainRegion==='volcano';
    texture.magFilter = smooth?THREE.LinearFilter:THREE.NearestFilter;
    texture.minFilter = smooth?THREE.LinearFilter:THREE.NearestFilter;
    texture.anisotropy=smooth?4:1;
    texture.generateMipmaps = false; texture.needsUpdate = true;
  };
  const install = (result: PreparedTerrain) => {
    // Retain the previous neighborhood until a replacement is actually ready.
    // Recycle only an off-neighborhood slot, never remove a whole strip up front.
    if (!recycled.length && chunks.size >= Math.max(9, required.size)) {
      for (const [key, old] of chunks) if (!required.has(key)) {
        chunks.delete(key); group.remove(old.group); recycled.push(old); break;
      }
    }
    let chunk = recycled.pop();
    if (chunk) {
      releaseTerrainImage(chunk.groundTexture.image as PreparedTerrain['image']);
      chunk.layout = result.layout; configureTexture(chunk.groundTexture, result.image,result.layout.region??'meadow');
    } else {
      const tile = new THREE.Group(), groundTexture = new THREE.Texture();
      configureTexture(groundTexture, result.image,result.layout.region??'meadow');
      const material = new THREE.MeshBasicMaterial({ map: groundTexture, toneMapped: false, fog: false });
      const ground = new THREE.Mesh(groundGeometry, material);
      ground.name = '像素分块地面'; ground.rotation.x = -Math.PI / 2;
      ground.position.set(HALF, 0, HALF); tile.add(ground);
      const instances = spriteMaterials.map((mat, type) => {
        const geometry=type>=7?spriteGeometry.clone():spriteGeometry;
        if(type>=7){
          geometry.setAttribute('ruinUvRect',new THREE.InstancedBufferAttribute(new Float32Array(64*4),4));
          geometry.setAttribute('ruinOpacity',new THREE.InstancedBufferAttribute(new Float32Array(64),1).setUsage(THREE.DynamicDrawUsage));
        }
        const mesh = new THREE.InstancedMesh(geometry, mat, type < 4 || type >= 7 ? 64 : 256);
        mesh.name = ['像素树-阔叶', '像素树-圆冠', '像素树-松树', '小石头', '小花', '小草', '仙人掌', '遗迹随机布景', '雪原实体布景', '火山实体布景'][type];
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tile.add(mesh); return mesh;
      });
      chunk = { group: tile, groundTexture, material, layout: result.layout, instances, occluders:[] };
    }
    place(chunk); chunks.set(keyOf(result.layout.cx, result.layout.cz), chunk); group.add(chunk.group);
    // Upload one terrain texture now instead of deferring all nine to the first draw.
    prepareTexture(chunk.groundTexture);
    refreshObstacles();
    onChange();
  };
  const nearest = (entries: Map<string, Coordinate>, available: (key: string) => boolean) =>
    [...entries].filter(([key]) => available(key)).sort((a, b) =>
      Math.hypot(a[1].cx - centerX, a[1].cz - centerZ) - Math.hypot(b[1].cx - centerX, b[1].cz - centerZ))[0];
  const schedule = () => {
    if (!frame && enabled && !disposed) frame = requestAnimationFrame(pump);
  };
  const pump = () => {
    frame = 0;
    if (!enabled || disposed) return;
    // Only this callback installs chunks, at most once per animation frame.
    const installable = (key: string) => prepared.has(key) && !chunks.has(key);
    const finished = artReady ? nearest(focus, installable) ?? nearest(required, installable) : undefined;
    if (finished) {
      const result = prepared.get(finished[0])!; prepared.delete(finished[0]);
      try { install(result); } catch (error) {
        if (!chunks.has(finished[0])) releaseTerrainImage(result.image);
        onError(error); return;
      }
    }
    if (!inFlight) {
      const missing = (key: string) => !chunks.has(key) && !prepared.has(key);
      const next = nearest(focus, missing) ?? nearest(required, missing) ?? nearest(ahead, missing);
      if (next) {
        const [key, { cx, cz }] = next, version = epoch;
        inFlight = key;
        void baker.bake(seed, cx, cz, region).then(result => {
          if (disposed || version !== epoch || !enabled) { releaseTerrainImage(result.image); return; }
          inFlight = undefined;
          if (isWanted(key)) prepared.set(key, result); else releaseTerrainImage(result.image);
          schedule();
        }).catch(error => {
          if (disposed || version !== epoch || !enabled) return;
          inFlight = undefined; onError(error);
        });
      }
    }
    if (artReady && [...required.keys()].some(key => prepared.has(key))) schedule();
  };
  const neighborhood = (cx: number, cz: number) => {
    const result = new Map<string, Coordinate>();
    for (let dz = -ACTIVE_RADIUS; dz <= ACTIVE_RADIUS; dz++) for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++)
      result.set(keyOf(cx + dx, cz + dz), { cx: cx + dx, cz: cz + dz });
    return result;
  };
  const update = (x: number, z: number, view?: SpawnViewport) => {
    if (disposed || !enabled) return false;
    // Camera looks from +Z at 45 degrees. Fade foreground silhouettes before
    // the streaming-plan early return, including movement within one chunk.
    for(const chunk of chunks.values()){
      chunk.occluders.forEach(prop=>{
        const alpha=chunk.instances[prop.type].geometry.getAttribute('ruinOpacity');
        const dz=prop.z-z;
        const faded=Math.abs(x-prop.x)<prop.width/2+.65&&dz>-.65&&dz<prop.height*Math.SQRT2+.9;
        if(faded!==prop.faded){prop.faded=faded;alpha.setX(prop.index,faded?.22:1);alpha.needsUpdate=true;}
      });
    }
    const current = chunkCoordinates(x, z);
    if (Number.isFinite(lastX) && Math.hypot(x - lastX, z - lastZ) > .001) {
      directionX = Math.sign(x - lastX); directionZ = Math.sign(z - lastZ);
    }
    lastX = x; lastZ = z;
    // Start the next strip about 24 world units before crossing a chunk edge.
    const predicted = chunkCoordinates(x + directionX * 24, z + directionZ * 24);
    // Only the visible/spawnable area blocks entry. The surrounding ring is background work.
    const first = chunkCoordinates(Math.min(x - 29, view ? view.x - view.halfWidth - 5 : x - 29),
      Math.min(z - 29, view ? view.z - view.halfDepth - 5 : z - 29));
    const last = chunkCoordinates(Math.max(x + 29, view ? view.x + view.halfWidth + 5 : x + 29),
      Math.max(z + 29, view ? view.z + view.halfDepth + 5 : z + 29));
    const nextPlan = [current.cx, current.cz, predicted.cx, predicted.cz, first.cx, first.cz, last.cx, last.cz].join(':');
    if (plan === nextPlan) return false;
    const neighborhoodChanged = !required.size || centerX !== current.cx || centerZ !== current.cz;
    plan = nextPlan; centerX = current.cx; centerZ = current.cz;
    required = neighborhood(centerX, centerZ); ahead = neighborhood(predicted.cx, predicted.cz);
    focus = new Map();
    for (let cz = first.cz; cz <= last.cz; cz++) for (let cx = first.cx; cx <= last.cx; cx++) {
      const key = keyOf(cx, cz), coordinate = { cx, cz };
      focus.set(key, coordinate); required.set(key, coordinate);
    }
    for (const key of required.keys()) ahead.delete(key);
    // Keep the worker's current job on direction changes; repeated termination starves generation.
    for (const [key, result] of prepared) if (!isWanted(key)) { releaseTerrainImage(result.image); prepared.delete(key); }
    schedule(); return neighborhoodChanged || !playable();
  };
  // Scenery resources may load eagerly, but terrain jobs require explicit enablement.
  const ruinImage = new Promise<HTMLImageElement|null>(resolve=>{
    new THREE.ImageLoader().load(import.meta.env.BASE_URL+'assets/scenery/ruins-props-atlas.png',resolve,undefined,()=>resolve(null));
  });
  const snowImage = new Promise<HTMLImageElement|null>(resolve=>{
    new THREE.ImageLoader().load(import.meta.env.BASE_URL+'assets/scenery/snowfield-props-atlas.png',resolve,undefined,()=>resolve(null));
  });
  const volcanoImage = new Promise<HTMLImageElement|null>(resolve=>{
    new THREE.ImageLoader().load(import.meta.env.BASE_URL+'assets/scenery/volcano/volcano-atlas.png',resolve,undefined,()=>resolve(null));
  });
  const ready = Promise.all([new Promise<HTMLImageElement>((resolve, reject) => {
    new THREE.ImageLoader().load(import.meta.env.BASE_URL + 'assets/world/Tileset/Decorations/trees.png', resolve, undefined, reject);
  }),ruinImage,snowImage,volcanoImage]).then(([image,ruins,snow,volcano]) => {
    if (disposed) return;
    art = [[0, 0], [32, 32], [32, 64], [64, 0]].map(([x, y]) => crop(image, x, y, 32));
    art.push(meadowDetail('flower'), meadowDetail('grass')); art.push(crop(image, 32, 0, 32));
    ruinsAtlas=!!ruins;
    if(ruins){
      const texture=new THREE.Texture(ruins);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.magFilter=texture.minFilter=THREE.NearestFilter;
      texture.generateMipmaps=false;texture.needsUpdate=true;
      art.push({texture,aspect:1});
    }else art.push(ruinPillarArt());
    snowAtlas=!!snow;
    if(snow){
      const texture=new THREE.Texture(snow);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.magFilter=texture.minFilter=THREE.NearestFilter;
      texture.generateMipmaps=false;texture.needsUpdate=true;
      art.push({texture,aspect:1});
    }else art.push(ruinPillarArt());
    volcanoAtlas=!!volcano;
    if(volcano){
      const texture=new THREE.Texture(volcano);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.magFilter=texture.minFilter=THREE.NearestFilter;
      texture.generateMipmaps=false;texture.needsUpdate=true;
      art.push({texture,aspect:1});
    }else art.push(volcanoFallbackArt());
    spriteMaterials = art.map(a => new THREE.MeshBasicMaterial({
      map: a.texture, transparent: true, alphaTest: .1, toneMapped: false, fog: false,
    }));
    for(const ruinMaterial of spriteMaterials.slice(7)) {
    ruinMaterial.depthWrite=false;
    // One atlas and draw call per chunk, with independent UVs and fade values.
    ruinMaterial.onBeforeCompile=shader=>{
      shader.vertexShader='attribute vec4 ruinUvRect;\nattribute float ruinOpacity;\nvarying float vRuinOpacity;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',
        '#include <uv_vertex>\nvMapUv=mix(ruinUvRect.xy,ruinUvRect.zw,vMapUv);\nvRuinOpacity=ruinOpacity;');
      shader.fragmentShader='varying float vRuinOpacity;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',
        '#include <alphatest_fragment>\ndiffuseColor.a *= vRuinOpacity;');
    };
    }
    artReady = true; schedule();
  });
  return {
    group, obstacles, ready,
    get seed() { return seed; },
    get region() { return region; },
    get sceneryFallback() { return artReady&&region==='volcano'&&!volcanoAtlas; },
    get chunkCount() { return chunks.size; },
    get complete() { return complete(); },
    get playable() { return playable(); },
    setEventClearing(area:{x:number;z:number;radius:number}|null){
      if(disposed||(!area&&!eventClearing))return;
      eventClearing=area?{...area}:null;
      for(const chunk of chunks.values())place(chunk);
      refreshObstacles();onChange();
    },
    setEnabled(next: boolean) {
      if (disposed || enabled === next) return;
      enabled = next;
      if (!enabled) cancel();
    },
    setSeed(nextSeed: string) {
      if (disposed || seed === nextSeed) return;
      cancel(); seed = nextSeed; release();
    },
    setRegion(next: EndlessRegionId, nextSeed = seed) {
      if (disposed || region === next && seed === nextSeed) return;
      cancel();region=next;seed=nextSeed;release();
      group.name=next==='meadow'?'无尽草场':ENDLESS_REGIONS[next].title;
      onChange();
    },
    update,
    dispose() {
      if (disposed) return;
      disposed = true; cancel(); release();
      for (const chunk of recycled) {
        chunk.instances.forEach((mesh,type) => {mesh.dispose();if(type>=7)mesh.geometry.dispose();});
        releaseTerrainImage(chunk.groundTexture.image as PreparedTerrain['image']);
        chunk.groundTexture.dispose(); chunk.material.dispose(); chunk.group.clear();
      }
      spriteMaterials.forEach(material => material.dispose()); art.forEach(a => a.texture.dispose());
      recycled.length = 0; groundGeometry.dispose(); spriteGeometry.dispose();
    },
  };
}
