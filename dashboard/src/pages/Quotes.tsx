import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Quote, Paginated } from "../api/client";
import Pagination from "../components/Pagination";
import EmptyState from "../components/EmptyState";
import Spinner from "../components/Spinner";
import { PlusIcon } from "../components/Icons";

export default function Quotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = (page = 1) => {
    setLoading(true);
    api
      .get<Paginated<Quote>>("/quotes", { params: { status: statusFilter || undefined, search: search || undefined, page } })
      .then((res) => {
        setQuotes(res.data.data);
        setPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => load(1), [statusFilter, search]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Quotes</h1>
          <p className="page-subtitle">Estimates waiting on a client's yes.</p>
        </div>
        <div className="header-actions">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="DECLINED">Declined</option>
            <option value="CONVERTED">Converted</option>
          </select>
          <Link to="/quotes/new">
            <button type="button">
              <PlusIcon /> New quote
            </button>
          </Link>
        </div>
      </div>

      <input
        className="search-input"
        placeholder="Search by quote number or client name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <Spinner label="Loading quotes..." />
      ) : quotes.length === 0 ? (
        <EmptyState
          title={search || statusFilter ? "No matching quotes" : "No quotes yet"}
          message={
            search || statusFilter
              ? "Try a different search or status filter."
              : "Give a client a price before you start the job."
          }
          action={
            !search && !statusFilter && (
              <Link to="/quotes/new">
                <button type="button">
                  <PlusIcon /> New quote
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
                  <th>Quote #</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <Link to={`/quotes/${q.id}`}>{q.quoteNumber}</Link>
                    </td>
                    <td>{q.client.name}</td>
                    <td>
                      <span className={`badge badge-${q.status.toLowerCase()}`}>{q.status.toLowerCase()}</span>
                    </td>
                    <td>${q.total.toFixed(2)}</td>
                    <td>{new Date(q.createdAt).toLocaleDateString()}</td>
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
