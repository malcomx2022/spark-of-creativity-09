-- ============================================
-- CORRECTION WORKFLOW PAIEMENT - Phase 1
-- ============================================

-- 1. Créer une fonction RPC pour transaction atomique payment + balance
CREATE OR REPLACE FUNCTION public.update_payment_with_balance(
  p_payment_id uuid,
  p_practitioner_id uuid,
  p_net_amount integer,
  p_new_status text,
  p_new_payout_status text,
  p_hold_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_status text;
  v_old_payout_status text;
  v_balance_record RECORD;
  v_result jsonb;
BEGIN
  -- Récupérer l'ancien statut du paiement
  SELECT status, payout_status INTO v_old_status, v_old_payout_status
  FROM payments
  WHERE id = p_payment_id;
  
  -- Mettre à jour le paiement
  UPDATE payments
  SET 
    status = p_new_status,
    payout_status = p_new_payout_status,
    hold_until = p_hold_until,
    updated_at = now()
  WHERE id = p_payment_id;
  
  -- Récupérer ou créer le solde praticien
  SELECT * INTO v_balance_record
  FROM practitioner_balances
  WHERE practitioner_id = p_practitioner_id;
  
  IF NOT FOUND THEN
    -- Créer le solde initial
    INSERT INTO practitioner_balances (
      practitioner_id,
      balance_available,
      balance_pending,
      balance_on_hold,
      currency
    ) VALUES (
      p_practitioner_id,
      0,
      CASE WHEN p_new_status = 'initiated' THEN p_net_amount ELSE 0 END,
      CASE WHEN p_new_payout_status = 'held' THEN p_net_amount ELSE 0 END,
      'XOF'
    )
    RETURNING * INTO v_balance_record;
  ELSE
    -- Mettre à jour selon la transition de statut
    IF v_old_status = 'initiated' AND p_new_status = 'paid' AND p_new_payout_status = 'held' THEN
      -- Transition: initiated -> paid (pending -> on_hold)
      UPDATE practitioner_balances
      SET
        balance_pending = balance_pending - p_net_amount,
        balance_on_hold = balance_on_hold + p_net_amount,
        updated_at = now()
      WHERE practitioner_id = p_practitioner_id
      RETURNING * INTO v_balance_record;
      
    ELSIF p_new_payout_status = 'ready' AND v_old_payout_status = 'held' THEN
      -- Transition: held -> ready (on_hold -> available)
      UPDATE practitioner_balances
      SET
        balance_on_hold = balance_on_hold - p_net_amount,
        balance_available = balance_available + p_net_amount,
        updated_at = now()
      WHERE practitioner_id = p_practitioner_id
      RETURNING * INTO v_balance_record;
      
    ELSIF p_new_status IN ('failed', 'canceled') AND v_old_status = 'initiated' THEN
      -- Annulation: retirer de pending
      UPDATE practitioner_balances
      SET
        balance_pending = balance_pending - p_net_amount,
        updated_at = now()
      WHERE practitioner_id = p_practitioner_id
      RETURNING * INTO v_balance_record;
    END IF;
  END IF;
  
  -- Retourner le résultat
  v_result := jsonb_build_object(
    'payment_updated', true,
    'balance', row_to_json(v_balance_record)
  );
  
  RETURN v_result;
END;
$$;

-- 2. Créer une fonction pour initialiser le solde lors de la création d'un paiement
CREATE OR REPLACE FUNCTION public.initialize_payment_balance(
  p_payment_id uuid,
  p_practitioner_id uuid,
  p_net_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance_record RECORD;
BEGIN
  -- Vérifier si le solde existe
  SELECT * INTO v_balance_record
  FROM practitioner_balances
  WHERE practitioner_id = p_practitioner_id;
  
  IF NOT FOUND THEN
    -- Créer le solde initial
    INSERT INTO practitioner_balances (
      practitioner_id,
      balance_available,
      balance_pending,
      balance_on_hold,
      currency
    ) VALUES (
      p_practitioner_id,
      0,
      p_net_amount,
      0,
      'XOF'
    )
    RETURNING * INTO v_balance_record;
  ELSE
    -- Mettre à jour: ajouter au pending
    UPDATE practitioner_balances
    SET
      balance_pending = balance_pending + p_net_amount,
      updated_at = now()
    WHERE practitioner_id = p_practitioner_id
    RETURNING * INTO v_balance_record;
  END IF;
  
  RETURN row_to_json(v_balance_record);
END;
$$;

-- 3. Créer une table pour les infos de paiement des praticiens
CREATE TABLE IF NOT EXISTS public.practitioner_payment_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  payment_method text NOT NULL CHECK (payment_method IN ('mtn', 'orange', 'moov', 'bank')),
  phone_number text,
  bank_account_number text,
  bank_name text,
  account_holder_name text NOT NULL,
  is_verified boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(practitioner_id, payment_method)
);

-- RLS pour practitioner_payment_info
ALTER TABLE public.practitioner_payment_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Practitioners can manage their payment info"
ON public.practitioner_payment_info
FOR ALL
USING (
  practitioner_id IN (
    SELECT id FROM practitioners WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view all payment info"
ON public.practitioner_payment_info
FOR SELECT
USING (is_admin(auth.uid()));

-- Trigger pour updated_at
CREATE TRIGGER update_practitioner_payment_info_updated_at
  BEFORE UPDATE ON public.practitioner_payment_info
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Index
CREATE INDEX IF NOT EXISTS idx_practitioner_payment_info_practitioner 
ON public.practitioner_payment_info(practitioner_id);

-- Commentaires
COMMENT ON TABLE public.practitioner_payment_info IS 'Informations de paiement des praticiens pour les versements';
COMMENT ON FUNCTION public.update_payment_with_balance IS 'Met à jour un paiement et son solde praticien de manière atomique';
COMMENT ON FUNCTION public.initialize_payment_balance IS 'Initialise ou met à jour le solde praticien lors de la création d''un paiement';