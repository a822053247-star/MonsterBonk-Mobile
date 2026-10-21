import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { RunFlow, RUN_WAVES, SHOP_AFTER_WAVE, WAVE_INTERMISSION_SECONDS } from '../src/run-flow';

const origin = { x: 0, z: 0 };
function fixture() {
  const c = new Combat([], 32, () => .999);
  c.party = new PartySystem(); c.fusionEnabled = true; c.automaticSpawning = false; c.reset();
  return { c, run: new RunFlow(() => 0) };
}
function fifthShop(f: ReturnType<typeof fixture>) {
  f.run.waveIndex = 4;
  f.run.update(f.run.definition.seconds, f.c, origin);
  expect(f.run.phase).toBe('intermission');
  expect(f.run.shop).toBeUndefined();
  f.run.updateRest(WAVE_INTERMISSION_SECONDS, f.c);
  expect(f.run.phase).toBe('shop');
  return f.run.shop!;
}

test('survival waves connect seamlessly and only wave five rests for the shop', () => {
  const { c, run } = fixture();
  expect(SHOP_AFTER_WAVE).toBe(5);
  for(let wave=1; wave<=6; wave++) {
    if(wave===6) {
      run.prepare(c,origin);
      const boss=c.encounters.boss!;boss.spawnTime=0;
      (c as any).damageEnemy(boss,boss.hp,0,0); c.encounters.beforeTick(1);
    }
    expect(run.wave).toBe(wave);
    run.update(run.definition.seconds,c,origin);
    if(wave<5) {
      expect(run.phase).toBe('fighting');expect(run.wave).toBe(wave+1);
      expect(run.intermissionRemaining).toBe(0);
    } else if(wave<6) {
      expect(run.phase).toBe('intermission');
      expect(run.shop).toBeUndefined();
      run.updateRest(WAVE_INTERMISSION_SECONDS/2,c);
      expect(run.phase).toBe('intermission');
      run.updateRest(WAVE_INTERMISSION_SECONDS/2,c);
      if(wave<5) {
        expect(run.phase).toBe('fighting');
        expect(run.wave).toBe(wave+1);
      } else {
        expect(run.phase).toBe('shop');
        expect(run.wave).toBe(5);
        const token=run.shop!.token;
        run.update(100,c,origin);expect(run.wave).toBe(5);
        run.updateRest(20,c);
        expect(run.nextWave(token,c)).toBe(true);
        expect(run.nextWave(token,c)).toBe(false);
      }
    }
  }
  expect(run.phase).toBe('won');
  expect(run.completedWaves).toBe(6);
  expect(run.combatElapsed).toBe(455);
  expect(run.totalElapsed).toBeCloseTo(455+WAVE_INTERMISSION_SECONDS+20);
  expect(run.coins).toBe(225);
  expect(RUN_WAVES).toHaveLength(6);
});

for(const wave of [1,2,3,4]) test(`wave ${wave} continues immediately with living enemies, loose XP and active combat state intact`,()=>{
  const {c,run}=fixture();c.hp=73;
  run.waveIndex=wave-1;
  const reward=run.definition.reward;
  Object.assign(c.orbs[0],{active:true,value:8});
  run.prepare(c,origin);
  const enemy=c.spawn('tank',6,0,0)!;
  enemy.hp=37; enemy.burnTime=1.2; enemy.burnStacks=2;
  c.invulnerability=.3; c.hurtFlash=.1;
  Object.assign(c.projectiles[0],{active:true,life:1.5});
  Object.assign(c.effects[0],{active:true,life:.3});
  const previous=JSON.stringify({enemy,orb:c.orbs[0],shot:c.projectiles[0],effect:c.effects[0]});
  run.update(run.definition.seconds,c,origin);
  expect(run.phase).toBe('fighting');expect(run.wave).toBe(wave+1);
  expect(run.intermissionRemaining).toBe(0);expect(run.restElapsed).toBe(0);
  expect(c.progression.awaitingChoice).toBe(false);expect(c.progression.totalExperience).toBe(0);
  run.prepare(c,origin);
  expect(JSON.stringify({enemy,orb:c.orbs[0],shot:c.projectiles[0],effect:c.effects[0]})).toBe(previous);
  expect(c.invulnerability).toBe(.3);expect(c.hurtFlash).toBe(.1);
  expect(c.kills).toBe(0);expect(run.completedWaves).toBe(1);
  run.resolveBoundary(c);
  expect(run.coins).toBe(reward);expect(c.hp).toBe(73);
  (c as any).damageEnemy(enemy,enemy.hp,0,0);
  run.update(.01,c,origin);
  expect(c.kills).toBe(1);expect(run.coins).toBe(reward+2);
  (c as any).damageEnemy(enemy,1000,0,0);
  run.update(.01,c,origin);
  expect(c.kills).toBe(1);expect(run.coins).toBe(reward+2);
});

test('unfinished elite and hostile warnings carry into wave five, then shop clears them',()=>{
  const {c,run}=fixture();run.waveIndex=3;run.waveElapsed=12;run.prepare(c,origin);
  const elite=c.encounters.elite!;elite.hp=239;
  c.encounters.elitePulsing=true;c.encounters.eliteTime=.3;c.encounters.eliteCooldown=.7;
  c.encounters.shots[0].active=true;
  run.waveElapsed=75;run.resolveBoundary(c);run.prepare(c,origin);
  expect(run.wave).toBe(5);expect(c.encounters.elite).toBe(elite);expect(elite.active).toBe(true);expect(elite.hp).toBe(239);
  expect(c.encounters.elitePulsing).toBe(true);expect(c.encounters.eliteTime).toBe(.3);expect(c.encounters.eliteCooldown).toBe(.7);
  expect(c.encounters.shots[0].active).toBe(true);
  run.waveElapsed=80;run.resolveBoundary(c);
  expect(run.phase).toBe('intermission');expect(elite.active).toBe(false);expect(c.encounters.shots[0].active).toBe(false);
  run.updateRest(WAVE_INTERMISSION_SECONDS,c);expect(run.phase).toBe('shop');
});

test('real kills earn gold once and cannot be recycled into duplicates',()=>{
  const {c,run}=fixture();
  c.spawn('normal',5,0,0)!.hp=1;c.update(.3,origin);run.update(.3,c,origin);
  expect(c.kills).toBe(1);expect(run.coins).toBe(1);
  const e=c.spawn('tank',7,0,0)!;e.active=false;
  run.update(.01,c,origin);expect(run.coins).toBe(1);
  run.waveElapsed=65;run.resolveBoundary(c);expect(run.coins).toBe(36);
});

test('treasure rewards scale by wave and cap farmable coins, healing, and free upgrades', () => {
  const { run } = fixture();
  expect(run.treasureCoinReward).toBe(30);
  expect(run.treasureHealRemaining).toBe(70);
  expect(run.canClaimTreasureUpgrade).toBe(true);

  expect(run.grantTreasureCoins(30)).toBe(30);
  run.waveIndex = 4;
  expect(run.treasureCoinReward).toBe(50);
  expect(run.grantTreasureCoins(50)).toBe(50);
  expect(run.treasureCoinReward).toBe(20);
  expect(run.grantTreasureCoins(50)).toBe(20);
  expect(run.treasureCoinReward).toBe(0);
  expect(run.grantTreasureCoins(20)).toBe(0);
  expect(run.coins).toBe(100);

  expect(run.grantTreasureHealing(35)).toBe(35);
  expect(run.grantTreasureHealing(35)).toBe(35);
  expect(run.grantTreasureHealing(35)).toBe(0);
  expect(run.treasureHealRemaining).toBe(0);
  expect(run.claimTreasureUpgrade()).toBe(true);
  expect(run.claimTreasureUpgrade()).toBe(false);

  const fresh = fixture().run;
  expect(fresh.treasureCoinReward).toBe(30);
  expect(fresh.treasureHealRemaining).toBe(70);
  expect(fresh.canClaimTreasureUpgrade).toBe(true);
});



test('the fifth-wave shop still has atomic purchases, stale tokens and insufficient-fund protection',()=>{
  const f=fixture(),s=fifthShop(f),token=s.token;
  expect(s.items[0].price).toBe(35);
  const xp=f.c.progression.totalExperience;
  expect(f.run.buy(0,token)).toBe(true);expect(f.run.coins).toBe(20);
  expect(f.c.runBuild.attacks).toHaveLength(2);
  expect(f.c.progression.totalExperience).toBe(xp);
  expect(f.run.buy(0,token)).toBe(false);
  expect(f.run.buy(1,s.token)).toBe(false);
  expect(f.run.refresh(s.token)).toBe(true);expect(f.run.coins).toBe(15);
  expect(f.run.refresh(token)).toBe(false);
});

test('only fifth shop can heal and paid refreshes remain progressive',()=>{
  const f=fixture(); f.c.hp=40;const s=fifthShop(f);
  expect(f.run.buy(3,s.token)).toBe(true);expect(f.c.hp).toBe(75);
  expect(f.run.coins).toBe(37);const token=s.token;
  expect(f.run.refresh(token)).toBe(true);expect(f.run.coins).toBe(32);expect(s.refreshCost).toBe(10);
  expect(f.run.buy(0,token)).toBe(false);expect(f.run.refresh(token)).toBe(false);
  expect(f.run.refresh(s.token)).toBe(true);expect(f.run.coins).toBe(22);expect(s.refreshCost).toBe(15);
  const frozen=JSON.stringify(f.c.inspect());f.run.updateRest(20,f.c);
  expect(JSON.stringify(f.c.inspect())).toBe(frozen);
  expect(f.run.nextWave(s.token,f.c)).toBe(true);expect(f.run.wave).toBe(6);
  expect(f.c.hp).toBe(75);
});

test('shop is not accessible during any earlier wave and unspent rewards accumulate',()=>{
  const {c,run}=fixture();
  for(let wave=1;wave<=5;wave++) {
    run.update(run.definition.seconds,c,origin);
    expect(run.buy(0,'anything')).toBe(false);
    expect(run.refresh('anything')).toBe(false);
    run.updateRest(WAVE_INTERMISSION_SECONDS,c);
  }
  expect(run.phase).toBe('shop');
  expect(run.coins).toBe(225);
  expect(run.shop!.items.length).toBe(4);
});

test('death at the final boundary loses and historical modes do not inherit shops',()=>{
  const {c,run}=fixture();run.waveIndex=5;run.waveElapsed=90;c.hp=0;
  run.resolveBoundary(c);expect(run.phase).toBe('lost');
  expect(run.completedWaves).toBe(0);
  c.fusionEnabled=false;c.automaticSpawning=true;c.reset();
  expect(c.progression.skills).toHaveLength(8);expect(c.goldEarned).toBe(0);
});
