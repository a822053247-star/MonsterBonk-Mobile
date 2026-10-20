/** Continuous campaign probe: actual HP, XP, choices and one final shop.
 * Scripted controls and an obstacle-free arena are not human win-rate evidence. */
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { RunFlow } from '../src/run-flow';
import { seededRandom, type BalanceSpecies } from './wave-balance';
import type { SkillId } from '../src/progression';
export type RunPolicy = 'focused' | 'chain' | 'survival';
export type RunMovement = 'stationary' | 'circle' | 'forager';
const r = (n: number) => Number(n.toFixed(2));

export function chooseRunUpgrade(c: Combat, policy: RunPolicy, species: BalanceSpecies, offers: readonly SkillId[]): SkillId {
  const weapon: SkillId = species==='yanrong' ? 'spark-weapon' : species==='bubblesalamander' ? 'bubble-weapon' : 'leaf-weapon';
  const chain: SkillId[] = species==='yanrong' ? ['draft-martyr-core','split-on-hit','draft-kindling-flask']
    : species==='bubblesalamander' ? ['draft-bubble-spore','area','chain'] : ['draft-thorn-testament','split-on-hit','chain'];
  const priorities: SkillId[] = policy==='survival'
    ? ['vitality','orbit','shockwave','movement',weapon,'haste','damage','range',...chain]
    : policy==='chain' ? [...chain, weapon,'haste','damage','multishot','area','chain','orbit','shockwave','vitality','movement']
    : [weapon,'damage','haste','multishot','vitality','orbit','shockwave',...chain];
  return priorities.find(id=>offers.includes(id)) ?? offers[0]!;
}

export function measureRun(species: BalanceSpecies, policy: RunPolicy, movement: RunMovement, seed=42, maxSeconds=455) {
  if(!['yanrong','bubblesalamander','sproutspike'].includes(species) || !['focused','chain','survival'].includes(policy)
    || !['stationary','circle','forager'].includes(movement) || !Number.isSafeInteger(seed) || !Number.isFinite(maxSeconds) || maxSeconds<=0)
    throw new RangeError('Invalid continuous run scenario');
  const c=new Combat([],32,seededRandom(seed));c.party=new PartySystem();c.party.reset([species]);
  c.fusionEnabled=true;c.automaticSpawning=false;c.useNavigation=true;c.reset();
  const run=new RunFlow(seededRandom(seed^0x9e3779b9));
  const position={x:0,z:0};let seconds=0,firstFusionAt:number|null=null,firstCoreAt:number|null=null;
  let firstLevelAt:number|null=null,firstMatureFireAt:number|null=null;
  const choices:{at:number;id:SkillId;source:'level'|'shop'}[]=[];
  const segments:{wave:number;beat:string;start:number;end:number;kills:number;xp:number;damage:number;hits:number;activePeak:number;nearSeconds:number;fodder:number;escorts:number}[]=[];
  function settle() {
    let guard=0;
    while(c.progression.awaitingChoice) {
      if(++guard>200)throw new Error('Choices did not settle');
      const id=chooseRunUpgrade(c,policy,species,c.progression.offers);
      if(!c.chooseUpgrade(id))throw new Error('Invalid earned choice');
      choices.push({at:r(seconds),id,source:'level'});
    }
  }
  while(seconds<maxSeconds-1e-8 && run.phase!=='lost' && run.phase!=='won') {
    settle();
    if(run.phase==='intermission') {run.updateRest(3.5,c);continue;}
    if(run.phase==='shop') {
      // Buy available build choices, then healing; no rerolls or injected currency.
      for(let attempt=0;attempt<4;attempt++) {
        const shop=run.shop!;
        const offers=shop.items.filter(i=>!i.sold&&i.skill&&i.price<=run.coins).map(i=>i.skill!);
        if(!offers.length)break;
        const id=chooseRunUpgrade(c,policy,species,offers);
        const index=shop.items.findIndex(i=>!i.sold&&i.skill===id);
        if(index<0||!run.buy(index,shop.token))break;
        choices.push({at:r(seconds),id,source:'shop'});
      }
      const heal=run.shop!.items.findIndex(i=>!i.sold&&i.kind==='heal');
      if(heal>=0)run.buy(heal,run.shop!.token);
      if(!run.nextWave(run.shop!.token,c))throw new Error('Unable to leave shop');
      continue;
    }
    const dt=Math.min(1/60,maxSeconds-seconds);
    let dx=0,dz=0;
    if(movement==='circle') {
      dx=Math.cos(seconds*.43)*6-position.x;dz=Math.sin(seconds*.43)*6-position.z;
    } else if(movement==='forager') {
      let nearest=Infinity;let goal={x:Math.cos(seconds*.13)*10,z:Math.sin(seconds*.13)*10};
      for(const orb of c.orbs)if(orb.active) {
        const distance=Math.hypot(orb.x-position.x,orb.z-position.z);
        if(distance<nearest){nearest=distance;goal=orb;}
      }
      dx=goal.x-position.x;dz=goal.z-position.z;
      const norm=Math.max(1,Math.hypot(dx,dz));dx/=norm;dz/=norm;
      for(const e of c.enemies)if(e.active&&e.kind!=='draft-treasure-runner') {
        const x=position.x-e.x,z=position.z-e.z,d=Math.hypot(x,z);
        if(d<5&&d>.01){const force=(5-d)/5*(e.kind==='fast'||e.rank?2:1);dx+=x/d*force;dz+=z/d*force;}
      }
      const radius=Math.hypot(position.x,position.z);
      if(radius>25){dx-=position.x/radius*2;dz-=position.z/radius*2;}
    }
    const length=Math.hypot(dx,dz), step=Math.min(length,4.6*c.stats.moveMultiplier*dt);
    if(length>0){position.x+=dx/length*step;position.z+=dz/length*step;}
    const radius=Math.hypot(position.x,position.z);if(radius>30){position.x*=30/radius;position.z*=30/radius;}
    const director=run.inspect().director;
    let segment=segments[segments.length-1];
    if(!segment||segment.wave!==run.wave||segment.beat!==director.beat) {
      segment={wave:run.wave,beat:director.beat,start:r(seconds),end:r(seconds),kills:0,xp:0,damage:0,hits:0,activePeak:0,nearSeconds:0,fodder:0,escorts:0};segments.push(segment);
    }
    const before={hp:c.hp,kills:c.kills,xp:c.progression.totalExperience,hits:c.balanceTelemetry.damageEvents};
    run.prepare(c,position);c.party!.syncLeader(position,Math.atan2(dx,dz));c.update(dt,position);run.update(dt,c,position);
    seconds+=dt;settle();
    segment.end=r(seconds);segment.kills+=c.kills-before.kills;segment.xp+=c.progression.totalExperience-before.xp;
    segment.damage+=Math.max(0,before.hp-c.hp);segment.hits+=c.balanceTelemetry.damageEvents-before.hits;
    const alive=c.enemies.filter(e=>e.active);
    segment.activePeak=Math.max(segment.activePeak,alive.length);
    if(alive.some(e=>Math.hypot(e.x-position.x,e.z-position.z)<3))segment.nearSeconds+=dt;
    const after=run.inspect().director;segment.fodder+=after.fodderArrivals-director.fodderArrivals;segment.escorts+=after.escortArrivals-director.escortArrivals;
    if(firstLevelAt===null&&c.progression.level>1)firstLevelAt=r(seconds);
    if(firstFusionAt===null&&c.fusions.length)firstFusionAt=r(seconds);
    if(firstCoreAt===null&&c.runBuild.relics.some(id=>['draft-martyr-core','draft-kindling-flask','draft-bubble-spore','draft-thorn-testament','draft-boiling-core'].includes(id)))firstCoreAt=r(seconds);
    if(firstMatureFireAt===null&&c.runBuild.relics.includes('draft-martyr-core')&&c.runBuild.attacks.some(a=>a.level>=3&&(a.attackId==='flame-sweep'||a.attackId==='spark'&&c.progression.ranks['split-on-hit']>0)))firstMatureFireAt=r(seconds);
  }
  return {species,policy,movement,seed,seconds:r(seconds),phase:run.phase,wave:run.wave,bossDefeated:run.bossDefeated,
    hp:r(c.hp),level:c.progression.level,kills:c.kills,xp:c.progression.totalExperience,firstLevelAt,firstFusionAt,firstCoreAt,firstMatureFireAt,
    choices,relics:c.runBuild.relics,weapons:c.runBuild.attacks.map(a=>({id:a.attackId,level:a.level})),
    reactions:{...c.relicTelemetry},segments:segments.map(s=>({...s,damage:r(s.damage),nearSeconds:r(s.nearSeconds)}))};
}
