-- Fonction pour mettre à jour le balance de manière atomique avec verrouillage
CREATE OR REPLACE FUNCTION public.update_practitioner_balance_atomic(
  p_practitioner_id uuid,
  p_delta_available integer DEFAULT 0,
  p_delta_pending integer DEFAULT 0,
  p_delta_on_hold integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_record RECORD;
BEGIN
  -- Verrouiller la ligne pour éviter les race conditions
  SELECT * INTO v_balance_record
  FROM practitioner_balances
  WHERE practitioner_id = p_practitioner_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    -- Créer le solde initial s'il n'existe pas
    INSERT INTO practitioner_balances (
      practitioner_id,
      balance_available,
      balance_pending,
      balance_on_hold,
      currency
    ) VALUES (
      p_practitioner_id,
      GREATEST(0, p_delta_available),
      GREATEST(0, p_delta_pending),
      GREATEST(0, p_delta_on_hold),
      'XOF'
    )
    RETURNING * INTO v_balance_record;
  ELSE
    -- Mettre à jour le solde existant
    UPDATE practitioner_balances
    SET
      balance_available = GREATEST(0, balance_available + p_delta_available),
      balance_pending = GREATEST(0, balance_pending + p_delta_pending),
      balance_on_hold = GREATEST(0, balance_on_hold + p_delta_on_hold),
      updated_at = now()
    WHERE practitioner_id = p_practitioner_id
    RETURNING * INTO v_balance_record;
  END IF;
  
  RETURN row_to_json(v_balance_record);
END;
$$;

-- Améliorer la fonction update_payment_with_balance pour utiliser le verrouillage atomique
CREATE OR REPLACE FUNCTION public.update_payment_with_balance(
  p_payment_id uuid,
  p_practitioner_id uuid,
  p_net_amount integer,
  p_new_status text,
  p_new_payout_status text,
  p_hold_until timestamp with time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
  v_old_payout_status text;
  v_result jsonb;
BEGIN
  -- Récupérer l'ancien statut du paiement avec verrouillage
  SELECT status, payout_status INTO v_old_status, v_old_payout_status
  FROM payments
  WHERE id = p_payment_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Payment not found');
  END IF;
  
  -- Mettre à jour le paiement
  UPDATE payments
  SET 
    status = p_new_status,
    payout_status = p_new_payout_status,
    hold_until = p_hold_until,
    updated_at = now()
  WHERE id = p_payment_id;
  
  -- Appliquer les changements de balance de manière atomique
  IF v_old_status = 'initiated' AND p_new_status = 'paid' AND p_new_payout_status = 'held' THEN
    -- Transition: initiated -> paid (pending -> on_hold)
    v_result := update_practitioner_balance_atomic(
      p_practitioner_id,
      0,                    -- delta_available
      -p_net_amount,        -- delta_pending (retirer)
      p_net_amount          -- delta_on_hold (ajouter)
    );
    
  ELSIF p_new_payout_status = 'ready' AND v_old_payout_status = 'held' THEN
    -- Transition: held -> ready (on_hold -> available)
    v_result := update_practitioner_balance_atomic(
      p_practitioner_id,
      p_net_amount,         -- delta_available (ajouter)
      0,                    -- delta_pending
      -p_net_amount         -- delta_on_hold (retirer)
    );
    
  ELSIF p_new_status IN ('failed', 'canceled') AND v_old_status = 'initiated' THEN
    -- Annulation: retirer de pending
    v_result := update_practitioner_balance_atomic(
      p_practitioner_id,
      0,                    -- delta_available
      -p_net_amount,        -- delta_pending (retirer)
      0                     -- delta_on_hold
    );
  ELSE
    -- Pas de changement de balance nécessaire
    SELECT row_to_json(pb.*) INTO v_result
    FROM practitioner_balances pb
    WHERE pb.practitioner_id = p_practitioner_id;
  END IF;
  
  RETURN jsonb_build_object(
    'payment_updated', true,
    'balance', v_result
  );
END;
$$;

-- Améliorer la fonction initialize_payment_balance
CREATE OR REPLACE FUNCTION public.initialize_payment_balance(
  p_payment_id uuid,
  p_practitioner_id uuid,
  p_net_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Utiliser la fonction atomique pour initialiser
  RETURN update_practitioner_balance_atomic(
    p_practitioner_id,
    0,              -- delta_available
    p_net_amount,   -- delta_pending (ajouter)
    0               -- delta_on_hold
  );
END;
$$;