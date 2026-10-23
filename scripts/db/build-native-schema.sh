#!/usr/bin/env bash
# =============================================================================
# build-native-schema.sh — Reconstruit db/native/schema.native.sql à partir de :
#   db/native/000_supabase_compat_shim.sql  (émulation auth/storage pour rejouer)
#   legacy/supabase/migrations/*.sql               (les 94 migrations Lovable/Supabase)
#   db/native/100_to_native.sql             (conversion vers PostgreSQL natif)
#   db/native/110_realtime_notify.sql       (LISTEN/NOTIFY à la place de Realtime)
#   db/native/130_fixes_heritage.sql        (corrections de défauts hérités, hors schéma généré)
#   db/native/140_academy.sql               (tables DomiCares Academy, hors schéma généré)
# puis valide le résultat en le rejouant dans une base vierge.
#
# Usage : PGHOST=/tmp PGPORT=5433 PGUSER=postgres scripts/db/build-native-schema.sh
# Pré-requis : psql/pg_dump 16+, un serveur PostgreSQL 16 accessible en superuser.
# =============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${BUILD_DB:-domicares_build}"
CHECK_DB="${BUILD_DB:-domicares_build}_check"
OUT="$ROOT/db/native/schema.native.sql"
PSQL="psql -X -v ON_ERROR_STOP=1 -q"

echo "▶ Base de travail : $DB"
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
$PSQL -d "$DB" -f "$ROOT/db/native/000_supabase_compat_shim.sql"

echo "▶ Rejeu des migrations Supabase (ordre chronologique)"
# Le dump 20260126121712_remote_schema.sql est un instantané complet ; les migrations
# antérieures sont déjà incluses dedans. On rejoue le dump puis les migrations postérieures.
SNAPSHOT="20260126121712_remote_schema.sql"
for path in "$ROOT"/legacy/supabase/migrations/*.sql; do
  f="$(basename "$path")"
  [[ "$f" < "$SNAPSHOT" ]] && continue   # antérieures au snapshot : déjà incluses dedans
  # La vue admin_dashboard_stats est créée avant sa fonction dans le dump : erreur non bloquante,
  # la vue est recréée par 100_to_native.sql.
  if psql -X -q -d "$DB" -f "$path" 2>&1 | grep -E "ERROR" | grep -v "get_admin_dashboard_stats() does not exist"; then
    echo "✖ Erreur bloquante dans $f"; exit 1
  fi
done

echo "▶ Conversion native"
$PSQL -d "$DB" -f "$ROOT/db/native/100_to_native.sql"
$PSQL -d "$DB" -f "$ROOT/db/native/110_realtime_notify.sql"

echo "▶ Export du schéma consolidé"
{
  echo "-- FICHIER GÉNÉRÉ par scripts/db/build-native-schema.sh — ne pas éditer à la main."
  echo "-- Schéma PostgreSQL natif Domicares = legacy/supabase/migrations/* rejoués + db/native/100 + 110."
  echo "-- Pré-requis : db/native/010_roles.sql avant, db/native/020_grants.sql après. Les policies RLS sont conservées ;"
  echo "-- exécuter db/native/120_drop_rls_optional.sql pour les retirer (option B)."
  echo "-- Généré le $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
  echo "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
  echo "CREATE EXTENSION IF NOT EXISTS citext;"
  echo "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
  pg_dump -d "$DB" --schema-only --no-owner --no-privileges --schema=public --schema=auth \
    | grep -vE '^CREATE SCHEMA public;$' \
    | sed -E 's/^CREATE SCHEMA auth;/CREATE SCHEMA IF NOT EXISTS auth;/'
} > "$OUT"

echo "▶ Validation : rejeu dans une base vierge ($CHECK_DB)"
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $CHECK_DB" -c "CREATE DATABASE $CHECK_DB"
$PSQL -d "$CHECK_DB" -f "$ROOT/db/native/010_roles.sql"
$PSQL -d "$CHECK_DB" -f "$OUT"
$PSQL -d "$CHECK_DB" -f "$ROOT/db/native/130_fixes_heritage.sql"
$PSQL -d "$CHECK_DB" -f "$ROOT/db/native/140_academy.sql"
$PSQL -d "$CHECK_DB" -f "$ROOT/db/native/020_grants.sql"
psql -X -At -d "$CHECK_DB" <<'SQL'
select 'tables='||count(*) from pg_tables where schemaname='public';
select 'views='||count(*) from pg_views where schemaname='public';
select 'app_functions='||count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e');
select 'triggers='||count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal;
select 'policies='||count(*) from pg_policies where schemaname='public';
select 'fk_auth_users='||count(*) from pg_constraint c join pg_class r on r.oid=c.confrelid join pg_namespace n on n.oid=r.relnamespace where c.contype='f' and n.nspname='auth';
SQL
$PSQL -d postgres -c "DROP DATABASE $CHECK_DB"
echo "✔ $OUT généré et validé"
