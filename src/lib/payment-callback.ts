/**
 * Lecture des paramètres de la page de retour FedaPay (`/payment/callback/:paymentId`).
 *
 * FedaPay ajoute lui-même `?id=<transaction>&status=<statut>` à l'URL de retour. L'ancienne URL
 * portait déjà `?appointment_id=<id>` : la page recevait alors `?appointment_id=X?id=258&status=approved`
 * et lisait `appointment_id = "X?id=258"` (08-REVUE-FEDAPAY M8). L'identifiant du paiement est
 * désormais dans le chemin ; les anciens paramètres restent acceptés pour les transactions créées
 * avant le changement, en coupant la valeur au premier `?`.
 */
export interface CallbackParams {
  paymentId: string | null;
  /** Identifiant de transaction FedaPay (`id` ajouté par FedaPay, ou `transaction_id` historique). */
  transactionId: string | null;
  appointmentId: string | null;
  /** Statut tel que FedaPay le rapporte dans l'URL (`approved`, `declined`, `canceled`…) : indicatif, le serveur fait foi. */
  fedapayStatus: string | null;
}

export function resolveCallbackParams(routePaymentId: string | undefined, search: URLSearchParams): CallbackParams {
  const merged = new URLSearchParams();
  for (const [key, value] of search.entries()) {
    const cut = value.indexOf('?');
    if (cut === -1) {
      merged.set(key, value);
      continue;
    }
    merged.set(key, value.slice(0, cut));
    for (const [k2, v2] of new URLSearchParams(value.slice(cut + 1)).entries()) merged.set(k2, v2);
  }
  const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    paymentId: clean(routePaymentId) ?? clean(merged.get('payment_id')),
    transactionId: clean(merged.get('id')) ?? clean(merged.get('transaction_id')),
    appointmentId: clean(merged.get('appointment_id')),
    fedapayStatus: clean(merged.get('status')),
  };
}

export type CallbackOutcome = 'paid' | 'closed' | 'open';

/**
 * `paid` : encaissé (y compris remboursé ensuite) ; `closed` : terminé sans encaissement ;
 * `open` : encore en cours chez FedaPay, la page doit attendre et non annoncer un échec (M9).
 */
export function classifyPaymentStatus(status: string): CallbackOutcome {
  if (status === 'paid' || status === 'refunded' || status === 'partially_refunded') return 'paid';
  if (status === 'failed' || status === 'canceled' || status === 'chargeback') return 'closed';
  return 'open';
}

const LABELS: Record<string, string> = {
  initiated: 'En attente',
  pending: 'En attente',
  authorized: 'En attente',
  paid: 'Payé',
  failed: 'Échoué',
  canceled: 'Annulé',
  refunded: 'Remboursé',
  partially_refunded: 'Partiellement remboursé',
  chargeback: 'Contesté',
};

export function paymentStatusLabel(status: string): string {
  return LABELS[status] ?? status;
}
