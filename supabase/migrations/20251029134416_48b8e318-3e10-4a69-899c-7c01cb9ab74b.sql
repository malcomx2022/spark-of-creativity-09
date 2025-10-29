-- Ajouter colonnes pour intention de paiement et idempotence
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS idempotency_key text UNIQUE,
  ADD COLUMN IF NOT EXISTS channel text CHECK (channel IN ('card', 'momo')),
  ADD COLUMN IF NOT EXISTS provider_ref text,
  ADD COLUMN IF NOT EXISTS payment_session_data jsonb,
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS invoice_number text UNIQUE;

-- Index pour recherche rapide par idempotency_key
CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key ON public.payments(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref ON public.payments(provider_ref);

-- Table pour les méthodes de paiement sauvegardées (alias MoMo)
CREATE TABLE IF NOT EXISTS public.saved_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('mtn', 'orange', 'moov')),
  phone_number_masked text NOT NULL,
  phone_number_encrypted text NOT NULL,
  is_default boolean DEFAULT false,
  consent_given_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, phone_number_encrypted)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_saved_payment_methods_user_id ON public.saved_payment_methods(user_id);

-- RLS pour saved_payment_methods
ALTER TABLE public.saved_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their saved payment methods"
  ON public.saved_payment_methods FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their saved payment methods"
  ON public.saved_payment_methods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their saved payment methods"
  ON public.saved_payment_methods FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their saved payment methods"
  ON public.saved_payment_methods FOR DELETE
  USING (auth.uid() = user_id);

-- Table pour les événements de paiement (audit et notifications)
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id ON public.payment_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_event_type ON public.payment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at ON public.payment_events(created_at);

-- RLS pour payment_events (admins et propriétaires du paiement)
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view events for their payments"
  ON public.payment_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.payments 
      WHERE payments.id = payment_events.payment_id 
      AND payments.patient_id = auth.uid()
    ) OR is_admin(auth.uid())
  );

-- Fonction pour générer un numéro de facture unique
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  year_month text;
  sequence_num integer;
  invoice_num text;
BEGIN
  year_month := to_char(now(), 'YYYYMM');
  
  -- Obtenir le prochain numéro de séquence pour ce mois
  SELECT COALESCE(MAX(
    CAST(substring(invoice_number from '[0-9]+$') AS integer)
  ), 0) + 1
  INTO sequence_num
  FROM payments
  WHERE invoice_number LIKE 'INV-' || year_month || '-%';
  
  invoice_num := 'INV-' || year_month || '-' || lpad(sequence_num::text, 6, '0');
  
  RETURN invoice_num;
END;
$$;

-- Trigger pour générer automatiquement le numéro de facture
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invoice_number IS NULL AND NEW.status IN ('paid', 'completed') THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_invoice_number
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_number();

-- Commentaires
COMMENT ON COLUMN payments.idempotency_key IS 'Clé pour éviter les doubles paiements';
COMMENT ON COLUMN payments.channel IS 'Canal de paiement: card ou momo';
COMMENT ON COLUMN payments.provider_ref IS 'Référence du fournisseur de paiement';
COMMENT ON COLUMN payments.receipt_url IS 'URL du reçu PDF';
COMMENT ON COLUMN payments.invoice_number IS 'Numéro de facture unique';
COMMENT ON TABLE saved_payment_methods IS 'Méthodes de paiement MoMo sauvegardées avec consentement';
COMMENT ON TABLE payment_events IS 'Événements de paiement pour audit et notifications';