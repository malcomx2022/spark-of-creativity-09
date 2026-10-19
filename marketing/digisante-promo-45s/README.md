# Vidéo promotionnelle DigiSanté Mobile — 45 s et 15 s, 9:16

Montage reproductible de `DigiSante_promo_45s.mp4` et de sa version courte
`DigiSante_promo_15s.mp4` à partir du kit
`Kit_Promo_DigiSante_45s_9x16` (images, `scenario.json`, `Sous_titres_45s.srt`,
logo officiel, manifeste SHA-256). Le kit n'est pas versionné ici ; le script le lit
sans jamais le modifier.

## Refaire le montage

Prérequis : Python 3.9+, FFmpeg/ffprobe (libx264), bibliothèque système Cairo.

```bash
cd marketing/digisante-promo-45s
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python montage_digisante.py \
  --kit /chemin/vers/Kit_Promo_DigiSante_45s_9x16.zip \
  --sortie sortie
# version courte de 15 s (bloc « short15s » du scénario)
.venv/bin/python montage_digisante.py \
  --kit /chemin/vers/Kit_Promo_DigiSante_45s_9x16.zip \
  --version 15 --sortie sortie
```

`--kit` accepte l'archive `.zip` ou le dossier décompressé. Sorties dans `sortie/` :

- `DigiSante_promo_45s.mp4` : 1080 × 1920, 30 i/s, H.264 High 4.1, yuv420p
  BT.709, `faststart`, exactement 1 350 images (45,000 s) ;
- `DigiSante_promo_45s.srt` : sous-titres utilisés (identiques au kit sans voix
  off, recalés avec voix off).

Vérification indépendante :

```bash
ffprobe -v error -count_frames -show_entries \
  stream=codec_name,profile,width,height,r_frame_rate,pix_fmt,nb_read_frames,duration:format=duration \
  -of compact sortie/DigiSante_promo_45s.mp4
```

Version courte : mêmes caractéristiques, 450 images (15,000 s), fichiers
`DigiSante_promo_15s.mp4` et `DigiSante_promo_15s.srt`.

Le script exécute lui-même ces contrôles et échoue si l'un d'eux n'est pas conforme.

## Ce que fait le script

1. Vérifie les empreintes SHA-256 du manifeste, le découpage 0–7 / 7–15 / 15–23 /
   23–31 / 31–38 / 38–45 s et l'absence du dossier de sortie dans le kit.
2. Anime chaque image (zoom ou cadrage serré de 3,5 à 11 % et panoramique léger, d'après
   `motionPromptEn`) par une transformation à échelle **uniforme** : aucune
   déformation des visages, mains ou téléphones. Le recadrage de remplissage des
   sources 940/941 × 1672 vers 1080 × 1920 ne dépasse pas 1 pixel.
3. Applique les transitions du scénario : fondu court à 7 s, coupes franches à 15 et
   23 s, fondus à 31 s (0,4 s) et 38 s (0,8 s) ; dernière image tenue jusqu'à 45 s.
4. Ajoute les titres de `scenario.json` (Bricolage Grotesque, bandeau vert forêt
   avec le logo officiel), puis la signature finale (logo, « DigiSanté Mobile »,
   accroche, « Découvrez le projet »). Aucun badge de store, URL, QR code, date ou
   promesse n'est ajouté.
5. Laisse **vierges** les écrans des téléphones (plans 2 et 6) tant qu'aucune
   capture réelle autorisée n'est fournie.
6. Incruste les sous-titres français (DM Sans, blanc sur cartouche sombre) entre
   x = 48 et x = 930 et au-dessus de y = 1480 : hors de la colonne de boutons à
   droite et de la zone légende/pseudo en bas des réseaux sociaux.
7. Encode avec FFmpeg puis contrôle le fichier avec ffprobe et revérifie le kit.

## Version courte (15 s)

- Plans du bloc `short15s` : documents 0–4 s, professionnel 4–7 s, pharmacie
  7–10 s, signature 10–15 s ; coupes franches puis fondu de 0,5 s vers la signature.
- Chaque plan reprend le titre et le mouvement de son plan source, à la même
  vitesse que dans la version longue.
- Le kit ne fournit pas de `.srt` de 15 s : les sous-titres sont tirés de
  `short15s.voiceover` (une phrase par repère, durée au prorata du texte, de 0,3 à
  14,7 s). L'ordre du texte (documents, ordonnances, professionnels) diffère de
  celui des images (documents, professionnel, pharmacie) : il est conservé tel
  qu'écrit dans le scénario.
- Voix off attendue : `voix_off_15s.wav` ou `voix_off_15s.mp3` (15 s maximum).

## Voix off et musique

- Si `voix_off.wav` ou `voix_off.mp3` est présent à la racine du kit, il est mixé
  (normalisation −16 LUFS) et les sous-titres sont recalés : les repères sont
  répartis sur les plages de parole détectées par `silencedetect`, au prorata du
  texte, puis calés sur le silence le plus proche. Ce recalage reste à contrôler à
  l'écoute avant publication. Une voix off de plus de 45 s est refusée.
- Sans voix off, le fichier est une prévisualisation muette (sans piste audio).
  Le texte à enregistrer est dans `VOIX_OFF_A_ENREGISTRER.md`.
- Une musique n'est utilisée que si elle est fournie explicitement avec sa
  licence : `--musique fichier.wav --licence-musique "référence de la licence"`.

## Polices

`fonts/` contient Bricolage Grotesque et DM Sans (licence SIL OFL 1.1, fichiers
Fontsource), polices de la charte « Wax & Terre ».
