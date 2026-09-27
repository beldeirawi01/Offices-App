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
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  const [reviewRequestEnabled, setReviewRequestEnabled] = useState(true);
  const [reviewRequestDelayDays, setReviewRequestDelayDays] = useState("3");
  const [reviewLinkUrl, setReviewLinkUrl] = useState("");
  const [rebookingRemindersEnabled, setRebookingRemindersEnabled] = useState(true);
  const [followUpsSaving, setFollowUpsSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const loadOrg = () => {
    api
      .get<Organization>("/organizations/me")
      .then((res) => {
        setOrg(res.data);
        setName(res.data.name);
        setTaxRatePercent((res.data.taxRate * 100).toString());
        setReviewRequestEnabled(res.data.reviewRequestEnabled);
        setReviewRequestDelayDays(res.data.reviewRequestDelayDays.toString());
        setReviewLinkUrl(res.data.reviewLinkUrl ?? "");
        setRebookingRemindersEnabled(res.data.rebookingRemindersEnabled);
      })
      .catch((err) => toast.error(err?.response?.data?.error ?? "Could not load business settings"));
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

  // Landed back here after subscribing via Stripe Checkout — the webhook
  // usually beats the redirect, but re-fetch to be sure rather than assume.
  useEffect(() => {
    if (searchParams.get("subscription") !== "return") return;
    setSearchParams({}, { replace: true });
    loadOrg();
    toast.success("Subscription active — welcome to Jobscribe.");
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

  const onSaveFollowUps = async (e: FormEvent) => {
    e.preventDefault();
    setFollowUpsSaving(true);
    try {
      const { data } = await api.put<Organization>("/organizations/me", {
        reviewRequestEnabled,
        reviewRequestDelayDays: Number(reviewRequestDelayDays),
        reviewLinkUrl: reviewLinkUrl.trim() || null,
        rebookingRemindersEnabled,
      });
      setOrg(data);
      toast.success("Follow-up settings saved.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not save changes");
    } finally {
      setFollowUpsSaving(false);
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

  const onSubscribe = async () => {
    setSubscriptionLoading(true);
    try {
      const { data } = await api.post<{ url: string }>("/organizations/me/subscription/checkout");
      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not start checkout");
      setSubscriptionLoading(false);
    }
  };

  const onManageBilling = async () => {
    setSubscriptionLoading(true);
    try {
      const { data } = await api.get<{ url: string }>("/organizations/me/subscription/portal");
      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not open the billing portal");
      setSubscriptionLoading(false);
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
        <h2>Subscription</h2>
        {!isOwner ? (
          <p className="muted">Only the business owner can manage the subscription.</p>
        ) : !org ? (
          <p className="muted">Loading...</p>
        ) : (
          <div className="form-card">
            {searchParams.get("subscription") === "required" && (
              <div className="error-banner">Your trial has ended. Subscribe below to keep using Jobscribe.</div>
            )}

            {org.subscriptionStatus === "ACTIVE" && (
              <>
                <p className="consent-yes">
                  <CheckCircleIcon width={16} height={16} /> Active — $29/month, flat rate.
                </p>
                {org.subscriptionCurrentPeriodEnd && (
                  <p className="muted small">
                    Renews {new Date(org.subscriptionCurrentPeriodEnd).toLocaleDateString()}.
                  </p>
                )}
                <div className="button-row">
                  <button type="button" className="btn-secondary" onClick={onManageBilling} disabled={subscriptionLoading}>
                    {subscriptionLoading ? "Redirecting..." : "Manage billing"}
                  </button>
                </div>
              </>
            )}

            {org.subscriptionStatus === "PAST_DUE" && (
              <>
                <p className="consent-no">
                  <AlertCircleIcon width={16} height={16} /> Your last payment failed — update your card to avoid
                  losing access.
                </p>
                <div className="button-row">
                  <button type="button" onClick={onManageBilling} disabled={subscriptionLoading}>
                    {subscriptionLoading ? "Redirecting..." : "Update payment method"}
                  </button>
                </div>
              </>
            )}

            {org.subscriptionStatus === "TRIALING" && (
              <>
                <p className="muted">
                  {org.trialEndsAt
                    ? `Free trial — ${Math.max(0, Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 86400000))} day(s) left.`
                    : "Free trial active."}{" "}
                  $29/month, flat rate, whenever you're ready.
                </p>
                <div className="button-row">
                  <button type="button" onClick={onSubscribe} disabled={subscriptionLoading}>
                    {subscriptionLoading ? "Redirecting..." : "Subscribe — $29/month"}
                  </button>
                </div>
              </>
            )}

            {(org.subscriptionStatus === "CANCELED" || org.subscriptionStatus === "INCOMPLETE") && (
              <>
                <p className="consent-no">
                  <AlertCircleIcon width={16} height={16} /> No active subscription — the rest of the app is locked
                  until you subscribe.
                </p>
                <div className="button-row">
                  <button type="button" onClick={onSubscribe} disabled={subscriptionLoading}>
                    {subscriptionLoading ? "Redirecting..." : "Subscribe — $29/month"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

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
        <h2>Follow-ups</h2>
        {!isOwner ? (
          <p className="muted">Only the business owner can change these settings.</p>
        ) : !org ? (
          <p className="muted">Loading...</p>
        ) : (
          <form className="form-card" onSubmit={onSaveFollowUps}>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={reviewRequestEnabled}
                onChange={(e) => setReviewRequestEnabled(e.target.checked)}
              />
              Ask clients for a review after they pay
            </label>
            <div className="form-grid">
              <label>
                Days after payment to ask
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={reviewRequestDelayDays}
                  onChange={(e) => setReviewRequestDelayDays(e.target.value)}
                  disabled={!reviewRequestEnabled}
                />
              </label>
              <label>
                Review link (e.g. Google Business Profile)
                <input
                  type="url"
                  placeholder="https://g.page/r/..."
                  value={reviewLinkUrl}
                  onChange={(e) => setReviewLinkUrl(e.target.value)}
                  disabled={!reviewRequestEnabled}
                />
              </label>
            </div>
            <p className="muted small">
              No review requests are sent until a review link is set. Turn this off per-client from that client's page.
            </p>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={rebookingRemindersEnabled}
                onChange={(e) => setRebookingRemindersEnabled(e.target.checked)}
              />
              Remind clients to rebook recurring services
            </label>
            <p className="muted small">
              Set a recurrence interval on a job (e.g. every 6 months for an HVAC tune-up) to enable its reminder.
            </p>

            <div className="form-actions">
              <button type="submit" disabled={followUpsSaving}>
                {followUpsSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
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
