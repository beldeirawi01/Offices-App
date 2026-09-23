import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { publicApi } from "../api/client";
import AuthLayout from "../components/AuthLayout";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await publicApi.post("/auth/forgot-password", { email });
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Reset password</h1>
        {submitted ? (
          <p className="subtitle">
            If an account exists for {email}, a reset link has been sent. It expires in 30 minutes.
          </p>
        ) : (
          <>
            <p className="subtitle">Enter your account email and we'll send a reset link.</p>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </>
        )}
        <p className="switch-link">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
