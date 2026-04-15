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
