#!/usr/bin/env bash
# =============================================================================
# preflight.sh — « Le VPS est-il prêt pour la bascule ? » (à lancer en tant que deploy, sur le VPS)
#
# Usage : deploy/vps/preflight.sh [~/export/<horodatage>]
#
# Contrôle, sans rien modifier : outils (docker, compose, pg_restore 17), .env complet et cohérent
# avec api/src/config/config.schema.ts (valeurs « change-me », fournisseurs fake/console interdits en
# production, clés FedaPay conformes au mode, VAPID, Twilio, Resend,
# Academy/Akambi et horloge NTP), pile docker (config valide,
# postgres/minio en service), ressources (disque, RAM), DNS du domaine vs IP publique, ports 80/443,
# et l'export si un dossier est donné (check-export.sh). Sortie ✔ / ⚠ / ✖, code 1 si un ✖.
# =============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
EXPORT="${1:-}"
PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"; [[ -d "$PGBIN" ]] && export PATH="$PGBIN:$PATH"
errors=0; warnings=0
ok()   { echo "  ✔ $*"; }
warn() { echo "  ⚠ $*"; warnings=$((warnings + 1)); }
ko()   { echo "  ✖ $*"; errors=$((errors + 1)); }
env_get() { grep -E "^$1=" "$HERE/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+|[[:space:]]+$//g; s/^"(.*)"$/\1/'; }
placeholder() { [[ -z "$1" || "$1" == change-me* || "$1" == *_xxx || "$1" == "<"* ]]; }

echo "▶ 1. Outils"
command -v docker >/dev/null && ok "docker $(docker --version | awk '{print $3}' | tr -d ,)" || ko "docker absent (install-vps.sh)"
docker compose version >/dev/null 2>&1 && ok "docker compose $(docker compose version --short 2>/dev/null)" || ko "plugin docker compose absent"
if command -v pg_restore >/dev/null; then
  pg_restore --version | grep -q ' 17\.' && ok "$(pg_restore --version)" || ko "$(pg_restore --version) : version 17 requise (postgresql-client-17, PGBIN=$PGBIN)"
else ko "pg_restore absent (postgresql-client-17)"; fi
command -v git >/dev/null && ok "git, dépôt $(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null) @ $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null)" || warn "git absent"
[[ "$(id -u)" == "0" ]] && warn "lancé en root : la pile est prévue pour l'utilisateur deploy (groupe docker)"
id -nG 2>/dev/null | grep -qw docker || [[ "$(id -u)" == "0" ]] || ko "utilisateur $(id -un) hors du groupe docker"

echo "▶ 2. Configuration deploy/vps/.env"
if [[ ! -f "$HERE/.env" ]]; then
  ko ".env absent : cp .env.example .env puis compléter"
else
  missing=0
  while IFS= read -r key; do
    grep -qE "^$key=" "$HERE/.env" || { warn "clé absente de .env : $key (valeur par défaut de .env.example)"; missing=$((missing + 1)); }
  done < <(grep -oE '^[A-Z0-9_]+=' "$HERE/.env.example" | tr -d = | sort -u)
  [[ "$missing" == 0 ]] && ok "toutes les clés de .env.example sont présentes"
  bad=$(grep -E '^[A-Z0-9_]+=' "$HERE/.env" | sed -E 's/[[:space:]]+#.*$//' | grep -E '=(change-me|[a-z_]+_xxx$|<)' | cut -d= -f1 | tr '\n' ' ')
  [[ -z "$bad" ]] && ok "aucune valeur « change-me » / « _xxx » restante" || ko "valeurs à remplacer : $bad"
  DOMAIN="$(env_get DOMAIN)"; [[ -n "$DOMAIN" ]] && ok "DOMAIN=$DOMAIN" || ko "DOMAIN vide"
  for v in POSTGRES_PASSWORD DOMICARES_APP_PASSWORD DOMICARES_MIGRATOR_PASSWORD S3_ACCESS_KEY S3_SECRET_KEY PHONE_ENCRYPTION_KEY; do
    placeholder "$(env_get $v)" && ko "$v non renseigné" ; done
  jwt="$(env_get JWT_ACCESS_SECRET)"; [[ ${#jwt} -ge 32 ]] && ok "JWT_ACCESS_SECRET (${#jwt} caractères)" || ko "JWT_ACCESS_SECRET : 32 caractères minimum (openssl rand -hex 32)"
  for pair in "OTP_PROVIDER:fake" "STORAGE_PROVIDER:fake" "FEDAPAY_PROVIDER:fake" "PUSH_PROVIDER:console" "EMAIL_PROVIDER:console" "SMS_PROVIDER:console"; do
    k="${pair%%:*}"; forbidden="${pair#*:}"; val="$(env_get $k)"
    if [[ "$val" == "$forbidden" ]]; then
      case "$k" in OTP_PROVIDER|STORAGE_PROVIDER|FEDAPAY_PROVIDER) ko "$k=$val interdit en production (config.schema.ts)" ;; *) warn "$k=$val : aucun envoi réel (e-mails / SMS / push)" ;; esac
    else ok "$k=$val"; fi
  done
  if [[ "$(env_get EMAIL_PROVIDER)" == "resend" ]]; then placeholder "$(env_get RESEND_API_KEY)" && ko "RESEND_API_KEY requis avec EMAIL_PROVIDER=resend"; fi
  contact="$(env_get CONTACT_RECIPIENT_EMAIL)"; from="$(env_get RESEND_FROM_EMAIL)"
  if [[ -z "$contact" ]]; then warn "CONTACT_RECIPIENT_EMAIL absent : le formulaire public de contact répondra 503 (les autres services restent disponibles)"
  elif [[ "${contact,,}" == "${from,,}" ]]; then ko "CONTACT_RECIPIENT_EMAIL = RESEND_FROM_EMAIL ($from) : adresse d'envoi, les messages de contact n'arriveraient dans aucune boîte lue"
  else ok "CONTACT_RECIPIENT_EMAIL=$contact (réception réelle : ./contact-check.sh)"; fi
  # Domaine expéditeur vérifié chez Resend : sans lui, tout envoi (contact compris) est refusé.
  if [[ "$(env_get EMAIL_PROVIDER)" == "resend" ]] && ! placeholder "$(env_get RESEND_API_KEY)" && command -v curl >/dev/null; then
    sender_domain="${from##*@}"
    domains="$(curl -sS -m 15 -w '\n%{http_code}' "${RESEND_API_URL:-https://api.resend.com}/domains" -H "Authorization: Bearer $(env_get RESEND_API_KEY)" 2>/dev/null)"
    case "$(tail -1 <<<"$domains")" in
      200) if sed '$d' <<<"$domains" | tr -d '[:space:]' | tr '{' '\n' | grep -F "\"name\":\"$sender_domain\"" | grep -q '"status":"verified"'; then ok "domaine expéditeur $sender_domain vérifié chez Resend"
           else ko "domaine expéditeur $sender_domain non vérifié chez Resend (DNS SPF/DKIM) : e-mails et contact refusés"; fi ;;
      401|403) warn "clé Resend à accès restreint : vérification du domaine impossible ici, lancer ./contact-check.sh" ;;
      *) warn "API Resend injoignable : domaine expéditeur non vérifié par ce contrôle" ;;
    esac
  fi
  if [[ "$(env_get OTP_PROVIDER)" == "twilio" ]]; then for v in TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_VERIFY_SERVICE_SID; do placeholder "$(env_get $v)" && ko "$v requis avec OTP_PROVIDER=twilio"; done; fi
  if [[ "$(env_get SMS_PROVIDER)" == "twilio" ]]; then placeholder "$(env_get TWILIO_PHONE_NUMBER)" && ko "TWILIO_PHONE_NUMBER requis avec SMS_PROVIDER=twilio"; fi
  if [[ "$(env_get PUSH_PROVIDER)" == "webpush" ]]; then for v in WEB_PUSH_PUBLIC_KEY WEB_PUSH_PRIVATE_KEY; do placeholder "$(env_get $v)" && ko "$v requis avec PUSH_PROVIDER=webpush (clés VAPID identiques à Supabase, sinon re-souscription push)"; done; fi
  mode="$(env_get FEDAPAY_MODE)"; pk="$(env_get FEDAPAY_PUBLIC_KEY)"; sk="$(env_get FEDAPAY_SECRET_KEY)"
  if [[ "$(env_get FEDAPAY_PROVIDER)" == "fedapay" ]]; then
    placeholder "$(env_get FEDAPAY_WEBHOOK_SECRET)" && ko "FEDAPAY_WEBHOOK_SECRET requis (webhook https://$DOMAIN/api/webhooks/fedapay)"
    case "$mode" in
      live)    [[ "$pk" == pk_live_* && "$sk" == sk_live_* ]] && ok "FedaPay live, clés live" || ko "FEDAPAY_MODE=live mais clés non pk_live_/sk_live_ (system_config.fedapay_mode=live en base)" ;;
      sandbox) [[ "$pk" == pk_sandbox_* && "$sk" == sk_sandbox_* ]] && warn "FedaPay sandbox : à passer en live pour la bascule (la base importée est en mode live)" || ko "FEDAPAY_MODE=sandbox mais clés non pk_sandbox_/sk_sandbox_" ;;
      *) ko "FEDAPAY_MODE=$mode inconnu" ;;
    esac
  fi
  # DomiCares Academy (Akambi, docs/academy/02-RECETTE-PREPRODUCTION.md) : refus des requêtes hors ±5 min.
  if [[ "$(env_get ACADEMY_ENABLED)" == "true" ]]; then
    akambi_url="$(env_get AKAMBI_BASE_URL)"
    [[ "$(env_get AKAMBI_PROVIDER)" == "akambi" ]] && ok "Academy activée, AKAMBI_PROVIDER=akambi" || ko "ACADEMY_ENABLED=true exige AKAMBI_PROVIDER=akambi en production (config.schema.ts)"
    [[ "$akambi_url" == https://* ]] || ko "AKAMBI_BASE_URL=$akambi_url : HTTPS requis"
    for v in AKAMBI_API_KEY AKAMBI_API_SECRET; do placeholder "$(env_get $v)" && ko "$v requis avec l'Academy activée (transmis séparément par Akambi)"; done
    case "$akambi_url" in
      *preprod.*) [[ "$DOMAIN" == staging.* ]] && ok "Akambi préproduction sur $DOMAIN" || warn "Akambi préproduction sur $DOMAIN : réservé à la préproduction DomiCares" ;;
      *) [[ "$DOMAIN" == staging.* ]] && warn "Akambi production ($akambi_url) sur $DOMAIN : la recette se fait sur preprod.akambiconsulting.com" ;;
    esac
    [[ -n "$(env_get AKAMBI_WEBHOOK_SECRETS | tr -d ' ,')" ]] && ok "secret webhook Akambi renseigné (https://$DOMAIN/api/webhooks/akambi)" || warn "AKAMBI_WEBHOOK_SECRETS vide : webhooks Akambi refusés (503), suivi par rapprochement horaire seulement"
    case "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" in
      yes) ok "horloge synchronisée (NTP)" ;;
      no)  ko "horloge non synchronisée (NTP) : Akambi refuse les signatures décalées de plus de 5 min" ;;
      *)   warn "synchronisation de l'horloge non vérifiable (timedatectl) : tolérance Akambi ±5 min" ;;
    esac
  else ok "DomiCares Academy désactivée (ACADEMY_ENABLED=false)"; fi
  [[ "$(env_get COOKIE_SECURE)" == "true" ]] || warn "COOKIE_SECURE devrait être true derrière Caddy (HTTPS)"
  for v in FRONTEND_URL CORS_ORIGINS APP_BASE_URL SITE_URL; do val="$(env_get $v)"; [[ -n "$DOMAIN" && "$val" == *"$DOMAIN"* ]] || warn "$v=$val ne mentionne pas $DOMAIN"; done
fi

echo "▶ 3. Pile docker"
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  ok "démon docker joignable"
  if [[ -f "$HERE/.env" ]]; then
    docker compose --project-directory "$HERE" config -q 2>"$HERE/.preflight-compose.log" && ok "docker-compose.yml + .env valides" || ko "docker compose config : $(head -1 "$HERE/.preflight-compose.log")"
    rm -f "$HERE/.preflight-compose.log"
    minio_release=RELEASE.2025-09-07T16-13-09Z
    if docker image inspect "domicares-minio:$minio_release" >/dev/null 2>&1; then ok "image MinIO domicares-minio:$minio_release présente"
    elif docker image inspect "quay.io/minio/minio:$minio_release" >/dev/null 2>&1; then warn "image MinIO officielle présente : réétiquetée au déploiement, sans compilation"
    else warn "image MinIO absente : construite depuis les sources (docker compose build minio, prévoir ~2 Go de RAM libre)"; fi
    if docker image inspect "domicares-postgres:16-alpine-locales" >/dev/null 2>&1; then ok "image PostgreSQL domicares-postgres:16-alpine-locales présente"
    else warn "image PostgreSQL absente : construite au déploiement (docker compose build postgres, postgres:16-alpine + locales musl)"; fi
    for svc in postgres minio; do
      st=$(docker compose --project-directory "$HERE" ps --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null | awk -v s=$svc '$1==s {print $2" "$3}')
      case "$st" in
        "running healthy"|"running ") ok "$svc en service" ;;
        "") warn "$svc non démarré (docker compose up -d postgres minio)" ;;
        *) ko "$svc : $st" ;;
      esac
    done
    if pg_isready -h 127.0.0.1 -p 5432 -q 2>/dev/null; then
      ok "PostgreSQL joignable sur 127.0.0.1:5432"
      n=$(PGPASSWORD="$(env_get POSTGRES_PASSWORD)" psql -X -At -h 127.0.0.1 -U postgres -d "$(env_get POSTGRES_DB)" -c "select count(*) from users" 2>/dev/null || echo "?")
      [[ "$n" == "?" ]] && warn "base $(env_get POSTGRES_DB) sans table users (sera recréée par bascule.sh)" || ok "base $(env_get POSTGRES_DB) : $n compte(s) actuellement (recréée par bascule.sh)"
      if [[ "$n" != "?" && "$(env_get ACADEMY_ENABLED)" == "true" ]]; then
        t=$(PGPASSWORD="$(env_get POSTGRES_PASSWORD)" psql -X -At -h 127.0.0.1 -U postgres -d "$(env_get POSTGRES_DB)" -c "select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'academy\_%'" 2>/dev/null || echo 0)
        [[ "$t" == "6" ]] && ok "tables academy_* présentes" || ko "tables academy_* absentes ou incomplètes ($t/6) : appliquer 28_academy.sql puis 30_grants.sql (en-tête de db/native/140_academy.sql)"
      fi
    else warn "PostgreSQL injoignable sur 127.0.0.1:5432 (normal si postgres n'est pas démarré)"; fi
  fi
else
  ko "démon docker injoignable"
fi

echo "▶ 3b. Sauvegardes"
if [[ -f "$HERE/.env" ]]; then
  if [[ -n "$(env_get BACKUP_OFFSITE_REMOTE)" ]]; then
    [[ "$(env_get BACKUP_AGE_RECIPIENT)" == age1* ]] && ok "copie hors site chiffrée configurée" || ko "BACKUP_OFFSITE_REMOTE sans BACKUP_AGE_RECIPIENT (age1…) : sauvegarde refusée"
  else warn "aucune copie hors site (BACKUP_OFFSITE_REMOTE) : une perte du VPS emporte les sauvegardes"; fi
  [[ -n "$(env_get BACKUP_ALERT_URL)" ]] && ok "alerte d'échec configurée" || warn "aucune alerte d'échec (BACKUP_ALERT_URL)"
fi
if [[ -f "$HERE/backups/last-success" ]]; then
  age_h=$(( ( $(date +%s) - $(cat "$HERE/backups/last-success") ) / 3600 ))
  (( age_h <= 26 )) && ok "dernière sauvegarde réussie il y a ${age_h} h" || ko "dernière sauvegarde réussie il y a ${age_h} h (voir backups/last-status.json)"
else warn "aucune sauvegarde réussie à ce jour (backups/last-success)"; fi
echo "▶ 4. Ressources"
avail=$(df -BG --output=avail "$HERE" 2>/dev/null | tail -1 | tr -dc 0-9); [[ -n "$avail" ]] && { [[ "$avail" -ge 15 ]] && ok "disque : ${avail} Go libres" || ko "disque : ${avail} Go libres (< 15 Go : images + base + fichiers + sauvegardes)"; }
mem=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo 2>/dev/null); [[ -n "$mem" ]] && { [[ "$mem" -ge 4 ]] && ok "RAM : ${mem} Go" || warn "RAM : ${mem} Go (< 4 Go : réduire PG_SHARED_BUFFERS)"; }
swapon --show 2>/dev/null | grep -q . && ok "swap actif" || warn "pas de swap (install-vps.sh en crée 2 Go)"

echo "▶ 5. Réseau"
DOMAIN="${DOMAIN:-$(env_get DOMAIN)}"
pub=$(curl -4 -s --max-time 5 https://api.ipify.org 2>/dev/null || curl -4 -s --max-time 5 https://ifconfig.me 2>/dev/null || echo "")
[[ -n "$pub" ]] && ok "IP publique : $pub" || warn "IP publique non déterminée"
if [[ -n "$DOMAIN" ]]; then
  WWW="$(env_get WWW_DOMAIN)"; WWW="${WWW:-www.localhost}"
  [[ "$WWW" == *.localhost ]] && ok "WWW_DOMAIN=$WWW (pas de certificat demandé pour le www : recette)"
  for h in "$DOMAIN" $( [[ "$WWW" == *.localhost ]] || echo "$WWW" ); do
    res=$(getent ahostsv4 "$h" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')
    if [[ -z "$res" ]]; then warn "DNS $h : aucun enregistrement A"
    elif [[ -n "$pub" && "$res" == *"$pub"* ]]; then ok "DNS $h → $res(ce VPS)"
    else warn "DNS $h → $res(pas encore ce VPS : bascule DNS à faire le jour J, TTL 300 s)"; fi
  done
fi
# « ss -p » ne montre le processus que pour les sockets de l'utilisateur courant : lancé en
# tant que deploy, un service tenu par root apparaît sans propriétaire et faisait conclure à
# tort à un serveur web tiers. On interroge alors docker, seule source lisible sans privilège.
for p in 80 443; do
  holder=$(ss -ltnpH "sport = :$p" 2>/dev/null | head -1)
  if [[ -z "$holder" ]]; then ok "port $p libre (Caddy le prendra)"
  elif [[ "$holder" == *docker* || "$holder" == *caddy* ]]; then ok "port $p tenu par docker/Caddy"
  elif docker ps --format '{{.Ports}}' 2>/dev/null | grep -q ":$p->"; then
    ok "port $p publié par un conteneur docker (nom du processus illisible sans root)"
  elif [[ "$holder" != *"users:("* ]]; then
    warn "port $p occupé, propriétaire illisible sans privilège : sudo ss -ltnp \"sport = :$p\""
  else ko "port $p occupé : $holder"; fi
done
# « ufw status » exige root : lancé en tant que deploy il échoue et faisait conclure à tort
# que le pare-feu était inactif. L'état du service, lui, se lit sans privilège.
if command -v ufw >/dev/null; then
  if [[ "$(id -u)" == "0" ]]; then
    ufw status 2>/dev/null | grep -q "Status: active" && ok "ufw actif" || warn "ufw inactif"
  elif systemctl is-active --quiet ufw 2>/dev/null; then
    ok "ufw actif (service systemd)"
  else
    warn "ufw : service arrêté ou état illisible (vérifier avec « sudo ufw status »)"
  fi
fi

if [[ -n "$EXPORT" ]]; then
  echo "▶ 6. Export $EXPORT"
  if [[ -d "$EXPORT" ]]; then
    if "$ROOT/scripts/supabase/check-export.sh" "$EXPORT" > "$HERE/.preflight-export.log" 2>&1; then ok "check-export.sh : 0 bloquant ($(grep -c '✔' "$HERE/.preflight-export.log") ✔)"
    else ko "check-export.sh : $(grep -E '^Résultat' "$HERE/.preflight-export.log")"; grep -E '✖' "$HERE/.preflight-export.log" | sed 's/^/    /'; fi
    rm -f "$HERE/.preflight-export.log"
  else ko "dossier export introuvable"; fi
fi

echo
echo "Résultat : $errors bloquant(s), $warnings avertissement(s)"
[[ "$errors" == 0 ]] && echo "→ VPS prêt : deploy/vps/bascule.sh ${EXPORT:-~/export/<horodatage>}" || echo "→ corriger les ✖ avant bascule.sh"
exit $(( errors > 0 ? 1 : 0 ))
