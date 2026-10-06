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
| [05-POINT-FONCTIONNEL.md](05-POINT-FONCTIONNEL.md) | Point d'alignement après l'étape 7 : ce qui est cohérent, les écarts restants (données, CI/CD, fichiers, rétention, infra) et les lots proposés avant la bascule |
| [06-INVENTAIRE-SUPABASE.md](06-INVENTAIRE-SUPABASE.md) | Inventaire réel des deux projets Supabase après réactivation (volumétrie, comptes, praticiens, fichiers, configuration, écart de schéma) et commandes d'export restantes |
| [07-INSTALLATION-VPS.md](07-INSTALLATION-VPS.md) | Installation du VPS pas à pas : clé SSH, dépendances, clé de déploiement GitHub, `.env`, DNS, démarrage de la pile, import des données, GitHub Actions, bascule, exploitation et dépannage |
| [08-REVUE-FEDAPAY.md](08-REVUE-FEDAPAY.md) | Revue de bout en bout de l'intégration FedaPay (client, webhooks, reversements, remboursements, réconciliation, front) : constats par sévérité avec fichier et ligne, écarts avec la documentation FedaPay, plan de correction en trois lots |
| [09-CAMPAGNE-SANDBOX.md](09-CAMPAGNE-SANDBOX.md) | Campagne de recette FedaPay en mode test avant tout paiement réel : bascule sandbox outillée, treize scénarios avec états attendus, commandes d'observation, tableau de résultats, retour en live |
| [10-PLAN-CORRECTIONS-REVUE.md](10-PLAN-CORRECTIONS-REVUE.md) | Plan du 06/10/2026 : confidentialité des rendez-vous, comptes et jetons, temps réel, fichiers, qualité et sauvegardes ; critères de validation et suivi Claude Code (lots applicatifs validés localement) |

## Outillage livré (testé)

Suivi actif : [11-CORRECTIONS-FONCTIONNEL-SECURITE-PWA.md](11-CORRECTIONS-FONCTIONNEL-SECURITE-PWA.md),
corrections après la nouvelle revue, avec validation et règles de cache PWA.

| Chemin | Rôle |
|---|---|
| `db/native/000_supabase_compat_shim.sql` | Émule `auth.*`, `storage.*`, rôles Supabase pour rejouer les migrations sur un Postgres vierge |
| `db/native/010_roles.sql` | Rôles `domicares_app`, `domicares_migrator`, `anon/authenticated/service_role` |
| `db/native/020_grants.sql` | Privilèges de `domicares_app` (à exécuter après `schema.native.sql`) |
| `db/native/100_to_native.sql` | Conversion : `public.users`, tokens, re-pointage des 31 FK, GUC `app.user_id`, suppression `storage`/`auth.users` |
| `db/native/110_realtime_notify.sql` | Triggers `pg_notify` sur les 10 tables suivies en temps réel par le front |
| `db/native/120_drop_rls_optional.sql` | Option B : retrait des 155 policies RLS (autorisation côté API) |
| `db/native/130_fixes_heritage.sql` | Corrections de défauts hérités (colonne `updated_at` de `practitioner_payouts`) |
| `db/native/schema.native.sql` | **Schéma natif consolidé, généré et validé** (58 tables, 5 vues, 46 fonctions, 24 triggers) |
| `scripts/db/build-native-schema.sh` | Regénère et valide `schema.native.sql` depuis `legacy/supabase/migrations` |
| `scripts/supabase/export-supabase.sh` | Export complet depuis Supabase (pg_dump public + auth + storage meta + comptages) |
| `scripts/supabase/export-storage.mjs` | Téléchargement de tous les fichiers des buckets Storage |
| `scripts/db/import-native.sh` | Import d'un export dans PostgreSQL natif + conversion + contrôle des comptages |
| `deploy/vps/` | `docker-compose.yml`, `caddy/Caddyfile`, Dockerfile front, sauvegarde, `install-vps.sh`, `.env.example` |
| `deploy/vps/preflight.sh` | Contrôle « le VPS est-il prêt ? » : outils, `.env`, pile docker, ressources, DNS, ports, export |
| `deploy/vps/bascule.sh` | Jour J : sauvegarde, import des données, fichiers vers MinIO, redémarrage, contrôle de santé |
| `deploy/vps/fedapay-mode.sh` | Bascule sandbox ⇄ live de FedaPay (deux jeux de clés dans `.env`), redémarrage et contrôle |
| `deploy/vps/fedapay-observe.sh` | État des paiements, reversements, remboursements, webhooks et soldes sans donnée personnelle |

Validation effectuée dans ce dépôt (PostgreSQL 16.13) : rejeu des 93 migrations, conversion,
export d'une base « Supabase simulée » puis import natif : comptages identiques, mots de passe
bcrypt toujours valides, 0 clé étrangère restante vers `auth.users`.

## Back-end natif (`api/`)

Étape 1 du chemin critique livrée : NestJS + Fastify + Kysely, authentification complète
(inscription, connexion, refresh tournant, OTP Twilio, e-mail de vérification, mots de
passe), `GET /api/auth/me` avec résolution de rôle identique au front, profil, garde
`@AdminOnly`, worker `LISTEN table_changes`. Étape 2 livrée : inscription praticien
atomique avec documents KYC, recherche de praticiens disponibles, disponibilités /
exceptions / tarifs, fichiers S3 (URLs pré-signées, journal d'accès), file KYC admin avec
notifications e-mail, SMS et in-app. Étape 3 livrée : rendez-vous (demande, réponse du
praticien avec demande de paiement ou réassignation, déroulement de la consultation),
paiements FedaPay (client réel ou factice, frais et commission, ledger en partie double),
webhook signé et idempotent, jobs planifiés dans le worker (expiration des créneaux,
confirmation automatique, resynchronisation et nettoyage des paiements). Étape 4 livrée :
messagerie liée aux rendez-vous (pièces jointes S3), notifications in-app avec préférences,
abonnements push Web (VAPID) et passerelle Socket.IO dans l'API qui relaie `LISTEN
table_changes` vers les rooms utilisateur / praticien / admin / rendez-vous (remplace Supabase
Realtime). Étape 5 livrée : séances de groupe des coachs (création, inscription avec paiement,
confirmation, annulation), finance (soldes recalculés, reversements individuels et par lots
avec FedaPay, webhooks de transfert, remboursements, libération des fonds, réconciliation,
rejeu des webhooks, rappels de paiement) et administration (rôles, utilisateurs, statistiques,
journal d'audit, activité de recherche, OTP, configuration, consentements, modération des
avis). Étape 6 livrée : support (tickets, FAQ versionnées), litiges avec SLA et fil de
messages, dossier médical (profil, contacts d'urgence, adresses, notes de soins SOAP, comptes
rendus avec lecture journalisée, triage calculé côté serveur, consentements versionnés, export
RGPD), avis avec note recalculée, moyens de paiement chiffrés côté serveur et statistiques des
tableaux de bord. Tests e2e sur base réelle (`.github/workflows/api-ci.yml`). Voir `api/README.md`.

## Recodage du front sur l'API (étape 7)

Étape 7a livrée : socle client dans `src/lib/api/` (`client.ts` fetch + rotation automatique du
refresh token, `session.ts` session locale et événements d'authentification, `auth.ts` ex
`supabase.auth.*`, `realtime.ts` Socket.IO ex Supabase Realtime, `files.ts` upload S3 pré-signé),
hook `useAuthUser` (ex `useSupabaseUser`), rôle résolu par `GET /api/auth/me`
(`userRoleResolver.ts`), routes protégées, pages de connexion / inscription / OTP / mot de passe /
confirmation d'e-mail, profil (adresses, contacts d'urgence, profil médical, avatar), onboarding
patient et notifications push. Étapes 7b et 7c livrées : hooks et écrans patient / praticien /
coach / paiements puis écrans admin recodés sur l'API, `src/integrations/supabase`,
`edge-function-retry.ts` et `@supabase/supabase-js` retirés (le dossier `supabase/` reste la
référence historique des migrations et Edge Functions ; les règles métier dupliquées côté client,
comme l'anti-chevauchement des créneaux ou les insertions manuelles dans `admin_audit_logs`, sont
désormais portées par l'API).

## Ordre de lecture recommandé

1. **Urgent** : §1 de `02-RECUPERATION…` — les deux projets Supabase sont en pause (`INACTIVE`).
2. `01-ETAT-DES-LIEUX` pour partager le même diagnostic avec l'équipe.
3. `03-RETRO-INGENIERIE` pour dimensionner le back-end à écrire.
4. `04-PLAN-EXECUTION-VPS` pour piloter le chantier.
