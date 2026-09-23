import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { HomeIcon, CalendarIcon, UsersIcon, InvoiceIcon, TeamIcon, SettingsIcon, LogoutIcon } from "./Icons";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: HomeIcon, end: true },
  { to: "/jobs", label: "Scheduling", icon: CalendarIcon },
  { to: "/clients", label: "Clients", icon: UsersIcon },
  { to: "/invoices", label: "Invoices", icon: InvoiceIcon },
  { to: "/team", label: "Team", icon: TeamIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">O</span>
          Offices App
        </div>
        <nav>
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user?.name?.charAt(0).toUpperCase()}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
          <button className="btn-ghost" onClick={logout}>
            <LogoutIcon /> Log out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
