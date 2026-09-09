#!/usr/bin/env bash
# =============================================================================
# import-native.sh — Importe un export Supabase dans un PostgreSQL 16 natif
#
# Usage : PGHOST=... PGPORT=5432 PGUSER=postgres PGPASSWORD=... [PGBIN=/usr/lib/postgresql/17/bin] \
#         scripts/db/import-native.sh export/<horodatage> [nom_base]
#
# Étapes :
#   1. crée la base + rôles (010_roles.sql)
#   2. installe le shim Supabase (000) puis rejoue supabase/migrations/* (schéma identique à la prod)
#   3. restaure les DONNÉES public + auth.users (triggers désactivés)
#   4. exécute 100_to_native.sql (public.users, FK, GUC, suppression storage/auth.users)
#   5. exécute 110_realtime_notify.sql ; 120_drop_rls_optional.sql si DROP_RLS=1 ; 130_fixes_heritage.sql
#   6. compare les comptages de lignes avec rowcounts.csv
#
# Pour une base VIERGE (sans données Supabase) : psql -f db/native/010_roles.sql
# puis psql -f db/native/schema.native.sql suffisent.
# =============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EXPORT="${1:?dossier export requis}"
DB="${2:-domicares}"
# Binaires client : PGBIN=/usr/lib/postgresql/17/bin si le pg_dump source était en 17
# (une archive custom pg_dump 17 n'est lisible que par pg_restore >= 17, même vers un serveur 16).
if [[ -n "${PGBIN:-}" ]]; then export PATH="$PGBIN:$PATH"; fi
PSQL="psql -X -v ON_ERROR_STOP=1 -q"
SNAPSHOT="20260126121712_remote_schema.sql"

echo "▶ 0. Contrôle de l'export et des clients"
for f in data_public.dump data_auth.dump rowcounts.csv; do
  [[ -f "$EXPORT/$f" ]] || { echo "✖ $EXPORT/$f manquant (export incomplet ?)"; exit 1; }
done
if ! pg_restore --list "$EXPORT/data_public.dump" >/dev/null 2>"$EXPORT/.pg_restore_check.log"; then
  echo "✖ pg_restore $(pg_restore --version | awk '{print $3}') ne peut pas lire $EXPORT/data_public.dump :"
  sed 's/^/    /' "$EXPORT/.pg_restore_check.log"
  echo "  → installer postgresql-client-17 et relancer avec PGBIN=/usr/lib/postgresql/17/bin"
  exit 1
fi
rm -f "$EXPORT/.pg_restore_check.log"
echo "  client : $(pg_restore --version) ; archive : $(pg_restore --list "$EXPORT/data_public.dump" | grep -c 'TABLE DATA') tables avec données"

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
# Une archive pg_dump 17 émet « SET transaction_timeout = 0 », paramètre inconnu de PostgreSQL 16 :
# l'erreur est sans effet sur les données (pg_restore la compte dans « errors ignored »), on la masque.
restore_data() {
  pg_restore -d "$DB" --data-only --disable-triggers --no-owner --no-privileges "$@" 2>&1 \
    | grep -E "error|ERROR" | grep -v -e "transaction_timeout" -e "errors ignored on restore" | sort -u || true
}
restore_data "$EXPORT/data_public.dump"
restore_data --table=users "$EXPORT/data_auth.dump"

echo "▶ 4-5. Conversion native"
$PSQL -d "$DB" -f "$ROOT/db/native/100_to_native.sql"
$PSQL -d "$DB" -f "$ROOT/db/native/110_realtime_notify.sql"
if [[ "${DROP_RLS:-0}" == "1" ]]; then $PSQL -d "$DB" -f "$ROOT/db/native/120_drop_rls_optional.sql"; fi
$PSQL -d "$DB" -f "$ROOT/db/native/130_fixes_heritage.sql"
$PSQL -d "$DB" -f "$ROOT/db/native/020_grants.sql"

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
