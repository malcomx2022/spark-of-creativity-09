-- Drop the security definer view
DROP VIEW IF EXISTS public.practitioners_public_view;

-- The practitioners table already has proper RLS policies, so no view is needed
-- Users will query the practitioners table directly with RLS enforcing access control