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
| Webhook FedaPay | Le webhook **sandbox** n° 1471 vise la production et échoue (désactivé par FedaPay) ; la production ne reçoit donc aucun webhook et dépend de `payments.sync` | courriel FedaPay du 23 octobre, document 09 §4 bis |
| Campagne sandbox | S0, S3, S4, S12 ok ; S1, S2, S5 à S11 bloqués côté compte FedaPay ; S13 non couvert | document 09 §4 bis |
| Données réelles | Import Supabase définitif (document 04, phase P5) : **à confirmer**, aucune trace d'exécution dans les documents | — |

Conséquence : toute fusion part directement en production, sans étape de validation. La recette
s'insère entre `main` et la production.

## 2. Créer l'environnement de recette

### 2.1 Choix de l'hébergement

Un **second VPS**, comme prévu au document 04 §0 (« Prévoir un second VPS staging plus petit »).
La pile Compose publie les ports 80 et 443 et un seul Caddy : deux piles ne cohabitent pas sur le
même hôte sans refonte. Dimensionnement suffisant : 2 vCPU, 4 Go de RAM, 40 Go de disque,
Ubuntu 24.04.

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

### 2.5 Protéger la recette (à implémenter)

La recette ne doit être ni indexée ni ouverte au public : ajouter dans le Caddyfile, pour le seul
domaine de recette, un `basic_auth` sur tout le site **sauf** `/api/webhooks/*` (FedaPay et Akambi
doivent pouvoir appeler), et un en-tête `X-Robots-Tag: noindex`. Changement de configuration à
faire dans une PR dédiée, testé sur la recette avant tout usage.

## 3. Chaîne de déploiement : `main` → recette → production

Cible :

1. Fusion sur `main` → déploiement **automatique de la recette**.
2. Recette passée (§4) → déploiement **manuel de la production** du même SHA, avec approbation.

Changements à faire dans `.github/workflows/deploy-vps.yml` (PR dédiée) :

- deux environnements GitHub, `recette` et `production`, chacun avec ses secrets
  `VPS_HOST`, `VPS_USERNAME`, `VPS_SSH_KEY`, `VPS_SSH_PORT`, `VPS_APP_DIR`, `DOMAIN_NAME` ;
- `push` sur `main` → job `recette` uniquement ;
- `workflow_dispatch` (saisie `DEPLOYER` et `revision`) → job `production`, protégé par
  l'approbation obligatoire d'un relecteur dans les réglages de l'environnement GitHub ;
- le SHA déployé en production doit être celui validé en recette (entrée `revision`, déjà épinglée
  au SHA et contrôlée comme ancêtre de `main`).

En attendant la recette, la production continue de se déployer à chaque fusion : fusionner seulement
des PR dont la CI est verte, et vérifier la production après chaque fusion (§5.1).

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
| 5 | Protection de la recette dans le Caddyfile (§2.5) | Claude Code (PR) | 4 |
| 6 | Séparer recette et production dans `deploy-vps.yml` (§3) | Claude Code (PR), équipe (secrets et environnements GitHub) | 4 |
| 7 | S13 et paiement sandbox de bout en bout sur la recette | équipe et Claude Code | 1, 4 |
| 8 | Confirmer si l'import définitif des données Supabase est fait ; sinon répétition puis `bascule.sh` (document 04 §4, document 07 §8) | équipe | — |
| 9 | Exploitation : sauvegarde quotidienne, copie hors site chiffrée, exercice de restauration sur le VPS, objectifs RPO/RTO | équipe et Claude Code | 4 pour l'exercice |
| 10 | Supervision : sondes `/api/health` et `/`, alerte sur webhooks en échec (Uptime Kuma ou équivalent) | équipe et Claude Code | — |
| 11 | Validations manuelles : Safari iPhone, push sur téléphone réel, réception du contact | équipe | 4 |
| 12 | Academy : identifiants de préproduction Akambi, grille R0 à R10, puis passage en production | équipe et Akambi | 4 |
| 13 | Paiements réels (§5.2) | équipe, avec Claude Code | 3, 7 |
| 14 | Clôture : pause puis suppression des projets Supabase (après dernière sauvegarde), révocation des clés `service_role` et des secrets Lovable | équipe | 8, 13 |

## 7. Décisions à prendre

- Hébergeur et taille du VPS de recette (§2.1).
- Compte Twilio de la recette : le même service Verify que la production, ou un service séparé.
- Réponse au point 8 : la base de production contient-elle déjà les données réelles importées ?
- Date cible d'ouverture des paiements réels, une fois les prérequis du §5.2 remplis.
