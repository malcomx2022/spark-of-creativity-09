-- 1) Créer l'enum pour les rôles admin
CREATE TYPE public.app_role AS ENUM ('super_admin', 'ops', 'finance', 'compliance', 'support', 'analyst');

-- 2) Table user_roles pour le RBAC
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Fonction security definer pour vérifier les rôles (évite la récursion RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Fonction pour vérifier si l'utilisateur est admin (n'importe quel rôle admin)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
  )
$$;

-- Policies pour user_roles
CREATE POLICY "Super admins can manage all roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

-- 3) Journal d'audit admin
CREATE TABLE public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id) NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
ON public.admin_audit_logs FOR SELECT
USING (public.is_admin(auth.uid()));

-- Index pour performance
CREATE INDEX idx_audit_logs_admin ON public.admin_audit_logs(admin_id);
CREATE INDEX idx_audit_logs_created ON public.admin_audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.admin_audit_logs(entity_type, entity_id);

-- 4) Ajouter 2FA aux profils (optionnel pour praticiens/patients, obligatoire pour admins)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;

-- 5) Améliorer la table practitioners pour KYC
ALTER TABLE public.practitioners 
  ADD COLUMN IF NOT EXISTS id_document_expiry DATE,
  ADD COLUMN IF NOT EXISTS license_expiry DATE,
  ADD COLUMN IF NOT EXISTS insurance_expiry DATE,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS kyc_reviewed_at TIMESTAMP WITH TIME ZONE;

-- 6) Table pour les litiges
CREATE TABLE public.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id TEXT REFERENCES public.appointments(id),
  raised_by UUID REFERENCES auth.users(id) NOT NULL,
  assigned_to UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  resolution TEXT,
  sla_deadline TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create disputes for their appointments"
ON public.disputes FOR INSERT
WITH CHECK (
  auth.uid() = raised_by AND 
  EXISTS (
    SELECT 1 FROM appointments 
    WHERE id = appointment_id 
    AND (patient_id = auth.uid()::text OR practitioner_id = auth.uid()::text)
  )
);

CREATE POLICY "Admins can manage all disputes"
ON public.disputes FOR ALL
USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their own disputes"
ON public.disputes FOR SELECT
USING (
  auth.uid() = raised_by OR 
  EXISTS (
    SELECT 1 FROM appointments 
    WHERE id = appointment_id 
    AND (patient_id = auth.uid()::text OR practitioner_id = auth.uid()::text)
  )
);

-- 7) Messages de litiges
CREATE TABLE public.dispute_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES public.disputes(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) NOT NULL,
  message TEXT NOT NULL,
  attachments TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages for their disputes"
ON public.dispute_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM disputes 
    WHERE id = dispute_id 
    AND (raised_by = auth.uid() OR public.is_admin(auth.uid()))
  )
);

CREATE POLICY "Users can create messages for their disputes"
ON public.dispute_messages FOR INSERT
WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM disputes 
    WHERE id = dispute_id 
    AND (raised_by = auth.uid() OR public.is_admin(auth.uid()))
  )
);

-- 8) FAQ / Base de connaissances
CREATE TABLE public.faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  target_audience TEXT DEFAULT 'all' CHECK (target_audience IN ('all', 'patients', 'practitioners')),
  is_published BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view published FAQs"
ON public.faqs FOR SELECT
USING (is_published = true OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage FAQs"
ON public.faqs FOR ALL
USING (public.is_admin(auth.uid()));

-- 9) Versions des CGU/Consents
CREATE TABLE public.consent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_type consent_type NOT NULL,
  version TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  effective_date TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (consent_type, version)
);

ALTER TABLE public.consent_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view active consent versions"
ON public.consent_versions FOR SELECT
USING (is_active = true OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage consent versions"
ON public.consent_versions FOR ALL
USING (public.is_admin(auth.uid()));

-- 10) Configuration globale (commission, frais, majorations)
CREATE TABLE public.system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage system config"
ON public.system_config FOR ALL
USING (public.is_admin(auth.uid()));

-- Insérer des configurations par défaut
INSERT INTO public.system_config (key, value, description) VALUES
  ('commission_rate', '{"default": 0.15, "exceptions": {}}', 'Taux de commission global et exceptions par catégorie/zone'),
  ('payment_fees', '{"rate": 0.029, "fixed": 0}', 'Frais de paiement (ex: 2.9% + 0 XOF)'),
  ('surcharges', '{"night": 0.25, "weekend": 0.20, "holiday": 0.30}', 'Majorations nuit/week-end/jours fériés'),
  ('triage_thresholds', '{"low": 5, "medium": 10, "high": 15, "urgent": 20}', 'Seuils de score pour les niveaux d urgence')
ON CONFLICT (key) DO NOTHING;

-- 11) Améliorer la table reviews pour la modération
ALTER TABLE public.reviews 
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP WITH TIME ZONE;

-- Policy pour que les reviews cachés ne soient pas visibles
DROP POLICY IF EXISTS "Users can view reviews" ON public.reviews;
CREATE POLICY "Users can view non-hidden reviews"
ON public.reviews FOR SELECT
USING (is_hidden = false OR public.is_admin(auth.uid()));

-- 12) Améliorer support_tickets pour assignation
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;

-- Policies pour support tickets
DROP POLICY IF EXISTS "Users can manage their support tickets" ON public.support_tickets;

CREATE POLICY "Users can view their support tickets"
ON public.support_tickets FOR SELECT
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can create support tickets"
ON public.support_tickets FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their support tickets"
ON public.support_tickets FOR UPDATE
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage all support tickets"
ON public.support_tickets FOR ALL
USING (public.is_admin(auth.uid()));

-- 13) Triggers pour updated_at
CREATE TRIGGER update_disputes_updated_at
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_faqs_updated_at
  BEFORE UPDATE ON public.faqs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_system_config_updated_at
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 14) Policies admin pour voir toutes les données
CREATE POLICY "Admins can view all practitioners"
ON public.practitioners FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update practitioners"
ON public.practitioners FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view all appointments"
ON public.appointments FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update all appointments"
ON public.appointments FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view all payments"
ON public.payments FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update all payments"
ON public.payments FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (public.is_admin(auth.uid()));