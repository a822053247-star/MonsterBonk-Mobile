import * as THREE from 'three';
import { FLAME_SWEEP } from './flame-sweep';
import type { Combat } from './combat';
import { DEFAULT_SWEEP_VISUAL, SWEEP_VISUAL_PRESETS, sampleSweepVisual, sweepVisualPreset, type SweepVisualPresetId } from './flame-sweep-visual';

/** One reusable visual, rooted geometry. Combat time alone selects its frame. */
export class FlameSweepView {
  readonly group = new THREE.Group();
  private projection = new THREE.Group();
  private pivot = new THREE.Group();
  private texture: THREE.Texture;
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private fallback: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private disposed = false;
  private orientation = new THREE.Quaternion();
  private right = new THREE.Vector3(1,0,0);
  private up = new THREE.Vector3(0,1,0);
  private frame = 0;
  private presetId: SweepVisualPresetId = DEFAULT_SWEEP_VISUAL;
  private sample = {visible:false,frame:0,opacity:0,progress:0};
  private uniforms = { sweepBrightness: {value:1}, sweepCoreGain: {value:1}, sweepRootOpacity: {value:1}, sweepTipOpacity: {value:1} };
  loaded = false;
  failed = false;
  constructor() {
    const geometry = new THREE.PlaneGeometry(1,1);
    geometry.translate(.5-FLAME_SWEEP.anchorX, FLAME_SWEEP.anchorY-.5, 0);
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: true,
      alphaTest: 2/255, toneMapped: false, side: THREE.DoubleSide });
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms,this.uniforms);
      shader.vertexShader = 'varying vec2 vSweepUv;\n'+shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n vSweepUv = uv;');
      shader.fragmentShader = `varying vec2 vSweepUv;
        uniform float sweepBrightness, sweepCoreGain, sweepRootOpacity, sweepTipOpacity;
      `+shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        #ifdef USE_MAP
          // Compress the neutral/white core, preserving saturated orange/red edges.
          float core = smoothstep(.36,.82,min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b)));
          diffuseColor.rgb *= sweepBrightness * mix(vec3(1.),sweepCoreGain*vec3(1.,.82,.35),core);
          // Raw cell UVs: the common root is (96, 368) from the upper left.
          float radial = length(vSweepUv-vec2(${FLAME_SWEEP.anchorX},${1-FLAME_SWEEP.anchorY}));
          // Keep the main arc solid; fade only the small base and outermost tip.
          float rootFade = mix(sweepRootOpacity,1.,smoothstep(.008,.065,radial));
          float tipFade = mix(1.,sweepTipOpacity,smoothstep(.62,.86,radial));
          diffuseColor.a *= rootFade*tipFade;
        #endif
      `);
    };
    material.customProgramCacheKey = () => 'flame-sweep-crisp-core-v2';
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false; this.mesh.name = 'FlameSweepEightFrames';
    this.fallback = new THREE.Mesh(new THREE.RingGeometry(.7,1,48,1,Math.PI/4-FLAME_SWEEP.angle/2,FLAME_SWEEP.angle),
      new THREE.MeshBasicMaterial({ color: '#ff9b36', opacity: .45, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.group.add(this.projection); this.projection.add(this.pivot); this.pivot.add(this.mesh,this.fallback);
    // Billboard bodies write depth at their centres. Bias only camera depth so
    // the low paw anchor stays put on screen while flames remain visible on them.
    this.projection.position.z = 2.2;
    this.setPreset(sweepVisualPreset(typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('sweepVisual')));
    this.clear();
    this.texture = new THREE.TextureLoader().load(FLAME_SWEEP.url, texture => {
      if (this.disposed) { texture.dispose(); return; }
      texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
      texture.colorSpace = THREE.SRGBColorSpace; texture.repeat.set(1/FLAME_SWEEP.frames,1);
      material.map = texture; material.needsUpdate = true; this.loaded = true;
    }, undefined, () => { if (!this.disposed) this.failed = true; });
  }
  setPreset(id: SweepVisualPresetId) {
    this.presetId = id;
    const preset = SWEEP_VISUAL_PRESETS[id];
    this.uniforms.sweepBrightness.value = preset.brightness;
    this.uniforms.sweepCoreGain.value = preset.coreGain;
    this.uniforms.sweepRootOpacity.value = preset.rootOpacity;
    this.uniforms.sweepTipOpacity.value = preset.tipOpacity;
    this.projection.scale.set(1,preset.compression,1);
  }
  setView(camera: THREE.Camera) {
    this.orientation.copy(camera.quaternion);
    this.right.set(1,0,0).applyQuaternion(this.orientation);
    this.up.set(0,1,0).applyQuaternion(this.orientation);
  }
  render(combat: Combat, player: {x: number; z: number}) {
    const sweep = combat.melee;
    if (!sweep.active || this.disposed) { this.clear(); return; }
    const preset = SWEEP_VISUAL_PRESETS[this.presetId];
    const sample = sampleSweepVisual(sweep.age,this.presetId,this.sample);
    if (!sample.visible) { this.clear(); return; }
    this.frame = sample.frame;
    this.group.visible = true;
    this.group.position.set(player.x+sweep.aimX*preset.forward,preset.height,player.z+sweep.aimZ*preset.forward);
    const direction = Math.atan2((this.up.x*sweep.aimX+this.up.z*sweep.aimZ)/preset.compression,this.right.x*sweep.aimX+this.right.z*sweep.aimZ);
    this.group.quaternion.copy(this.orientation);
    this.pivot.rotation.z = direction-Math.PI/4+preset.rotation*(sample.progress-.5);
    // Exact 65/70/75% of the old size envelope at the same simulation time.
    const size = sweep.radius*1.2*(1+.04*Math.sin(sweep.age/FLAME_SWEEP.duration*Math.PI))*preset.sizeRatio;
    this.mesh.scale.set(size,size,1);
    this.texture.offset.x = this.frame/FLAME_SWEEP.frames;
    this.mesh.material.opacity = sample.opacity;
    this.mesh.visible = this.loaded;
    this.fallback.visible = !this.loaded;
    this.fallback.scale.setScalar(sweep.radius*preset.sizeRatio);
    this.fallback.material.opacity = .4*sample.opacity;
  }
  clear() { this.group.visible = this.mesh.visible = this.fallback.visible = false; }
  inspect() { return { active: this.group.visible, loaded: this.loaded, failed: this.failed,
    fallback: this.group.visible && this.fallback.visible, frame: this.frame, frames: FLAME_SWEEP.frames, frameSize: [FLAME_SWEEP.frameSize,FLAME_SWEEP.frameSize],
    anchor: [FLAME_SWEEP.anchorX*FLAME_SWEEP.frameSize,FLAME_SWEEP.anchorY*FLAME_SWEEP.frameSize], root: this.group.position.toArray(), opacity: this.mesh.material.opacity,
    scale: this.mesh.scale.x, preset:this.presetId, config:SWEEP_VISUAL_PRESETS[this.presetId], compression:this.projection.scale.y,
    url: FLAME_SWEEP.url, capacity: 1 }; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.clear(); this.texture.dispose();
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    this.fallback.geometry.dispose(); this.fallback.material.dispose(); this.group.removeFromParent();
  }
}
