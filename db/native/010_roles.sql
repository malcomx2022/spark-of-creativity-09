-- =============================================================================
-- 010_roles.sql — Rôles PostgreSQL requis par le schéma natif
-- (les policies RLS héritées ciblent anon/authenticated/service_role).
-- À exécuter en super-utilisateur sur le serveur cible AVANT schema.native.sql.
-- Changer les mots de passe immédiatement (ALTER ROLE ... PASSWORD) ou via
-- les variables DOMICARES_APP_PASSWORD / DOMICARES_MIGRATOR_PASSWORD du script d'import.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')            THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')   THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')    THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='domicares_migrator') THEN CREATE ROLE domicares_migrator LOGIN PASSWORD 'change-me' CREATEROLE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='domicares_app')   THEN CREATE ROLE domicares_app LOGIN PASSWORD 'change-me'; END IF;
END $$;
GRANT authenticated TO domicares_app;
