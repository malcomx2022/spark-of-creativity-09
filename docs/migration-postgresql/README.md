# Migration Domicares : Supabase → PostgreSQL natif → VPS

Dossier de référence du chantier « sortir de Lovable/Supabase et ré-héberger Domicares
sur un VPS avec une base PostgreSQL native ». Il complète (et rend exécutable) le dossier
de refonte `docs/refactor/Domicares-Refonte-PG-Flutter.docx`, dont il reprend les choix
d'architecture (NestJS + PostgreSQL 16 + Redis + S3).

| Document | Contenu |
|---|---|
| [01-ETAT-DES-LIEUX.md](01-ETAT-DES-LIEUX.md) | Inventaire exact du projet (front, base, Edge Functions, services tiers), constats et risques |
| [02-RECUPERATION-DONNEES-SUPABASE.md](02-RECUPERATION-DONNEES-SUPABASE.md) | Procédure d'extraction complète : schéma, données, comptes (avec mots de passe), fichiers, secrets |
| [03-RETRO-INGENIERIE.md](03-RETRO-INGENIERIE.md) | Cartographie de tout ce qui dépend de Supabase et sa cible native (auth, RLS, functions, realtime, storage, front) |
| [04-PLAN-EXECUTION-VPS.md](04-PLAN-EXECUTION-VPS.md) | Plan phasé jusqu'à la mise en production sur VPS, bascule, rollback, exploitation |

## Outillage livré (testé)

| Chemin | Rôle |
|---|---|
| `db/native/000_supabase_compat_shim.sql` | Émule `auth.*`, `storage.*`, rôles Supabase pour rejouer les migrations sur un Postgres vierge |
| `db/native/010_roles.sql` | Rôles `domicares_app`, `domicares_migrator`, `anon/authenticated/service_role` |
| `db/native/020_grants.sql` | Privilèges de `domicares_app` (à exécuter après `schema.native.sql`) |
| `db/native/100_to_native.sql` | Conversion : `public.users`, tokens, re-pointage des 31 FK, GUC `app.user_id`, suppression `storage`/`auth.users` |
| `db/native/110_realtime_notify.sql` | Triggers `pg_notify` sur les 10 tables suivies en temps réel par le front |
| `db/native/120_drop_rls_optional.sql` | Option B : retrait des 155 policies RLS (autorisation côté API) |
| `db/native/schema.native.sql` | **Schéma natif consolidé, généré et validé** (58 tables, 5 vues, 46 fonctions, 24 triggers) |
| `scripts/db/build-native-schema.sh` | Regénère et valide `schema.native.sql` depuis `supabase/migrations` |
| `scripts/supabase/export-supabase.sh` | Export complet depuis Supabase (pg_dump public + auth + storage meta + comptages) |
| `scripts/supabase/export-storage.mjs` | Téléchargement de tous les fichiers des buckets Storage |
| `scripts/db/import-native.sh` | Import d'un export dans PostgreSQL natif + conversion + contrôle des comptages |
| `deploy/vps/` | `docker-compose.yml`, `Caddyfile`, Dockerfile front, sauvegarde, `install-vps.sh`, `.env.example` |

Validation effectuée dans ce dépôt (PostgreSQL 16.13) : rejeu des 93 migrations, conversion,
export d'une base « Supabase simulée » puis import natif : comptages identiques, mots de passe
bcrypt toujours valides, 0 clé étrangère restante vers `auth.users`.

## Back-end natif (`api/`)

Étape 1 du chemin critique livrée : NestJS + Fastify + Kysely, authentification complète
(inscription, connexion, refresh tournant, OTP Twilio, e-mail de vérification, mots de
passe), `GET /api/auth/me` avec résolution de rôle identique au front, profil, garde
`@AdminOnly`, worker `LISTEN table_changes`. Tests e2e sur base réelle
(`.github/workflows/api-ci.yml`). Voir `api/README.md`.

## Ordre de lecture recommandé

1. **Urgent** : §1 de `02-RECUPERATION…` — les deux projets Supabase sont en pause (`INACTIVE`).
2. `01-ETAT-DES-LIEUX` pour partager le même diagnostic avec l'équipe.
3. `03-RETRO-INGENIERIE` pour dimensionner le back-end à écrire.
4. `04-PLAN-EXECUTION-VPS` pour piloter le chantier.
