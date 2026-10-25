# Workflows GitHub Actions

| Workflow | Déclenchement | Rôle |
|---|---|---|
| `api-ci.yml` | PR et push sur `main` touchant `api/**` ou `db/native/**` | Typecheck, build et tests e2e de l'API sur PostgreSQL 16 avec le schéma natif |
| `web-ci.yml` | PR et push sur `main` touchant le code actif front/API ou la configuration des tests et du build | Lint bloquant du code actif, typecheck, tests Vitest, build Vite, 114 scénarios WebKit iPhone/iPad et Chromium (services simulés) |
| `supervision.yml` | Toutes les 15 min (`schedule`) et manuel | `deploy/vps/supervision.sh externe` : `/api/health` (API et base), `/`, mode FedaPay, échéance TLS ; recette en option ; job en échec si une sonde est KO, alerte au changement d'état (document 07 §14) |
| `deploy-vps.yml` | Manuel (`workflow_dispatch`, saisir `DEPLOYER`) ; `push` sur `main` à activer une fois le VPS en service | `git reset --hard origin/main` sur le VPS puis `docker compose build` / `up -d` de `deploy/vps`, contrôle `GET /api/health` |

## Secrets à configurer (Settings → Secrets and variables → Actions)

| Secret | Contenu |
|---|---|
| `VPS_HOST` | IP ou nom du VPS |
| `VPS_USERNAME` | Utilisateur SSH de déploiement (créé par `deploy/vps/install-vps.sh`) |
| `VPS_SSH_KEY` | Clé privée SSH |
| `VPS_SSH_PORT` | Port SSH (défaut 22) |
| `VPS_APP_DIR` | Dossier du clone sur le VPS (ex. `/home/deploy/domicares`) |
| `DOMAIN_NAME` | Domaine public (ex. `domicares.life`) pour le contrôle de santé |

Supervision (facultatif) : secret `SUPERVISION_ALERT_URL` (webhook recevant `{"text": "…"}`) ;
variables `SUPERVISION_URL` (défaut `https://domicares.life`), `SUPERVISION_FEDAPAY_ENV`
(`sandbox` ou `live`, vérifié s'il est renseigné) et `SUPERVISION_RECETTE_URL`
(ex. `https://staging.domicares.life`, page protégée attendue en 401).

Les secrets applicatifs (base, JWT, FedaPay, Twilio, Resend, S3, VAPID…) ne transitent pas par
GitHub : ils sont dans `deploy/vps/.env` sur le VPS (modèle `deploy/vps/.env.example`).

La recette Safari/iOS sur appareil physique est suivie dans
`docs/migration-postgresql/12-CORRECTIONS-LINT-SAFARI-IOS.md` ; WebKit CI ne la remplace pas.
