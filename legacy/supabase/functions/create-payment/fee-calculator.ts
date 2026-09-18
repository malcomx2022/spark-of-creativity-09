/**
 * Calculateur de frais et commissions pour les paiements
 * 
 * Règles:
 * - Commission plateforme: % du montant total
 * - Frais passerelle: fixe + % du montant
 * - Arrondi: 2 décimales, mode half-up
 * - Montant net praticien = montant - commission - frais
 */

export interface FeeConfig {
  commissionRate: number;        // Ex: 0.37 pour 37% (taux Domicares)
  gatewayFeeFixed: number;        // Ex: 0 XOF
  gatewayFeePercentage: number;   // Ex: 0.02 pour 2%
  gatewayFeePaidBy: 'patient' | 'platform';
  roundingDecimals: number;       // Ex: 2
}

export interface FeeBreakdown {
  amount: number;              // Montant total de la transaction
  commissionAmount: number;    // Commission de la plateforme
  gatewayFeesAmount: number;   // Frais de la passerelle
  feesAmount: number;          // Total des frais
  netAmount: number;           // Montant net pour le praticien
  currency: string;
}

/**
 * Arrondi half-up à N décimales
 */
function roundHalfUp(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Calcule la répartition des frais pour un paiement
 */
export function calculateFees(
  amount: number,
  currency: string,
  config: FeeConfig
): FeeBreakdown {
  // Commission plateforme (pourcentage du montant)
  const commissionAmount = roundHalfUp(
    amount * config.commissionRate,
    config.roundingDecimals
  );

  // Frais passerelle (fixe + pourcentage)
  const gatewayFeesAmount = roundHalfUp(
    config.gatewayFeeFixed + (amount * config.gatewayFeePercentage),
    config.roundingDecimals
  );

  // Total des frais déduits du praticien
  let feesAmount: number;
  let netAmount: number;

  if (config.gatewayFeePaidBy === 'platform') {
    // La plateforme paie les frais de passerelle
    // Le praticien paie uniquement la commission
    feesAmount = commissionAmount;
    netAmount = amount - commissionAmount;
  } else {
    // Le patient/praticien paie les frais de passerelle
    feesAmount = commissionAmount + gatewayFeesAmount;
    netAmount = amount - feesAmount;
  }

  return {
    amount,
    commissionAmount,
    gatewayFeesAmount,
    feesAmount,
    netAmount: roundHalfUp(netAmount, config.roundingDecimals),
    currency,
  };
}

/**
 * Calcule la date de fin de rétention (hold)
 */
export function calculateHoldUntil(holdPeriodDays: number): Date {
  const holdUntil = new Date();
  holdUntil.setDate(holdUntil.getDate() + holdPeriodDays);
  return holdUntil;
}

/**
 * Parse la configuration depuis system_config
 */
export function parseFeeConfig(systemConfig: {
  payment_commission_rate?: { rate: number };
  payment_gateway_fees?: {
    fixed: number;
    percentage: number;
    paid_by: 'patient' | 'platform';
  };
  payment_rounding_mode?: {
    decimals: number;
  };
}): FeeConfig {
  // Commission plateforme Domicares: 37%
  // Ce taux couvre les frais de fonctionnement, support, et développement de la plateforme
  const commissionRate = systemConfig.payment_commission_rate?.rate;
  const validCommissionRate = typeof commissionRate === 'number' && commissionRate >= 0 && commissionRate <= 0.50
    ? commissionRate
    : 0.37; // 37% par défaut (taux officiel Domicares), max 50%

  return {
    commissionRate: validCommissionRate,
    gatewayFeeFixed: systemConfig.payment_gateway_fees?.fixed || 0,
    gatewayFeePercentage: systemConfig.payment_gateway_fees?.percentage || 0.02,
    gatewayFeePaidBy: systemConfig.payment_gateway_fees?.paid_by || 'platform',
    roundingDecimals: systemConfig.payment_rounding_mode?.decimals || 2,
  };
}
