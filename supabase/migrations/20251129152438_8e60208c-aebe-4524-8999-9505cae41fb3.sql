-- Étendre l'enum app_role pour inclure tous les types d'utilisateurs
-- Actuellement il ne contient que des rôles admin, mais le système a besoin de différencier
-- les patients, practitioners, et coaches

-- Ajouter les rôles manquants à l'enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'patient';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'practitioner';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coach';

-- Commentaire explicatif
COMMENT ON TYPE public.app_role IS 
'Types de rôles utilisateurs : patient, practitioner, coach (utilisateurs normaux) + super_admin, ops, finance, compliance, support, analyst (administrateurs)';