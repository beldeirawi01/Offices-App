import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, Organization } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { CheckCircleIcon, AlertCircleIcon } from "../components/Icons";

// Common US timezones — covers the target audience (US trades businesses)
// without dumping the full ~400-entry IANA list into a dropdown.
const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Mountain, no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
];

export default function Settings() {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const isOwner = user?.role === "OWNER";

  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [taxRatePercent, setTaxRatePercent] = useState("0");
  const [timezone, setTimezone] = useState("America/New_York");
  const [orgSaving, setOrgSaving] = useState(false);

  const [stripeLoading, setStripeLoading] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [quickbooksLoading, setQuickbooksLoading] = useState(false);
  const [quickbooksSyncing, setQuickbooksSyncing] = useState(false);

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

  const [exporting, setExporting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadOrg = () => {
    api
      .get<Organization>("/organizations/me")
      .then((res) => {
        setOrg(res.data);
        setName(res.data.name);
        setTaxRatePercent((res.data.taxRate * 100).toString());
        setTimezone(res.data.timezone);
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

  // Landed back here after Intuit's OAuth consent screen — the backend's
  // callback route already stored the tokens before redirecting here, so
  // this just needs to re-fetch to pick up the new connected state.
  useEffect(() => {
    const quickbooksResult = searchParams.get("quickbooks");
    if (!quickbooksResult) return;
    setSearchParams({}, { replace: true });
    if (quickbooksResult === "return") {
      loadOrg();
      toast.success("QuickBooks connected.");
    } else if (quickbooksResult === "denied") {
      toast.error("QuickBooks connection was cancelled.");
    } else {
      toast.error("Could not connect QuickBooks — please try again.");
    }
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
      await api.put("/organizations/me", { name, taxRatePercent: Number(taxRatePercent), timezone });
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

  const onConnectQuickbooks = async () => {
    setQuickbooksLoading(true);
    try {
      const { data } = await api.post<{ url: string }>("/organizations/me/quickbooks/connect");
      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not start QuickBooks connection");
      setQuickbooksLoading(false);
    }
  };

  const onDisconnectQuickbooks = async () => {
    const ok = await confirm({
      title: "Disconnect QuickBooks?",
      message: "New invoices will stop syncing to QuickBooks until you reconnect. Already-synced invoices stay in QuickBooks.",
      confirmLabel: "Disconnect",
    });
    if (!ok) return;
    setQuickbooksLoading(true);
    try {
      await api.post("/organizations/me/quickbooks/disconnect");
      loadOrg();
      toast.success("QuickBooks disconnected.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not disconnect QuickBooks");
    } finally {
      setQuickbooksLoading(false);
    }
  };

  const onSyncQuickbooks = async () => {
    setQuickbooksSyncing(true);
    try {
      const { data } = await api.post<{ synced: number; failed: number }>("/organizations/me/quickbooks/sync");
      if (data.failed > 0) {
        toast.error(`Synced ${data.synced} invoice(s), ${data.failed} failed — check back after fixing any client/invoice issues.`);
      } else {
        toast.success(data.synced > 0 ? `Synced ${data.synced} invoice(s) to QuickBooks.` : "Everything is already synced.");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not sync QuickBooks");
    } finally {
      setQuickbooksSyncing(false);
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

  const onExportData = async () => {
    setExporting(true);
    try {
      const res = await api.get("/organizations/me/export", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "jobscribe-data-export.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not export your data");
    } finally {
      setExporting(false);
    }
  };

  const onDeleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    setDeleteError(null);

    const ok = await confirm({
      title: "Delete your account?",
      message:
        "This permanently deletes your business's entire Jobscribe account — every client, job, invoice, quote, and recording. There is no undo, and no one (including support) can recover it afterward.",
      confirmLabel: "Delete everything",
      danger: true,
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await api.post("/organizations/me/delete", { password: deletePassword });
      logout();
    } catch (err: any) {
      setDeleteError(err?.response?.data?.error ?? "Could not delete your account");
      setDeleting(false);
    }
  };

  return (
    <div>
      <h1>Settings</h1>
      <p className="page-subtitle">Business details and your account.</p>

      <section className="panel">
        <h2>{t("settings.language")}</h2>
        <div className="form-card">
          <p className="muted small">{t("settings.languageHelp")}</p>
          <div className="button-row">
            <button
              type="button"
              className={i18n.language === "en" ? undefined : "btn-secondary"}
              onClick={() => i18n.changeLanguage("en")}
            >
              English
            </button>
            <button
              type="button"
              className={i18n.language === "es" ? undefined : "btn-secondary"}
              onClick={() => i18n.changeLanguage("es")}
            >
              Español
            </button>
          </div>
        </div>
      </section>

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
              <label>
                Timezone
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {!TIMEZONE_OPTIONS.some((opt) => opt.value === timezone) && (
                    <option value={timezone}>{timezone}</option>
                  )}
                  {TIMEZONE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted small">
              Tax is applied automatically to every new invoice's subtotal. Timezone determines what time reminders and
              review requests are sent — set this to where your business operates.
            </p>
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
        <h2>QuickBooks</h2>
        {!isOwner ? (
          <p className="muted">Only the business owner can manage the QuickBooks connection.</p>
        ) : !org ? (
          <p className="muted">Loading...</p>
        ) : org.quickbooksConnected ? (
          <div className="form-card">
            <p className="consent-yes">
              <CheckCircleIcon width={16} height={16} /> Connected
              {org.quickbooksConnectedAt ? ` since ${new Date(org.quickbooksConnectedAt).toLocaleDateString()}` : ""}.
            </p>
            <p className="muted small">
              Sent and paid invoices sync to QuickBooks automatically. Use "Sync now" to catch up anything from before
              you connected, or to retry after an error.
            </p>
            <div className="button-row">
              <button type="button" className="btn-secondary" onClick={onSyncQuickbooks} disabled={quickbooksSyncing}>
                {quickbooksSyncing ? "Syncing..." : "Sync now"}
              </button>
              <button type="button" className="btn-danger" onClick={onDisconnectQuickbooks} disabled={quickbooksLoading}>
                {quickbooksLoading ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>
        ) : (
          <div className="form-card">
            <p className="muted">
              Connect QuickBooks Online to automatically sync your clients as customers and your sent/paid invoices —
              no more re-entering them for your bookkeeping.
            </p>
            <div className="button-row">
              <button type="button" onClick={onConnectQuickbooks} disabled={quickbooksLoading}>
                {quickbooksLoading ? "Redirecting..." : "Connect QuickBooks"}
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

      <section className="panel">
        <h2>Your data</h2>
        <div className="form-card">
          <p className="muted small">
            Download everything Jobscribe has stored for your business — clients, jobs, invoices, quotes, and voice
            note transcripts — as a JSON file. Photo/audio files themselves aren't included in the download; only
            their metadata is.
          </p>
          <div className="button-row">
            <button type="button" className="btn-secondary" onClick={onExportData} disabled={exporting}>
              {exporting ? "Preparing export..." : "Export my data"}
            </button>
          </div>
        </div>

        {isOwner && (
          <form className="form-card" onSubmit={onDeleteAccount} style={{ marginTop: 16 }}>
            <h3>Delete account</h3>
            {deleteError && <div className="error-banner">{deleteError}</div>}
            <p className="muted small">
              Permanently deletes your business's entire account and everything in it. This cannot be undone.
            </p>
            <label>
              Confirm your password
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                required
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn-danger" disabled={deleting || !deletePassword}>
                {deleting ? "Deleting..." : "Delete my account permanently"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
