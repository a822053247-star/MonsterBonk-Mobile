import {test,expect} from '@playwright/test';
import {openSweep} from './flame-sweep-harness';

test('a sweep killing a bomber shows one fire sweep, with a visually distinct death warning',async({page})=>{
  await openSweep(page);
  await expect.poll(()=>page.evaluate(()=>{const v=(window as any).game.combatView.specialEnemies.inspectSpore();return v.warning.loaded&&v.fire.loaded})).toBe(true);
  const result=await page.evaluate(()=>{
    const w=window as any,g=w.game,c=g.combat;
    c.clearWave();c.encounters.beginWave(2);
    for(const attack of c.runBuild.attacks)attack.cooldown=attack.attackId==='flame-sweep'?0:10000;
    const bomber=c.spawn('draft-spore-bomber',2,0,0);bomber.hp=1;
    g.party.syncLeader(g.position,0);c.update(1/60,g.position);c.update(.12,g.position);w.draw();
    const fireRings:string[]=[];
    g.combatView.group.traverse((object:any)=>{
      if(!['FlameSectorWave','SporeScorchedWarning','SporeNodeWarning'].includes(object.name))return;
      let visible=true;for(let p=object;p;p=p.parent)if(!p.visible)visible=false;
      if(visible&&object.material.map?.image?.src?.includes('fire-effects-sheet'))fireRings.push(object.name);
    });
    const warning=g.combatView.group.getObjectByName('SporeNodeWarning');
    return{dead:!bomber.active,attack:c.melee.attackInstanceId,events:c.inspect().specialEnemies.explosions,fireRings,
      warningVisible:warning?.visible,warningSource:warning?.material.map?.image?.src};
  });
  expect(result.dead).toBe(true);expect(result.attack).toBeGreaterThan(0);
  expect(result.events).toHaveLength(1);expect(result.events[0].detonated).toBe(false);
  expect(result.warningVisible).toBe(true);expect(result.warningSource).toContain('magic_02.png');
  expect(result.fireRings,'a bomber death warning must not look like a second, smaller fire sweep').toEqual(['FlameSectorWave']);
});
