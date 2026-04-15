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
