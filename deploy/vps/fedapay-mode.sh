#!/usr/bin/env bash
# =============================================================================
# fedapay-mode.sh — bascule sandbox ⇄ live de FedaPay sur le VPS
#
# Usage (en tant que deploy, dans le clone du dépôt) :
#   deploy/vps/fedapay-mode.sh status            # mode courant, sans afficher les secrets
#   deploy/vps/fedapay-mode.sh sandbox           # campagne de recette (docs/migration-postgresql/09-CAMPAGNE-SANDBOX.md)
#   deploy/vps/fedapay-mode.sh live              # retour en production
#
# Attend dans deploy/vps/.env les deux jeux de clés (voir .env.example) :
#   FEDAPAY_SANDBOX_PUBLIC_KEY / FEDAPAY_SANDBOX_SECRET_KEY / FEDAPAY_SANDBOX_WEBHOOK_SECRET
#   FEDAPAY_LIVE_PUBLIC_KEY    / FEDAPAY_LIVE_SECRET_KEY    / FEDAPAY_LIVE_WEBHOOK_SECRET
# et recopie le jeu demandé dans FEDAPAY_MODE / FEDAPAY_PUBLIC_KEY / FEDAPAY_SECRET_KEY /
# FEDAPAY_WEBHOOK_SECRET (les seules variables lues par l'API), après sauvegarde de .env.
# Puis redémarre api + worker et contrôle /api/health et le mode vu par le conteneur.
# Sans le VPS : DRY_RUN=1 affiche les commandes sans les exécuter ni modifier .env.
# =============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"          # deploy/vps
MODE="${1:-status}"
DRY="${DRY_RUN:-0}"
ENV_FILE="$HERE/.env"
run() { if [[ "$DRY" == "1" ]]; then echo "  \$ $*"; else "$@"; fi; }
ok()  { echo "  ✔ $*"; }
ko()  { echo "  ✖ $*"; exit 1; }
env_get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+|[[:space:]]+$//g; s/^"(.*)"$/\1/'; }
mask() { local v="$1"; [[ -z "$v" ]] && { echo "(vide)"; return; }; echo "${v:0:6}…${v: -3} (${#v} car.)"; }
compose() { run docker compose --project-directory "$HERE" "$@"; }

[[ -f "$ENV_FILE" ]] || ko "$ENV_FILE absent"
case "$MODE" in
  status)
    echo "▶ FedaPay dans $ENV_FILE"
    echo "  FEDAPAY_PROVIDER      = $(env_get FEDAPAY_PROVIDER)"
    echo "  FEDAPAY_MODE          = $(env_get FEDAPAY_MODE)"
    echo "  FEDAPAY_PUBLIC_KEY    = $(mask "$(env_get FEDAPAY_PUBLIC_KEY)")"
    echo "  FEDAPAY_SECRET_KEY    = $(mask "$(env_get FEDAPAY_SECRET_KEY)")"
    echo "  FEDAPAY_WEBHOOK_SECRET= $(mask "$(env_get FEDAPAY_WEBHOOK_SECRET)")"
    for j in SANDBOX LIVE; do
      if [[ -n "$(env_get FEDAPAY_${j}_SECRET_KEY)" ]]; then ok "jeu $j présent"; else echo "  · jeu $j absent (FEDAPAY_${j}_PUBLIC_KEY / _SECRET_KEY / _WEBHOOK_SECRET)"; fi
    done
    if docker compose --project-directory "$HERE" ps --status running --services 2>/dev/null | grep -qx api; then
      echo "  conteneur api : FEDAPAY_MODE=$(docker compose --project-directory "$HERE" exec -T api printenv FEDAPAY_MODE 2>/dev/null || echo '?')"
    fi
    exit 0 ;;
  sandbox|live) ;;
  *) echo "usage : $0 status | sandbox | live"; exit 2 ;;
esac

J="$(echo "$MODE" | tr '[:lower:]' '[:upper:]')"
PUB="$(env_get FEDAPAY_${J}_PUBLIC_KEY)"; SEC="$(env_get FEDAPAY_${J}_SECRET_KEY)"; WH="$(env_get FEDAPAY_${J}_WEBHOOK_SECRET)"
echo "▶ 1. Jeu de clés $J"
[[ -n "$PUB" && -n "$SEC" && -n "$WH" ]] || ko "FEDAPAY_${J}_PUBLIC_KEY, FEDAPAY_${J}_SECRET_KEY et FEDAPAY_${J}_WEBHOOK_SECRET doivent être renseignés dans .env"
case "$MODE" in
  sandbox) [[ "$PUB" == pk_sandbox_* && "$SEC" == sk_sandbox_* ]] || ko "les clés $J ne ressemblent pas à des clés sandbox (pk_sandbox_… / sk_sandbox_…)" ;;
  live)    [[ "$PUB" == pk_live_*    && "$SEC" == sk_live_*    ]] || ko "les clés $J ne ressemblent pas à des clés live (pk_live_… / sk_live_…)" ;;
esac
ok "clés $J : $(mask "$PUB") / $(mask "$SEC") / webhook $(mask "$WH")"

echo "▶ 2. Écriture de .env (sauvegarde .env.bak-<horodatage>)"
if [[ "$DRY" == "1" ]]; then
  echo "  \$ FEDAPAY_MODE=$MODE, FEDAPAY_PUBLIC_KEY, FEDAPAY_SECRET_KEY, FEDAPAY_WEBHOOK_SECRET ← jeu $J"
else
  cp "$ENV_FILE" "$ENV_FILE.bak-$(date -u +%Y%m%dT%H%M%SZ)"
  set_var() { # remplace la ligne KEY=… (commentaire de fin conservé) ou l'ajoute
    local k="$1" v="$2"
    if grep -qE "^$k=" "$ENV_FILE"; then
      local tail; tail="$(grep -E "^$k=" "$ENV_FILE" | head -1 | sed -nE 's/^[^#]*([[:space:]]+#.*)$/\1/p')"
      awk -v k="$k" -v v="$v" -v t="$tail" 'BEGIN{done=0} $0 ~ "^"k"=" && !done {print k"="v t; done=1; next} {print}' "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
    else
      printf '%s=%s\n' "$k" "$v" >> "$ENV_FILE"
    fi
  }
  set_var FEDAPAY_MODE "$MODE"
  set_var FEDAPAY_PUBLIC_KEY "$PUB"
  set_var FEDAPAY_SECRET_KEY "$SEC"
  set_var FEDAPAY_WEBHOOK_SECRET "$WH"
  chmod 600 "$ENV_FILE"
fi
ok "FEDAPAY_MODE=$MODE"

echo "▶ 3. Redémarrage api + worker"
compose up -d api worker
if [[ "$DRY" != "1" ]]; then
  for i in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1 || docker compose --project-directory "$HERE" exec -T api wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then break; fi
    sleep 2
  done
  SEEN="$(docker compose --project-directory "$HERE" exec -T api printenv FEDAPAY_MODE 2>/dev/null || true)"
  [[ "$SEEN" == "$MODE" ]] && ok "conteneur api en FEDAPAY_MODE=$SEEN" || ko "le conteneur api voit FEDAPAY_MODE='$SEEN' (attendu $MODE) : vérifier docker compose up"
  DOMAIN="$(env_get DOMAIN)"
  H="$(curl -fsS "https://$DOMAIN/api/health" 2>/dev/null || true)"
  [[ -n "$H" ]] && ok "https://$DOMAIN/api/health → $H" || echo "  · /api/health indisponible via https://$DOMAIN (Caddy ?)"
fi
echo
echo "Rappel : le secret de webhook doit être celui de l'endpoint $MODE déclaré dans le tableau de bord FedaPay"
echo "         (https://$(env_get DOMAIN)/api/webhooks/fedapay). Mode live = argent réel."
