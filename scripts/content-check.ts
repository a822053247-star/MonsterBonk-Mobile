import { existsSync } from 'node:fs';
import { FACTORY_RELICS } from '../src/content/relic-registry';
import { validateRelicContent } from '../src/content/content-validation';
import { LEGACY_RELICS, EVOLUTIONS } from '../src/relics';
import { CONTENT_SKILLS } from '../src/content/content-types';
import { ATTACKS } from '../src/run-build';
import { VFX_PRESETS } from '../src/visuals/vfx-presets';
import { relicIconSvg } from '../src/content/relic-icons';

export function checkContent(input?: unknown[]) {
  const definitions = input ?? Object.values(FACTORY_RELICS);
  const errors = validateRelicContent(definitions, { weapons: Object.keys(ATTACKS), vfx: VFX_PRESETS,
    reservedIds: [...Object.keys(LEGACY_RELICS), ...Object.keys(EVOLUTIONS), ...CONTENT_SKILLS], assetExists: path => existsSync(`public/${path}`) });
  if (errors.length) throw new Error(errors.join('\n'));
  return (definitions as import('../src/content/content-types').RelicDefinition[]).map(d => ({ id: d.id, svg: relicIconSvg(d.art) }));
}
