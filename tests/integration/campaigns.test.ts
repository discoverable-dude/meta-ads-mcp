// tests/integration/campaigns.test.ts
import { describe, it, expect, vi } from 'vitest';
import { campaignsTools } from '../../src/tools/campaigns.js';

function mkCtx(overrides: any = {}) {
  return {
    client: { get: vi.fn(async () => ({ data: [{ id: 'c1', name: 'C' }] })), post: vi.fn(async () => ({ id: 'c2' })), delete: vi.fn() },
    config: { confirmThresholdCents: 3000 },
    creds: { defaultAdAccountId: 'act_1' },
    setDefaultAdAccount: vi.fn(),
    ...overrides,
  } as any;
}

describe('campaigns', () => {
  it('list_campaigns uses default ad account', async () => {
    const ctx = mkCtx();
    const tool = campaignsTools.find(t => t.name === 'list_campaigns')!;
    await tool.handler({}, ctx);
    expect(ctx.client.get).toHaveBeenCalledWith('/act_1/campaigns', expect.any(Object));
  });

  it('get_campaign fetches by id', async () => {
    const ctx = mkCtx({ client: { get: vi.fn(async () => ({ id: 'c1', name: 'C' })), post: vi.fn(), delete: vi.fn() } });
    const tool = campaignsTools.find(t => t.name === 'get_campaign')!;
    const out = await tool.handler({ campaign_id: 'c1' }, ctx) as any;
    expect(out.id).toBe('c1');
  });

  it('create_campaign posts to ad account', async () => {
    const ctx = mkCtx();
    const tool = campaignsTools.find(t => t.name === 'create_campaign')!;
    await tool.handler({ name: 'New', objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: [] }, ctx);
    expect(ctx.client.post).toHaveBeenCalledWith('/act_1/campaigns', expect.objectContaining({ name: 'New', objective: 'OUTCOME_TRAFFIC' }));
  });

  it('pause_campaign sets status to PAUSED', async () => {
    const ctx = mkCtx();
    const tool = campaignsTools.find(t => t.name === 'pause_campaign')!;
    await tool.handler({ campaign_id: 'c1' }, ctx);
    expect(ctx.client.post).toHaveBeenCalledWith('/c1', { status: 'PAUSED' });
  });
});
