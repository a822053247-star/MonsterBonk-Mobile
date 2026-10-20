/** Controlled pre/post pressure probe using committed HEAD as the before implementation. */
import { rolldown } from 'rolldown';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve('.').replaceAll('\\','/');
const baseline=execFileSync('git',['rev-parse',process.argv[2] ?? 'HEAD'],{encoding:'utf8'}).trim();
const changed=['src/combat.ts','src/run-flow.ts','src/wave-director.ts','src/enemy-challenge.ts'];
const originals=new Map(changed.map(path=>[`${root}/${path}`,execFileSync('git',['show',`${baseline}:${path}`],{encoding:'utf8'})]));
const entry=`
import { Combat } from '${root}/src/combat.ts';
import { PartySystem } from '${root}/src/party.ts';
import { RunFlow } from '${root}/src/run-flow.ts';
import { seededRandom } from '${root}/scripts/wave-balance.ts';
export function measure(wave){
 const c=new Combat([],32,seededRandom(42));c.party=new PartySystem();c.fusionEnabled=true;c.automaticSpawning=false;c.useNavigation=true;c.reset();
 c.invulnerability=10000;for(const a of c.runBuild.attacks)a.cooldown=10000;
 c.spawnViewport={x:0,z:0,halfWidth:18.4,halfDepth:12};
 const run=new RunFlow(seededRandom(43));run.waveIndex=wave-1;
 let activePeak=0,nearPeak=0,largestPulse=0,ordinaryBirths=0,visibleBirths=0;const seen=new Set();
 for(let i=0;i<45*60;i++){
  c.party.syncLeader({x:0,z:0},0);c.update(1/60,{x:0,z:0});run.update(1/60,c,{x:0,z:0});
  const alive=c.enemies.filter(e=>e.active);activePeak=Math.max(activePeak,alive.length);
  nearPeak=Math.max(nearPeak,alive.filter(e=>Math.hypot(e.x,e.z)<5.5).length);
  let pulse=0;for(const e of alive)if(!seen.has(e.id)){
   seen.add(e.id);if(e.rank||e.kind==='draft-treasure-runner')continue;
   pulse++;ordinaryBirths++;if(Math.abs(e.x)<=18.4&&Math.abs(e.z)<=12)visibleBirths++;
  }
  largestPulse=Math.max(largestPulse,pulse);
 }
 return {wave,activePeak,nearPeak,largestPulse,ordinaryBirths,visibleBirths};
}`;
const rows=[];
for(const mode of ['before','after']) {
  const bundle=await rolldown({input:'virtual:pressure',platform:'node',plugins:[{
    name:'pressure',resolveId(id){if(id==='virtual:pressure')return '\0pressure';},
    load(id){if(id==='\0pressure')return entry;if(mode==='before')return originals.get(id.replaceAll('\\','/'));},
  }]});
  const {output}=await bundle.generate({format:'esm'});await bundle.close();
  const {measure}=await import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64')+`#${mode}`);
  for(const wave of [1,3,5])rows.push({mode,...measure(wave)});
}
await writeFile('artifacts/perimeter-pressure-results.json',JSON.stringify({baseline,
  assumptions:['45 simulated seconds, fixed seed, no obstacles, stationary invulnerable player, weapons disabled.',
    'This isolates incoming pressure and visual birth positions, not player difficulty, win rate or phone FPS.',
    'Before is the supplied Git ref, or committed HEAD when no ref is provided.'],rows},null,2)+'\n');
console.table(rows);
