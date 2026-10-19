#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Montage reproductible de la vidéo promotionnelle « DigiSanté Mobile »
(vertical 1080 × 1920, 30 images/s, H.264 + AAC, durée exacte 45 s).

Commande :
    python3 promo/digisante-mobile/montage.py            # montage complet
    python3 promo/digisante-mobile/montage.py --rapide   # brouillon rapide (qualité réduite)
    python3 promo/digisante-mobile/montage.py --verifier # ffprobe seul sur la sortie existante

Entrées (dans ce dossier, jamais modifiées) :
    scenario.json            plans, titres, voix off, mouvements, visuels
    Sous_titres_45s.srt      sous-titres français
    images/, captures/       photos et captures réelles de l'application (optionnelles)
    logo.png                 logo officiel (sinon logo_secours du scénario)
    voix_off.wav|mp3         voix off (optionnelle) → intégrée, sous-titres recalés
    musique.*                musique (utilisée seulement si musique.autorisation.txt existe)

Sorties :
    DigiSante_promo_45s.mp4  vidéo finale
    DigiSante_promo_45s.srt  sous-titres (recalés sur la voix off si présente)
    apercu_plans.jpg         une image au milieu de chaque plan
    rapport_verification.txt résultat ffprobe et contrôles
    voix_off_a_enregistrer.txt   texte à enregistrer, si aucune voix off n'est fournie
    work/                    fichiers intermédiaires (ignoré par git)

Prérequis : Python 3.9+, Pillow, FFmpeg ≥ 4.4 avec libx264, libfreetype et libass.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent
WORK = ICI / "work"
S = 2  # suréchantillonnage des plaques (2160 × 3840) pour des zooms sans tremblement

# Polices : premier fichier existant par rôle, puis fc-match, puis DejaVu.
CANDIDATS_POLICES = {
    "titre": [
        "/usr/share/fonts/opentype/inter/Inter-Bold.otf",
        "/usr/share/fonts/truetype/inter/Inter-Bold.ttf",
        "/usr/local/share/fonts/Inter-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ],
    "texte": [
        "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf",
        "/usr/share/fonts/truetype/inter/Inter-SemiBold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ],
    "legende": [
        "/usr/share/fonts/opentype/inter/Inter-Medium.otf",
        "/usr/share/fonts/truetype/inter/Inter-Medium.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ],
}


# ----------------------------------------------------------------------------- utilitaires
def info(msg: str) -> None:
    print(f"· {msg}", flush=True)


def avert(msg: str) -> None:
    print(f"ATTENTION : {msg}", flush=True)


def erreur(msg: str) -> None:
    print(f"ERREUR : {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def executer(cmd: list, *, tolerer_echec: bool = False) -> subprocess.CompletedProcess:
    cmd = [str(c) for c in cmd]
    r = subprocess.run(cmd, cwd=ICI, text=True, capture_output=True)
    if r.returncode != 0 and not tolerer_echec:
        print(r.stderr[-6000:], file=sys.stderr)
        erreur("commande échouée : " + " ".join(cmd[:4]) + " …")
    return r


def hex_rgb(h: str) -> tuple:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def chemin_relatif(p: Path) -> str:
    try:
        return str(p.resolve().relative_to(ICI))
    except ValueError:
        return str(p.resolve())


def resoudre_fichier(rel) -> Path | None:
    if not rel:
        return None
    p = (ICI / rel).resolve()
    return p if p.is_file() else None


def duree_media(p: Path) -> float:
    r = executer(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                  "-of", "default=noprint_wrappers=1:nokey=1", p])
    return float(r.stdout.strip() or 0)


def fmt_srt(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def fmt_ass(t: float) -> str:
    cs = int(round(t * 100))
    h, cs = divmod(cs, 360_000)
    m, cs = divmod(cs, 6_000)
    s, cs = divmod(cs, 100)
    return f"{h:d}:{m:02d}:{s:02d}.{cs:02d}"


# ----------------------------------------------------------------------------- prérequis
def verifier_outils() -> None:
    for outil in ("ffmpeg", "ffprobe"):
        if not shutil.which(outil):
            erreur(f"{outil} introuvable dans le PATH. Installer FFmpeg (≥ 4.4) avec libx264, libfreetype et libass.")
    version = executer(["ffmpeg", "-version"]).stdout.splitlines()[0]
    info(f"FFmpeg détecté : {version}")
    filtres = executer(["ffmpeg", "-hide_banner", "-filters"]).stdout
    manquants = [f for f in ("zoompan", "drawtext", "ass", "overlay", "concat", "tile") if f" {f} " not in filtres]
    if manquants:
        erreur("filtres FFmpeg manquants : " + ", ".join(manquants) + " (compiler avec --enable-libfreetype --enable-libass).")
    encodeurs = executer(["ffmpeg", "-hide_banner", "-encoders"]).stdout
    if " libx264 " not in encodeurs:
        erreur("encodeur libx264 absent de cette version de FFmpeg.")
    try:
        import PIL  # noqa: F401
    except ImportError:
        erreur("Pillow est requis pour composer les plaques : pip install pillow")


def trouver_police(role: str) -> Path:
    for c in CANDIDATS_POLICES[role]:
        if Path(c).is_file():
            return Path(c)
    if shutil.which("fc-match"):
        motif = {"titre": "Inter:bold", "texte": "Inter:semibold", "legende": "Inter:medium"}[role]
        r = executer(["fc-match", "-f", "%{file}", motif], tolerer_echec=True)
        if r.returncode == 0 and r.stdout.strip() and Path(r.stdout.strip()).is_file():
            return Path(r.stdout.strip())
    erreur(f"aucune police trouvée pour le rôle « {role} » ; installer Inter ou DejaVu Sans.")


def nom_famille(police: Path) -> str:
    from PIL import ImageFont
    try:
        return ImageFont.truetype(str(police), 20).getname()[0]
    except Exception:  # pragma: no cover - dépend des polices installées
        return police.stem


# ----------------------------------------------------------------------------- scénario
def charger_scenario(chemin: Path) -> dict:
    if not chemin.is_file():
        erreur(f"scénario introuvable : {chemin}")
    with open(chemin, encoding="utf-8") as f:
        sc = json.load(f)
    sortie = sc.setdefault("sortie", {})
    sortie.setdefault("fichier", "DigiSante_promo_45s.mp4")
    sortie.setdefault("largeur", 1080)
    sortie.setdefault("hauteur", 1920)
    sortie.setdefault("fps", 30)
    sortie.setdefault("duree_s", 45)
    plans = sorted(sc.get("plans", []), key=lambda p: float(p["debut_s"]))
    if not plans:
        erreur("le scénario ne contient aucun plan.")
    attendu = 0.0
    for p in plans:
        d, f = float(p["debut_s"]), float(p["fin_s"])
        if abs(d - attendu) > 1e-6:
            erreur(f"plan {p.get('numero')} : début {d} s, attendu {attendu} s (les plans doivent se suivre sans trou).")
        if f <= d:
            erreur(f"plan {p.get('numero')} : fin {f} s ≤ début {d} s.")
        attendu = f
    if abs(attendu - float(sortie["duree_s"])) > 1e-6:
        erreur(f"la somme des plans fait {attendu} s, le scénario annonce {sortie['duree_s']} s.")
    sc["plans"] = plans
    info("Plans : " + " / ".join(f"{int(p['debut_s'])}–{int(p['fin_s'])}" for p in plans) + " s")
    return sc


def resoudre_logo(sc: dict) -> Path:
    marque = sc.get("marque", {})
    logo = resoudre_fichier(marque.get("logo"))
    if logo:
        info(f"Logo : {chemin_relatif(logo)}")
        return logo
    secours = resoudre_fichier(marque.get("logo_secours"))
    if secours:
        avert(f"{marque.get('logo')} absent : logo de secours {chemin_relatif(secours)} utilisé.")
        return secours
    erreur("aucun logo disponible (marque.logo / marque.logo_secours).")


# ----------------------------------------------------------------------------- sous-titres
def lire_srt(chemin: Path) -> list[dict]:
    texte = chemin.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
    motif = re.compile(r"(\d+):(\d\d):(\d\d)[,.](\d{1,3})")

    def t(m):
        return int(m[0]) * 3600 + int(m[1]) * 60 + int(m[2]) + int(m[3].ljust(3, "0")) / 1000

    cues = []
    for bloc in re.split(r"\n\s*\n", texte.strip()):
        lignes = [l for l in bloc.split("\n") if l.strip() != ""]
        if len(lignes) < 2:
            continue
        idx = next((i for i, l in enumerate(lignes) if "-->" in l), None)
        if idx is None:
            continue
        temps = motif.findall(lignes[idx])
        if len(temps) < 2:
            continue
        contenu = [l.strip() for l in lignes[idx + 1:]]
        if contenu:
            cues.append({"debut": t(temps[0]), "fin": t(temps[1]), "lignes": contenu})
    if not cues:
        erreur(f"aucun sous-titre lisible dans {chemin.name}")
    return cues


def ecrire_srt(cues: list[dict], chemin: Path) -> None:
    blocs = []
    for i, c in enumerate(cues, 1):
        blocs.append(f"{i}\n{fmt_srt(c['debut'])} --> {fmt_srt(c['fin'])}\n" + "\n".join(c["lignes"]))
    chemin.write_text("\n\n".join(blocs) + "\n", encoding="utf-8")


def ecrire_ass(cues: list[dict], chemin: Path, sc: dict, police: Path) -> None:
    W, H = sc["sortie"]["largeur"], sc["sortie"]["hauteur"]
    st = sc.get("sous_titres", {})
    taille = int(st.get("police_taille_px", 50))
    mv, ml, mr = int(st.get("marge_bas_px", 470)), int(st.get("marge_gauche_px", 100)), int(st.get("marge_droite_px", 180))
    famille = nom_famille(police)
    entete = (
        "[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {W}\nPlayResY: {H}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, "
        "MarginL, MarginR, MarginV, Encoding\n"
        # Style : blanc gras, boîte noire à 55 % (BorderStyle 3, Outline = marge intérieure), ancré en bas-centre.
        f"Style: SousTitre,{famille},{taille},&H00FFFFFF,&H00FFFFFF,&H00000000,&H8C000000,-1,0,0,0,100,100,0,0,3,14,0,2,{ml},{mr},{mv},1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    lignes = []
    for c in cues:
        texte = "\\N".join(l.replace("{", "(").replace("}", ")") for l in c["lignes"])
        lignes.append(f"Dialogue: 0,{fmt_ass(c['debut'])},{fmt_ass(c['fin'])},SousTitre,,0,0,0,,{texte}")
    chemin.write_text(entete + "\n".join(lignes) + "\n", encoding="utf-8")


def detecter_parole(voix: Path, seuil_db: float = -35.0, silence_min: float = 0.30) -> list[tuple[float, float]]:
    """Segments de parole (début, fin) déduits de silencedetect."""
    r = executer(["ffmpeg", "-hide_banner", "-nostats", "-i", voix,
                  "-af", f"silencedetect=noise={seuil_db}dB:d={silence_min}", "-f", "null", "-"], tolerer_echec=True)
    total = duree_media(voix)
    debuts = [float(x) for x in re.findall(r"silence_start:\s*([\d.]+)", r.stderr)]
    fins = [float(x) for x in re.findall(r"silence_end:\s*([\d.]+)", r.stderr)]
    silences = list(zip(debuts, fins))
    if len(debuts) > len(fins):  # silence jusqu'à la fin du fichier
        silences.append((debuts[-1], total))
    segments, curseur = [], 0.0
    for d, f in silences:
        if d - curseur > 0.15:
            segments.append((curseur, d))
        curseur = f
    if total - curseur > 0.15:
        segments.append((curseur, total))
    return segments


def recaler_sous_titres(cues: list[dict], voix: Path, duree_video: float, mode: str) -> list[dict]:
    """Recale les sous-titres sur l'enregistrement : segment par segment si le nombre
    de segments de parole égale le nombre de sous-titres, sinon par mise à l'échelle linéaire
    entre la première et la dernière prise de parole."""
    if mode == "aucun":
        info("Recalage des sous-titres désactivé (audio.recalage_sous_titres = aucun).")
        return cues
    segments = detecter_parole(voix)
    duree_voix = duree_media(voix)
    if not segments:
        avert("aucune parole détectée dans la voix off : sous-titres conservés tels quels.")
        return cues
    if duree_voix > duree_video + 0.05:
        avert(f"la voix off dure {duree_voix:.2f} s > {duree_video:.0f} s : elle sera coupée en fondu à {duree_video:.0f} s.")
    nouveaux = [dict(c) for c in cues]
    if mode in ("auto", "segments") and len(segments) == len(cues):
        info(f"Recalage par segments : {len(segments)} prises de parole pour {len(cues)} sous-titres.")
        for c, (d, f) in zip(nouveaux, segments):
            c["debut"], c["fin"] = max(0.0, d - 0.05), f + 0.25
    else:
        if mode == "segments":
            avert(f"{len(segments)} segments de parole pour {len(cues)} sous-titres : repli sur le recalage linéaire.")
        src0, src1 = cues[0]["debut"], cues[-1]["fin"]
        dst0, dst1 = segments[0][0], segments[-1][1]
        k = (dst1 - dst0) / max(src1 - src0, 1e-6)
        info(f"Recalage linéaire : parole de {dst0:.2f} s à {dst1:.2f} s (facteur {k:.3f}).")
        for c in nouveaux:
            c["debut"] = dst0 + (c["debut"] - src0) * k
            c["fin"] = dst0 + (c["fin"] - src0) * k
    for i, c in enumerate(nouveaux):  # durée minimale, pas de chevauchement, bornes vidéo
        c["debut"] = min(max(c["debut"], 0.0), duree_video - 0.5)
        c["fin"] = min(max(c["fin"], c["debut"] + 0.8), duree_video)
        if i + 1 < len(nouveaux) and c["fin"] > nouveaux[i + 1]["debut"] - 0.08:
            c["fin"] = max(c["debut"] + 0.8, nouveaux[i + 1]["debut"] - 0.08)
    return nouveaux


# ----------------------------------------------------------------------------- plaques (Pillow)
def _degrade(taille, haut, bas):
    from PIL import Image
    w, h = taille
    colonne = Image.new("RGB", (1, h))
    px = colonne.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        px[0, y] = tuple(round(haut[i] * (1 - t) + bas[i] * t) for i in range(3))
    return colonne.resize((w, h))


def _cercles(img, couleur, graine):
    from PIL import Image, ImageDraw
    w, h = img.size
    calque = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)
    positions = [(0.85, 0.08, 0.42), (0.08, 0.78, 0.55), (0.95, 0.62, 0.30)]
    for i, (fx, fy, fr) in enumerate(positions):
        rr = int(w * fr * (1 + 0.1 * ((graine + i) % 3)))
        cx, cy = int(w * fx), int(h * fy)
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=couleur + (26,))
    return Image.alpha_composite(img.convert("RGBA"), calque).convert("RGB")


def _fond(sc, variante=0):
    c = sc["marque"]["couleurs"]
    W, H = sc["sortie"]["largeur"] * S, sc["sortie"]["hauteur"] * S
    if variante == 0:
        img = _degrade((W, H), hex_rgb(c["primaire"]), hex_rgb(c["primaire_fonce"]))
    else:
        img = _degrade((W, H), hex_rgb(c["fond_sombre"]), hex_rgb(c["primaire"]))
    return _cercles(img, hex_rgb(c["secondaire"]), variante)


def _couvrir(img, taille, fx=0.5, fy=0.5):
    """Redimensionne en conservant les proportions pour couvrir `taille`, puis recadre autour du point focal."""
    from PIL import Image
    W, H = taille
    k = max(W / img.width, H / img.height)
    nw, nh = math.ceil(img.width * k), math.ceil(img.height * k)
    r = img.resize((nw, nh), Image.LANCZOS)
    x0 = min(max(round(nw * fx - W / 2), 0), nw - W)
    y0 = min(max(round(nh * fy - H / 2), 0), nh - H)
    return r.crop((x0, y0, x0 + W, y0 + H))


def _ouvrir_image(p: Path):
    from PIL import Image, ImageOps
    return ImageOps.exif_transpose(Image.open(p)).convert("RGB")


def _coins_arrondis(img, rayon):
    from PIL import Image, ImageDraw
    masque = Image.new("L", img.size, 0)
    ImageDraw.Draw(masque).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=rayon, fill=255)
    out = img.convert("RGBA")
    out.putalpha(masque)
    return out


def _ombre(base, boite, rayon, flou, decalage, opacite=110):
    from PIL import Image, ImageDraw, ImageFilter
    calque = Image.new("RGBA", base.size, (0, 0, 0, 0))
    x0, y0, x1, y1 = boite
    ImageDraw.Draw(calque).rounded_rectangle((x0, y0 + decalage, x1, y1 + decalage), radius=rayon, fill=(0, 0, 0, opacite))
    calque = calque.filter(ImageFilter.GaussianBlur(flou))
    return Image.alpha_composite(base.convert("RGBA"), calque)


def _texte_discret(img, texte, police: Path, y_frac=0.885):
    from PIL import ImageDraw, ImageFont
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(str(police), 26 * S)
    d.text((48 * S, int(img.height * y_frac)), texte, font=f, fill=(255, 255, 255, 150))
    return img


def plaque_photo(plan, sc, polices):
    from PIL import Image, ImageEnhance, ImageFilter
    v = plan["visuel"]
    W, H = sc["sortie"]["largeur"] * S, sc["sortie"]["hauteur"] * S
    chemin = resoudre_fichier(v.get("fichier"))
    if chemin is None:
        secours = resoudre_fichier(v.get("secours"))
        if secours is None:
            avert(f"plan {plan['numero']} : {v.get('fichier')} absent, aucun secours → plaque de substitution.")
            return _texte_discret(_fond(sc, 0), f"Visuel à fournir : {v.get('fichier')}", polices["legende"])
        avert(f"plan {plan['numero']} : {v.get('fichier')} absent → image de secours {chemin_relatif(secours)}.")
        chemin = secours
    else:
        info(f"plan {plan['numero']} : photo {chemin_relatif(chemin)}")
    img = _ouvrir_image(chemin)
    fx, fy = v.get("point_focal", [0.5, 0.5])
    cadrage = v.get("cadrage", "auto")
    if cadrage == "auto":
        cadrage = "couvrir" if img.width / img.height <= 0.8 else "contenir"
    if cadrage == "couvrir":
        return _couvrir(img, (W, H), fx, fy)
    # « contenir » : la photo entière, non déformée, sur un fond flouté tiré de la même image.
    fond = _couvrir(img, (W, H), 0.5, 0.5).filter(ImageFilter.GaussianBlur(28 * S))
    fond = ImageEnhance.Brightness(fond).enhance(0.5)
    marge = 48 * S
    lw = W - 2 * marge
    lh = round(img.height * lw / img.width)
    if lh > H * 0.6:
        lh = round(H * 0.6)
        lw = round(img.width * lh / img.height)
    avant = _coins_arrondis(img.resize((lw, lh), Image.LANCZOS), 36 * S)
    x0, y0 = (W - lw) // 2, round(H * 0.5) - lh // 2
    fond = _ombre(fond, (x0, y0, x0 + lw, y0 + lh), 36 * S, 30 * S, 24 * S)
    fond.alpha_composite(avant, (x0, y0))
    return fond.convert("RGB")


def plaque_ecran_app(plan, sc, polices):
    from PIL import Image, ImageDraw
    v = plan["visuel"]
    W, H = sc["sortie"]["largeur"] * S, sc["sortie"]["hauteur"] * S
    fond = _fond(sc, 0)
    pw, ph, r = 480 * S, 1000 * S, 78 * S
    px, py = (W - pw) // 2, 600 * S
    fond = _ombre(fond, (px, py, px + pw, py + ph), r, 40 * S, 30 * S, 140)
    d = ImageDraw.Draw(fond)
    d.rounded_rectangle((px, py, px + pw, py + ph), radius=r, fill=(15, 23, 42, 255), outline=(94, 118, 150, 255), width=3 * S)
    marge = 16 * S
    ex0, ey0, ex1, ey1 = px + marge, py + marge, px + pw - marge, py + ph - marge
    d.rounded_rectangle((ex0, ey0, ex1, ey1), radius=r - marge, fill=(245, 248, 251, 255))
    capture = resoudre_fichier(v.get("capture"))
    if capture:
        info(f"plan {plan['numero']} : capture {chemin_relatif(capture)} insérée dans l'écran.")
        img = _couvrir(_ouvrir_image(capture), (ex1 - ex0, ey1 - ey0), 0.5, 0.0)
        fond.alpha_composite(_coins_arrondis(img, r - marge), (ex0, ey0))
    else:
        info(f"plan {plan['numero']} : aucune capture ({v.get('capture')}) → écran laissé vierge.")
    return fond.convert("RGB")


def plaque_logo(plan, sc, polices, logo: Path):
    from PIL import Image
    W, H = sc["sortie"]["largeur"] * S, sc["sortie"]["hauteur"] * S
    fond = _fond(sc, 1).convert("RGBA")
    img = Image.open(logo).convert("RGBA")
    cote = 540 * S
    k = min(cote / img.width, cote / img.height)
    img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    x0, y0 = (W - img.width) // 2, 660 * S - img.height // 2
    fond = _ombre(fond, (x0, y0, x0 + img.width, y0 + img.height), 60 * S, 40 * S, 24 * S, 120)
    fond.alpha_composite(img, (x0, y0))
    return fond.convert("RGB")


def construire_plaque(plan, sc, polices, logo: Path) -> Path:
    typ = plan.get("visuel", {}).get("type", "photo")
    if typ == "photo":
        img = plaque_photo(plan, sc, polices)
    elif typ == "ecran_app":
        img = plaque_ecran_app(plan, sc, polices)
    elif typ == "logo":
        img = plaque_logo(plan, sc, polices, logo)
    else:
        erreur(f"plan {plan['numero']} : type de visuel inconnu « {typ} » (photo, ecran_app, logo).")
    sortie = WORK / f"plaque_{plan['numero']}.png"
    img.save(sortie, optimize=False)
    return sortie


# ----------------------------------------------------------------------------- mouvements (zoompan)
PRESETS_MOUVEMENT = {
    # zoom_debut, zoom_fin, déplacement du point focal (dx, dy) en fraction de la marge disponible
    "fixe": (1.0, 1.0, 0.0, 0.0),
    "zoom_avant": (1.0, None, 0.0, 0.0),
    "zoom_arriere": (None, 1.0, 0.0, 0.0),
    "pan_gauche_droite": (None, None, 1.0, 0.0),
    "pan_droite_gauche": (None, None, -1.0, 0.0),
    "pan_haut_bas": (None, None, 0.0, 1.0),
    "pan_bas_haut": (None, None, 0.0, -1.0),
}


def filtre_zoompan(plan, sc, nb_images: int) -> str:
    mv = plan.get("mouvement", {}) or {}
    typ = mv.get("type", "zoom_avant")
    if typ not in PRESETS_MOUVEMENT:
        erreur(f"plan {plan['numero']} : mouvement inconnu « {typ} » ({', '.join(PRESETS_MOUVEMENT)}).")
    A = float(mv.get("amplitude", 0.08))
    zd, zf, dx, dy = PRESETS_MOUVEMENT[typ]
    zd = 1.0 + A if zd is None else zd
    zf = 1.0 + A if zf is None else zf
    fx, fy = plan.get("visuel", {}).get("point_focal", [0.5, 0.5])
    if typ.startswith("pan"):  # un panoramique part d'un bord et glisse vers l'autre
        fx = 0.0 if dx > 0 else (1.0 if dx < 0 else fx)
        fy = 0.0 if dy > 0 else (1.0 if dy < 0 else fy)
    # progression 0→1 adoucie (smoothstep) sur la durée du plan
    p = "(on/(duration-1))"
    pe = f"({p}*{p}*(3-2*{p}))"
    z = f"{zd}+({zf}-{zd})*{pe}"
    x = f"(iw-iw/zoom)*({fx}+({abs(dx)})*{pe})" if dx >= 0 else f"(iw-iw/zoom)*({fx}-({abs(dx)})*{pe})"
    y = f"(ih-ih/zoom)*({fy}+({abs(dy)})*{pe})" if dy >= 0 else f"(ih-ih/zoom)*({fy}-({abs(dy)})*{pe})"
    W, H, fps = sc["sortie"]["largeur"], sc["sortie"]["hauteur"], sc["sortie"]["fps"]
    return f"zoompan=z='{z}':x='{x}':y='{y}':d={nb_images}:s={W}x{H}:fps={fps}"


def rendre_segment(plan, sc, plaque: Path, rapide: bool) -> Path:
    fps = sc["sortie"]["fps"]
    nb = round((float(plan["fin_s"]) - float(plan["debut_s"])) * fps)
    sortie = WORK / f"segment_{plan['numero']}.mp4"
    preset, crf = ("veryfast", "26") if rapide else ("medium", "12")
    executer(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", plaque,
              "-vf", filtre_zoompan(plan, sc, nb) + ",format=yuv420p",
              "-frames:v", nb, "-r", fps, "-c:v", "libx264", "-preset", preset, "-crf", crf,
              "-pix_fmt", "yuv420p", sortie])
    info(f"plan {plan['numero']} : {nb} images ({plan['debut_s']}–{plan['fin_s']} s), mouvement {plan.get('mouvement', {}).get('type', 'zoom_avant')}")
    return sortie


# ----------------------------------------------------------------------------- titres (drawtext)
def _fichier_texte(nom: str, texte: str) -> str:
    p = WORK / "textes" / f"{nom}.txt"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(texte, encoding="utf-8")
    return chemin_relatif(p)


def _drawtext(police: Path, fichier: str, taille: int, y: int, debut: float, fin: float, couleur="white", **extra) -> str:
    fondu = 0.45
    opts = [
        f"fontfile={police}", f"textfile={fichier}", "expansion=none", f"fontsize={taille}", f"fontcolor={couleur}",
        "x=(w-text_w)/2", f"y={y}",
        f"alpha='min(1,min((t-{debut:.3f})/{fondu},({fin:.3f}-t)/{fondu}))'",
        f"enable='between(t,{debut:.3f},{fin:.3f})'",
    ]
    opts += [f"{k}={v}" for k, v in extra.items()]
    return "drawtext=" + ":".join(opts)


def filtres_titres(plan, sc, polices) -> list[str]:
    c = sc["marque"]["couleurs"]
    n = plan["numero"]
    debut, fin = float(plan["debut_s"]) + 0.25, float(plan["fin_s"]) - 0.15
    typ = plan.get("visuel", {}).get("type", "photo")
    mep = {"surtitre_y": 300, "titre_y": 350, "sous_titre_y": 1095, "cta_y": 1180, "titre_taille": 80}
    if typ == "logo":
        mep.update({"titre_y": 990, "titre_taille": 84})
    mep.update(plan.get("mise_en_page", {}))
    filtres = []
    if plan.get("surtitre"):
        filtres.append(_drawtext(polices["texte"], _fichier_texte(f"p{n}_surtitre", plan["surtitre"]), 34, mep["surtitre_y"],
                                 debut, fin, c["secondaire"], box=1, boxcolor="black@0.35", boxborderw=14))
    elif typ != "logo":
        mep["titre_y"] -= 30
    taille = int(mep["titre_taille"])
    for i, ligne in enumerate(str(plan.get("titre", "")).split("\n")):
        if not ligne.strip():
            continue
        filtres.append(_drawtext(polices["titre"], _fichier_texte(f"p{n}_titre_{i}", ligne), taille,
                                 mep["titre_y"] + i * round(taille * 1.18), debut + 0.1 * i, fin, "white",
                                 shadowcolor="black@0.45", shadowx=0, shadowy=4, borderw=2, bordercolor="black@0.2"))
    if plan.get("sous_titre"):
        filtres.append(_drawtext(polices["legende"], _fichier_texte(f"p{n}_sous_titre", plan["sous_titre"]), 50,
                                 mep["sous_titre_y"], debut + 0.3, fin, "white@0.92", shadowcolor="black@0.4", shadowy=3))
    if plan.get("cta"):
        filtres.append(_drawtext(polices["texte"], _fichier_texte(f"p{n}_cta", plan["cta"]), 42, mep["cta_y"],
                                 debut + 0.6, fin, c["fond_sombre"], box=1, boxcolor=c["secondaire"], boxborderw=22))
    return filtres


# ----------------------------------------------------------------------------- audio
def trouver_voix(sc: dict) -> Path | None:
    for nom in sc.get("audio", {}).get("voix_off", ["voix_off.wav", "voix_off.mp3"]):
        p = resoudre_fichier(nom)
        if p:
            return p
    return None


def trouver_musique(sc: dict) -> Path | None:
    audio = sc.get("audio", {})
    autorisation = resoudre_fichier(audio.get("musique_autorisation", "musique.autorisation.txt"))
    for nom in audio.get("musique", []):
        p = resoudre_fichier(nom)
        if p and autorisation and autorisation.read_text(encoding="utf-8", errors="ignore").strip():
            info(f"Musique autorisée : {p.name} (justificatif {autorisation.name}).")
            return p
        if p:
            avert(f"{p.name} présent mais sans {audio.get('musique_autorisation')} renseigné : musique ignorée.")
    return None


def ecrire_texte_voix_off(sc: dict, chemin: Path) -> None:
    lignes = [f"{sc['marque']['nom']} — texte de voix off à enregistrer (durée totale {sc['sortie']['duree_s']} s)", ""]
    total_mots = 0
    for p in sc["plans"]:
        texte = p.get("voix_off", "").strip()
        mots = len(texte.split())
        total_mots += mots
        d, f = float(p["debut_s"]), float(p["fin_s"])
        lignes += [f"Plan {p['numero']} ({d:g}–{f:g} s, {f - d:g} s, {mots} mots) — {p.get('nom', '')}", f"    {texte}", ""]
    lignes += [
        f"Total : {total_mots} mots pour {sc['sortie']['duree_s']} s (environ {60 * total_mots / float(sc['sortie']['duree_s']):.0f} mots/min).",
        "Chaque phrase doit tenir dans la fenêtre de son plan ; marquer une courte pause entre les plans.",
        "",
        "Enregistrement : WAV 48 kHz mono (ou MP3 ≥ 192 kb/s), pièce calme, micro à 15–20 cm, niveau de crête vers -6 dBFS.",
        f"Déposer le fichier sous le nom voix_off.wav (ou voix_off.mp3) dans {ICI.name}/ puis relancer :",
        "    python3 promo/digisante-mobile/montage.py",
        "Les sous-titres seront recalés automatiquement sur l'enregistrement.",
    ]
    chemin.write_text("\n".join(lignes) + "\n", encoding="utf-8")


# ----------------------------------------------------------------------------- assemblage final
def assembler(sc, segments, logo, polices, ass: Path | None, voix: Path | None, musique: Path | None,
              sortie: Path, rapide: bool) -> None:
    W, H, fps, duree = sc["sortie"]["largeur"], sc["sortie"]["hauteur"], sc["sortie"]["fps"], float(sc["sortie"]["duree_s"])
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-stats"]
    for s in segments:
        cmd += ["-i", s]
    cmd += ["-i", logo]
    idx_logo = len(segments)
    idx_voix = idx_musique = None
    if voix:
        cmd += ["-i", voix]
        idx_voix = idx_logo + 1
    if musique:
        cmd += ["-stream_loop", "-1", "-i", musique]
        idx_musique = idx_logo + (2 if voix else 1)

    plans = sc["plans"]
    fin_petit_logo = next((float(p["debut_s"]) for p in plans if p.get("visuel", {}).get("type") == "logo"), duree)
    chaine = ["".join(f"[{i}:v]" for i in range(len(segments))) + f"concat=n={len(segments)}:v=1:a=0[v0]",
              f"[{idx_logo}:v]scale=130:-1[logo]",
              f"[v0][logo]overlay=x=70:y=150:enable='lt(t,{fin_petit_logo:.3f})'[v1]"]
    titres = [f for p in plans for f in filtres_titres(p, sc, polices)]
    etape = "[v1]"
    if titres:
        chaine.append(etape + ",".join(titres) + "[v2]")
        etape = "[v2]"
    if ass:
        chaine.append(f"{etape}ass=filename={chemin_relatif(ass)}:fontsdir={polices['titre'].parent}[v3]")
        etape = "[v3]"
    chaine.append(f"{etape}format=yuv420p[vout]")

    # Audio : voix normalisée (+ musique en fond, atténuée sous la voix), sinon piste silencieuse.
    volume_musique = float(sc.get("audio", {}).get("volume_musique_db", -18))
    if voix:
        chaine.append(f"[{idx_voix}:a]aformat=sample_rates=48000:channel_layouts=stereo,"
                      f"loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st={duree - 1:.3f}:d=1,apad[va]")
        if musique:
            chaine += [f"[{idx_musique}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume={volume_musique}dB,"
                       f"afade=t=in:d=1,afade=t=out:st={duree - 3:.3f}:d=3[ma]",
                       "[va]asplit[va1][va2]",
                       "[ma][va2]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=500[md]",
                       "[md][va1]amix=inputs=2:duration=longest:normalize=0[aout]"]
        else:
            chaine.append("[va]acopy[aout]")
    elif musique:
        chaine.append(f"[{idx_musique}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume={volume_musique}dB,"
                      f"afade=t=in:d=1,afade=t=out:st={duree - 3:.3f}:d=3[aout]")
    else:
        chaine.append("anullsrc=r=48000:cl=stereo[aout]")

    preset, crf = ("veryfast", "26") if rapide else ("slow", "20")
    cmd += ["-filter_complex", ";".join(chaine), "-map", "[vout]", "-map", "[aout]",
            "-t", f"{duree:.3f}", "-r", fps,
            "-c:v", "libx264", "-preset", preset, "-crf", crf, "-profile:v", "high", "-level", "4.0",
            "-pix_fmt", "yuv420p", "-g", fps * 2, "-bf", "2",
            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart",
            "-metadata", f"title={sc['marque']['nom']} — vidéo promotionnelle {int(duree)} s",
            "-metadata", "language=fra", sortie]
    (WORK / "commande_ffmpeg_finale.txt").write_text(shlex.join(str(c) for c in cmd) + "\n", encoding="utf-8")
    executer(cmd)


def apercus(sc, sortie: Path) -> Path:
    fps = sc["sortie"]["fps"]
    milieux = [round(((float(p["debut_s"]) + float(p["fin_s"])) / 2) * fps) for p in sc["plans"]]
    sel = "+".join(f"eq(n,{m})" for m in milieux)
    dest = ICI / "apercu_plans.jpg"
    executer(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", sortie,
              "-vf", f"select='{sel}',scale=360:-1,tile={len(milieux)}x1:padding=6:margin=6:color=white",
              "-frames:v", 1, "-q:v", 3, dest])
    return dest


# ----------------------------------------------------------------------------- vérification ffprobe
def verifier(sc, sortie: Path, rapport: Path, voix: Path | None, musique: Path | None, ass_utilise: bool) -> bool:
    W, H, fps, duree = sc["sortie"]["largeur"], sc["sortie"]["hauteur"], sc["sortie"]["fps"], float(sc["sortie"]["duree_s"])
    if not sortie.is_file():
        erreur(f"sortie absente : {sortie}")
    cmd_v = ["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
             "stream=codec_name,profile,level,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_read_frames,duration",
             "-of", "json", sortie]
    cmd_f = ["ffprobe", "-v", "error", "-show_entries", "format=duration,size,bit_rate,format_name",
             "-show_entries", "stream=index,codec_type,codec_name,sample_rate,channels,duration", "-of", "json", sortie]
    v = json.loads(executer(cmd_v).stdout)["streams"][0]
    f = json.loads(executer(cmd_f).stdout)
    audios = [s for s in f["streams"] if s["codec_type"] == "audio"]
    images = int(v.get("nb_read_frames", 0))
    duree_video = float(v.get("duration", 0))
    duree_format = float(f["format"]["duration"])
    controles = [
        ("Codec vidéo H.264", v.get("codec_name") == "h264", v.get("codec_name")),
        ("Profil High, niveau 4.0", v.get("profile") == "High" and int(v.get("level", 0)) == 40, f"{v.get('profile')} / {v.get('level')}"),
        (f"Dimensions {W} × {H} (vertical)", int(v["width"]) == W and int(v["height"]) == H, f"{v['width']} × {v['height']}"),
        ("Sous-échantillonnage yuv420p (téléphones)", v.get("pix_fmt") == "yuv420p", v.get("pix_fmt")),
        (f"Cadence {fps} images/s", v.get("r_frame_rate") == f"{fps}/1" and v.get("avg_frame_rate") == f"{fps}/1", v.get("r_frame_rate")),
        (f"Nombre d'images = {int(duree * fps)}", images == int(duree * fps), str(images)),
        (f"Durée du flux vidéo = {duree:.3f} s", abs(duree_video - duree) < 1 / fps, f"{duree_video:.6f} s"),
        (f"Durée du conteneur ≈ {duree:.0f} s (tolérance une trame AAC)", duree - 0.001 <= duree_format <= duree + 0.03, f"{duree_format:.6f} s"),
        ("Piste audio AAC 48 kHz stéréo", bool(audios) and audios[0]["codec_name"] == "aac" and audios[0]["sample_rate"] == "48000" and int(audios[0]["channels"]) == 2,
         ", ".join(f"{a['codec_name']} {a['sample_rate']} Hz {a['channels']} ca." for a in audios) or "aucune"),
        ("Conteneur MP4 (faststart)", "mp4" in f["format"]["format_name"], f["format"]["format_name"]),
    ]
    ok = all(c[1] for c in controles)
    lignes = [f"Rapport de vérification — {sortie.name}", f"Taille : {int(f['format']['size']) / 1_048_576:.2f} Mio, débit {int(f['format'].get('bit_rate', 0)) / 1000:.0f} kb/s", ""]
    lignes += [f"[{'OK' if c[1] else 'KO'}] {c[0]} → {c[2]}" for c in controles]
    lignes += ["", f"Voix off : {voix.name if voix else 'aucune (prévisualisation muette, piste silencieuse)'}",
               f"Musique : {musique.name if musique else 'aucune'}",
               f"Sous-titres incrustés : {'oui' if ass_utilise else 'non'}", "",
               "Commandes ffprobe :", "  " + " ".join(str(c) for c in cmd_v), "  " + " ".join(str(c) for c in cmd_f)]
    rapport.write_text("\n".join(lignes) + "\n", encoding="utf-8")
    print("\n".join(lignes[3:3 + len(controles)]))
    return ok


# ----------------------------------------------------------------------------- programme principal
def main() -> None:
    ap = argparse.ArgumentParser(description="Montage reproductible de la vidéo promotionnelle DigiSanté Mobile.")
    ap.add_argument("--scenario", default="scenario.json", help="fichier de scénario (défaut : scenario.json)")
    ap.add_argument("--sortie", default=None, help="fichier MP4 de sortie (défaut : sortie.fichier du scénario)")
    ap.add_argument("--rapide", action="store_true", help="brouillon rapide : encodage veryfast, qualité réduite")
    ap.add_argument("--sans-sous-titres", action="store_true", help="ne pas incruster les sous-titres (le .srt est quand même exporté)")
    ap.add_argument("--verifier", action="store_true", help="vérifier seulement la sortie existante avec ffprobe")
    args = ap.parse_args()

    verifier_outils()
    sc = charger_scenario(ICI / args.scenario)
    sortie = ICI / (args.sortie or sc["sortie"]["fichier"])
    rapport = ICI / "rapport_verification.txt"
    voix, musique = trouver_voix(sc), trouver_musique(sc)

    if args.verifier:
        sys.exit(0 if verifier(sc, sortie, rapport, voix, musique, not args.sans_sous_titres) else 2)

    WORK.mkdir(exist_ok=True)
    polices = {role: trouver_police(role) for role in CANDIDATS_POLICES}
    info("Polices : " + ", ".join(f"{r} = {p.name}" for r, p in polices.items()))
    logo = resoudre_logo(sc)

    # 1. plaques fixes (Pillow) puis 2. segments animés (zoompan), un par plan
    segments = []
    for plan in sc["plans"]:
        plaque = construire_plaque(plan, sc, polices, logo)
        segments.append(rendre_segment(plan, sc, plaque, args.rapide))

    # 3. sous-titres : lecture, recalage éventuel sur la voix off, export SRT + ASS
    srt = resoudre_fichier(sc.get("sous_titres", {}).get("fichier", "Sous_titres_45s.srt"))
    if srt is None:
        erreur("fichier de sous-titres introuvable (sous_titres.fichier).")
    cues = lire_srt(srt)
    info(f"Sous-titres : {len(cues)} entrées lues dans {srt.name}")
    if voix:
        info(f"Voix off détectée : {voix.name} ({duree_media(voix):.2f} s)")
        cues = recaler_sous_titres(cues, voix, float(sc["sortie"]["duree_s"]), sc.get("audio", {}).get("recalage_sous_titres", "auto"))
    else:
        avert("aucune voix off (voix_off.wav / voix_off.mp3) : export d'une prévisualisation muette.")
        ecrire_texte_voix_off(sc, ICI / "voix_off_a_enregistrer.txt")
        info("Texte de voix off écrit dans voix_off_a_enregistrer.txt")
    srt_sortie = sortie.with_suffix(".srt")
    ecrire_srt(cues, srt_sortie)
    ass = None
    if not args.sans_sous_titres:
        ass = WORK / "sous_titres.ass"
        ecrire_ass(cues, ass, sc, polices["titre"])

    # 4. assemblage : concaténation, logo, titres, sous-titres, audio
    info("Assemblage final (concaténation, logo, titres, sous-titres, audio)…")
    assembler(sc, segments, logo, polices, ass, voix, musique, sortie, args.rapide)

    # 5. aperçus et vérification
    ap_img = apercus(sc, sortie)
    info(f"Aperçu des plans : {ap_img.name}")
    ok = verifier(sc, sortie, rapport, voix, musique, ass is not None)
    info(f"Rapport : {rapport.name}")
    if not ok:
        erreur("un ou plusieurs contrôles ffprobe ont échoué (voir rapport_verification.txt).")
    info(f"Terminé : {sortie.name} ({sortie.stat().st_size / 1_048_576:.2f} Mio) — sous-titres : {srt_sortie.name}")


if __name__ == "__main__":
    main()
