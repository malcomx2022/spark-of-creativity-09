# Domicares

Plateforme de soins à domicile (patients, praticiens, coachs sportifs, administration) :
recherche de praticiens, rendez-vous, paiements FedaPay, séances de groupe, messagerie,
dossier médical, support et back-office.

## Architecture

| Composant | Technologie | Dossier |
|---|---|---|
| Front web (SPA) | Vite, React, TanStack Query, Tailwind, Socket.IO client | `src/` |
| API et worker | NestJS 11 (Fastify), Kysely, Socket.IO, jobs planifiés | `api/` |
| Base de données | PostgreSQL 16, schéma natif consolidé | `db/native/` |
| Stockage de fichiers | S3 compatible (MinIO sur le VPS, Wasabi possible) | `api/src/storage` |
| Déploiement | Docker Compose + Caddy (TLS automatique) | `deploy/vps/` |

Le front ne parle qu'à l'API (`VITE_API_URL`, défaut `/api`) et au WebSocket Socket.IO
(`VITE_WS_URL`, défaut même origine). Le projet ne dépend plus de Supabase ni de Lovable :
le dossier `legacy/supabase/` conserve les migrations et Edge Functions de l'ancienne
plateforme comme seule référence de la migration (source de `scripts/db/build-native-schema.sh`),
exclu des images Docker et de la CI.

## Démarrer en local

1. **Base** : créer une base PostgreSQL 16 et charger, dans l'ordre, `db/native/010_roles.sql`,
   `schema.native.sql`, `120_drop_rls_optional.sql`, `130_fixes_heritage.sql`, `020_grants.sql`
   (voir `api/README.md`, « Démarrer en local »).
2. **API** : `cd api && cp .env.example .env && npm ci && npm run start:dev` (fournisseurs
   `console` / `fake` par défaut ; documentation Swagger sur `/api/docs`).
3. **Front** : à la racine, `cp .env.example .env && npm ci && npm run dev`. Le serveur Vite
   proxyfie `/api` et `/socket.io` vers `VITE_DEV_API_TARGET` (`http://localhost:3000`).

## Vérifications

| Commande | Rôle |
|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | Typecheck du front |
| `npm test` | Tests Vitest du front |
| `npm run build` | Build de production Vite |
| `cd api && npm run typecheck && npm run test:e2e` | Typecheck et tests e2e de l'API (base réelle) |

CI : `.github/workflows/web-ci.yml` (front), `api-ci.yml` (API), `deploy-vps.yml` (déploiement).

## Documentation

- `CLAUDE.md` et les consignes locales `api/CLAUDE.md`, `src/CLAUDE.md`,
  `deploy/vps/CLAUDE.md` : conventions et continuité du travail avec Claude Code.
- `docs/migration-postgresql/10-PLAN-CORRECTIONS-REVUE.md` : plan de correction
  de la revue du 6 octobre 2026, critères de validation et suivi (non implémenté).
- `docs/migration-postgresql/` : état des lieux, récupération des données Supabase,
  rétro-ingénierie, plan d'exécution VPS, point fonctionnel d'alignement, et
  `07-INSTALLATION-VPS.md` (installation et déploiement du VPS pas à pas).
- `api/README.md` : table des routes de l'API (et ce qu'elles remplacent), jobs, configuration.
- `docs/archive/` : documents de l'ère Lovable / Supabase, conservés pour l'historique.
