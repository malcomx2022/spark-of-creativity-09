-- Add RLS policy to allow coaches to view payments for their group sessions
CREATE POLICY "Coaches can view payments for their group sessions"
ON public.payments
FOR SELECT
USING (
  -- Check if this is a group session payment and if the coach owns the session
  appointment_id LIKE 'group_session_%' AND
  EXISTS (
    SELECT 1 
    FROM group_sessions gs
    JOIN practitioners p ON p.id = gs.coach_id
    WHERE p.user_id = auth.uid()
    AND payments.appointment_id LIKE '%' || gs.id::text || '%'
  )
);