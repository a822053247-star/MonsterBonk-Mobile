import {test,expect} from '@playwright/test';
import {Combat} from '../src/combat';
import {PartySystem} from '../src/party';
import {ItemTestMode,ITEM_TEST_SKILLS,itemTestRank} from '../src/item-test-mode';

function fixture(){const c=new Combat([],100,()=>.5);c.party=new PartySystem();c.party.reset(['yanrong']);c.fusionEnabled=true;c.reset();return c;}
for(const skill of ITEM_TEST_SKILLS)test(`${skill} tests only its selected real skill and level with quiet weapons`,()=>{
  const c=fixture(),mode=new ItemTestMode(skill,3);mode.prepare(c);
  expect(ITEM_TEST_SKILLS.map(id=>c.progression.ranks[id])).toEqual(ITEM_TEST_SKILLS.map(id=>id===skill?3:0));
  expect(c.captureEnabled).toBe(false);expect(c.automaticSpawning).toBe(false);
  for(let i=0;i<210;i++){
    mode.beforeStep(1/60,c,{x:0,z:0});c.update(1/60,{x:0,z:0});mode.afterStep(c);
  }
  expect(c.shotsFired).toBe(0);expect(c.enemies.some(e=>e.active)).toBe(true);
  expect(c.enemies.filter(e=>e.active).length).toBeLessThanOrEqual(12);
  expect(c.enemies.every(e=>!e.active||e.stagger>3500)).toBe(true);
  expect(skill==='screen-barrage'?c.areaAttacks.telemetry.casts:c.coloredBarrages.telemetry.casts).toBeGreaterThan(0);
  expect(c.hp).toBe(c.maxHp);expect(c.progression.awaitingChoice).toBe(false);
});

test('test rewards never open a choice and a real reset restores ordinary weapon fire',()=>{
  const c=fixture(),mode=new ItemTestMode('frost-barrage',2);mode.prepare(c);
  c.progression.gainExperience(20);expect(c.progression.awaitingChoice).toBe(true);
  mode.afterStep(c);expect(c.progression.awaitingChoice).toBe(false);expect(c.progression.experience).toBe(0);
  c.reset();expect(c.progression.ranks['frost-barrage']).toBe(0);expect(c.runBuild.attacks[0].cooldown).toBeLessThan(1);
  expect(c.coloredBarrages.inspect().activeShots).toBe(0);
  for(const [input,expected] of [[0,1],[8,3],[2.9,2],[NaN,1],[Infinity,1]])expect(itemTestRank(input)).toBe(expected);
});
