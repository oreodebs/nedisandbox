import type { MinisterFilters } from "../types";
import {
  canonicalState,
  expectedLocLevelForLocation,
} from "./refinedPageData";

export type CanonicalTransitionRow = {
  session: string;
  zone: string;
  state: string;
  lga: string;
  ward?: string;
  school?: string;
  loc_level?: string;
  gender: string;
  disability: string;
  institution_type: string;
  admitted_students: number;
  matriculated_students: number;
};

export type CanonicalTransitionMetrics = {
  admitted: number;
  matriculated: number;
};

function safeNum(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function filterCanonicalTransitionRows(
  rows: CanonicalTransitionRow[],
  filters: MinisterFilters,
  disabilityMode: boolean,
): CanonicalTransitionRow[] {
  const expectedLocLevel = expectedLocLevelForLocation(filters);

  return rows.filter((row) => {
    if (filters.session && row.session !== filters.session) return false;
    if (row.loc_level && row.loc_level.toLowerCase() !== expectedLocLevel) return false;
    if (filters.zone && row.zone !== filters.zone) return false;
    if (filters.state && canonicalState(row.state) !== canonicalState(filters.state)) return false;
    if (filters.lga && row.lga !== filters.lga) return false;
    if (filters.gender && row.gender !== filters.gender) return false;
    if (filters.institution_type && row.institution_type !== filters.institution_type) return false;
    if (disabilityMode ? row.disability !== "Disabled" : row.disability === "Disabled") return false;
    return true;
  });
}

export function sumCanonicalTransitionMetrics(rows: CanonicalTransitionRow[]): CanonicalTransitionMetrics {
  return {
    admitted: rows.reduce((sum, row) => sum + safeNum(row.admitted_students), 0),
    matriculated: rows.reduce((sum, row) => sum + safeNum(row.matriculated_students), 0),
  };
}

export function canUseCanonicalPolicyMatriculation(filters: MinisterFilters): boolean {
  return !filters.tertiary_institution &&
    !filters.programme_cluster &&
    !filters.discipline_group &&
    !filters.programme;
}
