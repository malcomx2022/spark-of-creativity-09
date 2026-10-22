/** Port de legacy/supabase/functions/create-payment/fee-calculator.ts et payment-status.ts. */
import type { FedaPayStatus } from './fedapay.client';
import type { PaymentStatus } from '../database/types';

export interface FeeConfig {
  commissionRate: number;
  gatewayFeeFixed: number;
  gatewayFeePercentage: number;
  gatewayFeePaidBy: 'patient' | 'platform';
  roundingDecimals: number;
}

export interface FeeBreakdown {
  amount: number;
  commissionAmount: number;
  gatewayFeesAmount: number;
  feesAmount: number;
  netAmount: number;
  currency: string;
}

function roundHalfUp(value: number, decimals: number): number {
  const m = 10 ** decimals;
  return Math.round(value * m) / m;
}

/** Devises sans sous-unité : les montants restent entiers quelles que soient les décimales configurées. */
const ZERO_DECIMAL_CURRENCIES = new Set(['XOF', 'XAF', 'GNF', 'RWF', 'BIF', 'DJF', 'KMF', 'JPY']);

export function calculateFees(amount: number, currency: string, config: FeeConfig): FeeBreakdown {
  // commission_amount / net_amount sont des colonnes entières : des décimales étaient arrondies en silence
  // par PostgreSQL et net + commission pouvait différer du montant d'un franc (m3).
  const decimals = ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : config.roundingDecimals;
  const commissionAmount = roundHalfUp(amount * config.commissionRate, decimals);
  const gatewayFeesAmount = roundHalfUp(config.gatewayFeeFixed + amount * config.gatewayFeePercentage, decimals);
  const feesAmount = config.gatewayFeePaidBy === 'platform' ? commissionAmount : commissionAmount + gatewayFeesAmount;
  return { amount, commissionAmount, gatewayFeesAmount, feesAmount, netAmount: roundHalfUp(amount - feesAmount, decimals), currency };
}

/**
 * system_config → FeeConfig. Les défauts sont ceux de la configuration de production
 * (06-INVENTAIRE-SUPABASE §2.5) : 5 % de commission, 2 % de frais de passerelle payés par la plateforme,
 * montants entiers. L'ancien code codait 37 % et 100 XOF + 1,5 % en affirmant reprendre les défauts
 * historiques (0 + 2 %) : les tests validaient une configuration qui n'était celle de personne (m3).
 */
export function parseFeeConfig(systemConfig: Record<string, unknown>): FeeConfig {
  const commission = (systemConfig['payment_commission_rate'] as { rate?: number } | undefined)?.rate;
  const gateway = systemConfig['payment_gateway_fees'] as { fixed?: number; percentage?: number; paid_by?: 'patient' | 'platform' } | undefined;
  const rounding = systemConfig['payment_rounding_mode'] as { decimals?: number } | undefined;
  return {
    commissionRate: typeof commission === 'number' && commission >= 0 && commission <= 0.5 ? commission : 0.05,
    gatewayFeeFixed: gateway?.fixed ?? 0,
    gatewayFeePercentage: gateway?.percentage ?? 0.02,
    gatewayFeePaidBy: gateway?.paid_by ?? 'platform',
    roundingDecimals: rounding?.decimals ?? 0,
  };
}

export function holdUntil(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

/** Table FedaPay → statut interne (payment-webhook + sync-payment-status). */
export const STATUS_MAP: Record<FedaPayStatus, PaymentStatus> = {
  pending: 'pending',
  processing: 'pending',
  authorized: 'authorized',
  approved: 'paid',
  declined: 'failed',
  canceled: 'canceled',
  refunded: 'refunded',
  transferred: 'paid',
  // Collecte non finalisée dans le délai FedaPay : terminée, pas « en attente ».
  expired: 'failed',
  timeout: 'failed',
  // Payé puis remboursé en partie depuis le tableau de bord : l'argent a été encaissé (jamais « en attente »,
  // que le nettoyage annulerait). Le montant rendu n'est pas exposé : la finance l'enregistre (canal manuel),
  // la réconciliation signale l'oubli.
  approved_partially_refunded: 'paid',
  transferred_partially_refunded: 'paid',
};

export function normalizeStatus(fedaPayStatus: string): PaymentStatus {
  return STATUS_MAP[fedaPayStatus as FedaPayStatus] ?? 'pending';
}

export const FINAL_STATUSES: PaymentStatus[] = ['paid', 'failed', 'canceled', 'refunded', 'partially_refunded', 'chargeback'];
export const OPEN_STATUSES: PaymentStatus[] = ['initiated', 'pending', 'authorized'];
