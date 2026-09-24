import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, Organization } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import { CheckCircleIcon, AlertCircleIcon } from "../components/Icons";

export default function Settings() {
  const { user } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const isOwner = user?.role === "OWNER";

  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [taxRatePercent, setTaxRatePercent] = useState("0");
  const [orgSaving, setOrgSaving] = useState(false);

  const [stripeLoading, setStripeLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const loadOrg = () => {
    api.get<Organization>("/organizations/me").then((res) => {
      setOrg(res.data);
      setName(res.data.name);
      setTaxRatePercent((res.data.taxRate * 100).toString());
    });
  };

  useEffect(loadOrg, []);

  // Landed back here after Stripe's hosted onboarding — pull the account's
  // real status rather than assuming it finished successfully.
  useEffect(() => {
    if (searchParams.get("stripe") !== "return") return;
    setSearchParams({}, { replace: true });
    api
      .post<Organization>("/organizations/me/stripe/refresh-status")
      .then((res) => {
        setOrg(res.data);
        toast.success(
          res.data.stripeChargesEnabled
            ? "Stripe account connected — you can now send invoices."
            : "Stripe onboarding saved, but a few steps are still incomplete.",
        );
      })
      .catch(() => toast.error("Could not confirm your Stripe account status."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const onSaveOrg = async (e: FormEvent) => {
    e.preventDefault();
    setOrgSaving(true);
    try {
      await api.put("/organizations/me", { name, taxRatePercent: Number(taxRatePercent) });
      toast.success("Business settings saved.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not save changes");
    } finally {
      setOrgSaving(false);
    }
  };

  const onConnectStripe = async () => {
    setStripeLoading(true);
    try {
      const { data } = await api.post<{ url: string }>("/organizations/me/stripe/onboard");
      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not start Stripe onboarding");
      setStripeLoading(false);
    }
  };

  const onOpenStripeDashboard = async () => {
    try {
      const { data } = await api.get<{ url: string }>("/organizations/me/stripe/dashboard-link");
      window.open(data.url, "_blank", "noreferrer");
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not open the Stripe dashboard");
    }
  };

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    setPasswordSaving(true);
    try {
      await api.put("/auth/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSuccess(true);
    } catch (err: any) {
      setPasswordError(err?.response?.data?.error ?? "Could not change password");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div>
      <h1>Settings</h1>
      <p className="page-subtitle">Business details and your account.</p>

      <section className="panel">
        <h2>Business</h2>
        {!isOwner ? (
          <p className="muted">Only the business owner can change these settings.</p>
        ) : !org ? (
          <p className="muted">Loading...</p>
        ) : (
          <form className="form-card" onSubmit={onSaveOrg}>
            <div className="form-grid">
              <label>
                Business name
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label>
                Sales tax rate (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={taxRatePercent}
                  onChange={(e) => setTaxRatePercent(e.target.value)}
                />
              </label>
            </div>
            <p className="muted small">Applied automatically to every new invoice's subtotal.</p>
            <div className="form-actions">
              <button type="submit" disabled={orgSaving}>
                {orgSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="panel">
        <h2>Payments</h2>
        {!isOwner ? (
          <p className="muted">Only the business owner can manage payment settings.</p>
        ) : !org ? (
          <p className="muted">Loading...</p>
        ) : org.stripeChargesEnabled ? (
          <div className="form-card">
            <p className="consent-yes">
              <CheckCircleIcon width={16} height={16} /> Connected — clients can pay your invoices directly, and
              payments go straight to your bank account.
            </p>
            {!org.stripePayoutsEnabled && (
              <p className="muted small">
                Payouts aren't enabled yet — Stripe may still be reviewing your account details.
              </p>
            )}
            <div className="button-row">
              <button type="button" className="btn-secondary" onClick={onOpenStripeDashboard}>
                View Stripe dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="form-card">
            <p className={org.stripeAccountId ? "consent-no" : "muted"}>
              {org.stripeAccountId ? (
                <>
                  <AlertCircleIcon width={16} height={16} /> Your Stripe account setup is incomplete — finish it to
                  start accepting payments.
                </>
              ) : (
                "Connect a Stripe account so clients can pay your invoices and the money goes straight to your bank account. You can't send invoices until this is done."
              )}
            </p>
            <div className="button-row">
              <button type="button" onClick={onConnectStripe} disabled={stripeLoading}>
                {stripeLoading ? "Redirecting..." : org.stripeAccountId ? "Continue setup" : "Connect with Stripe"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Change password</h2>
        <form className="form-card" onSubmit={onChangePassword}>
          {passwordError && <div className="error-banner">{passwordError}</div>}
          {passwordSuccess && <p className="consent-yes">Password changed.</p>}
          <div className="form-grid">
            <label>
              Current password
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </label>
            <label>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={passwordSaving}>
              {passwordSaving ? "Saving..." : "Change password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
