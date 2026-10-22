import * as THREE from 'three';
import { GigapackView } from './gigapack-view';
import { GIGAPACK_BINDINGS } from './visuals/gigapack-presets';
import { COMBAT_CLARITY, WATER_IMPACT_VISUAL, impactVisualPosition, impactSize, readableEffects } from './combat-clarity';
import { enemyPose } from './enemy-motion';
import { grassBlobPose, grassBlobRoll, grassCrowdMotionScale } from './grass-blob';
import { GrassBlobView } from './grass-blob-view';
import { Combat, COMBAT_LIMITS, ENEMY_TYPES, FORMAL_POUNCE } from './combat';
import { EncounterView } from './encounter-view';
import { SKILL_RULES } from './progression';
import { POUNCE } from './trial';
import { CREATURES } from './party';
import { ATTACKS } from './run-build';
import { EnemyPixelView, ENEMY_PIXEL_HEIGHTS } from './enemy-pixel-view';
import { FirePixelView } from './fire-pixel-view';
import { ParticleFeedbackView } from './particle-feedback';
import { ShockwaveView, NovaView } from './shockwave-view';
import { BarrageView } from './barrage-view';
import { WaterAoeView } from './water-aoe-view';
import { PositionAoeView } from './position-aoe-view';
import { BladeWeaponsView } from './blade-weapons-view';
import { ThunderWeaponView } from './thunder-weapon-view';
import { FrostView } from './frost-view';
import { WaterEvolutionView } from './water-evolution-view';
import { FlameSweepView } from './flame-sweep-view';
import { ReactionView } from './reaction-view';
import { SpecialEnemyView } from './special-enemy-view';
import { BURST_SEED } from './fusion';
import { FUSION_ASSET_ROOT, elementalClip, clipFrame } from './fusion-pixels';
import { VfxResolver, visualProgress } from './visuals/vfx-resolver';
import { instanceOpacity } from './visuals/instance-opacity';

/** All enemies and effects use shared instanced batches: no per-kill GPU allocations. */
export class CombatView {
  private gigapack=new GigapackView();
  readonly vfx = new VfxResolver();
  readonly group = new THREE.Group();
  private grassBlobs = new GrassBlobView();
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private enemyPose = { bob: 0, lean: 0, squash: 0 };
  private enemyMovement = { id: 0, dx: 0, dz: 0 };
  private batches: THREE.InstancedMesh[] = [];
  private body: THREE.InstancedMesh;
  private eyes: THREE.InstancedMesh;
  private horns: THREE.InstancedMesh;
  private shadows: THREE.InstancedMesh;
  private warnings: THREE.InstancedMesh;
  private healthBack: THREE.InstancedMesh;
  private healthFill: THREE.InstancedMesh;
  private bolts: THREE.InstancedMesh;
  private boltCores: THREE.InstancedMesh;
  private gems: THREE.InstancedMesh;
  private gemRings: THREE.InstancedMesh;
  private sparks: THREE.InstancedMesh;
  private target: THREE.InstancedMesh;
  private orbitBalls: THREE.InstancedMesh;
  private orbitCores: THREE.InstancedMesh;
  private orbitPath: THREE.InstancedMesh;
  detail = 4;
  private boltTrails: THREE.InstancedMesh;
  private trailAlpha: THREE.InstancedBufferAttribute;
  private dissolving: THREE.InstancedMesh;
  private shockwaveView = new ShockwaveView();
  private novaView = new NovaView();
  private barrageView = new BarrageView();
  private waterAoeView = new WaterAoeView();
  private positionAoeView = new PositionAoeView(this.waterAoeView.tide, this.waterAoeView.field);
  private bladeWeaponsView = new BladeWeaponsView();
  private thunderWeaponView = new ThunderWeaponView();
  private frostView = new FrostView();
  private waterEvolutionView = new WaterEvolutionView(this.waterAoeView, this.positionAoeView);
  private waveRings: THREE.InstancedMesh;
  private pounceLanes: THREE.InstancedMesh;
  private pounceArrows: THREE.InstancedMesh;
  private recoveryRings: THREE.InstancedMesh;
  private pixelEnemies?: EnemyPixelView;
  private pixelsEnabled = false;
  private firePixels?: FirePixelView;
  private fusionPixels?: FirePixelView;
  private feedback?: ParticleFeedbackView;
  private reactions?: ReactionView;
  private encounters: EncounterView;
  private flameSweep?: FlameSweepView;
  private specialEnemies: SpecialEnemyView;

  constructor(private combat: Combat) {
    this.group.add(this.novaView.group);
    this.group.add(this.barrageView.group);
    this.group.add(this.waterAoeView.group);
    this.group.add(this.positionAoeView.group);
    this.group.add(this.bladeWeaponsView.group);
    this.group.add(this.thunderWeaponView.group);
    this.group.add(this.frostView.group);
    this.group.add(this.gigapack.group);
    this.group.add(this.shockwaveView.group,this.grassBlobs.group);
    this.specialEnemies = new SpecialEnemyView(combat,kind=>this.pixelEnemies?.height(kind)??ENEMY_PIXEL_HEIGHTS[kind]); this.group.add(this.specialEnemies.group);
    this.encounters=new EncounterView(combat); this.group.add(this.encounters.group);
    const lambert = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    const basic = (color: string) => new THREE.MeshBasicMaterial({ color });
    const make = (geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number) => {
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Batches move throughout the whole arena; a stale initial bound must not cull them.
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.batches.push(mesh);
      this.group.add(mesh);
      return mesh;
    };
    const sphere = new THREE.IcosahedronGeometry(1, 1), ring = new THREE.RingGeometry(0.88, 1, 24);
    const plane = new THREE.PlaneGeometry(1, 1);
    this.body = make(sphere, lambert('#ffffff'), COMBAT_LIMITS.enemies);
    this.eyes = make(new THREE.SphereGeometry(1, 6, 4), basic('#253e38'), COMBAT_LIMITS.enemies * 2);
    this.horns = make(new THREE.ConeGeometry(1, 2, 5), lambert('#fff0c4'), COMBAT_LIMITS.enemies * 2);
    this.shadows = make(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: '#25472d', transparent: true, opacity: 0.18, depthWrite: false }), COMBAT_LIMITS.enemies);
    this.warnings = make(ring, new THREE.MeshBasicMaterial({ color: '#ffbb89', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }), COMBAT_LIMITS.enemies);
    this.healthBack = make(plane, basic('#653d3b'), COMBAT_LIMITS.enemies);
    this.healthFill = make(plane, basic('#f5e8b0'), COMBAT_LIMITS.enemies);
    this.boltTrails = make(sphere.clone(), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.42, depthWrite: false }), COMBAT_LIMITS.projectiles * 5);
    this.trailAlpha = instanceOpacity(this.boltTrails as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>, COMBAT_LIMITS.projectiles * 5);
    this.dissolving = make(sphere, lambert('#ffffff'), (COMBAT_LIMITS.effects + COMBAT_LIMITS.enemies) * 4);
    this.bolts = make(sphere, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }), COMBAT_LIMITS.projectiles);
    this.boltCores = make(sphere, basic('#fff6d6'), COMBAT_LIMITS.projectiles);
    this.gems = make(new THREE.OctahedronGeometry(1), basic('#91f7d8'), COMBAT_LIMITS.orbs);
    this.gemRings = make(ring, new THREE.MeshBasicMaterial({ color: '#bdfbdf', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }), COMBAT_LIMITS.orbs);
    this.sparks = make(new THREE.OctahedronGeometry(1), basic('#ffffff'), (COMBAT_LIMITS.effects + COMBAT_LIMITS.enemies) * 4);
    this.target = make(ring, basic('#fff0ac'), 1);
    this.orbitBalls = make(sphere, new THREE.MeshBasicMaterial({ color: '#72dbe5', transparent: true, opacity: 0.65, depthWrite: false }), SKILL_RULES.maxOrbitBalls);
    this.orbitCores = make(sphere, basic('#effffe'), SKILL_RULES.maxOrbitBalls);
    this.orbitPath = make(new THREE.RingGeometry(0.993, 1, 64), new THREE.MeshBasicMaterial({ color: '#b8edf0', transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }), 1);
    this.waveRings = make(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: '#e9f5b0', transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false }), COMBAT_LIMITS.shockwaves);
    this.pounceLanes = make(plane, new THREE.MeshBasicMaterial({ color: '#ffad43', transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false }), COMBAT_LIMITS.enemies);
    this.pounceArrows = make(new THREE.CircleGeometry(1, 3), new THREE.MeshBasicMaterial({ color: '#ffef9c', side: THREE.DoubleSide, depthWrite: false }), COMBAT_LIMITS.enemies);
    this.recoveryRings = make(ring, new THREE.MeshBasicMaterial({ color: '#a5f5da', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }), COMBAT_LIMITS.enemies);
    this.pounceLanes.visible = this.pounceArrows.visible = this.recoveryRings.visible = false;
    // Allocate color attributes before the first render, including empty pooled batches.
    for (const mesh of [this.body, this.sparks, this.dissolving, this.bolts, this.boltTrails]) mesh.setColorAt(0, this.color.set('#ffffff'));
    this.pixelEnemies = new EnemyPixelView(); this.group.add(this.pixelEnemies.group);
    this.group.visible = false;
  }

  private put(mesh: THREE.InstancedMesh, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0, color?: string) {
    if (mesh.count >= mesh.instanceMatrix.count) return;
    const index = mesh.count++;
    this.dummy.position.set(x, y, z);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.rotation.set(rx, ry, rz);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
    if (color) mesh.setColorAt(index, this.color.set(color));
  }

  setPixelEnemies(enabled: boolean) {
    this.pixelsEnabled = enabled;
    if (enabled && !this.pixelEnemies) { this.pixelEnemies = new EnemyPixelView(); this.group.add(this.pixelEnemies.group); }
    if (enabled) this.pixelEnemies?.enableBasics();
    if (this.pixelEnemies) { this.pixelEnemies.group.visible = true; this.pixelEnemies.begin(); }
  }

  updateView(camera: THREE.Camera, viewportHeight: number, frustumHeight: number) { this.gigapack.setView(camera); this.grassBlobs.setView(camera); this.specialEnemies.setView(camera,viewportHeight,frustumHeight); this.flameSweep?.setView(camera); this.shockwaveView.setView(camera); this.encounters.setView(camera); this.pixelEnemies?.setView(camera, viewportHeight, frustumHeight); this.firePixels?.setView(camera); this.fusionPixels?.setView(camera); this.feedback?.setView(camera); this.reactions?.setView(camera); }

  setFusion(enabled: boolean, _elemental = false) {
    if(enabled)this.grassBlobs.enable();
    if (enabled && !this.flameSweep) { this.flameSweep = new FlameSweepView(); this.group.add(this.flameSweep.group, this.flameSweep.areaGroup); }
    this.flameSweep?.clear();
    if (enabled && !this.firePixels) { this.firePixels = new FirePixelView(); this.group.add(this.firePixels.mesh); }
    if (enabled && !this.fusionPixels) { this.fusionPixels = new FirePixelView(FUSION_ASSET_ROOT + 'effects.normalized.png', 8, 4, 'WaterGrassFusionAtlas'); this.group.add(this.fusionPixels.mesh); }
    if (enabled && !this.reactions) { this.reactions = new ReactionView(); this.group.add(this.reactions.group); }
    if (enabled && !this.feedback) { this.feedback = new ParticleFeedbackView(); this.group.add(this.feedback.mesh); }
    this.firePixels?.begin();
    this.fusionPixels?.begin();
    this.feedback?.begin(this.detail);
  }

  render(alpha: number, time: number, player: { x: number; z: number } = { x: this.combat.anchorX, z: this.combat.anchorZ }) {
    if (this.combat.hp > 0) this.waterAoeView.render(this.combat.waterAoe, this.detail); else this.waterAoeView.clear();
    if (this.combat.hp > 0) this.positionAoeView.render(this.combat.positionAoe, this.detail); else this.positionAoeView.clear();
    if (this.combat.hp > 0) this.bladeWeaponsView.render(this.combat.blades, alpha, this.detail); else this.bladeWeaponsView.clear();
    if (this.combat.hp > 0) this.thunderWeaponView.render(this.combat.thunder, this.detail); else this.thunderWeaponView.clear();
    if (this.combat.hp > 0) this.frostView.render(this.combat, alpha, this.detail); else this.frostView.clear();
    if (this.combat.hp > 0) this.waterEvolutionView.render(this.combat.waterEvolution, this.detail); else this.waterEvolutionView.clear();
    this.novaView.render(this.combat.hp > 0 ? this.combat.areaAttacks.novas : [], this.detail);
    this.barrageView.render(this.combat.hp > 0 ? this.combat.areaAttacks.lanes : [], alpha, this.detail);
    this.gigapack.render(this.combat,this.combat.effects);
    this.grassBlobs.render(this.combat);
    this.flameSweep?.render(this.combat,player);
    this.encounters.render(alpha);
    this.specialEnemies.render(alpha);
    for (const mesh of this.batches) mesh.count = 0;
    this.pixelEnemies?.begin();
    this.firePixels?.begin();
    this.fusionPixels?.begin();
    this.feedback?.begin(this.detail);
    // New feedback belongs to the current run mode; legacy visuals stay intact.
    const feedback = this.combat.usesRunBuild ? this.feedback : undefined;
    const grassMotionScale=grassCrowdMotionScale(this.combat.enemies.reduce((n,e)=>n+Number(e.active && e.spawnTime<=0 && e.kind==='normal' && !e.rank),0));
    for (const enemy of this.combat.enemies) {
      if (!enemy.active) continue;
      const type = ENEMY_TYPES[enemy.kind], size = this.combat.enemyRadius(enemy);
      const x = THREE.MathUtils.lerp(enemy.previousX, enemy.x, alpha), z = THREE.MathUtils.lerp(enemy.previousZ, enemy.z, alpha);
      if (enemy.spawnTime > 0) {
        const pulse = 0.9 + Math.sin(time * 10) * 0.1;
        this.put(this.warnings, x, 0.05, z, (size + 0.5) * pulse, (size + 0.5) * pulse, 1, -Math.PI / 2);
        continue;
      }
      if (enemy.rank === 'boss') continue;
      const tall = enemy.kind === 'fast' ? 1.55 : 1.3;
      const frozen = (enemy.freezeTime ?? 0) > 0;
      const motion = enemyPose(enemy.kind, enemy.walkPhase ?? 0, enemy.walkAmount ?? 0, this.enemyPose);
      if(this.combat.encounters.enabled && enemy.kind==='normal' && !enemy.rank && !frozen) grassBlobPose(enemy,motion);
      if (frozen) motion.bob = motion.lean = motion.squash = 0;
      const bob = motion.bob;
      const y = size * tall + bob;
      const color = frozen ? '#a4dcff' : enemy.flash > 0 ? '#fff5d6' : this.combat.hasAttackIntents && enemy.intent === 'windup' ? '#ffba5c' : this.combat.hasAttackIntents && enemy.intent === 'recover' ? '#a3ccb5' : type.color;
      const pixel = (this.pixelsEnabled || enemy.kind === 'tank') && this.pixelEnemies?.ready(enemy.kind);
      if (pixel) {
        const tint = frozen ? '#a4dcff' : enemy.rank === 'elite' ? '#ffd997' : this.combat.hasAttackIntents && enemy.intent === 'windup' ? '#ffba5c' : this.combat.hasAttackIntents && enemy.intent === 'recover' ? '#a3ccb5' : '#ffffff';
        this.enemyMovement.id = enemy.id;
        this.enemyMovement.dx = enemy.walkX ?? 0; this.enemyMovement.dz = enemy.walkZ ?? 0;
        this.pixelEnemies!.put(enemy.kind, x, z, bob, this.combat.usesRunBuild ? Math.min(1, enemy.flash / .16) * .3 : enemy.flash > 0, tint, motion.lean, motion.squash, enemy.rank==='elite'?1.35:1, 1, this.enemyMovement, this.combat.encounters.enabled && enemy.kind==='normal' && !enemy.rank && !frozen ? grassBlobRoll(enemy,grassMotionScale) : 0, frozen);
      } else if (enemy.kind !== 'tank') this.put(this.body, x, y, z, size, size * tall, size, 0, enemy.facing, 0, color);
      this.put(this.shadows, x, 0.04, z, size * 1.1, size * 0.8, 1, -Math.PI / 2);
      const fx = Math.sin(enemy.facing), fz = Math.cos(enemy.facing);
      if (!pixel && enemy.kind !== 'tank') for (const side of [-1, 1]) {
        this.put(this.eyes, x + fx * size * 0.87 + fz * size * 0.35 * side, y + size * 0.25, z + fz * size * 0.87 - fx * size * 0.35 * side, size * 0.105, size * 0.18, size * 0.105);
        const hornSize = enemy.kind === 'fast' ? 0.35 : 0.18;
        this.put(this.horns, x + side * fz * size * 0.6, y + size * tall * 0.85, z - side * fx * size * 0.6, size * 0.22, hornSize, size * 0.22, 0, enemy.facing, -side * 0.3);
      }
      const maxHp = this.combat.enemyHealth(enemy);
      if (enemy.hp < maxHp) {
        const fraction = enemy.hp / maxHp, width = size * 2;
        let bx = x, by = y + size * tall + 0.35, bz = z;
        if (pixel) { const head = this.pixelEnemies!.head(enemy.kind, x, z, bob); bx = head.x; by = head.y; bz = head.z; }
        this.put(this.healthBack, bx, by, bz, width, 0.075, 1, -0.55);
        this.put(this.healthFill, bx - width * (1 - fraction) / 2, by + 0.005, bz + 0.01, width * fraction, 0.052, 1, -0.55);
      }
      if (enemy.id === this.combat.targetId) this.put(this.target, x, 0.055, z, size + 0.2, size + 0.2, 1, -Math.PI / 2, 0, time);
      if (this.combat.hasAttackIntents) {
        if (enemy.kind==='fast' && (enemy.intent === 'windup' || enemy.intent === 'pounce')) {
          const rule=this.combat.encounters.enabled?FORMAL_POUNCE:POUNCE;
          const length = rule.speed * rule.duration, angle = Math.atan2(enemy.aimX, enemy.aimZ);
          this.put(this.pounceLanes, x + enemy.aimX * length / 2, 0.075, z + enemy.aimZ * length / 2, 0.9, length, 1, -Math.PI / 2, 0, angle);
          this.put(this.pounceArrows, x + enemy.aimX * length, 0.085, z + enemy.aimZ * length, 0.4, 0.4, 1, -Math.PI / 2, 0, angle - Math.PI / 2);
        }
        if(this.combat.encounters.enabled && enemy.kind!=='fast' && enemy.kind!=='normal' && !enemy.rank && (enemy.intent==='windup'||enemy.intent==='pounce')) {
          // Circular stationary danger for red blobs; directional lanes belong
          // exclusively to fast sprinters. Ground ring matches actual hit radius.
          const warningRadius = size + .62;
          this.put(this.warnings,x,.09,z,warningRadius,warningRadius,1,-Math.PI/2);
        }
        if (enemy.intent === 'recover' || enemy.stagger > 0) this.put(this.recoveryRings, x, 0.08, z, size + 0.3, size + 0.3, 1, -Math.PI / 2);
      }
    }
    for (const shot of this.combat.projectiles) {
      if(this.gigapack.handlesProjectile(shot.vfxPresetId))continue;
      if (!shot.active || this.combat.hp <= 0) continue;
      if (shot.attackId === 'frost-crystal' && !shot.vfxPresetId) continue;
      const x = THREE.MathUtils.lerp(shot.previousX, shot.x, alpha), z = THREE.MathUtils.lerp(shot.previousZ, shot.z, alpha), angle = Math.atan2(shot.vx, shot.vz);
      const attack = shot.species || this.combat.fusionEnabled ? shot.attackId ?? (shot.species ? CREATURES[shot.species].skill : undefined) : undefined;
      const preset = this.combat.usesRunBuild ? this.vfx.projectile(attack,shot.vfxPresetId) : undefined;
      const pair=shot.attackRules?.pairId;
      const color = pair?(pair==='steam-comet'?'#b9edff':pair==='blazing-thorn'?'#ffae43':'#6de3af'):preset?.color ?? (attack ? ATTACKS[attack].color : '#a594f2');
      const bubble = attack === 'bubble', leaf = attack === 'leaf';
      const child = shot.generation === 1, scale = (child ? BURST_SEED.childSize : 1) * (preset?.scale ?? 1);
      const clip = shot.vfxPresetId || pair ? undefined : elementalClip(shot.fusionIds?.[0] ?? (child && leaf ? 'thorn-scatter' : undefined));
      if (clip && this.fusionPixels?.loaded && (!preset || this.detail > 2 || preset.low.animated)) {
        const frame = clipFrame(clip.flight, shot.age ?? 0, clip.flightFPS, true)!;
        const arc = shot.hopTargetId ? Math.sin(Math.PI * Math.min(1, (shot.hopElapsed ?? 0) / (shot.hopDuration || .12))) * .55 : 0;
        this.fusionPixels.put(clip.row, frame, x, 1.15 + arc, z, (child ? COMBAT_CLARITY.childSize : COMBAT_CLARITY.projectileSize) * (preset?.scale ?? 1), shot.vx, shot.vz, false, clip.row === 2 ? (shot.age ?? 0) * 8 : 0);
      }
      else if (!pair && preset?.animation && (this.detail > 2 || preset.low.animated)
        && (preset.animation.atlas === 'fire' ? this.firePixels : this.fusionPixels)?.loaded) {
        const a = preset.animation, batch = a.atlas === 'fire' ? this.firePixels! : this.fusionPixels!;
        batch.put(child ? a.childRow ?? a.row : a.row, clipFrame(a.frames, shot.age ?? 0, a.fps, true)!, x, 1.15, z,
          (child ? COMBAT_CLARITY.childSize : COMBAT_CLARITY.projectileSize) * preset.scale, shot.vx, shot.vz, false, 0, preset.color);
      }
      else if (!pair && !preset && this.combat.fusionEnabled && !bubble && !leaf && this.firePixels?.loaded) this.firePixels.put(child ? 1 : 0, Math.floor((shot.age ?? 0) * 12) % 4, x, 1.15, z, child ? COMBAT_CLARITY.childSize : COMBAT_CLARITY.projectileSize, shot.vx, shot.vz);
      else {
        this.put(this.bolts, x, 1.15, z, (bubble ? 0.34 : 0.22) * scale, (leaf ? 0.09 : bubble ? 0.34 : 0.22) * scale, (bubble ? 0.34 : leaf ? 0.65 : 0.48) * scale, 0, angle, 0, color);
        this.put(this.boltCores, x + Math.sin(angle) * 0.12, 1.15, z + Math.cos(angle) * 0.12, 0.12 * scale, 0.12 * scale, 0.3 * scale, 0, angle);
      }
      if (preset && this.detail <= 2 && !preset.low.trail) continue;
      if (feedback?.trail(shot, x, z, color, scale, preset)) continue;
      // Fixed-capacity fallback, also retained for curved elemental hops.
      for (let i = 1; i <= (this.combat.usesRunBuild ? 1 : this.detail + 1); i++) {
        if (shot.hopTargetId && !shot.hopDelay) {
          const t = Math.max(0, ((shot.hopElapsed ?? 0) / (shot.hopDuration || .12)) - i * .06);
          const current = Math.max(.001, (shot.hopElapsed ?? 0) / (shot.hopDuration || .12));
          const ratio = Math.min(1, t / current), size = .11 * (1 - i / 7);
          this.put(this.boltTrails, (shot.hopFromX ?? x) + (x - (shot.hopFromX ?? x)) * ratio, 1.15 + Math.sin(t * Math.PI) * .55, (shot.hopFromZ ?? z) + (z - (shot.hopFromZ ?? z)) * ratio, size, size, size, 0, 0, 0, color);
          this.trailAlpha.setX(this.boltTrails.count - 1, preset?.trail.opacity ?? 1);
          continue;
        }
        const distance = i * (preset ? preset.trail.length * scale * .43 : .28);
        if (preset && (!preset.trail.opacity || !preset.trail.length)) break;
        if (distance > shot.distance) break;
        const size = 0.17 * (1 - i / 7) * scale;
        this.put(this.boltTrails, x - Math.sin(angle) * distance, 1.15, z - Math.cos(angle) * distance, size, size, 0.24, 0, angle, 0, preset?.trail.color ?? (shot.species ? color : '#cfb7ff'));
        this.trailAlpha.setX(this.boltTrails.count - 1, preset?.trail.opacity ?? 1);
      }
    }
    const stats = this.combat.stats;
    if (stats.orbitCount > 0) {
      const angle = THREE.MathUtils.lerp(this.combat.previousOrbitAngle, this.combat.orbitAngle, alpha);
      this.put(this.orbitPath, player.x, 0.065, player.z, stats.orbitRadius, stats.orbitRadius, 1, -Math.PI / 2);
      for (let i = 0; i < stats.orbitCount; i++) {
        const phase = angle + i / stats.orbitCount * Math.PI * 2;
        const x = player.x + Math.cos(phase) * stats.orbitRadius, z = player.z + Math.sin(phase) * stats.orbitRadius;
        this.put(this.orbitBalls, x, 0.95, z, 0.3, 0.3, 0.3, 0, time);
        this.put(this.orbitCores, x, 0.95, z, 0.14, 0.14, 0.14, 0, -time);
      }
    }
    this.shockwaveView.render(this.combat.shockwaves, alpha, this.detail);
    for (const wave of this.combat.shockwaves) {
      if (!wave.active || this.shockwaveView.ready) continue;
      const radius = THREE.MathUtils.lerp(wave.previousRadius, wave.radius, alpha);
      this.put(this.waveRings, wave.x, 0.1, wave.z, radius, radius, 1, -Math.PI / 2);
    }
    for (let index = 0; index < this.combat.orbs.length; index++) {
      const orb = this.combat.orbs[index];
      if (!orb.active) continue;
      const x = THREE.MathUtils.lerp(orb.previousX, orb.x, alpha), z = THREE.MathUtils.lerp(orb.previousZ, orb.z, alpha);
      const size = Math.min(0.34, 0.18 + Math.log2(orb.value + 1) * 0.025);
      this.put(this.gems, x, 0.4 + Math.sin(time * 3 + index) * 0.08, z, size, size * 1.4, size, 0, time + index);
      this.put(this.gemRings, x, 0.045, z, size * 1.4, size * 1.4, 1, -Math.PI / 2);
    }
    const visibleEffects = [...(this.combat.usesRunBuild ? readableEffects(this.combat.effects) : this.combat.effects), ...this.combat.areaDeaths.filter(e => e.active)];
    this.reactions?.render(this.combat.usesRunBuild && this.combat.hp > 0 ? visibleEffects : [], this.combat.usesRunBuild && this.combat.hp > 0 ? this.combat.enemies : [], this.detail, this.vfx);
    for (const effect of visibleEffects) {
      if(effect.vfxPresetId&&GIGAPACK_BINDINGS[effect.vfxPresetId])continue;
      if (!effect.active || this.combat.hp <= 0) continue;
      if (this.combat.usesRunBuild && effect.kind === 'collect') continue;
      const progress = 1 - effect.time / effect.duration;
      // Keep the combat contact fixed; only water's billboard moves onto/with the struck body.
      const target = effect.kind === 'water' && effect.enemyId !== undefined
        ? this.combat.enemies.find(enemy => enemy.id === effect.enemyId) : undefined;
      const visual = impactVisualPosition(effect, target ? {
        x: THREE.MathUtils.lerp(target.previousX, target.x, alpha),
        z: THREE.MathUtils.lerp(target.previousZ, target.z, alpha),
      } : undefined);
      const preset = this.combat.usesRunBuild ? this.vfx.impact(effect.kind, effect.vfxPresetId) : undefined;
      feedback?.embers(effect, preset);
      const clip = elementalClip(effect.fusionId);
      if (clip?.impact.length && this.fusionPixels?.loaded && (!preset || this.detail > 2 || preset.low.animated)) {
        const frame = clipFrame(clip.impact, effect.duration - effect.time, clip.impactFPS, false);
        if (frame !== undefined) {
          const baseSize = impactSize(effect);
          const size = baseSize * (effect.kind === 'water'
            ? effect.enemyKind === 'tank' ? WATER_IMPACT_VISUAL.tankScale : WATER_IMPACT_VISUAL.normalScale : 1);
          const enemyHeight = this.pixelEnemies?.height(effect.enemyKind)
            ?? (effect.enemyKind === 'tank' ? 2.3 : effect.enemyKind === 'fast' ? 1.45 : 1.7);
          const height = effect.kind === 'water' ? enemyHeight * WATER_IMPACT_VISUAL.heightRatio : 1.7;
          this.fusionPixels.put(clip.row, frame, visual.x, height, visual.z, size);
        }
        continue;
      }
      if (effect.kind === 'steam') {
        if (!effect.vfxPresetId && progress < .42) this.firePixels?.put(2, Math.min(3, Math.floor(progress * 8)), effect.x, .8, effect.z, Math.min(3.2, (effect.radius ?? 2.5) * 1.3));
        continue;
      }
      if (preset?.animation && (this.detail > 2 || preset.low.animated)) {
        const a = preset.animation, batch = a.atlas === 'fire' ? this.firePixels : this.fusionPixels;
        if (batch?.loaded) {
          const progress = visualProgress(effect, preset.duration);
          if (progress < 1) batch.put(a.row, a.frames[Math.min(a.frames.length - 1, Math.floor((effect.duration - effect.time) * a.fps))],
            visual.x, preset.height ?? 1.3, visual.z, impactSize(effect) * preset.radiusScale, 0, 0, false, 0, preset.color);
          continue;
        }
      }
      if (effect.kind === 'burst') {
        const radius = effect.radius ?? BURST_SEED.explosionRadius;
        if (!preset && this.firePixels?.loaded) {
          const frame = Math.min(3, Math.floor(progress * 4));
          this.firePixels.put(2, frame, effect.x, 1.3, effect.z, this.combat.usesRunBuild ? impactSize(effect) : Math.min(COMBAT_CLARITY.impactSize, radius * 2));
          continue;
        }
      }
      if (effect.kind === 'death') {
        if ((this.pixelsEnabled || effect.enemyKind === 'tank') && this.pixelEnemies?.ready(effect.enemyKind)) {
          const fade = Math.max(0, 1 - progress);
          this.enemyMovement.id = effect.enemyId ?? 0;
          this.enemyMovement.dx = effect.moveX ?? 0; this.enemyMovement.dz = effect.moveZ ?? 0;
          this.pixelEnemies.put(effect.enemyKind, effect.x, effect.z, 0, false, '#ffffff', 0, 0, .35 + fade * .65, fade, this.enemyMovement);
          continue;
        }
        const type = ENEMY_TYPES[effect.enemyKind];
        for (let i = 0; i < this.detail; i++) {
          const angle = i / this.detail * Math.PI * 2, size = type.radius * 0.65 * (1 - progress) ** 1.4;
          this.put(this.dissolving, effect.x + Math.sin(angle) * progress * 0.7, type.radius + progress * 0.9, effect.z + Math.cos(angle) * progress * 0.7, size, size * 1.2, size, progress * 3, angle, progress * 4, type.color);
        }
      }
      const color = effect.kind === 'water' ? '#65dcff' : effect.kind === 'thorn' ? '#a5ec69' : effect.kind === 'burst' ? '#ffac48' : effect.kind === 'hurt' ? '#f7a08d' : effect.kind === 'collect' ? '#9cffe2' : effect.kind === 'death' ? '#ffe3a6' : '#f4ddff';
      if (feedback?.impact(effect, visual.x, visual.z, preset)) continue;
      const fallbackProgress = preset ? visualProgress(effect, preset.duration) : progress;
      if (fallbackProgress >= 1 || preset && (!preset.particles || this.detail <= 2 && !preset.low.particles)) continue;
      for (let i = 0; i < this.detail; i++) {
        const angle = i / this.detail * Math.PI * 2 + 0.4, size = (1 - fallbackProgress) * 0.15 * (preset?.radiusScale ?? 1);
        this.put(this.sparks, visual.x + Math.sin(angle) * fallbackProgress * 0.9, (preset?.height ?? .7) + Math.sin(fallbackProgress * Math.PI) * 0.6, visual.z + Math.cos(angle) * fallbackProgress * 0.9, size, size * 1.7, size, 0, angle, fallbackProgress * 5, preset ? i % 2 ? preset.secondaryColor : preset.color : color);
      }
    }
    for (const mesh of this.batches) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    for (const mesh of [this.pounceLanes, this.pounceArrows, this.recoveryRings]) mesh.visible = mesh.count > 0;
    this.pixelEnemies?.finish();
    this.firePixels?.finish();
    this.fusionPixels?.finish();
    this.feedback?.finish();
    this.trailAlpha.needsUpdate = true;
  }

  clear() { this.frostView.clear(); this.thunderWeaponView.clear(); this.bladeWeaponsView.clear(); this.waterEvolutionView.clear(); this.positionAoeView.clear(); this.waterAoeView.clear(); this.barrageView.clear(); this.novaView.clear(); this.gigapack.clear(); this.reactions?.clear(); this.grassBlobs.clear(); this.specialEnemies.clear(); this.flameSweep?.clear(); this.shockwaveView.clear(); this.encounters.clear(); for (const mesh of this.batches) mesh.count = 0; this.pixelEnemies?.begin(); this.pixelEnemies?.resetDirections(); this.firePixels?.begin(); this.fusionPixels?.begin(); this.feedback?.begin(); }
  inspectElemental() { return this.fusionPixels?.inspect(); }
  inspectFusion() { return this.firePixels?.inspect(); }
  inspect() { return { frost: this.frostView.inspect(), thunder: this.thunderWeaponView.inspect(), blades: this.bladeWeaponsView.inspect(), waterEvolution: this.waterEvolutionView.inspect(), positionAoe: this.positionAoeView.inspect(), waterAoe: this.waterAoeView.inspect(), barrage: this.barrageView.inspect(), nova: this.novaView.inspect(), gigapack:this.gigapack.inspect(), reactions:this.reactions?.inspect(), grass:this.grassBlobs.inspect(), enabled: this.pixelsEnabled, ...this.pixelEnemies?.inspect(), specialEnemies:this.specialEnemies.inspect(), melee:this.flameSweep?.inspect(), encounters:this.encounters.inspect(), feedback:this.feedback?.inspect() }; }
  dispose() { this.frostView.dispose(); this.thunderWeaponView.dispose(); this.bladeWeaponsView.dispose(); this.positionAoeView.dispose(); this.waterAoeView.dispose(); this.barrageView.dispose(); this.novaView.dispose(); this.gigapack.dispose(); this.reactions?.dispose(); this.reactions = undefined; this.grassBlobs.dispose(); this.specialEnemies.dispose(); this.flameSweep?.dispose(); this.flameSweep = undefined; this.shockwaveView.dispose(); this.encounters.dispose(); this.pixelEnemies?.dispose(); this.pixelEnemies = undefined; this.firePixels?.dispose(); this.firePixels = undefined; this.fusionPixels?.dispose(); this.fusionPixels = undefined; this.feedback?.dispose(); this.feedback = undefined; }
}
