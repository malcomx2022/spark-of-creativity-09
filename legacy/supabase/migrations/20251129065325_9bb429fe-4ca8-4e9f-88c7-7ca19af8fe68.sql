-- Create materialized view for admin finance stats
CREATE OR REPLACE VIEW admin_finance_stats AS
SELECT
  SUM(CASE WHEN status IN ('completed', 'paid') THEN amount ELSE 0 END)::bigint as total_revenue,
  COUNT(CASE WHEN status = 'pending' THEN 1 END)::integer as pending_payments,
  COUNT(CASE WHEN status IN ('completed', 'paid') THEN 1 END)::integer as completed_payments,
  COALESCE((SELECT SUM(amount) FROM practitioner_payouts WHERE status = 'planned'), 0)::bigint as pending_payouts
FROM payments;