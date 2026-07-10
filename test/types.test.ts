import { describe, it, expect } from 'vitest';
import { UNRESOLVED } from '../src/shared/types';
describe('shared types', () => {
  it('unresolved statuses are open and in_treatment', () => {
    expect(UNRESOLVED).toEqual(['open', 'in_treatment']);
  });
});
