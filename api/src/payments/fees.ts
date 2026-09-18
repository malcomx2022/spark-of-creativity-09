/** Port de supabase/functions/create-payment/fee-calculator.ts et payment-status.ts. */
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

export function calculateFees(amount: number, currency: string, config: FeeConfig): FeeBreakdown {
  const commissionAmount = roundHalfUp(amount * config.commissionRate, config.roundingDecimals);
  const gatewayFeesAmount = roundHalfUp(config.gatewayFeeFixed + amount * config.gatewayFeePercentage, config.roundingDecimals);
  const feesAmount = config.gatewayFeePaidBy === 'platform' ? commissionAmount : commissionAmount + gatewayFeesAmount;
  return { amount, commissionAmount, gatewayFeesAmount, feesAmount, netAmount: roundHalfUp(amount - feesAmount, config.roundingDecimals), currency };
}

/** system_config → FeeConfig (mêmes défauts : 37 % de commission, 1,5 % + 100 XOF de frais passerelle payés par la plateforme). */
export function parseFeeConfig(systemConfig: Record<string, unknown>): FeeConfig {
  const commission = (systemConfig['payment_commission_rate'] as { rate?: number } | undefined)?.rate;
  const gateway = systemConfig['payment_gateway_fees'] as { fixed?: number; percentage?: number; paid_by?: 'patient' | 'platform' } | undefined;
  const rounding = systemConfig['payment_rounding_mode'] as { decimals?: number } | undefined;
  return {
    commissionRate: typeof commission === 'number' && commission >= 0 && commission <= 0.5 ? commission : 0.37,
    gatewayFeeFixed: gateway?.fixed ?? 100,
    gatewayFeePercentage: gateway?.percentage ?? 0.015,
    gatewayFeePaidBy: gateway?.paid_by ?? 'platform',
    roundingDecimals: rounding?.decimals ?? 2,
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
};

export function normalizeStatus(fedaPayStatus: string): PaymentStatus {
  return STATUS_MAP[fedaPayStatus as FedaPayStatus] ?? 'pending';
}

export const FINAL_STATUSES: PaymentStatus[] = ['paid', 'failed', 'canceled', 'refunded', 'partially_refunded', 'chargeback'];
export const OPEN_STATUSES: PaymentStatus[] = ['initiated', 'pending', 'authorized'];
