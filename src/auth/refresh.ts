export interface ExchangeOpts {
  appId: string;
  code: string;
  verifier: string;
  redirectUri: string;
  fetch?: typeof fetch;
}

export interface ExchangeResult {
  accessToken: string;
  userId: string;
  expiresIn: number;
}

const GRAPH = 'https://graph.facebook.com/v21.0';

export async function exchangeCode(opts: ExchangeOpts): Promise<ExchangeResult> {
  const f = opts.fetch ?? fetch;
  const shortUrl = `${GRAPH}/oauth/access_token?client_id=${opts.appId}&redirect_uri=${encodeURIComponent(opts.redirectUri)}&code_verifier=${opts.verifier}&code=${opts.code}`;
  const shortRes = await f(shortUrl);
  if (!shortRes.ok) throw new Error(`Code exchange failed: ${shortRes.status}`);
  const shortJson = await shortRes.json() as { access_token: string };
  const longUrl = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${opts.appId}&fb_exchange_token=${shortJson.access_token}`;
  const longRes = await f(longUrl);
  if (!longRes.ok) throw new Error(`Long-lived exchange failed: ${longRes.status}`);
  const longJson = await longRes.json() as { access_token: string; expires_in: number };
  const meRes = await f(`${GRAPH}/me?access_token=${longJson.access_token}&fields=id`);
  if (!meRes.ok) throw new Error(`me lookup failed: ${meRes.status}`);
  const me = await meRes.json() as { id: string };
  return { accessToken: longJson.access_token, userId: me.id, expiresIn: longJson.expires_in };
}

export interface Creds {
  accessToken: string;
  userId: string;
  expiresAt: string;
  defaultAdAccountId?: string;
}

export async function maybeRefresh(creds: Creds, opts: { appId: string; fetch?: typeof fetch }): Promise<Creds> {
  const msLeft = new Date(creds.expiresAt).getTime() - Date.now();
  const sevenDays = 7 * 24 * 3600 * 1000;
  if (msLeft > sevenDays) return creds;
  const f = opts.fetch ?? fetch;
  const url = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${opts.appId}&fb_exchange_token=${creds.accessToken}`;
  const res = await f(url);
  if (!res.ok) throw Object.assign(new Error('Refresh failed'), { code: 'AUTH_EXPIRED' });
  const j = await res.json() as { access_token: string; expires_in: number };
  return {
    ...creds,
    accessToken: j.access_token,
    expiresAt: new Date(Date.now() + j.expires_in * 1000).toISOString(),
  };
}
