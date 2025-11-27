-- Ensure appointments keep track of the amount due
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS payment_amount integer CHECK (payment_amount IS NULL OR payment_amount >= 0);

-- Table to persist user consents (CGU, partage de données, etc.)
CREATE TABLE IF NOT EXISTS public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  consent_type public.consent_type NOT NULL,
  is_accepted boolean NOT NULL DEFAULT false,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.user_consents
  ADD CONSTRAINT user_consents_user_consent_type_key UNIQUE (user_id, consent_type);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON public.user_consents(user_id);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their consents"
  ON public.user_consents
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their consents"
  ON public.user_consents
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
