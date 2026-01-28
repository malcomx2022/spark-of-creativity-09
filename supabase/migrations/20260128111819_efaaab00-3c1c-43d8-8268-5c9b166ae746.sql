-- 1. Table kyc_documents - Stockage des documents KYC des praticiens
CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Table user_consents - Historique des consentements utilisateurs
CREATE TABLE IF NOT EXISTS public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  consent_type consent_type NOT NULL,
  version_id UUID REFERENCES consent_versions(id),
  is_accepted BOOLEAN NOT NULL DEFAULT false,
  accepted_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Table admins - Informations supplémentaires des administrateurs
CREATE TABLE IF NOT EXISTS public.admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Ajouter les colonnes manquantes à support_tickets
ALTER TABLE public.support_tickets
ADD COLUMN IF NOT EXISTS admin_response TEXT,
ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS responded_by UUID;

-- 5. Créer la relation support_tickets → profiles (avec gestion des données orphelines)
DO $$
BEGIN
  -- Supprimer les tickets orphelins (user_id n'existe pas dans profiles)
  DELETE FROM public.support_tickets 
  WHERE user_id NOT IN (SELECT id FROM public.profiles);
  
  -- Supprimer l'ancienne contrainte si elle existe
  ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_user_id_fkey;
  
  -- Ajouter la nouvelle contrainte FK
  ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
END $$;

-- 6. Activer RLS sur les nouvelles tables
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- 7. Politiques RLS pour kyc_documents
CREATE POLICY "Admins can view all kyc_documents"
  ON public.kyc_documents FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Practitioners can view own kyc_documents"
  ON public.kyc_documents FOR SELECT
  TO authenticated
  USING (practitioner_id IN (
    SELECT id FROM practitioners WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage kyc_documents"
  ON public.kyc_documents FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 8. Politiques RLS pour user_consents
CREATE POLICY "Admins can view all user_consents"
  ON public.user_consents FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can view own consents"
  ON public.user_consents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own consents"
  ON public.user_consents FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 9. Politiques RLS pour admins
CREATE POLICY "Admins can view admins table"
  ON public.admins FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage admins table"
  ON public.admins FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 10. Index pour performance
CREATE INDEX IF NOT EXISTS idx_kyc_documents_practitioner ON public.kyc_documents(practitioner_id);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_status ON public.kyc_documents(status);
CREATE INDEX IF NOT EXISTS idx_user_consents_user ON public.user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_admins_user ON public.admins(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id);