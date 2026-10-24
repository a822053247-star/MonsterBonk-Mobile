import * as THREE from 'three';
import { CREATURES, type PartySystem, type SpeciesId } from './party';
import { PixelSpriteRenderer, PixelTextureCache } from './pixel-sprite';
import { ANIMATION_RULES } from './creature-animation';

/** Pixel party views with the original P1 primitives retained as per-member fallbacks. */
export class PartyView {
  readonly group = new THREE.Group();
  private geometry = new THREE.OctahedronGeometry(0.65);
  private shadowGeometry = new THREE.CircleGeometry(0.6, 12);
  private materials: THREE.Material[] = [];
  private bodies: THREE.Mesh[] = [];
  private shadows: THREE.Mesh[] = [];
  private pixels: (PixelSpriteRenderer | undefined)[] = [];
  private cache = new PixelTextureCache();
  private leaderShadow: THREE.Mesh;
  private leaderRing: THREE.Mesh;
  private height = 2.65;
  private disposed = false;
  private animatedLeader = false;
  private screenBasis = { rightX: 1, rightZ: 0, upX: 0, upZ: -Math.SQRT1_2 };

  constructor(private party: PartySystem, private usePixels = true) {
    const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#25472d', transparent: true, opacity: 0.18, depthWrite: false });
    this.materials.push(shadowMaterial);
    this.leaderShadow = new THREE.Mesh(this.shadowGeometry, shadowMaterial);
    this.leaderShadow.rotation.x = -Math.PI / 2;
    const ringMaterial = new THREE.MeshBasicMaterial({ color: '#fff4c4', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    this.materials.push(ringMaterial);
    this.leaderRing = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.88, 32), ringMaterial);
    this.leaderRing.rotation.x = -Math.PI / 2;
    this.group.add(this.leaderShadow, this.leaderRing);
    // Allocate once for the maximum capacity; starting a run creates no GPU assets.
    for (let i = 1; i < party.capacity; i++) {
      const material = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
      this.materials.push(material);
      const body = new THREE.Mesh(this.geometry, material);
      body.name = `CompanionPlaceholder:${i}`;
      const shadow = new THREE.Mesh(this.shadowGeometry, shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      this.bodies.push(body); this.shadows.push(shadow);
      this.group.add(body, shadow);
    }
    this.group.visible = false;
  }

  get leaderBody(){return this.hasPixelLeader?this.pixels[0]?.group:undefined;}
  get deathBody(){return this.leaderBody;}
  get deathDecorations(){return [this.leaderShadow,this.leaderRing];}
  get hasPixelLeader() { return !!this.pixels[0]?.ready; }
  /** Warm the selected creature while the menu is visible; start reuses it. */
  preloadLeader(species: SpeciesId, animated: boolean) {
    if (this.disposed || !this.usePixels) return;
    let pixel = this.pixels[0];
    if (pixel && pixel.species !== species) { pixel.dispose(); pixel = this.pixels[0] = undefined; }
    if (!pixel) {
      pixel = this.pixels[0] = new PixelSpriteRenderer(species, this.cache);
      this.group.add(pixel.group);
    }
    pixel.setAnimationEnabled(animated);
  }
  get startupSettled() {
    if (!this.usePixels) return true;
    for (let i = 0; i < this.party.members.length; i++) {
      if (!this.pixels[i]?.startupSettled) return false;
    }
    return true;
  }

  setAnimatedLeader(enabled: boolean) {
    this.animatedLeader = enabled;
    this.pixels[0]?.setAnimationEnabled(enabled);
    this.pixels.forEach(pixel => pixel?.resetAnimation());
  }
  setCamera(camera: THREE.Camera) {
    camera.updateMatrixWorld(); const m = camera.matrixWorld.elements;
    this.screenBasis.rightX = m[0]; this.screenBasis.rightZ = m[2];
    this.screenBasis.upX = m[4]; this.screenBasis.upZ = m[6];
  }
  stepAnimation(dt: number, vx: number, vz: number) {
    if (dt <= 0) return;
    this.pixels.forEach((pixel, i) => {
      const member = this.party.members[i];
      if (member) pixel?.stepAnimation(dt, i === 0 ? vx : (member.x - member.previousX) / dt, i === 0 ? vz : (member.z - member.previousZ) / dt, this.screenBasis);
    });
  }
  stopAnimation() { this.pixels.forEach(pixel => pixel?.stopAnimation()); }

  resize(viewportHeight: number, frustumHeight: number) {
    this.height = THREE.MathUtils.clamp(56 * frustumHeight / Math.max(1, viewportHeight), 2.65, 3.2);
  }

  render(alpha: number, time: number, hurt = 0, protection = 0) {
    for (let i = 0; i < this.party.capacity; i++) {
      const member = this.party.members[i];
      let pixel = this.pixels[i];
      if (pixel && (!member || pixel.species !== member.species)) { pixel.dispose(); this.pixels[i] = pixel = undefined; }
      if (member && this.usePixels && !pixel) {
        pixel = this.pixels[i] = new PixelSpriteRenderer(member.species, this.cache);
        pixel.setAnimationEnabled(i === 0 ? this.animatedLeader : member.species !== 'yanrong');
        this.group.add(pixel.group);
      }
      if (!member || !pixel) continue;
      pixel.group.position.set(THREE.MathUtils.lerp(member.previousX, member.x, alpha), 0, THREE.MathUtils.lerp(member.previousZ, member.z, alpha));
      const moving = Math.hypot(member.x - member.previousX, member.z - member.previousZ) > 0.001;
      const scale = i === 0 ? (this.animatedLeader ? ANIMATION_RULES.displayScale : 1) : 0.82;
      pixel.render(this.height * scale, moving, time, i === 0 ? hurt : 0, i === 0 ? protection : 0);
    }
    const leader = this.party.leader;
    const x = THREE.MathUtils.lerp(leader.previousX, leader.x, alpha), z = THREE.MathUtils.lerp(leader.previousZ, leader.z, alpha);
    this.leaderShadow.visible = this.leaderRing.visible = this.hasPixelLeader;
    this.leaderShadow.position.set(x, 0.03, z); this.leaderShadow.scale.set(1.4, 0.8, 1);
    this.leaderRing.position.set(x, 0.045, z);
    for (let i = 0; i < this.bodies.length; i++) {
      const member = this.party.members[i + 1], body = this.bodies[i], shadow = this.shadows[i];
      body.visible = !!member && !this.pixels[i + 1]?.ready;
      shadow.visible = !!member;
      if (!member) continue;
      const x = THREE.MathUtils.lerp(member.previousX, member.x, alpha), z = THREE.MathUtils.lerp(member.previousZ, member.z, alpha);
      (body.material as THREE.MeshLambertMaterial).color.set(CREATURES[member.species].color);
      body.position.set(x, 0.85 + Math.sin(time * 5 + i) * 0.06, z);
      body.rotation.set(0, member.facing, i === 0 ? 0 : Math.PI / 4);
      body.scale.set(i === 0 ? 0.85 : 1.1, i === 0 ? 1.15 : 0.75, 0.8);
      shadow.position.set(x, 0.045, z);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pixels.forEach(pixel => pixel?.dispose());
    this.leaderRing.geometry.dispose();
    this.geometry.dispose(); this.shadowGeometry.dispose();
    this.materials.forEach(material => material.dispose());
    this.group.clear(); this.group.removeFromParent();
  }

  inspect() { return { enabled: this.usePixels, leader: this.hasPixelLeader ? 'pixel' : 'original', members: this.pixels.map(pixel => pixel?.inspect()), cache: this.cache.inspect() }; }
}
