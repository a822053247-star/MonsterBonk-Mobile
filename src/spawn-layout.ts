export interface SpawnViewport { x: number; z: number; halfWidth: number; halfDepth: number }
export const FORMAL_SPAWN_CAPS = [36, 52, 72, 92, 112, 72] as const;
export const SPAWN_LAYOUT = { padding: 2.6, band: 2, minDistance: 12, maxDistance: 27, stagger: .25, goldenAngle: 2.399963 } as const;

/** Ground-plane footprint of the orthographic view, padded beyond whole enemy sprites. */
export function perimeterPoint(view: SpawnViewport, angle: number, band: number) {
  const dx = Math.sin(angle), dz = Math.cos(angle);
  const distance = Math.min((view.halfWidth + SPAWN_LAYOUT.padding) / Math.max(.00001, Math.abs(dx)),
    (view.halfDepth + SPAWN_LAYOUT.padding) / Math.max(.00001, Math.abs(dz))) + Math.max(0, Math.min(1, band)) * SPAWN_LAYOUT.band;
  return { x: view.x + dx * distance, z: view.z + dz * distance };
}

/** Only the opening of the entire run ramps up. Harvests keep ample chain fuel. */
export function populationBudget(cap: number, population: number, combatElapsed: number) {
  return Math.max(4, Math.floor(cap * population * (.55 + .45 * Math.min(1, Math.max(0, combatElapsed) / 18))));
}
