-- ✅ Activer RLS sur otp_rate_limits
ALTER TABLE otp_rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Seuls les admins peuvent voir les limites de taux
CREATE POLICY "Admins can view OTP rate limits"
  ON otp_rate_limits
  FOR SELECT
  USING (is_admin(auth.uid()));

-- Policy: Seule la fonction système peut gérer les limites
CREATE POLICY "System can manage OTP rate limits"
  ON otp_rate_limits
  FOR ALL
  USING (false)
  WITH CHECK (false);