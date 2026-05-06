export type DashboardSessionWindowKey =
  | "general_overview"
  | "basic_secondary"
  | "transition"
  | "performance"
  | "policy_impact";

export const GENERAL_OVERVIEW_SESSIONS = [
  "2022/2023",
  "2023/2024",
  "2024/2025",
] as const;

export const BASIC_SECONDARY_SESSIONS = ["2024/2025"] as const;

export const TRANSITION_SESSIONS = [
  "2022/2023",
  "2023/2024",
  "2024/2025",
] as const;

export const PERFORMANCE_SESSIONS = [
  "2022/2023",
  "2023/2024",
  "2024/2025",
] as const;

export const POLICY_IMPACT_SESSIONS = [
  "2022/2023",
  "2023/2024",
  "2024/2025",
] as const;

export const LOAN_TREND_SESSIONS = ["2024/2025"] as const;

export function getDashboardSessionWindow(
  key: DashboardSessionWindowKey,
): readonly string[] {
  switch (key) {
    case "basic_secondary":
      return BASIC_SECONDARY_SESSIONS;
    case "transition":
      return TRANSITION_SESSIONS;
    case "performance":
      return PERFORMANCE_SESSIONS;
    case "policy_impact":
      return POLICY_IMPACT_SESSIONS;
    case "general_overview":
    default:
      return GENERAL_OVERVIEW_SESSIONS;
  }
}

export function filterAllowedSessions(
  values: readonly string[],
  allowedSessions: readonly string[],
): string[] {
  const available = new Set(
    values.map((value) => value.trim()).filter(Boolean),
  );

  return allowedSessions.filter((session) => available.has(session));
}

export function filterRowsBySessionWindow<T extends { session?: unknown }>(
  rows: readonly T[],
  allowedSessions: readonly string[],
): T[] {
  const allowed = new Set(allowedSessions);

  return rows.filter(
    (row) => typeof row.session === "string" && allowed.has(row.session),
  );
}
