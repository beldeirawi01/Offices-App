import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import {
  BrandMark,
  HomeIcon,
  CalendarIcon,
  CalendarGridIcon,
  UsersIcon,
  QuoteIcon,
  InvoiceIcon,
  TeamIcon,
  SettingsIcon,
  LogoutIcon,
} from "./Icons";

const NAV_ITEMS = [
  { to: "/", labelKey: "nav.dashboard", icon: HomeIcon, end: true },
  { to: "/jobs", labelKey: "nav.scheduling", icon: CalendarIcon },
  { to: "/calendar", labelKey: "nav.calendar", icon: CalendarGridIcon },
  { to: "/clients", labelKey: "nav.clients", icon: UsersIcon },
  { to: "/quotes", labelKey: "nav.quotes", icon: QuoteIcon },
  { to: "/invoices", labelKey: "nav.invoices", icon: InvoiceIcon },
  { to: "/team", labelKey: "nav.team", icon: TeamIcon },
  { to: "/settings", labelKey: "nav.settings", icon: SettingsIcon },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <BrandMark />
          </span>
          Jobscribe
        </div>
        <nav>
          {NAV_ITEMS.map(({ to, labelKey, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon />
              <span>{t(labelKey)}</span>
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
            <LogoutIcon /> {t("nav.logOut")}
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
