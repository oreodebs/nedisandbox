import { loadCSV } from './loadCSV';

type AnyRow = Record<string, unknown>;
type StateShardLevel = 'lga' | 'ward' | 'school';

const normalizedFileCache = new Map<string, Promise<AnyRow[]>>();
const stateShardCache = new Map<string, Promise<AnyRow[]>>();

function getDataBaseUrl(): string {
  const baseUrl = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return baseUrl.endsWith('/') ? `${baseUrl}data` : `${baseUrl}/data`;
}

export function canonicalState(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';
  if (/^(Federal Capital Territory|Abuja Federal Capital Territory|Abuja FCT|FCT)$/i.test(trimmed)) {
    return 'Abuja Federal Capital Territory';
  }
  return trimmed;
}

export function canonicalGapBand(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';

  const normalized = trimmed
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-');

  switch (normalized) {
    case '1 year':
    case '1 years':
    case '1-year':
      return '1-year';
    case '2 year':
    case '2 years':
    case '2-year':
      return '2-year';
    case '3-5 year':
    case '3-5 years':
    case '3-5-year':
      return '3-5-year';
    case '5+ year':
    case '5+ years':
    case '5+-year':
      return '5+-year';
    default:
      return trimmed;
  }
}

type ScopedLocation = {
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  school?: string | null;
};

function hasLocationValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export type RefinedScopeDepth = 'top' | 'lga' | 'ward' | 'school';
export type RefinedLocLevel = 'state' | 'lga' | 'ward' | 'school';

export function scopeDepthForLocation(location: ScopedLocation): RefinedScopeDepth {
  if (!hasLocationValue(location.state)) return 'top';
  if (hasLocationValue(location.school)) return 'school';
  if (hasLocationValue(location.ward)) return 'ward';
  if (hasLocationValue(location.lga)) return 'ward';
  return 'lga';
}

export function expectedLocLevelForLocation(location: ScopedLocation): RefinedLocLevel {
  if (!hasLocationValue(location.state)) return 'state';
  if (hasLocationValue(location.school)) return 'school';
  if (hasLocationValue(location.ward)) return 'ward';
  if (hasLocationValue(location.lga)) return 'ward';
  return 'lga';
}

function stateFileCandidates(state: string): string[] {
  const trimmed = canonicalState(state);
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);
  if (trimmed === 'Abuja Federal Capital Territory') {
    variants.add('Federal Capital Territory');
    variants.add('Abuja FCT');
    variants.add('FCT');
  }
  return Array.from(variants).map((value) =>
    value
      .replace(/[\/]+/g, ' ')
      .replace(/[^A-Za-z0-9 ]+/g, '')
      .trim()
      .replace(/\s+/g, '_'),
  );
}

async function tryLoadPath<T>(path: string): Promise<T[]> {
  const dataBase = getDataBaseUrl();
  try {
    return await loadCSV<T>(`${dataBase}/${path}`);
  } catch {
    return await loadCSV<T>(`/data/${path}`);
  }
}

export function normalizeRefinedRows<T extends AnyRow>(rows: T[]): T[] {
  return rows.map((row) => {
    const next: AnyRow = { ...row };
    if (next.disability == null && next.disability_scope != null) {
      next.disability = next.disability_scope;
    }
    if (typeof next.disability === 'string') {
      const value = next.disability.trim().toLowerCase();
      next.disability = value === 'disabled' ? 'Disabled' : 'ALL';
    }
    if (next.disability_scope == null && typeof next.disability === 'string') {
      next.disability_scope = next.disability;
    }
    if (typeof next.state === 'string') {
      next.state = canonicalState(next.state);
    }
    if (typeof next.gap_band === 'string') {
      next.gap_band = canonicalGapBand(next.gap_band);
    }
    if (next.olevel_exam_body == null && next.exam_body != null) {
      next.olevel_exam_body = next.exam_body;
    }
    return next as T;
  });
}

async function loadNormalizedPath<T extends AnyRow>(path: string): Promise<T[]> {
  if (!normalizedFileCache.has(path)) {
    normalizedFileCache.set(
      path,
      tryLoadPath<T>(path).then((rows) => normalizeRefinedRows(rows) as AnyRow[]),
    );
  }

  try {
    return (await normalizedFileCache.get(path)) as T[];
  } catch (error) {
    normalizedFileCache.delete(path);
    throw error;
  }
}

export async function loadRefinedPageRows<T extends AnyRow>(page: string, state?: string): Promise<T[]> {
  if (!state) {
    return loadNormalizedPath<T>(`pages/${page}/top_rollup.csv`);
  }
  return loadRefinedStateShardRows<T>(page, state, 'school');
}

async function loadStateShardRows<T extends AnyRow>(page: string, state: string, level: StateShardLevel): Promise<T[]> {
  const candidates = stateFileCandidates(state);
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return loadNormalizedPath<T>(`pages/${page}/${level}/${candidate}.csv`);
    } catch (error) {
      lastError = error;
      const partRows: T[] = [];
      let loadedPart = false;
      for (let part = 1; part <= 12; part += 1) {
        try {
          const rows = await loadNormalizedPath<T>(`pages/${page}/${level}/${candidate}_part${part}.csv`);
          if (rows.length) {
            partRows.push(...rows);
            loadedPart = true;
          }
        } catch {
          if (loadedPart) break;
        }
      }
      if (loadedPart) {
        return partRows;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to load ${page} ${level} shard for ${state}`);
}

export async function loadRefinedStateShardRows<T extends AnyRow>(page: string, state: string, level: StateShardLevel = 'school'): Promise<T[]> {
  const cacheKey = `${page}|${canonicalState(state)}|${level}`;
  if (!stateShardCache.has(cacheKey)) {
    stateShardCache.set(cacheKey, loadStateShardRows<T>(page, state, level) as Promise<AnyRow[]>);
  }

  try {
    return (await stateShardCache.get(cacheKey)) as T[];
  } catch (error) {
    stateShardCache.delete(cacheKey);
    throw error;
  }
}

export async function loadRefinedScopedRows<T extends AnyRow>(page: string, state?: string, depth: 'top' | 'lga' | 'ward' | 'school' = 'top'): Promise<T[]> {
  if (!state || depth === 'top') {
    return loadNormalizedPath<T>(`pages/${page}/top_rollup.csv`);
  }
  return loadRefinedStateShardRows<T>(page, state, depth);
}

export async function loadRefinedFile<T extends AnyRow>(path: string): Promise<T[]> {
  return loadNormalizedPath<T>(path);
}
