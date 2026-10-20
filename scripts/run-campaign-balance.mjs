import { rolldown } from 'rolldown';
import { writeFile } from 'node:fs/promises';
const bundle=await rolldown({input:'scripts/run-balance.ts',platform:'node'});
let generated;
try { generated=await bundle.generate({format:'esm'}); } finally { await bundle.close(); }
const {measureRun}=await import('data:text/javascript;base64,'+Buffer.from(generated.output[0].code).toString('base64'));
const rows=[];
for(const seed of [42,901,20261021])for(const species of ['yanrong','bubblesalamander','sproutspike'])
  for(const [policy,movement] of [['focused','stationary'],['focused','circle'],['focused','forager'],['chain','forager'],['survival','forager']]) {
    const row=measureRun(species,policy,movement,seed);rows.push(row);
    console.log(species,policy,movement,seed,row.seconds,row.phase,'wave',row.wave,'HP',row.hp,'kills',row.kills,'level',row.level);
  }
await writeFile('artifacts/difficulty-campaign-results.json',JSON.stringify({
  schema:'monsterbonk-continuous-run-v1',
  assumptions:['Continuous real Combat and RunFlow at 60Hz, no preset upgrades, forced damage, invulnerability or XP.',
    'Obstacle-free radius-32 arena, default 28x24 world-unit spawn viewport; does not represent every real camera or arena.',
    'Three fixed seeds, three species, five declared build/control policies; scripted controls are not human win rates.',
    'Forager seeks XP and repels nearby enemies at real movement speed; it does not read future attacks or react to telegraphs.',
    'Only earned level choices and affordable final-shop purchases/healing; no rerolls. Shop/rest excluded from combat time.',
    'Maximum observation 455 combat seconds; fighting at that boundary can include pending Boss death animation.'],rows
},null,2)+'\n');
