#!/bin/bash

# ==============================================
# Script de Setup du Monitoring Automatique
# ==============================================
# Configure le health-check automatique avec cron

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HEALTH_CHECK_SCRIPT="$SCRIPT_DIR/health-check.sh"
CONFIG_FILE="/etc/domicares/health-check.conf"
LOG_DIR="/var/log/domicares-health"
CRON_FILE="/etc/cron.d/domicares-health-check"

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   SETUP MONITORING AUTOMATIQUE            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Vérifier les permissions
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Ce script doit être exécuté en tant que root${NC}"
    echo "   Utilisez: sudo ./setup-monitoring.sh"
    exit 1
fi

echo -e "${GREEN}✅ Exécution avec les privilèges root${NC}"
echo ""

# Vérifier que le script health-check existe
if [ ! -f "$HEALTH_CHECK_SCRIPT" ]; then
    echo -e "${RED}❌ Script health-check.sh introuvable${NC}"
    echo "   Chemin attendu: $HEALTH_CHECK_SCRIPT"
    exit 1
fi

echo -e "${GREEN}✅ Script health-check.sh trouvé${NC}"
echo ""

# Créer le dossier de configuration
echo "📁 Création des dossiers nécessaires..."
mkdir -p /etc/domicares
mkdir -p "$LOG_DIR"
chown -R deploy:deploy "$LOG_DIR"
chmod 755 "$LOG_DIR"
echo -e "${GREEN}✅ Dossiers créés${NC}"
echo ""

# Rendre le script exécutable
chmod +x "$HEALTH_CHECK_SCRIPT"
echo -e "${GREEN}✅ Script health-check.sh rendu exécutable${NC}"
echo ""

# Configuration interactive
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Configuration du Monitoring${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Demander le webhook Slack
read -p "Webhook Slack URL (optionnel, appuyez sur Entrée pour ignorer): " SLACK_WEBHOOK
echo ""

# Demander l'intervalle de monitoring
echo "Intervalle de vérification :"
echo "  1) Toutes les 2 minutes (production critique)"
echo "  2) Toutes les 5 minutes (recommandé)"
echo "  3) Toutes les 10 minutes"
echo "  4) Toutes les 15 minutes"
echo "  5) Toutes les 30 minutes"
echo ""
read -p "Choisissez une option (1-5) [2]: " INTERVAL_CHOICE
INTERVAL_CHOICE=${INTERVAL_CHOICE:-2}

case $INTERVAL_CHOICE in
    1) INTERVAL="*/2" ;;
    2) INTERVAL="*/5" ;;
    3) INTERVAL="*/10" ;;
    4) INTERVAL="*/15" ;;
    5) INTERVAL="*/30" ;;
    *) INTERVAL="*/5" ;;
esac

echo ""

# Demander quels environnements monitorer
echo "Environnements à monitorer :"
echo "  1) Tous (dev, test, prod)"
echo "  2) Production uniquement"
echo "  3) Production + Test"
echo "  4) Personnalisé"
echo ""
read -p "Choisissez une option (1-4) [1]: " ENV_CHOICE
ENV_CHOICE=${ENV_CHOICE:-1}

case $ENV_CHOICE in
    1) 
        ENVIRONMENTS="all"
        ENV_DISPLAY="tous les environnements"
        ;;
    2) 
        ENVIRONMENTS="prod"
        ENV_DISPLAY="production uniquement"
        ;;
    3) 
        ENVIRONMENTS="prod test"
        ENV_DISPLAY="production et test"
        ;;
    4) 
        echo ""
        read -p "Entrez les environnements séparés par des espaces (dev test prod): " ENVIRONMENTS
        ENV_DISPLAY="$ENVIRONMENTS"
        ;;
    *) 
        ENVIRONMENTS="all"
        ENV_DISPLAY="tous les environnements"
        ;;
esac

echo ""

# Demander si on active les alertes
read -p "Activer les alertes Slack ? (y/N): " ENABLE_ALERTS
ENABLE_ALERTS=${ENABLE_ALERTS:-n}

ALERT_FLAG=""
if [[ "$ENABLE_ALERTS" =~ ^[Yy]$ ]]; then
    ALERT_FLAG="--alert"
    echo -e "${GREEN}✅ Alertes Slack activées${NC}"
else
    echo -e "${YELLOW}⚠️  Alertes Slack désactivées${NC}"
fi

echo ""

# Créer le fichier de configuration
echo "📝 Création du fichier de configuration..."
cat > "$CONFIG_FILE" << EOF
# Configuration Health Check - Généré le $(date)
SLACK_WEBHOOK_URL="$SLACK_WEBHOOK"
SSL_EXPIRY_WARNING_DAYS=30
RESPONSE_TIME_WARNING_MS=2000
DISK_USAGE_WARNING_PERCENT=80
MEMORY_USAGE_WARNING_PERCENT=85
HEALTH_CHECK_ENVIRONMENTS="$ENVIRONMENTS"
EOF

chmod 600 "$CONFIG_FILE"
echo -e "${GREEN}✅ Configuration sauvegardée dans $CONFIG_FILE${NC}"
echo ""

# Créer le fichier cron
echo "⏰ Configuration du cron job..."

if [ "$ENVIRONMENTS" = "all" ]; then
    # Un seul job pour tous les environnements
    cat > "$CRON_FILE" << EOF
# Domicares Health Check - Tous les environnements
# Vérifie l'état de santé toutes les $INTERVAL minutes
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
SLACK_WEBHOOK_URL=$SLACK_WEBHOOK

$INTERVAL * * * * deploy $HEALTH_CHECK_SCRIPT $ALERT_FLAG >> $LOG_DIR/cron.log 2>&1
EOF
else
    # Jobs séparés pour chaque environnement
    cat > "$CRON_FILE" << EOF
# Domicares Health Check - Environnements: $ENVIRONMENTS
# Vérifie l'état de santé toutes les $INTERVAL minutes
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
SLACK_WEBHOOK_URL=$SLACK_WEBHOOK

EOF
    
    for env in $ENVIRONMENTS; do
        echo "$INTERVAL * * * * deploy $HEALTH_CHECK_SCRIPT --env $env $ALERT_FLAG >> $LOG_DIR/${env}-cron.log 2>&1" >> "$CRON_FILE"
    done
fi

chmod 644 "$CRON_FILE"
echo -e "${GREEN}✅ Cron job configuré dans $CRON_FILE${NC}"
echo ""

# Redémarrer cron
echo "🔄 Redémarrage du service cron..."
systemctl restart cron
echo -e "${GREEN}✅ Service cron redémarré${NC}"
echo ""

# Créer un script de rotation des logs
echo "📄 Configuration de la rotation des logs..."
cat > "/etc/logrotate.d/domicares-health" << EOF
$LOG_DIR/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 deploy deploy
}
EOF

echo -e "${GREEN}✅ Rotation des logs configurée (30 jours)${NC}"
echo ""

# Test du health check
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Test du Health Check${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
read -p "Voulez-vous exécuter un test maintenant ? (Y/n): " RUN_TEST
RUN_TEST=${RUN_TEST:-y}

if [[ "$RUN_TEST" =~ ^[Yy]$ ]]; then
    echo ""
    echo "Exécution du test..."
    echo ""
    
    if [ "$ENVIRONMENTS" = "all" ]; then
        sudo -u deploy "$HEALTH_CHECK_SCRIPT" $ALERT_FLAG
    else
        for env in $ENVIRONMENTS; do
            echo -e "${BLUE}Test de l'environnement: $env${NC}"
            sudo -u deploy "$HEALTH_CHECK_SCRIPT" --env "$env" $ALERT_FLAG
            echo ""
        done
    fi
fi

# Récapitulatif
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}✅ INSTALLATION TERMINÉE${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "📊 Récapitulatif de la configuration :"
echo ""
echo -e "  • Environnements monitorés : ${GREEN}$ENV_DISPLAY${NC}"
echo -e "  • Intervalle de vérification : ${GREEN}$INTERVAL minutes${NC}"
echo -e "  • Alertes Slack : ${GREEN}$([ "$ALERT_FLAG" = "--alert" ] && echo "Activées" || echo "Désactivées")${NC}"
echo -e "  • Logs : ${BLUE}$LOG_DIR/${NC}"
echo -e "  • Configuration : ${BLUE}$CONFIG_FILE${NC}"
echo -e "  • Cron job : ${BLUE}$CRON_FILE${NC}"
echo ""
echo -e "${YELLOW}📋 Commandes utiles :${NC}"
echo ""
echo -e "  # Voir les logs en temps réel"
echo -e "  ${BLUE}tail -f $LOG_DIR/cron.log${NC}"
echo ""
echo -e "  # Exécuter manuellement un check"
echo -e "  ${BLUE}$HEALTH_CHECK_SCRIPT${NC}"
echo ""
echo -e "  # Vérifier le cron job"
echo -e "  ${BLUE}cat $CRON_FILE${NC}"
echo ""
echo -e "  # Éditer la configuration"
echo -e "  ${BLUE}sudo nano $CONFIG_FILE${NC}"
echo ""
echo -e "  # Désactiver le monitoring"
echo -e "  ${BLUE}sudo rm $CRON_FILE && sudo systemctl restart cron${NC}"
echo ""
echo -e "${GREEN}✅ Le monitoring est maintenant actif !${NC}"
echo ""
