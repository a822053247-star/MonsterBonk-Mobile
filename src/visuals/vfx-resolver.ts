import type { CombatEffect } from '../combat';
import type { BaseAttackId } from '../fusion';
import { VFX_PRESETS, type VfxPreset, type ProjectileVfx, type ImpactVfx, type AreaVfx } from './vfx-presets';

const number = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const color = (v: unknown) => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v);
export type VfxBinding = { type: 'projectile'; attack: BaseAttackId }
  | { type: 'impact' | 'area'; effect: CombatEffect['kind'] };
/** Validate at registration, never inside a render loop. Invalid content fails before binding. */
export function validateVfxPreset(value: unknown): asserts value is VfxPreset {
  const p = value as VfxPreset;
  if (!p || typeof p.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(p.id) || !color(p.color) || !p.low) throw new Error('Invalid VFX identity/color/quality');
  let valid = false;
  if (p.type === 'projectile') valid = number(p.scale, .1, 3) && !!p.trail && color(p.trail.color)
    && number(p.trail.length, 0, 2) && number(p.trail.opacity, 0, 1) && typeof p.low.animated === 'boolean' && typeof p.low.trail === 'boolean';
  if (p.type === 'impact') valid = color(p.secondaryColor) && number(p.radiusScale, .1, 2) && number(p.duration, .01, 2)
    && (p.radiusMode === undefined || p.radiusMode === 'event') && typeof p.particles === 'boolean' && typeof p.ring === 'boolean' && typeof p.low.particles === 'boolean' && typeof p.low.animated === 'boolean';
  if (p.type === 'area') valid = color(p.secondaryColor) && ['ring','none'].includes(p.outline) && number(p.radiusScale, .1, 2)
    && p.duration === 'event' && number(p.fade, 0, 1) && number(p.rotationSpeed, -20, 20) && number(p.pulseSpeed, 0, 20) && typeof p.low.mist === 'boolean';
  if (!valid) throw new Error(`Invalid VFX configuration: ${p.id}`);
  if ('height' in p && p.height !== undefined && !number(p.height, 0, 3)
    || 'rise' in p && p.rise !== undefined && !number(p.rise, 0, 3)) throw new Error(`Invalid VFX height: ${p.id}`);
  if ('animation' in p && p.animation !== undefined) {
    const a = p.animation;
    const columns = a?.atlas === 'fire' ? 4 : 8;
    if (!a || !['fire','elemental'].includes(a.atlas) || !Number.isInteger(a.row) || !number(a.row, 0, 3)
      || a.childRow !== undefined && (!Number.isInteger(a.childRow) || !number(a.childRow, 0, 3))
      || !number(a.fps, 1, 60) || !Array.isArray(a.frames) || !a.frames.length || a.frames.length > columns
      || !a.frames.every(f => Number.isInteger(f) && number(f, 0, columns - 1))) throw new Error(`Invalid VFX atlas: ${p.id}`);
  }
}

export class VfxResolver {
  private presets = new Map<string, VfxPreset>();
  private projectiles = new Map<BaseAttackId, ProjectileVfx>();
  private impacts = new Map<CombatEffect['kind'], ImpactVfx>();
  private areas = new Map<CombatEffect['kind'], AreaVfx>();
  constructor(presets: readonly VfxPreset[] = VFX_PRESETS) {
    for (const p of presets) this.register(p);
    if (presets === VFX_PRESETS) {
      this.bindProjectile('spark','fire-projectile'); this.bindProjectile('bubble','water-projectile');
      this.bindImpact('hit','fire-impact'); this.bindImpact('water','water-impact'); this.bindImpact('burst','fire-explosion');
      this.bindArea('steam','steam-area');
    }
  }
  register(value: unknown) {
    validateVfxPreset(value);
    if (this.presets.has(value.id)) throw new Error(`Duplicate VFX: ${value.id}`);
    // Copy and freeze so external mutation cannot bypass validation or change existing bindings.
    const p = JSON.parse(JSON.stringify(value));
    for (const v of Object.values(p)) if (v && typeof v === 'object') { if ('frames' in v) Object.freeze(v.frames); Object.freeze(v); }
    this.presets.set(p.id, Object.freeze(p));
  }
  private get<T extends VfxPreset['type']>(id: string, type: T): Extract<VfxPreset, { type: T }> {
    const p = this.presets.get(id);
    if (!p || p.type !== type) throw new Error(`Unknown or mismatched VFX: ${id} (${type})`);
    return p as Extract<VfxPreset, { type: T }>;
  }
  bindProjectile(attack: BaseAttackId, id: string) { this.projectiles.set(attack, this.get(id,'projectile')); }
  bindImpact(effect: CombatEffect['kind'], id: string) { this.impacts.set(effect, this.get(id,'impact')); }
  bindArea(effect: CombatEffect['kind'], id: string) { this.areas.set(effect, this.get(id,'area')); }
  /** Runtime content boundary: reject invalid content and retain the last working binding. */
  tryBind(binding: VfxBinding, value: unknown): { ok: boolean; error?: string } {
    try {
      validateVfxPreset(value);
      if (value.type !== binding.type) throw new Error('Mismatched VFX binding');
      this.register(value);
      if (binding.type === 'projectile') this.bindProjectile(binding.attack, value.id);
      else if (binding.type === 'impact') this.bindImpact(binding.effect, value.id);
      else this.bindArea(binding.effect, value.id);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Invalid VFX' };
    }
  }
  projectile(attack?: BaseAttackId) { return attack ? this.projectiles.get(attack) : undefined; }
  impact(kind: CombatEffect['kind'], id?: string) {
    const preset = id ? this.presets.get(id) : undefined;
    return preset?.type === 'impact' ? preset : this.impacts.get(kind);
  }
  area(kind: CombatEffect['kind']) { return this.areas.get(kind); }
}

export function visualProgress(effect: Pick<CombatEffect, 'time' | 'duration'>, maxDuration = effect.duration) {
  return Math.min(1, Math.max(0, (effect.duration - effect.time) / Math.max(.001, Math.min(effect.duration, maxDuration))));
}
