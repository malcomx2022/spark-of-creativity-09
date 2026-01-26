-- Migration: Fix practitioner registration RLS and permissions
-- Date: 2026-01-27
-- Description:
--   1. Allow practitioners to view their own profile regardless of kyc_status
--   2. Allow service_role to insert into practitioners table
--   3. Ensure phone uniqueness constraint on practitioners table

-- =====================================================
-- 1. FIX RLS POLICIES ON PRACTITIONERS FOR SELF-VIEW
-- =====================================================

-- Drop the problematic policy that requires kyc_status = 'approved' for self-view
DROP POLICY IF EXISTS "Authenticated users view limited practitioner info" ON public.practitioners;

-- Create new policy: Practitioners can ALWAYS view their own profile (regardless of kyc_status)
DROP POLICY IF EXISTS "Practitioners can view their own profile" ON public.practitioners;
CREATE POLICY "Practitioners can view their own profile"
ON public.practitioners
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Keep the policy for viewing approved practitioners by patients (already exists)
-- "patients_view_booked_practitioner_limited" already handles patient access

-- =====================================================
-- 2. ADD SERVICE ROLE INSERT POLICY ON PRACTITIONERS
-- =====================================================

-- Allow service role to insert practitioners (for edge functions)
DROP POLICY IF EXISTS "Service role can insert practitioners" ON public.practitioners;
CREATE POLICY "Service role can insert practitioners"
ON public.practitioners
FOR INSERT
TO public
WITH CHECK (
  (auth.jwt() ->> 'role') = 'service_role'
  OR auth.uid() = user_id
);

-- Allow service role to update practitioners (for edge functions)
DROP POLICY IF EXISTS "Service role can update practitioners" ON public.practitioners;
CREATE POLICY "Service role can update practitioners"
ON public.practitioners
FOR UPDATE
TO public
USING (
  (auth.jwt() ->> 'role') = 'service_role'
  OR auth.uid() = user_id
);

-- =====================================================
-- 3. ENSURE PHONE UNIQUENESS ON PRACTITIONERS
-- =====================================================

-- Add unique constraint on phone if not exists (for practitioners)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'practitioners_phone_unique'
  ) THEN
    -- First, check for duplicates and handle them
    UPDATE practitioners p1
    SET phone = phone || '_dup_' || p1.id::text
    WHERE EXISTS (
      SELECT 1 FROM practitioners p2
      WHERE p2.phone = p1.phone
      AND p2.id < p1.id
      AND p2.phone IS NOT NULL
    );

    -- Then add the constraint
    ALTER TABLE public.practitioners
    ADD CONSTRAINT practitioners_phone_unique UNIQUE (phone);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add phone unique constraint: %', SQLERRM;
END $$;

-- =====================================================
-- 4. FIX PROFILES RLS FOR SERVICE ROLE UPSERT
-- =====================================================

-- Ensure service role can upsert profiles
DROP POLICY IF EXISTS "Service role can upsert profiles" ON public.profiles;
CREATE POLICY "Service role can upsert profiles"
ON public.profiles
FOR ALL
TO public
USING ((auth.jwt() ->> 'role') = 'service_role')
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- =====================================================
-- 5. ADD INDEXES FOR PERFORMANCE
-- =====================================================

-- Index for phone lookups on practitioners
CREATE INDEX IF NOT EXISTS idx_practitioners_phone
ON public.practitioners(phone)
WHERE phone IS NOT NULL;

-- Index for kyc_status lookups
CREATE INDEX IF NOT EXISTS idx_practitioners_kyc_status
ON public.practitioners(kyc_status);

-- Index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_practitioners_user_id
ON public.practitioners(user_id);

-- =====================================================
-- 6. FIX FILES TABLE RLS FOR SERVICE ROLE
-- =====================================================

-- Ensure service role can insert files (for document uploads from edge functions)
DROP POLICY IF EXISTS "Service role can insert files" ON public.files;
CREATE POLICY "Service role can insert files"
ON public.files
FOR INSERT
TO public
WITH CHECK (
  (auth.jwt() ->> 'role') = 'service_role'
  OR auth.uid() = user_id
);

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Log the policies for verification
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'practitioners';

  RAISE NOTICE 'Number of policies on practitioners table: %', policy_count;
END $$;
