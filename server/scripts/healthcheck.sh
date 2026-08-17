#!/usr/bin/env bash
set -euo pipefail

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"

if curl --fail --silent --show-error --max-time 10 "$HEALTH_URL" | grep -q '"success":true'; then
  exit 0
fi

echo "[$(date -Is)] pc-admin health check failed; restarting service" >&2
systemctl restart pc-admin
sleep 3
curl --fail --silent --show-error --max-time 10 "$HEALTH_URL" | grep -q '"success":true'
