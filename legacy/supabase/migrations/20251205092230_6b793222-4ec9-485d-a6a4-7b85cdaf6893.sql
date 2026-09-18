-- Supprimer les anciennes policies permissives sur medical_profiles
DROP POLICY IF EXISTS "Users can manage their medical profiles" ON public.medical_profiles;

-- Policy: Le patient peut voir son propre profil médical
CREATE POLICY "Patients can view their own medical profile"
ON public.medical_profiles
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Le patient peut créer son profil médical
CREATE POLICY "Patients can create their own medical profile"
ON public.medical_profiles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Le patient peut mettre à jour son propre profil médical
CREATE POLICY "Patients can update their own medical profile"
ON public.medical_profiles
FOR UPDATE
USING (auth.uid() = user_id);

-- Policy: Le patient peut supprimer son propre profil médical
CREATE POLICY "Patients can delete their own medical profile"
ON public.medical_profiles
FOR DELETE
USING (auth.uid() = user_id);

-- Policy: Praticiens peuvent voir le profil médical si le patient a partagé ET a un RDV actif
CREATE POLICY "Practitioners can view shared medical profiles for their patients"
ON public.medical_profiles
FOR SELECT
USING (
  share_with_practitioner = true
  AND EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.patient_id = medical_profiles.user_id::text
    AND a.practitioner_id = (public.get_practitioner_id_for_user(auth.uid()))::text
    AND a.status IN ('confirmed', 'in-progress', 'completed')
  )
);