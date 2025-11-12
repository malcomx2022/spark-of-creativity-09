#!/bin/bash
set -e

# ==============================================
# Script 3: Configuration Initiale du VPS
# ==============================================

echo "================================================"
echo "🖥️  CONFIGURATION INITIALE DU VPS"
echo "================================================"
echo ""

# Vérifier si on est root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Ce script doit être exécuté en tant que root"
    echo "   Utilisez: sudo ./03-setup-vps.sh"
    exit 1
fi

echo "✅ Exécution en tant que root"
echo ""

# Variables
VPS_USER="deploy"
SSH_PORT="22"

# 1. Mise à jour du système
echo "📦 Mise à jour du système..."
apt update
apt upgrade -y
echo "✅ Système mis à jour"
echo ""

# 2. Installation des dépendances de base
echo "📦 Installation des outils de base..."
apt install -y \
    curl \
    wget \
    git \
    unzip \
    vim \
    htop \
    build-essential \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    jq \
    tree \
    fail2ban \
    ufw
echo "✅ Outils de base installés"
echo ""

# 3. Installation de Docker
echo "🐳 Installation de Docker..."
if ! command -v docker &> /dev/null; then
    # Ajouter la clé GPG officielle de Docker
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # Ajouter le dépôt Docker
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt update
    apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Démarrer Docker
    systemctl start docker
    systemctl enable docker

    echo "✅ Docker installé et démarré"
else
    echo "✅ Docker déjà installé"
fi
echo ""

# 4. Installation de Docker Compose (standalone)
echo "🐳 Installation de Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_VERSION="v2.24.5"
    curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
    echo "✅ Docker Compose installé"
else
    echo "✅ Docker Compose déjà installé"
fi
docker-compose --version
echo ""

# 5. Installation de Node.js et npm
echo "📦 Installation de Node.js 18..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
    echo "✅ Node.js installé"
else
    echo "✅ Node.js déjà installé"
fi
node --version
npm --version
echo ""

# 6. Installation de PostgreSQL client
echo "🐘 Installation du client PostgreSQL..."
if ! command -v psql &> /dev/null; then
    apt install -y postgresql-client-15
    echo "✅ PostgreSQL client installé"
else
    echo "✅ PostgreSQL client déjà installé"
fi
psql --version
echo ""

# 7. Installation de Nginx
echo "🌐 Installation de Nginx..."
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
    systemctl enable nginx
    echo "✅ Nginx installé"
else
    echo "✅ Nginx déjà installé"
fi
nginx -v
echo ""

# 8. Installation de Certbot (Let's Encrypt)
echo "🔒 Installation de Certbot..."
if ! command -v certbot &> /dev/null; then
    apt install -y certbot python3-certbot-nginx
    echo "✅ Certbot installé"
else
    echo "✅ Certbot déjà installé"
fi
certbot --version
echo ""

# 9. Configuration du pare-feu (UFW)
echo "🔥 Configuration du pare-feu UFW..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow $SSH_PORT/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
echo "✅ Pare-feu configuré"
ufw status
echo ""

# 10. Configuration de Fail2Ban
echo "🛡️  Configuration de Fail2Ban..."
systemctl enable fail2ban
systemctl start fail2ban
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = $SSH_PORT
logpath = /var/log/auth.log

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
EOF
systemctl restart fail2ban
echo "✅ Fail2Ban configuré"
echo ""

# 11. Création d'un utilisateur de déploiement
echo "👤 Création de l'utilisateur de déploiement '$VPS_USER'..."
if ! id "$VPS_USER" &>/dev/null; then
    useradd -m -s /bin/bash $VPS_USER
    usermod -aG docker $VPS_USER
    usermod -aG sudo $VPS_USER
    
    # Créer le dossier SSH
    mkdir -p /home/$VPS_USER/.ssh
    chmod 700 /home/$VPS_USER/.ssh
    chown -R $VPS_USER:$VPS_USER /home/$VPS_USER/.ssh
    
    echo "✅ Utilisateur '$VPS_USER' créé"
    echo ""
    echo "⚠️  IMPORTANT: Configurez l'authentification SSH pour cet utilisateur"
    echo "   1. Copiez votre clé SSH publique: ssh-copy-id $VPS_USER@votre-vps"
    echo "   2. Testez la connexion: ssh $VPS_USER@votre-vps"
else
    echo "✅ Utilisateur '$VPS_USER' existe déjà"
fi
echo ""

# 12. Création des dossiers de travail
echo "📁 Création des dossiers de travail..."
mkdir -p /opt/supabase
mkdir -p /var/www/app
mkdir -p /var/log/app
mkdir -p /backups/postgres
mkdir -p /backups/files

chown -R $VPS_USER:$VPS_USER /opt/supabase
chown -R $VPS_USER:$VPS_USER /var/www/app
chown -R $VPS_USER:$VPS_USER /var/log/app
chown -R $VPS_USER:$VPS_USER /backups

echo "✅ Dossiers créés:"
echo "   - /opt/supabase (Supabase)"
echo "   - /var/www/app (Frontend)"
echo "   - /var/log/app (Logs)"
echo "   - /backups (Backups)"
echo ""

# 13. Configuration des limites système
echo "⚙️  Configuration des limites système..."
cat >> /etc/security/limits.conf << EOF

# Limites pour PostgreSQL/Supabase
* soft nofile 65536
* hard nofile 65536
* soft nproc 65536
* hard nproc 65536
EOF

cat >> /etc/sysctl.conf << EOF

# Optimisations réseau
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15

# Optimisations mémoire
vm.swappiness = 10
vm.overcommit_memory = 1
EOF

sysctl -p
echo "✅ Limites système configurées"
echo ""

# 14. Installation de Supabase CLI
echo "🔧 Installation de Supabase CLI..."
if ! command -v supabase &> /dev/null; then
    npm install -g supabase
    echo "✅ Supabase CLI installé"
else
    echo "✅ Supabase CLI déjà installé"
fi
supabase --version
echo ""

# 15. Résumé
echo "================================================"
echo "✅ CONFIGURATION VPS TERMINÉE"
echo "================================================"
echo ""
echo "📊 Résumé des installations:"
echo "   ✅ Docker & Docker Compose"
echo "   ✅ Node.js 18"
echo "   ✅ PostgreSQL Client"
echo "   ✅ Nginx"
echo "   ✅ Certbot (Let's Encrypt)"
echo "   ✅ UFW (Firewall)"
echo "   ✅ Fail2Ban"
echo "   ✅ Supabase CLI"
echo "   ✅ Utilisateur de déploiement: $VPS_USER"
echo ""
echo "🔐 Sécurité:"
echo "   ✅ Pare-feu UFW activé (ports 22, 80, 443)"
echo "   ✅ Fail2Ban configuré"
echo ""
echo "📁 Dossiers créés:"
echo "   - /opt/supabase"
echo "   - /var/www/app"
echo "   - /var/log/app"
echo "   - /backups"
echo ""
echo "⚠️  PROCHAINES ÉTAPES IMPORTANTES:"
echo "   1. Configurez l'authentification SSH pour l'utilisateur '$VPS_USER'"
echo "   2. Testez la connexion SSH"
echo "   3. Configurez vos DNS (A records)"
echo "   4. Exécutez le script suivant: ./04-install-supabase.sh"
echo ""
echo "🔧 Informations système:"
docker --version
docker-compose --version
node --version
nginx -v
echo ""
