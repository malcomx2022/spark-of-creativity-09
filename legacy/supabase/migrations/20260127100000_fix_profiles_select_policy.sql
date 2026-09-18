-- Migration: Fix profiles table SELECT policy
-- Date: 2026-01-27
-- Description: Allow users to view their own profile (missing SELECT policy)

-- =====================================================
-- ADD MISSING SELECT POLICY FOR OWN PROFILE
-- =====================================================

-- Users need to be able to read their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'profiles';

  RAISE NOTICE 'Number of policies on profiles table: %', policy_count;
END $$;
