import { describe, it, expect } from 'vitest';
import { ownerContextOk } from '../src/server/gas/runtime';

describe('ownerContextOk', () => {
  it('both empty → false', () => {
    expect(ownerContextOk('', '')).toBe(false);
  });
  it('non-empty but differing → false', () => {
    expect(ownerContextOk('a@b.c', 'x@y.z')).toBe(false);
  });
  it('matching non-empty → true', () => {
    expect(ownerContextOk('a@b.c', 'a@b.c')).toBe(true);
  });
  it('empty active, non-empty effective → false', () => {
    expect(ownerContextOk('', 'a@b.c')).toBe(false);
  });
});
