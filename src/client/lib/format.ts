/**
 * Small display-formatting helpers shared by chrome components (Chrome, SideBar,
 * UserMenu — avatar initials, role labels) and the findings screens (Task 5+) — dates,
 * overdue framing. Kept out of strings/pt.ts because these are derived/computed, not
 * static copy.
 */
import type { Finding, Role } from '../../shared/types';
import { UNRESOLVED } from '../../shared/types';
import { t } from '../strings/pt';

/** "José Almeida" → "JA"; single-word names take the first two letters. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

export function roleLabel(role: Role): string {
  return t.roles[role];
}

// ---------------------------------------------------------------------------
// Dates / overdue framing (Findings.tsx, FindingCard.tsx — display only).
// ---------------------------------------------------------------------------
const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DAY_MS = 86_400_000;

/**
 * YYYY-MM-DD in America/Sao_Paulo — client-side mirror of the server's
 * `Ports.todayIso()` (src/server/gas/wiring.ts#todayIsoSaoPaulo, also duplicated in
 * src/client/lib/mock/server.ts#todayIso). Used only for *display* framing (which
 * pill/copy to show); `filters.overdue` itself is always computed server-side.
 */
export function todayIsoSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** "2026-08-15" → "15 ago 2026" — DESIGN_REFERENCE's deadline copy has no Intl
 *  equivalent (pt-BR Intl formatting spells out "15 de ago. de 2026"). */
export function formatDatePt(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_PT[(m ?? 1) - 1]} ${y}`;
}

/** Mirrors src/server/lib/validate.ts#isOverdue — duplicated client-side for display. */
export function isOverdueClient(f: Pick<Finding, 'status' | 'deadline'>): boolean {
  return !!f.deadline && UNRESOLVED.includes(f.status) && f.deadline < todayIsoSaoPaulo();
}

// ---------------------------------------------------------------------------
// Competência (MM/AAAA) — VisitStart.tsx (D1/D2). Mirrors
// src/server/lib/validate.ts#isValidPeriod's format/range rule client-side.
// ---------------------------------------------------------------------------

/** Progressive input mask: digits-only as typed, auto-inserting the `/` once the
 *  month's two digits are in — "042026" (or pasted "04/2026") → "04/2026". */
export function formatPeriodMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 6);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Mirrors src/server/lib/validate.ts#isValidPeriod — MM/AAAA, month 01–12. */
export function isValidPeriodClient(period: string): boolean {
  const m = /^(\d{2})\/(\d{4})$/.exec(period);
  if (!m) return false;
  const month = Number(m[1]);
  return month >= 1 && month <= 12;
}

function toEpochDays(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY_MS;
}

/** Whole days between `deadlineIso` and today (America/Sao_Paulo), floored at 0. */
export function daysOverdue(deadlineIso: string): number {
  return Math.max(0, toEpochDays(todayIsoSaoPaulo()) - toEpochDays(deadlineIso));
}

export type DeadlineDisplayKind = 'overdue' | 'resolved' | 'dash' | 'due' | 'none';
export interface DeadlineDisplay { kind: DeadlineDisplayKind; text: string }

/**
 * Card (C1/C3) vs table (DT2) render the same four deadline states with different
 * copy for the overdue pill (`overdueLong` "Vencido há N dias" vs the compact
 * `overdueTable` "venc. há N dias") — pass `compact: true` for the desktop table.
 * DT2's own mockup HTML also shows a short "resolvido 12 abr" (no year, no "em") for
 * the resolved state, which isn't one of DESIGN_REFERENCE §5's four pinned deadline
 * variants ("sem prazo" / "prazo {data}" / "resolvido em {data}" / "—") — this uses
 * the canonical `resolvedOn` copy everywhere instead of inventing a fifth variant.
 */
export function findingDeadlineDisplay(f: Finding, compact = false): DeadlineDisplay {
  if (f.status === 'resolved' && f.resolvedAt) {
    return { kind: 'resolved', text: t.labels.deadline.resolvedOn(formatDatePt(f.resolvedAt.slice(0, 10))) };
  }
  if (f.status === 'cancelled') {
    return { kind: 'dash', text: t.labels.deadline.dash };
  }
  if (isOverdueClient(f)) {
    const days = daysOverdue(f.deadline!);
    return { kind: 'overdue', text: compact ? t.labels.overdueTable(days) : t.labels.overdueLong(days) };
  }
  if (f.deadline) {
    return { kind: 'due', text: t.labels.deadline.due(formatDatePt(f.deadline)) };
  }
  return { kind: 'none', text: t.labels.deadline.none };
}
