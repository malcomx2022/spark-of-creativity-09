-- Ajouter les colonnes manquantes à la table practitioners
ALTER TABLE public.practitioners
ADD COLUMN IF NOT EXISTS bio text,
ADD COLUMN IF NOT EXISTS diplomas text[],
ADD COLUMN IF NOT EXISTS languages text[],
ADD COLUMN IF NOT EXISTS years_experience integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS intervention_radius integer DEFAULT 10,
ADD COLUMN IF NOT EXISTS communes_served text[],
ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS kyc_status text DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'validated', 'refused', 'to_renew')),
ADD COLUMN IF NOT EXISTS kyc_comment text,
ADD COLUMN IF NOT EXISTS kyc_validated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS id_document_url text,
ADD COLUMN IF NOT EXISTS license_number text,
ADD COLUMN IF NOT EXISTS license_document_url text,
ADD COLUMN IF NOT EXISTS insurance_document_url text,
ADD COLUMN IF NOT EXISTS can_accept_missions boolean DEFAULT false;

-- Table pour les tarifs par service
CREATE TABLE IF NOT EXISTS public.practitioner_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid REFERENCES public.practitioners(id) ON DELETE CASCADE NOT NULL,
  service_type text NOT NULL,
  base_price integer NOT NULL,
  duration_minutes integer DEFAULT 60,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.practitioner_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Practitioners can manage their rates"
ON public.practitioner_rates
FOR ALL
USING (practitioner_id IN (SELECT id FROM public.practitioners WHERE user_id = auth.uid()));

CREATE POLICY "Anyone can view rates"
ON public.practitioner_rates
FOR SELECT
USING (true);

-- Table pour les disponibilités
CREATE TABLE IF NOT EXISTS public.practitioner_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid REFERENCES public.practitioners(id) ON DELETE CASCADE NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.practitioner_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Practitioners can manage their availability"
ON public.practitioner_availability
FOR ALL
USING (practitioner_id IN (SELECT id FROM public.practitioners WHERE user_id = auth.uid()));

CREATE POLICY "Anyone can view availability"
ON public.practitioner_availability
FOR SELECT
USING (true);

-- Table pour les exceptions de disponibilité (congés, jours fériés)
CREATE TABLE IF NOT EXISTS public.practitioner_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid REFERENCES public.practitioners(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  reason text,
  is_available boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.practitioner_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Practitioners can manage their exceptions"
ON public.practitioner_exceptions
FOR ALL
USING (practitioner_id IN (SELECT id FROM public.practitioners WHERE user_id = auth.uid()));

-- Table pour les notes de soin (format SOAP)
CREATE TABLE IF NOT EXISTS public.care_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id text REFERENCES public.appointments(id) NOT NULL,
  practitioner_id uuid REFERENCES public.practitioners(id) NOT NULL,
  subjective text,
  objective text,
  assessment text,
  plan text,
  attachments text[],
  shared_with_patient boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.care_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Practitioners can manage their care notes"
ON public.care_notes
FOR ALL
USING (practitioner_id IN (SELECT id FROM public.practitioners WHERE user_id = auth.uid()));

CREATE POLICY "Patients can view shared care notes"
ON public.care_notes
FOR SELECT
USING (
  shared_with_patient = true 
  AND EXISTS (
    SELECT 1 FROM public.appointments 
    WHERE appointments.id = care_notes.appointment_id 
    AND appointments.patient_id = auth.uid()::text
  )
);

-- Table pour les versements (payouts)
CREATE TABLE IF NOT EXISTS public.practitioner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid REFERENCES public.practitioners(id) NOT NULL,
  amount integer NOT NULL,
  currency text DEFAULT 'XOF',
  payment_method text NOT NULL,
  account_details jsonb,
  status text DEFAULT 'planned' CHECK (status IN ('planned', 'sent', 'completed', 'failed')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  processed_at timestamp with time zone
);

ALTER TABLE public.practitioner_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Practitioners can view their payouts"
ON public.practitioner_payouts
FOR SELECT
USING (practitioner_id IN (SELECT id FROM public.practitioners WHERE user_id = auth.uid()));

-- Ajouter des colonnes aux appointments pour le workflow de visite
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS visit_status text DEFAULT 'scheduled' CHECK (visit_status IN ('scheduled', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled')),
ADD COLUMN IF NOT EXISTS pre_visit_checklist jsonb,
ADD COLUMN IF NOT EXISTS internal_notes text;

-- Ajouter commission et frais aux payments
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS commission_amount integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fees_amount integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_amount integer;

-- Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_practitioner_rates_updated_at
BEFORE UPDATE ON public.practitioner_rates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_care_notes_updated_at
BEFORE UPDATE ON public.care_notes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();