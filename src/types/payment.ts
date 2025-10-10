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
}
