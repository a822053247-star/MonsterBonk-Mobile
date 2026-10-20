import * as THREE from 'three';
import type { SpeciesId } from './party';
import { ANIMATION_LAYOUT, CreatureAnimator, clipFrame, type AnimationAsset, type ScreenBasis, type CreatureClip } from './creature-animation';
import { ENEMY_DIRECTION_ASSETS, ENEMY_DIRECTION_LAYOUT } from './enemy-directions';
import { CROWNTHORN_ASSETS, CROWNTHORN_CLIPS, CROWNTHORN_LAYOUT, type CrownthornAction, type CrownthornAsset } from './crownthorn-animation';

export const PIXEL_CREATURE_ASSETS: Readonly<Record<SpeciesId, string>> = {
  yanrong: 'creatures/yanrong-base.png',
  bubblesalamander: 'creatures/paopaoyuan.png',
  sproutspike: 'creatures/yacishou.png',
};
export const PIXEL_ENEMY_ASSETS = { 'enemy-normal': 'enemies/grass-monster.png', 'enemy-fast': 'enemies/runner-bug.png', 'enemy-tank': 'enemies/rock-armor-bug.png', 'enemy-draft-crystal-swarm': 'enemies/draft-crystal-swarm.png', 'enemy-draft-spore-bomber': 'enemies/draft-spore-bomber.png', 'enemy-draft-treasure-runner': 'enemies/draft-treasure-runner.png' } as const;
export const PIXEL_ANIMATION_ASSETS = {
  'yanrong-walk': 'creatures/animation/yanrong-animation-sheet.normalized.png',
  'yanrong-diagonal': 'creatures/animation/yanrong-diagonal-walk.normalized.png',
  'paopaoyuan-walk': 'creatures/animation/paopaoyuan-animation-sheet.normalized.png',
  'paopaoyuan-diagonal': 'creatures/animation/paopaoyuan-diagonal-walk.normalized.png',
  'yacishou-walk': 'creatures/animation/yacishou-animation-sheet.normalized.png',
  'yacishou-diagonal': 'creatures/animation/yacishou-diagonal-walk.normalized.png',
} as const;
type PixelAssetId = SpeciesId | keyof typeof PIXEL_ENEMY_ASSETS | AnimationAsset | CrownthornAsset;
const PIXEL_ASSETS: Readonly<Record<PixelAssetId, string>> = { ...PIXEL_CREATURE_ASSETS, ...PIXEL_ENEMY_ASSETS, ...PIXEL_ANIMATION_ASSETS, ...CROWNTHORN_ASSETS };
export const PIXEL_ALPHA = 24 / 255;

/** Per-instance UVs keep the cached atlas immutable when multiple views play. */
export function configurePixelFrame(material: THREE.SpriteMaterial, frameUv: THREE.Vector4) {
  material.onBeforeCompile = shader => {
    shader.uniforms.pixelFrame = { value: frameUv };
    shader.vertexShader = 'uniform vec4 pixelFrame;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_MAP
        vMapUv = vMapUv * pixelFrame.zw + pixelFrame.xy;
      #endif`);
  };
  material.customProgramCacheKey = () => 'pixel-sprite-frame-v1';
}

/** Crop only transparent padding. Never resample or modify the original PNG. */
export function preparePixelTexture(image: HTMLImageElement) {
  const source = document.createElement('canvas');
  source.width = image.naturalWidth; source.height = image.naturalHeight;
  const context = source.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Pixel texture canvas unavailable');
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, source.width, source.height);
  let left = source.width, right = -1, top = source.height, bottom = -1;
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const index = (y * source.width + x) * 4, alpha = pixels.data[index + 3];
    if (alpha < 24) { pixels.data[index + 3] = 0; continue; }
    // Exported almost-opaque interiors should not show terrain through the body.
    if (alpha >= 248) pixels.data[index + 3] = 255;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error('Pixel texture has no visible silhouette');
  context.putImageData(pixels, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = right - left + 1; canvas.height = bottom - top + 1;
  const cropped = canvas.getContext('2d');
  if (!cropped) throw new Error('Pixel crop canvas unavailable');
  cropped.imageSmoothingEnabled = false;
  cropped.drawImage(source, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return { canvas, aspect: canvas.width / canvas.height, sourceSize: [source.width, source.height], crop: [left, top, canvas.width, canvas.height] };
}

interface TextureEntry {
  texture: THREE.Texture; ready: boolean; failed: boolean; disposed: boolean; refs: number;
  aspect: number; sourceSize: number[]; crop: number[]; listeners: Set<() => void>;
  start: () => void;
  directional: boolean; directionFailed: boolean;
}

/** One texture per asset, shared by repeated members/instances, owned by each view. */
export class PixelTextureCache {
  private entries = new Map<PixelAssetId, TextureEntry>();

  acquire(species: PixelAssetId, onChange: () => void, autoLoad = true) {
    let entry = this.entries.get(species);
    if (!entry) {
      const created: TextureEntry = { texture: new THREE.Texture(), ready: false, failed: false, disposed: false, refs: 0, aspect: 1, sourceSize: [], crop: [], listeners: new Set(), start: () => {}, directional: false, directionFailed: false };
      entry = created;
      this.entries.set(species, created);
      // The URL honors Vite's base path; failed loads leave existing views visible.
      const url = `${import.meta.env?.BASE_URL ?? './'}assets/pixel/${PIXEL_ASSETS[species]}`;
      const directionPath = ENEMY_DIRECTION_ASSETS[species as keyof typeof ENEMY_DIRECTION_ASSETS];
      let started = false;
      created.start = () => {
        if (started || created.disposed) return;
        started = true;
        const loader = new THREE.ImageLoader();
        const fail = (directional: boolean) => {
          if (created.disposed) return;
          if (directional) { created.directionFailed = true; request(false); return; }
          created.failed = true;
          for (const notify of created.listeners) notify();
        };
        const request = (directional: boolean) => loader.load(directional ? `${import.meta.env?.BASE_URL ?? './'}assets/pixel/${directionPath}` : url, image => {
        if (created.disposed) return;
        try {
          const atlas = species in PIXEL_ANIMATION_ASSETS;
          const bossAtlas = species in CROWNTHORN_ASSETS;
          if (bossAtlas) {
            const key = species.slice('crownthorn-'.length);
            const columns = key === 'directions' ? 5 : CROWNTHORN_CLIPS[key as CrownthornAction].expected;
            if (image.naturalWidth !== CROWNTHORN_LAYOUT.cell * columns || image.naturalHeight !== CROWNTHORN_LAYOUT.cell) throw new Error('Invalid Crownthorn atlas dimensions');
          }
          if (atlas && (image.naturalWidth !== ANIMATION_LAYOUT.frameWidth * 4 || image.naturalHeight !== ANIMATION_LAYOUT.frameHeight * (species.endsWith('-walk') ? 4 : 2))) throw new Error('Invalid animation atlas dimensions');
          if (directional && (image.naturalWidth !== ENEMY_DIRECTION_LAYOUT.cell * ENEMY_DIRECTION_LAYOUT.columns || image.naturalHeight !== ENEMY_DIRECTION_LAYOUT.cell)) throw new Error('Invalid enemy direction atlas dimensions');
          const prepared = atlas || directional || bossAtlas ? { canvas: image, aspect: 1, sourceSize: [image.naturalWidth, image.naturalHeight], crop: [0, 0, directional ? 256 : image.naturalWidth, image.naturalHeight] } : preparePixelTexture(image);
          created.texture.image = prepared.canvas;
          created.texture.colorSpace = THREE.SRGBColorSpace;
          created.texture.magFilter = created.texture.minFilter = THREE.NearestFilter;
          created.texture.generateMipmaps = false;
          created.texture.wrapS = created.texture.wrapT = THREE.ClampToEdgeWrapping;
          created.texture.needsUpdate = true;
          created.aspect = prepared.aspect; created.sourceSize = prepared.sourceSize; created.crop = prepared.crop;
          created.ready = true;
          created.directional = directional;
        } catch { fail(directional); return; }
        for (const notify of created.listeners) notify();
      }, undefined, () => fail(directional));
        request(!!directionPath);
      };
    }
    const acquired = entry;
    acquired.refs++;
    acquired.listeners.add(onChange);
    if (autoLoad) acquired.start();
    let released = false;
    return {
      entry: acquired,
      start: acquired.start,
      release: () => {
        if (released) return;
        released = true;
        acquired.listeners.delete(onChange);
        if (--acquired.refs === 0) {
          acquired.disposed = true; acquired.texture.dispose(); acquired.listeners.clear();
          this.entries.delete(species);
        }
      },
    };
  }

  inspect() { return { textures: this.entries.size, references: [...this.entries.values()].reduce((sum, entry) => sum + entry.refs, 0) }; }
}

/** Billboard view only: never writes simulation positions, collision or damage. */
export class PixelSpriteRenderer {
  readonly group = new THREE.Group();
  private material = new THREE.SpriteMaterial({ color: '#ffffff', transparent: true, alphaTest: PIXEL_ALPHA, depthTest: true, depthWrite: true, toneMapped: false });
  private sprite = new THREE.Sprite(this.material);
  private lease: ReturnType<PixelTextureCache['acquire']>;
  private height = 2.65;
  private disposed = false;
  private animator: CreatureAnimator;
  private animations = new Map<AnimationAsset, ReturnType<PixelTextureCache['acquire']>>();
  private animated = false;
  private frameUv = new THREE.Vector4(0, 0, 1, 1);
  private selectedFrame = -1;
  private selectedAsset: PixelAssetId;

  constructor(readonly species: SpeciesId, private cache: PixelTextureCache) {
    this.animator = new CreatureAnimator(species);
    this.selectedAsset = species;
    configurePixelFrame(this.material, this.frameUv);
    this.group.name = `PixelCreature:${species}`;
    this.group.visible = false;
    this.sprite.name = 'PixelBillboard';
    this.sprite.center.set(0.5, 0);
    this.sprite.position.y = 0.035;
    this.group.add(this.sprite);
    this.lease = cache.acquire(species, () => this.sync());
    this.sync();
  }

  get ready() { return !this.disposed && (this.animations.get(this.selectedAsset as AnimationAsset)?.entry ?? this.lease.entry).ready; }

  setAnimationEnabled(enabled: boolean) {
    if (this.disposed) return;
    this.animated = enabled;
    if (this.animated && !this.animations.size) for (const asset of this.animator.clips.assets) {
      this.animations.set(asset, this.cache.acquire(asset, () => this.sync()));
    }
    this.sync();
  }
  stepAnimation(dt: number, vx: number, vz: number, basis: ScreenBasis) { if (this.animated && !this.disposed) this.animator.step(dt, vx, vz, basis); }
  resetAnimation() { this.animator.reset(); this.sync(); }
  stopAnimation() { this.animator.stop(); this.sync(); }

  private animationClip(): CreatureClip | undefined {
    if (!this.animated) return;
    const clip = this.animator.clip;
    if (this.animations.get(clip.asset)?.entry.ready) return clip;
    // Missing diagonal art keeps movement direction and uses a matching side view.
    if (clip.asset.endsWith('-diagonal') && this.animations.get(this.animator.clips.assets[0])?.entry.ready) {
      const side = this.animator.clips.walks[clip.facing.endsWith('left') ? 'left' : 'right'];
      return this.animator.moving ? side : this.animator.clips.idles[side.facing];
    }
  }

  private sync() {
    if (this.disposed) return;
    const clip = this.animationClip(), entry = clip ? this.animations.get(clip.asset)!.entry : this.lease.entry;
    this.selectedAsset = clip?.asset ?? this.species;
    const texture = entry.ready ? entry.texture : null;
    if (this.material.map !== texture) { this.material.map = texture; this.material.needsUpdate = true; }
    if (clip) {
      const frame = clipFrame(clip, this.animator.time), rows = clip.asset.endsWith('-walk') ? 4 : 2;
      this.selectedFrame = frame;
      this.frameUv.set((frame % 4 + (clip.mirror ? 1 : 0)) / 4, (rows - 1 - Math.floor(frame / 4)) / rows, (clip.mirror ? -1 : 1) / 4, 1 / rows);
      this.sprite.center.set(...clip.anchor);
      this.sprite.scale.set(this.height * ANIMATION_LAYOUT.frameWidth / ANIMATION_LAYOUT.bodyHeight, this.height * ANIMATION_LAYOUT.frameHeight / ANIMATION_LAYOUT.bodyHeight, 1);
    } else {
      this.selectedFrame = -1; this.frameUv.set(0, 0, 1, 1);
      this.sprite.center.set(.5, 0); this.sprite.scale.set(this.height * entry.aspect, this.height, 1);
    }
    this.group.visible = this.ready;
  }

  render(height: number, moving: boolean, time: number, hurt = 0, protection = 0) {
    this.height = height;
    // Uniform scale retains the source silhouette at rest and while moving.
    this.sync();
    this.sprite.position.y = 0.035 + (!this.animated && moving ? Math.abs(Math.sin(time * 11)) * 0.025 : 0);
    const strength=Math.max(0,Math.min(1,hurt)),progress=1-strength;
    const impact=strength>0?Math.exp(-progress*6):0;
    this.sprite.scale.x*=1+.16*impact;this.sprite.scale.y*=1-.18*impact;
    this.sprite.position.x=Math.sin(progress*Math.PI*5)*.06*strength;
    this.sprite.position.y+=Math.sin(progress*Math.PI)*.06*strength;
    this.material.rotation=Math.sin(progress*Math.PI*3)*.14*strength;
    this.material.color.set(strength>.65?'#fff2e8':strength>0?'#ffb9a5':'#ffffff');
    this.material.opacity=protection>0 && strength===0 && Math.floor(time*18)%2===0?.5:1;
    this.group.visible = this.ready;
  }

  inspect() {
    const entry = this.lease.entry;
    return { species: this.species, loaded: entry.ready, failed: entry.failed, aspect: entry.aspect, height: this.height,
      width: this.sprite.scale.x, sourceSize: [...entry.sourceSize], crop: [...entry.crop], center: this.sprite.center.toArray(),
      hurtPose: { rotation:this.material.rotation, opacity:this.material.opacity, scale:this.sprite.scale.toArray(), offsetX:this.sprite.position.x, tint:this.material.color.getHexString() },
      footOffset: this.sprite.position.y, nearest: entry.texture.magFilter === THREE.NearestFilter && entry.texture.minFilter === THREE.NearestFilter,
      animation: { enabled: this.animated, ...this.animator.inspect(), renderedFrame: this.selectedFrame, asset: this.selectedAsset, uv: this.frameUv.toArray(),
        atlases: [...this.animations].map(([asset, lease]) => ({ asset, loaded: lease.entry.ready, failed: lease.entry.failed, nearest: lease.entry.texture.magFilter === THREE.NearestFilter, mipmaps: lease.entry.texture.generateMipmaps })) },
      mipmaps: entry.texture.generateMipmaps, depthTest: this.material.depthTest, depthWrite: this.material.depthWrite, alphaTest: this.material.alphaTest };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.lease.release(); for (const lease of this.animations.values()) lease.release(); this.animations.clear();
    this.material.dispose(); this.group.clear(); this.group.removeFromParent();
  }
}
