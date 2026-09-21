import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Client, Paginated } from "../api/client";
import Pagination from "../components/Pagination";

const emptyForm = { name: "", email: "", phone: "", smsConsent: false };

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);

  const load = (page = 1) => {
    setLoading(true);
    api
      .get<Paginated<Client>>("/clients", { params: { search: search || undefined, page } })
      .then((res) => {
        setClients(res.data.data);
        setPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => load(1), [search]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    await api.post("/clients", {
      name: form.name,
      email: form.email || undefined,
      phone: form.phone || undefined,
      smsConsent: form.smsConsent,
    });
    setForm(emptyForm);
    setShowForm(false);
    load(1);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p className="page-subtitle">Every customer you've done work for, in one place.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "+ New client"}</button>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={onCreate}>
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
              />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
          </div>
          {form.phone && (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.smsConsent}
                onChange={(e) => setForm({ ...form, smsConsent: e.target.checked })}
              />
              Client has agreed to receive text messages (invoices, reminders) at this number
            </label>
          )}
          <div className="form-actions">
            <button type="submit">Save client</button>
          </div>
        </form>
      )}

      <input
        className="search-input"
        placeholder="Search by name, email, or phone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/clients/${c.id}`}>{c.name}</Link>
                    </td>
                    <td>{c.email ?? "—"}</td>
                    <td>{c.phone ?? "—"}</td>
                  </tr>
                ))}
                {clients.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted empty-cell">
                      No clients yet — add your first one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={load} />
        </>
      )}
    </div>
  );
}
