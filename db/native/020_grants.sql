-- =============================================================================
-- 020_grants.sql — Privilèges du rôle applicatif domicares_app
-- À exécuter APRÈS schema.native.sql (les GRANT nécessitent que les objets
-- existent ; pg_dump --no-privileges ne les conserve pas dans schema.native.sql).
-- Ré-exécutable. Le rôle domicares_app n'est pas propriétaire : RLS s'applique
-- aux tables où elle reste activée (users, refresh_tokens, auth_tokens) ;
-- l'API positionne app.user_role = 'service_role' pour ces opérations.
-- =============================================================================
GRANT USAGE ON SCHEMA public, auth TO domicares_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO domicares_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO domicares_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO domicares_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO domicares_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO domicares_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO domicares_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO domicares_app;
