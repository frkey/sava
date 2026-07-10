import type { VisitDepartment } from '../../shared/types';
import { fail } from '../lib/errors';
import { requireString, periodFolderToken } from '../lib/validate';
import type { Ctx } from './ports';
import { audit } from './ports';
import { assertCityScope } from '../api/dispatcher';

const MAX_PDF_BYTES = 10_485_760;

export function uploadPdf(
  ctx: Ctx,
  payload: { id: string; fileName: string; base64: string },
): VisitDepartment {
  const id = requireString(payload.id, 'departamento da visita');
  const fileName = requireString(payload.fileName, 'nome do arquivo');
  const base64 = requireString(payload.base64, 'arquivo');
  if (!/\.pdf$/i.test(fileName)) fail('VALIDATION', 'O arquivo precisa ser um PDF.');
  if ((base64.length * 3) / 4 > MAX_PDF_BYTES) fail('VALIDATION', 'O PDF excede o limite de 10 MB.');

  return ctx.ports.lock(() => {
    const vd = ctx.ports.repos.visitDepartments.byId(id);
    if (!vd) fail('NOT_FOUND', 'Registro de departamento não encontrado.');

    const department = ctx.ports.repos.departments.byId(vd.departmentId);
    const city = ctx.ports.repos.cities.byId(vd.cityId);
    const departmentName = (department?.name ?? vd.departmentId).replace(/\//g, '');
    const cityName = city?.name ?? vd.cityId;
    const storedFileName = `${departmentName}.pdf`;

    const { fileId, url } = ctx.ports.files.savePdf(periodFolderToken(vd.period), cityName, storedFileName, base64);

    const updated: VisitDepartment = { ...vd, pdfFileId: fileId, pdfUrl: url };
    ctx.ports.repos.visitDepartments.update(updated);
    audit(ctx.ports, ctx.user.id, 'visitDepartments.uploadPdf', 'VisitDepartments', updated.id);
    ctx.ports.invalidateCache(['visitDepartments']);
    return updated;
  });
}

export function downloadPdf(
  ctx: Ctx,
  payload: { visitDepartmentId: string },
): { fileName: string; base64: string } {
  const id = requireString(payload.visitDepartmentId, 'departamento da visita');
  const vd = ctx.ports.repos.visitDepartments.byId(id);
  if (!vd) fail('NOT_FOUND', 'Registro não encontrado.');
  assertCityScope(ctx, vd.cityId);
  if (!vd.pdfFileId) fail('NOT_FOUND', 'Nenhum PDF anexado para este departamento.');

  const { fileName, base64 } = ctx.ports.files.readPdf(vd.pdfFileId);
  return { fileName, base64 };
}
