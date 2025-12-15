-- Supprimer les politiques en double pour nettoyer
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Ajouter une politique RESTRICTIVE qui EXIGE l'authentification
-- Cela bloque tout accès anonyme même si auth est contournée
CREATE POLICY "Require authentication for profiles"
ON public.profiles AS RESTRICTIVE
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);