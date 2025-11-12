# Migration vers Supabase Self-Hosted - Guide Complet

Ce dossier contient tous les scripts et configurations nécessaires pour migrer votre projet depuis Lovable Cloud vers un VPS avec Supabase Self-Hosted.

## 📋 Prérequis

### VPS Requis
- **CPU**: 4 cores minimum
- **RAM**: 16 GB minimum
- **Stockage**: 100 GB SSD minimum
- **OS**: Ubuntu 22.04 LTS
- **Accès**: SSH root ou sudo

### Outils Nécessaires
- Docker & Docker Compose
- Git
- PostgreSQL client (psql)
- Node.js 18+
- Supabase CLI

## 🚀 Étapes de Migration

### Phase 1: Préparation (Jour 1)

#### 1.1 Inventaire et Backup
```bash
# Exécuter le script d'inventaire
./scripts/01-inventory.sh

# Créer un backup complet
./scripts/02-backup-lovable.sh
```

#### 1.2 Configuration du VPS
```bash
# Se connecter au VPS
ssh root@votre-vps.com

# Installer les prérequis
./scripts/03-setup-vps.sh

# Installer Supabase
./scripts/04-install-supabase.sh
```

### Phase 2: Migration Base de Données (Jour 2)

#### 2.1 Export depuis Lovable Cloud
```bash
# Sur votre machine locale
./scripts/05-export-database.sh
```

#### 2.2 Import sur le VPS
```bash
# Sur le VPS
./scripts/06-import-database.sh
```

### Phase 3: Edge Functions (Jour 3)

```bash
# Déployer toutes les Edge Functions
./scripts/07-deploy-functions.sh

# Configurer les secrets
./scripts/08-configure-secrets.sh
```

### Phase 4: Frontend (Jour 4)

```bash
# Build et déploiement
./scripts/09-deploy-frontend.sh

# Configuration Nginx
./scripts/10-configure-nginx.sh
```

### Phase 5: Tests et Validation (Jour 5-6)

```bash
# Tests automatisés
./scripts/11-run-tests.sh

# Monitoring
./scripts/12-setup-monitoring.sh
```

### Phase 6: Migration Finale (Jour 7)

```bash
# Migration finale des données
./scripts/13-final-migration.sh

# Basculement DNS
./scripts/14-dns-switch.sh
```

## 📁 Structure des Fichiers

```
migration/
├── README.md                          # Ce fichier
├── config/
│   ├── supabase-docker-compose.yml   # Configuration Docker Supabase
│   ├── nginx.conf                     # Configuration Nginx
│   ├── .env.production                # Variables d'environnement production
│   └── monitoring-compose.yml         # Stack monitoring (Grafana/Prometheus)
├── scripts/
│   ├── 01-inventory.sh               # Inventaire du projet
│   ├── 02-backup-lovable.sh          # Backup Lovable Cloud
│   ├── 03-setup-vps.sh               # Setup VPS initial
│   ├── 04-install-supabase.sh        # Installation Supabase
│   ├── 05-export-database.sh         # Export DB depuis Lovable
│   ├── 06-import-database.sh         # Import DB sur VPS
│   ├── 07-deploy-functions.sh        # Déploiement Edge Functions
│   ├── 08-configure-secrets.sh       # Configuration secrets
│   ├── 09-deploy-frontend.sh         # Déploiement frontend
│   ├── 10-configure-nginx.sh         # Configuration Nginx
│   ├── 11-run-tests.sh               # Tests automatisés
│   ├── 12-setup-monitoring.sh        # Setup monitoring
│   ├── 13-final-migration.sh         # Migration finale
│   └── 14-dns-switch.sh              # Basculement DNS
└── docs/
    ├── architecture.md                # Architecture détaillée
    ├── troubleshooting.md             # Guide dépannage
    └── rollback.md                    # Procédure de rollback
```

## 🔐 Sécurité

### Secrets à Configurer

Vous devrez configurer ces secrets sur votre VPS :

**Supabase**
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `ANON_KEY`
- `SERVICE_ROLE_KEY`
- `SUPABASE_URL`

**Services Externes**
- `FEDAPAY_SECRET_KEY`
- `FEDAPAY_PUBLIC_KEY`
- `FEDAPAY_WEBHOOK_SECRET`
- `PLATFORM_WALLET_ID`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`
- `TWILIO_PHONE_NUMBER`
- `WASABI_ACCESS_KEY_ID`
- `WASABI_SECRET_ACCESS_KEY`
- `WASABI_BUCKET_NAME`
- `WASABI_REGION`
- `WASABI_ENDPOINT`
- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_EMAIL`
- `VITE_MAPBOX_TOKEN`
- `PHONE_ENCRYPTION_KEY`

## ⚠️ Points Critiques

1. **Backup**: Toujours faire un backup complet avant chaque étape
2. **Tests**: Tester chaque composant après migration
3. **Webhooks**: Mettre à jour les URLs chez FedaPay
4. **DNS**: Préparer le basculement DNS à l'avance
5. **Monitoring**: Surveiller intensivement les 48h après migration

## 📞 Support

En cas de problème, consultez :
- `docs/troubleshooting.md` pour les problèmes courants
- `docs/rollback.md` pour revenir en arrière
- Les logs Docker: `docker compose logs -f`

## 📊 Checklist de Migration

- [ ] Backup complet créé
- [ ] VPS configuré et sécurisé
- [ ] Supabase installé et fonctionnel
- [ ] Base de données migrée et testée
- [ ] Edge Functions déployées
- [ ] Secrets configurés
- [ ] Frontend déployé
- [ ] SSL configuré
- [ ] Tests fonctionnels passés
- [ ] Monitoring actif
- [ ] DNS basculé
- [ ] Ancien système désactivé

## 💰 Coûts Estimés

- **VPS Hetzner CPX31**: ~15€/mois
- **Backups**: ~5€/mois
- **Services externes**: ~20-60€/mois
- **Total**: ~40-80€/mois
