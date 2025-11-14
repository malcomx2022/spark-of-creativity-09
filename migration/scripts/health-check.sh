#!/bin/bash

# ==============================================
# Script de Health Check Multi-Environnements
# ==============================================
# Vérifie l'état de tous les services pour dev, test et prod
# Usage: ./health-check.sh [--env dev|test|prod|all] [--alert] [--json]

set -e

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/var/log/domicares-health"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
ALERT_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
JSON_OUTPUT=false
SEND_ALERTS=false
CHECK_ENV="all"

# Seuils d'alerte
SSL_EXPIRY_WARNING_DAYS=30
RESPONSE_TIME_WARNING_MS=2000
DISK_USAGE_WARNING_PERCENT=80
MEMORY_USAGE_WARNING_PERCENT=85

# Compteurs globaux
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            CHECK_ENV="$2"
            shift 2
            ;;
        --alert)
            SEND_ALERTS=true
            shift
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --env ENV      Check specific environment: dev, test, prod, or all (default: all)"
            echo "  --alert        Send alerts on failures via webhook"
            echo "  --json         Output results in JSON format"
            echo "  --help         Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Créer le dossier de logs si nécessaire
sudo mkdir -p $LOG_DIR
sudo chown -R $USER:$USER $LOG_DIR

# ==============================================
# Fonctions utilitaires
# ==============================================

log_result() {
    local status=$1
    local message=$2
    local details=$3
    
    ((TOTAL_CHECKS++))
    
    case $status in
        "PASS")
            ((PASSED_CHECKS++))
            if [ "$JSON_OUTPUT" = false ]; then
                echo -e "${GREEN}✅ PASS${NC} - $message"
            fi
            ;;
        "FAIL")
            ((FAILED_CHECKS++))
            if [ "$JSON_OUTPUT" = false ]; then
                echo -e "${RED}❌ FAIL${NC} - $message"
                [ -n "$details" ] && echo -e "   ${RED}└─${NC} $details"
            fi
            ;;
        "WARN")
            ((WARNING_CHECKS++))
            if [ "$JSON_OUTPUT" = false ]; then
                echo -e "${YELLOW}⚠️  WARN${NC} - $message"
                [ -n "$details" ] && echo -e "   ${YELLOW}└─${NC} $details"
            fi
            ;;
    esac
}

check_http() {
    local url=$1
    local expected_status=${2:-200}
    local timeout=${3:-10}
    
    local start_time=$(date +%s%3N)
    local response=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" --max-time $timeout "$url" 2>/dev/null || echo "000|0")
    local end_time=$(date +%s%3N)
    
    local status_code=$(echo $response | cut -d'|' -f1)
    local response_time_ms=$((end_time - start_time))
    
    echo "$status_code|$response_time_ms"
}

check_ssl_expiry() {
    local domain=$1
    
    local expiry_date=$(echo | openssl s_client -servername $domain -connect $domain:443 2>/dev/null | \
                        openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    
    if [ -z "$expiry_date" ]; then
        echo "0"
        return
    fi
    
    local expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null || echo "0")
    local current_epoch=$(date +%s)
    local days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
    
    echo "$days_until_expiry"
}

check_postgres() {
    local host=$1
    local port=$2
    local db=$3
    local user=${4:-postgres}
    
    if docker exec supabase-${5}-db psql -h $host -p $port -U $user -d $db -c "SELECT 1" > /dev/null 2>&1; then
        echo "OK"
    else
        echo "FAIL"
    fi
}

check_docker_service() {
    local container_name=$1
    
    if docker ps --filter "name=$container_name" --filter "status=running" --format "{{.Names}}" | grep -q "$container_name"; then
        local health=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "none")
        if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
            echo "OK"
        else
            echo "UNHEALTHY"
        fi
    else
        echo "DOWN"
    fi
}

# ==============================================
# Fonctions de vérification par environnement
# ==============================================

check_environment() {
    local env=$1
    local domain=""
    local kong_port=""
    local postgres_port=""
    local supabase_dir=""
    
    case $env in
        "prod")
            domain="domicares.life"
            kong_port=8000
            postgres_port=5432
            supabase_dir="/opt/supabase-prod"
            ;;
        "test")
            domain="test.domicares.life"
            kong_port=8100
            postgres_port=5433
            supabase_dir="/opt/supabase-test"
            ;;
        "dev")
            domain="dev.domicares.life"
            kong_port=8200
            postgres_port=5434
            supabase_dir="/opt/supabase-dev"
            ;;
    esac
    
    if [ "$JSON_OUTPUT" = false ]; then
        echo ""
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${BLUE}🔍 Checking ${env^^} Environment ($domain)${NC}"
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    fi
    
    # 1. Vérifier Frontend
    if [ "$JSON_OUTPUT" = false ]; then
        echo ""
        echo -e "${BLUE}Frontend Checks:${NC}"
    fi
    
    local http_result=$(check_http "https://$domain" 200 10)
    local http_status=$(echo $http_result | cut -d'|' -f1)
    local http_time=$(echo $http_result | cut -d'|' -f2)
    
    if [ "$http_status" = "200" ]; then
        if [ $http_time -lt $RESPONSE_TIME_WARNING_MS ]; then
            log_result "PASS" "Frontend accessible on https://$domain (${http_time}ms)"
        else
            log_result "WARN" "Frontend accessible but slow on https://$domain (${http_time}ms)" "Response time > ${RESPONSE_TIME_WARNING_MS}ms"
        fi
    else
        log_result "FAIL" "Frontend not accessible on https://$domain" "HTTP Status: $http_status"
    fi
    
    # 2. Vérifier API Supabase
    if [ "$JSON_OUTPUT" = false ]; then
        echo ""
        echo -e "${BLUE}API Checks:${NC}"
    fi
    
    local api_result=$(check_http "https://$domain/api/rest/v1/" 200 10)
    local api_status=$(echo $api_result | cut -d'|' -f1)
    local api_time=$(echo $api_result | cut -d'|' -f2)
    
    if [ "$api_status" = "200" ]; then
        log_result "PASS" "API Gateway accessible on https://$domain/api (${api_time}ms)"
    else
        log_result "FAIL" "API Gateway not accessible" "HTTP Status: $api_status"
    fi
    
    # Vérifier Kong Gateway local
    local kong_result=$(check_http "http://localhost:$kong_port" 404 5)
    local kong_status=$(echo $kong_result | cut -d'|' -f1)
    
    if [ "$kong_status" = "404" ] || [ "$kong_status" = "200" ]; then
        log_result "PASS" "Kong Gateway responding on port $kong_port"
    else
        log_result "FAIL" "Kong Gateway not responding on port $kong_port"
    fi
    
    # 3. Vérifier Base de Données
    if [ "$JSON_OUTPUT" = false ]; then
        echo ""
        echo -e "${BLUE}Database Checks:${NC}"
    fi
    
    local db_status=$(check_postgres "localhost" $postgres_port "postgres" "postgres" "$env")
    
    if [ "$db_status" = "OK" ]; then
        log_result "PASS" "PostgreSQL accessible on port $postgres_port"
        
        # Vérifier la taille de la base de données
        local db_size=$(docker exec supabase-${env}-db psql -U postgres -d postgres -t -c "SELECT pg_size_pretty(pg_database_size('postgres'));" 2>/dev/null | xargs)
        if [ -n "$db_size" ]; then
            log_result "PASS" "Database size: $db_size"
        fi
        
        # Vérifier les connexions actives
        local connections=$(docker exec supabase-${env}-db psql -U postgres -d postgres -t -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null | xargs)
        if [ -n "$connections" ]; then
            log_result "PASS" "Active connections: $connections"
        fi
    else
        log_result "FAIL" "PostgreSQL not accessible on port $postgres_port"
    fi
    
    # 4. Vérifier Services Docker
    if [ "$JSON_OUTPUT" = false ]; then
        echo ""
        echo -e "${BLUE}Docker Services Checks:${NC}"
    fi
    
    # Liste des services à vérifier
    local services=("db" "kong" "auth" "rest" "realtime" "storage" "functions")
    
    for service in "${services[@]}"; do
        local container_name="supabase-${env}-${service}"
        local service_status=$(check_docker_service "$container_name")
        
        if [ "$service_status" = "OK" ]; then
            log_result "PASS" "Service '$service' is running"
        elif [ "$service_status" = "UNHEALTHY" ]; then
            log_result "WARN" "Service '$service' is running but unhealthy"
        else
            log_result "FAIL" "Service '$service' is not running"
        fi
    done
    
    # 5. Vérifier SSL
    if [ "$JSON_OUTPUT" = false ]; then
        echo ""
        echo -e "${BLUE}SSL Certificate Checks:${NC}"
    fi
    
    local days_until_expiry=$(check_ssl_expiry "$domain")
    
    if [ "$days_until_expiry" = "0" ]; then
        log_result "FAIL" "SSL certificate not found or invalid for $domain"
    elif [ $days_until_expiry -lt $SSL_EXPIRY_WARNING_DAYS ]; then
        log_result "WARN" "SSL certificate expires in $days_until_expiry days" "Renew soon!"
    else
        log_result "PASS" "SSL certificate valid for $days_until_expiry days"
    fi
    
    # 6. Vérifier les ressources système
    if [ "$JSON_OUTPUT" = false ]; then
        echo ""
        echo -e "${BLUE}System Resources Checks:${NC}"
    fi
    
    # Disk usage
    local disk_usage=$(df -h /opt/supabase-${env} 2>/dev/null | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ -n "$disk_usage" ]; then
        if [ $disk_usage -lt $DISK_USAGE_WARNING_PERCENT ]; then
            log_result "PASS" "Disk usage: ${disk_usage}%"
        else
            log_result "WARN" "Disk usage: ${disk_usage}%" "Exceeds ${DISK_USAGE_WARNING_PERCENT}% threshold"
        fi
    fi
    
    # Memory usage des conteneurs
    local total_memory=$(docker stats --no-stream --format "{{.Container}},{{.MemUsage}}" | grep "supabase-${env}-" | awk -F',' '{print $2}' | awk '{print $1}' | grep -oE '[0-9.]+' | awk '{sum+=$1} END {print sum}')
    if [ -n "$total_memory" ]; then
        log_result "PASS" "Docker containers total memory: ${total_memory}MiB"
    fi
}

# ==============================================
# Fonction d'alerte
# ==============================================

send_alert() {
    local env=$1
    local message=$2
    
    if [ "$SEND_ALERTS" = true ] && [ -n "$ALERT_WEBHOOK" ]; then
        local payload=$(cat <<EOF
{
  "text": "🚨 Health Check Alert - $env Environment",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Health Check Alert*\n*Environment:* $env\n*Time:* $TIMESTAMP\n*Message:* $message"
      }
    }
  ]
}
EOF
)
        curl -X POST -H 'Content-type: application/json' --data "$payload" "$ALERT_WEBHOOK" 2>/dev/null
    fi
}

# ==============================================
# Fonction de rapport JSON
# ==============================================

generate_json_report() {
    cat <<EOF
{
  "timestamp": "$TIMESTAMP",
  "total_checks": $TOTAL_CHECKS,
  "passed": $PASSED_CHECKS,
  "failed": $FAILED_CHECKS,
  "warnings": $WARNING_CHECKS,
  "success_rate": $(echo "scale=2; $PASSED_CHECKS * 100 / $TOTAL_CHECKS" | bc)
}
EOF
}

# ==============================================
# Exécution principale
# ==============================================

if [ "$JSON_OUTPUT" = false ]; then
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   DOMICARES MULTI-ENV HEALTH CHECK        ║${NC}"
    echo -e "${BLUE}║   $TIMESTAMP          ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
fi

# Exécuter les checks selon l'environnement demandé
case $CHECK_ENV in
    "dev")
        check_environment "dev"
        ;;
    "test")
        check_environment "test"
        ;;
    "prod")
        check_environment "prod"
        ;;
    "all")
        check_environment "dev"
        check_environment "test"
        check_environment "prod"
        ;;
    *)
        echo "Invalid environment: $CHECK_ENV"
        exit 1
        ;;
esac

# Rapport final
if [ "$JSON_OUTPUT" = true ]; then
    generate_json_report
else
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}📊 Summary Report${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "Total checks:    ${BLUE}$TOTAL_CHECKS${NC}"
    echo -e "Passed:          ${GREEN}$PASSED_CHECKS ✅${NC}"
    echo -e "Failed:          ${RED}$FAILED_CHECKS ❌${NC}"
    echo -e "Warnings:        ${YELLOW}$WARNING_CHECKS ⚠️${NC}"
    
    local success_rate=$(echo "scale=2; $PASSED_CHECKS * 100 / $TOTAL_CHECKS" | bc)
    echo -e "Success rate:    ${BLUE}${success_rate}%${NC}"
    echo ""
    
    if [ $FAILED_CHECKS -gt 0 ]; then
        echo -e "${RED}⚠️  ATTENTION: $FAILED_CHECKS check(s) failed!${NC}"
        send_alert "$CHECK_ENV" "$FAILED_CHECKS check(s) failed"
        exit 1
    elif [ $WARNING_CHECKS -gt 0 ]; then
        echo -e "${YELLOW}⚠️  WARNING: $WARNING_CHECKS check(s) need attention${NC}"
        exit 2
    else
        echo -e "${GREEN}✅ All checks passed successfully!${NC}"
        exit 0
    fi
fi

# Sauvegarder le log
LOG_FILE="$LOG_DIR/health-check-$(date +%Y%m%d-%H%M%S).log"
echo "Health check completed at $TIMESTAMP" > "$LOG_FILE"
echo "Total: $TOTAL_CHECKS | Passed: $PASSED_CHECKS | Failed: $FAILED_CHECKS | Warnings: $WARNING_CHECKS" >> "$LOG_FILE"
