/**
 * Configuration et constantes pour le système de paiement
 * 
 * Mapping des statuts normalisés pour affichage côté client
 */

export type PaymentStatus = 
  | 'initiated'
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'failed'
  | 'canceled'
  | 'refunded'
  | 'chargeback';

export type PayoutStatus = 
  | 'pending'
  | 'held'
  | 'ready'
  | 'paid'
  | 'failed';

/**
 * Labels en français pour les statuts de paiement
 */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  initiated: 'Initialisé',
  pending: 'En attente',
  authorized: 'Autorisé',
  paid: 'Payé',
  failed: 'Échec',
  canceled: 'Annulé',
  refunded: 'Remboursé',
  chargeback: 'Contesté',
};

/**
 * Labels en français pour les statuts de versement
 */
export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  pending: 'En attente',
  held: 'En rétention',
  ready: 'Prêt',
  paid: 'Versé',
  failed: 'Échec',
};

/**
 * Variantes de badge pour les statuts de paiement
 */
export const PAYMENT_STATUS_VARIANTS: Record<PaymentStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  initiated: 'outline',
  pending: 'secondary',
  authorized: 'outline',
  paid: 'default',
  failed: 'destructive',
  canceled: 'outline',
  refunded: 'secondary',
  chargeback: 'destructive',
};

/**
 * Vérifie si un statut de paiement est final
 */
export function isPaymentFinal(status: PaymentStatus): boolean {
  return ['paid', 'failed', 'canceled', 'refunded', 'chargeback'].includes(status);
}

/**
 * Vérifie si un paiement peut être remboursé
 */
export function canBeRefunded(status: PaymentStatus): boolean {
  return status === 'paid';
}

/**
 * Formatte un montant en XOF
 */
export function formatAmount(amount: number, currency: string = 'XOF'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Configuration des opérateurs mobile money
 */
export const MOBILE_MONEY_PROVIDERS = {
  mtn: {
    name: 'MTN Mobile Money',
    icon: '📱',
    color: '#FFCC00',
  },
  orange: {
    name: 'Orange Money',
    icon: '🍊',
    color: '#FF6600',
  },
  moov: {
    name: 'Moov Money',
    icon: '💰',
    color: '#009FE3',
  },
} as const;

export type MobileMoneyProvider = keyof typeof MOBILE_MONEY_PROVIDERS;
