export interface UsageInfo {
  maxPercent: number;
  bucket: string;
  retryAfterSeconds: number;
}

export function parseBusinessUseCaseUsage(header: string | null): UsageInfo | null {
  if (!header) return null;
  let parsed: Record<string, Array<{
    type: string;
    call_count: number;
    total_cputime: number;
    total_time: number;
    estimated_time_to_regain_access: number;
  }>>;
  try { parsed = JSON.parse(header); } catch { return null; }
  let max = 0, bucket = '', retry = 0;
  for (const entries of Object.values(parsed)) {
    for (const e of entries) {
      const local = Math.max(e.call_count, e.total_cputime, e.total_time);
      if (local > max) { max = local; bucket = e.type; retry = e.estimated_time_to_regain_access; }
    }
  }
  return { maxPercent: max, bucket, retryAfterSeconds: retry };
}
