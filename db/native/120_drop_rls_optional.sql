-- =============================================================================
-- 120_drop_rls_optional.sql — OPTIONNEL : suppression des 155 policies RLS
--
-- À exécuter uniquement si l'autorisation est intégralement portée par la couche
-- service du back-end (recommandation du dossier de refonte). Si vous préférez
-- garder RLS en "défense en profondeur", n'exécutez pas ce fichier : le back-end
-- doit alors faire SET LOCAL app.user_id / app.user_role à chaque transaction.
-- =============================================================================
BEGIN;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public'
           AND tablename NOT IN ('users','refresh_tokens','auth_tokens')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
           AND c.relname NOT IN ('users','refresh_tokens','auth_tokens')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;
COMMIT;
