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
