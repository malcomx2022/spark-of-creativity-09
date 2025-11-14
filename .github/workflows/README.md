# GitHub Actions Workflows - DomiCares CI/CD

Ce dossier contient les workflows GitHub Actions pour le déploiement automatique des 3 environnements.

## 📋 Workflows Disponibles

### 1. `deploy-dev.yml` - Environnement de Développement
- **Déclenchement**: Push sur la branche `develop`
- **URL**: https://dev.domicares.life
- **Tests**: Linter et tests unitaires (non-bloquants)
- **Déploiement**: Automatique sur chaque commit

### 2. `deploy-test.yml` - Environnement de Test
- **Déclenchement**: Push sur la branche `staging`
- **URL**: https://test.domicares.life
- **Tests**: Linter, tests unitaires, tests E2E, smoke tests
- **Déploiement**: Automatique après validation des tests

### 3. `deploy-prod.yml` - Environnement de Production
- **Déclenchement**: 
  - Push sur la branche `main`
  - Déclenchement manuel avec confirmation
- **URL**: https://domicares.life
- **Tests**: Tous les tests + health checks + smoke tests
- **Sécurité**: 
  - Backup automatique avant déploiement
  - Rollback automatique en cas d'échec
  - Zero downtime deployment

## 🔐 Secrets GitHub à Configurer

Allez dans **Settings → Secrets and variables → Actions** et ajoutez :

### Secrets Communs (tous environnements)
```
VPS_HOST           # IP de votre VPS Hostinger
VPS_USERNAME       # Nom d'utilisateur SSH (ex: deploy)
SSH_PRIVATE_KEY    # Clé privée SSH pour connexion au VPS
VPS_SSH_PORT       # Port SSH (défaut: 22)
```

### Secrets Development
```
DEV_ANON_KEY       # Clé anonyme Supabase DEV
DEV_MAPBOX_TOKEN   # Token Mapbox pour DEV
```

### Secrets Test
```
TEST_ANON_KEY      # Clé anonyme Supabase TEST
TEST_MAPBOX_TOKEN  # Token Mapbox pour TEST
```

### Secrets Production
```
PROD_ANON_KEY      # Clé anonyme Supabase PRODUCTION
PROD_MAPBOX_TOKEN  # Token Mapbox pour PRODUCTION
```

## 🚀 Workflow de Déploiement

```
┌─────────────────┐
│   Développeur   │
└────────┬────────┘
         │ git push origin develop
         ▼
┌─────────────────┐
│  DEV (develop)  │  ← Tests non-bloquants
│ dev.domicares   │     Déploiement rapide
└────────┬────────┘
         │ git merge develop → staging
         ▼
┌─────────────────┐
│  TEST (staging) │  ← Tests complets
│ test.domicares  │     Validation QA
└────────┬────────┘
         │ git merge staging → main
         ▼
┌─────────────────┐
│  PROD (main)    │  ← Tests + Backup + Rollback
│  domicares.life │     Zero downtime
└─────────────────┘
```

## 📝 Utilisation

### Déploiement Automatique

1. **Développement** :
   ```bash
   git checkout develop
   git add .
   git commit -m "feat: nouvelle fonctionnalité"
   git push origin develop
   # → Déploiement automatique sur dev.domicares.life
   ```

2. **Test** :
   ```bash
   git checkout staging
   git merge develop
   git push origin staging
   # → Déploiement automatique sur test.domicares.life
   ```

3. **Production** :
   ```bash
   git checkout main
   git merge staging
   git push origin main
   # → Déploiement automatique sur domicares.life
   ```

### Déploiement Manuel (Production)

Pour déclencher manuellement un déploiement en production :

1. Allez dans **Actions** sur GitHub
2. Sélectionnez **Deploy to Production**
3. Cliquez sur **Run workflow**
4. Tapez `DEPLOY_TO_PRODUCTION` pour confirmer
5. Cliquez sur **Run workflow**

## 🔄 Rollback en cas de Problème

### Rollback Automatique
- Le workflow PROD effectue un rollback automatique si le déploiement échoue
- Les backups sont conservés dans `/backups/prod/`

### Rollback Manuel
```bash
ssh deploy@<VPS_HOST>

# Lister les backups disponibles
ls -lh /backups/prod/frontend/

# Restaurer un backup spécifique
BACKUP_FILE="backup_20250112_143000.tar.gz"
tar -xzf /backups/prod/frontend/$BACKUP_FILE -C /var/www/prod/

# Redémarrer Nginx
sudo systemctl reload nginx
```

## 📊 Monitoring des Déploiements

### Vérifier l'état d'un déploiement
1. Allez dans l'onglet **Actions** sur GitHub
2. Cliquez sur le workflow en cours
3. Consultez les logs en temps réel

### Health Checks Automatiques
Chaque workflow vérifie automatiquement :
- ✅ Frontend accessible
- ✅ API Supabase fonctionnelle
- ✅ Base de données active
- ✅ Certificat SSL valide (PROD)

## 🐛 Dépannage

### Le déploiement échoue sur SSH
```bash
# Vérifier la connexion SSH
ssh -i <chemin_cle_privee> deploy@<VPS_HOST>

# Vérifier les permissions du dossier
ls -la /var/www/dev/ /var/www/test/ /var/www/prod/
```

### Les Edge Functions ne se déploient pas
```bash
# Se connecter au VPS
ssh deploy@<VPS_HOST>

# Vérifier les logs Supabase
cd /opt/supabase-prod
docker-compose logs functions
```

### Health check échoue
```bash
# Tester manuellement les endpoints
curl -v https://domicares.life
curl -v https://domicares.life/api/rest/v1/

# Vérifier Nginx
sudo nginx -t
sudo systemctl status nginx
```

## 📚 Ressources

- [Documentation GitHub Actions](https://docs.github.com/en/actions)
- [Supabase Self-Hosting Guide](https://supabase.com/docs/guides/self-hosting)
- [Guide de Migration DomiCares](../migration/docs/MULTI_ENV_SETUP.md)

## ⚡ Optimisations Futures

- [ ] Ajouter des notifications Slack/Discord
- [ ] Implémenter des tests de charge automatiques
- [ ] Ajouter une étape de preview des changements
- [ ] Mettre en place des déploiements progressifs (canary)
- [ ] Intégrer Lighthouse pour les métriques de performance
