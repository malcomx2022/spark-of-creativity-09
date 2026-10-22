#!/usr/bin/env bash
# =============================================================================
# contact-check.sh — réception réelle du formulaire de contact (à lancer sur le VPS, dossier deploy/vps).
#
#   ./contact-check.sh             # message test direct par Resend vers CONTACT_RECIPIENT_EMAIL
#   ./contact-check.sh --via-site  # en plus, POST https://$DOMAIN/api/contact (chaîne complète)
#
# Le message test part du même expéditeur (RESEND_FROM_EMAIL) que le formulaire ; le script suit son
# statut chez Resend (delivered / bounced / complained) jusqu'à 2 minutes. « delivered » signifie que
# le serveur du destinataire l'a accepté : vérifier ensuite la boîte (et les indésirables) avec l'objet
# affiché. --via-site consomme une des 5 soumissions/heure de l'IP. La clé n'est jamais affichée.
# =============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
API="${RESEND_API_URL:-https://api.resend.com}"
env_get() { grep -E "^$1=" "$HERE/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+|[[:space:]]+$//g; s/^"(.*)"$/\1/'; }
# Champ texte d'une réponse JSON, compacte ou formatée (pas de jq requis sur le VPS).
json_field() { grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E 's/.*:[[:space:]]*"(.*)"$/\1/'; }
fail() { echo "✖ $*" >&2; exit 1; }

[[ -f "$HERE/.env" ]] || fail ".env absent dans $HERE"
KEY="$(env_get RESEND_API_KEY)"; FROM="$(env_get RESEND_FROM_EMAIL)"; TO="$(env_get CONTACT_RECIPIENT_EMAIL)"; DOMAIN="$(env_get DOMAIN)"
[[ "$(env_get EMAIL_PROVIDER)" == "resend" ]] || fail "EMAIL_PROVIDER doit valoir resend (sinon le formulaire répond 503 en production)"
[[ -n "$KEY" && "$KEY" != change-me* ]] || fail "RESEND_API_KEY absent"
[[ "$TO" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || fail "CONTACT_RECIPIENT_EMAIL absent ou invalide"
[[ "${TO,,}" != "${FROM,,}" ]] || fail "CONTACT_RECIPIENT_EMAIL ne doit pas être l'expéditeur ($FROM) : boîte d'envoi seulement"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SUBJECT="DomiCares — test de réception du contact $STAMP"

echo "▶ Envoi direct par Resend : $FROM → $TO"
resp="$(curl -sS -m 20 -w '\n%{http_code}' -X POST "$API/emails" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d "{\"from\":\"$FROM\",\"to\":[\"$TO\"],\"subject\":\"$SUBJECT\",\"text\":\"Message de test envoyé par contact-check.sh ($STAMP). Aucune action requise.\"}")" || fail "Resend injoignable"
code="$(tail -1 <<<"$resp")"; body="$(sed '$d' <<<"$resp")"
[[ "$code" == 200 ]] || fail "Resend a refusé l'envoi (HTTP $code) : $(json_field message <<<"$body") — domaine expéditeur vérifié ? clé valide ?"
ID="$(json_field id <<<"$body")"
echo "  ✔ accepté par Resend (id $ID)"

status="inconnu"
for _ in $(seq 1 24); do
  sleep "${CONTACT_CHECK_INTERVAL:-5}"
  r="$(curl -sS -m 20 -w '\n%{http_code}' "$API/emails/$ID" -H "Authorization: Bearer $KEY")" || continue
  c="$(tail -1 <<<"$r")"; b="$(sed '$d' <<<"$r")"
  if [[ "$c" == 401 || "$c" == 403 ]]; then status="restricted"; break; fi
  status="$(json_field last_event <<<"$b")"
  case "$status" in delivered|bounced|complained|failed) break ;; esac
done
case "$status" in
  delivered) echo "  ✔ livré au serveur de $TO" ;;
  bounced|complained|failed) fail "statut Resend : $status — adresse de réception à corriger (CONTACT_RECIPIENT_EMAIL)" ;;
  restricted) echo "  ⚠ statut non lisible avec une clé à accès restreint : le consulter dans le tableau de bord Resend (id $ID)" ;;
  *) echo "  ⚠ statut Resend : ${status:-inconnu} après 2 minutes" ;;
esac

if [[ "${1:-}" == "--via-site" ]]; then
  SITE="${CONTACT_CHECK_SITE:-https://$DOMAIN}"
  echo "▶ Chaîne complète : POST $SITE/api/contact"
  r="$(curl -sS -m 30 -w '\n%{http_code}' -X POST "$SITE/api/contact" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Recette exploitation\",\"email\":\"$TO\",\"subject\":\"Recette $STAMP\",\"message\":\"Message de recette envoyé par contact-check.sh ($STAMP).\"}")" || fail "site injoignable"
  c="$(tail -1 <<<"$r")"
  case "$c" in
    201) echo "  ✔ formulaire accepté (objet « DomiCares — contact : Recette $STAMP ») ; id Resend : docker compose logs api | grep 'message de contact'" ;;
    429) fail "limite de 5 envois/heure atteinte pour cette IP : réessayer plus tard" ;;
    503) fail "formulaire indisponible (503) : CONTACT_RECIPIENT_EMAIL/EMAIL_PROVIDER dans le conteneur ? docker compose up -d api après édition du .env" ;;
    *) fail "réponse inattendue HTTP $c" ;;
  esac
fi
echo "▶ À vérifier dans la boîte $TO (indésirables compris) : « $SUBJECT »$([[ "${1:-}" == "--via-site" ]] && echo " et « DomiCares — contact : Recette $STAMP » (Répondre doit viser $TO)")"
