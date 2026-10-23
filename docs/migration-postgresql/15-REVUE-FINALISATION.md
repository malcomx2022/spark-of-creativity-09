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

### P2 — Le décompte des échecs de ce même nettoyage est inopérant — **corrigé (§7)**

La boucle capture les erreurs de `purgeUser` dans une seule transaction `runAs`,
sans point de sauvegarde. Dans PostgreSQL, une erreur SQL place la transaction
en état annulé : les suppressions suivantes et le journal d'audit échouent,
puis toute l'opération est annulée avec une erreur 500. Le résultat
« N échecs » ne peut donc jamais être renvoyé. Constat issu de la lecture du
code et de la sémantique PostgreSQL, non reproduit dans cette revue.

### P2 — Le changement de mot de passe ne révoque pas les autres sessions — **corrigé (§7)**

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

1. ~~Corriger les deux P2 restants~~ : faits (§7).
2. ~~Correction du P1 et tests d'intégration des 29 routes~~ : faits (§6).
3. **Valider les prérequis non exécutés ici** : suite `storage-s3` contre MinIO
   (`S3_TEST_ENDPOINT`), projets Playwright WebKit en CI, essai Safari physique.
4. **Campagne FedaPay sandbox** du document 09 avant tout paiement réel : script automatisé
   prêt (§15), exécution contre le vrai sandbox à faire avec les clés `sk_sandbox_`/`pk_sandbox_`.
5. **Exploitation (lot 6, document 10)** : sauvegarde complète, copie hors site,
   restauration testée, objectifs RPO/RTO.
6. ~~**Recette post-livraison du document 14**~~ : automatisée (§16), un défaut corrigé.
   Restent manuelles sur le VPS : la réception réelle du contact et les essais Safari et push sur appareil.

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
du chemin nominal. Le test du changement de mot de passe a été renforcé au §7.

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

Observation nouvelle (P3) : `GET /api/practitioners/:id/exceptions` est public et
renvoyait le champ `reason` saisi par le praticien. Corrigée au §11.

## 7. Correction des deux P2 — 22 octobre 2026

### 7.1 Nettoyage : un échec n'annule plus les autres suppressions

Reproduction sur PostgreSQL réel : un ancien administrateur (rôles retirés, donc
ciblé) reste référencé par `admin_audit_logs.admin_id`, clé sans cascade. Sa
purge échouait, la transaction passait en état annulé (`current transaction is
aborted`), la route répondait 500 et aucune suppression n'était conservée.

Correction (`AdminService.cleanupNonTestAccounts`) : chaque compte est traité
dans un point de sauvegarde (`savepoint` / `release` / `rollback to`). Un compte
en échec est annulé seul, compté et détaillé dans le journal d'audit ; les autres
suppressions et l'audit sont validés.

Test e2e (`admin`) : l'ancien administrateur est conservé et signalé
(`failed: 1`, erreur dans `details.errors`), un autre compte est supprimé, le
compte `@test.com` et le super admin sont préservés. Ce test exécute réellement
le nettoyage : un garde-fou le fait échouer, sans rien supprimer, si la base
contient un compte ciblé qui n'a pas été créé par les e2e (`@domicares.test`).
Avant correction : `Expected 200, Received 500` ; après : réussi.

### 7.2 Changement de mot de passe : autres sessions révoquées

`POST /api/auth/password/change` révoque désormais, comme la réinitialisation,
tous les refresh tokens actifs de l'utilisateur, **sauf la famille de la session
courante**. Celle-ci est identifiée par `refreshToken` dans le corps (clients
mobiles) ou par le cookie httpOnly `refresh_token` (chemin `/api/auth`). Sans
session identifiable, toutes les sessions sont révoquées. Le format de réponse
`{ changed: true }` est inchangé ; le champ `refreshToken` est optionnel.
Le client web (`src/lib/api/auth.ts`) transmet son refresh token.

Tests : e2e `auth` (refus sans effet, conservation par corps et par cookie,
révocation de l'autre appareil, révocation totale sans session identifiable).
Avant correction : `Expected 401, Received 200` sur la session de l'autre appareil.
Vitest : le client envoie le refresh token courant.

Limite constatée alors : une rotation de refresh token d'un autre appareil
concurrente au changement pouvait produire un jeton non révoqué. Corrigée au §9.

Observation : même famille de défaut dans `MedicalService.notifyCareNoteShared`, corrigée au §8.

### 7.3 Résultats

| Contrôle | Résultat |
|---|---|
| Front : typecheck, build | OK |
| Front : Vitest | 63/63 réussis |
| Lint (racine) | 0 erreur, 45 avertissements hérités |
| API : typecheck, build ; tests unitaires | OK ; 42/42 |
| Intégration API (PostgreSQL 16 local) | **114 réussis, 4 ignorés (MinIO)** ; rejouée une seconde fois sur la même base : identique |

## 8. Partage d'une note de soin — 22 octobre 2026

Défaut : `notifyCareNoteShared` insérait le message de conversation avec un
`.catch()` dans la transaction du partage. Reproduit sur PostgreSQL réel, il est
plus grave qu'annoncé au §7 : si l'insertion échoue, la transaction est annulée,
mais le `catch` laisse la requête continuer. PostgreSQL transforme alors le
`COMMIT` en `ROLLBACK` sans erreur. L'API répondait **200, note partagée**, alors
que ni le partage, ni son journal (`care_notes_sharing_log`), ni la notification
du patient n'étaient enregistrés.

Correction : le message, facultatif, est inséré dans un point de sauvegarde
(`care_note_message`). Son échec est journalisé et annulé seul ; le partage, son
journal et la notification sont validés.

Test e2e (`medical`) : seule l'insertion du message est redirigée vers un
rendez-vous inexistant, ce qui provoque une vraie violation de clé étrangère
PostgreSQL au milieu du partage. Le test vérifie ensuite en base que la note est
partagée, journalisée et notifiée, et qu'aucun message n'a été créé. Avant
correction : `shared_with_patient` restait `false` malgré la réponse 200 ;
après : réussi.

Recherche du même schéma dans l'API : les autres `catch` relancent l'erreur ou
sont situés hors transaction. Il ne reste aucune requête SQL dont l'échec serait
capturé dans une transaction sans point de sauvegarde.

Résultats : API typecheck et build OK, 42/42 unitaires, **e2e 115 réussis,
4 ignorés (MinIO)**, lint 0 erreur.

## 9. Fenêtre de concurrence des révocations globales — 22 octobre 2026

Note de livraison : la PR malcomx2022/spark-of-creativity-09#89 a été fusionnée
sans le commit du §8 (`08ce150`, partage de note de soin), poussé quelques instants
après la fusion. Il est repris dans la PR de ce lot.

Défaut : en READ COMMITTED, une rotation de refresh token d'un autre appareil
dont la transaction n'est pas encore validée échappe à la révocation. La révocation
attend le verrou de ligne de l'ancien jeton, puis l'ignore car il est déjà révoqué.
Le nouveau jeton, inséré hors de son instantané, reste actif. Trois chemins sont
touchés : changement de mot de passe, réinitialisation et déconnexion de toutes
les sessions.

Correction (`AuthService`) : verrou transactionnel par utilisateur
(`pg_advisory_xact_lock`, clé `refresh_tokens:user:<id>`), pris par `refresh`
après le verrou de famille, et par chaque révocation globale juste avant la
requête de révocation. La révocation attend donc le COMMIT de la rotation, et son
instruction de révocation, démarrée après le verrou, voit le jeton émis. Dans
l'autre ordre, la rotation attend et détecte le jeton révoqué (révocation de la
famille). Ordre des verrous : famille puis utilisateur dans `refresh`,
utilisateur seul ailleurs ; aucun cycle n'est possible, donc pas d'interblocage.
Un jeton courant déjà révoqué ne désigne pas de famille à conserver : il peut
appartenir à une famille dont un tiers détient le jeton actif (vol puis rotation).
Dans ce cas, toutes les sessions sont révoquées et le client doit se reconnecter.

Tests e2e (`auth`), avec un recouvrement réel des transactions : la rotation de
l'autre appareil est suspendue après l'émission de son jeton, avant COMMIT ; la
révocation démarre et le test attend, via `pg_stat_activity`, qu'elle soit
bloquée sur un verrou ; la rotation est ensuite libérée. Un test par chemin
(changement, déconnexion partout, réinitialisation). Avant correction : les trois
échouent (`Expected 401, Received 200`) ; après : réussis, et stables sur
5 exécutions complètes de la suite. Un quatrième test vérifie qu'un jeton déjà
tourné par un tiers ne protège pas la session de ce tiers (il échoue si le filtre
`revoked_at` est retiré).

Observation : la déconnexion simple présentait la même fenêtre ; corrigée au §10.

Résultats : API typecheck, build, lint OK ; 42/42 unitaires ; **e2e 119 réussis,
4 ignorés (MinIO)**, identique sur 3 exécutions complètes ; front 63/63 ; lint 0 erreur.

## 10. Déconnexion simple — 22 octobre 2026

Défaut : `POST /api/auth/logout` révoquait le seul jeton transmis. Si ce même
appareil tournait son jeton au même moment, la déconnexion attendait le verrou de
ligne puis ignorait le jeton, devenu révoqué. Le jeton enfant restait actif : la
session survivait à la déconnexion.

Correction (`AuthService.logout`) : la déconnexion d'un appareil révoque toute la
**famille** du jeton (la chaîne de sessions de cet appareil), sous le même verrou
de famille que `refresh`. Dans l'ordre inverse, la rotation attend puis détecte
le jeton révoqué. En usage normal, seul le dernier jeton d'une famille est actif :
le résultat est identique à l'ancien comportement, hors concurrence. Un jeton
inconnu ou appartenant à un autre compte ne révoque rien. La déconnexion sans jeton
identifiable (ni corps ni cookie) révoquait déjà toutes les sessions ; elle prend
désormais le verrou par utilisateur, comme les autres révocations globales.
Verrous : famille seule pour la déconnexion d'un appareil ; aucun cycle n'est
possible avec `refresh` (famille puis utilisateur).

Tests e2e (`auth`) : rotation de l'appareil suspendue avant COMMIT, déconnexion
bloquée sur le verrou (constatée via `pg_stat_activity`), puis libération ; le
jeton enfant est révoqué. Avant correction : `Expected 401, Received 200` ; après :
réussi, stable sur 5 exécutions complètes de la suite. Un test vérifie aussi
qu'une déconnexion, par corps ou par cookie, ne ferme que la session de cet appareil.

Résultats : API typecheck, build, lint OK ; 42/42 unitaires ; **e2e 121 réussis,
4 ignorés (MinIO)** ; front 63/63 ; lint 0 erreur.

## 11. Motif des exceptions publiques — 22 octobre 2026

Défaut : `GET /api/practitioners/:id/exceptions`, sans authentification, renvoyait
le motif saisi par le praticien (par exemple « Hospitalisation »), donnée
personnelle possible, à tout visiteur.

Correction : la route utilise `OptionalJwtAuthGuard` et `ScheduleService.listExceptions`
renvoie `reason: null` sauf au praticien propriétaire (compte lié à `practitioners.user_id`).
La forme de la réponse est inchangée ; la date et `is_available` restent publiques,
car elles servent à la prise de rendez-vous. Front : le tableau de bord du
praticien (`AvailabilitySection`), authentifié, voit toujours ses motifs ; la prise
de rendez-vous (`NewAppointmentDialog`) n'ajoute le motif que s'il est présent et
affiche désormais « n'est pas disponible ce jour », sans détail.
`POST /practitioners/me/exceptions` renvoie toujours le motif à son auteur.

Test e2e (`practitioners`) : motif `null` pour un visiteur anonyme, un patient, un
autre praticien, un administrateur et un jeton invalide ; motif visible pour le
propriétaire. Avant correction : motif renvoyé à tous ; après : réussi.

Résultats : API typecheck, build, lint OK ; 42/42 unitaires ; **e2e 122 réussis,
4 ignorés (MinIO)** ; front typecheck OK, 63/63 ; lint 0 erreur.

## 12. Tests MinIO (`storage-s3`) — 22 octobre 2026

Constat : les 4 tests S3 réels étaient ignorés partout (`S3_TEST_ENDPOINT` absent),
y compris en CI. Ils ne pouvaient pas être exécutés simplement : MinIO ne
distribue plus d'images ni de binaires accessibles anonymement. `dl.min.io`
répond 410 pour la release épinglée, et `quay.io/minio/minio` comme Docker Hub
refusent le pull anonyme (jeton sans droit `pull`, API 401).

Correction :

- La release de production (`RELEASE.2025-09-07T16-13-09Z`, commit
  `07c3a429bfed433e49018cb0f78a52145d4bedeb`) est compilée depuis ses sources avec
  Go (`go install github.com/minio/minio@<commit>`), sans dépendre d'un registre.
- `api-ci.yml` : binaire mis en cache (`actions/cache`), compilé seulement en
  l'absence de cache, démarré sur `127.0.0.1:9000` avec des identifiants jetables
  et un dossier temporaire, puis la suite e2e reçoit `S3_TEST_ENDPOINT`.
- `storage-s3.e2e-spec.ts` : avec `S3_TEST_REQUIRED=1` (activé en CI), l'absence
  de serveur S3 fait échouer la suite au lieu de l'ignorer silencieusement.

Exécution locale (reproductible) :

```bash
GOBIN=/tmp/minio-bin CGO_ENABLED=0 go install -trimpath github.com/minio/minio@07c3a429bfed433e49018cb0f78a52145d4bedeb
MINIO_ROOT_USER=review MINIO_ROOT_PASSWORD=review-local-password /tmp/minio-bin/minio server /tmp/minio-data --address 127.0.0.1:9000 &
cd api && S3_TEST_ENDPOINT=http://127.0.0.1:9000 S3_TEST_REQUIRED=1 npm run test:e2e
```

Résultats : **e2e complète 126/126 réussis, aucun test ignoré** (PostgreSQL 16 et
MinIO locaux), dont les 4 essais S3 (Content-Length signé, publication des octets
validés, MIME falsifié rejeté, nettoyage de la quarantaine). Le script de démarrage
de la CI a été rejoué à l'identique (santé en 2 s, 4/4 avec ses identifiants).
Sans serveur S3 et avec `S3_TEST_REQUIRED=1`, la suite échoue avec un message explicite.

### Risque d'exploitation (P1) — corrigé au §13

`deploy/vps/docker-compose.yml` utilise `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`.
Un VPS qui a déjà cette image en cache continue de démarrer (`docker compose up`
ne retélécharge pas une image présente). En revanche, **une installation neuve
(document 07) ou une reconstruction du serveur échouera au téléchargement de
MinIO**. Options à décider par l'exploitant :
1. construire l'image MinIO depuis ce même commit (Dockerfile versionné) ;
2. pousser l'image actuelle du VPS vers un registre privé, avant toute perte du serveur ;
3. passer à un S3 hébergé (Wasabi, prévu par le compose).

Avant toute intervention, vérifier sur le VPS que l'image est bien présente :
`docker image ls quay.io/minio/minio`.

## 13. Image MinIO de production — 22 octobre 2026

Défaut (§12) : `docker-compose.yml` et `bascule.sh` reposaient sur
`quay.io/minio/minio` et `quay.io/minio/mc`, dont le téléchargement anonyme est
désormais refusé. Une installation neuve ou une reconstruction du VPS échouait.

Correction (option 1 du §12) :

- `deploy/vps/minio.Dockerfile` compile le serveur (`RELEASE.2025-09-07T16-13-09Z`,
  commit `07c3a429…`) et le client `mc` (`RELEASE.2025-08-13T08-35-41Z`, commit
  `7394ce0d…`) depuis leurs commits, sur `golang:1.24.7-alpine3.22`, puis les place dans
  `alpine:3.22`. Les `-ldflags` reproduisent `buildscripts/gen-ldflags.go`. Sans eux, le
  binaire se déclare `DEVELOPMENT.GOGET` et MinIO le traite comme un build non officiel
  (`IsSourceBuild`, `globalVersionUnix` nul). Le build échoue si la version annoncée
  n'est pas la release attendue.
- Mêmes versions qu'auparavant : le volume `minio_data` est repris tel quel. Le conteneur
  tourne en root, comme l'image officielle, pour garder les droits du volume.
- `docker-compose.yml` : `image: domicares-minio:RELEASE.2025-09-07T16-13-09Z` et
  `build: minio.Dockerfile`, avec les mêmes commande, variables, volume et réseau.
- `deploy-vps.yml` : si l'image locale manque, l'image officielle de la même release
  déjà présente sur le VPS est réétiquetée, sans compilation en production ; sinon,
  `docker compose build minio`. Le conteneur `minio` est recréé une fois, ce qui
  interrompt le stockage quelques secondes.
- `bascule.sh` : le client `mc` est construit localement s'il manque.
- `preflight.sh` : indique si l'image locale est présente, réétiquetable, ou à compiler.
- Nouveau workflow `minio-image.yml` : construit les deux cibles, démarre le serveur
  comme dans le compose, vérifie les versions annoncées, puis exécute les essais S3 réels
  de l'API contre ce conteneur.
- `api-ci.yml` : mêmes `-ldflags` pour le binaire de test, et nouvelle clé de cache.
- Guide d'installation (document 07, §6 et dépannage) mis à jour.

Validation locale (sans Docker, indisponible ici) :
- les instructions `RUN` des deux étapes de compilation, rejouées à l'identique sous
  un `sh` POSIX (`dash`), produisent des binaires annoncés
  `RELEASE.2025-09-07T16-13-09Z (commit-id=07c3a429…)` et
  `RELEASE.2025-08-13T08-35-41Z (commit-id=7394ce0d…)` ;
- suite S3 réelle contre ce serveur : 4/4 ;
- compilation à froid du serveur (cache Go vide, 4 cœurs) : 97 s, pic d'environ 1,5 Go
  de mémoire cumulée (échantillonnage toutes les 0,5 s) ;
- `bash -n` sur `bascule.sh` et `preflight.sh`, YAML des workflows et
  `docker compose config` valides.
La construction de l'image Docker elle-même est validée par le workflow
`minio-image.yml` sur la PR.

## 14. Sauvegarde et restauration (lot 6) — 22 octobre 2026

Avant : `backup.sh` ne faisait qu'un `pg_dump` quotidien. Pas de fichiers S3, pas de manifeste,
pas de copie hors site, pas d'alerte ni de restauration testée. Le guide conseillait une copie
hors site non chiffrée et une restauration par `pg_restore` seul.

Livré :

- `backup.sh` (POSIX, image `domicares-backup` = cible `backup` de `minio.Dockerfile` :
  `postgres:16-alpine`, `mc` épinglé, `age`, `rclone`, `curl`) : objets des trois buckets copiés
  avant et après le `pg_dump`, quarantaine `_pending/` exclue, rôles sans mots de passe,
  `objects.sha256`, `manifest.json` (version applicative, empreintes du dump et du schéma,
  décomptes), `SHA256SUMS`. Copie hors site chiffrée avec `age` vers un remote `rclone`, avec
  contrôle de taille et rétention. Refus de toute copie hors site non chiffrée. Statut
  `last-status.json`, alerte HTTP en cas d'échec, aucun dossier partiel conservé.
- Service `backup` : intervalle configurable (RPO), healthcheck `unhealthy` après 26 h sans réussite.
- `restore-check.sh` : empreintes, puis gardes « base vide et buckets vides » **avant toute
  écriture**, rôles, `pg_restore --exit-on-error`, objets, puis contrôle de chaque chemin de
  stockage référencé en SQL (fichiers, documents KYC, avatars, pièces jointes, anciens chemins
  `practitioner-documents/`) et relecture de son empreinte dans le S3 restauré.
- `restore-drill.sh` : exercice isolé (PostgreSQL et MinIO jetables, réseau docker interne).
- `preflight.sh` (copie hors site, chiffrement, alerte, ancienneté), `.env.example`,
  `deploy-vps.yml` (version applicative du manifeste), document 07 §13 (RPO 24 h, RTO 4 h,
  configuration, exercice mensuel, restauration de sinistre), document 10 (lot 6).
- Workflow `backup-restore.yml` : cycle complet en conteneurs, avec exercices sur la sauvegarde
  locale et sur l'archive hors site déchiffrée, et un cas négatif.

Validation locale (PostgreSQL 16 et MinIO réels, `mc`/`rclone` aux versions de l'image,
scripts exécutés sous `dash`) :

| Cas | Résultat |
|---|---|
| Sauvegarde complète + copie hors site chiffrée | ✔ 5 objets (dont un nom avec espace), `_pending/` exclu, archive `.tar.age` déposée et taille vérifiée |
| Restauration depuis l'archive hors site déchiffrée | ✔ 7 références résolues, 0 manquante, 1 URL externe signalée, empreintes relues identiques |
| Base cible non vide | ✔ refus |
| Bucket cible non vide | ✔ refus **avant** écriture en base (défaut d'ordre trouvé puis corrigé) |
| Objet ou dump altéré dans la sauvegarde | ✔ refus (`objects.sha256`, `SHA256SUMS`) |
| Objet référencé disparu de la source | ✔ exercice en échec, références listées |
| Copie hors site sans clé `age` / S3 injoignable / base injoignable | ✔ échec, statut `failed` avec l'étape, alerte reçue, `last-success` inchangé |
| Commandes de restauration de production du document 07 | ✔ rejouées telles qu'écrites |

Non validé ici, faute de Docker : construction de l'image `backup`, `restore-drill.sh` et
healthcheck en conteneur. Ces points sont couverts par `backup-restore.yml` sur la PR.
Reste à l'exploitant : configurer `BACKUP_OFFSITE_REMOTE`, `BACKUP_AGE_RECIPIENT` (clé privée
hors du VPS) et `BACKUP_ALERT_URL`, confirmer RPO et RTO, et lancer puis consigner le premier
`./restore-drill.sh` sur une vraie sauvegarde.

## 15. Campagne FedaPay sandbox automatisée — 22 octobre 2026

La campagne du document 09 exigeait une bascule du VPS en sandbox et une demi-journée manuelle.
Le script `api/test/campaign/fedapay-sandbox.campaign.ts` (`npm run campaign:fedapay`, configuration
`jest.campaign.config.cjs`, hors `npm test` et `test:e2e`) joue désormais S1 à S12 depuis une API
locale contre le vrai FedaPay sandbox, puis écrit le tableau du §4 dans `api/campaign-reports/`.
Mode opératoire, variables et limites : document 09, §4 bis.

Validation du harnais (`FEDAPAY_CAMPAIGN=fake`, PostgreSQL 16 local, base `domicares_test`), deux
passages consécutifs sur la même base :

| # | Résultat | Domicares | FedaPay (factice) |
|---|---|---|---|
| S1 | ok | paiement `paid`/`held`, rendez-vous `confirmed`, 14 250 retenus | approved |
| S2 | ok | paiement `paid`/`held`, inscription `paid` | approved |
| S3 | ok | paiement `failed`, rendez-vous `pending_payment` | declined |
| S4 | ok | paiement `canceled` (job `payments.cleanup` 200) | canceled |
| S5 | ok | nouveau paiement `paid`, ancien `canceled` | approved |
| S9 | ok | HTTP 201, `completed`, paiement `partially_refunded` | — |
| S10 | ok | HTTP 201, paiement `refunded` | — |
| S11 | sans objet | S9 rendu `completed` | — |
| S6 | ok | job 200, payout `ready` (rendez-vous et séance) | — |
| S7 | ok | création 201, reversement `completed` | sent |
| S8 | ok | création 201, reversement `failed`, paiement relibéré `ready` | — |
| S12 | ok | HTTP 201, 5 rapprochées, 1 écart expliqué (S1 remboursé hors FedaPay en S10) | — |
| S13 | non couvert | exige une URL publique | — |

Défauts du harnais trouvés et corrigés pendant la validation (le code applicatif est inchangé) :
une seconde exécution échouait (numéros de test déjà portés par les comptes de la première, y
compris dans `profiles`, que `handle_new_user_safe` ne renseigne alors pas). La réconciliation
comptait aussi les paiements d'autres exécutions ; elle est désormais jugée sur ceux de la
campagne en cours.

**Non exécuté ici** : la campagne contre le vrai sandbox. Les clés `sk_sandbox_…` et
`pk_sandbox_…` ne sont pas disponibles dans cette session. Elles doivent être fournies comme
variables d'environnement (`FEDAPAY_SANDBOX_SECRET_KEY`, `FEDAPAY_SANDBOX_PUBLIC_KEY`), jamais
dans un fichier versionné. Le rapport produit remplacera le tableau vide du document 09, §4.

## 16. Recette post-livraison du document 14 — 22 octobre 2026

Les parcours du document 14 (§4) n'avaient jamais été joués de bout en bout dans un navigateur :
les tests front simulaient l'API, et les tests API n'exerçaient pas l'interface. La recette
`npm run test:recette` les joue désormais dans Chromium, sur l'API compilée et une base
PostgreSQL réelles, sans aucune interception (sauf l'échec 503 simulé du contact). Le workflow
`recette.yml` la relance sur chaque PR. Détail et périmètre : document 14, §4 bis.

Résultat local (PostgreSQL 16, base `domicares_test`, Chromium 1194) : **10/10 scénarios**,
en environ 1 min après les builds (12/12 après l'ajout des notes de soin).

| Parcours | Résultat |
|---|---|
| Logout/login entre deux comptes (2 scénarios) | ✔ |
| Notifications praticien, coach, patient hors première page, ancienne notification, accès tiers refusé (5) | ✔ après correction |
| Chat mobile 390 px sur un rendez-vous ancien (1) | ✔ après correction |
| Contact accepté par l'API / échec avec champs conservés (2) | ✔ |

**Défaut trouvé** : un clic sur une notification de la liste ne suivait jamais son lien, car le
champ `link` n'était lu par aucun composant. Les liens par destinataire et la redirection
`/dashboard` étaient donc inaccessibles depuis l'application. Correction : `NotificationsSection`
et `src/lib/notification-link.ts`, qui ne suit que les chemins internes connus. Tests : 16 cas
sur le filtre des liens et 3 sur le composant (souris, clavier, lien externe ou inconnu). Front :
82 tests, typecheck, build et lint (0 erreur, 45 avertissements hérités). Preuve
inverse : sans le correctif, 5 scénarios de la recette échouent.

Lien des notes de soin : corrigé dans la foulée (voir ci-dessous).

Non exécuté ici : la réception réelle d'un e-mail de contact (Resend et vraie boîte), WebKit et
Safari sur appareil, et la notification push sur appareil. Ces points restent à vérifier sur
l'environnement livré.

### Lien des notes de soin

Le partage d'une note de soin notifiait le patient vers `/patient/appointments/:id`, une route
inexistante. Le patient n'avait d'ailleurs aucun écran pour lire ses notes partagées :
`PatientCareNotesSection` n'était plus montée, alors que `GET /care-notes/mine` existait.

Correction :
- lien `/dashboard/patient?tab=reports` côté API ;
- section des notes montée dans l'onglet `reports`, sous les comptes rendus ;
- anciennes notifications redirigées vers cet onglet par `notificationPath`.

Contrôles :
- e2e `medical` 12/12 ;
- front : 85 tests, typecheck, build et lint (0 erreur) ;
- API : 42 tests unitaires et build ;
- recette 12/12 (2 scénarios ajoutés, en échec sans la correction).

### Page ouverte par une notification push

La notification push gardait un texte générique, mais ouvrait toujours `/login` : l'API et le
service worker imposaient tous deux cette page. Désormais, la charge porte le chemin interne de
la notification (`pushTargetPath`), revérifié par `public/sw.js` avant ouverture. Tout autre
lien donne `/login`, et le texte reste générique. Le clic ouvre une fenêtre si l'onglet existant
ne peut pas naviguer.

Contrôles :
- API : 51 tests unitaires, typecheck, build ;
- front : 94 tests, typecheck, lint (0 erreur) ;
- 38 scénarios navigateur Chromium ;
- sans la correction, 9 tests échouent.

Non validé : la réception sur un appareil réel (WebKit et Safari compris). Le retour à la page
ciblée après une connexion est traité ci-dessous.

### Retour à la page après connexion

Une session expirée, ou une notification ouverte hors session, menait toujours à l'accueil de
l'espace après la connexion : `state.from` n'était lu par aucune page de connexion.
`src/lib/return-path.ts` gère désormais ce retour, appliqué par `ProtectedRoute`,
`navigateToDashboard`, `LoginWithOTP` et `VerifyOTP`. Détail : document 14, §4 bis.

La page est réutilisée une seule fois, dans les 15 minutes, si elle relève de l'espace du rôle
connecté. Une déconnexion volontaire l'efface. La recette a trouvé et fait corriger une
mémorisation résiduelle après le logout.

Contrôles :
- front : 104 tests, typecheck, build, lint (0 erreur) ;
- 38 scénarios navigateur Chromium ;
- recette 15/15 ;
- sans la mémorisation, le scénario du lien profond échoue.

### Retour vers la page notifiée (administrateurs et e-mails)

- **Administrateurs** : les connexions admin ignoraient la page mémorisée, et l'espace admin ne
  lisait pas `?tab=`. Les deux sont corrigés.
- **Lien de paiement admin** : `/admin?tab=payments` vise désormais l'onglet `finance`.
- **E-mails de notification** : le lien relatif est remplacé par une URL absolue vers la page
  notifiée, et le message est échappé dans le HTML.

Contrôles :
- front : 104 tests, typecheck, build, lint (0 erreur) ;
- 38 scénarios navigateur Chromium ;
- recette 16/16 ;
- API : 56 tests unitaires, build, e2e 122/122 (4 essais MinIO sautés, faute de MinIO local).

### Réception réelle du contact

Le formulaire est désormais exploitable à réception, et vérifiable avant de compter dessus :
- **Réponse** : `reply_to` vise le visiteur ;
- **Objet** : il porte le sujet du message ;
- **Suivi** : l'identifiant Resend est journalisé ;
- **Preflight** : il contrôle le domaine expéditeur vérifié et refuse une boîte de contact égale
  à l'adresse d'envoi ;
- **Outil** : `deploy/vps/contact-check.sh` suit la livraison chez Resend, et `--via-site` teste
  la chaîne complète.

Contrôles :
- API : 60 tests unitaires, typecheck, build, lint, e2e 122/122 ;
- recette 16/16 ;
- scripts testés contre un faux Resend et l'API locale.

**Non exécuté ici** : l'envoi réel, faute de clé Resend et de boîte dans cette session. Ce
contrôle reste à lancer sur le VPS (document 07, §9).

### Essais Safari sur iPhone

Aucun iPhone ni service d'appareils n'est disponible dans cette session : la recette physique du
document 12 reste à faire. En attendant, la recette post-livraison, sur API et base réelles, tourne
aussi en WebKit iPhone en CI, et en Chromium au gabarit iPhone. Le harnais passe par le menu mobile
pour la déconnexion, et cible chaque notification par son texte. Localement : 32/32 en Chromium
bureau et iPhone.

Le document 12 contient désormais une grille de résultats à remplir sur appareil.

### Notification push sur un vrai téléphone

Aucun téléphone n'est joignable depuis cette session. J'ai donc corrigé les causes d'échec propres
aux appareils réels, et ajouté de quoi tester en un geste :
- **Service worker** : il affiche toujours une notification (iOS révoque les abonnements après des
  push silencieux) ;
- **Clés VAPID** : la paire est vérifiée au démarrage, et le push est coupé proprement si elle est
  incohérente ;
- **Urgence** : `urgency: high` ;
- **Envoi de test** : route `POST /api/push/test` et bouton dans l'onglet Notifications, avec le
  résultat réel de l'envoi ;
- **iPhone** : l'interface indique l'installation nécessaire dans Safari.

Contrôles :
- API : 63 tests unitaires, e2e 122/122 ;
- front : 116 tests, typecheck, build, lint (0 erreur) ;
- 38 scénarios navigateur ;
- recette 32/32.

Reste à faire sur un appareil réel : document 12, point 7.

### Campagne FedaPay sur le vrai sandbox

Les clés `FEDAPAY_SANDBOX_*` ne sont pas présentes dans cette session : la campagne réelle reste
non exécutée. Le réseau atteint cependant le sandbox. Des sondes sans clé ont révélé que la route de
paiement sans redirection utilisée par le harnais (`/v1/transactions/{mode}`) n'existe pas. C'est
`/v1/{mode}` : corrigé, sinon S1 à S5 échouaient dès le premier essai réel.

Les sondes confirment aussi que le remboursement par API (`/v1/transactions/{id}/refund`) n'existe
pas. Domicares bascule alors comme prévu sur le canal manuel (502). Une ressource `/v1/refunds`
existe : la campagne en lira la forme.

Le contrôle S0 vérifie ces routes au démarrage. Campagne factice toujours verte (12 scénarios).

### Remboursement par l'API FedaPay

FedaPay n'offre pas de remboursement par API : la spécification OpenAPI et les SDK officiels PHP et
Node n'en contiennent aucun, et seul le tableau de bord rembourse (MTN). `/v1/refunds`, non documenté,
n'est pas utilisé. Le canal manuel devient le choix par défaut de l'écran Remboursements, et le
canal API l'indique.

Défaut corrigé sur la voie réelle. Après un remboursement partiel au tableau de bord, le statut
FedaPay `approved_partially_refunded` était lu comme « en attente ». Le nettoyage annulait alors
un paiement pourtant encaissé. Ce statut est désormais lu comme payé, et la réconciliation signale
le remboursement à enregistrer.

Contrôles :
- API : 72 tests unitaires, e2e 123/123 (le nouveau test échoue sans la correction, paiement annulé) ;
- front : 116 tests, lint (0 erreur), build ;
- campagne factice verte.

### Remboursement via `/v1/refunds`

Le tableau de bord FedaPay rembourse lui-même par `POST /v1/refunds` : son code public
(`RefundService.create`) envoie `{ transaction_id, amount, phone_number, description }` ; le
remboursement se relit par `GET /v1/refunds/{id}`. Les deux routes répondent 401 sans clé sur le
sandbox (route présente). Le client FedaPay les utilise désormais (document 08, §6) :
- `refundTransaction` : `POST /v1/refunds` avec la transaction, le montant et le motif ; numéro payeur ;
- refus HTTP ou statut `failed` immédiat : 502 `FEDAPAY_REFUND` avec le motif FedaPay, rien d'enregistré ;
- `pending` : `payouts.sync` relit le remboursement lui-même. Il confirme aussi un partiel, que la
  transaction ne montre pas, et clôt un `failed` sans écriture, avec notification à la finance ;
- 404 : `FEDAPAY_REFUND_UNAVAILABLE` et canal manuel, inchangé.

L'écran Remboursements repasse par défaut au canal API (« MTN Mobile Money ») ; le canal manuel reste.
La campagne vérifie ces routes en S0, exige en S9 un remboursement `completed` ou `pending` relu chez
FedaPay, et le confirme en S11 par le job, ou à défaut par l'administrateur.

Contrat relevé dans le tableau de bord, non publié : **non validé sur le vrai sandbox** (aucune clé
`FEDAPAY_SANDBOX_*` dans cette session). La campagne `FEDAPAY_CAMPAIGN=sandbox` doit passer S9 et S11
avant le premier remboursement réel.

Contrôles :
- API : 76 tests unitaires (dont 4 nouveaux pour le client HTTP) ; e2e 123/123, 4 essais MinIO sautés.
  Le test des remboursements couvre le refus immédiat, l'attente suivie de `sent` (confirmée par le
  job) et l'attente suivie de `failed`. L'ancienne logique du job laissait le partiel en attente ;
- front : 116 tests, lint (0 erreur, 45 avertissements), build ;
- campagne factice verte (S9 `completed`, S11 sans objet).

### Avertissements lint

Les 45 avertissements hérités (document 12) sont corrigés et `npm run lint` passe à
`eslint . --max-warnings 0`, de sorte que la CI refuse tout nouvel avertissement. Aucune règle
n'a été assouplie et aucun commentaire de désactivation n'a été ajouté.

- **Fast Refresh (9)** : les variants (`button`, `badge`, `toggle`, `navigation-menu`), les
  contextes et hooks (`form`, `sidebar`, type d'utilisateur) et `useTermsDialogs` passent dans
  des fichiers `.ts` voisins. `toast` n'est plus réexporté par `ui/sonner`.
- **`?? []` instables (16)** : chaque liste est stabilisée par `useMemo`. Pour `DocumentsSection`,
  les descriptions passent au niveau du module et le chargement des URL est stabilisé par `useCallback`.
- **Dépendances d'effets (20)** : chaque effet garde ses déclencheurs.
  - Widgets FedaPay (rendez-vous, séance de groupe, nouvel essai, reprise dans `PaymentDialog`) :
    le rappel du widget, qui se déclenche après l'initialisation unique, lit les dernières props
    par `useLatest` (ref mis à jour en effet de layout, avec deux tests Vitest).
  - Correctif pendant ce travail : la reprise d'un paiement en cours attendait la configuration
    FedaPay sur une valeur figée (10 essais pour rien). Elle la relit maintenant à chaque tour.
  - Préremplissage du payeur : mises à jour fonctionnelles, sans écraser une saisie.
  - KYC : un ref des praticiens déjà demandés évite de recharger des URL en cours de chargement.
  - Messagerie : le marquage « lu » se relance aussi quand des non-lus arrivent pendant que la
    conversation est ouverte.
  - Carte : le centre initial est lu à la création ; la carte n'est recréée qu'au changement de jeton.
  - Recherche d'adresse : `performSearch` passe en `useCallback` sur le jeton.

Contrôles : lint (0 erreur, 0 avertissement), typecheck, 118 tests Vitest (23 fichiers), build,
38 scénarios navigateur Chromium en local (WebKit en CI).

### Tests WebKit en local

En local, les projets WebKit échouaient : `Executable doesn't exist at …/webkit-2359/pw_run.sh`.
WebKit n'y est pas installé, et `playwright install` est exclu. Il exigerait en plus les bibliothèques
système de WebKit sur l'hôte.

Deux commandes Docker les remplacent :
- `npm run test:webkit` lance la suite `tests/browser` sur `webkit-iphone` et `webkit-ipad` ;
- `npm run test:recette:webkit` lance la recette réelle sur `webkit-iphone`.

`scripts/webkit-docker.sh` démarre `playwright run-server` dans `mcr.microsoft.com/playwright:v<version>-noble`.
La version est lue dans `node_modules/playwright-core`, qui est monté en lecture seule : rien n'est
téléchargé hors de l'image. Le script attend le serveur, puis lance `playwright test` sur l'hôte avec
`PW_WEBKIT_WS_ENDPOINT` et arrête le conteneur à la fin.

Les deux configurations Playwright connectent alors leurs projets WebKit au serveur. Avec
`exposeNetwork: '<loopback>'`, le navigateur atteint `127.0.0.1` de l'hôte (preview, API de recette),
avec un port publié et sans `--network host`. Le script fonctionne donc aussi avec Docker Desktop.
Les tests, `vite preview` et l'API restent sous Node 22, comme l'exigent les consignes ; l'image
fournit Node 24. Si la variable est absente, comme en CI, rien ne change. Si Docker est absent ou
arrêté, le script s'arrête avec un message explicite (code 2).

Contrôles locaux : `npm run test:webkit` 76/76 (WebKit iPhone et iPad), `npm run test:recette:webkit`
16/16 (API et PostgreSQL 16 réels), lint et typecheck. Ce sont des résultats d'émulation WebKit, pas
une recette sur iPhone physique (document 12).

### Délai de l'installation des navigateurs en CI

Le 22 octobre 2026, l'étape `npx playwright install --with-deps` de Web CI a duré plus de 20 minutes
sans échouer. Le miroir apt `azure.archive.ubuntu.com` servait les dépendances système de WebKit à
quelques dizaines de ko/s (2 min 15 s pour 5,8 Mo). Aucun délai n'étant fixé, le job pouvait courir
jusqu'à la limite GitHub de 6 heures. Il a été annulé, puis relancé avec succès en 4 minutes.

Désormais, Web CI et la recette passent par `scripts/ci-playwright-install.sh` :
- chaque tentative est coupée après 8 minutes (`PW_INSTALL_TIMEOUT`), avec 3 tentatives
  (`PW_INSTALL_ATTEMPTS`). `timeout` arrête tout le groupe de processus (npx, apt-get, dpkg) ;
- avant une nouvelle tentative, `dpkg --configure -a` termine une installation interrompue ;
- apt réessaie de lui-même un téléchargement figé (`Acquire::Retries 3`, délai de 30 s) ;
- après le dernier échec, une annotation `::error::` explicite est émise.

L'étape est plafonnée à 30 minutes et chaque job à 45 minutes, contre 4 à 6 minutes d'habitude.

Contrôles locaux : le script, exécuté avec un faux `npx`, coupe une installation figée puis réussit
à la tentative suivante. Il échoue avec le code 1 après trois échecs, renvoie le code 2 sans argument
et ne laisse aucun processus orphelin. Le YAML des deux workflows a été validé. La vraie installation
n'est exercée que sur les runners GitHub (`playwright install` est exclu en local).

### Avertissements de la recette navigateur

Le journal CI de la recette (job du 23 octobre, 1 693 lignes lues en entier) contenait les avertissements
suivants. Ceux qui relèvent du projet sont corrigés :

- **Build Vite du serveur de recette** (le même qu'avec `npm run build`) :
  - zod 4 place des commentaires `@__PURE__` que Rollup ne sait pas rattacher. Rollup les retire sans
    effet sur le code produit. `build.rollupOptions.onwarn` ignore ce seul cas (`INVALID_ANNOTATION`
    dans `node_modules/zod/`) ;
  - « chunk de plus de 500 kB » : c'était `mapbox-gl`, 1,9 Mo une fois minifié, indivisible et déjà
    chargé à la demande (`LazyPractitionerMap`). Il passe dans son chunk `vendor-map`, que `index.html`
    ne précharge pas, avec un budget de 2 100 ko. Le plugin `domicares-chunk-budget` garde la limite
    de 500 ko pour tous les autres chunks : contre-épreuve faite avec un budget abaissé.
- **`npm ci`, paquets dépréciés** :
  - eslint 9 passe en 10, avec `@eslint/js` 10 et `eslint-plugin-react-hooks` 7. Les règles de hooks
    restent les deux d'avant (`rules-of-hooks` en erreur, `exhaustive-deps` en avertissement), sans
    les règles React Compiler du « recommended » de la v7 ;
  - les deux nouvelles règles recommandées d'eslint 10 sont corrigées dans le code. Pour
    `preserve-caught-error` (7 cas), l'erreur d'origine est attachée en `cause`, et
    `tsconfig.app.json` reçoit `ES2022.Error` (géré depuis Safari 15). Pour `no-useless-assignment`
    (1 cas), voir `return-path.ts` ;
  - recharts 2 passe en 3 : seuls les types de `ui/chart.tsx` changent (payload du Tooltip via
    `TooltipContentProps`, `LegendPayload`, clé React indépendante de `dataKey`) ;
  - API : glob 10, apporté par `test-exclude` 7 via `babel-plugin-istanbul`, est remplacé par
    `test-exclude` 8 (glob 13), forcé par un override versionné. La couverture Jest fonctionne.
- **Service PostgreSQL de la recette** : `POSTGRES_INITDB_ARGS=--auth-local=trust --auth-host=trust`
  fixe les méthodes par défaut d'initdb, ce qui supprime son avertissement « trust ». Le `pg_hba.conf`
  est identique ligne pour ligne (vérifié dans le conteneur).

Ce qui reste, et pourquoi :
- « no usable system locales were found » vient de l'image `postgres:16-alpine`, celle de la
  production (`deploy/vps/docker-compose.yml`). L'image Debian ne l'émet pas, mais elle éloignerait
  la recette de la production ;
- les `DeprecationWarning` `punycode` et `url.parse()` étaient émis par l'action `setup-node@v5`, pas
  par le projet. La recette passe à `setup-node@v6`, et ils ont disparu de son journal (CI de la PR
  du 23 octobre : 48/48). Les autres workflows restent en v5 ;
- l'astuce `git init` de `actions/checkout` (« hint: … suppress this warning ») n'est pas un
  avertissement du projet.

Contrôles :
- `npm ci` sans avertissement, audit à 0 vulnérabilité ;
- typecheck, lint (0 erreur, 0 avertissement), 118 tests Vitest, build sans avertissement ;
- navigateur : Chromium 38/38, WebKit en Docker 76/76 ;
- recette réelle : Chromium et Chromium iPhone 32/32, WebKit iPhone 16/16 ;
- API : typecheck, build, couverture Jest (76 tests), e2e 123/123 (4 essais MinIO sautés) ;
- rendu de contrôle recharts 3 dans Vitest (aires, barres, lignes, secteurs, `ChartContainer`),
  non commité.
