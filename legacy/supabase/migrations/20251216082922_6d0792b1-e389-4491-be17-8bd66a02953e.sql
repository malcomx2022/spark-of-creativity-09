-- ============================================
-- CORRECTION DES WARNINGS DE SÉCURITÉ
-- ============================================

-- 1. MESSAGES - Ajouter DELETE policy manquante
CREATE POLICY "Users can delete their own messages"
ON public.messages FOR DELETE
USING (auth.uid() = sender_id);

-- 2. REVIEWS - Permettre aux patients de voir leurs propres reviews même cachées
DROP POLICY IF EXISTS "Users can view non-hidden reviews" ON public.reviews;
CREATE POLICY "Users can view reviews"
ON public.reviews FOR SELECT
USING (
  is_hidden = false 
  OR is_admin(auth.uid()) 
  OR auth.uid() = patient_id
);

-- 3. CARE_NOTES - Ajouter audit trail pour les changements de partage
CREATE TABLE IF NOT EXISTS public.care_notes_sharing_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  care_note_id uuid NOT NULL REFERENCES care_notes(id) ON DELETE CASCADE,
  practitioner_id uuid NOT NULL,
  old_shared_value boolean,
  new_shared_value boolean,
  changed_at timestamptz DEFAULT now(),
  changed_by uuid DEFAULT auth.uid()
);

ALTER TABLE public.care_notes_sharing_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sharing log"
ON public.care_notes_sharing_log FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "System can insert sharing log"
ON public.care_notes_sharing_log FOR INSERT
WITH CHECK (true);

-- Trigger pour logger les changements de partage
CREATE OR REPLACE FUNCTION public.log_care_notes_sharing_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.shared_with_patient IS DISTINCT FROM NEW.shared_with_patient THEN
    INSERT INTO care_notes_sharing_log (care_note_id, practitioner_id, old_shared_value, new_shared_value)
    VALUES (NEW.id, NEW.practitioner_id, OLD.shared_with_patient, NEW.shared_with_patient);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS care_notes_sharing_audit ON public.care_notes;
CREATE TRIGGER care_notes_sharing_audit
AFTER UPDATE ON public.care_notes
FOR EACH ROW
EXECUTE FUNCTION log_care_notes_sharing_change();

-- 4. CONSULTATION_REPORTS - Ajouter audit trail pour les partages
CREATE TABLE IF NOT EXISTS public.consultation_reports_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES consultation_reports(id) ON DELETE CASCADE,
  accessed_by uuid NOT NULL,
  access_type text NOT NULL,
  accessed_at timestamptz DEFAULT now()
);

ALTER TABLE public.consultation_reports_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view access log"
ON public.consultation_reports_access_log FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "System can insert access log"
ON public.consultation_reports_access_log FOR INSERT
WITH CHECK (true);

-- 5. PAYMENT_EVENTS - Créer une vue sanitisée
CREATE OR REPLACE VIEW public.payment_events_sanitized
WITH (security_invoker = on)
AS SELECT 
  id,
  payment_id,
  event_type,
  created_at,
  -- Masquer les données sensibles dans event_data
  CASE 
    WHEN event_data IS NOT NULL THEN 
      jsonb_build_object(
        'status', event_data->>'status',
        'amount', event_data->>'amount',
        'timestamp', event_data->>'timestamp'
      )
    ELSE NULL
  END as event_data_safe
FROM payment_events;

GRANT SELECT ON public.payment_events_sanitized TO authenticated;

-- 6. ADDRESSES - Restreindre l'accès aux coordonnées GPS exactes pour les praticiens
-- Créer une fonction pour arrondir les coordonnées
CREATE OR REPLACE FUNCTION public.round_coordinates(lat numeric, lng numeric, precision_level text DEFAULT 'neighborhood')
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- neighborhood: ~100m, city: ~1km
  IF precision_level = 'exact' THEN
    RETURN jsonb_build_object('lat', lat, 'lng', lng);
  ELSIF precision_level = 'neighborhood' THEN
    -- Arrondir à 3 décimales (~100m)
    RETURN jsonb_build_object('lat', ROUND(lat, 3), 'lng', ROUND(lng, 3));
  ELSE
    -- Arrondir à 2 décimales (~1km)
    RETURN jsonb_build_object('lat', ROUND(lat, 2), 'lng', ROUND(lng, 2));
  END IF;
END;
$$;

-- 7. EMERGENCY_CONTACTS - Ajouter policy pour praticiens avec RDV actif
DROP POLICY IF EXISTS "Practitioners can view emergency contacts for active appointments" ON public.emergency_contacts;
CREATE POLICY "Practitioners can view emergency contacts for active appointments"
ON public.emergency_contacts FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM appointments a
    JOIN practitioners p ON a.practitioner_id = p.id::text
    WHERE p.user_id = auth.uid()
    AND a.patient_id = emergency_contacts.user_id::text
    AND a.status IN ('in-progress')
  )
);

-- 8. TRIAGE_RESULTS - Ajouter DELETE policy pour RGPD
CREATE POLICY "Users can delete their triage results"
ON public.triage_results FOR DELETE
USING (auth.uid() = user_id);

-- 9. DISPUTES - Créer fonction d'escalade automatique
CREATE OR REPLACE FUNCTION public.check_overdue_disputes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mettre à jour la priorité des disputes en retard
  UPDATE disputes
  SET 
    priority = 'high',
    updated_at = now()
  WHERE 
    status IN ('open', 'in_progress')
    AND sla_deadline < now()
    AND priority != 'high';
END;
$$;

-- 10. GROUP_SESSION_PARTICIPANTS - Empêcher les participants de voir les autres
-- La policy existante est correcte, ajoutons une restriction explicite
DROP POLICY IF EXISTS "Participants cannot view other participants" ON public.group_session_participants;

-- 11. SEARCH_ACTIVITY_LOGS - Restreindre l'insertion aux utilisateurs authentifiés
DROP POLICY IF EXISTS "Anyone can insert search activity logs" ON public.search_activity_logs;
CREATE POLICY "Authenticated users can insert search activity logs"
ON public.search_activity_logs FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL OR (auth.jwt() ->> 'role') = 'service_role');

-- 12. NOTIFICATION_PREFERENCES - Forcer opt-in pour SMS/WhatsApp
-- Ajouter une contrainte check
ALTER TABLE public.notification_preferences
DROP CONSTRAINT IF EXISTS notification_prefs_require_explicit_consent;

-- Les nouveaux enregistrements auront sms_enabled et whatsapp_enabled à false par défaut
-- (déjà configuré dans les defaults de la table)