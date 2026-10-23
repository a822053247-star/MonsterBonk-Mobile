import {test,expect} from '@playwright/test';

test('formal chest roulette samples the full visual catalogue while keeping actual rewards unchanged',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const [{Combat},{PartySystem},{TreasureDialog},{TREASURE_ROLL_SKILLS}]=await Promise.all([
   import('/src/combat.ts'),import('/src/party.ts'),import('/src/treasure-dialog.ts'),import('/src/progression.ts'),
  ]);
  const combat=new Combat();combat.party=new PartySystem();combat.fusionEnabled=true;combat.reset();
  const dialog=new TreasureDialog(combat);
  const results=[];
  for(let n=1;n<=5;n++){
   dialog.reset();combat.clearWave();
   const reward=combat.grantTreasure(n,{x:0,z:0});
   const before=JSON.stringify({ranks:combat.progression.ranks,gold:combat.goldEarned,items:reward.items});
   dialog.sync();const draw=(dialog as any).draw;
   draw.open();draw(0);draw(8);
   const info=draw.inspect();
   results.push({n,info,expected:reward.items.map(item=>item.title),unchanged:before===JSON.stringify({ranks:combat.progression.ranks,gold:combat.goldEarned,items:reward.items})});
  }
  dialog.dispose();
  return {results,catalogue:TREASURE_ROLL_SKILLS.map(s=>s.title)};
 });
 for(const sample of result.results){
  expect(sample.info.rollingPoolSize).toBeGreaterThan(20);
  expect(sample.info.rollingTitles.length).toBeGreaterThan(10);
  expect(sample.info.rollingTitles.every((title:string)=>result.catalogue.includes(title))).toBe(true);
  expect(sample.info.rollingTitles.some((title:string)=>!sample.expected.includes(title))).toBe(true);
  expect(sample.info.results).toEqual(sample.expected);expect(sample.info.stopped).toBe(sample.n);
  expect(sample.unchanged).toBe(true);
 }
});
