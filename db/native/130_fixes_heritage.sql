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
-- 4. payments : un seul paiement ouvert par rendez-vous. PaymentsService.create() contrôle puis
--    insère dans deux transactions distinctes (appel FedaPay entre les deux) : deux appels
--    simultanés créaient deux transactions FedaPay pour un même rendez-vous, donc deux
--    encaissements possibles. L'index partiel arbitre ; la clé d'idempotence, aléatoire à chaque
--    appel, ne protégeait de rien.
-- 5. ledger_account_type : valeur `expense_gateway` (charge des frais de passerelle FedaPay).
--    L'historique comptait ces frais, payés par la plateforme, en produit `revenue_fees` et
--    créditait en plus une « obligation » patient sans contrepartie : les écritures d'un
--    encaissement n'étaient pas équilibrées (08-REVUE-FEDAPAY M11). Sur une base déjà installée,
--    rejouer ce fichier (idempotent) avant de déployer l'API :
--    docker compose --project-directory deploy/vps exec -T postgres \
--      psql -U postgres -d domicares -f /docker-entrypoint-initdb.d/27_fixes.sql
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

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_open_per_appointment
  ON public.payments (appointment_id)
  WHERE status IN ('initiated', 'pending', 'authorized');

-- Utilisable seulement après COMMIT (règle PostgreSQL sur les valeurs d'enum ajoutées en transaction).
ALTER TYPE public.ledger_account_type ADD VALUE IF NOT EXISTS 'expense_gateway';

COMMIT;
