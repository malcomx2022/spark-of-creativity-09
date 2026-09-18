drop extension if exists "pg_net";

create type "public"."app_role" as enum ('super_admin', 'ops', 'finance', 'compliance', 'support', 'analyst', 'patient', 'practitioner', 'coach');

create type "public"."blood_type" as enum ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'inconnu');

create type "public"."consent_type" as enum ('cgu', 'charte', 'partage_donnees', 'marketing');

create type "public"."gender" as enum ('homme', 'femme', 'autre', 'non_specifie');

create type "public"."ledger_account_type" as enum ('cash', 'payable', 'receivable', 'revenue_commission', 'revenue_fees', 'obligation');

create type "public"."ledger_owner_type" as enum ('platform', 'patient', 'practitioner');

create type "public"."payout_batch_status" as enum ('queued', 'processing', 'sent', 'failed', 'partially_sent');

create type "public"."practitioner_type" as enum ('medecin', 'infirmier', 'kinesitherapeute', 'nutritionniste', 'sage_femme', 'psychologue', 'coach_sportif', 'autre');

create type "public"."ticket_status" as enum ('ouvert', 'en_cours', 'resolu', 'ferme');


  create table "public"."addresses" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "label" text not null,
    "address" text not null,
    "city" text,
    "postal_code" text,
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "is_default" boolean default false,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."addresses" enable row level security;


  create table "public"."admin_audit_logs" (
    "id" uuid not null default gen_random_uuid(),
    "admin_id" uuid not null,
    "action" text not null,
    "entity_type" text not null,
    "entity_id" text,
    "details" jsonb,
    "ip_address" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."admin_audit_logs" enable row level security;


  create table "public"."appointments" (
    "id" text not null default (gen_random_uuid())::text,
    "patient_id" text not null,
    "patient_name" text not null,
    "practitioner_id" text not null,
    "practitioner_name" text not null,
    "specialty" text not null,
    "date" text not null,
    "time" text not null,
    "duration" integer not null default 60,
    "status" text not null default 'pending'::text,
    "address" text not null,
    "reason" text not null,
    "notes" text,
    "urgency_level" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "visit_status" text default 'scheduled'::text,
    "pre_visit_checklist" jsonb,
    "internal_notes" text,
    "payment_amount" integer,
    "practitioner_status" text default 'assigned'::text,
    "payment_expires_at" timestamp with time zone,
    "confirmation_requested_at" timestamp with time zone,
    "patient_confirmed_at" timestamp with time zone,
    "practitioner_latitude" numeric,
    "practitioner_longitude" numeric,
    "practitioner_last_location_update" timestamp with time zone,
    "consultation_started_at" timestamp with time zone,
    "consultation_ended_at" timestamp with time zone
      );


alter table "public"."appointments" enable row level security;


  create table "public"."care_notes" (
    "id" uuid not null default gen_random_uuid(),
    "appointment_id" text not null,
    "practitioner_id" uuid not null,
    "subjective" text,
    "objective" text,
    "assessment" text,
    "plan" text,
    "attachments" text[],
    "shared_with_patient" boolean default false,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."care_notes" enable row level security;


  create table "public"."care_notes_sharing_log" (
    "id" uuid not null default gen_random_uuid(),
    "care_note_id" uuid not null,
    "practitioner_id" uuid not null,
    "old_shared_value" boolean,
    "new_shared_value" boolean,
    "changed_at" timestamp with time zone default now(),
    "changed_by" uuid default auth.uid()
      );


alter table "public"."care_notes_sharing_log" enable row level security;


  create table "public"."consent_versions" (
    "id" uuid not null default gen_random_uuid(),
    "consent_type" public.consent_type not null,
    "version" text not null,
    "content" text not null,
    "is_active" boolean default false,
    "effective_date" timestamp with time zone,
    "created_by" uuid,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."consent_versions" enable row level security;


  create table "public"."consents" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "consent_type" public.consent_type not null,
    "is_accepted" boolean default false,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."consents" enable row level security;


  create table "public"."consultation_reports" (
    "id" uuid not null default gen_random_uuid(),
    "practitioner_id" uuid not null,
    "appointment_id" text not null,
    "consultation_date" timestamp with time zone not null default now(),
    "consultation_type" text not null,
    "consultation_reason" text,
    "clinical_findings" text,
    "primary_diagnosis" text,
    "treatment_prescription" text,
    "follow_up_recommendation" text,
    "follow_up_timeframe" text,
    "additional_comments" text,
    "severity_level" text not null,
    "share_with_doctor" boolean default false,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."consultation_reports" enable row level security;


  create table "public"."consultation_reports_access_log" (
    "id" uuid not null default gen_random_uuid(),
    "report_id" uuid not null,
    "accessed_by" uuid not null,
    "access_type" text not null,
    "accessed_at" timestamp with time zone default now()
      );


alter table "public"."consultation_reports_access_log" enable row level security;


  create table "public"."dispute_messages" (
    "id" uuid not null default gen_random_uuid(),
    "dispute_id" uuid not null,
    "sender_id" uuid not null,
    "message" text not null,
    "attachments" text[],
    "created_at" timestamp with time zone default now()
      );


alter table "public"."dispute_messages" enable row level security;


  create table "public"."disputes" (
    "id" uuid not null default gen_random_uuid(),
    "appointment_id" text,
    "raised_by" uuid not null,
    "assigned_to" uuid,
    "status" text default 'open'::text,
    "priority" text default 'medium'::text,
    "subject" text not null,
    "description" text not null,
    "resolution" text,
    "sla_deadline" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "resolved_at" timestamp with time zone
      );


alter table "public"."disputes" enable row level security;


  create table "public"."emergency_contacts" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "name" text not null,
    "phone" text not null,
    "relationship" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."emergency_contacts" enable row level security;


  create table "public"."faqs" (
    "id" uuid not null default gen_random_uuid(),
    "category" text not null,
    "question" text not null,
    "answer" text not null,
    "target_audience" text default 'all'::text,
    "is_published" boolean default false,
    "version" integer default 1,
    "created_by" uuid,
    "updated_by" uuid,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."faqs" enable row level security;


  create table "public"."file_access_logs" (
    "id" uuid not null default gen_random_uuid(),
    "file_id" uuid,
    "user_id" uuid,
    "access_type" character varying(20) not null,
    "ip_address" inet,
    "user_agent" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."file_access_logs" enable row level security;


  create table "public"."files" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "file_name" character varying(255) not null,
    "file_path" character varying(500) not null,
    "file_size" bigint not null,
    "file_type" character varying(100),
    "storage_provider" character varying(20) default 'wasabi'::character varying,
    "folder" character varying(100),
    "metadata" jsonb,
    "shared_with" uuid[],
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."files" enable row level security;


  create table "public"."group_session_participants" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "patient_id" uuid not null,
    "payment_status" text default 'pending'::text,
    "joined_at" timestamp with time zone default now()
      );


alter table "public"."group_session_participants" enable row level security;


  create table "public"."group_sessions" (
    "id" uuid not null default gen_random_uuid(),
    "coach_id" uuid not null,
    "session_name" text not null,
    "session_type" text not null,
    "max_participants" integer default 10,
    "min_participants" integer default 1,
    "current_participants" integer default 0,
    "scheduled_date" date not null,
    "start_time" time without time zone not null,
    "end_time" time without time zone not null,
    "price_per_person" integer not null,
    "location" text not null,
    "status" text default 'planifiee'::text,
    "description" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."group_sessions" enable row level security;


  create table "public"."ledger_accounts" (
    "id" uuid not null default gen_random_uuid(),
    "owner_type" public.ledger_owner_type not null,
    "owner_id" uuid,
    "account_type" public.ledger_account_type not null,
    "currency" text not null default 'XOF'::text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."ledger_accounts" enable row level security;


  create table "public"."ledger_entries" (
    "id" uuid not null default gen_random_uuid(),
    "account_id" uuid not null,
    "debit" integer not null default 0,
    "credit" integer not null default 0,
    "currency" text not null default 'XOF'::text,
    "reference_type" text not null,
    "reference_id" text not null,
    "description" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."ledger_entries" enable row level security;


  create table "public"."medical_profiles" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "blood_type" public.blood_type default 'inconnu'::public.blood_type,
    "allergies" text,
    "chronic_diseases" text,
    "current_medications" text,
    "additional_notes" text,
    "share_with_practitioner" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "primary_doctor_id" uuid,
    "primary_doctor_name" text,
    "primary_doctor_email" text,
    "primary_doctor_phone" text
      );


alter table "public"."medical_profiles" enable row level security;


  create table "public"."messages" (
    "id" uuid not null default gen_random_uuid(),
    "appointment_id" text not null,
    "sender_id" uuid not null,
    "content" text not null,
    "is_read" boolean default false,
    "created_at" timestamp with time zone default now(),
    "attachment_url" text,
    "attachment_type" text,
    "attachment_name" text,
    "attachment_size" integer
      );


alter table "public"."messages" enable row level security;


  create table "public"."notification_preferences" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "email_enabled" boolean default true,
    "sms_enabled" boolean default false,
    "whatsapp_enabled" boolean default false,
    "push_enabled" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."notification_preferences" enable row level security;


  create table "public"."notifications" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "title" text not null,
    "message" text not null,
    "type" text,
    "is_read" boolean default false,
    "link" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."notifications" enable row level security;


  create table "public"."otp_attempts" (
    "id" uuid not null default gen_random_uuid(),
    "phone_number" text not null,
    "channel" text not null default 'sms'::text,
    "status" text not null,
    "twilio_sid" text,
    "error_message" text,
    "created_at" timestamp with time zone not null default now(),
    "ip_address" inet,
    "user_agent" text
      );


alter table "public"."otp_attempts" enable row level security;


  create table "public"."otp_rate_limits" (
    "phone_number" text not null,
    "attempts" integer default 1,
    "first_attempt_at" timestamp with time zone default now(),
    "blocked_until" timestamp with time zone
      );


alter table "public"."otp_rate_limits" enable row level security;


  create table "public"."payment_attempts" (
    "id" uuid not null default gen_random_uuid(),
    "payment_id" uuid,
    "appointment_id" text,
    "user_id" uuid not null,
    "attempt_number" integer not null default 1,
    "status" text not null,
    "error_type" text,
    "error_message" text,
    "error_details" jsonb,
    "payment_method" text not null,
    "phone_number_encrypted" text,
    "amount" integer not null,
    "retry_after" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "completed_at" timestamp with time zone
      );


alter table "public"."payment_attempts" enable row level security;


  create table "public"."payment_events" (
    "id" uuid not null default gen_random_uuid(),
    "payment_id" uuid not null,
    "event_type" text not null,
    "event_data" jsonb,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."payment_events" enable row level security;


  create table "public"."payment_reconciliations" (
    "id" uuid not null default gen_random_uuid(),
    "payment_id" uuid,
    "old_status" text not null,
    "new_status" text not null,
    "fedapay_status" text not null,
    "fedapay_transaction_data" jsonb,
    "reconciliation_type" text not null,
    "reconciled_by" text,
    "reconciled_at" timestamp with time zone default now(),
    "notes" text
      );


alter table "public"."payment_reconciliations" enable row level security;


  create table "public"."payment_refunds" (
    "id" uuid not null default gen_random_uuid(),
    "payment_id" uuid not null,
    "refund_amount" integer not null,
    "refund_reason" text,
    "refunded_by" uuid not null,
    "provider_refund_id" text,
    "status" text not null default 'pending'::text,
    "created_at" timestamp with time zone not null default now(),
    "processed_at" timestamp with time zone
      );


alter table "public"."payment_refunds" enable row level security;


  create table "public"."payments" (
    "id" uuid not null default gen_random_uuid(),
    "appointment_id" text not null,
    "patient_id" uuid not null,
    "amount" integer not null,
    "currency" text not null default 'XOF'::text,
    "payment_method" text not null,
    "status" text not null default 'pending'::text,
    "fedapay_transaction_id" text,
    "fedapay_payment_url" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "commission_amount" integer default 0,
    "fees_amount" integer default 0,
    "net_amount" integer,
    "gateway_fees_amount" integer default 0,
    "hold_until" timestamp with time zone,
    "payout_status" text default 'pending'::text,
    "idempotency_key" text,
    "channel" text,
    "provider_ref" text,
    "payment_session_data" jsonb,
    "receipt_url" text,
    "invoice_number" text,
    "payer_name" text,
    "payer_email" text,
    "payer_phone" text
      );


alter table "public"."payments" enable row level security;


  create table "public"."payout_batches" (
    "id" uuid not null default gen_random_uuid(),
    "created_by" uuid not null,
    "batch_date" date not null default CURRENT_DATE,
    "payment_method" text not null,
    "status" public.payout_batch_status not null default 'queued'::public.payout_batch_status,
    "total_amount" integer not null default 0,
    "practitioners_count" integer not null default 0,
    "statement_url" text,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."payout_batches" enable row level security;


  create table "public"."payout_payments" (
    "id" uuid not null default gen_random_uuid(),
    "payout_id" uuid not null,
    "payment_id" uuid not null,
    "amount_included" integer not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."payout_payments" enable row level security;


  create table "public"."practitioner_availability" (
    "id" uuid not null default gen_random_uuid(),
    "practitioner_id" uuid not null,
    "day_of_week" integer not null,
    "start_time" time without time zone not null,
    "end_time" time without time zone not null,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."practitioner_availability" enable row level security;


  create table "public"."practitioner_balances" (
    "practitioner_id" uuid not null,
    "balance_available" integer not null default 0,
    "balance_pending" integer not null default 0,
    "balance_on_hold" integer not null default 0,
    "currency" text not null default 'XOF'::text,
    "last_payout_at" timestamp with time zone,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."practitioner_balances" enable row level security;


  create table "public"."practitioner_exceptions" (
    "id" uuid not null default gen_random_uuid(),
    "practitioner_id" uuid not null,
    "date" date not null,
    "reason" text,
    "is_available" boolean default false,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."practitioner_exceptions" enable row level security;


  create table "public"."practitioner_payment_info" (
    "id" uuid not null default gen_random_uuid(),
    "practitioner_id" uuid not null,
    "payment_method" text not null,
    "phone_number" text,
    "bank_account_number" text,
    "bank_name" text,
    "account_holder_name" text not null,
    "is_verified" boolean default false,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."practitioner_payment_info" enable row level security;


  create table "public"."practitioner_payouts" (
    "id" uuid not null default gen_random_uuid(),
    "practitioner_id" uuid not null,
    "amount" integer not null,
    "currency" text default 'XOF'::text,
    "payment_method" text not null,
    "account_details" jsonb,
    "status" text default 'planned'::text,
    "period_start" date not null,
    "period_end" date not null,
    "created_at" timestamp with time zone default now(),
    "processed_at" timestamp with time zone,
    "batch_id" uuid,
    "net_amount" integer,
    "commission_amount" integer,
    "fees_amount" integer,
    "transaction_ids" text[]
      );


alter table "public"."practitioner_payouts" enable row level security;


  create table "public"."practitioner_rates" (
    "id" uuid not null default gen_random_uuid(),
    "practitioner_id" uuid not null,
    "service_type" text not null,
    "base_price" integer not null,
    "duration_minutes" integer default 60,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."practitioner_rates" enable row level security;


  create table "public"."practitioners" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "name" text not null,
    "specialty" text not null,
    "phone" text,
    "address" text,
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "available" boolean default true,
    "rating" numeric(3,2) default 0,
    "image" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "bio" text,
    "diplomas" text[],
    "languages" text[],
    "years_experience" integer default 0,
    "intervention_radius" integer default 10,
    "communes_served" text[],
    "is_online" boolean default false,
    "kyc_status" text default 'pending'::text,
    "kyc_comment" text,
    "kyc_validated_at" timestamp with time zone,
    "id_document_url" text,
    "license_number" text,
    "license_document_url" text,
    "insurance_document_url" text,
    "can_accept_missions" boolean default false,
    "id_document_expiry" date,
    "license_expiry" date,
    "insurance_expiry" date,
    "kyc_reviewed_by" uuid,
    "kyc_reviewed_at" timestamp with time zone,
    "practitioner_type" public.practitioner_type default 'autre'::public.practitioner_type,
    "session_types" text[],
    "intervention_zone" text,
    "certifications" text[]
      );


alter table "public"."practitioners" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null,
    "full_name" text,
    "phone" text,
    "gender" public.gender default 'non_specifie'::public.gender,
    "date_of_birth" date,
    "avatar_url" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "two_factor_enabled" boolean default false,
    "two_factor_secret" text
      );


alter table "public"."profiles" enable row level security;


  create table "public"."push_subscriptions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "endpoint" text not null,
    "p256dh" text not null,
    "auth" text not null,
    "user_agent" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."push_subscriptions" enable row level security;


  create table "public"."reconciliation_reports" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "period_start" timestamp with time zone not null,
    "period_end" timestamp with time zone not null,
    "status" text not null default 'in_progress'::text,
    "total_fedapay_transactions" integer not null default 0,
    "total_db_payments" integer not null default 0,
    "matched_count" integer not null default 0,
    "missing_in_db_count" integer not null default 0,
    "missing_in_fedapay_count" integer not null default 0,
    "amount_mismatch_count" integer not null default 0,
    "status_mismatch_count" integer not null default 0,
    "total_amount_discrepancy" integer not null default 0,
    "anomalies" jsonb,
    "recommendations" jsonb,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."reconciliation_reports" enable row level security;


  create table "public"."reviews" (
    "id" uuid not null default gen_random_uuid(),
    "appointment_id" text not null,
    "patient_id" uuid not null,
    "practitioner_id" text not null,
    "rating" integer not null,
    "comment" text,
    "created_at" timestamp with time zone default now(),
    "is_hidden" boolean default false,
    "moderation_reason" text,
    "moderated_by" uuid,
    "moderated_at" timestamp with time zone
      );


alter table "public"."reviews" enable row level security;


  create table "public"."saved_payment_methods" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "provider" text not null,
    "phone_number_masked" text not null,
    "phone_number_encrypted" text not null,
    "is_default" boolean default false,
    "consent_given_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."saved_payment_methods" enable row level security;


  create table "public"."search_activity_logs" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "session_id" text not null,
    "action_type" text not null,
    "practitioner_id" uuid,
    "search_filters" jsonb,
    "metadata" jsonb,
    "ip_address" inet,
    "user_agent" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."search_activity_logs" enable row level security;


  create table "public"."service_audit_log" (
    "id" uuid not null default gen_random_uuid(),
    "service_id" uuid,
    "action" text not null,
    "old_values" jsonb,
    "new_values" jsonb,
    "modified_by" uuid,
    "modified_at" timestamp with time zone default now()
      );


alter table "public"."service_audit_log" enable row level security;


  create table "public"."services" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "description" text,
    "category" text,
    "base_price" integer,
    "duration" integer,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."services" enable row level security;


  create table "public"."support_tickets" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "appointment_id" text,
    "subject" text not null,
    "description" text not null,
    "status" public.ticket_status default 'ouvert'::public.ticket_status,
    "attachments" text[],
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "assigned_to" uuid,
    "priority" text default 'medium'::text,
    "tags" text[],
    "resolved_at" timestamp with time zone
      );


alter table "public"."support_tickets" enable row level security;


  create table "public"."system_config" (
    "id" uuid not null default gen_random_uuid(),
    "key" text not null,
    "value" jsonb not null,
    "description" text,
    "updated_by" uuid,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."system_config" enable row level security;


  create table "public"."triage_results" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "score" integer not null,
    "urgency_level" text not null,
    "message" text,
    "recommendations" text[],
    "answers" jsonb,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."triage_results" enable row level security;


  create table "public"."user_consents" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "consent_type" public.consent_type not null,
    "is_accepted" boolean not null default false,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."user_consents" enable row level security;


  create table "public"."user_roles" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "role" public.app_role not null,
    "created_at" timestamp with time zone default now(),
    "created_by" uuid
      );


alter table "public"."user_roles" enable row level security;


  create table "public"."webhook_events" (
    "id" uuid not null default gen_random_uuid(),
    "event_id" text not null,
    "event_type" text not null,
    "payload" jsonb not null,
    "processed_at" timestamp with time zone default now(),
    "created_at" timestamp with time zone default now(),
    "processing_status" text default 'pending'::text,
    "retry_count" integer default 0,
    "last_retry_at" timestamp with time zone,
    "error_message" text,
    "error_stack" text
      );


alter table "public"."webhook_events" enable row level security;

CREATE UNIQUE INDEX addresses_pkey ON public.addresses USING btree (id);

CREATE UNIQUE INDEX admin_audit_logs_pkey ON public.admin_audit_logs USING btree (id);

CREATE UNIQUE INDEX appointments_pkey ON public.appointments USING btree (id);

CREATE UNIQUE INDEX care_notes_pkey ON public.care_notes USING btree (id);

CREATE UNIQUE INDEX care_notes_sharing_log_pkey ON public.care_notes_sharing_log USING btree (id);

CREATE UNIQUE INDEX consent_versions_consent_type_version_key ON public.consent_versions USING btree (consent_type, version);

CREATE UNIQUE INDEX consent_versions_pkey ON public.consent_versions USING btree (id);

CREATE UNIQUE INDEX consents_pkey ON public.consents USING btree (id);

CREATE UNIQUE INDEX consents_user_id_consent_type_key ON public.consents USING btree (user_id, consent_type);

CREATE UNIQUE INDEX consultation_reports_access_log_pkey ON public.consultation_reports_access_log USING btree (id);

CREATE UNIQUE INDEX consultation_reports_pkey ON public.consultation_reports USING btree (id);

CREATE UNIQUE INDEX dispute_messages_pkey ON public.dispute_messages USING btree (id);

CREATE UNIQUE INDEX disputes_pkey ON public.disputes USING btree (id);

CREATE UNIQUE INDEX emergency_contacts_pkey ON public.emergency_contacts USING btree (id);

CREATE UNIQUE INDEX faqs_pkey ON public.faqs USING btree (id);

CREATE UNIQUE INDEX file_access_logs_pkey ON public.file_access_logs USING btree (id);

CREATE UNIQUE INDEX files_file_path_key ON public.files USING btree (file_path);

CREATE UNIQUE INDEX files_pkey ON public.files USING btree (id);

CREATE UNIQUE INDEX group_session_participants_pkey ON public.group_session_participants USING btree (id);

CREATE UNIQUE INDEX group_session_participants_session_id_patient_id_key ON public.group_session_participants USING btree (session_id, patient_id);

CREATE UNIQUE INDEX group_sessions_pkey ON public.group_sessions USING btree (id);

CREATE INDEX idx_appointments_confirmation_requested ON public.appointments USING btree (confirmation_requested_at) WHERE (confirmation_requested_at IS NOT NULL);

CREATE INDEX idx_appointments_date_time ON public.appointments USING btree (date, "time");

CREATE INDEX idx_appointments_patient_id ON public.appointments USING btree (patient_id);

CREATE INDEX idx_appointments_patient_status ON public.appointments USING btree (patient_id, status);

CREATE INDEX idx_appointments_payment_expires_at ON public.appointments USING btree (payment_expires_at) WHERE (payment_expires_at IS NOT NULL);

CREATE INDEX idx_appointments_practitioner_id ON public.appointments USING btree (practitioner_id);

CREATE INDEX idx_appointments_practitioner_status ON public.appointments USING btree (practitioner_id, status);

CREATE INDEX idx_appointments_status ON public.appointments USING btree (status);

CREATE INDEX idx_audit_logs_admin ON public.admin_audit_logs USING btree (admin_id);

CREATE INDEX idx_audit_logs_created ON public.admin_audit_logs USING btree (created_at DESC);

CREATE INDEX idx_audit_logs_entity ON public.admin_audit_logs USING btree (entity_type, entity_id);

CREATE INDEX idx_file_access_logs_access_type ON public.file_access_logs USING btree (access_type);

CREATE INDEX idx_file_access_logs_created_at ON public.file_access_logs USING btree (created_at);

CREATE INDEX idx_file_access_logs_file_id ON public.file_access_logs USING btree (file_id);

CREATE INDEX idx_file_access_logs_user_id ON public.file_access_logs USING btree (user_id);

CREATE INDEX idx_files_created_at ON public.files USING btree (created_at);

CREATE INDEX idx_files_folder ON public.files USING btree (folder);

CREATE INDEX idx_files_storage_provider ON public.files USING btree (storage_provider);

CREATE INDEX idx_files_user_id ON public.files USING btree (user_id);

CREATE INDEX idx_group_session_participants_patient_id ON public.group_session_participants USING btree (patient_id);

CREATE INDEX idx_group_session_participants_payment_status ON public.group_session_participants USING btree (payment_status);

CREATE INDEX idx_group_session_participants_session_id ON public.group_session_participants USING btree (session_id);

CREATE INDEX idx_group_sessions_coach_id ON public.group_sessions USING btree (coach_id);

CREATE INDEX idx_group_sessions_scheduled_date ON public.group_sessions USING btree (scheduled_date);

CREATE INDEX idx_group_sessions_status ON public.group_sessions USING btree (status);

CREATE INDEX idx_messages_appointment_id ON public.messages USING btree (appointment_id);

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);

CREATE INDEX idx_messages_sender_id ON public.messages USING btree (sender_id);

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);

CREATE INDEX idx_otp_attempts_created_at ON public.otp_attempts USING btree (created_at DESC);

CREATE INDEX idx_otp_attempts_phone ON public.otp_attempts USING btree (phone_number);

CREATE INDEX idx_payment_attempts_appointment_id ON public.payment_attempts USING btree (appointment_id);

CREATE INDEX idx_payment_attempts_created_at ON public.payment_attempts USING btree (created_at DESC);

CREATE INDEX idx_payment_attempts_payment_id ON public.payment_attempts USING btree (payment_id);

CREATE INDEX idx_payment_attempts_status ON public.payment_attempts USING btree (status);

CREATE INDEX idx_payment_attempts_user_id ON public.payment_attempts USING btree (user_id);

CREATE INDEX idx_payment_events_created_at ON public.payment_events USING btree (created_at);

CREATE INDEX idx_payment_events_event_type ON public.payment_events USING btree (event_type);

CREATE INDEX idx_payment_events_payment_id ON public.payment_events USING btree (payment_id);

CREATE INDEX idx_payment_reconciliations_date ON public.payment_reconciliations USING btree (reconciled_at DESC);

CREATE INDEX idx_payment_reconciliations_payment_id ON public.payment_reconciliations USING btree (payment_id);

CREATE INDEX idx_payment_reconciliations_type ON public.payment_reconciliations USING btree (reconciliation_type);

CREATE INDEX idx_payments_appointment_id ON public.payments USING btree (appointment_id);

CREATE INDEX idx_payments_created_at ON public.payments USING btree (created_at DESC);

CREATE INDEX idx_payments_fedapay_transaction_id ON public.payments USING btree (fedapay_transaction_id);

CREATE INDEX idx_payments_idempotency_key ON public.payments USING btree (idempotency_key);

CREATE INDEX idx_payments_patient_id ON public.payments USING btree (patient_id);

CREATE INDEX idx_payments_patient_status ON public.payments USING btree (patient_id, status);

CREATE INDEX idx_payments_provider_ref ON public.payments USING btree (provider_ref);

CREATE INDEX idx_payments_status ON public.payments USING btree (status);

CREATE INDEX idx_payout_payments_payment ON public.payout_payments USING btree (payment_id);

CREATE INDEX idx_payout_payments_payout ON public.payout_payments USING btree (payout_id);

CREATE INDEX idx_practitioner_availability_lookup ON public.practitioner_availability USING btree (practitioner_id, day_of_week);

CREATE INDEX idx_practitioner_balances_practitioner_id ON public.practitioner_balances USING btree (practitioner_id);

CREATE INDEX idx_practitioner_balances_updated_at ON public.practitioner_balances USING btree (updated_at DESC);

CREATE INDEX idx_practitioner_payment_info_practitioner ON public.practitioner_payment_info USING btree (practitioner_id);

CREATE INDEX idx_practitioner_payouts_period ON public.practitioner_payouts USING btree (period_start, period_end);

CREATE INDEX idx_practitioner_payouts_practitioner ON public.practitioner_payouts USING btree (practitioner_id);

CREATE INDEX idx_practitioner_payouts_status ON public.practitioner_payouts USING btree (status);

CREATE INDEX idx_practitioners_available ON public.practitioners USING btree (available) WHERE (available = true);

CREATE INDEX idx_practitioners_kyc_status ON public.practitioners USING btree (kyc_status);

CREATE INDEX idx_practitioners_lat_lon ON public.practitioners USING btree (latitude, longitude) WHERE ((latitude IS NOT NULL) AND (longitude IS NOT NULL));

CREATE INDEX idx_profiles_phone ON public.profiles USING btree (phone) WHERE (phone IS NOT NULL);

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);

CREATE INDEX idx_reconciliation_reports_created_at ON public.reconciliation_reports USING btree (created_at DESC);

CREATE INDEX idx_reconciliation_reports_status ON public.reconciliation_reports USING btree (status);

CREATE INDEX idx_saved_payment_methods_user_id ON public.saved_payment_methods USING btree (user_id);

CREATE INDEX idx_search_activity_logs_action_type ON public.search_activity_logs USING btree (action_type);

CREATE INDEX idx_search_activity_logs_created_at ON public.search_activity_logs USING btree (created_at DESC);

CREATE INDEX idx_search_activity_logs_practitioner_id ON public.search_activity_logs USING btree (practitioner_id);

CREATE INDEX idx_search_activity_logs_user_id ON public.search_activity_logs USING btree (user_id);

CREATE INDEX idx_user_consents_user_id ON public.user_consents USING btree (user_id);

CREATE INDEX idx_webhook_events_created_at ON public.webhook_events USING btree (created_at);

CREATE INDEX idx_webhook_events_event_id ON public.webhook_events USING btree (event_id);

CREATE INDEX idx_webhook_events_retry ON public.webhook_events USING btree (processing_status, retry_count, last_retry_at) WHERE (processing_status = 'failed'::text);

CREATE UNIQUE INDEX ledger_accounts_owner_type_owner_id_account_type_currency_key ON public.ledger_accounts USING btree (owner_type, owner_id, account_type, currency);

CREATE UNIQUE INDEX ledger_accounts_pkey ON public.ledger_accounts USING btree (id);

CREATE UNIQUE INDEX ledger_entries_pkey ON public.ledger_entries USING btree (id);

CREATE UNIQUE INDEX medical_profiles_pkey ON public.medical_profiles USING btree (id);

CREATE UNIQUE INDEX medical_profiles_user_id_key ON public.medical_profiles USING btree (user_id);

CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id);

CREATE UNIQUE INDEX notification_preferences_pkey ON public.notification_preferences USING btree (id);

CREATE UNIQUE INDEX notification_preferences_user_id_key ON public.notification_preferences USING btree (user_id);

CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);

CREATE UNIQUE INDEX otp_attempts_pkey ON public.otp_attempts USING btree (id);

CREATE UNIQUE INDEX otp_rate_limits_pkey ON public.otp_rate_limits USING btree (phone_number);

CREATE UNIQUE INDEX payment_attempts_pkey ON public.payment_attempts USING btree (id);

CREATE UNIQUE INDEX payment_events_pkey ON public.payment_events USING btree (id);

CREATE UNIQUE INDEX payment_reconciliations_pkey ON public.payment_reconciliations USING btree (id);

CREATE UNIQUE INDEX payment_refunds_pkey ON public.payment_refunds USING btree (id);

CREATE UNIQUE INDEX payments_idempotency_key_key ON public.payments USING btree (idempotency_key);

CREATE UNIQUE INDEX payments_invoice_number_key ON public.payments USING btree (invoice_number);

CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id);

CREATE UNIQUE INDEX payout_batches_pkey ON public.payout_batches USING btree (id);

CREATE UNIQUE INDEX payout_payments_payout_id_payment_id_key ON public.payout_payments USING btree (payout_id, payment_id);

CREATE UNIQUE INDEX payout_payments_pkey ON public.payout_payments USING btree (id);

CREATE UNIQUE INDEX practitioner_availability_pkey ON public.practitioner_availability USING btree (id);

CREATE UNIQUE INDEX practitioner_availability_unique_slot ON public.practitioner_availability USING btree (practitioner_id, day_of_week, start_time, end_time);

CREATE UNIQUE INDEX practitioner_balances_pkey ON public.practitioner_balances USING btree (practitioner_id);

CREATE UNIQUE INDEX practitioner_exceptions_pkey ON public.practitioner_exceptions USING btree (id);

CREATE UNIQUE INDEX practitioner_payment_info_pkey ON public.practitioner_payment_info USING btree (id);

CREATE UNIQUE INDEX practitioner_payment_info_practitioner_id_payment_method_key ON public.practitioner_payment_info USING btree (practitioner_id, payment_method);

CREATE UNIQUE INDEX practitioner_payouts_pkey ON public.practitioner_payouts USING btree (id);

CREATE UNIQUE INDEX practitioner_rates_pkey ON public.practitioner_rates USING btree (id);

CREATE UNIQUE INDEX practitioners_pkey ON public.practitioners USING btree (id);

CREATE UNIQUE INDEX practitioners_user_id_key ON public.practitioners USING btree (user_id);

CREATE UNIQUE INDEX profiles_phone_unique ON public.profiles USING btree (phone);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX push_subscriptions_pkey ON public.push_subscriptions USING btree (id);

CREATE UNIQUE INDEX push_subscriptions_user_id_endpoint_key ON public.push_subscriptions USING btree (user_id, endpoint);

CREATE UNIQUE INDEX reconciliation_reports_pkey ON public.reconciliation_reports USING btree (id);

CREATE UNIQUE INDEX reviews_appointment_id_key ON public.reviews USING btree (appointment_id);

CREATE UNIQUE INDEX reviews_pkey ON public.reviews USING btree (id);

CREATE UNIQUE INDEX saved_payment_methods_pkey ON public.saved_payment_methods USING btree (id);

CREATE UNIQUE INDEX saved_payment_methods_user_id_phone_number_encrypted_key ON public.saved_payment_methods USING btree (user_id, phone_number_encrypted);

CREATE UNIQUE INDEX search_activity_logs_pkey ON public.search_activity_logs USING btree (id);

CREATE UNIQUE INDEX service_audit_log_pkey ON public.service_audit_log USING btree (id);

CREATE UNIQUE INDEX services_pkey ON public.services USING btree (id);

CREATE UNIQUE INDEX support_tickets_pkey ON public.support_tickets USING btree (id);

CREATE UNIQUE INDEX system_config_key_key ON public.system_config USING btree (key);

CREATE UNIQUE INDEX system_config_pkey ON public.system_config USING btree (id);

CREATE UNIQUE INDEX triage_results_pkey ON public.triage_results USING btree (id);

CREATE UNIQUE INDEX user_consents_pkey ON public.user_consents USING btree (id);

CREATE UNIQUE INDEX user_consents_user_consent_type_key ON public.user_consents USING btree (user_id, consent_type);

CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (id);

CREATE UNIQUE INDEX user_roles_user_id_role_key ON public.user_roles USING btree (user_id, role);

CREATE UNIQUE INDEX webhook_events_event_id_key ON public.webhook_events USING btree (event_id);

CREATE UNIQUE INDEX webhook_events_event_id_unique ON public.webhook_events USING btree (event_id);

CREATE UNIQUE INDEX webhook_events_pkey ON public.webhook_events USING btree (id);

alter table "public"."addresses" add constraint "addresses_pkey" PRIMARY KEY using index "addresses_pkey";

alter table "public"."admin_audit_logs" add constraint "admin_audit_logs_pkey" PRIMARY KEY using index "admin_audit_logs_pkey";

alter table "public"."appointments" add constraint "appointments_pkey" PRIMARY KEY using index "appointments_pkey";

alter table "public"."care_notes" add constraint "care_notes_pkey" PRIMARY KEY using index "care_notes_pkey";

alter table "public"."care_notes_sharing_log" add constraint "care_notes_sharing_log_pkey" PRIMARY KEY using index "care_notes_sharing_log_pkey";

alter table "public"."consent_versions" add constraint "consent_versions_pkey" PRIMARY KEY using index "consent_versions_pkey";

alter table "public"."consents" add constraint "consents_pkey" PRIMARY KEY using index "consents_pkey";

alter table "public"."consultation_reports" add constraint "consultation_reports_pkey" PRIMARY KEY using index "consultation_reports_pkey";

alter table "public"."consultation_reports_access_log" add constraint "consultation_reports_access_log_pkey" PRIMARY KEY using index "consultation_reports_access_log_pkey";

alter table "public"."dispute_messages" add constraint "dispute_messages_pkey" PRIMARY KEY using index "dispute_messages_pkey";

alter table "public"."disputes" add constraint "disputes_pkey" PRIMARY KEY using index "disputes_pkey";

alter table "public"."emergency_contacts" add constraint "emergency_contacts_pkey" PRIMARY KEY using index "emergency_contacts_pkey";

alter table "public"."faqs" add constraint "faqs_pkey" PRIMARY KEY using index "faqs_pkey";

alter table "public"."file_access_logs" add constraint "file_access_logs_pkey" PRIMARY KEY using index "file_access_logs_pkey";

alter table "public"."files" add constraint "files_pkey" PRIMARY KEY using index "files_pkey";

alter table "public"."group_session_participants" add constraint "group_session_participants_pkey" PRIMARY KEY using index "group_session_participants_pkey";

alter table "public"."group_sessions" add constraint "group_sessions_pkey" PRIMARY KEY using index "group_sessions_pkey";

alter table "public"."ledger_accounts" add constraint "ledger_accounts_pkey" PRIMARY KEY using index "ledger_accounts_pkey";

alter table "public"."ledger_entries" add constraint "ledger_entries_pkey" PRIMARY KEY using index "ledger_entries_pkey";

alter table "public"."medical_profiles" add constraint "medical_profiles_pkey" PRIMARY KEY using index "medical_profiles_pkey";

alter table "public"."messages" add constraint "messages_pkey" PRIMARY KEY using index "messages_pkey";

alter table "public"."notification_preferences" add constraint "notification_preferences_pkey" PRIMARY KEY using index "notification_preferences_pkey";

alter table "public"."notifications" add constraint "notifications_pkey" PRIMARY KEY using index "notifications_pkey";

alter table "public"."otp_attempts" add constraint "otp_attempts_pkey" PRIMARY KEY using index "otp_attempts_pkey";

alter table "public"."otp_rate_limits" add constraint "otp_rate_limits_pkey" PRIMARY KEY using index "otp_rate_limits_pkey";

alter table "public"."payment_attempts" add constraint "payment_attempts_pkey" PRIMARY KEY using index "payment_attempts_pkey";

alter table "public"."payment_events" add constraint "payment_events_pkey" PRIMARY KEY using index "payment_events_pkey";

alter table "public"."payment_reconciliations" add constraint "payment_reconciliations_pkey" PRIMARY KEY using index "payment_reconciliations_pkey";

alter table "public"."payment_refunds" add constraint "payment_refunds_pkey" PRIMARY KEY using index "payment_refunds_pkey";

alter table "public"."payments" add constraint "payments_pkey" PRIMARY KEY using index "payments_pkey";

alter table "public"."payout_batches" add constraint "payout_batches_pkey" PRIMARY KEY using index "payout_batches_pkey";

alter table "public"."payout_payments" add constraint "payout_payments_pkey" PRIMARY KEY using index "payout_payments_pkey";

alter table "public"."practitioner_availability" add constraint "practitioner_availability_pkey" PRIMARY KEY using index "practitioner_availability_pkey";

alter table "public"."practitioner_balances" add constraint "practitioner_balances_pkey" PRIMARY KEY using index "practitioner_balances_pkey";

alter table "public"."practitioner_exceptions" add constraint "practitioner_exceptions_pkey" PRIMARY KEY using index "practitioner_exceptions_pkey";

alter table "public"."practitioner_payment_info" add constraint "practitioner_payment_info_pkey" PRIMARY KEY using index "practitioner_payment_info_pkey";

alter table "public"."practitioner_payouts" add constraint "practitioner_payouts_pkey" PRIMARY KEY using index "practitioner_payouts_pkey";

alter table "public"."practitioner_rates" add constraint "practitioner_rates_pkey" PRIMARY KEY using index "practitioner_rates_pkey";

alter table "public"."practitioners" add constraint "practitioners_pkey" PRIMARY KEY using index "practitioners_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."push_subscriptions" add constraint "push_subscriptions_pkey" PRIMARY KEY using index "push_subscriptions_pkey";

alter table "public"."reconciliation_reports" add constraint "reconciliation_reports_pkey" PRIMARY KEY using index "reconciliation_reports_pkey";

alter table "public"."reviews" add constraint "reviews_pkey" PRIMARY KEY using index "reviews_pkey";

alter table "public"."saved_payment_methods" add constraint "saved_payment_methods_pkey" PRIMARY KEY using index "saved_payment_methods_pkey";

alter table "public"."search_activity_logs" add constraint "search_activity_logs_pkey" PRIMARY KEY using index "search_activity_logs_pkey";

alter table "public"."service_audit_log" add constraint "service_audit_log_pkey" PRIMARY KEY using index "service_audit_log_pkey";

alter table "public"."services" add constraint "services_pkey" PRIMARY KEY using index "services_pkey";

alter table "public"."support_tickets" add constraint "support_tickets_pkey" PRIMARY KEY using index "support_tickets_pkey";

alter table "public"."system_config" add constraint "system_config_pkey" PRIMARY KEY using index "system_config_pkey";

alter table "public"."triage_results" add constraint "triage_results_pkey" PRIMARY KEY using index "triage_results_pkey";

alter table "public"."user_consents" add constraint "user_consents_pkey" PRIMARY KEY using index "user_consents_pkey";

alter table "public"."user_roles" add constraint "user_roles_pkey" PRIMARY KEY using index "user_roles_pkey";

alter table "public"."webhook_events" add constraint "webhook_events_pkey" PRIMARY KEY using index "webhook_events_pkey";

alter table "public"."addresses" add constraint "addresses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."addresses" validate constraint "addresses_user_id_fkey";

alter table "public"."admin_audit_logs" add constraint "admin_audit_logs_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id) not valid;

alter table "public"."admin_audit_logs" validate constraint "admin_audit_logs_admin_id_fkey";

alter table "public"."appointments" add constraint "appointments_payment_amount_check" CHECK (((payment_amount IS NULL) OR (payment_amount >= 0))) not valid;

alter table "public"."appointments" validate constraint "appointments_payment_amount_check";

alter table "public"."appointments" add constraint "appointments_practitioner_status_check" CHECK ((practitioner_status = ANY (ARRAY['assigned'::text, 'preparing'::text, 'en_route'::text, 'arrived'::text, 'in_progress'::text]))) not valid;

alter table "public"."appointments" validate constraint "appointments_practitioner_status_check";

alter table "public"."appointments" add constraint "appointments_status_check" CHECK ((status = ANY (ARRAY['pending_payment'::text, 'awaiting_practitioner'::text, 'confirmed'::text, 'pending'::text, 'in-progress'::text, 'awaiting_confirmation'::text, 'completed'::text, 'cancelled_unpaid'::text, 'cancelled'::text, 'rejected'::text]))) not valid;

alter table "public"."appointments" validate constraint "appointments_status_check";

alter table "public"."appointments" add constraint "appointments_visit_status_check" CHECK ((visit_status = ANY (ARRAY['scheduled'::text, 'en_route'::text, 'arrived'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text]))) not valid;

alter table "public"."appointments" validate constraint "appointments_visit_status_check";

alter table "public"."care_notes" add constraint "care_notes_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) not valid;

alter table "public"."care_notes" validate constraint "care_notes_appointment_id_fkey";

alter table "public"."care_notes" add constraint "care_notes_practitioner_id_fkey" FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) not valid;

alter table "public"."care_notes" validate constraint "care_notes_practitioner_id_fkey";

alter table "public"."care_notes_sharing_log" add constraint "care_notes_sharing_log_care_note_id_fkey" FOREIGN KEY (care_note_id) REFERENCES public.care_notes(id) ON DELETE CASCADE not valid;

alter table "public"."care_notes_sharing_log" validate constraint "care_notes_sharing_log_care_note_id_fkey";

alter table "public"."consent_versions" add constraint "consent_versions_consent_type_version_key" UNIQUE using index "consent_versions_consent_type_version_key";

alter table "public"."consent_versions" add constraint "consent_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."consent_versions" validate constraint "consent_versions_created_by_fkey";

alter table "public"."consents" add constraint "consents_user_id_consent_type_key" UNIQUE using index "consents_user_id_consent_type_key";

alter table "public"."consents" add constraint "consents_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."consents" validate constraint "consents_user_id_fkey";

alter table "public"."consultation_reports_access_log" add constraint "consultation_reports_access_log_report_id_fkey" FOREIGN KEY (report_id) REFERENCES public.consultation_reports(id) ON DELETE CASCADE not valid;

alter table "public"."consultation_reports_access_log" validate constraint "consultation_reports_access_log_report_id_fkey";

alter table "public"."dispute_messages" add constraint "dispute_messages_dispute_id_fkey" FOREIGN KEY (dispute_id) REFERENCES public.disputes(id) ON DELETE CASCADE not valid;

alter table "public"."dispute_messages" validate constraint "dispute_messages_dispute_id_fkey";

alter table "public"."dispute_messages" add constraint "dispute_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id) not valid;

alter table "public"."dispute_messages" validate constraint "dispute_messages_sender_id_fkey";

alter table "public"."disputes" add constraint "disputes_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) not valid;

alter table "public"."disputes" validate constraint "disputes_appointment_id_fkey";

alter table "public"."disputes" add constraint "disputes_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) not valid;

alter table "public"."disputes" validate constraint "disputes_assigned_to_fkey";

alter table "public"."disputes" add constraint "disputes_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))) not valid;

alter table "public"."disputes" validate constraint "disputes_priority_check";

alter table "public"."disputes" add constraint "disputes_raised_by_fkey" FOREIGN KEY (raised_by) REFERENCES auth.users(id) not valid;

alter table "public"."disputes" validate constraint "disputes_raised_by_fkey";

alter table "public"."disputes" add constraint "disputes_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'investigating'::text, 'resolved'::text, 'closed'::text]))) not valid;

alter table "public"."disputes" validate constraint "disputes_status_check";

alter table "public"."emergency_contacts" add constraint "emergency_contacts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."emergency_contacts" validate constraint "emergency_contacts_user_id_fkey";

alter table "public"."faqs" add constraint "faqs_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."faqs" validate constraint "faqs_created_by_fkey";

alter table "public"."faqs" add constraint "faqs_target_audience_check" CHECK ((target_audience = ANY (ARRAY['all'::text, 'patients'::text, 'practitioners'::text]))) not valid;

alter table "public"."faqs" validate constraint "faqs_target_audience_check";

alter table "public"."faqs" add constraint "faqs_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."faqs" validate constraint "faqs_updated_by_fkey";

alter table "public"."file_access_logs" add constraint "file_access_logs_access_type_check" CHECK (((access_type)::text = ANY ((ARRAY['view'::character varying, 'download'::character varying, 'share'::character varying])::text[]))) not valid;

alter table "public"."file_access_logs" validate constraint "file_access_logs_access_type_check";

alter table "public"."file_access_logs" add constraint "file_access_logs_file_id_fkey" FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE not valid;

alter table "public"."file_access_logs" validate constraint "file_access_logs_file_id_fkey";

alter table "public"."file_access_logs" add constraint "file_access_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."file_access_logs" validate constraint "file_access_logs_user_id_fkey";

alter table "public"."files" add constraint "files_file_path_key" UNIQUE using index "files_file_path_key";

alter table "public"."files" add constraint "files_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."files" validate constraint "files_user_id_fkey";

alter table "public"."group_session_participants" add constraint "group_session_participants_payment_status_check" CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'refunded'::text]))) not valid;

alter table "public"."group_session_participants" validate constraint "group_session_participants_payment_status_check";

alter table "public"."group_session_participants" add constraint "group_session_participants_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.group_sessions(id) ON DELETE CASCADE not valid;

alter table "public"."group_session_participants" validate constraint "group_session_participants_session_id_fkey";

alter table "public"."group_session_participants" add constraint "group_session_participants_session_id_patient_id_key" UNIQUE using index "group_session_participants_session_id_patient_id_key";

alter table "public"."group_sessions" add constraint "group_sessions_coach_id_fkey" FOREIGN KEY (coach_id) REFERENCES public.practitioners(id) ON DELETE CASCADE not valid;

alter table "public"."group_sessions" validate constraint "group_sessions_coach_id_fkey";

alter table "public"."group_sessions" add constraint "group_sessions_price_per_person_check" CHECK ((price_per_person >= 10000)) not valid;

alter table "public"."group_sessions" validate constraint "group_sessions_price_per_person_check";

alter table "public"."group_sessions" add constraint "group_sessions_session_type_check" CHECK ((session_type = ANY (ARRAY['individuelle'::text, 'duo'::text, 'groupe'::text]))) not valid;

alter table "public"."group_sessions" validate constraint "group_sessions_session_type_check";

alter table "public"."group_sessions" add constraint "group_sessions_status_check" CHECK ((status = ANY (ARRAY['planifiee'::text, 'confirmee'::text, 'annulee'::text, 'terminee'::text]))) not valid;

alter table "public"."group_sessions" validate constraint "group_sessions_status_check";

alter table "public"."ledger_accounts" add constraint "ledger_accounts_owner_type_owner_id_account_type_currency_key" UNIQUE using index "ledger_accounts_owner_type_owner_id_account_type_currency_key";

alter table "public"."ledger_entries" add constraint "ledger_entries_account_id_fkey" FOREIGN KEY (account_id) REFERENCES public.ledger_accounts(id) not valid;

alter table "public"."ledger_entries" validate constraint "ledger_entries_account_id_fkey";

alter table "public"."ledger_entries" add constraint "ledger_entries_check" CHECK (((debit >= 0) AND (credit >= 0))) not valid;

alter table "public"."ledger_entries" validate constraint "ledger_entries_check";

alter table "public"."ledger_entries" add constraint "ledger_entries_check1" CHECK ((NOT ((debit > 0) AND (credit > 0)))) not valid;

alter table "public"."ledger_entries" validate constraint "ledger_entries_check1";

alter table "public"."medical_profiles" add constraint "medical_profiles_primary_doctor_id_fkey" FOREIGN KEY (primary_doctor_id) REFERENCES public.practitioners(id) ON DELETE SET NULL not valid;

alter table "public"."medical_profiles" validate constraint "medical_profiles_primary_doctor_id_fkey";

alter table "public"."medical_profiles" add constraint "medical_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."medical_profiles" validate constraint "medical_profiles_user_id_fkey";

alter table "public"."medical_profiles" add constraint "medical_profiles_user_id_key" UNIQUE using index "medical_profiles_user_id_key";

alter table "public"."messages" add constraint "messages_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_appointment_id_fkey";

alter table "public"."messages" add constraint "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_sender_id_fkey";

alter table "public"."notification_preferences" add constraint "notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."notification_preferences" validate constraint "notification_preferences_user_id_fkey";

alter table "public"."notification_preferences" add constraint "notification_preferences_user_id_key" UNIQUE using index "notification_preferences_user_id_key";

alter table "public"."notifications" add constraint "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_user_id_fkey";

alter table "public"."payment_attempts" add constraint "payment_attempts_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE not valid;

alter table "public"."payment_attempts" validate constraint "payment_attempts_payment_id_fkey";

alter table "public"."payment_attempts" add constraint "payment_attempts_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'success'::text, 'failed'::text, 'timeout'::text]))) not valid;

alter table "public"."payment_attempts" validate constraint "payment_attempts_status_check";

alter table "public"."payment_events" add constraint "payment_events_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE not valid;

alter table "public"."payment_events" validate constraint "payment_events_payment_id_fkey";

alter table "public"."payment_reconciliations" add constraint "payment_reconciliations_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE not valid;

alter table "public"."payment_reconciliations" validate constraint "payment_reconciliations_payment_id_fkey";

alter table "public"."payment_reconciliations" add constraint "payment_reconciliations_reconciliation_type_check" CHECK ((reconciliation_type = ANY (ARRAY['status_mismatch'::text, 'manual'::text, 'webhook_replay'::text]))) not valid;

alter table "public"."payment_reconciliations" validate constraint "payment_reconciliations_reconciliation_type_check";

alter table "public"."payment_refunds" add constraint "payment_refunds_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES public.payments(id) not valid;

alter table "public"."payment_refunds" validate constraint "payment_refunds_payment_id_fkey";

alter table "public"."payments" add constraint "payments_channel_check" CHECK ((channel = ANY (ARRAY['card'::text, 'momo'::text]))) not valid;

alter table "public"."payments" validate constraint "payments_channel_check";

alter table "public"."payments" add constraint "payments_idempotency_key_key" UNIQUE using index "payments_idempotency_key_key";

alter table "public"."payments" add constraint "payments_invoice_number_key" UNIQUE using index "payments_invoice_number_key";

alter table "public"."payments" add constraint "payments_payout_status_check" CHECK ((payout_status = ANY (ARRAY['pending'::text, 'held'::text, 'ready'::text, 'paid'::text, 'failed'::text]))) not valid;

alter table "public"."payments" validate constraint "payments_payout_status_check";

alter table "public"."payout_payments" add constraint "payout_payments_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE not valid;

alter table "public"."payout_payments" validate constraint "payout_payments_payment_id_fkey";

alter table "public"."payout_payments" add constraint "payout_payments_payout_id_fkey" FOREIGN KEY (payout_id) REFERENCES public.practitioner_payouts(id) ON DELETE CASCADE not valid;

alter table "public"."payout_payments" validate constraint "payout_payments_payout_id_fkey";

alter table "public"."payout_payments" add constraint "payout_payments_payout_id_payment_id_key" UNIQUE using index "payout_payments_payout_id_payment_id_key";

alter table "public"."practitioner_availability" add constraint "practitioner_availability_day_of_week_check" CHECK (((day_of_week >= 0) AND (day_of_week <= 6))) not valid;

alter table "public"."practitioner_availability" validate constraint "practitioner_availability_day_of_week_check";

alter table "public"."practitioner_availability" add constraint "practitioner_availability_practitioner_id_fkey" FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) ON DELETE CASCADE not valid;

alter table "public"."practitioner_availability" validate constraint "practitioner_availability_practitioner_id_fkey";

alter table "public"."practitioner_availability" add constraint "practitioner_availability_unique_slot" UNIQUE using index "practitioner_availability_unique_slot";

alter table "public"."practitioner_balances" add constraint "practitioner_balances_practitioner_id_fkey" FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) not valid;

alter table "public"."practitioner_balances" validate constraint "practitioner_balances_practitioner_id_fkey";

alter table "public"."practitioner_exceptions" add constraint "practitioner_exceptions_practitioner_id_fkey" FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) ON DELETE CASCADE not valid;

alter table "public"."practitioner_exceptions" validate constraint "practitioner_exceptions_practitioner_id_fkey";

alter table "public"."practitioner_payment_info" add constraint "practitioner_payment_info_payment_method_check" CHECK ((payment_method = ANY (ARRAY['mtn'::text, 'orange'::text, 'moov'::text, 'bank'::text]))) not valid;

alter table "public"."practitioner_payment_info" validate constraint "practitioner_payment_info_payment_method_check";

alter table "public"."practitioner_payment_info" add constraint "practitioner_payment_info_practitioner_id_fkey" FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) ON DELETE CASCADE not valid;

alter table "public"."practitioner_payment_info" validate constraint "practitioner_payment_info_practitioner_id_fkey";

alter table "public"."practitioner_payment_info" add constraint "practitioner_payment_info_practitioner_id_payment_method_key" UNIQUE using index "practitioner_payment_info_practitioner_id_payment_method_key";

alter table "public"."practitioner_payouts" add constraint "practitioner_payouts_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES public.payout_batches(id) not valid;

alter table "public"."practitioner_payouts" validate constraint "practitioner_payouts_batch_id_fkey";

alter table "public"."practitioner_payouts" add constraint "practitioner_payouts_practitioner_id_fkey" FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) not valid;

alter table "public"."practitioner_payouts" validate constraint "practitioner_payouts_practitioner_id_fkey";

alter table "public"."practitioner_payouts" add constraint "practitioner_payouts_status_check" CHECK ((status = ANY (ARRAY['planned'::text, 'sent'::text, 'completed'::text, 'failed'::text]))) not valid;

alter table "public"."practitioner_payouts" validate constraint "practitioner_payouts_status_check";

alter table "public"."practitioner_rates" add constraint "practitioner_rates_practitioner_id_fkey" FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) ON DELETE CASCADE not valid;

alter table "public"."practitioner_rates" validate constraint "practitioner_rates_practitioner_id_fkey";

alter table "public"."practitioners" add constraint "practitioners_kyc_reviewed_by_fkey" FOREIGN KEY (kyc_reviewed_by) REFERENCES auth.users(id) not valid;

alter table "public"."practitioners" validate constraint "practitioners_kyc_reviewed_by_fkey";

alter table "public"."practitioners" add constraint "practitioners_kyc_status_check" CHECK ((kyc_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'incomplete'::text]))) not valid;

alter table "public"."practitioners" validate constraint "practitioners_kyc_status_check";

alter table "public"."practitioners" add constraint "practitioners_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."practitioners" validate constraint "practitioners_user_id_fkey";

alter table "public"."practitioners" add constraint "practitioners_user_id_key" UNIQUE using index "practitioners_user_id_key";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."profiles" add constraint "profiles_phone_unique" UNIQUE using index "profiles_phone_unique";

alter table "public"."push_subscriptions" add constraint "push_subscriptions_user_id_endpoint_key" UNIQUE using index "push_subscriptions_user_id_endpoint_key";

alter table "public"."push_subscriptions" add constraint "push_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."push_subscriptions" validate constraint "push_subscriptions_user_id_fkey";

alter table "public"."reconciliation_reports" add constraint "reconciliation_reports_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."reconciliation_reports" validate constraint "reconciliation_reports_created_by_fkey";

alter table "public"."reviews" add constraint "reviews_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE not valid;

alter table "public"."reviews" validate constraint "reviews_appointment_id_fkey";

alter table "public"."reviews" add constraint "reviews_appointment_id_key" UNIQUE using index "reviews_appointment_id_key";

alter table "public"."reviews" add constraint "reviews_moderated_by_fkey" FOREIGN KEY (moderated_by) REFERENCES auth.users(id) not valid;

alter table "public"."reviews" validate constraint "reviews_moderated_by_fkey";

alter table "public"."reviews" add constraint "reviews_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."reviews" validate constraint "reviews_patient_id_fkey";

alter table "public"."reviews" add constraint "reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))) not valid;

alter table "public"."reviews" validate constraint "reviews_rating_check";

alter table "public"."saved_payment_methods" add constraint "saved_payment_methods_provider_check" CHECK ((provider = ANY (ARRAY['mtn'::text, 'orange'::text, 'moov'::text]))) not valid;

alter table "public"."saved_payment_methods" validate constraint "saved_payment_methods_provider_check";

alter table "public"."saved_payment_methods" add constraint "saved_payment_methods_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."saved_payment_methods" validate constraint "saved_payment_methods_user_id_fkey";

alter table "public"."saved_payment_methods" add constraint "saved_payment_methods_user_id_phone_number_encrypted_key" UNIQUE using index "saved_payment_methods_user_id_phone_number_encrypted_key";

alter table "public"."search_activity_logs" add constraint "search_activity_logs_practitioner_id_fkey" FOREIGN KEY (practitioner_id) REFERENCES public.practitioners(id) ON DELETE SET NULL not valid;

alter table "public"."search_activity_logs" validate constraint "search_activity_logs_practitioner_id_fkey";

alter table "public"."search_activity_logs" add constraint "search_activity_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."search_activity_logs" validate constraint "search_activity_logs_user_id_fkey";

alter table "public"."service_audit_log" add constraint "service_audit_log_action_check" CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text]))) not valid;

alter table "public"."service_audit_log" validate constraint "service_audit_log_action_check";

alter table "public"."service_audit_log" add constraint "service_audit_log_service_id_fkey" FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL not valid;

alter table "public"."service_audit_log" validate constraint "service_audit_log_service_id_fkey";

alter table "public"."support_tickets" add constraint "support_tickets_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL not valid;

alter table "public"."support_tickets" validate constraint "support_tickets_appointment_id_fkey";

alter table "public"."support_tickets" add constraint "support_tickets_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) not valid;

alter table "public"."support_tickets" validate constraint "support_tickets_assigned_to_fkey";

alter table "public"."support_tickets" add constraint "support_tickets_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))) not valid;

alter table "public"."support_tickets" validate constraint "support_tickets_priority_check";

alter table "public"."support_tickets" add constraint "support_tickets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."support_tickets" validate constraint "support_tickets_user_id_fkey";

alter table "public"."system_config" add constraint "system_config_key_key" UNIQUE using index "system_config_key_key";

alter table "public"."system_config" add constraint "system_config_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."system_config" validate constraint "system_config_updated_by_fkey";

alter table "public"."triage_results" add constraint "triage_results_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."triage_results" validate constraint "triage_results_user_id_fkey";

alter table "public"."user_consents" add constraint "user_consents_user_consent_type_key" UNIQUE using index "user_consents_user_consent_type_key";

alter table "public"."user_consents" add constraint "user_consents_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_consents" validate constraint "user_consents_user_id_fkey";

alter table "public"."user_roles" add constraint "user_roles_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."user_roles" validate constraint "user_roles_created_by_fkey";

alter table "public"."user_roles" add constraint "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_roles" validate constraint "user_roles_user_id_fkey";

alter table "public"."user_roles" add constraint "user_roles_user_id_role_key" UNIQUE using index "user_roles_user_id_role_key";

alter table "public"."webhook_events" add constraint "webhook_events_event_id_key" UNIQUE using index "webhook_events_event_id_key";

alter table "public"."webhook_events" add constraint "webhook_events_event_id_unique" UNIQUE using index "webhook_events_event_id_unique";

alter table "public"."webhook_events" add constraint "webhook_events_processing_status_check" CHECK ((processing_status = ANY (ARRAY['pending'::text, 'processing'::text, 'success'::text, 'failed'::text, 'permanently_failed'::text]))) not valid;

alter table "public"."webhook_events" validate constraint "webhook_events_processing_status_check";

set check_function_bodies = off;

create or replace view "public"."admin_dashboard_stats" as  SELECT patients_count,
    practitioners_count,
    appointments_count,
    total_revenue
   FROM public.get_admin_dashboard_stats() get_admin_dashboard_stats(patients_count, practitioners_count, appointments_count, total_revenue);


create or replace view "public"."admin_finance_stats" as  SELECT sum(
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


CREATE OR REPLACE FUNCTION public.approve_practitioner_kyc(p_user_id uuid, p_reviewed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.auto_confirm_consultations()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_real_duration(started_at timestamp with time zone, ended_at timestamp with time zone, default_duration integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  IF started_at IS NOT NULL AND ended_at IS NOT NULL THEN
    RETURN EXTRACT(EPOCH FROM (ended_at - started_at)) / 60;
  END IF;
  RETURN default_duration;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_otp_rate_limit(phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.check_overdue_disputes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.check_phone_uniqueness()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_payment_slots()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_file_access_logs()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.file_access_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_otp_attempts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.otp_attempts
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_otp_rate_limits()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM otp_rate_limits
  WHERE first_attempt_at < NOW() - INTERVAL '7 days'
    AND (blocked_until IS NULL OR blocked_until < NOW());
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_payment_attempts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.payment_attempts
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_search_activity_logs()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.search_activity_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_orphan_accounts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted_count integer := 0;
  v_orphan_user RECORD;
BEGIN
  -- Trouver les utilisateurs sans profil créés il y a plus de 24h
  FOR v_orphan_user IN
    SELECT u.id, u.email, u.created_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
    AND u.created_at < NOW() - INTERVAL '24 hours'
  LOOP
    -- Vérifier s'il n'est pas praticien non plus
    IF NOT EXISTS (SELECT 1 FROM practitioners WHERE user_id = v_orphan_user.id) THEN
      -- Supprimer l'utilisateur orphelin
      DELETE FROM auth.users WHERE id = v_orphan_user.id;
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
$function$
;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
 RETURNS TABLE(patients_count bigint, practitioners_count bigint, appointments_count bigint, total_revenue bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_practitioner_id_for_user(p_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM practitioners WHERE user_id = p_user_id LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_practitioners()
 RETURNS TABLE(id uuid, name text, specialty text, practitioner_type public.practitioner_type, rating numeric, available boolean, years_experience integer, bio text, languages text[], communes_served text[], intervention_zone text, intervention_radius integer, certifications text[], session_types text[], image text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user_safe()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$
;

create or replace view "public"."homepage_stats" as  SELECT ( SELECT count(*) AS count
           FROM public.practitioners
          WHERE ((practitioners.kyc_status = 'approved'::text) AND (practitioners.available = true))) AS practitioners_count,
    ((( SELECT count(*) AS count
           FROM public.profiles) - ( SELECT count(*) AS count
           FROM public.practitioners)) - ( SELECT count(DISTINCT user_roles.user_id) AS count
           FROM public.user_roles)) AS patients_count;


CREATE OR REPLACE FUNCTION public.initialize_payment_balance(p_payment_id uuid, p_practitioner_id uuid, p_net_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
  )
$function$
;

CREATE OR REPLACE FUNCTION public.log_care_notes_sharing_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.shared_with_patient IS DISTINCT FROM NEW.shared_with_patient THEN
    INSERT INTO care_notes_sharing_log (care_note_id, practitioner_id, old_shared_value, new_shared_value)
    VALUES (NEW.id, NEW.practitioner_id, OLD.shared_with_patient, NEW.shared_with_patient);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_service_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.mask_appointment_internal_notes(appointment_row public.appointments)
 RETURNS public.appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

create or replace view "public"."payment_events_sanitized" as  SELECT id,
    payment_id,
    event_type,
    created_at,
        CASE
            WHEN (event_data IS NOT NULL) THEN jsonb_build_object('status', (event_data ->> 'status'::text), 'amount', (event_data ->> 'amount'::text), 'timestamp', (event_data ->> 'timestamp'::text))
            ELSE NULL::jsonb
        END AS event_data_safe
   FROM public.payment_events;


create or replace view "public"."practitioners_public_view" as  SELECT id,
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


CREATE OR REPLACE FUNCTION public.promote_to_super_admin(user_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_result jsonb;
BEGIN
  -- Récupérer l'ID de l'utilisateur par email
  SELECT id INTO v_user_id
  FROM auth.users
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
$function$
;

CREATE OR REPLACE FUNCTION public.repair_missing_profiles()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    FROM auth.users u
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
$function$
;

CREATE OR REPLACE FUNCTION public.repair_practitioner_balances()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.request_consultation_confirmation()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.reserve_group_session_spot(p_session_id uuid, p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.round_coordinates(lat numeric, lng numeric, precision_level text DEFAULT 'neighborhood'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.invoice_number IS NULL AND NEW.status IN ('paid', 'completed') THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_all_practitioner_balances()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.sync_practitioner_balance_from_payments(p_practitioner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_cleanup_otp_attempts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Nettoyer les anciennes entrées après chaque insertion
  -- En production, utiliser pg_cron ou un job externe
  PERFORM public.cleanup_old_otp_attempts();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_files_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_payment_with_balance(p_payment_id uuid, p_practitioner_id uuid, p_net_amount integer, p_new_status text, p_new_payout_status text, p_hold_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_practitioner_balance_atomic(p_practitioner_id uuid, p_delta_available integer DEFAULT 0, p_delta_pending integer DEFAULT 0, p_delta_on_hold integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_practitioner_balance_on_payment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_practitioner_balance_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_session_participants_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_coach_for_group_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

grant delete on table "public"."addresses" to "anon";

grant insert on table "public"."addresses" to "anon";

grant references on table "public"."addresses" to "anon";

grant select on table "public"."addresses" to "anon";

grant trigger on table "public"."addresses" to "anon";

grant truncate on table "public"."addresses" to "anon";

grant update on table "public"."addresses" to "anon";

grant delete on table "public"."addresses" to "authenticated";

grant insert on table "public"."addresses" to "authenticated";

grant references on table "public"."addresses" to "authenticated";

grant select on table "public"."addresses" to "authenticated";

grant trigger on table "public"."addresses" to "authenticated";

grant truncate on table "public"."addresses" to "authenticated";

grant update on table "public"."addresses" to "authenticated";

grant delete on table "public"."addresses" to "service_role";

grant insert on table "public"."addresses" to "service_role";

grant references on table "public"."addresses" to "service_role";

grant select on table "public"."addresses" to "service_role";

grant trigger on table "public"."addresses" to "service_role";

grant truncate on table "public"."addresses" to "service_role";

grant update on table "public"."addresses" to "service_role";

grant delete on table "public"."admin_audit_logs" to "anon";

grant insert on table "public"."admin_audit_logs" to "anon";

grant references on table "public"."admin_audit_logs" to "anon";

grant select on table "public"."admin_audit_logs" to "anon";

grant trigger on table "public"."admin_audit_logs" to "anon";

grant truncate on table "public"."admin_audit_logs" to "anon";

grant update on table "public"."admin_audit_logs" to "anon";

grant delete on table "public"."admin_audit_logs" to "authenticated";

grant insert on table "public"."admin_audit_logs" to "authenticated";

grant references on table "public"."admin_audit_logs" to "authenticated";

grant select on table "public"."admin_audit_logs" to "authenticated";

grant trigger on table "public"."admin_audit_logs" to "authenticated";

grant truncate on table "public"."admin_audit_logs" to "authenticated";

grant update on table "public"."admin_audit_logs" to "authenticated";

grant delete on table "public"."admin_audit_logs" to "service_role";

grant insert on table "public"."admin_audit_logs" to "service_role";

grant references on table "public"."admin_audit_logs" to "service_role";

grant select on table "public"."admin_audit_logs" to "service_role";

grant trigger on table "public"."admin_audit_logs" to "service_role";

grant truncate on table "public"."admin_audit_logs" to "service_role";

grant update on table "public"."admin_audit_logs" to "service_role";

grant delete on table "public"."appointments" to "anon";

grant insert on table "public"."appointments" to "anon";

grant references on table "public"."appointments" to "anon";

grant select on table "public"."appointments" to "anon";

grant trigger on table "public"."appointments" to "anon";

grant truncate on table "public"."appointments" to "anon";

grant update on table "public"."appointments" to "anon";

grant delete on table "public"."appointments" to "authenticated";

grant insert on table "public"."appointments" to "authenticated";

grant references on table "public"."appointments" to "authenticated";

grant select on table "public"."appointments" to "authenticated";

grant trigger on table "public"."appointments" to "authenticated";

grant truncate on table "public"."appointments" to "authenticated";

grant update on table "public"."appointments" to "authenticated";

grant delete on table "public"."appointments" to "service_role";

grant insert on table "public"."appointments" to "service_role";

grant references on table "public"."appointments" to "service_role";

grant select on table "public"."appointments" to "service_role";

grant trigger on table "public"."appointments" to "service_role";

grant truncate on table "public"."appointments" to "service_role";

grant update on table "public"."appointments" to "service_role";

grant delete on table "public"."care_notes" to "anon";

grant insert on table "public"."care_notes" to "anon";

grant references on table "public"."care_notes" to "anon";

grant select on table "public"."care_notes" to "anon";

grant trigger on table "public"."care_notes" to "anon";

grant truncate on table "public"."care_notes" to "anon";

grant update on table "public"."care_notes" to "anon";

grant delete on table "public"."care_notes" to "authenticated";

grant insert on table "public"."care_notes" to "authenticated";

grant references on table "public"."care_notes" to "authenticated";

grant select on table "public"."care_notes" to "authenticated";

grant trigger on table "public"."care_notes" to "authenticated";

grant truncate on table "public"."care_notes" to "authenticated";

grant update on table "public"."care_notes" to "authenticated";

grant delete on table "public"."care_notes" to "service_role";

grant insert on table "public"."care_notes" to "service_role";

grant references on table "public"."care_notes" to "service_role";

grant select on table "public"."care_notes" to "service_role";

grant trigger on table "public"."care_notes" to "service_role";

grant truncate on table "public"."care_notes" to "service_role";

grant update on table "public"."care_notes" to "service_role";

grant delete on table "public"."care_notes_sharing_log" to "anon";

grant insert on table "public"."care_notes_sharing_log" to "anon";

grant references on table "public"."care_notes_sharing_log" to "anon";

grant select on table "public"."care_notes_sharing_log" to "anon";

grant trigger on table "public"."care_notes_sharing_log" to "anon";

grant truncate on table "public"."care_notes_sharing_log" to "anon";

grant update on table "public"."care_notes_sharing_log" to "anon";

grant delete on table "public"."care_notes_sharing_log" to "authenticated";

grant insert on table "public"."care_notes_sharing_log" to "authenticated";

grant references on table "public"."care_notes_sharing_log" to "authenticated";

grant select on table "public"."care_notes_sharing_log" to "authenticated";

grant trigger on table "public"."care_notes_sharing_log" to "authenticated";

grant truncate on table "public"."care_notes_sharing_log" to "authenticated";

grant update on table "public"."care_notes_sharing_log" to "authenticated";

grant delete on table "public"."care_notes_sharing_log" to "service_role";

grant insert on table "public"."care_notes_sharing_log" to "service_role";

grant references on table "public"."care_notes_sharing_log" to "service_role";

grant select on table "public"."care_notes_sharing_log" to "service_role";

grant trigger on table "public"."care_notes_sharing_log" to "service_role";

grant truncate on table "public"."care_notes_sharing_log" to "service_role";

grant update on table "public"."care_notes_sharing_log" to "service_role";

grant delete on table "public"."consent_versions" to "anon";

grant insert on table "public"."consent_versions" to "anon";

grant references on table "public"."consent_versions" to "anon";

grant select on table "public"."consent_versions" to "anon";

grant trigger on table "public"."consent_versions" to "anon";

grant truncate on table "public"."consent_versions" to "anon";

grant update on table "public"."consent_versions" to "anon";

grant delete on table "public"."consent_versions" to "authenticated";

grant insert on table "public"."consent_versions" to "authenticated";

grant references on table "public"."consent_versions" to "authenticated";

grant select on table "public"."consent_versions" to "authenticated";

grant trigger on table "public"."consent_versions" to "authenticated";

grant truncate on table "public"."consent_versions" to "authenticated";

grant update on table "public"."consent_versions" to "authenticated";

grant delete on table "public"."consent_versions" to "service_role";

grant insert on table "public"."consent_versions" to "service_role";

grant references on table "public"."consent_versions" to "service_role";

grant select on table "public"."consent_versions" to "service_role";

grant trigger on table "public"."consent_versions" to "service_role";

grant truncate on table "public"."consent_versions" to "service_role";

grant update on table "public"."consent_versions" to "service_role";

grant delete on table "public"."consents" to "anon";

grant insert on table "public"."consents" to "anon";

grant references on table "public"."consents" to "anon";

grant select on table "public"."consents" to "anon";

grant trigger on table "public"."consents" to "anon";

grant truncate on table "public"."consents" to "anon";

grant update on table "public"."consents" to "anon";

grant delete on table "public"."consents" to "authenticated";

grant insert on table "public"."consents" to "authenticated";

grant references on table "public"."consents" to "authenticated";

grant select on table "public"."consents" to "authenticated";

grant trigger on table "public"."consents" to "authenticated";

grant truncate on table "public"."consents" to "authenticated";

grant update on table "public"."consents" to "authenticated";

grant delete on table "public"."consents" to "service_role";

grant insert on table "public"."consents" to "service_role";

grant references on table "public"."consents" to "service_role";

grant select on table "public"."consents" to "service_role";

grant trigger on table "public"."consents" to "service_role";

grant truncate on table "public"."consents" to "service_role";

grant update on table "public"."consents" to "service_role";

grant delete on table "public"."consultation_reports" to "anon";

grant insert on table "public"."consultation_reports" to "anon";

grant references on table "public"."consultation_reports" to "anon";

grant select on table "public"."consultation_reports" to "anon";

grant trigger on table "public"."consultation_reports" to "anon";

grant truncate on table "public"."consultation_reports" to "anon";

grant update on table "public"."consultation_reports" to "anon";

grant delete on table "public"."consultation_reports" to "authenticated";

grant insert on table "public"."consultation_reports" to "authenticated";

grant references on table "public"."consultation_reports" to "authenticated";

grant select on table "public"."consultation_reports" to "authenticated";

grant trigger on table "public"."consultation_reports" to "authenticated";

grant truncate on table "public"."consultation_reports" to "authenticated";

grant update on table "public"."consultation_reports" to "authenticated";

grant delete on table "public"."consultation_reports" to "service_role";

grant insert on table "public"."consultation_reports" to "service_role";

grant references on table "public"."consultation_reports" to "service_role";

grant select on table "public"."consultation_reports" to "service_role";

grant trigger on table "public"."consultation_reports" to "service_role";

grant truncate on table "public"."consultation_reports" to "service_role";

grant update on table "public"."consultation_reports" to "service_role";

grant delete on table "public"."consultation_reports_access_log" to "anon";

grant insert on table "public"."consultation_reports_access_log" to "anon";

grant references on table "public"."consultation_reports_access_log" to "anon";

grant select on table "public"."consultation_reports_access_log" to "anon";

grant trigger on table "public"."consultation_reports_access_log" to "anon";

grant truncate on table "public"."consultation_reports_access_log" to "anon";

grant update on table "public"."consultation_reports_access_log" to "anon";

grant delete on table "public"."consultation_reports_access_log" to "authenticated";

grant insert on table "public"."consultation_reports_access_log" to "authenticated";

grant references on table "public"."consultation_reports_access_log" to "authenticated";

grant select on table "public"."consultation_reports_access_log" to "authenticated";

grant trigger on table "public"."consultation_reports_access_log" to "authenticated";

grant truncate on table "public"."consultation_reports_access_log" to "authenticated";

grant update on table "public"."consultation_reports_access_log" to "authenticated";

grant delete on table "public"."consultation_reports_access_log" to "service_role";

grant insert on table "public"."consultation_reports_access_log" to "service_role";

grant references on table "public"."consultation_reports_access_log" to "service_role";

grant select on table "public"."consultation_reports_access_log" to "service_role";

grant trigger on table "public"."consultation_reports_access_log" to "service_role";

grant truncate on table "public"."consultation_reports_access_log" to "service_role";

grant update on table "public"."consultation_reports_access_log" to "service_role";

grant delete on table "public"."dispute_messages" to "anon";

grant insert on table "public"."dispute_messages" to "anon";

grant references on table "public"."dispute_messages" to "anon";

grant select on table "public"."dispute_messages" to "anon";

grant trigger on table "public"."dispute_messages" to "anon";

grant truncate on table "public"."dispute_messages" to "anon";

grant update on table "public"."dispute_messages" to "anon";

grant delete on table "public"."dispute_messages" to "authenticated";

grant insert on table "public"."dispute_messages" to "authenticated";

grant references on table "public"."dispute_messages" to "authenticated";

grant select on table "public"."dispute_messages" to "authenticated";

grant trigger on table "public"."dispute_messages" to "authenticated";

grant truncate on table "public"."dispute_messages" to "authenticated";

grant update on table "public"."dispute_messages" to "authenticated";

grant delete on table "public"."dispute_messages" to "service_role";

grant insert on table "public"."dispute_messages" to "service_role";

grant references on table "public"."dispute_messages" to "service_role";

grant select on table "public"."dispute_messages" to "service_role";

grant trigger on table "public"."dispute_messages" to "service_role";

grant truncate on table "public"."dispute_messages" to "service_role";

grant update on table "public"."dispute_messages" to "service_role";

grant delete on table "public"."disputes" to "anon";

grant insert on table "public"."disputes" to "anon";

grant references on table "public"."disputes" to "anon";

grant select on table "public"."disputes" to "anon";

grant trigger on table "public"."disputes" to "anon";

grant truncate on table "public"."disputes" to "anon";

grant update on table "public"."disputes" to "anon";

grant delete on table "public"."disputes" to "authenticated";

grant insert on table "public"."disputes" to "authenticated";

grant references on table "public"."disputes" to "authenticated";

grant select on table "public"."disputes" to "authenticated";

grant trigger on table "public"."disputes" to "authenticated";

grant truncate on table "public"."disputes" to "authenticated";

grant update on table "public"."disputes" to "authenticated";

grant delete on table "public"."disputes" to "service_role";

grant insert on table "public"."disputes" to "service_role";

grant references on table "public"."disputes" to "service_role";

grant select on table "public"."disputes" to "service_role";

grant trigger on table "public"."disputes" to "service_role";

grant truncate on table "public"."disputes" to "service_role";

grant update on table "public"."disputes" to "service_role";

grant delete on table "public"."emergency_contacts" to "anon";

grant insert on table "public"."emergency_contacts" to "anon";

grant references on table "public"."emergency_contacts" to "anon";

grant select on table "public"."emergency_contacts" to "anon";

grant trigger on table "public"."emergency_contacts" to "anon";

grant truncate on table "public"."emergency_contacts" to "anon";

grant update on table "public"."emergency_contacts" to "anon";

grant delete on table "public"."emergency_contacts" to "authenticated";

grant insert on table "public"."emergency_contacts" to "authenticated";

grant references on table "public"."emergency_contacts" to "authenticated";

grant select on table "public"."emergency_contacts" to "authenticated";

grant trigger on table "public"."emergency_contacts" to "authenticated";

grant truncate on table "public"."emergency_contacts" to "authenticated";

grant update on table "public"."emergency_contacts" to "authenticated";

grant delete on table "public"."emergency_contacts" to "service_role";

grant insert on table "public"."emergency_contacts" to "service_role";

grant references on table "public"."emergency_contacts" to "service_role";

grant select on table "public"."emergency_contacts" to "service_role";

grant trigger on table "public"."emergency_contacts" to "service_role";

grant truncate on table "public"."emergency_contacts" to "service_role";

grant update on table "public"."emergency_contacts" to "service_role";

grant delete on table "public"."faqs" to "anon";

grant insert on table "public"."faqs" to "anon";

grant references on table "public"."faqs" to "anon";

grant select on table "public"."faqs" to "anon";

grant trigger on table "public"."faqs" to "anon";

grant truncate on table "public"."faqs" to "anon";

grant update on table "public"."faqs" to "anon";

grant delete on table "public"."faqs" to "authenticated";

grant insert on table "public"."faqs" to "authenticated";

grant references on table "public"."faqs" to "authenticated";

grant select on table "public"."faqs" to "authenticated";

grant trigger on table "public"."faqs" to "authenticated";

grant truncate on table "public"."faqs" to "authenticated";

grant update on table "public"."faqs" to "authenticated";

grant delete on table "public"."faqs" to "service_role";

grant insert on table "public"."faqs" to "service_role";

grant references on table "public"."faqs" to "service_role";

grant select on table "public"."faqs" to "service_role";

grant trigger on table "public"."faqs" to "service_role";

grant truncate on table "public"."faqs" to "service_role";

grant update on table "public"."faqs" to "service_role";

grant delete on table "public"."file_access_logs" to "anon";

grant insert on table "public"."file_access_logs" to "anon";

grant references on table "public"."file_access_logs" to "anon";

grant select on table "public"."file_access_logs" to "anon";

grant trigger on table "public"."file_access_logs" to "anon";

grant truncate on table "public"."file_access_logs" to "anon";

grant update on table "public"."file_access_logs" to "anon";

grant delete on table "public"."file_access_logs" to "authenticated";

grant insert on table "public"."file_access_logs" to "authenticated";

grant references on table "public"."file_access_logs" to "authenticated";

grant select on table "public"."file_access_logs" to "authenticated";

grant trigger on table "public"."file_access_logs" to "authenticated";

grant truncate on table "public"."file_access_logs" to "authenticated";

grant update on table "public"."file_access_logs" to "authenticated";

grant delete on table "public"."file_access_logs" to "service_role";

grant insert on table "public"."file_access_logs" to "service_role";

grant references on table "public"."file_access_logs" to "service_role";

grant select on table "public"."file_access_logs" to "service_role";

grant trigger on table "public"."file_access_logs" to "service_role";

grant truncate on table "public"."file_access_logs" to "service_role";

grant update on table "public"."file_access_logs" to "service_role";

grant delete on table "public"."files" to "anon";

grant insert on table "public"."files" to "anon";

grant references on table "public"."files" to "anon";

grant select on table "public"."files" to "anon";

grant trigger on table "public"."files" to "anon";

grant truncate on table "public"."files" to "anon";

grant update on table "public"."files" to "anon";

grant delete on table "public"."files" to "authenticated";

grant insert on table "public"."files" to "authenticated";

grant references on table "public"."files" to "authenticated";

grant select on table "public"."files" to "authenticated";

grant trigger on table "public"."files" to "authenticated";

grant truncate on table "public"."files" to "authenticated";

grant update on table "public"."files" to "authenticated";

grant delete on table "public"."files" to "service_role";

grant insert on table "public"."files" to "service_role";

grant references on table "public"."files" to "service_role";

grant select on table "public"."files" to "service_role";

grant trigger on table "public"."files" to "service_role";

grant truncate on table "public"."files" to "service_role";

grant update on table "public"."files" to "service_role";

grant delete on table "public"."group_session_participants" to "anon";

grant insert on table "public"."group_session_participants" to "anon";

grant references on table "public"."group_session_participants" to "anon";

grant select on table "public"."group_session_participants" to "anon";

grant trigger on table "public"."group_session_participants" to "anon";

grant truncate on table "public"."group_session_participants" to "anon";

grant update on table "public"."group_session_participants" to "anon";

grant delete on table "public"."group_session_participants" to "authenticated";

grant insert on table "public"."group_session_participants" to "authenticated";

grant references on table "public"."group_session_participants" to "authenticated";

grant select on table "public"."group_session_participants" to "authenticated";

grant trigger on table "public"."group_session_participants" to "authenticated";

grant truncate on table "public"."group_session_participants" to "authenticated";

grant update on table "public"."group_session_participants" to "authenticated";

grant delete on table "public"."group_session_participants" to "service_role";

grant insert on table "public"."group_session_participants" to "service_role";

grant references on table "public"."group_session_participants" to "service_role";

grant select on table "public"."group_session_participants" to "service_role";

grant trigger on table "public"."group_session_participants" to "service_role";

grant truncate on table "public"."group_session_participants" to "service_role";

grant update on table "public"."group_session_participants" to "service_role";

grant delete on table "public"."group_sessions" to "anon";

grant insert on table "public"."group_sessions" to "anon";

grant references on table "public"."group_sessions" to "anon";

grant select on table "public"."group_sessions" to "anon";

grant trigger on table "public"."group_sessions" to "anon";

grant truncate on table "public"."group_sessions" to "anon";

grant update on table "public"."group_sessions" to "anon";

grant delete on table "public"."group_sessions" to "authenticated";

grant insert on table "public"."group_sessions" to "authenticated";

grant references on table "public"."group_sessions" to "authenticated";

grant select on table "public"."group_sessions" to "authenticated";

grant trigger on table "public"."group_sessions" to "authenticated";

grant truncate on table "public"."group_sessions" to "authenticated";

grant update on table "public"."group_sessions" to "authenticated";

grant delete on table "public"."group_sessions" to "service_role";

grant insert on table "public"."group_sessions" to "service_role";

grant references on table "public"."group_sessions" to "service_role";

grant select on table "public"."group_sessions" to "service_role";

grant trigger on table "public"."group_sessions" to "service_role";

grant truncate on table "public"."group_sessions" to "service_role";

grant update on table "public"."group_sessions" to "service_role";

grant delete on table "public"."ledger_accounts" to "anon";

grant insert on table "public"."ledger_accounts" to "anon";

grant references on table "public"."ledger_accounts" to "anon";

grant select on table "public"."ledger_accounts" to "anon";

grant trigger on table "public"."ledger_accounts" to "anon";

grant truncate on table "public"."ledger_accounts" to "anon";

grant update on table "public"."ledger_accounts" to "anon";

grant delete on table "public"."ledger_accounts" to "authenticated";

grant insert on table "public"."ledger_accounts" to "authenticated";

grant references on table "public"."ledger_accounts" to "authenticated";

grant select on table "public"."ledger_accounts" to "authenticated";

grant trigger on table "public"."ledger_accounts" to "authenticated";

grant truncate on table "public"."ledger_accounts" to "authenticated";

grant update on table "public"."ledger_accounts" to "authenticated";

grant delete on table "public"."ledger_accounts" to "service_role";

grant insert on table "public"."ledger_accounts" to "service_role";

grant references on table "public"."ledger_accounts" to "service_role";

grant select on table "public"."ledger_accounts" to "service_role";

grant trigger on table "public"."ledger_accounts" to "service_role";

grant truncate on table "public"."ledger_accounts" to "service_role";

grant update on table "public"."ledger_accounts" to "service_role";

grant delete on table "public"."ledger_entries" to "anon";

grant insert on table "public"."ledger_entries" to "anon";

grant references on table "public"."ledger_entries" to "anon";

grant select on table "public"."ledger_entries" to "anon";

grant trigger on table "public"."ledger_entries" to "anon";

grant truncate on table "public"."ledger_entries" to "anon";

grant update on table "public"."ledger_entries" to "anon";

grant delete on table "public"."ledger_entries" to "authenticated";

grant insert on table "public"."ledger_entries" to "authenticated";

grant references on table "public"."ledger_entries" to "authenticated";

grant select on table "public"."ledger_entries" to "authenticated";

grant trigger on table "public"."ledger_entries" to "authenticated";

grant truncate on table "public"."ledger_entries" to "authenticated";

grant update on table "public"."ledger_entries" to "authenticated";

grant delete on table "public"."ledger_entries" to "service_role";

grant insert on table "public"."ledger_entries" to "service_role";

grant references on table "public"."ledger_entries" to "service_role";

grant select on table "public"."ledger_entries" to "service_role";

grant trigger on table "public"."ledger_entries" to "service_role";

grant truncate on table "public"."ledger_entries" to "service_role";

grant update on table "public"."ledger_entries" to "service_role";

grant delete on table "public"."medical_profiles" to "anon";

grant insert on table "public"."medical_profiles" to "anon";

grant references on table "public"."medical_profiles" to "anon";

grant select on table "public"."medical_profiles" to "anon";

grant trigger on table "public"."medical_profiles" to "anon";

grant truncate on table "public"."medical_profiles" to "anon";

grant update on table "public"."medical_profiles" to "anon";

grant delete on table "public"."medical_profiles" to "authenticated";

grant insert on table "public"."medical_profiles" to "authenticated";

grant references on table "public"."medical_profiles" to "authenticated";

grant select on table "public"."medical_profiles" to "authenticated";

grant trigger on table "public"."medical_profiles" to "authenticated";

grant truncate on table "public"."medical_profiles" to "authenticated";

grant update on table "public"."medical_profiles" to "authenticated";

grant delete on table "public"."medical_profiles" to "service_role";

grant insert on table "public"."medical_profiles" to "service_role";

grant references on table "public"."medical_profiles" to "service_role";

grant select on table "public"."medical_profiles" to "service_role";

grant trigger on table "public"."medical_profiles" to "service_role";

grant truncate on table "public"."medical_profiles" to "service_role";

grant update on table "public"."medical_profiles" to "service_role";

grant delete on table "public"."messages" to "anon";

grant insert on table "public"."messages" to "anon";

grant references on table "public"."messages" to "anon";

grant select on table "public"."messages" to "anon";

grant trigger on table "public"."messages" to "anon";

grant truncate on table "public"."messages" to "anon";

grant update on table "public"."messages" to "anon";

grant delete on table "public"."messages" to "authenticated";

grant insert on table "public"."messages" to "authenticated";

grant references on table "public"."messages" to "authenticated";

grant select on table "public"."messages" to "authenticated";

grant trigger on table "public"."messages" to "authenticated";

grant truncate on table "public"."messages" to "authenticated";

grant update on table "public"."messages" to "authenticated";

grant delete on table "public"."messages" to "service_role";

grant insert on table "public"."messages" to "service_role";

grant references on table "public"."messages" to "service_role";

grant select on table "public"."messages" to "service_role";

grant trigger on table "public"."messages" to "service_role";

grant truncate on table "public"."messages" to "service_role";

grant update on table "public"."messages" to "service_role";

grant delete on table "public"."notification_preferences" to "anon";

grant insert on table "public"."notification_preferences" to "anon";

grant references on table "public"."notification_preferences" to "anon";

grant select on table "public"."notification_preferences" to "anon";

grant trigger on table "public"."notification_preferences" to "anon";

grant truncate on table "public"."notification_preferences" to "anon";

grant update on table "public"."notification_preferences" to "anon";

grant delete on table "public"."notification_preferences" to "authenticated";

grant insert on table "public"."notification_preferences" to "authenticated";

grant references on table "public"."notification_preferences" to "authenticated";

grant select on table "public"."notification_preferences" to "authenticated";

grant trigger on table "public"."notification_preferences" to "authenticated";

grant truncate on table "public"."notification_preferences" to "authenticated";

grant update on table "public"."notification_preferences" to "authenticated";

grant delete on table "public"."notification_preferences" to "service_role";

grant insert on table "public"."notification_preferences" to "service_role";

grant references on table "public"."notification_preferences" to "service_role";

grant select on table "public"."notification_preferences" to "service_role";

grant trigger on table "public"."notification_preferences" to "service_role";

grant truncate on table "public"."notification_preferences" to "service_role";

grant update on table "public"."notification_preferences" to "service_role";

grant delete on table "public"."notifications" to "anon";

grant insert on table "public"."notifications" to "anon";

grant references on table "public"."notifications" to "anon";

grant select on table "public"."notifications" to "anon";

grant trigger on table "public"."notifications" to "anon";

grant truncate on table "public"."notifications" to "anon";

grant update on table "public"."notifications" to "anon";

grant delete on table "public"."notifications" to "authenticated";

grant insert on table "public"."notifications" to "authenticated";

grant references on table "public"."notifications" to "authenticated";

grant select on table "public"."notifications" to "authenticated";

grant trigger on table "public"."notifications" to "authenticated";

grant truncate on table "public"."notifications" to "authenticated";

grant update on table "public"."notifications" to "authenticated";

grant delete on table "public"."notifications" to "service_role";

grant insert on table "public"."notifications" to "service_role";

grant references on table "public"."notifications" to "service_role";

grant select on table "public"."notifications" to "service_role";

grant trigger on table "public"."notifications" to "service_role";

grant truncate on table "public"."notifications" to "service_role";

grant update on table "public"."notifications" to "service_role";

grant delete on table "public"."otp_attempts" to "anon";

grant insert on table "public"."otp_attempts" to "anon";

grant references on table "public"."otp_attempts" to "anon";

grant select on table "public"."otp_attempts" to "anon";

grant trigger on table "public"."otp_attempts" to "anon";

grant truncate on table "public"."otp_attempts" to "anon";

grant update on table "public"."otp_attempts" to "anon";

grant delete on table "public"."otp_attempts" to "authenticated";

grant insert on table "public"."otp_attempts" to "authenticated";

grant references on table "public"."otp_attempts" to "authenticated";

grant select on table "public"."otp_attempts" to "authenticated";

grant trigger on table "public"."otp_attempts" to "authenticated";

grant truncate on table "public"."otp_attempts" to "authenticated";

grant update on table "public"."otp_attempts" to "authenticated";

grant delete on table "public"."otp_attempts" to "service_role";

grant insert on table "public"."otp_attempts" to "service_role";

grant references on table "public"."otp_attempts" to "service_role";

grant select on table "public"."otp_attempts" to "service_role";

grant trigger on table "public"."otp_attempts" to "service_role";

grant truncate on table "public"."otp_attempts" to "service_role";

grant update on table "public"."otp_attempts" to "service_role";

grant delete on table "public"."otp_rate_limits" to "anon";

grant insert on table "public"."otp_rate_limits" to "anon";

grant references on table "public"."otp_rate_limits" to "anon";

grant select on table "public"."otp_rate_limits" to "anon";

grant trigger on table "public"."otp_rate_limits" to "anon";

grant truncate on table "public"."otp_rate_limits" to "anon";

grant update on table "public"."otp_rate_limits" to "anon";

grant delete on table "public"."otp_rate_limits" to "authenticated";

grant insert on table "public"."otp_rate_limits" to "authenticated";

grant references on table "public"."otp_rate_limits" to "authenticated";

grant select on table "public"."otp_rate_limits" to "authenticated";

grant trigger on table "public"."otp_rate_limits" to "authenticated";

grant truncate on table "public"."otp_rate_limits" to "authenticated";

grant update on table "public"."otp_rate_limits" to "authenticated";

grant delete on table "public"."otp_rate_limits" to "service_role";

grant insert on table "public"."otp_rate_limits" to "service_role";

grant references on table "public"."otp_rate_limits" to "service_role";

grant select on table "public"."otp_rate_limits" to "service_role";

grant trigger on table "public"."otp_rate_limits" to "service_role";

grant truncate on table "public"."otp_rate_limits" to "service_role";

grant update on table "public"."otp_rate_limits" to "service_role";

grant delete on table "public"."payment_attempts" to "anon";

grant insert on table "public"."payment_attempts" to "anon";

grant references on table "public"."payment_attempts" to "anon";

grant select on table "public"."payment_attempts" to "anon";

grant trigger on table "public"."payment_attempts" to "anon";

grant truncate on table "public"."payment_attempts" to "anon";

grant update on table "public"."payment_attempts" to "anon";

grant delete on table "public"."payment_attempts" to "authenticated";

grant insert on table "public"."payment_attempts" to "authenticated";

grant references on table "public"."payment_attempts" to "authenticated";

grant select on table "public"."payment_attempts" to "authenticated";

grant trigger on table "public"."payment_attempts" to "authenticated";

grant truncate on table "public"."payment_attempts" to "authenticated";

grant update on table "public"."payment_attempts" to "authenticated";

grant delete on table "public"."payment_attempts" to "service_role";

grant insert on table "public"."payment_attempts" to "service_role";

grant references on table "public"."payment_attempts" to "service_role";

grant select on table "public"."payment_attempts" to "service_role";

grant trigger on table "public"."payment_attempts" to "service_role";

grant truncate on table "public"."payment_attempts" to "service_role";

grant update on table "public"."payment_attempts" to "service_role";

grant delete on table "public"."payment_events" to "anon";

grant insert on table "public"."payment_events" to "anon";

grant references on table "public"."payment_events" to "anon";

grant select on table "public"."payment_events" to "anon";

grant trigger on table "public"."payment_events" to "anon";

grant truncate on table "public"."payment_events" to "anon";

grant update on table "public"."payment_events" to "anon";

grant delete on table "public"."payment_events" to "authenticated";

grant insert on table "public"."payment_events" to "authenticated";

grant references on table "public"."payment_events" to "authenticated";

grant select on table "public"."payment_events" to "authenticated";

grant trigger on table "public"."payment_events" to "authenticated";

grant truncate on table "public"."payment_events" to "authenticated";

grant update on table "public"."payment_events" to "authenticated";

grant delete on table "public"."payment_events" to "service_role";

grant insert on table "public"."payment_events" to "service_role";

grant references on table "public"."payment_events" to "service_role";

grant select on table "public"."payment_events" to "service_role";

grant trigger on table "public"."payment_events" to "service_role";

grant truncate on table "public"."payment_events" to "service_role";

grant update on table "public"."payment_events" to "service_role";

grant delete on table "public"."payment_reconciliations" to "anon";

grant insert on table "public"."payment_reconciliations" to "anon";

grant references on table "public"."payment_reconciliations" to "anon";

grant select on table "public"."payment_reconciliations" to "anon";

grant trigger on table "public"."payment_reconciliations" to "anon";

grant truncate on table "public"."payment_reconciliations" to "anon";

grant update on table "public"."payment_reconciliations" to "anon";

grant delete on table "public"."payment_reconciliations" to "authenticated";

grant insert on table "public"."payment_reconciliations" to "authenticated";

grant references on table "public"."payment_reconciliations" to "authenticated";

grant select on table "public"."payment_reconciliations" to "authenticated";

grant trigger on table "public"."payment_reconciliations" to "authenticated";

grant truncate on table "public"."payment_reconciliations" to "authenticated";

grant update on table "public"."payment_reconciliations" to "authenticated";

grant delete on table "public"."payment_reconciliations" to "service_role";

grant insert on table "public"."payment_reconciliations" to "service_role";

grant references on table "public"."payment_reconciliations" to "service_role";

grant select on table "public"."payment_reconciliations" to "service_role";

grant trigger on table "public"."payment_reconciliations" to "service_role";

grant truncate on table "public"."payment_reconciliations" to "service_role";

grant update on table "public"."payment_reconciliations" to "service_role";

grant delete on table "public"."payment_refunds" to "anon";

grant insert on table "public"."payment_refunds" to "anon";

grant references on table "public"."payment_refunds" to "anon";

grant select on table "public"."payment_refunds" to "anon";

grant trigger on table "public"."payment_refunds" to "anon";

grant truncate on table "public"."payment_refunds" to "anon";

grant update on table "public"."payment_refunds" to "anon";

grant delete on table "public"."payment_refunds" to "authenticated";

grant insert on table "public"."payment_refunds" to "authenticated";

grant references on table "public"."payment_refunds" to "authenticated";

grant select on table "public"."payment_refunds" to "authenticated";

grant trigger on table "public"."payment_refunds" to "authenticated";

grant truncate on table "public"."payment_refunds" to "authenticated";

grant update on table "public"."payment_refunds" to "authenticated";

grant delete on table "public"."payment_refunds" to "service_role";

grant insert on table "public"."payment_refunds" to "service_role";

grant references on table "public"."payment_refunds" to "service_role";

grant select on table "public"."payment_refunds" to "service_role";

grant trigger on table "public"."payment_refunds" to "service_role";

grant truncate on table "public"."payment_refunds" to "service_role";

grant update on table "public"."payment_refunds" to "service_role";

grant delete on table "public"."payments" to "anon";

grant insert on table "public"."payments" to "anon";

grant references on table "public"."payments" to "anon";

grant select on table "public"."payments" to "anon";

grant trigger on table "public"."payments" to "anon";

grant truncate on table "public"."payments" to "anon";

grant update on table "public"."payments" to "anon";

grant delete on table "public"."payments" to "authenticated";

grant insert on table "public"."payments" to "authenticated";

grant references on table "public"."payments" to "authenticated";

grant select on table "public"."payments" to "authenticated";

grant trigger on table "public"."payments" to "authenticated";

grant truncate on table "public"."payments" to "authenticated";

grant update on table "public"."payments" to "authenticated";

grant delete on table "public"."payments" to "service_role";

grant insert on table "public"."payments" to "service_role";

grant references on table "public"."payments" to "service_role";

grant select on table "public"."payments" to "service_role";

grant trigger on table "public"."payments" to "service_role";

grant truncate on table "public"."payments" to "service_role";

grant update on table "public"."payments" to "service_role";

grant delete on table "public"."payout_batches" to "anon";

grant insert on table "public"."payout_batches" to "anon";

grant references on table "public"."payout_batches" to "anon";

grant select on table "public"."payout_batches" to "anon";

grant trigger on table "public"."payout_batches" to "anon";

grant truncate on table "public"."payout_batches" to "anon";

grant update on table "public"."payout_batches" to "anon";

grant delete on table "public"."payout_batches" to "authenticated";

grant insert on table "public"."payout_batches" to "authenticated";

grant references on table "public"."payout_batches" to "authenticated";

grant select on table "public"."payout_batches" to "authenticated";

grant trigger on table "public"."payout_batches" to "authenticated";

grant truncate on table "public"."payout_batches" to "authenticated";

grant update on table "public"."payout_batches" to "authenticated";

grant delete on table "public"."payout_batches" to "service_role";

grant insert on table "public"."payout_batches" to "service_role";

grant references on table "public"."payout_batches" to "service_role";

grant select on table "public"."payout_batches" to "service_role";

grant trigger on table "public"."payout_batches" to "service_role";

grant truncate on table "public"."payout_batches" to "service_role";

grant update on table "public"."payout_batches" to "service_role";

grant delete on table "public"."payout_payments" to "anon";

grant insert on table "public"."payout_payments" to "anon";

grant references on table "public"."payout_payments" to "anon";

grant select on table "public"."payout_payments" to "anon";

grant trigger on table "public"."payout_payments" to "anon";

grant truncate on table "public"."payout_payments" to "anon";

grant update on table "public"."payout_payments" to "anon";

grant delete on table "public"."payout_payments" to "authenticated";

grant insert on table "public"."payout_payments" to "authenticated";

grant references on table "public"."payout_payments" to "authenticated";

grant select on table "public"."payout_payments" to "authenticated";

grant trigger on table "public"."payout_payments" to "authenticated";

grant truncate on table "public"."payout_payments" to "authenticated";

grant update on table "public"."payout_payments" to "authenticated";

grant delete on table "public"."payout_payments" to "service_role";

grant insert on table "public"."payout_payments" to "service_role";

grant references on table "public"."payout_payments" to "service_role";

grant select on table "public"."payout_payments" to "service_role";

grant trigger on table "public"."payout_payments" to "service_role";

grant truncate on table "public"."payout_payments" to "service_role";

grant update on table "public"."payout_payments" to "service_role";

grant delete on table "public"."practitioner_availability" to "anon";

grant insert on table "public"."practitioner_availability" to "anon";

grant references on table "public"."practitioner_availability" to "anon";

grant select on table "public"."practitioner_availability" to "anon";

grant trigger on table "public"."practitioner_availability" to "anon";

grant truncate on table "public"."practitioner_availability" to "anon";

grant update on table "public"."practitioner_availability" to "anon";

grant delete on table "public"."practitioner_availability" to "authenticated";

grant insert on table "public"."practitioner_availability" to "authenticated";

grant references on table "public"."practitioner_availability" to "authenticated";

grant select on table "public"."practitioner_availability" to "authenticated";

grant trigger on table "public"."practitioner_availability" to "authenticated";

grant truncate on table "public"."practitioner_availability" to "authenticated";

grant update on table "public"."practitioner_availability" to "authenticated";

grant delete on table "public"."practitioner_availability" to "service_role";

grant insert on table "public"."practitioner_availability" to "service_role";

grant references on table "public"."practitioner_availability" to "service_role";

grant select on table "public"."practitioner_availability" to "service_role";

grant trigger on table "public"."practitioner_availability" to "service_role";

grant truncate on table "public"."practitioner_availability" to "service_role";

grant update on table "public"."practitioner_availability" to "service_role";

grant delete on table "public"."practitioner_balances" to "anon";

grant insert on table "public"."practitioner_balances" to "anon";

grant references on table "public"."practitioner_balances" to "anon";

grant select on table "public"."practitioner_balances" to "anon";

grant trigger on table "public"."practitioner_balances" to "anon";

grant truncate on table "public"."practitioner_balances" to "anon";

grant update on table "public"."practitioner_balances" to "anon";

grant delete on table "public"."practitioner_balances" to "authenticated";

grant insert on table "public"."practitioner_balances" to "authenticated";

grant references on table "public"."practitioner_balances" to "authenticated";

grant select on table "public"."practitioner_balances" to "authenticated";

grant trigger on table "public"."practitioner_balances" to "authenticated";

grant truncate on table "public"."practitioner_balances" to "authenticated";

grant update on table "public"."practitioner_balances" to "authenticated";

grant delete on table "public"."practitioner_balances" to "service_role";

grant insert on table "public"."practitioner_balances" to "service_role";

grant references on table "public"."practitioner_balances" to "service_role";

grant select on table "public"."practitioner_balances" to "service_role";

grant trigger on table "public"."practitioner_balances" to "service_role";

grant truncate on table "public"."practitioner_balances" to "service_role";

grant update on table "public"."practitioner_balances" to "service_role";

grant delete on table "public"."practitioner_exceptions" to "anon";

grant insert on table "public"."practitioner_exceptions" to "anon";

grant references on table "public"."practitioner_exceptions" to "anon";

grant select on table "public"."practitioner_exceptions" to "anon";

grant trigger on table "public"."practitioner_exceptions" to "anon";

grant truncate on table "public"."practitioner_exceptions" to "anon";

grant update on table "public"."practitioner_exceptions" to "anon";

grant delete on table "public"."practitioner_exceptions" to "authenticated";

grant insert on table "public"."practitioner_exceptions" to "authenticated";

grant references on table "public"."practitioner_exceptions" to "authenticated";

grant select on table "public"."practitioner_exceptions" to "authenticated";

grant trigger on table "public"."practitioner_exceptions" to "authenticated";

grant truncate on table "public"."practitioner_exceptions" to "authenticated";

grant update on table "public"."practitioner_exceptions" to "authenticated";

grant delete on table "public"."practitioner_exceptions" to "service_role";

grant insert on table "public"."practitioner_exceptions" to "service_role";

grant references on table "public"."practitioner_exceptions" to "service_role";

grant select on table "public"."practitioner_exceptions" to "service_role";

grant trigger on table "public"."practitioner_exceptions" to "service_role";

grant truncate on table "public"."practitioner_exceptions" to "service_role";

grant update on table "public"."practitioner_exceptions" to "service_role";

grant delete on table "public"."practitioner_payment_info" to "anon";

grant insert on table "public"."practitioner_payment_info" to "anon";

grant references on table "public"."practitioner_payment_info" to "anon";

grant select on table "public"."practitioner_payment_info" to "anon";

grant trigger on table "public"."practitioner_payment_info" to "anon";

grant truncate on table "public"."practitioner_payment_info" to "anon";

grant update on table "public"."practitioner_payment_info" to "anon";

grant delete on table "public"."practitioner_payment_info" to "authenticated";

grant insert on table "public"."practitioner_payment_info" to "authenticated";

grant references on table "public"."practitioner_payment_info" to "authenticated";

grant select on table "public"."practitioner_payment_info" to "authenticated";

grant trigger on table "public"."practitioner_payment_info" to "authenticated";

grant truncate on table "public"."practitioner_payment_info" to "authenticated";

grant update on table "public"."practitioner_payment_info" to "authenticated";

grant delete on table "public"."practitioner_payment_info" to "service_role";

grant insert on table "public"."practitioner_payment_info" to "service_role";

grant references on table "public"."practitioner_payment_info" to "service_role";

grant select on table "public"."practitioner_payment_info" to "service_role";

grant trigger on table "public"."practitioner_payment_info" to "service_role";

grant truncate on table "public"."practitioner_payment_info" to "service_role";

grant update on table "public"."practitioner_payment_info" to "service_role";

grant delete on table "public"."practitioner_payouts" to "anon";

grant insert on table "public"."practitioner_payouts" to "anon";

grant references on table "public"."practitioner_payouts" to "anon";

grant select on table "public"."practitioner_payouts" to "anon";

grant trigger on table "public"."practitioner_payouts" to "anon";

grant truncate on table "public"."practitioner_payouts" to "anon";

grant update on table "public"."practitioner_payouts" to "anon";

grant delete on table "public"."practitioner_payouts" to "authenticated";

grant insert on table "public"."practitioner_payouts" to "authenticated";

grant references on table "public"."practitioner_payouts" to "authenticated";

grant select on table "public"."practitioner_payouts" to "authenticated";

grant trigger on table "public"."practitioner_payouts" to "authenticated";

grant truncate on table "public"."practitioner_payouts" to "authenticated";

grant update on table "public"."practitioner_payouts" to "authenticated";

grant delete on table "public"."practitioner_payouts" to "service_role";

grant insert on table "public"."practitioner_payouts" to "service_role";

grant references on table "public"."practitioner_payouts" to "service_role";

grant select on table "public"."practitioner_payouts" to "service_role";

grant trigger on table "public"."practitioner_payouts" to "service_role";

grant truncate on table "public"."practitioner_payouts" to "service_role";

grant update on table "public"."practitioner_payouts" to "service_role";

grant delete on table "public"."practitioner_rates" to "anon";

grant insert on table "public"."practitioner_rates" to "anon";

grant references on table "public"."practitioner_rates" to "anon";

grant select on table "public"."practitioner_rates" to "anon";

grant trigger on table "public"."practitioner_rates" to "anon";

grant truncate on table "public"."practitioner_rates" to "anon";

grant update on table "public"."practitioner_rates" to "anon";

grant delete on table "public"."practitioner_rates" to "authenticated";

grant insert on table "public"."practitioner_rates" to "authenticated";

grant references on table "public"."practitioner_rates" to "authenticated";

grant select on table "public"."practitioner_rates" to "authenticated";

grant trigger on table "public"."practitioner_rates" to "authenticated";

grant truncate on table "public"."practitioner_rates" to "authenticated";

grant update on table "public"."practitioner_rates" to "authenticated";

grant delete on table "public"."practitioner_rates" to "service_role";

grant insert on table "public"."practitioner_rates" to "service_role";

grant references on table "public"."practitioner_rates" to "service_role";

grant select on table "public"."practitioner_rates" to "service_role";

grant trigger on table "public"."practitioner_rates" to "service_role";

grant truncate on table "public"."practitioner_rates" to "service_role";

grant update on table "public"."practitioner_rates" to "service_role";

grant delete on table "public"."practitioners" to "anon";

grant insert on table "public"."practitioners" to "anon";

grant references on table "public"."practitioners" to "anon";

grant select on table "public"."practitioners" to "anon";

grant trigger on table "public"."practitioners" to "anon";

grant truncate on table "public"."practitioners" to "anon";

grant update on table "public"."practitioners" to "anon";

grant delete on table "public"."practitioners" to "authenticated";

grant insert on table "public"."practitioners" to "authenticated";

grant references on table "public"."practitioners" to "authenticated";

grant select on table "public"."practitioners" to "authenticated";

grant trigger on table "public"."practitioners" to "authenticated";

grant truncate on table "public"."practitioners" to "authenticated";

grant update on table "public"."practitioners" to "authenticated";

grant delete on table "public"."practitioners" to "service_role";

grant insert on table "public"."practitioners" to "service_role";

grant references on table "public"."practitioners" to "service_role";

grant select on table "public"."practitioners" to "service_role";

grant trigger on table "public"."practitioners" to "service_role";

grant truncate on table "public"."practitioners" to "service_role";

grant update on table "public"."practitioners" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."push_subscriptions" to "anon";

grant insert on table "public"."push_subscriptions" to "anon";

grant references on table "public"."push_subscriptions" to "anon";

grant select on table "public"."push_subscriptions" to "anon";

grant trigger on table "public"."push_subscriptions" to "anon";

grant truncate on table "public"."push_subscriptions" to "anon";

grant update on table "public"."push_subscriptions" to "anon";

grant delete on table "public"."push_subscriptions" to "authenticated";

grant insert on table "public"."push_subscriptions" to "authenticated";

grant references on table "public"."push_subscriptions" to "authenticated";

grant select on table "public"."push_subscriptions" to "authenticated";

grant trigger on table "public"."push_subscriptions" to "authenticated";

grant truncate on table "public"."push_subscriptions" to "authenticated";

grant update on table "public"."push_subscriptions" to "authenticated";

grant delete on table "public"."push_subscriptions" to "service_role";

grant insert on table "public"."push_subscriptions" to "service_role";

grant references on table "public"."push_subscriptions" to "service_role";

grant select on table "public"."push_subscriptions" to "service_role";

grant trigger on table "public"."push_subscriptions" to "service_role";

grant truncate on table "public"."push_subscriptions" to "service_role";

grant update on table "public"."push_subscriptions" to "service_role";

grant delete on table "public"."reconciliation_reports" to "anon";

grant insert on table "public"."reconciliation_reports" to "anon";

grant references on table "public"."reconciliation_reports" to "anon";

grant select on table "public"."reconciliation_reports" to "anon";

grant trigger on table "public"."reconciliation_reports" to "anon";

grant truncate on table "public"."reconciliation_reports" to "anon";

grant update on table "public"."reconciliation_reports" to "anon";

grant delete on table "public"."reconciliation_reports" to "authenticated";

grant insert on table "public"."reconciliation_reports" to "authenticated";

grant references on table "public"."reconciliation_reports" to "authenticated";

grant select on table "public"."reconciliation_reports" to "authenticated";

grant trigger on table "public"."reconciliation_reports" to "authenticated";

grant truncate on table "public"."reconciliation_reports" to "authenticated";

grant update on table "public"."reconciliation_reports" to "authenticated";

grant delete on table "public"."reconciliation_reports" to "service_role";

grant insert on table "public"."reconciliation_reports" to "service_role";

grant references on table "public"."reconciliation_reports" to "service_role";

grant select on table "public"."reconciliation_reports" to "service_role";

grant trigger on table "public"."reconciliation_reports" to "service_role";

grant truncate on table "public"."reconciliation_reports" to "service_role";

grant update on table "public"."reconciliation_reports" to "service_role";

grant delete on table "public"."reviews" to "anon";

grant insert on table "public"."reviews" to "anon";

grant references on table "public"."reviews" to "anon";

grant select on table "public"."reviews" to "anon";

grant trigger on table "public"."reviews" to "anon";

grant truncate on table "public"."reviews" to "anon";

grant update on table "public"."reviews" to "anon";

grant delete on table "public"."reviews" to "authenticated";

grant insert on table "public"."reviews" to "authenticated";

grant references on table "public"."reviews" to "authenticated";

grant select on table "public"."reviews" to "authenticated";

grant trigger on table "public"."reviews" to "authenticated";

grant truncate on table "public"."reviews" to "authenticated";

grant update on table "public"."reviews" to "authenticated";

grant delete on table "public"."reviews" to "service_role";

grant insert on table "public"."reviews" to "service_role";

grant references on table "public"."reviews" to "service_role";

grant select on table "public"."reviews" to "service_role";

grant trigger on table "public"."reviews" to "service_role";

grant truncate on table "public"."reviews" to "service_role";

grant update on table "public"."reviews" to "service_role";

grant delete on table "public"."saved_payment_methods" to "anon";

grant insert on table "public"."saved_payment_methods" to "anon";

grant references on table "public"."saved_payment_methods" to "anon";

grant select on table "public"."saved_payment_methods" to "anon";

grant trigger on table "public"."saved_payment_methods" to "anon";

grant truncate on table "public"."saved_payment_methods" to "anon";

grant update on table "public"."saved_payment_methods" to "anon";

grant delete on table "public"."saved_payment_methods" to "authenticated";

grant insert on table "public"."saved_payment_methods" to "authenticated";

grant references on table "public"."saved_payment_methods" to "authenticated";

grant select on table "public"."saved_payment_methods" to "authenticated";

grant trigger on table "public"."saved_payment_methods" to "authenticated";

grant truncate on table "public"."saved_payment_methods" to "authenticated";

grant update on table "public"."saved_payment_methods" to "authenticated";

grant delete on table "public"."saved_payment_methods" to "service_role";

grant insert on table "public"."saved_payment_methods" to "service_role";

grant references on table "public"."saved_payment_methods" to "service_role";

grant select on table "public"."saved_payment_methods" to "service_role";

grant trigger on table "public"."saved_payment_methods" to "service_role";

grant truncate on table "public"."saved_payment_methods" to "service_role";

grant update on table "public"."saved_payment_methods" to "service_role";

grant delete on table "public"."search_activity_logs" to "anon";

grant insert on table "public"."search_activity_logs" to "anon";

grant references on table "public"."search_activity_logs" to "anon";

grant select on table "public"."search_activity_logs" to "anon";

grant trigger on table "public"."search_activity_logs" to "anon";

grant truncate on table "public"."search_activity_logs" to "anon";

grant update on table "public"."search_activity_logs" to "anon";

grant delete on table "public"."search_activity_logs" to "authenticated";

grant insert on table "public"."search_activity_logs" to "authenticated";

grant references on table "public"."search_activity_logs" to "authenticated";

grant select on table "public"."search_activity_logs" to "authenticated";

grant trigger on table "public"."search_activity_logs" to "authenticated";

grant truncate on table "public"."search_activity_logs" to "authenticated";

grant update on table "public"."search_activity_logs" to "authenticated";

grant delete on table "public"."search_activity_logs" to "service_role";

grant insert on table "public"."search_activity_logs" to "service_role";

grant references on table "public"."search_activity_logs" to "service_role";

grant select on table "public"."search_activity_logs" to "service_role";

grant trigger on table "public"."search_activity_logs" to "service_role";

grant truncate on table "public"."search_activity_logs" to "service_role";

grant update on table "public"."search_activity_logs" to "service_role";

grant delete on table "public"."service_audit_log" to "anon";

grant insert on table "public"."service_audit_log" to "anon";

grant references on table "public"."service_audit_log" to "anon";

grant select on table "public"."service_audit_log" to "anon";

grant trigger on table "public"."service_audit_log" to "anon";

grant truncate on table "public"."service_audit_log" to "anon";

grant update on table "public"."service_audit_log" to "anon";

grant delete on table "public"."service_audit_log" to "authenticated";

grant insert on table "public"."service_audit_log" to "authenticated";

grant references on table "public"."service_audit_log" to "authenticated";

grant select on table "public"."service_audit_log" to "authenticated";

grant trigger on table "public"."service_audit_log" to "authenticated";

grant truncate on table "public"."service_audit_log" to "authenticated";

grant update on table "public"."service_audit_log" to "authenticated";

grant delete on table "public"."service_audit_log" to "service_role";

grant insert on table "public"."service_audit_log" to "service_role";

grant references on table "public"."service_audit_log" to "service_role";

grant select on table "public"."service_audit_log" to "service_role";

grant trigger on table "public"."service_audit_log" to "service_role";

grant truncate on table "public"."service_audit_log" to "service_role";

grant update on table "public"."service_audit_log" to "service_role";

grant delete on table "public"."services" to "anon";

grant insert on table "public"."services" to "anon";

grant references on table "public"."services" to "anon";

grant select on table "public"."services" to "anon";

grant trigger on table "public"."services" to "anon";

grant truncate on table "public"."services" to "anon";

grant update on table "public"."services" to "anon";

grant delete on table "public"."services" to "authenticated";

grant insert on table "public"."services" to "authenticated";

grant references on table "public"."services" to "authenticated";

grant select on table "public"."services" to "authenticated";

grant trigger on table "public"."services" to "authenticated";

grant truncate on table "public"."services" to "authenticated";

grant update on table "public"."services" to "authenticated";

grant delete on table "public"."services" to "service_role";

grant insert on table "public"."services" to "service_role";

grant references on table "public"."services" to "service_role";

grant select on table "public"."services" to "service_role";

grant trigger on table "public"."services" to "service_role";

grant truncate on table "public"."services" to "service_role";

grant update on table "public"."services" to "service_role";

grant delete on table "public"."support_tickets" to "anon";

grant insert on table "public"."support_tickets" to "anon";

grant references on table "public"."support_tickets" to "anon";

grant select on table "public"."support_tickets" to "anon";

grant trigger on table "public"."support_tickets" to "anon";

grant truncate on table "public"."support_tickets" to "anon";

grant update on table "public"."support_tickets" to "anon";

grant delete on table "public"."support_tickets" to "authenticated";

grant insert on table "public"."support_tickets" to "authenticated";

grant references on table "public"."support_tickets" to "authenticated";

grant select on table "public"."support_tickets" to "authenticated";

grant trigger on table "public"."support_tickets" to "authenticated";

grant truncate on table "public"."support_tickets" to "authenticated";

grant update on table "public"."support_tickets" to "authenticated";

grant delete on table "public"."support_tickets" to "service_role";

grant insert on table "public"."support_tickets" to "service_role";

grant references on table "public"."support_tickets" to "service_role";

grant select on table "public"."support_tickets" to "service_role";

grant trigger on table "public"."support_tickets" to "service_role";

grant truncate on table "public"."support_tickets" to "service_role";

grant update on table "public"."support_tickets" to "service_role";

grant delete on table "public"."system_config" to "anon";

grant insert on table "public"."system_config" to "anon";

grant references on table "public"."system_config" to "anon";

grant select on table "public"."system_config" to "anon";

grant trigger on table "public"."system_config" to "anon";

grant truncate on table "public"."system_config" to "anon";

grant update on table "public"."system_config" to "anon";

grant delete on table "public"."system_config" to "authenticated";

grant insert on table "public"."system_config" to "authenticated";

grant references on table "public"."system_config" to "authenticated";

grant select on table "public"."system_config" to "authenticated";

grant trigger on table "public"."system_config" to "authenticated";

grant truncate on table "public"."system_config" to "authenticated";

grant update on table "public"."system_config" to "authenticated";

grant delete on table "public"."system_config" to "service_role";

grant insert on table "public"."system_config" to "service_role";

grant references on table "public"."system_config" to "service_role";

grant select on table "public"."system_config" to "service_role";

grant trigger on table "public"."system_config" to "service_role";

grant truncate on table "public"."system_config" to "service_role";

grant update on table "public"."system_config" to "service_role";

grant delete on table "public"."triage_results" to "anon";

grant insert on table "public"."triage_results" to "anon";

grant references on table "public"."triage_results" to "anon";

grant select on table "public"."triage_results" to "anon";

grant trigger on table "public"."triage_results" to "anon";

grant truncate on table "public"."triage_results" to "anon";

grant update on table "public"."triage_results" to "anon";

grant delete on table "public"."triage_results" to "authenticated";

grant insert on table "public"."triage_results" to "authenticated";

grant references on table "public"."triage_results" to "authenticated";

grant select on table "public"."triage_results" to "authenticated";

grant trigger on table "public"."triage_results" to "authenticated";

grant truncate on table "public"."triage_results" to "authenticated";

grant update on table "public"."triage_results" to "authenticated";

grant delete on table "public"."triage_results" to "service_role";

grant insert on table "public"."triage_results" to "service_role";

grant references on table "public"."triage_results" to "service_role";

grant select on table "public"."triage_results" to "service_role";

grant trigger on table "public"."triage_results" to "service_role";

grant truncate on table "public"."triage_results" to "service_role";

grant update on table "public"."triage_results" to "service_role";

grant delete on table "public"."user_consents" to "anon";

grant insert on table "public"."user_consents" to "anon";

grant references on table "public"."user_consents" to "anon";

grant select on table "public"."user_consents" to "anon";

grant trigger on table "public"."user_consents" to "anon";

grant truncate on table "public"."user_consents" to "anon";

grant update on table "public"."user_consents" to "anon";

grant delete on table "public"."user_consents" to "authenticated";

grant insert on table "public"."user_consents" to "authenticated";

grant references on table "public"."user_consents" to "authenticated";

grant select on table "public"."user_consents" to "authenticated";

grant trigger on table "public"."user_consents" to "authenticated";

grant truncate on table "public"."user_consents" to "authenticated";

grant update on table "public"."user_consents" to "authenticated";

grant delete on table "public"."user_consents" to "service_role";

grant insert on table "public"."user_consents" to "service_role";

grant references on table "public"."user_consents" to "service_role";

grant select on table "public"."user_consents" to "service_role";

grant trigger on table "public"."user_consents" to "service_role";

grant truncate on table "public"."user_consents" to "service_role";

grant update on table "public"."user_consents" to "service_role";

grant delete on table "public"."user_roles" to "anon";

grant insert on table "public"."user_roles" to "anon";

grant references on table "public"."user_roles" to "anon";

grant select on table "public"."user_roles" to "anon";

grant trigger on table "public"."user_roles" to "anon";

grant truncate on table "public"."user_roles" to "anon";

grant update on table "public"."user_roles" to "anon";

grant delete on table "public"."user_roles" to "authenticated";

grant insert on table "public"."user_roles" to "authenticated";

grant references on table "public"."user_roles" to "authenticated";

grant select on table "public"."user_roles" to "authenticated";

grant trigger on table "public"."user_roles" to "authenticated";

grant truncate on table "public"."user_roles" to "authenticated";

grant update on table "public"."user_roles" to "authenticated";

grant delete on table "public"."user_roles" to "service_role";

grant insert on table "public"."user_roles" to "service_role";

grant references on table "public"."user_roles" to "service_role";

grant select on table "public"."user_roles" to "service_role";

grant trigger on table "public"."user_roles" to "service_role";

grant truncate on table "public"."user_roles" to "service_role";

grant update on table "public"."user_roles" to "service_role";

grant delete on table "public"."webhook_events" to "anon";

grant insert on table "public"."webhook_events" to "anon";

grant references on table "public"."webhook_events" to "anon";

grant select on table "public"."webhook_events" to "anon";

grant trigger on table "public"."webhook_events" to "anon";

grant truncate on table "public"."webhook_events" to "anon";

grant update on table "public"."webhook_events" to "anon";

grant delete on table "public"."webhook_events" to "authenticated";

grant insert on table "public"."webhook_events" to "authenticated";

grant references on table "public"."webhook_events" to "authenticated";

grant select on table "public"."webhook_events" to "authenticated";

grant trigger on table "public"."webhook_events" to "authenticated";

grant truncate on table "public"."webhook_events" to "authenticated";

grant update on table "public"."webhook_events" to "authenticated";

grant delete on table "public"."webhook_events" to "service_role";

grant insert on table "public"."webhook_events" to "service_role";

grant references on table "public"."webhook_events" to "service_role";

grant select on table "public"."webhook_events" to "service_role";

grant trigger on table "public"."webhook_events" to "service_role";

grant truncate on table "public"."webhook_events" to "service_role";

grant update on table "public"."webhook_events" to "service_role";


  create policy "Users can manage their addresses"
  on "public"."addresses"
  as permissive
  for all
  to public
using (((auth.uid() = user_id) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text)))
with check (((auth.uid() = user_id) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text)));



  create policy "Admins can view audit logs"
  on "public"."admin_audit_logs"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can update all appointments"
  on "public"."appointments"
  as permissive
  for update
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can view all appointments"
  on "public"."appointments"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Patients can create appointments"
  on "public"."appointments"
  as permissive
  for insert
  to public
with check ((patient_id = (auth.uid())::text));



  create policy "Patients can update their appointments"
  on "public"."appointments"
  as permissive
  for update
  to public
using ((patient_id = (auth.uid())::text));



  create policy "Patients can view their appointments"
  on "public"."appointments"
  as permissive
  for select
  to public
using ((patient_id = (auth.uid())::text));



  create policy "Practitioners can update their appointments"
  on "public"."appointments"
  as permissive
  for update
  to authenticated
using ((practitioner_id IN ( SELECT (practitioners.id)::text AS id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));



  create policy "Practitioners can view their appointments"
  on "public"."appointments"
  as permissive
  for select
  to authenticated
using ((practitioner_id IN ( SELECT (practitioners.id)::text AS id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));



  create policy "Patients can view shared care notes"
  on "public"."care_notes"
  as permissive
  for select
  to public
using (((shared_with_patient = true) AND (EXISTS ( SELECT 1
   FROM public.appointments
  WHERE ((appointments.id = care_notes.appointment_id) AND (appointments.patient_id = (auth.uid())::text))))));



  create policy "Practitioners can manage their care notes"
  on "public"."care_notes"
  as permissive
  for all
  to public
using ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));



  create policy "Admins can view sharing log"
  on "public"."care_notes_sharing_log"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "System can insert sharing log"
  on "public"."care_notes_sharing_log"
  as permissive
  for insert
  to public
with check (true);



  create policy "Admins can manage consent versions"
  on "public"."consent_versions"
  as permissive
  for all
  to public
using (public.is_admin(auth.uid()));



  create policy "Everyone can view active consent versions"
  on "public"."consent_versions"
  as permissive
  for select
  to public
using (((is_active = true) OR public.is_admin(auth.uid())));



  create policy "Users can manage their consents"
  on "public"."consents"
  as permissive
  for all
  to public
using (((auth.uid() = user_id) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text)))
with check (((auth.uid() = user_id) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text)));



  create policy "Patients can view their consultation reports"
  on "public"."consultation_reports"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.appointments
  WHERE ((appointments.id = consultation_reports.appointment_id) AND (appointments.patient_id = (auth.uid())::text)))));



  create policy "Practitioners can manage their consultation reports"
  on "public"."consultation_reports"
  as permissive
  for all
  to public
using ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));



  create policy "Admins can view access log"
  on "public"."consultation_reports_access_log"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "System can insert access log"
  on "public"."consultation_reports_access_log"
  as permissive
  for insert
  to public
with check (true);



  create policy "Users can create messages for their disputes"
  on "public"."dispute_messages"
  as permissive
  for insert
  to public
with check (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM public.disputes
  WHERE ((disputes.id = dispute_messages.dispute_id) AND ((disputes.raised_by = auth.uid()) OR public.is_admin(auth.uid())))))));



  create policy "Users can view messages for their disputes"
  on "public"."dispute_messages"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.disputes
  WHERE ((disputes.id = dispute_messages.dispute_id) AND ((disputes.raised_by = auth.uid()) OR public.is_admin(auth.uid()))))));



  create policy "Admins can manage all disputes"
  on "public"."disputes"
  as permissive
  for all
  to public
using (public.is_admin(auth.uid()));



  create policy "Users can create disputes for their appointments"
  on "public"."disputes"
  as permissive
  for insert
  to public
with check (((auth.uid() = raised_by) AND (EXISTS ( SELECT 1
   FROM public.appointments
  WHERE ((appointments.id = disputes.appointment_id) AND ((appointments.patient_id = (auth.uid())::text) OR (appointments.practitioner_id = (auth.uid())::text)))))));



  create policy "Users can view their own disputes"
  on "public"."disputes"
  as permissive
  for select
  to public
using (((auth.uid() = raised_by) OR (EXISTS ( SELECT 1
   FROM public.appointments
  WHERE ((appointments.id = disputes.appointment_id) AND ((appointments.patient_id = (auth.uid())::text) OR (appointments.practitioner_id = (auth.uid())::text)))))));



  create policy "Practitioners can view emergency contacts for active appointmen"
  on "public"."emergency_contacts"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.appointments a
     JOIN public.practitioners p ON ((a.practitioner_id = (p.id)::text)))
  WHERE ((p.user_id = auth.uid()) AND (a.patient_id = (emergency_contacts.user_id)::text) AND (a.status = 'in-progress'::text)))));



  create policy "Users can manage their emergency contacts"
  on "public"."emergency_contacts"
  as permissive
  for all
  to public
using (((auth.uid() = user_id) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text)))
with check (((auth.uid() = user_id) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text)));



  create policy "Admins can manage FAQs"
  on "public"."faqs"
  as permissive
  for all
  to public
using (public.is_admin(auth.uid()));



  create policy "Everyone can view published FAQs"
  on "public"."faqs"
  as permissive
  for select
  to public
using (((is_published = true) OR public.is_admin(auth.uid())));



  create policy "Service role can insert access logs"
  on "public"."file_access_logs"
  as permissive
  for insert
  to public
with check (true);



  create policy "Users can view their own access logs"
  on "public"."file_access_logs"
  as permissive
  for select
  to public
using (((auth.uid() = user_id) OR public.is_admin(auth.uid())));



  create policy "Users can delete their own files"
  on "public"."files"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert their own files"
  on "public"."files"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update their own files"
  on "public"."files"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their own files"
  on "public"."files"
  as permissive
  for select
  to public
using (((auth.uid() = user_id) OR (auth.uid() = ANY (shared_with)) OR public.is_admin(auth.uid())));



  create policy "Coaches can manage participants in their sessions"
  on "public"."group_session_participants"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.group_sessions gs
  WHERE ((gs.id = group_session_participants.session_id) AND (gs.coach_id IN ( SELECT practitioners.id
           FROM public.practitioners
          WHERE (practitioners.user_id = auth.uid())))))));



  create policy "Participants can view their own registrations"
  on "public"."group_session_participants"
  as permissive
  for select
  to public
using (((auth.uid() = patient_id) OR (EXISTS ( SELECT 1
   FROM public.group_sessions gs
  WHERE ((gs.id = group_session_participants.session_id) AND (gs.coach_id IN ( SELECT practitioners.id
           FROM public.practitioners
          WHERE (practitioners.user_id = auth.uid()))))))));



  create policy "Users can register for group sessions"
  on "public"."group_session_participants"
  as permissive
  for insert
  to public
with check ((auth.uid() = patient_id));



  create policy "Authenticated users can view group sessions"
  on "public"."group_sessions"
  as permissive
  for select
  to authenticated
using ((status = ANY (ARRAY['confirmee'::text, 'planifiee'::text])));



  create policy "Coaches can manage their group sessions"
  on "public"."group_sessions"
  as permissive
  for all
  to public
using ((coach_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));



  create policy "Admins can manage ledger accounts"
  on "public"."ledger_accounts"
  as permissive
  for all
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can view all ledger accounts"
  on "public"."ledger_accounts"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can manage ledger entries"
  on "public"."ledger_entries"
  as permissive
  for all
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can view all ledger entries"
  on "public"."ledger_entries"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Patients can create their own medical profile"
  on "public"."medical_profiles"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Patients can delete their own medical profile"
  on "public"."medical_profiles"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Patients can update their own medical profile"
  on "public"."medical_profiles"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Patients can view their own medical profile"
  on "public"."medical_profiles"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Practitioners can view shared medical profiles for active appoi"
  on "public"."medical_profiles"
  as permissive
  for select
  to public
using (((share_with_practitioner = true) AND (EXISTS ( SELECT 1
   FROM (public.appointments a
     JOIN public.practitioners p ON ((a.practitioner_id = (p.id)::text)))
  WHERE ((p.user_id = auth.uid()) AND (a.patient_id = (medical_profiles.user_id)::text) AND (a.status = ANY (ARRAY['confirmed'::text, 'in-progress'::text])) AND (((a.date)::date >= (CURRENT_DATE - '1 day'::interval)) AND ((a.date)::date <= (CURRENT_DATE + '1 day'::interval))))))));



  create policy "Users can manage their medical profile"
  on "public"."medical_profiles"
  as permissive
  for all
  to public
using ((auth.uid() = user_id));



  create policy "Users can create messages for their appointments"
  on "public"."messages"
  as permissive
  for insert
  to public
with check (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM public.appointments
  WHERE ((appointments.id = messages.appointment_id) AND ((appointments.patient_id = (auth.uid())::text) OR (appointments.practitioner_id = (auth.uid())::text)))))));



  create policy "Users can delete their own messages"
  on "public"."messages"
  as permissive
  for delete
  to public
using ((auth.uid() = sender_id));



  create policy "Users can view messages for their appointments"
  on "public"."messages"
  as permissive
  for select
  to public
using (((auth.uid() = sender_id) OR (EXISTS ( SELECT 1
   FROM public.appointments
  WHERE ((appointments.id = messages.appointment_id) AND ((appointments.patient_id = (auth.uid())::text) OR (appointments.practitioner_id = (auth.uid())::text)))))));



  create policy "Users can manage their notification preferences"
  on "public"."notification_preferences"
  as permissive
  for all
  to public
using ((auth.uid() = user_id));



  create policy "Users can update their notifications"
  on "public"."notifications"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their notifications"
  on "public"."notifications"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Admins can view OTP attempts"
  on "public"."otp_attempts"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can view OTP rate limits"
  on "public"."otp_rate_limits"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "System can manage OTP rate limits"
  on "public"."otp_rate_limits"
  as permissive
  for all
  to public
using (false)
with check (false);



  create policy "Admins can view all payment attempts"
  on "public"."payment_attempts"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE (user_roles.user_id = auth.uid()))));



  create policy "Users can create their own payment attempts"
  on "public"."payment_attempts"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can view their own payment attempts"
  on "public"."payment_attempts"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Admins can view all payment events"
  on "public"."payment_events"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Practitioners can view payment events for their appointments"
  on "public"."payment_events"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.payments p
     JOIN public.appointments a ON ((a.id = p.appointment_id)))
  WHERE ((p.id = payment_events.payment_id) AND (a.practitioner_id = (public.get_practitioner_id_for_user(auth.uid()))::text)))));



  create policy "Service role can insert payment events"
  on "public"."payment_events"
  as permissive
  for insert
  to public
with check (true);



  create policy "Users can view events for their payments"
  on "public"."payment_events"
  as permissive
  for select
  to public
using (((EXISTS ( SELECT 1
   FROM public.payments
  WHERE ((payments.id = payment_events.payment_id) AND (payments.patient_id = auth.uid())))) OR public.is_admin(auth.uid())));



  create policy "Users can view their payment events"
  on "public"."payment_events"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.payments
  WHERE ((payments.id = payment_events.payment_id) AND (payments.patient_id = auth.uid())))));



  create policy "Admins can view reconciliations"
  on "public"."payment_reconciliations"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Service role can insert reconciliations"
  on "public"."payment_reconciliations"
  as permissive
  for insert
  to public
with check (true);



  create policy "Admins can manage refunds"
  on "public"."payment_refunds"
  as permissive
  for all
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can view refunds"
  on "public"."payment_refunds"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can update all payments"
  on "public"."payments"
  as permissive
  for update
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can view all payments"
  on "public"."payments"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Coaches can view payments for their group sessions"
  on "public"."payments"
  as permissive
  for select
  to public
using (((appointment_id ~~ 'group_session_%'::text) AND (EXISTS ( SELECT 1
   FROM (public.group_sessions gs
     JOIN public.practitioners p ON ((p.id = gs.coach_id)))
  WHERE ((p.user_id = auth.uid()) AND (payments.appointment_id ~~ (('%'::text || (gs.id)::text) || '%'::text)))))));



  create policy "Practitioners can view payments for their appointments"
  on "public"."payments"
  as permissive
  for select
  to authenticated
using (((EXISTS ( SELECT 1
   FROM public.appointments a
  WHERE ((a.id = payments.appointment_id) AND (a.practitioner_id = (auth.uid())::text)))) OR ((patient_id)::text = (auth.uid())::text)));



  create policy "Users can create their own payments"
  on "public"."payments"
  as permissive
  for insert
  to public
with check ((auth.uid() = patient_id));



  create policy "Users can update their own payments"
  on "public"."payments"
  as permissive
  for update
  to public
using ((auth.uid() = patient_id));



  create policy "Users can view their own payments"
  on "public"."payments"
  as permissive
  for select
  to public
using ((auth.uid() = patient_id));



  create policy "Admins can manage payout batches"
  on "public"."payout_batches"
  as permissive
  for all
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can view payout batches"
  on "public"."payout_batches"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can view payout payments"
  on "public"."payout_payments"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Practitioners can view their payout payments"
  on "public"."payout_payments"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.practitioner_payouts pp
     JOIN public.practitioners p ON ((p.id = pp.practitioner_id)))
  WHERE ((pp.id = payout_payments.payout_id) AND (p.user_id = auth.uid())))));



  create policy "Authenticated users can view availability"
  on "public"."practitioner_availability"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Practitioners can manage their availability"
  on "public"."practitioner_availability"
  as permissive
  for all
  to public
using ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));



  create policy "Admins can manage balances"
  on "public"."practitioner_balances"
  as permissive
  for all
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can view all balances"
  on "public"."practitioner_balances"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Practitioners can view their balance"
  on "public"."practitioner_balances"
  as permissive
  for select
  to public
using ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));



  create policy "Practitioners can manage their exceptions"
  on "public"."practitioner_exceptions"
  as permissive
  for all
  to public
using ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));



  create policy "Admins can view all payment info"
  on "public"."practitioner_payment_info"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Practitioners can manage their payment info"
  on "public"."practitioner_payment_info"
  as permissive
  for all
  to public
using ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));



  create policy "Admins can manage all payouts"
  on "public"."practitioner_payouts"
  as permissive
  for all
  to public
using (public.is_admin(auth.uid()));



  create policy "Practitioners can view their own payouts"
  on "public"."practitioner_payouts"
  as permissive
  for select
  to public
using ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));



  create policy "Practitioners can view their payouts"
  on "public"."practitioner_payouts"
  as permissive
  for select
  to public
using ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));



  create policy "Authenticated users can view rates"
  on "public"."practitioner_rates"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Practitioners can manage their rates"
  on "public"."practitioner_rates"
  as permissive
  for all
  to public
using ((practitioner_id IN ( SELECT practitioners.id
   FROM public.practitioners
  WHERE (practitioners.user_id = auth.uid()))));



  create policy "Admins can update practitioners"
  on "public"."practitioners"
  as permissive
  for update
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can view all practitioners"
  on "public"."practitioners"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Authenticated users view limited practitioner info"
  on "public"."practitioners"
  as permissive
  for select
  to authenticated
using (((kyc_status = 'approved'::text) AND ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));



  create policy "Practitioners can insert their own profile"
  on "public"."practitioners"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Practitioners can update their own profile"
  on "public"."practitioners"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "patients_view_booked_practitioner_limited"
  on "public"."practitioners"
  as permissive
  for select
  to public
using (((auth.uid() = user_id) OR public.is_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.appointments a
  WHERE ((a.practitioner_id = (practitioners.id)::text) AND (a.patient_id = (auth.uid())::text) AND (a.status = ANY (ARRAY['confirmed'::text, 'in-progress'::text, 'completed'::text, 'pending_payment'::text])))))));



  create policy "Admins can view all profiles"
  on "public"."profiles"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Practitioners can view patient profiles for appointments"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.appointments a
     JOIN public.practitioners p ON ((a.practitioner_id = (p.id)::text)))
  WHERE ((p.user_id = auth.uid()) AND (a.patient_id = (profiles.id)::text) AND (a.status = ANY (ARRAY['confirmed'::text, 'in-progress'::text, 'completed'::text, 'pending_payment'::text]))))));



  create policy "Service role can insert profiles"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check (((auth.jwt() ->> 'role'::text) = 'service_role'::text));



  create policy "Users can delete own profile"
  on "public"."profiles"
  as permissive
  for delete
  to public
using ((auth.uid() = id));



  create policy "Users can insert own profile"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((auth.uid() = id));



  create policy "Users can update own profile"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((auth.uid() = id));



  create policy "Users can view own profile"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((auth.uid() = id));



  create policy "Users can delete their own subscriptions"
  on "public"."push_subscriptions"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert their own subscriptions"
  on "public"."push_subscriptions"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can view their own subscriptions"
  on "public"."push_subscriptions"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Admins can create reconciliation reports"
  on "public"."reconciliation_reports"
  as permissive
  for insert
  to public
with check (public.is_admin(auth.uid()));



  create policy "Admins can update reconciliation reports"
  on "public"."reconciliation_reports"
  as permissive
  for update
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can view reconciliation reports"
  on "public"."reconciliation_reports"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Patients can create reviews for their appointments"
  on "public"."reviews"
  as permissive
  for insert
  to public
with check (((auth.uid() = patient_id) AND (EXISTS ( SELECT 1
   FROM public.appointments
  WHERE ((appointments.id = reviews.appointment_id) AND (appointments.patient_id = (auth.uid())::text) AND (appointments.status = 'completed'::text))))));



  create policy "Users can view reviews"
  on "public"."reviews"
  as permissive
  for select
  to public
using (((is_hidden = false) OR public.is_admin(auth.uid()) OR (auth.uid() = patient_id)));



  create policy "Users can create their saved payment methods"
  on "public"."saved_payment_methods"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can delete their saved payment methods"
  on "public"."saved_payment_methods"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can update their saved payment methods"
  on "public"."saved_payment_methods"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their saved payment methods"
  on "public"."saved_payment_methods"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Admins can view all search activity logs"
  on "public"."search_activity_logs"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Authenticated users can insert search activity logs"
  on "public"."search_activity_logs"
  as permissive
  for insert
  to public
with check (((auth.uid() IS NOT NULL) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text)));



  create policy "Only admins can view service audit logs"
  on "public"."service_audit_log"
  as permissive
  for select
  to authenticated
using (public.has_role(auth.uid(), 'super_admin'::public.app_role));



  create policy "Anyone can view active services"
  on "public"."services"
  as permissive
  for select
  to public
using ((is_active = true));



  create policy "Only admins can delete services"
  on "public"."services"
  as permissive
  for delete
  to authenticated
using (public.has_role(auth.uid(), 'super_admin'::public.app_role));



  create policy "Only admins can insert services"
  on "public"."services"
  as permissive
  for insert
  to authenticated
with check (public.has_role(auth.uid(), 'super_admin'::public.app_role));



  create policy "Only admins can update services"
  on "public"."services"
  as permissive
  for update
  to authenticated
using (public.has_role(auth.uid(), 'super_admin'::public.app_role))
with check (public.has_role(auth.uid(), 'super_admin'::public.app_role));



  create policy "Admins can manage all support tickets"
  on "public"."support_tickets"
  as permissive
  for all
  to public
using (public.is_admin(auth.uid()));



  create policy "Users can create support tickets"
  on "public"."support_tickets"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update their support tickets"
  on "public"."support_tickets"
  as permissive
  for update
  to public
using (((auth.uid() = user_id) OR public.is_admin(auth.uid())));



  create policy "Users can view their support tickets"
  on "public"."support_tickets"
  as permissive
  for select
  to public
using (((auth.uid() = user_id) OR public.is_admin(auth.uid())));



  create policy "Admins can manage system config"
  on "public"."system_config"
  as permissive
  for all
  to public
using (public.is_admin(auth.uid()));



  create policy "Users can create their triage results"
  on "public"."triage_results"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can delete their triage results"
  on "public"."triage_results"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their triage results"
  on "public"."triage_results"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Users can manage their consents"
  on "public"."user_consents"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "Users can view their consents"
  on "public"."user_consents"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Super admins can manage all roles"
  on "public"."user_roles"
  as permissive
  for all
  to public
using (public.has_role(auth.uid(), 'super_admin'::public.app_role));



  create policy "Users can view their own roles"
  on "public"."user_roles"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Admins can view webhook events"
  on "public"."webhook_events"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Service role can insert webhook events"
  on "public"."webhook_events"
  as permissive
  for insert
  to public
with check (true);


CREATE TRIGGER care_notes_sharing_audit AFTER UPDATE ON public.care_notes FOR EACH ROW EXECUTE FUNCTION public.log_care_notes_sharing_change();

CREATE TRIGGER update_care_notes_updated_at BEFORE UPDATE ON public.care_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_update_files_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.update_files_updated_at();

CREATE TRIGGER validate_coach_type_before_group_session BEFORE INSERT OR UPDATE ON public.group_sessions FOR EACH ROW EXECUTE FUNCTION public.validate_coach_for_group_session();

CREATE TRIGGER after_otp_attempt_cleanup AFTER INSERT ON public.otp_attempts FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_cleanup_otp_attempts();

CREATE TRIGGER trigger_set_invoice_number BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_invoice_number();

CREATE TRIGGER trigger_update_balance_on_payment AFTER INSERT OR UPDATE OF status, payout_status, net_amount ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_practitioner_balance_on_payment_change();

CREATE TRIGGER update_practitioner_balances_updated_at BEFORE UPDATE ON public.practitioner_balances FOR EACH ROW EXECUTE FUNCTION public.update_practitioner_balance_timestamp();

CREATE TRIGGER update_practitioner_payouts_updated_at BEFORE UPDATE ON public.practitioner_payouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_practitioner_rates_updated_at BEFORE UPDATE ON public.practitioner_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER ensure_phone_uniqueness BEFORE INSERT OR UPDATE OF phone ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.check_phone_uniqueness();

CREATE TRIGGER service_changes_audit AFTER INSERT OR DELETE OR UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.log_service_changes();

CREATE TRIGGER on_auth_user_created_safe AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_safe();


  create policy "Users can delete their own attachments"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'message-attachments'::text) AND ((storage.foldername(name))[1] IN ( SELECT a.id
   FROM public.appointments a
  WHERE ((a.patient_id = (auth.uid())::text) OR (a.practitioner_id = (auth.uid())::text))))));



  create policy "Users can upload attachments for their conversations"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'message-attachments'::text) AND ((storage.foldername(name))[1] IN ( SELECT a.id
   FROM public.appointments a
  WHERE ((a.patient_id = (auth.uid())::text) OR (a.practitioner_id = (auth.uid())::text))))));



  create policy "Users can view attachments from their conversations"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'message-attachments'::text) AND ((storage.foldername(name))[1] IN ( SELECT a.id
   FROM public.appointments a
  WHERE ((a.patient_id = (auth.uid())::text) OR (a.practitioner_id = (auth.uid())::text))))));



