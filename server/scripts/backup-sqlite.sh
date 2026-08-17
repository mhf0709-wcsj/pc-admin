#!/usr/bin/env bash
set -euo pipefail

# Create consistent, private SQLite backups without depending on application downtime.
APP_DIR="${APP_DIR:-/home/lighthouse/apps/pc-admin/server}"
DATA_DIR="${APP_DIR}/data"
BACKUP_DIR="${BACKUP_DIR:-/home/lighthouse/backups/pc-admin}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

umask 077
mkdir -p "$BACKUP_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
found=0

while IFS= read -r -d '' database; do
  found=1
  name="$(basename "$database")"
  target="${BACKUP_DIR}/${name%.sqlite}-${timestamp}.sqlite"

  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$database" ".backup '$target'"
  else
    cp -- "$database" "$target"
  fi

  gzip -9 -- "$target"
  echo "[$(date -Is)] backed up ${name}"
done < <(find "$DATA_DIR" -maxdepth 1 -type f -name '*.sqlite' -print0)

if [[ "$found" -eq 0 ]]; then
  echo "No SQLite database found in ${DATA_DIR}" >&2
  exit 1
fi

find "$BACKUP_DIR" -type f -name '*.sqlite.gz' -mtime "+${RETENTION_DAYS}" -delete
