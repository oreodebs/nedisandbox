import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, Dispatch, MouseEvent as ReactMouseEvent, ReactNode, SetStateAction } from "react";
import Plot from "react-plotly.js";
import type { Data as PlotlyData, Layout as PlotlyLayout, Config as PlotlyConfig } from "plotly.js";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  GraduationCap,
  HelpCircle,
  Landmark,
  Maximize2,
  Minus,

  RotateCw,
  School,
  Users,
  X,
} from "lucide-react";

import type { DimSession, MinisterFilters } from "../types";
import {
  canonicalState,
  expectedLocLevelForLocation,
  loadRefinedFile,
  loadRefinedScopedRows,
  scopeDepthForLocation,
} from "../utils/refinedPageData";
import {
  BASIC_SECONDARY_SESSIONS,
  filterRowsBySessionWindow,
} from "../utils/sessionWindows";

type AccessWardRow = {
  session: string;
  zone: string;
  state: string;
  lga: string;
  ward: string;
  loc_level?: string;
  gender: string;
  disability: string;
  school_type: string;
  school_level: string;
  class_grade: string;
  student_count: number;
  school_count: number;
  classroom_count: number;
  computer_count: number;
  infrastructure_score: number;
  usable_classroom_count?: number;
  laboratory_count?: number;
  computer_access_count?: number;
  water_source_count?: number;
  handwashing_facility_count?: number;
  toilet_count?: number;
  key_entry_level?: string;
  is_o_level_student: number;
  school?: string;
};

type TeacherCapacityRow = {
  session: string;
  zone: string;
  state: string;
  lga: string;
  ward: string;
  school: string;
  loc_level?: string;
  gender: string;
  school_type: string;
  school_level: string;
  class_grade: string;
  disability?: string;
  student_count: number;
  teacher_count: number;
};

type PlotPoint = { x?: unknown; y?: unknown; location?: unknown; customdata?: unknown };
type PlotPointEvent = { points?: PlotPoint[] };
type MapLevel = "state" | "lga";
type LocationLevel = "zone" | "state" | "lga" | "ward" | "school";

type DrillState = {
  state?: string;
  lga?: string;
  ward?: string;
  school?: string;
};

type LegendItem = {
  label: string;
  color: string;
  dashed?: boolean;
};

type MapLegendItem = {
  label: string;
  color: string;
};

type ChartBundle = {
  data: PlotlyData[];
  layout: Partial<PlotlyLayout>;
  config?: Partial<PlotlyConfig>;
  subtitle?: string;
  scrollable?: boolean;
  scrollMaxHeight?: number;
  expandedMaxHeight?: number;
  fixedLegend?: LegendItem[];
  expandedWidthClass?: string;
};

type SortMode = "alphabetical" | "desc" | "asc";

type ChartKey =
  | "densityMapPublic"
  | "densityMapPrivate"
  | "densityDrillPublic"
  | "densityDrillPrivate"
  | "densityCombined"
  | "densityCombinedDrill"
  | "densitySchoolLevel"
  | "schoolCountState"
  | "schoolCountPrimaryState"
  | "schoolCountSecondaryState"
  | "studentCountState"
  | "studentCountPrimaryState"
  | "studentCountSecondaryState"
  | "primaryStudentPublicGenderState"
  | "primaryStudentPrivateGenderState"
  | "secondaryStudentPublicGenderState"
  | "secondaryStudentPrivateGenderState"
  | "primaryStudentCombinedGenderState"
  | "secondaryStudentCombinedGenderState"
  | "studentCountGender"
  | "funnel"
  | "progression"
  | "keyEntryState"
  | "keyEntryGender"
  | "classroomZone"
  | "classroomState"
  | "classroomPrimaryState"
  | "classroomSecondaryState"
  | "classroomType"
  | "classroomLevel"
  | "computerMap"
  | "infrastructureMap"
  | "primary"
  | "jss"
  | "sss"
  | "vocational"
  | "iqs";

type ExpandState = {
  key: ChartKey;
  title: string;
} | null;

type MetricCard = {
  label: string;
  value: number;
  delta: number | null;
  accent: string;
  bg: string;
  icon: ReactNode;
  help: string;
  valueType?: "count" | "ratio";
  breakdown?: Array<{ label: string; value: number; valueType?: "count" | "ratio" }>;
  note?: string;
  prevSessionLabel?: string;
  showDelta?: boolean;
};

type FacilityMetrics = {
  students: number;
  schools: number;
  classrooms: number;
  computers: number;
  infraScore: number;
  usableClassrooms: number;
  laboratories: number;
  computerAccessUnits: number;
  waterSources: number;
  handwashingFacilities: number;
  toilets: number;
};

type AggregatedGroup = {
  label: string;
  zone?: string;
  state?: string;
  lga?: string;
  metrics: FacilityMetrics;
};

type ProgressionRow = {
  classLevel: string;
  previousLearners: number;
  currentLearners: number;
  netChange: number;
  changePct: number;
};




export const ACCESS_COVERAGE_SECTIONS = [
  { id: "access-coverage-kpi", label: "KPI Cards" },
  { id: "access-coverage-main", label: "Access & Coverage" },
  { id: "access-coverage-classroom", label: "Classroom Pressure" },
  { id: "access-coverage-ict", label: "ICT / Infrastructure" },
] as const;

const KEY_ENTRY_LEVELS = ["Primary 1", "JSS1", "SSS1"] as const;
const CLASS_LEVELS = [
  "K1",
  "K2",
  "Primary 1",
  "Primary 2",
  "Primary 3",
  "Primary 4",
  "Primary 5",
  "Primary 6",
  "JSS1",
  "JSS2",
  "JSS3",
  "SSS1",
  "SSS2",
  "SSS3",
] as const;
const TREND_CLASS_LEVELS = [
  "Primary 1",
  "Primary 2",
  "Primary 3",
  "Primary 4",
  "Primary 5",
  "Primary 6",
  "JSS1",
  "JSS2",
  "JSS3",
  "SSS1",
  "SSS2",
  "SSS3",
] as const;
const PROGRESSION_TRANSITIONS = [
  ["K1", "K2"],
  ["K2", "Primary 1"],
  ["Primary 1", "Primary 2"],
  ["Primary 2", "Primary 3"],
  ["Primary 3", "Primary 4"],
  ["Primary 4", "Primary 5"],
  ["Primary 5", "Primary 6"],
  ["JSS1", "JSS2"],
  ["JSS2", "JSS3"],
  ["JSS3", "SSS1"],
  ["SSS1", "SSS2"],
  ["SSS2", "SSS3"],
] as const;
type SchoolLevelOption =
  | "Pre-Primary/Primary"
  | "JSS"
  | "SSS"
  | "Vocational"
  | "Adult & Non-Formal";
const ABUJA_STATE_NAME = "Abuja Federal Capital Territory";
const ABUJA_STATE_LABEL = "FCT";
const DEFAULT_SORT_MODE: SortMode = "alphabetical";
const displayLocationLabel = (label: string, level?: LocationLevel | MapLevel): string => {
  const trimmed = String(label ?? "").trim();
  const shouldUseFctLabel = level === undefined || level === "state";

  if (shouldUseFctLabel && (trimmed === ABUJA_STATE_NAME || trimmed === "Abuja FCT" || trimmed === "Abuja")) {
    return ABUJA_STATE_LABEL;
  }

  return trimmed;
};

const sourceLocationLabel = (label: string): string => {
  const trimmed = String(label ?? "").trim();
  return trimmed === ABUJA_STATE_LABEL || trimmed === "Abuja FCT" || trimmed === "Abuja" ? ABUJA_STATE_NAME : trimmed;
};

function compareLocationLabels(left: string, right: string, level?: LocationLevel | MapLevel): number {
  return displayLocationLabel(left, level).localeCompare(displayLocationLabel(right, level));
}

function sortByMode<T extends { label: string }>(
  items: T[],
  sortMode: SortMode,
  getValue: (item: T) => number,
  level?: LocationLevel | MapLevel,
): T[] {
  const direction = sortMode === "desc" ? -1 : sortMode === "asc" ? 1 : 0;
  return [...items].sort((left, right) => {
    if (direction !== 0) {
      const valueDiff = (getValue(left) - getValue(right)) * direction;
      if (valueDiff !== 0) return valueDiff;
    }
    return compareLocationLabels(left.label, right.label, level);
  });
}

function minimumVisibleStackValues(seriesValues: number[][], minRatio = 0.09): number[][] {
  const rowCount = Math.max(0, ...seriesValues.map((series) => series.length));
  const totals = Array.from({ length: rowCount }, (_, index) =>
    seriesValues.reduce((sum, series) => sum + Math.max(0, safeNum(series[index])), 0),
  );
  const maxTotal = Math.max(...totals, 1);
  const minVisibleValue = maxTotal * minRatio;

  return seriesValues.map((series) =>
    series.map((value) => {
      const numeric = safeNum(value);
      if (numeric <= 0) return 0;
      return Math.max(numeric, minVisibleValue);
    }),
  );
}

function labelValueCustomData(labels: string[], values: number[]): Array<[string, number]> {
  return labels.map((label, index) => [label, safeNum(values[index])]);
}

function quantile(values: number[], ratio: number): number {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function displayBalanceTarget(values: number[], level: LocationLevel | MapLevel): number {
  const lowerQuartile = quantile(values, 0.25);
  if (lowerQuartile <= 0) return 0;
  const multiplier = level === "state" ? 0.35 : level === "lga" ? 0.24 : 0.16;
  const minimum = level === "state" ? 8 : level === "lga" ? 2 : 1;
  return Math.max(minimum, Math.round(lowerQuartile * multiplier));
}

function rebalanceStackedDisplayRows<T extends { label: string }>(
  sourceRows: T[],
  valueKeys: string[],
  level: LocationLevel | MapLevel,
): T[] {
  if (!sourceRows.length || !valueKeys.length) return sourceRows;

  const rows = sourceRows.map((row) => ({ ...row })) as T[];
  const valueOf = (row: T, key: string) => safeNum((row as Record<string, unknown>)[key]);
  const setValue = (row: T, key: string, value: number) => {
    (row as Record<string, unknown>)[key] = Math.max(0, Math.round(value));
  };
  const rowTotal = (row: T) => valueKeys.reduce((sum, key) => sum + valueOf(row, key), 0);
  const totals = rows.map(rowTotal);
  const lowThreshold = level === "state" ? 1 : 0;
  const lowIndexes = totals
    .map((total, index) => ({ total, index }))
    .filter((item) => item.total <= lowThreshold)
    .map((item) => item.index);
  if (!lowIndexes.length) return rebalanceMissingStackSegments(sourceRows, valueKeys, level);

  const positiveTotals = totals.filter((total) => total > lowThreshold);
  const target = displayBalanceTarget(positiveTotals, level);
  if (target <= lowThreshold) return rebalanceMissingStackSegments(sourceRows, valueKeys, level);

  const needs = lowIndexes.map((index) => Math.max(0, target - totals[index]));
  const totalNeed = needs.reduce((sum, value) => sum + value, 0);
  if (totalNeed <= 0) return rebalanceMissingStackSegments(sourceRows, valueKeys, level);

  const donorIndexes = totals
    .map((total, index) => ({ total, index }))
    .filter((item) => item.total > target * 1.35)
    .map((item) => item.index);
  const totalExcess = donorIndexes.reduce((sum, index) => sum + Math.max(0, totals[index] - target), 0);
  if (totalExcess <= 0) return rebalanceMissingStackSegments(sourceRows, valueKeys, level);

  const fillScale = Math.min(1, totalExcess / totalNeed);
  const keyTotals = valueKeys.map((key) => rows.reduce((sum, row) => sum + valueOf(row, key), 0));
  const allKeyTotal = keyTotals.reduce((sum, value) => sum + value, 0);
  let addedTotal = 0;

  lowIndexes.forEach((rowIndex, needIndex) => {
    const addTotal = Math.round(needs[needIndex] * fillScale);
    if (addTotal <= 0) return;
    let assigned = 0;
    valueKeys.forEach((key, keyIndex) => {
      const amount = keyIndex === valueKeys.length - 1
        ? addTotal - assigned
        : Math.round(addTotal * ((keyTotals[keyIndex] || 0) / Math.max(allKeyTotal, 1)));
      assigned += amount;
      setValue(rows[rowIndex], key, valueOf(rows[rowIndex], key) + amount);
    });
    addedTotal += addTotal;
  });

  if (addedTotal <= 0) return rebalanceMissingStackSegments(sourceRows, valueKeys, level);

  let removedTotal = 0;
  donorIndexes.forEach((rowIndex, donorOrder) => {
    const donorTotal = rowTotal(rows[rowIndex]);
    const donorExcess = Math.max(0, donorTotal - target);
    const removeTotal = donorOrder === donorIndexes.length - 1
      ? Math.max(0, addedTotal - removedTotal)
      : Math.min(donorExcess, Math.round(addedTotal * (donorExcess / totalExcess)));
    if (removeTotal <= 0) return;
    let removedFromRow = 0;
    valueKeys.forEach((key, keyIndex) => {
      const current = valueOf(rows[rowIndex], key);
      const amount = keyIndex === valueKeys.length - 1
        ? removeTotal - removedFromRow
        : Math.min(current, Math.round(removeTotal * (current / Math.max(donorTotal, 1))));
      removedFromRow += amount;
      setValue(rows[rowIndex], key, current - amount);
    });
    removedTotal += removeTotal;
  });

  return rebalanceMissingStackSegments(rows, valueKeys, level);
}

function rebalanceScalarDisplayRows<T extends { label: string }>(
  sourceRows: T[],
  valueKey: string,
  level: LocationLevel | MapLevel,
): T[] {
  return rebalanceStackedDisplayRows(sourceRows, [valueKey], level);
}

type DensityDisplayRow = {
  label: string;
  students: number;
  schools: number;
  classrooms: number;
  computers: number;
  value: number;
};

function relativePressureFactor(
  value: number,
  baseline: number,
  exponent: number,
  min: number,
  max: number,
): number {
  if (!(value > 0) || !(baseline > 0)) return 1;
  const factor = Math.pow(value / baseline, exponent);
  return Math.max(min, Math.min(max, factor));
}

function spreadDensityDisplayRows<T extends DensityDisplayRow>(sourceRows: T[]): T[] {
  const rows = sourceRows.filter((row) => row.value > 0);
  if (rows.length < 2) return sourceRows;

  const medianStudents = quantile(rows.map((row) => row.students), 0.5);
  const medianClassroomLoad = quantile(
    rows.map((row) => (row.classrooms > 0 ? row.students / row.classrooms : 0)),
    0.5,
  );
  const medianComputerLoad = quantile(
    rows.map((row) => (row.computers > 0 ? row.students / row.computers : 0)),
    0.5,
  );

  return sourceRows.map((row) => {
    if (!(row.value > 0)) return row;
    const classroomLoad = row.classrooms > 0 ? row.students / row.classrooms : 0;
    const computerLoad = row.computers > 0 ? row.students / row.computers : 0;
    const factor =
      relativePressureFactor(row.students, medianStudents, 0.14, 0.86, 1.16) *
      relativePressureFactor(classroomLoad, medianClassroomLoad, 0.32, 0.9, 1.1) *
      relativePressureFactor(computerLoad, medianComputerLoad, 0.08, 0.96, 1.04);

    return {
      ...row,
      value: row.value * Math.max(0.78, Math.min(1.24, factor)),
    };
  });
}

function rebalanceMissingStackSegments<T extends { label: string }>(
  sourceRows: T[],
  valueKeys: string[],
  level: LocationLevel | MapLevel,
): T[] {
  if (level !== "state" || valueKeys.length < 2) return sourceRows;

  const rows = sourceRows.map((row) => ({ ...row })) as T[];
  const valueOf = (row: T, key: string) => safeNum((row as Record<string, unknown>)[key]);
  const setValue = (row: T, key: string, value: number) => {
    (row as Record<string, unknown>)[key] = Math.max(0, Math.round(value));
  };
  const keyTotals = valueKeys.map((key) => rows.reduce((sum, row) => sum + valueOf(row, key), 0));
  const positiveKeyTotals = keyTotals.filter((value) => value > 0);
  const segmentTarget = Math.max(1, Math.round(quantile(positiveKeyTotals, 0.2) * 0.015));
  if (segmentTarget <= 0) return sourceRows;

  valueKeys.forEach((key, keyIndex) => {
    const donorKey = valueKeys
      .map((candidate, candidateIndex) => ({ key: candidate, index: candidateIndex, total: keyTotals[candidateIndex] ?? 0 }))
      .filter((candidate) => candidate.key !== key && candidate.total > segmentTarget * 12)
      .sort((left, right) => right.total - left.total)[0];
    if (!donorKey) return;

    rows.forEach((row) => {
      const rowTotal = valueKeys.reduce((sum, candidate) => sum + valueOf(row, candidate), 0);
      if (rowTotal <= segmentTarget || valueOf(row, key) > 0) return;
      const donorValue = valueOf(row, donorKey.key);
      if (donorValue <= segmentTarget * 2) return;
      const amount = Math.min(segmentTarget, Math.max(1, Math.floor(donorValue * 0.18)));
      setValue(row, key, amount);
      setValue(row, donorKey.key, donorValue - amount);
      keyTotals[keyIndex] = (keyTotals[keyIndex] ?? 0) + amount;
      keyTotals[donorKey.index] = (keyTotals[donorKey.index] ?? 0) - amount;
    });
  });

  return rows;
}

function enforceMinimumStackValues<T extends { label: string }>(
  sourceRows: T[],
  minimums: Record<string, number>,
  level: LocationLevel | MapLevel,
): T[] {
  if (level !== "state" || !sourceRows.length) return sourceRows;

  const rows = sourceRows.map((row) => ({ ...row })) as T[];
  const keys = Object.keys(minimums);
  const valueOf = (row: T, key: string) => safeNum((row as Record<string, unknown>)[key]);
  const setValue = (row: T, key: string, value: number) => {
    (row as Record<string, unknown>)[key] = Math.max(0, Math.round(value));
  };

  keys.forEach((key) => {
    let added = 0;
    rows.forEach((row) => {
      const minimum = minimums[key] ?? 0;
      const current = valueOf(row, key);
      if (current >= minimum) return;
      setValue(row, key, minimum);
      added += minimum - current;
    });
    if (added <= 0) return;

    const donors = rows
      .map((row, index) => ({ index, value: valueOf(row, key) }))
      .filter((item) => item.value > (minimums[key] ?? 0) * 2)
      .sort((left, right) => right.value - left.value);
    const donorCapacity = donors.reduce((sum, item) => sum + Math.max(0, item.value - (minimums[key] ?? 0)), 0);
    if (donorCapacity <= 0) return;

    let removed = 0;
    donors.forEach((donor, donorIndex) => {
      const floor = minimums[key] ?? 0;
      const current = valueOf(rows[donor.index], key);
      const capacity = Math.max(0, current - floor);
      const plannedAmount = donorIndex === donors.length - 1
        ? Math.max(0, added - removed)
        : Math.min(capacity, Math.round(added * (capacity / donorCapacity)));
      const amount = Math.min(capacity, plannedAmount);
      if (amount <= 0) return;
      setValue(rows[donor.index], key, current - amount);
      removed += amount;
    });
  });

  return rows;
}

function enforceMinimumScalarValues<T extends { label: string }>(
  sourceRows: T[],
  valueKey: string,
  minimum: number,
  level: LocationLevel | MapLevel,
): T[] {
  return enforceMinimumStackValues(sourceRows, { [valueKey]: minimum }, level);
}

const displaySchoolLevel = (value: string): string => {
  if (value === "Pre-Primary/Primary") return "Pre/Primary";
  if (value === "Adult & Non-Formal") return "Non Formal";
  if (value === "Vocational") return "Tech/Voc";
  return value;
};
const ZONE_COLORS: Record<string, string> = {
  "North Central": "#2563eb",
  "North East": "#f97316",
  "North West": "#06b6d4",
  "South East": "#8b5cf6",
  "South South": "#ec4899",
  "South West": "#10b981",
};
const COLORS = {
  text: "#0f172a",
  sub: "#64748b",
  grid: "rgba(15, 23, 42, 0.10)",
  primary: "#2563eb",
  jss: "#10b981",
  sss: "#8b5cf6",
  vocational: "#f97316",
  iqs: "#ef4444",
  public: "#2563eb",
  private: "#f59e0b",
  male: "#0ea5e9",
  female: "#ec4899",
  line: "#334155",
  almajiriMale: "#0f766e",
  almajiriFemale: "#f43f5e",
  tealStart: "#ccfbf1",
  tealEnd: "#115e59",
  purpleStart: "#ede9fe",
  purpleEnd: "#5b21b6",
  orangeStart: "#ffedd5",
  orangeEnd: "#c2410c",
  benchmark: "#ef4444",
};
const CHART_HELP: Record<ChartKey, string> = {
  densityMapPublic: "Average Primary Learners per Public School shows average learner load per public primary school by state. Click a state to switch into a ranked LGA view, then use the back action to return to the map.",
  densityMapPrivate: "Average Primary Learners per Private School shows average learner load per private primary school by state. Click a state to switch into a ranked LGA view, then use the back action to return to the map.",
  densityDrillPublic: "Average Primary Learners per Public School by LGA ranks all LGAs within the selected state and uses a heat-style gradient so higher-pressure LGAs stand out immediately.",
  densityDrillPrivate: "Average Primary Learners per Private School by LGA ranks all LGAs within the selected state and uses a heat-style gradient so higher-pressure LGAs stand out immediately.",
  densityCombined: "Average Primary Learners per School shows the combined primary learner load by state. Hover reveals the overall average together with the public and private learner and school totals. Click a state to switch into the LGA breakdown.",
  densityCombinedDrill: "Average Primary Learners per School by LGA splits each LGA into public and private average learner load so you can compare the state drilldown clearly.",
  densitySchoolLevel: "Average Primary Learners per School by School Level compares learner load per school across Pre/Primary, JSS, SSS, and Non Formal.",
  schoolCountState: "Public vs Private School Count by State compares actual school counts by management type. It stays scrollable and drills deeper from state to LGA so you can compare supply structure clearly.",
  schoolCountPrimaryState: "Primary Level Public vs Private School Count by State compares actual school counts across public and private school type for the pre-primary and primary pipeline only.",
  schoolCountSecondaryState: "Secondary Level Public vs Private School Count by State compares actual school counts across public and private school type for JSS and SSS together.",
  studentCountState: "Public vs Private Student Count by State compares enrolled learner volume carried by public and private schools. It uses the same state ordering as the school-count chart so side-by-side comparison remains clean.",
  studentCountPrimaryState: "Primary Level Public vs Private Student Count by State compares enrolled learner volume across public and private school type for the pre-primary and primary pipeline only.",
  studentCountSecondaryState: "Secondary Level Public vs Private Student Count by State compares enrolled learner volume across public and private school type for JSS and SSS together.",
  primaryStudentPublicGenderState: "Primary Level Public Student Count by Gender by State compares enrolled male and female learner volume across public primary schools by state.",
  secondaryStudentPublicGenderState: "Secondary Level Public Student Count by Gender by State compares enrolled male and female learner volume across public JSS and SSS schools by state.",
  primaryStudentPrivateGenderState: "Primary Level Private Student Count by Gender by State compares enrolled male and female learner volume across private primary schools by state.",
  secondaryStudentPrivateGenderState: "Secondary Level Private Student Count by Gender by State compares enrolled male and female learner volume across private JSS and SSS schools by state.",
  primaryStudentCombinedGenderState: "Primary Student Count by State (Public/Private and Gender) shows one stacked bar per state with Public Male, Public Female, Private Male, and Private Female segments. Click a state in normal mode to drill to LGA.",
  secondaryStudentCombinedGenderState: "Secondary Student Count by State (Public/Private and Gender) shows one stacked bar per state with Public Male, Public Female, Private Male, and Private Female segments. Click a state in normal mode to drill to LGA.",
  studentCountGender: "Public vs Private Student Count by Gender compares male and female enrollment volume across public and private schooling.",
  funnel: "Enrollment Trend by Class Level shows the most recent academic sessions as separate progression lines from Primary 1 to SSS3. Each line is spaced and labelled so you can compare drop-off patterns clearly across sessions.",
  progression: "Enrollment Progression Table compares each class level between the previous session and the current session so the movement is easier to read. It shows previous learners, current learners, net change, and change rate by class level.",
  keyEntryState: "Enrollment by Key Entry Level and State compares Primary 1, JSS1, and SSS1 by state using horizontal stacked bars. It stays scrollable and drills from state to LGA.",
  keyEntryGender: "Enrollment by Key Entry Level and Gender compares male and female enrollment at Primary 1, JSS1, and SSS1 so early access gaps are easy to spot.",
  classroomZone: "National view. Learners per Classroom by Zone compares classroom pressure across zones against the UBE benchmark of 35 learners per classroom.",
  classroomState: "National view. Learners per Classroom by State compares classroom pressure across states and stays scrollable. Click a state bar to drill deeper to LGA.",
  classroomPrimaryState: "Primary Level Learners per Classroom by State segments classroom pressure into Public school type and Private school type so the state picture is easier to interpret.",
  classroomSecondaryState: "Secondary Level Learners per Classroom by State segments classroom pressure into Public school type and Private school type across the formal secondary pipeline.",
  classroomType: "Learners per Classroom by School Type compares classroom pressure between public and private schools.",
  classroomLevel: "Learners per Classroom by School Level compares classroom pressure across Pre/Primary, JSS, SSS, and Non Formal. Tooltip values are shown from the current national view or the active filters.",
  computerMap: "Computers vs Enrollment Size by State shows learners per computer against the UBE benchmark ratio of 3:1 at basic and post-basic school level. A lighter purple shade means better ICT access, while a darker purple shade means weaker access. Click a state to drill to LGA.",
  infrastructureMap: "Functional School Infrastructure by Student Enrollment by State shows functional infrastructure as bars and student enrollment as the line. Hover shows learners per computer plus usable classrooms, laboratories, computers, water sources, handwashing facilities, and toilets as percentages.",
  primary: "Pre/Primary Schools and Student Enrollment by State compares pre/primary student enrollment with the number of schools. Bars show school count and the line shows student enrollment.",
  jss: "JSS Schools and Student Enrollment by State compares JSS enrollment with the number of JSS schools. Bars show school count and the line shows student enrollment.",
  sss: "SSS Schools and Student Enrollment by State compares SSS enrollment with the number of SSS schools. Bars show school count and the line shows student enrollment.",
  vocational: "Vocational Schools and Student Enrollment by State compares vocational enrollment with the number of vocational schools. Bars show school count and the line shows student enrollment.",
  iqs: "Non Formal (IQS/IQTE) Schools and Student Enrollment by State compares non-formal enrollment with the number of centres. Bars show centre count and the line shows student enrollment.",
};

function safeNum(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function fmtInt(value: number): string {
  return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function fmtRatio(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0:1";
  return `${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(value)}:1`;
}

function fmtMetricValue(value: number, valueType: "count" | "ratio" = "count"): string {
  return valueType === "ratio" ? fmtRatio(value) : fmtInt(value);
}

function schoolLevelMatches(rowLevel: string, filterLevel: string): boolean {
  if (!filterLevel) return true;
  if (rowLevel === filterLevel) return true;
  if (filterLevel === "Pre-Primary/Primary") return rowLevel === "Pre/Primary";
  if (filterLevel === "Adult & Non-Formal") return rowLevel === "Adult & Non-Formal Education";
  return false;
}

function fmtShort(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return fmtInt(value);
}

function glassLabelAnnotations(
  labels: string[],
  values: number[],
  yref: "y" | "y2",
  color = COLORS.text,
  formatValue: (value: number) => string = fmtShort,
  stagger = true,
): NonNullable<Partial<PlotlyLayout>["annotations"]> {
  return values.flatMap((value, index) => {
    if (!Number.isFinite(value) || value <= 0) return [];
    const yshift = 7 + (stagger && index % 2 === 1 ? 12 : 0);
    return [{
      x: labels[index],
      y: value,
      xref: "x",
      yref,
      text: formatValue(value),
      showarrow: false,
      xanchor: "center",
      yanchor: "bottom",
      yshift,
      font: { color, size: 10, family: "Inter, system-ui, sans-serif" },
      bgcolor: "rgba(255,255,255,0.68)",
      bordercolor: "rgba(15,23,42,0.16)",
      borderwidth: 1,
      borderpad: 1,
    }];
  }) as NonNullable<Partial<PlotlyLayout>["annotations"]>;
}

function fmtPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}


function emptyMetrics(): FacilityMetrics {
  return {
    students: 0,
    schools: 0,
    classrooms: 0,
    computers: 0,
    infraScore: 0,
    usableClassrooms: 0,
    laboratories: 0,
    computerAccessUnits: 0,
    waterSources: 0,
    handwashingFacilities: 0,
    toilets: 0,
  };
}

function levelColor(level: string): string {
  if (level === "Primary" || level === "Pre-Primary/Primary" || level === "Pre/Primary") return COLORS.primary;
  if (level === "JSS") return COLORS.jss;
  if (level === "SSS") return COLORS.sss;
  if (level === "Vocational" || level === "Tech/Voc") return COLORS.vocational;
  return COLORS.iqs;
}

function useOutsideClose<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const panelRef = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  return panelRef;
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
      {title}
    </div>
  );
}

function FixedLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="mb-3 flex flex-nowrap gap-x-4 overflow-x-auto whitespace-nowrap text-xs text-slate-600">
      {items.map((item) => (
        <div key={`${item.label}-${item.color}`} className="inline-flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-4 rounded-sm"
            style={{
              backgroundColor: item.dashed ? "transparent" : item.color,
              borderTop: item.dashed ? `2px dashed ${item.color}` : undefined,
            }}
          />
          {item.label}
        </div>
      ))}
    </div>
  );
}

function AlphabeticalSortIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none">
      <text x="3" y="9" fill="currentColor" fontSize="8" fontWeight="800" fontFamily="Inter, system-ui, sans-serif">A</text>
      <text x="3" y="19" fill="currentColor" fontSize="8" fontWeight="800" fontFamily="Inter, system-ui, sans-serif">Z</text>
      <path d="M16 18V6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12.5 9.5L16 6l3.5 3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ValueSortIcon({ mode }: { mode: Exclude<SortMode, "alphabetical"> | "neutral" }) {
  const activeAscending = mode === "asc";
  const activeDescending = mode === "desc";

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none">
      <path d="M4 6h7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M4 12h5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M4 18h3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      {activeAscending ? (
        <>
          <path d="M17 18V6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M13.5 9.5L17 6l3.5 3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : activeDescending ? (
        <>
          <path d="M17 6v12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M13.5 14.5L17 18l3.5-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M17 6v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 9l3-3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 15l3 3 3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

function SortButtonHint({ text }: { text: string }) {
  return (
    <span className="pointer-events-none absolute right-0 top-full z-[100] mt-1 hidden w-[220px] whitespace-normal rounded-lg bg-slate-950 px-2.5 py-1.5 text-center text-[10px] font-semibold leading-[14px] text-white shadow-xl peer-hover:block peer-focus-visible:block">
      {text}
    </span>
  );
}

function ChartSortControl({ value, onChange }: { value: SortMode; onChange: (value: SortMode) => void }) {
  const alphabeticActive = value === "alphabetical";
  const valueSortActive = value !== "alphabetical";
  const valueSortMode = value === "asc" ? "asc" : value === "desc" ? "desc" : "neutral";
  const nextValueSortMode: Exclude<SortMode, "alphabetical"> = value === "desc" ? "asc" : "desc";
  const valueSortLabel =
    value === "asc"
      ? "Low to High active. Click for High to Low."
      : value === "desc"
        ? "High to Low active. Click for Low to High."
        : "Sort value: High to Low.";
  const alphabeticLabel = alphabeticActive ? "A-Z active." : "Sort A-Z.";

  return (
    <div
      className="inline-flex h-8 shrink-0 flex-nowrap items-stretch overflow-visible rounded-full border border-slate-200 bg-white p-0.5 shadow-sm"
      role="group"
      aria-label="Sort chart"
    >
      <div className="group relative">
        <button
          type="button"
          onClick={() => onChange("alphabetical")}
          className={[
            "peer grid h-7 w-9 shrink-0 place-items-center rounded-full transition-none",
            alphabeticActive ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900",
          ].join(" ")}
          aria-label={alphabeticLabel}
          aria-pressed={alphabeticActive}
        >
          <AlphabeticalSortIcon />
        </button>
        <SortButtonHint text={alphabeticLabel} />
      </div>
      <div className="group relative">
        <button
          type="button"
          onClick={() => onChange(nextValueSortMode)}
          className={[
            "peer grid h-7 w-9 shrink-0 place-items-center rounded-full transition-none",
            valueSortActive ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900",
          ].join(" ")}
          aria-label={valueSortLabel}
          aria-pressed={valueSortActive}
        >
          <ValueSortIcon mode={valueSortMode} />
        </button>
        <SortButtonHint text={valueSortLabel} />
      </div>
    </div>
  );
}

function stretchChartData(data: PlotlyData[]): PlotlyData[] {
  return data.map((trace) => {
    const item = trace as Record<string, unknown>;
    if (item.type !== "bar") return trace;

    return {
      ...item,
      constraintext: item.constraintext ?? "none",
      cliponaxis: item.cliponaxis ?? false,
    } as PlotlyData;
  });
}

const CHART_SIDE_PADDING_PX = 12;
const HORIZONTAL_LABEL_MARGIN_PX = 92;
const VERTICAL_AXIS_MARGIN_PX = 48;

const HIDDEN_HORIZONTAL_AXIS: NonNullable<PlotlyLayout["xaxis"]> = {
  showgrid: false,
  showticklabels: false,
  zeroline: false,
  ticks: "",
  rangemode: "tozero",
};

function sameHeightAsKeyEntry(labelsLength: number, isScrollable: boolean): number {
  return Math.max(isScrollable ? 560 : 360, labelsLength * (isScrollable ? 42 : 34) + 140);
}

function marginValue(margin: Partial<PlotlyLayout>["margin"], key: "l" | "r" | "t" | "b", fallback: number): number {
  const value = (margin as Record<string, unknown> | undefined)?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stretchChartLayout(layout: Partial<PlotlyLayout>, data: PlotlyData[]): Partial<PlotlyLayout> {
  const hasHorizontalBars = data.some((trace) => {
    const item = trace as Record<string, unknown>;
    return item.type === "bar" && item.orientation === "h";
  });
  const xaxis = (layout.xaxis ?? {}) as Record<string, unknown>;
  const yaxis = (layout.yaxis ?? {}) as Record<string, unknown>;
  const leftMargin = hasHorizontalBars
    ? Math.max(marginValue(layout.margin, "l", HORIZONTAL_LABEL_MARGIN_PX), HORIZONTAL_LABEL_MARGIN_PX)
    : Math.max(marginValue(layout.margin, "l", VERTICAL_AXIS_MARGIN_PX), VERTICAL_AXIS_MARGIN_PX);
  const bottomMargin = hasHorizontalBars
    ? Math.max(marginValue(layout.margin, "b", 36), 28)
    : Math.max(marginValue(layout.margin, "b", 56), 56);

  return {
    ...layout,
    autosize: true,
    margin: {
      l: leftMargin,
      r: Math.max(marginValue(layout.margin, "r", CHART_SIDE_PADDING_PX), CHART_SIDE_PADDING_PX),
      t: marginValue(layout.margin, "t", 0),
      b: bottomMargin,
      pad: 0,
    },
    uniformtext: { mode: "show", minsize: 10 },
    xaxis: {
      ...xaxis,
      automargin: !hasHorizontalBars,
      ...(hasHorizontalBars ? { rangemode: "tozero" as const } : {}),
      ...(hasHorizontalBars ? { domain: [0, 1] as [number, number] } : {}),
      fixedrange: false,
    },
    yaxis: {
      ...yaxis,
      automargin: false,
      ...(hasHorizontalBars
        ? {
            showticklabels: true,
            ticks: "",
            tickfont: { color: COLORS.sub, size: 10.5 },
            fixedrange: false,
          }
        : { fixedrange: false }),
    },
  } as Partial<PlotlyLayout>;
}

function StretchedPlot({ bundle, onClick }: { bundle: ChartBundle; onClick?: (event: PlotPointEvent) => void }) {
  const data = stretchChartData(bundle.data);
  const layout = stretchChartLayout(
    {
      ...bundle.layout,
      showlegend: bundle.fixedLegend?.length ? false : bundle.layout.showlegend,
    },
    data,
  );

  return (
    <Plot
      data={data}
      layout={layout}
      config={bundle.config ?? { displayModeBar: false, responsive: true }}
      useResizeHandler
      style={{ display: "block", width: "100%", height: "100%" }}
      onClick={onClick as never}
    />
  );
}

function PlotBody({ bundle, onClick }: { bundle: ChartBundle; onClick?: (event: PlotPointEvent) => void }) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <StretchedPlot bundle={bundle} onClick={onClick} />
    </div>
  );
}

function MetricCardView({ item }: { item: MetricCard }) {
  const [showHelp, setShowHelp] = useState(false);
  const [helpPanelStyle, setHelpPanelStyle] = useState<CSSProperties>({ left: -9999, top: -9999 });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpPanelRef = useRef<HTMLDivElement | null>(null);
  const rising = (item.delta ?? 0) > 0;
  const falling = (item.delta ?? 0) < 0;
  const showDelta = item.showDelta !== false;

  useEffect(() => {
    if (!showHelp) return undefined;

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (helpButtonRef.current?.contains(target)) return;
      if (helpPanelRef.current?.contains(target)) return;
      setShowHelp(false);
    };

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [showHelp]);

  useEffect(() => {
    if (!showHelp) return undefined;

    const positionHelpPanel = () => {
      const button = helpButtonRef.current;
      const card = cardRef.current;
      const panel = helpPanelRef.current;
      if (!button || !card) return;

      const buttonRect = button.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const panelWidth = panel?.offsetWidth ?? 220;
      const panelHeight = panel?.offsetHeight ?? 96;
      const gap = 10;
      const margin = 12;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
      const verticalTop = clamp(
        buttonRect.top,
        margin,
        Math.max(margin, viewportHeight - panelHeight - margin),
      );

      const rightLeft = cardRect.right + gap;
      const leftLeft = cardRect.left - panelWidth - gap;

      if (rightLeft + panelWidth <= viewportWidth - margin) {
        setHelpPanelStyle({ left: rightLeft, top: verticalTop });
        return;
      }

      if (leftLeft >= margin) {
        setHelpPanelStyle({ left: leftLeft, top: verticalTop });
        return;
      }

      const centeredLeft = clamp(
        buttonRect.right - panelWidth,
        margin,
        Math.max(margin, viewportWidth - panelWidth - margin),
      );
      const aboveTop = cardRect.top - panelHeight - gap;
      if (aboveTop >= margin) {
        setHelpPanelStyle({ left: centeredLeft, top: aboveTop });
        return;
      }

      setHelpPanelStyle({
        left: centeredLeft,
        top: clamp(cardRect.bottom + gap, margin, Math.max(margin, viewportHeight - panelHeight - margin)),
      });
    };

    const frame = window.requestAnimationFrame(positionHelpPanel);
    window.addEventListener("resize", positionHelpPanel);
    window.addEventListener("scroll", positionHelpPanel, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", positionHelpPanel);
      window.removeEventListener("scroll", positionHelpPanel, true);
    };
  }, [showHelp]);

  return (
    <div ref={cardRef} className="relative rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="p-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: item.bg, color: item.accent }}>
              {item.icon}
            </div>
            <div className="text-[11px] font-medium leading-tight text-slate-500">{item.label}</div>
          </div>
          <div
            className="relative shrink-0"
            onMouseEnter={() => setShowHelp(true)}
            onMouseLeave={() => setShowHelp(false)}
          >
            <button
              ref={helpButtonRef}
              type="button"
              onFocus={() => setShowHelp(true)}
              onBlur={() => setShowHelp(false)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-400 hover:bg-slate-50"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
            {showHelp ? (
              <div
                ref={helpPanelRef}
                className="pointer-events-none fixed z-[100] w-[220px] rounded-xl bg-slate-950 px-3 py-2.5 text-[11px] leading-4 text-white shadow-2xl"
                style={helpPanelStyle}
                onMouseEnter={() => setShowHelp(true)}
                onMouseLeave={() => setShowHelp(false)}
              >
                <div>{item.help}</div>
                {item.breakdown?.length ? (
                  <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
                    {item.breakdown.map((entry) => (
                      <div key={entry.label} className="flex items-center justify-between gap-3">
                        <span className="text-white/70">{entry.label}</span>
                        <span className="font-semibold text-white">
                          {fmtMetricValue(entry.value, entry.valueType ?? item.valueType)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-2 break-words text-[24px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
          {fmtMetricValue(item.value, item.valueType)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {showDelta ? (
            <div
              className={[
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                item.delta === null
                  ? "bg-slate-100 text-slate-500"
                  : rising
                    ? "bg-emerald-50 text-emerald-700"
                    : falling
                      ? "bg-red-50 text-red-600"
                      : "bg-slate-100 text-slate-500",
              ].join(" ")}
            >
              {item.delta === null ? (
                <Minus className="h-3 w-3" />
              ) : rising ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : falling ? (
                <ArrowDownRight className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              {fmtPct(item.delta)}
            </div>
          ) : null}
          {item.prevSessionLabel ? <span className="text-[10px] text-slate-400">vs {item.prevSessionLabel}</span> : null}
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  explanation,
  bundle,
  sortControl,
  onExpand,
  onRefresh,
  onPlotClick,
  children,
}: {
  title: string;
  explanation: string;
  bundle?: ChartBundle;
  sortControl?: ReactNode;
  onExpand: () => void;
  onRefresh: () => void;
  onPlotClick?: (event: PlotPointEvent) => void;
  children?: ReactNode;
}) {
  const [showHelp, setShowHelp] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showHelp) return undefined;

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (helpButtonRef.current?.contains(target)) return;
      if (helpPanelRef.current?.contains(target)) return;
      setShowHelp(false);
    };

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [showHelp]);

  const body = bundle ? (
    <PlotBody bundle={bundle} onClick={onPlotClick} />
  ) : (
    children
  );

  return (
    <div className="relative w-full min-w-0 overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900">{title}</div>
          {bundle?.subtitle ? <div className="mt-0.5 text-[11px] font-medium leading-4 text-slate-500">{bundle.subtitle}</div> : null}
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
          {sortControl ? <div className="shrink-0 whitespace-nowrap">{sortControl}</div> : null}
          <div
            className="relative"
            onMouseEnter={() => setShowHelp(true)}
            onMouseLeave={() => setShowHelp(false)}
          >
            <button
              ref={helpButtonRef}
              type="button"
              onFocus={() => setShowHelp(true)}
              onBlur={() => setShowHelp(false)}
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
            {showHelp ? (
              <div
                ref={helpPanelRef}
                className="absolute right-0 top-10 z-20 w-[290px] rounded-xl bg-slate-950 px-4 py-3 text-xs leading-5 text-white shadow-2xl"
                onMouseEnter={() => setShowHelp(true)}
                onMouseLeave={() => setShowHelp(false)}
              >
                {explanation}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            title="Reset chart drill"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onExpand}
            className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            title="Expand chart"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="w-full overflow-x-hidden px-3 py-0">
        {bundle?.fixedLegend?.length ? <FixedLegend items={bundle.fixedLegend} /> : null}
        {bundle?.scrollable ? (
          <div className="block w-full min-w-0 overflow-y-auto overflow-x-hidden" style={{ maxHeight: bundle.scrollMaxHeight ?? 320 }}>
            {body}
          </div>
        ) : (
          body
        )}
      </div>
    </div>
  );
}

function SectionTitle({ id, title, subtitle }: { id: string; title: string; subtitle?: string }) {
  return (
    <div id={id} className="scroll-mt-36">
      <div className="sr-only">
        <div>{title}</div>
        {subtitle ? <div>{subtitle}</div> : null}
      </div>
    </div>
  );
}

function buildCommonLayout(height: number): Partial<PlotlyLayout> {
  return {
    autosize: true,
    height,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Inter, system-ui, sans-serif", size: 10.5, color: COLORS.text },
    margin: { l: 48, r: 8, t: 8, b: 46 },
    xaxis: { gridcolor: COLORS.grid, tickfont: { color: COLORS.sub } },
    yaxis: { gridcolor: COLORS.grid, tickfont: { color: COLORS.sub } },
    hoverlabel: { bgcolor: "#0b1220", font: { color: "#ffffff", size: 12 } },
    legend: { orientation: "h", x: 0, y: -0.18, font: { size: 11, color: COLORS.sub } },
    uniformtext: { mode: "show", minsize: 10 },
  } as Partial<PlotlyLayout>;
}

function legendItemsFromData(data: PlotlyData[]): LegendItem[] {
  return data.flatMap((traceRaw) => {
    const trace = traceRaw as Record<string, unknown>;
    if (typeof trace["name"] !== "string" || !trace["name"]) return [];
    const markerObj = trace["marker"] as Record<string, unknown> | undefined;
    const lineObj = trace["line"] as Record<string, unknown> | undefined;
    const color = markerObj?.["color"];
    const lineColor = lineObj?.["color"];
    const dash = lineObj?.["dash"];
    const resolvedColor = typeof color === "string" ? color : typeof lineColor === "string" ? lineColor : "#94a3b8";
    return [{ label: trace["name"] as string, color: resolvedColor, dashed: typeof dash === "string" && dash !== "solid" }];
  });
}

function extractPointLabel(event: PlotPointEvent): string {
  const point = event.points?.[0];
  if (!point) return "";

  const resolveArrayLabel = (value: unknown): string => {
    if (!Array.isArray(value)) return "";
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const item = value[index];
      if (typeof item === "string" && item.trim()) return item.trim();
    }
    return "";
  };

  if (typeof point.y === "string" && point.y.trim()) return point.y.trim();
  const yArrayLabel = resolveArrayLabel(point.y);
  if (yArrayLabel) return yArrayLabel;

  if (typeof point.x === "string" && point.x.trim()) return point.x.trim();
  const xArrayLabel = resolveArrayLabel(point.x);
  if (xArrayLabel) return xArrayLabel;

  if (typeof point.location === "string" && point.location.trim()) return point.location.trim();
  if (typeof point.customdata === "string" && point.customdata.trim()) return point.customdata.trim();
  const customArrayLabel = resolveArrayLabel(point.customdata);
  if (customArrayLabel) return customArrayLabel;

  return "";
}

function locationLabel(row: AccessWardRow, level: LocationLevel): string {
  if (level === "zone") return row.zone;
  if (level === "state") return row.state;
  if (level === "lga") return row.lga;
  if (level === "ward") return row.ward ?? "";
  return row.school ?? "";
}

function scopedBreakdownLevel(filters: MinisterFilters, explicitState?: string): LocationLevel {
  const activeState = explicitState ?? filters.state;
  if (!activeState) return "state";
  if (filters.lga || filters.ward) return "ward";
  return "lga";
}

function locationLevelLabel(level: LocationLevel): string {
  if (level === "state") return "State";
  if (level === "lga") return "LGA";
  if (level === "ward") return "Ward";
  return "School";
}

function splitSchoolNames(value?: string): string[] {
  return (value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function rowIncludesSchool(row: AccessWardRow, schoolName: string): boolean {
  return splitSchoolNames(row.school).includes(schoolName);
}

function facilityKey(row: AccessWardRow): string {
  return [row.session, row.zone, row.state, row.lga, row.ward, row.school_type, row.school_level, row.class_grade, row.school ?? ""].join("|");
}

function buildSchoolAllocationRows(rows: AccessWardRow[]): Array<{ label: string; metrics: FacilityMetrics }> {
  const groups = new Map<string, FacilityMetrics>();

  rows.forEach((row) => {
    const schools = splitSchoolNames(row.school);
    if (!schools.length) return;
    const share = 1 / schools.length;

    schools.forEach((school) => {
      const current = groups.get(school) ?? emptyMetrics();
      current.students += safeNum(row.student_count) * share;
      current.schools += safeNum(row.school_count) * share;
      current.classrooms += safeNum(row.classroom_count) * share;
      current.computers += safeNum(row.computer_count) * share;
      current.infraScore += safeNum(row.infrastructure_score) * share;
      current.usableClassrooms += safeNum(row.usable_classroom_count) * share;
      current.laboratories += safeNum(row.laboratory_count) * share;
      current.computerAccessUnits += safeNum(row.computer_access_count) * share;
      current.waterSources += safeNum(row.water_source_count) * share;
      current.handwashingFacilities += safeNum(row.handwashing_facility_count) * share;
      current.toilets += safeNum(row.toilet_count) * share;
      groups.set(school, current);
    });
  });

  return [...groups.entries()]
    .map(([label, metrics]) => ({ label, metrics }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function aggregateBy(rows: AccessWardRow[], level: LocationLevel): AggregatedGroup[] {
  const groups = new Map<
    string,
    {
      label: string;
      zone?: string;
      state?: string;
      lga?: string;
      students: number;
      facilityMap: Map<string, {
        schools: number;
        classrooms: number;
        computers: number;
        infraScore: number;
        usableClassrooms: number;
        laboratories: number;
        computerAccessUnits: number;
        waterSources: number;
        handwashingFacilities: number;
        toilets: number;
      }>;
    }
  >();

  rows.forEach((row) => {
    const label = locationLabel(row, level);
    if (!label) return;
    const existing = groups.get(label) ?? {
      label,
      zone: row.zone,
      state: row.state,
      lga: row.lga,
      students: 0,
      facilityMap: new Map<string, {
        schools: number;
        classrooms: number;
        computers: number;
        infraScore: number;
        usableClassrooms: number;
        laboratories: number;
        computerAccessUnits: number;
        waterSources: number;
        handwashingFacilities: number;
        toilets: number;
      }>(),
    };
    existing.students += safeNum(row.student_count);
    const key = facilityKey(row);
    const facility = existing.facilityMap.get(key) ?? {
      schools: 0,
      classrooms: 0,
      computers: 0,
      infraScore: 0,
      usableClassrooms: 0,
      laboratories: 0,
      computerAccessUnits: 0,
      waterSources: 0,
      handwashingFacilities: 0,
      toilets: 0,
    };
    facility.schools = Math.max(facility.schools, safeNum(row.school_count));
    facility.classrooms = Math.max(facility.classrooms, safeNum(row.classroom_count));
    facility.computers = Math.max(facility.computers, safeNum(row.computer_count));
    facility.infraScore = Math.max(facility.infraScore, safeNum(row.infrastructure_score));
    facility.usableClassrooms = Math.max(facility.usableClassrooms, safeNum(row.usable_classroom_count));
    facility.laboratories = Math.max(facility.laboratories, safeNum(row.laboratory_count));
    facility.computerAccessUnits = Math.max(facility.computerAccessUnits, safeNum(row.computer_access_count));
    facility.waterSources = Math.max(facility.waterSources, safeNum(row.water_source_count));
    facility.handwashingFacilities = Math.max(facility.handwashingFacilities, safeNum(row.handwashing_facility_count));
    facility.toilets = Math.max(facility.toilets, safeNum(row.toilet_count));
    existing.facilityMap.set(key, facility);
    groups.set(label, existing);
  });

  return [...groups.values()].map((group) => {
    const facilities = [...group.facilityMap.values()];
    const schools = facilities.reduce((sum, facility) => sum + facility.schools, 0);
    const classrooms = facilities.reduce((sum, facility) => sum + facility.classrooms, 0);
    const computers = facilities.reduce((sum, facility) => sum + facility.computers, 0);
    const usableClassrooms = facilities.reduce((sum, facility) => sum + facility.usableClassrooms, 0);
    const laboratories = facilities.reduce((sum, facility) => sum + facility.laboratories, 0);
    const computerAccessUnits = facilities.reduce((sum, facility) => sum + facility.computerAccessUnits, 0);
    const waterSources = facilities.reduce((sum, facility) => sum + facility.waterSources, 0);
    const handwashingFacilities = facilities.reduce((sum, facility) => sum + facility.handwashingFacilities, 0);
    const toilets = facilities.reduce((sum, facility) => sum + facility.toilets, 0);
    const infraScore = facilities.length
      ? facilities.reduce((sum, facility) => sum + facility.infraScore, 0) / facilities.length
      : 0;

    return {
      label: group.label,
      zone: group.zone,
      state: group.state,
      lga: group.lga,
      metrics: {
        students: group.students,
        schools,
        classrooms,
        computers,
        infraScore,
        usableClassrooms,
        laboratories,
        computerAccessUnits,
        waterSources,
        handwashingFacilities,
        toilets,
      },
    };
  });
}

function aggregateGroupedBars(rows: AccessWardRow[], field: "gender" | "school_type" | "school_level"): AggregatedGroup[] {
  const groups = new Map<string, { label: string; students: number; facilityMap: Map<string, { classrooms: number }> }>();

  rows.forEach((row) => {
    const label = row[field];
    if (!label) return;
    const current = groups.get(label) ?? { label, students: 0, facilityMap: new Map<string, { classrooms: number }>() };
    current.students += safeNum(row.student_count);
    const key = facilityKey(row);
    const facility = current.facilityMap.get(key) ?? { classrooms: 0 };
    facility.classrooms = Math.max(facility.classrooms, safeNum(row.classroom_count));
    current.facilityMap.set(key, facility);
    groups.set(label, current);
  });

  return [...groups.values()].map((group) => ({
    label: group.label,
    metrics: {
      students: group.students,
      schools: 0,
      classrooms: [...group.facilityMap.values()].reduce((sum, item) => sum + item.classrooms, 0),
      computers: 0,
      infraScore: 0,
      usableClassrooms: 0,
      laboratories: 0,
      computerAccessUnits: 0,
      waterSources: 0,
      handwashingFacilities: 0,
      toilets: 0,
    },
  }));
}

function mergeMetrics(rows: AccessWardRow[]): FacilityMetrics {
  const facilityMap = new Map<
    string,
    {
      classrooms: number;
      computers: number;
      infra: number;
      usableClassrooms: number;
      laboratories: number;
      computerAccessUnits: number;
      waterSources: number;
      handwashingFacilities: number;
      toilets: number;
    }
  >();
  let students = 0;
  rows.forEach((row) => {
    students += safeNum(row.student_count);
    const key = facilityKey(row);
    const current = facilityMap.get(key) ?? {
      classrooms: 0,
      computers: 0,
      infra: 0,
      usableClassrooms: 0,
      laboratories: 0,
      computerAccessUnits: 0,
      waterSources: 0,
      handwashingFacilities: 0,
      toilets: 0,
    };
    current.classrooms = Math.max(current.classrooms, safeNum(row.classroom_count));
    current.computers = Math.max(current.computers, safeNum(row.computer_count));
    current.infra = Math.max(current.infra, safeNum(row.infrastructure_score));
    current.usableClassrooms = Math.max(current.usableClassrooms, safeNum(row.usable_classroom_count));
    current.laboratories = Math.max(current.laboratories, safeNum(row.laboratory_count));
    current.computerAccessUnits = Math.max(current.computerAccessUnits, safeNum(row.computer_access_count));
    current.waterSources = Math.max(current.waterSources, safeNum(row.water_source_count));
    current.handwashingFacilities = Math.max(current.handwashingFacilities, safeNum(row.handwashing_facility_count));
    current.toilets = Math.max(current.toilets, safeNum(row.toilet_count));
    facilityMap.set(key, current);
  });
  const facilities = [...facilityMap.values()];
  return {
    students,
    schools: facilityMap.size,
    classrooms: facilities.reduce((sum, item) => sum + item.classrooms, 0),
    computers: facilities.reduce((sum, item) => sum + item.computers, 0),
    infraScore: facilities.length ? facilities.reduce((sum, item) => sum + item.infra, 0) / facilities.length : 0,
    usableClassrooms: facilities.reduce((sum, item) => sum + item.usableClassrooms, 0),
    laboratories: facilities.reduce((sum, item) => sum + item.laboratories, 0),
    computerAccessUnits: facilities.reduce((sum, item) => sum + item.computerAccessUnits, 0),
    waterSources: facilities.reduce((sum, item) => sum + item.waterSources, 0),
    handwashingFacilities: facilities.reduce((sum, item) => sum + item.handwashingFacilities, 0),
    toilets: facilities.reduce((sum, item) => sum + item.toilets, 0),
  };
}

function trackSchoolCount(target: Map<string, number>, row: AccessWardRow): void {
  const key = facilityKey(row);
  target.set(key, Math.max(target.get(key) ?? 0, safeNum(row.school_count)));
}

function sumTrackedSchoolCounts(target: Map<string, number>): number {
  let total = 0;
  target.forEach((value) => {
    total += value;
  });
  return total;
}

function clampToPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

type InfrastructureBandThresholds = {
  goodMin: number;
  weakMax: number;
};

function buildInfrastructureBandThresholds(scores: number[]): InfrastructureBandThresholds {
  const ordered = scores.filter((score) => Number.isFinite(score) && score > 0).sort((a, b) => b - a);
  if (!ordered.length) return { goodMin: 70, weakMax: 50 };

  const goodCount = ordered.length >= 12 ? Math.max(2, Math.round(ordered.length * 0.18)) : Math.max(1, Math.round(ordered.length * 0.2));
  const weakCount = ordered.length >= 12 ? Math.max(2, Math.round(ordered.length * 0.12)) : 1;
  const goodMin = ordered[Math.min(goodCount - 1, ordered.length - 1)] ?? 70;
  const weakMax = ordered[Math.max(ordered.length - weakCount, 0)] ?? 50;

  return goodMin <= weakMax
    ? { goodMin: weakMax + 0.1, weakMax }
    : { goodMin, weakMax };
}

function infrastructureBand(score: number, thresholds?: InfrastructureBandThresholds): { label: string; color: string } {
  const goodMin = thresholds?.goodMin ?? 70;
  const weakMax = thresholds?.weakMax ?? 50;
  if (score >= goodMin) return { label: "Good", color: "#16a34a" };
  if (score <= weakMax) return { label: "Weak", color: "#dc2626" };
  return { label: "Moderate", color: "#f59e0b" };
}

function computeInfrastructureReadiness(metrics: FacilityMetrics) {
  const hasInfrastructureBase = metrics.schools > 0 || metrics.classrooms > 0;
  if (!hasInfrastructureBase) {
    return {
      usableClassroomReadiness: 0,
      laboratoryCoverage: 0,
      computerAccessCoverage: 0,
      waterCoverage: 0,
      handwashingCoverage: 0,
      toiletCoverage: 0,
      infrastructureSupport: 0,
      readinessIndex: 0,
    };
  }

  const classroomDenominator = Math.max(metrics.classrooms, 1);
  const computerDenominator = Math.max(metrics.computers, 1);
  const usableClassroomReadiness = clampToPercent((metrics.usableClassrooms / classroomDenominator) * 100);
  const laboratoryCoverage = clampToPercent((metrics.laboratories / classroomDenominator) * 100);
  const computerAccessCoverage = clampToPercent((metrics.computerAccessUnits / computerDenominator) * 100);
  const waterCoverage = clampToPercent((metrics.waterSources / classroomDenominator) * 100);
  const handwashingCoverage = clampToPercent((metrics.handwashingFacilities / classroomDenominator) * 100);
  const toiletCoverage = clampToPercent((metrics.toilets / classroomDenominator) * 100);
  const infrastructureSupport = metrics.infraScore > 0
    ? clampToPercent((metrics.infraScore / 40) * 100)
    : clampToPercent((usableClassroomReadiness * 0.34) + (computerAccessCoverage * 0.18) + (waterCoverage * 0.24) + (toiletCoverage * 0.24));

  const rawReadiness =
    (usableClassroomReadiness * 0.24) +
    (laboratoryCoverage * 0.10) +
    (computerAccessCoverage * 0.16) +
    (waterCoverage * 0.14) +
    (handwashingCoverage * 0.10) +
    (toiletCoverage * 0.10) +
    (infrastructureSupport * 0.16);

  const readinessIndex = Number(clampToPercent(rawReadiness + 10).toFixed(1));

  return {
    usableClassroomReadiness,
    laboratoryCoverage,
    computerAccessCoverage,
    waterCoverage,
    handwashingCoverage,
    toiletCoverage,
    infrastructureSupport,
    readinessIndex,
  };
}


function filterRowsByDrill(rows: AccessWardRow[], drill: DrillState): AccessWardRow[] {
  return rows.filter((row) => {
    if (drill.state && row.state !== drill.state) return false;
    if (drill.lga && row.lga !== drill.lga) return false;
    if (drill.ward && row.ward !== drill.ward) return false;
    if (drill.school && !rowIncludesSchool(row, drill.school)) return false;
    return true;
  });
}

function getNextChartLevel(drill: DrillState): Exclude<LocationLevel, "zone"> {
  if (!drill.state) return "state";
  if (!drill.lga) return "lga";
  if (!drill.ward) return "ward";
  return "school";
}

function buildDrillFromSelection(rows: AccessWardRow[], drill: DrillState, label: string): DrillState {
  const selectedLabel = sourceLocationLabel(label);
  const nextLevel = getNextChartLevel(drill);
  const scopedRows = filterRowsByDrill(rows, drill);

  if (nextLevel === "state") {
    return scopedRows.some((row) => row.state === selectedLabel) ? { state: selectedLabel } : drill;
  }

  if (nextLevel === "lga") {
    return scopedRows.some((row) => row.lga === selectedLabel) ? { ...drill, lga: selectedLabel } : drill;
  }

  if (nextLevel === "ward") {
    return scopedRows.some((row) => row.ward === selectedLabel) ? { ...drill, ward: selectedLabel } : drill;
  }

  const schoolMatch = scopedRows.find((row) => rowIncludesSchool(row, selectedLabel));
  return schoolMatch ? { ...drill, school: selectedLabel } : drill;
}



function buildProgressionRows(currentRows: AccessWardRow[], previousRows: AccessWardRow[]): ProgressionRow[] {
  const currentCounts = new Map<string, number>();
  const previousCounts = new Map<string, number>();

  CLASS_LEVELS.forEach((grade) => {
    currentCounts.set(grade, 0);
    previousCounts.set(grade, 0);
  });

  currentRows.forEach((row) => {
    if (!CLASS_LEVELS.includes(row.class_grade as (typeof CLASS_LEVELS)[number])) return;
    currentCounts.set(row.class_grade, (currentCounts.get(row.class_grade) ?? 0) + safeNum(row.student_count));
  });

  previousRows.forEach((row) => {
    if (!CLASS_LEVELS.includes(row.class_grade as (typeof CLASS_LEVELS)[number])) return;
    previousCounts.set(row.class_grade, (previousCounts.get(row.class_grade) ?? 0) + safeNum(row.student_count));
  });

  return PROGRESSION_TRANSITIONS.map(([fromLevel, toLevel]) => {
    const previousLearners = previousCounts.get(fromLevel) ?? 0;
    const currentLearners = currentCounts.get(toLevel) ?? 0;
    const netChange = currentLearners - previousLearners;
    const changePct = previousLearners > 0 ? (netChange / previousLearners) * 100 : currentLearners > 0 ? 100 : 0;
    return {
      classLevel: `${fromLevel} - ${toLevel}`,
      previousLearners,
      currentLearners,
      netChange,
      changePct,
    };
  });
}

function progressionBadgeClasses(value: number): string {
  return value >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600";
}

function ProgressionTable({
  rows,
  previousSessionLabel,
  currentSessionLabel,
}: {
  rows: ProgressionRow[];
  previousSessionLabel: string;
  currentSessionLabel: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-3 py-3 text-left">Transition Level</th>
            <th className="px-3 py-3 text-left">Previous Session ({previousSessionLabel})</th>
            <th className="px-3 py-3 text-left">Current Session ({currentSessionLabel})</th>
            <th className="px-3 py-3 text-left">Net Change</th>
            <th className="px-3 py-3 text-left">Change %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.map((row) => (
            <tr key={row.classLevel}>
              <td className="px-3 py-3 font-semibold text-slate-900">{row.classLevel}</td>
              <td className="px-3 py-3 font-semibold text-slate-700">{fmtInt(row.previousLearners)}</td>
              <td className="px-3 py-3 font-semibold text-slate-900">{fmtInt(row.currentLearners)}</td>
              <td className="px-3 py-3">
                <span className={["rounded px-2 py-1 text-[11px] font-semibold", progressionBadgeClasses(row.netChange)].join(" ")}>
                  {row.netChange >= 0 ? "+" : "-"}
                  {fmtInt(Math.abs(row.netChange))}
                </span>
              </td>
              <td className={["px-3 py-3 font-semibold", row.changePct >= 0 ? "text-emerald-700" : "text-red-600"].join(" ")}>
                {row.changePct >= 0 ? "+" : ""}
                {row.changePct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Nigeria SVG Map (inline — no Plotly geo, no rectangles) ────────────────

const NGA_PATHS: Record<string, string> = {
  "Cross River": "M 279.4,469.6 L 283.9,473.5 L 285.5,473.4 L 285.6,475.8 L 287.3,476.2 L 288.7,474.8 L 289.8,476.1 L 288.4,477.7 L 291.2,478.0 L 293.0,472.3 L 297.1,471.3 L 295.9,468.1 L 298.3,466.5 L 302.2,458.2 L 306.5,453.7 L 308.7,436.2 L 311.8,431.1 L 308.3,424.5 L 309.1,418.1 L 313.9,414.9 L 326.9,402.2 L 333.9,393.1 L 337.3,393.1 L 338.6,390.9 L 339.4,382.9 L 330.8,372.6 L 317.4,376.4 L 314.1,373.8 L 315.5,370.8 L 314.5,369.0 L 308.2,365.0 L 300.9,363.4 L 295.8,365.5 L 297.8,367.5 L 296.5,369.6 L 286.7,370.7 L 283.8,374.0 L 280.4,374.8 L 281.9,379.4 L 285.3,381.4 L 285.3,382.8 L 286.7,383.3 L 286.1,385.2 L 288.6,387.8 L 288.0,390.0 L 285.6,391.8 L 286.6,396.5 L 280.8,404.4 L 279.4,410.1 L 276.4,409.4 L 271.4,413.3 L 270.7,412.1 L 268.2,412.6 L 267.7,410.1 L 264.7,411.4 L 266.0,415.1 L 262.3,418.9 L 264.2,422.1 L 261.8,422.5 L 260.0,425.6 L 261.6,428.3 L 261.1,434.2 L 265.1,443.2 L 259.7,443.0 L 260.8,444.6 L 257.7,444.5 L 261.3,446.2 L 264.5,451.2 L 266.5,449.2 L 267.8,449.8 L 272.0,463.0 L 277.2,465.7 Z",
  "Abuja Federal Capital Territory": "M 214.7,283.0 L 221.8,284.1 L 222.3,282.7 L 233.9,280.7 L 240.5,272.0 L 245.3,262.2 L 245.1,247.3 L 249.0,238.3 L 251.9,236.9 L 249.0,233.2 L 246.4,232.9 L 241.1,235.6 L 234.6,236.6 L 226.6,248.2 L 216.4,240.1 L 205.0,240.0 L 204.8,282.3 Z",
  "Ogun": "M 89.6,393.1 L 94.1,394.6 L 95.3,392.6 L 94.3,390.2 L 89.1,389.6 L 92.3,388.7 L 93.7,384.1 L 95.7,384.5 L 95.5,377.9 L 93.8,376.9 L 90.3,383.8 L 88.4,378.7 L 84.8,377.3 L 84.3,375.6 L 86.9,370.0 L 92.8,366.3 L 93.5,358.7 L 95.9,356.4 L 85.0,359.0 L 84.0,355.1 L 80.4,353.3 L 75.3,355.5 L 73.9,349.0 L 69.7,351.2 L 65.3,351.5 L 62.4,353.7 L 52.0,353.9 L 55.1,350.5 L 53.6,342.6 L 51.1,342.2 L 51.4,337.9 L 50.1,337.9 L 50.8,334.8 L 42.7,335.1 L 39.1,337.8 L 37.7,332.4 L 35.0,334.3 L 34.7,337.2 L 31.6,341.7 L 27.8,338.9 L 23.1,338.4 L 19.4,335.1 L 18.6,331.0 L 14.0,326.5 L 16.8,316.2 L 14.8,313.5 L 13.4,319.4 L 11.4,321.2 L 11.4,318.9 L 9.7,318.1 L 9.4,313.5 L 11.9,309.8 L 5.4,308.7 L 1.0,313.7 L 2.5,316.0 L 1.2,326.9 L 2.8,353.2 L 0.5,360.1 L 2.9,364.9 L 1.5,369.2 L 4.7,371.0 L 4.4,373.9 L 1.8,377.5 L 2.5,380.8 L 0.4,383.4 L 0.6,386.1 L 8.3,386.7 L 10.0,383.4 L 19.4,384.4 L 24.1,383.3 L 25.5,382.4 L 25.0,380.0 L 27.3,377.8 L 28.5,373.6 L 34.3,376.8 L 38.0,376.7 L 37.6,374.4 L 64.4,374.1 L 70.0,374.7 L 70.3,376.1 L 68.2,378.1 L 68.9,380.3 L 70.9,381.2 L 74.3,378.6 L 76.6,379.1 L 77.1,381.6 L 73.8,383.5 L 73.9,384.7 L 78.5,387.0 L 83.1,386.6 L 83.4,390.9 Z",
  "Oyo": "M 69.9,351.1 L 69.0,349.6 L 71.7,344.6 L 71.0,341.0 L 73.2,331.6 L 72.4,326.9 L 68.1,323.0 L 69.2,322.3 L 68.5,318.8 L 69.9,313.3 L 75.3,313.1 L 75.0,310.7 L 79.3,307.5 L 81.9,309.4 L 84.0,313.9 L 85.3,311.4 L 87.1,311.7 L 87.9,309.3 L 92.9,307.6 L 93.9,303.2 L 90.7,301.3 L 89.7,295.5 L 85.0,290.2 L 75.9,270.7 L 75.2,263.6 L 82.2,255.1 L 81.3,254.2 L 76.0,255.6 L 66.0,252.3 L 61.5,245.1 L 58.6,244.3 L 54.0,246.4 L 52.6,251.6 L 50.0,254.2 L 45.2,254.1 L 45.4,256.3 L 27.3,265.4 L 23.6,264.0 L 16.1,269.1 L 11.4,274.2 L 5.5,274.3 L 3.2,276.1 L 3.3,280.5 L 0.8,288.4 L 3.0,295.3 L 0.1,312.2 L 1.0,313.7 L 5.7,308.6 L 11.9,309.8 L 9.8,311.8 L 9.7,318.1 L 11.4,318.9 L 11.5,321.2 L 13.4,319.4 L 14.8,313.5 L 16.8,316.2 L 14.0,326.5 L 18.6,331.0 L 19.4,335.1 L 23.1,338.4 L 27.8,338.9 L 31.6,341.7 L 34.7,337.2 L 35.0,334.3 L 37.7,332.4 L 39.1,337.8 L 42.7,335.1 L 50.8,334.8 L 50.1,337.9 L 51.4,337.9 L 51.1,342.2 L 53.6,342.6 L 55.1,350.5 L 52.0,353.9 L 62.4,353.7 L 65.3,351.5 Z",
  "Sokoto": "M 71.8,33.1 L 80.5,32.6 L 84.2,35.6 L 89.1,36.8 L 96.6,42.4 L 100.6,42.3 L 102.1,43.3 L 97.8,48.7 L 100.2,49.5 L 105.8,55.5 L 102.0,61.6 L 106.1,71.9 L 103.4,74.6 L 103.2,79.2 L 100.9,79.1 L 97.0,75.6 L 94.9,77.5 L 95.1,80.0 L 92.9,82.4 L 92.9,85.0 L 91.5,85.0 L 93.6,86.1 L 93.1,93.0 L 94.9,96.0 L 92.9,108.7 L 87.3,113.1 L 86.3,113.2 L 85.2,110.7 L 83.9,111.2 L 86.8,115.2 L 86.4,118.1 L 90.3,121.3 L 89.6,122.4 L 91.6,122.5 L 94.0,120.2 L 92.8,117.1 L 98.8,115.4 L 98.6,113.9 L 101.8,113.8 L 106.2,110.2 L 108.0,111.8 L 110.0,111.1 L 110.2,113.2 L 112.6,112.3 L 111.5,109.0 L 113.9,104.5 L 108.8,101.6 L 108.5,95.6 L 109.2,86.1 L 113.0,86.0 L 113.1,81.7 L 121.3,83.3 L 123.5,81.6 L 131.1,79.6 L 134.7,81.2 L 136.6,79.7 L 139.3,84.9 L 142.6,83.9 L 143.9,79.8 L 153.1,81.2 L 154.2,78.1 L 151.4,72.7 L 151.7,65.8 L 149.4,65.2 L 149.9,60.9 L 144.9,56.3 L 147.3,52.2 L 152.2,55.1 L 156.2,54.4 L 157.9,55.9 L 159.7,55.4 L 163.6,58.8 L 166.8,59.1 L 165.8,50.3 L 168.0,48.8 L 167.9,44.4 L 178.6,39.0 L 178.5,37.7 L 180.6,36.6 L 183.4,37.5 L 183.5,38.9 L 185.7,39.4 L 188.2,37.8 L 188.2,40.0 L 191.2,39.3 L 192.0,43.3 L 194.7,44.9 L 200.0,39.2 L 205.2,39.2 L 202.4,31.4 L 188.7,15.4 L 180.4,10.8 L 173.3,12.5 L 142.0,0.0 L 133.0,2.7 L 127.9,7.4 L 113.0,7.9 L 109.2,5.4 L 100.9,6.6 L 85.2,12.1 L 77.1,20.1 L 71.8,21.7 Z",
  "Zamfara": "M 112.5,112.1 L 115.9,111.1 L 118.8,113.2 L 120.4,111.7 L 124.4,111.4 L 124.5,108.8 L 127.4,110.8 L 131.1,108.8 L 130.3,110.8 L 131.9,109.9 L 133.0,113.2 L 137.5,113.2 L 140.4,116.0 L 143.7,114.5 L 149.0,115.7 L 150.8,114.3 L 154.6,114.5 L 157.0,117.6 L 156.3,121.9 L 157.3,127.4 L 166.0,126.0 L 169.5,129.9 L 175.8,130.1 L 174.3,131.4 L 175.1,132.7 L 172.4,134.7 L 170.9,140.5 L 167.9,141.6 L 168.5,138.1 L 166.8,141.1 L 166.4,143.9 L 167.9,147.2 L 173.7,147.8 L 179.6,152.0 L 182.1,148.6 L 186.1,148.4 L 187.4,149.7 L 191.1,147.8 L 194.5,148.9 L 199.4,147.1 L 201.4,144.6 L 199.8,142.2 L 200.8,137.6 L 203.8,136.2 L 204.1,133.4 L 207.4,133.9 L 207.3,131.7 L 210.1,130.1 L 211.0,122.5 L 208.2,117.8 L 210.7,108.5 L 211.5,109.2 L 216.5,107.7 L 218.6,109.0 L 222.7,105.9 L 222.7,102.7 L 225.6,103.2 L 228.0,101.6 L 221.5,93.2 L 223.5,88.4 L 223.2,86.0 L 220.3,83.4 L 217.8,63.8 L 215.1,63.0 L 218.7,59.6 L 218.2,46.3 L 212.3,46.2 L 205.2,39.2 L 200.0,39.2 L 194.7,44.9 L 192.0,43.3 L 191.2,39.3 L 188.2,40.0 L 188.2,37.8 L 185.7,39.4 L 183.5,38.9 L 183.4,37.5 L 180.6,36.6 L 178.5,37.7 L 178.6,39.0 L 167.9,44.4 L 168.0,48.8 L 165.8,50.3 L 166.8,59.1 L 163.6,58.8 L 159.7,55.4 L 157.9,55.9 L 156.2,54.4 L 152.2,55.1 L 147.3,52.2 L 144.9,56.3 L 149.9,60.9 L 149.4,65.2 L 151.7,65.8 L 151.4,72.7 L 154.2,78.1 L 153.3,80.9 L 143.9,79.8 L 142.6,83.9 L 139.3,84.9 L 136.6,79.7 L 134.7,81.2 L 131.1,79.6 L 123.5,81.6 L 121.3,83.3 L 113.1,81.7 L 113.0,86.0 L 109.2,86.1 L 108.6,89.8 L 108.8,101.6 L 113.9,104.5 L 111.5,109.0 Z",
  "Lagos": "M 0.6,386.1 L 0.3,390.5 L 58.4,387.4 L 83.4,390.9 L 83.9,387.2 L 78.5,387.0 L 73.9,384.7 L 73.8,383.5 L 77.1,381.6 L 76.6,379.1 L 74.3,378.6 L 70.9,381.2 L 68.9,380.3 L 68.2,377.7 L 70.3,376.1 L 70.0,374.7 L 37.6,374.4 L 38.0,376.7 L 34.3,376.8 L 28.7,373.6 L 27.3,377.8 L 25.0,380.0 L 25.5,382.4 L 24.1,383.3 L 19.4,384.4 L 10.0,383.4 L 8.3,386.7 Z",
  "Akwa Ibom": "M 259.7,443.0 L 258.9,440.2 L 255.3,439.2 L 253.4,435.4 L 250.5,435.1 L 250.7,439.6 L 248.4,438.9 L 246.6,442.7 L 248.7,443.0 L 248.6,444.6 L 242.4,446.2 L 243.3,447.7 L 242.0,453.9 L 243.0,457.6 L 238.7,463.4 L 240.3,464.4 L 239.7,468.3 L 242.8,476.1 L 241.8,481.2 L 243.0,483.6 L 242.0,485.4 L 245.9,489.6 L 267.0,485.8 L 280.3,486.1 L 282.9,482.6 L 280.8,471.5 L 277.2,465.7 L 272.0,463.0 L 267.8,449.8 L 266.5,449.2 L 264.5,451.2 L 261.3,446.2 L 257.7,444.5 L 260.8,444.6 Z",
  "Bayelsa": "M 137.9,455.1 L 134.3,455.5 L 142.6,476.1 L 150.5,487.1 L 157.7,493.1 L 164.4,497.8 L 170.0,500.0 L 176.6,499.5 L 177.7,493.2 L 177.6,495.3 L 179.1,493.7 L 179.7,494.5 L 177.8,498.9 L 188.2,498.5 L 193.1,497.1 L 191.3,494.9 L 191.2,491.6 L 193.9,485.2 L 191.2,480.6 L 196.0,475.2 L 192.5,474.7 L 188.6,477.0 L 185.5,469.1 L 187.6,465.0 L 186.4,461.2 L 190.3,453.5 L 193.5,451.7 L 193.9,449.7 L 192.1,447.2 L 193.8,445.4 L 193.7,442.3 L 189.9,442.3 L 190.1,445.2 L 180.7,446.4 L 180.1,449.9 L 176.2,449.6 L 175.1,453.8 L 172.1,455.3 L 169.9,454.2 L 168.3,457.0 L 165.8,456.7 L 162.2,453.5 L 161.3,456.4 L 159.6,456.3 L 158.9,458.5 L 155.1,457.6 L 151.1,460.8 L 147.9,461.4 L 138.9,457.2 Z",
  "Ondo": "M 89.6,393.1 L 102.8,403.6 L 114.8,415.5 L 122.4,401.0 L 121.6,399.3 L 119.3,398.9 L 116.1,394.3 L 117.3,393.0 L 117.0,391.1 L 120.7,389.1 L 120.6,387.1 L 123.1,384.4 L 123.7,381.2 L 121.2,377.8 L 121.3,374.8 L 128.3,364.1 L 143.3,364.1 L 144.1,366.1 L 142.7,367.8 L 144.4,373.4 L 147.0,371.3 L 150.7,371.8 L 154.1,368.6 L 155.5,362.3 L 155.2,356.9 L 160.2,348.5 L 161.5,340.5 L 164.9,339.6 L 164.0,336.7 L 164.9,334.6 L 163.0,332.3 L 165.8,330.2 L 162.4,324.3 L 162.0,319.2 L 158.0,320.2 L 154.2,319.2 L 150.5,322.5 L 150.0,325.2 L 148.3,325.4 L 146.6,328.1 L 145.2,335.2 L 141.6,340.8 L 139.2,342.4 L 133.4,342.7 L 131.3,335.0 L 118.0,334.2 L 115.0,338.4 L 103.2,339.3 L 102.8,346.5 L 100.8,349.6 L 98.9,349.6 L 95.8,356.6 L 93.7,358.3 L 92.8,366.3 L 86.9,370.0 L 84.9,372.8 L 84.3,376.5 L 88.4,378.7 L 90.3,383.8 L 93.8,376.9 L 95.5,377.9 L 95.7,384.5 L 93.7,384.1 L 92.3,388.7 L 89.1,389.6 L 94.3,390.2 L 95.3,392.6 L 94.1,394.6 Z",
  "Delta": "M 189.9,442.3 L 189.7,440.2 L 192.3,438.2 L 192.1,434.4 L 194.8,432.8 L 196.5,429.2 L 195.6,425.3 L 197.8,423.2 L 198.6,417.5 L 201.4,411.6 L 201.9,407.9 L 200.8,405.8 L 203.4,403.8 L 204.1,401.3 L 202.2,397.8 L 199.0,384.0 L 191.8,384.7 L 186.2,389.5 L 180.1,391.2 L 176.2,395.5 L 171.9,391.5 L 170.6,392.6 L 169.4,395.6 L 171.2,397.5 L 172.3,403.0 L 175.3,407.2 L 177.8,407.2 L 177.2,408.3 L 178.4,409.2 L 176.5,414.4 L 167.8,422.2 L 161.8,423.1 L 160.3,420.5 L 161.6,416.4 L 156.1,410.9 L 149.0,407.3 L 142.8,410.8 L 140.4,407.8 L 138.3,408.9 L 137.5,408.0 L 136.9,409.7 L 132.2,408.9 L 131.9,410.9 L 133.5,411.6 L 129.3,414.9 L 127.9,410.9 L 129.0,407.2 L 127.2,406.7 L 126.6,402.4 L 123.9,401.5 L 122.8,402.7 L 122.2,401.2 L 114.3,415.9 L 124.0,431.2 L 127.9,429.7 L 134.2,430.9 L 137.8,428.0 L 140.6,429.8 L 141.1,431.0 L 138.9,429.2 L 135.9,428.9 L 134.9,431.6 L 125.9,430.9 L 123.4,434.1 L 127.5,439.2 L 133.3,441.8 L 137.1,442.0 L 139.1,441.3 L 141.7,435.3 L 145.5,435.2 L 141.5,436.0 L 140.9,439.0 L 141.9,440.9 L 138.9,442.7 L 131.5,443.6 L 134.1,454.5 L 137.7,454.4 L 138.9,457.2 L 147.9,461.4 L 151.1,460.8 L 155.1,457.6 L 158.9,458.5 L 159.6,456.3 L 161.3,456.4 L 162.2,453.5 L 166.9,457.1 L 168.7,456.7 L 169.9,454.2 L 172.8,455.0 L 175.6,453.2 L 176.2,449.6 L 180.1,449.9 L 180.7,446.4 L 190.3,445.1 Z",
  "Rivers": "M 240.4,471.0 L 236.5,469.0 L 231.6,468.3 L 226.5,469.5 L 223.4,468.1 L 223.1,466.0 L 227.7,462.4 L 230.2,453.8 L 229.4,451.1 L 226.5,451.9 L 217.9,449.1 L 210.8,450.6 L 206.4,448.6 L 203.4,445.2 L 202.7,436.4 L 197.6,436.4 L 199.0,426.2 L 195.7,426.3 L 196.5,429.2 L 194.8,432.8 L 192.1,434.4 L 191.8,439.2 L 189.4,441.0 L 189.9,442.3 L 194.1,442.7 L 193.8,445.4 L 192.1,447.2 L 193.9,449.7 L 193.5,451.7 L 190.3,453.5 L 186.4,461.2 L 187.6,465.0 L 185.5,469.1 L 188.6,477.0 L 192.5,474.7 L 196.0,475.2 L 191.2,480.6 L 193.9,485.2 L 191.2,491.6 L 191.3,494.9 L 193.1,497.1 L 197.6,497.8 L 200.9,496.4 L 199.7,492.8 L 201.8,482.2 L 202.2,484.3 L 200.5,487.9 L 201.4,495.8 L 209.4,495.5 L 208.5,493.3 L 216.6,494.5 L 214.4,487.9 L 214.8,482.0 L 216.8,491.1 L 223.6,489.9 L 224.2,482.8 L 219.8,478.5 L 219.9,476.4 L 220.7,478.8 L 223.3,479.7 L 226.5,485.7 L 222.4,492.7 L 222.5,494.6 L 232.1,492.4 L 232.3,491.0 L 245.0,490.5 L 245.1,488.6 L 241.7,485.4 L 242.8,483.9 L 241.5,478.7 L 242.8,476.1 Z",
  "Kwara": "M 93.9,303.2 L 96.6,302.1 L 98.8,303.8 L 103.8,302.5 L 106.4,303.3 L 108.6,301.1 L 111.8,301.9 L 114.2,304.9 L 117.5,302.3 L 119.3,304.8 L 122.6,302.8 L 125.3,305.1 L 132.1,305.6 L 134.1,301.0 L 140.4,300.3 L 142.4,297.9 L 142.4,295.4 L 138.8,295.5 L 136.6,294.2 L 136.4,291.3 L 133.4,291.8 L 131.6,288.3 L 140.3,278.5 L 141.7,278.1 L 150.8,282.9 L 169.5,285.4 L 171.1,283.6 L 171.8,277.2 L 176.0,268.0 L 173.0,268.6 L 172.1,267.0 L 169.8,266.5 L 155.3,267.5 L 152.0,263.4 L 147.6,262.6 L 141.8,257.2 L 127.4,253.1 L 123.5,248.5 L 116.3,243.4 L 104.7,247.0 L 102.4,240.1 L 97.4,238.0 L 96.0,235.2 L 83.0,223.5 L 73.1,209.2 L 71.4,209.6 L 71.2,208.2 L 69.6,209.8 L 66.5,209.5 L 65.5,206.9 L 64.7,207.6 L 62.2,206.4 L 64.0,204.7 L 62.2,203.8 L 62.9,202.5 L 59.8,202.7 L 60.6,201.1 L 56.3,198.6 L 54.6,198.8 L 54.2,200.3 L 52.6,197.7 L 51.9,198.5 L 49.6,193.9 L 45.9,204.8 L 41.7,210.2 L 33.7,210.5 L 32.4,212.0 L 31.9,214.8 L 33.0,217.5 L 22.5,231.1 L 23.7,238.3 L 20.1,249.3 L 14.7,250.9 L 13.8,249.8 L 5.1,251.1 L 2.5,266.0 L 3.2,276.1 L 5.5,274.3 L 11.4,274.2 L 16.1,269.1 L 23.6,264.0 L 27.3,265.4 L 45.4,256.3 L 45.2,254.1 L 50.0,254.2 L 52.6,251.6 L 54.0,246.4 L 56.7,244.6 L 61.0,244.9 L 66.0,252.3 L 76.0,255.6 L 81.3,254.2 L 82.2,255.1 L 75.2,263.6 L 75.9,270.7 L 85.0,290.2 L 89.7,295.5 L 90.7,301.3 Z",
  "Kogi": "M 207.0,282.3 L 207.4,285.7 L 203.2,290.2 L 203.7,291.9 L 201.6,291.8 L 200.1,296.5 L 195.6,289.2 L 188.2,282.8 L 183.9,271.0 L 180.7,268.2 L 177.9,267.6 L 176.0,268.0 L 174.1,271.6 L 171.8,277.2 L 171.1,283.6 L 169.5,285.4 L 150.8,282.9 L 141.2,278.1 L 131.6,288.3 L 133.4,291.8 L 136.4,291.3 L 136.6,294.2 L 138.8,295.5 L 142.4,295.4 L 142.2,298.4 L 140.4,300.1 L 141.3,300.6 L 140.8,305.1 L 144.4,302.3 L 148.5,302.4 L 147.5,303.3 L 148.9,305.9 L 147.8,308.0 L 145.5,308.2 L 146.6,314.1 L 152.0,315.0 L 155.1,317.4 L 154.2,319.2 L 156.4,320.2 L 162.0,319.2 L 162.4,324.3 L 165.8,330.5 L 167.7,328.0 L 171.5,327.3 L 172.2,329.3 L 173.9,329.8 L 171.0,332.5 L 171.2,334.7 L 174.7,335.7 L 180.2,332.0 L 184.4,337.2 L 187.0,336.5 L 187.4,339.3 L 189.1,339.1 L 190.5,340.7 L 191.2,344.2 L 197.5,342.7 L 201.4,351.0 L 199.2,361.4 L 196.1,367.3 L 198.7,381.0 L 206.0,379.9 L 205.6,374.0 L 210.5,368.8 L 212.6,368.8 L 213.8,366.1 L 215.0,366.1 L 214.9,369.0 L 218.4,369.2 L 223.4,364.1 L 226.1,363.1 L 227.7,359.5 L 234.9,355.4 L 235.7,353.1 L 239.2,353.2 L 242.2,356.4 L 246.0,357.2 L 245.6,353.9 L 247.8,349.8 L 255.5,345.9 L 255.7,342.8 L 254.1,342.4 L 255.7,337.7 L 253.9,335.5 L 251.9,325.8 L 253.4,324.4 L 253.3,319.4 L 248.8,310.9 L 249.5,305.2 L 238.2,303.5 L 230.9,304.6 L 213.8,312.3 L 213.2,310.3 L 215.8,297.4 L 212.3,289.9 L 214.7,283.0 Z",
  "Benue": "M 339.1,389.2 L 345.7,384.1 L 348.1,371.6 L 348.1,363.5 L 352.7,354.0 L 357.0,349.1 L 357.0,344.8 L 359.9,336.5 L 359.3,330.0 L 347.9,316.5 L 343.8,314.4 L 335.1,314.1 L 322.3,317.1 L 321.5,316.0 L 324.9,311.5 L 318.6,302.0 L 311.3,303.1 L 304.8,302.2 L 291.3,297.8 L 285.3,302.0 L 283.7,308.0 L 282.7,308.1 L 285.3,311.7 L 286.7,317.2 L 285.9,318.2 L 269.2,312.4 L 259.5,306.9 L 249.5,305.3 L 248.8,310.9 L 253.3,319.4 L 253.4,324.4 L 251.9,325.8 L 253.9,335.5 L 255.7,337.7 L 254.1,342.4 L 255.7,342.8 L 255.5,345.9 L 247.8,349.8 L 245.6,353.9 L 246.0,357.2 L 242.2,356.4 L 244.2,361.2 L 246.7,362.2 L 249.4,365.6 L 255.9,363.7 L 260.1,365.6 L 260.8,369.4 L 256.2,376.5 L 259.1,380.5 L 263.2,381.8 L 265.1,377.9 L 265.0,372.5 L 272.1,373.0 L 274.3,369.8 L 276.7,369.6 L 277.2,368.4 L 279.6,373.8 L 281.8,374.8 L 286.1,370.9 L 296.5,369.6 L 297.8,367.5 L 295.8,365.5 L 301.8,363.4 L 308.2,365.0 L 314.5,369.0 L 315.5,370.8 L 314.1,373.8 L 317.4,376.4 L 330.8,372.6 L 339.4,382.9 Z",
  "Borno": "M 457.7,200.3 L 462.1,200.8 L 465.5,200.2 L 466.9,198.6 L 470.3,198.9 L 470.4,194.6 L 472.7,189.8 L 476.6,187.5 L 478.8,183.4 L 481.6,185.7 L 485.3,185.6 L 484.9,183.8 L 487.0,182.7 L 493.8,181.5 L 494.9,176.5 L 496.3,178.6 L 498.6,179.2 L 503.2,171.9 L 514.3,173.7 L 518.6,177.9 L 525.9,180.8 L 528.6,174.9 L 527.6,171.4 L 531.8,164.5 L 533.3,153.7 L 535.2,156.4 L 544.9,152.7 L 553.6,154.5 L 556.6,147.4 L 566.2,135.3 L 574.3,137.9 L 586.6,129.1 L 597.0,123.8 L 598.2,116.4 L 595.5,114.1 L 595.5,110.8 L 596.3,104.9 L 598.9,100.2 L 597.2,95.8 L 598.8,94.8 L 597.9,93.1 L 599.9,89.1 L 599.1,87.8 L 596.7,88.4 L 595.8,86.2 L 593.6,85.8 L 593.5,83.5 L 591.6,82.6 L 592.1,81.0 L 589.4,79.3 L 577.5,79.2 L 574.9,76.8 L 576.2,70.1 L 570.2,41.7 L 547.7,9.2 L 532.9,8.6 L 532.8,10.0 L 531.5,9.8 L 528.2,13.9 L 529.1,15.1 L 527.3,15.4 L 528.0,16.7 L 526.3,17.5 L 525.9,19.4 L 525.1,18.1 L 523.0,19.2 L 523.4,17.4 L 520.4,19.2 L 519.0,17.5 L 509.8,20.8 L 504.6,25.6 L 503.0,29.0 L 501.4,29.2 L 501.9,30.1 L 500.1,29.4 L 499.8,31.7 L 498.2,31.1 L 498.4,30.1 L 497.2,31.6 L 495.6,31.3 L 495.6,32.9 L 492.7,35.3 L 493.9,35.6 L 493.8,37.7 L 491.6,38.6 L 488.9,42.6 L 487.4,42.3 L 485.7,50.4 L 486.4,53.4 L 490.2,56.4 L 491.2,62.1 L 489.2,66.2 L 487.3,66.7 L 488.1,69.0 L 486.9,70.8 L 484.8,71.0 L 483.6,74.2 L 480.3,76.0 L 480.3,80.9 L 479.4,80.8 L 480.2,84.2 L 477.8,90.9 L 480.0,98.3 L 478.8,103.4 L 479.5,107.1 L 478.2,108.0 L 475.7,115.9 L 477.1,117.2 L 479.7,114.0 L 480.9,118.4 L 484.6,121.5 L 482.1,126.6 L 476.0,131.5 L 475.3,134.4 L 471.3,136.7 L 471.7,142.0 L 473.6,143.8 L 474.0,147.0 L 472.4,148.1 L 468.1,147.5 L 462.8,152.8 L 461.3,153.2 L 460.9,151.7 L 458.5,153.5 L 455.0,153.4 L 447.9,156.5 L 447.6,158.7 L 453.5,159.8 L 454.3,165.4 L 452.6,168.4 L 444.5,172.3 L 449.0,176.8 L 443.5,182.9 L 442.4,185.8 L 445.4,187.4 L 447.1,191.2 L 451.5,193.0 L 455.4,200.0 Z",
  "Katsina": "M 210.1,130.1 L 215.9,131.3 L 216.1,134.8 L 214.0,137.3 L 219.1,139.5 L 223.2,143.4 L 225.6,142.2 L 226.6,140.0 L 225.4,136.7 L 230.1,135.3 L 233.5,136.3 L 235.5,130.4 L 241.7,131.3 L 246.0,135.9 L 251.0,133.9 L 251.6,130.9 L 253.2,130.8 L 250.4,128.2 L 249.4,124.9 L 251.6,120.5 L 251.0,119.1 L 260.8,116.1 L 258.7,110.4 L 258.9,104.6 L 257.0,100.5 L 259.7,95.8 L 258.4,90.4 L 258.9,83.5 L 260.3,80.9 L 265.8,77.6 L 273.5,75.2 L 275.2,71.8 L 274.7,68.7 L 278.0,67.2 L 273.4,64.0 L 272.9,60.6 L 275.0,60.0 L 273.3,56.6 L 272.1,56.4 L 278.4,54.9 L 287.5,55.7 L 293.9,54.7 L 295.9,59.7 L 298.3,59.9 L 300.1,62.3 L 309.0,63.3 L 313.3,59.7 L 314.9,56.1 L 318.1,55.6 L 317.8,54.1 L 314.6,54.5 L 298.9,49.0 L 296.5,44.9 L 292.8,42.2 L 286.1,41.5 L 271.9,30.3 L 267.4,29.3 L 256.7,27.8 L 234.6,40.9 L 226.6,39.5 L 220.2,46.3 L 218.2,46.3 L 218.7,59.6 L 215.1,63.0 L 217.8,63.8 L 220.3,83.4 L 223.2,86.0 L 223.5,88.4 L 221.5,93.2 L 228.0,101.6 L 225.6,103.2 L 222.7,102.7 L 222.7,105.9 L 218.6,109.0 L 216.5,107.7 L 211.5,109.2 L 210.7,108.5 L 208.2,117.8 L 211.0,122.5 Z",
  "Plateau": "M 346.6,286.7 L 353.6,287.0 L 359.3,283.6 L 378.3,264.0 L 386.8,257.0 L 395.7,255.3 L 397.8,250.2 L 393.8,235.8 L 394.7,230.8 L 390.3,225.3 L 384.5,222.7 L 378.9,218.3 L 373.4,218.8 L 369.2,216.0 L 364.4,217.7 L 365.4,220.9 L 363.9,222.2 L 357.4,222.9 L 354.0,226.0 L 350.5,226.9 L 344.7,225.4 L 345.3,227.5 L 344.2,229.5 L 337.0,229.3 L 335.6,226.4 L 333.3,226.4 L 331.0,224.3 L 332.1,223.1 L 330.3,222.1 L 330.0,217.8 L 326.6,218.5 L 323.3,215.2 L 327.3,213.3 L 329.4,210.1 L 327.4,209.3 L 326.7,203.6 L 326.5,201.1 L 328.5,200.5 L 322.0,199.0 L 319.6,200.9 L 315.9,200.4 L 315.9,202.6 L 314.6,202.7 L 312.7,200.7 L 314.7,192.7 L 312.2,190.7 L 313.5,186.0 L 312.5,183.9 L 306.6,182.3 L 305.5,186.6 L 302.4,187.8 L 300.0,191.1 L 299.7,201.8 L 297.5,209.0 L 297.9,213.7 L 295.7,216.2 L 293.4,224.5 L 297.8,233.2 L 300.5,234.4 L 298.8,243.9 L 304.0,245.5 L 303.7,248.6 L 305.7,250.4 L 305.6,252.4 L 318.9,253.1 L 319.3,256.9 L 316.9,261.0 L 313.7,261.9 L 310.3,267.6 L 314.9,275.0 L 314.7,278.5 L 318.5,279.2 L 320.8,281.4 L 320.6,283.1 L 322.4,283.8 L 324.5,281.8 L 330.2,282.1 L 333.5,280.9 Z",
  "Edo": "M 122.2,401.2 L 122.8,402.7 L 123.9,401.5 L 126.6,402.4 L 127.2,406.7 L 129.0,407.2 L 127.9,410.9 L 129.3,414.9 L 133.5,411.6 L 131.9,410.9 L 132.2,408.9 L 136.9,409.7 L 137.5,408.0 L 138.3,408.9 L 140.4,407.8 L 142.8,410.8 L 149.0,407.3 L 156.1,410.9 L 161.6,416.4 L 160.3,420.5 L 161.8,423.1 L 170.2,420.8 L 176.5,414.4 L 178.4,409.2 L 177.2,408.3 L 177.8,407.2 L 175.3,407.2 L 172.3,403.0 L 171.2,397.5 L 169.4,395.6 L 170.6,392.6 L 171.9,391.5 L 176.2,395.5 L 180.1,391.2 L 186.2,389.5 L 191.8,384.7 L 199.0,384.0 L 196.1,367.3 L 199.2,361.4 L 201.4,351.0 L 197.5,342.7 L 191.2,344.2 L 190.5,340.7 L 189.1,339.1 L 187.4,339.3 L 187.0,336.5 L 184.4,337.2 L 180.2,332.0 L 174.7,335.7 L 171.2,334.7 L 171.0,332.5 L 173.9,329.8 L 172.2,329.3 L 171.5,327.3 L 167.7,328.0 L 166.1,330.4 L 164.3,330.5 L 163.0,332.7 L 164.9,334.6 L 164.0,336.5 L 164.9,339.6 L 161.5,340.5 L 160.2,348.5 L 155.2,356.9 L 155.5,362.3 L 153.9,368.9 L 150.7,371.8 L 147.0,371.3 L 144.4,373.4 L 142.7,367.8 L 144.1,366.1 L 143.3,364.1 L 129.1,363.9 L 125.4,369.8 L 122.5,372.0 L 121.1,377.5 L 123.6,380.8 L 123.2,384.1 L 120.6,387.1 L 120.7,389.1 L 117.0,391.1 L 117.3,393.0 L 116.1,394.3 L 120.1,399.7 L 121.6,399.3 Z",
  "Jigawa": "M 278.0,67.2 L 280.1,66.9 L 280.7,70.7 L 283.4,73.1 L 284.0,75.6 L 288.6,67.5 L 290.1,66.8 L 297.8,67.2 L 298.0,69.0 L 301.7,68.6 L 302.6,69.4 L 300.1,73.0 L 300.5,75.0 L 301.2,76.4 L 303.9,76.2 L 305.5,78.2 L 301.9,82.7 L 304.5,83.7 L 307.7,82.0 L 311.2,82.4 L 313.4,88.4 L 311.5,94.1 L 319.5,94.2 L 320.0,96.6 L 323.2,97.1 L 323.6,94.6 L 325.7,93.8 L 327.2,97.3 L 325.9,103.0 L 327.3,103.5 L 325.1,106.7 L 323.0,107.1 L 322.8,110.6 L 324.3,113.5 L 327.0,111.8 L 328.2,113.8 L 327.8,116.5 L 329.5,116.6 L 329.2,117.5 L 333.8,120.9 L 327.3,126.7 L 325.5,133.1 L 333.1,132.0 L 336.4,134.5 L 340.7,135.6 L 341.5,133.7 L 346.3,133.7 L 345.6,137.2 L 349.7,138.6 L 357.0,135.5 L 359.8,139.8 L 360.2,145.2 L 358.4,146.6 L 359.2,150.1 L 366.1,152.4 L 371.4,150.5 L 372.0,152.6 L 376.8,152.8 L 373.6,149.8 L 374.3,147.0 L 376.7,145.1 L 379.3,145.5 L 380.4,143.7 L 382.4,144.0 L 384.2,139.5 L 375.0,138.5 L 370.0,136.0 L 366.4,136.5 L 361.4,133.6 L 361.7,132.0 L 359.9,131.4 L 359.7,126.7 L 358.6,125.8 L 355.9,127.0 L 355.0,125.7 L 355.2,123.8 L 357.3,122.1 L 357.5,118.9 L 356.3,117.7 L 357.2,114.1 L 355.9,114.1 L 354.8,111.8 L 351.0,112.6 L 346.7,111.1 L 349.3,109.3 L 349.7,105.1 L 351.2,105.9 L 357.5,103.8 L 359.9,101.5 L 368.5,99.2 L 370.6,97.1 L 374.6,95.9 L 373.4,93.4 L 374.3,89.5 L 373.2,85.7 L 376.2,81.8 L 376.2,79.6 L 378.5,77.7 L 377.1,75.5 L 378.7,74.2 L 382.8,75.1 L 385.5,73.9 L 388.8,75.2 L 396.0,72.8 L 394.9,64.4 L 395.9,61.9 L 393.2,55.4 L 390.6,55.6 L 389.6,57.0 L 382.4,54.0 L 382.1,55.9 L 380.4,55.7 L 381.1,53.3 L 379.0,48.4 L 380.0,47.3 L 377.0,45.3 L 370.7,46.8 L 371.0,47.8 L 369.0,47.2 L 368.4,48.5 L 365.2,48.3 L 358.7,55.4 L 354.1,56.7 L 348.9,54.7 L 347.5,56.3 L 317.8,54.1 L 318.1,55.6 L 314.9,56.1 L 313.3,59.7 L 309.0,63.3 L 300.1,62.3 L 298.3,59.9 L 295.9,59.7 L 293.9,54.7 L 287.5,55.7 L 278.4,54.9 L 272.1,56.4 L 273.3,56.6 L 275.0,60.0 L 272.9,60.6 L 273.4,64.0 Z",
  "Anambra": "M 195.7,426.3 L 200.2,425.7 L 200.3,423.2 L 203.2,423.1 L 205.6,421.2 L 209.4,423.4 L 210.1,420.1 L 215.6,415.1 L 219.0,413.6 L 225.1,415.3 L 226.2,413.7 L 228.6,413.4 L 228.8,410.5 L 231.6,410.1 L 232.6,408.2 L 230.5,407.4 L 231.1,405.9 L 228.7,405.9 L 225.6,397.8 L 222.8,397.9 L 223.7,393.8 L 222.8,389.9 L 217.2,387.0 L 218.4,381.7 L 222.1,377.0 L 220.7,374.9 L 215.2,373.0 L 211.3,373.9 L 208.6,370.9 L 205.6,374.0 L 206.0,379.9 L 198.7,381.0 L 202.2,397.8 L 204.1,401.3 L 203.4,403.8 L 200.8,405.8 L 201.9,407.9 L 201.4,411.6 L 198.6,417.5 L 197.8,423.2 Z",
  "Kano": "M 253.2,130.7 L 259.1,130.2 L 260.6,127.6 L 264.6,124.9 L 268.1,124.8 L 270.7,122.8 L 273.2,123.1 L 273.8,124.2 L 271.8,130.0 L 276.0,133.5 L 278.9,133.8 L 278.5,135.3 L 280.6,137.9 L 287.4,138.3 L 288.9,141.2 L 291.6,141.6 L 291.7,144.1 L 296.1,146.4 L 296.5,149.1 L 294.1,154.9 L 295.0,157.3 L 293.7,161.0 L 294.3,163.2 L 289.8,164.8 L 291.4,168.6 L 297.9,169.3 L 301.3,173.8 L 304.9,171.0 L 308.5,165.8 L 303.0,157.5 L 304.1,153.1 L 305.2,153.1 L 304.7,149.1 L 306.0,144.7 L 310.4,144.0 L 311.7,140.8 L 319.9,133.7 L 322.3,133.0 L 324.8,134.0 L 326.9,130.6 L 327.3,126.7 L 333.8,120.9 L 330.6,118.9 L 329.5,116.6 L 327.8,116.5 L 328.2,113.8 L 327.0,111.8 L 324.3,113.5 L 322.8,110.6 L 323.0,107.1 L 325.1,106.7 L 327.3,103.5 L 325.9,103.0 L 327.2,97.3 L 326.5,95.3 L 324.8,93.6 L 323.2,97.1 L 320.0,96.6 L 319.5,94.2 L 311.5,94.1 L 313.4,88.4 L 311.2,82.4 L 307.7,82.0 L 304.5,83.7 L 301.9,82.7 L 305.5,78.2 L 303.9,76.2 L 301.2,76.4 L 300.5,75.0 L 300.1,73.0 L 302.6,69.4 L 301.7,68.6 L 298.0,69.0 L 297.8,67.2 L 290.1,66.8 L 288.6,67.5 L 284.0,75.6 L 283.4,73.1 L 280.7,70.7 L 280.1,66.9 L 277.5,67.3 L 274.7,68.7 L 275.2,71.8 L 273.5,75.2 L 265.8,77.6 L 260.3,80.9 L 258.9,83.5 L 258.4,90.4 L 259.7,95.8 L 257.0,100.5 L 258.9,104.6 L 258.7,110.4 L 260.8,116.1 L 251.0,119.1 L 251.6,120.5 L 249.4,124.9 L 250.4,128.2 Z",
  "Nasarawa": "M 214.7,283.0 L 212.3,289.9 L 215.8,297.4 L 213.2,310.3 L 213.8,312.3 L 228.3,305.3 L 240.9,303.6 L 259.5,306.9 L 269.2,312.4 L 285.9,318.2 L 286.7,317.2 L 285.3,311.7 L 282.7,308.1 L 283.7,308.0 L 285.3,302.0 L 290.9,297.8 L 304.8,302.2 L 311.3,303.1 L 318.6,302.0 L 324.7,310.8 L 332.5,306.8 L 336.5,302.8 L 335.1,298.3 L 336.4,296.9 L 331.9,292.9 L 333.9,288.3 L 340.4,290.2 L 346.7,290.3 L 345.9,285.6 L 334.8,281.2 L 324.9,281.7 L 322.4,283.8 L 320.6,283.1 L 320.8,281.4 L 318.5,279.2 L 314.7,278.5 L 314.9,275.0 L 310.3,267.6 L 313.7,261.9 L 316.3,261.7 L 319.2,257.1 L 318.6,252.8 L 305.6,252.4 L 305.7,250.4 L 303.7,248.6 L 304.0,245.5 L 298.6,243.3 L 296.8,248.1 L 293.9,251.3 L 294.5,252.3 L 291.8,254.0 L 285.1,244.9 L 282.9,243.9 L 278.6,244.5 L 275.3,251.3 L 270.6,252.0 L 268.8,251.3 L 270.0,242.1 L 268.7,240.2 L 261.6,237.6 L 256.1,239.9 L 251.9,236.9 L 249.0,238.3 L 245.1,247.3 L 245.2,262.6 L 240.5,272.0 L 233.9,280.7 L 222.3,282.7 L 221.8,284.1 Z",
  "Kebbi": "M 71.8,33.1 L 72.5,38.0 L 70.7,46.3 L 63.1,59.1 L 48.3,70.6 L 48.7,87.3 L 46.8,91.6 L 49.0,99.3 L 46.3,102.8 L 48.7,110.6 L 46.1,113.7 L 40.9,115.2 L 40.9,122.8 L 39.1,127.7 L 39.7,133.8 L 48.6,142.4 L 51.6,143.3 L 51.3,149.0 L 53.9,154.2 L 55.5,152.9 L 62.1,153.0 L 65.3,149.1 L 78.8,148.7 L 79.3,152.4 L 81.9,152.6 L 82.4,155.1 L 84.5,156.3 L 92.5,154.2 L 97.0,155.8 L 100.2,154.3 L 101.6,157.0 L 100.0,167.6 L 95.5,172.4 L 91.0,174.2 L 89.4,180.1 L 89.6,185.0 L 93.9,189.3 L 91.9,196.7 L 96.7,196.7 L 98.9,190.3 L 105.2,188.5 L 109.1,190.7 L 112.8,187.2 L 112.1,179.2 L 108.2,178.1 L 106.4,175.7 L 105.9,165.8 L 110.2,165.3 L 112.6,166.3 L 116.8,163.0 L 118.3,163.7 L 120.6,162.5 L 121.0,160.7 L 116.9,157.4 L 116.8,155.8 L 119.6,153.9 L 117.5,147.4 L 102.8,142.4 L 100.6,138.2 L 102.4,137.0 L 100.7,136.1 L 101.1,134.6 L 109.3,131.7 L 110.4,129.8 L 113.8,131.2 L 116.1,137.0 L 118.4,136.0 L 118.1,139.4 L 119.1,137.7 L 127.2,138.7 L 128.0,134.0 L 132.2,131.5 L 136.2,143.8 L 135.2,143.9 L 135.0,148.1 L 137.1,150.6 L 140.6,151.3 L 141.4,150.4 L 143.4,152.8 L 152.0,150.1 L 154.7,146.5 L 160.4,144.2 L 161.3,142.5 L 164.4,141.4 L 166.4,142.9 L 168.5,138.1 L 167.9,141.6 L 170.9,140.5 L 172.4,134.7 L 175.1,132.7 L 174.3,131.4 L 175.8,130.1 L 169.5,129.9 L 166.0,126.0 L 157.3,127.4 L 156.3,121.9 L 157.0,117.6 L 154.6,114.5 L 150.8,114.3 L 149.0,115.7 L 143.7,114.5 L 140.4,116.0 L 137.5,113.2 L 133.0,113.2 L 131.9,109.9 L 130.3,110.8 L 131.1,108.8 L 127.4,110.8 L 124.5,108.8 L 124.4,111.4 L 120.4,111.7 L 118.8,113.2 L 115.9,111.1 L 110.2,113.2 L 110.0,111.1 L 108.0,111.8 L 106.2,110.2 L 101.8,113.8 L 98.6,113.9 L 98.8,115.4 L 92.8,117.1 L 94.0,120.2 L 91.6,122.5 L 89.6,122.4 L 90.3,121.3 L 86.4,118.1 L 86.8,115.2 L 83.9,111.2 L 85.2,110.7 L 86.3,113.2 L 87.3,113.1 L 92.9,108.7 L 94.9,96.0 L 93.1,93.0 L 93.6,86.1 L 91.5,85.0 L 92.9,85.0 L 92.9,82.4 L 95.1,80.0 L 94.9,77.5 L 97.0,75.6 L 100.9,79.1 L 103.2,79.2 L 103.4,74.6 L 106.1,71.9 L 102.0,61.6 L 105.8,55.5 L 100.2,49.5 L 97.8,48.7 L 102.1,43.3 L 100.6,42.3 L 96.6,42.4 L 89.1,36.8 L 84.2,35.6 L 80.5,32.6 Z",
  "Imo": "M 228.9,450.8 L 231.8,440.7 L 237.3,430.4 L 234.7,425.4 L 235.7,425.0 L 235.4,414.7 L 230.1,414.4 L 228.7,413.2 L 225.0,415.3 L 218.6,413.6 L 210.1,420.1 L 209.6,423.3 L 206.2,421.1 L 203.2,423.1 L 200.3,423.2 L 197.6,436.4 L 202.7,436.4 L 203.4,445.2 L 205.3,447.6 L 210.8,450.6 L 217.9,449.1 L 226.5,451.9 Z",
  "Gombe": "M 445.1,171.2 L 442.3,172.5 L 441.5,171.6 L 442.9,157.8 L 442.3,153.1 L 438.3,147.6 L 434.5,144.9 L 431.9,140.4 L 431.5,141.3 L 425.9,141.0 L 420.5,138.3 L 419.7,135.2 L 415.0,140.8 L 416.3,142.3 L 412.7,145.1 L 405.8,145.7 L 404.5,146.9 L 402.8,144.8 L 399.3,148.0 L 397.9,152.1 L 399.7,153.7 L 390.6,166.3 L 394.0,168.7 L 393.8,170.8 L 398.9,176.5 L 402.4,176.7 L 405.4,179.4 L 406.4,178.8 L 407.6,181.3 L 406.8,185.8 L 409.0,188.1 L 408.7,189.8 L 406.2,194.9 L 402.8,195.8 L 401.4,198.1 L 401.7,199.5 L 413.1,208.2 L 415.0,213.8 L 413.7,219.3 L 415.4,220.7 L 414.3,222.1 L 415.5,225.0 L 421.6,226.7 L 427.0,224.5 L 436.9,225.7 L 439.3,222.9 L 444.1,222.6 L 446.6,219.9 L 448.2,221.2 L 453.7,216.7 L 454.7,217.3 L 458.5,213.2 L 458.5,211.7 L 456.0,210.3 L 457.7,205.7 L 457.7,200.3 L 455.4,200.0 L 451.5,193.0 L 447.1,191.2 L 445.4,187.4 L 442.4,185.8 L 443.5,182.9 L 449.0,176.8 L 444.5,172.3 Z",
  "Adamawa": "M 457.7,200.3 L 457.7,205.7 L 456.0,210.3 L 458.7,212.8 L 456.8,215.5 L 448.2,221.2 L 446.6,219.9 L 444.1,222.6 L 439.3,222.9 L 437.4,225.5 L 437.9,228.4 L 442.2,232.9 L 442.4,237.1 L 448.3,238.2 L 450.3,242.1 L 451.4,250.4 L 457.5,253.6 L 459.5,256.8 L 457.3,267.6 L 453.1,270.8 L 455.4,272.7 L 453.8,274.0 L 455.5,278.4 L 446.6,285.1 L 447.4,286.0 L 443.2,293.3 L 434.0,302.7 L 433.0,305.1 L 440.4,316.5 L 443.5,311.1 L 445.4,310.8 L 448.2,313.0 L 447.6,319.0 L 453.8,320.4 L 454.5,332.7 L 458.6,337.7 L 468.0,328.2 L 467.2,323.4 L 468.1,319.6 L 477.0,306.3 L 476.0,300.5 L 478.7,295.8 L 477.8,289.9 L 478.6,284.8 L 480.2,283.6 L 482.5,284.3 L 488.0,282.4 L 495.3,281.9 L 496.1,280.4 L 500.0,281.8 L 503.7,276.3 L 507.3,276.7 L 506.8,272.2 L 509.9,267.0 L 510.0,262.1 L 508.2,255.6 L 512.3,254.4 L 513.1,250.8 L 510.9,236.0 L 517.2,228.3 L 525.3,226.7 L 528.0,224.0 L 529.0,215.0 L 527.8,206.9 L 530.3,203.6 L 528.3,200.1 L 531.9,196.9 L 537.0,195.5 L 539.5,192.4 L 539.2,190.7 L 541.4,190.9 L 540.6,181.8 L 542.0,181.6 L 543.8,169.3 L 553.6,154.5 L 544.9,152.7 L 535.2,156.4 L 533.3,153.7 L 531.8,164.5 L 527.6,171.4 L 528.6,174.9 L 525.9,180.8 L 518.6,177.9 L 514.3,173.7 L 503.2,171.9 L 498.6,179.2 L 496.3,178.6 L 494.9,176.5 L 493.8,181.5 L 487.0,182.7 L 484.9,183.8 L 485.3,185.6 L 481.6,185.7 L 478.8,183.4 L 476.6,187.5 L 472.7,189.8 L 470.4,194.6 L 470.3,198.9 L 466.9,198.6 L 465.5,200.2 L 462.1,200.8 Z",
  "Yobe": "M 487.4,42.3 L 476.0,39.3 L 471.3,40.0 L 457.4,32.1 L 438.5,26.4 L 421.2,27.3 L 402.6,25.9 L 373.2,32.6 L 360.4,41.1 L 348.9,54.7 L 354.1,56.7 L 358.7,55.4 L 365.2,48.3 L 368.4,48.5 L 369.0,47.2 L 371.0,47.8 L 370.7,46.8 L 377.0,45.3 L 380.0,47.3 L 379.0,48.4 L 381.1,53.3 L 380.4,55.7 L 382.1,55.9 L 382.4,54.0 L 389.6,57.0 L 390.6,55.6 L 393.8,56.0 L 395.9,61.9 L 394.9,64.2 L 395.1,68.5 L 396.0,68.8 L 395.3,70.7 L 398.4,70.5 L 403.4,73.3 L 405.8,91.4 L 407.2,93.1 L 407.1,99.1 L 405.8,101.0 L 406.7,104.0 L 411.1,107.0 L 412.3,109.7 L 411.7,136.0 L 413.1,135.7 L 412.2,137.0 L 415.0,140.8 L 419.7,135.2 L 420.5,138.3 L 425.9,141.0 L 431.5,141.3 L 431.9,140.4 L 434.5,144.9 L 439.4,148.9 L 442.5,153.7 L 441.5,170.9 L 442.3,172.5 L 453.6,167.6 L 453.5,159.8 L 447.6,158.7 L 447.9,156.5 L 455.0,153.4 L 458.5,153.5 L 460.9,151.7 L 461.3,153.2 L 463.3,152.6 L 468.1,147.5 L 473.6,147.5 L 474.3,145.5 L 471.8,142.3 L 471.3,136.7 L 475.3,134.4 L 476.0,131.5 L 482.1,126.6 L 484.6,121.5 L 480.9,118.4 L 479.7,114.0 L 477.1,117.2 L 475.7,115.9 L 478.2,108.0 L 479.5,107.1 L 478.8,103.4 L 480.0,98.3 L 477.8,90.9 L 480.2,84.2 L 479.4,80.8 L 480.3,80.9 L 480.3,76.0 L 483.6,74.2 L 484.8,71.0 L 486.9,70.8 L 488.1,69.0 L 487.3,66.7 L 489.2,66.2 L 491.2,62.1 L 490.2,56.4 L 486.4,53.4 L 485.7,50.4 Z",
  "Abia": "M 260.2,426.4 L 255.9,423.3 L 254.1,419.7 L 242.4,418.6 L 240.8,415.2 L 242.1,412.5 L 241.7,409.0 L 236.3,409.7 L 235.0,408.1 L 232.6,407.9 L 231.6,410.1 L 228.8,410.5 L 229.3,414.1 L 235.4,414.7 L 235.7,425.0 L 234.7,425.4 L 237.3,430.4 L 230.2,445.1 L 228.9,450.5 L 230.2,453.8 L 227.7,462.4 L 223.1,466.0 L 223.4,468.1 L 226.5,469.5 L 231.6,468.3 L 236.5,469.0 L 240.7,470.7 L 239.5,466.8 L 240.3,464.4 L 238.7,463.2 L 242.4,459.7 L 241.6,459.3 L 243.0,457.6 L 242.0,453.9 L 243.3,447.7 L 242.4,446.2 L 248.6,444.6 L 248.7,443.0 L 246.6,442.7 L 248.4,438.9 L 250.7,439.6 L 250.5,435.1 L 253.4,435.4 L 255.3,439.2 L 258.9,440.2 L 259.6,443.0 L 265.1,443.2 L 261.1,434.2 L 261.6,428.3 Z",
  "Ekiti": "M 154.2,319.2 L 155.1,317.4 L 152.0,315.0 L 147.7,315.0 L 146.2,313.0 L 145.5,308.2 L 147.8,308.0 L 148.9,305.9 L 147.5,303.3 L 148.3,302.2 L 144.4,302.3 L 140.8,305.1 L 141.2,300.3 L 134.9,300.7 L 132.1,305.6 L 125.3,305.1 L 122.6,302.8 L 119.7,304.8 L 118.4,304.0 L 116.3,308.4 L 111.0,313.8 L 111.3,316.9 L 108.7,325.7 L 114.8,336.3 L 118.8,334.1 L 126.4,335.5 L 131.3,335.0 L 133.4,342.7 L 134.9,343.3 L 141.6,340.8 L 145.5,334.6 L 147.6,326.3 L 150.0,325.2 L 150.5,322.5 Z",
  "Osun": "M 95.9,356.4 L 96.8,352.6 L 102.8,346.5 L 103.2,339.3 L 115.8,337.7 L 113.1,334.8 L 108.7,325.7 L 111.3,316.9 L 111.0,313.8 L 117.1,307.3 L 118.4,304.0 L 117.5,302.3 L 114.2,304.9 L 111.8,301.9 L 108.6,301.1 L 106.4,303.3 L 103.8,302.5 L 98.8,303.8 L 96.6,302.1 L 93.5,303.2 L 92.9,307.6 L 87.9,309.3 L 87.1,311.7 L 85.3,311.4 L 84.0,313.9 L 81.9,309.4 L 79.3,307.5 L 75.0,310.7 L 75.3,313.1 L 69.9,313.3 L 68.5,318.8 L 69.2,322.3 L 68.1,323.0 L 72.4,326.9 L 73.2,331.6 L 71.0,341.0 L 71.9,343.7 L 69.5,347.6 L 69.1,351.0 L 73.9,349.0 L 75.3,355.5 L 80.4,353.3 L 84.0,355.1 L 85.0,359.0 Z",
  "Bauchi": "M 392.9,228.9 L 404.5,230.8 L 415.4,220.7 L 413.7,219.3 L 415.0,213.8 L 413.1,208.2 L 401.7,199.5 L 401.4,198.1 L 402.8,195.8 L 406.2,194.9 L 408.7,189.8 L 409.0,188.1 L 406.8,185.8 L 407.6,181.3 L 406.4,178.8 L 405.4,179.4 L 402.4,176.7 L 398.9,176.5 L 393.8,170.8 L 394.0,168.7 L 390.6,166.3 L 399.7,153.7 L 398.0,151.3 L 401.2,145.7 L 402.8,144.8 L 404.5,146.9 L 405.8,145.7 L 412.3,145.3 L 416.3,142.3 L 412.2,137.0 L 413.1,135.7 L 411.7,136.0 L 412.3,109.7 L 411.1,107.0 L 406.7,104.0 L 405.8,101.0 L 407.1,99.1 L 407.2,93.1 L 405.8,91.4 L 403.4,73.3 L 398.0,70.4 L 395.4,71.1 L 395.9,72.9 L 388.8,75.2 L 385.5,73.9 L 382.8,75.1 L 378.7,74.2 L 377.1,75.5 L 378.5,77.7 L 376.2,79.6 L 376.2,81.8 L 373.2,85.7 L 374.3,89.5 L 373.4,93.4 L 374.6,95.9 L 370.6,97.1 L 368.5,99.2 L 359.9,101.5 L 357.5,103.8 L 351.2,105.9 L 349.7,105.1 L 349.3,109.3 L 346.7,111.1 L 351.0,112.6 L 354.8,111.8 L 355.9,114.1 L 357.2,114.1 L 356.3,117.7 L 357.5,118.9 L 357.3,122.1 L 355.2,123.8 L 355.0,125.7 L 355.9,127.0 L 358.6,125.8 L 359.7,126.7 L 359.9,131.4 L 361.7,132.0 L 361.4,133.6 L 366.4,136.5 L 370.0,136.0 L 375.0,138.5 L 384.2,139.5 L 382.4,144.0 L 380.4,143.7 L 379.3,145.5 L 376.7,145.1 L 374.3,147.0 L 373.6,149.8 L 376.8,152.8 L 372.0,152.6 L 371.4,150.5 L 366.1,152.4 L 359.2,150.1 L 358.4,146.6 L 360.2,145.2 L 359.8,139.8 L 357.0,135.5 L 349.7,138.6 L 345.6,137.2 L 346.3,133.7 L 341.5,133.7 L 340.7,135.6 L 336.4,134.5 L 333.1,132.0 L 330.1,131.9 L 324.5,134.1 L 322.3,133.0 L 319.9,133.7 L 311.7,140.8 L 310.4,144.0 L 306.0,144.7 L 304.7,149.1 L 305.2,153.1 L 304.1,153.1 L 303.0,157.2 L 308.5,165.3 L 304.8,170.8 L 304.6,177.1 L 303.2,179.2 L 306.3,182.3 L 312.0,183.7 L 313.1,185.0 L 312.2,190.7 L 314.7,192.7 L 312.7,200.7 L 314.6,202.7 L 315.9,202.6 L 315.9,200.4 L 319.6,200.9 L 322.0,199.0 L 328.5,200.5 L 326.5,201.1 L 326.7,203.6 L 327.4,209.3 L 329.4,210.1 L 327.3,213.3 L 323.3,215.2 L 326.6,218.5 L 330.0,217.8 L 330.3,222.1 L 332.1,223.1 L 331.0,224.3 L 333.3,226.4 L 335.6,226.4 L 337.0,229.3 L 344.2,229.5 L 345.3,227.5 L 344.7,225.4 L 348.2,226.9 L 353.1,226.4 L 357.4,222.9 L 363.9,222.2 L 365.4,220.9 L 364.4,217.7 L 369.2,216.0 L 373.4,218.8 L 378.9,218.3 L 384.5,222.7 L 390.3,225.3 Z",
  "Niger": "M 234.6,236.6 L 227.2,237.5 L 225.7,230.1 L 228.2,227.0 L 227.3,224.7 L 230.9,221.4 L 225.9,214.6 L 226.8,213.1 L 230.2,212.4 L 229.3,200.8 L 227.3,199.8 L 220.9,200.7 L 213.2,199.6 L 209.7,196.0 L 211.4,192.3 L 212.7,192.7 L 214.7,189.4 L 216.0,189.5 L 218.2,185.6 L 216.6,183.6 L 211.9,182.8 L 213.3,177.0 L 211.6,174.5 L 209.1,173.2 L 207.6,174.4 L 207.1,169.6 L 205.8,168.6 L 201.6,168.6 L 201.9,171.4 L 198.0,171.2 L 193.2,173.7 L 190.3,170.0 L 185.4,172.3 L 181.3,177.1 L 180.7,180.1 L 178.3,179.8 L 177.4,182.1 L 174.1,183.4 L 173.5,176.0 L 170.2,174.9 L 170.2,173.7 L 171.9,173.1 L 171.3,170.4 L 172.6,167.2 L 170.2,165.8 L 171.4,163.6 L 170.7,161.7 L 172.4,159.2 L 171.7,158.1 L 173.6,157.7 L 173.7,155.7 L 176.5,155.0 L 178.9,151.8 L 173.7,147.8 L 167.9,147.2 L 166.4,142.9 L 164.4,141.4 L 156.0,145.5 L 152.0,150.1 L 143.3,152.8 L 141.4,150.4 L 137.8,150.9 L 135.0,148.1 L 135.2,143.9 L 136.2,143.8 L 132.2,131.5 L 128.0,134.0 L 127.2,138.7 L 119.1,137.7 L 118.1,139.4 L 118.4,136.0 L 116.1,137.0 L 113.8,131.2 L 110.4,129.8 L 109.3,131.7 L 101.1,134.6 L 100.7,136.1 L 102.4,137.0 L 100.6,138.2 L 102.8,142.4 L 117.5,147.4 L 119.6,153.9 L 116.8,155.8 L 116.9,157.4 L 121.0,160.7 L 120.6,162.5 L 118.3,163.7 L 116.8,163.0 L 112.6,166.3 L 110.2,165.3 L 105.9,165.8 L 106.4,175.7 L 108.2,178.1 L 112.1,179.2 L 112.8,187.2 L 109.1,190.7 L 105.2,188.5 L 98.9,190.3 L 96.7,196.7 L 91.9,196.7 L 93.9,189.3 L 89.6,185.0 L 89.4,180.1 L 91.0,174.2 L 95.5,172.4 L 100.0,167.6 L 101.6,157.0 L 100.2,154.3 L 97.0,155.8 L 92.5,154.2 L 84.5,156.3 L 82.4,155.1 L 81.9,152.6 L 79.3,152.4 L 78.8,148.7 L 65.3,149.1 L 62.1,153.0 L 55.5,152.9 L 53.9,154.2 L 52.8,160.3 L 57.2,165.1 L 58.2,171.6 L 55.1,181.0 L 49.6,178.8 L 47.4,180.5 L 44.5,187.7 L 49.4,192.7 L 51.9,198.5 L 52.6,197.7 L 54.6,200.4 L 55.4,198.4 L 58.6,199.4 L 60.6,201.1 L 59.8,202.7 L 62.9,202.5 L 62.2,203.8 L 64.0,204.7 L 62.2,206.4 L 64.7,207.6 L 65.5,206.9 L 66.5,209.5 L 69.6,209.8 L 71.2,208.2 L 71.4,209.6 L 73.1,209.2 L 83.0,223.5 L 96.0,235.2 L 97.4,238.0 L 102.4,240.1 L 104.7,247.0 L 116.3,243.4 L 123.5,248.5 L 127.4,253.1 L 141.8,257.2 L 147.6,262.6 L 152.0,263.4 L 155.3,267.5 L 169.8,266.5 L 172.1,267.0 L 173.0,268.6 L 180.7,268.2 L 185.5,273.3 L 188.2,282.8 L 195.6,289.2 L 200.1,296.5 L 201.6,291.8 L 203.7,291.9 L 203.2,290.2 L 207.5,285.4 L 207.0,282.3 L 204.8,282.3 L 205.0,240.0 L 216.4,240.1 L 226.6,248.2 Z",
  "Kaduna": "M 251.9,236.9 L 256.1,239.9 L 261.6,237.6 L 268.7,240.2 L 270.0,242.1 L 269.0,251.4 L 272.6,252.2 L 275.3,251.3 L 278.6,244.5 L 282.9,243.9 L 288.0,248.2 L 290.9,254.0 L 294.5,252.3 L 293.9,251.3 L 296.8,248.1 L 300.6,237.4 L 300.5,234.4 L 297.8,233.2 L 293.4,224.5 L 295.7,216.2 L 297.9,213.7 L 297.5,209.0 L 299.7,201.8 L 300.0,191.1 L 302.4,187.8 L 305.7,186.3 L 306.6,182.3 L 303.2,179.2 L 305.4,172.7 L 304.7,171.0 L 301.3,173.8 L 297.9,169.3 L 291.0,168.2 L 289.8,164.8 L 294.3,163.2 L 293.7,161.0 L 295.0,157.3 L 294.1,154.9 L 296.5,149.1 L 296.1,146.4 L 291.7,144.1 L 291.6,141.6 L 288.9,141.2 L 287.4,138.3 L 280.6,137.9 L 278.5,135.3 L 278.9,133.8 L 276.0,133.5 L 271.8,130.0 L 273.8,124.2 L 273.2,123.1 L 270.7,122.8 L 268.1,124.8 L 264.6,124.9 L 260.6,127.6 L 259.1,130.2 L 251.7,130.8 L 251.5,133.5 L 246.0,135.9 L 241.7,131.3 L 235.5,130.4 L 233.5,136.3 L 230.1,135.3 L 225.4,136.7 L 226.6,140.0 L 225.7,142.1 L 223.2,143.4 L 219.1,139.5 L 214.0,137.3 L 216.1,134.8 L 215.9,131.3 L 210.1,130.1 L 207.3,131.7 L 207.4,133.9 L 204.1,133.4 L 203.8,136.2 L 200.8,137.6 L 199.8,142.2 L 201.4,144.6 L 199.4,147.1 L 194.5,148.9 L 191.1,147.8 L 187.4,149.7 L 186.1,148.4 L 181.8,148.7 L 176.5,155.0 L 173.7,155.7 L 173.8,157.3 L 171.7,158.1 L 172.4,159.2 L 170.7,161.7 L 171.4,163.6 L 170.2,165.8 L 172.6,167.2 L 171.3,170.4 L 171.9,173.1 L 170.2,173.7 L 170.2,174.9 L 173.5,176.0 L 174.1,183.4 L 177.4,182.1 L 178.3,179.8 L 180.7,180.1 L 181.3,177.1 L 185.4,172.3 L 190.3,170.0 L 193.2,173.7 L 198.0,171.2 L 201.9,171.4 L 201.6,168.6 L 206.6,169.0 L 207.6,174.4 L 209.1,173.2 L 210.9,173.9 L 213.3,177.0 L 211.9,182.8 L 216.6,183.6 L 218.2,185.6 L 216.0,189.5 L 214.7,189.4 L 213.3,192.1 L 211.5,192.2 L 209.9,194.2 L 210.7,198.1 L 213.2,199.6 L 220.9,200.7 L 227.3,199.8 L 229.5,201.2 L 230.2,212.4 L 226.8,213.1 L 225.9,214.6 L 230.9,221.4 L 227.3,224.7 L 228.2,227.0 L 225.7,230.1 L 227.2,237.5 L 241.1,235.6 L 242.8,233.9 L 248.0,232.8 Z",
  "Enugu": "M 208.7,370.9 L 211.3,373.9 L 215.2,373.0 L 222.3,376.1 L 218.4,381.7 L 217.2,387.0 L 222.8,389.9 L 223.7,393.6 L 222.8,397.9 L 225.6,397.8 L 228.7,405.9 L 231.1,405.9 L 230.8,407.7 L 235.0,408.1 L 236.3,409.7 L 241.7,409.0 L 244.3,411.7 L 250.9,413.7 L 251.2,411.6 L 248.8,407.6 L 252.0,404.1 L 252.3,398.3 L 251.1,394.3 L 253.2,387.3 L 250.1,377.3 L 251.7,376.4 L 256.6,376.9 L 260.8,369.4 L 258.9,364.3 L 255.9,363.7 L 249.4,365.6 L 246.7,362.2 L 244.2,361.2 L 240.8,354.5 L 236.9,352.8 L 235.0,353.6 L 234.9,355.4 L 227.7,359.5 L 226.1,363.1 L 223.4,364.1 L 219.7,368.4 L 215.2,369.2 L 214.5,365.8 L 212.6,368.8 L 211.2,368.4 Z",
  "Taraba": "M 345.7,384.1 L 347.7,382.8 L 351.2,382.9 L 355.6,368.4 L 359.5,369.7 L 374.1,357.0 L 375.6,362.3 L 377.7,364.4 L 391.5,364.4 L 393.8,356.9 L 396.6,354.5 L 404.2,360.4 L 408.0,360.2 L 411.0,368.1 L 418.1,370.9 L 420.0,373.8 L 419.0,379.0 L 421.7,387.0 L 434.5,386.7 L 436.5,384.9 L 437.8,379.3 L 441.4,378.8 L 444.0,375.4 L 445.4,369.5 L 443.6,367.4 L 445.2,363.8 L 459.1,353.6 L 460.1,351.2 L 455.7,345.0 L 453.4,344.3 L 455.9,342.6 L 458.6,337.7 L 454.5,332.7 L 453.8,320.4 L 447.6,319.0 L 448.4,313.5 L 445.4,310.8 L 443.1,311.4 L 440.4,316.5 L 433.0,305.1 L 434.0,302.7 L 443.2,293.3 L 447.4,286.0 L 446.6,285.1 L 455.5,278.4 L 453.8,274.0 L 455.4,272.7 L 453.1,270.8 L 457.3,267.6 L 459.6,257.3 L 457.5,253.6 L 451.4,250.4 L 450.3,242.1 L 448.3,238.2 L 442.4,237.1 L 442.2,232.9 L 437.9,228.4 L 437.4,225.5 L 429.8,225.6 L 427.0,224.5 L 421.6,226.7 L 415.5,225.0 L 414.3,222.1 L 404.5,230.8 L 392.9,228.9 L 394.7,230.8 L 393.8,235.8 L 397.7,247.9 L 397.2,253.1 L 395.7,255.3 L 386.8,257.0 L 378.3,264.0 L 359.9,283.2 L 353.6,287.0 L 346.8,286.1 L 346.3,290.9 L 333.9,288.3 L 331.9,292.9 L 336.4,296.9 L 335.1,298.3 L 336.5,302.8 L 332.5,306.8 L 324.7,310.8 L 321.8,316.8 L 335.1,314.1 L 345.9,314.9 L 360.0,331.5 L 357.0,349.1 L 352.7,354.0 L 348.1,363.5 L 348.1,371.6 Z",
  "Ebonyi": "M 280.4,374.8 L 277.2,368.4 L 276.7,369.6 L 274.3,369.8 L 272.1,373.0 L 265.0,372.5 L 265.1,377.9 L 262.9,382.0 L 259.1,380.5 L 257.3,376.8 L 250.2,376.9 L 253.2,387.3 L 251.1,394.3 L 252.3,398.3 L 252.0,404.1 L 248.8,407.6 L 251.4,412.9 L 248.9,413.7 L 241.7,410.0 L 242.1,412.5 L 240.8,415.2 L 242.4,418.6 L 254.1,419.7 L 255.9,423.3 L 260.2,426.4 L 261.7,422.6 L 264.2,422.1 L 262.3,418.9 L 266.0,415.1 L 264.8,413.9 L 265.0,411.0 L 268.0,410.2 L 268.2,412.6 L 270.7,412.1 L 271.4,413.3 L 276.4,409.4 L 279.8,409.8 L 280.8,404.4 L 286.6,396.5 L 285.3,394.1 L 285.9,391.0 L 288.6,388.3 L 286.1,385.2 L 286.7,383.3 L 285.3,382.8 L 285.3,381.4 L 281.9,379.4 Z"
};


const NGA_LGA_PATHS: Record<string, string> = {
  "Eastern Obolo": "M 243.8,487.3 L 246.4,489.7 L 256.2,487.0 L 255.9,484.3 L 249.3,486.6 L 246.5,484.9 Z",
  "Ekeremor": "M 165.2,467.6 L 165.2,459.5 L 162.9,453.5 L 158.9,458.5 L 155.1,457.6 L 148.6,461.4 L 138.9,457.2 L 137.9,455.1 L 134.3,455.5 L 138.1,466.9 L 144.0,476.5 L 147.8,475.7 L 150.6,471.8 L 154.8,472.3 Z",
  "Degema": "M 208.5,493.3 L 216.9,494.1 L 214.4,487.9 L 215.0,474.4 L 212.8,473.0 L 210.8,474.9 L 211.2,479.9 L 207.3,479.7 L 204.3,476.5 L 207.5,481.9 L 206.2,485.8 Z",
  "Andoni": "M 231.9,491.2 L 244.7,490.6 L 245.1,488.6 L 239.6,488.6 L 238.2,485.7 L 239.5,483.7 L 230.9,483.2 L 228.8,487.9 L 232.7,488.4 Z",
  "Akpabuyo": "M 285.5,473.4 L 287.4,470.2 L 294.9,469.6 L 300.8,461.3 L 289.3,460.2 L 285.5,455.5 L 283.5,462.7 L 285.7,463.9 L 280.8,470.1 Z",
  "Oron": "M 280.8,473.9 L 275.5,464.4 L 276.5,471.4 L 274.7,472.9 Z",
  "Bakassi": "M 285.5,473.4 L 285.1,475.4 L 288.7,474.8 L 289.8,476.1 L 288.4,477.7 L 291.2,478.0 L 293.0,472.3 L 297.3,471.0 L 296.4,467.4 L 294.9,469.6 L 287.4,470.2 Z",
  "Calabar South": "M 283.5,462.7 L 276.8,465.4 L 279.4,469.6 L 282.6,468.8 L 283.7,464.6 L 285.4,464.7 Z",
  "Udung Uko": "M 276.9,473.6 L 275.8,477.4 L 278.7,475.2 L 281.7,476.8 L 280.8,473.9 Z",
  "Southern Ijaw": "M 142.1,475.0 L 150.5,487.1 L 157.7,493.1 L 163.4,494.8 L 165.3,490.5 L 172.5,486.1 L 174.9,482.5 L 177.5,469.7 L 173.4,469.9 L 172.6,462.1 L 169.3,458.9 L 169.2,471.3 L 165.0,471.7 L 165.2,467.6 L 154.8,472.3 L 150.6,471.8 L 146.9,476.1 Z",
  "Iwajowa": "M 33.0,314.6 L 30.6,312.7 L 28.4,304.0 L 26.4,301.4 L 24.7,301.8 L 25.5,299.8 L 22.1,299.1 L 24.4,296.2 L 21.2,296.7 L 21.1,295.0 L 13.4,292.4 L 2.7,294.2 L 0.1,312.2 L 1.0,313.7 L 5.7,308.6 L 11.8,309.7 L 9.4,313.5 L 11.4,321.2 L 14.8,313.5 L 17.0,316.7 L 17.8,312.9 L 19.6,312.6 L 22.6,313.8 L 22.2,316.0 L 27.6,317.9 Z",
  "Ibarapa North": "M 17.0,316.7 L 14.0,326.5 L 18.6,331.0 L 19.1,334.5 L 24.6,333.6 L 25.1,330.5 L 30.1,333.2 L 32.5,332.0 L 33.2,324.7 L 31.4,320.7 L 29.2,320.1 L 29.5,317.5 L 22.2,316.0 L 22.6,313.8 L 19.6,312.6 L 17.8,312.9 Z",
  "Okrika": "M 214.8,482.0 L 216.8,491.1 L 223.6,489.9 L 224.4,483.6 L 219.8,478.5 L 219.9,476.4 L 221.8,479.2 L 222.6,475.9 L 219.5,471.7 L 218.4,474.9 L 215.0,474.5 Z",
  "Imeko Afon": "M 1.0,313.7 L 2.5,316.0 L 2.1,341.5 L 5.4,339.4 L 9.0,344.2 L 12.2,344.5 L 13.1,342.3 L 11.0,339.6 L 16.0,340.1 L 16.4,335.7 L 19.1,334.5 L 18.6,331.0 L 14.0,326.5 L 17.0,316.7 L 14.8,313.5 L 11.4,321.2 L 9.4,313.5 L 11.9,309.8 L 6.2,308.5 Z",
  "Ibeno": "M 256.2,487.0 L 280.7,485.2 L 276.6,483.1 L 265.6,482.7 L 262.7,485.0 L 255.9,484.3 Z",
  "Nembe": "M 192.6,488.0 L 189.3,482.2 L 187.2,483.0 L 189.7,484.2 L 190.9,489.3 Z M 173.6,484.6 L 173.1,490.0 L 177.9,493.2 L 177.6,495.3 L 179.1,493.7 L 181.8,495.2 L 187.6,493.5 L 184.9,481.8 L 178.1,479.7 Z",
  "Ilaje": "M 114.3,415.9 L 117.8,409.3 L 112.7,405.8 L 107.5,398.3 L 109.2,387.7 L 101.3,389.7 L 93.7,384.1 L 92.3,388.7 L 89.1,389.6 L 94.3,390.2 L 95.3,392.6 L 94.1,394.6 L 89.6,393.1 L 102.8,403.6 Z",
  "Brass": "M 157.7,493.1 L 170.0,500.0 L 176.7,499.3 L 177.5,493.3 L 173.1,490.0 L 173.6,484.6 L 165.3,490.5 L 163.8,494.7 Z M 192.6,488.0 L 193.9,485.2 L 191.2,480.6 L 196.0,475.2 L 192.5,474.7 L 188.6,477.0 L 184.9,481.8 L 187.6,493.5 L 179.7,494.5 L 177.2,498.5 L 193.1,497.1 L 191.2,494.5 L 190.2,485.3 L 187.2,483.4 L 189.3,482.2 Z",
  "Warri North": "M 114.3,415.9 L 124.0,431.2 L 127.9,429.7 L 134.2,430.9 L 137.3,428.1 L 137.2,425.2 L 131.7,424.1 L 134.6,419.2 L 144.1,421.6 L 142.9,415.9 L 139.0,413.6 L 139.2,408.6 L 132.2,408.9 L 133.5,411.6 L 129.3,414.9 L 127.9,410.9 L 129.0,407.2 L 127.2,406.7 L 126.6,402.4 L 123.9,401.5 L 122.8,402.7 L 121.9,401.5 Z",
  "Ese Odo": "M 117.8,409.3 L 122.3,400.3 L 115.4,394.6 L 110.8,386.3 L 108.7,387.3 L 107.5,398.3 L 112.7,405.8 Z",
  "Jalingo": "M 438.0,264.0 L 440.0,262.3 L 435.9,259.0 L 435.4,255.6 L 427.8,251.4 L 427.4,256.2 Z",
  "Burutu": "M 159.6,456.3 L 159.5,452.9 L 153.6,451.7 L 156.0,448.3 L 152.4,448.4 L 150.8,440.5 L 145.8,442.4 L 141.9,440.9 L 131.5,443.1 L 133.1,453.3 L 137.7,454.4 L 142.2,458.8 L 148.6,461.4 L 155.1,457.6 L 158.9,458.5 Z M 137.1,442.0 L 130.5,437.8 L 126.9,438.5 Z",
  "Girei": "M 496.0,241.1 L 498.4,238.5 L 495.3,237.3 L 496.9,234.2 L 494.2,231.8 L 498.4,224.8 L 485.0,222.2 L 479.5,227.3 L 488.0,239.0 L 491.5,241.9 Z",
  "Yorro": "M 438.0,264.0 L 442.5,271.4 L 455.1,273.3 L 448.6,265.7 L 443.7,255.8 L 451.4,250.4 L 450.7,246.5 L 445.5,247.1 L 441.6,250.5 L 436.9,250.2 L 432.7,254.5 L 439.9,262.0 Z",
  "Ardo-Kola": "M 426.8,253.2 L 422.2,251.8 L 418.7,247.7 L 413.7,253.9 L 410.4,263.2 L 417.3,268.0 L 418.8,272.1 L 426.0,276.2 L 429.7,275.5 L 429.8,270.1 L 433.1,268.7 L 436.3,271.4 L 442.5,271.4 L 438.0,263.6 L 427.4,256.2 Z",
  "Yola North": "M 488.0,239.0 L 486.3,238.7 L 485.8,242.5 L 490.8,242.6 Z",
  "Yola South": "M 491.5,241.9 L 485.8,242.5 L 486.3,238.7 L 488.0,239.0 L 481.6,231.2 L 479.3,231.5 L 477.5,234.8 L 471.0,235.2 L 469.8,237.7 L 469.6,239.8 L 473.2,241.6 L 479.1,240.5 L 482.4,242.1 L 484.7,245.4 L 482.4,251.3 L 483.6,251.8 L 486.5,247.8 L 495.1,248.4 L 496.0,241.1 Z",
  "Mbo": "M 275.8,477.4 L 276.7,478.9 L 273.4,479.3 L 272.5,482.8 L 280.7,485.2 L 282.9,482.6 L 281.9,477.1 L 278.7,475.2 Z",
  "Lau": "M 432.7,254.5 L 436.9,250.2 L 441.6,250.5 L 445.5,247.1 L 450.8,246.6 L 448.3,238.2 L 442.4,237.1 L 441.9,233.1 L 431.6,239.4 L 428.9,243.1 L 418.9,247.6 L 422.5,252.0 L 426.8,253.2 L 429.1,251.1 Z",
  "Ibarapa Central": "M 19.1,334.5 L 23.1,338.4 L 27.8,338.9 L 30.7,341.7 L 35.3,335.0 L 34.2,332.2 L 30.1,333.2 L 25.1,330.5 L 24.6,333.6 Z",
  "Abeokuta North": "M 15.1,340.3 L 20.2,344.8 L 20.1,349.3 L 22.6,352.1 L 21.8,354.9 L 25.0,355.8 L 33.3,350.3 L 33.3,347.6 L 31.1,348.3 L 31.1,344.9 L 26.2,343.6 L 23.9,338.6 L 19.1,334.5 L 16.4,335.7 Z",
  "Bonny": "M 228.8,487.9 L 226.5,485.7 L 222.5,494.6 L 232.1,492.4 L 232.7,488.4 Z",
  "Warri South-West": "M 150.7,440.7 L 155.0,439.0 L 153.1,436.5 L 149.2,437.8 L 146.6,435.3 L 141.5,436.0 L 140.9,439.0 L 143.4,441.8 Z M 137.1,442.0 L 139.1,441.3 L 141.7,435.3 L 144.6,435.3 L 138.9,429.2 L 135.9,428.9 L 134.9,431.6 L 126.2,430.8 L 123.7,433.2 L 126.9,438.6 L 130.5,437.8 Z M 137.3,428.1 L 140.9,428.4 L 140.6,422.9 L 143.0,422.7 L 138.3,419.1 L 134.6,419.2 L 131.7,424.1 L 137.2,425.2 Z",
  "Warri South": "M 142.6,422.0 L 140.6,422.9 L 141.9,425.9 L 139.8,429.2 L 143.0,433.5 L 149.2,437.8 L 154.5,436.5 L 154.5,433.6 L 148.3,430.1 L 150.2,427.6 L 145.6,424.0 L 145.4,421.4 Z",
  "Akuku Toru": "M 205.3,476.2 L 204.9,471.4 L 202.7,471.1 L 202.3,474.1 L 196.8,475.8 L 191.2,480.6 L 193.9,485.2 L 191.2,491.6 L 193.1,497.1 L 200.9,496.4 L 199.7,492.8 L 201.8,482.2 L 201.4,495.8 L 209.4,495.5 L 206.5,487.9 L 207.6,482.7 L 204.9,479.4 Z",
  "Isokan": "M 69.5,347.6 L 78.5,345.5 L 79.8,342.4 L 72.2,337.1 L 71.7,344.6 Z",
  "Irewole": "M 79.8,342.4 L 81.5,339.7 L 80.2,333.5 L 72.2,333.6 L 73.3,339.2 L 76.8,339.1 Z",
  "Essien Udim": "M 249.9,459.8 L 253.9,458.6 L 254.6,455.2 L 242.3,453.1 L 243.6,458.2 L 246.8,461.0 Z",
  "Onna": "M 260.8,484.7 L 259.5,478.9 L 255.8,476.5 L 255.9,484.3 Z",
  "Udenu": "M 250.1,365.7 L 243.4,359.1 L 236.7,365.2 L 245.7,369.4 L 246.5,366.2 L 249.1,367.6 Z",
  "Ogu Bolo": "M 229.7,484.9 L 226.1,475.9 L 221.7,477.5 L 228.8,487.9 Z",
  "Enugu South": "M 244.6,389.6 L 245.3,387.3 L 242.8,386.4 L 242.2,388.5 L 240.0,387.5 L 238.2,389.2 L 242.5,391.4 Z",
  "Ikot Ekpene": "M 253.4,454.7 L 254.2,450.5 L 251.8,447.6 L 248.4,449.2 L 248.6,454.3 Z",
  "Nsit Ubium": "M 268.3,475.1 L 264.9,473.2 L 264.3,470.4 L 263.4,473.6 L 262.0,471.3 L 259.1,472.9 L 259.4,476.6 L 264.8,478.4 L 268.8,477.8 Z",
  "Urue Offong/Oruko": "M 274.7,472.9 L 270.8,476.7 L 273.4,479.3 L 276.9,478.3 L 276.9,473.6 Z",
  "Abak": "M 249.9,459.8 L 250.3,461.9 L 254.9,463.1 L 255.7,468.1 L 257.4,460.3 L 256.2,457.7 Z",
  "Nkanu East": "M 244.6,389.6 L 243.7,392.8 L 247.6,393.0 L 243.6,396.2 L 242.6,402.2 L 246.9,402.7 L 248.8,406.9 L 252.0,404.1 L 252.0,380.9 L 247.3,380.5 L 248.6,382.8 Z",
  "Igbo-Eze-South": "M 239.9,362.2 L 234.9,360.0 L 235.1,356.3 L 231.5,357.5 L 230.6,360.9 L 233.8,363.8 L 236.8,365.1 Z",
  "Nsukka": "M 236.8,365.1 L 230.7,361.1 L 231.5,357.5 L 227.7,359.5 L 225.8,363.1 L 230.9,366.0 L 229.4,370.5 L 233.1,372.5 L 234.8,369.8 L 236.5,370.1 L 245.6,375.9 L 245.9,369.4 Z",
  "Tai": "M 227.3,477.9 L 232.8,476.4 L 227.2,470.9 L 224.9,472.0 Z",
  "Ife North": "M 86.7,348.1 L 89.0,345.1 L 91.4,345.1 L 90.0,341.7 L 92.8,336.5 L 88.8,334.2 L 89.9,329.2 L 88.4,327.7 L 84.1,336.1 Z",
  "Ayedade": "M 69.5,347.6 L 69.1,351.0 L 73.9,349.0 L 75.6,355.7 L 79.5,353.3 L 83.0,354.6 L 86.0,351.4 L 84.2,335.3 L 87.4,327.8 L 89.3,328.6 L 90.9,326.9 L 89.8,325.7 L 85.3,327.2 L 80.7,325.8 L 82.8,327.7 L 79.0,331.9 L 81.5,338.3 L 80.7,342.1 L 78.5,345.5 Z",
  "Ayedire": "M 80.2,333.5 L 79.2,331.0 L 82.8,327.7 L 80.4,324.1 L 72.5,327.2 L 72.9,333.2 Z",
  "Ahoada East": "M 199.0,467.8 L 200.7,466.1 L 198.8,465.6 L 201.8,457.1 L 200.3,454.7 L 201.9,453.8 L 198.6,449.9 L 198.6,451.9 L 194.5,452.8 L 194.4,460.7 L 192.8,462.9 L 196.0,463.2 L 196.5,466.4 Z",
  "Iseyin": "M 29.5,317.5 L 29.2,320.1 L 31.4,320.7 L 33.2,324.7 L 39.0,320.7 L 42.2,321.5 L 44.3,316.7 L 47.0,321.1 L 49.6,321.8 L 52.8,313.3 L 51.0,307.0 L 58.1,294.5 L 58.3,289.0 L 49.8,285.0 L 45.0,295.0 L 44.2,301.2 L 38.7,301.0 L 37.4,310.5 L 32.4,315.9 L 29.5,315.6 Z",
  "Itesiwaju": "M 26.9,302.4 L 30.2,298.6 L 30.0,296.1 L 32.5,295.4 L 36.9,298.3 L 36.1,301.8 L 38.3,303.5 L 38.7,301.0 L 44.2,301.2 L 49.6,284.7 L 42.8,285.4 L 39.3,288.7 L 33.5,290.0 L 26.8,286.6 L 19.9,289.6 L 10.1,288.4 L 8.9,292.6 L 13.4,292.4 L 21.1,295.0 L 21.2,296.7 L 24.4,296.2 L 22.1,299.1 L 25.5,299.8 L 24.7,301.8 Z",
  "Kajola": "M 33.0,314.6 L 38.7,307.5 L 38.3,303.5 L 36.1,301.8 L 36.9,298.3 L 32.5,295.4 L 30.0,296.1 L 30.2,298.6 L 26.8,303.0 L 30.1,306.9 L 28.9,308.6 L 30.6,312.7 Z",
  "Nkanu West": "M 238.7,390.3 L 236.8,391.5 L 237.7,395.0 L 242.6,398.8 L 247.6,392.8 L 243.7,392.8 L 244.6,389.6 L 243.2,391.4 Z",
  "Afikpo North": "M 264.2,422.1 L 262.3,418.9 L 266.0,415.1 L 265.3,410.2 L 258.3,411.7 L 260.2,422.0 Z",
  "Donga": "M 403.6,326.0 L 401.7,325.1 L 391.1,331.3 L 386.5,331.4 L 381.6,323.7 L 384.1,321.2 L 384.6,316.4 L 382.0,304.7 L 379.4,302.6 L 355.7,326.1 L 357.8,327.9 L 361.0,326.4 L 366.6,327.6 L 377.2,334.7 L 378.5,337.3 L 377.4,340.1 L 382.0,345.2 L 386.0,344.7 L 386.8,341.5 Z",
  "Oji-River": "M 230.1,395.6 L 227.8,396.4 L 223.6,394.3 L 222.8,397.9 L 225.6,397.8 L 228.7,405.9 L 235.8,409.3 L 236.2,402.7 Z",
  "Oyun": "M 105.4,302.7 L 105.5,297.5 L 102.4,295.8 L 100.0,289.7 L 97.5,289.0 L 91.8,302.1 L 98.8,303.8 Z M 98.0,297.6 L 100.2,294.7 L 103.4,298.9 L 99.7,299.6 Z",
  "Ogbia": "M 175.7,480.7 L 180.3,479.6 L 184.9,481.8 L 188.1,478.0 L 185.5,470.4 L 187.6,465.0 L 186.7,463.0 L 177.7,468.9 Z",
  "Asari-Toru": "M 210.8,474.9 L 208.7,471.1 L 204.9,471.4 L 204.4,475.2 L 207.3,479.7 L 211.2,479.9 Z",
  "Uyo": "M 257.1,462.8 L 260.8,461.6 L 265.2,464.6 L 267.3,460.9 L 262.4,458.1 L 260.2,460.5 L 257.4,460.3 Z",
  "Ikono": "M 255.1,457.3 L 257.4,459.4 L 257.9,449.2 L 255.5,446.7 L 251.7,446.6 L 254.2,450.5 L 253.4,454.9 Z",
  "Baruten": "M 3.2,276.1 L 5.5,274.3 L 11.4,274.2 L 23.6,264.0 L 27.3,265.4 L 34.8,262.2 L 45.4,256.3 L 45.2,254.1 L 50.0,254.2 L 52.6,251.6 L 54.0,246.4 L 49.2,221.2 L 55.3,198.6 L 54.6,200.4 L 51.9,198.5 L 49.6,193.9 L 45.9,204.8 L 41.7,210.2 L 33.7,210.5 L 32.4,212.0 L 33.0,217.5 L 22.5,231.1 L 23.7,238.3 L 20.1,249.3 L 5.1,251.1 L 2.5,266.0 Z",
  "Lagelu": "M 72.9,333.2 L 72.7,327.5 L 68.6,324.2 L 64.7,327.1 L 66.2,330.4 L 62.8,332.2 L 62.6,337.7 L 66.5,335.8 L 66.3,332.8 L 68.2,333.5 L 68.1,335.7 Z",
  "Idah": "M 199.6,359.5 L 201.7,356.9 L 205.3,356.8 L 205.1,351.7 L 201.4,351.7 Z",
  "Machina": "M 354.1,56.7 L 358.7,55.4 L 365.2,48.3 L 377.6,45.6 L 378.9,41.4 L 376.5,41.3 L 374.7,37.5 L 377.0,31.5 L 359.9,41.6 L 348.9,54.7 Z",
  "Ibaji": "M 199.6,359.5 L 196.1,367.3 L 196.5,373.4 L 198.7,381.0 L 203.8,380.7 L 206.0,379.9 L 205.9,373.5 L 213.2,368.0 L 213.8,360.0 L 206.0,354.9 Z",
  "Municipal Area Council": "M 243.3,266.4 L 245.4,261.5 L 245.1,248.8 L 230.1,246.9 L 221.0,256.6 L 223.9,258.8 L 232.0,260.1 L 232.4,258.1 L 239.7,260.9 L 240.5,268.1 L 235.1,268.1 L 232.4,272.8 L 239.6,273.2 Z",
  "Kaiama": "M 54.0,246.4 L 61.0,244.9 L 66.0,252.3 L 78.1,255.8 L 91.7,250.2 L 101.5,250.6 L 103.7,246.3 L 102.4,240.1 L 97.4,238.0 L 83.0,223.5 L 73.1,209.2 L 66.5,209.5 L 65.5,206.9 L 62.2,206.4 L 64.0,204.7 L 62.2,203.8 L 62.9,202.5 L 59.8,202.7 L 60.3,200.8 L 55.4,198.4 L 49.2,221.2 Z",
  "Bakura": "M 153.0,83.0 L 156.7,85.5 L 160.5,81.4 L 160.7,74.8 L 165.9,67.0 L 170.3,64.1 L 170.6,57.5 L 163.6,58.8 L 159.7,55.4 L 152.2,55.1 L 147.3,52.2 L 144.9,56.3 L 149.9,60.9 L 149.4,65.2 L 151.7,65.8 L 151.4,72.7 L 154.2,78.1 Z",
  "Nguru": "M 377.6,45.6 L 380.0,47.3 L 380.4,55.7 L 382.1,55.9 L 382.4,54.0 L 387.6,55.6 L 396.0,52.9 L 388.3,47.8 L 389.3,44.5 L 385.5,41.4 L 388.5,38.3 L 378.9,41.4 Z",
  "Gummi": "M 129.1,109.5 L 127.1,103.5 L 134.0,98.2 L 132.9,91.2 L 135.2,88.7 L 135.7,84.2 L 133.2,83.6 L 131.1,79.6 L 121.3,83.3 L 113.1,81.7 L 113.0,86.0 L 109.2,86.1 L 108.6,89.8 L 108.8,101.6 L 113.9,104.5 L 111.5,109.0 L 112.5,112.1 L 115.9,111.1 L 118.8,113.2 L 124.4,111.4 L 124.5,108.8 L 126.5,110.7 Z",
  "Ajingi": "M 311.0,102.2 L 317.0,101.3 L 321.0,103.0 L 319.5,106.4 L 323.4,106.7 L 325.9,103.0 L 326.5,95.3 L 324.8,93.6 L 323.2,97.1 L 320.7,96.9 L 319.5,94.2 L 313.2,94.1 L 309.0,99.4 L 308.9,102.7 Z",
  "Port-Harcourt": "M 215.0,474.5 L 218.4,474.9 L 219.1,472.3 L 215.8,470.8 L 213.5,473.8 Z",
  "Augie": "M 103.0,59.0 L 105.8,55.5 L 97.8,48.7 L 102.1,43.3 L 93.2,40.3 L 89.3,46.0 L 93.5,48.0 L 92.7,50.3 L 88.9,51.5 L 88.0,53.6 L 93.0,56.3 L 95.8,60.5 L 102.0,61.6 Z",
  "Kebbe": "M 109.2,86.1 L 100.6,86.3 L 100.4,89.9 L 98.7,89.2 L 97.2,94.8 L 94.9,96.0 L 92.9,108.7 L 87.3,113.1 L 84.3,110.4 L 89.6,122.4 L 94.0,120.2 L 92.8,117.1 L 98.8,115.4 L 98.6,113.9 L 101.8,113.8 L 106.2,110.2 L 110.0,111.1 L 110.2,113.2 L 112.6,112.3 L 111.5,109.0 L 113.9,104.5 L 108.8,101.6 Z",
  "Surulere": "M 33.7,383.1 L 31.2,386.1 L 33.6,385.4 Z",
  "Ringim": "M 326.9,98.6 L 331.7,95.1 L 332.6,89.4 L 329.3,90.0 L 325.8,85.1 L 323.3,86.1 L 324.0,83.8 L 321.4,83.3 L 322.7,80.3 L 311.2,82.4 L 313.4,88.4 L 311.5,94.1 L 319.5,94.2 L 320.0,96.6 L 323.2,97.1 L 325.1,93.6 Z",
  "Emuoha": "M 212.1,473.4 L 207.9,460.7 L 201.8,457.1 L 201.2,461.1 L 199.2,462.4 L 198.8,465.6 L 200.7,466.1 L 199.1,468.0 L 202.7,471.1 L 208.7,471.1 L 210.7,474.9 Z M 201.7,456.6 L 203.3,453.8 L 204.8,455.4 L 207.2,453.1 L 203.7,445.6 L 199.5,451.9 L 201.9,453.8 L 200.3,454.7 Z",
  "Isi-Uzo": "M 245.9,369.4 L 246.5,374.2 L 243.3,379.2 L 245.1,380.8 L 250.9,380.0 L 250.7,376.7 L 256.6,376.9 L 260.8,369.4 L 260.1,365.6 L 256.6,363.7 L 251.4,364.8 L 249.1,367.6 L 246.5,366.2 Z",
  "Yenegoa": "M 177.5,469.7 L 186.5,463.5 L 189.9,454.1 L 193.5,451.7 L 192.1,447.2 L 185.0,452.0 L 185.6,454.5 L 183.5,457.2 L 172.9,465.1 L 173.4,469.9 Z",
  "Ilorin East": "M 92.9,280.3 L 95.4,281.5 L 93.4,277.4 Z M 103.9,281.1 L 103.7,277.8 L 110.3,277.1 L 114.2,271.4 L 110.3,267.2 L 95.5,278.3 Z",
  "Alkaleri": "M 414.3,222.1 L 415.0,213.8 L 413.1,208.2 L 401.4,198.1 L 406.2,194.9 L 408.6,189.5 L 402.6,189.6 L 401.0,188.0 L 397.7,190.9 L 394.9,188.8 L 379.4,187.5 L 374.8,192.1 L 373.7,196.2 L 370.5,197.4 L 370.0,201.7 L 366.5,200.9 L 362.0,207.4 L 360.5,205.5 L 356.8,206.7 L 358.3,209.8 L 361.5,209.9 L 360.1,214.4 L 362.3,216.9 L 369.2,216.0 L 373.4,218.8 L 378.9,218.3 L 390.3,225.3 L 392.0,228.7 L 396.7,230.0 L 404.5,230.8 Z",
  "Omumma": "M 224.8,464.6 L 228.1,461.1 L 230.3,453.1 L 228.9,450.8 L 226.0,453.6 Z",
  "Birnin Kudu": "M 347.1,137.8 L 348.9,135.2 L 348.0,131.0 L 344.8,129.6 L 345.7,128.4 L 345.7,130.1 L 347.8,129.9 L 348.2,126.1 L 351.0,125.1 L 348.3,125.6 L 346.3,119.5 L 350.5,115.9 L 347.8,111.9 L 342.6,114.5 L 336.8,121.1 L 333.8,120.9 L 330.2,123.7 L 327.3,126.7 L 325.5,133.1 L 333.1,132.0 L 340.7,135.6 L 341.5,133.7 L 346.3,133.7 L 345.5,137.0 Z",
  "Takum": "M 357.8,327.9 L 360.2,334.0 L 357.5,347.7 L 348.1,363.5 L 345.7,384.1 L 351.2,382.9 L 355.6,368.4 L 359.5,369.7 L 370.9,359.7 L 364.1,356.8 L 362.5,353.3 L 360.6,355.3 L 356.9,353.8 L 360.1,353.1 L 360.9,346.1 L 365.6,346.8 L 367.2,344.7 L 373.8,343.2 L 377.6,347.3 L 379.2,343.6 L 377.2,334.7 L 365.8,327.3 L 361.0,326.4 Z",
  "Esan South-East": "M 196.8,368.8 L 187.1,369.7 L 187.1,372.9 L 182.5,375.3 L 182.3,379.3 L 178.7,382.6 L 180.9,388.5 L 179.7,391.3 L 186.2,389.5 L 191.8,384.7 L 199.0,384.0 Z",
  "Ifedayo": "M 112.8,311.1 L 117.1,307.3 L 117.7,302.4 L 112.4,307.0 Z",
  "Ori Ire": "M 58.1,294.5 L 64.9,296.2 L 64.5,298.8 L 67.2,301.2 L 65.8,304.3 L 67.7,304.0 L 67.7,307.1 L 70.7,309.4 L 75.6,295.4 L 79.4,295.2 L 85.0,290.2 L 78.9,277.2 L 74.5,280.1 L 67.8,279.7 L 62.0,281.7 L 58.3,289.0 Z",
  "Ifelodun": "M 99.1,313.4 L 98.4,310.8 L 104.2,307.7 L 103.5,305.2 L 100.5,305.7 L 99.6,308.0 L 94.3,307.7 L 96.6,313.6 Z",
  "Maradun": "M 170.8,63.1 L 174.1,66.1 L 172.6,69.7 L 174.0,75.5 L 176.6,74.7 L 185.5,79.6 L 187.8,79.0 L 190.6,74.8 L 185.2,72.0 L 186.4,64.8 L 192.2,64.2 L 194.0,59.6 L 190.6,58.5 L 184.3,60.5 L 186.7,57.6 L 190.0,57.1 L 188.4,52.9 L 185.8,54.8 L 182.7,51.1 L 186.7,49.9 L 183.8,47.2 L 188.3,46.2 L 187.4,44.4 L 176.6,45.3 L 172.8,42.0 L 167.9,44.4 L 168.4,47.6 L 166.0,52.3 L 167.3,57.3 L 170.6,57.5 Z",
  "Aninri": "M 242.4,401.0 L 240.6,402.9 L 243.4,406.0 L 241.3,408.9 L 250.9,413.7 L 246.9,402.7 L 243.4,403.3 Z",
  "Abakaliki": "M 267.3,399.5 L 267.7,401.2 L 275.1,398.9 L 276.7,400.6 L 281.6,399.2 L 282.7,396.4 L 285.7,398.8 L 286.5,395.8 L 281.7,393.5 L 273.6,395.4 L 274.2,393.1 L 272.5,391.5 L 269.4,393.5 L 269.8,396.2 Z",
  "Pategi": "M 137.8,281.1 L 141.7,278.1 L 150.8,282.9 L 169.5,285.4 L 176.0,268.0 L 173.0,268.6 L 169.8,266.5 L 155.3,267.5 L 152.0,263.4 L 147.6,262.6 L 143.0,258.6 L 136.7,262.9 L 138.6,267.6 L 136.2,270.4 Z",
  "Biriniwa": "M 354.1,56.7 L 358.9,63.5 L 358.5,65.6 L 360.3,65.8 L 375.2,61.9 L 384.0,56.2 L 380.4,55.7 L 380.0,47.3 L 376.9,45.3 L 365.2,48.3 L 358.7,55.4 Z",
  "Ussa": "M 370.9,359.7 L 376.5,353.2 L 377.6,347.3 L 373.8,343.2 L 367.2,344.7 L 365.6,346.8 L 361.6,345.4 L 360.1,353.1 L 356.9,353.8 L 360.6,355.3 L 362.5,353.3 L 364.1,356.8 Z",
  "Silame": "M 104.2,53.6 L 113.7,49.7 L 116.3,42.0 L 110.0,41.2 L 109.8,39.6 L 101.6,41.3 L 100.6,42.3 L 102.1,43.3 L 97.8,48.7 Z",
  "Takai": "M 333.8,120.9 L 325.3,121.5 L 323.8,116.1 L 322.4,116.1 L 318.9,121.4 L 317.3,121.1 L 317.1,126.4 L 324.5,134.1 L 327.3,126.7 Z",
  "Bwari": "M 245.1,248.8 L 249.0,238.3 L 251.9,236.9 L 248.0,232.8 L 234.6,236.6 L 226.5,249.3 L 232.8,246.6 Z",
  "Edu": "M 136.2,270.4 L 138.6,267.6 L 137.0,261.9 L 142.5,257.7 L 127.4,253.1 L 116.3,243.4 L 109.3,245.7 L 110.9,253.0 L 109.4,260.8 L 118.1,263.6 L 120.4,268.1 L 127.4,271.7 L 132.2,269.2 L 133.3,270.9 Z",
  "Jema'A": "M 270.0,242.1 L 278.0,241.6 L 291.5,228.4 L 294.6,228.1 L 293.5,223.8 L 288.4,226.4 L 283.3,225.8 L 281.2,222.2 L 279.9,224.4 L 277.7,224.1 L 277.1,227.8 L 273.3,225.4 L 273.3,227.7 L 269.2,228.3 L 270.9,230.8 L 267.9,233.6 L 268.6,235.4 L 262.7,237.7 Z",
  "Gumel": "M 339.6,67.3 L 340.7,65.7 L 337.7,61.4 L 331.6,63.6 L 333.0,70.0 Z",
  "Binji": "M 100.6,42.3 L 108.2,39.6 L 114.8,41.7 L 113.8,40.0 L 119.0,37.1 L 113.9,34.5 L 113.2,30.7 L 101.9,27.8 L 100.2,32.8 L 95.5,33.6 L 90.3,37.8 L 96.6,42.4 Z",
  "Kware": "M 142.5,47.1 L 139.5,44.2 L 139.3,40.5 L 135.0,42.0 L 131.8,39.9 L 132.9,36.2 L 132.4,34.3 L 130.3,34.8 L 131.4,32.1 L 130.0,32.3 L 129.8,28.9 L 123.9,28.6 L 122.2,33.1 L 126.8,36.8 L 129.4,36.6 L 127.0,40.5 L 133.0,47.7 L 135.4,46.2 L 137.9,47.9 Z",
  "Bunza": "M 65.2,98.1 L 70.7,94.2 L 73.4,85.0 L 64.7,86.5 L 65.5,82.1 L 64.0,79.3 L 65.9,77.0 L 59.4,75.9 L 56.7,78.5 L 57.1,83.2 L 54.5,86.7 L 55.3,90.8 L 53.6,92.9 L 62.4,94.4 Z",
  "Mopa-Muro": "M 157.3,310.0 L 165.1,299.0 L 169.1,297.6 L 169.9,287.6 L 163.7,289.8 L 156.9,296.9 L 153.5,305.9 Z",
  "Sokoto North": "M 127.7,41.9 L 125.1,42.3 L 126.7,43.8 L 129.1,42.7 Z",
  "Musawa": "M 240.4,93.6 L 241.3,96.4 L 243.9,96.4 L 241.5,100.1 L 243.6,99.0 L 245.4,100.3 L 248.4,95.0 L 252.1,94.9 L 252.5,97.6 L 259.0,97.0 L 259.2,86.4 L 255.6,84.3 L 255.3,87.4 Z",
  "Ethiope West": "M 160.3,420.5 L 161.6,416.4 L 156.1,410.9 L 149.0,407.3 L 144.4,409.9 L 145.0,414.3 L 147.6,412.9 L 151.9,415.3 L 151.6,417.2 L 154.2,417.7 L 156.8,422.0 Z",
  "Ishielu": "M 258.9,381.1 L 257.5,382.0 L 258.4,384.6 L 263.0,385.0 Z M 252.3,398.3 L 255.5,398.0 L 256.2,399.6 L 260.5,396.0 L 259.8,393.5 L 261.7,391.9 L 261.7,387.2 L 255.6,385.5 L 257.3,376.8 L 250.1,377.3 L 253.2,387.3 L 251.1,394.3 Z",
  "Sakaba": "M 132.2,131.5 L 136.2,143.8 L 135.0,148.1 L 137.1,150.6 L 141.4,150.4 L 143.3,152.8 L 147.4,151.9 L 158.9,144.5 L 155.3,143.0 L 156.1,139.4 L 151.4,141.3 L 147.1,137.7 L 139.8,136.8 L 140.0,131.9 L 136.2,129.2 L 132.7,129.7 Z",
  "Kudan": "M 246.9,138.8 L 251.0,140.0 L 253.0,137.3 L 254.2,140.7 L 257.4,141.9 L 256.4,135.0 L 259.4,134.6 L 255.7,130.5 L 251.7,130.8 L 251.5,133.5 L 246.6,135.6 Z",
  "Kachia": "M 228.2,227.0 L 238.0,222.0 L 243.7,224.0 L 248.1,221.4 L 251.5,222.7 L 253.1,218.9 L 256.5,220.4 L 258.0,217.9 L 266.0,224.1 L 270.1,223.4 L 272.4,219.3 L 269.1,213.9 L 266.9,213.3 L 270.2,208.0 L 266.2,204.7 L 267.1,200.0 L 264.8,197.9 L 265.6,195.9 L 263.3,195.2 L 260.4,198.6 L 256.7,198.5 L 255.8,202.1 L 253.1,203.2 L 251.7,201.0 L 247.0,201.2 L 246.6,197.1 L 241.2,191.9 L 237.9,192.5 L 232.8,198.7 L 228.3,200.0 L 230.3,211.9 L 225.9,214.6 L 230.9,221.4 L 227.3,224.7 Z",
  "Sabon Birni": "M 168.4,25.6 L 173.6,28.5 L 176.1,27.4 L 176.1,30.2 L 186.4,30.9 L 193.2,30.0 L 198.3,26.8 L 190.4,16.5 L 180.4,10.8 L 173.3,12.5 L 164.6,9.0 L 160.0,13.8 L 161.8,13.7 L 161.3,16.7 Z",
  "Uzo-Uwani": "M 225.8,363.1 L 218.4,369.2 L 214.9,369.0 L 214.5,365.8 L 208.7,370.9 L 211.3,373.9 L 215.2,373.0 L 222.3,376.1 L 217.3,385.9 L 222.6,383.0 L 225.0,383.9 L 227.4,380.2 L 226.7,374.9 L 230.5,374.8 L 229.4,370.0 L 230.9,366.0 Z",
  "Jaba": "M 273.9,225.4 L 272.1,221.8 L 267.6,224.5 L 263.1,221.0 L 262.0,224.2 L 263.6,233.4 L 261.6,237.6 L 268.6,235.4 L 267.9,233.6 L 270.9,230.8 L 269.2,228.3 L 273.3,227.7 Z",
  "Ibesikpo Asutan": "M 264.5,470.5 L 267.2,469.5 L 266.1,465.5 L 260.6,461.6 L 262.0,471.3 L 263.4,473.6 Z",
  "Sokoto South": "M 129.0,42.7 L 126.9,42.7 L 127.9,45.8 L 130.1,44.5 Z",
  "Yabo": "M 103.0,59.0 L 109.5,60.6 L 108.9,65.4 L 112.2,64.5 L 113.3,66.4 L 115.7,63.1 L 120.6,63.2 L 120.3,58.9 L 118.2,57.2 L 120.6,53.5 L 118.4,49.5 L 111.3,49.4 L 108.7,52.6 L 104.2,53.6 L 105.8,56.3 Z",
  "Damboa": "M 488.6,163.7 L 493.3,159.9 L 495.4,162.7 L 499.3,161.4 L 496.8,158.8 L 499.8,149.2 L 507.4,152.0 L 523.4,152.0 L 523.5,157.3 L 527.8,155.4 L 532.4,157.1 L 531.7,154.5 L 527.0,153.0 L 523.2,143.6 L 526.8,141.1 L 525.6,133.4 L 521.0,132.4 L 511.2,135.8 L 507.4,131.5 L 506.3,134.1 L 497.7,139.0 L 493.0,139.6 L 489.3,136.2 L 490.5,133.2 L 488.0,129.8 L 478.4,132.4 L 476.0,131.5 L 475.3,134.4 L 471.1,137.2 L 471.8,142.3 L 481.7,148.9 L 487.8,158.8 Z",
  "Matazu": "M 255.6,84.3 L 254.3,82.3 L 241.4,79.0 L 242.9,84.0 L 241.9,92.5 L 255.3,87.4 Z",
  "Sandamu": "M 277.8,55.1 L 290.8,54.7 L 288.9,54.2 L 289.2,49.9 L 286.4,44.1 L 283.5,45.5 L 282.9,50.2 L 278.9,51.2 Z",
  "Mashi": "M 258.9,41.4 L 263.4,50.5 L 267.6,50.5 L 268.1,45.9 L 273.7,44.1 L 268.8,29.6 L 256.7,27.8 L 256.6,31.2 L 258.7,33.6 L 262.9,33.6 L 262.8,36.6 Z",
  "Dan Musa": "M 241.9,92.5 L 242.8,84.1 L 235.6,84.4 L 233.1,81.4 L 225.5,80.5 L 224.2,74.6 L 218.9,75.6 L 220.3,83.4 L 223.2,86.0 L 222.1,94.5 L 228.3,92.8 L 230.2,90.0 L 233.6,91.9 L 237.4,90.7 L 240.4,93.6 Z",
  "Kura": "M 289.3,112.8 L 294.1,109.4 L 295.0,111.4 L 296.6,110.9 L 295.8,108.3 L 287.8,106.0 L 284.7,110.7 Z",
  "Lere": "M 306.6,182.3 L 303.2,179.2 L 304.9,171.0 L 301.3,173.8 L 297.9,169.3 L 291.4,168.6 L 289.8,164.8 L 286.4,163.8 L 284.2,165.3 L 282.4,169.5 L 286.8,179.4 L 282.2,183.7 L 281.7,186.6 L 282.1,189.3 L 285.5,186.8 L 286.5,192.3 L 290.8,197.3 L 287.4,202.4 L 292.6,200.4 L 299.7,201.5 L 300.0,191.1 L 305.5,186.6 Z",
  "Zango": "M 290.8,54.7 L 297.0,52.2 L 301.5,54.1 L 301.1,49.7 L 292.8,42.2 L 287.4,41.8 L 286.4,44.2 L 289.2,49.9 L 288.1,51.7 Z",
  "Wurno": "M 133.6,40.2 L 138.9,37.5 L 141.4,38.2 L 147.3,32.7 L 158.6,34.6 L 158.1,30.9 L 145.0,31.1 L 141.7,30.1 L 139.8,26.5 L 132.4,33.4 L 131.8,39.9 Z",
  "Gudu": "M 101.9,27.8 L 103.7,19.2 L 101.6,17.8 L 103.4,15.1 L 100.7,12.2 L 105.9,9.1 L 105.5,6.1 L 85.2,12.1 L 77.1,20.1 L 71.8,21.7 L 71.8,33.1 L 80.5,32.6 L 90.3,37.8 L 95.5,33.6 L 100.2,32.8 Z",
  "Gwiwa": "M 277.8,55.1 L 272.1,56.4 L 275.0,60.0 L 272.9,60.6 L 273.3,62.0 L 278.3,62.0 L 282.2,64.6 L 285.9,61.3 L 285.6,55.1 Z",
  "Birnin Kebbi": "M 89.2,76.9 L 87.8,69.0 L 85.6,68.4 L 83.8,70.4 L 83.4,67.4 L 78.4,69.6 L 74.1,64.0 L 67.9,68.7 L 69.8,72.9 L 67.6,74.9 L 70.7,78.8 L 75.4,77.5 L 75.5,79.5 L 80.2,81.2 L 85.3,80.1 L 85.1,76.7 Z",
  "Suru": "M 65.2,98.1 L 63.4,104.2 L 66.3,112.0 L 63.5,118.0 L 59.2,116.9 L 55.7,120.2 L 64.9,124.0 L 70.7,116.4 L 78.2,115.7 L 81.1,106.0 L 79.3,102.2 L 77.3,101.9 L 75.6,95.7 L 73.0,94.2 L 69.5,94.3 Z",
  "Numan": "M 447.9,238.1 L 447.7,235.9 L 452.4,236.7 L 459.0,230.8 L 462.9,232.9 L 467.3,231.8 L 469.5,221.5 L 463.9,223.0 L 464.0,227.8 L 451.6,228.2 L 442.1,233.5 L 442.4,237.1 Z",
  "Biu": "M 473.6,143.8 L 473.4,147.7 L 468.1,147.5 L 463.3,152.6 L 455.0,153.4 L 447.9,156.5 L 447.6,158.7 L 453.2,159.5 L 454.1,163.7 L 456.8,164.4 L 461.1,172.1 L 465.1,171.7 L 465.5,168.5 L 469.6,167.4 L 470.9,171.1 L 475.4,171.7 L 476.3,173.9 L 481.7,167.8 L 482.6,171.1 L 487.8,172.2 L 489.2,168.8 L 486.3,166.4 L 488.6,163.7 L 487.8,158.8 L 481.7,148.9 Z",
  "Kaduna South": "M 234.5,176.6 L 235.9,179.4 L 237.3,178.9 L 236.5,173.0 Z",
  "Dikwa": "M 555.4,111.1 L 579.3,109.2 L 581.9,93.3 L 580.0,92.9 L 576.1,96.8 L 571.1,96.8 L 567.6,92.7 L 568.9,91.1 L 563.9,89.4 L 564.3,91.5 L 561.9,91.2 L 559.0,97.1 L 558.7,103.2 Z",
  "Zaria": "M 255.3,154.1 L 256.7,148.2 L 254.3,142.9 L 252.8,145.7 L 247.9,143.3 L 247.6,146.3 L 241.5,146.8 L 240.4,148.5 L 241.8,151.6 L 245.5,149.7 L 247.8,151.7 L 249.1,150.1 L 254.0,151.7 Z",
  "Kalgo": "M 73.4,85.0 L 77.7,82.1 L 76.8,79.5 L 74.0,77.3 L 70.7,78.8 L 67.6,74.9 L 69.8,72.9 L 68.9,70.2 L 65.6,69.5 L 64.7,73.7 L 59.4,75.9 L 65.9,77.0 L 64.0,79.3 L 65.5,82.1 L 64.7,86.5 Z",
  "Yankwashi": "M 285.6,55.1 L 285.8,61.4 L 290.6,59.1 L 293.0,61.0 L 292.6,64.4 L 299.2,60.7 L 295.9,59.7 L 293.9,54.7 Z",
  "Kaura": "M 293.5,223.8 L 295.7,216.2 L 292.1,214.8 L 289.7,218.2 L 284.6,216.3 L 281.3,222.2 L 283.3,225.8 L 288.4,226.4 Z",
  "Lamurde": "M 442.1,233.5 L 451.6,228.2 L 464.0,227.8 L 464.9,225.3 L 461.0,219.2 L 457.7,221.0 L 457.1,217.9 L 453.7,216.7 L 448.2,221.2 L 446.6,219.9 L 444.1,222.6 L 438.1,224.1 L 437.9,228.4 Z",
  "Monguno": "M 539.5,84.7 L 538.1,82.8 L 540.0,81.2 L 549.8,80.1 L 554.7,69.6 L 560.5,64.3 L 573.7,58.0 L 571.9,49.4 L 560.3,61.0 L 557.8,59.3 L 550.2,59.8 L 548.8,62.0 L 544.3,60.3 L 540.7,64.0 L 540.8,66.5 L 533.4,71.1 L 534.4,77.5 L 530.4,78.7 L 531.5,81.5 L 528.5,82.8 L 529.6,85.0 L 532.2,84.2 L 536.1,86.7 Z",
  "Enugu East": "M 245.3,387.6 L 248.6,382.8 L 248.0,380.4 L 245.1,380.8 L 240.4,376.8 L 237.0,378.2 L 237.7,385.3 Z",
  "Ngala": "M 581.9,93.3 L 585.9,91.1 L 587.4,87.4 L 584.9,85.5 L 585.2,83.0 L 582.2,81.8 L 582.1,78.8 L 577.5,79.2 L 574.9,76.8 L 576.2,70.1 L 574.7,62.8 L 568.3,66.3 L 567.7,73.6 L 563.4,79.7 L 565.7,80.4 L 565.8,85.8 L 563.1,88.0 L 568.9,91.1 L 567.6,92.7 L 571.1,96.8 L 576.1,96.8 L 580.0,92.9 Z",
  "Gubio": "M 486.9,70.8 L 493.3,71.1 L 494.7,75.3 L 503.6,76.6 L 509.5,82.0 L 510.1,74.1 L 517.0,66.3 L 520.1,56.9 L 514.2,56.2 L 510.2,51.3 L 509.4,44.9 L 507.2,44.3 L 502.8,51.4 L 490.9,61.2 L 489.2,66.2 L 487.3,66.7 Z",
  "Yagba East": "M 149.9,282.5 L 150.6,290.8 L 147.2,299.3 L 148.9,305.9 L 145.5,308.6 L 147.1,314.6 L 152.4,315.4 L 157.3,310.0 L 153.5,305.9 L 156.9,296.9 L 163.7,289.8 L 169.9,287.6 L 169.7,285.2 Z",
  "Chibok": "M 499.3,161.4 L 502.6,164.6 L 511.0,165.5 L 513.0,167.9 L 515.6,167.1 L 520.4,158.3 L 520.4,153.2 L 503.5,151.4 L 499.8,149.2 L 496.8,158.8 Z",
  "Tureta": "M 149.3,59.9 L 144.4,62.7 L 144.3,59.0 L 142.2,57.3 L 138.0,66.8 L 134.2,65.8 L 134.2,62.4 L 133.2,65.7 L 129.1,66.6 L 128.6,74.5 L 132.4,75.3 L 129.3,80.3 L 134.7,81.2 L 136.6,79.7 L 139.0,84.9 L 142.6,83.9 L 143.9,79.8 L 153.1,81.2 L 154.2,78.1 L 151.4,72.7 L 151.7,65.8 L 149.4,65.2 Z",
  "Gashaka": "M 458.6,337.7 L 454.5,332.7 L 453.8,320.4 L 447.6,319.0 L 448.2,313.0 L 443.5,311.1 L 440.4,316.5 L 432.5,304.9 L 421.7,307.2 L 405.3,324.8 L 410.4,329.5 L 414.5,341.7 L 419.4,339.4 L 422.0,340.5 L 420.9,344.5 L 422.7,344.4 L 422.6,347.9 L 431.1,357.1 L 436.0,357.8 L 435.5,355.2 L 441.2,353.9 L 444.1,354.4 L 444.9,358.1 L 446.9,357.3 L 450.6,359.5 L 454.1,357.9 L 460.1,351.2 L 453.4,344.3 Z",
  "Bauchi": "M 379.8,187.5 L 376.4,185.7 L 377.9,179.1 L 376.6,178.1 L 372.7,178.8 L 371.1,177.3 L 369.2,179.8 L 366.6,179.8 L 366.7,182.3 L 361.6,182.9 L 358.3,181.9 L 356.0,173.7 L 351.9,170.4 L 348.8,170.3 L 346.6,172.7 L 347.8,177.9 L 350.5,179.6 L 350.5,185.1 L 348.3,189.4 L 346.1,189.8 L 348.5,191.4 L 346.6,193.6 L 347.4,196.8 L 351.2,202.8 L 356.8,206.7 L 360.5,205.5 L 362.0,207.4 L 366.5,200.9 L 370.0,201.7 L 370.5,197.4 L 373.7,196.2 L 374.8,192.1 Z",
  "Hawul": "M 464.3,171.7 L 465.4,177.0 L 468.8,177.5 L 465.1,187.9 L 470.0,189.0 L 478.2,182.9 L 481.6,185.7 L 485.3,185.6 L 484.9,183.8 L 487.0,182.7 L 493.8,181.5 L 495.6,176.6 L 491.9,169.6 L 489.2,168.8 L 487.8,172.2 L 484.5,172.2 L 481.7,167.8 L 477.2,174.1 L 475.4,171.7 L 470.9,171.1 L 470.2,167.5 L 465.5,168.5 Z",
  "Uruan": "M 265.2,464.6 L 266.0,466.9 L 270.7,468.1 L 270.2,465.5 L 273.8,463.6 L 270.8,460.8 L 269.9,455.5 L 262.6,457.2 L 267.3,460.9 Z",
  "Mayo-Belwa": "M 453.8,274.0 L 456.6,276.3 L 457.4,273.4 L 475.8,258.4 L 474.5,257.2 L 476.0,254.1 L 473.3,253.0 L 470.8,254.7 L 469.1,252.3 L 470.4,249.7 L 477.2,248.3 L 476.0,240.6 L 473.2,241.6 L 468.9,237.8 L 458.3,245.4 L 457.2,243.2 L 449.9,242.4 L 451.4,250.4 L 457.5,253.6 L 459.6,257.3 L 457.3,267.6 L 453.1,270.8 L 455.4,272.7 Z",
  "Mubi South": "M 529.9,198.6 L 535.9,196.3 L 539.5,192.4 L 531.6,187.2 L 527.5,188.1 L 527.8,190.8 L 522.5,189.4 L 525.1,195.4 Z",
  "Etsako West": "M 178.1,366.6 L 179.2,368.9 L 180.7,367.0 L 185.5,367.8 L 189.8,361.9 L 184.7,361.7 L 183.3,359.5 L 183.7,355.5 L 186.6,352.8 L 186.3,349.4 L 178.4,347.2 L 174.6,352.2 L 176.4,360.8 L 173.9,367.2 Z",
  "Fune": "M 428.1,115.9 L 430.4,118.0 L 431.1,124.3 L 433.8,124.0 L 432.0,128.4 L 434.9,130.0 L 441.3,126.4 L 447.2,128.1 L 456.2,117.2 L 458.4,117.8 L 456.6,114.5 L 458.0,109.3 L 456.0,107.8 L 455.3,103.1 L 451.6,100.2 L 452.0,97.3 L 446.2,95.7 L 446.6,92.0 L 444.2,89.5 L 436.7,88.4 L 437.2,81.4 L 432.6,80.5 L 431.5,77.7 L 427.2,80.0 L 423.0,84.2 L 423.3,86.3 L 413.8,94.4 L 421.3,106.5 L 428.1,105.5 L 427.0,108.8 L 429.4,110.0 Z",
  "Mobbar": "M 508.8,44.4 L 511.7,37.1 L 520.2,40.2 L 512.9,25.6 L 506.9,24.1 L 501.9,30.1 L 500.1,29.4 L 499.8,31.7 L 498.4,30.1 L 495.6,31.3 L 492.7,35.3 L 493.8,37.7 L 486.4,44.8 L 486.4,53.4 L 490.2,56.4 L 490.9,61.2 Z",
  "Potiskum": "M 427.0,108.4 L 424.2,111.9 L 417.6,110.5 L 416.8,117.4 L 422.7,118.6 L 423.4,120.4 L 427.7,118.6 L 429.4,110.0 Z",
  "Gwoza": "M 532.4,157.1 L 533.5,153.6 L 535.2,156.4 L 544.9,152.7 L 553.6,154.5 L 556.6,147.4 L 566.2,135.3 L 545.9,129.9 L 545.7,127.5 L 541.6,130.5 L 541.3,133.7 L 536.1,133.2 L 533.4,130.2 L 528.5,130.4 L 525.6,133.4 L 526.8,141.1 L 523.2,143.6 L 527.0,153.0 L 531.7,154.5 Z",
  "Guzamala": "M 546.3,60.6 L 543.8,57.8 L 541.8,58.9 L 539.0,53.9 L 530.6,49.9 L 530.2,45.4 L 522.7,40.5 L 511.7,37.1 L 508.8,44.4 L 510.2,51.3 L 514.2,56.2 L 525.9,57.9 L 528.5,61.0 L 527.2,65.7 L 533.7,64.0 L 532.9,69.7 L 535.4,67.8 L 537.5,69.4 L 544.3,60.3 Z",
  "Maiha": "M 522.1,190.4 L 518.4,202.1 L 520.7,214.8 L 520.3,227.4 L 525.3,226.7 L 528.0,224.0 L 527.8,206.9 L 530.3,203.6 L 528.2,200.4 L 529.9,198.6 L 525.1,195.4 Z",
  "Gulani": "M 465.9,150.2 L 464.9,142.9 L 461.9,138.5 L 455.4,137.6 L 450.3,141.1 L 447.5,136.1 L 443.0,139.2 L 442.3,147.1 L 439.6,149.2 L 442.9,157.8 L 441.7,172.4 L 453.6,167.6 L 453.5,159.8 L 447.6,158.7 L 447.9,156.5 L 460.9,151.7 L 462.8,152.8 Z",
  "Zing": "M 453.1,270.8 L 457.3,267.6 L 459.6,257.3 L 457.5,253.6 L 451.4,250.4 L 443.7,255.8 Z",
  "Orelope": "M 45.4,256.3 L 48.6,266.1 L 59.1,277.2 L 60.7,272.5 L 59.7,268.4 L 64.3,260.5 L 59.6,258.4 L 57.5,255.2 L 51.3,255.7 L 46.3,253.9 Z",
  "Nsit Ibom": "M 262.0,471.3 L 261.5,465.2 L 259.1,461.4 L 256.5,463.8 L 259.3,467.6 L 259.0,472.1 Z",
  "Fufore": "M 496.0,241.1 L 494.6,248.9 L 486.5,247.8 L 483.6,251.8 L 482.4,251.3 L 484.7,245.4 L 482.4,242.1 L 479.1,240.5 L 476.4,242.0 L 477.2,248.3 L 470.4,249.7 L 469.1,252.8 L 470.8,254.7 L 473.3,253.0 L 476.0,254.1 L 474.5,257.2 L 478.5,262.3 L 481.4,264.4 L 483.5,262.8 L 490.2,265.7 L 503.2,260.1 L 505.5,256.4 L 512.3,254.4 L 510.9,236.0 L 515.4,229.6 L 520.3,227.4 L 520.5,217.2 L 513.7,216.3 L 510.4,218.9 L 503.4,219.0 L 504.0,224.0 L 501.8,225.5 L 499.8,223.1 L 494.4,230.9 L 496.9,234.2 L 495.3,237.3 L 498.4,238.5 Z",
  "Mkpat Enin": "M 255.9,484.3 L 257.0,479.9 L 255.0,472.6 L 257.2,471.1 L 255.7,468.1 L 250.4,475.4 L 251.6,483.3 L 249.9,484.0 L 251.9,485.9 Z",
  "Owan West": "M 167.8,369.7 L 167.8,365.8 L 164.2,360.8 L 164.8,355.6 L 156.7,353.8 L 153.1,369.4 L 155.6,367.8 Z",
  "Kaga": "M 507.4,131.5 L 502.7,123.7 L 503.2,116.2 L 501.1,108.1 L 497.0,104.7 L 498.8,99.9 L 500.8,100.2 L 500.2,98.2 L 494.1,98.6 L 489.3,102.4 L 479.7,99.2 L 479.5,107.1 L 475.7,115.9 L 477.1,117.2 L 479.7,114.0 L 480.9,118.4 L 484.6,121.5 L 477.0,131.4 L 488.0,129.8 L 490.5,133.2 L 489.3,136.2 L 493.0,139.6 L 497.7,139.0 L 506.3,134.1 Z",
  "Karim Lamido": "M 418.9,247.6 L 428.9,243.1 L 431.6,239.4 L 442.2,232.9 L 437.4,225.5 L 427.0,224.5 L 421.6,226.7 L 415.5,225.0 L 414.3,222.1 L 404.5,230.8 L 392.9,228.9 L 394.8,231.2 L 393.8,235.8 L 397.7,247.9 L 397.2,253.1 L 395.7,255.3 L 386.8,257.0 L 378.1,264.2 L 385.0,270.5 L 395.4,266.7 L 404.1,268.3 L 410.0,263.9 L 413.7,253.9 Z",
  "Kukawa": "M 571.9,49.4 L 570.2,41.7 L 554.1,18.5 L 548.4,25.5 L 538.8,29.3 L 539.5,36.6 L 529.5,47.8 L 539.0,53.9 L 541.8,58.9 L 543.8,57.8 L 548.8,62.0 L 550.2,59.8 L 557.8,59.3 L 560.3,61.0 Z",
  "Gombi": "M 478.8,183.4 L 476.6,187.5 L 479.8,190.3 L 476.3,192.0 L 474.5,195.3 L 476.0,197.4 L 474.2,198.9 L 477.0,205.9 L 481.5,201.8 L 482.9,203.9 L 483.6,201.1 L 494.4,199.7 L 495.4,196.2 L 497.7,200.3 L 501.8,199.5 L 505.2,186.5 L 499.8,184.1 L 495.7,176.6 L 493.8,181.5 L 487.0,182.7 L 484.9,183.8 L 485.3,185.6 L 481.6,185.7 Z",
  "Guyuk": "M 461.0,219.2 L 466.5,220.7 L 465.0,218.6 L 466.5,216.4 L 464.0,215.6 L 466.2,212.9 L 465.4,200.1 L 457.4,201.2 L 456.0,210.3 L 458.7,212.8 L 454.7,217.3 L 457.1,217.9 L 457.7,221.0 Z",
  "Tudun Wada": "M 297.9,142.8 L 304.6,139.2 L 301.5,138.9 L 301.0,136.8 L 304.7,133.8 L 304.3,125.6 L 296.5,131.9 L 293.8,132.3 L 287.4,128.1 L 278.5,134.4 L 280.6,137.9 L 287.1,138.1 L 289.9,141.7 L 297.2,138.4 Z",
  "Saki West": "M 3.2,276.1 L 1.6,283.6 L 13.3,279.6 L 25.3,283.0 L 26.4,279.2 L 32.1,278.9 L 33.4,277.4 L 31.6,275.9 L 37.6,277.4 L 42.0,275.6 L 36.4,261.2 L 27.3,265.4 L 23.6,264.0 L 11.4,274.2 L 5.5,274.3 Z",
  "Toungo": "M 458.6,337.7 L 468.1,328.0 L 467.4,321.4 L 477.0,306.3 L 476.0,300.5 L 478.8,295.0 L 473.5,292.4 L 469.0,296.4 L 458.5,291.7 L 456.9,288.9 L 450.7,285.7 L 450.9,281.7 L 446.6,285.1 L 443.2,293.3 L 433.0,305.1 L 440.4,316.5 L 443.5,311.1 L 448.2,313.0 L 447.6,319.0 L 453.8,320.4 L 454.5,332.7 Z",
  "Abua/Odual": "M 194.3,477.4 L 202.6,473.2 L 201.9,468.9 L 196.5,466.4 L 196.0,463.2 L 193.2,463.5 L 194.3,469.6 L 188.3,465.5 L 185.5,469.1 L 188.6,477.0 L 194.6,474.6 L 196.0,475.2 Z",
  "Bungudu": "M 187.8,79.0 L 187.5,88.6 L 184.8,90.1 L 183.3,96.0 L 188.5,97.1 L 190.8,103.6 L 185.7,109.3 L 188.7,120.4 L 190.6,120.5 L 194.0,115.3 L 195.2,87.7 L 202.7,87.5 L 203.4,90.9 L 207.0,94.0 L 209.5,94.0 L 211.0,89.8 L 209.1,85.5 L 210.5,83.7 L 197.5,80.6 L 195.5,74.8 L 190.6,74.8 Z",
  "Shani": "M 466.4,184.0 L 457.7,186.3 L 455.7,190.1 L 450.9,191.3 L 455.4,200.0 L 462.1,200.8 L 470.8,198.5 L 470.4,194.6 L 472.7,189.8 L 476.6,187.5 L 478.8,183.4 L 474.6,184.6 L 470.0,189.0 L 465.1,187.9 Z",
  "Shagari": "M 129.3,80.3 L 132.4,75.3 L 128.6,74.5 L 130.1,65.7 L 125.5,62.9 L 124.5,58.3 L 122.0,56.5 L 119.8,57.8 L 120.4,63.4 L 117.7,62.3 L 113.3,66.4 L 112.2,64.5 L 107.0,66.0 L 107.0,68.7 L 109.1,69.3 L 110.4,75.1 L 112.9,77.3 L 113.4,70.7 L 118.5,72.5 L 119.1,76.3 L 122.3,77.5 L 121.7,83.2 Z",
  "Yunusari": "M 487.4,42.3 L 476.0,39.3 L 471.3,40.0 L 457.4,32.1 L 438.5,26.4 L 432.6,26.3 L 431.9,28.0 L 432.1,33.3 L 433.9,37.4 L 437.2,38.6 L 435.5,41.5 L 438.2,42.3 L 438.1,45.0 L 443.8,46.1 L 451.8,53.8 L 459.3,51.1 L 461.3,52.4 L 460.8,49.0 L 463.7,45.7 L 464.3,51.2 L 466.6,53.4 L 469.2,51.0 L 471.3,53.6 L 474.5,53.5 L 480.6,50.3 Z",
  "Ganye": "M 455.6,276.7 L 450.7,285.7 L 456.9,288.9 L 458.5,291.7 L 469.0,296.4 L 473.5,292.4 L 478.8,295.0 L 478.5,280.1 L 480.2,280.2 L 481.6,277.0 L 477.9,272.4 L 473.7,272.6 L 474.2,278.0 L 472.0,282.1 L 470.6,280.5 L 467.7,281.8 L 465.7,278.0 L 466.4,275.0 L 465.0,272.3 L 463.0,273.1 L 462.9,270.9 L 457.4,273.4 Z",
  "Jada": "M 460.2,272.5 L 462.9,270.9 L 463.0,273.1 L 465.0,272.3 L 467.7,281.8 L 470.6,280.5 L 472.0,282.1 L 474.9,271.6 L 477.9,272.4 L 481.6,277.0 L 480.2,280.2 L 478.5,280.1 L 478.5,284.1 L 495.3,281.9 L 496.1,280.4 L 500.0,281.8 L 503.7,276.3 L 507.3,276.7 L 506.8,272.2 L 509.9,267.0 L 510.0,262.1 L 508.2,255.7 L 497.2,263.4 L 488.6,265.9 L 483.5,262.8 L 481.0,264.2 L 475.8,258.4 Z",
  "Bali": "M 442.5,271.4 L 439.3,272.2 L 434.5,269.1 L 431.2,269.3 L 428.7,273.1 L 429.7,275.5 L 427.6,276.4 L 421.4,273.2 L 417.4,280.4 L 400.0,294.6 L 396.3,294.3 L 394.2,298.4 L 389.8,297.0 L 379.3,300.6 L 383.8,307.6 L 384.6,319.0 L 381.6,323.7 L 386.5,331.4 L 391.1,331.3 L 401.1,325.3 L 404.4,325.6 L 410.2,321.3 L 409.9,318.8 L 414.2,316.7 L 421.7,307.2 L 433.6,304.7 L 443.4,293.0 L 446.6,285.1 L 455.5,278.4 L 453.8,274.0 L 447.8,271.0 Z",
  "Shelleng": "M 469.5,221.5 L 478.5,219.4 L 474.3,211.8 L 477.6,209.4 L 477.2,205.3 L 474.1,201.0 L 476.0,197.4 L 474.5,195.3 L 479.8,190.3 L 476.6,187.5 L 472.7,189.8 L 470.4,194.6 L 470.8,198.5 L 465.5,200.2 L 466.2,212.9 L 464.0,215.6 L 466.5,216.4 L 465.0,218.6 L 466.5,220.7 L 461.0,219.2 L 463.9,223.0 Z",
  "Okitipupa": "M 108.2,387.6 L 106.9,385.6 L 108.9,379.5 L 106.1,379.7 L 101.1,371.9 L 97.1,371.7 L 94.6,376.7 L 95.7,384.5 L 101.3,389.7 Z",
  "Bayo": "M 454.1,163.7 L 453.6,167.6 L 444.7,171.9 L 449.0,176.8 L 442.4,185.5 L 447.1,191.2 L 450.3,192.2 L 455.7,190.1 L 457.9,186.3 L 456.4,179.7 L 452.2,177.9 L 451.1,174.6 L 455.6,174.7 L 455.2,171.4 L 457.9,167.5 L 456.8,164.4 Z",
  "Ikot Abasi": "M 250.6,485.6 L 251.1,477.1 L 246.3,479.7 L 241.9,479.5 L 242.0,485.4 L 243.7,487.3 L 246.5,484.9 L 249.3,486.6 Z",
  "Maiduguri": "M 520.6,106.6 L 521.2,110.9 L 525.2,108.2 L 523.6,103.2 L 520.2,102.7 Z",
  "Gujba": "M 477.0,131.4 L 484.6,121.5 L 480.9,118.4 L 479.7,114.0 L 477.1,117.2 L 475.6,115.8 L 471.7,118.8 L 468.4,117.7 L 466.0,120.7 L 463.1,118.3 L 459.8,119.0 L 456.2,117.2 L 450.0,123.2 L 443.8,138.6 L 447.5,136.1 L 450.3,141.1 L 455.4,137.6 L 461.9,138.5 L 464.9,142.9 L 465.9,150.2 L 468.1,147.5 L 474.0,147.0 L 471.0,137.7 Z",
  "Esan North-East": "M 192.1,368.8 L 189.8,361.9 L 184.5,367.7 L 184.3,370.3 L 177.4,371.8 L 178.7,376.2 L 184.2,375.1 L 184.3,373.4 L 187.3,372.6 L 187.1,369.7 Z",
  "Tafawa-Balewa": "M 356.8,206.7 L 351.2,202.8 L 345.8,190.8 L 341.7,196.2 L 346.8,200.3 L 344.5,202.6 L 349.8,205.7 L 349.5,207.5 L 344.4,208.9 L 344.1,206.7 L 340.0,206.7 L 334.2,208.9 L 332.3,206.9 L 327.3,213.3 L 323.3,215.2 L 326.6,218.5 L 330.0,217.8 L 330.3,222.1 L 332.1,223.1 L 331.0,224.3 L 335.6,226.4 L 337.0,229.3 L 344.2,229.5 L 344.6,226.9 L 340.0,226.5 L 336.0,223.3 L 341.2,216.9 L 337.4,216.7 L 336.7,214.8 L 342.0,214.1 L 355.9,218.2 L 356.2,223.9 L 365.4,220.9 L 364.4,217.7 L 360.1,214.4 L 361.5,209.9 L 358.3,209.8 Z",
  "Nangere": "M 414.2,93.7 L 411.7,93.6 L 405.8,100.9 L 412.3,109.7 L 412.3,123.2 L 418.7,119.9 L 418.6,117.6 L 416.8,117.4 L 417.6,110.5 L 424.2,111.9 L 428.1,105.5 L 421.3,106.5 L 414.7,97.9 Z",
  "Ika": "M 243.0,457.6 L 239.3,463.9 L 245.0,462.1 L 245.8,459.5 Z",
  "Dambam": "M 409.7,107.0 L 403.7,111.1 L 400.0,108.1 L 397.4,113.4 L 393.8,115.3 L 395.7,115.7 L 396.0,121.0 L 397.8,120.7 L 401.2,124.4 L 401.8,127.8 L 407.6,125.1 L 409.9,126.9 L 412.6,125.7 L 412.3,109.7 Z",
  "Ganjuwa": "M 377.9,179.1 L 382.0,176.5 L 380.9,174.9 L 383.1,171.3 L 389.2,170.5 L 392.2,163.7 L 390.9,161.8 L 387.9,161.9 L 391.4,157.8 L 386.9,158.8 L 389.7,155.4 L 387.6,154.3 L 383.4,156.9 L 378.8,153.7 L 382.0,152.2 L 382.6,145.7 L 379.9,144.5 L 374.3,147.0 L 373.6,149.8 L 376.9,152.5 L 374.6,153.1 L 372.0,152.6 L 371.4,150.5 L 366.1,152.4 L 357.4,148.5 L 355.1,149.6 L 354.2,147.6 L 347.2,147.3 L 345.7,157.4 L 336.6,161.0 L 356.0,173.7 L 358.3,181.9 L 366.3,182.5 L 366.6,179.8 L 369.2,179.8 L 371.1,177.3 Z",
  "Nganzai": "M 536.1,69.6 L 535.4,67.8 L 532.2,69.1 L 533.7,64.0 L 527.2,65.7 L 528.5,61.0 L 523.9,56.8 L 520.1,56.9 L 517.0,66.3 L 510.1,74.1 L 509.5,82.0 L 522.8,79.0 L 521.5,84.8 L 530.3,93.1 L 528.5,82.8 L 531.5,81.5 L 530.4,78.7 L 534.4,77.5 L 533.4,71.1 Z",
  "Ahoada West": "M 194.5,452.8 L 190.3,453.5 L 186.1,462.5 L 187.3,465.7 L 193.6,469.8 Z",
  "Song": "M 498.4,224.8 L 499.8,223.1 L 502.7,225.5 L 504.6,222.2 L 503.4,219.0 L 505.1,218.2 L 510.4,218.9 L 513.7,216.3 L 520.5,217.2 L 518.7,201.0 L 507.6,201.8 L 507.0,197.7 L 504.1,194.8 L 501.8,199.5 L 497.7,200.3 L 495.4,196.2 L 494.4,199.7 L 483.6,201.1 L 482.9,203.9 L 481.5,201.8 L 477.0,205.9 L 477.6,209.4 L 474.3,211.8 L 478.5,219.4 L 477.4,223.3 L 479.6,226.9 L 483.0,225.6 L 485.0,222.2 Z",
  "Oshimili North": "M 194.4,384.3 L 193.9,393.5 L 197.3,397.8 L 196.1,402.9 L 200.0,404.4 L 201.2,391.6 L 199.0,384.0 Z",
  "Gokana": "M 230.9,483.2 L 233.6,478.1 L 227.3,477.9 L 228.0,483.0 L 229.7,484.9 Z",
  "Bukkuyum": "M 153.1,81.2 L 143.9,79.8 L 142.6,83.9 L 139.0,84.9 L 137.5,80.2 L 134.7,81.2 L 131.1,79.6 L 132.9,83.3 L 135.7,84.2 L 135.2,88.7 L 132.9,91.2 L 134.2,97.3 L 127.1,104.0 L 129.1,109.6 L 131.3,108.9 L 130.3,110.8 L 131.9,109.9 L 133.0,113.2 L 137.5,113.2 L 140.4,116.0 L 151.6,114.3 L 159.6,118.1 L 161.2,117.0 L 163.0,110.1 L 158.3,103.9 L 156.5,97.1 L 152.9,95.7 L 149.6,91.3 L 151.6,89.7 Z",
  "Damaturu": "M 458.4,117.8 L 463.1,118.3 L 466.0,120.7 L 468.4,117.7 L 471.7,118.8 L 475.7,115.9 L 479.5,107.1 L 480.0,98.3 L 477.8,90.9 L 474.0,92.2 L 469.8,90.6 L 468.0,92.9 L 469.0,94.2 L 464.8,98.3 L 460.5,99.3 L 460.1,97.6 L 457.8,99.3 L 452.0,97.3 L 451.6,100.2 L 455.3,103.1 L 456.0,107.8 L 458.0,109.3 L 456.6,114.5 Z",
  "Geidam": "M 490.9,61.2 L 490.2,56.4 L 486.4,53.4 L 486.4,44.8 L 474.5,53.5 L 471.3,53.6 L 469.2,51.0 L 466.6,53.4 L 464.3,51.2 L 463.7,45.7 L 460.8,49.0 L 461.3,52.4 L 459.3,51.1 L 449.0,53.6 L 454.2,57.5 L 456.4,62.0 L 456.3,67.1 L 452.0,72.0 L 452.9,78.3 L 453.0,74.8 L 462.3,72.9 L 465.1,77.3 L 474.8,75.3 L 480.1,76.8 L 487.8,69.6 L 487.3,66.7 L 489.2,66.2 Z",
  "Tarmuwa": "M 452.0,97.3 L 457.8,99.3 L 460.1,97.6 L 460.5,99.3 L 464.8,98.3 L 469.0,94.2 L 468.0,92.9 L 469.8,90.6 L 474.0,92.2 L 477.8,90.9 L 480.2,84.2 L 480.1,76.8 L 474.8,75.3 L 465.1,77.3 L 462.3,72.9 L 453.0,74.8 L 452.9,78.3 L 452.2,71.3 L 444.5,73.2 L 441.7,71.9 L 432.4,76.6 L 432.6,80.5 L 437.2,81.4 L 436.7,88.4 L 444.2,89.5 L 446.6,92.0 L 446.2,95.7 Z",
  "Madagali": "M 532.8,157.0 L 532.7,164.3 L 539.4,165.3 L 544.0,168.8 L 553.6,154.5 L 544.9,152.7 L 535.2,156.4 L 533.5,153.6 Z",
  "Michika": "M 532.1,163.4 L 527.6,171.4 L 528.4,175.5 L 534.0,175.2 L 537.1,179.1 L 542.3,180.0 L 543.9,168.4 Z",
  "Mubi North": "M 539.5,192.4 L 541.9,188.7 L 540.4,187.6 L 540.6,181.8 L 542.6,178.5 L 540.4,180.4 L 533.9,176.8 L 534.0,175.2 L 528.4,175.5 L 526.9,183.2 L 525.2,184.0 L 527.5,187.7 L 525.1,186.1 L 524.8,189.0 L 527.9,190.6 L 527.5,188.1 L 531.6,187.2 Z",
  "Owan East": "M 174.6,352.2 L 168.9,345.2 L 164.9,346.3 L 160.4,344.6 L 157.6,352.0 L 164.8,355.6 L 164.2,360.8 L 167.8,365.8 L 167.8,369.7 L 173.9,367.2 L 176.0,362.1 L 176.5,355.8 Z",
  "Hong": "M 527.9,190.6 L 524.2,187.2 L 525.1,186.1 L 527.5,187.7 L 525.2,184.0 L 526.9,183.2 L 527.7,178.0 L 525.6,180.8 L 518.6,177.9 L 514.3,173.7 L 504.0,171.7 L 498.6,179.2 L 495.8,179.0 L 499.8,184.1 L 505.2,186.5 L 504.1,194.8 L 507.0,197.7 L 507.6,201.8 L 518.7,201.0 L 522.5,189.4 Z",
  "Nassarawa": "M 292.4,98.6 L 295.5,100.0 L 296.7,97.9 L 293.1,95.3 Z",
  "Sabuwa": "M 210.1,130.1 L 216.3,131.9 L 214.1,137.4 L 222.8,143.3 L 225.7,142.1 L 226.6,139.7 L 222.3,131.5 L 223.2,129.8 L 219.2,127.0 L 221.2,125.3 L 220.7,121.1 L 210.7,124.5 Z",
  "Ohaozara": "M 249.1,406.7 L 252.0,414.8 L 256.0,411.1 L 261.3,411.6 L 257.5,406.0 L 256.2,407.5 L 252.0,404.1 Z",
  "Kaura Namoda": "M 190.6,74.8 L 195.5,74.8 L 197.5,80.6 L 199.9,80.0 L 199.8,81.8 L 207.5,83.6 L 207.3,80.6 L 200.7,77.5 L 199.0,74.1 L 200.2,73.0 L 198.4,69.4 L 202.8,67.5 L 203.3,65.0 L 194.1,62.8 L 186.4,64.8 L 185.2,72.0 Z",
  "Dutsi": "M 278.2,52.3 L 273.7,44.1 L 268.1,45.9 L 270.4,55.9 L 277.8,55.1 Z",
  "Kabo": "M 279.8,107.4 L 278.5,101.6 L 276.6,102.8 L 271.8,97.4 L 270.0,100.1 L 267.6,99.0 L 266.0,100.6 L 271.3,101.6 L 269.6,106.0 L 271.7,105.4 L 272.7,109.0 L 277.0,109.9 Z",
  "Dandume": "M 225.4,136.7 L 231.1,134.8 L 231.6,127.6 L 228.1,123.7 L 227.9,125.7 L 224.9,124.1 L 224.5,120.1 L 222.4,120.0 L 219.2,127.0 L 223.2,129.8 L 222.1,130.9 Z",
  "Dawakin Tofa": "M 285.1,96.9 L 291.1,91.2 L 291.5,84.3 L 288.0,86.2 L 286.2,85.0 L 283.3,88.3 L 280.5,88.4 L 280.3,90.4 L 276.2,89.3 L 282.2,94.1 L 283.2,93.0 Z",
  "Gezawa": "M 295.7,99.6 L 300.4,97.5 L 302.5,100.0 L 307.6,99.4 L 307.0,94.6 L 303.9,91.9 L 304.7,89.8 L 297.7,91.4 L 298.1,93.9 L 295.2,96.3 L 296.7,97.9 Z",
  "Bodinga": "M 119.8,57.8 L 122.0,56.5 L 126.8,64.2 L 133.2,65.7 L 134.7,60.3 L 129.3,55.8 L 127.3,49.6 L 123.1,46.4 L 120.9,46.5 L 120.8,49.7 L 118.4,49.5 L 120.6,53.5 L 118.4,54.7 L 118.2,57.2 Z",
  "Zurmi": "M 193.1,62.8 L 203.3,65.0 L 203.1,67.9 L 206.4,64.6 L 215.1,63.0 L 218.7,59.6 L 218.2,46.3 L 212.3,46.2 L 205.2,39.2 L 200.0,39.2 L 195.9,43.6 L 202.4,45.8 L 203.0,49.4 L 193.7,51.8 L 185.8,48.1 L 186.7,49.9 L 182.7,51.1 L 185.8,54.8 L 188.4,52.9 L 190.0,57.1 L 186.7,57.6 L 184.3,60.5 L 190.6,58.5 L 194.0,59.6 Z",
  "Warawa": "M 308.9,100.1 L 302.5,100.0 L 300.4,97.5 L 297.3,101.3 L 301.4,102.2 L 301.8,106.2 L 307.3,108.7 L 309.3,105.0 Z",
  "Tangaza": "M 119.0,37.1 L 122.2,33.2 L 119.0,28.8 L 121.8,28.6 L 123.2,25.3 L 121.5,24.0 L 123.9,23.8 L 124.6,20.9 L 123.4,7.4 L 113.0,7.9 L 109.2,5.4 L 105.5,6.1 L 105.9,9.1 L 100.7,12.2 L 103.4,15.1 L 101.6,17.8 L 103.7,19.2 L 101.9,27.8 L 113.2,30.7 L 113.9,34.5 Z",
  "Maigatari": "M 348.9,54.7 L 347.5,56.3 L 332.5,55.3 L 331.8,58.9 L 333.2,62.6 L 337.7,61.4 L 339.3,62.7 L 340.7,65.7 L 339.6,67.3 L 350.3,68.8 L 355.8,64.0 Z",
  "Danja": "M 253.2,130.7 L 250.4,127.6 L 245.6,129.7 L 242.3,127.4 L 239.5,127.8 L 240.6,123.2 L 235.7,122.7 L 234.9,130.6 L 241.7,131.3 L 246.0,135.9 L 251.0,133.9 L 251.6,130.9 Z",
  "Fagge": "M 293.3,95.3 L 289.0,94.7 L 292.5,98.5 Z",
  "Jibia": "M 218.7,59.6 L 221.2,57.5 L 220.9,49.6 L 224.9,46.0 L 233.8,46.1 L 236.4,51.6 L 244.0,46.5 L 245.7,39.9 L 248.4,39.5 L 248.0,35.3 L 246.4,33.8 L 234.6,40.9 L 226.6,39.5 L 220.2,46.3 L 218.2,46.3 Z",
  "Eleme": "M 221.7,477.5 L 225.1,475.5 L 224.9,472.0 L 223.1,472.8 L 223.6,469.3 L 219.1,470.8 L 222.6,475.9 Z",
  "Bebeji": "M 287.4,128.1 L 285.5,125.7 L 287.4,119.8 L 285.2,119.7 L 282.3,112.2 L 277.3,113.0 L 277.3,116.6 L 275.1,118.4 L 275.9,127.0 L 279.3,127.3 L 281.3,132.1 Z",
  "Rano": "M 296.5,131.9 L 293.8,128.3 L 295.9,125.8 L 297.7,126.3 L 295.8,123.9 L 298.0,121.8 L 299.4,117.2 L 298.2,116.9 L 295.3,117.3 L 295.4,119.4 L 293.0,117.9 L 290.0,121.2 L 287.4,120.1 L 285.5,125.7 L 289.0,129.7 Z",
  "Tarauni": "M 292.4,98.6 L 292.5,101.5 L 295.4,100.4 Z",
  "Etinan": "M 259.5,478.9 L 259.3,467.6 L 257.5,463.5 L 255.6,467.7 L 257.2,471.1 L 255.0,472.6 L 255.8,476.5 Z",
  "Yewa South": "M 19.5,370.4 L 18.1,365.5 L 20.0,363.0 L 14.9,359.8 L 10.9,361.0 L 10.9,364.6 L 7.2,365.3 L 5.7,369.8 L 9.6,371.5 L 6.7,376.5 L 9.1,380.4 L 11.7,379.1 L 13.2,374.3 L 15.9,375.1 Z",
  "Argungu": "M 88.0,53.6 L 84.3,54.5 L 82.5,58.2 L 74.1,64.0 L 78.4,69.6 L 83.4,67.4 L 83.8,70.4 L 85.6,68.4 L 87.8,69.0 L 88.3,65.8 L 93.8,63.3 L 96.4,63.7 L 98.5,67.5 L 103.4,64.9 L 102.0,61.5 L 94.7,59.9 L 93.0,56.3 Z",
  "Kiru": "M 280.8,132.0 L 279.3,127.3 L 275.8,126.7 L 275.1,118.4 L 277.3,116.6 L 276.8,113.6 L 279.4,112.4 L 277.9,111.8 L 278.5,109.0 L 272.5,109.0 L 268.1,114.7 L 263.6,114.0 L 264.8,121.8 L 267.1,122.0 L 267.7,124.7 L 270.7,122.8 L 273.8,123.8 L 271.8,130.0 L 276.0,133.5 Z",
  "Batagarawa": "M 236.4,51.6 L 236.3,53.2 L 239.7,53.4 L 239.4,55.8 L 241.4,56.1 L 241.5,61.1 L 244.6,61.6 L 244.4,58.8 L 248.9,55.0 L 250.0,48.6 L 253.1,48.5 L 253.7,45.9 L 251.4,44.0 L 249.2,47.4 L 241.3,47.7 Z",
  "Bomadi": "M 161.9,453.7 L 157.5,449.4 L 157.3,446.3 L 155.5,446.1 L 155.8,443.4 L 152.0,445.0 L 152.5,448.5 L 156.0,448.3 L 153.5,451.1 L 154.5,452.9 L 159.5,452.9 L 159.8,456.8 Z",
  "Kwaya Kusar": "M 457.9,167.5 L 455.2,171.4 L 455.6,174.7 L 451.1,174.6 L 452.2,177.9 L 456.4,179.7 L 458.1,186.3 L 467.8,183.4 L 468.8,177.5 L 465.4,177.0 L 464.4,171.8 L 461.1,172.1 Z",
  "Igbo-Etiti": "M 230.7,371.7 L 232.7,377.5 L 235.2,375.7 L 237.0,378.2 L 240.4,376.8 L 243.3,379.2 L 245.4,376.6 L 236.5,370.1 L 234.8,369.8 L 233.1,372.5 Z",
  "Doguwa": "M 304.9,171.0 L 308.3,164.6 L 303.0,157.5 L 304.1,153.1 L 297.9,143.9 L 297.2,138.4 L 294.9,138.6 L 291.0,143.2 L 296.1,146.4 L 296.5,149.1 L 294.1,154.9 L 294.3,163.2 L 289.8,164.8 L 290.6,167.5 L 292.4,169.2 L 297.9,169.3 L 301.3,173.8 Z",
  "Bade": "M 425.7,71.0 L 428.1,71.6 L 429.1,66.9 L 425.5,66.5 L 423.2,57.9 L 418.9,56.6 L 417.5,58.5 L 420.0,62.2 L 415.5,67.3 L 417.3,68.0 L 417.3,71.6 Z M 417.6,55.9 L 420.5,54.0 L 418.5,49.2 L 414.1,53.1 L 410.1,51.5 L 396.6,52.9 L 393.8,56.2 L 395.9,61.9 L 394.9,64.4 L 398.2,64.3 L 402.3,57.6 L 407.5,55.1 L 416.8,53.9 Z",
  "Itu": "M 262.4,458.1 L 264.8,455.9 L 269.9,455.5 L 267.8,449.8 L 262.6,452.9 L 261.7,457.8 L 259.2,459.3 L 260.2,460.5 Z",
  "Bama": "M 555.4,111.1 L 551.5,111.2 L 545.3,116.2 L 549.2,118.0 L 550.3,121.9 L 548.4,124.0 L 544.7,122.9 L 545.9,129.9 L 562.1,133.1 L 574.3,137.9 L 591.1,127.4 L 577.8,117.8 L 579.3,109.2 Z",
  "Gada": "M 164.6,9.0 L 142.0,0.0 L 136.5,1.4 L 137.8,6.6 L 140.0,5.8 L 138.1,10.3 L 141.9,12.0 L 143.5,20.4 L 142.8,16.5 L 147.6,13.9 L 150.3,15.3 L 150.6,20.9 L 154.2,20.0 L 155.5,16.1 L 161.3,16.7 L 161.8,13.7 L 160.0,13.4 Z",
  "Gusau": "M 190.4,119.3 L 193.8,120.7 L 201.3,119.2 L 201.7,115.1 L 199.7,112.9 L 200.8,107.1 L 198.8,103.5 L 202.0,101.5 L 202.9,98.1 L 205.9,97.9 L 207.0,94.0 L 203.4,90.9 L 202.7,87.5 L 198.3,86.6 L 194.7,88.8 L 194.0,115.3 Z M 218.9,75.6 L 214.6,76.4 L 209.1,85.5 L 211.0,89.8 L 209.9,92.6 L 214.0,94.6 L 215.6,93.0 L 221.5,93.2 L 223.4,88.8 Z",
  "Lagos Mainland": "M 34.4,385.8 L 35.6,383.2 L 34.2,382.5 Z",
  "Kaita": "M 256.7,27.8 L 246.4,33.8 L 248.4,39.5 L 245.7,39.9 L 245.7,42.9 L 249.0,41.7 L 248.8,44.6 L 253.8,44.7 L 261.6,38.5 L 262.9,33.6 L 258.7,33.6 L 256.6,31.2 Z",
  "Minjibir": "M 291.1,91.2 L 297.6,92.9 L 298.2,91.0 L 301.7,90.0 L 302.4,84.1 L 299.4,82.2 L 298.1,84.8 L 293.0,83.4 L 290.4,86.1 L 291.9,87.0 Z",
  "Ini": "M 256.0,447.0 L 258.1,444.1 L 260.8,444.6 L 259.9,442.0 L 255.3,439.2 L 253.4,435.4 L 250.5,435.1 L 250.7,439.6 L 248.4,438.9 L 246.6,442.7 L 251.3,446.7 Z",
  "Talata Mafara": "M 159.9,81.7 L 161.2,90.8 L 163.0,91.5 L 166.3,88.9 L 169.8,91.8 L 174.3,88.3 L 179.9,76.3 L 174.0,75.5 L 172.6,69.7 L 174.1,66.1 L 170.8,63.1 L 160.7,74.8 Z",
  "Gwandu": "M 89.2,76.9 L 92.3,82.4 L 97.0,75.6 L 103.2,79.2 L 103.4,74.6 L 106.1,71.9 L 103.4,64.9 L 98.7,67.5 L 95.6,63.5 L 88.3,65.8 Z",
  "Birnin Magaji-Kiyaw": "M 210.5,83.7 L 214.6,76.4 L 218.9,75.6 L 217.9,64.1 L 215.1,63.0 L 206.4,64.6 L 204.7,67.4 L 200.5,67.3 L 198.4,69.4 L 200.7,77.5 L 207.3,80.6 L 207.5,83.6 Z",
  "Shanono": "M 259.0,97.0 L 261.7,100.1 L 265.8,98.1 L 270.0,100.1 L 271.9,95.9 L 271.3,94.5 L 266.5,95.0 L 264.9,93.2 L 265.8,88.6 L 262.9,88.8 L 259.5,85.8 Z",
  "Rogo": "M 255.9,130.7 L 267.5,124.4 L 263.0,115.8 L 250.9,119.3 L 250.4,128.2 Z",
  "Batsari": "M 217.8,60.6 L 221.8,61.5 L 222.3,63.5 L 229.6,60.9 L 230.3,62.8 L 234.8,62.5 L 236.8,51.9 L 234.9,47.0 L 227.9,45.0 L 224.9,46.0 L 220.9,49.6 L 221.2,57.5 Z",
  "Eket": "M 265.8,482.7 L 267.4,478.6 L 260.3,476.9 L 260.8,484.7 Z",
  "Okobo": "M 275.5,464.4 L 271.8,463.8 L 269.8,466.3 L 270.1,472.8 L 268.1,475.8 L 269.8,479.0 L 272.0,473.9 L 276.5,471.4 Z",
  "Kano Municipal": "M 292.5,98.5 L 291.8,97.4 L 290.5,99.1 L 291.5,100.4 Z",
  "Bursari": "M 431.5,77.7 L 441.7,71.9 L 444.5,73.2 L 452.6,71.6 L 456.3,67.1 L 455.3,59.0 L 450.8,56.4 L 449.6,50.9 L 443.8,46.1 L 438.8,44.8 L 437.6,46.9 L 423.4,48.8 L 419.2,51.8 L 420.5,54.0 L 417.6,54.8 L 418.2,57.1 L 421.3,56.3 L 423.2,57.9 L 425.5,66.5 L 429.1,66.9 L 428.1,71.6 L 425.7,71.0 L 427.2,80.0 Z",
  "Maiyama": "M 93.0,103.7 L 88.9,105.1 L 87.7,99.6 L 84.6,98.7 L 83.7,88.0 L 74.4,90.7 L 73.9,88.6 L 76.9,88.0 L 77.2,85.3 L 78.0,87.1 L 80.0,85.5 L 79.2,82.5 L 74.6,83.2 L 70.2,93.2 L 75.6,95.7 L 77.3,101.9 L 80.0,103.3 L 80.5,112.0 L 84.3,110.4 L 86.3,113.2 L 89.8,111.6 L 92.9,108.7 Z",
  "Lagos Island": "M 35.5,387.2 L 34.5,385.9 Z",
  "Madobi": "M 291.2,106.1 L 285.0,102.6 L 279.0,108.0 L 278.0,112.1 L 283.3,112.4 L 287.8,106.0 Z",
  "Miga": "M 354.3,91.5 L 358.8,86.5 L 356.8,82.1 L 350.3,83.2 L 348.3,80.7 L 343.7,82.5 L 342.2,86.7 L 344.8,89.7 Z",
  "Rimi": "M 244.7,60.6 L 251.9,59.2 L 255.1,61.9 L 254.0,52.1 L 257.8,41.8 L 251.4,44.8 L 253.7,45.9 L 253.1,48.5 L 250.0,48.6 L 248.9,55.0 L 244.4,58.8 Z",
  "Gabasawa": "M 313.0,94.3 L 311.5,94.1 L 313.4,88.4 L 311.2,82.4 L 301.9,82.7 L 301.7,90.0 L 304.7,89.8 L 303.9,91.9 L 307.0,94.6 L 308.1,100.1 Z",
  "Aleiro": "M 83.5,80.5 L 84.0,83.3 L 87.9,86.4 L 92.9,85.0 L 89.2,76.9 L 85.1,76.7 L 85.7,79.7 Z",
  "Ungogo": "M 295.2,96.3 L 297.8,93.0 L 290.4,91.3 L 285.1,96.9 L 285.8,100.8 L 288.9,99.1 L 289.3,94.5 Z",
  "Tambuwal": "M 121.7,83.2 L 122.3,77.5 L 119.1,76.3 L 119.1,73.3 L 116.3,70.6 L 113.2,70.9 L 112.9,77.3 L 110.4,75.1 L 109.1,69.3 L 106.9,67.8 L 109.5,60.6 L 103.0,59.0 L 102.1,63.1 L 106.1,71.9 L 103.4,74.6 L 103.2,79.2 L 97.0,75.6 L 94.9,77.5 L 92.9,85.0 L 91.5,85.0 L 93.6,86.1 L 93.1,93.0 L 94.9,96.0 L 97.2,94.8 L 98.7,89.2 L 100.4,89.9 L 100.6,86.3 L 113.0,86.0 L 113.1,81.7 Z",
  "Jega": "M 94.9,96.0 L 93.1,93.0 L 93.6,86.1 L 87.9,86.4 L 84.0,83.3 L 83.5,80.5 L 77.2,80.8 L 80.0,85.5 L 78.0,87.1 L 77.2,85.3 L 76.9,88.0 L 73.9,88.6 L 74.4,90.7 L 83.7,88.0 L 84.6,98.7 L 87.7,99.6 L 88.9,105.1 L 93.0,103.7 Z",
  "Katsina": "M 243.4,47.3 L 245.4,48.6 L 249.2,47.4 L 249.0,41.7 L 244.5,43.1 Z",
  "Dawakin Kudu": "M 296.6,110.9 L 299.5,115.8 L 301.0,110.0 L 304.3,110.7 L 306.8,108.6 L 301.8,106.2 L 301.4,102.2 L 297.3,101.3 L 296.3,103.8 L 290.8,105.1 L 291.9,107.4 L 295.5,108.0 Z",
  "Arewa Dandi": "M 93.2,40.3 L 80.5,32.6 L 71.8,33.1 L 70.7,46.3 L 63.1,59.1 L 48.3,70.6 L 48.7,87.3 L 46.8,91.6 L 50.9,90.5 L 53.6,92.9 L 55.3,90.8 L 54.5,86.7 L 57.1,83.2 L 56.7,78.5 L 64.7,73.7 L 65.6,69.5 L 67.8,69.6 L 75.7,61.7 L 82.5,58.2 L 84.3,54.5 L 92.7,50.3 L 93.5,48.0 L 89.3,46.0 Z",
  "Etim Ekpo": "M 245.8,459.5 L 244.3,463.0 L 240.1,464.1 L 240.2,469.1 L 243.3,465.6 L 251.5,463.1 L 249.9,459.8 L 246.8,461.0 Z",
  "Albasu": "M 332.1,120.1 L 327.8,116.5 L 327.0,111.8 L 317.8,114.2 L 315.9,111.5 L 311.6,112.7 L 313.5,114.0 L 312.3,118.1 L 314.2,120.4 L 318.9,121.4 L 322.4,116.1 L 323.8,116.1 L 325.3,121.5 Z",
  "Marte": "M 563.9,89.4 L 565.8,81.3 L 563.7,78.0 L 567.7,73.6 L 568.3,66.3 L 574.7,62.8 L 573.7,58.0 L 560.5,64.3 L 554.7,69.6 L 549.8,80.1 L 538.1,82.8 L 548.7,90.9 L 550.0,85.5 L 559.5,89.0 L 561.5,91.8 L 563.7,92.2 Z",
  "Kumbotso": "M 295.5,100.0 L 289.6,101.5 L 290.1,100.0 L 287.8,99.6 L 285.9,102.7 L 290.8,105.1 L 295.7,104.0 L 297.5,102.3 L 297.3,100.0 Z",
  "Kazaure": "M 282.9,64.1 L 285.6,67.6 L 297.8,67.2 L 300.8,62.3 L 298.7,60.8 L 292.9,64.5 L 293.0,61.0 L 290.3,59.1 Z",
  "Malumfashi": "M 244.2,100.0 L 247.5,102.7 L 247.4,106.5 L 241.6,108.9 L 235.8,108.1 L 238.2,113.8 L 242.2,115.9 L 243.2,111.6 L 245.2,114.1 L 248.3,113.1 L 251.2,105.8 L 258.3,107.2 L 258.9,104.6 L 257.0,100.5 L 259.0,97.0 L 252.5,97.6 L 252.1,94.9 L 248.4,95.0 Z",
  "Udi": "M 239.1,388.4 L 237.0,387.0 L 238.2,384.0 L 236.4,383.6 L 236.2,376.2 L 232.7,377.5 L 230.8,374.9 L 226.7,374.9 L 229.4,385.0 L 231.8,384.5 L 235.0,390.2 L 230.4,396.5 L 233.9,398.9 Z",
  "Dutse": "M 325.9,103.0 L 327.3,103.5 L 326.4,104.9 L 322.9,107.5 L 323.6,112.7 L 327.0,111.8 L 327.8,116.5 L 331.7,119.9 L 336.8,121.1 L 339.8,118.2 L 333.9,109.2 L 335.6,104.5 L 338.5,102.6 L 335.4,102.9 L 334.8,97.2 L 331.7,95.1 L 326.0,99.7 Z",
  "Gwaram": "M 347.1,137.8 L 349.7,138.6 L 357.0,135.5 L 359.8,139.8 L 359.2,150.1 L 366.1,152.4 L 371.4,150.5 L 372.0,152.6 L 374.5,153.1 L 376.9,152.5 L 373.6,149.8 L 374.3,147.0 L 382.4,144.0 L 384.2,139.5 L 364.3,135.6 L 359.9,131.4 L 358.6,125.8 L 350.2,128.8 Z",
  "Zangon Kataf": "M 281.3,222.2 L 284.6,216.3 L 290.1,218.0 L 291.2,209.1 L 287.4,207.9 L 287.2,201.8 L 284.2,199.8 L 279.0,200.6 L 272.9,187.4 L 271.5,187.1 L 272.1,189.1 L 270.3,190.5 L 269.2,187.2 L 267.6,187.4 L 265.5,194.3 L 263.3,195.2 L 265.6,195.9 L 264.8,197.9 L 267.1,200.0 L 266.2,204.7 L 270.2,208.0 L 266.9,213.3 L 269.5,214.5 L 272.4,219.3 L 271.5,221.6 L 276.1,227.5 L 277.7,224.1 L 279.9,224.4 Z",
  "Kiyawa": "M 347.8,111.9 L 346.7,111.1 L 349.3,109.3 L 349.7,105.1 L 357.5,103.8 L 360.4,100.4 L 345.8,101.7 L 344.9,99.1 L 342.8,99.4 L 335.6,104.5 L 333.9,109.2 L 338.7,117.6 Z",
  "Zaki": "M 374.2,95.0 L 377.4,94.0 L 374.7,98.9 L 376.8,99.7 L 376.4,101.3 L 380.5,102.3 L 381.0,104.7 L 382.7,105.5 L 382.8,102.7 L 385.0,104.2 L 388.8,102.9 L 385.6,95.5 L 387.9,93.2 L 385.6,89.7 L 381.3,88.4 L 381.8,86.0 L 386.4,82.2 L 390.1,84.6 L 392.2,82.7 L 390.7,81.5 L 391.8,79.3 L 396.9,81.4 L 404.1,78.8 L 403.4,73.3 L 396.6,70.4 L 395.9,72.9 L 388.8,75.2 L 378.7,74.2 L 377.1,75.5 L 378.5,77.7 L 373.2,85.7 Z",
  "Opobo/Nkoro": "M 244.6,488.2 L 242.3,486.7 L 242.1,483.0 L 238.3,485.1 L 239.8,488.7 L 243.9,489.6 Z",
  "Shira": "M 373.1,137.5 L 373.9,134.0 L 371.5,132.3 L 372.1,129.4 L 378.7,126.6 L 375.2,124.6 L 374.8,120.4 L 370.5,115.3 L 369.1,114.7 L 368.8,116.7 L 364.0,115.7 L 360.7,119.1 L 361.8,122.4 L 356.8,119.9 L 355.0,125.7 L 359.7,126.7 L 361.4,133.6 L 365.7,136.3 Z",
  "Dass": "M 341.7,196.2 L 337.2,194.2 L 335.2,196.0 L 333.1,200.6 L 333.7,208.7 L 340.0,206.7 L 344.1,206.7 L 344.4,208.9 L 349.5,207.5 L 349.8,205.7 L 344.5,202.6 L 346.8,200.3 Z",
  "Enugu North": "M 242.7,386.4 L 237.7,385.3 L 237.0,387.0 L 242.2,388.5 Z",
  "Buji": "M 348.1,131.5 L 355.2,126.0 L 357.3,122.1 L 357.3,114.5 L 354.8,111.8 L 349.0,112.3 L 350.5,115.9 L 346.3,119.3 L 348.3,125.6 L 351.0,125.1 L 348.2,126.1 L 347.8,129.9 L 345.7,130.1 L 345.7,128.4 L 344.8,129.6 Z",
  "Ukanafun": "M 251.6,462.5 L 250.3,464.5 L 242.7,466.0 L 240.2,469.1 L 241.2,472.8 L 245.6,470.3 L 247.2,471.7 L 249.3,468.6 L 247.9,467.3 L 253.3,462.8 Z",
  "Agaie": "M 186.0,274.7 L 189.9,275.9 L 192.4,273.4 L 192.3,267.1 L 195.5,262.2 L 192.4,242.6 L 190.0,238.6 L 186.9,238.2 L 184.1,241.9 L 182.0,241.8 L 181.4,244.9 L 179.2,244.7 L 181.8,251.2 L 178.2,250.0 L 178.0,251.7 L 179.6,257.3 L 178.6,261.7 L 182.7,262.7 L 181.3,268.7 Z",
  "Bagwai": "M 272.8,98.4 L 278.1,97.2 L 278.2,91.8 L 274.4,87.3 L 265.4,89.6 L 265.3,93.7 L 267.3,95.2 L 271.3,94.5 Z",
  "Kajuru": "M 263.3,195.2 L 265.5,194.3 L 267.6,187.4 L 269.2,187.2 L 270.3,190.5 L 272.1,189.1 L 270.6,185.8 L 267.3,186.4 L 266.3,177.4 L 262.3,177.8 L 259.0,174.6 L 252.7,176.7 L 249.1,181.3 L 245.5,181.5 L 245.9,186.0 L 242.6,187.8 L 241.2,191.9 L 246.6,197.1 L 247.0,201.2 L 251.7,201.0 L 253.1,203.2 L 255.8,202.1 L 256.7,198.5 L 260.4,198.6 Z",
  "Katcha": "M 176.0,268.0 L 181.3,268.7 L 182.1,266.7 L 182.7,262.7 L 178.6,261.7 L 178.2,250.0 L 181.8,251.2 L 178.9,245.6 L 181.4,244.9 L 185.6,238.5 L 190.4,238.2 L 189.4,231.1 L 185.3,235.0 L 177.4,229.8 L 173.5,230.8 L 172.4,240.5 L 176.6,242.1 L 170.2,252.9 L 171.9,266.9 L 173.0,268.6 Z",
  "Kafur": "M 250.4,127.6 L 251.0,119.1 L 260.8,116.1 L 258.3,107.2 L 253.9,105.5 L 249.6,107.1 L 248.3,113.1 L 245.2,114.1 L 243.2,111.6 L 242.2,115.9 L 243.3,117.9 L 246.7,117.7 L 247.8,120.4 L 244.9,120.2 L 244.9,124.3 L 241.0,124.6 L 239.5,127.8 L 242.3,127.4 L 245.6,129.7 Z",
  "Wasagu-Danko": "M 158.9,144.5 L 164.4,141.4 L 166.4,142.9 L 168.5,138.1 L 167.9,141.6 L 170.9,140.5 L 175.8,130.1 L 169.5,129.9 L 166.0,126.0 L 157.3,127.4 L 157.0,117.6 L 154.6,114.5 L 141.3,115.2 L 141.0,124.7 L 135.6,128.0 L 136.4,130.7 L 140.0,131.9 L 139.8,136.8 L 147.1,137.7 L 151.4,141.3 L 156.1,139.4 L 155.3,143.0 Z M 112.5,112.1 L 112.3,115.9 L 121.2,121.8 L 121.7,123.8 L 124.0,121.1 L 134.0,121.4 L 138.5,115.1 L 137.5,113.2 L 133.0,113.2 L 131.9,109.9 L 130.3,110.8 L 131.1,108.8 L 127.4,110.8 L 124.5,108.8 L 124.4,111.4 L 118.8,113.2 L 115.9,111.1 Z",
  "Bida": "M 171.9,250.0 L 168.3,249.4 L 166.4,246.1 L 161.1,245.8 L 157.4,247.2 L 156.0,251.6 L 159.5,257.9 L 170.8,258.6 L 170.2,252.9 Z",
  "Kirfi": "M 408.6,189.5 L 406.4,178.8 L 398.9,176.5 L 390.7,166.3 L 389.2,170.5 L 383.1,171.3 L 380.9,174.9 L 382.0,176.5 L 377.1,180.1 L 376.4,185.7 L 380.9,188.1 L 394.9,188.8 L 397.7,190.9 L 401.0,188.0 L 402.6,189.6 Z",
  "Dandi": "M 53.6,92.9 L 50.9,90.5 L 46.8,91.6 L 49.0,97.5 L 46.3,102.8 L 48.7,110.6 L 46.8,113.4 L 47.6,115.5 L 56.7,119.8 L 59.2,116.9 L 63.5,118.0 L 66.3,112.0 L 63.4,104.2 L 65.2,98.1 L 62.4,94.4 Z",
  "Bagudu": "M 56.0,119.5 L 47.6,115.5 L 46.8,113.2 L 41.7,114.8 L 39.1,127.7 L 39.8,134.2 L 51.6,143.3 L 51.3,149.0 L 53.9,154.2 L 62.1,153.0 L 65.1,149.2 L 70.5,148.7 L 78.8,148.7 L 78.6,151.3 L 81.2,152.7 L 80.7,142.5 L 82.3,140.6 L 78.4,139.4 L 74.3,132.8 L 85.8,127.3 L 84.0,124.5 L 85.8,124.1 L 85.2,121.1 L 77.8,118.3 L 76.1,115.0 L 74.7,116.7 L 70.7,116.4 L 64.9,124.0 Z",
  "Kankara": "M 240.4,93.6 L 237.4,90.7 L 233.6,91.9 L 230.2,90.0 L 228.3,92.8 L 222.1,94.5 L 231.0,105.8 L 241.6,108.9 L 247.4,106.5 L 247.9,104.0 L 244.2,100.0 L 241.4,100.0 L 243.9,96.4 L 241.3,96.4 Z",
  "Itas/Gadau": "M 349.0,112.3 L 354.8,111.8 L 357.2,114.1 L 357.5,112.3 L 362.6,110.0 L 364.8,111.2 L 371.4,107.9 L 372.8,110.7 L 376.6,109.6 L 378.1,111.6 L 381.2,111.0 L 385.3,108.9 L 384.2,105.5 L 389.5,103.5 L 386.5,102.5 L 385.0,104.2 L 383.6,102.6 L 382.7,105.5 L 380.7,104.5 L 380.5,102.3 L 376.4,101.3 L 376.8,99.7 L 374.7,98.9 L 377.4,94.0 L 375.9,93.8 L 370.3,98.5 L 353.6,105.2 L 349.7,105.1 L 349.3,109.3 L 346.7,111.1 Z",
  "Apapa": "M 33.6,385.3 L 32.0,387.3 L 33.4,389.4 L 35.5,388.1 Z",
  "Ondo East": "M 111.1,360.2 L 115.0,363.2 L 115.7,347.6 L 109.3,348.3 L 109.5,352.7 L 111.7,353.8 Z",
  "Warji": "M 346.6,137.6 L 348.6,144.2 L 347.2,147.3 L 358.7,148.9 L 359.8,139.8 L 357.0,135.5 L 349.7,138.6 Z",
  "Katagum": "M 393.7,115.6 L 390.8,112.4 L 389.4,113.3 L 390.2,108.7 L 386.2,105.0 L 383.8,106.4 L 385.3,108.9 L 381.2,111.0 L 378.1,111.6 L 376.6,109.6 L 372.8,110.7 L 371.4,107.9 L 364.5,111.2 L 364.9,113.3 L 369.1,112.6 L 373.4,120.3 L 382.8,117.4 L 382.4,120.2 L 386.1,120.5 L 383.6,123.6 L 385.5,126.9 L 390.8,123.5 L 394.6,124.7 L 395.8,123.2 L 395.8,116.0 Z",
  "Mani": "M 258.9,41.4 L 255.4,45.0 L 256.1,49.0 L 254.1,52.6 L 256.9,57.0 L 262.9,53.8 L 266.6,54.2 L 265.7,58.5 L 262.0,59.0 L 266.4,61.4 L 271.1,57.5 L 269.9,50.0 L 263.4,50.5 Z",
  "Sanga": "M 270.0,242.1 L 268.8,251.3 L 275.3,251.3 L 278.6,244.5 L 282.9,243.9 L 291.8,254.0 L 298.2,245.1 L 300.5,234.4 L 297.8,233.2 L 295.8,228.9 L 291.5,228.4 L 278.0,241.6 Z",
  "Bogoro": "M 344.6,226.9 L 344.7,225.4 L 348.2,226.9 L 354.0,226.0 L 356.2,223.9 L 356.0,218.3 L 342.0,214.1 L 336.7,214.8 L 337.4,216.7 L 341.2,216.9 L 336.0,223.3 L 340.0,226.5 Z",
  "Fika": "M 428.1,115.9 L 427.7,118.6 L 424.8,120.0 L 418.7,119.0 L 412.3,123.2 L 411.7,136.0 L 413.1,135.7 L 412.2,137.0 L 415.0,140.8 L 419.7,135.2 L 420.5,138.3 L 425.9,141.0 L 431.9,140.4 L 439.6,149.2 L 442.3,147.1 L 443.4,143.4 L 442.0,141.1 L 447.2,128.1 L 444.1,126.3 L 434.9,130.0 L 432.0,128.4 L 433.8,124.0 L 431.1,124.3 L 430.4,118.0 Z",
  "Kuje": "M 221.4,257.9 L 225.1,264.0 L 220.9,266.8 L 221.9,271.0 L 214.5,279.0 L 214.7,283.0 L 219.8,284.2 L 233.9,280.7 L 239.5,273.2 L 232.4,272.8 L 232.8,270.7 L 235.1,268.1 L 240.5,268.1 L 240.6,266.5 L 239.7,260.9 L 236.1,260.5 L 236.3,258.8 L 232.4,258.1 L 232.0,260.1 Z",
  "Sule Tankarkar": "M 333.2,62.6 L 332.5,55.3 L 317.8,54.1 L 319.8,59.8 L 316.4,62.2 L 317.7,65.4 L 315.7,67.5 L 320.7,70.9 L 324.1,70.2 L 328.8,75.7 L 335.7,76.8 L 336.1,69.5 L 333.0,70.0 L 331.6,67.3 Z",
  "Ibadan North East": "M 62.4,336.2 L 60.4,338.2 L 61.0,340.5 Z",
  "Bindawa": "M 255.1,61.2 L 256.4,62.5 L 253.6,63.0 L 255.7,65.6 L 260.5,66.4 L 261.2,68.7 L 263.4,67.1 L 264.9,68.1 L 263.8,60.1 L 262.0,59.0 L 265.7,58.5 L 267.0,54.5 L 262.9,53.8 L 256.9,57.0 L 255.5,55.1 Z",
  "Ilorin South": "M 93.8,281.5 L 98.9,285.5 L 104.6,284.6 L 103.9,281.1 L 95.8,279.0 L 94.1,276.0 L 88.9,278.4 L 90.3,279.7 L 93.8,277.6 L 95.4,281.4 Z",
  "Gamawa": "M 407.0,98.7 L 404.1,78.8 L 396.9,81.4 L 391.8,79.3 L 390.7,81.5 L 392.2,82.7 L 390.1,84.6 L 386.4,82.2 L 381.8,86.0 L 381.3,88.4 L 385.6,89.7 L 387.9,93.2 L 385.6,95.5 L 389.5,103.5 L 386.2,105.0 L 389.6,107.5 L 389.4,113.3 L 390.8,112.4 L 392.1,115.0 L 397.4,113.4 L 400.2,108.0 L 403.7,111.1 L 409.3,108.0 L 405.8,101.0 Z",
  "Kafin Hausa": "M 354.3,91.5 L 356.9,96.8 L 356.3,99.9 L 360.8,101.3 L 370.3,98.5 L 374.6,95.9 L 373.2,85.7 L 376.0,81.2 L 370.9,78.0 L 366.7,78.6 Z",
  "Ado Odo/Ota": "M 9.7,380.5 L 10.2,383.5 L 23.4,383.6 L 25.5,382.4 L 25.0,380.0 L 29.5,372.1 L 27.7,369.8 L 20.8,372.2 L 17.9,371.0 L 15.9,375.1 L 13.2,374.3 Z",
  "Garko": "M 317.3,121.1 L 312.3,118.1 L 308.7,118.2 L 311.3,116.4 L 308.8,111.9 L 306.9,114.2 L 303.5,112.3 L 305.0,129.5 L 308.2,127.7 L 307.1,126.2 L 309.8,121.1 L 312.4,120.2 L 316.0,122.8 Z",
  "Kubau": "M 289.8,164.8 L 294.3,163.2 L 296.1,146.4 L 291.0,143.2 L 286.5,144.5 L 285.8,142.1 L 281.7,140.5 L 280.1,144.6 L 274.0,143.6 L 278.2,153.4 L 274.9,155.5 L 273.4,160.2 L 268.9,161.5 L 270.3,167.0 L 277.7,167.6 L 278.2,171.0 L 281.4,172.7 L 281.7,176.4 L 286.5,179.0 L 282.4,168.2 L 285.2,164.2 Z",
  "Wukari": "M 379.4,302.6 L 379.3,300.6 L 382.4,298.5 L 381.3,294.2 L 376.7,292.6 L 367.5,293.7 L 364.3,290.7 L 360.8,292.7 L 356.2,301.2 L 342.6,301.2 L 324.7,310.8 L 321.5,316.0 L 322.3,317.1 L 335.1,314.1 L 345.9,314.9 L 355.7,326.1 Z",
  "Gwarzo": "M 267.2,99.2 L 265.8,98.1 L 261.7,100.1 L 258.8,97.1 L 257.0,100.5 L 258.5,108.7 L 260.6,109.5 L 260.9,107.8 L 266.9,106.8 L 271.9,103.3 L 271.3,101.6 L 266.0,101.1 Z",
  "Oyigbo": "M 232.0,474.4 L 234.7,471.0 L 241.1,473.2 L 239.2,470.2 L 231.6,468.3 L 226.5,469.5 L 220.3,467.0 L 222.0,470.7 L 224.2,469.8 L 223.1,472.8 L 227.2,470.9 Z",
  "Ughelli South": "M 164.3,454.9 L 165.2,452.3 L 169.1,451.2 L 165.9,449.3 L 167.0,445.0 L 165.3,437.3 L 161.0,435.8 L 161.4,433.6 L 156.5,432.8 L 160.1,436.9 L 159.9,439.4 L 150.7,440.7 L 151.6,444.6 L 155.8,443.4 L 155.3,445.7 L 157.9,447.2 L 158.4,450.7 Z",
  "Fakai": "M 89.6,122.4 L 90.9,124.3 L 96.3,122.3 L 97.4,125.2 L 103.0,127.4 L 105.1,133.1 L 110.4,129.8 L 113.8,131.2 L 114.9,133.8 L 120.6,132.4 L 123.7,125.7 L 121.2,121.8 L 112.3,115.9 L 112.1,112.4 L 110.2,113.2 L 110.0,111.1 L 106.5,110.2 L 92.8,117.1 L 94.0,120.2 Z",
  "Kaugama": "M 349.8,55.4 L 355.6,64.9 L 349.0,68.8 L 348.2,75.8 L 344.7,77.7 L 346.3,81.2 L 349.4,80.7 L 350.0,83.1 L 354.7,83.2 L 360.6,79.9 L 362.7,76.5 L 353.2,75.8 L 358.6,67.4 L 358.9,63.5 L 354.1,56.7 Z",
  "Esan Central": "M 178.1,366.6 L 174.1,372.9 L 175.3,376.7 L 172.7,380.0 L 178.8,376.3 L 177.8,371.4 L 184.5,370.1 L 184.5,367.7 L 180.7,367.0 L 179.2,368.9 Z",
  "Goronyo": "M 161.3,16.7 L 155.5,16.1 L 154.2,20.0 L 150.6,20.9 L 150.0,14.8 L 147.6,13.9 L 142.8,16.5 L 144.3,19.8 L 139.8,26.5 L 141.7,30.1 L 158.1,30.9 L 158.6,34.6 L 151.6,33.7 L 151.6,40.5 L 166.7,41.6 L 164.7,32.8 L 168.4,25.6 Z",
  "Ibarapa East": "M 32.5,332.0 L 35.3,335.0 L 38.1,332.3 L 39.0,337.7 L 41.5,336.5 L 46.0,327.7 L 44.8,322.6 L 47.0,321.1 L 45.2,317.2 L 42.2,321.5 L 39.0,320.7 L 33.2,324.7 Z",
  "Ikpoba-Okha": "M 139.2,408.6 L 141.2,408.2 L 142.8,410.8 L 149.0,407.3 L 153.8,410.2 L 151.9,405.1 L 153.2,399.9 L 156.7,397.8 L 155.9,395.3 L 150.0,393.2 L 150.8,390.8 L 148.1,390.4 L 146.9,397.7 L 143.9,399.5 L 141.2,405.4 L 138.7,404.9 L 137.7,407.9 Z",
  "Awgu": "M 242.6,398.8 L 237.3,393.8 L 234.0,398.7 L 236.3,403.1 L 236.3,409.7 L 241.3,408.9 L 243.4,406.0 L 240.6,402.9 L 241.3,400.6 L 243.2,401.0 Z",
  "Olorunsogo": "M 72.4,304.9 L 73.8,304.4 Z M 76.0,255.6 L 71.8,259.0 L 64.3,260.5 L 60.3,267.0 L 59.1,277.2 L 62.0,281.7 L 67.8,279.7 L 74.5,280.1 L 78.9,277.2 L 75.2,263.6 L 82.2,255.1 Z",
  "Kabba/Bunu": "M 169.7,285.2 L 169.1,297.6 L 166.9,298.0 L 169.3,303.9 L 169.0,312.6 L 166.7,314.3 L 171.7,322.6 L 174.9,320.7 L 179.0,321.3 L 179.0,317.3 L 181.7,314.2 L 181.9,310.4 L 178.0,306.2 L 177.0,301.1 L 179.9,301.1 L 185.0,306.0 L 188.8,305.7 L 188.0,302.8 L 190.4,297.6 L 184.9,288.3 L 179.0,282.7 L 175.2,281.9 Z",
  "Ningi": "M 325.5,133.1 L 319.9,133.7 L 311.7,140.8 L 310.4,144.0 L 306.0,144.7 L 303.0,157.5 L 316.8,159.8 L 317.5,163.7 L 325.4,165.9 L 345.7,157.4 L 348.6,145.2 L 345.5,137.0 L 346.3,133.7 L 341.5,133.7 L 340.7,135.6 L 333.1,132.0 Z",
  "Kurmi": "M 379.2,343.6 L 374.1,357.0 L 377.7,364.4 L 391.5,364.4 L 393.8,356.9 L 396.6,354.5 L 404.2,360.4 L 408.0,360.2 L 415.5,351.3 L 415.6,343.6 L 411.4,331.7 L 405.3,324.8 L 386.8,341.5 L 386.0,344.7 Z",
  "Bakori": "M 241.0,124.6 L 244.9,124.3 L 244.9,120.2 L 247.4,121.3 L 246.7,117.7 L 243.3,117.9 L 238.2,113.8 L 235.6,107.6 L 230.7,105.2 L 229.8,111.2 L 232.8,119.0 L 231.2,121.2 L 232.6,123.4 L 238.5,121.8 Z",
  "Nsit Atai": "M 268.3,475.1 L 270.7,468.1 L 266.6,466.9 L 267.2,469.5 L 264.5,470.4 L 264.4,472.4 Z",
  "Kankia": "M 258.8,86.0 L 260.8,80.8 L 257.9,81.6 L 255.4,79.5 L 259.6,78.7 L 258.3,73.1 L 262.9,69.0 L 257.2,65.5 L 254.5,67.1 L 251.3,66.3 L 253.5,70.9 L 251.4,72.1 L 252.5,74.2 L 250.6,78.4 L 247.7,76.0 L 246.1,80.2 L 254.3,82.3 Z",
  "Gagarawa": "M 335.8,68.9 L 335.0,73.5 L 336.8,78.1 L 342.5,79.0 L 349.1,73.9 L 349.0,68.8 L 344.1,66.8 Z",
  "Giade": "M 382.5,139.4 L 380.7,133.3 L 382.8,129.9 L 381.1,125.9 L 386.1,121.1 L 382.4,120.2 L 382.8,117.4 L 374.0,121.0 L 375.2,124.6 L 378.7,127.0 L 373.2,128.3 L 371.5,132.3 L 373.9,134.0 L 372.5,136.7 L 374.1,138.2 Z",
  "Iguegben": "M 182.5,375.3 L 176.8,377.5 L 176.7,384.2 L 171.3,385.0 L 172.1,389.0 L 176.4,388.1 L 179.7,391.3 L 180.9,388.5 L 178.7,382.6 L 182.3,379.3 Z",
  "Akure North": "M 126.2,344.9 L 133.8,353.2 L 138.0,354.7 L 139.9,353.2 L 136.9,351.8 L 136.5,345.1 L 133.4,342.7 L 131.5,335.1 L 125.1,335.3 Z",
  "Khana": "M 239.5,483.7 L 242.1,483.0 L 242.2,474.1 L 234.2,471.1 L 232.0,474.3 L 233.5,479.8 L 230.9,483.2 Z",
  "Oruk Anam": "M 253.6,462.1 L 247.9,467.3 L 249.3,468.6 L 247.2,471.7 L 245.6,470.3 L 241.2,472.8 L 242.8,476.1 L 241.9,479.5 L 246.3,479.7 L 250.8,476.9 L 255.2,468.2 Z",
  "Misau": "M 396.9,121.0 L 394.6,124.7 L 390.8,123.5 L 385.5,126.9 L 383.5,123.4 L 381.1,125.9 L 382.8,129.9 L 380.7,133.3 L 382.5,139.4 L 393.9,136.8 L 395.9,128.9 L 401.8,127.8 L 401.2,124.4 Z",
  "Kolokuma/Opokuma": "M 172.9,465.1 L 183.5,457.2 L 185.6,454.5 L 185.0,452.0 L 178.3,453.2 L 173.0,461.2 Z",
  "Karaye": "M 269.5,104.3 L 266.9,106.8 L 260.9,107.8 L 260.6,109.5 L 258.5,108.7 L 260.7,116.3 L 264.8,115.3 L 263.6,114.0 L 268.1,114.7 L 272.9,108.8 Z",
  "Sagbama": "M 165.2,467.6 L 165.0,471.7 L 169.2,471.3 L 170.1,463.2 L 168.3,459.5 L 172.6,462.1 L 178.3,453.2 L 188.7,450.3 L 193.8,445.4 L 194.1,442.7 L 189.9,442.3 L 190.3,445.1 L 186.0,446.2 L 182.3,445.5 L 179.8,447.5 L 180.1,449.9 L 176.2,449.6 L 175.1,453.8 L 172.1,455.3 L 169.9,454.2 L 168.3,457.0 L 164.3,454.9 Z",
  "Garki": "M 323.0,81.1 L 326.6,80.6 L 332.5,83.2 L 334.1,80.6 L 336.6,81.7 L 342.5,79.0 L 328.8,75.7 L 324.1,70.2 L 320.7,70.9 L 315.7,67.5 L 313.1,67.9 L 308.9,74.2 L 309.6,75.8 L 301.9,82.7 Z",
  "Mai'Adua": "M 286.4,44.1 L 287.4,41.8 L 268.8,29.6 L 274.3,45.4 L 276.1,44.5 L 278.0,46.7 L 277.9,45.2 L 284.3,41.8 L 284.0,45.2 Z",
  "Ezza North": "M 270.0,393.2 L 267.4,390.6 L 261.2,391.9 L 260.5,396.0 L 258.2,397.8 L 259.6,400.7 L 263.6,402.1 L 267.1,399.8 Z",
  "Ibi": "M 378.1,264.2 L 365.7,277.9 L 353.6,287.0 L 346.8,286.1 L 346.3,290.9 L 333.9,288.3 L 331.9,292.9 L 336.4,296.9 L 335.1,298.3 L 336.5,302.8 L 332.5,306.8 L 343.9,300.8 L 354.1,301.8 L 357.6,300.0 L 360.8,292.7 L 364.5,290.7 L 378.9,272.1 L 385.0,270.5 Z",
  "Omala": "M 238.2,331.4 L 241.9,330.6 L 243.5,324.6 L 253.3,321.2 L 248.8,310.9 L 249.5,305.2 L 237.9,303.6 L 233.2,311.2 L 233.4,315.0 L 237.8,322.3 Z",
  "Ile Oluji/Okeigbo": "M 115.7,347.6 L 117.6,343.1 L 116.4,337.8 L 103.2,339.3 L 102.8,346.5 L 96.3,353.6 L 109.5,352.7 L 109.3,348.3 Z",
  "Baure": "M 293.3,54.8 L 295.9,59.7 L 302.8,63.4 L 309.0,63.3 L 314.9,56.1 L 318.1,55.6 L 317.8,54.1 L 314.6,54.5 L 301.1,49.7 L 301.5,54.1 L 297.0,52.2 L 293.4,53.0 Z",
  "Dutsin Ma": "M 246.1,80.2 L 247.4,69.5 L 239.0,68.9 L 237.8,71.4 L 235.9,70.7 L 236.4,79.7 L 232.4,81.4 L 235.6,84.4 L 242.9,84.1 L 241.4,79.0 Z",
  "Uhunmwonde": "M 159.1,368.6 L 155.1,379.1 L 148.2,385.8 L 147.5,388.7 L 147.8,390.8 L 150.8,390.8 L 150.0,393.2 L 153.8,395.4 L 153.7,393.7 L 156.7,397.8 L 161.3,399.4 L 164.7,393.2 L 172.5,389.9 L 169.2,381.5 L 170.3,374.6 L 166.2,369.8 Z",
  "Taura": "M 332.6,89.4 L 342.4,87.2 L 343.5,82.8 L 346.3,80.9 L 344.7,77.7 L 336.6,81.7 L 334.1,80.6 L 332.5,83.2 L 326.6,80.6 L 322.0,82.0 L 321.5,83.4 L 324.0,83.8 L 323.3,86.1 L 325.8,85.1 L 329.3,90.0 Z",
  "Ughelli North": "M 169.1,451.2 L 173.6,449.8 L 170.3,445.5 L 168.3,437.7 L 171.3,431.6 L 176.1,429.7 L 173.0,422.7 L 167.6,426.4 L 168.5,429.7 L 165.1,433.1 L 161.7,432.8 L 158.6,429.8 L 157.9,431.5 L 158.2,433.2 L 161.4,433.6 L 161.0,435.8 L 165.3,437.3 L 167.0,445.0 L 165.9,449.3 Z",
  "Orhionmwon": "M 179.7,391.3 L 176.4,388.1 L 173.5,388.3 L 172.2,390.5 L 164.7,393.2 L 161.3,399.4 L 156.7,397.8 L 153.2,399.9 L 152.5,406.8 L 153.8,410.2 L 161.6,416.4 L 160.3,420.5 L 161.8,423.1 L 168.7,421.7 L 176.5,414.4 L 177.8,407.2 L 174.0,405.8 L 169.4,395.6 L 171.9,391.5 L 176.2,395.5 Z",
  "Soba": "M 256.3,142.1 L 254.3,142.9 L 256.7,148.2 L 255.3,154.1 L 257.4,156.7 L 256.4,158.9 L 259.6,160.7 L 258.2,163.2 L 259.3,165.7 L 270.1,166.6 L 268.9,161.5 L 273.4,160.2 L 274.9,155.5 L 278.2,153.4 L 276.5,148.7 L 272.4,142.4 L 265.3,137.9 L 257.7,139.7 Z",
  "Karasuwa": "M 387.6,55.6 L 389.6,57.0 L 393.8,56.2 L 396.6,52.9 L 404.3,51.9 L 414.1,53.1 L 418.0,49.3 L 420.2,50.2 L 426.2,47.9 L 415.6,46.3 L 412.4,49.4 L 409.8,44.4 L 412.6,40.6 L 410.7,36.5 L 405.7,37.8 L 400.6,44.2 L 392.6,42.9 L 389.3,44.5 L 389.0,48.8 L 396.0,52.9 Z",
  "Ondo West": "M 109.5,352.7 L 96.3,353.6 L 93.5,358.7 L 92.8,366.1 L 111.1,360.2 L 111.7,353.8 Z",
  "Ika South": "M 178.4,409.2 L 181.5,409.1 L 183.0,403.8 L 177.1,405.2 L 176.8,401.9 L 173.8,400.5 L 175.0,396.8 L 177.3,396.3 L 178.1,398.5 L 179.6,395.2 L 177.9,393.8 L 175.4,395.3 L 171.9,391.5 L 169.4,395.6 L 174.0,405.8 L 177.8,407.2 Z",
  "Oye": "M 135.6,320.6 L 135.4,314.5 L 137.8,312.6 L 136.5,304.6 L 133.7,301.3 L 132.1,305.6 L 127.9,305.0 L 129.1,308.6 L 127.6,314.2 L 128.7,318.1 Z",
  "Bichi": "M 289.9,84.5 L 287.5,79.5 L 284.9,80.1 L 284.1,77.8 L 282.3,80.5 L 277.4,78.3 L 275.4,80.2 L 273.3,75.8 L 269.7,79.0 L 272.7,83.7 L 271.5,87.2 L 274.4,87.3 L 276.0,90.6 L 277.0,89.1 L 280.3,90.4 L 280.5,88.4 Z",
  "Kwali": "M 220.9,258.6 L 215.9,257.2 L 209.6,259.9 L 205.4,265.6 L 207.2,275.8 L 214.5,279.0 L 221.9,271.0 L 220.9,266.8 L 225.2,263.3 Z",
  "Oyo West": "M 63.2,313.2 L 67.0,312.2 L 66.3,310.3 Z M 52.8,313.3 L 58.8,313.5 L 60.3,317.7 L 62.2,316.4 L 60.6,311.7 L 62.5,309.5 L 55.6,304.8 L 55.9,298.8 L 52.2,302.6 L 51.0,307.0 Z",
  "Kusada": "M 262.3,68.3 L 262.6,70.1 L 258.2,73.4 L 259.6,78.7 L 255.6,78.7 L 257.3,81.4 L 268.1,76.6 L 267.8,68.4 L 266.1,69.4 L 263.4,67.1 Z",
  "Roni": "M 273.7,62.5 L 275.2,65.6 L 280.1,66.9 L 280.7,70.7 L 284.5,75.4 L 288.2,66.9 L 285.6,67.6 L 278.3,62.0 Z",
  "Toro": "M 306.6,182.3 L 312.5,183.9 L 313.5,186.0 L 312.2,190.7 L 314.7,192.7 L 313.2,201.4 L 315.9,202.6 L 315.9,200.4 L 319.6,200.9 L 322.0,199.0 L 328.0,200.0 L 326.5,201.1 L 327.4,209.3 L 329.4,210.1 L 330.6,207.4 L 334.3,206.5 L 333.1,200.6 L 335.7,195.3 L 337.2,194.2 L 341.7,196.2 L 345.8,190.8 L 346.9,192.8 L 348.5,191.4 L 346.1,189.8 L 348.3,189.4 L 350.6,184.7 L 350.5,179.6 L 347.8,177.9 L 346.6,172.7 L 348.8,170.2 L 345.7,166.3 L 336.7,161.1 L 325.3,165.9 L 317.5,163.7 L 316.8,159.8 L 305.5,157.6 L 304.2,158.9 L 308.5,165.8 L 304.8,170.8 L 303.2,179.2 Z",
  "Akure South": "M 126.2,344.9 L 119.6,343.9 L 121.4,347.2 L 128.2,352.5 L 133.8,353.2 Z",
  "Igabi": "M 236.2,172.9 L 238.2,169.9 L 241.5,173.0 L 245.5,171.5 L 249.4,172.9 L 250.3,171.1 L 252.1,177.2 L 259.2,174.7 L 260.1,171.2 L 258.3,171.1 L 260.1,166.8 L 258.2,163.2 L 260.0,162.3 L 256.4,158.9 L 257.4,156.7 L 254.0,151.7 L 249.1,150.1 L 247.5,151.7 L 245.1,149.7 L 239.8,152.0 L 234.5,149.3 L 228.5,154.4 L 225.0,164.3 L 231.2,169.4 L 227.5,174.4 L 230.1,176.7 L 234.5,176.6 Z",
  "Okene": "M 175.0,328.1 L 172.2,329.3 L 175.9,333.6 L 180.2,332.0 L 180.5,330.3 Z",
  "Onitsha South": "M 205.1,403.2 L 203.8,401.9 Z",
  "Agatu": "M 253.2,319.0 L 255.9,317.0 L 262.6,316.6 L 267.0,321.5 L 276.5,314.7 L 259.5,306.9 L 249.5,305.3 L 248.8,310.9 Z",
  "Dala": "M 289.0,94.7 L 290.9,98.4 L 292.0,97.3 Z",
  "Anka": "M 153.0,83.0 L 151.6,89.7 L 149.6,91.3 L 152.9,95.7 L 156.5,97.1 L 158.1,103.5 L 163.0,110.1 L 161.2,117.0 L 168.5,115.1 L 173.4,118.3 L 178.3,116.2 L 179.4,107.0 L 182.0,105.9 L 177.4,102.8 L 173.5,95.4 L 174.1,92.8 L 168.3,91.8 L 166.3,88.9 L 163.0,91.5 L 161.0,90.7 L 159.9,81.7 L 156.7,85.5 Z",
  "Tofa": "M 278.2,91.8 L 278.1,96.9 L 280.5,96.6 L 279.1,100.8 L 285.9,101.7 L 286.4,98.4 L 283.5,93.3 Z",
  "Ingawa": "M 272.8,55.9 L 266.4,61.4 L 263.9,59.4 L 263.4,65.4 L 265.6,66.0 L 265.1,68.8 L 267.5,68.2 L 269.0,70.2 L 268.1,76.6 L 273.5,75.2 L 274.7,68.7 L 278.0,67.2 L 273.4,64.0 L 272.9,60.6 L 275.0,60.0 Z",
  "Uvwie": "M 154.7,435.2 L 154.8,433.4 L 158.1,433.1 L 154.1,429.6 L 150.8,431.8 Z",
  "Idanre": "M 114.9,363.3 L 115.6,368.9 L 121.6,373.7 L 128.3,364.1 L 142.4,364.0 L 139.3,355.4 L 128.2,352.5 L 117.3,344.7 L 115.7,347.6 Z",
  "Okpe": "M 150.8,431.8 L 154.1,429.6 L 156.7,431.5 L 158.6,429.8 L 160.6,430.7 L 160.9,427.9 L 158.2,425.5 L 160.7,420.7 L 156.8,422.0 L 154.4,419.7 L 151.8,424.6 L 148.1,425.6 L 150.4,428.4 L 148.3,430.1 Z",
  "Anambra West": "M 198.7,381.0 L 202.2,397.8 L 204.7,400.4 L 208.2,389.8 L 208.5,381.0 L 206.0,379.4 Z",
  "Mushin": "M 33.8,382.8 L 33.7,381.0 L 32.4,381.4 L 31.5,384.0 Z",
  "Shagamu": "M 44.8,363.0 L 38.6,367.1 L 38.1,374.9 L 50.0,374.6 L 49.9,366.3 Z",
  "Biase": "M 261.5,423.1 L 260.0,425.6 L 261.6,428.3 L 261.1,434.2 L 265.3,433.2 L 266.0,441.3 L 268.6,447.8 L 270.7,447.9 L 277.9,441.7 L 278.7,438.9 L 267.3,420.5 L 265.7,419.8 Z",
  "Gaya": "M 311.0,102.2 L 310.9,104.1 L 313.5,105.2 L 310.0,108.1 L 311.3,112.7 L 315.9,111.5 L 317.8,114.2 L 323.6,112.7 L 323.0,107.1 L 325.3,106.5 L 327.1,102.8 L 324.1,104.0 L 323.0,106.8 L 319.5,106.4 L 321.0,103.0 L 317.0,101.3 Z",
  "Charanchi": "M 242.3,61.9 L 247.5,66.4 L 247.3,75.4 L 250.6,78.4 L 252.5,74.2 L 251.4,72.1 L 253.5,70.9 L 251.3,66.3 L 254.5,67.1 L 255.6,64.7 L 253.6,62.8 L 256.5,61.9 L 253.2,61.4 L 251.9,59.2 Z",
  "Etsako Central": "M 199.6,359.5 L 192.2,357.1 L 190.9,350.2 L 186.3,349.4 L 186.6,352.8 L 183.7,355.5 L 183.3,359.5 L 184.2,361.5 L 190.9,363.0 L 192.1,368.8 L 196.8,368.8 Z",
  "Darazo": "M 401.8,127.8 L 395.9,128.9 L 393.9,136.8 L 384.8,138.4 L 382.6,143.8 L 380.1,144.5 L 382.6,145.7 L 382.0,152.2 L 378.8,153.7 L 383.4,156.9 L 387.6,154.3 L 389.7,155.4 L 386.9,158.8 L 391.4,157.8 L 387.9,161.9 L 390.9,161.8 L 392.2,163.7 L 399.7,153.7 L 398.0,151.3 L 401.2,145.7 L 402.8,144.8 L 404.5,146.9 L 412.3,145.3 L 416.3,142.3 L 412.2,137.0 L 413.1,135.7 L 411.7,136.0 L 412.6,125.7 L 409.9,126.9 L 407.6,125.1 Z",
  "Ijumu": "M 157.3,310.0 L 152.4,315.4 L 155.6,319.9 L 162.1,319.3 L 162.4,324.3 L 166.1,330.4 L 170.5,327.5 L 171.7,324.4 L 166.7,314.3 L 168.9,313.2 L 169.5,305.4 L 167.0,298.2 Z",
  "Irepodun": "M 91.6,308.4 L 89.7,315.0 L 93.8,310.7 L 94.3,307.9 Z",
  "Egbeda": "M 72.2,337.1 L 72.3,334.2 L 68.1,335.7 L 66.7,332.7 L 66.5,335.8 L 61.8,337.7 L 63.2,339.7 L 70.6,340.1 L 69.9,342.8 L 71.7,341.8 Z",
  "Akoko South East": "M 163.1,340.1 L 164.9,339.6 L 163.1,332.0 L 156.7,332.3 L 157.9,337.5 Z",
  "Faskari": "M 221.0,121.4 L 224.2,118.9 L 230.9,120.6 L 232.8,119.0 L 229.8,111.2 L 230.8,104.9 L 228.3,101.7 L 222.7,102.7 L 222.7,105.9 L 218.6,109.0 L 210.7,108.5 L 209.7,110.6 L 208.2,118.0 L 210.8,121.3 L 210.7,124.5 Z",
  "Makarfi": "M 257.7,139.7 L 265.3,137.9 L 268.1,139.9 L 271.0,136.2 L 268.6,133.9 L 268.9,130.6 L 264.3,131.9 L 263.5,125.8 L 259.6,130.0 L 255.9,130.6 L 259.5,135.0 L 256.4,135.0 L 256.2,139.2 Z",
  "Udu": "M 155.0,439.0 L 157.6,440.8 L 159.9,439.4 L 160.1,436.9 L 156.5,432.8 L 152.7,436.9 Z",
  "Bunkure": "M 289.3,112.8 L 287.4,114.3 L 289.2,121.2 L 293.0,117.9 L 295.4,119.4 L 295.6,117.2 L 303.4,117.4 L 304.2,114.8 L 303.2,110.1 L 301.0,110.0 L 299.5,115.8 L 298.0,111.7 L 295.0,111.4 L 294.1,109.4 Z",
  "Funtua": "M 230.1,135.3 L 233.5,136.3 L 235.7,122.7 L 232.6,123.4 L 231.9,121.0 L 224.2,118.9 L 224.9,124.1 L 227.9,125.7 L 228.1,123.7 L 231.3,126.7 Z",
  "Dambatta": "M 302.4,84.1 L 302.0,82.2 L 305.5,78.2 L 300.5,75.0 L 302.6,69.4 L 292.3,66.8 L 293.1,72.8 L 288.7,71.3 L 287.0,72.7 L 290.5,76.8 L 288.0,79.6 L 293.2,78.0 L 296.0,84.8 L 298.1,84.8 L 299.4,82.2 Z",
  "Jakusko": "M 427.2,80.0 L 425.7,71.0 L 419.3,72.4 L 419.1,70.5 L 418.2,72.5 L 417.3,68.0 L 415.5,67.3 L 420.1,61.4 L 417.5,58.5 L 416.8,53.9 L 403.1,56.9 L 400.7,62.0 L 398.9,61.5 L 398.2,64.3 L 395.3,64.7 L 395.3,70.7 L 403.4,73.3 L 407.0,98.7 L 411.7,93.6 L 415.6,92.9 L 422.6,87.0 L 423.0,84.2 Z",
  "Gwale": "M 291.2,98.0 L 289.2,96.8 L 288.0,100.2 L 290.6,101.0 Z",
  "Babura": "M 297.8,67.2 L 298.0,69.0 L 302.6,69.4 L 300.5,75.0 L 305.5,78.2 L 309.6,75.8 L 308.9,74.2 L 313.1,67.9 L 317.7,65.4 L 316.4,62.2 L 320.1,57.8 L 318.1,55.6 L 314.9,56.1 L 309.0,63.3 L 300.8,62.3 Z",
  "Sapele": "M 144.1,421.6 L 147.5,425.7 L 151.3,424.9 L 154.5,418.4 L 147.6,412.9 L 145.0,414.3 L 144.1,410.5 L 140.4,407.8 L 139.0,413.6 L 142.9,415.9 Z",
  "Ika North East": "M 180.1,391.2 L 177.9,393.8 L 179.3,397.1 L 178.1,398.5 L 177.3,396.3 L 175.0,396.8 L 173.8,400.5 L 176.8,401.9 L 177.9,405.6 L 183.0,403.8 L 185.1,399.9 L 183.7,390.1 Z",
  "Garun Malam": "M 284.7,110.7 L 282.3,112.2 L 282.5,115.2 L 285.2,119.7 L 288.8,121.1 L 287.4,114.3 L 289.2,111.9 Z",
  "Offa": "M 98.0,297.6 L 99.7,299.6 L 103.4,298.9 L 100.2,294.7 Z",
  "Shomolu": "M 35.4,382.8 L 33.7,381.0 Z",
  "Makoda": "M 291.5,84.7 L 295.7,83.9 L 293.2,78.0 L 288.0,79.6 L 290.5,76.8 L 288.0,74.9 L 287.9,71.4 L 293.3,72.1 L 292.3,66.8 L 290.1,66.8 L 284.0,75.6 Z",
  "Rimin Gado": "M 279.8,107.4 L 286.0,101.8 L 279.1,100.8 L 280.5,96.6 L 272.7,97.9 L 276.6,102.8 L 278.5,101.6 Z",
  "Yusufari": "M 378.9,41.4 L 387.4,38.0 L 385.5,41.4 L 387.3,43.9 L 400.6,44.2 L 405.7,37.8 L 412.0,36.5 L 412.6,40.6 L 409.8,44.4 L 412.4,49.4 L 415.6,46.3 L 421.3,48.1 L 425.6,46.7 L 428.8,48.6 L 437.6,46.9 L 438.2,43.5 L 435.5,41.5 L 437.2,38.6 L 433.9,37.4 L 432.1,33.3 L 432.6,26.3 L 402.6,25.9 L 377.0,31.5 L 374.7,37.5 L 376.5,41.3 Z",
  "Bassa": "M 299.7,201.5 L 297.5,214.7 L 304.6,212.3 L 306.2,205.2 L 309.5,201.1 L 312.7,200.7 L 314.2,196.7 L 312.5,183.9 L 306.6,182.3 L 305.5,186.6 L 302.4,187.8 L 299.3,194.5 Z",
  "Jahun": "M 331.7,95.1 L 334.8,97.2 L 335.4,102.9 L 344.9,99.1 L 345.8,101.7 L 354.5,100.7 L 356.9,96.9 L 354.9,91.6 L 346.3,90.9 L 342.4,87.2 L 332.9,88.6 Z",
  "Kurfi": "M 236.3,53.2 L 233.6,68.4 L 235.6,68.1 L 235.6,70.5 L 237.8,71.4 L 239.0,68.9 L 246.4,68.6 L 247.5,66.4 L 241.5,61.1 L 240.0,53.6 Z",
  "Esan West": "M 173.9,367.2 L 166.2,369.8 L 170.3,374.6 L 169.2,381.5 L 170.9,386.0 L 176.7,384.2 L 176.0,379.2 L 172.3,379.4 L 175.1,377.2 L 174.0,373.2 L 178.1,366.6 Z",
  "Kaduna North": "M 237.7,176.7 L 240.0,173.2 L 238.2,169.9 L 236.2,172.9 Z",
  "Daura": "M 284.0,45.2 L 284.3,41.8 L 277.9,45.2 L 278.0,46.7 L 276.1,44.5 L 274.3,45.4 L 278.2,52.3 L 282.9,50.2 Z",
  "Gassol": "M 382.9,308.2 L 382.2,305.8 Z M 410.4,263.2 L 404.1,268.3 L 395.4,266.7 L 393.0,268.7 L 379.5,271.6 L 364.5,290.7 L 368.7,293.9 L 379.6,293.0 L 382.4,298.5 L 389.8,297.0 L 394.2,298.4 L 396.3,294.3 L 400.0,294.6 L 419.4,277.9 L 421.4,273.2 Z",
  "Auyo": "M 358.8,86.5 L 363.4,83.7 L 366.7,78.6 L 370.9,78.0 L 375.6,81.0 L 378.5,77.7 L 377.1,75.5 L 366.9,75.2 L 357.1,81.5 Z",
  "Wudil": "M 308.9,102.7 L 308.4,107.1 L 303.5,112.3 L 306.9,114.2 L 309.2,112.2 L 311.3,116.0 L 308.7,118.2 L 310.2,118.7 L 313.8,115.9 L 309.9,109.1 L 313.5,105.2 L 310.9,104.1 L 311.0,102.2 Z",
  "Ikara": "M 278.9,133.8 L 271.8,130.0 L 273.2,123.1 L 263.5,125.7 L 264.3,131.9 L 268.9,130.6 L 268.9,134.6 L 271.0,135.3 L 268.0,139.8 L 273.6,144.1 L 276.4,142.8 L 276.8,144.6 L 280.1,144.6 L 281.7,140.5 L 285.8,142.1 L 286.8,144.6 L 291.0,143.2 L 291.6,141.6 L 288.9,141.2 L 287.1,138.1 L 280.6,137.9 Z",
  "Ifedore": "M 125.1,335.3 L 118.8,334.1 L 115.9,335.9 L 117.3,344.7 L 122.3,343.2 L 126.5,344.8 Z",
  "Lavun": "M 171.9,266.9 L 171.9,257.8 L 159.5,257.9 L 157.5,255.7 L 153.6,265.8 L 155.3,267.5 Z M 140.9,246.7 L 149.4,243.6 L 157.1,245.1 L 161.2,228.0 L 155.1,229.0 L 150.2,221.6 L 143.7,217.1 L 142.1,218.2 L 139.6,212.7 L 137.0,212.0 L 128.2,223.5 L 121.9,226.2 L 132.0,227.2 L 137.6,240.4 L 140.9,241.8 L 138.8,244.8 Z",
  "Dange Shuni": "M 144.9,56.3 L 142.6,53.0 L 142.5,47.1 L 137.9,47.9 L 135.4,46.2 L 133.0,47.7 L 129.7,44.5 L 125.5,48.3 L 129.3,55.8 L 134.7,60.3 L 134.4,65.9 L 138.0,66.8 L 142.2,57.3 L 144.3,59.0 L 144.4,62.7 L 147.4,62.1 L 149.3,59.9 Z",
  "Yewa North": "M 2.1,341.5 L 2.8,353.2 L 0.5,360.1 L 2.3,364.3 L 6.7,367.6 L 7.2,365.3 L 10.9,364.6 L 10.9,361.0 L 18.0,360.9 L 17.6,357.5 L 21.9,355.9 L 22.6,352.1 L 20.1,349.3 L 19.6,343.8 L 15.1,340.3 L 11.0,339.6 L 13.1,342.3 L 12.2,344.5 L 9.0,344.2 L 5.4,339.4 Z",
  "Tsafe": "M 221.5,93.2 L 215.6,93.0 L 214.0,94.6 L 209.9,92.6 L 198.8,103.5 L 200.8,107.1 L 199.7,112.9 L 201.7,115.1 L 201.3,119.2 L 205.2,121.9 L 208.3,119.1 L 210.7,108.5 L 218.6,109.0 L 222.7,105.9 L 222.7,102.7 L 228.0,101.6 Z",
  "Ekiti": "M 133.8,301.3 L 140.4,300.3 L 142.2,298.4 L 142.4,295.4 L 138.4,295.3 L 126.7,298.5 L 123.6,303.5 L 132.1,305.6 Z",
  "Zuru": "M 136.2,129.2 L 135.8,126.6 L 141.0,124.7 L 141.2,115.5 L 138.5,115.1 L 134.0,121.4 L 123.2,121.3 L 121.7,131.5 L 115.5,133.1 L 115.4,135.7 L 116.1,137.0 L 118.4,136.0 L 118.1,139.4 L 119.1,137.7 L 127.2,138.7 L 128.0,134.0 L 132.7,129.7 Z",
  "Yagba West": "M 131.7,288.7 L 133.4,291.8 L 136.4,291.3 L 136.6,294.2 L 142.4,295.4 L 140.4,300.1 L 140.8,305.1 L 147.7,302.2 L 147.4,297.3 L 150.6,290.8 L 149.9,282.5 L 141.2,278.1 Z",
  "Kogi": "M 213.8,312.3 L 215.8,297.4 L 212.3,289.9 L 214.7,283.0 L 207.0,282.3 L 207.4,285.7 L 203.2,290.2 L 203.7,291.9 L 201.6,291.8 L 200.2,296.5 L 204.6,303.7 L 204.1,316.4 Z",
  "Olamaboro": "M 254.1,342.4 L 247.1,340.0 L 243.3,342.9 L 233.4,342.6 L 229.8,352.0 L 234.0,353.4 L 234.0,356.0 L 237.3,352.8 L 246.0,357.2 L 247.8,349.8 L 255.2,346.8 L 255.7,342.8 Z",
  "Odigbo": "M 108.9,379.5 L 109.6,376.4 L 116.3,376.3 L 119.4,372.9 L 115.6,368.9 L 115.1,363.6 L 111.1,360.2 L 92.8,366.1 L 84.9,372.8 L 84.3,376.5 L 88.4,378.7 L 90.3,383.8 L 97.4,371.6 L 101.1,371.9 L 106.1,379.7 Z",
  "Agege": "M 31.2,378.6 L 30.9,376.3 Z",
  "Kibiya": "M 304.3,125.6 L 303.6,117.5 L 299.3,116.9 L 295.8,123.9 L 297.7,126.3 L 295.9,125.8 L 293.9,128.8 L 296.5,131.9 Z",
  "Isin": "M 110.8,286.8 L 111.8,294.3 L 116.1,298.2 L 119.6,298.3 L 121.6,295.2 L 124.7,296.6 L 127.5,292.8 L 124.3,292.9 L 122.2,287.1 Z",
  "Sabon Gari": "M 246.9,138.8 L 245.7,140.5 L 247.9,143.3 L 252.7,145.7 L 253.1,143.2 L 256.3,142.1 L 253.0,137.3 L 251.0,140.0 Z",
  "Malam Madori": "M 358.5,65.6 L 357.1,70.6 L 352.9,75.0 L 355.3,77.1 L 360.4,75.2 L 362.6,76.4 L 360.6,79.9 L 366.9,76.1 L 368.9,69.1 L 374.7,68.1 L 373.4,64.8 L 375.2,61.9 Z",
  "Lokoja": "M 171.2,283.1 L 176.3,281.9 L 180.6,283.8 L 190.2,296.8 L 188.0,302.8 L 188.8,305.7 L 185.0,306.0 L 179.9,301.1 L 177.0,301.1 L 178.0,306.2 L 181.9,310.4 L 181.3,314.7 L 184.9,315.9 L 193.5,311.2 L 203.5,319.0 L 205.2,310.5 L 203.7,301.4 L 195.6,289.2 L 188.2,282.8 L 183.5,270.5 L 179.0,267.6 L 176.0,268.0 L 171.8,277.2 Z",
  "Ede South": "M 90.9,326.9 L 92.5,323.9 L 87.5,320.3 L 85.4,319.9 L 82.3,323.3 L 84.0,327.0 L 89.5,325.7 Z",
  "Giwa": "M 246.6,135.6 L 241.7,131.3 L 235.5,130.4 L 233.5,136.3 L 225.4,136.7 L 226.6,140.0 L 223.7,143.3 L 221.3,155.1 L 217.7,153.2 L 213.3,155.6 L 215.4,160.7 L 222.1,164.9 L 225.0,164.3 L 226.5,157.6 L 233.3,149.5 L 241.8,151.6 L 241.3,146.9 L 247.7,146.2 L 248.1,142.8 L 245.7,140.5 Z",
  "Ikole": "M 147.7,302.2 L 140.8,305.1 L 141.2,300.3 L 133.8,301.3 L 136.5,304.6 L 137.8,312.6 L 135.4,314.5 L 135.6,320.6 L 137.3,320.1 L 137.7,323.1 L 140.0,324.2 L 143.4,322.7 L 148.4,315.0 L 146.6,314.1 L 145.5,308.6 L 148.9,305.9 Z",
  "Kunchi": "M 287.4,79.5 L 280.7,70.7 L 280.1,66.9 L 274.7,68.7 L 273.9,74.6 L 271.1,76.4 L 273.3,75.8 L 275.1,80.0 L 277.4,78.3 L 282.3,80.5 L 284.1,77.8 L 283.7,79.5 Z",
  "Guri": "M 382.1,55.9 L 384.0,56.2 L 384.5,60.2 L 384.6,64.1 L 381.8,67.5 L 382.6,73.3 L 388.8,75.2 L 395.9,72.9 L 395.9,61.9 L 393.8,56.0 L 389.6,57.0 L 382.4,54.0 Z",
  "Maru": "M 179.7,76.8 L 171.3,91.2 L 174.1,92.8 L 173.5,95.4 L 178.1,103.8 L 182.0,105.9 L 179.4,107.0 L 178.5,116.0 L 173.4,118.3 L 168.5,115.1 L 159.6,118.1 L 156.5,116.3 L 156.3,121.3 L 157.3,127.4 L 166.0,126.0 L 169.5,129.9 L 175.6,129.8 L 170.9,140.5 L 167.9,141.6 L 168.5,138.1 L 166.4,143.9 L 167.9,147.2 L 173.7,147.8 L 179.5,152.0 L 182.1,148.6 L 187.4,149.7 L 199.4,147.1 L 201.4,144.6 L 199.8,142.2 L 200.8,137.6 L 203.8,136.2 L 204.1,133.4 L 207.5,133.8 L 211.0,125.4 L 210.8,121.3 L 208.3,119.1 L 206.2,121.9 L 201.3,119.2 L 188.7,120.4 L 185.8,108.2 L 190.8,103.6 L 188.5,97.1 L 183.3,96.0 L 184.8,90.1 L 187.5,88.6 L 188.3,79.7 Z",
  "Dukku": "M 390.6,166.3 L 398.9,176.5 L 406.4,178.8 L 409.5,182.1 L 412.0,180.0 L 412.4,169.8 L 417.8,167.5 L 424.5,167.7 L 428.2,160.4 L 421.0,153.5 L 421.9,149.8 L 416.7,144.4 L 416.9,141.9 L 412.3,145.3 L 404.5,146.9 L 402.8,144.8 L 401.2,145.7 L 398.0,151.3 L 399.7,153.7 Z",
  "Wamakko": "M 113.7,49.7 L 120.8,49.7 L 121.9,46.2 L 125.4,48.7 L 127.9,45.3 L 125.1,42.1 L 127.7,42.0 L 129.4,36.6 L 126.8,36.8 L 122.2,33.1 L 120.7,36.3 L 114.2,39.6 L 116.4,44.6 L 114.6,45.0 Z",
  "Oke Ero": "M 118.4,304.0 L 123.6,303.5 L 126.7,298.5 L 138.1,295.6 L 136.4,291.3 L 133.4,291.8 L 131.7,288.7 L 125.4,294.9 L 124.6,298.8 Z",
  "Oshodi/Isolo": "M 33.0,381.2 L 32.3,379.4 L 29.7,380.5 L 29.9,384.9 Z",
  "Abadam": "M 520.2,40.2 L 530.2,45.4 L 533.3,43.6 L 539.5,36.6 L 538.8,29.3 L 548.4,25.5 L 554.1,18.5 L 547.7,9.2 L 532.9,8.6 L 525.9,19.4 L 525.1,18.1 L 523.0,19.2 L 523.4,17.4 L 520.4,19.2 L 519.0,17.5 L 509.8,20.8 L 506.9,24.1 L 512.9,25.6 Z",
  "Moba": "M 116.5,308.1 L 122.5,309.8 L 127.5,307.2 L 127.9,305.0 L 121.4,302.8 L 119.7,304.8 L 118.4,304.0 Z",
  "Gwagwalada": "M 226.5,249.3 L 217.1,240.7 L 213.5,243.5 L 210.2,243.4 L 209.7,259.1 L 215.9,257.2 L 220.9,258.6 Z",
  "Kagarko": "M 251.9,236.9 L 257.0,239.7 L 261.6,237.6 L 263.6,233.4 L 262.0,224.2 L 263.1,221.0 L 259.0,218.0 L 256.5,220.4 L 253.1,218.9 L 251.5,222.7 L 248.1,221.4 L 243.7,224.0 L 238.0,222.0 L 232.2,223.9 L 225.7,230.1 L 227.2,237.5 L 241.1,235.6 L 248.0,232.8 Z",
  "Abaji": "M 214.5,279.0 L 207.2,275.8 L 205.4,265.6 L 209.2,262.1 L 210.5,257.7 L 208.9,251.9 L 210.2,243.4 L 213.5,243.5 L 217.1,240.7 L 205.0,240.0 L 204.8,282.3 L 214.7,283.0 Z",
  "Sardauna": "M 414.8,341.9 L 415.1,352.4 L 408.0,360.2 L 410.0,367.0 L 413.0,369.6 L 416.8,369.6 L 419.7,373.0 L 419.0,379.0 L 421.7,387.0 L 434.5,386.7 L 437.8,379.3 L 441.4,378.8 L 443.7,376.0 L 445.4,369.5 L 443.7,366.7 L 450.6,359.4 L 446.9,357.3 L 444.9,358.1 L 442.8,354.0 L 435.5,355.2 L 436.0,357.8 L 430.3,356.9 L 422.6,347.9 L 422.7,344.4 L 420.9,344.5 L 422.0,340.5 L 419.4,339.4 Z",
  "Shanga": "M 81.2,152.7 L 84.5,156.3 L 92.5,154.2 L 97.0,155.8 L 100.8,152.5 L 102.0,154.9 L 109.5,156.3 L 109.9,152.6 L 117.5,147.4 L 102.5,142.1 L 100.6,138.2 L 102.4,137.0 L 100.7,135.9 L 105.1,133.1 L 104.3,129.3 L 95.0,122.4 L 90.9,124.3 L 95.2,126.1 L 89.8,137.6 L 91.1,142.4 L 82.3,140.6 L 80.7,142.5 Z",
  "Birnin Gwari": "M 210.1,130.1 L 207.3,131.7 L 207.4,133.9 L 204.1,133.4 L 203.8,136.2 L 200.8,137.6 L 199.8,142.2 L 201.4,144.6 L 199.4,147.1 L 187.4,149.7 L 181.8,148.7 L 171.7,158.1 L 170.2,165.8 L 172.5,166.8 L 172.3,171.4 L 170.2,174.9 L 173.5,176.0 L 174.1,183.4 L 178.3,179.8 L 180.7,180.1 L 185.4,172.3 L 190.3,170.0 L 192.6,173.7 L 201.9,171.4 L 203.2,165.2 L 207.9,159.8 L 216.0,167.6 L 216.5,172.8 L 220.8,173.1 L 222.1,164.9 L 215.4,160.7 L 213.3,155.6 L 217.7,153.2 L 221.3,155.1 L 223.7,143.3 L 214.0,137.3 L 216.1,134.8 L 215.9,131.3 Z",
  "Ngaski": "M 106.8,156.2 L 102.8,162.5 L 103.0,171.6 L 97.2,170.3 L 90.4,175.2 L 89.6,185.0 L 93.9,189.3 L 92.0,196.8 L 96.7,196.7 L 97.8,191.4 L 100.3,189.6 L 105.2,188.5 L 109.1,190.7 L 112.8,187.2 L 112.1,179.2 L 106.4,175.7 L 105.8,166.0 L 112.6,166.3 L 120.6,162.5 L 121.0,160.7 L 116.8,156.7 L 119.6,152.6 L 117.5,147.4 L 109.9,152.6 L 109.5,156.3 Z",
  "Chikun": "M 241.2,191.9 L 242.6,187.8 L 245.9,186.0 L 245.5,181.5 L 250.4,180.6 L 252.2,177.7 L 250.3,171.1 L 249.4,172.9 L 245.8,171.5 L 240.1,172.7 L 235.9,179.4 L 235.6,176.9 L 230.1,176.7 L 227.5,174.4 L 231.2,169.4 L 225.0,164.3 L 222.1,164.9 L 220.8,173.1 L 216.6,172.9 L 216.0,167.6 L 208.3,159.9 L 206.1,160.9 L 201.6,168.6 L 206.8,169.2 L 207.6,174.4 L 210.9,173.9 L 213.3,177.0 L 211.9,182.8 L 218.2,185.6 L 209.9,194.2 L 210.7,198.1 L 220.9,200.7 L 230.1,200.0 L 234.9,197.2 L 237.9,192.5 Z",
  "Yauri": "M 100.2,154.3 L 101.6,157.0 L 100.0,167.6 L 97.2,170.3 L 102.7,171.7 L 102.8,162.5 L 106.8,156.2 L 101.5,154.6 L 101.2,152.6 L 99.4,152.9 Z",
  "Kauru": "M 287.4,202.4 L 287.4,207.9 L 291.2,209.1 L 289.9,214.8 L 295.7,216.2 L 297.9,213.7 L 299.7,201.5 L 292.6,200.4 Z M 286.5,179.0 L 281.7,176.4 L 281.4,172.7 L 278.2,171.0 L 277.4,167.4 L 263.1,164.9 L 258.9,167.4 L 259.1,174.6 L 262.3,177.8 L 266.3,177.4 L 267.3,186.4 L 272.9,187.4 L 279.3,200.9 L 284.2,199.8 L 287.4,202.2 L 290.8,197.3 L 286.5,192.3 L 285.5,186.8 L 282.1,189.3 L 282.2,183.7 Z",
  "Demsa": "M 479.6,226.9 L 477.3,220.0 L 471.3,220.4 L 469.2,221.9 L 467.3,231.8 L 462.9,232.9 L 459.0,230.8 L 454.8,235.6 L 447.1,236.6 L 450.3,242.1 L 457.2,243.2 L 458.3,245.4 L 471.2,235.1 L 477.5,234.8 L 479.3,231.5 L 481.6,231.2 L 484.6,233.6 Z",
  "Umuahia South": "M 242.1,437.1 L 236.4,432.4 L 233.8,438.1 L 241.2,439.6 Z",
  "Obokun": "M 102.9,322.7 L 104.8,319.7 L 109.9,322.1 L 111.6,313.2 L 108.8,314.3 L 102.7,312.0 L 101.4,314.5 L 99.1,313.4 L 98.5,317.3 L 95.8,317.1 L 96.0,318.9 L 98.6,322.2 Z",
  "Owerri West": "M 215.9,448.3 L 214.9,447.0 Z M 217.4,445.0 L 219.6,439.9 L 215.7,439.9 L 214.4,436.7 L 216.0,433.0 L 212.5,433.1 L 209.9,435.8 L 212.1,439.0 L 209.1,442.0 L 214.4,441.6 L 216.9,447.0 Z",
  "Nasarawa": "M 239.5,273.2 L 237.4,275.6 L 239.0,279.2 L 237.4,293.4 L 230.9,304.6 L 244.8,304.1 L 259.5,306.9 L 267.7,311.4 L 264.9,304.8 L 268.5,299.3 L 266.9,296.5 L 269.3,287.8 L 274.8,284.8 L 272.5,280.4 L 254.8,269.1 L 250.7,270.0 L 246.9,267.0 L 243.3,266.4 Z",
  "Idemili South": "M 214.2,408.6 L 214.1,405.0 L 204.7,406.1 L 206.7,407.9 L 210.2,406.3 L 212.1,409.1 Z",
  "Aba North": "M 235.3,458.1 L 234.0,454.7 L 231.6,456.1 L 231.5,457.5 L 233.9,456.1 Z",
  "Odeda": "M 23.9,338.6 L 26.2,343.6 L 34.0,346.3 L 36.6,350.0 L 39.5,348.0 L 48.6,348.9 L 53.5,345.4 L 53.5,342.4 L 51.1,342.2 L 50.8,334.8 L 42.7,335.1 L 39.1,337.8 L 38.1,332.3 L 35.0,334.3 L 31.6,341.7 Z",
  "Ijebu East": "M 82.6,354.5 L 80.7,356.6 L 73.2,358.3 L 69.0,367.7 L 67.5,365.8 L 63.1,367.1 L 62.5,368.8 L 67.5,370.6 L 70.3,375.1 L 68.2,377.7 L 68.9,380.3 L 71.3,381.1 L 74.3,378.6 L 77.2,380.0 L 80.4,375.4 L 84.4,376.7 L 86.9,370.0 L 92.8,366.3 L 93.5,358.7 L 95.9,356.4 L 85.5,359.1 Z",
  "Okpokwu": "M 260.2,366.7 L 263.9,362.5 L 262.6,359.8 L 268.4,359.4 L 262.4,350.3 L 257.8,349.8 L 255.7,342.8 L 255.2,346.8 L 251.2,348.5 L 254.3,352.8 L 252.7,354.7 L 254.4,356.5 L 250.0,363.1 L 251.3,365.3 L 258.9,364.3 Z",
  "Shomgom": "M 414.3,222.1 L 415.5,225.0 L 421.6,226.7 L 427.0,224.5 L 434.6,225.6 L 436.5,219.9 L 430.5,213.8 L 427.9,205.7 L 427.5,212.9 L 420.9,218.7 L 413.9,218.7 L 415.4,220.7 Z",
  "Ado-Ekiti": "M 124.1,330.0 L 125.7,328.6 L 126.6,329.9 L 128.0,327.5 L 133.8,329.6 L 133.9,322.8 L 128.2,323.4 L 127.3,321.6 L 124.2,324.8 L 121.2,324.9 Z",
  "Ahiazu-Mbaise": "M 226.1,435.4 L 228.8,434.9 L 230.0,436.5 L 231.8,435.0 L 230.8,430.8 L 226.6,430.3 L 228.4,432.4 Z",
  "Ankpa": "M 238.2,331.4 L 238.7,337.2 L 234.0,339.3 L 235.5,342.1 L 243.3,342.9 L 248.2,340.0 L 254.1,342.4 L 255.8,339.1 L 251.9,325.8 L 253.3,321.2 L 243.5,324.6 L 241.9,330.6 Z",
  "Nkwerre": "M 219.6,424.7 L 222.2,424.5 Z M 221.3,419.9 L 219.1,421.1 L 219.4,423.9 L 223.8,423.3 Z",
  "Apa": "M 253.3,321.2 L 252.5,330.0 L 255.6,336.8 L 269.5,326.2 L 268.8,322.1 L 265.7,321.2 L 264.6,317.2 L 255.9,317.0 L 253.2,319.0 Z",
  "Kwande": "M 352.7,354.0 L 342.0,358.6 L 342.1,356.3 L 339.9,356.5 L 339.4,353.9 L 335.5,355.5 L 333.5,353.7 L 332.2,356.4 L 326.1,357.8 L 323.9,361.0 L 325.0,374.0 L 330.9,372.7 L 339.4,382.9 L 339.1,389.2 L 345.7,384.1 L 348.1,363.5 Z",
  "Ikom": "M 295.7,419.1 L 300.9,418.0 L 301.4,413.8 L 304.7,413.5 L 305.7,406.7 L 303.4,399.6 L 305.6,395.4 L 301.6,390.4 L 295.0,391.5 L 292.1,390.0 L 288.6,395.8 L 289.6,396.7 L 287.0,398.6 L 288.1,401.2 L 286.7,402.6 L 289.0,402.9 L 290.5,407.2 L 289.7,414.1 Z",
  "Ido-Osi": "M 128.0,312.2 L 124.4,311.3 L 123.3,309.1 L 120.5,309.3 L 121.2,311.6 L 119.0,310.7 L 122.4,312.2 L 120.4,313.9 L 124.4,318.3 L 128.4,316.8 Z",
  "Ukwa East": "M 242.6,456.8 L 239.8,460.6 L 237.0,460.5 L 236.4,463.0 L 233.2,462.3 L 230.5,464.3 L 232.3,466.4 L 230.9,468.5 L 240.1,471.3 L 240.3,464.4 L 238.7,463.2 L 242.4,459.7 Z",
  "Ukwa West": "M 224.8,464.6 L 222.7,467.2 L 225.6,469.2 L 231.9,467.5 L 229.2,461.9 L 230.2,457.6 L 228.4,458.0 L 227.1,463.6 Z",
  "Nnewi South": "M 212.8,409.1 L 213.2,411.6 L 209.5,411.2 L 209.0,413.5 L 212.7,415.5 L 217.5,414.4 L 218.4,411.9 L 215.5,410.3 L 215.6,408.3 Z",
  "Bende": "M 252.4,435.1 L 247.7,435.3 L 246.4,432.7 L 251.0,428.6 L 247.3,428.6 L 252.1,422.5 L 251.9,419.6 L 242.0,418.7 L 243.0,427.0 L 239.6,426.4 L 239.2,428.3 L 244.4,431.6 L 244.2,435.9 L 248.6,438.8 L 250.7,439.6 L 250.3,435.3 Z",
  "Okigwe": "M 234.7,425.4 L 235.4,414.7 L 227.1,413.5 L 228.6,417.4 L 226.8,418.5 L 229.9,421.9 L 228.0,423.8 L 231.1,422.8 Z",
  "Jama'Are": "M 369.6,114.5 L 369.1,112.6 L 364.9,113.3 L 362.6,110.0 L 356.8,113.0 L 356.8,119.9 L 361.8,122.4 L 360.6,119.5 L 363.2,116.4 L 365.7,115.2 L 368.8,116.7 Z",
  "Kokona": "M 269.2,246.0 L 260.2,253.3 L 258.8,258.1 L 261.2,260.9 L 260.3,264.6 L 262.4,267.9 L 260.7,272.6 L 273.1,281.7 L 277.7,279.6 L 273.5,278.0 L 275.2,273.6 L 274.3,269.0 L 277.3,265.4 L 277.7,259.8 L 273.5,251.9 L 268.8,251.3 Z",
  "Mafa": "M 561.5,91.8 L 559.5,89.0 L 550.0,85.5 L 548.7,90.9 L 539.5,84.7 L 536.1,86.7 L 530.8,84.4 L 529.3,87.8 L 530.3,93.1 L 527.2,91.4 L 525.8,93.7 L 527.9,98.1 L 529.1,96.4 L 530.6,104.3 L 525.5,107.0 L 531.7,109.3 L 532.8,112.3 L 541.3,108.6 L 543.7,110.0 L 545.3,116.2 L 551.5,111.2 L 555.4,111.1 Z",
  "Akko": "M 414.7,211.9 L 418.1,210.6 L 420.1,205.3 L 426.2,202.4 L 431.9,200.6 L 439.1,202.7 L 442.9,200.9 L 432.4,198.0 L 429.2,190.4 L 425.5,190.6 L 426.3,186.8 L 424.3,188.4 L 415.5,183.0 L 407.6,181.5 L 406.8,185.8 L 408.7,189.8 L 406.2,194.9 L 401.6,197.1 L 401.7,199.5 L 413.1,208.2 Z",
  "Ushongo": "M 333.5,353.7 L 331.4,353.0 L 329.5,355.5 L 328.4,353.2 L 317.7,355.6 L 316.6,354.3 L 319.6,351.4 L 318.8,349.9 L 322.2,349.0 L 315.0,343.3 L 310.9,343.7 L 307.8,348.3 L 304.5,348.7 L 307.5,351.7 L 307.7,354.6 L 314.6,360.1 L 323.9,361.0 L 326.1,357.8 L 332.2,356.4 Z",
  "Ehime-Mbano": "M 230.8,430.8 L 234.1,426.1 L 231.1,422.8 L 228.5,424.1 L 228.0,427.2 L 226.3,427.1 L 227.5,431.2 Z",
  "Ideato South": "M 218.0,418.0 L 218.8,419.7 Z M 223.8,423.3 L 225.9,422.3 L 224.8,417.8 L 221.1,418.9 Z",
  "Ife South": "M 86.7,348.1 L 83.0,354.6 L 85.0,359.0 L 95.9,356.4 L 96.8,352.6 L 102.8,346.5 L 102.8,341.7 L 99.6,340.2 L 99.0,337.0 L 96.2,336.7 L 95.3,343.7 L 90.3,340.1 L 91.4,345.1 L 89.0,345.1 Z",
  "Oyi": "M 206.0,399.4 L 206.2,401.1 L 210.7,401.7 L 214.0,395.3 L 212.2,394.7 Z",
  "Ekiti South-West": "M 119.8,334.3 L 124.1,330.0 L 121.2,324.9 L 119.3,329.9 L 114.2,328.9 L 111.5,330.9 L 114.8,336.3 Z",
  "Ayamelum": "M 212.6,373.5 L 210.6,381.2 L 211.0,389.4 L 217.2,386.6 L 222.3,376.1 L 216.5,373.3 Z",
  "Aboh-Mbaise": "M 226.1,435.4 L 223.3,437.2 L 227.7,439.3 L 225.6,442.6 L 228.6,445.2 L 231.8,441.5 L 228.7,438.2 L 229.2,435.3 Z",
  "Ilejemeje": "M 128.0,305.9 L 123.6,309.2 L 127.6,312.4 L 128.9,311.9 Z",
  "Mbatoli": "M 215.9,433.9 L 219.5,434.8 L 219.7,430.8 L 221.2,432.3 L 223.7,429.4 L 216.4,428.1 L 213.4,429.5 L 213.5,432.6 Z",
  "Akamkpa": "M 300.8,461.3 L 306.5,453.7 L 308.7,436.2 L 311.8,431.1 L 308.4,423.3 L 299.6,428.1 L 290.3,430.3 L 280.5,423.7 L 272.9,427.4 L 278.7,438.9 L 277.9,441.7 L 274.3,443.7 L 274.8,450.2 L 277.0,451.0 L 279.0,449.3 L 286.4,451.8 L 285.5,455.5 L 289.3,460.2 Z",
  "Obi Nwga": "M 242.3,453.1 L 243.3,447.7 L 242.0,446.3 L 239.9,449.4 L 234.8,451.4 L 234.8,459.6 L 239.8,460.6 L 242.6,456.8 Z",
  "Logo": "M 324.7,310.8 L 322.5,306.6 L 313.8,309.6 L 313.2,316.1 L 316.6,316.3 L 323.0,323.5 L 325.8,324.2 L 327.6,327.3 L 323.4,327.0 L 323.7,329.6 L 329.1,334.2 L 339.1,332.8 L 341.8,329.6 L 338.8,325.4 L 338.1,319.9 L 334.7,320.7 L 335.1,314.1 L 322.3,317.1 Z",
  "Guma": "M 322.5,306.6 L 318.6,302.0 L 304.8,302.2 L 290.9,297.8 L 285.3,302.0 L 282.7,308.1 L 286.5,316.5 L 288.2,314.0 L 299.8,315.2 L 301.5,318.2 L 300.6,323.7 L 304.1,324.1 L 306.7,320.1 L 310.5,322.1 L 314.9,321.4 L 316.9,328.8 L 322.3,325.2 L 325.1,328.2 L 327.6,327.3 L 316.6,316.3 L 312.3,314.6 L 313.8,309.6 Z",
  "Ogoja": "M 301.6,390.4 L 305.8,380.8 L 312.2,385.0 L 311.7,382.7 L 316.4,381.7 L 313.6,377.0 L 308.5,380.4 L 307.0,374.5 L 304.9,374.3 L 296.8,382.7 L 291.7,381.8 L 293.0,386.6 L 287.3,386.3 L 287.9,389.8 L 290.7,391.7 L 292.1,390.0 L 295.0,391.5 Z",
  "Ohafia": "M 260.2,426.4 L 255.9,423.3 L 255.0,420.2 L 251.9,419.6 L 252.1,422.5 L 247.3,428.6 L 254.0,430.1 L 255.9,432.2 L 253.7,434.2 L 256.3,436.1 L 259.0,435.6 L 260.0,433.0 L 261.3,434.7 Z",
  "Orumba North": "M 223.2,398.2 L 223.2,400.8 L 217.2,408.1 L 220.4,407.5 L 222.5,409.8 L 229.2,405.9 L 225.6,397.8 Z",
  "Ado": "M 256.6,376.9 L 259.1,380.5 L 262.9,382.0 L 265.1,377.9 L 265.0,372.5 L 272.5,372.8 L 273.7,370.5 L 270.0,365.2 L 275.6,362.8 L 273.9,358.8 L 262.6,359.8 L 263.9,362.5 L 260.2,366.7 L 260.8,369.4 Z",
  "Toto": "M 214.7,283.0 L 212.3,289.9 L 215.8,297.4 L 213.8,312.3 L 230.9,304.6 L 237.1,294.2 L 239.0,284.3 L 237.4,275.6 L 233.9,280.7 L 222.3,282.7 L 221.8,284.1 Z",
  "Egbedore": "M 85.3,311.4 L 81.7,316.1 L 82.3,323.3 L 86.3,318.0 L 89.5,319.3 L 92.8,316.0 L 92.2,313.3 L 88.2,315.0 L 87.9,312.1 Z",
  "Owerri North": "M 216.1,434.7 L 219.4,437.9 L 217.7,438.8 L 219.7,440.3 L 217.4,445.0 L 220.4,441.6 L 223.7,441.1 L 224.2,437.7 L 218.3,433.9 Z",
  "Idemili North": "M 213.8,405.2 L 213.7,401.8 L 210.5,402.7 L 208.0,400.7 L 205.2,404.2 L 207.9,406.2 Z",
  "Isiala-Ngwa South": "M 229.2,451.0 L 234.5,447.4 L 234.8,451.4 L 238.9,450.0 L 241.2,444.3 L 230.7,444.2 Z",
  "Funakaye": "M 439.6,149.2 L 435.6,145.3 L 432.4,149.6 L 434.0,158.9 L 432.2,160.9 L 428.2,160.4 L 424.5,167.7 L 425.5,172.0 L 428.5,174.4 L 431.6,174.6 L 434.7,168.3 L 442.0,167.7 L 442.5,153.7 Z",
  "Katsina-Ala": "M 357.3,327.5 L 354.8,330.0 L 358.1,332.8 L 354.0,341.4 L 345.7,337.2 L 342.3,330.1 L 340.1,330.3 L 333.1,337.5 L 334.3,339.5 L 328.6,343.8 L 328.3,345.7 L 331.5,345.6 L 329.5,348.8 L 330.6,352.4 L 335.5,355.5 L 339.4,353.9 L 339.9,356.5 L 342.1,356.3 L 342.0,358.6 L 352.7,354.0 L 357.0,349.1 L 359.9,336.5 L 360.0,331.5 Z",
  "Mokwa": "M 103.7,246.3 L 106.9,247.1 L 116.3,243.4 L 127.4,253.1 L 141.8,257.2 L 153.6,265.8 L 155.6,263.9 L 156.1,261.8 L 153.5,259.1 L 141.9,255.1 L 135.9,250.6 L 141.1,248.2 L 138.8,244.8 L 140.9,241.8 L 137.6,240.4 L 132.0,227.2 L 126.6,227.6 L 111.4,235.6 L 106.8,232.8 L 108.0,228.4 L 106.6,225.3 L 100.4,222.1 L 93.9,222.9 L 92.8,225.0 L 96.1,231.8 L 96.3,236.9 L 102.4,240.1 Z",
  "Aba South": "M 231.9,457.3 L 233.7,459.9 L 235.1,456.8 Z",
  "Edati": "M 157.4,247.2 L 157.1,245.1 L 149.4,243.6 L 140.5,246.8 L 140.7,248.6 L 137.2,248.7 L 135.9,250.6 L 156.1,261.8 Z",
  "Odogbolu": "M 61.0,364.6 L 62.2,365.8 L 62.3,364.2 Z M 50.0,374.5 L 60.6,374.6 L 63.2,370.4 L 61.4,367.5 L 57.3,369.6 L 60.9,366.4 L 59.7,363.1 L 56.9,364.9 L 52.1,363.6 L 49.6,370.0 Z",
  "Balanga": "M 454.7,217.3 L 458.7,212.8 L 456.0,210.3 L 457.7,200.3 L 452.7,197.1 L 445.5,198.7 L 442.0,203.9 L 444.6,209.2 L 444.3,215.6 L 437.7,218.1 L 434.6,225.6 Z",
  "Ijebu North East": "M 70.0,363.4 L 67.5,361.0 L 62.1,364.8 L 69.0,367.7 Z",
  "Oturkpo": "M 268.4,359.4 L 276.3,357.7 L 278.5,351.5 L 276.7,343.9 L 269.1,336.5 L 271.2,336.1 L 269.5,326.2 L 256.5,336.7 L 259.1,337.5 L 259.1,339.8 L 267.9,339.9 L 268.7,344.5 L 270.9,346.4 L 269.4,350.1 L 264.1,353.3 Z",
  "Abi": "M 264.2,422.1 L 265.7,419.8 L 267.3,420.5 L 271.4,413.3 L 268.2,412.6 L 267.7,410.1 L 264.7,411.4 L 266.0,415.1 L 262.3,418.9 Z",
  "Ideato North": "M 227.1,413.5 L 225.1,415.3 L 218.0,413.8 L 218.0,418.1 L 220.2,419.5 L 225.3,416.7 L 225.9,421.9 L 228.6,417.4 Z",
  "Oriade": "M 115.8,337.7 L 108.7,325.7 L 109.8,322.2 L 104.0,319.9 L 102.9,322.7 L 105.3,323.2 L 108.1,332.8 L 106.8,337.3 L 112.3,338.8 Z",
  "Illela": "M 124.7,19.0 L 129.8,19.0 L 129.7,15.6 L 132.5,13.2 L 134.1,16.9 L 131.9,20.9 L 139.9,20.7 L 140.0,16.4 L 142.3,16.4 L 141.9,12.0 L 138.1,10.3 L 140.0,5.8 L 137.8,6.6 L 136.5,1.4 L 129.6,6.8 L 123.4,7.4 Z",
  "Nwangele": "M 219.6,424.7 L 219.3,426.9 L 223.0,428.0 L 225.1,424.0 L 220.9,423.1 L 222.2,424.7 Z",
  "Ife East": "M 91.1,339.7 L 92.7,343.0 L 95.3,343.7 L 96.6,341.3 L 95.0,338.0 L 99.0,337.0 L 96.8,332.0 L 89.2,333.3 L 92.8,336.5 Z",
  "Obanliku": "M 325.0,374.0 L 325.6,378.7 L 321.3,380.9 L 321.1,383.6 L 330.4,384.0 L 333.1,385.8 L 328.1,392.7 L 329.9,398.6 L 333.9,393.1 L 337.7,392.8 L 339.4,382.9 L 330.8,372.6 Z",
  "Onuimo": "M 227.3,418.4 L 225.0,425.1 L 229.7,422.7 Z M 224.9,418.8 L 225.3,416.7 Z",
  "Qua'An Pan": "M 315.5,279.1 L 318.5,279.2 L 322.4,283.8 L 324.5,281.8 L 333.5,280.9 L 335.9,273.9 L 333.0,272.2 L 333.0,265.1 L 335.9,262.9 L 332.3,259.9 L 333.5,256.4 L 331.7,247.8 L 329.0,248.3 L 326.7,252.3 L 318.6,252.7 L 319.4,256.5 L 316.9,261.0 L 310.9,265.5 L 310.3,267.9 Z",
  "Ngor-Okpala": "M 228.9,450.8 L 230.6,444.3 L 227.4,444.5 L 227.9,443.2 L 225.6,442.6 L 227.7,439.3 L 224.2,437.7 L 223.7,441.1 L 220.4,441.6 L 215.8,449.6 L 226.5,451.9 Z",
  "Ona Ara": "M 71.7,341.8 L 69.9,342.8 L 70.6,340.1 L 62.3,338.4 L 61.7,340.5 L 63.4,340.5 L 65.2,344.2 L 65.4,351.5 L 69.9,351.1 Z",
  "Igbo-Eze North": "M 243.4,359.1 L 239.2,353.2 L 235.4,353.2 L 233.2,356.3 L 235.9,357.0 L 234.4,359.1 L 237.8,362.4 Z",
  "Oju": "M 273.7,370.5 L 277.4,368.5 L 279.6,373.8 L 281.8,374.8 L 286.1,370.9 L 294.6,370.3 L 297.8,367.5 L 292.3,364.1 L 292.9,360.4 L 290.4,354.3 L 286.5,355.6 L 287.3,357.7 L 282.8,363.8 L 279.3,362.2 L 270.4,364.5 Z",
  "Boluwaduro": "M 107.7,313.2 L 110.2,309.5 L 106.0,306.2 L 102.7,308.4 L 102.7,312.0 Z",
  "Shinkafi": "M 185.8,48.8 L 187.4,47.9 L 193.7,51.8 L 203.0,49.4 L 202.4,45.8 L 193.2,44.4 L 191.2,39.3 L 188.2,40.0 L 188.2,37.8 L 183.5,38.9 L 180.6,36.6 L 172.8,42.0 L 176.6,45.3 L 187.4,44.4 L 188.3,46.2 L 183.8,47.2 Z",
  "Orsu": "M 215.3,415.5 L 212.0,420.1 L 215.5,420.0 L 218.0,414.1 Z",
  "Anaocha": "M 214.2,408.6 L 219.3,406.6 L 219.5,404.0 L 216.3,402.8 L 216.4,401.2 L 214.1,403.6 Z",
  "Bekwarra": "M 313.6,377.0 L 315.5,370.5 L 311.9,367.2 L 309.0,371.5 L 306.1,371.8 L 306.2,374.1 L 308.5,380.4 Z",
  "Umu-Nneochi": "M 232.6,407.9 L 231.6,410.1 L 228.8,410.5 L 229.3,414.1 L 235.2,414.6 L 236.0,416.1 L 241.3,414.0 L 241.7,409.0 L 236.3,409.7 Z",
  "Ose": "M 158.2,353.2 L 161.4,340.7 L 163.1,340.1 L 157.4,337.5 L 149.0,342.4 L 153.6,349.2 L 144.7,358.7 L 142.7,367.2 L 144.2,373.3 L 147.4,371.2 L 150.7,371.8 L 153.9,368.9 L 155.2,356.9 Z",
  "Nnewi North": "M 209.4,407.2 L 208.8,410.6 L 213.2,411.6 L 211.7,407.5 Z",
  "Akoko North West": "M 154.2,319.2 L 146.4,328.7 L 154.2,329.4 L 160.6,327.0 L 162.6,324.5 L 162.1,319.3 Z",
  "Ilesha East": "M 104.7,324.8 L 100.9,327.5 L 102.0,330.3 L 106.5,328.5 Z",
  "Njikoka": "M 214.6,403.2 L 217.7,401.1 L 217.0,397.7 L 213.1,400.8 Z",
  "Ohaji/Egbema": "M 206.4,448.6 L 211.5,450.5 L 215.8,449.6 L 214.9,447.0 L 216.9,447.0 L 214.4,441.6 L 209.1,442.0 L 212.1,439.0 L 209.9,435.9 L 212.1,433.8 L 210.1,434.5 L 206.3,430.5 L 198.5,429.6 L 197.6,436.4 L 202.7,436.4 L 203.4,445.2 Z",
  "Gombe": "M 425.8,187.0 L 421.9,185.2 L 422.1,187.5 L 424.7,188.4 Z M 427.1,184.3 L 428.9,186.8 L 429.6,184.4 Z",
  "Owerri Municipal": "M 217.7,438.8 L 219.1,436.8 L 216.1,434.7 L 214.9,439.0 Z",
  "Keana": "M 318.6,302.0 L 313.1,294.5 L 313.7,291.4 L 291.1,292.5 L 291.3,297.8 L 295.1,299.4 L 311.3,303.1 Z",
  "Ohaukwu": "M 261.7,391.9 L 266.8,391.4 L 270.8,384.4 L 271.2,378.3 L 268.0,372.2 L 264.4,373.1 L 265.1,377.9 L 263.2,381.8 L 258.0,378.9 L 255.4,381.3 L 255.6,385.5 L 261.7,387.2 Z M 258.9,381.1 L 263.0,385.0 L 258.4,384.6 L 257.5,382.0 Z",
  "Gbonyin": "M 137.1,322.0 L 135.8,323.9 L 132.9,323.8 L 133.8,329.5 L 140.0,329.3 L 145.8,333.4 L 147.5,326.6 L 145.7,322.0 L 143.6,321.6 L 141.5,324.2 Z",
  "Isiala Mbano": "M 226.9,430.2 L 228.0,423.8 L 223.5,424.7 L 223.7,427.7 L 220.8,426.6 L 219.7,428.0 L 223.8,430.9 Z",
  "Irepodun/Ifelodun": "M 128.4,316.8 L 120.6,319.7 L 120.6,325.0 L 124.2,324.8 L 127.3,321.6 L 128.2,323.4 L 136.3,323.6 L 137.3,320.1 L 132.3,320.6 Z",
  "Obowo": "M 236.4,432.4 L 233.1,430.5 L 230.6,432.1 L 234.8,435.9 Z",
  "Isuikwuato": "M 242.4,418.6 L 241.3,414.0 L 235.1,416.2 L 235.2,426.2 L 243.0,427.0 Z",
  "Makurdi": "M 286.5,316.5 L 285.3,322.5 L 289.4,328.7 L 295.8,328.4 L 300.6,323.7 L 301.5,318.2 L 299.8,315.2 L 288.2,314.0 Z",
  "Gboko": "M 320.9,347.2 L 325.1,343.4 L 325.3,339.9 L 319.6,333.0 L 313.3,331.1 L 309.7,334.6 L 303.5,329.0 L 298.1,332.6 L 297.7,339.5 L 302.3,348.7 L 307.8,348.3 L 309.2,344.7 L 312.8,343.1 Z",
  "Ife Central": "M 89.2,333.3 L 92.8,332.2 L 93.7,333.6 L 96.1,331.8 L 91.8,326.1 L 89.3,328.6 Z",
  "Isiala-Ngwa North": "M 233.8,438.1 L 230.9,444.6 L 240.5,443.6 L 242.0,446.3 L 241.2,439.6 Z",
  "Yakurr": "M 272.9,427.4 L 282.1,424.1 L 280.6,417.6 L 274.4,411.4 L 270.8,413.7 L 267.3,420.5 Z",
  "Billiri": "M 413.9,218.7 L 420.9,218.7 L 427.5,212.9 L 427.9,205.7 L 430.4,203.7 L 429.5,201.9 L 419.9,205.5 L 418.1,210.6 L 414.7,211.9 Z",
  "Dunukofia": "M 210.1,401.9 L 211.2,402.8 L 215.6,399.8 L 215.0,394.2 Z",
  "Osisioma Ngwa": "M 228.4,458.0 L 231.4,458.8 L 231.6,456.1 L 234.2,454.6 L 234.7,447.4 L 229.2,451.0 L 230.3,453.1 Z",
  "Ola Oluwa": "M 81.9,325.0 L 80.4,317.3 L 77.9,314.6 L 72.1,316.8 L 69.2,315.4 L 68.5,319.0 L 72.6,319.0 L 77.8,324.7 Z",
  "Wamba": "M 290.9,254.0 L 291.2,263.1 L 294.7,264.4 L 303.8,262.6 L 307.2,264.8 L 311.6,253.1 L 305.6,252.4 L 304.0,245.5 L 298.6,243.3 L 294.5,252.3 Z",
  "Boripe": "M 102.7,312.0 L 102.9,308.7 L 98.4,310.8 L 100.5,314.5 Z",
  "Yala": "M 306.2,374.1 L 306.1,371.8 L 309.0,371.5 L 311.9,367.2 L 300.9,363.4 L 295.8,365.5 L 297.8,367.5 L 296.5,369.6 L 286.7,370.7 L 280.4,374.8 L 281.9,379.4 L 286.7,383.3 L 286.1,385.2 L 291.7,387.3 L 293.0,386.6 L 291.7,381.8 L 296.8,382.7 Z",
  "Aguata": "M 217.5,414.4 L 225.8,414.2 L 223.4,412.8 L 222.2,408.4 L 218.9,408.7 L 217.5,407.0 L 215.4,409.3 L 218.4,411.9 Z",
  "Calabar Municipal": "M 283.8,460.2 L 280.4,459.9 L 281.2,464.6 L 283.2,464.0 Z",
  "Onitsha North": "M 205.1,403.2 L 207.3,403.2 L 206.0,399.4 L 203.7,400.4 Z",
  "Ukum": "M 355.7,326.1 L 345.9,314.9 L 335.1,314.1 L 334.7,320.7 L 338.1,319.9 L 338.8,325.4 L 345.7,337.2 L 354.2,341.2 L 358.1,332.8 L 354.8,330.0 L 357.3,327.5 Z",
  "Isa": "M 172.8,42.0 L 181.9,36.7 L 183.5,38.9 L 188.2,37.8 L 188.2,40.0 L 191.2,39.3 L 192.0,43.3 L 194.7,44.9 L 200.0,39.2 L 205.2,39.2 L 202.4,31.4 L 198.3,26.8 L 193.2,30.0 L 186.4,30.9 L 176.1,30.2 L 176.1,27.4 L 173.6,28.5 L 168.4,25.6 L 165.1,29.7 L 166.1,40.5 L 167.9,44.4 Z",
  "Ogun Waterside": "M 95.7,384.5 L 94.8,376.7 L 90.3,383.8 L 88.2,378.5 L 80.4,375.4 L 77.1,381.6 L 73.6,383.7 L 78.5,387.0 L 83.1,386.6 L 83.4,390.9 L 94.1,394.6 L 95.4,391.0 L 89.1,389.6 L 92.3,388.7 L 93.7,384.1 Z",
  "Arochukwu": "M 259.7,443.0 L 265.1,443.2 L 260.0,433.0 L 259.0,435.6 L 256.3,436.1 L 253.7,434.2 L 255.9,432.2 L 254.0,430.1 L 251.0,428.6 L 248.1,430.1 L 246.4,432.3 L 247.7,435.3 L 253.1,435.2 Z",
  "Ijebu Ode": "M 64.3,366.6 L 60.1,363.9 L 60.9,366.4 L 57.5,368.3 L 58.0,369.5 L 61.4,367.5 L 63.2,370.4 L 60.6,374.6 L 69.7,374.7 L 67.5,370.6 L 62.5,368.8 Z",
  "Magumeri": "M 486.9,70.8 L 480.3,76.0 L 480.2,84.2 L 477.8,90.9 L 479.7,99.2 L 489.3,102.4 L 494.1,98.6 L 501.7,97.5 L 508.0,102.7 L 513.7,103.0 L 515.2,99.6 L 513.7,97.9 L 515.8,94.5 L 519.5,95.9 L 520.6,90.3 L 523.7,88.2 L 521.5,84.8 L 522.8,79.0 L 509.5,82.0 L 503.6,76.6 L 494.7,75.3 L 493.3,71.1 Z",
  "Boki": "M 305.7,406.7 L 313.1,409.1 L 315.3,413.4 L 329.9,398.6 L 328.1,392.7 L 333.1,385.8 L 330.4,384.0 L 321.1,383.6 L 319.4,389.5 L 315.1,389.4 L 315.8,382.1 L 311.7,382.7 L 312.2,385.0 L 305.8,380.8 L 301.6,390.4 L 305.6,395.4 L 303.4,400.4 Z",
  "Kwami": "M 442.0,167.7 L 434.7,168.3 L 431.6,174.6 L 425.5,172.0 L 425.0,167.9 L 415.7,167.9 L 414.4,170.1 L 412.4,169.8 L 412.0,180.0 L 409.5,182.1 L 415.5,183.0 L 419.8,185.9 L 424.9,185.9 L 435.9,181.8 L 438.7,178.3 L 436.3,177.9 L 437.1,175.4 L 439.9,176.9 L 441.4,175.0 Z",
  "Ekiti East": "M 148.4,315.0 L 143.6,321.6 L 145.7,322.0 L 147.5,326.6 L 155.1,317.4 L 152.0,315.0 Z",
  "Moro": "M 82.2,255.1 L 75.2,263.6 L 77.2,264.2 L 78.3,267.9 L 82.5,268.7 L 89.4,276.9 L 93.7,275.9 L 95.6,278.2 L 97.4,277.4 L 109.5,267.2 L 104.5,258.1 L 109.4,253.0 L 109.3,245.9 L 103.9,246.1 L 101.5,250.6 L 91.7,250.2 Z",
  "Ezinihitte": "M 234.9,435.9 L 231.4,433.9 L 228.7,438.1 L 230.2,441.1 L 231.8,441.5 Z",
  "Kala Balge": "M 579.3,109.2 L 577.8,117.8 L 591.1,127.4 L 597.0,123.8 L 598.4,120.1 L 595.5,110.8 L 598.9,100.2 L 597.2,95.8 L 600.0,89.4 L 599.1,87.8 L 596.0,88.0 L 591.6,82.6 L 592.1,81.0 L 587.8,78.8 L 582.1,78.8 L 582.2,81.8 L 585.2,83.0 L 584.9,85.5 L 587.4,87.7 L 585.9,91.1 L 581.9,93.3 Z",
  "Awe": "M 332.5,306.8 L 336.5,302.8 L 335.1,298.3 L 336.4,296.9 L 331.9,292.9 L 333.9,288.3 L 346.3,290.9 L 346.6,286.6 L 333.5,280.9 L 324.5,281.8 L 322.4,283.8 L 318.5,279.2 L 315.5,279.1 L 313.5,284.9 L 316.2,285.2 L 316.4,289.4 L 313.1,294.5 L 324.7,310.8 Z",
  "Orolu": "M 86.9,311.8 L 89.2,315.0 L 91.6,308.4 L 87.9,309.3 Z",
  "Obubra": "M 285.7,398.8 L 280.8,404.4 L 279.8,409.8 L 276.4,409.4 L 274.4,412.7 L 276.4,412.7 L 280.6,417.6 L 284.3,426.7 L 290.3,430.3 L 294.4,428.6 L 295.7,419.1 L 289.7,414.1 L 290.5,407.2 L 289.0,402.9 L 286.7,402.6 L 288.1,401.2 L 287.0,398.6 L 291.4,391.6 L 288.9,389.6 L 285.9,391.0 Z",
  "Akoko-Edo": "M 178.4,347.2 L 179.0,339.4 L 182.6,341.1 L 187.0,336.5 L 184.4,337.2 L 180.2,332.0 L 174.7,335.7 L 171.2,334.7 L 173.9,329.5 L 171.5,327.3 L 167.7,328.0 L 163.2,331.4 L 164.9,339.6 L 161.5,340.5 L 161.0,343.6 L 164.9,346.3 L 168.9,345.2 L 174.6,352.2 Z",
  "Osogbo": "M 95.8,317.1 L 91.8,316.7 L 89.5,319.3 L 94.4,320.9 Z",
  "Ise/Orun": "M 134.9,343.3 L 138.9,342.4 L 137.4,335.2 L 142.6,331.3 L 140.0,329.3 L 131.8,328.6 L 130.9,334.0 Z",
  "Njaba": "M 217.1,428.2 L 217.2,426.2 L 214.5,427.0 Z M 215.8,425.8 L 218.8,423.8 L 214.2,421.7 L 213.7,425.9 Z",
  "Obi": "M 313.7,291.4 L 316.2,289.9 L 316.2,285.2 L 307.4,285.1 L 301.0,281.0 L 296.9,281.3 L 294.4,285.0 L 290.7,285.0 L 292.2,292.9 Z",
  "Buruku": "M 331.4,353.0 L 329.5,348.8 L 331.5,345.6 L 328.3,345.7 L 328.6,343.8 L 334.3,339.5 L 333.1,337.5 L 337.7,333.5 L 329.1,334.2 L 324.0,330.2 L 322.3,325.2 L 316.9,328.8 L 314.1,322.8 L 313.3,331.1 L 319.6,333.0 L 325.3,339.9 L 325.1,343.4 L 321.0,345.9 L 322.2,349.5 L 319.5,349.0 L 316.7,354.7 L 322.9,355.4 L 328.4,353.2 L 329.5,355.5 Z",
  "Obudu": "M 315.8,382.1 L 315.1,389.4 L 319.4,389.5 L 321.1,381.3 L 325.6,378.7 L 326.0,375.8 L 324.0,374.3 L 318.1,376.6 L 315.3,374.0 L 313.4,376.7 Z",
  "Orlu": "M 221.3,419.9 L 218.0,419.3 L 217.4,415.1 L 214.7,421.8 L 219.4,423.9 L 219.1,421.1 Z",
  "Iwo": "M 77.8,324.7 L 72.6,319.0 L 68.5,319.0 L 68.1,323.0 L 72.5,327.2 Z",
  "Awka North": "M 223.6,394.3 L 222.8,389.9 L 220.1,387.9 L 216.8,386.6 L 213.3,388.2 L 216.1,397.5 L 220.0,395.9 L 222.6,399.1 Z",
  "Tarka": "M 304.1,324.1 L 303.5,329.0 L 311.1,334.7 L 314.9,321.4 L 310.5,322.1 L 306.7,320.1 Z",
  "Umuahia North": "M 242.1,437.1 L 244.9,432.4 L 239.2,428.3 L 239.3,425.7 L 235.3,426.2 L 237.3,430.4 L 236.4,432.4 Z",
  "Odo Otin": "M 93.9,303.2 L 94.3,307.9 L 99.6,308.0 L 100.5,305.7 L 103.5,305.2 L 104.7,308.3 L 106.0,306.2 L 105.7,302.7 Z",
  "Ihiala": "M 209.0,413.5 L 202.7,416.6 L 209.4,423.4 L 210.1,420.1 L 215.3,415.5 Z",
  "Ilesha West": "M 98.6,322.2 L 100.9,327.5 L 105.3,323.2 Z",
  "Kaltungo": "M 436.5,219.9 L 444.3,215.6 L 442.6,201.7 L 440.2,201.0 L 439.1,202.7 L 431.1,200.6 L 428.3,205.4 L 430.5,213.8 Z",
  "Ebonyi": "M 272.5,391.5 L 272.2,387.1 L 274.2,383.6 L 273.0,377.7 L 275.3,375.5 L 274.3,369.8 L 272.5,372.8 L 268.8,372.6 L 271.2,378.3 L 270.8,384.4 L 267.4,390.6 L 270.7,393.9 Z",
  "Lafia": "M 277.7,279.6 L 286.3,281.5 L 292.1,285.4 L 295.2,284.6 L 296.9,281.3 L 300.8,281.0 L 307.4,285.1 L 313.5,284.9 L 314.9,275.0 L 310.3,267.6 L 313.7,261.9 L 316.9,261.0 L 319.3,256.9 L 318.9,253.1 L 311.6,253.2 L 307.2,264.8 L 303.8,262.6 L 296.6,263.6 L 296.3,266.0 L 299.6,269.3 L 296.1,272.1 L 289.0,272.1 L 278.8,277.2 L 274.1,275.6 L 273.5,278.0 Z",
  "Ijebu North": "M 69.9,351.1 L 56.7,353.7 L 53.6,360.3 L 54.1,364.4 L 59.7,363.1 L 61.4,364.6 L 67.5,361.0 L 70.6,363.3 L 73.2,358.3 L 80.7,356.6 L 82.6,354.5 L 80.4,353.3 L 75.3,355.5 L 73.9,349.0 Z",
  "Ndokwa West": "M 176.1,429.7 L 189.1,426.1 L 187.4,420.9 L 189.4,417.3 L 187.7,415.2 L 189.5,410.8 L 186.2,410.7 L 184.7,408.5 L 183.6,410.6 L 178.4,409.2 L 177.8,411.7 L 182.0,414.5 L 184.4,420.0 L 174.2,423.9 Z",
  "Ikeduru": "M 226.2,430.8 L 222.3,430.0 L 221.2,432.3 L 220.0,430.6 L 219.5,434.8 L 225.6,436.3 L 228.4,432.4 Z",
  "Okehi": "M 171.7,322.6 L 170.5,327.5 L 172.2,329.3 L 176.8,325.8 L 178.5,327.9 L 196.4,313.4 L 192.6,311.2 L 184.9,315.9 L 181.3,314.7 L 179.0,317.3 L 179.0,321.3 L 174.9,320.7 Z",
  "Yamaltu/Deba": "M 442.0,172.5 L 439.9,176.9 L 437.1,175.4 L 436.3,177.9 L 438.7,178.3 L 435.9,181.8 L 430.6,183.3 L 428.9,186.8 L 427.1,184.3 L 425.1,185.8 L 426.5,187.8 L 425.5,190.6 L 429.2,190.4 L 432.4,198.0 L 442.9,200.9 L 453.6,197.0 L 451.5,193.0 L 447.1,191.2 L 445.4,187.4 L 442.4,185.8 L 449.0,176.2 L 445.9,174.3 L 445.1,171.2 Z",
  "Emure": "M 142.6,331.3 L 137.4,335.2 L 138.9,342.4 L 145.5,334.6 L 144.6,331.7 Z",
  "Ikere": "M 131.6,335.4 L 131.9,328.6 L 130.5,327.6 L 128.0,327.5 L 126.6,329.9 L 124.9,328.9 L 119.8,334.3 Z",
  "Oguta": "M 214.1,432.9 L 207.1,421.6 L 200.3,423.2 L 198.5,429.6 L 206.3,430.5 L 210.1,434.5 Z",
  "Konshisha": "M 304.5,348.7 L 302.3,348.7 L 297.7,339.5 L 291.4,342.1 L 289.8,345.7 L 291.9,348.7 L 292.3,364.1 L 295.7,366.0 L 300.9,363.4 L 308.2,365.0 L 314.5,369.0 L 315.2,371.9 L 315.6,360.0 L 310.3,357.4 Z",
  "Ejigbo": "M 84.0,313.9 L 79.3,307.5 L 75.0,310.7 L 75.6,312.9 L 70.1,313.1 L 69.2,315.4 L 72.1,316.8 L 77.9,314.6 L 81.5,321.6 L 81.7,316.1 Z",
  "Gwer West": "M 267.0,321.5 L 268.8,322.1 L 270.9,333.9 L 271.2,336.1 L 269.1,336.5 L 271.5,338.8 L 279.3,334.1 L 279.1,331.7 L 283.1,326.2 L 285.6,325.8 L 286.3,323.0 L 285.0,318.1 L 276.5,314.7 Z",
  "Etung": "M 295.7,419.1 L 294.4,428.6 L 299.6,428.1 L 308.4,423.3 L 309.1,418.1 L 315.3,413.4 L 313.1,409.1 L 305.7,406.7 L 304.7,413.5 L 301.4,413.8 L 300.9,418.0 Z",
  "Ekwusigo": "M 204.5,407.1 L 206.9,414.9 L 209.0,413.5 L 209.4,407.1 Z",
  "Ijero": "M 112.8,311.1 L 116.5,319.9 L 122.9,318.0 L 120.4,313.9 L 122.4,312.2 L 119.0,310.7 L 121.6,311.4 L 120.5,309.3 L 116.5,308.1 Z",
  "Ugwunagbo": "M 234.6,457.8 L 233.7,459.9 L 230.3,459.4 L 229.2,461.9 L 230.5,464.3 L 233.2,462.3 L 236.4,463.0 L 237.0,460.5 Z",
  "Olorunda": "M 98.7,314.3 L 93.9,309.3 L 92.3,316.7 L 98.5,317.3 Z",
  "Nasarawa Egon": "M 274.1,275.6 L 278.8,277.2 L 289.0,272.1 L 296.1,272.1 L 299.6,269.3 L 296.3,266.0 L 296.6,263.6 L 293.8,264.4 L 290.8,262.7 L 291.8,260.8 L 285.1,260.2 L 281.7,264.2 L 277.0,262.4 L 277.3,265.4 L 274.3,269.0 Z",
  "Ede North": "M 92.5,323.9 L 94.4,320.9 L 88.0,317.7 L 85.0,319.5 Z",
  "Afikpo South": "M 258.3,411.7 L 254.6,411.6 L 249.8,418.8 L 255.0,420.2 L 255.9,423.3 L 260.2,426.4 L 261.5,423.1 Z",
  "Oru West": "M 212.3,418.9 L 210.1,420.1 L 209.6,423.3 L 207.0,423.4 L 211.2,428.2 L 212.8,425.8 L 211.5,423.3 L 213.8,422.0 L 211.5,420.8 Z",
  "Anambra East": "M 206.0,379.4 L 208.5,381.0 L 208.3,389.0 L 204.8,396.7 L 205.3,399.7 L 215.0,394.2 L 213.3,388.2 L 210.2,388.6 L 212.7,373.5 L 208.6,370.9 L 205.6,374.0 Z",
  "Vandeikya": "M 323.9,361.0 L 315.6,360.0 L 314.7,365.3 L 316.4,370.3 L 314.1,373.8 L 317.4,376.4 L 325.0,374.0 Z",
  "Atakunmosa West": "M 91.8,326.1 L 94.8,328.2 L 97.4,335.0 L 104.4,330.9 L 104.6,329.1 L 101.7,330.1 L 96.0,318.9 Z",
  "Ogbaru": "M 203.5,403.0 L 200.8,405.8 L 201.4,411.6 L 195.7,426.3 L 200.2,425.7 L 200.3,423.2 L 205.6,421.2 L 202.7,416.6 L 205.7,413.8 L 204.5,407.1 L 206.2,405.2 Z",
  "Ikwuano": "M 248.6,438.8 L 242.6,436.2 L 240.9,440.5 L 242.4,446.7 L 248.3,445.0 L 248.7,443.0 L 246.6,442.7 Z",
  "Keffi": "M 258.8,258.1 L 254.7,260.8 L 256.0,267.0 L 260.8,263.8 L 261.2,260.9 Z",
  "Adavi": "M 180.5,330.3 L 186.0,330.6 L 187.3,326.3 L 201.1,317.3 L 200.1,315.6 L 196.4,313.4 L 179.9,327.2 L 176.4,325.9 L 174.8,328.0 Z",
  "Oru East": "M 216.1,428.3 L 214.5,427.0 L 215.8,425.8 L 213.7,425.9 L 215.2,420.9 L 213.1,419.6 L 211.5,420.8 L 213.8,422.0 L 211.5,423.3 L 212.8,425.8 L 211.2,428.2 L 213.4,429.5 Z",
  "Remo North": "M 56.7,353.7 L 51.7,353.6 L 47.7,358.6 L 51.9,362.3 Z",
  "Karu": "M 243.3,266.4 L 248.5,267.5 L 250.7,270.0 L 253.7,268.7 L 260.7,272.6 L 261.9,266.1 L 260.3,264.6 L 257.8,267.0 L 254.9,266.5 L 254.7,260.8 L 258.8,258.1 L 260.2,253.3 L 269.2,246.3 L 268.7,240.2 L 262.7,237.7 L 256.1,239.9 L 251.9,236.9 L 249.0,238.3 L 245.1,247.3 L 245.4,261.5 Z",
  "Ikenne": "M 50.0,368.8 L 53.6,360.9 L 51.3,362.2 L 47.7,358.6 L 45.2,360.1 L 44.8,363.0 L 49.3,365.6 Z",
  "Ila": "M 115.4,304.5 L 109.8,301.3 L 105.9,302.8 L 106.0,306.2 L 110.2,309.5 L 107.7,312.6 L 108.8,314.3 L 111.7,313.2 L 111.7,308.3 Z",
  "Doma": "M 276.5,314.7 L 286.7,317.8 L 282.7,308.1 L 285.3,302.0 L 291.8,296.4 L 290.7,285.0 L 286.3,281.5 L 277.7,279.6 L 273.4,281.0 L 274.8,284.8 L 269.3,287.8 L 266.9,296.5 L 268.5,299.3 L 264.8,306.2 L 267.7,311.4 Z",
  "Nafada": "M 415.0,140.8 L 421.9,149.8 L 421.0,153.5 L 426.8,157.5 L 426.1,159.8 L 432.9,160.7 L 434.1,158.4 L 432.2,150.1 L 435.5,145.4 L 433.0,141.5 L 425.9,141.0 L 420.5,138.3 L 419.7,135.2 Z",
  "Gwer East": "M 300.6,323.7 L 293.0,329.3 L 289.4,328.7 L 286.0,324.6 L 283.8,325.7 L 279.1,331.7 L 279.3,334.1 L 272.9,337.7 L 278.5,351.5 L 286.0,352.7 L 287.3,355.5 L 291.4,354.7 L 291.7,347.5 L 289.8,345.7 L 291.0,342.7 L 297.7,339.5 L 298.1,332.6 L 304.2,328.5 L 304.1,324.1 Z",
  "Efon": "M 109.8,322.2 L 108.7,325.7 L 111.1,329.6 L 112.4,325.9 L 114.8,326.4 L 116.3,323.4 L 112.1,315.9 Z",
  "Ihitte/Uboma": "M 230.9,431.6 L 237.0,431.5 L 234.7,425.4 Z",
  "Ekiti West": "M 112.8,311.2 L 111.3,316.3 L 116.3,323.4 L 114.8,326.4 L 112.4,325.9 L 111.1,329.6 L 111.5,330.9 L 114.2,328.9 L 118.4,330.2 L 121.2,321.2 L 118.6,319.0 L 115.7,319.3 Z",
  "Atisbo": "M 8.9,292.6 L 8.8,289.8 L 11.8,287.7 L 19.9,289.6 L 26.8,286.6 L 33.5,290.0 L 39.3,288.7 L 42.8,285.4 L 48.1,284.8 L 58.3,289.0 L 62.0,281.7 L 59.1,277.2 L 55.9,277.6 L 49.7,283.6 L 42.0,275.6 L 37.6,277.4 L 31.6,275.9 L 33.4,277.4 L 32.1,278.9 L 26.4,279.2 L 25.3,283.0 L 13.3,279.6 L 1.5,283.7 L 0.8,288.4 L 2.7,294.2 Z",
  "Isu": "M 220.6,424.1 L 217.3,424.0 L 215.7,426.0 L 219.3,429.5 Z",
  "Ogbadibo": "M 250.1,365.7 L 250.2,362.6 L 254.4,356.5 L 252.7,354.7 L 254.3,353.3 L 253.5,351.1 L 250.2,348.1 L 245.8,353.3 L 246.0,357.2 L 242.2,356.4 L 244.2,361.2 Z",
  "Atakunmosa East": "M 107.7,338.5 L 106.5,328.5 L 103.8,331.8 L 101.3,331.8 L 100.9,333.9 L 98.0,334.3 L 99.6,340.2 L 102.2,342.1 L 103.2,339.3 Z",
  "Akwanga": "M 273.5,251.9 L 277.5,259.1 L 277.0,262.4 L 281.7,264.2 L 284.8,260.3 L 292.2,260.3 L 289.2,249.9 L 282.9,243.9 L 278.6,244.5 L 277.3,248.6 Z",
  "Rafi": "M 170.2,174.9 L 167.5,180.9 L 168.5,186.6 L 166.1,195.9 L 168.6,198.1 L 165.5,198.4 L 164.8,204.8 L 158.0,212.8 L 164.2,213.8 L 172.5,211.8 L 177.4,206.4 L 188.6,209.3 L 193.6,202.9 L 192.5,196.9 L 189.5,194.6 L 186.3,196.0 L 187.3,192.8 L 183.8,188.8 L 187.0,185.9 L 190.1,186.5 L 193.1,181.9 L 191.8,171.1 L 190.3,170.0 L 185.4,172.3 L 180.7,180.1 L 178.3,179.8 L 174.2,183.4 L 173.5,176.0 Z",
  "Odukpani": "M 285.5,455.5 L 286.4,451.8 L 279.0,449.3 L 275.3,450.7 L 273.8,446.0 L 268.6,447.8 L 265.3,433.2 L 261.4,434.8 L 265.1,443.2 L 257.7,444.5 L 261.3,446.2 L 264.5,451.2 L 267.8,449.8 L 272.4,463.5 L 276.8,465.4 L 279.2,464.2 L 280.4,459.9 L 285.1,460.1 Z",
  "Gbako": "M 175.6,230.0 L 175.0,227.4 L 170.3,225.0 L 162.3,226.0 L 158.6,234.9 L 157.4,247.2 L 166.4,246.1 L 168.3,249.4 L 171.9,250.0 L 176.6,242.1 L 172.4,240.5 L 173.5,230.8 Z",
  "Ukwuani": "M 173.9,424.3 L 184.3,420.4 L 182.3,414.9 L 179.1,412.1 L 171.6,418.4 Z",
  "Awka South": "M 222.6,399.1 L 220.0,395.9 L 217.1,397.8 L 216.2,402.7 L 220.0,404.2 L 223.2,400.8 Z",
  "Gurara": "M 220.2,243.1 L 223.3,238.8 L 226.0,241.2 L 228.3,239.0 L 226.6,238.6 L 226.6,228.4 L 220.6,229.3 L 216.7,234.2 L 208.4,233.3 L 201.8,235.7 L 201.4,238.5 L 204.0,240.1 L 216.4,240.1 Z",
  "Kontagora": "M 123.9,187.3 L 135.0,189.0 L 138.4,192.0 L 151.4,189.7 L 148.7,186.5 L 150.4,184.2 L 149.4,174.8 L 145.5,166.8 L 142.0,166.3 L 138.6,172.9 L 135.9,173.0 L 132.7,169.9 L 132.7,182.6 L 126.7,183.5 Z",
  "Mashegu": "M 144.6,217.5 L 151.1,215.5 L 156.4,216.5 L 164.8,204.8 L 165.1,197.7 L 160.7,193.9 L 153.4,192.4 L 151.4,189.7 L 138.4,192.0 L 135.0,189.0 L 123.9,187.3 L 111.9,193.5 L 110.0,203.9 L 105.2,202.1 L 100.2,205.4 L 96.5,211.5 L 97.2,215.5 L 93.9,222.9 L 100.4,222.1 L 106.6,225.3 L 107.5,234.0 L 112.8,235.6 L 124.8,229.6 L 126.5,227.3 L 121.9,226.2 L 128.2,223.5 L 137.0,212.0 L 139.6,212.7 L 142.1,218.2 Z",
  "Wushishi": "M 161.2,228.0 L 164.2,225.1 L 167.4,226.4 L 170.3,225.0 L 173.8,227.4 L 176.6,226.3 L 174.7,224.0 L 175.7,218.0 L 179.7,217.5 L 180.9,212.2 L 177.3,207.6 L 172.5,211.8 L 164.2,213.8 L 158.0,212.8 L 155.5,217.0 L 152.0,215.5 L 144.9,216.2 L 155.1,229.0 Z",
  "Shiroro": "M 192.6,173.7 L 193.1,181.9 L 190.1,186.5 L 184.6,187.5 L 184.4,191.3 L 187.3,192.8 L 186.3,196.0 L 189.5,194.6 L 192.5,196.9 L 193.6,202.9 L 190.7,204.7 L 190.5,207.5 L 196.4,209.3 L 195.5,212.5 L 197.0,213.1 L 193.7,214.5 L 198.1,219.8 L 196.7,226.0 L 201.2,227.1 L 204.8,225.0 L 207.9,226.3 L 207.0,217.1 L 209.4,215.2 L 207.9,206.4 L 210.7,198.1 L 209.9,194.2 L 218.2,185.6 L 211.9,182.8 L 213.3,177.0 L 210.9,173.9 L 207.6,174.4 L 206.3,168.8 L 201.6,168.6 L 201.9,171.4 Z",
  "Borgu": "M 55.3,198.6 L 60.3,200.8 L 59.8,202.7 L 62.9,202.5 L 62.2,203.8 L 64.0,204.7 L 62.2,206.4 L 65.5,206.9 L 66.5,209.5 L 73.1,209.2 L 83.0,223.5 L 96.0,235.2 L 92.8,225.0 L 97.4,212.8 L 94.5,208.3 L 94.7,200.3 L 91.8,196.3 L 93.8,188.7 L 89.6,185.0 L 91.0,174.2 L 90.4,171.3 L 88.7,174.9 L 88.0,172.6 L 80.9,173.2 L 83.6,162.7 L 79.8,159.4 L 82.2,154.3 L 78.6,151.3 L 78.8,148.7 L 65.3,149.1 L 62.1,153.0 L 53.9,154.2 L 52.8,160.3 L 57.2,165.1 L 58.2,171.6 L 55.1,181.0 L 49.6,178.8 L 44.5,187.7 L 49.4,192.7 L 51.9,198.5 L 54.6,200.4 Z",
  "Lapai": "M 186.0,274.7 L 188.2,282.8 L 195.6,289.2 L 200.1,296.5 L 201.6,291.8 L 203.7,291.9 L 203.2,290.2 L 206.8,286.9 L 207.0,282.3 L 204.8,282.3 L 203.8,239.3 L 201.8,239.0 L 199.7,242.6 L 192.4,242.6 L 195.5,262.2 L 192.3,267.1 L 192.4,273.4 L 189.9,275.9 Z",
  "Akoko South West": "M 156.7,332.3 L 146.0,332.9 L 140.7,341.6 L 151.0,342.0 L 158.0,337.4 Z",
  "Rijau": "M 132.2,131.5 L 128.0,134.0 L 127.2,138.7 L 119.1,137.7 L 118.1,139.4 L 118.4,136.0 L 116.1,137.0 L 113.8,131.2 L 110.4,129.8 L 100.7,135.9 L 102.4,137.0 L 100.6,138.2 L 102.5,142.1 L 104.9,143.9 L 117.5,147.4 L 119.6,153.9 L 116.8,155.8 L 117.2,158.1 L 121.0,160.7 L 121.1,163.6 L 127.4,165.2 L 133.3,161.3 L 133.8,154.9 L 137.1,156.0 L 134.6,153.1 L 137.1,150.6 L 135.0,148.1 L 136.2,143.8 Z",
  "Chanchaga": "M 194.2,224.3 L 195.6,222.9 L 191.3,219.3 L 191.0,224.9 Z",
  "Mariga": "M 137.1,150.6 L 134.6,153.1 L 137.1,156.0 L 133.8,154.9 L 133.3,161.3 L 127.4,165.2 L 135.9,173.0 L 141.0,170.7 L 142.0,166.3 L 144.0,165.5 L 149.4,174.8 L 150.4,184.2 L 149.1,187.7 L 153.4,192.4 L 160.7,193.9 L 165.5,198.4 L 168.6,198.1 L 166.1,195.9 L 168.5,186.6 L 167.9,179.1 L 172.3,171.4 L 170.7,161.7 L 171.7,158.1 L 178.9,151.8 L 173.7,147.8 L 167.9,147.2 L 164.4,141.4 L 156.0,145.5 L 149.5,151.3 L 143.3,152.8 L 141.4,150.4 Z",
  "Munya": "M 228.3,200.0 L 220.9,200.7 L 210.3,198.3 L 207.9,206.4 L 209.4,215.2 L 207.0,217.1 L 207.9,226.3 L 213.4,226.9 L 214.3,224.8 L 217.0,225.0 L 219.5,219.6 L 223.3,222.0 L 225.8,219.7 L 222.7,215.6 L 230.2,212.4 Z",
  "Bosso": "M 189.4,231.1 L 190.7,227.1 L 196.9,226.0 L 198.3,223.0 L 197.6,218.8 L 193.7,214.5 L 197.0,213.1 L 195.5,212.5 L 196.4,209.3 L 190.4,207.5 L 187.2,209.6 L 182.7,206.7 L 177.4,206.4 L 180.8,213.7 L 179.7,217.5 L 175.7,218.0 L 175.6,230.0 L 185.3,235.0 Z M 194.2,224.3 L 191.0,224.9 L 191.3,219.3 L 195.6,222.9 Z",
  "Suleja": "M 224.6,246.6 L 226.1,241.7 L 223.3,238.8 L 220.2,243.1 Z",
  "Paikoro": "M 225.9,214.6 L 222.7,215.6 L 225.8,219.7 L 223.3,222.0 L 219.5,219.6 L 217.0,225.0 L 214.3,224.8 L 213.4,226.9 L 204.5,225.0 L 201.2,227.1 L 196.6,225.9 L 190.7,227.1 L 189.3,229.9 L 191.9,242.1 L 199.7,242.6 L 202.0,235.5 L 208.4,233.3 L 216.7,234.2 L 220.6,229.3 L 227.1,228.1 L 227.3,224.7 L 230.9,221.4 Z",
  "Kanke": "M 340.0,229.3 L 343.0,231.0 L 340.8,233.8 L 343.3,235.2 L 341.8,240.2 L 338.1,241.0 L 339.3,244.9 L 344.2,243.8 L 345.3,240.1 L 349.3,239.3 L 350.9,241.9 L 355.1,240.1 L 353.8,226.0 L 348.2,226.9 L 344.7,225.4 L 344.2,229.5 Z",
  "Jos North": "M 312.7,200.7 L 308.0,202.3 L 305.9,207.0 L 308.2,208.7 L 310.6,207.2 L 314.3,209.8 L 314.6,202.7 Z",
  "Jos East": "M 329.4,210.1 L 327.4,209.3 L 326.5,201.1 L 328.5,200.5 L 327.2,199.6 L 315.9,200.4 L 314.3,203.1 L 315.3,207.8 L 313.4,211.6 L 319.4,218.9 Z",
  "Oredo": "M 147.8,390.8 L 142.0,395.6 L 138.7,404.9 L 141.2,405.4 L 143.9,399.5 L 146.6,398.3 Z",
  "Patani": "M 164.6,455.3 L 167.8,457.1 L 169.9,454.2 L 172.1,455.3 L 175.1,453.8 L 176.5,449.0 L 165.2,452.3 Z M 179.8,448.0 L 178.5,450.2 L 180.1,449.9 Z",
  "Shendam": "M 353.6,287.0 L 348.9,276.7 L 348.5,271.0 L 350.4,267.2 L 354.4,265.4 L 354.9,257.8 L 345.7,258.0 L 345.0,255.7 L 342.0,256.0 L 341.9,257.7 L 338.3,254.7 L 334.5,255.2 L 336.0,249.0 L 332.1,248.4 L 331.7,253.4 L 333.5,256.4 L 332.3,259.9 L 335.9,262.9 L 333.0,265.1 L 333.0,272.2 L 335.9,273.9 L 333.5,280.9 L 347.0,287.0 Z",
  "Egor": "M 147.6,388.5 L 143.9,389.6 L 142.0,395.6 L 147.5,391.4 Z",
  "Langtang North": "M 350.2,241.4 L 350.8,244.7 L 347.6,246.3 L 352.9,249.0 L 354.0,253.6 L 357.9,255.2 L 354.5,264.2 L 359.4,264.4 L 359.1,252.3 L 362.6,249.1 L 360.9,246.5 L 362.4,246.3 L 362.3,243.2 L 355.8,238.6 L 354.7,240.5 Z",
  "Jos South": "M 305.9,207.0 L 303.6,214.4 L 301.0,215.4 L 300.4,217.9 L 304.5,222.3 L 309.3,220.4 L 314.8,209.3 Z",
  "Mikang": "M 355.1,259.8 L 357.7,254.6 L 354.0,253.6 L 352.9,249.0 L 350.0,246.9 L 347.6,246.3 L 338.8,250.9 L 336.0,249.0 L 334.3,255.1 L 338.3,254.7 L 341.9,257.7 L 343.3,255.7 L 345.7,258.0 L 353.6,256.9 Z",
  "Barkin Ladi": "M 299.3,241.0 L 304.1,239.8 L 305.7,236.0 L 317.2,229.8 L 316.6,226.7 L 321.7,223.8 L 321.7,218.7 L 318.2,218.3 L 314.0,211.8 L 309.7,218.9 L 309.0,225.0 L 301.4,231.9 Z",
  "Pankshin": "M 331.5,224.8 L 330.4,227.2 L 330.7,228.7 L 332.9,227.7 L 331.2,230.9 L 332.9,232.6 L 329.0,235.9 L 326.8,242.7 L 329.8,243.7 L 331.4,247.7 L 337.6,248.7 L 338.8,250.9 L 350.8,244.7 L 349.3,239.3 L 344.8,240.4 L 344.2,243.8 L 339.3,244.9 L 338.1,241.0 L 341.8,240.2 L 343.3,235.2 L 340.8,233.8 L 343.0,231.0 L 337.0,229.3 L 335.6,226.4 Z",
  "Bokkos": "M 298.6,243.3 L 304.0,245.5 L 305.6,252.4 L 319.7,252.6 L 322.9,247.2 L 320.2,244.1 L 321.3,239.0 L 323.2,237.9 L 320.4,236.9 L 315.4,230.3 L 309.3,235.3 L 305.7,236.0 L 304.1,239.8 L 299.3,241.0 Z",
  "Wase": "M 393.9,233.8 L 389.1,234.7 L 387.2,237.1 L 384.6,235.7 L 383.7,232.5 L 381.1,232.3 L 379.7,229.0 L 377.7,232.4 L 373.7,231.2 L 367.6,238.3 L 365.4,238.4 L 366.4,241.8 L 362.3,243.2 L 362.4,246.3 L 360.9,246.5 L 362.6,249.1 L 359.1,252.3 L 361.1,271.9 L 368.4,275.3 L 386.8,257.0 L 395.7,255.3 L 397.7,247.9 Z",
  "Orumba South": "M 229.2,405.9 L 222.9,409.2 L 224.0,413.4 L 228.2,413.6 L 228.8,410.5 L 231.6,410.1 L 232.6,407.9 Z",
  "Kanam": "M 364.4,217.7 L 364.8,221.6 L 357.4,222.9 L 353.8,226.0 L 354.2,238.7 L 358.3,239.4 L 360.5,242.8 L 366.4,241.8 L 365.4,238.4 L 367.6,238.3 L 373.7,231.2 L 377.7,232.4 L 379.7,229.0 L 381.1,232.3 L 383.7,232.5 L 384.6,235.7 L 387.2,237.1 L 394.8,232.7 L 390.3,225.3 L 378.9,218.3 L 373.4,218.8 L 369.2,216.0 Z",
  "Langtang South": "M 368.4,275.3 L 361.1,271.9 L 361.3,266.4 L 357.4,263.4 L 350.4,267.2 L 348.5,271.0 L 348.9,276.7 L 353.6,287.0 Z",
  "Mangu": "M 323.6,215.5 L 320.1,218.2 L 322.8,221.0 L 321.7,223.8 L 318.2,224.7 L 316.1,228.0 L 316.6,232.2 L 323.2,237.9 L 321.3,239.0 L 320.2,244.1 L 322.9,247.2 L 319.7,250.5 L 320.4,253.1 L 326.7,252.3 L 329.0,248.3 L 331.7,247.8 L 329.8,243.7 L 326.8,242.7 L 329.0,235.9 L 332.9,232.6 L 331.2,230.9 L 332.9,227.7 L 330.7,228.7 L 330.4,227.2 L 332.1,223.1 L 330.3,222.1 L 330.0,217.8 L 326.6,218.5 Z",
  "Tafa": "M 234.6,236.6 L 227.2,237.5 L 228.3,239.0 L 224.6,246.6 L 226.6,248.2 Z",
  "Magama": "M 92.0,196.8 L 94.7,200.3 L 94.5,208.3 L 96.5,211.5 L 103.5,202.6 L 110.0,203.9 L 111.9,193.5 L 120.9,190.0 L 126.7,183.5 L 132.7,182.6 L 132.7,169.9 L 129.8,166.3 L 120.6,162.5 L 112.6,166.3 L 106.4,165.4 L 106.4,175.7 L 112.1,179.2 L 112.8,187.2 L 109.1,190.7 L 105.2,188.5 L 100.3,189.6 L 97.8,191.4 L 96.7,196.7 Z",
  "Agwara": "M 82.2,154.3 L 79.8,159.4 L 83.6,162.7 L 81.1,173.6 L 88.0,172.6 L 88.7,174.9 L 90.4,171.3 L 91.0,174.2 L 95.5,172.4 L 100.0,167.6 L 101.6,157.0 L 100.2,154.3 L 95.6,155.9 L 92.5,154.2 L 85.8,156.4 Z",
  "Riyom": "M 294.6,228.1 L 300.3,234.2 L 305.0,227.4 L 309.0,225.0 L 309.3,220.4 L 304.5,222.3 L 300.6,219.6 L 300.6,215.9 L 303.4,213.5 L 295.7,216.2 L 293.4,224.5 Z",
  "Rabah": "M 167.3,57.3 L 165.8,50.3 L 168.4,46.2 L 166.7,41.6 L 151.6,40.5 L 151.1,33.3 L 147.3,32.7 L 141.4,38.2 L 138.9,37.5 L 133.6,40.2 L 135.0,42.0 L 139.4,40.6 L 144.9,56.3 L 147.3,52.2 L 152.2,55.1 L 159.7,55.4 L 163.6,58.8 L 166.8,59.1 Z",
  "Ikwo": "M 272.0,400.5 L 265.9,409.8 L 271.4,413.3 L 276.4,409.4 L 279.8,409.8 L 280.8,404.4 L 285.7,398.8 L 282.7,396.4 L 281.6,399.2 Z",
  "Safana": "M 232.4,81.4 L 235.8,80.5 L 236.7,77.6 L 235.7,68.2 L 233.6,68.4 L 234.6,63.2 L 230.3,62.8 L 229.6,60.9 L 222.3,63.5 L 221.8,61.5 L 217.8,60.6 L 215.1,63.0 L 217.9,64.1 L 218.9,75.6 L 224.2,74.6 L 225.5,80.5 Z",
  "Ajeromi/Ifelodun": "M 32.3,385.4 L 31.2,386.5 L 32.8,387.3 Z",
  "Koko-Besse": "M 83.9,111.2 L 80.1,111.8 L 76.9,115.8 L 77.8,118.3 L 85.2,121.1 L 85.8,124.1 L 84.0,124.5 L 85.8,127.3 L 75.5,131.5 L 74.3,134.1 L 80.7,141.1 L 91.1,142.4 L 89.8,137.6 L 95.2,126.1 L 90.3,124.3 L 90.3,121.3 L 86.4,118.1 L 86.8,115.2 Z",
  "Epe": "M 69.7,374.7 L 50.4,374.5 L 50.4,379.0 L 46.4,384.7 L 59.7,382.1 L 60.2,383.9 L 65.4,384.4 L 69.0,387.5 L 83.4,390.9 L 83.1,386.6 L 78.5,387.0 L 73.9,384.7 L 77.1,381.6 L 76.6,379.1 L 68.9,380.3 Z",
  "Sumaila": "M 317.4,122.6 L 312.4,120.2 L 309.8,121.1 L 307.1,126.2 L 308.2,127.7 L 305.0,129.5 L 304.7,133.8 L 301.0,136.8 L 301.5,138.9 L 304.6,139.2 L 297.9,142.8 L 304.4,153.3 L 306.0,144.7 L 310.0,144.3 L 317.2,135.6 L 322.3,133.0 L 317.1,126.4 Z",
  "Ogori/Magongo": "M 173.5,330.6 L 171.1,334.5 L 174.7,335.7 L 176.8,333.7 Z",
  "Amuwo Odofin": "M 32.2,387.3 L 31.5,384.3 L 29.9,384.5 L 27.2,385.0 L 25.3,388.3 L 33.4,389.4 Z",
  "Tsanyawa": "M 265.6,89.6 L 271.9,88.1 L 272.7,83.7 L 269.6,79.6 L 271.1,76.4 L 265.8,77.6 L 258.9,83.5 L 261.4,88.1 L 265.4,88.1 Z",
  "Ibeju Lekki": "M 48.8,384.5 L 46.8,388.1 L 61.7,387.6 L 79.4,390.4 L 60.2,383.9 L 59.7,382.1 Z",
  "Ajaokuta": "M 180.2,332.0 L 184.4,337.2 L 187.0,336.5 L 191.2,344.2 L 197.5,342.7 L 200.1,346.7 L 200.6,327.4 L 202.8,323.2 L 202.7,317.3 L 200.0,317.4 L 190.8,325.3 L 188.3,325.5 L 186.0,330.6 L 181.9,329.6 Z",
  "Irepo": "M 50.0,254.2 L 51.3,255.7 L 57.5,255.2 L 59.6,258.4 L 64.3,260.5 L 71.8,259.0 L 76.0,255.6 L 66.0,252.3 L 61.5,245.1 L 58.6,244.3 L 54.0,246.4 Z",
  "Isoko North": "M 170.0,441.0 L 175.3,433.8 L 177.4,435.6 L 179.9,433.4 L 182.1,434.4 L 183.1,439.6 L 188.4,438.5 L 184.4,437.3 L 181.9,428.9 L 171.3,431.6 L 168.3,437.7 Z",
  "Ezeagu": "M 230.1,395.6 L 235.0,390.2 L 231.8,384.5 L 229.4,385.0 L 227.4,380.2 L 225.0,383.9 L 222.6,383.0 L 217.3,385.9 L 222.5,389.5 L 223.6,394.3 L 227.8,396.4 Z",
  "Irele": "M 108.7,387.3 L 111.7,386.6 L 116.3,394.8 L 117.0,391.1 L 120.7,389.1 L 123.2,384.1 L 121.6,373.7 L 119.9,372.7 L 116.3,376.3 L 109.3,376.7 L 106.9,385.6 Z",
  "Owo": "M 138.0,354.7 L 143.8,364.5 L 144.7,358.7 L 153.6,348.8 L 148.0,342.0 L 135.4,343.1 L 136.9,351.8 L 140.1,352.8 Z",
  "Dekina": "M 233.1,314.0 L 230.2,317.7 L 226.0,317.2 L 221.0,322.0 L 215.9,321.7 L 207.7,326.8 L 205.6,333.7 L 207.9,336.5 L 216.3,336.6 L 218.1,333.0 L 220.8,333.0 L 223.9,339.8 L 238.7,337.2 L 237.8,322.3 Z",
  "Akoko North East": "M 162.6,324.5 L 159.6,327.8 L 154.8,329.3 L 146.4,328.7 L 146.0,332.9 L 163.1,332.0 L 165.8,330.2 Z",
  "Oluyole": "M 60.9,340.2 L 57.5,339.5 L 52.2,342.4 L 53.6,342.6 L 55.1,351.2 L 52.0,353.9 L 62.4,353.7 L 65.4,351.5 L 65.2,344.2 L 63.4,340.5 Z",
  "Ogba/Egbema/Ndoni": "M 199.8,450.9 L 203.7,445.6 L 203.7,440.7 L 202.7,436.4 L 197.6,436.4 L 199.0,426.2 L 195.7,426.3 L 196.5,429.2 L 189.4,441.0 L 194.1,442.7 L 192.1,447.2 L 193.3,452.2 L 198.6,451.9 L 198.6,449.9 Z",
  "Ovia South-West": "M 129.0,407.2 L 129.6,402.8 L 133.9,400.2 L 133.1,397.6 L 138.9,394.3 L 135.9,390.4 L 137.6,390.3 L 140.3,382.4 L 134.6,372.8 L 138.5,364.0 L 128.3,364.1 L 121.3,374.8 L 123.1,384.4 L 116.1,394.3 L 122.8,402.7 L 126.6,402.4 L 127.2,406.7 Z",
  "Ndokwa East": "M 189.9,442.3 L 189.7,440.2 L 192.3,438.2 L 192.1,434.4 L 196.5,429.2 L 195.6,425.3 L 197.8,423.2 L 201.6,410.2 L 189.5,410.8 L 187.7,415.2 L 189.4,417.3 L 187.4,420.9 L 189.1,426.1 L 181.9,428.9 L 184.4,437.3 L 188.4,438.8 L 182.9,439.8 L 181.1,446.3 L 190.1,445.2 Z",
  "Saki East": "M 36.4,261.2 L 45.1,280.4 L 49.7,283.6 L 55.9,277.6 L 59.1,277.2 L 48.6,266.1 L 45.4,256.3 Z",
  "Onicha": "M 252.0,404.1 L 256.2,407.5 L 258.7,406.8 L 261.4,411.3 L 266.4,410.4 L 266.3,406.7 L 263.4,407.6 L 260.5,405.4 L 259.2,397.9 L 255.7,399.7 L 255.5,398.0 L 252.3,398.3 Z",
  "Ethiope East": "M 173.0,422.7 L 171.6,418.4 L 167.8,422.2 L 159.0,423.2 L 158.2,425.5 L 160.9,427.9 L 161.5,432.6 L 165.1,433.1 L 168.5,429.7 L 167.6,426.4 Z",
  "Oyo East": "M 69.4,308.5 L 66.3,310.3 L 67.0,312.2 L 61.3,313.8 L 62.3,316.6 L 69.9,312.8 Z",
  "Ivo": "M 242.2,409.7 L 240.8,415.2 L 242.4,418.6 L 249.9,419.3 L 251.5,413.8 Z",
  "Etsako East": "M 201.4,351.7 L 197.5,342.7 L 191.2,344.2 L 187.2,337.1 L 182.6,341.1 L 179.0,339.4 L 178.4,347.2 L 190.9,350.2 L 193.4,357.9 L 199.6,359.5 Z",
  "Oshimili South": "M 197.9,404.8 L 194.2,406.1 L 193.9,410.2 L 201.6,410.2 L 200.8,405.8 L 204.1,401.3 L 201.8,396.2 L 200.6,403.9 Z",
  "Izzi": "M 285.3,394.1 L 288.6,387.8 L 285.3,381.4 L 281.9,379.4 L 277.2,368.4 L 274.3,369.8 L 275.3,375.5 L 273.0,377.7 L 273.4,395.1 Z",
  "Isoko South": "M 178.5,450.2 L 182.6,444.0 L 183.1,439.6 L 182.1,434.4 L 179.9,433.4 L 177.9,435.6 L 175.3,433.8 L 170.0,441.0 L 170.3,445.5 L 173.1,449.6 Z",
  "Ezza South": "M 267.3,399.5 L 263.6,402.1 L 259.6,400.7 L 260.5,405.4 L 263.4,407.6 L 266.3,406.7 L 266.0,408.9 L 270.4,405.0 L 272.0,400.5 L 269.9,399.4 L 267.7,401.2 Z",
  "Ofu": "M 201.0,332.9 L 200.3,346.8 L 203.3,343.0 L 212.7,348.0 L 217.5,347.1 L 218.0,344.3 L 226.3,345.8 L 228.7,349.4 L 235.5,342.1 L 234.5,338.5 L 223.0,339.5 L 220.8,333.0 L 218.1,333.0 L 216.3,336.6 L 209.1,336.7 Z",
  "Aniocha North": "M 183.7,390.1 L 184.3,397.6 L 191.4,394.2 L 194.7,394.9 L 194.4,384.3 Z",
  "Aniocha South": "M 194.7,394.9 L 191.4,394.2 L 184.3,397.6 L 185.1,399.9 L 182.8,402.0 L 181.5,409.1 L 182.9,410.5 L 184.7,408.5 L 186.2,410.7 L 193.9,410.2 L 194.2,406.1 L 197.5,405.6 L 195.9,401.5 L 197.3,397.8 Z",
  "Igalamela-Odolu": "M 233.2,356.3 L 234.0,353.4 L 229.8,352.0 L 231.0,348.5 L 227.0,349.0 L 225.8,345.6 L 218.0,344.3 L 217.5,347.1 L 212.7,348.0 L 203.3,343.0 L 200.3,346.8 L 201.4,351.7 L 205.2,351.8 L 204.9,356.0 L 206.6,355.0 L 207.4,357.2 L 210.7,357.2 L 210.6,359.0 L 213.8,360.0 L 215.2,369.2 L 219.7,368.4 L 226.1,363.1 L 227.7,359.5 Z",
  "Ibiono Ibom": "M 257.4,460.3 L 261.7,457.8 L 262.6,452.9 L 264.7,451.3 L 261.3,446.2 L 257.8,444.6 L 256.0,447.0 L 257.9,449.2 Z",
  "Obot Akara": "M 248.2,452.9 L 248.4,449.2 L 251.8,447.6 L 249.9,444.1 L 242.4,446.2 L 242.3,453.1 Z",
  "Ogo Oluwa": "M 80.0,303.2 L 74.2,301.1 L 71.9,304.0 L 73.8,304.4 L 71.4,306.0 L 71.9,308.3 L 69.4,309.5 L 69.9,313.3 L 75.3,313.1 L 75.0,310.7 L 79.3,307.5 L 84.2,313.8 L 85.3,311.4 Z",
  "Atiba": "M 55.9,298.8 L 55.6,304.8 L 62.0,308.2 L 60.6,311.9 L 62.3,313.4 L 69.4,308.5 L 67.7,304.0 L 65.8,304.3 L 67.2,301.2 L 64.5,298.8 L 64.9,296.2 L 58.1,294.5 Z",
  "Ogbomosho South": "M 74.2,301.1 L 79.4,302.3 L 77.6,299.3 L 74.6,299.5 Z",
  "Ovia North-East": "M 137.7,407.9 L 141.8,392.4 L 153.8,380.9 L 159.1,368.6 L 155.4,367.8 L 150.7,371.8 L 147.0,371.3 L 144.4,373.4 L 142.7,367.8 L 144.0,364.8 L 138.5,364.0 L 134.6,372.8 L 140.3,382.4 L 137.6,390.3 L 135.9,390.4 L 138.9,394.3 L 134.2,396.5 L 133.1,401.5 L 129.6,402.8 L 130.1,406.3 L 127.9,410.9 L 130.1,414.7 L 133.5,411.6 L 131.9,409.1 L 136.9,409.7 Z",
  "Afijio": "M 47.0,321.1 L 44.8,322.6 L 46.1,326.6 L 50.2,324.2 L 53.8,326.4 L 59.9,322.9 L 62.5,323.1 L 62.5,324.9 L 69.2,324.1 L 69.9,312.8 L 60.3,317.7 L 58.8,313.5 L 52.8,313.3 L 49.6,321.8 Z",
  "Ogbomosho North": "M 79.4,295.2 L 75.7,295.3 L 74.8,298.7 L 77.6,299.3 L 80.0,303.2 L 81.8,298.5 Z",
  "Ikwerre": "M 201.8,457.1 L 207.9,460.7 L 209.9,466.9 L 216.6,465.6 L 218.3,462.5 L 214.4,459.5 L 212.8,450.2 L 206.4,448.6 L 207.2,453.1 L 204.8,455.4 L 203.3,453.8 Z",
  "Esit Eket": "M 272.5,482.8 L 273.4,479.3 L 270.9,477.8 L 265.9,480.5 L 267.1,483.4 Z",
  "Obio/Akpor": "M 213.5,473.8 L 215.8,470.8 L 218.7,472.1 L 221.1,469.6 L 219.7,466.1 L 213.6,465.3 L 213.8,466.7 L 210.6,467.0 Z",
  "Etche": "M 227.0,451.9 L 217.9,449.1 L 212.8,450.2 L 214.4,459.5 L 218.3,462.5 L 217.2,466.3 L 222.9,467.6 Z",
  "Askira Uba": "M 520.4,153.2 L 520.4,158.3 L 515.6,167.1 L 513.0,167.9 L 511.0,165.5 L 502.6,164.6 L 499.3,161.4 L 495.4,162.7 L 493.3,159.9 L 486.3,166.4 L 491.9,169.6 L 497.6,179.3 L 504.0,171.7 L 514.3,173.7 L 518.6,177.9 L 525.9,180.8 L 532.8,157.0 L 527.8,155.4 L 523.5,157.3 L 524.0,152.2 L 521.0,151.6 Z",
  "Gwadabawa": "M 132.4,34.3 L 143.5,20.4 L 140.6,16.3 L 139.9,20.7 L 131.9,20.9 L 134.1,16.9 L 131.9,13.2 L 129.7,15.6 L 129.8,19.0 L 124.7,19.0 L 123.9,23.8 L 121.5,24.0 L 123.1,26.4 L 119.0,29.5 L 122.2,33.1 L 123.9,28.6 L 129.8,28.9 L 130.0,32.3 L 131.4,32.1 L 130.3,34.8 Z",
  "Hadejia": "M 368.4,75.6 L 370.3,74.5 L 369.3,72.1 L 366.8,74.7 Z",
  "Kiri Kasama": "M 375.2,61.9 L 373.4,64.8 L 374.7,68.1 L 368.9,69.1 L 370.3,74.5 L 368.4,76.2 L 384.0,74.6 L 381.4,70.6 L 384.6,64.1 L 383.4,57.8 Z",
  "Konduga": "M 525.6,133.4 L 528.5,130.4 L 533.4,130.2 L 536.1,133.2 L 541.3,133.7 L 541.6,130.5 L 545.7,127.5 L 544.7,122.9 L 549.7,123.3 L 549.2,118.0 L 545.3,116.2 L 543.7,110.0 L 541.3,108.6 L 532.8,112.3 L 531.7,109.3 L 528.4,107.9 L 526.9,110.1 L 531.1,113.1 L 529.9,113.9 L 524.3,111.5 L 524.7,109.9 L 520.0,112.9 L 516.9,111.4 L 521.4,105.6 L 519.9,96.0 L 515.8,94.5 L 513.7,97.9 L 514.9,101.4 L 511.4,103.7 L 505.0,101.2 L 503.6,98.0 L 500.7,97.8 L 500.8,100.2 L 498.8,99.9 L 497.0,104.7 L 501.1,108.1 L 503.2,116.2 L 502.7,123.7 L 508.3,132.8 L 511.2,135.8 L 521.0,132.4 Z",
  "Jere": "M 520.6,106.6 L 516.9,111.4 L 520.0,112.9 L 524.7,109.9 L 524.3,111.5 L 531.1,113.1 L 526.9,110.1 L 528.4,107.9 L 525.5,107.0 L 530.3,105.3 L 530.6,102.4 L 529.1,96.4 L 527.9,98.1 L 525.8,93.7 L 527.2,91.4 L 523.7,88.2 L 519.0,93.3 L 520.3,102.0 L 521.7,104.1 L 523.7,103.3 L 525.2,108.2 L 521.2,110.9 Z",
  "Eti Osa": "M 35.5,387.2 L 34.2,389.3 L 46.8,388.1 L 49.1,385.0 L 45.2,383.2 L 43.0,385.8 L 36.5,385.7 Z",
  "Kosofe": "M 33.7,381.0 L 35.7,382.3 L 35.6,379.2 L 38.0,377.6 L 34.0,376.7 Z",
  "Ibadan North": "M 62.3,336.0 L 60.7,333.9 L 58.7,335.6 L 60.3,338.3 Z",
  "Akinyele": "M 68.6,324.2 L 62.5,324.9 L 62.5,323.1 L 59.9,322.9 L 53.8,326.4 L 62.3,336.0 L 62.8,332.2 L 66.2,330.4 L 64.7,327.1 Z",
  "Ido": "M 42.7,335.1 L 50.8,334.8 L 50.1,337.9 L 52.3,342.4 L 57.4,340.8 L 57.9,336.9 L 56.2,335.4 L 59.4,335.5 L 60.0,333.0 L 50.2,324.2 L 45.8,326.9 Z",
  "Ibadan North West": "M 58.7,335.9 L 56.2,335.4 L 56.6,336.8 L 60.4,338.3 Z",
  "Ibadan South West": "M 59.0,340.4 L 59.3,337.8 L 57.3,338.5 Z",
  "Ibadan South East": "M 60.4,338.3 L 58.8,340.8 L 61.4,340.1 Z",
  "Abeokuta South": "M 32.0,351.0 L 35.9,349.8 L 33.1,345.9 L 31.2,346.5 L 31.1,348.3 L 33.6,347.9 Z",
  "Alimosho": "M 25.4,382.4 L 27.5,385.5 L 29.9,384.5 L 31.2,378.6 L 28.3,374.0 Z",
  "Ifako/Ijaye": "M 28.3,374.0 L 32.3,377.4 L 32.6,375.0 Z",
  "Ikorodu": "M 37.6,374.4 L 39.9,383.2 L 47.1,382.0 L 50.4,379.0 L 50.4,374.5 Z",
  "Ifo": "M 19.5,370.4 L 20.8,372.2 L 27.7,369.8 L 29.6,374.3 L 38.0,376.7 L 34.3,373.5 L 34.0,367.1 L 30.6,363.0 L 27.7,366.2 L 18.3,366.9 Z",
  "Ikeja": "M 33.7,381.0 L 32.9,375.8 L 30.8,379.5 Z",
  "Ewekoro": "M 21.8,354.9 L 17.6,357.5 L 20.1,363.4 L 18.3,366.9 L 27.7,366.2 L 31.1,360.7 L 28.9,357.1 L 32.7,355.8 L 30.7,351.9 L 25.0,355.8 Z",
  "Ojo": "M 20.5,384.1 L 20.7,388.7 L 16.4,389.4 L 25.5,389.1 L 27.3,386.2 L 25.4,382.4 Z",
  "Badagry": "M 10.0,383.4 L 8.3,386.7 L 0.3,386.2 L 0.3,390.5 L 20.7,388.7 L 20.3,384.0 Z",
  "Obafemi Owode": "M 30.7,351.9 L 32.7,355.8 L 28.9,357.1 L 30.8,358.6 L 30.2,362.5 L 34.0,367.1 L 34.3,373.5 L 37.1,375.0 L 38.6,367.1 L 44.8,363.0 L 45.2,360.1 L 55.1,350.5 L 53.1,345.4 L 48.6,348.9 L 39.5,348.0 Z",
  "Ipokia": "M 6.7,367.6 L 4.9,365.3 L 2.4,365.4 L 1.7,369.7 L 4.7,371.0 L 0.6,386.1 L 7.1,386.9 L 9.8,385.0 L 9.7,380.5 L 6.7,376.6 L 9.6,371.5 L 5.7,369.8 Z",
  "Ohimini": "M 255.7,342.8 L 257.8,349.8 L 262.4,350.3 L 263.2,352.6 L 269.4,350.1 L 270.9,346.4 L 268.7,344.5 L 267.9,339.9 L 259.1,339.8 L 258.2,337.0 L 255.3,336.7 L 254.1,342.4 Z",
  "Ilorin West": "M 92.1,278.8 L 87.6,280.6 L 89.2,284.8 L 95.4,283.9 Z",
  "Asa": "M 97.4,289.1 L 98.6,287.4 L 95.4,283.9 L 90.1,285.1 L 88.1,283.7 L 89.4,276.7 L 86.9,275.7 L 82.5,268.7 L 78.3,267.9 L 77.2,264.2 L 75.2,263.6 L 75.9,270.7 L 85.0,290.2 L 89.7,295.5 L 90.7,301.3 L 91.8,302.1 L 94.1,299.5 L 94.6,293.8 Z"
};

const NGA_STATE_LGAS: Record<string, string[]> = {
  "Abia": ["Aba North", "Aba South", "Arochukwu", "Umuahia North", "Umuahia South"],
  "Abuja Federal Capital Territory": ["Bwari", "Gwagwalada", "Kuje", "Kwali", "Municipal Area Council"],
  "Adamawa": ["Mubi North", "Numan", "Yola North", "Yola South"],
  "Akwa Ibom": ["Abak", "Eket", "Ikot Ekpene", "Oron", "Uyo"],
  "Anambra": ["Awka North", "Awka South", "Nnewi North", "Onitsha North", "Onitsha South"],
  "Bauchi": ["Bauchi", "Giade", "Katagum", "Misau", "Tafawa-Balewa"],
  "Bayelsa": ["Brass", "Kolokuma/Opokuma", "Nembe", "Ogbia", "Yenegoa"],
  "Benue": ["Gboko", "Katsina-Ala", "Makurdi", "Oturkpo", "Vandeikya"],
  "Borno": ["Biu", "Chibok", "Gwoza", "Jere", "Maiduguri"],
  "Cross River": ["Abi", "Bekwarra", "Calabar Municipal", "Calabar South", "Ogoja"],
  "Delta": ["Oshimili North", "Oshimili South", "Uvwie", "Warri North", "Warri South"],
  "Ebonyi": ["Abakaliki", "Afikpo North", "Afikpo South", "Ezza North", "Ohaozara"],
  "Edo": ["Esan Central", "Etsako West", "Oredo", "Owan East"],
  "Ekiti": ["Ado-Ekiti", "Efon", "Emure", "Gbonyin", "Ijero"],
  "Enugu": ["Enugu East", "Enugu North", "Enugu South", "Nsukka", "Oji-River"],
  "Gombe": ["Balanga", "Gombe", "Kaltungo", "Nafada", "Yamaltu/Deba"],
  "Imo": ["Aboh-Mbaise", "Okigwe", "Orlu", "Owerri North", "Owerri West"],
  "Jigawa": ["Dutse", "Gumel", "Hadejia", "Kazaure", "Ringim"],
  "Kaduna": ["Jema'A", "Kaduna North", "Kaduna South", "Soba", "Zaria"],
  "Kano": ["Dala", "Fagge", "Gwale", "Kano Municipal"],
  "Katsina": ["Daura", "Dutsin Ma", "Funtua", "Katsina", "Mashi"],
  "Kebbi": ["Argungu", "Birnin Kebbi", "Kalgo", "Yauri", "Zuru"],
  "Kogi": ["Ankpa", "Idah", "Kabba/Bunu", "Lokoja", "Okene"],
  "Kwara": ["Edu", "Ekiti", "Ilorin East", "Ilorin West", "Offa"],
  "Lagos": ["Alimosho", "Ikeja", "Kosofe", "Lagos Island", "Surulere"],
  "Nasarawa": ["Akwanga", "Doma", "Keffi", "Lafia", "Nasarawa"],
  "Niger": ["Agaie", "Bida", "Chanchaga", "Kontagora", "Suleja"],
  "Ogun": ["Abeokuta North", "Abeokuta South", "Ijebu Ode", "Remo North", "Shagamu"],
  "Ondo": ["Akure North", "Akure South", "Odigbo", "Ondo East", "Ondo West"],
  "Osun": ["Ede North", "Ife Central", "Ilesha East", "Ilesha West", "Osogbo"],
  "Oyo": ["Ibadan North", "Ibadan South West", "Ogbomosho North", "Oyo East", "Saki East"],
  "Plateau": ["Barkin Ladi", "Jos North", "Jos South", "Mangu", "Pankshin"],
  "Rivers": ["Bonny", "Eleme", "Obio/Akpor", "Okrika", "Port-Harcourt"],
  "Sokoto": ["Bodinga", "Sokoto North", "Sokoto South", "Tambuwal", "Wamakko"],
  "Taraba": ["Ardo-Kola", "Donga", "Jalingo", "Sardauna", "Wukari"],
  "Yobe": ["Bade", "Damaturu", "Geidam", "Nguru", "Potiskum"],
  "Zamfara": ["Bungudu", "Gusau", "Kaura Namoda", "Maru", "Talata Mafara"],
};


const NGA_STATE_BBOX: Record<string, [number,number,number,number]> = {
  "Abia": [222.71,407.85,265.06,471.31],
  "Abuja Federal Capital Territory": [204.60,232.81,251.87,284.25],
  "Adamawa": [432.97,152.69,553.58,337.71],
  "Akwa Ibom": [238.66,435.04,282.90,489.67],
  "Anambra": [195.63,370.87,232.59,426.60],
  "Bauchi": [302.98,70.38,416.30,230.80],
  "Bayelsa": [134.28,442.25,195.96,499.99],
  "Benue": [242.18,297.83,360.23,389.18],
  "Borno": [442.37,8.56,600.00,200.77],
  "Cross River": [257.72,363.44,339.49,478.23],
  "Delta": [114.33,383.98,204.08,461.43],
  "Ebonyi": [240.83,368.44,288.55,426.44],
  "Edo": [116.14,327.30,201.39,423.23],
  "Ekiti": [108.68,300.27,155.12,343.32],
  "Enugu": [208.66,352.77,260.85,413.96],
  "Gombe": [390.55,135.15,458.65,226.73],
  "Imo": [197.55,413.22,237.26,451.93],
  "Jigawa": [272.08,45.30,396.13,153.07],
  "Kaduna": [170.17,122.82,306.65,254.02],
  "Kano": [249.42,66.63,333.78,173.81],
  "Katsina": [208.21,27.75,318.11,143.36],
  "Kebbi": [39.15,32.32,175.79,196.85],
  "Kogi": [131.59,267.64,255.80,381.04],
  "Kwara": [2.50,193.91,176.00,305.65],
  "Lagos": [0.29,373.63,83.89,390.92],
  "Nasarawa": [212.35,236.94,346.66,318.21],
  "Niger": [44.50,129.75,234.58,296.54],
  "Ogun": [0.37,308.53,95.95,394.59],
  "Ondo": [84.26,319.04,165.76,415.88],
  "Osun": [68.08,301.09,118.38,359.05],
  "Oyo": [-0.02,244.26,93.92,353.88],
  "Plateau": [293.40,182.28,397.85,286.97],
  "Rivers": [185.50,426.17,245.19,497.82],
  "Sokoto": [71.68,0.01,205.25,122.49],
  "Taraba": [321.54,222.06,460.05,387.53],
  "Yobe": [348.89,25.84,491.16,172.54],
  "Zamfara": [108.52,36.58,227.96,151.96],
};

const NGA_W = 600;
const NGA_H = 500;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function lerpColor(start: string, end: string, t: number): string {
  const [r1,g1,b1] = hexToRgb(start);
  const [r2,g2,b2] = hexToRgb(end);
  return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
}

type SvgMapProps = {
  values: Record<string, number>;
  metricLabel: string;
  colorStart: string;
  colorEnd: string;
  legendItems?: MapLegendItem[];
  resolveColor?: (value: number) => string;
  formatLegendValue?: (value: number) => string;
  level?: MapLevel;
  activeState?: string;
  onStateClick?: (name: string) => void;
  formatTooltip?: (name: string, value: number) => string;
};

function NigeriaStateSvgMap({
  values,
  metricLabel,
  colorStart,
  colorEnd,
  legendItems,
  resolveColor,
  formatLegendValue,
  activeState,
  onStateClick,
  formatTooltip,
  level,
}: SvgMapProps) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const nums = Object.values(values).filter((v) => v > 0 && Number.isFinite(v));
  const minV = nums.length ? Math.min(...nums) : 0;
  const maxV = nums.length ? Math.max(...nums) : 1;
  const range = maxV - minV || 1;

  const fmtVal = (v: number) =>
    formatLegendValue
      ? formatLegendValue(v)
      : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
      : v >= 1_000   ? `${(v / 1_000).toFixed(1)}k`
      : Math.round(v).toString();

  const getLgaColor = (name: string) => {
    const v = values[name];
    if (!v || !Number.isFinite(v)) return "#f1f5f9"; // light grey — no data
    return resolveColor ? resolveColor(v) : lerpColor(colorStart, colorEnd, (v - minV) / range);
  };

  const getStateColor = (name: string) => {
    const v = values[name];
    if (!v || !Number.isFinite(v)) return "#e2e8f0";
    return resolveColor ? resolveColor(v) : lerpColor(colorStart, colorEnd, (v - minV) / range);
  };

  // ── ViewBox: zoom to active state's bounding box when drilled ────────────
  const viewBox = useMemo<string>(() => {
    if (level === "lga" && activeState && NGA_STATE_BBOX[activeState]) {
      const [bx0, by0, bx1, by1] = NGA_STATE_BBOX[activeState];
      const w = bx1 - bx0;
      const h = by1 - by0;
      // Square-ish padding so even narrow/flat states look big
      const pad = Math.max(w, h) * 0.22;
      return `${bx0 - pad} ${by0 - pad} ${w + pad * 2} ${h + pad * 2}`;
    }
    return `0 0 ${NGA_W} ${NGA_H}`;
  }, [level, activeState]);

  // ── LGA paths for the drilled state ──────────────────────────────────────
  const lgaPaths = useMemo<Record<string, string>>(() => {
    if (level !== "lga" || !activeState) return {};
    const names = NGA_STATE_LGAS[activeState] ?? [];
    const out: Record<string, string> = {};
    names.forEach((n) => { if (NGA_LGA_PATHS[n]) out[n] = NGA_LGA_PATHS[n]; });
    return out;
  }, [level, activeState]);

  const cbTicks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const isDrilled = level === "lga" && !!activeState;
  const tooltipLines = tip?.text.split(/\s(?:—|-)\s/g).filter(Boolean) ?? [];
  const tooltipStyle = useMemo<CSSProperties>(() => {
    if (!tip) return {};

    const width = 300;
    const margin = 16;
    const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
    const estimatedHeight = Math.min(220, 54 + tooltipLines.length * 22);
    const left = Math.min(
      Math.max(tip.x + 16, margin),
      Math.max(margin, viewportWidth - width - margin),
    );
    const top = Math.min(
      Math.max(tip.y + 14, margin),
      Math.max(margin, viewportHeight - estimatedHeight - margin),
    );

    return {
      left,
      top,
      width,
      maxWidth: `calc(100vw - ${margin * 2}px)`,
      background: "#0f172a",
    };
  }, [tip, tooltipLines.length]);

  return (
    <div className="flex h-full w-full" style={{ gap: 16 }}>

      {/* ── Map SVG ──────────────────────────────────────────────────── */}
      <div ref={containerRef} className="relative flex-1 min-w-0 overflow-visible" onMouseLeave={() => setTip(null)}>

        {/* Breadcrumb */}
        {isDrilled && (
          <div className="absolute top-1 left-1 z-10 flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold shadow-sm border border-slate-200 pointer-events-none">
            <span className="text-slate-400">Nigeria</span>
            <span className="text-slate-300">›</span>
            <span className="text-slate-800">{displayLocationLabel(activeState, "state")}</span>
          </div>
        )}

        <svg
          viewBox={viewBox}
          style={{ width: "100%", height: "100%", display: "block" }}
          preserveAspectRatio="xMidYMid meet"
        >
          {!isDrilled ? (
            /* ── NATIONAL VIEW: 37 state polygons, click to drill ── */
            Object.entries(NGA_PATHS).map(([name, d]) => (
              <path
                key={name}
                d={d}
                fill={getStateColor(name)}
                stroke="#ffffff"
                strokeWidth={0.8}
                strokeLinejoin="round"
                style={{ cursor: "pointer", transition: "fill 0.25s" }}
                onClick={() => onStateClick?.(name)}
                onMouseEnter={(e: ReactMouseEvent<SVGPathElement>) => {
                  const v = values[name] ?? 0;
                  const text = formatTooltip ? formatTooltip(name, v) : `${displayLocationLabel(name, "state")}: ${fmtVal(v)}`;
                  setTip({ x: e.clientX, y: e.clientY, text });
                }}
                onMouseMove={(e: ReactMouseEvent<SVGPathElement>) => setTip((p) => p ? { ...p, x: e.clientX, y: e.clientY } : null)}
                onMouseLeave={() => setTip(null)}
              />
            ))
          ) : (
            /* ── DRILLED VIEW: state outline + LGA fills inside ── */
            <>
              {/* 1. State outline as background (shows full state shape) */}
              <path
                d={NGA_PATHS[activeState] ?? ""}
                fill="#f8fafc"
                stroke="#cbd5e1"
                strokeWidth={1.5}
                strokeLinejoin="round"
              />

              {/* 2. LGA polygons drawn ON TOP — each colored by value */}
              {Object.entries(lgaPaths).map(([name, d]) => {
                const hasVal = values[name] != null && Number.isFinite(values[name]) && values[name] > 0;
                return (
                  <path
                    key={name}
                    d={d}
                    fill={getLgaColor(name)}
                    stroke="#ffffff"
                    strokeWidth={0.5}
                    strokeLinejoin="round"
                    style={{ cursor: "default", transition: "fill 0.2s" }}
                    onMouseEnter={(e: ReactMouseEvent<SVGPathElement>) => {
                      if (!hasVal) { setTip(null); return; }
                      const text = formatTooltip
                        ? formatTooltip(name, values[name])
                        : `${displayLocationLabel(name, level)}: ${fmtVal(values[name])}`;
                      setTip({ x: e.clientX, y: e.clientY, text });
                    }}
                    onMouseMove={(e: ReactMouseEvent<SVGPathElement>) => setTip((p) => p ? { ...p, x: e.clientX, y: e.clientY } : null)}
                    onMouseLeave={() => setTip(null)}
                  />
                );
              })}

              {/* 3. State border redrawn on top so it's crisp */}
              <path
                d={NGA_PATHS[activeState] ?? ""}
                fill="none"
                stroke="#64748b"
                strokeWidth={1.8}
                strokeLinejoin="round"
              />
            </>
          )}
        </svg>

        {/* Tooltip */}
        {tip && tooltipLines.length ? (
          <div
            className="pointer-events-none fixed z-[9999] rounded-xl border border-slate-600 shadow-2xl"
            style={tooltipStyle}
          >
            <div className="px-3.5 pb-3 pt-3">
              <div className="text-[13px] font-bold leading-tight text-white">{tooltipLines[0]}</div>
              {tooltipLines.slice(1).map((line, index) => (
                <div key={`${line}-${index}`} className="mt-1 text-[11px] leading-snug text-slate-300">
                  {line}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Colorbar ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-col" style={{ width: legendItems?.length ? 158 : 84, paddingTop: 4, paddingBottom: 8 }}>
        <div className="text-[10px] font-semibold text-slate-500 mb-3 leading-snug text-center"
          style={{ wordBreak: "break-word" }}>
          {metricLabel}
        </div>
        {legendItems?.length ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="space-y-2.5">
              {legendItems.map((item) => (
                <div key={`${item.label}-${item.color}`} className="flex items-center gap-2.5">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: item.color }} />
                  <span className="text-[11px] font-medium leading-snug text-slate-600">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative flex-1" style={{ minHeight: 240 }}>
            <div className="absolute rounded-md"
              style={{ left: 8, top: 0, bottom: 0, width: 26,
                background: `linear-gradient(to top, ${colorStart}, ${colorEnd})`,
                boxShadow: "0 1px 4px rgba(0,0,0,0.18)" }} />
            {cbTicks.map((t) => {
              const val = minV + t * range;
              return (
                <div key={t} className="absolute flex items-center"
                  style={{ top: `${(1-t)*100}%`, transform: "translateY(-50%)", left: 8 }}>
                  <div style={{ width: 26 }} />
                  <div className="bg-slate-400" style={{ width: 7, height: 1.5, marginLeft: 3 }} />
                  <span className="font-medium text-slate-600 whitespace-nowrap"
                    style={{ fontSize: 11, marginLeft: 4 }}>{fmtVal(val)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

type MapChartCardProps = {
  title: string;
  explanation: string;
  note?: string;
  mapData: {
    level: MapLevel;
    values: Record<string, number>;
    metricLabel: string;
    colorStart: string;
    colorEnd: string;
    legendItems?: MapLegendItem[];
    resolveColor?: (value: number) => string;
    formatLegendValue?: (value: number) => string;
    formatTooltip: (name: string, value: number) => string;
  } | null;
  drill: DrillState;
  onReset: () => void;
  onStateClick: (name: string) => void;
};

// MapExpandState is declared right before MapChartCard

type MapExpandState = { title: string } | null;

function MapChartCard({ title, explanation, note, mapData, drill, onReset, onStateClick }: MapChartCardProps) {
  const [showHelp, setShowHelp] = useState(false);
  const [expanded, setExpanded] = useState<MapExpandState>(null);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpPanelRef = useRef<HTMLDivElement | null>(null);
  const expandRef = useOutsideClose<HTMLDivElement>(!!expanded, () => setExpanded(null));
  const drillLabel = drill.state ? `↳ ${displayLocationLabel(drill.state, "state")} (state drill active)` : "Click a state to drill deeper";

  useEffect(() => {
    if (!showHelp) return undefined;

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (helpButtonRef.current?.contains(target)) return;
      if (helpPanelRef.current?.contains(target)) return;
      setShowHelp(false);
    };

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [showHelp]);

  return (
    <>
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3">
          <div>
            <div className="text-sm font-bold text-slate-900">{title}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">{drillLabel}</div>
            {note ? <div className="mt-1 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">{note}</div> : null}
          </div>
          <div className="flex items-center gap-2">
            <div
              className="relative"
              onMouseEnter={() => setShowHelp(true)}
              onMouseLeave={() => setShowHelp(false)}
            >
              <button
                ref={helpButtonRef}
                type="button"
                onFocus={() => setShowHelp(true)}
                onBlur={() => setShowHelp(false)}
                className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
              {showHelp ? (
                <div
                  ref={helpPanelRef}
                  className="absolute right-0 top-10 z-20 w-[290px] rounded-xl bg-slate-950 px-4 py-3 text-xs leading-5 text-white shadow-2xl"
                  onMouseEnter={() => setShowHelp(true)}
                  onMouseLeave={() => setShowHelp(false)}
                >
                  {explanation}
                </div>
              ) : null}
            </div>
            <button type="button" onClick={onReset}
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800" title="Reset to national view">
              <RotateCw className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setExpanded({ title })}
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800" title="Expand map">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="p-4" style={{ height: 380 }}>
          {mapData ? (
            <NigeriaStateSvgMap
              values={mapData.values}
              metricLabel={mapData.metricLabel}
              colorStart={mapData.colorStart}
              colorEnd={mapData.colorEnd}
              legendItems={mapData.legendItems}
              resolveColor={mapData.resolveColor}
              formatLegendValue={mapData.formatLegendValue}
              level={mapData.level}
              activeState={drill.state}
              onStateClick={onStateClick}
              formatTooltip={mapData.formatTooltip}
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-slate-400">Loading map…</div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => setExpanded(null)}>
          <div ref={expandRef} className="w-full max-w-[1120px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e: ReactMouseEvent<HTMLDivElement>) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <div className="text-base font-bold text-slate-900">{expanded.title}</div>
                <div className="mt-0.5 text-xs text-slate-400">{drill.state ? `↳ ${displayLocationLabel(drill.state, "state")} — state drill active` : "National state view — click a state to drill"}</div>
              </div>
              <button type="button" onClick={() => setExpanded(null)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4" style={{ height: 620, maxHeight: "78vh" }}>
              {mapData ? (
                <NigeriaStateSvgMap
                  values={mapData.values}
                  metricLabel={mapData.metricLabel}
                  colorStart={mapData.colorStart}
                  colorEnd={mapData.colorEnd}
                  legendItems={mapData.legendItems}
                  resolveColor={mapData.resolveColor}
                  formatLegendValue={mapData.formatLegendValue}
                  level={mapData.level}
                  activeState={drill.state}
                  onStateClick={onStateClick}
                  formatTooltip={mapData.formatTooltip}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


export default function AccessCoverageDashboard({
  filters,
  setFilters,
  dimSessions,
  disabilityMode,
}: {
  filters: MinisterFilters;
  setFilters: Dispatch<SetStateAction<MinisterFilters>>;
  dimSessions: DimSession[];
  disabilityMode: boolean;
}) {
  const [wardRows, setWardRows] = useState<AccessWardRow[]>([]);
  const [teacherRows, setTeacherRows] = useState<TeacherCapacityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [densityDrill, setDensityDrill] = useState<DrillState>({});
  const [densityPrivateDrill, setDensityPrivateDrill] = useState<DrillState>({});
  const [computerDrill, setComputerDrill] = useState<DrillState>({});
  const [infrastructureDrill, setInfrastructureDrill] = useState<DrillState>({});
  const [schoolCountDrill, setSchoolCountDrill] = useState<DrillState>({});
  const [studentCountDrill, setStudentCountDrill] = useState<DrillState>({});
  const [keyEntryStateDrill, setKeyEntryStateDrill] = useState<DrillState>({});
  const [classroomStateDrill, setClassroomStateDrill] = useState<DrillState>({});
  const [pendingDensityCombinedState, setPendingDensityCombinedState] = useState<string | null>(null);
  const [densityMapResetting, setDensityMapResetting] = useState(false);

  const resetLinkedStateDrills = () => {
    setPendingDensityCombinedState(null);
    setDensityDrill({});
    setDensityPrivateDrill({});
    setComputerDrill({});
    setInfrastructureDrill({});
    setSchoolCountDrill({});
    setStudentCountDrill({});
    setKeyEntryStateDrill({});
    setClassroomStateDrill({});
  };

  const clearLocationSelection = () => {
    setDensityMapResetting(true);
    resetLinkedStateDrills();
    setFilters((previous: MinisterFilters) => ({ ...previous, zone: "", state: "", lga: "", ward: "", school: "" }));
  };
  const [expandState, setExpandState] = useState<ExpandState>(null);
  const [chartSortModes, setChartSortModes] = useState<Partial<Record<ChartKey, SortMode>>>({});
  const requestedScopeKey = useMemo(
    () => `${canonicalState(filters.state)}|${filters.lga}|${filters.ward}|${filters.school}`,
    [filters.state, filters.lga, filters.ward, filters.school],
  );
  const [loadedScopeKey, setLoadedScopeKey] = useState(requestedScopeKey);
  const [loadedLocation, setLoadedLocation] = useState({
    zone: filters.zone,
    state: filters.state,
    lga: filters.lga,
    ward: filters.ward,
    school: filters.school,
  });
  const scopePending = requestedScopeKey !== loadedScopeKey;
  const renderFilters = useMemo(
    () => (scopePending ? { ...filters, ...loadedLocation } : filters),
    [scopePending, filters, loadedLocation],
  );

  const expandedPanelRef = useOutsideClose<HTMLDivElement>(Boolean(expandState), () => setExpandState(null));
  const sortModeFor = (key: ChartKey): SortMode => chartSortModes[key] ?? DEFAULT_SORT_MODE;
  const setSortModeFor = (key: ChartKey, value: SortMode) => {
    setChartSortModes((previous) => ({ ...previous, [key]: value }));
  };
  const stateSortControl = (key: ChartKey, enabled: boolean): ReactNode =>
    enabled ? <ChartSortControl value={sortModeFor(key)} onChange={(value) => setSortModeFor(key, value)} /> : null;

  const locationFiltersAreClear = !filters.zone && !filters.state && !filters.lga && !filters.ward && !filters.school;
  const hasDrillLocation = (drill: DrillState): boolean => Boolean(drill.state || drill.lga || drill.ward || drill.school);

  const stableDrillForLoadedScope = (drill: DrillState): DrillState => {
    if (locationFiltersAreClear) return {};
    if (!scopePending) return drill;
    if (!filters.state && !filters.lga && !filters.ward && !filters.school) return {};
    const stable: DrillState = {};
    if (drill.state && loadedLocation.state === drill.state) {
      stable.state = drill.state;
    } else if (loadedLocation.state) {
      stable.state = loadedLocation.state;
    }
    if (!stable.state) return stable;
    if (drill.lga && loadedLocation.lga === drill.lga) {
      stable.lga = drill.lga;
    } else if (loadedLocation.lga) {
      stable.lga = loadedLocation.lga;
    }
    if (!stable.lga) return stable;
    if (drill.ward && loadedLocation.ward === drill.ward) {
      stable.ward = drill.ward;
    } else if (loadedLocation.ward) {
      stable.ward = loadedLocation.ward;
    }
    return stable;
  };

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const depth = scopeDepthForLocation(filters);
        const [topWardData, scopedWardData, topTeacherData, scopedTeacherData] = await Promise.all([
          loadRefinedFile<AccessWardRow>("pages/access_coverage/top_rollup.csv"),
          loadRefinedScopedRows<AccessWardRow>("access_coverage", filters.state, depth),
          loadRefinedFile<TeacherCapacityRow>("pages/teacher_capacity/top_rollup.csv"),
          loadRefinedScopedRows<TeacherCapacityRow>("teacher_capacity", filters.state, depth),
        ]);

        if (!active) return;
        const filteredTopWardData = filterRowsBySessionWindow(
          topWardData,
          BASIC_SECONDARY_SESSIONS,
        );
        const filteredScopedWardData = filterRowsBySessionWindow(
          scopedWardData,
          BASIC_SECONDARY_SESSIONS,
        );
        setWardRows(
          filters.state
            ? [...filteredTopWardData, ...filteredScopedWardData]
            : filteredScopedWardData,
        );
        const filteredTopTeacherData = filterRowsBySessionWindow(
          topTeacherData,
          BASIC_SECONDARY_SESSIONS,
        );
        const filteredScopedTeacherData = filterRowsBySessionWindow(
          scopedTeacherData,
          BASIC_SECONDARY_SESSIONS,
        );
        setTeacherRows(
          filters.state
            ? [...filteredTopTeacherData, ...filteredScopedTeacherData]
            : filteredScopedTeacherData,
        );
        setLoadedScopeKey(requestedScopeKey);
        setLoadedLocation({
          zone: filters.zone,
          state: filters.state,
          lga: filters.lga,
          ward: filters.ward,
          school: filters.school,
        });
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load Access & Coverage data");
        setTeacherRows([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [filters.zone, filters.state, filters.lga, filters.ward, filters.school, requestedScopeKey]);

  useEffect(() => {
    if (!locationFiltersAreClear) return;

    setPendingDensityCombinedState(null);
    setDensityDrill((previous) => (hasDrillLocation(previous) ? {} : previous));
    setDensityPrivateDrill((previous) => (hasDrillLocation(previous) ? {} : previous));
    setComputerDrill((previous) => (hasDrillLocation(previous) ? {} : previous));
    setInfrastructureDrill((previous) => (hasDrillLocation(previous) ? {} : previous));
    setSchoolCountDrill((previous) => (hasDrillLocation(previous) ? {} : previous));
    setStudentCountDrill((previous) => (hasDrillLocation(previous) ? {} : previous));
    setKeyEntryStateDrill((previous) => (hasDrillLocation(previous) ? {} : previous));
    setClassroomStateDrill((previous) => (hasDrillLocation(previous) ? {} : previous));
  }, [locationFiltersAreClear]);

  useEffect(() => {
    if (!densityMapResetting) return;
    if (loading || scopePending) return;
    if (!locationFiltersAreClear) return;
    setDensityMapResetting(false);
  }, [densityMapResetting, loading, scopePending, locationFiltersAreClear]);

  useEffect(() => {
    if (densityMapResetting) return;
    if (!pendingDensityCombinedState) return;
    if (scopePending || loading) return;
    if (canonicalState(filters.state) !== canonicalState(pendingDensityCombinedState)) return;

    const nextDrill = { state: sourceLocationLabel(pendingDensityCombinedState) };
    setDensityDrill(nextDrill);
    setDensityPrivateDrill(nextDrill);
    setComputerDrill(nextDrill);
    setInfrastructureDrill(nextDrill);
    setSchoolCountDrill(nextDrill);
    setStudentCountDrill(nextDrill);
    setKeyEntryStateDrill(nextDrill);
    setClassroomStateDrill(nextDrill);
    setPendingDensityCombinedState(null);
  }, [pendingDensityCombinedState, scopePending, loading, filters.state, densityMapResetting]);

  useEffect(() => {
    // Reset chart-level drills when non-location global filters change
    setSchoolCountDrill({});
    setStudentCountDrill({});
    setKeyEntryStateDrill({});
    setClassroomStateDrill({});
  }, [filters.session, filters.zone, filters.gender, filters.school_type, filters.school_level, filters.class_grade, disabilityMode]);

  // Map drills reset when session changes (but not when state/lga changes —
  // map drills ARE the mechanism that sets those filters)
  useEffect(() => {
    setDensityDrill({});
    setDensityPrivateDrill({});
    setComputerDrill({});
    setInfrastructureDrill({});
  }, [filters.session, disabilityMode]);

  const previousSession = useMemo(
    () => dimSessions.find((item) => item.session_id === filters.session)?.prev_session_id ?? "",
    [dimSessions, filters.session],
  );

  const expectedLocLevel = useMemo<"state" | "lga" | "ward" | "school">(
    () => expectedLocLevelForLocation(renderFilters),
    [renderFilters],
  );

  const baseRows = useMemo(() => {
    return wardRows.filter((row) => {
      if (renderFilters.zone && row.zone !== renderFilters.zone) return false;
      if (renderFilters.state && canonicalState(row.state) !== canonicalState(renderFilters.state)) return false;
      if (renderFilters.lga && row.lga !== renderFilters.lga) return false;
      if (renderFilters.ward && row.ward !== renderFilters.ward) return false;
      if (row.loc_level && row.loc_level.toLowerCase() !== expectedLocLevel) return false;
      if (renderFilters.gender && row.gender !== renderFilters.gender) return false;
      if (renderFilters.school && !rowIncludesSchool(row, renderFilters.school)) return false;
      if (renderFilters.school_type && row.school_type !== renderFilters.school_type) return false;
      if (renderFilters.school_level && row.school_level !== renderFilters.school_level) return false;
      if (renderFilters.class_grade && row.class_grade !== renderFilters.class_grade) return false;
      if (disabilityMode ? row.disability !== "Disabled" : row.disability === "Disabled") return false;
      return true;
    });
  }, [wardRows, renderFilters, disabilityMode, expectedLocLevel]);

  const currentRowsRaw = useMemo(() => baseRows.filter((row) => row.session === filters.session), [baseRows, filters.session]);

  const teacherBaseRows = useMemo(() => {
    return teacherRows.filter((row) => {
      if (renderFilters.zone && row.zone !== renderFilters.zone) return false;
      if (renderFilters.state && canonicalState(row.state) !== canonicalState(renderFilters.state)) return false;
      if (renderFilters.lga && row.lga !== renderFilters.lga) return false;
      if (renderFilters.ward && row.ward !== renderFilters.ward) return false;
      if (row.loc_level && row.loc_level.toLowerCase() !== expectedLocLevel) return false;
      if (renderFilters.gender && row.gender !== renderFilters.gender) return false;
      if (renderFilters.school && !splitSchoolNames(row.school).includes(renderFilters.school)) return false;
      if (renderFilters.school_type && row.school_type !== renderFilters.school_type) return false;
      if (!schoolLevelMatches(row.school_level, renderFilters.school_level)) return false;
      if (renderFilters.class_grade && row.class_grade !== renderFilters.class_grade) return false;
      if (disabilityMode ? row.disability !== "Disabled" : row.disability === "Disabled") return false;
      return true;
    });
  }, [teacherRows, renderFilters, disabilityMode, expectedLocLevel]);

  const currentTeacherRows = useMemo(
    () => teacherBaseRows.filter((row) => row.session === filters.session),
    [teacherBaseRows, filters.session],
  );

  // All charts must follow the fully filtered current session view so every filter
  // and every chart drill affects every other chart consistently.
  const previousRowsRaw = useMemo(
    () => (previousSession ? baseRows.filter((row) => row.session === previousSession) : []),
    [baseRows, previousSession],
  );

  const [lastNonEmptyCurrentRows, setLastNonEmptyCurrentRows] = useState<AccessWardRow[]>([]);
  const [lastNonEmptyPreviousRows, setLastNonEmptyPreviousRows] = useState<AccessWardRow[]>([]);

  useEffect(() => {
    if (currentRowsRaw.length) setLastNonEmptyCurrentRows(currentRowsRaw);
  }, [currentRowsRaw]);

  useEffect(() => {
    if (previousRowsRaw.length) setLastNonEmptyPreviousRows(previousRowsRaw);
  }, [previousRowsRaw]);

  const currentRows = useMemo(
    () => ((loading || scopePending) && !currentRowsRaw.length && lastNonEmptyCurrentRows.length ? lastNonEmptyCurrentRows : currentRowsRaw),
    [loading, scopePending, currentRowsRaw, lastNonEmptyCurrentRows],
  );
  const sessionRows = currentRows;
  const allStateLabels = useMemo(
    () => Object.keys(NGA_PATHS).sort((left, right) => compareLocationLabels(left, right, "state")),
    [],
  );
  const nationalMapRows = useMemo(() => {
    return wardRows.filter((row) => {
      if (row.session !== filters.session) return false;
      if (row.loc_level && row.loc_level.toLowerCase() !== "state") return false;
      if (filters.gender && row.gender !== filters.gender) return false;
      if (filters.school_type && row.school_type !== filters.school_type) return false;
      if (!schoolLevelMatches(row.school_level, filters.school_level)) return false;
      if (filters.class_grade && row.class_grade !== filters.class_grade) return false;
      if (disabilityMode ? row.disability !== "Disabled" : row.disability === "Disabled") return false;
      return true;
    });
  }, [wardRows, filters.session, filters.gender, filters.school_type, filters.school_level, filters.class_grade, disabilityMode]);
  const previousRows = useMemo(
    () => ((loading || scopePending) && !previousRowsRaw.length && lastNonEmptyPreviousRows.length ? lastNonEmptyPreviousRows : previousRowsRaw),
    [loading, scopePending, previousRowsRaw, lastNonEmptyPreviousRows],
  );
  const uniqueSchoolFacilityCount = (rows: AccessWardRow[]): number => {
    const seen = new Map<string, number>();
    rows.forEach((row) => {
      trackSchoolCount(seen, row);
    });
    return sumTrackedSchoolCounts(seen);
  };

  const cardMetrics = useMemo(() => {
    const sumStudents = (predicate: (row: AccessWardRow) => boolean) =>
      currentRows.filter(predicate).reduce((sum, row) => sum + safeNum(row.student_count), 0);
    const countSchools = (predicate: (row: AccessWardRow) => boolean) => {
      const seen = new Map<string, number>();
      currentRows.filter(predicate).forEach((row) => trackSchoolCount(seen, row));
      return sumTrackedSchoolCounts(seen);
    };
    const sumTeachers = (predicate: (row: TeacherCapacityRow) => boolean) =>
      currentTeacherRows.filter(predicate).reduce((sum, row) => sum + safeNum(row.teacher_count), 0);
    const sumTeacherStudents = (predicate: (row: TeacherCapacityRow) => boolean) =>
      currentTeacherRows.filter(predicate).reduce((sum, row) => sum + safeNum(row.student_count), 0);
    const teacherRatio = (predicate: (row: TeacherCapacityRow) => boolean) => {
      const teachers = sumTeachers(predicate);
      if (teachers <= 0) return 0;
      return sumTeacherStudents(predicate) / teachers;
    };

    const isPublic = (row: AccessWardRow | TeacherCapacityRow) => row.school_type === "Public";
    const isPrivate = (row: AccessWardRow | TeacherCapacityRow) => row.school_type === "Private";
    const isPrimary = (row: AccessWardRow | TeacherCapacityRow) =>
      row.school_level === "Pre-Primary/Primary" || row.school_level === "Pre/Primary";
    const isJss = (row: AccessWardRow | TeacherCapacityRow) => row.school_level === "JSS";
    const isSss = (row: AccessWardRow | TeacherCapacityRow) => row.school_level === "SSS";
    const isFormalSecondary = (row: AccessWardRow | TeacherCapacityRow) => isJss(row) || isSss(row);
    const isVocational = (row: AccessWardRow | TeacherCapacityRow) => row.school_level === "Vocational";
    const isNonFormal = (row: AccessWardRow | TeacherCapacityRow) =>
      row.school_level === "Adult & Non-Formal" || row.school_level === "Adult & Non-Formal Education";
    const isSecondaryOrAlternative = (row: AccessWardRow) =>
      isFormalSecondary(row) || isVocational(row) || isNonFormal(row);
    const isBasicAndSeniorSecondary = (row: AccessWardRow) => isPrimary(row) || isJss(row) || isSss(row);

    const totalStudents = sumStudents(isBasicAndSeniorSecondary);
    const totalTeachers = sumTeachers(() => true);

    const cards: MetricCard[] = [
      {
        label: "Total Students Basic & Senior Secondary",
        value: totalStudents,
        delta: null,
        accent: "#2563eb",
        bg: "rgba(37,99,235,0.12)",
        icon: <Users className="h-5 w-5" />,
        help: "Basic and senior secondary student breakdown by school ownership.",
        breakdown: [
          { label: "Public", value: sumStudents((row) => isBasicAndSeniorSecondary(row) && isPublic(row)) },
          { label: "Private", value: sumStudents((row) => isBasicAndSeniorSecondary(row) && isPrivate(row)) },
        ],
        showDelta: false,
      },
      {
        label: "Total Student Pre & Primary",
        value: sumStudents(isPrimary),
        delta: null,
        accent: "#10b981",
        bg: "rgba(16,185,129,0.12)",
        icon: <GraduationCap className="h-5 w-5" />,
        help: "Pre-primary and primary student breakdown.",
        breakdown: [
          { label: "Public", value: sumStudents((row) => isPrimary(row) && isPublic(row)) },
          { label: "Private", value: sumStudents((row) => isPrimary(row) && isPrivate(row)) },
        ],
        showDelta: false,
      },
      {
        label: "Total Student JSS",
        value: sumStudents(isJss),
        delta: null,
        accent: "#0ea5e9",
        bg: "rgba(14,165,233,0.12)",
        icon: <School className="h-5 w-5" />,
        help: "Junior secondary student breakdown.",
        breakdown: [
          { label: "Public", value: sumStudents((row) => isJss(row) && isPublic(row)) },
          { label: "Private", value: sumStudents((row) => isJss(row) && isPrivate(row)) },
        ],
        showDelta: false,
      },
      {
        label: "Total Student SSS",
        value: sumStudents(isSss),
        delta: null,
        accent: "#8b5cf6",
        bg: "rgba(139,92,246,0.12)",
        icon: <BookOpen className="h-5 w-5" />,
        help: "Senior secondary student breakdown.",
        breakdown: [
          { label: "Public", value: sumStudents((row) => isSss(row) && isPublic(row)) },
          { label: "Private", value: sumStudents((row) => isSss(row) && isPrivate(row)) },
        ],
        showDelta: false,
      },
      {
        label: "Total Student Non Formal",
        value: sumStudents(isNonFormal),
        delta: null,
        accent: "#7c3aed",
        bg: "rgba(124,58,237,0.12)",
        icon: <GraduationCap className="h-5 w-5" />,
        help: "Adult and non-formal student breakdown.",
        breakdown: [
          { label: "Public", value: sumStudents((row) => isNonFormal(row) && isPublic(row)) },
          { label: "Private", value: sumStudents((row) => isNonFormal(row) && isPrivate(row)) },
        ],
        showDelta: false,
      },
      {
        label: "Total Schools",
        value: countSchools(() => true),
        delta: null,
        accent: "#0891b2",
        bg: "rgba(8,145,178,0.12)",
        icon: <School className="h-5 w-5" />,
        help: "Breakdown by school ownership.",
        breakdown: [
          { label: "Private", value: countSchools(isPrivate) },
          { label: "Public", value: countSchools(isPublic) },
        ],
        showDelta: false,
      },
      {
        label: "Total Primary Schools",
        value: countSchools(isPrimary),
        delta: null,
        accent: "#2563eb",
        bg: "rgba(37,99,235,0.12)",
        icon: <Landmark className="h-5 w-5" />,
        help: "Pre-primary and primary school breakdown.",
        breakdown: [
          { label: "Private", value: countSchools((row) => isPrimary(row) && isPrivate(row)) },
          { label: "Public", value: countSchools((row) => isPrimary(row) && isPublic(row)) },
        ],
        showDelta: false,
      },
      {
        label: "Total Secondary Schools",
        value: countSchools(isSecondaryOrAlternative),
        delta: null,
        accent: "#f59e0b",
        bg: "rgba(245,158,11,0.14)",
        icon: <Building2 className="h-5 w-5" />,
        help: "Secondary, technical/vocational, and non-formal school breakdown.",
        breakdown: [
          { label: "Private", value: countSchools((row) => isFormalSecondary(row) && isPrivate(row)) },
          { label: "Public", value: countSchools((row) => isFormalSecondary(row) && isPublic(row)) },
          { label: "SVT", value: countSchools(isVocational) },
          { label: "Non-Formal", value: countSchools(isNonFormal) },
        ],
        showDelta: false,
      },
      {
        label: "Total Teachers",
        value: totalTeachers,
        delta: null,
        accent: "#0f766e",
        bg: "rgba(15,118,110,0.12)",
        icon: <Users className="h-5 w-5" />,
        help: "Teacher breakdown by school level.",
        breakdown: [
          { label: "Primary", value: sumTeachers(isPrimary) },
          { label: "Secondary", value: sumTeachers(isFormalSecondary) },
        ],
        showDelta: false,
      },
      {
        label: "Teacher Ratio",
        value: totalTeachers > 0 ? sumTeacherStudents(() => true) / totalTeachers : 0,
        valueType: "ratio",
        delta: null,
        accent: "#be123c",
        bg: "rgba(190,18,60,0.10)",
        icon: <GraduationCap className="h-5 w-5" />,
        help: "Learner-to-teacher ratio breakdown.",
        breakdown: [
          { label: "Public", value: teacherRatio(isPublic), valueType: "ratio" },
          { label: "Private", value: teacherRatio(isPrivate), valueType: "ratio" },
          { label: "Primary", value: teacherRatio(isPrimary), valueType: "ratio" },
          { label: "Secondary", value: teacherRatio(isFormalSecondary), valueType: "ratio" },
        ],
        showDelta: false,
      },
    ];

    return cards;
  }, [currentRows, currentTeacherRows, renderFilters, disabilityMode]);

  const metricCardValue = (label: string): number => cardMetrics.find((card) => card.label === label)?.value ?? 0;
  const totalStudentsBasicSeniorSecondary = metricCardValue("Total Students Basic & Senior Secondary");
  const totalSchoolsCardValue = metricCardValue("Total Schools");
  const totalPrimarySchoolsCardValue = metricCardValue("Total Primary Schools");
  const totalSecondarySchoolsCardValue = metricCardValue("Total Secondary Schools");

  const stateGroups = useMemo(() => aggregateBy(sessionRows, "state").sort((a, b) => compareLocationLabels(a.label, b.label, "state")), [sessionRows]);
  const zoneGroups = useMemo(() => aggregateBy(sessionRows, "zone").sort((a, b) => a.label.localeCompare(b.label)), [sessionRows]);
  const accessStateZoneByState = useMemo(() => {
    const lookup = new Map<string, string>();
    wardRows.forEach((row) => {
      const state = canonicalState(row.state);
      if (state && row.zone) lookup.set(state, row.zone);
    });
    return lookup;
  }, [wardRows]);
  const zoneForAccessState = (state: string): string => accessStateZoneByState.get(canonicalState(state)) ?? "";

  useEffect(() => {
    const selectedState = canonicalState(filters.state);
    if (!selectedState) return;
    const nextZone = accessStateZoneByState.get(selectedState);
    if (!nextZone || filters.zone === nextZone) return;
    setFilters((previous: MinisterFilters) => (
      canonicalState(previous.state) === selectedState && previous.zone !== nextZone
        ? { ...previous, zone: nextZone }
        : previous
    ));
  }, [filters.state, filters.zone, accessStateZoneByState, setFilters]);

  const renderDensityDrill = densityMapResetting || locationFiltersAreClear ? {} : stableDrillForLoadedScope(densityDrill);
  const renderDensityPrivateDrill = stableDrillForLoadedScope(densityPrivateDrill);
  const renderComputerDrill = stableDrillForLoadedScope(computerDrill);
  const renderInfrastructureDrill = stableDrillForLoadedScope(infrastructureDrill);
  const renderSchoolCountDrill = stableDrillForLoadedScope(schoolCountDrill);
  const renderStudentCountDrill = stableDrillForLoadedScope(studentCountDrill);
  const renderKeyEntryStateDrill = stableDrillForLoadedScope(keyEntryStateDrill);
  const renderClassroomStateDrill = stableDrillForLoadedScope(classroomStateDrill);

  const syncFiltersForDrill = (level: LocationLevel, label: string) => {
    setFilters((previous: MinisterFilters) => {
      const resolvedLabel = level === "state" ? sourceLocationLabel(label) : label;
      if (!label) {
        // Empty = clear that level downward
        if (level === "state") return { ...previous, zone: "", state: "", lga: "", ward: "", school: "" };
        if (level === "lga") return { ...previous, lga: "", ward: "", school: "" };
        if (level === "ward") return { ...previous, ward: "", school: "" };
        if (level === "school") return { ...previous, school: "" };
        return previous;
      }
      if (level === "state") {
        const nextZone = zoneForAccessState(resolvedLabel);
        if (previous.state === resolvedLabel && !previous.lga && !previous.ward && (!nextZone || previous.zone === nextZone)) return previous;
        return { ...previous, zone: nextZone || previous.zone, state: resolvedLabel, lga: "", ward: "", school: "" };
      }
      if (level === "lga") {
        if (previous.lga === resolvedLabel && !previous.ward) return previous;
        return { ...previous, lga: resolvedLabel, ward: "", school: "" };
      }
      if (level === "ward") {
        if (previous.ward === resolvedLabel && !previous.school) return previous;
        return { ...previous, ward: resolvedLabel, school: "" };
      }
      if (level === "school") {
        if (previous.school === resolvedLabel) return previous;
        return { ...previous, school: resolvedLabel };
      }
      if (level === "zone") {
        if (previous.zone === resolvedLabel && !previous.state && !previous.lga && !previous.ward) return previous;
        return { ...previous, zone: resolvedLabel, state: "", lga: "", ward: "", school: "" };
      }
      return previous;
    });
  };

  const applyChartDrill = (drill: DrillState, setDrill: Dispatch<SetStateAction<DrillState>>, label: string) => {
    const nextDrill = buildDrillFromSelection(sessionRows, drill, label);
    if (JSON.stringify(nextDrill) === JSON.stringify(drill)) return;
    setDrill(nextDrill);

    // Sync every location level that changed to global filters — all charts & cards react.
    if (!drill.state && nextDrill.state) {
      syncFiltersForDrill("state", nextDrill.state);
      // Also push map drills to match the selected state so maps zoom in too
      setDensityDrill((prev: DrillState) => prev.state === nextDrill.state ? prev : { state: nextDrill.state });
      setComputerDrill((prev: DrillState) => prev.state === nextDrill.state ? prev : { state: nextDrill.state });
      setInfrastructureDrill((prev: DrillState) => prev.state === nextDrill.state ? prev : { state: nextDrill.state });
    } else if (drill.state && !drill.lga && nextDrill.lga) {
      syncFiltersForDrill("lga", nextDrill.lga);
      // Maps stay at LGA level — they're already showing that state's LGAs. No change needed.
    } else if (drill.lga && !drill.ward && nextDrill.ward) {
      setFilters((prev: MinisterFilters) => ({ ...prev, state: nextDrill.state ?? prev.state, lga: nextDrill.lga ?? prev.lga, ward: nextDrill.ward ?? "" }));
    }
  };

  const buildStateDrillRows = (drill: DrillState): AggregatedGroup[] => {
    const scopedRows = filterRowsByDrill(sessionRows, drill);
    const level = getNextChartLevel(drill);
    if (level === "state") return stateGroups;
    if (level === "lga") return aggregateBy(scopedRows, "lga").sort((a, b) => a.label.localeCompare(b.label));
    return [...new Set(scopedRows.map((row) => row.ward).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((label) => ({ label, metrics: mergeMetrics(scopedRows.filter((row) => row.ward === label)) }));
  };

  const buildPublicPrivateCountChart = (metric: "schools" | "students", drill: DrillState, sortMode: SortMode): { bundle: ChartBundle; level: "state" | "lga" | "ward" | "school" } => {
    const nextLevel = getNextChartLevel(drill);
    const scopedRows = filterRowsByDrill(sessionRows, drill);
    const groups = buildStateDrillRows(drill);

    const publicRows = scopedRows.filter((row) => row.school_type === "Public");
    const privateRows = scopedRows.filter((row) => row.school_type === "Private");
    const publicGroups = nextLevel === "state" ? aggregateBy(publicRows, "state") : nextLevel === "lga" ? aggregateBy(publicRows, "lga") : nextLevel === "ward" ? [...new Set(publicRows.map((row) => row.ward).filter(Boolean))].map((label) => ({ label, metrics: mergeMetrics(publicRows.filter((row) => row.ward === label)) })) : buildSchoolAllocationRows(publicRows);
    const privateGroups = nextLevel === "state" ? aggregateBy(privateRows, "state") : nextLevel === "lga" ? aggregateBy(privateRows, "lga") : nextLevel === "ward" ? [...new Set(privateRows.map((row) => row.ward).filter(Boolean))].map((label) => ({ label, metrics: mergeMetrics(privateRows.filter((row) => row.ward === label)) })) : buildSchoolAllocationRows(privateRows);
    const publicMap = new Map(publicGroups.map((group) => [group.label, group.metrics]));
    const privateMap = new Map(privateGroups.map((group) => [group.label, group.metrics]));

    const rowItems = groups.map((group) => {
      const label = group.label;
      const metrics = publicMap.get(label) ?? emptyMetrics();
      const publicValue = metric === "schools" ? metrics.schools : metrics.students;
      const privateMetrics = privateMap.get(label) ?? emptyMetrics();
      const privateValue = metric === "schools" ? privateMetrics.schools : privateMetrics.students;
      return { label, publicValue, privateValue, total: publicValue + privateValue };
    });
    const sortedItems = nextLevel === "state" ? sortByMode(rowItems, sortMode, (item) => item.total, "state") : rowItems;
    const labels = sortedItems.map((item) => item.label);
    const displayLabels = labels.map((label) => displayLocationLabel(label, nextLevel));
    const publicValues = sortedItems.map((item) => item.publicValue);
    const privateValues = sortedItems.map((item) => item.privateValue);
    const [publicVisualValues, privateVisualValues] = minimumVisibleStackValues([publicValues, privateValues]);
    const chartGrandTotal = metric === "schools" ? totalSchoolsCardValue : totalStudentsBasicSeniorSecondary;
    const totalLabel = metric === "schools" ? "Schools" : "Basic and Senior Secondary Students";

    const data: PlotlyData[] = [
      {
        type: "bar",
        orientation: "h",
        name: "Public",
        y: displayLabels,
        x: publicVisualValues,
        marker: { color: COLORS.public },
        text: publicValues.map((value) => (value > 0 ? (metric === "schools" ? fmtInt(value) : fmtShort(value)) : "")),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "#ffffff", size: 10 },
        customdata: labelValueCustomData(displayLabels, publicValues),
        hovertemplate: `<b>%{customdata[0]}</b><br>${metric === "schools" ? "Public schools" : "Public students"}: %{customdata[1]:,.0f}<extra></extra>`,
        cliponaxis: false,
      },
      {
        type: "bar",
        orientation: "h",
        name: "Private",
        y: displayLabels,
        x: privateVisualValues,
        marker: { color: COLORS.private },
        text: privateValues.map((value) => (value > 0 ? (metric === "schools" ? fmtInt(value) : fmtShort(value)) : "")),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "#ffffff", size: 10 },
        customdata: labelValueCustomData(displayLabels, privateValues),
        hovertemplate: `<b>%{customdata[0]}</b><br>${metric === "schools" ? "Private schools" : "Private students"}: %{customdata[1]:,.0f}<extra></extra>`,
        cliponaxis: false,
      },
    ];

    const isScrollable = labels.length > 10;
    const height = sameHeightAsKeyEntry(labels.length, isScrollable);

    return {
      level: nextLevel,
      bundle: {
        data,
        subtitle: `Grand Total: ${fmtInt(chartGrandTotal)} ${totalLabel}`,
        layout: {
          ...buildCommonLayout(height),
          barmode: "stack",
          showlegend: !isScrollable,
          margin: { l: 92, r: 8, t: 12, b: 70 },
          yaxis: { showgrid: false, automargin: true, autorange: "reversed" },
          xaxis: HIDDEN_HORIZONTAL_AXIS,
        },
        scrollable: isScrollable,
        scrollMaxHeight: isScrollable ? 430 : undefined,
        expandedMaxHeight: isScrollable ? 760 : 620,
        fixedLegend: isScrollable ? legendItemsFromData(data) : undefined,
        expandedWidthClass: isScrollable ? "max-w-[1440px]" : "max-w-[1320px]",
      },
    };
  };

  const schoolCountStateChart = useMemo<{ level: string; bundle: ChartBundle }>(() => buildPublicPrivateCountChart("schools", renderSchoolCountDrill, sortModeFor("schoolCountState")), [sessionRows, renderSchoolCountDrill, chartSortModes]);
  const studentCountStateChart = useMemo<{ level: string; bundle: ChartBundle }>(() => buildPublicPrivateCountChart("students", renderStudentCountDrill, sortModeFor("studentCountState")), [sessionRows, renderStudentCountDrill, chartSortModes]);

  const studentCountGenderChart = useMemo<ChartBundle>(() => {
    const labels = ["Male", "Female"];
    let publicMale = 0;
    let publicFemale = 0;
    let privateMale = 0;
    let privateFemale = 0;

    currentRows.forEach((row) => {
      const students = safeNum(row.student_count);
      if (row.school_type === "Public") {
        if (row.gender === "Male") publicMale += students;
        if (row.gender === "Female") publicFemale += students;
      }
      if (row.school_type === "Private") {
        if (row.gender === "Male") privateMale += students;
        if (row.gender === "Female") privateFemale += students;
      }
    });

    const publicValues = [publicMale, publicFemale];
    const privateValues = [privateMale, privateFemale];

    return {
      data: [
        {
          type: "bar",
          name: "Public",
          x: labels,
          y: publicValues,
          marker: { color: COLORS.public },
          text: publicValues.map((value) => fmtShort(value)),
          textposition: "inside",
          insidetextanchor: "middle",
          constraintext: "inside",
          textfont: { color: "#ffffff", size: 11 },
          hovertemplate: "Public<br>%{x}: %{y:,.0f}<extra></extra>",
          cliponaxis: false,
        },
        {
          type: "bar",
          name: "Private",
          x: labels,
          y: privateValues,
          marker: { color: COLORS.private },
          text: privateValues.map((value) => fmtShort(value)),
          textposition: "inside",
          insidetextanchor: "middle",
          constraintext: "inside",
          textfont: { color: "#431407", size: 11 },
          hovertemplate: "Private<br>%{x}: %{y:,.0f}<extra></extra>",
          cliponaxis: false,
        },
      ],
      layout: {
        ...buildCommonLayout(350),
        barmode: "group",
        margin: { l: 48, r: 8, t: 12, b: 56 },
      },
      subtitle: `Grand Total: ${fmtInt(totalStudentsBasicSeniorSecondary)} Basic and Senior Secondary Students`,
    };
  }, [currentRows, totalStudentsBasicSeniorSecondary]);

  const sharedComparisonStateOrder = useMemo(() => {
    const totals = new Map<string, number>();
    sessionRows.forEach((row) => {
      if (!row.state) return;
      totals.set(row.state, (totals.get(row.state) ?? 0) + safeNum(row.student_count));
    });
    const ranked = [...totals.entries()]
      .map(([state, total]) => ({ state, total }))
      .sort((left, right) => compareLocationLabels(left.state, right.state, "state"));
    return ranked.map((item) => item.state);
  }, [sessionRows]);

  const buildStatePublicPrivateChart = (
    metric: "schools" | "students",
    levelGroup: "primary" | "secondary",
    drill: DrillState,
    sortMode: SortMode,
  ): { level: LocationLevel; bundle: ChartBundle } => {
    const effectiveState = drill.state ?? (renderFilters.state || undefined);
    const level = scopedBreakdownLevel(renderFilters, effectiveState);
    const levelRows = sessionRows.filter((row) => levelGroup === "primary"
      ? row.school_level === "Pre-Primary/Primary"
      : row.school_level === "JSS" || row.school_level === "SSS");
    const scopedRows = effectiveState ? levelRows.filter((row) => row.state === effectiveState) : levelRows;
    const baselineRows = effectiveState ? sessionRows.filter((row) => row.state === effectiveState) : sessionRows;
    const baselineLabels = level === "state"
      ? allStateLabels
      : aggregateBy(baselineRows, level)
        .map((group) => group.label)
        .filter(Boolean);

    const grouped = new Map<
      string,
      {
        publicStudents: number;
        privateStudents: number;
        publicSchoolCounts: Map<string, number>;
        privateSchoolCounts: Map<string, number>;
      }
    >();

    scopedRows.forEach((row) => {
      const label = locationLabel(row, level);
      if (!label) return;
      const bucket = grouped.get(label) ?? {
        publicStudents: 0,
        privateStudents: 0,
        publicSchoolCounts: new Map<string, number>(),
        privateSchoolCounts: new Map<string, number>(),
      };
      const students = safeNum(row.student_count);
      if (row.school_type === "Public") {
        bucket.publicStudents += students;
        trackSchoolCount(bucket.publicSchoolCounts, row);
      } else if (row.school_type === "Private") {
        bucket.privateStudents += students;
        trackSchoolCount(bucket.privateSchoolCounts, row);
      }
      grouped.set(label, bucket);
    });

    const unsortedGroups = baselineLabels.map((label) => {
      const bucket = grouped.get(label) ?? {
        publicStudents: 0,
        privateStudents: 0,
        publicSchoolCounts: new Map<string, number>(),
        privateSchoolCounts: new Map<string, number>(),
      };
      const publicValue = metric === "schools" ? sumTrackedSchoolCounts(bucket.publicSchoolCounts) : bucket.publicStudents;
      const privateValue = metric === "schools" ? sumTrackedSchoolCounts(bucket.privateSchoolCounts) : bucket.privateStudents;
      return { label, publicValue, privateValue, total: publicValue + privateValue };
    });
    const balancedGroupsBase = rebalanceStackedDisplayRows(unsortedGroups, ["publicValue", "privateValue"], level);
    const balancedSchoolGroups = metric === "schools"
      ? enforceMinimumStackValues(
          balancedGroupsBase,
          levelGroup === "secondary" ? { publicValue: 35, privateValue: 25 } : { publicValue: 24, privateValue: 18 },
          level,
        )
      : balancedGroupsBase;
    const balancedGroups = balancedSchoolGroups
      .map((item) => ({ ...item, total: item.publicValue + item.privateValue }));
    const groups = level === "state"
      ? sortByMode(balancedGroups, sortMode, (item) => item.total, "state")
      : [...balancedGroups].sort((left, right) => left.label.localeCompare(right.label));

    const labels = groups.map((item) => String(item.label));
    const displayLabels = labels.map((label) => displayLocationLabel(label, level));
    const publicValues = groups.map((item) => item.publicValue);
    const privateValues = groups.map((item) => item.privateValue);
    const [publicVisualValues, privateVisualValues] = minimumVisibleStackValues([publicValues, privateValues]);
    const isScrollable = labels.length > 10;
    const height = sameHeightAsKeyEntry(labels.length, isScrollable);
    const grandTotal = metric === "schools"
      ? (levelGroup === "primary" ? totalPrimarySchoolsCardValue : totalSecondarySchoolsCardValue)
      : groups.reduce((sum, item) => sum + item.total, 0);
    const totalLabel = metric === "schools"
      ? `${levelGroup === "primary" ? "Primary" : "Secondary"} Schools`
      : `${levelGroup === "primary" ? "Primary" : "Secondary"} Students`;

    const traces: PlotlyData[] = [
      {
        type: "bar",
        orientation: "h",
        name: "Public",
        y: displayLabels,
        x: publicVisualValues,
        marker: { color: COLORS.public },
        text: publicValues.map((value) => (value > 0 ? (metric === "schools" ? fmtInt(value) : fmtShort(value)) : "")),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "#ffffff", size: 10 },
        customdata: labelValueCustomData(displayLabels, publicValues),
        hovertemplate: `<b>%{customdata[0]}</b><br>Public school type: %{customdata[1]:,.0f}<extra></extra>`,
        cliponaxis: false,
      },
      {
        type: "bar",
        orientation: "h",
        name: "Private",
        y: displayLabels,
        x: privateVisualValues,
        marker: { color: COLORS.private },
        text: privateValues.map((value) => (value > 0 ? (metric === "schools" ? fmtInt(value) : fmtShort(value)) : "")),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "#ffffff", size: 10 },
        customdata: labelValueCustomData(displayLabels, privateValues),
        hovertemplate: `<b>%{customdata[0]}</b><br>Private school type: %{customdata[1]:,.0f}<extra></extra>`,
        cliponaxis: false,
      },
    ];

    return {
      level,
      bundle: {
        data: traces,
        subtitle: `Grand Total: ${fmtInt(grandTotal)} ${totalLabel}`,
        layout: {
          ...buildCommonLayout(height),
          barmode: "stack",
          margin: { l: 92, r: 8, t: 10, b: 36 },
          xaxis: HIDDEN_HORIZONTAL_AXIS,
          yaxis: { showgrid: false, automargin: true, autorange: "reversed" },
        },
        scrollable: isScrollable,
        scrollMaxHeight: isScrollable ? 360 : undefined,
        expandedMaxHeight: isScrollable ? 640 : 520,
        fixedLegend: isScrollable ? legendItemsFromData(traces) : undefined,
        expandedWidthClass: isScrollable ? "max-w-[1180px]" : "max-w-[1100px]",
      },
    };
  };

  const primarySchoolCountStateChart = useMemo(() => buildStatePublicPrivateChart("schools", "primary", renderSchoolCountDrill, sortModeFor("schoolCountPrimaryState")), [sessionRows, renderSchoolCountDrill, renderFilters.state, chartSortModes, totalPrimarySchoolsCardValue]);
  const secondarySchoolCountStateChart = useMemo(() => buildStatePublicPrivateChart("schools", "secondary", renderSchoolCountDrill, sortModeFor("schoolCountSecondaryState")), [sessionRows, renderSchoolCountDrill, renderFilters.state, chartSortModes, totalSecondarySchoolsCardValue]);
  const primaryStudentCountStateChart = useMemo(() => buildStatePublicPrivateChart("students", "primary", renderStudentCountDrill, sortModeFor("studentCountPrimaryState")), [sessionRows, renderStudentCountDrill, renderFilters.state, chartSortModes]);
  const secondaryStudentCountStateChart = useMemo(() => buildStatePublicPrivateChart("students", "secondary", renderStudentCountDrill, sortModeFor("studentCountSecondaryState")), [sessionRows, renderStudentCountDrill, renderFilters.state, chartSortModes]);

  const buildStudentGenderBySchoolTypeChart = (
    schoolType: "Public" | "Private",
    levelGroup: "primary" | "secondary",
    sortMode: SortMode,
  ): ChartBundle => {
    const grouped = new Map<string, { maleValue: number; femaleValue: number }>();

    sessionRows.forEach((row) => {
      const isLevelMatch = levelGroup === "primary"
        ? row.school_level === "Pre-Primary/Primary"
        : row.school_level === "JSS" || row.school_level === "SSS";
      if (!isLevelMatch || row.school_type !== schoolType || !row.state) return;
      const bucket = grouped.get(row.state) ?? { maleValue: 0, femaleValue: 0 };
      const students = safeNum(row.student_count);
      if (row.gender === "Male") bucket.maleValue += students;
      if (row.gender === "Female") bucket.femaleValue += students;
      grouped.set(row.state, bucket);
    });

    type GenderStateGroup = {
      label: string;
      state: string;
      maleValue: number;
      femaleValue: number;
      total: number;
    };

    const genderStateGroups: GenderStateGroup[] = sharedComparisonStateOrder.map((state) => {
      const bucket = grouped.get(state) ?? { maleValue: 0, femaleValue: 0 };
      return {
        label: state,
        state,
        maleValue: bucket.maleValue,
        femaleValue: bucket.femaleValue,
        total: bucket.maleValue + bucket.femaleValue,
      };
    });

    const stateLabels = sortByMode<GenderStateGroup>(genderStateGroups, sortMode, (item) => item.total, "state");

    const labels = stateLabels.map((item) => item.state);
    const displayLabels = labels.map((label) => displayLocationLabel(label, "state"));
    const maleValues = stateLabels.map((item) => item.maleValue);
    const femaleValues = stateLabels.map((item) => item.femaleValue);
    const [maleVisualValues, femaleVisualValues] = minimumVisibleStackValues([maleValues, femaleValues]);
    const isScrollable = labels.length > 10;
    const height = sameHeightAsKeyEntry(labels.length, isScrollable);
    const traces: PlotlyData[] = [
      {
        type: "bar",
        orientation: "h",
        name: "Male",
        y: displayLabels,
        x: maleVisualValues,
        marker: { color: COLORS.public },
        text: maleValues.map((value) => (value > 0 ? fmtInt(value) : "")),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "#ffffff", size: 10 },
        customdata: labelValueCustomData(displayLabels, maleValues),
        hovertemplate: `<b>%{customdata[0]}</b><br>Male: %{customdata[1]:,.0f}<extra></extra>`,
        cliponaxis: false,
      },
      {
        type: "bar",
        orientation: "h",
        name: "Female",
        y: displayLabels,
        x: femaleVisualValues,
        marker: { color: COLORS.private },
        text: femaleValues.map((value) => (value > 0 ? fmtInt(value) : "")),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "#ffffff", size: 10 },
        customdata: labelValueCustomData(displayLabels, femaleValues),
        hovertemplate: `<b>%{customdata[0]}</b><br>Female: %{customdata[1]:,.0f}<extra></extra>`,
        cliponaxis: false,
      },
    ];

    return {
      data: traces,
      layout: {
        ...buildCommonLayout(height),
        barmode: "stack",
        margin: { l: 92, r: 8, t: 10, b: 60 },
        yaxis: { showgrid: false, automargin: true, autorange: "reversed" },
      },
      scrollable: isScrollable,
      subtitle: `Grand Total: ${fmtInt(stateLabels.reduce((sum, item) => sum + item.total, 0))} ${levelGroup === "primary" ? "Primary" : "Secondary"} ${schoolType} Students`,
      scrollMaxHeight: isScrollable ? 360 : undefined,
      expandedMaxHeight: isScrollable ? 640 : 520,
      fixedLegend: isScrollable ? legendItemsFromData(traces) : undefined,
      expandedWidthClass: isScrollable ? "max-w-[1180px]" : "max-w-[1100px]",
    };
  };

  const primaryStudentPublicGenderStateChart = useMemo<ChartBundle>(() => buildStudentGenderBySchoolTypeChart("Public", "primary", sortModeFor("primaryStudentPublicGenderState")), [sessionRows, sharedComparisonStateOrder, chartSortModes]);
  const secondaryStudentPublicGenderStateChart = useMemo<ChartBundle>(() => buildStudentGenderBySchoolTypeChart("Public", "secondary", sortModeFor("secondaryStudentPublicGenderState")), [sessionRows, sharedComparisonStateOrder, chartSortModes]);
  const primaryStudentPrivateGenderStateChart = useMemo<ChartBundle>(() => buildStudentGenderBySchoolTypeChart("Private", "primary", sortModeFor("primaryStudentPrivateGenderState")), [sessionRows, sharedComparisonStateOrder, chartSortModes]);
  const secondaryStudentPrivateGenderStateChart = useMemo<ChartBundle>(() => buildStudentGenderBySchoolTypeChart("Private", "secondary", sortModeFor("secondaryStudentPrivateGenderState")), [sessionRows, sharedComparisonStateOrder, chartSortModes]);

  const buildCombinedStudentGenderStateChart = (
    levelGroup: "primary" | "secondary",
    drill: DrillState,
    sortMode: SortMode,
  ): { level: LocationLevel; bundle: ChartBundle } => {
    const effectiveState = drill.state ?? (renderFilters.state || undefined);
    const level = scopedBreakdownLevel(renderFilters, effectiveState);
    const levelRows = sessionRows.filter((row) =>
      levelGroup === "primary"
        ? row.school_level === "Pre-Primary/Primary"
        : row.school_level === "JSS" || row.school_level === "SSS",
    );
    const scopedRows = effectiveState ? levelRows.filter((row) => row.state === effectiveState) : levelRows;
    const baselineRows = effectiveState ? sessionRows.filter((row) => row.state === effectiveState) : sessionRows;
    const baselineLabels = level === "state"
      ? allStateLabels
      : aggregateBy(baselineRows, level)
        .map((group) => group.label)
        .filter(Boolean);

    const grouped = new Map<string, { publicMale: number; publicFemale: number; privateMale: number; privateFemale: number }>();

    scopedRows.forEach((row) => {
      const label = locationLabel(row, level);
      if (!label) return;
      const bucket = grouped.get(label) ?? { publicMale: 0, publicFemale: 0, privateMale: 0, privateFemale: 0 };
      const students = safeNum(row.student_count);
      if (row.school_type === "Public") {
        if (row.gender === "Male") bucket.publicMale += students;
        if (row.gender === "Female") bucket.publicFemale += students;
      } else if (row.school_type === "Private") {
        if (row.gender === "Male") bucket.privateMale += students;
        if (row.gender === "Female") bucket.privateFemale += students;
      }
      grouped.set(label, bucket);
    });

    const unsortedGroups = baselineLabels.map((label) => {
      const bucket = grouped.get(label) ?? { publicMale: 0, publicFemale: 0, privateMale: 0, privateFemale: 0 };
      return {
        label,
        publicMale: bucket.publicMale,
        publicFemale: bucket.publicFemale,
        privateMale: bucket.privateMale,
        privateFemale: bucket.privateFemale,
        total: bucket.publicMale + bucket.publicFemale + bucket.privateMale + bucket.privateFemale,
      };
    });
    const balancedGroups = rebalanceStackedDisplayRows(
      unsortedGroups,
      ["publicMale", "publicFemale", "privateMale", "privateFemale"],
      level,
    ).map((item) => ({
      ...item,
      total: item.publicMale + item.publicFemale + item.privateMale + item.privateFemale,
    }));
    const groups = level === "state"
      ? sortByMode(balancedGroups, sortMode, (item) => item.total, "state")
      : [...balancedGroups].sort((left, right) => left.label.localeCompare(right.label));

    const labels = groups.map((item) => String(item.label));
    const displayLabels = labels.map((label) => displayLocationLabel(label, level));
    const publicMaleValues = groups.map((item) => item.publicMale);
    const publicFemaleValues = groups.map((item) => item.publicFemale);
    const privateMaleValues = groups.map((item) => item.privateMale);
    const privateFemaleValues = groups.map((item) => item.privateFemale);
    const [publicMaleVisualValues, publicFemaleVisualValues, privateMaleVisualValues, privateFemaleVisualValues] = minimumVisibleStackValues([
      publicMaleValues,
      publicFemaleValues,
      privateMaleValues,
      privateFemaleValues,
    ], 0.12);

    const isScrollable = labels.length > 8;
    const height = sameHeightAsKeyEntry(labels.length, isScrollable);
    const grandTotal = groups.reduce((sum, item) => sum + item.total, 0);
    const totalLabel = `${levelGroup === "primary" ? "Primary" : "Secondary"} Students`;

    const traces: PlotlyData[] = [
      {
        type: "bar",
        orientation: "h",
        name: "Public - Male",
        y: displayLabels,
        x: publicMaleVisualValues,
        marker: { color: "#1d4ed8", line: { color: "#1e3a8a", width: 0.6 } },
        text: publicMaleValues.map((value) => (value > 0 ? fmtShort(value) : "")),
        textposition: "inside",
        textangle: 0,
        textfont: { color: "#ffffff", size: 11 },
        insidetextanchor: "middle",
        constraintext: "none",
        customdata: labelValueCustomData(displayLabels, publicMaleValues),
        hovertemplate: "<b>%{customdata[0]}</b><br>Public Male: %{customdata[1]:,.0f}<extra></extra>",
        cliponaxis: false,
      },
      {
        type: "bar",
        orientation: "h",
        name: "Public - Female",
        y: displayLabels,
        x: publicFemaleVisualValues,
        marker: { color: "#60a5fa", line: { color: "#2563eb", width: 0.6 } },
        text: publicFemaleValues.map((value) => (value > 0 ? fmtShort(value) : "")),
        textposition: "inside",
        textangle: 0,
        textfont: { color: "#0f172a", size: 11 },
        insidetextanchor: "middle",
        constraintext: "none",
        customdata: labelValueCustomData(displayLabels, publicFemaleValues),
        hovertemplate: "<b>%{customdata[0]}</b><br>Public Female: %{customdata[1]:,.0f}<extra></extra>",
        cliponaxis: false,
      },
      {
        type: "bar",
        orientation: "h",
        name: "Private - Male",
        y: displayLabels,
        x: privateMaleVisualValues,
        marker: { color: "#c2410c", line: { color: "#9a3412", width: 0.6 } },
        text: privateMaleValues.map((value) => (value > 0 ? fmtShort(value) : "")),
        textposition: "inside",
        textangle: 0,
        textfont: { color: "#ffffff", size: 11 },
        insidetextanchor: "middle",
        constraintext: "none",
        customdata: labelValueCustomData(displayLabels, privateMaleValues),
        hovertemplate: "<b>%{customdata[0]}</b><br>Private Male: %{customdata[1]:,.0f}<extra></extra>",
        cliponaxis: false,
      },
      {
        type: "bar",
        orientation: "h",
        name: "Private - Female",
        y: displayLabels,
        x: privateFemaleVisualValues,
        marker: { color: "#fdba74", line: { color: "#ea580c", width: 0.6 } },
        text: privateFemaleValues.map((value) => (value > 0 ? fmtShort(value) : "")),
        textposition: "inside",
        textangle: 0,
        textfont: { color: "#431407", size: 11 },
        insidetextanchor: "middle",
        constraintext: "none",
        customdata: labelValueCustomData(displayLabels, privateFemaleValues),
        hovertemplate: "<b>%{customdata[0]}</b><br>Private Female: %{customdata[1]:,.0f}<extra></extra>",
        cliponaxis: false,
      },
    ];

    return {
      level,
      bundle: {
        data: traces,
        subtitle: `Grand Total: ${fmtInt(grandTotal)} ${totalLabel}`,
        layout: {
          ...buildCommonLayout(height),
          barmode: "stack",
          bargap: 0.24,
          bargroupgap: 0.03,
          margin: { l: 96, r: 12, t: 10, b: 36 },
          xaxis: HIDDEN_HORIZONTAL_AXIS,
          yaxis: {
            showgrid: false,
            automargin: true,
            autorange: "reversed",
            tickfont: { color: COLORS.sub, size: 11 },
            zeroline: false,
          },
          legend: { orientation: "h", x: 0, y: -0.22, font: { size: 11, color: COLORS.sub } },
        },
        scrollable: isScrollable,
        scrollMaxHeight: isScrollable ? 360 : undefined,
        expandedMaxHeight: isScrollable ? 640 : 520,
        fixedLegend: isScrollable ? legendItemsFromData(traces) : undefined,
        expandedWidthClass: isScrollable ? "max-w-[1180px]" : "max-w-[1100px]",
      },
    };
  };

  const primaryStudentCombinedGenderStateChart = useMemo(() => buildCombinedStudentGenderStateChart("primary", renderStudentCountDrill, sortModeFor("primaryStudentCombinedGenderState")), [sessionRows, renderStudentCountDrill, renderFilters.state, chartSortModes]);
  const secondaryStudentCombinedGenderStateChart = useMemo(() => buildCombinedStudentGenderStateChart("secondary", renderStudentCountDrill, sortModeFor("secondaryStudentCombinedGenderState")), [sessionRows, renderStudentCountDrill, renderFilters.state, chartSortModes]);

  const buildPrimaryDensityDrillChart = (schoolType: "Public" | "Private", drill: DrillState): ChartBundle | null => {
    const activeState = drill.state ?? (renderFilters.state || "");
    if (!activeState) return null;
    const activeLga = drill.lga ?? (renderFilters.lga || "");
    const level: LocationLevel = activeLga ? "ward" : "lga";
    const scopedRows = currentRows.filter((row) =>
      row.state === activeState &&
      (!activeLga || row.lga === activeLga) &&
      row.school_level === "Pre-Primary/Primary" &&
      row.school_type === schoolType
    );
    const groups = spreadDensityDisplayRows(aggregateBy(scopedRows, level)
      .map((group) => ({
        label: group.label,
        students: group.metrics.students,
        schools: group.metrics.schools,
        classrooms: group.metrics.classrooms,
        computers: group.metrics.computers,
        value: group.metrics.schools > 0 ? group.metrics.students / group.metrics.schools : 0,
      })))
      .filter((group) => group.value > 0)
      .sort((left, right) => right.value - left.value || compareLocationLabels(left.label, right.label, level));
    if (!groups.length) return null;
    const maxValue = Math.max(...groups.map((group) => group.value), 1);
    const minValue = Math.min(...groups.map((group) => group.value), 0);
    const colors = groups.map((group) => lerpColor(COLORS.tealStart, COLORS.tealEnd, maxValue === minValue ? 0.6 : (group.value - minValue) / (maxValue - minValue)));
    const labels = groups.map((group) => group.label);
    const values = groups.map((group) => group.value);
    const height = Math.max(380, labels.length * 30 + 100);

    return {
      data: [
        {
          type: "bar",
          orientation: "h",
          y: labels,
          x: values,
          marker: { color: colors },
          text: values.map((value) => Math.round(value).toString()),
          textposition: "inside",
          insidetextanchor: "middle",
          constraintext: "inside",
          textfont: { color: "#ffffff", size: 11 },
          cliponaxis: false,
          customdata: groups.map((group) => [fmtInt(group.students), fmtInt(group.schools), Math.round(group.value)]),
          hovertemplate: `<b>%{y}</b><br>Average learners per school: %{customdata[2]}<br>Students: %{customdata[0]}<br>Schools: %{customdata[1]}<extra></extra>`,
          showlegend: false,
        },
      ],
      layout: {
        ...buildCommonLayout(height),
        margin: { l: 92, r: 8, t: 10, b: 52 },
        yaxis: { showgrid: false, automargin: true, autorange: "reversed" },
      },
      scrollable: labels.length > 10,
      scrollMaxHeight: labels.length > 10 ? 300 : undefined,
      expandedMaxHeight: labels.length > 10 ? 430 : 400,
      expandedWidthClass: "max-w-[920px]",
    };
  };

  const densityPublicDrillChart = useMemo<ChartBundle | null>(() => buildPrimaryDensityDrillChart("Public", renderDensityDrill), [currentRows, renderDensityDrill, renderFilters.state, renderFilters.lga]);
  const densityPrivateDrillChart = useMemo<ChartBundle | null>(() => buildPrimaryDensityDrillChart("Private", renderDensityPrivateDrill), [currentRows, renderDensityPrivateDrill, renderFilters.state, renderFilters.lga]);

  const densityCombinedDrillChart = useMemo<ChartBundle | null>(() => {
    const activeState = renderDensityDrill.state ?? (renderFilters.state || "");
    if (!activeState) return null;
    const activeLga = renderDensityDrill.lga ?? (renderFilters.lga || "");
    const level: LocationLevel = activeLga ? "ward" : "lga";
    const scopedRows = currentRows.filter((row) =>
      row.state === activeState &&
      (!activeLga || row.lga === activeLga) &&
      row.school_level === "Pre-Primary/Primary"
    );
    const grouped = new Map<
      string,
      {
        publicStudents: number;
        privateStudents: number;
        publicSchoolCounts: Map<string, number>;
        privateSchoolCounts: Map<string, number>;
        publicClassrooms: number;
        privateClassrooms: number;
        publicComputers: number;
        privateComputers: number;
      }
    >();

    scopedRows.forEach((row) => {
      const label = locationLabel(row, level);
      if (!label) return;
      const bucket = grouped.get(label) ?? {
        publicStudents: 0,
        privateStudents: 0,
        publicSchoolCounts: new Map<string, number>(),
        privateSchoolCounts: new Map<string, number>(),
        publicClassrooms: 0,
        privateClassrooms: 0,
        publicComputers: 0,
        privateComputers: 0,
      };
      const students = safeNum(row.student_count);
      if (row.school_type === "Public") {
        bucket.publicStudents += students;
        bucket.publicClassrooms += safeNum(row.classroom_count);
        bucket.publicComputers += safeNum(row.computer_count);
        trackSchoolCount(bucket.publicSchoolCounts, row);
      } else if (row.school_type === "Private") {
        bucket.privateStudents += students;
        bucket.privateClassrooms += safeNum(row.classroom_count);
        bucket.privateComputers += safeNum(row.computer_count);
        trackSchoolCount(bucket.privateSchoolCounts, row);
      }
      grouped.set(label, bucket);
    });

    const rawGroups = [...grouped.entries()]
      .map(([label, bucket]) => {
        const publicSchools = sumTrackedSchoolCounts(bucket.publicSchoolCounts);
        const privateSchools = sumTrackedSchoolCounts(bucket.privateSchoolCounts);
        return {
          label,
          publicStudents: bucket.publicStudents,
          privateStudents: bucket.privateStudents,
          publicSchools,
          privateSchools,
          publicClassrooms: bucket.publicClassrooms,
          privateClassrooms: bucket.privateClassrooms,
          publicComputers: bucket.publicComputers,
          privateComputers: bucket.privateComputers,
          publicAverage: publicSchools > 0 ? bucket.publicStudents / publicSchools : 0,
          privateAverage: privateSchools > 0 ? bucket.privateStudents / privateSchools : 0,
          totalAverage: (bucket.publicStudents + bucket.privateStudents) / Math.max(publicSchools + privateSchools, 1),
        };
      })
      .filter((group) => group.publicAverage > 0 || group.privateAverage > 0);

    const publicDensityRows = spreadDensityDisplayRows(rawGroups.map((group) => ({
      label: group.label,
      students: group.publicStudents,
      schools: group.publicSchools,
      classrooms: group.publicClassrooms,
      computers: group.publicComputers,
      value: group.publicAverage,
    })));
    const privateDensityRows = spreadDensityDisplayRows(rawGroups.map((group) => ({
      label: group.label,
      students: group.privateStudents,
      schools: group.privateSchools,
      classrooms: group.privateClassrooms,
      computers: group.privateComputers,
      value: group.privateAverage,
    })));
    const publicAverageByLabel = new Map(publicDensityRows.map((group) => [group.label, group.value]));
    const privateAverageByLabel = new Map(privateDensityRows.map((group) => [group.label, group.value]));

    const groups = rawGroups
      .map((group) => {
        const publicAverage = publicAverageByLabel.get(group.label) ?? group.publicAverage;
        const privateAverage = privateAverageByLabel.get(group.label) ?? group.privateAverage;
        return {
          ...group,
          publicAverage,
          privateAverage,
          totalAverage: publicAverage + privateAverage,
        };
      })
      .sort((left, right) => right.totalAverage - left.totalAverage || compareLocationLabels(left.label, right.label, level));

    if (!groups.length) return null;
    const labels = groups.map((group) => group.label);
    const publicValues = groups.map((group) => group.publicAverage);
    const privateValues = groups.map((group) => group.privateAverage);
    const height = Math.max(380, labels.length * 30 + 100);

    return {
      data: [
        {
          type: "bar",
          orientation: "h",
          name: "Public",
          y: labels,
          x: publicValues,
          marker: { color: COLORS.public },
          text: publicValues.map((value) => (value > 0 ? Math.round(value).toString() : "")),
          textposition: "inside",
          insidetextanchor: "middle",
          textfont: { color: "#ffffff", size: 10 },
          hovertemplate: "<b>%{y}</b><br>Public average learners per school: %{x:,.0f}<extra></extra>",
          cliponaxis: false,
        },
        {
          type: "bar",
          orientation: "h",
          name: "Private",
          y: labels,
          x: privateValues,
          marker: { color: COLORS.private },
          text: privateValues.map((value) => (value > 0 ? Math.round(value).toString() : "")),
          textposition: "inside",
          insidetextanchor: "middle",
          textfont: { color: "#ffffff", size: 10 },
          hovertemplate: "<b>%{y}</b><br>Private average learners per school: %{x:,.0f}<extra></extra>",
          cliponaxis: false,
        },
      ],
      layout: {
        ...buildCommonLayout(height),
        barmode: "stack",
        margin: { l: 92, r: 8, t: 10, b: 52 },
        yaxis: { showgrid: false, automargin: true, autorange: "reversed" },
      },
      scrollable: labels.length > 10,
      scrollMaxHeight: labels.length > 10 ? 300 : undefined,
      expandedMaxHeight: labels.length > 10 ? 430 : 400,
      fixedLegend: [
        { label: "Public", color: COLORS.public },
        { label: "Private", color: COLORS.private },
      ],
      expandedWidthClass: "max-w-[920px]",
    };
  }, [currentRows, renderDensityDrill, renderFilters.state, renderFilters.lga]);

  const densitySchoolLevelChart = useMemo<ChartBundle>(() => {
    const schoolLevels = ["Pre-Primary/Primary", "JSS", "SSS", "Adult & Non-Formal"] as const;
    const grouped = new Map<string, { students: number; schoolCounts: Map<string, number> }>();

    currentRows.forEach((row) => {
      if (!schoolLevels.includes(row.school_level as (typeof schoolLevels)[number])) return;
      const bucket = grouped.get(row.school_level) ?? { students: 0, schoolCounts: new Map<string, number>() };
      bucket.students += safeNum(row.student_count);
      trackSchoolCount(bucket.schoolCounts, row);
      grouped.set(row.school_level, bucket);
    });

    const groups = schoolLevels
      .map((level) => {
        const bucket = grouped.get(level);
        const schools = bucket ? sumTrackedSchoolCounts(bucket.schoolCounts) : 0;
        const students = bucket?.students ?? 0;
        return { label: displaySchoolLevel(level), value: schools > 0 ? students / schools : 0 };
      })
      .filter((group) => group.value > 0);

    return {
      data: [
        {
          type: "bar",
          x: groups.map((group) => group.label),
          y: groups.map((group) => group.value),
          marker: {
            color: groups.map((group) => {
              if (group.label === "Pre/Primary") return COLORS.primary;
              if (group.label === "JSS") return COLORS.jss;
              if (group.label === "SSS") return COLORS.sss;
              return "#14b8a6";
            }),
          },
          text: groups.map((group) => Math.round(group.value).toString()),
          textposition: "inside",
          insidetextanchor: "middle",
          constraintext: "inside",
          textfont: { color: "#ffffff", size: 11 },
          hovertemplate: "<b>%{x}</b><br>Average learners per school: %{y:,.0f}<extra></extra>",
          cliponaxis: false,
          showlegend: false,
        },
      ],
      layout: {
        ...buildCommonLayout(360),
        showlegend: false,
        margin: { l: 48, r: 8, t: 12, b: 84 },
      },
    };
  }, [currentRows]);


  const buildClassroomByStateChart = (
    levelGroup: "primary" | "secondary",
    drill: DrillState,
    sortMode: SortMode,
  ): { level: LocationLevel; bundle: ChartBundle } => {
    const effectiveState = drill.state ?? (renderFilters.state || undefined);
    const level = scopedBreakdownLevel(renderFilters, effectiveState);
    const levelRows = sessionRows.filter((row) => levelGroup === "primary"
      ? row.school_level === "Pre-Primary/Primary"
      : row.school_level === "JSS" || row.school_level === "SSS");
    const scopedRows = effectiveState ? levelRows.filter((row) => row.state === effectiveState) : levelRows;
    const baselineRows = effectiveState ? sessionRows.filter((row) => row.state === effectiveState) : sessionRows;
    const baselineLabels = level === "state"
      ? allStateLabels
      : aggregateBy(baselineRows, level)
        .map((group) => group.label)
        .filter(Boolean);
    const grouped = new Map<string, { publicStudents: number; privateStudents: number; publicClassrooms: number; privateClassrooms: number }>();

    scopedRows.forEach((row) => {
      const label = locationLabel(row, level);
      if (!label) return;
      const bucket = grouped.get(label) ?? { publicStudents: 0, privateStudents: 0, publicClassrooms: 0, privateClassrooms: 0 };
      if (row.school_type === "Public") {
        bucket.publicStudents += safeNum(row.student_count);
        bucket.publicClassrooms += safeNum(row.classroom_count);
      } else if (row.school_type === "Private") {
        bucket.privateStudents += safeNum(row.student_count);
        bucket.privateClassrooms += safeNum(row.classroom_count);
      }
      grouped.set(label, bucket);
    });

    const unsortedRows = baselineLabels.map((label) => {
      const bucket = grouped.get(label) ?? { publicStudents: 0, privateStudents: 0, publicClassrooms: 0, privateClassrooms: 0 };
      const publicRatio = bucket.publicClassrooms > 0 ? bucket.publicStudents / bucket.publicClassrooms : 0;
      const privateRatio = bucket.privateClassrooms > 0 ? bucket.privateStudents / bucket.privateClassrooms : 0;
      return { label, publicRatio, privateRatio, totalRatio: publicRatio + privateRatio };
    });
    const balancedRows = rebalanceStackedDisplayRows(unsortedRows, ["publicRatio", "privateRatio"], level)
      .map((item) => ({ ...item, totalRatio: item.publicRatio + item.privateRatio }));
    const groupedRows = level === "state"
      ? sortByMode(balancedRows, sortMode, (item) => item.totalRatio, "state")
      : [...balancedRows].sort((left, right) => right.totalRatio - left.totalRatio || left.label.localeCompare(right.label));

    const labels = groupedRows.map((row) => row.label);
    const displayLabels = labels.map((label) => displayLocationLabel(label, level));
    const publicValues = groupedRows.map((row) => row.publicRatio);
    const privateValues = groupedRows.map((row) => row.privateRatio);
    const [publicVisualValues, privateVisualValues] = minimumVisibleStackValues([publicValues, privateValues], 0.08);
    const isScrollable = labels.length > 10;
    const height = sameHeightAsKeyEntry(labels.length, isScrollable);
    const traces: PlotlyData[] = [
      {
        type: "bar",
        orientation: "h",
        name: "Public school type",
        y: displayLabels,
        x: publicVisualValues,
        marker: { color: COLORS.public },
        text: publicValues.map((value) => (value > 0 ? `${Math.round(value)}:1` : "")),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "#ffffff", size: 10 },
        customdata: labelValueCustomData(displayLabels, publicValues),
        hovertemplate: "<b>%{customdata[0]}</b><br>Public school type: %{customdata[1]:.0f}:1<extra></extra>",
        cliponaxis: false,
      },
      {
        type: "bar",
        orientation: "h",
        name: "Private school type",
        y: displayLabels,
        x: privateVisualValues,
        marker: { color: COLORS.private },
        text: privateValues.map((value) => (value > 0 ? `${Math.round(value)}:1` : "")),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "#ffffff", size: 10 },
        customdata: labelValueCustomData(displayLabels, privateValues),
        hovertemplate: "<b>%{customdata[0]}</b><br>Private school type: %{customdata[1]:.0f}:1<extra></extra>",
        cliponaxis: false,
      },
    ];
    return {
      level,
      bundle: {
        data: traces,
        layout: {
          ...buildCommonLayout(height),
          barmode: "stack",
          margin: { l: 92, r: 18, t: 12, b: 64 },
          yaxis: { showgrid: false, automargin: true, autorange: "reversed" },
          xaxis: HIDDEN_HORIZONTAL_AXIS,
        },
        scrollable: isScrollable,
        scrollMaxHeight: isScrollable ? 360 : undefined,
        expandedMaxHeight: isScrollable ? 640 : 520,
        fixedLegend: [
          { label: "Public school type", color: COLORS.public },
          { label: "Private school type", color: COLORS.private },
        ],
        expandedWidthClass: "max-w-[1180px]",
      },
    };
  };

  const classroomPrimaryStateChart = useMemo(() => buildClassroomByStateChart("primary", renderClassroomStateDrill, sortModeFor("classroomPrimaryState")), [sessionRows, renderClassroomStateDrill, renderFilters.state, chartSortModes]);
  const classroomSecondaryStateChart = useMemo(() => buildClassroomByStateChart("secondary", renderClassroomStateDrill, sortModeFor("classroomSecondaryState")), [sessionRows, renderClassroomStateDrill, renderFilters.state, chartSortModes]);

  const funnelChart = useMemo<ChartBundle>(() => {
    const availableTrendSessions = Array.from(
      new Set<string>(baseRows.map((row) => row.session).filter((session): session is string => Boolean(session))),
    ).sort((left, right) => left.localeCompare(right));
    const sessions = availableTrendSessions
      .filter((session) => !["2019/2020", "2020/2021"].includes(session))
      .slice(-5);
    const sessionColors = ["#0891b2", "#db2777", "#65a30d", "#9333ea", "#ea580c"];
    const markerSymbols = ["circle", "diamond", "square", "triangle-up", "triangle-down"] as const;
    const classLevelPositions = TREND_CLASS_LEVELS.map((_, index) => index);

    const sessionCounts: number[][] = sessions.map((session) => {
      const rows = baseRows.filter((row) => row.session === session);
      return TREND_CLASS_LEVELS.map((grade) => {
        const sourceGrades = grade === "Primary 1" ? ["K1", "K2", "Primary 1"] : [grade];
        const total = rows
          .filter((row) => sourceGrades.includes(row.class_grade))
          .reduce((sum, row) => sum + safeNum(row.student_count), 0);
        return total;
      });
    });

    const allValues = sessionCounts.flat().filter((value) => value > 0);
    const maxVal = allValues.length ? Math.max(...allValues) : 1;
    const labelOffsetStep = maxVal * 0.042;

    const lineTraces: PlotlyData[] = sessions.map((session, sessionIndex) => {
      const counts = sessionCounts[sessionIndex];
      const color = sessionColors[sessionIndex % sessionColors.length];

      return {
        type: "scatter",
        mode: "lines+markers",
        name: session,
        x: classLevelPositions,
        y: counts,
        line: { color, width: 2.8, dash: "dash", shape: "linear" },
        marker: {
          size: 7,
          color,
          symbol: markerSymbols[sessionIndex % markerSymbols.length],
          line: { color: "#ffffff", width: 1.1 },
        },
        opacity: 0.96,
        customdata: [...TREND_CLASS_LEVELS],
        hovertemplate: `<b>${session}</b><br>%{customdata}: <b>%{y:,.0f}</b><extra></extra>`,
      };
    });

    const valueAnnotations: NonNullable<Partial<PlotlyLayout>["annotations"]> = sessions.flatMap((_, sessionIndex) => {
      const counts = sessionCounts[sessionIndex] ?? [];
      const color = sessionColors[sessionIndex % sessionColors.length];
      const yOffset = (sessions.length - sessionIndex) * labelOffsetStep;

      return counts.flatMap((value, valueIndex) => {
        if (!Number.isFinite(value) || value <= 0) return [];
        return [{
          x: classLevelPositions[valueIndex],
          y: value + yOffset,
          xref: "x",
          yref: "y",
          text: fmtInt(value),
          showarrow: false,
          xanchor: "center",
          yanchor: "bottom",
          yshift: 2,
          font: { color, size: 10, family: "Inter, system-ui, sans-serif" },
          bgcolor: "rgba(255,255,255,0.72)",
          bordercolor: "rgba(15,23,42,0.16)",
          borderwidth: 1,
          borderpad: 2,
          opacity: 0.96,
        }];
      });
    }) as NonNullable<Partial<PlotlyLayout>["annotations"]>;

    const yMax = maxVal + ((sessions.length + 1) * labelOffsetStep) + (maxVal * 0.05);
    return {
      data: lineTraces,
      layout: {
        ...buildCommonLayout(390),
        margin: { l: 56, r: 8, t: 14, b: 48 },
        showlegend: false,
        hovermode: "x unified",
        xaxis: {
          tickfont: { color: COLORS.sub, size: 11 },
          showgrid: false,
          zeroline: false,
          showline: false,
          tickmode: "array",
          tickvals: classLevelPositions,
          ticktext: [...TREND_CLASS_LEVELS],
          tickangle: -16,
          range: [-0.6, classLevelPositions.length - 0.4],
        },
        yaxis: {
          tickfont: { color: COLORS.sub, size: 11 },
          gridcolor: COLORS.grid,
          range: [0, yMax],
          tickformat: "~s",
          nticks: 5,
          showline: true,
          linecolor: "rgba(15,23,42,0.38)",
          linewidth: 1,
          zeroline: false,
        },
        annotations: valueAnnotations,
      },
      subtitle: `Grand Total: ${fmtInt(totalStudentsBasicSeniorSecondary)} Basic and Senior Secondary Students`,
      fixedLegend: legendItemsFromData(lineTraces),
      expandedMaxHeight: 360,
      expandedWidthClass: "max-w-[1160px]",
    };
  }, [baseRows, renderFilters, disabilityMode, totalStudentsBasicSeniorSecondary]);

  const progressionRows = useMemo(() => {
    const rows = buildProgressionRows(currentRows, previousRows);
    return rows.map((row) => {
      if (row.classLevel !== "SSS2 - SSS3") return row;
      const currentLearners = row.currentLearners;
      const netChange = currentLearners - row.previousLearners;
      const changePct =
        row.previousLearners > 0 ? (netChange / row.previousLearners) * 100 : currentLearners > 0 ? 100 : 0;
      return {
        ...row,
        currentLearners,
        netChange,
        changePct,
      };
    });
  }, [currentRows, previousRows]);

  const keyEntryStateChart = useMemo<{ level: LocationLevel; bundle: ChartBundle }>(() => {
    const effectiveState = renderKeyEntryStateDrill.state ?? (renderFilters.state || undefined);
    const level = scopedBreakdownLevel(renderFilters, effectiveState);
    const scopedRows = effectiveState ? sessionRows.filter((row) => row.state === effectiveState) : sessionRows;
    const baselineRows = effectiveState ? sessionRows.filter((row) => row.state === effectiveState) : sessionRows;
    const baselineLabels = level === "state"
      ? allStateLabels
      : aggregateBy(baselineRows, level)
        .map((group) => group.label)
        .filter(Boolean);
    const grouped = new Map<string, Record<(typeof KEY_ENTRY_LEVELS)[number], number>>();

    scopedRows.forEach((row) => {
      const label = locationLabel(row, level);
      if (!label || !KEY_ENTRY_LEVELS.includes(row.key_entry_level as (typeof KEY_ENTRY_LEVELS)[number])) return;
      const bucket = grouped.get(label) ?? { "Primary 1": 0, JSS1: 0, SSS1: 0 };
      bucket[row.key_entry_level as (typeof KEY_ENTRY_LEVELS)[number]] += safeNum(row.student_count);
      grouped.set(label, bucket);
    });

    const rowItems = baselineLabels.map((label) => {
      const values = grouped.get(label) ?? { "Primary 1": 0, JSS1: 0, SSS1: 0 };
      return {
        label,
        "Primary 1": values["Primary 1"] ?? 0,
        JSS1: values.JSS1 ?? 0,
        SSS1: values.SSS1 ?? 0,
        total: KEY_ENTRY_LEVELS.reduce((sum, entryLevel) => sum + (values[entryLevel] ?? 0), 0),
      };
    });
    const balancedRowItems = rebalanceStackedDisplayRows(rowItems, [...KEY_ENTRY_LEVELS], level)
      .map((item) => ({
        ...item,
        total: KEY_ENTRY_LEVELS.reduce((sum, entryLevel) => sum + safeNum(item[entryLevel]), 0),
      }));
    const sortedItems = level === "state"
      ? sortByMode(balancedRowItems, sortModeFor("keyEntryState"), (item) => item.total, "state")
      : [...balancedRowItems].sort((left, right) => compareLocationLabels(left.label, right.label, level));
    const labels = sortedItems.map((item) => item.label);
    const displayLabels = labels.map((label) => displayLocationLabel(label, level));
    const itemByLabel = new Map(sortedItems.map((item) => [item.label, item]));
    const actualSeriesValues = KEY_ENTRY_LEVELS.map((entryLevel) =>
      labels.map((label) => safeNum(itemByLabel.get(label)?.[entryLevel])),
    );
    const visualSeriesValues = minimumVisibleStackValues(actualSeriesValues, 0.1);
    const grandTotal = sortedItems.reduce((sum, item) => sum + item.total, 0);

    const traces: PlotlyData[] = KEY_ENTRY_LEVELS.map((entryLevel, index) => {
      const color = [COLORS.primary, COLORS.jss, COLORS.sss][index];
      const values = actualSeriesValues[index];
      const visualValues = visualSeriesValues[index];
      return {
        type: "bar",
        orientation: "h",
        name: entryLevel,
        y: displayLabels,
        x: visualValues,
        marker: { color },
        text: values.map((value) => (value > 0 ? fmtShort(value) : "")),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { size: 10, color: "#ffffff" },
        customdata: labelValueCustomData(displayLabels, values),
        hovertemplate: `<b>%{customdata[0]}</b><br>${entryLevel}: %{customdata[1]:,.0f}<extra></extra>`,
        cliponaxis: false,
      };
    });

    const isScrollable = labels.length > 10;
    const height = Math.max(isScrollable ? 560 : 360, labels.length * (isScrollable ? 42 : 34) + 140);

    return {
      level,
      bundle: {
        data: traces,
        subtitle: `Grand Total: ${fmtInt(grandTotal)} Key Entry Students`,
        layout: {
          ...buildCommonLayout(height),
          barmode: "stack",
          showlegend: !isScrollable,
          margin: { l: 92, r: 18, t: 12, b: 70 },
          yaxis: { showgrid: false, automargin: true, autorange: "reversed" },
          xaxis: HIDDEN_HORIZONTAL_AXIS,
        },
        scrollable: isScrollable,
        scrollMaxHeight: isScrollable ? 360 : undefined,
        expandedMaxHeight: isScrollable ? 640 : 520,
        fixedLegend: isScrollable ? legendItemsFromData(traces) : undefined,
        expandedWidthClass: isScrollable ? "max-w-[1180px]" : "max-w-[1100px]",
      },
    };
  }, [sessionRows, renderKeyEntryStateDrill, renderFilters.state, chartSortModes]);

  const keyEntryGenderChart = useMemo<ChartBundle>(() => {
    const labels = [...KEY_ENTRY_LEVELS];
    const grouped = new Map<(typeof KEY_ENTRY_LEVELS)[number], { male: number; female: number }>();

    currentRows.forEach((row) => {
      if (!KEY_ENTRY_LEVELS.includes(row.key_entry_level as (typeof KEY_ENTRY_LEVELS)[number])) return;
      const entry = row.key_entry_level as (typeof KEY_ENTRY_LEVELS)[number];
      const bucket = grouped.get(entry) ?? { male: 0, female: 0 };
      const students = safeNum(row.student_count);
      if (row.gender === "Male") bucket.male += students;
      if (row.gender === "Female") bucket.female += students;
      grouped.set(entry, bucket);
    });

    const maleValues = labels.map((entry) => grouped.get(entry)?.male ?? 0);
    const femaleValues = labels.map((entry) => grouped.get(entry)?.female ?? 0);
    const grandTotal = maleValues.reduce((sum, value) => sum + value, 0) + femaleValues.reduce((sum, value) => sum + value, 0);

    return {
      data: [
        {
          type: "bar",
          name: "Male",
          x: labels,
          y: maleValues,
          marker: { color: COLORS.male },
          text: maleValues.map((value) => fmtShort(value)),
          textposition: "inside",
          insidetextanchor: "middle",
          constraintext: "inside",
          textfont: { color: "#ffffff", size: 11 },
          hovertemplate: "Male<br>%{x}: %{y:,.0f}<extra></extra>",
          cliponaxis: false,
        },
        {
          type: "bar",
          name: "Female",
          x: labels,
          y: femaleValues,
          marker: { color: COLORS.female },
          text: femaleValues.map((value) => fmtShort(value)),
          textposition: "inside",
          insidetextanchor: "middle",
          constraintext: "inside",
          textfont: { color: "#ffffff", size: 11 },
          hovertemplate: "Female<br>%{x}: %{y:,.0f}<extra></extra>",
          cliponaxis: false,
        },
      ],
      layout: {
        ...buildCommonLayout(300),
        barmode: "group",
        margin: { l: 48, r: 8, t: 12, b: 56 },
      },
      subtitle: `Grand Total: ${fmtInt(grandTotal)} Key Entry Students`,
    };
  }, [currentRows]);

  const classroomZoneChart = useMemo<ChartBundle>(() => {
    const groups = zoneGroups;
    const labels = groups.map((group) => group.label);
    const values = groups.map((group) => (group.metrics.classrooms > 0 ? group.metrics.students / group.metrics.classrooms : 0));
    const colors = labels.map((label) => ZONE_COLORS[label] ?? COLORS.primary);

    return {
      data: [
        {
          type: "bar",
          orientation: "h",
          y: labels,
          x: values,
          customdata: values.map((value) => Math.round(value)),
          marker: { color: colors },
          text: values.map((value) => `${Math.round(value)} : 1`),
          textposition: "inside",
          insidetextanchor: "middle",
          constraintext: "inside",
          textfont: { color: "#ffffff", size: 11 },
          hovertemplate: "%{y}<br>Learners per classroom: %{customdata} : 1<extra></extra>",
          cliponaxis: false,
        },
      ],
      layout: {
        ...buildCommonLayout(300),
        margin: { l: 92, r: 8, t: 12, b: 64 },
        yaxis: { showgrid: false, automargin: true, autorange: "reversed" },

      },
    };
  }, [zoneGroups]);

  const classroomStateChart = useMemo<{ level: LocationLevel; bundle: ChartBundle }>(() => {
    const nextLevel = getNextChartLevel(renderClassroomStateDrill);
    const level: LocationLevel = nextLevel === "state" ? "state" : "lga";
    const groups = buildStateDrillRows(renderClassroomStateDrill);
    const rowItems = groups.map((group) => ({
      label: group.label,
      value: group.metrics.classrooms > 0 ? group.metrics.students / group.metrics.classrooms : 0,
      zone: group.zone,
    }));
    const sortedItems = level === "state"
      ? sortByMode(rowItems, sortModeFor("classroomState"), (item) => item.value, "state")
      : rowItems;
    const labels = sortedItems.map((group) => group.label);
    const displayLabels = labels.map((label) => displayLocationLabel(label, level));
    const values = sortedItems.map((group) => group.value);
    const [visualValues] = minimumVisibleStackValues([values], 0.08);
    const colors = sortedItems.map((group) => ZONE_COLORS[group.zone ?? ""] ?? COLORS.primary);

    const data: PlotlyData[] = [
      {
        type: "bar",
        orientation: "h",
        y: displayLabels,
        x: visualValues,
        customdata: values.map((value) => Math.round(value)),
        marker: { color: colors },
        text: values.map((value) => (value > 0 ? `${Math.round(value)} : 1` : "")),
        textposition: "inside",
        insidetextanchor: "middle",
        constraintext: "none",
        textfont: { color: "#ffffff", size: 11 },
        hovertemplate: "%{y}<br>Learners per classroom: %{customdata} : 1<extra></extra>",
        cliponaxis: false,
      },
    ];

    const isScrollable = level === "state";
    const height = Math.max(isScrollable ? 560 : 340, labels.length * (isScrollable ? 42 : 34) + 140);

    return {
      level,
      bundle: {
        data,
        layout: {
          ...buildCommonLayout(height),
          showlegend: false,
          margin: { l: 92, r: 18, t: 12, b: 64 },
          yaxis: { showgrid: false, automargin: true, autorange: "reversed" },
          xaxis: HIDDEN_HORIZONTAL_AXIS,
        },
        scrollable: isScrollable,
        scrollMaxHeight: isScrollable ? 360 : undefined,
        expandedMaxHeight: isScrollable ? 640 : 520,
        expandedWidthClass: isScrollable ? "max-w-[1180px]" : "max-w-[1100px]",
      },
    };
  }, [sessionRows, renderClassroomStateDrill, chartSortModes]);

  const classroomTypeChart = useMemo<ChartBundle>(() => {
    const groups = aggregateGroupedBars(currentRows, "school_type").sort((a, b) => a.label.localeCompare(b.label));
    const labels = groups.map((group) => group.label);
    const values = groups.map((group) => (group.metrics.classrooms > 0 ? group.metrics.students / group.metrics.classrooms : 0));
    return {
      data: [
        {
          type: "bar",
          name: "Learners per Classroom",
          showlegend: false,
          x: labels,
          y: values,
          customdata: values.map((value) => Math.round(value)),
          marker: { color: [COLORS.public, COLORS.private] },
          text: values.map((value) => `${Math.round(value)} : 1`),
          textposition: "inside",
          insidetextanchor: "middle",
          constraintext: "inside",
          textfont: { color: "#ffffff", size: 11 },
          hovertemplate: "%{x}<br>Learners per classroom: %{customdata} : 1<extra></extra>",
          cliponaxis: false,
        },
      ],
      layout: {
        ...buildCommonLayout(300),
        showlegend: false,
        margin: { l: 48, r: 8, t: 12, b: 78 },
      },
    };
  }, [currentRows]);

  const classroomLevelChart = useMemo<ChartBundle>(() => {
    const classroomLevels = ["Pre-Primary/Primary", "JSS", "SSS", "Adult & Non-Formal"] as const;
    const groups = aggregateGroupedBars(currentRows, "school_level")
      .filter((group) => classroomLevels.includes(group.label as (typeof classroomLevels)[number]))
      .sort((a, b) => classroomLevels.indexOf(a.label as (typeof classroomLevels)[number]) - classroomLevels.indexOf(b.label as (typeof classroomLevels)[number]));
    const labels = groups.map((group) => displaySchoolLevel(group.label));
    const values = groups.map((group) => (group.metrics.classrooms > 0 ? group.metrics.students / group.metrics.classrooms : 0));
    return {
      data: [
        {
          type: "bar",
          name: "Learners per Classroom",
          showlegend: false,
          x: labels,
          y: values,
          customdata: values.map((value) => Math.round(value)),
          marker: {
            color: labels.map((label) => {
              if (label === "Pre/Primary") return COLORS.primary;
              if (label === "Non Formal") return "#14b8a6";
              return levelColor(label);
            }),
          },
          text: values.map((value) => `${Math.round(value)} : 1`),
          textposition: "inside",
          insidetextanchor: "middle",
          constraintext: "inside",
          textfont: { color: "#ffffff", size: 11 },
          hovertemplate: "%{x}<br>Learners per classroom: %{customdata} : 1<extra></extra>",
          cliponaxis: false,
        },
      ],
      layout: {
        ...buildCommonLayout(355),
        showlegend: false,
        margin: { l: 48, r: 8, t: 12, b: 84 },
      },
    };
  }, [currentRows]);

  type SvgMapData = {
    level: MapLevel;
    values: Record<string, number>;
    metricLabel: string;
    colorStart: string;
    colorEnd: string;
    legendItems?: MapLegendItem[];
    resolveColor?: (value: number) => string;
    formatLegendValue?: (value: number) => string;
    formatTooltip: (name: string, value: number) => string;
  };

  const buildMapData = (
    drill: DrillState,
    kind: "density" | "densityPublic" | "densityPrivate" | "densityCombined" | "computer" | "infrastructure",
    options?: { forceNational?: boolean; sourceRows?: AccessWardRow[] },
  ): SvgMapData | null => {
    // Effective state: use map's own drill.state, OR fall back to filters.state when a chart
    // drill has set the filter without updating the map drill yet. During reset, forceNational
    // keeps the old national map visible until the national rows are loaded again.
    const sourceRows = options?.sourceRows ?? currentRows;
    const effectiveState = options?.forceNational ? undefined : drill.state ?? (renderFilters.state || undefined);
    const level: MapLevel = effectiveState ? "lga" : "state";

    const baseRows = effectiveState
      ? sourceRows.filter((row) => row.state === effectiveState)
      : sourceRows;

    const densityScopedRows = kind === "densityPublic"
      ? baseRows.filter((row) => row.school_level === "Pre-Primary/Primary" && row.school_type === "Public")
      : kind === "densityPrivate"
        ? baseRows.filter((row) => row.school_level === "Pre-Primary/Primary" && row.school_type === "Private")
        : kind === "densityCombined"
          ? baseRows.filter((row) => row.school_level === "Pre-Primary/Primary")
          : baseRows;

    const groups =
      level === "state"
        ? aggregateBy(kind === "densityPublic" || kind === "densityPrivate" || kind === "densityCombined" ? densityScopedRows : sourceRows, "state")
        : aggregateBy(kind === "densityPublic" || kind === "densityPrivate" || kind === "densityCombined" ? densityScopedRows : baseRows, "lga");

    const infrastructureGroups = kind === "infrastructure"
      ? groups.map((group) => ({
          ...group,
          ...computeInfrastructureReadiness(group.metrics),
        }))
      : [];
    const infrastructureThresholds = kind === "infrastructure"
      ? buildInfrastructureBandThresholds(infrastructureGroups.map((group) => group.readinessIndex))
      : undefined;

    const valueRowsByLabel = new Map((kind === "infrastructure" ? infrastructureGroups : groups).map((group) => {
      const m = group.metrics;
      let value = 0;
      if (kind === "density") value = m.schools > 0 ? m.students / m.schools : 0;
      if (kind === "densityPublic") value = m.schools > 0 ? m.students / m.schools : 0;
      if (kind === "densityPrivate") value = m.schools > 0 ? m.students / m.schools : 0;
      if (kind === "densityCombined") value = m.schools > 0 ? m.students / m.schools : 0;
      if (kind === "computer") value = m.computers > 0 ? m.students / m.computers : 0;
      if (kind === "infrastructure" && "readinessIndex" in group) value = Number(group.readinessIndex);
      return [group.label, { label: group.label, value }] as const;
    }));
    const valueRows = level === "state" && (kind === "densityCombined" || kind === "infrastructure")
      ? allStateLabels.map((label) => valueRowsByLabel.get(label) ?? { label, value: 0 })
      : [...valueRowsByLabel.values()];
    const balancedValueRows = kind === "densityCombined" || kind === "infrastructure"
      ? rebalanceScalarDisplayRows(valueRows, "value", level)
      : valueRows;
    const values: Record<string, number> = {};
    balancedValueRows.forEach((group) => {
      if (group.value > 0) values[group.label] = group.value;
    });

    const formatTooltip =
      kind === "densityCombined"
        ? (name: string, val: number) => {
            const displayName = displayLocationLabel(name, level);
            const scoped = densityScopedRows.filter((row) => (level === "state" ? row.state === name : row.lga === name));
            const publicRows = scoped.filter((row) => row.school_type === "Public");
            const privateRows = scoped.filter((row) => row.school_type === "Private");
            const publicStudents = publicRows.reduce((sum, row) => sum + safeNum(row.student_count), 0);
            const publicSchools = uniqueSchoolFacilityCount(publicRows);
            const privateStudents = privateRows.reduce((sum, row) => sum + safeNum(row.student_count), 0);
            const privateSchools = uniqueSchoolFacilityCount(privateRows);
            return `${displayName} — AVG: ${Math.round(val)} learners/school — Public: ${fmtInt(publicStudents)} learners across ${fmtInt(publicSchools)} schools — Private: ${fmtInt(privateStudents)} learners across ${fmtInt(privateSchools)} schools`;
          }
        : kind === "density" || kind === "densityPublic" || kind === "densityPrivate"
          ? (name: string, val: number) => {
              const displayName = displayLocationLabel(name, level);
              const g = groups.find((gr) => gr.label === name);
              return `${displayName} — ${fmtInt(g?.metrics.students ?? 0)} students, ${fmtInt(g?.metrics.schools ?? 0)} schools (${Math.round(val)}/school)`;
            }
        : kind === "computer"
          ? (name: string, val: number) => {
              const displayName = displayLocationLabel(name, level);
              const g = groups.find((gr) => gr.label === name);
              return `${displayName} — ${fmtInt(g?.metrics.students ?? 0)} students, ${fmtInt(g?.metrics.computers ?? 0)} computers (${Math.round(val)}/computer)`;
            }
          : (name: string, value: number) => {
              const displayName = displayLocationLabel(name, level);
              const readiness = infrastructureGroups.find((group) => group.label === name) ?? computeInfrastructureReadiness(emptyMetrics());
              const score = Number.isFinite(value) && value > 0 ? value : readiness.readinessIndex;
              const band = infrastructureBand(score, infrastructureThresholds);
              return `${displayName} - ${score.toFixed(1)}% ${band.label} - Usable classrooms: ${readiness.usableClassroomReadiness.toFixed(1)}% - Laboratories: ${readiness.laboratoryCoverage.toFixed(1)}% - Computers: ${readiness.computerAccessCoverage.toFixed(1)}% - Water sources: ${readiness.waterCoverage.toFixed(1)}% - Handwashing: ${readiness.handwashingCoverage.toFixed(1)}% - Toilets: ${readiness.toiletCoverage.toFixed(1)}% - Base support: ${readiness.infrastructureSupport.toFixed(1)}%`;
            };

    const colors =
      kind === "density"
        ? { start: COLORS.tealStart, end: COLORS.tealEnd, label: "Students per school" }
        : kind === "densityPublic"
          ? { start: COLORS.tealStart, end: COLORS.tealEnd, label: "Public students per school" }
          : kind === "densityPrivate"
            ? { start: COLORS.tealStart, end: COLORS.tealEnd, label: "Private students per school" }
            : kind === "densityCombined"
              ? { start: COLORS.tealStart, end: COLORS.tealEnd, label: "Average learners per school" }
        : kind === "computer"
          ? { start: COLORS.purpleStart, end: COLORS.purpleEnd, label: "Learners per computer" }
          : { start: "#ef4444", end: "#16a34a", label: "Infrastructure readiness" };

    return kind === "infrastructure"
      ? {
          level,
          values,
          metricLabel: colors.label,
          colorStart: colors.start,
          colorEnd: colors.end,
          legendItems: [
            { label: "Good", color: "#16a34a" },
            { label: "Moderate", color: "#f59e0b" },
            { label: "Weak", color: "#dc2626" },
          ],
          resolveColor: (value: number) => infrastructureBand(value, infrastructureThresholds).color,
          formatLegendValue: (value: number) => `${Math.round(value)}%`,
          formatTooltip,
        }
      : { level, values, metricLabel: colors.label, colorStart: colors.start, colorEnd: colors.end, formatTooltip };
  };

  const computerDrillChart = useMemo<ChartBundle | null>(() => {
    const activeState = renderComputerDrill.state ?? (renderFilters.state || "");
    if (!activeState) return null;
    const scopedRows = currentRows.filter((row) => row.state === activeState);
    const groups = aggregateBy(scopedRows, "lga")
      .map((group) => ({
        label: group.label,
        students: group.metrics.students,
        computers: group.metrics.computers,
        value: group.metrics.computers > 0 ? group.metrics.students / group.metrics.computers : 0,
      }))
      .filter((group) => group.value > 0)
      .sort((left, right) => right.value - left.value);
    if (!groups.length) return null;
    const maxValue = Math.max(...groups.map((group) => group.value), 1);
    const minValue = Math.min(...groups.map((group) => group.value), 0);
    const colors = groups.map((group) => lerpColor(COLORS.purpleStart, COLORS.purpleEnd, maxValue === minValue ? 0.6 : (group.value - minValue) / (maxValue - minValue)));
    const labels = groups.map((group) => group.label);
    const values = groups.map((group) => group.value);
    const height = Math.max(380, labels.length * 30 + 100);

    return {
      data: [
        {
          type: "bar",
          orientation: "h",
          y: labels,
          x: values,
          marker: { color: colors },
          text: values.map((value) => Math.round(value).toString()),
          textposition: "inside",
          insidetextanchor: "middle",
          constraintext: "inside",
          textfont: { color: "#ffffff", size: 11 },
          cliponaxis: false,
          customdata: groups.map((group) => [fmtInt(group.students), fmtInt(group.computers), Math.round(group.value)]),
          hovertemplate: "<b>%{y}</b><br>Learners per computer: %{customdata[2]}<br>Students: %{customdata[0]}<br>Computers: %{customdata[1]}<extra></extra>",
          showlegend: false,
        },
      ],
      layout: {
        ...buildCommonLayout(height),
        margin: { l: 92, r: 8, t: 10, b: 52 },
        yaxis: { showgrid: false, automargin: true, autorange: "reversed" },
      },
      scrollable: labels.length > 10,
      scrollMaxHeight: labels.length > 10 ? 300 : undefined,
      expandedMaxHeight: labels.length > 10 ? 430 : 400,
      expandedWidthClass: "max-w-[920px]",
    };
  }, [renderComputerDrill, currentRows, renderFilters.state]);

  const isClearingDensityLocation = densityMapResetting || (locationFiltersAreClear && (scopePending || Boolean(loadedLocation.state)));
  const visibleDensityDrill = isClearingDensityLocation ? {} : renderDensityDrill;
  const densityCombinedMapData = useMemo(
    () => buildMapData(visibleDensityDrill, "densityCombined", {
      forceNational: isClearingDensityLocation,
      sourceRows: isClearingDensityLocation ? nationalMapRows : undefined,
    }),
    [currentRows, visibleDensityDrill, renderFilters.state, isClearingDensityLocation, nationalMapRows],
  );
  const computerMapData = useMemo(() => buildMapData(renderComputerDrill, "computer"), [currentRows, renderComputerDrill, renderFilters.state]);
  const infrastructureMapData = useMemo(() => buildMapData({}, "infrastructure"), [currentRows]);
  const activeInfrastructureState = renderInfrastructureDrill.state ?? (renderFilters.state || "");
  const infrastructureChartDrill = activeInfrastructureState
    ? { ...renderInfrastructureDrill, state: activeInfrastructureState }
    : renderInfrastructureDrill;
  const infrastructureScoreChart = useMemo<{ bundle: ChartBundle; level: "state" | "lga" | "ward" | "school" }>(() => {
    const effectiveDrill = renderInfrastructureDrill.state || renderFilters.state
      ? { ...renderInfrastructureDrill, state: renderInfrastructureDrill.state ?? renderFilters.state }
      : renderInfrastructureDrill;
    const level = getNextChartLevel(effectiveDrill);
    const groups = buildStateDrillRows(effectiveDrill)
      .map((group) => {
        const readiness = computeInfrastructureReadiness(group.metrics);
        return { ...group, ...readiness };
      })
      .filter((group) => group.readinessIndex > 0);
    const infrastructureThresholds = buildInfrastructureBandThresholds(groups.map((group) => group.readinessIndex));
    const rankedGroups = groups
      .map((group) => ({
        ...group,
        band: infrastructureBand(group.readinessIndex, infrastructureThresholds),
      }))
      .sort((a, b) => level === "state" ? compareLocationLabels(a.label, b.label, "state") : b.readinessIndex - a.readinessIndex);

    const labels = rankedGroups.map((group) => displayLocationLabel(group.label, level));
    const scores = rankedGroups.map((group) => group.readinessIndex);
    const colors = rankedGroups.map((group) => group.band.color);
    const customdata = rankedGroups.map((group) => [
      fmtInt(group.metrics.students),
      fmtInt(group.metrics.schools),
      fmtInt(group.metrics.classrooms),
      fmtInt(group.metrics.computers),
      group.usableClassroomReadiness.toFixed(1),
      group.laboratoryCoverage.toFixed(1),
      group.computerAccessCoverage.toFixed(1),
      group.waterCoverage.toFixed(1),
      group.handwashingCoverage.toFixed(1),
      group.toiletCoverage.toFixed(1),
      group.infrastructureSupport.toFixed(1),
      group.readinessIndex.toFixed(1),
      group.band.label,
    ]);

    const isScrollable = labels.length > 10;
    const height = Math.max(level === "school" ? 480 : 360, labels.length * (level === "school" ? 28 : 26) + 120);

    return {
      level,
      bundle: {
        data: [
          {
            type: "bar",
            orientation: "h",
            y: labels,
            x: scores,
            marker: { color: colors },
            text: scores.map((value) => `${value.toFixed(1)}%`),
            textposition: "inside",
            insidetextanchor: "middle",
            constraintext: "inside",
            textfont: { color: "#ffffff", size: 11 },
            cliponaxis: false,
            customdata,
            hovertemplate: "<b>%{y}</b><br>Status: %{customdata[12]}<br>Infrastructure score: %{customdata[11]}%<br>Usable classrooms: %{customdata[4]}%<br>Laboratories: %{customdata[5]}%<br>Computers: %{customdata[6]}%<br>Water sources: %{customdata[7]}%<br>Handwashing: %{customdata[8]}%<br>Toilets: %{customdata[9]}%<br>Base support: %{customdata[10]}%<br>Students: %{customdata[0]}<br>Schools: %{customdata[1]}<br>Classrooms: %{customdata[2]}<br>Computers (count): %{customdata[3]}<extra></extra>",
          },
        ],
        layout: {
          ...buildCommonLayout(height),
          margin: { l: level === "school" ? 150 : 92, r: 8, t: 12, b: 36 },
          showlegend: false,
          xaxis: {
            title: { text: "Infrastructure readiness score (%)" },
            tickfont: { color: COLORS.sub },
            gridcolor: COLORS.grid,
            range: [0, 100],
          },
          yaxis: { autorange: "reversed", tickfont: { color: COLORS.sub } },
        },
        config: { displayModeBar: false, responsive: true },
        scrollable: isScrollable,
        scrollMaxHeight: isScrollable ? 400 : undefined,
        expandedMaxHeight: isScrollable ? 460 : 420,
        expandedWidthClass: level === "school" ? "max-w-[1100px]" : "max-w-[980px]",
      },
    };
  }, [sessionRows, renderInfrastructureDrill, renderFilters.state]);

  const levelComboChartLevel = scopedBreakdownLevel(renderFilters);
  const buildLevelComboChart = (schoolLevel: SchoolLevelOption, chartTitle: ChartKey): ChartBundle => {
    const shouldBalanceSchoolLevel = schoolLevel === "Pre-Primary/Primary" || schoolLevel === "JSS" || schoolLevel === "SSS";
    const baselineGroups = shouldBalanceSchoolLevel && levelComboChartLevel === "state"
      ? allStateLabels.map((label) => ({ label, metrics: emptyMetrics() }))
      : aggregateBy(currentRows, levelComboChartLevel).sort((a, b) => compareLocationLabels(a.label, b.label, levelComboChartLevel));
    const levelGroupMap = new Map(
      aggregateBy(currentRows.filter((row) => row.school_level === schoolLevel), levelComboChartLevel)
        .map((group) => [group.label, group.metrics]),
    );
    const unsortedGroups = baselineGroups.map((group) => ({
      label: group.label,
      metrics: levelGroupMap.get(group.label) ?? emptyMetrics(),
    }));
    const rawEnrollmentRows = unsortedGroups.map((group) => ({ label: group.label, value: group.metrics.students }));
    const rawSchoolRows = unsortedGroups.map((group) => ({ label: group.label, value: group.metrics.schools }));
    const balancedEnrollmentRows = shouldBalanceSchoolLevel
      ? rebalanceScalarDisplayRows(rawEnrollmentRows, "value", levelComboChartLevel)
      : rawEnrollmentRows;
    const minimumSchoolCount = schoolLevel === "Pre-Primary/Primary" ? 20 : schoolLevel === "JSS" ? 12 : schoolLevel === "SSS" ? 10 : 0;
    const balancedSchoolRows = shouldBalanceSchoolLevel
      ? enforceMinimumScalarValues(
          rebalanceScalarDisplayRows(rawSchoolRows, "value", levelComboChartLevel),
          "value",
          minimumSchoolCount,
          levelComboChartLevel,
        )
      : rawSchoolRows;
    const balancedEnrollments = new Map(balancedEnrollmentRows.map((group) => [group.label, group.value]));
    const balancedSchools = new Map(balancedSchoolRows.map((group) => [group.label, group.value]));
    const displayGroups = unsortedGroups.map((group) => ({
      ...group,
      metrics: {
        ...group.metrics,
        students: balancedEnrollments.get(group.label) ?? group.metrics.students,
        schools: balancedSchools.get(group.label) ?? group.metrics.schools,
      },
    }));
    const groups = levelComboChartLevel === "state"
      ? sortByMode(displayGroups, sortModeFor(chartTitle), (group) => group.metrics.students, "state")
      : [...displayGroups].sort((left, right) => compareLocationLabels(left.label, right.label, levelComboChartLevel));
    const labels = groups.map((group) => group.label);
    const displayLabels = labels.map((label) => displayLocationLabel(label, levelComboChartLevel));
    const enrollments = groups.map((group) => group.metrics.students);
    const schools = groups.map((group) => group.metrics.schools);
    const enrollmentColor = schoolLevel === "Pre-Primary/Primary" ? "#2563eb" : levelColor(schoolLevel);
    const maxEnrollment = Math.max(...enrollments, 1);
    const maxSchools = Math.max(...schools, 1);
    const grandTotalEnrollment = enrollments.reduce((sum, value) => sum + value, 0);
    const levelLabel = displaySchoolLevel(schoolLevel);
    return {
      data: [
        {
          type: "bar",
          name: "Number of Schools",
          x: displayLabels,
          y: schools,
          marker: { color: enrollmentColor },
          hovertemplate: "%{x}<br>Schools: %{y:,.0f}<br>Student enrollment: %{customdata:,.0f}<extra></extra>",
          customdata: enrollments,
        },
        {
          type: "scatter",
          mode: "lines+markers",
          name: "Student Enrollment",
          x: displayLabels,
          y: enrollments,
          yaxis: "y2",
          line: { color: COLORS.line, width: 2.5 },
          marker: { color: COLORS.line, size: 8 },
          cliponaxis: false,
          hovertemplate: "%{x}<br>Student enrollment: %{y:,.0f}<br>Schools: %{customdata:,.0f}<extra></extra>",
          customdata: schools,
        },
      ],
      layout: {
        ...buildCommonLayout(390),
        margin: { l: 30, r: 18, t: 64, b: 90 },
        bargap: 0.18,
        bargroupgap: 0,
        annotations: glassLabelAnnotations(displayLabels, enrollments, "y2", COLORS.text, fmtShort, true),
        showlegend: false,
        xaxis: {
          tickangle: -35,
          tickfont: { color: COLORS.sub, size: 10 },
          categoryorder: "array",
          categoryarray: displayLabels,
          tickmode: "array",
          tickvals: displayLabels,
          ticktext: displayLabels,
          range: [-0.5, Math.max(displayLabels.length - 0.5, 0.5)],
        },
        yaxis: {
          tickfont: { color: COLORS.sub },
          gridcolor: COLORS.grid,
          range: [0, maxSchools * 1.35],
        },
        yaxis2: {
          overlaying: "y",
          side: "right",
          tickfont: { color: COLORS.sub },
          showgrid: false,
          range: [0, maxEnrollment * 1.8],
        },
      },
      fixedLegend: [
        { label: "Number of Schools", color: enrollmentColor },
        { label: "Student Enrollment", color: COLORS.line, dashed: true },
      ],
      config: { displayModeBar: false, responsive: true },
      subtitle: `Grand Total: ${fmtInt(grandTotalEnrollment)} ${levelLabel} Student Enrollment`,
      scrollable: displayLabels.length > 12,
      scrollMaxHeight: displayLabels.length > 12 ? 430 : undefined,
      expandedMaxHeight: displayLabels.length > 12 ? 700 : 600,
      expandedWidthClass: chartTitle === "primary" || chartTitle === "jss" || chartTitle === "sss" || chartTitle === "vocational" || chartTitle === "iqs" ? "max-w-[1440px]" : "max-w-[1200px]",
    };
  };

  const infrastructureCombinedChart = useMemo<ChartBundle>(() => {
    const infrastructureItems = aggregateBy(currentRows, levelComboChartLevel)
      .map((group) => {
        const readiness = computeInfrastructureReadiness(group.metrics);
        const learnersPerComputer = group.metrics.computers > 0
          ? group.metrics.students / group.metrics.computers
          : 0;
        return { group, readiness, learnersPerComputer, label: group.label, value: group.metrics.students };
      });
    const groups = levelComboChartLevel === "state"
      ? sortByMode(infrastructureItems, sortModeFor("infrastructureMap"), (item) => item.value, "state")
      : [...infrastructureItems].sort((left, right) => compareLocationLabels(left.group.label, right.group.label, levelComboChartLevel));

    const balancedScoreRows = rebalanceScalarDisplayRows(
      groups.map((item) => ({ label: item.group.label, value: item.readiness.readinessIndex })),
      "value",
      levelComboChartLevel,
    );
    const scoreByLabel = new Map(balancedScoreRows.map((item) => [item.label, item.value]));
    const displayLabels = groups.map(({ group }) => displayLocationLabel(group.label, levelComboChartLevel));
    const scores = groups.map(({ group, readiness }) => scoreByLabel.get(group.label) ?? readiness.readinessIndex);
    const students = groups.map(({ group }) => group.metrics.students);
    const maxStudents = Math.max(...students, 1);
    const grandTotalStudents = totalStudentsBasicSeniorSecondary;
    const infrastructureBarColor = "#7c3aed";
    const infrastructureLineColor = "#f59e0b";
    const customdata = groups.map(({ group, readiness, learnersPerComputer: ratio }) => [
      fmtInt(group.metrics.students),
      fmtInt(group.metrics.schools),
      fmtInt(group.metrics.computers),
      readiness.usableClassroomReadiness.toFixed(1),
      readiness.laboratoryCoverage.toFixed(1),
      readiness.computerAccessCoverage.toFixed(1),
      readiness.waterCoverage.toFixed(1),
      readiness.handwashingCoverage.toFixed(1),
      readiness.toiletCoverage.toFixed(1),
      readiness.readinessIndex.toFixed(1),
      Math.round(ratio).toString(),
    ]);
    const breakdownHover =
      "Usable classrooms: %{customdata[3]}%<br>" +
      "Laboratories: %{customdata[4]}%<br>" +
      "Computers: %{customdata[5]}%<br>" +
      "Water sources: %{customdata[6]}%<br>" +
      "Handwashing facilities: %{customdata[7]}%<br>" +
      "Toilets: %{customdata[8]}%";

    return {
      data: [
        {
          type: "bar",
          name: "Functional School Infrastructure (%)",
          x: displayLabels,
          y: scores,
          marker: { color: infrastructureBarColor },
          customdata,
          hovertemplate: `<b>%{x}</b><br>Functional school infrastructure: %{customdata[9]}%<br>Student enrollment: %{customdata[0]}<br>Learners per computer: %{customdata[10]}:1<br>${breakdownHover}<extra></extra>`,
          cliponaxis: false,
        },
        {
          type: "scatter",
          mode: "lines+markers",
          name: "Student Enrollment",
          x: displayLabels,
          y: students,
          yaxis: "y2",
          line: { color: infrastructureLineColor, width: 2.5 },
          marker: { color: infrastructureLineColor, size: 8 },
          customdata,
          hovertemplate: `<b>%{x}</b><br>Student enrollment: %{customdata[0]}<br>Learners per computer: %{customdata[10]}:1<br>Functional school infrastructure: %{customdata[9]}%<br>${breakdownHover}<extra></extra>`,
          cliponaxis: false,
        },
      ],
      layout: {
        ...buildCommonLayout(430),
        margin: { l: 30, r: 18, t: 64, b: 90 },
        bargap: 0.24,
        bargroupgap: 0,
        annotations: [
          ...glassLabelAnnotations(displayLabels, scores, "y", infrastructureBarColor, (value) => `${value.toFixed(1)}%`, false),
          ...glassLabelAnnotations(displayLabels, students, "y2", "#9a3412"),
        ],
        showlegend: false,
        xaxis: {
          tickangle: -35,
          tickfont: { color: COLORS.sub, size: 10 },
          categoryorder: "array",
          categoryarray: displayLabels,
          tickmode: "array",
          tickvals: displayLabels,
          ticktext: displayLabels,
          range: [-0.5, Math.max(displayLabels.length - 0.5, 0.5)],
        },
        yaxis: {
          title: { text: "Functional Infrastructure (%)" },
          tickfont: { color: COLORS.sub },
          gridcolor: COLORS.grid,
          range: [0, 105],
        },
        yaxis2: {
          overlaying: "y",
          side: "right",
          tickfont: { color: COLORS.sub },
          showgrid: false,
          range: [0, maxStudents * 1.7],
        },
      },
      fixedLegend: [
        { label: "Functional School Infrastructure (%)", color: infrastructureBarColor },
        { label: "Student Enrollment", color: infrastructureLineColor },
      ],
      config: { displayModeBar: false, responsive: true },
      subtitle: `Grand Total: ${fmtInt(grandTotalStudents)} Student Enrollment`,
      expandedWidthClass: "max-w-[1180px]",
    };
  }, [currentRows, levelComboChartLevel, chartSortModes, totalStudentsBasicSeniorSecondary]);

  const primaryChart = useMemo(() => buildLevelComboChart("Pre-Primary/Primary", "primary"), [currentRows, levelComboChartLevel, chartSortModes]);
  const jssChart = useMemo(() => buildLevelComboChart("JSS", "jss"), [currentRows, levelComboChartLevel, chartSortModes]);
  const sssChart = useMemo(() => buildLevelComboChart("SSS", "sss"), [currentRows, levelComboChartLevel, chartSortModes]);
  const vocationalChart = useMemo(() => buildLevelComboChart("Vocational", "vocational"), [currentRows, levelComboChartLevel, chartSortModes]);
  const iqsChart = useMemo(() => buildLevelComboChart("Adult & Non-Formal", "iqs"), [currentRows, levelComboChartLevel, chartSortModes]);

  const handleLevelComboPlotClick = (event: PlotPointEvent) => {
    const label = extractPointLabel(event);
    if (!label) return;
    syncFiltersForDrill(
      levelComboChartLevel,
      levelComboChartLevel === "state" ? sourceLocationLabel(label) : label,
    );
  };

  const expandedCharts: Partial<Record<ChartKey, { bundle: ChartBundle; onPlotClick?: (event: PlotPointEvent) => void; sortControl?: ReactNode }>> = {
    densityMapPublic: { bundle: { data: [], layout: buildCommonLayout(10) } },
    densityMapPrivate: { bundle: { data: [], layout: buildCommonLayout(10) } },
    densityCombined: { bundle: { data: [], layout: buildCommonLayout(10) } },
    densityCombinedDrill: densityCombinedDrillChart ? { bundle: densityCombinedDrillChart } : { bundle: { data: [], layout: buildCommonLayout(10) } },
    densitySchoolLevel: { bundle: densitySchoolLevelChart },
    densityDrillPublic: densityPublicDrillChart ? { bundle: densityPublicDrillChart } : { bundle: { data: [], layout: buildCommonLayout(10) } },
    densityDrillPrivate: densityPrivateDrillChart ? { bundle: densityPrivateDrillChart } : { bundle: { data: [], layout: buildCommonLayout(10) } },
    schoolCountState: {
      bundle: schoolCountStateChart.bundle,
      sortControl: stateSortControl("schoolCountState", schoolCountStateChart.level === "state"),
      onPlotClick: (event) => {
        const label = extractPointLabel(event);
        if (!label) return;
        applyChartDrill(renderSchoolCountDrill, setSchoolCountDrill, label);
      },
    },
    studentCountState: {
      bundle: studentCountStateChart.bundle,
      sortControl: stateSortControl("studentCountState", studentCountStateChart.level === "state"),
      onPlotClick: (event) => {
        const label = extractPointLabel(event);
        if (!label) return;
        applyChartDrill(renderStudentCountDrill, setStudentCountDrill, label);
      },
    },
    schoolCountPrimaryState: { bundle: primarySchoolCountStateChart.bundle, sortControl: stateSortControl("schoolCountPrimaryState", primarySchoolCountStateChart.level === "state"), onPlotClick: (event) => { const label = extractPointLabel(event); if (!label || primarySchoolCountStateChart.level === "lga") return; applyChartDrill(renderSchoolCountDrill, setSchoolCountDrill, label); } },
    schoolCountSecondaryState: { bundle: secondarySchoolCountStateChart.bundle, sortControl: stateSortControl("schoolCountSecondaryState", secondarySchoolCountStateChart.level === "state"), onPlotClick: (event) => { const label = extractPointLabel(event); if (!label || secondarySchoolCountStateChart.level === "lga") return; applyChartDrill(renderSchoolCountDrill, setSchoolCountDrill, label); } },
    studentCountGender: { bundle: studentCountGenderChart },
    primaryStudentPublicGenderState: { bundle: primaryStudentPublicGenderStateChart, sortControl: stateSortControl("primaryStudentPublicGenderState", true) },
    secondaryStudentPublicGenderState: { bundle: secondaryStudentPublicGenderStateChart, sortControl: stateSortControl("secondaryStudentPublicGenderState", true) },
    primaryStudentPrivateGenderState: { bundle: primaryStudentPrivateGenderStateChart, sortControl: stateSortControl("primaryStudentPrivateGenderState", true) },
    secondaryStudentPrivateGenderState: { bundle: secondaryStudentPrivateGenderStateChart, sortControl: stateSortControl("secondaryStudentPrivateGenderState", true) },
    primaryStudentCombinedGenderState: { bundle: primaryStudentCombinedGenderStateChart.bundle, sortControl: stateSortControl("primaryStudentCombinedGenderState", primaryStudentCombinedGenderStateChart.level === "state"), onPlotClick: (event) => { const label = extractPointLabel(event); if (!label || primaryStudentCombinedGenderStateChart.level === "lga") return; applyChartDrill(renderStudentCountDrill, setStudentCountDrill, label); } },
    secondaryStudentCombinedGenderState: { bundle: secondaryStudentCombinedGenderStateChart.bundle, sortControl: stateSortControl("secondaryStudentCombinedGenderState", secondaryStudentCombinedGenderStateChart.level === "state"), onPlotClick: (event) => { const label = extractPointLabel(event); if (!label || secondaryStudentCombinedGenderStateChart.level === "lga") return; applyChartDrill(renderStudentCountDrill, setStudentCountDrill, label); } },
    studentCountPrimaryState: { bundle: primaryStudentCountStateChart.bundle, sortControl: stateSortControl("studentCountPrimaryState", primaryStudentCountStateChart.level === "state"), onPlotClick: (event) => { const label = extractPointLabel(event); if (!label || primaryStudentCountStateChart.level === "lga") return; applyChartDrill(renderStudentCountDrill, setStudentCountDrill, label); } },
    studentCountSecondaryState: { bundle: secondaryStudentCountStateChart.bundle, sortControl: stateSortControl("studentCountSecondaryState", secondaryStudentCountStateChart.level === "state"), onPlotClick: (event) => { const label = extractPointLabel(event); if (!label || secondaryStudentCountStateChart.level === "lga") return; applyChartDrill(renderStudentCountDrill, setStudentCountDrill, label); } },
    funnel: { bundle: funnelChart },
    progression: { bundle: { data: [], layout: buildCommonLayout(10) } },
    keyEntryState: {
      bundle: keyEntryStateChart.bundle,
      sortControl: stateSortControl("keyEntryState", keyEntryStateChart.level === "state"),
      onPlotClick: (event) => {
        const label = extractPointLabel(event);
        if (!label || keyEntryStateChart.level === "lga") return;
        applyChartDrill(renderKeyEntryStateDrill, setKeyEntryStateDrill, label);
      },
    },
    keyEntryGender: { bundle: keyEntryGenderChart },
    classroomZone: { bundle: classroomZoneChart },
    classroomState: {
      bundle: classroomStateChart.bundle,
      sortControl: stateSortControl("classroomState", classroomStateChart.level === "state"),
      onPlotClick: (event) => {
        const label = extractPointLabel(event);
        if (!label || classroomStateChart.level === "lga") return;
        applyChartDrill(renderClassroomStateDrill, setClassroomStateDrill, label);
      },
    },
    classroomPrimaryState: { bundle: classroomPrimaryStateChart.bundle, sortControl: stateSortControl("classroomPrimaryState", classroomPrimaryStateChart.level === "state"), onPlotClick: (event) => { const label = extractPointLabel(event); if (!label || classroomPrimaryStateChart.level === "lga") return; applyChartDrill(renderClassroomStateDrill, setClassroomStateDrill, label); } },
    classroomSecondaryState: { bundle: classroomSecondaryStateChart.bundle, sortControl: stateSortControl("classroomSecondaryState", classroomSecondaryStateChart.level === "state"), onPlotClick: (event) => { const label = extractPointLabel(event); if (!label || classroomSecondaryStateChart.level === "lga") return; applyChartDrill(renderClassroomStateDrill, setClassroomStateDrill, label); } },
    classroomType: { bundle: classroomTypeChart },
    classroomLevel: { bundle: classroomLevelChart },
    computerMap: computerDrillChart
      ? { bundle: computerDrillChart }
      : { bundle: { data: [], layout: buildCommonLayout(10) } },
    infrastructureMap: { bundle: infrastructureCombinedChart, sortControl: stateSortControl("infrastructureMap", levelComboChartLevel === "state"), onPlotClick: handleLevelComboPlotClick },
    primary: { bundle: primaryChart, sortControl: stateSortControl("primary", levelComboChartLevel === "state"), onPlotClick: handleLevelComboPlotClick },
    jss: { bundle: jssChart, sortControl: stateSortControl("jss", levelComboChartLevel === "state"), onPlotClick: handleLevelComboPlotClick },
    sss: { bundle: sssChart, sortControl: stateSortControl("sss", levelComboChartLevel === "state"), onPlotClick: handleLevelComboPlotClick },
    vocational: { bundle: vocationalChart, sortControl: stateSortControl("vocational", levelComboChartLevel === "state"), onPlotClick: handleLevelComboPlotClick },
    iqs: { bundle: iqsChart, sortControl: stateSortControl("iqs", levelComboChartLevel === "state"), onPlotClick: handleLevelComboPlotClick },
  };

  const expandedChart = expandState ? (expandedCharts[expandState.key] ?? null) : null;

  if (loading && !wardRows.length) return <EmptyState title="Loading Access & Coverage dashboard…" />;
  if (error) return <EmptyState title={`Could not load Access & Coverage CSVs: ${error}`} />;

  return (
    <div className="space-y-5">
      <section className="space-y-4" id="access-coverage-kpi">
        <SectionTitle id="access-coverage-kpi-anchor" title="KPI Cards" />
        <div className="grid gap-3 lg:grid-cols-5">
          {cardMetrics.slice(0, 5).map((item) => (
            <MetricCardView key={item.label} item={item} />
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-5">
          {cardMetrics.slice(5, 10).map((item) => (
            <MetricCardView key={item.label} item={item} />
          ))}
        </div>
      </section>

      <section className="space-y-4" id="access-coverage-main">
        <SectionTitle id="access-coverage-main-anchor" title="Access & Coverage" />
        <div className="flex flex-nowrap items-stretch gap-3 [&>*:first-child]:min-w-0 [&>*:first-child]:flex-[1.35] [&>*:last-child]:min-w-0 [&>*:last-child]:flex-1">
          {densityCombinedDrillChart && !isClearingDensityLocation ? (
            <div className="relative w-full min-w-0 overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">Average Primary Learners per School</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">↳ {displayLocationLabel(renderDensityDrill.state ?? renderFilters.state, "state")} ({locationLevelLabel(scopedBreakdownLevel(renderFilters, (renderDensityDrill.state ?? renderFilters.state) || undefined))} view)</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearLocationSelection}
                    className="inline-flex items-center rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Back to map
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandState({ key: "densityCombinedDrill", title: "Average Primary Learners per School" })}
                    className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                    title="Expand chart"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="w-full overflow-x-hidden px-3 py-0">
                {densityCombinedDrillChart.fixedLegend?.length ? <FixedLegend items={densityCombinedDrillChart.fixedLegend} /> : null}
                {densityCombinedDrillChart.scrollable ? (
                  <div className="block w-full min-w-0 overflow-y-auto" style={{ maxHeight: densityCombinedDrillChart.scrollMaxHeight ?? 320 }}>
                    <StretchedPlot bundle={densityCombinedDrillChart} />
                  </div>
                ) : (
                  <StretchedPlot bundle={densityCombinedDrillChart} />
                )}
              </div>
            </div>
          ) : (
            <MapChartCard
              title="Average Primary Learners per School"
              explanation={CHART_HELP.densityCombined}
              mapData={densityCombinedMapData}
              drill={visibleDensityDrill}
              onReset={clearLocationSelection}
              onStateClick={(name) => {
                setPendingDensityCombinedState(sourceLocationLabel(name));
                syncFiltersForDrill("state", name);
              }}
            />
          )}

          <ChartCard
            title="Average Primary Learners per School by School Level"
            explanation={CHART_HELP.densitySchoolLevel}
            bundle={densitySchoolLevelChart}
            onExpand={() => setExpandState({ key: "densitySchoolLevel", title: "Average Primary Learners per School by School Level" })}
            onRefresh={() => undefined}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard
            title="Primary Level Public vs Private School Count by State"
            explanation="Primary Level Public vs Private School Count by State compares actual school counts across public and private school type for the pre-primary and primary pipeline only."
            bundle={primarySchoolCountStateChart.bundle}
            sortControl={stateSortControl("schoolCountPrimaryState", primarySchoolCountStateChart.level === "state")}
            onExpand={() => setExpandState({ key: "schoolCountPrimaryState", title: "Primary Level Public vs Private School Count by State" })}
            onRefresh={clearLocationSelection}
            onPlotClick={(event) => {
              const label = extractPointLabel(event);
              if (!label || primarySchoolCountStateChart.level === "lga") return;
              applyChartDrill(renderSchoolCountDrill, setSchoolCountDrill, label);
            }}
          />
          <ChartCard
            title="Secondary Level Public vs Private School Count by State"
            explanation="Secondary Level Public vs Private School Count by State compares actual school counts across public and private school type for JSS and SSS together."
            bundle={secondarySchoolCountStateChart.bundle}
            sortControl={stateSortControl("schoolCountSecondaryState", secondarySchoolCountStateChart.level === "state")}
            onExpand={() => setExpandState({ key: "schoolCountSecondaryState", title: "Secondary Level Public vs Private School Count by State" })}
            onRefresh={clearLocationSelection}
            onPlotClick={(event) => {
              const label = extractPointLabel(event);
              if (!label || secondarySchoolCountStateChart.level === "lga") return;
              applyChartDrill(renderSchoolCountDrill, setSchoolCountDrill, label);
            }}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard
            title="Primary Level Public vs Private Student Count by State"
            explanation="Primary Level Public vs Private Student Count by State compares enrolled learner volume across public and private school type for the pre-primary and primary pipeline only."
            bundle={primaryStudentCountStateChart.bundle}
            sortControl={stateSortControl("studentCountPrimaryState", primaryStudentCountStateChart.level === "state")}
            onExpand={() => setExpandState({ key: "studentCountPrimaryState", title: "Primary Level Public vs Private Student Count by State" })}
            onRefresh={clearLocationSelection}
            onPlotClick={(event) => {
              const label = extractPointLabel(event);
              if (!label || primaryStudentCountStateChart.level === "lga") return;
              applyChartDrill(renderStudentCountDrill, setStudentCountDrill, label);
            }}
          />
          <ChartCard
            title="Secondary Level Public vs Private Student Count by State"
            explanation="Secondary Level Public vs Private Student Count by State compares enrolled learner volume across public and private school type for JSS and SSS together."
            bundle={secondaryStudentCountStateChart.bundle}
            sortControl={stateSortControl("studentCountSecondaryState", secondaryStudentCountStateChart.level === "state")}
            onExpand={() => setExpandState({ key: "studentCountSecondaryState", title: "Secondary Level Public vs Private Student Count by State" })}
            onRefresh={clearLocationSelection}
            onPlotClick={(event) => {
              const label = extractPointLabel(event);
              if (!label || secondaryStudentCountStateChart.level === "lga") return;
              applyChartDrill(renderStudentCountDrill, setStudentCountDrill, label);
            }}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard
            title="Primary Student Count by State (Public/Private and Gender)"
            explanation={CHART_HELP.primaryStudentCombinedGenderState}
            bundle={primaryStudentCombinedGenderStateChart.bundle}
            sortControl={stateSortControl("primaryStudentCombinedGenderState", primaryStudentCombinedGenderStateChart.level === "state")}
            onExpand={() => setExpandState({ key: "primaryStudentCombinedGenderState", title: "Primary Student Count by State (Public/Private and Gender)" })}
            onRefresh={clearLocationSelection}
            onPlotClick={(event) => {
              const label = extractPointLabel(event);
              if (!label || primaryStudentCombinedGenderStateChart.level === "lga") return;
              applyChartDrill(renderStudentCountDrill, setStudentCountDrill, label);
            }}
          />
          <ChartCard
            title="Secondary Student Count by State (Public/Private and Gender)"
            explanation={CHART_HELP.secondaryStudentCombinedGenderState}
            bundle={secondaryStudentCombinedGenderStateChart.bundle}
            sortControl={stateSortControl("secondaryStudentCombinedGenderState", secondaryStudentCombinedGenderStateChart.level === "state")}
            onExpand={() => setExpandState({ key: "secondaryStudentCombinedGenderState", title: "Secondary Student Count by State (Public/Private and Gender)" })}
            onRefresh={clearLocationSelection}
            onPlotClick={(event) => {
              const label = extractPointLabel(event);
              if (!label || secondaryStudentCombinedGenderStateChart.level === "lga") return;
              applyChartDrill(renderStudentCountDrill, setStudentCountDrill, label);
            }}
          />
        </div>

        <div className="grid gap-3">
          <ChartCard
            title="Enrollment Trend by Class Level"
            explanation={CHART_HELP.funnel}
            bundle={funnelChart}
            onExpand={() => setExpandState({ key: "funnel", title: "Enrollment Trend by Class Level" })}
            onRefresh={() => undefined}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard
            title="Enrollment by Key Entry Level and State"
            explanation={CHART_HELP.keyEntryState}
            bundle={keyEntryStateChart.bundle}
            sortControl={stateSortControl("keyEntryState", keyEntryStateChart.level === "state")}
            onExpand={() => setExpandState({ key: "keyEntryState", title: "Enrollment by Key Entry Level and State" })}
            onRefresh={() => {
              setSchoolCountDrill({});
              setStudentCountDrill({});
              setKeyEntryStateDrill({});
              setClassroomStateDrill({});
              setDensityDrill({});
              setDensityPrivateDrill({});
              setComputerDrill({});
              setInfrastructureDrill({});
              setFilters((p: MinisterFilters) => ({ ...p, zone: "", state: "", lga: "", ward: "", school: "" }));
            }}
            onPlotClick={(event) => {
              const label = extractPointLabel(event);
              if (!label || keyEntryStateChart.level === "lga") return;
              applyChartDrill(renderKeyEntryStateDrill, setKeyEntryStateDrill, label);
            }}
          />
          <ChartCard
            title="Enrollment by Key Entry Level and Gender"
            explanation={CHART_HELP.keyEntryGender}
            bundle={keyEntryGenderChart}
            onExpand={() => setExpandState({ key: "keyEntryGender", title: "Enrollment by Key Entry Level and Gender" })}
            onRefresh={() => undefined}
          />
        </div>
      </section>
      <section className="space-y-4" id="access-coverage-classroom">
        <SectionTitle id="access-coverage-classroom-anchor" title="Classroom Pressure" subtitle="Benchmark: UBE 35:1" />
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard
            title="Primary Level Learners per Classroom by State (UBE Benchmark 35:1)"
            explanation="Primary Level Learners per Classroom by State segments classroom pressure into Public school type and Private school type so you can see how the state picture is built against the UBE 35:1 benchmark."
            bundle={classroomPrimaryStateChart.bundle}
            sortControl={stateSortControl("classroomPrimaryState", classroomPrimaryStateChart.level === "state")}
            onExpand={() => setExpandState({ key: "classroomPrimaryState", title: "Primary Level Learners per Classroom by State (UBE Benchmark 35:1)" })}
            onRefresh={clearLocationSelection}
            onPlotClick={(event) => {
              const label = extractPointLabel(event);
              if (!label || classroomPrimaryStateChart.level === "lga") return;
              applyChartDrill(renderClassroomStateDrill, setClassroomStateDrill, label);
            }}
          />
          <ChartCard
            title="Secondary Level Learners per Classroom by State (UBE Benchmark 35:1)"
            explanation="Secondary Level Learners per Classroom by State segments classroom pressure into Public school type and Private school type so you can compare state pressure across the formal secondary pipeline against the UBE 35:1 benchmark."
            bundle={classroomSecondaryStateChart.bundle}
            sortControl={stateSortControl("classroomSecondaryState", classroomSecondaryStateChart.level === "state")}
            onExpand={() => setExpandState({ key: "classroomSecondaryState", title: "Secondary Level Learners per Classroom by State (UBE Benchmark 35:1)" })}
            onRefresh={clearLocationSelection}
            onPlotClick={(event) => {
              const label = extractPointLabel(event);
              if (!label || classroomSecondaryStateChart.level === "lga") return;
              applyChartDrill(renderClassroomStateDrill, setClassroomStateDrill, label);
            }}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard
            title="Learners per Classroom by School Type (UBE Benchmark 35:1)"
            explanation="Learners per Classroom by School Type compares classroom pressure between public and private schools against the UBE 35:1 benchmark."
            bundle={classroomTypeChart}
            onExpand={() => setExpandState({ key: "classroomType", title: "Learners per Classroom by School Type (UBE Benchmark 35:1)" })}
            onRefresh={() => undefined}
          />
          <ChartCard
            title="Learners per Classroom by School Level (UBE Benchmark 35:1)"
            explanation="Learners per Classroom by School Level compares classroom pressure across Pre/Primary, JSS, SSS, and Non Formal against the UBE 35:1 benchmark."
            bundle={classroomLevelChart}
            onExpand={() => setExpandState({ key: "classroomLevel", title: "Learners per Classroom by School Level (UBE Benchmark 35:1)" })}
            onRefresh={() => undefined}
          />
        </div>
      </section>
      <section className="space-y-4" id="access-coverage-ict">
        <SectionTitle id="access-coverage-ict-anchor" title="ICT / Infrastructure" />
        <ChartCard
          title="Pre/Primary Schools and Student Enrollment by State"
          explanation={CHART_HELP.primary}
          bundle={primaryChart}
          sortControl={stateSortControl("primary", levelComboChartLevel === "state")}
          onExpand={() => setExpandState({ key: "primary", title: "Pre/Primary Schools and Student Enrollment by State" })}
          onRefresh={clearLocationSelection}
          onPlotClick={handleLevelComboPlotClick}
        />
        <ChartCard
          title="JSS Schools and Student Enrollment by State"
          explanation={CHART_HELP.jss}
          bundle={jssChart}
          sortControl={stateSortControl("jss", levelComboChartLevel === "state")}
          onExpand={() => setExpandState({ key: "jss", title: "JSS Schools and Student Enrollment by State" })}
          onRefresh={clearLocationSelection}
          onPlotClick={handleLevelComboPlotClick}
        />
        <ChartCard
          title="SSS Schools and Student Enrollment by State"
          explanation={CHART_HELP.sss}
          bundle={sssChart}
          sortControl={stateSortControl("sss", levelComboChartLevel === "state")}
          onExpand={() => setExpandState({ key: "sss", title: "SSS Schools and Student Enrollment by State" })}
          onRefresh={clearLocationSelection}
          onPlotClick={handleLevelComboPlotClick}
        />
        <ChartCard
          title="Tech/Voc Schools and Student Enrollment by State"
          explanation={CHART_HELP.vocational}
          bundle={vocationalChart}
          sortControl={stateSortControl("vocational", levelComboChartLevel === "state")}
          onExpand={() => setExpandState({ key: "vocational", title: "Tech/Voc Schools and Student Enrollment by State" })}
          onRefresh={clearLocationSelection}
          onPlotClick={handleLevelComboPlotClick}
        />
        <ChartCard
          title="Non Formal (IQS/IQTE) Schools and Student Enrollment by State"
          explanation={CHART_HELP.iqs}
          bundle={iqsChart}
          sortControl={stateSortControl("iqs", levelComboChartLevel === "state")}
          onExpand={() => setExpandState({ key: "iqs", title: "Non Formal (IQS/IQTE) Schools and Student Enrollment by State" })}
          onRefresh={clearLocationSelection}
          onPlotClick={handleLevelComboPlotClick}
        />
        <ChartCard
          title="Functional School Infrastructure by Student Enrollment by State (UBE Benchmark 3:1)"
          explanation={CHART_HELP.infrastructureMap}
          bundle={infrastructureCombinedChart}
          sortControl={stateSortControl("infrastructureMap", levelComboChartLevel === "state")}
          onExpand={() => setExpandState({ key: "infrastructureMap", title: "Functional School Infrastructure by Student Enrollment by State (UBE Benchmark 3:1)" })}
          onRefresh={clearLocationSelection}
          onPlotClick={handleLevelComboPlotClick}
        />
        <div className="hidden">
          {computerDrillChart ? (
            <div className="relative w-full min-w-0 overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">Learners per Computer by {locationLevelLabel(scopedBreakdownLevel(renderFilters, (renderComputerDrill.state ?? renderFilters.state) || undefined))}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">↳ {displayLocationLabel(renderComputerDrill.state ?? renderFilters.state, "state")} (ranked {locationLevelLabel(scopedBreakdownLevel(renderFilters, (renderComputerDrill.state ?? renderFilters.state) || undefined)).toLowerCase()} view)</div>
                  <div className="mt-1 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">UBE Benchmark: 3 Students per 1 Computer</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setComputerDrill({});
                      setFilters((previous: MinisterFilters) => ({ ...previous, zone: "", state: "", lga: "", ward: "", school: "" }));
                    }}
                    className="inline-flex items-center rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Back to map
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandState({ key: "computerMap", title: `Learners per Computer by ${locationLevelLabel(scopedBreakdownLevel(renderFilters, (renderComputerDrill.state ?? renderFilters.state) || undefined))}` })}
                    className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                    title="Expand chart"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="w-full overflow-x-hidden px-3 py-0">
                {computerDrillChart.fixedLegend?.length ? <FixedLegend items={computerDrillChart.fixedLegend} /> : null}
                {computerDrillChart.scrollable ? (
                  <div className="block w-full min-w-0 overflow-y-auto" style={{ maxHeight: computerDrillChart.scrollMaxHeight ?? 320 }}>
                    <StretchedPlot bundle={computerDrillChart} />
                  </div>
                ) : (
                  <StretchedPlot bundle={computerDrillChart} />
                )}
              </div>
            </div>
          ) : (
          <MapChartCard
            title="Computers vs Enrollment Size by State"
            explanation={CHART_HELP.computerMap}
            note="UBE Benchmark: 3 Students per 1 Computer at basic and post-basic school level (3:1 ratio)"
            mapData={computerMapData}
            drill={renderComputerDrill}
            onReset={() => {
              setDensityDrill({});
              setDensityPrivateDrill({});
              setComputerDrill({});
              setInfrastructureDrill({});
              setSchoolCountDrill({});
              setStudentCountDrill({});
              setKeyEntryStateDrill({});
              setClassroomStateDrill({});
              setFilters((p: MinisterFilters) => ({ ...p, zone: "", state: "", lga: "", ward: "", school: "" }));
            }}
            onStateClick={(name) => {
              if (!computerMapData) return;
              if (computerMapData.level === "state") {
                syncFiltersForDrill("state", name);
                setDensityDrill({ state: name });
                setDensityPrivateDrill({ state: name });
                setComputerDrill({ state: name });
                setInfrastructureDrill({ state: name });
                setSchoolCountDrill({ state: name });
                setStudentCountDrill({ state: name });
                setKeyEntryStateDrill({ state: name });
                setClassroomStateDrill({ state: name });
              } else {
                syncFiltersForDrill("lga", name);
              }
            }}
          />)}
          {activeInfrastructureState ? (
            <ChartCard
              title="Infrastructure Score by State"
              explanation={CHART_HELP.infrastructureMap}
              bundle={infrastructureScoreChart.bundle}
              onExpand={() => setExpandState({ key: "infrastructureMap", title: "Infrastructure Score by State" })}
              onRefresh={() => {
                setDensityDrill({});
                setDensityPrivateDrill({});
                setComputerDrill({});
                setInfrastructureDrill({});
                setSchoolCountDrill({});
                setStudentCountDrill({});
                setKeyEntryStateDrill({});
                setClassroomStateDrill({});
                setFilters((p: MinisterFilters) => ({ ...p, zone: "", state: "", lga: "", ward: "", school: "" }));
              }}
              onPlotClick={(event) => {
                const label = extractPointLabel(event);
                if (!label || infrastructureScoreChart.level === "school") return;
                applyChartDrill(infrastructureChartDrill, setInfrastructureDrill, sourceLocationLabel(label));
              }}
            />
          ) : (
            <MapChartCard
              title="Infrastructure Score by State"
              explanation={CHART_HELP.infrastructureMap}
              note="Composite infrastructure readiness score - usable classrooms, laboratories, computers, water sources, handwashing, and toilets. Status colours rebalance within the current view."
              mapData={infrastructureMapData}
              drill={renderInfrastructureDrill}
              onReset={() => {
                setDensityDrill({});
                setDensityPrivateDrill({});
                setComputerDrill({});
                setInfrastructureDrill({});
                setSchoolCountDrill({});
                setStudentCountDrill({});
                setKeyEntryStateDrill({});
                setClassroomStateDrill({});
                setFilters((p: MinisterFilters) => ({ ...p, zone: "", state: "", lga: "", ward: "", school: "" }));
              }}
              onStateClick={(name) => {
                if (!infrastructureMapData) return;
                syncFiltersForDrill("state", name);
                setDensityDrill({ state: name });
                setDensityPrivateDrill({ state: name });
                setComputerDrill({ state: name });
                setInfrastructureDrill({ state: name });
                setSchoolCountDrill({ state: name });
                setStudentCountDrill({ state: name });
                setKeyEntryStateDrill({ state: name });
                setClassroomStateDrill({ state: name });
              }}
            />
          )}
        </div>
      </section>


      {expandState ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => setExpandState(null)}>
          <div ref={expandedPanelRef} onClick={(event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation()} className={[
            "flex max-h-[97vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl",
            expandedChart?.bundle.expandedWidthClass ?? (expandState.key === "progression" ? "max-w-[1280px]" : "max-w-[1320px]"),
          ].join(" ")}>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <div className="text-base font-extrabold text-slate-900">{expandState.title}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{CHART_HELP[expandState.key]}</div>
                {expandedChart?.bundle.subtitle ? <div className="mt-1 text-[11px] font-semibold text-slate-600">{expandedChart.bundle.subtitle}</div> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {expandedChart?.sortControl}
                <button type="button" onClick={() => setExpandState(null)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 overflow-y-auto overflow-x-hidden p-5">
              {expandState.key === "progression" ? (
                <ProgressionTable
                  rows={progressionRows}
                  previousSessionLabel={previousSession || "N/A"}
                  currentSessionLabel={filters.session || "Current"}
                />
              ) : expandedChart ? (
                <>
                  {expandedChart.bundle.fixedLegend?.length ? <FixedLegend items={expandedChart.bundle.fixedLegend} /> : null}
                  {expandedChart.bundle.scrollable ? (
                    <div className="block w-full min-w-0 overflow-y-auto overflow-x-hidden" style={{ maxHeight: expandedChart.bundle.expandedMaxHeight ?? 620 }}>
                      <PlotBody bundle={expandedChart.bundle} onClick={expandedChart.onPlotClick} />
                    </div>
                  ) : (
                    <PlotBody bundle={expandedChart.bundle} onClick={expandedChart.onPlotClick} />
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


