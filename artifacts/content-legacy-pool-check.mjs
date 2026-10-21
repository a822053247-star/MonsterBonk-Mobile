import {rolldown} from 'rolldown';
import {readFile,writeFile} from 'node:fs/promises';
async function legacyCatalogue(entry){
 const bundle=await rolldown({input:entry,platform:'node'});let result;
 try{result=await bundle.generate({format:'esm'})}finally{await bundle.close()}
 const source=result.output[0].code,needle='if (definition && !meetsRequirements';
 if(source.split(needle).length!==2)throw new Error('Expected exactly one progression filter');
 // Experimental control only: omit factory rewards before seeded shuffling; gameplay code is untouched.
 const control=source.replace(needle,'if (definition) return false;\n'+needle);
 return import('data:text/javascript;base64,'+Buffer.from(control).toString('base64'));
}
const baseline=JSON.parse(await readFile('artifacts/content-baseline-campaign.json','utf8'));
const current=JSON.parse(await readFile('artifacts/content-campaign.json','utf8'));
const changed=baseline.rows.filter((r,i)=>JSON.stringify(r)!==JSON.stringify(current.rows[i]));
const {measureRun}=await legacyCatalogue('scripts/run-balance.ts');const campaign=[];
for(const expected of changed){
 const actual=measureRun(expected.species,expected.policy,expected.movement,expected.seed);
 const equal=JSON.stringify(expected)===JSON.stringify(actual);
 campaign.push({species:expected.species,policy:expected.policy,movement:expected.movement,seed:expected.seed,equal});
 console.log('Legacy-catalogue control',campaign.at(-1));
}
const {waveBalanceMatrix}=await legacyCatalogue('scripts/wave-balance.ts');
const waves=waveBalanceMatrix({seed:20261020,maxSeconds:35});
const oldWaves=JSON.parse(await readFile('artifacts/content-baseline-waves.json','utf8')).rows;
const result={purpose:'Control experiment: current combat with new factory reward excluded before seeded shuffling, compared with unmodified baseline. Production results are separate.',campaign,wavesIdentical:JSON.stringify(waves)===JSON.stringify(oldWaves)};
await writeFile('artifacts/content-legacy-catalogue-control.json',JSON.stringify(result,null,2)+'\n');
if(!campaign.every(r=>r.equal)||!result.wavesIdentical)process.exitCode=1;
