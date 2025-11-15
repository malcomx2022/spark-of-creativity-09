-- Ajouter les colonnes pour les informations du payeur dans la table payments
ALTER TABLE payments
ADD COLUMN payer_name TEXT,
ADD COLUMN payer_email TEXT,
ADD COLUMN payer_phone TEXT;

-- Ajouter un commentaire pour documenter les colonnes
COMMENT ON COLUMN payments.payer_name IS 'Nom complet du payeur';
COMMENT ON COLUMN payments.payer_email IS 'Email du payeur (optionnel)';
COMMENT ON COLUMN payments.payer_phone IS 'Numéro de téléphone du payeur';