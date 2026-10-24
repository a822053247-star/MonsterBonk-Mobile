import { factoryRelic } from './content/relic-registry';
import type { Combat } from './combat';
import { WEAPON_CARDS, type SkillDefinition, type SkillId } from './progression';
import { endlessShopPrice,VITAL_CONTRACT } from './balance';
import type { BaseAttackId } from './fusion';

export interface ShopItem {
  kind: 'reward' | 'heal' | 'contract' | 'empty'; skill?: SkillId; illustration?:'rest-supply'|'vital-contract';
  title: string; benefit: string; tradeoff?: string; price: number; sold: boolean;
}

/** Three rewards and bounded rest services. Revision tokens reject queued stale taps. */
export class RunShop {
  private offers: ShopItem[] = [];
  private revision = 1;
  refreshes = 0;
  private paidRefreshes = 0;
  private freeRefreshes: number;
  purchases = 0;
  spent = 0;
  refreshSpent = 0;
  private supplyBought=false;
  private contractBought=false;
  private exchanged = false;
  get exchangeUsed() { return this.exchanged; }
  get exchangePrice() { return this.price(25); }
  get canExchange() {
    return this.endlessCycleIndex !== undefined && !this.exchanged && this.combat.hp > 0
      && !this.combat.progression.awaitingChoice && this.combat.runBuild.attacks.some(a => !a.pairId);
  }
  exchange(from: BaseAttackId, to: BaseAttackId, token: string, coins: number) {
    if (token !== this.token || !this.canExchange || !Number.isSafeInteger(coins) || coins < this.exchangePrice) return undefined;
    if (!this.combat.exchangeWeapon(from, to)) return undefined;
    this.exchanged = true; this.revision++; this.purchases++; this.spent += this.exchangePrice;
    const purchased = this.offers.map(s => s.sold ? s : undefined);
    this.roll(new Set(purchased.flatMap(s => s?.skill ? [s.skill] : [])));
    purchased.forEach((s, i) => { if (s) this.offers[i] = s; });
    return coins - this.exchangePrice;
  }
  get treasureRefreshes() { return this.freeRefreshes; }
  get items(): readonly ShopItem[] { return this.offers; }
  get token() { return `${this.session}:${this.revision}`; }
  get refreshCost() { return this.freeRefreshes ? 0 : this.price(5 + this.paidRefreshes * 5, 'refresh'); }
  get canRefresh() { return this.candidates.length > 0; }

  constructor(private combat: Combat, private session: number, private random: () => number = Math.random, treasureRefreshes = 0, readonly endlessCycleIndex?: number) {
    this.freeRefreshes = Math.min(1, Math.max(0, Math.floor(treasureRefreshes) || 0));
    this.roll();
  }

  private price(base: number, category: 'normal' | 'relic' | 'evolution' | 'heal' | 'refresh' = 'normal') {
    return this.endlessCycleIndex === undefined ? base : endlessShopPrice(base, this.endlessCycleIndex, category);
  }

  private get candidates() { return this.combat.progression.skills.filter(s => this.combat.progression.canGrant(s.id) && (factoryRelic(s.id)?.rewards.shop ?? true)); }
  private choose(list: readonly SkillDefinition[], used: Set<SkillId>) {
    const candidates = list.filter(s => !used.has(s.id));
    return candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))];
  }
  /** One shop slot always advances something already present in the player's build.
   * It offers options, not a free skill: all ordinary costs and prerequisites apply. */
  private buildRelevant(normal: readonly SkillDefinition[], used: Set<SkillId>) {
    const built = this.combat.runBuild;
    const ranks = this.combat.progression.ranks;
    const order: SkillId[] = [];
    if (built.has('spark') && !ranks['split-on-hit']) order.push('split-on-hit');
    if (built.has('bubble') && !ranks.area) order.push('area');
    if ((built.has('bubble') || built.has('leaf')) && !ranks.chain) order.push('chain');
    if (built.has('leaf') && !ranks['split-on-hit']) order.push('split-on-hit');
    for (const attack of built.attacks) order.push(`${attack.attackId}-weapon` as SkillId);
    order.push('haste', 'damage', 'orbit', 'shockwave', 'vitality', 'range', 'movement');
    for (const id of order) {
      const skill = normal.find(s => s.id === id && !used.has(id));
      if (skill) return skill;
    }
    return this.choose(normal, used);
  }

  private reward(skill: SkillDefinition | undefined, used: Set<SkillId>): ShopItem {
    if (!skill) return { kind: 'empty', title: '构筑已完善', benefit: '当前没有适用商品，可直接进入下一波。', price: 0, sold: false };
    used.add(skill.id);
    const weapon = WEAPON_CARDS[skill.id], level = this.combat.progression.ranks[skill.id];
    const price = skill.category === 'evolution' ? 75 : skill.category === 'relic' ? 70 : weapon ? (level ? 20 + level * 5 : 35) : 25;
    return { kind: 'reward', skill: skill.id, title: skill.title, benefit: skill.benefit, tradeoff: skill.tradeoff, price: this.price(price, skill.category ?? 'normal'), sold: false };
  }
  private roll(blocked = new Set<SkillId>()) {
    const used = blocked, all = this.candidates;
    const normal = all.filter(s => !s.category), rare = all.filter(s => s.category);
    this.offers = [
      this.reward(this.choose(normal.filter(s => WEAPON_CARDS[s.id] && !this.combat.runBuild.has(WEAPON_CARDS[s.id]!)), used) ?? this.choose(normal.filter(s => WEAPON_CARDS[s.id]), used) ?? this.choose(normal, used), used),
      this.reward(this.buildRelevant(normal, used), used),
      this.reward(this.choose(rare, used) ?? this.choose(normal, used), used),
    ];
    if(this.endlessCycleIndex!==undefined){
      this.offers.push({kind:'heal',title:'休整补给',benefit:'立即恢复35点生命，不超过最大生命；每次商店限购1次。',price:this.price(18,'heal'),sold:this.supplyBought,illustration:'rest-supply'});
      this.offers.push({kind:'contract',title:'契约强化',benefit:'获得1级魔力浓缩：基础魔法伤害+20%，遵循原5级上限。',tradeoff:`最大生命乘${Math.round(VITAL_CONTRACT.health*100)}%，当前生命仅压至新上限；每次商店1次，本局最多${VITAL_CONTRACT.limit}次（已用${this.combat.vitalContracts}/${VITAL_CONTRACT.limit}）。`,price:Math.ceil(this.price(25)*VITAL_CONTRACT.priceFraction*(1+VITAL_CONTRACT.priceStep*this.combat.vitalContracts)/5)*5,sold:this.contractBought,illustration:'vital-contract'});
      return;
    }
    this.offers.push(this.combat.hp < this.combat.maxHp
      ? { kind: 'heal', title: '草场补给', benefit: '恢复 35 点生命，不超过最大生命。', price: this.price(18,'heal'), sold: false }
      : this.reward(normal.find(s => s.id === 'vitality' && !used.has(s.id)) ?? this.choose(normal, used), used));
  }

  canBuy(index:number,coins:number){
    const item=this.offers[index];
    return !!item&&!item.sold&&item.kind!=='empty'&&Number.isSafeInteger(coins)&&coins>=item.price&&this.combat.hp>0
      &&(item.kind!=='heal'||this.combat.hp<this.combat.maxHp)
      &&(item.kind!=='contract'||!this.contractBought&&this.combat.canAcceptVitalContract)
      &&(item.kind!=='reward'||!!item.skill&&this.combat.progression.canGrant(item.skill));
  }

  buy(index: number, token: string, coins: number): number | undefined {
    if (token !== this.token || !Number.isSafeInteger(coins) || coins < 0) return;
    const item = this.offers[index];
    if (!item || !this.canBuy(index,coins)) return;
    if (item.kind === 'heal') {
      if (this.combat.hp >= this.combat.maxHp) return;
      this.combat.hp = Math.min(this.combat.maxHp, this.combat.hp + 35);
      if(this.endlessCycleIndex!==undefined)this.supplyBought=true;
    } else if(item.kind==='contract'){
      if(!this.combat.acceptVitalContract())return;
      this.contractBought=true;
      item.tradeoff=item.tradeoff?.replace(/已用\d+\/3/,`已用${this.combat.vitalContracts}/3`);
    } else if (!item.skill || !this.combat.grantUpgrade(item.skill)) return;
    item.sold = true; this.revision++;
    this.purchases++; this.spent += item.price;
    // A purchase can invalidate another offer (for example, the single-weapon badge).
    // Replace those offers; keep bought slots visibly sold until a refresh.
    const invalid = this.offers.some(s => !s.sold && s.kind === 'reward' && !this.combat.progression.canGrant(s.skill!));
    if (invalid) {
      const purchased = this.offers.map(s => s.sold ? s : undefined);
      this.roll(new Set(purchased.flatMap(s => s?.skill ? [s.skill] : []))); purchased.forEach((s, i) => { if (s) this.offers[i] = s; });
    }
    // Other purchases can change the lens's capped range without invalidating it.
    const lens=this.combat.progression.skills.find(s=>s.id==='far-lens');
    if(lens)for(const offer of this.offers)if(!offer.sold&&offer.skill==='far-lens')offer.benefit=lens.benefit;
    return coins - item.price;
  }

  refresh(token: string, coins: number): number | undefined {
    if (token !== this.token || !Number.isSafeInteger(coins) || coins < this.refreshCost || this.combat.hp <= 0 || !this.candidates.length) return;
    const cost = this.refreshCost;
    this.refreshSpent += cost;
    const balance = coins - cost;
    if (this.freeRefreshes) this.freeRefreshes--;
    else this.paidRefreshes++;
    this.refreshes++; this.revision++; this.roll(); return balance;
  }
}
