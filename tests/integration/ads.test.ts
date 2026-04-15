// tests/integration/ads.test.ts
import { describe, it, expect, vi } from 'vitest';
import { adsTools } from '../../src/tools/ads.js';

function mkCtx() {
  return {
    client: { get: vi.fn(async () => ({ data: [] })), post: vi.fn(async () => ({ id: 'ad1' })), delete: vi.fn() },
    config: { confirmThresholdCents: 3000 },
    creds: { defaultAdAccountId: 'act_1' },
    setDefaultAdAccount: vi.fn(),
  } as any;
}

describe('ads', () => {
  it('list_ads by ad set', async () => {
    const ctx = mkCtx();
    const tool = adsTools.find(t => t.name === 'list_ads')!;
    await tool.handler({ ad_set_id: 'as1' }, ctx);
    expect(ctx.client.get).toHaveBeenCalledWith('/as1/ads', expect.any(Object));
  });
  it('create_ad posts to ad account', async () => {
    const ctx = mkCtx();
    const tool = adsTools.find(t => t.name === 'create_ad')!;
    await tool.handler({ name: 'X', adset_id: 'as1', creative: { creative_id: 'cr1' }, status: 'PAUSED' }, ctx);
    expect(ctx.client.post).toHaveBeenCalledWith('/act_1/ads', expect.objectContaining({ name: 'X', adset_id: 'as1' }));
  });
  it('pause_ad', async () => {
    const ctx = mkCtx();
    const tool = adsTools.find(t => t.name === 'pause_ad')!;
    await tool.handler({ ad_id: 'ad1' }, ctx);
    expect(ctx.client.post).toHaveBeenCalledWith('/ad1', { status: 'PAUSED' });
  });
});
