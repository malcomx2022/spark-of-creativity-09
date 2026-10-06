# Front — consignes complémentaires

Les consignes de `../CLAUDE.md` s'appliquent. Plan actif :
`../docs/migration-postgresql/11-CORRECTIONS-FONCTIONNEL-SECURITE-PWA.md`.

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

Validation du chantier : 31 tests front, typecheck/build et lint de `lib/api/` et de la PWA réussis.
Ce socle est contrôlé par un lint bloquant en CI ; les erreurs héritées des autres
écrans restent suivies séparément dans le document 10.

- Installer `session-cache.ts` avant React : purger les résultats et requêtes de l'ancien
  compte avant le rendu du suivant ; garder le cache lors d'une simple rotation.
- Utiliser `/appointments/page` pour la pagination et le total de l'historique.
- `/create-test-accounts` reste exclusivement DEV et absent du build publié.
- PWA : autorisation explicite de fichiers publics uniquement ; aucune API, page authentifiée,
  donnée médicale ni paiement en cache. Mises à jour consenties, hash incluant les fichiers publics.
- Responsive : boutons multilignes, `min-width: 0`, actions empilées et onglets défilants ;
  vérifier 320/390/768/1280 px avec données longues après modification des layouts.
