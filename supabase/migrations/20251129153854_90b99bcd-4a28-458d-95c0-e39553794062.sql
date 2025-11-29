-- ============================================================================
-- FIX: Autoriser l'edge function complete-user-registration à créer des profils
-- ============================================================================
-- Problème : Les politiques WITH CHECK bloquent les insertions depuis la clé de service
-- car auth.uid() retourne NULL dans le contexte de l'edge function
--
-- Solution : Modifier les politiques pour accepter le rôle service_role
-- ============================================================================

-- 1. PROFILS : Autoriser service_role à créer des profils pour n'importe quel utilisateur
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO public
WITH CHECK (
  -- Soit l'utilisateur crée son propre profil
  auth.uid() = id
  -- Soit c'est la clé de service (edge function)
  OR auth.jwt()->>'role' = 'service_role'
);

-- 2. ADRESSES : Autoriser service_role
DROP POLICY IF EXISTS "Users can manage their addresses" ON public.addresses;

CREATE POLICY "Users can manage their addresses"
ON public.addresses
FOR ALL
TO public
USING (
  auth.uid() = user_id
  OR auth.jwt()->>'role' = 'service_role'
)
WITH CHECK (
  auth.uid() = user_id
  OR auth.jwt()->>'role' = 'service_role'
);

-- 3. CONTACTS D'URGENCE : Autoriser service_role
DROP POLICY IF EXISTS "Users can manage their emergency contacts" ON public.emergency_contacts;

CREATE POLICY "Users can manage their emergency contacts"
ON public.emergency_contacts
FOR ALL
TO public
USING (
  auth.uid() = user_id
  OR auth.jwt()->>'role' = 'service_role'
)
WITH CHECK (
  auth.uid() = user_id
  OR auth.jwt()->>'role' = 'service_role'
);

-- 4. PROFILS MÉDICAUX : Autoriser service_role
DROP POLICY IF EXISTS "Users can manage their medical profiles" ON public.medical_profiles;

CREATE POLICY "Users can manage their medical profiles"
ON public.medical_profiles
FOR ALL
TO public
USING (
  auth.uid() = user_id
  OR auth.jwt()->>'role' = 'service_role'
)
WITH CHECK (
  auth.uid() = user_id
  OR auth.jwt()->>'role' = 'service_role'
);

-- 5. CONSENTEMENTS : Autoriser service_role
DROP POLICY IF EXISTS "Users can manage their consents" ON public.consents;

CREATE POLICY "Users can manage their consents"
ON public.consents
FOR ALL
TO public
USING (
  auth.uid() = user_id
  OR auth.jwt()->>'role' = 'service_role'
)
WITH CHECK (
  auth.uid() = user_id
  OR auth.jwt()->>'role' = 'service_role'
);

-- Commentaires explicatifs
COMMENT ON POLICY "Users can insert their own profile" ON public.profiles IS
'Permet aux utilisateurs de créer leur propre profil OU aux edge functions (service_role) de créer des profils';

COMMENT ON POLICY "Users can manage their addresses" ON public.addresses IS
'Permet aux utilisateurs de gérer leurs adresses OU aux edge functions (service_role) de créer des adresses';

COMMENT ON POLICY "Users can manage their emergency contacts" ON public.emergency_contacts IS
'Permet aux utilisateurs de gérer leurs contacts d''urgence OU aux edge functions (service_role) de créer des contacts';

COMMENT ON POLICY "Users can manage their medical profiles" ON public.medical_profiles IS
'Permet aux utilisateurs de gérer leur profil médical OU aux edge functions (service_role) de créer des profils médicaux';

COMMENT ON POLICY "Users can manage their consents" ON public.consents IS
'Permet aux utilisateurs de gérer leurs consentements OU aux edge functions (service_role) d''enregistrer des consentements';