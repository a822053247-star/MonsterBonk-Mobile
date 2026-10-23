/** Adapted from the supplied 幻兽囚坊 Canvas scene. Source systems retained; battle collection owns unlocks. */
export interface PrisonOptions { owns:(asset:string)=>boolean; image:(asset:string)=>string; cue:(pitch:number,duration:number,kind:OscillatorType)=>void }
export function mountPrison(root:ShadowRoot,options:PrisonOptions) {
 const abort=new AbortController();let frame=0;
 const element=(id:string)=>root.getElementById(id);
/* 幻兽囚坊：纯 Canvas 的独立中文单场景游戏。怪物类型只影响造型，不影响工种和产量。 */
type Job = 'mine' | 'haul' | 'grow';
type Building = 'rail' | 'warehouse' | 'garden';
type SocialKind = 'chat' | 'bicker' | 'nap';
type Personality = 'curious' | 'sleepy' | 'mischief' | 'friendly' | 'shy' | 'energetic';
type BuildingLevels = Record<Building, number>;
type Goods = Record<Job, number>;
type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
interface Monster { id: number; species: number; name: string; personality: Personality; job: Job | null; progress: number; cycles: number; cargo: number }
interface TinyEvent { job: Job; cleared: number }
interface SocialMoment { kind: SocialKind; a: number; b: number | null; remaining: number }
interface EscapeMoment { id: number; origin: Point; elapsed: number }
interface FireflyMoment { remaining: number; taps: number; phase: number }
const ESCAPE_SECONDS = 13;

interface Save { version: 7; monsters: Monster[]; goods: Goods; pending: Goods; totalCycles: number; event: TinyEvent | null; paused: boolean; pitOre: number; bloom: number; flowers: number; shipments: number; commissionIndex: number; completedCommissions: number; seals: number; buildings: BuildingLevels;
  social: SocialMoment | null; escape: EscapeMoment | null; socialTimer: number; escapeTimer: number; socialCount: number; stoppedEscapes: number; firefly: FireflyMoment | null; fireflyTimer: number; firefliesCaught: number; }

interface Particle extends Point { vx: number; vy: number; life: number; max: number; radius: number; color: string }
interface FloatingText extends Point { text: string; life: number; max: number; color: string }
interface Visual extends Point { speed: number; walking: boolean }
interface FrameLayout { cells: Point[]; stations: Record<Job, Point>; chest: Point; capture: Point; pause: Point; sound: Point; rest: Rect; room: Rect; board: Point; gate: Point; build: Record<Building, Point> }
const KEY = 'monsterbonk:prison-scene:v1';
const PIT_CAP = 36;
const CYCLE_SECONDS = 12;
const PER_ROUND = 4;
const MAX_MONSTERS = 6;
const JOBS: Job[] = ['mine', 'haul', 'grow'];
const PERSONALITIES: Personality[] = ['curious', 'sleepy', 'mischief', 'friendly', 'shy', 'energetic'];
const PERSONALITY_INFO: Record<Personality, { name: string; glyph: string }> = {
  curious: { name: '好奇', glyph: '?' }, sleepy: { name: '贪睡', glyph: 'ᶻ' },
  mischief: { name: '调皮', glyph: '!' }, friendly: { name: '热心', glyph: '♡' },
  shy: { name: '慢热', glyph: '…' }, energetic: { name: '活泼', glyph: '✦' },
};
function personalityFor(species: number, id: number): Personality { return PERSONALITIES[(species * 5 + id * 3) % PERSONALITIES.length]; }
function isPersonality(value: unknown): value is Personality { return typeof value === 'string' && PERSONALITIES.includes(value as Personality); }
const BUILDINGS: Building[] = ['rail', 'warehouse', 'garden'];
const COMMISSIONS: ReadonlyArray<{ title: string; needs: Goods }> = [
  { title: '开张备货', needs: { mine: 0, haul: 4, grow: 4 } },
  { title: '修好矿轨', needs: { mine: 4, haul: 4, grow: 0 } },
  { title: '花圃补给', needs: { mine: 4, haul: 0, grow: 5 } },
  { title: '木架订单', needs: { mine: 0, haul: 6, grow: 5 } },
  { title: '晶矿装箱', needs: { mine: 6, haul: 6, grow: 0 } },
  { title: '秘境园艺', needs: { mine: 6, haul: 0, grow: 7 } },
];
const BUILD_NAMES: Record<Building,string> = { rail: '升级轨道', warehouse: '扩建仓库', garden: '升级花圃' };
const BUILD_COSTS: Record<Building, readonly Goods[]> = {
 rail: [{ mine: 4, haul: 3, grow: 0 }, { mine: 9, haul: 7, grow: 0 }],
 warehouse: [{ mine: 0, haul: 3, grow: 4 }, { mine: 0, haul: 8, grow: 8 }],
 garden: [{ mine: 3, haul: 0, grow: 4 }, { mine: 8, haul: 0, grow: 8 }],
};
// 18 original monsters, in the same order as the user-supplied source sheet.
const MONSTERS = [
  { name: '深渊灯灵', asset: 'abyss-lantern' },
  { name: '晶甲爬虫', asset: 'crystal-crawler' },
  { name: '晶簇虫', asset: 'draft-crystal-swarm' },
  { name: '孢子爆虫', asset: 'draft-spore-bomber' },
  { name: '寻宝兽', asset: 'draft-treasure-runner' },
  { name: '霜绒兽', asset: 'frost-fluff' },
  { name: '草丛怪', asset: 'grass-monster' },
  { name: '镜晶灵', asset: 'mirror-wisp' },
  { name: '熔火果', asset: 'molten-fruit' },
  { name: '月露贝', asset: 'moondew-shell' },
  { name: '夜影蝠', asset: 'nightshade-bat' },
  { name: '岩甲虫', asset: 'rock-armor-bug' },
  { name: '疾行虫', asset: 'runner-bug' },
  { name: '沙壳兽', asset: 'sand-shell' },
  { name: '绯红花灵', asset: 'scarlet-flower' },
  { name: '孢子飘灵', asset: 'spore-floater' },
  { name: '雷鸣铃', asset: 'thunder-bell' },
  { name: '毒孢菇', asset: 'toxic-shroom' },
] as const;
const INITIAL_SPECIES: number[] = []; // 熔火果、月露贝、岩甲虫
const OLD_SPECIES = [9, 8, 11, 10, 17, 0] as const; // map old placeholder creatures to the real roster
const images=MONSTERS.map(m=>{const image=new Image();image.src=options.image(m.asset);return image;});
let rosterOpen = false;

const JOB_NAMES: Record<Job, string> = { mine: '挖矿', haul: '搬运', grow: '种植' };
const GOOD_NAMES: Record<Job, string> = { mine: '矿石', haul: '木料', grow: '草药' };
const EVENT_NAMES: Record<Job, string> = { mine: '矿车卡住', haul: '货箱散落', grow: '藤蔓打结' };
const COLORS = { bg: '#111c20', gold: '#f2d997', cream: '#fbefce', muted: '#9db2a7', teal: '#8bc8aa', line: '#354a43', stone: '#56645e' };
const canvas = element('game') as HTMLCanvasElement;
const c = canvas.getContext('2d', { alpha: false })!;
const announcer = element('notice')!;
let W = 1280, H = 730, scale = 1, portrait = false, clock = 0, lastStamp = 0, renderedAt = 0;
let selected: number | null = null, hovered: string | null = null;
let shake = 0, saveClock = 0, toastLife = 0, toastMessage = '';
let shownCost: Building | null = null, costLife = 0;
let audioOn = true;
const particles: Particle[] = [], texts: FloatingText[] = [];
const visuals = new Map<number, Visual>();
const sparks = Array.from({ length: 45 }, (_, i) => ({ seed: (i * 13.71) % 1, x: (i * 279.23) % 1, y: (i * 179.11) % 1 }));

function initial(): Save {
  return { version: 7,
    monsters: INITIAL_SPECIES.map((species, i) => ({ species, name: MONSTERS[species].name, id: i + 1, personality: personalityFor(species, i + 1), job: null, progress: 0, cycles: 0, cargo: 0 })),
    goods: { mine: 0, haul: 0, grow: 0 }, pending: { mine: 0, haul: 0, grow: 0 },
    totalCycles: 0, event: null, paused: false, pitOre: 0, bloom: 0, flowers: 0, shipments: 0,
    commissionIndex: 0, completedCommissions: 0, seals: 0, buildings: { rail: 0, warehouse: 0, garden: 0 },
    social: null, escape: null, socialTimer: 11, escapeTimer: 38, socialCount: 0, stoppedEscapes: 0,
    firefly: null, fireflyTimer: 29, firefliesCaught: 0 };
}
function clean(n: unknown, max = 999999): number { return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : 0; }
function isJob(x: unknown): x is Job { return x === 'mine' || x === 'haul' || x === 'grow'; }
function clampSeconds(n: unknown, maximum: number): number { return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(maximum, n)) : 0; }
function safeTimer(n: unknown, fallback: number): number { return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback; }
function clampCoord(n: unknown): number { return typeof n === 'number' && Number.isFinite(n) ? Math.max(-6000, Math.min(6000, n)) : 0; }
function validSocial(e: unknown, monsters: Monster[]): e is SocialMoment {
 if (!e || typeof e !== 'object') return false;
 const v = e as SocialMoment;
 return (v.kind === 'chat' || v.kind === 'bicker' || v.kind === 'nap')
   && monsters.some(m => m.id === v.a) && (v.b === null || (v.b !== v.a && monsters.some(m => m.id === v.b)))
   && typeof v.remaining === 'number' && Number.isFinite(v.remaining);
}
function validFirefly(e: unknown): e is FireflyMoment {
 if (!e || typeof e !== 'object') return false;
 const v = e as FireflyMoment;
 return typeof v.remaining === 'number' && Number.isFinite(v.remaining) && v.remaining >= 0 && v.remaining <= 12
   && Number.isInteger(v.taps) && v.taps >= 0 && v.taps <= 2
   && typeof v.phase === 'number' && Number.isFinite(v.phase);
}
function validEscape(e: unknown, monsters: Monster[]): e is EscapeMoment {
 if (!e || typeof e !== 'object') return false;
 const v = e as EscapeMoment;
 return monsters.some(m => m.id === v.id) && !!v.origin && typeof v.origin === 'object'
   && typeof v.origin.x === 'number' && Number.isFinite(v.origin.x)
   && typeof v.origin.y === 'number' && Number.isFinite(v.origin.y)
   && typeof v.elapsed === 'number' && Number.isFinite(v.elapsed);
}
function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial();
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || ![2, 3, 4, 5, 6, 7].includes((data as { version?: number }).version ?? -1)) return initial();
    const s = data as Partial<Save>;
    const found: Monster[] = [];
    const used = new Set<number>();
    for (const rawMonster of Array.isArray(s.monsters) ? s.monsters : []) {
      const id: unknown = rawMonster?.id;
      if (!Number.isInteger(id) || typeof id !== 'number' || id < 1 || id > 6 || used.has(id)) continue;
      used.add(id);
      const legacySpecies = OLD_SPECIES[id - 1];
      const species = Number.isInteger(rawMonster.species) && rawMonster.species >= 0 && rawMonster.species < MONSTERS.length
        ? rawMonster.species : legacySpecies;
      found.push({ id, species, name: MONSTERS[species].name, personality: isPersonality(rawMonster.personality) ? rawMonster.personality : personalityFor(species, id), job: isJob(rawMonster.job) ? rawMonster.job : null,
        progress: typeof rawMonster.progress === 'number' && Number.isFinite(rawMonster.progress)
          ? Math.min(CYCLE_SECONDS - .001, Math.max(0, rawMonster.progress)) : 0,
        cycles: clean(rawMonster.cycles), cargo: clean(rawMonster.cargo, 4) });
    }
    if (!found.length) return initial();
    const goods = (v?: Goods): Goods => ({ mine: clean(v?.mine), haul: clean(v?.haul), grow: clean(v?.grow) });
    let event: TinyEvent | null = null;
    if (s.event && isJob(s.event.job)) {
      const older = s.event as TinyEvent & { taps?: number };
      event = { job: s.event.job, cleared: clean(older.cleared ?? ((1 << clean(older.taps, 2)) - 1), 7) };
    }
    return { version: 7, monsters: found.sort((a, b) => a.id - b.id), goods: goods(s.goods),
      pending: goods(s.pending), totalCycles: clean(s.totalCycles), event, paused: s.paused === true,
      pitOre: clean(s.pitOre, PIT_CAP), bloom: clean(s.bloom, 12), flowers: clean(s.flowers), shipments: clean(s.shipments),
      commissionIndex: clean(s.commissionIndex, 99999), completedCommissions: clean(s.completedCommissions),
      seals: clean(s.seals, 9999), buildings: { rail: clean(s.buildings?.rail, 2), warehouse: clean(s.buildings?.warehouse, 2), garden: clean(s.buildings?.garden, 2) },
      social: validSocial(s.social, found) ? { ...s.social, remaining: clampSeconds(s.social.remaining, 12) } : null,
      escape: validEscape(s.escape, found) ? { id: s.escape.id, origin: { x: clampCoord(s.escape.origin.x), y: clampCoord(s.escape.origin.y) }, elapsed: clampSeconds(s.escape.elapsed, ESCAPE_SECONDS) } : null,
      socialTimer: safeTimer(s.socialTimer, 11), escapeTimer: safeTimer(s.escapeTimer, 38),
      socialCount: clean(s.socialCount), stoppedEscapes: clean(s.stoppedEscapes),
      firefly: validFirefly(s.firefly) ? { remaining: clampSeconds(s.firefly.remaining, 12), taps: clean(s.firefly.taps, 2), phase: clampCoord(s.firefly.phase) } : null,
      fireflyTimer: safeTimer(s.fireflyTimer, 29), firefliesCaught: clean(s.firefliesCaught) };
  } catch { return initial(); }
}
let state = load();
state.monsters=state.monsters.filter(m=>options.owns(MONSTERS[m.species].asset));
function store(): void { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { say('囚坊存档失败，请勿关闭页面'); } }
function say(message: string, seconds = 2.1): void { toastMessage = message; toastLife = seconds; announcer.textContent = message; }
function ding(pitch = 440, duration = .10, kind: OscillatorType = 'sine'): void {
  if (!audioOn) return;
  options.cue(pitch,duration,kind);
}
function resize(): void {
  const pxW = Math.max(240, canvas.clientWidth), pxH = Math.max(320, canvas.clientHeight);
  portrait = pxH > pxW * 1.08;
  scale = portrait ? pxW / 700 : Math.min(pxW / 1280, pxH / 730);
  W = pxW / scale; H = pxH / scale;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(pxW * ratio); canvas.height = Math.round(pxH * ratio);
  c.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  for (const p of state.monsters) if (!visuals.has(p.id)) visuals.set(p.id, { ...home(p.id), speed: 0, walking: false });
}
function layout(): FrameLayout {
  const room: Rect = { x: portrait ? 18 : Math.max(22, (W - 1460) / 2), y: portrait ? 151 : 100,
    w: portrait ? W - 36 : Math.min(W - 44, 1460), h: portrait ? H - 245 : H - 172 };
  const cells: Point[] = [];
  if (portrait) {
    for (let i = 0; i < 6; i++) cells.push({ x: W / 2 + (i % 3 - 1) * 206, y: room.y + 142 + Math.floor(i / 3) * 154 });
  } else {
    const gap = Math.min(196, (room.w - 160) / 6);
    for (let i = 0; i < 6; i++) cells.push({ x: W / 2 + (i - 2.5) * gap, y: room.y + Math.min(155, room.h * .31) });
  }
  const stations: Record<Job, Point> = portrait ? {
    mine: { x: W * .27, y: Math.min(H * .51, room.y + room.h * .67) },
    haul: { x: W * .73, y: Math.min(H * .51, room.y + room.h * .67) },
    grow: { x: W * .49, y: H * .75 },
  } : {
    mine: { x: W * .24, y: room.y + room.h * .73 },
    haul: { x: W * .50, y: room.y + room.h * .73 },
    grow: { x: W * .76, y: room.y + room.h * .73 },
  };
  const chest = portrait ? { x: W - 102, y: H - 160 } : { x: W - 120, y: H - 145 };
  // Escape gate stays inside the world, away from resource buttons and the workstations.
  const gate = { x: room.x + (portrait ? 56 : 73), y: portrait ? room.y + 446 : room.y + room.h * .56 };
  const board = portrait ? { x: W*.48, y: stations.grow.y - 240 }
    : { x: W*.50, y: room.y + room.h*.53 - 55 };
  const build: Record<Building,Point> = {
    rail: portrait ? { x: stations.haul.x+103, y: stations.haul.y+122 } : { x: stations.haul.x-9, y: stations.haul.y+116 },
    warehouse: { x: chest.x-(portrait?65:66), y: chest.y-(portrait?109:139) },
    garden: { x: stations.grow.x+(portrait?117:-122), y: stations.grow.y-(portrait?105:113) },
  };
  return { room, cells, stations, chest, board, gate, build,
    capture: { x: W - 62, y: portrait ? 54 : 57 },
    pause: { x: W - 120, y: portrait ? 54 : 57 },
    sound: { x: W - 177, y: portrait ? 54 : 57 },
    rest: { x: portrait ? W / 2 + 124 : W / 2 + 165, y: H - (portrait ? 61 : 45), w: 110, h: 43 } };
}
function home(id: number): Point { const cell = layout().cells[id - 1]; return { x: cell.x, y: cell.y + 35 }; }
function mix(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * Math.max(0, Math.min(1, t)),
    y: a.y + (b.y - a.y) * Math.max(0, Math.min(1, t)) };
}
function workPos(p: Monster): Point {
  if (state.escape?.id === p.id) {
    // The monster physically sneaks from its last position to the gate.
    const t = Math.min(1, state.escape.elapsed / ESCAPE_SECONDS);
    const ease = t * t * (3 - 2 * t);
    return mix(state.escape.origin, layout().gate, ease);
  }
  if (!p.job) return home(p.id);
  if (p.job === 'haul') {
    // A real round trip: depot → mine → warehouse → depot.
    const l = layout(), depot = { x: l.stations.haul.x - 5, y: l.stations.haul.y + 22 };
    const pit = { x: l.stations.mine.x + 71, y: l.stations.mine.y + 22 };
    const warehouse = { x: l.chest.x - 45, y: l.chest.y + 15 };
    const t = p.progress;
    if (t < 1) return depot;
    if (t < 3.3) return mix(depot, pit, (t - 1) / 2.3);
    if (t < 4.6) return pit;
    if (t < 8.6) return mix(pit, warehouse, (t - 4.6) / 4);
    if (t < 9.2) return warehouse;
    if (t < 11.8) return mix(warehouse, depot, (t - 9.2) / 2.6);
    return depot;
  }
  const jobMembers = state.monsters.filter(m => m.job === p.job).sort((a, b) => a.id - b.id);
  const station = layout().stations[p.job];
  const idx = jobMembers.findIndex(m => m.id === p.id);
  return { x: station.x + (jobMembers.length === 1 ? -11 : idx === 0 ? -43 : 33), y: station.y + 21 + (idx === 0 ? 5 : -5) };
}
function emit(x: number, y: number, color: string, n = 10, force = 100): void {
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2, sp = force * (.2 + Math.random() * .9);
    particles.push({ x, y, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp - 45,
      life: .5 + Math.random() * .5, max: 1, color, radius: 2 + Math.random() * 3 });
  }
}
function floatText(x: number, y: number, text: string, color = '#f8e3ab'): void { texts.push({ x, y, text, color, life: 1.25, max: 1.25 }); }
function choose(id: number): void {
  if (!state.monsters.some(m => m.id === id)) return;
  selected = id;
  const m = state.monsters.find(monster => monster.id === id)!;
  say(`${m.name} · ${PERSONALITY_INFO[m.personality].name}`, 1.4);
  ding(490, .07);
}
function assign(job: Job): void {
  const m = state.monsters.find(m => m.id === selected);
  if (!m) { say('先点一只怪物'); return; }
  if (m.job === job) { say(`${m.name}已经在${JOB_NAMES[job]}了`); return; }
  if (state.monsters.filter(other => other.job === job).length >= 2) { say('这个工位已经满了'); ding(170, .1); return; }
  if (m.cargo) { state.pitOre = Math.min(PIT_CAP, state.pitOre + m.cargo); m.cargo = 0; }
  if (state.escape?.id === m.id) { say('先把这只怪物带回囚室'); return; }
  m.job = job; m.progress = 0;
  const pt = layout().stations[job]; emit(pt.x, pt.y - 16, '#b7eac6', 12, 60);
  say(job === 'haul' ? `${m.name}会把矿石送往仓库` : `${m.name}去${JOB_NAMES[job]}了`); ding(610, .14); store();
}
function rest(): void {
  const m = state.monsters.find(m => m.id === selected);
  if (!m || !m.job) return;
  if (m.cargo) { state.pitOre = Math.min(PIT_CAP, state.pitOre + m.cargo); m.cargo = 0; }
  m.job = null; m.progress = 0;
  say(`${m.name}回囚室休息了`); ding(380, .11); store();
}
function capture(): void { showRoster(); }
function collect(): void {
  const total = JOBS.reduce((sum, job) => sum + state.pending[job], 0);
  if (!total) { say('仓库还没有产物'); return; }
  const pt = layout().chest;
  JOBS.forEach(job => { if (state.pending[job]) {
    state.goods[job] = Math.min(999999, state.goods[job] + state.pending[job]); state.pending[job] = 0;
  } });
  floatText(pt.x - 34, pt.y - 77, `+${total}`, '#ffeb9a');
  emit(pt.x, pt.y - 40, '#f5e3a6', 26, 135); shake = 4;
  say(`收获了 ${total} 份物资`); ding(825, .2); store();
}
function liftOre(): void {
  if (!state.pitOre) { say('矿点还没有矿石'); return; }
  const count = Math.min(2, state.pitOre);
  state.pitOre -= count;
  state.pending.mine = Math.min(999999, state.pending.mine + count);
  const p = layout().stations.mine;
  floatText(p.x + 91, p.y - 82, `+${count}`, '#d3f2ce');
  emit(p.x + 87, p.y - 49, '#ade6cd', 10, 80);
  say('手动送矿到仓库'); ding(530, .11); store();
}
function eventSpots(job: Job): Point[] {
  const p = layout().stations[job];
  const offset = job === 'grow' ? -25 : 43;
  return [-37, 0, 37].map((dx, i) => ({ x: p.x + offset + dx, y: p.y - 119 - (i === 1 ? 13 : 0) }));
}
function finishEvent(index: number): void {
  const e = state.event;
  if (!e || index < 0 || index > 2 || (e.cleared & (1 << index))) return;
  e.cleared |= 1 << index;
  const p = eventSpots(e.job)[index];
  emit(p.x, p.y, '#f9de85', 13, 96); ding(510 + index * 140, .09);
  if (e.cleared === 7) {
    if (e.job === 'mine') state.pitOre = Math.min(PIT_CAP, state.pitOre + 2);
    else state.pending[e.job] = Math.min(999999, state.pending[e.job] + 2);
    state.event = null;
    floatText(p.x, p.y - 15, '+2', '#fff1aa');
    emit(p.x, p.y - 18, '#e9db96', 24, 140);
    say('排除故障，额外收获 +2'); shake = 2;
  } else { say('继续清理发光障碍', .8); }
  store();
}
function currentCommission(): { title: string; needs: Goods } {
  return COMMISSIONS[state.commissionIndex % COMMISSIONS.length];
}
function canPay(cost: Goods): boolean { return JOBS.every(j => state.goods[j] >= cost[j]); }
function deliverCommission(): void {
  const mission = currentCommission();
  if (!canPay(mission.needs)) {
    const missing = JOBS.filter(j => state.goods[j] < mission.needs[j]);
    say('还缺 ' + missing.map(j => `${GOOD_NAMES[j]}${mission.needs[j] - state.goods[j]}`).join('、'));
    ding(250,.08); return;
  }
  for (const j of JOBS) state.goods[j] -= mission.needs[j];
  state.completedCommissions++;
  state.commissionIndex++;
  state.seals = Math.min(9999,state.seals+1);
  const p = layout().board;
  emit(p.x,p.y,'#f5d387',42,170);
  floatText(p.x,p.y-40,'★ +1','#fff2b5');
  say('委托完成 · 建造印记 +1');ding(870,.21);
  shake = 2.6; store();
}
function buildUpgrade(building: Building): void {
  const current = state.buildings[building];
  if (current >= 2) { say('已经升级到最高等级'); return; }
  const cost = BUILD_COSTS[building][current];
  if (shownCost !== building || costLife <= 0) {
    shownCost = building; costLife = 5;
    say(`${BUILD_NAMES[building]}：需要印记 1，${JOBS.filter(j=>cost[j]).map(j=>`${GOOD_NAMES[j]} ${cost[j]}`).join('、')}`,3.8);
    ding(510,.06); return;
  }
  if (state.seals < 1 || !canPay(cost)) {
    const missing = [...(state.seals<1?['印记 1']:[]),...JOBS.filter(j=>state.goods[j]<cost[j]).map(j=>`${GOOD_NAMES[j]} ${cost[j] - state.goods[j]}`)];
    say('还缺 '+missing.join('、'),2.8);ding(230,.09);return;
  }
  for (const j of JOBS) state.goods[j] -= cost[j];
  state.seals--; state.buildings[building]++;
  const pos = layout().build[building];
  emit(pos.x,pos.y-15,'#f4d38d',55,205);
  floatText(pos.x,pos.y-40,'升级成功！','#ffedac');
  say(`${BUILD_NAMES[building]}完成，囚坊焕然一新！`);shake=5;ding(980,.22);
  shownCost = null;costLife = 0;
  store();
}
function togglePause(): void { state.paused = !state.paused; say(state.paused ? '已暂停' : '继续运转'); store(); }

// Ambient monster encounters. None of the six monster types has a special profession.
function startSocial(): void {
  if (state.monsters.length < 2 || state.social || state.escape) return;
  const kind: SocialKind = (['chat', 'bicker', 'nap'] as const)[state.socialCount % 3];
  state.socialCount++;
  const candidates = state.monsters.filter(m => m.id !== state.escape?.id);
  const workingPair = candidates.flatMap(a => candidates.filter(b => b.id > a.id && b.job === a.job && !!a.job).map(b => [a,b] as const));
  const pair = workingPair[0] ?? [candidates[(state.socialCount - 1) % candidates.length], candidates[state.socialCount % candidates.length]];
  const worker = candidates.find(m => m.job) ?? pair[0];
  const a = kind === 'nap' ? worker : pair[0];
  const b = kind === 'nap' ? null : pair[1];
  state.social = { kind, a: a.id, b: b?.id ?? null, remaining: kind === 'chat' ? 6 : 10 };
  say(kind === 'chat' ? '怪物在窃窃私语 · 点气泡回应' : kind === 'bicker' ? '怪物争抢工具 · 点气泡调解' : '有怪物偷偷打盹 · 点气泡叫醒', 2.4);
  store();
}
function socialSpot(): Point | null {
  if (!state.social) return null;
  const v = visuals.get(state.social.a);
  return v ? { x: v.x + 18, y: v.y - 106 } : null;
}
function resolveSocial(): void {
  const e = state.social;
  if (!e) return;
  const p = socialSpot() ?? layout().board;
  // One satisfying click rather than a modal or repeated tapping.
  const job: Job = e.kind === 'nap' ? 'grow' : e.kind === 'bicker' ? 'haul' : 'mine';
  state.pending[job] = Math.min(999999, state.pending[job] + 1);
  emit(p.x, p.y, '#ffe4a0', 21, 100);
  floatText(p.x, p.y - 17, '+1', '#ffe9ad');
  say(e.kind === 'chat' ? '聊得开心，发现一块矿石 +1' : e.kind === 'bicker' ? '调解成功，找回木料 +1' : '叫醒成功，收获草药 +1');
  state.social = null; ding(820, .14); store();
}
function fireflyPos(): Point {
  const f = state.firefly;
  const l = layout();
  const t = clock * .40 + (f?.phase ?? 0);
  const spanX = portrait ? .25 : .29;
  const centerY = portrait ? .29 : .31;
  return {
    x: l.room.x + l.room.w * (.5 + Math.sin(t) * spanX),
    y: l.room.y + l.room.h * centerY + Math.sin(t * 1.65) * (portrait ? 24 : 34),
  };
}
function startFirefly(): void {
  if (state.firefly || state.escape || state.social) return;
  state.firefly = { remaining: 10, taps: 0, phase: clock * .53 + state.firefliesCaught * 2.37 };
  state.fireflyTimer = 48;
  const p = fireflyPos();
  emit(p.x, p.y, '#c5f7ec', 15, 80);
  say('流光萤火出现 · 追上它三次！', 2.6);
  ding(760, .16);
  store();
}
function catchFirefly(): void {
  const f = state.firefly;
  if (!f) return;
  const p = fireflyPos();
  f.taps++;
  emit(p.x, p.y, '#baf9e8', 13 + f.taps * 3, 95 + f.taps * 12);
  ding(660 + f.taps * 100, .08);
  if (f.taps < 3) {
    f.phase += .78;
    f.remaining = Math.min(12, f.remaining + .7);
    floatText(p.x, p.y - 22, `${f.taps}/3`, '#c7fff0');
    say(f.taps === 1 ? '追上了！它又飞走了' : '快抓到了！再追一次', 1.1);
    store();
    return;
  }
  state.firefly = null;
  state.firefliesCaught++;
  state.pending.mine = Math.min(999999, state.pending.mine + 1);
  state.pending.haul = Math.min(999999, state.pending.haul + 1);
  state.pending.grow = Math.min(999999, state.pending.grow + 1);
  state.bloom = Math.min(12, state.bloom + 1);
  floatText(p.x, p.y - 24, '+3', '#c7fff0');
  emit(p.x, p.y, '#d2fff1', 42, 165);
  shake = 1.8;
  if (state.firefliesCaught % 3 === 0) {
    say('萤火收集满三只！囚坊点亮了一盏新灯', 3.2);
    emit(layout().room.x + layout().room.w * .5, layout().room.y + 20, '#d6fff1', 35, 120);
  } else {
    say('捕获流光萤火 · 三种物资各 +1', 2.1);
  }
  store();
}
function startEscape(): void {
  if (state.monsters.length < 2 || state.escape) return;
  const candidate = state.monsters.find(m => !m.job) ?? state.monsters[state.socialCount % state.monsters.length];
  const source = visuals.get(candidate.id) ?? home(candidate.id);
  state.escape = { id: candidate.id, origin: { x: source.x, y: source.y }, elapsed: 0 };
  state.social = null;
  state.socialTimer = Math.max(state.socialTimer, 12);
  say(`${candidate.name}正在偷偷溜向出口！点击它或出口落闸`, 4);
  ding(270, .24, 'sawtooth'); store();
}
function endEscape(caught: boolean): void {
  const escape = state.escape;
  if (!escape) return;
  const monster = state.monsters.find(m => m.id === escape.id);
  if (monster) {
    if (monster.cargo) { state.pitOre = Math.min(PIT_CAP, state.pitOre + monster.cargo); monster.cargo = 0; }
    monster.progress = 0;
    if (!caught) monster.job = null; // Only a short lost work shift, never loss of prisoner.
  }
  const gate = layout().gate;
  emit(gate.x, gate.y - 42, caught ? '#f8d994' : '#a3c7c3', 30, 135);
  if (caught) {
    state.stoppedEscapes++;
    state.pending.haul = Math.min(999999, state.pending.haul + 2);
    floatText(gate.x, gate.y - 75, '+2', '#fff0b6');
    say('落闸成功！找回怪物和木料 +2');
    ding(940, .19);
  } else {
    say('怪物被巡逻守卫带回囚室休息，没有丢失');
    ding(310, .13);
  }
  // Return by walking back rather than teleporting immediately.
  state.escape = null;
  state.escapeTimer = 75;
  store();
}
function tickSceneEvents(dt: number): void {
  if (state.social) {
    state.social.remaining = Math.max(0, state.social.remaining - dt);
    if (state.social.remaining === 0) state.social = null; // Ignoring an event has no loss.
  }
  if (state.firefly) {
    state.firefly.remaining = Math.max(0, state.firefly.remaining - dt);
    if (state.firefly.remaining <= 0) {
      state.firefly = null; state.fireflyTimer = 20;
      say('萤火飞远了，等它下次回来', 1.4);
    }
  } else {
    state.fireflyTimer = Math.max(0, state.fireflyTimer - dt);
    if (state.fireflyTimer <= 0 && !state.social && !state.escape) startFirefly();
  }
  if (state.escape) {
    state.escape.elapsed = Math.min(ESCAPE_SECONDS, state.escape.elapsed + dt);
    if (state.escape.elapsed >= ESCAPE_SECONDS) endEscape(false);
  }
  state.socialTimer = Math.max(0, state.socialTimer - dt);
  state.escapeTimer = Math.max(0, state.escapeTimer - dt);
  if (!state.escape && !state.firefly && state.escapeTimer <= 0 && state.monsters.length >= 2) startEscape();
  else if (!state.social && !state.escape && !state.firefly && state.socialTimer <= 0 && state.monsters.length >= 2) {
    state.socialTimer = 23 + (state.socialCount % 3) * 4;
    startSocial();
  }
}

function tick(dt: number): void {
  if (state.paused || rosterOpen) return;
  clock += dt;
  tickSceneEvents(dt);
  for (const p of state.monsters) {
    const visual = visuals.get(p.id)!;
    const target = workPos(p);
    const dx = target.x - visual.x, dy = target.y - visual.y;
    const distance = Math.hypot(dx, dy);
    const step = Math.min(distance, dt * (portrait ? 350 : 450));
    if (distance > 2) { visual.x += dx / distance * step; visual.y += dy / distance * step; }
    else { visual.x = target.x; visual.y = target.y; }
    visual.walking = distance > 4;
    visual.speed = Math.min(1, visual.speed + (visual.walking ? dt * 3 : -dt * 5));
    if (state.escape?.id === p.id || !p.job || (visual.walking && p.job !== 'haul')) continue;
    // Taking a nap or quarreling briefly interrupts only the involved creatures.
    if (state.social && state.social.kind !== 'chat' && (state.social.a === p.id || state.social.b === p.id)) continue;
    // Loading at the pit reserves actual ore, so two haulers cannot ship it twice.
    if (p.job === 'haul' && p.progress >= 3.3 && p.progress < 5.8 && p.cargo === 0 && state.pitOre) {
      p.cargo = Math.min(PER_ROUND, state.pitOre);
      state.pitOre -= p.cargo;
      emit(visual.x, visual.y - 35, '#a7e6d0', 10, 70);
      store();
    }
    p.progress += dt;
    while (p.progress >= CYCLE_SECONDS) {
      p.progress -= CYCLE_SECONDS; p.cycles++; state.totalCycles++;
      const where = layout().stations[p.job];
      if (p.job === 'mine') {
        const gathered = Math.min(PER_ROUND, PIT_CAP - state.pitOre);
        state.pitOre += gathered;
        if (!gathered) floatText(where.x, where.y - 90, '堆满', '#edc995');
        else floatText(where.x, where.y - 91, `+${gathered}`, '#bfeccc');
        emit(where.x + 61, where.y - 43, '#a2e0bc', 12, 76);
      } else if (p.job === 'haul') {
        state.pending.haul = Math.min(999999, state.pending.haul + PER_ROUND);
        if (p.cargo) {
          state.pending.mine = Math.min(999999, state.pending.mine + p.cargo);
          state.bloom = Math.min(12, state.bloom + 1);
          state.shipments++;
          floatText(layout().chest.x - 14, layout().chest.y - 93, `+${p.cargo}`, '#c5f2d0');
          emit(layout().chest.x - 15, layout().chest.y - 48, '#b9e8c4', 18, 105);
          p.cargo = 0;
        }
        floatText(where.x, where.y - 90, `+${PER_ROUND}`, '#f9e29c');
      } else {
        const boost = state.bloom > 0 ? 2 : 0;
        if (boost) { state.bloom--; state.flowers++; }
        state.pending.grow = Math.min(999999, state.pending.grow + PER_ROUND + boost);
        emit(where.x, where.y - 70, boost ? '#f6d893' : '#b4dc96', boost ? 27 : 10, boost ? 130 : 70);
        floatText(where.x, where.y - 96, boost ? '+6 ✦' : '+4', boost ? '#ffe69f' : '#aee8a8');
      }
      if (!state.event && state.totalCycles % 2 === 0) {
        state.event = { job: p.job, cleared: 0 };
        say(`${EVENT_NAMES[p.job]}！点三个发光障碍`);
        ding(720, .21);
      }
      store();
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += dt * 115;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const p = texts[i]; p.life -= dt; p.y -= dt * 35;
    if (p.life <= 0) texts.splice(i, 1);
  }
  toastLife = Math.max(0, toastLife - dt);
  costLife = Math.max(0, costLife - dt);
  shake = Math.max(0, shake - dt * 17);
  saveClock += dt;
  if (saveClock >= 2) { saveClock = 0; store(); }
}

function rounded(x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath(); c.moveTo(x + rr, y); c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr); c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr); c.closePath();
}
function box(x: number, y: number, w: number, h: number, color: string, r = 0, stroke?: string): void {
  rounded(x, y, w, h, r); c.fillStyle = color; c.fill();
  if (stroke) { c.lineWidth = 2; c.strokeStyle = stroke; c.stroke(); }
}
function disc(x: number, y: number, rx: number, ry: number, color: string): void {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = color; c.fill();
}
function line(x1: number, y1: number, x2: number, y2: number, color: string, width = 2): void {
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function write(str: string, x: number, y: number, size = 16, color = COLORS.cream,
  align: CanvasTextAlign = 'left', weight: string = '600'): void {
  c.save(); c.textAlign = align; c.textBaseline = 'middle';
  c.font = `${weight} ${size}px 'Microsoft YaHei','PingFang SC',system-ui,sans-serif`;
  c.fillStyle = color; c.fillText(str, x, y); c.restore();
}
function glow(x: number, y: number, r: number, center: string, outer = 'transparent'): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, center); g.addColorStop(1, outer);
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}
function poly(points: Point[], fill: string, stroke?: string, width = 2): void {
  if (!points.length) return;
  c.beginPath(); c.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
  c.closePath(); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function woodCrate(x: number, y: number, scaleFactor = 1, glowIt = false): void {
  c.save(); c.translate(x, y); c.scale(scaleFactor, scaleFactor);
  if (glowIt) glow(0, -8, 45, '#e6cb8266');
  box(-23, -34, 46, 36, '#8b5d3a', 4, '#503d32');
  box(-18, -30, 37, 26, '#a77a4e', 2);
  line(-20, -29, 19, -5, '#634b32', 4); line(20, -29, -18, -5, '#634b32', 4);
  line(-20, -35, 18, -35, '#e5b776', 3);
  c.restore();
}
function stone(x: number, y: number, w = 31): void {
  poly([{ x: x-w*.65, y:y },{ x:x-w, y:y-w*.45 },{x:x-w*.45,y:y-w},{x:x+w*.28,y:y-w*.87},
    {x:x+w,y:y-w*.28},{x:x+w*.78,y:y}], '#68766f', '#2b4542', 3);
  poly([{x:x-w*.65,y:y-w*.48},{x:x-w*.4,y:y-w*.84},{x:x+w*.19,y:y-w*.72},{x:x+.15*w,y:y-w*.4}], '#99a6a0');
}
function crystal(x: number, y: number, h: number, color = '#80d1b8'): void {
  glow(x, y - h*.5, h*.85, '#70d7b929');
  poly([{x:x-13,y},{x:x-15,y:y-h*.5},{x,y:y-h},{x:x+13,y:y-h*.47},{x:x+9,y}], color, '#37676b', 3);
  poly([{x:x-13,y:y-h*.47},{x,y:y-h},{x:x+1,y}], '#c7f5d2');
}

// All embellishments are render-only and deterministic: they never create hit targets,
// advance a timer, consume materials, or change the v6 game save.
function cavernCrag(x: number, y: number, size: number, color: string): void {
  poly([{x:x-size, y:y+size*.35},{x:x-size*.86,y:y-size*.18},{x:x-size*.3,y:y-size*.77},
    {x:x+size*.24,y:y-size},{x:x+size*.88,y:y-size*.41},{x:x+size,y:y+size*.37}],color);
  line(x-size*.32,y-size*.74,x-size*.13,y-size*.39,'#a5b6a61d',2);
}
function fungus(x: number, y: number, size: number, color: string, phase = 0): void {
  c.save();c.translate(x,y);c.rotate(Math.sin(clock*1.1+phase)*.045);
  line(0,0,0,-size*.65,'#718c69',Math.max(2,size*.19));
  disc(0,-size*.65,size*.7,size*.24,color);
  disc(-size*.22,-size*.75,size*.12,size*.08,'#fff4ccae');
  disc(size*.27,-size*.73,size*.1,size*.06,'#fff4cc92');
  glow(0,-size*.65,size*1.5,color+'29');c.restore();
}
function tendril(x: number, y: number, length: number, seed: number): void {
  c.save();c.strokeStyle='#4b775b';c.lineWidth=3;c.lineCap='round';c.beginPath();
  c.moveTo(x,y);c.bezierCurveTo(x+9,y+length*.32,x-12,y+length*.6,x+Math.sin(clock*.65+seed)*7,y+length);c.stroke();
  for(let k=0;k<3;k++){
    const yy=y+length*(.25+k*.21);
    c.save();c.translate(x+(k%2?5:-6),yy);c.rotate((k%2?-.6:.6)+Math.sin(clock*.7+seed+k)*.11);
    disc(0,0,9,4,'#5e9365');c.restore();
  }
  c.restore();
}
function flickerLantern(x: number, y: number, power = 1): void {
  const pulsed=(.80+Math.sin(clock*3.2+x*.08)*.09+Math.sin(clock*6.5+x)*.05)*power;
  glow(x,y,85*pulsed,'#f8c06e52');
  line(x,y-37,x,y-14,'#1a2b2b',3);
  poly([{x:x-13,y:y-17},{x:x+13,y:y-17},{x:x+9,y:y+18},{x:x-9,y:y+18}], '#302f2b','#d6b17a',2.5);
  box(x-7,y-11,14,22,'#f8d393',4);
  glow(x,y,18,'#fff0b78c');
  line(x-17,y-18,x+17,y-18,'#c7a57a',3);
  disc(x,y+20,3,3,'#d9b981');
}
function drawOutsideCavern(): void {
  // Distant layered galleries stop the level from reading as an empty rectangle.
  for(let depth=0;depth<3;depth++){
    const ground=H*(.40+depth*.13),fill=['#13282d','#183037','#1f3433'][depth];
    c.beginPath();c.moveTo(0,ground);
    for(let i=0;i<=14;i++){
      const xx=W*i/14;
      c.lineTo(xx,ground-42-Math.sin(i*1.49+depth)*26-Math.sin(i*.63+depth*3)*24);
    }
    c.lineTo(W,H);c.lineTo(0,H);c.closePath();c.fillStyle=fill;c.fill();
  }
  for(let i=0;i<19;i++){
    const x=(i+.35)/19*W, h=22+(i*37%91);
    poly([{x:x-13,y:0},{x:x+14,y:0},{x:x+3,y:h}],i%3===0?'#263736':'#1f3134');
  }
  for(let i=0;i<9;i++){
    const x=(i*147+75)%W, yy=H*.76+(i%3)*31;
    cavernCrag(x,yy,22+(i%3)*18,'#253c37');
    if(i%2===0) crystal(x+8,yy+8,22,'#568e88');
  }
}
function drawWallRelief(l: FrameLayout, wallBottom: number): void {
  const {x,y,w}=l.room;
  // Etched insets, cave fissures and hanging chains live *behind* the cells.
  for(let i=0;i<13;i++){
    const fx=x+35+((i*193+37)%(Math.max(80,w-75))), fy=y+37+(i*31%Math.max(32,wallBottom-y-53));
    line(fx,fy,fx+(i%2?15:-8),fy+13,'#192b294d',1.6);
    line(fx+(i%2?15:-8),fy+13,fx+(i%3?19:-6),fy+24,'#15252436',1);
  }
  // A carved frieze with an embedded rune at its centre.
  const reliefY=y+35;
  line(x+31,reliefY,x+w-31,reliefY,'#b5ae8150',3);
  for(let i=0;i<9;i++){
    const rx=x+(i+.5)*w/9;
    disc(rx,reliefY,3.5,3.5,'#d8b97c8d');
  }
  if(!portrait){
    glow(l.board.x,y+70,72,'#f4d78723');
    c.save();c.translate(l.board.x,y+75);c.rotate(Math.PI/4);
    c.strokeStyle='#b9b48869';c.lineWidth=3;c.strokeRect(-13,-13,26,26);c.restore();
  }
  for(const side of [x+20,x+w-19]){
    for(let k=0;k<4;k++){
      const y0=y+55+k*36;
      disc(side,y0,3,3,'#b6bd9e');
      line(side,y0,side+(side<x+w/2?5:-5),y0+17,'#273f3c',3);
    }
  }
}
function drawFloorLife(l: FrameLayout, wallBottom: number): void {
  const {x,y,w,h}=l.room;
  c.save();c.beginPath();c.rect(x+20,wallBottom+20,w-40,Math.max(5,y+h-wallBottom-47));c.clip();
  // Paving plates, moss and pebbles; skip actionable work locations.
  for(let i=0;i<72;i++){
    const fx=x+34+(i*191.37%(w-68)),fy=wallBottom+29+(i*75.13%Math.max(24,y+h-wallBottom-78));
    const near=JOBS.some(job=>Math.hypot(fx-l.stations[job].x,fy-l.stations[job].y)<105)
      ||Math.hypot(fx-l.chest.x,fy-l.chest.y)<105;
    if(near)continue;
    disc(fx,fy,1.6+(i%4),1+(i%3)*.5,i%3===0?'#a7aa7955':'#202e2880');
    if(i%5===0){
      line(fx-6,fy,fx,fy-6,'#4b7a5b99',1.4);
      line(fx,fy-6,fx+7,fy-3,'#6b94758c',1.2);
    }
  }
  // Interior floor seams form a real connected workshop rather than isolated plinths.
  for(let i=0;i<5;i++){
    const py=wallBottom+43+(i+1)*(y+h-wallBottom-94)/6;
    line(x+38,py,x+w-38,py,'#bdba9160',1);
  }
  c.restore();
  // Floor rugs/scuff patches show how workers move between stations.
  for(const job of JOBS){
    const p=l.stations[job], hue=job==='mine'?'#6ca39c23':job==='haul'?'#bd926c22':'#82af772c';
    disc(p.x,p.y+35,portrait?113:147,48,hue);
  }
}
function drawWorkshopScenery(job: Job): void {
  c.save();
  if(job==='mine'){
    // Quartz seam, pulley hook, wayfinding torch and a tucked-away drilling kit.
    poly([{x:-117,y:6},{x:-102,y:-87},{x:-57,y:-109},{x:-18,y:-52},{x:-40,y:8}], '#334c48','#60796b',4);
    crystal(-78,-44,51,'#62aeb3');crystal(-41,-22,31,'#93d5ca');
    for(let i=0;i<5;i++){
      const px=-105+i*27,py=-94-(i%2)*12;
      line(px,py,px+9,py+6,'#b5c2a975',2);
    }
    line(0,-121,0,-78,'#6f7b70',3);
    disc(0,-81,9,9,'#b9aa84');
    c.beginPath();c.arc(0,-64,12,.1,Math.PI+.15);c.strokeStyle='#ceb68b';c.lineWidth=4;c.stroke();
    box(-123,-14,17,38,'#967347',3,'#4a4335');
    glow(-115,-43,34,'#edba754f');
    disc(-115,-39,7+Math.sin(clock*8)*1,10,'#f5c274');
    if(state.buildings.rail>=1){
      line(-110,-114,125,-114,'#bfae81',5);
      for(let k=0;k<3;k++)flickerLantern(-92+k*94,-93,.46);
    }
    if(state.buildings.rail>=2){
      box(113,-76,30,65,'#465c53',4,'#c0b68e');
      disc(129,-77,12,12,'#c8b18b');disc(129,-77,5,5,'#424d48');
      line(129,-77,111,-35,'#d0b687',3);
      crystal(-15,-63,27,'#f0d693');
    }
  }else if(job==='haul'){
    // Crane canopies, stacked parcels and a slowly swaying rope.
    line(-111,-114,109,-114,'#7b806d',8);
    line(-105,-115,-105,-16,'#7e7f62',6);
    line(108,-115,108,-18,'#7e7f62',6);
    for(const x of [-103,105])disc(x,-110,7,7,'#c6b17d');
    const swing=Math.sin(clock*.9)*8;
    line(34,-113,34+swing,-62,'#bdab80',3);
    c.beginPath();c.arc(34+swing,-54,10,0,Math.PI+.2);c.lineWidth=4;c.strokeStyle='#d5c291';c.stroke();
    woodCrate(-93,-17,.53);woodCrate(-62,-15,.42);
    box(-121,-118,52,21,'#665643',4,'#c4aa73');
    write('仓运',-95,-107,11,'#f6e0ac','center');
    if(state.buildings.warehouse>=1){
      poly([{x:-127,y:-124},{x:0,y:-157},{x:127,y:-124}], '#72604b','#d3b580',4);
      for(let i=0;i<3;i++)woodCrate(-90+i*87,-48,.48);
    }
    if(state.buildings.warehouse>=2){
      line(-98,-158,98,-158,'#d7c48e',6);
      for(let i=0;i<3;i++)flickerLantern(-68+i*68,-141,.48);
    }
  }else{
    // An irrigation rill that bubbles even with no assigned worker.
    box(-129,22,258,22,'#456960',7,'#9fb392');
    box(-120,26,240,13,'#5ba4a1',6);
    for(let i=0;i<5;i++){
      const waterX=-96+i*49+Math.sin(clock*.75+i)*7;
      disc(waterX,32,9,2,'#d5f4d588');
    }
    fungus(-122,4,17,'#d2ae83',4);fungus(126,2,20,'#9bd5bc',8);
    for(let i=0;i<2;i++){
      tendril(-120+i*241,-107,75,3+i);
    }
    if(state.buildings.garden>=1){
      for(let i=0;i<4;i++)flickerLantern(-110+i*73,-106,.32);
      line(-104,-98,102,-98,'#b7c48c',3);
    }
    if(state.buildings.garden>=2){
      for(let i=0;i<5;i++){
        const x=-85+i*40;
        line(x,-106,x,-153-Math.sin(i)*10,'#8ebaa3',3);
        disc(x,-158-Math.sin(i)*10,3,3,'#dfd3a1');
      }
      poly([{x:-126,y:-143},{x:0,y:-182},{x:128,y:-143}], '#50756855','#b4d2b6',5);
      glow(0,-153,75,'#bfe1aa41');
    }
  }
  c.restore();
}
function drawCellLiving(p: Point, index: number): void {
  // Soft bed, dish, personal trinkets and different indoor foliage for each den.
  disc(p.x-18,p.y+50,41,11,'#7c72537a');
  box(p.x-54,p.y+45,75,9,'#826b4c',5,'#b1a178');
  for(let i=0;i<5;i++)line(p.x-49+i*13,p.y+48,p.x-44+i*13,p.y+45,'#b49b6f',1);
  disc(p.x+51,p.y+51,14,5,'#9ba9a0');
  disc(p.x+51,p.y+48,11,3,'#6babb3');
  disc(p.x+50,p.y+47,5,2,'#cee7da');
  if(index%3===0){
    tendril(p.x-52,p.y-60,42,index);
    glow(p.x-41,p.y-38,26,'#8abc8a23');
  }else if(index%3===1){
    crystal(p.x-51,p.y+43,18,'#83bfae');
    box(p.x+43,p.y+21,17,23,'#695544',3,'#ad916e');
  }else{
    fungus(p.x-47,p.y+45,14,'#ab88c3',index);
    disc(p.x+47,p.y+32,9,3,'#bdad7b');
  }
  // Chains read as environment but are deliberately only at cell edges.
  const hookX=p.x+(index%2?48:-48);
  for(let k=0;k<3;k++){
    c.beginPath();c.ellipse(hookX,p.y-51+k*10,4,7,0,0,Math.PI*2);
    c.lineWidth=2;c.strokeStyle='#99a99887';c.stroke();
  }
}
function drawForegroundFrame(l: FrameLayout): void {
  const {x,y,w,h}=l.room;
  // Non-clickable scenery sits on the edge and never covers creatures or workspaces.
  c.save();
  for(const side of [-1,1]){
    const sx=side===-1?x+17:x+w-17;
    poly([{x:sx-side*16,y:y+h-9},{x:sx+side*33,y:y+h-9},
      {x:sx+side*22,y:y+h-68},{x:sx-side*5,y:y+h-91}], '#283f3b','#718475',3);
    crystal(sx+side*6,y+h-38,32,side===-1?'#518b80':'#679e8b');
    fungus(sx-side*10,y+h-13,14,side===-1?'#e6ae8d':'#b2d6b0',side);
  }
  if(!portrait){
    for(let i=0;i<3;i++){
      const xx=x+100+i*(w-200)/2;
      tendril(xx,y+11,38,i*3);
    }
  }
  // Wall-edge glow restores the carved-stone silhouette at all screen sizes.
  line(x+18,y+26,x+18,y+h-23,'#aec29a29',2);
  line(x+w-18,y+26,x+w-18,y+h-23,'#aec29a29',2);
  c.restore();
}

function drawBackdrop(l: FrameLayout): void {
  const sky = c.createLinearGradient(0, 0, W, H);
  sky.addColorStop(0, '#111e25'); sky.addColorStop(.48, '#1b3334'); sky.addColorStop(1, '#0c171a');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  glow(W*.49, H*.28, W*.48, '#b8a06f1d');
  drawOutsideCavern();
  for (const dust of sparks) {
    const px = dust.x * W + Math.sin(clock*.24 + dust.seed*18)*16;
    const py = (dust.y*H + clock*(7 + dust.seed*13)) % H;
    disc(px, py, 1 + dust.seed*1.7, 1+ dust.seed*.7, `rgba(243,219,149,${.1 + .25*(.5 + Math.sin(clock+dust.seed*15)*.5)})`);
  }
  const { x, y, w, h } = l.room;
  box(x, y, w, h, '#14282c', 27, '#50665b');
  box(x + 10, y + 10, w - 20, h - 20, '#20332f', 23, '#263e3d');
  const wallBottom = portrait ? l.cells[5].y + 105 : y + h * .53;
  const bricks = c.createLinearGradient(0, y, 0, wallBottom);
  bricks.addColorStop(0, '#3c4945'); bricks.addColorStop(.75, '#343f3c'); bricks.addColorStop(1, '#253935');
  box(x + 17, y + 19, w-34, wallBottom-y-5, bricks as unknown as string, 13);
  c.save();c.beginPath();c.rect(x+18,y+20,w-36,wallBottom-y-5);c.clip();
  for(let yy=y+26, row=0; yy<wallBottom; yy+=34,row++) {
    line(x+17,yy,w+x-17,yy,'#111e1d2c',3);
    for(let xx=x+22+(row%2)*49;xx<x+w;xx+=98) line(xx,yy,xx,yy+33,'#10232135',2);
  }
  drawWallRelief(l, wallBottom);
  c.restore();
  box(x + 12, wallBottom - 3, w - 24, 23, '#1d302b', 5, '#5a6559');
  line(x+22,wallBottom+2,x+w-22,wallBottom+2,'#88907a',3);
  // The floor is a single perspective stage; no panels or detached cards.
  const floor = c.createLinearGradient(0, wallBottom, 0, y+h);
  floor.addColorStop(0, '#41544b'); floor.addColorStop(.55, '#354740'); floor.addColorStop(1, '#263b34');
  box(x+17,wallBottom+21,w-34,y+h-wallBottom-40,floor as unknown as string, 4);
  c.save(); c.beginPath(); c.rect(x+19,wallBottom+22,w-38,y+h-wallBottom-43); c.clip();
  for (let yy=wallBottom+30; yy<y+h;yy+=53) line(x+18,yy,x+w-18,yy,'#a3ae857a',.7);
  for (let xx=x-120; xx<x+w+130;xx+=98) line(xx,wallBottom+21,xx+128,y+h,'#172d2e52',1.5);
  // a few warm pools of light to focus attention on stations
  for (const job of JOBS) {
    const p=l.stations[job];glow(p.x,p.y+5,150,job==='mine'?'#6fd2b326':job==='haul'?'#e3b9721d':'#9cd18123');
  }
  drawFloorLife(l,wallBottom);
  c.restore();
  // frame and corners
  box(x+1,y+1,w-2,12,'#566658',8); box(x+1,y+h-13,w-2,12,'#162b2c',8);
  for(const side of [x+23,x+w-23]) for(const yy of [y+23,y+h-24]) {
    disc(side,yy,4,4,'#ad9970');disc(side-1,yy-1,1.5,1.5,'#efe0b3');
  }
  // Hanging lanterns: unobtrusive ambient animation
  for(const xPos of [x+36,x+w-36]) {
    line(xPos,y+11,xPos,y+59,'#141e21',5);
    glow(xPos,y+65,72,'#f0c27c37');
    box(xPos-11,y+51,22,33,'#544e3f',6,'#cba874');
    box(xPos-6,y+58,12,19,'#f4c984',4);
    glow(xPos,y+65,25+Math.sin(clock*4+xPos)*3,'#f8d3924b');
  }
}
function archShape(x: number, y: number, width: number, height: number): void {
  c.beginPath(); c.moveTo(x-width/2,y+height/2);
  c.lineTo(x-width/2,y-height*.12);
  c.bezierCurveTo(x-width/2,y-height*.74,x+width/2,y-height*.74,x+width/2,y-height*.12);
  c.lineTo(x+width/2,y+height/2);c.closePath();
}
function drawGate(l: FrameLayout): void {
  const p = l.gate, e = state.escape, alert = !!e;
  const pulse = .6 + .4 * Math.sin(clock * 8);
  c.save(); c.translate(p.x,p.y);
  glow(0,-51,alert?126:72,alert ? '#f27e5173' : '#d9bc6230');
  disc(0,9,57,15,'#0a2222aa');
  // Arch and a visibly moving portcullis. This is a piece of the scene, not a menu.
  archShape(0,-48,99,128);
  c.fillStyle='#1c292b'; c.fill(); c.lineWidth=9; c.strokeStyle='#849080';c.stroke();
  archShape(0,-47,78,113);c.fillStyle='#142326';c.fill();
  for(let i=-2;i<=2;i++){
    const x=i*17;
    line(x,-98+(alert?Math.sin(clock*9)*2:0),x,7-(alert?17:0),'#a9b2a1',6);
    disc(x,-8-(alert?17:0),3.5,3.5,'#c1c8a8');
  }
  line(-42,-48-(alert?17:0),42,-48-(alert?17:0),'#adb9a0',6);
  box(-28,-9,56,23,alert?'#8a4940':'#655841',5,alert?'#f4c07e':'#b3a379');
  write(alert?'落闸':'出口',0,2,alert?17:14,alert?'#fff0bd':'#d6cfb0','center','900');
  if(alert){
    c.lineWidth=5;c.strokeStyle='#ffd890';c.beginPath();
    c.arc(0,-47,67,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-e!.elapsed/ESCAPE_SECONDS));c.stroke();
    c.globalAlpha=pulse;write('!',0,-125,36,'#ffcb75','center','900');c.globalAlpha=1;
  }
  c.restore();
  if(e){
    const start=e.origin, end=l.gate;
    c.save();c.setLineDash([3,15]);c.lineWidth=5;c.strokeStyle='#f4b86c7a';
    c.beginPath();c.moveTo(start.x,start.y+6);c.lineTo(end.x,end.y+6);c.stroke();c.setLineDash([]);c.restore();
  }
}
function drawCellsBack(l: FrameLayout): void {
  const cellW=portrait?142:Math.min(146,(l.room.w-65)/6-.5);
  for(let i=0;i<6;i++){
    const p=l.cells[i], isOccupied=state.monsters.some(m=>m.id===i+1);
    glow(p.x,p.y-38,75,isOccupied?'#ddac6340':'#1a282c12');
    archShape(p.x,p.y,cellW+17,152);
    c.fillStyle='#59635d';c.fill();c.strokeStyle='#1d322e';c.lineWidth=4;c.stroke();
    archShape(p.x,p.y+4,cellW-2,142);
    const grad=c.createLinearGradient(0,p.y-85,0,p.y+62);grad.addColorStop(0,'#0e2125');grad.addColorStop(1,'#1d3535');
    c.fillStyle=grad;c.fill();c.strokeStyle='#87917b';c.lineWidth=2;c.stroke();
    disc(p.x,p.y+58,cellW*.48,12,'#142824');
    drawCellLiving(p,i);
    // Plaque and hanging lamp; prisoners themselves are drawn in the next pass.
    box(p.x-19,p.y-95,38,17,'#b49964',5,'#3e473e');
    write(String(i+1).padStart(2,'0'),p.x,p.y-86,10,'#302f25','center','800');
    disc(p.x,p.y-64,4,4,'#ffe4a6');glow(p.x,p.y-62,37,'#f0bd6a2c');
  }
}
function drawCellsFront(l: FrameLayout): void {
  const cellW=portrait?142:Math.min(146,(l.room.w-65)/6-.5);
  for(let i=0;i<6;i++){
    const p=l.cells[i];
    for(let k=-2;k<=2;k++) {
      const xx=p.x+k*(cellW/6);
      line(xx,p.y-57,xx,p.y+60,'#1c2d2b',8);
      line(xx-1.5,p.y-56,xx-1.5,p.y+59,'#82907e9e',2);
    }
    box(p.x-cellW*.49,p.y+55,cellW*.98,11,'#273a33',2,'#9e9d78');
    // The prison gate is slightly open if that prisoner is working.
    const worker=state.monsters.find(m=>m.id===i+1);
    if(worker?.job) {
      box(p.x-26,p.y+57,52,8,'#415648',3);
      write('空',p.x,p.y+41,12,'#9bae98','center');
    }
  }
}
function drawRailNetwork(l: FrameLayout): void {
  // Shared physical route. Cargo travels along it instead of appearing by magic.
  const from={x:l.stations.mine.x+70,y:l.stations.mine.y+43};
  const to={x:l.chest.x-35,y:l.chest.y+31};
  const mid={x:(from.x+to.x)*.5,y:(from.y+to.y)*.5};
  c.save();
  c.setLineDash([7,14]);c.lineDashOffset=-clock*12;
  line(from.x,from.y,mid.x,mid.y,'#9ca47b8c',6);
  line(mid.x,mid.y,to.x,to.y,'#9ca47b8c',6);
  c.setLineDash([]);
  // Wooden sleepers and pair of thin rails.
  const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
  for(let k=0;k<Math.floor(len/37);k++){
    const t=(k+.3)*37/len,x=from.x+dx*t,y=from.y+dy*t;
    line(x-nx*13,y-ny*13,x+nx*13,y+ny*13,'#685b45',7);
  }
  for(const off of [-7,7])line(from.x+nx*off,from.y+ny*off,to.x+nx*off,to.y+ny*off,state.buildings.rail?'#d5dbb6':'#91a8a2a0',state.buildings.rail?4:2);
  if (state.buildings.rail) {
    for (let k=0; k < (state.buildings.rail===2?8:4);k++) {
      const t=(k+.5)/(state.buildings.rail===2?8:4),x=from.x+dx*t,y=from.y+dy*t;
      disc(x,y,5,5,'#e8c878');disc(x,y,2,2,'#fff6c7');
    }
    // Visible mineral trolley attached to the upgraded rails.
    const t=(.35+(.5+.5*Math.sin(clock*.4))*.3);
    const cart={x:from.x+dx*t,y:from.y+dy*t};
    disc(cart.x-17,cart.y+11,7,7,'#101f21');disc(cart.x+18,cart.y+11,7,7,'#101f21');
    box(cart.x-30,cart.y-21,60,27,state.buildings.rail===2?'#bd8c56':'#7f735a',4,'#ead399');
    crystal(cart.x,cart.y-20,23,'#8cdec5');
  }
  c.restore();
}
function drawMinePile(p: Point): void {
  const x=p.x+101,y=p.y-41;
  const n=Math.min(9,Math.ceil(state.pitOre/4));
  disc(x,y+37,55,15,'#132e2eae');
  box(x-48,y+12,96,24,'#70593e',6,'#b29b6e');
  for(let i=0;i<n;i++){
    const row=Math.floor(i/4), col=i%4;
    crystal(x-35+col*22+(row%2)*8,y+15-row*13,23+((i*7)%14),'#9bdcbe');
  }
  if(state.pitOre){
    glow(x,y-10,62,'#9edfb03d');
    box(x-24,y-56,48,23,'#254139e8',10,'#acd9a7');
    write(String(state.pitOre),x,y-44,15,'#fff0c3','center','800');
    // A tiny hand identifies the optional manual pickup action.
    write('✋',x+35,y-43,18,'#fff0c3','center');
  } else write('0',x,y-9,13,'#80958d','center');
}
function drawStationBack(job: Job, p: Point): void {
  const width=portrait?147:192;
  c.save();c.translate(p.x,p.y);
  // floating plinth shadow
  disc(0,28,width*.65,37,'#071b1c75');
  disc(0,21,width*.64,28,'#66715b');
  drawWorkshopScenery(job);
  disc(0,14,width*.60,25,'#415b4e');
  c.beginPath();c.ellipse(0,16,width*.61,25,0,Math.PI,Math.PI*2);c.strokeStyle='#8d9475';c.lineWidth=4;c.stroke();
  if(job==='mine'){
    stone(59,10,41);stone(99,19,27);crystal(46,-2,47,'#87d8b7');crystal(83,-8,37,'#78bdd6');
    box(-95,-27,41,42,'#594f41',9,'#9d977b');
    disc(-77,-29,14,6,'#a48d5e');
    c.save();c.translate(-100,-5);c.rotate(-.13);line(0,0,27,-26,'#bf9470',5);line(19,-29,36,-32,'#8bafa2',6);c.restore();
  }else if(job==='haul'){
    box(-100,-8,190,33,'#414d46',6,'#7d8a76');
    for(let xx=-87;xx<85;xx+=31){disc(xx,22,10,10,'#151e20');disc(xx,22,4,4,'#a7b99a');}
    const movement=(clock*22)%104;
    woodCrate(25+Math.sin(movement/104*Math.PI*2)*27,-3,.74);
    woodCrate(78,-15,.85);
    line(-92,-44,82,-44,'#858c77',5);line(75,-44,75,-14,'#a1a483',4);
  }else{
    if(state.buildings.garden) {
      const tier=state.buildings.garden;
      for(const side of [-1,1]){
        line(side*103,3,side*(tier===2?125:113),-115,'#9ac598',7);
        crystal(side*(tier===2?124:113),-116,27,tier===2?'#ebda91':'#7cd1b8');
      }
      line(-108,-105,108,-105,tier===2?'#e6d69b':'#9bc49c',6);
      if(tier===2) {glow(0,-120,99,'#e7d38f48');crystal(0,-113,41,'#ecdb9a');}
    }
    if(state.bloom>0){
      glow(0,-43,92,'#eddb9259');
      write('✦',88,-62,22,'#f8e6a6','center');
    }
    box(-110,-12,220,43,'#735139',11,'#3a4337');
    box(-102,-23,203,23,'#3c5f46',9,'#bf9970');
    for(let i=0;i<3;i++){
      const xx=-72+i*69;
      poly([{x:xx-17,y:-23},{x:xx-3,y:-35-(Math.sin(clock*2+i)*3)},{x:xx+8,y:-22}], '#83c987','#355f49',2);
      poly([{x:xx+2,y:-23},{x:xx+18,y:-43},{x:xx+13,y:-24}], '#a8db7a','#355f49',2);
      line(xx,-15,xx,-39,'#729e66',3);
      if(state.flowers > i){
        const phase=Math.sin(clock*1.7+i)*3;
        crystal(xx,-37+phase,24+(state.flowers%3)*2,'#ddc98c');
        glow(xx,-55,42,'#e5d49033');
      }
    }
    line(-108,-13,106,-13,'#bc8861',6);
  }
  c.restore();
}
function drawStationFront(job: Job, p: Point): void {
  c.save();c.translate(p.x,p.y);
  // small wooden sign fixed in-world, not an HTML card
  box(-49,41,98,27,'#3b4136',8,'#9b926e');
  box(-44,43,88,21,'#273a33',6);
  write(JOB_NAMES[job],0,53,15,'#f7e5b3','center','750');
  const workers=state.monsters.filter(m=>m.job===job);
  if(workers.length){
    c.lineWidth=4;c.strokeStyle='#a3d5aa';c.beginPath();
    const progress=workers.reduce((sum,m)=>sum+m.progress,0)/(CYCLE_SECONDS*workers.length);
    c.ellipse(0,14,portrait?89:116,35,0,-Math.PI*.9,-Math.PI*.9+Math.PI*1.8*progress);c.stroke();
  }
  // thin pointer marker when a monster is chosen
  if(selected && hovered===`station-${job}`){
    c.strokeStyle='#f8d785';c.lineWidth=3;c.setLineDash([8,6]);
    c.beginPath();c.ellipse(0,20,portrait?96:123,50,0,0,Math.PI*2);c.stroke();c.setLineDash([]);
  }
  c.restore();
}

function creature(m: Monster, v: Visual): void {
  const escaping = state.escape?.id === m.id;
  const sceneMood = state.social && (state.social.a === m.id || state.social.b === m.id) ? state.social.kind : null;
  const isWorking = !!m.job && !escaping && sceneMood !== 'nap' && sceneMood !== 'bicker'
    && (!v.walking || m.job === 'haul');
  const isSelected = selected === m.id;
  const idlePulse = Math.sin(clock * .9 + m.id * 1.71);
  const idleHop = !m.job && m.personality === 'energetic' && idlePulse > .72 ? -8 * ((idlePulse - .72) / .28) : 0;
  const bob=(sceneMood==='nap' ? .6*Math.sin(clock*1.5+m.id)
    : sceneMood==='bicker' ? Math.abs(Math.sin(clock*10+m.id))*5
    : v.walking?Math.abs(Math.sin(clock*11+m.id))*7 : isWorking ? Math.abs(Math.sin(clock*(m.job==='mine'?8:4)+m.id))*4 : Math.sin(clock*2.1+m.id)*2.4) + idleHop;
  const wiggle=escaping ? Math.sin(clock*14+m.id)*.17
    : sceneMood==='bicker' ? Math.sin(clock*14+m.id)*.16
    : sceneMood==='nap' ? -.17
    : v.walking?Math.sin(clock*11+m.id)*.1:isWorking?Math.sin(clock*5+m.id)*.045:Math.sin(clock*1.8+m.id)*.022 + (m.personality==='mischief'?Math.sin(clock*3+m.id)*.04:0);
  disc(v.x,v.y+3,39,12,'#071d1db5');
  if(escaping){
    glow(v.x,v.y-34,70,'#ff8e534e');
    c.save();c.lineWidth=3;c.strokeStyle='#f6b579';c.setLineDash([6,5]);
    c.beginPath();c.ellipse(v.x,v.y+2,46,17,0,0,Math.PI*2);c.stroke();c.restore();
  }
  if(isSelected){
    c.save();c.lineWidth=3;c.strokeStyle='#f5d58d';c.setLineDash([12,5]);c.lineDashOffset=-clock*27;
    c.beginPath();c.ellipse(v.x,v.y+2,45,17,0,0,Math.PI*2);c.stroke();c.setLineDash([]);
    glow(v.x,v.y-45,73,'#e5ca8240');
    c.restore();
  }
  c.save();c.translate(v.x,v.y-bob);
  c.rotate(wiggle);
  const size=portrait?.98:1.02;c.scale(size,size);
  // Draw the user's actual monster, not a procedural substitute. Each atlas tile has a transparent background.
  const sprite = Math.max(0, Math.min(MONSTERS.length - 1, m.species));
  if (images[sprite].complete && images[sprite].naturalWidth > 0) {
    c.imageSmoothingEnabled = true;
    c.drawImage(images[sprite], -60, -115, 120, 120);
  } else {
    disc(0, -50, 33, 33, '#adccb4');
    write('?', 0, -51, 31, '#223c37', 'center');
  }
  if(m.job&&isWorking){
    if(m.job==='mine'){
      c.save();c.translate(25,-33);c.rotate(-.40+Math.sin(clock*9+m.id)*.58);
      line(0,14,4,-24,'#c79764',6);
      c.beginPath();c.moveTo(-15,-25);c.quadraticCurveTo(1,-37,23,-19);
      c.lineTo(15,-11);c.quadraticCurveTo(0,-27,-12,-12);c.closePath();c.fillStyle='#b9d0c2';c.fill();c.strokeStyle='#395353';c.lineWidth=2.5;c.stroke();
      c.restore();
      if(Math.sin(clock*9+m.id)>.82){
        disc(61,-8,3,3,'#ffd68d');disc(73,-22,2,2,'#fff0aa');
      }
    }else if(m.job==='haul'){
      c.save();c.translate(24+Math.sin(clock*3+m.id)*8,-16);c.rotate(Math.sin(clock*4)*.06);
      woodCrate(0,0,.78);
      if (m.cargo) { crystal(0,-32,35,'#8fe3c6'); glow(0,-47,28,'#94eac07a'); }
      c.restore();
    }else{
      c.save();c.translate(24,-30);c.rotate(Math.sin(clock*4+m.id)*.38-.23);
      box(-1,-11,29,25,'#78c0b2',7,'#244d50');
      line(23,-10,35,-17,'#87dcd3',6);line(35,-17,38,-8,'#87dcd3',5);
      disc(6,-13,9,5,'#b8efe4');
      c.restore();
      if(Math.sin(clock*4+m.id)>.18){
        disc(60,-5+Math.sin(clock*9)*4,3,6,'#9ae4e4c2');
        disc(70,2+Math.sin(clock*8)*3,2,4,'#c1f4ee');
      }
    }
  }
  c.restore();
  if(isSelected){
    const textY=v.y-(m.job?99:100);
    box(v.x-34,textY-17,68,27,'#233a34e8',10,'#d1b57b');
    write(m.name,v.x,textY-3,14,'#ffebbc','center','700');
  }
  if(escaping){
    c.save();c.translate(v.x+37,v.y-103+Math.sin(clock*7)*4);
    disc(0,0,17,17,'#e79c62');write('!',0,-1,22,'#422e25','center','900');c.restore();
  }
  // Idling creatures glance around, blink and watch floating dungeon fireflies.
  if(!m.job && !escaping){
    const phase=clock*.8+m.id*1.71;
    if(Math.sin(phase)>.82){
      glow(v.x-35,v.y-77,14,'#c0dca439');
      disc(v.x-35+Math.sin(clock*2+m.id)*4,v.y-83+Math.sin(clock*1.5)*3,2.5,2.5,'#f4ebad');
    }
    if(Math.sin(phase*.7) < -.86){
      // A brief sleepy exhale: no rest mechanic or timer changes.
      c.globalAlpha=.35+.25*Math.sin(clock*2+m.id);
      disc(v.x+42,v.y-66,7,4,'#d9e7cf');c.globalAlpha=1;
    }
  }
  // Personality is purely cosmetic: it changes idle animation, never job access or yield.
  if(!m.job && !escaping && !isSelected){
    const beat = Math.sin(clock*.74 + m.id*1.91 + m.species*.13);
    if(beat > .72){
      const info = PERSONALITY_INFO[m.personality];
      const bx = v.x + 34 + Math.sin(clock*1.6+m.id)*3;
      const by = v.y - 82 + Math.sin(clock*2+m.id)*4;
      glow(bx,by,22,m.personality==='friendly'?'#f5c7dc3c':'#c5e4d23b');
      disc(bx,by,13,13,'#203a34e8');
      write(info.glyph,bx,by,15,m.personality==='mischief'?'#ffc58d':m.personality==='friendly'?'#f8cfe0':'#d5efcf','center','900');
    }
    if(m.personality==='curious' && Math.sin(clock*.45+m.id*2.1)>.94){
      glow(v.x-35,v.y-77,14,'#c0dca439');
      disc(v.x-35+Math.sin(clock*2+m.id)*4,v.y-83+Math.sin(clock*1.5)*3,2.5,2.5,'#f4ebad');
    }
    if(m.personality==='sleepy' && Math.sin(clock*.7+m.id)>.84){
      c.globalAlpha=.65;write('ᶻᶻ',v.x+39,v.y-87+Math.sin(clock*2)*3,15,'#c4d4c0','center');c.globalAlpha=1;
    }
  }
}
function drawMonsters(): void {
  const order=state.monsters.slice().sort((a,b)=>(visuals.get(a.id)?.y??0)-(visuals.get(b.id)?.y??0));
  for(const m of order){const v=visuals.get(m.id);if(v)creature(m,v);}
}
function drawSocial(): void {
  const e = state.social, p = socialSpot();
  if (!e || !p) return;
  const a = visuals.get(e.a), b = e.b == null ? null : visuals.get(e.b);
  if (!a) return;
  // Creatures visibly acknowledge each other, even when doing the same job.
  if (b) {
    const close = Math.hypot(a.x-b.x,a.y-b.y) < 260;
    if(close){
      c.save();c.setLineDash([4,9]);c.lineWidth=2;c.strokeStyle=e.kind==='bicker'?'#f4b78291':'#e1cb919c';
      c.beginPath();c.moveTo(a.x,a.y-64);c.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2-136,b.x,b.y-64);c.stroke();c.restore();
    }
    if(e.kind==='chat'){
      glow(b.x+5,b.y-88,31,'#f2db9d4f');
      write('♡',b.x+5,b.y-87+Math.sin(clock*5)*3,28,'#f9dba0','center','900');
    }else{
      write('✦',b.x+10,b.y-91+Math.sin(clock*8)*5,26,'#f6b285','center','900');
    }
  }
  const bounce=Math.sin(clock*5)*4;
  glow(p.x,p.y+bounce,52,e.kind==='bicker'?'#f19b6363':'#f2db9870');
  c.save();c.translate(p.x,p.y+bounce);
  disc(0,0,27,25,e.kind==='bicker'?'#df9f6c':'#f1d6a0');
  c.beginPath();c.moveTo(-9,18);c.lineTo(-17,33);c.lineTo(4,21);c.fillStyle=e.kind==='bicker'?'#df9f6c':'#f1d6a0';c.fill();
  write(e.kind==='chat'?'♡':e.kind==='bicker'?'!':'ᶻ',0,-1,28,'#493b2f','center','900');
  c.restore();
}
function drawChest(p:Point):void {
  const total=JOBS.reduce((s,j)=>s+state.pending[j],0);
  glow(p.x,p.y-32,75,total?'#f2cb7a75':'#e6bc622c');
  c.save();c.translate(p.x,p.y);
  disc(0,8,54,14,'#071b1b77');
  if(state.buildings.warehouse){
    const tier=state.buildings.warehouse;
    box(-53,-98,105,90,'#384b40',5,'#b5a471');
    for(const dx of [-37,0,37])woodCrate(dx,-59,tier===2?.63:.48);
    line(-58,-102,58,-102,'#e8c78c',6);
    if(tier===2){
      poly([{x:-70,y:-103},{x:0,y:-158},{x:70,y:-103}], '#806e4c','#e2bc75',4);
      glow(0,-126,54,'#edd28b48');
      crystal(0,-114,22,'#ebdb9d');
    }
  }
  box(-39,-45,79,55,'#5a422e',8,'#1d2c2b');
  box(-42,-53,84,21,'#977149',6,'#392f2b');
  box(-34,-47,68,12,'#bb9358',4);
  box(-8,-51,16,59,'#d3b36c',4,'#645235');
  disc(0,-22,7,7,'#f8dfa1');
  for(const offset of [-26,26]){disc(offset,-42,3.5,3.5,'#ecce8f');}
  if(total){
    c.save();c.translate(0,-62+Math.sin(clock*4)*4);
    disc(0,0,23,23,'#f6d28d');
    write('↓',0,1,27,'#584331','center','900');
    c.restore();
    write('领取',0,30,16,'#f3dba1','center','700');
  }else{
    write('仓库',0,30,13,'#a8b8a0','center');
  }
  c.restore();
}
function drawCommissionBoard(p:Point):void {
  const mission=currentCommission(), ready=canPay(mission.needs);
  const width=portrait?229:270, h=portrait?78:81;
  c.save();c.translate(p.x,p.y);
  glow(0,-5,124,ready?'#e8be714b':'#c9b1791c');
  line(-width*.41,-h*.53,-width*.41,-h*.75,'#e5ba72',3);
  line(width*.41,-h*.53,width*.41,-h*.75,'#e5ba72',3);
  box(-width/2,-h/2,width,h,ready?'#67563a':'#494737',9,ready?'#eed68f':'#a9906c');
  box(-width/2+7,-h/2+7,width-14,h-14,'#283a31',5,'#7b805e');
  write('委 托',-width*.35,-18,15,'#f4dda1','left','800');
  write(mission.title,width*.13,-18,11,'#bccfb0','left','550');
  const needs=JOBS.filter(j=>mission.needs[j]>0);
  for(let i=0;i<needs.length;i++){
    const job=needs[i],x=-width*.31+i*width*.47,y=15;
    drawGoodsIcon(job,x-13,y+3);
    write(`${Math.min(state.goods[job],mission.needs[job])}/${mission.needs[job]}`,x+11,y+2,14,state.goods[job]>=mission.needs[job]?'#bde6b6':'#f6d8a5','left','750');
  }
  if(ready){
    glow(width/2-20,0,39,'#f7d58a79');
    write('✓',width/2-24,-17,18,'#fff0ad','center','900');
  }
  c.restore();
}
function drawUpgradeMarkers(l:FrameLayout):void{
  const buildingIcons:Record<Building,string>={rail:'轨',warehouse:'仓',garden:'花'};
  for(const building of BUILDINGS){
    const p=l.build[building],level=state.buildings[building];
    const flashing=shownCost===building&&costLife>0;
    glow(p.x,p.y,flashing?64:39,level===2?'#a1d9b44a':'#f3d68e3b');
    disc(p.x,p.y,25,25,level===2?'#456c57':flashing?'#a67a47':'#5f4e39');
    c.beginPath();c.arc(p.x,p.y,25,0,Math.PI*2);c.lineWidth=2;c.strokeStyle=flashing?'#fff0ab':'#c7b077';c.stroke();
    write(level===2?'✓':buildingIcons[building],p.x,p.y-3,level===2?19:17,'#fff0c3','center','800');
    for(let k=0;k<2;k++)disc(p.x-6+k*12,p.y+17,3,3,k<level?'#f7e18f':'#273c37');
    if(flashing&&level<2){
      const cost=BUILD_COSTS[building][level];
      const content=`★1 · ${JOBS.filter(j=>cost[j]).map(j=>GOOD_NAMES[j]+cost[j]).join(' ')}`;
      box(p.x-107,p.y-69,214,29,'#182e2be9',13,'#d0b378');
      write(content,p.x,p.y-55,12,'#fff0c5','center','700');
    }
  }
}
function drawFireflyJars(l: FrameLayout): void {
  const count = Math.min(3, Math.floor(state.firefliesCaught / 3));
  if (!count) return;
  const positions = portrait
    ? [l.room.x + l.room.w * .28, l.room.x + l.room.w * .61]
    : [l.room.x + l.room.w * .16, l.room.x + l.room.w * .48, l.room.x + l.room.w * .80];
  for (let i = 0; i < Math.min(count, positions.length); i++) {
    const x = positions[i], y = l.room.y + 18;
    glow(x, y + 9, 37, '#b9fff04a');
    line(x, y - 19, x, y - 8, '#a7a083', 3);
    box(x - 12, y - 8, 24, 29, '#7eb8a94a', 8, '#b6d6c1');
    box(x - 8, y - 13, 16, 6, '#c8b98a', 2);
    disc(x, y + 5 + Math.sin(clock * 2 + i) * 2, 4, 4, '#e1fff1');
    disc(x - 4, y + 10, 2, 2, '#9ee8d1');
    disc(x + 5, y - 1, 1.5, 1.5, '#fff4c6');
  }
}
function drawFirefly(): void {
  const f = state.firefly;
  if (!f) return;
  const p = fireflyPos();
  const pulse = .75 + Math.sin(clock * 9) * .25;
  glow(p.x, p.y, 58 * pulse, '#9fffe3a0');
  c.save(); c.translate(p.x, p.y);
  c.globalAlpha = .45;
  for (let i = 0; i < 4; i++) {
    const t = clock * 2 + i * .8;
    disc(-Math.sin(t) * (12 + i * 4), Math.cos(t) * (8 + i * 3), 2 + (i % 2), 2 + (i % 2), '#d3fff0');
  }
  c.globalAlpha = 1;
  c.rotate(Math.sin(clock * 6) * .12);
  poly([{x:-4,y:0},{x:-20,y:-15},{x:-18,y:2},{x:-5,y:7}], '#9bead9','#d9fff2',1.5);
  poly([{x:4,y:0},{x:20,y:-15},{x:18,y:2},{x:5,y:7}], '#9bead9','#d9fff2',1.5);
  disc(0, 1, 7, 11, '#e8ffb5');
  glow(0, 1, 24, '#baffd8b5');
  write('✦', 0, -26, 15, '#f4ffce', 'center', '900');
  for (let i = 0; i < 3; i++) {
    disc((i - 1) * 13, 28, 4.2, 4.2, i < f.taps ? '#f4df8e' : '#27483e');
    c.beginPath(); c.arc((i - 1) * 13, 28, 4.2, 0, Math.PI * 2); c.strokeStyle = '#d4edc7'; c.lineWidth = 1; c.stroke();
  }
  c.restore();
}
function drawEvent(_l:FrameLayout):void {
  const e=state.event;
  if(!e)return;
  const spots=eventSpots(e.job);
  const mid=spots[1];
  write(EVENT_NAMES[e.job],mid.x,mid.y-54,14,'#fff0ba','center','800');
  for(let i=0;i<3;i++){
    if(e.cleared & (1<<i))continue;
    const p=spots[i],y=p.y+Math.sin(clock*5+i*1.9)*5;
    glow(p.x,y,50,'#ffc26568');
    c.save();c.translate(p.x,y);
    if(e.job==='mine'){
      stone(0,9,19);
      line(-17,11,15,-12,'#f8d18a',3);
    }else if(e.job==='haul'){
      c.rotate((i-1)*.17);woodCrate(0,10,.65,true);
    }else{
      c.beginPath();c.arc(0,4,13,Math.PI*.15,Math.PI*1.7);
      c.strokeStyle='#e3d787';c.lineWidth=8;c.stroke();
      poly([{x:-12,y:-2},{x:-9,y:-19},{x:4,y:-13},{x:8,y:-2}], '#9ce1a2','#4f7954',2);
    }
    disc(0,-30,13,13,'#f6cf79');write('!',0,-31,16,'#553822','center','900');
    c.restore();
  }
}
function drawVfx():void{
  for(const p of particles){c.globalAlpha=Math.min(1,p.life/p.max);glow(p.x,p.y,12,p.color+'44');disc(p.x,p.y,p.radius,p.radius,p.color);}
  c.globalAlpha=1;
  for(const t of texts){c.globalAlpha=Math.min(1,t.life/t.max);write(t.text,t.x,t.y,25,t.color,'center','900');}
  c.globalAlpha=1;
}

function drawGoodsIcon(job: Job, x: number, y: number): void {
  c.save();c.translate(x,y);
  if(job==='mine'){
    poly([{x:-13,y:6},{x:-11,y:-7},{x:-2,y:-17},{x:11,y:-8},{x:13,y:5},{x:0,y:12}], '#a4ddc6','#426b69',2);
    poly([{x:-11,y:-7},{x:-2,y:-17},{x:0,y:11}], '#daf4cb');
  }else if(job==='haul'){
    woodCrate(0,12,.47);
  }else{
    line(0,10,0,-6,'#80b783',3);
    poly([{x:0,y:-2},{x:-15,y:-17},{x:-14,y:-1},{x:0,y:8}], '#87d79c','#3d6656',1);
    poly([{x:0,y:-8},{x:14,y:-19},{x:15,y:-2},{x:0,y:7}], '#bedb85','#3d6656',1);
  }
  c.restore();
}
function iconButton(p:Point, glyph:string, active=false):void{
  c.save();
  disc(p.x,p.y,25,25,active?'#4e6554':'#263a38');
  c.beginPath();c.arc(p.x,p.y,25,0,Math.PI*2);c.strokeStyle=active?'#f3db96':'#778a7c';c.lineWidth=1.7;c.stroke();
  write(glyph,p.x,p.y+1,22,active?'#ffedae':'#cdd5bd','center','800');
  c.restore();
}
function drawHud(l:FrameLayout):void{
  const topGrad=c.createLinearGradient(0,0,0,portrait?155:102);
  topGrad.addColorStop(0,'#0a191dee');topGrad.addColorStop(1,'#0a191d00');
  c.fillStyle=topGrad;c.fillRect(0,0,W,portrait?159:105);
  const titleX=portrait?33:Math.max(35,(W-1420)/2+36);
  write('幻兽囚坊',titleX,portrait?47:49,portrait?33:37,COLORS.cream,'left','900');
  write('小 小 劳 作 间',titleX+2,portrait?81:83,11,'#aaaf96','left','700');
  if(portrait){
    for(let i=0;i<3;i++){
      const job=JOBS[i],xx=108+i*198,yy=119;
      drawGoodsIcon(job,xx-28,yy);
      write(String(state.goods[job]),xx,yy,17,'#e4dcb9','left','750');
    }
  }else{
    const resStart=W-570;
    for(let i=0;i<3;i++){
      const job=JOBS[i],xx=resStart+i*107,yy=58;
      drawGoodsIcon(job,xx,yy);
      write(String(state.goods[job]),xx+19,yy+1,17,'#f3e8c6','left','800');
    }
  }
  const badgeX=portrait?W-285:W-640;
  disc(badgeX,portrait?57:58,15,15,'#c9a268');
  write('★',badgeX,portrait?56:57,19,'#49392d','center','900');
  write(String(state.seals),badgeX+23,portrait?57:58,17,'#f9e4b8','left','800');
  iconButton({x:W-236,y:l.sound.y},'☷');
  iconButton(l.sound,audioOn?'♫':'♪');
  if(!audioOn){line(l.sound.x-9,l.sound.y+10,l.sound.x+12,l.sound.y-11,'#ad8170',2.2);}
  iconButton(l.pause,state.paused?'▶':'Ⅱ',state.paused);
  iconButton(l.capture,'☷',true);
  if(state.monsters.length<MAX_MONSTERS){
    const pulse=.6+.4*Math.sin(clock*2);
    c.globalAlpha=pulse;disc(l.capture.x+17,l.capture.y-19,4.5,4.5,'#f8d688');c.globalAlpha=1;
  }
  // In-world instruction and the one action button appear only when useful.
  const m=state.monsters.find(p=>p.id===selected);
  const y=H-(portrait?64:47);
  if(m){
    const mid=portrait?W*.40:W*.48;
    box(mid-182,y-25,350,53,'#172c2bdf',26,'#758b70');
    disc(mid-147,y,18,18,'#b3a06d');
    write(String(m.id).padStart(2,'0'),mid-147,y,13,'#23362d','center','900');
    write(m.name,mid-115,y,18,'#fff0c9');
    write(m.job?`· ${JOB_NAMES[m.job]}中`:'· 等待安排',mid-51,y,13,'#aabfaa','left','500');
    if(m.job){
      box(l.rest.x-l.rest.w/2,l.rest.y-l.rest.h/2,l.rest.w,l.rest.h,'#435a46',22,'#c8b17d');
      write('收工',l.rest.x,l.rest.y+1,15,'#f2e1af','center');
    }
  }else{
    write('点怪物，再点工位',W/2,y,portrait?18:17,'#d9d7b5','center','600');
  }
  if(state.paused){
    c.fillStyle='#0b1419a1';c.fillRect(0,0,W,H);
    glow(W/2,H/2,190,'#e2c28428');
    write('已暂停',W/2,H/2-24,34,'#f3e7bc','center','800');
    write('点击右上角继续',W/2,H/2+27,15,'#c5d1bc','center','500');
  }
  if(toastLife>0){
    const alpha=Math.min(1,toastLife/.25);
    c.globalAlpha=alpha;
    c.save();
    c.font="700 15px 'Microsoft YaHei',sans-serif";
    const tw=Math.min(W-58, c.measureText(toastMessage).width+50);
    box(W/2-tw/2,H-(portrait?142:123),tw,41,'#142723ed',21,'#9cae81');
    write(toastMessage,W/2,H-(portrait?122:103),15,'#ffedba','center','750');
    c.restore();c.globalAlpha=1;
  }
}
function render():void{
  c.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
  c.clearRect(0,0,W,H);
  const l=layout();
  c.save();
  if(shake>0)c.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
  drawBackdrop(l);
  drawFireflyJars(l);
  drawCellsBack(l);
  drawGate(l);
  drawRailNetwork(l);
  for(const job of JOBS)drawStationBack(job,l.stations[job]);
  drawMinePile(l.stations.mine);
  drawMonsters();
  drawCellsFront(l);
  drawSocial();
  drawCommissionBoard(l.board);
  for(const job of JOBS)drawStationFront(job,l.stations[job]);
  drawChest(l.chest);
  drawUpgradeMarkers(l);
  drawEvent(l);
  drawFirefly();
  drawVfx();
  drawForegroundFrame(l);
  c.restore();
  drawHud(l);
}
function distance(a:Point,b:Point):number{return Math.hypot(a.x-b.x,a.y-b.y);}
function hitRect(x:number,y:number,r:Rect):boolean{return x>=r.x-r.w/2&&x<=r.x+r.w/2&&y>=r.y-r.h/2&&y<=r.y+r.h/2;}
function target(x:number,y:number):string|null{
  const l=layout();
  if(distance({x,y},{x: W - 236, y:l.sound.y})<31)return 'roster';
  if(distance({x,y},l.pause)<31)return 'pause';
  if(distance({x,y},l.sound)<31)return 'sound';
  if(distance({x,y},l.capture)<33)return 'capture';
  if(state.paused)return null;
  if(state.firefly && distance({x,y},fireflyPos())<58)return 'firefly';
  if(state.escape){
    const escaping=visuals.get(state.escape.id);
    if(distance({x,y},l.gate)<70) return 'escape';
    if(escaping && distance({x,y},{x:escaping.x,y:escaping.y-36})<58) return 'escape';
  }
  const social=socialSpot();
  if(social && distance({x,y},social)<38) return 'social';
  const current=state.monsters.find(m=>m.id===selected);
  if(current?.job&&hitRect(x,y,l.rest))return 'rest';
  if(state.event){
    const spots=eventSpots(state.event.job);
    for (let i=0;i<3;i++) if (!(state.event.cleared & (1<<i)) && distance({x,y},spots[i]) < 32) return `event-${i}`;
  }
  for(const building of BUILDINGS)if(distance({x,y},l.build[building])<31)return `build-${building}`;
  if(hitRect(x,y,{x:l.board.x,y:l.board.y,w:portrait?244:284,h:portrait?97:98}))return 'commission';
  if(hitRect(x,y,{...l.chest,w:115,h:133,y:l.chest.y-24}))return 'chest';
  if(state.pitOre && distance({x,y},{x:l.stations.mine.x+102,y:l.stations.mine.y-42}) < 35)return 'pile';
  // The clickable area tracks the actual moving creature, not its old cell.
  for(const p of state.monsters.slice().reverse()){
    const v=visuals.get(p.id)!;
    if(distance({x,y},{x:v.x,y:v.y-35})<50)return `monster-${p.id}`;
  }
  for(const job of JOBS){
    const p=l.stations[job];
    if(hitRect(x,y,{x:p.x,y:p.y-22,w:portrait?208:245,h:165}))return `station-${job}`;
  }
  return null;
}
function activate(t:string|null):void{
  if(!t)return;
  if(t==='roster'){showRoster();return;}
  if(t==='pause'){togglePause();ding(420,.09);return;}
  if(t==='sound'){audioOn=!audioOn;say(audioOn?'音效已开启':'音效已关闭');ding(660,.1);return;}
  if(t==='capture'){if(!state.paused)capture();return;}
  if(state.paused)return;
  if(t==='escape'){endEscape(true);return;}
  if(t==='firefly'){catchFirefly();return;}
  if(t==='social'){resolveSocial();return;}
  if(t==='rest'){rest();return;}
  if(t==='commission'){deliverCommission();return;}
  if(t.startsWith('build-')){buildUpgrade(t.slice(6) as Building);return;}
  if(t.startsWith('event-')){finishEvent(Number(t.slice(6)));return;}
  if(t==='pile'){liftOre();return;}
  if(t==='chest'){collect();return;}
  if(t.startsWith('monster-')){choose(Number(t.slice(8)));return;}
  if(t.startsWith('station-'))assign(t.slice(8) as Job);
}

// Minimal scrollable roster: all 18 sprites can be placed in the six visible cells.
// A full cell can be replaced; its old occupant remains available in the roster.
const rosterScreen = document.createElement('section');
rosterScreen.id = 'roster-screen';
rosterScreen.hidden = true;
rosterScreen.setAttribute('role', 'dialog');
rosterScreen.setAttribute('aria-modal', 'true');
rosterScreen.setAttribute('aria-label', '怪物名册');
rosterScreen.innerHTML = `<div class="roster-panel"><header class="roster-top"><div><small>战斗捕获名册 · 所有怪物均可劳作</small><h2>怪物名册</h2></div><button id="close-roster" aria-label="关闭名册">×</button></header>
<div id="roster-grid" class="roster-grid"></div><footer id="roster-caption">点击怪物加入囚室；六间已满时替换选中的怪物</footer></div>`;
root.appendChild(rosterScreen);
function rosterThumbnail(canvas: HTMLCanvasElement, species: number): void {
 const ctx=canvas.getContext('2d'),image=images[species];
 if(ctx && image.complete && image.naturalWidth)ctx.drawImage(image,0,0,canvas.width,canvas.height);
}
function refreshRoster(): void {
  const grid = element('roster-grid')!;
  grid.textContent = '';
  for (let i = 0; i < MONSTERS.length; i++) {
    if(!options.owns(MONSTERS[i].asset))continue;
    const existing = state.monsters.find(m => m.species === i);
    const button = document.createElement('button');
    button.className = 'roster-monster' + (existing ? ' is-active' : '');
    button.type = 'button';
    button.dataset.species = String(i);
    button.title = MONSTERS[i].name;
    const thumb = document.createElement('canvas');
    thumb.width = thumb.height = 88;
    thumb.setAttribute('aria-hidden', 'true');
    rosterThumbnail(thumb, i);
    const caption = document.createElement('span');
    caption.textContent = MONSTERS[i].name;
    button.append(thumb, caption);
    if (existing) {
      const mark = document.createElement('i');
      mark.textContent = '囚室' + existing.id;
      button.append(mark);
    }
    grid.appendChild(button);
  }
  element('roster-caption')!.textContent = `已安排 ${state.monsters.length}/6 只 · ${MONSTERS.filter(m=>options.owns(m.asset)).length}种已捕获 · 点怪物入住或替换；未捕获请先去战斗`;
}
function showRoster(): void {
  rosterOpen = true;
  refreshRoster();
  rosterScreen.hidden = false;
  element('close-roster')!.focus();
}
function closeRoster(): void {
  rosterOpen = false;
  rosterScreen.hidden = true;
  canvas.focus({preventScroll: true});
}
function placeSpecies(species: number): void {
  if (!Number.isInteger(species) || species < 0 || species >= MONSTERS.length || !options.owns(MONSTERS[species].asset)) return;
  const existing = state.monsters.find(m => m.species === species);
  if (existing) { selected = existing.id; closeRoster(); say(`选中了 ${existing.name}`); return; }
  if (state.monsters.length < MAX_MONSTERS) {
    const id = Array.from({length: MAX_MONSTERS}, (_, i)=>i+1).find(slot=>!state.monsters.some(m=>m.id===slot))!;
    const m: Monster = { id, species, name: MONSTERS[species].name, personality: personalityFor(species, id), job: null, progress: 0, cycles: 0, cargo: 0 };
    state.monsters.push(m);
    visuals.set(id, { ...home(id), speed: 0, walking: false });
    selected = id;
  } else {
    const replacement = state.monsters.find(m=>m.id===selected)
      ?? state.monsters.find(m=>!m.job && m.id!==state.escape?.id) ?? state.monsters[0];
    if (replacement.cargo) state.pitOre = Math.min(PIT_CAP, state.pitOre + replacement.cargo);
    if (state.escape?.id === replacement.id) state.escape = null;
    if (state.social?.a === replacement.id || state.social?.b === replacement.id) state.social = null;
    replacement.species = species;
    replacement.name = MONSTERS[species].name;
    replacement.personality = personalityFor(species, replacement.id);
    replacement.job = null;
    replacement.progress = 0;
    replacement.cargo = 0;
    replacement.cycles = 0;
    selected = replacement.id;
  }
  closeRoster();
  const pt = home(selected!);
  emit(pt.x, pt.y - 45, '#c7ebca', 26, 100);
  ding(720, .14);
  say(`${MONSTERS[species].name}进入囚室！`);
  store();
}
element('close-roster')!.addEventListener('click', closeRoster);
rosterScreen.addEventListener('click', event => {
  if (event.target === rosterScreen) { closeRoster(); return; }
  const btn = (event.target as Element).closest<HTMLButtonElement>('[data-species]');
  if (btn) placeSpecies(Number(btn.dataset.species));
});
for(const image of images)image.addEventListener('load',()=>{if(rosterOpen)refreshRoster();});

function coords(evt:PointerEvent):Point{
  const rect=canvas.getBoundingClientRect();
  return {x:(evt.clientX-rect.left)/rect.width*W,y:(evt.clientY-rect.top)/rect.height*H};
}
canvas.addEventListener('pointerdown',event=>{
  event.preventDefault();
  if(event.pointerType==='mouse'&&event.button!==0)return;
  canvas.focus({preventScroll:true});
  if (rosterOpen) return;
  const p=coords(event);activate(target(p.x,p.y));
});
canvas.addEventListener('pointermove',event=>{
  const p=coords(event);hovered=target(p.x,p.y);
  canvas.style.cursor=hovered?'pointer':'default';
});
canvas.addEventListener('pointerleave',()=>{hovered=null;canvas.style.cursor='default';});
window.addEventListener('keydown',event=>{
  if (event.repeat) return;
  if (rosterOpen) { if (event.key === 'Escape') closeRoster(); return; }
  if(/^[1-6]$/.test(event.key)){choose(Number(event.key));return;}
  const key=event.key.toLowerCase();
  if(key==='q')assign('mine');
  if(key==='w')assign('haul');
  if(key==='e')assign('grow');
  if(key==='r')rest();
  if(key==='c')capture();
  if(key==='m')showRoster();
  if(key==='enter')collect();
  if(key==='b')deliverCommission();
  if(key==='f')resolveSocial();
  if(key==='g' && state.escape)endEscape(true);
  if(key==='escape')selected=null;
  if(key===' '){event.preventDefault();togglePause();}
}, {signal:abort.signal});
window.addEventListener('resize',resize,{signal:abort.signal});
document.addEventListener('visibilitychange',()=>{lastStamp=0;store();},{signal:abort.signal});
window.addEventListener('pagehide',store,{signal:abort.signal});
function animate(stamp:number):void{
  // 30 frames per second reduces mobile heat without sacrificing readable character motion.
  if(renderedAt && stamp-renderedAt < 1000/30){frame=requestAnimationFrame(animate);return;}
  renderedAt=stamp;
  const dt=lastStamp?Math.max(0,Math.min(.055,(stamp-lastStamp)/1000)):0;
  lastStamp=stamp;
  if(!document.hidden)tick(dt);
  render();
  frame=requestAnimationFrame(animate);
}
resize();
if(!MONSTERS.some(m=>options.owns(m.asset)))say('囚坊尚空 · 先在闯关中削弱并捕获怪物，再来安排劳作',6);
frame=requestAnimationFrame(animate);

return {dispose(){cancelAnimationFrame(frame);abort.abort();store();},
 inspect(){return JSON.parse(JSON.stringify(state));},
 assign, placeSpecies, collect, deliverCommission, buildUpgrade, resolveSocial, endEscape, finishEvent, catchFirefly, showRoster,
 advance(dt:number){if(Number.isFinite(dt)&&dt>0)tick(Math.min(dt,.055));},
 pause(){state.paused=true;store();},resume(){state.paused=false;lastStamp=0;}
};
}
