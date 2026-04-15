import { describe, it, expect, vi } from 'vitest';
import { accountsTools } from '../../src/tools/accounts.js';

function mkCtx(data: any, opts: { getSpy?: any } = {}) {
  const client = { get: opts.getSpy ?? vi.fn(async () => data), post: vi.fn(), delete: vi.fn() } as any;
  return {
    client,
    config: { confirmThresholdCents: 3000, graphVersion: 'v21.0' } as any,
    creds: { userId: 'u1', accessToken: 't', expiresAt: 'x', defaultAdAccountId: 'act_9' } as any,
    setDefaultAdAccount: vi.fn(async () => {}),
  };
}

describe('accounts tools', () => {
  it('list_ad_accounts returns data', async () => {
    const ctx = mkCtx({ data: [{ id: 'act_1', name: 'Acme' }] });
    const tool = accountsTools.find(t => t.name === 'list_ad_accounts')!;
    const out = await tool.handler({}, ctx as any) as any;
    expect(out.accounts).toEqual([{ id: 'act_1', name: 'Acme' }]);
  });

  it('set_default_account persists via ctx', async () => {
    const ctx = mkCtx({});
    const tool = accountsTools.find(t => t.name === 'set_default_account')!;
    await tool.handler({ ad_account_id: 'act_7' }, ctx as any);
    expect(ctx.setDefaultAdAccount).toHaveBeenCalledWith('act_7');
  });

  it('whoami returns user id and default', async () => {
    const ctx = mkCtx({ id: 'u1', name: 'George' });
    const tool = accountsTools.find(t => t.name === 'whoami')!;
    const out = await tool.handler({}, ctx as any) as any;
    expect(out).toMatchObject({ userId: 'u1', defaultAdAccountId: 'act_9' });
  });
});
