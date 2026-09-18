-- Create view for admin dashboard stats
CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT
  (
    SELECT COUNT(DISTINCT p.id) 
    FROM profiles p
    WHERE p.id NOT IN (
      SELECT user_id FROM user_roles
      UNION
      SELECT user_id FROM practitioners
    )
  ) as patients_count,
  (SELECT COUNT(id) FROM practitioners) as practitioners_count,
  (SELECT COUNT(id) FROM appointments) as appointments_count,
  (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status IN ('completed', 'paid')) as total_revenue;

-- Enable RLS on the view
ALTER VIEW admin_dashboard_stats SET (security_invoker = true);

-- Grant access to authenticated users (will be further restricted by RLS in client code)
GRANT SELECT ON admin_dashboard_stats TO authenticated;