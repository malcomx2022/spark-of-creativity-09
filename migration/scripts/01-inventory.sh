#!/bin/bash
set -e

# ==============================================
# Script 1: Inventaire du Projet
# ==============================================

echo "================================================"
echo "🔍 INVENTAIRE DU PROJET - LOVABLE CLOUD"
echo "================================================"
echo ""

# Créer le dossier de sortie
mkdir -p ../output/inventory
OUTPUT_DIR="../output/inventory"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
INVENTORY_FILE="$OUTPUT_DIR/inventory_$TIMESTAMP.txt"

echo "📝 Génération de l'inventaire dans: $INVENTORY_FILE"
echo ""

# Fonction pour écrire dans le fichier
log() {
    echo "$1" | tee -a "$INVENTORY_FILE"
}

log "================================================"
log "INVENTAIRE DU PROJET - $(date)"
log "================================================"
log ""

# 1. Migrations SQL
log "🗄️  MIGRATIONS SQL"
log "----------------------------------------"
if [ -d "../../supabase/migrations" ]; then
    MIGRATION_COUNT=$(find ../../supabase/migrations -name "*.sql" | wc -l)
    log "Nombre total de migrations: $MIGRATION_COUNT"
    log ""
    log "Liste des migrations:"
    find ../../supabase/migrations -name "*.sql" -type f | sort | while read file; do
        log "  - $(basename $file)"
    done
else
    log "❌ Dossier migrations non trouvé"
fi
log ""

# 2. Edge Functions
log "⚡ EDGE FUNCTIONS"
log "----------------------------------------"
if [ -d "../../supabase/functions" ]; then
    FUNCTIONS_COUNT=$(find ../../supabase/functions -maxdepth 1 -type d | tail -n +2 | wc -l)
    log "Nombre total de fonctions: $FUNCTIONS_COUNT"
    log ""
    log "Liste des fonctions:"
    find ../../supabase/functions -maxdepth 1 -type d | tail -n +2 | while read dir; do
        FUNC_NAME=$(basename $dir)
        log "  - $FUNC_NAME"
        if [ -f "$dir/index.ts" ]; then
            LINES=$(wc -l < "$dir/index.ts")
            log "    Lignes de code: $LINES"
        fi
    done
else
    log "❌ Dossier functions non trouvé"
fi
log ""

# 3. Secrets et Variables d'Environnement
log "🔐 SECRETS ET VARIABLES D'ENVIRONNEMENT"
log "----------------------------------------"
if [ -f "../../.env.example" ]; then
    log "Variables requises (depuis .env.example):"
    grep -v '^#' ../../.env.example | grep -v '^$' | cut -d '=' -f1 | while read var; do
        log "  - $var"
    done
else
    log "⚠️  Fichier .env.example non trouvé"
fi
log ""

# 4. Dépendances NPM
log "📦 DÉPENDANCES NPM"
log "----------------------------------------"
if [ -f "../../package.json" ]; then
    log "Dependencies:"
    cat ../../package.json | jq -r '.dependencies | keys[]' 2>/dev/null | while read dep; do
        VERSION=$(cat ../../package.json | jq -r ".dependencies[\"$dep\"]" 2>/dev/null)
        log "  - $dep: $VERSION"
    done
    log ""
    log "DevDependencies:"
    cat ../../package.json | jq -r '.devDependencies | keys[]' 2>/dev/null | while read dep; do
        VERSION=$(cat ../../package.json | jq -r ".devDependencies[\"$dep\"]" 2>/dev/null)
        log "  - $dep: $VERSION"
    done
else
    log "❌ package.json non trouvé"
fi
log ""

# 5. Structure des composants React
log "⚛️  COMPOSANTS REACT"
log "----------------------------------------"
if [ -d "../../src/components" ]; then
    COMPONENTS_COUNT=$(find ../../src/components -name "*.tsx" | wc -l)
    log "Nombre total de composants: $COMPONENTS_COUNT"
    log ""
    log "Structure des composants:"
    tree -L 2 ../../src/components 2>/dev/null || find ../../src/components -type f -name "*.tsx" | head -20
else
    log "❌ Dossier components non trouvé"
fi
log ""

# 6. Pages
log "📄 PAGES"
log "----------------------------------------"
if [ -d "../../src/pages" ]; then
    PAGES_COUNT=$(find ../../src/pages -name "*.tsx" | wc -l)
    log "Nombre total de pages: $PAGES_COUNT"
    log ""
    log "Liste des pages:"
    find ../../src/pages -name "*.tsx" | while read file; do
        log "  - $(basename $file)"
    done
else
    log "❌ Dossier pages non trouvé"
fi
log ""

# 7. Hooks personnalisés
log "🎣 HOOKS PERSONNALISÉS"
log "----------------------------------------"
if [ -d "../../src/hooks" ]; then
    HOOKS_COUNT=$(find ../../src/hooks -name "*.ts" -o -name "*.tsx" | wc -l)
    log "Nombre total de hooks: $HOOKS_COUNT"
    log ""
    log "Liste des hooks:"
    find ../../src/hooks -name "*.ts" -o -name "*.tsx" | while read file; do
        log "  - $(basename $file)"
    done
else
    log "❌ Dossier hooks non trouvé"
fi
log ""

# 8. Taille totale du projet
log "📊 STATISTIQUES"
log "----------------------------------------"
if [ -d "../../src" ]; then
    TOTAL_LINES=$(find ../../src -name "*.ts" -o -name "*.tsx" -o -name "*.css" | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
    log "Lignes de code totales (src): $TOTAL_LINES"
    
    TOTAL_FILES=$(find ../../src -type f | wc -l)
    log "Fichiers totaux (src): $TOTAL_FILES"
fi
log ""

# 9. Résumé
log "================================================"
log "✅ RÉSUMÉ"
log "================================================"
log "Migrations SQL:      $MIGRATION_COUNT"
log "Edge Functions:      $FUNCTIONS_COUNT"
log "Composants React:    $COMPONENTS_COUNT"
log "Pages:               $PAGES_COUNT"
log "Hooks:               $HOOKS_COUNT"
log "Lignes de code:      $TOTAL_LINES"
log ""
log "📁 Inventaire sauvegardé dans: $INVENTORY_FILE"
log ""

echo ""
echo "✅ Inventaire terminé avec succès!"
echo ""
echo "Prochaine étape: ./02-backup-lovable.sh"
echo ""
