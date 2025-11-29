-- ============================================
-- CORRECTION CRITIQUE: Gérer toutes les transitions de statut de paiement
-- ============================================
-- Problème: La fonction update_payment_with_balance ne gérait que la transition
-- initiated → paid, mais pas pending → paid. Cela causait des échecs de paiement
-- car FedaPay peut envoyer plusieurs webhooks (pending puis approved).
-- ============================================

-- Améliorer la fonction update_payment_with_balance pour gérer TOUTES les transitions
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

  -- ✅ CORRECTION CRITIQUE: Gérer TOUTES les transitions vers 'paid'
  -- Transitions possibles:
  -- 1. initiated → paid (création directe)
  -- 2. pending → paid (webhook FedaPay standard)
  -- 3. authorized → paid (paiement autorisé puis capturé)
  IF p_new_status = 'paid' AND p_new_payout_status = 'held' AND v_old_status IN ('initiated', 'pending', 'authorized') THEN
    -- Transition vers paid: pending/initiated → on_hold
    v_result := update_practitioner_balance_atomic(
      p_practitioner_id,
      0,                    -- delta_available
      -p_net_amount,        -- delta_pending (retirer)
      p_net_amount          -- delta_on_hold (ajouter)
    );

  ELSIF p_new_payout_status = 'ready' AND v_old_payout_status = 'held' THEN
    -- Transition: held → ready (on_hold → available)
    v_result := update_practitioner_balance_atomic(
      p_practitioner_id,
      p_net_amount,         -- delta_available (ajouter)
      0,                    -- delta_pending
      -p_net_amount         -- delta_on_hold (retirer)
    );

  ELSIF p_new_status IN ('failed', 'canceled') AND v_old_status IN ('initiated', 'pending', 'authorized') THEN
    -- Annulation: retirer de pending
    v_result := update_practitioner_balance_atomic(
      p_practitioner_id,
      0,                    -- delta_available
      -p_net_amount,        -- delta_pending (retirer)
      0                     -- delta_on_hold
    );
  ELSE
    -- Pas de changement de balance nécessaire (ex: pending → pending)
    SELECT row_to_json(pb.*) INTO v_result
    FROM practitioner_balances pb
    WHERE pb.practitioner_id = p_practitioner_id;
  END IF;

  RETURN jsonb_build_object(
    'payment_updated', true,
    'old_status', v_old_status,
    'new_status', p_new_status,
    'balance', v_result
  );
END;
$$;

-- Améliorer également la gestion du statut 'pending' dans le webhook
-- En ajoutant un commentaire explicatif
COMMENT ON FUNCTION public.update_payment_with_balance IS
'Met à jour un paiement et son solde praticien de manière atomique.
Gère toutes les transitions de statut possibles:
- initiated/pending/authorized → paid (passage en on_hold)
- held → ready (passage en available)
- initiated/pending/authorized → failed/canceled (retrait de pending)';

-- ============================================
-- Log de la correction
-- ============================================
-- Cette migration corrige le bug critique où les paiements restaient
-- bloqués en statut pending sans jamais passer à paid, car la fonction
-- RPC ne gérait que la transition initiated → paid.
--
-- Désormais, toutes les transitions vers 'paid' sont gérées correctement,
-- quel que soit le statut précédent (initiated, pending, ou authorized).
-- ============================================
