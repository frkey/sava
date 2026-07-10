/**
 * DESIGN_REFERENCE §8.4 C3/DT3 "Linha do tempo" — merges `FindingReview` rows
 * (`visit_review` + `status_change`) with a synthetic "created" entry sourced from
 * `Finding.createdAt`/`createdBy`, newest first (DESIGN_REFERENCE §3 screen catalog:
 * "newest first; square node = status change, circle = review/creation" — the mockup
 * HTML itself, `knowledge/mockups/SAVA_JORNADA_VISUAL.dc.html` `#c3`, renders entries
 * 03 mai 2026 → 12 abr 2026 → 19 out 2025, i.e. descending; visual sources win over the
 * task brief's "chronological asc" wording, read here as describing the merge itself,
 * not the render order).
 *
 * Node shape/color: square = `status_change`, colored by the resulting status (same
 * palette as StatusBadge); circle = `visit_review` (colored by result, same
 * resolved/not_resolved/partial icon set as ReviewDialog's option cards) or the
 * creation entry (brand tint, "+").
 *
 * Author names are intentionally NOT rendered: `createdBy` is a userId and no action
 * available to `regional`/`local` roles resolves userId → display name (`users.list`
 * is `admin`-gated, see `src/client/lib/mock/server.ts` ACTION_MIN_ROLE and
 * `src/server/api/registry.ts`) — matching the existing `t.findings.timeline.*` copy,
 * which never references an author either. Documented simplification, see
 * `.superpowers/sdd/task-6-report.md`.
 */
import type { Finding, FindingReview, Visit } from '../../shared/types';
import { t, statusLabel, reviewResultLabel } from '../strings/pt';
import { formatDatePt } from '../lib/format';

export interface TimelineProps {
  finding: Finding;
  reviews: FindingReview[];
  visits: Visit[];
}

type Entry =
  | { id: string; kind: 'created'; date: string; period: string }
  | { id: string; kind: 'status_change'; date: string; newStatus: Finding['status']; notes?: string }
  | { id: string; kind: 'visit_review'; date: string; result: 'resolved' | 'not_resolved' | 'partial'; visitId: string; notes?: string };

function toEntries(finding: Finding, reviews: FindingReview[]): Entry[] {
  const created: Entry = { id: `created-${finding.id}`, kind: 'created', date: finding.createdAt, period: finding.period };
  const rest: Entry[] = reviews.map(r => (
    r.type === 'status_change'
      ? { id: r.id, kind: 'status_change', date: r.createdAt, newStatus: r.newStatus!, notes: r.notes }
      : { id: r.id, kind: 'visit_review', date: r.createdAt, result: r.result!, visitId: r.visitId!, notes: r.notes }
  ));
  return [created, ...rest].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function nodeClass(entry: Entry): string {
  if (entry.kind === 'created') return 'timeline-node timeline-node-circle timeline-node-created';
  if (entry.kind === 'status_change') return `timeline-node timeline-node-square timeline-node-status-${entry.newStatus}`;
  return `timeline-node timeline-node-circle timeline-node-review-${entry.result}`;
}
function nodeGlyph(entry: Entry): string {
  if (entry.kind === 'created') return '+';
  if (entry.kind === 'status_change') return 'S';
  if (entry.result === 'resolved') return '✓';
  if (entry.result === 'not_resolved') return '✕';
  return '◐';
}
function tag(entry: Entry): string | undefined {
  if (entry.kind === 'status_change') return t.findings.timeline.manualChangeTag;
  if (entry.kind === 'visit_review') return t.findings.timeline.visitReviewTag;
  return undefined;
}
function titleMobile(entry: Entry, periodByVisitId: Map<string, string>): string {
  if (entry.kind === 'created') return t.findings.timeline.createdInVisit(entry.period);
  if (entry.kind === 'status_change') return t.findings.timeline.statusChangedMobile(statusLabel[entry.newStatus]);
  const period = periodByVisitId.get(entry.visitId) ?? t.labels.deadline.dash;
  return t.findings.timeline.reviewInVisit(period, reviewResultLabel[entry.result]);
}
function titleDesktop(entry: Entry, periodByVisitId: Map<string, string>): string {
  if (entry.kind === 'created') return t.findings.timeline.createdInVisit(entry.period);
  if (entry.kind === 'status_change') return t.findings.timeline.statusChangedDesktop(statusLabel[entry.newStatus]);
  const period = periodByVisitId.get(entry.visitId) ?? t.labels.deadline.dash;
  return t.findings.timeline.reviewShort(period, reviewResultLabel[entry.result]);
}

export function Timeline({ finding, reviews, visits }: TimelineProps) {
  const entries = toEntries(finding, reviews);
  const periodByVisitId = new Map(visits.map(v => [v.id, v.period] as const));

  return (
    <div className="timeline">
      {entries.map((entry, i) => {
        const isLast = i === entries.length - 1;
        const entryTag = tag(entry);
        const date = formatDatePt(entry.date.slice(0, 10));
        return (
          <div className="timeline-entry" key={entry.id} data-entry-kind={entry.kind}>
            <div className="timeline-node-col">
              <span className={nodeClass(entry)} aria-hidden="true">{nodeGlyph(entry)}</span>
              {!isLast ? <span className="timeline-connector" /> : null}
            </div>
            <div className="timeline-content">
              <div className="timeline-title timeline-title-mobile">{titleMobile(entry, periodByVisitId)}</div>
              <div className="timeline-title timeline-title-desktop">{titleDesktop(entry, periodByVisitId)}</div>
              {entry.kind !== 'created' && entry.notes ? (
                <div className="timeline-note">&ldquo;{entry.notes}&rdquo;</div>
              ) : null}
              <div className="timeline-meta timeline-meta-mobile">
                {entryTag ? `${date} · ${entryTag}` : date}
              </div>
              <div className="timeline-meta timeline-meta-desktop">{date}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
