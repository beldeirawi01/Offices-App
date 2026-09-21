import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Client, Invoice, Job } from "../api/client";

type ClientWithHistory = Client & { jobs: Job[]; invoices: Invoice[] };

export default function ClientDetail() {
  const { id } = useParams();
  const [client, setClient] = useState<ClientWithHistory | null>(null);

  useEffect(() => {
    api.get<ClientWithHistory>(`/clients/${id}`).then((res) => setClient(res.data));
  }, [id]);

  if (!client) return <p>Loading...</p>;

  return (
    <div>
      <Link to="/clients">← Back to clients</Link>
      <h1>{client.name}</h1>
      <div className="detail-meta">
        <div>{client.email ?? "No email"}</div>
        <div>{client.phone ?? "No phone"}</div>
        <div>{client.addressLine1 ?? "No address on file"}</div>
      </div>

      <section className="panel">
        <h2>Job history</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Scheduled</th>
            </tr>
          </thead>
          <tbody>
            {client.jobs.map((j) => (
              <tr key={j.id}>
                <td>{j.title}</td>
                <td>
                  <span className={`badge badge-${j.status.toLowerCase()}`}>{j.status}</span>
                </td>
                <td>{j.scheduledAt ? new Date(j.scheduledAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
            {client.jobs.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Invoice history</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {client.invoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <Link to={`/invoices/${inv.id}`}>{inv.invoiceNumber}</Link>
                </td>
                <td>
                  <span className={`badge badge-${inv.status.toLowerCase()}`}>{inv.status}</span>
                </td>
                <td>${inv.total.toFixed(2)}</td>
              </tr>
            ))}
            {client.invoices.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No invoices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
