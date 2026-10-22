#!/bin/sh
# Sauvegarde Domicares : PostgreSQL + objets des trois buckets S3, manifeste et empreintes,
# copie hors site chiffrée (age + rclone) optionnelle, rétention, statut et alerte d'échec.
# Exécuté par le service « backup » (image domicares-backup, minio.Dockerfile --target backup).
#
# Cohérence SQL/objets : objets copiés avant ET après le pg_dump (instantané transactionnel).
# Tout objet référencé par le dump existe donc dans la sauvegarde, sauf s'il a été créé puis
# supprimé entre le dump et le second passage. Les objets en quarantaine (_pending/) sont exclus.
#
# Résultat : $BACKUP_DIR/<STAMP>/ { postgres.dump, roles.sql, objects/<bucket>/…, objects.sha256,
# manifest.json, SHA256SUMS } ; $BACKUP_DIR/last-success (epoch) et last-status.json.
# Restauration et vérification : restore-check.sh ; exercice isolé : restore-drill.sh.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$BACKUP_DIR/$STAMP.partial"
BUCKETS="documents=${S3_BUCKET_DOCUMENTS:-documents} avatars=${S3_BUCKET_AVATARS:-avatars} message-attachments=${S3_BUCKET_ATTACHMENTS:-message-attachments}"
MC_CONFIG="$(mktemp -d)"
TMP_OFFSITE=""
STEP="initialisation"

mc() { command mc --config-dir "$MC_CONFIG" --quiet --no-color "$@"; }
rclone() { command rclone --config /dev/null -q "$@"; }

status() { # status <ok|failed> <détail JSON supplémentaire>
  printf '{"status":"%s","stamp":"%s","step":"%s","at":"%s"%s}\n' "$1" "$STAMP" "$STEP" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$2" > "$BACKUP_DIR/last-status.json"
}

finish() {
  rc=$?
  rm -rf "$MC_CONFIG"
  [ -z "$TMP_OFFSITE" ] || rm -f "$TMP_OFFSITE"
  [ "$rc" -eq 0 ] && return 0
  rm -rf "$WORK"
  msg="Sauvegarde Domicares $STAMP en échec (étape : $STEP, code $rc)"
  echo "✖ $msg" >&2
  status failed ",\"code\":$rc" || true
  if [ -n "${BACKUP_ALERT_URL:-}" ]; then
    curl -fsS -m 20 -H 'Content-Type: application/json' -d "{\"text\":\"$msg\"}" "$BACKUP_ALERT_URL" >/dev/null || echo "✖ alerte non envoyée à BACKUP_ALERT_URL" >&2
  fi
  exit "$rc"
}
trap finish EXIT

mkdir -p "$BACKUP_DIR"
if [ -n "${BACKUP_OFFSITE_REMOTE:-}" ] && [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
  STEP="configuration"
  echo "BACKUP_AGE_RECIPIENT requis avec BACKUP_OFFSITE_REMOTE : aucune copie hors site non chiffrée" >&2
  exit 2
fi
mkdir -p "$WORK/objects"

STEP="connexion S3"
# Au démarrage de la pile, MinIO peut ne pas répondre encore : jusqu'à 60 s d'attente.
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29; do
  mc alias set src "${S3_ENDPOINT:?S3_ENDPOINT requis}" "${S3_ACCESS_KEY:?S3_ACCESS_KEY requis}" "${S3_SECRET_KEY:?S3_SECRET_KEY requis}" >/dev/null 2>&1 && break
  sleep 2
done
mc alias set src "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null

mirror_objects() {
  for pair in $BUCKETS; do
    bucket="${pair#*=}"
    mkdir -p "$WORK/objects/$bucket"
    mc mirror --overwrite --exclude "_pending/*" "src/$bucket" "$WORK/objects/$bucket" >/dev/null
  done
}

STEP="objets (premier passage)"
mirror_objects

STEP="PostgreSQL"
pg_dump -Fc -Z 6 -f "$WORK/postgres.dump"
pg_restore --list "$WORK/postgres.dump" >/dev/null
# Rôles du cluster (absents d'un pg_dump), sans mots de passe : à redéfinir depuis le .env à la restauration.
pg_dumpall --roles-only --no-role-passwords -f "$WORK/roles.sql"

STEP="objets (second passage)"
mirror_objects

STEP="manifeste"
cd "$WORK"
find objects -type f | LC_ALL=C sort | while IFS= read -r file; do sha256sum "$file"; done > objects.sha256
count=$(wc -l < objects.sha256 | tr -d ' ')
bytes=$(find objects -type f -exec stat -c %s {} + | awk '{ s += $1 } END { printf "%d", s }')
schema=$(pg_restore --schema-only -f - postgres.dump | sha256sum | cut -d' ' -f1)
dump_sha=$(sha256sum postgres.dump | cut -d' ' -f1)
app_version=$(cat "$BACKUP_DIR/.app-version" 2>/dev/null | head -1 | tr -cd 'A-Za-z0-9._-') || true
pg_version=$(psql -XAtc 'show server_version' | tr -cd 'A-Za-z0-9._ ()-')
{
  printf '{\n  "format": 1,\n  "stamp": "%s",\n  "created_at": "%s",\n' "$STAMP" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '  "app_version": "%s",\n  "postgres": {"version": "%s", "database": "%s", "dump_sha256": "%s", "schema_sha256": "%s"},\n' \
    "${app_version:-inconnue}" "$pg_version" "${PGDATABASE:-}" "$dump_sha" "$schema"
  printf '  "objects": {"count": %s, "bytes": %s, "excluded": "_pending/*"},\n  "buckets": {' "$count" "$bytes"
  sep=''
  for pair in $BUCKETS; do
    folder="${pair%%=*}"; bucket="${pair#*=}"
    n=$(grep -c "  objects/$bucket/" objects.sha256 || true)
    printf '%s"%s": {"folder": "%s", "objects": %s}' "$sep" "$bucket" "$folder" "$n"
    sep=', '
  done
  printf '}\n}\n'
} > manifest.json
sha256sum postgres.dump roles.sql objects.sha256 manifest.json > SHA256SUMS
cd "$BACKUP_DIR"
mv "$WORK" "$BACKUP_DIR/$STAMP"

offsite="non"
if [ -n "${BACKUP_OFFSITE_REMOTE:-}" ]; then
  STEP="copie hors site"
  name="domicares-$STAMP.tar.age"
  TMP_OFFSITE="$BACKUP_DIR/.$name.tmp"
  tar_err="$BACKUP_DIR/.$STAMP.tar-error"
  rm -f "$tar_err"
  ( tar -C "$BACKUP_DIR" -cf - "$STAMP" || echo "échec tar" > "$tar_err" ) | age -r "$BACKUP_AGE_RECIPIENT" -o "$TMP_OFFSITE"
  if [ -s "$tar_err" ]; then rm -f "$tar_err"; echo "archive incomplète" >&2; exit 3; fi
  rclone copyto "$TMP_OFFSITE" "$BACKUP_OFFSITE_REMOTE/$name"
  local_size=$(stat -c %s "$TMP_OFFSITE")
  remote_size=$(rclone lsf --format s "$BACKUP_OFFSITE_REMOTE/$name" | tr -d ' ')
  [ "$local_size" = "$remote_size" ] || { echo "taille distante $remote_size ≠ locale $local_size" >&2; exit 4; }
  rm -f "$TMP_OFFSITE"; TMP_OFFSITE=""
  rclone delete "$BACKUP_OFFSITE_REMOTE" --min-age "${BACKUP_OFFSITE_KEEP_DAYS:-30}d" --include "domicares-*.tar.age"
  offsite="oui"
fi

STEP="rétention"
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*T*Z' -mtime +"$KEEP_DAYS" -exec rm -rf {} +
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '*.partial' -mmin +1440 -exec rm -rf {} +
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'domicares-*.dump' -mtime +"$KEEP_DAYS" -delete

STEP="terminé"
date -u +%s > "$BACKUP_DIR/last-success"
status ok ",\"objects\":$count,\"bytes\":$bytes,\"offsite\":\"$offsite\""
echo "✔ sauvegarde $STAMP : base + $count objet(s) ($bytes octets), copie hors site : $offsite"
