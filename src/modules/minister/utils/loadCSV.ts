import Papa from "papaparse";

const csvPromiseCache = new Map<string, Promise<unknown[]>>();
const DATA_VERSION = (import.meta as { env?: { VITE_DATA_VERSION?: string } }).env?.VITE_DATA_VERSION ?? "v1";

function normalizeKey(url: string): string {
  const [base] = url.split("?");
  const match = base.match(/\/data\/(.+\.csv)$/i);
  return match ? `${match[1]}?v=${DATA_VERSION}` : `${base}?v=${DATA_VERSION}`;
}

function withVersion(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(DATA_VERSION)}`;
}

async function fetchCsvText(url: string): Promise<string> {
  const finalUrl = withVersion(url);
  const res = await fetch(finalUrl, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${finalUrl}: ${res.status}`);
  }
  return await res.text();
}

export async function loadCSV<T = unknown>(url: string): Promise<T[]> {
  const cacheKey = normalizeKey(url);

  if (!csvPromiseCache.has(cacheKey)) {
    const promise = fetchCsvText(url).then(
      (text) =>
        new Promise<unknown[]>((resolve, reject) => {
          Papa.parse<T>(text, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            worker: true,
            complete: (result) => resolve((result.data ?? []).filter(Boolean) as unknown[]),
            error: (error: Error) => reject(error),
          });
        }),
    );

    csvPromiseCache.set(cacheKey, promise);
  }

  try {
    return (await csvPromiseCache.get(cacheKey)) as T[];
  } catch (error) {
    csvPromiseCache.delete(cacheKey);
    throw error;
  }
}


export async function loadCSVMany<T = unknown>(urls: string[], concurrency = 2): Promise<T[]> {
  const datasets: T[][] = [];

  for (let index = 0; index < urls.length; index += concurrency) {
    const batch = urls.slice(index, index + concurrency);
    const batchRows = await Promise.all(batch.map((url) => loadCSV<T>(url)));
    datasets.push(...batchRows);

    if (index + concurrency < urls.length) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    }
  }

  return datasets.flat();
}

export const ACCESS_COVERAGE_WARD_FILES = [
  "fact_access_coverage_ward.part01.csv",
  "fact_access_coverage_ward.part02.csv",
  "fact_access_coverage_ward.part03.csv",
  "fact_access_coverage_ward.part04.csv",
  "fact_access_coverage_ward.part05.csv",
  "fact_access_coverage_ward.part06.csv",
  "fact_access_coverage_ward.part07.csv",
  "fact_access_coverage_ward.part08.csv",
  "fact_access_coverage_ward.part09.csv",
  "fact_access_coverage_ward.part10.csv",
  "fact_access_coverage_ward.part11.csv",
  "fact_access_coverage_ward.part12.csv",
  "fact_access_coverage_ward.part13.csv",
  "fact_access_coverage_ward.part14.csv",
] as const;

export const PERFORMANCE_SCHOOL_FILES = [
  "fact_performance_school.part01.csv",
  "fact_performance_school.part02.csv",
  "fact_performance_school.part03.csv",
  "fact_performance_school.part04.csv",
  "fact_performance_school.part05.csv",
  "fact_performance_school.part06.csv",
] as const;

export const TEACHER_CAPACITY_SCHOOL_FILES = [
  "fact_teacher_capacity_school.part01.csv",
  "fact_teacher_capacity_school.part02.csv",
  "fact_teacher_capacity_school.part03.csv",
  "fact_teacher_capacity_school.part04.csv",
] as const;

export const TRANSITION_GENERAL_FILES = [
  "fact_transition_general.part01.csv",
  "fact_transition_general.part02.csv",
  "fact_transition_general.part03.csv",
  "fact_transition_general.part04.csv",
  "fact_transition_general.part05.csv",
] as const;

export const TRANSITION_DIRECT_FILES = [
  "fact_transition_direct.part01.csv",
  "fact_transition_direct.part02.csv",
] as const;
