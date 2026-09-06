# Domicares API (NestJS + PostgreSQL natif)

Back-end qui remplace Supabase Auth, PostgREST et les Edge Functions. Chemin critique de
`docs/migration-postgresql/03-RETRO-INGENIERIE.md` §8 : étape 1 **authentification, profil,
rôles**, étape 2 **praticiens, fichiers, KYC**, étape 3 **rendez-vous, paiements FedaPay,
webhook, jobs planifiés** et étape 4 **messagerie, notifications, temps réel Socket.IO,
push Web** livrées.

## Ce qui est implémenté

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
| `GET /api/practitioners`, `GET /api/practitioners/:id` | `get_public_practitioners()`, `practitioners_public_view`, `usePractitioners` |
| `GET /api/practitioners/available` | Edge Function `find-available-practitioner` (filtres métier, haversine, créneaux du jour, exceptions) |
| `GET/PATCH /api/practitioners/me` | accès direct à `practitioners` (espace praticien) |
| `/api/practitioners/me/availability`, `/exceptions`, `/rates` (+ lectures publiques `/:id/…`) | `useAvailability`, `usePractitionerRates` |
| `POST /api/files/upload-url` + `POST /api/files` | nouveau flux navigateur → S3 (URL pré-signée PUT) |
| `POST /api/files/upload` | Edge Function `upload-to-wasabi` (contrat base64 conservé) |
| `GET /api/files/url?filePath=` | Edge Function `get-presigned-url` (mêmes règles d'accès, journal `file_access_logs`) |
| `GET /api/admin/kyc/queue`, `POST /api/admin/kyc/:id/decision` | `KYCQueue.tsx` + `approve_practitioner_kyc()` + Edge Function `send-kyc-status-notification` (e-mail, SMS, notification in-app) |
| `POST /api/appointments`, `GET /api/appointments[?status=active]`, `GET /api/appointments/:id` | `useAppointments` + Edge Function `notify-appointment-request` |
| `POST /api/appointments/:id/respond` (accept / reject) | Edge Function `handle-appointment-response` (montant, demande de paiement, réassignation au praticien le plus proche) |
| `PATCH /api/appointments/:id/practitioner-status`, `POST …/complete`, `POST …/confirm`, `POST …/cancel` | `PractitionerStatusControl`, `CompleteConsultationForm`, `ConsultationConfirmation` |
| `POST /api/payments`, `GET /api/payments[/:id]`, `POST /api/payments/:id/cancel`, `POST /api/payments/:id/sync`, `GET /api/payments/config` | Edge Functions `create-payment`, `cancel-pending-payment`, `sync-payment-status`, `get-fedapay-config` |
| `POST /api/webhooks/fedapay` | Edge Function `payment-webhook` (HMAC-SHA256, idempotence `webhook_events`, ledger, notifications) |
| `POST /api/admin/payments/simulate-webhook`, `POST /api/admin/payments/:id/sync` | Edge Function `simulate-webhook` (client factice) |
| `GET /api/admin/jobs`, `POST /api/admin/jobs/:name/run` | Edge Functions `schedule-consultation-tasks`, `auto-sync-pending-payments`, `cleanup-stuck-payments` (exécutées par le worker toutes les 5 / 10 / 15 min) |
| `GET /api/conversations`, `GET /api/conversations/unread-count` | `useConversations` (rendez-vous confirmés/terminés, dernier message, non-lus) |
| `GET/POST /api/conversations/:appointmentId/messages`, `POST …/read` | `useMessages` (table `messages`, pièces jointes via `POST /api/files/upload-url` dossier `message-attachments`, notification push au destinataire) |
| `GET /api/notifications[?unreadOnly]`, `GET …/unread-count`, `POST …/:id/read`, `POST …/read-all`, `DELETE …/:id` | `useNotifications` |
| `GET/PUT /api/notifications/preferences` | `notification_preferences` (e-mail, SMS, WhatsApp, push) |
| `GET /api/push/vapid-public-key`, `POST/DELETE /api/push/subscriptions` | `src/lib/push-notifications.ts` (clé VAPID en dur remplacée) + table `push_subscriptions` |
| WebSocket Socket.IO `/socket.io` | Supabase Realtime `postgres_changes` (événement `change`) et canal presence `typing` |
| `GET /api/health`, `GET /api/docs` | — |

Autorisation : `JwtAuthGuard` (Bearer ou cookie) et `@AdminOnly('finance', …)` qui
remplace `is_admin(auth.uid())` / `has_role(...)`. Chaque transaction positionne
`app.user_id` / `app.user_role` pour que les fonctions SQL héritées (`auth.uid()`)
fonctionnent (`DatabaseService.runAs`).

## Démarrer en local

```bash
# 1. Base : PostgreSQL 16, puis dans l'ordre
psql -U postgres -c "CREATE DATABASE domicares"
psql -U postgres -d domicares -f ../db/native/010_roles.sql
psql -U postgres -d domicares -f ../db/native/schema.native.sql
psql -U postgres -d domicares -f ../db/native/120_drop_rls_optional.sql   # option B (recommandée)
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

## Prochaines étapes (ordre du chemin critique)

5. GroupSessions, Finance (payouts, remboursements), Admin
6. Support, disputes, audit, stats
