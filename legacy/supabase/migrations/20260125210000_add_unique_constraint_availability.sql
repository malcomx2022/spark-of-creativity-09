-- ============================================================================
-- Migration: Ajout contraintes UNIQUE sur availability et exceptions
-- Description: Empêche la création de créneaux/exceptions en double (race condition)
-- Bug: P2-2 - Race condition création créneaux
-- ============================================================================

-- ============================================================================
-- PARTIE 1: Contrainte UNIQUE sur practitioner_availability
-- ============================================================================

-- Étape 1.1: Supprimer les doublons existants (garder le plus ancien)
DELETE FROM practitioner_availability a
USING practitioner_availability b
WHERE a.id > b.id
  AND a.practitioner_id = b.practitioner_id
  AND a.day_of_week = b.day_of_week
  AND a.start_time = b.start_time
  AND a.end_time = b.end_time;

-- Étape 1.2: Ajouter la contrainte UNIQUE
ALTER TABLE practitioner_availability
ADD CONSTRAINT practitioner_availability_unique_slot
UNIQUE (practitioner_id, day_of_week, start_time, end_time);

-- Étape 1.3: Ajouter un index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_practitioner_availability_lookup
ON practitioner_availability (practitioner_id, day_of_week);

-- Commentaire sur la contrainte
COMMENT ON CONSTRAINT practitioner_availability_unique_slot ON practitioner_availability
IS 'Empêche la création de créneaux en double pour un même praticien, jour et horaire';

-- ============================================================================
-- PARTIE 2: Contrainte UNIQUE sur practitioner_exceptions
-- ============================================================================

-- Étape 2.1: Supprimer les doublons existants (garder le plus récent pour les exceptions)
DELETE FROM practitioner_exceptions a
USING practitioner_exceptions b
WHERE a.id < b.id
  AND a.practitioner_id = b.practitioner_id
  AND a.date = b.date;

-- Étape 2.2: Ajouter la contrainte UNIQUE (une seule exception par praticien par date)
ALTER TABLE practitioner_exceptions
ADD CONSTRAINT practitioner_exceptions_unique_date
UNIQUE (practitioner_id, date);

-- Étape 2.3: Ajouter un index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_practitioner_exceptions_lookup
ON practitioner_exceptions (practitioner_id, date);

-- Commentaire sur la contrainte
COMMENT ON CONSTRAINT practitioner_exceptions_unique_date ON practitioner_exceptions
IS 'Empêche la création de plusieurs exceptions pour un même praticien et une même date';
