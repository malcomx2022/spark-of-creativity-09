-- Attribution du rôle super_admin à un utilisateur
-- Prérequis: L'utilisateur doit d'abord être créé via l'inscription normale

-- Fonction pour promouvoir un utilisateur au rôle super_admin
CREATE OR REPLACE FUNCTION public.promote_to_super_admin(user_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb;
BEGIN
  -- Récupérer l'ID de l'utilisateur par email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = user_email;
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found with email: ' || user_email
    );
  END IF;
  
  -- Créer le profil s'il n'existe pas
  INSERT INTO public.profiles (
    id,
    full_name,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    'Super Admin',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = COALESCE(profiles.full_name, 'Super Admin');
  
  -- Ajouter le rôle super_admin
  INSERT INTO public.user_roles (
    user_id,
    role
  ) VALUES (
    v_user_id,
    'super_admin'
  )
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Logger l'action
  INSERT INTO public.admin_audit_logs (
    admin_id,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    v_user_id,
    'promoted_to_super_admin',
    'user',
    v_user_id::text,
    jsonb_build_object(
      'email', user_email,
      'promoted_at', now()
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'email', user_email,
    'role', 'super_admin'
  );
END;
$$;

-- Instructions d'utilisation:
-- 1. Créez d'abord un utilisateur via https://app.domicares.life/admin/login
--    en vous inscrivant normalement avec l'email souhaité
-- 2. Ensuite, exécutez cette requête pour le promouvoir:
--    SELECT public.promote_to_super_admin('admin@domicares.life');

COMMENT ON FUNCTION public.promote_to_super_admin(text) IS 
'Fonction pour promouvoir un utilisateur existant au rôle super_admin. 
Usage: SELECT public.promote_to_super_admin(''email@example.com'');';