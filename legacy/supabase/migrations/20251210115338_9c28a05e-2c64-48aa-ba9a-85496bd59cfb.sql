-- Permettre aux praticiens de voir leurs propres versements (payouts)
CREATE POLICY "Practitioners can view their own payouts" 
ON public.practitioner_payouts 
FOR SELECT 
USING (
  practitioner_id IN (
    SELECT id FROM practitioners WHERE user_id = auth.uid()
  )
);