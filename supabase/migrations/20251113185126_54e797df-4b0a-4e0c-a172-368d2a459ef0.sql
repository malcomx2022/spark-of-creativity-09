-- Activer REPLICA IDENTITY FULL pour realtime sur practitioner_balances
ALTER TABLE public.practitioner_balances REPLICA IDENTITY FULL;

-- Ajouter la table à la publication realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.practitioner_balances;

-- Créer un index pour optimiser les requêtes par practitioner_id
CREATE INDEX IF NOT EXISTS idx_practitioner_balances_practitioner_id 
ON public.practitioner_balances(practitioner_id);

-- Ajouter des commentaires pour documentation
COMMENT ON TABLE public.practitioner_balances IS 'Balance des praticiens avec support realtime';
COMMENT ON COLUMN public.practitioner_balances.balance_available IS 'Solde disponible pour retrait';
COMMENT ON COLUMN public.practitioner_balances.balance_pending IS 'Solde en attente de validation';
COMMENT ON COLUMN public.practitioner_balances.balance_on_hold IS 'Solde en attente (consultations non terminées)';
