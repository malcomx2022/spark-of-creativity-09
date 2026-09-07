-- =============================================================================
-- 130_fixes_heritage.sql — Corrections de défauts hérités du schéma Supabase
-- (idempotent ; à exécuter après schema.native.sql, avant 020_grants.sql).
--
-- 1. practitioner_payouts : le trigger update_practitioner_payouts_updated_at appelle
--    update_updated_at_column() alors que la table n'a pas de colonne updated_at → toute mise
--    à jour d'un reversement échouait (« record "new" has no field "updated_at" »).
--    On ajoute la colonne plutôt que de retirer le trigger.
-- 2. consents : aucune trace de la version de CGU / charte acceptée → colonne accepted_version
--    (renseignée par l'API depuis consent_versions.is_active).
-- 3. Index manquants sur des tables lues par filtre (litiges, messages de litige, avis, notes de
--    soins, comptes rendus) — aucun index n'existait en dehors des clés primaires.
-- =============================================================================
BEGIN;

ALTER TABLE public.practitioner_payouts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.consents ADD COLUMN IF NOT EXISTS accepted_version text;

CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.disputes (status);
CREATE INDEX IF NOT EXISTS idx_disputes_raised_by ON public.disputes (raised_by);
CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute ON public.dispute_messages (dispute_id);
CREATE INDEX IF NOT EXISTS idx_reviews_practitioner ON public.reviews (practitioner_id);
CREATE INDEX IF NOT EXISTS idx_care_notes_appointment ON public.care_notes (appointment_id);
CREATE INDEX IF NOT EXISTS idx_care_notes_practitioner ON public.care_notes (practitioner_id);
CREATE INDEX IF NOT EXISTS idx_consultation_reports_appointment ON public.consultation_reports (appointment_id);
CREATE INDEX IF NOT EXISTS idx_consultation_reports_practitioner ON public.consultation_reports (practitioner_id);
CREATE INDEX IF NOT EXISTS idx_faqs_published ON public.faqs (is_published, target_audience);

COMMIT;
