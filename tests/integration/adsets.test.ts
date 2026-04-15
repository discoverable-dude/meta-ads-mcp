// tests/integration/adsets.test.ts
import { describe, it, expect, vi } from 'vitest';
import { adsetsTools } from '../../src/tools/adsets.js';

function mkCtx() {
  return {
    client: { get: vi.fn(async () => ({ data: [] })), post: vi.fn(async () => ({ id: 'as1' })), delete: vi.fn() },
    config: { confirmThresholdCents: 3000 },
    creds: { defaultAdAccountId: 'act_1' },
    setDefaultAdAccount: vi.fn(),
  } as any;
}

describe('adsets', () => {
  it('list_ad_sets by campaign id', async () => {
    const ctx = mkCtx();
    const tool = adsetsTools.find(t => t.name === 'list_ad_sets')!;
    await tool.handler({ campaign_id: 'c1' }, ctx);
    expect(ctx.client.get).toHaveBeenCalledWith('/c1/adsets', expect.any(Object));
  });

  it('update_ad_set above threshold without confirm returns preview', async () => {
    const ctx = mkCtx();
    const tool = adsetsTools.find(t => t.name === 'update_ad_set')!;
    const out = await tool.handler({ ad_set_id: 'as1', daily_budget: 5000 }, ctx) as any;
    expect(out.requires_confirmation).toBe(true);
    expect(ctx.client.post).not.toHaveBeenCalled();
  });

  it('update_ad_set above threshold WITH confirm executes', async () => {
    const ctx = mkCtx();
    const tool = adsetsTools.find(t => t.name === 'update_ad_set')!;
    await tool.handler({ ad_set_id: 'as1', daily_budget: 5000, confirm: true }, ctx);
    expect(ctx.client.post).toHaveBeenCalledWith('/as1', expect.objectContaining({ daily_budget: 5000 }));
  });
});
