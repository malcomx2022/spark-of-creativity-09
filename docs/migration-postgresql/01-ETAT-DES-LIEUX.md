# 01 — État des lieux du projet Domicares (septembre 2026)

Inventaire établi par lecture du dépôt (`main`, 88 commits, du 27/01/2026 au 07/07/2026),
rejeu des migrations sur un PostgreSQL 16 local et interrogation de l'API Supabase.

## 1. Le produit

Plateforme de soins et de coaching sportif à domicile (Bénin, paiement Mobile Money via FedaPay).
Quatre acteurs : **patient**, **praticien** (médecin, infirmier, kiné, nutritionniste, sage-femme,
psychologue…), **coach sportif** (praticien typé `coach_sportif`, séances de groupe) et
**administration** (super_admin, ops, finance, compliance, support, analyst).

Parcours couverts : inscription + KYC praticien, OTP SMS, recherche géolocalisée (Mapbox),
triage, prise de rendez-vous avec paiement, suivi GPS, rapport de consultation, avis,
messagerie temps réel, notifications push/e-mail/SMS, ledger interne, payouts, litiges,
support, back-office complet.

## 2. Architecture actuelle (Lovable Cloud / Supabase)

```
Navigateur ── React SPA (Vite) ──┬── supabase-js ──► PostgREST ─► PostgreSQL 17 (RLS, 155 policies)
                                 ├── supabase.auth ─► GoTrue (auth.users)
                                 ├── supabase.channel ─► Realtime (postgres_changes, presence)
                                 ├── supabase.storage ─► Storage (3 buckets)
                                 └── functions.invoke ─► 46 Edge Functions Deno ──► FedaPay, Twilio,
                                                                                    Resend, Web Push, Mapbox
```

Le front parle **directement à la base** (43 tables + 2 vues via `supabase.from`) : la logique
métier est éclatée entre le front, les policies RLS, 43 fonctions SQL et les Edge Functions.

## 3. Inventaire chiffré

### 3.1 Front-end (`src/`)

| Élément | Valeur |
|---|---|
| Stack | Vite 5, React 18, TypeScript (**strict: false**), Tailwind, shadcn/ui, TanStack Query 5, react-hook-form + zod, react-router 6 |
| Volume | 65 882 lignes TS/TSX, 30 routes (`src/App.tsx`), 29 pages (28 en lazy loading), 35 hooks |
| Couplage Supabase | **121 fichiers** importent `@/integrations/supabase/client` |
| Accès direct aux tables | 43 tables + vues `admin_dashboard_stats`, `admin_finance_stats` ; RPC `get_public_stats`, `get_public_practitioners` |
| Auth | 13 méthodes `supabase.auth.*` (signUp, signInWithPassword, signInWithOtp, verifyOtp, resend, updateUser, resetPasswordForEmail, setSession, getSession/getUser, onAuthStateChange, signOut) |
| Temps réel | 19 `channel()` : `postgres_changes` sur 11 tables + canal `presence` « typing » (messagerie) |
| Storage | bucket `message-attachments` en direct (`useConversations.ts`) ; `documents`/`avatars` via Edge Functions |
| Edge Functions appelées | 31 distinctes (dont 1 inexistante, cf. §5) |
| Tests | 1 test React (`LoginWithOTP.test.tsx`), 3 tests Deno côté functions |
| Types générés | `src/integrations/supabase/types.ts` (3 041 lignes) — dérivé du schéma, à remplacer |

### 3.2 Base de données (`legacy/supabase/migrations/`, rejouée localement)

| Élément | Valeur |
|---|---|
| Fichiers de migration | 93, dont le **snapshot complet** `20260126121712_remote_schema.sql` (6 843 lignes) + 6 migrations postérieures |
| Tables `public` | **55** (plus grosses : `practitioners` 37 col., `appointments` 29, `payments` 26) |
| Vues | 5 : `practitioners_public_view`, `payment_events_sanitized`, `homepage_stats`, `admin_dashboard_stats`, `admin_finance_stats` |
| Enums | 9 (`app_role`, `practitioner_type`, `ticket_status`, `ledger_*`, `payout_batch_status`, `consent_type`, `gender`, `blood_type`) |
| Fonctions SQL applicatives | **43**, dont **41 SECURITY DEFINER** ; 4 dépendent de `auth.uid()/auth.jwt()` ; 2 lisent `auth.users` (`cleanup_orphan_accounts`, `repair_missing_profiles`) |
| Triggers | 12 sur `public` + 1 sur `auth.users` (`handle_new_user_safe` → crée `profiles`) |
| RLS | 55/55 tables avec RLS ; **155 policies** `public` + 9 sur `storage.objects` ; 415 usages de `auth.uid()`, 24 de `auth.jwt()->>'role'` (contournement `service_role`) |
| Clés étrangères vers `auth.users` | **31** (profiles.id, practitioners.user_id, addresses, notifications, …) |
| Storage | buckets `documents`, `avatars` (migration 2026-02-13), `message-attachments` (créé hors migrations) |
| Realtime | publication `supabase_realtime` : `notifications`, `practitioner_balances`, `group_sessions`, `group_session_participants` (le front écoute 11 tables ⇒ 7 ne sont pas publiées) |
| Extensions | aucune déclarée dans les migrations (le snapshot fait `drop extension pg_net`) ; `pgcrypto` implicite (`gen_random_uuid`) |
| Planification | **aucun `pg_cron` versionné** ; 8 fonctions « cron » (`schedule-consultation-tasks`, `auto-sync-pending-payments`, `send-payment-reminders`, `cleanup-*`, `retry-failed-webhooks`…) n'ont pas d'ordonnanceur identifié dans le dépôt |

### 3.3 Edge Functions (`legacy/supabase/functions/`)

| Élément | Valeur |
|---|---|
| Nombre | **46** + `_shared` (cors, csrf, logging, notifications) — 15 274 lignes TypeScript/Deno |
| Appelées par le front | 31 (paiement, RDV, OTP, KYC, admin, fichiers, payouts, tests) |
| Internes / webhook / cron | 16 (`payment-webhook` FedaPay, `send-push-notification`, `apply-ledger-entries`, `create-payout`, tâches planifiées, `export/import-database`…) |
| `verify_jwt = false` | 13 (`payment-webhook`, `send-otp`, `verify-otp`, `upload-to-wasabi`, `create-practitioner-account`, `create-test-users`, `find-available-practitioner`, `get-*-config/token/url`, `auto-sync-pending-payments`, `test-fedapay-connectivity`, `import-database`) |
| Secrets consommés | 27 clés : `SUPABASE_URL/SERVICE_ROLE_KEY/ANON_KEY`, `FEDAPAY_{MODE,PUBLIC_KEY,SECRET_KEY,WEBHOOK_SECRET}`, `APP_BASE_URL`, `TWILIO_{ACCOUNT_SID,AUTH_TOKEN,VERIFY_SERVICE_SID,PHONE_NUMBER,FROM_NUMBER,MESSAGING_SERVICE_SID}`, `RESEND_{API_KEY,FROM_EMAIL}`, `NOTIFICATION_EMAIL_FROM`, `MAIL_FROM_EMAIL`, `MAILJET_API_KEY`, `MAILERSEND_API_KEY`, `WEB_PUSH_{PUBLIC_KEY,PRIVATE_KEY,EMAIL}`, `MAPBOX_TOKEN`, `PHONE_ENCRYPTION_KEY`, `SITE_URL`, `FRONTEND_URL` |
| Services tiers | FedaPay (sandbox + live, webhook HMAC-SHA256 timing-safe), Twilio Verify + SMS, Resend (e-mail), Web Push VAPID, Mapbox |

### 3.4 Projets Supabase (API Supabase, 02/09/2026)

| Ref | Nom | Région | PG | Statut |
|---|---|---|---|---|
| `jucqnqatncjcjlnhprsq` | DOMICARESLIFE (celui de `supabase/config.toml` et de `.env`) | eu-west-2 | 17.6 | **INACTIVE (en pause)** |
| `mwkggpztzpykhggktyir` | Domicare | eu-west-3 | 17.6 | **INACTIVE (en pause)** |
| `kskkufjliwdfqqyemcpf` | projet Lovable Cloud d'origine (source des dumps `migration/data/*.sql` de janvier 2025) | — | — | hors de l'organisation visible |

### 3.5 Infra / CI existantes

- `.github/workflows/deploy.yml` : build Vite puis SSH vers un VPS (lint/tests en `|| true`).
- `.github/workflows/supabase-deploy.yml` : déploiement des Edge Functions.
- `migration/` : tentative antérieure de **Supabase self-hosted** (Kong, PostgREST, GoTrue…) sur
  VPS Hostinger. Réutilisable pour le durcissement VPS et nginx, **pas** pour la cible native.
- `docs/refactor/Domicares-Refonte-PG-Flutter.docx` : dossier de refonte (NestJS + Prisma +
  PostgreSQL 16 + Redis + MinIO, puis Flutter). Le présent dossier en est l'exécution technique.

## 4. Ce qui est réellement couplé à Supabase (à remplacer)

| Brique Supabase | Où | Volume | Cible native |
|---|---|---|---|
| PostgREST (`supabase.from`) | 121 fichiers front | 43 tables | API REST NestJS + client `api/` |
| GoTrue (`supabase.auth`) | 41 fichiers front, 31 FK + 1 trigger en base, `raw_user_meta_data.pending_onboarding` | 13 méthodes | Module Auth (JWT + refresh, bcrypt, Twilio Verify, Resend) sur `public.users` |
| RLS (`auth.uid()`) | 155 policies, 4 fonctions | — | Guards/policies NestJS (option B) ou RLS conservée via GUC (option A) |
| Realtime | 19 abonnements | 11 tables + presence | `pg_notify` → worker → Socket.IO (rooms) |
| Storage | 3 buckets, 9 policies, 2 functions | — | S3 (MinIO/Wasabi) + URLs pré-signées via API |
| Edge Functions | 46 | 15 274 lignes | Modules/controllers NestJS + workers BullMQ + cron |
| Secrets Lovable Cloud | 27 clés | — | `.env` du VPS (gestionnaire de secrets) |

## 5. Constats et risques (par priorité)

1. **Perte de données imminente** — les deux projets Supabase sont *paused*. Un projet gratuit en
   pause peut être **supprimé après 90 jours** ; le projet de production a été créé le 22/01/2026
   et le dernier commit date du 07/07/2026. Restaurer et exporter **immédiatement** (doc 02).
2. **Les sauvegardes du dépôt ne sont pas exploitables** : `migration/data/*.sql` datent de
   janvier 2025, viennent de l'ancien projet Lovable et contiennent ~14 profils ; les mots de
   passe n'y sont pas. Seul un `pg_dump` du projet actuel fait foi.
3. **Schéma versionné ≠ schéma réel** : le bucket `message-attachments` et probablement des
   policies/colonnes récentes n'existent que dans le dashboard. `export-supabase.sh` exporte le
   schéma réel pour comparaison (`diff schema_public.sql db/native/schema.native.sql`).
4. **Récursion RLS reproduite** : `profiles` ← policy « Practitioners can view patient profiles
   for appointments » → `appointments` → policy → `profiles` : PostgreSQL lève
   `infinite recursion detected in policy for relation "appointments"` dès qu'un utilisateur
   authentifié lit `profiles`. Confirme la recommandation de porter l'autorisation côté API.
5. **Appel mort** : `PaymentsMonitoring.tsx` invoque `reconcile-payments`, fonction inexistante
   (la bonne est `reconcile-fedapay`).
6. **Nom trompeur** : `upload-to-wasabi` écrit en réalité dans Supabase Storage (commentaire
   « migré depuis Wasabi ») ; les fichiers sont donc bien dans Supabase et doivent être exportés.
7. **Surface d'attaque** : 13 fonctions sans vérification JWT (dont `create-practitioner-account`,
   `import-database`, `create-test-users`) ; 41 fonctions SQL `SECURITY DEFINER` ; policies
   « service_role » contournables si un JWT est forgé.
8. **Secrets dans le dépôt** : `.env`, `env.production`, `.env.production.save` sont versionnés
   (clé *publishable* seulement, mais à purger de l'historique) ; clé VAPID publique en dur dans
   `src/lib/push-notifications.ts` ; clé FedaPay sandbox dans `.env.local.example`.
9. **Qualité** : TypeScript non strict, 1 test front, CI qui masque les échecs, 154 `console.log`,
   ~120 `: any`. À corriger en même temps que le découplage.
10. **Ordonnancement absent** : les 8 traitements planifiés (expiration des créneaux non payés,
    auto-confirmation à 24 h, relances, réconciliation FedaPay, retry webhooks, nettoyages) n'ont
    pas de déclencheur versionné. Ils deviennent des jobs BullMQ/cron dans le worker natif.
11. **Snapshot SQL défectueux** : `20260126121712_remote_schema.sql` crée la vue
    `admin_dashboard_stats` avant la fonction qu'elle utilise (erreur au rejeu, corrigée par
    `100_to_native.sql`).

## 6. Ce qui est sain et réutilisable

- Le schéma relationnel (55 tables, enums, contraintes, index) est du **PostgreSQL pur** : il se
  rejoue tel quel avec le shim et devient `db/native/schema.native.sql` sans réécriture.
- Les 43 fonctions SQL (ledger atomique, réservation de place, KYC, stats publiques) sont
  conservées et restent appelables depuis l'API.
- La logique des Edge Functions (validation zod, calcul de frais, transitions de statut de
  paiement, HMAC webhook) est du TypeScript portable en NestJS presque ligne à ligne.
- Le front (composants, hooks TanStack Query, formulaires) est conservé ; seule la couche d'accès
  aux données change.
