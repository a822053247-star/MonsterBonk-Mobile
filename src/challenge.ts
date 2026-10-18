import type { Combat, Enemy, EnemyKind } from './combat';
import { HORN } from './trial';

export const CHALLENGE = { intro: 1.2, interval: .9, rest: 3, interruptGoal: 2 } as const;
export const CHALLENGE_WAVES: readonly { title: string; hint: string; enemies: readonly EnemyKind[] }[] = [
  { title: '迎战', hint: '边走位边拾取经验，升级后选择强化', enemies: ['normal', 'normal', 'fast', 'tank'] },
  { title: '反制', hint: '观察黄线，冲刺可打断蓄力与扑击', enemies: ['fast', 'fast', 'tank'] },
  { title: '破阵', hint: '借助冲锋击退，先处理靠近的威胁', enemies: ['normal', 'normal', 'fast', 'tank', 'normal', 'fast', 'normal', 'tank'] },
];

/** A finite director only. Damage, XP, enemy behavior and upgrades remain in Combat. */
export class Challenge {
  wave = 0;
  phase: 'fighting' | 'rest' | 'won' = 'fighting';
  defeated = 0;
  waveTime = 0;
  private clock: number = CHALLENGE.intro;
  private queue: EnemyKind[] = [...CHALLENGE_WAVES[0].enemies];
  private tracked: Enemy[] = [];

  get definition() { return CHALLENGE_WAVES[this.wave]; }
  get remaining() { return this.queue.length + this.tracked.length; }
  get restTime() { return this.phase === 'rest' ? Math.max(0, this.clock) : 0; }

  update(dt: number, combat: Combat, player: { x: number; z: number }) {
    if (dt <= 0 || !combat.isChallenge || combat.hp <= 0 || this.phase === 'won') return;
    // Account for kills on this tick before a possible upgrade opens. Final-wave
    // victory takes precedence over an unused final upgrade choice.
    for (let i = this.tracked.length - 1; i >= 0; i--) {
      const enemy = this.tracked[i];
      if (enemy.active) continue;
      if (enemy.hp <= 0) this.defeated++;
      else this.queue.push(enemy.kind); // Running away/recycling is not a kill.
      this.tracked.splice(i, 1);
    }
    if (this.phase === 'fighting' && this.remaining === 0) {
      this.phase = this.wave === CHALLENGE_WAVES.length - 1 ? 'won' : 'rest';
      this.clock = CHALLENGE.rest;
      return;
    }
    if (combat.progression.awaitingChoice) return;
    this.waveTime += dt;
    this.clock -= dt;
    if (this.clock > 1e-8) return;
    if (this.phase === 'rest') {
      this.wave++;
      this.phase = 'fighting';
      this.defeated = this.waveTime = 0;
      this.queue = [...this.definition.enemies];
      this.clock = .4;
      return;
    }
    if (this.queue.length) {
      const enemy = combat.spawnEncounter(this.queue[0], player);
      if (enemy) { this.tracked.push(enemy); this.queue.shift(); }
      this.clock = enemy ? CHALLENGE.interval : .25;
    }
  }

  stars(combat: Combat) {
    return this.phase === 'won' ? 1 + Number(combat.hornHits >= HORN.goal) + Number(combat.interrupts >= CHALLENGE.interruptGoal) : 0;
  }
  inspect(combat: Combat) {
    return { wave: this.wave + 1, waves: CHALLENGE_WAVES.length, title: this.definition.title, phase: this.phase, defeated: this.defeated,
      total: this.definition.enemies.length, remaining: this.remaining, waveTime: this.waveTime, restTime: this.restTime,
      stars: this.stars(combat), hornGoal: HORN.goal, interruptGoal: CHALLENGE.interruptGoal };
  }
}
