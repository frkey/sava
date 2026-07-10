import { register, assertCityScope } from './dispatcher';
import * as md from '../services/masterdata';
import * as visits from '../services/visits';
import * as findings from '../services/findings';
import * as reviews from '../services/reviews';
import * as dashboard from '../services/dashboard';
import * as pdfs from '../services/pdfs';
// later tasks append their imports/registrations here

register('cities.list', 'local', (ctx) => md.listCities(ctx));
register('cities.save', 'admin', (ctx, p) => md.saveCity(ctx, p as never));
register('departments.list', 'local', (ctx) => md.listDepartments(ctx));
register('departments.save', 'admin', (ctx, p) => md.saveDepartment(ctx, p as never));
register('checklistItems.list', 'regional', (ctx, p) => md.listChecklistItems(ctx, (p ?? {}) as never));
register('checklistItems.save', 'admin', (ctx, p) => md.saveChecklistItem(ctx, p as never));
register('checklistItems.importPaste', 'admin', (ctx, p) => md.importPaste(ctx, p as never));
register('users.list', 'admin', (ctx) => md.listUsers(ctx));
register('users.save', 'admin', (ctx, p) => md.saveUser(ctx, p as never));
register('users.resetPassword', 'admin', (ctx, p) => md.resetPassword(ctx, p as never));

register('visits.list', 'local', (ctx, p) => visits.listVisits(ctx, (p ?? {}) as never));
register('visits.get', 'local', (ctx, p) => visits.getVisit(ctx, p as never));
register('visits.save', 'regional', (ctx, p) => visits.saveVisit(ctx, p as never));
register('visits.delete', 'admin', (ctx, p) => visits.deleteVisit(ctx, p as never));
register('visitDepartments.save', 'regional', (ctx, p) => visits.saveVisitDepartment(ctx, p as never));
register('visitDepartments.markDone', 'regional', (ctx, p) => visits.markDone(ctx, p as never));
register('visitDepartments.delete', 'admin', (ctx, p) => visits.deleteVisitDepartment(ctx, p as never));
register('visitDepartments.uploadPdf', 'regional', (ctx, p) => pdfs.uploadPdf(ctx, p as never));
register('visitDepartments.downloadPdf', 'local', (ctx, p) => pdfs.downloadPdf(ctx, p as never));

register('findings.list', 'local', (ctx, p) => findings.listFindings(ctx, (p ?? {}) as never));
register('findings.get', 'local', (ctx, p) => findings.getFinding(ctx, p as never));
register('findings.save', 'regional', (ctx, p) => findings.saveFinding(ctx, p as never));
register('findings.updateStatus', 'regional', (ctx, p) => findings.updateStatus(ctx, p as never));

register('findings.reviewQueue', 'regional', (ctx, p) => reviews.reviewQueue(ctx, p as never));
register('findingReviews.save', 'regional', (ctx, p) => reviews.saveReview(ctx, p as never));

register('dashboard.summary', 'local', (ctx, p) => dashboard.dashboardSummary(ctx, (p ?? {}) as never));

export { assertCityScope };
