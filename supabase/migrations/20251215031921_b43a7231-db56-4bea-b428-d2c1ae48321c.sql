-- ============================================================
-- CORRECTION CRITIQUE: Fonction atomique pour release held → ready
-- ============================================================

-- Recréer update_payment_with_balance avec meilleure logique de transition
CREATE OR REPLACE FUNCTION public.update_payment_with_balance(
  p_payment_id uuid, 
  p_practitioner_id uuid, 
  p_net_amount integer, 
  p_new_status text, 
  p_new_payout_status text, 
  p_hold_until timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_status text;
  v_old_payout_status text;
  v_result jsonb;
  v_balance_record RECORD;
BEGIN
  -- Récupérer l'ancien statut du paiement avec verrouillage
  SELECT status, payout_status INTO v_old_status, v_old_payout_status
  FROM payments
  WHERE id = p_payment_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Payment not found');
  END IF;
  
  -- Verrouiller et récupérer le solde actuel
  SELECT * INTO v_balance_record
  FROM practitioner_balances
  WHERE practitioner_id = p_practitioner_id
  FOR UPDATE;
  
  -- Créer le solde s'il n'existe pas
  IF NOT FOUND THEN
    INSERT INTO practitioner_balances (
      practitioner_id,
      balance_available,
      balance_pending,
      balance_on_hold,
      currency
    ) VALUES (
      p_practitioner_id,
      0,
      0,
      0,
      'XOF'
    )
    RETURNING * INTO v_balance_record;
  END IF;
  
  -- Mettre à jour le paiement
  UPDATE payments
  SET 
    status = p_new_status,
    payout_status = p_new_payout_status,
    hold_until = p_hold_until,
    updated_at = now()
  WHERE id = p_payment_id;
  
  -- Appliquer les changements de balance de manière atomique selon les transitions
  
  -- TRANSITION 1: initiated/pending/authorized -> paid (pending -> on_hold)
  IF p_new_status = 'paid' AND p_new_payout_status = 'held' AND v_old_status IN ('initiated', 'pending', 'authorized') THEN
    UPDATE practitioner_balances
    SET
      balance_pending = GREATEST(0, balance_pending - p_net_amount),
      balance_on_hold = balance_on_hold + p_net_amount,
      updated_at = now()
    WHERE practitioner_id = p_practitioner_id
    RETURNING row_to_json(practitioner_balances.*) INTO v_result;
    
  -- TRANSITION 2: held -> ready (on_hold -> available)
  ELSIF p_new_payout_status = 'ready' AND v_old_payout_status = 'held' THEN
    UPDATE practitioner_balances
    SET
      balance_available = balance_available + p_net_amount,
      balance_on_hold = GREATEST(0, balance_on_hold - p_net_amount),
      updated_at = now()
    WHERE practitioner_id = p_practitioner_id
    RETURNING row_to_json(practitioner_balances.*) INTO v_result;
    
  -- TRANSITION 3: Annulation depuis initiated/pending/authorized
  ELSIF p_new_status IN ('failed', 'canceled') AND v_old_status IN ('initiated', 'pending', 'authorized') THEN
    UPDATE practitioner_balances
    SET
      balance_pending = GREATEST(0, balance_pending - p_net_amount),
      updated_at = now()
    WHERE practitioner_id = p_practitioner_id
    RETURNING row_to_json(practitioner_balances.*) INTO v_result;
    
  -- TRANSITION 4: Annulation depuis paid/held (remboursement)
  ELSIF p_new_status IN ('failed', 'canceled', 'refunded') AND v_old_status = 'paid' AND v_old_payout_status = 'held' THEN
    UPDATE practitioner_balances
    SET
      balance_on_hold = GREATEST(0, balance_on_hold - p_net_amount),
      updated_at = now()
    WHERE practitioner_id = p_practitioner_id
    RETURNING row_to_json(practitioner_balances.*) INTO v_result;
    
  -- TRANSITION 5: Annulation depuis ready (remboursement après libération)
  ELSIF p_new_status IN ('refunded', 'chargeback') AND v_old_payout_status = 'ready' THEN
    UPDATE practitioner_balances
    SET
      balance_available = GREATEST(0, balance_available - p_net_amount),
      updated_at = now()
    WHERE practitioner_id = p_practitioner_id
    RETURNING row_to_json(practitioner_balances.*) INTO v_result;
    
  ELSE
    -- Pas de changement de balance nécessaire
    SELECT row_to_json(pb.*) INTO v_result
    FROM practitioner_balances pb
    WHERE pb.practitioner_id = p_practitioner_id;
  END IF;
  
  RETURN jsonb_build_object(
    'payment_updated', true,
    'old_status', v_old_status,
    'old_payout_status', v_old_payout_status,
    'new_status', p_new_status,
    'new_payout_status', p_new_payout_status,
    'balance', v_result
  );
END;
$function$;

-- ============================================================
-- Fonction pour réparer les balances incohérentes
-- ============================================================
CREATE OR REPLACE FUNCTION public.repair_practitioner_balances()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_practitioner RECORD;
  v_calculated_on_hold integer;
  v_calculated_available integer;
  v_calculated_pending integer;
  v_repairs integer := 0;
  v_details jsonb := '[]'::jsonb;
BEGIN
  -- Pour chaque praticien avec une balance
  FOR v_practitioner IN 
    SELECT DISTINCT pb.practitioner_id, pr.name
    FROM practitioner_balances pb
    JOIN practitioners pr ON pb.practitioner_id = pr.id
  LOOP
    -- Calculer les balances attendues depuis les paiements
    -- On_hold: paiements paid + payout_status = held
    SELECT COALESCE(SUM(p.net_amount), 0) INTO v_calculated_on_hold
    FROM payments p
    WHERE p.status = 'paid' 
      AND p.payout_status = 'held'
      AND (
        -- Rendez-vous classiques
        EXISTS (
          SELECT 1 FROM appointments a 
          WHERE a.id = p.appointment_id 
          AND a.practitioner_id = v_practitioner.practitioner_id::text
        )
        OR
        -- Séances de groupe
        (
          p.appointment_id LIKE 'group_session_%'
          AND EXISTS (
            SELECT 1 FROM group_sessions gs
            WHERE gs.coach_id = v_practitioner.practitioner_id
            AND p.appointment_id LIKE '%' || gs.id::text || '%'
          )
        )
      );
    
    -- Available: paiements paid + payout_status = ready
    SELECT COALESCE(SUM(p.net_amount), 0) INTO v_calculated_available
    FROM payments p
    WHERE p.status = 'paid' 
      AND p.payout_status = 'ready'
      AND (
        EXISTS (
          SELECT 1 FROM appointments a 
          WHERE a.id = p.appointment_id 
          AND a.practitioner_id = v_practitioner.practitioner_id::text
        )
        OR
        (
          p.appointment_id LIKE 'group_session_%'
          AND EXISTS (
            SELECT 1 FROM group_sessions gs
            WHERE gs.coach_id = v_practitioner.practitioner_id
            AND p.appointment_id LIKE '%' || gs.id::text || '%'
          )
        )
      );
    
    -- Pending: paiements initiated/pending + payout_status = pending
    SELECT COALESCE(SUM(p.net_amount), 0) INTO v_calculated_pending
    FROM payments p
    WHERE p.status IN ('initiated', 'pending') 
      AND p.payout_status = 'pending'
      AND (
        EXISTS (
          SELECT 1 FROM appointments a 
          WHERE a.id = p.appointment_id 
          AND a.practitioner_id = v_practitioner.practitioner_id::text
        )
        OR
        (
          p.appointment_id LIKE 'group_session_%'
          AND EXISTS (
            SELECT 1 FROM group_sessions gs
            WHERE gs.coach_id = v_practitioner.practitioner_id
            AND p.appointment_id LIKE '%' || gs.id::text || '%'
          )
        )
      );
    
    -- Mettre à jour si différent
    UPDATE practitioner_balances
    SET 
      balance_on_hold = v_calculated_on_hold,
      balance_available = v_calculated_available,
      balance_pending = v_calculated_pending,
      updated_at = now()
    WHERE practitioner_id = v_practitioner.practitioner_id
      AND (
        balance_on_hold != v_calculated_on_hold
        OR balance_available != v_calculated_available
        OR balance_pending != v_calculated_pending
      );
    
    IF FOUND THEN
      v_repairs := v_repairs + 1;
      v_details := v_details || jsonb_build_object(
        'practitioner_id', v_practitioner.practitioner_id,
        'name', v_practitioner.name,
        'new_on_hold', v_calculated_on_hold,
        'new_available', v_calculated_available,
        'new_pending', v_calculated_pending
      );
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'repairs_count', v_repairs,
    'details', v_details
  );
END;
$function$;

-- ============================================================
-- Fonction pour initialiser la balance lors du paiement (amélioration)
-- ============================================================
CREATE OR REPLACE FUNCTION public.initialize_payment_balance(
  p_payment_id uuid, 
  p_practitioner_id uuid, 
  p_net_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance_record RECORD;
BEGIN
  -- S'assurer que le praticien a un enregistrement de balance
  INSERT INTO practitioner_balances (
    practitioner_id,
    balance_available,
    balance_pending,
    balance_on_hold,
    currency
  ) VALUES (
    p_practitioner_id,
    0,
    p_net_amount, -- Initialiser en pending
    0,
    'XOF'
  )
  ON CONFLICT (practitioner_id) DO UPDATE
  SET 
    balance_pending = practitioner_balances.balance_pending + p_net_amount,
    updated_at = now()
  RETURNING * INTO v_balance_record;
  
  RETURN row_to_json(v_balance_record);
END;
$function$;