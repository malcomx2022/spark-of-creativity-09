-- Table pour logger les réconciliations de paiements
CREATE TABLE IF NOT EXISTS payment_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES payments(id) ON DELETE CASCADE,
  old_status text NOT NULL,
  new_status text NOT NULL,
  fedapay_status text NOT NULL,
  fedapay_transaction_data jsonb,
  reconciliation_type text NOT NULL CHECK (reconciliation_type IN ('status_mismatch', 'manual', 'webhook_replay')),
  reconciled_by text,
  reconciled_at timestamptz DEFAULT now(),
  notes text
);

CREATE INDEX idx_payment_reconciliations_payment_id ON payment_reconciliations(payment_id);
CREATE INDEX idx_payment_reconciliations_date ON payment_reconciliations(reconciled_at DESC);
CREATE INDEX idx_payment_reconciliations_type ON payment_reconciliations(reconciliation_type);

-- RLS pour les admins seulement
ALTER TABLE payment_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reconciliations"
  ON payment_reconciliations FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Service role can insert reconciliations"
  ON payment_reconciliations FOR INSERT
  WITH CHECK (true);