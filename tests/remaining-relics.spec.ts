import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem, type SpeciesId } from '../src/party';
import type { BaseAttackId } from '../src/fusion';
import type { SkillId } from '../src/progression';

const origin = {x:0,z:0};
function fixture(species: SpeciesId = 'yanrong') {
  const c = new Combat([],32,()=>.5); c.party = new PartySystem(); c.party.reset([species]);
  c.fusionEnabled = true; c.automaticSpawning = false; c.reset();
  for(const attack of c.runBuild.attacks) attack.cooldown = 10000;
  return c;
}
function tick(c: Combat, dt = .001) { c.party!.syncLeader(origin,0); c.update(dt,origin); }
function grant(c: Combat, ...ids: SkillId[]) { for(const id of ids) expect(c.grantUpgrade(id)).toBe(true); }
function impact(c: Combat, target: Combat['enemies'][number], attackId: BaseAttackId, damage = 40) {
  const p = c.projectiles.find(p=>!p.active)!;
  Object.assign(p,{active:true,x:target.x,z:target.z,previousX:target.x,previousZ:target.z,vx:0,vz:0,life:1,distance:0,
    damage,baseDamage:damage,attackId,attackRules:c.runBuild.rules(attackId),relicSource:undefined,
    generation:0,bornTick:-1,ignoreEnemyId:0,burst:false,elemental:attackId!=='spark',homing:false,
    fusionIds:[],hitIds:[],damageIds:[],pierces:0,bounces:0,scatter:false,hopTargetId:0});
  tick(c);
}
function cast(c: Combat, id: BaseAttackId = 'spark') {
  for(const p of c.projectiles) p.active = false;
  // Wait out the normal volley gap and finish each real volley before the next.
  tick(c,.2);
  const attack = c.runBuild.attacks.find(a=>a.attackId===id)!;
  attack.cooldown = 0; tick(c);
  attack.cooldown = 10000;
  return c.projectiles.find(p=>p.active && !p.relicSource?.copied);
}

test('remaining relic acquisition is unique, water requires bubble, and legacy pools stay unchanged', () => {
  const fire = fixture();
  expect(fire.grantUpgrade('draft-bubble-spore')).toBe(false);
  grant(fire,'draft-echo-bone-dice','draft-slaughter-hourglass');
  expect(fire.grantUpgrade('draft-echo-bone-dice')).toBe(false);
  const water = fixture('bubblesalamander'); grant(water,'draft-bubble-spore','echo-rune');
  const legacy = new Combat(); legacy.reset();
  expect(legacy.progression.skills.some(s=>s.id.startsWith('draft-'))).toBe(false);
});

test('water kill emits one small bubble, bounces to two fresh targets, and cannot spawn itself', () => {
  const c = fixture('bubblesalamander'); grant(c,'draft-bubble-spore');
  const seed = c.spawn('normal',6,0,0)!;
  const targets = [7.5,9,10.5].map(x=>c.spawn('tank',x,0,0)!);
  for(const e of targets) e.hp = 1;
  impact(c,seed,'bubble');
  const bubble = c.projectiles.find(p=>p.active)!;
  expect(bubble.damage).toBe(14); expect(bubble.bounces).toBe(2);
  for(let i=0;i<120;i++) tick(c,.01);
  expect(targets.map(e=>e.active)).toEqual([false,false,false]);
  expect(c.relicTelemetry.bubbles).toBe(1); expect(c.kills).toBe(4); expect(c.goldEarned).toBe(7);
});

test('spore cooldown suppresses simultaneous kills and recovers after .35 seconds', () => {
  const c = fixture('bubblesalamander'); grant(c,'draft-bubble-spore');
  for(let i=0;i<3;i++) { const e=c.spawn('normal',7+i,0,0)!; impact(c,e,'bubble'); }
  expect(c.relicTelemetry.bubbles).toBe(1);
  tick(c,.35); const e=c.spawn('normal',8,2,0)!; impact(c,e,'bubble');
  expect(c.relicTelemetry.bubbles).toBe(2);
  c.clearWave(); expect(c.inspect().triggerRelics.bubbleCooldown).toBe(0);
});

test('echo rune boosts spore chain reach and decay without requiring a separate chain card', () => {
  const c = fixture('bubblesalamander'); grant(c,'draft-bubble-spore','echo-rune');
  const seed=c.spawn('normal',6,0,0)!, first=c.spawn('tank',7.5,0,0)!, far=c.spawn('tank',10.7,0,0)!;
  impact(c,seed,'bubble');
  for(let i=0;i<80;i++) tick(c,.01);
  expect(first.hp).toBeCloseTo(86);
  expect(far.hp).toBeCloseTo(100-14*.65*.7);
});

test('water splash kills retain water attribution, but unrelated kills never emit spores', () => {
  const c = fixture('bubblesalamander'); grant(c,'draft-bubble-spore','area');
  const tank=c.spawn('tank',6,0,0)!, neighbor=c.spawn('normal',7,0,0)!; neighbor.hp=1;
  // Fire an actual area-enabled weapon at a durable primary target.
  const shot=cast(c,'bubble')!;
  Object.assign(shot,{x:tank.x,z:tank.z,vx:0,vz:0}); tick(c);
  expect(neighbor.active).toBe(false); expect(c.relicTelemetry.bubbles).toBe(1);
  const unrelated=fixture('bubblesalamander'); grant(unrelated,'draft-bubble-spore');
  impact(unrelated,unrelated.spawn('normal',7,0,0)!,'spark');
  expect(unrelated.relicTelemetry.bubbles).toBe(0);
});

test('dice copies the fourth attack after the fifth cast, including the fourth weapon identity', () => {
  const c=fixture(); grant(c,'draft-echo-bone-dice','bubble-weapon');
  c.runBuild.attacks[1].cooldown=10000;
  c.spawn('tank',7,0,0)!.hp=10000;
  cast(c); cast(c); cast(c); cast(c,'bubble'); cast(c);
  expect(c.inspect().triggerRelics.casts).toBe(5);
  expect(c.inspect().triggerRelics.pendingEchoes).toBe(1);
  tick(c,.12);
  const echo=c.projectiles.find(p=>p.active && p.relicSource?.copied)!;
  expect(echo.attackId).toBe('bubble'); expect(echo.damage).toBe(7.5);
  expect(c.relicTelemetry.echoes).toBe(1);
  for(let i=0;i<50;i++) tick(c,.02);
  expect(c.inspect().triggerRelics.casts).toBe(5); expect(c.relicTelemetry.echoes).toBe(1);
});

test('multishot counts one volley, not its three pellets, and copied fire retains split effects', () => {
  const c=fixture(); grant(c,'draft-echo-bone-dice','multishot','multishot','split-on-hit');
  const target=c.spawn('tank',7,0,0)!; target.hp=10000;
  for(let volley=0;volley<5;volley++) {
    cast(c);
    tick(c,.081); tick(c,.081);
    for(const p of c.projectiles) p.active=false;
  }
  expect(c.inspect().triggerRelics.casts).toBe(5);
  expect(c.relicTelemetry.echoes).toBe(1);
  // The echo was born after .12s during the final volley; arrange a second cycle without deleting it.
  for(let volley=0;volley<5;volley++) {
    cast(c); tick(c,.081);
    if(volley<4) tick(c,.081);
  }
  tick(c,.081);
  const echo=c.projectiles.find(p=>p.active && p.relicSource?.copied)!;
  expect(echo.damage).toBe(9); expect(echo.burst).toBe(true);
  const before=c.bursts;
  Object.assign(echo,{x:target.x,z:target.z,vx:0,vz:0}); tick(c);
  expect(c.bursts).toBe(before+1);
  expect(c.projectiles.some(p=>p.active && p.relicSource?.copied && p.generation===1 && !p.burst)).toBe(true);
});

test('copied melee deals half damage, respects existing hit rules and never changes the cast counter', () => {
  const c=fixture(); grant(c,'draft-echo-bone-dice','flame-sweep-weapon');
  c.runBuild.attacks[1].cooldown=10000;
  const target=c.spawn('tank',2,0,0)!; target.hp=10000;
  for(let i=0;i<5;i++) cast(c,'flame-sweep');
  const hp=target.hp; tick(c,.12);
  expect(target.hp).toBeCloseTo(hp-18);
  expect(c.relicTelemetry.echoes).toBe(1); expect(c.inspect().triggerRelics.casts).toBe(5);
});

test('echo snapshots survive upgrades and full pools skip only the copy after its explicit deadline', () => {
  const c=fixture(); grant(c,'draft-echo-bone-dice'); c.spawn('tank',7,0,0)!.hp=10000;
  for(let i=0;i<5;i++) cast(c);
  grant(c,'spark-weapon'); tick(c,.12);
  expect(c.projectiles.find(p=>p.active && p.relicSource?.copied)!.damage).toBe(9);
  const full=fixture(); grant(full,'draft-echo-bone-dice'); full.spawn('tank',7,0,0)!.hp=10000;
  for(let i=0;i<5;i++) cast(full);
  for(const p of full.projectiles) Object.assign(p,{active:true,x:20,z:20,vx:0,vz:0,life:10});
  tick(full,.2); expect(full.relicTelemetry.echoes).toBe(0);
  tick(full,.6); expect(full.relicTelemetry.echoesSkipped).toBe(1);
  expect(full.projectiles.filter(p=>p.active)).toHaveLength(24);
});

test('eight kills within four seconds trigger exactly three seconds of +30% cooldown progress', () => {
  const c=fixture(); grant(c,'draft-slaughter-hourglass');
  for(let i=0;i<8;i++) impact(c,c.spawn('normal',7,0,0)!,'spark');
  expect(c.relicTelemetry.hourglassProcs).toBe(1);
  c.runBuild.attacks[0].cooldown=100;
  tick(c,3); expect(c.runBuild.attacks[0].cooldown).toBeCloseTo(96.1);
  tick(c,1); expect(c.runBuild.attacks[0].cooldown).toBeCloseTo(95.1);
  expect(c.inspect().triggerRelics.hasteRemaining).toBe(0);
});

test('hourglass sliding window expires, cooldown kills do not bank, and the buff never refreshes', () => {
  const c=fixture(); grant(c,'draft-slaughter-hourglass');
  for(let i=0;i<7;i++) impact(c,c.spawn('normal',7,0,0)!,'spark');
  tick(c,4.01); impact(c,c.spawn('normal',7,0,0)!,'spark'); expect(c.relicTelemetry.hourglassProcs).toBe(0);
  for(let i=0;i<7;i++) impact(c,c.spawn('normal',7,0,0)!,'spark');
  const end=c.inspect().triggerRelics.hasteRemaining;
  for(let i=0;i<12;i++) impact(c,c.spawn('normal',7,0,0)!,'spark');
  expect(c.relicTelemetry.hourglassProcs).toBe(1);
  expect(c.inspect().triggerRelics.hasteRemaining).toBeLessThan(end);
  tick(c,8); impact(c,c.spawn('normal',7,0,0)!,'spark'); expect(c.relicTelemetry.hourglassProcs).toBe(1);
  for(let i=0;i<7;i++) impact(c,c.spawn('normal',7,0,0)!,'spark');
  expect(c.relicTelemetry.hourglassProcs).toBe(2);
});

test('pause, player death, wave clear and reset stop or clear all three new relic clocks', () => {
  const c=fixture(); grant(c,'draft-echo-bone-dice','draft-slaughter-hourglass');
  c.spawn('tank',7,0,0)!.hp=10000;
  for(let i=0;i<5;i++) cast(c);
  c.progression.gainExperience(c.progression.threshold);
  const before=c.inspect().triggerRelics; tick(c,1); expect(c.inspect().triggerRelics).toEqual(before);
  c.hp=0; tick(c,1); expect(c.inspect().triggerRelics).toEqual(before);
  c.clearWave(); expect(c.inspect().triggerRelics.pendingEchoes).toBe(0);
  expect(c.inspect().triggerRelics.casts).toBe(0); expect(c.inspect().triggerRelics.hasteRemaining).toBe(0);
  c.reset(); expect(c.relicTelemetry.echoes).toBe(0); expect(c.relicTelemetry.hourglassProcs).toBe(0);
});

test('all six trigger relics coexist in a deterministic dense mixed-weapon run within fixed pools', () => {
  const simulate = () => {
    const c=fixture();
    grant(c,'bubble-weapon','leaf-weapon','split-on-hit','chain','area','multishot',
      'draft-martyr-core','draft-kindling-flask','draft-thorn-testament',
      'draft-bubble-spore','draft-echo-bone-dice','draft-slaughter-hourglass');
    c.hp=100000;
    for(const a of c.runBuild.attacks) a.cooldown=0;
    for(let frame=0;frame<900;frame++) {
      if(frame%6===0) {
        for(let j=0;j<4;j++) {
          const angle=(frame+j)*2.399963;
          c.spawn('normal',Math.cos(angle)*5,Math.sin(angle)*5,0);
        }
      }
      while(c.progression.awaitingChoice) expect(c.chooseUpgrade(c.progression.offers[0])).toBe(true);
      tick(c,1/60);
      expect(c.projectiles.filter(p=>p.active).length).toBeLessThanOrEqual(24);
      expect(c.inspect().triggerRelics.pending).toBeLessThanOrEqual(256);
    }
    expect(c.relicTelemetry.echoes).toBeGreaterThan(0);
    expect(c.relicTelemetry.bubbles).toBeGreaterThan(0);
    expect(c.relicTelemetry.thorns).toBeGreaterThan(0);
    expect(c.relicTelemetry.explosions).toBeGreaterThan(0);
    expect(c.relicTelemetry.hourglassProcs).toBeGreaterThan(0);
    expect(c.relicTelemetry.maxGeneration).toBeLessThanOrEqual(2);
    return { telemetry:c.relicTelemetry, kills:c.kills, gold:c.goldEarned, shots:c.shotsFired };
  };
  expect(simulate()).toEqual(simulate());
});
