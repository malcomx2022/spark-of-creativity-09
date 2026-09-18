-- Modifier la fonction pour vérifier les permissions admin
CREATE OR REPLACE FUNCTION get_admin_dashboard_stats()
RETURNS TABLE (
  patients_count bigint,
  practitioners_count bigint,
  appointments_count bigint,
  total_revenue bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vérifier que l'utilisateur est authentifié et est admin
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access denied - admin role required';
  END IF;
  
  RETURN QUERY
  SELECT 
    -- Compter les patients (profiles qui ne sont ni admins ni praticiens)
    (
      SELECT COUNT(DISTINCT p.id)
      FROM profiles p
      WHERE NOT EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM practitioners pr WHERE pr.user_id = p.id
      )
    ) AS patients_count,
    
    -- Compter les praticiens
    (
      SELECT COUNT(*) FROM practitioners
    ) AS practitioners_count,
    
    -- Compter les rendez-vous
    (
      SELECT COUNT(*) FROM appointments
    ) AS appointments_count,
    
    -- Calculer le revenu total
    (
      SELECT COALESCE(SUM(amount), 0)
      FROM payments
      WHERE status IN ('completed', 'paid')
    ) AS total_revenue;
END;
$$;