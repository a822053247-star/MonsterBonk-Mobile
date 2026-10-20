import { rolldown } from 'rolldown';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const bundle=await rolldown({input:'scripts/weapon-balance.ts',platform:'node'});
await bundle.write({file:'artifacts/weapon-balance-sim.mjs',format:'esm'});await bundle.close();
const {weaponBalanceMatrix}=await import(pathToFileURL(resolve('artifacts/weapon-balance-sim.mjs')).href);
const results=weaponBalanceMatrix();
await writeFile('artifacts/weapon-balance-results.json',JSON.stringify(results,null,2)+'\n');
console.table(results.filter(r=>r.level===5&&!r.specialized));
