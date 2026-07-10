/**
 * Root component: providers (Session → Nav → Toasts) + the top-level screen switch.
 * `AppShell` is exported separately from the default `App` so tests can drive session
 * state via a small harness wrapped in the same providers.
 */
import { useEffect, useState } from 'react';
import { SessionProvider, useSession } from './state/session';
import { NavProvider, useNav, type Screen } from './state/nav';
import { ToastProvider } from './state/toasts';
import { Chrome } from './components/Chrome';
import { NavBar } from './components/NavBar';
import { SideBar } from './components/SideBar';
import { Login } from './screens/Login';
import { ChangePassword } from './screens/ChangePassword';
import { Dashboard } from './screens/Dashboard';
import { Findings } from './screens/Findings';
import { FindingDetail } from './screens/FindingDetail';
import { Visit } from './screens/Visit';
import { Admin } from './screens/Admin';
import { Indicators } from './screens/Indicators';
import { t } from './strings/pt';
import './styles/components.css';

/** Every screen is implemented at this point (task 9 — Indicators was the last
 *  placeholder). 'visit' is NOT handled here — like ChangePassword, it's hoisted above
 *  the whole sidebar/topbar/bottom-nav shell in AppShell below (own full-bleed app
 *  bar, no chrome, matching every D1–D6 mockup frame). */
function ScreenContent({ screen }: { screen: Screen }) {
  switch (screen.name) {
    case 'dashboard': return <Dashboard />;
    case 'findings': return <Findings />;
    // `key={screen.id}`: navigating from one finding's detail straight to another's
    // (e.g. Dashboard/Findings deep links) keeps `screen.name === 'finding'` — without
    // a key React would reuse the same FindingDetail instance, and useApiCall's `data`
    // state (never cleared on an `id`/deps change, only overwritten once the new fetch
    // resolves) would render the PREVIOUS finding's data for the ~400-800ms the new
    // `findings.get` is in flight. Keying by id forces a clean remount instead.
    case 'finding': return <FindingDetail key={screen.id} id={screen.id} from={screen.from} />;
    case 'admin': return <Admin />;
    case 'indicators': return <Indicators />;
    default: return null;
  }
}

function BootScreen() {
  return (
    <div className="boot-screen" data-screen="boot">
      <div className="boot-brand-tile" aria-hidden="true">S</div>
      <div className="boot-wordmark">{t.brand.wordmark}</div>
    </div>
  );
}

export function AppShell() {
  const session = useSession();
  const { screen, go } = useNav();
  // Voluntary change-password, opened from the user menu (UserMenu.tsx's "Alterar
  // senha") at any time, vs. the forced gate below driven by `mustChangePassword` —
  // both render the same full-screen ChangePassword component (see its file header).
  const [voluntaryChangePassword, setVoluntaryChangePassword] = useState(false);

  // `local` must never render the visit-registration flow (spec §4: read-only role;
  // its nav never offers "Registrar", but stale in-memory state or a future bug could
  // still land here). The server independently rejects the writes (visits.save etc.
  // are minRole regional) — this is the client-side UX/defense half. Redirect via
  // effect + null render below (an unconditional hook, so it runs on every render
  // regardless of which early-return branch is taken).
  const isLocalOnVisit = session.user?.role === 'local' && screen.name === 'visit';
  // Same defense-in-depth as isLocalOnVisit above: the nav never offers "Cadastros"/
  // "Mais" to non-admins (navItems.ts), and every admin.* RPC is server-gated to
  // `minRole: 'admin'` regardless — but stale in-memory state or a future bug could
  // still land a non-admin here client-side.
  const isNonAdminOnAdmin = !!session.user && session.user.role !== 'admin' && screen.name === 'admin';
  useEffect(() => {
    if (isLocalOnVisit || isNonAdminOnAdmin) go({ name: 'dashboard' });
  }, [isLocalOnVisit, isNonAdminOnAdmin, go]);

  if (session.booting) return <BootScreen />;
  if (!session.user) return <Login />;
  if (session.user.mustChangePassword) return <ChangePassword mode="forced" />;
  if (voluntaryChangePassword) {
    return <ChangePassword mode="voluntary" onCancel={() => setVoluntaryChangePassword(false)} />;
  }
  // Full-bleed, own app bar, no sidebar/bottom-nav — see ScreenContent's comment above.
  // `key`: remounts Visit cleanly whenever the target visit changes (fresh 'visit' nav
  // with no id vs. reopening a specific one, or reopening a different one later) —
  // same rationale as FindingDetail's `key={screen.id}` below.
  if (screen.name === 'visit') {
    if (isLocalOnVisit) return null; // redirecting to dashboard (effect above)
    return <Visit key={screen.visitId ?? 'new'} visitId={screen.visitId} />;
  }

  return (
    <div className="app-shell">
      <SideBar user={session.user} onChangePassword={() => setVoluntaryChangePassword(true)} />
      <div className="app-main">
        <Chrome user={session.user} onChangePassword={() => setVoluntaryChangePassword(true)} />
        <main className="app-content" data-screen={screen.name}>
          {isNonAdminOnAdmin ? null : <ScreenContent screen={screen} />}
        </main>
      </div>
      <NavBar role={session.user.role} />
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <NavProvider>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </NavProvider>
    </SessionProvider>
  );
}
