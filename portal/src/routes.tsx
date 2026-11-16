// Route table. Page paths are at the site root; vercel.json rewrites each
// group listed here to /portal/index.html. When a new top-level path is
// added, add it to vercel.json and scripts/dev-server.mjs too.
import { lazy, Suspense, useMemo } from 'react';
import { createBrowserRouter, Navigate, Outlet, useParams, type RouteObject } from 'react-router-dom';
import { DemoSessionProvider, SessionProvider } from './auth/session';
import { SignIn } from './auth/SignIn';
import { Invite } from './auth/Invite';
import { SelectWorkspace } from './auth/SelectWorkspace';
import { Callback } from './auth/Callback';
import { ResetPassword } from './auth/ResetPassword';
import { AppShell } from './components/AppShell';
import { ApiDataSource } from './data/ApiDataSource';
import { DemoDataSource, isDemoKey } from './data/DemoDataSource';
import { DataSourceProvider } from './data/PortalDataSource';
import { Overview } from './pages/Overview';
import { NotYet } from './pages/NotYet';
import { NotFound } from './pages/NotFound';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { Team } from './pages/settings/Team';
import { Security } from './pages/settings/Security';
import { Profile } from './pages/settings/Profile';
import { Workflows } from './pages/workflows/Workflows';
import { WorkflowDetail } from './pages/workflows/WorkflowDetail';
import { RunDetail } from './pages/workflows/RunDetail';
import { Queue } from './pages/review/Queue';
import { Studio } from './pages/review/Studio';

// Loaded on demand: it is the only screen that needs the QR-code library.
const MfaSetup = lazy(() => import('./auth/MfaSetup').then((m) => ({ default: m.MfaSetup })));

function Root() {
  return <SessionProvider><Outlet /></SessionProvider>;
}

function SignedIn() {
  const source = useMemo(() => new ApiDataSource(), []);
  return <DataSourceProvider value={source}><AppShell /></DataSourceProvider>;
}

// Demo Mode: the same screens over synthetic data. It sits outside <Root>, so
// no session check, cookie or API call is ever made from it.
function Demo() {
  const { vertical } = useParams();
  const which = isDemoKey(vertical) ? vertical : null;
  const source = useMemo(() => (which ? new DemoDataSource(which) : null), [which]);
  if (!source) return <Navigate to="/demo/cre" replace />;
  return <DemoSessionProvider session={source.session}><DataSourceProvider value={source}><AppShell /></DataSourceProvider></DemoSessionProvider>;
}

// The pages inside the shell, shared by /dashboard and /demo/:vertical.
const pages: RouteObject[] = [
  { index: true, element: <Overview />, handle: { title: 'Overview' } },
  { path: 'review', element: <Queue />, handle: { title: 'Review' } },
  { path: 'review/:id', element: <Studio />, handle: { title: 'Review' } },
  { path: 'workflows', element: <Workflows />, handle: { title: 'Workflows' } },
  { path: 'workflows/:id', element: <WorkflowDetail />, handle: { title: 'Workflows' } },
  { path: 'workflows/:id/runs/:runId', element: <RunDetail />, handle: { title: 'Workflows' } },
  { path: 'integrations/*', element: <NotYet section="integrations" />, handle: { title: 'Integrations' } },
  { path: 'vault/*', element: <NotYet section="vault" />, handle: { title: 'Vault' } },
  { path: 'requests/*', element: <NotYet section="requests" />, handle: { title: 'Requests' } },
  {
    path: 'settings',
    element: <SettingsLayout />,
    handle: { title: 'Settings' },
    children: [
      { index: true, element: <Navigate to="team" replace /> },
      { path: 'team', element: <Team /> },
      { path: 'security', element: <Security /> },
      { path: 'profile', element: <Profile /> },
    ],
  },
  { path: '*', element: <NotFound />, handle: { title: 'Not found' } },
];

export const router = createBrowserRouter([
  { path: '/demo', element: <Navigate to="/demo/cre" replace /> },
  { path: '/demo/:vertical', element: <Demo />, children: pages },
  {
    element: <Root />,
    children: [
      { path: '/sign-in', element: <SignIn /> },
      { path: '/login', element: <Navigate to="/sign-in" replace /> },
      { path: '/invite/:token', element: <Invite /> },
      { path: '/auth/callback', element: <Callback /> },
      { path: '/auth/mfa-setup', element: <Suspense fallback={null}><MfaSetup /></Suspense> },
      { path: '/auth/reset', element: <ResetPassword /> },
      { path: '/select-workspace', element: <SelectWorkspace /> },
      {
        path: '/dashboard',
        element: <SignedIn />,
        children: pages,
      },
      { path: '*', element: <Navigate to="/sign-in" replace /> },
    ],
  },
]);
