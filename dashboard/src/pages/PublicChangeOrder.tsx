import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicApi } from "../api/client";
import Spinner from "../components/Spinner";
import SignatureCanvas from "../components/SignatureCanvas";

interface PublicChangeOrderData {
  description: string;
  amount: number;
  status: "PENDING" | "APPROVED" | "DECLINED";
  createdAt: string;
  organizationName: string;
  clientName: string;
  jobTitle: string;
}

export default function PublicChangeOrder() {
  const { token } = useParams();
  const [changeOrder, setChangeOrder] = useState<PublicChangeOrderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);

  const load = () => {
    publicApi
      .get<PublicChangeOrderData>(`/public/change-orders/${token}`)
      .then((res) => setChangeOrder(res.data))
      .catch(() => setError("We couldn't find this change order. The link may be incorrect."));
  };

  useEffect(load, [token]);

  const onDecline = async () => {
    setResponding(true);
    try {
      await publicApi.post(`/public/change-orders/${token}/decline`);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Could not submit your response — please try again.");
    } finally {
      setResponding(false);
    }
  };

  const onApprove = async (e: FormEvent) => {
    e.preventDefault();
    if (!signatureImage) {
      setError("Please draw your signature before approving.");
      return;
    }
    setError(null);
    setResponding(true);
    try {
      await publicApi.post(`/public/change-orders/${token}/approve`, { signerName, signatureImage });
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

  if (!changeOrder) {
    return (
      <div className="public-invoice-page">
        <Spinner label="Loading change order..." />
      </div>
    );
  }

  return (
    <div className="public-invoice-page">
      <div className="public-invoice-card">
        <div className="public-invoice-header">
          <h1>{changeOrder.organizationName}</h1>
          <span className={`badge badge-${changeOrder.status.toLowerCase()}`}>{changeOrder.status.toLowerCase()}</span>
        </div>
        <p className="muted">
          Change order for "{changeOrder.jobTitle}" — {changeOrder.clientName}
        </p>

        <div className="panel">
          <h2>What's changing</h2>
          <p>{changeOrder.description}</p>
        </div>

        <div className="invoice-totals">
          <div className="total-row">
            <span>Additional cost</span>
            <span>${changeOrder.amount.toFixed(2)}</span>
          </div>
        </div>

        <div className="public-invoice-actions">
          {changeOrder.status === "PENDING" && !signing && (
            <div className="button-stack" style={{ width: "100%" }}>
              <button type="button" onClick={() => setSigning(true)} disabled={responding}>
                Approve this change
              </button>
              <button type="button" className="btn-secondary" onClick={onDecline} disabled={responding}>
                Decline
              </button>
            </div>
          )}
          {changeOrder.status === "PENDING" && signing && (
            <form onSubmit={onApprove} className="form-card" style={{ width: "100%" }}>
              <p className="muted small">
                Approving authorizes this additional work and cost. Type your name and sign below.
              </p>
              <label>
                Your full name
                <input value={signerName} onChange={(e) => setSignerName(e.target.value)} required />
              </label>
              <label>Signature</label>
              <SignatureCanvas onChange={setSignatureImage} />
              <div className="button-row" style={{ marginTop: 12 }}>
                <button type="submit" disabled={responding}>
                  {responding ? "Submitting..." : "Sign and approve"}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setSigning(false)} disabled={responding}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {changeOrder.status === "APPROVED" && (
            <p className="consent-yes">✓ You've approved this change order.</p>
          )}
          {changeOrder.status === "DECLINED" && <p className="consent-no">You've declined this change order.</p>}
        </div>
      </div>
    </div>
  );
}
