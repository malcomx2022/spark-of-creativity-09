# Domicares — consignes pour Claude Code

## Références et périmètre

Lire `README.md`, puis les consignes du dossier modifié : `api/CLAUDE.md`,
`src/CLAUDE.md`, `deploy/vps/CLAUDE.md`.
Le chantier actif est décrit dans
`docs/migration-postgresql/10-PLAN-CORRECTIONS-REVUE.md` (6 octobre 2026).
Ce plan est préparé ; les corrections ne sont pas encore implémentées.

Les demandes explicites de l'utilisateur priment sur ces consignes. Respecter les
modifications locales et limiter chaque changement au lot demandé.

## Architecture à préserver

- Front React 18 / Vite / TanStack Query / Tailwind dans `src/`.
- API NestJS 11 / Fastify / Kysely et worker dans `api/` ; PostgreSQL 16 natif.
- S3 compatible, Socket.IO et relais PostgreSQL LISTEN/NOTIFY ; Docker Compose + Caddy.
- Autorisations portées par les services et gardes. `DatabaseService.runAs` définit
  le contexte SQL ; il ne remplace pas les contrôles d'appartenance.
- `legacy/supabase/` et `docs/archive/` sont des références historiques. Ne pas
  réintroduire Supabase/Lovable, Redis ou une autre pile pour ce chantier.
- Conserver les routes, structures de réponse, règles métier, chemins de stockage,
  résolution des rôles et mécanismes FedaPay existants, sauf évolution explicitement
  décrite et testée. Retirer les données confidentielles des réponses concernées.

## Méthode de correction

1. Lire le lot et les tests existants ; reproduire le défaut sur des données de test.
2. Corriger dans le module propriétaire, sans refonte générale ni duplication métier.
3. Ajouter les tests de sécurité, concurrence ou intégration indiqués dans le plan.
4. Exécuter les contrôles pertinents ; signaler les prérequis indisponibles comme tels.
5. Mettre à jour la ligne du lot avec preuve, commande, résultat et commit lorsqu'il existe.
   Ne pas marquer « validé » une vérification simplement prévue ou inaccessible.

Ne pas modifier à la main uniquement `db/native/schema.native.sql` : toute évolution
SQL doit disposer d'une source reproductible et d'une procédure pour une base existante.
Ne pas toucher aux secrets, exports de données ou archives. Une correction locale
ne constitue pas une instruction de déploiement ou de paiement réel.

## Vérifications

- Front : `npx tsc --noEmit -p tsconfig.app.json`, `npm test`, `npm run build`, `npm run lint`.
- API (dans `api/`) : `npm run typecheck`, `npm test -- --runInBand`, `npm run build`,
  `npm run test:e2e` sur une base de développement dédiée.
- Ne pas utiliser une base de production pour les tests e2e : ils créent et suppriment des données.
- Respecter `08-REVUE-FEDAPAY.md` et `09-CAMPAGNE-SANDBOX.md` pour les parcours financiers.
