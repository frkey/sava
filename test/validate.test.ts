import { describe, it, expect } from 'vitest';
import {
  isValidPeriod, periodFolderToken, semesterOf, currentPeriodSemester, isOverdue,
} from '../src/server/lib/validate';

describe('period utils', () => {
  it('validates MM/YYYY', () => {
    expect(isValidPeriod('10/2025')).toBe(true);
    expect(isValidPeriod('04/2026')).toBe(true);
    expect(isValidPeriod('13/2025')).toBe(false);
    expect(isValidPeriod('2025-10')).toBe(false);
    expect(isValidPeriod('4/2026')).toBe(false);
  });
  it('folder token sorts chronologically', () => {
    expect(periodFolderToken('10/2025')).toBe('2025-10');
  });
  it('semester mapping', () => {
    expect(semesterOf('04/2026')).toBe('2026-1');
    expect(semesterOf('10/2025')).toBe('2025-2');
    expect(currentPeriodSemester(new Date('2026-07-09T12:00:00Z'))).toBe('2026-2');
  });
});

describe('isOverdue', () => {
  const base = { status: 'open', deadline: '2026-07-01' } as never;
  it('true when unresolved past deadline', () => {
    expect(isOverdue({ ...base as object, status: 'open', deadline: '2026-07-01' } as never, '2026-07-09')).toBe(true);
  });
  it('false when resolved or no deadline', () => {
    expect(isOverdue({ status: 'resolved', deadline: '2026-07-01' } as never, '2026-07-09')).toBe(false);
    expect(isOverdue({ status: 'open' } as never, '2026-07-09')).toBe(false);
  });
});
