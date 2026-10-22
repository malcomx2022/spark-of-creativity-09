#!/usr/bin/env bash
# =============================================================================
# bascule.sh — Jour J sur le VPS : reprise des données Supabase dans la pile deploy/vps
#
# Usage (en tant que deploy, dans le clone du dépôt) :
#   deploy/vps/bascule.sh ~/export/<horodatage> [--skip-files] [--no-restart] [--force]
#
# Enchaîne, à partir d'un export contrôlé (scripts/supabase/check-export.sh) :
#   1. contrôle de l'export, des clients (pg_restore 17) et de .env
#   2. sauvegarde de la base actuelle dans deploy/vps/backups (pg_dump)
#   3. arrêt de api + worker, recréation de la base, scripts/db/import-native.sh (DROP_RLS=1)
#   4. fichiers Storage → MinIO (client mc via docker, mêmes buckets et mêmes chemins)
#   5. redémarrage de api + worker, /api/health, comptages
# Sans le VPS : DRY_RUN=1 affiche les commandes sans les exécuter.
# Idempotent : relançable après correction (la base est recréée à chaque passage).
# =============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"          # deploy/vps
ROOT="$(cd "$HERE/../.." && pwd)"
EXPORT="${1:?dossier export requis (ex. ~/export/20260909T001732Z)}"; shift || true
SKIP_FILES=0; NO_RESTART=0; FORCE=0
for a in "$@"; do case "$a" in
  --skip-files) SKIP_FILES=1 ;; --no-restart) NO_RESTART=1 ;; --force) FORCE=1 ;;
  *) echo "option inconnue : $a"; exit 2 ;;
esac; done
DRY="${DRY_RUN:-0}"
PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"
[[ -d "$PGBIN" ]] && export PATH="$PGBIN:$PATH"
run() { if [[ "$DRY" == "1" ]]; then echo "  \$ $*"; else "$@"; fi; }
ok()  { echo "  ✔ $*"; }
ko()  { echo "  ✖ $*"; exit 1; }
env_get() { grep -E "^$1=" "$HERE/.env" | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+|[[:space:]]+$//g; s/^"(.*)"$/\1/'; }
compose() { run docker compose --project-directory "$HERE" "$@"; }

echo "▶ 1. Préconditions"
[[ -f "$HERE/.env" ]] || ko "$HERE/.env absent (cp .env.example .env puis compléter)"
POSTGRES_DB="$(env_get POSTGRES_DB)"; POSTGRES_PASSWORD="$(env_get POSTGRES_PASSWORD)"
APP_PASSWORD="$(env_get DOMICARES_APP_PASSWORD)"; MIG_PASSWORD="$(env_get DOMICARES_MIGRATOR_PASSWORD)"
S3_ACCESS_KEY="$(env_get S3_ACCESS_KEY)"; S3_SECRET_KEY="$(env_get S3_SECRET_KEY)"
B_DOC="$(env_get S3_BUCKET_DOCUMENTS)"; B_AVA="$(env_get S3_BUCKET_AVATARS)"; B_ATT="$(env_get S3_BUCKET_ATTACHMENTS)"
DOMAIN="$(env_get DOMAIN)"
for v in POSTGRES_DB POSTGRES_PASSWORD APP_PASSWORD S3_ACCESS_KEY S3_SECRET_KEY; do
  [[ -n "${!v}" && "${!v}" != change-me* ]] || ko "$v non renseigné dans .env"
done
ok ".env : base $POSTGRES_DB, buckets ${B_DOC:-documents}/${B_AVA:-avatars}/${B_ATT:-message-attachments}"
[[ -d "$EXPORT" ]] || ko "dossier export introuvable : $EXPORT"
command -v pg_restore >/dev/null || ko "pg_restore absent (install-vps.sh installe postgresql-client-17)"
pg_restore --version | grep -q ' 17\.' || ko "pg_restore $(pg_restore --version | awk '{print $3}') : version 17 requise (PGBIN=$PGBIN)"
command -v docker >/dev/null || ko "docker absent"
# Docker crée les points de montage manquants en root : « ./backups » appartient donc à root
# dès le premier « up » de postgres, et deploy ne peut plus y écrire. On le signale au lieu de
# mourir sur un « Permission denied » au milieu d'un contrôle.
mkdir -p "$HERE/backups" 2>/dev/null || true
if [[ ! -w "$HERE/backups" ]]; then
  ko "$HERE/backups non inscriptible par $(id -un) (créé par docker en root) : sudo chown -R $(id -un):$(id -gn) $HERE/backups"
fi
LOG="$(mktemp -t bascule-check-XXXXXX.log)"
IMPORT_LOG="$(mktemp -t bascule-import-XXXXXX.log)"
trap 'rm -f "$LOG" "$IMPORT_LOG"' EXIT
if "$ROOT/scripts/supabase/check-export.sh" "$EXPORT" > "$LOG" 2>&1; then
  ok "check-export.sh : aucun bloquant"
else
  grep -E '✖|Résultat' "$LOG" | sed 's/^/    /'
  if [[ "$SKIP_FILES" == "1" ]] && ! grep -E '✖' "$LOG" | grep -qv 'manifest.json absent'; then
    ok "seul bloquant : fichiers Storage absents (--skip-files demandé)"
  elif [[ "$FORCE" == "1" ]]; then echo "  ⚠ bloquants ignorés (--force)"
  else ko "export non conforme : corriger, ou --skip-files / --force"; fi
fi
if [[ "$SKIP_FILES" == "0" && ! -f "$EXPORT/storage/manifest.json" ]]; then
  ko "$EXPORT/storage/manifest.json absent : relancer export-storage.mjs, ou --skip-files"
fi
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD="$POSTGRES_PASSWORD"
if [[ "$DRY" != "1" ]]; then
  pg_isready -q || ko "PostgreSQL injoignable sur 127.0.0.1:5432 (docker compose up -d postgres)"
  ok "PostgreSQL joignable"
fi

echo "▶ 2. Sauvegarde de la base actuelle"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ "$DRY" == "1" ]] || psql -X -At -d postgres -c "select 1 from pg_database where datname='$POSTGRES_DB'" | grep -q 1; then
  run pg_dump -Fc -Z 6 -d "$POSTGRES_DB" -f "$HERE/backups/pre-bascule-$STAMP.dump" && ok "backups/pre-bascule-$STAMP.dump"
else
  ok "base $POSTGRES_DB inexistante : rien à sauvegarder"
fi

echo "▶ 3. Base : arrêt de l'API, recréation, import"
compose stop api worker
run psql -X -v ON_ERROR_STOP=1 -q -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$POSTGRES_DB' AND pid <> pg_backend_pid()" \
  -c "DROP DATABASE IF EXISTS $POSTGRES_DB" -c "CREATE DATABASE $POSTGRES_DB"
if [[ "$DRY" == "1" ]]; then
  echo "  \$ DROP_RLS=1 PGBIN=$PGBIN DOMICARES_APP_PASSWORD=… scripts/db/import-native.sh $EXPORT $POSTGRES_DB"
else
  DROP_RLS=1 PGBIN="$PGBIN" DOMICARES_APP_PASSWORD="$APP_PASSWORD" DOMICARES_MIGRATOR_PASSWORD="$MIG_PASSWORD" \
    "$ROOT/scripts/db/import-native.sh" "$EXPORT" "$POSTGRES_DB" | tee "$IMPORT_LOG"
  grep -q '✖' "$IMPORT_LOG" && ko "écarts de comptage : voir la sortie ci-dessus"
  ok "import terminé, comptages identiques"
fi

if [[ "$SKIP_FILES" == "0" ]]; then
  echo "▶ 4. Fichiers Storage → MinIO"
  # MinIO n'est pas exposé sur l'hôte : le client mc tourne dans le réseau docker de la pile.
  NET="$( [[ "$DRY" == "1" ]] && echo '<réseau-compose>' || docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$(docker compose --project-directory "$HERE" ps -q minio)" )"
  [[ -n "$NET" ]] || ko "conteneur minio introuvable (docker compose up -d minio)"
  MC_SCRIPT="mc alias set local http://minio:9000 \"\$S3_ACCESS_KEY\" \"\$S3_SECRET_KEY\" >/dev/null"
  for pair in "documents:${B_DOC:-documents}" "avatars:${B_AVA:-avatars}" "message-attachments:${B_ATT:-message-attachments}"; do
    src="${pair%%:*}"; bucket="${pair#*:}"
    MC_SCRIPT="$MC_SCRIPT; mc mb -p local/$bucket >/dev/null"
    MC_SCRIPT="$MC_SCRIPT; if [ -d /export/$src ]; then mc mirror --overwrite /export/$src local/$bucket; fi"
    MC_SCRIPT="$MC_SCRIPT; echo \"  $bucket : \$(mc ls -r local/$bucket | wc -l) objet(s)\""
  done
  # Client mc compilé depuis sa release épinglée (minio.Dockerfile) : quay.io refuse le pull anonyme.
  MC_IMAGE="domicares-minio-mc:RELEASE.2025-08-13T08-35-41Z"
  docker image inspect "$MC_IMAGE" >/dev/null 2>&1 || run docker build -f "$HERE/minio.Dockerfile" --target mc -t "$MC_IMAGE" "$HERE"
  run docker run --rm --network "$NET" -e S3_ACCESS_KEY="$S3_ACCESS_KEY" -e S3_SECRET_KEY="$S3_SECRET_KEY" \
    -v "$EXPORT/storage:/export:ro" --entrypoint sh "$MC_IMAGE" -c "$MC_SCRIPT"
  if [[ "$DRY" != "1" ]]; then
    expected=$(python3 -c "import json,sys; print(len([f for f in json.load(open(sys.argv[1]))['files'] if not f.get('error')]))" "$EXPORT/storage/manifest.json" 2>/dev/null || echo "?")
    echo "  attendu d'après le manifeste : $expected objet(s) au total"
  fi
else
  echo "▶ 4. Fichiers Storage : ignorés (--skip-files)"
fi

if [[ "$NO_RESTART" == "0" ]]; then
  echo "▶ 5. Redémarrage et vérifications"
  compose up -d api worker
  if [[ "$DRY" != "1" ]]; then
    for i in $(seq 1 30); do
      if docker compose --project-directory "$HERE" exec -T api node -e "fetch('http://localhost:3000/api/health').then(r=>r.json()).then(j=>{console.log(JSON.stringify(j));process.exit(j.status==='ok'?0:1)}).catch(()=>process.exit(1))" 2>/dev/null; then
        ok "API en service sur la base importée"; break
      fi
      [[ "$i" == 30 ]] && ko "API injoignable après 5 min : docker compose logs api"
      sleep 10
    done
    psql -X -At -d "$POSTGRES_DB" -c "select 'comptes '||count(*) from users" -c "select 'praticiens '||count(*) from practitioners" | sed 's/^/  /'
    [[ -n "$DOMAIN" ]] && echo "  puis : curl -s https://$DOMAIN/api/health (une fois le DNS basculé)"
  fi
else
  echo "▶ 5. API et worker laissés arrêtés (--no-restart)"
fi

echo "✔ Bascule terminée. Reste : webhook FedaPay live → https://${DOMAIN:-<domaine>}/api/webhooks/fedapay (FEDAPAY_WEBHOOK_SECRET dans .env, docker compose up -d api), DNS → VPS, maintenance OFF (doc 04 §4)."
