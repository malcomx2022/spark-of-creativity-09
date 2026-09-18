/**
 * Mapping des statuts FedaPay vers statuts normalisés internes
 * 
 * Statuts FedaPay possibles:
 * - pending: Transaction initiée, en attente de paiement
 * - approved: Paiement approuvé
 * - declined: Paiement refusé
 * - canceled: Transaction annulée
 * - refunded: Remboursement effectué
 */

export type NormalizedPaymentStatus = 
  | 'initiated'   // Transaction créée
  | 'pending'     // En attente de paiement
  | 'authorized'  // Paiement autorisé mais pas encore capturé
  | 'paid'        // Paiement complété avec succès
  | 'failed'      // Échec du paiement
  | 'canceled'    // Transaction annulée
  | 'refunded'    // Remboursement effectué
  | 'chargeback'; // Litige client

export type FedaPayStatus = 
  | 'pending'
  | 'approved' 
  | 'declined'
  | 'canceled'
  | 'refunded'
  | 'transferred';

/**
 * Table de correspondance FedaPay -> Statut normalisé
 */
export const STATUS_MAPPING: Record<FedaPayStatus, NormalizedPaymentStatus> = {
  'pending': 'pending',
  'approved': 'paid',
  'declined': 'failed',
  'canceled': 'canceled',
  'refunded': 'refunded',
  'transferred': 'paid', // Considéré comme payé une fois transféré
};

/**
 * Convertit un statut FedaPay en statut normalisé
 */
export function normalizeStatus(fedaPayStatus: string): NormalizedPaymentStatus {
  const status = fedaPayStatus as FedaPayStatus;
  return STATUS_MAPPING[status] || 'pending';
}

/**
 * Vérifie si un statut est final (ne changera plus)
 */
export function isFinalStatus(status: NormalizedPaymentStatus): boolean {
  return ['paid', 'failed', 'canceled', 'refunded', 'chargeback'].includes(status);
}

/**
 * Vérifie si un statut permet le remboursement
 */
export function canBeRefunded(status: NormalizedPaymentStatus): boolean {
  return status === 'paid';
}
