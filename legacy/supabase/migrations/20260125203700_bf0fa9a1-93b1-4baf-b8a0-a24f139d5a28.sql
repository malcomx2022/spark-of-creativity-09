-- ============================================================================
-- Migration: Ajout contrainte UNIQUE sur practitioner_availability
-- Description: Empêche la création de créneaux en double (race condition)
-- ============================================================================

-- Étape 1: Supprimer les doublons existants (garder le plus ancien)
DELETE FROM practitioner_availability a
USING practitioner_availability b
WHERE a.id > b.id
  AND a.practitioner_id = b.practitioner_id
  AND a.day_of_week = b.day_of_week
  AND a.start_time = b.start_time
  AND a.end_time = b.end_time;

-- Étape 2: Ajouter la contrainte UNIQUE
ALTER TABLE practitioner_availability
ADD CONSTRAINT practitioner_availability_unique_slot
UNIQUE (practitioner_id, day_of_week, start_time, end_time);

-- Étape 3: Ajouter un index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_practitioner_availability_lookup
ON practitioner_availability (practitioner_id, day_of_week);