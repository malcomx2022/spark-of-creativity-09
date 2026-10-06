# Front — consignes complémentaires

Les consignes de `../CLAUDE.md` s'appliquent. Plan actif :
`../docs/migration-postgresql/12-CORRECTIONS-LINT-SAFARI-IOS.md`.

- Garder le socle `lib/api/`, les hooks TanStack Query, les composants et les parcours
  patient, praticien, coach, administrateur. Les droits et montants restent décidés par l'API.
- Préserver `ApiError`, la gestion des sessions et la rotation partagée dans `client.ts`.
  Toute coordination entre onglets doit tenir compte des cookies et des événements `storage`.
- Pour le lot temps réel, coordonner `session.ts` et `realtime.ts` avec la passerelle :
  renouvellement du jeton, reconnexion effective, réabonnement aux rendez-vous et
  suppression des abonnements de l'ancien utilisateur après déconnexion.
- Pour les fichiers, préserver le contrat PUT actuel autant que possible. Une évolution
  vers POST signé exige une modification coordonnée du fournisseur, des DTO et du client.
- Corriger les erreurs lint progressivement sur les fichiers concernés. Ne pas activer
  `strict` globalement ni désactiver des règles globales pour faire passer un seul lot.
- Étendre les tests Vitest existants ; couvrir reconnexion, changement d'utilisateur,
  refresh concurrent et erreurs d'envoi réelles lorsque ces parcours changent.
- Faire passer typecheck, tests et build ; relever les erreurs lint restantes avec leur périmètre.

Validation du chantier : 39 tests front ; typecheck/build réussis. Le lint actif
est bloquant en CI : zéro erreur et 46 avertissements hérités visibles. Les archives
Supabase et les artefacts sont explicitement exclus, sans modifier leurs fichiers.
Ne pas ajouter des dépendances d'effets de paiement sans vérifier leurs déclenchements.

- Cible minimale : Safari/iOS 16.4 (Tailwind 4). Conserver `dvh`, les zones sûres,
  les champs mobiles ≥16 px, et la détection iPadOS avec agent utilisateur de Mac.
- Réserver la hauteur du bandeau PWA pour garder les actions de bas de page accessibles.
- Exécuter `npm run build` puis `npm run test:browser` après installation des navigateurs
  Playwright. Les 114 scénarios simulent les services et utilisent WebKit/Chromium.
- Ne jamais assimiler les résultats WebKit automatisés à une recette Safari sur appareil
  physique. Suivre la checklist du document 12 et enregistrer les preuves réelles.

- Installer `session-cache.ts` avant React : purger les résultats et requêtes de l'ancien
  compte avant le rendu du suivant ; garder le cache lors d'une simple rotation.
- Utiliser `/appointments/page` pour la pagination et le total de l'historique.
- `/create-test-accounts` reste exclusivement DEV et absent du build publié.
- PWA : autorisation explicite de fichiers publics uniquement ; aucune API, page authentifiée,
  donnée médicale ni paiement en cache. Mises à jour consenties, hash incluant les fichiers publics.
- Garder `onlineMutationOptions` : mutations non mises en pause, sans retry automatique,
  et rejet des écritures hors ligne par le client avant tout appel réseau.
- Responsive : boutons multilignes, `min-width: 0`, actions empilées et onglets défilants ;
  vérifier 320/390/768/1280 px avec données longues après modification des layouts.
