# 10 — Plan de correction après revue du projet

Date : 6 octobre 2026. Base examinée : `d998e78732b9b94a1cee73800fc8497914076ed0`.
Statut : **lots applicatifs 1 à 5 fusionnés via PR #82 sur `main` (`4dbc588`)**.
Suite active : [corrections fonctionnelles, sécurité, responsive et PWA](11-CORRECTIONS-FONCTIONNEL-SECURITE-PWA.md).

## 1. Objectif et continuité des travaux

Corriger les défauts de confidentialité et de sessions dans l'architecture Domicares
existante. Conserver le code livré, ses modules, contrats et règles métier ; apporter
des modifications ciblées accompagnées de preuves. Ce chantier complète les lots
A à D du document 05 et les corrections FedaPay du document 08 sans les rouvrir.
La campagne sandbox du document 09 reste nécessaire pour valider le fournisseur réel.

Consignes Claude Code : `../../CLAUDE.md`, `../../api/CLAUDE.md`,
`../../src/CLAUDE.md`, `../../deploy/vps/CLAUDE.md`.
Aucun de ces fichiers n'existait dans la version examinée ; ils ont été ajoutés pour ce chantier.

Les constats initiaux de code ci-dessous sont issus d'une lecture statique. Les scénarios de
reproduction doivent être exécutés avant de déclarer un correctif validé.

## 2. Référence de validation locale

| Contrôle exécuté lors de la revue | Résultat au 06/10/2026 |
|---|---|
| Typecheck front et API | Réussis |
| Builds front et API | Réussis |
| Vitest front | 4 fichiers, 20 tests réussis |
| Jest unitaire API | 3 suites, 16 tests réussis |
| Lint racine | 178 erreurs, 46 avertissements ; CI informative |
| E2e API | 8 suites / 85 tests non validés : connexion refusée vers PostgreSQL local `localhost:5433` |

Les échecs e2e liés à la base absente ne prouvent pas une régression métier.
Ne pas confondre cette référence avec les validations historiques ou l'état de production.

## 3. Ordre d'exécution

| Lot | Priorité | Dépendances | État |
|---|---|---|---|
| 0 — Base et reproduction | Préparation | Aucune | Validé localement |
| 1 — Confidentialité des rendez-vous | Haute | 0 | Validé localement |
| 2 — État des comptes et sessions | Haute | 0 | Validé localement |
| 3 — Atomicité des jetons | Haute | 0, coordination avec 2 | Validé localement |
| 4 — Cycle de vie temps réel | Moyenne | 2 et 3 | Validé localement |
| 5 — Validation des fichiers | Moyenne | 0 | Validé localement |
| 6 — Qualité, sauvegardes et recette | Moyenne | 1 à 5 pour la recette finale | Partiel (§7) |

Livrer des changements distincts par lot. Les sauvegardes et le nettoyage lint ciblé
peuvent commencer avant la fin des corrections de sécurité. Aucune estimation de
durée ferme avant la reproduction et le choix du mécanisme S3.

### Lot 0 — Préparer une référence reproductible

- Créer une base PostgreSQL 16 dédiée aux tests et renseigner `DATABASE_URL` pour
  les processus de test uniquement. Suivre `api/README.md` et le workflow `api-ci.yml`
  pour l'ordre de chargement du schéma et des grants ; ne pas utiliser la production.
- Exécuter les 8 suites e2e existantes, identifier séparément les problèmes de fixture,
  d'infrastructure et de comportement, conserver les résultats de référence.
- Préparer les rôles patient, autre patient, praticien, coach et administrateur ainsi
  que des comptes suspendus et supprimés. Ne pas intégrer de données réelles aux fixtures.

Acceptation : suites existantes exécutables, résultats et configuration non sensible consignés.

### Lot 1 — Protéger les notes internes sur toutes les réponses

Constat : `AppointmentsService.get` masque `internal_notes` pour le patient, mais
`list`, `confirm` et `cancel` renvoient des lignes complètes. La fonction SQL
`mask_appointment_internal_notes` n'est pas appelée automatiquement par ces lectures.

Fichiers : `api/src/appointments/appointments.service.ts`, types de réponse concernés,
`api/test/appointments-payments.e2e-spec.ts`.

- Introduire une projection commune selon l'appelant et l'appliquer à toutes les
  lectures et mutations qui renvoient un rendez-vous, y compris les créations/réassignations.
- Conserver `internal_notes: null` pour le patient afin de préserver le contrat actuel.
  Préserver la visibilité du praticien et de l'administrateur autorisés.
- Lorsque l'appelant est à la fois patient et praticien, conserver la priorité
  patient actuelle de `get` ; ne pas modifier implicitement la politique métier.

Acceptation : des notes sentinelles existent en base ; elles ne figurent jamais dans
les réponses au patient (liste, détail, confirmation, annulation), restent disponibles
aux appelants autorisés, et un tiers reçoit un refus sans données confidentielles.

### Lot 2 — Appliquer une politique cohérente aux comptes

Constat : `AuthService.verifyOtp` émet une session sans contrôle de `banned_until` ;
les recherches par profil/praticien peuvent retrouver un utilisateur supprimé.
`JwtAuthGuard` vérifie la signature sans consulter l'état du compte.

Fichiers : `api/src/auth/auth.service.ts`, gardes JWT obligatoire/optionnelle,
`api/src/realtime/realtime.gateway.ts`, `api/test/auth.e2e-spec.ts`.

- Centraliser les contrôles de suppression et de suspension avant émission de session,
  les appliquer à login, OTP et refresh sans changer les règles de vérification e-mail.
- Vérifier les branches de résolution du téléphone (profil, praticien, utilisateur).
  Ne pas recréer automatiquement un compte supprimé retrouvé via un ancien profil.
- Pour une session déjà ouverte, refuser les opérations protégées d'un compte suspendu
  ou supprimé. Pour une garde optionnelle, ne pas transformer un compte suspendu
  authentifié en utilisateur anonyme afin de contourner ce refus.
- Distinguer suspension du compte, verrouillage temporaire des essais de mot de passe
  et vérification OTP : un verrouillage de mot de passe ne doit pas devenir une nouvelle
  règle OTP par accident.
- Conserver les contrats d'erreur existants lorsque possible ; aucun jeton ni cookie
  de session ne doit être produit après un refus.

Acceptation : mot de passe, OTP et refresh refusent les comptes suspendus/supprimés ;
les sessions précédentes sont contrôlées sur les routes protégées ; les comptes actifs,
les nouveaux comptes OTP et les rôles existants conservent leurs parcours.
La suppression effective des droits Socket.IO est validée dans le lot 4.

### Lot 3 — Consommer les jetons atomiquement

Constat : `AuthService.refresh` et `TokensService.consumeOneTimeToken` lisent l'état
avant une mise à jour non conditionnelle, sans verrou. Des requêtes simultanées
peuvent consommer deux fois un jeton.

Fichiers : `api/src/auth/auth.service.ts`, `api/src/auth/tokens.service.ts`,
`api/test/auth.e2e-spec.ts`, `src/lib/api/client.ts`, `src/lib/api/session.ts` si nécessaire.

- Verrouiller la ligne ou utiliser `UPDATE ... WHERE ... RETURNING` pour garantir
  un seul consommateur ; vérifier expiration et révocation dans la même opération.
- Garder rotation, hash, famille de refresh tokens et détection de réutilisation.
  La révocation de famille doit persister malgré la réponse d'erreur ; éviter une
  transaction imbriquée attendant une ligne verrouillée par la transaction appelante.
- Préserver l'atomicité consommation/reset du mot de passe ; un échec métier ne doit
  pas laisser un jeton consommé sans l'opération correspondante.
- Tester les renouvellements depuis plusieurs onglets : le verrou de `client.ts`
  est local à une fenêtre. Coordonner les onglets si nécessaire, sans affaiblir la
  politique de détection de réutilisation pour masquer un problème client.

Acceptation : deux consommations réellement concurrentes ne réussissent jamais
toutes les deux ; la famille réutilisée ne contient aucun refresh token encore actif
après traitement ; reset et vérification e-mail sont à usage unique ; aucun deadlock.
La coordination navigateur et les cookies restent compatibles avec les clients Bearer.

### Lot 4 — Fermer et réauthentifier les connexions temps réel

Constat : l'authentification Socket.IO est vérifiée au handshake ; aucune expiration
ni réévaluation ultérieure des droits n'est planifiée. Au refresh, le front modifie
`socket.auth` mais ne reconnecte pas un socket déjà connecté. En complément, le
chemin de reconnexion LISTEN ajoute à nouveau un écouteur `bus.on('change')`.

Fichiers : `api/src/realtime/realtime.gateway.ts`, `change-listener.ts`,
`src/lib/api/realtime.ts`, `session.ts`, `api/test/messaging-realtime.e2e-spec.ts`.

- Programmer une fermeture à l'expiration du JWT ; obtenir un nouveau handshake
  authentifié après rotation, sans renouveler les droits avec un simple changement client.
- Appliquer la politique du lot 2 aux sockets et retirer les rooms devenues interdites
  après changement de rôle ou d'accès au rendez-vous. Documenter et tester le délai
  maximal de propagation ; utiliser les événements serveur disponibles ou un contrôle
  périodique borné, pas un polling par message ni une confiance dans le client.
- Rejoindre uniquement les rooms encore autorisées après reconnexion. Nettoyer les
  abonnements de l'ancien compte lors d'un changement d'utilisateur.
- Séparer l'abonnement au bus de la reconnexion PostgreSQL : un seul listener, un seul
  timer de reconnexion, fermeture de l'ancien client, aucun redémarrage après shutdown.

Acceptation : socket expiré ne reçoit plus d'événement ; refresh rétablit les flux
autorisés ; retrait de rôle/suspension retire l'accès dans le délai documenté ; deux
reconnexions LISTEN ne dupliquent pas les événements ; timers et clients sont nettoyés.

### Lot 5 — Valider les fichiers réellement envoyés

Constat : `createUploadUrl` contrôle seulement `dto.fileSize` ; la signature PUT ne
limite pas la taille réelle et `register` reprend les métadonnées déclarées.

Fichiers : `api/src/files/*`, `api/src/storage/*`, `src/lib/api/files.ts`, tests fichiers/KYC,
configuration S3 et documentation de déploiement concernées.

- Préserver d'abord le flux PUT : lier l'autorisation d'envoi à l'utilisateur et à la
  clé ; vérifier par HEAD la présence, taille et type de l'objet avant enregistrement.
  Refuser et supprimer un objet trop volumineux ; ne pas exposer un objet non validé.
- Cette validation après envoi protège l'enregistrement, mais ne borne pas les octets
  déjà transférés. Pour limiter aussi le transfert, évaluer un POST signé avec
  `content-length-range` ou un flux serveur borné ; prouver la compatibilité MinIO/Wasabi
  et faire évoluer fournisseur, DTO et front ensemble si cette option est retenue.
- Évaluer les écrasements possibles avec une URL encore valide et choisir une stratégie
  de validation stable (quarantaine/promotion ou version d'objet) avant livraison.
- Utiliser les tailles réelles, vérifier le type réel lorsque nécessaire et préserver
  les limites existantes : 10 Mo fichiers, 5 Mo documents KYC. Vérifier également la
  limite JSON Fastify pour les flux base64 et les ensembles de documents KYC.
- Prévoir le nettoyage des objets orphelins et une adaptation des objets historiques
  sans supprimer les documents existants par défaut.

Acceptation : taille déclarée mensongère, objet absent, objet appartenant à un tiers
et contenu invalide sont refusés ; PDF/images valides passent ; un objet invalidé
n'est pas téléchargeable ; une intégration réelle MinIO démontre les limites annoncées.
Les fournisseurs factices seuls ne valident pas l'application des contraintes S3.

### Lot 6 — Qualité et exploitation

Fichiers : fichiers front corrigés, `tsconfig.app.json`, configurations ESLint,
`.github/workflows/web-ci.yml`, `api-ci.yml`, `deploy-vps.yml`, `deploy/vps/backup.sh`,
Compose, exemples de configuration, guides 04/07 et README concernés.

- Réduire les erreurs lint par module ; rendre les fichiers corrigés bloquants sans
  désactiver globalement les règles. Programmer le passage global à un lint bloquant
  après résorption des erreurs existantes. Le mode strict front est un chantier progressif.
- Ajouter les tests unitaires API à la CI, en complément des tests e2e existants.
- Sauvegarder les objets des trois buckets avec PostgreSQL, conserver un manifeste
  (date, version applicative, schéma, objets et empreintes), prévoir copie hors site,
  chiffrement, rétention et alerte en cas d'échec. Choisir et documenter RPO/RTO.
- Prévoir une sauvegarde cohérente SQL/objets pendant les écritures (versionnement ou
  fenêtre coordonnée), et restaurer sur une infrastructure isolée avant validation.
- Documenter comment les migrations sont appliquées à un volume existant et comment
  revenir à la version précédente sans supposer que les scripts d'initialisation rejouent.
- Compléter la recette après déploiement : santé, login/OTP, confidentialité RDV,
  renouvellement de session, temps réel, fichiers, paiement sandbox et cohérence ledger.

Acceptation : lint des modules corrigés et CI pertinents bloquants ; restauration
PostgreSQL + fichiers démontrée, références SQL résolubles, empreintes vérifiées ;
recette consignée et stratégie de retour arrière compatible avec les migrations.

## 4. Protocole de validation d'un lot

1. Exécuter les tests ciblés, puis les commandes existantes concernées :
   - Front : `npx tsc --noEmit -p tsconfig.app.json`, `npm test`, `npm run build`.
   - API depuis `api/` : `npm run typecheck`, `npm test -- --runInBand`,
     `npm run build`, `npm run test:e2e` sur la base dédiée.
   - Lint : `npm run lint` à la racine et résultat ciblé des fichiers modifiés.
2. Pour SQL/S3/Socket.IO, compléter avec les essais réels décrits dans le lot.
3. Vérifier les parcours des quatre rôles et les refus d'accès de tiers concernés.
4. Fournir une description du problème, du changement, des preuves et des limites.
5. Mettre à jour le suivi ci-dessous et les README/configurations si leur contrat change.

## 5. Suivi à maintenir par Claude Code

États : à faire → en cours → implémenté → validé. « Bloqué » doit préciser le prérequis.
Un lot peut être implémenté sans être validé ; une recette sandbox n'est pas une recette live.

| Lot | État | Preuve / commit | Commandes et résultats | Limites / prochaine action |
|---|---|---|---|---|
| 0 | Validé localement | PostgreSQL 16 dédié, port 5435 | Chargement des 5 SQL ; 85 tests existants réussis avant durcissement S3 | Aucun accès aux bases existantes |
| 1 | Validé localement | Tests de notes sentinelles | Liste/détail/confirmation/annulation/export ; accès praticien et refus tiers | Projection commune conservée |
| 2 | Validé localement | Fixtures suspendu/supprimé | OTP, refresh, login, gardes obligatoire et optionnelle | Verrouillage mot de passe distinct de la suspension |
| 3 | Validé localement | Requêtes concurrentes PostgreSQL | Refresh : un succès, famille révoquée ; reset/email : un consommateur | Web Locks entre onglets lorsqu'il est disponible |
| 4 | Validé localement | E2e Socket.IO + test unitaire LISTEN | Expiration, retrait de rôle, suspension, reconnexion ; aucun listener dupliqué | Réévaluation toutes les 5 s par défaut, hors durée des requêtes DB |
| 5 | Validé localement | MinIO réel + tests API | Taille signée, quarantaine, validation, publication stable et purge | Droits HEAD/GET/PUT/DELETE/LIST nécessaires |
| 6 | Partiel : sauvegarde/restauration validées localement **et en CI** ; lint global bloquant ; chaîne recette → production active depuis le 26/10 (`RECETTE_AUTO=true`, production redéployée au run 57) | `backup.sh`, `restore-check.sh`, `restore-drill.sh`, cible `backup` de `minio.Dockerfile` ; PR #122, #123, #124 | `backup-restore.yml` vert sur `main` (runs 9, 11 et 13 du 23/10) ; `npm run lint` = `eslint . --max-warnings 0`, 0 erreur, 0 avertissement ; `deploy-vps.yml` runs 37 à 47 `success` (§7) | Copie hors site et alerte à configurer dans le `.env` du VPS ; premier exercice sur la vraie sauvegarde à consigner ; RPO 24 h / RTO 4 h retenus (document 07 §13), durée réelle à mesurer par cet exercice ; `RECETTE_AUTO` à activer ; recette fonctionnelle (document 16 §4) à jouer |

## 6. Livraison applicative du 6 octobre 2026

Les corrections applicatives sont livrées sans migration SQL et sans modification
des dépendances ou des fichiers de verrouillage. Les contrats JSON/cookies/Bearer,
les routes, les chemins finaux S3 et les règles FedaPay sont conservés.

- Front : 25 tests, typecheck, build et lint `src/lib/api/ --max-warnings=0` réussis.
- API : 17 tests unitaires, typecheck et build réussis.
- Commit applicatif : `39c822f` (`fix: secure patient data sessions realtime and validated S3 uploads`).
- Intégration : 101 tests sur 10 suites réussis lors de la validation complète ;
  après les derniers ajustements, 25 tests ciblés réussis sur les 3 suites concernées,
  dont 4 essais MinIO réels. Les autres suites n’ont pas été modifiées.
- CI : tests unitaires API ajoutés, lint du socle front bloquant ; lint global
  historique toujours informatif. Suite S3 réelle optionnelle en CI, exécutée localement.
- Déploiement : workflow manuel existant, désormais épinglé au SHA de son lancement.
  **Non exécuté** : le contrôle automatique d'approbation a refusé le push direct
  vers `main`, au motif qu'une publication sur la branche par défaut sans revue
  n'était pas explicitement autorisée. Les corrections sont publiées sur
  `codex/security-review-20261006` pour PR et CI. La PR #82 a ensuite été fusionnée
  sur `main` (`4dbc588`) ; aucun déploiement VPS n'a été exécuté par ce chantier.
- Exploitation hors correctifs applicatifs : sauvegarde MinIO/hors site, restauration,
  choix RPO/RTO et résorption globale du lint restent à réaliser (lot 6).

Retour arrière applicatif : relancer la procédure de déploiement sur le commit
précédent avec l'entrée `revision` (SHA complet, ancêtre de `main`) du workflow actuel ;
aucune migration ne limite ce retour. Les objets déjà publiés et les
chemins historiques sont conservés. Des envois PUT commencés avant le déploiement
peuvent devoir être recommencés : les anciennes URLs n'utilisent pas la quarantaine.

Commits préparés : `ebb5f76` (plan et consignes), `39c822f` (correctifs applicatifs),
`aeb183c` (CI, suivi et déploiement épinglé). Le statut des contrôles GitHub reste
consultable dans la PR de la branche de correction ; seuls les contrôles locaux
ci-dessus sont déclarés réussis dans ce document.

## 7. Point du lot 6 — 24 octobre 2026

| Volet | État | Preuve | Reste |
|---|---|---|---|
| Lint | **Fait** | 45 avertissements hérités corrigés (document 15, « Avertissements lint ») ; `npm run lint` = `eslint . --max-warnings 0`, bloquant dans `web-ci.yml` | — |
| Tests unitaires API en CI | **Fait** | `api-ci.yml` (Jest unitaire, e2e PostgreSQL 16, `storage-s3` contre MinIO) | — |
| Sauvegarde et restauration | **Validé en CI**, pas sur le VPS | `backup-restore.yml` vert sur `main` les 23/10 (runs 9, 11, 13) ; procédure et RPO 24 h / RTO 4 h au document 07 §13 | copie hors site chiffrée et alerte (`.env` du VPS), premier exercice sur la vraie sauvegarde avec sa durée |
| Écriture de la version applicative dans la sauvegarde de recette | **Défaut relevé** | run 47 : `backups/.app-version: Permission denied` dans le clone de recette (message non bloquant prévu par le workflow) | droits du dossier `deploy/vps/backups` de la recette à aligner sur ceux de la production ; sans cela, le manifeste des sauvegardes de recette n'a pas la version |
| Chaîne de déploiement | **Active : fusions en recette, production à la main** (26/10) | #122, #123, #124. `deploy-vps.yml` : runs 37 à 46 `success` en production (conteneurs `vps-*`) ; run 47 du 24/10, cible `recette`, SHA `52e03ec`. **Écart constaté le 26/10** : les runs 48 à 55 (24 au 26/10, fusions #125 à #132), tous `success` avec la cible `production`, ont reconstruit les conteneurs `domicares-recette-*` (journaux des runs 48 et 55) : `VPS_APP_DIR` lu pour la production désignait le clone de recette. La production est restée à `52e03ec` (`git log` dans `/home/deploy/domicares`), le contrôle de santé passait sur l'ancienne version. `VPS_APP_DIR` de la production corrigé par l'équipe (`/home/deploy/domicares`). `RECETTE_AUTO` : d'abord créée en secret (non lue), puis en **variable** ; run 56 (fusion #133) : journal `RECETTE_AUTO=true`, `DEPLOY_TARGET: recette`. Run 57 du 26/10, `workflow_dispatch`, cible `production`, SHA `4bd6d71` validé en recette : `validation-recette` `success`, conteneurs `vps-api-1`, `vps-worker-1`, `vps-web-1`, `vps-postgres-1` recréés, santé 200 ; clone de production à `4bd6d71` | approbation obligatoire de l'environnement `production` à confirmer (document 16 §3, réglage 2) ; vérifier après chaque déploiement de production le clone servi (`git log` dans `/home/deploy/domicares`) et le mode FedaPay (§ incident ci-dessous) |
| Supervision | **Sondes externe et interne opérationnelles** (26/10) ; planification interne et alerte à confirmer | `deploy/vps/supervision.sh` et `supervision.yml` (#132). `supervision.yml` run 1 (26/10, SHA `8a92243`, `success`) : production → API et base OK, `/` 200, FedaPay `sandbox`, TLS 50 jours ; recette → API et base OK, `/` 401, TLS 87 jours. `supervision.sh interne` sur le VPS (26/10) : recette (`4bd6d71`) → 6 conteneurs, sauvegarde réussie il y a 8 h, aucun webhook en échec, 2 webhooks reçus sur 26 h, disque 12 % ; production (`4bd6d71`, après le run 57) → 7 conteneurs, sauvegarde il y a 3 h, aucun webhook en échec, disque 12 %. `SUPERVISION_ALERT_URL` (webhook Discord) renseignée dans le `.env` de production (vérifié par `grep`) et ajoutée à celui de la recette | lignes `crontab` (production et recette) et secret GitHub `SUPERVISION_ALERT_URL` non confirmés ; essai d'alerte réel (`docker compose stop worker`) à faire (document 07 §14) ; mode FedaPay de la recette non sondé |
| Recette fonctionnelle après déploiement | **À faire** | `staging.domicares.life` résout vers l'IP du VPS de production ; depuis l'environnement de développement, le proxy sortant refuse ce sous-domaine (502 du proxy) : santé, configuration FedaPay et `basic_auth` non vérifiés d'ici. Depuis un runner GitHub (`supervision.yml` run 1, 26/10) : santé de la recette OK et `/` → 401 sans identifiants ; configuration FedaPay de la recette toujours non vérifiée | dérouler le document 16 §4 depuis un poste autorisé : santé, `GET /api/payments/config` → `sandbox`, `/` → 401 sans identifiants, connexion, OTP, rendez-vous, fichiers, temps réel, campagne FedaPay et S13 |

Production au 24/10/2026 : `GET https://domicares.life/api/health` → `{"status":"ok","database":"ok"}`,
`GET /api/payments/config` → `environment: sandbox`.
Production au 26/10/2026 : mêmes réponses (`/api/health` ok, FedaPay `sandbox`), contrôlées par `supervision.yml` run 1.

**Incident du 26/10/2026 — clés FedaPay live actives environ 5 minutes.** Après le run 57 (fin
18:14 UTC), `GET /api/payments/config` répondait `environment: live`, clé `pk_live…`. Le code n'est
pas en cause (`FEDAPAY_MODE` lu dans `.env`, inchangé depuis #124) : le `.env` de production
contenait `FEDAPAY_MODE=live` et le jeu live, alors que les conteneurs, démarrés avant, tournaient
en sandbox ; la recréation par le déploiement a appliqué le fichier. Les sauvegardes `.env.bak-*`
montrent une bascule vers sandbox le 18/09 (sauvegarde de 23:59:57), puis un retour à `live` sans
sauvegarde, donc hors `fedapay-mode.sh` : origine non établie. Correctif : `./fedapay-mode.sh
sandbox` à 18:19 UTC (sauvegarde `.env.bak-20261026T181900Z`, conteneur api en sandbox, santé
ok) ; `/api/payments/config` → `sandbox` vérifié depuis l'extérieur à 18:20. Reste : contrôler
dans le tableau de bord FedaPay live l'absence de transaction entre 18:14 et 18:19 UTC ; vérifier
qu'une seule ligne `FEDAPAY_MODE=` subsiste dans `.env`. Prévention : passage en live uniquement
par `fedapay-mode.sh live` (document 16 §5.2) ; `supervision.yml` (`SUPERVISION_FEDAPAY_ENV=sandbox`)
signale désormais tout mode inattendu dans les 15 minutes.
