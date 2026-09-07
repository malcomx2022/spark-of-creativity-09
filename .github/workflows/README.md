# Workflows GitHub Actions

| Workflow | Déclenchement | Rôle |
|---|---|---|
| `api-ci.yml` | PR et push sur `main` touchant `api/**` ou `db/native/**` | Typecheck, build et tests e2e de l'API sur PostgreSQL 16 avec le schéma natif |
| `web-ci.yml` | PR et push sur `main` touchant le front (`src/**`, config Vite) | Lint (informatif), typecheck, tests Vitest, build Vite |
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

Les secrets applicatifs (base, JWT, FedaPay, Twilio, Resend, S3, VAPID…) ne transitent pas par
GitHub : ils sont dans `deploy/vps/.env` sur le VPS (modèle `deploy/vps/.env.example`).
