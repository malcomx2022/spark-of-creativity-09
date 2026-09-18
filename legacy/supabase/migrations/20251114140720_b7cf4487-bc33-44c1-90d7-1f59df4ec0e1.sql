-- Table pour l'historique des tentatives de paiement
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES public.payments(id) ON DELETE CASCADE,
  appointment_id TEXT,
  user_id UUID NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'timeout')),
  error_type TEXT,
  error_message TEXT,
  error_details JSONB,
  payment_method TEXT NOT NULL,
  phone_number_encrypted TEXT,
  amount INTEGER NOT NULL,
  retry_after TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Index pour retrouver rapidement les tentatives d'un paiement
CREATE INDEX IF NOT EXISTS idx_payment_attempts_payment_id ON public.payment_attempts(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_appointment_id ON public.payment_attempts(appointment_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_user_id ON public.payment_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_status ON public.payment_attempts(status);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_created_at ON public.payment_attempts(created_at DESC);

-- RLS policies
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir leurs propres tentatives
CREATE POLICY "Users can view their own payment attempts"
  ON public.payment_attempts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Les utilisateurs peuvent créer leurs tentatives
CREATE POLICY "Users can create their own payment attempts"
  ON public.payment_attempts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Les admins peuvent tout voir
CREATE POLICY "Admins can view all payment attempts"
  ON public.payment_attempts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
    )
  );

-- Fonction pour nettoyer les anciennes tentatives (>90 jours)
CREATE OR REPLACE FUNCTION public.cleanup_old_payment_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.payment_attempts
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;