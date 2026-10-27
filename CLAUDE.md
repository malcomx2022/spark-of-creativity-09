# Domicares — consignes pour Claude Code

## Références et périmètre

Lire `README.md`, puis les consignes du dossier modifié : `api/CLAUDE.md`,
`src/CLAUDE.md`, `deploy/vps/CLAUDE.md`.
Le chantier actif est décrit dans
`docs/migration-postgresql/14-CORRECTIONS-TROIS-PARCOURS.md` (7 octobre 2026).
Le document 12 conserve les validations lint et Safari/iOS.
Le document 11 conserve les corrections fonctionnelles, sécurité, responsive et PWA.
Le document 10 conserve le suivi des protections initiales et des travaux d'exploitation.
Les lots applicatifs 1 à 5 sont implémentés et validés localement. Le suivi du
document 10 distingue les contrôles CI, la livraison et les travaux d’exploitation restants.

**État au 27 octobre 2026 : projet en phase de validation.** Les données réelles sont importées
dans le PostgreSQL du VPS (import validé par l'équipe), la production tourne sur la pile native et
FedaPay reste en sandbox jusqu'à l'ouverture des paiements réels (document 16, §5.2). Les projets
Supabase et Lovable sont **supprimés** (archive finale chiffrée conservée hors dépôt). Le suivi
de la validation et de la mise en exploitation est au document 16, §6, et au document 10, §7.

Les demandes explicites de l'utilisateur priment sur ces consignes. Respecter les
modifications locales et limiter chaque changement au lot demandé.

## Architecture à préserver

- Front React 18 / Vite 7 / React Router 7 / TanStack Query / Tailwind 4 dans `src/`.
- API NestJS 11 / Fastify / Kysely et worker dans `api/` ; PostgreSQL 16 natif.
- S3 compatible, Socket.IO et relais PostgreSQL LISTEN/NOTIFY ; Docker Compose + Caddy.
- Autorisations portées par les services et gardes. `DatabaseService.runAs` définit
  le contexte SQL ; il ne remplace pas les contrôles d'appartenance.
- `legacy/supabase/`, `scripts/supabase/` et `docs/archive/` sont des archives en lecture
  seule : Supabase et Lovable n'existent plus (projets supprimés le 27/10/2026), leurs URL, clés
  et fonctions ne répondent plus. Ne pas les citer comme source de vérité ni comme repli ; la
  référence est le code de `api/`, `src/` et `db/native/`. Ne pas réintroduire Supabase/Lovable,
  Redis ou une autre pile.
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

Utiliser Node 22.12+ (branche 22), `npm ci` et les overrides versionnés. Ne pas
réintroduire une dépendance vulnérable pour éviter une adaptation de code.

- Front : `npx tsc --noEmit -p tsconfig.app.json`, `npm test`, `npm run build`, `npm run lint`.
- API (dans `api/`) : `npm run typecheck`, `npm test -- --runInBand`, `npm run build`,
  `npm run test:e2e` sur une base de développement dédiée.
- Ne pas utiliser une base de production pour les tests e2e : ils créent et suppriment des données.
- Respecter `08-REVUE-FEDAPAY.md` et `09-CAMPAGNE-SANDBOX.md` pour les parcours financiers.
