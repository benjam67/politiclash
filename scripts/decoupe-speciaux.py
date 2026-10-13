# Découpe la planche du coup spécial d'un personnage (fond vert, 2 colonnes x 2 lignes) en 3 poses
# de 1300 x 820 px : special1, special2, special3. La 4e case (pose d'attente) sert de repère d'échelle :
# elle est ramenée à la hauteur de raw/fighters/<identifiant>/idle.png, déjà découpée.
#
# Usage :
#   python3 scripts/decoupe-speciaux.py perso <planche.png> raw/fighters/<identifiant> <aperçu.jpg>
#   python3 scripts/decoupe-speciaux.py accessoire <planche.png> <case 1|2> raw/props/<nom>.png
#     (planche de 2 cases côte à côte : on ne garde que la case demandée)
# Dépendances : pillow, numpy, scipy. Même détourage que decoupe-planches.py.
import sys, os, numpy as np
from PIL import Image
from scipy import ndimage as ndi

W, H, FOOT = 1300, 820, 10
NAMES = ["special1", "special2", "special3", "_idle"]


def key(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b)
    alpha = np.clip((70 - d) / 50, 0, 1)
    g2 = np.where(d > 0, np.maximum(r, b), g)
    return np.dstack([r, g2, b, alpha * 255]).astype(np.uint8)


def blobs(rgba, cols, rows, min_area=20000):
    """Le plus gros morceau de chaque case (les petites taches, paillettes comprises, restent attachées au perso si elles le touchent)."""
    m = rgba[..., 3] > 128
    lab, n = ndi.label(ndi.binary_dilation(m, iterations=12))
    hh, ww = m.shape
    out = {}
    for i, s in enumerate(ndi.find_objects(lab)):
        mm = m[s] & (lab[s] == i + 1)
        area = mm.sum()
        if area < min_area:
            continue
        cy, cx = ndi.center_of_mass(mm)
        cy += s[0].start
        cx += s[1].start
        cell = int(cy // (hh / rows)) * cols + int(cx // (ww / cols))
        crop = rgba[s].copy()
        crop[..., 3] = np.where(lab[s] == i + 1, crop[..., 3], 0)
        ys, xs = np.nonzero(crop[..., 3] > 128)
        crop = crop[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
        # Ancrage horizontal : le milieu des pieds (bas de la silhouette), plus stable que le centre de masse
        # pour des poses aux bras écartés ou penchées.
        feet = crop[-max(8, crop.shape[0] // 25) :, :, 3] > 128
        fx = np.nonzero(feet.any(axis=0))[0]
        foot_x = (fx.min() + fx.max()) / 2
        out.setdefault(cell, []).append((area, crop, foot_x))
    return {c: max(v, key=lambda t: t[0])[1:] for c, v in out.items()}


def alpha_height(path):
    a = np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 128
    ys = np.nonzero(a.any(axis=1))[0]
    return ys.max() - ys.min() + 1


def idle_feet_x(path):
    a = np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 128
    ys = np.nonzero(a.any(axis=1))[0]
    band = a[ys.max() - max(8, (ys.max() - ys.min()) // 25) : ys.max() + 1]
    xs = np.nonzero(band.any(axis=0))[0]
    return (xs.min() + xs.max()) / 2


def perso(sheet, out, check):
    cells = blobs(key(sheet), 2, 2)
    miss = [NAMES[i] for i in range(4) if i not in cells]
    if miss:
        sys.exit(f"MANQUE {miss}")
    idle = os.path.join(out, "idle.png")
    ref = alpha_height(idle)
    k = ref / cells[3][0].shape[0]
    # Dans idle.png, les pieds ne sont pas forcément au centre de l'image : on reprend le même décalage.
    shift = idle_feet_x(idle) - W / 2
    print(os.path.basename(out), "repère", cells[3][0].shape[0], "->", ref, "échelle", round(k, 3))
    for i, name in enumerate(NAMES[:3]):
        c, fx = cells[i]
        im = Image.fromarray(c).resize((round(c.shape[1] * k), round(c.shape[0] * k)), Image.LANCZOS)
        w, h = im.size
        x = round(W / 2 + shift - fx * k)
        x = max(0, min(W - w, x))
        y = H - FOOT - h
        if y < 0 or w > W:
            print("TROP GRAND", name, w, h)
        cv = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        cv.alpha_composite(im, (x, max(0, y)))
        cv.save(os.path.join(out, name + ".png"))
    names = ["idle", "special1", "special2", "special3"]
    sheet_img = Image.new("RGB", (4 * 325, 205), (70, 70, 80))
    for i, n in enumerate(names):
        im = Image.open(os.path.join(out, n + ".png")).resize((325, 205))
        bg = Image.new("RGBA", (325, 205), (200, 120, 160, 255) if i % 2 else (120, 160, 200, 255))
        bg.alpha_composite(im)
        sheet_img.paste(bg.convert("RGB"), (i * 325, 0))
    sheet_img.save(check, quality=85)


def accessoire(sheet, case, out):
    cells = blobs(key(sheet), 2, 1, min_area=5000)
    c, _ = cells[int(case) - 1]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    Image.fromarray(c).save(out)
    print(out, c.shape[1], "x", c.shape[0])


if sys.argv[1] == "perso":
    perso(*sys.argv[2:5])
elif sys.argv[1] == "accessoire":
    accessoire(*sys.argv[2:5])
else:
    sys.exit(__doc__)
