export type SkillId = 'damage' | 'haste' | 'multishot' | 'vitality' | 'movement' | 'range' | 'orbit' | 'shockwave' | 'split-on-hit' | 'area' | 'chain';
export type SkillRanks = Record<SkillId, number>;
export interface SkillStats {
  damageMultiplier: number; attackRateMultiplier: number; projectileCount: number;
  maxHp: number; moveMultiplier: number; rangeMultiplier: number;
  orbitCount: number; orbitDamage: number; orbitRadius: number; orbitSpeed: number;
  shockDamage: number; shockRadius: number; shockInterval: number;
  splitOnHit: number;
}
type AdditiveStat = 'damageMultiplier' | 'attackRateMultiplier' | 'projectileCount' | 'maxHp' | 'moveMultiplier' | 'rangeMultiplier';
type Effect = { type: 'add'; stat: AdditiveStat; perRank: number; percent?: boolean }
  | { type: 'spell'; levels: readonly Partial<SkillStats>[] };
export interface SkillDefinition {
  id: SkillId; title: string; benefit: string; description: string;
  maxRank: number; icon: 'spark' | 'dash' | 'battle' | 'heart' | 'leaf' | 'compass' | 'orbit' | 'wave';
  color: string; effect: Effect;
}

/** Balance lives here; percentages are additive relative to the unmodified base. */
export const SKILLS: readonly SkillDefinition[] = [
  { id: 'damage', title: '魔力浓缩', benefit: '魔法弹伤害 +20%', description: '每级增加基础魔法弹伤害的 20%，让每一发魔法更有分量。', maxRank: 5, icon: 'spark', color: '#d6b9f5', effect: { type: 'add', stat: 'damageMultiplier', perRank: 0.2, percent: true } },
  { id: 'haste', title: '施法节拍', benefit: '攻击速度 +15%', description: '每级增加基础攻击频率的 15%，缩短两次自动施法之间的等待。', maxRank: 5, icon: 'dash', color: '#f4ce93', effect: { type: 'add', stat: 'attackRateMultiplier', perRank: 0.15, percent: true } },
  { id: 'multishot', title: '分枝魔法', benefit: '投射物数量 +1', description: '每次施法额外发射一颗魔法弹，以扇形同时覆盖更多敌人。', maxRank: 3, icon: 'battle', color: '#b4d3fc', effect: { type: 'add', stat: 'projectileCount', perRank: 1 } },
  { id: 'vitality', title: '蓬勃生长', benefit: '最大生命值 +20', description: '每级增加 20 点最大生命，并立即恢复同样数值的生命。', maxRank: 5, icon: 'heart', color: '#f4ae9d', effect: { type: 'add', stat: 'maxHp', perRank: 20 } },
  { id: 'movement', title: '草叶轻步', benefit: '移动速度 +10%', description: '每级增加基础移动速度的 10%，轻巧地穿行在怪物之间。', maxRank: 5, icon: 'leaf', color: '#d8ec9f', effect: { type: 'add', stat: 'moveMultiplier', perRank: 0.1, percent: true } },
  { id: 'range', title: '远星回响', benefit: '攻击范围 +15%', description: '每级增加基础锁敌范围的 15%，同时延长魔法弹的有效飞行距离。', maxRank: 5, icon: 'compass', color: '#a2dfd2', effect: { type: 'add', stat: 'rangeMultiplier', perRank: 0.15, percent: true } },
  { id: 'orbit', title: '伴星魔法球', benefit: '环绕玩家的魔法球', description: '习得一颗自动环绕并伤害敌人的伴星；强化可增加数量、伤害与轨道半径。', maxRank: 3, icon: 'orbit', color: '#a7edf0', effect: { type: 'spell', levels: [
    { orbitCount: 1, orbitDamage: 12, orbitRadius: 2.2, orbitSpeed: 2.4 },
    { orbitCount: 2, orbitDamage: 18, orbitRadius: 2.4, orbitSpeed: 2.7 },
    { orbitCount: 3, orbitDamage: 24, orbitRadius: 2.6, orbitSpeed: 3 },
  ] } },
  { id: 'shockwave', title: '草原冲击波', benefit: '周期性范围冲击波', description: '向周围释放扩散魔法波；同一波对每个敌人只造成一次伤害。强化会扩大范围并缩短周期。', maxRank: 3, icon: 'wave', color: '#f3de9a', effect: { type: 'spell', levels: [
    { shockDamage: 24, shockRadius: 3.8, shockInterval: 4.5 },
    { shockDamage: 34, shockRadius: 4.6, shockInterval: 4 },
    { shockDamage: 44, shockRadius: 5.4, shockInterval: 3.5 },
  ] } },
];
export const FUSION_SKILLS: readonly SkillDefinition[] = [...SKILLS,
  { id: 'split-on-hit', title: '命中分裂', benefit: '命中派生两枚小火种', description: '火花弹命中后分裂，与焰绒自动融合为爆裂火种：小范围爆炸并派生两枚火种。可与分枝魔法同时生效。', maxRank: 1, icon: 'spark', color: '#ffb45f', effect: { type: 'spell', levels: [{ splitOnHit: 1 }] } },
];
/** Development-only pools; no new water/grass cards leak into historical or P1 modes. */
const AREA_CARD: SkillDefinition = { id: 'area', title: '范围扩张', benefit: '水泡命中扩散', description: '水泡弹自动融合为深海泡影，命中时扩散范围伤害与减速。', maxRank: 1, icon: 'wave', color: '#8fe8ff', effect: { type: 'spell', levels: [{}] } };
const CHAIN_CARD: SkillDefinition = { id: 'chain', title: '连锁弹射', benefit: '命中后跳向附近敌人', description: '自动形成连环水爆或跳跃荆棘；最多三次额外跳跃，不重复锁定已命中的敌人。', maxRank: 1, icon: 'compass', color: '#a5edbe', effect: { type: 'spell', levels: [{}] } };
export const WATER_SKILLS: readonly SkillDefinition[] = [...SKILLS, AREA_CARD, CHAIN_CARD];
export const GRASS_SKILLS: readonly SkillDefinition[] = [...SKILLS, { ...FUSION_SKILLS[FUSION_SKILLS.length - 1], title: '命中分裂', benefit: '叶刃命中散射三枚荆棘', description: '叶刃自动融合为荆棘散射；派生荆棘不会再次分裂。', icon: 'leaf', color: '#b4ea86' }, CHAIN_CARD];
const ALL_SKILLS = [...FUSION_SKILLS, AREA_CARD, CHAIN_CARD];
export const EXPERIENCE = { initial: 8, increment: 4 } as const;
export const MAX_LEVEL = 1 + SKILLS.reduce((total, skill) => total + skill.maxRank, 0);
export const SKILL_RULES = { orbitHitInterval: 0.55, orbitBallRadius: 0.28, waveDuration: 0.55, maxOrbitBalls: 3 } as const;

export function emptyRanks(): SkillRanks {
  return Object.fromEntries(ALL_SKILLS.map((skill) => [skill.id, 0])) as SkillRanks;
}
export function experienceThreshold(level: number) {
  return level >= MAX_LEVEL ? Infinity : EXPERIENCE.initial + Math.max(0, level - 1) * EXPERIENCE.increment;
}
export function calculateStats(ranks: SkillRanks): Readonly<SkillStats> {
  const stats: SkillStats = { damageMultiplier: 1, attackRateMultiplier: 1, projectileCount: 1, maxHp: 100, moveMultiplier: 1, rangeMultiplier: 1, orbitCount: 0, orbitDamage: 0, orbitRadius: 0, orbitSpeed: 0, shockDamage: 0, shockRadius: 0, shockInterval: 0, splitOnHit: 0 };
  for (const skill of ALL_SKILLS) {
    const rank = Math.min(skill.maxRank, Math.max(0, Math.floor(ranks[skill.id] || 0)));
    if (skill.effect.type === 'add') stats[skill.effect.stat] += rank * skill.effect.perRank;
    else if (rank > 0) Object.assign(stats, skill.effect.levels[rank - 1]);
  }
  return Object.freeze(stats);
}

export function upgradePreview(skill: SkillDefinition, ranks: SkillRanks) {
  if (ranks[skill.id] >= skill.maxRank) return;
  const before = calculateStats(ranks), after = calculateStats({ ...ranks, [skill.id]: ranks[skill.id] + 1 });
  if (skill.effect.type === 'add') {
    const stat = skill.effect.stat;
    const format = (value: number) => skill.effect.type === 'add' && skill.effect.percent ? `${Math.round(value * 100)}%` : String(value);
    return `${format(before[stat])} → ${format(after[stat])}`;
  }
  if (skill.id === 'orbit') return `${before.orbitCount ? `${before.orbitCount} 颗` : '未习得'} → ${after.orbitCount} 颗 · ${after.orbitDamage} 伤害`;
  if (skill.id === 'split-on-hit') return skill.icon === 'leaf' ? '叶刃 → 荆棘散射 · 自动融合' : '火花弹 → 爆裂火种 · 自动融合';
  if (skill.id === 'area' || skill.id === 'chain') return '未习得 → 自动融合';
  return `${before.shockDamage ? `${before.shockDamage} 伤害` : '未习得'} → ${after.shockDamage} 伤害 · ${after.shockInterval} 秒/次`;
}

export class Progression {
  level = 1;
  experience = 0;
  totalExperience = 0;
  pendingChoices = 0;
  readonly ranks = emptyRanks();
  private currentStats = calculateStats(this.ranks);
  private currentOffers: SkillId[] = [];
  private fusionSkills = false;
  fusionBase: 'spark' | 'bubble' | 'leaf' = 'spark';

  constructor(private random: () => number = Math.random) {}
  get stats() { return this.currentStats; }
  get skills() { return !this.fusionSkills ? SKILLS : this.fusionBase === 'bubble' ? WATER_SKILLS : this.fusionBase === 'leaf' ? GRASS_SKILLS : FUSION_SKILLS; }
  get maxLevel() { return 1 + this.skills.reduce((total, skill) => total + skill.maxRank, 0); }
  get awaitingChoice() { return this.pendingChoices > 0; }
  get offers(): readonly SkillId[] { return this.currentOffers; }
  get threshold() { return this.level >= this.maxLevel ? Infinity : EXPERIENCE.initial + Math.max(0, this.level - 1) * EXPERIENCE.increment; }
  get choiceLevel() { return this.level - this.pendingChoices + 1; }

  gainExperience(amount: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(this.totalExperience + amount)) return 0;
    this.totalExperience += amount;
    this.experience += amount;
    let gained = 0;
    while (this.level < this.maxLevel && this.experience >= this.threshold) {
      this.experience -= this.threshold;
      this.level++;
      this.pendingChoices++;
      gained++;
    }
    if (this.level === this.maxLevel) this.experience = 0;
    if (this.awaitingChoice && this.currentOffers.length === 0) this.rollOffers();
    return gained;
  }

  pick(id: SkillId) {
    const skill = this.skills.find((candidate) => candidate.id === id);
    if (!this.awaitingChoice || !skill || !this.currentOffers.includes(id) || this.ranks[id] >= skill.maxRank) return false;
    this.ranks[id]++;
    this.pendingChoices--;
    this.currentStats = calculateStats(this.ranks);
    this.currentOffers = [];
    if (this.awaitingChoice) this.rollOffers();
    return true;
  }

  private rollOffers() {
    const candidates = this.skills.filter((skill) => this.ranks[skill.id] < skill.maxRank).map((skill) => skill.id);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    this.currentOffers = candidates.slice(0, 3);
  }

  reset(fusionSkills = this.fusionSkills) {
    this.fusionSkills = fusionSkills;
    this.level = 1;
    this.experience = this.totalExperience = this.pendingChoices = 0;
    for (const skill of ALL_SKILLS) this.ranks[skill.id] = 0;
    this.currentStats = calculateStats(this.ranks);
    this.currentOffers = [];
  }

  inspect() {
    return { level: this.level, experience: this.experience, totalExperience: this.totalExperience, threshold: Number.isFinite(this.threshold) ? this.threshold : null, pendingChoices: this.pendingChoices, choiceLevel: this.choiceLevel, offers: [...this.currentOffers], ranks: { ...this.ranks }, stats: { ...this.stats }, maxLevel: this.maxLevel };
  }
}
