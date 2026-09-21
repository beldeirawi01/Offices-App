import { FormEvent, useEffect, useState } from "react";
import { api, Tech } from "../api/client";
import { useAuth } from "../context/AuthContext";

const emptyForm = { name: "", email: "", password: "", phone: "", role: "TECH" as "TECH" | "OWNER" };

export default function Team() {
  const { user } = useAuth();
  const [techs, setTechs] = useState<Tech[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<Tech[]>("/users")
      .then((res) => setTechs(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post("/users", form);
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Could not add team member");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Team</h1>
          <p className="page-subtitle">Techs and owners who can log into this business.</p>
        </div>
        {user?.role === "OWNER" && (
          <button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "+ Invite team member"}</button>
        )}
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={onCreate}>
          {error && <div className="error-banner">{error}</div>}
          <div className="form-grid">
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>
            <label>
              Temporary password
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={8}
                required
              />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label>
              Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "TECH" | "OWNER" })}>
                <option value="TECH">Tech</option>
                <option value="OWNER">Owner</option>
              </select>
            </label>
          </div>
          <p className="muted small">
            Share this email and temporary password with them directly — they can use it to log into the mobile app.
          </p>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Adding..." : "Add team member"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {techs.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.email}</td>
                  <td>
                    <span className={`badge ${t.role === "OWNER" ? "badge-paid" : "badge-scheduled"}`}>{t.role}</span>
                  </td>
                  <td>{t.phone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
