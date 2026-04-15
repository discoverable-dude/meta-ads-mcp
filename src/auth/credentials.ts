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
