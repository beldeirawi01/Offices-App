import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, Client, Invoice, Job } from "../api/client";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import Spinner from "../components/Spinner";

type ClientWithHistory = Client & { jobs: Job[]; invoices: Invoice[] };

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [client, setClient] = useState<ClientWithHistory | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", smsConsent: false, addressLine1: "" });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    api.get<ClientWithHistory>(`/clients/${id}`).then((res) => {
      setClient(res.data);
      setForm({
        name: res.data.name,
        email: res.data.email ?? "",
        phone: res.data.phone ?? "",
        smsConsent: res.data.smsConsent ?? false,
        addressLine1: res.data.addressLine1 ?? "",
      });
    });
  };

  useEffect(load, [id]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/clients/${id}`, {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        smsConsent: form.smsConsent,
        addressLine1: form.addressLine1 || undefined,
      });
      toast.success("Client updated.");
      setEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: "Delete this client?",
      message: `Delete ${client?.name}? This cannot be undone.`,
      confirmLabel: "Delete client",
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.delete(`/clients/${id}`);
      toast.success("Client deleted.");
      navigate("/clients");
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not delete this client — they may still have jobs or invoices.");
      setDeleting(false);
    }
  };

  if (!client) return <Spinner label="Loading client..." />;

  return (
    <div>
      <Link to="/clients" className="back-link">
        ← Back to clients
      </Link>

      <div className="page-header">
        <h1>{client.name}</h1>
        <div className="button-row">
          <button className="btn-secondary" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Edit"}
          </button>
          <button className="btn-danger" onClick={onDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      {editing ? (
        <form className="card form-card" onSubmit={onSave}>
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
            <label>
              Address
              <input
                value={form.addressLine1}
                onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
              />
            </label>
          </div>
          {form.phone && (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.smsConsent}
                onChange={(e) => setForm({ ...form, smsConsent: e.target.checked })}
              />
              Client has agreed to receive text messages at this number
            </label>
          )}
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      ) : (
        <div className="detail-meta card">
          <div>{client.email ?? "No email"}</div>
          <div>{client.phone ?? "No phone"}</div>
          <div>{client.addressLine1 ?? "No address on file"}</div>
          {client.phone && (
            <div className={client.smsConsent ? "consent-yes" : "consent-no"}>
              {client.smsConsent ? "✓ SMS consent on file" : "✗ No SMS consent — texts won't be sent"}
            </div>
          )}
        </div>
      )}

      <section className="panel">
        <h2>Job history</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Scheduled</th>
            </tr>
          </thead>
          <tbody>
            {client.jobs.map((j) => (
              <tr key={j.id}>
                <td>{j.title}</td>
                <td>
                  <span className={`badge badge-${j.status.toLowerCase()}`}>{j.status}</span>
                </td>
                <td>{j.scheduledAt ? new Date(j.scheduledAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
            {client.jobs.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Invoice history</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {client.invoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <Link to={`/invoices/${inv.id}`}>{inv.invoiceNumber}</Link>
                </td>
                <td>
                  <span className={`badge badge-${inv.status.toLowerCase()}`}>{inv.status}</span>
                </td>
                <td>${inv.total.toFixed(2)}</td>
              </tr>
            ))}
            {client.invoices.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No invoices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
