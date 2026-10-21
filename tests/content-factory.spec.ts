import { test, expect } from '@playwright/test';
import { Combat, COMBAT_LIMITS } from '../src/combat';
import { PartySystem } from '../src/party';
import { tidePrism } from '../src/content/relics/tide-prism';
import { validateRelicContent } from '../src/content/content-validation';
import { createRelicRegistry } from '../src/content/relic-registry';
import { relicMetadata, applyRelicDefinition } from '../src/content/relic-effects';
import { generatedIcon, relicIcon, relicIconSvg } from '../src/content/relic-icons';
import { ATTACKS } from '../src/run-build';
import { RunBuild } from '../src/run-build';
import { Progression } from '../src/progression';
import { VFX_PRESETS } from '../src/visuals/vfx-presets';
import { VfxResolver } from '../src/visuals/vfx-resolver';
import { resolveAttackRules, LEGACY_RELICS } from '../src/relics';
import { RunFlow, WAVE_INTERMISSION_SECONDS } from '../src/run-flow';
import type { RelicDefinition } from '../src/content/content-types';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const refs = { weapons: Object.keys(ATTACKS), vfx: VFX_PRESETS, reservedIds: Object.keys(LEGACY_RELICS), assetExists: (path:string) => existsSync(`public/${path}`) };
function fixture(area = true) {
  const c = new Combat([],32,()=>.5); c.party = new PartySystem(); c.party.reset(['bubblesalamander']);
  c.fusionEnabled = true; c.automaticSpawning = false; c.reset();
  if (area) expect(c.grantUpgrade('area')).toBe(true);
  for (const a of c.runBuild.attacks) a.cooldown = 10000;
  return c;
}
test('production and synthetic relics register, generate cards/icons and reuse registered handlers', () => {
  const synthetic = { ...tidePrism, id: 'test-water-orb', title: '测试水珠', art: { symbol: 'orb', palette: 'water' },
    modifiers: [
      { handler:'multiply',target:'water-weapon',stat:'damageMultiplier',multiply:1.2,polarity:'benefit' },
      { handler:'multiply',target:'water-weapon',stat:'rangeMultiplier',multiply:.9,polarity:'tradeoff' },
    ], rewards: { upgrade:false,shop:false } } as const satisfies RelicDefinition;
  expect(validateRelicContent([tidePrism,synthetic],refs)).toEqual([]);
  expect(createRelicRegistry([synthetic]).get(synthetic.id)).toBe(synthetic);
  expect(relicMetadata(synthetic)).toMatchObject({title:'测试水珠',benefit:'水系武器伤害 +20%',tradeoff:'水系武器射程 -10%'});
  expect(generatedIcon(synthetic.art)).toContain('data:image/svg+xml,');
  expect(relicIconSvg(synthetic.art)).not.toContain(synthetic.title);
  expect(relicIconSvg(synthetic.art)).toBe(relicIconSvg(synthetic.art));
  expect(relicIcon({...synthetic.art,png:'assets/custom.png'},'/nested/')).toBe('/nested/assets/custom.png');
  const rules = resolveAttackRules('bubble',[],1);
  applyRelicDefinition(rules,synthetic,'bubble',{weapons:['bubble'],ranks:{area:1}});
  expect(rules.damageMultiplier).toBe(1.2); expect(rules.rangeMultiplier).toBe(.9);
  expect(rules.impactVfx).toBe('tidal-ring');
  expect(()=>createRelicRegistry([synthetic,synthetic])).toThrow('Duplicate');
});
test('invalid content reports duplicate IDs, references, metadata, copy, handlers, assets and mode leaks', () => {
  expect(validateRelicContent([tidePrism,tidePrism],refs).join()).toContain('duplicate ID');
  const invalid = [
    {requirements:{weapon:'missing'}},{requirements:{skills:['missing']}},{tags:['missing']},
    {modifiers:[{...tidePrism.modifiers[0],multiply:Infinity}]},
    {modifiers:[{...tidePrism.modifiers[0],handler:'eval'}]},
    {modifiers:[{...tidePrism.modifiers[0],target:'missing'}]},
    {modifiers:[{...tidePrism.modifiers[0],stat:'missing'}]},
    {vfx:{preset:'missing',target:'water-area'}},{vfx:{preset:'water-projectile',target:'water-area'}},
    {art:{symbol:'missing',palette:'water'}},{art:{...tidePrism.art,png:'assets/missing.png'}},
    {title:''},{modes:['legacy']},{description:'水系伤害 +100%'},{rewards:null},
  ];
  for (const override of invalid) expect(validateRelicContent([{...tidePrism,...override}],refs).length,JSON.stringify(override)).toBeGreaterThan(0);
  const resolver = new VfxResolver();
  expect(resolver.impact('water','missing')?.id).toBe('water-impact');
  expect(resolver.impact('water','water-projectile')?.id).toBe('water-impact');
});
test('content CLI rejects an invalid file with a nonzero exit and an actionable error',()=>{
  const dir=mkdtempSync(join(tmpdir(),'monsterbonk-invalid-content-'));
  try {
    const path=join(dir,'invalid.json');writeFileSync(path,JSON.stringify([{...tidePrism,vfx:{preset:'nonexistent',target:'water-area'}}]));
    const result=spawnSync(process.execPath,['scripts/run-content-check.mjs','--file',path],{encoding:'utf8'});
    expect(result.status).toBe(1);expect(result.stderr).toContain('tide-prism: unknown or incompatible VFX');
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test('requirements, unique grants, reset and legacy pools use existing progression', () => {
  const c = fixture(false);
  expect(c.progression.canGrant('tide-prism')).toBe(false);
  expect(c.grantUpgrade('tide-prism')).toBe(false);
  c.grantUpgrade('area'); expect(c.progression.canGrant('tide-prism')).toBe(true);
  expect(c.grantUpgrade('tide-prism')).toBe(true); expect(c.grantUpgrade('tide-prism')).toBe(false);
  expect(c.runBuild.rules('bubble')).toMatchObject({areaMultiplier:1.25,intervalMultiplier:1.1,impactVfx:'tidal-ring'});
  c.reset(); expect(c.runBuild.relics).toEqual([]); expect(c.runBuild.rules('bubble').intervalMultiplier).toBe(1);
  c.fusionEnabled=false;c.reset();expect(c.progression.skills.some(s=>s.id==='tide-prism')).toBe(false);
  const fire=fixture();fire.runBuild.reset('yanrong');expect(fire.progression.canGrant('tide-prism')).toBe(false);
});
test('actual bubble area collision grows, base bubble gains no area, fire and grass stay identical', () => {
  const run = (equipped:boolean,area:boolean) => {
    const c=fixture(area); if(equipped) c.runBuild.addRelic('tide-prism');
    const target=c.spawn('normal',5,0,0)!, edge=c.spawn('normal',5,2.5,0)!;
    target.hp=edge.hp=1000;
    const shot=c.projectiles[0];
    Object.assign(shot,{active:true,x:5,z:0,previousX:5,previousZ:0,vx:0,vz:0,life:1,damage:15,baseDamage:15,distance:0,
      attackId:'bubble',attackRules:c.runBuild.rules('bubble'),elemental:true,burst:false,generation:0,bornTick:-1,ignoreEnemyId:0,
      fusionIds:area?['deep-bubble']:[],hitIds:[],damageIds:[],pierces:0,bounces:0,scatter:false,hopTargetId:0});
    c.update(.001,{x:0,z:0});
    return {hp:edge.hp,effect:c.effects.find(e=>e.active&&e.kind==='water'),c};
  };
  const before=run(false,true),after=run(true,true),base=run(true,false);
  expect(before.hp).toBe(1000);expect(after.hp).toBeLessThan(1000);expect(base.hp).toBe(1000);
  expect(after.effect!.radius).toBeCloseTo(before.effect!.radius!*1.25);
  expect(after.effect!.vfxPresetId).toBe('tidal-ring');expect(base.effect!.vfxPresetId).toBeUndefined();
  for(const attack of ['spark','leaf','flame-sweep'] as const) expect(after.c.runBuild.rules(attack)).toEqual(before.c.runBuild.rules(attack));
  expect(after.c.projectiles).toHaveLength(before.c.projectiles.length);expect(after.c.effects).toHaveLength(COMBAT_LIMITS.effects);
});
test('automatic water cooldown increases by ten percent and in-flight snapshots remain stable', () => {
  const c=fixture();const attack=c.runBuild.attacks[0];attack.cooldown=.4;
  const snapshot=c.runBuild.rules('bubble');expect(c.grantUpgrade('tide-prism')).toBe(true);
  expect(attack.cooldown).toBeCloseTo(.44);expect(snapshot.intervalMultiplier).toBe(1);
  const target=c.spawn('normal',5,0,0)!;target.hp=10000;attack.cooldown=0;
  c.update(.001,{x:0,z:0});expect(attack.cooldownTotal).toBeCloseTo(ATTACKS.bubble.interval*1.1);
});
test('fifth-wave shop uses the legal factory reward, same price, buy and duplicate guard', () => {
  const c=fixture();
  let random=.5;const run=new RunFlow(()=>random);run.waveIndex=4;
  // Find a deterministic legal shop roll without replacing the shop or its candidate list.
  const rare=c.progression.skills.filter(s=>s.category&&c.progression.canGrant(s.id));
  random=(rare.findIndex(s=>s.id==='tide-prism')+.01)/rare.length;
  run.update(run.definition.seconds,c,{x:0,z:0});run.updateRest(WAVE_INTERMISSION_SECONDS,c);
  expect(run.phase).toBe('shop');expect(run.wave).toBe(5);
  const index=run.shop!.items.findIndex(i=>i.skill==='tide-prism');expect(index).toBeGreaterThanOrEqual(0);
  expect(run.shop!.items[index].price).toBe(70);run.coins=100;
  expect(run.buy(index,run.shop!.token)).toBe(true);expect(c.runBuild.relics).toContain('tide-prism');
  expect(c.progression.canGrant('tide-prism')).toBe(false);
});

test('standalone progression assignment shares its authoritative ranks with weapon rules',()=>{
  const p=new Progression();p.reset(true);const build=new RunBuild();build.reset('bubblesalamander');p.build=build;
  expect(p.grant('area')).toBe(true);expect(p.grant('tide-prism')).toBe(true);
  expect(build.rules('bubble').areaMultiplier).toBe(1.25);expect(build.skillRanks).toBe(p.ranks);
});

test('a synthetic fire relic preserves fractional copy and binds the existing direct impact event',()=>{
  const definition={...tidePrism,id:'test-fire-orb',title:'测试火珠',tags:['fire'],requirements:{weapon:'spark'},art:{symbol:'orb',palette:'fire'},
    modifiers:[
      {handler:'multiply',target:'fire-weapon',stat:'damageMultiplier',multiply:1.125,polarity:'benefit'},
      {handler:'multiply',target:'fire-weapon',stat:'intervalMultiplier',multiply:1.1,polarity:'tradeoff'},
    ],vfx:{preset:'tidal-ring',target:'fire-weapon'},rewards:{upgrade:false,shop:false}} as const satisfies RelicDefinition;
  expect(createRelicRegistry([definition]).size).toBe(1);expect(relicMetadata(definition).benefit).toBe('火系武器伤害 +12.5%');
  const c=fixture(false);c.runBuild.reset('yanrong');for(const attack of c.runBuild.attacks)attack.cooldown=10000;
  const rules=c.runBuild.rules('spark');applyRelicDefinition(rules,definition,'spark',{weapons:['spark'],ranks:{}});
  const enemy=c.spawn('normal',5,0,0)!;enemy.hp=1000;
  Object.assign(c.projectiles[0],{active:true,x:5,z:0,previousX:5,previousZ:0,vx:0,vz:0,life:1,distance:0,damage:18*rules.damageMultiplier,
    attackId:'spark',attackRules:rules,elemental:false,burst:false,ignoreEnemyId:0,age:0});
  c.update(.001,{x:0,z:0});expect(enemy.hp).toBeCloseTo(979.75);
  expect(c.effects.find(e=>e.active&&e.kind==='hit')?.vfxPresetId).toBe('tidal-ring');
});

