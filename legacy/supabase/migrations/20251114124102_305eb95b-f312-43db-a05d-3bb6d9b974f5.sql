-- Corriger les fonctions pour ajouter search_path = 'public'
-- Ceci améliore la sécurité en empêchant l'injection de schémas malveillants

CREATE OR REPLACE FUNCTION cleanup_expired_payment_slots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Annuler les rendez-vous en pending_payment dont le créneau a expiré
  UPDATE appointments
  SET 
    status = 'cancelled_unpaid',
    updated_at = now()
  WHERE 
    status = 'pending_payment'
    AND payment_expires_at < now();
    
  RAISE NOTICE 'Cleaned up expired payment slots';
END;
$$;

CREATE OR REPLACE FUNCTION request_consultation_confirmation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Marquer les consultations terminées qui nécessitent confirmation
  UPDATE appointments
  SET 
    status = 'awaiting_confirmation',
    confirmation_requested_at = now(),
    updated_at = now()
  WHERE 
    status = 'in-progress'
    AND (
      -- Si le praticien a marqué comme terminé via notes internes
      internal_notes LIKE '%CONSULTATION_TERMINEE%'
      OR
      -- Ou si la date de consultation + durée est dépassée de plus d'1 heure
      (date::timestamp + time::interval + (duration || ' minutes')::interval + interval '1 hour') < now()
    )
    AND confirmation_requested_at IS NULL;
    
  RAISE NOTICE 'Requested consultation confirmations';
END;
$$;

CREATE OR REPLACE FUNCTION auto_confirm_consultations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Auto-confirmer les consultations en attente depuis plus de 24h
  UPDATE appointments
  SET 
    status = 'completed',
    patient_confirmed_at = now(),
    updated_at = now(),
    internal_notes = COALESCE(internal_notes || E'\n', '') || 'AUTO_CONFIRMED: Pas de réponse patient après 24h'
  WHERE 
    status = 'awaiting_confirmation'
    AND confirmation_requested_at < (now() - interval '24 hours')
    AND patient_confirmed_at IS NULL;
    
  RAISE NOTICE 'Auto-confirmed consultations after 24h';
END;
$$;