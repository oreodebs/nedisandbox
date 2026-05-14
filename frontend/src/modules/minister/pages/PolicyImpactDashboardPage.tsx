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
import {
  canonicalState,
  loadRefinedFile,
  loadRefinedScopedRows,
  scopeDepthForLocation,
} from "../utils/refinedPageData";
import {
  LOAN_TREND_SESSIONS,
  POLICY_IMPACT_SESSIONS,
  TRANSITION_SESSIONS,
  filterRowsBySessionWindow,
} from "../utils/sessionWindows";
import {
  canUseCanonicalPolicyMatriculation,
  filterCanonicalTransitionRows,
  sumCanonicalTransitionMetrics,
  type CanonicalTransitionRow,
} from "../utils/canonicalTransitionMetrics";

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
  breakdown?: Array<{ label: string; value: string }>;
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
  titleNote?: string;
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


type SortMode = "alphabetical" | "desc" | "asc";
type SortablePolicyChartKey = Extract<ChartKey, "zone" | "state">;
type PolicyLocationLevel = "zone" | "state" | "lga" | "institution" | "gender" | "other";

const DEFAULT_SORT_MODE: SortMode = "alphabetical";
const DEFAULT_POLICY_SORT_MODES: Record<SortablePolicyChartKey, SortMode> = {
  zone: DEFAULT_SORT_MODE,
  state: DEFAULT_SORT_MODE,
};
const ABUJA_STATE_NAME = "Abuja Federal Capital Territory";
const ABUJA_STATE_LABEL = "FCT";
const INTERNATIONAL_ZONE_NAME = "International";
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

function isInternationalZone(value: string): boolean {
  return value.trim().toLowerCase() === INTERNATIONAL_ZONE_NAME.toLowerCase();
}

function displayPolicyLabel(label: string, level?: PolicyLocationLevel): string {
  const trimmed = String(label ?? "").trim();
  if ((level === undefined || level === "state") && [ABUJA_STATE_NAME, ABUJA_STATE_LABEL, "Abuja FCT", "Abuja"].includes(trimmed)) {
    return ABUJA_STATE_LABEL;
  }
  return trimmed;
}

function sourcePolicyLabel(label: string): string {
  const trimmed = String(label ?? "").trim();
  return [ABUJA_STATE_LABEL, "Abuja FCT", "Abuja"].includes(trimmed) ? ABUJA_STATE_NAME : trimmed;
}

function zoneForState(state: string): string {
  return STATE_ZONE_MAP[sourcePolicyLabel(state)] ?? STATE_ZONE_MAP[state] ?? "";
}

function comparePolicyLabels(left: string, right: string, level?: PolicyLocationLevel): number {
  return displayPolicyLabel(left, level).localeCompare(displayPolicyLabel(right, level));
}

function compactPolicyLabel(label: string, maxLength = 54): string {
  const trimmed = String(label ?? "").trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(8, maxLength - 1)).trimEnd()}…`;
}

function cleanInstitutionLabel(label: string): string {
  let cleaned = String(label ?? "").trim();
  if (!cleaned) return cleaned;

  const stateNames = STATE_SOURCE_NAMES
    .map((state) => state.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const statePattern = `(?:${stateNames}|FCT|Abuja FCT|Abuja)(?:\\s+State)?`;

  cleaned = cleaned.replace(new RegExp(`\\s*[–—-]\\s*[^–—-]*\\b${statePattern}\\b.*$`, "i"), "");
  cleaned = cleaned.replace(new RegExp(`\\s*\\([^)]*\\b${statePattern}\\b[^)]*\\)\\s*$`, "i"), "");
  cleaned = cleaned.replace(new RegExp(`,\\s*([^,]+),\\s*${statePattern}\\s*$`, "i"), (match, city: string) => {
    const base = cleaned.slice(0, cleaned.length - match.length).trim();
    const cityName = String(city ?? "").trim();
    const baseTokens = base.toLowerCase().split(/\s+/);
    const cityTokens = cityName.toLowerCase().split(/\s+/);
    const lastCityToken = cityTokens[cityTokens.length - 1] ?? "";
    return lastCityToken && baseTokens.includes(lastCityToken) ? "" : `, ${cityName}`;
  });
  cleaned = cleaned.replace(new RegExp(`,\\s*${statePattern}\\s*$`, "i"), "");

  return cleaned.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").trim();
}

function stateLabelsForZone(zone: string): string[] {
  return STATE_SOURCE_NAMES.filter((state) => !zone || STATE_ZONE_MAP[state] === zone).sort((left, right) => comparePolicyLabels(left, right, "state"));
}

function sortPolicyRows<T extends { label: string }>(
  rows: T[],
  sortMode: SortMode,
  getValue: (row: T) => number,
  level?: PolicyLocationLevel,
): T[] {
  return [...rows].sort((left, right) => {
    if (sortMode === "desc" || sortMode === "asc") {
      const direction = sortMode === "desc" ? -1 : 1;
      const diff = (getValue(left) - getValue(right)) * direction;
      if (diff !== 0) return diff;
    }
    return comparePolicyLabels(left.label, right.label, level);
  });
}

function minimumVisibleStackValues(seriesValues: number[][], minRatio = 0.055): number[][] {
  const rowCount = Math.max(0, ...seriesValues.map((series) => series.length));
  const totals = Array.from({ length: rowCount }, (_, index) =>
    seriesValues.reduce((sum, series) => sum + Math.max(0, safeNum(series[index])), 0),
  );
  const maxTotal = Math.max(...totals, 1);
  const minimum = Math.max(maxTotal * minRatio, 1);

  return seriesValues.map((series) =>
    series.map((value) => {
      const numeric = safeNum(value);
      if (numeric <= 0) return 0;
      return Math.max(numeric, minimum);
    }),
  );
}

function minimumVisibleValues(values: number[], minRatio = 0.065): number[] {
  const maxValue = Math.max(...values.map((value) => safeNum(value)), 1);
  const minimum = Math.max(maxValue * minRatio, 1);
  return values.map((value) => {
    const numeric = safeNum(value);
    if (numeric <= 0) return 0;
    return Math.max(numeric, minimum);
  });
}

function titleGrandTotal(label: string, value: number): string {
  return `Grand Total: ${fmtInt(value)} ${label}`;
}

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
  mix: "Programme Mix shows the share of STEMM versus Non-STEMM students in the current view.",
  zone: "Compares matriculated students in STEMM and Non-STEMM programmes across zones.",
  state: "Compares matriculated students in STEMM and Non-STEMM programmes across states.",
  gender: "This grouped bar chart compares male and female students across STEMM and Non-STEMM in the selected stage.",
  disciplineMix: "This donut chart shows matriculated students by discipline family. All STEMM disciplines are combined into one STEMM slice, while Non-STEMM is grouped into ART, Social Sciences, and Education.",
  topMatriculatedCourses: "This ranked horizontal bar chart shows top courses by matriculated students in the selected session and filters. Each course inherits the color of its discipline family from the discipline donut chart beside it.",
  topStemmCourses: "This ranking chart shows the ten STEMM programmes with the highest learner volume in the current stage and filter context.",
  lowestStemmCourses: "This ranking chart shows the ten STEMM programmes with the lowest learner volume in the current stage and filter context.",
  topNonStemmCourses: "This ranking chart shows the ten Non-STEMM programmes with the highest learner volume in the current stage and filter context.",
  lowestNonStemmCourses: "This ranking chart shows the ten Non-STEMM programmes with the lowest learner volume in the current stage and filter context.",
  topStemmInstitutions: "This chart ranks the top institutions by matriculated students for the selected session and filters.",
  lowestStemmInstitutions: "This chart ranks the lowest institutions by matriculated students for the selected session and filters.",
  topNonStemmInstitutions: "This chart ranks the institutions with the highest Non-STEMM learner volume in the current stage.",
  lowestNonStemmInstitutions: "This chart ranks the institutions with the lowest Non-STEMM learner volume in the current stage.",
  stemmNonStemmTrend: "This trend chart shows STEMM and Non-STEMM matriculated students side by side.",
  loanTrend: "This vertical grouped bar chart compares loan applications and loans disbursed by academic session.",
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
  options?: {
    sortMode?: SortMode;
    level?: PolicyLocationLevel;
    titleNote?: string;
  },
): ChartBundle {
  const level = options?.level ?? "other";
  const sortMode = options?.sortMode ?? DEFAULT_SORT_MODE;
  const displayMetricLabel = metricLabel.trim() || "value";
  const sorted = sortPolicyRows(
    rows.filter((row) => !(level === "zone" && isInternationalZone(row.label))),
    sortMode,
    (row) => row.stemm + row.nonStemm,
    level,
  );
  const sourceLabels = sorted.map((row) => row.label);
  const fullDisplayLabels = sorted.map((row) => displayPolicyLabel(row.label, level));
  const displayLabels = fullDisplayLabels.map((label) => (level === "institution" ? compactPolicyLabel(label, 48) : label));
  const stemmValues = sorted.map((row) => row.stemm);
  const nonStemmValues = sorted.map((row) => row.nonStemm);
  const [stemmVisualValues, nonStemmVisualValues] = minimumVisibleStackValues([stemmValues, nonStemmValues], 0.1);
  const dynamicHeight = Math.max(380, sorted.length * 36 + 112);
  const maxVisualTotal = Math.max(...stemmVisualValues.map((value, index) => value + (nonStemmVisualValues[index] ?? 0)), 1);

  return {
    data: [
      {
        type: "bar",
        orientation: "h",
        name: "STEMM",
        y: displayLabels,
        x: stemmVisualValues,
        text: stemmValues.map((value) => (value > 0 ? fmtInt(value) : "")),
        textposition: "inside",
        textangle: 0,
        insidetextanchor: "start",
        constraintext: "none",
        textfont: { color: "white", size: 10.5 },
        cliponaxis: false,
        marker: { color: COLORS.stemm, line: { width: 0 } },
        customdata: sorted.map((row, index) => [sourceLabels[index], fullDisplayLabels[index], row.stemm]),
        hovertemplate: `<b>%{customdata[1]}</b><br>STEMM ${displayMetricLabel}: %{customdata[2]:,.0f}<extra></extra>`,
      },
      {
        type: "bar",
        orientation: "h",
        name: "Non-STEMM",
        y: displayLabels,
        x: nonStemmVisualValues,
        text: nonStemmValues.map((value) => (value > 0 ? fmtInt(value) : "")),
        textposition: "inside",
        textangle: 0,
        insidetextanchor: "end",
        constraintext: "none",
        textfont: { color: "white", size: 10.5 },
        cliponaxis: false,
        marker: { color: COLORS.nonStemm, line: { width: 0 } },
        customdata: sorted.map((row, index) => [sourceLabels[index], fullDisplayLabels[index], row.nonStemm]),
        hovertemplate: `<b>%{customdata[1]}</b><br>Non-STEMM ${displayMetricLabel}: %{customdata[2]:,.0f}<extra></extra>`,
      },
    ],
    layout: {
      ...baseLayout(dynamicHeight),
      barmode: "stack",
      bargap: 0.28,
      margin: { l: 92, r: 18, t: 12, b: 34 },
      showlegend: false,
      xaxis: {
        range: [0, Math.ceil(maxVisualTotal * 1.08)],
        showgrid: false,
        showticklabels: false,
        zeroline: false,
        ticks: "",
        fixedrange: true,
        title: undefined,
      },
      yaxis: { ...baseLayout().yaxis, automargin: false, tickfont: { color: COLORS.sub, size: 10.5 }, autorange: "reversed", showgrid: false },
      title: undefined,
      uirevision: `policy-${level}-${sortMode}-${displayLabels.join("|")}-${stemmValues.join("|")}-${nonStemmValues.join("|")}`,
    },
    fixedLegend: [
      { label: "STEMM", color: COLORS.stemm },
      { label: "Non-STEMM", color: COLORS.nonStemm },
    ],
    scrollable: sorted.length > 10,
    scrollMaxHeight: 360,
    expandedMaxHeight: Math.max(620, sorted.length * 40 + 140),
    expandedWidthClass: level === "state" || level === "lga" || level === "institution" ? "max-w-[96vw]" : "max-w-[94vw]",
    titleNote: options?.titleNote,
  };
}

function buildRankedChart(rows: RankedRow[], color: string, metricLabel: string, descending = true, titleNote?: string): ChartBundle {
  const filtered = rows.filter((row) => row.value > 0);
  const ranked = [...filtered]
    .sort((left, right) => (descending ? right.value - left.value : left.value - right.value))
    .slice(0, 10);
  const displayLabels = ranked.map((row) => compactPolicyLabel(displayPolicyLabel(row.label), 58));
  const actualValues = ranked.map((row) => row.value);
  const visualValues = minimumVisibleValues(actualValues, 0.18);
  const maxVisualValue = Math.max(...visualValues, 1);

  return {
    data: [
      {
        type: "bar",
        orientation: "h",
        y: displayLabels,
        x: visualValues,
        marker: { color },
        text: actualValues.map((value) => fmtInt(value)),
        textposition: "inside",
        textangle: 0,
        insidetextanchor: "middle",
        constraintext: "none",
        textfont: { color: "white", size: 11 },
        cliponaxis: false,
        customdata: ranked.map((row) => [displayPolicyLabel(row.label), row.value]),
        hovertemplate: "<b>%{customdata[0]}</b><br>%{customdata[1]:,.0f} " + metricLabel + "<extra></extra>",
      },
    ],
    layout: {
      ...baseLayout(Math.max(330, ranked.length * 30 + 100)),
      xaxis: { range: [0, Math.ceil(maxVisualValue * 1.04)], showgrid: false, showticklabels: false, zeroline: false, ticks: "", fixedrange: true },
      yaxis: { ...baseLayout().yaxis, automargin: true, tickfont: { color: COLORS.sub, size: 11 }, autorange: descending ? "reversed" : true },
      showlegend: false,
      margin: { l: 118, r: 28, t: 20, b: 24 },
    },
    scrollable: ranked.length > 8,
    scrollMaxHeight: 360,
    expandedMaxHeight: 500,
    expandedWidthClass: "max-w-[94vw]",
    titleNote,
  };
}


function buildMultiColorRankedChart(rows: Array<RankedRow & { color: string; hoverLabel?: string }>, metricLabel: string, titleNote?: string): ChartBundle {
  const ranked = rows
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 10);
  const displayLabels = ranked.map((row) => compactPolicyLabel(displayPolicyLabel(row.label), 58));
  const actualValues = ranked.map((row) => row.value);
  const visualValues = minimumVisibleValues(actualValues, 0.18);
  const maxVisualValue = Math.max(...visualValues, 1);

  return {
    data: [
      {
        type: "bar",
        orientation: "h",
        y: displayLabels,
        x: visualValues,
        marker: { color: ranked.map((row) => row.color) },
        text: actualValues.map((value) => fmtInt(value)),
        textposition: "inside",
        textangle: 0,
        insidetextanchor: "middle",
        constraintext: "none",
        textfont: { color: "white", size: 11 },
        cliponaxis: false,
        customdata: ranked.map((row) => [displayPolicyLabel(row.label), row.value, row.hoverLabel ?? row.label]),
        hovertemplate: "<b>%{customdata[0]}</b><br>%{customdata[1]:,.0f} " + metricLabel + "<br>%{customdata[2]}<extra></extra>",
      },
    ],
    layout: {
      ...baseLayout(Math.max(350, ranked.length * 30 + 110)),
      xaxis: { range: [0, Math.ceil(maxVisualValue * 1.04)], showgrid: false, showticklabels: false, zeroline: false, ticks: "", fixedrange: true },
      yaxis: { ...baseLayout().yaxis, automargin: true, tickfont: { color: COLORS.sub, size: 11 }, autorange: "reversed" },
      showlegend: false,
      margin: { l: 128, r: 28, t: 20, b: 24 },
    },
    scrollable: ranked.length > 8,
    scrollMaxHeight: 360,
    expandedMaxHeight: 500,
    expandedWidthClass: "max-w-[94vw]",
    titleNote,
  };
}



function buildChartTitle(base: string): string {
  return `${base} — Matriculated`;
}

function displayPolicyDrillLevelName(level: "zone" | "state" | "lga"): string {
  if (level === "lga") return "LGA";
  return `${level.charAt(0).toUpperCase()}${level.slice(1)}`;
}

function AlphabeticalSortIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
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
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
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
    <span className="pointer-events-none absolute right-0 top-full z-[100] mt-1 hidden w-[160px] whitespace-normal rounded-lg bg-slate-950 px-2 py-1.5 text-center text-[10px] font-semibold leading-[13px] text-white shadow-xl peer-hover:block peer-focus-visible:block">
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
      ? "Low to High. Click for High to Low."
      : value === "desc"
        ? "High to Low. Click for Low to High."
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
          {item.help ? <div>{item.help}</div> : null}
          {item.breakdown?.length ? (
            <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
              {item.breakdown.map((entry) => (
                <div key={`${item.label}-${entry.label}`} className="flex items-center justify-between gap-3">
                  <span className="text-white/70">{entry.label}</span>
                  <span className="font-semibold text-white">{entry.value}</span>
                </div>
              ))}
            </div>
          ) : null}
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
}: {
  title: string;
  explanation: string;
  bundle: ChartBundle;
  sortControl?: ReactNode;
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

  const plotRenderKey = [
    title,
    bundle.titleNote ?? "",
    String(bundle.scrollable ?? false),
    String((bundle.layout.height as number | undefined) ?? ""),
    bundle.data
      .map((trace) => {
        const item = trace as Record<string, unknown>;
        const x = Array.isArray(item.x) ? item.x.join("|") : String(item.x ?? "");
        const y = Array.isArray(item.y) ? item.y.join("|") : String(item.y ?? "");
        const text = Array.isArray(item.text) ? item.text.join("|") : String(item.text ?? "");
        return `${String(item.name ?? "trace")}:${x}:${y}:${text}`;
      })
      .join("::"),
  ].join("__");

  return (
    <div className="relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900">{title}</div>
          {bundle.titleNote ? <div className="mt-0.5 text-[11px] font-medium leading-4 text-slate-500">{bundle.titleNote}</div> : null}
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
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
                className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-[260px] rounded-xl bg-slate-950 px-3 py-2.5 text-[11px] leading-4 text-white shadow-2xl"
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
        {bundle.fixedLegend?.length ? <FixedLegend items={bundle.fixedLegend} /> : null}
        {bundle.scrollable ? (
          <div className="overflow-y-auto overflow-x-hidden pr-1" style={{ maxHeight: bundle.scrollMaxHeight ?? 320 }}>
            <Plot
              key={plotRenderKey}
              data={bundle.data}
              layout={{ ...bundle.layout, showlegend: bundle.fixedLegend?.length ? false : bundle.layout.showlegend }}
              config={bundle.config ?? { displayModeBar: false, responsive: true }}
              useResizeHandler
              style={{ display: "block", width: "100%", height: "100%" }}
              onClick={onPlotClick}
            />
          </div>
        ) : (
          <Plot
            key={plotRenderKey}
            data={bundle.data}
            layout={{ ...bundle.layout, showlegend: bundle.fixedLegend?.length ? false : bundle.layout.showlegend }}
            config={bundle.config ?? { displayModeBar: false, responsive: true }}
            useResizeHandler
            style={{ display: "block", width: "100%", height: "100%" }}
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
  const [canonicalTransitionRows, setCanonicalTransitionRows] = useState<CanonicalTransitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoneDrill, setZoneDrill] = useState<DrillState>({});
  const [stateDrill, setStateDrill] = useState<DrillState>({});
  const [expandState, setExpandState] = useState<ExpandState>(null);
  const [sortModes, setSortModes] = useState<Record<SortablePolicyChartKey, SortMode>>(DEFAULT_POLICY_SORT_MODES);
  const canonicalTransitionDepth = useMemo(
    () => scopeDepthForLocation(filters),
    [filters.state, filters.lga, filters.ward, filters.school],
  );

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
        setRows(filterRowsBySessionWindow(tertiaryData, POLICY_IMPACT_SESSIONS).filter((row) => !isInternationalZone(row.zone)));
        setLoanRows(filterRowsBySessionWindow(loansData, POLICY_IMPACT_SESSIONS).filter((row) => !isInternationalZone(row.zone)));
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const transitionRows = await loadRefinedScopedRows<CanonicalTransitionRow>("transition_direct", filters.state, canonicalTransitionDepth);
        if (!mounted) return;
        setCanonicalTransitionRows(filterRowsBySessionWindow(transitionRows, TRANSITION_SESSIONS));
      } catch {
        if (!mounted) return;
        setCanonicalTransitionRows([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [filters.state, canonicalTransitionDepth]);

  useEffect(() => {
    if (!filters.state) return;
    const matchedZone = zoneForState(filters.state);
    if (!matchedZone || filters.zone === matchedZone) return;
    setFilters((previous) => ({ ...previous, zone: matchedZone }));
  }, [filters.state, filters.zone, setFilters]);

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

  // General Reset in the parent clears the location filters but does not press this
  // chart's own refresh button. When every location filter is empty, clear the
  // internal drill state as well so the State chart returns to the national view
  // and cannot stay stuck on an old selected State/LGA.
  useEffect(() => {
    if (
      filters.zone ||
      filters.state ||
      filters.lga ||
      filters.ward ||
      filters.school ||
      filters.tertiary_institution
    ) {
      return;
    }
    setZoneDrill({});
    setStateDrill({});
  }, [filters.zone, filters.state, filters.lga, filters.ward, filters.school, filters.tertiary_institution]);

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
    const policyMatriculated = filteredRows.reduce((sum, row) => sum + safeNum(row.matriculated_count), 0);
    const useCanonical = canUseCanonicalPolicyMatriculation(filters);
    const canonicalCurrent = useCanonical
      ? sumCanonicalTransitionMetrics(filterCanonicalTransitionRows(canonicalTransitionRows, filters, disabilityMode))
      : { admitted: 0, matriculated: 0 };
    const canonicalPrevious = useCanonical && previousSession
      ? sumCanonicalTransitionMetrics(filterCanonicalTransitionRows(canonicalTransitionRows, { ...filters, session: previousSession }, disabilityMode))
      : { admitted: 0, matriculated: 0 };
    const totalMatriculated = canonicalCurrent.matriculated || policyMatriculated;
    const matriculationScale = policyMatriculated > 0 ? totalMatriculated / policyMatriculated : 1;
    const rawStemmValue = filteredRows.filter((row) => row.programme_cluster === "STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const rawNonStemmValue = filteredRows.filter((row) => row.programme_cluster === "Non-STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const stemmValue = Math.round(rawStemmValue * matriculationScale);
    const nonStemmValue = totalMatriculated > 0
      ? Math.max(0, totalMatriculated - stemmValue)
      : Math.round(rawNonStemmValue * matriculationScale);
    const totalStage = stemmValue + nonStemmValue;
    const previousAdmitted = previousRows.reduce((sum, row) => sum + safeNum(row.admitted_count), 0);
    const previousPolicyMatriculated = previousRows.reduce((sum, row) => sum + safeNum(row.matriculated_count), 0);
    const previousMatriculated = canonicalPrevious.matriculated || previousPolicyMatriculated;
    const displayAdmitted = canonicalCurrent.admitted || totalAdmitted;
    const displayPreviousAdmitted = canonicalPrevious.admitted || previousAdmitted;
    const prevStemmValue = previousRows.filter((row) => row.programme_cluster === "STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const prevNonStemmValue = previousRows.filter((row) => row.programme_cluster === "Non-STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const prevStage = prevStemmValue + prevNonStemmValue;
    const totalLoansDisbursed = filteredLoanRows.reduce((sum, row) => sum + safeNum(row.loan_disbursed), 0);
    const totalLoanApplications = filteredLoanRows.reduce((sum, row) => sum + safeNum(row.loan_applications), 0);
    const totalLoansApproved = filteredLoanRows.reduce((sum, row) => sum + safeNum(row.loan_approved), 0);
    const previousLoansDisbursed = previousLoanRows.reduce((sum, row) => sum + safeNum(row.loan_disbursed), 0);
    return {
      totalAdmitted: displayAdmitted,
      totalMatriculated,
      totalLoansDisbursed,
      totalLoanApplications,
      totalLoansApproved,
      stemmValue,
      nonStemmValue,
      stemmShare: totalStage ? (stemmValue / totalStage) * 100 : 0,
      nonStemmShare: totalStage ? (nonStemmValue / totalStage) * 100 : 0,
      totalAdmittedDelta: percentDelta(displayAdmitted, displayPreviousAdmitted),
      totalMatriculatedDelta: percentDelta(totalMatriculated, previousMatriculated),
      totalLoansDisbursedDelta: percentDelta(totalLoansDisbursed, previousLoansDisbursed),
      stemmShareDelta: percentDelta(totalStage ? (stemmValue / totalStage) * 100 : 0, prevStage ? (prevStemmValue / prevStage) * 100 : 0),
      nonStemmShareDelta: percentDelta(totalStage ? (nonStemmValue / totalStage) * 100 : 0, prevStage ? (prevNonStemmValue / prevStage) * 100 : 0),
    };
  }, [rows, filteredRows, previousRows, filteredLoanRows, previousLoanRows, filters, disabilityMode, canonicalTransitionRows, previousSession]);

  const metricCards = useMemo<MetricCard[]>(() => [
    {
      label: "Total Matriculated Students",
      value: totals.totalMatriculated,
      delta: totals.totalMatriculatedDelta,
      accent: "#7c3aed",
      bg: "#ede9fe",
      icon: <GraduationCap className="h-5 w-5" />,
      help: "Total students who completed matriculation within the selected filters.",
      breakdown: [
        { label: "Total Matriculated", value: fmtInt(totals.totalMatriculated) },
        { label: "Total Admitted", value: fmtInt(totals.totalAdmitted) },
      ],
    },
    {
      label: "STEMM Share",
      value: totals.stemmShare,
      delta: totals.stemmShareDelta,
      accent: "#16a34a",
      bg: "#dcfce7",
      icon: <BookOpen className="h-5 w-5" />,
      help: "Share of matriculated students in STEMM programmes.",
      suffix: "%",
      breakdown: [
        { label: "STEMM Students", value: fmtInt(totals.stemmValue) },
        { label: "Total Matriculated", value: fmtInt(totals.totalMatriculated) },
      ],
    },
    {
      label: "Non-STEMM Share",
      value: totals.nonStemmShare,
      delta: totals.nonStemmShareDelta,
      accent: "#f59e0b",
      bg: "#fef3c7",
      icon: <Landmark className="h-5 w-5" />,
      help: "Share of matriculated students in Non-STEMM programmes.",
      suffix: "%",
      breakdown: [
        { label: "Non-STEMM Students", value: fmtInt(totals.nonStemmValue) },
        { label: "Total Matriculated", value: fmtInt(totals.totalMatriculated) },
      ],
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
      breakdown: [
        { label: "Applications", value: fmtInt(totals.totalLoanApplications) },
        { label: "Approved", value: fmtInt(totals.totalLoansApproved) },
        { label: "Disbursed", value: fmtInt(totals.totalLoansDisbursed) },
      ],
    },
  ], [totals, filteredLoanRows.length]);

  const rawFilteredMatriculatedTotal = useMemo(
    () => filteredRows.reduce((sum, row) => sum + currentValue(row), 0),
    [filteredRows],
  );
  const matriculatedDisplayScale = rawFilteredMatriculatedTotal > 0
    ? totals.totalMatriculated / rawFilteredMatriculatedTotal
    : 1;
  const displayMatriculatedValue = (value: number): number => Math.round(value * matriculatedDisplayScale);
  const scaleStackRows = (
    sourceRows: Array<{ label: string; stemm: number; nonStemm: number }>,
    targetTotal: number,
  ): Array<{ label: string; stemm: number; nonStemm: number }> => {
    const rawTotal = sourceRows.reduce((sum, row) => sum + row.stemm + row.nonStemm, 0);
    if (rawTotal <= 0 || targetTotal <= 0) return sourceRows;
    let assigned = 0;
    return sourceRows.map((row, index) => {
      if (index === sourceRows.length - 1) {
        const remaining = Math.max(0, targetTotal - assigned);
        const rawRowTotal = row.stemm + row.nonStemm;
        const stemm = rawRowTotal > 0 ? Math.round(remaining * (row.stemm / rawRowTotal)) : 0;
        return { ...row, stemm, nonStemm: Math.max(0, remaining - stemm) };
      }
      const stemm = displayMatriculatedValue(row.stemm);
      const nonStemm = displayMatriculatedValue(row.nonStemm);
      assigned += stemm + nonStemm;
      return { ...row, stemm, nonStemm };
    });
  };

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

  const includeMissingStates = (
    sourceRows: Array<{ label: string; stemm: number; nonStemm: number }>,
    zone: string,
  ): Array<{ label: string; stemm: number; nonStemm: number }> => {
    const map = new Map(sourceRows.map((row) => [sourcePolicyLabel(row.label), { ...row, label: sourcePolicyLabel(row.label) }]));
    stateLabelsForZone(zone).forEach((state) => {
      if (!map.has(state)) map.set(state, { label: state, stemm: 0, nonStemm: 0 });
    });
    return [...map.values()];
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

  const zoneLevel = effectiveZoneDrill.state ? "lga" : effectiveZoneDrill.zone ? "state" : "zone";
  const stateLevel = effectiveStateDrill.state ? "lga" : "state";

  const zoneRows = useMemo(() => {
    let rows: Array<{ label: string; stemm: number; nonStemm: number }>;
    if (zoneLevel === "zone") {
      rows = groupedBy(drillBaseRows.filter((row) => !isInternationalZone(row.zone)), (row) => row.zone)
        .map((row) => ({ label: row.key, stemm: row.stemm, nonStemm: row.nonStemm }));
    } else if (zoneLevel === "state") {
      const rowsForState = groupedBy(zoneScopedRows, (row) => sourcePolicyLabel(row.state))
        .map((row) => ({ label: row.key, stemm: row.stemm, nonStemm: row.nonStemm }));
      rows = includeMissingStates(rowsForState, effectiveZoneDrill.zone ?? "");
    } else if (zoneLevel === "lga") {
      rows = groupedBy(zoneScopedRows, (row) => row.lga).map((row) => ({ label: row.key, stemm: row.stemm, nonStemm: row.nonStemm }));
    } else {
      rows = groupedBy(zoneScopedRows, (row) => row.tertiary_institution).map((row) => ({ label: row.key, stemm: row.stemm, nonStemm: row.nonStemm }));
    }
    return scaleStackRows(rows, totals.totalMatriculated);
  }, [drillBaseRows, zoneScopedRows, zoneLevel, effectiveZoneDrill.zone, matriculatedDisplayScale, totals.totalMatriculated]);

  const stateRows = useMemo(() => {
    let rows: Array<{ label: string; stemm: number; nonStemm: number }>;
    if (stateLevel === "state") {
      const rowsForState = groupedBy(drillBaseRows, (row) => sourcePolicyLabel(row.state))
        .map((row) => ({ label: row.key, stemm: row.stemm, nonStemm: row.nonStemm }));
      rows = includeMissingStates(rowsForState, filters.zone || "");
    } else if (stateLevel === "lga") {
      rows = groupedBy(stateScopedRows, (row) => row.lga).map((row) => ({ label: row.key, stemm: row.stemm, nonStemm: row.nonStemm }));
    } else {
      rows = groupedBy(stateScopedRows, (row) => row.tertiary_institution).map((row) => ({ label: row.key, stemm: row.stemm, nonStemm: row.nonStemm }));
    }
    return scaleStackRows(rows, totals.totalMatriculated);
  }, [drillBaseRows, stateScopedRows, stateLevel, filters.zone, matriculatedDisplayScale, totals.totalMatriculated]);

  const programmeMixBundle = useMemo<ChartBundle>(() => {
    const stemm = totals.stemmValue;
    const nonStemm = totals.nonStemmValue;
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
        hovertemplate: "%{label}<br>%{value:,} students<br>%{percent}<extra></extra>",
        showlegend: false,
        domain: { x: [0.02, 0.45], y: [0.08, 0.94] },
      }],
      layout,
      fixedLegend: [{ label: "STEMM", color: COLORS.stemm }, { label: "Non-STEMM", color: COLORS.nonStemm }],
      titleNote: titleGrandTotal("Matriculated Students", stemm + nonStemm),
    };
  }, [totals.stemmValue, totals.nonStemmValue]);

  const matriculatedGrandTotal = titleGrandTotal("Matriculated Students", totals.totalMatriculated);

  const zoneBundle = useMemo(
    () => buildHorizontalStackedChart(zoneRows, `${currentMetricLabel} students`, {
      sortMode: sortModes.zone,
      level: zoneLevel as PolicyLocationLevel,
      titleNote: matriculatedGrandTotal,
    }),
    [zoneRows, currentMetricLabel, sortModes.zone, zoneLevel, matriculatedGrandTotal],
  );

  const stateBundle = useMemo(
    () => buildHorizontalStackedChart(stateRows, `${currentMetricLabel} students`, {
      sortMode: sortModes.state,
      level: stateLevel as PolicyLocationLevel,
      titleNote: matriculatedGrandTotal,
    }),
    [stateRows, currentMetricLabel, sortModes.state, stateLevel, matriculatedGrandTotal],
  );

  const genderBundle = useMemo<ChartBundle>(() => {
    const rawMaleStemm = filteredRows.filter((row) => row.gender === "Male" && row.programme_cluster === "STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const rawMaleNon = filteredRows.filter((row) => row.gender === "Male" && row.programme_cluster === "Non-STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const rawFemaleStemm = filteredRows.filter((row) => row.gender === "Female" && row.programme_cluster === "STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const rawFemaleNon = filteredRows.filter((row) => row.gender === "Female" && row.programme_cluster === "Non-STEMM").reduce((sum, row) => sum + currentValue(row), 0);
    const genderRows = scaleStackRows([
      { label: "Male", stemm: rawMaleStemm, nonStemm: rawMaleNon },
      { label: "Female", stemm: rawFemaleStemm, nonStemm: rawFemaleNon },
    ], totals.totalMatriculated);
    const [male, female] = genderRows;
    const maleStemm = male?.stemm ?? 0;
    const maleNon = male?.nonStemm ?? 0;
    const femaleStemm = female?.stemm ?? 0;
    const femaleNon = female?.nonStemm ?? 0;
    return {
      data: [
        { type: "bar", name: "STEMM", x: ["Male", "Female"], y: [maleStemm, femaleStemm], text: [fmtInt(maleStemm), fmtInt(femaleStemm)], textposition: "inside", textangle: 0, insidetextanchor: "middle", textfont: { color: "white", size: 12 }, marker: { color: COLORS.stemm }, hovertemplate: "%{x}<br>STEMM: %{y:,}<extra></extra>" },
        { type: "bar", name: "Non-STEMM", x: ["Male", "Female"], y: [maleNon, femaleNon], text: [fmtInt(maleNon), fmtInt(femaleNon)], textposition: "inside", textangle: 0, insidetextanchor: "middle", textfont: { color: "white", size: 12 }, marker: { color: COLORS.nonStemm }, hovertemplate: "%{x}<br>Non-STEMM: %{y:,}<extra></extra>" },
      ],
      layout: { ...baseLayout(300), barmode: "group", showlegend: false, margin: { l: 48, r: 18, t: 36, b: 48 }, yaxis: { ...baseLayout().yaxis, title: { text: `${currentMetricLabel} students` } } },
      fixedLegend: [{ label: "STEMM", color: COLORS.stemm }, { label: "Non-STEMM", color: COLORS.nonStemm }],
      titleNote: matriculatedGrandTotal,
    };
  }, [filteredRows, currentMetricLabel, matriculatedGrandTotal, matriculatedDisplayScale, totals.totalMatriculated]);

  const disciplineMixBundle = useMemo<ChartBundle>(() => {
    const totals = new Map<string, number>();
    DISCIPLINE_ORDER.forEach((label) => totals.set(label, 0));
    filteredRows.forEach((row) => {
      const label = getPolicyDisciplineBucket(row);
      totals.set(label, (totals.get(label) ?? 0) + displayMatriculatedValue(row.matriculated_count));
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
      titleNote: matriculatedGrandTotal,
    };
  }, [filteredRows, matriculatedDisplayScale, matriculatedGrandTotal]);

  const topMatriculatedCoursesBundle = useMemo<ChartBundle>(() => {
    const grouped = new Map<string, { value: number; color: string; hoverLabel: string }>();
    filteredRows.forEach((row) => {
      const key = row.programme;
      const bucket = getPolicyDisciplineBucket(row);
      const entry = grouped.get(key) ?? { value: 0, color: disciplineColor(bucket), hoverLabel: bucket };
      entry.value += displayMatriculatedValue(currentValue(row));
      grouped.set(key, entry);
    });
    return buildMultiColorRankedChart(
      [...grouped.entries()].map(([label, value]) => ({ label, value: value.value, color: value.color, hoverLabel: value.hoverLabel })),
      `${currentMetricLabel} students`,
      matriculatedGrandTotal,
    );
  }, [filteredRows, currentMetricLabel, matriculatedGrandTotal, matriculatedDisplayScale]);

  const topStemmCoursesBundle = useMemo(() => buildRankedChart(
    [...filteredRows.filter((row) => row.programme_cluster === "STEMM").reduce((map, row) => {
      map.set(row.programme, (map.get(row.programme) ?? 0) + displayMatriculatedValue(currentValue(row)));
      return map;
    }, new Map<string, number>()).entries()].map(([label, value]) => ({ label, value })),
    COLORS.stemm,
    `${currentMetricLabel} students`,
    true,
    matriculatedGrandTotal,
  ), [filteredRows, currentMetricLabel, matriculatedGrandTotal, matriculatedDisplayScale]);

  const lowestStemmCoursesBundle = useMemo(() => buildRankedChart(
    [...filteredRows.filter((row) => row.programme_cluster === "STEMM").reduce((map, row) => {
      map.set(row.programme, (map.get(row.programme) ?? 0) + displayMatriculatedValue(currentValue(row)));
      return map;
    }, new Map<string, number>()).entries()].map(([label, value]) => ({ label, value })),
    COLORS.stemm,
    `${currentMetricLabel} students`,
    false,
    matriculatedGrandTotal,
  ), [filteredRows, currentMetricLabel, matriculatedGrandTotal, matriculatedDisplayScale]);


  const topNonStemmCoursesBundle = useMemo(() => buildRankedChart(
    [...filteredRows.filter((row) => row.programme_cluster === "Non-STEMM").reduce((map, row) => {
      map.set(row.programme, (map.get(row.programme) ?? 0) + displayMatriculatedValue(currentValue(row)));
      return map;
    }, new Map<string, number>()).entries()].map(([label, value]) => ({ label, value })),
    COLORS.nonStemm,
    `${currentMetricLabel} students`,
    true,
    matriculatedGrandTotal,
  ), [filteredRows, currentMetricLabel, matriculatedGrandTotal, matriculatedDisplayScale]);

  const lowestNonStemmCoursesBundle = useMemo(() => buildRankedChart(
    [...filteredRows.filter((row) => row.programme_cluster === "Non-STEMM").reduce((map, row) => {
      map.set(row.programme, (map.get(row.programme) ?? 0) + displayMatriculatedValue(currentValue(row)));
      return map;
    }, new Map<string, number>()).entries()].map(([label, value]) => ({ label, value })),
    COLORS.nonStemm,
    `${currentMetricLabel} students`,
    false,
    matriculatedGrandTotal,
  ), [filteredRows, currentMetricLabel, matriculatedGrandTotal, matriculatedDisplayScale]);

  const institutionAdmissionRows = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredRows.forEach((row) => {
      const institutionLabel = cleanInstitutionLabel(row.tertiary_institution);
      grouped.set(institutionLabel, (grouped.get(institutionLabel) ?? 0) + displayMatriculatedValue(currentValue(row)));
    });
    return [...grouped.entries()].map(([label, value]) => ({ label, value }));
  }, [filteredRows, matriculatedDisplayScale]);

  const topStemmInstitutionsBundle = useMemo(() => buildRankedChart(
    institutionAdmissionRows,
    COLORS.admitted,
    `${currentMetricLabel} students`,
    true,
    matriculatedGrandTotal,
  ), [institutionAdmissionRows, currentMetricLabel, matriculatedGrandTotal]);

  const lowestStemmInstitutionsBundle = useMemo(() => buildRankedChart(
    institutionAdmissionRows,
    COLORS.admitted,
    `${currentMetricLabel} students`,
    false,
    matriculatedGrandTotal,
  ), [institutionAdmissionRows, currentMetricLabel, matriculatedGrandTotal]);

  const topNonStemmInstitutionsBundle = useMemo(() => buildRankedChart(
    groupedBy(filteredRows.filter((row) => row.programme_cluster === "Non-STEMM"), (row) => cleanInstitutionLabel(row.tertiary_institution)).map((row) => ({ label: row.key, value: displayMatriculatedValue(row.nonStemm) })),
    COLORS.nonStemm,
    `${currentMetricLabel} students`,
    true,
    matriculatedGrandTotal,
  ), [filteredRows, currentMetricLabel, matriculatedGrandTotal, matriculatedDisplayScale]);

  const lowestNonStemmInstitutionsBundle = useMemo(() => buildRankedChart(
    groupedBy(filteredRows.filter((row) => row.programme_cluster === "Non-STEMM"), (row) => cleanInstitutionLabel(row.tertiary_institution)).map((row) => ({ label: row.key, value: displayMatriculatedValue(row.nonStemm) })),
    COLORS.nonStemm,
    `${currentMetricLabel} students`,
    false,
    matriculatedGrandTotal,
  ), [filteredRows, currentMetricLabel, matriculatedGrandTotal, matriculatedDisplayScale]);

  const stemmNonStemmTrendBundle = useMemo<ChartBundle>(() => {
    const sessions = POLICY_IMPACT_SESSIONS.filter((session) => trendRows.some((row) => row.session === session));
    const canScaleTrend = canUseCanonicalPolicyMatriculation(filters);
    const scaledSessionValue = (session: string, value: number): number => {
      if (!canScaleTrend) return value;
      const rawSessionTotal = trendRows
        .filter((row) => row.session === session)
        .reduce((sum, row) => sum + safeNum(row.matriculated_count), 0);
      const canonicalSessionTotal = sumCanonicalTransitionMetrics(
        filterCanonicalTransitionRows(canonicalTransitionRows, { ...filters, session }, disabilityMode),
      ).matriculated;
      if (rawSessionTotal <= 0 || canonicalSessionTotal <= 0) return value;
      return Math.round(value * (canonicalSessionTotal / rawSessionTotal));
    };
    const stemmMatric = sessions.map((session) => scaledSessionValue(session, trendRows
      .filter((row) => row.session === session && row.programme_cluster === "STEMM")
      .reduce((sum, row) => sum + safeNum(row.matriculated_count), 0)));
    const nonStemmMatric = sessions.map((session) => scaledSessionValue(session, trendRows
      .filter((row) => row.session === session && row.programme_cluster === "Non-STEMM")
      .reduce((sum, row) => sum + safeNum(row.matriculated_count), 0)));
    const allTrendValues = [...stemmMatric, ...nonStemmMatric].filter((value) => Number.isFinite(value));
    const trendMin = Math.min(...allTrendValues, 0);
    const trendMax = Math.max(...allTrendValues, 1);
    const labelOffset = Math.max((trendMax - trendMin) * 0.045, trendMax * 0.008, 1);
    const stemmLabelY = stemmMatric.map((value, index) => Math.max(0, value - (index === 1 ? labelOffset * 1.65 : labelOffset)));
    const nonStemmLabelY = nonStemmMatric.map((value, index) => value + (index === 1 ? labelOffset * 1.65 : labelOffset));

    return {
      data: [
        {
          type: "scatter",
          mode: "lines+markers",
          name: "STEMM Matriculated",
          x: sessions,
          y: stemmMatric,
          line: { color: COLORS.stemm, width: 3 },
          marker: { size: 8, symbol: "circle" },
          hovertemplate: "%{x}<br>STEMM Matriculated: %{y:,}<extra></extra>",
        },
        {
          type: "scatter",
          mode: "lines+markers",
          name: "Non-STEMM Matriculated",
          x: sessions,
          y: nonStemmMatric,
          line: { color: COLORS.nonStemm, width: 3, dash: "dot" },
          marker: { size: 8, symbol: "diamond" },
          hovertemplate: "%{x}<br>Non-STEMM Matriculated: %{y:,}<extra></extra>",
        },
        {
          type: "scatter",
          mode: "text",
          name: "STEMM labels",
          x: sessions,
          y: stemmLabelY,
          text: stemmMatric.map((value) => fmtInt(value)),
          textposition: "middle center",
          textfont: { color: COLORS.text, size: 11 },
          hoverinfo: "skip",
          showlegend: false,
          cliponaxis: false,
        },
        {
          type: "scatter",
          mode: "text",
          name: "Non-STEMM labels",
          x: sessions,
          y: nonStemmLabelY,
          text: nonStemmMatric.map((value) => fmtInt(value)),
          textposition: "middle center",
          textfont: { color: COLORS.text, size: 11 },
          hoverinfo: "skip",
          showlegend: false,
          cliponaxis: false,
        },
      ],
      layout: {
        ...baseLayout(340),
        showlegend: false,
        margin: { l: 58, r: 28, t: 28, b: 54 },
        yaxis: {
          ...baseLayout().yaxis,
          title: { text: "Matriculated students" },
          range: [
            Math.max(0, Math.min(...stemmLabelY, ...nonStemmLabelY, ...allTrendValues) * 0.98),
            Math.max(...stemmLabelY, ...nonStemmLabelY, ...allTrendValues, 1) * 1.03,
          ],
        },
      },
      fixedLegend: [{ label: "STEMM Matriculated", color: COLORS.stemm }, { label: "Non-STEMM Matriculated", color: COLORS.nonStemm, dashed: true }],
      titleNote: matriculatedGrandTotal,
    };
  }, [trendRows, filters, disabilityMode, canonicalTransitionRows, matriculatedGrandTotal]);

  const loanTrendBundle = useMemo<ChartBundle>(() => {
    const sessionRows = LOAN_TREND_SESSIONS.map((session) => {
      const sessionRowsForLoan = filteredLoanRows.filter((row) => row.session === session);
      return {
        session,
        applications: sessionRowsForLoan.reduce((sum, row) => sum + safeNum(row.loan_applications), 0),
        disbursed: sessionRowsForLoan.reduce((sum, row) => sum + safeNum(row.loan_disbursed), 0),
      };
    });
    const activeRows = sessionRows.filter((row) => row.applications > 0 || row.disbursed > 0);
    const visibleRows = activeRows.length ? activeRows : sessionRows;
    const sessions = visibleRows.map((row) => row.session);
    const applications = visibleRows.map((row) => row.applications);
    const disbursed = visibleRows.map((row) => row.disbursed);
    const maxValue = Math.max(...applications, ...disbursed, 1);
    const xBase = sessions.map((_, index) => index);
    const groupOffset = 0.18;
    const barWidth = 0.32;
    const xRangeStart = xBase.length ? Math.min(...xBase) - 0.65 : -0.65;
    const xRangeEnd = xBase.length ? Math.max(...xBase) + 0.65 : 0.65;

    return {
      data: [
        {
          type: "bar",
          name: "Applications",
          x: xBase.map((value) => value - groupOffset),
          y: applications,
          width: barWidth,
          text: applications.map((value) => (value > 0 ? fmtInt(value) : "")),
          textposition: "inside",
          textangle: 0,
          insidetextanchor: "middle",
          constraintext: "none",
          textfont: { color: "white", size: 11 },
          cliponaxis: false,
          customdata: applications.map((value, index) => [sessions[index], value]),
          marker: { color: COLORS.applications, line: { width: 0 } },
          hovertemplate: "%{customdata[0]}<br>Applications: %{customdata[1]:,.0f}<extra></extra>",
        },
        {
          type: "bar",
          name: "Disbursed",
          x: xBase.map((value) => value + groupOffset),
          y: disbursed,
          width: barWidth,
          text: disbursed.map((value) => (value > 0 ? fmtInt(value) : "")),
          textposition: "inside",
          textangle: 0,
          insidetextanchor: "middle",
          constraintext: "none",
          textfont: { color: "white", size: 11 },
          cliponaxis: false,
          customdata: disbursed.map((value, index) => [sessions[index], value]),
          marker: { color: COLORS.disbursed, line: { width: 0 } },
          hovertemplate: "%{customdata[0]}<br>Disbursed: %{customdata[1]:,.0f}<extra></extra>",
        },
      ],
      layout: {
        ...baseLayout(400),
        barmode: "group",
        bargap: 0.3,
        bargroupgap: 0.08,
        showlegend: false,
        margin: { l: 56, r: 20, t: 30, b: 54 },
        xaxis: {
          type: "linear",
          range: [xRangeStart, xRangeEnd],
          tickmode: "array",
          tickvals: xBase,
          ticktext: sessions,
          tickfont: { color: COLORS.sub, size: 11 },
          automargin: true,
          showgrid: false,
          zeroline: false,
          fixedrange: true,
        },
        yaxis: {
          range: [0, Math.ceil(maxValue * 1.14)],
          gridcolor: COLORS.grid,
          showgrid: true,
          showticklabels: true,
          zeroline: false,
          tickfont: { color: COLORS.sub, size: 10.5 },
          separatethousands: true,
          fixedrange: true,
        },
      },
      fixedLegend: [{ label: "Applications", color: COLORS.applications }, { label: "Disbursed", color: COLORS.disbursed }],
      expandedMaxHeight: 560,
      expandedWidthClass: "max-w-[94vw]",
    };
  }, [filteredLoanRows]);

  const loanInstitutionBundle = useMemo<ChartBundle>(() => {
    const grouped = [...new Set(filteredLoanRows.map((row) => row.institution_type))].map((type) => ({
      label: type,
      approved: filteredLoanRows.filter((row) => row.institution_type === type).reduce((sum, row) => sum + safeNum(row.loan_approved), 0),
      disbursed: filteredLoanRows.filter((row) => row.institution_type === type).reduce((sum, row) => sum + safeNum(row.loan_disbursed), 0),
    }));
    const maxValue = Math.max(...grouped.map((row) => Math.max(row.approved, row.disbursed)), 1);

    return {
      data: [
        {
          type: "bar",
          name: "Approved",
          x: grouped.map((row) => row.label),
          y: grouped.map((row) => row.approved),
          text: grouped.map((row) => (row.approved > 0 ? fmtInt(row.approved) : "")),
          textposition: "inside",
          textangle: 0,
          insidetextanchor: "middle",
          constraintext: "none",
          textfont: { color: "white", size: 11 },
          cliponaxis: false,
          marker: { color: COLORS.applications },
          hovertemplate: "%{x}<br>Approved: %{y:,}<extra></extra>",
        },
        {
          type: "bar",
          name: "Disbursed",
          x: grouped.map((row) => row.label),
          y: grouped.map((row) => row.disbursed),
          text: grouped.map((row) => (row.disbursed > 0 ? fmtInt(row.disbursed) : "")),
          textposition: "inside",
          textangle: 0,
          insidetextanchor: "middle",
          constraintext: "none",
          textfont: { color: "white", size: 11 },
          cliponaxis: false,
          marker: { color: COLORS.disbursed },
          hovertemplate: "%{x}<br>Disbursed: %{y:,}<extra></extra>",
        },
      ],
      layout: {
        ...baseLayout(400),
        barmode: "group",
        showlegend: false,
        margin: { l: 44, r: 14, t: 34, b: 42 },
        xaxis: { type: "category", tickfont: { color: COLORS.sub, size: 11 }, automargin: true, showgrid: false, zeroline: false },
        yaxis: {
          ...baseLayout().yaxis,
          title: { text: "Loan volume" },
          range: [0, Math.ceil(maxValue * 1.12)],
          gridcolor: COLORS.grid,
          showgrid: true,
          showticklabels: true,
          zeroline: false,
          tickfont: { color: COLORS.sub, size: 10.5 },
          separatethousands: true,
          fixedrange: true,
        },
      },
      fixedLegend: [{ label: "Approved", color: COLORS.applications }, { label: "Disbursed", color: COLORS.disbursed }],
      expandedMaxHeight: 560,
      expandedWidthClass: "max-w-[94vw]",
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
    const approved = grouped.map((row) => row.approved);
    const disbursed = grouped.map((row) => row.disbursed);
    const [approvedVisualValues, disbursedVisualValues] = minimumVisibleStackValues([approved, disbursed], 0.16);
    const maxVisualTotal = Math.max(...approvedVisualValues.map((value, index) => value + (disbursedVisualValues[index] ?? 0)), 1);

    return {
      data: [
        {
          type: "bar",
          name: "Approved",
          orientation: "h",
          y: grouped.map((row) => row.label),
          x: approvedVisualValues,
          text: approved.map((value) => (value > 0 ? fmtInt(value) : "")),
          textposition: "inside",
          textangle: 0,
          insidetextanchor: "middle",
          constraintext: "none",
          textfont: { color: "#ffffff", size: 11 },
          cliponaxis: false,
          customdata: approved,
          marker: { color: COLORS.applications, line: { width: 0 } },
          hovertemplate: "%{y}<br>Approved: %{customdata:,.0f}<extra></extra>",
        },
        {
          type: "bar",
          name: "Disbursed",
          orientation: "h",
          y: grouped.map((row) => row.label),
          x: disbursedVisualValues,
          text: disbursed.map((value) => (value > 0 ? fmtInt(value) : "")),
          textposition: "inside",
          textangle: 0,
          insidetextanchor: "middle",
          constraintext: "none",
          textfont: { color: "white", size: 11 },
          cliponaxis: false,
          customdata: disbursed,
          marker: { color: COLORS.disbursed, line: { width: 0 } },
          hovertemplate: "%{y}<br>Disbursed: %{customdata:,.0f}<extra></extra>",
        },
      ],
      layout: {
        ...baseLayout(Math.max(430, grouped.length * 40 + 120)),
        barmode: "stack",
        bargap: 0.24,
        showlegend: false,
        xaxis: {
          range: [0, Math.ceil(maxVisualTotal * 1.06)],
          visible: false,
          showgrid: false,
          showticklabels: false,
          zeroline: false,
          ticks: "",
          fixedrange: true,
          title: undefined,
        },
        yaxis: { automargin: true, tickfont: { color: COLORS.sub, size: 11 }, showgrid: false, ticks: "" },
        margin: { l: 188, r: 28, t: 24, b: 18 },
      },
      fixedLegend: [{ label: "Approved", color: COLORS.applications }, { label: "Disbursed", color: COLORS.disbursed }],
      scrollable: grouped.length > 8,
      scrollMaxHeight: 430,
      expandedMaxHeight: Math.max(620, grouped.length * 48 + 160),
      expandedWidthClass: "max-w-[96vw]",
    };
  }, [filteredLoanRows]);

  // ── Drill handlers ── defined before expandedCharts so they're in scope
  const extractClickedLabel = (event: PlotPointEvent): string => {
    const customdata = event.points?.[0]?.customdata;
    if (Array.isArray(customdata) && typeof customdata[0] === "string") return customdata[0];
    return String(event.points?.[0]?.y ?? event.points?.[0]?.x ?? "");
  };

  const handleZoneClick = (event: PlotPointEvent) => {
    const label = sourcePolicyLabel(extractClickedLabel(event));
    if (!label) return;
    if (zoneLevel === "zone") {
      // Clicked a zone — both charts now drill into that zone's states
      setZoneDrill({ zone: label });
      setStateDrill({ zone: label });
      setFilters((prev) => ({ ...prev, zone: label, state: "", lga: "", tertiary_institution: "" }));
    } else if (zoneLevel === "state") {
      // Clicked a state inside a zone — drill into that state's LGAs
      const matchedZone = zoneForState(label) || effectiveZoneDrill.zone;
      setZoneDrill((prev) => ({ ...prev, zone: matchedZone, state: label }));
      setStateDrill((prev) => ({ ...prev, zone: matchedZone, state: label }));
      setFilters((prev) => ({ ...prev, zone: matchedZone || prev.zone, state: label, lga: "", tertiary_institution: "" }));
    } else if (zoneLevel === "lga") {
      // LGA is the final visible drill level on this page, so do not drill into Institution/School.
      return;
    }
  };

  const handleStateClick = (event: PlotPointEvent) => {
    const label = sourcePolicyLabel(extractClickedLabel(event));
    if (!label) return;
    if (stateLevel === "state") {
      // Clicked a state — find its zone so both charts stay in sync
      const matched = drillBaseRows.find((row) => row.state === label);
      if (matched) {
        const matchedZone = zoneForState(label) || matched.zone;
        setZoneDrill({ zone: matchedZone, state: label });
        setStateDrill({ zone: matchedZone, state: label });
        setFilters((prev) => ({ ...prev, zone: matchedZone, state: label, lga: "", tertiary_institution: "" }));
      } else {
        const matchedZone = zoneForState(label);
        setStateDrill({ zone: matchedZone || undefined, state: label });
        setFilters((prev) => ({ ...prev, zone: matchedZone || prev.zone, state: label, lga: "", tertiary_institution: "" }));
      }
    } else if (stateLevel === "lga") {
      // LGA is the final visible drill level on this page, so do not drill into Institution/School.
      return;
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
  const sortControlFor = (key: ChartKey): ReactNode => {
    if (key !== "zone" && key !== "state") return null;
    return (
      <ChartSortControl
        value={sortModes[key]}
        onChange={(value) => setSortModes((previous) => ({ ...previous, [key]: value }))}
      />
    );
  };

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
          <ChartCard title={buildChartTitle(`STEMM vs Non-STEMM by ${displayPolicyDrillLevelName(zoneLevel)}`)} explanation={CHART_HELP.zone} bundle={zoneBundle} sortControl={sortControlFor("zone")} onExpand={() => setExpandState({ key: "zone", title: buildChartTitle("STEMM vs Non-STEMM by Zone") })} onRefresh={() => { setZoneDrill({}); setStateDrill({}); setFilters((prev) => ({ ...prev, zone: "", state: "", lga: "", ward: "", school: "", tertiary_institution: "" })); }} onPlotClick={handleZoneClick} />
          <ChartCard title={buildChartTitle(`STEMM vs Non-STEMM by ${displayPolicyDrillLevelName(stateLevel)}`)} explanation={CHART_HELP.state} bundle={stateBundle} sortControl={sortControlFor("state")} onExpand={() => setExpandState({ key: "state", title: buildChartTitle("STEMM vs Non-STEMM by State") })} onRefresh={() => { setStateDrill({}); setZoneDrill({}); setFilters((prev) => ({ ...prev, zone: "", state: "", lga: "", ward: "", school: "", tertiary_institution: "" })); }} onPlotClick={handleStateClick} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Matriculation by Discipline" explanation={CHART_HELP.disciplineMix} bundle={disciplineMixBundle} onExpand={() => setExpandState({ key: "disciplineMix", title: "Matriculation by Discipline" })} onRefresh={() => undefined} />
          <ChartCard title={buildChartTitle("Top 10 Courses by Matriculation")} explanation={CHART_HELP.topMatriculatedCourses} bundle={topMatriculatedCoursesBundle} onExpand={() => setExpandState({ key: "topMatriculatedCourses", title: buildChartTitle("Top 10 Courses by Matriculation") })} onRefresh={() => undefined} />
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
          <ChartCard title={buildChartTitle("Top 10 Institutions by Matriculation")} explanation={CHART_HELP.topStemmInstitutions} bundle={topStemmInstitutionsBundle} onExpand={() => setExpandState({ key: "topStemmInstitutions", title: buildChartTitle("Top 10 Institutions by Matriculation") })} onRefresh={() => undefined} />
          <ChartCard title={buildChartTitle("Bottom 10 Institutions by Matriculation")} explanation={CHART_HELP.lowestStemmInstitutions} bundle={lowestStemmInstitutionsBundle} onExpand={() => setExpandState({ key: "lowestStemmInstitutions", title: buildChartTitle("Bottom 10 Institutions by Matriculation") })} onRefresh={() => undefined} />
        </div>
      </div>

      <div id="policy-impact-trends" className="space-y-4 scroll-mt-36">
        <div className="grid gap-4">
          <ChartCard title="STEMM & Non-STEMM Matriculated Trend" explanation={CHART_HELP.stemmNonStemmTrend} bundle={stemmNonStemmTrendBundle} onExpand={() => setExpandState({ key: "stemmNonStemmTrend", title: "STEMM & Non-STEMM Matriculated Trend" })} onRefresh={() => undefined} />
        </div>
      </div>

      <div id="policy-impact-loans" className="space-y-4 scroll-mt-36">
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Number of Loan Applications vs Number of Loans Disbursed per Academic Session" explanation={CHART_HELP.loanTrend} bundle={loanTrendBundle} onExpand={() => setExpandState({ key: "loanTrend", title: "Number of Loan Applications vs Number of Loans Disbursed per Academic Session" })} onRefresh={() => undefined} />
          <ChartCard title="Count of Approved/Disbursed Loans by Institution Type" explanation={CHART_HELP.loanInstitution} bundle={loanInstitutionBundle} onExpand={() => setExpandState({ key: "loanInstitution", title: "Count of Approved/Disbursed Loans by Institution Type" })} onRefresh={() => undefined} />
        </div>
        <div className="grid gap-4">
          <ChartCard title="Count of Approved/Disbursed Loans by Discipline" explanation={CHART_HELP.loanDiscipline} bundle={loanDisciplineBundle} onExpand={() => setExpandState({ key: "loanDiscipline", title: "Count of Approved/Disbursed Loans by Discipline" })} onRefresh={() => undefined} />
        </div>
      </div>

      {expandState ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onClick={() => setExpandState(null)}
        >
          <div
            className={["flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl", expandedChart?.bundle.expandedWidthClass ?? "max-w-[94vw]"].join(" ")}
            style={{ height: "78vh", maxHeight: "720px" }}
            onClick={(event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation()}
          >
            {/* Fixed header */}
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-3">
              <div className="min-w-0">
                <div className="text-base font-extrabold text-slate-900">{expandState.title}</div>
                {expandedChart?.bundle.titleNote ? <div className="mt-0.5 text-xs text-slate-500">{expandedChart.bundle.titleNote}</div> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {sortControlFor(expandState.key)}
              <button
                type="button"
                onClick={() => setExpandState(null)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
              </div>
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
              "px-5 pb-5 pt-3",
            ].join(" ")}>
              {expandedChart ? (
                <Plot
                  data={expandedChart.bundle.data}
                  layout={{
                    ...expandedChart.bundle.layout,
                    height: expandedChart.bundle.scrollable
                      ? expandedChart.bundle.expandedMaxHeight ?? 700
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

