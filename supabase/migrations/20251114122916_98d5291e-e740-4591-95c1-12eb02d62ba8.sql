-- Ajouter la colonne payment_amount à la table appointments
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS payment_amount integer DEFAULT NULL;

COMMENT ON COLUMN appointments.payment_amount IS 'Montant du paiement pour ce rendez-vous en centimes (XOF)';
