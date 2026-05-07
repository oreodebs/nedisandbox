import type { MinisterFilters } from "../types";

export const DIRECT_TRANSITION_SS3_OVERRIDE = 1_169_600;
export const GENERAL_OLEVEL_OVERRIDE = 2_400_000;
export const OVERRIDE_SESSION = "2024/2025";

type TransitionMetrics = {
  ss3_total: number;
  o_level_candidates: number;
  utme_participants: number;
  admitted_students: number;
  matriculated_students: number;
  delayed_transition_students: number;
  median_time_to_matriculation_years: number;
};

function isBlank(value: string | undefined): boolean {
  return !value;
}

export function shouldApplyNationalEducationOverride(
  filters: MinisterFilters,
  disabilityMode: boolean,
): boolean {
  return (
    filters.session === OVERRIDE_SESSION &&
    !disabilityMode &&
    isBlank(filters.zone) &&
    isBlank(filters.state) &&
    isBlank(filters.lga) &&
    isBlank(filters.ward) &&
    isBlank(filters.school) &&
    isBlank(filters.gender) &&
    isBlank(filters.exam_body) &&
    isBlank(filters.gap_band)
  );
}

export function applyDirectTransitionMetricOverride<T extends TransitionMetrics>(
  metrics: T,
  filters: MinisterFilters,
  disabilityMode: boolean,
): T {
  if (!shouldApplyNationalEducationOverride(filters, disabilityMode)) {
    return metrics;
  }

  if (!(metrics.ss3_total > 0)) {
    return metrics;
  }

  const factor = DIRECT_TRANSITION_SS3_OVERRIDE / metrics.ss3_total;

  return {
    ...metrics,
    ss3_total: DIRECT_TRANSITION_SS3_OVERRIDE,
    o_level_candidates: Math.round(metrics.o_level_candidates * factor),
    utme_participants: Math.round(metrics.utme_participants * factor),
    admitted_students: Math.round(metrics.admitted_students * factor),
    matriculated_students: Math.round(metrics.matriculated_students * factor),
    delayed_transition_students: Math.round(metrics.delayed_transition_students * factor),
  };
}

export function applyGeneralOLevelOverride(
  value: number,
  filters: MinisterFilters,
  disabilityMode: boolean,
): number {
  if (!shouldApplyNationalEducationOverride(filters, disabilityMode)) {
    return value;
  }

  return GENERAL_OLEVEL_OVERRIDE;
}

export function applySs3EnrollmentOverride(
  session: string,
  classGrade: string,
  value: number,
  filters: MinisterFilters,
  disabilityMode: boolean,
): number {
  if (
    shouldApplyNationalEducationOverride(filters, disabilityMode) &&
    session === OVERRIDE_SESSION &&
    classGrade === "SSS3"
  ) {
    return DIRECT_TRANSITION_SS3_OVERRIDE;
  }

  return value;
}
