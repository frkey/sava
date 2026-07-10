import { sheetsRepos } from '../repositories/sheets';
import type { CrossCache } from '../repositories/sheets';
import { driveFiles } from '../repositories/files';
import { SHEET_COLUMNS } from '../repositories/mapping';
import type { Ports } from '../services/ports';

/** 6 h TTL for the cross-request master-data cache (Cities/Departments), bounded by
 * invalidation on every write to those tabs. */
const CACHE_TTL_SECONDS = 21600;

/** GAS-facing wiring: reads Script Properties, opens the spreadsheet, builds the full
 * `Ports` implementation. Impure (touches PropertiesService/SpreadsheetApp/LockService/
 * CacheService/Utilities) — typecheck-only, no vitest coverage, same convention as
 * `repositories/sheets.ts` and `repositories/files.ts`. Only imported by `main.ts`. */

/** Reads a required Script Property, throwing a pt-BR error when absent. Exported so
 * main.ts can read BACKUP_FOLDER_ID (not part of Ports) through the same path. */
export function requireScriptProperty(name: string): string {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error(`Propriedade do script ausente: ${name}`);
  return value;
}

/** yyyy-MM-dd in America/Sao_Paulo — shared by Ports.todayIso and main.ts's weeklyBackup. */
export function todayIsoSaoPaulo(): string {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
}

function headerRow(sheet: GoogleAppsScript.Spreadsheet.Sheet): string[] {
  const lastCol = sheet.getLastColumn();
  return lastCol === 0 ? [] : sheet.getRange(1, 1, 1, lastCol).getValues()[0]!.map(String);
}

/** Guards against silent schema drift (deferred finding from Task 6): every tab's row-1
 * headers must exactly match SHEET_COLUMNS[tab], else a write positioned by SHEET_COLUMNS
 * order could corrupt data. ~10 small reads. Runs once per request, and ONLY on the write
 * path (inside the first lock acquisition, see gasPorts) — reads map by the sheet's live
 * header row and are self-correcting, so they never need it and never pay for it. Fail-
 * closed for writes (the only operation that can corrupt), with no cached-skip window. */
function validateHeaders(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  for (const tab of Object.keys(SHEET_COLUMNS)) {
    const expected = SHEET_COLUMNS[tab]!;
    const sheet = ss.getSheetByName(tab);
    const actual = sheet ? headerRow(sheet) : [];
    const matches = actual.length === expected.length && expected.every((h, i) => h === actual[i]);
    if (!matches) {
      throw new Error(`Cabeçalhos da aba ${tab} divergem do esperado — rode setup() ou corrija a planilha.`);
    }
  }
}

export function gasPorts(): Ports {
  const spreadsheetId = requireScriptProperty('SPREADSHEET_ID');
  const pdfFolderId = requireScriptProperty('PDF_FOLDER_ID');
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const cache = CacheService.getScriptCache();

  // Cross-request cache for the stable master-data tabs (Cities/Departments). Writes to
  // those tabs clear the entry via the repo layer AND the service-layer invalidateCache.
  const cross: CrossCache | undefined = cache
    ? {
        get: (k) => cache.get(k),
        put: (k, v) => cache.put(k, v, CACHE_TTL_SECONDS),
        remove: (k) => cache.remove(k),
      }
    : undefined;

  // Header validation runs at most once per request, and only when a write lock is taken —
  // i.e. never on read-only requests. Fail-closed for writes, no cached-skip window.
  let headersChecked = false;

  return {
    repos: sheetsRepos(ss, cross),
    files: driveFiles(pdfFolderId),
    now: () => new Date(),
    todayIso: todayIsoSaoPaulo,
    uuid: () => Utilities.getUuid(),
    randomToken: () => Utilities.getUuid() + Utilities.getUuid(),
    lock: (fn) => {
      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        if (!headersChecked) {
          validateHeaders(ss);
          headersChecked = true;
        }
        return fn();
      } finally {
        lock.releaseLock();
      }
    },
    invalidateCache: (keys) => {
      if (cache) cache.removeAll(keys);
    },
  };
}
