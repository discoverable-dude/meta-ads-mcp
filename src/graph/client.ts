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
