import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: 'team', label: 'Team' },
  { to: 'security', label: 'Security' },
  { to: 'profile', label: 'Your profile' },
];

export function SettingsLayout() {
  return (
    <div className="page">
      <div className="page-head"><div><h1>Settings</h1></div></div>
      <nav className="tabs" aria-label="Settings sections">
        {TABS.map((t) => <NavLink key={t.to} to={t.to} className="tab">{t.label}</NavLink>)}
      </nav>
      <Outlet />
    </div>
  );
}
