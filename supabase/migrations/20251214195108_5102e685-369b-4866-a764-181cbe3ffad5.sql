-- =====================================================
-- SOLUTION ANTI-COMPTES ORPHELINS
-- =====================================================

-- 1. Créer une fonction qui crée automatiquement un profil de base
-- lors de la création d'un utilisateur dans auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Créer un profil minimal avec les données disponibles
  INSERT INTO public.profiles (
    id,
    full_name,
    phone,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->'pending_onboarding'->'profile'->>'fullName',
      SPLIT_PART(NEW.email, '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'phone',
      NEW.raw_user_meta_data->'pending_onboarding'->'profile'->>'phone'
    ),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Ne pas bloquer la création du compte en cas d'erreur
    RAISE WARNING 'handle_new_user_safe failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 2. Créer le trigger sur auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_safe ON auth.users;
CREATE TRIGGER on_auth_user_created_safe
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_safe();

-- 3. Créer une fonction pour nettoyer les comptes orphelins
-- (utilisateurs sans profil depuis plus de 24h)
CREATE OR REPLACE FUNCTION public.cleanup_orphan_accounts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_deleted_count integer := 0;
  v_orphan_user RECORD;
BEGIN
  -- Trouver les utilisateurs sans profil créés il y a plus de 24h
  FOR v_orphan_user IN
    SELECT u.id, u.email, u.created_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
    AND u.created_at < NOW() - INTERVAL '24 hours'
  LOOP
    -- Vérifier s'il n'est pas praticien non plus
    IF NOT EXISTS (SELECT 1 FROM practitioners WHERE user_id = v_orphan_user.id) THEN
      -- Supprimer l'utilisateur orphelin
      DELETE FROM auth.users WHERE id = v_orphan_user.id;
      v_deleted_count := v_deleted_count + 1;
      
      RAISE NOTICE 'Deleted orphan user: % (%)', v_orphan_user.email, v_orphan_user.id;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'executed_at', NOW()
  );
END;
$$;

-- 4. Créer une fonction pour vérifier et réparer les profils manquants
CREATE OR REPLACE FUNCTION public.repair_missing_profiles()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_repaired_count integer := 0;
  v_orphan_user RECORD;
BEGIN
  -- Trouver les utilisateurs sans profil
  FOR v_orphan_user IN
    SELECT 
      u.id, 
      u.email, 
      u.raw_user_meta_data,
      u.created_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  LOOP
    -- Vérifier s'il n'est pas praticien
    IF NOT EXISTS (SELECT 1 FROM practitioners WHERE user_id = v_orphan_user.id) THEN
      -- Créer le profil manquant
      INSERT INTO public.profiles (
        id,
        full_name,
        phone,
        created_at,
        updated_at
      ) VALUES (
        v_orphan_user.id,
        COALESCE(
          v_orphan_user.raw_user_meta_data->>'full_name',
          v_orphan_user.raw_user_meta_data->'pending_onboarding'->'profile'->>'fullName',
          SPLIT_PART(v_orphan_user.email, '@', 1)
        ),
        v_orphan_user.raw_user_meta_data->'pending_onboarding'->'profile'->>'phone',
        v_orphan_user.created_at,
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
      
      v_repaired_count := v_repaired_count + 1;
      RAISE NOTICE 'Repaired profile for user: % (%)', v_orphan_user.email, v_orphan_user.id;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'repaired_count', v_repaired_count,
    'executed_at', NOW()
  );
END;
$$;

-- 5. Exécuter la réparation des profils existants immédiatement
SELECT public.repair_missing_profiles();