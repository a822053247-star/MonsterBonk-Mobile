/** Pure, run-independent out-of-game progression. Never feeds back into Combat/RunBuild. */
export const SANCTUARY_STORAGE_KEY = 'monsterbonk:sanctuary:v1';
export const SANCTUARY_REGIONS = [
  { id: 'ember', name: '余烬营火', creature: '焰绒', icon: '🔥', description: '点亮篝火，让迷路的小兽找到归途。' },
  { id: 'spring', name: '泡泡泉眼', creature: '泡泡螈', icon: '💧', description: '疏通泉水，让清澈的溪流重新歌唱。' },
  { id: 'grove', name: '新芽古树', creature: '芽刺兽', icon: '🌿', description: '唤醒沉睡的树苗，让森林逐渐繁茂。' },
] as const;

export type SanctuaryRegionId = typeof SANCTUARY_REGIONS[number]['id'];
export type SanctuaryRunMode = 'campaign' | 'endless';
export const SANCTUARY_MAX_LEVEL = 3;
export const SANCTUARY_LEVEL_COSTS = [3, 5, 7] as const;

export interface SanctuarySave {
  version: 1;
  light: number;
  buildings: Record<SanctuaryRegionId, number>;
  bestCampaignWaves: number;
  bestEndlessWaves: number;
  recentRuns: string[];
}

export interface SanctuaryRun {
  id: string;
  mode: SanctuaryRunMode;
  completedWaves: number;
}

export interface SanctuaryReward {
  save: SanctuarySave;
  earned: number;
  newWaves: number;
  persisted: boolean;
}

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): StoragePort | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; }
  catch { return undefined; }
}
function integer(value: unknown, max = 1000000): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
}
export function newSanctuary(): SanctuarySave {
  // The welcome gift lets a new player build immediately, before their first run.
  return { version: 1, light: 3, buildings: { ember: 0, spring: 0, grove: 0 },
    bestCampaignWaves: 0, bestEndlessWaves: 0, recentRuns: [] };
}
export function readSanctuary(storage: StoragePort | undefined = browserStorage()): SanctuarySave {
  try {
    const raw = storage?.getItem(SANCTUARY_STORAGE_KEY);
    if (!raw) return newSanctuary();
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== 'object' || (input as { version?: unknown }).version !== 1) return newSanctuary();
    const data = input as Partial<SanctuarySave>;
    const buildings = data.buildings && typeof data.buildings === 'object' ? data.buildings : {} as SanctuarySave['buildings'];
    return {
      version: 1,
      light: integer(data.light),
      buildings: {
        ember: integer(buildings.ember, SANCTUARY_MAX_LEVEL),
        spring: integer(buildings.spring, SANCTUARY_MAX_LEVEL),
        grove: integer(buildings.grove, SANCTUARY_MAX_LEVEL),
      },
      bestCampaignWaves: integer(data.bestCampaignWaves, 6),
      bestEndlessWaves: integer(data.bestEndlessWaves, 100000),
      recentRuns: Array.isArray(data.recentRuns)
        ? [...new Set(data.recentRuns.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length < 100))].slice(-32)
        : [],
    };
  } catch {
    return newSanctuary();
  }
}
function saveSanctuary(data: SanctuarySave, storage: StoragePort | undefined): boolean {
  try { if (!storage) return false; storage.setItem(SANCTUARY_STORAGE_KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}

export function upgradeSanctuary(
  id: SanctuaryRegionId,
  storage: StoragePort | undefined = browserStorage(),
): { ok: boolean; save: SanctuarySave; reason: string } {
  const original = readSanctuary(storage);
  if (!SANCTUARY_REGIONS.some(region => region.id === id)) return { ok: false, save: original, reason: '未知的栖地区域' };
  const level = original.buildings[id];
  if (level >= SANCTUARY_MAX_LEVEL) return { ok: false, save: original, reason: '这片栖地已经修复完成' };
  const cost = SANCTUARY_LEVEL_COSTS[level];
  if (original.light < cost) return { ok: false, save: original, reason: '光屑不足，继续冒险可以获得更多' };
  const next: SanctuarySave = {
    ...original, light: original.light - cost,
    buildings: { ...original.buildings, [id]: level + 1 },
  };
  if (!saveSanctuary(next, storage)) return { ok: false, save: original, reason: '存档不可用，建设未保存' };
  return { ok: true, save: next, reason: '建设成功！森林焕发了新的生机。' };
}

/** Grant progress only for completed formal-run waves. Repeat runs earn a small, bounded bonus.
 * A run ID is persisted to make repeated endRun calls idempotent, including after reload. */
export function recordSanctuaryRun(
  run: SanctuaryRun,
  storage: StoragePort | undefined = browserStorage(),
): SanctuaryReward {
  const original = readSanctuary(storage);
  if (!run.id || run.id.length >= 100 || (run.mode !== 'campaign' && run.mode !== 'endless') || original.recentRuns.includes(run.id)) {
    return { save: original, earned: 0, newWaves: 0, persisted: true };
  }
  const completedWaves = integer(run.completedWaves, run.mode === 'campaign' ? 6 : 100000);
  const bestKey = run.mode === 'campaign' ? 'bestCampaignWaves' : 'bestEndlessWaves';
  const newWaves = Math.max(0, completedWaves - original[bestKey]);
  const discovery = Math.min(6, newWaves) * 2;
  const expedition = completedWaves >= 2 ? Math.min(3, Math.floor(completedWaves / 2)) : 0;
  const earned = discovery + expedition;
  const next: SanctuarySave = {
    ...original,
    light: Math.min(1000000, original.light + earned),
    [bestKey]: Math.max(original[bestKey], completedWaves),
    recentRuns: [...original.recentRuns, run.id].slice(-32),
  };
  const persisted = saveSanctuary(next, storage);
  return { save: persisted ? next : original, earned: persisted ? earned : 0, newWaves: persisted ? newWaves : 0, persisted };
}
