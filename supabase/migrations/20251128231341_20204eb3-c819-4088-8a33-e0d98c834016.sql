-- Créer une fonction qui bypass le RLS pour récupérer le practitioner_id d'un utilisateur
CREATE OR REPLACE FUNCTION public.get_practitioner_id_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM practitioners WHERE user_id = p_user_id LIMIT 1;
$$;

-- Supprimer les anciennes policies problématiques
DROP POLICY IF EXISTS "Practitioners can view their appointments" ON appointments;
DROP POLICY IF EXISTS "Practitioners can update their appointments" ON appointments;
DROP POLICY IF EXISTS "authenticated_view_practitioners" ON practitioners;

-- Recréer les policies sans récursion
CREATE POLICY "Practitioners can view their appointments"
ON appointments
FOR SELECT
TO authenticated
USING (practitioner_id = get_practitioner_id_for_user(auth.uid())::text);

CREATE POLICY "Practitioners can update their appointments"
ON appointments
FOR UPDATE
TO authenticated
USING (practitioner_id = get_practitioner_id_for_user(auth.uid())::text);

-- Simplifier la policy practitioners pour éviter la référence à appointments
CREATE POLICY "authenticated_view_practitioners"
ON practitioners
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR (kyc_status = 'approved' AND available = true)
  OR has_role(auth.uid(), 'super_admin')
);

-- Ajouter une policy séparée pour que les patients voient les praticiens de leurs rendez-vous
-- Cette policy ne crée pas de récursion car elle ne référence que appointments
CREATE POLICY "patients_view_their_practitioners"
ON practitioners
FOR SELECT
TO authenticated
USING (
  id::text IN (
    SELECT practitioner_id 
    FROM appointments 
    WHERE patient_id = auth.uid()::text
  )
);