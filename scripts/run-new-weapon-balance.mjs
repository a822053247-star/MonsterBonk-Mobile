import { rolldown } from 'rolldown';
import { mkdir, writeFile } from 'node:fs/promises';

const label = process.argv[2] ?? 'current';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid report label');
const bundle = await rolldown({ input: 'scripts/new-weapon-balance.ts', platform: 'node' });
let generated;
try { generated = await bundle.generate({ format: 'esm' }); } finally { await bundle.close(); }
const sim = await import('data:text/javascript;base64,' + Buffer.from(generated.output[0].code).toString('base64'));
const pressure = sim.newWeaponPressureMatrix();
console.table(pressure.filter(row => row.level === 5).map(({ weapon, scenario, dps, kills }) => ({ weapon, scenario, dps, kills })));
const runs = [];
if (!process.argv.includes('--pressure-only')) {
  for (const seed of [42, 901, 20261021]) for (const species of ['yanrong', 'bubblesalamander', 'sproutspike']) {
    for (const strategy of sim.NEW_WEAPON_STRATEGIES) {
      const row = sim.measureNewWeaponRun(species, strategy, seed); runs.push(row);
      console.log(seed, species, strategy, row.phase, 'wave', row.wave, 'seconds', row.seconds, 'HP', row.hp, 'kills', row.kills,
        'weapons', row.weapons.map(w => `${w.id}:${w.level}`).join(','));
    }
  }
}
await mkdir('artifacts/new-weapon-balance', { recursive: true });
const path = `artifacts/new-weapon-balance/${label}.json`;
await writeFile(path, JSON.stringify({ schema: 'new-weapon-balance-v1', assumptions: [
  'Pressure fixtures isolate a single weapon, reset positions and instantly refill dead mowing targets. Scores are not real-wave kills or survival tests.',
  'Campaign probes use real HP, earned XP choices, affordable shop purchases and continuous six-wave RunFlow.',
  'Three fixed seeds, three starting creatures, identical forager movement, obstacle-free radius-32 arena.',
  'The campaign probe never overrides game offers, grants upgrades, adds invulnerability or injects healing. Unoffered weapons may not be acquired.',
  'Scripted results are not human win rates or phone performance measurements.'
], pressure, runs }, null, 2) + '\n');
console.log('Saved', path);
