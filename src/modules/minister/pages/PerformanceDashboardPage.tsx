
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MouseEvent as ReactMouseEvent, ReactNode, SetStateAction } from "react";
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
import { loadCSV, loadCSVMany, PERFORMANCE_SCHOOL_FILES } from "../utils/loadCSV";
import { getDataBaseUrl } from "../utils/loadAgg";

type PerformanceRow = {
  session: string;
  zone: string;
  state: string;
  lga: string;
  ward: string;
  school: string;
  gender: string;
  disability: string;
  olevel_exam_body: string;
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

type BenchmarkRow = {
  metric_key: string;
  label: string;
  exam_body: string;
  benchmark_pct: number;
  source_note: string;
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
  sampleRow: PerformanceRow;
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

function genderColorsForExam(examBody: string): { male: string; female: string } {
  if (examBody === "WAEC") return { male: "#2563eb", female: "#10b981" };
  if (examBody === "NECO") return { male: "#f59e0b", female: "#f97316" };
  if (examBody === "NABTEB") return { male: "#8b5cf6", female: "#ec4899" };
  if (examBody === "UTME") return { male: "#0ea5e9", female: "#14b8a6" };
  return { male: COLORS.male, female: COLORS.female };
}

const HELP_TEXT: Record<ExpandChartKey, string> = {
  waecGender: "This chart compares WAEC pass rate between male and female learners. The figure inside the bar is the number of learners who passed, while the rate label shows the pass rate.",
  waecZone: "This chart compares WAEC pass rate across locations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill from Zone into State, then deeper into LGA, Ward, and School.",
  waecState: "This chart ranks WAEC pass rate across states and deeper sublocations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill deeper.",
  necoGender: "This chart compares NECO pass rate between male and female learners. The figure inside the bar is the number of learners who passed, while the rate label shows the pass rate.",
  necoZone: "This chart compares NECO pass rate across locations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill deeper.",
  necoState: "This chart ranks NECO pass rate across states and deeper sublocations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill deeper.",
  nabtebGender: "This chart compares NABTEB pass rate between male and female learners. The figure inside the bar is the number of learners who passed, while the rate label shows the pass rate.",
  nabtebZone: "This chart compares NABTEB pass rate across locations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill deeper.",
  nabtebState: "This chart ranks NABTEB pass rate across states and deeper sublocations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill deeper.",
  utmeGender: "This chart compares UTME qualifying rate between male and female learners. The figure inside the bar is the number of learners who qualified, while the rate label shows the qualifying rate.",
  utmeZone: "This chart compares UTME qualifying rate across locations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill deeper.",
  utmeState: "This chart ranks UTME qualifying rate across states and deeper sublocations using one stacked horizontal bar per location, split into male and female segments with actual student counts. Click a bar to drill deeper.",
  trend: "This chart shows the four-year trend for WAEC, NECO, NABTEB, and UTME. The labels on the points show the rates, and hovering shows the underlying student counts.",
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

function fmtInt(value: number): string {
  return Math.round(value).toLocaleString();
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
  };
}

function weightedRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function yearFromSession(session: string): string {
  const value = `${session}`;
  return value.includes("/") ? value.split("/")[0] ?? value : value;
}

function locationLabel(row: PerformanceRow, level: LocationLevel): string {
  if (level === "zone") return row.zone;
  if (level === "state") return row.state;
  if (level === "lga") return row.lga;
  if (level === "ward") return row.ward;
  return row.school;
}


function filterRows(rows: PerformanceRow[], filters: MinisterFilters, disabilityMode: boolean, ignoreSession = false): PerformanceRow[] {
  return rows.filter((row) => {
    if (!ignoreSession && row.session !== filters.session) return false;
    if (filters.zone && row.zone !== filters.zone) return false;
    if (filters.state && row.state !== filters.state) return false;
    if (filters.lga && row.lga !== filters.lga) return false;
    if (filters.ward && row.ward !== filters.ward) return false;
    if (filters.school && row.school !== filters.school) return false;
    if (filters.gender && row.gender !== filters.gender) return false;
    if (filters.exam_body && row.olevel_exam_body !== filters.exam_body) return false;
    if (disabilityMode && row.disability !== "Disabled") return false;
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

function sortGroupedRates(items: GroupedRate[], level: LocationLevel): GroupedRate[] {
  if (level === "zone") {
    return [...items].sort((a, b) => {
      const indexA = ZONE_ORDER.indexOf(a.label as (typeof ZONE_ORDER)[number]);
      const indexB = ZONE_ORDER.indexOf(b.label as (typeof ZONE_ORDER)[number]);
      if (indexA !== -1 || indexB !== -1) {
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
      }
      return a.label.localeCompare(b.label);
    });
  }

  return [...items].sort((a, b) => b.rate - a.rate);
}

function buildGroupedRates(rows: PerformanceRow[], level: LocationLevel, metric: RateMetric): GroupedRate[] {
  const bucket = new Map<string, { numerator: number; denominator: number }>();

  rows.forEach((row) => {
    const label = locationLabel(row, level);
    if (!label) return;

    const previous = bucket.get(label) ?? { numerator: 0, denominator: 0 };
    bucket.set(label, {
      numerator: previous.numerator + (metric === "pass" ? safeNum(row.passed_count) : safeNum(row.utme_qualified_count)),
      denominator: previous.denominator + (metric === "pass" ? safeNum(row.candidate_count) : safeNum(row.utme_candidate_count)),
    });
  });

  const grouped = Array.from(bucket.entries())
    .map(([label, totals]) => ({
      label,
      numerator: totals.numerator,
      denominator: totals.denominator,
      rate: weightedRate(totals.numerator, totals.denominator),
    }))
    .filter((item) => item.denominator > 0);

  return sortGroupedRates(grouped, level);
}

function buildLocationGenderSplits(rows: PerformanceRow[], level: LocationLevel, metric: RateMetric): LocationGenderSplit[] {
  const overall = buildGroupedRates(rows, level, metric);
  const order = overall.map((item) => item.label);
  const overallRateMap = new Map(overall.map((item) => [item.label, item.rate]));
  const bucket = new Map<string, { maleNumerator: number; maleDenominator: number; femaleNumerator: number; femaleDenominator: number }>();
  const samples = new Map<string, PerformanceRow>();

  rows.forEach((row) => {
    const label = locationLabel(row, level);
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

  return order
    .map((label) => {
      const totals = bucket.get(label) ?? {
        maleNumerator: 0,
        maleDenominator: 0,
        femaleNumerator: 0,
        femaleDenominator: 0,
      };
      const totalNumerator = totals.maleNumerator + totals.femaleNumerator;
      const totalDenominator = totals.maleDenominator + totals.femaleDenominator;
      const sampleRow = samples.get(label);
      if (!sampleRow) return null;

      return {
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
      };
    })
    .filter((item): item is LocationGenderSplit => item !== null && item.totalDenominator > 0);
}

function resolveLocationRows(
  rows: PerformanceRow[],
  baseLevel: LocationLevel,
  filters: MinisterFilters,
): { level: LocationLevel; rows: PerformanceRow[] } {
  let level = baseLevel;

  if (filters.zone && baseLevel === "zone") {
    level = "state";
  }

  if (filters.state) {
    level = baseLevel === "zone" ? "lga" : "lga";
  }

  if (filters.lga) {
    level = "ward";
  }

  if (filters.ward) {
    level = "school";
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

function benchmarkFor(metric: string, benchmarks: BenchmarkRow[]): number {
  return benchmarks.find((row) => row.metric_key === metric)?.benchmark_pct ?? 0;
}

function syncFiltersForDrill(
  setFilters: Dispatch<SetStateAction<MinisterFilters>>,
  context: DrillContext,
) {
  if (!context.label || context.level === "school") return;

  setFilters((previous) => {
    if (context.level === "zone") {
      return { ...previous, zone: context.zone ?? context.label, state: "", lga: "", ward: "", school: "" };
    }
    if (context.level === "state") {
      return {
        ...previous,
        zone: context.zone ?? previous.zone,
        state: context.state ?? context.label,
        lga: "",
        ward: "",
        school: "",
      };
    }
    if (context.level === "lga") {
      return {
        ...previous,
        zone: context.zone ?? previous.zone,
        state: context.state ?? previous.state,
        lga: context.lga ?? context.label,
        ward: "",
        school: "",
      };
    }
    if (context.level === "ward") {
      return {
        ...previous,
        zone: context.zone ?? previous.zone,
        state: context.state ?? previous.state,
        lga: context.lga ?? previous.lga,
        ward: context.ward ?? context.label,
        school: "",
      };
    }
    return previous;
  });
}

function resetLocationFilters(setFilters: Dispatch<SetStateAction<MinisterFilters>>) {
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

function KpiCard({ item, prevSessionLabel }: { item: MetricCard; prevSessionLabel?: string }) {
  const [showHelp, setShowHelp] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpPanelRef = useRef<HTMLDivElement | null>(null);
  const rising = item.delta !== null && item.delta > 0;
  const falling = item.delta !== null && item.delta < 0;

  useEffect(() => {
    if (!showHelp) return undefined;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (helpButtonRef.current?.contains(target)) return;
      if (helpPanelRef.current?.contains(target)) return;
      setShowHelp(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showHelp]);

  return (
    <div className="relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
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
            >
              <HelpCircle className="h-3 w-3" />
            </button>
            {showHelp ? (
              <div
                ref={helpPanelRef}
                className="absolute right-0 top-full z-30 mt-2 w-[220px] rounded-xl bg-slate-950 px-3 py-2.5 text-[11px] leading-4 text-white shadow-2xl"
                onMouseEnter={() => setShowHelp(true)}
                onMouseLeave={() => setShowHelp(false)}
              >
                {item.help}
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
  onRefresh,
  onExpand,
  onPlotClick,
}: {
  title: string;
  helpKey: ExpandChartKey;
  bundle?: ChartBundle;
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
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3">
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
              onClick={() => setShowHelp((previous) => !previous)}
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
            {showHelp ? (
              <div
                ref={helpPanelRef}
                className="absolute right-0 top-10 z-20 w-[290px] rounded-xl bg-slate-950 px-4 py-3 text-xs leading-5 text-white shadow-2xl"
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

      <div className="p-4">
        {bundle ? (
          <>
            {bundle.fixedLegend?.length ? <FixedLegend items={bundle.fixedLegend} /> : null}
            {bundle.scrollable ? (
              <div className="overflow-y-auto pr-1" style={{ maxHeight: bundle.scrollMaxHeight ?? 360 }}>
                <Plot
                  data={bundle.data as never}
                  layout={bundle.layout as never}
                  config={(bundle.config ?? { displayModeBar: false, responsive: true }) as never}
                  style={{ width: "100%", height: "100%" }}
                  onClick={onPlotClick as never}
                />
              </div>
            ) : (
              <Plot
                data={bundle.data as never}
                layout={bundle.layout as never}
                config={(bundle.config ?? { displayModeBar: false, responsive: true }) as never}
                style={{ width: "100%", height: "100%" }}
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

function buildGenderChart(rows: PerformanceRow[], metric: RateMetric, examBody: string): ChartBundle | null {
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
  benchmark: number,
  benchmarkLabel: string,
  startLevel: LocationLevel,
): LocationChartResult | null {
  const resolved = resolveLocationRows(rows, startLevel, filters);
  const grouped = buildLocationGenderSplits(resolved.rows, resolved.level, metric);
  if (!grouped.length) return null;

  const isScrollable = startLevel === "state";
  const chartHeight = Math.max(isScrollable ? 500 : 340, grouped.length * (isScrollable ? 40 : 32) + 130);
  const benchmarkText = `${benchmarkLabel} benchmark ${benchmark.toFixed(1)}%`;
  const numeratorLabel = metric === "pass" ? "Passed" : "Qualified";
  const denominatorLabel = metric === "pass" ? "Candidates" : "UTME Candidates";
  const colors = genderColorsForExam(benchmarkLabel);

  const labels = grouped.map((item) => item.location);
  const maleValues = grouped.map((item) => item.maleNumerator);
  const femaleValues = grouped.map((item) => item.femaleNumerator);
  const totals = grouped.map((item) => item.totalNumerator);
  const rateLabels = grouped.map((item) => `${round1(item.overallRate).toFixed(1)}%`);
  const maxTotal = Math.max(...totals, 0);
  const rateOffset = maxTotal > 0 ? Math.max(maxTotal * 0.008, 12) : 1;
  const axisMax = maxTotal > 0 ? maxTotal + rateOffset * 1.25 : 1;

  const data: PlotDatum[] = [
    {
      type: "bar",
      orientation: "h",
      name: "Male",
      x: maleValues,
      y: labels,
      marker: { color: colors.male, line: { width: 0 } },
      text: grouped.map((item) => (item.maleNumerator > 0 ? fmtInt(item.maleNumerator) : "")),
      texttemplate: "%{text}",
      textposition: "inside",
      insidetextanchor: "middle",
      textfont: { color: "#ffffff", size: 11 },
      cliponaxis: false,
      customdata: grouped.map((item) => [
        item.location,
        item.maleNumerator,
        item.maleDenominator,
        round1(item.maleRate),
        round1(item.overallRate),
        item.femaleNumerator,
        item.femaleDenominator,
        round1(item.femaleRate),
        item.totalNumerator,
        item.totalDenominator,
        item.sampleRow.zone,
        item.sampleRow.state,
        item.sampleRow.lga,
        item.sampleRow.ward,
        item.sampleRow.school,
      ]),
      hovertemplate:
        `<b>%{customdata[0]}</b><br>Gender: Male<br>Male Rate: %{customdata[3]:.1f}%<br>${numeratorLabel}: %{customdata[1]:,.0f}<br>${denominatorLabel}: %{customdata[2]:,.0f}<extra></extra>`,
      showlegend: false,
    },
    {
      type: "bar",
      orientation: "h",
      name: "Female",
      x: femaleValues,
      y: labels,
      marker: { color: colors.female, line: { width: 0 } },
      text: grouped.map((item) => (item.femaleNumerator > 0 ? fmtInt(item.femaleNumerator) : "")),
      texttemplate: "%{text}",
      textposition: "inside",
      insidetextanchor: "middle",
      textfont: { color: "#ffffff", size: 11 },
      cliponaxis: false,
      customdata: grouped.map((item) => [
        item.location,
        item.femaleNumerator,
        item.femaleDenominator,
        round1(item.femaleRate),
        round1(item.overallRate),
        item.maleNumerator,
        item.maleDenominator,
        round1(item.maleRate),
        item.totalNumerator,
        item.totalDenominator,
        item.sampleRow.zone,
        item.sampleRow.state,
        item.sampleRow.lga,
        item.sampleRow.ward,
        item.sampleRow.school,
      ]),
      hovertemplate:
        `<b>%{customdata[0]}</b><br>Gender: Female<br>Female Rate: %{customdata[3]:.1f}%<br>${numeratorLabel}: %{customdata[1]:,.0f}<br>${denominatorLabel}: %{customdata[2]:,.0f}<extra></extra>`,
      showlegend: false,
    },
    {
      type: "scatter",
      mode: "text",
      x: totals.map((value) => value + rateOffset),
      y: labels,
      text: rateLabels,
      textposition: "middle right",
      textfont: { size: 10, color: COLORS.text },
      customdata: grouped.map((item) => [item.location, "", "", "", "", "", "", "", "", "", item.sampleRow.zone, item.sampleRow.state, item.sampleRow.lga, item.sampleRow.ward, item.sampleRow.school]),
      hoverinfo: "skip",
      showlegend: false,
      cliponaxis: false,
    },
  ];

  const layout = buildCommonLayout(chartHeight);
  layout.uirevision = `performance-location-${benchmarkLabel}-${startLevel}-${resolved.level}-${labels.length}`;
  layout.barmode = "stack";
  layout.bargap = 0.28;
  layout.showlegend = isScrollable ? false : layout.showlegend;
  layout.margin = { l: 128, r: 56, t: startLevel === "zone" ? 40 : 22, b: 48 };
  layout.xaxis = {
    range: [0, axisMax],
    gridcolor: COLORS.grid,
    zeroline: false,
    tickfont: { color: COLORS.sub },
    separatethousands: true,
  };
  layout.yaxis = {
    automargin: true,
    autorange: "reversed",
    tickfont: { color: COLORS.sub },
    showgrid: false,
  };
  layout.shapes = [
    {
      type: "line",
      xref: "paper",
      x0: benchmark / 100,
      x1: benchmark / 100,
      yref: "paper",
      y0: 0,
      y1: 1,
      layer: "above",
      line: { color: COLORS.benchmark, width: 2, dash: "dot" },
    },
  ];
  layout.annotations = [
    {
      xref: "paper",
      x: 0.5,
      yref: "paper",
      y: startLevel === "zone" ? 1.08 : 0.985,
      xanchor: "center",
      yanchor: startLevel === "zone" ? "bottom" : "top",
      showarrow: false,
      bgcolor: "rgba(255,255,255,0.96)",
      bordercolor: "rgba(239,68,68,0.20)",
      borderwidth: 1,
      borderpad: 4,
      font: { size: 10, color: COLORS.benchmark },
      text: benchmarkText,
      align: "center",
    },
  ];

  return {
    level: resolved.level,
    scopedRows: resolved.rows,
    bundle: {
      data,
      layout,
      scrollable: isScrollable,
      scrollMaxHeight: isScrollable ? 340 : undefined,
      expandedMaxHeight: isScrollable ? 400 : 430,
      expandedWidthClass: isScrollable ? "max-w-[920px]" : "max-w-[900px]",
      fixedLegend: [
        { label: `${benchmarkLabel} Male`, color: colors.male },
        { label: `${benchmarkLabel} Female`, color: colors.female },
        { label: benchmarkText, color: COLORS.benchmark, dashed: true },
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

  const years = Array.from(grouped.keys()).sort().slice(-4);
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
  layout.legend = { orientation: "h", y: -0.24, x: 0, font: { size: 11, color: COLORS.sub } };
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
  layout.margin = { l: 58, r: 28, t: 36, b: 76 };

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
  const [benchmarks, setBenchmarks] = useState<BenchmarkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandState, setExpandState] = useState<ExpandState>(null);
  const expandedPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const dataBase = getDataBaseUrl();
        const tryLoad = async <T,>(path: string): Promise<T[]> => {
          try {
            return await loadCSV<T>(`${dataBase}/${path}`);
          } catch {
            return await loadCSV<T>(`/data/${path}`);
          }
        };
        const tryLoadMany = async <T,>(paths: readonly string[]): Promise<T[]> => {
          try {
            return await loadCSVMany<T>(paths.map((path) => `${dataBase}/${path}`));
          } catch {
            return await loadCSVMany<T>(paths.map((path) => `/data/${path}`));
          }
        };

        const [factRows, benchmarkRows] = await Promise.all([
          tryLoadMany<PerformanceRow>(PERFORMANCE_SCHOOL_FILES),
          tryLoad<BenchmarkRow>("dim_benchmarks.csv"),
        ]);

        if (!mounted) return;
        setRows(factRows);
        setBenchmarks(benchmarkRows);
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
  }, [dimSessions]);

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

  const baseRows = useMemo(() => filterRows(rows, filters, disabilityMode), [rows, filters, disabilityMode]);
  const previousRows = useMemo(() => {
    if (!previousSession) return [];
    return filterRows(rows, { ...filters, session: previousSession }, disabilityMode);
  }, [rows, filters, previousSession, disabilityMode]);
  const trendRows = useMemo(() => filterRows(rows, filters, disabilityMode, true), [rows, filters, disabilityMode]);

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

    // Raw counts for display below the percentage
    const waecPassed = waecRows.reduce((s, r) => s + safeNum(r.passed_count), 0);
    const waecTotal = waecRows.reduce((s, r) => s + safeNum(r.candidate_count), 0);
    const necoPassed = necoRows.reduce((s, r) => s + safeNum(r.passed_count), 0);
    const necoTotal = necoRows.reduce((s, r) => s + safeNum(r.candidate_count), 0);
    const nabtebPassed = nabtebRows.reduce((s, r) => s + safeNum(r.passed_count), 0);
    const nabtebTotal = nabtebRows.reduce((s, r) => s + safeNum(r.candidate_count), 0);
    const utmeQualified = baseRows.reduce((s, r) => s + safeNum(r.utme_qualified_count), 0);
    const utmeTotal = baseRows.reduce((s, r) => s + safeNum(r.utme_candidate_count), 0);
    const admitted = baseRows.reduce((s, r) => s + safeNum(r.admitted_count), 0);
    const utmeQual2 = baseRows.reduce((s, r) => s + safeNum(r.utme_qualified_count), 0);
    const matriculated = baseRows.reduce((s, r) => s + safeNum(r.matriculated_count), 0);
    const admittedForMatric = baseRows.reduce((s, r) => s + safeNum(r.admitted_count), 0);

    return [
      {
        label: "WAEC Pass Rate",
        help: "Percentage of WAEC O-Level candidates who scored at least 5 credits including English and Mathematics in the selected session and filters. This is the primary secondary exit benchmark.",
        value: currentWaec,
        delta: prevWaec === null ? null : round1(currentWaec - prevWaec),
        icon: <BadgePercent className="h-5 w-5" />,
        accent: COLORS.waec,
        bg: "rgba(37,99,235,0.10)",
        numerator: waecPassed, denominator: waecTotal,
        numeratorLabel: "Passed", denominatorLabel: "Candidates",
      },
      {
        label: "NECO Pass Rate",
        help: "Percentage of NECO O-Level candidates meeting the 5-credit threshold including English and Mathematics. NECO is the second national examination body and covers a significant share of candidates.",
        value: currentNeco,
        delta: prevNeco === null ? null : round1(currentNeco - prevNeco),
        icon: <FileBarChart2 className="h-5 w-5" />,
        accent: COLORS.neco,
        bg: "rgba(16,185,129,0.10)",
        numerator: necoPassed, denominator: necoTotal,
        numeratorLabel: "Passed", denominatorLabel: "Candidates",
      },
      {
        label: "NABTEB Pass Rate",
        help: "Percentage of NABTEB candidates meeting the pass threshold. NABTEB covers technical and vocational learners, and its rate reflects workforce-readiness outcomes for that segment.",
        value: currentNabteb,
        delta: prevNabteb === null ? null : round1(currentNabteb - prevNabteb),
        icon: <Landmark className="h-5 w-5" />,
        accent: COLORS.nabteb,
        bg: "rgba(245,158,11,0.10)",
        numerator: nabtebPassed, denominator: nabtebTotal,
        numeratorLabel: "Passed", denominatorLabel: "Candidates",
      },
      {
        label: "UTME Qualifying Rate",
        help: "Percentage of O-Level candidates who also sat the UTME, indicating readiness to proceed to tertiary admission. A low qualifying rate means many O-Level completers are not pursuing tertiary education.",
        value: currentUtme,
        delta: prevUtme === null ? null : round1(currentUtme - prevUtme),
        icon: <GraduationCap className="h-5 w-5" />,
        accent: COLORS.utme,
        bg: "rgba(139,92,246,0.10)",
        numerator: utmeQualified, denominator: utmeTotal,
        numeratorLabel: "Qualified", denominatorLabel: "UTME Candidates",
      },
      {
        label: "Admission Rate",
        help: "Percentage of UTME participants who received a tertiary admission offer. This is the key pipeline conversion metric from exam participation to actual tertiary intake.",
        value: currentAdmission,
        delta: prevAdmission === null ? null : round1(currentAdmission - prevAdmission),
        icon: <School className="h-5 w-5" />,
        accent: COLORS.admission,
        bg: "rgba(14,165,233,0.10)",
        numerator: admitted, denominator: utmeQual2,
        numeratorLabel: "Admitted", denominatorLabel: "UTME Qualified",
      },
      {
        label: "Matriculation Completion Rate",
        help: "Percentage of admitted students who completed full matriculation. This captures the final step of the pipeline and shows how much of the admission offer is converted into enrolled tertiary students.",
        value: currentMatric,
        delta: prevMatric === null ? null : round1(currentMatric - prevMatric),
        icon: <UserCheck className="h-5 w-5" />,
        accent: COLORS.matric,
        bg: "rgba(20,184,166,0.10)",
        numerator: matriculated, denominator: admittedForMatric,
        numeratorLabel: "Matriculated", denominatorLabel: "Admitted",
      },
    ];
  }, [waecRows, necoRows, nabtebRows, baseRows, previousWaecRows, previousNecoRows, previousNabtebRows, previousRows]);

  const waecBenchmark = benchmarkFor("waec_pass_rate", benchmarks);
  const necoBenchmark = benchmarkFor("neco_pass_rate", benchmarks);
  const nabtebBenchmark = benchmarkFor("nabteb_pass_rate", benchmarks);
  const utmeBenchmark = benchmarkFor("utme_qualifying_rate", benchmarks);

  const waecGenderChart = useMemo(() => buildGenderChart(waecRows, "pass", "WAEC"), [waecRows]);
  const necoGenderChart = useMemo(() => buildGenderChart(necoRows, "pass", "NECO"), [necoRows]);
  const nabtebGenderChart = useMemo(() => buildGenderChart(nabtebRows, "pass", "NABTEB"), [nabtebRows]);
  const utmeGenderChart = useMemo(() => buildGenderChart(baseRows, "utme", "UTME"), [baseRows]);

  const waecZoneChart = useMemo(
    () => buildLocationChart(waecRows, filters, "pass", waecBenchmark, "WAEC", DRILL_START_LEVEL.waecZone),
    [waecRows, filters, waecBenchmark],
  );
  const waecStateChart = useMemo(
    () => buildLocationChart(waecRows, filters, "pass", waecBenchmark, "WAEC", DRILL_START_LEVEL.waecState),
    [waecRows, filters, waecBenchmark],
  );
  const necoZoneChart = useMemo(
    () => buildLocationChart(necoRows, filters, "pass", necoBenchmark, "NECO", DRILL_START_LEVEL.necoZone),
    [necoRows, filters, necoBenchmark],
  );
  const necoStateChart = useMemo(
    () => buildLocationChart(necoRows, filters, "pass", necoBenchmark, "NECO", DRILL_START_LEVEL.necoState),
    [necoRows, filters, necoBenchmark],
  );
  const nabtebZoneChart = useMemo(
    () => buildLocationChart(nabtebRows, filters, "pass", nabtebBenchmark, "NABTEB", DRILL_START_LEVEL.nabtebZone),
    [nabtebRows, filters, nabtebBenchmark],
  );
  const nabtebStateChart = useMemo(
    () => buildLocationChart(nabtebRows, filters, "pass", nabtebBenchmark, "NABTEB", DRILL_START_LEVEL.nabtebState),
    [nabtebRows, filters, nabtebBenchmark],
  );
  const utmeZoneChart = useMemo(
    () => buildLocationChart(baseRows, filters, "utme", utmeBenchmark, "UTME", DRILL_START_LEVEL.utmeZone),
    [baseRows, filters, utmeBenchmark],
  );
  const utmeStateChart = useMemo(
    () => buildLocationChart(baseRows, filters, "utme", utmeBenchmark, "UTME", DRILL_START_LEVEL.utmeState),
    [baseRows, filters, utmeBenchmark],
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
  const expandedBundle = useMemo(() => cloneChartBundle(expandedEntry.bundle), [expandedEntry.bundle]);

  if (loading) {
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
          title="WAEC Pass Rate by Gender"
          helpKey="waecGender"
          bundle={waecGenderChart ?? undefined}
          onRefresh={() => undefined}
          onExpand={() => setExpandState({ title: "WAEC Pass Rate by Gender", chartKey: "waecGender" })}
        />
        <ChartCard
          title="WAEC Pass Rate by Zone"
          helpKey="waecZone"
          bundle={waecZoneChart?.bundle ?? undefined}
          onRefresh={() => resetDrill()}
          onExpand={() => setExpandState({ title: "WAEC Pass Rate by Zone", chartKey: "waecZone" })}
          onPlotClick={(event) => handleLocationChartClick(waecZoneChart, event)}
        />
      </div>
      <ChartCard
        title="WAEC Pass Rate by State"
        helpKey="waecState"
        bundle={waecStateChart?.bundle ?? undefined}
        onRefresh={() => resetDrill()}
        onExpand={() => setExpandState({ title: "WAEC Pass Rate by State", chartKey: "waecState" })}
        onPlotClick={(event) => handleLocationChartClick(waecStateChart, event)}
      />

      <SectionLabel id="performance-neco" title="NECO Performance" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard
          title="NECO Pass Rate by Gender"
          helpKey="necoGender"
          bundle={necoGenderChart ?? undefined}
          onRefresh={() => undefined}
          onExpand={() => setExpandState({ title: "NECO Pass Rate by Gender", chartKey: "necoGender" })}
        />
        <ChartCard
          title="NECO Pass Rate by Zone"
          helpKey="necoZone"
          bundle={necoZoneChart?.bundle ?? undefined}
          onRefresh={() => resetDrill()}
          onExpand={() => setExpandState({ title: "NECO Pass Rate by Zone", chartKey: "necoZone" })}
          onPlotClick={(event) => handleLocationChartClick(necoZoneChart, event)}
        />
      </div>
      <ChartCard
        title="NECO Pass Rate by State"
        helpKey="necoState"
        bundle={necoStateChart?.bundle ?? undefined}
        onRefresh={() => resetDrill()}
        onExpand={() => setExpandState({ title: "NECO Pass Rate by State", chartKey: "necoState" })}
        onPlotClick={(event) => handleLocationChartClick(necoStateChart, event)}
      />

      <SectionLabel id="performance-nabteb" title="NABTEB Performance" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard
          title="NABTEB Pass Rate by Gender"
          helpKey="nabtebGender"
          bundle={nabtebGenderChart ?? undefined}
          onRefresh={() => undefined}
          onExpand={() => setExpandState({ title: "NABTEB Pass Rate by Gender", chartKey: "nabtebGender" })}
        />
        <ChartCard
          title="NABTEB Pass Rate by Zone"
          helpKey="nabtebZone"
          bundle={nabtebZoneChart?.bundle ?? undefined}
          onRefresh={() => resetDrill()}
          onExpand={() => setExpandState({ title: "NABTEB Pass Rate by Zone", chartKey: "nabtebZone" })}
          onPlotClick={(event) => handleLocationChartClick(nabtebZoneChart, event)}
        />
      </div>
      <ChartCard
        title="NABTEB Pass Rate by State"
        helpKey="nabtebState"
        bundle={nabtebStateChart?.bundle ?? undefined}
        onRefresh={() => resetDrill()}
        onExpand={() => setExpandState({ title: "NABTEB Pass Rate by State", chartKey: "nabtebState" })}
        onPlotClick={(event) => handleLocationChartClick(nabtebStateChart, event)}
      />

      <SectionLabel id="performance-utme" title="UTME Readiness" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard
          title="UTME Qualifying Rate by Gender"
          helpKey="utmeGender"
          bundle={utmeGenderChart ?? undefined}
          onRefresh={() => undefined}
          onExpand={() => setExpandState({ title: "UTME Qualifying Rate by Gender", chartKey: "utmeGender" })}
        />
        <ChartCard
          title="UTME Qualifying Rate by Zone"
          helpKey="utmeZone"
          bundle={utmeZoneChart?.bundle ?? undefined}
          onRefresh={() => resetDrill()}
          onExpand={() => setExpandState({ title: "UTME Qualifying Rate by Zone", chartKey: "utmeZone" })}
          onPlotClick={(event) => handleLocationChartClick(utmeZoneChart, event)}
        />
      </div>
      <ChartCard
        title="UTME Qualifying Rate by State"
        helpKey="utmeState"
        bundle={utmeStateChart?.bundle ?? undefined}
        onRefresh={() => resetDrill()}
        onExpand={() => setExpandState({ title: "UTME Qualifying Rate by State", chartKey: "utmeState" })}
        onPlotClick={(event) => handleLocationChartClick(utmeStateChart, event)}
      />

      <SectionLabel id="performance-trend" title="Four-Year Trend" />
      <ChartCard
        title="Four-Year Exam Performance Trend"
        helpKey="trend"
        bundle={trendChart ?? undefined}
        onRefresh={() => undefined}
        onExpand={() => setExpandState({ title: "Four-Year Exam Performance Trend", chartKey: "trend" })}
      />

      {expandState ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div
            ref={expandedPanelRef}
            className={[
              "w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl",
              expandedBundle?.expandedWidthClass ?? "max-w-[980px]",
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
            <div className="p-4">
              {expandedBundle ? (
                <>
                  {expandedBundle.fixedLegend?.length ? <FixedLegend items={expandedBundle.fixedLegend} /> : null}
                  {expandedBundle.scrollable ? (
                    <div className="overflow-y-auto pr-1" style={{ maxHeight: expandedBundle.expandedMaxHeight ?? 460 }}>
                      <Plot
                        data={expandedBundle.data as never}
                        layout={expandedBundle.layout as never}
                        config={{ displayModeBar: false, responsive: true } as never}
                        useResizeHandler
                        style={{ width: "100%", height: chartPixelHeight(expandedBundle.layout, 360) }}
                        onClick={expandedEntry.onPlotClick as never}
                      />
                    </div>
                  ) : (
                    <Plot
                      data={expandedBundle.data as never}
                      layout={expandedBundle.layout as never}
                      config={{ displayModeBar: false, responsive: true } as never}
                      useResizeHandler
                      style={{ width: "100%", height: chartPixelHeight(expandedBundle.layout, 360) }}
                      onClick={expandedEntry.onPlotClick as never}
                    />
                  )}
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
