# Database backup & restore

`scripts/backup-db.sh` and `scripts/restore-db.sh` wrap `pg_dump`/`pg_restore`
against whatever `DATABASE_URL` points at. They're the mechanism; scheduling
and off-site storage are a hosting decision (see below).

## Taking a backup

```
DATABASE_URL=postgresql://user:pass@host:5432/dbname ./scripts/backup-db.sh
```

Writes a timestamped, compressed custom-format dump to `backend/backups/`
(gitignored) or the directory passed as the first argument. Custom format
(`pg_dump --format=custom`) is used because it supports `pg_restore`'s
`--clean --if-exists` and is portable across Postgres versions in either
direction, unlike a plain SQL dump piped through `psql`.

## Restoring

```
DATABASE_URL=postgresql://user:pass@host:5432/dbname ./scripts/restore-db.sh backend/backups/jobscribe-<timestamp>.dump
```

**This is destructive** — `--clean --if-exists` drops every existing object
in the target database before loading the dump. Point it at a fresh/empty
database (a new instance, or a scratch database on the same server) when
verifying a backup; only point it at a live database when you actually intend
to overwrite it, e.g. an actual disaster-recovery restore.

This exact backup → restore round trip (dump a database with a known row,
restore into a separate fresh database, confirm the row is present with the
same values) has been run and verified to work.

## Automating this in production

These scripts are what a scheduled job should call — the scheduling itself
depends on where Postgres is hosted:

- **Render/Railway/managed Postgres**: most managed Postgres offerings
  (including Render's) include automated daily backups with point-in-time
  recovery out of the box — verify it's actually enabled on your plan before
  relying on it, since some tiers don't include it by default.
- **Self-hosted / a plain VM**: run `backup-db.sh` from cron (e.g. nightly),
  and pipe or copy the resulting file to off-instance storage (S3/R2/B2) —
  a backup that lives only on the same disk as the database it's backing up
  doesn't protect against losing that disk.

Whichever path you choose, **test a restore periodically**, not just once at
launch — a backup nobody has successfully restored from is unverified, not
safe.
