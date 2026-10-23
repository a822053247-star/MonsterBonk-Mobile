import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { treasureItemCount } from '../src/special-enemies';
function fixture(roll = .99) {
  const c = new Combat([],32,()=>roll); c.party = new PartySystem(); c.fusionEnabled=true;c.automaticSpawning=false;c.reset();c.encounters.beginWave(2);return c;
}
function kill(c: Combat) { const e=c.spawn('draft-treasure-runner',0,8,0)!;e.spawnTime=0;(c as any).damageEnemy(e,100000,0,0);return e; }
test('count distribution has exact intended boundaries',()=>{
  expect([0,.4499,.45,.7299,.73,.8899,.89,.9699,.97,.9999].map(treasureItemCount)).toEqual([1,1,2,2,3,3,4,4,5,5]);
});
test('five rewards revalidate unique content and slots, settle once, freeze and reset',()=>{
  const c=fixture(); const e=kill(c);const reward=c.treasureRewards.find(e=>e.active)!;
  expect(reward.items).toHaveLength(5);const skills=reward.items.flatMap(i=>i.skill?[i.skill]:[]);
  expect(new Set(skills).size).toBe(skills.length);expect(c.runBuild.attacks.length).toBeLessThanOrEqual(3);
  for(const id of skills)expect(c.progression.ranks[id]).toBeGreaterThan(0);
  const snapshot=JSON.stringify(c.inspect());(c as any).damageEnemy(e,100000,0,0);c.update(0,{x:0,z:0});expect(JSON.stringify(c.inspect())).toBe(snapshot);
  c.clearWave();expect(c.treasureRewards.some(e=>e.active)).toBe(false);c.reset();expect(c.treasureCaught).toBe(0);
});
test('exhausted or pending-choice build uses explicit gold fallback; legacy has no chest',()=>{
  const c=fixture();c.progression.gainExperience(100);const before=c.goldEarned;kill(c);
  expect(c.treasureRewards.find(e=>e.active)!.items.every(i=>!i.skill)).toBe(true);expect(c.goldEarned-before).toBe(72);
  const legacy=fixture();legacy.fusionEnabled=false;kill(legacy);expect(legacy.treasureRewards.some(e=>e.active)).toBe(false);
});

test('specialist and full weapon slots remain compatible with every chest reward',()=>{
 const specialist=fixture();expect(specialist.grantUpgrade('specialist-badge')).toBe(true);kill(specialist);
 expect(specialist.runBuild.attacks).toHaveLength(1);
 const full=fixture();expect(full.grantUpgrade('bubble-weapon')).toBe(true);expect(full.grantUpgrade('leaf-weapon')).toBe(true);kill(full);
 expect(full.runBuild.attacks).toHaveLength(3);
});
