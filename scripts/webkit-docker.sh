#!/usr/bin/env sh
# Tests WebKit en local, sans `playwright install` ni bibliothèques système sur l'hôte.
#
# Le navigateur tourne dans l'image officielle Playwright de la MÊME version que le projet
# (mcr.microsoft.com/playwright:v<version>-noble), via `playwright run-server`, avec le
# playwright-core du projet monté en lecture seule (aucun téléchargement de paquet).
# Les tests, `vite preview` et, pour la recette, l'API restent sur l'hôte (Node 22) ; les accès du
# navigateur à 127.0.0.1 passent par le client (`exposeNetwork: '<loopback>'`, voir les configs).
#
#   npm run test:webkit                    # tests/browser, projets webkit-iphone et webkit-ipad
#   npm run test:recette:webkit            # recette réelle (RECETTE_DATABASE_URL locale), webkit-iphone
#   sh scripts/webkit-docker.sh <arguments de `playwright test`>
#
# Prérequis : Docker démarré, `npm ci` fait, et `npm run build` pour tests/browser (preview de dist/).
# Ne remplace pas la recette Safari sur iPhone physique (document 12).
set -eu

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "webkit-docker : Docker est introuvable. Installez Docker, ou utilisez la CI (job web-ci, projets WebKit)." >&2
  exit 2
fi
if ! docker info >/dev/null 2>&1; then
  echo "webkit-docker : le démon Docker ne répond pas (démarrez Docker Desktop ou le service docker)." >&2
  exit 2
fi
if [ ! -f node_modules/playwright-core/package.json ]; then
  echo "webkit-docker : node_modules absent, lancez d'abord npm ci." >&2
  exit 2
fi

VERSION=$(node -p "require('./node_modules/playwright-core/package.json').version")
IMAGE="mcr.microsoft.com/playwright:v${VERSION}-noble"
PORT="${PW_WEBKIT_PORT:-3333}"
NAME="domicares-webkit-${PORT}"

docker rm -f "$NAME" >/dev/null 2>&1 || true
echo "webkit-docker : navigateur WebKit ${VERSION} dans ${IMAGE} (port ${PORT})"
docker run -d --rm --init --name "$NAME" --ipc=host \
  -p "127.0.0.1:${PORT}:${PORT}" \
  -v "$PWD/node_modules:/pw/node_modules:ro" -w /pw --user pwuser \
  "$IMAGE" node node_modules/playwright-core/cli.js run-server --port "$PORT" --host 0.0.0.0 >/dev/null
trap 'docker stop "$NAME" >/dev/null 2>&1 || true' EXIT INT TERM

# Le premier lancement télécharge l'image (~2 Go) : docker run attend la fin du téléchargement.
i=0
until docker logs "$NAME" 2>&1 | grep -q "Listening on"; do
  i=$((i + 1))
  if [ "$i" -gt 60 ] || ! docker inspect "$NAME" >/dev/null 2>&1; then
    echo "webkit-docker : le serveur Playwright n'a pas démarré." >&2
    docker logs "$NAME" 2>&1 | tail -20 >&2 || true
    exit 1
  fi
  sleep 1
done

PW_WEBKIT_WS_ENDPOINT="ws://127.0.0.1:${PORT}/" npx playwright test "$@"
