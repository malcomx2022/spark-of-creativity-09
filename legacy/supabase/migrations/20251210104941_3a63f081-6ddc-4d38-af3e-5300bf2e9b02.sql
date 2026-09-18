-- Fonction pour synchroniser les balances d'un praticien depuis les paiements
CREATE OR REPLACE FUNCTION public.sync_practitioner_balance_from_payments(p_practitioner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_on_hold integer;
  v_available integer;
  v_pending integer;
  v_result RECORD;
BEGIN
  -- Calculer les montants depuis les paiements
  SELECT 
    COALESCE(SUM(CASE WHEN p.payout_status = 'held' THEN p.net_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN p.payout_status = 'ready' THEN p.net_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN p.payout_status = 'pending' THEN p.net_amount ELSE 0 END), 0)
  INTO v_on_hold, v_available, v_pending
  FROM payments p
  JOIN appointments a ON p.appointment_id = a.id
  WHERE a.practitioner_id = p_practitioner_id
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
$function$;

-- Fonction trigger pour mettre à jour automatiquement les balances après un changement de paiement
CREATE OR REPLACE FUNCTION public.update_practitioner_balance_on_payment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_practitioner_id uuid;
BEGIN
  -- Récupérer le practitioner_id depuis l'appointment
  SELECT practitioner_id INTO v_practitioner_id
  FROM appointments
  WHERE id = COALESCE(NEW.appointment_id, OLD.appointment_id);
  
  IF v_practitioner_id IS NOT NULL THEN
    -- Synchroniser les balances
    PERFORM sync_practitioner_balance_from_payments(v_practitioner_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Créer le trigger sur la table payments
DROP TRIGGER IF EXISTS trigger_update_balance_on_payment ON payments;
CREATE TRIGGER trigger_update_balance_on_payment
  AFTER INSERT OR UPDATE OF status, payout_status, net_amount ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_practitioner_balance_on_payment_change();