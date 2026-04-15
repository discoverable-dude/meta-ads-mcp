// tests/unit/refresh.test.ts
import { describe, it, expect, vi } from 'vitest';
import { exchangeCode, maybeRefresh } from '../../src/auth/refresh.js';

describe('exchangeCode', () => {
  it('calls graph endpoint and returns parsed result', async () => {
    const fetchFn = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ access_token: 'short', token_type: 'bearer' }),
    })) as any;
    const fetchLong = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: 'long', expires_in: 5184000 }),
    })) as any;
    const me = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'u1' }) })) as any;

    const result = await exchangeCode({
      appId: 'APP', code: 'CODE', verifier: 'V', redirectUri: 'R',
      fetch: ((url: string) => url.includes('me') ? me() : url.includes('fb_exchange_token') ? fetchLong() : fetchFn(url)) as any,
    });
    expect(result.accessToken).toBe('long');
    expect(result.userId).toBe('u1');
    expect(result.expiresIn).toBe(5184000);
  });
});

describe('maybeRefresh', () => {
  it('refreshes when <7 days from expiry', async () => {
    const soon = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ access_token: 'new', expires_in: 5184000 }) })) as any;
    const out = await maybeRefresh({ accessToken: 'old', userId: 'u', expiresAt: soon }, { appId: 'APP', fetch: fetchFn });
    expect(out.accessToken).toBe('new');
    expect(fetchFn).toHaveBeenCalled();
  });

  it('does not refresh when >7 days remaining', async () => {
    const far = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const fetchFn = vi.fn();
    const out = await maybeRefresh({ accessToken: 'keep', userId: 'u', expiresAt: far }, { appId: 'APP', fetch: fetchFn as any });
    expect(out.accessToken).toBe('keep');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
