/**
 * Seed data for the dev mock (src/client/lib/mock/server.ts). This is the dev
 * workhorse — every screen built against `npm run dev` renders this data — so it
 * intentionally has enough variety (statuses, severities, deadlines, review history)
 * to exercise every state a real screen needs to handle.
 *
 * Dates are computed relative to "now" (module-load time) rather than hardcoded, so
 * the "some overdue" / "current semester" properties stay true no matter when a
 * developer runs `npm run dev`.
 *
 * Composition: 6 cities, the 21 real department names (spec §4 seed list), ~12
 * catalog items for Informática, and a small visit history. The brief's "2 past
 * visits + 1 open visit" describes the flagship field-flow demo city (Sumaré, c1 —
 * the one exercised end-to-end by Task 7's D1–D6 flow). A handful of extra
 * single-visit cities (Campinas, Hortolândia, Indaiatuba, Valinhos, Paulínia) are
 * layered on top so dashboard/findings-list/indicators screens (Tasks 4/5/9) have
 * real multi-city data to render instead of 5 empty cities out of 6.
 */
import type {
  City, Department, ChecklistItem, Visit, VisitDepartment, Finding, FindingReview, Role,
} from '../../../shared/types';

/** Mock-only user row — plaintext password (dev convenience; never real auth). */
export interface MockUser {
  id: string;
  name: string;
  login: string;
  password: string;
  role: Role;
  cityId?: string;
  active: boolean;
  mustChangePassword: boolean;
  failedAttempts: number;
  lockedUntil?: string; // ISO
}

// ---------------------------------------------------------------------------
// Date helpers — anchored to real "now" so the fixtures never go stale.
// ---------------------------------------------------------------------------
const DAY_MS = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD, `offsetDays` from today (negative = past). */
function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}
/** Full ISO datetime, `offsetDays` from now (negative = past). */
function isoDateTime(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString();
}
/** MM/YYYY competência string, `monthsAgo` months before the current month. */
function periodMonthsAgo(monthsAgo: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  return `${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
export function currentPeriod(): string {
  return periodMonthsAgo(0);
}
/** A plausible mainDate (YYYY-MM-DD) within a MM/YYYY period. */
function mainDateForPeriod(period: string, day: number): string {
  const [mm, yyyy] = period.split('/');
  return `${yyyy}-${mm}-${pad2(day)}`;
}

// ---------------------------------------------------------------------------
// Cities (6) — names as used throughout the mockups.
// ---------------------------------------------------------------------------
export function buildCities(): City[] {
  return [
    { id: 'c1', name: 'Sumaré', active: true },
    { id: 'c2', name: 'Campinas', active: true },
    { id: 'c3', name: 'Hortolândia', active: true },
    { id: 'c4', name: 'Indaiatuba', active: true },
    { id: 'c5', name: 'Valinhos', active: true },
    { id: 'c6', name: 'Paulínia', active: true },
  ];
}

// ---------------------------------------------------------------------------
// Departments (21) — spec §4 seed list, verbatim.
// ---------------------------------------------------------------------------
export function buildDepartments(): Department[] {
  const names = [
    'Anciães Verificação', 'Atividade Voluntária', 'Ativo Imobilizado', 'CNS', 'Compras',
    'Conselho Fiscal', 'Contabilidade', 'Distribuidora', 'Engenharia', 'Fundo Musical',
    'Informática', 'Jurídico', 'Jurídico LGPD', 'Manutenção Preventiva',
    'Patrimônio Bens Imóveis', 'Piedade', 'Presidência', 'Saúde e Segurança', 'Secretaria',
    'Tesouraria', 'Treinamento e Integração',
  ];
  return names.map((name, i) => ({ id: `d${i + 1}`, name, active: true }));
}
// Stable ids for departments referenced by findings/visits below (see buildDepartments order).
const DEPT = {
  compras: 'd5', contabilidade: 'd7', engenharia: 'd9', informatica: 'd11',
  piedade: 'd16', presidencia: 'd17', secretaria: 'd19', tesouraria: 'd20',
} as const;

// ---------------------------------------------------------------------------
// Checklist items (~12) — Informática catalog. Text doubles as Finding.itemText
// when a finding is opened against that item (server snapshot semantics).
// ---------------------------------------------------------------------------
export function buildChecklistItems(): ChecklistItem[] {
  const rows: Array<[string, string, string, ChecklistItem['severity']]> = [
    ['1.1', 'ROTINAS', 'Ata de reunião do departamento registrada', 'low'],
    ['1.3', 'ROTINAS', 'Escala de plantão de suporte definida', 'low'],
    ['2.1', 'INFRAESTRUTURA', 'Nobreak dos servidores testado', 'high'],
    ['2.4', 'INFRAESTRUTURA', 'Ambiente do rack com temperatura controlada', 'medium'],
    ['3.2', 'BACKUP', 'Backup do servidor local sem teste de restauração', 'medium'],
    ['3.5', 'BACKUP', 'Cópia externa (offsite) dos backups realizada', 'high'],
    ['4.5', 'ROTINAS', 'Inventário de equipamentos atualizado', 'high'],
    ['4.7', 'ROTINAS', 'Etiquetas de patrimônio afixadas nos equipamentos', 'low'],
    ['5.2', 'ACESSOS', 'Senhas de administrador trocadas periodicamente', 'high'],
    ['6.1', 'SEGURANÇA', 'Antivírus atualizado nas estações', 'low'],
    ['6.3', 'SEGURANÇA', 'Acesso Wi-Fi da administração segregado do público', 'medium'],
    ['7.2', 'DOCUMENTAÇÃO', 'Termos de responsabilidade assinados', 'medium'],
  ];
  return rows.map(([itemRef, section, text, severity], i) => ({
    id: `ci${i + 1}`, departmentId: DEPT.informatica, itemRef, section, text, severity, active: true,
  }));
}

// ---------------------------------------------------------------------------
// Users (3) — one per role, exact credentials pinned by the plan brief.
// ---------------------------------------------------------------------------
export function buildUsers(): MockUser[] {
  return [
    {
      id: 'u1', name: 'Ana Ribeiro', login: 'sava.admin', password: 'Sava1234', role: 'admin',
      active: true, mustChangePassword: false, failedAttempts: 0,
    },
    {
      id: 'u2', name: 'José Almeida', login: 'jose', password: 'Senha123', role: 'regional',
      active: true, mustChangePassword: false, failedAttempts: 0,
    },
    {
      id: 'u3', name: 'Maria Souza', login: 'maria', password: 'Senha123', role: 'local',
      cityId: 'c1', active: true, mustChangePassword: true, failedAttempts: 0,
    },
  ];
}

// ---------------------------------------------------------------------------
// Visits + VisitDepartments — Sumaré (c1) gets the full field-flow history (2 past
// + 1 open); the other 5 cities each get one completed visit for dashboard variety.
// ---------------------------------------------------------------------------
export function buildVisits(): Visit[] {
  const p12 = periodMonthsAgo(12);
  const p6 = periodMonthsAgo(6);
  const cur = currentPeriod();
  return [
    { id: 'v1', cityId: 'c1', period: p12, mainDate: mainDateForPeriod(p12, 14), createdAt: isoDateTime(-360), createdBy: 'u2' },
    { id: 'v2', cityId: 'c1', period: p6, mainDate: mainDateForPeriod(p6, 10), createdAt: isoDateTime(-180), createdBy: 'u2' },
    { id: 'v3', cityId: 'c1', period: cur, mainDate: isoDate(-2), createdAt: isoDateTime(-2), createdBy: 'u2' },
    { id: 'v4', cityId: 'c2', period: p6, mainDate: mainDateForPeriod(p6, 8), createdAt: isoDateTime(-175), createdBy: 'u2' },
    { id: 'v5', cityId: 'c3', period: p12, mainDate: mainDateForPeriod(p12, 15), createdAt: isoDateTime(-355), createdBy: 'u2' },
    { id: 'v6', cityId: 'c4', period: p6, mainDate: mainDateForPeriod(p6, 20), createdAt: isoDateTime(-170), createdBy: 'u2' },
    { id: 'v7', cityId: 'c5', period: p12, mainDate: mainDateForPeriod(p12, 5), createdAt: isoDateTime(-365), createdBy: 'u2' },
    { id: 'v8', cityId: 'c6', period: p6, mainDate: mainDateForPeriod(p6, 25), createdAt: isoDateTime(-160), createdBy: 'u2' },
  ];
}

export function buildVisitDepartments(): VisitDepartment[] {
  const visits = buildVisits();
  const byId = new Map(visits.map(v => [v.id, v]));
  const completed = (
    id: string, visitId: string, departmentId: string, opts: { doneOffset: number; reps?: boolean },
  ): VisitDepartment => {
    const v = byId.get(visitId)!;
    return {
      id, visitId, departmentId, cityId: v.cityId, period: v.period,
      verificationDate: v.mainDate,
      regionalReps: opts.reps === false ? undefined : 'José Almeida',
      localReps: opts.reps === false ? undefined : 'Equipe local do departamento',
      countYes: 15, countYesWithCaveats: 2, countNo: 2, countNotApplicable: 3,
      pdfFileId: `file-${id}`, pdfUrl: `https://drive.example/file-${id}`,
      completedAt: isoDateTime(opts.doneOffset), completedBy: 'u2',
      createdAt: v.createdAt, createdBy: v.createdBy,
    };
  };
  return [
    completed('vd1', 'v1', DEPT.informatica, { doneOffset: -359 }),
    completed('vd2', 'v1', DEPT.tesouraria, { doneOffset: -359 }),
    completed('vd3', 'v1', DEPT.secretaria, { doneOffset: -359 }),
    completed('vd4', 'v2', DEPT.informatica, { doneOffset: -179 }),
    completed('vd5', 'v3', DEPT.tesouraria, { doneOffset: -1 }),
    // Current visit, Informática in progress: participation filled, not yet completed
    // (no completedAt/pdf/counts) — the D3 "iniciado · falta reverificação" state.
    {
      id: 'vd6', visitId: 'v3', departmentId: DEPT.informatica, cityId: 'c1', period: currentPeriod(),
      verificationDate: isoDate(-2), regionalReps: 'José Almeida', localReps: 'Equipe local de informática',
      createdAt: isoDateTime(-2), createdBy: 'u2',
    },
    completed('vdC1', 'v4', DEPT.compras, { doneOffset: -174 }),
    completed('vdH1', 'v5', DEPT.contabilidade, { doneOffset: -354 }),
    completed('vdI1', 'v6', DEPT.engenharia, { doneOffset: -169 }),
    completed('vdV1', 'v7', DEPT.piedade, { doneOffset: -364 }),
    completed('vdP1', 'v8', DEPT.presidencia, { doneOffset: -159 }),
  ];
}

// ---------------------------------------------------------------------------
// Findings (15) — mixed statuses/severities/deadlines, some overdue.
// ---------------------------------------------------------------------------
export function buildFindings(): Finding[] {
  const p12 = periodMonthsAgo(12);
  const p6 = periodMonthsAgo(6);
  const cur = currentPeriod();
  const base = (
    n: number, over: Partial<Finding> & Pick<Finding,
      'visitDepartmentId' | 'visitId' | 'cityId' | 'departmentId' | 'period' | 'itemText' | 'severity' | 'status'>,
  ): Finding => ({
    id: `f${n}`, code: `A-${String(n).padStart(4, '0')}`,
    response: 'no', createdAt: isoDateTime(-350), createdBy: 'u2',
    updatedAt: isoDateTime(-350), updatedBy: 'u2',
    ...over,
  });

  return [
    base(1, {
      visitDepartmentId: 'vd1', visitId: 'v1', cityId: 'c1', departmentId: DEPT.informatica, period: p12,
      itemRef: '4.5', section: 'ROTINAS', itemText: 'Inventário de equipamentos atualizado',
      severity: 'high', status: 'open', deadline: isoDate(-12), assignee: 'Equipe local de informática',
      considerations: 'Planilha de inventário sem atualização desde a visita anterior; equipamentos novos sem registro e dois notebooks sem termo de responsabilidade.',
      createdAt: isoDateTime(-360), updatedAt: isoDateTime(-360),
    }),
    base(2, {
      visitDepartmentId: 'vd1', visitId: 'v1', cityId: 'c1', departmentId: DEPT.informatica, period: p12,
      itemRef: '3.2', section: 'BACKUP', itemText: 'Backup do servidor local sem teste de restauração',
      severity: 'medium', status: 'in_treatment', deadline: isoDate(45),
      considerations: 'Rotina de backup existe, mas não há teste de restauração documentado.',
      createdAt: isoDateTime(-360), updatedAt: isoDateTime(-180),
    }),
    base(3, {
      visitDepartmentId: 'vd2', visitId: 'v1', cityId: 'c1', departmentId: DEPT.tesouraria, period: p12,
      itemRef: '9.1', section: 'ROTINAS', itemText: 'Ata de reunião trimestral registrada',
      severity: 'low', status: 'resolved', resolvedAt: isoDateTime(-179), resolvedBy: 'u2',
      considerations: 'Ata da última reunião trimestral não localizada na pasta do departamento.',
      createdAt: isoDateTime(-359), updatedAt: isoDateTime(-179),
    }),
    base(4, {
      visitDepartmentId: 'vd2', visitId: 'v1', cityId: 'c1', departmentId: DEPT.tesouraria, period: p12,
      itemRef: '2.3', section: 'FINANCEIRO', itemText: 'Conciliação bancária sem conferência mensal documentada',
      severity: 'medium', status: 'open', deadline: isoDate(80),
      createdAt: isoDateTime(-359), updatedAt: isoDateTime(-359),
    }),
    base(5, {
      visitDepartmentId: 'vd3', visitId: 'v1', cityId: 'c1', departmentId: DEPT.secretaria, period: p12,
      itemRef: '1.2', section: 'ROTINAS', itemText: 'Termo de posse de bens assinado',
      severity: 'low', status: 'cancelled',
      createdAt: isoDateTime(-358), updatedAt: isoDateTime(-170),
    }),
    base(6, {
      visitDepartmentId: 'vd3', visitId: 'v1', cityId: 'c1', departmentId: DEPT.secretaria, period: p12,
      itemRef: '1.8', section: 'ROTINAS', itemText: 'Atas de reunião sem assinatura do secretário responsável',
      severity: 'low', status: 'in_treatment',
      createdAt: isoDateTime(-358), updatedAt: isoDateTime(-179),
    }),
    base(7, {
      visitDepartmentId: 'vdH1', visitId: 'v5', cityId: 'c3', departmentId: DEPT.contabilidade, period: p12,
      itemRef: '2.1', section: 'FISCAL', itemText: 'Notas fiscais de serviço arquivadas fora de ordem cronológica',
      severity: 'medium', status: 'open', deadline: isoDate(25),
      createdAt: isoDateTime(-354), updatedAt: isoDateTime(-354),
    }),
    base(8, {
      visitDepartmentId: 'vdH1', visitId: 'v5', cityId: 'c3', departmentId: DEPT.contabilidade, period: p12,
      itemRef: '2.5', section: 'FISCAL', itemText: 'Conciliação de contas contábeis pendente de assinatura',
      severity: 'low', status: 'cancelled',
      createdAt: isoDateTime(-354), updatedAt: isoDateTime(-100),
    }),
    base(9, {
      visitDepartmentId: 'vdV1', visitId: 'v7', cityId: 'c5', departmentId: DEPT.piedade, period: p12,
      itemRef: '3.1', section: 'ROTINAS', itemText: 'Registro de doações e ofertas conferido mensalmente',
      severity: 'medium', status: 'open', deadline: isoDate(10),
      createdAt: isoDateTime(-364), updatedAt: isoDateTime(-364),
    }),
    base(10, {
      visitDepartmentId: 'vdC1', visitId: 'v4', cityId: 'c2', departmentId: DEPT.compras, period: p6,
      itemRef: '5.1', section: 'ROTINAS', itemText: 'Três orçamentos não anexados em compras acima do limite',
      severity: 'high', status: 'open', deadline: isoDate(-4), assignee: 'Coordenação de compras',
      createdAt: isoDateTime(-174), updatedAt: isoDateTime(-174),
    }),
    base(11, {
      visitDepartmentId: 'vdC1', visitId: 'v4', cityId: 'c2', departmentId: DEPT.compras, period: p6,
      itemRef: '5.4', section: 'ROTINAS', itemText: 'Contrato de fornecedor vencido sem renovação formal',
      severity: 'medium', status: 'resolved', resolvedAt: isoDateTime(-90), resolvedBy: 'u2',
      createdAt: isoDateTime(-174), updatedAt: isoDateTime(-90),
    }),
    base(12, {
      visitDepartmentId: 'vdI1', visitId: 'v6', cityId: 'c4', departmentId: DEPT.engenharia, period: p6,
      itemRef: '6.2', section: 'INFRAESTRUTURA', itemText: 'Laudo técnico do gerador vencido',
      severity: 'high', status: 'open', deadline: isoDate(-20), assignee: 'Engenharia regional',
      createdAt: isoDateTime(-169), updatedAt: isoDateTime(-169),
    }),
    base(13, {
      visitDepartmentId: 'vdI1', visitId: 'v6', cityId: 'c4', departmentId: DEPT.engenharia, period: p6,
      itemRef: '6.5', section: 'INFRAESTRUTURA', itemText: 'Planta do imóvel desatualizada em relação à última reforma',
      severity: 'medium', status: 'in_treatment',
      createdAt: isoDateTime(-169), updatedAt: isoDateTime(-60),
    }),
    base(14, {
      visitDepartmentId: 'vdP1', visitId: 'v8', cityId: 'c6', departmentId: DEPT.presidencia, period: p6,
      itemRef: '1.4', section: 'JURÍDICO', itemText: 'Procurações e representações legais atualizadas',
      severity: 'high', status: 'open', deadline: isoDate(-2),
      createdAt: isoDateTime(-159), updatedAt: isoDateTime(-159),
    }),
    // Registered during the CURRENT open visit (v3) — must be excluded from v3's own
    // reviewQueue (server semantics: only carries over findings from OTHER visits).
    base(15, {
      visitDepartmentId: 'vd6', visitId: 'v3', cityId: 'c1', departmentId: DEPT.informatica, period: cur,
      itemRef: '6.1', section: 'SEGURANÇA', itemText: 'Antivírus atualizado nas estações',
      severity: 'low', status: 'open',
      considerations: 'Três estações com antivírus desatualizado identificadas na verificação.',
      createdAt: isoDateTime(-1), updatedAt: isoDateTime(-1),
    }),
  ];
}

// ---------------------------------------------------------------------------
// Finding reviews — history mixing visit reviews and manual status changes.
// ---------------------------------------------------------------------------
export function buildFindingReviews(): FindingReview[] {
  return [
    {
      id: 'r1', findingId: 'f2', type: 'visit_review', visitId: 'v2', result: 'partial',
      notes: 'Testes de restauração agendados para o próximo trimestre; ainda não realizados.',
      createdAt: isoDateTime(-180), createdBy: 'u2',
    },
    {
      id: 'r2', findingId: 'f3', type: 'visit_review', visitId: 'v2', result: 'resolved',
      notes: 'Ata retroativa juntada e assinada pelos responsáveis.',
      createdAt: isoDateTime(-179), createdBy: 'u2',
    },
    {
      id: 'r3', findingId: 'f5', type: 'status_change', newStatus: 'cancelled',
      notes: 'Item não se aplica mais — atividade descontinuada no departamento.',
      createdAt: isoDateTime(-170), createdBy: 'u1',
    },
    {
      id: 'r4', findingId: 'f6', type: 'visit_review', visitId: 'v2', result: 'partial',
      notes: 'Ata ainda não assinada; secretário se comprometeu a regularizar até a próxima verificação.',
      createdAt: isoDateTime(-179), createdBy: 'u2',
    },
    {
      id: 'r5', findingId: 'f8', type: 'status_change', newStatus: 'cancelled',
      notes: 'Processo foi substituído por novo procedimento definido pela Contabilidade regional.',
      createdAt: isoDateTime(-100), createdBy: 'u1',
    },
    {
      id: 'r6', findingId: 'f11', type: 'status_change', newStatus: 'resolved',
      notes: 'Contrato renovado e anexado ao processo antes da próxima verificação.',
      createdAt: isoDateTime(-90), createdBy: 'u2',
    },
    {
      id: 'r7', findingId: 'f13', type: 'status_change', newStatus: 'in_treatment',
      notes: 'Empresa contratada para atualização da planta; prazo estimado de 60 dias.',
      createdAt: isoDateTime(-60), createdBy: 'u2',
    },
  ];
}
