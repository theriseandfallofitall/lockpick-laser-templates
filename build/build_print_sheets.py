#!/usr/bin/env python3
"""A4 print sheets: every current outline at exactly 1:1 for an ordinary printer.

Print at 100 % / "Actual size" (never "Fit to page"), then measure the 100 mm scale bar on the sheet.
Cut the paper template out, glue it to the steel (or blade) and file / grind to the line.
Outlines are spaced >= 6 mm apart so they can be cut apart. Writes generated/print-sheets/*.pdf.
Repo-relative; reads the DXFs listed in validation/LASER-FILE-CHECKS.json (run tools/check_laser_files.py first).
"""
import json, re
from pathlib import Path

import ezdxf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "generated/print-sheets"; OUT.mkdir(parents=True, exist_ok=True)
checks = json.loads((ROOT / "validation/LASER-FILE-CHECKS.json").read_text(encoding="utf-8"))["files"]
W, H, MARGIN, GAP, HEAD = 210.0, 297.0, 12.0, 6.0, 22.0
GROUPS = [
    ("own-picks-full-handle-with-holes", r"^generated/other-lock-picks/.*__full-handle__holes"),
    ("own-picks-full-handle-no-holes", r"^generated/other-lock-picks/.*__full-handle__no-holes"),
    ("own-picks-xacto", r"^generated/other-lock-picks/.*__xacto__"),
    ("tension-tools", r"^generated/tension-tools-v2/(TOK-C|TOK-L|TOK-STRAIGHT|BOK-STRAIGHT|TOK-Z|BOK-L)"),
    ("fit-tests", r"^generated/(calibration/|xacto-tang-v2/fit-tests/FIT-TEST)"),
    ("xacto-picks", r"^generated/xacto-tang-v2/pick-"),
    ("original-picks-with-holes", r"^generated/picks-with-holes/"),
    ("original-picks-no-holes", r"^generated/picks/pick-.*steel-0\.50mm$"),
]


def outline(stem):
    d = ezdxf.readfile(ROOT / (stem + ".dxf"))
    rings, guides = [], []
    for e in d.modelspace():
        if e.dxftype() == "LWPOLYLINE":
            pts = [(x, -y) for x, y in e.get_points("xy")]
            (guides if e.dxf.layer.startswith("REFERENCE") else rings).append(pts + ([pts[0]] if e.closed else []))
        elif e.dxftype() == "CIRCLE":
            import math
            c, r = e.dxf.center, e.dxf.radius
            rings.append([(c.x + r * math.cos(k * math.pi / 36), -c.y - r * math.sin(k * math.pi / 36)) for k in range(73)])
    xs = [x for r in rings for x, _ in r]; ys = [y for r in rings for _, y in r]
    return rings, guides, (min(xs), min(ys), max(xs), max(ys))


def new_page(title, page_no):
    fig = plt.figure(figsize=(W / 25.4, H / 25.4))
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, W); ax.set_ylim(H, 0); ax.axis("off")
    ax.text(MARGIN, 9, f"{title} · page {page_no}", fontsize=8, va="center")
    ax.text(MARGIN, 14, "Print at 100 % / Actual size. The bar below must measure 100 mm. No kerf offset.", fontsize=6.5, va="center")
    ax.plot([MARGIN, MARGIN + 100], [18, 18], "k-", lw=0.8)
    for i in range(11):
        ax.plot([MARGIN + i * 10] * 2, [16.5 if i % 5 else 15.5, 18], "k-", lw=0.5)
    ax.text(MARGIN + 101, 18, "100 mm", fontsize=6, va="center")
    return fig, ax


for name, pat in GROUPS:
    stems = sorted(r["stem"] for r in checks if re.search(pat, r["stem"]) and r.get("dxf_bbox_mm"))
    if not stems:
        continue
    pdf_path = OUT / f"{name}__A4-print-at-100pct.pdf"
    with PdfPages(pdf_path) as pdf:
        page, fig, ax = 0, None, None
        y = x = row_h = 0
        for stem in stems:
            rings, guides, (x0, y0, x1, y1) = outline(stem)
            w, h = x1 - x0, y1 - y0 + 3.5            # room for the label under the outline
            if fig is None or x + w > W - MARGIN:
                x, y = MARGIN, (y + row_h + GAP) if fig else 0
                row_h = 0
            if fig is None or y + h > H - MARGIN:
                if fig:
                    pdf.savefig(fig); plt.close(fig)
                page += 1; fig, ax = new_page(name.replace("-", " "), page)
                x, y, row_h = MARGIN, HEAD, 0
            for r in rings:
                ax.plot([px - x0 + x for px, _ in r], [py - y0 + y for _, py in r], "k-", lw=0.35)
            for g in guides:
                ax.plot([px - x0 + x for px, _ in g], [py - y0 + y for _, py in g], color="0.55", lw=0.3, ls="--")
            label = re.sub(r"__.*", "", stem.rsplit("/", 1)[1]) + ("" if "__" not in stem.rsplit("/", 1)[1] else " " + stem.rsplit("/", 1)[1].split("__", 1)[1][:28])
            ax.text(x, y + (y1 - y0) + 2.6, label, fontsize=4.5, color="0.3")
            x += w + GAP; row_h = max(row_h, h)
        if fig:
            pdf.savefig(fig); plt.close(fig)
    print(pdf_path.relative_to(ROOT).as_posix(), page, "pages")
