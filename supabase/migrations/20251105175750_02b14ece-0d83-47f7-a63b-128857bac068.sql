-- Table pour l'idempotence des webhooks
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index pour recherche rapide par event_id
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON public.webhook_events(event_id);

-- RLS pour webhook_events (accessible seulement aux admins)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view webhook events" ON public.webhook_events;
CREATE POLICY "Admins can view webhook events"
  ON public.webhook_events
  FOR SELECT
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can insert webhook events" ON public.webhook_events;
CREATE POLICY "Service role can insert webhook events"
  ON public.webhook_events
  FOR INSERT
  WITH CHECK (true);

-- Table pour tracker les événements de paiement
CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES public.payments(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index pour recherche par payment_id
CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id ON public.payment_events(payment_id);

-- RLS pour payment_events
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all payment events" ON public.payment_events;
CREATE POLICY "Admins can view all payment events"
  ON public.payment_events
  FOR SELECT
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view their payment events" ON public.payment_events;
CREATE POLICY "Users can view their payment events"
  ON public.payment_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.payments
      WHERE payments.id = payment_events.payment_id
      AND payments.patient_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role can insert payment events" ON public.payment_events;
CREATE POLICY "Service role can insert payment events"
  ON public.payment_events
  FOR INSERT
  WITH CHECK (true);

-- Table pour les reversements aux praticiens
CREATE TABLE IF NOT EXISTS public.practitioner_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID REFERENCES public.practitioners(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  net_amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XOF',
  status TEXT NOT NULL DEFAULT 'pending',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  fedapay_transfer_id TEXT,
  notes TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT valid_payout_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'canceled'))
);

-- Index pour recherche par praticien et période
CREATE INDEX IF NOT EXISTS idx_practitioner_payouts_practitioner ON public.practitioner_payouts(practitioner_id);
CREATE INDEX IF NOT EXISTS idx_practitioner_payouts_status ON public.practitioner_payouts(status);
CREATE INDEX IF NOT EXISTS idx_practitioner_payouts_period ON public.practitioner_payouts(period_start, period_end);

-- RLS pour practitioner_payouts
ALTER TABLE public.practitioner_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all payouts" ON public.practitioner_payouts;
CREATE POLICY "Admins can manage all payouts"
  ON public.practitioner_payouts
  FOR ALL
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Practitioners can view their payouts" ON public.practitioner_payouts;
CREATE POLICY "Practitioners can view their payouts"
  ON public.practitioner_payouts
  FOR SELECT
  USING (
    practitioner_id IN (
      SELECT id FROM public.practitioners WHERE user_id = auth.uid()
    )
  );

-- Trigger pour updated_at sur practitioner_payouts
DROP TRIGGER IF EXISTS update_practitioner_payouts_updated_at ON public.practitioner_payouts;
CREATE TRIGGER update_practitioner_payouts_updated_at
  BEFORE UPDATE ON public.practitioner_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Table pour lier les paiements aux reversements (pour traçabilité)
CREATE TABLE IF NOT EXISTS public.payout_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID REFERENCES public.practitioner_payouts(id) ON DELETE CASCADE NOT NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE CASCADE NOT NULL,
  amount_included INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(payout_id, payment_id)
);

-- Index pour recherche
CREATE INDEX IF NOT EXISTS idx_payout_payments_payout ON public.payout_payments(payout_id);
CREATE INDEX IF NOT EXISTS idx_payout_payments_payment ON public.payout_payments(payment_id);

-- RLS pour payout_payments
ALTER TABLE public.payout_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view payout payments" ON public.payout_payments;
CREATE POLICY "Admins can view payout payments"
  ON public.payout_payments
  FOR SELECT
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Practitioners can view their payout payments" ON public.payout_payments;
CREATE POLICY "Practitioners can view their payout payments"
  ON public.payout_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.practitioner_payouts pp
      INNER JOIN public.practitioners p ON p.id = pp.practitioner_id
      WHERE pp.id = payout_payments.payout_id
      AND p.user_id = auth.uid()
    )
  );