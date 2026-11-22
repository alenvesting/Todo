#!/usr/bin/env bash
# Kör migrationen + RLS-testerna mot en tillfällig lokal Postgres.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | tail -1)}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
cleanup() { $RUN "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
RUN=""
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown postgres "$DATA"; fi
trap cleanup EXIT
$RUN "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=''" -l "$DATA/log" -w start >/dev/null
PSQL=(psql -h /tmp -X -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$HERE/supabase_stub.sql" 2>&1 | grep -v -e wal_level -e HINT || true
for f in "$HERE"/../migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -o /dev/null -f "$HERE/rls_test.sql" 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  //"
