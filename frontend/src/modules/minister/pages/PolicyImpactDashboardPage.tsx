import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MouseEvent as ReactMouseEvent, ReactNode, SetStateAction } from "react";
import Plot from "react-plotly.js";
import type { Data as PlotlyData, Layout as PlotlyLayout, Config as PlotlyConfig, PlotMouseEvent } from "plotly.js";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  GraduationCap,
  HelpCircle,
  Landmark,
  Wallet,
  Maximize2,
  Minus,
  RotateCw,
  X,
} from "lucide-react";

import type { DimSession, MinisterFilters } from "../types";
import { canonicalState, loadRefinedFile } from "../utils/refinedPageData";
import {
  LOAN_TREND_SESSIONS,
  POLICY_IMPACT_SESSIONS,
  filterRowsBySessionWindow,
} from "../utils/sessionWindows";

type PolicyImpactRow = {
  session: string;
  zone: string;
  state: string;
  lga: string;
  institution_type: string;
  tertiary_institution: string;
  gender: string;
  disability: string;
  programme_cluster: string;
  discipline_group: string;
  programme: string;
  admitted_count: number;
  matriculated_count: number;
};

type PolicyLoanRow = {
  session: string;
  zone: string;
  state: string;
  lga: string;
  institution_type: string;
  tertiary_institution: string;
  gender: string;
  disability: string;
  programme_cluster: string;
  discipline_group: string;
  programme: string;
  loan_applications: number;
  loan_approved: number;
  loan_disbursed: number;
};

type PlotPointEvent = Readonly<PlotMouseEvent>;

type DrillState = {
  zone?: string;
  state?: string;
  lga?: string;
};

type MetricCard = {
  label: string;
  value: number;
  delta: number | null;
  empty?: boolean;
  accent: string;
  bg: string;
  icon: ReactNode;
  help: string;
  suffix?: string;
};

type LegendItem = {
  label: string;
  color: string;
  dashed?: boolean;
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

type ChartKey =
  | "mix"
  | "zone"
  | "state"
  | "gender"
  | "disciplineMix"
  | "topMatriculatedCourses"
  | "topStemmCourses"
  | "lowestStemmCourses"
  | "topNonStemmCourses"
  | "lowestNonStemmCourses"
  | "topStemmInstitutions"
  | "lowestStemmInstitutions"
  | "topNonStemmInstitutions"
  | "lowestNonStemmInstitutions"
  | "loanTrend"
  | "stemmNonStemmTrend"
  | "loanInstitution"
  | "loanDiscipline";

type ExpandState = { key: ChartKey; title: string } | null;

type RankedRow = { label: string; value: number; zone?: string; state?: string; lga?: string };

export const POLICY_IMPACT_SECTIONS = [
  { id: "policy-impact-kpi", label: "KPI Cards" },
  { id: "policy-impact-mix", label: "Programme Mix" },
  { id: "policy-impact-breakdown", label: "Breakdown Analysis" },
  { id: "policy-impact-rankings", label: "Institution Rankings" },
  { id: "policy-impact-trends", label: "Trend Analysis" },
  { id: "policy-impact-loans", label: "Student Loan Support" },
] as const;

const COLORS = {
  stemm: "#2563eb",
  nonStemm: "#f59e0b",
  artsHumanities: "#8b5cf6",
  socialSciences: "#14b8a6",
  businessLaw: "#f97316",
  education: "#84cc16",
  communicationMedia: "#ec4899",
  languages: "#06b6d4",
  male: "#0ea5e9",
  female: "#ec4899",
  line: "#7c3aed",
  line2: "#0891b2",
  admitted: "#16a34a",
  matriculated: "#7c3aed",
  applications: "#2563eb",
  disbursed: "#f97316",
  grid: "rgba(15,23,42,0.10)",
  text: "#0f172a",
  sub: "#64748b",
  benchmark: "#ef4444",
};

const CHART_HELP: Record<ChartKey, string> = {
  mix: "Programme Mix shows the share of STEMM versus Non-STEMM learners in the current view. When the Admitted toggle is off it shows matriculated learners, and when it is on it shows admitted learners.",
  zone: "This chart starts at Zone level and can drill deeper through State, LGA, and Institution. It compares STEMM and Non-STEMM side by side within the current selected stage.",
  state: "This chart starts at State level and can drill deeper through LGA and Institution. Use it to compare how strongly each state leans toward STEMM or Non-STEMM.",
  gender: "This grouped bar chart compares male and female learners across STEMM and Non-STEMM in the selected stage.",
  disciplineMix: "This donut chart shows matriculated learners by discipline family. All STEMM disciplines are combined into one STEMM slice, while Non-STEMM is grouped into ART, Social Sciences, and Education.",
  topMatriculatedCourses: "This ranked horizontal bar chart uses the JAMB Top Admission course values for the selected session and filters. Each course inherits the color of its discipline family from the discipline donut chart beside it.",
  topStemmCourses: "This ranking chart shows the ten STEMM programmes with the highest learner volume in the current stage and filter context.",
  lowestStemmCourses: "This ranking chart shows the ten STEMM programmes with the lowest learner volume in the current stage and filter context.",
  topNonStemmCourses: "This ranking chart shows the ten Non-STEMM programmes with the highest learner volume in the current stage and filter context.",
  lowestNonStemmCourses: "This ranking chart shows the ten Non-STEMM programmes with the lowest learner volume in the current stage and filter context.",
  topStemmInstitutions: "This chart uses the JAMB Top 10 institutions by admission values for the selected session and filters.",
  lowestStemmInstitutions: "This chart uses the JAMB Bottom 10 institutions by admission values for the selected session and filters.",
  topNonStemmInstitutions: "This chart ranks the institutions with the highest Non-STEMM learner volume in the current stage.",
  lowestNonStemmInstitutions: "This chart ranks the institutions with the lowest Non-STEMM learner volume in the current stage.",
  stemmNonStemmTrend: "This trend chart shows STEMM and Non-STEMM matriculated learners side by side from 2021/2022 onward so the recent tertiary intake pattern is easier to compare.",
  loanTrend: "This combo chart compares loan applications with loans disbursed for the 2024/2025 academic session, which is the only currently available year for this loan trend.",
  loanInstitution: "This chart shows how approved and disbursed student loans are distributed across institution types.",
  loanDiscipline: "This chart shows how approved and disbursed student loans are distributed across discipline groups.",
};

function safeNum(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function fmtInt(value: number): string {
  return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function percentDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous <= 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function normaliseDisciplineGroup(value: string): string {
  const cleaned = value.trim();
  switch (cleaned) {
    case "Arts":
    case "Arts / Humanities":
      return "ART";
    case "Business / Administration / Law":
    case "Communication / Media":
    case "Languages":
      return "Social Sciences";
    default:
      return cleaned;
  }
}

function getPolicyDisciplineBucket(row: Pick<PolicyImpactRow, "programme_cluster" | "discipline_group">): string {
  return row.programme_cluster === "STEMM" ? "STEMM" : normaliseDisciplineGroup(row.discipline_group);
}

const DISCIPLINE_ORDER = [
  "STEMM",
  "ART",
  "Social Sciences",
  "Education",
] as const;

const LOAN_DISCIPLINE_ORDER = [
  "Science",
  "Technology / ICT",
  "Engineering",
  "Mathematics / Statistics",
  "Medicine / Health Sciences",
  "ART",
  "Social Sciences",
  "Education",
] as const;

function disciplineColor(label: string): string {
  switch (label) {
    case "STEMM":
    case "Science":
    case "Technology / ICT":
    case "Engineering":
    case "Mathematics / Statistics":
    case "Medicine / Health Sciences":
      return COLORS.stemm;
    case "ART":
      return COLORS.artsHumanities;
    case "Social Sciences":
      return COLORS.socialSciences;
    case "Education":
      return COLORS.education;
    default:
      return COLORS.nonStemm;
  }
}



function normaliseDisability(disabilityMode: boolean, value: string): boolean {
  if (disabilityMode) return value === "Disabled";
  return value !== "Disabled";
}

function baseLayout(height = 320): Partial<PlotlyLayout> {
  return {
    height,
    paper_bgcolor: "white",
    plot_bgcolor: "white",
    margin: { l: 50, r: 16, t: 36, b: 50 },
    font: { family: "Inter, system-ui, sans-serif", color: COLORS.text, size: 12 },
    xaxis: { gridcolor: COLORS.grid, zeroline: false, tickfont: { color: COLORS.sub }, automargin: true },
    yaxis: { gridcolor: COLORS.grid, zeroline: false, tickfont: { color: COLORS.sub }, automargin: true },
    legend: { orientation: "h", x: 0, y: 1.12, bgcolor: "rgba(255,255,255,0)" },
    hoverlabel: { bgcolor: "#0f172a", bordercolor: "#0f172a", font: { color: "white" } },
    bargap: 0.25,
    uniformtext: { mode: "show", minsize: 10 },
  } as Partial<PlotlyLayout>;
}

function buildHorizontalStackedChart(
  rows: Array<{ label: string; stemm: number; nonStemm: number }>,
  metricLabel: string,
): ChartBundle {
  const sorted = [...rows].sort((a, b) => b.stemm + b.nonStemm - (a.stemm + a.nonStemm));
  const dynamicHeight = Math.max(380, sorted.length * 38 + 110);
  return {
    data: [
      {
        type: "bar",
        orientation: "h",
        name: "STEMM",
        y: sorted.map((row) => row.label),
        x: sorted.map((row) => row.stemm),
        text: sorted.map((row) => fmtInt(row.stemm)),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "white", size: 11 },
        cliponaxis: false,
        marker: { color: COLORS.stemm },
        hovertemplate: "%{y}<br>STEMM: %{x:,}<extra></extra>",
      },
      {
        type: "bar",
        orientation: "h",
        name: "Non-STEMM",
        y: sorted.map((row) => row.label),
        x: sorted.map((row) => row.nonStemm),
        text: sorted.map((row) => fmtInt(row.nonStemm)),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "white", size: 11 },
        cliponaxis: false,
        marker: { color: COLORS.nonStemm },
        hovertemplate: "%{y}<br>Non-STEMM: %{x:,}<extra></extra>",
      },
    ],
    layout: {
      ...baseLayout(dynamicHeight),
      barmode: "stack",
      margin: { l: 76, r: 12, t: 32, b: 42 },
      showlegend: false,
      xaxis: { ...baseLayout().xaxis, title: { text: metricLabel }, automargin: true },
      yaxis: { ...baseLayout().yaxis, automargin: true, tickfont: { color: COLORS.sub, size: 11 }, autorange: "reversed" },
      title: undefined,
    },
    fixedLegend: [
      { label: "STEMM", color: COLORS.stemm },
      { label: "Non-STEMM", color: COLORS.nonStemm },
    ],
    scrollable: sorted.length > 10,
    scrollMaxHeight: 380,
    expandedMaxHeight: Math.max(640, sorted.length * 38 + 120),
  };
}

function buildRankedChart(rows: RankedRow[], color: string, metricLabel: string, descending = true): ChartBundle {
  const filtered = rows.filter((r) => r.value > 0);
  const ranked = [...filtered]
    .sort((a, b) => (descending ? b.value - a.value : a.value - b.value))
    .slice(0, 10);
  return {
    data: [
      {
        type: "bar",
        orientation: "h",
        y: ranked.map((row) => row.label),
        x: ranked.map((row) => row.value),
        marker: { color },
        text: ranked.map((row) => fmtInt(row.value)),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "white", size: 11 },
        cliponaxis: false,
        hovertemplate: "%{y}<br>%{x:,}<extra></extra>",
      },
    ],
    layout: {
      ...baseLayout(Math.max(330, ranked.length * 30 + 100)),
      xaxis: { ...baseLayout().xaxis, title: { text: metricLabel } },
      yaxis: { ...baseLayout().yaxis, automargin: true, tickfont: { color: COLORS.sub, size: 11 }, autorange: descending ? "reversed" : true },
      showlegend: false,
      margin: { l: 122, r: 16, t: 20, b: 46 },
    },
    scrollable: ranked.length > 8,
    scrollMaxHeight: 380,
    expandedMaxHeight: 520,
  };
}


function buildMultiColorRankedChart(rows: Array<RankedRow & { color: string; hoverLabel?: string }>, metricLabel: string): ChartBundle {
  const ranked = rows
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  return {
    data: [
      {
        type: "bar",
        orientation: "h",
        y: ranked.map((row) => row.label),
        x: ranked.map((row) => row.value),
        marker: { color: ranked.map((row) => row.color) },
        text: ranked.map((row) => fmtInt(row.value)),
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { color: "white", size: 11 },
        cliponaxis: false,
        customdata: ranked.map((row) => row.hoverLabel ?? row.label),
        hovertemplate: "%{y}<br>%{x:,} " + metricLabel + "<br>%{customdata}<extra></extra>",
      },
    ],
    layout: {
      ...baseLayout(Math.max(350, ranked.length * 30 + 110)),
      xaxis: { ...baseLayout().xaxis, title: { text: metricLabel } },
      yaxis: { ...baseLayout().yaxis, automargin: true, tickfont: { color: COLORS.sub, size: 11 }, autorange: "reversed" },
      showlegend: false,
      margin: { l: 142, r: 16, t: 20, b: 46 },
    },
    scrollable: ranked.length > 8,
    scrollMaxHeight: 400,
    expandedMaxHeight: 560,
  };
}

function buildChartTitle(base: string): string {
  return `${base} — Matriculated`;
}

function FixedLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-6 rounded-full"
            style={{
              backgroundColor: item.dashed ? "transparent" : item.color,
              border: item.dashed ? `2px dashed ${item.color}` : undefined,
            }}
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function KpiCard({ item, previousSessionLabel }: { item: MetricCard; previousSessionLabel?: string }) {
  const [showHelp, setShowHelp] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpPanelRef = useRef<HTMLDivElement | null>(null);
  const rising = (item.delta ?? 0) > 0;
  const falling = (item.delta ?? 0) < 0;

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

  return (
    <div className="relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: item.bg, color: item.accent }}>
              {item.icon}
            </div>
            <div className="text-[12px] font-medium leading-tight text-slate-500 truncate">{item.label}</div>
          </div>
          <button
            ref={helpButtonRef}
            type="button"
            onMouseEnter={() => setShowHelp(true)}
            onMouseLeave={() => setShowHelp(false)}
            onFocus={() => setShowHelp(true)}
            onBlur={() => setShowHelp(false)}
            onClick={() => setShowHelp((prev) => !prev)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-400 hover:bg-slate-50"
          >
            <HelpCircle className="h-3 w-3" />
          </button>
        </div>
        <div className="mt-2.5 text-[26px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
          {item.empty ? "—" : item.suffix === "%" ? fmtPct(item.value) : fmtInt(item.value)}
          {item.suffix === "%" ? null : null}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          {item.empty ? (
            <span className="text-[10px] text-slate-400">
              No loan data for selected session
            </span>
          ) : item.delta == null ? (
            <span className="text-[10px] text-slate-400">
              {previousSessionLabel ? `No data for ${previousSessionLabel}` : "No prior session"}
            </span>
          ) : (
            <>
              <div className={["inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                rising ? "bg-emerald-50 text-emerald-700" : falling ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"].join(" ")}>
                {rising ? <ArrowUpRight className="h-2.5 w-2.5" /> : falling ? <ArrowDownRight className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                {fmtPct(Math.abs(item.delta))}
              </div>
              <span className="text-[10px] text-slate-400">
                {previousSessionLabel ? `vs ${previousSessionLabel}` : "vs prior"}
              </span>
            </>
          )}
        </div>
      </div>
      {showHelp ? (
        <div ref={helpPanelRef} className="absolute left-0 top-full z-30 mt-1 w-[270px] rounded-xl bg-slate-950 px-4 py-3 text-xs leading-5 text-white shadow-2xl">
          <div className="mb-1 text-[10px] font-bold text-slate-300 uppercase tracking-wide">{item.label}</div>
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
}: {
  title: string;
  explanation: string;
  bundle: ChartBundle;
  onExpand: () => void;
  onRefresh: () => void;
  onPlotClick?: (event: PlotPointEvent) => void;
}) {
  const [showHelp, setShowHelp] = useState(false);
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

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
                className="absolute right-0 top-10 z-20 w-[290px] rounded-xl bg-slate-950 px-4 py-3 text-xs leading-5 text-white shadow-2xl"
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
        {bundle.fixedLegend?.length ? <FixedLegend items={bundle.fixedLegend} /> : null}
        {bundle.scrollable ? (
          <div className="overflow-y-auto pr-1" style={{ maxHeight: bundle.scrollMaxHeight ?? 320 }}>
            <Plot
              data={bundle.data}
              layout={{ ...bundle.layout, showlegend: bundle.fixedLegend?.length ? false : bundle.layout.showlegend }}
              config={bundle.config ?? { displayModeBar: false, responsive: true }}
              style={{ width: "100%", height: "100%" }}
              onClick={onPlotClick}
            />
          </div>
        ) : (
          <Plot
            data={bundle.data}
            layout={{ ...bundle.layout, showlegend: bundle.fixedLegend?.length ? false : bundle.layout.showlegend }}
            config={bundle.config ?? { displayModeBar: false, responsive: true }}
            style={{ width: "100%", height: "100%" }}
            onClick={onPlotClick}
          />
        )}
      </div>
    </div>
  );
}


export default function PolicyImpactDashboard({
  filters,
  dimSessions,
  disabilityMode,
  setFilters,
}: {
  filters: MinisterFilters;
  setFilters: Dispatch<SetStateAction<MinisterFilters>>;
  dimSessions: DimSession[];
  disabilityMode: boolean;
}) {
  const [rows, setRows] = useState<PolicyImpactRow[]>([]);
  const [loanRows, setLoanRows] = useState<PolicyLoanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoneDrill, setZoneDrill] = useState<DrillState>({});
  const [stateDrill, setStateDrill] = useState<DrillState>({});
  const [expandState, setExpandState] = useState<ExpandState>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [tertiaryData, loansData] = await Promise.all([
          loadRefinedFile<PolicyImpactRow>("pages/policy_impact/policy_programme.csv"),
          loadRefinedFile<PolicyLoanRow>("pages/policy_impact/policy_loans_programme.csv"),
        ]);
        if (!mounted) return;
        setRows(filterRowsBySessionWindow(tertiaryData, POLICY_IMPACT_SESSIONS));
        setLoanRows(filterRowsBySessionWindow(loansData, POLICY_IMPACT_SESSIONS));
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load policy impact data");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Reset drills only when non-location filters change (session, gender, etc.)
  // Location filter changes come FROM drills, so including them would cause a loop.
  useEffect(() => {
    setZoneDrill({});
    setStateDrill({});
  }, [
    filters.session,
    filters.gender,
    filters.institution_type,
    filters.tertiary_institution,
    filters.programme_cluster,
    filters.discipline_group,
    filters.programme,
    disabilityMode,
    ]);

  const previousSession = useMemo(
    () => dimSessions.find((row) => row.session_id === filters.session)?.prev_session_id ?? "",
    [dimSessions, filters.session],
  );

  const trendRows = useMemo(
    () =>
      rows.filter((row) => {
        if (filters.zone && row.zone !== filters.zone) return false;
        if (filters.state && canonicalState(row.state) !== canonicalState(filters.state)) return false;
        if (filters.lga && row.lga !== filters.lga) return false;
        if (filters.gender && row.gender !== filters.gender) return false;
        if (filters.institution_type && row.institution_type !== filters.institution_type) return false;
        if (filters.tertiary_institution && row.tertiary_institution !== filters.tertiary_institution) return false;
        if (filters.programme_cluster && row.programme_cluster !== filters.programme_cluster) return false;
        if (filters.discipline_group && normaliseDisciplineGroup(row.discipline_group) !== filters.discipline_group) return false;
        if (filters.programme && row.programme !== filters.programme) return false;
        if (!normaliseDisability(disabilityMode, row.disability)) return false;
        return true;
      }),
    [
      rows,
      filters.zone,
      filters.state,
      filters.lga,
      filters.gender,
      filters.institution_type,
      filters.tertiary_institution,
      filters.programme_cluster,
      filters.discipline_group,
      filters.programme,
      disabilityMode,
    ],
  );

  const applyBaseFilters = (source: PolicyImpactRow[]) =>
    source.filter((row) => {
      if (filters.session && row.session !== filters.session) return false;
      if (filters.zone && row.zone !== filters.zone) return false;
      if (filters.state && canonicalState(row.state) !== canonicalState(filters.state)) return false;
      if (filters.lga && row.lga !== filters.lga) return false;
      if (filters.gender && row.gender !== filters.gender) return false;
      if (filters.institution_type && row.institution_type !== filters.institution_type) return false;
      if (filters.tertiary_institution && row.tertiary_institution !== filters.tertiary_institution) return false;
      if (filters.programme_cluster && row.programme_cluster !== filters.programme_cluster) return false;
      if (filters.discipline_group && normaliseDisciplineGroup(row.discipline_group) !== filters.discipline_group) return false;
      if (filters.programme && row.programme !== filters.programme) return false;
      if (!normaliseDisability(disabilityMode, row.disability)) return false;
      return true;
    });

  const filteredRows = useMemo(() => applyBaseFilters(rows), [rows, filters, disabilityMode]);

  // drillBaseRows: all filters EXCEPT location — the zone/state drill charts do
  // their own location scoping so they never conflict with filters.state/lga
  const drillBaseRows = useMemo(() => rows.filter((row) => {
    if (filters.session && row.session !== filters.session) return false;
    if (filters.gender && row.gender !== filters.gender) return false;
    if (filters.institution_type && row.institution_type !== filters.institution_type) return false;
    if (filters.tertiary_institution && row.tertiary_institution !== filters.tertiary_institution) return false;
    if (filters.programme_cluster && row.programme_cluster !== filters.programme_cluster) return false;
    if (filters.discipline_group && normaliseDisciplineGroup(row.discipline_group) !== filters.discipline_group) return false;
    if (filters.programme && row.programme !== filters.programme) return false;
    if (!normaliseDisability(disabilityMode, row.disability)) return false;
    return true;
  }), [rows, filters.session, filters.gender, filters.institution_type, filters.tertiary_institution,
       filters.programme_cluster, filters.discipline_group, filters.programme, disabilityMode]);

  const effectiveZoneDrill = useMemo<DrillState>(() => ({
    zone: (zoneDrill.zone ?? filters.zone) || undefined,
    state: (zoneDrill.state ?? filters.state) || undefined,
    lga: (zoneDrill.lga ?? filters.lga) || undefined,
  }), [zoneDrill, filters.zone, filters.state, filters.lga]);

  const effectiveStateDrill = useMemo<DrillState>(() => ({
    zone: (stateDrill.zone ?? filters.zone) || undefined,
    state: (stateDrill.state ?? filters.state) || undefined,
    lga: (stateDrill.lga ?? filters.lga) || undefined,
  }), [stateDrill, filters.zone, filters.state, filters.lga]);
  const previousRows = useMemo(() => {
    if (!previousSession) return [] as PolicyImpactRow[];
    return rows.filter((row) => {
      if (row.session !== previousSession) return false;
      if (filters.zone && row.zone !== filters.zone) return false;
      if (filters.state && canonicalState(row.state) !== canonicalState(filters.state)) return false;
      if (filters.lga && row.lga !== filters.lga) return false;
      if (filters.gender && row.gender !== filters.gender) return false;
      if (filters.institution_type && row.institution_type !== filters.institution_type) return false;
      if (filters.tertiary_institution && row.tertiary_institution !== filters.tertiary_institution) return false;
      if (filters.programme_cluster && row.programme_cluster !== filters.programme_cluster) return false;
      if (filters.discipline_group && normaliseDisciplineGroup(row.discipline_group) !== filters.discipline_group) return false;
      if (filters.programme && row.programme !== filters.programme) return false;
      if (!normaliseDisability(disabilityMode, row.disability)) return false;
      return true;
    });
  }, [rows, filters, disabilityMode, previousSession]);

  const filteredLoanRows = useMemo(
    () =>
      loanRows.filter((row) => {
        if (filters.session && row.session !== filters.session) return false;
        if (filters.zone && row.zone !== filters.zone) return false;
        if (filters.state && canonicalState(row.state) !== canonicalState(filters.state)) return false;
        if (filters.lga && row.lga !== filters.lga) return false;
        if (filters.gender && row.gender !== filters.gender) return false;
        if (filters.institution_type && row.institution_type !== filters.institution_type) return false;
        if (filters.tertiary_institution && row.tertiary_institution !== filters.tertiary_institution) return false;
        if (filters.programme_cluster && row.programme_cluster !== filters.programme_cluster) return false;
        if (filters.discipline_group && normaliseDisciplineGroup(row.discipline_group) !== filters.discipline_group) return false;
        if (filters.programme && row.programme !== filters.programme) return false;
        if (!normaliseDisability(disabilityMode, row.disability)) return false;
        return true;
      }),
    [loanRows, filters, disabilityMode],
  );

  const previousLoanRows = useMemo(() => {
    if (!previousSession) return [] as PolicyLoanRow[];
    return loanRows.filter((row) => {
      if (row.session !== previousSession) return false;
      if (filters.zone && row.zone !== filters.zone) return false;
      if (filters.state && canonicalState(row.state) !== canonicalState(filters.state)) return false;
      if (filters.lga && row.lga !== filters.lga) return false;
      if (filters.gender && row.gender !== filters.gender) return false;
      if (filters.institution_type && row.institution_type !== filters.institution_type) return false;
      if (filters.tertiary_institution && row.tertiary_institution !== filters.tertiary_institution) return false;
      if (filters.programme_cluster && row.programme_cluster !== filters.programme_cluster) return false;
      if (filters.discipline_group && normaliseDisciplineGroup(row.discipline_group) !== filters.discipline_group) return false;
      if (filters.programme && row.programme !== filters.programme) return false;
      if (!normaliseDisability(disabilityMode, row.disability)) return false;
      return true;
    });
  }, [loanRows, filters, disabilityMode, previousSession]);

  const currentMetricLabel = "Matriculated";
  const currentValue = (row: PolicyImpactRow) => safeNum(row.matriculated_count);

  const totals = useMemo(() => {
    const totalAdmitted = rows
      .filter((row) => {
        if (filters.session && row.session !== filters.session) return false;
        if (filters.zone && row.zone !== filters.zone) return false;
        if (filters.state && canonicalState(row.state) !== canonicalState(filters.state)) return false;
        if (filters.lga && row.lga !== filters.lga) return false;
        if (filters.gender && row.gender !== filters.gender) return false;
        if (filters.institution_type && row.institution_type !== filters.institution_type) return false;
        if (filters.tertiary_institution && row.tertiary_institution !== filters.tertiary_institution) return false;
        if (filters.programme_cluster && row.programme_cluster !== filters.programme_cluster) return false;
        if (filters.discipline_group && normaliseDisciplineGroup(row.discipline_group) !== filters.discipline_group) return false;
        if (filters.programme && row.programme !== filters.programme) return false;
        if (!normaliseDisability(disabilityMode, row.disability)) return false;
        return true;
      })
      .reduce((sum, row) => sum + safeNum(row.admitted_count), 0);
    const totalMatriculated = filteredRows.reduce((sum, row) => sum + safeNum(row.matriculated_count), 0);
    const stemmValue = filteredRows.filter((row) => row.programme_cluster === "STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const nonStemmValue = filteredRows.filter((row) => row.programme_cluster === "Non-STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const totalStage = stemmValue + nonStemmValue;
    const previousAdmitted = previousRows.reduce((sum, row) => sum + safeNum(row.admitted_count), 0);
    const previousMatriculated = previousRows.reduce((sum, row) => sum + safeNum(row.matriculated_count), 0);
    const prevStemmValue = previousRows.filter((row) => row.programme_cluster === "STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const prevNonStemmValue = previousRows.filter((row) => row.programme_cluster === "Non-STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const prevStage = prevStemmValue + prevNonStemmValue;
    const totalLoansDisbursed = filteredLoanRows.reduce((sum, row) => sum + safeNum(row.loan_disbursed), 0);
    const previousLoansDisbursed = previousLoanRows.reduce((sum, row) => sum + safeNum(row.loan_disbursed), 0);
    return {
      totalAdmitted,
      totalMatriculated,
      totalLoansDisbursed,
      stemmShare: totalStage ? (stemmValue / totalStage) * 100 : 0,
      nonStemmShare: totalStage ? (nonStemmValue / totalStage) * 100 : 0,
      totalAdmittedDelta: percentDelta(totalAdmitted, previousAdmitted),
      totalMatriculatedDelta: percentDelta(totalMatriculated, previousMatriculated),
      totalLoansDisbursedDelta: percentDelta(totalLoansDisbursed, previousLoansDisbursed),
      stemmShareDelta: percentDelta(totalStage ? (stemmValue / totalStage) * 100 : 0, prevStage ? (prevStemmValue / prevStage) * 100 : 0),
      nonStemmShareDelta: percentDelta(totalStage ? (nonStemmValue / totalStage) * 100 : 0, prevStage ? (prevNonStemmValue / prevStage) * 100 : 0),
    };
  }, [rows, filteredRows, previousRows, filteredLoanRows, previousLoanRows, filters, disabilityMode]);

  const metricCards = useMemo<MetricCard[]>(() => [
    {
      label: "Total Matriculated Learners",
      value: totals.totalMatriculated,
      delta: totals.totalMatriculatedDelta,
      accent: "#7c3aed",
      bg: "#ede9fe",
      icon: <GraduationCap className="h-5 w-5" />,
      help: "Total learners who completed matriculation within the selected filters.",
    },
    {
      label: "STEMM Share",
      value: totals.stemmShare,
      delta: totals.stemmShareDelta,
      accent: "#16a34a",
      bg: "#dcfce7",
      icon: <BookOpen className="h-5 w-5" />,
      help: "Share of matriculated learners in STEMM programmes.",
      suffix: "%",
    },
    {
      label: "Non-STEMM Share",
      value: totals.nonStemmShare,
      delta: totals.nonStemmShareDelta,
      accent: "#f59e0b",
      bg: "#fef3c7",
      icon: <Landmark className="h-5 w-5" />,
      help: "Share of matriculated learners in Non-STEMM programmes.",
      suffix: "%",
    },
    {
      label: "Number of Loans Disbursed",
      value: totals.totalLoansDisbursed,
      delta: filteredLoanRows.length ? totals.totalLoansDisbursedDelta : null,
      empty: filteredLoanRows.length === 0,
      accent: "#0f766e",
      bg: "#ccfbf1",
      icon: <Wallet className="h-5 w-5" />,
      help: "Total student loans disbursed within the selected filters and session.",
    },
  ], [totals, filteredLoanRows.length]);

  const groupedBy = <K extends string>(
    source: PolicyImpactRow[],
    keyGetter: (row: PolicyImpactRow) => K,
  ): Array<{ key: K; stemm: number; nonStemm: number }> => {
    const map = new Map<K, { stemm: number; nonStemm: number }>();
    source.forEach((row) => {
      const key = keyGetter(row);
      const entry = map.get(key) ?? { stemm: 0, nonStemm: 0 };
      if (row.programme_cluster === "STEMM") entry.stemm += currentValue(row);
      else entry.nonStemm += currentValue(row);
      map.set(key, entry);
    });
    return [...map.entries()].map(([key, value]) => ({ key, stemm: value.stemm, nonStemm: value.nonStemm }));
  };

  // Zone chart: starts from drillBaseRows, scopes by drill path only
  const zoneScopedRows = useMemo(() => {
    return drillBaseRows.filter((row) => {
      if (effectiveZoneDrill.zone && row.zone !== effectiveZoneDrill.zone) return false;
      if (effectiveZoneDrill.state && row.state !== effectiveZoneDrill.state) return false;
      if (effectiveZoneDrill.lga && row.lga !== effectiveZoneDrill.lga) return false;
      return true;
    });
  }, [drillBaseRows, effectiveZoneDrill]);

  // State chart: starts from drillBaseRows, scopes by stateDrill path only
  const stateScopedRows = useMemo(() => {
    return drillBaseRows.filter((row) => {
      if (effectiveStateDrill.zone && row.zone !== effectiveStateDrill.zone) return false;
      if (effectiveStateDrill.state && row.state !== effectiveStateDrill.state) return false;
      if (effectiveStateDrill.lga && row.lga !== effectiveStateDrill.lga) return false;
      return true;
    });
  }, [drillBaseRows, effectiveStateDrill]);

  const zoneLevel = effectiveZoneDrill.lga ? "institution" : effectiveZoneDrill.state ? "lga" : effectiveZoneDrill.zone ? "state" : "zone";
  const stateLevel = effectiveStateDrill.lga ? "institution" : effectiveStateDrill.state ? "lga" : "state";

  const zoneRows = useMemo(() => {
    if (zoneLevel === "zone") return groupedBy(drillBaseRows, (row) => row.zone).map((row) => ({ label: row.key, stemm: row.stemm, nonStemm: row.nonStemm }));
    if (zoneLevel === "state") return groupedBy(zoneScopedRows, (row) => row.state).map((row) => ({ label: row.key, stemm: row.stemm, nonStemm: row.nonStemm }));
    if (zoneLevel === "lga") return groupedBy(zoneScopedRows, (row) => row.lga).map((row) => ({ label: row.key, stemm: row.stemm, nonStemm: row.nonStemm }));
    return groupedBy(zoneScopedRows, (row) => row.tertiary_institution).map((row) => ({ label: row.key, stemm: row.stemm, nonStemm: row.nonStemm }));
  }, [drillBaseRows, zoneScopedRows, zoneLevel]);

  const stateRows = useMemo(() => {
    if (stateLevel === "state") return groupedBy(drillBaseRows, (row) => row.state).map((row) => ({ label: row.key, stemm: row.stemm, nonStemm: row.nonStemm }));
    if (stateLevel === "lga") return groupedBy(stateScopedRows, (row) => row.lga).map((row) => ({ label: row.key, stemm: row.stemm, nonStemm: row.nonStemm }));
    return groupedBy(stateScopedRows, (row) => row.tertiary_institution).map((row) => ({ label: row.key, stemm: row.stemm, nonStemm: row.nonStemm }));
  }, [drillBaseRows, stateScopedRows, stateLevel]);

  const programmeMixBundle = useMemo<ChartBundle>(() => {
    const stemm = filteredRows.filter((row) => row.programme_cluster === "STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const nonStemm = filteredRows.filter((row) => row.programme_cluster === "Non-STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const layout = baseLayout(320);
    layout.margin = { l: 8, r: 8, t: 8, b: 8 };
    layout.showlegend = false;
    layout.xaxis = { visible: false };
    layout.yaxis = { visible: false };
    layout.shapes = [
      { type: "line", xref: "paper", yref: "paper", x0: 0.56, x1: 0.95, y0: 0.56, y1: 0.56, line: { color: "rgba(148,163,184,0.35)", width: 1 } },
    ];
    layout.annotations = [
      { x: 0.56, y: 0.72, xref: "paper", yref: "paper", showarrow: false, xanchor: "left", text: `<span style="color:${COLORS.stemm}">●</span> STEMM`, font: { size: 12, color: COLORS.text } },
      { x: 0.95, y: 0.72, xref: "paper", yref: "paper", showarrow: false, xanchor: "right", align: "right", text: `<b>${fmtInt(stemm)}</b>`, font: { size: 12, color: COLORS.text } },
      { x: 0.56, y: 0.39, xref: "paper", yref: "paper", showarrow: false, xanchor: "left", text: `<span style="color:${COLORS.nonStemm}">●</span> Non-STEMM`, font: { size: 12, color: COLORS.text } },
      { x: 0.95, y: 0.39, xref: "paper", yref: "paper", showarrow: false, xanchor: "right", align: "right", text: `<b>${fmtInt(nonStemm)}</b>`, font: { size: 12, color: COLORS.text } },
    ];
    return {
      data: [{
        type: "pie",
        labels: ["STEMM", "Non-STEMM"],
        values: [stemm, nonStemm],
        hole: 0.62,
        sort: false,
        marker: { colors: [COLORS.stemm, COLORS.nonStemm], line: { color: "#ffffff", width: 2 } },
        texttemplate: "%{percent}",
        textposition: "inside",
        textfont: { color: "white", size: 11 },
        insidetextorientation: "radial",
        hovertemplate: "%{label}<br>%{value:,} learners<br>%{percent}<extra></extra>",
        showlegend: false,
        domain: { x: [0.02, 0.45], y: [0.08, 0.94] },
      }],
      layout,
      fixedLegend: [{ label: "STEMM", color: COLORS.stemm }, { label: "Non-STEMM", color: COLORS.nonStemm }],
    };
  }, [filteredRows]);

  const zoneBundle = useMemo(
    () => buildHorizontalStackedChart(zoneRows, `${currentMetricLabel} learners`),
    [zoneRows, currentMetricLabel],
  );

  const stateBundle = useMemo(
    () => buildHorizontalStackedChart(stateRows, `${currentMetricLabel} learners`),
    [stateRows, currentMetricLabel],
  );

  const genderBundle = useMemo<ChartBundle>(() => {
    const maleStemm = filteredRows.filter((row) => row.gender === "Male" && row.programme_cluster === "STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const maleNon = filteredRows.filter((row) => row.gender === "Male" && row.programme_cluster === "Non-STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const femaleStemm = filteredRows.filter((row) => row.gender === "Female" && row.programme_cluster === "STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const femaleNon = filteredRows.filter((row) => row.gender === "Female" && row.programme_cluster === "Non-STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    return {
      data: [
        { type: "bar", name: "STEMM", x: ["Male", "Female"], y: [maleStemm, femaleStemm], text: [fmtInt(maleStemm), fmtInt(femaleStemm)], textposition: "inside", insidetextanchor: "middle", textfont: { color: "white", size: 12 }, marker: { color: COLORS.stemm }, hovertemplate: "%{x}<br>STEMM: %{y:,}<extra></extra>" },
        { type: "bar", name: "Non-STEMM", x: ["Male", "Female"], y: [maleNon, femaleNon], text: [fmtInt(maleNon), fmtInt(femaleNon)], textposition: "inside", insidetextanchor: "middle", textfont: { color: "white", size: 12 }, marker: { color: COLORS.nonStemm }, hovertemplate: "%{x}<br>Non-STEMM: %{y:,}<extra></extra>" },
      ],
      layout: { ...baseLayout(300), barmode: "group", showlegend: false, margin: { l: 48, r: 18, t: 36, b: 48 }, yaxis: { ...baseLayout().yaxis, title: { text: `${currentMetricLabel} learners` } } },
      fixedLegend: [{ label: "STEMM", color: COLORS.stemm }, { label: "Non-STEMM", color: COLORS.nonStemm }],
    };
  }, [filteredRows, currentMetricLabel]);

  const disciplineMixBundle = useMemo<ChartBundle>(() => {
    const totals = new Map<string, number>();
    DISCIPLINE_ORDER.forEach((label) => totals.set(label, 0));
    filteredRows.forEach((row) => {
      const label = getPolicyDisciplineBucket(row);
      totals.set(label, (totals.get(label) ?? 0) + safeNum(row.matriculated_count));
    });
    const labels = DISCIPLINE_ORDER.filter((label) => (totals.get(label) ?? 0) > 0);
    const values = labels.map((label) => totals.get(label) ?? 0);
    const detailRows = labels.slice(0, 7);
    const layout = baseLayout(340);
    layout.margin = { l: 8, r: 8, t: 8, b: 8 };
    layout.showlegend = false;
    layout.xaxis = { visible: false };
    layout.yaxis = { visible: false };
    layout.shapes = detailRows.flatMap((_, index) => {
      if (index === detailRows.length - 1) return [];
      const y = 0.82 - index * 0.11 - 0.055;
      return [{ type: "line", xref: "paper", yref: "paper", x0: 0.56, x1: 0.95, y0: y, y1: y, line: { color: "rgba(148,163,184,0.22)", width: 1 } }];
    });
    layout.annotations = detailRows.flatMap((label, index) => {
      const value = totals.get(label) ?? 0;
      const y = 0.82 - index * 0.11;
      return [
        {
          x: 0.56,
          y,
          xref: "paper",
          yref: "paper",
          showarrow: false,
          xanchor: "left",
          align: "left",
          text: `<span style="color:${disciplineColor(label)}">●</span> ${label}`,
          font: { size: 11, color: COLORS.text },
        },
        {
          x: 0.95,
          y,
          xref: "paper",
          yref: "paper",
          showarrow: false,
          xanchor: "right",
          align: "right",
          text: `<b>${fmtInt(value)}</b>`,
          font: { size: 11, color: COLORS.text },
        },
      ];
    });
    return {
      data: [{
        type: "pie",
        labels,
        values,
        hole: 0.62,
        sort: false,
        marker: { colors: labels.map((label) => disciplineColor(label)), line: { color: "#ffffff", width: 2 } },
        texttemplate: "%{percent}",
        textposition: "inside",
        textfont: { color: "white", size: 10 },
        hovertemplate: "%{label}<br>Matriculated: %{value:,}<br>%{percent}<extra></extra>",
        showlegend: false,
        domain: { x: [0.02, 0.45], y: [0.08, 0.94] },
      }],
      layout,
      fixedLegend: labels.map((label) => ({ label, color: disciplineColor(label) })),
    };
  }, [filteredRows]);

  const topMatriculatedCoursesBundle = useMemo<ChartBundle>(() => {
    const grouped = new Map<string, { value: number; color: string; hoverLabel: string }>();
    filteredRows.forEach((row) => {
      const key = row.programme;
      const bucket = getPolicyDisciplineBucket(row);
      const entry = grouped.get(key) ?? { value: 0, color: disciplineColor(bucket), hoverLabel: bucket };
      entry.value += safeNum(row.admitted_count);
      grouped.set(key, entry);
    });
    return buildMultiColorRankedChart(
      [...grouped.entries()].map(([label, value]) => ({ label, value: value.value, color: value.color, hoverLabel: value.hoverLabel })),
      "admitted learners",
    );
  }, [filteredRows]);

  const topStemmCoursesBundle = useMemo(() => buildRankedChart(
    [...filteredRows.filter((row) => row.programme_cluster === "STEMM").reduce((map, row) => {
      map.set(row.programme, (map.get(row.programme) ?? 0) + safeNum(row.admitted_count));
      return map;
    }, new Map<string, number>()).entries()].map(([label, value]) => ({ label, value })),
    COLORS.stemm,
    "admitted learners",
    true,
  ), [filteredRows]);

  const lowestStemmCoursesBundle = useMemo(() => buildRankedChart(
    [...filteredRows.filter((row) => row.programme_cluster === "STEMM").reduce((map, row) => {
      map.set(row.programme, (map.get(row.programme) ?? 0) + safeNum(row.admitted_count));
      return map;
    }, new Map<string, number>()).entries()].map(([label, value]) => ({ label, value })),
    COLORS.stemm,
    "admitted learners",
    false,
  ), [filteredRows]);


  const topNonStemmCoursesBundle = useMemo(() => buildRankedChart(
    [...filteredRows.filter((row) => row.programme_cluster === "Non-STEMM").reduce((map, row) => {
      map.set(row.programme, (map.get(row.programme) ?? 0) + safeNum(row.admitted_count));
      return map;
    }, new Map<string, number>()).entries()].map(([label, value]) => ({ label, value })),
    COLORS.nonStemm,
    "admitted learners",
    true,
  ), [filteredRows]);

  const lowestNonStemmCoursesBundle = useMemo(() => buildRankedChart(
    [...filteredRows.filter((row) => row.programme_cluster === "Non-STEMM").reduce((map, row) => {
      map.set(row.programme, (map.get(row.programme) ?? 0) + safeNum(row.admitted_count));
      return map;
    }, new Map<string, number>()).entries()].map(([label, value]) => ({ label, value })),
    COLORS.nonStemm,
    "admitted learners",
    false,
  ), [filteredRows]);

  const institutionAdmissionRows = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredRows.forEach((row) => {
      grouped.set(row.tertiary_institution, (grouped.get(row.tertiary_institution) ?? 0) + safeNum(row.admitted_count));
    });
    return [...grouped.entries()].map(([label, value]) => ({ label, value }));
  }, [filteredRows]);

  const topStemmInstitutionsBundle = useMemo(() => buildRankedChart(
    institutionAdmissionRows,
    COLORS.admitted,
    "admitted learners",
    true,
  ), [institutionAdmissionRows]);

  const lowestStemmInstitutionsBundle = useMemo(() => buildRankedChart(
    institutionAdmissionRows,
    COLORS.admitted,
    "admitted learners",
    false,
  ), [institutionAdmissionRows]);

  const topNonStemmInstitutionsBundle = useMemo(() => buildRankedChart(
    groupedBy(filteredRows.filter((row) => row.programme_cluster === "Non-STEMM"), (row) => row.tertiary_institution).map((row) => ({ label: row.key, value: row.nonStemm })),
    COLORS.nonStemm,
    `${currentMetricLabel} learners`,
    true,
  ), [filteredRows, currentMetricLabel]);

  const lowestNonStemmInstitutionsBundle = useMemo(() => buildRankedChart(
    groupedBy(filteredRows.filter((row) => row.programme_cluster === "Non-STEMM"), (row) => row.tertiary_institution).map((row) => ({ label: row.key, value: row.nonStemm })),
    COLORS.nonStemm,
    `${currentMetricLabel} learners`,
    false,
  ), [filteredRows, currentMetricLabel]);

  const stemmNonStemmTrendBundle = useMemo<ChartBundle>(() => {
    const sessions = POLICY_IMPACT_SESSIONS.filter((session) => trendRows.some((row) => row.session === session));
    const stemmMatric = sessions.map((session) => trendRows
      .filter((row) => row.session === session && row.programme_cluster === "STEMM")
      .reduce((sum, row) => sum + safeNum(row.matriculated_count), 0));
    const nonStemmMatric = sessions.map((session) => trendRows
      .filter((row) => row.session === session && row.programme_cluster === "Non-STEMM")
      .reduce((sum, row) => sum + safeNum(row.matriculated_count), 0));
    return {
      data: [
        { type: "scatter", mode: "text+lines+markers", name: "STEMM Matriculated", x: sessions, y: stemmMatric, text: stemmMatric.map((v) => fmtInt(v)), textposition: "top center", line: { color: COLORS.stemm, width: 3 }, marker: { size: 8, symbol: "circle" }, hovertemplate: "%{x}<br>STEMM Matriculated: %{y:,}<extra></extra>" },
        { type: "scatter", mode: "text+lines+markers", name: "Non-STEMM Matriculated", x: sessions, y: nonStemmMatric, text: nonStemmMatric.map((v) => fmtInt(v)), textposition: "bottom center", line: { color: COLORS.nonStemm, width: 3, dash: "dot" }, marker: { size: 8, symbol: "diamond" }, hovertemplate: "%{x}<br>Non-STEMM Matriculated: %{y:,}<extra></extra>" },
      ],
      layout: { ...baseLayout(340), showlegend: false, yaxis: { ...baseLayout().yaxis, title: { text: "Matriculated learners" } } },
      fixedLegend: [{ label: "STEMM Matriculated", color: COLORS.stemm }, { label: "Non-STEMM Matriculated", color: COLORS.nonStemm, dashed: true }],
    };
  }, [trendRows]);

  const loanTrendBundle = useMemo<ChartBundle>(() => {
    const sessions: string[] = [...LOAN_TREND_SESSIONS];
    const scoped = filteredLoanRows.filter((row) => sessions.includes(row.session));
    const applications = sessions.map((session) => scoped.filter((row) => row.session === session).reduce((sum, row) => sum + safeNum(row.loan_applications), 0));
    const disbursed = sessions.map((session) => scoped.filter((row) => row.session === session).reduce((sum, row) => sum + safeNum(row.loan_disbursed), 0));
    return {
      data: [
        { type: "bar", name: "Loan Applications", x: sessions, y: applications, text: applications.map((v) => fmtInt(v)), textposition: "inside", insidetextanchor: "middle", constraintext: "none", textfont: { color: "#ffffff", size: 11 }, cliponaxis: false, marker: { color: COLORS.applications }, hovertemplate: "%{x}<br>Applications: %{y:,}<extra></extra>" },
        { type: "scatter", mode: "text+lines+markers", name: "Loans Disbursed", x: sessions, y: disbursed, text: disbursed.map((v) => fmtInt(v)), textposition: "top center", line: { color: COLORS.disbursed, width: 3 }, marker: { size: 8 }, hovertemplate: "%{x}<br>Disbursed: %{y:,}<extra></extra>" },
      ],
      layout: { ...baseLayout(360), showlegend: false, margin: { l: 48, r: 20, t: 36, b: 56 }, yaxis: { ...baseLayout().yaxis, title: { text: "Volume" } } },
      fixedLegend: [{ label: "Loan Applications", color: COLORS.applications }, { label: "Loans Disbursed", color: COLORS.disbursed }],
    };
  }, [filteredLoanRows]);

  const loanInstitutionBundle = useMemo<ChartBundle>(() => {
    const grouped = [...new Set(filteredLoanRows.map((row) => row.institution_type))].map((type) => ({
      label: type,
      approved: filteredLoanRows.filter((row) => row.institution_type === type).reduce((sum, row) => sum + safeNum(row.loan_approved), 0),
      disbursed: filteredLoanRows.filter((row) => row.institution_type === type).reduce((sum, row) => sum + safeNum(row.loan_disbursed), 0),
    }));
    return {
      data: [
        { type: "bar", name: "Approved", x: grouped.map((row) => row.label), y: grouped.map((row) => row.approved), text: grouped.map((row) => fmtInt(row.approved)), textposition: "inside", insidetextanchor: "middle", textfont: { color: "white" }, marker: { color: COLORS.applications }, hovertemplate: "%{x}<br>Approved: %{y:,}<extra></extra>" },
        { type: "bar", name: "Disbursed", x: grouped.map((row) => row.label), y: grouped.map((row) => row.disbursed), text: grouped.map((row) => fmtInt(row.disbursed)), textposition: "inside", insidetextanchor: "middle", textfont: { color: "white" }, marker: { color: COLORS.disbursed }, hovertemplate: "%{x}<br>Disbursed: %{y:,}<extra></extra>" },
      ],
      layout: { ...baseLayout(400), barmode: "group", showlegend: false, margin: { l: 44, r: 14, t: 34, b: 42 }, yaxis: { ...baseLayout().yaxis, title: { text: "Loan volume" } } },
      fixedLegend: [{ label: "Approved", color: COLORS.applications }, { label: "Disbursed", color: COLORS.disbursed }],
    };
  }, [filteredLoanRows]);

  const loanDisciplineBundle = useMemo<ChartBundle>(() => {
    const grouped = LOAN_DISCIPLINE_ORDER
      .map((group) => ({
        label: group,
        approved: filteredLoanRows.filter((row) => normaliseDisciplineGroup(row.discipline_group) === group).reduce((sum, row) => sum + safeNum(row.loan_approved), 0),
        disbursed: filteredLoanRows.filter((row) => normaliseDisciplineGroup(row.discipline_group) === group).reduce((sum, row) => sum + safeNum(row.loan_disbursed), 0),
      }))
      .filter((row) => row.approved > 0 || row.disbursed > 0);
    return {
      data: [
        { type: "bar", name: "Approved", orientation: "h", y: grouped.map((row) => row.label), x: grouped.map((row) => row.approved), text: grouped.map((row) => fmtInt(row.approved)), textposition: "inside", insidetextanchor: "middle", constraintext: "none", textfont: { color: "#ffffff", size: 11 }, cliponaxis: false, marker: { color: COLORS.applications }, hovertemplate: "%{y}<br>Approved: %{x:,}<extra></extra>" },
        { type: "bar", name: "Disbursed", orientation: "h", y: grouped.map((row) => row.label), x: grouped.map((row) => row.disbursed), text: grouped.map((row) => fmtInt(row.disbursed)), textposition: "inside", textfont: { color: "white", size: 11 }, marker: { color: COLORS.disbursed }, hovertemplate: "%{y}<br>Disbursed: %{x:,}<extra></extra>" },
      ],
      layout: { ...baseLayout(Math.max(330, grouped.length * 28 + 96)), barmode: "stack", showlegend: false, xaxis: { ...baseLayout().xaxis, title: { text: "Loan volume" } }, yaxis: { ...baseLayout().yaxis, automargin: true, tickfont: { color: COLORS.sub, size: 11 } }, margin: { l: 188, r: 14, t: 24, b: 42 } },
      fixedLegend: [{ label: "Approved", color: COLORS.applications }, { label: "Disbursed", color: COLORS.disbursed }],
    };
  }, [filteredLoanRows]);

  // ── Drill handlers ── defined before expandedCharts so they're in scope
  const handleZoneClick = (event: PlotPointEvent) => {
    const label = String(event.points?.[0]?.y ?? event.points?.[0]?.x ?? "");
    if (!label) return;
    if (zoneLevel === "zone") {
      // Clicked a zone — both charts now drill into that zone's states
      setZoneDrill({ zone: label });
      setStateDrill({ zone: label });
      setFilters((prev) => ({ ...prev, zone: label, state: "", lga: "", tertiary_institution: "" }));
    } else if (zoneLevel === "state") {
      // Clicked a state inside a zone — drill into that state's LGAs
      setZoneDrill((prev) => ({ ...prev, state: label }));
      setStateDrill((prev) => ({ ...prev, state: label }));
      setFilters((prev) => ({ ...prev, state: label, lga: "", tertiary_institution: "" }));
    } else if (zoneLevel === "lga") {
      // Clicked an LGA — drill into institutions
      setZoneDrill((prev) => ({ ...prev, lga: label }));
      setStateDrill((prev) => ({ ...prev, lga: label }));
      setFilters((prev) => ({ ...prev, lga: label, tertiary_institution: "" }));
    }
  };

  const handleStateClick = (event: PlotPointEvent) => {
    const label = String(event.points?.[0]?.y ?? event.points?.[0]?.x ?? "");
    if (!label) return;
    if (stateLevel === "state") {
      // Clicked a state — find its zone so both charts stay in sync
      const matched = drillBaseRows.find((row) => row.state === label);
      if (matched) {
        setZoneDrill({ zone: matched.zone, state: label });
        setStateDrill({ zone: matched.zone, state: label });
        setFilters((prev) => ({ ...prev, zone: matched.zone, state: label, lga: "", tertiary_institution: "" }));
      } else {
        setStateDrill({ state: label });
        setFilters((prev) => ({ ...prev, state: label, lga: "", tertiary_institution: "" }));
      }
    } else if (stateLevel === "lga") {
      setStateDrill((prev) => ({ ...prev, lga: label }));
      setZoneDrill((prev) => ({ ...prev, lga: label }));
      setFilters((prev) => ({ ...prev, lga: label, tertiary_institution: "" }));
    }
  };

  const expandedCharts: Record<ChartKey, { bundle: ChartBundle; onPlotClick?: (event: PlotPointEvent) => void }> = {
    mix: { bundle: programmeMixBundle },
    zone: { bundle: zoneBundle, onPlotClick: handleZoneClick },
    state: { bundle: stateBundle, onPlotClick: handleStateClick },
    gender: { bundle: genderBundle },
    disciplineMix: { bundle: disciplineMixBundle },
    topMatriculatedCourses: { bundle: topMatriculatedCoursesBundle },
    topStemmCourses: { bundle: topStemmCoursesBundle },
    lowestStemmCourses: { bundle: lowestStemmCoursesBundle },
    topNonStemmCourses: { bundle: topNonStemmCoursesBundle },
    lowestNonStemmCourses: { bundle: lowestNonStemmCoursesBundle },
    topStemmInstitutions: { bundle: topStemmInstitutionsBundle },
    lowestStemmInstitutions: { bundle: lowestStemmInstitutionsBundle },
    topNonStemmInstitutions: { bundle: topNonStemmInstitutionsBundle },
    lowestNonStemmInstitutions: { bundle: lowestNonStemmInstitutionsBundle },
    stemmNonStemmTrend: { bundle: stemmNonStemmTrendBundle },
    loanTrend: { bundle: loanTrendBundle },
    loanInstitution: { bundle: loanInstitutionBundle },
    loanDiscipline: { bundle: loanDisciplineBundle },
  };

  const expandedChart = expandState ? expandedCharts[expandState.key] : null;

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">Loading Policy Impact dashboard…</div>;
  }

  if (error) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-10 text-center text-rose-700">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div id="policy-impact-kpi" className="grid gap-4 scroll-mt-36 md:grid-cols-4">
        {metricCards.map((item) => <KpiCard key={item.label} item={item} previousSessionLabel={previousSession || undefined} />)}
      </div>

      <div id="policy-impact-mix" className="space-y-4 scroll-mt-36">
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title={buildChartTitle("Programme Mix: STEMM vs Non-STEMM")} explanation={CHART_HELP.mix} bundle={programmeMixBundle} onExpand={() => setExpandState({ key: "mix", title: buildChartTitle("Programme Mix: STEMM vs Non-STEMM") })} onRefresh={() => undefined} />
          <ChartCard title={buildChartTitle("STEMM vs Non-STEMM by Gender")} explanation={CHART_HELP.gender} bundle={genderBundle} onExpand={() => setExpandState({ key: "gender", title: buildChartTitle("STEMM vs Non-STEMM by Gender") })} onRefresh={() => undefined} />
        </div>
      </div>

      <div id="policy-impact-breakdown" className="space-y-4 scroll-mt-36">
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title={buildChartTitle(`STEMM vs Non-STEMM by ${zoneLevel === "institution" ? "Institution" : zoneLevel[0].toUpperCase() + zoneLevel.slice(1)}`)} explanation={CHART_HELP.zone} bundle={zoneBundle} onExpand={() => setExpandState({ key: "zone", title: buildChartTitle("STEMM vs Non-STEMM by Zone") })} onRefresh={() => { setZoneDrill({}); setStateDrill({}); setFilters((prev) => ({ ...prev, zone: "", state: "", lga: "", tertiary_institution: "" })); }} onPlotClick={handleZoneClick} />
          <ChartCard title={buildChartTitle(`STEMM vs Non-STEMM by ${stateLevel === "institution" ? "Institution" : stateLevel[0].toUpperCase() + stateLevel.slice(1)}`)} explanation={CHART_HELP.state} bundle={stateBundle} onExpand={() => setExpandState({ key: "state", title: buildChartTitle("STEMM vs Non-STEMM by State") })} onRefresh={() => { setStateDrill({}); setZoneDrill({}); setFilters((prev) => ({ ...prev, state: "", lga: "", tertiary_institution: "" })); }} onPlotClick={handleStateClick} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Matriculation by Discipline" explanation={CHART_HELP.disciplineMix} bundle={disciplineMixBundle} onExpand={() => setExpandState({ key: "disciplineMix", title: "Matriculation by Discipline" })} onRefresh={() => undefined} />
          <ChartCard title="Top Admission (10) by Courses" explanation={CHART_HELP.topMatriculatedCourses} bundle={topMatriculatedCoursesBundle} onExpand={() => setExpandState({ key: "topMatriculatedCourses", title: "Top Admission (10) by Courses" })} onRefresh={() => undefined} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title={buildChartTitle("Top 10 Courses in STEMM")} explanation={CHART_HELP.topStemmCourses} bundle={topStemmCoursesBundle} onExpand={() => setExpandState({ key: "topStemmCourses", title: buildChartTitle("Top 10 Courses in STEMM") })} onRefresh={() => undefined} />
          <ChartCard title={buildChartTitle("Lowest 10 Courses in STEMM")} explanation={CHART_HELP.lowestStemmCourses} bundle={lowestStemmCoursesBundle} onExpand={() => setExpandState({ key: "lowestStemmCourses", title: buildChartTitle("Lowest 10 Courses in STEMM") })} onRefresh={() => undefined} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title={buildChartTitle("Top 10 Courses in Non-STEMM")} explanation={CHART_HELP.topNonStemmCourses} bundle={topNonStemmCoursesBundle} onExpand={() => setExpandState({ key: "topNonStemmCourses", title: buildChartTitle("Top 10 Courses in Non-STEMM") })} onRefresh={() => undefined} />
          <ChartCard title={buildChartTitle("Lowest 10 Courses in Non-STEMM")} explanation={CHART_HELP.lowestNonStemmCourses} bundle={lowestNonStemmCoursesBundle} onExpand={() => setExpandState({ key: "lowestNonStemmCourses", title: buildChartTitle("Lowest 10 Courses in Non-STEMM") })} onRefresh={() => undefined} />
        </div>
      </div>

      <div id="policy-impact-rankings" className="space-y-4 scroll-mt-36">
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title={buildChartTitle("Top 10 Institutions by Admission")} explanation={CHART_HELP.topStemmInstitutions} bundle={topStemmInstitutionsBundle} onExpand={() => setExpandState({ key: "topStemmInstitutions", title: buildChartTitle("Top 10 Institutions by Admission") })} onRefresh={() => undefined} />
          <ChartCard title={buildChartTitle("Bottom 10 Institutions by Admission")} explanation={CHART_HELP.lowestStemmInstitutions} bundle={lowestStemmInstitutionsBundle} onExpand={() => setExpandState({ key: "lowestStemmInstitutions", title: buildChartTitle("Bottom 10 Institutions by Admission") })} onRefresh={() => undefined} />
        </div>
      </div>

      <div id="policy-impact-trends" className="space-y-4 scroll-mt-36">
        <div className="grid gap-4">
          <ChartCard title="STEMM & Non-STEMM Matriculated Trend" explanation={CHART_HELP.stemmNonStemmTrend} bundle={stemmNonStemmTrendBundle} onExpand={() => setExpandState({ key: "stemmNonStemmTrend", title: "STEMM & Non-STEMM Matriculated Trend" })} onRefresh={() => undefined} />
        </div>
      </div>

      <div id="policy-impact-loans" className="space-y-4 scroll-mt-36">
        <div className="grid gap-4">
          <ChartCard title="Number of Loan Applications vs Number of Loans Disbursed per Academic Session" explanation={CHART_HELP.loanTrend} bundle={loanTrendBundle} onExpand={() => setExpandState({ key: "loanTrend", title: "Number of Loan Applications vs Number of Loans Disbursed per Academic Session" })} onRefresh={() => undefined} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Count of Approved/Disbursed Loans by Institution Type" explanation={CHART_HELP.loanInstitution} bundle={loanInstitutionBundle} onExpand={() => setExpandState({ key: "loanInstitution", title: "Count of Approved/Disbursed Loans by Institution Type" })} onRefresh={() => undefined} />
          <ChartCard title="Count of Approved/Disbursed Loans by Discipline" explanation={CHART_HELP.loanDiscipline} bundle={loanDisciplineBundle} onExpand={() => setExpandState({ key: "loanDiscipline", title: "Count of Approved/Disbursed Loans by Discipline" })} onRefresh={() => undefined} />
        </div>
      </div>

      {expandState ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onClick={() => setExpandState(null)}
        >
          <div
            className="flex w-full max-w-[1080px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            style={{ height: "88vh" }}
            onClick={(event) => event.stopPropagation()}
          >
            {/* Fixed header */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <div className="text-base font-extrabold text-slate-900">{expandState.title}</div>
                <div className="mt-0.5 text-xs text-slate-500">{CHART_HELP[expandState.key]}</div>
              </div>
              <button
                type="button"
                onClick={() => setExpandState(null)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Fixed legend row (if applicable) */}
            {expandedChart?.bundle.fixedLegend?.length ? (
              <div className="shrink-0 border-b border-slate-50 px-6 py-3">
                <FixedLegend items={expandedChart.bundle.fixedLegend} />
              </div>
            ) : null}

            {/* Chart area — fills remaining height; only zone/state charts scroll */}
            <div className={[
              "min-h-0 flex-1",
              expandedChart?.bundle.scrollable ? "overflow-y-auto" : "overflow-hidden",
              "px-6 pb-6 pt-4",
            ].join(" ")}>
              {expandedChart ? (
                <Plot
                  data={expandedChart.bundle.data}
                  layout={{
                    ...expandedChart.bundle.layout,
                    height: expandedChart.bundle.scrollable
                      ? (expandedChart.bundle.expandedMaxHeight ?? 640)
                      : undefined,
                    autosize: !expandedChart.bundle.scrollable,
                    showlegend: expandedChart.bundle.fixedLegend?.length
                      ? false
                      : expandedChart.bundle.layout.showlegend,
                  }}
                  config={expandedChart.bundle.config ?? { displayModeBar: false, responsive: true }}
                  style={{ width: "100%", height: expandedChart.bundle.scrollable ? "auto" : "100%" }}
                  useResizeHandler
                  onClick={expandedChart.onPlotClick}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

