import type { City, ChecklistItem, Department, SessionUser, Severity } from '../../shared/types';
import type { ImportPreview, ImportPreviewRow } from '../../shared/actions';
import { fail } from '../lib/errors';
import { requireString, requireEnum, optionalString } from '../lib/validate';
import type { Ctx } from './ports';
import { audit } from './ports';
import { applyNewPassword, generateTempPassword, toSessionUser } from './auth';
import type { UserRow } from './ports';

const SEVERITY_MAP: Record<string, Severity> = {
  alta: 'high', high: 'high', 'média': 'medium', media: 'medium', medium: 'medium',
  baixa: 'low', low: 'low',
};

export function listCities(ctx: Ctx): City[] {
  const all = ctx.ports.repos.cities.all().sort((a, b) => a.name.localeCompare(b.name));
  return ctx.user.role === 'local' ? all.filter(c => c.id === ctx.user.cityId) : all;
}
export function saveCity(ctx: Ctx, payload: { city: Partial<City> & { name: string } }): City {
  const name = requireString(payload.city.name, 'nome');
  return ctx.ports.lock(() => {
    if (payload.city.id) {
      const existing = ctx.ports.repos.cities.byId(payload.city.id);
      if (!existing) fail('NOT_FOUND', 'Cidade não encontrada.');
      const updated: City = { ...existing, name, active: payload.city.active ?? existing.active };
      ctx.ports.repos.cities.update(updated);
      audit(ctx.ports, ctx.user.id, 'cities.save', 'Cities', updated.id);
      ctx.ports.invalidateCache(['cities']);
      return updated;
    }
    const created: City = { id: ctx.ports.uuid(), name, active: payload.city.active ?? true };
    ctx.ports.repos.cities.insert(created);
    audit(ctx.ports, ctx.user.id, 'cities.save', 'Cities', created.id);
    ctx.ports.invalidateCache(['cities']);
    return created;
  });
}

export function listDepartments(ctx: Ctx): Department[] {
  return ctx.ports.repos.departments.all().sort((a, b) => a.name.localeCompare(b.name));
}
export function saveDepartment(ctx: Ctx, payload: { department: Partial<Department> & { name: string } }): Department {
  const name = requireString(payload.department.name, 'nome');
  return ctx.ports.lock(() => {
    if (payload.department.id) {
      const existing = ctx.ports.repos.departments.byId(payload.department.id);
      if (!existing) fail('NOT_FOUND', 'Departamento não encontrado.');
      const updated: Department = { ...existing, name, active: payload.department.active ?? existing.active };
      ctx.ports.repos.departments.update(updated);
      audit(ctx.ports, ctx.user.id, 'departments.save', 'Departments', updated.id);
      ctx.ports.invalidateCache(['departments']);
      return updated;
    }
    const created: Department = { id: ctx.ports.uuid(), name, active: payload.department.active ?? true };
    ctx.ports.repos.departments.insert(created);
    audit(ctx.ports, ctx.user.id, 'departments.save', 'Departments', created.id);
    ctx.ports.invalidateCache(['departments']);
    return created;
  });
}

export function listChecklistItems(ctx: Ctx, payload: { departmentId?: string }): ChecklistItem[] {
  if (!payload.departmentId && ctx.user.role !== 'admin')
    fail('VALIDATION', 'Informe o departamento.');
  const all = ctx.ports.repos.checklistItems.all();
  return payload.departmentId ? all.filter(i => i.departmentId === payload.departmentId) : all;
}

export function saveChecklistItem(ctx: Ctx, payload: { item: Partial<ChecklistItem> & { departmentId: string } }): ChecklistItem {
  const departmentId = requireString(payload.item.departmentId, 'departamento');
  const itemRef = requireString(payload.item.itemRef, 'referência');
  const section = requireString(payload.item.section, 'seção');
  const text = requireString(payload.item.text, 'texto');
  const severity = requireEnum(payload.item.severity, 'severidade', ['high', 'medium', 'low'] as const);
  return ctx.ports.lock(() => {
    const department = ctx.ports.repos.departments.byId(departmentId);
    if (!department) fail('NOT_FOUND', 'Departamento não encontrado.');
    const clash = ctx.ports.repos.checklistItems.all()
      .find(i => i.departmentId === departmentId && i.itemRef === itemRef && i.active && i.id !== payload.item.id);
    if (clash) fail('CONFLICT', 'Já existe um item ativo com esta referência neste departamento.');
    if (payload.item.id) {
      const existing = ctx.ports.repos.checklistItems.byId(payload.item.id);
      if (!existing) fail('NOT_FOUND', 'Item não encontrado.');
      const updated: ChecklistItem = {
        ...existing, departmentId, itemRef, section, text, severity,
        active: payload.item.active ?? existing.active,
      };
      ctx.ports.repos.checklistItems.update(updated);
      audit(ctx.ports, ctx.user.id, 'checklistItems.save', 'ChecklistItems', updated.id);
      ctx.ports.invalidateCache(['checklistItems']);
      return updated;
    }
    const created: ChecklistItem = {
      id: ctx.ports.uuid(), departmentId, itemRef, section, text, severity,
      active: payload.item.active ?? true,
    };
    ctx.ports.repos.checklistItems.insert(created);
    audit(ctx.ports, ctx.user.id, 'checklistItems.save', 'ChecklistItems', created.id);
    ctx.ports.invalidateCache(['checklistItems']);
    return created;
  });
}

function parseTsv(departmentId: string, tsv: string, existing: ChecklistItem[]): { rows: ImportPreviewRow[]; parsed: Map<string, Omit<ChecklistItem, 'id' | 'active'>> } {
  const rows: ImportPreviewRow[] = [];
  const parsed = new Map<string, Omit<ChecklistItem, 'id' | 'active'>>();
  for (const line of tsv.split('\n').map(l => l.trim()).filter(Boolean)) {
    const [itemRef = '', section = '', text = '', severityRaw = ''] = line.split('\t').map(c => c.trim());
    const severity = SEVERITY_MAP[severityRaw.toLowerCase()];
    if (!itemRef || !section || !text || !severity) {
      rows.push({ itemRef, section, text: text || line, severity: severityRaw, kind: 'invalid' });
      continue;
    }
    const current = existing.find(i => i.itemRef === itemRef && i.active);
    const kind = !current ? 'new'
      : current.section === section && current.text === text && current.severity === severity ? 'unchanged' : 'changed';
    rows.push({ itemRef, section, text, severity, kind });
    parsed.set(itemRef, { departmentId, itemRef, section, text, severity });
  }
  return { rows, parsed };
}

export function importPaste(ctx: Ctx, payload: { departmentId: string; tsv: string; apply?: boolean; deactivateAbsent?: string[] }): ImportPreview {
  const departmentId = requireString(payload.departmentId, 'departamento');
  const tsv = requireString(payload.tsv, 'conteúdo colado');
  const existing = ctx.ports.repos.checklistItems.all().filter(i => i.departmentId === departmentId);
  const { rows, parsed } = parseTsv(departmentId, tsv, existing);
  const absent = existing.filter(i => i.active && !parsed.has(i.itemRef));
  if (payload.apply) {
    ctx.ports.lock(() => {
      for (const [itemRef, data] of parsed) {
        const current = existing.find(i => i.itemRef === itemRef && i.active);
        if (current) ctx.ports.repos.checklistItems.update({ ...current, ...data });
        else ctx.ports.repos.checklistItems.insert({ id: ctx.ports.uuid(), active: true, ...data });
      }
      for (const id of payload.deactivateAbsent ?? []) {
        const item = ctx.ports.repos.checklistItems.byId(id);
        if (item && item.departmentId === departmentId)
          ctx.ports.repos.checklistItems.update({ ...item, active: false });
      }
      audit(ctx.ports, ctx.user.id, 'checklistItems.importPaste', 'ChecklistItems', departmentId,
        `rows=${rows.length} deactivated=${(payload.deactivateAbsent ?? []).length}`);
    });
    ctx.ports.invalidateCache(['checklistItems']);
  }
  return { rows, absent };
}

export function listUsers(ctx: Ctx): (SessionUser & { active: boolean })[] {
  return ctx.ports.repos.users.all().map(u => ({ ...toSessionUser(u), active: u.active }));
}
export function saveUser(ctx: Ctx, payload: { user: Partial<SessionUser> & { name: string; login: string; active?: boolean } }): { user: SessionUser; tempPassword?: string } {
  const name = requireString(payload.user.name, 'nome');
  const loginName = requireString(payload.user.login, 'login').toLowerCase();
  const role = requireEnum(payload.user.role, 'perfil', ['admin', 'regional', 'local'] as const);
  const cityId = optionalString(payload.user.cityId);
  if (role === 'local' && !cityId) fail('VALIDATION', 'Perfil local exige uma cidade.');
  return ctx.ports.lock(() => {
    const clash = ctx.ports.repos.users.all()
      .find(u => u.login.toLowerCase() === loginName && u.id !== payload.user.id);
    if (clash) fail('CONFLICT', 'Já existe um usuário com este login.');
    if (payload.user.id) {
      const row = ctx.ports.repos.users.byId(payload.user.id);
      if (!row) fail('NOT_FOUND', 'Usuário não encontrado.');
      const updated: UserRow = { ...row, name, login: loginName, role, cityId: role === 'local' ? cityId : undefined };
      if ((payload.user as { active?: boolean }).active === false && row.active) {
        updated.active = false;
        ctx.ports.repos.sessions.deleteByUserId(row.id); // revoke on deactivation (spec §6)
      } else if ((payload.user as { active?: boolean }).active === true) updated.active = true;
      ctx.ports.repos.users.update(updated);
      audit(ctx.ports, ctx.user.id, 'users.save', 'Users', updated.id);
      return { user: toSessionUser(updated) };
    }
    const tempPassword = generateTempPassword(ctx.ports);
    const base: UserRow = {
      id: ctx.ports.uuid(), name, login: loginName, role,
      cityId: role === 'local' ? cityId : undefined, active: true, mustChangePassword: true,
      createdAt: ctx.ports.now().toISOString(),
      passwordHash: '', salt: '', hashIterations: 0, failedAttempts: 0,
    };
    const row = applyNewPassword(ctx.ports, base, tempPassword);
    ctx.ports.repos.users.insert(row);
    audit(ctx.ports, ctx.user.id, 'users.create', 'Users', row.id);
    return { user: toSessionUser(row), tempPassword };
  });
}
export function resetPassword(ctx: Ctx, payload: { userId: string }): { tempPassword: string } {
  const row = ctx.ports.repos.users.byId(requireString(payload.userId, 'usuário'));
  if (!row) fail('NOT_FOUND', 'Usuário não encontrado.');
  const tempPassword = generateTempPassword(ctx.ports);
  ctx.ports.lock(() => {
    ctx.ports.repos.users.update(applyNewPassword(ctx.ports, row, tempPassword));
    ctx.ports.repos.sessions.deleteByUserId(row.id);
    audit(ctx.ports, ctx.user.id, 'users.resetPassword', 'Users', row.id);
  });
  return { tempPassword };
}
