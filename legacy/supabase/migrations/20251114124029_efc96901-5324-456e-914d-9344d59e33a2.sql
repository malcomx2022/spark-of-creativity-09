-- Ajouter les colonnes nécessaires pour le workflow complet
-- Sans modifier le type de status qui est utilisé dans des policies

-- Ajouter les nouvelles colonnes pour le tracking et la confirmation
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS practitioner_status text DEFAULT 'assigned',
  ADD COLUMN IF NOT EXISTS payment_expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS confirmation_requested_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS patient_confirmed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS practitioner_latitude numeric,
  ADD COLUMN IF NOT EXISTS practitioner_longitude numeric,
  ADD COLUMN IF NOT EXISTS practitioner_last_location_update timestamp with time zone;

-- Ajouter des index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_payment_expires_at ON appointments(payment_expires_at) WHERE payment_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_confirmation_requested ON appointments(confirmation_requested_at) WHERE confirmation_requested_at IS NOT NULL;

-- Ajouter une contrainte check pour les statuts valides (remplace l'ENUM)
ALTER TABLE appointments 
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check CHECK (
    status IN (
      'pending_payment',      -- Créneau bloqué temporairement (15 min max)
      'awaiting_practitioner', -- En attente acceptation praticien
      'confirmed',            -- Praticien a accepté, paiement validé
      'pending',              -- Ancien statut (à migrer)
      'in-progress',          -- Consultation en cours
      'awaiting_confirmation', -- En attente confirmation patient
      'completed',            -- Consultation terminée et confirmée
      'cancelled_unpaid',     -- Annulé car paiement échoué/abandonné
      'cancelled',            -- Annulé par patient/praticien
      'rejected'              -- Refusé par praticien
    )
  );

-- Ajouter une contrainte check pour le statut du praticien
ALTER TABLE appointments 
  DROP CONSTRAINT IF EXISTS appointments_practitioner_status_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_practitioner_status_check CHECK (
    practitioner_status IN (
      'assigned',     -- Praticien assigné
      'preparing',    -- Praticien se prépare
      'en_route',     -- Praticien en route
      'arrived',      -- Praticien arrivé
      'in_progress'   -- Consultation en cours
    )
  );

-- Commentaires pour documentation
COMMENT ON COLUMN appointments.practitioner_status IS 'Statut de tracking du praticien: assigned, preparing, en_route, arrived, in_progress';
COMMENT ON COLUMN appointments.payment_expires_at IS 'Date/heure d''expiration du créneau bloqué pour paiement (15 minutes)';
COMMENT ON COLUMN appointments.confirmation_requested_at IS 'Date/heure de la demande de confirmation au patient';
COMMENT ON COLUMN appointments.patient_confirmed_at IS 'Date/heure de confirmation de la consultation par le patient';
COMMENT ON COLUMN appointments.practitioner_latitude IS 'Latitude actuelle du praticien (pour tracking)';
COMMENT ON COLUMN appointments.practitioner_longitude IS 'Longitude actuelle du praticien (pour tracking)';
COMMENT ON COLUMN appointments.practitioner_last_location_update IS 'Dernière mise à jour de la position du praticien';

-- Fonction pour nettoyer automatiquement les créneaux expirés
CREATE OR REPLACE FUNCTION cleanup_expired_payment_slots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Fonction pour demander confirmation au patient après consultation
CREATE OR REPLACE FUNCTION request_consultation_confirmation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Fonction pour auto-confirmer les consultations après 24h sans réponse
CREATE OR REPLACE FUNCTION auto_confirm_consultations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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