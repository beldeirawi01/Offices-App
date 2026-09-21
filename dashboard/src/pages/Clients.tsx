import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Client } from "../api/client";

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<Client[]>("/clients", { params: search ? { search } : {} })
      .then((res) => setClients(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [search]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    await api.post("/clients", form);
    setForm({ name: "", email: "", phone: "" });
    setShowForm(false);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Clients</h1>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "New client"}</button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={onCreate}>
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <button type="submit">Save</button>
        </form>
      )}

      <input
        className="search-input"
        placeholder="Search clients..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p>Loading...</p>
      ) : (
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
                <td colSpan={3} className="muted">
                  No clients yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
