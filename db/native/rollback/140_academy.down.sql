-- =============================================================================
-- rollback/140_academy.down.sql — Retour arrière de db/native/140_academy.sql.
--
-- Supprime les seules tables academy_* (et leurs index, contraintes et déclencheurs) ; aucune autre
-- table n'est touchée. Les données Academy locales sont perdues : l'état reste chez Akambi et se
-- reconstruit par le rapprochement (updatedSince). À exécuter après avoir redéployé une API qui
-- n'utilise pas ces tables, et après sauvegarde :
--   docker compose --project-directory deploy/vps exec -T postgres \
--     psql -U postgres -d domicares -v ON_ERROR_STOP=1 -f - < db/native/rollback/140_academy.down.sql
-- Ne jamais placer ce fichier dans docker-entrypoint-initdb.d.
-- =============================================================================
BEGIN;
DROP TABLE IF EXISTS public.academy_sync_state;
DROP TABLE IF EXISTS public.academy_webhook_events;
DROP TABLE IF EXISTS public.academy_certificates;
DROP TABLE IF EXISTS public.academy_enrollments;
DROP TABLE IF EXISTS public.academy_learners;
DROP TABLE IF EXISTS public.academy_courses;
COMMIT;
