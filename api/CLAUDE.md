# API — consignes complémentaires

Les consignes de `../CLAUDE.md` s'appliquent. Voir `README.md` pour la configuration
de la base locale et les routes ; plan actif :
`../docs/migration-postgresql/10-PLAN-CORRECTIONS-REVUE.md`.

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

Étendre les suites existantes dans `test/` pour les règles d'accès et les transactions
réelles. Les tests de concurrence créés dans `test/security-regressions.e2e-spec.ts` et les
essais S3 isolés de `test/storage-s3.e2e-spec.ts` sont des références à conserver.
Les tests de concurrence doivent créer un recouvrement réel des requêtes,
pas seulement rejouer deux requêtes séquentielles.
Garder les tests unitaires dans `src/**/*.spec.ts`.
Une évolution SQL doit être applicable à une base déjà initialisée et testée aussi
sur une base neuve, avec mise à jour des scripts de génération, CI et documentation concernés.
