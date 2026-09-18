-- Ajouter colonnes pour tracker les retries
ALTER TABLE webhook_events 
ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at timestamptz,
ADD COLUMN IF NOT EXISTS error_message text,
ADD COLUMN IF NOT EXISTS error_stack text;

-- Ajouter le CHECK constraint séparément pour éviter les problèmes
ALTER TABLE webhook_events
DROP CONSTRAINT IF EXISTS webhook_events_processing_status_check;

ALTER TABLE webhook_events
ADD CONSTRAINT webhook_events_processing_status_check 
CHECK (processing_status IN ('pending', 'processing', 'success', 'failed', 'permanently_failed'));

-- Index pour retrouver rapidement les webhooks à retry
CREATE INDEX IF NOT EXISTS idx_webhook_events_retry 
  ON webhook_events(processing_status, retry_count, last_retry_at) 
  WHERE processing_status = 'failed';

-- Mettre à jour les anciens webhooks à 'success' s'ils ont été traités
UPDATE webhook_events 
SET processing_status = 'success' 
WHERE processed_at IS NOT NULL;

-- Les webhooks non traités restent en 'pending'