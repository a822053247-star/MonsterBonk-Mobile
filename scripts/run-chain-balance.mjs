/** Real Combat probes for the preview builds; fixed targets are not survival/win-rate data. */
import { rolldown } from 'rolldown';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const entry = `
import { Combat } from ${JSON.stringify(resolve('src/combat.ts').replaceAll('\\','/'))};
import { PartySystem } from ${JSON.stringify(resolve('src/party.ts').replaceAll('\\','/'))};
import { BUILD_DEMOS, arrangeBuildDemo } from ${JSON.stringify(resolve('src/build-chain-demo.ts').replaceAll('\\','/'))};
export function measure() {
 return BUILD_DEMOS.map((demo,index)=>{
  const c=new Combat([],32,()=>.5);c.party=new PartySystem();c.fusionEnabled=true;c.automaticSpawning=false;
  const layout=arrangeBuildDemo(c,index);let projectilePeak=0,effectPeak=0;
  for(let i=0;i<360;i++){
   for(const {enemy,x,z} of layout.targets)if(enemy.active)Object.assign(enemy,{x,z,knockX:0,knockZ:0});
   c.party.syncLeader(layout.player,0);c.update(1/60,layout.player);
   if(index<2&&c.shotsFired>0)for(const a of c.runBuild.attacks)a.cooldown=10000;
   while(c.progression.awaitingChoice)c.chooseUpgrade(c.progression.offers[0]);
   projectilePeak=Math.max(projectilePeak,c.projectiles.filter(s=>s.active).length);
   effectPeak=Math.max(effectPeak,c.effects.filter(e=>e.active).length);
  }
  return {demo:demo.title,seconds:6,kills:c.kills,projectilePeak,effectPeak,...c.relicTelemetry,...c.balanceTelemetry,pending:c.inspect().triggerRelics.pending};
 });
}`;
const bundle = await rolldown({ input: 'virtual:chain', platform: 'node', plugins: [{
  name: 'chain-probe', resolveId(id) { if(id==='virtual:chain')return '\0chain'; },
  load(id) { if(id==='\0chain')return entry; },
}] });
const { output } = await bundle.generate({format:'esm'}); await bundle.close();
const {measure} = await import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'));
const rows=measure();
await writeFile('artifacts/build-chain-results.json',JSON.stringify({
  assumptions:['Fixed positions; invulnerable demonstration player; six simulated seconds.',
    'Declared wave-five swarm HP is 20. First two builds fire once; last two keep attacking.',
    'Builds have different investments. These rows are effect/termination probes, not equal-cost balance or phone FPS evidence.'],rows,
},null,2)+'\n');
console.table(rows);
