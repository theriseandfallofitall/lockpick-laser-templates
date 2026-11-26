#!/usr/bin/env python3
"""Build the library page: one clean page, current files only, tabs for Picks / Tension / Handles /
Fit tests / Blade layouts / Print / Customise. Click any card image to see it large.
Families whose files are absent (e.g. the private originals in the public repo) are simply left out.

  python build/build_site.py                 # writes INDEX.html (+ LASER-FILES.html redirect)
  python build/build_site.py --page index.html   # public / GitHub Pages build

Sizes and the hacksaw-fit flag come from validation/LASER-FILE-CHECKS.json, so run
tools/check_laser_files.py first. Repo-relative. Writes INDEX.html, a redirect at LASER-FILES.html
(old link) and display-only thumbnails in previews/laser-index/.
Superseded families are not shown; they stay in git and archive/ (see CURRENT-RELEASE.md).
"""
import argparse, html, json, re, sys
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser(); ap.add_argument("--page", default="INDEX.html"); ARGS = ap.parse_args()
checks = {r["stem"]: r for r in json.loads((ROOT / "validation/LASER-FILE-CHECKS.json").read_text(encoding="utf-8"))["files"]}
esc = html.escape
THUMBS = ROOT / "previews/laser-index"
sys.path.insert(0, str(ROOT / "build"))
import pick_shapes as PS   # the same numbers the generators used, handed to the customiser
MADE = set()   # thumbnails written this run; the rest are left over from removed designs


def thumb(stem):
    """Display-only copy for the dark page: every cut shape gets the same fill and a visible non-scaling stroke,
    whatever colour the cut file uses (red, black, none); blue guide lines stay blue. Cut files are untouched."""
    src = (ROOT / (stem + ".svg")).read_text(encoding="utf-8")

    def recolour(m):
        tag = m.group(0)
        guide = re.search(r'stroke="(#0000ff|blue)"', tag, re.I)
        tag = re.sub(r'\s(fill|stroke|stroke-width|vector-effect|style)="[^"]*"', "", tag)
        attrs = ('fill="none" stroke="#6f86ff"' if guide else 'fill="#3a1b1d" stroke="#ff6b6b"') + ' stroke-width="1.4" vector-effect="non-scaling-stroke"'
        return tag[:-2].rstrip() + " " + attrs + "/>" if tag.endswith("/>") else tag[:-1].rstrip() + " " + attrs + ">"
    src = re.sub(r"<(?:path|circle|rect|polygon|polyline|ellipse)(?=[\s/>])[^>]*>", recolour, src)
    out = THUMBS / (stem.replace("/", "__") + ".svg")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(src, encoding="utf-8")
    MADE.add(out.name)
    return out.relative_to(ROOT).as_posix()


def stems(pattern):
    return sorted(s for s in checks if re.search(pattern, s) and checks[s].get("svg_bbox_mm"))


def pretty(s):
    s = s.replace("-", " ").replace("_", " ")
    s = re.sub(r"\bpick ", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:1].upper() + s[1:]


def laser_card(stem, name, extra=()):
    r = checks[stem]
    bb = r.get("dxf_bbox_mm") or r["svg_bbox_mm"]
    fit = r.get("fits_hacksaw_12.7mm")
    pdf = [("PDF", stem + ".pdf")] if (ROOT / (stem + ".pdf")).exists() else []
    return dict(name=name, size=f"{bb[0]:.1f} × {bb[1]:.1f} mm", fit=fit, thumb=thumb(stem),
                links=[("SVG", stem + ".svg"), ("DXF", stem + ".dxf")] + pdf + list(extra))


def file_card(name, img, size, links):
    return dict(name=name, size=size, fit=None, thumb=img, links=links)


# ---------------------------------------------------------------- "Customise this": library design -> customiser values
# Only designs the customiser can draw get a button. Values match build/pick_shapes.py and the generator, so the
# customiser starts from the same shape (its outline code is its own, so tiny differences in rounding are possible).
HOOKS = {i: dict(tip="hook", tipH=h, bendR=R, lean=90 - a, tipW=w) for i, h, R, a, w, _ in PS.HOOKS}
DIAMONDS = {i: dict(tip="halfDiamond", tipH=h, tipL=b) for i, h, b, _ in PS.DIAMONDS}
FIXED = {
    "rake-bogota-2": dict(tip="rake", waveStyle="up", peaks=2, tipL=9, tipH=1.65, tipW=0.9),
    "rake-bogota-3": dict(tip="rake", waveStyle="up", peaks=3, tipL=13.5, tipH=1.65, tipW=0.9),
    "rake-snake": dict(tip="rake", waveStyle="both", peaks=4, tipL=12, tipH=0.85, tipW=0.9),
    "rake-city": dict(tip="custom", tipL=12.6, custom="0 2.2 2.2 0.6 0.6 2.8 2.8 1.2 1.2 2.4 2.4 -1.2"),
    "rake-triple-peak": dict(tip="custom", tipL=8.6, custom="0 2.4 0.9 2.8 0.9 2.4 -1.2"),
    "wafer-half-ball": dict(tip="halfBall", tipH=3.2),
    "wafer-single-ball": dict(tip="ball", tipH=4.0),
    "wafer-zigzag-rake": dict(tip="custom", tipL=16.2, custom="0 2.4 0 2.4 0 2.4 0 2.4 0 -1.4"),
    "wafer-wide-rocker": dict(tip="rake", waveStyle="up", peaks=2, tipL=14, tipH=2.4, tipW=1.2),
    "lever-lifter-hook-3.5": dict(tip="hook", tipH=3.5, bendR=1.8, lean=5, tipW=1.2),
    "lever-lifter-hook-5.0": dict(tip="hook", tipH=5.0, bendR=1.8, lean=5, tipW=1.2),
}


def _tip_top(build):
    return build(0.0)[0].bounds[1]   # highest point of the tip (y down) above the shaft centreline


TIP_TOP = {i: _tip_top(lambda x, h=h, R=R, a=a, w=w: PS.hook(x, h, R, a, w)) for i, h, R, a, w, _ in PS.HOOKS}
TIP_TOP.update({f"hook-swept-{h:.1f}": _tip_top(lambda x, h=h: PS.swept_hook(x, h, PS.swept_reach(h))) for h in PS.SWEPT})
TIP_TOP.update({i: _tip_top(lambda x, h=h, b=b: PS.profile(x, PS.half_diamond(h, b))) for i, h, b, _ in PS.DIAMONDS})
TIP_TOP.update({i: _tip_top(f) for i, f, _ in PS.RAKES})
TIP_TOP.update({f"lever-lifter-hook-{h:.1f}": _tip_top(lambda x, h=h: PS.hook(x, h, 1.8, 85, 1.2, 2.0)) for h in (3.5, 5.0)})
TIP_TOP["wafer-wide-rocker"] = _tip_top(lambda x: PS.wave_rake(x, 2, 14.0, 2.6, sh=1.6, w_end=1.2))


def pick_custom(base, style, shaft):
    """Customiser values (as a URL query) for an own-design pick, or None when the customiser cannot draw it."""
    comb = re.match(r"pin-comb-(kwikset|schlage)-(\d)$", base)
    if comb:
        first, pitch = PS.COMB_LOCKS[comb.group(1)]
        p = dict(tip="comb", n=int(comb.group(2)), pitch=round(pitch, 2), first=round(first, 2), tipW=PS.COMB_TOOTH_W,
                 tipH=PS.COMB_TOOTH_H, shaftH=PS.COMB_BODY)   # the customiser joins a comb straight to the handle, as the generator does
    else:
        p = HOOKS.get(base) or DIAMONDS.get(base) or FIXED.get(base)
        if base.startswith("hook-swept-"):
            h = float(base.rsplit("-", 1)[1])
            p = dict(tip="swept", tipH=h, tipL=round(PS.swept_reach(h), 2), tipW=0.9)
        if p is None or not shaft:
            return None
        sl, sh = shaft
        # generator: neck to x0 + 10, tip at x0 + sl; a tip taller than the handle is lowered until it fits (dy in
        # build_other), which the customiser does with its shaft offset (sweep, + = down)
        top = TIP_TOP.get(base, -sh / 2)
        drop = max(0.0, -(5.0 if style == "xacto" else 4.5) - top)
        p = dict(p, shaftL=sl - 10, shaftH=sh, sweep=round(drop, 2), neckL=17 if style == "xacto" else 26)
    q = dict(tool="pick", handle="xacto" if style == "xacto" else "full", holes=1 if style != "xacto" else 0, flatEdge=0, **p)
    return q


def tension_custom(stem):
    """Customiser values for the tension-tools-v2 bars it can draw (U, Z, single, BOK L), else None."""
    n = stem.rsplit("/", 1)[1]
    m = re.match(r"TOK-C__tip-([\d.]+)-([\d.]+)__short-([\d.]+)$", n)
    if m:
        return dict(tool="tension", dirA="up", tipA=m[1], linA=m[3], dirB="up", tipB=m[2], linB=m[3])
    m = re.match(r"TOK-Z__tip-([\d.]+)__short-([\d.]+)-long-([\d.]+)$", n)
    if m:
        return dict(tool="tension", dirA="up", tipA=m[1], linA=m[2], dirB="down", tipB=m[1], linB=m[3])
    m = re.match(r"TOK-L-SINGLE__tip-([\d.]+)__short-([\d.]+)$", n)
    if m:
        return dict(tool="tension", dirA="up", tipA=m[1], linA=m[2], dirB="none")
    m = re.match(r"BOK-L__tip-([\d.]+)__leg-([\d.]+)$", n)
    if m:
        return dict(tool="tension", shaftW=3.0, dirA="none", dirB="down", tipB=m[1], linB=round(float(m[2]) - 1.5, 2))   # customiser counts the leg below its 1.5 mm step
    return None


def custom_link(c, q):
    if q:
        c["custom"] = urlencode(dict(q, name=c["name"]))
    return c


# ---------------------------------------------------------------- content (current files only; absent families skipped)
exists = lambda rel: (ROOT / rel).exists()
MAN = json.loads((ROOT / "manifest-home-workshop.json").read_text(encoding="utf-8")) if exists("manifest-home-workshop.json") else []
T = {}

# Picks: one card per design PER HANDLE STYLE ("flat" / "xacto"); a switch on the Picks tab shows one style at a time.
# Each card has labelled rows of SVG / DXF / PDF buttons instead of one long list.
def fmt_row(label, svg):
    """[label, [(SVG, ...), (DXF, ...), (PDF, ...)]] for one variant, given its SVG path (PDF only if built)."""
    st = svg[:-4]
    return [label, [("SVG", st + ".svg"), ("DXF", st + ".dxf")] + ([("PDF", st + ".pdf")] if (ROOT / (st + ".pdf")).exists() else [])]


def styled(stem, name, rows, style, note=""):
    c = laser_card(stem, name); c["links"] = [l for _, ls in rows for l in ls]; c["rows"] = rows; c["style"] = style
    if note:
        c["note"] = note
    return c


LOCKS = [("pin tumbler", "Pin tumbler"), ("wafer", "Wafer"), ("warded", "Warded"), ("lever (mortice)", "Lever (mortice)"), ("dimple", "Dimple")]
by_id = {r["id"]: r for r in MAN}
for lock, chip in LOCKS:
    cards = []
    for r in MAN:
        if r["family"] != "other-lock-picks" or r.get("lock_type") != lock:
            continue
        base = r["id"].split("__")[0]
        if r.get("handle") == "full-handle":
            holes = next(f for f in r["files"] if "__holes" in f and f.endswith(".svg"))
            plain = next(f for f in r["files"] if "__no-holes" in f and f.endswith(".svg"))
            cards.append(custom_link(styled(holes[:-4], pretty(base), [fmt_row("Holes", holes), fmt_row("No holes", plain)], "flat", r.get("note", "")),
                                     pick_custom(base, "flat", r.get("shaft_mm"))))
            xr = by_id.get(base + "__xacto")
            if xr:
                xs = [f for f in xr["files"] if f.endswith(".svg")]
                rows = [fmt_row("Plain", xs[0])] + ([fmt_row("Tang hole", xs[1])] if len(xs) > 1 else [])
                fr = by_id.get(base + "__xacto-flat-edge")          # optional flat-edge version (one side = the blade's back)
                if fr:
                    fs = [f for f in fr["files"] if f.endswith(".svg")]
                    rows += [fmt_row("Flat edge", fs[0])] + ([fmt_row("Flat edge + hole", fs[1])] if len(fs) > 1 else [])
                cards.append(custom_link(styled(xs[0][:-4], pretty(base), rows, "xacto", r.get("note", "")),
                                         pick_custom(base, "xacto", xr.get("shaft_mm"))))
        elif r.get("handle") == "bar":
            c = laser_card(r["files"][0][:-4], pretty(base) + " " + r["id"].split("__")[1] + " mm"); c["note"] = r.get("note", "")
            cards.append(c)                                     # no handle: shown in both styles
    T[("picks", chip)] = cards


def oid(s):
    return re.sub(r"__steel.*", "", s.rsplit("/", 1)[1])


orig = []
for s in stems(r"^generated/picks/pick-.*steel-0\.50mm$"):
    hp = f"generated/picks-with-holes/{oid(s)}__holes-3.40mm-at-15-50.svg"
    orig.append(styled(hp[:-4] if (ROOT / hp).exists() else s, pretty(oid(s)),
                       ([fmt_row("Holes", hp)] if (ROOT / hp).exists() else []) + [fmt_row("No holes", s + ".svg")], "flat"))
for s in stems(r"^generated/xacto-tang-v2/pick-"):
    if "__hole-" in s:
        continue
    hs = s + "__hole-2.2.svg"
    orig.append(styled(s, pretty(re.sub(r"-xacto-v2.*", "", s.rsplit("/", 1)[1])),
                       [fmt_row("Plain", s + ".svg")] + ([fmt_row("Tang hole", hs)] if (ROOT / hs).exists() else []), "xacto"))
T[("picks", "Originals")] = orig


def tension_name(s):
    n = s.rsplit("/", 1)[1]
    tips = re.search(r"tip-([\d.]+)(?:-([\d.]+))?", n)
    t = (f"tips {tips.group(1)} / {tips.group(2)} mm" if tips and tips.group(2) else f"tip {tips.group(1)} mm") if tips else ""
    kinds = [("TOK-STRAIGHT-BEND-SERRATED", "TOK straight, serrated (bend)"), ("TOK-STRAIGHT-BEND", "TOK straight (bend)"),
             ("BOK-STRAIGHT-BEND", "BOK straight (bend)"), ("TOK-C", "TOK U-bar, both ends up"), ("TOK-L-SINGLE", "TOK single-ended"),
             ("TOK-Z", "TOK Z-bar, short + recessed"), ("BOK-L", "BOK L-wrench"), ("ADV__flex-gauge", "Flex-gauge tensioner"),
             ("ADV__curved", "Curved finger-pad TOK"), ("ADV__Z-bar", "TOK + BOK combo"), ("ADV__tension-card", "Tension card 85 × 54")]
    kinds += [("ADV__multi-arm", "Multi-arm wrench"), ("ADV__tension-wheel", "Tension wheel Ø40"), ("ADV__comb-bar", "Comb bar (tension + comb)")]
    k = next((v for key, v in kinds if n.startswith(key)), pretty(n.replace("ADV__", "").split("__")[0]))
    if n.startswith("ADV__comb-bar"):
        lk, pins = re.match(r"([a-z]+)-(\d+)-pin", n.split("comb-bar-")[1]).groups()
        k += f" · {lk.capitalize()} {pins}-pin"
        t = ""
    return f"{k} · {t}" if t else k


tt = stems(r"^generated/tension-tools-v2/")
T[("tension", "Fits a hacksaw blade")] = [custom_link(laser_card(s, tension_name(s)), tension_custom(s)) for s in tt if checks[s].get("fits_hacksaw_12.7mm")]
T[("tension", "Wider sheet")] = [custom_link(laser_card(s, tension_name(s)), tension_custom(s)) for s in tt
                                 if not checks[s].get("fits_hacksaw_12.7mm") and "/ADV__" not in s]
T[("tension", "Advanced")] = [laser_card(s, tension_name(s)) for s in tt if "/ADV__" in s]

# Handles
dh = "generated/diy-handle/"
if exists(dh + "DIY-HANDLE__drawing-preview.png"):
    T[("handles", "DIY bar handle")] = [file_card("Grub-screw bar handle (Ø10 bar, M3) — takes every X-Acto-tang pick", dh + "DIY-HANDLE__drawing-preview.png",
                                                  "Hand tools or lathe · print at 100 %",
                                                  [("Drawing + marking wrap PDF", dh + "DIY-HANDLE__drawing-and-marking-wrap__A4.pdf"),
                                                   ("End disc SVG", dh + "DIY-HANDLE__end-marking-disc.svg"), ("End disc DXF", dh + "DIY-HANDLE__end-marking-disc.dxf")])]
# Fit tests
fit = ([laser_card(s, "Laser / printer scale check · must measure 50 × 20 mm") for s in stems(r"^generated/calibration/")]
       + [laser_card(s, "X-Acto tang " + re.search(r"tang-([\d.]+)", s).group(1) + " mm · " + re.search(r"(\d+)-holes", s).group(1) + " hole(s)")
          for s in stems(r"^generated/xacto-tang-v2/fit-tests/FIT-TEST")])
T[("fit", "Cut these first")] = fit
# Blade layouts: holes / no-holes pairs share one card (labelled rows); spine-edge layouts have their own chips
LAY = json.loads((ROOT / "generated/hacksaw-blade-layouts/layouts.json").read_text(encoding="utf-8"))["layouts"]
SETNAME = [("jig", "", "Jig"), ("own-picks-xacto", "", "Picks · X-Acto"), ("own-picks-full-handle", "", "Picks · flat, centred"),
           ("own-picks-full-handle", "spine", "Picks · flat, on the blade edge"), ("own-picks-xacto-flat-edge", "spine", "Picks · X-Acto, on the blade edge"), ("tension-tools-v2", "", "Tension tools"),
           ("xacto-v2-picks", "", "Originals · X-Acto"), ("original-picks", "", "Originals · centred"),
           ("original-picks", "spine", "Originals · on the blade edge")]
NOTE_SPINE = "Each handle's straight edge sits on the blade's smooth back edge: that side is already cut. Teeth side down."
for key, mode, label in SETNAME:
    cards = []
    for l in LAY:
        parts = l["set"].split("__")
        if parts[0] != key or "with-holes" in parts or ("spine" in parts) != (mode == "spine"):
            continue
        stem = l["files"][0][:-4]
        nm = ("Blade jig · cut once from 3 mm sheet" if key == "jig" else
              f"Blade {l['sheet']:02d} · " + ", ".join(pretty(re.sub(r"(-xacto-v2|__xacto|__full-handle|__tip.*|__short.*)$", "", o)) for o in l["outlines"]))
        if "no-holes" in parts:
            twin = stem.replace("__no-holes__", "__with-holes__")
            c = styled(stem, nm, [fmt_row("No holes", stem + ".svg")] + ([fmt_row("Holes", twin + ".svg")] if (ROOT / (twin + ".svg")).exists() else []), None)
        else:
            c = laser_card(stem, nm)
        if mode == "spine":
            c["note"] = NOTE_SPINE
        elif l.get("ends_use_blade_pin_holes"):
            c["note"] = "End picks sit flush at the blade ends: the blade's pin hole becomes a lanyard hole."
        cards.append(c)
    T[("blade", label)] = cards
# Print
pdfs = sorted((ROOT / "generated/print-sheets").glob("*.pdf")) if exists("generated/print-sheets") else []
T[("print", "A4 sheets")] = [file_card(pretty(p.stem.split("__")[0]), "", "A4 · print at 100 % / Actual size",
                                       [("PDF", p.relative_to(ROOT).as_posix())]) for p in pdfs]

TABS = [("picks", "Picks", "Every design comes as a flat handle with or without two Ø3.40 screw holes at 15 / 50 mm (for bolting on handle scales), "
                           "and on the X-Acto / DIY-bar tang. The outline is the same for any steel thickness."),
        ("tension", "Tension", "Sized from the lock: the short end (4.7 mm) stops in front of pin 1, the long end (10.7 mm) is for recessed plugs. "
                               "Only bars with both legs on the same side (or a single leg) fit a 12.7 mm blade. Blue lines are bend lines."),
        ("handles", "Handles", "The DIY bar handle takes every X-Acto-tang pick."),
        ("fit", "Fit tests", "Cut or print these before a full set. X-Acto tangs: hole count = position in the series; use the widest that clamps without forcing."),
        ("blade", "Blade layouts", "One file per 12.7 × 315 mm hacksaw blade, parts evenly spaced with at least 6 mm between them to saw apart. "
                                   "Cut the jig once, leave it on the bed, drop a blade in, run a layout at the same origin. Blue = blade outline, do not output."),
        ("print", "Print", "No laser? Print these at 100 % (Actual size) on any printer, check the 100 mm bar, cut out, glue to the steel and file to the line."),
        ("custom", "Customise", "")]


def card_html(c):
    badge = "" if c["fit"] is None else ('<span class="ok">fits blade</span>' if c["fit"] else '<span class="no">needs wider sheet</span>')
    if c.get("rows"):
        links = "".join(f'<div class="dl"><span class="rl">{esc(lab)}</span>' + "".join(f'<a download href="{esc(h)}">{esc(f)}</a>' for f, h in ls) + "</div>"
                        for lab, ls in c["rows"])
    else:
        links = '<div class="dl">' + "".join(f'<a download href="{esc(h)}">{esc(l)}</a>' for l, h in c["links"]) + "</div>"
    q = esc((c["name"] + " " + " ".join(h for _, h in c["links"])).lower())
    img = (f'<button class="img" data-big="{esc(c["thumb"])}" aria-label="Enlarge {esc(c["name"])}"><img loading="lazy" src="{esc(c["thumb"])}" alt=""></button>'
           if c["thumb"] else "")
    if c.get("custom"):   # opens the Customise tab with this design loaded (shareable link)
        links += f'<div class="dl"><a class="cust" href="#custom?{esc(c["custom"])}" data-ck="{esc(c["custom"])}">Customise this</a></div>'
    note = f'<p class="note">{esc(c["note"])}</p>' if c.get("note") else ""
    st = f' data-style="{c["style"]}"' if c.get("style") else ""
    return f'<article data-q="{q}"{st}>{img}<h3>{esc(c["name"])}</h3><p>{esc(c["size"])} {badge}</p>{note}<div class="dls">{links}</div></article>'

CUSTOM = """<div class="custom"><form id="ck-form" onsubmit="return false"></form><div class="ck-out"><div id="ck-view"></div>
<p id="ck-warn"></p><p id="ck-info"></p><div class="dl"><a id="ck-svg" href="#">Download SVG</a><a id="ck-dxf" href="#">Download DXF</a><a id="ck-print" href="#">Print 1:1</a></div>
<p class="note">Built in your browser: mm 1:1, no kerf. Cut a test piece first; custom shapes are only checked for size.</p></div></div>"""
sections, tabs = [], []
for key, title, intro in TABS:
    if key == "custom":
        if exists("site/customizer.js"):
            tabs.append('<button data-tab="custom">Customise</button>')
            sections.append('<section id="sec-custom" hidden><p class="intro">Design your own pick or tension bar, then download the cut file. '
                            'Start from a preset, or press "Customise this" on any design in the Picks or Tension tabs to start from that one. '
                            'Every value can be changed; ↺ puts a field back to the design you started from.</p>' + CUSTOM + '</section>')
        continue
    groups = [(chip, cards) for (k, chip), cards in T.items() if k == key and cards]
    if not groups:
        continue
    n = sum(sum(1 for x in c if x.get("style") != "xacto") for _, c in groups)
    tabs.append(f'<button data-tab="{key}">{esc(title)} <small>{n}</small></button>')
    count = lambda cards: sum(1 for c in cards if c.get("style") != "xacto")
    chips = "".join(f'<button data-chip="{i}">{esc(chip)} <small>{count(cards)}</small></button>' for i, (chip, cards) in enumerate(groups))
    switch = ('<div class="switch" role="group" aria-label="Handle style"><button data-style="flat" class="on">Flat handle</button>'
              '<button data-style="xacto">X-Acto / DIY-bar tang</button></div>') if key == "picks" else ""
    body = "".join(f'<div class="group" data-group="{i}"><div class="grid">{"".join(card_html(c) for c in cards)}</div></div>'
                   for i, (_, cards) in enumerate(groups))
    sections.append(f'<section id="sec-{key}" data-style="flat" hidden><p class="intro">{esc(intro)}</p>{switch}<div class="chips">{chips}</div>{body}</section>')

CSS = """
*{box-sizing:border-box} html{color-scheme:dark} body{margin:0;font:15px/1.45 system-ui,sans-serif;color:#e8ecef;background:#0d1114}
header{position:sticky;top:0;z-index:2;background:#12171b;border-bottom:1px solid #243038;padding:14px 24px 0}
.top{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px} h1{font-size:19px;margin:0}
.top input{flex:1;min-width:200px;max-width:360px;padding:7px 11px;font:inherit;color:inherit;background:#0d1114;border:1px solid #33424c;border-radius:8px}
nav{display:flex;gap:4px;margin-top:10px;overflow-x:auto}
nav button{font:inherit;border:0;background:none;padding:9px 14px;border-bottom:3px solid transparent;cursor:pointer;color:#9aa7b0;white-space:nowrap}
nav button.on{color:#fff;border-color:#ff5a5a;font-weight:600} small{color:#6f7d87;font-weight:400}
main{max-width:1240px;margin:0 auto;padding:18px 24px 60px} .intro{color:#a9b5bd;margin:0 0 12px;max-width:920px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.chips button{font:inherit;font-size:14px;color:#cfd8de;border:1px solid #33424c;background:#151b20;border-radius:99px;padding:5px 13px;cursor:pointer}
.chips button.on{background:#ff5a5a;color:#0d1114;border-color:#ff5a5a;font-weight:600} .chips button.on small{color:#4a1214}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
article{background:#151b20;border:1px solid #243038;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:4px}
.img{height:84px;display:flex;align-items:center;justify-content:center;background:#0f1418;border:0;border-radius:6px;cursor:zoom-in;padding:3px}
.img img{max-width:100%;max-height:78px} h3{font-size:14.5px;margin:6px 0 0} article p{margin:0;font-size:13px;color:#9aa7b0}
.note{font-size:12px!important;color:#7d8b95!important} .ok{color:#6fd08c} .no{color:#ff8a8a}
.dl{display:flex;flex-wrap:wrap;gap:5px;margin-top:auto;padding-top:6px}
.dl a{font-size:13px;font-weight:600;padding:3px 10px;border:1px solid #ff5a5a;border-radius:6px;background:#ff5a5a;color:#0d1114;text-decoration:none}
.dl a:hover{background:#ff8080;border-color:#ff8080}
.dl a.cust{background:none;color:#ff8080} .dl a.cust:hover{background:#2a1416;color:#ffb0b0}
.dls{display:flex;flex-direction:column;gap:5px;margin-top:auto;padding-top:6px} .dls .dl{margin:0;padding:0;align-items:center}
.rl{min-width:74px;font-size:12px;color:#9aa7b0}
.switch{display:inline-flex;border:1px solid #33424c;border-radius:9px;overflow:hidden;margin:0 0 12px}
.switch button{font:inherit;font-size:14px;color:#cfd8de;background:#151b20;border:0;padding:6px 14px;cursor:pointer}
.switch button.on{background:#ff5a5a;color:#0d1114;font-weight:600}
section[data-style=flat] article[data-style=xacto],section[data-style=xacto] article[data-style=flat]{display:none}
footer{max-width:1240px;margin:0 auto;padding:0 24px 30px;color:#7d8b95;font-size:13px}
body.searching .chips,body.searching .intro{display:none}
dialog{border:1px solid #243038;border-radius:12px;padding:16px;width:min(1200px,96vw);max-height:92vh;background:#151b20;color:inherit}
dialog::backdrop{background:#000c} dialog img{width:100%;max-height:72vh;object-fit:contain;background:#0f1418;border-radius:8px}
dialog .bar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px} dialog h3{margin:0}
dialog button.x{font:inherit;font-weight:600;color:#0d1114;border:1px solid #ff5a5a;background:#ff5a5a;border-radius:8px;padding:4px 12px;cursor:pointer}
.custom{display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:18px;align-items:start} @media(max-width:800px){.custom{grid-template-columns:1fr}.ck-out{order:-1}}
#ck-form{display:flex;flex-direction:column;gap:6px;background:#151b20;border:1px solid #243038;border-radius:10px;padding:14px}
#ck-form [hidden]{display:none!important}
.ck-bar{display:flex;flex-direction:column;gap:10px;padding-bottom:10px;border-bottom:1px solid #243038}
.ck-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;font-size:13px;color:#a9b5bd} .ck-actions label{white-space:nowrap} .ck-actions #ck-reset{margin-left:auto}
#ck-form fieldset{border:0;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:8px;min-width:0}
#ck-form legend{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6f7d87;padding:0;margin-bottom:6px}
#ck-form .f{display:flex;flex-direction:column;gap:3px;font-size:13px;color:#a9b5bd}
#ck-form .f.chk{flex-direction:row;align-items:center;gap:8px}
#ck-form .f{position:relative} #ck-form .f .rs{position:absolute;right:0;top:-3px;font:13px system-ui;line-height:1;color:#0d1114;background:#ff5a5a;border:1px solid #ff5a5a;border-radius:5px;padding:2px 6px;cursor:pointer}
#ck-form .f .rs:hover{background:#ff8080;border-color:#ff8080} #ck-form .f.chk{padding-right:30px}
#ck-form .f:not(.chk)>.t{padding-right:34px}   /* label text wraps before the reset button */
#ck-form .row{display:flex;align-items:center;gap:8px}
#ck-form .row input[type=range]{flex:1;min-width:0;accent-color:#ff5a5a}
#ck-form .row input[type=number]{width:72px;flex:none}
#ck-form .u{color:#6f7d87;font-size:12px;width:26px;flex:none}
#ck-form input,#ck-form select{font:inherit;color:inherit;background:#0d1114;padding:5px 8px;border:1px solid #33424c;border-radius:6px}
#ck-form input[type=range]{padding:0;border:0;background:none}
#ck-form input[type=checkbox]{padding:0}
#ck-form button{font:inherit;font-size:13px;font-weight:600;color:#0d1114;background:#ff5a5a;border:1px solid #ff5a5a;border-radius:6px;padding:3px 12px;cursor:pointer}
#ck-form button:hover{background:#ff8080;border-color:#ff8080}
#ck-canvas{width:100%;height:auto;aspect-ratio:500/120;border:1px solid #33424c;border-radius:6px;cursor:crosshair;touch-action:none}
.ck-draw-btns{display:flex;gap:6px}
#ck-warn{color:#ffb454;font-size:13px;margin:8px 0 0} #ck-warn:empty{display:none}
.ck-out{background:#151b20;border:1px solid #243038;border-radius:10px;padding:14px;position:sticky;top:calc(var(--hdr,112px) + 10px);z-index:1;max-height:calc(100vh - var(--hdr,112px) - 20px);overflow:auto}
#ck-view svg{width:100%;height:auto;max-height:320px;background:#0f1418;border-radius:6px}
"""
JS = """
const $=s=>document.querySelectorAll(s);
const setHdr=()=>document.documentElement.style.setProperty('--hdr',document.querySelector('header').offsetHeight+'px');setHdr();addEventListener('resize',setHdr);
function tab(k){$('nav button').forEach(b=>b.classList.toggle('on',b.dataset.tab===k));$('main section').forEach(s=>s.hidden=s.id!=='sec-'+k);
 const sec=document.getElementById('sec-'+k);if(sec&&sec.querySelector('.chips')&&!sec.querySelector('.chips .on'))chip(sec,0);if(location.hash.slice(1).split('?')[0]!==k)history.replaceState(null,'','#'+k)}
function chip(sec,i){sec.querySelectorAll('.chips button').forEach(b=>b.classList.toggle('on',+b.dataset.chip===+i));
 sec.querySelectorAll('.group').forEach(g=>g.hidden=+g.dataset.group!==+i)}
$('nav button').forEach(b=>b.onclick=()=>{q.value='';q.oninput();tab(b.dataset.tab)});
$('.chips button').forEach(b=>b.onclick=()=>chip(b.closest('section'),b.dataset.chip));
$('.switch button').forEach(b=>b.onclick=()=>{const sec=b.closest('section');sec.dataset.style=b.dataset.style;
 sec.querySelectorAll('.switch button').forEach(x=>x.classList.toggle('on',x===b))});
$('button.img').forEach(b=>b.onclick=()=>{const a=b.closest('article');document.getElementById('big-t').textContent=a.querySelector('h3').textContent;
 document.getElementById('big-i').src=b.dataset.big;document.getElementById('big-d').innerHTML=a.querySelector('.dls').innerHTML;big.showModal()});
big.onclick=e=>{if(e.target===big)big.close()};
document.addEventListener('click',e=>{const a=e.target.closest('a.cust');if(!a||!window.ckLoad)return;e.preventDefault();
 if(big.open)big.close();q.value='';q.oninput();history.replaceState(null,'','#custom?'+a.dataset.ck);window.ckLoad(a.dataset.ck);tab('custom');scrollTo(0,0)});
q.oninput=()=>{const v=q.value.toLowerCase().trim();document.body.classList.toggle('searching',!!v);
 if(!v){const k=(document.querySelector('nav .on')||{dataset:{}}).dataset.tab||'picks';$('main section').forEach(s=>s.hidden=s.id!=='sec-'+k);
  $('main section').forEach(s=>{if(s.querySelector('.chips'))chip(s,(s.querySelector('.chips .on')||{dataset:{chip:0}}).dataset.chip)});$('article').forEach(a=>a.hidden=false);return}
 $('main section').forEach(s=>s.hidden=s.id==='sec-custom');$('.group').forEach(g=>g.hidden=false);
 $('article').forEach(a=>a.hidden=!a.dataset.q.includes(v))};
const p=new URLSearchParams(location.search),h=location.hash.slice(1).split('?')[0];
const legacy={corbeau:'picks',knife:'picks',tension:'tension'}[p.get('family')]||({wood:'handles',cases:'handles'}[p.get('view')]||p.get('view'));
const start=document.getElementById('sec-'+h)?h:(legacy&&document.getElementById('sec-'+legacy)?legacy:'picks');
$('main section').forEach(s=>{if(s.querySelector('.chips'))chip(s,0)});tab(start);
"""
page = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="color-scheme" content="dark"><title>Lockpick fabrication library</title><style>' + CSS + '</style></head><body>'
        '<header><div class="top"><h1>Lockpick fabrication library</h1><input id="q" type="search" placeholder="Search everything, e.g. wafer, hook, comb, U-bar"></div>'
        '<nav>' + "".join(tabs) + '</nav></header><main>' + "".join(sections) + '</main>'
        '<dialog id="big"><div class="bar"><h3 id="big-t"></h3><button class="x" onclick="big.close()">Close ✕</button></div><img id="big-i" alt=""><div class="dls" id="big-d"></div></dialog>'
        '<footer>All laser files: millimetres, import at 100 % (never “fit to bed”), no kerf offset. Red / layer CUT = cut. Blue / layer REFERENCE-DO-NOT-CUT = guide only. '
        'Cut or print the fit tests first. Only use these tools on locks you own or have permission to pick.</footer>'
        + ('<script src="site/customizer.js"></script>' if exists("site/customizer.js") else "") + '<script>' + JS + '</script></body></html>')
(ROOT / ARGS.page).write_text(page, encoding="utf-8")
for old in [p for p in THUMBS.glob("*.svg") if p.name not in MADE]:
    old.unlink()
if ARGS.page == "INDEX.html":
    (ROOT / "LASER-FILES.html").write_text('<!doctype html><meta charset="utf-8"><title>Moved</title>'
                                           '<meta http-equiv="refresh" content="0; url=INDEX.html"><a href="INDEX.html">This page moved to INDEX.html</a>',
                                           encoding="utf-8")
print(ARGS.page, sum(len(v) for v in T.values()), "cards")
