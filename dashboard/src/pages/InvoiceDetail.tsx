import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Invoice, Organization } from "../api/client";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import Spinner from "../components/Spinner";

type InvoiceDetailData = Invoice & {
  deliveries: { channel: string; recipient: string; success: boolean }[];
};

const APP_BASE_URL = (import.meta.env.VITE_APP_BASE_URL as string | undefined) ?? window.location.origin;

export default function InvoiceDetail() {
  const { id } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [invoice, setInvoice] = useState<InvoiceDetailData | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [sending, setSending] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);

  const load = () => {
    api.get<InvoiceDetailData>(`/invoices/${id}`).then((res) => setInvoice(res.data));
  };

  useEffect(load, [id]);
  useEffect(() => {
    api.get<Organization>("/organizations/me").then((res) => setOrg(res.data));
  }, []);

  const onSend = async () => {
    setSending(true);
    try {
      await api.post(`/invoices/${id}/send`);
      toast.success("Invoice sent to client.");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to send invoice");
    } finally {
      setSending(false);
    }
  };

  const onVoid = async () => {
    const ok = await confirm({
      title: "Void this invoice?",
      message: "This can't be undone.",
      confirmLabel: "Void invoice",
      danger: true,
    });
    if (!ok) return;
    setVoiding(true);
    try {
      await api.post(`/invoices/${id}/void`);
      toast.success("Invoice voided.");
      load();
    } finally {
      setVoiding(false);
    }
  };

  const onMarkPaid = async () => {
    const ok = await confirm({
      title: "Mark as paid?",
      message: "Use this only if the client paid outside Stripe (cash, check, etc).",
      confirmLabel: "Mark as paid",
    });
    if (!ok) return;
    setMarkingPaid(true);
    try {
      await api.post(`/invoices/${id}/mark-paid`);
      toast.success("Invoice marked as paid.");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not mark invoice as paid");
    } finally {
      setMarkingPaid(false);
    }
  };

  const onDownloadPdf = async () => {
    const res = await api.get(`/invoices/${id}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${invoice?.invoiceNumber ?? "invoice"}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!invoice) return <Spinner label="Loading invoice..." />;

  const publicUrl = `${APP_BASE_URL}/pay/${invoice.publicToken}`;
  const canSend = invoice.status === "DRAFT" || invoice.status === "SENT" || invoice.status === "OVERDUE";
  const canVoid = invoice.status !== "PAID" && invoice.status !== "VOID";
  const stripeNotReady = org != null && !org.stripeChargesEnabled;
  const showStripeWarning = stripeNotReady && (invoice.status === "DRAFT" || invoice.status === "OVERDUE");

  return (
    <div>
      <Link to="/invoices" className="back-link">
        ← Back to invoices
      </Link>
      <div className="page-header">
        <div>
          <h1>{invoice.invoiceNumber}</h1>
          <p className="page-subtitle">
            Billed to <Link to={`/clients/${invoice.client.id}`}>{invoice.client.name}</Link>
          </p>
        </div>
      </div>

      <div className="invoice-layout">
        <div className="invoice-main">
          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Kind</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td>{item.kind}</td>
                    <td>{item.quantity}</td>
                    <td>${item.unitPrice.toFixed(2)}</td>
                    <td>${item.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {invoice.notes && (
            <div className="panel">
              <h2>Notes</h2>
              <p>{invoice.notes}</p>
            </div>
          )}

          {invoice.deliveries?.length > 0 && (
            <div className="panel">
              <h2>Delivery log</h2>
              <ul className="delivery-log">
                {invoice.deliveries.map((d, i) => (
                  <li key={i}>
                    <span>
                      {d.channel} to {d.recipient}
                    </span>
                    <span className={d.success ? "consent-yes" : "consent-no"}>
                      {d.success ? "Delivered" : "Failed"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="invoice-sidebar">
          {showStripeWarning && (
            <div className="error-banner" style={{ marginBottom: 16 }}>
              Connect your Stripe account in <Link to="/settings">Settings</Link> before sending invoices — clients
              can't pay you until that's done.
            </div>
          )}

          <div className="panel invoice-summary-card">
            <span className={`badge badge-${invoice.status.toLowerCase()}`}>{invoice.status}</span>

            <div className="invoice-totals">
              <div>
                <span>Subtotal</span>
                <span>${invoice.subtotal.toFixed(2)}</span>
              </div>
              <div>
                <span>Tax</span>
                <span>${invoice.tax.toFixed(2)}</span>
              </div>
              <div className="total-row">
                <span>Total</span>
                <span>${invoice.total.toFixed(2)}</span>
              </div>
            </div>

            <div className="button-stack">
              {invoice.status === "DRAFT" && (
                <button onClick={onSend} disabled={sending || stripeNotReady}>
                  {sending ? "Sending..." : "Send to client"}
                </button>
              )}
              {invoice.status === "OVERDUE" && (
                <button onClick={onSend} disabled={sending || stripeNotReady}>
                  {sending ? "Sending..." : "Resend reminder"}
                </button>
              )}
              <button className="btn-secondary" onClick={onDownloadPdf}>
                Download PDF
              </button>
              {(invoice.status === "SENT" || invoice.status === "OVERDUE") && (
                <button className="btn-secondary" onClick={onMarkPaid} disabled={markingPaid}>
                  {markingPaid ? "Saving..." : "Mark as paid (cash/check)"}
                </button>
              )}
              {canVoid && (
                <button className="btn-danger" onClick={onVoid} disabled={voiding}>
                  {voiding ? "Voiding..." : "Void invoice"}
                </button>
              )}
            </div>
          </div>

          {canSend && (
            <div className="panel">
              <h2>Client-facing link</h2>
              <p className="muted">This is the branded page the client sees when you send this invoice.</p>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="public-link">
                {publicUrl}
              </a>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
