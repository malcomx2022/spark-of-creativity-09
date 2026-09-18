-- Ajouter les colonnes pour tracker le temps réel des consultations
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS consultation_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS consultation_ended_at TIMESTAMP WITH TIME ZONE;

-- Créer une fonction pour calculer la durée réelle
CREATE OR REPLACE FUNCTION public.calculate_real_duration(started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, default_duration INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF started_at IS NOT NULL AND ended_at IS NOT NULL THEN
    RETURN EXTRACT(EPOCH FROM (ended_at - started_at)) / 60;
  END IF;
  RETURN default_duration;
END;
$$;

-- Commenter les colonnes pour documentation
COMMENT ON COLUMN public.appointments.consultation_started_at IS 'Timestamp réel du début de la consultation';
COMMENT ON COLUMN public.appointments.consultation_ended_at IS 'Timestamp réel de la fin de la consultation';