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

export interface PractitionersTable {
  id: Generated<string>;
  user_id: string;
  name: string;
  specialty: string;
  phone: string | null;
  practitioner_type: PractitionerType | null;
  kyc_status: string | null;
  can_accept_missions: boolean | null;
  is_online: boolean | null;
  available: boolean | null;
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

export interface DB {
  users: UsersTable;
  refresh_tokens: RefreshTokensTable;
  auth_tokens: AuthTokensTable;
  profiles: ProfilesTable;
  user_roles: UserRolesTable;
  practitioners: PractitionersTable;
  otp_attempts: OtpAttemptsTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
export type Profile = Selectable<ProfilesTable>;
export type ProfileUpdate = Updateable<ProfilesTable>;
