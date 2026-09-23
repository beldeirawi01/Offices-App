import { FormEvent, useEffect, useState } from "react";
import { api, Organization } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";

export default function Settings() {
  const { user } = useAuth();
  const toast = useToast();
  const isOwner = user?.role === "OWNER";

  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [taxRatePercent, setTaxRatePercent] = useState("0");
  const [orgSaving, setOrgSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    api.get<Organization>("/organizations/me").then((res) => {
      setOrg(res.data);
      setName(res.data.name);
      setTaxRatePercent((res.data.taxRate * 100).toString());
    });
  }, []);

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
