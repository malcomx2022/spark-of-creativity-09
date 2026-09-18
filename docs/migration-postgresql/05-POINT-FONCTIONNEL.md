# 05 — Point fonctionnel : alignement pour une base PostgreSQL native sans Supabase

État au 7 septembre 2026, après la fusion de l'étape 7 (PR #55). Objectif de ce document :
vérifier que la base, le back-end, le front et l'outillage sont cohérents entre eux pour
quitter Supabase, et lister précisément ce qui reste à faire, par lot, avant la bascule.

## 1. Ce qui est aligné

| Domaine | État | Preuve |
|---|---|---|
| Schéma de base | **Natif** : `db/native/schema.native.sql` (58 tables, 5 vues, 46 fonctions, 24 triggers), rôles `domicares_app` / `domicares_migrator`, conversion `auth.users` → `public.users`, 0 FK vers `auth` | `scripts/db/build-native-schema.sh` rejoue les 93 migrations et valide |
| Authentification | JWT 15 min + refresh tournant (cookies httpOnly + corps), vérification d'e-mail, mots de passe, OTP Twilio Verify, résolution de rôle identique à l'ancien front | `api/src/auth`, `api/test/auth.e2e-spec.ts` |
| Autorisation | `JwtAuthGuard`, `OptionalJwtAuthGuard`, `@AdminOnly(...)` ; `app.user_id` / `app.user_role` positionnés par transaction pour les fonctions SQL héritées (`auth.uid()`) | `DatabaseService.runAs` |
| Edge Functions | 51 fonctions : 37 portées dans l'API, 7 devenues jobs du worker, 7 sans équivalent volontaire (voir §2.6) | `api/README.md` (table « Route / Remplace ») |
| Temps réel | 10 tables suivies par le front (`onTableChange`) = 10 triggers `pg_notify` (`110_realtime_notify.sql`) relayés par Socket.IO (rooms utilisateur / praticien / admin / rendez-vous) | `api/src/realtime` |
| Fichiers | S3 compatible (MinIO sur le VPS, Wasabi possible) : URL pré-signées, journal `file_access_logs`, contrat base64 conservé | `api/src/storage`, `src/lib/api/files.ts` |
| Jobs planifiés | 9 jobs dans le worker (`consultations.tick`, `payments.sync`, `payments.cleanup`, `payouts.sync`, `funds.release`, `webhooks.retry`, `payments.reminders`, `disputes.sla`, `maintenance.cleanup`) déclenchables via `POST /api/admin/jobs/:name/run` | `api/src/jobs` |
| Front | 0 import de `@supabase/supabase-js` ; socle `src/lib/api/` ; proxy Vite `/api` et `/socket.io` ; variables `VITE_API_URL`, `VITE_WS_URL`, `VITE_MAPBOX_TOKEN`, `VITE_SITE_URL` | `grep -r supabase src` ne renvoie que des commentaires historiques |
| Fournisseurs | `console` / `fake` en développement, `resend`, `twilio`, `s3`, `fedapay`, `webpush` en production ; la configuration refuse `OTP_PROVIDER=fake` et `STORAGE_PROVIDER=fake` en production | `api/src/config/config.schema.ts` |
| Infrastructure VPS | `deploy/vps/` : Caddy (TLS, `/api`, `/socket.io`, SPA), image web (build args `VITE_*`), API, worker, PostgreSQL 16, MinIO, sauvegarde quotidienne, `install-vps.sh` | `deploy/vps/docker-compose.yml` |
| Données réelles | Export (`pg_dump` public + `auth.users` avec hash bcrypt + métadonnées Storage + fichiers) et import natif validés sur une base simulée : comptages identiques, mots de passe toujours valides | `scripts/supabase/*`, `scripts/db/import-native.sh` |
| Tests | API : 8 suites e2e sur base réelle (77 tests) en CI ; front : 2 fichiers (9 tests) | `.github/workflows/api-ci.yml` |

## 2. Écarts et points d'attention

### 2.1 Données de production (urgent)

- Les deux projets Supabase sont **en pause depuis le 02/09/2026** (`02-RECUPERATION…` §1). Un
  projet gratuit en pause est supprimé par Supabase après 90 jours : l'export réel doit être fait
  **avant début décembre 2026**, et de préférence maintenant (réactivation, `export-supabase.sh`,
  `export-storage.mjs`, vérification des comptages).
- Secrets à reprendre à l'identique (§6 du même document) : **`PHONE_ENCRYPTION_KEY` doit être la
  valeur utilisée par l'Edge Function `secure-phone`**, sinon les numéros Mobile Money enregistrés
  (`saved_payment_methods.phone_number_encrypted`) ne seront plus déchiffrables et devront être
  ressaisis par les patients. Idem pour `FEDAPAY_SECRET_KEY` / `FEDAPAY_WEBHOOK_SECRET` (live),
  Twilio, Resend, Mapbox.
- Effets attendus de la bascule, à annoncer : reconnexion de tous les utilisateurs (jetons
  différents), ré-abonnement aux notifications push (nouvelle paire VAPID), enregistrement de la
  nouvelle URL de webhook FedaPay `https://<domaine>/api/webhooks/fedapay`.

### 2.2 CI/CD hérité contradictoire — **traité (lot A)**

Cinq workflows déployaient encore l'ancienne pile et se déclenchaient sur `main` :

| Workflow | Problème |
|---|---|
| `deploy.yml` | Build du front puis `git reset --hard` + `npm run build` sur le VPS et `systemctl reload nginx` : ne déploie ni l'API, ni le worker, ni la base |
| `deploy-prod.yml`, `deploy-dev.yml`, `deploy-test.yml` | Tests Deno des Edge Functions, `VITE_SUPABASE_URL` / `PROD_ANON_KEY`, `docker exec supabase-prod-*`, `supabase functions deploy` |
| `supabase-deploy.yml` | Déploie les Edge Functions sur Supabase à chaque push sur `main` |
| `.github/workflows/README.md` | Décrit des secrets Supabase (`DEV_ANON_KEY`…) |

Ils sont supprimés et remplacés par `web-ci.yml` (lint informatif, typecheck, tests, build du
front) et `deploy-vps.yml` (manuel jusqu'à la mise en service du VPS : `git reset --hard`,
`docker compose build` / `up -d` de `deploy/vps`, contrôle `GET /api/health`). Le dossier
`migration/` (plan « Supabase self-hosted » de 2025) est supprimé ; `.github/workflows/README.md`
décrit les secrets réellement nécessaires (SSH et domaine seulement).

### 2.3 Fichiers suivis par git — **nettoyés (lot A)**

| Fichier | Constat | Action |
|---|---|---|
| `env.production` | `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL` | Supprimer |
| `.env.production.save` | Clés de l'ancien projet Supabase | Supprimer |
| `.env` | Suivi par git (ne contient plus que les 3 variables de l'API) | Retirer du suivi, garder `.env.example` |
| `supabase/config.toml` | Configuration CLI Supabase | Supprimer (le dossier `legacy/supabase/migrations` et `legacy/supabase/functions` restent en référence) |
| `bun.lockb` | Verrou Bun périmé, le projet utilise npm (`package-lock.json`) | Supprimer |
| `tmp/` | 1 fichier suivi | Supprimer et ignorer |
| `README.md` (racine) | Gabarit Lovable | Réécrit : architecture, démarrage local, vérifications, documentation |
| `.env.local.example` | `VITE_FEDAPAY_*` (la clé publique vient de `GET /api/payments/config`) | Supprimé |

### 2.4 Rétention des données — **job ajouté (lot B)**

Six fonctions SQL de purge existent et n'étaient **déjà pas planifiées** chez Supabase (aucun
`pg_cron` versionné) : `cleanup_old_otp_rate_limits`, `cleanup_old_file_access_logs`,
`cleanup_old_payment_attempts`, `cleanup_old_search_activity_logs`, `cleanup_orphan_accounts`,
`repair_missing_profiles`. Seule `cleanup_old_otp_attempts` est déclenchée par trigger.
Le job `maintenance.cleanup` (quotidien, worker) exécute les quatre purges et
`repair_missing_profiles()`, compte les comptes orphelins et ne les supprime qu'avec l'option
`deleteOrphans: true` (`POST /api/admin/jobs/maintenance.cleanup/run`). Test e2e ajouté.

### 2.5 Infrastructure

- **Redis** — **retiré du compose (lot B)** : l'API ne le lisait pas. À réintroduire comme
  adaptateur Socket.IO seulement si l'API est déployée en plusieurs réplicas (noté dans
  `04-PLAN-EXECUTION-VPS.md` §5).
- Console MinIO exposée en option dans le `Caddyfile` : à protéger ou à ne pas publier.

### 2.6 Edge Functions sans équivalent (choix assumés)

| Fonction | Décision |
|---|---|
| `diagnose-stuck-payments`, `test-fedapay-connectivity` | Outils de diagnostic admin non repris ; `GET /api/admin/finance/payments?status=pending` et `POST /api/admin/payments/:id/sync` couvrent le besoin opérationnel. À recréer seulement si l'équipe support les réclame |
| `manage-momo-wallet` | Table `momo_wallets` absente du schéma : fonctionnalité abandonnée (composant supprimé) |
| `export-database`, `import-database` | Remplacés par `pg_dump` / `scripts/db/import-native.sh` et le service `backup` du compose |
| `get-webhook-url` | URL déduite côté front de `VITE_API_URL` |
| `create-test-users`, `apply-ledger-entries` | Comptes de test via `POST /api/auth/register` ; ledger écrit par `api/src/payments/ledger.service.ts` |

### 2.7 Simplifications faites pendant le recodage du front (à connaître)

| Écran | Simplification | Suite possible |
|---|---|---|
| `SupportSection` (admin) | 100 derniers tickets | **Fait (lot B)** : filtres `status` / `priority` envoyés à l'API, compteurs via `…/tickets/stats` |
| `SearchActivitySection` | 200 dernières entrées (2 pages de 100), recherche session / praticien côté client ; statistiques calculées par l'API sur toute la période | Ajouter `search` côté API si le volume grandit |
| `OTPManagementSection` | Export CSV limité à la page courante (50) | Export serveur si besoin |
| `PaymentFlowsDashboard` | Reversements actifs et transactions FedaPay filtrés côté client sur les 100 derniers | Filtres multi-statuts côté API |
| `PaymentsSection` (patient) | 200 derniers paiements, tri / pagination côté client | Pagination serveur |
| `useMessages` | Pas de route « tous mes messages » ni « marquer un message » : agrégation des conversations, `POST …/read` marque toute la conversation | Routes dédiées si un écran l'exige |
| `PractitionerMap` | Les praticiens sans coordonnées ont `latitude = longitude = 0` (marqueur hors carte) ; la page de recherche les exclut déjà du calcul de distance | Filtrer aussi les marqueurs |
| `src/types/api-responses.ts` | Ex `edge-function-responses.ts` | **Fait (lot B)** : renommé, interfaces inutilisées retirées |

### 2.8 Qualité

- Front : 9 tests (client API, connexion OTP) et aucun workflow CI ; `npm run lint` remonte des
  `any` préexistants dans les écrans hérités.
- API : 77 tests e2e mais pas de test de charge ni de test du worker en conditions réelles
  (FedaPay factice uniquement en CI ; le mode `live` n'est validable qu'en pré-production).
- Front : workflow `web-ci.yml` ajouté (lot A).
- 71 documents de `docs/` et 18 `REVUE_*.md` de l'ère Supabase / Lovable sont archivés dans
  `docs/archive/` (lot A) ; `docs/migration-postgresql` et `api/README.md` restent la référence.

## 3. Lots proposés

| Lot | Contenu | Risque | Durée indicative |
|---|---|---|---|
| **A — Dépôt** | **Livré** : §2.2, §2.3, README racine, archivage §2.8 | — | — |
| **B — API et infra** | **Livré** : job `maintenance.cleanup` (§2.4), Redis retiré (§2.5), types renommés et filtres serveur des tickets (§2.7) | — | — |
| **C — Données** | **Livré** (10/09) : export réel contrôlé, fichiers Storage récupérés en local, import à blanc réussi sur PostgreSQL 16 et API vérifiée dessus (`06-INVENTAIRE-SUPABASE.md` §3.1) ; l'envoi des fichiers vers MinIO fait partie de `bascule.sh` (lot D) ; reste la reprise des secrets (§2.1) dans `.env` | — | — |
| **D — Bascule** | **Exécuté** (17/09) sur le VPS Hostinger : `preflight.sh` à 0 bloquant, `bascule.sh` mené à terme — 55 tables importées sans écart de comptage, 49 comptes, 33 praticiens, 101 objets dans MinIO (97 `documents`, 4 `avatars`), `/api/health` à `ok` sur la base importée. Le DNS apex et `www` pointent déjà sur le VPS. Reste la checklist `04-PLAN…` §4 : recette fonctionnelle par un patient, un praticien, un coach et un administrateur réels, webhook FedaPay live, bascule de `app.domicares.life`, surveillance J+1 | élevé (production) | 1 journée |

Ordre recommandé : C (export réel) dès maintenant, puis répétition générale sur le VPS, puis D.
