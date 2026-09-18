-- Add RLS policy for practitioners to view payments for their appointments
CREATE POLICY "Practitioners can view payments for their appointments" 
ON public.payments 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.id = payments.appointment_id
    AND a.practitioner_id = (get_practitioner_id_for_user(auth.uid()))::text
  )
);

-- Also let practitioners view payment events for their appointments
CREATE POLICY "Practitioners can view payment events for their appointments" 
ON public.payment_events 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM payments p
    JOIN appointments a ON a.id = p.appointment_id
    WHERE p.id = payment_events.payment_id
    AND a.practitioner_id = (get_practitioner_id_for_user(auth.uid()))::text
  )
);