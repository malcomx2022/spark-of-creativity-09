#!/bin/sh
# Exercice de restauration ISOLÉ : PostgreSQL et MinIO jetables sur un réseau docker interne
# (sans accès à la pile de production), restauration de la sauvegarde puis restore-check.sh.
# Aucune donnée de production n'est modifiée ; tout est supprimé à la fin.
#   ./restore-drill.sh                      # dernière sauvegarde de ./backups
#   ./restore-drill.sh backups/<STAMP>      # sauvegarde précise (ex. archive hors site déchiffrée)
# Durée affichée = temps de restauration et de vérification (indicateur RTO, hors transfert hors site).
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
BACKUP="${1:-$(ls -1d "$HERE"/backups/20*Z 2>/dev/null | sort | tail -1)}"
[ -n "$BACKUP" ] && [ -f "$BACKUP/manifest.json" ] || { echo "✖ sauvegarde introuvable (backups/<STAMP>/manifest.json)" >&2; exit 1; }
BACKUP="$(cd "$BACKUP" && pwd)"
BACKUP_IMAGE="${BACKUP_IMAGE:-domicares-backup:pg16-mc-RELEASE.2025-08-13T08-35-41Z}"
MINIO_IMAGE="${MINIO_IMAGE:-domicares-minio:RELEASE.2025-09-07T16-13-09Z}"
PG_IMAGE="${PG_IMAGE:-domicares-postgres:16-alpine-locales}"
ID="domicares-drill-$(date +%s)"
PASS="$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"

cleanup() { docker rm -f "$ID-pg" "$ID-s3" >/dev/null 2>&1 || true; docker network rm "$ID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

for image in "$BACKUP_IMAGE" "$MINIO_IMAGE" "$PG_IMAGE"; do
  docker image inspect "$image" >/dev/null 2>&1 || { echo "✖ image $image absente : docker compose build backup minio postgres" >&2; exit 1; }
done
echo "▶ Exercice isolé ($ID) sur $(basename "$BACKUP")"
start=$(date +%s)
docker network create --internal "$ID" >/dev/null
docker run -d --name "$ID-pg" --network "$ID" -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_DB=domicares \
  -e POSTGRES_INITDB_ARGS="--auth-local=trust --auth-host=trust" "$PG_IMAGE" >/dev/null
docker run -d --name "$ID-s3" --network "$ID" -e MINIO_ROOT_USER=drill -e MINIO_ROOT_PASSWORD="$PASS" "$MINIO_IMAGE" server /data >/dev/null
docker run --rm --network "$ID" \
  -v "$BACKUP:/restore:ro" -v "$HERE/restore-check.sh:/restore-check.sh:ro" \
  -e PGHOST="$ID-pg" -e PGUSER=postgres -e PGPASSWORD="$PASS" -e PGDATABASE=domicares \
  -e RESTORE_S3_ENDPOINT="http://$ID-s3:9000" -e RESTORE_S3_ACCESS_KEY=drill -e RESTORE_S3_SECRET_KEY="$PASS" \
  -e S3_BUCKET_DOCUMENTS="${S3_BUCKET_DOCUMENTS:-documents}" -e S3_BUCKET_AVATARS="${S3_BUCKET_AVATARS:-avatars}" \
  -e S3_BUCKET_ATTACHMENTS="${S3_BUCKET_ATTACHMENTS:-message-attachments}" \
  --entrypoint sh "$BACKUP_IMAGE" /restore-check.sh /restore
echo "✔ exercice réussi en $(( $(date +%s) - start )) s (démarrage des conteneurs compris) ; conteneurs et réseau supprimés"
