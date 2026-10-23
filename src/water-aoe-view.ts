import * as THREE from 'three';
import type { WaterAoe } from './water-aoe';
import { instanceOpacity } from './visuals/instance-opacity';

const CAPACITY = 16;
/** One bounded batch per supplied atlas, with shared geometry and per-instance UV/alpha. */
export class WaterAtlas {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private frames: THREE.InstancedBufferAttribute;
  private alpha: THREE.InstancedBufferAttribute;
  private pose = new THREE.Object3D();
  private texture: THREE.Texture;
  loaded = false;
  failed = false;
  private disposed = false;
  constructor(name: string, columns: number, rows: number, root = 'water-aoe', capacity = CAPACITY, circular = true, smooth = false) {
    this.frames = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute('waterFrame', this.frames); this.frames.setUsage(THREE.DynamicDrawUsage);
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, alphaTest: .06, side: THREE.DoubleSide, toneMapped: false });
    material.color.setScalar(1.4);
    material.forceSinglePass = true;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.alpha = instanceOpacity(this.mesh, capacity);
    const compileAlpha = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      compileAlpha(shader, renderer);
      shader.vertexShader = 'attribute float waterFrame; varying vec2 waterLocalUv;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        waterLocalUv = uv;
        #ifdef USE_MAP
          vMapUv = (vMapUv + vec2(mod(waterFrame, ${columns}.0), ${rows - 1}.0 - floor(waterFrame / ${columns}.0))) / vec2(${columns}.0, ${rows}.0);
        #endif`);
      shader.fragmentShader = 'varying vec2 waterLocalUv;\n' + shader.fragmentShader;
      if (circular) shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= 1.0 - smoothstep(.9, 1.0, length(waterLocalUv - .5) * 2.0);');
    };
    material.customProgramCacheKey = () => `water-atlas-alpha-${columns}-${rows}-${circular}`;
    this.mesh.name = `WaterAoe-${name}`; this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/${root}/${name}.png`, texture => {
      if (this.disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = texture.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
      texture.generateMipmaps = false; material.map = texture; material.needsUpdate = true; this.loaded = true;
    }, undefined, () => { if (!this.disposed) this.failed = true; });
  }
  begin() { this.mesh.count = 0; }
  put(frame: number, x: number, z: number, size: number, alpha: number, rotation = 0, height = .08) {
    this.putRect(frame, x, z, size, size, alpha, rotation, height);
  }
  putRect(frame: number, x: number, z: number, width: number, depth: number, alpha: number, rotation = 0, height = .08) {
    if (!this.loaded || this.disposed || this.mesh.count >= this.mesh.instanceMatrix.count || alpha <= 0 || width <= 0 || depth <= 0) return;
    const index = this.mesh.count++;
    this.pose.position.set(x, height, z); this.pose.rotation.set(-Math.PI / 2, 0, rotation); this.pose.scale.set(width, depth, 1);
    this.pose.updateMatrix(); this.mesh.setMatrixAt(index, this.pose.matrix);
    this.frames.setX(index, frame); this.alpha.setX(index, alpha);
  }
  finish() { this.mesh.instanceMatrix.needsUpdate = this.frames.needsUpdate = this.alpha.needsUpdate = true; }
  inspect() { return { loaded: this.loaded, failed: this.failed, count: this.mesh.count, capacity: this.mesh.instanceMatrix.count, frames: Array.from(this.frames.array.slice(0, this.mesh.count)) }; }
  dispose() { this.disposed = true; this.mesh.count = 0; this.texture.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.dispose(); }
}

/** Supplied water art only, without an extra ground circle; visuals never advance combat clocks. */
export class WaterAoeView {
  readonly group = new THREE.Group();
  readonly burst = new WaterAtlas('azure-burst', 4, 4);
  readonly tide = new WaterAtlas('star-tide', 4, 2);
  readonly field = new WaterAtlas('still-sea', 1, 1);
  private sparkles = new WaterAtlas('sea-sparkles', 4, 2);
  readonly aura = new WaterAtlas('returning-ring', 4, 2);
  private atlases = [this.burst, this.tide, this.field, this.sparkles, this.aura];
  constructor() {
    this.group.name = 'WaterAoePriority';
    this.group.add(...this.atlases.map(a => a.mesh));
  }
  render(combat: WaterAoe, detail: number) {
    this.clear();
    for (const cast of combat.casts) {
      if (!cast.active) continue;
      if (cast.kind === 'azure-burst') {
        this.burst.put(Math.min(15, Math.floor(cast.age / cast.duration * 16)), cast.x, cast.z, cast.radius * 2, 1);
      } else if (cast.kind === 'star-tide') {
        for (let i = 0; i < cast.waveCount; i++) {
          const age = cast.age - i * .22;
          if (age <= 0 || age >= .95) continue;
          const radius = cast.waves[i].radius, frame = Math.min(7, Math.floor(age / .95 * 8));
          const occupancy = [.36, .56, .76, .94, .97, .96, .96, .96][frame];
          const fade = Math.min(1, (.95 - age) / .2);
          this.tide.put(frame, cast.x, cast.z, radius * 2 / occupancy, .92 * fade, 0, .1 + i * .005);
        }
      } else if (cast.kind === 'still-sea') {
        const fade = Math.min(1, cast.age / .2, (cast.duration - cast.age) / .35);
        this.field.put(0, cast.x, cast.z, cast.radius * 2, fade * .78, cast.age * .08);
        for (let i = 0; i < (detail <= 2 ? 1 : 3); i++) {
          const angle = i * 2.399963 + cast.age * .2;
          this.sparkles.put(Math.floor(cast.age * 10 + i * 2) % 8, cast.x + Math.cos(angle) * cast.radius * .55,
            cast.z + Math.sin(angle) * cast.radius * .55, 1.25, fade * .9, 0, .16);
        }
      } else {
        this.aura.put(Math.floor(cast.age * 10) % 8, cast.x, cast.z, cast.radius * 2, .92, 0, .11);
      }
    }
    for (const atlas of this.atlases) atlas.finish();
  }
  clear() { for (const atlas of this.atlases) atlas.begin(); }
  inspect() { return { capacity: CAPACITY, atlases: this.atlases.map(a => a.inspect()) }; }
  dispose() { this.clear(); this.group.removeFromParent(); for (const atlas of this.atlases) atlas.dispose(); }
}
