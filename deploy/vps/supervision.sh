#!/usr/bin/env bash
# =============================================================================
# supervision.sh — sondes de production Domicares, avec alerte sur changement d'état
#
# Usage :
#   deploy/vps/supervision.sh externe [URL]          # depuis l'extérieur (workflow supervision.yml)
#   deploy/vps/supervision.sh interne [--alerte]     # sur le VPS, dans le clone, par cron
#
# externe : /api/health (API et base), page d'accueil, mode FedaPay attendu, échéance du
#           certificat TLS. Détecte aussi un VPS injoignable.
# interne : conteneurs arrêtés ou unhealthy, fraîcheur et statut de la dernière sauvegarde,
#           webhooks FedaPay en échec définitif, paiements sans aucun webhook reçu (webhook mal
#           configuré, cas du webhook sandbox n° 1471), espace disque.
#
# Sortie : une ligne « OK … » ou « KO … » par contrôle ; code 1 si un contrôle est KO.
# --alerte : POST {"text": …} vers SUPERVISION_ALERT_URL (à défaut BACKUP_ALERT_URL, même format
#            que backup.sh) seulement quand l'état change (première panne, puis rétablissement),
#            état gardé dans deploy/vps/.supervision-state. Aucune donnée personnelle n'est lue.
#
# Réglages (environnement, ou .env du VPS en mode interne) :
#   SUPERVISION_URL              URL publique (externe, défaut https://domicares.life)
#   SUPERVISION_PAGE_STATUS      code attendu pour « / » (défaut 200 ; 401 pour la recette protégée)
#   SUPERVISION_FEDAPAY_ENV      sandbox | live : mode attendu de /api/payments/config (vide : non vérifié)
#   SUPERVISION_TLS_MIN_DAYS     jours minimum avant expiration du certificat (défaut 14 ; 0 : non vérifié)
#   SUPERVISION_DISK_MAX         pourcentage d'occupation disque maximal (défaut 85)
#   SUPERVISION_ALERT_URL        webhook d'alerte (Slack, Discord /slack, Mattermost, ntfy…)
# =============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-}"
shift || true

env_get() { { grep -E "^$1=" "$HERE/.env" 2>/dev/null || true; } | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+|[[:space:]]+$//g; s/^"(.*)"$/\1/'; }
setting() { local v="${!1:-}"; [ -n "$v" ] || v="$(env_get "$1")"; printf '%s' "${v:-$2}"; }

FAILS=()
ok() { echo "OK  $*"; }
ko() { echo "KO  $*"; FAILS+=("$*"); }

# ---------------------------------------------------------------------------- externe
externe() {
  local url="${1:-$(setting SUPERVISION_URL https://domicares.life)}"
  url="${url%/}"
  local page_status fedapay_env tls_days body code
  page_status="$(setting SUPERVISION_PAGE_STATUS 200)"
  fedapay_env="$(setting SUPERVISION_FEDAPAY_ENV '')"
  tls_days="$(setting SUPERVISION_TLS_MIN_DAYS 14)"

  body="$(curl -sS -m 15 -w '\n%{http_code}' "$url/api/health" 2>&1)"; code="${body##*$'\n'}"; body="${body%$'\n'*}"
  if [ "$code" = 200 ] && grep -q '"status":"ok"' <<<"$body" && grep -q '"database":"ok"' <<<"$body"; then
    ok "API et base : $url/api/health"
  else
    ko "API ou base indisponible : $url/api/health → HTTP $code $(tr -s '\n' ' ' <<<"$body" | head -c 120)"
  fi

  code="$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$url/" 2>/dev/null || echo 000)"
  if [ "$code" = "$page_status" ]; then ok "page d'accueil : HTTP $code"; else ko "page d'accueil : HTTP $code (attendu $page_status)"; fi

  if [ -n "$fedapay_env" ]; then
    body="$(curl -sS -m 15 "$url/api/payments/config" 2>/dev/null || true)"
    if grep -q "\"environment\":\"$fedapay_env\"" <<<"$body"; then ok "FedaPay en mode $fedapay_env"
    else ko "FedaPay : mode attendu $fedapay_env, reçu $(grep -o '"environment":"[a-z]*"' <<<"$body" || echo 'aucune réponse')"; fi
  fi

  if [ "$tls_days" != 0 ] && [[ "$url" == https://* ]]; then
    local host end left
    host="${url#https://}"; host="${host%%/*}"
    end="$(openssl s_client -connect "$host:443" -servername "$host" </dev/null 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
    if [ -z "$end" ]; then ko "certificat TLS de $host illisible"
    else
      left=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
      if [ "$left" -ge "$tls_days" ]; then ok "certificat TLS : $left jours restants"; else ko "certificat TLS de $host : $left jours restants (minimum $tls_days)"; fi
    fi
  fi
}

# ---------------------------------------------------------------------------- interne
interne() {
  [ -f "$HERE/.env" ] || { ko ".env absent dans $HERE"; return; }
  local dc=(docker compose --project-directory "$HERE")
  local line service state health n

  local ps; ps="$("${dc[@]}" ps --all --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null)" || { ko "docker compose ps impossible"; return; }
  [ -n "$ps" ] || ko "aucun conteneur de la pile"
  n=0
  while read -r service state health; do
    [ -n "$service" ] || continue
    if [ "$state" != running ]; then ko "conteneur $service : $state"
    elif [ "$health" = unhealthy ]; then ko "conteneur $service : unhealthy"
    else n=$((n + 1)); fi
  done <<<"$ps"
  [ "$n" -gt 0 ] && ok "$n conteneurs en service"

  local interval last age status
  interval="$(setting BACKUP_INTERVAL_SECONDS 86400)"
  if [ -f "$HERE/backups/last-success" ]; then
    last="$(cat "$HERE/backups/last-success")"; age=$(( $(date +%s) - last ))
    if [ "$age" -lt $(( interval + 7200 )) ]; then ok "dernière sauvegarde réussie il y a $(( age / 3600 )) h"
    else ko "dernière sauvegarde réussie il y a $(( age / 3600 )) h (intervalle $(( interval / 3600 )) h)"; fi
  else ko "aucune sauvegarde réussie (backups/last-success absent)"; fi
  if [ -f "$HERE/backups/last-status.json" ] && grep -q '"status":"failed"' "$HERE/backups/last-status.json"; then
    ko "dernière sauvegarde en échec : $(grep -o '"step":"[^"]*"' "$HERE/backups/last-status.json")"
  fi

  local db sql
  db="$(env_get POSTGRES_DB)"
  # Agrégats seulement : aucun contenu de webhook, de paiement ni de personne.
  sql="select
    (select count(*) from public.webhook_events where processing_status = 'permanently_failed' and created_at > now() - interval '24 hours'),
    (select count(*) from public.webhook_events where processing_status = 'failed'),
    (select count(*) from public.payments where fedapay_transaction_id is not null and created_at between now() - interval '26 hours' and now() - interval '2 hours'),
    (select count(*) from public.webhook_events where created_at > now() - interval '26 hours');"
  local row perm failed paid hooks
  if row="$("${dc[@]}" exec -T postgres psql -U postgres -d "$db" -X -A -t -F ' ' -c "$sql" 2>/dev/null)" && [ -n "$row" ]; then
    read -r perm failed paid hooks <<<"$row"
    if [ "$perm" -gt 0 ]; then ko "$perm webhook(s) FedaPay en échec définitif sur 24 h (fedapay-observe.sh)"; else ok "aucun webhook en échec définitif sur 24 h"; fi
    [ "$failed" -le 5 ] || ko "$failed webhook(s) en attente de rejeu"
    if [ "$paid" -gt 0 ] && [ "$hooks" -eq 0 ]; then
      ko "$paid paiement(s) FedaPay sur 24 h sans aucun webhook reçu : URL ou secret du webhook FedaPay à vérifier"
    else ok "webhooks FedaPay reçus ($hooks sur 26 h pour $paid paiement(s))"; fi
  else
    ko "requête de supervision PostgreSQL impossible"
  fi

  local max used
  max="$(setting SUPERVISION_DISK_MAX 85)"
  used="$(df -P "$HERE" | awk 'NR==2 { sub("%", "", $5); print $5 }')"
  if [ "${used:-100}" -le "$max" ]; then ok "disque occupé à $used %"; else ko "disque occupé à $used % (maximum $max %)"; fi
}

# ---------------------------------------------------------------------------- alerte
alerter() {
  local url state_file previous current message
  url="$(setting SUPERVISION_ALERT_URL "$(setting BACKUP_ALERT_URL '')")"
  state_file="$HERE/.supervision-state"
  previous="$(cat "$state_file" 2>/dev/null || echo ok)"
  if [ "${#FAILS[@]}" -eq 0 ]; then current=ok; else current="$(printf '%s\n' "${FAILS[@]}" | sha256sum | cut -c1-16)"; fi
  [ "$current" = "$previous" ] && return 0
  if [ "$current" = ok ]; then message="Domicares ($(hostname)) : supervision rétablie, tous les contrôles sont OK"
  else message="Domicares ($(hostname)) : $(printf '%s ; ' "${FAILS[@]}")"; message="${message% ; }"; fi
  message="${message//\\/\\\\}"; message="${message//\"/\\\"}"  # JSON : messages produits ici, sans caractère de contrôle
  if [ -z "$url" ]; then echo "(aucune URL d'alerte : SUPERVISION_ALERT_URL ou BACKUP_ALERT_URL)" >&2
  elif ! curl -fsS -m 20 -H 'Content-Type: application/json' -d "{\"text\":\"$message\"}" "$url" >/dev/null; then
    echo "✖ alerte non envoyée" >&2; return 0  # état non enregistré : nouvel essai au prochain passage
  fi
  echo "$current" >"$state_file"
}

case "$MODE" in
  externe) externe "${1:-}" ;;
  interne) interne; [ "${1:-}" = --alerte ] && alerter ;;
  *) echo "usage : $0 externe [URL] | interne [--alerte]" >&2; exit 2 ;;
esac
[ "${#FAILS[@]}" -eq 0 ]
