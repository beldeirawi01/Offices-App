import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicApi } from "../api/client";

interface PublicInvoiceData {
  invoiceNumber: string;
  status: string;
  createdAt: string;
  dueDate: string | null;
  organizationName: string;
  clientName: string;
  lineItems: { description: string; quantity: number; unitPrice: number; amount: number }[];
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  paymentUrl: string | null;
}

export default function PublicInvoice() {
  const { token } = useParams();
  const [invoice, setInvoice] = useState<PublicInvoiceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicApi
      .get<PublicInvoiceData>(`/public/invoices/${token}`)
      .then((res) => setInvoice(res.data))
      .catch(() => setError("We couldn't find this invoice. The link may be incorrect or expired."));
  }, [token]);

  if (error) {
    return (
      <div className="public-invoice-page">
        <div className="public-invoice-card">
          <p className="error-banner">{error}</p>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="public-invoice-page">
        <p className="muted">Loading invoice...</p>
      </div>
    );
  }

  return (
    <div className="public-invoice-page">
      <div className="public-invoice-card">
        <div className="public-invoice-header">
          <h1>{invoice.organizationName}</h1>
          <span className={`badge badge-${invoice.status.toLowerCase()}`}>{invoice.status}</span>
        </div>
        <p className="muted">
          Invoice {invoice.invoiceNumber} for {invoice.clientName}
        </p>

        <table className="data-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((item, i) => (
              <tr key={i}>
                <td>{item.description}</td>
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

        <div className="public-invoice-actions">
          {invoice.paymentUrl && (
            <a href={invoice.paymentUrl} className="pay-now-button">
              Pay ${invoice.total.toFixed(2)} now
            </a>
          )}
          {invoice.status === "PAID" && <p className="consent-yes">✓ This invoice has been paid. Thank you!</p>}
          <a
            href={`${((import.meta.env.VITE_API_BASE_URL as string) ?? "http://localhost:4000/api").replace(/\/$/, "")}/public/invoices/${token}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="download-pdf-link"
          >
            Download PDF
          </a>
        </div>
      </div>
    </div>
  );
}
