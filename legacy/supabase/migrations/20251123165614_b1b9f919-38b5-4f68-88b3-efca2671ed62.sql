-- Étape 1: Supprimer complètement l'ancienne contrainte
ALTER TABLE public.practitioners 
DROP CONSTRAINT practitioners_kyc_status_check;

-- Étape 2: Migrer toutes les anciennes valeurs vers les nouvelles
UPDATE public.practitioners 
SET kyc_status = 
  CASE 
    WHEN kyc_status = 'validated' THEN 'approved'
    WHEN kyc_status = 'refused' THEN 'rejected'
    WHEN kyc_status = 'to_renew' THEN 'incomplete'
    ELSE kyc_status
  END;

-- Étape 3: Créer la nouvelle contrainte avec les valeurs correctes
ALTER TABLE public.practitioners 
ADD CONSTRAINT practitioners_kyc_status_check 
CHECK (kyc_status IN ('pending', 'approved', 'rejected', 'incomplete'));