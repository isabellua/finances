#!/usr/bin/env bash
# Sobe um Postgres descartável, aplica as migrações em ordem e roda supabase/tests/*.test.sql.
# Antes da migração "*_workspaces.sql", carrega supabase/tests/legacy_seed.sql (dados "antigos").
# Uso: scripts/db-test.sh        (precisa dos binários do Postgres; PGBIN pode ser definido)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${PGTEST_PORT:-5544}"
D="$(mktemp -d /var/tmp/finances-dbtest.XXXXXX)"

if [ "$(id -u)" = "0" ]; then
  chown postgres "$D"
  as_pg() { runuser -u postgres -- "$@"; }
else
  as_pg() { "$@"; }
fi

cleanup() { as_pg "$PGBIN/pg_ctl" -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"; }
trap cleanup EXIT

as_pg "$PGBIN/initdb" -D "$D/data" -A trust >/dev/null
as_pg "$PGBIN/pg_ctl" -D "$D/data" -o "-p $PORT -k $D" -l "$D/log" -w start >/dev/null

psqlq() { "$PGBIN/psql" -h "$D" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

psqlq -d postgres -c "create database t"
psqlq -d t -f "$ROOT/supabase/tests/shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  case "$f" in
    *_workspaces.sql)
      echo ">> dados antigos (antes de $(basename "$f"))"
      psqlq -d t -f "$ROOT/supabase/tests/legacy_seed.sql"
      ;;
  esac
  echo ">> migração $(basename "$f")"
  psqlq -d t -f "$f"
done

fail=0
for t in "$ROOT"/supabase/tests/*.test.sql; do
  echo ">> teste $(basename "$t")"
  if ! out="$(psqlq -d t -f "$t" 2>&1)"; then
    echo "$out" | grep -E "ERROR|FALHOU" | head -5
    fail=1
  else
    echo "$out" | grep -c "ok:" | sed 's/^/   checagens ok: /'
  fi
done
if [ "${FINGERPRINT:-0}" = "1" ]; then
  echo ">> impressão digital do esquema"
  psqlq -d t -t -A -F ' | ' -f "$ROOT/supabase/tests/fingerprint.sql"
fi
if [ -n "${FNLIST:-}" ]; then
  psqlq -d t -t -A -F ' | ' -f "$FNLIST"
fi
exit $fail
