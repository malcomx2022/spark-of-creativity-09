-- Créer une vue publique pour les praticiens avec données limitées
CREATE OR REPLACE VIEW public.practitioners_public_view AS
SELECT 
  id,
  name,
  specialty,
  address,
  latitude,
  longitude,
  available,
  rating,
  image,
  practitioner_type,
  bio,
  years_experience,
  languages,
  communes_served,
  intervention_radius,
  intervention_zone,
  certifications,
  session_types
FROM public.practitioners
WHERE kyc_status = 'approved'
  AND available = true;

-- Permettre l'accès public à cette vue
GRANT SELECT ON public.practitioners_public_view TO anon;
GRANT SELECT ON public.practitioners_public_view TO authenticated;