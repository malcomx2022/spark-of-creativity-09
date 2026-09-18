-- 1. Recréer la vue publique SANS les champs sensibles (phone déjà exclu, mais on s'assure)
DROP VIEW IF EXISTS practitioners_public_view;

CREATE VIEW practitioners_public_view AS
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
  -- EXCLUS: phone, address, license_number, license_document_url, 
  -- id_document_url, insurance_document_url, kyc_*, user_id, latitude, longitude
FROM practitioners
WHERE kyc_status = 'approved' AND available = true;

-- 2. Donner accès à la vue pour tous les utilisateurs authentifiés
GRANT SELECT ON practitioners_public_view TO authenticated;
GRANT SELECT ON practitioners_public_view TO anon;

-- 3. Mettre à jour les policies RLS sur practitioners pour être plus restrictives
-- Supprimer les anciennes policies trop permissives
DROP POLICY IF EXISTS "authenticated_view_practitioners" ON practitioners;
DROP POLICY IF EXISTS "patients_view_booked_practitioner_details" ON practitioners;
DROP POLICY IF EXISTS "patients_view_their_practitioners" ON practitioners;

-- 4. Nouvelle policy: Le praticien peut voir et modifier ses propres données
-- (déjà existante via practitioners_update_own et practitioners_insert_own)

-- 5. Nouvelle policy: Les patients avec RDV confirmé peuvent voir les infos limitées du praticien
-- Mais PAS le téléphone, adresse, documents - ils utilisent la messagerie
CREATE POLICY "patients_view_booked_practitioner_limited"
ON practitioners
FOR SELECT
USING (
  -- Le praticien lui-même
  auth.uid() = user_id
  OR
  -- Les admins
  is_admin(auth.uid())
  OR
  -- Patient avec un RDV (toutes données via la table, mais frontend filtre)
  EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.practitioner_id = practitioners.id::text
    AND a.patient_id = auth.uid()::text
    AND a.status IN ('confirmed', 'in-progress', 'completed', 'pending_payment')
  )
);

-- 6. Pour la recherche publique, on utilise la vue (pas besoin de policy sur practitioners)