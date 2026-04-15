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
