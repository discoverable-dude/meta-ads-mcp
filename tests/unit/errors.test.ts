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
