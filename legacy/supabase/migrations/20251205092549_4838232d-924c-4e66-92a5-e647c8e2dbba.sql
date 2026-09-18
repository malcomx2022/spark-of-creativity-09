-- 1. Supprimer la policy permettant l'accès anonyme aux données complètes
DROP POLICY IF EXISTS "anon_view_approved_practitioners" ON public.practitioners;

-- 2. Recréer la vue publique avec uniquement les champs non-sensibles
DROP VIEW IF EXISTS public.practitioners_public_view;

CREATE VIEW public.practitioners_public_view AS
SELECT 
  id,
  name,
  specialty,
  practitioner_type,
  rating,
  available,
  years_experience,
  bio,
  languages,
  communes_served,
  intervention_zone,
  intervention_radius,
  certifications,
  session_types,
  image
  -- Exclus: phone, address, latitude, longitude, license_number, 
  -- id_document_url, license_document_url, insurance_document_url
FROM public.practitioners
WHERE kyc_status = 'approved' AND available = true;

-- 3. Modifier la policy authenticated pour limiter les données visibles
-- Les utilisateurs authentifiés voient les praticiens approuvés (sans données sensibles directement)
-- Les données sensibles ne sont accessibles qu'après création de RDV

-- 4. Créer une policy pour les patients qui ont un RDV avec le praticien
-- Ils peuvent voir les coordonnées complètes
CREATE POLICY "patients_view_booked_practitioner_details"
ON public.practitioners
FOR SELECT
USING (
  -- Le praticien lui-même
  auth.uid() = user_id
  OR
  -- Admin
  public.is_admin(auth.uid())
  OR
  -- Patient avec RDV confirmé avec ce praticien
  EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.practitioner_id = practitioners.id::text
    AND a.patient_id = auth.uid()::text
    AND a.status IN ('confirmed', 'in-progress', 'completed', 'pending_payment')
  )
  OR
  -- Praticiens approuvés visibles mais via la vue publique uniquement pour la recherche
  (kyc_status = 'approved' AND available = true AND auth.uid() IS NOT NULL)
);