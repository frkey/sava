/** Pure guard logic (spec §3): editor runs and installable triggers execute with the
 * owner's identity (active === effective); anonymous web-app callers have an empty
 * active user. Kept pure and GAS-free — deliberately the only export here — so it stays
 * unit-testable under vitest (which has no GoogleAppsScript ambient types) and so
 * `test/entryguard.test.ts` never transitively pulls in Spreadsheet/Drive-touching code.
 * The impure wiring (`gasPorts` and friends) lives in `./wiring.ts`, mirroring the
 * pure/impure split already used for `repositories/mapping.ts` vs `repositories/sheets.ts`. */
export function ownerContextOk(active: string, effective: string): boolean {
  return active !== '' && active === effective;
}
