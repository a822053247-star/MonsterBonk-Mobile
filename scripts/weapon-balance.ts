/** Deterministic stationary pressure probes, not survival or human playtest results.
 * Each fixture isolates one primary weapon, fixes enemy positions before each tick,
 * and disables XP choice pauses. No other weapon contributes damage.
 */
import { Combat, type Enemy } from '../src/combat';
import { PartySystem } from '../src/party';
import type { BaseAttackId } from '../src/fusion';
import type { EquippedAttack } from '../src/run-build';

export type BalanceScenario = 'boss-near' | 'boss-far' | 'cluster' | 'line' | 'mowing';
export function measureWeapon(weapon: BaseAttackId, level: number, scenario: BalanceScenario, specialized = false) {
  const c=new Combat([],32,()=>.25);c.party=new PartySystem();c.fusionEnabled=true;c.automaticSpawning=false;c.reset();
  if(weapon!=='spark')c.grantUpgrade(`${weapon}-weapon`);
  const chosen=c.runBuild.attacks.find(a=>a.attackId===weapon)!;
  (c.runBuild.attacks as EquippedAttack[]).splice(0,c.runBuild.attacks.length,chosen);
  chosen.slot=0;chosen.cooldown=0;
  for(let i=1;i<level;i++)c.grantUpgrade(`${weapon}-weapon`);
  if(specialized) {
    if(weapon==='spark'){c.grantUpgrade('split-on-hit');c.grantUpgrade('multishot');}
    if(weapon==='bubble'){c.grantUpgrade('area');c.grantUpgrade('chain');}
    if(weapon==='leaf'){c.grantUpgrade('split-on-hit');c.grantUpgrade('chain');}
    if(weapon==='flame-sweep'){c.grantUpgrade('damage');c.grantUpgrade('haste');}
  }
  Object.defineProperty(c.progression,'threshold',{get:()=>Infinity});
  c.invulnerability=1000;
  const duration=24, ticks=duration*60;
  const positions: {x:number;z:number}[] = scenario.startsWith('boss') ? [{x:scenario==='boss-near'?2:8,z:0}]
    : scenario==='line' ? Array.from({length:6},(_,i)=>({x:4.5+i*1.4,z:0}))
    : Array.from({length:scenario==='mowing'?24:12},(_,i)=>({x:Math.cos(i*Math.PI*2/(scenario==='mowing'?24:12))*2.6,z:Math.sin(i*Math.PI*2/(scenario==='mowing'?24:12))*2.6}));
  const targets: Enemy[]=[];
  const spawn=(p:{x:number;z:number})=>{
    const e=c.spawn('normal',p.x,p.z,0)!;e.hp=scenario==='mowing'?22:100000;
    if(scenario.startsWith('boss')){e.rank='boss';e.radius=.85;}
    if(scenario==='mowing')e.swarm=true;
    return e;
  };
  for(const p of positions)targets.push(spawn(p));
  let damage=0, slowTicks=0;
  for(let t=0;t<ticks;t++) {
    for(let i=0;i<targets.length;i++) {
      if(!targets[i].active)targets[i]=spawn(positions[i]);
      Object.assign(targets[i],positions[i],{knockX:0,knockZ:0});
    }
    const health=targets.map(e=>e.hp);
    c.party.syncLeader({x:0,z:0},0);c.update(1/60,{x:0,z:0});
    damage+=targets.reduce((sum,e,i)=>sum+health[i]-e.hp,0);
    slowTicks+=targets.filter(e=>(e.slowTime??0)>0).length;
  }
  return {weapon,level,scenario,specialized,dps:+(damage/duration).toFixed(2),kills:c.kills,
    slowUptime:+(slowTicks/(ticks*targets.length)).toFixed(3),sweeps:c.melee.attackInstanceId};
}

export function weaponBalanceMatrix() {
  return ([1,3,5] as const).flatMap(level=>[false,true].flatMap(specialized=>
    (['boss-near','boss-far','cluster','line','mowing'] as const).flatMap(scenario=>
      (['spark','bubble','leaf','flame-sweep'] as const).map(weapon=>measureWeapon(weapon,level,scenario,specialized)))));
}
