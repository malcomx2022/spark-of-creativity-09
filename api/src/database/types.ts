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
  otp_attempts: OtpAttemptsTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
export type Profile = Selectable<ProfilesTable>;
export type ProfileUpdate = Updateable<ProfilesTable>;
export type Practitioner = Selectable<PractitionersTable>;
export type PractitionerUpdate = Updateable<PractitionersTable>;
export type FileRow = Selectable<FilesTable>;
