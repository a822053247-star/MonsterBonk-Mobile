import type { Combat, Enemy } from './combat';
import type { SkillId } from './progression';

export const BUILD_DEMOS = [
  { title: '成长前', detail: '二级火花 · 分裂 · 殉爆', description: '二级火花尚未觉醒：殉爆按致死伤害减半，通常只能削弱相邻怪物。' },
  { title: '连爆觉醒', detail: '五级火花 · 分裂 · 油壶 · 殉爆', description: '火花到达三级并拥有分裂后觉醒。击杀向外传播，最多三代；燃烧击杀也能接续。' },
  { title: '水火蒸爆', detail: '水泡铺湿润 → 火花引爆 → 殉爆接力', description: '水泡先铺湿润，火花消耗状态引发大范围蒸爆。蒸爆击杀继续触发殉爆，最多24个觉醒连锁节点。' },
  { title: '割草高潮', detail: '满级横扫 · 水泡 · 蒸爆 · 沙漏 · 回声', description: '水泡铺状态，满级火浪扫过怪群，引发蒸爆和连爆；连杀推动沙漏，再由回声追加施放。' },
] as const;

/** Fixed positions and declared wave-five swarm HP; all attacks/damage use real Combat. */
export function arrangeBuildDemo(c: Combat, index: number) {
  c.party!.reset([index >= 2 ? 'bubblesalamander' : 'yanrong']); c.reset(); c.encounters.beginWave(5);
  c.invulnerability = 10000;
  const player = { x: index === 3 ? 0 : -6.5, z: 0 };
  const grant = (id: SkillId, count = 1) => { for (let i = 0; i < count; i++) if (!c.grantUpgrade(id)) throw new Error(`Invalid demo reward: ${id}`); };
  grant('damage', 4);
  if (index < 3) {
    if (index >= 2) { grant('spark-weapon', 5); grant('bubble-weapon', 2); grant('area'); grant('chain'); }
    else grant('spark-weapon', index === 0 ? 1 : 4);
    grant('split-on-hit'); grant('draft-martyr-core');
    if (index > 0) grant('draft-kindling-flask');
  } else {
    grant('flame-sweep-weapon', 5); grant('bubble-weapon', 2); grant('area'); grant('chain');
    grant('haste', 3); grant('multishot', 2); grant('draft-martyr-core'); grant('draft-kindling-flask');
    grant('draft-slaughter-hourglass'); grant('draft-echo-bone-dice');
  }
  if (index >= 2) grant('draft-boiling-core');
  for (const attack of c.runBuild.attacks) attack.cooldown = attack.attackId === 'bubble' ? .05 : index >= 2 ? .65 : .3;
  const targets: { enemy: Enemy; x: number; z: number }[] = [];
  const add = (x: number, z: number, tank = false) => {
    const enemy = c.spawn(tank ? 'tank' : 'normal', x, z, 0)!;
    enemy.stagger = 10000;
    if (!tank) { enemy.swarm = true; enemy.hp = enemy.maxHp = 20; }
    targets.push({ enemy, x, z });
  };
  if (index === 3) {
    for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8 + ring * .15, radius = 2.7 + ring * 1.35;
      add(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    for (let i = 0; i < 4; i++) add(Math.cos(i*Math.PI/2)*3.7, Math.sin(i*Math.PI/2)*3.7, true);
  } else {
    for (let col = 0; col < 6; col++) for (let row = -1; row <= 1; row++) add(-2.8 + col * 1.3, row * 1.3);
    add(3.8, 2.6, true); add(3.8, -2.6, true);
  }
  return { player, targets };
}
