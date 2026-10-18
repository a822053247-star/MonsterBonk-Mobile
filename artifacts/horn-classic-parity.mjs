// Compare unchanged classic combat with the real pre-trial Git checkpoint.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
const url = source => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: 'transform' })).toString('base64')}`;
const modules = {};
for (const name of ['progression', 'trial']) modules[name] = url(await readFile(`src/${name}.ts`, 'utf8'));
const load = async source => {
  for (const name of ['progression', 'trial']) source = source.replaceAll(`'./${name}'`, `'${modules[name]}'`);
  return import(url(source));
};
const old = await load(execFileSync('git', ['show', '49c17db:src/combat.ts'], { encoding: 'utf8' }));
const current = await load(await readFile('src/combat.ts', 'utf8'));
assert.deepEqual(current.ENEMY_TYPES, old.ENEMY_TYPES); assert.deepEqual(current.WEAPON, old.WEAPON);
const rng = () => { let seed = 91; return () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296); };
const obstacles = [{ x: 4, z: 2, radius: 1 }, { x: -5, z: -3, radius: .8 }];
let comparedTicks = 0, upgrades = 0;
for (const scenario of ['normal', 'skills']) {
  const a = new old.Combat(obstacles, 32.3, rng()), b = new current.Combat(obstacles, 32.3, rng());
  for (let tick = 0; tick < 10800; tick++) {
    if (scenario === 'skills' && tick % 300 === 0) { a.progression.gainExperience(20); b.progression.gainExperience(20); }
    while (a.progression.awaitingChoice) {
      const id = a.progression.offers[0]; assert.equal(a.chooseUpgrade(id), b.chooseUpgrade(id)); upgrades++;
      if (a.hp <= 0) break;
    }
    const player = { x: Math.cos(tick / 180) * 7, z: Math.sin(tick / 220) * 7 };
    a.update(1/60, player); b.update(1/60, player);
    assert.equal(JSON.stringify(a.inspect()), JSON.stringify(b.inspect()), `${scenario} tick ${tick}`);
    comparedTicks++;
    if (a.hp === 0) { a.reset(); b.reset(); }
  }
}
const result = { baseline: '49c17db', comparedTicks, upgrades, identicalClassicSnapshots: true, enemyAndWeaponDataUnchanged: true };
await writeFile('artifacts/horn-classic-parity.json', JSON.stringify(result, null, 2));
console.log(result);
