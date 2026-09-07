-- =============================================================================
-- 130_fixes_heritage.sql — Corrections de défauts hérités du schéma Supabase
-- (idempotent ; à exécuter après schema.native.sql, avant 020_grants.sql).
--
-- 1. practitioner_payouts : le trigger update_practitioner_payouts_updated_at appelle
--    update_updated_at_column() alors que la table n'a pas de colonne updated_at → toute mise
--    à jour d'un reversement échouait (« record "new" has no field "updated_at" »).
--    On ajoute la colonne plutôt que de retirer le trigger.
-- =============================================================================
BEGIN;

ALTER TABLE public.practitioner_payouts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMIT;
