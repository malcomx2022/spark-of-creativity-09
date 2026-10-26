# 02 — DomiCares Academy : déploiement en préproduction et recette commune avec Akambi — 23 octobre 2026

Lot A8 du plan `01-FAISABILITE-INTEGRATION-AKAMBI.md`. Ce document décrit **ce qu'il faut faire**
pour activer l'Academy sur la préproduction DomiCares (`staging.domicares.life`) branchée sur la
préproduction Akambi (`https://preprod.akambiconsulting.com`), puis dérouler la grille de recette du
§ 10 du guide Akambi. Il n'autorise ni une activation en production, ni un paiement, ni un reset
distant : chaque étape sur le VPS est lancée par l'exploitant, après sauvegarde.

Les secrets (`apiKey`, `apiSecret`, `whsec_…`) ne sont jamais copiés dans le dépôt, un ticket, un
journal ou le navigateur : seulement dans `deploy/vps/.env` du VPS et, pour la campagne locale, dans
l'environnement du terminal.

## 1. Prérequis

| # | Prérequis | Qui | Preuve attendue |
|---|---|---|---|
| P1 | Postman : collection et environnement Akambi importés, `apiKey`/`apiSecret` renseignés, « 0. Démarrage > Vérifier l'authentification » ; ou `npm run akambi:ping` (document 03, § 2) | DomiCares | 200 avec `partner.code` (capture sans les en-têtes) |
| P2 | Préproduction DomiCares servie sur `https://staging.domicares.life` (document 07 de la migration) | DomiCares | `/api/health` 200, `preflight.sh` sans ✖ |
| P3 | Formation de test courte avec évaluation, dans la catégorie DomiCares | Akambi (§ 9, question 5) | visible dans `GET /courses` |
| P4 | Compte apprenant `EXISTING` de test (e-mail déjà connu d'Akambi) | Akambi | e-mail transmis hors dépôt |
| P5 | Arbitrages du § 10 du plan (coachs, inscription libre) | Gaillardo, Fawaz | décision écrite ; à défaut, valeurs par défaut du code (coachs exclus, inscription libre) |
| P6 | Horloge du VPS synchronisée (Akambi refuse ±5 min) | DomiCares | `timedatectl show -p NTPSynchronized --value` → `yes` |

## 2. Activation sur la préproduction DomiCares

Sur le VPS de préproduction, en tant que `deploy`, depuis `~/domicares/deploy/vps` :

```bash
# 1. Code à jour (contient les lots A1 à A8) et sauvegarde avant migration
cd ~/domicares && git pull && cd deploy/vps
docker compose exec backup sh /backup.sh          # sauvegarde immédiate (base + objets)

# 2. Tables academy_* sur la base déjà installée (le montage initdb ne joue que sur une base neuve)
docker compose exec -T postgres psql -U postgres -d domicares -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/28_academy.sql
docker compose exec -T postgres psql -U postgres -d domicares -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/30_grants.sql
```

Puis, dans `deploy/vps/.env` (valeurs réelles reçues d'Akambi, jamais versionnées) :

```dotenv
ACADEMY_ENABLED=true
AKAMBI_PROVIDER=akambi
AKAMBI_BASE_URL=https://preprod.akambiconsulting.com
AKAMBI_API_KEY=…
AKAMBI_API_SECRET=…
AKAMBI_WEBHOOK_SECRETS=whsec_…        # reçu après la déclaration de l'URL (§ 3) ; vide = webhooks en 503
```

```bash
# 3. Contrôle puis redéploiement (un restart ne recharge pas .env ; le front lit academyEnabled à l'exécution)
./preflight.sh                        # section 2 « Academy » et section 3 « tables academy_* » sans ✖
docker compose build api worker && docker compose up -d api worker
curl -s https://staging.domicares.life/api/config/public    # "academyEnabled":true
```

`preflight.sh` refuse (✖) une Academy activée avec le client factice, une URL non HTTPS, une clé ou
un secret absent, une horloge non synchronisée ou des tables manquantes ; il avertit (⚠) si l'URL
Akambi ne correspond pas à l'environnement (préproduction sur un domaine `staging.*`) ou si aucun
secret de webhook n'est renseigné.

Premières synchronisations (compte administrateur `super_admin` ou `ops`, onglet Academy, boutons
« Synchroniser le catalogue » et « Rapprocher les inscriptions », ou
`POST /api/admin/jobs/academy.catalog.sync/run` puis `…/academy.enrollments.reconcile/run`) :
l'état de chaque synchronisation est visible dans l'onglet, sans message d'Akambi (code seul).

## 3. Webhooks

1. Communiquer à Denis l'URL `https://staging.domicares.life/api/webhooks/akambi` (déjà proposée).
2. Reporter le `whsec_…` reçu dans `AKAMBI_WEBHOOK_SECRETS`, puis `docker compose up -d api`.
3. Demander un `webhook.test` : il doit apparaître dans `GET /api/admin/academy/webhook-events`
   (statut `ignored`, message « événement de test ») ; une signature fausse ou expirée répond 401
   sans écriture. L'onglet admin signale les événements en échec.
4. Rotation : pendant la période de double signature, renseigner les deux secrets séparés par une
   virgule (`whsec_nouveau,whsec_ancien`), puis retirer l'ancien.

## 4. Campagne automatisée (poste du développeur)

`api/test/campaign/akambi-preprod.campaign.ts` rejoue contre la préproduction Akambi les scénarios
de la grille qui ne demandent pas d'action humaine. Elle tourne sur une **base locale dédiée**
(jamais la base de la préproduction ou de la production : elle crée puis supprime ses comptes) et
crée de vrais apprenants et inscriptions de test chez Akambi (inscriptions annulées en fin de
campagne ; les comptes apprenants restent, faute de route de suppression).

```bash
cd api
AKAMBI_CAMPAIGN=preprod AKAMBI_API_KEY=… AKAMBI_API_SECRET=… \
  AKAMBI_CAMPAIGN_EXISTING_EMAIL=<compte EXISTING fourni par Akambi, optionnel> \
  DATABASE_URL=<base locale dédiée> JWT_ACCESS_SECRET=<secret de test> npm run campaign:akambi
```

Le mode `preprod` refuse toute autre URL que `https://preprod.akambiconsulting.com`.
`AKAMBI_CAMPAIGN=fake` rejoue le même harnais sur le client factice (validation de l'outil).
Le rapport est écrit dans `api/campaign-reports/akambi-<mode>-<date>.md` (ignoré par git) : statuts
et codes seulement, sans nom, e-mail ni lien. Le joindre au suivi du § 7 après relecture.

## 5. Grille de recette (guide Akambi § 10)

Résultat : `ok`, `ko` (avec code observé) ou `n/a` (avec motif). « Auto » = couvert par la campagne
du § 4 ; « Manuel » = à faire dans un navigateur sur `https://staging.domicares.life`.

| # | Scénario | Mode | Attendu | Résultat | Preuve |
|---|---|---|---|---|---|
| R0 | Authentification (ping) | Auto | 200, `partner.code` | | |
| R0b | Signature fausse, nonce rejoué, horodatage à 400 s | Auto | 401 `INVALID_SIGNATURE`, `REPLAYED_REQUEST`, `TIMESTAMP_OUT_OF_RANGE` | | |
| R1 | Catalogue privé | Auto + Manuel | seules les formations DomiCares listées ; formation hors catalogue 404 | | |
| R2 | Compte apprenant créé | Auto | `linked`, `CREATED` | | |
| R2b | Compte existant | Auto (avec P4) + Manuel | `EXISTING` ; accès en `LOGIN_REQUIRED`, message affiché au praticien | | |
| R3 | Inscription répétée | Auto | 201 puis 200, même inscription ; Akambi renvoie le même identifiant | | |
| R4 | Accès au cours | Auto | 200, lien de 5 min, `Cache-Control: no-store` | | |
| R4b | Bon praticien, bonne formation ; lien réutilisé ou expiré refusé | Manuel | navigation dans le même onglet (Safari iOS compris) ; second usage refusé par Akambi | | |
| R5 | Progression et achèvement | Manuel | progression visible dans « Mes formations » après webhook ou rapprochement ; notification à l'achèvement | | |
| R6 | Webhook répété ou hors ordre | Manuel (Akambi) | doublon acquitté (`duplicate`), ancien état ignoré | | |
| R7 | Attestation | Manuel | évaluation ≥ 80 %, notification, lien de vérification public, PDF redemandé à chaque clic | | |
| R8 | Coupure réseau : même clé, aucun doublon | Auto | même identifiant rejoué ; autre corps 422 `IDEMPOTENCY_KEY_REUSED` | | |
| R9 | Isolation du partenariat | Auto | identifiant étranger 404 ; à confirmer avec un identifiant réel d'un autre partenaire | | |
| R10 | Indicateurs et désinscription | Auto + Manuel | rapports 200 ; désinscription admin journalisée ; attestation délivrée non désinscriptible | | |
| R11 | Accès refusé | Manuel | patient, coach (selon P5), KYC non approuvé, e-mail non vérifié : onglet absent ou motif affiché, 403 | | |
| R12 | Affichage mobile | Manuel | onglet Academy à 320/390 px sans débordement ; Safari sur iPhone réel (document 12) | | |

## 6. Critères de décision

**Recette réussie** quand R0 à R10 sont `ok` (R2b et R9 peuvent rester `n/a` faute de données de
test, avec motif), R11 et R12 `ok`, aucun événement `failed` inexpliqué dans l'onglet admin, et
aucune donnée personnelle ni lien d'accès dans les journaux de l'API
(`docker compose logs api | grep -i akambi` : méthode, chemin et code seulement).

**Retour arrière**, dans cet ordre :

1. `ACADEMY_ENABLED=false` puis `docker compose up -d api worker` : onglets masqués, routes en 503,
   jobs sans effet, données conservées. C'est la mesure par défaut en cas d'incident.
2. Seulement si les tables doivent disparaître (après sauvegarde, et en sachant que les
   correspondances avec Akambi sont perdues) :
   `docker compose exec -T postgres psql -U postgres -d domicares -v ON_ERROR_STOP=1 < ../../db/native/rollback/140_academy.down.sql`.

## 7. Passage en production (hors lot A8)

Prérequis : recette du § 5 signée par DomiCares et Akambi ; identifiants de production émis par
Akambi (§ 9, question 10) ; nouvelle URL de webhook `https://domicares.life/api/webhooks/akambi` et
son secret ; arbitrages du § 10 du plan tranchés ; indicateurs validés. Même procédure qu'au § 2
avec `AKAMBI_BASE_URL=https://www.akambiconsulting.com` et les clés de production — jamais les clés
de préproduction. `preflight.sh` avertit si l'URL de préproduction reste sur un domaine de production.

## 8. Suivi de la recette

| Date | Étape | Résultat | Preuve |
|---|---|---|---|
| 23 octobre 2026 | Harnais de campagne en mode `fake` sur PostgreSQL 16 local | 9/9 scénarios exécutés | rapport `akambi-fake-…` (R0b, R2b, R6 non couverts en `fake` ; R4b, R5, R7 manuels) |
| — | P1 ping Postman | à faire | |
| — | § 2 activation préproduction | à faire | |
| — | § 3 `webhook.test` | à faire | |
| — | § 4 campagne `preprod` | à faire | |
| — | § 5 parcours manuels | à faire | |
