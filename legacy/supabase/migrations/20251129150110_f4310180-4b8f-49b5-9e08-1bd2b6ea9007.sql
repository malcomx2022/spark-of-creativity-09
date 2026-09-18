-- Supprimer l'ancienne vue
DROP VIEW IF EXISTS admin_dashboard_stats;

-- Créer une fonction SECURITY DEFINER pour calculer les stats
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

-- Recréer la vue en utilisant la fonction SECURITY DEFINER
CREATE VIEW admin_dashboard_stats AS
SELECT * FROM get_admin_dashboard_stats();

-- Donner accès aux admins
GRANT SELECT ON admin_dashboard_stats TO authenticated;