-- Table pour tracer les activités de recherche de praticiens
CREATE TABLE public.search_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  action_type text NOT NULL,
  practitioner_id uuid REFERENCES practitioners(id) ON DELETE SET NULL,
  search_filters jsonb,
  metadata jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_search_activity_logs_user_id ON search_activity_logs(user_id);
CREATE INDEX idx_search_activity_logs_action_type ON search_activity_logs(action_type);
CREATE INDEX idx_search_activity_logs_created_at ON search_activity_logs(created_at DESC);
CREATE INDEX idx_search_activity_logs_practitioner_id ON search_activity_logs(practitioner_id);

-- Activer RLS
ALTER TABLE public.search_activity_logs ENABLE ROW LEVEL SECURITY;

-- Politique: les admins peuvent tout voir
CREATE POLICY "Admins can view all search activity logs"
ON public.search_activity_logs
FOR SELECT
USING (is_admin(auth.uid()));

-- Politique: insertion publique (pour tracker les anonymes aussi)
CREATE POLICY "Anyone can insert search activity logs"
ON public.search_activity_logs
FOR INSERT
WITH CHECK (true);

-- Fonction de nettoyage des vieux logs (> 90 jours)
CREATE OR REPLACE FUNCTION public.cleanup_old_search_activity_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.search_activity_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- Commentaire sur la table
COMMENT ON TABLE public.search_activity_logs IS 'Logs des activités de recherche de praticiens pour analytics et debugging';