# Domicares API (NestJS + PostgreSQL natif)

Suivi courant : [sécurité, fonctionnel et PWA](../docs/migration-postgresql/11-CORRECTIONS-FONCTIONNEL-SECURITE-PWA.md).
Les routes publiques d'authentification sont limitées à 60 POST/IP/15 min par processus,
en complément du compteur atomique de tentatives par compte. Conserver l'API derrière Caddy.
`GET /api/appointments/page?view=patient&limit=100&offset=0` renvoie `{ data, count }` avec
total autorisé et masquage des notes internes ; `view=practitioner` cible les missions du praticien.
L'ancienne liste tableau reste disponible sur `GET /api/appointments`.
Les abonnements push sont limités aux services Google/Mozilla/Apple/Windows et les payloads
sont génériques. Aucun changement SQL ni secret supplémentaire pour cette livraison.

Back-end qui remplace Supabase Auth, PostgREST et les Edge Functions. Chemin critique de
`docs/migration-postgresql/03-RETRO-INGENIERIE.md` §8 : étape 1 **authentification, profil,
rôles**, étape 2 **praticiens, fichiers, KYC**, étape 3 **rendez-vous, paiements FedaPay,
webhook, jobs planifiés**, étape 4 **messagerie, notifications, temps réel Socket.IO,
push Web**, étape 5 **séances de groupe, finance (reversements, remboursements,
réconciliation), administration** et étape 6 **support, litiges, dossier médical, avis,
moyens de paiement, statistiques** livrées.

## Ce qui est implémenté

Correctif du 7 octobre : `POST /api/contact` (public, 5 tentatives/IP/heure) transmet
un message à `CONTACT_RECIPIENT_EMAIL` via Resend ; succès après acceptation du fournisseur,
503 si non configuré ou indisponible. `GET /api/conversations/:appointmentId` ouvre
une conversation autorisée sans parcourir toutes les pages de liste. Voir le document 14.

| Route | Remplace |
|---|---|
| `POST /api/auth/register` | `supabase.auth.signUp` (métadonnées `user_type`, `practitioner_type`, `pending_onboarding` conservées) |
| `POST /api/auth/login`, `refresh`, `logout`, `DELETE /api/auth/sessions` | `signInWithPassword`, `getSession`, `signOut` (JWT 15 min + refresh tokens tournants, cookies httpOnly + corps) |
| `GET /api/auth/me` | `getUser` + `resolveUserRole()` (admin / practitioner / coach / patient / incomplete_practitioner) |
| `PATCH /api/auth/me/metadata` | `updateUser({ data })` |
| `POST /api/auth/verify-email`, `verify-email/resend` | confirmation e-mail Supabase, `resend` |
| `POST /api/auth/password/forgot`, `reset`, `change` | `resetPasswordForEmail`, `updateUser({ password })` |
| `POST /api/auth/otp/send`, `otp/verify` | Edge Functions `send-otp`, `verify-otp` (Twilio Verify, `check_otp_rate_limit()`, `otp_attempts`) |
| `GET/PATCH /api/profile` | `supabase.from('profiles')` sur son propre profil |
| `POST /api/practitioners/register` | Edge Function `create-practitioner-account` (profil + documents KYC en base64 + praticien `pending` + notification des admins, atomique avec compensation des uploads) |
| `GET /api/practitioners`, `GET /api/practitioners/:id` | `get_public_practitioners()`, `practitioners_public_view`, `usePractitioners` ; pour un utilisateur connecté (`OptionalJwtAuthGuard`), coordonnées arrondies à 3 décimales (≈ 100 m) pour la carte de `PractitionerSearch`, jamais l'adresse exacte |
| `GET /api/practitioners/available` | Edge Function `find-available-practitioner` (filtres métier, haversine, créneaux du jour, exceptions) |
| `GET/PATCH /api/practitioners/me` | accès direct à `practitioners` (espace praticien) |
| `/api/practitioners/me/availability`, `/exceptions`, `/rates` (+ lectures publiques `/:id/…`) | `useAvailability`, `usePractitionerRates` |
| `POST /api/files/upload-url` + `POST /api/files` | nouveau flux navigateur → S3 (URL pré-signée PUT) |
| `POST /api/files/upload` | Edge Function `upload-to-wasabi` (contrat base64 conservé) |
| `GET /api/files/url?filePath=` | Edge Function `get-presigned-url` (mêmes règles d'accès, journal `file_access_logs`) |
| `GET /api/admin/kyc/queue`, `POST /api/admin/kyc/:id/decision` | `KYCQueue.tsx` + `approve_practitioner_kyc()` + Edge Function `send-kyc-status-notification` (e-mail, SMS, notification in-app) ; décision journalisée `KYC <statut>` dans `admin_audit_logs` (historique de `KYCQueue`) |
| `POST /api/appointments`, `GET /api/appointments[?status=active]`, `GET /api/appointments/:id` | `useAppointments` + Edge Function `notify-appointment-request` ; sans `practitionerId` (mode « Enregistrer quand même » de `NewAppointmentDialog`), affectation du praticien validé le plus proche (type ou spécialité, rayon 100 km, créneau si possible) à partir de `latitude`/`longitude` ou de l'adresse par défaut, administrateurs prévenus en cas d'affectation hors créneau, 404 sans candidat |
| `POST /api/appointments/:id/respond` (accept / reject) | Edge Function `handle-appointment-response` (montant, demande de paiement, réassignation au praticien le plus proche) |
| `PATCH /api/appointments/:id/practitioner-status`, `POST …/complete`, `POST …/confirm`, `POST …/cancel` | `PractitionerStatusControl`, `CompleteConsultationForm`, `ConsultationConfirmation` |
| `POST /api/payments`, `GET /api/payments[/:id]`, `POST /api/payments/:id/cancel`, `POST /api/payments/:id/sync`, `GET /api/payments/config` | Edge Functions `create-payment`, `cancel-pending-payment`, `sync-payment-status`, `get-fedapay-config` |
| `POST /api/webhooks/fedapay` | Edge Function `payment-webhook` (HMAC-SHA256, idempotence `webhook_events`, ledger, notifications) |
| `POST /api/admin/payments/simulate-webhook`, `POST /api/admin/payments/:id/sync` | Edge Function `simulate-webhook` (client factice) |
| `GET /api/admin/jobs`, `POST /api/admin/jobs/:name/run` | Edge Functions `schedule-consultation-tasks`, `auto-sync-pending-payments`, `cleanup-stuck-payments` (exécutées par le worker toutes les 5 / 10 / 15 min) ; `payouts.sync` (10 min) interroge FedaPay sur les reversements démarrés et confirme les remboursements en attente ; `maintenance.cleanup` quotidien : purges `cleanup_old_*`, `repair_missing_profiles()`, comptes orphelins comptés et supprimés seulement avec `deleteOrphans: true` |
| `GET /api/academy/courses`, `GET /api/academy/courses/:courseId` | Nouveau (DomiCares Academy, Akambi) : catalogue local des formations publiées ; praticien hors coach, dossier validé, e-mail vérifié ; 503 si `ACADEMY_ENABLED=false`. Job `academy.catalog.sync` (6 h) : catalogue Akambi complet, versions plus anciennes ignorées, formations retirées masquées |
| `POST /api/academy/enrollments`, `GET /api/academy/enrollments`, `POST /api/academy/enrollments/:id/launch` | Nouveau (DomiCares Academy) : compte de formation créé ou rattaché chez Akambi au premier besoin (nom du profil, ou `firstName`/`lastName`), inscription idempotente (ligne en attente et clé d'idempotence avant l'appel ; 201 créée, 200 existante), refus Akambi codés (`error`) sans leur message ; lien d'accès à usage unique renvoyé avec `Cache-Control: no-store`, jamais stocké ni journalisé |
| `POST /api/webhooks/akambi` | Nouveau (DomiCares Academy) : signature `X-Akambi-Signature` vérifiée sur le corps brut avec chaque secret de `AKAMBI_WEBHOOK_SECRETS` (rotation, ±300 s), événement dédoublonné dans `academy_webhook_events` puis appliqué (version plus ancienne ignorée) ; 503 sans secret configuré. Job `academy.enrollments.reconcile` (1 h) : rapprochement par `updatedSince`, attestations manquantes relues |
| `GET /api/academy/enrollments/:id/certificate`, `POST /api/academy/enrollments/:id/certificate/download` | Nouveau (DomiCares Academy) : métadonnées et lien de vérification de l'attestation du praticien ; lien PDF de 15 min redemandé à Akambi à chaque clic, `Cache-Control: no-store`, jamais stocké |
| `GET /api/admin/academy/reports`, `…/enrollments`, `…/webhook-events`, `…/sync-state`, `DELETE /api/admin/academy/enrollments/:id` | Nouveau (DomiCares Academy) : indicateurs Akambi et décompte local, inscriptions filtrées et paginées, événements reçus sans leur corps, état des synchronisations (rôles `super_admin`, `ops`, `analyst`, `support`) ; désinscription réservée à `super_admin`/`ops`, journalisée dans `admin_audit_logs` |
| `GET /api/config/public` → `academyEnabled` | Nouveau champ : `ACADEMY_ENABLED`, lu par le front pour afficher les onglets Academy (les droits restent vérifiés par `/academy/*`) |
| `GET /api/conversations`, `GET /api/conversations/unread-count` | `useConversations` (rendez-vous confirmés/terminés, dernier message, non-lus) |
| `GET/POST /api/conversations/:appointmentId/messages`, `POST …/read` | `useMessages` (table `messages`, pièces jointes via `POST /api/files/upload-url` dossier `message-attachments`, notification push au destinataire) |
| `GET /api/notifications[?unreadOnly]`, `GET …/unread-count`, `POST …/:id/read`, `POST …/read-all`, `DELETE …/:id` | `useNotifications` |
| `GET/PUT /api/notifications/preferences` | `notification_preferences` (e-mail, SMS, WhatsApp, push) |
| `GET /api/push/vapid-public-key`, `POST/DELETE /api/push/subscriptions` | `src/lib/push-notifications.ts` (clé VAPID en dur remplacée) + table `push_subscriptions` |
| WebSocket Socket.IO `/socket.io` | Supabase Realtime `postgres_changes` (événement `change`) et canal presence `typing` |
| `GET /api/group-sessions[?coachId]`, `GET /api/group-sessions/:id` | `useGroupSessions`, `CoachSearch` (catalogue public des séances à venir) |
| `GET /api/group-sessions/mine`, `GET /api/group-sessions/coach`, `GET …/:id/participants` | `usePatientGroupSessions`, tableau de bord coach |
| `POST /api/group-sessions`, `PATCH …/:id`, `POST …/:id/confirm`, `…/cancel`, `…/complete` | `CreateGroupSessionDialog`, `EditGroupSessionDialog`, `useGroupSessions.confirm/cancel` (+ notifications des participants, annulation des paiements ouverts) |
| `POST /api/group-sessions/:id/register`, `POST …/registrations/:id/retry-payment`, `DELETE …/registrations/:id` | Edge Functions `register-group-session`, `retry-group-session-payment` (patient et montant déduits du serveur) |
| `GET /api/finance/me/balance`, `…/payouts`, `GET/PUT …/payment-info` | `PayoutsSection`, `CoachPayoutsSection`, `PaymentInfoSection` |
| `GET /api/admin/finance/stats`, `…/payments`, `…/balances`, `…/payment-events` | `FinanceSection`, `PaymentFlowsDashboard`, `PaymentEventsSection` (vue `admin_finance_stats` + `held_amount`, `total_commission`) ; `…/payments` accepte `from` (ISO 8601) et `limit` jusqu'à 1000 (`PaymentMetrics`, dernières 24 h) |
| `POST /api/admin/finance/payouts`, `GET …/payouts[/:id]` | Edge Function `create-payout` |
| `POST /api/admin/finance/payout-batches`, `POST …/:id/process`, `GET …[/:id]` | Edge Functions `create-payout-batch`, `process-payout-batch` (`PayoutsManagementSection`) |
| `POST /api/admin/finance/refunds`, `GET …/refunds` | Edge Function `process-refund` (`RefundsSection`) |
| `GET /api/admin/finance/held-funds`, `POST …/held-funds/release`, `POST …/balances/repair` | Edge Functions `release-held-funds`, `repair-balances` (`FundsReleaseSection`) |
| `POST/GET /api/admin/finance/reconciliation[/:id]` | Edge Function `reconcile-fedapay` (`ReconciliationSection`) |
| `GET /api/admin/finance/webhook-events`, `POST …/:id/retry` | `WebhooksSection` + Edge Function `retry-failed-webhooks` (filtres `status`, `eventType`, `from`, `to` ; `stats` et `eventTypes` dans la réponse ; `limit` jusqu'à 5000 pour l'export CSV) |
| `GET /api/admin/stats`, `GET /api/admin/me/roles`, `GET /api/stats/public` | `useAdminStats`, `useAdminRole`, `usePublicStats` |
| `GET/POST /api/admin/admins`, `POST …/:id/reset-password`, `DELETE …/:id` | Edge Function `admin-management` (`AdminManagement.tsx`, super_admin) |
| `GET /api/admin/users/patients[/:id]`, `GET …/practitioners[/:id]`, `DELETE /api/admin/users/:id`, `POST …/cleanup-non-test` (403 en production) | `UsersManagementSection`, `PatientDetailsDialog`, `PractitionerDetailsDialog`, Edge Functions `delete-single-user`, `cleanup-non-test-accounts` |
| `GET /api/admin/audit-logs[/filters]` | `AuditLogs.tsx` (IP partiellement masquées ; filtres `entityType`, `action`, `adminId`, `entityId`, `from`, `to`, `search` ≥ 3 caractères, `limit` jusqu'à 5000) |
| `POST /api/search-activity`, `GET /api/admin/search-activity` | `useSearchActivityLog`, `SearchActivitySection` |
| `GET /api/admin/otp/attempts`, `…/stats`, `…/blocked`, `POST …/reset`, `DELETE …/attempts/:id` | `OTPManagementSection` |
| `GET /api/config/public` | Edge Function `get-mapbox-token` + lecture anonyme de `system_config` (`features` de la page d'accueil) |
| `GET /api/payments/attempts?appointmentId=` | lecture directe de `payment_attempts` (`usePaymentAttempts`, `PaymentAttemptsHistory`) |
| `PUT /api/practitioners/me/documents` | mises à jour directes de `practitioners` + notifications insérées par `DocumentsSection` (dossier remis en attente, admins notifiés) |
| `GET/PUT /api/admin/system-config[/:key]`, `GET/POST /api/admin/consent-versions`, `POST …/:id/activate|deactivate`, `GET /api/consents/:type/active` | `ComplianceSection`, `ApiManagementSection` |
| `GET /api/admin/operations/appointments`, `GET …/reviews`, `POST …/reviews/:id/moderate`, `GET /api/admin/api/usage` | `OperationsSection` (rendez-vous du jour, modération des avis) |
| `GET/POST /api/support/tickets`, `GET …/:id`, `POST …/:id/close` | `SupportSection` (tickets de l'utilisateur, `support_tickets`) |
| `GET /api/faqs[?audience&category]` | `FAQSection` (FAQ publiées, filtrées par audience) |
| `GET /api/admin/support/tickets[/stats]`, `PATCH …/:id`, `GET/POST /api/admin/support/faqs`, `PATCH/DELETE …/:id` | `SupportManagementSection`, `FAQManagementSection` (statut / réponse / priorité / assignation, versions de FAQ, audit) |
| `POST /api/disputes`, `GET /api/disputes[/:id]`, `GET/POST …/:id/messages` | `DisputeDialog`, `useDisputes` (parties du rendez-vous, sujet par défaut, SLA 24 / 48 / 72 h) |
| `GET /api/admin/disputes[?status&priority&overdue]`, `PATCH …/:id` | `DisputesSection` (enquête, résolution, clôture, journal d'audit `Dispute <status>`) |
| `GET/PUT /api/medical/profile`, `GET …/profile/doctors`, `GET /api/medical/patients/:id/record` | `MedicalSection`, `useMedicalProfile`, dossier consulté par le praticien pendant le rendez-vous (policy RLS d'origine) |
| `/api/medical/emergency-contacts`, `/api/addresses` | `EmergencyContactsSection`, `AddressesSection` (une seule adresse par défaut) |
| `GET /api/care-notes`, `…/mine`, `…/appointment/:id`, `POST`, `PATCH …/:id`, `POST …/:id/share` | `CareNotesSection`, `usePatientCareNotes` (SOAP, journal `care_notes_sharing_log`, notification + message au patient) |
| `GET /api/consultation-reports`, `…/mine`, `…/appointment/:id`, `POST`, `GET/PATCH …/:id`, `GET …/:id/access-log` | `ConsultationReportFormDialog`, `CompleteConsultationForm` (clôture atomique du rendez-vous), `PatientConsultationReports` (lecture journalisée) |
| `POST /api/triage`, `GET /api/triage/history`, `DELETE …/:id` | `TriageForm` + `src/types/triage.ts` (score calculé côté serveur, enregistré si connecté) |
| `GET/POST /api/medical/consents`, `GET /api/medical/export` | `ConsentSection`, export RGPD de `SupportSection` (version acceptée mémorisée) |
| `POST /api/reviews`, `GET …/mine`, `GET …/practitioner/me`, `GET /api/practitioners/:id/reviews` | `ReviewDialog`, `usePractitionerReviews`, `useReviewStats` (un avis par consultation terminée, `practitioners.rating` recalculée) |
| `GET/POST /api/payment-methods`, `POST …/:id/default`, `GET …/:id/phone`, `DELETE …/:id` | `SavedPaymentMethods` + Edge Function `secure-phone` (AES-256-GCM côté serveur) |
| `GET /api/stats/practitioner[?month]`, `GET /api/stats/patient`, `GET /api/stats/coach` | calculs `useMemo` de `PractitionerDashboard`, `PatientDashboard`, `CoachDashboard` |
| `GET /api/health`, `GET /api/docs` | — |

Autorisation : `JwtAuthGuard` (Bearer ou cookie) et `@AdminOnly('finance', …)` qui
remplace `is_admin(auth.uid())` / `has_role(...)`. Chaque transaction positionne
`app.user_id` / `app.user_role` pour que les fonctions SQL héritées (`auth.uid()`)
fonctionnent (`DatabaseService.runAs`).

## Démarrer en local

### Durcissement du 6 octobre 2026

Les réponses de rendez-vous et l'export patient masquent les notes internes pour le
patient. Les comptes suspendus/supprimés sont refusés à l'émission des sessions et
sur les routes authentifiées. Les refresh tokens sont sérialisés par famille ; les
jetons de vérification/reset sont consommés atomiquement. Aucun changement de schéma.

Socket.IO ferme la connexion à l'expiration du JWT et réévalue l'état du compte,
les rôles et les rooms toutes les `REALTIME_AUTH_CHECK_MS` (5 000 ms par défaut).
Le front reconnecte effectivement le socket après rotation. Les navigateurs qui
supportent Web Locks coordonnent aussi les rotations entre onglets ; les autres
gardent le verrou par onglet et la politique serveur stricte de réutilisation.

Les URLs PUT signent `Content-Length` et ciblent `_pending/<userId>/…`. Le contrat
`filePath` reste le chemin final. `POST /files` lit les octets avec une limite de
10 Mo, vérifie taille/type et signatures de format, puis publie une copie stable.
Les objets `_pending/` ne sont pas téléchargeables par l'API et ceux de plus de 24 h
sont purgés par `maintenance.cleanup`. Prévoir les droits S3 HEAD/GET/PUT/DELETE/LIST
sur les trois buckets. Les objets historiques et documents KYC restent accessibles.
La limite JSON Fastify est de 22 Mo pour les ensembles de documents KYC en base64.

Les essais S3 réels utilisent un bucket temporaire, créé puis supprimé :
`S3_TEST_ENDPOINT=http://127.0.0.1:9010 S3_TEST_ACCESS_KEY=… S3_TEST_SECRET_KEY=… npm run test:e2e -- --runTestsByPath test/storage-s3.e2e-spec.ts`.
Utiliser uniquement un stockage de test dédié ; sans `S3_TEST_ENDPOINT`, cette suite
est ignorée explicitement, sauf avec `S3_TEST_REQUIRED=1` (CI) où elle échoue. MinIO ne
publie plus d'images ni de binaires accessibles anonymement : la CI compile la release
épinglée depuis son commit (`go install github.com/minio/minio@07c3a429bfed433e49018cb0f78a52145d4bedeb`),
voir le document 15, §12. Le guide et le suivi détaillés sont dans le document 10.

```bash
# 1. Base : PostgreSQL 16, puis dans l'ordre
psql -U postgres -c "CREATE DATABASE domicares"
psql -U postgres -d domicares -f ../db/native/010_roles.sql
psql -U postgres -d domicares -f ../db/native/schema.native.sql
psql -U postgres -d domicares -f ../db/native/120_drop_rls_optional.sql   # option B (recommandée)
psql -U postgres -d domicares -f ../db/native/130_fixes_heritage.sql
psql -U postgres -d domicares -f ../db/native/140_academy.sql             # tables academy_* (DomiCares Academy)
psql -U postgres -d domicares -f ../db/native/020_grants.sql
psql -U postgres -d domicares -c "ALTER ROLE domicares_app PASSWORD 'devpass'"

# 2. API
cp .env.example .env      # DATABASE_URL=postgresql://domicares_app:devpass@localhost:5432/domicares
npm ci
npm run start:dev         # http://localhost:3000/api/docs
```

Tests e2e (base réelle) : `DATABASE_URL=… npm run test:e2e`.

Stockage : `STORAGE_PROVIDER=s3` avec `S3_ENDPOINT` (MinIO, Wasabi, AWS) et les buckets
`documents`, `avatars`, `message-attachments`. Les chemins produits (`documents/<userId>/<ts>-<nom>`)
sont identiques à ceux de Supabase Storage : les valeurs déjà en base restent résolubles.

Paiement : `FEDAPAY_PROVIDER=fedapay` (clés sandbox/live, secret webhook) ou `fake` en dev/test ;
l'URL de webhook à déclarer chez FedaPay est `https://<domaine>/api/webhooks/fedapay`.

Academy (Akambi) : `AKAMBI_PROVIDER=akambi` avec `AKAMBI_BASE_URL` (HTTPS), `AKAMBI_API_KEY` et
`AKAMBI_API_SECRET` propres à chaque environnement, ou `fake` en dev/test ; `ACADEMY_ENABLED=false`
par défaut (client factice interdit en production une fois activée). Client signé et client factice dans
`src/academy/` ; plan et suivi : `../docs/academy/01-FAISABILITE-INTEGRATION-AKAMBI.md`.
Tables `academy_*` : `db/native/140_academy.sql` (idempotent, procédure pour une base existante
dans son en-tête), retour arrière `db/native/rollback/140_academy.down.sql`.

Soldes praticien : ils sont recalculés par le trigger `trigger_update_balance_on_payment`
à chaque changement de paiement. L'API n'appelle plus `update_payment_with_balance()` :
combinée au trigger, cette fonction doublait le montant en attente (défaut hérité de la
version Supabase, compensé alors par `repair-balances`).

## Temps réel, notifications et push (étape 4)

- **Socket.IO dans le processus API** (`RealtimeGateway`). Le client se connecte avec
  `io(url, { auth: { token: accessToken } })` ; il est placé dans les rooms `user:<id>`,
  `practitioner:<id>` (si praticien) et `admin` (si rôle admin), puis reçoit `ready`.
  `subscribe:appointment { appointmentId }` (contrôle d'accès identique à la messagerie) donne
  accès à la room `appointment:<id>` et à l'indicateur `typing`.
- Les triggers `db/native/110_realtime_notify.sql` publient sur `LISTEN table_changes` ;
  la passerelle relaie chaque événement `{ table, op, id, user_id, patient_id,
  practitioner_id, appointment_id, status, at }` vers les rooms concernées (événement
  `change`). Le front remplace `supabase.channel(...).on('postgres_changes', …)` par
  `socket.on('change', e => e.table === '…' && refetch())`.
- `REALTIME_ENABLED=false` désactive la passerelle (le worker le force : il n'exécute que
  les jobs). Derrière Caddy, `/socket.io/*` est routé vers l'API.
- **Notifications** : `DispatchService` reprend `_shared/notifications.ts` (ligne
  `notifications` + e-mail + SMS + push selon `notification_preferences`). La messagerie
  n'envoie qu'in-app + push, comme le comportement Supabase.
- **Push Web** : `PUSH_PROVIDER=webpush` avec `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY`
  (`npx web-push generate-vapid-keys`) ; abonnements expirés (404/410) supprimés
  automatiquement. `PUSH_PROVIDER=console` en développement (interdit en production).

## Séances de groupe, finance et administration (étape 5)

- **Séances de groupe** : le coach (type `coach_sportif`) crée, modifie, confirme (au moins
  `min_participants` inscrits payés), annule ou clôture ses séances. L'inscription réserve la
  place (verrou sur la séance, comptage `pending + paid`), crée le paiement FedaPay avec
  `appointment_id = group_session_{sessionId}_{participantId}` (convention héritée) au prix de la
  séance, et le webhook « approved » passe l'inscription à `paid`. `current_participants` = inscrits
  payés, maintenu par l'API (le trigger d'origine n'existait plus dans le schéma final).
- **Soldes praticien** : toujours recalculés depuis `payments` (`BalancesService`), rendez-vous
  et séances de groupe confondus. Le trigger hérité `sync_practitioner_balance_from_payments`
  ignorait les séances de groupe ; l'API recalcule après chaque changement de paiement.
- **Reversements** : `planned → sent → completed | failed`. Un reversement réserve les paiements
  « prêts » via `payout_payments` (plus de remise à zéro du solde) ; un échec ou un praticien
  ignoré libère les fonds. Les webhooks `transfer.*` retrouvent le reversement par
  `transaction_ids`. Les informations de reversement (`practitioner_payment_info`, méthodes
  `mtn` / `moov` / `bank` ; `orange` n'existe pas au Bénin) doivent être vérifiées.
- **Remboursements** : total ou partiel via FedaPay, statut `refunded` / `partially_refunded`,
  inscription de séance passée à `refunded`, écritures comptables équilibrées, patient notifié.
- **Jobs ajoutés** : `funds.release` (horaire, ex release-held-funds), `webhooks.retry` (5 min,
  backoff exponentiel, 5 tentatives), `payments.reminders` (rappel des inscriptions impayées
  depuis plus de 24 h, un rappel par jour).
- **Administration** : rôles réservés au `super_admin` pour la gestion des administrateurs
  (« désactiver » retire les rôles et révoque les sessions au lieu de supprimer le compte) ;
  suppression d'utilisateur réservée à `super_admin` / `ops`, comptes `@test.com` protégés ;
  journal `admin_audit_logs` alimenté avec l'adresse IP ; accès finance réservé à
  `finance` / `ops` / `super_admin` (`is_admin()` acceptait n'importe quel rôle).
- Correctif de schéma `db/native/130_fixes_heritage.sql` : colonne `updated_at` manquante sur
  `practitioner_payouts` (son trigger faisait échouer toute mise à jour) ; valeur d'enum
  `expense_gateway` pour les frais de passerelle.
- **Grand livre** (`ledger.service.ts`) : écritures d'encaissement équilibrées — `cash` = `payable` +
  `revenue_commission`, frais de passerelle en charge `expense_gateway` contre `cash` (l'historique
  les comptait en produit et créditait une « obligation » patient sans contrepartie).
- **Retour de paiement** : `callback_url` = `/payment/callback/<paymentId>` sans chaîne de requête,
  FedaPay y ajoutant `?id=&status=` ; la page front attend un paiement encore en cours au lieu de
  l'afficher en échec.
- **Frais** : défauts alignés sur la configuration de production (5 % de commission, 2 % de frais de
  passerelle payés par la plateforme), montants entiers en XOF ; `idempotency_key` =
  `<rendez-vous>:<rang>` ; numéro du payeur masqué dans `payments`, chiffré dans `payment_attempts`.
- **`POST /api/payments/:id/sync`** (patient) : une interrogation FedaPay par paiement toutes les 10 s,
  30 appels par utilisateur et 10 min, rien sur un paiement terminé ; la voie admin n'est pas limitée.
- **Reversements** : l'identifiant du dépôt FedaPay est enregistré avant son démarrage ; `payouts.sync`
  rattrape un transfert interrompu (dépôt jamais démarré → supprimé et fonds libérés ; envoyé → suivi) ;
  la réconciliation compare aussi `GET /v1/payouts` aux reversements.

## Support, litiges, dossier médical et statistiques (étape 6)

- **Support** : tickets `ouvert → en_cours → resolu → ferme` (l'utilisateur peut fermer le sien),
  rendez-vous rattaché vérifié, rôles `support` / `ops` / `super_admin` notifiés à la création et
  l'auteur à chaque réponse ; FAQ versionnées (le numéro de version s'incrémente à chaque
  modification de contenu), publiées ou non, filtrées par audience ; actions d'audit
  `update_ticket_status`, `create_faq`, `update_faq`, `publish_faq`, `unpublish_faq`, `delete_faq`.
- **Litiges** : ouverts par une partie du rendez-vous (sujet par défaut « Problème avec la
  consultation - <praticien> »), échéance SLA 24 h (urgent) / 48 h (haute) / 72 h ; job
  `disputes.sla` (horaire) qui passe en priorité haute les litiges en retard et alerte les admins ;
  fil de messages raiser ↔ admin ; `investigating` assigne l'admin, `resolved` exige une résolution.
- **Dossier médical** : profil (taux de complétion, médecin traitant = praticien approuvé ou saisie
  libre), contacts d'urgence, adresses ; le praticien ne consulte le dossier d'un patient que
  pendant un rendez-vous confirmé / en cours (contacts d'urgence uniquement en cours) et si le
  patient a activé le partage. Notes de soins SOAP une par rendez-vous, partage tracé
  (`care_notes_sharing_log`, le trigger hérité ne couvrait que les mises à jour) et notifié.
  Comptes rendus : vocabulaire canonique `domicile | teleconsultation | suivi` et
  `leger | modere | urgent` (les valeurs de `CompleteConsultationForm` sont converties), un par
  rendez-vous, option `completeAppointment` qui clôture la consultation dans la même transaction,
  chaque lecture journalisée dans `consultation_reports_access_log`.
- **Triage** : barème de `src/types/triage.ts` recalculé côté serveur (le score envoyé par le
  navigateur n'est plus pris en compte), historique et suppression par l'utilisateur.
- **Avis** : uniquement par le patient d'une consultation terminée, un par rendez-vous,
  `practitioners.rating` recalculée (avis masqués exclus, y compris après modération admin —
  l'origine ne recalculait jamais la note).
- **Moyens de paiement** : numéro chiffré AES-256-GCM côté serveur (`PHONE_ENCRYPTION_KEY`,
  obligatoire en production ; dérivée du secret JWT sinon), masqué en lecture, révélé seulement au
  propriétaire, un seul défaut par utilisateur.
- **Consentements** : la version active de `consent_versions` est mémorisée dans
  `consents.accepted_version` (colonne ajoutée par `130_fixes_heritage.sql`, avec les index
  manquants sur `disputes`, `reviews`, `care_notes`, `consultation_reports`, `faqs`).
- **Statistiques** : compteurs des tableaux de bord calculés en SQL (praticien : par statut, mois
  filtré, minutes réelles `consultation_started_at → consultation_ended_at` ; coach : revenus nets
  au taux `1 - commission` lu dans `system_config`, 63 % par défaut).

## Front (étape 7)

Le client web n'utilise plus `@supabase/supabase-js` : tous les hooks et écrans (patient,
praticien, coach, paiements, administration) appellent l'API via `src/lib/api/` (voir
`docs/migration-postgresql/README.md`) : `VITE_API_URL` (défaut `/api`), `VITE_WS_URL` (Socket.IO,
défaut même origine). En développement, `vite.config.ts` proxyfie `/api` et `/socket.io` vers
`VITE_DEV_API_TARGET` (`http://localhost:3000`) pour que les cookies httpOnly restent sur la même
origine. Le dossier `supabase/` (migrations et Edge Functions d'origine) est conservé comme
référence de la rétro-ingénierie ; `.env.production.save` (clés de l'ancien projet Supabase) n'est
plus lu par l'application.

## Prochaines étapes (ordre du chemin critique)

7. Recodage du front sur l'API : livré (7a socle + authentification + profil, 7b hooks et écrans
   patient / praticien / coach / paiements, 7c écrans admin et retrait de `@supabase/supabase-js`).

Compléments relevés pendant le recodage, livrés : `POST /api/appointments` sans `practitionerId`
(affectation automatique du praticien le plus proche, logique partagée avec la réassignation au
refus) et coordonnées arrondies des praticiens dans `GET /api/practitioners` pour les utilisateurs
connectés.
