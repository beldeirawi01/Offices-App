import { FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("login.genericError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{t("login.title")}</h1>
        <p className="subtitle">{t("login.subtitle")}</p>
        {error && <div className="error-banner">{error}</div>}
        <label>
          {t("login.email")}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          {t("login.password")}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? t("login.signingIn") : t("login.signIn")}
        </button>
        <p className="switch-link">
          <Link to="/forgot-password">{t("login.forgotPassword")}</Link>
        </p>
        <p className="switch-link">
          {t("login.newHere")} <Link to="/register">{t("login.createOrganization")}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
