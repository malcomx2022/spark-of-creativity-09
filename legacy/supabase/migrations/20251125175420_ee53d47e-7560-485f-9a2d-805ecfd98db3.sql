-- Fix practitioner_availability public exposure
DROP POLICY IF EXISTS "Anyone can view availability" ON public.practitioner_availability;

-- Only authenticated users can view availability
CREATE POLICY "Authenticated users can view availability" 
ON public.practitioner_availability 
FOR SELECT 
TO authenticated
USING (true);

-- Fix group_sessions public exposure
DROP POLICY IF EXISTS "Anyone can view confirmed group sessions" ON public.group_sessions;

-- Only authenticated users can view group sessions
CREATE POLICY "Authenticated users can view group sessions" 
ON public.group_sessions 
FOR SELECT 
TO authenticated
USING (status IN ('confirmee', 'planifiee'));

-- Add comment explaining the Security Definer view is intentional
COMMENT ON VIEW public.practitioners_public_view IS 
'SECURITY: This view uses SECURITY DEFINER intentionally to enforce field-level access control. 
It exposes only non-sensitive practitioner data (specialty, bio, rating, commune) while protecting 
PII (phone numbers, addresses, exact GPS coordinates). This is the recommended security pattern 
for healthcare provider data protection.';