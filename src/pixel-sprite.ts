import * as THREE from 'three';
import type { SpeciesId } from './party';

export const PIXEL_CREATURE_ASSETS: Readonly<Record<SpeciesId, string>> = {
  yanrong: 'creatures/yanrong-base.png',
  bubblesalamander: 'creatures/paopaoyuan.png',
  sproutspike: 'creatures/yacishou.png',
};
export const PIXEL_ENEMY_ASSETS = { 'enemy-normal': 'enemies/grass-monster.png', 'enemy-fast': 'enemies/runner-bug.png' } as const;
type PixelAssetId = SpeciesId | keyof typeof PIXEL_ENEMY_ASSETS;
const PIXEL_ASSETS: Readonly<Record<PixelAssetId, string>> = { ...PIXEL_CREATURE_ASSETS, ...PIXEL_ENEMY_ASSETS };
export const PIXEL_ALPHA = 24 / 255;

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
}

/** One texture per asset, shared by repeated members/instances, owned by each view. */
export class PixelTextureCache {
  private entries = new Map<PixelAssetId, TextureEntry>();

  acquire(species: PixelAssetId, onChange: () => void) {
    let entry = this.entries.get(species);
    if (!entry) {
      const created: TextureEntry = { texture: new THREE.Texture(), ready: false, failed: false, disposed: false, refs: 0, aspect: 1, sourceSize: [], crop: [], listeners: new Set() };
      entry = created;
      this.entries.set(species, created);
      // The URL honors Vite's base path; failed loads leave existing views visible.
      const url = `${import.meta.env?.BASE_URL ?? './'}assets/pixel/${PIXEL_ASSETS[species]}`;
      const loader = new THREE.ImageLoader();
      loader.load(url, image => {
        if (created.disposed) return;
        try {
          const prepared = preparePixelTexture(image);
          created.texture.image = prepared.canvas;
          created.texture.colorSpace = THREE.SRGBColorSpace;
          created.texture.magFilter = created.texture.minFilter = THREE.NearestFilter;
          created.texture.generateMipmaps = false;
          created.texture.wrapS = created.texture.wrapT = THREE.ClampToEdgeWrapping;
          created.texture.needsUpdate = true;
          created.aspect = prepared.aspect; created.sourceSize = prepared.sourceSize; created.crop = prepared.crop;
          created.ready = true;
        } catch { created.failed = true; }
        for (const notify of created.listeners) notify();
      }, undefined, () => {
        if (created.disposed) return;
        created.failed = true;
        for (const notify of created.listeners) notify();
      });
    }
    const acquired = entry;
    acquired.refs++;
    acquired.listeners.add(onChange);
    let released = false;
    return {
      entry: acquired,
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

  constructor(readonly species: SpeciesId, cache: PixelTextureCache) {
    this.group.name = `PixelCreature:${species}`;
    this.group.visible = false;
    this.sprite.name = 'PixelBillboard';
    this.sprite.center.set(0.5, 0);
    this.sprite.position.y = 0.035;
    this.group.add(this.sprite);
    this.lease = cache.acquire(species, () => this.sync());
    this.sync();
  }

  get ready() { return this.lease.entry.ready && !this.disposed; }

  private sync() {
    if (this.disposed) return;
    if (this.ready) {
      this.material.map = this.lease.entry.texture;
      this.material.needsUpdate = true;
      this.sprite.scale.set(this.height * this.lease.entry.aspect, this.height, 1);
    }
    this.group.visible = this.ready;
  }

  render(height: number, moving: boolean, time: number, hurt = 0) {
    this.height = height;
    // Uniform scale retains the source silhouette at rest and while moving.
    this.sprite.scale.set(height * this.lease.entry.aspect, height, 1);
    this.sprite.position.y = 0.035 + (moving ? Math.abs(Math.sin(time * 11)) * 0.025 : 0);
    this.material.color.set(hurt > 0 ? '#ffd8c4' : '#ffffff');
    this.group.visible = this.ready;
  }

  inspect() {
    const entry = this.lease.entry;
    return { species: this.species, loaded: entry.ready, failed: entry.failed, aspect: entry.aspect, height: this.height,
      width: this.sprite.scale.x, sourceSize: [...entry.sourceSize], crop: [...entry.crop], center: this.sprite.center.toArray(),
      footOffset: this.sprite.position.y, nearest: entry.texture.magFilter === THREE.NearestFilter && entry.texture.minFilter === THREE.NearestFilter,
      mipmaps: entry.texture.generateMipmaps, depthTest: this.material.depthTest, depthWrite: this.material.depthWrite, alphaTest: this.material.alphaTest };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.lease.release(); this.material.dispose(); this.group.clear(); this.group.removeFromParent();
  }
}
