// The signed-in frame: workspace switcher and navigation on the left, a top
// bar with search and the user menu, the page in the middle.
//
// Navigation is filtered by the permissions that arrive with the session.
// Hiding a link is a convenience only; the API refuses the same things.
import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useMatches, useNavigate } from 'react-router-dom';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  Building2, Check, ChevronsUpDown, ClipboardCheck, FolderLock, LayoutDashboard, LogOut, Menu as MenuIcon,
  MessagesSquare, PanelLeft, Plug, Search, Settings, ShieldAlert, Workflow, type LucideIcon,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../auth/session';
import { useData } from '../data/PortalDataSource';
import { initials } from '../auth/SelectWorkspace';
import { ROLE_LABEL } from '../lib/roles';
import { verticalPack } from '../verticals';
import { CommandPalette } from './CommandPalette';
import '../styles/shell.css';

/** `to` is relative to the data source's base ('/dashboard' or '/demo/<vertical>'). */
export interface NavItem { to: string; label: string; icon: LucideIcon; permission?: string; end?: boolean }

export const NAV: NavItem[] = [
  { to: '', label: 'Overview', icon: LayoutDashboard, permission: 'overview.view', end: true },
  { to: '/review', label: 'Review', icon: ClipboardCheck, permission: 'review.view' },
  { to: '/workflows', label: 'Workflows', icon: Workflow, permission: 'workflows.view' },
  { to: '/integrations', label: 'Integrations', icon: Plug, permission: 'connectors.view' },
  { to: '/vault', label: 'Vault', icon: FolderLock, permission: 'vault.view' },
  { to: '/requests', label: 'Requests', icon: MessagesSquare, permission: 'requests.create' },
];
export const NAV_FOOT: NavItem[] = [{ to: '/settings', label: 'Settings', icon: Settings }];

function PageSkeleton() {
  return (
    <div className="page" aria-busy="true">
      <span className="skeleton" style={{ height: 28, width: 220 }} />
      <span className="skeleton" style={{ height: 180 }} />
    </div>
  );
}

export function AppShell() {
  const { session, status, ending, can, switchWorkspace, signOut } = useSession();
  const data = useData();
  const queryClient = useQueryClient();
  const base = data.base;
  // Same query as the Review page's first tab, so the two never disagree.
  const queue = useQuery({
    queryKey: ['review', session?.org?.id, 'queued'], queryFn: () => data.getReviewList('queued'),
    enabled: !!session?.org && can('review.view'),
  });
  const location = useLocation();
  const navigate = useNavigate();
  const matches = useMatches();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('mf.nav') === 'collapsed'; } catch { return false; } });
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => { setNavOpen(false); }, [location.pathname]);
  useEffect(() => { try { localStorage.setItem('mf.nav', collapsed ? 'collapsed' : 'open'); } catch { /* private mode */ } }, [collapsed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const title = [...matches].reverse().map((m) => (m.handle as { title?: string } | undefined)?.title).find(Boolean) ?? 'Overview';
  useEffect(() => { document.title = `${title} | MonkFlow`; }, [title]);

  // ── Guards ──
  if (status === 'loading' || ending) return <PageSkeleton />;
  const here = encodeURIComponent(location.pathname + location.search);
  if (!session) return <Navigate to={`/sign-in?next=${here}`} replace />;
  if (session.mfaSetupRequired) return <Navigate to={`/auth/mfa-setup?next=${here}`} replace />;
  if (!session.org) {
    if (session.workspaces.length === 0 && session.user.isPlatformAdmin) { window.location.replace('/admin'); return <PageSkeleton />; }
    return <Navigate to={`/select-workspace?next=${here}`} replace />;
  }

  const org = session.org;
  const pack = verticalPack(org.vertical);
  const at = (i: NavItem): NavItem => ({ ...i, to: base + i.to });
  const nav = NAV.filter((i) => !i.permission || can(i.permission)).map(at);
  const foot = NAV_FOOT.map(at);
  const waiting = queue.data?.counts.queued ?? 0;
  const name = `${session.user.firstName} ${session.user.lastName}`.trim() || session.user.email;
  const isStaff = session.role === 'monkflow_staff';

  const pick = async (id: string) => {
    if (id === org.id) return;
    await switchWorkspace(id);
    navigate(base);
  };

  const link = (item: NavItem) => (
    <NavLink key={item.to} to={item.to} end={item.end} className="nav-link" title={collapsed ? item.label : undefined}>
      <item.icon aria-hidden /><span>{item.label}</span>
      {item.label === 'Review' && waiting > 0 && <span className="count num" aria-label={`${waiting} waiting for review`}>{waiting}</span>}
    </NavLink>
  );

  return (
    <div className="shell" data-collapsed={collapsed} data-nav-open={navOpen} onClick={(e) => { if (navOpen && e.target === e.currentTarget) setNavOpen(false); }}>
      <aside className="sidebar">
        <Menu.Root>
          <Menu.Trigger className="ws-switch" aria-label={`Workspace: ${org.name}. Switch workspace`}>
            <span className="ws-avatar" aria-hidden>{initials(org.name)}</span>
            <span className="grow"><span className="name">{org.name}</span><span className="sub">{pack.label}</span></span>
            <ChevronsUpDown aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content className="menu" align="start" sideOffset={4} style={{ minWidth: 260 }}>
              <div className="menu-label">Workspaces</div>
              {session.workspaces.map((w) => (
                <Menu.Item key={w.id} className="menu-item" onSelect={() => void pick(w.id)}>
                  <Building2 aria-hidden />
                  <span className="grow">{w.name}<br /><span className="muted" style={{ fontSize: 'var(--text-sm)' }}>{verticalPack(w.vertical).label}</span></span>
                  {w.id === org.id && <Check aria-hidden />}
                </Menu.Item>
              ))}
              {isStaff && !session.workspaces.some((w) => w.id === org.id) && (
                <Menu.Item className="menu-item" disabled><Building2 aria-hidden /><span className="grow">{org.name}</span><Check aria-hidden /></Menu.Item>
              )}
              {session.user.isPlatformAdmin && (
                <>
                  <div className="menu-sep" />
                  <Menu.Item className="menu-item" onSelect={() => window.location.assign('/admin')}><ShieldAlert aria-hidden />MonkFlow admin console</Menu.Item>
                </>
              )}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>

        <nav className="nav" aria-label="Main">
          {nav.map(link)}
          <div className="nav-spacer" />
        </nav>
        <div className="sidebar-foot">{foot.map(link)}</div>
      </aside>

      <div className="main">
        {data.demo && (
          <div className="demo-banner" role="status">
            <span><strong>Demo workspace</strong> · synthetic data · nothing is saved</span>
            <span className="grow" />
            <button type="button" className="link-btn" onClick={() => { data.reset?.(); queryClient.clear(); navigate(base); }}>Reset demo</button>
            <a href="/book">Book a working session</a>
          </div>
        )}
        {isStaff && (
          <div className="staff-banner" role="status">
            <ShieldAlert aria-hidden />You are in {org.name} as MonkFlow staff. Everything you do here is recorded in this client's audit log.
          </div>
        )}
        <header className="topbar">
          <button type="button" className="btn btn-ghost btn-icon menu-btn" aria-label="Open navigation" onClick={() => setNavOpen(true)}><MenuIcon aria-hidden /></button>
          <button type="button" className="btn btn-ghost btn-icon collapse-btn" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={collapsed} onClick={() => setCollapsed((v) => !v)} style={{ marginLeft: -8 }}>
            <PanelLeft aria-hidden />
          </button>
          <div className="topbar-title">{title}</div>
          <div className="grow" />
          <button type="button" className="palette-trigger" onClick={() => setPaletteOpen(true)} aria-label="Search or jump to a page">
            <Search aria-hidden /><span className="grow">Jump to…</span><kbd>⌘K</kbd>
          </button>
          <Menu.Root>
            <Menu.Trigger className="user-btn" aria-label={`Account menu for ${name}`}>
              <span className="avatar" aria-hidden>{initials(name)}</span><span className="name">{session.user.firstName || name}</span>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content className="menu" align="end" sideOffset={6}>
                <div style={{ padding: '8px 8px 6px' }}>
                  <div style={{ fontWeight: 600 }}>{name}</div>
                  <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>{session.user.email}</div>
                  <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>{session.role ? ROLE_LABEL[session.role] : ''}</div>
                </div>
                <div className="menu-sep" />
                <Menu.Item className="menu-item" onSelect={() => navigate(`${base}/settings`)}><Settings aria-hidden />Settings</Menu.Item>
                <Menu.Item className="menu-item" onSelect={() => void signOut()}><LogOut aria-hidden />{data.demo ? 'Leave the demo' : 'Sign out'}</Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </header>
        <Outlet />
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={[...nav, ...foot]} />
    </div>
  );
}
