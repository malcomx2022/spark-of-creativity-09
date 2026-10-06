# Lint et compatibilité Safari/iOS — 6 octobre 2026

Suite du document 11, à partir de `main` après fusion de la PR 83.
Code applicatif initial : commit `8391d32` ; complément de normalisation des coordonnées dans la même PR.

## Corrections livrées

- **Lint actif : 98 erreurs corrigées, zéro erreur restante.** Les contrats métier
  remplacent les `any` des rendez-vous, praticiens, participations, rapports et widgets
  FedaPay. Les erreurs interceptées sont inconnues et traitées après vérification.
  Pas de désactivation de règle ni d'activation globale de TypeScript strict.
- **Archives :** `legacy/**` et `docs/archive/**` sont explicitement hors du lint
  applicatif, comme du build. Les 74 erreurs historiques Supabase ne sont pas corrigées
  dans ces références figées. Les fichiers des archives restent intacts. Les artefacts
  `dist/**`, `api/dist/**` et `work/**` sont également exclus. Le lint couvre l'API active,
  le front, les configurations et les nouveaux tests navigateur.
- **CI :** `npm run lint` devient bloquant. Les **46 avertissements** hérités
  (37 dépendances de hooks React, 9 exports Fast Refresh) restent visibles ; il ne
  s'agit pas d'erreurs. Modifier aveuglément les dépendances des effets de paiement
  risque de relancer leurs traitements : ce travail nécessite une revue dédiée.
- **Zod 4 :** le formulaire de coordonnées de paiement utilise `ZodError.issues`,
  plutôt que l'ancien attribut `errors`. Les validateurs de séances utilisent le
  contrat Zod installé, sans casts non contrôlés.
- **Safari :** cible JavaScript explicite Safari 16.4+, Chrome/Edge 111+ et Firefox
  128+. Safari 16.4 est aussi le minimum CSS de Tailwind 4 ; aucune promesse pour
  les anciens iOS. Les API optionnelles (push, installation) gardent leurs gardes.
- **iPadOS :** la présentation des instructions d'installation reconnaît les iPad
  utilisant un agent utilisateur de Mac et plusieurs points tactiles. Elle disparaît
  en mode standalone et n'apparaît pas sur un Mac sans écran tactile.
- **Mobile :** viewport sans blocage du zoom utilisateur, `viewport-fit=cover`, zones
  sûres de l'encoche et de l'indicateur d'accueil, champs d'au moins 16 px sur mobile,
  textarea lisible, chat dimensionné en `dvh`. Le bandeau PWA réserve sa hauteur
  dans la page avec ResizeObserver afin de ne pas masquer les dernières actions.

- **Coordonnées privées :** normalisation des `numeric` PostgreSQL reçus sous forme
  de chaînes avant l'affichage du profil praticien/coach. Évite l'exception `toFixed
  is not a function` dans l'écran de localisation ; zéro et valeurs nulles préservés,
  valeurs non numériques remplacées par null. Trois tests de régression couvrent
  ce contrat sans modifier la réponse de l'API.

## Contrôles reproductibles

```sh
npm ci
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm test
npm run build
npx playwright install --with-deps webkit chromium
npm run test:browser
```

Sur un environnement avec Chromium système :
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- --project=chromium`.

La suite comporte **114 scénarios** (38 par projet : WebKit iPhone, WebKit iPad,
Chromium). Elle vérifie huit écrans publics à 320/390/768/1280 px, les espaces
patient/praticien/coach/admin en portrait et paysage, un formulaire avec focus et
viewport réduit, le manifeste et les six seuls fichiers publics du cache PWA,
puis le repli de navigation privée : Chromium est réellement mis hors ligne ;
WebKit utilise une panne HTTP réelle (le serveur preview de test ferme la connexion).
Le mode `setOffline` de Playwright/WebKit bloque la navigation avant le worker :
ce mécanisme d'émulation ne valide donc pas le mode avion Safari physique.
La sonde HTTP et le CSP des services externes ne sont actifs qu'en preview avec
`DOMICARES_BROWSER_TEST=1`, jamais dans le build servi par Caddy.
Les services API, Socket.IO et FedaPay sont isolés et simulés. Ces tests ne
valident donc ni un paiement réel ni une livraison push Apple.

Résultats locaux : typechecks front/API réussis, build Vite réussi,
**39 tests Vitest** et **31 tests unitaires API** réussis. Lint : **0 erreur,
46 avertissements**. `npm audit` front : **0 vulnérabilité**, outils de test inclus.
Les résultats Chromium et WebKit CI sont ajoutés après exécution.

Le téléchargement local de WebKit retourne HTTP 403 « Domain forbidden » pour
les domaines de distribution Playwright. WebKit est installé et testé sur le
runner GitHub Actions ; aucune réussite locale WebKit n'est revendiquée.

## Recette obligatoire sur appareil Apple physique

WebKit automatisé et émulation de viewport ne remplacent pas Safari/iOS réel.
Aucun iPhone, iPad ou service de test d'appareils connecté n'est disponible dans
cet environnement. Cette validation **reste non effectuée**.

Sur une URL HTTPS de recette, sans données médicales réelles et avec FedaPay sandbox :

1. Noter modèle, version iOS/iPadOS, URL, version du build et date ; essayer Safari
   puis l'application installée via Partager → Sur l'écran d'accueil.
2. Vérifier portrait/paysage, encoche et bouton d'accueil, navigation et bas de page,
   menu mobile, onglets de chaque rôle et textes longs.
3. Ouvrir le clavier dans connexion, inscription et chat ; vérifier que le champ,
   les erreurs et le bouton d'envoi restent accessibles, sans zoom automatique,
   puis fermer le clavier et changer l'orientation.
4. Se connecter et se déconnecter ; changer de compte ; vérifier l'absence des
   données précédentes. Tester les cookies en Safari et en mode installé.
5. Couper le réseau : la navigation privée doit afficher le repli public, aucune
   réservation ou paiement ne doit être rejoué à la reconnexion.
6. Publier une seconde version de recette : le bandeau de mise à jour doit attendre
   une action explicite, puis charger la nouvelle version.
7. Sur iOS/iPadOS 16.4+ installé, activer le push après un geste utilisateur,
   recevoir une notification de recette, suivre le lien et vérifier que la
   déconnexion désabonne l'appareil. Tester aussi un refus de permission.
8. Réaliser la campagne FedaPay sandbox du document 09, notamment ouverture/fermeture
   du widget et retour depuis Mobile Money. Ne pas effectuer de paiement réel.

Enregistrer les résultats et anomalies dans ce document avant de déclarer la
recette Safari/iOS physique validée. Ne pas fermer ce point sur la seule base de CI.
