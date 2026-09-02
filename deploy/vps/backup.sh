#!/bin/sh
# Sauvegarde quotidienne PostgreSQL (format custom, compressé) + rotation.
# Pour une copie hors-site : rclone copy /backups s3:domicares-backups (cron sur l'hôte).
set -e
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /backups
pg_dump -Fc -Z 6 -f "/backups/domicares-$STAMP.dump"
find /backups -name 'domicares-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
echo "backup ok: domicares-$STAMP.dump"
