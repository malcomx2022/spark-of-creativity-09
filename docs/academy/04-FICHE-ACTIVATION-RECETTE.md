# 04 — Fiche d'activation de l'Academy sur la recette — 12 novembre 2026

Fiche d'exécution du § 2 et du § 3 du document 02, adaptée à la recette installée sur le VPS de
production (document 16 de la migration, § 2.6 : clone `~/domicares-recette`, projet Compose
`domicares-recette`). Chaque étape donne **où** la lancer, la commande, le **résultat attendu** et
quoi consigner. Elle n'active rien en production.

Conventions :

- **[VPS recette]** : `ssh` en `deploy`, puis `cd ~/domicares-recette/deploy/vps`. **Jamais**
  `~/domicares` : ce clone est celui de la production.
- **[navigateur]** : `https://staging.domicares.life` avec un compte administrateur de recette.
- Ne jamais coller la clé, le secret ou le `whsec_…` dans un ticket, une PR, un e-mail ou une
  conversation. Consigner seulement les résultats (✔, ✖, codes, nombres).

État de départ (12/11/2026) : recette à `bd9cd80`, identifiants de préproduction vérifiés par
`akambi-ping` (document 03, § 6), catalogue Akambi vide, secret de webhook pas encore reçu.

L'activation se fait en **deux phases** :

| Phase | Quand | Effet |
|---|---|---|
| A | dès maintenant | Academy active sur la recette : catalogue, inscriptions, accès ; webhooks en 503 (rapprochement horaire seul) |
| B | à réception du `whsec_…` | webhooks Akambi acceptés, puis `webhook.test` |

## 0. Préparation

**[VPS recette]**

```bash
cd ~/domicares-recette/deploy/vps && pwd && git log --oneline -1
```

Attendu : `/home/deploy/domicares-recette/deploy/vps` et `bd9cd80` (ou un SHA plus récent de
`main`). Si le chemin contient `~/domicares/deploy/vps` sans `-recette` : **arrêter**.

```bash
grep -E '^(COMPOSE_PROJECT_NAME|DOMAIN|FEDAPAY_MODE)=' .env
```

Attendu : `COMPOSE_PROJECT_NAME=domicares-recette`, `DOMAIN=staging.domicares.life`,
`FEDAPAY_MODE=sandbox`.

```bash
timedatectl show -p NTPSynchronized --value
```

Attendu : `yes` (Akambi refuse les requêtes décalées de plus de 5 minutes).

## 1. Sauvegarde de la base de recette

```bash
docker compose exec backup sh /backup.sh && ls -lt backups | head -5
```

Attendu : une nouvelle archive datée d'aujourd'hui en tête de liste. Consigner son nom.

## 2. Tables `academy_*`

Le fichier `db/native/140_academy.sql` est monté dans le conteneur PostgreSQL sous
`/docker-entrypoint-initdb.d/28_academy.sql`. Il ne s'exécute seul que sur une base neuve. La
recette, créée le 24/10, l'a donc probablement déjà : vérifier d'abord.

```bash
docker compose exec -T postgres sh -c 'psql -U postgres -d "$POSTGRES_DB" -Atc "select count(*) from information_schema.tables where table_schema = '\''public'\'' and table_name like '\''academy\_%'\''"'
```

- `6` : tables présentes, passer à l'étape 3.
- `0` (ou moins de 6) : appliquer le schéma puis les droits. Le fichier est idempotent et ne touche
  aucune table existante.

```bash
docker compose exec -T postgres sh -c 'psql -U postgres -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/28_academy.sql'
```

```bash
docker compose exec -T postgres sh -c 'psql -U postgres -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/30_grants.sql'
```

Attendu : `COMMIT` sans `ERROR`, puis la première commande de l'étape renvoie `6`.

## 3. Variables du `.env` de recette (phase A)

Copie horodatée d'abord :

```bash
cp .env ".env.bak-$(date -u +%Y%m%dT%H%M%SZ)" && chmod 600 .env .env.bak-*
```

Chaque variable doit figurer **une seule fois** (un doublon a déjà causé l'incident FedaPay du
26/10) :

```bash
grep -nE '^(ACADEMY_ENABLED|AKAMBI_[A-Z_]+)=' .env
```

Ouvrir le fichier et **modifier les lignes existantes** (ne pas en ajouter de nouvelles à la fin si
elles existent déjà) :

```bash
nano .env
```

```dotenv
ACADEMY_ENABLED=true
AKAMBI_PROVIDER=akambi
AKAMBI_BASE_URL=https://preprod.akambiconsulting.com
AKAMBI_API_KEY=<clé de préproduction>
AKAMBI_API_SECRET=<secret de préproduction>
AKAMBI_WEBHOOK_SECRETS=
```

Coller la clé et le secret sans espace ni guillemet, puis enregistrer (`Ctrl+O`, Entrée, `Ctrl+X`).
`AKAMBI_WEBHOOK_SECRETS` reste vide jusqu'à la phase B.

Contrôle (une ligne par variable, valeurs secrètes non affichées) :

```bash
grep -E '^(ACADEMY_ENABLED|AKAMBI_[A-Z_]+)=' .env | sed -E 's/^(AKAMBI_API_(KEY|SECRET))=.+/\1=(renseigné)/'
```

Attendu : 6 lignes, `ACADEMY_ENABLED=true`, `AKAMBI_PROVIDER=akambi`, URL de préproduction, clé et
secret `(renseigné)`, `AKAMBI_WEBHOOK_SECRETS=` vide.

## 4. Contrôle avant redémarrage

```bash
./preflight.sh
```

Attendu, section Academy : ✔ `Academy activée, AKAMBI_PROVIDER=akambi`, ✔ `Akambi préproduction
sur staging.domicares.life`, ✔ `tables academy_* présentes`, horloge synchronisée ;
⚠ `AKAMBI_WEBHOOK_SECRETS vide` (normal en phase A). Aucun ✖ ailleurs. En cas de ✖ : ne pas
redémarrer, corriger le `.env` (ou revenir à la copie de l'étape 3).

## 5. Prise en compte par l'API et le worker

Le code est déjà dans les images de la recette : pas de reconstruction. Un `restart` ne relit pas
le `.env`, d'où `up -d` :

```bash
docker compose up -d api worker && sleep 20 && docker compose ps api worker
```

Attendu : `api` et `worker` en `running` / `healthy`. Si l'API redémarre en boucle :

```bash
docker compose logs --tail=50 api
```

Un message `AKAMBI_BASE_URL, AKAMBI_API_KEY et AKAMBI_API_SECRET requis` signale une variable vide
ou mal orthographiée (étape 3).

## 6. Vérifications

```bash
curl -s https://staging.domicares.life/api/health
```

```bash
curl -s https://staging.domicares.life/api/config/public | grep -o '"academyEnabled":[a-z]*'
```

Attendu : `{"status":"ok","database":"ok"}` puis `"academyEnabled":true`.

Webhook (phase A, sans secret) :

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' https://staging.domicares.life/api/webhooks/akambi
```

Attendu : `503`.

Identifiants, avec la configuration réelle du conteneur (sans les ressaisir) :

```bash
docker compose exec api node dist/academy/akambi-ping.js
```

Attendu : ✔ authentification, ✔ horloge, ✔ signature fausse refusée, ⚠ catalogue vide tant
qu'Akambi n'a pas publié la formation de test. La ligne `ERROR … 401 INVALID_SIGNATURE` du journal
correspond au contrôle volontairement faux.

## 7. Premières synchronisations

**[navigateur]** Se connecter à `https://staging.domicares.life` avec un compte `super_admin` ou
`ops`, ouvrir l'onglet **Academy** du tableau de bord administrateur :

1. **Synchroniser le catalogue** : état « réussi » ; 0 formation tant que le catalogue Akambi est
   vide.
2. **Rapprocher les inscriptions** : état « réussi », 0 inscription.

Vérifier aussi que le journal de l'API ne contient que méthode, chemin et code :

```bash
docker compose logs --since 15m api | grep -i akambi
```

Attendu : lignes du type `GET /api/partners/v1/courses → 200`, sans e-mail, nom, lien ni clé.

## 8. Phase B : secret de webhook

À réception du `whsec_…` envoyé par Akambi pour l'URL `https://staging.domicares.life/api/webhooks/akambi` :

```bash
cp .env ".env.bak-$(date -u +%Y%m%dT%H%M%SZ)" && chmod 600 .env .env.bak-* && nano .env
```

Renseigner `AKAMBI_WEBHOOK_SECRETS=whsec_…` (une seule ligne). Pendant une rotation, mettre les deux
secrets séparés par une virgule (`whsec_nouveau,whsec_ancien`), puis retirer l'ancien.

```bash
./preflight.sh && docker compose up -d api
```

Attendu : ✔ `secret webhook Akambi renseigné` dans `preflight.sh`.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' https://staging.domicares.life/api/webhooks/akambi
```

Attendu : `401` (signature absente refusée, rien n'est écrit).

Demander ensuite à Denis un `webhook.test`. Il doit apparaître dans l'onglet Academy (événements
webhook) avec le statut `ignored` et le message « événement de test ».

## 9. Retour arrière

Mesure par défaut, données conservées :

```bash
sed -i 's/^ACADEMY_ENABLED=true$/ACADEMY_ENABLED=false/' .env && grep '^ACADEMY_ENABLED=' .env && docker compose up -d api worker
```

Attendu : `"academyEnabled":false` sur `/api/config/public`, onglets Academy masqués, routes en 503.
La suppression des tables (`db/native/rollback/140_academy.down.sql`) n'est à envisager qu'après
sauvegarde, et fait perdre les correspondances avec Akambi (document 02, § 6).

## 10. À consigner

| Étape | Résultat | Où |
|---|---|---|
| 1 | nom de l'archive de sauvegarde | ci-dessous |
| 2 | `6` tables (présentes ou appliquées) | ci-dessous |
| 4 | `preflight.sh` : ✔ Academy, ⚠ webhook seul | ci-dessous |
| 6 | `academyEnabled:true`, webhook 503, `akambi-ping` | document 02, § 8 (ligne « § 2 activation préproduction ») |
| 7 | synchronisations réussies | document 02, § 8 |
| 8 | `whsec_…` installé, 401 sans signature, `webhook.test` reçu | document 02, § 8 (ligne « § 3 `webhook.test` ») |

Suite : campagne `preprod` (document 02, § 4) et parcours manuels R0 à R12 (§ 5), une fois la
formation de test publiée par Akambi.

### Suivi

| Date | Phase | Résultat | Preuve |
|---|---|---|---|
| — | A | à faire | |
| — | B | à faire (en attente du `whsec_…`) | |
