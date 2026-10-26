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

Prérequis : Node 22.12+ (branche 22). Front : Vite 7, React Router 7 et Tailwind 4.
Voir [le suivi sécurité, responsive et PWA](docs/migration-postgresql/11-CORRECTIONS-FONCTIONNEL-SECURITE-PWA.md).

1. **Base** : créer une base PostgreSQL 16 et charger, dans l'ordre, `db/native/010_roles.sql`,
   `schema.native.sql`, `120_drop_rls_optional.sql`, `130_fixes_heritage.sql`, `140_academy.sql`, `020_grants.sql`
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
  de la revue du 6 octobre 2026, corrections applicatives validées localement,
  critères de validation et suivi de livraison.
- `docs/migration-postgresql/15-REVUE-FINALISATION.md` : revue de finalisation du
  22 octobre 2026 (résultats des tests, listing des modules, reste à faire).
- `docs/migration-postgresql/` : état des lieux, récupération des données Supabase,
  rétro-ingénierie, plan d'exécution VPS, point fonctionnel d'alignement, et
  `07-INSTALLATION-VPS.md` (installation et déploiement du VPS pas à pas).
- `docs/academy/01-FAISABILITE-INTEGRATION-AKAMBI.md` : faisabilité et plan d'intégration de
  DomiCares Academy avec l'API partenaires Akambi v1 (23 octobre 2026) et suivi des lots A1 à A8 ;
  `docs/academy/02-RECETTE-PREPRODUCTION.md` : activation en préproduction et recette commune ;
  `docs/academy/03-LOT-A0-ECHANGES-ET-ARBITRAGES.md` : identifiants, message à Akambi, arbitrages.
- `api/README.md` : table des routes de l'API (et ce qu'elles remplacent), jobs, configuration.
- `docs/archive/` : documents de l'ère Lovable / Supabase, conservés pour l'historique.
- `promo/digisante-mobile/README.md` : vidéo promotionnelle DigiSanté Mobile (45 s, verticale),
  scénario, sous-titres et script de montage FFmpeg reproductible.
