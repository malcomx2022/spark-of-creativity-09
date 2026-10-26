# 16 — Environnement de recette, déploiement et mise en production — 23 octobre 2026

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
| Webhook FedaPay | Le webhook **sandbox** n° 1471 vise la production et échoue (désactivé par FedaPay) ; la production ne reçoit donc aucun webhook et dépend de `payments.sync` | courriel FedaPay du 23 octobre, document 09 §4 bis |
| Campagne sandbox | S0, S3, S4, S12 ok ; S1, S2, S5 à S11 bloqués côté compte FedaPay ; S13 non couvert | document 09 §4 bis |
| Données réelles | Import Supabase définitif (document 04, phase P5) : **à confirmer**, aucune trace d'exécution dans les documents | — |

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
2. Environnement `production` : « Required reviewers » pour imposer une approbation avant chaque
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

| # | Tâche | Qui | Dépend de |
|---|---|---|---|
| 1 | Supprimer ou rediriger le webhook sandbox n° 1471 (§2.4) | équipe, tableau de bord FedaPay | — |
| 2 | Obtenir du support FedaPay : numéro approuvé `momo_test`, ouverture des dépôts, contrat `/v1/refunds`, filtres `/search` | équipe | message envoyé |
| 3 | Rejouer la campagne S1 à S11 avec `FEDAPAY_MOMO_TEST_APPROVED` ; vérifier `/payouts/search` | Claude Code | 2 |
| 4 | Commander et installer le VPS de recette, DNS `staging` (§2.1, §2.2) | équipe (accès, achat), Claude Code (procédure) | — |
| 5 | Protection de la recette (§2.5) : modèle livré, à installer avec la recette | équipe | 4 |
| 6 | Séparer recette et production : workflow livré (§3) ; environnements, secrets et `RECETTE_AUTO` à régler dans GitHub | équipe | 4 |
| 7 | S13 et paiement sandbox de bout en bout sur la recette | équipe et Claude Code | 1, 4 |
| 8 | Confirmer si l'import définitif des données Supabase est fait ; sinon répétition puis `bascule.sh` (document 04 §4, document 07 §8) | équipe | — |
| 9 | Exploitation : sauvegarde quotidienne, copie hors site chiffrée, exercice de restauration sur le VPS, objectifs RPO/RTO | équipe et Claude Code | 4 pour l'exercice |
| 10 | Supervision : modèle livré (`supervision.sh`, workflow `supervision.yml`, document 07 §14) ; à activer : cron interne sur le VPS, secret `SUPERVISION_ALERT_URL` et variables GitHub, essai d'alerte | équipe | — |
| 11 | Validations manuelles : Safari iPhone, push sur téléphone réel, réception du contact | équipe | 4 |
| 12 | Academy : identifiants de préproduction Akambi, grille R0 à R10, puis passage en production | équipe et Akambi | 4 |
| 13 | Paiements réels (§5.2) | équipe, avec Claude Code | 3, 7 |
| 14 | Clôture : pause puis suppression des projets Supabase (après dernière sauvegarde), révocation des clés `service_role` et des secrets Lovable | équipe | 8, 13 |

## 7. Décisions à prendre

- Hébergeur et taille du VPS de recette (§2.1).
- Compte Twilio de la recette : le même service Verify que la production, ou un service séparé.
- Réponse au point 8 : la base de production contient-elle déjà les données réelles importées ?
- Date cible d'ouverture des paiements réels, une fois les prérequis du §5.2 remplis.
