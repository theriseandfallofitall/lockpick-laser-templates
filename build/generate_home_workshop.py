#!/usr/bin/env python3
"""Home-workshop laser files: corrected X-Acto tang picks, picks for other lock types,
and hacksaw-blade layouts + registration jig.

Outputs (all SVG + DXF, millimetres, 1:1, unfilled, closed outlines, no kerf offset):
  generated/xacto-tang-v2/          53 original working profiles on a corrected X-Acto tang + fit-test tangs
  generated/other-lock-picks/       own-design picks: pin tumbler, wafer, warded, lever, dimple
                                    (full handle with / without Ø3.40 holes at 15 / 50 mm, and X-Acto tang)
  generated/hacksaw-blade-layouts/  parts evenly spaced (>= --gap) on a 300 mm-centre hacksaw blade + blade jig;
                                    full-handle parts sit flush at the blade ends so the pin hole becomes a lanyard hole
  manifest-home-workshop.json       one row per outline (id, family, size, files)

Repo-relative: run from anywhere, writes only inside this repository. Needs ezdxf, shapely, numpy.

  python build/generate_home_workshop.py                      # defaults below
  python build/generate_home_workshop.py --tang-width 5.70    # after measuring your own collet / ground tang

Tang defaults come from docs/xacto-tang.md: the v1 6.20 mm tang was too wide in practice.
"""
import argparse, json, math
from pathlib import Path

import ezdxf
import numpy as np
from shapely.affinity import translate, scale, rotate
from shapely.geometry import Polygon, box, Point, LineString
from shapely.ops import unary_union

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
ap = argparse.ArgumentParser()
ap.add_argument("--tang-width", type=float, default=5.80, help="tang width across the collet jaws, mm")
ap.add_argument("--tang-length", type=float, default=10.0, help="tang insertion length, mm")
ap.add_argument("--blade-width", type=float, default=12.7, help="hacksaw blade width, mm")
ap.add_argument("--tooth-margin", type=float, default=1.5, help="keep-out from the tooth edge, mm")
ap.add_argument("--shoulder-length", type=float, default=2.0, help="X-Acto shoulder thickness along the pick, mm")
ap.add_argument("--shoulder-width", type=float, default=10.0, help="X-Acto shoulder width (the stop), mm")
ap.add_argument("--tang-hole", type=float, default=2.2, help="hole through the tang for the DIY bar grub screw; 0 = none")
ap.add_argument("--tang-hole-x", type=float, default=5.0, help="tang hole centre, mm in front of the shoulder face")
ap.add_argument("--gap", type=float, default=6.0, help="minimum gap between parts on a blade (room to saw them apart), mm")
ap.add_argument("--pin-hole", type=float, default=4.0, help="hacksaw blade pin-hole diameter, mm")
args = ap.parse_args()

TW, TL = args.tang_width, args.tang_length
SHOULDER_W, SHOULDER_L = args.shoulder_width, args.shoulder_length
TANG_HOLE_D, TANG_HOLE_X = args.tang_hole, args.tang_hole_x
NECK_IN = min(1.0, SHOULDER_L / 2)          # neck starts this far inside the shoulder: no step in front of it
SH_R = min(0.4, SHOULDER_L / 2 - 0.05)     # shoulder corner radius
SOURCE_CUT = 88.0          # original working section kept from this source X to the tip (as v1)
records = []


from laser_io import ROOT, STROKE, rings_of, path_d, write_pair, place


def clean(p, r_in=0.25, r_out=0.15):
    """Fillet inside corners (stress relief) and soften outside corners; keep a single polygon."""
    q = p.buffer(r_in, quad_segs=8).buffer(-r_in, quad_segs=8)
    q = q.buffer(-r_out, quad_segs=8).buffer(r_out, quad_segs=8)
    q = q.simplify(0.002, preserve_topology=True)
    if q.geom_type != "Polygon":
        q = max(q.geoms, key=lambda g: g.area)
    assert q.is_valid, "invalid outline"
    return q


def record(ident, family, poly, files, **extra):
    b = poly.bounds
    records.append(dict(id=ident, family=family, length_mm=round(b[2] - b[0], 3), height_mm=round(b[3] - b[1], 3),
                        area_mm2=round(poly.area, 3), files=files, **extra))


# ---------------------------------------------------------------- handles (y-down, shaft centreline at y=0)
def xacto_tang(neck_half):
    """Tang (x 0..TL) + shoulders (TL..TL+2) + tapered neck to the shaft at x = TL+8."""
    c = 0.4
    tang = Polygon([(0, -TW / 2 + c), (c, -TW / 2), (TL, -TW / 2), (TL, TW / 2), (c, TW / 2), (0, TW / 2 - c)])
    guard = box(TL, -SHOULDER_W / 2, TL + SHOULDER_L, SHOULDER_W / 2).buffer(-SH_R).buffer(SH_R, quad_segs=16)
    neck = Polygon([(TL + SHOULDER_L - SH_R, -3.3), (TL + SHOULDER_L + 6, -neck_half), (TL + SHOULDER_L + 6, neck_half), (TL + SHOULDER_L - SH_R, 3.3)])
    return unary_union([tang, guard, neck]), TL + SHOULDER_L + 6


def full_handle(neck_half, length=62.0, height=9.0):
    """Flat handle with two Ø3.40 holes at 15 / 50 mm from the butt."""
    body = box(0, -height / 2, length, height / 2).buffer(-2).buffer(2, quad_segs=16)
    neck = Polygon([(length - 3, -height / 2 + 0.6), (length + 12, -neck_half), (length + 12, neck_half), (length - 3, height / 2 - 0.6)])
    return unary_union([body, neck]), length + 12, [(15.0, 0.0), (50.0, 0.0)]


def smooth_neck(xs, half_s, xe, half_e, cy_e=0.0, n=60):
    """Tangent (cosine) taper from a wide root (xs, half-height half_s, centre 0) to the shaft (xe, half_e, centre cy_e).
    Zero slope at both ends: no step, no kink, no stress riser where the neck meets the shaft."""
    top, bot = [], []
    for i in range(n + 1):
        t = i / n
        k = 0.5 * (1 + math.cos(math.pi * t))           # 1 -> 0 with zero slope at both ends
        x = xs + (xe - xs) * t
        c = cy_e * (1 - k)
        h = half_e + (half_s - half_e) * k
        top.append((x, c - h)); bot.append((x, c + h))
    return Polygon(top + bot[::-1])


# ---------------------------------------------------------------- tips (start at x=0 on the shaft, y-down = up is negative)
SH = 1.4  # shaft height for pin/wafer picks (vertical, in-plane)


def shaft(x0, length, h=SH):
    return box(x0, -h / 2, x0 + length, h / 2)


def tip_half_ball(x, d=3.2):
    return unary_union([Point(x + d / 2, -SH / 2).buffer(d / 2, quad_segs=24).intersection(box(x - 1, -10, x + d + 1, SH / 2)),
                        box(x, -SH / 2, x + d / 2, SH / 2)]), x + d


def tip_single_ball(x, d=4.0):
    return Point(x + d / 2 - 0.2, 0).buffer(d / 2, quad_segs=24), x + d


def tip_double_ball(x, d=3.4, pitch=5.2):
    return unary_union([Point(x + d / 2, 0).buffer(d / 2, quad_segs=24), box(x, -SH / 2, x + pitch, SH / 2),
                        Point(x + d / 2 + pitch, 0).buffer(d / 2, quad_segs=24)]), x + pitch + d


def tip_wafer_rake(x, peaks=4, pitch=3.6, h=2.4):
    pts = [(x, SH / 2), (x, -SH / 2)]
    for i in range(peaks):
        pts += [(x + i * pitch + pitch * 0.5, -SH / 2 - h), (x + (i + 1) * pitch, -SH / 2)]
    pts += [(x + peaks * pitch + 1.2, -SH / 2), (x + peaks * pitch + 1.2, SH / 2)]
    return Polygon(pts), x + peaks * pitch + 1.2


def tip_comb(x, teeth, pitch=3.9, tooth_w=1.5, tooth_h=2.2, body_h=4.6):
    """Comb pick: a wide flat body (like commercial combs) with one tooth per pin stack on top, front tooth at the tip.
    Pitch 3.9 mm sits between Kwikset 3.81 and Schlage 3.96. Only defeats locks without overlift protection."""
    L = teeth * pitch + 0.8
    body = box(x, -body_h / 2, x + L, body_h / 2)
    t = [box(x + L - 0.4 - tooth_w - i * pitch, -body_h / 2 - tooth_h, x + L - 0.4 - i * pitch, -body_h / 2 + 0.1) for i in range(teeth)]
    return unary_union([body] + t), x + L


def tip_warded_L(x, bit, shaft_h=2.2, bit_w=2.0):
    """Warded (skeleton-style) L pick: bit rises `bit` mm above the shaft at the end."""
    return unary_union([box(x, -shaft_h / 2, x + bit_w + 1.0, shaft_h / 2),
                        box(x + 1.0, -shaft_h / 2 - bit, x + 1.0 + bit_w, shaft_h / 2)]), x + bit_w + 1.0


def tip_warded_T(x, bit, shaft_h=2.2, bit_w=2.0):
    return box(x + 1.0, -shaft_h / 2 - bit, x + 1.0 + bit_w, shaft_h / 2 + bit).union(
        box(x, -shaft_h / 2, x + 1.0 + bit_w, shaft_h / 2)), x + 1.0 + bit_w


def tip_dimple_flag(x, flag_l=2.0, flag_w=2.5, shaft_h=1.6):
    """Flat blank for a dimple pick: the last `flag_l` mm (marked by two notches) is bent 90° to form the flag."""
    body = box(x, -shaft_h / 2, x + 6 + flag_l, shaft_h / 2)
    flag = box(x + 6, -flag_w / 2, x + 6 + flag_l, flag_w / 2)
    notches = [box(x + 6 - 0.15, -shaft_h / 2 - 0.01, x + 6 + 0.15, -shaft_h / 2 + 0.25),
               box(x + 6 - 0.15, shaft_h / 2 - 0.25, x + 6 + 0.15, shaft_h / 2 + 0.01)]
    return unary_union([body, flag]).difference(unary_union(notches)), x + 6 + flag_l


def tip_lever_hook(x, lift=3.5, shaft_h=2.0):
    """Lever (mortice) lifter: small upright hook at the end of a long shaft, lifts one lever at a time."""
    return unary_union([box(x, -shaft_h / 2, x + 2.4, shaft_h / 2),
                        box(x + 1.2, -shaft_h / 2 - lift, x + 2.4, shaft_h / 2),
                        box(x + 0.4, -shaft_h / 2 - lift, x + 2.4, -shaft_h / 2 - lift + 0.8)]), x + 2.4


def tip_curtain(x, bit, shaft_h=2.2, bit_w=3.5):
    """Lever-lock curtain / bolt-stump tension wrench: wide flat bit at the end of the shaft."""
    return unary_union([box(x, -shaft_h / 2, x + bit_w, shaft_h / 2),
                        box(x, -shaft_h / 2 - bit, x + bit_w, shaft_h / 2)]), x + bit_w


def tip_profile(x, pts, sh=1.2):
    """Generic pin-tumbler tip: `pts` is the top edge as (dx, height above the shaft top) pairs; bottom edge is the shaft."""
    top = [(x + dx, -sh / 2 - h) for dx, h in pts]
    end = x + pts[-1][0]
    return Polygon([(x, sh / 2), (x, -sh / 2)] + top + [(end, sh / 2)]).buffer(0), end


def tip_hook(x, h, w=1.0, lean=0.0, sh=1.2):
    """Hook: a post `h` tall, `w` wide, at the end of the shaft; `lean` tips it forward (offset hook)."""
    post = Polygon([(x + 1.0, -sh / 2 + 0.1), (x + 1.0 + lean, -sh / 2 - h), (x + 1.0 + lean + w, -sh / 2 - h),
                    (x + 1.0 + w, -sh / 2 + 0.1)])
    p = unary_union([box(x, -sh / 2, x + 1.0 + w, sh / 2), post])
    return p.buffer(-0.3).buffer(0.3, quad_segs=12), x + 1.0 + w + max(lean, 0)


def wave(n, length, h, samples=60):
    return [(length * i / samples, h * (0.5 - 0.5 * math.cos(2 * math.pi * n * i / samples))) for i in range(samples + 1)]


PIN = [
    ("hook-short", lambda x: tip_hook(x, 1.6), "Short hook: single-pin picking, low-set pins."),
    ("hook-medium", lambda x: tip_hook(x, 2.6), "Medium hook: the everyday single-pin pick."),
    ("hook-deep", lambda x: tip_hook(x, 3.6, w=0.9), "Deep hook: reaches high pins behind low ones."),
    ("hook-offset", lambda x: tip_hook(x, 2.8, w=0.9, lean=1.0), "Offset (forward-leaning) hook for tight bitting."),
    ("half-diamond-small", lambda x: tip_profile(x, [(0, 0), (1.6, 1.6), (3.2, 0)]), "Small half-diamond: pins, wafers, raking."),
    ("half-diamond-large", lambda x: tip_profile(x, [(0, 0), (2.4, 2.4), (4.4, 0)]), "Large half-diamond."),
    ("rake-bogota-3", lambda x: tip_profile(x, wave(3, 11.0, 2.0)), "Bogota-style triple-peak rake (rounded peaks)."),
    ("rake-snake", lambda x: tip_profile(x, wave(2.5, 13.0, 2.2)), "Snake rake: rocking and raking."),
    ("rake-city", lambda x: tip_profile(x, [(0, 0), (1.2, 2.2), (2.6, 2.2), (3.6, 0.6), (4.8, 0.6), (6.0, 2.8), (7.2, 2.8),
                                             (8.2, 1.2), (9.4, 1.2), (10.4, 2.4), (11.6, 2.4), (12.6, 0)]),
     "City (L) rake: a stepped key-like profile."),
]

OTHER = [
    # id, lock type, tip builder, shaft length, shaft height, notes
] + [(i, "pin tumbler", f, 46, 1.2, n) for i, f, n in PIN] + [
    ("wafer-half-ball", "wafer", lambda x: tip_half_ball(x), 50, SH, "Half-ball: wafer locks, also single-pin work."),
    ("wafer-single-ball", "wafer", lambda x: tip_single_ball(x), 50, SH, "Ball pick for wafer locks (desk, cabinet, car)."),
    ("wafer-double-ball", "wafer", lambda x: tip_double_ball(x), 48, SH, "Snowman / double-ball for wafer rocking."),
    ("wafer-zigzag-rake", "wafer", lambda x: tip_wafer_rake(x), 44, SH, "Zig-zag rake, wafer and low-pin-count locks."),
    ("wafer-wide-rocker", "wafer", lambda x: tip_profile(x, wave(2, 14.0, 3.2), sh=1.6), 42, 1.6, "Wide rocker rake: two tall rounded humps for rocking wafers."),
    ("pin-comb-4", "pin tumbler", lambda x: tip_comb(x, 4), 40, 4.6, "4-pin comb; over-lifts all pins. Locks without overlift protection only."),
    ("pin-comb-5", "pin tumbler", lambda x: tip_comb(x, 5), 38, 4.6, "5-pin comb."),
    ("pin-comb-6", "pin tumbler", lambda x: tip_comb(x, 6), 36, 4.6, "6-pin comb."),
    ("warded-L-4.0", "warded", lambda x: tip_warded_L(x, 4.0), 38, 2.2, "Warded L pick, 4.0 mm bit."),
    ("warded-L-5.5", "warded", lambda x: tip_warded_L(x, 5.5), 38, 2.2, "Warded L pick, 5.5 mm bit."),
    ("warded-L-6.8", "warded", lambda x: tip_warded_L(x, 6.8), 38, 2.2, "Warded L pick, 6.8 mm bit (fits a 12.7 mm blade)."),
    ("warded-T-2.5", "warded", lambda x: tip_warded_T(x, 2.5), 38, 2.2, "Warded T pick, 2.5 mm each side."),
    ("warded-T-3.5", "warded", lambda x: tip_warded_T(x, 3.5), 38, 2.2, "Warded T pick, 3.5 mm each side."),
    ("lever-lifter-hook-3.5", "lever (mortice)", lambda x: tip_lever_hook(x, 3.5), 70, 2.0,
     "Lever lifter, 3.5 mm lift. Multipick lever blades are 0.4-0.6 mm thick, 120 mm long. Lever pitch unverified."),
    ("lever-lifter-hook-5.0", "lever (mortice)", lambda x: tip_lever_hook(x, 5.0), 70, 2.0, "Lever lifter, 5.0 mm lift."),
    ("lever-curtain-wrench-6", "lever (mortice)", lambda x: tip_curtain(x, 6.0), 66, 2.2,
     "Curtain / bolt-stump tension wrench, 6 mm bit. Bit size unverified: check against your keyhole."),
    ("lever-curtain-wrench-8", "lever (mortice)", lambda x: tip_curtain(x, 8.0), 66, 2.2, "Curtain wrench, 8 mm bit."),
    ("dimple-flat-flag", "dimple", lambda x: tip_dimple_flag(x), 46, 1.6,
     "Flat blank; bend the 2.0 mm flag 90° at the notches. Flag 2.0 x 2.5 mm after bending (Multipick-style). Hand-finish."),
]

HOLE_R = 1.7          # Ø3.40 handle holes
HOLE_X = (15.0, 50.0)  # from the butt


def comb_tool(teeth, style, pitch=3.9, tooth_w=1.5, tooth_h=2.2, body_h=4.6):
    """Comb like commercial ones: one wide flat body, a short taper on the tooth side only, teeth along the top edge,
    straight bottom edge. No thin shaft and no neck. Returns (polygon, holes)."""
    L = teeth * pitch + 3.0
    if style == "xacto":
        c = 0.4
        tang = Polygon([(0, -TW / 2 + c), (c, -TW / 2), (TL, -TW / 2), (TL, TW / 2), (c, TW / 2), (0, TW / 2 - c)])
        guard = box(TL, -SHOULDER_W / 2, TL + SHOULDER_L, SHOULDER_W / 2).buffer(-SH_R).buffer(SH_R, quad_segs=16)
        x0, bot = TL + NECK_IN, SHOULDER_W / 2
        base, holes = unary_union([tang, guard]), [(TL - TANG_HOLE_X, 0.0)]
        root_top = -SHOULDER_W / 2
    else:
        base = box(0, -4.5, 56, 4.5).buffer(-2).buffer(2, quad_segs=16)
        x0, bot, root_top, holes = 54.0, 4.5, -4.5, [(15.0, 0.0), (50.0, 0.0)]
    top = bot - body_h
    taper = [(x0 + 8 * i / 40, top + (root_top - top) * 0.5 * (1 + math.cos(math.pi * i / 40))) for i in range(41)]  # tangent, no kink
    body = Polygon(taper + [(x0 + 8 + L, top), (x0 + 8 + L, bot), (x0, bot)])
    t = [box(x0 + 8 + L - 0.6 - tooth_w - i * pitch, top - tooth_h, x0 + 8 + L - 0.6 - i * pitch, top + 0.1) for i in range(teeth)]
    p = unary_union([base, body] + t)
    return clean(p, 0.4, 0.25), holes


def build_other(style):
    """Returns (ident, lock, note, polygon_without_holes, holes[(x, y)] in the placed frame)."""
    out = []
    for ident, lock, tipf, sl, sh, note in OTHER:
        if ident.startswith("pin-comb-"):
            p, holes = comb_tool(int(ident[-1]), "xacto" if style == "xacto" else "full")
            q = place(p)
            dx, dyp = q.bounds[0] - p.bounds[0], q.bounds[1] - p.bounds[1]
            out.append((ident, lock, note, q, [(hx + dx, hy + dyp) for hx, hy in holes]))
            continue
        neck_half = max(sh / 2, 0.7) + 0.5
        if style == "xacto":
            base, x0 = xacto_tang(neck_half)
            holes = [(TL - TANG_HOLE_X, 0.0)]                 # tang hole (drilled only in the "+hole" variant)
        else:
            base, x0, holes = full_handle(neck_half)
        tip, xend = tipf(x0 + sl)
        work = unary_union([shaft(x0 + 6, sl - 5.5, sh), tip])
        half = SHOULDER_W / 2 if style == "xacto" else 4.5
        dy = max(0.0, -half - work.bounds[1])        # drop tall tips so the whole pick stays within the handle height
        work = translate(work, 0, dy)
        if style == "xacto":
            neck = smooth_neck(TL + NECK_IN, SHOULDER_W / 2, x0 + 10, sh / 2, dy)   # starts at full shoulder width: no step in front of the shoulders
        else:
            neck = smooth_neck(62.0 - 4, 4.5, x0 + 10, sh / 2, dy)          # starts at full handle height: no step
        base = base.intersection(box(-1, -50, (TL + SHOULDER_L) if style == "xacto" else 62.0 - 3, 50))  # drop the old straight necks
        p = clean(unary_union([base, neck, work]))
        q = place(p)
        dx, dyp = q.bounds[0] - p.bounds[0], q.bounds[1] - p.bounds[1]
        out.append((ident, lock, note, q, [(hx + dx, hy + dyp) for hx, hy in holes]))
    return out


def drill(p, holes, web=1.2, r=None):
    """Cut the handle holes; refuse if any hole leaves less than `web` mm of metal round it."""
    for hx, hy in holes:
        c = Point(hx, hy).buffer(r or HOLE_R, quad_segs=32)
        assert c.buffer(web).within(p), f"hole at {hx:.1f},{hy:.1f} leaves < {web} mm web"
        p = p.difference(c)
    return p


def src_working(row):
    d = ezdxf.readfile(ROOT / row["files"][1])
    e = next(iter(d.modelspace().query("LWPOLYLINE")))
    p = Polygon([(v[0], -v[1]) for v in e.get_points()])
    sec = p.intersection(LineString([(SOURCE_CUT, -100), (SOURCE_CUT, 100)]))
    lo, hi = sec.bounds[1], sec.bounds[3]
    active = p.intersection(box(SOURCE_CUT, -100, 300, 100))
    return active, (lo + hi) / 2, hi - lo


ORIGINALS = (ROOT / "manifest.json").exists()   # source profiles: not in this repo

# ---------------------------------------------------------------- 1. X-Acto tang family (private originals) + fit tests
OUTX = ROOT / "generated/xacto-tang-v2"; OUTX.mkdir(parents=True, exist_ok=True)
xacto, sources = {}, []
if ORIGINALS:
    rows = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    sources = [r for r in rows if r["id"].startswith("pick-") and r["steel_thickness_mm"] == 0.5]
    assert len(sources) == 53
    for row in sources:
        active, centre, neck_w = src_working(row)
        base, x0 = xacto_tang(neck_w / 2 + 0.6)
        active_t = translate(active, x0 + 4 - SOURCE_CUT, -centre)
        xe = x0 + 14                                   # blend ends 10 mm into the original working section
        sec = active_t.intersection(LineString([(xe, -50), (xe, 50)]))
        neck = smooth_neck(TL + NECK_IN, SHOULDER_W / 2, xe, (sec.bounds[3] - sec.bounds[1]) / 2, (sec.bounds[1] + sec.bounds[3]) / 2)
        base = base.intersection(box(-1, -50, TL + SHOULDER_L, 50))
        p = unary_union([base, neck, active_t]).simplify(0.001, preserve_topology=True)
        assert p.geom_type == "Polygon" and p.is_valid and not p.interiors, row["id"]
        dev = p.intersection(box(xe + 0.5, -100, 400, 100)).hausdorff_distance(active_t.intersection(box(xe + 0.5, -100, 400, 100)))
        assert dev < 0.003, (row["id"], dev)
        ph = drill(p, [(TL - TANG_HOLE_X, 0.0)], web=1.0, r=TANG_HOLE_D / 2) if TANG_HOLE_D > 0 else None
        p = place(p)
        ident = row["id"] + "-xacto-v2"
        xacto[ident] = p
        files = write_pair(OUTX / f"{ident}__tang-{TW:.2f}x{TL:.0f}mm", [(ident, p)],
                           title=f"Cut outline mm 1:1; X-Acto tang {TW:.2f} wide x {TL:.0f} long; fit-test first")
        if ph is not None:
            files += write_pair(OUTX / f"{ident}__tang-{TW:.2f}x{TL:.0f}mm__hole-{TANG_HOLE_D:.1f}", [(ident, place(ph))],
                                title=f"X-Acto / DIY bar tang with a Ø{TANG_HOLE_D} hole {TANG_HOLE_X} mm in front of the shoulders")
        record(ident, "xacto-tang-v2", p, files, source_id=row["id"], tang_width_mm=TW, tang_length_mm=TL,
               working_profile_hausdorff_mm=round(dev, 5))

FIT = OUTX / "fit-tests"; FIT.mkdir(exist_ok=True)
strip = []
widths = [round(TW + d, 2) for d in (-0.40, -0.30, -0.20, -0.10, 0.0, 0.10, 0.20)]
for k, w in enumerate(widths):
    c = 0.4
    tang = Polygon([(0, -w / 2 + c), (c, -w / 2), (TL, -w / 2), (TL, w / 2), (c, w / 2), (0, w / 2 - c)])
    guard = box(TL, -SHOULDER_W / 2, TL + SHOULDER_L, SHOULDER_W / 2).buffer(-SH_R).buffer(SH_R, quad_segs=16)
    tab = box(TL + SHOULDER_L - 0.4, -2.5, TL + 22, 2.5)   # overlaps the shoulder for any --shoulder-length
    p = unary_union([tang, guard, tab])
    for j in range(k + 1):  # hole count = position in the series (1 = narrowest)
        p = p.difference(Point(TL + 6 + j * 2.0, 0).buffer(0.6, quad_segs=16))
    p = place(p)
    ident = f"FIT-TEST__xacto-tang-{w:.2f}x{TL:.0f}mm__{k + 1}-holes"
    files = write_pair(FIT / ident, [(ident, p)], title=f"X-Acto fit test: tang {w:.2f} mm wide; {k + 1} holes")
    record(ident, "xacto-fit-test", p, files, tang_width_mm=w, holes=k + 1)
    strip.append((ident, translate(p, 0, k * 12)))
write_pair(FIT / f"ALL-FIT-TESTS__{widths[0]:.2f}-to-{widths[-1]:.2f}mm", strip)
keep = {i for i, _ in strip} | {f"ALL-FIT-TESTS__{widths[0]:.2f}-to-{widths[-1]:.2f}mm"}   # names carry the tang width: drop other runs' files
for old in [f for e in ("svg", "dxf", "pdf") for f in FIT.glob("*." + e) if f.stem not in keep]:
    old.unlink()

CAL = ROOT / "generated/calibration"
if not (CAL / "calibration-50x20__plastic-2.00mm.svg").exists():   # public build: make our own scale coupon
    CAL.mkdir(parents=True, exist_ok=True)
    p = place(box(0, 0, 50, 20))
    write_pair(CAL / "calibration-50x20__plastic-2.00mm", [("calibration-50x20", p)], title="Scale check: must measure 50.0 x 20.0 mm")

# ---------------------------------------------------------------- 2. own-design picks (pin tumbler, wafer, warded, lever, dimple)
OUTO = ROOT / "generated/other-lock-picks"; OUTO.mkdir(parents=True, exist_ok=True)
for old in OUTO.glob("*__full-handle__holes-3.40mm-at-15-50.*"):     # pre-variant naming
    old.unlink()
other_holes, other_plain, other_xacto, end_holes = {}, {}, {}, {}
for ident, lock, note, p, holes in build_other("full"):
    full_id = f"{ident}__full-handle"
    ph = drill(p, holes)
    f1 = write_pair(OUTO / (full_id + "__holes-3.40mm-at-15-50"), [(full_id, ph)])
    f2 = write_pair(OUTO / (full_id + "__no-holes"), [(full_id, p)])
    record(full_id, "other-lock-picks", ph, f1 + f2, lock_type=lock, handle="full-handle", note=note,
           holes_mm=[[round(x, 3), round(y, 3)] for x, y in holes])
    other_holes[full_id], other_plain[full_id] = ph, p
for old in OUTO.glob("*__xacto__tang-*"):
    old.unlink()
for ident, lock, note, p, tholes in build_other("xacto"):
    full_id = f"{ident}__xacto"
    files = write_pair(OUTO / (full_id + f"__tang-{TW:.2f}x{TL:.0f}mm"), [(full_id, p)])
    if TANG_HOLE_D > 0:
        files += write_pair(OUTO / (full_id + f"__tang-{TW:.2f}x{TL:.0f}mm__hole-{TANG_HOLE_D:.1f}"),
                            [(full_id, drill(p, tholes, web=1.0, r=TANG_HOLE_D / 2))])
    record(full_id, "other-lock-picks", p, files, lock_type=lock, handle="xacto", note=note)
    other_xacto[full_id] = p

for wa, wb in ((2.5, 3.0), (3.0, 4.0)):
    bar = box(0, -2.0, 76, 2.0)
    bar = bar.difference(box(-1, -2.1, 12, 2.0 - wa)).difference(box(64, -2.1, 77, 2.0 - wb))
    p = place(clean(bar))
    ident = f"dimple-tensioner__{wa:.1f}-{wb:.1f}"
    files = write_pair(OUTO / ident, [(ident, p)], title="Dimple tensioner bar; cut from 1.2-1.5 mm sheet (Multipick SP-62..67 / BMS-09..10 sizes)")
    record(ident, "other-lock-picks", p, files, lock_type="dimple", handle="bar",
           note="Dimple tensioner: tips 2.5-4.0 mm wide, 12 mm long. Needs 1.2-1.5 mm stock, not hacksaw blade.")

orig_plain, orig_holes = [], []

# ---------------------------------------------------------------- 3. hacksaw blade layouts + jig
OUTH = ROOT / "generated/hacksaw-blade-layouts"
if args.pin_hole <= 0:
    sys.exit("--pin-hole must be > 0 mm")
for old in OUTH.glob("blade-*"):
    old.unlink()
OUTH.mkdir(parents=True, exist_ok=True)
BW, TM, GAP = args.blade_width, args.tooth_margin, args.gap
BL, HOLE_PITCH, HOLE_D, END_KEEP, FLUSH = 315.0, 300.0, args.pin_hole, 16.0, 0.8
M = 5.0  # sheet margin around the blade
blade = box(M, M, M + BL, M + BW)
hole_x = [M + (BL - HOLE_PITCH) / 2, M + (BL + HOLE_PITCH) / 2]
pin_holes = [Point(x, M + BW / 2).buffer(HOLE_D / 2, quad_segs=24) for x in hole_x]
blade_ref = [("blade-outline", blade)] + [(f"blade-pin-hole-{i}", c) for i, c in enumerate(pin_holes)]
blade_ref.append(("tooth-edge-keepout", box(M, M + BW - TM, M + BL, M + BW)))
band = (M + 0.5, M + BW - TM)            # usable height: 0.5 mm off the spine, clear of the tooth margin
usable_h = band[1] - band[0]


def handle_centre_y(p):
    sec = p.intersection(LineString([(p.bounds[0] + 7, -100), (p.bounds[0] + 7, 100)]))
    return (sec.bounds[1] + sec.bounds[3]) / 2


def fit_band(q):
    return q.bounds[1] >= band[0] - 1e-6 and q.bounds[3] <= band[1] + 1e-6


def end_place(p, right):
    """Butt flush with the blade end, handle centred on the pin hole, so the blade's own hole becomes a lanyard hole."""
    if right:
        p = rotate(p, 180, origin="centroid")
        q = translate(p, M + BL - FLUSH - p.bounds[2], 0)
        cy = handle_centre_y(rotate(q, 180, origin="centroid"))
        cy = 2 * q.centroid.y - cy
    else:
        q = translate(p, M + FLUSH - p.bounds[0], 0)
        cy = handle_centre_y(q)
    q = translate(q, 0, M + BW / 2 - cy)
    ph = pin_holes[1 if right else 0]
    ok = fit_band(q) and ph.buffer(1.2).within(q)
    return q, ok


def spine_place(p, x):
    """Put the pick's straight handle edge exactly on the blade's smooth back (spine) edge: that side needs no cutting."""
    return translate(p, x - p.bounds[0], M - p.bounds[1])


def blades_spine(items):
    """Even spacing, every part's top (handle) edge on the spine. No end slots: the pin hole would sit too near the edge."""
    out, cur = [], []
    span = (M + BL - END_KEEP) - (M + END_KEEP)
    for it in items:
        trial = cur + [it]
        if cur and sum(i[1].bounds[2] - i[1].bounds[0] for i in trial) + GAP * (len(trial) + 1) > span:
            out.append(cur); cur = [it]
        else:
            cur = trial
    if cur:
        out.append(cur)
    placed = []
    for group in out:
        Ls = [p.bounds[2] - p.bounds[0] for _, p in group]
        g = (span - sum(Ls)) / (len(group) + 1)
        x, res = M + END_KEEP + g, []
        for (ident, p), L in zip(group, Ls):
            q = spine_place(p, x)
            assert q.bounds[3] <= band[1] + 1e-6, ident          # clear of the tooth margin
            res.append((ident, q)); x += L + g
        gaps = [res[i + 1][1].bounds[0] - res[i][1].bounds[2] for i in range(len(res) - 1)]
        placed.append((res, False, gaps))
    return placed


def blades_for(items, end_ok):
    """Greedy fill, then even spacing. end_ok: the first/last items sit flush at the blade ends."""
    span_end, span_mid = BL - 2 * FLUSH, (M + BL - END_KEEP) - (M + END_KEEP)
    out, cur = [], []
    for it in items:
        L = it[1].bounds[2] - it[1].bounds[0]
        trial = cur + [it]
        need = sum(i[1].bounds[2] - i[1].bounds[0] for i in trial) + GAP * (len(trial) - 1)
        if cur and (need > span_end if end_ok else need + 2 * GAP > span_mid):
            out.append(cur); cur = [it]
        else:
            cur = trial
    if cur:
        out.append(cur)
    placed = []
    for group in out:
        Ls = [p.bounds[2] - p.bounds[0] for _, p in group]
        res, use_end = [], end_ok
        if use_end:
            first, ok1 = end_place(group[0][1], False)
            last, ok2 = end_place(group[-1][1], True) if len(group) > 1 else (None, True)
            if not (ok1 and ok2):            # handle too small for the pin hole: lay this group out away from the ends
                placed += blades_for(group, False)
                continue
        if use_end:
            res.append((group[0][0], first))
            if len(group) > 1:
                free = span_end - sum(Ls)
                g = free / (len(group) - 1)
                x = first.bounds[2] + g
                for (ident, p), L in zip(group[1:-1], Ls[1:-1]):
                    q = translate(p, x - p.bounds[0], band[0] + (usable_h - (p.bounds[3] - p.bounds[1])) / 2 - p.bounds[1])
                    res.append((ident, q)); x += L + g
                res.append((group[-1][0], last))
        else:
            free = span_mid - sum(Ls)
            g = free / (len(group) + 1)
            x = M + END_KEEP + g
            for (ident, p), L in zip(group, Ls):
                q = translate(p, x - p.bounds[0], band[0] + (usable_h - (p.bounds[3] - p.bounds[1])) / 2 - p.bounds[1])
                res.append((ident, q)); x += L + g
        gaps = [res[i + 1][1].bounds[0] - res[i][1].bounds[2] for i in range(len(res) - 1)]
        assert all(gp >= GAP - 1e-6 for gp in gaps), gaps
        assert all(fit_band(q) or (k in (0, len(res) - 1) and use_end) for k, (_, q) in enumerate(res))
        placed.append((res, use_end, gaps))
    return placed


tension = []
tt = ROOT / "manifest-tension-tools-v2.json"          # run build/generate_tension_tools.py first
if tt.exists():
    for r in json.loads(tt.read_text(encoding="utf-8")):
        if r["fits_12_7mm_blade"]:
            d = ezdxf.readfile(ROOT / [f for f in r["files"] if f.endswith(".dxf")][0])
            for e in d.modelspace().query('LWPOLYLINE[layer=="CUT"]'):
                tension.append((r["id"], place(Polygon([(v[0], -v[1]) for v in e.get_points()]))))
sets = [("own-picks-xacto", list(other_xacto.items()), False),
        ("own-picks-full-handle__no-holes", list(other_plain.items()), True),
        ("own-picks-full-handle__with-holes", list(other_holes.items()), True),
        ("tension-tools-v2", tension, False)]
if ORIGINALS:
    sets += [("xacto-v2-picks", list(xacto.items()), False),
             ("original-picks__no-holes", orig_plain, True),
             ("original-picks__with-holes", orig_holes, True)]
# spine-edge versions of the flat-handle sets: handle edge on the blade's back edge (one side needs no cutting)
sets += [(n + "__spine", polys, None) for n, polys, end_ok in list(sets) if end_ok]
layouts = []
too_tall = [i for _, polys, _ in sets for i, p in polys if p.bounds[3] - p.bounds[1] > usable_h]
for name, polys, end_ok in sets:
    polys = [(i, p) for i, p in polys if p.bounds[3] - p.bounds[1] <= BW - TM]
    if end_ok is not None:
        polys = [(i, p) for i, p in polys if p.bounds[3] - p.bounds[1] <= usable_h]
    for n, (items, used_end, gaps) in enumerate(blades_spine(polys) if end_ok is None else blades_for(polys, end_ok), 1):
        stem = OUTH / f"blade-{BW:.1f}mm__{name}__{n:02d}"
        files = write_pair(stem, items, w=BL + 2 * M, h=BW + 2 * M, ref=blade_ref,
                           title="Red = cut/mark. Blue = blade reference, do not cut. Origin matches the blade jig.")
        layouts.append(dict(set=name, sheet=n, outlines=[i for i, _ in items], files=files,
                            min_gap_mm=round(min(gaps), 2) if gaps else None, ends_use_blade_pin_holes=used_end))
jig = box(0, 0, BL + 2 * M, BW + 2 * M + 10).difference(box(M - 0.15, M - 0.15, M + BL + 0.15, M + BW + 0.15))
jig_stem = f"JIG__hacksaw-blade-{BW:.1f}x{BL:.0f}mm__pocket+0.15mm"
for old in [f for f in OUTH.glob("JIG__*") if f.stem != jig_stem]:   # a jig left by another --blade-width
    old.unlink()
files = write_pair(OUTH / f"JIG__hacksaw-blade-{BW:.1f}x{BL:.0f}mm__pocket+0.15mm", [("jig-plate", jig)],
                   w=BL + 2 * M, h=BW + 2 * M + 10,
                   title="Cut from 3 mm sheet, leave it in place on the bed, drop the blade in the pocket, run the blade layout at the same origin.")
layouts.append(dict(set="jig", sheet=1, outlines=["jig-plate"], files=files))

(ROOT / "manifest-home-workshop.json").write_text(json.dumps(records, indent=1), encoding="utf-8")
(OUTH / "layouts.json").write_text(json.dumps(
    dict(blade_width_mm=BW, blade_length_mm=BL, pin_hole_pitch_mm=HOLE_PITCH, pin_hole_dia_mm=HOLE_D, tooth_margin_mm=TM,
         min_gap_mm=GAP, usable_height_mm=usable_h, layouts=layouts, too_tall_for_blade=too_tall), indent=1), encoding="utf-8")
print(f"outlines {len(records)}  blade layouts {len(layouts) - 1}  tang {TW:.2f}x{TL:.1f}  too tall for blade: {len(too_tall)}"
      f"  ends on pin holes: {sum(1 for l in layouts if l.get('ends_use_blade_pin_holes'))}")
