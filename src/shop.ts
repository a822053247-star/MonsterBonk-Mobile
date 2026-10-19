import type { Combat } from './combat';
import { WEAPON_CARDS, type SkillDefinition, type SkillId } from './progression';

export interface ShopItem {
  kind: 'reward' | 'heal' | 'empty'; skill?: SkillId;
  title: string; benefit: string; tradeoff?: string; price: number; sold: boolean;
}

/** Four bounded offers. A revision token makes queued taps harmless after mutations. */
export class RunShop {
  private offers: ShopItem[] = [];
  private revision = 1;
  refreshes = 0;
  get items(): readonly ShopItem[] { return this.offers; }
  get token() { return `${this.session}:${this.revision}`; }
  get refreshCost() { return 5 + this.refreshes * 5; }
  get canRefresh() { return this.candidates.length > 0; }

  constructor(private combat: Combat, private session: number, private random: () => number = Math.random) { this.roll(); }

  private get candidates() { return this.combat.progression.skills.filter(s => this.combat.progression.canGrant(s.id)); }
  private choose(list: readonly SkillDefinition[], used: Set<SkillId>) {
    const candidates = list.filter(s => !used.has(s.id));
    return candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))];
  }
  private reward(skill: SkillDefinition | undefined, used: Set<SkillId>): ShopItem {
    if (!skill) return { kind: 'empty', title: '构筑已完善', benefit: '当前没有适用商品，可直接进入下一波。', price: 0, sold: false };
    used.add(skill.id);
    const weapon = WEAPON_CARDS[skill.id], level = this.combat.progression.ranks[skill.id];
    const price = skill.category === 'evolution' ? 75 : skill.category === 'relic' ? 70 : weapon ? (level ? 20 + level * 5 : 35) : 25;
    return { kind: 'reward', skill: skill.id, title: skill.title, benefit: skill.benefit, tradeoff: skill.tradeoff, price, sold: false };
  }
  private roll(blocked = new Set<SkillId>()) {
    const used = blocked, all = this.candidates;
    const normal = all.filter(s => !s.category), rare = all.filter(s => s.category);
    this.offers = [
      this.reward(this.choose(normal.filter(s => WEAPON_CARDS[s.id] && !this.combat.runBuild.has(WEAPON_CARDS[s.id]!)), used) ?? this.choose(normal.filter(s => WEAPON_CARDS[s.id]), used) ?? this.choose(normal, used), used),
      this.reward(this.choose(normal.filter(s => ['split-on-hit', 'area', 'chain'].includes(s.id)), used) ?? this.choose(normal, used), used),
      this.reward(this.choose(rare, used) ?? this.choose(normal, used), used),
    ];
    this.offers.push(this.combat.hp < this.combat.maxHp
      ? { kind: 'heal', title: '草场补给', benefit: '恢复 35 点生命，不超过最大生命。', price: 18, sold: false }
      : this.reward(normal.find(s => s.id === 'vitality' && !used.has(s.id)) ?? this.choose(normal, used), used));
  }

  buy(index: number, token: string, coins: number): number | undefined {
    if (token !== this.token || !Number.isSafeInteger(coins) || coins < 0) return;
    const item = this.offers[index];
    if (!item || item.sold || item.kind === 'empty' || item.price > coins || this.combat.hp <= 0) return;
    if (item.kind === 'heal') {
      if (this.combat.hp >= this.combat.maxHp) return;
      this.combat.hp = Math.min(this.combat.maxHp, this.combat.hp + 35);
    } else if (!item.skill || !this.combat.grantUpgrade(item.skill)) return;
    item.sold = true; this.revision++;
    // A purchase can invalidate another offer (for example, the single-weapon badge).
    // Replace those offers; keep bought slots visibly sold until a refresh.
    const invalid = this.offers.some(s => !s.sold && s.kind === 'reward' && !this.combat.progression.canGrant(s.skill!));
    if (invalid) {
      const purchased = this.offers.map(s => s.sold ? s : undefined);
      this.roll(new Set(purchased.flatMap(s => s?.skill ? [s.skill] : []))); purchased.forEach((s, i) => { if (s) this.offers[i] = s; });
    }
    return coins - item.price;
  }

  refresh(token: string, coins: number): number | undefined {
    if (token !== this.token || !Number.isSafeInteger(coins) || coins < this.refreshCost || this.combat.hp <= 0 || !this.candidates.length) return;
    const balance = coins - this.refreshCost;
    this.refreshes++; this.revision++; this.roll(); return balance;
  }
}
