import { FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { publicApi } from "../api/client";

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await publicApi.post("/auth/reset-password", { token, newPassword });
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "This reset link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Set a new password</h1>
        {error && <div className="error-banner">{error}</div>}
        {success ? (
          <p className="consent-yes">Password reset. Redirecting to sign in...</p>
        ) : (
          <>
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
            <button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Reset password"}
            </button>
          </>
        )}
        <p className="switch-link">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
