import { useEffect, useState } from "react";
import { api, ReportSummary } from "../api/client";

export default function Dashboard() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<ReportSummary>("/reports/summary")
      .then((res) => setSummary(res.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;
  if (!summary) return <p>Could not load report summary.</p>;

  const maxJobCount = Math.max(1, ...summary.busiestDays.map((d) => d.jobCount));

  return (
    <div>
      <h1>Dashboard</h1>

      <div className="stat-grid">
        <StatCard label="Revenue collected" value={`$${summary.totalRevenue.toFixed(2)}`} />
        <StatCard label="Outstanding balance" value={`$${summary.outstandingBalance.toFixed(2)}`} />
        <StatCard label="Paid invoices" value={summary.paidInvoiceCount} />
        <StatCard label="Awaiting payment" value={summary.outstandingInvoiceCount} />
      </div>

      <div className="panel-grid">
        <section className="panel">
          <h2>Job type breakdown</h2>
          {summary.jobTypeBreakdown.length === 0 ? (
            <p className="muted">No jobs yet.</p>
          ) : (
            <ul className="bar-list">
              {summary.jobTypeBreakdown.map((item) => (
                <li key={item.jobType}>
                  <span className="bar-label">{item.jobType}</span>
                  <span className="bar-value">{item.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>Busiest days</h2>
          <ul className="bar-chart">
            {summary.busiestDays.map((d) => (
              <li key={d.day}>
                <div
                  className="bar"
                  style={{ height: `${Math.max(4, (d.jobCount / maxJobCount) * 100)}px` }}
                  title={`${d.day}: ${d.jobCount}`}
                />
                <span className="bar-day">{d.day.slice(0, 3)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Job status</h2>
          <ul className="bar-list">
            <li>
              <span className="bar-label">Scheduled</span>
              <span className="bar-value">{summary.jobStatusCounts.scheduled}</span>
            </li>
            <li>
              <span className="bar-label">In progress</span>
              <span className="bar-value">{summary.jobStatusCounts.inProgress}</span>
            </li>
            <li>
              <span className="bar-label">Completed</span>
              <span className="bar-value">{summary.jobStatusCounts.completed}</span>
            </li>
            <li>
              <span className="bar-label">Cancelled</span>
              <span className="bar-value">{summary.jobStatusCounts.cancelled}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
