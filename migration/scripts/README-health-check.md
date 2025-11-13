# Health Check Script - Guide d'utilisation

## 📋 Description

Script complet de monitoring pour vérifier l'état de santé des 3 environnements (dev, test, prod) de Domicares.

## ✅ Vérifications effectuées

Pour chaque environnement, le script vérifie :

### 🌐 Frontend
- Accessibilité HTTPS
- Temps de réponse
- Status HTTP

### 🔌 API Supabase
- API Gateway (Kong)
- Endpoints REST
- Temps de réponse

### 🐘 Base de données
- Connectivité PostgreSQL
- Taille de la base
- Connexions actives

### 🐳 Services Docker
- État des conteneurs (db, kong, auth, rest, realtime, storage, functions)
- Health status

### 🔒 SSL
- Validité du certificat
- Date d'expiration
- Alerte si expiration < 30 jours

### 💾 Ressources système
- Utilisation disque
- Mémoire des conteneurs

## 🚀 Installation

```bash
# Rendre le script exécutable
chmod +x migration/scripts/health-check.sh

# Créer le dossier de logs
sudo mkdir -p /var/log/domicares-health
sudo chown -R $USER:$USER /var/log/domicares-health
```

## 📖 Usage

### Vérifier tous les environnements
```bash
./migration/scripts/health-check.sh
```

### Vérifier un environnement spécifique
```bash
# Dev uniquement
./migration/scripts/health-check.sh --env dev

# Test uniquement
./migration/scripts/health-check.sh --env test

# Production uniquement
./migration/scripts/health-check.sh --env prod
```

### Avec alertes Slack
```bash
# Configurer le webhook Slack
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

# Exécuter avec alertes
./migration/scripts/health-check.sh --alert
```

### Output JSON (pour intégration avec monitoring)
```bash
./migration/scripts/health-check.sh --json
```

### Combinaison d'options
```bash
./migration/scripts/health-check.sh --env prod --alert --json
```

## 📊 Codes de sortie

- `0` : Tous les checks ont réussi ✅
- `1` : Un ou plusieurs checks ont échoué ❌
- `2` : Des warnings ont été détectés ⚠️

## ⏰ Configuration Cron (monitoring automatique)

### Exemple 1 : Vérification toutes les 5 minutes (tous les environnements)
```bash
# Éditer le crontab
crontab -e

# Ajouter la ligne suivante
*/5 * * * * /home/deploy/migration/scripts/health-check.sh >> /var/log/domicares-health/cron.log 2>&1
```

### Exemple 2 : Vérification différente par environnement
```bash
# Production : toutes les 2 minutes avec alertes
*/2 * * * * SLACK_WEBHOOK_URL="https://hooks.slack.com/..." /home/deploy/migration/scripts/health-check.sh --env prod --alert >> /var/log/domicares-health/prod-cron.log 2>&1

# Test : toutes les 10 minutes
*/10 * * * * /home/deploy/migration/scripts/health-check.sh --env test >> /var/log/domicares-health/test-cron.log 2>&1

# Dev : toutes les 30 minutes
*/30 * * * * /home/deploy/migration/scripts/health-check.sh --env dev >> /var/log/domicares-health/dev-cron.log 2>&1
```

### Exemple 3 : Check complet toutes les heures avec output JSON
```bash
0 * * * * /home/deploy/migration/scripts/health-check.sh --json > /var/log/domicares-health/status.json 2>&1
```

## 🔔 Configuration des alertes Slack

### 1. Créer un Incoming Webhook Slack

1. Aller sur https://api.slack.com/messaging/webhooks
2. Créer une nouvelle app pour votre workspace
3. Activer "Incoming Webhooks"
4. Créer un webhook pour un canal spécifique (ex: #alerts)
5. Copier l'URL du webhook

### 2. Configurer le webhook dans le système

**Option A : Variable d'environnement persistante**
```bash
# Ajouter au ~/.bashrc ou ~/.profile
echo 'export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"' >> ~/.bashrc
source ~/.bashrc
```

**Option B : Fichier de configuration**
```bash
# Créer un fichier de config
cat > /etc/domicares/health-check.conf << EOF
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
EOF

# Modifier le script pour sourcer ce fichier (ligne 25)
# Ajouter: [ -f /etc/domicares/health-check.conf ] && source /etc/domicares/health-check.conf
```

### 3. Tester les alertes
```bash
# Arrêter un service pour tester
docker stop supabase-prod-db

# Exécuter le health check avec alertes
./migration/scripts/health-check.sh --env prod --alert

# Redémarrer le service
docker start supabase-prod-db
```

## 📈 Intégration avec monitoring externe

### Grafana + Prometheus

Créer un script wrapper qui exporte les métriques :

```bash
#!/bin/bash
# health-check-prometheus.sh

OUTPUT=$(/home/deploy/migration/scripts/health-check.sh --json)

# Parser le JSON et créer des métriques Prometheus
PASSED=$(echo $OUTPUT | jq -r '.passed')
FAILED=$(echo $OUTPUT | jq -r '.failed')
WARNINGS=$(echo $OUTPUT | jq -r '.warnings')
SUCCESS_RATE=$(echo $OUTPUT | jq -r '.success_rate')

# Écrire les métriques
cat > /var/lib/prometheus/node_exporter/health_checks.prom << EOF
# HELP domicares_health_checks_passed Number of passed health checks
# TYPE domicares_health_checks_passed gauge
domicares_health_checks_passed $PASSED

# HELP domicares_health_checks_failed Number of failed health checks
# TYPE domicares_health_checks_failed gauge
domicares_health_checks_failed $FAILED

# HELP domicares_health_checks_warnings Number of warning health checks
# TYPE domicares_health_checks_warnings gauge
domicares_health_checks_warnings $WARNINGS

# HELP domicares_health_checks_success_rate Success rate percentage
# TYPE domicares_health_checks_success_rate gauge
domicares_health_checks_success_rate $SUCCESS_RATE
EOF
```

### Uptime Robot / StatusPage.io

Utiliser les codes de sortie pour intégrer avec des services externes :

```bash
#!/bin/bash
# uptime-check.sh

if ./migration/scripts/health-check.sh --env prod > /dev/null 2>&1; then
    curl "https://api.uptimerobot.com/v2/editMonitor" \
         -d "api_key=YOUR_API_KEY" \
         -d "id=MONITOR_ID" \
         -d "status=2"  # 2 = UP
else
    curl "https://api.uptimerobot.com/v2/editMonitor" \
         -d "api_key=YOUR_API_KEY" \
         -d "id=MONITOR_ID" \
         -d "status=9"  # 9 = DOWN
fi
```

## 🔧 Personnalisation

### Modifier les seuils d'alerte

Éditer les variables au début du script (lignes 32-35) :

```bash
SSL_EXPIRY_WARNING_DAYS=30         # Alerte SSL si < 30 jours
RESPONSE_TIME_WARNING_MS=2000      # Alerte si temps réponse > 2s
DISK_USAGE_WARNING_PERCENT=80      # Alerte si disque > 80%
MEMORY_USAGE_WARNING_PERCENT=85    # Alerte si mémoire > 85%
```

### Ajouter des checks personnalisés

Ajouter une fonction dans le script après la ligne 200 :

```bash
# Exemple : vérifier un endpoint spécifique
check_custom_endpoint() {
    local env=$1
    local endpoint="https://$domain/api/custom-endpoint"
    
    local result=$(check_http "$endpoint" 200 5)
    local status=$(echo $result | cut -d'|' -f1)
    
    if [ "$status" = "200" ]; then
        log_result "PASS" "Custom endpoint accessible"
    else
        log_result "FAIL" "Custom endpoint not accessible"
    fi
}

# Appeler dans check_environment()
check_custom_endpoint "$env"
```

## 📝 Exemples d'output

### Output standard (coloré)
```
╔════════════════════════════════════════════╗
║   DOMICARES MULTI-ENV HEALTH CHECK        ║
║   2025-01-13 10:30:00                     ║
╚════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Checking PROD Environment (domicares.life)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Frontend Checks:
✅ PASS - Frontend accessible on https://domicares.life (342ms)

API Checks:
✅ PASS - API Gateway accessible on https://domicares.life/api (189ms)
✅ PASS - Kong Gateway responding on port 8000

Database Checks:
✅ PASS - PostgreSQL accessible on port 5432
✅ PASS - Database size: 1.2 GB
✅ PASS - Active connections: 12

Docker Services Checks:
✅ PASS - Service 'db' is running
✅ PASS - Service 'kong' is running
✅ PASS - Service 'auth' is running
✅ PASS - Service 'rest' is running
✅ PASS - Service 'realtime' is running
✅ PASS - Service 'storage' is running
✅ PASS - Service 'functions' is running

SSL Certificate Checks:
✅ PASS - SSL certificate valid for 87 days

System Resources Checks:
✅ PASS - Disk usage: 45%
✅ PASS - Docker containers total memory: 2.3GiB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Summary Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total checks:    42
Passed:          42 ✅
Failed:          0 ❌
Warnings:        0 ⚠️
Success rate:    100%

✅ All checks passed successfully!
```

### Output JSON
```json
{
  "timestamp": "2025-01-13 10:30:00",
  "total_checks": 42,
  "passed": 42,
  "failed": 0,
  "warnings": 0,
  "success_rate": 100.00
}
```

## 🐛 Troubleshooting

### Erreur : "docker: command not found"
```bash
# Vérifier que Docker est installé
which docker

# Ajouter l'utilisateur au groupe docker
sudo usermod -aG docker $USER
newgrp docker
```

### Erreur : "Permission denied" sur les logs
```bash
# Corriger les permissions
sudo chown -R $USER:$USER /var/log/domicares-health
chmod 755 /var/log/domicares-health
```

### SSL check échoue avec certificat valide
```bash
# Vérifier openssl
openssl version

# Tester manuellement
echo | openssl s_client -servername domicares.life -connect domicares.life:443

# Installer/mettre à jour openssl si nécessaire
sudo apt update && sudo apt install -y openssl
```

### Alertes Slack non envoyées
```bash
# Vérifier la variable d'environnement
echo $SLACK_WEBHOOK_URL

# Tester le webhook manuellement
curl -X POST -H 'Content-type: application/json' \
     --data '{"text":"Test message"}' \
     "$SLACK_WEBHOOK_URL"
```

## 📚 Ressources

- [Docker Health Checks](https://docs.docker.com/engine/reference/builder/#healthcheck)
- [Nginx Monitoring](https://nginx.org/en/docs/http/ngx_http_stub_status_module.html)
- [PostgreSQL Monitoring](https://www.postgresql.org/docs/current/monitoring-stats.html)
- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)

## 🔗 Liens utiles

- Documentation principale : `migration/docs/MULTI_ENV_SETUP.md`
- Scripts d'installation : `migration/scripts/05-install-supabase-*.sh`
- Workflows CI/CD : `.github/workflows/`
