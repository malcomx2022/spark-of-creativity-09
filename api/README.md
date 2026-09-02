# Domicares API (NestJS + PostgreSQL natif)

Back-end qui remplace Supabase Auth, PostgREST et les Edge Functions. Étape 1 du chemin
critique de `docs/migration-postgresql/03-RETRO-INGENIERIE.md` §8 : **authentification,
profil, rôles**.

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

## Prochaines étapes (ordre du chemin critique)

2. Practitioners + Files (inscription praticien atomique, KYC, S3 pré-signé)
3. Appointments + Payments + webhook FedaPay + jobs `consultations.tick` / `payments.sync`
4. Messaging + Notifications + Realtime (Socket.IO branché sur `worker.ts`) + Push
5. GroupSessions, Finance, Admin — 6. Support, disputes, audit, stats
