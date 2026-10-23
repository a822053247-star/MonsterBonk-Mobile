import * as THREE from 'three';

/** Star Seal Capture: visual-only capture VFX. It never mutates combat rules or rewards. */
export type StarSealResult = 'success' | 'failure' | 'cancelled';
export type StarSealPhase = 'startup' | 'converge' | 'waiting' | 'success' | 'failure' | 'done';

export interface StarSealOptions {
  /** Scene/world-space root of the real enemy. Its world position is sampled every update. */
  target: THREE.Object3D;
  /** Called once, and only after the success animation has fully completed. */
  onSuccess?: () => void;
  /** Called once for a completed success/failure; never called for cancellation. */
  onComplete?: (result: StarSealResult) => void;
  /** Optional world-space offset from the target origin. */
  groundOffset?: THREE.Vector3;
  /** Capture VFX scale, independent of the enemy's collision size. */
  scale?: number;
}

export interface StarSealSession {
  readonly id: number;
  readonly phase: StarSealPhase;
  readonly result: StarSealResult | null;
  succeed(): void;
  fail(): void;
  cancel(): void;
}

const TAU = Math.PI * 2;
const STARTUP = 0.26;
const CONVERGE = 0.56;
const SUCCESS = 0.52;
const FAILURE = 0.40;
const PARTICLES = 24;
const RUNES = 12;
const SHARDS = 12;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - THREE.MathUtils.clamp(t, 0, 1), 3);
const easeInOut = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

interface Slot {
  root: THREE.Group;
  floor: THREE.Group;
  ringA: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  ringB: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  inner: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  runes: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>[];
  particles: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>[];
  shards: THREE.Mesh<THREE.TetrahedronGeometry, THREE.MeshBasicMaterial>[];
  orb: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  orbHalo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  materials: { ringBlue: THREE.MeshBasicMaterial; ringGold: THREE.MeshBasicMaterial; innerCyan: THREE.MeshBasicMaterial; runeGold: THREE.MeshBasicMaterial; particleBlue: THREE.MeshBasicMaterial; particleCyan: THREE.MeshBasicMaterial; particleGold: THREE.MeshBasicMaterial; shard: THREE.MeshBasicMaterial; orb: THREE.MeshBasicMaterial; orbHalo: THREE.MeshBasicMaterial };
  target: THREE.Object3D | null;
  baseScale: THREE.Vector3;
  baseVisible: boolean;
  groundOffset: THREE.Vector3;
  v3: THREE.Vector3;
  v3b: THREE.Vector3;
  elapsed: number;
  phase: StarSealPhase;
  requested: 'success' | 'failure' | null;
  result: StarSealResult | null;
  scale: number;
  onSuccess?: () => void;
  onComplete?: (result: StarSealResult) => void;
  successCalled: boolean;
  completionCalled: boolean;
  disposed: boolean;
}

/**
 * Reusable Three.js capture-effect pool.
 * Call update(dt, paused) from the render loop; dt is seconds, and paused frames freeze.
 * Shared geometry is allocated once per system; pooled slots retain their meshes/materials.
 */
export class StarSealCaptureSystem {
  readonly group = new THREE.Group();
  private readonly geometry = {
    ring: new THREE.TorusGeometry(1, .025, 5, 64),
    thinRing: new THREE.TorusGeometry(1, .009, 4, 64),
    rune: new THREE.OctahedronGeometry(.085, 0),
    particle: new THREE.OctahedronGeometry(.045, 0),
    shard: new THREE.TetrahedronGeometry(.13, 0),
    orb: new THREE.SphereGeometry(.14, 12, 8),
  };
  private readonly materials = {
    blue: new THREE.MeshBasicMaterial({ color: '#7168ff', transparent: true, opacity: .8, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
    cyan: new THREE.MeshBasicMaterial({ color: '#63eaff', transparent: true, opacity: .78, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
    gold: new THREE.MeshBasicMaterial({ color: '#ffc96b', transparent: true, opacity: .9, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
    shard: new THREE.MeshBasicMaterial({ color: '#9a91ff', transparent: true, opacity: .9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    orb: new THREE.MeshBasicMaterial({ color: '#80eaff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
  };
  private readonly slots: Slot[] = [];
  private nextId = 1;
  private disposed = false;

  constructor(parent: THREE.Object3D, capacity = 3) {
    this.group.name = 'StarSealCaptureVFX';
    parent.add(this.group);
    for (let i = 0; i < Math.max(1, Math.floor(capacity)); i++) this.slots.push(this.makeSlot());
  }

  start(options: StarSealOptions): StarSealSession {
    if (this.disposed) throw new Error('StarSealCaptureSystem has been disposed');
    const slot = this.slots.find(s => !s.target && s.phase === 'done');
    if (!slot) throw new Error('Star Seal pool is full; increase capacity or cancel an active session');
    slot.target = options.target;
    slot.baseScale.copy(options.target.scale); slot.baseVisible = options.target.visible;
    slot.groundOffset.copy(options.groundOffset ?? new THREE.Vector3(0, 0, 0));
    slot.elapsed = 0; slot.phase = 'startup'; slot.requested = null; slot.result = null;
    slot.scale = Math.max(.25, options.scale ?? 1);
    slot.onSuccess = options.onSuccess; slot.onComplete = options.onComplete;
    slot.successCalled = false; slot.completionCalled = false; slot.disposed = false;
    slot.root.visible = true; slot.floor.visible = true;
    for (const p of slot.particles) p.visible = true;
    for (const r of slot.runes) r.visible = true;
    for (const sh of slot.shards) sh.visible = false;
    slot.orb.visible = false; slot.orbHalo.visible = false;
    const id = this.nextId++;
    const session: StarSealSession = {
      id,
      get phase() { return slot.phase; },
      get result() { return slot.result; },
      succeed: () => this.requestResult(slot, 'success'),
      fail: () => this.requestResult(slot, 'failure'),
      cancel: () => this.cancelSlot(slot),
    };
    return session;
  }

  /** A pause flag freezes effect clocks, target scaling, particles, and all phase transitions. */
  update(dtSeconds: number, paused = false) {
    if (this.disposed || paused || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
    const dt = Math.min(dtSeconds, .05);
    for (const s of this.slots) {
      if (!s.target || s.phase === 'done') continue;
      if (!s.target.parent) { this.cancelSlot(s); continue; }
      s.elapsed += dt;
      this.positionAtTarget(s);
      switch (s.phase) {
        case 'startup': this.updateStartup(s); if (s.elapsed >= STARTUP) { s.elapsed -= STARTUP; s.phase = 'converge'; } break;
        case 'converge': this.updateConverge(s); if (s.elapsed >= CONVERGE) { s.elapsed -= CONVERGE; s.phase = 'waiting'; } break;
        case 'waiting': this.updateWaiting(s); if (s.requested) this.enterResult(s, s.requested); break;
        case 'success': this.updateSuccess(s); if (s.elapsed >= SUCCESS) this.finish(s, 'success'); break;
        case 'failure': this.updateFailure(s); if (s.elapsed >= FAILURE) this.finish(s, 'failure'); break;
      }
    }
  }

  /** Cancels every active session; restores target scale and suppresses result callbacks. */
  clear() { for (const s of this.slots) if (s.target) this.cancelSlot(s); }

  inspect() {
    return { capacity: this.slots.length, active: this.slots.filter(s => !!s.target && s.phase !== 'done').length,
      phases: this.slots.filter(s => !!s.target).map(s => s.phase), disposed: this.disposed };
  }

  dispose() {
    if (this.disposed) return;
    this.clear(); this.disposed = true;
    for (const s of this.slots) {
      s.root.removeFromParent();
      Object.values(s.materials).forEach(m => m.dispose());
    }
    this.group.removeFromParent();
    Object.values(this.geometry).forEach(g => g.dispose());
    Object.values(this.materials).forEach(m => m.dispose());
    this.slots.length = 0;
  }

  private makeSlot(): Slot {
    const root = new THREE.Group(); root.name = 'StarSealSlot'; this.group.add(root);
    const floor = new THREE.Group(); floor.name = 'StarSealGroundSigil'; root.add(floor);
    // Per-slot material clones are allocated once, so concurrent sessions animate independently.
    const materials = { ringBlue: this.materials.blue.clone(), ringGold: this.materials.gold.clone(), innerCyan: this.materials.cyan.clone(), runeGold: this.materials.gold.clone(), particleBlue: this.materials.blue.clone(), particleCyan: this.materials.cyan.clone(), particleGold: this.materials.gold.clone(), shard: this.materials.shard.clone(), orb: this.materials.orb.clone(), orbHalo: this.materials.gold.clone() };
    const ringA = new THREE.Mesh(this.geometry.ring, materials.ringBlue); const ringB = new THREE.Mesh(this.geometry.ring, materials.ringGold);
    const inner = new THREE.Mesh(this.geometry.thinRing, materials.innerCyan);
    for (const ring of [ringA, ringB, inner]) { ring.rotation.x = Math.PI / 2; floor.add(ring); }
    const runes: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>[] = [];
    for (let i = 0; i < RUNES; i++) {
      const rune = new THREE.Mesh(this.geometry.rune, materials.runeGold);
      rune.rotation.set(Math.PI / 2, 0, i * TAU / RUNES); floor.add(rune); runes.push(rune);
    }
    const particles: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>[] = [];
    for (let i = 0; i < PARTICLES; i++) {
      const m = new THREE.Mesh(this.geometry.particle, i % 3 === 0 ? materials.particleGold : i % 2 ? materials.particleCyan : materials.particleBlue);
      root.add(m); particles.push(m);
    }
    const shards: THREE.Mesh<THREE.TetrahedronGeometry, THREE.MeshBasicMaterial>[] = [];
    for (let i = 0; i < SHARDS; i++) { const m = new THREE.Mesh(this.geometry.shard, materials.shard); floor.add(m); m.visible = false; shards.push(m); }
    const orb = new THREE.Mesh(this.geometry.orb, materials.orb); root.add(orb); orb.visible = false;
    const orbHalo = new THREE.Mesh(this.geometry.thinRing, materials.orbHalo); orbHalo.rotation.x = Math.PI / 2; root.add(orbHalo); orbHalo.visible = false;
    root.visible = false;
    return { root, floor, ringA, ringB, inner, runes, particles, shards, orb, orbHalo, materials, target: null,
      baseScale: new THREE.Vector3(1,1,1), baseVisible: true, groundOffset: new THREE.Vector3(), v3: new THREE.Vector3(), v3b: new THREE.Vector3(),
      elapsed: 0, phase: 'done', requested: null, result: null, scale: 1, successCalled: false, completionCalled: false, disposed: false };
  }

  private positionAtTarget(s: Slot) {
    if (!s.target) return;
    s.target.getWorldPosition(s.v3);
    s.root.position.copy(s.v3).add(s.groundOffset);
    // The VFX system's parent may be transformed; convert world anchor into its local coordinates.
    this.group.worldToLocal(s.root.position);
    s.floor.position.set(0, .035, 0);
  }

  private requestResult(s: Slot, result: 'success' | 'failure') {
    if (!s.target || s.phase === 'done' || s.phase === 'success' || s.phase === 'failure' || s.requested) return;
    s.requested = result;
    if (s.phase === 'waiting') this.enterResult(s, result);
  }

  private enterResult(s: Slot, result: 'success' | 'failure') {
    s.requested = null; s.elapsed = 0; s.phase = result;
    if (result === 'success') {
      for (const p of s.particles) p.visible = true;
      s.orb.visible = true; s.orbHalo.visible = true;
    } else {
      for (const sh of s.shards) sh.visible = true;
      s.orb.visible = s.orbHalo.visible = false;
    }
  }

  private updateStartup(s: Slot) {
    const t = THREE.MathUtils.clamp(s.elapsed / STARTUP, 0, 1), e = easeOutCubic(t);
    s.floor.scale.setScalar(s.scale * (.18 + .82 * e));
    s.ringA.scale.setScalar(.55 + .45 * e); s.ringA.material.opacity = .82 * (1 - t * .12);
    s.ringB.scale.setScalar(.34 + .66 * e); s.ringB.rotation.z = t * .8;
    s.inner.scale.setScalar(.25 + .75 * e); s.inner.material.opacity = .6 + .3 * Math.sin(t * Math.PI);
    this.layoutRunes(s, t, 1.25, .5 + .5 * e);
    this.layoutParticles(s, t, .55, 1 - t * .25);
    if (s.target) {
      const bump = 1 + Math.sin(t * Math.PI) * .055;
      s.target.scale.copy(s.baseScale).multiplyScalar(bump);
    }
  }

  private updateConverge(s: Slot) {
    const t = THREE.MathUtils.clamp(s.elapsed / CONVERGE, 0, 1), e = easeInOut(t);
    s.floor.scale.setScalar(s.scale * (1.12 - .18 * e));
    s.ringA.scale.setScalar(1.18 - .36 * e); s.ringA.rotation.z += .035 + .10 * t;
    s.ringB.scale.setScalar(.96 - .44 * e); s.ringB.rotation.z -= .055 + .16 * t;
    s.inner.scale.setScalar(.9 - .58 * e); s.inner.rotation.z += .08;
    s.ringA.material.opacity = .68 + .22 * t; s.ringB.material.opacity = .55 + .4 * t;
    this.layoutRunes(s, t, 1.25 - .48 * e, 1);
    this.layoutParticles(s, t, 1.15 - .75 * e, .95 + .05 * Math.sin(t * 12));
    if (s.target) {
      const pulse = 1 + Math.sin(t * Math.PI * 5) * .018;
      s.target.scale.copy(s.baseScale).multiplyScalar(pulse);
    }
  }

  private updateWaiting(s: Slot) {
    const t = s.elapsed;
    s.ringA.rotation.z += .012; s.ringB.rotation.z -= .018; s.inner.rotation.z += .025;
    s.ringA.material.opacity = .72 + .12 * Math.sin(t * 7);
    s.ringB.material.opacity = .68 + .16 * Math.sin(t * 9 + 1);
    this.layoutRunes(s, t, .76, .8 + .2 * Math.sin(t * 5));
    this.layoutParticles(s, t, .42, .65 + .25 * Math.sin(t * 8));
    if (s.target) s.target.scale.copy(s.baseScale);
  }

  private updateSuccess(s: Slot) {
    const t = THREE.MathUtils.clamp(s.elapsed / SUCCESS, 0, 1), e = easeOutCubic(t);
    s.floor.scale.setScalar(s.scale * (1 - e)); s.floor.visible = t < .82;
    s.ringA.scale.setScalar(Math.max(.01, 1 - e * 1.2)); s.ringB.scale.setScalar(Math.max(.01, 1 - e * 1.1));
    s.ringA.material.opacity = .85 * (1 - t); s.ringB.material.opacity = .8 * (1 - t);
    this.layoutParticles(s, t, .8 * (1 - e), 1 - t);
    s.orb.scale.setScalar(.2 + .8 * easeOutBack(Math.min(1, t * 2.2)));
    s.orb.material.opacity = .88 * Math.min(1, t * 5) * (1 - Math.max(0, t - .7) * 2.5);
    s.orb.position.set(0, .6 + .65 * e, 0);
    s.orbHalo.position.copy(s.orb.position); s.orbHalo.scale.setScalar(.25 + .8 * (1 - t)); s.orbHalo.material.opacity = .9 * (1 - t * .8);
    if (s.target) {
      const vanish = 1 - easeInOut(Math.min(1, t * 1.15));
      const squash = 1 + Math.sin(t * Math.PI * 4) * .025;
      s.target.scale.set(s.baseScale.x * vanish * squash, s.baseScale.y * vanish * (1 + .05 * Math.sin(t * Math.PI * 2)), s.baseScale.z * vanish * squash);
      if (t >= .94) s.target.visible = false;
    }
    for (let i = 0; i < s.particles.length; i++) {
      const p = s.particles[i], a = i / s.particles.length * TAU + t * 7;
      p.position.set(Math.cos(a) * (.45 * (1 - t)), .2 + t * 1.7 + Math.sin(a * 2) * .1, Math.sin(a) * (.45 * (1 - t)));
      p.scale.setScalar(.8 * (1 - t));
    }
  }

  private updateFailure(s: Slot) {
    const t = THREE.MathUtils.clamp(s.elapsed / FAILURE, 0, 1), spread = easeOutCubic(t);
    s.ringA.scale.setScalar(1 + spread * .5); s.ringB.scale.setScalar(.75 + spread * .8); s.inner.scale.setScalar(1 + spread);
    s.ringA.material.opacity = .8 * (1 - t); s.ringB.material.opacity = .8 * (1 - t); s.inner.material.opacity = .7 * (1 - t);
    s.floor.rotation.z = Math.sin(t * 28) * .035 * (1 - t);
    for (let i = 0; i < s.shards.length; i++) {
      const shard = s.shards[i], a = i / s.shards.length * TAU + .15;
      shard.position.set(Math.cos(a) * (.6 + spread * 1.1), .08 + spread * (.3 + (i % 3) * .12), Math.sin(a) * (.6 + spread * 1.1));
      shard.rotation.set(a, a * 1.7 + t * 3, a * .6);
      shard.scale.setScalar(Math.max(.001, .22 * (1 - t)));
      shard.material.opacity = 1 - t;
    }
    this.layoutParticles(s, t, .8 + spread, 1 - t);
    if (s.target) {
      const shake = Math.sin(t * 42) * .045 * (1 - t);
      s.target.scale.copy(s.baseScale).multiplyScalar(1 + Math.sin(t * Math.PI) * .035);
      s.root.position.x += shake * .12;
    }
  }

  private layoutRunes(s: Slot, time: number, radius: number, brightness: number) {
    for (let i = 0; i < s.runes.length; i++) {
      const a = i / s.runes.length * TAU + time * 1.8;
      const r = radius * s.scale;
      const rune = s.runes[i]; rune.position.set(Math.cos(a) * r, .065 + .012 * Math.sin(a * 2), Math.sin(a) * r);
      rune.rotation.set(Math.PI / 2, a, a + time * 2.2); rune.scale.set(.8, 1.2, .7);
      rune.material.opacity = .55 + .4 * brightness;
    }
  }

  private layoutParticles(s: Slot, time: number, radius: number, brightness: number) {
    for (let i = 0; i < s.particles.length; i++) {
      const p = s.particles[i], t = i / s.particles.length, a = t * TAU * 2 + time * (2.5 + t * 2.2);
      const r = radius * s.scale * (.35 + .65 * t);
      p.position.set(Math.cos(a) * r, .12 + t * .85 + Math.sin(a * 1.7 + time * 3) * .08, Math.sin(a) * r);
      const size = (.55 + .45 * Math.sin(time * 12 + i)) * brightness;
      p.scale.setScalar(Math.max(.001, size));
      p.rotation.set(time * (1 + t), a, time * 1.7);
      p.material.opacity = .25 + .7 * brightness;
    }
  }

  private finish(s: Slot, result: 'success' | 'failure') {
    if (s.completionCalled) return;
    s.result = result; s.phase = 'done'; s.completionCalled = true;
    if (s.target) {
      s.target.scale.copy(s.baseScale);
      if (result === 'success') s.target.visible = false;
      else s.target.visible = s.baseVisible;
    }
    if (result === 'success' && !s.successCalled) { s.successCalled = true; s.onSuccess?.(); }
    s.onComplete?.(result);
    s.target = null; s.root.visible = false;
    s.onSuccess = undefined; s.onComplete = undefined;
  }

  private cancelSlot(s: Slot) {
    if (!s.target) return;
    s.target.visible = s.baseVisible; s.target.scale.copy(s.baseScale);
    s.target = null; s.phase = 'done'; s.result = 'cancelled'; s.requested = null;
    s.root.visible = false; s.onSuccess = undefined; s.onComplete = undefined;
    s.completionCalled = true;
  }
}
