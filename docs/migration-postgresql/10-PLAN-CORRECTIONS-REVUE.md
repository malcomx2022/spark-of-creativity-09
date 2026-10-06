# 10 — Plan de correction après revue du projet

Date : 6 octobre 2026. Base examinée : `d998e78732b9b94a1cee73800fc8497914076ed0`.
Statut : **plan préparé ; corrections non implémentées**.

## 1. Objectif et continuité des travaux

Corriger les défauts de confidentialité et de sessions dans l'architecture Domicares
existante. Conserver le code livré, ses modules, contrats et règles métier ; apporter
des modifications ciblées accompagnées de preuves. Ce chantier complète les lots
A à D du document 05 et les corrections FedaPay du document 08 sans les rouvrir.
La campagne sandbox du document 09 reste nécessaire pour valider le fournisseur réel.

Consignes Claude Code : `../../CLAUDE.md`, `../../api/CLAUDE.md`,
`../../src/CLAUDE.md`, `../../deploy/vps/CLAUDE.md`.
Aucun de ces fichiers n'existait dans la version examinée ; ils ont été ajoutés pour ce chantier.

Les constats de code ci-dessous sont issus d'une lecture statique. Les scénarios de
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
| 0 — Base et reproduction | Préparation | Aucune | À faire |
| 1 — Confidentialité des rendez-vous | Haute | 0 | À faire |
| 2 — État des comptes et sessions | Haute | 0 | À faire |
| 3 — Atomicité des jetons | Haute | 0, coordination avec 2 | À faire |
| 4 — Cycle de vie temps réel | Moyenne | 2 et 3 | À faire |
| 5 — Validation des fichiers | Moyenne | 0 | À faire |
| 6 — Qualité, sauvegardes et recette | Moyenne | 1 à 5 pour la recette finale | À faire |

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
| 0 | À faire | — | Référence §2 | Démarrer PostgreSQL de test |
| 1 | À faire | — | — | Reproduire la fuite des notes |
| 2 | À faire | — | — | Fixtures suspendu/supprimé |
| 3 | À faire | — | — | Reproduction concurrente et coordination onglets |
| 4 | À faire | — | — | Définir le délai de retrait des droits |
| 5 | À faire | — | — | Démontrer les contraintes avec MinIO |
| 6 | À faire | — | — | Choisir RPO/RTO et stockage hors site |

Le présent changement livre uniquement le plan, les consignes Claude Code et les
liens documentaires. Il n'applique aucune migration ni correction applicative.
