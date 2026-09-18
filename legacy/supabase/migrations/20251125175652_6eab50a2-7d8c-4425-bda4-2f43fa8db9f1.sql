-- Fix practitioner_rates public exposure
DROP POLICY IF EXISTS "Anyone can view rates" ON public.practitioner_rates;

-- Only show rates to authenticated users who are booking
CREATE POLICY "Authenticated users can view rates" 
ON public.practitioner_rates 
FOR SELECT 
TO authenticated
USING (true);

-- Add additional protection for sensitive practitioner data fields
-- Create a more restrictive policy for practitioners table
DROP POLICY IF EXISTS "Authenticated users can view practitioner details" ON public.practitioners;

CREATE POLICY "Authenticated users view limited practitioner info" 
ON public.practitioners 
FOR SELECT 
TO authenticated
USING (
  kyc_status = 'approved' 
  AND (
    -- Users can see their own full profile
    user_id = auth.uid()
    -- Or admins can see all details
    OR has_role(auth.uid(), 'super_admin'::app_role)
    -- Regular users only see basic info via the public view
  )
);

-- Add encryption documentation comment for payment info
COMMENT ON TABLE public.practitioner_payment_info IS 
'SECURITY: Bank account numbers and phone numbers in this table should be encrypted at the application layer before storage. 
Access is restricted to the practitioner owner and super admins only. 
All access should be logged via admin_audit_logs.';

COMMENT ON TABLE public.saved_payment_methods IS 
'SECURITY: phone_number_encrypted field must use application-level encryption with keys stored in a secure key management service (NOT in database). 
Implement key rotation policies and audit all access to this table.';

-- Add comments for profiles table
COMMENT ON TABLE public.profiles IS 
'SECURITY: Phone numbers should be masked in displays and only shown when explicitly needed for communication. 
Consider additional encryption for phone field at application layer.';

-- Improve review privacy by preventing inference
-- Reviews are already protected by is_hidden check, just add documentation
COMMENT ON TABLE public.reviews IS 
'SECURITY: Patient identifiers in reviews could allow inference of health conditions. 
Ensure patient_id is never displayed in public review lists.
Only show: rating, comment (sanitized), and anonymized practitioner info.';

-- Add rate limiting documentation for availability
COMMENT ON TABLE public.practitioner_availability IS 
'SECURITY: Implement rate limiting on availability queries to prevent schedule scraping for harassment.
Consider audit logging for suspicious access patterns (multiple rapid queries).';

-- Group sessions privacy protection documentation
COMMENT ON TABLE public.group_sessions IS 
'SECURITY: Session descriptions must be generic enough to protect participant privacy.
Avoid specific mental health condition names in public-facing session descriptions.
Use category codes internally and show sanitized descriptions publicly.';