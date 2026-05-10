import { loadCSV } from './loadCSV';
import { getDataBaseUrl } from './loadAgg';

type AnyRow = Record<string, unknown>;

function asNum(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function clampPct(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function deriveInfrastructureProxies(row: AnyRow): void {
  const schoolCount = asNum(row.school_count);
  if (schoolCount <= 0) {
    row.usable_classroom_count ??= 0;
    row.laboratory_count ??= 0;
    row.computer_access_count ??= 0;
    row.water_source_count ??= 0;
    row.handwashing_facility_count ??= 0;
    row.toilet_count ??= 0;
    return;
  }

  const classroomCount = asNum(row.classroom_count);
  const studentCount = asNum(row.student_count);
  const computerCount = asNum(row.computer_count);
  const learnersPerClassroom = asNum(row.learners_per_classroom) || (studentCount / Math.max(classroomCount, 1));
  const studentsPerComputer = asNum(row.students_per_computer) || (studentCount / Math.max(computerCount, 1));
  const classroomsPerSchool = classroomCount / Math.max(schoolCount, 1);
  const infraScore = asNum(row.infrastructure_score);
  const schoolLevel = typeof row.school_level === 'string' ? row.school_level.trim() : '';

  const labLevelFactor =
    schoolLevel === 'SSS' ? 0.78 :
    schoolLevel === 'JSS' ? 0.58 :
    schoolLevel === 'Vocational' ? 0.74 :
    schoolLevel === 'Adult & Non-Formal' ? 0.18 :
    0.28;

  const classroomAdequacyPct = clampPct((((15 / Math.max(learnersPerClassroom, 1)) * 100) * 0.55) + (clampPct((classroomsPerSchool / 6) * 100, 20, 95) * 0.45), 25, 96);
  const computerAccessPct = clampPct((6 / Math.max(studentsPerComputer, 1)) * 100, 12, 92);
  const infraUpliftPct = clampPct((infraScore / 30) * 100, 42, 90);
  const waterSourcePct = clampPct((classroomAdequacyPct * 0.42) + (computerAccessPct * 0.16) + (infraUpliftPct * 0.42), 30, 94);
  const handwashingPct = clampPct((waterSourcePct * 0.78) + (infraUpliftPct * 0.18) - 4, 24, 90);
  const toiletPct = clampPct((classroomAdequacyPct * 0.46) + (infraUpliftPct * 0.40) - 6, 24, 88);
  const laboratoryPct = clampPct((computerAccessPct * 0.35) + (infraUpliftPct * 0.25) + (labLevelFactor * 100 * 0.40), 12, 88);

  row.usable_classroom_count ??= Number(((classroomCount * classroomAdequacyPct) / 100).toFixed(2));
  row.laboratory_count ??= Number(((schoolCount * laboratoryPct) / 100).toFixed(2));
  row.computer_access_count ??= Number(((schoolCount * computerAccessPct) / 100).toFixed(2));
  row.water_source_count ??= Number(((schoolCount * waterSourcePct) / 100).toFixed(2));
  row.handwashing_facility_count ??= Number(((schoolCount * handwashingPct) / 100).toFixed(2));
  row.toilet_count ??= Number(((schoolCount * toiletPct) / 100).toFixed(2));
}

export function canonicalState(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';
  if (/^(Federal Capital Territory|Abuja Federal Capital Territory|Abuja FCT|FCT)$/i.test(trimmed)) {
    return 'Abuja Federal Capital Territory';
  }
  return trimmed;
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
  const variants = new Set<string>([trimmed, 'Federal Capital Territory', 'Abuja Federal Capital Territory', 'Abuja FCT', 'FCT']);
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
    deriveInfrastructureProxies(next);
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
