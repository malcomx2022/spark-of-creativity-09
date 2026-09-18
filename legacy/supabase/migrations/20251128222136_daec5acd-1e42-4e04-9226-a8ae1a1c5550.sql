-- Étape 1: Identifier et corriger les doublons de téléphone existants
-- Trouver les doublons
WITH phone_duplicates AS (
  SELECT phone, COUNT(*) as count
  FROM profiles
  WHERE phone IS NOT NULL
  GROUP BY phone
  HAVING COUNT(*) > 1
)
SELECT 
  p.id,
  p.phone,
  p.full_name,
  p.created_at,
  EXISTS(SELECT 1 FROM practitioners WHERE user_id = p.id) as is_practitioner
FROM profiles p
INNER JOIN phone_duplicates pd ON p.phone = pd.phone
ORDER BY p.phone, p.created_at;

-- Si des doublons existent, on les nettoiera manuellement ou on gardera le plus ancien

-- Étape 2: Ajouter une contrainte d'unicité sur le téléphone
ALTER TABLE profiles 
ADD CONSTRAINT profiles_phone_unique UNIQUE (phone);

-- Étape 3: Créer un index pour améliorer les performances des recherches par téléphone
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone) WHERE phone IS NOT NULL;

-- Étape 4: Mettre à jour les user_metadata pour les comptes test existants
-- Note: Ceci ne peut être fait que via le service role dans les edge functions
-- On documentera ceci dans les logs

COMMENT ON CONSTRAINT profiles_phone_unique ON profiles IS 
'Ensure phone numbers are unique across all profiles to prevent duplicate OTP authentications';

-- Étape 5: Ajouter une fonction pour vérifier l'unicité avant insertion
CREATE OR REPLACE FUNCTION check_phone_uniqueness()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    -- Vérifier si un autre profil a déjà ce numéro
    IF EXISTS (
      SELECT 1 FROM profiles 
      WHERE phone = NEW.phone 
      AND id != NEW.id
    ) THEN
      RAISE EXCEPTION 'Phone number % already exists for another user', NEW.phone;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Créer un trigger pour appliquer cette vérification
DROP TRIGGER IF EXISTS ensure_phone_uniqueness ON profiles;
CREATE TRIGGER ensure_phone_uniqueness
  BEFORE INSERT OR UPDATE OF phone ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_phone_uniqueness();