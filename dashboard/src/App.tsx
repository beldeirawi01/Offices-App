import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Jobs from "./pages/Jobs";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
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
            <Route path="clients" element={<Clients />} />
            <Route path="clients/:id" element={<ClientDetail />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/:id" element={<InvoiceDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
