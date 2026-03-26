import { loadStateAgg, type AggDataset } from './loadAggregated';

function normalizeDataset(dataset: string): AggDataset {
  switch (dataset) {
    case 'policy_impact':
      return 'policy_tertiary';
    case 'policy_loans':
      return 'policy_loans';
    case 'access':
    case 'teacher':
    case 'transition_direct':
    case 'transition_general':
    case 'performance':
    case 'policy_tertiary':
      return dataset;
    default:
      throw new Error(`Unsupported aggregated dataset: ${dataset}`);
  }
}

export function getDataBaseUrl(): string {
  const baseUrl = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return baseUrl.endsWith('/') ? `${baseUrl}data` : `${baseUrl}/data`;
}

export async function tryLoadMultiSessionAggRows<T>(dataset: string, sessions?: string[]): Promise<T[]> {
  const rows = await loadStateAgg<T>(normalizeDataset(dataset));
  if (!sessions || sessions.length === 0) return rows;
  const allowed = new Set(sessions);
  return rows.filter((row) => {
    const value = (row as { session?: unknown }).session;
    return typeof value === 'string' ? allowed.has(value) : true;
  });
}

export { loadStateAgg } from './loadAggregated';
