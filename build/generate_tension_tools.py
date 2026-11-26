#!/usr/bin/env python3
"""Tension tools v2: lock-derived sizing, hacksaw-blade-fit variants and multi-feature designs.

Sizing (see docs/tension-sizing.md):
  insertion length  L_in = first_pin - pin_dia/2 - clearance       (stays in front of pin 1)
  recessed version  L_in + recess
  tip width (height in keyway) 2.4 / 2.8 / 3.3 / 4.0 mm            (Multipick SP11-17, SP33, SP45)
  shaft width 3.4 mm, overall 76 mm                                 (Multipick SP33 / SP45)
Defaults reproduce Kwikset KW1 (first pin 6.27 mm -> L_in 4.7 mm, Multipick SP11's short side).

Writes generated/tension-tools-v2/ (SVG + DXF, mm 1:1) and manifest-tension-tools-v2.json.
Blue / REFERENCE-DO-NOT-CUT = bend lines and labels guides only.

  python build/generate_tension_tools.py                         # Kwikset defaults
  python build/generate_tension_tools.py --first-pin 5.87        # Schlage SC1
"""
import argparse, json, math, sys
from pathlib import Path

from shapely.affinity import translate, rotate, scale
from shapely.geometry import Polygon, box, Point, LineString
from shapely.ops import unary_union

sys.path.insert(0, str(Path(__file__).resolve().parent))
import laser_io as W  # shared SVG/DXF writer
import pick_shapes as S  # comb geometry shared with the picks

ap = argparse.ArgumentParser()
ap.add_argument("--first-pin", type=float, default=6.27, help="plug face to first pin centre, mm (KW1 0.247in)")
ap.add_argument("--pin-dia", type=float, default=2.92, help="pin diameter, mm (0.115in)")
ap.add_argument("--clearance", type=float, default=0.10)
ap.add_argument("--recess", type=float, default=6.0, help="extra reach for recessed plugs, mm")
ap.add_argument("--length", type=float, default=76.0)
ap.add_argument("--shaft", type=float, default=3.4)
a = ap.parse_args()

ROOT = W.ROOT
L_IN = round(a.first_pin - a.pin_dia / 2 - a.clearance, 2)
L_REC = round(L_IN + a.recess, 2)
SW, LEN = a.shaft, a.length
if L_IN <= 0.5 or a.length < 2 * (L_REC + 8):
    ap.error(f"insertion {L_IN} mm / length {a.length} mm: check --first-pin, --recess and --length")
OUT = ROOT / "generated/tension-tools-v2"; OUT.mkdir(parents=True, exist_ok=True)
TIPS = [2.4, 2.8, 3.3, 4.0]
SHOULDER = 1.5          # leg beyond the insertion length; its step stops against the plug face
records = []


def fillet(p, r_in=0.8, r_out=0.4):
    q = p.buffer(r_in, quad_segs=12).buffer(-r_in, quad_segs=12).buffer(-r_out, quad_segs=12).buffer(r_out, quad_segs=12)
    if q.geom_type != "Polygon":
        q = max(q.geoms, key=lambda g: g.area)
    return q.simplify(0.002, preserve_topology=True)


def serrate(p, x0, x1, y_edge, pitch=0.6, depth=0.3, up=True):
    """Cut a row of small V teeth into an edge between x0..x1 (grip on the plug)."""
    teeth = []
    x = x0
    while x + pitch <= x1 + 1e-9:
        s = -1 if up else 1
        teeth.append(Polygon([(x, y_edge), (x + pitch / 2, y_edge - s * depth), (x + pitch, y_edge)]).buffer(0))
        x += pitch
    return p.difference(unary_union([t.buffer(0.001) for t in teeth]).buffer(0))


def leg(x_outer, side, direction, tip, lin, shaft_w=SW):
    """Perpendicular working leg at a shaft end.
    x_outer: outer x of the leg; side: -1 = left end, +1 = right end; direction: -1 up, +1 down.
    Narrow tip (width `tip`, outer side) for `lin` mm, then a step shoulder that stops on the plug face."""
    leg_w = max(tip + 0.9, shaft_w)
    y0 = direction * (shaft_w / 2 - 0.5)                   # overlap into the shaft
    y_step = direction * (shaft_w / 2 + SHOULDER)
    y_end = y_step + direction * lin
    xl = sorted([x_outer, x_outer - side * leg_w])
    xt = sorted([x_outer, x_outer - side * tip])
    body = box(xl[0], min(y0, y_step), xl[1], max(y0, y_step))
    tipb = box(xt[0], min(y_step, y_end), xt[1], max(y_step, y_end))
    return unary_union([body, tipb]), (xt, y_end)


def tok_bar(tip_a, tip_b, lin_a, lin_b, same_side):
    shaft = box(0, -SW / 2, LEN, SW / 2)
    la, _ = leg(0, -1, -1, tip_a, lin_a)
    lb, _ = leg(LEN, +1, -1 if same_side else +1, tip_b, lin_b)
    return fillet(unary_union([shaft, la, lb]))


def straight_bend(tip_a, tip_b, lin_a, lin_b, width=SW, serr=False):
    """Peterson-style straight bar: cut flat, bend 90 deg out of plane at the blue lines."""
    width = max(width, max(tip_a, tip_b) + 0.6)   # the bar must be wider than its tips, else nothing is narrowed (>= 0.6 mm shoulder)
    p = box(0, -width / 2, LEN, width / 2)
    cut = []
    for x0, tip, lin, s in ((0, tip_a, lin_a, 1), (LEN, tip_b, lin_b, -1)):
        xs = sorted([x0, x0 + s * lin])
        cut.append(box(xs[0] - 0.01, -width / 2 - 0.01, xs[1], width / 2 - tip))  # narrow from the top edge, keep bottom edge straight
    p = fillet(p.difference(unary_union(cut)), 0.4, 0.25)
    if serr:   # after the fillet (it would round the 0.3 mm teeth away); teeth point into the metal (+y) from the tip's cut edge
        for x0, lin, tip, s in ((0, lin_a, tip_a, 1), (LEN, lin_b, tip_b, -1)):
            xs = sorted([x0 + s * 0.6, x0 + s * (lin - 0.4)])
            p = serrate(p, xs[0], xs[1], width / 2 - tip, up=True)
    bends = [LineString([(lin_a + SHOULDER, -width / 2 - 1), (lin_a + SHOULDER, width / 2 + 1)]),
             LineString([(LEN - lin_b - SHOULDER, -width / 2 - 1), (LEN - lin_b - SHOULDER, width / 2 + 1)])]
    return p, bends


def bok_L(tip, leg_len=12.0, shaft=3.0):
    """Flat BOK L-wrench: leg sits in the bottom of the keyway under the key-cut area."""
    p = unary_union([box(0, -shaft / 2, LEN, shaft / 2), box(LEN - tip, shaft / 2 - 0.5, LEN, shaft / 2 + leg_len)])
    return fillet(p)


# ---------------------------------------------------------------- advanced designs
def flex_gauge(tip=2.8):
    """In-plane flexure tensioner with a pointer. Flat-L tools take the lever force in their own plane,
    so a serpentine flexure between head and handle bends visibly; the pointer (fixed to the head)
    moves against tick notches on the handle -> repeatable feather-light tension."""
    la, _ = leg(0, -1, -1, tip, L_IN)
    head = box(0, -SW / 2, 16, SW / 2)
    beams, links = [], []
    xs = [16 + i * 2.2 for i in range(5)]                    # five 0.8 mm vertical beams, 1.4 mm gaps
    for i, x in enumerate(xs):
        beams.append(box(x, -SW / 2 - 2.0, x + 0.8, SW / 2))
        if i < len(xs) - 1:
            y = -SW / 2 - 2.0 if i % 2 == 0 else SW / 2 - 0.8
            links.append(box(x, y, xs[i + 1] + 0.8, y + 0.8))
    handle = box(xs[-1], -SW / 2 - 2.0, LEN, SW / 2)
    pointer = unary_union([box(4, SW / 2 - 0.5, 6, SW / 2 + 2.4), box(4, SW / 2 + 1.6, 52, SW / 2 + 2.4)])
    scale_tab = box(50, SW / 2 - 0.5, 58, SW / 2 + 1.0)       # pointer tip sits just above this tab
    p = unary_union([la, head] + beams + links + [handle, pointer, scale_tab])
    ticks = [box(50.5 + i * 1.5, SW / 2 + 0.6, 50.9 + i * 1.5, SW / 2 + 1.01) for i in range(5)]
    return fillet(p.difference(unary_union(ticks)), 0.25, 0.15)


def tension_card(w=85.6, h=54.0):
    """Credit-card-size multi-tool: TOK tips (short + recessed) and BOK tips around the edges, finger hole."""
    card = box(0, 0, w, h).buffer(-3).buffer(3, quad_segs=16)
    tabs = []
    x = 8
    for tip in TIPS:                       # short TOK tips along the top edge
        tabs.append(box(x, -L_IN, x + tip, 0.5)); x += tip + 7
    x = 8
    for tip in TIPS:                       # recessed TOK tips along the bottom edge
        tabs.append(box(x, h - 0.5, x + tip, h + L_REC)); x += tip + 7
    for i, tip in enumerate((2.2, 3.1)):   # BOK tips on the right edge
        y = 12 + i * 18
        tabs.append(box(w - 0.5, y, w + 10, y + tip))
    p = fillet(unary_union([card] + tabs), 0.8, 0.3)
    p = p.difference(Point(w * 0.36, h / 2).buffer(9, quad_segs=32))      # finger hole
    return p


def curved_bar(tip_a=2.8, tip_b=3.3):
    """Ergonomic double-ended TOK: gently waved shaft with a finger pad, short + recessed ends."""
    pts = []
    n = 120
    for i in range(n + 1):
        x = 6 + (LEN - 12) * i / n
        y = 2.2 * math.sin(math.pi * 2 * (x - 6) / (LEN - 12))
        pts.append((x, y))
    centre = LineString(pts)
    shaft = centre.buffer(SW / 2, cap_style=2, quad_segs=12)
    pad = Point(LEN * 0.5, 0).buffer(5.2, quad_segs=32)
    pad = scale(pad, 1.8, 1.0)
    ends = [box(0, -SW / 2, 7, SW / 2), box(LEN - 7, -SW / 2, LEN, SW / 2)]
    la, _ = leg(0, -1, -1, tip_a, L_IN)
    lb, _ = leg(LEN, +1, +1, tip_b, L_REC)
    p = unary_union([shaft, pad] + ends + [la, lb])
    p = p.difference(Point(LEN * 0.5, 0).buffer(2.2, quad_segs=24))      # lanyard / thumb dimple
    return fillet(p, 1.2, 0.4)


def z_bar(tip_tok=2.8, tip_bok=3.1):
    """TOK on one end, BOK on the other (Law Lock 'Z bar' concept): one tool, both positions."""
    la, _ = leg(0, -1, -1, tip_tok, L_IN)
    bok = box(LEN - tip_bok, SW / 2 - 0.5, LEN, SW / 2 + 12)
    return fillet(unary_union([box(0, -SW / 2, LEN, SW / 2), la, bok]))


def multi_wrench():
    """Own multi-arm wrench (Dragon-style idea): one flat plate, four working arms — short TOK, recessed TOK,
    wide wafer/Euro TOK (4.0 mm) and a 12 mm BOK — plus a finger hole. Cut from 0.6-1.0 mm sheet."""
    body = box(0, 0, 46, 18).buffer(-4).buffer(4, quad_segs=16)
    arms = [box(-L_IN - SHOULDER, 2.0, 0.5, 2.0 + 2.4),                       # left: short TOK 2.4 wide
            box(46 - 0.5, 2.0, 46 + L_REC + SHOULDER, 2.0 + 2.8),             # right: recessed TOK 2.8 wide
            box(6, -L_IN - SHOULDER, 6 + 4.0, 0.5),                           # top: wide wafer / Euro 4.0
            box(30, 17.5, 30 + 3.1, 18 + 12.0)]                               # bottom: BOK 3.1 x 12
    steps = [box(-SHOULDER, 2.0 - 0.6, 0.5, 2.0 + 3.0), box(45.5, 2.0 - 0.6, 46 + SHOULDER, 2.0 + 3.4),
             box(6 - 0.6, -SHOULDER, 6 + 4.6, 0.5)]                           # step shoulders stop on the plug face
    p = unary_union([body] + arms + steps).difference(Point(23, 9).buffer(5.5, quad_segs=32))
    return fillet(p, 0.6, 0.3)


def tension_wheel(d=40.0, slot_w=3.6, slot_t=1.3, notches=24):
    """Own tension wheel: slide it onto a flat tension bar (slot fits up to 3.4 x 1.2 mm), roll the rim with a finger;
    the rim notches let you count / repeat how far you turned it."""
    disc = Point(0, 0).buffer(d / 2, quad_segs=64)
    cuts = [box(-slot_w / 2, -slot_t / 2, slot_w / 2, slot_t / 2)]
    for i in range(notches):
        a = 2 * math.pi * i / notches
        cuts.append(Point((d / 2) * math.cos(a), (d / 2) * math.sin(a)).buffer(0.9 if i % 6 else 1.4, quad_segs=12))
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        cuts.append(Point(10 * math.cos(a), 10 * math.sin(a)).buffer(4.0, quad_segs=24))
    return disc.difference(unary_union(cuts))


def comb_bar(lock="kwikset", pins=5):
    """Own comb bar (tension + comb in one tool, like the commercial idea): a stepped TOK leg going down at the
    left end (4.7 mm insertion, stops before pin 1) and a comb at the right end, sized as the comb picks
    (build/pick_shapes.py COMB: 2 mm body, 5 mm teeth at the lock's cut spacing, a stop that rests on the lock face)."""
    first, pitch = S.COMB_LOCKS[lock]
    x_stop = LEN - (first + (pins - 1) * pitch + S.COMB_TOOTH_W / 2 + 1.2)
    shaft = box(0, -SW / 2, x_stop, SW / 2)
    comb, _ = S.comb(x_stop, lock, pins, bottom=SW / 2)
    la, _ = leg(0, -1, +1, 2.8, L_IN)
    return fillet(unary_union([shaft, comb, la]), 0.5, 0.25)


# ---------------------------------------------------------------- build everything
def emit(ident, group, poly, note, ref=(), fits=None, ins=(L_IN, L_REC)):   # ins: (short, long) insertion, None = n/a
    p = W.place(poly, 2.0)
    dx = p.bounds[0] - poly.bounds[0]; dy = p.bounds[1] - poly.bounds[1]
    ref = [(f"{ident}-bend-{i}", translate(g, dx, dy)) for i, g in enumerate(ref)]
    files = W.write_pair(OUT / ident, [(ident, p)], ref=ref,
                         title=f"{ident}: mm 1:1, no kerf. Blue = bend line / guide, do not cut.")
    h = p.bounds[3] - p.bounds[1]
    records.append(dict(id=ident, group=group, length_mm=round(p.bounds[2] - p.bounds[0], 2), height_mm=round(h, 2),
                        fits_12_7mm_blade=h <= 10.7, insertion_mm=ins[0], recessed_insertion_mm=ins[1], note=note, files=files))


for t in TIPS:
    emit(f"TOK-Z__tip-{t:.1f}__short-{L_IN}-long-{L_REC}", "TOK double-ended (sheet)",
         tok_bar(t, t, L_IN, L_REC, same_side=False), "SP-style: short end stops before pin 1, long end for recessed plugs.")
    emit(f"TOK-C__tip-{t:.1f}-{t + 0.4:.1f}__short-{L_IN}", "TOK double-ended, blade-fit",
         tok_bar(t, t + 0.4, L_IN, L_IN, same_side=True), "Both short ends on one side so it fits a 12.7 mm hacksaw blade.")
    p, bends = straight_bend(t, t + 0.4, L_IN, L_REC)
    emit(f"TOK-STRAIGHT-BEND__tip-{t:.1f}-{t + 0.4:.1f}", "TOK straight, bend after cutting (blade-fit)", p,
         "Peterson-style. Cut flat, bend 90 deg at the blue lines (heat hacksaw steel first or it snaps).", ref=bends)
    p, bends = straight_bend(t, t + 0.4, L_IN, L_REC, serr=True)
    emit(f"TOK-STRAIGHT-BEND-SERRATED__tip-{t:.1f}-{t + 0.4:.1f}", "TOK straight, bend after cutting (blade-fit)", p,
         "As above with 0.6 mm grip serrations on the bearing edge.", ref=bends)
for t in TIPS:
    la, _ = leg(0, -1, -1, t, L_IN)
    emit(f"TOK-L-SINGLE__tip-{t:.1f}__short-{L_IN}", "TOK single-ended, blade-fit",
         fillet(unary_union([box(0, -SW / 2, LEN - SW / 2, SW / 2), Point(LEN - SW / 2, 0).buffer(SW / 2, quad_segs=16), la])),
         "One working end, round other end: the simplest bar that fits a 12.7 mm hacksaw blade.")
for t in (2.2, 3.1):
    emit(f"BOK-L__tip-{t:.1f}__leg-12", "BOK flat L (sheet)", bok_L(t), "Bottom-of-keyway L wrench, 3.0 mm shaft.", ins=(12.0, None))
    p, bends = straight_bend(t, t, 10.0, 14.0, width=3.0)
    emit(f"BOK-STRAIGHT-BEND__tip-{t:.1f}", "BOK straight, bend after cutting (blade-fit)", p,
         "Classic bent BOK wrench; 10 / 14 mm legs.", ref=bends, ins=(10.0, 14.0))
emit("ADV__flex-gauge-tensioner", "Advanced", flex_gauge(),
     "S-flexure between head and handle with a pointer and tick notches: repeatable feather-light tension.")
emit("ADV__curved-finger-pad-TOK", "Advanced", curved_bar(),
     "Waved shaft, finger pad and dimple; short and recessed ends on opposite sides.")
emit("ADV__Z-bar-TOK-plus-BOK", "Advanced", z_bar(), "TOK end + BOK end in one tool.")
emit("ADV__multi-arm-wrench", "Advanced", multi_wrench(),
     "Own multi-arm wrench: short TOK, recessed TOK, 4.0 mm wide wafer/Euro TOK and 12 mm BOK on one plate.")
emit("ADV__tension-wheel-40", "Advanced", tension_wheel(),
     "Own tension wheel: slides onto a flat bar; roll the rim, count the notches for repeatable tension.", ins=(None, None))
for lock, n in (("kwikset", 5), ("schlage", 5), ("schlage", 6)):
    emit(f"ADV__comb-bar-{lock}-{n}-pin", "Advanced", comb_bar(lock, n),
         f"Comb bar for {lock.capitalize()}, {n} pins: a tension leg (4.7 mm) at one end and a comb at the other. "
         "Slide the comb in along the bottom of the keyway to the stop, then lift: 5 mm teeth push the pins past the shear line.",
         ins=(L_IN, None))
emit("ADV__tension-card-85x54", "Advanced", tension_card(),
     "Credit-card multi-tool: 4 short TOK, 4 recessed TOK, 2 BOK tips, finger hole. Cut from 0.6-1.0 mm sheet.")

keep = {r["id"] for r in records}   # names carry the sizes: remove files a run with other flags left behind
for old in [f for e in ("svg", "dxf", "pdf") for f in OUT.glob("*." + e) if f.stem not in keep]:
    old.unlink()
(ROOT / "manifest-tension-tools-v2.json").write_text(json.dumps(records, indent=1), encoding="utf-8")
print(f"tension tools {len(records)}  L_in {L_IN}  recessed {L_REC}  blade-fit {sum(r['fits_12_7mm_blade'] for r in records)}")
