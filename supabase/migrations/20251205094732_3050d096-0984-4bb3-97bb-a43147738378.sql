-- Create a public view for homepage statistics
CREATE OR REPLACE VIEW public.homepage_stats AS
SELECT 
  (SELECT COUNT(*) FROM practitioners WHERE kyc_status = 'approved' AND available = true) as practitioners_count,
  (SELECT COUNT(*) FROM profiles) - 
  (SELECT COUNT(*) FROM practitioners) - 
  (SELECT COUNT(DISTINCT user_id) FROM user_roles) as patients_count;

-- Grant access to anonymous users
GRANT SELECT ON public.homepage_stats TO anon;
GRANT SELECT ON public.homepage_stats TO authenticated;