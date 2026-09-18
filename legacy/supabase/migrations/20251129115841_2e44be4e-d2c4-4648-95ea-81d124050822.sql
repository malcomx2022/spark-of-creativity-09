-- Fonction pour réserver atomiquement une place dans une séance de groupe
CREATE OR REPLACE FUNCTION reserve_group_session_spot(
  p_session_id uuid,
  p_patient_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_existing_participant uuid;
  v_pending_count integer;
BEGIN
  -- 1. Verrouiller la ligne de la séance pour éviter les race conditions
  SELECT * INTO v_session
  FROM group_sessions
  WHERE id = p_session_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'spot_reserved', false, 
      'error_message', 'Séance non trouvée'
    );
  END IF;
  
  -- 2. Vérifier le statut de la séance
  IF v_session.status NOT IN ('planifiee', 'confirmee') THEN
    RETURN jsonb_build_object(
      'spot_reserved', false, 
      'error_message', 'Cette séance n''est plus disponible pour inscription'
    );
  END IF;
  
  -- 3. Compter les places déjà prises (pending + paid)
  -- On compte 'pending' aussi car entre la création et le paiement, la place doit être bloquée
  SELECT COUNT(*) INTO v_pending_count
  FROM group_session_participants
  WHERE session_id = p_session_id 
    AND payment_status IN ('pending', 'paid');
  
  IF v_pending_count >= v_session.max_participants THEN
    RETURN jsonb_build_object(
      'spot_reserved', false, 
      'error_message', 'Séance complète - Plus de places disponibles'
    );
  END IF;
  
  -- 4. Vérifier si le patient n'est pas déjà inscrit
  SELECT id INTO v_existing_participant
  FROM group_session_participants
  WHERE session_id = p_session_id 
    AND patient_id = p_patient_id;
  
  IF v_existing_participant IS NOT NULL THEN
    RETURN jsonb_build_object(
      'spot_reserved', false, 
      'error_message', 'Vous êtes déjà inscrit à cette séance'
    );
  END IF;
  
  -- 5. Tout est OK, retourner succès
  RETURN jsonb_build_object(
    'spot_reserved', true,
    'session', row_to_json(v_session)
  );
END;
$$;

-- Mettre à jour le trigger pour compter aussi les 'pending'
-- (actuellement il ne compte que les 'paid')
CREATE OR REPLACE FUNCTION update_session_participants_count()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE group_sessions
  SET current_participants = (
    SELECT COUNT(*) 
    FROM group_session_participants 
    WHERE session_id = COALESCE(NEW.session_id, OLD.session_id)
    AND payment_status IN ('pending', 'paid')
  )
  WHERE id = COALESCE(NEW.session_id, OLD.session_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;