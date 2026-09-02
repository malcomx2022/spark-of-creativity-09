#!/usr/bin/env bash
# =============================================================================
# install-vps.sh — Préparation d'un VPS Ubuntu 22.04/24.04 pour Domicares
# (à lancer en root, une seule fois). Reprend migration/scripts/03-setup-vps.sh
# sans la partie Supabase self-hosted.
# =============================================================================
set -euo pipefail
DEPLOY_USER="${DEPLOY_USER:-deploy}"
apt-get update && apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades git postgresql-client-16 rclone
# Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
# Utilisateur de déploiement
id "$DEPLOY_USER" &>/dev/null || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG docker,sudo "$DEPLOY_USER"
mkdir -p /home/$DEPLOY_USER/.ssh && cp -n /root/.ssh/authorized_keys /home/$DEPLOY_USER/.ssh/ 2>/dev/null || true
chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh && chmod 700 /home/$DEPLOY_USER/.ssh
# Pare-feu : seulement SSH, HTTP, HTTPS
ufw default deny incoming && ufw default allow outgoing
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable
# SSH durci
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart ssh || systemctl restart sshd
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades
# Swap (utile sur 4 Go de RAM)
if ! swapon --show | grep -q swap; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
echo "✔ VPS prêt. Connectez-vous en $DEPLOY_USER, clonez le dépôt puis : cd deploy/vps && cp .env.example .env && docker compose up -d"
