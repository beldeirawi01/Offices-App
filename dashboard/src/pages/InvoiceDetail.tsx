import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Invoice } from "../api/client";

type InvoiceDetailData = Invoice & {
  deliveries: { channel: string; recipient: string; success: boolean }[];
};

export default function InvoiceDetail() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<InvoiceDetailData | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => {
    api.get<InvoiceDetailData>(`/invoices/${id}`).then((res) => setInvoice(res.data));
  };

  useEffect(load, [id]);

  const onSend = async () => {
    setSending(true);
    setMessage(null);
    try {
      await api.post(`/invoices/${id}/send`);
      setMessage("Invoice sent to client.");
      load();
    } catch (err: any) {
      setMessage(err?.response?.data?.error ?? "Failed to send invoice");
    } finally {
      setSending(false);
    }
  };

  if (!invoice) return <p>Loading...</p>;

  return (
    <div>
      <Link to="/invoices">← Back to invoices</Link>
      <div className="page-header">
        <h1>{invoice.invoiceNumber}</h1>
        <span className={`badge badge-${invoice.status.toLowerCase()}`}>{invoice.status}</span>
      </div>

      <p>
        Client: <Link to={`/clients/${invoice.client.id}`}>{invoice.client.name}</Link>
      </p>

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

      {invoice.notes && (
        <div className="panel">
          <h2>Notes</h2>
          <p>{invoice.notes}</p>
        </div>
      )}

      {invoice.status === "DRAFT" && (
        <button onClick={onSend} disabled={sending}>
          {sending ? "Sending..." : "Send to client"}
        </button>
      )}
      {message && <p className="muted">{message}</p>}

      {invoice.deliveries?.length > 0 && (
        <div className="panel">
          <h2>Delivery log</h2>
          <ul>
            {invoice.deliveries.map((d, i) => (
              <li key={i}>
                {d.channel} to {d.recipient}: {d.success ? "delivered" : "failed"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
