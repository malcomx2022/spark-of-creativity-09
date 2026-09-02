-- FICHIER GÉNÉRÉ par scripts/db/build-native-schema.sh — ne pas éditer à la main.
-- Schéma PostgreSQL natif Domicares = supabase/migrations/* rejoués + db/native/100 + 110.
-- Pré-requis : db/native/010_roles.sql avant, db/native/020_grants.sql après. Les policies RLS sont conservées ;
-- exécuter db/native/120_drop_rls_optional.sql pour les retirer (option B).
-- Généré le 2026-09-02T04:39:24Z
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--
-- PostgreSQL database dump
--

\restrict vi0C0SOnjKNbPhaaBISFjagKXfQeSh7PPnONdBqek1rEod2TpkR1kYqXSSjb48s

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS auth;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'super_admin',
    'ops',
    'finance',
    'compliance',
    'support',
    'analyst',
    'patient',
    'practitioner',
    'coach'
);


--
-- Name: blood_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.blood_type AS ENUM (
    'A+',
    'A-',
    'B+',
    'B-',
    'AB+',
    'AB-',
    'O+',
    'O-',
    'inconnu'
);


--
-- Name: consent_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.consent_type AS ENUM (
    'cgu',
    'charte',
    'partage_donnees',
    'marketing'
);


--
-- Name: gender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gender AS ENUM (
    'homme',
    'femme',
    'autre',
    'non_specifie'
);


--
-- Name: ledger_account_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ledger_account_type AS ENUM (
    'cash',
    'payable',
    'receivable',
    'revenue_commission',
    'revenue_fees',
    'obligation'
);


--
-- Name: ledger_owner_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ledger_owner_type AS ENUM (
    'platform',
    'patient',
    'practitioner'
);


--
-- Name: payout_batch_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payout_batch_status AS ENUM (
    'queued',
    'processing',
    'sent',
    'failed',
    'partially_sent'
);


--
-- Name: practitioner_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.practitioner_type AS ENUM (
    'medecin',
    'infirmier',
    'kinesitherapeute',
    'nutritionniste',
    'sage_femme',
    'psychologue',
    'coach_sportif',
    'autre'
);


--
-- Name: ticket_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_status AS ENUM (
    'ouvert',
    'en_cours',
    'resolu',
    'ferme'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT NULLIF(current_setting('app.user_email', true), '') $$;


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'sub',   NULLIF(current_setting('app.user_id', true), ''),
    'role',  COALESCE(NULLIF(current_setting('app.user_role', true), ''), 'anon'),
    'email', NULLIF(current_setting('app.user_email', true), ''))) $$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT COALESCE(NULLIF(current_setting('app.user_role', true), ''), 'anon') $$;


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;


--
-- Name: approve_practitioner_kyc(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_practitioner_kyc(p_user_id uuid, p_reviewed_by uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Mettre à jour le praticien
  UPDATE practitioners
  SET 
    kyc_status = 'approved',
    kyc_validated_at = now(),
    kyc_reviewed_at = now(),
    kyc_reviewed_by = COALESCE(p_reviewed_by, auth.uid()),
    kyc_comment = 'KYC approuvé',
    can_accept_missions = true,
    updated_at = now()
  WHERE user_id = p_user_id
  RETURNING jsonb_build_object(
    'id', id,
    'name', name,
    'kyc_status', kyc_status,
    'can_accept_missions', can_accept_missions
  ) INTO v_result;
  
  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Praticien introuvable'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'practitioner', v_result
  );
END;
$$;


--
-- Name: auto_confirm_consultations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_confirm_consultations() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Auto-confirmer les consultations en attente depuis plus de 24h
  UPDATE appointments
  SET 
    status = 'completed',
    patient_confirmed_at = now(),
    updated_at = now(),
    internal_notes = COALESCE(internal_notes || E'\n', '') || 'AUTO_CONFIRMED: Pas de réponse patient après 24h'
  WHERE 
    status = 'awaiting_confirmation'
    AND confirmation_requested_at < (now() - interval '24 hours')
    AND patient_confirmed_at IS NULL;
    
  RAISE NOTICE 'Auto-confirmed consultations after 24h';
END;
$$;


--
-- Name: calculate_real_duration(timestamp with time zone, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_real_duration(started_at timestamp with time zone, ended_at timestamp with time zone, default_duration integer) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  IF started_at IS NOT NULL AND ended_at IS NOT NULL THEN
    RETURN EXTRACT(EPOCH FROM (ended_at - started_at)) / 60;
  END IF;
  RETURN default_duration;
END;
$$;


--
-- Name: check_otp_rate_limit(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_otp_rate_limit(phone text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  rate_limit RECORD;
  max_attempts INTEGER := 5;
  window_minutes INTEGER := 60;
  block_duration_minutes INTEGER := 60;
BEGIN
  -- Récupérer l'état actuel
  SELECT * INTO rate_limit FROM otp_rate_limits WHERE phone_number = phone;
  
  -- Si bloqué, vérifier si toujours valide
  IF rate_limit.blocked_until IS NOT NULL AND rate_limit.blocked_until > NOW() THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'blocked',
      'retry_after', EXTRACT(EPOCH FROM (rate_limit.blocked_until - NOW()))::INTEGER
    );
  END IF;
  
  -- Si première tentative ou fenêtre expirée, réinitialiser
  IF rate_limit IS NULL OR 
     rate_limit.first_attempt_at < NOW() - (window_minutes || ' minutes')::INTERVAL THEN
    INSERT INTO otp_rate_limits (phone_number, attempts, first_attempt_at)
    VALUES (phone, 1, NOW())
    ON CONFLICT (phone_number) DO UPDATE
    SET attempts = 1, first_attempt_at = NOW(), blocked_until = NULL;
    
    RETURN jsonb_build_object('allowed', true, 'remaining', max_attempts - 1);
  END IF;
  
  -- Si trop de tentatives, bloquer
  IF rate_limit.attempts >= max_attempts THEN
    UPDATE otp_rate_limits
    SET blocked_until = NOW() + (block_duration_minutes || ' minutes')::INTERVAL
    WHERE phone_number = phone;
    
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'too_many_attempts',
      'retry_after', block_duration_minutes * 60
    );
  END IF;
  
  -- Incrémenter le compteur
  UPDATE otp_rate_limits
  SET attempts = attempts + 1
  WHERE phone_number = phone;
  
  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', max_attempts - rate_limit.attempts - 1
  );
END;
$$;


--
-- Name: check_overdue_disputes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_overdue_disputes() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: check_phone_uniqueness(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_phone_uniqueness() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    -- Vérifier si un autre profil a déjà ce numéro
    IF EXISTS (
      SELECT 1 FROM profiles 
      WHERE phone = NEW.phone 
      AND id != NEW.id
    ) THEN
      RAISE EXCEPTION 'Phone number % already exists for another user', NEW.phone;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: cleanup_expired_payment_slots(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_payment_slots() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Annuler les rendez-vous en pending_payment dont le créneau a expiré
  UPDATE appointments
  SET 
    status = 'cancelled_unpaid',
    updated_at = now()
  WHERE 
    status = 'pending_payment'
    AND payment_expires_at < now();
    
  RAISE NOTICE 'Cleaned up expired payment slots';
END;
$$;


--
-- Name: cleanup_old_file_access_logs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_file_access_logs() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.file_access_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;


--
-- Name: cleanup_old_otp_attempts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_otp_attempts() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.otp_attempts
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;


--
-- Name: cleanup_old_otp_rate_limits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_otp_rate_limits() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM otp_rate_limits
  WHERE first_attempt_at < NOW() - INTERVAL '7 days'
    AND (blocked_until IS NULL OR blocked_until < NOW());
END;
$$;


--
-- Name: cleanup_old_payment_attempts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_payment_attempts() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.payment_attempts
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;


--
-- Name: cleanup_old_search_activity_logs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_search_activity_logs() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.search_activity_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;


--
-- Name: cleanup_orphan_accounts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_orphan_accounts() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_deleted_count integer := 0;
  v_orphan_user RECORD;
BEGIN
  -- Trouver les utilisateurs sans profil créés il y a plus de 24h
  FOR v_orphan_user IN
    SELECT u.id, u.email, u.created_at
    FROM public.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
    AND u.created_at < NOW() - INTERVAL '24 hours'
  LOOP
    -- Vérifier s'il n'est pas praticien non plus
    IF NOT EXISTS (SELECT 1 FROM practitioners WHERE user_id = v_orphan_user.id) THEN
      -- Supprimer l'utilisateur orphelin
      DELETE FROM public.users WHERE id = v_orphan_user.id;
      v_deleted_count := v_deleted_count + 1;
      
      RAISE NOTICE 'Deleted orphan user: % (%)', v_orphan_user.email, v_orphan_user.id;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'executed_at', NOW()
  );
END;
$$;


--
-- Name: current_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT auth.uid() $$;


--
-- Name: current_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_role() RETURNS text
    LANGUAGE sql STABLE
    AS $$ SELECT auth.role() $$;


--
-- Name: generate_invoice_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_invoice_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  year_month text;
  sequence_num integer;
  invoice_num text;
BEGIN
  year_month := to_char(now(), 'YYYYMM');
  
  SELECT COALESCE(MAX(
    CAST(substring(invoice_number from '[0-9]+$') AS integer)
  ), 0) + 1
  INTO sequence_num
  FROM payments
  WHERE invoice_number LIKE 'INV-' || year_month || '-%';
  
  invoice_num := 'INV-' || year_month || '-' || lpad(sequence_num::text, 6, '0');
  
  RETURN invoice_num;
END;
$_$;


--
-- Name: get_admin_dashboard_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_dashboard_stats() RETURNS TABLE(patients_count bigint, practitioners_count bigint, appointments_count bigint, total_revenue bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: get_practitioner_id_for_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_practitioner_id_for_user(p_user_id uuid) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id FROM practitioners WHERE user_id = p_user_id LIMIT 1;
$$;


--
-- Name: get_public_practitioners(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_practitioners() RETURNS TABLE(id uuid, name text, specialty text, practitioner_type public.practitioner_type, rating numeric, available boolean, years_experience integer, bio text, languages text[], communes_served text[], intervention_zone text, intervention_radius integer, certifications text[], session_types text[], image text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 
    id,
    name,
    specialty,
    practitioner_type,
    rating,
    available,
    years_experience,
    bio,
    languages,
    communes_served,
    intervention_zone,
    intervention_radius,
    certifications,
    session_types,
    image
  FROM practitioners
  WHERE kyc_status = 'approved' 
    AND (available = true OR can_accept_missions = true);
$$;


--
-- Name: get_public_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_stats() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'practitioners_count', (
      SELECT COUNT(*) 
      FROM practitioners 
      WHERE kyc_status = 'approved' 
        AND (available = true OR can_accept_missions = true)
    ),
    'patients_count', (
      SELECT COUNT(*) 
      FROM profiles p
      WHERE NOT EXISTS (
        SELECT 1 FROM practitioners pr WHERE pr.user_id = p.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id
      )
    ),
    'appointments_completed', (
      SELECT COUNT(*) 
      FROM appointments 
      WHERE status = 'completed'
    ),
    'coaches_count', (
      SELECT COUNT(*) 
      FROM practitioners 
      WHERE kyc_status = 'approved' 
        AND practitioner_type = 'coach_sportif'
        AND (available = true OR can_accept_missions = true)
    )
  );
$$;


--
-- Name: handle_new_user_safe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user_safe() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Créer un profil minimal avec les données disponibles
  INSERT INTO public.profiles (
    id,
    full_name,
    phone,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->'pending_onboarding'->'profile'->>'fullName',
      SPLIT_PART(NEW.email, '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'phone',
      NEW.raw_user_meta_data->'pending_onboarding'->'profile'->>'phone'
    ),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Ne pas bloquer la création du compte en cas d'erreur
    RAISE WARNING 'handle_new_user_safe failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: initialize_payment_balance(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.initialize_payment_balance(p_payment_id uuid, p_practitioner_id uuid, p_net_amount integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_balance_record RECORD;
BEGIN
  -- S'assurer que le praticien a un enregistrement de balance
  INSERT INTO practitioner_balances (
    practitioner_id,
    balance_available,
    balance_pending,
    balance_on_hold,
    currency
  ) VALUES (
    p_practitioner_id,
    0,
    p_net_amount, -- Initialiser en pending
    0,
    'XOF'
  )
  ON CONFLICT (practitioner_id) DO UPDATE
  SET 
    balance_pending = practitioner_balances.balance_pending + p_net_amount,
    updated_at = now()
  RETURNING * INTO v_balance_record;
  
  RETURN row_to_json(v_balance_record);
END;
$$;


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
  )
$$;


--
-- Name: log_care_notes_sharing_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_care_notes_sharing_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.shared_with_patient IS DISTINCT FROM NEW.shared_with_patient THEN
    INSERT INTO care_notes_sharing_log (care_note_id, practitioner_id, old_shared_value, new_shared_value)
    VALUES (NEW.id, NEW.practitioner_id, OLD.shared_with_patient, NEW.shared_with_patient);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: log_service_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_service_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.service_audit_log (service_id, action, new_values, modified_by)
    VALUES (NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.service_audit_log (service_id, action, old_values, new_values, modified_by)
    VALUES (NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.service_audit_log (service_id, action, old_values, modified_by)
    VALUES (OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    patient_id text NOT NULL,
    patient_name text NOT NULL,
    practitioner_id text NOT NULL,
    practitioner_name text NOT NULL,
    specialty text NOT NULL,
    date text NOT NULL,
    "time" text NOT NULL,
    duration integer DEFAULT 60 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    address text NOT NULL,
    reason text NOT NULL,
    notes text,
    urgency_level text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    visit_status text DEFAULT 'scheduled'::text,
    pre_visit_checklist jsonb,
    internal_notes text,
    payment_amount integer,
    practitioner_status text DEFAULT 'assigned'::text,
    payment_expires_at timestamp with time zone,
    confirmation_requested_at timestamp with time zone,
    patient_confirmed_at timestamp with time zone,
    practitioner_latitude numeric,
    practitioner_longitude numeric,
    practitioner_last_location_update timestamp with time zone,
    consultation_started_at timestamp with time zone,
    consultation_ended_at timestamp with time zone,
    CONSTRAINT appointments_payment_amount_check CHECK (((payment_amount IS NULL) OR (payment_amount >= 0))),
    CONSTRAINT appointments_practitioner_status_check CHECK ((practitioner_status = ANY (ARRAY['assigned'::text, 'preparing'::text, 'en_route'::text, 'arrived'::text, 'in_progress'::text]))),
    CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['pending_payment'::text, 'awaiting_practitioner'::text, 'confirmed'::text, 'pending'::text, 'in-progress'::text, 'awaiting_confirmation'::text, 'completed'::text, 'cancelled_unpaid'::text, 'cancelled'::text, 'rejected'::text]))),
    CONSTRAINT appointments_visit_status_check CHECK ((visit_status = ANY (ARRAY['scheduled'::text, 'en_route'::text, 'arrived'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: mask_appointment_internal_notes(public.appointments); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mask_appointment_internal_notes(appointment_row public.appointments) RETURNS public.appointments
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result appointments;
BEGIN
  result := appointment_row;
  IF NOT EXISTS (SELECT 1 FROM practitioners WHERE user_id = auth.uid()) 
     AND NOT is_admin(auth.uid()) THEN
    result.internal_notes := NULL;
  END IF;
  RETURN result;
END;
$$;


--
-- Name: notify_table_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_table_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  rec record; payload jsonb;
BEGIN
  rec := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  payload := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'id', to_jsonb(rec) ->> 'id',
    'user_id', to_jsonb(rec) ->> 'user_id',
    'patient_id', to_jsonb(rec) ->> 'patient_id',
    'practitioner_id', to_jsonb(rec) ->> 'practitioner_id',
    'appointment_id', to_jsonb(rec) ->> 'appointment_id',
    'session_id', to_jsonb(rec) ->> 'session_id',
    'status', to_jsonb(rec) ->> 'status',
    'at', now());
  PERFORM pg_notify('table_changes', jsonb_strip_nulls(payload)::text);
  RETURN NULL;
END $$;


--
-- Name: promote_to_super_admin(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promote_to_super_admin(user_email text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb;
BEGIN
  -- Récupérer l'ID de l'utilisateur par email
  SELECT id INTO v_user_id
  FROM public.users
  WHERE email = user_email;
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found with email: ' || user_email
    );
  END IF;
  
  -- Créer le profil s'il n'existe pas
  INSERT INTO public.profiles (
    id,
    full_name,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    'Super Admin',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = COALESCE(profiles.full_name, 'Super Admin');
  
  -- Ajouter le rôle super_admin
  INSERT INTO public.user_roles (
    user_id,
    role
  ) VALUES (
    v_user_id,
    'super_admin'
  )
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Logger l'action
  INSERT INTO public.admin_audit_logs (
    admin_id,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    v_user_id,
    'promoted_to_super_admin',
    'user',
    v_user_id::text,
    jsonb_build_object(
      'email', user_email,
      'promoted_at', now()
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'email', user_email,
    'role', 'super_admin'
  );
END;
$$;


--
-- Name: repair_missing_profiles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.repair_missing_profiles() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_repaired_count integer := 0;
  v_orphan_user RECORD;
BEGIN
  -- Trouver les utilisateurs sans profil
  FOR v_orphan_user IN
    SELECT 
      u.id, 
      u.email, 
      u.raw_user_meta_data,
      u.created_at
    FROM public.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  LOOP
    -- Vérifier s'il n'est pas praticien
    IF NOT EXISTS (SELECT 1 FROM practitioners WHERE user_id = v_orphan_user.id) THEN
      -- Créer le profil manquant
      INSERT INTO public.profiles (
        id,
        full_name,
        phone,
        created_at,
        updated_at
      ) VALUES (
        v_orphan_user.id,
        COALESCE(
          v_orphan_user.raw_user_meta_data->>'full_name',
          v_orphan_user.raw_user_meta_data->'pending_onboarding'->'profile'->>'fullName',
          SPLIT_PART(v_orphan_user.email, '@', 1)
        ),
        v_orphan_user.raw_user_meta_data->'pending_onboarding'->'profile'->>'phone',
        v_orphan_user.created_at,
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
      
      v_repaired_count := v_repaired_count + 1;
      RAISE NOTICE 'Repaired profile for user: % (%)', v_orphan_user.email, v_orphan_user.id;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'repaired_count', v_repaired_count,
    'executed_at', NOW()
  );
END;
$$;


--
-- Name: repair_practitioner_balances(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.repair_practitioner_balances() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practitioner RECORD;
  v_calculated_on_hold integer;
  v_calculated_available integer;
  v_calculated_pending integer;
  v_repairs integer := 0;
  v_details jsonb := '[]'::jsonb;
BEGIN
  -- Pour chaque praticien avec une balance
  FOR v_practitioner IN 
    SELECT DISTINCT pb.practitioner_id, pr.name
    FROM practitioner_balances pb
    JOIN practitioners pr ON pb.practitioner_id = pr.id
  LOOP
    -- Calculer les balances attendues depuis les paiements
    -- On_hold: paiements paid + payout_status = held
    SELECT COALESCE(SUM(p.net_amount), 0) INTO v_calculated_on_hold
    FROM payments p
    WHERE p.status = 'paid' 
      AND p.payout_status = 'held'
      AND (
        -- Rendez-vous classiques
        EXISTS (
          SELECT 1 FROM appointments a 
          WHERE a.id = p.appointment_id 
          AND a.practitioner_id = v_practitioner.practitioner_id::text
        )
        OR
        -- Séances de groupe
        (
          p.appointment_id LIKE 'group_session_%'
          AND EXISTS (
            SELECT 1 FROM group_sessions gs
            WHERE gs.coach_id = v_practitioner.practitioner_id
            AND p.appointment_id LIKE '%' || gs.id::text || '%'
          )
        )
      );
    
    -- Available: paiements paid + payout_status = ready
    SELECT COALESCE(SUM(p.net_amount), 0) INTO v_calculated_available
    FROM payments p
    WHERE p.status = 'paid' 
      AND p.payout_status = 'ready'
      AND (
        EXISTS (
          SELECT 1 FROM appointments a 
          WHERE a.id = p.appointment_id 
          AND a.practitioner_id = v_practitioner.practitioner_id::text
        )
        OR
        (
          p.appointment_id LIKE 'group_session_%'
          AND EXISTS (
            SELECT 1 FROM group_sessions gs
            WHERE gs.coach_id = v_practitioner.practitioner_id
            AND p.appointment_id LIKE '%' || gs.id::text || '%'
          )
        )
      );
    
    -- Pending: paiements initiated/pending + payout_status = pending
    SELECT COALESCE(SUM(p.net_amount), 0) INTO v_calculated_pending
    FROM payments p
    WHERE p.status IN ('initiated', 'pending') 
      AND p.payout_status = 'pending'
      AND (
        EXISTS (
          SELECT 1 FROM appointments a 
          WHERE a.id = p.appointment_id 
          AND a.practitioner_id = v_practitioner.practitioner_id::text
        )
        OR
        (
          p.appointment_id LIKE 'group_session_%'
          AND EXISTS (
            SELECT 1 FROM group_sessions gs
            WHERE gs.coach_id = v_practitioner.practitioner_id
            AND p.appointment_id LIKE '%' || gs.id::text || '%'
          )
        )
      );
    
    -- Mettre à jour si différent
    UPDATE practitioner_balances
    SET 
      balance_on_hold = v_calculated_on_hold,
      balance_available = v_calculated_available,
      balance_pending = v_calculated_pending,
      updated_at = now()
    WHERE practitioner_id = v_practitioner.practitioner_id
      AND (
        balance_on_hold != v_calculated_on_hold
        OR balance_available != v_calculated_available
        OR balance_pending != v_calculated_pending
      );
    
    IF FOUND THEN
      v_repairs := v_repairs + 1;
      v_details := v_details || jsonb_build_object(
        'practitioner_id', v_practitioner.practitioner_id,
        'name', v_practitioner.name,
        'new_on_hold', v_calculated_on_hold,
        'new_available', v_calculated_available,
        'new_pending', v_calculated_pending
      );
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'repairs_count', v_repairs,
    'details', v_details
  );
END;
$$;


--
-- Name: request_consultation_confirmation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_consultation_confirmation() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Marquer les consultations terminées qui nécessitent confirmation
  UPDATE appointments
  SET 
    status = 'awaiting_confirmation',
    confirmation_requested_at = now(),
    updated_at = now()
  WHERE 
    status = 'in-progress'
    AND (
      -- Si le praticien a marqué comme terminé via notes internes
      internal_notes LIKE '%CONSULTATION_TERMINEE%'
      OR
      -- Ou si la date de consultation + durée est dépassée de plus d'1 heure
      (date::timestamp + time::interval + (duration || ' minutes')::interval + interval '1 hour') < now()
    )
    AND confirmation_requested_at IS NULL;
    
  RAISE NOTICE 'Requested consultation confirmations';
END;
$$;


--
-- Name: reserve_group_session_spot(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_group_session_spot(p_session_id uuid, p_patient_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_session RECORD;
  v_existing_participant uuid;
  v_pending_count integer;
BEGIN
  -- 1. Verrouiller la ligne de la séance pour éviter les race conditions
  SELECT * INTO v_session
  FROM group_sessions
  WHERE id = p_session_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'spot_reserved', false, 
      'error_message', 'Séance non trouvée'
    );
  END IF;
  
  -- 2. Vérifier le statut de la séance
  IF v_session.status NOT IN ('planifiee', 'confirmee') THEN
    RETURN jsonb_build_object(
      'spot_reserved', false, 
      'error_message', 'Cette séance n''est plus disponible pour inscription'
    );
  END IF;
  
  -- 3. Compter les places déjà prises (pending + paid)
  -- On compte 'pending' aussi car entre la création et le paiement, la place doit être bloquée
  SELECT COUNT(*) INTO v_pending_count
  FROM group_session_participants
  WHERE session_id = p_session_id 
    AND payment_status IN ('pending', 'paid');
  
  IF v_pending_count >= v_session.max_participants THEN
    RETURN jsonb_build_object(
      'spot_reserved', false, 
      'error_message', 'Séance complète - Plus de places disponibles'
    );
  END IF;
  
  -- 4. Vérifier si le patient n'est pas déjà inscrit
  SELECT id INTO v_existing_participant
  FROM group_session_participants
  WHERE session_id = p_session_id 
    AND patient_id = p_patient_id;
  
  IF v_existing_participant IS NOT NULL THEN
    RETURN jsonb_build_object(
      'spot_reserved', false, 
      'error_message', 'Vous êtes déjà inscrit à cette séance'
    );
  END IF;
  
  -- 5. Tout est OK, retourner succès
  RETURN jsonb_build_object(
    'spot_reserved', true,
    'session', row_to_json(v_session)
  );
END;
$$;


--
-- Name: round_coordinates(numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.round_coordinates(lat numeric, lng numeric, precision_level text DEFAULT 'neighborhood'::text) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
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


--
-- Name: set_invoice_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_invoice_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.invoice_number IS NULL AND NEW.status IN ('paid', 'completed') THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sync_all_practitioner_balances(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_all_practitioner_balances() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_updated integer := 0;
  v_practitioner record;
BEGIN
  -- Pour chaque praticien avec des paiements
  FOR v_practitioner IN 
    SELECT DISTINCT a.practitioner_id::uuid as pid
    FROM payments p
    JOIN appointments a ON p.appointment_id = a.id
    WHERE p.status = 'paid'
    AND a.practitioner_id IS NOT NULL
    AND a.practitioner_id != ''
  LOOP
    -- Recalculer les balances depuis les paiements
    PERFORM sync_practitioner_balance_from_payments(v_practitioner.pid);
    v_updated := v_updated + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'practitioners_updated', v_updated
  );
END;
$$;


--
-- Name: sync_practitioner_balance_from_payments(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_practitioner_balance_from_payments(p_practitioner_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_on_hold integer;
  v_available integer;
  v_pending integer;
  v_result RECORD;
BEGIN
  -- Calculer les montants depuis les paiements (utiliser cast text pour practitioner_id)
  SELECT 
    COALESCE(SUM(CASE WHEN p.payout_status = 'held' THEN p.net_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN p.payout_status = 'ready' THEN p.net_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN p.payout_status = 'pending' THEN p.net_amount ELSE 0 END), 0)
  INTO v_on_hold, v_available, v_pending
  FROM payments p
  JOIN appointments a ON p.appointment_id = a.id
  WHERE a.practitioner_id = p_practitioner_id::text
  AND p.status = 'paid';
  
  -- Mettre à jour ou créer le solde
  INSERT INTO practitioner_balances (
    practitioner_id,
    balance_available,
    balance_pending,
    balance_on_hold,
    currency,
    updated_at
  ) VALUES (
    p_practitioner_id,
    v_available,
    v_pending,
    v_on_hold,
    'XOF',
    now()
  )
  ON CONFLICT (practitioner_id) DO UPDATE
  SET 
    balance_available = EXCLUDED.balance_available,
    balance_pending = EXCLUDED.balance_pending,
    balance_on_hold = EXCLUDED.balance_on_hold,
    updated_at = now()
  RETURNING * INTO v_result;
  
  RETURN row_to_json(v_result);
END;
$$;


--
-- Name: trigger_cleanup_otp_attempts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_cleanup_otp_attempts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Nettoyer les anciennes entrées après chaque insertion
  -- En production, utiliser pg_cron ou un job externe
  PERFORM public.cleanup_old_otp_attempts();
  RETURN NEW;
END;
$$;


--
-- Name: update_files_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_files_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_payment_with_balance(uuid, uuid, integer, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_payment_with_balance(p_payment_id uuid, p_practitioner_id uuid, p_net_amount integer, p_new_status text, p_new_payout_status text, p_hold_until timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old_status text;
  v_old_payout_status text;
  v_result jsonb;
  v_balance_record RECORD;
BEGIN
  -- Récupérer l'ancien statut du paiement avec verrouillage
  SELECT status, payout_status INTO v_old_status, v_old_payout_status
  FROM payments
  WHERE id = p_payment_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Payment not found');
  END IF;
  
  -- Verrouiller et récupérer le solde actuel
  SELECT * INTO v_balance_record
  FROM practitioner_balances
  WHERE practitioner_id = p_practitioner_id
  FOR UPDATE;
  
  -- Créer le solde s'il n'existe pas
  IF NOT FOUND THEN
    INSERT INTO practitioner_balances (
      practitioner_id,
      balance_available,
      balance_pending,
      balance_on_hold,
      currency
    ) VALUES (
      p_practitioner_id,
      0,
      0,
      0,
      'XOF'
    )
    RETURNING * INTO v_balance_record;
  END IF;
  
  -- Mettre à jour le paiement
  UPDATE payments
  SET 
    status = p_new_status,
    payout_status = p_new_payout_status,
    hold_until = p_hold_until,
    updated_at = now()
  WHERE id = p_payment_id;
  
  -- Appliquer les changements de balance de manière atomique selon les transitions
  
  -- TRANSITION 1: initiated/pending/authorized -> paid (pending -> on_hold)
  IF p_new_status = 'paid' AND p_new_payout_status = 'held' AND v_old_status IN ('initiated', 'pending', 'authorized') THEN
    UPDATE practitioner_balances
    SET
      balance_pending = GREATEST(0, balance_pending - p_net_amount),
      balance_on_hold = balance_on_hold + p_net_amount,
      updated_at = now()
    WHERE practitioner_id = p_practitioner_id
    RETURNING row_to_json(practitioner_balances.*) INTO v_result;
    
  -- TRANSITION 2: held -> ready (on_hold -> available)
  ELSIF p_new_payout_status = 'ready' AND v_old_payout_status = 'held' THEN
    UPDATE practitioner_balances
    SET
      balance_available = balance_available + p_net_amount,
      balance_on_hold = GREATEST(0, balance_on_hold - p_net_amount),
      updated_at = now()
    WHERE practitioner_id = p_practitioner_id
    RETURNING row_to_json(practitioner_balances.*) INTO v_result;
    
  -- TRANSITION 3: Annulation depuis initiated/pending/authorized
  ELSIF p_new_status IN ('failed', 'canceled') AND v_old_status IN ('initiated', 'pending', 'authorized') THEN
    UPDATE practitioner_balances
    SET
      balance_pending = GREATEST(0, balance_pending - p_net_amount),
      updated_at = now()
    WHERE practitioner_id = p_practitioner_id
    RETURNING row_to_json(practitioner_balances.*) INTO v_result;
    
  -- TRANSITION 4: Annulation depuis paid/held (remboursement)
  ELSIF p_new_status IN ('failed', 'canceled', 'refunded') AND v_old_status = 'paid' AND v_old_payout_status = 'held' THEN
    UPDATE practitioner_balances
    SET
      balance_on_hold = GREATEST(0, balance_on_hold - p_net_amount),
      updated_at = now()
    WHERE practitioner_id = p_practitioner_id
    RETURNING row_to_json(practitioner_balances.*) INTO v_result;
    
  -- TRANSITION 5: Annulation depuis ready (remboursement après libération)
  ELSIF p_new_status IN ('refunded', 'chargeback') AND v_old_payout_status = 'ready' THEN
    UPDATE practitioner_balances
    SET
      balance_available = GREATEST(0, balance_available - p_net_amount),
      updated_at = now()
    WHERE practitioner_id = p_practitioner_id
    RETURNING row_to_json(practitioner_balances.*) INTO v_result;
    
  ELSE
    -- Pas de changement de balance nécessaire
    SELECT row_to_json(pb.*) INTO v_result
    FROM practitioner_balances pb
    WHERE pb.practitioner_id = p_practitioner_id;
  END IF;
  
  RETURN jsonb_build_object(
    'payment_updated', true,
    'old_status', v_old_status,
    'old_payout_status', v_old_payout_status,
    'new_status', p_new_status,
    'new_payout_status', p_new_payout_status,
    'balance', v_result
  );
END;
$$;


--
-- Name: update_practitioner_balance_atomic(uuid, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_practitioner_balance_atomic(p_practitioner_id uuid, p_delta_available integer DEFAULT 0, p_delta_pending integer DEFAULT 0, p_delta_on_hold integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_balance_record RECORD;
BEGIN
  -- Verrouiller la ligne pour éviter les race conditions
  SELECT * INTO v_balance_record
  FROM practitioner_balances
  WHERE practitioner_id = p_practitioner_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    -- Créer le solde initial s'il n'existe pas
    INSERT INTO practitioner_balances (
      practitioner_id,
      balance_available,
      balance_pending,
      balance_on_hold,
      currency
    ) VALUES (
      p_practitioner_id,
      GREATEST(0, p_delta_available),
      GREATEST(0, p_delta_pending),
      GREATEST(0, p_delta_on_hold),
      'XOF'
    )
    RETURNING * INTO v_balance_record;
  ELSE
    -- Mettre à jour le solde existant
    UPDATE practitioner_balances
    SET
      balance_available = GREATEST(0, balance_available + p_delta_available),
      balance_pending = GREATEST(0, balance_pending + p_delta_pending),
      balance_on_hold = GREATEST(0, balance_on_hold + p_delta_on_hold),
      updated_at = now()
    WHERE practitioner_id = p_practitioner_id
    RETURNING * INTO v_balance_record;
  END IF;
  
  RETURN row_to_json(v_balance_record);
END;
$$;


--
-- Name: update_practitioner_balance_on_payment_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_practitioner_balance_on_payment_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practitioner_id uuid;
BEGIN
  -- Récupérer le practitioner_id depuis l'appointment
  SELECT practitioner_id INTO v_practitioner_id
  FROM appointments
  WHERE id = COALESCE(NEW.appointment_id, OLD.appointment_id);
  
  IF v_practitioner_id IS NOT NULL THEN
    -- Synchroniser les balances
    PERFORM sync_practitioner_balance_from_payments(v_practitioner_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_practitioner_balance_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_practitioner_balance_timestamp() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_session_participants_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_session_participants_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE group_sessions
  SET current_participants = (
    SELECT COUNT(*) 
    FROM group_session_participants 
    WHERE session_id = COALESCE(NEW.session_id, OLD.session_id)
    AND payment_status = 'paid'
  )
  WHERE id = COALESCE(NEW.session_id, OLD.session_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: validate_coach_for_group_session(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_coach_for_group_session() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practitioner_type text;
BEGIN
  -- Récupérer le type du praticien
  SELECT practitioner_type INTO v_practitioner_type
  FROM practitioners
  WHERE id = NEW.coach_id;
  
  -- Vérifier que c'est bien un coach_sportif
  IF v_practitioner_type IS NULL THEN
    RAISE EXCEPTION 'Praticien non trouvé avec l''ID %', NEW.coach_id;
  END IF;
  
  IF v_practitioner_type != 'coach_sportif' THEN
    RAISE EXCEPTION 'Seuls les coachs sportifs peuvent créer des séances de groupe. Type actuel: %', v_practitioner_type;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    label text NOT NULL,
    address text NOT NULL,
    city text,
    postal_code text,
    latitude numeric(10,8),
    longitude numeric(11,8),
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: admin_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    details jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: admin_dashboard_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_dashboard_stats AS
 SELECT patients_count,
    practitioners_count,
    appointments_count,
    total_revenue
   FROM public.get_admin_dashboard_stats() g(patients_count, practitioners_count, appointments_count, total_revenue);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id text NOT NULL,
    patient_id uuid NOT NULL,
    amount integer NOT NULL,
    currency text DEFAULT 'XOF'::text NOT NULL,
    payment_method text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    fedapay_transaction_id text,
    fedapay_payment_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    commission_amount integer DEFAULT 0,
    fees_amount integer DEFAULT 0,
    net_amount integer,
    gateway_fees_amount integer DEFAULT 0,
    hold_until timestamp with time zone,
    payout_status text DEFAULT 'pending'::text,
    idempotency_key text,
    channel text,
    provider_ref text,
    payment_session_data jsonb,
    receipt_url text,
    invoice_number text,
    payer_name text,
    payer_email text,
    payer_phone text,
    CONSTRAINT payments_channel_check CHECK ((channel = ANY (ARRAY['card'::text, 'momo'::text]))),
    CONSTRAINT payments_payout_status_check CHECK ((payout_status = ANY (ARRAY['pending'::text, 'held'::text, 'ready'::text, 'paid'::text, 'failed'::text])))
);


--
-- Name: practitioner_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practitioner_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practitioner_id uuid NOT NULL,
    amount integer NOT NULL,
    currency text DEFAULT 'XOF'::text,
    payment_method text NOT NULL,
    account_details jsonb,
    status text DEFAULT 'planned'::text,
    period_start date NOT NULL,
    period_end date NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    batch_id uuid,
    net_amount integer,
    commission_amount integer,
    fees_amount integer,
    transaction_ids text[],
    CONSTRAINT practitioner_payouts_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'sent'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: admin_finance_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_finance_stats AS
 SELECT sum(
        CASE
            WHEN (status = ANY (ARRAY['completed'::text, 'paid'::text])) THEN amount
            ELSE 0
        END) AS total_revenue,
    (count(
        CASE
            WHEN (status = 'pending'::text) THEN 1
            ELSE NULL::integer
        END))::integer AS pending_payments,
    (count(
        CASE
            WHEN (status = ANY (ARRAY['completed'::text, 'paid'::text])) THEN 1
            ELSE NULL::integer
        END))::integer AS completed_payments,
    COALESCE(( SELECT sum(practitioner_payouts.amount) AS sum
           FROM public.practitioner_payouts
          WHERE (practitioner_payouts.status = 'planned'::text)), (0)::bigint) AS pending_payouts
   FROM public.payments;


--
-- Name: admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    role text,
    phone text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: auth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    identifier text NOT NULL,
    kind text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_tokens_kind_check CHECK ((kind = ANY (ARRAY['email_verification'::text, 'password_reset'::text, 'magic_link'::text, 'phone_otp'::text, 'email_otp'::text])))
);


--
-- Name: care_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.care_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id text NOT NULL,
    practitioner_id uuid NOT NULL,
    subjective text,
    objective text,
    assessment text,
    plan text,
    attachments text[],
    shared_with_patient boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: care_notes_sharing_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.care_notes_sharing_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    care_note_id uuid NOT NULL,
    practitioner_id uuid NOT NULL,
    old_shared_value boolean,
    new_shared_value boolean,
    changed_at timestamp with time zone DEFAULT now(),
    changed_by uuid DEFAULT auth.uid()
);


--
-- Name: consent_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consent_type public.consent_type NOT NULL,
    version text NOT NULL,
    content text NOT NULL,
    is_active boolean DEFAULT false,
    effective_date timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    consent_type public.consent_type NOT NULL,
    is_accepted boolean DEFAULT false,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: consultation_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consultation_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practitioner_id uuid NOT NULL,
    appointment_id text NOT NULL,
    consultation_date timestamp with time zone DEFAULT now() NOT NULL,
    consultation_type text NOT NULL,
    consultation_reason text,
    clinical_findings text,
    primary_diagnosis text,
    treatment_prescription text,
    follow_up_recommendation text,
    follow_up_timeframe text,
    additional_comments text,
    severity_level text NOT NULL,
    share_with_doctor boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: consultation_reports_access_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consultation_reports_access_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    accessed_by uuid NOT NULL,
    access_type text NOT NULL,
    accessed_at timestamp with time zone DEFAULT now()
);


--
-- Name: dispute_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispute_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispute_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    message text NOT NULL,
    attachments text[],
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: disputes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disputes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id text,
    raised_by uuid NOT NULL,
    assigned_to uuid,
    status text DEFAULT 'open'::text,
    priority text DEFAULT 'medium'::text,
    subject text NOT NULL,
    description text NOT NULL,
    resolution text,
    sla_deadline timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    CONSTRAINT disputes_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT disputes_status_check CHECK ((status = ANY (ARRAY['open'::text, 'investigating'::text, 'resolved'::text, 'closed'::text])))
);


--
-- Name: emergency_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emergency_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    relationship text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: faqs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    target_audience text DEFAULT 'all'::text,
    is_published boolean DEFAULT false,
    version integer DEFAULT 1,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT faqs_target_audience_check CHECK ((target_audience = ANY (ARRAY['all'::text, 'patients'::text, 'practitioners'::text])))
);


--
-- Name: file_access_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_access_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid,
    user_id uuid,
    access_type character varying(20) NOT NULL,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT file_access_logs_access_type_check CHECK (((access_type)::text = ANY (ARRAY[('view'::character varying)::text, ('download'::character varying)::text, ('share'::character varying)::text])))
);


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_name character varying(255) NOT NULL,
    file_path character varying(500) NOT NULL,
    file_size bigint NOT NULL,
    file_type character varying(100),
    storage_provider character varying(20) DEFAULT 'wasabi'::character varying,
    folder character varying(100),
    metadata jsonb,
    shared_with uuid[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: group_session_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_session_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    payment_status text DEFAULT 'pending'::text,
    joined_at timestamp with time zone DEFAULT now(),
    CONSTRAINT group_session_participants_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'refunded'::text])))
);


--
-- Name: group_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid NOT NULL,
    session_name text NOT NULL,
    session_type text NOT NULL,
    max_participants integer DEFAULT 10,
    min_participants integer DEFAULT 1,
    current_participants integer DEFAULT 0,
    scheduled_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    price_per_person integer NOT NULL,
    location text NOT NULL,
    status text DEFAULT 'planifiee'::text,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT group_sessions_price_per_person_check CHECK ((price_per_person >= 10000)),
    CONSTRAINT group_sessions_session_type_check CHECK ((session_type = ANY (ARRAY['individuelle'::text, 'duo'::text, 'groupe'::text]))),
    CONSTRAINT group_sessions_status_check CHECK ((status = ANY (ARRAY['planifiee'::text, 'confirmee'::text, 'annulee'::text, 'terminee'::text])))
);


--
-- Name: practitioners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practitioners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    specialty text NOT NULL,
    phone text,
    address text,
    latitude numeric(10,8),
    longitude numeric(11,8),
    available boolean DEFAULT true,
    rating numeric(3,2) DEFAULT 0,
    image text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    bio text,
    diplomas text[],
    languages text[],
    years_experience integer DEFAULT 0,
    intervention_radius integer DEFAULT 10,
    communes_served text[],
    is_online boolean DEFAULT false,
    kyc_status text DEFAULT 'pending'::text,
    kyc_comment text,
    kyc_validated_at timestamp with time zone,
    id_document_url text,
    license_number text,
    license_document_url text,
    insurance_document_url text,
    can_accept_missions boolean DEFAULT false,
    id_document_expiry date,
    license_expiry date,
    insurance_expiry date,
    kyc_reviewed_by uuid,
    kyc_reviewed_at timestamp with time zone,
    practitioner_type public.practitioner_type DEFAULT 'autre'::public.practitioner_type,
    session_types text[],
    intervention_zone text,
    certifications text[],
    CONSTRAINT practitioners_kyc_status_check CHECK ((kyc_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'incomplete'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    phone text,
    gender public.gender DEFAULT 'non_specifie'::public.gender,
    date_of_birth date,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    two_factor_enabled boolean DEFAULT false,
    two_factor_secret text
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


--
-- Name: homepage_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.homepage_stats AS
 SELECT ( SELECT count(*) AS count
           FROM public.practitioners
          WHERE ((practitioners.kyc_status = 'approved'::text) AND (practitioners.available = true))) AS practitioners_count,
    ((( SELECT count(*) AS count
           FROM public.profiles) - ( SELECT count(*) AS count
           FROM public.practitioners)) - ( SELECT count(DISTINCT user_roles.user_id) AS count
           FROM public.user_roles)) AS patients_count;


--
-- Name: kyc_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kyc_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practitioner_id uuid NOT NULL,
    document_type text NOT NULL,
    document_url text NOT NULL,
    status text DEFAULT 'pending'::text,
    notes text,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ledger_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_type public.ledger_owner_type NOT NULL,
    owner_id uuid,
    account_type public.ledger_account_type NOT NULL,
    currency text DEFAULT 'XOF'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    debit integer DEFAULT 0 NOT NULL,
    credit integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'XOF'::text NOT NULL,
    reference_type text NOT NULL,
    reference_id text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ledger_entries_check CHECK (((debit >= 0) AND (credit >= 0))),
    CONSTRAINT ledger_entries_check1 CHECK ((NOT ((debit > 0) AND (credit > 0))))
);


--
-- Name: medical_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medical_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    blood_type public.blood_type DEFAULT 'inconnu'::public.blood_type,
    allergies text,
    chronic_diseases text,
    current_medications text,
    additional_notes text,
    share_with_practitioner boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    primary_doctor_id uuid,
    primary_doctor_name text,
    primary_doctor_email text,
    primary_doctor_phone text
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id text NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    attachment_url text,
    attachment_type text,
    attachment_name text,
    attachment_size integer
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_enabled boolean DEFAULT true,
    sms_enabled boolean DEFAULT false,
    whatsapp_enabled boolean DEFAULT false,
    push_enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type text,
    is_read boolean DEFAULT false,
    link text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: otp_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_number text NOT NULL,
    channel text DEFAULT 'sms'::text NOT NULL,
    status text NOT NULL,
    twilio_sid text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address inet,
    user_agent text
);


--
-- Name: otp_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_rate_limits (
    phone_number text NOT NULL,
    attempts integer DEFAULT 1,
    first_attempt_at timestamp with time zone DEFAULT now(),
    blocked_until timestamp with time zone
);


--
-- Name: payment_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    appointment_id text,
    user_id uuid NOT NULL,
    attempt_number integer DEFAULT 1 NOT NULL,
    status text NOT NULL,
    error_type text,
    error_message text,
    error_details jsonb,
    payment_method text NOT NULL,
    phone_number_encrypted text,
    amount integer NOT NULL,
    retry_after timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT payment_attempts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'success'::text, 'failed'::text, 'timeout'::text])))
);


--
-- Name: payment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    event_type text NOT NULL,
    event_data jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: payment_events_sanitized; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.payment_events_sanitized AS
 SELECT id,
    payment_id,
    event_type,
    created_at,
        CASE
            WHEN (event_data IS NOT NULL) THEN jsonb_build_object('status', (event_data ->> 'status'::text), 'amount', (event_data ->> 'amount'::text), 'timestamp', (event_data ->> 'timestamp'::text))
            ELSE NULL::jsonb
        END AS event_data_safe
   FROM public.payment_events;


--
-- Name: payment_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_reconciliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    old_status text NOT NULL,
    new_status text NOT NULL,
    fedapay_status text NOT NULL,
    fedapay_transaction_data jsonb,
    reconciliation_type text NOT NULL,
    reconciled_by text,
    reconciled_at timestamp with time zone DEFAULT now(),
    notes text,
    CONSTRAINT payment_reconciliations_reconciliation_type_check CHECK ((reconciliation_type = ANY (ARRAY['status_mismatch'::text, 'manual'::text, 'webhook_replay'::text])))
);


--
-- Name: payment_refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    refund_amount integer NOT NULL,
    refund_reason text,
    refunded_by uuid NOT NULL,
    provider_refund_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


--
-- Name: payout_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payout_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid NOT NULL,
    batch_date date DEFAULT CURRENT_DATE NOT NULL,
    payment_method text NOT NULL,
    status public.payout_batch_status DEFAULT 'queued'::public.payout_batch_status NOT NULL,
    total_amount integer DEFAULT 0 NOT NULL,
    practitioners_count integer DEFAULT 0 NOT NULL,
    statement_url text,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payout_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payout_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payout_id uuid NOT NULL,
    payment_id uuid NOT NULL,
    amount_included integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: practitioner_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practitioner_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practitioner_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT practitioner_availability_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


--
-- Name: practitioner_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practitioner_balances (
    practitioner_id uuid NOT NULL,
    balance_available integer DEFAULT 0 NOT NULL,
    balance_pending integer DEFAULT 0 NOT NULL,
    balance_on_hold integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'XOF'::text NOT NULL,
    last_payout_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: practitioner_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practitioner_exceptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practitioner_id uuid NOT NULL,
    date date NOT NULL,
    reason text,
    is_available boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: practitioner_payment_info; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practitioner_payment_info (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practitioner_id uuid NOT NULL,
    payment_method text NOT NULL,
    phone_number text,
    bank_account_number text,
    bank_name text,
    account_holder_name text NOT NULL,
    is_verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT practitioner_payment_info_payment_method_check CHECK ((payment_method = ANY (ARRAY['mtn'::text, 'orange'::text, 'moov'::text, 'bank'::text])))
);


--
-- Name: practitioner_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practitioner_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practitioner_id uuid NOT NULL,
    service_type text NOT NULL,
    base_price integer NOT NULL,
    duration_minutes integer DEFAULT 60,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: practitioners_public_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.practitioners_public_view AS
 SELECT id,
    name,
    specialty,
    practitioner_type,
    rating,
    available,
    years_experience,
    bio,
    languages,
    communes_served,
    intervention_zone,
    intervention_radius,
    certifications,
    session_types,
    image
   FROM public.practitioners
  WHERE ((kyc_status = 'approved'::text) AND (available = true));


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reconciliation_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliation_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    status text DEFAULT 'in_progress'::text NOT NULL,
    total_fedapay_transactions integer DEFAULT 0 NOT NULL,
    total_db_payments integer DEFAULT 0 NOT NULL,
    matched_count integer DEFAULT 0 NOT NULL,
    missing_in_db_count integer DEFAULT 0 NOT NULL,
    missing_in_fedapay_count integer DEFAULT 0 NOT NULL,
    amount_mismatch_count integer DEFAULT 0 NOT NULL,
    status_mismatch_count integer DEFAULT 0 NOT NULL,
    total_amount_discrepancy integer DEFAULT 0 NOT NULL,
    anomalies jsonb,
    recommendations jsonb,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    family_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_agent text,
    ip_address inet,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id text NOT NULL,
    patient_id uuid NOT NULL,
    practitioner_id text NOT NULL,
    rating integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now(),
    is_hidden boolean DEFAULT false,
    moderation_reason text,
    moderated_by uuid,
    moderated_at timestamp with time zone,
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: saved_payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    phone_number_masked text NOT NULL,
    phone_number_encrypted text NOT NULL,
    is_default boolean DEFAULT false,
    consent_given_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT saved_payment_methods_provider_check CHECK ((provider = ANY (ARRAY['mtn'::text, 'orange'::text, 'moov'::text])))
);


--
-- Name: search_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    session_id text NOT NULL,
    action_type text NOT NULL,
    practitioner_id uuid,
    search_filters jsonb,
    metadata jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid,
    action text NOT NULL,
    old_values jsonb,
    new_values jsonb,
    modified_by uuid,
    modified_at timestamp with time zone DEFAULT now(),
    CONSTRAINT service_audit_log_action_check CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    base_price integer,
    duration integer,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    appointment_id text,
    subject text NOT NULL,
    description text NOT NULL,
    status public.ticket_status DEFAULT 'ouvert'::public.ticket_status,
    attachments text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    assigned_to uuid,
    priority text DEFAULT 'medium'::text,
    tags text[],
    resolved_at timestamp with time zone,
    admin_response text,
    responded_at timestamp with time zone,
    responded_by uuid,
    CONSTRAINT support_tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])))
);


--
-- Name: system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL,
    description text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: triage_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    score integer NOT NULL,
    urgency_level text NOT NULL,
    message text,
    recommendations text[],
    answers jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    consent_type public.consent_type NOT NULL,
    is_accepted boolean DEFAULT false NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext,
    phone text,
    password_hash text,
    email_verified_at timestamp with time zone,
    phone_verified_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    banned_until timestamp with time zone,
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_app_meta_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT users_email_or_phone_chk CHECK (((email IS NOT NULL) OR (phone IS NOT NULL)))
);


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    processed_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    processing_status text DEFAULT 'pending'::text,
    retry_count integer DEFAULT 0,
    last_retry_at timestamp with time zone,
    error_message text,
    error_stack text,
    CONSTRAINT webhook_events_processing_status_check CHECK ((processing_status = ANY (ARRAY['pending'::text, 'processing'::text, 'success'::text, 'failed'::text, 'permanently_failed'::text])))
);


--
-- Name: addresses addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_logs admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);


--
-- Name: admins admins_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_user_id_key UNIQUE (user_id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: auth_tokens auth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_pkey PRIMARY KEY (id);


--
-- Name: care_notes care_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_notes
    ADD CONSTRAINT care_notes_pkey PRIMARY KEY (id);


--
-- Name: care_notes_sharing_log care_notes_sharing_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_notes_sharing_log
    ADD CONSTRAINT care_notes_sharing_log_pkey PRIMARY KEY (id);


--
-- Name: consent_versions consent_versions_consent_type_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_versions
    ADD CONSTRAINT consent_versions_consent_type_version_key UNIQUE (consent_type, version);


--
-- Name: consent_versions consent_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_versions
    ADD CONSTRAINT consent_versions_pkey PRIMARY KEY (id);


--
-- Name: consents consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consents
    ADD CONSTRAINT consents_pkey PRIMARY KEY (id);


--
-- Name: consents consents_user_id_consent_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consents
    ADD CONSTRAINT consents_user_id_consent_type_key UNIQUE (user_id, consent_type);


--
-- Name: consultation_reports_access_log consultation_reports_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consultation_reports_access_log
    ADD CONSTRAINT consultation_reports_access_log_pkey PRIMARY KEY (id);


--
-- Name: consultation_reports consultation_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consultation_reports
    ADD CONSTRAINT consultation_reports_pkey PRIMARY KEY (id);


--
-- Name: dispute_messages dispute_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_messages
    ADD CONSTRAINT dispute_messages_pkey PRIMARY KEY (id);


--
-- Name: disputes disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_pkey PRIMARY KEY (id);


--
-- Name: emergency_contacts emergency_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emergency_contacts
    ADD CONSTRAINT emergency_contacts_pkey PRIMARY KEY (id);


--
-- Name: faqs faqs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faqs
    ADD CONSTRAINT faqs_pkey PRIMARY KEY (id);


--
-- Name: file_access_logs file_access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_access_logs
    ADD CONSTRAINT file_access_logs_pkey PRIMARY KEY (id);


--
-- Name: files files_file_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_file_path_key UNIQUE (file_path);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: group_session_participants group_session_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_session_participants
    ADD CONSTRAINT group_session_participants_pkey PRIMARY KEY (id);


--
-- Name: group_session_participants group_session_participants_session_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_session_participants
    ADD CONSTRAINT group_session_participants_session_id_patient_id_key UNIQUE (session_id, patient_id);


--
-- Name: group_sessions group_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sessions
    ADD CONSTRAINT group_sessions_pkey PRIMARY KEY (id);


--
-- Name: kyc_documents kyc_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_documents
    ADD CONSTRAINT kyc_documents_pkey PRIMARY KEY (id);


--
-- Name: ledger_accounts ledger_accounts_owner_type_owner_id_account_type_currency_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_accounts
    ADD CONSTRAINT ledger_accounts_owner_type_owner_id_account_type_currency_key UNIQUE (owner_type, owner_id, account_type, currency);


--
-- Name: ledger_accounts ledger_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_accounts
    ADD CONSTRAINT ledger_accounts_pkey PRIMARY KEY (id);


--
-- Name: ledger_entries ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_pkey PRIMARY KEY (id);


--
-- Name: medical_profiles medical_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_profiles
    ADD CONSTRAINT medical_profiles_pkey PRIMARY KEY (id);


--
-- Name: medical_profiles medical_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_profiles
    ADD CONSTRAINT medical_profiles_user_id_key UNIQUE (user_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_key UNIQUE (user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: otp_attempts otp_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_attempts
    ADD CONSTRAINT otp_attempts_pkey PRIMARY KEY (id);


--
-- Name: otp_rate_limits otp_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_rate_limits
    ADD CONSTRAINT otp_rate_limits_pkey PRIMARY KEY (phone_number);


--
-- Name: payment_attempts payment_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_attempts
    ADD CONSTRAINT payment_attempts_pkey PRIMARY KEY (id);


--
-- Name: payment_events payment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_pkey PRIMARY KEY (id);


--
-- Name: payment_reconciliations payment_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_reconciliations
    ADD CONSTRAINT payment_reconciliations_pkey PRIMARY KEY (id);


--
-- Name: payment_refunds payment_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_refunds
    ADD CONSTRAINT payment_refunds_pkey PRIMARY KEY (id);


--
-- Name: payments payments_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: payments payments_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_invoice_number_key UNIQUE (invoice_number);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payout_batches payout_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_batches
    ADD CONSTRAINT payout_batches_pkey PRIMARY KEY (id);


--
-- Name: payout_payments payout_payments_payout_id_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_payments
    ADD CONSTRAINT payout_payments_payout_id_payment_id_key UNIQUE (payout_id, payment_id);


--
-- Name: payout_payments payout_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_payments
    ADD CONSTRAINT payout_payments_pkey PRIMARY KEY (id);


--
-- Name: practitioner_availability practitioner_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_availability
    ADD CONSTRAINT practitioner_availability_pkey PRIMARY KEY (id);


--
-- Name: practitioner_availability practitioner_availability_unique_slot; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_availability
    ADD CONSTRAINT practitioner_availability_unique_slot UNIQUE (practitioner_id, day_of_week, start_time, end_time);


--
-- Name: practitioner_balances practitioner_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_balances
    ADD CONSTRAINT practitioner_balances_pkey PRIMARY KEY (practitioner_id);


--
-- Name: practitioner_exceptions practitioner_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_exceptions
    ADD CONSTRAINT practitioner_exceptions_pkey PRIMARY KEY (id);


--
-- Name: practitioner_payment_info practitioner_payment_info_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_payment_info
    ADD CONSTRAINT practitioner_payment_info_pkey PRIMARY KEY (id);


--
-- Name: practitioner_payment_info practitioner_payment_info_practitioner_id_payment_method_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_payment_info
    ADD CONSTRAINT practitioner_payment_info_practitioner_id_payment_method_key UNIQUE (practitioner_id, payment_method);


--
-- Name: practitioner_payouts practitioner_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_payouts
    ADD CONSTRAINT practitioner_payouts_pkey PRIMARY KEY (id);


--
-- Name: practitioner_rates practitioner_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_rates
    ADD CONSTRAINT practitioner_rates_pkey PRIMARY KEY (id);


--
-- Name: practitioners practitioners_phone_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioners
    ADD CONSTRAINT practitioners_phone_unique UNIQUE (phone);


--
-- Name: practitioners practitioners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioners
    ADD CONSTRAINT practitioners_pkey PRIMARY KEY (id);


--
-- Name: practitioners practitioners_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioners
    ADD CONSTRAINT practitioners_user_id_key UNIQUE (user_id);


--
-- Name: profiles profiles_phone_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_phone_unique UNIQUE (phone);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_user_id_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);


--
-- Name: reconciliation_reports reconciliation_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_reports
    ADD CONSTRAINT reconciliation_reports_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: reviews reviews_appointment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_appointment_id_key UNIQUE (appointment_id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: saved_payment_methods saved_payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_payment_methods
    ADD CONSTRAINT saved_payment_methods_pkey PRIMARY KEY (id);


--
-- Name: saved_payment_methods saved_payment_methods_user_id_phone_number_encrypted_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_payment_methods
    ADD CONSTRAINT saved_payment_methods_user_id_phone_number_encrypted_key UNIQUE (user_id, phone_number_encrypted);


--
-- Name: search_activity_logs search_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_activity_logs
    ADD CONSTRAINT search_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: service_audit_log service_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_audit_log
    ADD CONSTRAINT service_audit_log_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: system_config system_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_key_key UNIQUE (key);


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (id);


--
-- Name: triage_results triage_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_results
    ADD CONSTRAINT triage_results_pkey PRIMARY KEY (id);


--
-- Name: user_consents user_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_consents
    ADD CONSTRAINT user_consents_pkey PRIMARY KEY (id);


--
-- Name: user_consents user_consents_user_consent_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_consents
    ADD CONSTRAINT user_consents_user_consent_type_key UNIQUE (user_id, consent_type);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_event_id_key UNIQUE (event_id);


--
-- Name: webhook_events webhook_events_event_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_event_id_unique UNIQUE (event_id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: auth_tokens_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_tokens_lookup_idx ON public.auth_tokens USING btree (identifier, kind) WHERE (consumed_at IS NULL);


--
-- Name: idx_admins_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admins_user ON public.admins USING btree (user_id);


--
-- Name: idx_appointments_confirmation_requested; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_confirmation_requested ON public.appointments USING btree (confirmation_requested_at) WHERE (confirmation_requested_at IS NOT NULL);


--
-- Name: idx_appointments_date_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_date_time ON public.appointments USING btree (date, "time");


--
-- Name: idx_appointments_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_patient_id ON public.appointments USING btree (patient_id);


--
-- Name: idx_appointments_patient_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_patient_status ON public.appointments USING btree (patient_id, status);


--
-- Name: idx_appointments_payment_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_payment_expires_at ON public.appointments USING btree (payment_expires_at) WHERE (payment_expires_at IS NOT NULL);


--
-- Name: idx_appointments_practitioner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_practitioner_id ON public.appointments USING btree (practitioner_id);


--
-- Name: idx_appointments_practitioner_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_practitioner_status ON public.appointments USING btree (practitioner_id, status);


--
-- Name: idx_appointments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_status ON public.appointments USING btree (status);


--
-- Name: idx_audit_logs_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_admin ON public.admin_audit_logs USING btree (admin_id);


--
-- Name: idx_audit_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created ON public.admin_audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.admin_audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_file_access_logs_access_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_access_logs_access_type ON public.file_access_logs USING btree (access_type);


--
-- Name: idx_file_access_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_access_logs_created_at ON public.file_access_logs USING btree (created_at);


--
-- Name: idx_file_access_logs_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_access_logs_file_id ON public.file_access_logs USING btree (file_id);


--
-- Name: idx_file_access_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_access_logs_user_id ON public.file_access_logs USING btree (user_id);


--
-- Name: idx_files_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_created_at ON public.files USING btree (created_at);


--
-- Name: idx_files_folder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_folder ON public.files USING btree (folder);


--
-- Name: idx_files_storage_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_storage_provider ON public.files USING btree (storage_provider);


--
-- Name: idx_files_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_user_id ON public.files USING btree (user_id);


--
-- Name: idx_group_session_participants_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_session_participants_patient_id ON public.group_session_participants USING btree (patient_id);


--
-- Name: idx_group_session_participants_payment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_session_participants_payment_status ON public.group_session_participants USING btree (payment_status);


--
-- Name: idx_group_session_participants_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_session_participants_session_id ON public.group_session_participants USING btree (session_id);


--
-- Name: idx_group_sessions_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_sessions_coach_id ON public.group_sessions USING btree (coach_id);


--
-- Name: idx_group_sessions_scheduled_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_sessions_scheduled_date ON public.group_sessions USING btree (scheduled_date);


--
-- Name: idx_group_sessions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_sessions_status ON public.group_sessions USING btree (status);


--
-- Name: idx_kyc_documents_practitioner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kyc_documents_practitioner ON public.kyc_documents USING btree (practitioner_id);


--
-- Name: idx_kyc_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kyc_documents_status ON public.kyc_documents USING btree (status);


--
-- Name: idx_messages_appointment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_appointment_id ON public.messages USING btree (appointment_id);


--
-- Name: idx_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);


--
-- Name: idx_messages_sender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sender_id ON public.messages USING btree (sender_id);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_otp_attempts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_attempts_created_at ON public.otp_attempts USING btree (created_at DESC);


--
-- Name: idx_otp_attempts_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_attempts_phone ON public.otp_attempts USING btree (phone_number);


--
-- Name: idx_payment_attempts_appointment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_attempts_appointment_id ON public.payment_attempts USING btree (appointment_id);


--
-- Name: idx_payment_attempts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_attempts_created_at ON public.payment_attempts USING btree (created_at DESC);


--
-- Name: idx_payment_attempts_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_attempts_payment_id ON public.payment_attempts USING btree (payment_id);


--
-- Name: idx_payment_attempts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_attempts_status ON public.payment_attempts USING btree (status);


--
-- Name: idx_payment_attempts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_attempts_user_id ON public.payment_attempts USING btree (user_id);


--
-- Name: idx_payment_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_events_created_at ON public.payment_events USING btree (created_at);


--
-- Name: idx_payment_events_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_events_event_type ON public.payment_events USING btree (event_type);


--
-- Name: idx_payment_events_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_events_payment_id ON public.payment_events USING btree (payment_id);


--
-- Name: idx_payment_reconciliations_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_reconciliations_date ON public.payment_reconciliations USING btree (reconciled_at DESC);


--
-- Name: idx_payment_reconciliations_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_reconciliations_payment_id ON public.payment_reconciliations USING btree (payment_id);


--
-- Name: idx_payment_reconciliations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_reconciliations_type ON public.payment_reconciliations USING btree (reconciliation_type);


--
-- Name: idx_payments_appointment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_appointment_id ON public.payments USING btree (appointment_id);


--
-- Name: idx_payments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_created_at ON public.payments USING btree (created_at DESC);


--
-- Name: idx_payments_fedapay_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_fedapay_transaction_id ON public.payments USING btree (fedapay_transaction_id);


--
-- Name: idx_payments_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_idempotency_key ON public.payments USING btree (idempotency_key);


--
-- Name: idx_payments_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_patient_id ON public.payments USING btree (patient_id);


--
-- Name: idx_payments_patient_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_patient_status ON public.payments USING btree (patient_id, status);


--
-- Name: idx_payments_provider_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_provider_ref ON public.payments USING btree (provider_ref);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_payout_payments_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payout_payments_payment ON public.payout_payments USING btree (payment_id);


--
-- Name: idx_payout_payments_payout; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payout_payments_payout ON public.payout_payments USING btree (payout_id);


--
-- Name: idx_practitioner_availability_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practitioner_availability_lookup ON public.practitioner_availability USING btree (practitioner_id, day_of_week);


--
-- Name: idx_practitioner_balances_practitioner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practitioner_balances_practitioner_id ON public.practitioner_balances USING btree (practitioner_id);


--
-- Name: idx_practitioner_balances_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practitioner_balances_updated_at ON public.practitioner_balances USING btree (updated_at DESC);


--
-- Name: idx_practitioner_payment_info_practitioner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practitioner_payment_info_practitioner ON public.practitioner_payment_info USING btree (practitioner_id);


--
-- Name: idx_practitioner_payouts_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practitioner_payouts_period ON public.practitioner_payouts USING btree (period_start, period_end);


--
-- Name: idx_practitioner_payouts_practitioner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practitioner_payouts_practitioner ON public.practitioner_payouts USING btree (practitioner_id);


--
-- Name: idx_practitioner_payouts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practitioner_payouts_status ON public.practitioner_payouts USING btree (status);


--
-- Name: idx_practitioners_available; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practitioners_available ON public.practitioners USING btree (available) WHERE (available = true);


--
-- Name: idx_practitioners_kyc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practitioners_kyc_status ON public.practitioners USING btree (kyc_status);


--
-- Name: idx_practitioners_lat_lon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practitioners_lat_lon ON public.practitioners USING btree (latitude, longitude) WHERE ((latitude IS NOT NULL) AND (longitude IS NOT NULL));


--
-- Name: idx_practitioners_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practitioners_phone ON public.practitioners USING btree (phone) WHERE (phone IS NOT NULL);


--
-- Name: idx_practitioners_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practitioners_user_id ON public.practitioners USING btree (user_id);


--
-- Name: idx_profiles_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_phone ON public.profiles USING btree (phone) WHERE (phone IS NOT NULL);


--
-- Name: idx_push_subscriptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);


--
-- Name: idx_reconciliation_reports_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reconciliation_reports_created_at ON public.reconciliation_reports USING btree (created_at DESC);


--
-- Name: idx_reconciliation_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reconciliation_reports_status ON public.reconciliation_reports USING btree (status);


--
-- Name: idx_saved_payment_methods_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_payment_methods_user_id ON public.saved_payment_methods USING btree (user_id);


--
-- Name: idx_search_activity_logs_action_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_activity_logs_action_type ON public.search_activity_logs USING btree (action_type);


--
-- Name: idx_search_activity_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_activity_logs_created_at ON public.search_activity_logs USING btree (created_at DESC);


--
-- Name: idx_search_activity_logs_practitioner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_activity_logs_practitioner_id ON public.search_activity_logs USING btree (practitioner_id);


--
-- Name: idx_search_activity_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_activity_logs_user_id ON public.search_activity_logs USING btree (user_id);


--
-- Name: idx_support_tickets_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_user ON public.support_tickets USING btree (user_id);


--
-- Name: idx_user_consents_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_consents_user ON public.user_consents USING btree (user_id);


--
-- Name: idx_user_consents_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_consents_user_id ON public.user_consents USING btree (user_id);


--
-- Name: idx_webhook_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_created_at ON public.webhook_events USING btree (created_at);


--
-- Name: idx_webhook_events_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_event_id ON public.webhook_events USING btree (event_id);


--
-- Name: idx_webhook_events_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_retry ON public.webhook_events USING btree (processing_status, retry_count, last_retry_at) WHERE (processing_status = 'failed'::text);


--
-- Name: refresh_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_tokens_user_idx ON public.refresh_tokens USING btree (user_id) WHERE (revoked_at IS NULL);


--
-- Name: users_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_unique ON public.users USING btree (email) WHERE ((email IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: users_last_sign_in_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_last_sign_in_idx ON public.users USING btree (last_sign_in_at);


--
-- Name: users_phone_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_phone_unique ON public.users USING btree (phone) WHERE ((phone IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: otp_attempts after_otp_attempt_cleanup; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER after_otp_attempt_cleanup AFTER INSERT ON public.otp_attempts FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_cleanup_otp_attempts();


--
-- Name: care_notes care_notes_sharing_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER care_notes_sharing_audit AFTER UPDATE ON public.care_notes FOR EACH ROW EXECUTE FUNCTION public.log_care_notes_sharing_change();


--
-- Name: profiles ensure_phone_uniqueness; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ensure_phone_uniqueness BEFORE INSERT OR UPDATE OF phone ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.check_phone_uniqueness();


--
-- Name: appointments notify_appointments_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_appointments_change AFTER INSERT OR DELETE OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.notify_table_change();


--
-- Name: group_session_participants notify_group_session_participants_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_group_session_participants_change AFTER INSERT OR DELETE OR UPDATE ON public.group_session_participants FOR EACH ROW EXECUTE FUNCTION public.notify_table_change();


--
-- Name: group_sessions notify_group_sessions_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_group_sessions_change AFTER INSERT OR DELETE OR UPDATE ON public.group_sessions FOR EACH ROW EXECUTE FUNCTION public.notify_table_change();


--
-- Name: messages notify_messages_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_messages_change AFTER INSERT OR DELETE OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_table_change();


--
-- Name: notifications notify_notifications_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_notifications_change AFTER INSERT OR DELETE OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.notify_table_change();


--
-- Name: payments notify_payments_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_payments_change AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.notify_table_change();


--
-- Name: practitioner_balances notify_practitioner_balances_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_practitioner_balances_change AFTER INSERT OR DELETE OR UPDATE ON public.practitioner_balances FOR EACH ROW EXECUTE FUNCTION public.notify_table_change();


--
-- Name: practitioner_payouts notify_practitioner_payouts_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_practitioner_payouts_change AFTER INSERT OR DELETE OR UPDATE ON public.practitioner_payouts FOR EACH ROW EXECUTE FUNCTION public.notify_table_change();


--
-- Name: practitioners notify_practitioners_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_practitioners_change AFTER INSERT OR DELETE OR UPDATE ON public.practitioners FOR EACH ROW EXECUTE FUNCTION public.notify_table_change();


--
-- Name: support_tickets notify_support_tickets_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_support_tickets_change AFTER INSERT OR DELETE OR UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.notify_table_change();


--
-- Name: users on_user_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_user_created AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_safe();


--
-- Name: services service_changes_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER service_changes_audit AFTER INSERT OR DELETE OR UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.log_service_changes();


--
-- Name: users set_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payments trigger_set_invoice_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_set_invoice_number BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_invoice_number();


--
-- Name: payments trigger_update_balance_on_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_balance_on_payment AFTER INSERT OR UPDATE OF status, payout_status, net_amount ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_practitioner_balance_on_payment_change();


--
-- Name: files trigger_update_files_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_files_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.update_files_updated_at();


--
-- Name: care_notes update_care_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_care_notes_updated_at BEFORE UPDATE ON public.care_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: practitioner_balances update_practitioner_balances_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_practitioner_balances_updated_at BEFORE UPDATE ON public.practitioner_balances FOR EACH ROW EXECUTE FUNCTION public.update_practitioner_balance_timestamp();


--
-- Name: practitioner_payouts update_practitioner_payouts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_practitioner_payouts_updated_at BEFORE UPDATE ON public.practitioner_payouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: practitioner_rates update_practitioner_rates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_practitioner_rates_updated_at BEFORE UPDATE ON public.practitioner_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: group_sessions validate_coach_type_before_group_session; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_coach_type_before_group_session BEFORE INSERT OR UPDATE ON public.group_sessions FOR EACH ROW EXECUTE FUNCTION public.validate_coach_for_group_session();


--
-- Name: addresses addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: admin_audit_logs admin_audit_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id);


--
-- Name: auth_tokens auth_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: care_notes care_notes_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_notes
    ADD CONSTRAINT care_notes_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);


--
-- Name: care_notes care_notes_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_notes
    ADD CONSTRAINT care_notes_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id);


--
-- Name: care_notes_sharing_log care_notes_sharing_log_care_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_notes_sharing_log
    ADD CONSTRAINT care_notes_sharing_log_care_note_id_fkey FOREIGN KEY (care_note_id) REFERENCES public.care_notes(id) ON DELETE CASCADE;


--
-- Name: consent_versions consent_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_versions
    ADD CONSTRAINT consent_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: consents consents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consents
    ADD CONSTRAINT consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: consultation_reports_access_log consultation_reports_access_log_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consultation_reports_access_log
    ADD CONSTRAINT consultation_reports_access_log_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.consultation_reports(id) ON DELETE CASCADE;


--
-- Name: dispute_messages dispute_messages_dispute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_messages
    ADD CONSTRAINT dispute_messages_dispute_id_fkey FOREIGN KEY (dispute_id) REFERENCES public.disputes(id) ON DELETE CASCADE;


--
-- Name: dispute_messages dispute_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_messages
    ADD CONSTRAINT dispute_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: disputes disputes_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);


--
-- Name: disputes disputes_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: disputes disputes_raised_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES public.users(id);


--
-- Name: emergency_contacts emergency_contacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emergency_contacts
    ADD CONSTRAINT emergency_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: faqs faqs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faqs
    ADD CONSTRAINT faqs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: faqs faqs_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faqs
    ADD CONSTRAINT faqs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: file_access_logs file_access_logs_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_access_logs
    ADD CONSTRAINT file_access_logs_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: file_access_logs file_access_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_access_logs
    ADD CONSTRAINT file_access_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: files files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: group_session_participants group_session_participants_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_session_participants
    ADD CONSTRAINT group_session_participants_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.group_sessions(id) ON DELETE CASCADE;


--
-- Name: group_sessions group_sessions_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sessions
    ADD CONSTRAINT group_sessions_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.practitioners(id) ON DELETE CASCADE;


--
-- Name: kyc_documents kyc_documents_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_documents
    ADD CONSTRAINT kyc_documents_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) ON DELETE CASCADE;


--
-- Name: ledger_entries ledger_entries_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.ledger_accounts(id);


--
-- Name: medical_profiles medical_profiles_primary_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_profiles
    ADD CONSTRAINT medical_profiles_primary_doctor_id_fkey FOREIGN KEY (primary_doctor_id) REFERENCES public.practitioners(id) ON DELETE SET NULL;


--
-- Name: medical_profiles medical_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_profiles
    ADD CONSTRAINT medical_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_attempts payment_attempts_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_attempts
    ADD CONSTRAINT payment_attempts_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payment_events payment_events_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payment_reconciliations payment_reconciliations_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_reconciliations
    ADD CONSTRAINT payment_reconciliations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payment_refunds payment_refunds_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_refunds
    ADD CONSTRAINT payment_refunds_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: payout_payments payout_payments_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_payments
    ADD CONSTRAINT payout_payments_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payout_payments payout_payments_payout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_payments
    ADD CONSTRAINT payout_payments_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES public.practitioner_payouts(id) ON DELETE CASCADE;


--
-- Name: practitioner_availability practitioner_availability_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_availability
    ADD CONSTRAINT practitioner_availability_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) ON DELETE CASCADE;


--
-- Name: practitioner_balances practitioner_balances_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_balances
    ADD CONSTRAINT practitioner_balances_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id);


--
-- Name: practitioner_exceptions practitioner_exceptions_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_exceptions
    ADD CONSTRAINT practitioner_exceptions_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) ON DELETE CASCADE;


--
-- Name: practitioner_payment_info practitioner_payment_info_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_payment_info
    ADD CONSTRAINT practitioner_payment_info_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) ON DELETE CASCADE;


--
-- Name: practitioner_payouts practitioner_payouts_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_payouts
    ADD CONSTRAINT practitioner_payouts_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.payout_batches(id);


--
-- Name: practitioner_payouts practitioner_payouts_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_payouts
    ADD CONSTRAINT practitioner_payouts_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id);


--
-- Name: practitioner_rates practitioner_rates_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioner_rates
    ADD CONSTRAINT practitioner_rates_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) ON DELETE CASCADE;


--
-- Name: practitioners practitioners_kyc_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioners
    ADD CONSTRAINT practitioners_kyc_reviewed_by_fkey FOREIGN KEY (kyc_reviewed_by) REFERENCES public.users(id);


--
-- Name: practitioners practitioners_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practitioners
    ADD CONSTRAINT practitioners_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reconciliation_reports reconciliation_reports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_reports
    ADD CONSTRAINT reconciliation_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_moderated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_moderated_by_fkey FOREIGN KEY (moderated_by) REFERENCES public.users(id);


--
-- Name: reviews reviews_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: saved_payment_methods saved_payment_methods_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_payment_methods
    ADD CONSTRAINT saved_payment_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: search_activity_logs search_activity_logs_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_activity_logs
    ADD CONSTRAINT search_activity_logs_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) ON DELETE SET NULL;


--
-- Name: search_activity_logs search_activity_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_activity_logs
    ADD CONSTRAINT search_activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: service_audit_log service_audit_log_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_audit_log
    ADD CONSTRAINT service_audit_log_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: support_tickets support_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: system_config system_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: triage_results triage_results_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_results
    ADD CONSTRAINT triage_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_consents user_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_consents
    ADD CONSTRAINT user_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reconciliation_reports Admins can create reconciliation reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create reconciliation reports" ON public.reconciliation_reports FOR INSERT WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: admin_audit_logs Admins can insert audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert audit logs" ON public.admin_audit_logs FOR INSERT WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: faqs Admins can manage FAQs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage FAQs" ON public.faqs USING (public.is_admin(auth.uid()));


--
-- Name: admins Admins can manage admins table; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage admins table" ON public.admins TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: disputes Admins can manage all disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all disputes" ON public.disputes USING (public.is_admin(auth.uid()));


--
-- Name: practitioner_payouts Admins can manage all payouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all payouts" ON public.practitioner_payouts USING (public.is_admin(auth.uid()));


--
-- Name: support_tickets Admins can manage all support tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all support tickets" ON public.support_tickets USING (public.is_admin(auth.uid()));


--
-- Name: practitioner_balances Admins can manage balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage balances" ON public.practitioner_balances USING (public.is_admin(auth.uid()));


--
-- Name: consent_versions Admins can manage consent versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage consent versions" ON public.consent_versions USING (public.is_admin(auth.uid()));


--
-- Name: kyc_documents Admins can manage kyc_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage kyc_documents" ON public.kyc_documents TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: ledger_accounts Admins can manage ledger accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage ledger accounts" ON public.ledger_accounts USING (public.is_admin(auth.uid()));


--
-- Name: ledger_entries Admins can manage ledger entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage ledger entries" ON public.ledger_entries USING (public.is_admin(auth.uid()));


--
-- Name: payout_batches Admins can manage payout batches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage payout batches" ON public.payout_batches USING (public.is_admin(auth.uid()));


--
-- Name: payment_refunds Admins can manage refunds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage refunds" ON public.payment_refunds USING (public.is_admin(auth.uid()));


--
-- Name: system_config Admins can manage system config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage system config" ON public.system_config USING (public.is_admin(auth.uid()));


--
-- Name: appointments Admins can update all appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all appointments" ON public.appointments FOR UPDATE USING (public.is_admin(auth.uid()));


--
-- Name: payments Admins can update all payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all payments" ON public.payments FOR UPDATE USING (public.is_admin(auth.uid()));


--
-- Name: practitioners Admins can update practitioners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update practitioners" ON public.practitioners FOR UPDATE USING (public.is_admin(auth.uid()));


--
-- Name: reconciliation_reports Admins can update reconciliation reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update reconciliation reports" ON public.reconciliation_reports FOR UPDATE USING (public.is_admin(auth.uid()));


--
-- Name: otp_attempts Admins can view OTP attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view OTP attempts" ON public.otp_attempts FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: otp_rate_limits Admins can view OTP rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view OTP rate limits" ON public.otp_rate_limits FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: consultation_reports_access_log Admins can view access log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view access log" ON public.consultation_reports_access_log FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: admins Admins can view admins table; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view admins table" ON public.admins FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: appointments Admins can view all appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all appointments" ON public.appointments FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: practitioner_balances Admins can view all balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all balances" ON public.practitioner_balances FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: kyc_documents Admins can view all kyc_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all kyc_documents" ON public.kyc_documents FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: ledger_accounts Admins can view all ledger accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all ledger accounts" ON public.ledger_accounts FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: ledger_entries Admins can view all ledger entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all ledger entries" ON public.ledger_entries FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: payment_attempts Admins can view all payment attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all payment attempts" ON public.payment_attempts FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE (user_roles.user_id = auth.uid()))));


--
-- Name: payment_events Admins can view all payment events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all payment events" ON public.payment_events FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: practitioner_payment_info Admins can view all payment info; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all payment info" ON public.practitioner_payment_info FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: payments Admins can view all payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all payments" ON public.payments FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: practitioners Admins can view all practitioners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all practitioners" ON public.practitioners FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: profiles Admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: search_activity_logs Admins can view all search activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all search activity logs" ON public.search_activity_logs FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: user_consents Admins can view all user_consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all user_consents" ON public.user_consents FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: admin_audit_logs Admins can view audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view audit logs" ON public.admin_audit_logs FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: payout_batches Admins can view payout batches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view payout batches" ON public.payout_batches FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: payout_payments Admins can view payout payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view payout payments" ON public.payout_payments FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: reconciliation_reports Admins can view reconciliation reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view reconciliation reports" ON public.reconciliation_reports FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: payment_reconciliations Admins can view reconciliations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view reconciliations" ON public.payment_reconciliations FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: payment_refunds Admins can view refunds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view refunds" ON public.payment_refunds FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: care_notes_sharing_log Admins can view sharing log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view sharing log" ON public.care_notes_sharing_log FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: webhook_events Admins can view webhook events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view webhook events" ON public.webhook_events FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: services Anyone can view active services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active services" ON public.services FOR SELECT USING ((is_active = true));


--
-- Name: search_activity_logs Authenticated users can insert search activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert search activity logs" ON public.search_activity_logs FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text)));


--
-- Name: practitioner_availability Authenticated users can view availability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view availability" ON public.practitioner_availability FOR SELECT TO authenticated USING (true);


--
-- Name: group_sessions Authenticated users can view group sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view group sessions" ON public.group_sessions FOR SELECT TO authenticated USING ((status = ANY (ARRAY['confirmee'::text, 'planifiee'::text])));


--
-- Name: practitioner_rates Authenticated users can view rates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view rates" ON public.practitioner_rates FOR SELECT TO authenticated USING (true);


--
-- Name: group_session_participants Coaches can manage participants in their sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage participants in their sessions" ON public.group_session_participants USING ((EXISTS ( SELECT 1
   FROM public.group_sessions gs
  WHERE ((gs.id = group_session_participants.session_id) AND (gs.coach_id IN ( SELECT practitioners.id
           FROM public.practitioners
          WHERE (practitioners.user_id = auth.uid())))))));


--
-- Name: group_sessions Coaches can manage their group sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage their group sessions" ON public.group_sessions USING ((coach_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));


--
-- Name: payments Coaches can view payments for their group sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view payments for their group sessions" ON public.payments FOR SELECT USING (((appointment_id ~~ 'group_session_%'::text) AND (EXISTS ( SELECT 1
   FROM (public.group_sessions gs
     JOIN public.practitioners p ON ((p.id = gs.coach_id)))
  WHERE ((p.user_id = auth.uid()) AND (payments.appointment_id ~~ (('%'::text || (gs.id)::text) || '%'::text)))))));


--
-- Name: consent_versions Everyone can view active consent versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Everyone can view active consent versions" ON public.consent_versions FOR SELECT USING (((is_active = true) OR public.is_admin(auth.uid())));


--
-- Name: faqs Everyone can view published FAQs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Everyone can view published FAQs" ON public.faqs FOR SELECT USING (((is_published = true) OR public.is_admin(auth.uid())));


--
-- Name: services Only admins can delete services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete services" ON public.services FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: services Only admins can insert services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can insert services" ON public.services FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: services Only admins can update services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can update services" ON public.services FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: service_audit_log Only admins can view service audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can view service audit logs" ON public.service_audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: group_session_participants Participants can view their own registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view their own registrations" ON public.group_session_participants FOR SELECT USING (((auth.uid() = patient_id) OR (EXISTS ( SELECT 1
   FROM public.group_sessions gs
  WHERE ((gs.id = group_session_participants.session_id) AND (gs.coach_id IN ( SELECT practitioners.id
           FROM public.practitioners
          WHERE (practitioners.user_id = auth.uid()))))))));


--
-- Name: appointments Patients can create appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can create appointments" ON public.appointments FOR INSERT WITH CHECK ((patient_id = (auth.uid())::text));


--
-- Name: reviews Patients can create reviews for their appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can create reviews for their appointments" ON public.reviews FOR INSERT WITH CHECK (((auth.uid() = patient_id) AND (EXISTS ( SELECT 1
   FROM public.appointments
  WHERE ((appointments.id = reviews.appointment_id) AND (appointments.patient_id = (auth.uid())::text) AND (appointments.status = 'completed'::text))))));


--
-- Name: medical_profiles Patients can create their own medical profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can create their own medical profile" ON public.medical_profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: medical_profiles Patients can delete their own medical profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can delete their own medical profile" ON public.medical_profiles FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: appointments Patients can update their appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can update their appointments" ON public.appointments FOR UPDATE USING ((patient_id = (auth.uid())::text));


--
-- Name: medical_profiles Patients can update their own medical profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can update their own medical profile" ON public.medical_profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: care_notes Patients can view shared care notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view shared care notes" ON public.care_notes FOR SELECT USING (((shared_with_patient = true) AND (EXISTS ( SELECT 1
   FROM public.appointments
  WHERE ((appointments.id = care_notes.appointment_id) AND (appointments.patient_id = (auth.uid())::text))))));


--
-- Name: appointments Patients can view their appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their appointments" ON public.appointments FOR SELECT USING ((patient_id = (auth.uid())::text));


--
-- Name: consultation_reports Patients can view their consultation reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their consultation reports" ON public.consultation_reports FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.appointments
  WHERE ((appointments.id = consultation_reports.appointment_id) AND (appointments.patient_id = (auth.uid())::text)))));


--
-- Name: medical_profiles Patients can view their own medical profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own medical profile" ON public.medical_profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: practitioners Practitioners can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can insert their own profile" ON public.practitioners FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: practitioner_availability Practitioners can manage their availability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can manage their availability" ON public.practitioner_availability USING ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));


--
-- Name: care_notes Practitioners can manage their care notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can manage their care notes" ON public.care_notes USING ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));


--
-- Name: consultation_reports Practitioners can manage their consultation reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can manage their consultation reports" ON public.consultation_reports USING ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));


--
-- Name: practitioner_exceptions Practitioners can manage their exceptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can manage their exceptions" ON public.practitioner_exceptions USING ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));


--
-- Name: practitioner_payment_info Practitioners can manage their payment info; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can manage their payment info" ON public.practitioner_payment_info USING ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));


--
-- Name: practitioner_rates Practitioners can manage their rates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can manage their rates" ON public.practitioner_rates USING ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));


--
-- Name: appointments Practitioners can update their appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can update their appointments" ON public.appointments FOR UPDATE TO authenticated USING ((practitioner_id IN ( SELECT (practitioners.id)::text AS id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));


--
-- Name: practitioners Practitioners can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can update their own profile" ON public.practitioners FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: emergency_contacts Practitioners can view emergency contacts for active appointmen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can view emergency contacts for active appointmen" ON public.emergency_contacts FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.appointments a
     JOIN public.practitioners p ON ((a.practitioner_id = (p.id)::text)))
  WHERE ((p.user_id = auth.uid()) AND (a.patient_id = (emergency_contacts.user_id)::text) AND (a.status = 'in-progress'::text)))));


--
-- Name: kyc_documents Practitioners can view own kyc_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can view own kyc_documents" ON public.kyc_documents FOR SELECT TO authenticated USING ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));


--
-- Name: profiles Practitioners can view patient profiles for appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can view patient profiles for appointments" ON public.profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.appointments a
     JOIN public.practitioners p ON ((a.practitioner_id = (p.id)::text)))
  WHERE ((p.user_id = auth.uid()) AND (a.patient_id = (profiles.id)::text) AND (a.status = ANY (ARRAY['confirmed'::text, 'in-progress'::text, 'completed'::text, 'pending_payment'::text]))))));


--
-- Name: payment_events Practitioners can view payment events for their appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can view payment events for their appointments" ON public.payment_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.payments p
     JOIN public.appointments a ON ((a.id = p.appointment_id)))
  WHERE ((p.id = payment_events.payment_id) AND (a.practitioner_id = (public.get_practitioner_id_for_user(auth.uid()))::text)))));


--
-- Name: payments Practitioners can view payments for their appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can view payments for their appointments" ON public.payments FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.appointments a
  WHERE ((a.id = payments.appointment_id) AND (a.practitioner_id = (auth.uid())::text)))) OR ((patient_id)::text = (auth.uid())::text)));


--
-- Name: medical_profiles Practitioners can view shared medical profiles for active appoi; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can view shared medical profiles for active appoi" ON public.medical_profiles FOR SELECT USING (((share_with_practitioner = true) AND (EXISTS ( SELECT 1
   FROM (public.appointments a
     JOIN public.practitioners p ON ((a.practitioner_id = (p.id)::text)))
  WHERE ((p.user_id = auth.uid()) AND (a.patient_id = (medical_profiles.user_id)::text) AND (a.status = ANY (ARRAY['confirmed'::text, 'in-progress'::text])) AND (((a.date)::date >= (CURRENT_DATE - '1 day'::interval)) AND ((a.date)::date <= (CURRENT_DATE + '1 day'::interval))))))));


--
-- Name: appointments Practitioners can view their appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can view their appointments" ON public.appointments FOR SELECT TO authenticated USING ((practitioner_id IN ( SELECT (practitioners.id)::text AS id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));


--
-- Name: practitioner_balances Practitioners can view their balance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can view their balance" ON public.practitioner_balances FOR SELECT USING ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));


--
-- Name: practitioner_payouts Practitioners can view their own payouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can view their own payouts" ON public.practitioner_payouts FOR SELECT USING ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));


--
-- Name: practitioners Practitioners can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can view their own profile" ON public.practitioners FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: payout_payments Practitioners can view their payout payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can view their payout payments" ON public.payout_payments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.practitioner_payouts pp
     JOIN public.practitioners p ON ((p.id = pp.practitioner_id)))
  WHERE ((pp.id = payout_payments.payout_id) AND (p.user_id = auth.uid())))));


--
-- Name: practitioner_payouts Practitioners can view their payouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Practitioners can view their payouts" ON public.practitioner_payouts FOR SELECT USING ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));


--
-- Name: file_access_logs Service role can insert access logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert access logs" ON public.file_access_logs FOR INSERT WITH CHECK (true);


--
-- Name: files Service role can insert files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert files" ON public.files FOR INSERT WITH CHECK ((((auth.jwt() ->> 'role'::text) = 'service_role'::text) OR (auth.uid() = user_id)));


--
-- Name: payment_events Service role can insert payment events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert payment events" ON public.payment_events FOR INSERT WITH CHECK (true);


--
-- Name: practitioners Service role can insert practitioners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert practitioners" ON public.practitioners FOR INSERT WITH CHECK ((((auth.jwt() ->> 'role'::text) = 'service_role'::text) OR (auth.uid() = user_id)));


--
-- Name: profiles Service role can insert profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert profiles" ON public.profiles FOR INSERT WITH CHECK (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: payment_reconciliations Service role can insert reconciliations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert reconciliations" ON public.payment_reconciliations FOR INSERT WITH CHECK (true);


--
-- Name: webhook_events Service role can insert webhook events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert webhook events" ON public.webhook_events FOR INSERT WITH CHECK (true);


--
-- Name: practitioners Service role can update practitioners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update practitioners" ON public.practitioners FOR UPDATE USING ((((auth.jwt() ->> 'role'::text) = 'service_role'::text) OR (auth.uid() = user_id)));


--
-- Name: profiles Service role can upsert profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can upsert profiles" ON public.profiles USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text)) WITH CHECK (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: user_roles Super admins can manage all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage all roles" ON public.user_roles USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: consultation_reports_access_log System can insert access log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert access log" ON public.consultation_reports_access_log FOR INSERT WITH CHECK (true);


--
-- Name: care_notes_sharing_log System can insert sharing log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert sharing log" ON public.care_notes_sharing_log FOR INSERT WITH CHECK (true);


--
-- Name: otp_rate_limits System can manage OTP rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can manage OTP rate limits" ON public.otp_rate_limits USING (false) WITH CHECK (false);


--
-- Name: disputes Users can create disputes for their appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create disputes for their appointments" ON public.disputes FOR INSERT WITH CHECK (((auth.uid() = raised_by) AND (EXISTS ( SELECT 1
   FROM public.appointments
  WHERE ((appointments.id = disputes.appointment_id) AND ((appointments.patient_id = (auth.uid())::text) OR (appointments.practitioner_id = (auth.uid())::text)))))));


--
-- Name: messages Users can create messages for their appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create messages for their appointments" ON public.messages FOR INSERT WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM public.appointments
  WHERE ((appointments.id = messages.appointment_id) AND ((appointments.patient_id = (auth.uid())::text) OR (appointments.practitioner_id = (auth.uid())::text)))))));


--
-- Name: dispute_messages Users can create messages for their disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create messages for their disputes" ON public.dispute_messages FOR INSERT WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM public.disputes
  WHERE ((disputes.id = dispute_messages.dispute_id) AND ((disputes.raised_by = auth.uid()) OR public.is_admin(auth.uid())))))));


--
-- Name: support_tickets Users can create support tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create support tickets" ON public.support_tickets FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: payment_attempts Users can create their own payment attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own payment attempts" ON public.payment_attempts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: payments Users can create their own payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own payments" ON public.payments FOR INSERT WITH CHECK ((auth.uid() = patient_id));


--
-- Name: saved_payment_methods Users can create their saved payment methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their saved payment methods" ON public.saved_payment_methods FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: triage_results Users can create their triage results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their triage results" ON public.triage_results FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can delete own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own profile" ON public.profiles FOR DELETE USING ((auth.uid() = id));


--
-- Name: files Users can delete their own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own files" ON public.files FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: messages Users can delete their own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own messages" ON public.messages FOR DELETE USING ((auth.uid() = sender_id));


--
-- Name: push_subscriptions Users can delete their own subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own subscriptions" ON public.push_subscriptions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: saved_payment_methods Users can delete their saved payment methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their saved payment methods" ON public.saved_payment_methods FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: triage_results Users can delete their triage results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their triage results" ON public.triage_results FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_consents Users can insert own consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own consents" ON public.user_consents FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: files Users can insert their own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own files" ON public.files FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: push_subscriptions Users can insert their own subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own subscriptions" ON public.push_subscriptions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: addresses Users can manage their addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their addresses" ON public.addresses USING (((auth.uid() = user_id) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text))) WITH CHECK (((auth.uid() = user_id) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text)));


--
-- Name: consents Users can manage their consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their consents" ON public.consents USING (((auth.uid() = user_id) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text))) WITH CHECK (((auth.uid() = user_id) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text)));


--
-- Name: user_consents Users can manage their consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their consents" ON public.user_consents USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: emergency_contacts Users can manage their emergency contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their emergency contacts" ON public.emergency_contacts USING (((auth.uid() = user_id) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text))) WITH CHECK (((auth.uid() = user_id) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text)));


--
-- Name: medical_profiles Users can manage their medical profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their medical profile" ON public.medical_profiles USING ((auth.uid() = user_id));


--
-- Name: notification_preferences Users can manage their notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their notification preferences" ON public.notification_preferences USING ((auth.uid() = user_id));


--
-- Name: group_session_participants Users can register for group sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can register for group sessions" ON public.group_session_participants FOR INSERT WITH CHECK ((auth.uid() = patient_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: notifications Users can update their notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their notifications" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: files Users can update their own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own files" ON public.files FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: payments Users can update their own payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own payments" ON public.payments FOR UPDATE USING ((auth.uid() = patient_id));


--
-- Name: push_subscriptions Users can update their own subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own subscriptions" ON public.push_subscriptions FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: saved_payment_methods Users can update their saved payment methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their saved payment methods" ON public.saved_payment_methods FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: support_tickets Users can update their support tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their support tickets" ON public.support_tickets FOR UPDATE USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: payment_events Users can view events for their payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view events for their payments" ON public.payment_events FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.payments
  WHERE ((payments.id = payment_events.payment_id) AND (payments.patient_id = auth.uid())))) OR public.is_admin(auth.uid())));


--
-- Name: messages Users can view messages for their appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages for their appointments" ON public.messages FOR SELECT USING (((auth.uid() = sender_id) OR (EXISTS ( SELECT 1
   FROM public.appointments
  WHERE ((appointments.id = messages.appointment_id) AND ((appointments.patient_id = (auth.uid())::text) OR (appointments.practitioner_id = (auth.uid())::text)))))));


--
-- Name: dispute_messages Users can view messages for their disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages for their disputes" ON public.dispute_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.disputes
  WHERE ((disputes.id = dispute_messages.dispute_id) AND ((disputes.raised_by = auth.uid()) OR public.is_admin(auth.uid()))))));


--
-- Name: user_consents Users can view own consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own consents" ON public.user_consents FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: reviews Users can view reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view reviews" ON public.reviews FOR SELECT USING (((is_hidden = false) OR public.is_admin(auth.uid()) OR (auth.uid() = patient_id)));


--
-- Name: user_consents Users can view their consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their consents" ON public.user_consents FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: notifications Users can view their notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: file_access_logs Users can view their own access logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own access logs" ON public.file_access_logs FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: disputes Users can view their own disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own disputes" ON public.disputes FOR SELECT USING (((auth.uid() = raised_by) OR (EXISTS ( SELECT 1
   FROM public.appointments
  WHERE ((appointments.id = disputes.appointment_id) AND ((appointments.patient_id = (auth.uid())::text) OR (appointments.practitioner_id = (auth.uid())::text)))))));


--
-- Name: files Users can view their own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own files" ON public.files FOR SELECT USING (((auth.uid() = user_id) OR (auth.uid() = ANY (shared_with)) OR public.is_admin(auth.uid())));


--
-- Name: payment_attempts Users can view their own payment attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own payment attempts" ON public.payment_attempts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: payments Users can view their own payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own payments" ON public.payments FOR SELECT USING ((auth.uid() = patient_id));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: push_subscriptions Users can view their own subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own subscriptions" ON public.push_subscriptions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: payment_events Users can view their payment events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their payment events" ON public.payment_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.payments
  WHERE ((payments.id = payment_events.payment_id) AND (payments.patient_id = auth.uid())))));


--
-- Name: saved_payment_methods Users can view their saved payment methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their saved payment methods" ON public.saved_payment_methods FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: support_tickets Users can view their support tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their support tickets" ON public.support_tickets FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: triage_results Users can view their triage results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their triage results" ON public.triage_results FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_tokens auth_tokens_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_tokens_service_only ON public.auth_tokens USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: care_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.care_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: care_notes_sharing_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.care_notes_sharing_log ENABLE ROW LEVEL SECURITY;

--
-- Name: consent_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consent_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

--
-- Name: consultation_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consultation_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: consultation_reports_access_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consultation_reports_access_log ENABLE ROW LEVEL SECURITY;

--
-- Name: dispute_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: disputes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

--
-- Name: emergency_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: faqs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

--
-- Name: file_access_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.file_access_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

--
-- Name: group_session_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_session_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: group_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: kyc_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: ledger_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: ledger_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: medical_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medical_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: otp_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.otp_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: otp_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.otp_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: practitioners patients_view_booked_practitioner_limited; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patients_view_booked_practitioner_limited ON public.practitioners FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.appointments a
  WHERE ((a.practitioner_id = (practitioners.id)::text) AND (a.patient_id = (auth.uid())::text) AND (a.status = ANY (ARRAY['confirmed'::text, 'in-progress'::text, 'completed'::text, 'pending_payment'::text])))))));


--
-- Name: payment_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_reconciliations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_reconciliations ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payout_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: payout_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payout_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: practitioner_availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.practitioner_availability ENABLE ROW LEVEL SECURITY;

--
-- Name: practitioner_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.practitioner_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: practitioner_exceptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.practitioner_exceptions ENABLE ROW LEVEL SECURITY;

--
-- Name: practitioner_payment_info; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.practitioner_payment_info ENABLE ROW LEVEL SECURITY;

--
-- Name: practitioner_payouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.practitioner_payouts ENABLE ROW LEVEL SECURITY;

--
-- Name: practitioner_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.practitioner_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: practitioners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.practitioners ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: reconciliation_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reconciliation_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens refresh_tokens_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY refresh_tokens_service_only ON public.refresh_tokens USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_payment_methods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_payment_methods ENABLE ROW LEVEL SECURITY;

--
-- Name: search_activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.search_activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: service_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: system_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

--
-- Name: triage_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.triage_results ENABLE ROW LEVEL SECURITY;

--
-- Name: user_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_self_read ON public.users FOR SELECT USING ((id = auth.uid()));


--
-- Name: users users_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_service_only ON public.users USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict vi0C0SOnjKNbPhaaBISFjagKXfQeSh7PPnONdBqek1rEod2TpkR1kYqXSSjb48s

