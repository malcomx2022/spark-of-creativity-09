-- Corriger le search_path de la fonction update_updated_at_column
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
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

-- Recréer les triggers
CREATE TRIGGER update_practitioner_rates_updated_at
BEFORE UPDATE ON public.practitioner_rates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_care_notes_updated_at
BEFORE UPDATE ON public.care_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();