-- =============================================================================
-- 140_academy.sql — DomiCares Academy : correspondance avec l'API partenaires Akambi v1
-- (plan : docs/academy/01-FAISABILITE-INTEGRATION-AKAMBI.md, § 4.1 ; lot A2).
--
-- Idempotent ; à exécuter après 130_fixes_heritage.sql et avant 020_grants.sql. Il ne modifie
-- aucune table existante : il ajoute six tables `academy_*` et leurs déclencheurs updated_at.
-- Base neuve : monté dans docker-entrypoint-initdb.d (28_academy.sql) et rejoué par la CI.
-- Base déjà installée : sauvegarde, puis rejouer ce fichier et les droits avant de déployer l'API :
--   docker compose --project-directory deploy/vps exec -T postgres \
--     psql -U postgres -d domicares -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/28_academy.sql
--   docker compose --project-directory deploy/vps exec -T postgres \
--     psql -U postgres -d domicares -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/30_grants.sql
-- Retour arrière : db/native/rollback/140_academy.down.sql (supprime les seules tables academy_*).
--
-- Règles portées par le schéma :
-- - externalLearnerId = 'DC-' || users.id : stable, jamais réattribué (guide Akambi § 6.2) ;
-- - une seule inscription active par praticien et par formation (Akambi : une par formation) ;
-- - progression entière de 0 à 100 (§ 6.3) ; aucun lien d'accès ni downloadUrl n'est stocké (§ 6.4, § 7) ;
-- - événements webhook dédoublonnés sur leur identifiant (§ 9.3), distincts de webhook_events (FedaPay).
-- =============================================================================
BEGIN;

-- Copie locale du catalogue réservé à DomiCares (job academy.catalog.sync).
CREATE TABLE IF NOT EXISTS public.academy_courses (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  type text NOT NULL,
  status text NOT NULL,
  category_code text,
  category_title text,
  public_price_amount numeric(12,2),
  public_price_currency text,
  module_count integer,
  chapter_count integer,
  cover_image_url text,
  presentation_url text,
  akambi_created_at timestamptz,
  akambi_updated_at timestamptz NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academy_courses_type_check CHECK (type IN ('E_LEARNING', 'VISIO_CONFERENCE', 'PRESENTIEL')),
  CONSTRAINT academy_courses_status_check CHECK (status IN ('PUBLISHED', 'ARCHIVED')),
  CONSTRAINT academy_courses_currency_check CHECK (public_price_currency IS NULL OR public_price_currency IN ('EURO', 'DOLLAR', 'FRANC_CFA'))
);
CREATE INDEX IF NOT EXISTS idx_academy_courses_status ON public.academy_courses (status);

-- Compte apprenant Akambi d'un utilisateur DomiCares. La ligne est créée (pending) avec sa clé
-- d'idempotence avant l'appel POST /learners, puis complétée par la réponse : une reprise après
-- coupure réutilise la même clé.
CREATE TABLE IF NOT EXISTS public.academy_learners (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  external_learner_id text NOT NULL,
  akambi_learner_id text,
  account_origin text,
  email public.citext NOT NULL,
  link_status text NOT NULL DEFAULT 'pending',
  last_error_code text,
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  akambi_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academy_learners_external_id_key UNIQUE (external_learner_id),
  CONSTRAINT academy_learners_akambi_id_key UNIQUE (akambi_learner_id),
  CONSTRAINT academy_learners_idempotency_key UNIQUE (idempotency_key),
  CONSTRAINT academy_learners_external_id_check CHECK (external_learner_id = 'DC-' || user_id::text),
  CONSTRAINT academy_learners_origin_check CHECK (account_origin IS NULL OR account_origin IN ('CREATED', 'EXISTING')),
  CONSTRAINT academy_learners_link_status_check CHECK (link_status IN ('pending', 'linked', 'failed')),
  CONSTRAINT academy_learners_linked_check CHECK (link_status <> 'linked' OR (akambi_learner_id IS NOT NULL AND account_origin IS NOT NULL))
);

-- Inscriptions : PENDING tant qu'Akambi n'a pas confirmé, puis l'état complet reçu (API, webhooks,
-- rapprochement). akambi_updated_at sert à ignorer un événement plus ancien que l'état détenu.
CREATE TABLE IF NOT EXISTS public.academy_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.academy_learners(user_id) ON DELETE CASCADE,
  course_id text NOT NULL REFERENCES public.academy_courses(id),
  akambi_enrollment_id text,
  status text NOT NULL DEFAULT 'PENDING',
  progress smallint NOT NULL DEFAULT 0,
  enrolled_at timestamptz,
  started_at timestamptz,
  last_activity_at timestamptz,
  completed_at timestamptz,
  certificate_id text,
  akambi_updated_at timestamptz,
  last_error_code text,
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academy_enrollments_akambi_id_key UNIQUE (akambi_enrollment_id),
  CONSTRAINT academy_enrollments_idempotency_key UNIQUE (idempotency_key),
  CONSTRAINT academy_enrollments_status_check CHECK (status IN ('PENDING', 'ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'CERTIFIED', 'CANCELLED')),
  CONSTRAINT academy_enrollments_progress_check CHECK (progress BETWEEN 0 AND 100),
  CONSTRAINT academy_enrollments_confirmed_check CHECK (status = 'PENDING' OR akambi_enrollment_id IS NOT NULL)
);
-- Une inscription active par (praticien, formation) : deux demandes simultanées ne créent qu'une
-- ligne ; une nouvelle inscription redevient possible après annulation.
CREATE UNIQUE INDEX IF NOT EXISTS academy_enrollments_one_active ON public.academy_enrollments (user_id, course_id) WHERE status <> 'CANCELLED';
CREATE INDEX IF NOT EXISTS idx_academy_enrollments_course ON public.academy_enrollments (course_id);

-- Attestations délivrées : métadonnées et lien de vérification permanent. Le lien de téléchargement
-- (15 minutes) est redemandé à Akambi à chaque clic et n'est jamais stocké.
CREATE TABLE IF NOT EXISTS public.academy_certificates (
  id text PRIMARY KEY,
  enrollment_id uuid NOT NULL REFERENCES public.academy_enrollments(id) ON DELETE CASCADE,
  learner_name text NOT NULL,
  course_title text NOT NULL,
  score_correct integer,
  score_total integer,
  completion_date timestamptz,
  issued_at timestamptz NOT NULL,
  verification_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academy_certificates_enrollment_key UNIQUE (enrollment_id),
  CONSTRAINT academy_certificates_score_check CHECK (score_correct IS NULL OR (score_total IS NOT NULL AND score_correct BETWEEN 0 AND score_total))
);

-- Événements reçus sur POST /api/webhooks/akambi, après vérification de la signature.
CREATE TABLE IF NOT EXISTS public.academy_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  event_type text NOT NULL,
  event_version integer,
  payload jsonb NOT NULL,
  signed_at timestamptz NOT NULL,
  akambi_created_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_status text NOT NULL DEFAULT 'pending',
  error_message text,
  CONSTRAINT academy_webhook_events_event_id_key UNIQUE (event_id),
  CONSTRAINT academy_webhook_events_status_check CHECK (processing_status IN ('pending', 'processed', 'ignored', 'failed'))
);
CREATE INDEX IF NOT EXISTS idx_academy_webhook_events_open ON public.academy_webhook_events (received_at) WHERE processing_status IN ('pending', 'failed');

-- Curseurs updatedSince des synchronisations (catalogue, inscriptions).
CREATE TABLE IF NOT EXISTS public.academy_sync_state (
  key text PRIMARY KEY,
  cursor timestamptz,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academy_sync_state_key_check CHECK (key IN ('courses', 'enrollments'))
);

CREATE OR REPLACE TRIGGER set_academy_courses_updated_at BEFORE UPDATE ON public.academy_courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER set_academy_learners_updated_at BEFORE UPDATE ON public.academy_learners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER set_academy_enrollments_updated_at BEFORE UPDATE ON public.academy_enrollments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER set_academy_certificates_updated_at BEFORE UPDATE ON public.academy_certificates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER set_academy_sync_state_updated_at BEFORE UPDATE ON public.academy_sync_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;
