-- Fonction pour approuver le KYC d'un praticien (contourne RLS)
CREATE OR REPLACE FUNCTION public.approve_practitioner_kyc(
  p_user_id uuid,
  p_reviewed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Mettre à jour le praticien
  UPDATE practitioners
  SET 
    kyc_status = 'approved',
    kyc_validated_at = now(),
    kyc_reviewed_at = now(),
    kyc_reviewed_by = COALESCE(p_reviewed_by, auth.uid()),
    kyc_comment = 'KYC approuvé',
    can_accept_missions = true,
    updated_at = now()
  WHERE user_id = p_user_id
  RETURNING jsonb_build_object(
    'id', id,
    'name', name,
    'kyc_status', kyc_status,
    'can_accept_missions', can_accept_missions
  ) INTO v_result;
  
  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Praticien introuvable'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'practitioner', v_result
  );
END;
$$;