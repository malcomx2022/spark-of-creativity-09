#!/bin/bash
#===============================================================================
# DomiCares - Script d'Installation VPS Ubuntu 24
# Usage: curl -sSL https://raw.githubusercontent.com/USER/REPO/main/migration/scripts/setup-vps.sh | bash
# Ou: bash setup-vps.sh
#===============================================================================

set -e

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_USER="domicares"
APP_DIR="/home/$APP_USER/domicares"
NODE_VERSION="20"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}       ${GREEN}DomiCares - Installation VPS Ubuntu 24${NC}           ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}             Healthcare Platform Migration              ${BLUE}║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Ce script doit être exécuté en tant que root"
        log_info "Utilisez: sudo bash setup-vps.sh"
        exit 1
    fi
}

check_ubuntu() {
    if [ ! -f /etc/os-release ]; then
        log_error "Impossible de détecter l'OS"
        exit 1
    fi

    . /etc/os-release

    if [ "$ID" != "ubuntu" ]; then
        log_error "Ce script est conçu pour Ubuntu. OS détecté: $ID"
        exit 1
    fi

    log_info "OS détecté: $PRETTY_NAME"
}

update_system() {
    log_info "Mise à jour du système..."
    apt update
    apt upgrade -y
    log_success "Système mis à jour"
}

install_base_packages() {
    log_info "Installation des paquets de base..."
    apt install -y \
        curl \
        wget \
        git \
        unzip \
        htop \
        ncdu \
        tree \
        jq \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        apache2-utils

    log_success "Paquets de base installés"
}

create_app_user() {
    log_info "Création de l'utilisateur $APP_USER..."

    if id "$APP_USER" &>/dev/null; then
        log_warning "L'utilisateur $APP_USER existe déjà"
    else
        adduser --disabled-password --gecos "" $APP_USER
        usermod -aG sudo $APP_USER

        # Permettre sudo sans mot de passe pour certaines commandes
        echo "$APP_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx, /usr/bin/systemctl restart nginx" > /etc/sudoers.d/$APP_USER

        log_success "Utilisateur $APP_USER créé"
    fi

    # Créer les répertoires
    mkdir -p /home/$APP_USER/{domicares,scripts,logs,backups,monitoring}
    chown -R $APP_USER:$APP_USER /home/$APP_USER
}

install_nodejs() {
    log_info "Installation de Node.js $NODE_VERSION..."

    curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION.x | bash -
    apt install -y nodejs

    # Vérification
    node_version=$(node --version)
    npm_version=$(npm --version)

    log_success "Node.js $node_version installé (npm $npm_version)"

    # Installer les packages globaux
    log_info "Installation des packages npm globaux..."
    npm install -g pm2 supabase

    log_success "PM2 et Supabase CLI installés"
}

install_nginx() {
    log_info "Installation de Nginx..."

    apt install -y nginx

    # Configurer Nginx
    systemctl enable nginx
    systemctl start nginx

    # Supprimer le site par défaut
    rm -f /etc/nginx/sites-enabled/default

    log_success "Nginx installé et configuré"
}

install_certbot() {
    log_info "Installation de Certbot (Let's Encrypt)..."

    apt install -y certbot python3-certbot-nginx

    log_success "Certbot installé"
}

configure_firewall() {
    log_info "Configuration du firewall UFW..."

    apt install -y ufw

    ufw default deny incoming
    ufw default allow outgoing

    # Règles de base
    ufw allow ssh
    ufw allow 'Nginx Full'

    # Activer
    ufw --force enable

    log_success "Firewall UFW configuré"
    ufw status
}

install_fail2ban() {
    log_info "Installation de Fail2Ban..."

    apt install -y fail2ban

    # Configuration personnalisée
    cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
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
EOF

    systemctl enable fail2ban
    systemctl restart fail2ban

    log_success "Fail2Ban installé et configuré"
}

install_docker() {
    log_info "Installation de Docker..."

    # Installer Docker
    apt install -y docker.io docker-compose

    # Ajouter l'utilisateur au groupe docker
    usermod -aG docker $APP_USER

    systemctl enable docker
    systemctl start docker

    log_success "Docker installé"
}

install_netdata() {
    log_info "Installation de Netdata (monitoring)..."

    wget -O /tmp/netdata-kickstart.sh https://get.netdata.cloud/kickstart.sh
    bash /tmp/netdata-kickstart.sh --stable-channel --non-interactive

    log_success "Netdata installé (accessible sur http://localhost:19999)"
}

create_nginx_config() {
    log_info "Création de la configuration Nginx template..."

    cat > /etc/nginx/sites-available/domicares << 'EOF'
# DomiCares - Configuration Nginx
# Remplacez VOTRE_DOMAINE par votre nom de domaine

server {
    listen 80;
    listen [::]:80;
    server_name VOTRE_DOMAINE www.VOTRE_DOMAINE;

    root /home/domicares/domicares/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|avif)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # SPA Routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security - hide sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Logs
    access_log /var/log/nginx/domicares.access.log;
    error_log /var/log/nginx/domicares.error.log;
}
EOF

    log_success "Configuration Nginx créée dans /etc/nginx/sites-available/domicares"
    log_warning "N'oubliez pas de remplacer VOTRE_DOMAINE par votre nom de domaine"
}

create_helper_scripts() {
    log_info "Création des scripts utilitaires..."

    # Script de déploiement
    cat > /home/$APP_USER/scripts/deploy.sh << 'EOF'
#!/bin/bash
set -e

APP_DIR="/home/domicares/domicares"
BACKUP_DIR="/home/domicares/backups"
LOG_FILE="/home/domicares/logs/deploy.log"
DATE=$(date +%Y%m%d_%H%M%S)

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

log "Starting deployment..."

cd $APP_DIR

# Backup
log "Creating backup..."
tar -czf $BACKUP_DIR/pre-deploy_$DATE.tar.gz dist/ 2>/dev/null || true

# Pull changes
log "Pulling changes..."
git pull origin main

# Install and build
log "Installing dependencies..."
npm ci --production=false

log "Building..."
npm run build

# Verify
if [ ! -d "dist" ]; then
    log "ERROR: Build failed!"
    exit 1
fi

# Reload nginx
log "Reloading Nginx..."
sudo systemctl reload nginx

# Cleanup old backups
ls -t $BACKUP_DIR/pre-deploy_*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm

log "Deployment successful!"
EOF

    # Script de health check
    cat > /home/$APP_USER/scripts/health-check.sh << 'EOF'
#!/bin/bash

echo "=========================================="
echo "DomiCares Health Check - $(date)"
echo "=========================================="

# CPU
echo ""
echo "CPU Usage:"
top -bn1 | grep "Cpu(s)" | awk '{print "  " 100-$8 "%"}'

# Memory
echo ""
echo "Memory Usage:"
free -h | awk '/^Mem:/ {print "  " $3 " / " $2}'

# Disk
echo ""
echo "Disk Usage:"
df -h / | awk 'NR==2 {print "  " $3 " / " $2 " (" $5 ")"}'

# Services
echo ""
echo "Services:"
for svc in nginx fail2ban docker netdata; do
    status=$(systemctl is-active $svc 2>/dev/null || echo "not found")
    if [ "$status" = "active" ]; then
        echo "  [OK] $svc"
    else
        echo "  [--] $svc: $status"
    fi
done

# Website (if configured)
if [ -f /home/domicares/domicares/dist/index.html ]; then
    echo ""
    echo "Website:"
    echo "  Build exists: Yes"
fi

echo ""
echo "=========================================="
EOF

    # Script de backup
    cat > /home/$APP_USER/scripts/backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/home/domicares/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

mkdir -p $BACKUP_DIR

# Backup code
tar -czf $BACKUP_DIR/code_$DATE.tar.gz /home/domicares/domicares/dist 2>/dev/null || true

# Backup nginx config
sudo tar -czf $BACKUP_DIR/nginx_$DATE.tar.gz /etc/nginx/sites-available 2>/dev/null || true

# Cleanup old backups
find $BACKUP_DIR -type f -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $DATE"
EOF

    # Permissions
    chmod +x /home/$APP_USER/scripts/*.sh
    chown -R $APP_USER:$APP_USER /home/$APP_USER/scripts

    log_success "Scripts créés dans /home/$APP_USER/scripts/"
}

setup_crontab() {
    log_info "Configuration des tâches cron..."

    # Crontab pour l'utilisateur domicares
    cat > /tmp/domicares-cron << 'EOF'
# DomiCares - Automated Tasks
# Health check every hour
0 * * * * /home/domicares/scripts/health-check.sh >> /home/domicares/logs/health.log 2>&1

# Backup daily at 2am
0 2 * * * /home/domicares/scripts/backup.sh >> /home/domicares/logs/backup.log 2>&1

# Cleanup old logs weekly
0 4 * * 0 find /home/domicares/logs -type f -mtime +30 -delete
EOF

    crontab -u $APP_USER /tmp/domicares-cron
    rm /tmp/domicares-cron

    log_success "Tâches cron configurées"
}

secure_ssh() {
    log_info "Sécurisation de SSH..."

    # Backup original config
    cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

    # Modifications de sécurité
    sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
    sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

    log_warning "SSH configuré pour n'accepter que les clés SSH"
    log_warning "Assurez-vous d'avoir configuré votre clé SSH avant de vous déconnecter!"

    systemctl reload sshd

    log_success "SSH sécurisé"
}

print_summary() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}              ${BLUE}Installation Terminée!${NC}                     ${GREEN}║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Composants installés:${NC}"
    echo "  - Node.js $(node --version)"
    echo "  - npm $(npm --version)"
    echo "  - PM2 $(pm2 --version)"
    echo "  - Nginx $(nginx -v 2>&1 | cut -d'/' -f2)"
    echo "  - Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
    echo "  - Fail2Ban"
    echo "  - Certbot"
    echo "  - Netdata"
    echo ""
    echo -e "${BLUE}Prochaines étapes:${NC}"
    echo ""
    echo "1. Cloner le repository:"
    echo -e "   ${YELLOW}su - domicares${NC}"
    echo -e "   ${YELLOW}git clone https://github.com/VOTRE_USER/spark-of-creativity-09.git domicares${NC}"
    echo ""
    echo "2. Créer le fichier .env.production:"
    echo -e "   ${YELLOW}cd domicares && nano .env.production${NC}"
    echo ""
    echo "3. Configurer le domaine dans Nginx:"
    echo -e "   ${YELLOW}sudo nano /etc/nginx/sites-available/domicares${NC}"
    echo "   (Remplacer VOTRE_DOMAINE par votre domaine)"
    echo ""
    echo "4. Activer le site Nginx:"
    echo -e "   ${YELLOW}sudo ln -s /etc/nginx/sites-available/domicares /etc/nginx/sites-enabled/${NC}"
    echo -e "   ${YELLOW}sudo nginx -t && sudo systemctl reload nginx${NC}"
    echo ""
    echo "5. Générer le certificat SSL:"
    echo -e "   ${YELLOW}sudo certbot --nginx -d votre-domaine.com -d www.votre-domaine.com${NC}"
    echo ""
    echo "6. Build et déploiement:"
    echo -e "   ${YELLOW}npm install && npm run build${NC}"
    echo ""
    echo -e "${BLUE}Accès monitoring:${NC}"
    echo "  Netdata: http://VOTRE_IP:19999"
    echo ""
    echo -e "${BLUE}Scripts utiles:${NC}"
    echo "  /home/domicares/scripts/deploy.sh      - Déploiement"
    echo "  /home/domicares/scripts/health-check.sh - Vérification santé"
    echo "  /home/domicares/scripts/backup.sh      - Backup manuel"
    echo ""
    echo -e "${GREEN}Bonne migration!${NC}"
    echo ""
}

# Main execution
main() {
    print_banner
    check_root
    check_ubuntu

    echo ""
    read -p "Voulez-vous continuer l'installation? (y/n) " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation annulée."
        exit 0
    fi

    update_system
    install_base_packages
    create_app_user
    install_nodejs
    install_nginx
    install_certbot
    configure_firewall
    install_fail2ban
    install_docker
    install_netdata
    create_nginx_config
    create_helper_scripts
    setup_crontab
    # secure_ssh  # Décommentez après avoir configuré votre clé SSH

    print_summary
}

main "$@"
