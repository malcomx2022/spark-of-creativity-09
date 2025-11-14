export interface Payment {
  id: string;
  appointment_id: string;
  patient_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: string;
  fedapay_transaction_id?: string;
  fedapay_payment_url?: string;
  created_at: string;
  updated_at: string;
  commission_amount?: number;
  gateway_fees_amount?: number;
  fees_amount?: number;
  net_amount?: number;
  hold_until?: string;
  payout_status?: string;
  idempotency_key?: string;
  channel?: string;
  provider_ref?: string;
  payment_session_data?: any;
  receipt_url?: string;
  invoice_number?: string;
}
