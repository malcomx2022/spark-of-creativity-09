#!/usr/bin/env bash
# =============================================================================
# import-native.sh — Importe un export Supabase dans un PostgreSQL 16 natif
#
# Usage : PGHOST=... PGPORT=5432 PGUSER=postgres PGPASSWORD=... \
#         scripts/db/import-native.sh export/<horodatage> [nom_base]
#
# Étapes :
#   1. crée la base + rôles (010_roles.sql)
#   2. installe le shim Supabase (000) puis rejoue supabase/migrations/* (schéma identique à la prod)
#   3. restaure les DONNÉES public + auth.users (triggers désactivés)
#   4. exécute 100_to_native.sql (public.users, FK, GUC, suppression storage/auth.users)
#   5. exécute 110_realtime_notify.sql ; 120_drop_rls_optional.sql si DROP_RLS=1
#   6. compare les comptages de lignes avec rowcounts.csv
#
# Pour une base VIERGE (sans données Supabase) : psql -f db/native/010_roles.sql
# puis psql -f db/native/schema.native.sql suffisent.
# =============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EXPORT="${1:?dossier export requis}"
DB="${2:-domicares}"
PSQL="psql -X -v ON_ERROR_STOP=1 -q"
SNAPSHOT="20260126121712_remote_schema.sql"

echo "▶ 1. Base $DB + rôles"
$PSQL -d postgres -c "CREATE DATABASE $DB" 2>/dev/null || echo "  (base existante)"
$PSQL -d "$DB" -f "$ROOT/db/native/010_roles.sql"
if [[ -n "${DOMICARES_APP_PASSWORD:-}" ]]; then $PSQL -d "$DB" -c "ALTER ROLE domicares_app PASSWORD '$DOMICARES_APP_PASSWORD'"; fi
if [[ -n "${DOMICARES_MIGRATOR_PASSWORD:-}" ]]; then $PSQL -d "$DB" -c "ALTER ROLE domicares_migrator PASSWORD '$DOMICARES_MIGRATOR_PASSWORD'"; fi

echo "▶ 2. Shim + migrations Supabase"
$PSQL -d "$DB" -f "$ROOT/db/native/000_supabase_compat_shim.sql"
for path in "$ROOT"/supabase/migrations/*.sql; do
  f="$(basename "$path")"
  [[ "$f" < "$SNAPSHOT" ]] && continue   # antérieures au snapshot : déjà incluses dedans
  # La vue admin_dashboard_stats est créée avant sa fonction dans le dump : erreur non bloquante,
  # la vue est recréée par 100_to_native.sql.
  if psql -X -q -d "$DB" -f "$path" 2>&1 | grep -E "ERROR" | grep -v "get_admin_dashboard_stats() does not exist"; then
    echo "✖ Erreur bloquante dans $f"; exit 1
  fi
done

echo "▶ 3. Données"
# Tables présentes en prod mais absentes des migrations versionnées : signalées, non bloquantes.
pg_restore -d "$DB" --data-only --disable-triggers --no-owner --no-privileges \
  "$EXPORT/data_public.dump" 2>&1 | grep -E "error|ERROR" | sort -u || true
pg_restore -d "$DB" --data-only --disable-triggers --no-owner --no-privileges --table=users \
  "$EXPORT/data_auth.dump" 2>&1 | grep -E "error|ERROR" | sort -u || true

echo "▶ 4-5. Conversion native"
$PSQL -d "$DB" -f "$ROOT/db/native/100_to_native.sql"
$PSQL -d "$DB" -f "$ROOT/db/native/110_realtime_notify.sql"
if [[ "${DROP_RLS:-0}" == "1" ]]; then $PSQL -d "$DB" -f "$ROOT/db/native/120_drop_rls_optional.sql"; fi

echo "▶ 6. Contrôle des comptages (source Supabase vs cible)"
while IFS=, read -r tbl n; do
  case "$tbl" in
    auth.users) tgt="public.users" ;;
    storage.objects) continue ;;
    *) tgt="$tbl" ;;
  esac
  m=$(psql -X -At -d "$DB" -c "select count(*) from $tgt" 2>/dev/null || echo "ABSENT")
  [[ "$n" == "$m" ]] && echo "  ✔ $tgt : $n" || echo "  ✖ $tgt : source=$n cible=$m"
done < "$EXPORT/rowcounts.csv"
echo "✔ Import terminé"
