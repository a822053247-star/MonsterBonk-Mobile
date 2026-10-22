import * as THREE from 'three';

const GHOST_LIFE = 0.17;
const IMAGE_URL = `${import.meta.env?.BASE_URL ?? './'}assets/pixel/creatures/yanrong-base.png`;

/** Crop transparent padding only, keeping the complete visible silhouette and aspect. */
function prepareTexture(image: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const alpha = pixels.data[(y * canvas.width + x) * 4 + 3];
    // Ignore almost invisible export speckles; the render uses a matching alpha test.
    if (alpha < 24) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error('Yanrong sprite has no visible pixels');
  const width = right - left + 1, height = bottom - top + 1;
  // The supplied PNG's interior alpha is mostly 253. Make its solid interior opaque.
  // RGB bleed into transparent neighbors avoids dark fringes under linear/mip filtering.
  const data = pixels.data;
  const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const i = (y * canvas.width + x) * 4;
    if (data[i + 3] >= 248) { data[i + 3] = 255; continue; }
    if (data[i + 3] >= 24) continue;
    data[i + 3] = 0;
    for (const [dx, dy] of neighbors) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= canvas.width || ny < 0 || ny >= canvas.height) continue;
      const j = (ny * canvas.width + nx) * 4;
      if (data[j + 3] < 24) continue;
      data[i] = data[j]; data[i + 1] = data[j + 1]; data[i + 2] = data[j + 2]; break;
    }
  }
  context.putImageData(pixels, 0, 0);
  const cropped = document.createElement('canvas');
  const scale = Math.min(1, 1024 / Math.max(width, height));
  cropped.width = Math.round(width * scale); cropped.height = Math.round(height * scale);
  cropped.getContext('2d')!.drawImage(canvas, left, top, width, height, 0, 0, cropped.width, cropped.height);
  return { canvas: cropped, aspect: width / height, sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight };
}

/** A view only: it never writes entity coordinates, collision sizes or combat data. */
export class MonsterSprite {
  readonly group = new THREE.Group();
  private material = new THREE.SpriteMaterial({ transparent: true, alphaTest: 24 / 255, depthTest: true, depthWrite: true, toneMapped: false });
  private sprite = new THREE.Sprite(this.material);
  private texture: THREE.Texture;
  private shadowTexture: THREE.CanvasTexture;
  private shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private ghosts: { sprite: THREE.Sprite; material: THREE.SpriteMaterial; world: THREE.Vector3; remaining: number }[] = [];
  private aspect = 1;
  private height = 2.65;
  private phase = 0;
  private ghostClock = 0;
  private loaded = false;
  private failed = false;
  private disposed = false;
  private sourceSize = { width: 0, height: 0 };

  constructor(onChange: () => void) {
    this.group.name = 'YanrongSpriteView'; this.group.visible = false;
    this.sprite.name = 'YanrongBillboard'; this.sprite.center.set(0.5, 0);
    this.group.add(this.sprite);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d')!, gradient = context.createRadialGradient(32, 32, 3, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(24,52,32,0.27)'); gradient.addColorStop(0.5, 'rgba(24,52,32,0.13)'); gradient.addColorStop(1, 'rgba(24,52,32,0)');
    context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
    this.shadowTexture = new THREE.CanvasTexture(canvas);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.35), new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false, toneMapped: false }));
    this.shadow.name = 'SpriteGroundShadow'; this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.025;
    this.shadow.renderOrder = -1; this.group.add(this.shadow);
    for (let i = 0; i < 3; i++) {
      const material = this.material.clone(); material.depthWrite = false; material.alphaTest = 1 / 255;
      const sprite = new THREE.Sprite(material); sprite.name = `DashAfterimage:${i}`; sprite.center.copy(this.sprite.center); sprite.visible = false;
      this.group.add(sprite); this.ghosts.push({ sprite, material, world: new THREE.Vector3(), remaining: 0 });
    }
    this.texture = new THREE.TextureLoader().load(IMAGE_URL, (texture: THREE.Texture) => {
      if (this.disposed) { texture.dispose(); return; }
      try {
        const prepared = prepareTexture(texture.image as HTMLImageElement);
        texture.image = prepared.canvas; texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
        this.aspect = prepared.aspect; this.sourceSize = { width: prepared.sourceWidth, height: prepared.sourceHeight };
        this.material.map = texture; this.material.needsUpdate = true;
        for (const ghost of this.ghosts) { ghost.material.map = texture; ghost.material.needsUpdate = true; }
        this.loaded = true; this.applyScale(); onChange();
      } catch { this.failed = true; onChange(); }
    }, undefined, () => { if (!this.disposed) { this.failed = true; onChange(); } });
  }

  get ready() { return this.loaded && !this.failed; }

  resize(viewportHeight: number, frustumHeight: number, menu: boolean) {
    // Keep a readable 56 px silhouette on short phones without enlarging collision.
    const height = menu ? 2.65 : THREE.MathUtils.clamp(56 * frustumHeight / Math.max(1, viewportHeight), 2.65, 3);
    if (height !== this.height) { this.height = height; this.applyScale(); }
  }

  private applyScale(stretch = 0) {
    this.sprite.scale.set(this.height * this.aspect * (1 - stretch * 0.25), this.height * (1 + stretch), 1);
  }

  reset() {
    this.phase = this.ghostClock = 0;
    for (const ghost of this.ghosts) { ghost.remaining = 0; ghost.sprite.visible = false; }
    this.material.rotation = 0; this.material.opacity = 1; this.material.color.set('#ffffff');
    this.sprite.position.set(0, 0.025, 0); this.applyScale(); this.shadow.scale.setScalar(1);
  }

  animate(dt: number, moving: number, dashing: boolean, time: number, jump: number, hurt: number, facing: number, world: THREE.Vector3) {
    this.phase += dt * (moving > 0.08 ? 13 : 2.6);
    const stride = moving > 0.08 ? moving : 0;
    const stretch = dashing ? 0.075 : Math.sin(this.phase * 2) * stride * 0.018;
    this.applyScale(stretch);
    this.sprite.position.y = 0.025 + jump + Math.abs(Math.sin(this.phase)) * stride * 0.055;
    this.material.rotation = (dashing ? -Math.sin(facing) * 0.10 : Math.sin(this.phase) * stride * 0.025);
    const flashing = hurt > 0 && Math.floor(hurt * 10) % 2 === 0;
    this.material.opacity = flashing ? 0.62 : 1;
    this.material.color.set(flashing ? '#ffcfbd' : '#ffffff');
    this.shadow.scale.setScalar(1 - Math.min(jump, 1) * 0.15);
    this.ghostClock = Math.max(0, this.ghostClock - dt);
    for (const ghost of this.ghosts) {
      ghost.remaining = Math.max(0, ghost.remaining - dt); ghost.sprite.visible = ghost.remaining > 0;
      ghost.material.opacity = 0.24 * (ghost.remaining / GHOST_LIFE) ** 2;
      ghost.sprite.position.copy(ghost.world).sub(world);
    }
    if (dashing && this.ghostClock === 0) {
      const ghost = this.ghosts.find(item => item.remaining === 0);
      if (ghost) {
        ghost.remaining = GHOST_LIFE; ghost.world.copy(world).add(this.sprite.position);
        ghost.sprite.position.copy(this.sprite.position); ghost.sprite.scale.copy(this.sprite.scale);
        ghost.material.rotation = this.material.rotation; ghost.material.opacity = 0.24; ghost.sprite.visible = true;
      }
      this.ghostClock = 0.045;
    }
    // time is intentionally not used as a second clock; pause freezes dt and all effects.
    void time;
  }

  inspect() {
    return { loaded: this.loaded, failed: this.failed, sourceSize: { ...this.sourceSize }, aspect: this.aspect, height: this.height, width: this.height * this.aspect, footOffset: this.sprite.position.y, ghosts: this.ghosts.filter(ghost => ghost.remaining > 0).length };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.group.removeFromParent(); this.texture.dispose(); this.shadowTexture.dispose();
    this.material.dispose(); this.shadow.geometry.dispose(); this.shadow.material.dispose();
    this.ghosts.forEach(ghost => ghost.material.dispose());
  }
}
