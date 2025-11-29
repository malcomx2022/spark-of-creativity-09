-- Ajouter des politiques RLS pour permettre aux Edge Functions (service_role)
-- d'insérer des données lors de l'inscription des patients

-- ==========================================
-- PROFILES
-- ==========================================
-- Politique pour permettre au service_role d'insérer/modifier des profils
CREATE POLICY "Service role can manage all profiles"
  ON public.profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==========================================
-- ADDRESSES
-- ==========================================
-- Politique pour permettre au service_role d'insérer des adresses
CREATE POLICY "Service role can manage all addresses"
  ON public.addresses FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==========================================
-- EMERGENCY_CONTACTS
-- ==========================================
-- Politique pour permettre au service_role d'insérer des contacts d'urgence
CREATE POLICY "Service role can manage all emergency contacts"
  ON public.emergency_contacts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==========================================
-- MEDICAL_PROFILES
-- ==========================================
-- Politique pour permettre au service_role d'insérer des profils médicaux
CREATE POLICY "Service role can manage all medical profiles"
  ON public.medical_profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==========================================
-- CONSENTS
-- ==========================================
-- Politique pour permettre au service_role d'insérer des consentements
CREATE POLICY "Service role can manage all consents"
  ON public.consents FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "Service role can manage all profiles" ON public.profiles IS
'Permet aux Edge Functions d''insérer des profils lors de l''inscription';

COMMENT ON POLICY "Service role can manage all addresses" ON public.addresses IS
'Permet aux Edge Functions d''insérer des adresses lors de l''inscription';

COMMENT ON POLICY "Service role can manage all emergency contacts" ON public.emergency_contacts IS
'Permet aux Edge Functions d''insérer des contacts d''urgence lors de l''inscription';

COMMENT ON POLICY "Service role can manage all medical profiles" ON public.medical_profiles IS
'Permet aux Edge Functions d''insérer des profils médicaux lors de l''inscription';

COMMENT ON POLICY "Service role can manage all consents" ON public.consents IS
'Permet aux Edge Functions d''insérer des consentements lors de l''inscription';
