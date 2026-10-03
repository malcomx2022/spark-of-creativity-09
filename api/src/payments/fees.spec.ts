import { calculateFees, parseFeeConfig } from './fees';

/** Configuration de production (06-INVENTAIRE-SUPABASE §2.5) : 5 % de commission, 2 % de frais de passerelle payés par la plateforme. */
const PRODUCTION = { payment_commission_rate: { rate: 0.05 }, payment_gateway_fees: { fixed: 0, percentage: 0.02, paid_by: 'platform' } };

describe('parseFeeConfig', () => {
  it('lit la configuration de production', () => {
    expect(parseFeeConfig(PRODUCTION)).toEqual({ commissionRate: 0.05, gatewayFeeFixed: 0, gatewayFeePercentage: 0.02, gatewayFeePaidBy: 'platform', roundingDecimals: 0 });
  });

  it('sans configuration, les défauts sont ceux de la production, pas 37 % et 100 XOF + 1,5 %', () => {
    expect(parseFeeConfig({})).toEqual(parseFeeConfig(PRODUCTION));
  });

  it('ignore un taux de commission hors bornes', () => {
    expect(parseFeeConfig({ payment_commission_rate: { rate: 0.8 } }).commissionRate).toBe(0.05);
    expect(parseFeeConfig({ payment_commission_rate: { rate: -1 } }).commissionRate).toBe(0.05);
  });
});

describe('calculateFees', () => {
  it('15 000 XOF avec la configuration réelle : 750 de commission, 300 de frais passerelle, 14 250 nets', () => {
    expect(calculateFees(15000, 'XOF', parseFeeConfig(PRODUCTION))).toEqual({ amount: 15000, commissionAmount: 750, gatewayFeesAmount: 300, feesAmount: 750, netAmount: 14250, currency: 'XOF' });
  });

  it('en XOF, les montants sont entiers quelles que soient les décimales configurées et net + commission = montant', () => {
    const fees = calculateFees(15333, 'XOF', parseFeeConfig({ ...PRODUCTION, payment_rounding_mode: { decimals: 2 } }));
    for (const v of [fees.commissionAmount, fees.gatewayFeesAmount, fees.netAmount]) expect(Number.isInteger(v)).toBe(true);
    expect(fees.commissionAmount).toBe(767); // 766,65 arrondi au franc
    expect(fees.netAmount + fees.commissionAmount).toBe(15333);
  });

  it('frais de passerelle facturés au patient : retenus sur le net, en plus de la commission', () => {
    const fees = calculateFees(15000, 'XOF', parseFeeConfig({ ...PRODUCTION, payment_gateway_fees: { fixed: 0, percentage: 0.02, paid_by: 'patient' } }));
    expect(fees).toMatchObject({ commissionAmount: 750, gatewayFeesAmount: 300, feesAmount: 1050, netAmount: 13950 });
  });

  it('une devise à décimales garde l’arrondi configuré', () => {
    const fees = calculateFees(100.5, 'EUR', parseFeeConfig({ ...PRODUCTION, payment_rounding_mode: { decimals: 2 } }));
    expect(fees.commissionAmount).toBe(5.03);
    expect(fees.netAmount).toBe(95.47);
  });
});
