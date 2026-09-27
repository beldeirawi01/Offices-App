import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, Client, Job, Paginated } from "../api/client";
import { PlusIcon, TrashIcon } from "../components/Icons";

interface DraftLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  kind: "PART" | "LABOR";
}

const emptyLineItem = (): DraftLineItem => ({ description: "", quantity: 1, unitPrice: 0, kind: "PART" });

export default function NewQuote() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedClientId = searchParams.get("clientId") ?? "";
  const preselectedJobId = searchParams.get("jobId") ?? "";

  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clientId, setClientId] = useState(preselectedClientId);
  const [jobId, setJobId] = useState(preselectedJobId);
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([emptyLineItem()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<Paginated<Client>>("/clients", { params: { pageSize: 100 } })
      .then((res) => setClients(res.data.data))
      .catch(() => setError("Could not load your clients. Try reloading the page."));
    api
      .get<Paginated<Job>>("/jobs", { params: { pageSize: 100 } })
      .then((res) => setJobs(res.data.data))
      .catch(() => setError("Could not load your jobs. Try reloading the page."));
  }, []);

  const jobsForClient = jobs.filter((j) => j.client.id === clientId && !j.quote);
  const total = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const updateLineItem = (index: number, patch: Partial<DraftLineItem>) => {
    setLineItems((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeLineItem = (index: number) => {
    setLineItems((items) => items.filter((_, i) => i !== index));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!clientId) {
      setError("Select a client.");
      return;
    }
    const validItems = lineItems.filter((item) => item.description.trim() && item.unitPrice >= 0 && item.quantity > 0);
    if (validItems.length === 0) {
      setError("Add at least one line item with a description.");
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post("/quotes", {
        clientId,
        jobId: jobId || undefined,
        lineItems: validItems,
        notes: notes || undefined,
      });
      navigate(`/quotes/${data.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Could not create quote");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link to="/quotes" className="back-link">
        ← Back to quotes
      </Link>
      <h1>New quote</h1>
      <p className="page-subtitle">Give a client a price before the work starts.</p>

      <form className="card form-card" onSubmit={onSubmit}>
        {error && <div className="error-banner">{error}</div>}

        <div className="form-grid">
          <label>
            Client
            <select value={clientId} onChange={(e) => { setClientId(e.target.value); setJobId(""); }} required>
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Job (optional)
            <select value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={!clientId}>
              <option value="">No specific job</option>
              {jobsForClient.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <div className="line-items-header">
            <span>Description</span>
            <span>Qty</span>
            <span>Unit price</span>
            <span>Kind</span>
            <span></span>
          </div>
          {lineItems.map((item, i) => (
            <div key={i} className="line-item-row">
              <input
                placeholder="e.g. Capacitor replacement (estimated)"
                value={item.description}
                onChange={(e) => updateLineItem(i, { description: e.target.value })}
              />
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={item.quantity}
                onChange={(e) => updateLineItem(i, { quantity: Number(e.target.value) })}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.unitPrice}
                onChange={(e) => updateLineItem(i, { unitPrice: Number(e.target.value) })}
              />
              <select value={item.kind} onChange={(e) => updateLineItem(i, { kind: e.target.value as "PART" | "LABOR" })}>
                <option value="PART">Part</option>
                <option value="LABOR">Labor</option>
              </select>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => removeLineItem(i)}
                disabled={lineItems.length === 1}
                aria-label="Remove line item"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={() => setLineItems((items) => [...items, emptyLineItem()])}>
            <PlusIcon /> Add line item
          </button>
        </div>

        <label>
          Notes for client
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>

        <div className="invoice-totals">
          <div className="total-row">
            <span>Subtotal (tax applied on save)</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create draft quote"}
          </button>
        </div>
      </form>
    </div>
  );
}
