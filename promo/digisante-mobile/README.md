# Vidéo promotionnelle DigiSanté Mobile (45 s, verticale)

Chaîne de montage reproductible, pilotée par `scenario.json`, qui produit
`DigiSante_promo_45s.mp4` : 1080 × 1920, 30 images/s, H.264 High 4.0 + AAC,
durée exacte de 45 s (1350 images), compatible téléphones et réseaux sociaux.

## État du dossier (19 octobre 2026)

Les fichiers sources attendus (scénario, sous-titres, photos, captures, logo, voix off,
musique) **n'étaient pas présents dans le dépôt**. Le dossier contient donc :

- un `scenario.json` et un `Sous_titres_45s.srt` **brouillons**, rédigés à partir du
  README et des métadonnées du site (domicares.life), à valider avant diffusion ;
- une prévisualisation **muette** (piste audio silencieuse) rendue avec les visuels
  disponibles dans le dépôt : logo officiel `src/assets/logo.png` et photo
  `src/assets/hero-medical.jpg` ;
- des écrans de téléphone **volontairement vierges** tant qu'aucune capture réelle
  de l'application n'est fournie ;
- `voix_off_a_enregistrer.txt`, le texte à enregistrer pour la version sonorisée.

## Refaire le montage

```bash
# depuis la racine du dépôt
python3 promo/digisante-mobile/montage.py            # montage complet (≈ 2 à 4 min)
python3 promo/digisante-mobile/montage.py --rapide   # brouillon rapide
python3 promo/digisante-mobile/montage.py --verifier # ffprobe seul sur la sortie existante
```

Prérequis : Python 3.9+, Pillow (`pip install pillow`), FFmpeg ≥ 4.4 compilé avec
libx264, libfreetype et libass (`ffmpeg -filters` doit lister `zoompan`, `drawtext`, `ass`).
Police Inter si installée, sinon Liberation Sans ou DejaVu Sans.

## Fichiers d'entrée (jamais modifiés par le script)

| Fichier | Rôle | Si absent |
|---|---|---|
| `scenario.json` | Plans, titres, voix off, mouvements, visuels | erreur |
| `Sous_titres_45s.srt` | Sous-titres français | erreur |
| `images/plan1_soignants.jpg`, `images/plan5_suivi.jpg` | Photos des plans 1 et 5 | image de secours du scénario, sinon plaque de substitution |
| `captures/plan2_recherche.png`, `plan3_reservation.png`, `plan4_paiement.png` | Captures réelles de l'application | écran du téléphone laissé vierge |
| `logo.png` | Logo officiel | `src/assets/logo.png` |
| `voix_off.wav` ou `voix_off.mp3` | Voix off | prévisualisation muette + `voix_off_a_enregistrer.txt` |
| `musique.mp3/.wav/.m4a/.ogg` **et** `musique.autorisation.txt` | Musique autorisée (licence ou autorisation écrite dans le fichier texte) | aucune musique ; une musique sans justificatif est ignorée |

## Ce que fait le script

1. Vérifie FFmpeg, ffprobe, les filtres requis, Pillow et les polices.
2. Lit et contrôle le scénario : six plans contigus, 0–7 / 7–15 / 15–23 / 23–31 / 31–38 / 38–45 s.
3. Compose une plaque fixe par plan (Pillow, 2160 × 3840 pour des mouvements sans tremblement) :
   - `photo` : portrait recadré autour du `point_focal` ; paysage présenté entier sur un fond
     flouté. Jamais d'étirement : visages, mains et téléphones gardent leurs proportions ;
   - `ecran_app` : téléphone sur fond dégradé, écran vierge ou capture réelle insérée ;
   - `logo` : logo officiel en grand pour la signature.
4. Anime chaque plaque avec `zoompan` (zoom avant/arrière ou panoramique, 4 à 8 %,
   progression adoucie) en un segment au nombre d'images exact.
5. Concatène les segments, incruste le petit logo (plans 1 à 5), les surtitres, titres,
   sous-titre et appel à l'action du scénario (`drawtext`, fondu d'entrée et de sortie).
6. Convertit le SRT en ASS et l'incruste avec libass : Inter gras 50 px, boîte noire à 55 %,
   ancré en bas-centre à 470 px du bas (fin du texte à 75 % de la hauteur), marge droite
   de 180 px pour rester à l'écart des boutons des réseaux sociaux.
7. Audio : voix off normalisée à −16 LUFS (vraie crête −1,5 dB), musique autorisée à −18 dB
   atténuée sous la voix ; sinon piste silencieuse pour garder un MP4 universel.
8. Encode (libx264 `slow` CRF 20, High 4.0, yuv420p, GOP 60, AAC 160 kb/s 48 kHz, `faststart`),
   extrait une image au milieu de chaque plan (`apercu_plans.jpg`) et vérifie avec ffprobe.

Les intermédiaires sont dans `work/` (ignoré par git) ; `work/commande_ffmpeg_finale.txt`
conserve la commande FFmpeg exacte du dernier assemblage.

## Voix off et recalage des sous-titres

Dès qu'un `voix_off.wav` ou `voix_off.mp3` est présent, il est intégré et les sous-titres
sont recalés sur l'enregistrement (`audio.recalage_sous_titres` : `auto`, `segments`,
`lineaire` ou `aucun`) :

- les prises de parole sont détectées avec `silencedetect` (−35 dB, pauses ≥ 0,3 s) ;
- si leur nombre égale celui des sous-titres, chaque sous-titre épouse sa prise de parole ;
- sinon les horodatages sont mis à l'échelle entre la première et la dernière prise de parole.

Le SRT recalé est exporté à côté de la vidéo (`DigiSante_promo_45s.srt`) pour les
plateformes qui acceptent un fichier de sous-titres. Une voix plus longue que 45 s est
coupée en fondu à 45 s et signalée.

## Vérification

`rapport_verification.txt` liste les contrôles (codec, profil, dimensions, yuv420p,
30 images/s, 1350 images, durées du flux et du conteneur, piste AAC, conteneur MP4).
Commandes équivalentes :

```bash
ffprobe -v error -count_frames -select_streams v:0 \
  -show_entries stream=codec_name,profile,level,width,height,pix_fmt,r_frame_rate,nb_read_frames,duration \
  -of json promo/digisante-mobile/DigiSante_promo_45s.mp4
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_type,codec_name,sample_rate,channels \
  -of json promo/digisante-mobile/DigiSante_promo_45s.mp4
```

## Format de `scenario.json`

- `sortie` : `fichier`, `largeur`, `hauteur`, `fps`, `duree_s`.
- `marque` : `nom`, `logo`, `logo_secours`, `couleurs` (`primaire`, `primaire_fonce`,
  `fond_sombre`, `secondaire`, `texte`).
- `audio` : listes `voix_off` et `musique`, `musique_autorisation`, `volume_musique_db`,
  `recalage_sous_titres`.
- `sous_titres` : `fichier`, `police_taille_px`, `marge_bas_px`, `marge_gauche_px`, `marge_droite_px`.
- `plans[]` : `numero`, `nom`, `debut_s`, `fin_s`, `visuel` (`type` photo | ecran_app | logo,
  `fichier`, `secours`, `capture`, `cadrage` auto | couvrir | contenir, `point_focal`),
  `mouvement` (`type` zoom_avant | zoom_arriere | pan_gauche_droite | pan_droite_gauche |
  pan_haut_bas | pan_bas_haut | fixe, `amplitude`), `surtitre`, `titre` (retours à la ligne
  avec `\n`), `sous_titre`, `cta`, `voix_off`, `mise_en_page` (positions en pixels, optionnel).

## Pour la version finale

1. Remplacer les textes brouillons de `scenario.json` et `Sous_titres_45s.srt`.
2. Déposer les photos dans `images/`, les captures dans `captures/`, le logo dans `logo.png`.
3. Enregistrer la voix off (`voix_off.wav`) d'après `voix_off_a_enregistrer.txt`.
4. Fournir, le cas échéant, une musique avec son justificatif `musique.autorisation.txt`.
5. Relancer `python3 promo/digisante-mobile/montage.py` et contrôler `apercu_plans.jpg`
   et `rapport_verification.txt`.
