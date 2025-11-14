-- Améliorer la table otp_attempts avec les champs manquants
ALTER TABLE public.otp_attempts 
  ADD COLUMN IF NOT EXISTS ip_address INET,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Créer une fonction pour nettoyer les anciennes entrées (>30 jours)
CREATE OR REPLACE FUNCTION public.cleanup_old_otp_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.otp_attempts
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Créer un trigger pour nettoyer automatiquement les anciennes entrées
-- Note: En production, ceci devrait être un CRON job, mais pour démo on utilise un trigger
CREATE OR REPLACE FUNCTION public.trigger_cleanup_otp_attempts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nettoyer les anciennes entrées après chaque insertion
  -- En production, utiliser pg_cron ou un job externe
  PERFORM public.cleanup_old_otp_attempts();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_otp_attempt_cleanup ON public.otp_attempts;
CREATE TRIGGER after_otp_attempt_cleanup
  AFTER INSERT ON public.otp_attempts
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trigger_cleanup_otp_attempts();

-- Commentaire sur la table
COMMENT ON COLUMN public.otp_attempts.ip_address IS 'IP address of the request (for security monitoring)';
COMMENT ON COLUMN public.otp_attempts.user_agent IS 'User agent string (for security monitoring)';
COMMENT ON FUNCTION public.cleanup_old_otp_attempts() IS 'Deletes OTP attempts older than 30 days for GDPR compliance';