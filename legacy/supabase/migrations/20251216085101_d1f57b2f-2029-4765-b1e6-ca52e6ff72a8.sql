-- 1. Activer RLS sur la vue publique des praticiens
ALTER VIEW public.practitioners_public_view SET (security_invoker = false);

-- 2. Créer une politique permettant l'accès public en lecture à la vue
-- Note: Pour les vues, on doit créer une politique sur la table sous-jacente
-- Donc on va plutôt créer une fonction sécurisée

-- 3. Créer une fonction pour récupérer les praticiens publiquement (sans données sensibles)
CREATE OR REPLACE FUNCTION public.get_public_practitioners()
RETURNS TABLE (
  id uuid,
  name text,
  specialty text,
  practitioner_type practitioner_type,
  rating numeric,
  available boolean,
  years_experience integer,
  bio text,
  languages text[],
  communes_served text[],
  intervention_zone text,
  intervention_radius integer,
  certifications text[],
  session_types text[],
  image text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
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
  FROM practitioners
  WHERE kyc_status = 'approved' 
    AND (available = true OR can_accept_missions = true);
$$;

-- 4. Créer une fonction pour les statistiques publiques de l'application
CREATE OR REPLACE FUNCTION public.get_public_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'practitioners_count', (
      SELECT COUNT(*) 
      FROM practitioners 
      WHERE kyc_status = 'approved' 
        AND (available = true OR can_accept_missions = true)
    ),
    'patients_count', (
      SELECT COUNT(*) 
      FROM profiles p
      WHERE NOT EXISTS (
        SELECT 1 FROM practitioners pr WHERE pr.user_id = p.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id
      )
    ),
    'appointments_completed', (
      SELECT COUNT(*) 
      FROM appointments 
      WHERE status = 'completed'
    ),
    'coaches_count', (
      SELECT COUNT(*) 
      FROM practitioners 
      WHERE kyc_status = 'approved' 
        AND practitioner_type = 'coach_sportif'
        AND (available = true OR can_accept_missions = true)
    )
  );
$$;

-- 5. Donner les permissions d'exécution à tous (anon et authenticated)
GRANT EXECUTE ON FUNCTION public.get_public_practitioners() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_stats() TO anon, authenticated;