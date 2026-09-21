import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Client, Job } from "../api/client";

interface TechOption {
  id: string;
  name: string;
}

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [techs, setTechs] = useState<TechOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientId: "", title: "", jobType: "", scheduledAt: "", assignedTechId: "" });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<Job[]>("/jobs")
      .then((res) => setJobs(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get<Client[]>("/clients").then((res) => setClients(res.data));
    api.get<TechOption[]>("/users").then((res) => setTechs(res.data));
  }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    await api.post("/jobs", {
      clientId: form.clientId,
      title: form.title,
      jobType: form.jobType || undefined,
      scheduledAt: form.scheduledAt || undefined,
      assignedTechId: form.assignedTechId || undefined,
    });
    setForm({ clientId: "", title: "", jobType: "", scheduledAt: "", assignedTechId: "" });
    setShowForm(false);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Scheduling</h1>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "New job"}</button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={onCreate}>
          <select
            value={form.clientId}
            onChange={(e) => setForm({ ...form, clientId: e.target.value })}
            required
          >
            <option value="">Select client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Job title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <input
            placeholder="Job type (e.g. HVAC repair)"
            value={form.jobType}
            onChange={(e) => setForm({ ...form, jobType: e.target.value })}
          />
          <input
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
          />
          <select
            value={form.assignedTechId}
            onChange={(e) => setForm({ ...form, assignedTechId: e.target.value })}
          >
            <option value="">Unassigned</option>
            {techs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="submit">Save</button>
        </form>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Client</th>
              <th>Tech</th>
              <th>Scheduled</th>
              <th>Status</th>
              <th>Invoice</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>{j.title}</td>
                <td>
                  <Link to={`/clients/${j.client.id}`}>{j.client.name}</Link>
                </td>
                <td>{j.assignedTech?.name ?? "Unassigned"}</td>
                <td>{j.scheduledAt ? new Date(j.scheduledAt).toLocaleString() : "—"}</td>
                <td>
                  <span className={`badge badge-${j.status.toLowerCase()}`}>{j.status}</span>
                </td>
                <td>
                  {j.invoice ? (
                    <Link to={`/invoices/${j.invoice.id}`}>{j.invoice.invoiceNumber}</Link>
                  ) : (
                    <span className="muted">None yet</span>
                  )}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
