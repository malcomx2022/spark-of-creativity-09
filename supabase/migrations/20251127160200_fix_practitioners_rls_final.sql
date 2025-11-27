-- Final fix: Clean up all existing policies and create proper RLS for practitioners
-- This migration ensures anonymous users can view practitioners

-- Step 1: Drop the problematic public view if it exists
DROP VIEW IF EXISTS public.practitioners_public_view CASCADE;

-- Step 2: Drop ALL existing policies on practitioners table
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT policyname
        FROM pg_policies
        WHERE tablename = 'practitioners' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.practitioners', policy_record.policyname);
    END LOOP;
END $$;

-- Step 3: Ensure RLS is enabled
ALTER TABLE public.practitioners ENABLE ROW LEVEL SECURITY;

-- Step 4: Create policy for anonymous users (most important for the fix)
CREATE POLICY "anon_view_approved_practitioners"
ON public.practitioners
FOR SELECT
TO anon
USING (
  kyc_status = 'approved'
  AND available = true
);

-- Step 5: Create policy for authenticated users
CREATE POLICY "authenticated_view_practitioners"
ON public.practitioners
FOR SELECT
TO authenticated
USING (
  kyc_status = 'approved'
  AND (
    -- Own profile
    user_id = auth.uid()
    -- All available practitioners
    OR available = true
    -- Practitioners they have appointments with
    OR EXISTS (
      SELECT 1 FROM public.appointments
      WHERE practitioner_id = practitioners.id::text
        AND patient_id = auth.uid()::text
    )
    -- Admins see all
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'super_admin'
    )
  )
);

-- Step 6: Grant SELECT permission to anon and authenticated roles
GRANT SELECT ON public.practitioners TO anon, authenticated;

-- Step 7: Add helpful comments
COMMENT ON POLICY "anon_view_approved_practitioners" ON public.practitioners IS
'Allows anonymous users to browse approved and available practitioners for public search';

COMMENT ON POLICY "authenticated_view_practitioners" ON public.practitioners IS
'Allows authenticated users to view practitioners they have appointments with, all available practitioners, and their own profile';
