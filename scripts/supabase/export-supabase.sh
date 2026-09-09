#!/usr/bin/env bash
# =============================================================================
# export-supabase.sh — Récupération COMPLÈTE des données depuis Supabase
#
# Produit un dossier export/<horodatage>/ contenant :
#   schema_public.sql        schéma public tel qu'il existe réellement en prod
#   data_public.dump         données de toutes les tables public (format custom)
#   data_auth.dump           auth.users + auth.identities (hash bcrypt inclus)
#   data_storage_meta.dump   métadonnées storage.buckets / storage.objects
#   rowcounts.csv            nombre de lignes par table (contrôle post-import)
#   roles.sql                rôles PostgreSQL (info)
#   storage/                 fichiers des buckets (via export-storage.mjs)
#
# Pré-requis :
#   - pg_dump de MÊME version majeure que le serveur Supabase (PG 17 → postgresql-client-17)
#   - SUPABASE_DB_URL : URL de connexion DIRECTE (pas le pooler en mode transaction) :
#       postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres
#     ou via pooler session (IPv4 ; préfixe aws-0/aws-1 selon le projet, voir Connect) :
#       postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-1-<region>.pooler.supabase.com:5432/postgres
#     Liaison instable : ajouter ?connect_timeout=30&keepalives=1&keepalives_idle=30&keepalives_interval=10&keepalives_count=3&tcp_user_timeout=60000
#   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY pour les fichiers Storage (optionnel)
#
# Le projet doit être ACTIF (un projet "paused" doit être restauré depuis le dashboard
# Supabase : Project Settings → General → Restore project).
# =============================================================================
set -euo pipefail
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL manquant}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${EXPORT_DIR:-export}/$STAMP"
mkdir -p "$OUT"
echo "▶ Export vers $OUT"

echo "▶ Version serveur / client"
psql "$SUPABASE_DB_URL" -At -c "select version()" | tee "$OUT/server_version.txt"
pg_dump --version | tee "$OUT/client_version.txt"

echo "▶ Schéma public (référence : compare-le avec supabase/migrations)"
pg_dump "$SUPABASE_DB_URL" --schema-only --schema=public --no-owner --no-privileges > "$OUT/schema_public.sql"

echo "▶ Données public (format custom, restaurable avec pg_restore)"
pg_dump "$SUPABASE_DB_URL" --data-only --schema=public --no-owner --no-privileges -Fc -f "$OUT/data_public.dump"

echo "▶ Comptes auth (auth.users + auth.identities : e-mail, téléphone, hash bcrypt, metadata)"
pg_dump "$SUPABASE_DB_URL" --data-only --schema=auth --table=auth.users --table=auth.identities \
  --no-owner --no-privileges -Fc -f "$OUT/data_auth.dump"

echo "▶ Métadonnées Storage"
pg_dump "$SUPABASE_DB_URL" --data-only --schema=storage --table=storage.buckets --table=storage.objects \
  --no-owner --no-privileges -Fc -f "$OUT/data_storage_meta.dump" || echo "  (storage ignoré)"

echo "▶ Comptage des lignes (contrôle de cohérence après import)"
psql "$SUPABASE_DB_URL" -At -F, <<'SQL' > "$OUT/rowcounts.csv"
select 'auth.users', count(*) from auth.users
union all select 'storage.objects', count(*) from storage.objects
union all
select 'public.'||t.tablename, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.tablename), false, true, '')))[1]::text::bigint
from pg_tables t where t.schemaname='public' order by 1;
SQL
cat "$OUT/rowcounts.csv"

echo "▶ Rôles (information)"
pg_dumpall "$SUPABASE_DB_URL" --roles-only > "$OUT/roles.sql" 2>/dev/null || echo "  (pg_dumpall non autorisé sur Supabase : normal)"

if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "▶ Fichiers Storage"
  node "$(dirname "$0")/export-storage.mjs" "$OUT/storage"
else
  echo "⚠ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents : fichiers Storage non exportés"
fi

( cd "$OUT" && sha256sum * 2>/dev/null > SHA256SUMS ) || true
echo "✔ Export terminé : $OUT"
