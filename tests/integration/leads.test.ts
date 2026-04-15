// tests/integration/leads.test.ts
import { describe, it, expect, vi } from 'vitest';
import { leadsTools } from '../../src/tools/leads.js';

function mkCtx() {
  return {
    client: { get: vi.fn(async () => ({ data: [{ id: 'f1', name: 'Form' }] })), post: vi.fn(), delete: vi.fn() },
    config: { confirmThresholdCents: 3000 },
    creds: { defaultAdAccountId: 'act_1' },
    setDefaultAdAccount: vi.fn(),
  } as any;
}

describe('leads', () => {
  it('list_lead_forms by page', async () => {
    const ctx = mkCtx();
    const tool = leadsTools.find(t => t.name === 'list_lead_forms')!;
    await tool.handler({ page_id: 'p1' }, ctx);
    expect(ctx.client.get).toHaveBeenCalledWith('/p1/leadgen_forms', expect.any(Object));
  });
  it('list_leads by form_id', async () => {
    const ctx = mkCtx();
    const tool = leadsTools.find(t => t.name === 'list_leads')!;
    await tool.handler({ form_id: 'f1' }, ctx);
    expect(ctx.client.get).toHaveBeenCalledWith('/f1/leads', expect.any(Object));
  });
  it('export_leads returns csv-shaped rows', async () => {
    const ctx = mkCtx();
    ctx.client.get = vi.fn(async () => ({
      data: [{ id: 'l1', created_time: 't', field_data: [{ name: 'email', values: ['a@b.com'] }, { name: 'name', values: ['X'] }] }],
    }));
    const tool = leadsTools.find(t => t.name === 'export_leads')!;
    const out = await tool.handler({ form_id: 'f1', date_range: { since: '2026-04-01', until: '2026-04-15' } }, ctx) as any;
    expect(out.rows[0]).toMatchObject({ id: 'l1', email: 'a@b.com', name: 'X' });
  });
});
