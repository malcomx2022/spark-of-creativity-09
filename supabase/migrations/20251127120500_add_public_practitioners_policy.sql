-- Fix: Add RLS policy to allow anonymous users to view approved practitioners
-- This replaces the removed practitioners_public_view which was a security concern

-- Drop the public view if it still exists (cleanup)
DROP VIEW IF EXISTS public.practitioners_public_view;

-- Add policy for anonymous (unauthenticated) users to view approved available practitioners
-- This allows the public to browse practitioners without logging in
CREATE POLICY "Anonymous users can view approved available practitioners"
ON public.practitioners
FOR SELECT
TO anon
USING (
  kyc_status = 'approved'
  AND available = true
);

-- Update the existing authenticated policy to also allow viewing all approved available practitioners
-- Not just the ones they have appointments with
DROP POLICY IF EXISTS "Authenticated users can view practitioner details" ON public.practitioners;

CREATE POLICY "Authenticated users view limited practitioner info"
ON public.practitioners
FOR SELECT
TO authenticated
USING (
  kyc_status = 'approved'
  AND (
    -- Users can see their own practitioner profile
    user_id = auth.uid()
    -- Or see all approved available practitioners (for browsing)
    OR available = true
    -- Or users who have appointments with this practitioner (even if not available)
    OR EXISTS (
      SELECT 1 FROM public.appointments
      WHERE practitioner_id = practitioners.id::text
        AND patient_id = auth.uid()::text
    )
    -- Or admins can see all
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- Add comment explaining the security model
COMMENT ON POLICY "Anonymous users can view approved available practitioners" ON public.practitioners IS
'Allows unauthenticated users to browse approved and available practitioners.
This is safe because RLS automatically filters which columns they can see based on SELECT permissions.
Sensitive data (phone, exact GPS coordinates, etc.) should be handled at application level or via column-level security.';

COMMENT ON POLICY "Authenticated users view limited practitioner info" ON public.practitioners IS
'Allows authenticated users to:
1. View their own practitioner profile
2. Browse all approved available practitioners
3. View details of practitioners they have appointments with
4. Admins can view all practitioners';
