import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, Dispatch, MouseEvent as ReactMouseEvent, ReactNode, SetStateAction } from "react";
import Plot from "react-plotly.js";
import type { Data as PlotlyData, Layout as PlotlyLayout, Config as PlotlyConfig, PlotMouseEvent } from "plotly.js";
import {
  HelpCircle,
  RotateCw,
  Maximize2,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  GraduationCap,
  BookOpenCheck,
  Landmark,
  Clock3,
  Users,
} from "lucide-react";

import type { DimSession, MinisterFilters } from "../types";
import {
  canonicalState,
  expectedLocLevelForLocation,
  loadRefinedScopedRows,
  scopeDepthForLocation,
} from "../utils/refinedPageData";
import {
  TRANSITION_SESSIONS,
  filterRowsBySessionWindow,
} from "../utils/sessionWindows";

type TransitionGeneralRow = {
  session: string;
  loc_level?: string;
  zone: string;
  state: string;
  lga: string;
  ward: string;
  school: string;
  gender: string;
  disability: string;
  exam_body: string;
  gap_band: string;
  institution_type: string;
  o_level_candidates: number;
  utme_participants: number;
  admitted_students: number;
  matriculated_students: number;
  delayed_transition_students: number;
  median_time_to_matriculation_years: number;
};

type TransitionDirectRow = {
  session: string;
  loc_level?: string;
  zone: string;
  state: string;
  lga: string;
  ward: string;
  school: string;
  gender: string;
  disability: string;
  exam_body: string;
  institution_type: string;
  ss3_total: number;
  o_level_candidates: number;
  utme_participants: number;
  admitted_students: number;
  matriculated_students: number;
  delayed_transition_students: number;
  median_time_to_matriculation_years: number;
};

type Mode = "general" | "direct";
type LocationLevel = "zone" | "state" | "lga" | "ward" | "school";
type PlotPointEvent = Readonly<PlotMouseEvent>;

type LegendItem = {
  label: string;
  color: string;
};

type ChartBundle = {
  data: PlotlyData[];
  layout: Partial<PlotlyLayout>;
  config?: Partial<PlotlyConfig>;
  scrollable?: boolean;
  scrollMaxHeight?: number;
  expandedMaxHeight?: number;
  fixedLegend?: LegendItem[];
  expandedWidthClass?: string;
  titleNote?: string;
};

type MetricCard = {
  label: string;
  value: number;
  delta: number | null;
  icon: ReactNode;
  accent: string;
  bg: string;
  suffix?: string;
  help: string;
  breakdown?: Array<{ label: string; value: string }>;
};

type DrillState = {
  zone?: string;
  state?: string;
  lga?: string;
  ward?: string;
};

type DrillSetter = (value: DrillState | ((prev: DrillState) => DrillState)) => void;

type LossRow = {
  stage: string;
  from: number;
  to: number;
  lost: number;
  lostPct: number;
  direction: "gain" | "dropoff" | "none";
};

type ExpandChartKey =
  | "progression"
  | "timingDistribution"
  | "timingInstitution"
  | "gender"
  | "lossByGender"
  | "generalTransitionZone"
  | "generalTransitionState"
  | "generalDropoffZone"
  | "generalDropoffState"
  | "directTransitionZone"
  | "directTransitionState"
  | "directDropoffZone"
  | "directDropoffState";

type ExpandState =
  | {
      title: string;
      chartKey: ExpandChartKey;
      tableRows?: never;
    }
  | {
      title: string;
      tableRows: LossRow[];
      chartKey?: never;
    }
  | null;

type BaseRow = TransitionGeneralRow | TransitionDirectRow;

type AggregateMetrics = {
  ss3_total: number;
  o_level_candidates: number;
  utme_participants: number;
  admitted_students: number;
  matriculated_students: number;
  delayed_transition_students: number;
  median_time_to_matriculation_years: number;
};

type GroupedRow<T extends BaseRow = BaseRow> = {
  label: string;
  rows: T[];
  metrics: AggregateMetrics;
};

type LocationChartResult = {
  bundle: ChartBundle;
  level: LocationLevel;
};

const GAP_OPTIONS = ["1-year", "2-year", "3-5-year", "5+-year"] as const;
type SortMode = "alphabetical" | "desc" | "asc";
type SortableTransitionChartKey = Extract<
  ExpandChartKey,
  | "generalTransitionZone"
  | "generalTransitionState"
  | "generalDropoffZone"
  | "generalDropoffState"
  | "directTransitionZone"
  | "directTransitionState"
  | "directDropoffZone"
  | "directDropoffState"
>;

const DEFAULT_SORT_MODE: SortMode = "alphabetical";
const SORTABLE_TRANSITION_CHART_KEYS: SortableTransitionChartKey[] = [
  "generalTransitionZone",
  "generalTransitionState",
  "generalDropoffZone",
  "generalDropoffState",
  "directTransitionZone",
  "directTransitionState",
  "directDropoffZone",
  "directDropoffState",
];
const DEFAULT_TRANSITION_SORT_MODES: Record<SortableTransitionChartKey, SortMode> = {
  generalTransitionZone: DEFAULT_SORT_MODE,
  generalTransitionState: DEFAULT_SORT_MODE,
  generalDropoffZone: DEFAULT_SORT_MODE,
  generalDropoffState: DEFAULT_SORT_MODE,
  directTransitionZone: DEFAULT_SORT_MODE,
  directTransitionState: DEFAULT_SORT_MODE,
  directDropoffZone: DEFAULT_SORT_MODE,
  directDropoffState: DEFAULT_SORT_MODE,
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

const COLORS = {
  bg: "rgba(0,0,0,0)",
  grid: "rgba(15,23,42,0.10)",
  text: "#0f172a",
  sub: "#475569",
  ss3: "#2563eb",
  olevel: "#10b981",
  utme: "#f59e0b",
  admit: "#8b5cf6",
  matric: "#db2777",
  male: "#0ea5e9",
  female: "#ec4899",
  lag1: "#22c55e",
  lag2: "#84cc16",
  lag35: "#f59e0b",
  lag5: "#dc2626",
  university: "#2563eb",
  polytechnic: "#14b8a6",
  coe: "#f97316",
};

function safeNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(value: number): string {
  return new Intl.NumberFormat("en-NG").format(Math.round(value));
}

function fmtPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function avgPositive(values: number[]): number {
  const positive = values.filter((value) => Number.isFinite(value) && value > 0);
  return positive.length ? avg(positive) : 0;
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
  return STATE_SOURCE_NAMES.filter((state) => !zone || STATE_ZONE_MAP[state] === zone).sort((left, right) =>
    compareLocationLabels(left, right, "state"),
  );
}

function sortGroupedRows<T extends BaseRow>(
  items: GroupedRow<T>[],
  sortMode: SortMode,
  getValue: (item: GroupedRow<T>) => number,
  level: LocationLevel,
): GroupedRow<T>[] {
  return [...items].sort((left, right) => {
    if (sortMode === "desc" || sortMode === "asc") {
      const direction = sortMode === "desc" ? -1 : 1;
      const diff = (getValue(left) - getValue(right)) * direction;
      if (diff !== 0) return diff;
    }
    return compareLocationLabels(left.label, right.label, level);
  });
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

function horizontalValueAxis(rangeMax: number): Partial<PlotlyLayout["xaxis"]> {
  return {
    range: [0, Math.max(1, Math.ceil(rangeMax * 1.08))],
    showgrid: false,
    showticklabels: false,
    zeroline: false,
    ticks: "",
    fixedrange: true,
  };
}

function titleGrandTotal(label: string, value: number): string {
  return `Grand Total: ${fmtInt(value)} ${label}`;
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

function scaleMatrixToTotal(seriesValues: number[][], targetTotal: number): number[][] {
  const flattened = seriesValues.flat();
  const scaledFlat = scaleValuesToTotal(flattened, targetTotal);
  let cursor = 0;

  return seriesValues.map((series) => series.map(() => scaledFlat[cursor++] ?? 0));
}

function isSortableTransitionChartKey(chartKey: ExpandChartKey): chartKey is SortableTransitionChartKey {
  return (SORTABLE_TRANSITION_CHART_KEYS as ExpandChartKey[]).includes(chartKey);
}

function locationLabel(row: BaseRow, level: LocationLevel): string {
  if (level === "zone") return row.zone;
  if (level === "state") return row.state;
  if (level === "lga") return row.lga;
  if (level === "ward") return row.ward;
  return row.school;
}

function aggregateRows(rows: BaseRow[]): AggregateMetrics {
  return {
    ss3_total: rows.reduce((sum, row) => sum + ("ss3_total" in row ? safeNum(row.ss3_total) : 0), 0),
    o_level_candidates: rows.reduce((sum, row) => sum + safeNum(row.o_level_candidates), 0),
    utme_participants: rows.reduce((sum, row) => sum + safeNum(row.utme_participants), 0),
    admitted_students: rows.reduce((sum, row) => sum + safeNum(row.admitted_students), 0),
    matriculated_students: rows.reduce((sum, row) => sum + safeNum(row.matriculated_students), 0),
    delayed_transition_students: rows.reduce((sum, row) => sum + safeNum(row.delayed_transition_students), 0),
    median_time_to_matriculation_years: avgPositive(rows.map((row) => safeNum(row.median_time_to_matriculation_years))),
  };
}

function constrainDirectRows(directRows: TransitionDirectRow[], _generalRows: TransitionGeneralRow[]): TransitionDirectRow[] {
  return directRows;
}

function gainDropoffFromStage(
  from: number,
  to: number,
  options?: { forceNoDropoff?: boolean },
): Pick<LossRow, "lost" | "lostPct" | "direction"> {
  const start = Math.max(0, safeNum(from));
  const end = Math.max(0, safeNum(to));
  const rawChange = end - start;

  if (options?.forceNoDropoff) {
    const gain = Math.max(0, rawChange);
    return {
      lost: gain,
      lostPct: start > 0 ? (gain / start) * 100 : 0,
      direction: gain > 0 ? "gain" : "none",
    };
  }

  const magnitude = Math.abs(rawChange);
  return {
    lost: magnitude,
    lostPct: start > 0 ? (magnitude / start) * 100 : 0,
    direction: rawChange > 0 ? "gain" : rawChange < 0 ? "dropoff" : "none",
  };
}

function buildLossRows(metrics: AggregateMetrics, _mode: Mode): LossRow[] {
  const stages: Array<{ stage: string; from: number; to: number; forceNoDropoff?: boolean }> = [
    { stage: "SS3 → O-Level", from: metrics.ss3_total, to: metrics.o_level_candidates, forceNoDropoff: true },
    { stage: "O-Level → UTME", from: metrics.o_level_candidates, to: metrics.utme_participants },
    { stage: "UTME → Admitted", from: metrics.utme_participants, to: metrics.admitted_students },
    { stage: "Admitted → Matriculated", from: metrics.admitted_students, to: metrics.matriculated_students },
  ];

  return stages.map((row) => ({
    stage: row.stage,
    from: row.from,
    to: row.to,
    ...gainDropoffFromStage(row.from, row.to, { forceNoDropoff: row.forceNoDropoff }),
  }));
}

function buildCommonLayout(height = 338): Partial<PlotlyLayout> {
  return {
    autosize: true,
    height,
    paper_bgcolor: COLORS.bg,
    plot_bgcolor: COLORS.bg,
    margin: { l: 54, r: 16, t: 10, b: 58 },
    font: { family: "Inter, DM Sans, system-ui, sans-serif", size: 10.5, color: COLORS.text },
    xaxis: { gridcolor: COLORS.grid, zeroline: false, tickfont: { color: COLORS.sub } },
    yaxis: { gridcolor: COLORS.grid, zeroline: false, tickfont: { color: COLORS.sub }, automargin: true },
    hoverlabel: { bgcolor: "#0f172a", font: { color: "#fff" } },
    clickmode: "event",
    showlegend: true,
    legend: {
      orientation: "h",
      x: 0,
      y: -0.2,
      font: { size: 11, color: COLORS.sub },
    },
    dragmode: false,
    uirevision: "transition-ui",
    uniformtext: { mode: "show", minsize: 10 },
  } as Partial<PlotlyLayout>;
}

function makeGrouped<T extends BaseRow>(
  rows: T[],
  level: LocationLevel,
  sortMode: SortMode = DEFAULT_SORT_MODE,
  getValue: (item: GroupedRow<T>) => number = (item) => item.metrics.matriculated_students,
  zoneFilter = "",
): GroupedRow<T>[] {
  const grouped = new Map<string, T[]>();
  rows.forEach((row) => {
    const rawKey = locationLabel(row, level);
    const key = level === "state" ? sourceLocationLabel(rawKey) : rawKey;
    if (!key) return;
    const current = grouped.get(key);
    if (current) {
      current.push(row);
      return;
    }
    grouped.set(key, [row]);
  });

  if (level === "state") {
    stateLabelsForZone(zoneFilter).forEach((state) => {
      if (!grouped.has(state)) grouped.set(state, [] as T[]);
    });
  }

  const items = Array.from(grouped.entries()).map(([label, entries]) => ({
    label,
    rows: entries,
    metrics: aggregateRows(entries),
  }));

  return sortGroupedRows(items, sortMode, getValue, level);
}

function getNextLevel(currentLevel: LocationLevel): LocationLevel | null {
  if (currentLevel === "zone") return "state";
  if (currentLevel === "state") return "lga";
  if (currentLevel === "lga") return "ward";
  if (currentLevel === "ward") return null;
  return null;
}

function resolveLocationRows(
  rows: BaseRow[],
  baseLevel: LocationLevel,
  drill: DrillState,
  filters: MinisterFilters,
): { level: LocationLevel; rows: BaseRow[] } {
  let effectiveRows = rows;
  let level = baseLevel;

  const advanceByFilter = (current: LocationLevel, filterValue: string) => {
    if (!filterValue) return current;
    return getNextLevel(current) ?? current;
  };

  if (baseLevel === "zone") {
    level = advanceByFilter(level, filters.zone);
    if (filters.zone) {
      effectiveRows = effectiveRows.filter((row) => row.zone === filters.zone);
    }
    level = advanceByFilter(level, filters.state);
    if (filters.state) {
      effectiveRows = effectiveRows.filter((row) => canonicalState(row.state) === canonicalState(filters.state));
    }
  }

  if (baseLevel === "state") {
    if (filters.zone) {
      effectiveRows = effectiveRows.filter((row) => row.zone === filters.zone);
    }
    level = advanceByFilter(level, filters.state);
    if (filters.state) {
      effectiveRows = effectiveRows.filter((row) => canonicalState(row.state) === canonicalState(filters.state));
    }
  }

  if (filters.lga && level !== "school") {
    effectiveRows = effectiveRows.filter((row) => row.lga === filters.lga);
    level = advanceByFilter(level, filters.lga);
  }

  if (filters.ward && level !== "school") {
    effectiveRows = effectiveRows.filter((row) => row.ward === filters.ward);
    level = advanceByFilter(level, filters.ward);
  }

  if (drill.zone) {
    effectiveRows = effectiveRows.filter((row) => row.zone === drill.zone);
    level = "state";
  }
  if (drill.state) {
    effectiveRows = effectiveRows.filter((row) => row.state === drill.state);
    level = "lga";
  }
  if (drill.lga) {
    effectiveRows = effectiveRows.filter((row) => row.lga === drill.lga);
    level = "ward";
  }
  if (drill.ward) {
    effectiveRows = effectiveRows.filter((row) => row.ward === drill.ward);
    level = "ward";
  }

  return { level, rows: effectiveRows };
}

function delta(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function barText(values: number[], referenceValues?: number[], minShare = 0): string[] {
  return values.map((value, index) => {
    if (value <= 0) return "";
    const reference = referenceValues?.[index] ?? 0;
    if (reference > 0 && minShare > 0 && value / reference < minShare) return "";
    return fmtInt(value);
  });
}

function verticalBarTrace(name: string, labels: string[], values: number[], color: string, visualValues?: number[]): PlotlyData {
  return {
    type: "bar",
    name,
    x: labels,
    y: visualValues ?? values,
    marker: { color },
    text: barText(values),
    texttemplate: "%{text}",
    textposition: "inside",
    textangle: 0,
    insidetextanchor: "middle",
    constraintext: "none",
    textfont: { color: "#ffffff", size: 11 },
    cliponaxis: false,
    customdata: labels.map((label, index) => [label, values[index] ?? 0]),
    hovertemplate: `<b>%{customdata[0]}</b><br>${name}: %{customdata[1]:,.0f}<extra></extra>`,
  };
}

function horizontalBarTrace(
  name: string,
  labels: string[],
  values: number[],
  color: string,
  _textPosition: "inside" | "outside" | "auto" = "inside",
  textFontSize = 10.5,
  referenceValues?: number[],
  visualValues?: number[],
  referenceLabel = "SS3 Students",
): PlotlyData {
  const customdata = labels.map((label, i) => {
    const value = values[i] ?? 0;
    const reference = referenceValues ? (referenceValues[i] ?? 0) : 0;
    const pctText = reference > 0 && value <= reference ? `<br>${((value / reference) * 100).toFixed(1)}% of ${referenceLabel}` : "";
    return [label, value, pctText];
  });

  const hoverPctSuffix = referenceValues ? "%{customdata[2]}" : "";

  return {
    type: "bar",
    orientation: "h",
    name,
    y: labels,
    x: visualValues ?? values,
    customdata,
    marker: { color },
    text: barText(values),
    texttemplate: "%{text}",
    textposition: "inside",
    textangle: 0,
    textfont: { color: "#ffffff", size: textFontSize },
    insidetextanchor: "middle",
    constraintext: "none",
    cliponaxis: false,
    hovertemplate: `<b>%{customdata[0]}</b><br>${name}: %{customdata[1]:,.0f}${hoverPctSuffix}<extra></extra>`,
  };
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

function traceColor(trace: PlotlyData): string | null {
  const raw = (trace as { marker?: { color?: unknown } }).marker?.color;
  return typeof raw === "string" ? raw : null;
}

function legendItemsFromData(data: PlotlyData[]): LegendItem[] {
  return data
    .map((trace) => {
      const color = traceColor(trace);
      if (!trace.name || !color) return null;
      return { label: String(trace.name), color };
    })
    .filter((item): item is LegendItem => item !== null);
}

function extractPointLabel(event: PlotPointEvent): string {
  const point = event.points?.[0] as { customdata?: unknown; y?: unknown; label?: unknown } | undefined;
  const possible = [point?.customdata, point?.y, point?.label];
  const value = possible.find((entry) => typeof entry === "string" && entry.trim().length > 0);
  return typeof value === "string" ? value : "";
}

function FixedLegend({ items }: { items: LegendItem[] }) {
  if (!items.length) return null;

  return (
    <div className="sticky top-0 z-10 border-b border-slate-100 bg-white pb-2 pt-1">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {items.map((item) => (
          <div key={item.label} className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ id }: { id: string; title?: string; subtitle?: string }) {
  return <div id={id} className="scroll-mt-36" />;
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
      {title}
    </div>
  );
}

function SummaryTable({ rows }: { rows: LossRow[] }) {
  const valueClass = (direction: LossRow["direction"]) => {
    if (direction === "gain") return "text-emerald-700";
    if (direction === "dropoff") return "text-red-600";
    return "text-slate-500";
  };
  const signedValue = (row: LossRow) => {
    if (row.direction === "gain") return `+${fmtInt(row.lost)}`;
    if (row.direction === "dropoff") return `-${fmtInt(row.lost)}`;
    return fmtInt(0);
  };
  const signedPct = (row: LossRow) => {
    if (row.direction === "gain") return `+${row.lostPct.toFixed(1)}%`;
    if (row.direction === "dropoff") return `-${row.lostPct.toFixed(1)}%`;
    return "0.0%";
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 text-left">Stage</th>
            <th className="px-3 py-2 text-right">Start</th>
            <th className="px-3 py-2 text-right">End</th>
            <th className="px-3 py-2 text-right">Gain / Drop-off</th>
            <th className="px-3 py-2 text-right">Gain / Drop-off %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.stage} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-2 font-medium text-slate-800">{row.stage}</td>
              <td className="px-3 py-2 text-right">{fmtInt(row.from)}</td>
              <td className="px-3 py-2 text-right">{fmtInt(row.to)}</td>
              <td className={["px-3 py-2 text-right font-semibold", valueClass(row.direction)].join(" ")}>{signedValue(row)}</td>
              <td className={["px-3 py-2 text-right font-medium", valueClass(row.direction)].join(" ")}>{signedPct(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
      const panelWidth = panel?.offsetWidth ?? 260;
      const panelHeight = panel?.offsetHeight ?? 120;
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
    <div
      ref={cardRef}
      className="relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
      onMouseLeave={() => setShowHelp(false)}
    >
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100"
              style={{ backgroundColor: item.bg, color: item.accent }}
            >
              {item.icon}
            </div>
            <div className="text-[12px] font-medium leading-tight text-slate-500">{item.label}</div>
          </div>
          <button
            ref={helpButtonRef}
            type="button"
            onMouseEnter={() => setShowHelp(true)}
            onFocus={() => setShowHelp(true)}
            onBlur={() => setShowHelp(false)}
            onClick={() => setShowHelp((prev) => !prev)}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-400 hover:bg-slate-50"
            aria-label={`${item.label} explanation`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2.5 text-[26px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
          {item.suffix === "yrs"
            ? (item.value > 0 ? item.value.toFixed(1) : "—")
            : fmtInt(item.value)}
          {item.suffix && item.value > 0 ? <span className="ml-1 text-base font-semibold text-slate-400">{item.suffix}</span> : null}
        </div>
        {item.delta !== null && item.label !== "Median Time to Matriculation" ? (
          <div className="mt-2 flex items-center gap-2">
            <div
              className={[
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                rising ? "bg-emerald-50 text-emerald-700" : falling ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500",
              ].join(" ")}
            >
              {rising ? <ArrowUpRight className="h-3 w-3" /> : falling ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {fmtPct(item.delta)}
            </div>
            {prevSessionLabel ? <span className="text-[10px] text-slate-400">vs {prevSessionLabel}</span> : null}
          </div>
        ) : null}
      </div>
      {showHelp ? (
        <div
          ref={helpPanelRef}
          className="pointer-events-none fixed z-[100] w-[260px] rounded-xl bg-slate-950 px-3 py-2.5 text-[11px] leading-4 text-white shadow-2xl"
          style={helpPanelStyle}
        >
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-300">{item.label}</div>
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showHelp) return undefined;

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (helpButtonRef.current?.contains(target)) return;
      if (helpPanelRef.current?.contains(target)) return;
      setShowHelp(false);
    };

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [showHelp]);

  const plotLayout: Partial<PlotlyLayout> | undefined = bundle
    ? {
        ...bundle.layout,
        showlegend: bundle.fixedLegend?.length ? false : bundle.layout.showlegend,
      }
    : undefined;

  const chartBody = bundle ? (
    <Plot
      data={bundle.data}
      layout={plotLayout ?? {}}
      config={bundle.config ?? { displayModeBar: false, responsive: true }}
      useResizeHandler
      style={{ display: "block", width: "100%", height: "100%" }}
      onClick={onPlotClick}
    />
  ) : (
    children
  );

  return (
    <div ref={rootRef} className="relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-3.5 py-2.5">
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
              onClick={() => setShowHelp((prev) => !prev)}
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
            {showHelp ? (
              <div
                ref={helpPanelRef}
                className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-[240px] rounded-xl bg-slate-950 px-3 py-2.5 text-[11px] leading-4 text-white shadow-2xl"
                onClick={(event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation()}
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
          <div className="overflow-y-auto overflow-x-hidden pr-1" style={{ maxHeight: bundle.scrollMaxHeight ?? 380 }}>
            {chartBody}
          </div>
        ) : (
          chartBody
        )}
      </div>
    </div>
  );
}

export default function TransitionDashboard(props: {
  filters: MinisterFilters;
  setFilters: Dispatch<SetStateAction<MinisterFilters>>;
  dimSessions: DimSession[];
  disabilityMode: boolean;
  directMode: boolean;
}) {
  const { filters, setFilters, dimSessions, disabilityMode } = props;

  const [generalRows, setGeneralRows] = useState<TransitionGeneralRow[]>([]);
  const [directRows, setDirectRows] = useState<TransitionDirectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [generalTransitionZoneDrill, setGeneralTransitionZoneDrill] = useState<DrillState>({});
  const [generalTransitionStateDrill, setGeneralTransitionStateDrill] = useState<DrillState>({});
  const [generalDropoffZoneDrill, setGeneralDropoffZoneDrill] = useState<DrillState>({});
  const [generalDropoffStateDrill, setGeneralDropoffStateDrill] = useState<DrillState>({});
  const [directTransitionZoneDrill, setDirectTransitionZoneDrill] = useState<DrillState>({});
  const [directTransitionStateDrill, setDirectTransitionStateDrill] = useState<DrillState>({});
  const [directDropoffZoneDrill, setDirectDropoffZoneDrill] = useState<DrillState>({});
  const [directDropoffStateDrill, setDirectDropoffStateDrill] = useState<DrillState>({});
  const [sortModes, setSortModes] = useState<Record<SortableTransitionChartKey, SortMode>>(DEFAULT_TRANSITION_SORT_MODES);

  const [expandState, setExpandState] = useState<ExpandState>(null);
  const requestedDepth = useMemo(
    () => scopeDepthForLocation(filters),
    [filters.state, filters.lga, filters.ward, filters.school],
  );
  const requestedDataKey = useMemo(
    () => `${canonicalState(filters.state)}|${requestedDepth}`,
    [filters.state, requestedDepth],
  );
  const [loadedDataKey, setLoadedDataKey] = useState(requestedDataKey);
  const [loadedLocation, setLoadedLocation] = useState({
    state: filters.state,
    lga: filters.lga,
    ward: filters.ward,
    school: filters.school,
  });
  const scopePending = requestedDataKey !== loadedDataKey;
  const renderFilters = useMemo(
    () => (scopePending ? { ...filters, ...loadedLocation } : filters),
    [scopePending, filters, loadedLocation],
  );

  useEffect(() => {
    if (!filters.state) return;
    const matchedZone = zoneForState(filters.state);
    if (!matchedZone || filters.zone === matchedZone) return;
    setFilters((previous) => ({ ...previous, zone: matchedZone }));
  }, [filters.state, filters.zone, setFilters]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [generalData, directData] = await Promise.all([
          loadRefinedScopedRows<TransitionGeneralRow>("transition_general", filters.state, requestedDepth),
          loadRefinedScopedRows<TransitionDirectRow>("transition_direct", filters.state, requestedDepth),
        ]);

        if (!mounted) return;
        setGeneralRows(filterRowsBySessionWindow(generalData, TRANSITION_SESSIONS));
        setDirectRows(filterRowsBySessionWindow(directData, TRANSITION_SESSIONS));
        setLoadedDataKey(requestedDataKey);
        setLoadedLocation({
          state: filters.state,
          lga: filters.lga,
          ward: filters.ward,
          school: filters.school,
        });
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load transition data");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [filters.state, requestedDepth, requestedDataKey]);

  useEffect(() => {
    setGeneralTransitionZoneDrill({});
    setGeneralTransitionStateDrill({});
    setGeneralDropoffZoneDrill({});
    setGeneralDropoffStateDrill({});
    setDirectTransitionZoneDrill({});
    setDirectTransitionStateDrill({});
    setDirectDropoffZoneDrill({});
    setDirectDropoffStateDrill({});
  }, [filters.session, filters.zone, filters.state, filters.lga, filters.ward, filters.school, filters.gender, filters.exam_body, filters.gap_band, disabilityMode]);

  const mode = "general" as Mode;
  const normalizedDirectRows = useMemo(
    () => constrainDirectRows(directRows, generalRows),
    [directRows, generalRows],
  );
  const currentRows: BaseRow[] = normalizedDirectRows;

  const previousSession = useMemo(
    () => dimSessions.find((row) => row.session_id === filters.session)?.prev_session_id ?? "",
    [dimSessions, filters.session],
  );
  const expectedLocLevel = useMemo<LocationLevel>(
    () => expectedLocLevelForLocation(renderFilters) as LocationLevel,
    [renderFilters],
  );

  const filteredCurrentRowsRaw = useMemo(() => {
    return currentRows.filter((row) => {
      if (row.session !== renderFilters.session) return false;
      if (row.loc_level && row.loc_level.toLowerCase() !== expectedLocLevel) return false;
      if (renderFilters.zone && row.zone !== renderFilters.zone) return false;
      if (renderFilters.state && canonicalState(row.state) !== canonicalState(renderFilters.state)) return false;
      if (renderFilters.lga && row.lga !== renderFilters.lga) return false;
      if (renderFilters.ward && row.ward !== renderFilters.ward) return false;
      if (renderFilters.school && row.school !== renderFilters.school) return false;
      if (renderFilters.gender && row.gender !== renderFilters.gender) return false;
      if (disabilityMode && row.disability !== "Disabled") return false;
      if (!disabilityMode && row.disability !== "ALL") return false;
      if (renderFilters.exam_body && row.exam_body !== renderFilters.exam_body) return false;
      if (mode === "general" && renderFilters.gap_band && "gap_band" in row && row.gap_band !== renderFilters.gap_band) return false;
      return true;
    });
  }, [currentRows, renderFilters, disabilityMode, mode, expectedLocLevel]);

  const filteredPreviousRowsRaw = useMemo(() => {
    if (!previousSession) return [] as BaseRow[];
    return currentRows.filter((row) => {
      if (row.session !== previousSession) return false;
      if (row.loc_level && row.loc_level.toLowerCase() !== expectedLocLevel) return false;
      if (renderFilters.zone && row.zone !== renderFilters.zone) return false;
      if (renderFilters.state && canonicalState(row.state) !== canonicalState(renderFilters.state)) return false;
      if (renderFilters.lga && row.lga !== renderFilters.lga) return false;
      if (renderFilters.ward && row.ward !== renderFilters.ward) return false;
      if (renderFilters.school && row.school !== renderFilters.school) return false;
      if (renderFilters.gender && row.gender !== renderFilters.gender) return false;
      if (disabilityMode && row.disability !== "Disabled") return false;
      if (!disabilityMode && row.disability !== "ALL") return false;
      if (renderFilters.exam_body && row.exam_body !== renderFilters.exam_body) return false;
      if (mode === "general" && renderFilters.gap_band && "gap_band" in row && row.gap_band !== renderFilters.gap_band) return false;
      return true;
    });
  }, [currentRows, previousSession, renderFilters, disabilityMode, mode, expectedLocLevel]);

  const [lastNonEmptyCurrentRows, setLastNonEmptyCurrentRows] = useState<BaseRow[]>([]);
  const [lastNonEmptyPreviousRows, setLastNonEmptyPreviousRows] = useState<BaseRow[]>([]);

  useEffect(() => {
    if (filteredCurrentRowsRaw.length) setLastNonEmptyCurrentRows(filteredCurrentRowsRaw);
  }, [filteredCurrentRowsRaw]);

  useEffect(() => {
    if (filteredPreviousRowsRaw.length) setLastNonEmptyPreviousRows(filteredPreviousRowsRaw);
  }, [filteredPreviousRowsRaw]);

  const filteredCurrentRows = useMemo(
    () =>
      (loading || scopePending) && !filteredCurrentRowsRaw.length && lastNonEmptyCurrentRows.length
        ? lastNonEmptyCurrentRows
        : filteredCurrentRowsRaw,
    [loading, scopePending, filteredCurrentRowsRaw, lastNonEmptyCurrentRows],
  );

  const filteredPreviousRows = useMemo(
    () =>
      (loading || scopePending) && !filteredPreviousRowsRaw.length && lastNonEmptyPreviousRows.length
        ? lastNonEmptyPreviousRows
        : filteredPreviousRowsRaw,
    [loading, scopePending, filteredPreviousRowsRaw, lastNonEmptyPreviousRows],
  );

  const currentMetrics = useMemo(
    () => aggregateRows(filteredCurrentRows),
    [filteredCurrentRows],
  );

  const previousMetrics = useMemo(
    () => aggregateRows(filteredPreviousRows),
    [filteredPreviousRows],
  );
  const sessionMedianFallback = useMemo(() => {
    const scopedSessionRows = currentRows.filter((row) => {
      if (row.session !== renderFilters.session) return false;
      if (renderFilters.gender && row.gender !== renderFilters.gender) return false;
      if (disabilityMode && row.disability !== 'Disabled') return false;
      if (!disabilityMode && row.disability !== 'ALL') return false;
      if (renderFilters.exam_body && row.exam_body !== renderFilters.exam_body) return false;
      if (mode === 'general' && renderFilters.gap_band && 'gap_band' in row && row.gap_band !== renderFilters.gap_band) return false;
      return true;
    });
    const scopedMedian = aggregateRows(scopedSessionRows).median_time_to_matriculation_years;
    if (scopedMedian > 0) return scopedMedian;
    const sessionRows = currentRows.filter((row) => row.session === renderFilters.session);
    const sessionMedian = aggregateRows(sessionRows).median_time_to_matriculation_years;
    if (sessionMedian > 0) return sessionMedian;
    return aggregateRows(currentRows).median_time_to_matriculation_years;
  }, [currentRows, renderFilters.session, renderFilters.gender, renderFilters.exam_body, renderFilters.gap_band, disabilityMode, mode]);
  const lossRows = useMemo(() => buildLossRows(currentMetrics, mode), [currentMetrics, mode]);

  const cards = useMemo<MetricCard[]>(() => {
    const buildScaledBreakdown = (labels: string[], values: number[], total: number) => {
      const scaledValues = scaleValuesToTotal(values, total);
      return labels.map((label, index) => ({
        label,
        value: formatBreakdownShare(scaledValues[index] ?? 0, total),
      }));
    };
    const examLabels = ["WAEC", "NECO", "NABTEB"];
    const institutionLabels = ["University", "Polytechnic", "College of Education"];
    const examBreakdown = buildScaledBreakdown(
      examLabels,
      examLabels.map((exam) => aggregateRows(filteredCurrentRows.filter((row) => row.exam_body === exam)).o_level_candidates),
      currentMetrics.o_level_candidates,
    );
    const utmeBreakdown = buildScaledBreakdown(
      examLabels,
      examLabels.map((exam) => aggregateRows(filteredCurrentRows.filter((row) => row.exam_body === exam)).utme_participants),
      currentMetrics.utme_participants,
    );
    const admissionBreakdown = buildScaledBreakdown(
      institutionLabels,
      institutionLabels.map((institutionType) => aggregateRows(filteredCurrentRows.filter((row) => row.institution_type === institutionType)).admitted_students),
      currentMetrics.admitted_students,
    );
    const matriculationBreakdown = buildScaledBreakdown(
      institutionLabels,
      institutionLabels.map((institutionType) => aggregateRows(filteredCurrentRows.filter((row) => row.institution_type === institutionType)).matriculated_students),
      currentMetrics.matriculated_students,
    );

    const oLevelHelp = "O-Level exam body breakdown.";
    const utmeHelp = "Total candidates who sat for UTME in the selected academic session and location.";
    const admittedHelp = "Admission destination breakdown.";
    const matriculatedHelp = "Matriculation destination breakdown.";

    if (mode === "direct") {
      return [
        {
          label: "Total SS3 Students",
          help: "Total SS3 students in the selected academic session. These are final-year senior secondary learners whose progress is tracked into O-Level exams, UTME, admission, and matriculation.",
          value: currentMetrics.ss3_total,
          delta: delta(currentMetrics.ss3_total, previousMetrics.ss3_total),
          icon: <Users className="h-5 w-5" />,
          accent: COLORS.ss3,
          bg: "#eff6ff",
        },
        {
          label: "O-Level Candidates",
          help: oLevelHelp,
          breakdown: examBreakdown,
          value: currentMetrics.o_level_candidates,
          delta: delta(currentMetrics.o_level_candidates, previousMetrics.o_level_candidates),
          icon: <BookOpenCheck className="h-5 w-5" />,
          accent: COLORS.olevel,
          bg: "#ecfdf5",
        },
        {
          label: "UTME Participants",
          help: utmeHelp,
          breakdown: utmeBreakdown,
          value: currentMetrics.utme_participants,
          delta: delta(currentMetrics.utme_participants, previousMetrics.utme_participants),
          icon: <GraduationCap className="h-5 w-5" />,
          accent: COLORS.utme,
          bg: "#fffbeb",
        },
        {
          label: "Admitted Students",
          help: admittedHelp,
          breakdown: admissionBreakdown,
          value: currentMetrics.admitted_students,
          delta: delta(currentMetrics.admitted_students, previousMetrics.admitted_students),
          icon: <Landmark className="h-5 w-5" />,
          accent: COLORS.admit,
          bg: "#f5f3ff",
        },
        {
          label: "Matriculated Students",
          help: matriculatedHelp,
          breakdown: matriculationBreakdown,
          value: currentMetrics.matriculated_students,
          delta: delta(currentMetrics.matriculated_students, previousMetrics.matriculated_students),
          icon: <GraduationCap className="h-5 w-5" />,
          accent: COLORS.matric,
          bg: "#fff7ed",
        },
      ];
    }

    return [
      {
        label: "Total SS3 Students",
        help: "Total SS3 students in the selected academic session. These are final-year senior secondary learners whose progress is tracked into O-Level exams, UTME, admission, and matriculation.",
        value: currentMetrics.ss3_total,
        delta: delta(currentMetrics.ss3_total, previousMetrics.ss3_total),
        icon: <Users className="h-5 w-5" />,
        accent: COLORS.ss3,
        bg: "#eff6ff",
      },
      {
        label: "O-Level Candidates",
        help: oLevelHelp,
        breakdown: examBreakdown,
        value: currentMetrics.o_level_candidates,
        delta: delta(currentMetrics.o_level_candidates, previousMetrics.o_level_candidates),
        icon: <BookOpenCheck className="h-5 w-5" />,
        accent: COLORS.olevel,
        bg: "#ecfdf5",
      },
      {
        label: "UTME Participants",
        help: utmeHelp,
        value: currentMetrics.utme_participants,
        delta: delta(currentMetrics.utme_participants, previousMetrics.utme_participants),
        icon: <GraduationCap className="h-5 w-5" />,
        accent: COLORS.utme,
        bg: "#fffbeb",
      },
      {
        label: "Admitted Students",
        help: admittedHelp,
        breakdown: admissionBreakdown,
        value: currentMetrics.admitted_students,
        delta: delta(currentMetrics.admitted_students, previousMetrics.admitted_students),
        icon: <Landmark className="h-5 w-5" />,
        accent: COLORS.admit,
        bg: "#f5f3ff",
      },
      {
        label: "Matriculated Students",
        help: matriculatedHelp,
        breakdown: matriculationBreakdown,
        value: currentMetrics.matriculated_students,
        delta: delta(currentMetrics.matriculated_students, previousMetrics.matriculated_students),
        icon: <GraduationCap className="h-5 w-5" />,
        accent: COLORS.matric,
        bg: "#fff7ed",
      },
      {
        label: "Learners with >2 Year Admission Gap",
        help: "Students who eventually gained tertiary admission but did not enter directly in the same academic year as their O-Level result. This signals delayed transition after O-Level.",
        value: currentMetrics.delayed_transition_students,
        delta: delta(currentMetrics.delayed_transition_students, previousMetrics.delayed_transition_students),
        icon: <Users className="h-5 w-5" />,
        accent: COLORS.utme,
        bg: "#fff7ed",
      },
      {
        label: "Median Time to Matriculation",
        help: "The median number of years between an O-Level result and full tertiary matriculation. A value above 1.0 signals that most students are not transitioning directly in the same session.",
        value: currentMetrics.median_time_to_matriculation_years > 0 ? currentMetrics.median_time_to_matriculation_years : sessionMedianFallback,
        delta: delta(
          currentMetrics.median_time_to_matriculation_years > 0 ? currentMetrics.median_time_to_matriculation_years : sessionMedianFallback,
          previousMetrics.median_time_to_matriculation_years,
        ),
        icon: <Clock3 className="h-5 w-5" />,
        accent: COLORS.olevel,
        bg: "#f0fdf4",
        suffix: "yrs",
      },
    ];
  }, [currentMetrics, previousMetrics, mode, sessionMedianFallback, filteredCurrentRows, renderFilters, disabilityMode]);


const progressionChart = useMemo<ChartBundle>(() => {
  const layout = buildCommonLayout(328);
  const labels = ["SS3 Students", "O-Level Candidates", "UTME Participants", "Admitted Students", "Matriculated Students"];
  const values = [
    currentMetrics.ss3_total,
    currentMetrics.o_level_candidates,
    currentMetrics.utme_participants,
    currentMetrics.admitted_students,
    currentMetrics.matriculated_students,
  ];
  const max = Math.max(...values, 1);
  const ss3Baseline = Math.max(1, currentMetrics.ss3_total);
  const examLabels = ["WAEC", "NECO", "NABTEB"];
  const examBodyHoverBreakdown = (metricKey: "o_level_candidates" | "utme_participants", total: number) => {
    const scaledValues = scaleValuesToTotal(
      examLabels.map((exam) => aggregateRows(filteredCurrentRows.filter((row) => row.exam_body === exam))[metricKey]),
      total,
    );
    const lines = examLabels.map((exam, index) => {
      const value = scaledValues[index] ?? 0;
      const pct = total > 0 ? (value / total) * 100 : 0;
      return `${exam}: <b>${fmtInt(value)}</b> (${pct.toFixed(1)}%)`;
    });
    return total > 0 ? lines.join("<br>") : "No exam-body breakdown available";
  };
  const pctOfPrevious = (value: number, previous: number, label: string) => {
    if (previous <= 0) return "";
    return `<br>${((value / previous) * 100).toFixed(1)}% of ${label}`;
  };
  const oLevelGain = Math.max(0, currentMetrics.o_level_candidates - currentMetrics.ss3_total);
  const funnelWidths = values.map((value) => (currentMetrics.ss3_total > 0 ? (value / ss3Baseline) * 100 : (value / max) * 100));
  const hoverTexts = [
    `SS3 Students<br><b>${fmtInt(currentMetrics.ss3_total)}</b><br>Baseline: <b>100.0%</b>`,
    `O-Level Candidates<br><b>${fmtInt(currentMetrics.o_level_candidates)}</b>${pctOfPrevious(currentMetrics.o_level_candidates, currentMetrics.ss3_total, "SS3 baseline")}<br>${
      oLevelGain > 0
        ? `Gain above SS3 baseline: <b>+${fmtInt(oLevelGain)}</b>`
        : "No SS3 → O-Level drop-off recorded"
    }<br><br><b>O-Level breakdown by exam body</b><br>${examBodyHoverBreakdown("o_level_candidates", currentMetrics.o_level_candidates)}`,
    `UTME Participants<br><b>${fmtInt(currentMetrics.utme_participants)}</b>${pctOfPrevious(currentMetrics.utme_participants, currentMetrics.o_level_candidates, "O-Level")}<br><br><b>UTME breakdown by O-Level exam body</b><br>${examBodyHoverBreakdown("utme_participants", currentMetrics.utme_participants)}`,
    `Admitted Students<br><b>${fmtInt(currentMetrics.admitted_students)}</b>${pctOfPrevious(currentMetrics.admitted_students, currentMetrics.utme_participants, "UTME")}`,
    `Matriculated Students<br><b>${fmtInt(currentMetrics.matriculated_students)}</b>${pctOfPrevious(currentMetrics.matriculated_students, currentMetrics.admitted_students, "Admitted")}`,
  ];

  return {
    data: [
      {
        type: "funnel",
        y: labels,
        x: funnelWidths,
        text: values.map((value, index) => `${labels[index]}<br><b>${fmtInt(value)}</b>`),
        textposition: "inside",
        textinfo: "text",
        customdata: hoverTexts,
        marker: { color: [COLORS.ss3, COLORS.olevel, COLORS.utme, COLORS.admit, COLORS.matric] },
        hovertemplate: "%{customdata}<extra></extra>",
        hoverlabel: { align: "left", font: { size: 10 } },
      },
    ],
    layout: {
      ...layout,
      margin: { l: 10, r: 10, t: 10, b: 10 },
      xaxis: { showgrid: false, showticklabels: false, zeroline: false },
      yaxis: { showgrid: false, showticklabels: false, zeroline: false },
      hoverlabel: { bgcolor: "#0f172a", font: { color: "#fff", size: 10 }, align: "left" },
      showlegend: false,
    },
  };
}, [currentMetrics, filteredCurrentRows]);


  const genderChart = useMemo<ChartBundle>(() => {
    const male = aggregateRows(filteredCurrentRows.filter((row) => row.gender === "Male"));
    const female = aggregateRows(filteredCurrentRows.filter((row) => row.gender === "Female"));
    const labels = ["SS3", "O-Level", "UTME", "Admitted", "Matriculated"];
    const maleValues = [male.ss3_total, male.o_level_candidates, male.utme_participants, male.admitted_students, male.matriculated_students];
    const femaleValues = [female.ss3_total, female.o_level_candidates, female.utme_participants, female.admitted_students, female.matriculated_students];

    const visualSeries = minimumVisibleStackValues([maleValues, femaleValues], 0.16);

    return {
      data: [
        verticalBarTrace("Male", labels, maleValues, COLORS.male, visualSeries[0]),
        verticalBarTrace("Female", labels, femaleValues, COLORS.female, visualSeries[1]),
      ],
      layout: {
        ...buildCommonLayout(336),
        barmode: "group",
        bargap: 0.22,
        margin: { l: 55, r: 18, t: 12, b: 70 },
      },
    };
  }, [filteredCurrentRows, mode]);


  const generalTimingDistribution = useMemo<ChartBundle | null>(() => {
    if (mode !== "general") return null;

    const rawByGap = GAP_OPTIONS.map((gap) => {
      const metrics = aggregateRows(generalRows.filter((row) => {
        if (row.session !== renderFilters.session) return false;
        if (renderFilters.zone && row.zone !== renderFilters.zone) return false;
        if (renderFilters.state && canonicalState(row.state) !== canonicalState(renderFilters.state)) return false;
        if (renderFilters.lga && row.lga !== renderFilters.lga) return false;
        if (renderFilters.ward && row.ward !== renderFilters.ward) return false;
        if (renderFilters.school && row.school !== renderFilters.school) return false;
        if (renderFilters.gender && row.gender !== renderFilters.gender) return false;
        if (disabilityMode && row.disability !== "Disabled") return false;
        if (!disabilityMode && row.disability !== "ALL") return false;
        if (renderFilters.exam_body && row.exam_body !== renderFilters.exam_body) return false;
        return row.gap_band === gap;
      }));
      return { gap, value: metrics.matriculated_students };
    });
    const scaledGapValues = scaleValuesToTotal(rawByGap.map((row) => row.value), currentMetrics.matriculated_students);
    const byGap = rawByGap.map((row, index) => ({ ...row, value: scaledGapValues[index] ?? 0 }));

    const colors = [COLORS.lag1, COLORS.lag2, COLORS.lag35, COLORS.lag5];
    const positions = [0.82, 0.62, 0.42, 0.22];

    return {
      data: [
        {
          type: "pie",
          hole: 0.62,
          sort: false,
          direction: "clockwise",
          labels: byGap.map((row) => row.gap),
          values: byGap.map((row) => row.value),
          marker: {
            colors,
            line: { color: "#ffffff", width: 4 },
          },
          texttemplate: "%{percent:.0%}",
          textposition: "inside",
          insidetextorientation: "horizontal",
          textfont: { size: 12, color: "#ffffff" },
          hovertemplate: "%{label}: %{value:,} students (%{percent})<extra></extra>",
          domain: { x: [0.02, 0.44], y: [0.08, 0.92] },
        },
      ],
      titleNote: titleGrandTotal("Matriculated Students", currentMetrics.matriculated_students),
      layout: {
        ...buildCommonLayout(336),
        margin: { l: 8, r: 8, t: 10, b: 10 },
        showlegend: false,
        xaxis: { visible: false },
        yaxis: { visible: false },
        shapes: [0.72, 0.52, 0.32].map((y) => ({
          type: "line",
          xref: "paper",
          yref: "paper",
          x0: 0.48,
          x1: 0.98,
          y0: y,
          y1: y,
          line: { color: "rgba(148,163,184,0.25)", width: 1 },
        })),
        annotations: byGap.flatMap((row, index) => {
          return [
            {
              x: 0.52,
              y: positions[index],
              xref: "paper",
              yref: "paper",
              showarrow: false,
              xanchor: "left",
              align: "left",
              text: `<span style="color:${colors[index]}">●</span> ${row.gap}`,
              font: { size: 12, color: COLORS.text },
            },
            {
              x: 0.98,
              y: positions[index],
              xref: "paper",
              yref: "paper",
              showarrow: false,
              xanchor: "right",
              align: "right",
              text: `<b>${fmtInt(row.value)}</b>`,
              font: { size: 12, color: COLORS.text },
            },
          ];
        }),
      },
    };
  }, [generalRows, renderFilters, disabilityMode, mode, currentMetrics.matriculated_students]);

  const generalInstitutionTiming = useMemo<ChartBundle | null>(() => {
    if (mode !== "general") return null;

    const baseRows = generalRows.filter((row) => {
      if (row.session !== renderFilters.session) return false;
      if (renderFilters.zone && row.zone !== renderFilters.zone) return false;
      if (renderFilters.state && canonicalState(row.state) !== canonicalState(renderFilters.state)) return false;
      if (renderFilters.lga && row.lga !== renderFilters.lga) return false;
      if (renderFilters.ward && row.ward !== renderFilters.ward) return false;
      if (renderFilters.school && row.school !== renderFilters.school) return false;
      if (renderFilters.gender && row.gender !== renderFilters.gender) return false;
      if (disabilityMode && row.disability !== "Disabled") return false;
      if (!disabilityMode && row.disability !== "ALL") return false;
      if (renderFilters.exam_body && row.exam_body !== renderFilters.exam_body) return false;
      return true;
    });

    const labels = [...GAP_OPTIONS];
    const rawSeries = [
      labels.map((gap) => aggregateRows(baseRows.filter((row) => row.institution_type === "University" && row.gap_band === gap)).matriculated_students),
      labels.map((gap) => aggregateRows(baseRows.filter((row) => row.institution_type === "Polytechnic" && row.gap_band === gap)).matriculated_students),
      labels.map((gap) => aggregateRows(baseRows.filter((row) => row.institution_type === "College of Education" && row.gap_band === gap)).matriculated_students),
    ];
    const scaledSeries = scaleMatrixToTotal(rawSeries, currentMetrics.matriculated_students);
    const visualSeries = minimumVisibleStackValues(scaledSeries, 0.16);

    return {
      data: [
        verticalBarTrace("University", labels, scaledSeries[0] ?? [], COLORS.university, visualSeries[0]),
        verticalBarTrace("Polytechnic", labels, scaledSeries[1] ?? [], COLORS.polytechnic, visualSeries[1]),
        verticalBarTrace("College of Education", labels, scaledSeries[2] ?? [], COLORS.coe, visualSeries[2]),
      ].map((trace) => ({
        ...trace,
        textangle: -90,
        textfont: { color: "#ffffff", size: 10 },
      })) as PlotlyData[],
      titleNote: titleGrandTotal("Matriculated Students", currentMetrics.matriculated_students),
      layout: {
        ...buildCommonLayout(336),
        barmode: "group",
        bargap: 0.22,
        margin: { l: 55, r: 18, t: 12, b: 70 },
      },
    };
  }, [generalRows, renderFilters, disabilityMode, mode, currentMetrics.matriculated_students]);

  const lossByGenderChart = useMemo<ChartBundle>(() => {
    const male = aggregateRows(filteredCurrentRows.filter((row) => row.gender === "Male"));
    const female = aggregateRows(filteredCurrentRows.filter((row) => row.gender === "Female"));
    const labels = ["SS3 → O-Level Gain", "O-Level → UTME", "UTME → Admitted", "Admitted → Matric"];

    const maleLosses = [
      Math.max(0, male.o_level_candidates - male.ss3_total),
      Math.max(0, male.o_level_candidates - male.utme_participants),
      Math.max(0, male.utme_participants - male.admitted_students),
      Math.max(0, male.admitted_students - male.matriculated_students),
    ];

    const femaleLosses = [
      Math.max(0, female.o_level_candidates - female.ss3_total),
      Math.max(0, female.o_level_candidates - female.utme_participants),
      Math.max(0, female.utme_participants - female.admitted_students),
      Math.max(0, female.admitted_students - female.matriculated_students),
    ];

    const visualSeries = minimumVisibleStackValues([maleLosses, femaleLosses], 0.16);

    return {
      data: [
        verticalBarTrace("Male", labels, maleLosses, COLORS.male, visualSeries[0]),
        verticalBarTrace("Female", labels, femaleLosses, COLORS.female, visualSeries[1]),
      ],
      layout: {
        ...buildCommonLayout(336),
        barmode: "group",
        margin: { l: 55, r: 18, t: 12, b: 80 },
      },
    };
  }, [filteredCurrentRows, mode]);



const buildTransitionLocationChart = (
  baseLevel: LocationLevel,
  drill: DrillState,
  sortMode: SortMode = DEFAULT_SORT_MODE,
): LocationChartResult => {
  const resolved = resolveLocationRows(filteredCurrentRows, baseLevel, drill, renderFilters);
  const grouped = makeGrouped(
    resolved.rows,
    resolved.level,
    sortMode,
    (row) => row.metrics.matriculated_students,
    renderFilters.zone,
  );
  const labels = grouped.map((row) => displayLocationLabel(row.label, resolved.level));
  const isScrollable = baseLevel === "state" || resolved.level === "state" || resolved.level === "lga";
  const height = Math.max(isScrollable ? 560 : 360, labels.length * (isScrollable ? 42 : 34) + 140);

  const ss3Values = grouped.map((row) => row.metrics.ss3_total);
  const realSeries = [
    ss3Values,
    grouped.map((row) => row.metrics.o_level_candidates),
    grouped.map((row) => row.metrics.utme_participants),
    grouped.map((row) => row.metrics.admitted_students),
    grouped.map((row) => row.metrics.matriculated_students),
  ];
  const visualSeries = minimumVisibleStackValues(realSeries, 0.105);
  const maxVisualTotal = Math.max(
    ...labels.map((_, index) => visualSeries.reduce((sum, series) => sum + safeNum(series[index]), 0)),
    1,
  );

  const data: PlotlyData[] = [
    horizontalBarTrace("Total SS3 Students", labels, realSeries[0] ?? [], COLORS.ss3, "inside", 11, ss3Values, visualSeries[0]),
    horizontalBarTrace("O-Level Candidates", labels, realSeries[1] ?? [], COLORS.olevel, "inside", 11, ss3Values, visualSeries[1]),
    horizontalBarTrace("UTME Participants", labels, realSeries[2] ?? [], COLORS.utme, "inside", 11, ss3Values, visualSeries[2]),
    horizontalBarTrace("Admitted Students", labels, realSeries[3] ?? [], COLORS.admit, "inside", 11, ss3Values, visualSeries[3]),
    horizontalBarTrace("Matriculated Students", labels, realSeries[4] ?? [], COLORS.matric, "inside", 11, ss3Values, visualSeries[4]),
  ];

  return {
    level: resolved.level,
    bundle: {
      data,
      layout: {
        ...buildCommonLayout(height),
        uirevision: `transition-location-${baseLevel}-${resolved.level}-${sortMode}-${labels.length}`,
        barmode: "stack",
        bargap: 0.12,
        showlegend: false,
        margin: { l: 112, r: 10, t: 8, b: 18 },
        xaxis: horizontalValueAxis(maxVisualTotal),
        yaxis: { showgrid: false, automargin: false, autorange: "reversed", tickfont: { color: COLORS.sub, size: 10.5 } },
      },
      scrollable: isScrollable,
      scrollMaxHeight: isScrollable ? 360 : undefined,
      expandedMaxHeight: isScrollable ? 520 : 430,
      fixedLegend: legendItemsFromData(data),
      expandedWidthClass: isScrollable ? "max-w-[1040px]" : "max-w-[940px]",
    },
  };
};

const buildDropoffLocationChart = (
  baseLevel: LocationLevel,
  drill: DrillState,
  sortMode: SortMode = DEFAULT_SORT_MODE,
): LocationChartResult => {
  const resolved = resolveLocationRows(filteredCurrentRows, baseLevel, drill, renderFilters);
  const grouped = makeGrouped(
    resolved.rows,
    resolved.level,
    sortMode,
    (row) => {
      return Math.max(0, row.metrics.o_level_candidates - row.metrics.ss3_total) +
        Math.max(0, row.metrics.o_level_candidates - row.metrics.utme_participants) +
        Math.max(0, row.metrics.utme_participants - row.metrics.admitted_students) +
        Math.max(0, row.metrics.admitted_students - row.metrics.matriculated_students);
    },
    renderFilters.zone,
  );
  const labels = grouped.map((row) => displayLocationLabel(row.label, resolved.level));
  const isScrollable = baseLevel === "state" || resolved.level === "state" || resolved.level === "lga";
  const height = Math.max(isScrollable ? 560 : 380, labels.length * (isScrollable ? 44 : 36) + 148);

  const ss3Values = grouped.map((row) => row.metrics.ss3_total);
  const realSeries = [
    grouped.map((row) => Math.max(0, row.metrics.o_level_candidates - row.metrics.ss3_total)),
    grouped.map((row) => Math.max(0, row.metrics.o_level_candidates - row.metrics.utme_participants)),
    grouped.map((row) => Math.max(0, row.metrics.utme_participants - row.metrics.admitted_students)),
    grouped.map((row) => Math.max(0, row.metrics.admitted_students - row.metrics.matriculated_students)),
  ];
  const visualSeries = minimumVisibleStackValues(realSeries, 0.13);
  const maxVisualTotal = Math.max(
    ...labels.map((_, index) => visualSeries.reduce((sum, series) => sum + safeNum(series[index]), 0)),
    1,
  );

  const data: PlotlyData[] = [
    horizontalBarTrace("SS3 → O-Level Gain", labels, realSeries[0] ?? [], COLORS.olevel, "inside", 11, ss3Values, visualSeries[0]),
    horizontalBarTrace("O-Level → UTME Drop-off", labels, realSeries[1] ?? [], COLORS.utme, "inside", 11, ss3Values, visualSeries[1]),
    horizontalBarTrace("UTME → Admitted Drop-off", labels, realSeries[2] ?? [], COLORS.admit, "inside", 11, ss3Values, visualSeries[2]),
    horizontalBarTrace("Admitted → Matric Drop-off", labels, realSeries[3] ?? [], COLORS.matric, "inside", 11, ss3Values, visualSeries[3]),
  ];
  const totalGainDropoff = realSeries.reduce((sum, series) => sum + series.reduce((inner, value) => inner + safeNum(value), 0), 0);

  return {
    level: resolved.level,
    bundle: {
      data,
      layout: {
        ...buildCommonLayout(height),
        uirevision: `transition-dropoff-${baseLevel}-${resolved.level}-${sortMode}-${labels.length}`,
        barmode: "stack",
        bargap: 0.12,
        showlegend: false,
        margin: { l: 112, r: 10, t: 8, b: 18 },
        xaxis: horizontalValueAxis(maxVisualTotal),
        yaxis: { showgrid: false, automargin: false, autorange: "reversed", tickfont: { color: COLORS.sub, size: 10.5 } },
      },
      titleNote: titleGrandTotal("Students Gained / Dropped Off", totalGainDropoff),
      scrollable: isScrollable,
      scrollMaxHeight: isScrollable ? 360 : undefined,
      expandedMaxHeight: isScrollable ? 530 : 430,
      fixedLegend: legendItemsFromData(data),
      expandedWidthClass: isScrollable ? "max-w-[1040px]" : "max-w-[940px]",
    },
  };
};

  const generalTransitionZoneChart = useMemo(
    () => buildTransitionLocationChart("zone", generalTransitionZoneDrill, sortModes.generalTransitionZone),
    [filteredCurrentRows, renderFilters, generalTransitionZoneDrill, mode, sortModes.generalTransitionZone],
  );
  const generalTransitionStateChart = useMemo(
    () => buildTransitionLocationChart("state", generalTransitionStateDrill, sortModes.generalTransitionState),
    [filteredCurrentRows, renderFilters, generalTransitionStateDrill, mode, sortModes.generalTransitionState],
  );
  const generalDropoffZoneChart = useMemo(
    () => buildDropoffLocationChart("zone", generalDropoffZoneDrill, sortModes.generalDropoffZone),
    [filteredCurrentRows, renderFilters, generalDropoffZoneDrill, mode, sortModes.generalDropoffZone],
  );
  const generalDropoffStateChart = useMemo(
    () => buildDropoffLocationChart("state", generalDropoffStateDrill, sortModes.generalDropoffState),
    [filteredCurrentRows, renderFilters, generalDropoffStateDrill, mode, sortModes.generalDropoffState],
  );
  const directTransitionZoneChart = useMemo(
    () => buildTransitionLocationChart("zone", directTransitionZoneDrill, sortModes.directTransitionZone),
    [filteredCurrentRows, renderFilters, directTransitionZoneDrill, mode, sortModes.directTransitionZone],
  );
  const directTransitionStateChart = useMemo(
    () => buildTransitionLocationChart("state", directTransitionStateDrill, sortModes.directTransitionState),
    [filteredCurrentRows, renderFilters, directTransitionStateDrill, mode, sortModes.directTransitionState],
  );
  const directDropoffZoneChart = useMemo(
    () => buildDropoffLocationChart("zone", directDropoffZoneDrill, sortModes.directDropoffZone),
    [filteredCurrentRows, renderFilters, directDropoffZoneDrill, mode, sortModes.directDropoffZone],
  );
  const directDropoffStateChart = useMemo(
    () => buildDropoffLocationChart("state", directDropoffStateDrill, sortModes.directDropoffState),
    [filteredCurrentRows, renderFilters, directDropoffStateDrill, mode, sortModes.directDropoffState],
  );

  const helpText = {
    progression: "Shows how learners move from SS3 through O-Level, UTME, admission, and matriculation for the selected session and location.",
    lossTable: "This table shows gain / drop-off across the pathway. SS3 → O-Level is treated as a no-drop-off stage; any increase is shown as a green gain because O-Level can include candidates beyond same-session SS3.",
    timing: "This shows how General pathway matriculated learners are split by time taken after O-Level.",
    timingInst: "This compares time-to-matriculation bands across University, Polytechnic, and College of Education destinations.",
    gender: "This compares male and female learner volumes at each stage so you can quickly spot gender imbalance across the transition journey.",
    zone: "This chart starts at Zone level and can drill deeper through State, LGA, Ward, and School. Use refresh to reset that chart only.",
    state: "This chart starts at State level and can drill deeper through LGA, Ward, and School. Use refresh to reset that chart only.",
    dropoffGender: "This compares gain / drop-off between each transition stage by gender. SS3 → O-Level is shown as gain/no-drop-off, not a red loss.",
    dropoffZone: "This gain / drop-off chart starts at Zone level and can drill deeper through State, LGA, Ward, and School.",
    dropoffState: "This gain / drop-off chart starts at State level and can drill deeper through LGA, Ward, and School.",
  };

  const sortControlForKey = (chartKey: ExpandChartKey): ReactNode => {
    if (!isSortableTransitionChartKey(chartKey)) return null;
    return (
      <ChartSortControl
        value={sortModes[chartKey]}
        onChange={(value) => setSortModes((previous) => ({ ...previous, [chartKey]: value }))}
      />
    );
  };

  const syncFiltersForDrill = (currentLevel: LocationLevel, pointLabel: string) => {
    if (!pointLabel || currentLevel === "school") return;

    setFilters((previous) => {
      if (currentLevel === "zone") {
        if (previous.zone === pointLabel && !previous.state && !previous.lga && !previous.ward && !previous.school) return previous;
        return { ...previous, zone: pointLabel, state: "", lga: "", ward: "", school: "" };
      }
      if (currentLevel === "state") {
        const sourceLabel = sourceLocationLabel(pointLabel);
        const matchedZone = zoneForState(sourceLabel);
        if (previous.state === sourceLabel && previous.zone === matchedZone && !previous.lga && !previous.ward && !previous.school) return previous;
        return { ...previous, zone: matchedZone || previous.zone, state: sourceLabel, lga: "", ward: "", school: "" };
      }
      if (currentLevel === "lga") {
        if (previous.lga === pointLabel && !previous.ward && !previous.school) return previous;
        return { ...previous, lga: pointLabel, ward: "", school: "" };
      }
      if (currentLevel === "ward") {
        if (previous.ward === pointLabel && !previous.school) return previous;
        return { ...previous, ward: pointLabel, school: "" };
      }
      return previous;
    });
  };

  const resetLocationFilters = () => {
    setFilters((previous) => {
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
  };

  const applyDrill = (setter: DrillSetter, currentLevel: LocationLevel, pointLabel: string) => {
    if (!pointLabel || currentLevel === "school") return;

    syncFiltersForDrill(currentLevel, pointLabel);

    queueMicrotask(() => {
      setter((prev) => {
        if (currentLevel === "zone") return { zone: pointLabel };
        if (currentLevel === "state") return { ...prev, state: sourceLocationLabel(pointLabel), lga: undefined, ward: undefined };
        if (currentLevel === "lga") return { ...prev, lga: pointLabel, ward: undefined };
        if (currentLevel === "ward") return { ...prev, ward: pointLabel };
        return prev;
      });
    });
  };


const expandedCharts: Record<
  ExpandChartKey,
  {
    bundle: ChartBundle;
    onPlotClick?: (event: PlotPointEvent) => void;
  }
> = {
  progression: { bundle: progressionChart },
  timingDistribution: { bundle: generalTimingDistribution as ChartBundle },
  timingInstitution: { bundle: generalInstitutionTiming as ChartBundle },
  gender: { bundle: genderChart },
  lossByGender: { bundle: lossByGenderChart },
  generalTransitionZone: {
    bundle: generalTransitionZoneChart.bundle,
    onPlotClick: (event) => {
      const label = extractPointLabel(event);
      applyDrill(setGeneralTransitionZoneDrill, generalTransitionZoneChart.level, label);
    },
  },
  generalTransitionState: {
    bundle: generalTransitionStateChart.bundle,
    onPlotClick: (event) => {
      const label = extractPointLabel(event);
      applyDrill(setGeneralTransitionStateDrill, generalTransitionStateChart.level, label);
    },
  },
  generalDropoffZone: {
    bundle: generalDropoffZoneChart.bundle,
    onPlotClick: (event) => {
      const label = extractPointLabel(event);
      applyDrill(setGeneralDropoffZoneDrill, generalDropoffZoneChart.level, label);
    },
  },
  generalDropoffState: {
    bundle: generalDropoffStateChart.bundle,
    onPlotClick: (event) => {
      const label = extractPointLabel(event);
      applyDrill(setGeneralDropoffStateDrill, generalDropoffStateChart.level, label);
    },
  },
  directTransitionZone: {
    bundle: directTransitionZoneChart.bundle,
    onPlotClick: (event) => {
      const label = extractPointLabel(event);
      applyDrill(setDirectTransitionZoneDrill, directTransitionZoneChart.level, label);
    },
  },
  directTransitionState: {
    bundle: directTransitionStateChart.bundle,
    onPlotClick: (event) => {
      const label = extractPointLabel(event);
      applyDrill(setDirectTransitionStateDrill, directTransitionStateChart.level, label);
    },
  },
  directDropoffZone: {
    bundle: directDropoffZoneChart.bundle,
    onPlotClick: (event) => {
      const label = extractPointLabel(event);
      applyDrill(setDirectDropoffZoneDrill, directDropoffZoneChart.level, label);
    },
  },
  directDropoffState: {
    bundle: directDropoffStateChart.bundle,
    onPlotClick: (event) => {
      const label = extractPointLabel(event);
      applyDrill(setDirectDropoffStateDrill, directDropoffStateChart.level, label);
    },
  },
};

const expandedChart = expandState && "chartKey" in expandState && expandState.chartKey ? expandedCharts[expandState.chartKey] : null;

  if (loading && !generalRows.length && !directRows.length) {
    return <EmptyState title="Loading Transition dashboard…" />;
  }

  if (error) {
    return <EmptyState title={`Could not load Transition CSVs: ${error}`} />;
  }

  return (
    <div className="space-y-6">
      <SectionLabel
        id={mode === "general" ? "transition-general-kpi" : "transition-direct-kpi"}
        title="KPI Summary"
        subtitle="Top-line transition cards arranged to match the approved mockup flow."
      />
      <div className="space-y-3 overflow-x-auto pb-1">
        <div className="grid min-w-[920px] grid-cols-4 gap-3">
          {cards.slice(0, 4).map((card) => (
            <KpiCard key={card.label} item={card} prevSessionLabel={previousSession || undefined} />
          ))}
        </div>
        {cards.length > 4 ? (
          <div className="grid min-w-[690px] grid-cols-3 gap-3">
            {cards.slice(4, 7).map((card) => (
              <KpiCard key={card.label} item={card} prevSessionLabel={previousSession || undefined} />
            ))}
          </div>
        ) : null}
      </div>

      {mode === "general" ? (
        <>
          <SectionLabel
            id="transition-general-overview"
            title="Transition Overview"
            subtitle="Core learner journey and gain / drop-off summary for the General pathway."
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard
              title="Students Progression Overview"
              bundle={progressionChart}
              explanation={helpText.progression}
              onRefresh={() => undefined}
              onExpand={() => setExpandState({ title: "Students Progression Overview", chartKey: "progression" })}
            />
            <ChartCard
              title="Student Gain / Drop-off by Stage"
              explanation={helpText.lossTable}
              onRefresh={() => undefined}
              onExpand={() => setExpandState({ title: "Student Gain / Drop-off by Stage", tableRows: lossRows })}
            >
              <SummaryTable rows={lossRows} />
            </ChartCard>
          </div>

          <SectionLabel
            id="transition-general-timing"
            title="Time to Matriculation"
            subtitle="Distribution and institution timing view for the General pathway."
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard
              title="Time to Matriculation Distribution"
              bundle={generalTimingDistribution ?? undefined}
              explanation={helpText.timing}
              onRefresh={() => undefined}
              onExpand={() => {
                if (generalTimingDistribution) {
                  setExpandState({ title: "Time to Matriculation Distribution", chartKey: "timingDistribution" });
                }
              }}
            >
              {!generalTimingDistribution ? <EmptyState title="No timing distribution available for the current filters." /> : null}
            </ChartCard>
            <ChartCard
              title="Time to Matriculation by Institution Type"
              bundle={generalInstitutionTiming ?? undefined}
              explanation={helpText.timingInst}
              onRefresh={() => undefined}
              onExpand={() => {
                if (generalInstitutionTiming) {
                  setExpandState({ title: "Time to Matriculation by Institution Type", chartKey: "timingInstitution" });
                }
              }}
            >
              {!generalInstitutionTiming ? <EmptyState title="No institution timing view available for the current filters." /> : null}
            </ChartCard>
          </div>


          <SectionLabel
            id="transition-general-transition"
            title="Transition Analysis"
            subtitle="Gender, zone, and state transition charts arranged in the same story flow as the mockup."
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard
              title="Transition by Zone"
              bundle={generalTransitionZoneChart.bundle}
              sortControl={sortControlForKey("generalTransitionZone")}
              explanation={helpText.zone}
              onRefresh={() => { setGeneralTransitionZoneDrill({}); resetLocationFilters(); }}
              onExpand={() => setExpandState({ title: "Transition by Zone", chartKey: "generalTransitionZone" })}
              onPlotClick={(event) => {
                const label = extractPointLabel(event);
                applyDrill(setGeneralTransitionZoneDrill, generalTransitionZoneChart.level, label);
              }}
            />
            <ChartCard
              title="Transition by State"
              bundle={generalTransitionStateChart.bundle}
              sortControl={sortControlForKey("generalTransitionState")}
              explanation={helpText.state}
              onRefresh={() => { setGeneralTransitionStateDrill({}); resetLocationFilters(); }}
              onExpand={() => setExpandState({ title: "Transition by State", chartKey: "generalTransitionState" })}
              onPlotClick={(event) => {
                const label = extractPointLabel(event);
                applyDrill(setGeneralTransitionStateDrill, generalTransitionStateChart.level, label);
              }}
            />
          </div>
          <ChartCard
            title="Transition by Gender"
            bundle={genderChart}
            explanation={helpText.gender}
            onRefresh={() => undefined}
            onExpand={() => setExpandState({ title: "Transition by Gender", chartKey: "gender" })}
          />

          <SectionLabel
            id="transition-general-dropoff"
            title="Gain / Drop-off Analysis"
            subtitle="Gain / drop-off charts laid out to mirror the approved General mockup sequence."
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard
              title="Gain / Drop-off by Zone"
              bundle={generalDropoffZoneChart.bundle}
              sortControl={sortControlForKey("generalDropoffZone")}
              explanation={helpText.dropoffZone}
              onRefresh={() => { setGeneralDropoffZoneDrill({}); resetLocationFilters(); }}
              onExpand={() => setExpandState({ title: "Gain / Drop-off by Zone", chartKey: "generalDropoffZone" })}
              onPlotClick={(event) => {
                const label = extractPointLabel(event);
                applyDrill(setGeneralDropoffZoneDrill, generalDropoffZoneChart.level, label);
              }}
            />
            <ChartCard
              title="Gain / Drop-off by State"
              bundle={generalDropoffStateChart.bundle}
              sortControl={sortControlForKey("generalDropoffState")}
              explanation={helpText.dropoffState}
              onRefresh={() => { setGeneralDropoffStateDrill({}); resetLocationFilters(); }}
              onExpand={() => setExpandState({ title: "Gain / Drop-off by State", chartKey: "generalDropoffState" })}
              onPlotClick={(event) => {
                const label = extractPointLabel(event);
                applyDrill(setGeneralDropoffStateDrill, generalDropoffStateChart.level, label);
              }}
            />
          </div>
          <ChartCard
            title="Gain / Drop-off by Gender"
            bundle={lossByGenderChart}
            explanation={helpText.dropoffGender}
            onRefresh={() => undefined}
            onExpand={() => setExpandState({ title: "Gain / Drop-off by Gender", chartKey: "lossByGender" })}
          />
        </>
      ) : (
        <>
          <SectionLabel
            id="transition-direct-overview"
            title="Transition Overview"
            subtitle="Same-session SS3 journey and gain / drop-off summary for the Direct pathway."
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard
              title="Students Progression Overview"
              bundle={progressionChart}
              explanation={helpText.progression}
              onRefresh={() => undefined}
              onExpand={() => setExpandState({ title: "Students Progression Overview", chartKey: "progression" })}
            />
            <ChartCard
              title="Student Gain / Drop-off by Stage"
              explanation={helpText.lossTable}
              onRefresh={() => undefined}
              onExpand={() => setExpandState({ title: "Student Gain / Drop-off by Stage", tableRows: lossRows })}
            >
              <SummaryTable rows={lossRows} />
            </ChartCard>
          </div>


          <SectionLabel
            id="transition-direct-transition"
            title="Transition Analysis"
            subtitle="Gender, zone, and state transition charts arranged in the same story flow as the approved Direct mockup."
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard
              title="Transition by Zone"
              bundle={directTransitionZoneChart.bundle}
              sortControl={sortControlForKey("directTransitionZone")}
              explanation={helpText.zone}
              onRefresh={() => { setDirectTransitionZoneDrill({}); resetLocationFilters(); }}
              onExpand={() => setExpandState({ title: "Transition by Zone", chartKey: "directTransitionZone" })}
              onPlotClick={(event) => {
                const label = extractPointLabel(event);
                applyDrill(setDirectTransitionZoneDrill, directTransitionZoneChart.level, label);
              }}
            />
            <ChartCard
              title="Transition by State"
              bundle={directTransitionStateChart.bundle}
              sortControl={sortControlForKey("directTransitionState")}
              explanation={helpText.state}
              onRefresh={() => { setDirectTransitionStateDrill({}); resetLocationFilters(); }}
              onExpand={() => setExpandState({ title: "Transition by State", chartKey: "directTransitionState" })}
              onPlotClick={(event) => {
                const label = extractPointLabel(event);
                applyDrill(setDirectTransitionStateDrill, directTransitionStateChart.level, label);
              }}
            />
          </div>
          <ChartCard
            title="Transition by Gender"
            bundle={genderChart}
            explanation={helpText.gender}
            onRefresh={() => undefined}
            onExpand={() => setExpandState({ title: "Transition by Gender", chartKey: "gender" })}
          />

          <SectionLabel
            id="transition-direct-dropoff"
            title="Gain / Drop-off Analysis"
            subtitle="Gain / drop-off charts laid out to mirror the approved Direct mockup sequence."
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard
              title="Gain / Drop-off by Zone"
              bundle={directDropoffZoneChart.bundle}
              sortControl={sortControlForKey("directDropoffZone")}
              explanation={helpText.dropoffZone}
              onRefresh={() => { setDirectDropoffZoneDrill({}); resetLocationFilters(); }}
              onExpand={() => setExpandState({ title: "Gain / Drop-off by Zone", chartKey: "directDropoffZone" })}
              onPlotClick={(event) => {
                const label = extractPointLabel(event);
                applyDrill(setDirectDropoffZoneDrill, directDropoffZoneChart.level, label);
              }}
            />
            <ChartCard
              title="Gain / Drop-off by State"
              bundle={directDropoffStateChart.bundle}
              sortControl={sortControlForKey("directDropoffState")}
              explanation={helpText.dropoffState}
              onRefresh={() => { setDirectDropoffStateDrill({}); resetLocationFilters(); }}
              onExpand={() => setExpandState({ title: "Gain / Drop-off by State", chartKey: "directDropoffState" })}
              onPlotClick={(event) => {
                const label = extractPointLabel(event);
                applyDrill(setDirectDropoffStateDrill, directDropoffStateChart.level, label);
              }}
            />
          </div>
          <ChartCard
            title="Gain / Drop-off by Gender"
            bundle={lossByGenderChart}
            explanation={helpText.dropoffGender}
            onRefresh={() => undefined}
            onExpand={() => setExpandState({ title: "Gain / Drop-off by Gender", chartKey: "lossByGender" })}
          />
        </>
      )}

      {expandState ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => setExpandState(null)}
        >
          <div
            onClick={(event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation()}
            className={[
              "flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl",
              expandedChart?.bundle.expandedWidthClass ?? "max-w-[1120px]",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <div className="text-base font-bold text-slate-900">{expandState.title}</div>
                {expandedChart?.bundle.titleNote ? <div className="mt-0.5 text-[11px] font-medium leading-4 text-slate-500">{expandedChart.bundle.titleNote}</div> : null}
              </div>
              <div className="flex shrink-0 flex-nowrap items-center gap-2">
                {"chartKey" in expandState && expandState.chartKey ? <div className="shrink-0 whitespace-nowrap">{sortControlForKey(expandState.chartKey)}</div> : null}
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
              {expandedChart ? (
                <>
                  {expandedChart.bundle.fixedLegend?.length ? <FixedLegend items={expandedChart.bundle.fixedLegend} /> : null}
                  <div
                    className={expandedChart.bundle.scrollable ? "overflow-y-auto pr-1" : undefined}
                    style={expandedChart.bundle.scrollable ? { maxHeight: expandedChart.bundle.expandedMaxHeight ?? 420 } : undefined}
                  >
                    <Plot
                      data={expandedChart.bundle.data}
                      layout={{
                        ...expandedChart.bundle.layout,
                        height: Math.max(
                          typeof expandedChart.bundle.layout.height === "number" ? expandedChart.bundle.layout.height : 420,
                          expandedChart.bundle.expandedMaxHeight ?? 480,
                        ),
                        showlegend: expandedChart.bundle.fixedLegend?.length ? false : expandedChart.bundle.layout.showlegend,
                      } as Partial<PlotlyLayout>}
                      config={{ displayModeBar: false, responsive: true }}
                      useResizeHandler
                      style={{ display: "block", width: "100%", height: "100%" }}
                      onClick={expandedChart.onPlotClick}
                    />
                  </div>
                </>
              ) : null}
              {"tableRows" in expandState && expandState.tableRows ? <SummaryTable rows={expandState.tableRows} /> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
