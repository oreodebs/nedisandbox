import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MouseEvent as ReactMouseEvent, ReactNode, SetStateAction } from "react";
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
import { canonicalState, loadRefinedScopedRows } from "../utils/refinedPageData";

type TransitionGeneralRow = {
  session: string;
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

function comparisonKey(row: TransitionGeneralRow | TransitionDirectRow): string {
  return [
    row.session,
    row.zone,
    row.state,
    row.lga,
    row.ward,
    row.school,
    row.gender,
    row.disability,
    row.exam_body,
    row.institution_type,
  ].join("|");
}

function constrainDirectRows(directRows: TransitionDirectRow[], generalRows: TransitionGeneralRow[]): TransitionDirectRow[] {
  const generalMap = new Map<string, AggregateMetrics>();

  generalRows.forEach((row) => {
    const key = comparisonKey(row);
    const current = generalMap.get(key) ?? {
      ss3_total: 0,
      o_level_candidates: 0,
      utme_participants: 0,
      admitted_students: 0,
      matriculated_students: 0,
      delayed_transition_students: 0,
      median_time_to_matriculation_years: 0,
    };
    current.o_level_candidates += safeNum(row.o_level_candidates);
    current.utme_participants += safeNum(row.utme_participants);
    current.admitted_students += safeNum(row.admitted_students);
    current.matriculated_students += safeNum(row.matriculated_students);
    current.delayed_transition_students += safeNum(row.delayed_transition_students);
    generalMap.set(key, current);
  });

  return directRows.map((row) => {
    const key = comparisonKey(row);
    const general = generalMap.get(key);
    if (!general) return row;

    const directOLevel = safeNum(row.o_level_candidates);
    const generalOLevel = safeNum(general.o_level_candidates);
    if (generalOLevel <= 0 || directOLevel < generalOLevel) return row;

    const targetOLevel = Math.max(Math.floor(generalOLevel - 1), 0);
    if (directOLevel <= 0) return row;
    const factor = targetOLevel / directOLevel;
    if (factor >= 1) return row;

    return {
      ...row,
      o_level_candidates: Math.max(0, Math.round(directOLevel * factor)),
      utme_participants: Math.max(0, Math.round(safeNum(row.utme_participants) * factor)),
      admitted_students: Math.max(0, Math.round(safeNum(row.admitted_students) * factor)),
      matriculated_students: Math.max(0, Math.round(safeNum(row.matriculated_students) * factor)),
      delayed_transition_students: Math.max(0, Math.round(safeNum(row.delayed_transition_students) * factor)),
    };
  });
}

function buildLossRows(metrics: AggregateMetrics, mode: Mode): LossRow[] {
  if (mode === "direct") {
    return [
      { stage: "SS3 → O-Level", from: metrics.ss3_total, to: metrics.o_level_candidates, lost: 0, lostPct: 0 },
      { stage: "O-Level → UTME", from: metrics.o_level_candidates, to: metrics.utme_participants, lost: 0, lostPct: 0 },
      { stage: "UTME → Admitted", from: metrics.utme_participants, to: metrics.admitted_students, lost: 0, lostPct: 0 },
      { stage: "Admitted → Matriculated", from: metrics.admitted_students, to: metrics.matriculated_students, lost: 0, lostPct: 0 },
    ].map((row) => ({
      ...row,
      lost: Math.max(0, row.from - row.to),
      lostPct: row.from > 0 ? ((row.from - row.to) / row.from) * 100 : 0,
    }));
  }

  return [
    { stage: "O-Level → UTME", from: metrics.o_level_candidates, to: metrics.utme_participants, lost: 0, lostPct: 0 },
    { stage: "UTME → Admitted", from: metrics.utme_participants, to: metrics.admitted_students, lost: 0, lostPct: 0 },
    { stage: "Admitted → Matriculated", from: metrics.admitted_students, to: metrics.matriculated_students, lost: 0, lostPct: 0 },
  ].map((row) => ({
    ...row,
    lost: Math.max(0, row.from - row.to),
    lostPct: row.from > 0 ? ((row.from - row.to) / row.from) * 100 : 0,
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
  };
}

function makeGrouped<T extends BaseRow>(rows: T[], level: LocationLevel): GroupedRow<T>[] {
  const grouped = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = locationLabel(row, level);
    if (!key) return;
    const current = grouped.get(key);
    if (current) {
      current.push(row);
      return;
    }
    grouped.set(key, [row]);
  });

  return Array.from(grouped.entries())
    .map(([label, entries]) => ({ label, rows: entries, metrics: aggregateRows(entries) }))
    .sort((a, b) => b.metrics.matriculated_students - a.metrics.matriculated_students);
}

function getNextLevel(currentLevel: LocationLevel): LocationLevel | null {
  if (currentLevel === "zone") return "state";
  if (currentLevel === "state") return "lga";
  if (currentLevel === "lga") return "ward";
  if (currentLevel === "ward") return "school";
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
    level = "school";
  }

  return { level, rows: effectiveRows };
}

function delta(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function barText(values: number[]): string[] {
  return values.map((value) => fmtInt(value));
}

function verticalBarTrace(name: string, labels: string[], values: number[], color: string): PlotlyData {
  return {
    type: "bar",
    name,
    x: labels,
    y: values,
    marker: { color },
    text: barText(values),
    texttemplate: "%{text}",
    textposition: "outside",
    cliponaxis: false,
    hovertemplate: `${name}<br>%{x}: %{y:,}<extra></extra>`,
  };
}

function horizontalBarTrace(
  name: string,
  labels: string[],
  values: number[],
  color: string,
  textPosition: "inside" | "outside" | "auto" = "inside",
  textFontSize = 11,
  oLevelValues?: number[],
): PlotlyData {
  // Build per-bar customdata: [label, value, pctOfOLevel]
  const customdata = labels.map((label, i) => {
    const v = values[i] ?? 0;
    const ol = oLevelValues ? (oLevelValues[i] ?? 0) : 0;
    const pct = ol > 0 ? ((v / ol) * 100).toFixed(1) : null;
    return [label, v, pct];
  });

  const hoverPctSuffix = oLevelValues
    ? `<br>%{customdata[2]}% of O-Level`
    : "";

  return {
    type: "bar",
    orientation: "h",
    name,
    y: labels,
    x: values,
    customdata,
    marker: { color },
    text: barText(values),
    texttemplate: "%{text}",
    textposition: textPosition,
    textfont: { size: textFontSize },
    insidetextanchor: "middle",
    constraintext: "none",
    cliponaxis: false,
    hovertemplate: `<b>%{customdata[0]}</b><br>${name}: %{customdata[1]:,}${hoverPctSuffix}<extra></extra>`,
  };
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
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 text-left">Stage</th>
            <th className="px-3 py-2 text-right">Start</th>
            <th className="px-3 py-2 text-right">End</th>
            <th className="px-3 py-2 text-right">Drop Off</th>
            <th className="px-3 py-2 text-right">Drop Off %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.stage} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-2 font-medium text-slate-800">{row.stage}</td>
              <td className="px-3 py-2 text-right">{fmtInt(row.from)}</td>
              <td className="px-3 py-2 text-right">{fmtInt(row.to)}</td>
              <td className="px-3 py-2 text-right font-semibold text-red-600">{fmtInt(row.lost)}</td>
              <td className="px-3 py-2 text-right">{row.lostPct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KpiCard({ item, prevSessionLabel }: { item: MetricCard; prevSessionLabel?: string }) {
  const [showHelp, setShowHelp] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpRef = useRef<HTMLDivElement | null>(null);
  const rising = item.delta !== null && item.delta > 0;
  const falling = item.delta !== null && item.delta < 0;

  useEffect(() => {
    if (!showHelp) return undefined;
    const onDoc = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (helpButtonRef.current?.contains(target)) return;
      if (helpRef.current?.contains(target)) return;
      setShowHelp(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showHelp]);

  return (
    <div className="relative rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100" style={{ backgroundColor: item.bg, color: item.accent }}>
              {item.icon}
            </div>
            <div className="text-[12px] font-medium text-slate-500 leading-tight">{item.label}</div>
          </div>
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
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-400 hover:bg-slate-50"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="mt-2.5 text-[26px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
          {item.suffix === "yrs"
            ? (item.value > 0 ? item.value.toFixed(1) : "—")
            : fmtInt(item.value)}
          {item.suffix && item.value > 0 ? <span className="ml-1 text-base font-semibold text-slate-400">{item.suffix}</span> : null}
        </div>
        {item.delta !== null && item.label !== "Median Time to Matriculation" ? (
          <div className="mt-2 flex items-center gap-2">
            <div className={["inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold",
              rising ? "bg-emerald-50 text-emerald-700" : falling ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"].join(" ")}>
              {rising ? <ArrowUpRight className="h-3 w-3" /> : falling ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {fmtPct(item.delta)}
            </div>
            {prevSessionLabel ? <span className="text-[10px] text-slate-400">vs {prevSessionLabel}</span> : null}
          </div>
        ) : null}
      </div>
      {showHelp ? (
        <div
          ref={helpRef}
          className="absolute right-3 top-12 z-20 w-[280px] rounded-xl bg-slate-950 px-4 py-3 text-xs leading-5 text-white shadow-2xl"
        >
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-300">{item.label}</div>
          {item.help}
        </div>
      ) : null}
    </div>
  );
}

function ChartCard({
  title,
  explanation,
  bundle,
  onExpand,
  onRefresh,
  onPlotClick,
  children,
}: {
  title: string;
  explanation: string;
  bundle?: ChartBundle;
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
      style={{ width: "100%", height: "100%" }}
      onClick={onPlotClick}
    />
  ) : (
    children
  );

  return (
    <div ref={rootRef} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-3.5 py-2.5">
        <div className="text-sm font-bold text-slate-900">{title}</div>
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
              onClick={() => setShowHelp((prev) => !prev)}
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
            {showHelp ? (
              <div
                ref={helpPanelRef}
                className="absolute right-0 top-10 z-20 w-[280px] rounded-xl bg-slate-950 px-4 py-3 text-xs leading-5 text-white shadow-2xl"
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


      <div className="p-3">
        {bundle?.fixedLegend?.length ? <FixedLegend items={bundle.fixedLegend} /> : null}
        {bundle?.scrollable ? (
          <div className="overflow-y-auto pr-1" style={{ maxHeight: bundle.scrollMaxHeight ?? 380 }}>
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
  const { filters, setFilters, dimSessions, disabilityMode, directMode } = props;

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

  const [expandState, setExpandState] = useState<ExpandState>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading((prev) => prev && !generalRows.length && !directRows.length);
        setError(null);
        const depth = !filters.state ? "top" : filters.school ? "school" : filters.ward ? "school" : filters.lga ? "ward" : "lga";
        const [generalData, directData] = await Promise.all([
          loadRefinedScopedRows<TransitionGeneralRow>("transition_general", filters.state, depth),
          loadRefinedScopedRows<TransitionDirectRow>("transition_direct", filters.state, depth),
        ]);

        if (!mounted) return;
        setGeneralRows(generalData);
        setDirectRows(directData);
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
  }, [dimSessions, filters.state, filters.lga, filters.ward, filters.school]);

  useEffect(() => {
    setGeneralTransitionZoneDrill({});
    setGeneralTransitionStateDrill({});
    setGeneralDropoffZoneDrill({});
    setGeneralDropoffStateDrill({});
    setDirectTransitionZoneDrill({});
    setDirectTransitionStateDrill({});
    setDirectDropoffZoneDrill({});
    setDirectDropoffStateDrill({});
  }, [filters.session, filters.zone, filters.state, filters.lga, filters.ward, filters.school, filters.gender, filters.exam_body, filters.gap_band, disabilityMode, directMode]);

  const mode: Mode = directMode ? "direct" : "general";
  const normalizedDirectRows = useMemo(
    () => constrainDirectRows(directRows, generalRows),
    [directRows, generalRows],
  );
  const currentRows: BaseRow[] = mode === "direct" ? normalizedDirectRows : generalRows;

  const previousSession = useMemo(
    () => dimSessions.find((row) => row.session_id === filters.session)?.prev_session_id ?? "",
    [dimSessions, filters.session],
  );

  const filteredCurrentRows = useMemo(() => {
    return currentRows.filter((row) => {
      if (row.session !== filters.session) return false;
      if (filters.zone && row.zone !== filters.zone) return false;
      if (filters.state && canonicalState(row.state) !== canonicalState(filters.state)) return false;
      if (filters.lga && row.lga !== filters.lga) return false;
      if (filters.ward && row.ward !== filters.ward) return false;
      if (filters.school && row.school !== filters.school) return false;
      if (filters.gender && row.gender !== filters.gender) return false;
      if (disabilityMode && row.disability !== "Disabled") return false;
      if (!disabilityMode && row.disability !== "ALL") return false;
      if (filters.exam_body && row.exam_body !== filters.exam_body) return false;
      if (mode === "general" && filters.gap_band && "gap_band" in row && row.gap_band !== filters.gap_band) return false;
      return true;
    });
  }, [currentRows, filters, disabilityMode, mode]);

  const filteredPreviousRows = useMemo(() => {
    if (!previousSession) return [] as BaseRow[];
    return currentRows.filter((row) => {
      if (row.session !== previousSession) return false;
      if (filters.zone && row.zone !== filters.zone) return false;
      if (filters.state && canonicalState(row.state) !== canonicalState(filters.state)) return false;
      if (filters.lga && row.lga !== filters.lga) return false;
      if (filters.ward && row.ward !== filters.ward) return false;
      if (filters.school && row.school !== filters.school) return false;
      if (filters.gender && row.gender !== filters.gender) return false;
      if (disabilityMode && row.disability !== "Disabled") return false;
      if (!disabilityMode && row.disability !== "ALL") return false;
      if (filters.exam_body && row.exam_body !== filters.exam_body) return false;
      if (mode === "general" && filters.gap_band && "gap_band" in row && row.gap_band !== filters.gap_band) return false;
      return true;
    });
  }, [currentRows, previousSession, filters, disabilityMode, mode]);

  const currentMetrics = useMemo(() => aggregateRows(filteredCurrentRows), [filteredCurrentRows]);
  const previousMetrics = useMemo(() => aggregateRows(filteredPreviousRows), [filteredPreviousRows]);
  const sessionMedianFallback = useMemo(() => {
    const scopedSessionRows = currentRows.filter((row) => {
      if (row.session !== filters.session) return false;
      if (filters.gender && row.gender !== filters.gender) return false;
      if (disabilityMode && row.disability !== 'Disabled') return false;
      if (!disabilityMode && row.disability !== 'ALL') return false;
      if (filters.exam_body && row.exam_body !== filters.exam_body) return false;
      if (mode === 'general' && filters.gap_band && 'gap_band' in row && row.gap_band !== filters.gap_band) return false;
      return true;
    });
    const scopedMedian = aggregateRows(scopedSessionRows).median_time_to_matriculation_years;
    if (scopedMedian > 0) return scopedMedian;
    const sessionRows = currentRows.filter((row) => row.session === filters.session);
    const sessionMedian = aggregateRows(sessionRows).median_time_to_matriculation_years;
    if (sessionMedian > 0) return sessionMedian;
    return aggregateRows(currentRows).median_time_to_matriculation_years;
  }, [currentRows, filters.session, filters.gender, filters.exam_body, filters.gap_band, disabilityMode, mode]);
  const lossRows = useMemo(() => buildLossRows(currentMetrics, mode), [currentMetrics, mode]);

  const cards = useMemo<MetricCard[]>(() => {
    if (mode === "direct") {
      return [
        {
          label: "Total SS3 Students",
          help: "Total SS3 learners who form the starting pool for the transition pipeline in the selected session and filters.",
          value: currentMetrics.ss3_total,
          delta: delta(currentMetrics.ss3_total, previousMetrics.ss3_total),
          icon: <Users className="h-5 w-5" />,
          accent: COLORS.ss3,
          bg: "#eff6ff",
        },
        {
          label: "O-Level Candidates",
          help: "Number of learners who sat for an O-Level examination (WAEC, NECO, or NABTEB). This is the first funnel gate — learners who did not sit an exam cannot proceed to UTME.",
          value: currentMetrics.o_level_candidates,
          delta: delta(currentMetrics.o_level_candidates, previousMetrics.o_level_candidates),
          icon: <BookOpenCheck className="h-5 w-5" />,
          accent: COLORS.olevel,
          bg: "#ecfdf5",
        },
        {
          label: "UTME Participants",
          help: "Learners who sat the Unified Tertiary Matriculation Examination after obtaining their O-Level results. This measures how many are actively pursuing tertiary education.",
          value: currentMetrics.utme_participants,
          delta: delta(currentMetrics.utme_participants, previousMetrics.utme_participants),
          icon: <GraduationCap className="h-5 w-5" />,
          accent: COLORS.utme,
          bg: "#fffbeb",
        },
        {
          label: "Admitted Students",
          help: "Learners who received a tertiary admission offer after sitting UTME. This is the penultimate pipeline stage — admission offer does not guarantee matriculation.",
          value: currentMetrics.admitted_students,
          delta: delta(currentMetrics.admitted_students, previousMetrics.admitted_students),
          icon: <Landmark className="h-5 w-5" />,
          accent: COLORS.admit,
          bg: "#f5f3ff",
        },
        {
          label: "Matriculated Students",
          help: "Learners who completed the full matriculation process and are formally enrolled in a tertiary institution. This is the final successful outcome of the transition pipeline.",
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
        label: "O-Level Candidates",
          help: "Number of learners who sat for an O-Level examination (WAEC, NECO, or NABTEB). This is the first funnel gate — learners who did not sit an exam cannot proceed to UTME.",
        value: currentMetrics.o_level_candidates,
        delta: delta(currentMetrics.o_level_candidates, previousMetrics.o_level_candidates),
        icon: <BookOpenCheck className="h-5 w-5" />,
        accent: COLORS.olevel,
        bg: "#ecfdf5",
      },
      {
        label: "UTME Participants",
          help: "Learners who sat the Unified Tertiary Matriculation Examination after obtaining their O-Level results. This measures how many are actively pursuing tertiary education.",
        value: currentMetrics.utme_participants,
        delta: delta(currentMetrics.utme_participants, previousMetrics.utme_participants),
        icon: <GraduationCap className="h-5 w-5" />,
        accent: COLORS.utme,
        bg: "#fffbeb",
      },
      {
        label: "Admitted Students",
          help: "Learners who received a tertiary admission offer after sitting UTME. This is the penultimate pipeline stage — admission offer does not guarantee matriculation.",
        value: currentMetrics.admitted_students,
        delta: delta(currentMetrics.admitted_students, previousMetrics.admitted_students),
        icon: <Landmark className="h-5 w-5" />,
        accent: COLORS.admit,
        bg: "#f5f3ff",
      },
      {
        label: "Matriculated Students",
          help: "Learners who completed the full matriculation process and are formally enrolled in a tertiary institution. This is the final successful outcome of the transition pipeline.",
        value: currentMetrics.matriculated_students,
        delta: delta(currentMetrics.matriculated_students, previousMetrics.matriculated_students),
        icon: <GraduationCap className="h-5 w-5" />,
        accent: COLORS.matric,
        bg: "#fff7ed",
      },
      {
        label: "Learners with >2 Year Admission Gap",
          help: "Learners who eventually gained tertiary admission but did NOT enter directly in the same academic year as their O-Level result — they crossed at least one session gap before being admitted or matriculated. A high count signals systemic pipeline delays: learners who qualified but had to wait one or more sessions before securing a place.",
        value: currentMetrics.delayed_transition_students,
        delta: delta(currentMetrics.delayed_transition_students, previousMetrics.delayed_transition_students),
        icon: <Users className="h-5 w-5" />,
        accent: COLORS.utme,
        bg: "#fff7ed",
      },
      {
        label: "Median Time to Matriculation",
          help: "The median number of years between an O-Level result and full tertiary matriculation. A value above 1.0 signals that most learners are not transitioning directly in the same session.",
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
  }, [currentMetrics, previousMetrics, mode, sessionMedianFallback]);


const progressionChart = useMemo<ChartBundle>(() => {
  const layout = buildCommonLayout(328);
  const examBreakdown = ["WAEC", "NECO", "NABTEB"]
    .map((exam) => {
      const total = aggregateRows(filteredCurrentRows.filter((row) => row.exam_body === exam)).o_level_candidates;
      return `${exam}: ${fmtInt(total)}`;
    })
    .join("<br>");

  if (mode === "direct") {
    const labels = ["SS3 Students", "O-Level Candidates", "UTME Participants", "Admitted Students", "Matriculated Students"];
    const values = [
      currentMetrics.ss3_total,
      currentMetrics.o_level_candidates,
      currentMetrics.utme_participants,
      currentMetrics.admitted_students,
      currentMetrics.matriculated_students,
    ];
    const max = Math.max(...values, 1);
    const ol = currentMetrics.o_level_candidates;
    const pctOfOL = (v: number) => ol > 0 ? ` (${((v / ol) * 100).toFixed(1)}% of O-Level)` : "";
    const hoverTexts = [
      `SS3 Students<br><b>${fmtInt(currentMetrics.ss3_total)}</b>`,
      `O-Level Candidates<br><b>${fmtInt(currentMetrics.o_level_candidates)}</b> (100.0% of O-Level)<br><br>${examBreakdown}`,
      `UTME Participants<br><b>${fmtInt(currentMetrics.utme_participants)}</b>${pctOfOL(currentMetrics.utme_participants)}`,
      `Admitted Students<br><b>${fmtInt(currentMetrics.admitted_students)}</b>${pctOfOL(currentMetrics.admitted_students)}`,
      `Matriculated Students<br><b>${fmtInt(currentMetrics.matriculated_students)}</b>${pctOfOL(currentMetrics.matriculated_students)}`,
    ];

    return {
      data: [
        {
          type: "funnel",
          y: labels,
          x: values.map((value) => (value / max) * 100),
          text: values.map((value, index) => `${labels[index]}<br><b>${fmtInt(value)}</b>`),
          textposition: "inside",
          textinfo: "text",
          customdata: hoverTexts,
          marker: { color: [COLORS.ss3, COLORS.olevel, COLORS.utme, COLORS.admit, COLORS.matric] },
          hovertemplate: "%{customdata}<extra></extra>",
        },
      ],
      layout: {
        ...layout,
        margin: { l: 10, r: 10, t: 10, b: 10 },
        xaxis: { showgrid: false, showticklabels: false, zeroline: false },
        yaxis: { showgrid: false, showticklabels: false, zeroline: false },
        showlegend: false,
      },
    };
  }

  const labels = ["O-Level Candidates", "UTME Participants", "Admitted Students", "Matriculated Students"];
  const values = [
    currentMetrics.o_level_candidates,
    currentMetrics.utme_participants,
    currentMetrics.admitted_students,
    currentMetrics.matriculated_students,
  ];
  const max = Math.max(...values, 1);
  const ol = currentMetrics.o_level_candidates;
  const pctOfOL = (v: number) => ol > 0 ? ` (${((v / ol) * 100).toFixed(1)}% of O-Level)` : "";
  const hoverTexts = [
    `O-Level Candidates<br><b>${fmtInt(currentMetrics.o_level_candidates)}</b> (100.0% of O-Level)<br><br>${examBreakdown}`,
    `UTME Participants<br><b>${fmtInt(currentMetrics.utme_participants)}</b>${pctOfOL(currentMetrics.utme_participants)}`,
    `Admitted Students<br><b>${fmtInt(currentMetrics.admitted_students)}</b>${pctOfOL(currentMetrics.admitted_students)}`,
    `Matriculated Students<br><b>${fmtInt(currentMetrics.matriculated_students)}</b>${pctOfOL(currentMetrics.matriculated_students)}`,
  ];

  return {
    data: [
      {
        type: "funnel",
        y: labels,
        x: values.map((value) => (value / max) * 100),
        text: values.map((value, index) => `${labels[index]}<br><b>${fmtInt(value)}</b>`),
        textposition: "inside",
        textinfo: "text",
        customdata: hoverTexts,
        marker: { color: [COLORS.olevel, COLORS.utme, COLORS.admit, COLORS.matric] },
        hovertemplate: "%{customdata}<extra></extra>",
      },
    ],
    layout: {
      ...layout,
      margin: { l: 10, r: 10, t: 10, b: 10 },
      xaxis: { showgrid: false, showticklabels: false, zeroline: false },
      yaxis: { showgrid: false, showticklabels: false, zeroline: false },
      showlegend: false,
    },
  };
}, [currentMetrics, filteredCurrentRows, mode]);


  const genderChart = useMemo<ChartBundle>(() => {
    const male = aggregateRows(filteredCurrentRows.filter((row) => row.gender === "Male"));
    const female = aggregateRows(filteredCurrentRows.filter((row) => row.gender === "Female"));
    const labels = mode === "direct"
      ? ["SS3", "O-Level", "UTME", "Admitted", "Matriculated"]
      : ["O-Level", "UTME", "Admitted", "Matriculated"];
    const maleValues = mode === "direct"
      ? [male.ss3_total, male.o_level_candidates, male.utme_participants, male.admitted_students, male.matriculated_students]
      : [male.o_level_candidates, male.utme_participants, male.admitted_students, male.matriculated_students];
    const femaleValues = mode === "direct"
      ? [female.ss3_total, female.o_level_candidates, female.utme_participants, female.admitted_students, female.matriculated_students]
      : [female.o_level_candidates, female.utme_participants, female.admitted_students, female.matriculated_students];

    return {
      data: [
        verticalBarTrace("Male", labels, maleValues, COLORS.male),
        verticalBarTrace("Female", labels, femaleValues, COLORS.female),
      ],
      layout: {
        ...buildCommonLayout(336),
        barmode: "group",
        margin: { l: 55, r: 18, t: 12, b: 70 },
      },
    };
  }, [filteredCurrentRows, mode]);


  const generalTimingDistribution = useMemo<ChartBundle | null>(() => {
    if (mode !== "general") return null;

    const byGap = GAP_OPTIONS.map((gap) => {
      const metrics = aggregateRows(generalRows.filter((row) => {
        if (row.session !== filters.session) return false;
        if (filters.zone && row.zone !== filters.zone) return false;
        if (filters.state && canonicalState(row.state) !== canonicalState(filters.state)) return false;
        if (filters.lga && row.lga !== filters.lga) return false;
        if (filters.ward && row.ward !== filters.ward) return false;
        if (filters.school && row.school !== filters.school) return false;
        if (filters.gender && row.gender !== filters.gender) return false;
        if (disabilityMode && row.disability !== "Disabled") return false;
        if (!disabilityMode && row.disability !== "ALL") return false;
        if (filters.exam_body && row.exam_body !== filters.exam_body) return false;
        return row.gap_band === gap;
      }));
      return { gap, value: metrics.matriculated_students };
    });

    const total = byGap.reduce((sum, row) => sum + row.value, 0);
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
          texttemplate: "%{value:,}",
          textposition: "inside",
          insidetextorientation: "horizontal",
          textfont: { size: 11, color: "#ffffff" },
          hovertemplate: "%{label}: %{value:,} learners (%{percent})<extra></extra>",
          domain: { x: [0.02, 0.42], y: [0.08, 0.92] },
        },
      ],
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
          const pct = total > 0 ? (row.value / total) * 100 : 0;
          return [
            {
              x: 0.50,
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
              x: 0.88,
              y: positions[index],
              xref: "paper",
              yref: "paper",
              showarrow: false,
              xanchor: "right",
              align: "right",
              text: `<b>${fmtInt(row.value)}</b>`,
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
              text: `<b>${pct.toFixed(0)}%</b>`,
              font: { size: 12, color: COLORS.text },
            },
          ];
        }),
      },
    };
  }, [generalRows, filters, disabilityMode, mode]);

  const generalInstitutionTiming = useMemo<ChartBundle | null>(() => {
    if (mode !== "general") return null;

    const baseRows = generalRows.filter((row) => {
      if (row.session !== filters.session) return false;
      if (filters.zone && row.zone !== filters.zone) return false;
      if (filters.state && canonicalState(row.state) !== canonicalState(filters.state)) return false;
      if (filters.lga && row.lga !== filters.lga) return false;
      if (filters.ward && row.ward !== filters.ward) return false;
      if (filters.school && row.school !== filters.school) return false;
      if (filters.gender && row.gender !== filters.gender) return false;
      if (disabilityMode && row.disability !== "Disabled") return false;
      if (!disabilityMode && row.disability !== "ALL") return false;
      if (filters.exam_body && row.exam_body !== filters.exam_body) return false;
      return true;
    });

    return {
      data: [
        verticalBarTrace(
          "University",
          [...GAP_OPTIONS],
          GAP_OPTIONS.map((gap) => aggregateRows(baseRows.filter((row) => row.institution_type === "University" && row.gap_band === gap)).matriculated_students),
          COLORS.university,
        ),
        verticalBarTrace(
          "Polytechnic",
          [...GAP_OPTIONS],
          GAP_OPTIONS.map((gap) => aggregateRows(baseRows.filter((row) => row.institution_type === "Polytechnic" && row.gap_band === gap)).matriculated_students),
          COLORS.polytechnic,
        ),
        verticalBarTrace(
          "College of Education",
          [...GAP_OPTIONS],
          GAP_OPTIONS.map((gap) => aggregateRows(baseRows.filter((row) => row.institution_type === "College of Education" && row.gap_band === gap)).matriculated_students),
          COLORS.coe,
        ),
      ],
      layout: {
        ...buildCommonLayout(336),
        barmode: "group",
        margin: { l: 55, r: 18, t: 12, b: 70 },
      },
    };
  }, [generalRows, filters, disabilityMode, mode]);

  const lossByGenderChart = useMemo<ChartBundle>(() => {
    const male = aggregateRows(filteredCurrentRows.filter((row) => row.gender === "Male"));
    const female = aggregateRows(filteredCurrentRows.filter((row) => row.gender === "Female"));
    const labels = mode === "direct"
      ? ["SS3 → O-Level", "O-Level → UTME", "UTME → Admitted", "Admitted → Matric"]
      : ["O-Level → UTME", "UTME → Admitted", "Admitted → Matric"];

    const maleLosses = mode === "direct"
      ? [
          Math.max(0, male.ss3_total - male.o_level_candidates),
          Math.max(0, male.o_level_candidates - male.utme_participants),
          Math.max(0, male.utme_participants - male.admitted_students),
          Math.max(0, male.admitted_students - male.matriculated_students),
        ]
      : [
          Math.max(0, male.o_level_candidates - male.utme_participants),
          Math.max(0, male.utme_participants - male.admitted_students),
          Math.max(0, male.admitted_students - male.matriculated_students),
        ];

    const femaleLosses = mode === "direct"
      ? [
          Math.max(0, female.ss3_total - female.o_level_candidates),
          Math.max(0, female.o_level_candidates - female.utme_participants),
          Math.max(0, female.utme_participants - female.admitted_students),
          Math.max(0, female.admitted_students - female.matriculated_students),
        ]
      : [
          Math.max(0, female.o_level_candidates - female.utme_participants),
          Math.max(0, female.utme_participants - female.admitted_students),
          Math.max(0, female.admitted_students - female.matriculated_students),
        ];

    return {
      data: [
        verticalBarTrace("Male", labels, maleLosses, COLORS.male),
        verticalBarTrace("Female", labels, femaleLosses, COLORS.female),
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
): LocationChartResult => {
  const resolved = resolveLocationRows(filteredCurrentRows, baseLevel, drill, filters);
  const grouped = makeGrouped(resolved.rows, resolved.level);
  const labels = grouped.map((row) => row.label);
  const isScrollable = baseLevel === "state";
  const height = Math.max(isScrollable ? 480 : 340, labels.length * (isScrollable ? 40 : 32) + 126);

  const oLevelValues = grouped.map((row) => row.metrics.o_level_candidates);

  const data: PlotlyData[] = [
    ...(mode === "direct"
      ? [horizontalBarTrace("Total SS3 Students", labels, grouped.map((row) => row.metrics.ss3_total), COLORS.ss3, "inside", 11, oLevelValues)]
      : []),
    horizontalBarTrace("O-Level Candidates", labels, oLevelValues, COLORS.olevel, "inside", 11, oLevelValues),
    horizontalBarTrace("UTME Participants", labels, grouped.map((row) => row.metrics.utme_participants), COLORS.utme, "inside", 11, oLevelValues),
    horizontalBarTrace("Admitted Students", labels, grouped.map((row) => row.metrics.admitted_students), COLORS.admit, "inside", 11, oLevelValues),
    horizontalBarTrace("Matriculated Students", labels, grouped.map((row) => row.metrics.matriculated_students), COLORS.matric, "inside", 11, oLevelValues),
  ];

  return {
    level: resolved.level,
    bundle: {
      data,
      layout: {
        ...buildCommonLayout(height),
        uirevision: `transition-location-${baseLevel}-${resolved.level}-${labels.length}`,
        barmode: "stack",
        showlegend: (isScrollable || baseLevel === "zone") ? false : true,
        margin: { l: 128, r: 24, t: 12, b: 68 },
        yaxis: { showgrid: false, automargin: true, autorange: "reversed" },
      },
      scrollable: isScrollable,
      scrollMaxHeight: isScrollable ? 340 : undefined,
      expandedMaxHeight: isScrollable ? 400 : 430,
      fixedLegend: (isScrollable || baseLevel === "zone") ? legendItemsFromData(data) : undefined,
      expandedWidthClass: isScrollable ? "max-w-[920px]" : "max-w-[900px]",
    },
  };
};


const buildDropoffLocationChart = (
  baseLevel: LocationLevel,
  drill: DrillState,
): LocationChartResult => {
  const resolved = resolveLocationRows(filteredCurrentRows, baseLevel, drill, filters);
  const grouped = makeGrouped(resolved.rows, resolved.level);
  const labels = grouped.map((row) => row.label);
  const isScrollable = baseLevel === "state";
  const height = Math.max(isScrollable ? 520 : 360, labels.length * (isScrollable ? 44 : 36) + 148);

  const oLevelValues = grouped.map((row) => row.metrics.o_level_candidates);

  const data: PlotlyData[] = mode === "direct"
    ? [
        horizontalBarTrace("SS3 → O-Level", labels, grouped.map((row) => Math.max(0, row.metrics.ss3_total - row.metrics.o_level_candidates)), COLORS.ss3, "inside", 11, oLevelValues),
        horizontalBarTrace("O-Level → UTME", labels, grouped.map((row) => Math.max(0, row.metrics.o_level_candidates - row.metrics.utme_participants)), COLORS.utme, "inside", 11, oLevelValues),
        horizontalBarTrace("UTME → Admitted", labels, grouped.map((row) => Math.max(0, row.metrics.utme_participants - row.metrics.admitted_students)), COLORS.admit, "inside", 11, oLevelValues),
        horizontalBarTrace("Admitted → Matric", labels, grouped.map((row) => Math.max(0, row.metrics.admitted_students - row.metrics.matriculated_students)), COLORS.matric, "auto", 13, oLevelValues),
      ]
    : [
        horizontalBarTrace("O-Level → UTME", labels, grouped.map((row) => Math.max(0, row.metrics.o_level_candidates - row.metrics.utme_participants)), COLORS.olevel, "inside", 11, oLevelValues),
        horizontalBarTrace("UTME → Admitted", labels, grouped.map((row) => Math.max(0, row.metrics.utme_participants - row.metrics.admitted_students)), COLORS.admit, "inside", 11, oLevelValues),
        horizontalBarTrace("Admitted → Matric", labels, grouped.map((row) => Math.max(0, row.metrics.admitted_students - row.metrics.matriculated_students)), COLORS.matric, "auto", 13, oLevelValues),
      ];

  return {
    level: resolved.level,
    bundle: {
      data,
      layout: {
        ...buildCommonLayout(height),
        uirevision: `transition-dropoff-${baseLevel}-${resolved.level}-${labels.length}`,
        barmode: "stack",
        showlegend: (isScrollable || baseLevel === "zone") ? false : true,
        margin: { l: 128, r: 24, t: 12, b: 68 },
        yaxis: { showgrid: false, automargin: true, autorange: "reversed" },
      },
      scrollable: isScrollable,
      scrollMaxHeight: isScrollable ? 370 : undefined,
      expandedMaxHeight: isScrollable ? 430 : 460,
      fixedLegend: (isScrollable || baseLevel === "zone") ? legendItemsFromData(data) : undefined,
      expandedWidthClass: isScrollable ? "max-w-[920px]" : "max-w-[900px]",
    },
  };
};

  const generalTransitionZoneChart = useMemo(
    () => buildTransitionLocationChart("zone", generalTransitionZoneDrill),
    [filteredCurrentRows, filters, generalTransitionZoneDrill, mode],
  );
  const generalTransitionStateChart = useMemo(
    () => buildTransitionLocationChart("state", generalTransitionStateDrill),
    [filteredCurrentRows, filters, generalTransitionStateDrill, mode],
  );
  const generalDropoffZoneChart = useMemo(
    () => buildDropoffLocationChart("zone", generalDropoffZoneDrill),
    [filteredCurrentRows, filters, generalDropoffZoneDrill, mode],
  );
  const generalDropoffStateChart = useMemo(
    () => buildDropoffLocationChart("state", generalDropoffStateDrill),
    [filteredCurrentRows, filters, generalDropoffStateDrill, mode],
  );
  const directTransitionZoneChart = useMemo(
    () => buildTransitionLocationChart("zone", directTransitionZoneDrill),
    [filteredCurrentRows, filters, directTransitionZoneDrill, mode],
  );
  const directTransitionStateChart = useMemo(
    () => buildTransitionLocationChart("state", directTransitionStateDrill),
    [filteredCurrentRows, filters, directTransitionStateDrill, mode],
  );
  const directDropoffZoneChart = useMemo(
    () => buildDropoffLocationChart("zone", directDropoffZoneDrill),
    [filteredCurrentRows, filters, directDropoffZoneDrill, mode],
  );
  const directDropoffStateChart = useMemo(
    () => buildDropoffLocationChart("state", directDropoffStateDrill),
    [filteredCurrentRows, filters, directDropoffStateDrill, mode],
  );

  const helpText = {
    progression: mode === "direct"
      ? "This funnel shows how the selected SS3 cohort narrows from same-session SS3 through O-Level, UTME, admission, and final matriculation."
      : "This funnel shows how learners in the selected General scope narrow from O-Level to UTME, admission, and final matriculation, even when they matriculate after earlier sessions.",
    lossTable: mode === "direct"
      ? "This table shows the start count, end count, learner loss, and loss rate from SS3 through O-Level, UTME, admission, and matriculation."
      : "This table shows the start count, end count, learner loss, and loss rate from O-Level through UTME, admission, and matriculation.",
    timing: "This shows how General pathway matriculated learners are split by time taken after O-Level.",
    timingInst: "This compares time-to-matriculation bands across University, Polytechnic, and College of Education destinations.",
    gender: "This compares male and female learner volumes at each stage so you can quickly spot gender imbalance across the transition journey.",
    zone: "This chart starts at Zone level and can drill deeper through State, LGA, Ward, and School. Use refresh to reset that chart only.",
    state: "This chart starts at State level and can drill deeper through LGA, Ward, and School. Use refresh to reset that chart only.",
    dropoffGender: "This compares how many male and female learners are lost between each transition stage.",
    dropoffZone: "This loss chart starts at Zone level and can drill deeper through State, LGA, Ward, and School.",
    dropoffState: "This loss chart starts at State level and can drill deeper through LGA, Ward, and School.",
  };

  const syncFiltersForDrill = (currentLevel: LocationLevel, pointLabel: string) => {
    if (!pointLabel || currentLevel === "school") return;

    setFilters((previous) => {
      if (currentLevel === "zone") {
        if (previous.zone === pointLabel && !previous.state && !previous.lga && !previous.ward && !previous.school) return previous;
        return { ...previous, zone: pointLabel, state: "", lga: "", ward: "", school: "" };
      }
      if (currentLevel === "state") {
        if (previous.state === pointLabel && !previous.lga && !previous.ward && !previous.school) return previous;
        return { ...previous, state: pointLabel, lga: "", ward: "", school: "" };
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
        if (currentLevel === "state") return { ...prev, state: pointLabel, lga: undefined, ward: undefined };
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
      <div className="flex justify-end">
        <div
          className={[
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold",
            mode === "direct" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600",
          ].join(" ")}
        >
          <span className={["h-2 w-2 rounded-full", mode === "direct" ? "bg-emerald-500" : "bg-red-400"].join(" ")} />
          {mode === "direct" ? "Direct Mode ON" : "General Mode"}
        </div>
      </div>

      <SectionLabel
        id={mode === "general" ? "transition-general-kpi" : "transition-direct-kpi"}
        title="KPI Summary"
        subtitle="Top-line transition cards arranged to match the approved mockup flow."
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <KpiCard key={card.label} item={card} prevSessionLabel={previousSession || undefined} />
        ))}
      </div>

      {mode === "general" ? (
        <>
          <SectionLabel
            id="transition-general-overview"
            title="Transition Overview"
            subtitle="Core learner journey and stage-loss summary for the General pathway."
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
              title="Student Loss by Stage"
              explanation={helpText.lossTable}
              onRefresh={() => undefined}
              onExpand={() => setExpandState({ title: "Student Loss by Stage", tableRows: lossRows })}
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
            title="Drop-off Analysis"
            subtitle="Loss-focused charts laid out to mirror the approved General mockup sequence."
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard
              title="Drop-off by Zone"
              bundle={generalDropoffZoneChart.bundle}
              explanation={helpText.dropoffZone}
              onRefresh={() => { setGeneralDropoffZoneDrill({}); resetLocationFilters(); }}
              onExpand={() => setExpandState({ title: "Drop-off by Zone", chartKey: "generalDropoffZone" })}
              onPlotClick={(event) => {
                const label = extractPointLabel(event);
                applyDrill(setGeneralDropoffZoneDrill, generalDropoffZoneChart.level, label);
              }}
            />
            <ChartCard
              title="Drop-off by State"
              bundle={generalDropoffStateChart.bundle}
              explanation={helpText.dropoffState}
              onRefresh={() => { setGeneralDropoffStateDrill({}); resetLocationFilters(); }}
              onExpand={() => setExpandState({ title: "Drop-off by State", chartKey: "generalDropoffState" })}
              onPlotClick={(event) => {
                const label = extractPointLabel(event);
                applyDrill(setGeneralDropoffStateDrill, generalDropoffStateChart.level, label);
              }}
            />
          </div>
          <ChartCard
            title="Drop-off by Gender"
            bundle={lossByGenderChart}
            explanation={helpText.dropoffGender}
            onRefresh={() => undefined}
            onExpand={() => setExpandState({ title: "Drop-off by Gender", chartKey: "lossByGender" })}
          />
        </>
      ) : (
        <>
          <SectionLabel
            id="transition-direct-overview"
            title="Transition Overview"
            subtitle="Same-session SS3 journey and stage-loss summary for the Direct pathway."
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
              title="Student Loss by Stage"
              explanation={helpText.lossTable}
              onRefresh={() => undefined}
              onExpand={() => setExpandState({ title: "Student Loss by Stage", tableRows: lossRows })}
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
            title="Drop-off Analysis"
            subtitle="Loss-focused charts laid out to mirror the approved Direct mockup sequence."
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard
              title="Drop-off by Zone"
              bundle={directDropoffZoneChart.bundle}
              explanation={helpText.dropoffZone}
              onRefresh={() => { setDirectDropoffZoneDrill({}); resetLocationFilters(); }}
              onExpand={() => setExpandState({ title: "Drop-off by Zone", chartKey: "directDropoffZone" })}
              onPlotClick={(event) => {
                const label = extractPointLabel(event);
                applyDrill(setDirectDropoffZoneDrill, directDropoffZoneChart.level, label);
              }}
            />
            <ChartCard
              title="Drop-off by State"
              bundle={directDropoffStateChart.bundle}
              explanation={helpText.dropoffState}
              onRefresh={() => { setDirectDropoffStateDrill({}); resetLocationFilters(); }}
              onExpand={() => setExpandState({ title: "Drop-off by State", chartKey: "directDropoffState" })}
              onPlotClick={(event) => {
                const label = extractPointLabel(event);
                applyDrill(setDirectDropoffStateDrill, directDropoffStateChart.level, label);
              }}
            />
          </div>
          <ChartCard
            title="Drop-off by Gender"
            bundle={lossByGenderChart}
            explanation={helpText.dropoffGender}
            onRefresh={() => undefined}
            onExpand={() => setExpandState({ title: "Drop-off by Gender", chartKey: "lossByGender" })}
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
              "w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl",
              expandedChart?.bundle.expandedWidthClass ?? "max-w-[900px]",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="text-base font-bold text-slate-900">{expandState.title}</div>
              <button
                type="button"
                onClick={() => setExpandState(null)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3">
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
                        showlegend: expandedChart.bundle.fixedLegend?.length ? false : expandedChart.bundle.layout.showlegend,
                      } as Partial<PlotlyLayout>}
                      config={{ displayModeBar: false, responsive: true }}
                      style={{ width: "100%", height: "100%" }}
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
