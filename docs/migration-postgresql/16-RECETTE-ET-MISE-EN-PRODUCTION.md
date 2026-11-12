# 16 — Environnement de recette, déploiement et mise en production — 23 octobre 2026

> **27 octobre 2026 : projet en phase de validation.** Import des données réelles validé ;
> projets Supabase et Lovable supprimés ; restent la validation fonctionnelle (§4), l'exploitation
> (sauvegarde hors site, restauration, alerte) et l'ouverture des paiements réels (§5.2), voir §6.
>
> **11 novembre 2026 : point complet** (§1, dernière ligne, et §6 réordonné par priorité). Code sans
> défaut P1/P2 ouvert ; production en retard sur `main` (`4bd6d71` contre `992c397`) ; actions restantes
> surtout sur le VPS et chez FedaPay.

Processus complet pour créer la recette, faire passer chaque version de la recette à la production,
ouvrir les paiements réels, et liste de ce qui reste pour terminer le projet. Les procédures
détaillées existantes sont référencées plutôt que recopiées (documents 04, 07, 09, 10, 12, 14, 15 et
`docs/academy/02-RECETTE-PREPRODUCTION.md`).

## 1. État constaté le 23 octobre 2026

| Point | Constat | Preuve |
|---|---|---|
| Production | `https://domicares.life` sert la nouvelle pile (NestJS, PostgreSQL) | `GET /api/health` → `{"status":"ok","database":"ok"}` |
| Paiements en production | FedaPay en **mode sandbox** : aucun paiement réel encaissé | `GET /api/payments/config` → `environment: sandbox`, clé `pk_sandbox_…` |
| Déploiement | `deploy-vps.yml` déploie la **production à chaque push sur `main`** | runs 37 à 42 du 23 octobre, tous `success` |
| Recette | **Aucun environnement de recette joignable** ; `https://staging.domicares.life` (cité par la recette Academy) ne répond pas | `GET /api/health` → 502 depuis l'environnement de développement |
| Recette (24 octobre) | **Déployée** sur le VPS de production (projet `domicares-recette`, SHA `52e03ec`) ; `RECETTE_AUTO` pas encore activée ; recette fonctionnelle (§4) à dérouler | `deploy-vps.yml` run 47, santé 200 depuis le runner ; détail au document 15 §17 |
| Supervision et recette (26 octobre) | Fusions en recette (`RECETTE_AUTO=true`, run 56) ; production redéployée à la main en `4bd6d71` (run 57) après huit déploiements « production » partis dans le clone de recette (`VPS_APP_DIR`, runs 48 à 55) ; clés FedaPay live actives 5 minutes après ce déploiement, retour en sandbox à 18:19 UTC ; sondes externe et interne OK sur les deux environnements | document 10 §7 (chaîne de déploiement, supervision, incident) |
| Webhook FedaPay | Le webhook **sandbox** n° 1471 vise la production et échoue (désactivé par FedaPay) ; la production ne reçoit donc aucun webhook et dépend de `payments.sync` | courriel FedaPay du 23 octobre, document 09 §4 bis |
| Campagne sandbox | S0, S3, S4, S12 ok ; S1, S2, S5 à S11 bloqués côté compte FedaPay ; S13 non couvert | document 09 §4 bis |
| Données réelles | Import Supabase définitif **validé** par l'équipe (27/10) ; archive finale chiffrée conservée hors dépôt ; projets **Supabase et Lovable supprimés** le 27/10 | document 10 §7 (« Données réelles et clôture Supabase / Lovable ») |
| Point du 11 novembre | `main` = `992c397` ; contrôles locaux verts (front : typecheck, lint 0 avertissement, 165 tests, build ; API : typecheck, 178 tests unitaires, build) ; `deploy-vps.yml` run 63 et `recette.yml` run 74 `success` ; `supervision.yml` vert toute la journée ; aucune PR ouverte. **Production à `4bd6d71`** (dernier déploiement de production consigné : run 57, 26/10 ; à confirmer par `git log -1` sur le VPS) : avec `RECETTE_AUTO=true`, les fusions #133 à #139 (runs 58 à 63) sont parties en recette, dont du code Academy (`akambi-ping.ts`, `academy-sync`, `akambi.client`). Défaut relevé et corrigé : saisie des numéros à 10 chiffres impossible dans les widgets de paiement (document 15 §21) | runs GitHub du 11/11 ; `git diff --stat 4bd6d71 992c397` |
| CI et recette du 12 novembre | `main` = `bd9cd80` (#141, webhook tardif sur paiement annulé, après #140). CI verte sur `eb8130b` (#140) après deux échecs d'infrastructure à l'installation des navigateurs (miroirs apt, puis paquet `libsoup-3.0` absent chez Ubuntu ; tentative 3 verte) et sur `bd9cd80` dès le premier passage (API CI, Web CI, Recette post-livraison). Recette déployée à `bd9cd80` (`deploy-vps.yml` run 65, santé 200). Production toujours au dernier déploiement consigné, `4bd6d71` | document 10 §8, ligne « CI sur `main` » |

Conséquence : toute fusion part directement en production, sans étape de validation. La recette
s'insère entre `main` et la production.

## 2. Créer l'environnement de recette

### 2.1 Choix de l'hébergement

Deux options :

- **Second VPS** (recommandé), comme prévu au document 04 §0 (« Prévoir un second VPS staging plus
  petit ») : 2 vCPU, 4 Go de RAM, 40 Go de disque, Ubuntu 24.04. Installation au §2.2.
- **Même VPS que la production** : second clone servi par le Caddy de production (§2.6). Moins cher,
  mais une panne d'hôte, un disque plein ou une commande lancée dans le mauvais clone touchent les
  deux. Prévoir au moins 4 vCPU et 8 Go de RAM.

### 2.2 Installation

Suivre le document 07, §1 à §7, sur ce nouveau VPS, avec les différences suivantes :

| Élément | Recette | Production |
|---|---|---|
| DNS | `A staging.domicares.life` → IP du VPS de recette | `A domicares.life`, `A www` → IP de production |
| `DOMAIN` / `WWW_DOMAIN` | `staging.domicares.life` / `www.localhost` | `domicares.life` / `www.domicares.life` |
| `FRONTEND_URL`, `CORS_ORIGINS`, `APP_BASE_URL`, `SITE_URL` | `https://staging.domicares.life` | `https://domicares.life` |
| `NODE_ENV` | `production` (même image que la production) | `production` |
| FedaPay | `FEDAPAY_MODE=sandbox`, clés `sk_sandbox_`/`pk_sandbox_` | sandbox, puis live au §5.2 |
| `FEDAPAY_WEBHOOK_SECRET` | secret du webhook sandbox visant la recette (§2.4) | secret du webhook propre à la production |
| E-mail (Resend) | `CONTACT_RECIPIENT_EMAIL` = boîte de test de l'équipe | boîte réelle de contact |
| SMS / OTP | `OTP_PROVIDER=twilio` avec les numéros de l'équipe (`fake` est refusé quand `NODE_ENV=production`) | `twilio` |
| Push (VAPID) | paire de clés **propre à la recette** | paire de production |
| Stockage S3 | MinIO de la recette (buckets neufs) | MinIO de production |
| Akambi (Academy) | préproduction Akambi (`docs/academy/02`) | production Akambi, plus tard |
| Secrets JWT, `PHONE_ENCRYPTION_KEY` | **différents** de la production | production |

Contrôler ensuite : `deploy/vps/preflight.sh` sans erreur, `https://staging.domicares.life/api/health`,
et `./contact-check.sh --via-site` vers la boîte de test.

### 2.3 Données de recette

Base neuve (schéma chargé par l'initialisation du volume), puis des comptes de recette par rôle :
patient, praticien, coach, administrateur. Ne jamais copier la base de production telle quelle :
elle contient des données de santé. Si un jeu réaliste devient nécessaire, une copie **anonymisée**
reste à outiller (aucun script n'existe à ce jour).

### 2.4 Webhooks : un par environnement

1. Tableau de bord **sandbox** FedaPay : modifier le webhook n° 1471 pour viser
   `https://staging.domicares.life/api/webhooks/fedapay`, décocher « Désactiver le Webhook lorsque
   l'application génère des erreurs », révéler son secret et le copier dans `FEDAPAY_WEBHOOK_SECRET`
   du `.env` de **recette**, puis `docker compose up -d api` (un restart ne relit pas `.env`).
2. Tant que la production reste en sandbox et doit recevoir ses webhooks : créer un **second**
   webhook sandbox vers `https://domicares.life/api/webhooks/fedapay` et copier **son** secret dans le
   `.env` de production. Sinon, garder la production sans webhook jusqu'au passage en live (§5.2).
3. Vérifier dans le journal FedaPay de chaque webhook que les livraisons reviennent en 200.

### 2.5 Protéger la recette

La recette ne doit être ni indexée ni ouverte au public. Modèle fourni :
`deploy/vps/caddy/sites/recette.caddy.example` : `basic_auth` sur l'interface et
`X-Robots-Tag: noindex` partout. `/api/*` et `/socket.io/*` restent sans mot de passe : le front
envoie déjà `Authorization: Bearer` (`src/lib/api/client.ts`), qu'un `basic_auth` remplacerait, et
les webhooks FedaPay et Akambi ne s'authentifient pas. L'API garde ses contrôles d'accès. Sur un
second VPS, recopier ce bloc dans son Caddyfile ; sur le même VPS, voir le §2.6.

### 2.6 Variante : recette sur le même VPS que la production

Principe : un second clone du dépôt, une pile Compose distincte (nom de projet, volumes, base,
MinIO), sans Caddy ni port PostgreSQL publié ; le Caddy de production la sert par le réseau
`domicares-edge` et un fichier de site non versionné.

```
Caddy de production (80/443)
 ├─ domicares.life          → domicares-api / domicares-web   (projet « vps », inchangé)
 └─ staging.domicares.life  → recette-api / recette-web       (projet « domicares-recette »)
```

Fichiers : `docker-compose.recette.yml` (override), `caddy/sites/recette.caddy.example`, réseau
`edge` et alias `domicares-api` / `domicares-web` dans `docker-compose.yml`, `import sites/*.caddy`
dans le Caddyfile (aucun fichier : rien n'est importé).

1. **Production d'abord** : déployer la version qui contient ces fichiers. Caddy, l'API et le web
   sont recréés une fois (réseau `domicares-edge` créé, alias) : quelques secondes de coupure.
2. **Clone de recette**, en tant que `deploy` :
   `git clone <dépôt> ~/domicares-recette`, puis `cp deploy/vps/.env.example deploy/vps/.env`.
3. **`.env` de recette** : valeurs du tableau du §2.2, `PG_SHARED_BUFFERS=192MB` (le `1GB` de
   `.env.example` dépasse la limite mémoire de 768 Mo de la base de recette), plus
   `COMPOSE_PROJECT_NAME=domicares-recette` et
   `COMPOSE_FILE=docker-compose.yml:docker-compose.recette.yml`. Ne **jamais** mettre ces deux
   lignes dans le `.env` de production : un autre nom de projet y repartirait sur des volumes vides.
4. **DNS** : `A staging.domicares.life` → IP du VPS.
5. **Site Caddy**, dans le clone de **production** : copier `caddy/sites/recette.caddy.example` en
   `caddy/sites/recette.caddy` (non versionné, conservé par `git reset --hard`), remplacer le domaine,
   l'utilisateur et le hachage (`docker compose exec caddy caddy hash-password`), puis
   `caddy validate` et `caddy reload` (commandes en tête du modèle).
6. **Démarrer la recette** depuis `~/domicares-recette/deploy/vps` : `docker compose build` puis
   `docker compose up -d`, puis `./preflight.sh`. La section « 3b » contrôle le nom de projet, la
   version de Compose (2.24.4 minimum), le réseau, le Caddy de production et le site.

Garde-fous et précautions :

- lancer chaque script depuis le bon clone : `fedapay-mode.sh`, `fedapay-observe.sh`, `backup.sh` et
  `preflight.sh` agissent sur la pile de leur dossier ;
- `bascule.sh` refuse de tourner dans le clone de recette, car il vise `127.0.0.1:5432`, la base de
  production ;
- limites mémoire de la recette réglables dans son `.env` (`RECETTE_*_MEM`) ;
- jamais de restauration d'une sauvegarde de production dans la recette ;
- un déploiement de la recette reconstruit les images sur l'hôte de production : charge processeur
  pendant quelques minutes. Les images épinglées (PostgreSQL, MinIO, sauvegarde) sont partagées.

## 3. Chaîne de déploiement : `main` → recette → production

Cible :

1. Fusion sur `main` → déploiement **automatique de la recette**.
2. Recette passée (§4) → déploiement **manuel de la production** du même SHA, avec approbation.

`.github/workflows/deploy-vps.yml` choisit l'environnement GitHub du déploiement :

- `push` sur `main` : `recette` si la **variable de dépôt** `RECETTE_AUTO` vaut `true`, sinon
  `production` (comportement actuel, inchangé tant que la variable n'est pas définie) ;
- lancement manuel (`DEPLOYER`, `revision`, `cible` = `production` ou `recette`, `sans_recette`).

Réglages GitHub (Settings → Environments, puis Settings → Secrets and variables → Actions) :

1. Environnement `recette` : secrets `VPS_APP_DIR` (`/home/deploy/domicares-recette` sur le même VPS)
   et `DOMAIN_NAME` (`staging.domicares.life`). Sur un second VPS, aussi `VPS_HOST`,
   `VPS_USERNAME`, `VPS_SSH_KEY`, `VPS_SSH_PORT`. Les secrets absents reprennent ceux du dépôt.
   Les secrets **du dépôt** restent ceux de la production (`VPS_APP_DIR` = `/home/deploy/domicares`,
   `DOMAIN_NAME` = `domicares.life`) : s'ils désignent la recette, les déploiements « production »
   reconstruisent la recette sans erreur visible (cas des runs 48 à 55, document 10 §7).
2. Environnement `production` (**configuré le 12/11/2026**, document 10 §9) : « Required reviewers » pour imposer une approbation avant chaque
   déploiement de production.
3. Une fois la recette déployée avec succès par un lancement manuel (`cible` = `recette`) : variable
   de dépôt `RECETTE_AUTO=true`. Dès lors, les fusions vont en recette et la production se déploie à
   la main, avec `revision` = le SHA validé en recette.

**Contrôle « SHA validé en recette »** (job `validation-recette`, actif quand `RECETTE_AUTO=true`) :
un déploiement de production n'est accepté que si ce SHA a un déploiement GitHub réussi dans
l'environnement `recette`. Le contrôle passe **avant** la demande d'approbation de `production`.
Un SHA validé puis remplacé en recette par une version plus récente reste accepté. Limites et
dérogation :

- un déploiement manuel de la recette avec une `revision` différente du commit du lancement est
  enregistré par GitHub pour le commit du lancement : il ne valide pas cette révision (le run
  l'indique par un avertissement). Lancer plutôt le workflow depuis le commit voulu ;
- urgence (correctif de production) : `sans_recette` coché, déploiement accepté et signalé par un
  avertissement et dans le résumé du run. L'approbation de l'environnement `production` reste requise.

Avant `RECETTE_AUTO=true`, la production continue de se déployer à chaque fusion : fusionner
seulement des PR dont la CI est verte, et vérifier la production après chaque fusion (§5.1).

## 4. Recette d'une version (sur `https://staging.domicares.life`)

| Bloc | Contenu | Référence |
|---|---|---|
| Parcours par rôle | connexion, OTP, recherche, rendez-vous, messages temps réel, fichiers MinIO, KYC, finance, support | document 07 §9 |
| Parcours corrigés | changement de compte, notifications ciblées, chat mobile, contact | document 14 §4 |
| Paiement sandbox | ouverture du widget (chargé à la demande depuis la PR #118), paiement de test, état `paid`, retenue, libération, reversement, remboursement | document 09 §2 |
| Webhook (S13) | rejeu d'un événement depuis le journal FedaPay vers la recette, idempotence | document 09, S13 |
| Appareils réels | Safari iPhone, PWA installée, push sur téléphone, mode hors ligne | document 12 ; document 15 §16 |
| Contact | réception réelle et « Répondre » vers le visiteur | `contact-check.sh --via-site` |
| Academy | grille R0 à R10 avec la préproduction Akambi | `docs/academy/02-RECETTE-PREPRODUCTION.md` |
| Sauvegarde | `backup.sh`, puis `restore-drill.sh` sur une cible isolée | document 07 §13 ; document 15 §14 |

Une version passe en production quand ces blocs sont `ok` pour ce qu'elle modifie ; la première fois,
tous les blocs.

## 5. Mise en production

### 5.1 Déployer une version validée

Lancer le job `production` avec le SHA validé en recette (§3). Après déploiement : `/api/health`,
connexion d'un compte réel, ouverture d'un écran par rôle, journaux `api` et `worker` sans erreur.
`/api/health` seul ne valide pas les parcours. Retour arrière : relancer avec le SHA précédent
(document 10 §6) ; images web et API ensemble.

Le déploiement recrée les conteneurs avec le `.env` du moment : une valeur modifiée sans
redémarrage s'applique alors. Après chaque déploiement de production, vérifier aussi :

- dans le journal du run, les conteneurs recréés `vps-*` (et non `domicares-recette-*`) ;
- sur le VPS, `git log --oneline -1` dans `/home/deploy/domicares` = SHA déployé ;
- `GET /api/payments/config` → mode attendu (`sandbox` tant que le §5.2 n'est pas exécuté),
  aussi contrôlé par `supervision.yml`.

### 5.2 Ouvrir les paiements réels (FedaPay live)

Prérequis : campagne sandbox S1 à S12 `ok` (document 09) et S13 `ok` en recette ; contrat
`/v1/refunds` confirmé ; dépôts vérifiés ; compte FedaPay live activé.

1. `deploy/vps/fedapay-mode.sh status`, puis `fedapay-mode.sh live` (clés `sk_live_`/`pk_live_`).
2. Tableau de bord **live** : webhook vers `https://domicares.life/api/webhooks/fedapay`, secret
   copié dans `FEDAPAY_WEBHOOK_SECRET`, puis `docker compose up -d api`.
3. Paiement réel de montant minimal sur un rendez-vous de test, suivi avec `fedapay-observe.sh` :
   webhook reçu (200), paiement `paid`, retenue ; puis remboursement et réconciliation sans anomalie.
4. Surveiller `payment_events`, `webhook_events` et la réconciliation quotidienne la première semaine.

Retour arrière : `fedapay-mode.sh sandbox` (document 09 §5).

## 6. Ce qui reste pour terminer le projet

Mis à jour le 11 novembre 2026, par ordre de priorité. Commandes pas à pas des tâches 1 à 10 :
`17-FICHE-COMMANDES-VPS.md`. Les lignes « fait » de l'ancienne liste sont
regroupées en fin de section.

**Avancement au 12 novembre 2026** (session Claude Code sur le VPS, relevé à 04:50 UTC ; détail au
document 10 §9) :

| # | État | Constat | Reste |
|---|---|---|---|
| 1 | **fait** | une seule ligne `FEDAPAY_MODE=`, `sandbox` vu par le conteneur et l'API ; base de production (12/11) : 0 paiement créé et 0 webhook reçu le 26/10 entre 18:00 et 18:30 UTC ; tableau de bord FedaPay live (12/11), « 2 mois précédents » : aucun volume ni transaction réussie | facultatif : liste Transactions du 26/10 tous statuts |
| 2 | partiel | copie hors site R2 en service depuis le 07/11 ; sauvegarde du 12/11 copiée | déchiffrement d'essai sur un poste |
| 3 | **fait** | `restore-drill.sh` réussi en 12 s, 103 références, 0 manquante (après vidage de 9 liens cassés chez 3 praticiens) | variante depuis l'archive hors site ; correctif `rm -fv` à fusionner |
| 4 | partiel | supervision `KO` puis `OK` le 11/11 (18:12 à 18:13 UTC) | réception des deux messages Discord à confirmer |
| 5 | **fait** | `backups` à `deploy`, `.app-version` = `bd9cd80` | — |
| 6 | **fait** | « Required reviewers » configuré le 12/11 sur `production` (approbateur `malcomx2022`, « Prevent self-review » décoché, contournement par les administrateurs autorisé, déploiement limité à la branche `main`) ; `RECETTE_AUTO` = `true` en variable de dépôt (captures des réglages GitHub fournies par l'équipe) | — |
| 7 | en service | 7 webhooks sandbox reçus et acceptés par la recette | case « désactiver en cas d'erreurs » à vérifier |
| 8 | partiel | contrôles techniques OK (santé, `sandbox`, `401`) ; **paiement MTN `0166000001` ok** le 12/11 à 04:22 UTC (`paid`, rendez-vous confirmé, 14 250 XOF en attente pour le praticien, écritures équilibrées 15 300 / 15 300, notifications patient et praticien) ; S13 : 7 webhooks `success`. Ce premier essai a révélé un webhook tardif qui rouvrait un paiement annulé, corrigé par #141 (`bd9cd80`, en recette depuis 04:43) ; 12/11, 06:28 à 06:45 UTC : **paiement Moov `0164000001` ok** (`7d171974`, `paid` en 12 s) ; **reprise après abandon ok avec #141** (le paiement MTN ouvert `c5067bbe` passe `canceled` au remplacement, le `transaction.deleted` tardif ne le rouvre pas, tentative close en `failed` au statut final, nouvelle tentative sans 409, 0 écriture pour le paiement annulé) ; grand livre 30 600 / 30 600. **Paiement refusé non testable depuis l'interface** : avec `66000000`, la transaction sandbox `542270` reste `pending` chez FedaPay, sans moyen de paiement (`GET /v1/transactions/542270`), aucun `transaction.declined` émis ; l'écran affiche « Le paiement a échoué ou a été annulé » et le rendez-vous reste payable ; le refus reste couvert par la campagne API (S3, document 09 §4 bis) ; **contact ok** (12/11, 06:57 UTC) : `contact-check.sh --via-site` sur la recette, envoi direct accepté par Resend et `POST /api/contact` → 201, les deux messages reçus dans la boîte de réception configurée (`CONTACT_RECIPIENT_EMAIL`, vide jusque-là dans le `.env` de recette, renseigné le 12/11 avec la boîte support de l'équipe) ; paiement resté en attente annulé automatiquement à 06:50 sans réouverture par le `transaction.deleted` tardif ; contrôle croisé final : webhooks `success`, grand livre 30 600 / 30 600 | grille par rôle du §4 (patient, praticien, coach, administrateur : non jouée au 12/11, 07:10 UTC) ; « Répondre » vers l'expéditeur du formulaire non confirmé ; décider si la recette garde la boîte support ou une boîte de test (§2.2) |
| 9 | à faire | — | iPhone : Safari, PWA, push, hors ligne |
| 10 | à faire | production à `4bd6d71`, sans #140 ni #141 | déployer `bd9cd80` après l'étape 8 |

Ajout : 3 praticiens n'ont plus de justificatif enregistré (liens vidés avant l'exercice de
restauration) ; leur demander de les renvoyer (équipe).

**Priorité 1 : sécurité et données (la production contient les données réelles).**

| # | Tâche | Qui | Dépend de |
|---|---|---|---|
| 1 | Incident du 26/10 (document 10 §7) : contrôler dans le tableau de bord FedaPay **live** l'absence de transaction entre 18:14 et 18:19 UTC ; vérifier qu'une seule ligne `FEDAPAY_MODE=` subsiste dans le `.env` de production | équipe | — |
| 2 | Copie hors site chiffrée sur Cloudflare R2 (document 07 §13) : bucket `domicares-backups` et jeton limité, clé `age` générée sur un poste, `BACKUP_AGE_RECIPIENT`, `BACKUP_OFFSITE_REMOTE`, `BACKUP_ALERT_URL` dans le `.env` de production, `docker compose up -d backup`, contrôle `rclone lsl` et déchiffrement d'essai | équipe | — |
| 3 | Premier exercice `restore-drill.sh` sur la vraie sauvegarde, durée mesurée et comparée au RTO de 4 h | équipe et Claude Code | 2 conseillé |
| 4 | Essai d'alerte de la supervision (document 07 §14) : `docker compose stop worker`, message Discord, puis « supervision rétablie » | équipe | — |
| 5 | Droits du dossier `deploy/vps/backups` du clone de recette (`.app-version: Permission denied`, document 10 §7) | équipe | — |

**Priorité 2 : chaîne recette → production.**

| # | Tâche | Qui | Dépend de |
|---|---|---|---|
| 6 | « Required reviewers » sur l'environnement GitHub `production` (§3, réglage 2) | équipe | — |
| 7 | Webhook sandbox n° 1471 redirigé vers la recette, secret dans le `.env` de recette, `docker compose up -d api` (§2.4) | équipe, tableau de bord FedaPay | — |
| 8 | Recette fonctionnelle du §4 depuis un poste autorisé, dont le paiement sandbox depuis l'interface avec `+229 01 66 00 00 01` et S13 | équipe et Claude Code | 7 |
| 9 | Validations manuelles : Safari iPhone, PWA installée, push sur téléphone réel, réception du contact (`contact-check.sh --via-site`) | équipe | — |
| 10 | Déployer en production le SHA validé en recette (`bd9cd80` au 12/11 : CI verte, en recette ; il inclut #140 et #141) ; contrôles du §5.1 (conteneurs `vps-*`, `git log -1` du clone, FedaPay `sandbox`) | équipe | 6, 8 |

**Priorité 3 : fin de chantier.**

| # | Tâche | Qui | Dépend de |
|---|---|---|---|
| 11 | Rotation des clés FedaPay, Twilio et Resend autrefois copiées chez Supabase/Lovable (sans toucher `PHONE_ENCRYPTION_KEY` ni VAPID) ; vérifier que l'application Lovable n'a plus accès au dépôt GitHub | équipe | — |
| 12 | Support FedaPay : ouverture des **dépôts** (S7 : 403) et accès à **`/v1/refunds`** (S9, S11) sur le compte sandbox, puis relance de la campagne (document 09 §4 bis) | équipe, puis Claude Code | — |
| 13 | Academy : identifiants de préproduction Akambi, grille R0 à R10, puis production | équipe et Akambi | — |
| 14 | Paiements réels (§5.2) | équipe, avec Claude Code | 1, 7, 8, 12 |

**Faits** : séparation recette / production (`RECETTE_AUTO=true`, runs 56 et 57) ; approbation obligatoire de la production (12/11) ; import définitif des
données (26-27/10) ; clôture Supabase et Lovable (27/10) ; numéros `momo_test` reçus et campagne rejouée
(27/10) ; stockage hors site choisi (Cloudflare R2, #139) ; supervision externe et interne en service ;
saisie des numéros à 10 chiffres dans les widgets de paiement (11/11, document 15 §21).

## 7. Décisions à prendre

- ~~Hébergeur et taille du VPS de recette (§2.1)~~ : réglé, recette sur le VPS de production (§2.6).
- Compte Twilio de la recette : le même service Verify que la production, ou un service séparé.
- Date cible d'ouverture des paiements réels, une fois les prérequis du §5.2 remplis.
- Numéros à 10 chiffres hors paiement (inscription, connexion OTP, contacts d'urgence, numéro de
  reversement) : la saisie y reste limitée à 8 chiffres. Les accepter touche l'identité des comptes
  (numéros enregistrés à 8 chiffres, recherche du compte à la connexion OTP, Twilio) : choisir entre
  accepter les deux formats avec correspondance, ou migrer les numéros enregistrés (document 15 §21).
