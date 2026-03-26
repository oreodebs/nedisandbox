/**
 * loadAggregated.ts
 *
 * Serves pre-aggregated gzipped JSON files instead of raw CSVs.
 *
 * DATA TIERS:
 *   1. State-level  → agg_<dataset>_state.json.gz   (~350KB–850KB, loaded once)
 *   2. LGA-level    → agg_<dataset>_lga/<State>.json.gz  (~40–130KB, loaded on demand per state)
 *   3. Raw CSV      → only loaded when drilling to ward/school level
 *
 * WHEN TO REGENERATE JSON FILES:
 *   Run `python3 scripts/aggregate_data.py` after updating any CSV in /public/data/
 */

import { loadCSV } from "./loadCSV";

// ─── In-memory cache (survives re-renders, cleared on page reload) ─────────────
const jsonCache = new Map<string, Promise<unknown[]>>();

const DATA_VERSION =
  (import.meta as { env?: { VITE_DATA_VERSION?: string } }).env?.VITE_DATA_VERSION ?? "v1";

function getDataBase(): string {
  const baseUrl =
    (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  return baseUrl.endsWith("/") ? `${baseUrl}data` : `${baseUrl}/data`;
}

function versionedUrl(path: string): string {
  return `${path}?v=${encodeURIComponent(DATA_VERSION)}`;
}

async function fetchGzJson(url: string): Promise<unknown[]> {
  const res = await fetch(versionedUrl(url), { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);

  // Modern browsers decompress gzip automatically when Content-Encoding is set.
  // Vite/static servers set it for .gz files. Fallback: manual DecompressionStream.
  let data: unknown;
  const contentEncoding = res.headers.get("content-encoding");
  if (contentEncoding?.includes("gzip")) {
    // Server already handles decompression
    data = await res.json();
  } else {
    // Manual decompression (static file server without Content-Encoding: gzip)
    const buffer = await res.arrayBuffer();
    try {
      const ds = new DecompressionStream("gzip");
      const writer = ds.writable.getWriter();
      writer.write(new Uint8Array(buffer));
      writer.close();
      const chunks: Uint8Array[] = [];
      const reader = ds.readable.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
      data = JSON.parse(new TextDecoder().decode(merged));
    } catch {
      // Last resort: maybe the file isn't actually gzipped
      const text = new TextDecoder().decode(buffer);
      data = JSON.parse(text);
    }
  }

  return Array.isArray(data) ? data : [];
}

function loadCached<T>(cacheKey: string, fetcher: () => Promise<T[]>): Promise<T[]> {
  if (!jsonCache.has(cacheKey)) {
    jsonCache.set(cacheKey, fetcher().catch((err) => {
      jsonCache.delete(cacheKey);
      throw err;
    }));
  }
  return jsonCache.get(cacheKey) as Promise<T[]>;
}

// ─── Sanitize state name to match filenames ────────────────────────────────
function stateToFilename(state: string): string {
  return state
    .replace(/\//g, "_")
    .replace(/ /g, "_")
    .replace(/[()]/g, "");
}

// ─── Public API ────────────────────────────────────────────────────────────────

export type AggDataset =
  | "access"
  | "teacher"
  | "transition_direct"
  | "transition_general"
  | "performance"
  | "policy_tertiary"
  | "policy_loans";

/**
 * Load state-level aggregated data (fast, ~350KB–850KB compressed).
 * Use for: national view, KPI cards, zone/state-level charts.
 */
export function loadStateAgg<T>(dataset: AggDataset): Promise<T[]> {
  const base = getDataBase();
  const url = `${base}/agg_${dataset}_state.json.gz`;
  return loadCached<T>(`state:${dataset}`, () => fetchGzJson(url) as Promise<T[]>);
}

/**
 * Load LGA-level aggregated data for a specific state (lazy, ~40–130KB compressed).
 * Use for: state drill-down charts.
 * Returns [] if stateName is empty (no drill active).
 */
export function loadLgaAgg<T>(dataset: AggDataset, stateName: string): Promise<T[]> {
  if (!stateName) return Promise.resolve([]);
  const base = getDataBase();
  const filename = stateToFilename(stateName);
  const url = `${base}/agg_${dataset}_lga/${filename}.json.gz`;
  return loadCached<T>(`lga:${dataset}:${stateName}`, () => fetchGzJson(url) as Promise<T[]>);
}

/**
 * Smart loader: returns state-level data at national/zone view,
 * automatically switches to LGA-level data when a state is selected,
 * and falls back to raw CSV for ward/school drills.
 *
 * This is the main function each dashboard should use.
 */
export async function loadAgg<T>(
  dataset: AggDataset,
  opts: {
    stateName?: string;   // if set, loads LGA agg for that state
    rawCsvPath?: string;  // if set + ward filter active, loads raw CSV
    wardName?: string;    // if set, signals we need raw CSV
  } = {},
): Promise<T[]> {
  const { stateName, rawCsvPath, wardName } = opts;

  // Ward/school drill → need raw CSV
  if (wardName && rawCsvPath) {
    const base = getDataBase();
    try {
      return await loadCSV<T>(`${base}/${rawCsvPath}`);
    } catch {
      return await loadCSV<T>(`/data/${rawCsvPath}`);
    }
  }

  // State selected → load per-state LGA agg
  if (stateName) {
    return loadLgaAgg<T>(dataset, stateName);
  }

  // National/zone view → load state agg
  return loadStateAgg<T>(dataset);
}
