import { tidePrism } from './relics/tide-prism';
import { FIRST_RELIC_BATCH, SECOND_RELIC_BATCH } from './relics/behavior-relics';
import { relicMetadata } from './relic-effects';
import type { RelicDefinition } from './content-types';
import { validateRelicContent, type ContentReferences } from './content-validation';
import { VFX_PRESETS } from '../visuals/vfx-presets';

/** Add a definition here; combat, rewards, cards and shop consume this same catalogue. */
const DEFINITIONS = [tidePrism, ...FIRST_RELIC_BATCH, ...SECOND_RELIC_BATCH] as const;
export const FACTORY_RELICS = Object.fromEntries(createRelicRegistry(DEFINITIONS)) as {
  [Id in typeof DEFINITIONS[number]['id']]: Extract<typeof DEFINITIONS[number], {id: Id}>
};
export type FactoryRelicId = keyof typeof FACTORY_RELICS;
export function factoryRelic(id: string): RelicDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(FACTORY_RELICS, id) ? FACTORY_RELICS[id as FactoryRelicId] : undefined;
}
export function createRelicRegistry<const T extends readonly RelicDefinition[]>(definitions: T, references: ContentReferences = {
  weapons: ['spark','bubble','leaf','flame-sweep'], vfx: VFX_PRESETS,
}) {
  const registry = new Map<T[number]['id'], T[number]>();
  for (const definition of definitions) {
    if (registry.has(definition.id)) throw new Error(`Duplicate relic ID: ${definition.id}`);
    registry.set(definition.id, definition);
  }
  const errors = validateRelicContent(definitions, references);
  if (errors.length) throw new Error(errors.join('\n'));
  return registry;
}
export const FACTORY_RELIC_METADATA = Object.fromEntries(Object.values(FACTORY_RELICS).map(d => [d.id, relicMetadata(d)])) as Record<FactoryRelicId, ReturnType<typeof relicMetadata>>;
