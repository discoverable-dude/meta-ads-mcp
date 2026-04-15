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
