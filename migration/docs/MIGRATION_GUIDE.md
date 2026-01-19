# Guide Complet de Migration et Exploitation - DomiCares

## Table des Matières
1. [Workflow Lovable → VPS](#partie-1-workflow-de-développement-lovable--vps)
2. [Configuration du Nom de Domaine](#partie-2-configuration-du-nom-de-domaine)
3. [Système de Supervision](#partie-3-système-de-supervision-monitoring)
4. [Sécurité du Serveur](#partie-4-sécurité-du-serveur)
5. [Scripts d'Automatisation](#partie-5-scripts-dautomatisation)

---

## PARTIE 1: Workflow de Développement Lovable → VPS

### Architecture du Workflow

```
┌─────────────────┐     push      ┌─────────────────┐     webhook     ┌─────────────────┐
│   Lovable AI    │ ───────────►  │     GitHub      │ ──────────────► │   VPS Hostinger │
│  (Développement)│               │   (Repository)  │                 │   (Production)  │
└─────────────────┘               └─────────────────┘                 └─────────────────┘
                                          │
                                          │ sync
                                          ▼
                                  ┌─────────────────┐
                                  │  Supabase Cloud │
                                  │ (DB + Functions)│
                                  └─────────────────┘
```

### 1.1 Configuration GitHub Actions (CI/CD)

Créez le fichier `.github/workflows/deploy.yml` dans votre repo :

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test || true

      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          VITE_SUPABASE_PROJECT_ID: ${{ secrets.VITE_SUPABASE_PROJECT_ID }}

      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USERNAME }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd ~/domicares
            git pull origin main
            npm ci --production
            npm run build
            sudo systemctl reload nginx

      - name: Notify on success
        if: success()
        run: echo "✅ Deployment successful!"

      - name: Notify on failure
        if: failure()
        run: echo "❌ Deployment failed!"
```

### 1.2 Configuration des Secrets GitHub

Dans GitHub → Settings → Secrets and variables → Actions, ajoutez :

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | IP de votre VPS Hostinger |
| `VPS_USERNAME` | `domicares` |
| `VPS_SSH_KEY` | Clé SSH privée (contenu de `~/.ssh/id_rsa`) |
| `VITE_SUPABASE_URL` | URL Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clé anonyme Supabase |
| `VITE_SUPABASE_PROJECT_ID` | ID projet Supabase |

### 1.3 Synchronisation des Edge Functions Supabase

Créez `.github/workflows/supabase-functions.yml` :

```yaml
name: Deploy Supabase Functions

on:
  push:
    branches: [main]
    paths:
      - 'supabase/functions/**'
  workflow_dispatch:

jobs:
  deploy-functions:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Link Supabase Project
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Deploy Functions
        run: supabase functions deploy
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

### 1.4 Workflow Quotidien avec Lovable

```
1. Développez sur Lovable AI
   └── Lovable push automatiquement vers GitHub

2. GitHub Actions se déclenche
   └── Build + Tests + Deploy sur VPS

3. Si modifications Edge Functions
   └── Déploiement automatique sur Supabase

4. VPS reçoit les mises à jour
   └── Site mis à jour automatiquement
```

---

## PARTIE 2: Configuration du Nom de Domaine

### 2.1 Achat du Domaine (si pas encore fait)

Fournisseurs recommandés :
- **Hostinger** (intégré avec votre VPS)
- **Namecheap**
- **OVH**
- **Gandi**

### 2.2 Configuration DNS

#### Chez votre registrar (ex: Hostinger), ajoutez ces enregistrements :

```dns
# Enregistrements A (IPv4)
Type    Nom         Valeur              TTL
A       @           VOTRE_IP_VPS        3600
A       www         VOTRE_IP_VPS        3600

# Enregistrement AAAA (IPv6 - si disponible)
AAAA    @           VOTRE_IPV6_VPS      3600
AAAA    www         VOTRE_IPV6_VPS      3600

# Enregistrement CAA (sécurité SSL)
CAA     @           0 issue "letsencrypt.org"

# Enregistrements MX (si email)
MX      @           10 mail.domicares.com   3600

# SPF (anti-spam email)
TXT     @           "v=spf1 ip4:VOTRE_IP_VPS ~all"
```

### 2.3 Configuration Nginx Multi-Domaine

```bash
sudo nano /etc/nginx/sites-available/domicares
```

```nginx
# Redirection HTTP vers HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name domicares.com www.domicares.com;
    return 301 https://$server_name$request_uri;
}

# Configuration HTTPS principale
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name domicares.com www.domicares.com;

    # Certificats SSL (générés par Certbot)
    ssl_certificate /etc/letsencrypt/live/domicares.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/domicares.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/domicares.com/chain.pem;

    # Configuration SSL optimisée
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS (15768000 seconds = 6 months)
    add_header Strict-Transport-Security "max-age=15768000; includeSubDomains" always;

    # Racine du site
    root /home/domicares/domicares/dist;
    index index.html;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;

    # Brotli (si installé)
    # brotli on;
    # brotli_comp_level 6;
    # brotli_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Cache des assets statiques
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|avif)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # SPA Routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Sécurité
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Headers de sécurité
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;

    # Content Security Policy
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.mapbox.com https://app.fedapay.com; style-src 'self' 'unsafe-inline' https://api.mapbox.com; img-src 'self' data: blob: https://*.supabase.co https://*.mapbox.com https://*.wasabisys.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://api.fedapay.com; frame-src https://app.fedapay.com; font-src 'self' data:;" always;

    # Logs
    access_log /var/log/nginx/domicares.access.log;
    error_log /var/log/nginx/domicares.error.log;
}
```

### 2.4 Génération du Certificat SSL

```bash
# Génération du certificat
sudo certbot --nginx -d domicares.com -d www.domicares.com

# Test du renouvellement automatique
sudo certbot renew --dry-run

# Vérifier la configuration
sudo nginx -t
sudo systemctl reload nginx
```

### 2.5 Vérification DNS

```bash
# Vérifier la propagation DNS
dig domicares.com +short
dig www.domicares.com +short

# Tester SSL
curl -I https://domicares.com
openssl s_client -connect domicares.com:443 -servername domicares.com
```

---

## PARTIE 3: Système de Supervision (Monitoring)

### 3.1 Installation de Netdata (Monitoring Temps Réel)

```bash
# Installation automatique
wget -O /tmp/netdata-kickstart.sh https://get.netdata.cloud/kickstart.sh && sh /tmp/netdata-kickstart.sh --stable-channel

# Démarrage
sudo systemctl enable netdata
sudo systemctl start netdata
```

Configuration Nginx pour Netdata (accès sécurisé) :

```bash
sudo nano /etc/nginx/sites-available/monitoring
```

```nginx
server {
    listen 443 ssl http2;
    server_name monitoring.domicares.com;

    ssl_certificate /etc/letsencrypt/live/domicares.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/domicares.com/privkey.pem;

    # Authentification basique
    auth_basic "Monitoring Access";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://127.0.0.1:19999;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Créer le fichier d'authentification :
```bash
sudo apt install apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd admin
# Entrez un mot de passe sécurisé

sudo ln -s /etc/nginx/sites-available/monitoring /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 3.2 Installation de Uptime Kuma (Monitoring de Disponibilité)

```bash
# Créer le répertoire
mkdir -p ~/monitoring/uptime-kuma
cd ~/monitoring/uptime-kuma

# Installation avec Docker (recommandé)
sudo apt install docker.io docker-compose -y
sudo usermod -aG docker $USER

# docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  uptime-kuma:
    image: louislam/uptime-kuma:latest
    container_name: uptime-kuma
    volumes:
      - ./data:/app/data
    ports:
      - "3001:3001"
    restart: unless-stopped
EOF

docker-compose up -d
```

Configuration Nginx pour Uptime Kuma :
```nginx
server {
    listen 443 ssl http2;
    server_name status.domicares.com;

    ssl_certificate /etc/letsencrypt/live/domicares.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/domicares.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3.3 Alertes par Email/SMS

Créez un script d'alerte :

```bash
nano ~/scripts/alert.sh
```

```bash
#!/bin/bash

# Configuration
WEBHOOK_URL="https://hooks.slack.com/services/xxx/xxx/xxx"  # Ou Discord
EMAIL="admin@domicares.com"
SITE_URL="https://domicares.com"

# Vérification du site
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $SITE_URL)

if [ "$HTTP_CODE" != "200" ]; then
    MESSAGE="🚨 ALERTE: DomiCares est DOWN! Code HTTP: $HTTP_CODE"

    # Envoyer notification Slack/Discord
    curl -X POST -H 'Content-type: application/json' \
        --data "{\"text\":\"$MESSAGE\"}" \
        $WEBHOOK_URL

    # Envoyer email (nécessite mailutils)
    echo "$MESSAGE" | mail -s "ALERTE DomiCares" $EMAIL
fi
```

```bash
chmod +x ~/scripts/alert.sh

# Cron job toutes les 5 minutes
(crontab -l 2>/dev/null; echo "*/5 * * * * ~/scripts/alert.sh") | crontab -
```

### 3.4 Monitoring des Logs avec GoAccess

```bash
# Installation
sudo apt install goaccess -y

# Génération de rapport HTML en temps réel
sudo goaccess /var/log/nginx/domicares.access.log -o /var/www/html/report.html --log-format=COMBINED --real-time-html

# Ou rapport statique
sudo goaccess /var/log/nginx/domicares.access.log -o ~/reports/access-report.html --log-format=COMBINED
```

### 3.5 Monitoring Supabase

Configurez des alertes dans Supabase Dashboard :
1. Dashboard → Settings → Alerts
2. Configurez des alertes pour :
   - Utilisation CPU > 80%
   - Utilisation mémoire > 80%
   - Erreurs Edge Functions
   - Connexions DB max

---

## PARTIE 4: Sécurité du Serveur

### 4.1 Configuration SSH Sécurisée

```bash
sudo nano /etc/ssh/sshd_config
```

```bash
# Désactiver l'authentification par mot de passe
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no

# Changer le port SSH (optionnel mais recommandé)
Port 2222

# Limiter les utilisateurs
AllowUsers domicares

# Timeout
ClientAliveInterval 300
ClientAliveCountMax 2

# Désactiver les protocoles obsolètes
Protocol 2
```

```bash
sudo systemctl restart sshd

# N'oubliez pas d'ouvrir le nouveau port
sudo ufw allow 2222/tcp
sudo ufw delete allow OpenSSH
```

### 4.2 Installation de Fail2Ban (Protection Brute Force)

```bash
sudo apt install fail2ban -y

sudo nano /etc/fail2ban/jail.local
```

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
destemail = admin@domicares.com
sender = fail2ban@domicares.com
action = %(action_mwl)s

[sshd]
enabled = true
port = 2222
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 86400

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
port = http,https
logpath = /var/log/nginx/error.log

[nginx-botsearch]
enabled = true
filter = nginx-botsearch
port = http,https
logpath = /var/log/nginx/access.log
maxretry = 2
```

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Vérifier le statut
sudo fail2ban-client status
sudo fail2ban-client status sshd
```

### 4.3 Installation de CrowdSec (Protection Avancée)

```bash
# Installation
curl -s https://install.crowdsec.net | sudo sh

# Installation du bouncer Nginx
sudo apt install crowdsec-firewall-bouncer-iptables -y

# Ajouter les collections
sudo cscli collections install crowdsecurity/nginx
sudo cscli collections install crowdsecurity/linux

# Redémarrer
sudo systemctl restart crowdsec
```

### 4.4 Configuration du Firewall UFW Avancée

```bash
# Règles de base
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH (port personnalisé)
sudo ufw allow 2222/tcp comment 'SSH'

# Web
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

# Monitoring (interne seulement)
sudo ufw allow from 10.0.0.0/8 to any port 19999 comment 'Netdata'
sudo ufw allow from 10.0.0.0/8 to any port 3001 comment 'Uptime Kuma'

# Rate limiting SSH
sudo ufw limit 2222/tcp

# Activer
sudo ufw enable
sudo ufw status verbose
```

### 4.5 Installation de ClamAV (Antivirus)

```bash
sudo apt install clamav clamav-daemon -y

# Mettre à jour les signatures
sudo systemctl stop clamav-freshclam
sudo freshclam
sudo systemctl start clamav-freshclam

# Scan programmé
cat > ~/scripts/clamav-scan.sh << 'EOF'
#!/bin/bash
LOGFILE="/var/log/clamav/daily-scan.log"
SCANDIR="/home/domicares"

echo "=== ClamAV Scan $(date) ===" >> $LOGFILE
clamscan -r --infected --log=$LOGFILE $SCANDIR
EOF

chmod +x ~/scripts/clamav-scan.sh

# Cron quotidien à 3h du matin
(crontab -l 2>/dev/null; echo "0 3 * * * ~/scripts/clamav-scan.sh") | crontab -
```

### 4.6 Configuration des Mises à Jour Automatiques

```bash
sudo apt install unattended-upgrades -y

sudo nano /etc/apt/apt.conf.d/50unattended-upgrades
```

```
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}:${distro_codename}-updates";
};

Unattended-Upgrade::Mail "admin@domicares.com";
Unattended-Upgrade::MailReport "on-change";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
```

```bash
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 4.7 Audit de Sécurité avec Lynis

```bash
# Installation
sudo apt install lynis -y

# Lancer un audit complet
sudo lynis audit system

# Rapport dans /var/log/lynis.log
```

### 4.8 Sauvegarde Automatique

```bash
nano ~/scripts/backup.sh
```

```bash
#!/bin/bash

# Configuration
BACKUP_DIR="/home/domicares/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# Créer le répertoire
mkdir -p $BACKUP_DIR

# Backup du code
tar -czf $BACKUP_DIR/code_$DATE.tar.gz ~/domicares/dist

# Backup des configurations Nginx
sudo tar -czf $BACKUP_DIR/nginx_$DATE.tar.gz /etc/nginx/sites-available

# Backup Supabase (via CLI)
cd ~/domicares
supabase db dump -f $BACKUP_DIR/db_$DATE.sql

# Compression
gzip $BACKUP_DIR/db_$DATE.sql

# Nettoyage des anciens backups
find $BACKUP_DIR -type f -mtime +$RETENTION_DAYS -delete

# Upload vers stockage externe (optionnel - S3/Wasabi)
# aws s3 sync $BACKUP_DIR s3://domicares-backups/

echo "✅ Backup completed: $DATE"
```

```bash
chmod +x ~/scripts/backup.sh

# Cron quotidien à 2h du matin
(crontab -l 2>/dev/null; echo "0 2 * * * ~/scripts/backup.sh >> ~/logs/backup.log 2>&1") | crontab -
```

---

## PARTIE 5: Scripts d'Automatisation

### 5.1 Script d'Installation Complète du VPS

```bash
nano ~/scripts/setup-vps.sh
```

```bash
#!/bin/bash
set -e

echo "🚀 Installation complète du VPS pour DomiCares"
echo "=============================================="

# Variables
DOMAIN="domicares.com"
USER="domicares"
NODE_VERSION="20"

# Mise à jour système
echo "📦 Mise à jour du système..."
sudo apt update && sudo apt upgrade -y

# Installation des dépendances
echo "📦 Installation des dépendances..."
sudo apt install -y \
    curl wget git unzip \
    nginx certbot python3-certbot-nginx \
    fail2ban ufw \
    htop ncdu tree \
    apache2-utils

# Node.js
echo "📦 Installation de Node.js $NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION.x | sudo -E bash -
sudo apt install -y nodejs

# PM2
echo "📦 Installation de PM2..."
sudo npm install -g pm2

# Supabase CLI
echo "📦 Installation de Supabase CLI..."
sudo npm install -g supabase

# Docker (pour monitoring)
echo "📦 Installation de Docker..."
sudo apt install -y docker.io docker-compose
sudo usermod -aG docker $USER

# Netdata
echo "📦 Installation de Netdata..."
wget -O /tmp/netdata-kickstart.sh https://get.netdata.cloud/kickstart.sh
sh /tmp/netdata-kickstart.sh --stable-channel --non-interactive

# Fail2Ban
echo "🔒 Configuration de Fail2Ban..."
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# UFW
echo "🔒 Configuration du Firewall..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Créer les répertoires
echo "📁 Création des répertoires..."
mkdir -p ~/domicares ~/scripts ~/logs ~/backups ~/monitoring

# Permissions
echo "🔐 Configuration des permissions..."
chmod 700 ~/scripts ~/backups

echo ""
echo "✅ Installation terminée!"
echo ""
echo "Prochaines étapes:"
echo "1. Cloner le repo: git clone <url> ~/domicares"
echo "2. Configurer .env.production"
echo "3. Configurer Nginx et SSL"
echo "4. Configurer les DNS"
```

### 5.2 Script de Déploiement

```bash
nano ~/scripts/deploy.sh
```

```bash
#!/bin/bash
set -e

# Configuration
APP_DIR="/home/domicares/domicares"
LOG_FILE="/home/domicares/logs/deploy.log"
BACKUP_DIR="/home/domicares/backups"
DATE=$(date +%Y%m%d_%H%M%S)

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

log "🚀 Début du déploiement..."

cd $APP_DIR

# Backup avant déploiement
log "💾 Création du backup..."
tar -czf $BACKUP_DIR/pre-deploy_$DATE.tar.gz dist/ 2>/dev/null || true

# Pull des modifications
log "📥 Récupération des modifications..."
git fetch origin
git reset --hard origin/main

# Installation des dépendances
log "📦 Installation des dépendances..."
npm ci --production=false

# Build
log "🔨 Build de production..."
npm run build

# Vérification du build
if [ ! -d "dist" ]; then
    log "❌ Erreur: Le build a échoué!"
    exit 1
fi

# Reload Nginx
log "🔄 Rechargement de Nginx..."
sudo systemctl reload nginx

# Nettoyage
log "🧹 Nettoyage..."
npm prune --production

# Vérification du site
log "🔍 Vérification du site..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://domicares.com)

if [ "$HTTP_CODE" = "200" ]; then
    log "✅ Déploiement réussi! (HTTP $HTTP_CODE)"
else
    log "⚠️ Attention: Le site retourne HTTP $HTTP_CODE"
fi

# Nettoyage des anciens backups (garder 5)
ls -t $BACKUP_DIR/pre-deploy_*.tar.gz | tail -n +6 | xargs -r rm

log "🎉 Déploiement terminé!"
```

### 5.3 Script de Santé du Système

```bash
nano ~/scripts/health-check.sh
```

```bash
#!/bin/bash

echo "=========================================="
echo "🏥 Health Check - DomiCares"
echo "Date: $(date)"
echo "=========================================="

# CPU
echo ""
echo "📊 CPU Usage:"
top -bn1 | grep "Cpu(s)" | awk '{print "   Usage: " 100-$8 "%"}'

# Mémoire
echo ""
echo "💾 Memory Usage:"
free -h | awk '/^Mem:/ {print "   Used: " $3 " / " $2 " (" int($3/$2*100) "%)"}'

# Disque
echo ""
echo "💿 Disk Usage:"
df -h / | awk 'NR==2 {print "   Used: " $3 " / " $2 " (" $5 ")"}'

# Services
echo ""
echo "🔧 Services Status:"
services=("nginx" "fail2ban" "netdata" "docker")
for service in "${services[@]}"; do
    status=$(systemctl is-active $service 2>/dev/null || echo "not installed")
    if [ "$status" = "active" ]; then
        echo "   ✅ $service: $status"
    else
        echo "   ❌ $service: $status"
    fi
done

# Site Web
echo ""
echo "🌐 Website Status:"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://domicares.com 2>/dev/null || echo "error")
if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ domicares.com: HTTP $HTTP_CODE"
else
    echo "   ❌ domicares.com: HTTP $HTTP_CODE"
fi

# SSL
echo ""
echo "🔒 SSL Certificate:"
expiry=$(echo | openssl s_client -servername domicares.com -connect domicares.com:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$expiry" ]; then
    echo "   Expires: $expiry"
else
    echo "   ❌ Unable to check SSL"
fi

# Fail2Ban
echo ""
echo "🛡️ Fail2Ban Status:"
banned=$(sudo fail2ban-client status sshd 2>/dev/null | grep "Currently banned" | awk '{print $NF}')
echo "   Currently banned IPs: ${banned:-0}"

# Dernières connexions SSH
echo ""
echo "👤 Recent SSH Logins:"
last -n 5 | head -5 | awk '{print "   " $1 " - " $3 " - " $4 " " $5 " " $6}'

echo ""
echo "=========================================="
```

```bash
chmod +x ~/scripts/*.sh
```

### 5.4 Crontab Complète

```bash
crontab -e
```

```cron
# DomiCares - Tâches Automatisées
# ================================

# Health check toutes les heures
0 * * * * ~/scripts/health-check.sh >> ~/logs/health.log 2>&1

# Backup quotidien à 2h
0 2 * * * ~/scripts/backup.sh >> ~/logs/backup.log 2>&1

# Scan antivirus quotidien à 3h
0 3 * * * ~/scripts/clamav-scan.sh >> ~/logs/clamav.log 2>&1

# Monitoring du site toutes les 5 minutes
*/5 * * * * ~/scripts/alert.sh >> ~/logs/alert.log 2>&1

# Nettoyage des logs hebdomadaire
0 4 * * 0 find ~/logs -type f -mtime +30 -delete

# Renouvellement SSL (certbot le fait automatiquement, mais vérification)
0 5 1 * * sudo certbot renew --quiet

# Rapport hebdomadaire
0 8 * * 1 ~/scripts/health-check.sh | mail -s "DomiCares Weekly Report" admin@domicares.com
```

---

## Résumé des URLs et Accès

| Service | URL | Authentification |
|---------|-----|------------------|
| Site principal | https://domicares.com | - |
| Monitoring Netdata | https://monitoring.domicares.com | HTTP Basic Auth |
| Status Page | https://status.domicares.com | Configurable |
| Supabase Dashboard | https://supabase.com/dashboard | Login Supabase |
| GitHub Actions | https://github.com/xxx/repo/actions | Login GitHub |

---

## Checklist Finale

- [ ] VPS configuré avec Ubuntu 24
- [ ] Node.js 20 installé
- [ ] Nginx configuré avec SSL
- [ ] Domaine configuré (DNS propagé)
- [ ] GitHub Actions configuré
- [ ] Supabase Cloud configuré
- [ ] Edge Functions déployées
- [ ] Secrets Supabase configurés
- [ ] Fail2Ban actif
- [ ] UFW configuré
- [ ] Netdata installé
- [ ] Backups automatiques configurés
- [ ] Alertes configurées
- [ ] FedaPay webhook mis à jour
- [ ] Tests de bout en bout passés
