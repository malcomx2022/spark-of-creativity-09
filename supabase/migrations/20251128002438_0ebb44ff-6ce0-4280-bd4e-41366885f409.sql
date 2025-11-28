-- Supprimer la vue si elle existe encore
DROP VIEW IF EXISTS public.practitioners_public_view CASCADE;

-- Supprimer toutes les politiques existantes sur practitioners
DO $$
DECLARE policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT policyname FROM pg_policies
        WHERE tablename = 'practitioners' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.practitioners', policy_record.policyname);
    END LOOP;
END $$;

-- S'assurer que RLS est activé
ALTER TABLE public.practitioners ENABLE ROW LEVEL SECURITY;

-- Politique pour utilisateurs anonymes : voir praticiens approuvés et disponibles
CREATE POLICY "anon_view_approved_practitioners"
ON public.practitioners FOR SELECT TO anon
USING (kyc_status = 'approved' AND available = true);

-- Politique pour utilisateurs authentifiés
CREATE POLICY "authenticated_view_practitioners"
ON public.practitioners FOR SELECT TO authenticated
USING (
  kyc_status = 'approved' AND (
    user_id = auth.uid() OR 
    available = true OR
    EXISTS (SELECT 1 FROM public.appointments WHERE practitioner_id = practitioners.id::text AND patient_id = auth.uid()::text) OR
    public.has_role(auth.uid(), 'super_admin')
  )
);

-- Politique pour que les praticiens puissent créer leur profil
CREATE POLICY "practitioners_insert_own"
ON public.practitioners FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Politique pour que les praticiens puissent mettre à jour leur profil
CREATE POLICY "practitioners_update_own"
ON public.practitioners FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

-- Politique pour les admins : voir tous les praticiens
CREATE POLICY "admins_view_all_practitioners"
ON public.practitioners FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

-- Politique pour les admins : mettre à jour tous les praticiens
CREATE POLICY "admins_update_all_practitioners"
ON public.practitioners FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()));

-- Accorder les permissions SELECT
GRANT SELECT ON public.practitioners TO anon, authenticated;