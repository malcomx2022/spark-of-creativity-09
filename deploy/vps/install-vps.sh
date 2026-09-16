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
# Client PostgreSQL 17 (pg_restore compatible avec l'export pg_dump 17 de Supabase ; le serveur reste en 16)
install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" > /etc/apt/sources.list.d/pgdg.list
apt-get update && apt-get install -y postgresql-client-17
# Utilisateur de déploiement
id "$DEPLOY_USER" &>/dev/null || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG docker,sudo "$DEPLOY_USER"
mkdir -p /home/$DEPLOY_USER/.ssh && cp -n /root/.ssh/authorized_keys /home/$DEPLOY_USER/.ssh/ 2>/dev/null || true
chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh && chmod 700 /home/$DEPLOY_USER/.ssh
# Pare-feu : seulement SSH, HTTP, HTTPS
ufw default deny incoming && ufw default allow outgoing
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable
# SSH durci — seulement si une clé publique est déjà autorisée : sur un VPS livré avec un mot de
# passe root (Hostinger, OVH…), couper l'authentification par mot de passe sans clé installée rend
# la machine définitivement inaccessible.
keys=$(cat /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys" 2>/dev/null | grep -cE '^(ssh-|ecdsa-|sk-)' || true)
if [[ "${keys:-0}" -gt 0 ]]; then
  sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
  systemctl restart ssh || systemctl restart sshd
  echo "✔ SSH : mot de passe désactivé ($keys clé(s) publique(s) autorisée(s))"
else
  echo "⚠ SSH : aucune clé publique dans /root/.ssh/authorized_keys — authentification par mot de passe CONSERVÉE"
  echo "  (la couper maintenant rendrait le VPS inaccessible). Depuis votre poste : ssh-copy-id root@<IP>,"
  echo "  vérifiez que « ssh root@<IP> » passe sans mot de passe, puis relancez ce script."
fi
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades
# Swap (utile sur 4 Go de RAM)
if ! swapon --show | grep -q swap; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
echo "✔ VPS prêt. Suite pas à pas : docs/migration-postgresql/07-INSTALLATION-VPS.md (§3 clé de déploiement GitHub, §4 .env, §6 démarrage)."
