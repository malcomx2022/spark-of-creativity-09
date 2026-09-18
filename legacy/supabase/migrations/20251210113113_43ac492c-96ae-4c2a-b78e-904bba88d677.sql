
-- Corriger la fonction sync_practitioner_balance_from_payments pour utiliser le bon type
CREATE OR REPLACE FUNCTION public.sync_practitioner_balance_from_payments(p_practitioner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_on_hold integer;
  v_available integer;
  v_pending integer;
  v_result RECORD;
BEGIN
  -- Calculer les montants depuis les paiements (utiliser cast text pour practitioner_id)
  SELECT 
    COALESCE(SUM(CASE WHEN p.payout_status = 'held' THEN p.net_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN p.payout_status = 'ready' THEN p.net_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN p.payout_status = 'pending' THEN p.net_amount ELSE 0 END), 0)
  INTO v_on_hold, v_available, v_pending
  FROM payments p
  JOIN appointments a ON p.appointment_id = a.id
  WHERE a.practitioner_id = p_practitioner_id::text
  AND p.status = 'paid';
  
  -- Mettre à jour ou créer le solde
  INSERT INTO practitioner_balances (
    practitioner_id,
    balance_available,
    balance_pending,
    balance_on_hold,
    currency,
    updated_at
  ) VALUES (
    p_practitioner_id,
    v_available,
    v_pending,
    v_on_hold,
    'XOF',
    now()
  )
  ON CONFLICT (practitioner_id) DO UPDATE
  SET 
    balance_available = EXCLUDED.balance_available,
    balance_pending = EXCLUDED.balance_pending,
    balance_on_hold = EXCLUDED.balance_on_hold,
    updated_at = now()
  RETURNING * INTO v_result;
  
  RETURN row_to_json(v_result);
END;
$$;

-- Recréer sync_all_practitioner_balances
CREATE OR REPLACE FUNCTION sync_all_practitioner_balances()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated integer := 0;
  v_practitioner record;
BEGIN
  -- Pour chaque praticien avec des paiements
  FOR v_practitioner IN 
    SELECT DISTINCT a.practitioner_id::uuid as pid
    FROM payments p
    JOIN appointments a ON p.appointment_id = a.id
    WHERE p.status = 'paid'
    AND a.practitioner_id IS NOT NULL
    AND a.practitioner_id != ''
  LOOP
    -- Recalculer les balances depuis les paiements
    PERFORM sync_practitioner_balance_from_payments(v_practitioner.pid);
    v_updated := v_updated + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'practitioners_updated', v_updated
  );
END;
$$;
