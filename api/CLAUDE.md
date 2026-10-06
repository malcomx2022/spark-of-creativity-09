# API — consignes complémentaires

Les consignes de `../CLAUDE.md` s'appliquent. Voir `README.md` pour la configuration
de la base locale et les routes ; plan actif :
`../docs/migration-postgresql/11-CORRECTIONS-FONCTIONNEL-SECURITE-PWA.md`.

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
  avec contenu générique sans données médicales.
- Pagination : scope utilisateur/vue et masquage des notes, total sur le même périmètre.
- Validation courante : 31 tests unitaires et 105 tests d'intégration, dont 4 essais MinIO réels.

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
