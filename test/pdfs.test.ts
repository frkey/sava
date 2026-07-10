import { describe, it, expect, beforeEach } from 'vitest';
import { fakePorts } from './fakes';
import type { Ctx } from '../src/server/services/ports';
import { saveVisitDepartment, markDone } from '../src/server/services/visits';
import { uploadPdf, downloadPdf } from '../src/server/services/pdfs';

let p: ReturnType<typeof fakePorts>;
const ctx = (role: 'admin' | 'regional' | 'local' = 'regional', cityId?: string): Ctx =>
  ({ ports: p, user: { id: 'u1', name: 'X', login: 'x', role, cityId, mustChangePassword: false } });

let vdId: string;

// Base64 length threshold: base64.length * 3/4 > 10_485_760  =>  length > 10_485_760 * 4/3
function oversizedBase64(): string {
  const overThreshold = Math.ceil((10_485_760 * 4) / 3) + 4;
  return 'a'.repeat(overThreshold);
}

beforeEach(() => {
  p = fakePorts();
  p.repos.cities.insert({ id: 'c1', name: 'Sumaré', active: true });
  p.repos.departments.insert({ id: 'd1', name: 'Informática', active: true });
  p.repos.visits.insert({ id: 'v1', cityId: 'c1', period: '04/2026', mainDate: '2026-04-25', createdAt: '', createdBy: 'u1' });
  const vd = saveVisitDepartment(ctx(), { visitDepartment: { visitId: 'v1', departmentId: 'd1' } });
  vdId = vd.id;
});

describe('uploadPdf', () => {
  it('happy path stores the file under <DepartmentName>.pdf and persists ids on the row', () => {
    const updated = uploadPdf(ctx(), { id: vdId, fileName: 'relatorio.pdf', base64: 'JVBERi0xLjQK' });
    expect(updated.pdfFileId).toBeTruthy();
    expect(updated.pdfUrl).toContain('https://');
    expect(p.repos.visitDepartments.byId(vdId)?.pdfFileId).toBe(updated.pdfFileId);
    const stored = [...p.pdfStore.values()].find(f => f.fileName === 'Informática.pdf');
    expect(stored).toBeTruthy();
    expect(stored?.base64).toBe('JVBERi0xLjQK');
  });

  it('rejects non-pdf filenames', () => {
    expect(() => uploadPdf(ctx(), { id: vdId, fileName: 'scan.jpg', base64: 'JVBERi0xLjQK' }))
      .toThrow(/PDF/);
  });

  it('rejects oversized files', () => {
    expect(() => uploadPdf(ctx(), { id: vdId, fileName: 'relatorio.pdf', base64: oversizedBase64() }))
      .toThrow(/10 MB/);
  });

  it('NOT_FOUND for unknown visit department id', () => {
    expect(() => uploadPdf(ctx(), { id: 'nope', fileName: 'relatorio.pdf', base64: 'JVBERi0xLjQK' }))
      .toThrow(/não encontrado/i);
  });

  it('stays callable after markDone', () => {
    markDone(ctx(), { id: vdId });
    const updated = uploadPdf(ctx(), { id: vdId, fileName: 'relatorio.pdf', base64: 'JVBERi0xLjQK' });
    expect(updated.pdfFileId).toBeTruthy();
    expect(updated.completedAt).toBeTruthy();
  });
});

describe('downloadPdf', () => {
  it('happy path returns exactly {fileName, base64} — nothing else', () => {
    uploadPdf(ctx(), { id: vdId, fileName: 'relatorio.pdf', base64: 'JVBERi0xLjQK' });
    const result = downloadPdf(ctx('local', 'c1'), { visitDepartmentId: vdId });
    expect(Object.keys(result).sort()).toEqual(['base64', 'fileName']);
    expect(result.fileName).toBe('Informática.pdf');
    expect(result.base64).toBe('JVBERi0xLjQK');
  });

  it('forbids local users from downloading another city\'s PDF', () => {
    uploadPdf(ctx(), { id: vdId, fileName: 'relatorio.pdf', base64: 'JVBERi0xLjQK' });
    expect(() => downloadPdf(ctx('local', 'c-other'), { visitDepartmentId: vdId }))
      .toThrow(/restrito/i);
  });

  it('NOT_FOUND when no pdf is attached', () => {
    expect(() => downloadPdf(ctx('local', 'c1'), { visitDepartmentId: vdId }))
      .toThrow(/Nenhum PDF/);
  });

  it('does not audit or lock (pure read)', () => {
    uploadPdf(ctx(), { id: vdId, fileName: 'relatorio.pdf', base64: 'JVBERi0xLjQK' });
    const auditCountBefore = p.auditRows.length;
    downloadPdf(ctx('local', 'c1'), { visitDepartmentId: vdId });
    expect(p.auditRows.length).toBe(auditCountBefore);
  });
});
