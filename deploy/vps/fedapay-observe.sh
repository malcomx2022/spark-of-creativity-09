#!/usr/bin/env bash
# =============================================================================
# fedapay-observe.sh — état des paiements, reversements, remboursements et webhooks
#
# Usage (en tant que deploy, dans le clone du dépôt) :
#   deploy/vps/fedapay-observe.sh [N]      # N dernières lignes par table (défaut 10)
#
# Lit la base du conteneur postgres (rôle postgres) et n'affiche aucune donnée personnelle :
# ni nom, ni téléphone, ni e-mail — seulement identifiants, montants, statuts, dates.
# À utiliser pendant la campagne sandbox (docs/migration-postgresql/09-CAMPAGNE-SANDBOX.md)
# pour reporter les résultats sans copier de lignes brutes.
# =============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
N="${1:-10}"
env_get() { grep -E "^$1=" "$HERE/.env" | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+|[[:space:]]+$//g; s/^"(.*)"$/\1/'; }
DB="$(env_get POSTGRES_DB)"
q() { docker compose --project-directory "$HERE" exec -T postgres psql -U postgres -d "$DB" -X -P pager=off -c "$1"; }

echo "▶ Mode FedaPay du conteneur api : $(docker compose --project-directory "$HERE" exec -T api printenv FEDAPAY_MODE 2>/dev/null || echo '?')"
echo
echo "▶ Paiements (derniers $N)"
q "select left(id::text,8) as id, left(coalesce(appointment_id,''),8) as rdv, amount, net_amount as net, status, payout_status as payout, payment_method as via, fedapay_transaction_id as tx, to_char(created_at,'MM-DD HH24:MI') as cree, to_char(updated_at,'MM-DD HH24:MI') as maj from public.payments order by created_at desc limit $N;"
echo "▶ Reversements (derniers $N)"
q "select left(id::text,8) as id, left(practitioner_id::text,8) as prat, amount, status, payment_method as via, transaction_ids[1] as depot, account_details->>'fedapay_status' as fedapay, to_char(created_at,'MM-DD HH24:MI') as cree, to_char(processed_at,'MM-DD HH24:MI') as traite, left(account_details->>'error',60) as erreur from public.practitioner_payouts order by created_at desc limit $N;"
echo "▶ Remboursements (derniers $N)"
q "select left(id::text,8) as id, left(payment_id::text,8) as paiement, refund_amount as montant, status, provider_refund_id as reference, to_char(created_at,'MM-DD HH24:MI') as cree, to_char(processed_at,'MM-DD HH24:MI') as traite from public.payment_refunds order by created_at desc limit $N;"
echo "▶ Webhooks reçus (derniers $N)"
q "select left(event_id,40) as event_id, event_type, processing_status as statut, retry_count as essais, left(coalesce(error_message,''),60) as erreur, to_char(created_at,'MM-DD HH24:MI:SS') as recu from public.webhook_events order by created_at desc limit $N;"
echo "▶ Événements de paiement (derniers $N)"
q "select left(payment_id::text,8) as paiement, event_type, to_char(created_at,'MM-DD HH24:MI:SS') as quand from public.payment_events order by created_at desc limit $N;"
echo "▶ Soldes praticiens non nuls"
q "select left(practitioner_id::text,8) as prat, balance_available as dispo, balance_pending as attente, balance_on_hold as retenu, to_char(last_payout_at,'MM-DD HH24:MI') as dernier_reversement from public.practitioner_balances where balance_available <> 0 or balance_pending <> 0 or balance_on_hold <> 0 order by updated_at desc limit $N;"
echo "▶ Équilibre du grand livre (débits = crédits attendu)"
q "select coalesce(sum(debit),0) as debits, coalesce(sum(credit),0) as credits, coalesce(sum(debit)-sum(credit),0) as ecart from public.ledger_entries;"
