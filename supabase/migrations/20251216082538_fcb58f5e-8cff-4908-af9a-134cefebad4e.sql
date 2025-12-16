-- ============================================
-- CORRECTION DES PROBLEMES DE SECURITE CRITIQUES
-- Migration corrigée - gestion des policies existantes
-- ============================================

-- 1. CORRIGER LES VUES SECURITY DEFINER (4 vues)
DROP VIEW IF EXISTS public.practitioners_public_view CASCADE;
CREATE VIEW public.practitioners_public_view 
WITH (security_invoker = on)
AS SELECT 
  id, name, specialty, practitioner_type, rating, available,
  years_experience, bio, languages, communes_served,
  intervention_zone, intervention_radius, certifications, session_types, image
FROM practitioners
WHERE kyc_status = 'approved' AND available = true;
GRANT SELECT ON public.practitioners_public_view TO anon, authenticated;

DROP VIEW IF EXISTS public.homepage_stats CASCADE;
CREATE VIEW public.homepage_stats 
WITH (security_invoker = on)
AS SELECT 
  (SELECT count(*) FROM practitioners WHERE kyc_status = 'approved' AND available = true) AS practitioners_count,
  (SELECT count(*) FROM profiles) - (SELECT count(*) FROM practitioners) - (SELECT count(DISTINCT user_id) FROM user_roles) AS patients_count;
GRANT SELECT ON public.homepage_stats TO anon, authenticated;

DROP VIEW IF EXISTS public.admin_finance_stats CASCADE;
CREATE VIEW public.admin_finance_stats 
WITH (security_invoker = on)
AS SELECT 
  sum(CASE WHEN status = ANY(ARRAY['completed', 'paid']) THEN amount ELSE 0 END) AS total_revenue,
  count(CASE WHEN status = 'pending' THEN 1 ELSE NULL END)::integer AS pending_payments,
  count(CASE WHEN status = ANY(ARRAY['completed', 'paid']) THEN 1 ELSE NULL END)::integer AS completed_payments,
  COALESCE((SELECT sum(amount) FROM practitioner_payouts WHERE status = 'planned'), 0) AS pending_payouts
FROM payments;
GRANT SELECT ON public.admin_finance_stats TO authenticated;

DROP VIEW IF EXISTS public.admin_dashboard_stats CASCADE;
CREATE VIEW public.admin_dashboard_stats 
WITH (security_invoker = on)
AS SELECT * FROM get_admin_dashboard_stats();
GRANT SELECT ON public.admin_dashboard_stats TO authenticated;

-- 2. PROFILES - Supprimer la policy trop permissive et ajouter celle pour praticiens
DROP POLICY IF EXISTS "Require authentication for profiles" ON public.profiles;

-- Ajouter policy pour praticiens (n'existe pas encore)
DROP POLICY IF EXISTS "Practitioners can view patient profiles for appointments" ON public.profiles;
CREATE POLICY "Practitioners can view patient profiles for appointments"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM appointments a
    JOIN practitioners p ON a.practitioner_id = p.id::text
    WHERE p.user_id = auth.uid()
    AND a.patient_id = profiles.id::text
    AND a.status IN ('confirmed', 'in-progress', 'completed', 'pending_payment')
  )
);

-- S'assurer que service role peut insérer pour les triggers
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
CREATE POLICY "Service role can insert profiles"
ON public.profiles FOR INSERT
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- 3. MEDICAL_PROFILES - Limiter l'accès temporellement
DROP POLICY IF EXISTS "Practitioners can view shared medical profiles for their patien" ON public.medical_profiles;
CREATE POLICY "Practitioners can view shared medical profiles for active appointments"
ON public.medical_profiles FOR SELECT
USING (
  share_with_practitioner = true
  AND EXISTS (
    SELECT 1 FROM appointments a
    JOIN practitioners p ON a.practitioner_id = p.id::text
    WHERE p.user_id = auth.uid()
    AND a.patient_id = medical_profiles.user_id::text
    AND a.status IN ('confirmed', 'in-progress')
    AND a.date::date BETWEEN CURRENT_DATE - INTERVAL '1 day' AND CURRENT_DATE + INTERVAL '1 day'
  )
);

-- 4. APPOINTMENTS - Fonction pour masquer les notes internes
CREATE OR REPLACE FUNCTION public.mask_appointment_internal_notes(appointment_row appointments)
RETURNS appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result appointments;
BEGIN
  result := appointment_row;
  IF NOT EXISTS (SELECT 1 FROM practitioners WHERE user_id = auth.uid()) 
     AND NOT is_admin(auth.uid()) THEN
    result.internal_notes := NULL;
  END IF;
  RETURN result;
END;
$$;