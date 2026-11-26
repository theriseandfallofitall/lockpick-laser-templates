#!/usr/bin/env python3
"""DIY grub-screw handle that takes the same X-Acto-tang picks (replaces the craft-knife handle).

Writes generated/diy-handle/:
  DIY-HANDLE__drawing-and-marking-wrap__A4.pdf   page 1: dimensioned 1:1 drawing; page 2: paper wrap to mark slot + hole
  DIY-HANDLE__end-marking-disc.svg/.dxf          laser/paper disc for the bar end: slot line and centre
Print at 100 %. Build notes: docs/diy-handle.md. Repo-relative.

  python build/generate_diy_handle.py --bar 10 --length 100 --double-ended
"""
import argparse, math, sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from shapely.geometry import Point, box

sys.path.insert(0, str(Path(__file__).resolve().parent))
import laser_io as W

ap = argparse.ArgumentParser()
ap.add_argument("--bar", type=float, default=10.0, help="bar diameter, mm (10 mm aluminium or brass)")
ap.add_argument("--length", type=float, default=100.0)
ap.add_argument("--tang-width", type=float, default=5.80)
ap.add_argument("--tang-length", type=float, default=10.0)
ap.add_argument("--slot-depth", type=float, default=12.0, help="slot depth; >= tang length + 2")
ap.add_argument("--screw-x", type=float, default=5.0, help="grub screw centre from the bar end, mm")
ap.add_argument("--double-ended", action="store_true", default=True)
a = ap.parse_args()
D, L, SD, SX = a.bar, a.length, a.slot_depth, a.screw_x
OUT = W.ROOT / "generated/diy-handle"; OUT.mkdir(parents=True, exist_ok=True)
A4 = (210.0, 297.0)


def page(title):
    fig = plt.figure(figsize=(A4[0] / 25.4, A4[1] / 25.4))
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, A4[0]); ax.set_ylim(A4[1], 0); ax.axis("off")
    ax.text(12, 10, title, fontsize=10, weight="bold")
    ax.text(12, 16, "Print at 100 % / Actual size. The bar below must measure 100 mm.", fontsize=7)
    ax.plot([12, 112], [20, 20], "k-", lw=0.8)
    for i in range(11):
        ax.plot([12 + 10 * i] * 2, [18.5 if i % 5 else 17.5, 20], "k-", lw=0.5)
    return fig, ax


def dim(ax, x0, y0, x1, y1, text, off=4, vertical=False):
    if vertical:
        ax.annotate("", (x0 - off, y0), (x0 - off, y1), arrowprops=dict(arrowstyle="<->", lw=0.4))
        ax.text(x0 - off - 1, (y0 + y1) / 2, text, fontsize=6, ha="right", va="center")
    else:
        ax.annotate("", (x0, y0 - off), (x1, y0 - off), arrowprops=dict(arrowstyle="<->", lw=0.4))
        ax.text((x0 + x1) / 2, y0 - off - 1, text, fontsize=6, ha="center")


with PdfPages(OUT / "DIY-HANDLE__drawing-and-marking-wrap__A4.pdf") as pdf:
    fig, ax = page("DIY grub-screw pick handle · 1:1")
    # side view at 1:1
    x0, yc = 20, 60
    ax.add_patch(plt.Rectangle((x0, yc - D / 2), L, D, fill=False, lw=0.6))
    for end in ([x0] + ([x0 + L] if a.double_ended else [])):
        s = 1 if end == x0 else -1
        ax.plot([end, end + s * SD], [yc, yc], "k--", lw=0.4)                       # slot (seen edge-on)
        ax.add_patch(plt.Circle((end + s * SX, yc - D / 2 + 0.01), 1.25, fill=False, lw=0.5))
        ax.plot([end + s * SX] * 2, [yc - D / 2, yc], "k-", lw=0.3)
    dim(ax, x0, yc - D / 2, x0 + L, yc - D / 2, f"{L:.0f}", off=6)
    dim(ax, x0, yc - D / 2, x0 + SD, yc - D / 2, f"slot {SD:.0f} deep", off=12)
    dim(ax, x0, yc - D / 2, x0 + SX, yc - D / 2, f"M3 at {SX:.0f}", off=18)
    dim(ax, x0, yc - D / 2, x0, yc + D / 2, f"Ø{D:.0f}", off=3, vertical=True)
    # end view, 4:1
    cx, cy, k = 50, 120, 4
    ax.add_patch(plt.Circle((cx, cy), D / 2 * k, fill=False, lw=0.6))
    ax.add_patch(plt.Rectangle((cx - D / 2 * k, cy - 0.45 * k), D * k, 0.9 * k, fill=False, lw=0.4, hatch="////"))
    ax.add_patch(plt.Rectangle((cx - a.tang_width / 2 * k, cy - 0.25 * k), a.tang_width * k, 0.5 * k, color="0.3"))
    ax.plot([cx, cx], [cy - D / 2 * k - 6, cy - 0.45 * k], "k-", lw=0.6)
    ax.text(cx + 2, cy - D / 2 * k - 4, "M3 grub screw (tapped 2.5 mm drill)", fontsize=6)
    ax.text(cx - D / 2 * k, cy + D / 2 * k + 6, "End view 4:1 — hacksaw slot across the full diameter,\n"
            f"tang ({a.tang_width:.2f} wide) sits in the slot; the screw presses its flat face.", fontsize=6)
    notes = [
        "Hand tools (bench vice, hacksaw, drill, M3 tap):",
        f"1. Cut {L:.0f} mm of Ø{D:.0f} aluminium or brass bar; square and chamfer both ends.",
        f"2. Wrap the page-2 strip round one end, mark the slot line and the hole cross.",
        f"3. Hacksaw a slot {SD:.0f} mm deep across the end, through the centre (one blade kerf, ~0.8 mm).",
        f"4. At {SX:.0f} mm from the end, at 90° to the slot, drill Ø2.5 into the slot; tap M3.",
        "5. Fit an M3 x 5 grub screw (cup point). Repeat on the other end for a double-ended handle.",
        "6. Slide the X-Acto-tang pick in until the 10 mm shoulders touch the bar end; tighten.",
        "Lathe: face, centre, chamfer 0.5 x 45°, knurl the middle 60 mm, part off; slot and tap as above.",
        "Tube: use 10 x 2 mm tube with a 10 mm long slotted Ø6 plug pressed or Loctited in each end.",
        "Untested prototype: try one pick before making several.",
    ]
    for i, n in enumerate(notes):
        ax.text(12, 170 + i * 6, n, fontsize=7)
    pdf.savefig(fig); fig.savefig(OUT / "DIY-HANDLE__drawing-preview.png", dpi=110); plt.close(fig)

    fig, ax = page("Marking wrap · cut out, wrap round the bar end, align the edge with the end face")
    circ = math.pi * D
    x0, y0 = 20, 40
    ax.add_patch(plt.Rectangle((x0, y0), circ, 25, fill=False, lw=0.6))
    for frac, lab in ((0.0, "slot"), (0.5, "slot")):
        ax.plot([x0 + frac * circ] * 2, [y0, y0 + SD], "r-", lw=0.6); ax.text(x0 + frac * circ + 0.5, y0 + SD + 3, lab, fontsize=6, color="r")
    hx = x0 + 0.25 * circ
    ax.plot([hx - 1.5, hx + 1.5], [y0 + SX] * 2, "k-", lw=0.5); ax.plot([hx] * 2, [y0 + SX - 1.5, y0 + SX + 1.5], "k-", lw=0.5)
    ax.text(hx + 2, y0 + SX, "drill M3 tap hole", fontsize=6, va="center")
    ax.text(x0, y0 - 2, f"Strip = π × {D:.0f} = {circ:.2f} mm round; this top edge sits on the end face", fontsize=6)
    pdf.savefig(fig); plt.close(fig)

disc = Point(0, 0).buffer(D / 2, quad_segs=48).difference(box(-D, -0.4, D, 0.4)).difference(Point(0, 0).buffer(0.01))
items = [(f"end-disc-half-{i}", g) for i, g in enumerate(getattr(disc, "geoms", [disc]))]
items = [(i, W.translate(g, D / 2 + 1, D / 2 + 1)) for i, g in items]
W.write_pair(OUT / "DIY-HANDLE__end-marking-disc", items, title="Paper or card disc for the bar end: the gap is the slot line")
print("generated/diy-handle written")
