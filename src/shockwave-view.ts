import * as THREE from 'three';
import { COMBAT_LIMITS, type Shockwave } from './combat';
import { SKILL_RULES } from './progression';

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
