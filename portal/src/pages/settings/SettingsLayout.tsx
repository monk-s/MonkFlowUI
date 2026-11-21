import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../../auth/session';

const TABS = [
  { to: 'team', label: 'Team' },
  { to: 'security', label: 'Security' },
  { to: 'audit', label: 'Audit log', needs: 'audit.view' },
  { to: 'profile', label: 'Your profile' },
];

export function SettingsLayout() {
  const { can } = useSession();
  return (
    <div className="page">
      <div className="page-head"><div><h1>Settings</h1></div></div>
      <nav className="tabs" aria-label="Settings sections">
        {TABS.filter((t) => !('needs' in t) || can(t.needs!)).map((t) => <NavLink key={t.to} to={t.to} className="tab">{t.label}</NavLink>)}
      </nav>
      <Outlet />
    </div>
  );
}
