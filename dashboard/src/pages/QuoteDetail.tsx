import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, Quote } from "../api/client";
import { useToast } from "../components/Toast";
import Spinner from "../components/Spinner";

type QuoteDetailData = Quote & {
  deliveries: { channel: string; recipient: string; success: boolean }[];
};

const APP_BASE_URL = (import.meta.env.VITE_APP_BASE_URL as string | undefined) ?? window.location.origin;

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [quote, setQuote] = useState<QuoteDetailData | null>(null);
  const [sending, setSending] = useState(false);
  const [converting, setConverting] = useState(false);

  const load = () => {
    api
      .get<QuoteDetailData>(`/quotes/${id}`)
      .then((res) => setQuote(res.data))
      .catch((err) => {
        toast.error(err?.response?.data?.error ?? "Could not load this quote");
        navigate("/quotes");
      });
  };

  useEffect(load, [id]);

  const onSend = async () => {
    setSending(true);
    try {
      await api.post(`/quotes/${id}/send`);
      toast.success("Quote sent to client.");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to send quote");
    } finally {
      setSending(false);
    }
  };

  const onConvert = async () => {
    setConverting(true);
    try {
      const { data } = await api.post(`/quotes/${id}/convert-to-invoice`);
      toast.success("Converted to an invoice.");
      navigate(`/invoices/${data.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not convert this quote");
    } finally {
      setConverting(false);
    }
  };

  if (!quote) return <Spinner label="Loading quote..." />;

  const publicUrl = `${APP_BASE_URL}/quotes/view/${quote.publicToken}`;
  const canSend = quote.status === "DRAFT" || quote.status === "SENT";

  return (
    <div>
      <Link to="/quotes" className="back-link">
        ← Back to quotes
      </Link>
      <div className="page-header">
        <div>
          <h1>{quote.quoteNumber}</h1>
          <p className="page-subtitle">
            For <Link to={`/clients/${quote.client.id}`}>{quote.client.name}</Link>
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
                {quote.lineItems.map((item) => (
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

          {quote.notes && (
            <div className="panel">
              <h2>Notes</h2>
              <p>{quote.notes}</p>
            </div>
          )}

          {quote.deliveries?.length > 0 && (
            <div className="panel">
              <h2>Delivery log</h2>
              <ul className="delivery-log">
                {quote.deliveries.map((d, i) => (
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
          <div className="panel invoice-summary-card">
            <span className={`badge badge-${quote.status.toLowerCase()}`}>{quote.status.toLowerCase()}</span>

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
                <span>Total</span>
                <span>${quote.total.toFixed(2)}</span>
              </div>
            </div>

            <div className="button-stack">
              {canSend && (
                <button onClick={onSend} disabled={sending}>
                  {sending ? "Sending..." : quote.status === "SENT" ? "Resend" : "Send to client"}
                </button>
              )}
              {quote.status === "ACCEPTED" && (
                <button onClick={onConvert} disabled={converting}>
                  {converting ? "Converting..." : "Convert to invoice"}
                </button>
              )}
              {quote.status === "CONVERTED" && quote.convertedInvoiceId && (
                <Link to={`/invoices/${quote.convertedInvoiceId}`}>
                  <button type="button" className="btn-secondary" style={{ width: "100%", justifyContent: "center" }}>
                    View invoice
                  </button>
                </Link>
              )}
            </div>
          </div>

          {(quote.status === "SENT" || quote.status === "ACCEPTED" || quote.status === "DECLINED") && (
            <div className="panel">
              <h2>Client-facing link</h2>
              <p className="muted">This is the branded page the client sees to accept or decline.</p>
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
