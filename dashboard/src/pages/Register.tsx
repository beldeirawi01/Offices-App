import { FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [organizationName, setOrganizationName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(organizationName, name, email, password);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("register.genericError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{t("register.title")}</h1>
        <p className="subtitle">{t("register.subtitle")}</p>
        {error && <div className="error-banner">{error}</div>}
        <label>
          {t("register.businessName")}
          <input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required />
        </label>
        <label>
          {t("register.yourName")}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          {t("register.email")}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          {t("register.password")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? t("register.creating") : t("register.createAccount")}
        </button>
        <p className="legal-fineprint">
          By creating an account you agree to our <Link to="/terms">Terms of Service</Link> and{" "}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
        <p className="switch-link">
          {t("register.alreadyHaveAccount")} <Link to="/login">{t("register.signIn")}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
