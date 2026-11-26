#!/usr/bin/env python3
"""Check every manufacturing SVG/DXF in the repo for laser-cutter correctness.

Per file:
  SVG  - width/height carry "mm", viewBox matches width/height (1 unit = 1 mm),
         outlines are unfilled, every path is closed, no <text>/<image> in cut files.
  DXF  - $INSUNITS = 4 (mm), every LWPOLYLINE/POLYLINE is closed, entity types used.
  Pair - SVG and DXF with the same stem describe the same shapes
         (bounding boxes and filled area agree within tolerance).
  Stock - outline height (Y extent) vs common hacksaw-blade widths.

Writes validation/LASER-FILE-CHECKS.json and prints a summary.
Requires: ezdxf, shapely, svgpathtools (pip install svgpathtools).

Usage: python tools/check_laser_files.py [--all]   (--all includes archive/history folders)
"""
import json, re, subprocess, sys
from pathlib import Path
import xml.etree.ElementTree as ET

import ezdxf
from shapely.geometry import Polygon
from shapely.ops import unary_union
from svgpathtools import parse_path

ROOT = Path(__file__).resolve().parents[1]
HISTORY = ("previews/laser-index/", "archive/", "redraw-review/", "handle-concepts/", "clip-together-handles-v3/",
           "previews/", "dimensioned-reference-drawings/", "exports/generated/",
           "sources/", "generated/tension-bars/",
           "generated/tension-smooth-current/", "generated/tension-controlled-curves/")
# Reference plans, not cut files (they intentionally contain notes / multiple views).
REFERENCE_ONLY = ("clip-together-handles-v4/",)
NS = "{http://www.w3.org/2000/svg}"
AREA_TOL = 0.005   # relative
BBOX_TOL = 0.02    # mm
HACKSAW_USABLE = 11.5  # mm: 12.7 mm blade minus tooth row; 12 mm blades leave ~10.5


def mm(v):
    m = re.fullmatch(r"\s*([0-9.]+)\s*(mm)?\s*", v or "")
    return (float(m.group(1)), bool(m.group(2))) if m else (None, False)


def svg_rings(path):
    issues, rings = [], []
    root = ET.parse(path).getroot()
    w, wmm = mm(root.get("width")); h, hmm = mm(root.get("height"))
    if not (wmm and hmm):
        issues.append("width/height not in mm")
    vb = [float(x) for x in re.split(r"[ ,]+", root.get("viewBox", "").strip())] if root.get("viewBox") else None
    if not vb:
        issues.append("no viewBox (imports at the wrong scale)")
    elif w and h and (abs(vb[2] - w) > 1e-3 or abs(vb[3] - h) > 1e-3):
        issues.append(f"viewBox {vb[2:]} != width/height {w},{h} (scale not 1 unit = 1 mm)")
    for tag in ("text", "image"):
        if root.iter(NS + tag) and any(True for _ in root.iter(NS + tag)):
            issues.append(f"contains <{tag}> (would be cut/engraved)")
    for el in root.iter():
        if el.tag in (NS + "g",) and el.get("transform"):
            issues.append("group transform present")
            break
    for el in root.iter(NS + "path"):
        style = (el.get("style") or "") + ";fill:" + (el.get("fill") or "")
        if re.search(r"fill:\s*(#|rgb|red|black)", style) and "fill:none" not in style.replace(" ", ""):
            issues.append("filled path")
        elif "fill:none" not in style.replace(" ", ""):
            issues.append("path has no fill=none (renders filled black)")
        if el.get("transform"):
            issues.append("path transform present")
        d = el.get("d", "")
        is_ref = (el.get("stroke") or "").lower() == "#0000ff"   # reference/guide layer: open bend lines allowed
        for sub in re.split(r"(?=[Mm])", d.strip()):
            if not sub.strip():
                continue
            p = parse_path(sub)
            if len(p) == 0:
                continue
            closed = sub.strip().rstrip().endswith(("Z", "z")) or abs(p.start - p.end) < 1e-6
            if not closed and not is_ref:
                issues.append("open sub-path")
            if not closed:
                continue
            pts = []
            for seg in p:
                n = 1 if type(seg).__name__ == "Line" else 24
                for i in range(n):
                    z = seg.point(i / n); pts.append((z.real, z.imag))
            if len(pts) >= 3:
                rings.append(pts)
    for tag in ("rect", "circle", "polygon", "polyline", "ellipse"):
        for el in root.iter(NS + tag):
            if tag == "circle":
                import math
                cx, cy, r = (float(el.get(k)) for k in ("cx", "cy", "r"))
                rings.append([(cx + r * math.cos(t * math.pi / 48), cy + r * math.sin(t * math.pi / 48)) for t in range(96)])
            elif tag == "rect":
                x, y = float(el.get("x", 0)), float(el.get("y", 0))
                ww, hh = float(el.get("width")), float(el.get("height"))
                rings.append([(x, y), (x + ww, y), (x + ww, y + hh), (x, y + hh)])
            else:
                issues.append(f"<{tag}> element")
    return sorted(set(issues)), rings


def dxf_rings(path):
    issues, rings, types = [], [], {}
    doc = ezdxf.readfile(path)
    if doc.header.get("$INSUNITS") != 4:
        issues.append(f"$INSUNITS={doc.header.get('$INSUNITS')} (not mm)")
    for e in doc.modelspace():
        t = e.dxftype(); types[t] = types.get(t, 0) + 1
        if t == "LWPOLYLINE":
            if not e.closed and e.dxf.layer.startswith("REFERENCE"):
                continue   # open guide line (bend line) on the do-not-cut layer
            if not e.closed:
                pts = list(e.get_points("xy"))
                if not pts or (abs(pts[0][0] - pts[-1][0]) > 1e-6 or abs(pts[0][1] - pts[-1][1]) > 1e-6):
                    issues.append("open LWPOLYLINE")
            pts = [(x, y) for x, y in e.get_points("xy")]
            if any(abs(b) > 1e-9 for b in e.get_points("b") for b in [b[0]] if False):
                pass
            if any(v[4] for v in e.get_points("xyseb")):
                issues.append("LWPOLYLINE with bulges (arcs) - area compare approximate")
            rings.append(pts)
        elif t == "POLYLINE":   # R12-style (the browser customiser writes these)
            if not e.is_closed:
                issues.append("open POLYLINE")
            rings.append([(v.dxf.location.x, v.dxf.location.y) for v in e.vertices])
        elif t == "CIRCLE":
            import math
            c, r = e.dxf.center, e.dxf.radius
            rings.append([(c.x + r * math.cos(k * math.pi / 48), c.y + r * math.sin(k * math.pi / 48)) for k in range(96)])
        elif t in ("TEXT", "MTEXT", "DIMENSION"):
            issues.append(f"{t} entity in cut file")
        elif t in ("LINE", "ARC", "SPLINE"):
            issues.append(f"loose {t} entities (may not form closed cut)")
    return sorted(set(issues)), rings, types


def area_of(rings):
    """Even-odd area: outer outlines minus holes."""
    polys = [Polygon(r).buffer(0) for r in rings if len(r) >= 3]
    polys = [p for p in polys if not p.is_empty]
    if not polys:
        return None, None
    # even-odd: a ring contained in an odd number of others is a hole
    total = 0.0
    for i, p in enumerate(polys):
        depth = sum(1 for j, q in enumerate(polys) if i != j and q.contains(p.representative_point()) and q.area > p.area)
        total += -p.area if depth % 2 else p.area
    b = unary_union(polys).bounds
    return total, (b[2] - b[0], b[3] - b[1])


def main():
    include_all = "--all" in sys.argv
    r = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard", "*.svg", "*.dxf"], cwd=ROOT, capture_output=True, text=True)
    files = r.stdout.split() if r.returncode == 0 else         sorted(p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*") if p.suffix in (".svg", ".dxf") and ".git" not in p.parts)
    files = [f for f in files if (ROOT / f).exists()]   # tracked files a generator just removed
    if not include_all:
        files = [f for f in files if not f.startswith(HISTORY)]
    stems = {}
    for f in files:
        stems.setdefault(f.rsplit(".", 1)[0], {})[f.rsplit(".", 1)[1]] = f
    results, fails = [], 0
    for stem, pair in sorted(stems.items()):
        rec = {"stem": stem, "issues": []}
        ref_only = stem.startswith(REFERENCE_ONLY)
        sa = da = None
        if "svg" in pair:
            iss, rings = svg_rings(ROOT / pair["svg"])
            rec["issues"] += ["svg: " + i for i in iss]
            sa, sb = area_of(rings)
            rec["svg_bbox_mm"] = [round(v, 3) for v in sb] if sb else None
        if "dxf" in pair:
            iss, rings, types = dxf_rings(ROOT / pair["dxf"])
            rec["issues"] += ["dxf: " + i for i in iss]
            rec["dxf_entities"] = types
            da, db = area_of(rings)
            rec["dxf_bbox_mm"] = [round(v, 3) for v in db] if db else None
        else:
            rec["issues"].append("no matching DXF")
        if sa and da:
            rec["area_mm2"] = round(da, 3)
            if abs(sa - da) / max(abs(da), 1e-9) > AREA_TOL:
                rec["issues"].append(f"pair: area differs svg {sa:.3f} vs dxf {da:.3f}")
            if rec.get("svg_bbox_mm") and rec.get("dxf_bbox_mm") and any(
                    abs(a - b) > BBOX_TOL for a, b in zip(rec["svg_bbox_mm"], rec["dxf_bbox_mm"])):
                rec["issues"].append("pair: bounding boxes differ")
        bb = rec.get("dxf_bbox_mm") or rec.get("svg_bbox_mm")
        if bb and not any(k in stem for k in ("sheet", "ALL-", "hacksaw-blade-layouts/", "COUPON", "calibration", "clip-together", "wooden-grip-scales/")):
            rec["fits_hacksaw_12.7mm"] = min(bb) <= HACKSAW_USABLE
        if ref_only:
            rec["reference_plan_only"] = True
            rec["issues"] = [i for i in rec["issues"] if "<text>" not in i and "TEXT" not in i]
        if rec["issues"]:
            fails += 1
        results.append(rec)
    out = ROOT / "validation" / "LASER-FILE-CHECKS.json"
    out.parent.mkdir(exist_ok=True)
    summary = {
        "checked_stems": len(results), "with_issues": fails,
        "issue_counts": {},
        "too_wide_for_hacksaw": sorted(r["stem"] for r in results if r.get("fits_hacksaw_12.7mm") is False),
    }
    for r in results:
        for i in r["issues"]:
            k = re.sub(r"[0-9.]+", "#", i)
            summary["issue_counts"][k] = summary["issue_counts"].get(k, 0) + 1
    out.write_text(json.dumps({"summary": summary, "files": results}, indent=1))
    print(json.dumps({k: v for k, v in summary.items() if k != "too_wide_for_hacksaw"}, indent=1))
    print("too wide for a 12.7 mm hacksaw blade:", len(summary["too_wide_for_hacksaw"]))
    for r in [r for r in results if r["issues"]][:40]:
        print("FAIL", r["stem"], "; ".join(r["issues"]))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
