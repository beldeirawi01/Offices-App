import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Offices App</div>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/jobs">Scheduling</NavLink>
          <NavLink to="/clients">Clients</NavLink>
          <NavLink to="/invoices">Invoices</NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="user-name">{user?.name}</div>
          <button onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
