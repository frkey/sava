/**
 * Client-side deployment config that isn't user-facing copy (so it doesn't belong in
 * strings/pt.ts) and isn't a server secret (so it doesn't belong in Script Properties,
 * CLAUDE.md's "IDs live in Script Properties, never in code" rule — that rule is about
 * per-environment spreadsheet/Drive/GAS-project ids, not a single public report URL
 * shared verbatim by both dev and prod).
 *
 * `LOOKER_URL` — the external Looker Studio dashboard link (spec §10, §15). No report
 * exists yet (built manually once real production data exists, per §15's rollout
 * checklist) — `undefined` until then. Indicators.tsx (task 9) renders the "Painel
 * completo" button disabled with a helper explaining this when the URL is unset, and
 * hides it entirely for `local` (spec §10: Looker is regional/admin-only).
 */
export const LOOKER_URL: string | undefined = undefined;
