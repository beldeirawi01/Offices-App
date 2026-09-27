import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Client, Job, Paginated, Tech } from "../api/client";
import Pagination from "../components/Pagination";
import EmptyState from "../components/EmptyState";
import Spinner from "../components/Spinner";
import { useToast } from "../components/Toast";
import { PlusIcon } from "../components/Icons";

const STATUS_OPTIONS: Job["status"][] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export default function Jobs() {
  const toast = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [clients, setClients] = useState<Client[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientId: "", title: "", jobType: "", scheduledAt: "", assignedTechId: "", recurrenceIntervalMonths: "" });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = (page = 1) => {
    setLoading(true);
    api
      .get<Paginated<Job>>("/jobs", { params: { page } })
      .then((res) => {
        setJobs(res.data.data);
        setPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages });
      })
      .catch((err) => toast.error(err?.response?.data?.error ?? "Could not load jobs"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(1);
    api
      .get<Paginated<Client>>("/clients", { params: { pageSize: 100 } })
      .then((res) => setClients(res.data.data))
      .catch(() => toast.error("Could not load clients"));
    api
      .get<Tech[]>("/users")
      .then((res) => setTechs(res.data))
      .catch(() => toast.error("Could not load the team list"));
  }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    await api.post("/jobs", {
      clientId: form.clientId,
      title: form.title,
      jobType: form.jobType || undefined,
      scheduledAt: form.scheduledAt || undefined,
      assignedTechId: form.assignedTechId || undefined,
      recurrenceIntervalMonths: form.recurrenceIntervalMonths ? Number(form.recurrenceIntervalMonths) : undefined,
    });
    setForm({ clientId: "", title: "", jobType: "", scheduledAt: "", assignedTechId: "", recurrenceIntervalMonths: "" });
    setShowForm(false);
    toast.success("Job scheduled.");
    load(1);
  };

  const onStatusChange = async (jobId: string, status: Job["status"]) => {
    setUpdatingId(jobId);
    try {
      await api.put(`/jobs/${jobId}`, { status });
      load(pagination.page);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Scheduling</h1>
          <p className="page-subtitle">Upcoming and past jobs across your whole team.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : <><PlusIcon /> New job</>}
        </button>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={onCreate}>
          <div className="form-grid">
            <label>
              Client
              <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required>
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Job title
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label>
              Job type
              <input
                placeholder="e.g. HVAC repair"
                value={form.jobType}
                onChange={(e) => setForm({ ...form, jobType: e.target.value })}
              />
            </label>
            <label>
              Scheduled for
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              />
            </label>
            <label>
              Assigned tech
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
            </label>
            <label>
              Rebook reminder (months)
              <input
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 6 for a recurring service"
                value={form.recurrenceIntervalMonths}
                onChange={(e) => setForm({ ...form, recurrenceIntervalMonths: e.target.value })}
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit">Save job</button>
          </div>
        </form>
      )}

      {loading ? (
        <Spinner label="Loading jobs..." />
      ) : jobs.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          message="Schedule your first job to get started."
          action={
            <button onClick={() => setShowForm(true)}>
              <PlusIcon /> New job
            </button>
          }
        />
      ) : (
        <>
          <div className="card">
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
                    <td>
                      <Link to={`/jobs/${j.id}`}>{j.title}</Link>
                    </td>
                    <td>
                      <Link to={`/clients/${j.client.id}`}>{j.client.name}</Link>
                    </td>
                    <td>{j.assignedTech?.name ?? "Unassigned"}</td>
                    <td>{j.scheduledAt ? new Date(j.scheduledAt).toLocaleString() : "—"}</td>
                    <td>
                      <select
                        className={`status-select badge-${j.status.toLowerCase()}`}
                        value={j.status}
                        disabled={updatingId === j.id}
                        onChange={(e) => onStatusChange(j.id, e.target.value as Job["status"])}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s.replace("_", " ")}
                          </option>
                        ))}
                      </select>
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
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={load} />
        </>
      )}
    </div>
  );
}
