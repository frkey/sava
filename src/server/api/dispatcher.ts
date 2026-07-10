import type { ApiRequest, Envelope, Role, SessionUser } from '../../shared/types';
import { AppError, errEnvelope, ok } from '../lib/errors';
import { fail } from '../lib/errors';
import { login, logout, changePassword, me, validateSession } from '../services/auth';
import type { Ctx, Ports } from '../services/ports';

type MinRole = 'public' | Role;
type Handler = (ctx: Ctx, payload: never) => unknown;
const ROLE_ORDER: Record<Role, number> = { local: 0, regional: 1, admin: 2 };
const routes = new Map<string, { minRole: MinRole; handler: Handler }>();

export function register(action: string, minRole: MinRole, handler: Handler): void {
  routes.set(action, { minRole, handler });
}
export const __testRegister = register;

/** Route table snapshot (action → minRole), for the mock/registry parity test
 *  (test/client/parity.test.ts) — never used by production dispatch logic. */
export function __testRoutes(): Map<string, MinRole> {
  const result = new Map<string, MinRole>();
  for (const [action, route] of routes) result.set(action, route.minRole);
  return result;
}

const MUST_CHANGE_ALLOWLIST = new Set(['auth.changePassword', 'auth.me', 'auth.logout']);

register('auth.login', 'public', (ctx, payload) => login(ctx.ports, payload as { login: string; password: string }));
register('auth.logout', 'local', (ctx) => logout(ctx.ports, (ctx as Ctx & { token: string }).token));
register('auth.me', 'local', (ctx) => me(ctx));
register('auth.changePassword', 'local', (ctx, payload) =>
  changePassword(ctx.ports, ctx.user, payload as { currentPassword: string; newPassword: string }));

/** local users may only touch their own city (spec §4/§6) */
export function assertCityScope(ctx: Ctx, cityId: string | undefined): void {
  if (ctx.user.role === 'local' && cityId !== ctx.user.cityId)
    fail('FORBIDDEN', 'Acesso restrito à sua cidade.');
}

export function dispatch(ports: Ports, request: ApiRequest): Envelope<unknown> {
  try {
    const route = routes.get(request.action);
    if (route?.minRole === 'public') {
      const publicCtx = { ports, user: null as unknown as SessionUser };
      return ok(route.handler(publicCtx, request.payload as never));
    }
    const user = validateSession(ports, request.token);
    if (!route) fail('NOT_FOUND', 'Ação desconhecida.');
    if (user.mustChangePassword && !MUST_CHANGE_ALLOWLIST.has(request.action))
      fail('FORBIDDEN', 'Troque sua senha para continuar.');
    if (ROLE_ORDER[user.role] < ROLE_ORDER[route.minRole as Role])
      fail('FORBIDDEN', 'Você não tem permissão para esta ação.');
    const ctx: Ctx & { token?: string } = { ports, user, token: request.token };
    return ok(route.handler(ctx, request.payload as never));
  } catch (e) {
    if (e instanceof AppError) return errEnvelope(e.code, e.message, e.details);
    const ref = `ERR-${Date.now().toString(36)}`;
    try {
      ports.lock(() => ports.repos.audit.append({
        timestamp: ports.now().toISOString(), userId: request.token ? 'session' : 'anonymous',
        action: 'error.INTERNAL', entity: 'api', entityId: ref,
        detail: `${request.action}: ${(e as Error).message}`,
      }));
    } catch { /* audit must never mask the response */ }
    return errEnvelope('INTERNAL', `Erro inesperado. Informe o código ${ref} ao administrador.`);
  }
}
