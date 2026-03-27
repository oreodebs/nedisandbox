import { loadCSV } from './loadCSV';
import { getDataBaseUrl } from './loadAgg';

type AnyRow = Record<string, unknown>;

export function canonicalState(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';
  if (/^(Federal Capital Territory|Abuja Federal Capital Territory|Abuja FCT)$/i.test(trimmed)) {
    return 'Abuja Federal Capital Territory';
  }
  return trimmed;
}

function stateFileCandidates(state: string): string[] {
  const trimmed = canonicalState(state);
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed, 'Federal Capital Territory', 'Abuja Federal Capital Territory', 'Abuja FCT']);
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
    if (next.olevel_exam_body == null && next.exam_body != null) {
      next.olevel_exam_body = next.exam_body;
    }
    if (next.infrastructure_score == null) {
      next.infrastructure_score = 0;
    }
    return next as T;
  });
}

export async function loadRefinedPageRows<T extends AnyRow>(page: string, state?: string): Promise<T[]> {
  if (!state) {
    const rows = await tryLoadPath<T>(`pages/${page}/top_rollup.csv`);
    return normalizeRefinedRows(rows);
  }
  return loadRefinedStateShardRows<T>(page, state, 'school');
}

export async function loadRefinedStateShardRows<T extends AnyRow>(page: string, state: string, level: 'lga' | 'ward' | 'school' = 'school'): Promise<T[]> {
  const candidates = stateFileCandidates(state);
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const rows = await tryLoadPath<T>(`pages/${page}/${level}/${candidate}.csv`);
      return normalizeRefinedRows(rows);
    } catch (error) {
      lastError = error;
      const partRows: T[] = [];
      let loadedPart = false;
      for (let part = 1; part <= 12; part += 1) {
        try {
          const rows = await tryLoadPath<T>(`pages/${page}/${level}/${candidate}_part${part}.csv`);
          if (rows.length) {
            partRows.push(...rows);
            loadedPart = true;
          }
        } catch {
          if (loadedPart) break;
        }
      }
      if (loadedPart) {
        return normalizeRefinedRows(partRows);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to load ${page} ${level} shard for ${state}`);
}

export async function loadRefinedScopedRows<T extends AnyRow>(page: string, state?: string, depth: 'top' | 'lga' | 'ward' | 'school' = 'top'): Promise<T[]> {
  if (!state || depth === 'top') {
    const rows = await tryLoadPath<T>(`pages/${page}/top_rollup.csv`);
    return normalizeRefinedRows(rows);
  }
  return loadRefinedStateShardRows<T>(page, state, depth);
}

export async function loadRefinedFile<T extends AnyRow>(path: string): Promise<T[]> {
  const rows = await tryLoadPath<T>(path);
  return normalizeRefinedRows(rows);
}
