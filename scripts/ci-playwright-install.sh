#!/usr/bin/env bash
# Installation des navigateurs Playwright en CI, bornée dans le temps.
#
# `npx playwright install --with-deps` télécharge les paquets système par apt. Le 22 octobre 2026,
# le miroir Ubuntu des runners les a servis à quelques dizaines de ko/s : l'étape a duré plus de
# 20 minutes sans échouer, et le job pouvait atteindre la limite GitHub de 6 heures.
# Ici, chaque tentative est coupée après PW_INSTALL_TIMEOUT secondes (480 par défaut, contre une
# à deux minutes d'habitude), avec PW_INSTALL_ATTEMPTS tentatives (3 par défaut). Entre deux
# tentatives, l'apt-get de la tentative coupée est arrêté, puis dpkg termine l'installation
# interrompue.
#
# Le 23 octobre 2026, cet apt-get a survécu à timeout : Playwright le lance sous sudo, qui l'exécute
# dans sa propre session, hors du groupe de processus que timeout signale. Il gardait le verrou
# /var/lib/dpkg/lock-frontend et les tentatives 2 et 3 échouaient en une seconde (« Could not get
# lock »), sans rien télécharger.
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
  # DPkg::Lock::Timeout : apt-get attend le verrou de dpkg au lieu d'échouer aussitôt.
  printf 'Acquire::Retries "3";\nAcquire::http::Timeout "30";\nAcquire::https::Timeout "30";\nDPkg::Lock::Timeout "120";\n' \
    | sudo tee /etc/apt/apt.conf.d/80-domicares-ci >/dev/null
fi

# Arrête l'apt-get d'une tentative coupée et attend la fin de dpkg (60 s au plus). dpkg n'est jamais
# interrompu : une installation de paquets coupée en cours d'écriture abîmerait le système du runner.
release_apt() {
  command -v sudo >/dev/null 2>&1 || return 0
  if pgrep -x apt-get >/dev/null; then
    echo "apt-get de la tentative précédente encore actif : arrêt"
    sudo pkill -TERM -x apt-get || true
  fi
  for _ in $(seq 1 30); do
    pgrep -x apt-get >/dev/null || pgrep -x dpkg >/dev/null || return 0
    sleep 2
  done
  sudo pkill -KILL -x apt-get || true
  pgrep -x dpkg >/dev/null && echo "::warning::dpkg toujours actif après 60 s ; la tentative suivante attendra le verrou"
  return 0
}

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
    release_apt
    if command -v sudo >/dev/null 2>&1; then
      sudo dpkg --configure -a || true
    fi
    sleep $(( attempt * 10 ))
  fi
done

echo "::error::Navigateurs Playwright non installés après ${attempts} tentatives de ${timeout_s} s au plus : relancer le job ; si l'échec persiste, vérifier le miroir apt du runner."
exit 1
