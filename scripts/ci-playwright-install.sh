#!/usr/bin/env bash
# Installation des navigateurs Playwright en CI, bornée dans le temps.
#
# `npx playwright install --with-deps` télécharge les paquets système par apt. Le 22 octobre 2026,
# le miroir Ubuntu des runners les a servis à quelques dizaines de ko/s : l'étape a duré plus de
# 20 minutes sans échouer, et le job pouvait atteindre la limite GitHub de 6 heures.
# Ici, chaque tentative est coupée après PW_INSTALL_TIMEOUT secondes (480 par défaut, contre une
# à deux minutes d'habitude), avec PW_INSTALL_ATTEMPTS tentatives (3 par défaut). Entre deux
# tentatives, dpkg termine une installation interrompue.
#
#   bash scripts/ci-playwright-install.sh webkit chromium
set -uo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage : $0 <navigateur>... (ex. webkit chromium)" >&2
  exit 2
fi

timeout_s="${PW_INSTALL_TIMEOUT:-480}"
attempts="${PW_INSTALL_ATTEMPTS:-3}"

# Sur un runner GitHub : apt réessaie lui-même les téléchargements interrompus ou figés.
if [ "${GITHUB_ACTIONS:-}" = "true" ] && command -v sudo >/dev/null 2>&1; then
  printf 'Acquire::Retries "3";\nAcquire::http::Timeout "30";\nAcquire::https::Timeout "30";\n' \
    | sudo tee /etc/apt/apt.conf.d/80-domicares-ci >/dev/null
fi

for attempt in $(seq 1 "$attempts"); do
  echo "Navigateurs Playwright ($*) : tentative ${attempt}/${attempts}, limite ${timeout_s} s"
  start=$(date +%s)
  # timeout signale tout le groupe de processus (npx, apt-get, dpkg) ; KILL 30 s après si besoin.
  timeout --kill-after=30s "${timeout_s}s" npx playwright install --with-deps "$@"
  status=$?
  if [ "$status" -eq 0 ]; then
    echo "Navigateurs Playwright installés en $(( $(date +%s) - start )) s"
    exit 0
  fi
  if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
    echo "::warning::Installation des navigateurs coupée après ${timeout_s} s (tentative ${attempt}/${attempts}, miroir apt lent ?)"
  else
    echo "::warning::Installation des navigateurs en échec, code ${status} (tentative ${attempt}/${attempts})"
  fi
  if [ "$attempt" -lt "$attempts" ]; then
    if command -v sudo >/dev/null 2>&1; then
      sudo dpkg --configure -a || true
    fi
    sleep $(( attempt * 10 ))
  fi
done

echo "::error::Navigateurs Playwright non installés après ${attempts} tentatives de ${timeout_s} s au plus : relancer le job ; si l'échec persiste, vérifier le miroir apt du runner."
exit 1
