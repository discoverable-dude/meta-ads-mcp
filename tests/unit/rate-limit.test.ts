import { describe, it, expect } from 'vitest';
import { parseBusinessUseCaseUsage } from '../../src/graph/rate-limit.js';

describe('parseBusinessUseCaseUsage', () => {
  it('returns highest usage percent across accounts/buckets', () => {
    const header = JSON.stringify({
      'act_1': [{ type: 'ads_insights', call_count: 30, total_cputime: 50, total_time: 40, estimated_time_to_regain_access: 0 }],
      'act_2': [{ type: 'ads_management', call_count: 85, total_cputime: 10, total_time: 20, estimated_time_to_regain_access: 120 }],
    });
    const out = parseBusinessUseCaseUsage(header)!;
    expect(out.maxPercent).toBe(85);
    expect(out.retryAfterSeconds).toBe(120);
    expect(out.bucket).toBe('ads_management');
  });

  it('returns null on missing header', () => {
    expect(parseBusinessUseCaseUsage(null)).toBeNull();
  });
});
