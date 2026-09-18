-- Allow admins to INSERT audit logs
CREATE POLICY "Admins can insert audit logs"
ON public.admin_audit_logs
FOR INSERT
WITH CHECK (is_admin(auth.uid()));