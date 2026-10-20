//#region src/combat-clarity.ts
/** Project tuning inspired by readable ball volleys, not BALL x PIT's exact stats. */
const COMBAT_CLARITY = {
	shotGap: .08,
	volleyGap: .18,
	impactSpacing: 1.1,
	maxImpacts: 6,
	projectileSize: .65,
	childSize: .38,
	impactSize: 1.55
};
//#endregion
//#region src/flame-sweep.ts
const FLAME_SWEEP = {
	id: "flame-sweep",
	damage: 36,
	radius: 2.8,
	interval: .72,
	angle: Math.PI,
	bodyOffset: .55,
	duration: .3,
	eliteMultiplier: .75,
	maxRadius: 6,
	frames: 3,
	fps: 10,
	frameSize: 128,
	url: "/assets/pixel/skills/yanrong/fire-effects-sheet.normalized.png",
	sourceFrames: [
		12,
		13,
		14
	]
};
/** Weapon levels spend their growth budget on coverage and close-range uptime. */
const FLAME_SWEEP_LEVELS = [
	{
		radius: 2.8,
		degrees: 180,
		interval: .72
	},
	{
		radius: 3.2,
		degrees: 220,
		interval: .7
	},
	{
		radius: 3.6,
		degrees: 260,
		interval: .68
	},
	{
		radius: 4,
		degrees: 300,
		interval: .66
	},
	{
		radius: 4.4,
		degrees: 360,
		interval: .64
	}
];
function flameSweepStats(level, rangeMultiplier = 1, areaMultiplier = 1) {
	const growth = FLAME_SWEEP_LEVELS[Math.max(0, Math.min(4, Math.floor(level) - 1))];
	return {
		...growth,
		angle: growth.degrees * Math.PI / 180,
		radius: Math.min(FLAME_SWEEP.maxRadius, growth.radius * rangeMultiplier * areaMultiplier)
	};
}
/** Circle vs finite sector, including radial edges; never a projectile collision. */
function insideSweep(x, z, aimX, aimZ, radius, enemyRadius, sweepAngle = FLAME_SWEEP.angle) {
	const distance = Math.hypot(x, z);
	if (distance > radius + enemyRadius) return false;
	if (distance <= enemyRadius) return true;
	const angle = Math.atan2(aimX * z - aimZ * x, aimX * x + aimZ * z);
	if (Math.abs(angle) <= sweepAngle / 2) return true;
	const edge = Math.sign(angle) * sweepAngle / 2;
	const ex = aimX * Math.cos(edge) - aimZ * Math.sin(edge), ez = aimX * Math.sin(edge) + aimZ * Math.cos(edge);
	const t = Math.max(0, Math.min(radius, x * ex + z * ez));
	return (x - t * ex) ** 2 + (z - t * ez) ** 2 <= enemyRadius ** 2;
}
//#endregion
//#region src/enemy-challenge.ts
const ENCOUNTER_RULES = {
	hostileShots: 16,
	bossHp: 6e3,
	bossRadius: 1.05,
	bossSpawn: 1.5,
	bossSupportCap: 120,
	waveHealth: [
		1,
		1.2,
		1.5,
		1.8,
		2.2,
		1.8
	],
	bossSpeed: 1.8,
	dashSpeed: 15,
	dashDuration: .65,
	dashWindup: 1.1,
	spreadWindup: 1,
	spreadSpeed: 6,
	spreadLife: 2,
	shotRadius: .24,
	eliteHp: 360,
	eliteRadius: 1,
	elitePulseRadius: 3.2,
	eliteWindup: 1.1,
	meleeWindup: .55,
	meleeActive: .16,
	meleeRecovery: .9
};
/** Predict only when locking a warning. Bounded curvature makes an unchanged
* circular path readable to enemies; a subsequent reversal invalidates the aim. */
function predictPosition(player, vx, vz, turn, seconds) {
	const sine = Math.abs(turn) < .01 ? seconds : Math.sin(turn * seconds) / turn;
	const cosine = Math.abs(turn) < .01 ? 0 : (1 - Math.cos(turn * seconds)) / turn;
	return {
		x: player.x + vx * sine - vz * cosine,
		z: player.z + vx * cosine + vz * sine
	};
}
/** Formal-run behavior only. Clocks are simulation clocks; renderers never call damage. */
var EnemyChallenge = class {
	constructor() {
		this.enabled = false;
		this.wave = 0;
		this.bossState = "approach";
		this.bossTime = 0;
		this.aimX = 0;
		this.aimZ = 1;
		this.eliteTime = 0;
		this.eliteCooldown = 2;
		this.elitePulsing = false;
		this.pulseDue = false;
		this.pattern = 0;
		this.motion = {
			x: 0,
			z: 0
		};
		this.shots = Array.from({ length: ENCOUNTER_RULES.hostileShots }, () => ({
			active: false,
			x: 0,
			z: 0,
			previousX: 0,
			previousZ: 0,
			vx: 0,
			vz: 0,
			life: 0
		}));
	}
	get enraged() {
		return !!this.boss?.active && this.boss.hp <= ENCOUNTER_RULES.bossHp / 2;
	}
	get defeated() {
		return this.bossState === "defeated";
	}
	get dying() {
		return this.bossState === "dying" || this.defeated;
	}
	get action() {
		if (this.dying) return "death";
		if (this.bossState.startsWith("spread")) return "spread-cast";
		if (this.bossState.startsWith("summon")) return "summon";
		if (this.bossState === "dash-windup") return "dash-windup";
		if (this.bossState === "dash") return "dash";
		return this.bossState === "approach" ? null : this.enraged ? "enraged-idle" : "idle";
	}
	clearShots() {
		for (const s of this.shots) s.active = false;
	}
	reset() {
		this.enabled = false;
		this.wave = 0;
		this.boss = this.elite = void 0;
		this.bossState = "approach";
		this.bossTime = this.eliteTime = this.pattern = 0;
		this.eliteCooldown = 2;
		this.elitePulsing = this.pulseDue = false;
		this.aimX = 0;
		this.aimZ = 1;
		this.clearShots();
	}
	beginWave(wave) {
		this.reset();
		this.enabled = true;
		this.wave = wave;
	}
	beforeTick(dt) {
		this.pulseDue = false;
		if (this.bossState === "dying") {
			this.bossTime += dt;
			if (this.bossTime >= 1) this.bossState = "defeated";
		}
	}
	killedBoss(combat) {
		this.bossState = "dying";
		this.bossTime = 0;
		this.clearShots();
		if (this.boss) {
			this.boss.previousX = this.boss.x;
			this.boss.previousZ = this.boss.z;
			this.boss.walkX = this.boss.walkZ = 0;
		}
		for (const enemy of combat.enemies) if (enemy !== this.boss) enemy.active = false;
	}
	spawnBoss(combat, player) {
		if (this.boss) return this.boss;
		this.boss = combat.spawnRank("boss", player);
		if (this.boss) {
			this.bossState = "approach";
			this.bossTime = 0;
			this.pattern = 0;
		}
		return this.boss;
	}
	spawnElite(combat, player) {
		if (!this.elite) this.elite = combat.spawnRank("elite", player);
		return this.elite;
	}
	transition(state) {
		this.bossState = state;
		this.bossTime = 0;
	}
	/** Keep normal navigation/cover sliding, replacing only the chosen attack's velocity. */
	movement(enemy, dt, player, combat, x, z) {
		this.motion.x = x;
		this.motion.z = z;
		if (enemy === this.boss) {
			this.bossTime += dt;
			const distance = Math.hypot(player.x - enemy.x, player.z - enemy.z);
			const tempo = this.enraged ? .8 : 1;
			if (this.bossState === "approach" && (distance < 8 || this.bossTime > 3)) {
				const state = [
					"spread-windup",
					"dash-windup",
					"summon-windup"
				][this.pattern++ % 3];
				const lead = (state === "dash-windup" ? ENCOUNTER_RULES.dashWindup : ENCOUNTER_RULES.spreadWindup) * tempo + (state === "dash-windup" ? .35 : .7);
				const predicted = predictPosition(player, combat.playerVelocityX, combat.playerVelocityZ, combat.playerTurnRate, lead);
				const tx = predicted.x - enemy.x, tz = predicted.z - enemy.z;
				const length = Math.max(.001, Math.hypot(tx, tz));
				this.aimX = tx / length;
				this.aimZ = tz / length;
				if (length <= .001) this.aimZ = 1;
				this.transition(state);
			} else if (this.bossState === "spread-windup" && this.bossTime >= ENCOUNTER_RULES.spreadWindup * tempo) {
				const angle = Math.atan2(this.aimX, this.aimZ);
				for (let i = -2; i <= 2; i++) {
					const shot = this.shots.find((s) => !s.active);
					if (!shot) break;
					const vx = Math.sin(angle + i * .35), vz = Math.cos(angle + i * .35), speed = ENCOUNTER_RULES.spreadSpeed * (this.enraged ? 1.15 : 1);
					const sx = enemy.x, sz = enemy.z;
					Object.assign(shot, {
						active: true,
						x: sx,
						z: sz,
						previousX: sx,
						previousZ: sz,
						vx: vx * speed,
						vz: vz * speed,
						life: ENCOUNTER_RULES.spreadLife
					});
				}
				this.transition("spread");
			} else if (this.bossState === "dash-windup" && this.bossTime >= ENCOUNTER_RULES.dashWindup * tempo) this.transition("dash");
			else if (this.bossState === "dash" && this.bossTime >= ENCOUNTER_RULES.dashDuration) this.transition("recover");
			else if (this.bossState === "summon-windup" && this.bossTime >= .9 * tempo) {
				for (let i = 0; i < 3 && combat.enemies.filter((e) => e.active).length < ENCOUNTER_RULES.bossSupportCap; i++) combat.spawnEncounter("normal", enemy, 2.8, 4.2);
				this.transition("summon");
			} else if ((this.bossState === "spread" || this.bossState === "summon") && this.bossTime >= .7) this.transition("recover");
			else if (this.bossState === "recover" && this.bossTime >= 1.4 * tempo) this.transition("approach");
			if (this.bossState === "dash") {
				this.motion.x = this.aimX * ENCOUNTER_RULES.dashSpeed;
				this.motion.z = this.aimZ * ENCOUNTER_RULES.dashSpeed;
			} else if (this.bossState !== "approach") this.motion.x = this.motion.z = 0;
			else {
				this.motion.x *= ENCOUNTER_RULES.bossSpeed / .75;
				this.motion.z *= ENCOUNTER_RULES.bossSpeed / .75;
			}
		} else if (enemy === this.elite) {
			if (this.elitePulsing) {
				this.eliteTime += dt;
				this.motion.x = this.motion.z = 0;
				if (this.eliteTime >= ENCOUNTER_RULES.eliteWindup) {
					this.pulseDue = true;
					this.elitePulsing = false;
					this.eliteCooldown = 3.4;
				}
			} else {
				this.eliteCooldown = Math.max(0, this.eliteCooldown - dt);
				if (!this.eliteCooldown && Math.hypot(player.x - enemy.x, player.z - enemy.z) < 6) {
					this.elitePulsing = true;
					this.eliteTime = 0;
					this.motion.x = this.motion.z = 0;
				}
			}
		}
		return this.motion;
	}
	advanceHazards(dt, combat, player, previous) {
		if (this.dying) {
			this.clearShots();
			return;
		}
		if (this.pulseDue && this.elite?.active && Math.hypot(player.x - this.elite.x, player.z - this.elite.z) < ENCOUNTER_RULES.elitePulseRadius + .62 && !combat.covered(this.elite.x, this.elite.z, player.x, player.z)) combat.hitPlayer(18);
		for (const shot of this.shots) {
			if (!shot.active) continue;
			shot.previousX = shot.x;
			shot.previousZ = shot.z;
			const travel = Math.min(dt, shot.life);
			shot.x += shot.vx * travel;
			shot.z += shot.vz * travel;
			shot.life -= dt;
			const wall = combat.hostileWallHit(shot.previousX, shot.previousZ, shot.x, shot.z, ENCOUNTER_RULES.shotRadius);
			const hit = combat.hostilePlayerHit(shot.previousX - previous.x, shot.previousZ - previous.z, shot.x - player.x, shot.z - player.z, ENCOUNTER_RULES.shotRadius + .62);
			if (hit < wall && hit !== Infinity) {
				combat.hitPlayer(12);
				shot.active = false;
			} else if (wall !== Infinity || shot.life <= 0) shot.active = false;
		}
	}
	inspect() {
		return {
			enabled: this.enabled,
			wave: this.wave,
			boss: this.boss ? {
				id: this.boss.id,
				hp: this.boss.hp,
				maxHp: this.boss.maxHp,
				x: this.boss.x,
				z: this.boss.z,
				spawning: this.boss.spawnTime > 0,
				state: this.bossState,
				time: this.bossTime,
				enraged: this.enraged,
				aimX: this.aimX,
				aimZ: this.aimZ
			} : null,
			elite: this.elite?.active ? {
				id: this.elite.id,
				hp: this.elite.hp,
				pulsing: this.elitePulsing,
				time: this.eliteTime
			} : null,
			shots: this.shots.filter((s) => s.active).map((s) => ({
				x: s.x,
				z: s.z,
				vx: s.vx,
				vz: s.vz
			})),
			limit: ENCOUNTER_RULES.hostileShots
		};
	}
};
//#endregion
//#region src/relics.ts
const RELICS = {
	"overload-core": {
		title: "过载核心",
		benefit: "范围半径 +50%",
		tradeoff: "所有武器攻击间隔 +20%",
		icon: "wave",
		color: "#ffb45f"
	},
	"hunter-eye": {
		title: "追猎之眼",
		benefit: "派生弹轻微追踪",
		tradeoff: "派生弹伤害 -20%",
		icon: "compass",
		color: "#e7c67a"
	},
	"shattered-core": {
		title: "破碎晶核",
		benefit: "每次分裂子弹 +1",
		tradeoff: "派生弹伤害 -25%，仍受弹体预算限制",
		icon: "battle",
		color: "#d6b9f5"
	},
	"tidal-pearl": {
		title: "潮汐遗珠",
		benefit: "水泡减速时长 +60%",
		tradeoff: "所有武器直接命中伤害 -15%",
		icon: "wave",
		color: "#8fe8ff"
	},
	"specialist-badge": {
		title: "专精徽记",
		benefit: "仅装备一种武器时伤害 +60%",
		tradeoff: "装备副武器后加成失效",
		icon: "spark",
		color: "#f3de9a"
	},
	"echo-rune": {
		title: "回声符石",
		benefit: "连锁距离 +40%",
		tradeoff: "每次额外跳跃伤害再乘 70%",
		icon: "orbit",
		color: "#a5edbe"
	}
};
const EVOLUTIONS = {
	"berserk-route": {
		title: "狂暴火种",
		benefit: "火种爆炸半径 +35%",
		tradeoff: "火花弹攻击间隔 +25%，放弃追猎路线",
		icon: "spark",
		color: "#ff9849"
	},
	"pursuit-route": {
		title: "追猎火种",
		benefit: "派生火种追踪敌人",
		tradeoff: "火种爆炸半径 -25%，放弃狂暴路线",
		icon: "compass",
		color: "#f3de9a"
	}
};
function resolveAttackRules(attack, relics, weaponCount, level = 1, evolution) {
	const has = (id) => relics.includes(id);
	const spark = attack === "spark";
	return {
		damageMultiplier: (1 + .2 * (level - 1)) * (has("specialist-badge") && weaponCount === 1 ? 1.6 : 1),
		directMultiplier: has("tidal-pearl") ? .85 : 1,
		intervalMultiplier: (has("overload-core") ? 1.2 : 1) * (spark && evolution === "berserk-route" ? 1.25 : 1),
		areaMultiplier: (has("overload-core") ? 1.5 : 1) * (spark ? 1 + .06 * (level - 1) : 1) * (spark && evolution === "berserk-route" ? 1.35 : spark && evolution === "pursuit-route" ? .75 : 1),
		childCountBonus: has("shattered-core") ? 1 : 0,
		childDamageMultiplier: (has("hunter-eye") ? .8 : 1) * (has("shattered-core") ? .75 : 1),
		childHoming: has("hunter-eye") || spark && evolution === "pursuit-route",
		slowDuration: (1.5 + (attack === "bubble" ? .1 * (level - 1) : 0)) * (has("tidal-pearl") ? 1.6 : 1),
		chainRangeMultiplier: has("echo-rune") ? 1.4 : 1,
		chainDecay: has("echo-rune") ? .7 : 1,
		pierceBonus: attack === "leaf" && level >= 3 ? 1 : 0
	};
}
//#endregion
//#region src/party.ts
const CREATURES = {
	yanrong: {
		name: "焰绒",
		element: "fire",
		color: "#ff9849",
		skill: "spark",
		attack: {
			damage: 18,
			interval: .44,
			range: 10.5
		}
	},
	bubblesalamander: {
		name: "泡泡螈",
		element: "water",
		color: "#55c9ed",
		skill: "bubble",
		attack: {
			damage: 15,
			interval: .62,
			range: 10.5
		}
	},
	sproutspike: {
		name: "芽刺兽",
		element: "grass",
		color: "#70bc52",
		skill: "leaf",
		attack: {
			damage: 16,
			interval: .54,
			range: 10.5
		}
	}
};
/** Sole entry for creature attack modifiers; no rendering or UI calculations. */
function calculateCreatureStats(creature, upgrades) {
	const base = CREATURES[creature.species].attack;
	return {
		damage: base.damage * upgrades.damageMultiplier,
		interval: base.interval / upgrades.attackRateMultiplier,
		range: base.range * upgrades.rangeMultiplier,
		projectileCount: upgrades.projectileCount
	};
}
const RADIUS = .48;
/** Pure simulation. Combat owns the one shared HP bar, never individual members. */
var PartySystem = class {
	get members() {
		return this.roster;
	}
	get leader() {
		return this.roster[0];
	}
	constructor(capacity = 3) {
		this.capacity = capacity;
		this.roster = [];
		this.nextId = 1;
		this.statsCache = /* @__PURE__ */ new WeakMap();
		this.reset();
	}
	statsFor(member, upgrades) {
		let cached = this.statsCache.get(member);
		if (!cached || cached.upgrades !== upgrades) {
			cached = {
				upgrades,
				stats: calculateCreatureStats(member, upgrades)
			};
			this.statsCache.set(member, cached);
		}
		return cached.stats;
	}
	reset(species = ["yanrong"]) {
		if (species.length < 1 || species.length > this.capacity) throw new RangeError("Invalid party size");
		this.roster.length = 0;
		this.nextId = 1;
		for (const id of species) this.add(id);
	}
	add(species) {
		if (this.roster.length >= this.capacity) return void 0;
		const creature = {
			id: this.nextId++,
			species,
			x: 0,
			z: 0,
			previousX: 0,
			previousZ: 0,
			facing: 0,
			attackCooldown: 0,
			targetId: 0,
			shotsFired: 0,
			rank: 1,
			evolution: "base",
			blockedTime: 0
		};
		this.roster.push(creature);
		return creature;
	}
	/** Called after the existing controlled creature's movement and world collision. */
	syncLeader(point, facing) {
		const leader = this.leader;
		leader.previousX = leader.x;
		leader.previousZ = leader.z;
		leader.x = point.x;
		leader.z = point.z;
		leader.facing = facing;
	}
	clear(x, z, obstacles, boundary, index) {
		if (Math.hypot(x, z) > boundary - RADIUS) return false;
		if (obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.radius + RADIUS + .04)) return false;
		if (Math.hypot(x - this.leader.x, z - this.leader.z) < 1.15) return false;
		for (let i = 1; i < index; i++) {
			const other = this.roster[i];
			if (Math.hypot(x - other.x, z - other.z) < 1.06) return false;
		}
		return true;
	}
	/** Bounded recovery search, including near map edges and around cover. */
	recover(member, index, obstacles, boundary) {
		for (const radius of [
			2,
			2.8,
			3.6,
			4.4
		]) for (let sample = 0; sample < 16; sample++) {
			const angle = this.leader.facing + Math.PI + (index % 2 ? -.65 : .65) + sample * Math.PI / 8;
			const x = this.leader.x + Math.sin(angle) * radius, z = this.leader.z + Math.cos(angle) * radius;
			if (!this.clear(x, z, obstacles, boundary, index)) continue;
			member.x = member.previousX = x;
			member.z = member.previousZ = z;
			member.blockedTime = 0;
			return;
		}
	}
	placeCompanions(obstacles, boundary) {
		for (let i = 1; i < this.roster.length; i++) this.recover(this.roster[i], i, obstacles, boundary);
	}
	follow(dt, obstacles, boundary) {
		if (dt <= 0) return;
		const leader = this.leader;
		for (let i = 1; i < this.roster.length; i++) {
			const member = this.roster[i];
			member.previousX = member.x;
			member.previousZ = member.z;
			const angle = leader.facing + Math.PI + (i % 2 ? -.65 : .65);
			const radius = i <= 2 ? 2 : 3.2;
			const goalX = leader.x + Math.sin(angle) * radius, goalZ = leader.z + Math.cos(angle) * radius;
			const dx = goalX - member.x, dz = goalZ - member.z, distance = Math.hypot(dx, dz);
			let vx = dx, vz = dz;
			for (const obstacle of obstacles) {
				const ox = member.x - obstacle.x, oz = member.z - obstacle.z;
				const length = Math.max(.001, Math.hypot(ox, oz)), avoid = obstacle.radius + RADIUS + .7;
				if (length < avoid) {
					const strength = (avoid - length) * 5, side = i % 2 ? 1 : -1;
					vx += (ox - oz * side) / length * strength;
					vz += (oz + ox * side) / length * strength;
				}
			}
			const length = Math.hypot(vx, vz), speed = Math.min(8, distance * 5);
			const travel = Math.min(distance, speed * dt);
			if (length > .001) {
				member.x += vx / length * travel;
				member.z += vz / length * travel;
			}
			for (let pass = 0; pass < 3; pass++) {
				for (let j = 0; j < this.roster.length; j++) {
					if (j === i) continue;
					const other = this.roster[j], sx = member.x - other.x, sz = member.z - other.z;
					const d = Math.hypot(sx, sz), separation = j === 0 ? 1.15 : 1.06;
					if (d < separation) {
						member.x = other.x + (d > .001 ? sx / d : i % 2 ? -1 : 1) * separation;
						member.z = other.z + (d > .001 ? sz / d : 0) * separation;
					}
				}
				for (const obstacle of obstacles) {
					const ox = member.x - obstacle.x, oz = member.z - obstacle.z, d = Math.hypot(ox, oz);
					const limit = obstacle.radius + RADIUS + .04;
					if (d < limit) {
						member.x = obstacle.x + (d > .001 ? ox / d : 1) * limit;
						member.z = obstacle.z + (d > .001 ? oz / d : 0) * limit;
					}
				}
				const d = Math.hypot(member.x, member.z), limit = boundary - RADIUS;
				if (d > limit) {
					member.x *= limit / d;
					member.z *= limit / d;
				}
			}
			const moved = Math.hypot(member.x - member.previousX, member.z - member.previousZ);
			member.blockedTime = distance > .8 && moved < .025 * dt ? member.blockedTime + dt : 0;
			if (moved > .001) member.facing = Math.atan2(member.x - member.previousX, member.z - member.previousZ);
			if (Math.hypot(member.x - leader.x, member.z - leader.z) > 7 || member.blockedTime > .8 || !this.clear(member.x, member.z, obstacles, boundary + .001, i)) this.recover(member, i, obstacles, boundary);
		}
	}
	inspect() {
		return this.roster.map((member) => ({ ...member }));
	}
};
/** Weapon identity is independent of its caster. Three distinct weapons share a bounded combat pool. */
const ATTACKS = {
	spark: {
		kind: "projectile",
		title: "火花弹",
		damage: 18,
		interval: .44,
		range: 10.5,
		color: "#ff9849"
	},
	bubble: {
		kind: "projectile",
		title: "水泡弹",
		damage: 15,
		interval: .62,
		range: 10.5,
		color: "#55c9ed"
	},
	leaf: {
		kind: "projectile",
		title: "飞叶弹",
		damage: 16,
		interval: .54,
		range: 10.5,
		color: "#70bc52"
	},
	"flame-sweep": {
		kind: "melee_arc",
		title: "火焰横扫",
		damage: FLAME_SWEEP.damage,
		interval: FLAME_SWEEP.interval,
		range: FLAME_SWEEP.radius,
		color: "#ff8c35"
	}
};
var RunBuild = class {
	constructor() {
		this.equipped = [];
		this.ownedRelics = [];
		this.species = "yanrong";
	}
	get relics() {
		return this.ownedRelics;
	}
	get evolution() {
		return this.chosenEvolution;
	}
	get attacks() {
		return this.equipped;
	}
	reset(species) {
		this.species = species;
		this.ownedRelics = [];
		this.chosenEvolution = void 0;
		this.equipped = [{
			attackId: CREATURES[species].skill,
			slot: 0,
			level: 1,
			cooldown: 0,
			cooldownTotal: 0,
			shotsFired: 0
		}];
	}
	rules(attackId) {
		return resolveAttackRules(attackId, this.relics, this.attacks.length, this.attacks.find((a) => a.attackId === attackId)?.level ?? 1, this.evolution);
	}
	upgrade(attackId) {
		const weapon = this.equipped.find((a) => a.attackId === attackId);
		if (!weapon || weapon.level >= 5) return false;
		weapon.level++;
		return true;
	}
	addRelic(id) {
		if (this.ownedRelics.includes(id)) return false;
		this.ownedRelics.push(id);
		return true;
	}
	evolve(id) {
		if (this.chosenEvolution || !this.has("spark")) return false;
		this.chosenEvolution = id;
		return true;
	}
	has(attackId) {
		return this.equipped.some((attack) => attack.attackId === attackId);
	}
	acquire(attackId) {
		if (this.has(attackId) || this.equipped.length >= 3) return false;
		const slot = this.equipped.length;
		this.equipped.push({
			attackId,
			slot,
			level: 1,
			cooldown: slot * .31,
			cooldownTotal: slot * .31,
			shotsFired: 0
		});
		return true;
	}
};
//#endregion
//#region src/enemy-motion.ts
const ENEMY_MOTION = {
	normal: {
		cadence: 7,
		bob: .055,
		lean: .035,
		squash: .025
	},
	fast: {
		cadence: 6,
		bob: .065,
		lean: .045,
		squash: .035
	},
	tank: {
		cadence: 6,
		bob: .035,
		lean: .022,
		squash: .018
	}
};
//#endregion
//#region src/progression.ts
/** Balance lives here; percentages are additive relative to the unmodified base. */
const SKILLS = [
	{
		id: "damage",
		title: "魔力浓缩",
		benefit: "魔法弹伤害 +20%",
		description: "每级增加基础魔法弹伤害的 20%，让每一发魔法更有分量。",
		maxRank: 5,
		icon: "spark",
		color: "#d6b9f5",
		effect: {
			type: "add",
			stat: "damageMultiplier",
			perRank: .2,
			percent: true
		}
	},
	{
		id: "haste",
		title: "施法节拍",
		benefit: "攻击速度 +15%",
		description: "每级增加基础攻击频率的 15%，缩短两次自动施法之间的等待。",
		maxRank: 5,
		icon: "dash",
		color: "#f4ce93",
		effect: {
			type: "add",
			stat: "attackRateMultiplier",
			perRank: .15,
			percent: true
		}
	},
	{
		id: "multishot",
		title: "分枝魔法",
		benefit: "投射物数量 +1",
		description: "每次施法额外发射一颗魔法弹，以扇形同时覆盖更多敌人。",
		maxRank: 3,
		icon: "battle",
		color: "#b4d3fc",
		effect: {
			type: "add",
			stat: "projectileCount",
			perRank: 1
		}
	},
	{
		id: "vitality",
		title: "蓬勃生长",
		benefit: "最大生命值 +20",
		description: "每级增加 20 点最大生命，并立即恢复同样数值的生命。",
		maxRank: 5,
		icon: "heart",
		color: "#f4ae9d",
		effect: {
			type: "add",
			stat: "maxHp",
			perRank: 20
		}
	},
	{
		id: "movement",
		title: "草叶轻步",
		benefit: "移动速度 +10%",
		description: "每级增加基础移动速度的 10%，轻巧地穿行在怪物之间。",
		maxRank: 5,
		icon: "leaf",
		color: "#d8ec9f",
		effect: {
			type: "add",
			stat: "moveMultiplier",
			perRank: .1,
			percent: true
		}
	},
	{
		id: "range",
		title: "远星回响",
		benefit: "攻击范围 +15%",
		description: "每级增加基础锁敌范围的 15%，同时延长魔法弹的有效飞行距离。",
		maxRank: 5,
		icon: "compass",
		color: "#a2dfd2",
		effect: {
			type: "add",
			stat: "rangeMultiplier",
			perRank: .15,
			percent: true
		}
	},
	{
		id: "orbit",
		title: "伴星魔法球",
		benefit: "环绕玩家的魔法球",
		description: "习得一颗自动环绕并伤害敌人的伴星；强化可增加数量、伤害与轨道半径。",
		maxRank: 3,
		icon: "orbit",
		color: "#a7edf0",
		effect: {
			type: "spell",
			levels: [
				{
					orbitCount: 1,
					orbitDamage: 12,
					orbitRadius: 2.2,
					orbitSpeed: 2.4
				},
				{
					orbitCount: 2,
					orbitDamage: 18,
					orbitRadius: 2.4,
					orbitSpeed: 2.7
				},
				{
					orbitCount: 3,
					orbitDamage: 24,
					orbitRadius: 2.6,
					orbitSpeed: 3
				}
			]
		}
	},
	{
		id: "shockwave",
		title: "草原冲击波",
		benefit: "周期性范围冲击波",
		description: "向周围释放扩散魔法波；同一波对每个敌人只造成一次伤害。强化会扩大范围并缩短周期。",
		maxRank: 3,
		icon: "wave",
		color: "#f3de9a",
		effect: {
			type: "spell",
			levels: [
				{
					shockDamage: 24,
					shockRadius: 3.8,
					shockInterval: 4.5
				},
				{
					shockDamage: 34,
					shockRadius: 4.6,
					shockInterval: 4
				},
				{
					shockDamage: 44,
					shockRadius: 5.4,
					shockInterval: 3.5
				}
			]
		}
	}
];
const FUSION_SKILLS = [...SKILLS, {
	id: "split-on-hit",
	title: "命中分裂",
	benefit: "命中派生两枚小火种",
	description: "火花弹命中后分裂，与焰绒自动融合为爆裂火种：小范围爆炸并派生两枚火种。可与分枝魔法同时生效。",
	maxRank: 1,
	icon: "spark",
	color: "#ffb45f",
	effect: {
		type: "spell",
		levels: [{ splitOnHit: 1 }]
	}
}];
/** Development-only pools; no new water/grass cards leak into historical or P1 modes. */
const AREA_CARD = {
	id: "area",
	title: "范围扩张",
	benefit: "水泡命中扩散",
	description: "水泡弹自动融合为深海泡影，命中时扩散范围伤害与减速。",
	maxRank: 1,
	icon: "wave",
	color: "#8fe8ff",
	effect: {
		type: "spell",
		levels: [{}]
	}
};
const CHAIN_CARD = {
	id: "chain",
	title: "连锁弹射",
	benefit: "命中后跳向附近敌人",
	description: "自动形成连环水爆或跳跃荆棘；最多两次额外跳跃，不重复锁定已命中的敌人。",
	maxRank: 1,
	icon: "compass",
	color: "#a5edbe",
	effect: {
		type: "spell",
		levels: [{}]
	}
};
const WATER_SKILLS = [
	...SKILLS,
	AREA_CARD,
	CHAIN_CARD
];
const GRASS_SKILLS = [
	...SKILLS,
	{
		...FUSION_SKILLS[FUSION_SKILLS.length - 1],
		title: "命中分裂",
		benefit: "飞叶弹命中散射三枚荆棘",
		description: "飞叶弹自动融合为荆棘散射；派生荆棘不会再次分裂。",
		icon: "leaf",
		color: "#b4ea86"
	},
	CHAIN_CARD
];
const BUBBLE_WEAPON = {
	id: "bubble-weapon",
	title: "获得水泡弹",
	benefit: "增加独立自动攻击 · 命中减速",
	description: "装备第二种武器。水泡弹独立索敌、自动释放，命中使敌人减速 30%，持续 1.5 秒。副武器初始攻击间隔为基础的 1.6 倍。",
	maxRank: 1,
	icon: "wave",
	color: "#55c9ed",
	effect: {
		type: "spell",
		levels: [{}]
	}
};
const WEAPON_CARDS = {
	"spark-weapon": "spark",
	"bubble-weapon": "bubble",
	"leaf-weapon": "leaf",
	"flame-sweep-weapon": "flame-sweep"
};
const BUILD_SKILLS = [
	...SKILLS,
	{
		...BUBBLE_WEAPON,
		id: "flame-sweep-weapon",
		title: "获得火焰横扫",
		benefit: "扇形火浪 · 升级扩大覆盖",
		description: "向附近敌人展开一片火焰：伤害 36、半径 2.8、180°、间隔 0.72 秒。升级逐步扩大火浪，5 级覆盖一整圈；每次只有一次横扫。对精英和首领造成 75% 伤害；不穿障碍，分枝、分裂和连锁不复制攻击。",
		icon: "battle",
		color: "#ff8c35"
	},
	{
		...FUSION_SKILLS[FUSION_SKILLS.length - 1],
		benefit: "火花爆炸分裂 / 飞叶弹散射",
		description: "所有已装备火花弹自动形成爆裂火种，飞叶弹形成荆棘散射；派生最多一代，可与连锁共存。"
	},
	AREA_CARD,
	CHAIN_CARD,
	{
		...BUBBLE_WEAPON,
		description: "独立自动释放水泡弹，命中减速 30%，持续 1.5 秒。副武器一 / 二的攻击间隔分别为基础的 1.6 / 1.9 倍。"
	},
	{
		...BUBBLE_WEAPON,
		id: "spark-weapon",
		title: "获得火花弹",
		benefit: "增加火系独立自动攻击",
		description: "装备火花弹，基础伤害 18。获得命中分裂后自动融合爆裂火种。副武器间隔按槽位为基础的 1.6 / 1.9 倍。",
		icon: "spark",
		color: "#ff9849"
	},
	{
		...BUBBLE_WEAPON,
		id: "leaf-weapon",
		title: "获得飞叶弹",
		benefit: "增加草系独立自动攻击 · 穿透",
		description: "装备飞叶弹，基础伤害 16，可穿透一名额外敌人。支持命中分裂与连锁弹射，副武器间隔按槽位为基础的 1.6 / 1.9 倍。",
		icon: "leaf",
		color: "#70bc52"
	}
];
const RARE_SKILLS = [...Object.entries(RELICS).map(([id, data]) => ({
	...data,
	id,
	category: "relic",
	description: "获得后本局持续生效，同一道具不能重复获得。",
	maxRank: 1,
	effect: {
		type: "spell",
		levels: [{}]
	}
})), ...Object.entries(EVOLUTIONS).map(([id, data]) => ({
	...data,
	id,
	category: "evolution",
	description: "爆裂火种的互斥进化，选择后本局不可切换。",
	maxRank: 1,
	effect: {
		type: "spell",
		levels: [{}]
	}
}))];
const RUN_SKILLS = [...BUILD_SKILLS.map((skill) => WEAPON_CARDS[skill.id] ? {
	...skill,
	maxRank: 5
} : skill), ...RARE_SKILLS];
const ALL_SKILLS = RUN_SKILLS;
const EXPERIENCE = {
	initial: 8,
	increment: 4
};
1 + SKILLS.reduce((total, skill) => total + skill.maxRank, 0);
const SKILL_RULES = {
	orbitHitInterval: .55,
	orbitBallRadius: .28,
	waveDuration: .55,
	maxOrbitBalls: 3
};
function emptyRanks() {
	return Object.fromEntries(ALL_SKILLS.map((skill) => [skill.id, 0]));
}
function calculateStats(ranks) {
	const stats = {
		damageMultiplier: 1,
		attackRateMultiplier: 1,
		projectileCount: 1,
		maxHp: 100,
		moveMultiplier: 1,
		rangeMultiplier: 1,
		orbitCount: 0,
		orbitDamage: 0,
		orbitRadius: 0,
		orbitSpeed: 0,
		shockDamage: 0,
		shockRadius: 0,
		shockInterval: 0,
		splitOnHit: 0
	};
	for (const skill of ALL_SKILLS) {
		const rank = Math.min(skill.maxRank, Math.max(0, Math.floor(ranks[skill.id] || 0)));
		if (skill.effect.type === "add") stats[skill.effect.stat] += rank * skill.effect.perRank;
		else if (rank > 0) Object.assign(stats, skill.effect.levels[rank - 1]);
	}
	return Object.freeze(stats);
}
var Progression = class {
	constructor(random = Math.random) {
		this.random = random;
		this.level = 1;
		this.experience = 0;
		this.totalExperience = 0;
		this.pendingChoices = 0;
		this.ranks = emptyRanks();
		this.currentStats = calculateStats(this.ranks);
		this.currentOffers = [];
		this.fusionSkills = false;
		this.purchasedRanks = 0;
		this.fusionBase = "spark";
	}
	get stats() {
		return this.currentStats;
	}
	get pool() {
		return !this.fusionSkills ? SKILLS : this.build ? RUN_SKILLS : this.fusionBase === "bubble" ? WATER_SKILLS : this.fusionBase === "leaf" ? GRASS_SKILLS : FUSION_SKILLS;
	}
	get skills() {
		if (!this.build || !this.fusionSkills) return this.pool;
		return this.pool.filter((skill) => {
			const weapon = WEAPON_CARDS[skill.id];
			if (weapon && !this.build.has(weapon) && this.build.attacks.length >= 3) return false;
			if (skill.category === "evolution") return this.build.has("spark") && this.ranks["split-on-hit"] > 0 && !this.build.evolution;
			if (skill.id === "overload-core") return this.build.has("flame-sweep") || this.build.has("spark") && this.ranks["split-on-hit"] > 0 || this.build.has("bubble") && this.ranks.area > 0;
			if (skill.id === "hunter-eye" || skill.id === "shattered-core") return this.ranks["split-on-hit"] > 0 && (this.build.has("spark") || this.build.has("leaf"));
			if (skill.id === "tidal-pearl") return this.build.has("bubble");
			if (skill.id === "specialist-badge") return this.build.attacks.length === 1;
			if (skill.id === "echo-rune") return this.ranks.chain > 0 && (this.build.has("bubble") || this.build.has("leaf"));
			if (skill.id === "area") return this.build.has("bubble");
			if (skill.id === "chain") return this.build.has("bubble") || this.build.has("leaf");
			if (skill.id === "split-on-hit") return this.build.has("spark") || this.build.has("leaf");
			return true;
		}).map((skill) => {
			const weapon = WEAPON_CARDS[skill.id];
			if (!weapon || !this.build.has(weapon)) return skill;
			const title = skill.title.replace("获得", "");
			if (weapon === "flame-sweep") {
				const level = this.build.attacks.find((a) => a.attackId === weapon).level;
				const before = flameSweepStats(level), after = flameSweepStats(level + 1);
				return {
					...skill,
					title: title + "强化",
					benefit: `半径 ${before.radius} → ${after.radius} · ${after.degrees}° 横扫`,
					description: `基础伤害每级 +20%；火浪角度 ${before.degrees}° → ${after.degrees}°，间隔 ${before.interval} → ${after.interval} 秒。${after.degrees === 360 ? "本次横扫覆盖一整圈。" : "同一片火浪扩大覆盖，5级达到一整圈。"}精英与首领受到 75% 伤害；最高 5 级。`
				};
			}
			return {
				...skill,
				title: title + "强化",
				benefit: "该武器基础伤害 +20%",
				description: "只强化这件武器，最高 5 级。火花每级爆炸半径 +6%；水泡每级减速时长 +0.1 秒；飞叶弹 3 级额外穿透一名敌人。"
			};
		});
	}
	get maxLevel() {
		return 1 + this.pool.reduce((total, skill) => total + skill.maxRank, 0) - this.purchasedRanks - (this.build && this.fusionSkills ? 2 + (this.build.attacks.length > 1 && !this.ranks["specialist-badge"] ? 1 : 0) + (this.build.attacks.length >= 3 ? this.pool.filter((s) => WEAPON_CARDS[s.id] && !this.build.has(WEAPON_CARDS[s.id])).reduce((sum, s) => sum + s.maxRank, 0) : 0) : 0);
	}
	get awaitingChoice() {
		return this.pendingChoices > 0;
	}
	get offers() {
		return this.currentOffers;
	}
	get threshold() {
		return this.level >= this.maxLevel ? Infinity : EXPERIENCE.initial + Math.max(0, this.level - 1) * EXPERIENCE.increment;
	}
	get choiceLevel() {
		return this.level - this.pendingChoices + 1;
	}
	gainExperience(amount) {
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
	pick(id) {
		const skill = this.skills.find((candidate) => candidate.id === id);
		if (!this.awaitingChoice || !skill || !this.currentOffers.includes(id) || this.ranks[id] >= skill.maxRank) return false;
		if (!this.applyReward(skill)) return false;
		this.pendingChoices--;
		this.currentStats = calculateStats(this.ranks);
		this.currentOffers = [];
		if (this.awaitingChoice) this.rollOffers();
		return true;
	}
	canGrant(id) {
		return !!this.build && !this.awaitingChoice && this.skills.some((skill) => skill.id === id && this.ranks[id] < skill.maxRank);
	}
	grant(id) {
		if (!this.canGrant(id)) return false;
		const skill = this.skills.find((candidate) => candidate.id === id);
		if (!this.applyReward(skill)) return false;
		this.purchasedRanks++;
		this.level = Math.min(this.level, this.maxLevel);
		if (this.level >= this.maxLevel) this.experience = 0;
		this.currentStats = calculateStats(this.ranks);
		return true;
	}
	applyReward(skill) {
		const id = skill.id;
		const weapon = WEAPON_CARDS[id];
		if (weapon && (!this.build || !(this.build.has(weapon) ? this.build.upgrade(weapon) : this.build.acquire(weapon)))) return false;
		if (skill.category === "relic" && !this.build?.addRelic(id)) return false;
		if (skill.category === "evolution" && !this.build?.evolve(id)) return false;
		this.ranks[id]++;
		return true;
	}
	rollOffers() {
		const candidates = this.skills.filter((skill) => this.ranks[skill.id] < skill.maxRank).map((skill) => skill.id);
		if (!candidates.length) {
			this.pendingChoices = 0;
			this.currentOffers = [];
			return;
		}
		for (let i = candidates.length - 1; i > 0; i--) {
			const j = Math.floor(this.random() * (i + 1));
			[candidates[i], candidates[j]] = [candidates[j], candidates[i]];
		}
		if (!this.build || !this.fusionSkills) {
			this.currentOffers = candidates.slice(0, 3);
			return;
		}
		const rareAllowed = this.random() < .25;
		let rareUsed = false;
		const eligible = candidates.filter((id) => {
			if (!this.skills.find((skill) => skill.id === id)?.category) return true;
			if (!rareAllowed || rareUsed) return false;
			rareUsed = true;
			return true;
		});
		this.currentOffers = eligible.slice(0, 3);
		const relevant = (id) => !WEAPON_CARDS[id] || this.build.has(WEAPON_CARDS[id]);
		if (this.currentOffers.length && !this.currentOffers.some(relevant)) {
			const useful = eligible.find(relevant);
			if (useful) this.currentOffers[this.currentOffers.length - 1] = useful;
		}
		if (!this.currentOffers.length && candidates.length) this.currentOffers = [candidates[0]];
	}
	reset(fusionSkills = this.fusionSkills) {
		this.fusionSkills = fusionSkills;
		this.level = 1;
		this.purchasedRanks = 0;
		this.experience = this.totalExperience = this.pendingChoices = 0;
		for (const skill of ALL_SKILLS) this.ranks[skill.id] = 0;
		if (this.build && this.fusionSkills) this.ranks[`${this.fusionBase}-weapon`] = 1;
		this.currentStats = calculateStats(this.ranks);
		this.currentOffers = [];
	}
	inspect() {
		return {
			level: this.level,
			experience: this.experience,
			totalExperience: this.totalExperience,
			threshold: Number.isFinite(this.threshold) ? this.threshold : null,
			pendingChoices: this.pendingChoices,
			choiceLevel: this.choiceLevel,
			offers: [...this.currentOffers],
			ranks: { ...this.ranks },
			stats: { ...this.stats },
			maxLevel: this.maxLevel
		};
	}
};
//#endregion
//#region src/trial.ts
/** Experimental values only. Classic movement, enemies and progression stay intact. */
const HORN = {
	damage: 32,
	radius: .9,
	knockback: 9,
	stagger: .42,
	goal: 6
};
const POUNCE = {
	range: 7.5,
	windup: .7,
	duration: .34,
	speed: 18,
	recovery: 1,
	cooldown: 1.4,
	hp: 54
};
//#endregion
//#region src/navigation.ts
/** One shared clearance/flow field for the enemy crowd, rebuilt only when the
* target changes cells or the map changes. Local repulsion alone cannot escape
* concave shores. The field reserves room for the largest enemy (tank). */
var GroundNavigation = class {
	constructor(obstacles, boundary) {
		this.obstacles = obstacles;
		this.boundary = boundary;
		this.obstacleCount = -1;
		this.targetCell = -2;
		this.clearance = .95;
		this.width = Math.ceil(boundary * 2) + 1;
		this.blocked = new Uint8Array(this.width ** 2);
		this.distance = new Int32Array(this.width ** 2);
		this.queue = new Int32Array(this.width ** 2);
	}
	invalidate() {
		this.obstacleCount = -1;
		this.targetCell = -2;
	}
	clear(x, z, radius) {
		return Math.hypot(x, z) <= this.boundary - radius && this.obstacles.every((o) => Math.hypot(x - o.x, z - o.z) >= o.radius + radius);
	}
	line(ax, az, bx, bz, radius) {
		if (!this.clear(ax, az, radius) || !this.clear(bx, bz, radius)) return false;
		const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
		for (const o of this.obstacles) {
			const t = length ? Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / length)) : 0;
			if ((ax + dx * t - o.x) ** 2 + (az + dz * t - o.z) ** 2 < (o.radius + radius) ** 2) return false;
		}
		return true;
	}
	x(index) {
		return index % this.width - this.boundary;
	}
	z(index) {
		return Math.floor(index / this.width) - this.boundary;
	}
	cell(point, requireConnection) {
		const cx = Math.round(point.x + this.boundary), cz = Math.round(point.z + this.boundary);
		let closest = -1, best = Infinity;
		for (let ring = 0; ring <= 3; ring++) {
			for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
				const x = cx + dx, z = cz + dz;
				if (x < 0 || z < 0 || x >= this.width || z >= this.width) continue;
				const index = z * this.width + x;
				if (this.blocked[index]) continue;
				const wx = this.x(index), wz = this.z(index), d = (point.x - wx) ** 2 + (point.z - wz) ** 2;
				if (d >= best || requireConnection && !this.line(point.x, point.z, wx, wz, this.clearance)) continue;
				best = d;
				closest = index;
			}
			if (closest >= 0) return closest;
		}
		return -1;
	}
	prepare(target) {
		if (this.obstacleCount !== this.obstacles.length) {
			this.obstacleCount = this.obstacles.length;
			for (let i = 0; i < this.blocked.length; i++) this.blocked[i] = +!this.clear(this.x(i), this.z(i), this.clearance);
			this.targetCell = -2;
		}
		const goal = this.cell(target, false);
		if (goal === this.targetCell) return;
		this.targetCell = goal;
		this.distance.fill(-1);
		if (goal < 0) return;
		let read = 0, write = 1;
		this.queue[0] = goal;
		this.distance[goal] = 0;
		while (read < write) {
			const index = this.queue[read++], cx = index % this.width, cz = Math.floor(index / this.width);
			for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
				if (!dx && !dz) continue;
				const x = cx + dx, z = cz + dz;
				if (x < 0 || z < 0 || x >= this.width || z >= this.width) continue;
				const next = z * this.width + x;
				if (this.blocked[next] || this.distance[next] >= 0) continue;
				if (dx && dz && (this.blocked[cz * this.width + x] || this.blocked[z * this.width + cx])) continue;
				if (!this.line(this.x(index), this.z(index), this.x(next), this.z(next), this.clearance)) continue;
				this.distance[next] = this.distance[index] + 1;
				this.queue[write++] = next;
			}
		}
	}
	reachable(point, target) {
		this.prepare(target);
		if (!this.clear(point.x, point.z, this.clearance)) return false;
		const index = this.cell(point, true);
		return index >= 0 && this.distance[index] >= 0;
	}
	/** Audit every tank-clear cell using the same no-corner-cutting routes as play. */
	audit(target) {
		this.prepare(target);
		let walkable = 0, reachable = 0, inside = 0;
		for (let i = 0; i < this.blocked.length; i++) {
			if (Math.hypot(this.x(i), this.z(i)) <= this.boundary - this.clearance) inside++;
			if (this.blocked[i]) continue;
			walkable++;
			if (this.distance[i] >= 0) reachable++;
		}
		return {
			walkable,
			reachable,
			inside
		};
	}
	/** Writes a visible waypoint; callers retain their existing speed and damage. */
	guide(point, target, radius, result) {
		if (this.line(point.x, point.z, target.x, target.z, radius + .03)) {
			result.x = target.x;
			result.z = target.z;
			return true;
		}
		this.prepare(target);
		const index = this.cell(point, true);
		if (index < 0 || this.distance[index] < 0) return false;
		let next = index, best = this.distance[index];
		const cx = index % this.width, cz = Math.floor(index / this.width);
		for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
			const x = cx + dx, z = cz + dz;
			if (x < 0 || z < 0 || x >= this.width || z >= this.width) continue;
			const candidate = z * this.width + x, cost = this.distance[candidate];
			if (cost < 0 || cost >= best || !this.line(point.x, point.z, this.x(candidate), this.z(candidate), radius + .03)) continue;
			next = candidate;
			best = cost;
		}
		result.x = this.x(next);
		result.z = this.z(next);
		return true;
	}
};
//#endregion
//#region src/fusion.ts
/** P1 tuning. Child hits never execute the parent recipe. */
const BURST_SEED = {
	id: "burst-seed",
	title: "爆裂火种",
	baseAttack: "spark",
	requires: ["split-on-hit"],
	visual: "yanrong-fire",
	explosionRadius: 1.35,
	explosionDamage: .3,
	childDamage: .35,
	childCount: 2,
	maxGeneration: 1,
	childAngle: Math.PI / 3,
	childLifetime: .45,
	childSize: .55,
	explosionDuration: .4
};
const DEEP_BUBBLE = {
	id: "deep-bubble",
	title: "深海泡影",
	baseAttack: "bubble",
	requires: ["area"],
	radius: 1.8,
	damage: .45,
	visual: "deep-bubble",
	icon: "deep-bubble",
	behavior: "area",
	duration: .45
};
const CHAIN_BUBBLE = {
	id: "chain-bubble",
	title: "连环水爆",
	baseAttack: "bubble",
	requires: ["chain"],
	radius: .7,
	damage: .2,
	hopDamage: .65,
	range: 3.2,
	delay: .1,
	hopDuration: .12,
	maxHops: 2,
	visual: "chain-bubble",
	icon: "chain-bubble",
	behavior: "chain"
};
const THORN_SCATTER = {
	id: "thorn-scatter",
	title: "荆棘散射",
	baseAttack: "leaf",
	requires: ["split-on-hit"],
	childCount: 3,
	childDamage: .35,
	angle: Math.PI / 6,
	range: 3,
	lifetime: 3 / 18,
	visual: "thorn-scatter",
	icon: "thorn-scatter",
	behavior: "split"
};
const JUMP_THORN = {
	id: "jump-thorn",
	title: "跳跃荆棘",
	baseAttack: "leaf",
	requires: ["chain"],
	hopDamage: .7,
	range: 3.5,
	delay: 0,
	hopDuration: .12,
	maxHops: 2,
	visual: "jump-thorn",
	icon: "jump-thorn",
	behavior: "chain"
};
const ELEMENTAL_RULES = {
	slowFactor: .7,
	slowDuration: 1.5,
	leafPierces: 1,
	chainHops: 2
};
const FUSION_RECIPES = [
	BURST_SEED,
	DEEP_BUBBLE,
	CHAIN_BUBBLE,
	THORN_SCATTER,
	JUMP_THORN
];
function resolveFusions(baseAttack, ranks) {
	return FUSION_RECIPES.filter((recipe) => recipe.baseAttack === baseAttack && recipe.requires.every((id) => ranks[id] > 0));
}
//#endregion
//#region src/combat.ts
/** Combat owns no DOM/GPU state. Every clock and movement is measured in seconds. */
const COMBAT_LIMITS = {
	enemies: 256,
	projectiles: 24,
	orbs: 96,
	effects: 48,
	shockwaves: 2
};
const ENEMY_TYPES = {
	normal: {
		name: "赤团",
		hp: 30,
		speed: 1.25,
		radius: .55,
		damage: 8,
		xp: 3,
		color: "#e59472"
	},
	fast: {
		name: "疾芽",
		hp: 18,
		speed: 2.7,
		radius: .4,
		damage: 6,
		xp: 2,
		color: "#edd779"
	},
	tank: {
		name: "岩甲",
		hp: 100,
		speed: .75,
		radius: .85,
		damage: 16,
		xp: 8,
		color: "#a58b6e"
	}
};
const WEAPON = {
	range: 10.5,
	interval: .44,
	speed: 18,
	damage: 18,
	lifetime: .8,
	radius: .2
};
const FORMAL_POUNCE = {
	...POUNCE,
	range: 6,
	windup: .85,
	speed: 13,
	duration: .5,
	recovery: 1.1,
	cooldown: 2
};
const SWARM_RULES = {
	health: [
		12,
		14,
		16,
		18,
		20,
		22
	],
	minDistance: 7.5,
	maxDistance: 14,
	halfAngle: .42,
	laneAngle: .78,
	xp: 1,
	killsPerXp: 3,
	killsPerCoin: 9,
	contactDamage: 3
};
/** Earliest segment / circle intersection, including shots that start inside a circle. */
function segmentHit(ax, az, bx, bz, x, z, radius) {
	const dx = bx - ax, dz = bz - az, ox = ax - x, oz = az - z;
	const c = ox * ox + oz * oz - radius * radius;
	if (c <= 0) return 0;
	const a = dx * dx + dz * dz;
	if (a < 1e-12) return Infinity;
	const b = ox * dx + oz * dz, discriminant = b * b - a * c;
	if (discriminant < 0) return Infinity;
	const t = (-b - Math.sqrt(discriminant)) / a;
	return t >= 0 && t <= 1 ? t : Infinity;
}
var Combat = class {
	get usesRunBuild() {
		return this.fusionEnabled && !!this.party;
	}
	get firingWeapon() {
		return this.salvo?.attackId;
	}
	constructor(obstacles = [], boundary = 32.3, random = Math.random, ruleset = "classic") {
		this.obstacles = obstacles;
		this.boundary = boundary;
		this.random = random;
		this.encounters = new EnemyChallenge();
		this.melee = {
			active: false,
			attackInstanceId: 0,
			x: 0,
			z: 0,
			aimX: 0,
			aimZ: 1,
			age: 0,
			radius: 0,
			angle: FLAME_SWEEP.angle,
			hitIds: new Int32Array(COMBAT_LIMITS.enemies)
		};
		this.useNavigation = false;
		this.fusionEnabled = false;
		this.automaticSpawning = true;
		this.goldEarned = 0;
		this.swarmCoinRemainder = 0;
		this.swarmExperienceRemainder = 0;
		this.runBuild = new RunBuild();
		this.tick = 0;
		this.nextWeapon = 0;
		this.launchClock = 0;
		this.childrenThisTick = 0;
		this.childWindow = 0;
		this.childrenInWindow = 0;
		this.bursts = 0;
		this.childShots = 0;
		this.navigationGoal = {
			x: 0,
			z: 0
		};
		this.enemies = Array.from({ length: COMBAT_LIMITS.enemies }, () => ({
			active: false,
			id: 0,
			kind: "normal",
			hp: 0,
			x: 0,
			z: 0,
			previousX: 0,
			previousZ: 0,
			age: 0,
			spawnTime: 0,
			flash: 0,
			knockX: 0,
			knockZ: 0,
			facing: 0,
			orbitCooldown: 0,
			intent: "chase",
			intentTime: 0,
			intentCooldown: 0,
			aimX: 0,
			aimZ: 1,
			stagger: 0,
			hornDash: 0
		}));
		this.projectiles = Array.from({ length: COMBAT_LIMITS.projectiles }, () => ({
			active: false,
			x: 0,
			z: 0,
			previousX: 0,
			previousZ: 0,
			vx: 0,
			vz: 0,
			life: 0,
			damage: 0,
			distance: 0
		}));
		this.orbs = Array.from({ length: COMBAT_LIMITS.orbs }, () => ({
			active: false,
			x: 0,
			z: 0,
			previousX: 0,
			previousZ: 0,
			value: 0,
			magnetized: false
		}));
		this.effects = Array.from({ length: COMBAT_LIMITS.effects }, () => ({
			active: false,
			x: 0,
			z: 0,
			time: 0,
			duration: 0,
			kind: "hit",
			enemyKind: "normal"
		}));
		this.shockwaves = Array.from({ length: COMBAT_LIMITS.shockwaves }, () => ({
			active: false,
			x: 0,
			z: 0,
			age: 0,
			radius: 0,
			previousRadius: 0,
			maxRadius: 0,
			damage: 0,
			hitIds: new Int32Array(COMBAT_LIMITS.enemies)
		}));
		this.hp = 100;
		this.kills = 0;
		this.invulnerability = 0;
		this.hurtFlash = 0;
		this.targetId = 0;
		this.elapsed = 0;
		this.shotsFired = 0;
		this.hits = 0;
		this.spawned = 0;
		this.collected = 0;
		this.orbitAngle = 0;
		this.previousOrbitAngle = 0;
		this.anchorX = 0;
		this.anchorZ = 0;
		this.playerVelocityX = 0;
		this.playerVelocityZ = 0;
		this.playerTurnRate = 0;
		this.previousAnchorX = 0;
		this.previousAnchorZ = 0;
		this.anchorInitialized = false;
		this.shockClock = 0;
		this.spawnClock = 2.6;
		this.fireClock = 0;
		this.nextId = 1;
		this.ruleset = "classic";
		this.dashSerial = 0;
		this.hornHits = 0;
		this.hornKills = 0;
		this.interrupts = 0;
		this.ruleset = ruleset;
		this.progression = new Progression(random);
		this.navigation = new GroundNavigation(obstacles, boundary);
	}
	get isTrial() {
		return this.ruleset !== "classic";
	}
	get isChallenge() {
		return this.ruleset === "horn-challenge";
	}
	enemyMaxHp(kind) {
		return this.isTrial && kind === "fast" ? POUNCE.hp : ENEMY_TYPES[kind].hp;
	}
	enemyRadius(enemy) {
		return enemy.radius ?? ENEMY_TYPES[enemy.kind].radius;
	}
	enemyHealth(enemy) {
		return enemy.maxHp ?? this.enemyMaxHp(enemy.kind);
	}
	get hasAttackIntents() {
		return this.isTrial || this.encounters.enabled;
	}
	get xp() {
		return this.progression.totalExperience;
	}
	get stats() {
		return this.progression.stats;
	}
	get maxHp() {
		return this.stats.maxHp;
	}
	get baseAttack() {
		return CREATURES[this.party?.leader.species ?? "yanrong"].skill;
	}
	get fusions() {
		return this.fusionEnabled ? this.usesRunBuild ? this.runBuild.attacks.flatMap((attack) => resolveFusions(attack.attackId, this.progression.ranks)) : resolveFusions(this.baseAttack, this.progression.ranks) : [];
	}
	get fusion() {
		return this.fusions[0];
	}
	chooseUpgrade(id) {
		return this.applyUpgrade(id, true);
	}
	grantUpgrade(id) {
		return this.usesRunBuild && this.applyUpgrade(id, false);
	}
	applyUpgrade(id, fromChoice) {
		if (this.hp <= 0) return false;
		const previous = this.stats;
		const previousSweep = flameSweepStats(this.runBuild.attacks.find((a) => a.attackId === "flame-sweep")?.level ?? 1);
		const intervals = new Map(this.runBuild.attacks.map((a) => [a.attackId, this.runBuild.rules(a.attackId).intervalMultiplier]));
		if (!(fromChoice ? this.progression.pick(id) : this.progression.grant(id))) return false;
		for (const attack of this.runBuild.attacks) {
			const interval = this.runBuild.rules(attack.attackId).intervalMultiplier;
			let ratio = previous.attackRateMultiplier / this.stats.attackRateMultiplier * interval / (intervals.get(attack.attackId) ?? interval);
			if (attack.attackId === "flame-sweep") {
				const nextSweep = flameSweepStats(attack.level);
				ratio *= nextSweep.interval / previousSweep.interval;
			}
			attack.cooldown *= ratio;
			attack.cooldownTotal *= ratio;
		}
		this.hp = Math.min(this.maxHp, this.hp + this.maxHp - previous.maxHp);
		this.fireClock *= previous.attackRateMultiplier / this.stats.attackRateMultiplier;
		if (this.party) for (const member of this.party.members) member.attackCooldown *= previous.attackRateMultiplier / this.stats.attackRateMultiplier;
		if (previous.shockDamage === 0 && this.stats.shockDamage > 0) this.shockClock = 0;
		return true;
	}
	reset(ruleset = this.ruleset) {
		this.encounters.reset();
		this.clearTransientEffects();
		this.navigation.invalidate();
		this.tick = this.bursts = this.childShots = this.goldEarned = 0;
		this.swarmCoinRemainder = 0;
		this.swarmExperienceRemainder = 0;
		this.melee.attackInstanceId = 0;
		this.melee.age = 0;
		this.melee.hitIds.fill(0);
		this.nextWeapon = this.launchClock = this.childrenThisTick = this.childWindow = this.childrenInWindow = 0;
		this.salvo = void 0;
		if (this.party) this.party.reset(this.party.members.map((member) => member.species));
		this.ruleset = ruleset;
		this.dashSerial = this.hornHits = this.hornKills = this.interrupts = 0;
		for (const pool of [
			this.enemies,
			this.projectiles,
			this.orbs,
			this.effects,
			this.shockwaves
		]) for (const item of pool) item.active = false;
		this.hp = 100;
		this.runBuild.reset(this.party?.leader.species ?? "yanrong");
		this.progression.build = this.usesRunBuild ? this.runBuild : void 0;
		this.progression.fusionBase = this.baseAttack;
		this.progression.reset(this.fusionEnabled);
		this.kills = this.invulnerability = this.hurtFlash = this.targetId = this.elapsed = 0;
		this.shotsFired = this.hits = this.spawned = this.collected = 0;
		this.spawnClock = 2.6;
		this.fireClock = 0;
		this.nextId = 1;
		this.orbitAngle = this.previousOrbitAngle = this.shockClock = 0;
		this.anchorX = this.anchorZ = this.previousAnchorX = this.previousAnchorZ = 0;
		this.anchorInitialized = false;
		this.playerVelocityX = this.playerVelocityZ = this.playerTurnRate = 0;
		for (const wave of this.shockwaves) wave.hitIds.fill(0);
	}
	/** Also used by deterministic simulation tests to arrange encounter positions. */
	spawn(kind, x, z, spawnTime = .75) {
		const enemy = this.enemies.find((candidate) => !candidate.active && candidate !== this.encounters.boss && candidate !== this.encounters.elite);
		if (!enemy) return;
		Object.assign(enemy, {
			active: true,
			id: this.nextId++,
			kind,
			x,
			z,
			previousX: x,
			previousZ: z,
			hp: this.enemyMaxHp(kind),
			age: 0,
			spawnTime,
			flash: 0,
			knockX: 0,
			knockZ: 0,
			facing: 0,
			orbitCooldown: 0,
			intent: "chase",
			intentTime: 0,
			intentCooldown: 0,
			aimX: 0,
			aimZ: 1,
			stagger: 0,
			hornDash: 0,
			slowTime: 0,
			walkPhase: this.nextId * 2.399963 % (Math.PI * 2),
			walkAmount: 0,
			walkX: 0,
			walkZ: 0,
			steerX: void 0,
			steerZ: void 0
		});
		enemy.rank = void 0;
		enemy.maxHp = enemy.radius = void 0;
		enemy.swarm = false;
		if (this.encounters.enabled) enemy.hp = enemy.maxHp = (kind === "fast" ? 40 : ENEMY_TYPES[kind].hp) * (ENCOUNTER_RULES.waveHealth[this.encounters.wave - 1] ?? 1);
		this.spawned++;
		return enemy;
	}
	spawnNear(player) {
		if (this.enemies.filter((enemy) => enemy.active).length >= 48) return;
		if (this.useNavigation) {
			const point = this.spawnPosition(player, 8, 12, ENEMY_TYPES.tank.radius);
			if (!point) return;
			const roll = this.random();
			const kind = this.spawned === 0 ? "normal" : this.spawned === 1 ? "fast" : this.spawned === 2 ? "tank" : roll < .58 ? "normal" : roll < .86 ? "fast" : "tank";
			this.spawn(kind, point.x, point.z);
			return;
		}
		for (let attempt = 0; attempt < 24; attempt++) {
			const angle = this.random() * Math.PI * 2, distance = 8 + this.random() * 4;
			const x = player.x + Math.sin(angle) * distance, z = player.z + Math.cos(angle) * distance;
			if (Math.hypot(x, z) > this.boundary - 1) continue;
			if (this.obstacles.some((obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + 1.1)) continue;
			const roll = this.random();
			const kind = this.spawned === 0 ? "normal" : this.spawned === 1 ? "fast" : this.spawned === 2 ? "tank" : roll < .58 ? "normal" : roll < .86 ? "fast" : "tank";
			this.spawn(kind, x, z);
			return;
		}
	}
	/** Finite encounters use the same pool, spawn warning, collision and enemy data. */
	spawnEncounter(kind, player, min = 6, max = 9) {
		if (this.useNavigation) {
			const point = this.spawnPosition(player, min, max, ENEMY_TYPES[kind].radius);
			return point ? this.spawn(kind, point.x, point.z) : void 0;
		}
		for (let attempt = 0; attempt < 24; attempt++) {
			const angle = this.random() * Math.PI * 2, distance = min + this.random() * (max - min);
			const x = player.x + Math.sin(angle) * distance, z = player.z + Math.cos(angle) * distance;
			const radius = ENEMY_TYPES[kind].radius;
			if (Math.hypot(x, z) > this.boundary - radius - .2) continue;
			if (this.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.radius + radius + .3)) continue;
			if (this.enemies.some((e) => e.active && Math.hypot(x - e.x, z - e.z) < radius + this.enemyRadius(e) + .3)) continue;
			return this.spawn(kind, x, z);
		}
	}
	spawnRank(rank, player) {
		const boss = rank === "boss", radius = boss ? ENCOUNTER_RULES.bossRadius : ENCOUNTER_RULES.eliteRadius;
		const point = this.spawnPosition(player, 6, 8.5, radius);
		const enemy = point ? this.spawn("tank", point.x, point.z, boss ? ENCOUNTER_RULES.bossSpawn : 1.2) : void 0;
		if (enemy) {
			enemy.rank = rank;
			enemy.radius = radius;
			enemy.hp = enemy.maxHp = boss ? ENCOUNTER_RULES.bossHp : ENCOUNTER_RULES.eliteHp;
		}
		return enemy;
	}
	/** One incoming sector per batch leaves the opposite side open at birth.
	* Finite placement attempts skip blocked members, never queue a catch-up burst. */
	spawnSwarm(player, count, cap, escort = "normal") {
		if (!this.encounters.enabled || !Number.isFinite(count) || !Number.isFinite(cap)) return 0;
		const available = Math.min(Math.floor(count), Math.floor(cap) - this.enemies.filter((e) => e.active).length, COMBAT_LIMITS.enemies);
		if (available <= 0 || this.enemies.every((e) => e.active)) return 0;
		const anchor = this.spawnPosition(player, SWARM_RULES.minDistance, SWARM_RULES.maxDistance, ENEMY_TYPES.tank.radius);
		if (!anchor) return 0;
		const heading = Math.atan2(anchor.x - player.x, anchor.z - player.z);
		let spawned = 0;
		for (let i = 0; i < available; i++) {
			const kind = i === available - 1 ? escort : "normal";
			const lane = i % 3 === 1 ? -SWARM_RULES.laneAngle : i % 3 === 2 ? SWARM_RULES.laneAngle : 0;
			const point = i === 0 ? anchor : this.spawnPosition(player, SWARM_RULES.minDistance, SWARM_RULES.maxDistance, ENEMY_TYPES[kind].radius, heading + lane);
			if (!point) continue;
			const enemy = this.spawn(kind, point.x, point.z);
			if (!enemy) break;
			if (kind === "normal") {
				enemy.swarm = true;
				enemy.hp = enemy.maxHp = SWARM_RULES.health[this.encounters.wave - 1] ?? 18;
			}
			spawned++;
		}
		return spawned;
	}
	spawnPosition(player, min, max, radius, heading) {
		const candidate = (angle, distance) => {
			const x = player.x + Math.sin(angle) * distance, z = player.z + Math.cos(angle) * distance;
			if (Math.hypot(x, z) > this.boundary - radius - .2) return;
			if (this.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.radius + radius + .3)) return;
			if (this.enemies.some((e) => e.active && Math.hypot(x - e.x, z - e.z) < radius + this.enemyRadius(e) + .3)) return;
			const point = {
				x,
				z
			};
			return this.navigation.reachable(point, player) ? point : void 0;
		};
		for (let attempt = 0; attempt < 24; attempt++) {
			const point = candidate(heading === void 0 ? this.random() * Math.PI * 2 : heading + (this.random() * 2 - 1) * SWARM_RULES.halfAngle, min + this.random() * (max - min));
			if (point) return point;
		}
		for (const distance of [
			(min + max) / 2,
			min,
			max
		]) for (let i = 0; i < 24; i++) {
			const point = candidate(heading === void 0 ? i * Math.PI / 12 + this.spawned * 2.399963 : heading + (i / 23 * 2 - 1) * SWARM_RULES.halfAngle, distance);
			if (point) return point;
		}
	}
	findTarget(player, range = WEAPON.range * this.stats.rangeMultiplier, includeBodyRadius = false) {
		let nearest, best = Infinity;
		for (const enemy of this.enemies) {
			if (!enemy.active || enemy.spawnTime > 0 || enemy.hp <= 0) continue;
			const squared = (enemy.x - player.x) ** 2 + (enemy.z - player.z) ** 2;
			if (squared >= best || squared >= (range + (includeBodyRadius ? this.enemyRadius(enemy) : 0)) ** 2) continue;
			if (this.obstacles.some((obstacle) => segmentHit(player.x, player.z, enemy.x, enemy.z, obstacle.x, obstacle.z, obstacle.radius + WEAPON.radius) !== Infinity)) continue;
			nearest = enemy;
			best = squared;
		}
		return nearest;
	}
	update(dt, player, dash) {
		if (this.hp <= 0 || dt <= 0) return;
		if (this.encounters.dying) {
			this.encounters.beforeTick(dt);
			return;
		}
		if (this.progression.awaitingChoice) return;
		this.tick++;
		if (this.encounters.enabled) this.encounters.beforeTick(dt);
		this.childrenThisTick = 0;
		this.childWindow += dt;
		if (this.childWindow >= 1) {
			this.childWindow %= 1;
			this.childrenInWindow = 0;
		}
		if (this.isTrial && dash?.active && dash.started) this.dashSerial++;
		this.previousAnchorX = this.anchorInitialized ? this.anchorX : player.x;
		this.previousAnchorZ = this.anchorInitialized ? this.anchorZ : player.z;
		this.anchorX = player.x;
		this.anchorZ = player.z;
		const vx = Math.max(-8, Math.min(8, (this.anchorX - this.previousAnchorX) / dt)), vz = Math.max(-8, Math.min(8, (this.anchorZ - this.previousAnchorZ) / dt));
		const turn = Math.hypot(vx, vz) > .2 && Math.hypot(this.playerVelocityX, this.playerVelocityZ) > .2 ? Math.atan2(this.playerVelocityX * vz - this.playerVelocityZ * vx, this.playerVelocityX * vx + this.playerVelocityZ * vz) / dt : 0;
		this.playerTurnRate += (Math.max(-1.5, Math.min(1.5, turn)) - this.playerTurnRate) * (1 - Math.exp(-12 * dt));
		this.playerVelocityX = vx;
		this.playerVelocityZ = vz;
		this.anchorInitialized = true;
		this.elapsed += dt;
		if (this.melee.active) {
			this.melee.age += dt;
			if (this.melee.age >= FLAME_SWEEP.duration) this.melee.active = false;
		}
		this.invulnerability = Math.max(0, this.invulnerability - dt);
		this.hurtFlash = Math.max(0, this.hurtFlash - dt);
		if (this.automaticSpawning && !this.isChallenge) this.spawnClock -= dt;
		if (this.automaticSpawning && !this.isChallenge && this.spawnClock <= 0) {
			this.spawnNear(player);
			this.spawnClock += Math.max(.5, 1.3 - this.elapsed * .006);
		}
		for (const effect of this.effects) if (effect.active) {
			effect.time -= dt;
			effect.active = effect.time > 0;
		}
		for (const enemy of this.enemies) {
			if (!enemy.active) continue;
			enemy.previousX = enemy.x;
			enemy.previousZ = enemy.z;
			enemy.slowTime = Math.max(0, (enemy.slowTime ?? 0) - dt);
			enemy.age += dt;
			enemy.flash = Math.max(0, enemy.flash - dt);
			enemy.orbitCooldown = Math.max(0, enemy.orbitCooldown - dt);
			if (!enemy.rank && Math.hypot(enemy.x - player.x, enemy.z - player.z) > 29) {
				enemy.active = false;
				continue;
			}
			if (enemy.spawnTime > 0) {
				enemy.spawnTime = Math.max(0, enemy.spawnTime - dt);
				continue;
			}
			const type = ENEMY_TYPES[enemy.kind], radius = this.enemyRadius(enemy);
			const dx = player.x - enemy.x, dz = player.z - enemy.z;
			const length = Math.max(.001, Math.hypot(dx, dz));
			let steerX = dx / length, steerZ = dz / length;
			const guided = this.useNavigation && this.navigation.guide(enemy, player, radius, this.navigationGoal);
			if (guided) {
				const gx = this.navigationGoal.x - enemy.x, gz = this.navigationGoal.z - enemy.z;
				const distance = Math.max(.001, Math.hypot(gx, gz));
				steerX = gx / distance;
				steerZ = gz / distance;
			}
			for (const other of this.enemies) {
				if (!other.active || other === enemy || other.spawnTime > 0) continue;
				const ox = enemy.x - other.x, oz = enemy.z - other.z;
				const distance = Math.hypot(ox, oz), avoid = radius + this.enemyRadius(other);
				if (distance <= .001) {
					const angle = Math.min(enemy.id, other.id) * 2.399963, sign = enemy.id < other.id ? 1 : -1;
					steerX += Math.cos(angle) * sign * 1.7;
					steerZ += Math.sin(angle) * sign * 1.7;
				} else if (distance < avoid) {
					const strength = (avoid - distance) / avoid * 1.7;
					steerX += ox / distance * strength;
					steerZ += oz / distance * strength;
				}
			}
			if (!guided) for (const obstacle of this.obstacles) {
				const ox = enemy.x - obstacle.x, oz = enemy.z - obstacle.z;
				const distance = Math.hypot(ox, oz), avoid = obstacle.radius + radius + .7;
				if (distance < avoid && distance > .001) {
					const strength = (avoid - distance) / avoid * 2.4;
					const side = enemy.id % 2 ? 1 : -1;
					steerX += (ox - oz * side * .8) / distance * strength;
					steerZ += (oz + ox * side * .8) / distance * strength;
				}
			}
			const steeringLength = Math.max(1, Math.hypot(steerX, steerZ));
			const desiredX = steerX / steeringLength, desiredZ = steerZ / steeringLength, smoothing = 1 - Math.exp(-14 * dt);
			enemy.steerX = (enemy.steerX ?? desiredX) + (desiredX - (enemy.steerX ?? desiredX)) * smoothing;
			enemy.steerZ = (enemy.steerZ ?? desiredZ) + (desiredZ - (enemy.steerZ ?? desiredZ)) * smoothing;
			const smoothLength = Math.max(1, Math.hypot(enemy.steerX, enemy.steerZ));
			let moveX = enemy.steerX / smoothLength * type.speed, moveZ = enemy.steerZ / smoothLength * type.speed;
			if (this.hasAttackIntents && !enemy.rank) {
				enemy.stagger = Math.max(0, enemy.stagger - dt);
				if (enemy.stagger > 0) moveX = moveZ = 0;
				else if (enemy.kind === "fast") {
					const rule = this.encounters.enabled ? FORMAL_POUNCE : POUNCE;
					if (!this.encounters.enabled || enemy.intent !== "chase" || !this.covered(enemy.x, enemy.z, player.x, player.z)) this.updatePounce(enemy, dt, dx, dz, length, rule);
					if (enemy.intent === "pounce") {
						moveX = enemy.aimX * rule.speed;
						moveZ = enemy.aimZ * rule.speed;
					} else if (enemy.intent !== "chase") moveX = moveZ = 0;
				} else if (this.encounters.enabled) {
					this.updateMelee(enemy, dt, dx, dz, length);
					if (enemy.intent !== "chase") moveX = moveZ = 0;
				}
			}
			if (this.encounters.enabled && enemy.rank) {
				const motion = this.encounters.movement(enemy, dt, player, this, moveX, moveZ);
				moveX = motion.x;
				moveZ = motion.z;
			}
			if ((enemy.slowTime ?? 0) > 0) {
				const slow = enemy.rank === "boss" ? .85 : ELEMENTAL_RULES.slowFactor;
				moveX *= slow;
				moveZ *= slow;
			}
			this.moveEnemy(enemy, moveX * dt, moveZ * dt, radius);
			enemy.walkX = enemy.x - enemy.previousX;
			enemy.walkZ = enemy.z - enemy.previousZ;
			this.moveEnemy(enemy, enemy.knockX * dt, enemy.knockZ * dt, radius);
			const decay = Math.exp(-14 * dt);
			enemy.knockX *= decay;
			enemy.knockZ *= decay;
			enemy.facing = this.hasAttackIntents && (enemy.intent === "windup" || enemy.intent === "pounce") ? Math.atan2(enemy.aimX, enemy.aimZ) : Math.atan2(dx, dz);
			const boundaryDistance = Math.hypot(enemy.x, enemy.z), limit = this.boundary - radius;
			if (boundaryDistance > limit) {
				enemy.x *= limit / boundaryDistance;
				enemy.z *= limit / boundaryDistance;
			}
			const travelled = Math.hypot(enemy.walkX, enemy.walkZ);
			const moving = Math.min(1, travelled / Math.max(.001, type.speed * dt));
			enemy.walkAmount = (enemy.walkAmount ?? 0) + (moving - (enemy.walkAmount ?? 0)) * (1 - Math.exp(-12 * dt));
			enemy.walkPhase = ((enemy.walkPhase ?? 0) + travelled * ENEMY_MOTION[enemy.kind].cadence) % (Math.PI * 2);
		}
		if (this.isTrial && dash?.active && this.dashSerial > 0) this.resolveHorn(player, dash);
		if (this.usesRunBuild && this.party) {
			const member = this.party.leader, attacks = this.runBuild.attacks;
			for (const attack of attacks) attack.cooldown = Math.max(0, attack.cooldown - dt);
			for (const attack of attacks) {
				if (ATTACKS[attack.attackId].kind !== "melee_arc") continue;
				const rules = this.runBuild.rules(attack.attackId);
				const growth = flameSweepStats(attack.level, this.stats.rangeMultiplier, rules.areaMultiplier);
				if (this.encounters.dying || attack.cooldown > 1e-8) continue;
				const radius = growth.radius;
				const offset = growth.degrees === 360 ? 0 : FLAME_SWEEP.bodyOffset;
				const target = this.findTarget(member, radius + offset, true);
				if (!target) continue;
				const dx = target.x - member.x, dz = target.z - member.z, length = Math.max(.001, Math.hypot(dx, dz));
				const aimX = length > .001 ? dx / length : 0, aimZ = length > .001 ? dz / length : 1;
				Object.assign(this.melee, {
					active: true,
					attackInstanceId: this.melee.attackInstanceId + 1,
					x: member.x + aimX * offset,
					z: member.z + aimZ * offset,
					aimX,
					aimZ,
					age: 0,
					radius,
					angle: growth.angle
				});
				this.melee.hitIds.fill(0);
				for (let i = 0; i < this.enemies.length; i++) {
					const enemy = this.enemies[i];
					if (!enemy.active || enemy.spawnTime > 0 || enemy.hp <= 0 || this.melee.hitIds[i] === enemy.id || !insideSweep(enemy.x - this.melee.x, enemy.z - this.melee.z, aimX, aimZ, radius, this.enemyRadius(enemy), growth.angle) || this.covered(this.melee.x, this.melee.z, enemy.x, enemy.z) || this.covered(member.x, member.z, enemy.x, enemy.z)) continue;
					this.melee.hitIds[i] = enemy.id;
					this.damageEnemy(enemy, FLAME_SWEEP.damage * this.stats.damageMultiplier * rules.damageMultiplier * rules.directMultiplier * (enemy.rank ? FLAME_SWEEP.eliteMultiplier : 1), aimX, aimZ);
					this.effect(enemy.x, enemy.z, "hit", enemy.kind);
					if (this.encounters.dying) {
						this.melee.active = false;
						break;
					}
				}
				attack.cooldown = growth.interval * rules.intervalMultiplier / this.stats.attackRateMultiplier;
				attack.cooldownTotal = attack.cooldown;
				attack.shotsFired++;
			}
			member.targetId = this.findTarget(member, ATTACKS[attacks[0].attackId].range * this.stats.rangeMultiplier)?.id ?? 0;
			this.targetId = member.targetId;
			this.launchClock = Math.max(0, this.launchClock - dt);
			if (this.launchClock <= 1e-8) {
				if (!this.salvo) for (let offset = 0; offset < attacks.length; offset++) {
					const index = (this.nextWeapon + offset) % attacks.length, attack = attacks[index];
					const weapon = ATTACKS[attack.attackId], rules = this.runBuild.rules(attack.attackId);
					if (weapon.kind !== "projectile") continue;
					const range = weapon.range * this.stats.rangeMultiplier;
					if (attack.cooldown > 1e-8 || !this.findTarget(member, range)) continue;
					if (this.projectiles.filter((s) => !s.active).length < this.stats.projectileCount + (attack.slot ? this.stats.projectileCount : 0)) continue;
					this.salvo = {
						attackId: attack.attackId,
						sourceId: member.id,
						species: member.species,
						damage: weapon.damage * this.stats.damageMultiplier * rules.damageMultiplier,
						range,
						total: Math.min(4, this.stats.projectileCount),
						index: 0,
						rules,
						fusions: resolveFusions(attack.attackId, this.progression.ranks).map((recipe) => recipe.id)
					};
					attack.cooldown = weapon.interval * (attack.slot === 0 ? 1 : attack.slot === 1 ? 1.6 : 1.9) * rules.intervalMultiplier / this.stats.attackRateMultiplier;
					attack.cooldownTotal = attack.cooldown;
					this.nextWeapon = (index + 1) % attacks.length;
					break;
				}
				const salvo = this.salvo;
				if (salvo) {
					const target = this.findTarget(member, salvo.range);
					if (!target) {
						this.salvo = void 0;
						this.launchClock = COMBAT_CLARITY.volleyGap;
					} else if (this.fireBolts(member, target, salvo.damage, 1, salvo.range, salvo.sourceId, salvo.species, salvo.attackId, salvo)) {
						attacks.find((a) => a.attackId === salvo.attackId).shotsFired++;
						member.shotsFired++;
						salvo.index++;
						if (salvo.index >= salvo.total) {
							this.salvo = void 0;
							this.launchClock = COMBAT_CLARITY.volleyGap;
						} else this.launchClock = COMBAT_CLARITY.shotGap;
					}
				}
			}
		} else if (this.party) {
			for (const member of this.party.members) {
				const stats = this.party.statsFor(member, this.stats);
				const target = this.findTarget(member, stats.range);
				member.targetId = target?.id ?? 0;
				member.attackCooldown = Math.max(0, member.attackCooldown - dt);
				if (target && member.attackCooldown <= 1e-8 && this.fireBolts(member, target, stats.damage, stats.projectileCount, stats.range, member.id, member.species)) {
					member.attackCooldown = stats.interval;
					member.shotsFired += stats.projectileCount;
				}
			}
			this.targetId = this.party.leader.targetId;
		} else {
			const target = this.findTarget(player);
			this.targetId = target?.id ?? 0;
			this.fireClock = Math.max(0, this.fireClock - dt);
			if (target && this.fireClock <= 1e-8 && this.fireBolts(player, target, WEAPON.damage * this.stats.damageMultiplier, this.stats.projectileCount, WEAPON.range * this.stats.rangeMultiplier)) this.fireClock = WEAPON.interval / this.stats.attackRateMultiplier;
		}
		for (const shot of this.projectiles) {
			if (!shot.active || shot.generation === BURST_SEED.maxGeneration && shot.bornTick === this.tick) continue;
			shot.age = (shot.age ?? 0) + dt;
			shot.previousX = shot.x;
			shot.previousZ = shot.z;
			if (shot.elemental && shot.hopTargetId) {
				this.advanceHop(shot, dt);
				continue;
			}
			if (shot.homing) this.steerChild(shot, dt);
			const travelTime = Math.min(dt, shot.life);
			shot.x += shot.vx * travelTime;
			shot.z += shot.vz * travelTime;
			shot.life -= dt;
			shot.distance += WEAPON.speed * travelTime;
			if (shot.elemental) {
				this.elementalHit(shot);
				continue;
			}
			let earliest = Infinity, victim;
			for (const obstacle of this.obstacles) earliest = Math.min(earliest, segmentHit(shot.previousX, shot.previousZ, shot.x, shot.z, obstacle.x, obstacle.z, obstacle.radius + WEAPON.radius));
			for (const enemy of this.enemies) {
				if (!enemy.active || enemy.spawnTime > 0 || enemy.id === shot.ignoreEnemyId) continue;
				const t = segmentHit(shot.previousX, shot.previousZ, shot.x, shot.z, enemy.x, enemy.z, this.enemyRadius(enemy) + WEAPON.radius);
				if (t < earliest) {
					earliest = t;
					victim = enemy;
				}
			}
			if (earliest !== Infinity) {
				shot.active = false;
				const x = shot.previousX + (shot.x - shot.previousX) * earliest, z = shot.previousZ + (shot.z - shot.previousZ) * earliest;
				this.effect(x, z, "hit");
				if (victim) {
					this.damageEnemy(victim, shot.damage, shot.vx / WEAPON.speed, shot.vz / WEAPON.speed);
					if (shot.burst && (shot.generation ?? 0) < BURST_SEED.maxGeneration) this.burstSeed(shot, victim, x, z);
				}
			} else if (shot.life <= 0) shot.active = false;
		}
		this.updateSkills(dt, player);
		if (this.encounters.enabled) this.encounters.advanceHazards(dt, this, player, {
			x: this.previousAnchorX,
			z: this.previousAnchorZ
		});
		if (this.invulnerability === 0) {
			let damage = 0;
			for (const enemy of this.enemies) {
				if (!enemy.active || enemy.spawnTime > 0) continue;
				if (this.hasAttackIntents && (enemy.stagger > 0 || enemy.intent === "windup" || enemy.intent === "recover")) continue;
				if (this.encounters.enabled && (enemy.rank === "elite" || enemy.rank === "boss" && this.encounters.bossState !== "dash" || !enemy.rank && enemy.intent !== "pounce")) continue;
				const type = ENEMY_TYPES[enemy.kind];
				if ((this.hasAttackIntents && (enemy.intent === "pounce" || enemy.rank === "boss") && segmentHit(enemy.previousX - this.previousAnchorX, enemy.previousZ - this.previousAnchorZ, enemy.x - player.x, enemy.z - player.z, 0, 0, this.enemyRadius(enemy) + .62) !== Infinity || Math.hypot(enemy.x - player.x, enemy.z - player.z) < this.enemyRadius(enemy) + .62) && (!this.encounters.enabled || !this.covered(enemy.x, enemy.z, player.x, player.z))) damage = Math.max(damage, enemy.rank === "boss" ? 24 : enemy.swarm ? SWARM_RULES.contactDamage : type.damage);
			}
			if (damage > 0) this.hitPlayer(damage);
		}
		if (this.hp <= 0) return;
		for (const orb of this.orbs) {
			if (!orb.active) continue;
			orb.previousX = orb.x;
			orb.previousZ = orb.z;
			const dx = player.x - orb.x, dz = player.z - orb.z, distance = Math.hypot(dx, dz);
			if (distance < 3) orb.magnetized = true;
			if (!orb.magnetized) continue;
			const travel = Math.min(distance, 11 * dt);
			if (distance > .001) {
				orb.x += dx / distance * travel;
				orb.z += dz / distance * travel;
			}
			if (distance - travel < .65) {
				this.progression.gainExperience(orb.value);
				this.collected++;
				orb.active = false;
				this.effect(orb.x, orb.z, "collect");
				if (this.progression.awaitingChoice) break;
			}
		}
	}
	hitPlayer(damage) {
		if (this.hp <= 0 || this.invulnerability > 0) return;
		this.hp = Math.max(0, this.hp - damage);
		this.invulnerability = .85;
		this.hurtFlash = .25;
		this.effect(this.anchorX, this.anchorZ, "hurt");
	}
	hostileWallHit(ax, az, bx, bz, radius) {
		return this.obstacles.reduce((t, o) => Math.min(t, segmentHit(ax, az, bx, bz, o.x, o.z, o.radius + radius)), Infinity);
	}
	hostilePlayerHit(ax, az, bx, bz, radius) {
		return segmentHit(ax, az, bx, bz, 0, 0, radius);
	}
	/** Shared pool + swept collision + damageEnemy for every controlled/partner bolt. */
	fireBolts(origin, target, damage, count, range, sourceId = 0, species, attackId = CREATURES[species ?? "yanrong"].skill, salvo) {
		if (ATTACKS[attackId].kind !== "projectile") return false;
		let available = 0;
		for (const shot of this.projectiles) if (!shot.active) available++;
		if (available < count) return false;
		const x = target.x - origin.x, z = target.z - origin.z, length = Math.max(.001, Math.hypot(x, z));
		const recipes = this.fusionEnabled ? resolveFusions(attackId, this.progression.ranks) : [];
		const fusionIds = salvo?.fusions ?? recipes.map((recipe) => recipe.id);
		const rules = salvo?.rules ?? (this.usesRunBuild ? this.runBuild.rules(attackId) : resolveAttackRules(attackId, [], 1));
		for (let i = 0; i < count; i++) {
			const shot = this.projectiles.find((candidate) => !candidate.active);
			const sequence = salvo?.index ?? i;
			const spread = sequence === 0 ? 0 : Math.ceil(sequence / 2) * (sequence % 2 ? 1 : -1) * .11;
			const angle = Math.atan2(x / length, z / length) + spread;
			Object.assign(shot, {
				active: true,
				x: origin.x,
				z: origin.z,
				previousX: origin.x,
				previousZ: origin.z,
				vx: Math.sin(angle) * WEAPON.speed,
				vz: Math.cos(angle) * WEAPON.speed,
				distance: 0,
				life: Math.max(WEAPON.lifetime, range / WEAPON.speed + .12),
				damage: damage * rules.directMultiplier,
				baseDamage: damage,
				sourceId,
				species,
				attackId,
				attackRules: rules,
				homing: false,
				generation: 0,
				bornTick: this.tick,
				ignoreEnemyId: 0,
				burst: fusionIds.includes("burst-seed") && attackId === "spark",
				age: 0,
				elemental: this.fusionEnabled && (attackId === "bubble" || attackId === "leaf"),
				fusionIds,
				hitIds: [],
				damageIds: [],
				hopTargetId: 0,
				hopDelay: 0,
				hopElapsed: 0,
				hopDuration: 0,
				pierces: this.fusionEnabled && attackId === "leaf" && !fusionIds.includes("jump-thorn") ? ELEMENTAL_RULES.leafPierces + rules.pierceBonus : 0,
				bounces: fusionIds.includes("chain-bubble") ? CHAIN_BUBBLE.maxHops : fusionIds.includes("jump-thorn") ? JUMP_THORN.maxHops : 0,
				scatter: fusionIds.includes("thorn-scatter")
			});
			this.shotsFired++;
		}
		return true;
	}
	/** Instant one-pass AoE. Children share the 24-slot pool and start next tick. */
	burstSeed(parent, original, x, z) {
		const damage = parent.baseDamage ?? parent.damage, angle = Math.atan2(parent.vx, parent.vz), sourceId = parent.sourceId;
		const rules = parent.attackRules ?? resolveAttackRules("spark", [], 1), species = parent.species;
		const radius = BURST_SEED.explosionRadius * rules.areaMultiplier;
		const childCount = BURST_SEED.childCount + rules.childCountBonus;
		this.bursts++;
		this.effect(x, z, "burst", original.kind, radius);
		for (const enemy of this.enemies) {
			if (!enemy.active || enemy.spawnTime > 0 || enemy.id === original.id) continue;
			const dx = enemy.x - x, dz = enemy.z - z, distance = Math.hypot(dx, dz);
			if (distance > radius + this.enemyRadius(enemy)) continue;
			this.damageEnemy(enemy, damage * BURST_SEED.explosionDamage, dx / Math.max(.001, distance), dz / Math.max(.001, distance));
		}
		for (let i = 0; i < childCount; i++) {
			const child = this.projectiles.find((shot) => !shot.active);
			if (!child || !this.reserveChild()) break;
			const direction = angle + (i - (childCount - 1) / 2) * 2 * BURST_SEED.childAngle / Math.max(1, childCount - 1);
			Object.assign(child, {
				active: true,
				x,
				z,
				previousX: x,
				previousZ: z,
				vx: Math.sin(direction) * WEAPON.speed,
				vz: Math.cos(direction) * WEAPON.speed,
				life: BURST_SEED.childLifetime,
				damage: damage * BURST_SEED.childDamage * rules.childDamageMultiplier * rules.directMultiplier,
				baseDamage: damage * BURST_SEED.childDamage * rules.childDamageMultiplier,
				attackRules: rules,
				homing: rules.childHoming,
				distance: 0,
				sourceId,
				species,
				attackId: "spark",
				generation: BURST_SEED.maxGeneration,
				bornTick: this.tick,
				ignoreEnemyId: original.id,
				burst: false,
				age: 0,
				elemental: false,
				fusionIds: [],
				hitIds: [],
				pierces: 0,
				bounces: 0,
				scatter: false
			});
			this.childShots++;
		}
	}
	/** Swept circle contact plus bounded tangent sliding; never project a crowd through cover. */
	moveEnemy(enemy, dx, dz, radius) {
		for (let pass = 0; pass < 3 && Math.hypot(dx, dz) > 1e-8; pass++) {
			let earliest = Infinity, blocker;
			for (const obstacle of this.obstacles) {
				const ox = enemy.x - obstacle.x, oz = enemy.z - obstacle.z;
				if (ox * ox + oz * oz < (obstacle.radius + radius) ** 2 && ox * dx + oz * dz > 0) continue;
				const t = segmentHit(enemy.x, enemy.z, enemy.x + dx, enemy.z + dz, obstacle.x, obstacle.z, obstacle.radius + radius);
				if (t < earliest) {
					earliest = t;
					blocker = obstacle;
				}
			}
			if (!blocker) {
				enemy.x += dx;
				enemy.z += dz;
				return;
			}
			const safe = Math.max(0, earliest - 1e-4);
			enemy.x += dx * safe;
			enemy.z += dz * safe;
			const ox = enemy.x - blocker.x, oz = enemy.z - blocker.z, length = Math.max(1e-4, Math.hypot(ox, oz));
			const nx = ox / length, nz = oz / length;
			dx *= 1 - earliest;
			dz *= 1 - earliest;
			const inward = Math.min(0, dx * nx + dz * nz);
			dx -= nx * inward;
			dz -= nz * inward;
		}
	}
	/** A bounded trigger budget; children never crowd out an entire main volley. */
	reserveChild() {
		let free = 0;
		for (const shot of this.projectiles) if (!shot.active) free++;
		if (this.childrenThisTick >= 6 || this.childrenInWindow >= 24 || this.usesRunBuild && this.runBuild.attacks.length > 1 && free <= this.stats.projectileCount) return false;
		this.childrenThisTick++;
		this.childrenInWindow++;
		return true;
	}
	steerChild(shot, dt) {
		let target, nearest = 4;
		for (const enemy of this.enemies) {
			if (!enemy.active || enemy.spawnTime > 0 || enemy.id === shot.ignoreEnemyId || shot.hitIds?.includes(enemy.id)) continue;
			const distance = Math.hypot(enemy.x - shot.x, enemy.z - shot.z);
			if (distance < nearest && !this.covered(shot.x, shot.z, enemy.x, enemy.z)) {
				nearest = distance;
				target = enemy;
			}
		}
		if (!target) return;
		const current = Math.atan2(shot.vx, shot.vz), desired = Math.atan2(target.x - shot.x, target.z - shot.z);
		const delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
		const angle = current + Math.max(-2.5 * dt, Math.min(2.5 * dt, delta)), speed = Math.hypot(shot.vx, shot.vz);
		shot.vx = Math.sin(angle) * speed;
		shot.vz = Math.cos(angle) * speed;
	}
	chainRange(shot) {
		return this.chainRule(shot).range * (shot.attackRules?.chainRangeMultiplier ?? 1);
	}
	chainRule(shot) {
		return shot.fusionIds?.includes("chain-bubble") ? CHAIN_BUBBLE : JUMP_THORN;
	}
	clearWave() {
		this.clearTransientEffects();
		for (const enemy of this.enemies) enemy.active = false;
		for (const orb of this.orbs) orb.active = false;
		this.targetId = this.hurtFlash = this.invulnerability = 0;
		if (this.party) for (const member of this.party.members) member.targetId = 0;
		this.encounters.reset();
	}
	clearTransientEffects() {
		this.melee.active = false;
		this.encounters.clearShots();
		this.salvo = void 0;
		this.launchClock = 0;
		for (const shot of this.projectiles) {
			shot.active = false;
			shot.hitIds = [];
			shot.damageIds = [];
			shot.hopTargetId = 0;
			shot.hopDelay = shot.hopElapsed = 0;
			shot.fusionIds = [];
		}
		for (const effect of this.effects) {
			effect.active = false;
			effect.fusionId = void 0;
		}
		for (const wave of this.shockwaves) wave.active = false;
	}
	nextHop(shot, x, z) {
		return this.enemies.filter((e) => e.active && e.spawnTime <= 0 && e.hp > 0 && !shot.damageIds?.includes(e.id) && Math.hypot(e.x - x, e.z - z) <= this.chainRange(shot) && !this.covered(x, z, e.x, e.z)).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z) || a.id - b.id)[0];
	}
	covered(x, z, tx, tz) {
		return this.obstacles.some((o) => segmentHit(x, z, tx, tz, o.x, o.z, o.radius + WEAPON.radius) !== Infinity);
	}
	beginHop(shot, target) {
		const rule = this.chainRule(shot);
		shot.bounces = (shot.bounces ?? 0) - 1;
		shot.pierces = 0;
		const hop = rule.maxHops - shot.bounces;
		shot.damage = (shot.baseDamage ?? shot.damage) * rule.hopDamage * (shot.attackRules?.chainDecay ?? 1) ** hop * (shot.attackRules?.directMultiplier ?? 1);
		shot.hopTargetId = target.id;
		shot.hopDelay = rule.delay;
		shot.hopElapsed = 0;
		shot.hopDuration = rule.hopDuration;
		shot.hopFromX = shot.x;
		shot.hopFromZ = shot.z;
	}
	advanceHop(shot, dt) {
		let target = this.enemies.find((e) => e.active && e.id === shot.hopTargetId && e.hp > 0 && e.spawnTime <= 0 && !shot.damageIds?.includes(e.id));
		if (!target || Math.hypot(target.x - shot.hopFromX, target.z - shot.hopFromZ) > this.chainRange(shot) || this.covered(shot.x, shot.z, target.x, target.z)) {
			target = this.nextHop(shot, shot.x, shot.z);
			if (!target) {
				shot.active = false;
				shot.hopTargetId = 0;
				return;
			}
			shot.hopTargetId = target.id;
			shot.hopElapsed = 0;
			shot.hopFromX = shot.x;
			shot.hopFromZ = shot.z;
		}
		const wait = Math.min(dt, shot.hopDelay ?? 0);
		shot.hopDelay = Math.max(0, (shot.hopDelay ?? 0) - wait);
		dt -= wait;
		if (dt <= 0) return;
		shot.hopElapsed = Math.min(shot.hopDuration, (shot.hopElapsed ?? 0) + dt);
		const t = shot.hopElapsed / shot.hopDuration;
		shot.vx = (target.x - shot.x) / Math.max(.001, shot.hopDuration);
		shot.vz = (target.z - shot.z) / Math.max(.001, shot.hopDuration);
		shot.x = shot.hopFromX + (target.x - shot.hopFromX) * t;
		shot.z = shot.hopFromZ + (target.z - shot.hopFromZ) * t;
		if (t >= 1) this.elementalHit(shot);
	}
	/** Swept collision; one damage ledger includes primary and splash victims. */
	elementalHit(shot) {
		const ids = shot.hitIds ?? (shot.hitIds = []);
		const damaged = shot.damageIds ?? (shot.damageIds = []);
		const chain = shot.fusionIds?.includes("chain-bubble") || shot.fusionIds?.includes("jump-thorn");
		const wall = this.obstacles.reduce((t, o) => Math.min(t, segmentHit(shot.previousX, shot.previousZ, shot.x, shot.z, o.x, o.z, o.radius + WEAPON.radius)), Infinity);
		const contacts = this.enemies.filter((e) => e.active && e.spawnTime <= 0 && !ids.includes(e.id) && (!chain || !damaged.includes(e.id)) && e.id !== shot.ignoreEnemyId && (!shot.hopTargetId || e.id === shot.hopTargetId)).map((enemy) => ({
			enemy,
			t: segmentHit(shot.previousX, shot.previousZ, shot.x, shot.z, enemy.x, enemy.z, this.enemyRadius(enemy) + WEAPON.radius)
		})).filter((c) => c.t < wall && c.t !== Infinity).sort((a, b) => a.t - b.t || a.enemy.id - b.enemy.id);
		for (const { enemy, t } of contacts) {
			if (!enemy.active) continue;
			const x = shot.previousX + (shot.x - shot.previousX) * t, z = shot.previousZ + (shot.z - shot.previousZ) * t;
			ids.push(enemy.id);
			damaged.push(enemy.id);
			this.damageEnemy(enemy, shot.damage, shot.vx / WEAPON.speed, shot.vz / WEAPON.speed);
			const fusionId = shot.fusionIds?.[0];
			const deep = shot.fusionIds?.includes("deep-bubble"), waterChain = shot.fusionIds?.includes("chain-bubble");
			const rules = shot.attackRules ?? resolveAttackRules(shot.attackId ?? "bubble", [], 1);
			this.effect(x, z, shot.attackId === "bubble" ? "water" : "thorn", enemy.kind, (deep ? DEEP_BUBBLE.radius : waterChain ? CHAIN_BUBBLE.radius : .6) * rules.areaMultiplier, fusionId, shot.attackId === "bubble" ? enemy : void 0);
			if (shot.attackId === "bubble") {
				if (enemy.active) enemy.slowTime = rules.slowDuration;
				if (deep || waterChain) {
					const rule = deep ? DEEP_BUBBLE : CHAIN_BUBBLE;
					for (const other of this.enemies) {
						if (!other.active || other.spawnTime > 0 || other.id === enemy.id || damaged.includes(other.id) || Math.hypot(other.x - x, other.z - z) > rule.radius * rules.areaMultiplier + this.enemyRadius(other) || this.covered(x, z, other.x, other.z)) continue;
						this.damageEnemy(other, (shot.baseDamage ?? shot.damage) * rule.damage, 0, 0);
						damaged.push(other.id);
						if (other.active) other.slowTime = rules.slowDuration;
					}
				}
			}
			if (shot.scatter && (shot.generation ?? 0) === 0) {
				shot.scatter = false;
				this.scatterThorns(shot, x, z, enemy.id);
			}
			if (chain) {
				shot.x = shot.previousX = x;
				shot.z = shot.previousZ = z;
				shot.hopTargetId = 0;
				const target = (shot.bounces ?? 0) > 0 ? this.nextHop(shot, x, z) : void 0;
				if (target) {
					this.beginHop(shot, target);
					return;
				}
				shot.active = false;
				return;
			}
			if ((shot.pierces ?? 0) > 0) {
				shot.pierces = (shot.pierces ?? 0) - 1;
				continue;
			}
			shot.active = false;
			return;
		}
		if (wall !== Infinity || !shot.hopTargetId && shot.life <= 0) {
			shot.active = false;
			shot.hopTargetId = 0;
		}
	}
	scatterThorns(parent, x, z, originalId) {
		const angle = Math.atan2(parent.vx, parent.vz);
		const rules = parent.attackRules ?? resolveAttackRules("leaf", [], 1), count = THORN_SCATTER.childCount + rules.childCountBonus;
		for (let i = 0; i < count; i++) {
			const child = this.projectiles.find((s) => !s.active);
			if (!child || !this.reserveChild()) break;
			const direction = angle + (i - (count - 1) / 2) * THORN_SCATTER.angle;
			Object.assign(child, {
				active: true,
				x,
				z,
				previousX: x,
				previousZ: z,
				vx: Math.sin(direction) * WEAPON.speed,
				vz: Math.cos(direction) * WEAPON.speed,
				life: THORN_SCATTER.lifetime,
				damage: (parent.baseDamage ?? parent.damage) * THORN_SCATTER.childDamage * rules.childDamageMultiplier * rules.directMultiplier,
				baseDamage: (parent.baseDamage ?? parent.damage) * THORN_SCATTER.childDamage * rules.childDamageMultiplier,
				attackRules: rules,
				homing: rules.childHoming,
				distance: 0,
				sourceId: parent.sourceId,
				species: parent.species,
				attackId: "leaf",
				generation: 1,
				bornTick: this.tick,
				ignoreEnemyId: originalId,
				burst: false,
				age: 0,
				elemental: true,
				fusionIds: [],
				hitIds: [originalId],
				pierces: 0,
				bounces: 0,
				scatter: false,
				damageIds: [],
				hopTargetId: 0,
				hopDelay: 0,
				hopElapsed: 0,
				hopDuration: 0
			});
			this.childShots++;
		}
	}
	updatePounce(enemy, dt, dx, dz, distance, rule = POUNCE) {
		enemy.intentCooldown = Math.max(0, enemy.intentCooldown - dt);
		if (enemy.intent === "chase") {
			if (enemy.intentCooldown === 0 && distance <= rule.range) {
				enemy.intent = "windup";
				enemy.intentTime = rule.windup;
				if (this.encounters.enabled) {
					const lead = rule.windup + Math.min(rule.duration, distance / rule.speed);
					const point = predictPosition({
						x: enemy.x + dx,
						z: enemy.z + dz
					}, this.playerVelocityX, this.playerVelocityZ, this.playerTurnRate, lead);
					const tx = point.x - enemy.x, tz = point.z - enemy.z, length = Math.max(.001, Math.hypot(tx, tz));
					enemy.aimX = tx / length;
					enemy.aimZ = tz / length;
				} else {
					enemy.aimX = dx / distance;
					enemy.aimZ = dz / distance;
				}
			}
			return;
		}
		enemy.intentTime = Math.max(0, enemy.intentTime - dt);
		if (enemy.intentTime > 1e-8) return;
		if (enemy.intent === "windup") {
			enemy.intent = "pounce";
			enemy.intentTime = rule.duration;
		} else if (enemy.intent === "pounce") {
			enemy.intent = "recover";
			enemy.intentTime = rule.recovery;
		} else {
			enemy.intent = "chase";
			enemy.intentCooldown = rule.cooldown;
		}
	}
	updateMelee(enemy, dt, dx, dz, distance) {
		enemy.intentCooldown = Math.max(0, enemy.intentCooldown - dt);
		if (enemy.intent === "chase") {
			if (!enemy.intentCooldown && distance < this.enemyRadius(enemy) + 1 && !this.covered(enemy.x, enemy.z, enemy.x + dx, enemy.z + dz)) {
				enemy.intent = "windup";
				enemy.intentTime = ENCOUNTER_RULES.meleeWindup;
				enemy.aimX = dx / distance;
				enemy.aimZ = dz / distance;
			}
		} else {
			enemy.intentTime = Math.max(0, enemy.intentTime - dt);
			if (enemy.intentTime <= 1e-8) {
				if (enemy.intent === "windup") {
					enemy.intent = "pounce";
					enemy.intentTime = ENCOUNTER_RULES.meleeActive;
				} else if (enemy.intent === "pounce") {
					enemy.intent = "recover";
					enemy.intentTime = ENCOUNTER_RULES.meleeRecovery;
				} else {
					enemy.intent = "chase";
					enemy.intentCooldown = .3;
				}
			}
		}
	}
	resolveHorn(player, dash) {
		for (const enemy of this.enemies) {
			if (!enemy.active || enemy.spawnTime > 0 || enemy.hornDash === this.dashSerial) continue;
			const t = segmentHit(dash.fromX - enemy.previousX, dash.fromZ - enemy.previousZ, player.x - enemy.x, player.z - enemy.z, 0, 0, HORN.radius + this.enemyRadius(enemy));
			if (t === Infinity) continue;
			const px = dash.fromX + (player.x - dash.fromX) * t, pz = dash.fromZ + (player.z - dash.fromZ) * t;
			const ex = enemy.previousX + (enemy.x - enemy.previousX) * t, ez = enemy.previousZ + (enemy.z - enemy.previousZ) * t;
			if ((ex - px) * dash.dx + (ez - pz) * dash.dz < -.2) continue;
			if (this.obstacles.some((obstacle) => segmentHit(px, pz, ex, ez, obstacle.x, obstacle.z, obstacle.radius) !== Infinity)) continue;
			enemy.hornDash = this.dashSerial;
			const interrupted = enemy.intent === "windup" || enemy.intent === "pounce";
			this.damageEnemy(enemy, HORN.damage, dash.dx, dash.dz);
			this.hornHits++;
			if (!enemy.active) this.hornKills++;
			if (interrupted) this.interrupts++;
			if (enemy.active) {
				enemy.knockX = dash.dx * HORN.knockback;
				enemy.knockZ = dash.dz * HORN.knockback;
				enemy.stagger = HORN.stagger;
				if (enemy.kind === "fast") {
					enemy.intent = "recover";
					enemy.intentTime = POUNCE.recovery;
				}
			}
			this.effect(ex, ez, "hit");
		}
	}
	damageEnemy(enemy, damage, dx, dz) {
		if (!enemy.active || enemy.spawnTime > 0 || enemy.hp <= 0) return;
		this.hits++;
		enemy.hp = Math.max(0, enemy.hp - damage);
		enemy.flash = .16;
		const strength = enemy.rank === "boss" ? 0 : enemy.kind === "tank" ? 1.2 : 3;
		enemy.knockX = dx * strength;
		enemy.knockZ = dz * strength;
		if (enemy.hp === 0) {
			enemy.active = false;
			this.kills++;
			if (this.usesRunBuild) {
				if (enemy.swarm) {
					this.swarmCoinRemainder++;
					if (this.swarmCoinRemainder === SWARM_RULES.killsPerCoin) {
						this.goldEarned++;
						this.swarmCoinRemainder = 0;
					}
				} else this.goldEarned += enemy.rank === "boss" ? 0 : enemy.rank === "elite" ? 18 : enemy.kind === "tank" ? 2 : 1;
			}
			if (enemy.rank === "boss") this.encounters.killedBoss(this);
			else {
				let experience = enemy.rank === "elite" ? 24 : ENEMY_TYPES[enemy.kind].xp;
				if (enemy.swarm) {
					this.swarmExperienceRemainder++;
					experience = this.swarmExperienceRemainder === SWARM_RULES.killsPerXp ? SWARM_RULES.xp : 0;
					if (experience) this.swarmExperienceRemainder = 0;
				}
				if (experience) this.dropExperience(enemy.x, enemy.z, experience);
				this.effect(enemy.x, enemy.z, "death", enemy.kind, 0, void 0, enemy);
			}
		}
	}
	updateSkills(dt, player) {
		const stats = this.stats;
		this.previousOrbitAngle = this.orbitAngle;
		this.orbitAngle += stats.orbitSpeed * dt;
		for (const enemy of this.enemies) {
			if (!enemy.active || enemy.spawnTime > 0 || enemy.orbitCooldown > 0) continue;
			for (let i = 0; i < stats.orbitCount; i++) {
				const offset = i / stats.orbitCount * Math.PI * 2;
				if (segmentHit(this.previousAnchorX + Math.cos(this.previousOrbitAngle + offset) * stats.orbitRadius, this.previousAnchorZ + Math.sin(this.previousOrbitAngle + offset) * stats.orbitRadius, player.x + Math.cos(this.orbitAngle + offset) * stats.orbitRadius, player.z + Math.sin(this.orbitAngle + offset) * stats.orbitRadius, enemy.x, enemy.z, this.enemyRadius(enemy) + SKILL_RULES.orbitBallRadius) === Infinity) continue;
				const dx = enemy.x - player.x, dz = enemy.z - player.z, distance = Math.max(.001, Math.hypot(dx, dz));
				this.damageEnemy(enemy, stats.orbitDamage, dx / distance, dz / distance);
				this.effect(enemy.x, enemy.z, "hit");
				enemy.orbitCooldown = SKILL_RULES.orbitHitInterval;
				break;
			}
		}
		if (stats.shockDamage > 0) {
			this.shockClock -= dt;
			if (this.shockClock <= 0) {
				const wave = this.shockwaves.find((candidate) => !candidate.active);
				if (wave) {
					Object.assign(wave, {
						active: true,
						x: player.x,
						z: player.z,
						age: 0,
						radius: 0,
						previousRadius: 0,
						maxRadius: stats.shockRadius,
						damage: stats.shockDamage
					});
					wave.hitIds.fill(0);
					this.shockClock += stats.shockInterval;
				}
			}
		}
		for (const wave of this.shockwaves) {
			if (!wave.active) continue;
			wave.age = Math.min(SKILL_RULES.waveDuration, wave.age + dt);
			wave.previousRadius = wave.radius;
			wave.radius = wave.maxRadius * wave.age / SKILL_RULES.waveDuration;
			for (let index = 0; index < this.enemies.length; index++) {
				const enemy = this.enemies[index];
				if (!enemy.active || enemy.spawnTime > 0 || wave.hitIds[index] === enemy.id) continue;
				const dx = enemy.x - wave.x, dz = enemy.z - wave.z, distance = Math.hypot(dx, dz);
				if (distance > wave.radius + this.enemyRadius(enemy)) continue;
				wave.hitIds[index] = enemy.id;
				this.damageEnemy(enemy, wave.damage, dx / Math.max(.001, distance), dz / Math.max(.001, distance));
				this.effect(enemy.x, enemy.z, "hit");
			}
			if (wave.age >= SKILL_RULES.waveDuration) wave.active = false;
		}
	}
	dropExperience(x, z, value) {
		let orb = this.orbs.find((candidate) => !candidate.active);
		if (!orb) {
			orb = this.orbs.reduce((best, candidate) => (candidate.x - x) ** 2 + (candidate.z - z) ** 2 < (best.x - x) ** 2 + (best.z - z) ** 2 ? candidate : best);
			orb.value += value;
			return;
		}
		Object.assign(orb, {
			active: true,
			x,
			z,
			previousX: x,
			previousZ: z,
			value,
			magnetized: false
		});
	}
	effect(x, z, kind, enemyKind = "normal", radius = 0, fusionId, enemy) {
		const effect = this.effects.find((candidate) => !candidate.active);
		const duration = kind === "burst" ? BURST_SEED.explosionDuration : fusionId === "deep-bubble" ? DEEP_BUBBLE.duration : fusionId === "thorn-scatter" ? .375 : kind === "death" ? .55 : .32;
		if (effect) Object.assign(effect, {
			active: true,
			x,
			z,
			kind,
			enemyKind,
			radius,
			duration,
			time: duration,
			fusionId,
			enemyId: enemy?.id,
			anchorX: enemy?.x,
			anchorZ: enemy?.z,
			moveX: enemy?.walkX ?? 0,
			moveZ: enemy?.walkZ ?? 0
		});
	}
	inspect() {
		return {
			build: {
				enabled: this.usesRunBuild,
				species: this.runBuild.species,
				relics: [...this.runBuild.relics],
				evolution: this.runBuild.evolution ?? null,
				attacks: this.runBuild.attacks.map((attack) => ({ ...attack }))
			},
			melee: {
				...this.melee,
				hitIds: Array.from(this.melee.hitIds).filter(Boolean)
			},
			firing: {
				weapon: this.salvo?.attackId ?? null,
				remaining: this.salvo ? this.salvo.total - this.salvo.index : 0,
				gap: this.launchClock
			},
			hp: this.hp,
			kills: this.kills,
			goldEarned: this.goldEarned,
			xp: this.xp,
			shotsFired: this.shotsFired,
			hits: this.hits,
			fusion: {
				enabled: this.fusionEnabled,
				active: this.fusion?.id ?? null,
				recipes: this.fusions.map((f) => f.id),
				bursts: this.bursts,
				childShots: this.childShots,
				children: this.projectiles.filter((shot) => shot.active && shot.generation === 1).length
			},
			spawned: this.spawned,
			collected: this.collected,
			invulnerability: this.invulnerability,
			enemies: this.enemies.filter((enemy) => enemy.active).map((enemy) => ({
				id: enemy.id,
				kind: enemy.kind,
				x: enemy.x,
				z: enemy.z,
				hp: enemy.hp,
				spawning: enemy.spawnTime > 0
			})),
			projectiles: this.projectiles.filter((shot) => shot.active).length,
			orbs: this.orbs.filter((orb) => orb.active).map((orb) => ({
				x: orb.x,
				z: orb.z,
				value: orb.value
			})),
			effects: this.effects.filter((effect) => effect.active).length,
			targetId: this.targetId,
			limits: COMBAT_LIMITS,
			maxHp: this.maxHp,
			progression: this.progression.inspect(),
			encounters: this.encounters.inspect(),
			orbitAngle: this.orbitAngle,
			trial: this.isTrial ? {
				organ: "charge-horns",
				hits: this.hornHits,
				kills: this.hornKills,
				interrupts: this.interrupts,
				goal: HORN.goal,
				complete: this.hornHits >= HORN.goal,
				intents: this.enemies.filter((enemy) => enemy.active).map((enemy) => ({
					id: enemy.id,
					state: enemy.intent,
					remaining: enemy.intentTime,
					aimX: enemy.aimX,
					aimZ: enemy.aimZ,
					stagger: enemy.stagger
				}))
			} : void 0,
			shockwaves: this.shockwaves.filter((wave) => wave.active).map((wave) => ({
				x: wave.x,
				z: wave.z,
				radius: wave.radius,
				damage: wave.damage,
				age: wave.age
			}))
		};
	}
};
//#endregion
//#region scripts/weapon-balance.ts
/** Deterministic stationary pressure probes, not survival or human playtest results.
* Each fixture isolates one primary weapon, fixes enemy positions before each tick,
* and disables XP choice pauses. No other weapon contributes damage.
*/
function measureWeapon(weapon, level, scenario, specialized = false) {
	const c = new Combat([], 32, () => .25);
	c.party = new PartySystem();
	c.fusionEnabled = true;
	c.automaticSpawning = false;
	c.reset();
	if (weapon !== "spark") c.grantUpgrade(`${weapon}-weapon`);
	const chosen = c.runBuild.attacks.find((a) => a.attackId === weapon);
	c.runBuild.attacks.splice(0, c.runBuild.attacks.length, chosen);
	chosen.slot = 0;
	chosen.cooldown = 0;
	for (let i = 1; i < level; i++) c.grantUpgrade(`${weapon}-weapon`);
	if (specialized) {
		if (weapon === "spark") {
			c.grantUpgrade("split-on-hit");
			c.grantUpgrade("multishot");
		}
		if (weapon === "bubble") {
			c.grantUpgrade("area");
			c.grantUpgrade("chain");
		}
		if (weapon === "leaf") {
			c.grantUpgrade("split-on-hit");
			c.grantUpgrade("chain");
		}
		if (weapon === "flame-sweep") {
			c.grantUpgrade("damage");
			c.grantUpgrade("haste");
		}
	}
	Object.defineProperty(c.progression, "threshold", { get: () => Infinity });
	c.invulnerability = 1e3;
	const duration = 24, ticks = 1440;
	const positions = scenario.startsWith("boss") ? [{
		x: scenario === "boss-near" ? 2 : 8,
		z: 0
	}] : scenario === "line" ? Array.from({ length: 6 }, (_, i) => ({
		x: 4.5 + i * 1.4,
		z: 0
	})) : Array.from({ length: scenario === "mowing" ? 24 : 12 }, (_, i) => ({
		x: Math.cos(i * Math.PI * 2 / (scenario === "mowing" ? 24 : 12)) * 2.6,
		z: Math.sin(i * Math.PI * 2 / (scenario === "mowing" ? 24 : 12)) * 2.6
	}));
	const targets = [];
	const spawn = (p) => {
		const e = c.spawn("normal", p.x, p.z, 0);
		e.hp = scenario === "mowing" ? 22 : 1e5;
		if (scenario.startsWith("boss")) {
			e.rank = "boss";
			e.radius = .85;
		}
		if (scenario === "mowing") e.swarm = true;
		return e;
	};
	for (const p of positions) targets.push(spawn(p));
	let damage = 0, slowTicks = 0;
	for (let t = 0; t < ticks; t++) {
		for (let i = 0; i < targets.length; i++) {
			if (!targets[i].active) targets[i] = spawn(positions[i]);
			Object.assign(targets[i], positions[i], {
				knockX: 0,
				knockZ: 0
			});
		}
		const health = targets.map((e) => e.hp);
		c.party.syncLeader({
			x: 0,
			z: 0
		}, 0);
		c.update(1 / 60, {
			x: 0,
			z: 0
		});
		damage += targets.reduce((sum, e, i) => sum + health[i] - e.hp, 0);
		slowTicks += targets.filter((e) => (e.slowTime ?? 0) > 0).length;
	}
	return {
		weapon,
		level,
		scenario,
		specialized,
		dps: +(damage / duration).toFixed(2),
		kills: c.kills,
		slowUptime: +(slowTicks / (ticks * targets.length)).toFixed(3),
		sweeps: c.melee.attackInstanceId
	};
}
function weaponBalanceMatrix() {
	return [
		1,
		3,
		5
	].flatMap((level) => [false, true].flatMap((specialized) => [
		"boss-near",
		"boss-far",
		"cluster",
		"line",
		"mowing"
	].flatMap((scenario) => [
		"spark",
		"bubble",
		"leaf",
		"flame-sweep"
	].map((weapon) => measureWeapon(weapon, level, scenario, specialized)))));
}
//#endregion
export { measureWeapon, weaponBalanceMatrix };
