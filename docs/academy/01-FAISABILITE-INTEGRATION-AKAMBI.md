# 01 — DomiCares Academy × Akambi : faisabilité et plan d'intégration — 23 octobre 2026

Sources analysées :

- demande DomiCares « Interconnexion de DomiCares et Akambi Consulting », v1.0 du 5 octobre 2026 ;
- réponse Akambi : `Guide_integration_API_Akambi_v1.md` (v1.0 du 14 octobre 2026), collection et
  environnement Postman `DomiCares_Partner_API_v1`, `LISEZ-MOI.txt` ;
- message de Denis NOUDEKE (préproduction `https://preprod.akambiconsulting.com`, clé et secret
  transmis séparément, URL de réception des webhooks demandée) ;
- état du dépôt : `main`, documents 10 à 15, modules `api/src/*`, `db/native/`, `deploy/vps/`.

Statut : plan ; lots A1 (client Akambi), A2 (schéma `academy_*`), A3 (catalogue), A4 (inscription et accès), A5 (webhooks et rapprochement), A6 (attestations et supervision) et A7 (front et notifications) implémentés, voir « Suivi des lots » (§ 7). Aucun appel à la préproduction Akambi n'a été
exécuté pendant cette analyse (identifiants non disponibles dans cet environnement) : le test
« Vérifier l'authentification » reste à faire (§ 8, étape 0).

## 1. Verdict

**Intégration faisable dans l'architecture actuelle, sans nouvelle pile.** L'API Akambi couvre
les 9 fonctions demandées (catalogue privé, apprenant, inscription, accès, suivi, attestation,
reporting, webhooks, rapprochement). Ses mécanismes (HMAC sur corps brut, horodatage, idempotence,
webhooks signés avec rotation) sont ceux déjà maîtrisés pour FedaPay : `rawBody: true` est déjà
actif dans `api/src/app.factory.ts`, le worker et ses verrous consultatifs existent
(`api/src/jobs`), le modèle `*_PROVIDER=fake` permet de tester sans réseau.

Charge estimée : **18 à 22 jours-développeur** jusqu'à la recette commune en préproduction (§ 7),
hors arbitrages métier et hors circuit ouvert (vente, commissions, reversements), explicitement
exclus par les deux parties.

Écarts à accepter ou à traiter (aucun n'est bloquant pour le circuit fermé) :

| Écart | Impact | Traitement proposé |
|---|---|---|
| Pas d'OIDC/SAML : lien temporaire 5 min à usage unique | Conforme à l'option « lien temporaire » de la demande (§ 8) | Générer le lien au clic, côté serveur, et rediriger aussitôt (§ 4.4) |
| Compte Akambi préexistant (`EXISTING`) → `LOGIN_REQUIRED` | Le praticien doit saisir ses identifiants Akambi | Message explicite dans l'interface ; pas de contournement possible |
| Durée et langue absentes du catalogue (v1.1 éventuelle) | Fiche formation incomplète | Confirmer le besoin à Akambi ; afficher « non communiqué » d'ici là |
| Changement d'e-mail non géré par l'API | `409 LEARNER_EMAIL_MISMATCH` si l'e-mail DomiCares change | Bloquer l'accès Academy et ouvrir une demande support (§ 4.3) |
| Pas de route de désactivation d'apprenant ni de règle de conservation | Départ d'un praticien non outillé | À fixer dans la convention (§ 9) |
| Reporting : indicateurs « à valider » | Tableau admin provisoire | Validation Gaillardo / Fawaz avant mise en production |
| Co-marquage « DomiCares Academy — Powered by Akambi Consulting » (demande § 2) | Non traité par la réponse | Question à Akambi (attestations, espace apprenant, e-mails) |

## 2. Correspondance demande ↔ réponse

| Demande DomiCares (5 oct.) | Réponse Akambi (14 oct.) | État |
|---|---|---|
| § 6 Catalogue privé | `GET /api/partners/v1/courses` (+ `/{courseId}`), `updatedSince`, `ARCHIVED` pour retrait | Couvert |
| § 6 Association apprenant, référence externe stable | `POST /learners` (`externalLearnerId`, `accountOrigin` CREATED/EXISTING) | Couvert |
| § 6 Inscription, doublons | `POST /enrollments` : 201 puis 200 même `id` ; une inscription par formation | Couvert |
| § 8 Lien temporaire : durée, usage unique, identité | 5 min, usage unique, `courseId` facultatif ; destinations libres non prévues | Couvert ; lien « retour DomiCares » à demander |
| § 7 Progression 0–100 ou 0–1, calcul | Entier 0–100 = chapitres terminés ÷ chapitres | Couvert |
| § 7 Statuts et valeurs nulles | `ENROLLED`, `IN_PROGRESS`, `COMPLETED`, `CERTIFIED`, `CANCELLED` ; champ sans valeur = `null` | Couvert |
| § 7 Attestation : vérification, téléchargement sécurisé | `verificationUrl` permanente ; `downloadUrl` 15 min à redemander | Couvert |
| § 6 Reporting limité aux apprenants DomiCares | `GET /reports` (agrégats) | Couvert ; KPI à valider |
| § 8 Authentification serveur à serveur, séparation des environnements | Clé + secret HMAC par environnement, nonce, ±5 min | Couvert |
| § 9 Webhooks : id, type, date, version, signature, rejeu, rotation | 6 événements, `X-Akambi-Signature t=…,v1=…`, rotation 24 h à double signature | Couvert |
| § 9 Délai, nouvelles tentatives, rejeu manuel | 2xx < 10 s ; 8 tentatives sur ~45 h ; rejeu manuel même `id` | Couvert |
| § 9 Rapprochement `updatedSince` paginé | `GET /enrollments?updatedSince=…`, tri `updatedAt` puis id | Couvert ; cas des suppressions à préciser (§ 9) |
| § 10 Idempotence et nouvelle tentative réseau | `Idempotency-Key` 24 h, `422` si corps différent, 5xx non mémorisées | Couvert |
| § 11 Quotas, limites | Aucun quota à ce jour, préavis avant plafond | Couvert |
| § 11 Données de test, scénario d'attestation | Non fourni dans le lot | **À demander** |
| § 11 Incident, préavis de changement incompatible | Préavis + `/v2` ; procédure d'incident non décrite | **À demander** |
| § 7 Données minimales (pas de téléphone, ni spécialité, ni donnée de santé) | Nom, prénom, e-mail uniquement | Couvert |

Les routes publiques observées le 5 octobre (`/api/courses/public`, `/api/auth/*`, `/api/cart`,
etc.) ne sont **pas** reprises : seul le contrat `/api/partners/v1` est utilisé.

## 3. Points techniques relevés dans la documentation Akambi

1. **Signature du chemin.** La chaîne signée contient le chemin et la query « exactement tels
   qu'envoyés ». Le client DomiCares construit la query une seule fois (`URLSearchParams`), signe
   cette chaîne et l'envoie sans réencodage. `updatedSince` toujours au format `…Z`.
2. **Corps sérialisé une fois.** `JSON.stringify` une seule fois ; la même chaîne est signée et
   envoyée. Chaîne vide pour `GET`/`DELETE` (comme le script Postman).
3. **Nouvelle tentative.** Nouvelle signature, nouveau nonce, **même** `Idempotency-Key`. La clé
   est persistée en base *avant* l'appel (§ 4.2) pour survivre à un redémarrage de l'API.
4. **Horloge.** ±5 minutes dans les deux sens (requêtes et webhooks) : vérifier la synchronisation
   NTP du VPS dans `preflight.sh`.
5. **Exemple NestJS du guide.** `await res.json()` échoue sur une réponse non JSON (502 d'un proxy,
   coupure) : le client DomiCares lit le texte, parse prudemment et classe l'erreur. Délai maximal
   par appel (10 s) et 3 tentatives avec délai croissant sur 5xx/réseau uniquement.
6. **Webhook.** L'exemple du guide est correct (longueur fixée par la regex avant
   `timingSafeEqual`) ; DomiCares accepte aussi les hexadécimaux en majuscules et rejette un en-tête
   sans `t`. Le corps brut est déjà disponible (`req.rawBody`, même schéma que
   `WebhooksController.fedapay`).
7. **Ne pas réutiliser `webhook_events`.** Cette table est propre à FedaPay : le rejeu admin
   (`FinanceService.retryWebhookEvent`) et le job `webhooks.retry` repassent chaque ligne dans
   `PaymentsService.processWebhook`, et les statistiques admin la comptent. Les événements Akambi
   ont leur propre table (§ 4.1).
8. **Désordre et doublons.** Dédoublonnage sur `id` (unicité SQL) ; application seulement si
   `data.enrollment.updatedAt` est postérieur à la version détenue. Aucune régression de statut.
9. **Désinscription.** Après `DELETE`, `GET /enrollments/{id}` renvoie 404. Si l'événement
   `enrollment.cancelled` est perdu, le rapprochement doit traiter un 404 sur une inscription
   connue comme une annulation — à confirmer avec Akambi (§ 9).
10. **Lien d'attestation.** `downloadUrl` (15 min) n'est jamais stocké ni transmis par e-mail :
    il est redemandé à chaque clic. L'archivage du PDF dans S3 est une option ultérieure (nouveau
    préfixe, à décider ; les chemins de stockage existants ne changent pas).

## 4. Architecture cible côté DomiCares

Conforme à la proposition du § 10 de la demande : un `AcademyModule` NestJS centralise les appels
Akambi, les contrôles d'accès, la correspondance des identifiants et la synchronisation. Le front ne
parle qu'à l'API DomiCares ; aucun secret Akambi n'atteint le navigateur.

```
Navigateur (praticien / admin)
   │  /api/academy/*            /api/admin/academy/*
   ▼
API NestJS ── AcademyModule ── AkambiClient (HMAC, nonce, Idempotency-Key, délais)
   │              │                   │ HTTPS serveur à serveur
   │              │                   ▼
   │              │            https://preprod.akambiconsulting.com/api/partners/v1
   │              ▼
   │         PostgreSQL : academy_* (catalogue, apprenants, inscriptions, attestations, événements)
   ▲
   │ POST /api/webhooks/akambi  (signature X-Akambi-Signature, corps brut)
Akambi
Worker : academy.catalog.sync, academy.enrollments.reconcile (verrou consultatif existant)
```

### 4.1 Données (nouveau fichier SQL `db/native/140_academy.sql`)

Fichier idempotent (`CREATE TABLE IF NOT EXISTS`, contraintes nommées), applicable à une base neuve
**et** à une base existante, ajouté à la chaîne de chargement (README, `api/README.md`, workflows
`api-ci.yml`, `recette.yml`, `backup-restore.yml`) et à `scripts/db/build-native-schema.sh`, avec
droits dans le style de `020_grants.sql`, types dans `api/src/database/types.ts`, procédure
d'application sur le VPS et retour arrière (`DROP` des seules tables `academy_*`). Conforme à la
règle : pas de modification manuelle isolée de `schema.native.sql`.

| Table | Contenu | Contraintes clés |
|---|---|---|
| `academy_courses` | Copie du catalogue : id Akambi, titre, description, type, statut, catégorie, prix public (information), modules, chapitres, image, URL de présentation, `akambi_updated_at`, `synced_at` | PK id Akambi ; `ARCHIVED` masqué |
| `academy_learners` | `user_id` → `users.id`, `external_learner_id`, `akambi_learner_id`, `account_origin`, e-mail transmis, `idempotency_key` | `unique(user_id)`, `unique(external_learner_id)`, `unique(akambi_learner_id)` |
| `academy_enrollments` | id local, `akambi_enrollment_id`, `user_id`, `course_id`, statut, `progress` 0–100, `enrolled_at`, `started_at`, `last_activity_at`, `completed_at`, `certificate_id`, `akambi_updated_at`, `idempotency_key` | `unique(akambi_enrollment_id)` ; une inscription active par (`user_id`, `course_id`) ; `check (progress between 0 and 100)` |
| `academy_certificates` | numéro, inscription, nom, formation, score, dates, `verification_url` (sans `downloadUrl`) | PK numéro |
| `academy_webhook_events` | `event_id`, type, version, corps, `t` de signature, reçu le, traité le, statut, erreur | `unique(event_id)` |
| `academy_sync_state` | curseurs `updatedSince` (catalogue, inscriptions), dernière exécution, dernière erreur | PK clé |

`externalLearnerId` = `DC-` + `users.id` : stable, jamais réattribué, sans révéler de compteur.

### 4.2 Client Akambi (`api/src/academy/akambi.client.ts`)

- Configuration (`config.schema.ts`) : `ACADEMY_ENABLED` (défaut `false`), `AKAMBI_PROVIDER`
  (`akambi` | `fake`, défaut `fake`), `AKAMBI_BASE_URL`, `AKAMBI_API_KEY`, `AKAMBI_API_SECRET`,
  `AKAMBI_WEBHOOK_SECRETS` (liste séparée par des virgules pour la rotation). Clés requises quand
  `AKAMBI_PROVIDER=akambi` ; `fake` interdit en production quand `ACADEMY_ENABLED=true`
  (même règle que FedaPay). Valeurs dans le `.env` du VPS, jamais versionnées.
- Signature `{timestamp}.{nonce}.{MÉTHODE}.{chemin?query}.{corps}` ; nonce `randomUUID()`.
- Écritures : la ligne locale (apprenant ou inscription) est créée avec sa clé d'idempotence avant
  l'appel, puis complétée par la réponse. Une reprise relit la clé et rejoue l'appel.
- Erreurs : `code` stable d'Akambi converti en erreurs HTTP DomiCares lisibles ; journalisation
  sans e-mail, sans nom, sans jeton ni URL d'accès.
- `FakeAkambiClient` en mémoire pour les tests unitaires et e2e (pas de réseau en CI).

### 4.3 Règles métier et contrôles d'accès

- Accès Academy : utilisateur authentifié, compte actif (`AccountStatusService`, lot 2), rôle
  `practitioner` (et `coach` si l'arbitrage le prévoit), fiche praticien `kyc_status = 'approved'`
  (à confirmer), **e-mail vérifié** (`users.email_verified_at`) : sans vérification, DomiCares
  pourrait créer chez Akambi un compte lié à une adresse que le praticien ne possède pas.
- Chaque route vérifie l'appartenance : un praticien ne lit, ne lance et ne télécharge que ses
  propres inscriptions ; un id d'inscription d'autrui répond 404.
- Codes Akambi traités explicitement :
  `LEARNER_EMAIL_MISMATCH` (e-mail modifié) → accès suspendu, demande support ;
  `LEARNER_ALREADY_LINKED` → doublon de compte DomiCares, traitement admin ;
  `ACCOUNT_NOT_LINKABLE` → e-mail d'un formateur ou administrateur Akambi, message dédié ;
  `ENROLLMENT_EXISTS_OUTSIDE_PARTNER` → déjà inscrit directement chez Akambi, message dédié ;
  `CERTIFICATE_ISSUED` → désinscription refusée ; `PARTNER_INACTIVE` → Academy indisponible (503).
- Aucune donnée de santé, aucun téléphone, aucune spécialité transmis.

### 4.4 Routes DomiCares proposées

| Route | Rôle |
|---|---|
| `GET /api/academy/courses`, `GET /api/academy/courses/:id` | Catalogue local synchronisé |
| `POST /api/academy/enrollments` `{ courseId }` | Crée ou rattache l'apprenant puis inscrit (idempotent) |
| `GET /api/academy/enrollments` | Mes inscriptions et progression |
| `POST /api/academy/enrollments/:id/launch` | Renvoie `{ mode, url }` ; le front navigue aussitôt |
| `GET /api/academy/enrollments/:id/certificate` | Métadonnées et lien de vérification |
| `GET /api/academy/enrollments/:id/certificate/download` | Redemande `downloadUrl` et redirige (302) |
| `GET /api/admin/academy/reports`, `/enrollments`, `/webhook-events` | Reporting et supervision |
| `POST /api/admin/academy/sync`, `DELETE /api/admin/academy/enrollments/:id` | Rapprochement manuel, désinscription |
| `POST /api/webhooks/akambi` | Réception signée, publique |

Le lancement est un `POST` (jamais un `GET` qu'un préchargement ou un aperçu de lien consommerait)
et la navigation se fait dans le même onglet : un `window.open` après `await` est bloqué par Safari
iOS. Les rôles admin suivent `AdminRolesGuard` / `@AdminOnly` existants.

### 4.5 Webhooks

1. Vérifier la signature sur le corps brut avec chaque secret actif, refuser un `t` hors ±5 min.
2. Insérer l'événement (`unique(event_id)` ; un doublon répond 200 sans traitement).
3. Dans la même transaction courte, appliquer l'état complet de l'inscription si son `updatedAt`
   est plus récent ; enregistrer l'attestation sur `certificate.issued`.
4. Répondre 200 bien sous la limite de 10 s. Les effets secondaires (notification in-app, push
   générique, e-mail) partent après validation de la transaction, sans bloquer la réponse.
5. `webhook.test` : journalisé, sans effet.

Caddy transmet déjà `/api/*` à l'API : aucune modification du `Caddyfile`.

### 4.6 Jobs du worker (`JobsService`)

| Job | Fréquence proposée | Rôle |
|---|---|---|
| `academy.catalog.sync` | 6 h | `GET /courses?updatedSince=…` paginé ; `ARCHIVED` masqué |
| `academy.enrollments.reconcile` | 1 h (au moins 1/jour selon Akambi) | `GET /enrollments?updatedSince=…` ; mêmes règles d'ordre que les webhooks |

Les deux jobs ne s'exécutent que si `ACADEMY_ENABLED=true` et restent déclenchables par
`POST /admin/jobs/:name/run`.

### 4.7 Front (`src/`)

- Praticien : onglet `academy` de `PractitionerDashboard` via `useDashboardTab` (catalogue, mes
  formations, progression, « Accéder à la formation », attestation, message `LOGIN_REQUIRED`).
- Admin : onglet Academy (indicateurs, inscriptions, événements, rapprochement).
- Hooks TanStack Query dans `lib/api/`, mutations `onlineMutationOptions` (pas de nouvelle tentative
  automatique d'une inscription ou d'un lancement).
- Nouvelles notifications : ajouter `/dashboard/practitioner?tab=academy` aux chemins autorisés
  (`notificationPath`, `pushTargetPath`, `public/sw.js`) en gardant le texte push générique.
- Aucune réponse Academy dans le cache PWA. Responsive 320/390/768/1280 px, Safari iOS 16.4.

## 5. Sécurité et données personnelles

- Secrets uniquement côté serveur, distincts en préproduction et production, rotation du secret de
  webhook sans coupure (liste de secrets).
- Lien d'accès et `downloadUrl` jamais stockés, journalisés ni envoyés par e-mail.
- Données échangées : nom, prénom, e-mail. Base légale, information des praticiens (mise à jour de
  la politique de confidentialité) et durée de conservation à fixer dans la convention.
- Isolation : toutes les lectures DomiCares filtrent par `user_id` ; la recette vérifie qu'un
  identifiant d'un autre praticien ou d'un autre partenaire répond 404.

## 6. Tests

- Unitaires (`api/src/academy/*.spec.ts`) : chaîne signée (vecteur recalculé avec le script Postman),
  vérification webhook (secret courant, ancien secret, `t` périmé, majuscules, en-tête mal formé),
  conversion des erreurs, règle `updatedAt`.
- Intégration (`api/test/academy.e2e-spec.ts`, PostgreSQL réel, client factice) : appartenance et
  rôles, e-mail non vérifié refusé, inscription répétée, deux inscriptions **simultanées** au même
  cours (recouvrement réel, comme `security-regressions`), webhook dupliqué, webhook hors ordre,
  annulation, rapprochement.
- Campagne préproduction (`api/test/campaign/`, modèle de `campaign:fedapay`) : rejoue la grille du
  § 10 Akambi contre `preprod.akambiconsulting.com` avec les identifiants de test, hors CI.
- Front : Vitest des hooks et de l'onglet ; scénario Playwright du lancement (navigation même onglet).

## 7. Lots et estimation

| Lot | Contenu | Estimation |
|---|---|---|
| A0 | Ping Postman 200, réponse à Akambi (§ 9), arbitrages métier (§ 10) | 1 j |
| A1 | `AkambiClient`, configuration, client factice, tests de signature | 2 j |
| A2 | `140_academy.sql`, types Kysely, chaîne CI, procédure base existante et retour arrière | 2 j |
| A3 | Synchronisation du catalogue, routes de lecture | 1,5 j |
| A4 | Apprenant, inscription idempotente, lancement | 2,5 j |
| A5 | Réception webhooks, rapprochement, jobs | 2,5 j |
| A6 | Attestations, reporting et supervision admin | 1,5 j |
| A7 | Front praticien et admin, notifications | 3,5 j |
| A8 | Déploiement préproduction DomiCares, recette commune, documentation | 2,5 j |
| | **Total** | **19 j (fourchette 18–22 j)** |

### Suivi des lots

| Lot | État | Preuve |
|---|---|---|
| A1 | **Implémenté et validé localement** (23 octobre 2026) | `api/src/academy/` : `akambi.signature.ts` (signature des requêtes, chemin et query figés, vérification des webhooks avec rotation et ±300 s), `akambi.client.ts` (`HttpAkambiClient` : nouveau nonce par tentative, même `Idempotency-Key`, 3 tentatives sur réseau/délai/5xx uniquement, réponses non JSON classées, journaux sans corps ni message ; `FakeAkambiClient` : règles documentées en mémoire), `academy.module.ts` (sélection par `AKAMBI_PROVIDER`, aucune route). Configuration : `ACADEMY_ENABLED`, `AKAMBI_PROVIDER`, `AKAMBI_BASE_URL` (HTTPS), `AKAMBI_API_KEY`, `AKAMBI_API_SECRET`, `AKAMBI_TIMEOUT_MS` ; client factice refusé en production quand l'Academy est activée. Le secret de webhook sera ajouté au lot A5. Contrôles (Node 22.22.0) : `npm run typecheck` OK ; `npm test -- --runInBand` 12 suites, 110 tests réussis (dont 34 nouveaux : signature avec vecteurs `openssl`, client HTTP, client factice, configuration) ; `npm run build` OK ; `npm run lint` à la racine OK (0 avertissement) ; `npm run test:e2e` sur PostgreSQL 16 local jetable : 123 réussis, 4 ignorés (MinIO absent). Non exécuté : appel réel à la préproduction Akambi (identifiants non disponibles dans cet environnement). |
| A2 | **Implémenté et validé localement** (23 octobre 2026) | `db/native/140_academy.sql` (idempotent, transactionnel) : `academy_courses`, `academy_learners` (`external_learner_id = 'DC-' \|\| user_id` imposé par contrainte, clé d'idempotence, état `pending/linked/failed`), `academy_enrollments` (index unique partiel : une inscription active par praticien et formation ; progression 0–100 ; statut confirmé ⇒ identifiant Akambi), `academy_certificates` (sans `downloadUrl`), `academy_webhook_events` (`unique(event_id)`, distincte de `webhook_events`), `academy_sync_state` ; cascade depuis `users` ; déclencheurs `updated_at`. Retour arrière : `db/native/rollback/140_academy.down.sql`. Chaîne mise à jour : workflows `api-ci`, `recette`, `backup-restore`, `docker-compose.yml` (`28_academy.sql`, avant `30_grants.sql`), `build-native-schema.sh` (base de contrôle), `import-native.sh`, README, `api/README.md`, `docs/migration-postgresql/README.md` ; types Kysely dans `api/src/database/types.ts`. Contrôles sur PostgreSQL 16 local : base existante (schéma + 130 + droits) → 140 appliqué deux fois sans erreur, droits `domicares_app` présents (24), retour arrière (58 tables restantes) puis réapplication OK ; base neuve avec la nouvelle chaîne : 64 tables. `test/academy-schema.e2e-spec.ts` : 6 tests (dont deux inscriptions simultanées en recouvrement réel ; échoue si l'index unique est retiré). `npm run typecheck`, `npm test -- --runInBand` (110), `npm run build`, `npm run lint` (racine, 0 avertissement) OK ; `npm run test:e2e` sur la base neuve : 129 réussis, 4 ignorés (MinIO absent). Non exécuté : `build-native-schema.sh` complet (régénérerait `schema.native.sql`, inchangé par ce lot) et application sur le volume du VPS (procédure dans l'en-tête du fichier, sauvegarde préalable). |
| A3 | **Implémenté et validé localement** (23 octobre 2026) | `AcademyService` (`api/src/academy/academy.service.ts`) : `assertAccess` (Academy activée sinon 503 ; fiche praticien hors `coach_sportif` en attendant l'arbitrage du § 10 ; KYC `approved` ; e-mail vérifié ; compte actif via `JwtAuthGuard`), `listCourses`/`getCourse` (formations `PUBLISHED` de la copie locale), `syncCatalog` : lecture complète paginée avec `updatedSince` à l'origine (archivées comprises, détection des retraits), validation Zod de chaque formation, upsert sans écraser une version locale plus récente, masquage (`ARCHIVED`) des formations absentes seulement si la lecture est complète et égale au total annoncé, état et erreur (code stable seul) dans `academy_sync_state` ; une erreur Akambi devient un 502 sans le message d'Akambi (repéré en test : le filtre HTTP l'aurait journalisé). Routes `GET /api/academy/courses` et `/courses/:courseId` (identifiant validé). Job `academy.catalog.sync` (6 h, `POST /api/admin/jobs/academy.catalog.sync/run`), sans effet si l'Academy est désactivée. Tests : `academy.service.spec.ts` (2) ; `test/academy-catalog.e2e-spec.ts` (7 : 401, catalogue et contrat de réponse, 403 patient/coach/KYC/e-mail, versions plus récente et plus ancienne, retrait puis retour, formation illisible, erreur Akambi 502 sans donnée). Contrôles : `npm run typecheck`, `npm test -- --runInBand` (13 suites, 112 tests), `npm run build`, `npm run lint` (racine, 0 avertissement) OK ; `npm run test:e2e` sur base neuve PostgreSQL 16 : 136 réussis, 4 ignorés (MinIO absent). À confirmer en préproduction : `updatedSince=1970-01-01T00:00:00.000Z` renvoie bien tout le catalogue DomiCares. |
| A4 | **Implémenté et validé localement** (23 octobre 2026) | `AcademyEnrollmentsService` (`api/src/academy/academy-enrollments.service.ts`) : compte de formation créé ou rattaché au premier besoin (`POST /learners` : ligne `pending` et clé d'idempotence avant l'appel ; nom du profil découpé en prénom et nom, ou fourni par le praticien si le profil n'a qu'un mot ; clé renouvelée une fois sur `IDEMPOTENCY_KEY_REUSED` ; refus 409 conservés en `failed` et retentés à la demande suivante) ; inscription (`POST /enrollments`) avec ligne `PENDING` arbitrée par l'index unique partiel, même clé à la reprise après coupure, ligne retirée sur refus définitif, réponse contrôlée (apprenant et formation) puis état appliqué par `applyEnrollmentState` (validation Zod, version plus ancienne ignorée ; réutilisable par les webhooks du lot A5) ; accès (`POST /sso/launch`) réservé au propriétaire d'une inscription confirmée, `Cache-Control: no-store`, lien ni stocké ni journalisé. Erreurs Akambi converties par `academy.errors.ts` en 409/404/503/502 avec code stable dans `error`, sans le message d'Akambi. Routes : `POST /api/academy/enrollments` (201/200), `GET /api/academy/enrollments`, `POST /api/academy/enrollments/:id/launch`. Choix par défaut en attendant le § 10 : inscription libre par le praticien depuis DomiCares, coachs exclus. Tests : `academy-enrollments.spec.ts` (5) ; `test/academy-enrollments.e2e-spec.ts` (11 : refus 401/403/400/404, création puis rejeu sans appel à Akambi, deux demandes simultanées — échoue si l'index unique est retiré —, coupure réseau puis reprise avec la même clé, refus définitif hors partenariat, nom d'un seul mot, compte formateur non rattachable, rotation de clé, lien SSO non mis en cache, compte préexistant en `LOGIN_REQUIRED`, inscription d'autrui ou en attente en 404, liste limitée au praticien). Contrôles : `npm run typecheck`, `npm test -- --runInBand` (14 suites, 117 tests), `npm run build`, `npm run lint` (racine) OK ; `npm run test:e2e` sur base neuve PostgreSQL 16 : 147 réussis, 4 ignorés (MinIO absent). Non exécuté : parcours réel en préproduction Akambi (identifiants non disponibles). |
| A5 | **Implémenté et validé localement** (23 octobre 2026) | `AcademySyncService` (`api/src/academy/academy-sync.service.ts`) et `POST /api/webhooks/akambi` (`academy-webhooks.controller.ts`) : signature vérifiée sur le corps brut (jamais sur un JSON re-sérialisé) avec chaque secret de `AKAMBI_WEBHOOK_SECRETS` (rotation à double signature, ±300 s) ; 503 si aucun secret ou Academy désactivée ; enveloppe et identifiant d'en-tête contrôlés (400) ; événement inséré dans `academy_webhook_events` (`unique(event_id)` : un doublon répond `duplicate: true`) puis appliqué dans la même transaction courte par `applyEnrollmentState` (version plus ancienne ignorée) ; `enrollment.created` reçu avant la réponse d'inscription rattaché à la demande `PENDING` du même apprenant et de la même formation ; `certificate.issued` enregistre l'attestation sans lien de téléchargement ; inscription inconnue ou type non pris en charge acquittés en `ignored`, contenu illisible acquitté en `failed` (une nouvelle tentative n'y changerait rien), erreur de base en 500 pour qu'Akambi retente. Job `academy.enrollments.reconcile` (1 h) : `GET /enrollments?updatedSince=<curseur>` relu depuis la première page à chaque avancée du curseur (aucun saut pendant les modifications), attestations manquantes relues par `GET …/certificate`, curseur conservé si un élément est illisible, erreur Akambi en 502 avec code seul. Accès à une inscription retirée chez Akambi sans événement reçu : confirmé par `GET /enrollments/{id}` puis close localement (`CANCELLED`). Notifications au praticien reportées au lot A7 (chemin front `?tab=academy` à créer et à autoriser). Tests : `academy-sync.spec.ts` (2) ; `test/academy-sync.e2e-spec.ts` (10 : signatures absente/fausse/expirée/corps modifié, ancien et nouveau secret, 400 sur incohérence, progression, doublon, événement plus ancien — échoue si la garde de version est retirée —, achèvement et attestation, annulation puis réinscription, événement avant la réponse, contenus ignorés ou illisibles, rapprochement sans webhook avec attestation, erreur Akambi 502, annulation découverte à l'accès). Contrôles : `npm run typecheck`, `npm run build`, `npm run lint` (racine) OK ; `npm test -- --runInBand` : 15 suites, 119 tests réussis sur 8 exécutions consécutives — une exécution antérieure a compté 12 échecs non reproduits et dont le journal n'a pas été conservé ; `npm run test:e2e` sur base neuve PostgreSQL 16 : 157 réussis, 4 ignorés (MinIO absent). Non exécuté : `webhook.test` réel d'Akambi (route non déployée en préproduction DomiCares, secret non reçu). |
| A6 | **Implémenté et validé localement** (23 octobre 2026) | Praticien : `GET /api/academy/enrollments/:id/certificate` (métadonnées locales et lien public de vérification, propriétaire seul, 404 `CERTIFICATE_NOT_FOUND` avant délivrance) et `POST /api/academy/enrollments/:id/certificate/download` (lien PDF de 15 min redemandé à Akambi à chaque clic, `Cache-Control: no-store`, ni stocké ni journalisé). Écart au § 4.4 : une réponse JSON suivie par le front plutôt qu'une redirection 302, pour fonctionner aussi avec l'authentification Bearer des clients mobiles et éviter qu'un préchargement consomme le lien. Administration (`AcademyAdminService`, `academy-admin.controller.ts`, rôles `super_admin`, `ops`, `analyst`, `support`) : `GET /api/admin/academy/reports` (indicateurs Akambi, provisoires, et décompte local par statut), `GET …/enrollments` (filtres statut, formation, recherche échappée ; pagination et total sur le même périmètre), `GET …/webhook-events` (sans le corps des événements, décompte par statut), `GET …/sync-state` ; `DELETE …/enrollments/:id` réservé à `super_admin`/`ops` : désinscription chez Akambi, refus codés (`CERTIFICATE_ISSUED`, `ALREADY_CANCELLED`, `ENROLLMENT_PENDING`), inscription déjà absente chez Akambi close localement, journalisée dans `admin_audit_logs` (`academy_cancel_enrollment`). Relance des synchronisations : `POST /api/admin/jobs/academy.catalog.sync/run` et `…/academy.enrollments.reconcile/run` (existant). Tests : `test/academy-admin.e2e-spec.ts` (7 : attestation avant et après délivrance, lien non mis en cache, attestation d'autrui en 404 — échoue si le filtre de propriétaire est retiré —, rôles administrateurs, indicateurs, filtres et pagination, événements sans corps, état des synchronisations, désinscription et ses refus, inscription déjà absente). Contrôles : `npm run typecheck`, `npm run build`, `npm run lint` (racine) OK ; `npm test -- --runInBand` : 120 tests réussis sur 3 exécutions ; `npm run test:e2e` sur base neuve PostgreSQL 16 : 165 réussis, 4 ignorés (MinIO absent). |
| A7 | **Implémenté et validé localement** (23 octobre 2026) | Front : `src/hooks/useAcademy.ts` (requêtes et mutations TanStack Query, `onlineMutationOptions` sans nouvelle tentative, code d'erreur lu dans `error`, navigation vers Akambi dans le même onglet et seulement en HTTPS), `components/dashboard/practitioner/AcademySection.tsx` (catalogue, inscription, prénom et nom demandés sur `LEARNER_NAME_REQUIRED`, mes formations avec progression, accès au cours, mention des comptes Akambi préexistants, inscription en attente avec nouvelle tentative, attestation avec lien de vérification et PDF ; 503 → « pas encore disponible », 403 → motif de l'API ; inscriptions demandées seulement après un catalogue obtenu), `components/admin/AcademyAdminSection.tsx` (indicateurs, synchronisations et relances par les jobs existants, événements en échec, inscriptions filtrées et paginées, désinscription après confirmation). Onglets `academy` de `PractitionerDashboard` et `AdminDashboard` (via `useDashboardTab`), affichés seulement si `GET /api/config/public` renvoie `academyEnabled: true` (nouveau champ, lu sans authentification). Notifications : passage à `COMPLETED` puis `CERTIFIED` → notification in-app (type `academy`, lien `/dashboard/practitioner?tab=academy`, déjà accepté par `notificationPath`, `pushTargetPath` et `public/sw.js`), écrite dans la transaction de l'événement ou du rapprochement, une seule fois par transition ; push et e-mail non envoyés pour ces événements. Coachs sans onglet, en attendant le § 10. Tests : `AcademySection.test.tsx` (9 : 503, 403, inscription, nom requis, refus codé, accès au cours, inscription en attente, attestation, refus des URL non HTTPS — dont un défaut trouvé et corrigé : les inscriptions étaient demandées en parallèle d'un catalogue en 503) ; `AcademyAdminSection.test.tsx` (4) ; e2e API : notifications par transition sans doublon, `academyEnabled` public ; navigateur `tests/browser/compatibility.spec.ts` : onglet Academy praticien et admin à 320/390/768/1280 px avec données longues, sans débordement. Contrôles : front `npx tsc --noEmit -p tsconfig.app.json` OK, `npm test` 25 fichiers / 131 tests, `npm run build` OK, `npm run lint` 0 avertissement ; navigateur `--project chromium` 40/40 (Chromium préinstallé via `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, la version 1243 attendue n'étant pas disponible ici) ; API typecheck, 120 tests unitaires, build, `test:e2e` 165 réussis et 4 ignorés (MinIO absent). Non exécuté : projets WebKit iPhone/iPad (WebKit non installable ici ; exécutés par la CI), Safari sur appareil physique. |
| A8 | **Outillage implémenté et validé localement ; recette réelle à exécuter** (23 octobre 2026) | Procédure `docs/academy/02-RECETTE-PREPRODUCTION.md` : prérequis (ping Postman, formation et compte `EXISTING` de test, arbitrages, NTP), activation sur `staging.domicares.life` (sauvegarde, `28_academy.sql` puis `30_grants.sql` sur la base existante, variables `.env`, redéploiement `api`/`worker`), webhook (URL, `whsec_…`, `webhook.test`, rotation), grille § 10 avec colonnes de preuve, critères de décision, retour arrière (`ACADEMY_ENABLED=false` d'abord, `140_academy.down.sql` ensuite) et passage en production. `deploy/vps/preflight.sh` : section Academy (✖ client factice, URL non HTTPS, clé ou secret absent, horloge non synchronisée, tables `academy_*` incomplètes ; ⚠ URL Akambi incohérente avec le domaine, secret de webhook absent, horloge non vérifiable). Campagne `api/test/campaign/akambi-preprod.campaign.ts` (`npm run campaign:akambi`, hors CI, base locale dédiée) : mode `preprod` limité à `https://preprod.akambiconsulting.com`, scénarios automatisables de la grille (ping et refus signés, catalogue, apprenant, inscription répétée, compte existant, accès, idempotence, isolation, rapports et désinscription), rapport sans donnée personnelle dans `api/campaign-reports/`. Contrôles : `bash -n preflight.sh` OK et section Academy exercée sur un `.env` de test (refus et succès attendus) ; `AKAMBI_CAMPAIGN=fake npm run campaign:akambi` sur PostgreSQL 16 local : 9/9, comptes de test supprimés (défaut de nettoyage trouvé et corrigé : journal d'audit admin) ; API `npm run typecheck`, `npm test -- --runInBand` (15 suites, 121 tests), `npm run build`, `npm run lint` (racine, 0 avertissement) OK. **Non exécuté** (identifiants et accès VPS indisponibles ici) : campagne `preprod`, activation sur le VPS, `webhook.test`, parcours navigateur R4b/R5/R7/R11/R12, Safari sur appareil physique. |
| A0 | **Outillage et préparation faits ; actions DomiCares en attente** (26 octobre 2026) | `docs/academy/03-LOT-A0-ECHANGES-ET-ARBITRAGES.md` : constats (préproduction Akambi joignable, 401 `MISSING_AUTH_HEADERS` sans en-têtes et `INVALID_API_KEY` avec une clé factice : format signé accepté jusqu'au contrôle de la clé ; webhook de la recette en ligne, 503 sans secret comme prévu), message à Denis (URL, secret, données de test, questions du § 9), tableau de suivi des réponses, tableau des arbitrages D1 à D5 avec le comportement actuel du code et la modification qu'impliquerait l'autre option. Outil `api/src/academy/akambi-ping.ts` (`npm run akambi:ping` ; sur le VPS `node dist/academy/akambi-ping.js`) : ping signé par le client de l'API, décalage d'horloge, refus d'une signature fausse, catalogue ; ni clé, ni secret, ni corps affichés ; `HttpAkambiClient` ne dépend plus que des quatre variables Akambi (`AkambiClientConfig`). Contrôles : `akambi-ping.spec.ts` (4 tests) ; exécution réelle contre la préproduction avec une clé factice → 401 `INVALID_API_KEY`, code de sortie 1 ; API `npm run typecheck`, `npm test -- --runInBand`, `npm run build`, `npm run lint` (racine). **Non exécuté** : ping avec les vrais identifiants (non disponibles ici), envoi du message, réponses et arbitrages. |

Chaque lot suit la méthode du dépôt : tests ajoutés, contrôles exécutés (typecheck, tests unitaires
et e2e, build, lint), ligne de suivi avec preuve et commit.

## 8. Prochaines étapes immédiates

0. **Test d'authentification** : importer la collection et l'environnement, renseigner `apiKey` et
   `apiSecret` (jamais dans le dépôt), lancer « 0. Démarrage > Vérifier l'authentification ».
   Résultat attendu : 200 avec `partner.code`. Relever aussi `GET /courses` (formation de test ?).
   Sans Postman : `npm run akambi:ping` dans `api/` (document 03, § 2).
1. **URL de webhook de préproduction** : `https://staging.domicares.life/api/webhooks/akambi`, en
   ligne sur la recette depuis le 24 octobre (503 tant que le secret n'est pas installé). La
   communiquer à Denis et demander le `whsec_…`, puis le `webhook.test` (document 03, § 3).
2. Envoyer les questions du § 9 et obtenir les arbitrages du § 10 : message, suivi des réponses et
   tableau de décisions au document 03.

## 9. Questions à transmettre à Akambi

1. `GET /enrollments?updatedSince=…` renvoie-t-il les inscriptions annulées ? Sinon, comment
   rapprocher une annulation dont le webhook est perdu (le `GET` répond 404) ?
2. Un compte `CREATED` reçoit-il un e-mail d'Akambi ? Peut-il aussi se connecter directement chez
   Akambi (mot de passe) ? Quel expéditeur et quel marquage ?
3. Co-marquage « DomiCares Academy — Powered by Akambi Consulting » sur l'espace apprenant et les
   attestations (demande § 2) : prévu, et selon quelles modalités ?
4. Lien de retour vers DomiCares depuis l'espace Akambi : paramètre possible dans `sso/launch` ?
5. Données de test : formation courte avec évaluation, apprenants fictifs, compte `EXISTING` de test,
   moyen de déclencher progression et attestation en préproduction.
6. Durée de rétention des nonces, et tolérance d'horloge exacte (±300 s inclus ?).
7. Plages d'adresses IP sortantes des webhooks (filtrage optionnel côté Caddy).
8. Procédure d'incident, contact d'astreinte, page d'état, délai de préavis avant `/v2`.
9. Départ d'un praticien, désactivation du compte apprenant, conservation et suppression des données.
10. Procédure d'émission des identifiants de production et date cible.
11. Besoin confirmé de durée et langue (v1.1) : DomiCares le confirme.

## 10. Arbitrages métier DomiCares (Gaillardo, Fawaz)

- Qui accède à l'Academy : praticiens validés KYC uniquement ? Coachs inclus ?
- Inscription libre par le praticien depuis DomiCares, ou validée par un administrateur ?
- Indicateurs de reporting retenus, visibles par qui (admin seulement ou praticien) ?
- Archivage des attestations PDF côté DomiCares (S3) ou simple lien de vérification ?
- Affichage du prix public Akambi (information) ou masqué dans le circuit fermé ?

## 11. Risques

| Risque | Probabilité | Mesure |
|---|---|---|
| Préproduction DomiCares non déployée à temps pour les webhooks | Moyenne | Rapprochement par `updatedSince` d'abord ; webhooks activés ensuite |
| Décalage d'horloge du VPS (refus 401) | Faible | Contrôle NTP dans `preflight.sh`, alerte sur `TIMESTAMP_OUT_OF_RANGE` |
| Fuite d'un lien d'accès | Faible | `POST` au clic, aucun stockage, usage unique et 5 min côté Akambi |
| Changement d'e-mail praticien | Moyenne | Détection `LEARNER_EMAIL_MISMATCH`, procédure support documentée |
| Indicateurs non validés | Moyenne | Tableau admin marqué provisoire jusqu'à validation |
| Évolution incompatible de l'API | Faible | Client versionné `/v1`, préavis contractuel, tests de contrat en campagne |

## 12. Hors périmètre

Circuit ouvert (vente de formations par des praticiens, commissions, reversements, FedaPay),
production des contenus pédagogiques, SSO OIDC/SAML, application mobile native. Aucun mécanisme
FedaPay, route ou chemin de stockage existant n'est modifié par ce plan.
