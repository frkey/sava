import { describe, it, expect } from 'vitest';
import { rowToObject, objectToRow, escapeCell, SHEET_COLUMNS } from '../src/server/repositories/mapping';

describe('mapping', () => {
  const headers = ['id', 'name', 'active', 'countYes'];
  it('row → object with type coercion', () => {
    expect(rowToObject(headers, ['1', 'Nova Odessa', 'TRUE', 12]))
      .toEqual({ id: '1', name: 'Nova Odessa', active: true, countYes: 12 });
  });
  it('empty cells become undefined and are stripped', () => {
    expect(rowToObject(headers, ['1', '', 'FALSE', '']))
      .toEqual({ id: '1', active: false });
  });
  it('object → row aligns to headers and escapes formulas', () => {
    expect(objectToRow(headers, { id: '1', name: '=HYPERLINK("x")', active: true }))
      .toEqual(['1', `'=HYPERLINK("x")`, 'TRUE', '']);
  });
  it('escapeCell only touches leading =', () => {
    expect(escapeCell('=1+1')).toBe(`'=1+1`);
    expect(escapeCell('a=b')).toBe('a=b');
    expect(escapeCell(5)).toBe(5);
  });
  it('canonical columns include every tab', () => {
    expect(Object.keys(SHEET_COLUMNS).sort()).toEqual([
      'AuditLog', 'ChecklistItems', 'Cities', 'Departments', 'FindingReviews',
      'Findings', 'Sessions', 'Users', 'VisitDepartments', 'Visits',
    ]);
    expect(SHEET_COLUMNS['Findings']).toContain('code');
  });
});
