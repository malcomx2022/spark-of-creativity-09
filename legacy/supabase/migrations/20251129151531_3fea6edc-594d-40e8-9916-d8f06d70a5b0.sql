-- Corriger la politique RLS INSERT sur profiles
-- L'INSERT doit vérifier que l'utilisateur crée son propre profil

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

CREATE POLICY "Users can insert their own profile"
ON profiles
FOR INSERT
TO public
WITH CHECK (auth.uid() = id);

-- Ajouter un commentaire explicatif
COMMENT ON POLICY "Users can insert their own profile" ON profiles IS 
'Permet uniquement aux utilisateurs de créer leur propre profil (user_id = auth.uid())';