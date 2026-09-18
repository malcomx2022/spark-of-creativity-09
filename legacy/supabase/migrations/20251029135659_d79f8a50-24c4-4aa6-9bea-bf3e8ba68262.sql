-- EPIC 2: Ledger system for double-entry accounting

-- Ledger account types
CREATE TYPE public.ledger_account_type AS ENUM (
  'cash',
  'payable',
  'receivable',
  'revenue_commission',
  'revenue_fees',
  'obligation'
);

-- Owner types for ledger accounts
CREATE TYPE public.ledger_owner_type AS ENUM (
  'platform',
  'patient',
  'practitioner'
);

-- Ledger accounts table
CREATE TABLE public.ledger_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_type ledger_owner_type NOT NULL,
  owner_id UUID,
  account_type ledger_account_type NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XOF',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(owner_type, owner_id, account_type, currency)
);

-- Ledger entries for double-entry bookkeeping
CREATE TABLE public.ledger_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES ledger_accounts(id),
  debit INTEGER NOT NULL DEFAULT 0,
  credit INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'XOF',
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0))
);

-- Practitioner balances for tracking available and pending amounts
CREATE TABLE public.practitioner_balances (
  practitioner_id UUID NOT NULL PRIMARY KEY REFERENCES practitioners(id),
  balance_available INTEGER NOT NULL DEFAULT 0,
  balance_pending INTEGER NOT NULL DEFAULT 0,
  balance_on_hold INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'XOF',
  last_payout_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Payout batch status
CREATE TYPE public.payout_batch_status AS ENUM (
  'queued',
  'processing',
  'sent',
  'failed',
  'partially_sent'
);

-- Payout batches for grouping practitioner payouts
CREATE TABLE public.payout_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL,
  batch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL,
  status payout_batch_status NOT NULL DEFAULT 'queued',
  total_amount INTEGER NOT NULL DEFAULT 0,
  practitioners_count INTEGER NOT NULL DEFAULT 0,
  statement_url TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Update practitioner_payouts to link to batches
ALTER TABLE public.practitioner_payouts
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES payout_batches(id),
  ADD COLUMN IF NOT EXISTS net_amount INTEGER,
  ADD COLUMN IF NOT EXISTS commission_amount INTEGER,
  ADD COLUMN IF NOT EXISTS fees_amount INTEGER,
  ADD COLUMN IF NOT EXISTS transaction_ids TEXT[];

-- Refund records
CREATE TABLE public.payment_refunds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES payments(id),
  refund_amount INTEGER NOT NULL,
  refund_reason TEXT,
  refunded_by UUID NOT NULL,
  provider_refund_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practitioner_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view all ledger accounts"
  ON public.ledger_accounts FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage ledger accounts"
  ON public.ledger_accounts FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view all ledger entries"
  ON public.ledger_entries FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage ledger entries"
  ON public.ledger_entries FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Practitioners can view their balance"
  ON public.practitioner_balances FOR SELECT
  USING (
    practitioner_id IN (
      SELECT id FROM practitioners WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all balances"
  ON public.practitioner_balances FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage balances"
  ON public.practitioner_balances FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view payout batches"
  ON public.payout_batches FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage payout batches"
  ON public.payout_batches FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view refunds"
  ON public.payment_refunds FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage refunds"
  ON public.payment_refunds FOR ALL
  USING (is_admin(auth.uid()));

-- Function to update practitioner balance timestamp
CREATE OR REPLACE FUNCTION public.update_practitioner_balance_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger for practitioner_balances
CREATE TRIGGER update_practitioner_balances_updated_at
  BEFORE UPDATE ON public.practitioner_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_practitioner_balance_timestamp();

-- Trigger for payout_batches
CREATE TRIGGER update_payout_batches_updated_at
  BEFORE UPDATE ON public.payout_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Initialize platform ledger accounts
INSERT INTO public.ledger_accounts (owner_type, owner_id, account_type, currency)
VALUES 
  ('platform', NULL, 'cash', 'XOF'),
  ('platform', NULL, 'revenue_commission', 'XOF'),
  ('platform', NULL, 'revenue_fees', 'XOF')
ON CONFLICT DO NOTHING;