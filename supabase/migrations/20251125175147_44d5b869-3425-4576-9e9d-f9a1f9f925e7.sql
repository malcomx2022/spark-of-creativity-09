-- Security Fix: Remove public PII exposure from practitioners table
-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Anyone can view available practitioners" ON public.practitioners;

-- Create a secure view that only exposes non-sensitive practitioner data
CREATE OR REPLACE VIEW public.practitioners_public_view AS
SELECT 
  id,
  name,
  specialty,
  practitioner_type,
  bio,
  rating,
  available,
  years_experience,
  languages,
  certifications,
  session_types,
  intervention_zone,
  communes_served,
  image,
  created_at,
  -- Only expose commune-level location, not exact coordinates
  CASE 
    WHEN communes_served IS NOT NULL AND array_length(communes_served, 1) > 0 
    THEN communes_served[1]
    ELSE NULL 
  END as primary_commune
FROM public.practitioners
WHERE available = true 
  AND kyc_status = 'approved';

-- Grant SELECT on the public view
GRANT SELECT ON public.practitioners_public_view TO anon, authenticated;

-- Add RLS policy for practitioners table - only authenticated users with specific conditions
CREATE POLICY "Authenticated users can view practitioner details" 
ON public.practitioners 
FOR SELECT 
TO authenticated
USING (
  kyc_status = 'approved' 
  AND (
    -- Users can see their own practitioner profile
    user_id = auth.uid()
    -- Or users who have appointments with this practitioner
    OR EXISTS (
      SELECT 1 FROM public.appointments 
      WHERE practitioner_id = practitioners.id::text 
        AND patient_id = auth.uid()::text
    )
    -- Or admins can see all
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- Security Fix: Add proper RLS policies for services table
-- Drop existing overly permissive policy if it exists
DROP POLICY IF EXISTS "Enable read access for all users" ON public.services;

-- Keep the public SELECT policy (already exists and is correct)
-- Just add the missing policies for INSERT, UPDATE, DELETE

-- Restrict INSERT to admins only
CREATE POLICY "Only admins can insert services" 
ON public.services 
FOR INSERT 
TO authenticated
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Restrict UPDATE to admins only
CREATE POLICY "Only admins can update services" 
ON public.services 
FOR UPDATE 
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Restrict DELETE to admins only
CREATE POLICY "Only admins can delete services" 
ON public.services 
FOR DELETE 
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Add audit logging for service modifications
CREATE TABLE IF NOT EXISTS public.service_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values jsonb,
  new_values jsonb,
  modified_by uuid,
  modified_at timestamptz DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.service_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Only admins can view service audit logs" 
ON public.service_audit_log 
FOR SELECT 
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Create trigger function for service audit logging
CREATE OR REPLACE FUNCTION public.log_service_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.service_audit_log (service_id, action, new_values, modified_by)
    VALUES (NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.service_audit_log (service_id, action, old_values, new_values, modified_by)
    VALUES (NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.service_audit_log (service_id, action, old_values, modified_by)
    VALUES (OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Create triggers for audit logging
DROP TRIGGER IF EXISTS service_changes_audit ON public.services;
CREATE TRIGGER service_changes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.log_service_changes();