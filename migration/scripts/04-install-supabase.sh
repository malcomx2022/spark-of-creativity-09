#!/bin/bash
set -e

# ==============================================
# Script 4: Installation de Supabase Self-Hosted
# ==============================================

echo "================================================"
echo "🚀 INSTALLATION SUPABASE SELF-HOSTED"
echo "================================================"
echo ""

# Variables
SUPABASE_DIR="/opt/supabase"
CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../config" && pwd)"

# Vérifier que le script est exécuté avec les bons privilèges
if [ "$EUID" -eq 0 ]; then 
    echo "⚠️  Ce script ne doit PAS être exécuté en tant que root"
    echo "   Utilisez: ./04-install-supabase.sh (en tant qu'utilisateur deploy)"
    exit 1
fi

echo "✅ Exécution en tant qu'utilisateur non-root"
echo ""

# 1. Vérifier que Docker est installé
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé"
    echo "   Exécutez d'abord: ./03-setup-vps.sh"
    exit 1
fi
echo "✅ Docker est installé"
echo ""

# 2. Créer le dossier Supabase
echo "📁 Création du dossier Supabase..."
sudo mkdir -p $SUPABASE_DIR
sudo chown -R $USER:$USER $SUPABASE_DIR
cd $SUPABASE_DIR
echo "✅ Dossier créé: $SUPABASE_DIR"
echo ""

# 3. Cloner le repository officiel Supabase
echo "📦 Téléchargement de Supabase..."
if [ ! -d "$SUPABASE_DIR/supabase" ]; then
    git clone --depth 1 https://github.com/supabase/supabase.git
    echo "✅ Repository Supabase cloné"
else
    echo "✅ Repository Supabase déjà présent"
fi
echo ""

# 4. Copier la configuration Docker Compose
echo "📋 Configuration de Docker Compose..."
cp $CONFIG_DIR/supabase-docker-compose.yml $SUPABASE_DIR/docker-compose.yml
echo "✅ Configuration copiée"
echo ""

# 5. Créer les dossiers nécessaires
echo "📁 Création des dossiers pour les volumes..."
mkdir -p $SUPABASE_DIR/volumes/db/init
mkdir -p $SUPABASE_DIR/volumes/api
mkdir -p $SUPABASE_DIR/volumes/functions
mkdir -p $SUPABASE_DIR/volumes/storage
echo "✅ Dossiers créés"
echo ""

# 6. Générer les clés JWT et secrets
echo "🔐 Génération des secrets..."

# Fonction pour générer un secret aléatoire
generate_secret() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

# Vérifier si .env existe déjà
if [ -f "$SUPABASE_DIR/.env" ]; then
    echo "⚠️  Le fichier .env existe déjà"
    read -p "   Voulez-vous le remplacer? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Installation annulée"
        exit 1
    fi
fi

# Copier le template
cp $CONFIG_DIR/.env.production.example $SUPABASE_DIR/.env

# Générer les secrets
POSTGRES_PASSWORD=$(generate_secret)
JWT_SECRET=$(generate_secret)
PHONE_ENCRYPTION_KEY=$(generate_secret)

echo "   📝 Secrets générés:"
echo "   - POSTGRES_PASSWORD"
echo "   - JWT_SECRET"
echo "   - PHONE_ENCRYPTION_KEY"
echo ""

# Remplacer les valeurs dans .env
sed -i "s/votre_super_mot_de_passe_securise_changez_moi/$POSTGRES_PASSWORD/" $SUPABASE_DIR/.env
sed -i "s/votre_jwt_secret_changez_moi_minimum_32_caracteres/$JWT_SECRET/" $SUPABASE_DIR/.env
sed -i "s/votre_cle_encryption_32_caracteres_minimum/$PHONE_ENCRYPTION_KEY/" $SUPABASE_DIR/.env

echo "⚠️  IMPORTANT: Vous devez maintenant générer les clés ANON et SERVICE_ROLE"
echo ""
echo "   Exécutez ces commandes:"
echo "   $ cd $SUPABASE_DIR"
echo "   $ npx supabase gen keys --anon"
echo "   $ npx supabase gen keys --service-role"
echo ""
echo "   Puis éditez le fichier .env et remplacez:"
echo "   - ANON_KEY"
echo "   - SERVICE_ROLE_KEY"
echo ""

read -p "Appuyez sur Entrée quand vous aurez mis à jour les clés..."

# 7. Créer le fichier kong.yml
echo "🦍 Configuration de Kong API Gateway..."
cat > $SUPABASE_DIR/volumes/api/kong.yml << 'EOF'
_format_version: "2.1"
_transform: true

services:
  - name: auth
    url: http://auth:9999
    routes:
      - name: auth-v1
        paths:
          - /auth/v1
        strip_path: true

  - name: rest
    url: http://rest:3000
    routes:
      - name: rest-v1
        paths:
          - /rest/v1
        strip_path: true

  - name: realtime
    url: http://realtime:4000
    routes:
      - name: realtime-v1
        paths:
          - /realtime/v1
        strip_path: true

  - name: storage
    url: http://storage:5000
    routes:
      - name: storage-v1
        paths:
          - /storage/v1
        strip_path: true

  - name: functions
    url: http://functions:9000
    routes:
      - name: functions-v1
        paths:
          - /functions/v1
        strip_path: true

  - name: meta
    url: http://meta:8080
    routes:
      - name: meta
        paths:
          - /meta
        strip_path: true
EOF
echo "✅ Kong configuré"
echo ""

# 8. Vérifier la configuration
echo "🔍 Vérification de la configuration..."
if [ ! -f "$SUPABASE_DIR/.env" ]; then
    echo "❌ Fichier .env manquant"
    exit 1
fi

if [ ! -f "$SUPABASE_DIR/docker-compose.yml" ]; then
    echo "❌ Fichier docker-compose.yml manquant"
    exit 1
fi

echo "✅ Configuration valide"
echo ""

# 9. Démarrer les services
echo "🐳 Démarrage des services Supabase..."
echo "   (Cela peut prendre plusieurs minutes lors du premier démarrage)"
echo ""

cd $SUPABASE_DIR
docker-compose up -d

echo ""
echo "⏳ Attente du démarrage des services..."
sleep 30

# Vérifier que les services sont démarrés
echo "🔍 Vérification des services..."
docker-compose ps

echo ""

# 10. Tester la connexion à PostgreSQL
echo "🐘 Test de connexion à PostgreSQL..."
if docker-compose exec -T db psql -U postgres -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ PostgreSQL fonctionne"
else
    echo "❌ Impossible de se connecter à PostgreSQL"
    echo "   Vérifiez les logs: docker-compose logs db"
fi
echo ""

# 11. Afficher les URLs d'accès
echo "================================================"
echo "✅ SUPABASE INSTALLÉ AVEC SUCCÈS"
echo "================================================"
echo ""
echo "🌐 URLs d'accès:"
echo "   API Gateway (Kong): http://localhost:8000"
echo "   Studio (Admin):     http://localhost:3001"
echo "   PostgreSQL:         localhost:5432"
echo ""
echo "📁 Dossier d'installation: $SUPABASE_DIR"
echo ""
echo "🔐 Secrets générés (sauvegardés dans .env):"
echo "   POSTGRES_PASSWORD:    $POSTGRES_PASSWORD"
echo "   JWT_SECRET:           $JWT_SECRET"
echo "   PHONE_ENCRYPTION_KEY: $PHONE_ENCRYPTION_KEY"
echo ""
echo "⚠️  Sauvegardez ces secrets dans un endroit sûr!"
echo ""
echo "📋 Commandes utiles:"
echo "   Voir les logs:        cd $SUPABASE_DIR && docker-compose logs -f"
echo "   Arrêter les services: cd $SUPABASE_DIR && docker-compose down"
echo "   Redémarrer:           cd $SUPABASE_DIR && docker-compose restart"
echo ""
echo "🔧 Prochaine étape:"
echo "   1. Vérifiez que Studio est accessible: http://votre-ip:3001"
echo "   2. Configurez Nginx avec: ./10-configure-nginx.sh"
echo "   3. Importez la base de données avec: ./06-import-database.sh"
echo ""
