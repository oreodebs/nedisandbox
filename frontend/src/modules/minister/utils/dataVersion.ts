const DEFAULT_DATA_VERSION = "v20260329";

export function getDataVersion(): string {
  return (import.meta as { env?: { VITE_DATA_VERSION?: string } }).env?.VITE_DATA_VERSION ?? DEFAULT_DATA_VERSION;
}

export const DATA_FETCH_CACHE_MODE: RequestCache = "no-store";
