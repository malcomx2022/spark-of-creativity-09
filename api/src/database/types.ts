/**
 * Types Kysely des tables utilisées par l'API (sous-ensemble de db/native/schema.native.sql).
 * À étendre module par module ; une génération automatique (kysely-codegen) pourra
 * remplacer ce fichier une fois la base de dev standardisée.
 */
import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

type Timestamp = ColumnType<Date, Date | string, Date | string>;
/** Colonne horodatée avec DEFAULT now() : optionnelle à l'insertion. */
type GeneratedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Json = ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;

export type AppRoleDb =
  | 'super_admin' | 'ops' | 'finance' | 'compliance' | 'support' | 'analyst'
  | 'patient' | 'practitioner' | 'coach';

export type PractitionerType =
  | 'medecin' | 'infirmier' | 'kinesitherapeute' | 'nutritionniste'
  | 'sage_femme' | 'psychologue' | 'coach_sportif' | 'autre';

export interface UsersTable {
  id: Generated<string>;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  email_verified_at: Timestamp | null;
  phone_verified_at: Timestamp | null;
  last_sign_in_at: Timestamp | null;
  failed_login_attempts: Generated<number>;
  locked_until: Timestamp | null;
  banned_until: Timestamp | null;
  raw_user_meta_data: Json;
  raw_app_meta_data: Json;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  deleted_at: Timestamp | null;
}

export interface RefreshTokensTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  family_id: Generated<string>;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  created_at: GeneratedTimestamp;
}

export type AuthTokenKind = 'email_verification' | 'password_reset' | 'magic_link' | 'phone_otp' | 'email_otp';

export interface AuthTokensTable {
  id: Generated<string>;
  user_id: string | null;
  identifier: string;
  kind: AuthTokenKind;
  token_hash: string;
  expires_at: Timestamp;
  consumed_at: Timestamp | null;
  attempts: Generated<number>;
  created_at: GeneratedTimestamp;
}

export interface ProfilesTable {
  id: string;
  full_name: string | null;
  phone: string | null;
  gender: 'homme' | 'femme' | 'autre' | 'non_specifie' | null;
  date_of_birth: ColumnType<Date, string, string> | null;
  avatar_url: string | null;
  two_factor_enabled: boolean | null;
  two_factor_secret: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface UserRolesTable {
  id: Generated<string>;
  user_id: string;
  role: AppRoleDb;
  created_at: GeneratedTimestamp;
  created_by: string | null;
}

export type KycStatus = 'pending' | 'approved' | 'rejected' | 'incomplete';

export interface PractitionersTable {
  id: Generated<string>;
  user_id: string;
  name: string;
  specialty: string;
  phone: string | null;
  address: string | null;
  latitude: ColumnType<string | null, number | string | null, number | string | null>;
  longitude: ColumnType<string | null, number | string | null, number | string | null>;
  available: Generated<boolean | null>;
  rating: ColumnType<string | null, number | null, number | null>;
  image: string | null;
  bio: string | null;
  diplomas: string[] | null;
  languages: string[] | null;
  years_experience: Generated<number | null>;
  intervention_radius: Generated<number | null>;
  communes_served: string[] | null;
  is_online: Generated<boolean | null>;
  kyc_status: Generated<KycStatus | null>;
  kyc_comment: string | null;
  kyc_validated_at: Timestamp | null;
  id_document_url: string | null;
  license_number: string | null;
  license_document_url: string | null;
  insurance_document_url: string | null;
  can_accept_missions: Generated<boolean | null>;
  id_document_expiry: ColumnType<Date, string, string> | null;
  license_expiry: ColumnType<Date, string, string> | null;
  insurance_expiry: ColumnType<Date, string, string> | null;
  kyc_reviewed_by: string | null;
  kyc_reviewed_at: Timestamp | null;
  practitioner_type: Generated<PractitionerType | null>;
  session_types: string[] | null;
  intervention_zone: string | null;
  certifications: string[] | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface PractitionerAvailabilityTable {
  id: Generated<string>;
  practitioner_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: Generated<boolean | null>;
  created_at: GeneratedTimestamp;
}

export interface PractitionerExceptionsTable {
  id: Generated<string>;
  practitioner_id: string;
  date: ColumnType<Date | string, string, string>; // node-pg renvoie Date ; comparaisons WHERE en chaîne AAAA-MM-JJ
  reason: string | null;
  is_available: Generated<boolean | null>;
  created_at: GeneratedTimestamp;
}

export interface PractitionerRatesTable {
  id: Generated<string>;
  practitioner_id: string;
  service_type: string;
  base_price: number;
  duration_minutes: Generated<number | null>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface FilesTable {
  id: Generated<string>;
  user_id: string;
  file_name: string;
  file_path: string;
  file_size: ColumnType<string | number, number, number>;
  file_type: string | null;
  storage_provider: Generated<string | null>;
  folder: string | null;
  metadata: ColumnType<Record<string, unknown> | null, string | null, string | null>;
  shared_with: string[] | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface FileAccessLogsTable {
  id: Generated<string>;
  file_id: string | null;
  user_id: string | null;
  access_type: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: GeneratedTimestamp;
}

export interface NotificationsTable {
  id: Generated<string>;
  user_id: string;
  title: string;
  message: string;
  type: string | null;
  is_read: Generated<boolean | null>;
  link: string | null;
  created_at: GeneratedTimestamp;
}

export type AppointmentStatus =
  | 'pending_payment' | 'awaiting_practitioner' | 'confirmed' | 'pending' | 'in-progress'
  | 'awaiting_confirmation' | 'completed' | 'cancelled_unpaid' | 'cancelled' | 'rejected';
export type PractitionerStatus = 'assigned' | 'preparing' | 'en_route' | 'arrived' | 'in_progress';
export type VisitStatus = 'scheduled' | 'en_route' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';

/** Identifiants en TEXT (héritage du schéma Lovable) : patient_id / practitioner_id sont des UUID sérialisés. */
export interface AppointmentsTable {
  id: Generated<string>;
  patient_id: string;
  patient_name: string;
  practitioner_id: string;
  practitioner_name: string;
  specialty: string;
  date: string;
  time: string;
  duration: Generated<number>;
  status: Generated<AppointmentStatus>;
  address: string;
  reason: string;
  notes: string | null;
  urgency_level: string | null;
  visit_status: Generated<VisitStatus | null>;
  pre_visit_checklist: ColumnType<Record<string, unknown> | null, string | null, string | null>;
  internal_notes: string | null;
  payment_amount: number | null;
  practitioner_status: Generated<PractitionerStatus | null>;
  payment_expires_at: Timestamp | null;
  confirmation_requested_at: Timestamp | null;
  patient_confirmed_at: Timestamp | null;
  practitioner_latitude: ColumnType<string | null, number | null, number | null>;
  practitioner_longitude: ColumnType<string | null, number | null, number | null>;
  practitioner_last_location_update: Timestamp | null;
  consultation_started_at: Timestamp | null;
  consultation_ended_at: Timestamp | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export type PaymentStatus = 'initiated' | 'pending' | 'authorized' | 'paid' | 'failed' | 'canceled' | 'refunded' | 'partially_refunded' | 'chargeback';
export type PayoutStatus = 'pending' | 'held' | 'ready' | 'paid' | 'failed';

export interface PaymentsTable {
  id: Generated<string>;
  appointment_id: string;
  patient_id: string;
  amount: number;
  currency: Generated<string>;
  payment_method: string;
  status: Generated<PaymentStatus>;
  fedapay_transaction_id: string | null;
  fedapay_payment_url: string | null;
  commission_amount: Generated<number | null>;
  fees_amount: Generated<number | null>;
  net_amount: number | null;
  gateway_fees_amount: Generated<number | null>;
  hold_until: Timestamp | null;
  payout_status: Generated<PayoutStatus | null>;
  idempotency_key: string | null;
  channel: 'card' | 'momo' | null;
  provider_ref: string | null;
  payment_session_data: ColumnType<Record<string, unknown> | null, string | null, string | null>;
  receipt_url: string | null;
  invoice_number: string | null;
  payer_name: string | null;
  payer_email: string | null;
  payer_phone: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface PaymentEventsTable {
  id: Generated<string>;
  payment_id: string;
  event_type: string;
  event_data: ColumnType<Record<string, unknown> | null, string | null, string | null>;
  created_at: GeneratedTimestamp;
}

export interface PaymentAttemptsTable {
  id: Generated<string>;
  payment_id: string | null;
  appointment_id: string | null;
  user_id: string;
  attempt_number: Generated<number>;
  status: 'pending' | 'success' | 'failed' | 'timeout';
  error_type: string | null;
  error_message: string | null;
  error_details: ColumnType<Record<string, unknown> | null, string | null, string | null>;
  payment_method: string;
  phone_number_encrypted: string | null;
  amount: number;
  retry_after: Timestamp | null;
  created_at: GeneratedTimestamp;
  completed_at: Timestamp | null;
}

export interface WebhookEventsTable {
  id: Generated<string>;
  event_id: string;
  event_type: string;
  payload: ColumnType<Record<string, unknown>, string, string>;
  processed_at: GeneratedTimestamp;
  created_at: GeneratedTimestamp;
  processing_status: Generated<'pending' | 'processing' | 'success' | 'failed' | 'permanently_failed' | null>;
  retry_count: Generated<number | null>;
  last_retry_at: Timestamp | null;
  error_message: string | null;
  error_stack: string | null;
}

export type LedgerOwnerType = 'platform' | 'patient' | 'practitioner';
export type LedgerAccountType = 'cash' | 'payable' | 'receivable' | 'revenue_commission' | 'revenue_fees' | 'obligation' | 'expense_gateway';

export interface LedgerAccountsTable {
  id: Generated<string>;
  owner_type: LedgerOwnerType;
  owner_id: string | null;
  account_type: LedgerAccountType;
  currency: Generated<string>;
  created_at: GeneratedTimestamp;
}

export interface LedgerEntriesTable {
  id: Generated<string>;
  account_id: string;
  debit: Generated<number>;
  credit: Generated<number>;
  currency: Generated<string>;
  reference_type: string;
  reference_id: string;
  description: string | null;
  created_at: GeneratedTimestamp;
}

export interface PractitionerBalancesTable {
  practitioner_id: string;
  balance_available: Generated<number>;
  balance_pending: Generated<number>;
  balance_on_hold: Generated<number>;
  currency: Generated<string>;
  last_payout_at: Timestamp | null;
  updated_at: GeneratedTimestamp;
}

export interface SystemConfigTable {
  id: Generated<string>;
  key: string;
  value: ColumnType<unknown, string, string>;
  description: string | null;
  updated_by: string | null;
  updated_at: GeneratedTimestamp;
}

export interface AddressesTable {
  id: Generated<string>;
  user_id: string;
  label: string;
  address: string;
  city: string | null;
  postal_code: string | null;
  latitude: ColumnType<string | null, number | null, number | null>;
  longitude: ColumnType<string | null, number | null, number | null>;
  is_default: Generated<boolean | null>;
  created_at: GeneratedTimestamp;
}

export interface MessagesTable {
  id: Generated<string>;
  appointment_id: string;
  sender_id: string;
  content: string;
  is_read: Generated<boolean | null>;
  attachment_url: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  created_at: GeneratedTimestamp;
}

export interface NotificationPreferencesTable {
  id: Generated<string>;
  user_id: string;
  email_enabled: Generated<boolean | null>;
  sms_enabled: Generated<boolean | null>;
  whatsapp_enabled: Generated<boolean | null>;
  push_enabled: Generated<boolean | null>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface PushSubscriptionsTable {
  id: Generated<string>;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface ServicesTable {
  id: Generated<string>;
  name: string;
  description: string | null;
  category: string | null;
  base_price: number | null;
  duration: number | null;
  is_active: Generated<boolean | null>;
  created_at: GeneratedTimestamp;
}

export type GroupSessionStatus = 'planifiee' | 'confirmee' | 'annulee' | 'terminee';
export type GroupSessionType = 'individuelle' | 'duo' | 'groupe';
export type ParticipantPaymentStatus = 'pending' | 'paid' | 'refunded';

export interface GroupSessionsTable {
  id: Generated<string>;
  coach_id: string;
  session_name: string;
  session_type: GroupSessionType;
  max_participants: Generated<number | null>;
  min_participants: Generated<number | null>;
  current_participants: Generated<number | null>;
  scheduled_date: ColumnType<Date | string, string, string>;
  start_time: string;
  end_time: string;
  price_per_person: number;
  location: string;
  status: Generated<GroupSessionStatus | null>;
  description: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface GroupSessionParticipantsTable {
  id: Generated<string>;
  session_id: string;
  patient_id: string;
  payment_status: Generated<ParticipantPaymentStatus | null>;
  joined_at: GeneratedTimestamp;
}

export type PractitionerPayoutStatus = 'planned' | 'sent' | 'completed' | 'failed';
export type PayoutBatchStatus = 'queued' | 'processing' | 'sent' | 'failed' | 'partially_sent';
export type PayoutMethod = 'mtn' | 'moov' | 'bank';

export interface PractitionerPayoutsTable {
  id: Generated<string>;
  practitioner_id: string;
  amount: number;
  currency: Generated<string | null>;
  payment_method: string;
  account_details: ColumnType<Record<string, unknown> | null, string | null, string | null>;
  status: Generated<PractitionerPayoutStatus | null>;
  period_start: ColumnType<Date | string, string, string>;
  period_end: ColumnType<Date | string, string, string>;
  created_at: GeneratedTimestamp;
  processed_at: Timestamp | null;
  batch_id: string | null;
  net_amount: number | null;
  commission_amount: number | null;
  fees_amount: number | null;
  transaction_ids: string[] | null;
}

export interface PayoutBatchesTable {
  id: Generated<string>;
  created_by: string;
  batch_date: ColumnType<Date | string, string | undefined, string>;
  payment_method: string;
  status: Generated<PayoutBatchStatus>;
  total_amount: Generated<number>;
  practitioners_count: Generated<number>;
  statement_url: string | null;
  processed_at: Timestamp | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface PayoutPaymentsTable {
  id: Generated<string>;
  payout_id: string;
  payment_id: string;
  amount_included: number;
  created_at: GeneratedTimestamp;
}

export interface PaymentRefundsTable {
  id: Generated<string>;
  payment_id: string;
  refund_amount: number;
  refund_reason: string | null;
  refunded_by: string;
  provider_refund_id: string | null;
  status: Generated<string>;
  created_at: GeneratedTimestamp;
  processed_at: Timestamp | null;
}

export interface PractitionerPaymentInfoTable {
  id: Generated<string>;
  practitioner_id: string;
  payment_method: PayoutMethod;
  phone_number: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
  account_holder_name: string;
  is_verified: Generated<boolean | null>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface PaymentReconciliationsTable {
  id: Generated<string>;
  payment_id: string | null;
  old_status: string;
  new_status: string;
  fedapay_status: string;
  fedapay_transaction_data: ColumnType<Record<string, unknown> | null, string | null, string | null>;
  reconciliation_type: 'status_mismatch' | 'manual' | 'webhook_replay';
  reconciled_by: string | null;
  reconciled_at: GeneratedTimestamp;
  notes: string | null;
}

export interface ReconciliationReportsTable {
  id: Generated<string>;
  created_at: GeneratedTimestamp;
  created_by: string | null;
  period_start: Timestamp;
  period_end: Timestamp;
  status: Generated<string>;
  total_fedapay_transactions: Generated<number>;
  total_db_payments: Generated<number>;
  matched_count: Generated<number>;
  missing_in_db_count: Generated<number>;
  missing_in_fedapay_count: Generated<number>;
  amount_mismatch_count: Generated<number>;
  status_mismatch_count: Generated<number>;
  total_amount_discrepancy: Generated<number>;
  anomalies: ColumnType<unknown, string | null, string | null>;
  recommendations: ColumnType<unknown, string | null, string | null>;
  completed_at: Timestamp | null;
  updated_at: GeneratedTimestamp;
}

export interface AdminAuditLogsTable {
  id: Generated<string>;
  admin_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: ColumnType<Record<string, unknown> | null, string | null, string | null>;
  ip_address: string | null;
  created_at: GeneratedTimestamp;
}

export interface SearchActivityLogsTable {
  id: Generated<string>;
  user_id: string | null;
  session_id: string;
  action_type: string;
  practitioner_id: string | null;
  search_filters: ColumnType<Record<string, unknown> | null, string | null, string | null>;
  metadata: ColumnType<Record<string, unknown> | null, string | null, string | null>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: GeneratedTimestamp;
}

export interface ReviewsTable {
  id: Generated<string>;
  appointment_id: string;
  patient_id: string;
  practitioner_id: string;
  rating: number;
  comment: string | null;
  created_at: GeneratedTimestamp;
  is_hidden: Generated<boolean | null>;
  moderation_reason: string | null;
  moderated_by: string | null;
  moderated_at: Timestamp | null;
}

export type ConsentType = 'cgu' | 'charte' | 'partage_donnees' | 'marketing';

export interface ConsentsTable {
  id: Generated<string>;
  user_id: string;
  consent_type: ConsentType;
  is_accepted: Generated<boolean | null>;
  accepted_at: Timestamp | null;
  created_at: GeneratedTimestamp;
  /** Ajoutée par db/native/130_fixes_heritage.sql : version de consent_versions acceptée. */
  accepted_version: string | null;
}

export interface ConsentVersionsTable {
  id: Generated<string>;
  consent_type: ConsentType;
  version: string;
  content: string;
  is_active: Generated<boolean | null>;
  effective_date: Timestamp | null;
  created_by: string | null;
  created_at: GeneratedTimestamp;
}

export interface OtpRateLimitsTable {
  phone_number: string;
  attempts: Generated<number | null>;
  first_attempt_at: GeneratedTimestamp;
  blocked_until: Timestamp | null;
}

export interface EmergencyContactsTable {
  id: Generated<string>;
  user_id: string;
  name: string;
  phone: string;
  relationship: string | null;
  created_at: GeneratedTimestamp;
}

export interface MedicalProfilesTable {
  id: Generated<string>;
  user_id: string;
  blood_type: Generated<string | null>;
  allergies: string | null;
  chronic_diseases: string | null;
  current_medications: string | null;
  additional_notes: string | null;
  share_with_practitioner: Generated<boolean | null>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  primary_doctor_id: string | null;
  primary_doctor_name: string | null;
  primary_doctor_email: string | null;
  primary_doctor_phone: string | null;
}

export type TicketStatus = 'ouvert' | 'en_cours' | 'resolu' | 'ferme';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'closed';

export interface SupportTicketsTable {
  id: Generated<string>;
  user_id: string;
  appointment_id: string | null;
  subject: string;
  description: string;
  status: Generated<TicketStatus | null>;
  attachments: string[] | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  assigned_to: string | null;
  priority: Generated<Priority | null>;
  tags: string[] | null;
  resolved_at: Timestamp | null;
  admin_response: string | null;
  responded_at: Timestamp | null;
  responded_by: string | null;
}

export interface FaqsTable {
  id: Generated<string>;
  category: string;
  question: string;
  answer: string;
  target_audience: Generated<'all' | 'patients' | 'practitioners' | null>;
  is_published: Generated<boolean | null>;
  version: Generated<number | null>;
  created_by: string | null;
  updated_by: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface DisputesTable {
  id: Generated<string>;
  appointment_id: string | null;
  raised_by: string;
  assigned_to: string | null;
  status: Generated<DisputeStatus | null>;
  priority: Generated<Priority | null>;
  subject: string;
  description: string;
  resolution: string | null;
  sla_deadline: Timestamp | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  resolved_at: Timestamp | null;
}

export interface DisputeMessagesTable {
  id: Generated<string>;
  dispute_id: string;
  sender_id: string;
  message: string;
  attachments: string[] | null;
  created_at: GeneratedTimestamp;
}

export interface CareNotesTable {
  id: Generated<string>;
  appointment_id: string;
  practitioner_id: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  attachments: string[] | null;
  shared_with_patient: Generated<boolean | null>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface CareNotesSharingLogTable {
  id: Generated<string>;
  care_note_id: string;
  practitioner_id: string;
  old_shared_value: boolean | null;
  new_shared_value: boolean | null;
  changed_at: GeneratedTimestamp;
  changed_by: Generated<string | null>;
}

export interface ConsultationReportsTable {
  id: Generated<string>;
  practitioner_id: string;
  appointment_id: string;
  consultation_date: GeneratedTimestamp;
  consultation_type: string;
  consultation_reason: string | null;
  clinical_findings: string | null;
  primary_diagnosis: string | null;
  treatment_prescription: string | null;
  follow_up_recommendation: string | null;
  follow_up_timeframe: string | null;
  additional_comments: string | null;
  severity_level: string;
  share_with_doctor: Generated<boolean | null>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface ConsultationReportsAccessLogTable {
  id: Generated<string>;
  report_id: string;
  accessed_by: string;
  access_type: string;
  accessed_at: GeneratedTimestamp;
}

export interface TriageResultsTable {
  id: Generated<string>;
  user_id: string;
  score: number;
  urgency_level: string;
  message: string | null;
  recommendations: string[] | null;
  answers: ColumnType<Record<string, unknown> | null, string | null, string | null>;
  created_at: GeneratedTimestamp;
}

export interface SavedPaymentMethodsTable {
  id: Generated<string>;
  user_id: string;
  provider: string;
  phone_number_masked: string;
  phone_number_encrypted: string;
  is_default: Generated<boolean | null>;
  consent_given_at: GeneratedTimestamp;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface OtpAttemptsTable {
  id: Generated<string>;
  phone_number: string;
  channel: string | null;
  status: string | null;
  twilio_sid: string | null;
  error_message: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: GeneratedTimestamp;
}

// --- DomiCares Academy (db/native/140_academy.sql) : correspondance avec l'API partenaires Akambi v1 ---
export type AcademyEnrollmentStatusDb = 'PENDING' | 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CERTIFIED' | 'CANCELLED';

export interface AcademyCoursesTable {
  id: string;
  title: string;
  description: string | null;
  type: 'E_LEARNING' | 'VISIO_CONFERENCE' | 'PRESENTIEL';
  status: 'PUBLISHED' | 'ARCHIVED';
  category_code: string | null;
  category_title: string | null;
  /** numeric(12,2) : lu en chaîne par node-postgres. */
  public_price_amount: ColumnType<string | null, number | string | null, number | string | null>;
  public_price_currency: 'EURO' | 'DOLLAR' | 'FRANC_CFA' | null;
  module_count: number | null;
  chapter_count: number | null;
  cover_image_url: string | null;
  presentation_url: string | null;
  akambi_created_at: Timestamp | null;
  akambi_updated_at: Timestamp;
  synced_at: GeneratedTimestamp;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface AcademyLearnersTable {
  user_id: string;
  /** Toujours 'DC-' || user_id (contrainte academy_learners_external_id_check). */
  external_learner_id: string;
  akambi_learner_id: string | null;
  account_origin: 'CREATED' | 'EXISTING' | null;
  email: string;
  link_status: Generated<'pending' | 'linked' | 'failed'>;
  last_error_code: string | null;
  idempotency_key: Generated<string>;
  akambi_updated_at: Timestamp | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface AcademyEnrollmentsTable {
  id: Generated<string>;
  user_id: string;
  course_id: string;
  akambi_enrollment_id: string | null;
  status: Generated<AcademyEnrollmentStatusDb>;
  progress: Generated<number>;
  enrolled_at: Timestamp | null;
  started_at: Timestamp | null;
  last_activity_at: Timestamp | null;
  completed_at: Timestamp | null;
  certificate_id: string | null;
  akambi_updated_at: Timestamp | null;
  last_error_code: string | null;
  idempotency_key: Generated<string>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface AcademyCertificatesTable {
  id: string;
  enrollment_id: string;
  learner_name: string;
  course_title: string;
  score_correct: number | null;
  score_total: number | null;
  completion_date: Timestamp | null;
  issued_at: Timestamp;
  verification_url: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface AcademyWebhookEventsTable {
  id: Generated<string>;
  event_id: string;
  event_type: string;
  event_version: number | null;
  payload: Json;
  signed_at: Timestamp;
  akambi_created_at: Timestamp | null;
  received_at: GeneratedTimestamp;
  processed_at: Timestamp | null;
  processing_status: Generated<'pending' | 'processed' | 'ignored' | 'failed'>;
  error_message: string | null;
}

export interface AcademySyncStateTable {
  key: 'courses' | 'enrollments';
  cursor: Timestamp | null;
  last_run_at: Timestamp | null;
  last_success_at: Timestamp | null;
  last_error: string | null;
  updated_at: GeneratedTimestamp;
}

export interface DB {
  users: UsersTable;
  refresh_tokens: RefreshTokensTable;
  auth_tokens: AuthTokensTable;
  profiles: ProfilesTable;
  user_roles: UserRolesTable;
  practitioners: PractitionersTable;
  practitioner_availability: PractitionerAvailabilityTable;
  practitioner_exceptions: PractitionerExceptionsTable;
  practitioner_rates: PractitionerRatesTable;
  files: FilesTable;
  file_access_logs: FileAccessLogsTable;
  notifications: NotificationsTable;
  appointments: AppointmentsTable;
  payments: PaymentsTable;
  payment_events: PaymentEventsTable;
  payment_attempts: PaymentAttemptsTable;
  webhook_events: WebhookEventsTable;
  ledger_accounts: LedgerAccountsTable;
  ledger_entries: LedgerEntriesTable;
  practitioner_balances: PractitionerBalancesTable;
  system_config: SystemConfigTable;
  addresses: AddressesTable;
  services: ServicesTable;
  messages: MessagesTable;
  notification_preferences: NotificationPreferencesTable;
  push_subscriptions: PushSubscriptionsTable;
  otp_attempts: OtpAttemptsTable;
  group_sessions: GroupSessionsTable;
  group_session_participants: GroupSessionParticipantsTable;
  practitioner_payouts: PractitionerPayoutsTable;
  payout_batches: PayoutBatchesTable;
  payout_payments: PayoutPaymentsTable;
  payment_refunds: PaymentRefundsTable;
  practitioner_payment_info: PractitionerPaymentInfoTable;
  payment_reconciliations: PaymentReconciliationsTable;
  reconciliation_reports: ReconciliationReportsTable;
  admin_audit_logs: AdminAuditLogsTable;
  search_activity_logs: SearchActivityLogsTable;
  reviews: ReviewsTable;
  consents: ConsentsTable;
  consent_versions: ConsentVersionsTable;
  otp_rate_limits: OtpRateLimitsTable;
  emergency_contacts: EmergencyContactsTable;
  medical_profiles: MedicalProfilesTable;
  support_tickets: SupportTicketsTable;
  faqs: FaqsTable;
  disputes: DisputesTable;
  dispute_messages: DisputeMessagesTable;
  care_notes: CareNotesTable;
  care_notes_sharing_log: CareNotesSharingLogTable;
  consultation_reports: ConsultationReportsTable;
  consultation_reports_access_log: ConsultationReportsAccessLogTable;
  triage_results: TriageResultsTable;
  saved_payment_methods: SavedPaymentMethodsTable;
  academy_courses: AcademyCoursesTable;
  academy_learners: AcademyLearnersTable;
  academy_enrollments: AcademyEnrollmentsTable;
  academy_certificates: AcademyCertificatesTable;
  academy_webhook_events: AcademyWebhookEventsTable;
  academy_sync_state: AcademySyncStateTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
export type Profile = Selectable<ProfilesTable>;
export type ProfileUpdate = Updateable<ProfilesTable>;
export type Practitioner = Selectable<PractitionersTable>;
export type PractitionerUpdate = Updateable<PractitionersTable>;
export type FileRow = Selectable<FilesTable>;
export type Appointment = Selectable<AppointmentsTable>;
export type AppointmentUpdate = Updateable<AppointmentsTable>;
export type Payment = Selectable<PaymentsTable>;
export type Message = Selectable<MessagesTable>;
export type Notification = Selectable<NotificationsTable>;
export type GroupSession = Selectable<GroupSessionsTable>;
export type GroupSessionParticipant = Selectable<GroupSessionParticipantsTable>;
export type PractitionerPayout = Selectable<PractitionerPayoutsTable>;
export type PayoutBatch = Selectable<PayoutBatchesTable>;
