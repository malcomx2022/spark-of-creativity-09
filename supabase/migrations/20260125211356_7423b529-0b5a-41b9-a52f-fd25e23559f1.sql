-- ============================================================================
-- P2-4: RLS Policy pour filtrer les paiements des praticiens
-- ============================================================================

-- Activer RLS sur la table payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Supprimer l'ancienne policy si elle existe
DROP POLICY IF EXISTS "Practitioners can view payments for their appointments" ON payments;

-- Créer la policy pour les praticiens
CREATE POLICY "Practitioners can view payments for their appointments"
ON payments
FOR SELECT
TO authenticated
USING (
  -- Le praticien peut voir les paiements de ses rendez-vous
  EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.id = payments.appointment_id
    AND a.practitioner_id::uuid = auth.uid()
  )
  OR
  -- Le patient peut voir ses propres paiements
  payments.patient_id = auth.uid()
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_payments_appointment_id ON payments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient_id ON payments(patient_id);