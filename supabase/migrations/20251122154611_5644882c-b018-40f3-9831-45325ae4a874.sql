-- ✅ CORRECTION BUG #3: Ajouter contrainte UNIQUE sur webhook_events.event_id
-- pour éviter les événements dupliqués
ALTER TABLE webhook_events ADD CONSTRAINT webhook_events_event_id_unique UNIQUE (event_id);

-- ✅ CORRECTION BUG #7: Améliorer le rate limiting OTP avec fonction et table dédiée
CREATE TABLE IF NOT EXISTS otp_rate_limits (
  phone_number TEXT PRIMARY KEY,
  attempts INTEGER DEFAULT 1,
  first_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  blocked_until TIMESTAMP WITH TIME ZONE
);

-- Fonction pour vérifier et gérer le rate limiting OTP
CREATE OR REPLACE FUNCTION check_otp_rate_limit(phone TEXT)
RETURNS JSONB AS $$
DECLARE
  rate_limit RECORD;
  max_attempts INTEGER := 5;
  window_minutes INTEGER := 60;
  block_duration_minutes INTEGER := 60;
BEGIN
  -- Récupérer l'état actuel
  SELECT * INTO rate_limit FROM otp_rate_limits WHERE phone_number = phone;
  
  -- Si bloqué, vérifier si toujours valide
  IF rate_limit.blocked_until IS NOT NULL AND rate_limit.blocked_until > NOW() THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'blocked',
      'retry_after', EXTRACT(EPOCH FROM (rate_limit.blocked_until - NOW()))::INTEGER
    );
  END IF;
  
  -- Si première tentative ou fenêtre expirée, réinitialiser
  IF rate_limit IS NULL OR 
     rate_limit.first_attempt_at < NOW() - (window_minutes || ' minutes')::INTERVAL THEN
    INSERT INTO otp_rate_limits (phone_number, attempts, first_attempt_at)
    VALUES (phone, 1, NOW())
    ON CONFLICT (phone_number) DO UPDATE
    SET attempts = 1, first_attempt_at = NOW(), blocked_until = NULL;
    
    RETURN jsonb_build_object('allowed', true, 'remaining', max_attempts - 1);
  END IF;
  
  -- Si trop de tentatives, bloquer
  IF rate_limit.attempts >= max_attempts THEN
    UPDATE otp_rate_limits
    SET blocked_until = NOW() + (block_duration_minutes || ' minutes')::INTERVAL
    WHERE phone_number = phone;
    
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'too_many_attempts',
      'retry_after', block_duration_minutes * 60
    );
  END IF;
  
  -- Incrémenter le compteur
  UPDATE otp_rate_limits
  SET attempts = attempts + 1
  WHERE phone_number = phone;
  
  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', max_attempts - rate_limit.attempts - 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fonction de nettoyage automatique
CREATE OR REPLACE FUNCTION cleanup_old_otp_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_rate_limits
  WHERE first_attempt_at < NOW() - INTERVAL '7 days'
    AND (blocked_until IS NULL OR blocked_until < NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;