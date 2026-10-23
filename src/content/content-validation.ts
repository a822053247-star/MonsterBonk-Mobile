import {WEAPON_TAGS} from './weapon-traits';
import { CONTENT_SKILLS, CONTENT_TAGS, MODIFIER_STATS, MODIFIER_TARGETS, type RelicDefinition } from './content-types';
import { ICON_PALETTES, ICON_SYMBOLS } from './relic-icons';
import { EFFECT_HANDLERS, relicMetadata } from './relic-effects';
import { BEHAVIOR_FIELDS } from './relics/behavior-relics';

export interface ContentReferences { weapons: readonly string[]; vfx: readonly { id: string; type: string }[]; reservedIds?: readonly string[]; assetExists?: (path: string) => boolean }
/** Accept untrusted JSON at the tooling boundary, with actionable per-item errors. */
export function validateRelicContent(values: readonly unknown[], refs: ContentReferences): string[] {
  const errors: string[] = [], ids = new Set(refs.reservedIds ?? []);
  const has = (list: readonly string[], value: unknown) => typeof value === 'string' && list.includes(value);
  for (const value of values) {
    const d = value as RelicDefinition;
    const fail = (message: string) => errors.push(`${d?.id ?? '<unknown>'}: ${message}`);
    if (!d || typeof d !== 'object') { fail('expected relic object'); continue; }
    if (typeof d.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(d.id)) fail('invalid ID');
    if (ids.has(d.id)) fail('duplicate ID'); ids.add(d.id);
    if (typeof d.title !== 'string' || !d.title.trim() || /[<>]/.test(d.title) || d.category !== 'relic' || d.rarity !== 'rare' || d.maxRank !== 1) fail('missing/invalid card metadata');
    if (!Array.isArray(d.modes) || d.modes.length !== 1 || d.modes[0] !== 'formal') fail('content must be formal-only');
    if(d.endlessOnly!==undefined&&typeof d.endlessOnly!=='boolean')fail('invalid endless-only flag');
    if(d.art?.hidden!==undefined&&typeof d.art.hidden!=='boolean')fail('invalid icon visibility');
    if (!Array.isArray(d.tags) || !d.tags.length || d.tags.some(t => !has(CONTENT_TAGS,t))) fail('unknown tags');
    const requirements = (r: RelicDefinition['requirements']) => {
      if (!r || typeof r !== 'object') { fail('missing requirements'); return; }
      if (r.weapon !== undefined && !has(refs.weapons,r.weapon)) fail(`unknown weapon ${r.weapon}`);
      for (const list of [r.weapons,r.anyWeapons]) if (list !== undefined && (!Array.isArray(list) || !list.length || list.some(id => !has(refs.weapons,id)))) fail('unknown/empty weapon requirements');
      if(r.weaponTags&&(!Array.isArray(r.weaponTags)||!r.weaponTags.length||r.weaponTags.some(t=>!has(WEAPON_TAGS,t))))fail('unknown weapon capability tag');
      if (r.projectile !== undefined && typeof r.projectile !== 'boolean') fail('invalid projectile requirement');
      if (r.skills !== undefined && (!Array.isArray(r.skills) || r.skills.some(s => !has(CONTENT_SKILLS,s)))) fail('unknown skill');
    };
    requirements(d.requirements);
    let validModifiers = Array.isArray(d.modifiers) && (d.modifiers.length > 0 || !!d.behavior);
    if (d.behavior) {
      const fields = Object.prototype.hasOwnProperty.call(BEHAVIOR_FIELDS,d.behavior.handler) ? BEHAVIOR_FIELDS[d.behavior.handler] : undefined;
      if (!fields) fail('unknown behavior handler');
      else for (const field of fields) {
        const value = (d.behavior as unknown as Record<string,unknown>)[field];
        const limit = field === 'degrees' ? 360 : field === 'cooldown' ? 60 : field === 'cap' ? 12 : 10;
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > limit) fail(`invalid behavior parameter ${field}`);
        if (['every','cap','count','kills','healCap','sameHits','coins','experience','targets','pierce','removeShots'].includes(field) && !Number.isInteger(value)) fail(`integer required: ${field}`);
      }
    }
    if (!validModifiers) fail('missing modifiers');
    else for (const m of d.modifiers) {
      if (!m || !Object.prototype.hasOwnProperty.call(EFFECT_HANDLERS,m.handler) || !has(MODIFIER_STATS,m.stat) || !has(MODIFIER_TARGETS,m.target)) { fail('unknown effect handler, stat or target'); validModifiers = false; continue; }
      if (!Number.isFinite(m.multiply) || m.multiply <= 0 || m.multiply > 10 || m.multiply === 1) { fail('multiplier must be finite, positive, non-neutral and <= 10'); validModifiers = false; }
      if (!['benefit','tradeoff'].includes(m.polarity) || (m.polarity === 'benefit') !== (m.stat === 'intervalMultiplier' ? m.multiply < 1 : m.multiply > 1)) fail('effect polarity contradicts multiplier');
      if (m.tags !== undefined && (!Array.isArray(m.tags) || m.tags.some(t => !has(CONTENT_TAGS,t)))) fail('unknown modifier tag');
      if (m.requirements) requirements(m.requirements);
      if (m.stat === 'areaMultiplier' && m.target !== 'water-area') fail('area handler requires a registered area target');
    }
    if (!d.art || !has(ICON_SYMBOLS,d.art.symbol) || !Object.prototype.hasOwnProperty.call(ICON_PALETTES,d.art.palette)) fail('icon cannot be generated');
    if (d.art?.png && (!/^assets\/[a-zA-Z0-9/_-]+\.png$/.test(d.art.png) || refs.assetExists && !refs.assetExists(d.art.png))) fail('PNG resource missing or unsafe path');
    if (!d.vfx || !has(MODIFIER_TARGETS,d.vfx.target) || !refs.vfx.some(v => v.id === d.vfx.preset && (v.type === 'impact' || !!d.behavior && v.type === 'area'))) fail('unknown or incompatible VFX preset/target');
    if (!d.rewards || typeof d.rewards.upgrade !== 'boolean' || typeof d.rewards.shop !== 'boolean') fail('missing reward metadata');
    if (validModifiers && d.art && Object.prototype.hasOwnProperty.call(ICON_PALETTES,d.art.palette)) {
      const metadata = relicMetadata(d);
      if (!metadata.benefit || !metadata.tradeoff) fail('benefit and tradeoff required');
      if (d.description !== undefined && d.description !== metadata.description) fail('description contradicts generated effects');
    }
  }
  return errors;
}
