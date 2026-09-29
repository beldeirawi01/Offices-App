#!/usr/bin/env bash
set -euo pipefail

# Restores a backup produced by backup-db.sh into the database at
# $DATABASE_URL. DESTRUCTIVE: drops and recreates every object in the
# target database before loading the dump (--clean --if-exists) — never
# point this at a database you don't intend to overwrite. For disaster
# recovery, point DATABASE_URL at a fresh/empty database, not production.
#
# Usage: DATABASE_URL=postgresql://... ./scripts/restore-db.sh path/to/backup.dump

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

DUMP_FILE="${1:?Usage: restore-db.sh path/to/backup.dump}"
if [ ! -f "$DUMP_FILE" ]; then
  echo "No such file: $DUMP_FILE" >&2
  exit 1
fi

pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$DUMP_FILE"

echo "Restored $DUMP_FILE into $DATABASE_URL"
