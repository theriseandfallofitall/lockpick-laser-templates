"""Pick tip shapes shared by build/generate_home_workshop.py and build/generate_tension_tools.py.
The customiser (site/customizer.js) draws the same shapes with the same numbers.

Coordinates: x along the pick (tip end at larger x), y DOWN (SVG style), shaft centreline at y = 0.
Every tip starts at x0 on a shaft of height `sh` and returns (polygon, x_end).

Why the shapes look like this (review feedback, 2026-11-26):
  * Hooks and rakes are bent strips, like commercial picks: the shaft itself curves up, so both edges curve and
    there is no right-angle corner anywhere. A strip is the union of discs of varying width along a centreline.
  * Combs must push the whole pin stack past the shear line; see COMB below for the sums.
"""
import math

from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union


# ---------------------------------------------------------------- strip: discs along a centreline, hulls between them
def strip(centre, width, n=160):
    """centre(t) -> (x, y_up), width(t) -> mm, t in 0..1. Round at both ends."""
    discs = [Point(*_flip(centre(i / n))).buffer(width(i / n) / 2, quad_segs=16) for i in range(n + 1)]
    return unary_union([unary_union([a, b]).convex_hull for a, b in zip(discs, discs[1:])])


def _flip(p):
    return p[0], -p[1]


def _taper(w0, w1):
    return lambda t: w0 + (w1 - w0) * t


# ---------------------------------------------------------------- hooks
def hook_centre(h, R, theta_deg, w_tip, sh=1.2):
    """Centreline of a hook: an arc of radius R turning up by theta, then a straight riser. The riser is as long as
    needed for the top of the rounded nose to sit `h` above the shaft top. Returns (centre(t), arc+riser length)."""
    th = math.radians(theta_deg)
    rise = h + sh / 2 - w_tip / 2                     # centreline height of the nose centre
    arc_rise = R * (1 - math.cos(th))
    if arc_rise > rise:                               # bend alone is too tall: shrink the bend angle
        th = math.acos(1 - rise / R)
        arc_rise = rise
    Ls = (rise - arc_rise) / math.sin(th) if th > 1e-6 else 0.0
    La = R * th
    total = La + Ls

    def c(t):
        s = t * total
        if s <= La:
            a = s / R
            return R * math.sin(a), R * (1 - math.cos(a))
        d = s - La
        return R * math.sin(th) + d * math.cos(th), arc_rise + d * math.sin(th)
    return c, total


def hook(x0, h, R, theta, w_tip=0.9, sh=1.2):
    """Bent-strip hook: tip `h` above the shaft top; bend radius R (centreline); theta = 90 upright, < 90 leans forward."""
    c, _ = hook_centre(h, R, theta, w_tip, sh)
    p = strip(lambda t: (x0 + c(t)[0], c(t)[1]), _taper(sh, w_tip))
    p = unary_union([p, box(x0 - 0.5, -sh / 2, x0, sh / 2)])
    return p, p.bounds[2]


def swept_hook(x0, h, reach, w_tip=0.9, sh=1.2):
    """Swept hook: one long arc (no riser unless the arc alone cannot reach h). Same shape as the customiser's "swept"."""
    rise = h + sh / 2 - w_tip / 2
    th = min(math.pi / 2, 2 * math.atan2(rise, reach))
    return hook(x0, h, reach / math.sin(th), math.degrees(th), w_tip, sh)


# Hook set: (id, tip height above shaft top, bend radius, angle, tip width, description)
HOOKS = [
    ("hook-short", 2.0, 1.6, 80, 0.9, "Short hook. The first pick to learn single-pin picking with: lifts one pin at a time."),
    ("hook-medium", 3.0, 1.8, 82, 0.9, "Medium hook. Reaches a pin set higher than its neighbours."),
    ("hook-deep", 4.2, 2.0, 84, 0.9, "Deep hook. Reaches a high pin at the back past low pins in front of it."),
    ("hook-offset", 3.0, 1.8, 62, 0.9, "Offset hook. The tip leans forward, so it reaches over a low pin onto the next one."),
]
SWEPT = [1.2, 1.6, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0]     # swept-hook range, tip height above the shaft top


def swept_reach(h):
    return 0.8 * h + 1.6


# ---------------------------------------------------------------- rakes (bent strips) and profile tips
def wave_rake(x0, humps, length, amp, sh=1.2, w_end=0.9, both=False):
    """Strip that waves `humps` times over `length`. both=False: humps up only (Bogota). both=True: up and down (snake)."""
    if both:
        cy = lambda t: amp * math.sin(2 * math.pi * humps * t / 2)
    else:
        cy = lambda t: amp * 0.5 * (1 - math.cos(2 * math.pi * humps * t))
    p = strip(lambda t: (x0 + length * t, cy(t)), _taper(sh, w_end), n=240)
    p = unary_union([p, box(x0 - 0.5, -sh / 2, x0, sh / 2)])
    return p, p.bounds[2]


def profile(x0, pts, sh=1.2):
    """Solid tip: `pts` = top edge as (dx, height above the shaft top). A negative height goes below the shaft top;
    -sh ends the tip at the bottom edge (a sloped nose, no square end). Bottom edge is the straight shaft."""
    top = [(x0 + dx, -sh / 2 - h) for dx, h in pts]
    end = x0 + pts[-1][0]
    ring = [(x0, sh / 2), (x0, -sh / 2)] + top + ([] if pts[-1][1] <= -sh + 1e-9 else [(end, sh / 2)])
    return Polygon(ring).buffer(0), end


def half_diamond(h, back, sh=1.2):
    """Back ramp up to the peak, front ramp straight down to the bottom edge (pointed nose, slides in easily)."""
    front = 0.85 * (h + sh)
    return [(0, 0), (back, h), (back + front, -sh)]


DIAMONDS = [
    ("half-diamond-small", 1.6, 1.6, "Small half-diamond. Single pins in tight keyways, and gentle raking."),
    ("half-diamond-medium", 2.0, 2.0, "Medium half-diamond. The all-round shape: single pins, raking, wafer locks."),
    ("half-diamond-large", 2.6, 2.6, "Large half-diamond. Easier to feel on wide keyways and wafer locks."),
    ("half-diamond-deep", 3.2, 1.8, "Steep half-diamond. Steeper sides reach a higher pin than the medium one."),
]

# (id, builder(x0) -> (poly, x_end), description)
RAKES = [
    ("rake-bogota-2", lambda x: wave_rake(x, 2, 9.0, 1.8), "Bogota, two humps. Rock it up and down while pulling out slowly."),
    ("rake-bogota-3", lambda x: wave_rake(x, 3, 13.5, 1.8), "Bogota, three humps. As the two-hump one, covers more pins at once."),
    ("rake-snake", lambda x: wave_rake(x, 4, 12.0, 1.0, both=True), "Snake rake. Waves up and down; scrub it in and out with light tension."),
    ("rake-city", lambda x: profile(x, [(0, 0), (1.0, 2.2), (2.2, 2.2), (3.2, 0.6), (4.2, 0.6), (5.4, 2.8), (6.6, 2.8), (7.6, 1.2),
                                        (8.6, 1.2), (9.6, 2.4), (10.6, 2.4), (12.6, -1.2)]),
     "City rake (L-rake). Shaped like a key's cuts; rock it to set several pins at once."),
    ("rake-triple-peak", lambda x: profile(x, [(0, 0), (1.5, 2.4), (2.5, 0.9), (4.0, 2.8), (5.0, 0.9), (6.5, 2.4), (8.6, -1.2)]),
     "Triple-peak rake. Three sharp peaks; rock it while easing it out."),
]


# ---------------------------------------------------------------- combs
# A comb lifts every pin stack until the key pins are wholly above the shear line, so the plug turns.
#   Kwikset KW1 (LockWiki, Kwikset Classic): cut #1 root .329" above the key's bottom edge takes a .172" key pin,
#   so the shear line is .501" = 12.73 mm above the key's bottom edge (the keyway floor).
#   The keyway ceiling between the pin holes is about the uncut key height, ~8.5 mm.
# Slide the comb in along the floor, under the resting pins (body + teeth <= ~7 mm), then lift it until the body
# meets the ceiling: the teeth go up the pin holes and their tops reach 8.5 + tooth height.
#   tooth 5.0 mm  -> tops at ~13.5 mm, 0.8 mm past the shear line;  body 2.0 mm -> 7.0 mm total to slide in.
# Teeth must line up with the pin holes (Ø2.92 mm), so the comb has a stop that rests on the plug face, like a key's
# shoulder, and the teeth sit at the lock's first-cut distance and spacing.
COMB_BODY, COMB_TOOTH_H, COMB_TOOTH_W, COMB_STOP_H = 2.0, 5.0, 1.6, 10.2
COMB_LOCKS = {   # first cut from the shoulder, spacing (mm)
    "kwikset": (0.247 * 25.4, 0.150 * 25.4),   # LockWiki, Kwikset Classic
    "schlage": (0.231 * 25.4, 0.156 * 25.4),   # commonly published SC1 figures; measure your key
}


def comb(x_stop, lock, pins, bottom=0.0):
    """Comb section starting at the stop face x_stop: body COMB_BODY tall sitting on y = bottom (y down),
    teeth at the lock's cut positions, stop COMB_STOP_H tall just behind x_stop. Returns (poly, x_end)."""
    first, pitch = COMB_LOCKS[lock]
    top = bottom - COMB_BODY
    xs = [x_stop + first + i * pitch for i in range(pins)]
    end = xs[-1] + COMB_TOOTH_W / 2 + 1.2
    body = box(x_stop - 0.5, top, end, bottom)
    teeth = [box(x - COMB_TOOTH_W / 2, top - COMB_TOOTH_H + COMB_TOOTH_W / 2, x + COMB_TOOTH_W / 2, top + 0.1)
             .union(Point(x, top - COMB_TOOTH_H + COMB_TOOTH_W / 2).buffer(COMB_TOOTH_W / 2, quad_segs=16)) for x in xs]
    stop = box(x_stop - 2.0, bottom - COMB_STOP_H, x_stop, bottom)
    return unary_union([body, stop] + teeth), end
