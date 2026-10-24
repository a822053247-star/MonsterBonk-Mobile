import type { Combat } from './combat';
import { COLORED_BARRAGE_IDS, COLORED_BARRAGES } from './colored-barrage';

export const ITEM_TEST_SKILLS=['screen-barrage',...COLORED_BARRAGE_IDS] as const;
export type ItemTestSkill=typeof ITEM_TEST_SKILLS[number];
export const ITEM_TEST_ALTAR={x:0,z:-1.6,clearRadius:6.2} as const;
export const ITEM_TEST_OPTIONS=ITEM_TEST_SKILLS.map(id=>({id,
  title:id==='screen-barrage'?'星雨弹幕':COLORED_BARRAGES[id].title,
  color:id==='screen-barrage'?'#ffcd87':COLORED_BARRAGES[id].color,
  detail:id==='screen-barrage'?'金色 · 环形 / 扇形 / 交叉':COLORED_BARRAGES[id].benefit,
}));
export function isItemTestSkill(id:string):id is ItemTestSkill{return (ITEM_TEST_SKILLS as readonly string[]).includes(id);}
export function itemTestRank(value:number){return Number.isFinite(value)?Math.max(1,Math.min(3,Math.floor(value))):1;}

/** An isolated, harmless target range; attack simulation stays in the real skill systems. */
export class ItemTestMode {
  private spawnClock=0;
  altarPresent=true;
  readonly rank:number;
  constructor(readonly skill:ItemTestSkill,rank=1){this.rank=itemTestRank(rank);}
  prepare(combat:Combat){
    for(let i=0;i<this.rank;i++)combat.grantUpgrade(this.skill);
    combat.automaticSpawning=false;combat.captureEnabled=false;combat.encounters.beginWave(1);
    this.quietWeapons(combat);
  }
  private quietWeapons(combat:Combat){for(const attack of combat.runBuild.attacks)attack.cooldown=3600;}
  beforeStep(dt:number,combat:Combat,player:{x:number;z:number}){
    if(dt<=0)return;
    this.quietWeapons(combat);combat.invulnerability=Math.max(combat.invulnerability,dt+1);
    for(const enemy of combat.enemies){
      if(!enemy.active)continue;
      if(Math.hypot(enemy.x-player.x,enemy.z-player.z)>17||(this.altarPresent&&Math.hypot(enemy.x-ITEM_TEST_ALTAR.x,enemy.z-ITEM_TEST_ALTAR.z)<ITEM_TEST_ALTAR.clearRadius)){enemy.active=false;continue;}
      enemy.stagger=3600;enemy.knockX=enemy.knockZ=0;
    }
    this.spawnClock=Math.max(0,this.spawnClock-dt);
    if(this.spawnClock>0)return;
    this.spawnClock=1.5;
    let alive=combat.enemies.reduce((n,e)=>n+Number(e.active),0);
    for(let attempt=0;alive<12&&attempt<12;attempt++){
      const enemy=combat.spawnEncounter(alive%4===0?'tank':'normal',player,5.5,10.5);
      if(!enemy)continue;
      if(this.altarPresent&&Math.hypot(enemy.x-ITEM_TEST_ALTAR.x,enemy.z-ITEM_TEST_ALTAR.z)<ITEM_TEST_ALTAR.clearRadius){enemy.active=false;continue;}
      enemy.spawnTime=0;enemy.hp=enemy.maxHp=120;enemy.stagger=3600;enemy.knockX=enemy.knockZ=0;
      alive++;
    }
  }
  afterStep(combat:Combat){
    // Training rewards never open upgrade choices or become a real run's economy.
    for(const orb of combat.orbs)orb.active=false;
    const p=combat.progression;p.pendingChoices=0;p.experience=p.totalExperience=0;p.level=1;
    // Altar trial damage persists in this session; only restarting restores health.
    combat.goldEarned=0;
  }
}
