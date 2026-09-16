#!/usr/bin/env bash
# =============================================================================
# install-vps.sh — Préparation d'un VPS Ubuntu 22.04/24.04 pour Domicares
# (à lancer en root, une seule fois). Reprend migration/scripts/03-setup-vps.sh
# sans la partie Supabase self-hosted.
# =============================================================================
set -euo pipefail
DEPLOY_USER="${DEPLOY_USER:-deploy}"
PG17=/usr/lib/postgresql/17/bin
CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
# Un dépôt déclaré deux fois avec des chemins de clé différents rend apt inutilisable
# (« Conflicting values set for option Signed-By »), et toutes les installations suivantes
# échouent. Les images de certains hébergeurs (Hostinger, OVH…) livrent déjà le dépôt Docker :
# on ne le réécrit que s'il est absent.
has_source() { grep -Rqs "$1" /etc/apt/sources.list /etc/apt/sources.list.d/ 2>/dev/null; }

apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades git postgresql-client-16 rclone

# Docker
if has_source 'download\.docker\.com'; then
  echo "  dépôt Docker déjà configuré par l'image : conservé tel quel"
else
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $CODENAME stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
fi
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Client PostgreSQL 17 (pg_restore compatible avec l'export pg_dump 17 de Supabase ; le serveur reste en 16)
if has_source 'apt\.postgresql\.org'; then
  echo "  dépôt PostgreSQL déjà configuré : conservé tel quel"
else
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $CODENAME-pgdg main" > /etc/apt/sources.list.d/pgdg.list
fi
apt-get update
apt-get install -y postgresql-client-17
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
# fail2ban : ne jamais bannir le poste d'administration. Le durcissement SSH ci-dessus fait
# souvent échouer quelques connexions (phrase de passe, bascule clé/mot de passe) ; au-delà de
# cinq essais la jail sshd jette les paquets et « ssh » part en « Connection timed out », sans
# autre accès que la console du fournisseur. ADMIN_IP force l'adresse si SSH_CLIENT est absent.
ADMIN_IP="${ADMIN_IP:-$(awk '{print $1}' <<<"${SSH_CLIENT:-}")}"
if [[ -n "$ADMIN_IP" ]]; then
  printf '[DEFAULT]\nignoreip = 127.0.0.1/8 ::1 %s\nbantime = 10m\n' "$ADMIN_IP" > /etc/fail2ban/jail.local
  echo "  fail2ban : $ADMIN_IP en liste blanche (ignoreip)"
else
  echo "  ⚠ fail2ban : adresse d'administration inconnue, aucune liste blanche (ADMIN_IP=<ip> pour la définir)"
fi
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades
# Swap (utile sur 4 Go de RAM)
if ! swapon --show | grep -q swap; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
# Contrôle final : ne jamais annoncer « prêt » si un outil indispensable manque.
missing=0
check() { if eval "$2" >/dev/null 2>&1; then echo "  ✔ $1"; else echo "  ✖ $1 MANQUANT"; missing=$((missing + 1)); fi; }
echo "▶ Contrôle des outils"
check "docker $(docker --version 2>/dev/null | awk '{print $3}' | tr -d ,)" "command -v docker"
check "docker compose $(docker compose version --short 2>/dev/null)" "docker compose version"
check "pg_restore 17 ($PG17/pg_restore)" "$PG17/pg_restore --version"
check "utilisateur $DEPLOY_USER" "id $DEPLOY_USER"
check "ufw actif" "ufw status | grep -q 'Status: active'"
if [[ "$missing" -gt 0 ]]; then
  echo "✖ $missing outil(s) manquant(s) : corrigez avant de continuer (souvent « apt-get update » en échec plus haut)."
  exit 1
fi
echo "✔ VPS prêt. Suite pas à pas : docs/migration-postgresql/07-INSTALLATION-VPS.md (§3 clé de déploiement GitHub, §4 .env, §6 démarrage)."
