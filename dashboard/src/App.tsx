import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./components/Toast";
import { ConfirmProvider } from "./components/ConfirmDialog";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import Invoices from "./pages/Invoices";
import NewInvoice from "./pages/NewInvoice";
import InvoiceDetail from "./pages/InvoiceDetail";
import Quotes from "./pages/Quotes";
import NewQuote from "./pages/NewQuote";
import QuoteDetail from "./pages/QuoteDetail";
import Team from "./pages/Team";
import Settings from "./pages/Settings";
import PublicInvoice from "./pages/PublicInvoice";
import PublicQuote from "./pages/PublicQuote";
import { TermsOfService, PrivacyPolicy } from "./pages/Legal";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:token" element={<ResetPassword />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/pay/:token" element={<PublicInvoice />} />
              <Route path="/quotes/view/:token" element={<PublicQuote />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="jobs" element={<Jobs />} />
                <Route path="jobs/:id" element={<JobDetail />} />
                <Route path="clients" element={<Clients />} />
                <Route path="clients/:id" element={<ClientDetail />} />
                <Route path="quotes" element={<Quotes />} />
                <Route path="quotes/new" element={<NewQuote />} />
                <Route path="quotes/:id" element={<QuoteDetail />} />
                <Route path="invoices" element={<Invoices />} />
                <Route path="invoices/new" element={<NewInvoice />} />
                <Route path="invoices/:id" element={<InvoiceDetail />} />
                <Route path="team" element={<Team />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
