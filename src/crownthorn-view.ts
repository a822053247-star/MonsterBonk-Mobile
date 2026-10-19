import * as THREE from 'three';
import { CrownthornAnimator, CROWNTHORN_ASSETS, CROWNTHORN_LAYOUT, type CrownthornAction, type CrownthornAsset } from './crownthorn-animation';
import { configurePixelFrame, PIXEL_ALPHA, PixelTextureCache } from './pixel-sprite';
import type { ScreenBasis } from './creature-animation';

/** Billboard component, ready for a future Boss controller. No combat writes. */
export class CrownthornView {
  readonly group = new THREE.Group();
  readonly animator = new CrownthornAnimator();
  private uv = new THREE.Vector4();
  private material = new THREE.SpriteMaterial({ transparent: true, alphaTest: PIXEL_ALPHA, depthTest: true, depthWrite: true, toneMapped: false });
  private sprite = new THREE.Sprite(this.material);
  private leases = new Map<CrownthornAsset, ReturnType<PixelTextureCache['acquire']>>();
  private disposed = false;
  private renderedFrame = -1;
  private fallback = false;
  constructor(private cache = new PixelTextureCache(), height = 4) {
    this.group.name = 'Crownthorn:荆冠兽王';
    configurePixelFrame(this.material, this.uv);
    this.sprite.center.set(.5, 1 - CROWNTHORN_LAYOUT.foot[1] / CROWNTHORN_LAYOUT.cell);
    this.sprite.scale.setScalar(height * CROWNTHORN_LAYOUT.cell / CROWNTHORN_LAYOUT.bodyHeight);
    this.sprite.position.y = .035;
    this.group.add(this.sprite);
    for (const asset of Object.keys(CROWNTHORN_ASSETS) as CrownthornAsset[]) this.leases.set(asset, cache.acquire(asset, () => this.render()));
    this.render();
  }
  play(action: CrownthornAction | null, restart = false) { if (!this.disposed) { this.animator.play(action, restart); this.render(); } }
  step(dt: number, dx: number, dz: number, basis: ScreenBasis) { if (!this.disposed) { this.animator.step(dt, dx, dz, basis); this.render(); } }
  reset() { if (!this.disposed) { this.animator.reset(); this.render(); } }
  render() {
    if (this.disposed) return;
    const pose = this.animator.inspect();
    let entry = this.leases.get(pose.asset)?.entry;
    this.fallback = !entry?.ready;
    // A failed action is shown as an explicitly reported static front pose.
    if (this.fallback) entry = this.leases.get('crownthorn-directions')?.entry;
    const texture = entry?.ready ? entry.texture : null;
    if (this.material.map !== texture) { this.material.map = texture; this.material.needsUpdate = true; }
    const columns = this.fallback ? 5 : pose.columns, frame = this.fallback ? 0 : pose.frame;
    const mirror = !this.fallback && pose.mirror;
    this.uv.set((frame + (mirror ? 1 : 0)) / columns, 0, (mirror ? -1 : 1) / columns, 1);
    this.renderedFrame = texture ? frame : -1;
    this.group.visible = !!texture;
  }
  inspect() {
    const pose = this.animator.inspect();
    return { ...pose, renderedFacing: this.fallback ? 'down' : pose.renderedFacing,
      renderedAsset: this.fallback ? 'crownthorn-directions' : pose.asset,
      renderedFrame: this.renderedFrame, fallback: this.fallback,
      visible: this.group.visible, disposed: this.disposed, uv: this.uv.toArray(), anchor: this.sprite.center.toArray(),
      rotation: this.material.rotation, textures: this.cache.inspect(),
      atlases: [...this.leases].map(([asset, { entry }]) => ({ asset, loaded: entry.ready, failed: entry.failed,
        nearest: entry.texture.magFilter === THREE.NearestFilter && entry.texture.minFilter === THREE.NearestFilter, mipmaps: entry.texture.generateMipmaps })) };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const lease of this.leases.values()) lease.release();
    this.leases.clear(); this.material.dispose(); this.group.visible = false; this.group.clear(); this.group.removeFromParent();
  }
}
