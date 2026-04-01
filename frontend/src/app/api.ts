// src/app/api.ts

type HttpMethod = "GET";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ||
  "http://127.0.0.1:8000";

function qs(params: Record<string, any>) {
  const sp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function requestJSON<T>(path: string, method: HttpMethod = "GET"): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { method });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${url} -> ${res.status} ${res.statusText} :: ${text}`);
  }
  return (await res.json()) as T;
}

export async function getLatestAvailableYear(): Promise<number> {
  const res = await filtersApi.years();
  const yrs = (res.years ?? []).map(Number).filter(Number.isFinite);
  if (!yrs.length) throw new Error("No years returned");
  return Math.max(...yrs);
}

// -----------------------------------------------------------------------------
// FILTERS (ROOT)
// -----------------------------------------------------------------------------
export const filtersApi = {
  years: () => requestJSON<{ years: number[] }>(`/years`),

  zones: () => requestJSON<{ zones: string[] }>(`/zones`),

  states: (zone?: string) =>
    requestJSON<{ zone: string | null; states: string[] }>(
      `/states${qs({ zone })}`
    ),

  lgas: (p: { state: string; zone?: string }) =>
    requestJSON<{ zone: string | null; state: string; lgas: string[] }>(
      `/lgas${qs(p)}`
    ),

  wards: (p: { state: string; lga: string; zone?: string }) =>
    requestJSON<{ zone: string | null; state: string; lga: string; wards: string[] }>(
      `/wards${qs(p)}`
    ),

  schools: (p: { state: string; lga: string; ward?: string; zone?: string }) =>
    requestJSON<{
      zone: string | null;
      state: string;
      lga: string;
      ward: string | null;
      schools: string[];
    }>(`/schools${qs(p)}`),

  genders: () =>
    requestJSON<{ genders: Array<"Male" | "Female"> }>(`/genders`),

  gapBands: () =>
    requestJSON<{ gap_bands: Array<"1" | "2" | "3-5" | "5+"> }>(
      `/gap-bands`
    ),
};

// -----------------------------------------------------------------------------
// SHARED TYPES
// -----------------------------------------------------------------------------
export type GroupBy = "zone" | "state" | "lga" | "ward";

export type GeoParams = {
  year?: number;
  zone?: string;
  state?: string;
  lga?: string;
  ward?: string;
  school_id?: number;
  gender?: "Male" | "Female";
};

export type OverviewParams = GeoParams & {
  gap_band?: "1" | "2" | "3-5" | "5+";
};

// -----------------------------------------------------------------------------
// OVERVIEW KPIs
// -----------------------------------------------------------------------------
export const overviewApi = {
  cards: (p: OverviewParams) =>
    requestJSON<any>(`/kpis/overview/cards${qs(p)}`),

  medianTransitionTime: (p: { year: number }) =>
    requestJSON<any>(
      `/kpis/overview/median-transition-time${qs(p)}`
    ),

  funnelGrouped: (p: OverviewParams & { group_by: GroupBy }) =>
    requestJSON<any>(
      `/kpis/overview/funnel/grouped${qs(p)}`
    ),

  funnelByGender: (p: OverviewParams) =>
    requestJSON<any>(
      `/kpis/overview/funnel/gender${qs(p)}`
    ),

  bandView: (p: OverviewParams) =>
    requestJSON<any>(
      `/kpis/overview/band-view${qs(p)}`
    ),

  dropoffByGender: (p: OverviewParams) =>
    requestJSON<any>(
      `/kpis/overview/dropoff/gender${qs(p)}`
    ),

  dropoffByLocation: (p: OverviewParams & { group_by: GroupBy }) =>
    requestJSON<any>(
      `/kpis/overview/dropoff/location${qs(p)}`
    ),
};

// -----------------------------------------------------------------------------
// DIRECT (SAME-YEAR) KPIs
// -----------------------------------------------------------------------------
export const directApi = {
  cards: (p: GeoParams) =>
    requestJSON<any>(`/kpis/direct/cards${qs(p)}`),

  funnel: (p: GeoParams) =>
    requestJSON<any>(`/kpis/direct/funnel${qs(p)}`),

  funnelGrouped: (p: GeoParams & { group_by: GroupBy }) =>
    requestJSON<any>(
      `/kpis/direct/funnel/grouped${qs(p)}`
    ),

  funnelByGender: (p: GeoParams) =>
    requestJSON<any>(
      `/kpis/direct/funnel/gender${qs(p)}`
    ),

  waecPassRate: (
    p: GeoParams & { group_by: GroupBy; split_by_gender?: boolean }
  ) =>
    requestJSON<any>(
      `/kpis/direct/waec/pass-rate${qs(p)}`
    ),

  jambPassRate: (
    p: GeoParams & { group_by: GroupBy; split_by_gender?: boolean }
  ) =>
    requestJSON<any>(
      `/kpis/direct/jamb/pass-rate${qs(p)}`
    ),

  admissionRate: (p: GeoParams) =>
    requestJSON<any>(
      `/kpis/direct/admission-rate${qs(p)}`
    ),

  matriculationRate: (p: GeoParams) =>
    requestJSON<any>(
      `/kpis/direct/matriculation-rate${qs(p)}`
    ),

  dropoffByGender: (p: GeoParams) =>
    requestJSON<any>(
      `/kpis/direct/dropoff/gender${qs(p)}`
    ),

  dropoffByLocation: (p: GeoParams & { group_by: GroupBy }) =>
    requestJSON<any>(
      `/kpis/direct/dropoff/location${qs(p)}`
    ),
};