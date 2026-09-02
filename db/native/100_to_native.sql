-- =============================================================================
-- 100_to_native.sql — Conversion du schéma Supabase (rejoué) en PostgreSQL natif
--
-- Pré-requis : la base contient le schéma Supabase rejoué (000_supabase_compat_shim.sql
-- puis supabase/migrations/*.sql) ET, en migration réelle, les données importées
-- (public.* + auth.users) depuis le pg_dump Supabase.
--
-- Ce script est idempotent et transactionnel. Il :
--   1. crée public.users (remplace auth.users) + tables de tokens
--   2. copie auth.users -> public.users (hash bcrypt conservé : les mots de passe
--      restent valides, aucun reset forcé)
--   3. re-pointe les 31 clés étrangères auth.users -> public.users
--   4. déplace le trigger de création de profil sur public.users
--   5. redéfinit auth.uid()/auth.role()/auth.jwt() sur des variables de session
--      (SET LOCAL app.user_id ...) positionnées par le back-end
--   6. supprime le schéma storage (fichiers = table public.files + S3/MinIO)
--   7. crée les rôles de connexion applicatifs
--   8. supprime auth.users
-- =============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Table des comptes applicatifs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 citext,
  phone                 text,
  password_hash         text,                      -- bcrypt ($2a$/$2b$), identique à auth.users.encrypted_password
  email_verified_at     timestamptz,
  phone_verified_at     timestamptz,
  last_sign_in_at       timestamptz,
  failed_login_attempts integer NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  banned_until          timestamptz,
  raw_user_meta_data    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- conserve full_name/phone/pending_onboarding (lu par handle_new_user_safe et le front)
  raw_app_meta_data     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  CONSTRAINT users_email_or_phone_chk CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON public.users (email) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON public.users (phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS users_last_sign_in_idx ON public.users (last_sign_in_at);

-- Sessions / refresh tokens (rotation, révocation)
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,                -- sha256 du token opaque
  family_id   uuid NOT NULL DEFAULT gen_random_uuid(), -- détection de réutilisation
  user_agent  text,
  ip_address  inet,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON public.refresh_tokens (user_id) WHERE revoked_at IS NULL;

-- Jetons à usage unique : vérification e-mail, reset mot de passe, OTP téléphone, lien magique
CREATE TABLE IF NOT EXISTS public.auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES public.users(id) ON DELETE CASCADE,
  identifier  text NOT NULL,                       -- e-mail ou téléphone ciblé
  kind        text NOT NULL CHECK (kind IN ('email_verification','password_reset','magic_link','phone_otp','email_otp')),
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_lookup_idx ON public.auth_tokens (identifier, kind) WHERE consumed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Copie des comptes Supabase (si auth.users est présent et peuplé)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO public.users (id, email, phone, password_hash, email_verified_at, phone_verified_at,
                              last_sign_in_at, raw_user_meta_data, raw_app_meta_data,
                              created_at, updated_at, banned_until, deleted_at)
    SELECT u.id, NULLIF(u.email,'')::citext, NULLIF(u.phone,''), NULLIF(u.encrypted_password,''),
           u.email_confirmed_at, u.phone_confirmed_at, u.last_sign_in_at,
           COALESCE(u.raw_user_meta_data,'{}'::jsonb), COALESCE(u.raw_app_meta_data,'{}'::jsonb),
           COALESCE(u.created_at, now()), COALESCE(u.updated_at, now()), u.banned_until, u.deleted_at
    FROM auth.users u
    ON CONFLICT (id) DO NOTHING;
    RAISE NOTICE 'auth.users copiés vers public.users : % lignes', (SELECT count(*) FROM public.users);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Re-pointage des clés étrangères auth.users -> public.users
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record; def text;
BEGIN
  IF to_regclass('auth.users') IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT c.oid, c.conname, c.conrelid::regclass AS tbl, pg_get_constraintdef(c.oid) AS condef
    FROM pg_constraint c
    WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass
  LOOP
    def := replace(r.condef, 'REFERENCES auth.users(', 'REFERENCES public.users(');
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.tbl, r.conname, def);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Trigger de création automatique du profil (ex auth.users)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_user_created ON public.users;
CREATE TRIGGER on_user_created
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_safe();

DROP TRIGGER IF EXISTS set_users_updated_at ON public.users;
CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. Contexte utilisateur : auth.uid()/auth.role()/auth.jwt() lisent des GUC
--    Le back-end exécute au début de chaque transaction :
--      SET LOCAL app.user_id = '<uuid>'; SET LOCAL app.user_role = 'authenticated'|'service_role';
--    Sans GUC => anonyme (uid NULL). Les 155 policies et les 4 fonctions SQL
--    utilisant auth.* restent donc valides sans modification.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.user_role', true), ''), 'anon') $$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_email', true), '') $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'sub',   NULLIF(current_setting('app.user_id', true), ''),
    'role',  COALESCE(NULLIF(current_setting('app.user_role', true), ''), 'anon'),
    'email', NULLIF(current_setting('app.user_email', true), ''))) $$;
-- Alias "natifs" pour le nouveau code
CREATE OR REPLACE FUNCTION public.current_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT auth.uid() $$;
CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.role() $$;

-- ---------------------------------------------------------------------------
-- 6. Storage Supabase : supprimé. Les objets sont référencés par public.files
--    (colonnes bucket/path) et hébergés sur S3 compatible (Wasabi/MinIO).
-- ---------------------------------------------------------------------------
DROP SCHEMA IF EXISTS storage CASCADE;
DROP PUBLICATION IF EXISTS supabase_realtime;   -- remplacé par 110_realtime_notify.sql

-- ---------------------------------------------------------------------------
-- 7. Rôles de connexion applicatifs
--    - domicares_app : utilisé par l'API (NestJS). Hérite de "authenticated"
--      pour que les policies RLS existantes s'appliquent si RLS est conservé.
--    - domicares_migrator : propriétaire des objets, exécute les migrations.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='domicares_app') THEN
    CREATE ROLE domicares_app LOGIN PASSWORD 'change-me';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='domicares_migrator') THEN
    CREATE ROLE domicares_migrator LOGIN PASSWORD 'change-me' CREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT authenticated TO domicares_app;
GRANT USAGE ON SCHEMA public, auth TO domicares_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO domicares_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO domicares_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, auth TO domicares_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO domicares_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO domicares_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO domicares_app;
-- Les tables sensibles ne doivent pas être lisibles par le rôle applicatif "authenticated" via RLS ;
-- public.users est protégée : seul le service peut la lire.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_service_only ON public.users;
CREATE POLICY users_service_only ON public.users FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS users_self_read ON public.users;
CREATE POLICY users_self_read ON public.users FOR SELECT USING (id = auth.uid());
ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refresh_tokens_service_only ON public.refresh_tokens;
CREATE POLICY refresh_tokens_service_only ON public.refresh_tokens FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS auth_tokens_service_only ON public.auth_tokens;
CREATE POLICY auth_tokens_service_only ON public.auth_tokens FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 8. Fonctions PL/pgSQL qui lisent encore auth.users dans leur corps
--    (cleanup_orphan_accounts, repair_missing_profiles, …) : réécriture
--    automatique auth.users -> public.users (les corps PL/pgSQL ne sont pas
--    validés à la création, d'où ce traitement explicite).
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record; def text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND pg_get_functiondef(p.oid) ~ 'auth\.users'
  LOOP
    def := regexp_replace(pg_get_functiondef(r.oid), 'auth\.users', 'public.users', 'g');
    EXECUTE def;
    RAISE NOTICE 'fonction % réécrite (auth.users -> public.users)', r.proname;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Suppression d'auth.users (les FK et le trigger ont été déplacés)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS auth.users CASCADE;

-- Vue admin_dashboard_stats : le dump Supabase la crée avant sa fonction (ordre
-- incorrect) ; on la (re)crée ici pour être sûr.
CREATE OR REPLACE VIEW public.admin_dashboard_stats AS
  SELECT patients_count, practitioners_count, appointments_count, total_revenue
  FROM public.get_admin_dashboard_stats() g(patients_count, practitioners_count, appointments_count, total_revenue);

COMMIT;
