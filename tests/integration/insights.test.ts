import { describe, it, expect, vi } from 'vitest';
import { insightsTools } from '../../src/tools/insights.js';

function mkCtx() {
  return {
    client: { get: vi.fn(async () => ({ data: [{ impressions: 1000 }] })), post: vi.fn(), delete: vi.fn() },
    config: { confirmThresholdCents: 3000 },
    creds: { defaultAdAccountId: 'act_1' },
    setDefaultAdAccount: vi.fn(),
  } as any;
}

describe('get_insights', () => {
  it('resolves account level against default', async () => {
    const ctx = mkCtx();
    const tool = insightsTools.find(t => t.name === 'get_insights')!;
    await tool.handler({ level: 'account', date_range: { since: '2026-04-01', until: '2026-04-15' } }, ctx);
    expect(ctx.client.get).toHaveBeenCalledWith('/act_1/insights', expect.objectContaining({
      level: 'account',
      time_range: { since: '2026-04-01', until: '2026-04-15' },
    }));
  });

  it('uses object_id at campaign level', async () => {
    const ctx = mkCtx();
    const tool = insightsTools.find(t => t.name === 'get_insights')!;
    await tool.handler({ level: 'campaign', object_id: 'c1', date_range: { since: '2026-04-01', until: '2026-04-15' }, breakdowns: ['age'] }, ctx);
    expect(ctx.client.get).toHaveBeenCalledWith('/c1/insights', expect.objectContaining({
      level: 'campaign', breakdowns: ['age'],
    }));
  });
});
