# Domicares API (NestJS + PostgreSQL natif)

Back-end qui remplace Supabase Auth, PostgREST et les Edge Functions. Chemin critique de
`docs/migration-postgresql/03-RETRO-INGENIERIE.md` §8 : étape 1 **authentification, profil,
rôles** et étape 2 **praticiens, fichiers, KYC** livrées.

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

## Prochaines étapes (ordre du chemin critique)

3. Appointments + Payments + webhook FedaPay + jobs `consultations.tick` / `payments.sync`
4. Messaging + Notifications + Realtime (Socket.IO branché sur `worker.ts`) + Push
5. GroupSessions, Finance, Admin — 6. Support, disputes, audit, stats
