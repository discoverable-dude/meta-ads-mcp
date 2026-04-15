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
