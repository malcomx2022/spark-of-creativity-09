#!/bin/bash
set -e

# ==============================================
# Script 5: Installation Supabase DEV
# ==============================================

echo "================================================"
echo "🚀 INSTALLATION SUPABASE DEV"
echo "================================================"
echo ""

# Variables
SUPABASE_DIR="/opt/supabase-dev"
ENV="dev"
DOMAIN="dev.domicares.life"

# Ports
KONG_PORT=8200
POSTGRES_PORT=5434
STUDIO_PORT=8206

# Vérifier que le script est exécuté avec les bons privilèges
if [ "$EUID" -eq 0 ]; then 
    echo "⚠️  Ce script ne doit PAS être exécuté en tant que root"
    echo "   Utilisez: ./05-install-supabase-dev.sh (en tant qu'utilisateur deploy)"
    exit 1
fi

echo "✅ Exécution en tant qu'utilisateur non-root"
echo ""

# Vérifier que Docker est installé
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé"
    echo "   Exécutez d'abord: ./03-setup-vps.sh"
    exit 1
fi
echo "✅ Docker est installé"
echo ""

# Créer le dossier Supabase
echo "📁 Création du dossier Supabase DEV..."
sudo mkdir -p $SUPABASE_DIR
sudo chown -R $USER:$USER $SUPABASE_DIR
cd $SUPABASE_DIR
echo "✅ Dossier créé: $SUPABASE_DIR"
echo ""

# Cloner le repository officiel Supabase
echo "📦 Téléchargement de Supabase..."
if [ ! -d "$SUPABASE_DIR/supabase" ]; then
    git clone --depth 1 https://github.com/supabase/supabase.git
    echo "✅ Repository Supabase cloné"
else
    echo "✅ Repository Supabase déjà présent"
fi
echo ""

# Copier la configuration Docker Compose
echo "📋 Configuration de Docker Compose DEV..."
if [ -f "$HOME/docker-compose-dev.yml" ]; then
    cp $HOME/docker-compose-dev.yml $SUPABASE_DIR/docker-compose.yml
    echo "✅ Configuration copiée"
else
    echo "❌ Fichier docker-compose-dev.yml non trouvé dans $HOME"
    echo "   Copiez d'abord le fichier avec: scp migration/config/docker-compose-dev.yml deploy@vps:/home/deploy/"
    exit 1
fi
echo ""

# Créer les dossiers nécessaires
echo "📁 Création des dossiers pour les volumes..."
mkdir -p $SUPABASE_DIR/volumes/db/data
mkdir -p $SUPABASE_DIR/volumes/db/init
mkdir -p $SUPABASE_DIR/volumes/storage
mkdir -p $SUPABASE_DIR/volumes/functions
echo "✅ Dossiers créés"
echo ""

# Générer les clés JWT et secrets
echo "🔐 Génération des secrets DEV..."

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
if [ -f "$HOME/.env.dev.example" ]; then
    cp $HOME/.env.dev.example $SUPABASE_DIR/.env
else
    echo "❌ Fichier .env.dev.example non trouvé"
    exit 1
fi

# Générer les secrets
POSTGRES_PASSWORD=$(generate_secret)
JWT_SECRET=$(generate_secret)
ANON_KEY=$(generate_secret)
SERVICE_ROLE_KEY=$(generate_secret)
PHONE_ENCRYPTION_KEY=$(generate_secret)

echo "   📝 Secrets générés:"
echo "   - POSTGRES_PASSWORD"
echo "   - JWT_SECRET"
echo "   - ANON_KEY (provisoire)"
echo "   - SERVICE_ROLE_KEY (provisoire)"
echo "   - PHONE_ENCRYPTION_KEY"
echo ""

# Remplacer les valeurs dans .env
sed -i "s|SUPABASE_URL=.*|SUPABASE_URL=https://$DOMAIN/api|" $SUPABASE_DIR/.env
sed -i "s|API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://$DOMAIN/api|" $SUPABASE_DIR/.env
sed -i "s|SITE_URL=.*|SITE_URL=https://$DOMAIN|" $SUPABASE_DIR/.env
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" $SUPABASE_DIR/.env
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" $SUPABASE_DIR/.env
sed -i "s|PHONE_ENCRYPTION_KEY=.*|PHONE_ENCRYPTION_KEY=$PHONE_ENCRYPTION_KEY|" $SUPABASE_DIR/.env

echo "⚠️  IMPORTANT: Vous devez maintenant générer les clés ANON et SERVICE_ROLE avec Supabase CLI"
echo ""
echo "   Générer les clés JWT:"
echo "   $ cd $SUPABASE_DIR"
echo "   $ supabase gen keys --anon --jwt-secret $JWT_SECRET"
echo "   $ supabase gen keys --service-role --jwt-secret $JWT_SECRET"
echo ""
echo "   Puis éditez le fichier .env et remplacez:"
echo "   - ANON_KEY"
echo "   - SERVICE_ROLE_KEY"
echo ""

read -p "Appuyez sur Entrée quand vous aurez mis à jour les clés JWT..."

# Vérifier la configuration
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

# Créer le network Docker
echo "🌐 Création du réseau Docker..."
docker network create supabase-dev-network 2>/dev/null || echo "   Réseau existe déjà"
echo ""

# Démarrer les services
echo "🐳 Démarrage des services Supabase DEV..."
echo "   (Cela peut prendre plusieurs minutes lors du premier démarrage)"
echo ""

cd $SUPABASE_DIR
docker-compose up -d

echo ""
echo "⏳ Attente du démarrage des services..."
sleep 45

# Vérifier que les services sont démarrés
echo "🔍 Vérification des services..."
docker-compose ps

echo ""

# Tester la connexion à PostgreSQL
echo "🐘 Test de connexion à PostgreSQL..."
if docker-compose exec -T db psql -U postgres -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ PostgreSQL fonctionne"
else
    echo "❌ Impossible de se connecter à PostgreSQL"
    echo "   Vérifiez les logs: docker-compose logs db"
fi
echo ""

# Créer la base de données de dev
echo "📊 Création de la base de données domicares_dev..."
docker-compose exec -T db psql -U postgres -c "CREATE DATABASE domicares_dev;" 2>/dev/null || echo "   Base de données existe déjà"
echo "✅ Base de données créée"
echo ""

# Afficher les informations de connexion
echo "================================================"
echo "✅ SUPABASE DEV INSTALLÉ AVEC SUCCÈS"
echo "================================================"
echo ""
echo "🌐 URLs d'accès:"
echo "   Frontend:           https://$DOMAIN"
echo "   API Gateway (Kong): http://localhost:$KONG_PORT"
echo "   Studio (Admin):     http://localhost:$STUDIO_PORT"
echo "   PostgreSQL:         localhost:$POSTGRES_PORT"
echo ""
echo "📁 Dossier d'installation: $SUPABASE_DIR"
echo ""
echo "🔐 Secrets générés (sauvegardés dans .env):"
echo "   POSTGRES_PASSWORD:    $POSTGRES_PASSWORD"
echo "   JWT_SECRET:           $JWT_SECRET"
echo "   PHONE_ENCRYPTION_KEY: $PHONE_ENCRYPTION_KEY"
echo ""
echo "⚠️  SAUVEGARDEZ CES SECRETS DANS UN ENDROIT SÛR!"
echo ""
echo "📋 Commandes utiles:"
echo "   Voir les logs:        cd $SUPABASE_DIR && docker-compose logs -f"
echo "   Arrêter les services: cd $SUPABASE_DIR && docker-compose down"
echo "   Redémarrer:           cd $SUPABASE_DIR && docker-compose restart"
echo ""
echo "🔧 Prochaines étapes:"
echo "   1. Configurer Nginx: sudo cp ~/nginx-dev.conf /etc/nginx/sites-available/dev.conf"
echo "   2. Activer le site: sudo ln -s /etc/nginx/sites-available/dev.conf /etc/nginx/sites-enabled/"
echo "   3. Tester Nginx: sudo nginx -t"
echo "   4. Recharger Nginx: sudo systemctl reload nginx"
echo "   5. Configurer SSL: sudo certbot --nginx -d $DOMAIN"
echo "   6. Importer le schéma DB avec: ./06-import-database.sh dev"
echo ""
