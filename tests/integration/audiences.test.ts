import { describe, it, expect, vi } from 'vitest';
import { audiencesTools } from '../../src/tools/audiences.js';

function mkCtx() {
  return {
    client: { get: vi.fn(async () => ({ data: [] })), post: vi.fn(async () => ({ id: 'aud1' })), delete: vi.fn() },
    config: { confirmThresholdCents: 3000 },
    creds: { defaultAdAccountId: 'act_1' },
    setDefaultAdAccount: vi.fn(),
  } as any;
}

describe('audiences', () => {
  it('list_audiences uses default', async () => {
    const ctx = mkCtx();
    const tool = audiencesTools.find(t => t.name === 'list_audiences')!;
    await tool.handler({}, ctx);
    expect(ctx.client.get).toHaveBeenCalledWith('/act_1/customaudiences', expect.any(Object));
  });
  it('create_custom_audience posts subtype', async () => {
    const ctx = mkCtx();
    const tool = audiencesTools.find(t => t.name === 'create_custom_audience')!;
    await tool.handler({ name: 'A', subtype: 'CUSTOM', description: 'd' }, ctx);
    expect(ctx.client.post).toHaveBeenCalledWith('/act_1/customaudiences', expect.objectContaining({ name: 'A', subtype: 'CUSTOM' }));
  });
});
