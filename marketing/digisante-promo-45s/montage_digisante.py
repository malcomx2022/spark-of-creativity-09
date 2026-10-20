#!/usr/bin/env python3
"""Montage reproductible de la vidéo promotionnelle DigiSanté Mobile (9:16).

Entrée : le kit « Kit_Promo_DigiSante_45s_9x16 » (dossier ou archive .zip).
Sortie : DigiSante_promo_45s.mp4 (version longue, par défaut) ou, avec
--version 15, DigiSante_promo_15s.mp4 (bloc « short15s » du scénario), en
1080 × 1920, 30 i/s, H.264, avec le fichier .srt utilisé pour l'incrustation.

Le kit n'est jamais modifié : les empreintes SHA-256 du manifeste sont vérifiées
avant et après le montage. Les images sont générées image par image (zoom et
panoramique à échelle uniforme, sans déformation), puis encodées par FFmpeg.

Voix off : si voix_off.wav ou voix_off.mp3 (voix_off_15s.wav ou voix_off_15s.mp3
pour la version courte) est présent à la racine du kit, il est intégré et les
sous-titres sont recalés sur les plages de parole détectées.
Sinon la vidéo est une prévisualisation muette.
Musique : uniquement si --musique et --licence-musique sont fournis.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
PLANS_ATTENDUS = {
    45: [(0, 7), (7, 15), (15, 23), (23, 31), (31, 38), (38, 45)],
    15: [(0, 4), (4, 7), (7, 10), (10, 15)],
}

# Charte « Wax & Terre » (scenario.json, notes de production)
VERT_FORET = (0x1F, 0x70, 0x40)
CREME = (0xFA, 0xF6, 0xF0)
TERRE_CUITE = (0xC2, 0x54, 0x2B)
INDIGO = (0x2B, 0x3A, 0x67)

# Zones sûres réseaux sociaux (TikTok, Reels, Shorts) : haut ~220 px réservé aux
# onglets, colonne de boutons à droite (x > ~920 entre y ~850 et ~1650), légende
# et pseudo dans le bas (~25 %). Titres et sous-titres restent hors de ces zones.
SURE_HAUT = 250
SURE_GAUCHE = 64
SURE_DROITE = 170
SOUS_TITRE_GAUCHE, SOUS_TITRE_DROITE = 48, 150  # cartouche entre x = 48 et x = 930
SOUS_TITRE_BAS = 1480  # bord inférieur du bloc de sous-titres (440 px du bas)

DOSSIER_SCRIPT = Path(__file__).resolve().parent
POLICES = {
    "titre": DOSSIER_SCRIPT / "fonts" / "bricolage-grotesque-latin-700-normal.woff",
    "titre_fort": DOSSIER_SCRIPT / "fonts" / "bricolage-grotesque-latin-800-normal.woff",
    "texte": DOSSIER_SCRIPT / "fonts" / "dm-sans-latin-500-normal.woff",
    "texte_fort": DOSSIER_SCRIPT / "fonts" / "dm-sans-latin-600-normal.woff",
}

# Mouvement de caméra par plan, d'après motionPromptEn : zoom (début, fin) et
# point visé (x, y) normalisé dans l'image source (début, fin). Échelle uniforme.
MOUVEMENTS = {
    1: {"zoom": (1.00, 1.07), "centre": ((0.50, 0.50), (0.46, 0.45))},  # approche lente
    2: {"zoom": (1.09, 1.11), "centre": ((0.54, 0.48), (0.47, 0.46))},  # glissé latéral
    3: {"zoom": (1.00, 1.06), "centre": ((0.50, 0.50), (0.50, 0.43))},  # travelling avant
    4: {"zoom": (1.08, 1.08), "centre": ((0.46, 0.47), (0.54, 0.47))},  # latéral comptoir
    5: {"zoom": (1.00, 1.07), "centre": ((0.50, 0.50), (0.50, 0.43))},  # approche douce
    6: {"zoom": (1.00, 1.035), "centre": ((0.50, 0.50), (0.50, 0.50))},  # très lente
}

# Transitions aux frontières de plans (colonne « transition » du scénario) :
# durée du fondu enchaîné centré sur la frontière, 0 = coupe franche. La version
# courte reprend les coupes franches 2→3 et 3→4, puis un fondu vers la signature.
TRANSITIONS = {
    45: {7: 0.30, 15: 0.0, 23: 0.0, 31: 0.40, 38: 0.80},
    15: {4: 0.0, 7: 0.0, 10: 0.50},
}


# --------------------------------------------------------------------------- #
# Kit, intégrité et entrées
# --------------------------------------------------------------------------- #

def sha256(chemin: Path) -> str:
    h = hashlib.sha256()
    with chemin.open("rb") as f:
        for bloc in iter(lambda: f.read(1 << 20), b""):
            h.update(bloc)
    return h.hexdigest()


def verifier_empreintes(kit: Path, manifeste: dict) -> None:
    erreurs = []
    for relatif, infos in manifeste.get("assets", {}).items():
        chemin = kit / relatif
        if not chemin.is_file():
            erreurs.append(f"absent : {relatif}")
        elif sha256(chemin) != infos["sha256"]:
            erreurs.append(f"empreinte différente : {relatif}")
    if erreurs:
        sys.exit("Kit non conforme au manifeste :\n  " + "\n  ".join(erreurs))


def preparer_kit(source: Path, travail: Path) -> Path:
    if source.is_dir():
        return source
    if source.suffix.lower() == ".zip":
        cible = travail / "kit"
        with zipfile.ZipFile(source) as z:
            for nom in z.namelist():
                if nom.startswith("/") or ".." in Path(nom).parts:
                    sys.exit(f"Chemin refusé dans l'archive : {nom}")
            z.extractall(cible)
        racines = [p.parent for p in cible.rglob("scenario.json")]
        if len(racines) != 1:
            sys.exit("L'archive doit contenir un seul scenario.json.")
        return racines[0]
    sys.exit(f"Kit introuvable : {source}")


@dataclass
class Repere:
    debut: float
    fin: float
    lignes: list[str]


def _temps_srt(texte: str) -> float:
    h, m, s = texte.replace(",", ".").split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def lire_srt(chemin: Path) -> list[Repere]:
    blocs = re.split(r"\n\s*\n", chemin.read_text(encoding="utf-8-sig").strip())
    reperes = []
    for bloc in blocs:
        lignes = [l.rstrip() for l in bloc.splitlines()]
        idx = next(i for i, l in enumerate(lignes) if "-->" in l)
        debut, fin = (x.strip() for x in lignes[idx].split("-->"))
        reperes.append(Repere(_temps_srt(debut), _temps_srt(fin), [l for l in lignes[idx + 1:] if l]))
    return reperes


def _format_srt(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def ecrire_srt(reperes: list[Repere], chemin: Path) -> None:
    blocs = [f"{i}\n{_format_srt(r.debut)} --> {_format_srt(r.fin)}\n" + "\n".join(r.lignes)
             for i, r in enumerate(reperes, 1)]
    chemin.write_text("\n\n".join(blocs) + "\n", encoding="utf-8")


def verifier_scenario(scenario: dict, duree: int) -> list[dict]:
    """Plans de la version demandée. Chaque plan garde la durée de son plan
    source (« duree_mouvement ») pour que zooms et panoramiques aient la même
    vitesse dans les deux versions."""
    for p in scenario["scenes"]:
        p["duree_mouvement"] = p["end"] - p["start"]
    if duree == 45:
        bloc, plans = scenario, scenario["scenes"]
    else:
        bloc = scenario["short15s"]
        sources = {p["id"]: p for p in scenario["scenes"]}
        plans = [dict(sources[c["sourceScene"]], start=c["start"], end=c["end"]) for c in bloc["scenes"]]
        if plans[-1]["id"] != scenario["scenes"][-1]["id"]:
            sys.exit("La version courte doit se terminer sur la signature.")
    bornes = [(p["start"], p["end"]) for p in plans]
    if bloc.get("durationSeconds") != duree or bornes != PLANS_ATTENDUS[duree]:
        sys.exit(f"Découpage inattendu : {bornes} (attendu {PLANS_ATTENDUS[duree]}).")
    return plans


# Voix off 15 s réordonnée selon les images (décision du porteur) : mêmes phrases
# que short15s.voiceover, chacune calée sur le plan qu'elle décrit — documents
# 0–4 s, professionnel 4–7 s, pharmacie 7–10 s, signature 10–15 s.
VOIX_OFF_15S = [
    (0.3, 3.7, "Vos documents de santé."),
    (4.0, 6.8, "Vos échanges avec les professionnels."),
    (7.0, 8.2, "Vos ordonnances."),
    (8.2, 11.4, "Avec DigiSanté Mobile, gardez le fil de votre parcours."),
    (11.4, 13.4, "Votre santé, plus proche de vous."),
    (13.4, 14.7, "Découvrez le projet."),
]


def phrases(texte: str) -> list[str]:
    return [ph.strip() for ph in re.findall(r"[^.!?]+[.!?]", texte)]


def reperes_version_courte(scenario: dict) -> list[Repere]:
    """Sous-titres de la version courte (aucun .srt fourni dans le kit) ; coupure
    à la virgule des phrases longues."""
    if sorted(t for _, _, t in VOIX_OFF_15S) != sorted(phrases(scenario["short15s"]["voiceover"])):
        sys.exit("VOIX_OFF_15S ne reprend plus les phrases de short15s.voiceover.")
    reperes = []
    for debut, fin, phrase in VOIX_OFF_15S:
        if len(phrase) > 40 and ", " in phrase:
            milieu = len(phrase) / 2
            coupe = min((m.end() for m in re.finditer(r", ", phrase)), key=lambda k: abs(k - milieu))
            lignes = [phrase[:coupe].rstrip(), phrase[coupe:]]
        else:
            lignes = [phrase]
        reperes.append(Repere(debut, fin, lignes))
    return reperes


# --------------------------------------------------------------------------- #
# Voix off et recalage des sous-titres
# --------------------------------------------------------------------------- #

def duree_media(chemin: Path) -> float:
    sortie = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(chemin)],
        check=True, capture_output=True, text=True).stdout
    return float(sortie.strip())


def plages_de_parole(voix: Path, duree: float) -> list[tuple[float, float]]:
    """Plages de parole déduites des silences (> 0,25 s sous -35 dB)."""
    journal = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(voix), "-af",
         "silencedetect=noise=-35dB:d=0.25", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    debuts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", journal)]
    fins = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", journal)]
    silences = list(zip(debuts, fins + [duree] * (len(debuts) - len(fins))))
    plages, curseur = [], 0.0
    for d, f in silences:
        if d > curseur + 0.05:
            plages.append((curseur, d))
        curseur = f
    if curseur < duree - 0.05:
        plages.append((curseur, duree))
    return plages or [(0.0, duree)]


def recaler_sous_titres(reperes: list[Repere], plages: list[tuple[float, float]], duree: int) -> list[Repere]:
    """Répartit les repères sur le temps de parole au prorata du nombre de
    caractères, puis cale chaque frontière sur le silence le plus proche."""
    poids = [len(" ".join(r.lignes)) for r in reperes]
    total_parole = sum(f - d for d, f in plages)

    def temps_reel(t_parole: float) -> float:
        for d, f in plages:
            if t_parole <= f - d:
                return d + t_parole
            t_parole -= f - d
        return plages[-1][1]

    cumul, frontieres = 0, []
    for p in poids[:-1]:
        cumul += p
        cible = temps_reel(total_parole * cumul / sum(poids))
        silences = [(plages[i][1] + plages[i + 1][0]) / 2 for i in range(len(plages) - 1)]
        proche = min(silences, key=lambda s: abs(s - cible), default=cible)
        frontieres.append(proche if abs(proche - cible) <= 0.8 else cible)
    debut_parole, fin_parole = plages[0][0], plages[-1][1]
    bornes = [max(0.0, debut_parole - 0.1)] + sorted(frontieres) + [min(duree, fin_parole + 0.4)]
    recales = []
    for i, r in enumerate(reperes):
        debut, fin = bornes[i], max(bornes[i + 1], bornes[i] + 0.8)
        recales.append(Repere(round(debut, 3), round(min(fin, duree), 3), r.lignes))
    return recales


# --------------------------------------------------------------------------- #
# Éléments graphiques (titres, logo, sous-titres)
# --------------------------------------------------------------------------- #

def police(nom: str, taille: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(POLICES[nom]), taille)


def logo(svg: Path, cote: int) -> Image.Image:
    import cairosvg  # rendu fidèle du SVG officiel

    png = cairosvg.svg2png(url=str(svg), output_width=cote, output_height=cote)
    return Image.open(BytesIO(png)).convert("RGBA")


def couper_lignes(texte: str, fonte: ImageFont.FreeTypeFont, largeur: int) -> list[str]:
    lignes = []
    for paragraphe in texte.split("\n"):
        courante = ""
        for mot in paragraphe.split():
            essai = f"{courante} {mot}".strip()
            if courante and fonte.getlength(essai) > largeur:
                lignes.append(courante)
                courante = mot
            else:
                courante = essai
        lignes.append(courante)
    return lignes


def equilibrer(texte: str, fonte: ImageFont.FreeTypeFont, largeur: int) -> list[str]:
    """Deux lignes de longueurs proches si possible, sinon coupure classique."""
    mots = texte.split()
    coupes = [(" ".join(mots[:i]), " ".join(mots[i:])) for i in range(1, len(mots))]
    meilleure = min(coupes, key=lambda c: max(fonte.getlength(c[0]), fonte.getlength(c[1])), default=None)
    if meilleure and max(fonte.getlength(l) for l in meilleure) <= largeur:
        return list(meilleure)
    return couper_lignes(texte, fonte, largeur)


def ombre(img: Image.Image, rayon: int, opacite: float, decalage: int) -> tuple[Image.Image, int]:
    """Ajoute une ombre portée douce sous un calque RGBA (marges incluses)."""
    marge = rayon * 2 + decalage
    fond = Image.new("RGBA", (img.width + 2 * marge, img.height + 2 * marge), (0, 0, 0, 0))
    masque = img.getchannel("A").point(lambda a: int(a * opacite))
    noir = Image.new("RGBA", img.size, (12, 20, 16, 255))
    noir.putalpha(masque)
    fond.alpha_composite(noir, (marge, marge + decalage))
    fond = fond.filter(ImageFilter.GaussianBlur(rayon))
    fond.alpha_composite(img, (marge, marge))
    return fond, marge


def carte_titre(texte: str, logo_img: Image.Image) -> tuple[Image.Image, int]:
    """Bandeau vert forêt : logo officiel + titre du plan, aligné à gauche."""
    fonte = police("titre", 60)
    pad, ecart = 30, 26
    largeur_max = W - SURE_GAUCHE - SURE_DROITE - 2 * pad - logo_img.width - ecart
    lignes = [texte] if fonte.getlength(texte) <= largeur_max else equilibrer(texte, fonte, largeur_max)
    interligne = 70
    asc, desc = fonte.getmetrics()
    h_texte = interligne * (len(lignes) - 1) + asc + desc
    largeur_texte = max(int(fonte.getlength(l)) for l in lignes)
    lw = pad * 2 + logo_img.width + ecart + largeur_texte
    lh = pad * 2 + max(logo_img.height, h_texte)
    carte = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    d = ImageDraw.Draw(carte)
    d.rounded_rectangle((0, 0, lw - 1, lh - 1), radius=30, fill=VERT_FORET + (238,))
    carte.alpha_composite(logo_img, (pad, (lh - logo_img.height) // 2))
    y = (lh - h_texte) // 2
    for ligne in lignes:
        d.text((pad + logo_img.width + ecart, y), ligne, font=fonte, fill=CREME)
        y += interligne
    return ombre(carte, 14, 0.35, 6)


def signature(plan: dict, svg: Path) -> list[tuple[Image.Image, int, float]]:
    """Éléments de la signature finale : (calque, y du haut, délai d'apparition)."""
    lignes = plan["title"].split("\n")
    titre, accroche, appel = lignes[0], lignes[1], lignes[2]
    elements = []
    elements.append((logo(svg, 190), 236, 0.15))
    f = police("titre_fort", 98)
    calque = Image.new("RGBA", (int(f.getlength(titre)) + 8, 130), (0, 0, 0, 0))
    ImageDraw.Draw(calque).text((4, 0), titre, font=f, fill=VERT_FORET)
    elements.append((calque, 440, 0.45))
    f = police("texte", 50)
    calque = Image.new("RGBA", (int(f.getlength(accroche)) + 8, 70), (0, 0, 0, 0))
    ImageDraw.Draw(calque).text((4, 0), accroche, font=f, fill=INDIGO)
    elements.append((calque, 562, 0.75))
    f = police("texte_fort", 40)
    pad_x, hauteur = 40, 74
    largeur = int(f.getlength(appel)) + 2 * pad_x
    calque = Image.new("RGBA", (largeur, hauteur), (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)
    d.rounded_rectangle((0, 0, largeur - 1, hauteur - 1), radius=hauteur // 2, fill=TERRE_CUITE + (255,))
    d.text((largeur / 2, hauteur / 2), appel, font=f, fill=CREME, anchor="mm")
    elements.append((calque, 650, 1.1))
    return elements


def bloc_sous_titre(lignes: list[str]) -> Image.Image:
    """Sous-titre blanc sur cartouche sombre translucide, centré dans la zone sûre."""
    fonte = police("texte_fort", 44)
    pad_x, pad_y, interligne = 26, 18, 58
    largeur_max = W - SOUS_TITRE_GAUCHE - SOUS_TITRE_DROITE - 2 * pad_x
    if any(fonte.getlength(l) > largeur_max for l in lignes):
        lignes = equilibrer(" ".join(lignes), fonte, largeur_max)
    asc, desc = fonte.getmetrics()
    lw = max(int(fonte.getlength(l)) for l in lignes) + 2 * pad_x
    lh = interligne * (len(lignes) - 1) + asc + desc + 2 * pad_y
    bloc = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    d = ImageDraw.Draw(bloc)
    d.rounded_rectangle((0, 0, lw - 1, lh - 1), radius=22, fill=(16, 24, 20, 178))
    y = pad_y
    for ligne in lignes:
        d.text((lw / 2, y), ligne, font=fonte, fill=(255, 255, 255), anchor="ma")
        y += interligne
    return bloc


# --------------------------------------------------------------------------- #
# Rendu image par image
# --------------------------------------------------------------------------- #

def lisser(x: float) -> float:
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def cadre(source: Image.Image, plan_id: int, progression: float) -> Image.Image:
    """Zoom et panoramique à échelle uniforme ; la fenêtre reste dans l'image."""
    m = MOUVEMENTS[plan_id]
    p = progression  # linéaire, prolongé légèrement pendant les fondus
    z = m["zoom"][0] + (m["zoom"][1] - m["zoom"][0]) * p
    (cx0, cy0), (cx1, cy1) = m["centre"]
    cx, cy = cx0 + (cx1 - cx0) * p, cy0 + (cy1 - cy0) * p
    sw, sh = source.size
    echelle = max(W / sw, H / sh) * z
    fen_w, fen_h = W / echelle, H / echelle
    x0 = min(max(cx * sw - fen_w / 2, 0.0), sw - fen_w)
    y0 = min(max(cy * sh - fen_h / 2, 0.0), sh - fen_h)
    return source.transform((W, H), Image.Transform.AFFINE,
                            (1 / echelle, 0, x0, 0, 1 / echelle, y0),
                            resample=Image.Resampling.BICUBIC)


def coller(fond: Image.Image, calque: Image.Image, xy: tuple[int, int], opacite: float) -> None:
    if opacite <= 0:
        return
    if opacite < 1:
        calque = calque.copy()
        calque.putalpha(calque.getchannel("A").point(lambda a: int(a * opacite)))
    fond.alpha_composite(calque, (int(xy[0]), int(xy[1])))


def rendre(kit: Path, plans: list[dict], reperes: list[Repere], duree_totale: int,
           encodeur: subprocess.Popen) -> None:
    sources = {p["id"]: Image.open(kit / p["image"]).convert("RGB") for p in plans}
    svg = kit / "Logo_DigiSante_Officiel.svg"
    petit_logo = logo(svg, 104)
    titres = {p["id"]: carte_titre(p["title"], petit_logo) for p in plans[:-1]}
    final = signature(plans[-1], svg)
    blocs = [bloc_sous_titre(r.lignes) for r in reperes]

    def image_plan(index: int, t: float) -> Image.Image:
        p = plans[index]
        return cadre(sources[p["id"]], p["id"], (t - p["start"]) / p["duree_mouvement"])

    for n in range(duree_totale * FPS):
        t = n / FPS
        i = next(k for k, p in enumerate(plans) if p["start"] <= t < p["end"])
        image = image_plan(i, t)
        # Fondu enchaîné centré sur la frontière la plus proche, si prévu.
        for frontiere, duree in TRANSITIONS[duree_totale].items():
            if duree and abs(t - frontiere) < duree / 2:
                j = i - 1 if t >= frontiere else i + 1
                autre = image_plan(j, t)
                a = (t - (frontiere - duree / 2)) / duree  # 0 -> plan précédent, 1 -> suivant
                avant, apres = (image, autre) if t < frontiere else (autre, image)
                image = Image.blend(avant, apres, lisser(a))
        image = image.convert("RGBA")

        plan = plans[i]
        if plan is not plans[-1]:
            (calque, marge) = titres[plan["id"]]
            entree = lisser((t - plan["start"] - 0.35) / 0.5)
            sortie = 1 - lisser((t - (plan["end"] - 0.55)) / 0.4)
            glisse = (1 - entree) * 24
            coller(image, calque, (SURE_GAUCHE - marge, SURE_HAUT - marge + glisse), min(entree, sortie))
        else:
            for calque, y, delai in final:
                entree = lisser((t - plan["start"] - delai) / 0.6)
                coller(image, calque, ((W - calque.width) // 2, y + (1 - entree) * 20), entree)

        for r, bloc in zip(reperes, blocs):
            if r.debut <= t < r.fin:
                opacite = min(lisser((t - r.debut) / 0.12), lisser((r.fin - t) / 0.12))
                x = SOUS_TITRE_GAUCHE + (W - SOUS_TITRE_GAUCHE - SOUS_TITRE_DROITE - bloc.width) // 2
                coller(image, bloc, (x, SOUS_TITRE_BAS - bloc.height), opacite)

        encodeur.stdin.write(image.convert("RGB").tobytes())
        if n % FPS == 0:
            print(f"\r  rendu {t:4.0f} s / {duree_totale} s", end="", flush=True)
    print()


# --------------------------------------------------------------------------- #
# Encodage et vérification
# --------------------------------------------------------------------------- #

def commande_ffmpeg(sortie: Path, duree: int, voix: Path | None, musique: Path | None) -> list[str]:
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    audio = []
    if voix:
        cmd += ["-i", str(voix)]
        audio.append(f"[{len(audio) + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,"
                     "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[voix]")
    if musique:
        cmd += ["-i", str(musique)]
        audio.append(f"[{len(audio) + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,"
                     f"volume={0.12 if voix else 0.5},afade=t=in:d=1,"
                     f"afade=t=out:st={duree - 2}:d=2[musique]")
    filtres = ["[0:v]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]"]
    if audio:
        etiquettes = "".join(f"[{n}]" for n in (["voix"] if voix else []) + (["musique"] if musique else []))
        filtres += audio
        filtres.append(f"{etiquettes}amix=inputs={len(audio)}:normalize=0,"
                       f"apad,atrim=0:{duree},asetpts=N/SR/TB[a]")
    cmd += ["-filter_complex", ";".join(filtres), "-map", "[v]"]
    if audio:
        cmd += ["-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
    cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high",
            "-level:v", "4.1", "-g", str(FPS * 2), "-bf", "2",
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
            "-color_range", "tv", "-frames:v", str(duree * FPS), "-t", str(duree),
            "-movflags", "+faststart", "-metadata", "title=DigiSanté Mobile — Votre santé, plus proche de vous.",
            str(sortie)]
    return cmd


def verifier_sortie(sortie: Path, duree: int, avec_audio: bool) -> dict:
    sonde = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-count_frames", "-show_entries",
         "format=duration,format_name:stream=codec_type,codec_name,profile,width,height,"
         "r_frame_rate,pix_fmt,duration,nb_read_frames,sample_rate,channels",
         "-of", "json", str(sortie)], check=True, capture_output=True, text=True).stdout)
    video = next(s for s in sonde["streams"] if s["codec_type"] == "video")
    controles = {
        "codec H.264": video["codec_name"] == "h264",
        "1080 × 1920": (video["width"], video["height"]) == (W, H),
        "30 i/s": video["r_frame_rate"] == f"{FPS}/1",
        "yuv420p": video["pix_fmt"] == "yuv420p",
        f"{duree * FPS} images": int(video["nb_read_frames"]) == duree * FPS,
        f"durée vidéo {duree},000 s": abs(float(video["duration"]) - duree) < 0.001,
        f"durée totale {duree} s": abs(float(sonde["format"]["duration"]) - duree) < 0.03,
        "piste audio": avec_audio == any(s["codec_type"] == "audio" for s in sonde["streams"]),
    }
    print(json.dumps(sonde, indent=2, ensure_ascii=False))
    for nom, ok in controles.items():
        print(f"  [{'OK' if ok else 'ÉCHEC'}] {nom}")
    if not all(controles.values()):
        sys.exit("La vérification ffprobe a échoué.")
    return sonde


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--kit", required=True, type=Path, help="dossier du kit ou archive .zip")
    parser.add_argument("--version", type=int, choices=(45, 15), default=45,
                        help="45 : film complet ; 15 : version courte (short15s)")
    parser.add_argument("--sortie", type=Path, default=Path("sortie"), help="dossier de sortie")
    parser.add_argument("--musique", type=Path, help="fichier musical dont la licence est acquise")
    parser.add_argument("--licence-musique", help="référence de la licence (obligatoire avec --musique)")
    args = parser.parse_args()

    for outil in ("ffmpeg", "ffprobe"):
        if not shutil.which(outil):
            sys.exit(f"{outil} est introuvable dans le PATH.")
    if args.musique and not args.licence_musique:
        sys.exit("Musique refusée : indiquez --licence-musique (fichier autorisé uniquement).")

    with tempfile.TemporaryDirectory() as tmp:
        kit = preparer_kit(args.kit.resolve(), Path(tmp))
        sortie_dir = args.sortie.resolve()
        if sortie_dir == kit or kit in sortie_dir.parents:
            sys.exit("Le dossier de sortie doit être hors du kit (fichiers sources préservés).")
        sortie_dir.mkdir(parents=True, exist_ok=True)

        manifeste = json.loads((kit / "manifest.json").read_text(encoding="utf-8"))
        verifier_empreintes(kit, manifeste)
        scenario = json.loads((kit / "scenario.json").read_text(encoding="utf-8"))
        duree = args.version
        plans = verifier_scenario(scenario, duree)
        if duree == 45:
            reperes = lire_srt(kit / "Sous_titres_45s.srt")
            noms_voix = ("voix_off.wav", "voix_off.mp3")
        else:
            reperes = reperes_version_courte(scenario)
            noms_voix = ("voix_off_15s.wav", "voix_off_15s.mp3")

        voix = next((kit / n for n in noms_voix if (kit / n).is_file()), None)
        if voix:
            duree_voix = duree_media(voix)
            if duree_voix > duree:
                sys.exit(f"Voix off trop longue ({duree_voix:.2f} s > {duree} s) : réenregistrer.")
            reperes = recaler_sous_titres(reperes, plages_de_parole(voix, duree_voix), duree)
            print(f"Voix off intégrée : {voix.name} ({duree_voix:.2f} s), sous-titres recalés.")
        else:
            print(f"Aucune voix off ({' / '.join(noms_voix)}) : prévisualisation muette.")
        if args.musique:
            print(f"Musique : {args.musique.name} — licence : {args.licence_musique}")

        mp4 = sortie_dir / f"DigiSante_promo_{duree}s.mp4"
        ecrire_srt(reperes, mp4.with_suffix(".srt"))
        encodeur = subprocess.Popen(commande_ffmpeg(mp4, duree, voix, args.musique), stdin=subprocess.PIPE)
        try:
            rendre(kit, plans, reperes, duree, encodeur)
        finally:
            encodeur.stdin.close()
        if encodeur.wait() != 0:
            sys.exit("Échec de l'encodage FFmpeg.")

        verifier_sortie(mp4, duree, avec_audio=bool(voix or args.musique))
        verifier_empreintes(kit, manifeste)
        print(f"Kit intact (empreintes SHA-256 conformes). Vidéo : {mp4}")


if __name__ == "__main__":
    main()
