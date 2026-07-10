import { describe, it, expect } from 'vitest';
import { sha256Hex, hashPassword, verifyPassword, checkPasswordPolicy } from '../src/server/lib/crypto';

describe('sha256Hex', () => {
  it('matches NIST vectors', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    // multi-block (>55 bytes) input
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  it('handles multi-byte UTF-8 (2, 3, and 4-byte sequences)', () => {
    // Covers 4-byte (emoji 😀), 2-byte (ã, ã, o from ação), and 3-byte (中) in one input
    expect(sha256Hex('😀ação中')).toBe('85830e55eccd835474923d0253f8613ed8b9195a5395eb5f90231c485a671ac9');
    // CJK characters (3-byte each)
    expect(sha256Hex('中文')).toBe('72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21');
  });
});

describe('hashPassword / verifyPassword', () => {
  it('roundtrips and rejects wrong password', () => {
    const h = hashPassword('Senha123', 'salt1', 1000);
    expect(verifyPassword('Senha123', 'salt1', 1000, h)).toBe(true);
    expect(verifyPassword('Senha124', 'salt1', 1000, h)).toBe(false);
    expect(verifyPassword('Senha123', 'salt2', 1000, h)).toBe(false);
  });
  it('iteration count changes the hash', () => {
    expect(hashPassword('x', 's', 2)).not.toBe(hashPassword('x', 's', 3));
  });
});

describe('checkPasswordPolicy', () => {
  it('enforces min 8, letters and numbers', () => {
    expect(checkPasswordPolicy('Senha123')).toBeNull();
    expect(checkPasswordPolicy('curta1')).toMatch(/8/);
    expect(checkPasswordPolicy('somenteletras')).toMatch(/número/);
    expect(checkPasswordPolicy('12345678')).toMatch(/letra/);
  });
});

describe('timing sanity', () => {
  it('100k iterations under 5000 ms', () => {
    const start = Date.now();
    hashPassword('Senha123', 'salt', 100_000);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
});
