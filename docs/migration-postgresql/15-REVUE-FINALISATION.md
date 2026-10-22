# 15 — Revue de finalisation : tests et listing des modules — 22 octobre 2026

Base : `main` / `c780429`. Branche : `claude/great-cray-xdeaqp`.
Objet : faire l'état des tests unitaires et d'intégration, lister les modules
et identifier ce qui reste à faire pour terminer Domicares. Les sections 1 à 5
décrivent l'état initial de la revue ; la section 6 décrit la suite donnée
(correction du P1 et tests d'intégration ajoutés). Aucun schéma SQL ni secret modifié.

## 1. Résultats des contrôles exécutés

Environnement : Node 22.22.0, `npm ci` à la racine et dans `api/`, PostgreSQL 16
local avec une base jetable `domicares_test`. Le schéma a été chargé comme en CI
(`010_roles.sql`, `schema.native.sql`, `120_drop_rls_optional.sql`,
`130_fixes_heritage.sql`, `020_grants.sql`), sans erreur : 63 tables.

| Contrôle | Commande | Résultat |
|---|---|---|
| Typecheck front | `npx tsc --noEmit -p tsconfig.app.json` | OK |
| Tests front (Vitest) | `npm test` | **17 fichiers, 62 tests, tous réussis** |
| Lint (front + API) | `npm run lint` | 0 erreur, 45 avertissements hérités (36 `react-hooks/exhaustive-deps`, 9 `react-refresh/only-export-components`) |
| Build front | `npm run build` | OK ; avertissement de taille de chunk Vite (non bloquant) |
| Navigateur (Playwright) | `npx playwright test --project=chromium` | **38 tests réussis** (Chromium seulement) |
| Typecheck API | `cd api && npm run typecheck` | OK |
| Tests unitaires API | `npm test -- --runInBand` | **8 suites, 42 tests, tous réussis** |
| Lint API | `cd api && npm run lint` | OK |
| Build API | `npm run build` | OK |
| Intégration API (PostgreSQL réel) | `npm run test:e2e` | **9 suites, 102 tests réussis ; 4 ignorés (MinIO)** |
| Audit dépendances | `npm audit --audit-level=high` (racine et `api/`) | 0 vulnérabilité |

Variables e2e utilisées, comme en CI :
`DATABASE_URL=postgresql://domicares_app:ci@localhost:5432/domicares_test`,
`JWT_ACCESS_SECRET=<secret de test de 44 caractères>`.

Point nouveau par rapport au document 14 : le test PostgreSQL de
`GET /api/conversations/:appointmentId` (détail pour les deux participants,
refus d'un tiers et d'un anonyme, identifiant invalide), indiqué « reste à
exécuter en intégration/CI », **a été exécuté et réussit** (suite
`messaging-realtime`, 11/11).

Non validé dans cette campagne : `storage-s3` (4 tests, MinIO absent, Docker
indisponible), projets Playwright WebKit iPhone/iPad (navigateur WebKit non
installé), Safari physique, FedaPay sandbox réel et VPS.

### Détail par suite d'intégration

| Suite e2e | Tests | Statut |
|---|---|---|
| `auth` | 14 | réussis |
| `security-regressions` (concurrence, jetons, fichiers) | 14 | réussis |
| `appointments-payments` | 14 | réussis |
| `practitioners` | 13 | réussis |
| `group-sessions-finance` | 12 | réussis |
| `messaging-realtime` | 11 | réussis |
| `admin` | 9 | réussis |
| `medical` | 9 | réussis |
| `support-disputes` | 6 | réussis |
| `storage-s3` | 4 | ignorés (`S3_TEST_ENDPOINT` absent) |

## 2. Listing des modules

### 2.1 API NestJS (`api/src/`)

« Routes testées » : routes HTTP du module retrouvées dans un appel
`app.inject` des suites e2e (analyse statique des contrôleurs ; 187 routes sur
216, soit 87 %). Les appels unitaires Fastify de `contact.controller.spec.ts`
ne sont pas comptés dans cette colonne.

| Module | Rôle | Services principaux | Routes testées e2e | Tests unitaires | Suite e2e principale |
|---|---|---|---|---|---|
| `auth` | Inscription, connexion, refresh tokens, OTP, mots de passe, résolution des rôles | `auth`, `tokens`, `account-status`, `role-resolver` | 11/14 | — | `auth`, `security-regressions` |
| `profiles` | Profil utilisateur | `profiles` | 2/2 | — | `auth` |
| `practitioners` | Fiche praticien, disponibilités, exceptions, tarifs, recherche | `practitioners`, `schedule` | 13/18 | — | `practitioners` |
| `kyc` | Documents de vérification praticien | `kyc` | 2/2 | — | `practitioners` |
| `appointments` | Rendez-vous, cycle de consultation, projection selon l'appelant | `appointments` | 9/9 | — | `appointments-payments` |
| `payments` | FedaPay, webhooks signés, ledger, soldes | `payments`, `ledger`, `balances`, `fedapay.client` | 8/10 | `fees.spec` | `appointments-payments` |
| `payment-methods` | Moyens de paiement chiffrés | `payment-methods` | 5/5 | — | `medical` |
| `finance` | Versements, lots, remboursements, retenues, réconciliation | `finance` | 19/26 | — | `group-sessions-finance` |
| `group-sessions` | Séances de groupe des coachs | `group-sessions` | 12/13 | — | `group-sessions-finance` |
| `messaging` | Conversations liées aux rendez-vous | `messaging` | 6/6 | `message-link.spec` | `messaging-realtime` |
| `notifications` | In-app, e-mail, SMS, push, OTP | `dispatch`, `email`, `sms`, `push`, `in-app-notifications` | 10/10 | `push.service.spec`, `push-endpoint.spec` | `messaging-realtime` |
| `realtime` | Socket.IO et relais LISTEN/NOTIFY | `realtime.gateway`, `change-listener` | passerelle | `realtime.gateway.spec` | `messaging-realtime` |
| `medical` | Dossier médical, notes SOAP, comptes rendus, adresses, contacts d'urgence | `medical` | 25/31 | — | `medical` |
| `files` | Envoi et lecture de fichiers vérifiés | `files` | 5/5 | — | `security-regressions` |
| `storage` | Abstraction S3 / fake | `storage`, `storage.provider` | — | — | `storage-s3` (ignorée) |
| `reviews` | Avis patients | `reviews` | 4/4 | — | `practitioners` |
| `disputes` | Litiges | `disputes` | 7/7 | — | `support-disputes` |
| `support` | Tickets, FAQ, contact public | `support` | 11/13 | `contact.controller.spec` | `support-disputes` |
| `stats` | Statistiques publiques et tableaux de bord | `stats` | 3/3 | — | `admin` |
| `admin` | Back-office : utilisateurs, rôles, consentements, audit, configuration | `admin` | 31/34 | — | `admin` |
| `jobs` | Tâches planifiées et exécution manuelle | `jobs` | 2/2 | — | `admin` |
| `audit` | Journal d'audit | `audit` | interne | — | indirect |
| `health` | Sondes de vie et de disponibilité | — | 2/2 | — | `auth` |
| `database` | Kysely, `runAs`, contexte SQL | `database` | interne | — | toutes |
| `config` | Schéma Zod de configuration et gardes de production | — | — | `config.schema.spec` | — |
| `common` | Gardes, pipe Zod, filtre d'erreurs, utilitaires | — | — | `date-only.spec` | indirect |

Points d'entrée : `main.ts` (API) et `worker.ts` (jobs) ; `app.factory.ts`
construit l'application testée par les suites e2e.

### 2.2 Front React (`src/`)

| Zone | Contenu | Tests Vitest |
|---|---|---|
| `pages/` | 29 pages : accueil, connexions (patient, praticien, admin, OTP), inscriptions, tableaux de bord patient/praticien/coach/admin, recherche praticien/coach, triage, contact, paiement (callback), pages légales | `Contact`, `LoginWithOTP`, `PaymentCallback` |
| `components/dashboard/` | 36 composants, ~14 700 lignes | aucun |
| `components/admin/` | 25 composants, ~10 800 lignes | aucun |
| `components/coach/` | 7 composants, ~2 200 lignes | aucun |
| `components/messaging/` | 2 composants, ~650 lignes | via `useConversationSelection` |
| `components/` (racine) | 36 composants transverses : rendez-vous, paiement FedaPay, cartes, GPS, routes protégées, PWA | `DashboardRedirect`, `PwaStatus` |
| `components/ui/` | 50 composants de base (shadcn) | — |
| `hooks/` | 39 hooks TanStack Query et utilitaires | `useConversationSelection`, `useDashboardTab` |
| `lib/api/` | Client HTTP, session, cache, temps réel, mutations hors ligne, push | 8 fichiers de tests |
| `lib/` | Stockage et callback de paiement, service worker | `payment-storage`, `payment-callback`, `pwa-worker` |
| `tests/browser/` | Compatibilité responsive, espaces par rôle, formulaire mobile, PWA | 38 tests Chromium (+ WebKit en CI) |

## 3. Constats de revue

Classement : **P1** à traiter avant mise en production, **P2** à planifier,
**P3** amélioration. Aucun constat ne justifie de modifier ce lot sans décision.

### P1 — `POST /api/admin/users/cleanup-non-test` supprime tous les patients réels — **corrigé (§6)**

`AdminService.cleanupNonTestAccounts` (`api/src/admin/admin.service.ts:247`)
supprime chaque compte dont l'e-mail ne finit pas par le domaine de test **et**
qui n'a aucune ligne `user_roles`. Or le rôle patient est le rôle par défaut,
sans ligne `user_roles` (`role-resolver.service.ts:51`). En production, un
`super_admin` qui confirme `SUPPRIMER` efface donc définitivement tous les
patients réels (avec leurs données purgées). Aucune garde `NODE_ENV` n'existe,
contrairement à `FEDAPAY_PROVIDER=fake` ou `STORAGE_PROVIDER=fake`
(`config.schema.ts:95-114`). Route non couverte par les tests.

Recommandation : refuser la route lorsque `NODE_ENV=production` (403), sur le
modèle de `simulate-webhook`, et ajouter un test e2e. Évolution de comportement
d'une route existante : à décider explicitement.

### P2 — Le décompte des échecs de ce même nettoyage est inopérant

La boucle capture les erreurs de `purgeUser` dans une seule transaction `runAs`,
sans point de sauvegarde. Dans PostgreSQL, une erreur SQL place la transaction
en état annulé : les suppressions suivantes et le journal d'audit échouent,
puis toute l'opération est annulée avec une erreur 500. Le résultat
« N échecs » ne peut donc jamais être renvoyé. Constat issu de la lecture du
code et de la sémantique PostgreSQL, non reproduit dans cette revue.

### P2 — Le changement de mot de passe ne révoque pas les autres sessions

`AuthService.resetPassword` révoque les refresh tokens de l'utilisateur
(`auth.service.ts:288`) ; `changePassword` (`auth.service.ts:293`) ne le fait
pas. Un appareil compromis conserve sa session après un changement de mot de
passe. Recommandation : révoquer les autres familles de refresh tokens en
conservant la session courante, avec un test e2e.

### P2 — Routes sans test d'intégration (29 sur 216) — **couvertes (§6)**

À couvrir en priorité (sécurité ou argent) :

- `auth` : `POST /auth/password/change`, `DELETE /auth/sessions`,
  `POST /auth/verify-email/resend` ;
- `admin` : `POST /admin/users/cleanup-non-test`,
  `POST /admin/consent-versions/:id/deactivate`, `GET /admin/users/practitioners/:id` ;
- `finance` (lectures admin) : `GET /admin/finance/payments`, `balances`,
  `payouts`, `payout-batches`, `reconciliation`, `payment-events`, et
  `GET /finance/me/payment-info` ;
- `payments` : `GET /payments/config`, `POST /admin/payments/simulate-webhook`
  (vérifier le refus 403 hors fournisseur factice) ;
- `medical` : `GET /care-notes`, `PATCH /care-notes/:id`,
  `GET /consultation-reports/appointment/:appointmentId`, `PATCH /addresses/:id`,
  `GET` et `DELETE /medical/emergency-contacts` ;
- `practitioners` : suppression de disponibilité/exception, modification et
  suppression de tarif, `GET /practitioners/:id/exceptions` ;
- `group-sessions` : `POST /group-sessions/:id/complete` ;
- `support` : `GET /admin/support/faqs` (le contact public est couvert en unitaire).

La lecture du code de `care-notes` et `consultation-reports` par rendez-vous
confirme un filtrage sur le praticien connecté ; seul le test manque.

### P3 — Couverture front et qualité

- Les composants `dashboard/`, `admin/` et `coach/` (~27 700 lignes) n'ont pas
  de test unitaire ; prioriser le paiement (`PaymentDialog`, `FedaPayWidget`),
  la prise de rendez-vous (`NewAppointmentDialog`) et le formulaire de fin de
  consultation (`CompleteConsultationForm`).
- 45 avertissements de lint hérités (lot 6 du document 10).
- Le build signale un chunk volumineux ; les plus gros sont `vendor-charts`
  (432 kB) et `jspdf` (386 kB). Le chargement différé de jsPDF est une piste.
- Unités sans test unitaire dédié malgré une logique critique : `ledger`,
  `balances`, `tokens`, `account-status` (couvertes uniquement en e2e).

Vérifié et écarté : les routes sans `ParseUUIDPipe` (`appointments/:id`,
`conversations/:appointmentId/messages`, notes et comptes rendus par rendez-vous)
répondent 404 ou 403 à un identifiant invalide, pas 500 (sonde e2e temporaire,
supprimée après exécution).

## 4. Ce qui reste pour terminer

1. **Décider et corriger les deux P2 restants** (décompte du nettoyage,
   révocation des sessions au changement de mot de passe), chacun avec son test.
2. ~~Correction du P1 et tests d'intégration des 29 routes~~ : faits (§6).
3. **Valider les prérequis non exécutés ici** : suite `storage-s3` contre MinIO
   (`S3_TEST_ENDPOINT`), projets Playwright WebKit en CI, essai Safari physique.
4. **Campagne FedaPay sandbox** du document 09 avant tout paiement réel.
5. **Exploitation (lot 6, document 10)** : sauvegarde complète, copie hors site,
   restauration testée, objectifs RPO/RTO.
6. **Recette post-livraison du document 14** : déconnexion entre deux comptes,
   notifications par rôle, chat mobile, formulaire de contact avec
   `CONTACT_RECIPIENT_EMAIL` configuré.

## 5. Reproduire

```bash
npm ci && npx tsc --noEmit -p tsconfig.app.json && npm test && npm run lint && npm run build
cd api && npm ci && npm run typecheck && npm test -- --runInBand && npm run build
# Base dédiée (jamais la production) chargée avec les cinq fichiers de db/native/
DATABASE_URL=postgresql://domicares_app:<mdp>@localhost:5432/domicares_test \
JWT_ACCESS_SECRET=<secret-de-test-32-caracteres-minimum> npm run test:e2e
```

## 6. Suite donnée — 22 octobre 2026

### 6.1 Correction du P1

`AdminService.cleanupNonTestAccounts` refuse désormais l'opération (HTTP 403,
« interdit en production ») lorsque `NODE_ENV=production`, avant tout accès à la
base. La garde est placée dans le service propriétaire : elle protège tout
appelant, pas seulement le contrôleur. Hors production, le comportement est
inchangé (super admin + confirmation `SUPPRIMER`).

Test e2e (`admin`) : refus patient et rôle `finance` (403), confirmation invalide
(400), puis refus en production avec vérification qu'un compte sans rôle existe
toujours et qu'aucune entrée `cleanup_non_test_accounts` n'est journalisée.
Le cas de succès n'est volontairement pas rejoué : il supprimerait les comptes
sans rôle des autres suites partageant la base.

Preuve de non-vacuité : la garde neutralisée, ce test échoue (`Expected 403,
Received 200`) ; la garde rétablie, il réussit.

### 6.2 Tests d’intégration ajoutés (11 nouveaux tests, 2 tests étendus, 29 routes)

| Suite | Test ajouté | Routes couvertes |
|---|---|---|
| `auth` | renvoi de vérification (réponse neutre, jeton seulement si non vérifié) | `POST /auth/verify-email/resend` |
| `auth` | changement de mot de passe (actuel exigé, nouveau appliqué) | `POST /auth/password/change` |
| `auth` | révocation de toutes les sessions et des cookies | `DELETE /auth/sessions` |
| `admin` | fiche praticien admin (détail, 404, 400, rôles) | `GET /admin/users/practitioners/:id` |
| `admin` | nettoyage hors test (P1) | `POST /admin/users/cleanup-non-test` |
| `admin` | désactivation d'une version de consentement (audit, version publique) | `POST /admin/consent-versions/:id/deactivate` |
| `group-sessions-finance` | lectures finance et filtres, rôles | `GET /finance/me/payment-info`, `GET /admin/finance/{payments,balances,payouts,payout-batches,reconciliation,payment-events}` |
| `group-sessions-finance` | clôture d'une séance passée | `POST /group-sessions/:id/complete` |
| `medical` | liste/modification des notes, compte rendu par rendez-vous | `GET /care-notes`, `PATCH /care-notes/:id`, `GET /consultation-reports/appointment/:id` |
| `medical` | contacts d'urgence et adresses | `GET` et `DELETE /medical/emergency-contacts`, `PATCH /addresses/:id` |
| `practitioners` | planning : exceptions publiques, tarifs, suppressions entre praticiens | `GET /practitioners/:id/exceptions`, `PATCH`/`DELETE /me/rates/:id`, `DELETE /me/availability/:id`, `DELETE /me/exceptions/:id` |
| `appointments-payments` | configuration publique et simulation de webhook | `GET /payments/config`, `POST /admin/payments/simulate-webhook` |
| `support-disputes` | liste FAQ admin (brouillons inclus, rôles) | `GET /admin/support/faqs` |

Chaque test vérifie l'appartenance ou le rôle (401/403/404 selon le cas) en plus
du chemin nominal. Les tests du changement de mot de passe constatent le
comportement actuel ; la révocation des autres sessions reste le P2 ouvert.

Correction de tests existants : la table `users` est sous RLS, une lecture via
`db.db` sans contexte ne voit aucune ligne. L'assertion « compte supprimé » de
la suite `admin` était donc toujours vraie, et la remise à zéro du verrouillage
de la suite `auth` n'avait pas d'effet. Ces accès passent désormais par
`runAs({ role: 'service_role' })`.

### 6.3 Résultats après modification

| Contrôle | Résultat |
|---|---|
| `cd api && npm run typecheck`, `npm run lint`, `npm run build` | OK |
| Tests unitaires API | 42/42 réussis |
| Intégration API (PostgreSQL 16 local) | **9 suites, 113 tests réussis ; 4 ignorés (MinIO)** — auth 17, appointments-payments 15, security-regressions 14, practitioners 14, group-sessions-finance 14, admin 11, medical 11, messaging-realtime 11, support-disputes 6 |
| `npm run lint` (racine) | 0 erreur, 45 avertissements hérités |
| Couverture e2e des routes (analyse statique) | 212/216 ; les 4 restantes sont couvertes par une boucle `${kind}` (3 suppressions de planning) et par le test unitaire Fastify du contact |

Observation nouvelle (P3, non modifiée) : `GET /api/practitioners/:id/exceptions`
est public et renvoie le champ `reason` saisi par le praticien. Si ce motif peut
contenir une information personnelle, le retirer de la réponse publique.

