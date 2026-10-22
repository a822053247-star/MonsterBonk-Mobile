export const ENDLESS_RECORD_STORAGE_KEY = 'monsterbonk:endless-record:v1';

export interface EndlessRecord {
  bestWave: number;
  bestCycle: number;
  bestBossesDefeated: number;
  bestSurvivalSeconds: number;
  runsPlayed: number;
}

export interface EndlessRunResult {
  wave: number;
  cycle: number;
  bossesDefeated: number;
  survivalSeconds: number;
}

export interface EndlessRecordUpdate {
  record: EndlessRecord;
  newRecords: readonly string[];
}

type RecordStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const EMPTY_ENDLESS_RECORD: Readonly<EndlessRecord> = Object.freeze({
  bestWave: 0,
  bestCycle: 0,
  bestBossesDefeated: 0,
  bestSurvivalSeconds: 0,
  runsPlayed: 0,
});

function browserStorage(): RecordStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    // Private browsing and embedded webviews may deny storage access.
    return undefined;
  }
}

function count(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function seconds(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function sanitize(value: unknown): EndlessRecord {
  if (!value || typeof value !== 'object') return { ...EMPTY_ENDLESS_RECORD };
  const input = value as Partial<EndlessRecord>;
  return {
    bestWave: count(input.bestWave),
    bestCycle: count(input.bestCycle),
    bestBossesDefeated: count(input.bestBossesDefeated),
    bestSurvivalSeconds: seconds(input.bestSurvivalSeconds),
    runsPlayed: count(input.runsPlayed),
  };
}

export function readEndlessRecord(storage: RecordStorage | undefined = browserStorage()): EndlessRecord {
  if (!storage) return { ...EMPTY_ENDLESS_RECORD };
  try {
    const raw = storage.getItem(ENDLESS_RECORD_STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : { ...EMPTY_ENDLESS_RECORD };
  } catch {
    return { ...EMPTY_ENDLESS_RECORD };
  }
}

export function recordEndlessRun(
  result: EndlessRunResult,
  storage: RecordStorage | undefined = browserStorage(),
): EndlessRecordUpdate {
  const previous = readEndlessRecord(storage);
  const wave = count(result.wave);
  const cycle = count(result.cycle);
  const bossesDefeated = count(result.bossesDefeated);
  const survivalSeconds = seconds(result.survivalSeconds);
  const newRecords: string[] = [];

  if (wave > previous.bestWave) newRecords.push('最高波数');
  if (cycle > previous.bestCycle) newRecords.push('最高轮次');
  if (bossesDefeated > previous.bestBossesDefeated) newRecords.push('击败 Boss 数');
  if (survivalSeconds > previous.bestSurvivalSeconds) newRecords.push('最长生存时间');

  const record: EndlessRecord = {
    bestWave: Math.max(previous.bestWave, wave),
    bestCycle: Math.max(previous.bestCycle, cycle),
    bestBossesDefeated: Math.max(previous.bestBossesDefeated, bossesDefeated),
    bestSurvivalSeconds: Math.max(previous.bestSurvivalSeconds, survivalSeconds),
    runsPlayed: previous.runsPlayed + 1,
  };
  try {
    storage?.setItem(ENDLESS_RECORD_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Keep the result screen functional if persistence is unavailable.
  }
  return { record, newRecords };
}

export function formatEndlessRecordTime(value: number) {
  const total = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
