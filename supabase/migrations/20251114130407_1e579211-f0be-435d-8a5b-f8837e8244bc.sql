-- Corriger les politiques RLS pour les praticiens
-- Le practitioner_id dans appointments est l'ID de la table practitioners, pas l'user_id

DROP POLICY IF EXISTS "Practitioners can view their appointments" ON public.appointments;
DROP POLICY IF EXISTS "Practitioners can update their appointments" ON public.appointments;

CREATE POLICY "Practitioners can view their appointments"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  practitioner_id IN (
    SELECT id::text FROM public.practitioners WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Practitioners can update their appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  practitioner_id IN (
    SELECT id::text FROM public.practitioners WHERE user_id = auth.uid()
  )
);