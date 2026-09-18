-- Ajouter les colonnes pour le médecin traitant dans medical_profiles
ALTER TABLE public.medical_profiles 
ADD COLUMN IF NOT EXISTS primary_doctor_id uuid REFERENCES public.practitioners(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS primary_doctor_name text,
ADD COLUMN IF NOT EXISTS primary_doctor_email text,
ADD COLUMN IF NOT EXISTS primary_doctor_phone text;

-- Commentaires pour documentation
COMMENT ON COLUMN public.medical_profiles.primary_doctor_id IS 'ID du médecin traitant s''il est inscrit sur la plateforme';
COMMENT ON COLUMN public.medical_profiles.primary_doctor_name IS 'Nom du médecin traitant (saisie libre si externe)';
COMMENT ON COLUMN public.medical_profiles.primary_doctor_email IS 'Email du médecin traitant pour partage de rapports';
COMMENT ON COLUMN public.medical_profiles.primary_doctor_phone IS 'Téléphone du médecin traitant';