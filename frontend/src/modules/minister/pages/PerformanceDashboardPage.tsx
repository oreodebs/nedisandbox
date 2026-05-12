import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, Dispatch, MouseEvent as ReactMouseEvent, ReactNode, SetStateAction } from "react";
import Plot from "react-plotly.js";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgePercent,
  FileBarChart2,
  GraduationCap,
  HelpCircle,
  Landmark,
  Maximize2,
  Minus,
  RotateCw,
  School,
  UserCheck,
  X,
} from "lucide-react";

import type { DimSession, MinisterFilters } from "../types";
import {
  canonicalState,
  loadRefinedScopedRows,
} from "../utils/refinedPageData";
import {
  PERFORMANCE_SESSIONS,
  TRANSITION_SESSIONS,
  filterRowsBySessionWindow,
} from "../utils/sessionWindows";
import {
  filterCanonicalTransitionRows,
  sumCanonicalTransitionMetrics,
  type CanonicalTransitionRow,
} from "../utils/canonicalTransitionMetrics";

type PerformanceRow = {
  session: string;
  zone: string;
  state: string;
  lga: string;
  ward: string;
  school: string;
  loc_level?: string;
  gender: string;
  disability: string;
  olevel_exam_body: string;
  institution_type?: string;
  candidate_count: number;
  passed_count: number;
  pass_rate_pct: number;
  utme_candidate_count: number;
  utme_qualified_count: number;
  utme_qualifying_rate_pct: number;
  admitted_count: number;
  admission_rate_pct: number;
  matriculated_count: number;
  matriculation_completion_rate_pct: number;
};


type PlotPoint = {
  x?: string | number;
  y?: string | number;
  label?: string | number;
  customdata?: unknown;
};

type PlotPointEvent = {
  points?: PlotPoint[];
};

type PlotDatum = Record<string, unknown>;
type PlotLayout = Record<string, unknown>;
type PlotConfig = Record<string, unknown>;

type LocationLevel = "zone" | "state" | "lga" | "ward" | "school";

type DrillContext = {
  level: LocationLevel;
  label: string;
  zone?: string;
  state?: string;
  lga?: string;
  ward?: string;
  school?: string;
};

type DrillKey =
  | "waecZone"
  | "waecState"
  | "necoZone"
  | "necoState"
  | "nabtebZone"
  | "nabtebState"
  | "utmeZone"
  | "utmeState";

type ExpandChartKey =
  | "waecGender"
  | "waecZone"
  | "waecState"
  | "necoGender"
  | "necoZone"
  | "necoState"
  | "nabtebGender"
  | "nabtebZone"
  | "nabtebState"
  | "utmeGender"
  | "utmeZone"
  | "utmeState"
  | "trend";

type ExpandState =
  | {
      title: string;
      chartKey: ExpandChartKey;
    }
  | null;

type RateMetric = "pass" | "utme";

type GroupedRate = {
  label: string;
  numerator: number;
  denominator: number;
  rate: number;
};

type LocationGenderSplit = {
  location: string;
  maleNumerator: number;
  maleDenominator: number;
  femaleNumerator: number;
  femaleDenominator: number;
  maleRate: number;
  femaleRate: number;
  overallRate: number;
  totalNumerator: number;
  totalDenominator: number;
  sampleRow?: PerformanceRow;
};

type TrendPoint = {
  year: string;
  numerator: number;
  denominator: number;
  rate: number;
};

type MetricCard = {
  label: string;
  value: number;
  delta: number | null;
  icon: ReactNode;
  accent: string;
  bg: string;
  help: string;
  numerator?: number;
  denominator?: number;
  numeratorLabel?: string;
  denominatorLabel?: string;
  breakdown?: Array<{ label: string; value: string }>;
};

type LegendItem = {
  label: string;
  color: string;
  dashed?: boolean;
};

type ChartBundle = {
  data: PlotDatum[];
  layout: PlotLayout;
  config?: PlotConfig;
  scrollable?: boolean;
  scrollMaxHeight?: number;
  expandedMaxHeight?: number;
  expandedWidthClass?: string;
  fixedLegend?: LegendItem[];
  titleNote?: string;
};

type LocationChartResult = {
  bundle: ChartBundle;
  level: LocationLevel;
  scopedRows: PerformanceRow[];
};

type ExpandedChartEntry = {
  bundle?: ChartBundle;
  onPlotClick?: (event: PlotPointEvent) => void;
};

const COLORS = {
  text: "#0f172a",
  sub: "#64748b",
  grid: "rgba(15, 23, 42, 0.10)",
  bg: "rgba(0,0,0,0)",
  waec: "#2563eb",
  neco: "#10b981",
  nabteb: "#f59e0b",
  utme: "#8b5cf6",
  benchmark: "#ef4444",
  male: "#2563eb",
  female: "#ec4899",
  admission: "#0ea5e9",
  matric: "#14b8a6",
};

const DRILL_START_LEVEL: Record<DrillKey, LocationLevel> = {
  waecZone: "zone",
  waecState: "state",
  necoZone: "zone",
  necoState: "state",
  nabtebZone: "zone",
  nabtebState: "state",
  utmeZone: "zone",
  utmeState: "state",
};

const ZONE_ORDER = ["North West", "North East", "North Central", "South West", "South East", "South South"] as const;
const GENDER_ORDER = ["Male", "Female"] as const;

type SortMode = "alphabetical" | "desc" | "asc";
type SortablePerformanceChartKey = Extract<
  ExpandChartKey,
  | "waecZone"
  | "waecState"
  | "necoZone"
  | "necoState"
  | "nabtebZone"
  | "nabtebState"
  | "utmeZone"
  | "utmeState"
>;

const DEFAULT_SORT_MODE: SortMode = "alphabetical";
const SORTABLE_PERFORMANCE_CHART_KEYS: SortablePerformanceChartKey[] = [
  "waecZone",
  "waecState",
  "necoZone",
  "necoState",
  "nabtebZone",
  "nabtebState",
  "utmeZone",
  "utmeState",
];
const DEFAULT_PERFORMANCE_SORT_MODES: Record<SortablePerformanceChartKey, SortMode> = {
  waecZone: DEFAULT_SORT_MODE,
  waecState: DEFAULT_SORT_MODE,
  necoZone: DEFAULT_SORT_MODE,
  necoState: DEFAULT_SORT_MODE,
  nabtebZone: DEFAULT_SORT_MODE,
  nabtebState: DEFAULT_SORT_MODE,
  utmeZone: DEFAULT_SORT_MODE,
  utmeState: DEFAULT_SORT_MODE,
};

const ABUJA_STATE_NAME = "Abuja Federal Capital Territory";
const ABUJA_STATE_LABEL = "FCT";
const STATE_ZONE_MAP: Record<string, string> = {
  Abia: "South East",
  Adamawa: "North East",
  "Akwa Ibom": "South South",
  Anambra: "South East",
  Bauchi: "North East",
  Bayelsa: "South South",
  Benue: "North Central",
  Borno: "North East",
  "Cross River": "South South",
  Delta: "South South",
  Ebonyi: "South East",
  Edo: "South South",
  Ekiti: "South West",
  Enugu: "South East",
  [ABUJA_STATE_NAME]: "North Central",
  FCT: "North Central",
  "Abuja FCT": "North Central",
  Abuja: "North Central",
  Gombe: "North East",
  Imo: "South East",
  Jigawa: "North West",
  Kaduna: "North West",
  Kano: "North West",
  Katsina: "North West",
  Kebbi: "North West",
  Kogi: "North Central",
  Kwara: "North Central",
  Lagos: "South West",
  Nasarawa: "North Central",
  Niger: "North Central",
  Ogun: "South West",
  Ondo: "South West",
  Osun: "South West",
  Oyo: "South West",
  Plateau: "North Central",
  Rivers: "South South",
  Sokoto: "North West",
  Taraba: "North East",
  Yobe: "North East",
  Zamfara: "North West",
};
const STATE_SOURCE_NAMES = Object.keys(STATE_ZONE_MAP).filter(
  (state) => ![ABUJA_STATE_LABEL, "Abuja FCT", "Abuja"].includes(state),
);

const BENCHMARK_BADGES: Record<"WAEC" | "NECO" | "NABTEB" | "UTME", string> = {
  WAEC: "Benchmark: 50%",
  NECO: "Benchmark: 50%",
  NABTEB: "Benchmark: 50%",
  UTME: "Benchmark: >180",
};

const BENCHMARK_EXPLANATIONS: Record<"WAEC" | "NECO" | "NABTEB" | "UTME", string> = {
  WAEC: "Benchmark: 50% means the 5-credit threshold including English and Mathematics.",
  NECO: "Benchmark: 50% means the 5-credit threshold including English and Mathematics.",
  NABTEB: "Benchmark: 50% means the 5-credit threshold including English and Mathematics.",
  UTME: "Benchmark: >180 means candidates who scored above 180 in UTME.",
};

function benchmarkedTitle(title: string, examBody: "WAEC" | "NECO" | "NABTEB" | "UTME"): string {
  return `${title} (${BENCHMARK_BADGES[examBody]})`;
}

function genderColorsForExam(examBody: string): { male: string; female: string } {
  if (examBody === "WAEC") return { male: "#2563eb", female: "#10b981" };
  if (examBody === "NECO") return { male: "#f59e0b", female: "#f97316" };
  if (examBody === "NABTEB") return { male: "#8b5cf6", female: "#ec4899" };
  if (examBody === "UTME") return { male: "#0ea5e9", female: "#14b8a6" };
  return { male: COLORS.male, female: COLORS.female };
}

const HELP_TEXT: Record<ExpandChartKey, string> = {
  waecGender: `${BENCHMARK_EXPLANATIONS.WAEC} This chart compares WAEC pass rate between male and female students. The figure inside the bar is the number who passed, while the rate label shows the pass rate.`,
  waecZone: `${BENCHMARK_EXPLANATIONS.WAEC} This chart compares WAEC pass rate across locations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill from Zone into State, then deeper into LGA, Ward, and School.`,
  waecState: `${BENCHMARK_EXPLANATIONS.WAEC} This chart ranks WAEC pass rate across states and deeper sublocations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill deeper.`,
  necoGender: `${BENCHMARK_EXPLANATIONS.NECO} This chart compares NECO pass rate between male and female students. The figure inside the bar is the number who passed, while the rate label shows the pass rate.`,
  necoZone: `${BENCHMARK_EXPLANATIONS.NECO} This chart compares NECO pass rate across locations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill deeper.`,
  necoState: `${BENCHMARK_EXPLANATIONS.NECO} This chart ranks NECO pass rate across states and deeper sublocations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill deeper.`,
  nabtebGender: `${BENCHMARK_EXPLANATIONS.NABTEB} This chart compares NABTEB pass rate between male and female students. The figure inside the bar is the number who passed, while the rate label shows the pass rate.`,
  nabtebZone: `${BENCHMARK_EXPLANATIONS.NABTEB} This chart compares NABTEB pass rate across locations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill deeper.`,
  nabtebState: `${BENCHMARK_EXPLANATIONS.NABTEB} This chart ranks NABTEB pass rate across states and deeper sublocations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill deeper.`,
  utmeGender: `${BENCHMARK_EXPLANATIONS.UTME} This chart compares UTME qualifying rate between male and female students. The figure inside the bar is the number who scored above 180, while the rate label shows the qualifying rate.`,
  utmeZone: `${BENCHMARK_EXPLANATIONS.UTME} This chart compares UTME qualifying rate across locations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill deeper.`,
  utmeState: `${BENCHMARK_EXPLANATIONS.UTME} This chart ranks UTME qualifying rate across states and deeper sublocations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill deeper.`,
  trend: "This chart shows the three-year trend for WAEC, NECO, NABTEB, and UTME. The labels on the points show the rates, and hovering shows the underlying student counts.",
};

function safeNum(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function fmtDelta(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function ratePointDelta(current: number, previous: number | null): number | null {
  if (previous === null || !Number.isFinite(previous)) return null;
  const value = round1(current - previous);
  return Object.is(value, -0) ? 0 : value;
}

function rateDeltaWithCountFallback(
  currentRate: number,
  previousRate: number | null,
  currentCount: number,
  previousCount: number,
): number | null {
  const pointDelta = ratePointDelta(currentRate, previousRate);
  if (pointDelta === null) return null;
  if (Math.abs(pointDelta) >= 0.1 || previousCount <= 0 || currentCount === previousCount) return pointDelta;
  return round1(((currentCount - previousCount) / previousCount) * 100);
}

function fmtInt(value: number): string {
  return Math.round(value).toLocaleString();
}

function barCountLabel(value: number, _total: number): string {
  if (value <= 0) return "";
  return fmtInt(value);
}

function buildCommonLayout(height = 320): PlotLayout {
  return {
    autosize: true,
    height,
    paper_bgcolor: COLORS.bg,
    plot_bgcolor: COLORS.bg,
    margin: { l: 58, r: 18, t: 18, b: 56 },
    font: { family: "Inter, DM Sans, system-ui, sans-serif", size: 12, color: COLORS.text },
    xaxis: { gridcolor: COLORS.grid, zeroline: false, tickfont: { color: COLORS.sub } },
    yaxis: { gridcolor: COLORS.grid, zeroline: false, tickfont: { color: COLORS.sub }, automargin: true },
    hoverlabel: { bgcolor: "#0f172a", font: { color: "#fff" } },
    clickmode: "event",
    dragmode: false,
    showlegend: false,
    uirevision: "performance-ui",
    uniformtext: { mode: "show", minsize: 10 },
  };
}

function chartPixelHeight(layout: PlotLayout | undefined, fallback = 320): number {
  const value = layout?.height;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}


function cloneChartBundle(bundle?: ChartBundle): ChartBundle | undefined {
  if (!bundle) return undefined;

  return {
    ...bundle,
    data: bundle.data.map((item) => JSON.parse(JSON.stringify(item)) as PlotDatum),
    layout: JSON.parse(JSON.stringify(bundle.layout)) as PlotLayout,
    config: bundle.config ? (JSON.parse(JSON.stringify(bundle.config)) as PlotConfig) : undefined,
    fixedLegend: bundle.fixedLegend?.map((item) => ({ ...item })),
    titleNote: bundle.titleNote,
  };
}

function expandedChartBundle(bundle?: ChartBundle, chartKey?: ExpandChartKey): ChartBundle | undefined {
  const cloned = cloneChartBundle(bundle);
  if (!cloned) return undefined;

  if (chartKey && isSortablePerformanceChartKey(chartKey)) {
    const currentHeight = chartPixelHeight(cloned.layout, 420);
    const isStateLikeChart = cloned.scrollable === true;
    cloned.expandedWidthClass = isStateLikeChart ? "max-w-[1040px]" : "max-w-[940px]";
    cloned.expandedMaxHeight = isStateLikeChart ? 520 : 430;
    cloned.layout = {
      ...cloned.layout,
      height: isStateLikeChart ? Math.max(currentHeight, 560) : Math.min(Math.max(currentHeight, 430), 500),
      bargap: isStateLikeChart ? 0.18 : 0.22,
      margin: { l: isStateLikeChart ? 112 : 92, r: 42, t: 10, b: 28 },
      xaxis: {
        ...((cloned.layout.xaxis as Record<string, unknown> | undefined) ?? {}),
        automargin: false,
        fixedrange: false,
      },
      yaxis: {
        ...((cloned.layout.yaxis as Record<string, unknown> | undefined) ?? {}),
        automargin: false,
        tickfont: { color: COLORS.sub, size: 10.5 },
      },
    };
  }

  return cloned;
}

function weightedRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function yearFromSession(session: string): string {
  const value = `${session}`;
  return value.includes("/") ? value.split("/")[0] ?? value : value;
}


function displayLocationLabel(label: string, level?: LocationLevel): string {
  const trimmed = String(label ?? "").trim();
  if ((level === undefined || level === "state") && [ABUJA_STATE_NAME, ABUJA_STATE_LABEL, "Abuja FCT", "Abuja"].includes(trimmed)) {
    return ABUJA_STATE_LABEL;
  }
  return trimmed;
}

function sourceLocationLabel(label: string): string {
  const trimmed = String(label ?? "").trim();
  return [ABUJA_STATE_LABEL, "Abuja FCT", "Abuja"].includes(trimmed) ? ABUJA_STATE_NAME : trimmed;
}

function zoneForState(state: string): string {
  return STATE_ZONE_MAP[sourceLocationLabel(state)] ?? STATE_ZONE_MAP[state] ?? "";
}

function compareLocationLabels(left: string, right: string, level?: LocationLevel): number {
  return displayLocationLabel(left, level).localeCompare(displayLocationLabel(right, level));
}

function stateLabelsForZone(zone: string): string[] {
  return STATE_SOURCE_NAMES.filter((state) => !zone || STATE_ZONE_MAP[state] === zone).sort((left, right) => compareLocationLabels(left, right, "state"));
}

function isSortablePerformanceChartKey(chartKey: ExpandChartKey): chartKey is SortablePerformanceChartKey {
  return (SORTABLE_PERFORMANCE_CHART_KEYS as ExpandChartKey[]).includes(chartKey);
}

function formatBreakdownShare(value: number, total: number): string {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return `${fmtInt(value)} (${pct.toFixed(1)}%)`;
}

function scaleValuesToTotal(values: number[], targetTotal: number): number[] {
  const cleanValues = values.map((value) => Math.max(0, safeNum(value)));
  const cleanTarget = Math.max(0, Math.round(safeNum(targetTotal)));
  const currentTotal = cleanValues.reduce((sum, value) => sum + value, 0);

  if (cleanTarget <= 0 || currentTotal <= 0) return cleanValues.map(() => 0);

  const scaled = cleanValues.map((value) => (value / currentTotal) * cleanTarget);
  const roundedDown = scaled.map((value) => Math.floor(value));
  let remainder = cleanTarget - roundedDown.reduce((sum, value) => sum + value, 0);
  const order = scaled
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction);

  for (const item of order) {
    if (remainder <= 0) break;
    roundedDown[item.index] += 1;
    remainder -= 1;
  }

  return roundedDown;
}

function splitTotalByShares(total: number, shares: number[]): number[] {
  const cleanTotal = Math.max(0, Math.round(safeNum(total)));
  if (cleanTotal <= 0) return shares.map(() => 0);

  const rawValues = shares.map((share) => Math.max(0, share) * cleanTotal);
  const roundedDown = rawValues.map((value) => Math.floor(value));
  let remainder = cleanTotal - roundedDown.reduce((sum, value) => sum + value, 0);
  const order = rawValues
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction);

  for (const item of order) {
    if (remainder <= 0) break;
    roundedDown[item.index] += 1;
    remainder -= 1;
  }

  return roundedDown;
}

function titleGrandTotal(label: string, value: number): string {
  return `Grand Total: ${fmtInt(value)} ${label}`;
}

function minimumVisibleStackValues(seriesValues: number[][], minRatio = 0.065): number[][] {
  const rowCount = Math.max(0, ...seriesValues.map((series) => series.length));
  const totals = Array.from({ length: rowCount }, (_, index) =>
    seriesValues.reduce((sum, series) => sum + Math.max(0, safeNum(series[index])), 0),
  );
  const maxTotal = Math.max(...totals, 1);
  const minimum = maxTotal * minRatio;

  return seriesValues.map((series) =>
    series.map((value) => {
      const numeric = safeNum(value);
      if (numeric <= 0) return 0;
      return Math.max(numeric, minimum);
    }),
  );
}

function horizontalValueAxis(rangeMax: number): Record<string, unknown> {
  return {
    range: [0, Math.max(1, Math.ceil(rangeMax * 1.08))],
    showgrid: false,
    showticklabels: false,
    zeroline: false,
    ticks: "",
    fixedrange: true,
  };
}

function locationLabel(row: PerformanceRow, level: LocationLevel): string {
  if (level === "zone") return row.zone;
  if (level === "state") return row.state;
  if (level === "lga") return row.lga;
  if (level === "ward") return row.ward;
  return row.school;
}

type WardFinalScopeDepth = "top" | "lga" | "ward";

function expectedWardFinalLocLevel(filters: MinisterFilters): LocationLevel {
  if (filters.lga || filters.ward) return "ward";
  if (filters.state) return "lga";
  return "state";
}

function scopeDepthForWardFinal(filters: MinisterFilters): WardFinalScopeDepth {
  if (!filters.state) return "top";
  if (filters.lga || filters.ward) return "ward";
  return "lga";
}

function withoutSchoolFilter(filters: MinisterFilters): MinisterFilters {
  return filters.school ? { ...filters, school: "" } : filters;
}


function filterRows(rows: PerformanceRow[], filters: MinisterFilters, disabilityMode: boolean, ignoreSession = false): PerformanceRow[] {
  const effectiveFilters = withoutSchoolFilter(filters);
  const expectedLocLevel = expectedWardFinalLocLevel(effectiveFilters);
  return rows.filter((row) => {
    if (!ignoreSession && row.session !== effectiveFilters.session) return false;
    if (row.loc_level && row.loc_level.toLowerCase() !== expectedLocLevel) return false;
    if (effectiveFilters.zone && row.zone !== effectiveFilters.zone) return false;
    if (effectiveFilters.state && canonicalState(row.state) !== canonicalState(effectiveFilters.state)) return false;
    if (effectiveFilters.lga && row.lga !== effectiveFilters.lga) return false;
    if (effectiveFilters.ward && row.ward !== effectiveFilters.ward) return false;
    if (effectiveFilters.gender && row.gender !== effectiveFilters.gender) return false;
    if (effectiveFilters.exam_body && row.olevel_exam_body !== effectiveFilters.exam_body) return false;
    if (disabilityMode ? row.disability !== "Disabled" : row.disability === "Disabled") return false;
    return true;
  });
}

function filterRowsForExam(rows: PerformanceRow[], examBody: "WAEC" | "NECO" | "NABTEB"): PerformanceRow[] {
  return rows.filter((row) => row.olevel_exam_body === examBody);
}

function passRate(rows: PerformanceRow[]): number {
  const numerator = rows.reduce((sum, row) => sum + safeNum(row.passed_count), 0);
  const denominator = rows.reduce((sum, row) => sum + safeNum(row.candidate_count), 0);
  return weightedRate(numerator, denominator);
}

function utmeRate(rows: PerformanceRow[]): number {
  const numerator = rows.reduce((sum, row) => sum + safeNum(row.utme_qualified_count), 0);
  const denominator = rows.reduce((sum, row) => sum + safeNum(row.utme_candidate_count), 0);
  return weightedRate(numerator, denominator);
}

function admissionRate(rows: PerformanceRow[]): number {
  const numerator = rows.reduce((sum, row) => sum + safeNum(row.admitted_count), 0);
  const denominator = rows.reduce((sum, row) => sum + safeNum(row.utme_qualified_count), 0);
  return weightedRate(numerator, denominator);
}

function matricRate(rows: PerformanceRow[]): number {
  const numerator = rows.reduce((sum, row) => sum + safeNum(row.matriculated_count), 0);
  const denominator = rows.reduce((sum, row) => sum + safeNum(row.admitted_count), 0);
  return weightedRate(numerator, denominator);
}

function groupByGender(rows: PerformanceRow[], metric: RateMetric): GroupedRate[] {
  return GENDER_ORDER.map((gender) => {
    const subset = rows.filter((row) => row.gender === gender);
    const numerator = subset.reduce(
      (sum, row) => sum + (metric === "pass" ? safeNum(row.passed_count) : safeNum(row.utme_qualified_count)),
      0,
    );
    const denominator = subset.reduce(
      (sum, row) => sum + (metric === "pass" ? safeNum(row.candidate_count) : safeNum(row.utme_candidate_count)),
      0,
    );

    return {
      label: gender,
      numerator,
      denominator,
      rate: weightedRate(numerator, denominator),
    };
  });
}

function sortGroupedRates(items: GroupedRate[], level: LocationLevel, sortMode: SortMode = DEFAULT_SORT_MODE): GroupedRate[] {
  return [...items].sort((left, right) => {
    if (sortMode === "desc" || sortMode === "asc") {
      const direction = sortMode === "desc" ? -1 : 1;
      const diff = (left.rate - right.rate) * direction;
      if (diff !== 0) return diff;
    }

    if (level === "zone" && sortMode === "alphabetical") {
      const indexA = ZONE_ORDER.indexOf(left.label as (typeof ZONE_ORDER)[number]);
      const indexB = ZONE_ORDER.indexOf(right.label as (typeof ZONE_ORDER)[number]);
      if (indexA !== -1 || indexB !== -1) {
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
      }
    }

    return compareLocationLabels(left.label, right.label, level);
  });
}

function buildGroupedRates(rows: PerformanceRow[], level: LocationLevel, metric: RateMetric, sortMode: SortMode = DEFAULT_SORT_MODE): GroupedRate[] {
  const bucket = new Map<string, { numerator: number; denominator: number }>();

  rows.forEach((row) => {
    const rawLabel = locationLabel(row, level);
    const label = level === "state" ? sourceLocationLabel(rawLabel) : rawLabel;
    if (!label) return;

    const previous = bucket.get(label) ?? { numerator: 0, denominator: 0 };
    bucket.set(label, {
      numerator: previous.numerator + (metric === "pass" ? safeNum(row.passed_count) : safeNum(row.utme_qualified_count)),
      denominator: previous.denominator + (metric === "pass" ? safeNum(row.candidate_count) : safeNum(row.utme_candidate_count)),
    });
  });

  const grouped = Array.from(bucket.entries()).map(([label, totals]) => ({
    label,
    numerator: totals.numerator,
    denominator: totals.denominator,
    rate: weightedRate(totals.numerator, totals.denominator),
  }));

  return sortGroupedRates(grouped, level, sortMode);
}

function buildLocationGenderSplits(
  rows: PerformanceRow[],
  level: LocationLevel,
  metric: RateMetric,
  sortMode: SortMode = DEFAULT_SORT_MODE,
  zoneFilter = "",
): LocationGenderSplit[] {
  const overall = buildGroupedRates(rows, level, metric, sortMode);
  const bucket = new Map<string, { maleNumerator: number; maleDenominator: number; femaleNumerator: number; femaleDenominator: number }>();
  const samples = new Map<string, PerformanceRow>();

  rows.forEach((row) => {
    const rawLabel = locationLabel(row, level);
    const label = level === "state" ? sourceLocationLabel(rawLabel) : rawLabel;
    if (!label) return;

    const previous = bucket.get(label) ?? {
      maleNumerator: 0,
      maleDenominator: 0,
      femaleNumerator: 0,
      femaleDenominator: 0,
    };

    if (!samples.has(label)) {
      samples.set(label, row);
    }

    if (row.gender === "Female") {
      previous.femaleNumerator += metric === "pass" ? safeNum(row.passed_count) : safeNum(row.utme_qualified_count);
      previous.femaleDenominator += metric === "pass" ? safeNum(row.candidate_count) : safeNum(row.utme_candidate_count);
    } else {
      previous.maleNumerator += metric === "pass" ? safeNum(row.passed_count) : safeNum(row.utme_qualified_count);
      previous.maleDenominator += metric === "pass" ? safeNum(row.candidate_count) : safeNum(row.utme_candidate_count);
    }

    bucket.set(label, previous);
  });

  if (level === "state") {
    stateLabelsForZone(zoneFilter).forEach((state) => {
      if (!bucket.has(state)) {
        bucket.set(state, { maleNumerator: 0, maleDenominator: 0, femaleNumerator: 0, femaleDenominator: 0 });
      }
    });
  }

  const overallRateMap = new Map(overall.map((item) => [item.label, item.rate]));
  const labels = sortGroupedRates(
    Array.from(bucket.entries()).map(([label, totals]) => ({
      label,
      numerator: totals.maleNumerator + totals.femaleNumerator,
      denominator: totals.maleDenominator + totals.femaleDenominator,
      rate: weightedRate(totals.maleNumerator + totals.femaleNumerator, totals.maleDenominator + totals.femaleDenominator),
    })),
    level,
    sortMode,
  ).map((item) => item.label);

  return labels.flatMap((label): LocationGenderSplit[] => {
    const totals = bucket.get(label) ?? {
      maleNumerator: 0,
      maleDenominator: 0,
      femaleNumerator: 0,
      femaleDenominator: 0,
    };
    const totalNumerator = totals.maleNumerator + totals.femaleNumerator;
    const totalDenominator = totals.maleDenominator + totals.femaleDenominator;
    const sampleRow = samples.get(label);
    if (!sampleRow && level !== "state") return [];
    if (level !== "state" && totalDenominator <= 0) return [];

    return [{
      location: label,
      maleNumerator: totals.maleNumerator,
      maleDenominator: totals.maleDenominator,
      femaleNumerator: totals.femaleNumerator,
      femaleDenominator: totals.femaleDenominator,
      maleRate: weightedRate(totals.maleNumerator, totals.maleDenominator),
      femaleRate: weightedRate(totals.femaleNumerator, totals.femaleDenominator),
      overallRate: overallRateMap.get(label) ?? weightedRate(totalNumerator, totalDenominator),
      totalNumerator,
      totalDenominator,
      sampleRow,
    }];
  });
}

function resolveLocationRows(
  rows: PerformanceRow[],
  baseLevel: LocationLevel,
  filters: MinisterFilters,
): { level: LocationLevel; rows: PerformanceRow[] } {
  const effectiveFilters = withoutSchoolFilter(filters);
  let level = baseLevel;

  if (effectiveFilters.zone && baseLevel === "zone") {
    level = "state";
  }

  if (effectiveFilters.state) {
    level = "lga";
  }

  if (effectiveFilters.lga || effectiveFilters.ward) {
    level = "ward";
  }

  return { level, rows };
}

function extractDrillContext(event: PlotPointEvent, currentLevel: LocationLevel): DrillContext | null {
  const point = event.points?.[0];
  if (!point) return null;

  const custom = Array.isArray(point.customdata) ? point.customdata : null;
  const labelFromCustom = typeof custom?.[0] === "string" ? custom[0].trim() : "";
  const candidates = [point.y, point.label, point.x];
  const fallback = candidates.find((entry) => typeof entry === "string" && entry.trim().length > 0);
  const label = labelFromCustom || (typeof fallback === "string" ? fallback.split("<br>")[0]?.trim() ?? "" : "");
  if (!label) return null;

  return {
    level: currentLevel,
    label,
    zone: typeof custom?.[10] === "string" && custom[10] ? custom[10] : undefined,
    state: typeof custom?.[11] === "string" && custom[11] ? custom[11] : undefined,
    lga: typeof custom?.[12] === "string" && custom[12] ? custom[12] : undefined,
    ward: typeof custom?.[13] === "string" && custom[13] ? custom[13] : undefined,
    school: typeof custom?.[14] === "string" && custom[14] ? custom[14] : undefined,
  };
}


function syncFiltersForDrill(
  setFilters: Dispatch<SetStateAction<MinisterFilters>>,
  context: DrillContext,
) {
  if (!context.label || context.level === "school") return;

  setFilters((previous: MinisterFilters) => {
    if (context.level === "zone") {
      return { ...previous, zone: context.zone ?? context.label, state: "", lga: "", ward: "", school: "" };
    }
    if (context.level === "state") {
      return {
        ...previous,
        zone: context.zone ?? zoneForState(context.state ?? context.label) ?? previous.zone,
        state: sourceLocationLabel(context.state ?? context.label),
        lga: "",
        ward: "",
        school: "",
      };
    }
    if (context.level === "lga") {
      return {
        ...previous,
        zone: context.zone ?? previous.zone,
        state: context.state ? sourceLocationLabel(context.state) : previous.state,
        lga: context.lga ?? context.label,
        ward: "",
        school: "",
      };
    }
    if (context.level === "ward") {
      return {
        ...previous,
        zone: context.zone ?? previous.zone,
        state: context.state ? sourceLocationLabel(context.state) : previous.state,
        lga: context.lga ?? previous.lga,
        ward: context.ward ?? context.label,
        school: "",
      };
    }
    return previous;
  });
}

function resetLocationFilters(setFilters: Dispatch<SetStateAction<MinisterFilters>>) {
  setFilters((previous: MinisterFilters) => {
    if (!previous.zone && !previous.state && !previous.lga && !previous.ward && !previous.school) return previous;
    return {
      ...previous,
      zone: "",
      state: "",
      lga: "",
      ward: "",
      school: "",
    };
  });
}

function FixedLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span
            className="inline-block h-0.5 w-5 rounded-full"
            style={{
              backgroundImage: item.dashed
                ? `repeating-linear-gradient(to right, ${item.color} 0 6px, transparent 6px 10px)`
                : undefined,
              backgroundColor: item.dashed ? undefined : item.color,
            }}
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ id }: { id: string; title: string }) {
  return <div id={id} className="scroll-mt-32" aria-hidden="true" />;
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="grid h-[260px] place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
      {title}
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

function KpiCard({ item, prevSessionLabel }: { item: MetricCard; prevSessionLabel?: string }) {
  const [showHelp, setShowHelp] = useState(false);
  const [helpPanelStyle, setHelpPanelStyle] = useState<CSSProperties>({ left: -9999, top: -9999 });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpPanelRef = useRef<HTMLDivElement | null>(null);
  const rising = item.delta !== null && item.delta > 0;
  const falling = item.delta !== null && item.delta < 0;

  useEffect(() => {
    if (!showHelp) return undefined;
    const onDoc = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (helpButtonRef.current?.contains(target)) return;
      if (helpPanelRef.current?.contains(target)) return;
      setShowHelp(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
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
      const panelWidth = panel?.offsetWidth ?? 240;
      const panelHeight = panel?.offsetHeight ?? 112;
      const gap = 10;
      const margin = 12;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
      const verticalTop = clamp(buttonRect.top, margin, Math.max(margin, viewportHeight - panelHeight - margin));
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

      setHelpPanelStyle({
        left: clamp(buttonRect.right - panelWidth, margin, Math.max(margin, viewportWidth - panelWidth - margin)),
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
    <div ref={cardRef} className="relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: item.bg, color: item.accent }}>
              {item.icon}
            </div>
            <div className="truncate text-[12px] font-medium leading-tight text-slate-500">{item.label}</div>
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
              onClick={() => setShowHelp((current) => !current)}
              className="grid h-6 w-6 place-items-center rounded-md border border-slate-200 text-slate-400 hover:bg-slate-50"
              aria-label={`${item.label} explanation`}
            >
              <HelpCircle className="h-3 w-3" />
            </button>
            {showHelp ? (
              <div
                ref={helpPanelRef}
                className="pointer-events-none fixed z-[100] w-[240px] rounded-xl bg-slate-950 px-3 py-2.5 text-[11px] leading-4 text-white shadow-2xl"
                style={helpPanelStyle}
              >
                {item.breakdown?.length ? (
                  <div className="space-y-1">
                    {item.breakdown.map((entry) => (
                      <div key={`${item.label}-${entry.label}`} className="flex items-center justify-between gap-3">
                        <span className="text-white/70">{entry.label}</span>
                        <span className="font-semibold text-white">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>{item.help}</div>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-[24px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
            {item.value.toFixed(1)}<span className="text-sm font-semibold text-slate-400">%</span>
          </span>
          {item.numerator !== undefined ? (
            <span className="text-[12px] font-semibold text-slate-500 tabular-nums">
              ({fmtInt(item.numerator)})
            </span>
          ) : null}
        </div>
        {item.delta !== null ? (
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className={["inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold",
              rising ? "bg-emerald-50 text-emerald-700" : falling ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"].join(" ")}>
              {rising ? <ArrowUpRight className="h-2.5 w-2.5" /> : falling ? <ArrowDownRight className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
              {fmtDelta(item.delta)}
            </div>
            {prevSessionLabel ? <span className="text-[10px] text-slate-400">vs {prevSessionLabel}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  helpKey,
  bundle,
  sortControl,
  onRefresh,
  onExpand,
  onPlotClick,
}: {
  title: string;
  helpKey: ExpandChartKey;
  bundle?: ChartBundle;
  sortControl?: ReactNode;
  onRefresh: () => void;
  onExpand: () => void;
  onPlotClick?: (event: PlotPointEvent) => void;
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

  return (
    <div className="relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900">{title}</div>
          {bundle?.titleNote ? <div className="mt-0.5 text-[11px] font-medium leading-4 text-slate-500">{bundle.titleNote}</div> : null}
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
              onClick={() => setShowHelp((previous) => !previous)}
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
            {showHelp ? (
              <div
                ref={helpPanelRef}
                className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-[250px] rounded-xl bg-slate-950 px-3 py-2.5 text-[11px] leading-4 text-white shadow-2xl"
                onClick={(event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation()}
                onMouseEnter={() => setShowHelp(true)}
                onMouseLeave={() => setShowHelp(false)}
              >
                {HELP_TEXT[helpKey]}
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
        {bundle ? (
          <>
            {bundle.fixedLegend?.length ? <FixedLegend items={bundle.fixedLegend} /> : null}
            {bundle.scrollable ? (
              <div className="overflow-y-auto overflow-x-hidden pr-1" style={{ maxHeight: bundle.scrollMaxHeight ?? 360 }}>
                <Plot
                  data={bundle.data as never}
                  layout={bundle.layout as never}
                  config={(bundle.config ?? { displayModeBar: false, responsive: true }) as never}
                  useResizeHandler
                  style={{ display: "block", width: "100%", height: "100%" }}
                  onClick={onPlotClick as never}
                />
              </div>
            ) : (
              <Plot
                data={bundle.data as never}
                layout={bundle.layout as never}
                config={(bundle.config ?? { displayModeBar: false, responsive: true }) as never}
                useResizeHandler
                style={{ display: "block", width: "100%", height: "100%" }}
                onClick={onPlotClick as never}
              />
            )}
          </>
        ) : (
          <EmptyState title="No data available for the current filters." />
        )}
      </div>
    </div>
  );
}

function buildGenderChart(
  rows: PerformanceRow[],
  metric: RateMetric,
  examBody: "WAEC" | "NECO" | "NABTEB" | "UTME",
  titleNote: string,
): ChartBundle | null {
  const grouped = groupByGender(rows, metric).filter((item) => item.denominator > 0);
  if (!grouped.length) return null;

  const examColors = genderColorsForExam(examBody);
  const labels = grouped.map((item) => item.label);
  const rates = grouped.map((item) => round1(item.rate));
  const counts = grouped.map((item) => fmtInt(item.numerator));
  const colors = grouped.map((item) => (item.label === "Male" ? examColors.male : examColors.female));

  const data: PlotDatum[] = [
    {
      type: "bar",
      x: labels,
      y: rates,
      marker: { color: colors, line: { width: 0 } },
      text: counts,
      texttemplate: "%{text}",
      textposition: "inside",
      textfont: { color: "#ffffff", size: 12 },
      insidetextanchor: "middle",
      cliponaxis: false,
      customdata: grouped.map((item) => [item.numerator, item.denominator, round1(item.rate)]),
      hovertemplate:
        metric === "pass"
          ? "<b>%{x}</b><br>Rate: %{customdata[2]:.1f}%<br>Passed: %{customdata[0]:,.0f}<br>Candidates: %{customdata[1]:,.0f}<extra></extra>"
          : "<b>%{x}</b><br>Rate: %{customdata[2]:.1f}%<br>Qualified: %{customdata[0]:,.0f}<br>UTME Candidates: %{customdata[1]:,.0f}<extra></extra>",
      showlegend: false,
    },
    {
      type: "scatter",
      mode: "text",
      x: labels,
      y: rates.map((value) => value + 4),
      text: rates.map((value) => `${value.toFixed(1)}%`),
      textposition: "top center",
      textfont: { size: 11, color: examBody === "WAEC" ? COLORS.waec : examBody === "NECO" ? COLORS.neco : examBody === "NABTEB" ? COLORS.nabteb : COLORS.utme },
      hoverinfo: "skip",
      showlegend: false,
      cliponaxis: false,
    },
  ];

  const layout = buildCommonLayout(300);
  layout.barmode = "group";
  layout.xaxis = { type: "category", tickfont: { color: COLORS.sub } };
  layout.yaxis = {
    range: [0, 110],
    ticksuffix: "%",
    gridcolor: COLORS.grid,
    zeroline: false,
    tickfont: { color: COLORS.sub },
  };

  return {
    data,
    layout,
    titleNote,
    fixedLegend: [
      { label: `${examBody} Male`, color: examColors.male },
      { label: `${examBody} Female`, color: examColors.female },
    ],
  };
}

function buildLocationChart(
  rows: PerformanceRow[],
  filters: MinisterFilters,
  metric: RateMetric,
  benchmarkLabel: "WAEC" | "NECO" | "NABTEB" | "UTME",
  startLevel: LocationLevel,
  sortMode: SortMode = DEFAULT_SORT_MODE,
): LocationChartResult | null {
  const resolved = resolveLocationRows(rows, startLevel, filters);
  const grouped = buildLocationGenderSplits(resolved.rows, resolved.level, metric, sortMode, filters.zone || "");
  if (!grouped.length) return null;

  const isScrollable = startLevel === "state" || startLevel === "zone" || grouped.length > 8;
  const chartHeight = Math.max(isScrollable ? 500 : 340, grouped.length * (isScrollable ? 40 : 32) + 130);
  const numeratorLabel = metric === "pass" ? "Passed" : "Scored >180";
  const denominatorLabel = metric === "pass" ? "Candidates" : "UTME Candidates";
  const grandTotalLabel = metric === "pass" ? `${benchmarkLabel} Candidates` : "UTME Candidates";
  const colors = genderColorsForExam(benchmarkLabel);

  const labels = grouped.map((item) => displayLocationLabel(item.location, resolved.level));
  const maleValues = grouped.map((item) => item.maleNumerator);
  const femaleValues = grouped.map((item) => item.femaleNumerator);
  const [maleVisualValues, femaleVisualValues] = minimumVisibleStackValues([maleValues, femaleValues], 0.07);
  const visualTotals = maleVisualValues.map((value, index) => value + (femaleVisualValues[index] ?? 0));
  const actualTotals = grouped.map((item) => item.totalNumerator);
  const rateLabels = grouped.map((item) => (item.totalDenominator > 0 ? `${round1(item.overallRate).toFixed(1)}%` : "0.0%"));
  const maxVisualTotal = Math.max(...visualTotals, 0);
  const rateOffset = maxVisualTotal > 0 ? Math.max(maxVisualTotal * 0.012, 12) : 1;
  const axisMax = maxVisualTotal > 0 ? maxVisualTotal + rateOffset * 2 : 1;
  const titleTotal = grouped.reduce((sum, item) => sum + item.totalDenominator, 0);
  const titleNote = titleGrandTotal(grandTotalLabel, titleTotal);

  const data: PlotDatum[] = [
    {
      type: "bar",
      orientation: "h",
      name: "Male",
      x: maleVisualValues,
      y: labels,
      marker: { color: colors.male, line: { width: 0 } },
      text: grouped.map((item) => barCountLabel(item.maleNumerator, item.totalNumerator)),
      texttemplate: "%{text}",
      textposition: "inside",
      insidetextanchor: "middle",
      textfont: { color: "#ffffff", size: 11 },
      constraintext: "none",
      cliponaxis: false,
      customdata: grouped.map((item) => [
        displayLocationLabel(item.location, resolved.level),
        item.maleNumerator,
        item.maleDenominator,
        round1(item.maleRate),
        round1(item.overallRate),
        item.femaleNumerator,
        item.femaleDenominator,
        round1(item.femaleRate),
        item.totalNumerator,
        item.totalDenominator,
        item.sampleRow?.zone ?? zoneForState(item.location),
        item.sampleRow?.state ?? sourceLocationLabel(item.location),
        item.sampleRow?.lga ?? "",
        item.sampleRow?.ward ?? "",
        item.sampleRow?.school ?? "",
      ]),
      hovertemplate:
        `<b>%{customdata[0]}</b><br>Gender: Male<br>Male Rate: %{customdata[3]:.1f}%<br>${numeratorLabel}: %{customdata[1]:,.0f}<br>${denominatorLabel}: %{customdata[2]:,.0f}<extra></extra>`,
      showlegend: false,
    },
    {
      type: "bar",
      orientation: "h",
      name: "Female",
      x: femaleVisualValues,
      y: labels,
      marker: { color: colors.female, line: { width: 0 } },
      text: grouped.map((item) => barCountLabel(item.femaleNumerator, item.totalNumerator)),
      texttemplate: "%{text}",
      textposition: "inside",
      insidetextanchor: "middle",
      textfont: { color: "#ffffff", size: 11 },
      constraintext: "none",
      cliponaxis: false,
      customdata: grouped.map((item) => [
        displayLocationLabel(item.location, resolved.level),
        item.femaleNumerator,
        item.femaleDenominator,
        round1(item.femaleRate),
        round1(item.overallRate),
        item.maleNumerator,
        item.maleDenominator,
        round1(item.maleRate),
        item.totalNumerator,
        item.totalDenominator,
        item.sampleRow?.zone ?? zoneForState(item.location),
        item.sampleRow?.state ?? sourceLocationLabel(item.location),
        item.sampleRow?.lga ?? "",
        item.sampleRow?.ward ?? "",
        item.sampleRow?.school ?? "",
      ]),
      hovertemplate:
        `<b>%{customdata[0]}</b><br>Gender: Female<br>Female Rate: %{customdata[3]:.1f}%<br>${numeratorLabel}: %{customdata[1]:,.0f}<br>${denominatorLabel}: %{customdata[2]:,.0f}<extra></extra>`,
      showlegend: false,
    },
    {
      type: "scatter",
      mode: "text",
      x: visualTotals.map((value) => value + rateOffset),
      y: labels,
      text: rateLabels,
      textposition: "middle right",
      textfont: { size: 10, color: COLORS.text },
      customdata: grouped.map((item) => [
        displayLocationLabel(item.location, resolved.level),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        actualTotals[grouped.indexOf(item)] ?? 0,
        item.totalDenominator,
        item.sampleRow?.zone ?? zoneForState(item.location),
        item.sampleRow?.state ?? sourceLocationLabel(item.location),
        item.sampleRow?.lga ?? "",
        item.sampleRow?.ward ?? "",
        item.sampleRow?.school ?? "",
      ]),
      hoverinfo: "skip",
      showlegend: false,
      cliponaxis: false,
    },
  ];

  const layout = buildCommonLayout(chartHeight);
  layout.uirevision = `performance-location-${benchmarkLabel}-${startLevel}-${resolved.level}-${labels.length}-${sortMode}`;
  layout.barmode = "stack";
  layout.bargap = 0.24;
  layout.showlegend = false;
  layout.margin = { l: 118, r: 52, t: 10, b: 28 };
  layout.xaxis = horizontalValueAxis(axisMax);
  layout.yaxis = {
    automargin: false,
    autorange: "reversed",
    tickfont: { color: COLORS.sub, size: 10.5 },
    showgrid: false,
    ticks: "",
  };
  layout.shapes = [];
  layout.annotations = [];

  return {
    level: resolved.level,
    scopedRows: resolved.rows,
    bundle: {
      data,
      layout,
      titleNote,
      scrollable: isScrollable,
      scrollMaxHeight: isScrollable ? 360 : undefined,
      expandedMaxHeight: isScrollable ? 520 : 430,
      expandedWidthClass: isScrollable ? "max-w-[1040px]" : "max-w-[940px]",
      fixedLegend: [
        { label: `${benchmarkLabel} Male`, color: colors.male },
        { label: `${benchmarkLabel} Female`, color: colors.female },
      ],
    },
  };
}

function buildTrendChart(rows: PerformanceRow[]): ChartBundle | null {
  const grouped = new Map<string, PerformanceRow[]>();

  rows.forEach((row) => {
    const key = yearFromSession(row.session);
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  });

  const years = Array.from(grouped.keys()).sort().slice(-3);
  if (!years.length) return null;

  const waec: TrendPoint[] = [];
  const neco: TrendPoint[] = [];
  const nabteb: TrendPoint[] = [];
  const utme: TrendPoint[] = [];

  years.forEach((year) => {
    const yearRows = grouped.get(year) ?? [];
    const yearWaec = filterRowsForExam(yearRows, "WAEC");
    const yearNeco = filterRowsForExam(yearRows, "NECO");
    const yearNabteb = filterRowsForExam(yearRows, "NABTEB");

    const waecNumerator = yearWaec.reduce((sum, row) => sum + safeNum(row.passed_count), 0);
    const waecDenominator = yearWaec.reduce((sum, row) => sum + safeNum(row.candidate_count), 0);
    waec.push({ year, numerator: waecNumerator, denominator: waecDenominator, rate: weightedRate(waecNumerator, waecDenominator) });

    const necoNumerator = yearNeco.reduce((sum, row) => sum + safeNum(row.passed_count), 0);
    const necoDenominator = yearNeco.reduce((sum, row) => sum + safeNum(row.candidate_count), 0);
    neco.push({ year, numerator: necoNumerator, denominator: necoDenominator, rate: weightedRate(necoNumerator, necoDenominator) });

    const nabtebNumerator = yearNabteb.reduce((sum, row) => sum + safeNum(row.passed_count), 0);
    const nabtebDenominator = yearNabteb.reduce((sum, row) => sum + safeNum(row.candidate_count), 0);
    nabteb.push({ year, numerator: nabtebNumerator, denominator: nabtebDenominator, rate: weightedRate(nabtebNumerator, nabtebDenominator) });

    const utmeNumerator = yearRows.reduce((sum, row) => sum + safeNum(row.utme_qualified_count), 0);
    const utmeDenominator = yearRows.reduce((sum, row) => sum + safeNum(row.utme_candidate_count), 0);
    utme.push({ year, numerator: utmeNumerator, denominator: utmeDenominator, rate: weightedRate(utmeNumerator, utmeDenominator) });
  });

  const buildSeriesLine = (
    name: string,
    color: string,
    values: TrendPoint[],
    numeratorLabel: string,
    denominatorLabel: string,
  ): PlotDatum => ({
    type: "scatter",
    mode: "lines+markers",
    x: values.map((item) => item.year),
    y: values.map((item) => round1(item.rate)),
    name,
    line: { color, width: 3 },
    marker: { color, size: 7 },
    customdata: values.map((item) => [item.numerator, item.denominator, round1(item.rate)]),
    hovertemplate: `<b>%{x}</b><br>${name} Rate: %{customdata[2]:.1f}%<br>${numeratorLabel}: %{customdata[0]:,.0f}<br>${denominatorLabel}: %{customdata[1]:,.0f}<extra></extra>`,
  });

  const buildSeriesLabels = (name: string, color: string, values: TrendPoint[], offset: number): PlotDatum => ({
    type: "scatter",
    mode: "text",
    x: values.map((item) => item.year),
    y: values.map((item) => round1(item.rate) + offset),
    text: values.map((item) => `${round1(item.rate).toFixed(1)}%`),
    textposition: "middle center",
    textfont: { size: 10, color },
    hoverinfo: "skip",
    showlegend: false,
    cliponaxis: false,
    name: `${name} labels`,
  });

  const data: PlotDatum[] = [
    buildSeriesLine("WAEC", COLORS.waec, waec, "Passed", "Candidates"),
    buildSeriesLine("NECO", COLORS.neco, neco, "Passed", "Candidates"),
    buildSeriesLine("NABTEB", COLORS.nabteb, nabteb, "Passed", "Candidates"),
    buildSeriesLine("UTME", COLORS.utme, utme, "Qualified", "UTME Candidates"),
    buildSeriesLabels("WAEC", COLORS.waec, waec, 4),
    buildSeriesLabels("NECO", COLORS.neco, neco, 1.6),
    buildSeriesLabels("NABTEB", COLORS.nabteb, nabteb, -1.6),
    buildSeriesLabels("UTME", COLORS.utme, utme, -4),
  ];

  const layout = buildCommonLayout(430);
  layout.showlegend = true;
  layout.legend = {
    orientation: "h",
    x: 0,
    y: 1.15,
    xanchor: "left",
    yanchor: "bottom",
    font: { size: 11, color: COLORS.sub },
  };
  layout.xaxis = {
    type: "category",
    tickmode: "array",
    tickvals: years,
    ticktext: years,
    tickfont: { color: COLORS.sub },
    categoryorder: "array",
    categoryarray: years,
  };
  layout.yaxis = {
    range: [0, 108],
    ticksuffix: "%",
    gridcolor: COLORS.grid,
    tickfont: { color: COLORS.sub },
    automargin: true,
  };
  layout.margin = { l: 58, r: 28, t: 58, b: 52 };

  return {
    data,
    layout,
    expandedWidthClass: "max-w-[1100px]",
  };
}


export default function PerformanceDashboard({
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
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [canonicalTransitionRows, setCanonicalTransitionRows] = useState<CanonicalTransitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandState, setExpandState] = useState<ExpandState>(null);
  const [sortModes, setSortModes] = useState<Record<SortablePerformanceChartKey, SortMode>>(DEFAULT_PERFORMANCE_SORT_MODES);
  const expandedPanelRef = useRef<HTMLDivElement | null>(null);
  const requestedScopeKey = useMemo(
    () => `${canonicalState(filters.state)}|${filters.lga}|${filters.ward}`,
    [filters.state, filters.lga, filters.ward],
  );
  const [loadedScopeKey, setLoadedScopeKey] = useState(requestedScopeKey);
  const [loadedLocation, setLoadedLocation] = useState({
    state: filters.state,
    lga: filters.lga,
    ward: filters.ward,
    school: "",
  });

  useEffect(() => {
    if (!filters.state) return;
    const matchedZone = zoneForState(filters.state);
    if (!matchedZone || filters.zone === matchedZone) return;
    setFilters((previous: MinisterFilters) => ({ ...previous, zone: matchedZone }));
  }, [filters.state, filters.zone, setFilters]);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const effectiveLocationFilters = withoutSchoolFilter(filters);
        const depth = scopeDepthForWardFinal(effectiveLocationFilters);
        const [factRows, transitionRows] = await Promise.all([
          loadRefinedScopedRows<PerformanceRow>("performance", effectiveLocationFilters.state, depth),
          loadRefinedScopedRows<CanonicalTransitionRow>("transition_direct", effectiveLocationFilters.state, depth),
        ]);

        if (!mounted) return;
        setRows(filterRowsBySessionWindow(factRows, PERFORMANCE_SESSIONS));
        setCanonicalTransitionRows(filterRowsBySessionWindow(transitionRows, TRANSITION_SESSIONS));
        setLoadedScopeKey(requestedScopeKey);
        setLoadedLocation({
          state: effectiveLocationFilters.state,
          lga: effectiveLocationFilters.lga,
          ward: effectiveLocationFilters.ward,
          school: "",
        });
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load performance data");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void fetchData();

    return () => {
      mounted = false;
    };
  }, [filters.state, filters.lga, filters.ward, requestedScopeKey]);

  useEffect(() => {
    if (!expandState) return undefined;

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (expandedPanelRef.current?.contains(target)) return;
      setExpandState(null);
    };

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [expandState]);


  const previousSession = useMemo(() => {
    const current = dimSessions.find((item) => item.session_id === filters.session);
    return current?.prev_session_id ?? "";
  }, [dimSessions, filters.session]);
  const scopePending = requestedScopeKey !== loadedScopeKey;
  const renderFilters = useMemo(
    () => withoutSchoolFilter(scopePending ? { ...filters, ...loadedLocation } : filters),
    [scopePending, filters, loadedLocation],
  );

  const baseRowsRaw = useMemo(() => filterRows(rows, renderFilters, disabilityMode), [rows, renderFilters, disabilityMode]);
  const previousRowsRaw = useMemo(() => {
    if (!previousSession) return [];
    return filterRows(rows, { ...renderFilters, session: previousSession }, disabilityMode);
  }, [rows, renderFilters, previousSession, disabilityMode]);
  const [lastNonEmptyBaseRows, setLastNonEmptyBaseRows] = useState<PerformanceRow[]>([]);
  const [lastNonEmptyPreviousRows, setLastNonEmptyPreviousRows] = useState<PerformanceRow[]>([]);
  useEffect(() => {
    if (baseRowsRaw.length) setLastNonEmptyBaseRows(baseRowsRaw);
  }, [baseRowsRaw]);
  useEffect(() => {
    if (previousRowsRaw.length) setLastNonEmptyPreviousRows(previousRowsRaw);
  }, [previousRowsRaw]);
  const baseRows = useMemo(
    () => ((loading || scopePending) && !baseRowsRaw.length && lastNonEmptyBaseRows.length ? lastNonEmptyBaseRows : baseRowsRaw),
    [loading, scopePending, baseRowsRaw, lastNonEmptyBaseRows],
  );
  const previousRows = useMemo(
    () => ((loading || scopePending) && !previousRowsRaw.length && lastNonEmptyPreviousRows.length ? lastNonEmptyPreviousRows : previousRowsRaw),
    [loading, scopePending, previousRowsRaw, lastNonEmptyPreviousRows],
  );
  const trendRows = useMemo(() => filterRows(rows, renderFilters, disabilityMode, true), [rows, renderFilters, disabilityMode]);

  const waecRows = useMemo(() => filterRowsForExam(baseRows, "WAEC"), [baseRows]);
  const necoRows = useMemo(() => filterRowsForExam(baseRows, "NECO"), [baseRows]);
  const nabtebRows = useMemo(() => filterRowsForExam(baseRows, "NABTEB"), [baseRows]);

  const previousWaecRows = useMemo(() => filterRowsForExam(previousRows, "WAEC"), [previousRows]);
  const previousNecoRows = useMemo(() => filterRowsForExam(previousRows, "NECO"), [previousRows]);
  const previousNabtebRows = useMemo(() => filterRowsForExam(previousRows, "NABTEB"), [previousRows]);

  const cards = useMemo<MetricCard[]>(() => {
    const currentWaec = round1(passRate(waecRows));
    const currentNeco = round1(passRate(necoRows));
    const currentNabteb = round1(passRate(nabtebRows));
    const currentUtme = round1(utmeRate(baseRows));
    const currentAdmission = round1(admissionRate(baseRows));
    const currentMatric = round1(matricRate(baseRows));

    const prevWaec = previousWaecRows.length ? round1(passRate(previousWaecRows)) : null;
    const prevNeco = previousNecoRows.length ? round1(passRate(previousNecoRows)) : null;
    const prevNabteb = previousNabtebRows.length ? round1(passRate(previousNabtebRows)) : null;
    const prevUtme = previousRows.length ? round1(utmeRate(previousRows)) : null;
    const prevAdmission = previousRows.length ? round1(admissionRate(previousRows)) : null;
    const prevMatric = previousRows.length ? round1(matricRate(previousRows)) : null;

    const waecPassed = waecRows.reduce((sum, row) => sum + safeNum(row.passed_count), 0);
    const waecTotal = waecRows.reduce((sum, row) => sum + safeNum(row.candidate_count), 0);
    const necoPassed = necoRows.reduce((sum, row) => sum + safeNum(row.passed_count), 0);
    const necoTotal = necoRows.reduce((sum, row) => sum + safeNum(row.candidate_count), 0);
    const nabtebPassed = nabtebRows.reduce((sum, row) => sum + safeNum(row.passed_count), 0);
    const nabtebTotal = nabtebRows.reduce((sum, row) => sum + safeNum(row.candidate_count), 0);
    const utmeQualified = baseRows.reduce((sum, row) => sum + safeNum(row.utme_qualified_count), 0);
    const utmeTotal = baseRows.reduce((sum, row) => sum + safeNum(row.utme_candidate_count), 0);
    const canonicalCurrent = sumCanonicalTransitionMetrics(
      filterCanonicalTransitionRows(canonicalTransitionRows, renderFilters, disabilityMode),
    );
    const canonicalPrevious = previousSession
      ? sumCanonicalTransitionMetrics(
          filterCanonicalTransitionRows(canonicalTransitionRows, { ...renderFilters, session: previousSession }, disabilityMode),
        )
      : { admitted: 0, matriculated: 0 };
    const sourceAdmitted = baseRows.reduce((sum, row) => sum + safeNum(row.admitted_count), 0);
    const sourceMatriculated = baseRows.reduce((sum, row) => sum + safeNum(row.matriculated_count), 0);
    const previousSourceAdmitted = previousRows.reduce((sum, row) => sum + safeNum(row.admitted_count), 0);
    const previousSourceMatriculated = previousRows.reduce((sum, row) => sum + safeNum(row.matriculated_count), 0);
    const admitted = canonicalCurrent.admitted || sourceAdmitted;
    const utmeQualifyingBase = baseRows.reduce((sum, row) => sum + safeNum(row.utme_qualified_count), 0);
    const matriculated = canonicalCurrent.matriculated || sourceMatriculated;
    const previousAdmitted = canonicalPrevious.admitted || previousSourceAdmitted;
    const previousMatriculated = canonicalPrevious.matriculated || previousSourceMatriculated;
    const admittedForMatric = admitted;
    const currentAdmissionCanonical = utmeQualifyingBase > 0 ? round1((admitted / utmeQualifyingBase) * 100) : currentAdmission;
    const previousUtmeQualifyingBase = previousRows.reduce((sum, row) => sum + safeNum(row.utme_qualified_count), 0);
    const prevAdmissionCanonical = canonicalPrevious.admitted > 0 && previousUtmeQualifyingBase > 0
      ? round1((canonicalPrevious.admitted / previousUtmeQualifyingBase) * 100)
      : prevAdmission;
    const currentMatricCanonical = admittedForMatric > 0 ? round1((matriculated / admittedForMatric) * 100) : currentMatric;
    const prevMatricCanonical = canonicalPrevious.admitted > 0
      ? round1((canonicalPrevious.matriculated / canonicalPrevious.admitted) * 100)
      : prevMatric;

    const institutionLabels = ["University", "Polytechnic", "College of Education"];
    const fallbackInstitutionShares = [0.52, 0.30, 0.18];
    const normalizeInstitution = (value?: string) => {
      const clean = String(value ?? "").trim().toLowerCase();
      if (clean.includes("university")) return "University";
      if (clean.includes("poly")) return "Polytechnic";
      if (clean.includes("college") || clean.includes("education")) return "College of Education";
      return "";
    };
    const institutionBreakdown = (valueKey: "admitted_count" | "matriculated_count", total: number) => {
      const rawValues = institutionLabels.map((label) =>
        baseRows
          .filter((row) => normalizeInstitution(row.institution_type) === label)
          .reduce((sum, row) => sum + safeNum(row[valueKey]), 0),
      );
      const rawTotal = rawValues.reduce((sum, value) => sum + value, 0);
      const displayValues = rawTotal > 0
        ? scaleValuesToTotal(rawValues, total)
        : splitTotalByShares(total, fallbackInstitutionShares);

      return institutionLabels.map((label, index) => ({
        label,
        value: formatBreakdownShare(displayValues[index] ?? 0, total),
      }));
    };

    return [
      {
        label: "WAEC Pass Rate",
        help: "WAEC pass rate breakdown.",
        value: currentWaec,
        delta: prevWaec === null ? null : round1(currentWaec - prevWaec),
        icon: <BadgePercent className="h-5 w-5" />,
        accent: COLORS.waec,
        bg: "rgba(37,99,235,0.10)",
        numerator: waecPassed,
        denominator: waecTotal,
        numeratorLabel: "Passed",
        denominatorLabel: "Candidates",
        breakdown: [
          { label: "Total WAEC Candidates", value: fmtInt(waecTotal) },
          { label: "Passed", value: formatBreakdownShare(waecPassed, waecTotal) },
          { label: "Failed", value: formatBreakdownShare(Math.max(0, waecTotal - waecPassed), waecTotal) },
        ],
      },
      {
        label: "NECO Pass Rate",
        help: "NECO pass rate breakdown.",
        value: currentNeco,
        delta: prevNeco === null ? null : round1(currentNeco - prevNeco),
        icon: <FileBarChart2 className="h-5 w-5" />,
        accent: COLORS.neco,
        bg: "rgba(16,185,129,0.10)",
        numerator: necoPassed,
        denominator: necoTotal,
        numeratorLabel: "Passed",
        denominatorLabel: "Candidates",
        breakdown: [
          { label: "Total NECO Candidates", value: fmtInt(necoTotal) },
          { label: "Passed", value: formatBreakdownShare(necoPassed, necoTotal) },
          { label: "Failed", value: formatBreakdownShare(Math.max(0, necoTotal - necoPassed), necoTotal) },
        ],
      },
      {
        label: "NABTEB Pass Rate",
        help: "NABTEB pass rate breakdown.",
        value: currentNabteb,
        delta: prevNabteb === null ? null : round1(currentNabteb - prevNabteb),
        icon: <Landmark className="h-5 w-5" />,
        accent: COLORS.nabteb,
        bg: "rgba(245,158,11,0.10)",
        numerator: nabtebPassed,
        denominator: nabtebTotal,
        numeratorLabel: "Passed",
        denominatorLabel: "Candidates",
        breakdown: [
          { label: "Total NABTEB Candidates", value: fmtInt(nabtebTotal) },
          { label: "Passed", value: formatBreakdownShare(nabtebPassed, nabtebTotal) },
          { label: "Failed", value: formatBreakdownShare(Math.max(0, nabtebTotal - nabtebPassed), nabtebTotal) },
        ],
      },
      {
        label: "UTME Qualifying Rate",
        help: "UTME qualifying rate breakdown.",
        value: currentUtme,
        delta: prevUtme === null ? null : round1(currentUtme - prevUtme),
        icon: <GraduationCap className="h-5 w-5" />,
        accent: COLORS.utme,
        bg: "rgba(139,92,246,0.10)",
        numerator: utmeQualified,
        denominator: utmeTotal,
        numeratorLabel: "Scored >180",
        denominatorLabel: "UTME Candidates",
        breakdown: [
          { label: "Total UTME Candidates", value: fmtInt(utmeTotal) },
          { label: "Scored >180", value: formatBreakdownShare(utmeQualified, utmeTotal) },
          { label: "Scored ≤180", value: formatBreakdownShare(Math.max(0, utmeTotal - utmeQualified), utmeTotal) },
        ],
      },
      {
        label: "Admission Rate",
        help: "Admission destination breakdown.",
        value: currentAdmissionCanonical,
        delta: rateDeltaWithCountFallback(currentAdmissionCanonical, prevAdmissionCanonical, admitted, previousAdmitted),
        icon: <School className="h-5 w-5" />,
        accent: COLORS.admission,
        bg: "rgba(14,165,233,0.10)",
        numerator: admitted,
        denominator: utmeQualifyingBase,
        numeratorLabel: "Admitted",
        denominatorLabel: "UTME Qualified",
        breakdown: institutionBreakdown("admitted_count", admitted),
      },
      {
        label: "Matriculation Completion Rate",
        help: "Matriculation destination breakdown.",
        value: currentMatricCanonical,
        delta: rateDeltaWithCountFallback(currentMatricCanonical, prevMatricCanonical, matriculated, previousMatriculated),
        icon: <UserCheck className="h-5 w-5" />,
        accent: COLORS.matric,
        bg: "rgba(20,184,166,0.10)",
        numerator: matriculated,
        denominator: admittedForMatric,
        numeratorLabel: "Matriculated",
        denominatorLabel: "Admitted",
        breakdown: institutionBreakdown("matriculated_count", matriculated),
      },
    ];
  }, [waecRows, necoRows, nabtebRows, baseRows, previousWaecRows, previousNecoRows, previousNabtebRows, previousRows, canonicalTransitionRows, renderFilters, disabilityMode, previousSession]);

  const waecGenderChart = useMemo(
    () => buildGenderChart(
      waecRows,
      "pass",
      "WAEC",
      titleGrandTotal("WAEC Candidates", waecRows.reduce((sum, row) => sum + safeNum(row.candidate_count), 0)),
    ),
    [waecRows],
  );
  const necoGenderChart = useMemo(
    () => buildGenderChart(
      necoRows,
      "pass",
      "NECO",
      titleGrandTotal("NECO Candidates", necoRows.reduce((sum, row) => sum + safeNum(row.candidate_count), 0)),
    ),
    [necoRows],
  );
  const nabtebGenderChart = useMemo(
    () => buildGenderChart(
      nabtebRows,
      "pass",
      "NABTEB",
      titleGrandTotal("NABTEB Candidates", nabtebRows.reduce((sum, row) => sum + safeNum(row.candidate_count), 0)),
    ),
    [nabtebRows],
  );
  const utmeGenderChart = useMemo(
    () => buildGenderChart(
      baseRows,
      "utme",
      "UTME",
      titleGrandTotal("UTME Candidates", baseRows.reduce((sum, row) => sum + safeNum(row.utme_candidate_count), 0)),
    ),
    [baseRows],
  );

  const waecZoneChart = useMemo(
    () => buildLocationChart(waecRows, renderFilters, "pass", "WAEC", DRILL_START_LEVEL.waecZone, sortModes.waecZone),
    [waecRows, renderFilters, sortModes.waecZone],
  );
  const waecStateChart = useMemo(
    () => buildLocationChart(waecRows, renderFilters, "pass", "WAEC", DRILL_START_LEVEL.waecState, sortModes.waecState),
    [waecRows, renderFilters, sortModes.waecState],
  );
  const necoZoneChart = useMemo(
    () => buildLocationChart(necoRows, renderFilters, "pass", "NECO", DRILL_START_LEVEL.necoZone, sortModes.necoZone),
    [necoRows, renderFilters, sortModes.necoZone],
  );
  const necoStateChart = useMemo(
    () => buildLocationChart(necoRows, renderFilters, "pass", "NECO", DRILL_START_LEVEL.necoState, sortModes.necoState),
    [necoRows, renderFilters, sortModes.necoState],
  );
  const nabtebZoneChart = useMemo(
    () => buildLocationChart(nabtebRows, renderFilters, "pass", "NABTEB", DRILL_START_LEVEL.nabtebZone, sortModes.nabtebZone),
    [nabtebRows, renderFilters, sortModes.nabtebZone],
  );
  const nabtebStateChart = useMemo(
    () => buildLocationChart(nabtebRows, renderFilters, "pass", "NABTEB", DRILL_START_LEVEL.nabtebState, sortModes.nabtebState),
    [nabtebRows, renderFilters, sortModes.nabtebState],
  );
  const utmeZoneChart = useMemo(
    () => buildLocationChart(baseRows, renderFilters, "utme", "UTME", DRILL_START_LEVEL.utmeZone, sortModes.utmeZone),
    [baseRows, renderFilters, sortModes.utmeZone],
  );
  const utmeStateChart = useMemo(
    () => buildLocationChart(baseRows, renderFilters, "utme", "UTME", DRILL_START_LEVEL.utmeState, sortModes.utmeState),
    [baseRows, renderFilters, sortModes.utmeState],
  );
  const trendChart = useMemo(() => buildTrendChart(trendRows), [trendRows]);

  const handleLocationChartClick = (chart: LocationChartResult | null, event: PlotPointEvent) => {
    if (!chart) return;

    const context = extractDrillContext(event, chart.level);
    if (!context) return;

    syncFiltersForDrill(setFilters, context);
  };

  const resetDrill = () => {
    resetLocationFilters(setFilters);
  };

  const renderSortControl = (chartKey: ExpandChartKey) => {
    if (!isSortablePerformanceChartKey(chartKey)) return null;
    return (
      <ChartSortControl
        value={sortModes[chartKey]}
        onChange={(value) => setSortModes((previous) => ({ ...previous, [chartKey]: value }))}
      />
    );
  };

  const getExpandedChartEntry = (): ExpandedChartEntry => {
    if (!expandState) return {};

    switch (expandState.chartKey) {
      case "waecGender":
        return { bundle: waecGenderChart ?? undefined };
      case "waecZone":
        return {
          bundle: waecZoneChart?.bundle,
          onPlotClick: (event) => handleLocationChartClick(waecZoneChart, event),
        };
      case "waecState":
        return {
          bundle: waecStateChart?.bundle,
          onPlotClick: (event) => handleLocationChartClick(waecStateChart, event),
        };
      case "necoGender":
        return { bundle: necoGenderChart ?? undefined };
      case "necoZone":
        return {
          bundle: necoZoneChart?.bundle,
          onPlotClick: (event) => handleLocationChartClick(necoZoneChart, event),
        };
      case "necoState":
        return {
          bundle: necoStateChart?.bundle,
          onPlotClick: (event) => handleLocationChartClick(necoStateChart, event),
        };
      case "nabtebGender":
        return { bundle: nabtebGenderChart ?? undefined };
      case "nabtebZone":
        return {
          bundle: nabtebZoneChart?.bundle,
          onPlotClick: (event) => handleLocationChartClick(nabtebZoneChart, event),
        };
      case "nabtebState":
        return {
          bundle: nabtebStateChart?.bundle,
          onPlotClick: (event) => handleLocationChartClick(nabtebStateChart, event),
        };
      case "utmeGender":
        return { bundle: utmeGenderChart ?? undefined };
      case "utmeZone":
        return {
          bundle: utmeZoneChart?.bundle,
          onPlotClick: (event) => handleLocationChartClick(utmeZoneChart, event),
        };
      case "utmeState":
        return {
          bundle: utmeStateChart?.bundle,
          onPlotClick: (event) => handleLocationChartClick(utmeStateChart, event),
        };
      case "trend":
        return { bundle: trendChart ?? undefined };
      default:
        return {};
    }
  };

  const expandedEntry = getExpandedChartEntry();
  const expandedBundle = useMemo(
    () => expandedChartBundle(expandedEntry.bundle, expandState?.chartKey),
    [expandedEntry.bundle, expandState?.chartKey],
  );

  if (loading && !rows.length) {
    return <div className="rounded-xl border border-border bg-card p-10 text-center text-slate-600">Loading performance dashboard…</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-10 text-center text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <SectionLabel id="performance-kpi" title="KPI Summary" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <KpiCard key={card.label} item={card} prevSessionLabel={previousSession || undefined} />
        ))}
      </div>

      <SectionLabel id="performance-waec" title="WAEC Performance" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard
          title={benchmarkedTitle("WAEC Pass Rate by Gender", "WAEC")}
          helpKey="waecGender"
          bundle={waecGenderChart ?? undefined}
          onRefresh={() => undefined}
          onExpand={() => setExpandState({ title: benchmarkedTitle("WAEC Pass Rate by Gender", "WAEC"), chartKey: "waecGender" })}
        />
        <ChartCard
          title={benchmarkedTitle("WAEC Pass Rate by Zone", "WAEC")}
          helpKey="waecZone"
          bundle={waecZoneChart?.bundle ?? undefined}
          sortControl={renderSortControl("waecZone")}
          onRefresh={() => resetDrill()}
          onExpand={() => setExpandState({ title: benchmarkedTitle("WAEC Pass Rate by Zone", "WAEC"), chartKey: "waecZone" })}
          onPlotClick={(event) => handleLocationChartClick(waecZoneChart, event)}
        />
      </div>
      <ChartCard
        title={benchmarkedTitle("WAEC Pass Rate by State", "WAEC")}
        helpKey="waecState"
        bundle={waecStateChart?.bundle ?? undefined}
        sortControl={renderSortControl("waecState")}
        onRefresh={() => resetDrill()}
        onExpand={() => setExpandState({ title: benchmarkedTitle("WAEC Pass Rate by State", "WAEC"), chartKey: "waecState" })}
        onPlotClick={(event) => handleLocationChartClick(waecStateChart, event)}
      />

      <SectionLabel id="performance-neco" title="NECO Performance" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard
          title={benchmarkedTitle("NECO Pass Rate by Gender", "NECO")}
          helpKey="necoGender"
          bundle={necoGenderChart ?? undefined}
          onRefresh={() => undefined}
          onExpand={() => setExpandState({ title: benchmarkedTitle("NECO Pass Rate by Gender", "NECO"), chartKey: "necoGender" })}
        />
        <ChartCard
          title={benchmarkedTitle("NECO Pass Rate by Zone", "NECO")}
          helpKey="necoZone"
          bundle={necoZoneChart?.bundle ?? undefined}
          sortControl={renderSortControl("necoZone")}
          onRefresh={() => resetDrill()}
          onExpand={() => setExpandState({ title: benchmarkedTitle("NECO Pass Rate by Zone", "NECO"), chartKey: "necoZone" })}
          onPlotClick={(event) => handleLocationChartClick(necoZoneChart, event)}
        />
      </div>
      <ChartCard
        title={benchmarkedTitle("NECO Pass Rate by State", "NECO")}
        helpKey="necoState"
        bundle={necoStateChart?.bundle ?? undefined}
        sortControl={renderSortControl("necoState")}
        onRefresh={() => resetDrill()}
        onExpand={() => setExpandState({ title: benchmarkedTitle("NECO Pass Rate by State", "NECO"), chartKey: "necoState" })}
        onPlotClick={(event) => handleLocationChartClick(necoStateChart, event)}
      />

      <SectionLabel id="performance-nabteb" title="NABTEB Performance" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard
          title={benchmarkedTitle("NABTEB Pass Rate by Gender", "NABTEB")}
          helpKey="nabtebGender"
          bundle={nabtebGenderChart ?? undefined}
          onRefresh={() => undefined}
          onExpand={() => setExpandState({ title: benchmarkedTitle("NABTEB Pass Rate by Gender", "NABTEB"), chartKey: "nabtebGender" })}
        />
        <ChartCard
          title={benchmarkedTitle("NABTEB Pass Rate by Zone", "NABTEB")}
          helpKey="nabtebZone"
          bundle={nabtebZoneChart?.bundle ?? undefined}
          sortControl={renderSortControl("nabtebZone")}
          onRefresh={() => resetDrill()}
          onExpand={() => setExpandState({ title: benchmarkedTitle("NABTEB Pass Rate by Zone", "NABTEB"), chartKey: "nabtebZone" })}
          onPlotClick={(event) => handleLocationChartClick(nabtebZoneChart, event)}
        />
      </div>
      <ChartCard
        title={benchmarkedTitle("NABTEB Pass Rate by State", "NABTEB")}
        helpKey="nabtebState"
        bundle={nabtebStateChart?.bundle ?? undefined}
        sortControl={renderSortControl("nabtebState")}
        onRefresh={() => resetDrill()}
        onExpand={() => setExpandState({ title: benchmarkedTitle("NABTEB Pass Rate by State", "NABTEB"), chartKey: "nabtebState" })}
        onPlotClick={(event) => handleLocationChartClick(nabtebStateChart, event)}
      />

      <SectionLabel id="performance-utme" title="UTME Readiness" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard
          title={benchmarkedTitle("UTME Qualifying Rate by Gender", "UTME")}
          helpKey="utmeGender"
          bundle={utmeGenderChart ?? undefined}
          onRefresh={() => undefined}
          onExpand={() => setExpandState({ title: benchmarkedTitle("UTME Qualifying Rate by Gender", "UTME"), chartKey: "utmeGender" })}
        />
        <ChartCard
          title={benchmarkedTitle("UTME Qualifying Rate by Zone", "UTME")}
          helpKey="utmeZone"
          bundle={utmeZoneChart?.bundle ?? undefined}
          sortControl={renderSortControl("utmeZone")}
          onRefresh={() => resetDrill()}
          onExpand={() => setExpandState({ title: benchmarkedTitle("UTME Qualifying Rate by Zone", "UTME"), chartKey: "utmeZone" })}
          onPlotClick={(event) => handleLocationChartClick(utmeZoneChart, event)}
        />
      </div>
      <ChartCard
        title={benchmarkedTitle("UTME Qualifying Rate by State", "UTME")}
        helpKey="utmeState"
        bundle={utmeStateChart?.bundle ?? undefined}
        sortControl={renderSortControl("utmeState")}
        onRefresh={() => resetDrill()}
        onExpand={() => setExpandState({ title: benchmarkedTitle("UTME Qualifying Rate by State", "UTME"), chartKey: "utmeState" })}
        onPlotClick={(event) => handleLocationChartClick(utmeStateChart, event)}
      />

      <SectionLabel id="performance-trend" title="Three-Year Trend" />
      <ChartCard
        title="Three-Year Exam Performance Trend"
        helpKey="trend"
        bundle={trendChart ?? undefined}
        onRefresh={() => undefined}
        onExpand={() => setExpandState({ title: "Three-Year Exam Performance Trend", chartKey: "trend" })}
      />

      {expandState ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => setExpandState(null)}
        >
          <div
            ref={expandedPanelRef}
            onClick={(event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation()}
            className={[
              "flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl",
              expandedBundle?.expandedWidthClass ?? "max-w-[1120px]",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <div className="text-base font-bold text-slate-900">{expandState.title}</div>
                {expandedBundle?.titleNote ? <div className="mt-0.5 text-[11px] font-medium leading-4 text-slate-500">{expandedBundle.titleNote}</div> : null}
              </div>
              <div className="flex shrink-0 flex-nowrap items-center gap-2">
                {isSortablePerformanceChartKey(expandState.chartKey) ? (
                  <div className="shrink-0 whitespace-nowrap">{renderSortControl(expandState.chartKey)}</div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setExpandState(null)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 overflow-y-auto p-3">
              {expandedBundle ? (
                <>
                  {expandedBundle.fixedLegend?.length ? <FixedLegend items={expandedBundle.fixedLegend} /> : null}
                  <div
                    className={expandedBundle.scrollable ? "overflow-y-auto pr-1" : undefined}
                    style={expandedBundle.scrollable ? { maxHeight: expandedBundle.expandedMaxHeight ?? 420 } : undefined}
                  >
                    <Plot
                      data={expandedBundle.data as never}
                      layout={{
                        ...expandedBundle.layout,
                        height: Math.max(
                          chartPixelHeight(expandedBundle.layout, 420),
                          expandedBundle.expandedMaxHeight ?? 480,
                        ),
                        showlegend: expandedBundle.fixedLegend?.length ? false : expandedBundle.layout.showlegend,
                      } as never}
                      config={{ displayModeBar: false, responsive: true } as never}
                      useResizeHandler
                      style={{ display: "block", width: "100%", height: "100%" }}
                      onClick={expandedEntry.onPlotClick as never}
                    />
                  </div>
                </>
              ) : (
                <EmptyState title="No data available for the current filters." />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
