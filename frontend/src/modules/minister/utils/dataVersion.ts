const DEFAULT_DATA_VERSION = "v20260507-extracted-dashboard-values";
const DEFAULT_DATA_FETCH_CACHE_MODE: RequestCache = "force-cache";

const VALID_FETCH_CACHE_MODES: RequestCache[] = [
  "default",
  "force-cache",
  "no-cache",
  "no-store",
  "only-if-cached",
  "reload",
];

export function getDataVersion(): string {
  return (import.meta as { env?: { VITE_DATA_VERSION?: string } }).env?.VITE_DATA_VERSION ?? DEFAULT_DATA_VERSION;
}

function resolveDataFetchCacheMode(): RequestCache {
  const configuredMode = (
    import.meta as { env?: { VITE_DATA_FETCH_CACHE_MODE?: string } }
  ).env?.VITE_DATA_FETCH_CACHE_MODE;

  if (
    configuredMode &&
    (VALID_FETCH_CACHE_MODES as string[]).includes(configuredMode)
  ) {
    return configuredMode as RequestCache;
  }

  return DEFAULT_DATA_FETCH_CACHE_MODE;
}

export const DATA_FETCH_CACHE_MODE: RequestCache = resolveDataFetchCacheMode();
