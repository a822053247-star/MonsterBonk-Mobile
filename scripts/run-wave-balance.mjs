/** Reproducible headless wave pressure data. No browser, DOM or gameplay mutations.
 * Default: 35-second observation window in every wave; --full simulates until
 * the natural wave boundary, real player death, or Boss victory.
 *
 *   npm run balance:waves
 *   npm run balance:waves -- --full --seed 42
 *   npm run balance:waves -- --seconds 24 --output artifacts/custom-wave-results.json
 */
import { rolldown } from 'rolldown';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
let full = false;
let seconds = 35;
let seed = 20261020;
let output = 'artifacts/wave-balance-results.json';
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--full') full = true;
  else if (arg === '--seconds') seconds = Number(args[++i]);
  else if (arg === '--seed') seed = Number(args[++i]);
  else if (arg === '--output') output = args[++i];
  else throw new Error('Unknown option: ' + arg);
}
if (!Number.isSafeInteger(seed) || !Number.isFinite(seconds) || seconds <= 0
  || !output || typeof output !== 'string') throw new RangeError('Invalid baseline options');

const temp = await mkdtemp(join(tmpdir(), 'monsterbonk-wave-balance-'));
try {
  const entry = join(temp, 'wave-balance.mjs');
  const bundle = await rolldown({ input: 'scripts/wave-balance.ts', platform: 'node' });
  try { await bundle.write({ file: entry, format: 'esm' }); }
  finally { await bundle.close(); }
  const { waveBalanceMatrix } = await import(pathToFileURL(entry).href);
  const rows = waveBalanceMatrix({ seed, ...(full ? {} : { maxSeconds: seconds }) });
  const result = {
    schema: 'monsterbonk-wave-baseline-v1',
    seed,
    mode: full ? 'full-wave-until-death-or-victory' : 'fixed-observation-window',
    observationSeconds: full ? null : seconds,
    assumptions: [
      'Independent waves start at full HP with two extra preset upgrades per prior wave.',
      'Scripted circular movement, no reactive dodging, no shop purchases, no real player input.',
      'Real Combat.update and RunFlow.update run at 60Hz; no forced kills, XP or invulnerability.',
      'XP/min is XP actually collected or settled by RunFlow, divided by observed combat seconds.',
      'Projectile blockage counts attempted ticks with an equipped weapon ready and pool capacity insufficient.',
      'Treasure spawn count is observed unique treasure IDs; escape rate is null when no treasure appears.',
      'Spore chain kills are bombers killed by spore-origin explosions; spore explosion kills include other enemy kinds.',
      'A truncated or lost wave is not a completed clear or proof of player win rate.',
    ],
    rows,
  };
  const destination = resolve(output);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log('Wave baseline:', destination);
  console.table(rows.map(({character,build,wave,observedSeconds,phase,kills,damageEvents,xpPerMinute,
    firedProjectiles,projectileBlockedAttempts,treasureEscapeRate,sporeChainKills}) =>
    ({character,build,wave,observedSeconds,phase,kills,damageEvents,xpPerMinute,
      firedProjectiles,projectileBlockedAttempts,treasureEscapeRate,sporeChainKills})));
} finally {
  await rm(temp, { recursive: true, force: true });
}
