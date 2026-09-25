import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, Client, Job, Paginated, Tech } from "../api/client";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import Spinner from "../components/Spinner";
import { TrashIcon } from "../components/Icons";

const STATUS_OPTIONS: Job["status"][] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [job, setJob] = useState<Job | null>(null);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: "",
    jobType: "",
    status: "SCHEDULED" as Job["status"],
    scheduledAt: "",
    assignedTechId: "",
    addressLine1: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    api.get<Job>(`/jobs/${id}`).then((res) => {
      setJob(res.data);
      setForm({
        title: res.data.title,
        jobType: res.data.jobType ?? "",
        status: res.data.status,
        scheduledAt: res.data.scheduledAt ? res.data.scheduledAt.slice(0, 16) : "",
        assignedTechId: res.data.assignedTechId ?? "",
        addressLine1: res.data.addressLine1 ?? "",
      });
    });
  };

  useEffect(load, [id]);
  useEffect(() => {
    api.get<Tech[]>("/users").then((res) => setTechs(res.data));
  }, []);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/jobs/${id}`, {
        title: form.title,
        jobType: form.jobType || undefined,
        status: form.status,
        scheduledAt: form.scheduledAt || undefined,
        assignedTechId: form.assignedTechId || undefined,
        addressLine1: form.addressLine1 || undefined,
      });
      toast.success("Job updated.");
      setEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: "Delete this job?",
      message: `Delete job "${job?.title}"? This cannot be undone.`,
      confirmLabel: "Delete job",
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.delete(`/jobs/${id}`);
      toast.success("Job deleted.");
      navigate("/jobs");
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not delete this job.");
      setDeleting(false);
    }
  };

  if (!job) return <Spinner label="Loading job..." />;

  return (
    <div>
      <Link to="/jobs" className="back-link">
        ← Back to scheduling
      </Link>

      <div className="page-header">
        <h1>{job.title}</h1>
        <div className="button-row">
          <button className="btn-secondary" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Edit"}
          </button>
          <button className="btn-danger" onClick={onDelete} disabled={deleting}>
            <TrashIcon /> {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      {editing ? (
        <form className="card form-card" onSubmit={onSave}>
          <div className="form-grid">
            <label>
              Title
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label>
              Job type
              <input value={form.jobType} onChange={(e) => setForm({ ...form, jobType: e.target.value })} />
            </label>
            <label>
              Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Job["status"] })}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
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
              <select value={form.assignedTechId} onChange={(e) => setForm({ ...form, assignedTechId: e.target.value })}>
                <option value="">Unassigned</option>
                {techs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Address
              <input value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      ) : (
        <div className="card info-grid">
          <div className="info-item">
            <span className="info-label">Client</span>
            <span className="info-value">
              <Link to={`/clients/${job.client.id}`}>{job.client.name}</Link>
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Status</span>
            <span className="info-value">
              <span className={`badge badge-${job.status.toLowerCase()}`}>{job.status.replace("_", " ").toLowerCase()}</span>
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Assigned tech</span>
            <span className="info-value">{job.assignedTech?.name ?? "Unassigned"}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Scheduled</span>
            <span className="info-value">
              {job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : "Not scheduled"}
            </span>
          </div>
          {job.jobType && (
            <div className="info-item">
              <span className="info-label">Job type</span>
              <span className="info-value">{job.jobType}</span>
            </div>
          )}
          {job.addressLine1 && (
            <div className="info-item">
              <span className="info-label">Address</span>
              <span className="info-value">{job.addressLine1}</span>
            </div>
          )}
        </div>
      )}

      <section className="panel">
        <h2>Quote</h2>
        {job.quote ? (
          <p>
            <Link to={`/quotes/${job.quote.id}`}>{job.quote.quoteNumber}</Link> —{" "}
            <span className={`badge badge-${job.quote.status.toLowerCase()}`}>{job.quote.status.toLowerCase()}</span> — $
            {job.quote.total.toFixed(2)}
          </p>
        ) : (
          <div>
            <p className="muted">No quote yet for this job.</p>
            <Link to={`/quotes/new?clientId=${job.client.id}&jobId=${job.id}`}>
              <button type="button">+ Create quote for this job</button>
            </Link>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Invoice</h2>
        {job.invoice ? (
          <p>
            <Link to={`/invoices/${job.invoice.id}`}>{job.invoice.invoiceNumber}</Link> —{" "}
            <span className={`badge badge-${job.invoice.status.toLowerCase()}`}>{job.invoice.status}</span> — $
            {job.invoice.total.toFixed(2)}
          </p>
        ) : (
          <div>
            <p className="muted">No invoice yet for this job.</p>
            <Link to={`/invoices/new?clientId=${job.client.id}&jobId=${job.id}`}>
              <button type="button">+ Create invoice for this job</button>
            </Link>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Voice notes</h2>
        {job.voiceNotes && job.voiceNotes.length > 0 ? (
          <ul className="bar-list">
            {job.voiceNotes.map((vn) => (
              <li key={vn.id}>
                <span>
                  {vn.purpose === "QUOTE" ? "Quote" : "Invoice"} note — {new Date(vn.createdAt).toLocaleString()}
                </span>
                <span className={`badge ${vn.status === "FAILED" ? "badge-overdue" : "badge-scheduled"}`}>{vn.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No voice notes recorded for this job yet.</p>
        )}
        {job.voiceNotes?.some((vn) => vn.transcript) && (
          <div className="panel nested-panel">
            <h2>Transcript</h2>
            <p className="muted">{job.voiceNotes.find((vn) => vn.transcript)?.transcript}</p>
          </div>
        )}
      </section>
    </div>
  );
}
