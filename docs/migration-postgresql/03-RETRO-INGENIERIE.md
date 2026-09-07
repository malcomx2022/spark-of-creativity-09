# 03 — Rétro-ingénierie : de Supabase au back-end natif

Méthode : chaque point de contact avec Supabase a été relevé dans le code (front et Edge
Functions) et dans le schéma rejoué. Ce document fixe, pour chacun, la cible native et l'ordre
de portage. Le back-end cible est celui du dossier de refonte : **NestJS + PostgreSQL 16 +
Redis/BullMQ + S3 + Socket.IO**, ORM Prisma ou Drizzle (le schéma étant déjà en SQL, Drizzle
`introspect` ou `prisma db pull` le génèrent tel quel depuis `db/native/schema.native.sql`).

## 1. Base de données

| Aspect | Supabase | Natif (livré dans `db/native/`) |
|---|---|---|
| Comptes | `auth.users` (GoTrue) | `public.users` (bcrypt, vérifications, metadata) + `refresh_tokens` + `auth_tokens` |
| FK | 31 FK → `auth.users` | re-pointées vers `public.users`, mêmes noms/actions |
| Création de profil | trigger `on_auth_user_created_safe` sur `auth.users` | trigger `on_user_created` sur `public.users` (même fonction `handle_new_user_safe`) |
| `auth.uid()`, `auth.jwt()`, `auth.role()` | JWT PostgREST | lisent `app.user_id`, `app.user_role`, `app.user_email` (`SET LOCAL` par l'API au début de chaque transaction) |
| RLS | 155 policies (avec récursion profiles↔appointments) | **Option B recommandée** : `120_drop_rls_optional.sql` + guards NestJS. Option A : conserver, l'API se connecte en `domicares_app` (hérite de `authenticated`) et positionne les GUC |
| Storage | schéma `storage` + 9 policies | supprimé ; table `public.files` + S3 |
| Realtime | publication `supabase_realtime` | `notify_table_change()` → canal `table_changes` (10 tables) |
| Fonctions SQL | 43 | conservées ; `cleanup_orphan_accounts`/`repair_missing_profiles` réécrites sur `public.users` |
| Extensions | implicites | `pgcrypto`, `uuid-ossp`, `citext`, `pg_trgm` ; ajouter `postgis` si la recherche par rayon quitte le calcul applicatif (`find-available-practitioner` fait aujourd'hui une distance haversine en TypeScript) |

Contrat API ↔ base (option A ou B) : ouvrir une transaction, `SET LOCAL app.user_id = $1;
SET LOCAL app.user_role = $2`, exécuter, commit. Les traitements système utilisent
`app.user_role = 'service_role'` (équivalent de la clé service actuelle).

## 2. Authentification (remplace `supabase.auth`)

| Front aujourd'hui | Fichiers | Endpoint natif |
|---|---|---|
| `signUp({email,password,options.data})` | PatientSignup, PractitionerSignup | `POST /auth/register` — crée `users` (bcrypt cost 12) + `raw_user_meta_data`, envoie e-mail de vérification (Resend), retourne 201 sans session tant que l'e-mail n'est pas confirmé (comportement actuel « confirm-email ») |
| `signInWithPassword` | LoginPage, PatientLogin, PractitionerLogin, AdminLogin | `POST /auth/login` → access JWT 15 min + refresh (cookie httpOnly ou body pour mobile) ; verrouillage après N échecs (`failed_login_attempts`, `locked_until`) |
| `signInWithOtp` / `verifyOtp` (`useOTPAuth`, `send-otp`, `verify-otp`) | LoginWithOTP, VerifyOTP | `POST /auth/otp/send` (Twilio Verify + `otp_rate_limits`/`check_otp_rate_limit`) ; `POST /auth/otp/verify` → session |
| `resend` | ConfirmEmail | `POST /auth/verify-email/resend` |
| `resetPasswordForEmail` / `updateUser({password})` | ForgotPassword, ResetPassword | `POST /auth/password/forgot`, `POST /auth/password/reset` (token `auth_tokens.kind='password_reset'`) |
| `updateUser({data})` (pending_onboarding) | registration-recovery, patient-onboarding | `PATCH /auth/me/metadata` |
| `getSession` / `getUser` / `onAuthStateChange` / `setSession` | 46 usages | client `api/auth.ts` : stockage du refresh, rafraîchissement silencieux, `AuthProvider` React exposant `user`, `session`, `role` |
| `signOut` | Header, dashboards, useIdleTimeout | `POST /auth/logout` (révoque le refresh) |
| Rôle applicatif (`userRoleResolver.ts`) | user_roles → practitioners.type → profiles | `GET /auth/me` renvoie `{ user, profile, role: 'admin'|'practitioner'|'coach'|'patient'|'incomplete_practitioner', adminRoles[] }` calculé côté serveur |

Migration des mots de passe : `bcrypt.compare(password, users.password_hash)` fonctionne
directement sur les hash `$2a$10$` de GoTrue. Aucune réinitialisation.

## 3. Edge Functions → API

### 3.1 Les 31 fonctions appelées par le front

| Edge Function | Verbe/route NestJS | Module | Notes de portage |
|---|---|---|---|
| `send-otp`, `verify-otp` | `POST /auth/otp/send`, `/auth/otp/verify` | Auth | Twilio Verify inchangé |
| `complete-user-registration` | `POST /auth/register/complete` | Auth/Onboarding | consomme `pending_onboarding` |
| `create-practitioner-account` | `POST /practitioners/register` | Practitioners | transaction atomique (voir `docs/archive/PRACTITIONER_ATOMIC_SIGNUP.md`) |
| `delete-single-user` | `DELETE /admin/users/:id` | Admin | remplace `auth.admin.deleteUser` par `DELETE FROM users` (cascade) |
| `create-test-users`, `cleanup-non-test-accounts` | `POST /admin/dev/*` | Admin (désactivés en prod) | |
| `secure-phone` | `POST /profile/phone/secure` | Profile | même `PHONE_ENCRYPTION_KEY` (AES-GCM) |
| `upload-to-wasabi`, `get-presigned-url` | `POST /files/upload-url`, `GET /files/:id/url` | Files | URLs pré-signées S3 (PUT direct navigateur → S3) ; `files` table inchangée |
| `find-available-practitioner` | `GET /practitioners/available?lat&lng&type&date` | Practitioners | requête SQL + haversine (ou PostGIS) |
| `notify-appointment-request`, `handle-appointment-response` | `POST /appointments/:id/notify`, `POST /appointments/:id/respond` | Appointments | notifications via NotificationService |
| `create-payment` (1 231 lignes) | `POST /payments` | Payments | cœur métier : validation zod, calcul frais (`fee-calculator.ts`), création transaction FedaPay, `payment_attempts` ; porter les tests Deno existants en Jest |
| `cancel-pending-payment`, `sync-payment-status` | `POST /payments/:id/cancel`, `POST /payments/:id/sync` | Payments | |
| `get-fedapay-config`, `test-fedapay-connectivity`, `get-webhook-url`, `simulate-webhook` | `GET /payments/config`, `/admin/payments/diagnostics/*` | Payments/Admin | |
| `register-group-session`, `retry-group-session-payment` | `POST /group-sessions/:id/register`, `/group-sessions/:id/retry-payment` | GroupSessions | utilise `reserve_group_session_spot()` |
| `manage-momo-wallet` | `GET/PUT /practitioners/me/momo-wallet` | Payouts | |
| `create-payout-batch`, `process-payout-batch`, `release-held-funds`, `process-refund`, `reconcile-fedapay` | `POST /admin/payouts/batches`, `/admin/payouts/batches/:id/process`, `/admin/funds/release`, `/admin/refunds`, `/admin/reconciliation/run` | Finance | jobs longs ⇒ BullMQ + statut consultable |
| `admin-management` | `GET/POST/DELETE /admin/admins` | Admin | rôles `user_roles` |
| `send-kyc-status-notification` | `POST /admin/kyc/:practitionerId/notify` | KYC | e-mail + SMS |
| `get-mapbox-token` | `GET /config/mapbox` | Config | ou variable `VITE_MAPBOX_TOKEN` (déjà lue côté front) |

### 3.2 Les 16 fonctions internes / webhook / planifiées

| Edge Function | Cible | Déclencheur natif |
|---|---|---|
| `payment-webhook` | `POST /webhooks/fedapay` (public, HMAC-SHA256 timing-safe, idempotence sur `webhook_events.event_id`) | FedaPay |
| `send-push-notification` | `NotificationService.push()` (web-push VAPID) | appelé en interne |
| `apply-ledger-entries`, `create-payout` | services `LedgerService`, `PayoutService` | appelés par Payments/Finance |
| `send-account-activation`, `send-registration-notification` | `NotificationService.email()/sms()` | inscription |
| `create-appointment-with-payment` | `AppointmentsService.createWithPayment()` | RDV |
| `schedule-consultation-tasks` | job `consultations.tick` toutes les 5 min : `cleanup_expired_payment_slots()`, `request_consultation_confirmation()`, `auto_confirm_consultations()` | BullMQ repeatable |
| `auto-sync-pending-payments`, `cleanup-stuck-payments`, `diagnose-stuck-payments` | job `payments.sync` toutes les 10 min | BullMQ |
| `send-payment-reminders` | job quotidien | BullMQ |
| `retry-failed-webhooks` | job toutes les 15 min | BullMQ |
| `repair-balances` | commande CLI d'exploitation (`sync_all_practitioner_balances()`) | manuel |
| `export-database`, `import-database` | supprimées (remplacées par `pg_dump`/`backup.sh`) | — |

Correctif à intégrer : `PaymentsMonitoring.tsx` appelle `reconcile-payments` (inexistant) ⇒
pointer sur `/admin/reconciliation/run`.

## 4. Accès direct aux tables (`supabase.from`) → endpoints REST

Regrouper par ressource plutôt que reproduire PostgREST. Ressources et principaux usages front :

| Ressource | Tables | Endpoints (exemples) | Hooks à réécrire |
|---|---|---|---|
| Profil & adresses | profiles, addresses, emergency_contacts, medical_profiles, notification_preferences, consents, user_consents, consent_versions | `/profile`, `/profile/addresses`, `/profile/emergency-contacts`, `/profile/medical`, `/profile/consents` | useProfile, usePatientProfileData |
| Praticiens | practitioners, practitioner_rates, practitioner_availability, practitioner_exceptions, practitioner_payment_info, reviews, `practitioners_public_view`, RPC `get_public_practitioners` | `/practitioners`, `/practitioners/:id`, `/practitioners/me/*`, `/practitioners/:id/reviews` | usePractitioners, useAvailability, usePractitionerRates, useReviews |
| Rendez-vous & consultations | appointments, consultation_reports, care_notes, triage_results | `/appointments`, `/appointments/:id/report`, `/care-notes`, `/triage` | useAppointments, useConsultationReports, useCareNotes |
| Séances de groupe | group_sessions, group_session_participants | `/group-sessions`, `/group-sessions/:id/participants` | useGroupSessions, usePatientGroupSessions |
| Paiements | payments, payment_attempts, payment_events, payment_refunds, saved_payment_methods, practitioner_balances, practitioner_payouts, payout_batches, reconciliation_reports, webhook_events | `/payments`, `/payments/:id/attempts`, `/me/payment-methods`, `/practitioners/me/balance`, `/admin/payments/*` | usePaymentAttempts, useSavedPaymentMethods |
| Messagerie & notifications | messages, notifications, push_subscriptions | `/conversations`, `/conversations/:appointmentId/messages`, `/notifications`, `/push/subscribe` | useConversations, useMessages, useNotifications, usePushNotifications |
| Support & litiges | support_tickets, disputes, faqs | `/support/tickets`, `/disputes`, `/faqs` | useSupportTickets |
| Admin | admin_audit_logs, user_roles, system_config, search_activity_logs, otp_attempts, services, vues `admin_*_stats`, RPC `get_public_stats` | `/admin/audit`, `/admin/roles`, `/admin/config`, `/admin/stats`, `/stats/public` | useAdminStats, useAdminRole, useAdminAuth, useOTPManagement, useSearchActivityLog |

Règle : toute règle aujourd'hui exprimée dans une policy RLS devient une garde de service
(`assertOwner`, `assertAdminRole('finance')`, `assertPractitionerOfAppointment`). Les
`SELECT` filtrés par `auth.uid()` deviennent des `WHERE user_id = ctx.userId` explicites.

## 5. Temps réel

| Front | Mécanisme natif |
|---|---|
| `postgres_changes` sur appointments, messages, notifications, practitioner_balances, practitioner_payouts, payments, support_tickets, practitioners, group_sessions, group_session_participants | trigger `notify_table_change` → worker `LISTEN table_changes` → `io.to(room).emit('change', payload)` ; rooms : `user:<id>`, `appointment:<id>`, `admin`, `practitioner:<id>` |
| canal `presence` « typing » (`useConversations`) | Socket.IO `typing:start/stop` sur la room `appointment:<id>` |
| Côté client | hook `useRealtime(table, filter, onChange)` qui remplace `supabase.channel(...)` et invalide les requêtes TanStack Query comme aujourd'hui |

## 6. Fichiers

| Aujourd'hui | Natif |
|---|---|
| `upload-to-wasabi` → Supabase Storage (`documents`, `avatars`) | `POST /files/upload-url` renvoie une URL pré-signée PUT ; le navigateur envoie directement à S3 ; `POST /files` enregistre dans `files` |
| `get-presigned-url` (`createSignedUrl`) | `GET /files/:id/url` (pré-signée GET, 15 min, contrôle d'accès + `file_access_logs`) |
| `supabase.storage.from('message-attachments')` + `getPublicUrl` | même flux pré-signé ; bucket privé (aujourd'hui l'URL est publique : à corriger) |

## 7. Front-end : plan de découplage

1. Créer `src/api/client.ts` (fetch + refresh automatique + gestion 401) et `src/api/<ressource>.ts`
   typés depuis l'OpenAPI générée par NestJS (`openapi-typescript`).
2. Remplacer `src/integrations/supabase/client.ts` par un **adaptateur** exposant temporairement
   `from()`, `auth`, `functions.invoke()` vers l'API : permet de migrer les 121 fichiers un par un
   sans casser le build (strangler pattern).
3. Migrer hook par hook (ordre : auth → profil → praticiens → RDV → paiements → messagerie →
   admin), supprimer l'adaptateur, puis `npm remove @supabase/supabase-js` et
   `src/integrations/supabase/types.ts`.
4. Activer `strict: true` progressivement (dossier par dossier) et faire échouer la CI sur lint/tests.

## 8. Ordre de réalisation du back-end (chemin critique)

1. Auth + Profile + rôles (`/auth/me`) — débloque tout le front.
2. Practitioners + Files (KYC) — inscription praticien complète.
3. Appointments + Payments + webhook FedaPay + jobs `consultations.tick` / `payments.sync` — flux d'argent.
4. Messaging + Notifications + Realtime + Push.
5. GroupSessions, Finance (ledger, payouts, refunds, reconciliation), Admin.
6. Support, disputes, audit, stats.

Chaque étape : porter la fonction Deno correspondante (même validation zod, mêmes transitions
de statut), écrire le test d'intégration sur base PostgreSQL de test (`schema.native.sql`),
brancher le front.
