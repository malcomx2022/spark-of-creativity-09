-- Corriger la politique RLS pour permettre aux praticiens de voir leur propre enregistrement
-- même si leur kyc_status est 'pending'
DROP POLICY IF EXISTS "authenticated_view_practitioners" ON practitioners;

CREATE POLICY "authenticated_view_practitioners"
ON practitioners
FOR SELECT
TO authenticated
USING (
  -- Le praticien peut toujours voir son propre profil
  user_id = auth.uid()
  OR
  -- Les autres peuvent voir les praticiens approuvés et disponibles
  (
    kyc_status = 'approved' 
    AND (
      available = true
      OR EXISTS (
        SELECT 1 FROM appointments
        WHERE appointments.practitioner_id = practitioners.id::text
        AND appointments.patient_id = auth.uid()::text
      )
    )
  )
  OR
  -- Les admins peuvent tout voir
  has_role(auth.uid(), 'super_admin'::app_role)
);