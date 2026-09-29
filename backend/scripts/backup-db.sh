#!/usr/bin/env bash
set -euo pipefail

# Dumps the database at $DATABASE_URL to a timestamped, compressed
# custom-format file — restore it with restore-db.sh.
#
# Usage: DATABASE_URL=postgresql://... ./scripts/backup-db.sh [output-dir]
# Defaults output-dir to backend/backups/ (gitignored).

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-$SCRIPT_DIR/../backups}"
mkdir -p "$OUT_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$OUT_DIR/jobscribe-${TIMESTAMP}.dump"

pg_dump --format=custom --file="$OUT_FILE" "$DATABASE_URL"

echo "Backup written to $OUT_FILE"
