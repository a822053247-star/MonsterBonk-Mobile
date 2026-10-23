/** Shared ranged troop tuning. Damage and collision remain in EnemyChallenge. */
const SPORE = { style: 'spore' as const, windup: .7, cooldown: 2.8, speed: 5, life: 2, retreat: 4, hold: 7, range: 9, drift: .18, turn: 3.8, cap: 2 };
const CRYSTAL = { style: 'crystal' as const, windup: 1.1, cooldown: 3.6, speed: 4, life: 2.5, retreat: 3, hold: 7.5, range: 10, drift: 0, turn: 2.4, cap: 1 };
const FLOWER = { style: 'petal' as const, windup: .9, cooldown: 3.1, speed: 4.6, life: 2, retreat: 4.5, hold: 7, range: 9, drift: .22, turn: 3, cap: 2 };
const THUNDER = { style: 'thunder' as const, windup: .65, cooldown: 2.5, speed: 6, life: 2, retreat: 3.5, hold: 6, range: 8, drift: .2, turn: 3.5, cap: 2 };
const TOXIC = { style: 'toxic' as const, windup: .85, cooldown: 3, speed: 4.5, life: 2, retreat: 4, hold: 6.5, range: 9, drift: .15, turn: 3.2, cap: 2 };
const MIRROR = { style: 'crystal' as const, windup: 1, cooldown: 3.3, speed: 4.2, life: 2.5, retreat: 4, hold: 7, range: 9.5, drift: .16, turn: 2.8, cap: 1 };
const LANTERN = { style: 'crystal' as const, windup: .9, cooldown: 3.2, speed: 4, life: 2.5, retreat: 4, hold: 7, range: 9, drift: .18, turn: 2.6, cap: 2 };
export function rangedEnemyRule(kind: string) { return kind === 'abyss-lantern' ? LANTERN : kind === 'mirror-wisp' ? MIRROR : kind === 'toxic-shroom' ? TOXIC : kind === 'thunder-bell' ? THUNDER : kind === 'scarlet-flower' ? FLOWER : kind === 'spore-floater' ? SPORE : kind === 'crystal-crawler' ? CRYSTAL : undefined; }
