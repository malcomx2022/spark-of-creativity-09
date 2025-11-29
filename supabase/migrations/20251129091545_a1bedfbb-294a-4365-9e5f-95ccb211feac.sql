-- Correction de la fonction update_payment_with_balance pour gérer toutes les transitions vers 'paid'
-- 
-- CONTEXTE: FedaPay envoie d'abord le statut 'pending', puis 'approved' (mappé à 'paid')
-- La fonction originale ne gérait que la transition 'initiated' -> 'paid'
-- Cette migration corrige le problème en acceptant les transitions depuis 'pending' et 'authorized'

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
  -- Accepter les transitions depuis 'initiated', 'pending', ou 'authorized' vers 'paid'
  IF p_new_status = 'paid' AND p_new_payout_status = 'held' AND v_old_status IN ('initiated', 'pending', 'authorized') THEN
    -- Transition: initiated/pending/authorized -> paid (pending -> on_hold)
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
    
  ELSIF p_new_status IN ('failed', 'canceled') AND v_old_status IN ('initiated', 'pending', 'authorized') THEN
    -- Annulation: retirer de pending (accepter depuis n'importe quel statut initial)
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
$function$;