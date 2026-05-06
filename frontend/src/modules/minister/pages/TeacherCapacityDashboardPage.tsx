import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import Plot from "react-plotly.js";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgePercent,
  HelpCircle,
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
  qualification_group: string;
  qualification_status: string;
  disability?: string;
  student_count: number;
  teacher_count: number;
  pupil_teacher_ratio: number;
};

type TeacherBenchmarkRow = {
  metric_key: string;
  label: string;
  school_level: string;
  benchmark_value: number;
  source_note: string;
};

type PlotDatum = Record<string, unknown>;

type PlotLayout = Record<string, unknown> & {
  height?: number;
};

type PlotConfig = Record<string, unknown>;

type PlotPoint = {
  x?: string | number;
  y?: string | number;
  label?: string | number;
  customdata?: unknown;
};

type PlotPointEvent = {
  points?: PlotPoint[];
};

type LocationLevel = "state" | "lga" | "ward" | "school";

type ExpandChartKey =
  | "ptrState"
  | "ptrPublic"
  | "ptrPrivate"
  | "ptrLevel"
  | "teachersState"
  | "studentsState"
  | "teacherSplit"
  | "qualificationGroup"
  | "qualificationComposition"
  | "qualificationState"
  | "qualificationGender"
  | "qualificationSchoolType"
  | "qualificationTrend";

type ChartBundle = {
  data: PlotDatum[];
  layout: PlotLayout;
  config?: PlotConfig;
  scrollable?: boolean;
  scrollMaxHeight?: number;
  expandedMaxHeight?: number;
  expandedWidthClass?: string;
  fixedLegend?: LegendItem[];
  callout?: {
    text: string;
    tone?: "info" | "warning";
  };
};

type LocationChartResult = {
  bundle: ChartBundle;
  level: LocationLevel;
};

type LegendItem = {
  label: string;
  color: string;
  dashed?: boolean;
  fullRow?: boolean;
};

type ExpandedEntry = {
  bundle?: ChartBundle;
  onPlotClick?: (event: PlotPointEvent) => void;
};

type MetricCard = {
  label: string;
  value: string;
  note?: string;
  icon: ReactNode;
  accent: string;
  bg: string;
  delta?: number | null;
  help?: string;
  prevSessionLabel?: string;
};

type ExpandState = {
  chartKey: ExpandChartKey;
  title: string;
} | null;

const COLORS = {
  text: "#0f172a",
  sub: "#64748b",
  grid: "rgba(15, 23, 42, 0.10)",
  bg: "rgba(0,0,0,0)",
  public: "#2563eb",
  private: "#10b981",
  qualified: "#7c3aed",
  unqualified: "#f97316",
  benchmark: "#ef4444",
  ratio: "#0ea5e9",
  schoolLevelPrimary: "#f59e0b",
  schoolLevelSecondary: "#14b8a6",
  schoolLevelAdult: "#8b5cf6",
};

const SCHOOL_LEVEL_ORDER = ["Pre/Primary", "JSS", "SSS", "Adult & Non-Formal (IQS/IQTE)"] as const;
const GENDER_ORDER = ["Male", "Female"] as const;
const SCHOOL_TYPE_ORDER = ["Public", "Private"] as const;
const QUALIFICATION_GROUP_ORDER = [
  "NCE",
  "PGDE",
  "BEd or Equivalent",
  "MEd or Equivalent",
  "Grade II or Equivalent",
  "None",
] as const;
const QUALIFICATION_GROUP_COLORS = ["#2563eb", "#10b981", "#8b5cf6", "#f59e0b", "#14b8a6", "#f97316"] as const;

const HELP_TEXT: Record<ExpandChartKey, string> = {
  ptrState:
    "Primary pupil-teacher ratio ranked highest to lowest by location. The red dotted line shows the UBE primary benchmark of 35:1. Click a bar to drill deeper.",
  ptrPublic:
    "Primary pupil-teacher ratio for public schools ranked highest to lowest by location. The red dotted line shows the UBE primary benchmark of 35:1. Click a bar to drill deeper.",
  ptrPrivate:
    "Primary pupil-teacher ratio for private schools ranked highest to lowest by location. The red dotted line shows the UBE primary benchmark of 35:1. Click a bar to drill deeper.",
  ptrLevel:
    "This chart compares pupil-teacher ratio across Pre/Primary, JSS, SSS, and Adult & Non-Formal (IQS/IQTE). It uses UBE benchmark references for Pre/Primary and JSS/SSS.",
  teachersState:
    "This chart shows how total teachers are split between public and private schools across locations. Click a bar to drill deeper.",
  studentsState:
    "This chart shows how total students are split between public and private schools across locations. Click a bar to drill deeper.",
  teacherSplit:
    "This chart compares public and private teacher counts across Pre/Primary, JSS, SSS, and Adult & Non-Formal (IQS/IQTE).",
  qualificationGroup:
    "This chart shows the full qualification mix of teachers. Qualified means at least NCE, BEd, or both.",
  qualificationComposition:
    "This chart shows the overall share of qualified versus unqualified teachers across the selected filters.",
  qualificationState:
    "This chart compares qualified and unqualified teacher share across locations. Click a bar to drill deeper.",
  qualificationGender:
    "This chart compares qualification coverage between male and female teachers.",
  qualificationSchoolType:
    "This chart compares qualification coverage between public and private schools.",
  qualificationTrend:
    "This chart shows how qualified and unqualified teacher rates move across academic sessions for the selected filters.",
};

function safeNum(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}


function fmtInt(value: number): string {
  return Math.round(value).toLocaleString();
}

function fmtRatio(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${Math.round(value).toLocaleString()} : 1`;
}

function fmtPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${Math.round(value)}%`;
}

function percentAxisMax(values: number[], floor = 100): number {
  const peak = Math.max(...values, 0);
  return Math.max(floor, Math.ceil((peak + 10) / 10) * 10);
}

function orderedUnique(values: string[], preferredOrder: readonly string[]): string[] {
  const set = new Set(values.filter(Boolean));
  const ordered = preferredOrder.filter((item) => set.has(item));
  const remaining = [...set].filter((item) => !preferredOrder.includes(item)).sort((a, b) => a.localeCompare(b));
  return [...ordered, ...remaining];
}

function normalizeTeacherSchoolLevel(value: string): string {
  if (value === "Pre-Primary" || value === "Primary" || value === "Pre-Primary/Primary") return "Pre/Primary";
  if (value === "Adult & Non-Formal Education" || value === "Adult & Non-Formal" || value === "Adult & Non-Formal (IQS/IQTE)") return "Adult & Non-Formal (IQS/IQTE)";
  if (value === "JSS") return "JSS";
  if (value === "SSS") return "SSS";
  return value;
}

function fmtDelta(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "0%";
  return `${Math.abs(value) < 0.05 ? 0 : Math.round(value)}%`;
}

function buildCommonLayout(height: number): PlotLayout {
  return {
    height,
    paper_bgcolor: COLORS.bg,
    plot_bgcolor: COLORS.bg,
    font: { family: "Inter, system-ui, sans-serif", color: COLORS.text, size: 12 },
    margin: { l: 76, r: 24, t: 22, b: 42 },
    showlegend: false,
    hoverlabel: { bgcolor: "#0f172a", bordercolor: "#0f172a", font: { color: "#ffffff", size: 11 } },
  };
}

function chartPixelHeight(layout: PlotLayout | undefined, fallback = 340): number {
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

function weightedRatio(students: number, teachers: number): number {
  if (teachers <= 0) return 0;
  return students / teachers;
}

function locationLabel(row: TeacherCapacityRow, level: LocationLevel): string {
  if (level === "state") return row.state;
  if (level === "lga") return row.lga;
  if (level === "ward") return row.ward;
  return row.school;
}

function filterTeacherRows(
  rows: TeacherCapacityRow[],
  filters: MinisterFilters,
  options?: { ignoreSession?: boolean; ignoreQualificationStatus?: boolean },
  disabilityMode = false,
): TeacherCapacityRow[] {
  const expectedLocLevel = expectedLocLevelForLocation(filters);
  return rows.filter((row) => {
    if (!options?.ignoreSession && row.session !== filters.session) return false;
    if (row.loc_level && row.loc_level.toLowerCase() !== expectedLocLevel) return false;
    if (filters.zone && row.zone !== filters.zone) return false;
    if (filters.state && canonicalState(row.state) !== canonicalState(filters.state)) return false;
    if (filters.lga && row.lga !== filters.lga) return false;
    if (filters.ward && row.ward !== filters.ward) return false;
    if (filters.school && row.school !== filters.school) return false;
    if (filters.gender && row.gender !== filters.gender) return false;
    if (filters.school_level && row.school_level !== filters.school_level) return false;
    if (filters.school_type && row.school_type !== filters.school_type) return false;
    if (filters.class_grade && row.class_grade !== filters.class_grade) return false;
    if (!options?.ignoreQualificationStatus && filters.qualification_status && row.qualification_status !== filters.qualification_status) {
      return false;
    }
    if (disabilityMode ? row.disability !== "Disabled" : row.disability === "Disabled") return false;
    return true;
  });
}

function rowIdentityKey(row: TeacherCapacityRow): string {
  return [
    row.session,
    row.zone,
    row.state,
    row.lga,
    row.ward,
    row.school,
    row.gender,
    row.school_type,
    row.school_level,
    row.class_grade,
    row.qualification_group,
    row.qualification_status,
  ].join("||");
}

function applyStudentDisabilityOverlay(allRows: TeacherCapacityRow[], disabilityRows: TeacherCapacityRow[]): TeacherCapacityRow[] {
  if (disabilityRows.length === 0) {
    return allRows.map((row) => ({ ...row, student_count: 0 }));
  }

  const disabilityMap = new Map(disabilityRows.map((row) => [rowIdentityKey(row), safeNum(row.student_count)]));

  return allRows.map((row) => ({
    ...row,
    student_count: disabilityMap.get(rowIdentityKey(row)) ?? 0,
  }));
}

type BenchmarkMeta = {
  value: number;
  label: string;
  source: string;
};


function resolveLocationRows(
  rows: TeacherCapacityRow[],
  filters: MinisterFilters,
  startLevel: LocationLevel,
): { level: LocationLevel; rows: TeacherCapacityRow[] } {
  let currentLevel = startLevel;
  let scopedRows = rows;

  if (filters.zone) {
    scopedRows = scopedRows.filter((row) => row.zone === filters.zone);
  }

  if (filters.state) {
    scopedRows = scopedRows.filter((row) => canonicalState(row.state) === canonicalState(filters.state));
    currentLevel = "lga";
  }

  if (filters.lga) {
    scopedRows = scopedRows.filter((row) => row.lga === filters.lga);
    currentLevel = "ward";
  }

  if (filters.ward) {
    scopedRows = scopedRows.filter((row) => row.ward === filters.ward);
    currentLevel = "school";
  }

  return { level: currentLevel, rows: scopedRows };
}

function extractPointLabel(event: PlotPointEvent): string {
  const point = event.points?.[0];
  if (!point) return "";

  if (typeof point.customdata === "string" && point.customdata.trim()) {
    return point.customdata.trim();
  }

  if (Array.isArray(point.customdata) && typeof point.customdata[0] === "string") {
    return point.customdata[0].trim();
  }

  const candidate = [point.y, point.label, point.x].find((item) => typeof item === "string" && item.trim().length > 0);
  return typeof candidate === "string" ? candidate.split("<br>")[0]?.trim() ?? "" : "";
}

function syncFiltersForDrill(
  setFilters: Dispatch<SetStateAction<MinisterFilters>>,
  currentLevel: LocationLevel,
  pointLabel: string,
) {
  if (!pointLabel || currentLevel === "school") return;

  setFilters((previous: MinisterFilters) => {
    if (currentLevel === "state") {
      return { ...previous, state: pointLabel, lga: "", ward: "", school: "" };
    }
    if (currentLevel === "lga") {
      return { ...previous, lga: pointLabel, ward: "", school: "" };
    }
    if (currentLevel === "ward") {
      return { ...previous, ward: pointLabel, school: "" };
    }
    return previous;
  });
}

function resetLocationFilters(setFilters: Dispatch<SetStateAction<MinisterFilters>>) {
  setFilters((previous: MinisterFilters) => ({
    ...previous,
    zone: "",
    state: "",
    lga: "",
    ward: "",
    school: "",
  }));
}

function FixedLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      {items.map((item) => (
        <div key={item.label} className={["flex items-center gap-2", item.fullRow ? "basis-full" : ""].join(" ")}>
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{
              backgroundImage: item.dashed
                ? `radial-gradient(circle, ${item.color} 0 58%, rgba(255,255,255,0) 60% 100%)`
                : undefined,
              backgroundColor: item.dashed ? undefined : item.color,
              border: item.dashed ? `2px solid ${item.color}` : undefined,
            }}
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ id }: { id: string }) {
  return <div id={id} className="scroll-mt-32 h-0" aria-hidden="true" />;
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="grid h-[260px] place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
      {title}
    </div>
  );
}

function KpiCard({ item }: { item: MetricCard }) {
  const [showHelp, setShowHelp] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpPanelRef = useRef<HTMLDivElement | null>(null);
  const rising = (item.delta ?? 0) > 0;
  const falling = (item.delta ?? 0) < 0;

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
    <div
      className="relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm"
      onMouseLeave={() => setShowHelp(false)}
    >
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: item.bg, color: item.accent }}>
              {item.icon}
            </div>
            <div className="text-[12px] font-medium leading-tight text-slate-500">{item.label}</div>
          </div>
          {item.help ? (
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
                className="grid h-6 w-6 place-items-center rounded-md border border-slate-200 text-slate-400 hover:bg-slate-50"
              >
                <HelpCircle className="h-3 w-3" />
              </button>
            </div>
          ) : null}
        </div>
        <div className="mt-2.5 text-[26px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">{item.value}</div>
        {showHelp && item.help ? (
          <div
            ref={helpPanelRef}
            className="absolute right-3 top-full z-30 mt-2 w-[220px] rounded-xl bg-slate-950 px-3 py-2.5 text-[11px] leading-4 text-white shadow-2xl"
            onMouseEnter={() => setShowHelp(true)}
            onMouseLeave={() => setShowHelp(false)}
          >
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-300">{item.label}</div>
            {item.help}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.delta !== undefined && item.delta !== null ? (
            <div
              className={[
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                rising ? "bg-emerald-50 text-emerald-700" : falling ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500",
              ].join(" ")}
            >
              {rising ? <ArrowUpRight className="h-3 w-3" /> : falling ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {fmtDelta(item.delta)}
            </div>
          ) : null}
          {item.prevSessionLabel ? <span className="text-[10px] text-slate-400">vs {item.prevSessionLabel}</span> : null}
        </div>
        {item.note ? <div className="mt-1.5 text-[11px] text-slate-400 leading-snug">{item.note}</div> : null}
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
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              title=""
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
            {bundle.callout ? (
              <div
                className={[
                  "mb-3 rounded-lg border px-3 py-2 text-xs leading-5",
                  bundle.callout.tone === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-sky-200 bg-sky-50 text-sky-900",
                ].join(" ")}
              >
                {bundle.callout.text}
              </div>
            ) : null}
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

// ─── Primary Level PTR by School Type (ported from General Overview chart 2) ──
function buildPupilTeacherRatioBySchoolTypeChart(
  rows: TeacherCapacityRow[],
  filters: MinisterFilters,
): LocationChartResult | null {
  const primaryRows = rows.filter((row) => normalizeTeacherSchoolLevel(row.school_level) === "Pre/Primary");
  const resolved = resolveLocationRows(primaryRows, filters, "state");
  const bucket = new Map<string, {
    students: number;
    teachers: number;
    publicStudents: number;
    publicTeachers: number;
    privateStudents: number;
    privateTeachers: number;
  }>();

  resolved.rows.forEach((row) => {
    const label = locationLabel(row, resolved.level);
    if (!label) return;
    const previous = bucket.get(label) ?? {
      students: 0,
      teachers: 0,
      publicStudents: 0,
      publicTeachers: 0,
      privateStudents: 0,
      privateTeachers: 0,
    };
    const students = safeNum(row.student_count);
    const teachers = safeNum(row.teacher_count);
    previous.students += students;
    previous.teachers += teachers;
    if (row.school_type === "Public") {
      previous.publicStudents += students;
      previous.publicTeachers += teachers;
    } else if (row.school_type === "Private") {
      previous.privateStudents += students;
      previous.privateTeachers += teachers;
    }
    bucket.set(label, previous);
  });

  const grouped = Array.from(bucket.entries())
    .map(([label, totals]) => ({
      label,
      students: totals.students,
      teachers: totals.teachers,
      ratio: weightedRatio(totals.students, totals.teachers),
      publicRatio: weightedRatio(totals.publicStudents, totals.publicTeachers),
      privateRatio: weightedRatio(totals.privateStudents, totals.privateTeachers),
      publicStudents: totals.publicStudents,
      publicTeachers: totals.publicTeachers,
      privateStudents: totals.privateStudents,
      privateTeachers: totals.privateTeachers,
    }))
    .filter((item) => item.teachers > 0)
    .sort((a, b) => b.ratio - a.ratio);

  if (!grouped.length) return null;

  const height = Math.max(360, grouped.length * 28 + 96);
  const maxStackedRatio = Math.max(...grouped.map((item) => item.publicRatio + item.privateRatio), UBEC_PRIMARY_BENCHMARK.value, 0);

  const data: PlotDatum[] = [
    {
      type: "bar",
      orientation: "h",
      name: "Public",
      x: grouped.map((item) => item.publicRatio),
      y: grouped.map((item) => item.label),
      marker: { color: "#16a34a", line: { width: 0 } },
      text: grouped.map((item) => (item.publicTeachers > 0 ? fmtRatio(item.publicRatio) : "")),
      textposition: "inside",
      insidetextanchor: "middle",
      textfont: { color: "#ffffff", size: 11 },
      constraintext: "none",
      cliponaxis: false,
      customdata: grouped.map((item) => [item.label, Math.round(item.publicRatio), item.publicStudents, item.publicTeachers]),
      hovertemplate: "<b>%{customdata[0]}</b><br>Public PTR: %{customdata[1]}:1<br>Public students: %{customdata[2]:,.0f}<br>Public teachers: %{customdata[3]:,.0f}<extra></extra>",
      showlegend: false,
    },
    {
      type: "bar",
      orientation: "h",
      name: "Private",
      x: grouped.map((item) => item.privateRatio),
      y: grouped.map((item) => item.label),
      marker: { color: "#2563eb", line: { width: 0 } },
      text: grouped.map((item) => (item.privateTeachers > 0 ? fmtRatio(item.privateRatio) : "")),
      textposition: "inside",
      insidetextanchor: "middle",
      textfont: { color: "#ffffff", size: 11 },
      constraintext: "none",
      cliponaxis: false,
      customdata: grouped.map((item) => [item.label, Math.round(item.privateRatio), item.privateStudents, item.privateTeachers]),
      hovertemplate: "<b>%{customdata[0]}</b><br>Private PTR: %{customdata[1]}:1<br>Private students: %{customdata[2]:,.0f}<br>Private teachers: %{customdata[3]:,.0f}<extra></extra>",
      showlegend: false,
    },
  ];

  const layout = buildCommonLayout(height);
  layout.uirevision = `teacher-capacity-ptr-school-type-${resolved.level}-${grouped.length}`;
  layout.margin = { l: 126, r: 28, t: 22, b: 30 };
  layout.barmode = "stack";
  layout.xaxis = {
    range: [0, maxStackedRatio * 1.18],
    gridcolor: COLORS.grid,
    zeroline: false,
    tickfont: { color: COLORS.sub },
    tick0: 0,
    dtick: 5,
    title: { text: "Pupils per teacher" },
  };
  layout.yaxis = {
    automargin: true,
    autorange: "reversed",
    tickfont: { color: COLORS.sub },
    showgrid: false,
  };
  layout.shapes = [];
  layout.annotations = [];

  return {
    level: resolved.level,
    bundle: {
      data,
      layout,
      scrollable: true,
      scrollMaxHeight: 380,
      expandedMaxHeight: 420,
      expandedWidthClass: "max-w-[920px]",
      fixedLegend: [
        { label: "Public", color: "#16a34a" },
        { label: "Private", color: "#2563eb" },
        { label: `UBE Pre-Primary/Primary benchmark ${fmtRatio(UBEC_PRIMARY_BENCHMARK.value)}`, color: COLORS.benchmark, dashed: true },
      ],
    },
  };
}

const UBEC_PRIMARY_BENCHMARK: BenchmarkMeta = {
  value: 35,
  label: "UBE Pre-Primary/Primary benchmark (1:35)",
  source: "UBE national PTR guidelines",
};



function buildPublicPrivateByLocationChart(
  rows: TeacherCapacityRow[],
  filters: MinisterFilters,
  valueKey: "teacher_count" | "student_count",
  legendLabel: "Teachers" | "Students",
  labelOrder?: string[],
): LocationChartResult | null {
  const resolved = resolveLocationRows(rows, filters, "state");
  const bucket = new Map<string, { publicValue: number; privateValue: number }>();

  resolved.rows.forEach((row) => {
    const label = locationLabel(row, resolved.level);
    if (!label) return;
    const previous = bucket.get(label) ?? { publicValue: 0, privateValue: 0 };
    const delta = safeNum(row[valueKey]);

    if (row.school_type === "Private") {
      previous.privateValue += delta;
    } else {
      previous.publicValue += delta;
    }

    bucket.set(label, previous);
  });

  const grouped = Array.from(bucket.entries())
    .map(([label, totals]) => ({ label, ...totals, total: totals.publicValue + totals.privateValue }))
    .filter((item) => item.total > 0)
    .sort((a, b) => {
      if (labelOrder?.length) {
        const ai = labelOrder.indexOf(a.label);
        const bi = labelOrder.indexOf(b.label);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
      }
      return b.total - a.total;
    });

  if (!grouped.length) return null;

  const isScrollable = true;
  const height = Math.max(500, grouped.length * 40 + 130);

  const data: PlotDatum[] = [
    {
      type: "bar",
      orientation: "h",
      name: "Public",
      x: grouped.map((item) => item.publicValue),
      y: grouped.map((item) => item.label),
      marker: { color: COLORS.public, line: { width: 0 } },
      text: grouped.map((item) => (item.publicValue > 0 ? fmtInt(item.publicValue) : "")),
      texttemplate: "%{text}",
      textposition: "inside",
      textfont: { color: "#ffffff", size: 11 },
      customdata: grouped.map((item) => [item.label, item.publicValue, item.total]),
      hovertemplate: `<b>%{customdata[0]}</b><br>Public ${legendLabel}: %{customdata[1]:,.0f}<br>Total ${legendLabel}: %{customdata[2]:,.0f}<extra></extra>`,
      showlegend: false,
    },
    {
      type: "bar",
      orientation: "h",
      name: "Private",
      x: grouped.map((item) => item.privateValue),
      y: grouped.map((item) => item.label),
      marker: { color: COLORS.private, line: { width: 0 } },
      text: grouped.map((item) => (item.privateValue > 0 ? fmtInt(item.privateValue) : "")),
      texttemplate: "%{text}",
      textposition: "inside",
      textfont: { color: "#ffffff", size: 11 },
      customdata: grouped.map((item) => [item.label, item.privateValue, item.total]),
      hovertemplate: `<b>%{customdata[0]}</b><br>Private ${legendLabel}: %{customdata[1]:,.0f}<br>Total ${legendLabel}: %{customdata[2]:,.0f}<extra></extra>`,
      showlegend: false,
    },
  ];

  const layout = buildCommonLayout(height);
  layout.uirevision = `teacher-capacity-${valueKey}-${resolved.level}-${grouped.length}`;
  layout.barmode = "stack";
  layout.margin = { l: 132, r: 30, t: 22, b: 42 };
  layout.xaxis = {
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

  return {
    level: resolved.level,
    bundle: {
      data,
      layout,
      scrollable: isScrollable,
      scrollMaxHeight: 340,
      expandedMaxHeight: 400,
      expandedWidthClass: "max-w-[920px]",
      fixedLegend: [
        { label: `Public ${legendLabel}`, color: COLORS.public },
        { label: `Private ${legendLabel}`, color: COLORS.private },
      ],
    },
  };
}

function buildQualifiedUnqualifiedByLocationChart(rows: TeacherCapacityRow[], filters: MinisterFilters): LocationChartResult | null {
  const resolved = resolveLocationRows(rows, filters, "state");
  const bucket = new Map<string, { qualified: number; unqualified: number }>();

  resolved.rows.forEach((row) => {
    const label = locationLabel(row, resolved.level);
    if (!label) return;
    const previous = bucket.get(label) ?? { qualified: 0, unqualified: 0 };
    if (row.qualification_status === "Unqualified") {
      previous.unqualified += safeNum(row.teacher_count);
    } else {
      previous.qualified += safeNum(row.teacher_count);
    }
    bucket.set(label, previous);
  });

  const grouped = Array.from(bucket.entries())
    .map(([label, totals]) => {
      const total = totals.qualified + totals.unqualified;
      return {
        label,
        qualified: totals.qualified,
        unqualified: totals.unqualified,
        qualifiedRate: weightedRate(totals.qualified, total),
        unqualifiedRate: weightedRate(totals.unqualified, total),
        total,
      };
    })
    .filter((item) => item.total > 0)
    .sort((a, b) => b.qualifiedRate - a.qualifiedRate);

  if (!grouped.length) return null;

  const isScrollable = true;
  const height = Math.max(500, grouped.length * 40 + 130);
  const maxTotal = Math.max(...grouped.map((item) => item.total), 0);

  const data: PlotDatum[] = [
    {
      type: "bar",
      orientation: "h",
      x: grouped.map((item) => item.qualified),
      y: grouped.map((item) => item.label),
      marker: { color: COLORS.qualified, line: { width: 0 } },
      text: grouped.map((item) => (item.qualified > 0 ? fmtInt(item.qualified) : "")),
      textposition: "inside",
      insidetextanchor: "middle",
      textfont: { color: "#ffffff", size: 11 },
      customdata: grouped.map((item) => [item.label, item.qualified, item.total, Math.round(item.qualifiedRate)]),
      hovertemplate:
        "<b>%{customdata[0]}</b><br>Qualified Teachers: %{customdata[1]:,.0f}<br>Qualified Rate: %{customdata[3]}%<br>Total Teachers: %{customdata[2]:,.0f}<extra></extra>",
      showlegend: false,
    },
    {
      type: "bar",
      orientation: "h",
      x: grouped.map((item) => item.unqualified),
      y: grouped.map((item) => item.label),
      marker: { color: COLORS.unqualified, line: { width: 0 } },
      text: grouped.map((item) => (item.unqualified > 0 ? fmtInt(item.unqualified) : "")),
      textposition: "inside",
      insidetextanchor: "middle",
      textfont: { color: "#ffffff", size: 11 },
      customdata: grouped.map((item) => [item.label, item.unqualified, item.total, Math.round(item.unqualifiedRate)]),
      hovertemplate:
        "<b>%{customdata[0]}</b><br>Unqualified Teachers: %{customdata[1]:,.0f}<br>Unqualified Rate: %{customdata[3]}%<br>Total Teachers: %{customdata[2]:,.0f}<extra></extra>",
      showlegend: false,
    },
  ];

  const layout = buildCommonLayout(height);
  layout.uirevision = `teacher-capacity-qualification-state-${resolved.level}-${grouped.length}`;
  layout.barmode = "stack";
  layout.margin = { l: 132, r: 30, t: 22, b: 42 };
  layout.xaxis = {
    range: [0, Math.ceil(maxTotal * 1.08)],
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

  return {
    level: resolved.level,
    bundle: {
      data,
      layout,
      scrollable: isScrollable,
      scrollMaxHeight: 340,
      expandedMaxHeight: 400,
      expandedWidthClass: "max-w-[940px]",
      fixedLegend: [
        { label: "Qualified", color: COLORS.qualified },
        { label: "Unqualified", color: COLORS.unqualified },
      ],
    },
  };
}

function buildPupilTeacherRatioBySchoolLevel(rows: TeacherCapacityRow[]): ChartBundle | null {
  const bucket = new Map<string, { publicStudents: number; publicTeachers: number; privateStudents: number; privateTeachers: number }>();

  rows.forEach((row) => {
    const level = normalizeTeacherSchoolLevel(row.school_level);
    if (!level) return;
    const previous = bucket.get(level) ?? { publicStudents: 0, publicTeachers: 0, privateStudents: 0, privateTeachers: 0 };
    if (row.school_type === "Private") {
      previous.privateStudents += safeNum(row.student_count);
      previous.privateTeachers += safeNum(row.teacher_count);
    } else {
      previous.publicStudents += safeNum(row.student_count);
      previous.publicTeachers += safeNum(row.teacher_count);
    }
    bucket.set(level, previous);
  });

  const orderedLevels = SCHOOL_LEVEL_ORDER.filter((level) => bucket.has(level));
  if (!orderedLevels.length) return null;

  const publicRatios = orderedLevels.map((level) => {
    const item = bucket.get(level);
    return weightedRatio(item?.publicStudents ?? 0, item?.publicTeachers ?? 0);
  });
  const privateRatios = orderedLevels.map((level) => {
    const item = bucket.get(level);
    return weightedRatio(item?.privateStudents ?? 0, item?.privateTeachers ?? 0);
  });

  const benchmarkLines = [
    { key: "preprimary", label: "UBE Pre/Primary Benchmark (35:1)", value: 35, color: COLORS.public },
    { key: "secondary", label: "UBE JSS/SSS Benchmark (40:1)", value: 40, color: COLORS.benchmark },
  ];

  const maxRatio = Math.max(...publicRatios, ...privateRatios, ...benchmarkLines.map((item) => item.value), 0);
  const layout = buildCommonLayout(360);
  layout.uirevision = `teacher-capacity-ptr-level-${orderedLevels.join("|")}`;
  layout.barmode = "group";
  layout.margin = { l: 60, r: 24, t: 30, b: 58 };
  layout.xaxis = { tickfont: { color: COLORS.sub } };
  layout.yaxis = {
    range: [0, Math.ceil((maxRatio + 8) / 5) * 5],
    gridcolor: COLORS.grid,
    zeroline: false,
    tickfont: { color: COLORS.sub },
    tick0: 0,
    dtick: 5,
  };
  layout.shapes = [];
  layout.annotations = [];

  return {
    data: [
      {
        type: "bar",
        x: orderedLevels,
        y: publicRatios,
        name: "Public",
        marker: { color: COLORS.public },
        text: publicRatios.map((value) => fmtRatio(value)),
        textposition: "outside",
        cliponaxis: false,
        customdata: orderedLevels.map((level, index) => [level, Math.round(publicRatios[index] ?? 0)]),
        hovertemplate: "<b>%{customdata[0]}</b><br>Public PTR: %{customdata[1]}:1<extra></extra>",
        showlegend: false,
      },
      {
        type: "bar",
        x: orderedLevels,
        y: privateRatios,
        name: "Private",
        marker: { color: COLORS.private },
        text: privateRatios.map((value) => fmtRatio(value)),
        textposition: "outside",
        cliponaxis: false,
        customdata: orderedLevels.map((level, index) => [level, Math.round(privateRatios[index] ?? 0)]),
        hovertemplate: "<b>%{customdata[0]}</b><br>Private PTR: %{customdata[1]}:1<extra></extra>",
        showlegend: false,
      },
    ],
    layout,
    fixedLegend: [
      { label: "Public PTR", color: COLORS.public },
      { label: "Private PTR", color: COLORS.private },
      { label: "UBE Pre/Primary Benchmark (35:1)", color: COLORS.schoolLevelPrimary, fullRow: true },
      { label: "UBE JSS/SSS Benchmark (40:1)", color: COLORS.benchmark, fullRow: true },
    ],
  };
}

function buildTeacherSplitBySchoolLevel(rows: TeacherCapacityRow[]): ChartBundle | null {
  const bucket = new Map<string, { publicTeachers: number; privateTeachers: number }>();

  rows.forEach((row) => {
    const level = normalizeTeacherSchoolLevel(row.school_level);
    if (!level) return;
    const previous = bucket.get(level) ?? { publicTeachers: 0, privateTeachers: 0 };
    if (row.school_type === "Private") {
      previous.privateTeachers += safeNum(row.teacher_count);
    } else {
      previous.publicTeachers += safeNum(row.teacher_count);
    }
    bucket.set(level, previous);
  });

  const orderedLevels = SCHOOL_LEVEL_ORDER.filter((level) => bucket.has(level));
  if (!orderedLevels.length) return null;

  const layout = buildCommonLayout(360);
  layout.uirevision = `teacher-capacity-teacher-level-${orderedLevels.join("|")}`;
  layout.barmode = "group";
  layout.margin = { l: 60, r: 20, t: 22, b: 58 };
  layout.xaxis = { tickfont: { color: COLORS.sub } };
  layout.yaxis = { gridcolor: COLORS.grid, zeroline: false, tickfont: { color: COLORS.sub }, separatethousands: true };

  return {
    data: [
      {
        type: "bar",
        x: orderedLevels,
        y: orderedLevels.map((level) => bucket.get(level)?.publicTeachers ?? 0),
        marker: { color: COLORS.public },
        text: orderedLevels.map((level) => fmtInt(bucket.get(level)?.publicTeachers ?? 0)),
        textposition: "outside",
        cliponaxis: false,
        customdata: orderedLevels.map((level) => [level, bucket.get(level)?.publicTeachers ?? 0]),
        hovertemplate: "<b>%{customdata[0]}</b><br>Public Teachers: %{customdata[1]:,.0f}<extra></extra>",
        showlegend: false,
      },
      {
        type: "bar",
        x: orderedLevels,
        y: orderedLevels.map((level) => bucket.get(level)?.privateTeachers ?? 0),
        marker: { color: COLORS.private },
        text: orderedLevels.map((level) => fmtInt(bucket.get(level)?.privateTeachers ?? 0)),
        textposition: "outside",
        cliponaxis: false,
        customdata: orderedLevels.map((level) => [level, bucket.get(level)?.privateTeachers ?? 0]),
        hovertemplate: "<b>%{customdata[0]}</b><br>Private Teachers: %{customdata[1]:,.0f}<extra></extra>",
        showlegend: false,
      },
    ],
    layout,
    fixedLegend: [
      { label: "Public Teachers", color: COLORS.public },
      { label: "Private Teachers", color: COLORS.private },
    ],
  };
}

function buildQualificationGroupDonut(rows: TeacherCapacityRow[]): ChartBundle | null {
  const bucket = new Map<string, number>();

  rows.forEach((row) => {
    const label = row.qualification_group || "Unknown";
    bucket.set(label, (bucket.get(label) ?? 0) + safeNum(row.teacher_count));
  });

  const grouped = orderedUnique(Array.from(bucket.keys()), QUALIFICATION_GROUP_ORDER)
    .map((label) => ({ label, value: bucket.get(label) ?? 0 }))
    .filter((item) => item.value > 0);

  if (!grouped.length) return null;

  const positions = [0.82, 0.70, 0.58, 0.46, 0.34, 0.22];
  const layout = buildCommonLayout(380);
  layout.margin = { l: 8, r: 8, t: 10, b: 10 };
  layout.showlegend = false;
  layout.xaxis = { visible: false };
  layout.yaxis = { visible: false };
  layout.shapes = positions.slice(0, Math.max(0, grouped.length - 1)).map((y) => ({
    type: "line",
    xref: "paper",
    yref: "paper",
    x0: 0.48,
    x1: 0.98,
    y0: y - 0.06,
    y1: y - 0.06,
    line: { color: "rgba(148,163,184,0.25)", width: 1 },
  }));
  layout.annotations = grouped.flatMap((item, index) => {
    return [
      {
        x: 0.50,
        y: positions[index] ?? 0.2,
        xref: "paper",
        yref: "paper",
        showarrow: false,
        xanchor: "left",
        align: "left",
        text: `<span style="color:${QUALIFICATION_GROUP_COLORS[index]}">●</span> ${item.label}`,
        font: { size: 12, color: COLORS.text },
      },
      {
        x: 0.88,
        y: positions[index] ?? 0.2,
        xref: "paper",
        yref: "paper",
        showarrow: false,
        xanchor: "right",
        align: "right",
        text: `<b>${fmtInt(item.value)}</b>`,
        font: { size: 12, color: COLORS.text },
      },
    ];
  });

  return {
    data: [
      {
        type: "pie",
        labels: grouped.map((item) => item.label),
        values: grouped.map((item) => item.value),
        hole: 0.62,
        sort: false,
        direction: "clockwise",
        marker: {
          colors: grouped.map((_, index) => QUALIFICATION_GROUP_COLORS[index] ?? COLORS.public),
          line: { color: "#ffffff", width: 4 },
        },
        textinfo: "percent",
        textposition: "inside",
        insidetextorientation: "radial",
        textfont: { color: "#ffffff", size: 11 },
        hovertemplate: "<b>%{label}</b><br>Teachers: %{value:,.0f}<br>Share: %{percent}<extra></extra>",
        showlegend: false,
        domain: { x: [0.03, 0.50], y: [0.16, 0.94] },
      },
    ],
    layout,
  };
}

function buildQualificationCompositionDonut(rows: TeacherCapacityRow[]): ChartBundle | null {
  const qualified = rows
    .filter((row) => row.qualification_status === "Qualified")
    .reduce((sum, row) => sum + safeNum(row.teacher_count), 0);
  const unqualified = rows
    .filter((row) => row.qualification_status === "Unqualified")
    .reduce((sum, row) => sum + safeNum(row.teacher_count), 0);

  if (qualified + unqualified <= 0) return null;

  const layout = buildCommonLayout(380);
  layout.margin = { l: 8, r: 8, t: 10, b: 10 };
  layout.showlegend = false;
  layout.xaxis = { visible: false };
  layout.yaxis = { visible: false };
  layout.shapes = [0.64].map((y) => ({
    type: "line",
    xref: "paper",
    yref: "paper",
    x0: 0.48,
    x1: 0.98,
    y0: y,
    y1: y,
    line: { color: "rgba(148,163,184,0.25)", width: 1 },
  }));
  layout.annotations = [
    {
      x: 0.50,
      y: 0.72,
      xref: "paper",
      yref: "paper",
      showarrow: false,
      xanchor: "left",
      align: "left",
      text: `<span style="color:${COLORS.qualified}">●</span> Qualified`,
      font: { size: 12, color: COLORS.text },
    },
    {
      x: 0.88,
      y: 0.72,
      xref: "paper",
      yref: "paper",
      showarrow: false,
      xanchor: "right",
      align: "right",
      text: `<b>${fmtInt(qualified)}</b>`,
      font: { size: 12, color: COLORS.text },
    },
    {
      x: 0.50,
      y: 0.50,
      xref: "paper",
      yref: "paper",
      showarrow: false,
      xanchor: "left",
      align: "left",
      text: `<span style="color:${COLORS.unqualified}">●</span> Unqualified`,
      font: { size: 12, color: COLORS.text },
    },
    {
      x: 0.88,
      y: 0.50,
      xref: "paper",
      yref: "paper",
      showarrow: false,
      xanchor: "right",
      align: "right",
      text: `<b>${fmtInt(unqualified)}</b>`,
      font: { size: 12, color: COLORS.text },
    },
  ];

  return {
    data: [
      {
        type: "pie",
        labels: ["Qualified", "Unqualified"],
        values: [qualified, unqualified],
        hole: 0.62,
        sort: false,
        marker: { colors: [COLORS.qualified, COLORS.unqualified], line: { color: "#ffffff", width: 4 } },
        textinfo: "percent",
        textposition: "inside",
        insidetextorientation: "radial",
        textfont: { color: "#ffffff", size: 11 },
        hovertemplate: "<b>%{label}</b><br>Teachers: %{value:,.0f}<br>Share: %{percent}<extra></extra>",
        showlegend: false,
        domain: { x: [0.03, 0.50], y: [0.16, 0.94] },
      },
    ],
    layout,
    fixedLegend: [
      { label: "Qualified", color: COLORS.qualified },
      { label: "Unqualified", color: COLORS.unqualified },
    ],
    callout: {
      text: "Qualified teacher = at least NCE, BEd, or both.",
      tone: "warning",
    },
  };
}

function buildQualifiedRateByGender(rows: TeacherCapacityRow[]): ChartBundle | null {
  const bucket = new Map<string, { qualified: number; unqualified: number }>();

  rows.forEach((row) => {
    const label = row.gender || "Unknown";
    const previous = bucket.get(label) ?? { qualified: 0, unqualified: 0 };
    if (row.qualification_status === "Unqualified") {
      previous.unqualified += safeNum(row.teacher_count);
    } else {
      previous.qualified += safeNum(row.teacher_count);
    }
    bucket.set(label, previous);
  });

  const ordered = GENDER_ORDER.filter((label) => bucket.has(label));
  if (!ordered.length) return null;

  const qualifiedRates = ordered.map((label) => {
    const item = bucket.get(label);
    const total = safeNum(item?.qualified) + safeNum(item?.unqualified);
    return weightedRate(safeNum(item?.qualified), total);
  });
  const unqualifiedRates = ordered.map((label) => {
    const item = bucket.get(label);
    const total = safeNum(item?.qualified) + safeNum(item?.unqualified);
    return weightedRate(safeNum(item?.unqualified), total);
  });
  const maxRate = percentAxisMax([...qualifiedRates, ...unqualifiedRates]);

  const layout = buildCommonLayout(330);
  layout.uirevision = `teacher-capacity-gender-${ordered.join("|")}`;
  layout.barmode = "group";
  layout.margin = { l: 60, r: 20, t: 22, b: 42 };
  layout.xaxis = { tickfont: { color: COLORS.sub } };
  layout.yaxis = { range: [0, maxRate], gridcolor: COLORS.grid, zeroline: false, tickfont: { color: COLORS.sub }, ticksuffix: "%" };

  return {
    data: [
      {
        type: "bar",
        x: ordered,
        y: qualifiedRates,
        marker: { color: COLORS.qualified },
        text: ordered.map((label) => fmtInt(bucket.get(label)?.qualified ?? 0)),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "#ffffff", size: 11 },
        cliponaxis: false,
        customdata: ordered.map((label, index) => [label, bucket.get(label)?.qualified ?? 0, qualifiedRates[index]]),
        hovertemplate: "<b>%{customdata[0]}</b><br>Qualified Teachers: %{customdata[1]:,.0f}<br>Qualified Rate: %{customdata[2]:.0f}%<extra></extra>",
        showlegend: false,
        offsetgroup: "qualified",
      },
      {
        type: "bar",
        x: ordered,
        y: qualifiedRates,
        marker: { color: "rgba(0,0,0,0)" },
        text: qualifiedRates.map((value) => fmtPercent(value)),
        textposition: "outside",
        textfont: { color: COLORS.text, size: 11 },
        cliponaxis: false,
        hoverinfo: "skip",
        showlegend: false,
        offsetgroup: "qualified",
      },
      {
        type: "bar",
        x: ordered,
        y: unqualifiedRates,
        marker: { color: COLORS.unqualified },
        text: ordered.map((label) => fmtInt(bucket.get(label)?.unqualified ?? 0)),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "#ffffff", size: 11 },
        cliponaxis: false,
        customdata: ordered.map((label, index) => [label, bucket.get(label)?.unqualified ?? 0, unqualifiedRates[index]]),
        hovertemplate: "<b>%{customdata[0]}</b><br>Unqualified Teachers: %{customdata[1]:,.0f}<br>Unqualified Rate: %{customdata[2]:.0f}%<extra></extra>",
        showlegend: false,
        offsetgroup: "unqualified",
      },
      {
        type: "bar",
        x: ordered,
        y: unqualifiedRates,
        marker: { color: "rgba(0,0,0,0)" },
        text: unqualifiedRates.map((value) => fmtPercent(value)),
        textposition: "outside",
        textfont: { color: COLORS.text, size: 11 },
        cliponaxis: false,
        hoverinfo: "skip",
        showlegend: false,
        offsetgroup: "unqualified",
      },
    ],
    layout,
    fixedLegend: [
      { label: "Qualified", color: COLORS.qualified },
      { label: "Unqualified", color: COLORS.unqualified },
    ],
  };
}

function buildQualifiedRateBySchoolType(rows: TeacherCapacityRow[]): ChartBundle | null {
  const bucket = new Map<string, { qualified: number; unqualified: number }>();

  rows.forEach((row) => {
    const label = row.school_type || "Unknown";
    const previous = bucket.get(label) ?? { qualified: 0, unqualified: 0 };
    if (row.qualification_status === "Unqualified") {
      previous.unqualified += safeNum(row.teacher_count);
    } else {
      previous.qualified += safeNum(row.teacher_count);
    }
    bucket.set(label, previous);
  });

  const ordered = SCHOOL_TYPE_ORDER.filter((label) => bucket.has(label));
  if (!ordered.length) return null;

  const qualifiedRates = ordered.map((label) => {
    const item = bucket.get(label);
    const total = safeNum(item?.qualified) + safeNum(item?.unqualified);
    return weightedRate(safeNum(item?.qualified), total);
  });
  const unqualifiedRates = ordered.map((label) => {
    const item = bucket.get(label);
    const total = safeNum(item?.qualified) + safeNum(item?.unqualified);
    return weightedRate(safeNum(item?.unqualified), total);
  });
  const maxRate = percentAxisMax([...qualifiedRates, ...unqualifiedRates]);

  const layout = buildCommonLayout(330);
  layout.uirevision = `teacher-capacity-schooltype-${ordered.join("|")}`;
  layout.barmode = "group";
  layout.margin = { l: 60, r: 20, t: 22, b: 42 };
  layout.xaxis = { tickfont: { color: COLORS.sub } };
  layout.yaxis = { range: [0, maxRate], gridcolor: COLORS.grid, zeroline: false, tickfont: { color: COLORS.sub }, ticksuffix: "%" };

  return {
    data: [
      {
        type: "bar",
        x: ordered,
        y: qualifiedRates,
        marker: { color: COLORS.qualified },
        text: ordered.map((label) => fmtInt(bucket.get(label)?.qualified ?? 0)),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "#ffffff", size: 11 },
        cliponaxis: false,
        customdata: ordered.map((label, index) => [label, bucket.get(label)?.qualified ?? 0, qualifiedRates[index]]),
        hovertemplate: "<b>%{customdata[0]}</b><br>Qualified Teachers: %{customdata[1]:,.0f}<br>Qualified Rate: %{customdata[2]:.0f}%<extra></extra>",
        showlegend: false,
        offsetgroup: "qualified",
      },
      {
        type: "bar",
        x: ordered,
        y: qualifiedRates,
        marker: { color: "rgba(0,0,0,0)" },
        text: qualifiedRates.map((value) => fmtPercent(value)),
        textposition: "outside",
        textfont: { color: COLORS.text, size: 11 },
        cliponaxis: false,
        hoverinfo: "skip",
        showlegend: false,
        offsetgroup: "qualified",
      },
      {
        type: "bar",
        x: ordered,
        y: unqualifiedRates,
        marker: { color: COLORS.unqualified },
        text: ordered.map((label) => fmtInt(bucket.get(label)?.unqualified ?? 0)),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "#ffffff", size: 11 },
        cliponaxis: false,
        customdata: ordered.map((label, index) => [label, bucket.get(label)?.unqualified ?? 0, unqualifiedRates[index]]),
        hovertemplate: "<b>%{customdata[0]}</b><br>Unqualified Teachers: %{customdata[1]:,.0f}<br>Unqualified Rate: %{customdata[2]:.0f}%<extra></extra>",
        showlegend: false,
        offsetgroup: "unqualified",
      },
      {
        type: "bar",
        x: ordered,
        y: unqualifiedRates,
        marker: { color: "rgba(0,0,0,0)" },
        text: unqualifiedRates.map((value) => fmtPercent(value)),
        textposition: "outside",
        textfont: { color: COLORS.text, size: 11 },
        cliponaxis: false,
        hoverinfo: "skip",
        showlegend: false,
        offsetgroup: "unqualified",
      },
    ],
    layout,
    fixedLegend: [
      { label: "Qualified", color: COLORS.qualified },
      { label: "Unqualified", color: COLORS.unqualified },
    ],
  };
}

function buildQualificationTrend(rows: TeacherCapacityRow[], dimSessions: DimSession[]): ChartBundle | null {
  const bucket = new Map<string, { qualified: number; unqualified: number; total: number }>();

  rows.forEach((row) => {
    const previous = bucket.get(row.session) ?? { qualified: 0, unqualified: 0, total: 0 };
    const teachers = safeNum(row.teacher_count);
    previous.total += teachers;
    if (row.qualification_status === "Qualified") {
      previous.qualified += teachers;
    } else {
      previous.unqualified += teachers;
    }
    bucket.set(row.session, previous);
  });

  const orderedSessions = dimSessions.map((row) => row.session_id).filter((session) => bucket.has(session)).slice(-4);
  if (!orderedSessions.length) return null;

  const qualifiedRates = orderedSessions.map((session) => {
    const item = bucket.get(session);
    return weightedRate(item?.qualified ?? 0, item?.total ?? 0);
  });
  const unqualifiedRates = orderedSessions.map((session) => {
    const item = bucket.get(session);
    return weightedRate(item?.unqualified ?? 0, item?.total ?? 0);
  });
  const qualifiedCounts = orderedSessions.map((session) => bucket.get(session)?.qualified ?? 0);
  const unqualifiedCounts = orderedSessions.map((session) => bucket.get(session)?.unqualified ?? 0);

  const layout = buildCommonLayout(360);
  layout.uirevision = `teacher-capacity-trend-${orderedSessions.join("|")}`;
  layout.margin = { l: 64, r: 24, t: 18, b: 72 };
  layout.xaxis = {
    tickfont: { color: COLORS.sub },
    type: "category",
    categoryorder: "array",
    categoryarray: orderedSessions,
    tickangle: -20,
  };
  layout.yaxis = {
    range: [0, percentAxisMax([...qualifiedRates, ...unqualifiedRates])],
    gridcolor: COLORS.grid,
    zeroline: false,
    tickfont: { color: COLORS.sub },
    ticksuffix: "%",
  };

  return {
    data: [
      {
        type: "scatter",
        mode: "lines+markers+text",
        x: orderedSessions,
        y: qualifiedRates,
        line: { color: COLORS.qualified, width: 3 },
        marker: { color: COLORS.qualified, size: 8 },
        text: qualifiedRates.map((value) => fmtPercent(value)),
        textposition: qualifiedRates.map((_, index) => (index % 2 === 0 ? "top center" : "bottom center")),
        customdata: orderedSessions.map((session, index) => [session, qualifiedCounts[index], Math.round(qualifiedRates[index] ?? 0)]),
        hovertemplate:
          "<b>%{customdata[0]}</b><br>Qualified Teachers: %{customdata[1]:,.0f}<br>Qualified Rate: %{customdata[2]}%<extra></extra>",
        name: "Qualified",
        showlegend: false,
      },
      {
        type: "scatter",
        mode: "lines+markers+text",
        x: orderedSessions,
        y: unqualifiedRates,
        line: { color: COLORS.unqualified, width: 3 },
        marker: { color: COLORS.unqualified, size: 8 },
        text: unqualifiedRates.map((value) => fmtPercent(value)),
        textposition: unqualifiedRates.map((_, index) => (index % 2 === 0 ? "bottom center" : "top center")),
        customdata: orderedSessions.map((session, index) => [session, unqualifiedCounts[index], Math.round(unqualifiedRates[index] ?? 0)]),
        hovertemplate:
          "<b>%{customdata[0]}</b><br>Unqualified Teachers: %{customdata[1]:,.0f}<br>Unqualified Rate: %{customdata[2]}%<extra></extra>",
        name: "Unqualified",
        showlegend: false,
      },
    ],
    layout,
    fixedLegend: [
      { label: "Qualified Rate", color: COLORS.qualified },
      { label: "Unqualified Rate", color: COLORS.unqualified },
    ],
  };
}

export default function TeacherCapacityDashboard({
  filters,
  setFilters,
  dimSessions,
  disabilityMode = false,
}: {
  filters: MinisterFilters;
  setFilters: Dispatch<SetStateAction<MinisterFilters>>;
  dimSessions: DimSession[];
  disabilityMode?: boolean;
}) {
  const [rows, setRows] = useState<TeacherCapacityRow[]>([]);
  const [, setBenchmarks] = useState<TeacherBenchmarkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandState, setExpandState] = useState<ExpandState>(null);
  const expandedPanelRef = useRef<HTMLDivElement | null>(null);
  const requestedScopeKey = useMemo(
    () => `${canonicalState(filters.state)}|${filters.lga}|${filters.ward}|${filters.school}`,
    [filters.state, filters.lga, filters.ward, filters.school],
  );
  const [loadedScopeKey, setLoadedScopeKey] = useState(requestedScopeKey);
  const [loadedLocation, setLoadedLocation] = useState({
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

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const depth = scopeDepthForLocation(filters);

        const [teacherRows, benchmarkRows] = await Promise.all([
          loadRefinedScopedRows<TeacherCapacityRow>("teacher_capacity", filters.state, depth),
          loadRefinedFile<TeacherBenchmarkRow>("dimensions/dim_teacher_capacity_benchmarks.csv"),
        ]);

        if (!alive) return;

        setRows(filterRowsBySessionWindow(teacherRows, BASIC_SECONDARY_SESSIONS));
        setBenchmarks(benchmarkRows);
        setLoadedScopeKey(requestedScopeKey);
        setLoadedLocation({
          state: filters.state,
          lga: filters.lga,
          ward: filters.ward,
          school: filters.school,
        });
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load teacher capacity CSVs");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filters.state, filters.lga, filters.ward, filters.school, requestedScopeKey]);

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

  const filteredRowsRaw = useMemo(() => filterTeacherRows(rows, renderFilters, undefined, false), [rows, renderFilters]);
  const [lastNonEmptyFilteredRows, setLastNonEmptyFilteredRows] = useState<TeacherCapacityRow[]>([]);

  useEffect(() => {
    if (filteredRowsRaw.length) setLastNonEmptyFilteredRows(filteredRowsRaw);
  }, [filteredRowsRaw]);

  const filteredRows = useMemo(
    () => ((loading || scopePending) && !filteredRowsRaw.length && lastNonEmptyFilteredRows.length ? lastNonEmptyFilteredRows : filteredRowsRaw),
    [loading, scopePending, filteredRowsRaw, lastNonEmptyFilteredRows],
  );

  const teacherRows = filteredRows;

  const studentRows = useMemo(() => {
    if (!disabilityMode) return filteredRows;

    const disabilityScopedRows = filterTeacherRows(rows, renderFilters, undefined, true);
    return applyStudentDisabilityOverlay(filteredRows, disabilityScopedRows);
  }, [rows, renderFilters, filteredRows, disabilityMode]);

  const qualificationRows = filteredRows;


  const effectiveSession = useMemo(() => {
    if (filters.session) return filters.session;
    const sessions = Array.from(new Set(rows.map((row) => row.session))).filter(Boolean);
    const ordered = dimSessions.map((row) => row.session_id).filter((session) => sessions.includes(session));
    return ordered[ordered.length - 1] ?? sessions.sort().slice(-1)[0] ?? "";
  }, [rows, dimSessions, filters.session]);

  const previousSessionLabel = useMemo(() => {
    if (!effectiveSession) return "";
    return dimSessions.find((row) => row.session_id === effectiveSession)?.prev_session_id ?? "";
  }, [dimSessions, effectiveSession]);

  const currentTeacherRows = useMemo(() => (effectiveSession ? teacherRows.filter((row) => row.session === effectiveSession) : teacherRows), [teacherRows, effectiveSession]);
  const currentStudentRows = useMemo(() => (effectiveSession ? studentRows.filter((row) => row.session === effectiveSession) : studentRows), [studentRows, effectiveSession]);
  const previousTeacherRowsRaw = useMemo(() => {
    if (!previousSessionLabel) return [] as TeacherCapacityRow[];
    return filterTeacherRows(rows, { ...renderFilters, session: previousSessionLabel }, undefined, false);
  }, [rows, renderFilters, previousSessionLabel]);
  const [lastNonEmptyPreviousTeacherRows, setLastNonEmptyPreviousTeacherRows] = useState<TeacherCapacityRow[]>([]);

  useEffect(() => {
    if (previousTeacherRowsRaw.length) setLastNonEmptyPreviousTeacherRows(previousTeacherRowsRaw);
  }, [previousTeacherRowsRaw]);

  const previousTeacherRows = useMemo(
    () =>
      (loading || scopePending) && !previousTeacherRowsRaw.length && lastNonEmptyPreviousTeacherRows.length
        ? lastNonEmptyPreviousTeacherRows
        : previousTeacherRowsRaw,
    [loading, scopePending, previousTeacherRowsRaw, lastNonEmptyPreviousTeacherRows],
  );
  const previousDisabilityRowsRaw = useMemo(() => {
    if (!previousSessionLabel) return [] as TeacherCapacityRow[];
    return filterTeacherRows(rows, { ...renderFilters, session: previousSessionLabel }, undefined, true);
  }, [rows, renderFilters, previousSessionLabel]);
  const [lastNonEmptyPreviousDisabilityRows, setLastNonEmptyPreviousDisabilityRows] = useState<TeacherCapacityRow[]>([]);

  useEffect(() => {
    if (previousDisabilityRowsRaw.length) setLastNonEmptyPreviousDisabilityRows(previousDisabilityRowsRaw);
  }, [previousDisabilityRowsRaw]);

  const previousDisabilityRows = useMemo(
    () =>
      (loading || scopePending) && !previousDisabilityRowsRaw.length && lastNonEmptyPreviousDisabilityRows.length
        ? lastNonEmptyPreviousDisabilityRows
        : previousDisabilityRowsRaw,
    [loading, scopePending, previousDisabilityRowsRaw, lastNonEmptyPreviousDisabilityRows],
  );

  const previousStudentRows = useMemo(() => {
    if (!previousSessionLabel) return [] as TeacherCapacityRow[];
    if (!disabilityMode) return previousTeacherRows;
    return applyStudentDisabilityOverlay(previousTeacherRows, previousDisabilityRows);
  }, [previousSessionLabel, previousTeacherRows, previousDisabilityRows, disabilityMode]);

  const cards = useMemo<MetricCard[]>(() => {
    const totalTeachers = currentTeacherRows.reduce((sum, row) => sum + safeNum(row.teacher_count), 0);
    const maleTeachers = currentTeacherRows
      .filter((row) => row.gender === "Male")
      .reduce((sum, row) => sum + safeNum(row.teacher_count), 0);
    const femaleTeachers = currentTeacherRows
      .filter((row) => row.gender === "Female")
      .reduce((sum, row) => sum + safeNum(row.teacher_count), 0);
    const students = currentStudentRows.reduce((sum, row) => sum + safeNum(row.student_count), 0);
    const teachers = currentTeacherRows.reduce((sum, row) => sum + safeNum(row.teacher_count), 0);

    return [
      {
        label: "Total Teachers",
        value: fmtInt(totalTeachers),
        help: "All teachers captured under the current Teacher Capacity filters.",
        icon: <School className="h-5 w-5" />,
        accent: COLORS.public,
        bg: "rgba(37,99,235,0.12)",
      },
      {
        label: "Total Male Teachers",
        value: fmtInt(maleTeachers),
        help: "Male teachers under the current filters.",
        icon: <Users className="h-5 w-5" />,
        accent: "#8b5cf6",
        bg: "rgba(139,92,246,0.12)",
      },
      {
        label: "Total Female Teachers",
        value: fmtInt(femaleTeachers),
        help: "Female teachers under the current filters.",
        icon: <Users className="h-5 w-5" />,
        accent: COLORS.private,
        bg: "rgba(16,185,129,0.12)",
      },
      {
        label: "Overall Pupil-Teacher Ratio",
        value: fmtRatio(weightedRatio(students, teachers)),
        help: "Overall student-to-teacher load across the current Teacher Capacity filters.",
        icon: <BadgePercent className="h-5 w-5" />,
        accent: COLORS.ratio,
        bg: "rgba(14,165,233,0.12)",
      },
    ];
  }, [currentTeacherRows, currentStudentRows, previousTeacherRows, previousStudentRows, effectiveSession, previousSessionLabel]);

  const ptrSchoolTypeChart = useMemo(() => buildPupilTeacherRatioBySchoolTypeChart(studentRows, renderFilters), [studentRows, renderFilters]);
  const ptrSchoolLevelChart = useMemo(() => buildPupilTeacherRatioBySchoolLevel(studentRows), [studentRows]);
  const teachersStateChart = useMemo(
    () => buildPublicPrivateByLocationChart(teacherRows, renderFilters, "teacher_count", "Teachers"),
    [teacherRows, renderFilters],
  );
  const teachersStateOrder = useMemo(() => {
    const firstTrace = teachersStateChart?.bundle?.data?.[0] as { y?: string[] } | undefined;
    return Array.isArray(firstTrace?.y) ? firstTrace.y : [];
  }, [teachersStateChart]);
  const studentsStateChart = useMemo(
    () => buildPublicPrivateByLocationChart(studentRows, renderFilters, "student_count", "Students", teachersStateOrder),
    [studentRows, renderFilters, teachersStateOrder],
  );
  const teacherSplitChart = useMemo(() => buildTeacherSplitBySchoolLevel(teacherRows), [teacherRows]);
  const qualificationGroupChart = useMemo(() => buildQualificationGroupDonut(qualificationRows), [qualificationRows]);
  const qualificationCompositionChart = useMemo(
    () => buildQualificationCompositionDonut(qualificationRows),
    [qualificationRows],
  );
  const qualificationStateChart = useMemo(
    () => buildQualifiedUnqualifiedByLocationChart(qualificationRows, renderFilters),
    [qualificationRows, renderFilters],
  );
  const qualificationGenderChart = useMemo(() => buildQualifiedRateByGender(qualificationRows), [qualificationRows]);
  const qualificationSchoolTypeChart = useMemo(
    () => buildQualifiedRateBySchoolType(qualificationRows),
    [qualificationRows],
  );
  const trendRows = useMemo(() => filterTeacherRows(rows, renderFilters, { ignoreSession: true }, false), [rows, renderFilters]);

  const qualificationTrendChart = useMemo(() => buildQualificationTrend(trendRows, dimSessions), [trendRows, dimSessions]);

  const handleLocationChartClick = (result: LocationChartResult | null, event: PlotPointEvent) => {
    if (!result) return;
    const label = extractPointLabel(event);
    if (!label) return;
    syncFiltersForDrill(setFilters, result.level, label);
  };

  const resetDrill = () => resetLocationFilters(setFilters);

  const expandedEntry = useMemo<ExpandedEntry | undefined>(() => {
    if (!expandState) return undefined;

    switch (expandState.chartKey) {
      case "ptrState":
      case "ptrPublic":
      case "ptrPrivate":
        return {
          bundle: cloneChartBundle(ptrSchoolTypeChart?.bundle),
          onPlotClick: (event) => handleLocationChartClick(ptrSchoolTypeChart, event),
        };
      case "ptrLevel":
        return { bundle: cloneChartBundle(ptrSchoolLevelChart ?? undefined) };
      case "teachersState":
        return {
          bundle: cloneChartBundle(teachersStateChart?.bundle),
          onPlotClick: (event) => handleLocationChartClick(teachersStateChart, event),
        };
      case "studentsState":
        return {
          bundle: cloneChartBundle(studentsStateChart?.bundle),
          onPlotClick: (event) => handleLocationChartClick(studentsStateChart, event),
        };
      case "teacherSplit":
        return { bundle: cloneChartBundle(teacherSplitChart ?? undefined) };
      case "qualificationGroup":
        return { bundle: cloneChartBundle(qualificationGroupChart ?? undefined) };
      case "qualificationComposition":
        return { bundle: cloneChartBundle(qualificationCompositionChart ?? undefined) };
      case "qualificationState":
        return {
          bundle: cloneChartBundle(qualificationStateChart?.bundle),
          onPlotClick: (event) => handleLocationChartClick(qualificationStateChart, event),
        };
      case "qualificationGender":
        return { bundle: cloneChartBundle(qualificationGenderChart ?? undefined) };
      case "qualificationSchoolType":
        return { bundle: cloneChartBundle(qualificationSchoolTypeChart ?? undefined) };
      case "qualificationTrend":
        return { bundle: cloneChartBundle(qualificationTrendChart ?? undefined) };
      default:
        return undefined;
    }
  }, [
    expandState,
    ptrSchoolTypeChart,
    ptrSchoolLevelChart,
    teachersStateChart,
    studentsStateChart,
    teacherSplitChart,
    qualificationGroupChart,
    qualificationCompositionChart,
    qualificationStateChart,
    qualificationGenderChart,
    qualificationSchoolTypeChart,
    qualificationTrendChart,
  ]);

  const expandedBundle = expandedEntry?.bundle;

  if (loading && !rows.length) {
    return (
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-600 shadow-sm">
        Loading Teacher Capacity dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        Failed to load Teacher Capacity CSVs: {error}. Check <b>/public/data/</b> for <b>fact_teacher_capacity_school.csv</b> and
        <b> dim_teacher_capacity_benchmarks.csv</b>.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* SECTION 1: KPI CARDS - 4 cards in a row */}
      <SectionLabel id="teacher-capacity-kpi" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((item) => (
          <KpiCard key={item.label} item={item} />
        ))}
      </div>

      {/* SECTION 2: PUPIL-TEACHER RATIO */}
      <SectionLabel id="teacher-capacity-ratio" />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Primary Level Pupil-Teacher Ratio by School Type"
          helpKey="ptrState"
          bundle={ptrSchoolTypeChart?.bundle}
          onRefresh={resetDrill}
          onExpand={() => setExpandState({ chartKey: "ptrState", title: "Primary Level Pupil-Teacher Ratio by School Type" })}
          onPlotClick={(event) => handleLocationChartClick(ptrSchoolTypeChart, event)}
        />
        <ChartCard
          title="Pupil-Teacher Ratio by School Level"
          helpKey="ptrLevel"
          bundle={ptrSchoolLevelChart ?? undefined}
          onRefresh={() => undefined}
          onExpand={() => setExpandState({ chartKey: "ptrLevel", title: "Pupil-Teacher Ratio by School Level" })}
        />
      </div>

      {/* SECTION 3: PUBLIC VS PRIVATE DISTRIBUTION */}
      <SectionLabel id="teacher-capacity-distribution" />
      
      {/* Row 1: 2 charts side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Total Public and Private Teachers by State"
          helpKey="teachersState"
          bundle={teachersStateChart?.bundle}
          onRefresh={resetDrill}
          onExpand={() => setExpandState({ chartKey: "teachersState", title: "Total Public and Private Teachers by State" })}
          onPlotClick={(event) => handleLocationChartClick(teachersStateChart, event)}
        />
        <ChartCard
          title="Total Public and Private Students by State"
          helpKey="studentsState"
          bundle={studentsStateChart?.bundle}
          onRefresh={resetDrill}
          onExpand={() => setExpandState({ chartKey: "studentsState", title: "Total Public and Private Students by State" })}
          onPlotClick={(event) => handleLocationChartClick(studentsStateChart, event)}
        />
      </div>
      
      {/* Row 2: 1 full-width chart */}
      <div className="grid gap-4 grid-cols-1">
        <ChartCard
          title="Public vs Private Teacher Split by School Level"
          helpKey="teacherSplit"
          bundle={teacherSplitChart ?? undefined}
          onRefresh={() => undefined}
          onExpand={() => setExpandState({ chartKey: "teacherSplit", title: "Public vs Private Teacher Split by School Level" })}
        />
      </div>

      {/* EXPANDED CHART MODAL */}
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
                  {expandedBundle.callout ? (
                    <div
                      className={[
                        "mb-3 rounded-lg border px-3 py-2 text-xs leading-5",
                        expandedBundle.callout.tone === "warning"
                          ? "border-amber-200 bg-amber-50 text-amber-900"
                          : "border-sky-200 bg-sky-50 text-sky-900",
                      ].join(" ")}
                    >
                      {expandedBundle.callout.text}
                    </div>
                  ) : null}
                  {expandedBundle.scrollable ? (
                    <div className="overflow-y-auto pr-1" style={{ maxHeight: expandedBundle.expandedMaxHeight ?? 460 }}>
                      <Plot
                        data={expandedBundle.data as never}
                        layout={expandedBundle.layout as never}
                        config={{ displayModeBar: false, responsive: true } as never}
                        useResizeHandler
                        style={{ width: "100%", height: chartPixelHeight(expandedBundle.layout, 360) }}
                        onClick={expandedEntry?.onPlotClick as never}
                      />
                    </div>
                  ) : (
                    <Plot
                      data={expandedBundle.data as never}
                      layout={expandedBundle.layout as never}
                      config={{ displayModeBar: false, responsive: true } as never}
                      useResizeHandler
                      style={{ width: "100%", height: chartPixelHeight(expandedBundle.layout, 360) }}
                      onClick={expandedEntry?.onPlotClick as never}
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
