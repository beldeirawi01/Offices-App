import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Invoice, Paginated } from "../api/client";
import Pagination from "../components/Pagination";

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = (page = 1) => {
    setLoading(true);
    api
      .get<Paginated<Invoice>>("/invoices", { params: { status: statusFilter || undefined, page } })
      .then((res) => {
        setInvoices(res.data.data);
        setPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => load(1), [statusFilter]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <p className="page-subtitle">Track what's been billed, sent, and paid.</p>
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SENT">Sent</option>
          <option value="PAID">Paid</option>
          <option value="OVERDUE">Overdue</option>
          <option value="VOID">Void</option>
        </select>
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
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
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted empty-cell">
                      No invoices yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={load} />
        </>
      )}
    </div>
  );
}
