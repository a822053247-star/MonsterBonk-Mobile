import * as THREE from 'three';
import { COMBAT_LIMITS, type Shockwave } from './combat';
import { SKILL_RULES } from './progression';
import { AREA_RULES, type NovaCast } from './area-attacks';

/** Reserved large-attack channel. Geometry fallback is always available, without texture IO. */
export class NovaView {
  readonly group = new THREE.Group();
  private geometry = new THREE.RingGeometry(.9, 1, 64);
  private flashGeometry = new THREE.CircleGeometry(1, 32);
  private shardGeometry = new THREE.OctahedronGeometry(1, 0);
  private pose = new THREE.Object3D();
  private slots = Array.from({ length: AREA_RULES.visualCapacity }, () => {
    const ring = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: '#ffcc62', transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const flash = new THREE.Mesh(this.flashGeometry, new THREE.MeshBasicMaterial({ color: '#fff0b6', transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
    const shards = new THREE.InstancedMesh(this.shardGeometry, new THREE.MeshBasicMaterial({ color: '#ffab4e', transparent: true, depthWrite: false, toneMapped: false }), 32);
    ring.rotation.x = flash.rotation.x = -Math.PI / 2;
    ring.renderOrder = flash.renderOrder = shards.renderOrder = 8;
    shards.frustumCulled = false; shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(ring, flash, shards);
    return { ring, flash, shards };
  });
  constructor() { this.group.name = 'ScreenNovaPriority'; this.clear(); }
  render(casts: readonly NovaCast[], detail: number) {
    this.clear();
    // Simulation accepts more casts than this visual channel can show. Excess visuals are omitted only.
    casts.filter(c => c.active).slice(0, this.slots.length).forEach((cast, index) => {
      const slot = this.slots[index], v = cast.view;
      const warning = !cast.detonated, p = Math.max(0, (cast.age - AREA_RULES.warning) / (AREA_RULES.duration - AREA_RULES.warning));
      const radius = Math.hypot(v.halfWidth, v.halfDepth);
      slot.ring.visible = true; slot.ring.position.set(v.x, .16, v.z);
      slot.ring.scale.setScalar(warning ? 1.5 + cast.age * 2 : Math.max(.1, radius * Math.min(1, p * 2.1)));
      slot.ring.material.opacity = warning ? .25 + .35 * Math.sin(cast.age * 25) ** 2 : (1 - p) * .8;
      slot.flash.visible = !warning && p < .42;
      slot.flash.position.set(v.x, .2, v.z);
      slot.flash.scale.setScalar(Math.max(.1, radius * Math.min(.65, .15 + p * 2)));
      slot.flash.material.opacity = Math.max(0, 1 - p / .42) * .55;
      slot.shards.visible = !warning;
      slot.shards.count = warning ? 0 : detail <= 2 ? 8 : 32;
      slot.shards.material.opacity = (1 - p) * .85;
      for (let i = 0; i < slot.shards.count; i++) {
        const angle = i * 2.399963, distance = radius * p * (.4 + (i % 5) * .14);
        this.pose.position.set(v.x + Math.sin(angle) * distance, .4 + Math.sin(p * Math.PI) * (1 + i % 3), v.z + Math.cos(angle) * distance);
        this.pose.rotation.set(p * 8 + i, angle, p * 4);
        this.pose.scale.setScalar((.12 + i % 3 * .05) * (1 - p)); this.pose.updateMatrix();
        slot.shards.setMatrixAt(i, this.pose.matrix);
      }
      slot.shards.instanceMatrix.needsUpdate = true;
    });
  }
  clear() { for (const slot of this.slots) { slot.ring.visible = slot.flash.visible = slot.shards.visible = false; slot.shards.count = 0; } }
  inspect() { return { capacity: this.slots.length, active: this.slots.filter(s => s.ring.visible).length, shards: this.slots.reduce((n, s) => n + s.shards.count, 0) }; }
  dispose() {
    this.clear(); this.group.removeFromParent();
    this.geometry.dispose(); this.flashGeometry.dispose(); this.shardGeometry.dispose();
    for (const slot of this.slots) { slot.ring.material.dispose(); slot.flash.material.dispose(); slot.shards.material.dispose(); slot.shards.dispose(); }
  }
}

/** Fixed pools; every visual follows the simulation's wave clock, including pause. */
export class ShockwaveView {
  readonly group = new THREE.Group();
  private geometry = new THREE.PlaneGeometry(1, 1);
  private textures: THREE.Texture[] = [];
  private materials: THREE.MeshBasicMaterial[] = [];
  private pose = new THREE.Object3D();
  private cameraRotation = new THREE.Quaternion();
  private disposed = false;
  private loaded = 0;
  get ready() { return this.loaded === 3; }

  private texture(name: string) {
    const texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/kenney_particle-pack/PNG%20(Transparent)/${name}.png`, () => {
      if (this.disposed) return;
      this.loaded++;
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(texture);
    return texture;
  }

  private material(map: THREE.Texture, color: string, additive = false) {
    const material = new THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.materials.push(material);
    return material;
  }

  private slots: { group: THREE.Group; ring: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    echo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    dust: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    glints: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> }[] = [];

  constructor() {
    this.group.name = 'GrasslandShockwave';
    const circle = this.texture('circle_03'), dust = this.texture('smoke_08'), spark = this.texture('spark_01');
    for (let i = 0; i < COMBAT_LIMITS.shockwaves; i++) {
      const group = new THREE.Group(); group.visible = false;
      const ring = new THREE.Mesh(this.geometry, this.material(circle, '#e8ec9a', true));
      const echo = new THREE.Mesh(this.geometry, this.material(circle, '#a5dc91', true));
      ring.rotation.x = echo.rotation.x = -Math.PI / 2;
      const clouds = new THREE.InstancedMesh(this.geometry, this.material(dust, '#c5be86'), 12);
      const glints = new THREE.InstancedMesh(this.geometry, this.material(spark, '#fff2ba', true), 12);
      for (const mesh of [clouds, glints]) {
        mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      }
      group.add(ring, echo, clouds, glints); this.group.add(group);
      this.slots.push({ group, ring, echo, dust: clouds, glints });
    }
  }

  setView(camera: THREE.Camera) { this.cameraRotation.copy(camera.quaternion); }
  clear() { for (const slot of this.slots) slot.group.visible = false; }

  render(waves: readonly Shockwave[], alpha: number, detail: number) {
    for (let index = 0; index < this.slots.length; index++) {
      const slot = this.slots[index], wave = waves[index];
      slot.group.visible = this.ready && wave.active;
      if (!slot.group.visible) continue;
      const radius = THREE.MathUtils.lerp(wave.previousRadius, wave.radius, alpha);
      const progress = THREE.MathUtils.clamp(radius / Math.max(.001, wave.maxRadius), 0, 1);
      const fade = Math.sin(Math.PI * progress) ** .65;
      slot.group.position.set(wave.x, 0, wave.z);
      slot.ring.position.y = .12; slot.echo.position.y = .14;
      slot.ring.scale.setScalar(Math.max(.01, radius * 2.12));
      slot.echo.scale.setScalar(Math.max(.01, radius * 1.72));
      slot.ring.material.opacity = fade * .66;
      slot.echo.material.opacity = fade * .24;
      slot.dust.material.opacity = fade * .22;
      slot.glints.material.opacity = fade * .72;
      const count = detail <= 2 ? 6 : 12;
      slot.dust.count = slot.glints.count = count;
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2 + index * .7;
        const drift = angle + progress * .18;
        const size = (.38 + progress * .62) * (1 + Math.sin(i * 7) * .2);
        this.pose.position.set(Math.cos(drift) * radius, .16 + Math.sin(progress * Math.PI) * .22, Math.sin(drift) * radius);
        this.pose.quaternion.copy(this.cameraRotation); this.pose.rotateZ(angle);
        this.pose.scale.set(size * 1.5, size * .75, 1); this.pose.updateMatrix();
        slot.dust.setMatrixAt(i, this.pose.matrix);
        this.pose.position.set(Math.cos(angle) * radius * .95, .3 + Math.sin(progress * Math.PI + i) * .14, Math.sin(angle) * radius * .95);
        const sparkle = (.12 + .16 * Math.sin(progress * Math.PI)) * (.65 + .35 * Math.sin(i * 3 + wave.age / SKILL_RULES.waveDuration * 9) ** 2);
        this.pose.scale.set(sparkle, sparkle * 1.6, 1); this.pose.updateMatrix();
        slot.glints.setMatrixAt(i, this.pose.matrix);
      }
      slot.dust.instanceMatrix.needsUpdate = slot.glints.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.disposed = true; this.clear(); this.group.removeFromParent();
    this.geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const slot of this.slots) { slot.dust.dispose(); slot.glints.dispose(); }
  }
}
