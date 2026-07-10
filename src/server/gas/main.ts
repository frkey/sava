import '../api/registry';
import { dispatch } from '../api/dispatcher';
import { ownerContextOk } from './runtime';
import { gasPorts, requireScriptProperty, todayIsoSaoPaulo } from './wiring';
import { SHEET_COLUMNS } from '../repositories/mapping';
import { generateTempPassword, applyNewPassword } from '../services/auth';
import type { UserRow } from '../services/ports';
import type { ApiRequest, Envelope } from '../../shared/types';

function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('SAVA')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function api(request: ApiRequest): Envelope<unknown> {
  return dispatch(gasPorts(), request);
}

/** Editor/trigger-only guard (spec §3): anonymous web callers have an empty active user;
 * editor runs and installable triggers execute with the owner's identity. Deliberately not
 * exposed as a global — only setup()/purgeSessions()/weeklyBackup() call it. */
function assertOwnerContext(): void {
  const active = Session.getActiveUser().getEmail();
  const effective = Session.getEffectiveUser().getEmail();
  if (!ownerContextOk(active, effective)) throw new Error('setup/triggers: owner context required');
}

/** Verbatim from spec §5 — do not reorder or rename. */
const DEPARTMENT_NAMES = [
  'Anciães Verificação', 'Atividade Voluntária', 'Ativo Imobilizado', 'CNS', 'Compras',
  'Conselho Fiscal', 'Contabilidade', 'Distribuidora', 'Engenharia', 'Fundo Musical',
  'Informática', 'Jurídico', 'Jurídico LGPD', 'Manutenção Preventiva', 'Patrimônio Bens Imóveis',
  'Piedade', 'Presidência', 'Saúde e Segurança', 'Secretaria', 'Tesouraria',
  'Treinamento e Integração',
];

function headerRow(sheet: GoogleAppsScript.Spreadsheet.Sheet): string[] {
  const lastCol = sheet.getLastColumn();
  return lastCol === 0 ? [] : sheet.getRange(1, 1, 1, lastCol).getValues()[0]!.map(String);
}

/** Creates any missing tab and (re)writes row 1 headers when they differ from
 * SHEET_COLUMNS[tab]. Never touches data rows (row 2+) of an existing tab. */
function ensureSheetsAndHeaders(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  for (const tab of Object.keys(SHEET_COLUMNS)) {
    const headers = SHEET_COLUMNS[tab]!;
    const sheet = ss.getSheetByName(tab) ?? ss.insertSheet(tab);
    const current = headerRow(sheet);
    const same = current.length === headers.length && headers.every((h, i) => h === current[i]);
    if (!same) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function ensureTriggers(): void {
  const existing = ScriptApp.getProjectTriggers();
  const hasTrigger = (fn: string) => existing.some(t => t.getHandlerFunction() === fn);
  if (!hasTrigger('purgeSessions')) {
    ScriptApp.newTrigger('purgeSessions').timeBased().everyDays(1).create();
  }
  if (!hasTrigger('weeklyBackup')) {
    // everyWeeks() requires an explicit weekday; Monday ~03h (America/Sao_Paulo, manifest
    // timeZone) keeps the copy out of any plausible usage window.
    ScriptApp.newTrigger('weeklyBackup').timeBased().everyWeeks(1)
      .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).create();
  }
}

function setup(): void {
  assertOwnerContext();
  const spreadsheetId = requireScriptProperty('SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(spreadsheetId);
  ensureSheetsAndHeaders(ss);

  const ports = gasPorts();

  if (ports.repos.departments.all().length === 0) {
    ports.lock(() => {
      for (const name of DEPARTMENT_NAMES) {
        ports.repos.departments.insert({ id: ports.uuid(), name, active: true });
      }
    });
  }

  if (ports.repos.users.all().length === 0) {
    const tempPassword = generateTempPassword(ports);
    ports.lock(() => {
      const base: UserRow = {
        id: ports.uuid(), name: 'Administrador SAVA', login: 'sava.admin', role: 'admin',
        active: true, mustChangePassword: true, createdAt: ports.now().toISOString(),
        passwordHash: '', salt: '', hashIterations: 0, failedAttempts: 0,
      };
      ports.repos.users.insert(applyNewPassword(ports, base, tempPassword));
    });
    // Only permitted logging of a secret (spec §11): shown once in the editor at setup time.
    Logger.log('Senha temporária do admin: ' + tempPassword);
  }

  ensureTriggers();
}

function purgeSessions(): void {
  assertOwnerContext();
  const ports = gasPorts();
  ports.lock(() => ports.repos.sessions.deleteExpired(ports.now().toISOString()));
}

function weeklyBackup(): void {
  assertOwnerContext();
  const spreadsheetId = requireScriptProperty('SPREADSHEET_ID');
  const backupFolderId = requireScriptProperty('BACKUP_FOLDER_ID');
  const folder = DriveApp.getFolderById(backupFolderId);
  const prefix = 'SAVA-DB-backup-';
  DriveApp.getFileById(spreadsheetId).makeCopy(prefix + todayIsoSaoPaulo(), folder);

  const files: GoogleAppsScript.Drive.File[] = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf(prefix) === 0) files.push(f);
  }
  files.sort((a, b) => (a.getName() < b.getName() ? 1 : a.getName() > b.getName() ? -1 : 0));
  for (const f of files.slice(8)) f.setTrashed(true);
}

/**
 * Implementations live under one namespace object; the INVOCABLE global names
 * (doGet/api/setup/purgeSessions/weeklyBackup) are plain-ES5 delegating stubs in
 * dist/stubs.js (emitted by scripts/build-server.mjs). Rationale: the function
 * registry behind google.script.run and the editor dropdown is built by static
 * analysis that can choke on the bundled file's modern syntax — a tiny clean
 * stubs file is always parseable, and call-time delegation makes file evaluation
 * order irrelevant. `__sava` is an object, not a function, so google.script.run
 * cannot invoke it directly; the five stubs remain the only callable surface,
 * each backed by its own guard (dispatcher auth / assertOwnerContext).
 */
(globalThis as Record<string, unknown>).__sava = { doGet, api, setup, purgeSessions, weeklyBackup };
