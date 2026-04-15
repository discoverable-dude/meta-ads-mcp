// tests/unit/graph-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { GraphClient } from '../../src/graph/client.js';

function mkRes(status: number, body: any, headers: Record<string, string> = {}): any {
  return { ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } };
}

describe('GraphClient', () => {
  it('performs GET with access token and returns json', async () => {
    const fetchFn = vi.fn(async () => mkRes(200, { data: [{ id: '1' }] }));
    const client = new GraphClient({ accessToken: 'TOK', graphVersion: 'v21.0', fetch: fetchFn as any });
    const out = await client.get('/me/adaccounts', { fields: 'id,name' });
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('access_token=TOK'), expect.any(Object));
    expect(fetchFn.mock.calls[0][0]).toContain('fields=id%2Cname');
    expect(out).toEqual({ data: [{ id: '1' }] });
  });

  it('retries once on 5xx then succeeds', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(mkRes(503, { error: { code: 1, message: 'boom' } }))
      .mockResolvedValueOnce(mkRes(200, { ok: true }));
    const client = new GraphClient({ accessToken: 'T', graphVersion: 'v21.0', fetch: fetchFn as any, retryDelayMs: 1 });
    const out = await client.get('/x');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ ok: true });
  });

  it('throws normalized error on 401', async () => {
    const fetchFn = vi.fn(async () => mkRes(401, { error: { code: 190, type: 'OAuthException', message: 'expired' } }));
    const client = new GraphClient({ accessToken: 'T', graphVersion: 'v21.0', fetch: fetchFn as any });
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'AUTH_EXPIRED' });
  });

  it('throws RATE_LIMITED with retry_after when usage >95%', async () => {
    const fetchFn = vi.fn(async () => mkRes(200, { data: [] }, {
      'x-business-use-case-usage': JSON.stringify({ act_1: [{ type: 'ads_insights', call_count: 99, total_cputime: 10, total_time: 10, estimated_time_to_regain_access: 60 }] }),
    }));
    const client = new GraphClient({ accessToken: 'T', graphVersion: 'v21.0', fetch: fetchFn as any });
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'RATE_LIMITED', retry_after_seconds: 60 });
  });
});
