import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Invoice } from "../api/client";

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<Invoice[]>("/invoices", { params: statusFilter ? { status: statusFilter } : {} })
      .then((res) => setInvoices(res.data))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div>
      <div className="page-header">
        <h1>Invoices</h1>
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
        <p>Loading...</p>
      ) : (
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
                <td colSpan={5} className="muted">
                  No invoices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
