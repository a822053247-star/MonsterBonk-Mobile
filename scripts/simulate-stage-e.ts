/** Deterministic open-field balance probe. This is not a phone/playtest result.
 * Bundle with rolldown (already included by Vite), then run the emitted module.
 */
import { Combat } from '../src/combat';
import { PartySystem, type SpeciesId } from '../src/party';
import { RunFlow } from '../src/run-flow';
import type { SkillId } from '../src/progression';

type Build = 'specialist' | 'mixed' | 'chain';
function simulate(build:Build,seed:number,reactive:boolean) {
  let rng=seed>>>0;
  const random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
  const species:SpeciesId=build==='chain'?'sproutspike':'yanrong';
  const c=new Combat([],32,random);c.party=new PartySystem();c.party.reset([species]);c.fusionEnabled=true;c.reset();c.useNavigation=true;c.automaticSpawning=false;
  const run=new RunFlow(random),p={x:8,z:0};
  let angle=0,time=0,choiceCount=0,peakShots=0,peakEnemies=0,peakHostile=0,direction=1,reversed=false;
  const priorities:Record<Build,string[]>={
    specialist:['specialist-badge','spark-weapon','damage','haste','multishot','split-on-hit','vitality','movement','range','overload-core'],
    mixed:['bubble-weapon','area','split-on-hit','haste','damage','spark-weapon','bubble-weapon','multishot','vitality','movement','tidal-pearl'],
    chain:['chain','split-on-hit','leaf-weapon','haste','damage','multishot','echo-rune','vitality','movement','range'],
  };
  const score=(id:string)=>{
    if(id==='vitality'&&c.hp/c.maxHp<.6)return 1000;
    if(build==='specialist'&&(id==='bubble-weapon'||id==='leaf-weapon'))return -100;
    const i=priorities[build].indexOf(id);return i<0?0:100-i;
  };
  for(let tick=0;tick<60*600&&run.phase!=='won'&&run.phase!=='lost';tick++) {
    if(c.progression.awaitingChoice) {
      const id=[...c.progression.offers].sort((a,b)=>score(b)-score(a))[0];
      if(!id||!c.chooseUpgrade(id as SkillId))throw new Error('Invalid simulated offer');choiceCount++;continue;
    }
    if(run.phase==='shop') {
      for(let purchase=0;purchase<4;purchase++) {
        const shop=run.shop!;
        const items=shop.items.map((item,index)=>({item,index,score:item.skill?score(item.skill):item.kind==='heal'&&c.hp/c.maxHp<.8?200:-1})).filter(x=>!x.item.sold&&x.item.price<=run.coins&&x.score>0).sort((a,b)=>b.score-a.score);
        if(!items[0]||!run.buy(items[0].index,shop.token))break;
      }
      run.updateRest(20);run.nextWave(run.shop!.token,c);continue;
    }
    run.prepare(c,p);
    const warning=c.encounters.bossState.endsWith('windup')||c.enemies.some(e=>e.active&&e.kind==='fast'&&e.intent==='windup'&&Math.hypot(e.x-p.x,e.z-p.z)<8);
    if(reactive&&warning&&!reversed){direction*=-1;reversed=true;}
    if(!warning)reversed=false;
    angle+=direction*4.6*c.stats.moveMultiplier/8/60;p.x=Math.cos(angle)*8;p.z=Math.sin(angle)*8;
    c.party.syncLeader(p,0);c.update(1/60,p);run.update(1/60,c,p);time+=1/60;
    peakShots=Math.max(peakShots,c.projectiles.filter(s=>s.active).length);peakEnemies=Math.max(peakEnemies,c.enemies.filter(e=>e.active).length);peakHostile=Math.max(peakHostile,c.encounters.shots.filter(s=>s.active).length);
  }
  return {build,seed,policy:reactive?'reverse-on-warning':'fixed-circle',outcome:run.phase,wave:run.wave,reason:run.failure,hp:Math.round(c.hp),maxHp:c.maxHp,combatSeconds:Math.round(time),bossHp:c.encounters.boss?.hp??(run.bossDefeated?0:null),kills:c.kills,choiceCount,coins:run.coins,peakShots,peakEnemies,peakHostile,weapons:c.runBuild.attacks.map(a=>({id:a.attackId,level:a.level})),relics:c.runBuild.relics};
}
const results=[];
for(const seed of [17,63,211])for(const build of ['specialist','mixed','chain'] as const)for(const reactive of [false,true])results.push(simulate(build,seed,reactive));
console.log(JSON.stringify(results,null,2));
