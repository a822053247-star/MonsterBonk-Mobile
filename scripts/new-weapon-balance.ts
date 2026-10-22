import { measureWeapon } from './weapon-balance';
import { measureRun, type RunPolicy } from './run-balance';
import type { BalanceSpecies } from './wave-balance';
import type { Combat } from '../src/combat';
import { WEAPON_CARDS, type SkillId } from '../src/progression';

export const NEW_WEAPON_STRATEGIES = ['baseline', 'thorn-wheel', 'tidal-blade', 'thunder-bud'] as const;
export type NewWeaponStrategy = typeof NEW_WEAPON_STRATEGIES[number];

export function newWeaponPressureMatrix() {
  return ([1, 3, 5] as const).flatMap(level =>
    (['boss-near', 'boss-far', 'cluster', 'line', 'mowing'] as const).flatMap(scenario =>
      (['spark', 'leaf', 'flame-sweep', 'thorn-wheel', 'tidal-blade', 'thunder-bud'] as const)
        .map(weapon => measureWeapon(weapon, level, scenario))));
}

export function chooseNewWeaponUpgrade(strategy: NewWeaponStrategy, c: Combat, _policy: RunPolicy, species: BalanceSpecies, offers: readonly SkillId[]): SkillId {
  const main: SkillId = species === 'yanrong' ? 'spark-weapon' : species === 'bubblesalamander' ? 'bubble-weapon' : 'leaf-weapon';
  const priorities: SkillId[] = [
    ...(c.hp < c.maxHp * .45 ? ['vitality' as const] : []),
    ...(strategy === 'baseline' ? [] : [`${strategy}-weapon` as SkillId]),
    main, 'damage', 'haste', 'vitality', 'movement', 'range',
    ...(species === 'yanrong' ? ['split-on-hit' as const] : ['area' as const, 'chain' as const]),
    'orbit', 'shockwave', 'multishot',
  ];
  return priorities.find(id => offers.includes(id))
    ?? offers.find(id => !WEAPON_CARDS[id]) ?? offers[0]!;
}

export function measureNewWeaponRun(species: BalanceSpecies, strategy: NewWeaponStrategy, seed: number, maxSeconds = 455) {
  const result = measureRun(species, 'focused', 'forager', seed, maxSeconds,
    (c, policy, character, offers) => chooseNewWeaponUpgrade(strategy, c, policy, character, offers));
  return { ...result, strategy, targetAcquiredAt: strategy === 'baseline' ? null : result.choices.find(choice => choice.id === `${strategy}-weapon`)?.at ?? null,
    firstNewWeaponAt: result.choices.find(choice =>
    ['thorn-wheel-weapon', 'tidal-blade-weapon', 'thunder-bud-weapon'].includes(choice.id))?.at ?? null };
}
