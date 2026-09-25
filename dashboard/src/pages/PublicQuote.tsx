import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicApi } from "../api/client";
import Spinner from "../components/Spinner";

interface PublicQuoteData {
  quoteNumber: string;
  status: string;
  createdAt: string;
  organizationName: string;
  clientName: string;
  lineItems: { description: string; quantity: number; unitPrice: number; amount: number }[];
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
}

export default function PublicQuote() {
  const { token } = useParams();
  const [quote, setQuote] = useState<PublicQuoteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);

  const load = () => {
    publicApi
      .get<PublicQuoteData>(`/public/quotes/${token}`)
      .then((res) => setQuote(res.data))
      .catch(() => setError("We couldn't find this quote. The link may be incorrect or expired."));
  };

  useEffect(load, [token]);

  const respond = async (action: "accept" | "decline") => {
    setResponding(true);
    try {
      await publicApi.post(`/public/quotes/${token}/${action}`);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Could not submit your response — please try again.");
    } finally {
      setResponding(false);
    }
  };

  if (error) {
    return (
      <div className="public-invoice-page">
        <div className="public-invoice-card">
          <p className="error-banner">{error}</p>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="public-invoice-page">
        <Spinner label="Loading quote..." />
      </div>
    );
  }

  return (
    <div className="public-invoice-page">
      <div className="public-invoice-card">
        <div className="public-invoice-header">
          <h1>{quote.organizationName}</h1>
          <span className={`badge badge-${quote.status.toLowerCase()}`}>{quote.status.toLowerCase()}</span>
        </div>
        <p className="muted">
          Quote {quote.quoteNumber} for {quote.clientName}
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
            {quote.lineItems.map((item, i) => (
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
            <span>${quote.subtotal.toFixed(2)}</span>
          </div>
          <div>
            <span>Tax</span>
            <span>${quote.tax.toFixed(2)}</span>
          </div>
          <div className="total-row">
            <span>Total (estimated)</span>
            <span>${quote.total.toFixed(2)}</span>
          </div>
        </div>

        {quote.notes && (
          <div className="panel">
            <h2>Notes</h2>
            <p>{quote.notes}</p>
          </div>
        )}

        <div className="public-invoice-actions">
          {quote.status === "SENT" && (
            <div className="button-stack" style={{ width: "100%" }}>
              <button type="button" onClick={() => respond("accept")} disabled={responding}>
                {responding ? "Submitting..." : "Accept this quote"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => respond("decline")} disabled={responding}>
                Decline
              </button>
            </div>
          )}
          {quote.status === "ACCEPTED" && (
            <p className="consent-yes">✓ You've accepted this quote. We'll be in touch to schedule the work.</p>
          )}
          {quote.status === "DECLINED" && <p className="consent-no">You've declined this quote.</p>}
        </div>
      </div>
    </div>
  );
}
