import { describe, it, expect, beforeEach } from 'vitest';
import { fakePorts } from './fakes';
import type { Ctx } from '../src/server/services/ports';
import {
  listCities, saveCity, listChecklistItems, importPaste, saveUser, resetPassword,
} from '../src/server/services/masterdata';

function ctxFor(p: ReturnType<typeof fakePorts>, role: 'admin' | 'regional' | 'local', cityId?: string): Ctx {
  return { ports: p, user: { id: 'u-x', name: 'X', login: 'x', role, cityId, mustChangePassword: false } };
}

describe('cities', () => {
  let p: ReturnType<typeof fakePorts>;
  beforeEach(() => {
    p = fakePorts();
    p.repos.cities.insert({ id: 'c1', name: 'Sumaré', active: true });
    p.repos.cities.insert({ id: 'c2', name: 'Americana', active: true });
  });
  it('local sees only own city', () => {
    expect(listCities(ctxFor(p, 'local', 'c2')).map(c => c.id)).toEqual(['c2']);
    expect(listCities(ctxFor(p, 'regional'))).toHaveLength(2);
  });
  it('save creates with uuid and updates by id', () => {
    const created = saveCity(ctxFor(p, 'admin'), { city: { name: 'Hortolândia' } });
    expect(created.id).toBeTruthy();
    const updated = saveCity(ctxFor(p, 'admin'), { city: { id: created.id, name: 'Hortolândia', active: false } });
    expect(updated.active).toBe(false);
  });
});

describe('checklist import', () => {
  let p: ReturnType<typeof fakePorts>;
  beforeEach(() => {
    p = fakePorts();
    p.repos.departments.insert({ id: 'd1', name: 'Informática', active: true });
    p.repos.checklistItems.insert({ id: 'i1', departmentId: 'd1', itemRef: '4.5', section: 'ROTINAS', text: 'Backup ok?', severity: 'high', active: true });
    p.repos.checklistItems.insert({ id: 'i2', departmentId: 'd1', itemRef: '9.9', section: 'OLD', text: 'Antigo', severity: 'low', active: true });
  });
  const tsv = '4.5\tROTINAS\tBackup ok?\tAlta\n4.6\tROTINAS\tAntivírus ativo?\tAlta\n1.1\tMEMBROS\tResponsável definido?\tmédia\nbroken-line';
  it('preview classifies new/changed/unchanged/invalid and lists absent', () => {
    const prev = importPaste(ctxFor(p, 'admin'), { departmentId: 'd1', tsv });
    const kinds = Object.fromEntries(prev.rows.map(r => [r.itemRef || 'broken-line', r.kind]));
    expect(kinds['4.5']).toBe('unchanged');
    expect(kinds['4.6']).toBe('new');
    expect(kinds['1.1']).toBe('new');
    expect(prev.rows.some(r => r.kind === 'invalid')).toBe(true);
    expect(prev.absent.map(a => a.itemRef)).toEqual(['9.9']);
  });
  it('apply upserts and deactivates only confirmed absents', () => {
    importPaste(ctxFor(p, 'admin'), { departmentId: 'd1', tsv, apply: true, deactivateAbsent: ['i2'] });
    const items = p.repos.checklistItems.rows;
    expect(items.find(i => i.itemRef === '4.6')).toBeTruthy();
    expect(items.find(i => i.id === 'i2')!.active).toBe(false);
  });
  it('changed text upserts in place keeping the id', () => {
    const changed = '4.5\tROTINAS\tBackup diário ok?\tAlta';
    const prev = importPaste(ctxFor(p, 'admin'), { departmentId: 'd1', tsv: changed });
    expect(prev.rows[0]!.kind).toBe('changed');
    importPaste(ctxFor(p, 'admin'), { departmentId: 'd1', tsv: changed, apply: true });
    expect(p.repos.checklistItems.rows.find(i => i.id === 'i1')!.text).toBe('Backup diário ok?');
  });
});

describe('users', () => {
  it('create returns temp password once; login unique case-insensitive; reset clears lock', () => {
    const p = fakePorts();
    const r = saveUser(ctxFor(p, 'admin'), { user: { name: 'Ana', login: 'Ana', role: 'regional' } });
    expect(r.tempPassword).toBeTruthy();
    expect(r.user.mustChangePassword).toBe(true);
    expect(() => saveUser(ctxFor(p, 'admin'), { user: { name: 'Ana2', login: 'ana', role: 'regional' } }))
      .toThrow(/já existe/i);
    expect(() => saveUser(ctxFor(p, 'admin'), { user: { name: 'L', login: 'l1', role: 'local' } }))
      .toThrow(); // local requires cityId
    const row = p.repos.users.rows.find(u => u.login === 'ana')!;
    p.repos.users.update({ ...row, failedAttempts: 5, lockedUntil: '2099-01-01T00:00:00.000Z' });
    const reset = resetPassword(ctxFor(p, 'admin'), { userId: row.id });
    expect(reset.tempPassword).toBeTruthy();
    const after = p.repos.users.byId(row.id)!;
    expect(after.lockedUntil).toBeUndefined();
    expect(after.mustChangePassword).toBe(true);
  });
});

describe('checklistItems.list scope', () => {
  it('regional must pass departmentId; admin may omit', () => {
    const p = fakePorts();
    expect(() => listChecklistItems(ctxFor(p, 'regional'), {})).toThrow();
    expect(listChecklistItems(ctxFor(p, 'admin'), {})).toEqual([]);
  });
});
