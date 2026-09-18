-- Configuration des paramètres de paiement dans system_config
INSERT INTO public.system_config (key, value, description, updated_by) VALUES
  ('payment_commission_rate', '{"rate": 0.05, "description": "Commission plateforme en pourcentage (5%)"}', 'Taux de commission de la plateforme sur les paiements', NULL),
  ('payment_gateway_fees', '{"fixed": 0, "percentage": 0.02, "paid_by": "platform", "description": "Frais passerelle (2% payés par la plateforme)"}', 'Frais de la passerelle de paiement', NULL),
  ('payment_hold_period_days', '{"days": 2, "description": "Période de rétention avant versement (T+2)"}', 'Période de rétention des fonds avant versement aux praticiens', NULL),
  ('payout_minimum_threshold', '{"amount": 5000, "currency": "XOF", "description": "Seuil minimum de versement"}', 'Montant minimum pour déclencher un versement au praticien', NULL),
  ('payout_frequency', '{"frequency": "weekly", "day": "monday", "description": "Versements hebdomadaires le lundi"}', 'Fréquence des versements aux praticiens', NULL),
  ('payment_rounding_mode', '{"mode": "half_up", "decimals": 2, "description": "Arrondi à 2 décimales, mode half-up"}', 'Mode arrondi pour les calculs de paiement', NULL)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();

-- Table pour idempotence des webhooks
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON public.webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON public.webhook_events(created_at);

-- Ajouter colonnes pour tracking détaillé des frais dans payments
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS gateway_fees_amount integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hold_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS payout_status text DEFAULT 'pending' CHECK (payout_status IN ('pending', 'held', 'ready', 'paid', 'failed'));

-- Commentaires pour documentation
COMMENT ON COLUMN payments.commission_amount IS 'Commission de la plateforme';
COMMENT ON COLUMN payments.gateway_fees_amount IS 'Frais de la passerelle de paiement';
COMMENT ON COLUMN payments.fees_amount IS 'Total des frais';
COMMENT ON COLUMN payments.net_amount IS 'Montant net pour le praticien après déduction des frais';
COMMENT ON COLUMN payments.hold_until IS 'Date de fin de rétention';
COMMENT ON COLUMN payments.payout_status IS 'Statut du versement au praticien';

-- RLS pour webhook_events
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook events"
  ON public.webhook_events FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Service role can insert webhook events"
  ON public.webhook_events FOR INSERT
  WITH CHECK (true);