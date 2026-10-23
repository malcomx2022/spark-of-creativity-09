# 01 — DomiCares Academy × Akambi : faisabilité et plan d'intégration — 23 octobre 2026

Sources analysées :

- demande DomiCares « Interconnexion de DomiCares et Akambi Consulting », v1.0 du 5 octobre 2026 ;
- réponse Akambi : `Guide_integration_API_Akambi_v1.md` (v1.0 du 14 octobre 2026), collection et
  environnement Postman `DomiCares_Partner_API_v1`, `LISEZ-MOI.txt` ;
- message de Denis NOUDEKE (préproduction `https://preprod.akambiconsulting.com`, clé et secret
  transmis séparément, URL de réception des webhooks demandée) ;
- état du dépôt : `main`, documents 10 à 15, modules `api/src/*`, `db/native/`, `deploy/vps/`.

Statut : **plan, aucun code ni schéma modifié**. Aucun appel à la préproduction Akambi n'a été
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

Chaque lot suit la méthode du dépôt : tests ajoutés, contrôles exécutés (typecheck, tests unitaires
et e2e, build, lint), ligne de suivi avec preuve et commit.

## 8. Prochaines étapes immédiates

0. **Test d'authentification** : importer la collection et l'environnement, renseigner `apiKey` et
   `apiSecret` (jamais dans le dépôt), lancer « 0. Démarrage > Vérifier l'authentification ».
   Résultat attendu : 200 avec `partner.code`. Relever aussi `GET /courses` (formation de test ?).
1. **URL de webhook de préproduction.** Proposée : `https://staging.domicares.life/api/webhooks/akambi`
   (domaine de recette prévu au document 07). Elle n'est pas encore servie : la communiquer à Denis
   en précisant qu'elle sera active à la fin du lot A5, et demander le `webhook.test` à ce moment.
   Les tentatives d'Akambi sur une route absente échoueraient (404) sans effet de bord.
2. Envoyer les questions du § 9 et obtenir les arbitrages du § 10.

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
