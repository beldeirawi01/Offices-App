import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Invoice, Paginated } from "../api/client";
import Pagination from "../components/Pagination";
import EmptyState from "../components/EmptyState";
import Spinner from "../components/Spinner";
import { PlusIcon } from "../components/Icons";
import { useToast } from "../components/Toast";

export default function Invoices() {
  const toast = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = (page = 1) => {
    setLoading(true);
    api
      .get<Paginated<Invoice>>("/invoices", { params: { status: statusFilter || undefined, search: search || undefined, page } })
      .then((res) => {
        setInvoices(res.data.data);
        setPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages });
      })
      .catch((err) => toast.error(err?.response?.data?.error ?? "Could not load invoices"))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(1), [statusFilter, search]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <p className="page-subtitle">Track what's been billed, sent, and paid.</p>
        </div>
        <div className="header-actions">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
            <option value="VOID">Void</option>
          </select>
          <Link to="/invoices/new">
            <button type="button">
              <PlusIcon /> New invoice
            </button>
          </Link>
        </div>
      </div>

      <input
        className="search-input"
        placeholder="Search by invoice number or client name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <Spinner label="Loading invoices..." />
      ) : invoices.length === 0 ? (
        <EmptyState
          title={search || statusFilter ? "No matching invoices" : "No invoices yet"}
          message={
            search || statusFilter
              ? "Try a different search or status filter."
              : "Create your first invoice to start getting paid."
          }
          action={
            !search && !statusFilter && (
              <Link to="/invoices/new">
                <button type="button">
                  <PlusIcon /> New invoice
                </button>
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <Link to={`/invoices/${inv.id}`}>{inv.invoiceNumber}</Link>
                    </td>
                    <td>{inv.client.name}</td>
                    <td>
                      <span className={`badge badge-${inv.status.toLowerCase()}`}>{inv.status}</span>
                    </td>
                    <td>${inv.total.toFixed(2)}</td>
                    <td>{new Date(inv.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={load} />
        </>
      )}
    </div>
  );
}
