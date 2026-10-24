import type { Combat } from './combat';
import type { RunFlow } from './run-flow';
import { ATTACKS } from './run-build';
import type { BaseAttackId } from './fusion';
import type { SkillId } from './progression';

/** Only implemented, directly playable scenarios belong in this registry. */
export const NEW_FEATURE_TESTS = [
  { id: 'weapon-slots-4', title: '四武器 · 第1波', wave: 1, detail: '从3把武器开始，添加第4把，观察满槽限制与自动攻击。' },
  { id: 'weapon-slots-6', title: '六武器 · 第7波', wave: 7, detail: '直接进入第7波，逐把添加至6把，体验多武器协同。' },
  { id: 'weapon-slots-8', title: '八武器 · 第13波', wave: 13, detail: '直接进入第13波，逐把添加至8把，观察攻击、升级与融合。' },
  { id: 'event-lifecycle', title: '事件生命周期', wave: 2, detail: '附近封印宝箱，可完成、放弃或跳到跨波边界，观察清理与奖励。' },
  { id: 'sealed-chest', title: '封印宝箱', wave: 2, detail: '走近宝箱按E或点击开启，守住附近20秒，成功获得1件奖励。' },
  { id: 'sealed-chest-low-health', title: '封印宝箱 · 残血', wave: 2, detail: '20点生命起步，观察挑战失败、放弃和重新开始。' },
  { id: 'weapon-exchange', title: '武器置换与预览', wave: 7, detail: '满槽构筑、首武器5级和适用遗物，查看5→3、金币及机制影响后确认或取消。' },
  { id: 'weapon-exchange-poor', title: '置换 · 金币不足', wave: 7, detail: '预设0金币，选择武器后确认不可用；取消不改变构筑。' },
  { id: 'weapon-exchange-fusion', title: '置换 · 融合保护', wave: 7, detail: '预设蒸汽彗星，融合武器不可交出，已消耗来源不能作为候选。' },
  { id: 'lost-workshop', title: '失落工坊', wave: 10, detail: '走近工坊按E，免费置换一次；取消保留机会，成功后工坊消失。' },
  { id: 'shop-exchange', title: '商店付费置换', wave: 11, detail: '直接打开无尽商店；每店一次，刷新不恢复置换次数。' },
  { id: 'region-meadow', title: '繁花草甸 · 自由观察', wave: 1, detail: '不出怪的地区观察；可切换固定/随机地形，或一键开始真实战斗。' },
  { id: 'region-ruins', title: '晶石遗迹 · 自由观察', wave: 1, detail: '查看青灰石庭、中央晶纹与对称残柱；四向出口贯通，可切随机地形或同图实战。' },
  { id: 'region-meadow-combat', title: '繁花草甸 · 实战', wave: 1, detail: '真实无尽出怪与成长；可放置封印宝箱，查看通用强化奖励倾向。' },
  { id: 'region-ruins-combat', title: '晶石遗迹 · 实战', wave: 1, detail: '在晶纹石庭与残柱、晶簇之间战斗；可放置封印宝箱观察武器奖励偏好。' },
  { id: 'region-choice', title: 'Boss后地区选路', wave: 6, detail: '预设Boss击败，体验真实首通宝箱→选路→加载→第7波；重开可选另一地区。' },
  { id: 'region-snowfield', title: '永恒雪原 · 自由观察', wave: 1, detail: '观察雪岸与冰原，绕行16种实体冰晶/覆雪岩；可切随机地形或同图实战。' },
  { id: 'region-snowfield-combat', title: '永恒雪原 · 实战', wave: 1, detail: '真实无尽战斗；冰池与石台均不可穿过，可放置封印宝箱查看通用强化倾向。' },
  { id: 'region-volcano', title: '熔岩火山 · 自由观察', wave: 1, detail: '查看留白石庭、局部熔池和少量火山地标；可切随机地形或同图实战。' },
  { id: 'region-volcano-combat', title: '熔岩火山 · 实战', wave: 1, detail: '真实无尽战斗；熔池等均为实体障碍，不造成灼伤；可放置封印宝箱查看武器奖励倾向。' },
] as const;
export type NewFeatureTestId = typeof NEW_FEATURE_TESTS[number]['id'];
export function newFeatureTest(id: string) { return NEW_FEATURE_TESTS.find(test => test.id === id); }
export const NEW_FEATURE_PHASES = [
  '第三批：移动、轮换、拾取与反击遗物',
  '第四批：可选契约、悬赏与探索补给',
  '第五批：湿地与灰烬林地、长局整合',
] as const;

export function addFeatureTestWeapon(combat: Combat) {
  if (combat.runBuild.attacks.length >= combat.runBuild.weaponLimit) return false;
  const next = (Object.keys(ATTACKS) as BaseAttackId[]).find(id =>
    !combat.runBuild.hasOrigin(id) && combat.progression.canGrant(`${id}-weapon` as SkillId));
  return !!next && combat.grantUpgrade(`${next}-weapon` as SkillId);
}

/** Seed through production reward paths; all grants are confined to this fresh run. */
export function prepareNewFeatureTest(id: NewFeatureTestId, combat: Combat, run: RunFlow, player: {x:number;z:number}) {
  const scenario = newFeatureTest(id)!;
  run.waveIndex = scenario.wave - 1;
  run.prepare(combat, player);
  for (let i = combat.runBuild.attacks.length; i < 3; i++) addFeatureTestWeapon(combat);
  for (const skill of ['damage', 'damage', 'haste', 'vitality', 'vitality'] as const) combat.grantUpgrade(skill);
  run.coins = 600;
  if (id.startsWith('weapon-exchange') || id==='lost-workshop' || id==='shop-exchange' || id==='region-choice') {
    while (combat.runBuild.attacks.length < combat.runBuild.weaponLimit && addFeatureTestWeapon(combat)) { /* seed full slots */ }
    for (const attack of combat.runBuild.attacks) {
      while (attack.level < 3 && combat.grantUpgrade(`${attack.attackId}-weapon` as SkillId)) { /* seed level three */ }
    }
    for (const skill of ['split-on-hit','area','chain','draft-martyr-core','draft-boiling-core'] as const) {
      if (combat.progression.canGrant(skill)) combat.grantUpgrade(skill);
    }
  }
  if (id === 'weapon-exchange-fusion') {
    combat.progression.gainExperience(combat.progression.threshold-combat.progression.experience);
    combat.confirmWeaponPair('steam-comet');
  }
  if (id === 'weapon-exchange') {
    const first=combat.runBuild.attacks[0].attackId;
    combat.grantUpgrade(`${first}-weapon` as SkillId);combat.grantUpgrade(`${first}-weapon` as SkillId);
  }
  if (id === 'weapon-exchange-poor') run.coins = 0;
  if (id === 'sealed-chest-low-health') combat.hp = 20;
  if (id === 'region-choice') {
    // Fixture shortcut only; settlement, treasure, intermission and route selection stay real.
    const boss=combat.encounters.boss;
    if(boss){
      boss.hp=0;boss.active=false;combat.encounters.killedBoss(combat);combat.encounters.beforeTick(1.1);
      run.update(.01,combat,player);
    }
  }
}
