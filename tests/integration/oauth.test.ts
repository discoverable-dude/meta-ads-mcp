// tests/integration/oauth.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runOAuthFlow } from '../../src/auth/oauth.js';

describe('runOAuthFlow', () => {
  it('exchanges code at loopback callback and returns access token', async () => {
    const exchange = vi.fn(async (code: string) => ({ accessToken: 'longlived_' + code, userId: 'u1', expiresIn: 5184000 }));

    const promise = runOAuthFlow({
      appId: 'APP',
      scopes: ['ads_read'],
      exchange,
      onAuthUrl: (url) => {
        const parsed = new URL(url);
        const redirect = parsed.searchParams.get('redirect_uri')!;
        // Simulate FB redirecting back with a code
        fetch(`${redirect}?code=abc123&state=${parsed.searchParams.get('state')}`).catch(() => {});
      },
    });

    const creds = await promise;
    expect(creds.accessToken).toBe('longlived_abc123');
    expect(creds.userId).toBe('u1');
    expect(exchange).toHaveBeenCalledWith('abc123', expect.any(String), expect.stringContaining('http://localhost:'));
  }, 10000);

  it('rejects if state does not match', async () => {
    const promise = runOAuthFlow({
      appId: 'APP',
      scopes: ['ads_read'],
      exchange: async () => ({ accessToken: 't', userId: 'u', expiresIn: 0 }),
      onAuthUrl: (url) => {
        const redirect = new URL(url).searchParams.get('redirect_uri')!;
        fetch(`${redirect}?code=abc&state=wrong`).catch(() => {});
      },
    });
    await expect(promise).rejects.toThrow(/state/i);
  }, 10000);
});
