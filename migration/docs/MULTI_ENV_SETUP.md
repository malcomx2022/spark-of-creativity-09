# Architecture Multi-Environnements sur VPS Hostinger

## Vue d'ensemble

Cette documentation décrit l'architecture complète pour déployer 3 environnements isolés (dev, test, prod) sur un seul VPS Hostinger avec Ubuntu 24.

## Architecture

### Domaines
- **Production**: `domicares.life` (+ `www.domicares.life`)
- **Test**: `test.domicares.life`
- **Dev**: `dev.domicares.life`

### Structure des dossiers
```
/opt/
├── supabase-prod/     # Supabase production (ports 8000-8010)
├── supabase-test/     # Supabase test (ports 8100-8110)
└── supabase-dev/      # Supabase dev (ports 8200-8210)

/var/www/
├── prod/              # Frontend production
├── test/              # Frontend test
└── dev/               # Frontend dev

/backups/
├── prod/              # Backups production
├── test/              # Backups test
└── dev/               # Backups dev
```

### Ports par environnement

| Service      | Production | Test  | Dev   |
|--------------|------------|-------|-------|
| Kong Gateway | 8000       | 8100  | 8200  |
| PostgREST    | 8001       | 8101  | 8201  |
| GoTrue       | 8002       | 8102  | 8202  |
| Realtime     | 8003       | 8103  | 8203  |
| Storage      | 8004       | 8104  | 8204  |
| Functions    | 8005       | 8105  | 8205  |
| Studio       | 8006       | 8106  | 8206  |
| PostgreSQL   | 5432       | 5433  | 5434  |

## Prérequis VPS

### Spécifications minimales
- **CPU**: 8 cores (ou 4 cores avec bonne gestion)
- **RAM**: 16 GB minimum (32 GB recommandé)
- **Stockage**: 200 GB SSD
- **OS**: Ubuntu 24.04 LTS
- **IP fixe**: Fournie par Hostinger

### Configuration DNS
Chez votre registrar (ou Hostinger DNS), ajouter:
```
Type    Nom     Valeur              TTL
A       @       <IP_VPS_HOSTINGER>  3600
A       dev     <IP_VPS_HOSTINGER>  3600
A       test    <IP_VPS_HOSTINGER>  3600
CNAME   www     domicares.life      3600
```

## Installation

### Étape 1: Préparation du VPS
```bash
# Depuis votre machine locale, se connecter au VPS
ssh root@<IP_VPS_HOSTINGER>

# Copier le script de setup
scp migration/scripts/03-setup-vps.sh root@<IP_VPS_HOSTINGER>:/root/

# Exécuter le setup initial
cd /root
chmod +x 03-setup-vps.sh
./03-setup-vps.sh
```

### Étape 2: Installation Supabase PROD
```bash
# Se connecter en tant qu'utilisateur deploy
ssh deploy@<IP_VPS_HOSTINGER>

# Copier le script d'installation prod
scp migration/scripts/05-install-supabase-prod.sh deploy@<IP_VPS_HOSTINGER>:/home/deploy/
scp migration/config/docker-compose-prod.yml deploy@<IP_VPS_HOSTINGER>:/home/deploy/
scp migration/config/.env.prod.example deploy@<IP_VPS_HOSTINGER>:/home/deploy/

# Exécuter l'installation
chmod +x 05-install-supabase-prod.sh
./05-install-supabase-prod.sh
```

### Étape 3: Installation Supabase TEST
```bash
scp migration/scripts/05-install-supabase-test.sh deploy@<IP_VPS_HOSTINGER>:/home/deploy/
scp migration/config/docker-compose-test.yml deploy@<IP_VPS_HOSTINGER>:/home/deploy/
scp migration/config/.env.test.example deploy@<IP_VPS_HOSTINGER>:/home/deploy/

chmod +x 05-install-supabase-test.sh
./05-install-supabase-test.sh
```

### Étape 4: Installation Supabase DEV
```bash
scp migration/scripts/05-install-supabase-dev.sh deploy@<IP_VPS_HOSTINGER>:/home/deploy/
scp migration/config/docker-compose-dev.yml deploy@<IP_VPS_HOSTINGER>:/home/deploy/
scp migration/config/.env.dev.example deploy@<IP_VPS_HOSTINGER>:/home/deploy/

chmod +x 05-install-supabase-dev.sh
./05-install-supabase-dev.sh
```

### Étape 5: Configuration Nginx
```bash
# Copier les configurations Nginx
sudo scp migration/config/nginx-prod.conf deploy@<IP_VPS_HOSTINGER>:/etc/nginx/sites-available/prod.conf
sudo scp migration/config/nginx-test.conf deploy@<IP_VPS_HOSTINGER>:/etc/nginx/sites-available/test.conf
sudo scp migration/config/nginx-dev.conf deploy@<IP_VPS_HOSTINGER>:/etc/nginx/sites-available/dev.conf

# Créer les symlinks
sudo ln -s /etc/nginx/sites-available/prod.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/test.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/dev.conf /etc/nginx/sites-enabled/

# Tester la configuration
sudo nginx -t

# Recharger Nginx
sudo systemctl reload nginx
```

### Étape 6: Certificats SSL
```bash
# Installer Certbot
sudo apt install certbot python3-certbot-nginx -y

# Générer les certificats pour chaque domaine
sudo certbot --nginx -d domicares.life -d www.domicares.life
sudo certbot --nginx -d test.domicares.life
sudo certbot --nginx -d dev.domicares.life

# Auto-renewal
sudo systemctl enable certbot.timer
```

### Étape 7: Migration des bases de données
```bash
# Production
psql -h localhost -p 5432 -U postgres -d domicares_prod < /path/to/schema.sql
psql -h localhost -p 5432 -U postgres -d domicares_prod < /path/to/data.sql

# Test
psql -h localhost -p 5433 -U postgres -d domicares_test < /path/to/schema.sql

# Dev
psql -h localhost -p 5434 -U postgres -d domicares_dev < /path/to/schema.sql
```

## CI/CD avec GitHub Actions

### Configuration du repository

**Option 1: Repository unique avec branches**
```
github.com/votre-org/domicares
├── main (→ production)
├── staging (→ test)
└── develop (→ dev)
```

**Option 2: Repositories séparés**
```
github.com/votre-org/domicares-prod
github.com/votre-org/domicares-test
github.com/votre-org/domicares-dev
```

### Configuration des secrets GitHub

Dans **Settings → Secrets and variables → Actions**, ajouter:

**Secrets communs**:
- `VPS_HOST`: IP du VPS Hostinger
- `SSH_PRIVATE_KEY`: Clé SSH pour connexion au VPS
- `DEPLOY_USER`: `deploy`

**Secrets par environnement**:
- `PROD_ANON_KEY`, `TEST_ANON_KEY`, `DEV_ANON_KEY`
- `PROD_SERVICE_ROLE_KEY`, `TEST_SERVICE_ROLE_KEY`, `DEV_SERVICE_ROLE_KEY`
- `PROD_FEDAPAY_SECRET_KEY`, `TEST_FEDAPAY_SECRET_KEY`, `DEV_FEDAPAY_SECRET_KEY`
- ... (tous les autres secrets par environnement)

### Workflows

Copier les workflows dans votre repository:
```bash
# Dans votre repo local
mkdir -p .github/workflows
cp migration/.github/workflows/deploy-production.yml .github/workflows/
cp migration/.github/workflows/deploy-test.yml .github/workflows/
cp migration/.github/workflows/deploy-dev.yml .github/workflows/

git add .github/
git commit -m "Add CI/CD workflows"
git push
```

## Workflow de développement

```
Développeur
    ↓
commit → branch develop
    ↓
Déploiement automatique DEV
(dev.domicares.life)
    ↓
Tests et validation
    ↓
merge develop → staging
    ↓
Déploiement automatique TEST
(test.domicares.life)
    ↓
Tests utilisateurs / QA
    ↓
merge staging → main
    ↓
Déploiement automatique PRODUCTION
(domicares.life)
```

## Déploiement manuel

Pour un déploiement manuel d'urgence:

```bash
# Production
./migration/scripts/deploy-prod.sh

# Test
./migration/scripts/deploy-test.sh

# Dev
./migration/scripts/deploy-dev.sh
```

## Backups

### Configuration des backups automatiques

```bash
# Copier les scripts de backup sur le VPS
scp migration/scripts/backup-*.sh deploy@<IP_VPS_HOSTINGER>:/home/deploy/backups/

# Configurer les cron jobs
crontab -e

# Ajouter ces lignes:
0 2 * * * /home/deploy/backups/backup-prod.sh
0 3 * * * /home/deploy/backups/backup-test.sh
0 4 * * * /home/deploy/backups/backup-dev.sh
```

### Restauration

```bash
# Lister les backups disponibles
ls -lh /backups/prod/

# Restaurer une backup
psql -h localhost -p 5432 -U postgres -d domicares_prod < /backups/prod/db_20250112_020000.sql
```

## Monitoring

### Vérifier l'état des services

```bash
# Production
cd /opt/supabase-prod
docker-compose ps
docker-compose logs -f

# Test
cd /opt/supabase-test
docker-compose ps

# Dev
cd /opt/supabase-dev
docker-compose ps
```

### Ressources système

```bash
# Utilisation CPU/RAM
htop

# Utilisation disque
df -h

# Logs Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Uptime monitoring

Configurer des services externes:
- UptimeRobot (gratuit)
- Pingdom
- StatusCake

Pour surveiller:
- https://domicares.life
- https://test.domicares.life
- https://dev.domicares.life

## Troubleshooting

### Service ne démarre pas

```bash
# Vérifier les logs Docker
cd /opt/supabase-{env}
docker-compose logs {service}

# Redémarrer un service spécifique
docker-compose restart {service}

# Redémarrer tous les services
docker-compose down && docker-compose up -d
```

### Base de données inaccessible

```bash
# Vérifier PostgreSQL
docker exec -it supabase-{env}-db psql -U postgres -l

# Vérifier les connexions
docker exec -it supabase-{env}-db psql -U postgres -c "SELECT * FROM pg_stat_activity;"
```

### Certificat SSL expiré

```bash
# Renouveler manuellement
sudo certbot renew

# Forcer le renouvellement
sudo certbot renew --force-renewal
```

### Espace disque plein

```bash
# Nettoyer les logs Docker
docker system prune -a

# Nettoyer les anciens backups
find /backups -type f -mtime +30 -delete

# Analyser l'utilisation disque
du -sh /opt/* /var/www/* /backups/*
```

## Sécurité

### Firewall (UFW)

```bash
# Vérifier le status
sudo ufw status

# Règles configurées automatiquement:
# - Port 22 (SSH)
# - Port 80 (HTTP)
# - Port 443 (HTTPS)
```

### Fail2Ban

```bash
# Vérifier le status
sudo fail2ban-client status

# Débannir une IP
sudo fail2ban-client set sshd unbanip <IP>
```

### Mises à jour de sécurité

```bash
# Mise à jour système (hebdomadaire)
sudo apt update && sudo apt upgrade -y

# Mise à jour des images Docker (mensuelle)
cd /opt/supabase-prod
docker-compose pull
docker-compose up -d
```

## Coûts estimés

### VPS Hostinger
- **VPS KVM 4**: 8 vCPU, 16 GB RAM, 200 GB SSD = ~50€/mois
- **VPS KVM 6**: 12 vCPU, 32 GB RAM, 400 GB SSD = ~90€/mois (recommandé)

### Services externes (inchangés)
- **FedaPay**: Frais de transaction
- **Twilio**: ~10-50€/mois (SMS)
- **Wasabi S3**: ~5€/mois (1TB)
- **Monitoring**: Gratuit (UptimeRobot) ou ~10€/mois (Pingdom)

**Total estimé: 75-140€/mois**

## Support

### Logs utiles
- **Nginx**: `/var/log/nginx/`
- **Supabase**: `docker-compose logs -f` dans `/opt/supabase-{env}/`
- **Application**: Logs dans le dashboard Supabase Studio

### Commandes de diagnostic

```bash
# Santé générale du système
./migration/scripts/health-check.sh

# Status de tous les services
systemctl status nginx
docker ps -a

# Connexions réseau
netstat -tulpn | grep LISTEN
```

## Changelog

- **2025-01-12**: Création de la documentation initiale
