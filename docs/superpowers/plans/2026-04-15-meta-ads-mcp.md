# Meta Ads MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an npm-distributed MCP server (`@yourorg/meta-ads-mcp`) that gives George's team full Meta Ads access from Claude via OAuth PKCE, with a threshold guard preventing accidental spend increases above $30/day.

**Architecture:** TypeScript/Node with the official `@modelcontextprotocol/sdk`. One entry point registers ~30 tools. Tools delegate to a single `GraphClient` that handles fetch/retry/rate-limits/error normalization. OAuth PKCE writes a long-lived token to `~/.meta-ads-mcp/credentials.json`. A dedicated CLI binary handles `auth`/`logout`/`whoami`.

**Tech Stack:** TypeScript, Node 20+, `@modelcontextprotocol/sdk`, `zod`, `vitest`, native `fetch`.

---

## File Structure

```
meta-ads-mcp/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts              # MCP server entry, registers tools
│   ├── cli.ts                # meta-ads-mcp auth|logout|whoami binary
│   ├── config.ts             # env vars, constants
│   ├── auth/
│   │   ├── credentials.ts    # read/write credentials.json
│   │   ├── pkce.ts           # PKCE verifier/challenge generation
│   │   ├── oauth.ts          # loopback OAuth flow
│   │   └── refresh.ts        # long-lived token exchange + refresh logic
│   ├── graph/
│   │   ├── client.ts         # fetch wrapper
│   │   ├── errors.ts         # Meta error → normalized error mapping
│   │   └── rate-limit.ts     # parse X-Business-Use-Case-Usage
│   ├── tools/
│   │   ├── register.ts       # iterate tool modules, register with server
│   │   ├── guard.ts          # threshold guard helper
│   │   ├── schemas.ts        # shared zod schemas (ad_account_id, date_range)
│   │   ├── accounts.ts
│   │   ├── campaigns.ts
│   │   ├── adsets.ts
│   │   ├── ads.ts
│   │   ├── creatives.ts
│   │   ├── audiences.ts
│   │   ├── insights.ts
│   │   └── leads.ts
│   └── logger.ts             # structured JSON logs, redaction
├── tests/
│   ├── unit/
│   └── integration/
├── scripts/
│   └── smoke.ts
└── README.md
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@yourorg/meta-ads-mcp",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "meta-ads-mcp": "dist/cli.js"
  },
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  },
  "engines": { "node": ">=20" },
  "files": ["dist", "README.md"]
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
*.log
.env
```

- [ ] **Step 5: Create placeholder src/index.ts**

```ts
export {};
```

- [ ] **Step 6: Install and verify**

Run: `npm install && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore src/
git commit -m "chore: scaffold project"
```

---

## Task 2: Config module

**Files:**
- Create: `src/config.ts`
- Test: `tests/unit/config.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/unit/config.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  beforeEach(() => {
    delete process.env.META_ADS_MCP_CONFIRM_THRESHOLD;
    delete process.env.META_ADS_MCP_GRAPH_VERSION;
    delete process.env.META_ADS_MCP_LOG_LEVEL;
    delete process.env.META_ADS_MCP_CREDENTIALS_DIR;
  });

  it('returns defaults', () => {
    const c = loadConfig();
    expect(c.confirmThresholdCents).toBe(3000);
    expect(c.graphVersion).toBe('v21.0');
    expect(c.logLevel).toBe('info');
    expect(c.credentialsDir).toMatch(/\.meta-ads-mcp$/);
  });

  it('honors env overrides', () => {
    process.env.META_ADS_MCP_CONFIRM_THRESHOLD = '5000';
    process.env.META_ADS_MCP_GRAPH_VERSION = 'v22.0';
    expect(loadConfig().confirmThresholdCents).toBe(5000);
    expect(loadConfig().graphVersion).toBe('v22.0');
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/unit/config.test.ts`
Expected: FAIL, `loadConfig` not found.

- [ ] **Step 3: Implement src/config.ts**

```ts
import os from 'node:os';
import path from 'node:path';

export interface Config {
  confirmThresholdCents: number;
  graphVersion: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  credentialsDir: string;
  facebookAppId: string;
  oauthScopes: string[];
}

export function loadConfig(): Config {
  return {
    confirmThresholdCents: Number(process.env.META_ADS_MCP_CONFIRM_THRESHOLD ?? 3000),
    graphVersion: process.env.META_ADS_MCP_GRAPH_VERSION ?? 'v21.0',
    logLevel: (process.env.META_ADS_MCP_LOG_LEVEL ?? 'info') as Config['logLevel'],
    credentialsDir: process.env.META_ADS_MCP_CREDENTIALS_DIR ?? path.join(os.homedir(), '.meta-ads-mcp'),
    facebookAppId: process.env.META_ADS_MCP_APP_ID ?? 'REPLACE_WITH_FB_APP_ID',
    oauthScopes: [
      'ads_management',
      'ads_read',
      'business_management',
      'pages_show_list',
      'pages_read_engagement',
      'leads_retrieval',
    ],
  };
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/unit/config.test.ts`
Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/unit/config.test.ts
git commit -m "feat(config): load config with env overrides"
```

---

## Task 3: Credentials storage

**Files:**
- Create: `src/auth/credentials.ts`
- Test: `tests/unit/credentials.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/unit/credentials.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readCredentials, writeCredentials, clearCredentials, type Credentials } from '../../src/auth/credentials.js';

describe('credentials', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'mcp-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns null when no file exists', async () => {
    expect(await readCredentials(dir)).toBeNull();
  });

  it('round-trips credentials and sets 0600 mode', async () => {
    const creds: Credentials = {
      userId: 'u1',
      accessToken: 'tok',
      expiresAt: '2026-06-01T00:00:00Z',
      defaultAdAccountId: 'act_1',
    };
    await writeCredentials(dir, creds);
    expect(await readCredentials(dir)).toEqual(creds);
    const mode = statSync(path.join(dir, 'credentials.json')).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('clearCredentials removes file', async () => {
    await writeCredentials(dir, { userId: 'u', accessToken: 't', expiresAt: 'x' });
    await clearCredentials(dir);
    expect(existsSync(path.join(dir, 'credentials.json'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/unit/credentials.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement src/auth/credentials.ts**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface Credentials {
  userId: string;
  accessToken: string;
  expiresAt: string;
  defaultAdAccountId?: string;
}

const FILE = 'credentials.json';

export async function readCredentials(dir: string): Promise<Credentials | null> {
  try {
    const raw = await fs.readFile(path.join(dir, FILE), 'utf8');
    return JSON.parse(raw) as Credentials;
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeCredentials(dir: string, creds: Credentials): Promise<void> {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const target = path.join(dir, FILE);
  await fs.writeFile(target, JSON.stringify(creds, null, 2), { mode: 0o600 });
  await fs.chmod(target, 0o600);
}

export async function clearCredentials(dir: string): Promise<void> {
  try { await fs.unlink(path.join(dir, FILE)); }
  catch (err: any) { if (err.code !== 'ENOENT') throw err; }
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/unit/credentials.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/auth/credentials.ts tests/unit/credentials.test.ts
git commit -m "feat(auth): credentials file I/O with 0600 perms"
```

---

## Task 4: PKCE helpers

**Files:**
- Create: `src/auth/pkce.ts`
- Test: `tests/unit/pkce.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/unit/pkce.test.ts
import { describe, it, expect } from 'vitest';
import { createPkcePair } from '../../src/auth/pkce.js';
import { createHash } from 'node:crypto';

describe('createPkcePair', () => {
  it('generates a verifier and matching S256 challenge', () => {
    const { verifier, challenge, method } = createPkcePair();
    expect(method).toBe('S256');
    expect(verifier).toMatch(/^[A-Za-z0-9\-_.~]{43,128}$/);
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(expected);
  });

  it('produces different verifiers each call', () => {
    const a = createPkcePair();
    const b = createPkcePair();
    expect(a.verifier).not.toBe(b.verifier);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/unit/pkce.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement src/auth/pkce.ts**

```ts
import { randomBytes, createHash } from 'node:crypto';

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, method: 'S256' };
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/unit/pkce.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/auth/pkce.ts tests/unit/pkce.test.ts
git commit -m "feat(auth): PKCE pair generation"
```

---

## Task 5: OAuth loopback flow

**Files:**
- Create: `src/auth/oauth.ts`
- Test: `tests/integration/oauth.test.ts`

- [ ] **Step 1: Write failing integration test (simulates FB redirect)**

```ts
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
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/integration/oauth.test.ts`

- [ ] **Step 3: Implement src/auth/oauth.ts**

```ts
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { createPkcePair } from './pkce.js';

export interface ExchangeResult {
  accessToken: string;
  userId: string;
  expiresIn: number; // seconds
}

export interface OAuthOptions {
  appId: string;
  scopes: string[];
  exchange: (code: string, verifier: string, redirectUri: string) => Promise<ExchangeResult>;
  onAuthUrl: (url: string) => void;
}

export interface OAuthCredentials {
  accessToken: string;
  userId: string;
  expiresAt: string;
}

export async function runOAuthFlow(opts: OAuthOptions): Promise<OAuthCredentials> {
  const { verifier, challenge, method } = createPkcePair();
  const state = randomBytes(16).toString('base64url');

  return new Promise<OAuthCredentials>((resolve, reject) => {
    let redirectUri = '';
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const returnedState = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Authentication complete.</h2>You can close this window.</body></html>');
      server.close();
      if (error) return reject(new Error(`OAuth error: ${error}`));
      if (returnedState !== state) return reject(new Error('OAuth state mismatch'));
      if (!code) return reject(new Error('OAuth missing code'));
      try {
        const r = await opts.exchange(code, verifier, redirectUri);
        resolve({
          accessToken: r.accessToken,
          userId: r.userId,
          expiresAt: new Date(Date.now() + r.expiresIn * 1000).toISOString(),
        });
      } catch (e) { reject(e as Error); }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      redirectUri = `http://localhost:${port}/callback`;
      const authUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
      authUrl.searchParams.set('client_id', opts.appId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', opts.scopes.join(','));
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', method);
      authUrl.searchParams.set('response_type', 'code');
      opts.onAuthUrl(authUrl.toString());
    });
  });
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/integration/oauth.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/auth/oauth.ts tests/integration/oauth.test.ts
git commit -m "feat(auth): PKCE OAuth loopback flow"
```

---

## Task 6: Token exchange + refresh

**Files:**
- Create: `src/auth/refresh.ts`
- Test: `tests/unit/refresh.test.ts`

- [ ] **Step 1: Write failing test**

```ts
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
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/unit/refresh.test.ts`

- [ ] **Step 3: Implement src/auth/refresh.ts**

```ts
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
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/unit/refresh.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/auth/refresh.ts tests/unit/refresh.test.ts
git commit -m "feat(auth): token exchange and refresh"
```

---

## Task 7: Error normalization

**Files:**
- Create: `src/graph/errors.ts`
- Test: `tests/unit/errors.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/unit/errors.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeGraphError } from '../../src/graph/errors.js';

describe('normalizeGraphError', () => {
  it('maps OAuth expired', () => {
    const e = normalizeGraphError({ error: { code: 190, message: 'expired', type: 'OAuthException' } }, 401);
    expect(e.code).toBe('AUTH_EXPIRED');
  });
  it('maps permission', () => {
    const e = normalizeGraphError({ error: { code: 200, message: 'no perm' } }, 403);
    expect(e.code).toBe('PERMISSION_DENIED');
  });
  it('maps rate limit', () => {
    const e = normalizeGraphError({ error: { code: 17, message: 'too many' } }, 400);
    expect(e.code).toBe('RATE_LIMITED');
  });
  it('maps not found', () => {
    const e = normalizeGraphError({ error: { code: 100, message: 'not found' } }, 404);
    expect(e.code).toBe('NOT_FOUND');
  });
  it('maps invalid param from 400', () => {
    const e = normalizeGraphError({ error: { code: 100, message: 'Invalid parameter', error_subcode: 33 } }, 400);
    expect(e.code).toBe('INVALID_PARAM');
  });
  it('falls through to UPSTREAM_ERROR', () => {
    const e = normalizeGraphError({ error: { code: 999, message: 'wat' } }, 500);
    expect(e.code).toBe('UPSTREAM_ERROR');
    expect(e.cause).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/unit/errors.test.ts`

- [ ] **Step 3: Implement src/graph/errors.ts**

```ts
export type ErrorCode =
  | 'AUTH_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'INVALID_PARAM'
  | 'NOT_FOUND'
  | 'UPSTREAM_ERROR';

export interface NormalizedError {
  code: ErrorCode;
  message: string;
  field?: string;
  detail?: string;
  retry_after_seconds?: number;
  bucket?: string;
  cause?: unknown;
}

export function normalizeGraphError(body: any, status: number): NormalizedError {
  const err = body?.error ?? {};
  const code: number = err.code;
  const msg: string = err.message ?? 'Unknown Meta API error';

  if (err.type === 'OAuthException' || code === 190 || status === 401) {
    return { code: 'AUTH_EXPIRED', message: msg };
  }
  if (code === 200 || code === 10 || status === 403) {
    return { code: 'PERMISSION_DENIED', message: msg };
  }
  if (code === 17 || code === 4 || code === 32 || code === 613) {
    return { code: 'RATE_LIMITED', message: msg };
  }
  if (status === 404) {
    return { code: 'NOT_FOUND', message: msg };
  }
  if (status === 400) {
    return { code: 'INVALID_PARAM', message: msg, detail: err.error_user_msg ?? err.error_subcode?.toString() };
  }
  return { code: 'UPSTREAM_ERROR', message: msg, cause: body };
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/unit/errors.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/graph/errors.ts tests/unit/errors.test.ts
git commit -m "feat(graph): normalize Meta API errors"
```

---

## Task 8: Rate-limit header parsing

**Files:**
- Create: `src/graph/rate-limit.ts`
- Test: `tests/unit/rate-limit.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/unit/rate-limit.test.ts
import { describe, it, expect } from 'vitest';
import { parseBusinessUseCaseUsage } from '../../src/graph/rate-limit.js';

describe('parseBusinessUseCaseUsage', () => {
  it('returns highest usage percent across accounts/buckets', () => {
    const header = JSON.stringify({
      'act_1': [{ type: 'ads_insights', call_count: 30, total_cputime: 50, total_time: 40, estimated_time_to_regain_access: 0 }],
      'act_2': [{ type: 'ads_management', call_count: 85, total_cputime: 10, total_time: 20, estimated_time_to_regain_access: 120 }],
    });
    const out = parseBusinessUseCaseUsage(header)!;
    expect(out.maxPercent).toBe(85);
    expect(out.retryAfterSeconds).toBe(120);
    expect(out.bucket).toBe('ads_management');
  });

  it('returns null on missing header', () => {
    expect(parseBusinessUseCaseUsage(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/unit/rate-limit.test.ts`

- [ ] **Step 3: Implement src/graph/rate-limit.ts**

```ts
export interface UsageInfo {
  maxPercent: number;
  bucket: string;
  retryAfterSeconds: number;
}

export function parseBusinessUseCaseUsage(header: string | null): UsageInfo | null {
  if (!header) return null;
  let parsed: Record<string, Array<{
    type: string;
    call_count: number;
    total_cputime: number;
    total_time: number;
    estimated_time_to_regain_access: number;
  }>>;
  try { parsed = JSON.parse(header); } catch { return null; }
  let max = 0, bucket = '', retry = 0;
  for (const entries of Object.values(parsed)) {
    for (const e of entries) {
      const local = Math.max(e.call_count, e.total_cputime, e.total_time);
      if (local > max) { max = local; bucket = e.type; retry = e.estimated_time_to_regain_access; }
    }
  }
  return { maxPercent: max, bucket, retryAfterSeconds: retry };
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/unit/rate-limit.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/graph/rate-limit.ts tests/unit/rate-limit.test.ts
git commit -m "feat(graph): parse Business Use Case Usage header"
```

---

## Task 9: Graph client

**Files:**
- Create: `src/graph/client.ts`
- Test: `tests/unit/graph-client.test.ts`

- [ ] **Step 1: Write failing test**

```ts
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
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/unit/graph-client.test.ts`

- [ ] **Step 3: Implement src/graph/client.ts**

```ts
import { normalizeGraphError, type NormalizedError } from './errors.js';
import { parseBusinessUseCaseUsage } from './rate-limit.js';

export interface GraphClientOpts {
  accessToken: string;
  graphVersion: string;
  fetch?: typeof fetch;
  retryDelayMs?: number;
}

export class GraphClient {
  constructor(private opts: GraphClientOpts) {}

  private get base() { return `https://graph.facebook.com/${this.opts.graphVersion}`; }
  private get f() { return this.opts.fetch ?? fetch; }

  async get(path: string, params: Record<string, any> = {}): Promise<any> {
    const url = this.buildUrl(path, params);
    return this.request('GET', url);
  }

  async post(path: string, body: Record<string, any> = {}): Promise<any> {
    const url = this.buildUrl(path, { access_token: this.opts.accessToken });
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    return this.request('POST', url, form);
  }

  async delete(path: string): Promise<any> {
    return this.request('DELETE', this.buildUrl(path, {}));
  }

  private buildUrl(path: string, params: Record<string, any>): string {
    const url = new URL(this.base + path);
    url.searchParams.set('access_token', this.opts.accessToken);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    return url.toString();
  }

  private async request(method: string, url: string, body?: BodyInit): Promise<any> {
    const attempt = async () => this.f(url, { method, body });
    let res = await attempt();
    if (res.status >= 500) {
      await new Promise((r) => setTimeout(r, this.opts.retryDelayMs ?? 250));
      res = await attempt();
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: NormalizedError = normalizeGraphError(json, res.status);
      throw err;
    }
    const usage = parseBusinessUseCaseUsage(res.headers.get('x-business-use-case-usage'));
    if (usage && usage.maxPercent > 95) {
      const err: NormalizedError = {
        code: 'RATE_LIMITED',
        message: `Bucket ${usage.bucket} at ${usage.maxPercent}% usage`,
        retry_after_seconds: usage.retryAfterSeconds,
        bucket: usage.bucket,
      };
      throw err;
    }
    if (usage && usage.maxPercent > 80) {
      json.__warning = `Rate bucket ${usage.bucket} at ${usage.maxPercent}%`;
    }
    return json;
  }
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/unit/graph-client.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/graph/client.ts tests/unit/graph-client.test.ts
git commit -m "feat(graph): HTTP client with retry and rate-limit guard"
```

---

## Task 10: Threshold guard

**Files:**
- Create: `src/tools/guard.ts`
- Test: `tests/unit/guard.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/unit/guard.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateGuard } from '../../src/tools/guard.js';

describe('evaluateGuard', () => {
  it('passes when no budget set', () => {
    expect(evaluateGuard({ action: 'pause_campaign', dailyBudgetCents: undefined, confirm: false, thresholdCents: 3000 }).ok).toBe(true);
  });
  it('passes when budget below threshold', () => {
    expect(evaluateGuard({ action: 'update_ad_set', dailyBudgetCents: 2500, confirm: false, thresholdCents: 3000 }).ok).toBe(true);
  });
  it('blocks when above threshold without confirm', () => {
    const r = evaluateGuard({ action: 'update_ad_set', dailyBudgetCents: 5000, confirm: false, thresholdCents: 3000 });
    expect(r.ok).toBe(false);
    expect(r.preview).toMatchObject({ action: 'update_ad_set', changes: { daily_budget: 5000 } });
  });
  it('passes above threshold with confirm', () => {
    expect(evaluateGuard({ action: 'update_ad_set', dailyBudgetCents: 5000, confirm: true, thresholdCents: 3000 }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/unit/guard.test.ts`

- [ ] **Step 3: Implement src/tools/guard.ts**

```ts
export interface GuardInput {
  action: string;
  dailyBudgetCents: number | undefined;
  confirm: boolean;
  thresholdCents: number;
}

export interface GuardResult {
  ok: boolean;
  preview?: {
    requires_confirmation: true;
    action: string;
    changes: Record<string, unknown>;
    reason: string;
  };
}

export function evaluateGuard(i: GuardInput): GuardResult {
  if (i.dailyBudgetCents === undefined) return { ok: true };
  if (i.dailyBudgetCents <= i.thresholdCents) return { ok: true };
  if (i.confirm) return { ok: true };
  return {
    ok: false,
    preview: {
      requires_confirmation: true,
      action: i.action,
      changes: { daily_budget: i.dailyBudgetCents },
      reason: `daily_budget ${i.dailyBudgetCents} cents exceeds threshold ${i.thresholdCents} cents`,
    },
  };
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/unit/guard.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/tools/guard.ts tests/unit/guard.test.ts
git commit -m "feat(tools): threshold guard for spend-raising writes"
```

---

## Task 11: Logger with redaction

**Files:**
- Create: `src/logger.ts`
- Test: `tests/unit/logger.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/unit/logger.test.ts
import { describe, it, expect } from 'vitest';
import { redact } from '../../src/logger.js';

describe('redact', () => {
  it('redacts access_token at any depth', () => {
    expect(redact({ a: { access_token: 'secret', b: 1 } })).toEqual({ a: { access_token: '[REDACTED]', b: 1 } });
  });
  it('redacts accessToken camelCase', () => {
    expect(redact({ accessToken: 'x' })).toEqual({ accessToken: '[REDACTED]' });
  });
  it('leaves other fields intact', () => {
    expect(redact({ name: 'foo', value: 42 })).toEqual({ name: 'foo', value: 42 });
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/unit/logger.test.ts`

- [ ] **Step 3: Implement src/logger.ts**

```ts
const REDACT_KEYS = new Set(['access_token', 'accessToken', 'client_secret', 'fb_exchange_token']);

export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as any;
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      out[k] = REDACT_KEYS.has(k) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

export interface LogEntry {
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  tool?: string;
  durationMs?: number;
  code?: string;
  args?: unknown;
  msg?: string;
}

export function log(entry: LogEntry): void {
  const safe = { ...entry, args: entry.args ? redact(entry.args) : undefined };
  process.stderr.write(JSON.stringify(safe) + '\n');
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/unit/logger.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/logger.ts tests/unit/logger.test.ts
git commit -m "feat(logger): structured logs with token redaction"
```

---

## Task 12: Shared tool schemas

**Files:**
- Create: `src/tools/schemas.ts`

- [ ] **Step 1: Implement shared schemas (no separate test — exercised via tool tests)**

```ts
// src/tools/schemas.ts
import { z } from 'zod';

export const adAccountId = z.string().regex(/^act_\d+$/, 'must look like act_123...').optional();

export const dateRange = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const paginate = z.object({
  limit: z.number().int().positive().max(500).optional(),
  after: z.string().optional(),
});

export const confirmFlag = z.object({ confirm: z.boolean().optional() });
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/schemas.ts
git commit -m "feat(tools): shared zod schemas"
```

---

## Task 13: Tool context + registration helper

**Files:**
- Create: `src/tools/register.ts`

- [ ] **Step 1: Implement tool registration helper**

```ts
// src/tools/register.ts
import { z } from 'zod';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { GraphClient } from '../graph/client.js';
import type { Config } from '../config.js';
import type { Credentials } from '../auth/credentials.js';
import { writeCredentials } from '../auth/credentials.js';
import { maybeRefresh } from '../auth/refresh.js';
import { log } from '../logger.js';

export interface ToolContext {
  client: GraphClient;
  config: Config;
  creds: Credentials;
  setDefaultAdAccount(id: string): Promise<void>;
}

export interface ToolDef<S extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  handler: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

export async function buildContext(config: Config, credsIn: Credentials): Promise<ToolContext> {
  const creds = await maybeRefresh(credsIn, { appId: config.facebookAppId });
  if (creds !== credsIn) await writeCredentials(config.credentialsDir, creds);
  const client = new GraphClient({ accessToken: creds.accessToken, graphVersion: config.graphVersion });
  return {
    client,
    config,
    creds,
    async setDefaultAdAccount(id: string) {
      const updated = { ...creds, defaultAdAccountId: id };
      await writeCredentials(config.credentialsDir, updated);
      creds.defaultAdAccountId = id;
    },
  };
}

export function resolveAdAccount(explicit: string | undefined, creds: Credentials): string {
  const id = explicit ?? creds.defaultAdAccountId;
  if (!id) {
    throw { code: 'INVALID_PARAM', message: 'No ad_account_id provided and no default set. Call set_default_account first.' };
  }
  return id;
}

export function registerTools(server: Server, defs: ToolDef<any>[], getContext: () => Promise<ToolContext>): void {
  for (const def of defs) {
    server.tool(def.name, def.description, def.schema.shape ?? {}, async (args: unknown) => {
      const start = Date.now();
      try {
        const ctx = await getContext();
        const parsed = def.schema.parse(args);
        const result = await def.handler(parsed, ctx);
        log({ ts: new Date().toISOString(), level: 'info', tool: def.name, durationMs: Date.now() - start, args: parsed });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        log({ ts: new Date().toISOString(), level: 'error', tool: def.name, durationMs: Date.now() - start, code: err.code, msg: err.message });
        return { content: [{ type: 'text', text: JSON.stringify({ error: err }, null, 2) }], isError: true };
      }
    });
  }
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/tools/register.ts
git commit -m "feat(tools): context builder and registration helper"
```

---

## Task 14: Account tools (list_ad_accounts, set_default_account, whoami)

**Files:**
- Create: `src/tools/accounts.ts`
- Test: `tests/integration/accounts.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/integration/accounts.test.ts
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
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/integration/accounts.test.ts`

- [ ] **Step 3: Implement src/tools/accounts.ts**

```ts
import { z } from 'zod';
import type { ToolDef } from './register.js';

const listSchema = z.object({});
const setDefaultSchema = z.object({ ad_account_id: z.string().regex(/^act_\d+$/) });
const whoamiSchema = z.object({});

export const accountsTools: ToolDef<any>[] = [
  {
    name: 'list_ad_accounts',
    description: 'List all Meta ad accounts the authenticated user can access.',
    schema: listSchema,
    handler: async (_args, ctx) => {
      const res = await ctx.client.get('/me/adaccounts', { fields: 'id,name,account_status,currency,timezone_name' });
      return { accounts: res.data };
    },
  },
  {
    name: 'set_default_account',
    description: 'Set the default ad account used when tools are called without ad_account_id.',
    schema: setDefaultSchema,
    handler: async (args, ctx) => {
      await ctx.setDefaultAdAccount(args.ad_account_id);
      return { ok: true, defaultAdAccountId: args.ad_account_id };
    },
  },
  {
    name: 'whoami',
    description: 'Return the authenticated user and current default ad account.',
    schema: whoamiSchema,
    handler: async (_args, ctx) => {
      const me = await ctx.client.get('/me', { fields: 'id,name' });
      return { userId: me.id, name: me.name, defaultAdAccountId: ctx.creds.defaultAdAccountId };
    },
  },
];
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/integration/accounts.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/tools/accounts.ts tests/integration/accounts.test.ts
git commit -m "feat(tools): account tools"
```

---

## Task 15: Campaign tools (read + write)

**Files:**
- Create: `src/tools/campaigns.ts`
- Test: `tests/integration/campaigns.test.ts`

- [ ] **Step 1: Write failing test**

```ts
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
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/integration/campaigns.test.ts`

- [ ] **Step 3: Implement src/tools/campaigns.ts**

```ts
import { z } from 'zod';
import type { ToolDef } from './register.js';
import { resolveAdAccount } from './register.js';
import { adAccountId, paginate } from './schemas.js';

const CAMPAIGN_FIELDS = 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,created_time';

const listSchema = z.object({ ad_account_id: adAccountId, status: z.string().optional(), ...paginate.shape });
const getSchema = z.object({ campaign_id: z.string() });
const createSchema = z.object({
  ad_account_id: adAccountId,
  name: z.string(),
  objective: z.string(),
  status: z.enum(['PAUSED', 'ACTIVE']).default('PAUSED'),
  special_ad_categories: z.array(z.string()).default([]),
  daily_budget: z.number().int().positive().optional(),
  lifetime_budget: z.number().int().positive().optional(),
});
const updateSchema = z.object({
  campaign_id: z.string(),
  name: z.string().optional(),
  status: z.enum(['PAUSED', 'ACTIVE', 'ARCHIVED']).optional(),
  daily_budget: z.number().int().positive().optional(),
});
const idSchema = z.object({ campaign_id: z.string() });

export const campaignsTools: ToolDef<any>[] = [
  {
    name: 'list_campaigns',
    description: 'List campaigns in an ad account.',
    schema: listSchema,
    handler: async (a, ctx) => {
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      const res = await ctx.client.get(`/${acct}/campaigns`, {
        fields: CAMPAIGN_FIELDS,
        limit: a.limit ?? 50,
        after: a.after,
        effective_status: a.status ? [a.status] : undefined,
      });
      return res;
    },
  },
  {
    name: 'get_campaign',
    description: 'Get a single campaign by id.',
    schema: getSchema,
    handler: async (a, ctx) => ctx.client.get(`/${a.campaign_id}`, { fields: CAMPAIGN_FIELDS }),
  },
  {
    name: 'create_campaign',
    description: 'Create a campaign. New campaigns with daily_budget above threshold require confirm:true.',
    schema: createSchema.extend({ confirm: z.boolean().optional() }),
    handler: async (a, ctx) => {
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      const { evaluateGuard } = await import('./guard.js');
      const guard = evaluateGuard({ action: 'create_campaign', dailyBudgetCents: a.daily_budget, confirm: !!a.confirm, thresholdCents: ctx.config.confirmThresholdCents });
      if (!guard.ok) return guard.preview;
      return ctx.client.post(`/${acct}/campaigns`, {
        name: a.name,
        objective: a.objective,
        status: a.status,
        special_ad_categories: a.special_ad_categories,
        daily_budget: a.daily_budget,
        lifetime_budget: a.lifetime_budget,
      });
    },
  },
  {
    name: 'update_campaign',
    description: 'Update a campaign. Raising daily_budget above threshold requires confirm:true.',
    schema: updateSchema.extend({ confirm: z.boolean().optional() }),
    handler: async (a, ctx) => {
      const { evaluateGuard } = await import('./guard.js');
      const guard = evaluateGuard({ action: 'update_campaign', dailyBudgetCents: a.daily_budget, confirm: !!a.confirm, thresholdCents: ctx.config.confirmThresholdCents });
      if (!guard.ok) return guard.preview;
      const body: any = {};
      if (a.name) body.name = a.name;
      if (a.status) body.status = a.status;
      if (a.daily_budget) body.daily_budget = a.daily_budget;
      return ctx.client.post(`/${a.campaign_id}`, body);
    },
  },
  {
    name: 'pause_campaign',
    description: 'Pause a campaign (no confirm required).',
    schema: idSchema,
    handler: async (a, ctx) => ctx.client.post(`/${a.campaign_id}`, { status: 'PAUSED' }),
  },
  {
    name: 'resume_campaign',
    description: 'Resume a paused campaign.',
    schema: idSchema,
    handler: async (a, ctx) => ctx.client.post(`/${a.campaign_id}`, { status: 'ACTIVE' }),
  },
];
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/integration/campaigns.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/tools/campaigns.ts tests/integration/campaigns.test.ts
git commit -m "feat(tools): campaign CRUD with threshold guard"
```

---

## Task 16: Ad set tools (read + write)

**Files:**
- Create: `src/tools/adsets.ts`
- Test: `tests/integration/adsets.test.ts`

- [ ] **Step 1: Write failing test**

```ts
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
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/integration/adsets.test.ts`

- [ ] **Step 3: Implement src/tools/adsets.ts**

```ts
import { z } from 'zod';
import type { ToolDef } from './register.js';
import { resolveAdAccount } from './register.js';
import { evaluateGuard } from './guard.js';
import { adAccountId, paginate } from './schemas.js';

const ADSET_FIELDS = 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_amount,targeting,start_time,end_time';

const listSchema = z.object({ campaign_id: z.string().optional(), ad_account_id: adAccountId, ...paginate.shape });
const getSchema = z.object({ ad_set_id: z.string() });
const createSchema = z.object({
  ad_account_id: adAccountId,
  campaign_id: z.string(),
  name: z.string(),
  daily_budget: z.number().int().positive().optional(),
  lifetime_budget: z.number().int().positive().optional(),
  optimization_goal: z.string(),
  billing_event: z.string(),
  bid_amount: z.number().int().positive().optional(),
  targeting: z.record(z.any()),
  status: z.enum(['PAUSED', 'ACTIVE']).default('PAUSED'),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  confirm: z.boolean().optional(),
});
const updateSchema = z.object({
  ad_set_id: z.string(),
  name: z.string().optional(),
  status: z.enum(['PAUSED', 'ACTIVE', 'ARCHIVED']).optional(),
  daily_budget: z.number().int().positive().optional(),
  bid_amount: z.number().int().positive().optional(),
  targeting: z.record(z.any()).optional(),
  confirm: z.boolean().optional(),
});

export const adsetsTools: ToolDef<any>[] = [
  {
    name: 'list_ad_sets',
    description: 'List ad sets. Provide campaign_id (preferred) or ad_account_id.',
    schema: listSchema,
    handler: async (a, ctx) => {
      if (a.campaign_id) {
        return ctx.client.get(`/${a.campaign_id}/adsets`, { fields: ADSET_FIELDS, limit: a.limit ?? 50, after: a.after });
      }
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      return ctx.client.get(`/${acct}/adsets`, { fields: ADSET_FIELDS, limit: a.limit ?? 50, after: a.after });
    },
  },
  {
    name: 'get_ad_set',
    description: 'Get a single ad set.',
    schema: getSchema,
    handler: async (a, ctx) => ctx.client.get(`/${a.ad_set_id}`, { fields: ADSET_FIELDS }),
  },
  {
    name: 'create_ad_set',
    description: 'Create an ad set. Budgets above threshold require confirm:true.',
    schema: createSchema,
    handler: async (a, ctx) => {
      const guard = evaluateGuard({ action: 'create_ad_set', dailyBudgetCents: a.daily_budget, confirm: !!a.confirm, thresholdCents: ctx.config.confirmThresholdCents });
      if (!guard.ok) return guard.preview;
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      const { confirm, ad_account_id, ...body } = a as any;
      return ctx.client.post(`/${acct}/adsets`, body);
    },
  },
  {
    name: 'update_ad_set',
    description: 'Update an ad set. Raising daily_budget above threshold requires confirm:true.',
    schema: updateSchema,
    handler: async (a, ctx) => {
      const guard = evaluateGuard({ action: 'update_ad_set', dailyBudgetCents: a.daily_budget, confirm: !!a.confirm, thresholdCents: ctx.config.confirmThresholdCents });
      if (!guard.ok) return guard.preview;
      const { ad_set_id, confirm, ...body } = a as any;
      return ctx.client.post(`/${ad_set_id}`, body);
    },
  },
];
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/integration/adsets.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/tools/adsets.ts tests/integration/adsets.test.ts
git commit -m "feat(tools): ad set CRUD with threshold guard"
```

---

## Task 17: Ad tools

**Files:**
- Create: `src/tools/ads.ts`
- Test: `tests/integration/ads.test.ts`

- [ ] **Step 1: Write failing test**

```ts
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
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/integration/ads.test.ts`

- [ ] **Step 3: Implement src/tools/ads.ts**

```ts
import { z } from 'zod';
import type { ToolDef } from './register.js';
import { resolveAdAccount } from './register.js';
import { adAccountId, paginate } from './schemas.js';

const AD_FIELDS = 'id,name,adset_id,campaign_id,status,effective_status,creative,created_time';

const listSchema = z.object({
  ad_set_id: z.string().optional(),
  campaign_id: z.string().optional(),
  ad_account_id: adAccountId,
  ...paginate.shape,
});
const getSchema = z.object({ ad_id: z.string() });
const createSchema = z.object({
  ad_account_id: adAccountId,
  name: z.string(),
  adset_id: z.string(),
  creative: z.object({ creative_id: z.string() }),
  status: z.enum(['PAUSED', 'ACTIVE']).default('PAUSED'),
});
const updateSchema = z.object({
  ad_id: z.string(),
  name: z.string().optional(),
  status: z.enum(['PAUSED', 'ACTIVE', 'ARCHIVED']).optional(),
});
const idSchema = z.object({ ad_id: z.string() });

export const adsTools: ToolDef<any>[] = [
  {
    name: 'list_ads',
    description: 'List ads. Provide ad_set_id, campaign_id, or ad_account_id.',
    schema: listSchema,
    handler: async (a, ctx) => {
      if (a.ad_set_id) return ctx.client.get(`/${a.ad_set_id}/ads`, { fields: AD_FIELDS, limit: a.limit ?? 50, after: a.after });
      if (a.campaign_id) return ctx.client.get(`/${a.campaign_id}/ads`, { fields: AD_FIELDS, limit: a.limit ?? 50, after: a.after });
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      return ctx.client.get(`/${acct}/ads`, { fields: AD_FIELDS, limit: a.limit ?? 50, after: a.after });
    },
  },
  {
    name: 'get_ad',
    description: 'Get a single ad by id.',
    schema: getSchema,
    handler: async (a, ctx) => ctx.client.get(`/${a.ad_id}`, { fields: AD_FIELDS }),
  },
  {
    name: 'create_ad',
    description: 'Create an ad by attaching an existing creative to an ad set.',
    schema: createSchema,
    handler: async (a, ctx) => {
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      const { ad_account_id, ...body } = a as any;
      return ctx.client.post(`/${acct}/ads`, body);
    },
  },
  {
    name: 'update_ad',
    description: 'Update an ad.',
    schema: updateSchema,
    handler: async (a, ctx) => {
      const { ad_id, ...body } = a as any;
      return ctx.client.post(`/${ad_id}`, body);
    },
  },
  { name: 'pause_ad', description: 'Pause an ad.', schema: idSchema, handler: async (a, ctx) => ctx.client.post(`/${a.ad_id}`, { status: 'PAUSED' }) },
  { name: 'resume_ad', description: 'Resume an ad.', schema: idSchema, handler: async (a, ctx) => ctx.client.post(`/${a.ad_id}`, { status: 'ACTIVE' }) },
];
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/integration/ads.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/tools/ads.ts tests/integration/ads.test.ts
git commit -m "feat(tools): ad CRUD tools"
```

---

## Task 18: Creative tools (list/get/upload)

**Files:**
- Create: `src/tools/creatives.ts`
- Test: `tests/integration/creatives.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/integration/creatives.test.ts
import { describe, it, expect, vi } from 'vitest';
import { creativesTools } from '../../src/tools/creatives.js';

function mkCtx() {
  return {
    client: { get: vi.fn(async () => ({ data: [{ id: 'cr1' }] })), post: vi.fn(async () => ({ id: 'cr2' })), delete: vi.fn() },
    config: { confirmThresholdCents: 3000 },
    creds: { defaultAdAccountId: 'act_1' },
    setDefaultAdAccount: vi.fn(),
  } as any;
}

describe('creatives', () => {
  it('list_creatives uses default account', async () => {
    const ctx = mkCtx();
    const tool = creativesTools.find(t => t.name === 'list_creatives')!;
    await tool.handler({}, ctx);
    expect(ctx.client.get).toHaveBeenCalledWith('/act_1/adcreatives', expect.any(Object));
  });

  it('upload_creative with image_url posts object_story_spec', async () => {
    const ctx = mkCtx();
    const tool = creativesTools.find(t => t.name === 'upload_creative')!;
    await tool.handler({
      name: 'c',
      page_id: 'p1',
      image_url: 'https://example.com/a.jpg',
      message: 'Hi',
      link: 'https://example.com',
    }, ctx);
    expect(ctx.client.post).toHaveBeenCalledWith('/act_1/adcreatives', expect.objectContaining({
      name: 'c',
      object_story_spec: expect.objectContaining({ page_id: 'p1' }),
    }));
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/integration/creatives.test.ts`

- [ ] **Step 3: Implement src/tools/creatives.ts**

```ts
import { z } from 'zod';
import type { ToolDef } from './register.js';
import { resolveAdAccount } from './register.js';
import { adAccountId, paginate } from './schemas.js';

const CREATIVE_FIELDS = 'id,name,title,body,image_url,thumbnail_url,object_story_spec,status';

const listSchema = z.object({ ad_account_id: adAccountId, ...paginate.shape });
const getSchema = z.object({ creative_id: z.string() });
const uploadSchema = z.object({
  ad_account_id: adAccountId,
  name: z.string(),
  page_id: z.string(),
  image_url: z.string().url(),
  message: z.string(),
  link: z.string().url(),
  link_title: z.string().optional(),
  call_to_action: z.string().optional(),
});

export const creativesTools: ToolDef<any>[] = [
  {
    name: 'list_creatives',
    description: 'List ad creatives in an ad account.',
    schema: listSchema,
    handler: async (a, ctx) => {
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      return ctx.client.get(`/${acct}/adcreatives`, { fields: CREATIVE_FIELDS, limit: a.limit ?? 50, after: a.after });
    },
  },
  {
    name: 'get_creative',
    description: 'Get a single ad creative by id.',
    schema: getSchema,
    handler: async (a, ctx) => ctx.client.get(`/${a.creative_id}`, { fields: CREATIVE_FIELDS }),
  },
  {
    name: 'upload_creative',
    description: 'Create a link-ad creative from an image URL.',
    schema: uploadSchema,
    handler: async (a, ctx) => {
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      return ctx.client.post(`/${acct}/adcreatives`, {
        name: a.name,
        object_story_spec: {
          page_id: a.page_id,
          link_data: {
            link: a.link,
            message: a.message,
            name: a.link_title,
            picture: a.image_url,
            call_to_action: a.call_to_action ? { type: a.call_to_action } : undefined,
          },
        },
      });
    },
  },
];
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/integration/creatives.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/tools/creatives.ts tests/integration/creatives.test.ts
git commit -m "feat(tools): creative list/get/upload"
```

---

## Task 19: Audience tools

**Files:**
- Create: `src/tools/audiences.ts`
- Test: `tests/integration/audiences.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/integration/audiences.test.ts
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
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/integration/audiences.test.ts`

- [ ] **Step 3: Implement src/tools/audiences.ts**

```ts
import { z } from 'zod';
import type { ToolDef } from './register.js';
import { resolveAdAccount } from './register.js';
import { adAccountId, paginate } from './schemas.js';

const AUD_FIELDS = 'id,name,description,subtype,approximate_count_lower_bound,approximate_count_upper_bound,time_created,time_updated';

const listSchema = z.object({ ad_account_id: adAccountId, ...paginate.shape });
const createSchema = z.object({
  ad_account_id: adAccountId,
  name: z.string(),
  subtype: z.enum(['CUSTOM', 'WEBSITE', 'APP', 'LOOKALIKE', 'ENGAGEMENT']),
  description: z.string().optional(),
  rule: z.record(z.any()).optional(),
});
const updateSchema = z.object({
  audience_id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
});

export const audiencesTools: ToolDef<any>[] = [
  {
    name: 'list_audiences',
    description: 'List custom audiences in an ad account.',
    schema: listSchema,
    handler: async (a, ctx) => {
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      return ctx.client.get(`/${acct}/customaudiences`, { fields: AUD_FIELDS, limit: a.limit ?? 50, after: a.after });
    },
  },
  {
    name: 'create_custom_audience',
    description: 'Create a custom audience. Expects subtype and optional targeting rule.',
    schema: createSchema,
    handler: async (a, ctx) => {
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      const { ad_account_id, ...body } = a as any;
      return ctx.client.post(`/${acct}/customaudiences`, body);
    },
  },
  {
    name: 'update_audience',
    description: 'Update an audience name/description.',
    schema: updateSchema,
    handler: async (a, ctx) => {
      const { audience_id, ...body } = a as any;
      return ctx.client.post(`/${audience_id}`, body);
    },
  },
];
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/integration/audiences.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/tools/audiences.ts tests/integration/audiences.test.ts
git commit -m "feat(tools): audience tools"
```

---

## Task 20: Insights tool

**Files:**
- Create: `src/tools/insights.ts`
- Test: `tests/integration/insights.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/integration/insights.test.ts
import { describe, it, expect, vi } from 'vitest';
import { insightsTools } from '../../src/tools/insights.js';

function mkCtx() {
  return {
    client: { get: vi.fn(async () => ({ data: [{ impressions: 1000 }] })), post: vi.fn(), delete: vi.fn() },
    config: { confirmThresholdCents: 3000 },
    creds: { defaultAdAccountId: 'act_1' },
    setDefaultAdAccount: vi.fn(),
  } as any;
}

describe('get_insights', () => {
  it('resolves account level against default', async () => {
    const ctx = mkCtx();
    const tool = insightsTools.find(t => t.name === 'get_insights')!;
    await tool.handler({ level: 'account', date_range: { since: '2026-04-01', until: '2026-04-15' } }, ctx);
    expect(ctx.client.get).toHaveBeenCalledWith('/act_1/insights', expect.objectContaining({
      level: 'account',
      time_range: { since: '2026-04-01', until: '2026-04-15' },
    }));
  });

  it('uses object_id at campaign level', async () => {
    const ctx = mkCtx();
    const tool = insightsTools.find(t => t.name === 'get_insights')!;
    await tool.handler({ level: 'campaign', object_id: 'c1', date_range: { since: '2026-04-01', until: '2026-04-15' }, breakdowns: ['age'] }, ctx);
    expect(ctx.client.get).toHaveBeenCalledWith('/c1/insights', expect.objectContaining({
      level: 'campaign', breakdowns: ['age'],
    }));
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/integration/insights.test.ts`

- [ ] **Step 3: Implement src/tools/insights.ts**

```ts
import { z } from 'zod';
import type { ToolDef } from './register.js';
import { resolveAdAccount } from './register.js';
import { dateRange } from './schemas.js';

const DEFAULT_METRICS = ['impressions', 'reach', 'clicks', 'spend', 'ctr', 'cpc', 'cpm', 'actions', 'action_values'];

const schema = z.object({
  level: z.enum(['account', 'campaign', 'adset', 'ad']),
  object_id: z.string().optional(),
  ad_account_id: z.string().regex(/^act_\d+$/).optional(),
  date_range: dateRange,
  breakdowns: z.array(z.string()).optional(),
  metrics: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(500).optional(),
  after: z.string().optional(),
});

export const insightsTools: ToolDef<any>[] = [
  {
    name: 'get_insights',
    description: 'Fetch performance insights at account/campaign/adset/ad level. Provide object_id for non-account levels (or defaults to account).',
    schema,
    handler: async (a, ctx) => {
      const target = a.level === 'account' ? resolveAdAccount(a.ad_account_id, ctx.creds) : a.object_id;
      if (!target) throw { code: 'INVALID_PARAM', message: 'object_id required for non-account insights' };
      return ctx.client.get(`/${target}/insights`, {
        level: a.level,
        time_range: a.date_range,
        breakdowns: a.breakdowns,
        fields: (a.metrics ?? DEFAULT_METRICS).join(','),
        limit: a.limit ?? 100,
        after: a.after,
      });
    },
  },
];
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/integration/insights.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/tools/insights.ts tests/integration/insights.test.ts
git commit -m "feat(tools): unified insights tool"
```

---

## Task 21: Lead form tools

**Files:**
- Create: `src/tools/leads.ts`
- Test: `tests/integration/leads.test.ts`

- [ ] **Step 1: Write failing test**

```ts
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
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- tests/integration/leads.test.ts`

- [ ] **Step 3: Implement src/tools/leads.ts**

```ts
import { z } from 'zod';
import type { ToolDef } from './register.js';
import { resolveAdAccount } from './register.js';
import { adAccountId, dateRange, paginate } from './schemas.js';

const FORM_FIELDS = 'id,name,status,locale,questions,privacy_policy_url,follow_up_action_url,created_time';
const LEAD_FIELDS = 'id,created_time,ad_id,adset_id,campaign_id,form_id,field_data,platform';

const listFormsSchema = z.object({ ad_account_id: adAccountId, page_id: z.string().optional(), ...paginate.shape });
const getFormSchema = z.object({ form_id: z.string() });
const listLeadsSchema = z.object({ form_id: z.string(), date_range: dateRange.optional(), ...paginate.shape });
const getLeadSchema = z.object({ lead_id: z.string() });
const exportSchema = z.object({ form_id: z.string(), date_range: dateRange });

interface LeadRaw { id: string; created_time: string; ad_id?: string; field_data: Array<{ name: string; values: string[] }> }

function flattenLead(l: LeadRaw): Record<string, string> {
  const out: Record<string, string> = { id: l.id, created_time: l.created_time };
  if (l.ad_id) out.ad_id = l.ad_id;
  for (const f of l.field_data) out[f.name] = f.values.join('; ');
  return out;
}

export const leadsTools: ToolDef<any>[] = [
  {
    name: 'list_lead_forms',
    description: 'List lead generation forms. Provide page_id (preferred) or ad_account_id.',
    schema: listFormsSchema,
    handler: async (a, ctx) => {
      if (a.page_id) return ctx.client.get(`/${a.page_id}/leadgen_forms`, { fields: FORM_FIELDS, limit: a.limit ?? 50, after: a.after });
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      return ctx.client.get(`/${acct}/leadgen_forms`, { fields: FORM_FIELDS, limit: a.limit ?? 50, after: a.after });
    },
  },
  {
    name: 'get_lead_form',
    description: 'Get the full definition of a lead form (questions, privacy policy, etc.).',
    schema: getFormSchema,
    handler: async (a, ctx) => ctx.client.get(`/${a.form_id}`, { fields: FORM_FIELDS }),
  },
  {
    name: 'list_leads',
    description: 'List leads for a form. Optionally filter by date range.',
    schema: listLeadsSchema,
    handler: async (a, ctx) => {
      return ctx.client.get(`/${a.form_id}/leads`, {
        fields: LEAD_FIELDS,
        limit: a.limit ?? 100,
        after: a.after,
        filtering: a.date_range ? [{ field: 'time_created', operator: 'GREATER_THAN', value: Math.floor(new Date(a.date_range.since).getTime() / 1000) }] : undefined,
      });
    },
  },
  {
    name: 'get_lead',
    description: 'Get a single lead including field values.',
    schema: getLeadSchema,
    handler: async (a, ctx) => ctx.client.get(`/${a.lead_id}`, { fields: LEAD_FIELDS }),
  },
  {
    name: 'export_leads',
    description: 'Bulk fetch leads from a form in a date range, returned as flat CSV-ready rows.',
    schema: exportSchema,
    handler: async (a, ctx) => {
      const rows: Record<string, string>[] = [];
      let after: string | undefined;
      const sinceMs = new Date(a.date_range.since).getTime();
      const untilMs = new Date(a.date_range.until).getTime() + 86_400_000;
      for (let page = 0; page < 50; page++) {
        const res = await ctx.client.get(`/${a.form_id}/leads`, { fields: LEAD_FIELDS, limit: 100, after }) as any;
        for (const l of res.data as LeadRaw[]) {
          const t = new Date(l.created_time).getTime();
          if (t >= sinceMs && t <= untilMs) rows.push(flattenLead(l));
        }
        if (!res.paging?.cursors?.after || res.data.length === 0) break;
        after = res.paging.cursors.after;
      }
      return { rows, count: rows.length };
    },
  },
];
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- tests/integration/leads.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/tools/leads.ts tests/integration/leads.test.ts
git commit -m "feat(tools): lead forms and lead retrieval"
```

---

## Task 22: MCP server entry (src/index.ts)

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace placeholder with full entry**

```ts
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { readCredentials } from './auth/credentials.js';
import { buildContext, registerTools, type ToolContext } from './tools/register.js';
import { accountsTools } from './tools/accounts.js';
import { campaignsTools } from './tools/campaigns.js';
import { adsetsTools } from './tools/adsets.js';
import { adsTools } from './tools/ads.js';
import { creativesTools } from './tools/creatives.js';
import { audiencesTools } from './tools/audiences.js';
import { insightsTools } from './tools/insights.js';
import { leadsTools } from './tools/leads.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const server = new Server({ name: 'meta-ads-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });

  const getContext = async (): Promise<ToolContext> => {
    const creds = await readCredentials(config.credentialsDir);
    if (!creds) throw { code: 'AUTH_EXPIRED', message: 'No credentials. Run: meta-ads-mcp auth' };
    return buildContext(config, creds);
  };

  const all = [
    ...accountsTools, ...campaignsTools, ...adsetsTools, ...adsTools,
    ...creativesTools, ...audiencesTools, ...insightsTools, ...leadsTools,
  ];
  registerTools(server, all, getContext);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({ level: 'error', msg: err?.message ?? String(err) }) + '\n');
  process.exit(1);
});
```

- [ ] **Step 2: Build and verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: MCP server entry with all tools registered"
```

---

## Task 23: CLI (`meta-ads-mcp auth | logout | whoami`)

**Files:**
- Create: `src/cli.ts`

- [ ] **Step 1: Implement CLI**

```ts
#!/usr/bin/env node
import { loadConfig } from './config.js';
import { readCredentials, writeCredentials, clearCredentials } from './auth/credentials.js';
import { runOAuthFlow } from './auth/oauth.js';
import { exchangeCode } from './auth/refresh.js';

async function cmdAuth(): Promise<void> {
  const config = loadConfig();
  process.stderr.write('Opening browser for Meta OAuth. If nothing opens, visit the URL below.\n');
  const creds = await runOAuthFlow({
    appId: config.facebookAppId,
    scopes: config.oauthScopes,
    exchange: async (code, verifier, redirectUri) => exchangeCode({ appId: config.facebookAppId, code, verifier, redirectUri }),
    onAuthUrl: (url) => {
      process.stderr.write(`\n${url}\n\n`);
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      import('node:child_process').then(({ spawn }) => spawn(opener, [url], { stdio: 'ignore', detached: true }).unref()).catch(() => {});
    },
  });
  await writeCredentials(config.credentialsDir, {
    userId: creds.userId,
    accessToken: creds.accessToken,
    expiresAt: creds.expiresAt,
  });
  process.stderr.write(`Authenticated as user ${creds.userId}. Token expires ${creds.expiresAt}.\n`);
}

async function cmdLogout(): Promise<void> {
  const config = loadConfig();
  await clearCredentials(config.credentialsDir);
  process.stderr.write('Credentials cleared.\n');
}

async function cmdWhoami(): Promise<void> {
  const config = loadConfig();
  const creds = await readCredentials(config.credentialsDir);
  if (!creds) { process.stderr.write('Not authenticated. Run: meta-ads-mcp auth\n'); process.exit(1); }
  process.stdout.write(JSON.stringify({
    userId: creds.userId,
    expiresAt: creds.expiresAt,
    defaultAdAccountId: creds.defaultAdAccountId ?? null,
  }, null, 2) + '\n');
}

const cmd = process.argv[2];
const run = cmd === 'auth' ? cmdAuth : cmd === 'logout' ? cmdLogout : cmd === 'whoami' ? cmdWhoami : null;
if (!run) {
  process.stderr.write('Usage: meta-ads-mcp <auth|logout|whoami>\n');
  process.exit(1);
}
run().catch((err) => { process.stderr.write(`Error: ${err.message ?? err}\n`); process.exit(1); });
```

- [ ] **Step 2: Build and verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): auth, logout, whoami commands"
```

---

## Task 24: Smoke test script

**Files:**
- Create: `scripts/smoke.ts`

- [ ] **Step 1: Implement smoke test**

```ts
// scripts/smoke.ts
import { loadConfig } from '../src/config.js';
import { readCredentials } from '../src/auth/credentials.js';
import { buildContext } from '../src/tools/register.js';
import { accountsTools } from '../src/tools/accounts.js';
import { campaignsTools } from '../src/tools/campaigns.js';
import { insightsTools } from '../src/tools/insights.js';

async function main() {
  const config = loadConfig();
  const creds = await readCredentials(config.credentialsDir);
  if (!creds) throw new Error('Not authenticated. Run: meta-ads-mcp auth');
  const ctx = await buildContext(config, creds);

  console.log('--- whoami ---');
  console.log(await accountsTools.find(t => t.name === 'whoami')!.handler({}, ctx));

  console.log('--- list_ad_accounts ---');
  console.log(await accountsTools.find(t => t.name === 'list_ad_accounts')!.handler({}, ctx));

  console.log('--- list_campaigns ---');
  console.log(await campaignsTools.find(t => t.name === 'list_campaigns')!.handler({ limit: 5 }, ctx));

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  console.log('--- get_insights (account, last 7d) ---');
  console.log(await insightsTools[0].handler({ level: 'account', date_range: { since: weekAgo, until: today } }, ctx));
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Commit**

```bash
git add scripts/smoke.ts
git commit -m "chore: read-only smoke test script"
```

---

## Task 25: README with team onboarding

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

````markdown
# @yourorg/meta-ads-mcp

Meta Ads MCP server for Claude. Read/write access to campaigns, ad sets, ads, creatives, audiences, insights, and lead forms.

## One-time setup (admin)

1. Create a Facebook App in [Meta for Developers](https://developers.facebook.com).
2. Add products: Marketing API, Facebook Login.
3. Permissions: `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `leads_retrieval`.
4. Add each teammate as a developer or tester until public approval.
5. Enable PKCE and add `http://localhost/*` as a valid OAuth redirect.
6. Share the app ID with your team; set `META_ADS_MCP_APP_ID`.

## Per-teammate setup

**1. Install Claude Code config** — add to `~/.config/claude/claude.json` (or equivalent):

```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "npx",
      "args": ["-y", "@yourorg/meta-ads-mcp"],
      "env": { "META_ADS_MCP_APP_ID": "YOUR_APP_ID" }
    }
  }
}
```

**2. Authenticate** — once, from a terminal:

```bash
META_ADS_MCP_APP_ID=YOUR_APP_ID npx @yourorg/meta-ads-mcp auth
```

**3. Pick a default ad account** — from Claude, ask it to run `list_ad_accounts`, then `set_default_account`.

## Safety

Any write that raises `daily_budget` above $30 (configurable) returns a preview instead of executing. Re-call with `confirm: true` to execute.

```bash
META_ADS_MCP_CONFIRM_THRESHOLD=5000 # raise to $50/day
```

## Commands

- `meta-ads-mcp auth` — OAuth flow
- `meta-ads-mcp logout` — clear credentials
- `meta-ads-mcp whoami` — print current identity

## Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `META_ADS_MCP_APP_ID` | — | Facebook App ID (required) |
| `META_ADS_MCP_CONFIRM_THRESHOLD` | `3000` | Daily budget guard (cents) |
| `META_ADS_MCP_GRAPH_VERSION` | `v21.0` | Graph API version |
| `META_ADS_MCP_LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `META_ADS_MCP_CREDENTIALS_DIR` | `~/.meta-ads-mcp` | Credentials file location |

## Troubleshooting

- **`AUTH_EXPIRED`** — run `meta-ads-mcp auth` again.
- **`PERMISSION_DENIED`** on leads — page owner must grant the app access via Business Manager.
- **`RATE_LIMITED`** — wait `retry_after_seconds`; Meta's per-app bucket is shared across teammates.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with team onboarding"
```

---

## Task 26: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `dist/` populated, no errors.

- [ ] **Step 3: Manual MCP handshake** (optional, requires auth)

Run: `META_ADS_MCP_APP_ID=xxx node dist/cli.js auth` then start a Claude Code session with the config, ask `whoami`.

- [ ] **Step 4: Tag release candidate**

```bash
git tag v0.1.0-rc.1
```
