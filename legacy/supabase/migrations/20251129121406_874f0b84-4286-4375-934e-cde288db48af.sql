-- Fonction qui valide que seuls les coach_sportif créent des séances de groupe
CREATE OR REPLACE FUNCTION validate_coach_for_group_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_practitioner_type text;
BEGIN
  -- Récupérer le type du praticien
  SELECT practitioner_type INTO v_practitioner_type
  FROM practitioners
  WHERE id = NEW.coach_id;
  
  -- Vérifier que c'est bien un coach_sportif
  IF v_practitioner_type IS NULL THEN
    RAISE EXCEPTION 'Praticien non trouvé avec l''ID %', NEW.coach_id;
  END IF;
  
  IF v_practitioner_type != 'coach_sportif' THEN
    RAISE EXCEPTION 'Seuls les coachs sportifs peuvent créer des séances de groupe. Type actuel: %', v_practitioner_type;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger qui s'exécute avant chaque insertion ou mise à jour
DROP TRIGGER IF EXISTS validate_coach_type_before_group_session ON group_sessions;
CREATE TRIGGER validate_coach_type_before_group_session
  BEFORE INSERT OR UPDATE ON group_sessions
  FOR EACH ROW
  EXECUTE FUNCTION validate_coach_for_group_session();

-- Ajouter un commentaire pour documenter
COMMENT ON TRIGGER validate_coach_type_before_group_session ON group_sessions IS 
  'Garantit que seuls les praticiens de type coach_sportif peuvent créer des séances de groupe';