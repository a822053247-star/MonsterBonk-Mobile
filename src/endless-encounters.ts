import type { EnemyKind } from './combat';
import type { DirectorEscort } from './wave-director';

/** Eligibility is cumulative-wave based, independent of the repeating six-wave table. */
export const ENDLESS_ENEMY_UNLOCKS: Readonly<Partial<Record<DirectorEscort, number>>> = {
  'nightshade-bat': 1, 'molten-fruit': 3, 'spore-floater': 3,
  'sand-shell': 4, 'scarlet-flower': 4, 'moondew-shell': 5,
  'thunder-bell': 7, 'frost-fluff': 8, 'toxic-shroom': 8,
  'crystal-crawler': 9, 'mirror-wisp': 10, 'abyss-lantern': 11,
  fast: 2, tank: 3, 'draft-spore-bomber': 3,
};

// Each recipe is ordered front line -> ranged/support -> pursuit.
const RECIPES: readonly (readonly DirectorEscort[])[] = [
  ['nightshade-bat'], ['molten-fruit', 'nightshade-bat'],
  ['spore-floater', 'nightshade-bat'],
  ['sand-shell', 'spore-floater', 'nightshade-bat'],
  ['sand-shell', 'scarlet-flower', 'moondew-shell'],
  ['frost-fluff', 'thunder-bell', 'moondew-shell'],
  ['sand-shell', 'toxic-shroom', 'nightshade-bat'],
  ['molten-fruit', 'crystal-crawler', 'abyss-lantern'],
  ['frost-fluff', 'mirror-wisp', 'thunder-bell'],
  ['sand-shell', 'abyss-lantern', 'nightshade-bat'],
  ['tank', 'draft-spore-bomber', 'fast'],
];

export type EndlessApproach = 'adjacent' | 'concentrated' | 'wings' | 'alternating';
export const APPROACH_NAMES: Record<EndlessApproach, string> = {
  adjacent: '相邻两路', concentrated: '集中突进', wings: '双翼包夹', alternating: '交替围堵',
};

/** Run-local fair draw: favor underused enemies and never immediately repeat an
 * available composition. Only selected types are counted; locked/truncated ones aren't.
 */
export class EndlessEncounterDeck {
  private uses = new Map<DirectorEscort, number>();
  private previous = '';
  private previousApproach: EndlessApproach = 'adjacent';

  draw(wave: number, slots: number, random: () => number): DirectorEscort[] {
    const choices = new Map<string, DirectorEscort[]>();
    for (const recipe of RECIPES) {
      const eligible = recipe.filter(k => wave >= (ENDLESS_ENEMY_UNLOCKS[k] ?? Infinity)
        && (wave % 6 === 3 || wave % 6 === 5 || k !== 'draft-spore-bomber'));
      // Rotate a recipe before truncation so special waves with one/two slots
      // don't perpetually discard its support or ranged member.
      for (let start = 0; start < eligible.length; start++) {
        const pick = [...eligible.slice(start), ...eligible.slice(0, start)].slice(0, slots);
        if (pick.length) choices.set([...pick].sort().join('|'), pick);
      }
    }
    let pool = [...choices.entries()];
    if (pool.length > 1) pool = pool.filter(([key]) => key !== this.previous);
    // Prefer full combinations; among them favor the least exposed member.
    const size = Math.max(0, ...pool.map(([, kinds]) => kinds.length));
    pool = pool.filter(([, kinds]) => kinds.length === size);
    const score = (kinds: DirectorEscort[]) => kinds.reduce((n, k) => n + (this.uses.get(k) ?? 0), 0);
    const minimum = Math.min(...pool.map(([, kinds]) => score(kinds)));
    pool = pool.filter(([, kinds]) => score(kinds) === minimum);
    const selected = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    if (!selected) return [];
    this.previous = selected[0];
    for (const kind of selected[1]) this.uses.set(kind, (this.uses.get(kind) ?? 0) + 1);
    return [...selected[1]].sort((a, b) => entryOrder(a) - entryOrder(b));
  }

  approach(wave: number, random: () => number): EndlessApproach {
    const pool: EndlessApproach[] = wave <= 6 ? ['adjacent'] : wave <= 12
      ? ['adjacent', 'concentrated'] : ['concentrated', 'wings', 'alternating'];
    const choices = pool.length > 1 ? pool.filter(p => p !== this.previousApproach) : pool;
    return this.previousApproach = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
  }
}

function entryOrder(kind: EnemyKind) {
  return kind === 'tank' || kind === 'sand-shell' || kind === 'frost-fluff' ? 0
    : kind === 'nightshade-bat' || kind === 'fast' || kind === 'molten-fruit' ? 2 : 1;
}

export function endlessEntryHeading(pattern: EndlessApproach, base: number, batch: number, member: number) {
  if (pattern === 'concentrated') return base + (member % 2 ? .22 : -.22);
  if (pattern === 'wings') return base + ((member + batch) % 2 ? 1.2 : -1.2);
  if (pattern === 'alternating') return base + (batch % 2 ? 1.1 : -1.1) + (member % 2 ? .2 : -.2);
  return base + (member % 2 ? .7 : -.7);
}
