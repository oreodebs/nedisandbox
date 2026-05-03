import { Suspense, lazy, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Accessibility, ArrowRight, BookOpen, ChevronUp, Users } from "lucide-react";

import MinisterLayout from "../../../layouts/MinisterLayout";
import { getAssignedState, getRole } from "../../../app/auth";
import type {
  DimLga,
  DimSchool,
  DimSession,
  DimState,
  DimWard,
  GenderFilter,
  MinisterFilters,
  QualificationStatusFilter,
  SchoolLevelFilter,
  SchoolTypeFilter,
} from "../types";
import { loadCSV } from "../utils/loadCSV";
import { canonicalState, loadRefinedFile } from "../utils/refinedPageData";

const TransitionDashboard = lazy(() => import("./TransitionDashboardPage"));
const PerformanceDashboard = lazy(() => import("./PerformanceDashboardPage"));
const TeacherCapacityDashboard = lazy(() => import("./TeacherCapacityDashboardPage"));
const AccessCoverageDashboard = lazy(() => import("./AccessCoverageDashboardPage"));
const PolicyImpactDashboard = lazy(() => import("./PolicyImpactDashboardPage"));
const GeneralOverviewDashboard = lazy(() => import("./GeneralOverviewDashboardPage"));

type CategoryKey =
  | "general_overview"
  | "basic_secondary"
  | "transition"
  | "performance"
  | "policy_impact";

type BasicSecondaryView = "access_coverage" | "teacher_capacity";

type SectionDef = { id: string; label: string };
type FilterOption = { label: string; value: string };
type TeacherFilterSeed = {
  session: string;
  zone: string;
  state: string;
  lga: string;
  ward: string;
  school: string;
  gender: string;
  school_type: string;
  school_level: string;
  class_grade: string;
  qualification_status: string;
};
type AccessCoverageWardSeed = {
  session: string;
  zone: string;
  state: string;
  lga: string;
  ward: string;
  school: string;
  gender: string;
  school_type: string;
  school_level: string;
  class_grade: string;
};

type AccessCoverageAlmajiriSeed = {
  session: string;
  zone: string;
  state: string;
};

type PolicyImpactSeed = {
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
};


type TransitionFilterSeed = {
  session: string;
  zone: string;
  state: string;
  lga: string;
  ward: string;
  school: string;
  gender: string;
  disability: string;
  exam_body: string;
  gap_band?: string;
  institution_type?: string;
};

type PerformanceFilterSeed = {
  session: string;
  zone: string;
  state: string;
  lga: string;
  ward: string;
  school: string;
  gender: string;
  disability: string;
  exam_body: string;
  olevel_exam_body?: string;
};

const GAP_BANDS: Array<MinisterFilters["gap_band"]> = ["1-year", "2-year", "3-5-year", "5+-year"];
const EXAM_BODIES: Array<MinisterFilters["exam_body"]> = ["WAEC", "NECO", "NABTEB"];
const TEACHER_QUALIFICATION_OPTIONS: QualificationStatusFilter[] = ["Qualified", "Unqualified"];

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  general_overview: "General Overview",
  basic_secondary: "Basic & Secondary",
  transition: "General Transition",
  performance: "Performance",
  policy_impact: "Policy Impact",
};

const DASHBOARD_TABS: Array<{ key: CategoryKey; label: string }> = [
  { key: "general_overview", label: "Overview" },
  { key: "basic_secondary", label: "Basic & Secondary" },
  { key: "transition", label: "Transition" },
  { key: "performance", label: "Performance" },
  { key: "policy_impact", label: "Policy Impact" },
];

const GENERAL_TRANSITION_SECTIONS: SectionDef[] = [
  { id: "transition-general-kpi", label: "KPI Summary" },
  { id: "transition-general-overview", label: "Transition Overview" },
  { id: "transition-general-timing", label: "Time to Matriculation" },
  { id: "transition-general-gap", label: "Matriculation Gap" },
  { id: "transition-general-transition", label: "Transition Analysis" },
  { id: "transition-general-dropoff", label: "Drop-off Analysis" },
];

const DIRECT_TRANSITION_SECTIONS: SectionDef[] = [
  { id: "transition-direct-kpi", label: "KPI Summary" },
  { id: "transition-direct-overview", label: "Transition Overview" },
  { id: "transition-direct-gap", label: "Matriculation Gap" },
  { id: "transition-direct-transition", label: "Transition Analysis" },
  { id: "transition-direct-dropoff", label: "Drop-off Analysis" },
];

const PERFORMANCE_SECTIONS: SectionDef[] = [
  { id: "performance-kpi", label: "KPI Summary" },
  { id: "performance-waec", label: "WAEC Performance" },
  { id: "performance-neco", label: "NECO Performance" },
  { id: "performance-nabteb", label: "NABTEB Performance" },
  { id: "performance-utme", label: "UTME Readiness" },
  { id: "performance-trend", label: "Five-Year Trend" },
];


const ACCESS_COVERAGE_SECTIONS: SectionDef[] = [
  { id: "access-coverage-kpi", label: "KPI Cards" },
  { id: "access-coverage-main", label: "Access & Coverage" },
  { id: "access-coverage-classroom", label: "Classroom Pressure" },
  { id: "access-coverage-ict", label: "ICT / Infrastructure" },
  { id: "access-coverage-level", label: "School & Student Enrollment by Level" },
  { id: "access-coverage-almajiri", label: "Almajiri" },
];

const TEACHER_CAPACITY_SECTIONS: SectionDef[] = [
  { id: "teacher-capacity-kpi", label: "KPI Cards" },
  { id: "teacher-capacity-ratio", label: "Pupil-Teacher Ratio" },
  { id: "teacher-capacity-distribution", label: "Public vs Private Distribution" },
  { id: "teacher-capacity-quality", label: "Teacher Qualification & Quality" },
];

const POLICY_IMPACT_SECTIONS: SectionDef[] = [
  { id: "policy-impact-kpi", label: "KPI Cards" },
  { id: "policy-impact-mix", label: "Programme Mix" },
  { id: "policy-impact-breakdown", label: "Breakdown Analysis" },
  { id: "policy-impact-rankings", label: "Institution Rankings" },
  { id: "policy-impact-trends", label: "Trend Analysis" },
  { id: "policy-impact-loans", label: "Student Loan Support" },
];

const GENERAL_OVERVIEW_SECTIONS: SectionDef[] = [
  { id: "general-kpi", label: "System Overview KPIs" },
  { id: "general-access", label: "Access & School Coverage" },
  { id: "general-transition", label: "Transition & Learner Flow" },
  { id: "general-tertiary", label: "Tertiary Pathway Trends" },
  { id: "general-loans", label: "Student Loan Support" },
];

const SCHOOL_TYPE_FILTER_ORDER = ["Public", "Private"] as const;
const SCHOOL_LEVEL_FILTER_ORDER = ["Pre-Primary/Primary", "JSS", "SSS", "Adult & Non-Formal"] as const;
const ACCESS_SCHOOL_TYPE_FILTER_ORDER = ["Public", "Private"] as const;
const ACCESS_SCHOOL_LEVEL_FILTER_ORDER = ["Pre-Primary/Primary", "JSS", "SSS", "Adult & Non-Formal", "Vocational"] as const;

// Display label overrides for school level values from CSV
const SCHOOL_LEVEL_DISPLAY: Record<string, string> = {
  "Pre-Primary/Primary": "Pre/Primary",
};
const ACCESS_CLASS_GRADE_FILTER_ORDER = [
  "IQS/IQTS Stage 1",
  "IQS/IQTS Stage 2",
  "IQS/IQTS Stage 3",
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
const CLASS_GRADE_FILTER_ORDER = [
  "Nursery 1",
  "Nursery 2",
  "KG 1",
  "KG 2",
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

const PLACEHOLDER_SECTIONS: Record<Exclude<CategoryKey, "transition" | "performance" | "basic_secondary" | "general_overview">, SectionDef[]> = {
  policy_impact: [{ id: "placeholder-policy-impact", label: "Coming Soon" }],
};

function truncateLabel(value: string | null | undefined, max = 32): string {
  const safeValue = typeof value === "string" ? value : "";
  return safeValue.length <= max
    ? safeValue
    : `${safeValue.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function sanitizeOptions(options: FilterOption[]): FilterOption[] {
  const seen = new Set<string>();

  return options
    .map((option) => {
      const value = typeof option?.value === "string" ? option.value.trim() : "";
      const labelSource =
        typeof option?.label === "string" && option.label.trim()
          ? option.label
          : value;

      return {
        value,
        label: truncateLabel(labelSource),
      };
    })
    .filter((option) => option.value)
    .filter((option) => {
      if (seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
}

function orderedUnique(values: string[], preferredOrder: readonly string[]): string[] {
  const seen = new Set(values.filter(Boolean));
  return preferredOrder.filter((item) => seen.has(item));
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}


function normalizeTransitionGapBand(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "3-5 years" || normalized === "3-5-year") return "3-5-year";
  if (normalized === "5+ years" || normalized === "5+-year") return "5+-year";
  return value;
}

function performanceExamBody(row: PerformanceFilterSeed): string {
  const direct = typeof row.exam_body === "string" ? row.exam_body.trim() : "";
  if (direct) return direct;
  const olevel = typeof row.olevel_exam_body === "string" ? row.olevel_exam_body.trim() : "";
  return olevel;
}

const GEO_NAME_ALIASES: Record<string, string> = {
  "federal capital territory": "abuja federal capital territory",
  "abuja fct": "abuja federal capital territory",
  "municipal area council": "abuja municipal area council",
  "ibadan south": "ibadan south west",
  "dutsin ma": "dutsinma",
  "obio akpor": "obio akpor",
  "port harcourt": "port harcourt",
  shagamu: "sagamu",
  wamakko: "wamako",
  yenegoa: "yenagoa",
  oturkpo: "otukpo",
};

function normalizeGeoName(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return GEO_NAME_ALIASES[normalized] ?? normalized;
}

function geoFilterMatch(value: string | null | undefined, selected: string | null | undefined): boolean {
  const selectedNormalized = normalizeGeoName(selected);
  if (!selectedNormalized) return true;
  return normalizeGeoName(value) === selectedNormalized;
}

function PlaceholderPage({ title, sections }: { title: string; sections: SectionDef[] }) {
  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</div>
        <div className="mt-2 text-sm text-slate-500">
          This page is already placed in the selector flow and ready for the next build pass.
        </div>
      </div>

      {sections.map((section) => (
        <div
          key={section.id}
          id={section.id}
          className="scroll-mt-36 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8"
        >
          <div className="text-base font-bold text-slate-900">{title}</div>
          <div className="mt-2 text-sm text-slate-500">{section.label}</div>
        </div>
      ))}
    </div>
  );
}

function FilterSelect({
  value,
  placeholder,
  options,
  onChange,
  disabled,
  title,
  maxWidth = "max-w-[150px]",
}: {
  value: string;
  placeholder: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  title?: string;
  maxWidth?: string;
}) {
  const safeOptions = useMemo(() => sanitizeOptions(options), [options]);

  return (
    <select
      value={value}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
      disabled={disabled}
      title={title}
      className={[
        "h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none shadow-sm transition",
        "truncate",
        maxWidth,
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-slate-50",
      ].join(" ")}
    >
      <option value="">{placeholder}</option>
      {safeOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label || option.value}
        </option>
      ))}
    </select>
  );
}

function TogglePill({
  onClick,
  active,
  icon,
  label,
  activeClass,
}: {
  onClick: () => void;
  active: boolean;
  icon: ReactNode;
  label: string;
  activeClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition",
        active ? activeClass : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

export default function MinisterDashboardPage({
  onOpenSettings,
  onLogout,
}: {
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  const assignedStateScope = useMemo(
    () => canonicalState(getAssignedState() ?? ""),
    [],
  );
  const isStateScopedAdmin =
    getRole() === "STATE_ADMIN" && Boolean(assignedStateScope);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as CategoryKey | null;
  const category: CategoryKey = tabParam && tabParam in CATEGORY_LABELS ? tabParam : "general_overview";

  const setCategory = (key: CategoryKey) => {
    if (key === "basic_secondary") {
      setBasicSecondaryView("access_coverage");
    }
    setSearchParams({ tab: key }, { replace: true });
  };

  const [disabilityMode, setDisabilityMode] = useState(false);
  const [directMode, setDirectMode] = useState(false);
  const [basicSecondaryView, setBasicSecondaryView] = useState<BasicSecondaryView>("access_coverage");
  const [showScrollTop, setShowScrollTop] = useState(false);
  // const [admittedMode, setAdmittedMode] = useState(false);
  const [filters, setFilters] = useState<MinisterFilters>({
    session: "",
    zone: "",
    state: "",
    lga: "",
    ward: "",
    school: "",
    gender: "",
    gap_band: "",
    exam_body: "",
    school_type: "",
    school_level: "",
    class_grade: "",
    qualification_status: "",
    institution_type: "",
    tertiary_institution: "",
    programme_cluster: "",
    discipline_group: "",
    programme: "",
  });


  const isBasicSecondary = category === "basic_secondary";
  const showAccessCoverage = isBasicSecondary && basicSecondaryView === "access_coverage";
  const showTeacherCapacity = isBasicSecondary && basicSecondaryView === "teacher_capacity";

  const [loadingDims, setLoadingDims] = useState(true);
  const [dataErr, setDataErr] = useState<string | null>(null);
  const [dimSessions, setDimSessions] = useState<DimSession[]>([]);
  const [dimStates, setDimStates] = useState<DimState[]>([]);
  const [dimLgas, setDimLgas] = useState<DimLga[]>([]);
  const [dimWards, setDimWards] = useState<DimWard[]>([]);
  const [dimSchools, setDimSchools] = useState<DimSchool[]>([]);
  const [teacherSeedRows, setTeacherSeedRows] = useState<TeacherFilterSeed[]>([]);
  const [accessWardSeedRows, setAccessWardSeedRows] = useState<AccessCoverageWardSeed[]>([]);
  const [accessAlmajiriSeedRows, setAccessAlmajiriSeedRows] = useState<AccessCoverageAlmajiriSeed[]>([]);
  const [policyImpactSeedRows, setPolicyImpactSeedRows] = useState<PolicyImpactSeed[]>([]);
  const [transitionGeneralSeedRows, setTransitionGeneralSeedRows] = useState<TransitionFilterSeed[]>([]);
  const [transitionDirectSeedRows, setTransitionDirectSeedRows] = useState<TransitionFilterSeed[]>([]);
  const [performanceSeedRows, setPerformanceSeedRows] = useState<PerformanceFilterSeed[]>([]);
  const [teacherSeedsLoaded, setTeacherSeedsLoaded] = useState(false);
  const [accessSeedsLoaded, setAccessSeedsLoaded] = useState(false);
  const [policySeedsLoaded, setPolicySeedsLoaded] = useState(false);
  const [transitionSeedsLoaded, setTransitionSeedsLoaded] = useState(false);
  const [performanceSeedsLoaded, setPerformanceSeedsLoaded] = useState(false);

  const [zones, setZones] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [lgas, setLgas] = useState<string[]>([]);
  const [wards, setWards] = useState<string[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [schoolLevels, setSchoolLevels] = useState<string[]>([]);
  const [schoolTypes, setSchoolTypes] = useState<string[]>([]);
  const [classGrades, setClassGrades] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoadingDims(true);
        setDataErr(null);
        const baseUrl = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
        const dataBase = baseUrl.endsWith("/") ? `${baseUrl}data` : `${baseUrl}/data`;
        const tryLoadDim = async <T extends Record<string, unknown>>(path: string, requiredKey: string): Promise<T[]> => {
          const candidates = [
            `${dataBase}/dimensions/${path}`,
            `/data/dimensions/${path}`,
            `${dataBase}/${path}`,
            `/data/${path}`,
          ];
          let lastErr: unknown = null;
          for (const url of candidates) {
            try {
              const rows = await loadCSV<T>(url);
              if (!rows.length) continue;
              const first = rows[0] as Record<string, unknown>;
              if (Object.prototype.hasOwnProperty.call(first, requiredKey)) return rows;
              // Wrong file shape (often HTML fallback or unrelated CSV); try next candidate.
            } catch (error) {
              lastErr = error;
            }
          }
          throw lastErr instanceof Error ? lastErr : new Error(`Failed to load ${path}`);
        };

        const [sessionsRaw, statesRaw, lgasRaw, wardsRaw, schoolsRaw] = await Promise.all([
          tryLoadDim<DimSession>("dim_sessions.csv", "session_id"),
          tryLoadDim<DimState>("dim_states.csv", "state"),
          tryLoadDim<DimLga>("dim_lgas.csv", "lga"),
          tryLoadDim<DimWard>("dim_wards.csv", "ward"),
          tryLoadDim<DimSchool>("dim_schools.csv", "school"),
        ]);

        if (!alive) return;

        const normalizedStates = statesRaw.map((row) => ({ ...row, state: canonicalState(row.state) }));
        const normalizedLgas = lgasRaw.map((row) => ({ ...row, state: canonicalState(row.state) }));
        const normalizedWards = wardsRaw.map((row) => ({ ...row, state: canonicalState(row.state) }));
        const normalizedSchools = schoolsRaw.map((row) => ({ ...row, state: canonicalState(row.state) }));

        setDimSessions(sessionsRaw);
        setDimStates(normalizedStates);
        setDimLgas(normalizedLgas);
        setDimWards(normalizedWards);
        setDimSchools(normalizedSchools);
        setZones(Array.from(new Set(normalizedStates.map((row) => row.zone).filter(Boolean))).sort());

        const latestSession = sessionsRaw.length ? sessionsRaw[sessionsRaw.length - 1].session_id : "";
        setFilters((prev) => (prev.session ? prev : { ...prev, session: latestSession }));
      } catch (err) {
        if (!alive) return;
        setDataErr(err instanceof Error ? err.message : "Failed to load dimension CSVs");
      } finally {
        if (alive) {
          setLoadingDims(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!showTeacherCapacity || teacherSeedsLoaded) return;

    let alive = true;

    const loadTeacherSeeds = async () => {
      try {
        const rows = await loadRefinedFile<TeacherFilterSeed>("pages/teacher_capacity/top_rollup.csv");
        if (!alive) return;
        setTeacherSeedRows(rows);
        setTeacherSeedsLoaded(true);
      } catch {
        if (!alive) return;
        setTeacherSeedRows([]);
        setTeacherSeedsLoaded(true);
      }
    };

    void loadTeacherSeeds();

    return () => {
      alive = false;
    };
  }, [showTeacherCapacity, teacherSeedsLoaded]);

  useEffect(() => {
    if (!showAccessCoverage || accessSeedsLoaded) return;

    let alive = true;
    const loadAccessSeeds = async () => {
      try {
        const [wardRows, almajiriRows] = await Promise.all([
          loadRefinedFile<AccessCoverageWardSeed>("pages/access_coverage/top_rollup.csv"),
          loadRefinedFile<AccessCoverageAlmajiriSeed>("pages/access_coverage/access_almajiri_state.csv"),
        ]);
        if (!alive) return;
        setAccessWardSeedRows(wardRows);
        setAccessAlmajiriSeedRows(almajiriRows);
        setAccessSeedsLoaded(true);
      } catch {
        if (!alive) return;
        setAccessWardSeedRows([]);
        setAccessAlmajiriSeedRows([]);
        setAccessSeedsLoaded(true);
      }
    };

    void loadAccessSeeds();

    return () => {
      alive = false;
    };
  }, [showAccessCoverage, accessSeedsLoaded]);

  useEffect(() => {
    if (category !== "policy_impact" || policySeedsLoaded) return;

    let alive = true;
    const loadPolicySeeds = async () => {
      try {
        const rows = await loadRefinedFile<PolicyImpactSeed>("pages/policy_impact/policy_programme.csv");
        if (!alive) return;
        setPolicyImpactSeedRows(rows);
        setPolicySeedsLoaded(true);
      } catch {
        if (!alive) return;
        setPolicyImpactSeedRows([]);
        setPolicySeedsLoaded(true);
      }
    };

    void loadPolicySeeds();

    return () => {
      alive = false;
    };
  }, [category, policySeedsLoaded]);

  useEffect(() => {
    if (category !== "transition" || transitionSeedsLoaded) return;

    let alive = true;
    const loadTransitionSeeds = async () => {
      try {
        const [generalRows, directRows] = await Promise.all([
          loadRefinedFile<TransitionFilterSeed>("pages/transition_general/top_rollup.csv"),
          loadRefinedFile<TransitionFilterSeed>("pages/transition_direct/top_rollup.csv"),
        ]);
        if (!alive) return;
        setTransitionGeneralSeedRows(generalRows);
        setTransitionDirectSeedRows(directRows);
        setTransitionSeedsLoaded(true);
      } catch {
        if (!alive) return;
        setTransitionGeneralSeedRows([]);
        setTransitionDirectSeedRows([]);
        setTransitionSeedsLoaded(true);
      }
    };

    void loadTransitionSeeds();

    return () => {
      alive = false;
    };
  }, [category, transitionSeedsLoaded]);

  useEffect(() => {
    if (category !== "performance" || performanceSeedsLoaded) return;

    let alive = true;
    const loadPerformanceSeeds = async () => {
      try {
        const rows = await loadRefinedFile<PerformanceFilterSeed>("pages/performance/top_rollup.csv");
        if (!alive) return;
        setPerformanceSeedRows(rows);
        setPerformanceSeedsLoaded(true);
      } catch {
        if (!alive) return;
        setPerformanceSeedRows([]);
        setPerformanceSeedsLoaded(true);
      }
    };

    void loadPerformanceSeeds();

    return () => {
      alive = false;
    };
  }, [category, performanceSeedsLoaded]);

  const accessSeedHasLga = useMemo(() => accessWardSeedRows.some((row) => hasText(row.lga)), [accessWardSeedRows]);
  const accessSeedHasWard = useMemo(() => accessWardSeedRows.some((row) => hasText(row.ward)), [accessWardSeedRows]);
  const accessSeedHasSchool = useMemo(
    () => accessWardSeedRows.some((row) => hasText(row.school)),
    [accessWardSeedRows],
  );
  const teacherSeedHasLga = useMemo(() => teacherSeedRows.some((row) => hasText(row.lga)), [teacherSeedRows]);
  const teacherSeedHasWard = useMemo(() => teacherSeedRows.some((row) => hasText(row.ward)), [teacherSeedRows]);
  const teacherSeedHasSchool = useMemo(
    () => teacherSeedRows.some((row) => hasText(row.school)),
    [teacherSeedRows],
  );
  const transitionRowsForDepth = useMemo(
    () => (directMode ? transitionDirectSeedRows : transitionGeneralSeedRows),
    [directMode, transitionDirectSeedRows, transitionGeneralSeedRows],
  );
  const transitionSeedHasLga = useMemo(
    () => transitionRowsForDepth.some((row) => hasText(row.lga)),
    [transitionRowsForDepth],
  );
  const transitionSeedHasWard = useMemo(
    () => transitionRowsForDepth.some((row) => hasText(row.ward)),
    [transitionRowsForDepth],
  );
  const transitionSeedHasSchool = useMemo(
    () => transitionRowsForDepth.some((row) => hasText(row.school)),
    [transitionRowsForDepth],
  );
  const performanceSeedHasLga = useMemo(
    () => performanceSeedRows.some((row) => hasText(row.lga)),
    [performanceSeedRows],
  );
  const performanceSeedHasWard = useMemo(
    () => performanceSeedRows.some((row) => hasText(row.ward)),
    [performanceSeedRows],
  );
  const performanceSeedHasSchool = useMemo(
    () => performanceSeedRows.some((row) => hasText(row.school)),
    [performanceSeedRows],
  );

  const accessScopedRows = useMemo(() => {
    return accessWardSeedRows
      .filter((row) => (filters.session ? row.session === filters.session : true))
      .filter((row) => geoFilterMatch(row.zone, filters.zone))
      .filter((row) => geoFilterMatch(row.state, filters.state))
      .filter((row) => (!filters.lga || !accessSeedHasLga ? true : geoFilterMatch(row.lga, filters.lga)))
      .filter((row) => (!filters.ward || !accessSeedHasWard ? true : geoFilterMatch(row.ward, filters.ward)))
      .filter((row) =>
        filters.school
          ? accessSeedHasSchool
            ? row.school
                .split(" | ")
                .map((value) => value.trim())
                .filter(Boolean)
                .some((value) => geoFilterMatch(value, filters.school))
            : true
          : true,
      );
  }, [accessWardSeedRows, filters.session, filters.zone, filters.state, filters.lga, filters.ward, filters.school, accessSeedHasLga, accessSeedHasWard, accessSeedHasSchool]);



  const policyScopedRows = useMemo(() => {
    return policyImpactSeedRows
      .filter((row) => (filters.session ? row.session === filters.session : true))
      .filter((row) => geoFilterMatch(row.zone, filters.zone))
      .filter((row) => geoFilterMatch(row.state, filters.state))
      .filter((row) => geoFilterMatch(row.lga, filters.lga))
      .filter((row) => (filters.gender ? row.gender === filters.gender : true))
      .filter((row) => (filters.institution_type ? row.institution_type === filters.institution_type : true))
      .filter((row) => (filters.tertiary_institution ? row.tertiary_institution === filters.tertiary_institution : true))
      .filter((row) => (filters.programme_cluster ? row.programme_cluster === filters.programme_cluster : true))
      .filter((row) => (filters.discipline_group ? row.discipline_group === filters.discipline_group : true))
      .filter((row) => (filters.programme ? row.programme === filters.programme : true));
  }, [policyImpactSeedRows, filters.session, filters.zone, filters.state, filters.lga, filters.gender, filters.institution_type, filters.tertiary_institution, filters.programme_cluster, filters.discipline_group, filters.programme]);

  const policyScopeRowsForSessions = useMemo(() => {
    return Array.from(
      new Set(
        policyImpactSeedRows
          .filter((row) => geoFilterMatch(row.zone, filters.zone))
          .filter((row) => geoFilterMatch(row.state, filters.state))
          .filter((row) => geoFilterMatch(row.lga, filters.lga))
          .map((row) => row.session)
          .filter(Boolean),
      ),
    ).sort();
  }, [policyImpactSeedRows, filters.zone, filters.state, filters.lga]);
  const accessScopeRowsForSessions = useMemo(() => {
    const wardSessions = accessWardSeedRows
      .filter((row) => geoFilterMatch(row.zone, filters.zone))
      .filter((row) => geoFilterMatch(row.state, filters.state))
      .filter((row) => (!filters.lga || !accessSeedHasLga ? true : geoFilterMatch(row.lga, filters.lga)))
      .filter((row) => (!filters.ward || !accessSeedHasWard ? true : geoFilterMatch(row.ward, filters.ward)))
      .map((row) => row.session);

    const almajiriSessions = accessAlmajiriSeedRows
      .filter((row) => geoFilterMatch(row.zone, filters.zone))
      .filter((row) => geoFilterMatch(row.state, filters.state))
      .map((row) => row.session);

    return Array.from(new Set([...wardSessions, ...almajiriSessions].filter(Boolean))).sort();
  }, [accessWardSeedRows, accessAlmajiriSeedRows, filters.zone, filters.state, filters.lga, filters.ward, accessSeedHasLga, accessSeedHasWard]);

  useEffect(() => {
    const nextStates = dimStates
      .filter((row) => geoFilterMatch(row.zone, filters.zone))
      .map((row) => row.state);
    setStates(Array.from(new Set(nextStates)).sort());
  }, [dimStates, filters.zone]);

  useEffect(() => {
    const nextLgas = dimLgas
      .filter((row) => geoFilterMatch(row.zone, filters.zone))
      .filter((row) => geoFilterMatch(row.state, filters.state))
      .map((row) => row.lga);
    setLgas(Array.from(new Set(nextLgas)).sort());
  }, [dimLgas, filters.zone, filters.state]);

  useEffect(() => {
    const nextWards = dimWards
      .filter((row) => geoFilterMatch(row.zone, filters.zone))
      .filter((row) => geoFilterMatch(row.state, filters.state))
      .filter((row) => geoFilterMatch(row.lga, filters.lga))
      .map((row) => row.ward);
    setWards(Array.from(new Set(nextWards)).sort());
  }, [dimWards, filters.zone, filters.state, filters.lga]);

  useEffect(() => {
    const nextSchools = dimSchools
      .filter((row) => geoFilterMatch(row.zone, filters.zone))
      .filter((row) => geoFilterMatch(row.state, filters.state))
      .filter((row) => geoFilterMatch(row.lga, filters.lga))
      .filter((row) => geoFilterMatch(row.ward, filters.ward))
      .map((row) => row.school);
    setSchools(Array.from(new Set(nextSchools)).sort());
  }, [dimSchools, filters.zone, filters.state, filters.lga, filters.ward]);

  const scopedTeacherSeedRows = useMemo(() => {
    return teacherSeedRows
      .filter((row) => (filters.session ? row.session === filters.session : true))
      .filter((row) => geoFilterMatch(row.zone, filters.zone))
      .filter((row) => geoFilterMatch(row.state, filters.state))
      .filter((row) => (!filters.lga || !teacherSeedHasLga ? true : geoFilterMatch(row.lga, filters.lga)))
      .filter((row) => (!filters.ward || !teacherSeedHasWard ? true : geoFilterMatch(row.ward, filters.ward)))
      .filter((row) => (!filters.school || !teacherSeedHasSchool ? true : geoFilterMatch(row.school, filters.school)));
  }, [teacherSeedRows, filters.session, filters.zone, filters.state, filters.lga, filters.ward, filters.school, teacherSeedHasLga, teacherSeedHasWard, teacherSeedHasSchool]);

  useEffect(() => {
    if (showAccessCoverage) {
      const nextTypes = accessScopedRows.map((row) => row.school_type).filter(Boolean);
      setSchoolTypes(orderedUnique(nextTypes, ACCESS_SCHOOL_TYPE_FILTER_ORDER));
      return;
    }

    const nextTypes = scopedTeacherSeedRows.map((row) => row.school_type).filter(Boolean);
    setSchoolTypes(orderedUnique(nextTypes, SCHOOL_TYPE_FILTER_ORDER));
  }, [category, scopedTeacherSeedRows, accessScopedRows]);

  useEffect(() => {
    if (showAccessCoverage) {
      const scoped = accessScopedRows.filter((row) => (filters.school_type ? row.school_type === filters.school_type : true));
      const nextLevels = scoped.map((row) => row.school_level).filter(Boolean);
      setSchoolLevels(orderedUnique(nextLevels, ACCESS_SCHOOL_LEVEL_FILTER_ORDER));
      return;
    }

    const scoped = scopedTeacherSeedRows.filter((row) => (filters.school_type ? row.school_type === filters.school_type : true));
    const nextLevels = scoped.map((row) => row.school_level).filter(Boolean);
    setSchoolLevels(orderedUnique(nextLevels, SCHOOL_LEVEL_FILTER_ORDER));
  }, [category, scopedTeacherSeedRows, accessScopedRows, filters.school_type]);

  useEffect(() => {
    if (showAccessCoverage) {
      const scoped = accessScopedRows
        .filter((row) => (filters.school_type ? row.school_type === filters.school_type : true))
        .filter((row) => (filters.school_level ? row.school_level === filters.school_level : true));

      const nextGrades = scoped.map((row) => row.class_grade).filter(Boolean);
      setClassGrades(orderedUnique(nextGrades, ACCESS_CLASS_GRADE_FILTER_ORDER));
      return;
    }

    const scoped = scopedTeacherSeedRows
      .filter((row) => (filters.school_type ? row.school_type === filters.school_type : true))
      .filter((row) => (filters.school_level ? row.school_level === filters.school_level : true));

    const nextGrades = scoped.map((row) => row.class_grade).filter(Boolean);
    setClassGrades(orderedUnique(nextGrades, CLASS_GRADE_FILTER_ORDER));
  }, [category, scopedTeacherSeedRows, accessScopedRows, filters.school_type, filters.school_level]);

  useEffect(() => {
    if (!directMode) return;
    setFilters((prev) => ({ ...prev, gap_band: "" }));
  }, [directMode]);

  useEffect(() => {
    if (!showAccessCoverage) return;
    if (!accessScopeRowsForSessions.length) return;
    if (filters.session) return;

    setFilters((prev) => ({ ...prev, session: accessScopeRowsForSessions[accessScopeRowsForSessions.length - 1] ?? "" }));
  }, [category, filters.session, accessScopeRowsForSessions]);


  const transitionSessionScopeRows = useMemo(() => {
    const rows = directMode ? transitionDirectSeedRows : transitionGeneralSeedRows;
    return rows
      .filter((row) => geoFilterMatch(row.zone, filters.zone))
      .filter((row) => geoFilterMatch(row.state, filters.state))
      .filter((row) => (!filters.lga || !transitionSeedHasLga ? true : geoFilterMatch(row.lga, filters.lga)))
      .filter((row) => (!filters.ward || !transitionSeedHasWard ? true : geoFilterMatch(row.ward, filters.ward)))
      .filter((row) => (!filters.school || !transitionSeedHasSchool ? true : geoFilterMatch(row.school, filters.school)))
      .filter((row) => (filters.gender ? row.gender === filters.gender : true))
      .filter((row) => (disabilityMode ? row.disability === "Disabled" : row.disability === "ALL"))
      .filter((row) => (filters.exam_body ? row.exam_body === filters.exam_body : true))
      .filter((row) => (directMode || !filters.gap_band ? true : normalizeTransitionGapBand(row.gap_band ?? "") === filters.gap_band));
  }, [transitionGeneralSeedRows, transitionDirectSeedRows, directMode, filters.zone, filters.state, filters.lga, filters.ward, filters.school, filters.gender, filters.exam_body, filters.gap_band, disabilityMode, transitionSeedHasLga, transitionSeedHasWard, transitionSeedHasSchool]);

  const transitionOptionRows = useMemo(() => {
    const rows = directMode ? transitionDirectSeedRows : transitionGeneralSeedRows;
    return rows
      .filter((row) => (filters.session ? row.session === filters.session : true))
      .filter((row) => (filters.gender ? row.gender === filters.gender : true))
      .filter((row) => (disabilityMode ? row.disability === "Disabled" : row.disability === "ALL"))
      .filter((row) => (filters.exam_body ? row.exam_body === filters.exam_body : true))
      .filter((row) => (directMode || !filters.gap_band ? true : normalizeTransitionGapBand(row.gap_band ?? "") === filters.gap_band));
  }, [transitionGeneralSeedRows, transitionDirectSeedRows, directMode, filters.session, filters.gender, filters.exam_body, filters.gap_band, disabilityMode]);

  const performanceSessionScopeRows = useMemo(() => {
    return performanceSeedRows
      .filter((row) => geoFilterMatch(row.zone, filters.zone))
      .filter((row) => geoFilterMatch(row.state, filters.state))
      .filter((row) => (!filters.lga || !performanceSeedHasLga ? true : geoFilterMatch(row.lga, filters.lga)))
      .filter((row) => (!filters.ward || !performanceSeedHasWard ? true : geoFilterMatch(row.ward, filters.ward)))
      .filter((row) => (!filters.school || !performanceSeedHasSchool ? true : geoFilterMatch(row.school, filters.school)))
      .filter((row) => (filters.gender ? row.gender === filters.gender : true))
      .filter((row) => (disabilityMode ? row.disability === "Disabled" : row.disability === "ALL"))
      .filter((row) => (filters.exam_body ? performanceExamBody(row) === filters.exam_body : true));
  }, [performanceSeedRows, filters.zone, filters.state, filters.lga, filters.ward, filters.school, filters.gender, filters.exam_body, disabilityMode, performanceSeedHasLga, performanceSeedHasWard, performanceSeedHasSchool]);

  const performanceOptionRows = useMemo(() => {
    return performanceSeedRows
      .filter((row) => (filters.session ? row.session === filters.session : true))
      .filter((row) => (filters.gender ? row.gender === filters.gender : true))
      .filter((row) => (disabilityMode ? row.disability === "Disabled" : row.disability === "ALL"))
      .filter((row) => (filters.exam_body ? performanceExamBody(row) === filters.exam_body : true));
  }, [performanceSeedRows, filters.session, filters.gender, filters.exam_body, disabilityMode]);

  const transitionScopeRowsForSessions = useMemo(() => {
    return Array.from(new Set(transitionSessionScopeRows.map((row) => row.session).filter(Boolean))).sort();
  }, [transitionSessionScopeRows]);

  const performanceScopeRowsForSessions = useMemo(() => {
    return Array.from(new Set(performanceSessionScopeRows.map((row) => row.session).filter(Boolean))).sort();
  }, [performanceSessionScopeRows]);

  const transitionZones = useMemo(() => Array.from(new Set(transitionOptionRows.map((row) => row.zone).filter(Boolean))).sort(), [transitionOptionRows]);
  const transitionStates = useMemo(() => Array.from(new Set(dimStates.filter((row) => geoFilterMatch(row.zone, filters.zone)).map((row) => row.state).filter(Boolean))).sort(), [dimStates, filters.zone]);
  const transitionLgas = useMemo(() => Array.from(new Set(dimLgas.filter((row) => geoFilterMatch(row.zone, filters.zone)).filter((row) => geoFilterMatch(row.state, filters.state)).map((row) => row.lga).filter(Boolean))).sort(), [dimLgas, filters.zone, filters.state]);
  const transitionWards = useMemo(() => Array.from(new Set(dimWards.filter((row) => geoFilterMatch(row.zone, filters.zone)).filter((row) => geoFilterMatch(row.state, filters.state)).filter((row) => geoFilterMatch(row.lga, filters.lga)).map((row) => row.ward).filter(Boolean))).sort(), [dimWards, filters.zone, filters.state, filters.lga]);
  const transitionSchools = useMemo(() => Array.from(new Set(dimSchools.filter((row) => geoFilterMatch(row.zone, filters.zone)).filter((row) => geoFilterMatch(row.state, filters.state)).filter((row) => geoFilterMatch(row.lga, filters.lga)).filter((row) => geoFilterMatch(row.ward, filters.ward)).map((row) => row.school).filter(Boolean))).sort(), [dimSchools, filters.zone, filters.state, filters.lga, filters.ward]);

  const performanceZones = useMemo(() => Array.from(new Set(performanceOptionRows.map((row) => row.zone).filter(Boolean))).sort(), [performanceOptionRows]);
  const performanceStates = useMemo(() => Array.from(new Set(performanceOptionRows.filter((row) => geoFilterMatch(row.zone, filters.zone)).map((row) => row.state).filter(Boolean))).sort(), [performanceOptionRows, filters.zone]);
  const performanceLgas = useMemo(() => Array.from(new Set(performanceOptionRows.filter((row) => geoFilterMatch(row.zone, filters.zone)).filter((row) => geoFilterMatch(row.state, filters.state)).map((row) => row.lga).filter(Boolean))).sort(), [performanceOptionRows, filters.zone, filters.state]);
  const performanceWards = useMemo(() => Array.from(new Set(performanceOptionRows.filter((row) => geoFilterMatch(row.zone, filters.zone)).filter((row) => geoFilterMatch(row.state, filters.state)).filter((row) => geoFilterMatch(row.lga, filters.lga)).map((row) => row.ward).filter(Boolean))).sort(), [performanceOptionRows, filters.zone, filters.state, filters.lga]);
  const performanceSchools = useMemo(() => Array.from(new Set(performanceOptionRows.filter((row) => geoFilterMatch(row.zone, filters.zone)).filter((row) => geoFilterMatch(row.state, filters.state)).filter((row) => geoFilterMatch(row.lga, filters.lga)).filter((row) => geoFilterMatch(row.ward, filters.ward)).map((row) => row.school).filter(Boolean))).sort(), [performanceOptionRows, filters.zone, filters.state, filters.lga, filters.ward]);

  useEffect(() => {
    if (category !== "transition") return;
    if (!transitionScopeRowsForSessions.length) return;
    if (filters.session) return;

    setFilters((prev) => ({ ...prev, session: transitionScopeRowsForSessions[transitionScopeRowsForSessions.length - 1] ?? "" }));
  }, [category, filters.session, transitionScopeRowsForSessions]);

  useEffect(() => {
    if (category !== "performance") return;
    if (!performanceScopeRowsForSessions.length) return;
    if (filters.session) return;

    setFilters((prev) => ({ ...prev, session: performanceScopeRowsForSessions[performanceScopeRowsForSessions.length - 1] ?? "" }));
  }, [category, filters.session, performanceScopeRowsForSessions]);

  const sectionOptions = useMemo<SectionDef[]>(() => {
    if (category === "transition") {
      return directMode ? DIRECT_TRANSITION_SECTIONS : GENERAL_TRANSITION_SECTIONS;
    }
    if (category === "performance") {
      return PERFORMANCE_SECTIONS;
    }
    if (isBasicSecondary) {
      return showTeacherCapacity ? TEACHER_CAPACITY_SECTIONS : ACCESS_COVERAGE_SECTIONS;
    }
    if (category === "policy_impact") {
      return POLICY_IMPACT_SECTIONS;
    }
    if (category === "general_overview") {
      return GENERAL_OVERVIEW_SECTIONS;
    }
    return PLACEHOLDER_SECTIONS[category as Exclude<CategoryKey, "transition" | "performance" | "basic_secondary" | "general_overview">];
  }, [category, directMode, basicSecondaryView]);

  const policyZones = Array.from(new Set(policyImpactSeedRows.map((row) => row.zone).filter(Boolean))) as string[];
  policyZones.sort((a, b) => a.localeCompare(b));
  const policyStates = Array.from(new Set(policyImpactSeedRows.filter((row) => (filters.session ? row.session === filters.session : true)).filter((row) => geoFilterMatch(row.zone, filters.zone)).map((row) => row.state).filter(Boolean))) as string[];
  policyStates.sort((a, b) => a.localeCompare(b));
  const policyLgas = Array.from(new Set(policyImpactSeedRows.filter((row) => (filters.session ? row.session === filters.session : true)).filter((row) => geoFilterMatch(row.zone, filters.zone)).filter((row) => geoFilterMatch(row.state, filters.state)).map((row) => row.lga).filter(Boolean))) as string[];
  policyLgas.sort((a, b) => a.localeCompare(b));
  const policyInstitutionTypes = Array.from(new Set(policyScopedRows.map((row) => row.institution_type).filter(Boolean))) as string[];
  policyInstitutionTypes.sort((a, b) => a.localeCompare(b));
  const policyInstitutions = Array.from(new Set(policyScopedRows.filter((row) => (filters.institution_type ? row.institution_type === filters.institution_type : true)).map((row) => row.tertiary_institution).filter(Boolean))) as string[];
  policyInstitutions.sort((a, b) => a.localeCompare(b));
  const policyProgrammeClusters = Array.from(new Set(policyScopedRows.map((row) => row.programme_cluster).filter(Boolean))) as string[];
  policyProgrammeClusters.sort((a, b) => a.localeCompare(b));
  const policyDisciplineGroups = Array.from(new Set(policyScopedRows.filter((row) => (filters.programme_cluster ? row.programme_cluster === filters.programme_cluster : true)).map((row) => row.discipline_group).filter(Boolean))) as string[];
  policyDisciplineGroups.sort((a, b) => a.localeCompare(b));
  const policyProgrammes = Array.from(new Set(policyScopedRows.filter((row) => (filters.programme_cluster ? row.programme_cluster === filters.programme_cluster : true)).filter((row) => (filters.discipline_group ? row.discipline_group === filters.discipline_group : true)).map((row) => row.programme).filter(Boolean))) as string[];
  policyProgrammes.sort((a, b) => a.localeCompare(b));

  const activeSessionValues = showAccessCoverage
    ? accessScopeRowsForSessions
    : category === "policy_impact"
      ? policyScopeRowsForSessions
      : category === "transition"
        ? transitionScopeRowsForSessions
        : category === "performance"
          ? performanceScopeRowsForSessions
          : dimSessions.map((row) => row.session_id);

  const fallbackSessionValues = dimSessions.map((row) => row.session_id).filter(Boolean);
  const effectiveSessionValues = activeSessionValues.length ? activeSessionValues : fallbackSessionValues;
  // latestSessionId always resolves: active sessions → fallback dim sessions → ""
  // This ensures `ready` is never stuck on false after dims have loaded
  const dimLatestSessionId = fallbackSessionValues.length
    ? fallbackSessionValues[fallbackSessionValues.length - 1]
    : "";
  const latestSessionId = dimLatestSessionId || (effectiveSessionValues.length
    ? effectiveSessionValues[effectiveSessionValues.length - 1]
    : "");

  // Fall back to dim tables when category-specific seed rows haven't loaded yet
  // Always fall back through: category seed rows → useEffect state → dim tables directly
  // This guarantees filter dropdowns are populated immediately once dims have loaded,
  // regardless of whether per-category seed rows have finished loading.
  const dimZones = Array.from(new Set(dimStates.map((row) => row.zone).filter(Boolean))).sort() as string[];
  const dimStateNames = Array.from(new Set(
    dimStates.filter((row) => geoFilterMatch(row.zone, filters.zone)).map((row) => row.state).filter(Boolean)
  )).sort() as string[];
  const dimLgaNames = Array.from(new Set(
    dimLgas.filter((row) => geoFilterMatch(row.zone, filters.zone)).filter((row) => geoFilterMatch(row.state, filters.state)).map((row) => row.lga).filter(Boolean)
  )).sort() as string[];
  const dimWardNames = Array.from(new Set(
    dimWards.filter((row) => geoFilterMatch(row.state, filters.state)).filter((row) => geoFilterMatch(row.lga, filters.lga)).map((row) => row.ward).filter(Boolean)
  )).sort() as string[];

  const activeZoneValues = category === "policy_impact"
    ? (policyZones.length ? policyZones : (zones.length ? zones : dimZones))
    : category === "transition"
      ? (transitionZones.length ? transitionZones : (zones.length ? zones : dimZones))
      : category === "performance"
        ? (performanceZones.length ? performanceZones : (zones.length ? zones : dimZones))
        : (zones.length ? zones : dimZones);
  const activeStateValues = category === "policy_impact"
    ? (policyStates.length ? policyStates : (states.length ? states : dimStateNames))
    : category === "transition"
      ? (transitionStates.length ? transitionStates : (states.length ? states : dimStateNames))
      : category === "performance"
        ? (performanceStates.length ? performanceStates : (states.length ? states : dimStateNames))
        : (states.length ? states : dimStateNames);
  const activeLgaValues = category === "policy_impact"
    ? (policyLgas.length ? policyLgas : (lgas.length ? lgas : dimLgaNames))
    : category === "transition"
      ? (transitionLgas.length ? transitionLgas : (lgas.length ? lgas : dimLgaNames))
      : category === "performance"
        ? (performanceLgas.length ? performanceLgas : (lgas.length ? lgas : dimLgaNames))
        : (lgas.length ? lgas : dimLgaNames);
  const activeWardValues = category === "transition"
    ? (transitionWards.length ? transitionWards : (wards.length ? wards : dimWardNames))
    : category === "performance"
      ? (performanceWards.length ? performanceWards : (wards.length ? wards : dimWardNames))
      : (wards.length ? wards : dimWardNames);
  const activeSchoolValues = category === "transition"
    ? transitionSchools
    : category === "performance"
      ? performanceSchools
      : schools;

  // Session options: use per-category effective values, falling back to dim_sessions directly
  // so the dropdown is never empty after dims have loaded
  const finalSessionValues = fallbackSessionValues.length ? fallbackSessionValues : effectiveSessionValues;
  const sessionOptions: FilterOption[] = sanitizeOptions(
    finalSessionValues.map((value) => ({ label: value, value })),
  );
  const gapOptions: FilterOption[] = GAP_BANDS.map((value) => ({ label: value, value }));
  const examOptions: FilterOption[] = EXAM_BODIES.map((value) => ({ label: value, value }));
  const genderOptions: FilterOption[] = ["Male", "Female"].map((value) => ({ label: value, value }));
  const zoneOptions: FilterOption[] = activeZoneValues.map((value) => ({ label: value, value }));
  const stateOptions: FilterOption[] = activeStateValues.map((value) => ({ label: value, value }));
  const lgaOptions: FilterOption[] = activeLgaValues.map((value) => ({ label: truncateLabel(value, 24), value }));
  const wardOptions: FilterOption[] = activeWardValues.map((value) => ({ label: truncateLabel(value, 24), value }));
  const schoolOptions: FilterOption[] = activeSchoolValues.map((value) => ({ label: truncateLabel(value, 24), value }));
  const schoolLevelOptions: FilterOption[] = schoolLevels.map((value) => ({ label: SCHOOL_LEVEL_DISPLAY[value] ?? value, value }));
  const schoolTypeOptions: FilterOption[] = schoolTypes.map((value) => ({ label: value, value }));
  const classGradeOptions: FilterOption[] = classGrades.map((value) => ({ label: value, value }));
  const qualificationOptions: FilterOption[] = TEACHER_QUALIFICATION_OPTIONS.map((value) => ({ label: value, value }));
  const accessSchoolTypeOptions: FilterOption[] = schoolTypes.map((value) => ({ label: value, value }));
  const accessSchoolLevelOptions: FilterOption[] = schoolLevels.map((value) => ({ label: SCHOOL_LEVEL_DISPLAY[value] ?? value, value }));
  const accessClassGradeOptions: FilterOption[] = classGrades.map((value) => ({ label: value, value }));
  const policyInstitutionTypeOptions: FilterOption[] = policyInstitutionTypes.map((value) => ({ label: value, value }));
  const policyInstitutionOptions: FilterOption[] = policyInstitutions.map((value) => ({ label: truncateLabel(value, 28), value }));
  const policyProgrammeClusterOptions: FilterOption[] = policyProgrammeClusters.map((value) => ({ label: value, value }));
  const policyDisciplineOptions: FilterOption[] = policyDisciplineGroups.map((value) => ({ label: truncateLabel(value, 24), value }));
  const policyProgrammeOptions: FilterOption[] = policyProgrammes.map((value) => ({ label: truncateLabel(value, 28), value }));



  useEffect(() => {
    if (!isStateScopedAdmin || !assignedStateScope) return;

    setFilters((prev) => {
      if (prev.state === assignedStateScope && prev.zone === "") {
        return prev;
      }

      return {
        ...prev,
        zone: "",
        state: assignedStateScope,
        lga: prev.state === assignedStateScope ? prev.lga : "",
        ward: prev.state === assignedStateScope ? prev.ward : "",
        school: prev.state === assignedStateScope ? prev.school : "",
      };
    });
  }, [assignedStateScope, isStateScopedAdmin]);

  useEffect(() => {
    if (
      filters.state &&
      !stateOptions.some((option) => option.value === filters.state) &&
      !(isStateScopedAdmin && filters.state === assignedStateScope)
    ) {
      setFilters((prev) => ({ ...prev, state: "", lga: "", ward: "", school: "" }));
    }
  }, [assignedStateScope, filters.state, isStateScopedAdmin, stateOptions]);

  useEffect(() => {
    if (filters.lga && !lgaOptions.some((option) => option.value === filters.lga)) {
      setFilters((prev) => ({ ...prev, lga: "", ward: "", school: "" }));
    }
  }, [filters.lga, lgaOptions]);

  useEffect(() => {
    if (filters.ward && !wardOptions.some((option) => option.value === filters.ward)) {
      setFilters((prev) => ({ ...prev, ward: "", school: "" }));
    }
  }, [filters.ward, wardOptions]);

  useEffect(() => {
    if (filters.school && !schoolOptions.some((option) => option.value === filters.school)) {
      setFilters((prev) => ({ ...prev, school: "" }));
    }
  }, [filters.school, schoolOptions]);

  useEffect(() => {
    // Use the per-category latestSessionId if available, otherwise fall back to dim_sessions directly
    const sessionToSet = dimLatestSessionId || latestSessionId;
    if (loadingDims || dataErr || filters.session || !sessionToSet) return;
    setFilters((prev) => ({ ...prev, session: sessionToSet }));
  }, [loadingDims, dataErr, filters.session, latestSessionId, dimLatestSessionId]);

  const effectiveFilters = useMemo(
    () => {
      const sessionToUse = dimLatestSessionId || latestSessionId;
      return filters.session || !sessionToUse ? filters : { ...filters, session: sessionToUse };
    },
    [filters, latestSessionId, dimLatestSessionId],
  );
  const dashboardFilters = useDeferredValue(effectiveFilters);

  // Use dimLatestSessionId as the guaranteed fallback — once dims have loaded, ready is always true
  const ready = !loadingDims && !dataErr && !!(effectiveFilters.session || latestSessionId || dimLatestSessionId);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.body.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setShowScrollTop(false);
  }, [category, basicSecondaryView, directMode]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 320);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const resetFilters = () => {
    const latestSession = dimLatestSessionId || latestSessionId;
    setFilters({
      session: latestSession,
      zone: "",
      state: isStateScopedAdmin ? assignedStateScope : "",
      lga: "",
      ward: "",
      school: "",
      gender: "",
      gap_band: "",
      exam_body: "",
      school_type: "",
      school_level: "",
      class_grade: "",
      qualification_status: "",
      institution_type: "",
      tertiary_institution: "",
      programme_cluster: "",
      discipline_group: "",
      programme: "",
    });
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <MinisterLayout
      onLogout={onLogout}
      onOpenSettings={onOpenSettings}
      onGoDashboard={() => undefined}
      currentPage="dashboard"
      topTabs={DASHBOARD_TABS}
      activeTopTab={category}
      onSelectTopTab={(key) => setCategory(key as CategoryKey)}
    >
      <div className="sticky top-14 z-[60] border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {isBasicSecondary ? (
                <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 gap-0.5">
                  <button
                    type="button"
                    onClick={() => setBasicSecondaryView("access_coverage")}
                    className={[
                      "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-all",
                      showAccessCoverage
                        ? "bg-white text-emerald-700 shadow-sm ring-1 ring-inset ring-emerald-200"
                        : "text-slate-500 hover:text-slate-700 hover:bg-white/60",
                    ].join(" ")}
                  >
                    <BookOpen className="h-3.5 w-3.5 shrink-0" />
                    Access &amp; Coverage
                  </button>
                  <button
                    type="button"
                    onClick={() => setBasicSecondaryView("teacher_capacity")}
                    className={[
                      "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-all",
                      showTeacherCapacity
                        ? "bg-white text-emerald-700 shadow-sm ring-1 ring-inset ring-emerald-200"
                        : "text-slate-500 hover:text-slate-700 hover:bg-white/60",
                    ].join(" ")}
                  >
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    Teacher Capacity
                  </button>
                </div>
              ) : null}

              <FilterSelect
                value=""
                placeholder="Sections"
                options={sectionOptions.map((section) => ({ label: section.label, value: section.id }))}
                onChange={(value) => {
                  if (!value) return;
                  scrollToSection(value);
                }}
                maxWidth="max-w-[220px]"
              />
            </div>

            <div className="flex items-center gap-3 self-end lg:self-auto">
              <TogglePill
                onClick={() => setDisabilityMode((prev) => !prev)}
                active={disabilityMode}
                icon={<Accessibility className="h-3.5 w-3.5" />}
                label={`Disability ${disabilityMode ? "ON" : "OFF"}`}
                activeClass="border-violet-600 bg-violet-600 text-white shadow-sm"
              />
              {category === "transition" ? (
                <TogglePill
                  onClick={() => setDirectMode((prev) => !prev)}
                  active={directMode}
                  icon={<ArrowRight className="h-3.5 w-3.5" />}
                  label={`Direct Mode ${directMode ? "ON" : "OFF"}`}
                  activeClass="border-emerald-600 bg-emerald-600 text-white shadow-sm"
                />
              ) : null}

              {/* {category === "policy_impact" ? (
                <TogglePill
                  onClick={() => setAdmittedMode((prev) => !prev)}
                  active={admittedMode}
                  icon={<Plus className="h-3.5 w-3.5" />}
                  label={`Admitted ${admittedMode ? "ON" : "OFF"}`}
                  activeClass="border-sky-600 bg-sky-600 text-white shadow-sm"
                />
              ) : null} */}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pb-1">
            <FilterSelect
              value={filters.session}
              placeholder="Session"
              options={sessionOptions}
              onChange={(value) => setFilters((prev) => ({ ...prev, session: value }))}
            />
            {category === "transition" ? (
              <FilterSelect
                value={filters.gap_band}
                placeholder="Time Band"
                options={gapOptions}
                onChange={(value) => setFilters((prev) => ({ ...prev, gap_band: value as MinisterFilters["gap_band"] }))}
                disabled={directMode}
                title={directMode ? "Time Band applies only to General mode." : undefined}
              />
            ) : null}
            {category === "transition" || category === "performance" ? (
              <FilterSelect
                value={filters.exam_body}
                placeholder="O-Level"
                options={examOptions}
                onChange={(value) => setFilters((prev) => ({ ...prev, exam_body: value as MinisterFilters["exam_body"] }))}
              />
            ) : null}
            {category !== "general_overview" ? (
              <FilterSelect
                value={filters.gender}
                placeholder="Gender"
                options={genderOptions}
                onChange={(value) => setFilters((prev) => ({ ...prev, gender: value as GenderFilter }))}
              />
            ) : null}
            {!isStateScopedAdmin ? (
              <FilterSelect
                value={filters.zone}
                placeholder="Zone"
                options={zoneOptions}
                onChange={(value) => setFilters((prev) => ({ ...prev, zone: value, state: "", lga: "", ward: "", school: "" }))}
              />
            ) : null}
            {!isStateScopedAdmin ? (
              <FilterSelect
                value={filters.state}
                placeholder="State"
                options={stateOptions}
                onChange={(value) => setFilters((prev) => ({ ...prev, state: value, lga: "", ward: "", school: "" }))}
              />
            ) : null}
            <FilterSelect
              value={filters.lga}
              placeholder="LGA"
              options={lgaOptions}
              onChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  lga: value,
                  ward: "",
                  school: "",
                  tertiary_institution: "",
                }))
              }
              disabled={!filters.state}
              title={!filters.state ? "Pick State first" : undefined}
            />
            {category !== "policy_impact" && category !== "general_overview" ? (
              <FilterSelect
                value={filters.ward}
                placeholder="Ward"
                options={wardOptions}
                onChange={(value) => setFilters((prev) => ({ ...prev, ward: value, school: "" }))}
                disabled={!filters.lga}
                title={!filters.lga ? "Pick LGA first" : undefined}
              />
            ) : null}
            {category !== "policy_impact" && category !== "general_overview" ? (
              <FilterSelect
                value={filters.school}
                placeholder="School"
                options={schoolOptions}
                onChange={(value) => setFilters((prev) => ({ ...prev, school: value }))}
                disabled={!filters.ward}
                title={!filters.ward ? "Pick Ward first" : undefined}
                maxWidth="max-w-[180px]"
              />
            ) : null}
            {category === "policy_impact" ? (
              <>
                <FilterSelect
                  value={filters.institution_type}
                  placeholder="Institution Type"
                  options={policyInstitutionTypeOptions}
                  onChange={(value) => setFilters((prev) => ({ ...prev, institution_type: value, tertiary_institution: "" }))}
                  maxWidth="max-w-[180px]"
                />
                <FilterSelect
                  value={filters.tertiary_institution}
                  placeholder="Tertiary Institution"
                  options={policyInstitutionOptions}
                  onChange={(value) => setFilters((prev) => ({ ...prev, tertiary_institution: value }))}
                  disabled={!filters.institution_type}
                  title={!filters.institution_type ? "Pick Institution Type first" : undefined}
                  maxWidth="max-w-[220px]"
                />
                <FilterSelect
                  value={filters.programme_cluster}
                  placeholder="Programme Cluster"
                  options={policyProgrammeClusterOptions}
                  onChange={(value) => setFilters((prev) => ({ ...prev, programme_cluster: value, discipline_group: "", programme: "" }))}
                  maxWidth="max-w-[180px]"
                />
                <FilterSelect
                  value={filters.discipline_group}
                  placeholder="Discipline Group"
                  options={policyDisciplineOptions}
                  onChange={(value) => setFilters((prev) => ({ ...prev, discipline_group: value, programme: "" }))}
                  disabled={!filters.programme_cluster}
                  title={!filters.programme_cluster ? "Pick Programme Cluster first" : undefined}
                  maxWidth="max-w-[190px]"
                />
                <FilterSelect
                  value={filters.programme}
                  placeholder="Programme / Course"
                  options={policyProgrammeOptions}
                  onChange={(value) => setFilters((prev) => ({ ...prev, programme: value }))}
                  disabled={!filters.discipline_group}
                  title={!filters.discipline_group ? "Pick Discipline Group first" : undefined}
                  maxWidth="max-w-[220px]"
                />
              </>
            ) : null}

            {showTeacherCapacity || showAccessCoverage ? (
              <FilterSelect
                value={filters.school_type}
                placeholder="School Type"
                options={showAccessCoverage ? accessSchoolTypeOptions : schoolTypeOptions}
                onChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    school_type: value as SchoolTypeFilter,
                    school_level: "",
                    class_grade: "",
                  }))
                }
                maxWidth="max-w-[150px]"
              />
            ) : null}
            {showTeacherCapacity || showAccessCoverage ? (
              <FilterSelect
                value={filters.school_level}
                placeholder="School Level"
                options={showAccessCoverage ? accessSchoolLevelOptions : schoolLevelOptions}
                onChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    school_level: value as SchoolLevelFilter,
                    class_grade: "",
                  }))
                }
                disabled={!filters.school_type}
                title={!filters.school_type ? "Pick School Type first" : undefined}
                maxWidth="max-w-[160px]"
              />
            ) : null}
            {showTeacherCapacity || showAccessCoverage ? (
              <FilterSelect
                value={filters.class_grade}
                placeholder="Class / Grade"
                options={showAccessCoverage ? accessClassGradeOptions : classGradeOptions}
                onChange={(value) => setFilters((prev) => ({ ...prev, class_grade: value }))}
                disabled={!filters.school_level}
                title={!filters.school_level ? "Pick School Level first" : undefined}
                maxWidth="max-w-[150px]"
              />
            ) : null}
            {showTeacherCapacity ? (
              <FilterSelect
                value={filters.qualification_status}
                placeholder="Qualification"
                options={qualificationOptions}
                onChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    qualification_status: value as QualificationStatusFilter,
                  }))
                }
                maxWidth="max-w-[160px]"
              />
            ) : null}

            <button
              className="h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              type="button"
              onClick={resetFilters}
            >
              Reset
            </button>
          </div>

          {loadingDims ? (
            <div className="text-xs text-slate-500">Loading CSV data…</div>
          ) : dataErr ? (
            <div className="text-xs text-red-600">
              Failed to load CSVs: {dataErr}. Check <b>/public/data/</b>.
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-10">
        {!ready ? (
          <div className="mt-6 rounded-xl border border-border bg-card p-10 text-center text-slate-600">
            {loadingDims ? "Loading dashboard…" : dataErr ? dataErr : "Select a session to begin."}
          </div>
        ) : null}

        {ready ? (
          <Suspense
            fallback={
              <div className="mt-6 rounded-xl border border-border bg-card p-10 text-center text-slate-600">
                Loading dashboard page…
              </div>
            }
          >
            {category === "transition" ? (
              <div className="mt-6">
                <TransitionDashboard
                  filters={dashboardFilters}
                  setFilters={setFilters}
                  dimSessions={dimSessions}
                  disabilityMode={disabilityMode}
                  directMode={directMode}
                />
              </div>
            ) : null}

            {category === "performance" ? (
              <div className="mt-6">
                <PerformanceDashboard
                  filters={dashboardFilters}
                  setFilters={setFilters}
                  dimSessions={dimSessions}
                  disabilityMode={disabilityMode}
                />
              </div>
            ) : null}

            {showAccessCoverage ? (
              <div className="mt-6">
                <AccessCoverageDashboard
                  filters={dashboardFilters}
                  setFilters={setFilters}
                  dimSessions={dimSessions}
                  disabilityMode={disabilityMode}
                />
              </div>
            ) : null}

            {showTeacherCapacity ? (
              <div className="mt-6">
                <TeacherCapacityDashboard
                  filters={dashboardFilters}
                  setFilters={setFilters}
                  dimSessions={dimSessions}
                  disabilityMode={disabilityMode}
                />
              </div>
            ) : null}

            {category === "policy_impact" ? (
              <div className="mt-6">
                <PolicyImpactDashboard
                  filters={dashboardFilters}
                  setFilters={setFilters}
                  dimSessions={dimSessions}
                  disabilityMode={disabilityMode}
                />
              </div>
            ) : null}

            {category === "general_overview" ? (
              <div className="mt-6">
                <GeneralOverviewDashboard
                  filters={dashboardFilters}
                  setFilters={setFilters}
                  dimSessions={dimSessions}
                  disabilityMode={disabilityMode}
                />
              </div>
            ) : null}
          </Suspense>
        ) : null}

        {ready && category !== "transition" && category !== "performance" && category !== "basic_secondary" && category !== "policy_impact" && category !== "general_overview" ? (
          <PlaceholderPage
            title={CATEGORY_LABELS[category]}
            sections={PLACEHOLDER_SECTIONS[category as Exclude<CategoryKey, "transition" | "performance" | "basic_secondary" | "general_overview">]}
          />
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Scroll to top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={[
          "fixed bottom-6 right-6 z-[80] inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition-all duration-200",
          "hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2",
          showScrollTop ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        ].join(" ")}
      >
        <ChevronUp className="h-5 w-5" />
      </button>
    </MinisterLayout>
  );
}
