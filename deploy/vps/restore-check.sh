#!/bin/sh
# Vérifie une sauvegarde de backup.sh, la restaure dans une cible VIDE puis contrôle le résultat :
#   1. empreintes (SHA256SUMS, objects.sha256) ;
#   2. rôles puis pg_restore --exit-on-error dans la base cible (refus si elle contient des tables) ;
#   3. objets dans le S3 cible (refus si un bucket cible contient déjà des objets) ;
#   4. chaque chemin de stockage référencé en SQL existe dans la sauvegarde, avec son empreinte,
#      et l'objet relu dans le S3 cible a la même empreinte.
# Cible : PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE et RESTORE_S3_ENDPOINT/RESTORE_S3_ACCESS_KEY/
# RESTORE_S3_SECRET_KEY (noms distincts des S3_* de production, pour éviter toute confusion).
# Utilisé par restore-drill.sh (exercice isolé) et par la procédure de restauration (document 07).
set -eu

SRC="${1:?usage : restore-check.sh <dossier de sauvegarde>}"
BUCKETS="documents=${S3_BUCKET_DOCUMENTS:-documents} avatars=${S3_BUCKET_AVATARS:-avatars} message-attachments=${S3_BUCKET_ATTACHMENTS:-message-attachments}"
MC_CONFIG="$(mktemp -d)"
REPORT="$(mktemp -d)"
trap 'rm -rf "$MC_CONFIG" "$REPORT"' EXIT
mc() { command mc --config-dir "$MC_CONFIG" --quiet --no-color "$@"; }
fail() { echo "✖ $*" >&2; exit 1; }
start=$(date +%s)
cd "$SRC"

echo "▶ 1. Empreintes de la sauvegarde $(basename "$PWD")"
sha256sum -c SHA256SUMS >/dev/null || fail "SHA256SUMS : fichier de sauvegarde altéré"
sha256sum -c objects.sha256 >/dev/null || fail "objects.sha256 : objet altéré ou manquant dans la sauvegarde"
echo "  ✔ $(wc -l < objects.sha256 | tr -d ' ') objet(s) et fichiers de base intègres"

echo "▶ 2. Cibles vides (vérifiées avant toute écriture)"
for i in $(seq 1 60); do pg_isready -q && break; sleep 1; done
pg_isready -q || fail "PostgreSQL cible injoignable"
tables=$(psql -XAtc "select count(*) from pg_tables where schemaname = 'public'")
[ "$tables" = 0 ] || fail "base cible ${PGDATABASE:?PGDATABASE requis} non vide ($tables table(s)) : restauration refusée"
for i in $(seq 1 60); do mc alias set dst "${RESTORE_S3_ENDPOINT:?RESTORE_S3_ENDPOINT requis}" "${RESTORE_S3_ACCESS_KEY:?}" "${RESTORE_S3_SECRET_KEY:?}" >/dev/null 2>&1 && mc ls dst >/dev/null 2>&1 && break; sleep 1; done
mc ls dst >/dev/null || fail "S3 cible injoignable"
for pair in $BUCKETS; do
  bucket="${pair#*=}"
  ! mc ls "dst/$bucket" >/dev/null 2>&1 || [ -z "$(mc ls --recursive "dst/$bucket" | head -1)" ] || fail "bucket cible $bucket non vide : restauration refusée"
done
echo "  ✔ base ${PGHOST:-local}/$PGDATABASE et S3 $RESTORE_S3_ENDPOINT vides"

echo "▶ 3. PostgreSQL"
# roles.sql contient aussi des rôles déjà présents (postgres) : erreurs tolérées, résultat vérifié ensuite.
psql -X -q -v ON_ERROR_STOP=0 -f roles.sql >/dev/null 2>&1 || true
for role in anon authenticated service_role domicares_app; do
  [ "$(psql -XAtc "select count(*) from pg_roles where rolname = '$role'")" = 1 ] || fail "rôle $role absent après roles.sql"
done
pg_restore --exit-on-error --dbname="$PGDATABASE" postgres.dump
for t in users profiles appointments payments files; do
  echo "  ✔ $t : $(psql -XAtc "select count(*) from public.$t") ligne(s)"
done

echo "▶ 4. Objets"
for pair in $BUCKETS; do
  bucket="${pair#*=}"
  mc mb -p "dst/$bucket" >/dev/null
  mkdir -p "objects/$bucket" 2>/dev/null || true
  [ ! -d "objects/$bucket" ] || [ -z "$(ls -A "objects/$bucket")" ] || mc mirror "objects/$bucket" "dst/$bucket" >/dev/null
  expected=$(grep -c "  objects/$bucket/" objects.sha256 || true)
  restored=$(mc ls --recursive "dst/$bucket" | grep -c . || true)
  [ "$expected" = "$restored" ] || fail "$bucket : $restored objet(s) restauré(s) pour $expected attendu(s)"
  echo "  ✔ $bucket : $restored objet(s)"
done

echo "▶ 5. Références SQL → objets"
psql -XAt -F '|' > "$REPORT/refs" <<'SQL'
select 'files.file_path', file_path from public.files
union all select 'practitioners.id_document_url', id_document_url from public.practitioners where id_document_url <> ''
union all select 'practitioners.license_document_url', license_document_url from public.practitioners where license_document_url <> ''
union all select 'practitioners.insurance_document_url', insurance_document_url from public.practitioners where insurance_document_url <> ''
union all select 'practitioners.image', image from public.practitioners where image <> ''
union all select 'profiles.avatar_url', avatar_url from public.profiles where avatar_url <> ''
union all select 'messages.attachment_url', attachment_url from public.messages where attachment_url <> ''
SQL
# Même résolution que StorageService.resolve : préfixe de dossier → bucket, sinon bucket documents.
awk -F'|' -v bdoc="${S3_BUCKET_DOCUMENTS:-documents}" -v bava="${S3_BUCKET_AVATARS:-avatars}" -v batt="${S3_BUCKET_ATTACHMENTS:-message-attachments}" '
  function target(p,   i, first, rest) {
    i = index(p, "/"); first = i ? substr(p, 1, i - 1) : p; rest = i ? substr(p, i + 1) : ""
    if (first == "avatars") return bava "/" rest
    if (first == "message-attachments") return batt "/" rest
    if (first == "documents" || first == "practitioner-documents") return bdoc "/" rest
    return bdoc "/" p
  }
  NR == FNR { hash[substr($0, 75)] = substr($0, 1, 64); next }
  {
    path = substr($0, index($0, "|") + 1)
    if (path ~ /^https?:\/\//) { external++; next }
    key = target(path)
    if (key in hash) { print key "|" hash[key] > (dir "/resolved"); resolved++ }
    else { print $1 "|" path > (dir "/missing"); missing++ }
  }
  END { printf "%d %d %d\n", resolved, missing, external > (dir "/counts") }
' dir="$REPORT" objects.sha256 "$REPORT/refs"
read -r resolved missing external < "$REPORT/counts"
echo "  références : $resolved résolue(s), $missing manquante(s), $external URL externe(s) non vérifiée(s)"
if [ "$missing" -gt 0 ]; then sed 's/^/    ✖ /' "$REPORT/missing" | head -20 >&2; fail "$missing référence(s) sans objet dans la sauvegarde"; fi
if [ -s "$REPORT/resolved" ]; then
  sort -u "$REPORT/resolved" | while IFS='|' read -r key sum; do
    [ "$(mc cat "dst/$key" | sha256sum | cut -d' ' -f1)" = "$sum" ] || { echo "empreinte différente dans le S3 cible : $key" > "$REPORT/mismatch"; break; }
  done
  [ ! -s "$REPORT/mismatch" ] || fail "$(cat "$REPORT/mismatch")"
fi
echo "  ✔ objets référencés relus dans le S3 cible avec la même empreinte"
echo "✔ restauration vérifiée en $(( $(date +%s) - start )) s"
