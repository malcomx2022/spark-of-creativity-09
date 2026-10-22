# API — consignes complémentaires

Les consignes de `../CLAUDE.md` s'appliquent. Voir `README.md` pour la configuration
de la base locale et les routes ; plan actif :
`../docs/migration-postgresql/14-CORRECTIONS-TROIS-PARCOURS.md`.

- Contact : CONTACT_RECIPIENT_EMAIL choisit le destinataire fixe côté serveur ;
  absent = HTTP 503, sans bloquer le démarrage. Valider les champs, échapper le HTML,
  limiter à 5 POST/IP/heure et attendre le fournisseur avant accepted=true.
  `reply_to` = visiteur, objet « DomiCares — contact : <sujet> » sur une ligne, identifiant Resend
  journalisé (sans donnée du visiteur) ; réception réelle vérifiée par `deploy/vps/contact-check.sh`.
- Notifications de message : destination selon le participant (patient/praticien/coach).
  GET /conversations/:appointmentId exige l'appartenance, sans exception admin implicite.

## Conventions à conserver

- Garder les modules NestJS, DTO Zod, `ZodValidationPipe`, erreurs HTTP et types Kysely.
- Garder TypeScript strict. Préférer les types existants aux casts `any` ou `never`.
- Vérifier l'appartenance et le rôle dans chaque opération concernée ; le contexte
  `service_role` n'autorise pas à exposer une ligne complète à son appelant.
- Conserver les cookies, clients mobiles Bearer, OTP Twilio, hash bcrypt migrés et
  refresh tokens opaques hashés. Ne pas déplacer les rôles de confiance dans les métadonnées utilisateur.
- Conserver la signature sur le corps brut, l'idempotence des webhooks, le ledger,
  les retenues et la réconciliation FedaPay. Les tests utilisent les fournisseurs factices.

## Corrections implémentées et points à préserver

- Lot 1 : projection des rendez-vous selon l'appelant, sur lectures et mutations.
- Lot 2 : contrôle commun de compte actif avant émission des sessions ; vérifier
  les gardes HTTP/Socket.IO selon la politique de suspension décrite dans le plan.
- Lot 3 : consommation atomique des refresh tokens et jetons à usage unique.
  Attention : une exception dans `runAs` annule les écritures de sa transaction ;
  préserver la révocation de famille en cas de réutilisation sans transaction imbriquée bloquante.
- Lot 4 : expiration des sockets, réévaluation des droits, nettoyage des timers et
  listener LISTEN unique après reconnexion.
- Lot 5 : vérifier le contenu réellement stocké, son propriétaire et sa taille ;
  une taille déclarée par le navigateur ne constitue pas une preuve.

## Validation et suivi

- Tentatives de connexion : incrémentation SQL atomique et verrouillage dans la même écriture ;
  conserver le limiteur IP des routes publiques d'authentification et ses réponses 429.
- Push : autoriser les destinations à l'inscription ET avant envoi des anciennes lignes,
  avec contenu générique sans données médicales. Le clic ouvre la page de la notification
  (`pushTargetPath` : /dashboard, /dashboard/<rôle>, /admin ; sinon /login), revérifiée par `public/sw.js`.
  E-mail de notification : `notificationEmail` (URL absolue FRONTEND_URL + chemin autorisé, message échappé).
  Paire VAPID vérifiée au démarrage (`vapidKeyError` : push coupé, pas de crash) ; envoi `urgency: high` ;
  `POST /api/push/test` (authentifié, 5/10 min) n'envoie qu'aux appareils de l'appelant.
- Pagination : scope utilisateur/vue et masquage des notes, total sur le même périmètre.
- Validation courante : 63 tests unitaires et 126 tests d'intégration, dont 4 essais MinIO réels
  (document 15 : 126/126 sur PostgreSQL 16 et MinIO locaux ; MinIO compilé depuis son commit en CI,
  `S3_TEST_REQUIRED=1` interdit le saut silencieux de la suite S3).
- Nettoyage des comptes hors test : refusé en production (403) dans `AdminService` ; ne pas retirer cette garde.
  Chaque compte est purgé dans un point de sauvegarde : un échec SQL ne doit pas annuler les autres.
- Changement de mot de passe : révoque les autres sessions, conserve la famille du refresh token
  courant (corps ou cookie).
  Toute révocation globale prend `lockUserSessions` (verrou par utilisateur, aussi pris par refresh
  après le verrou de famille) ; ne pas inverser cet ordre.
  La déconnexion d'un appareil révoque la famille du jeton sous le verrou de famille de refresh.
- Exceptions de planning publiques : `reason` réservé au praticien propriétaire (null sinon).
- Liens de notification : chemins du front existants (`/dashboard/<rôle>?tab=…`) ; note de soin → `CARE_NOTE_LINK`.
- Aucune `.catch()` sur une requête SQL dans une transaction sans savepoint :
  PostgreSQL convertit alors le COMMIT en ROLLBACK silencieux (cas corrigé du partage de note de soin).

Étendre les suites existantes dans `test/` pour les règles d'accès et les transactions
réelles. Les tests de concurrence créés dans `test/security-regressions.e2e-spec.ts` et les
essais S3 isolés de `test/storage-s3.e2e-spec.ts` sont des références à conserver.
Les tests de concurrence doivent créer un recouvrement réel des requêtes,
pas seulement rejouer deux requêtes séquentielles.
Garder les tests unitaires dans `src/**/*.spec.ts`.
Une évolution SQL doit être applicable à une base déjà initialisée et testée aussi
sur une base neuve, avec mise à jour des scripts de génération, CI et documentation concernés.

Le lint global du dépôt couvre aussi l'API active et devient bloquant en CI web.
Le listener LISTEN conserve un objet de connexion capturé par son callback :
préserver la protection contre les callbacks d'anciennes connexions, y compris
avant que la nouvelle connexion ne soit affectée. Ses tests unitaires doivent passer.
