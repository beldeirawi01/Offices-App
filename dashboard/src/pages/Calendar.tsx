import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, Job, Paginated, Tech } from "../api/client";
import { useToast } from "../components/Toast";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";

const DAY_MS = 24 * 60 * 60 * 1000;
const UNASSIGNED_ROW = "unassigned";

// Monday-start week, matching how US trades crews plan a work week (weekend
// jobs are the exception, not the default column layout).
function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function Calendar() {
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [jobs, setJobs] = useState<Job[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  useEffect(() => {
    setLoading(true);
    const from = weekStart.toISOString();
    const to = addDays(weekStart, 7).toISOString();
    api
      .get<Paginated<Job>>("/jobs", { params: { from, to } })
      .then((res) => setJobs(res.data.data))
      .catch((err) => toast.error(err?.response?.data?.error ?? "Could not load the calendar"))
      .finally(() => setLoading(false));
  }, [weekStart]);

  useEffect(() => {
    api
      .get<Tech[]>("/users")
      .then((res) => setTechs(res.data))
      .catch(() => toast.error("Could not load the team list"));
  }, []);

  // Rows: every tech (even ones with nothing scheduled this week, so an
  // owner can see who's free), plus an "Unassigned" row for jobs nobody's
  // been assigned to yet.
  const rows = useMemo(() => [...techs.map((t) => ({ id: t.id, name: t.name })), { id: UNASSIGNED_ROW, name: "Unassigned" }], [techs]);

  const jobsByRowAndDay = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of jobs) {
      if (!job.scheduledAt) continue;
      const rowId = job.assignedTechId ?? UNASSIGNED_ROW;
      const key = `${rowId}|${dateKey(new Date(job.scheduledAt))}`;
      const list = map.get(key) ?? [];
      list.push(job);
      map.set(key, list);
    }
    return map;
  }, [jobs]);

  const unscheduledCount = jobs.filter((j) => !j.scheduledAt).length;

  const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(
    weekStart,
    6,
  ).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Calendar</h1>
          <p className="page-subtitle">Who's scheduled where, at a glance. Click a job to edit or reassign it.</p>
        </div>
        <div className="button-row">
          <button type="button" className="btn-secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            ‹ Prev week
          </button>
          <button type="button" className="btn-secondary" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            This week
          </button>
          <button type="button" className="btn-secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            Next week ›
          </button>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: -8, marginBottom: 16 }}>
        {weekLabel}
        {unscheduledCount > 0 && ` · ${unscheduledCount} job(s) this range have no time set and aren't shown below`}
      </p>

      {loading ? (
        <Spinner label="Loading calendar..." />
      ) : rows.length === 1 && jobs.length === 0 ? (
        <EmptyState title="No team members yet" message="Add technicians from the Team page to see them here." />
      ) : (
        <div className="card calendar-board">
          <div className="calendar-grid" style={{ gridTemplateColumns: `140px repeat(7, 1fr)` }}>
            <div className="calendar-corner" />
            {days.map((day) => (
              <div key={dateKey(day)} className="calendar-day-header">
                <div className="calendar-day-name">{day.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div className="calendar-day-date">{day.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</div>
              </div>
            ))}

            {rows.map((row) => (
              <Fragment key={row.id}>
                <div className="calendar-row-label">{row.name}</div>
                {days.map((day) => {
                  const cellJobs = jobsByRowAndDay.get(`${row.id}|${dateKey(day)}`) ?? [];
                  return (
                    <div key={`${row.id}-${dateKey(day)}`} className="calendar-cell">
                      {cellJobs.map((job) => (
                        <Link key={job.id} to={`/jobs/${job.id}`} className={`calendar-job badge-${job.status.toLowerCase()}`}>
                          <span className="calendar-job-time">
                            {new Date(job.scheduledAt!).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          </span>
                          <span className="calendar-job-title">{job.title}</span>
                          <span className="calendar-job-client">{job.client.name}</span>
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
