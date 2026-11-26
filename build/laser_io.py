"""Shared SVG/DXF writer for the home-workshop generators: mm 1:1, unfilled, closed outlines.
Red / DXF layer CUT = cut. Blue / DXF layer REFERENCE-DO-NOT-CUT = guides only."""
import os, subprocess, sys
from pathlib import Path

# Reproducible output: ezdxf orders some DXF objects by hash, so pin the hash seed (re-run the calling script once with it set)
if os.environ.get("PYTHONHASHSEED") != "0" and getattr(sys.modules.get("__main__"), "__file__", None):
    sys.exit(subprocess.run([sys.executable, sys.modules["__main__"].__file__, *sys.argv[1:]], env={**os.environ, "PYTHONHASHSEED": "0"}).returncode)

import ezdxf

ezdxf.options.write_fixed_meta_data_for_testing = True   # fixed timestamps / GUIDs: regenerating gives identical bytes
from shapely.affinity import translate
from shapely.geometry import LineString

ROOT = Path(__file__).resolve().parents[1]
STROKE = 0.05


def rings_of(p):
    yield list(p.exterior.coords)[:-1]
    for i in p.interiors:
        yield list(i.coords)[:-1]


def path_d(p):
    return " ".join("M " + " L ".join(f"{x:.4f},{y:.4f}" for x, y in r) + " Z" for r in rings_of(p))


def write_pair(stem, items, w=None, h=None, ref=(), title="Cut outline, mm 1:1, no kerf offset"):
    """items: [(id, Polygon)] cut layer (red); ref: [(id, Polygon|LineString)] reference layer (blue)."""
    allg = [g for _, g in items] + [g for _, g in ref]
    w = w or max(g.bounds[2] for g in allg) + 2
    h = h or max(g.bounds[3] for g in allg) + 2
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.4f}mm" height="{h:.4f}mm" viewBox="0 0 {w:.4f} {h:.4f}">',
           f"<title>{title}</title>"]
    for i, g in ref:
        if isinstance(g, LineString):
            d = "M " + " L ".join(f"{x:.4f},{y:.4f}" for x, y in g.coords)
            svg.append(f'<path id="{i}" d="{d}" fill="none" stroke="#0000ff" stroke-width="{STROKE}"/>')
        else:
            svg.append(f'<path id="{i}" d="{path_d(g)}" fill="none" stroke="#0000ff" stroke-width="{STROKE}"/>')
    for i, g in items:
        svg.append(f'<path id="{i}" d="{path_d(g)}" fill="none" stroke="#ff0000" stroke-width="{STROKE}"/>')
    svg.append("</svg>")
    Path(str(stem) + ".svg").write_text("".join(svg), encoding="utf-8")

    doc = ezdxf.new("R2010"); doc.units = 4; doc.header["$INSUNITS"] = 4; doc.header["$MEASUREMENT"] = 1
    doc.layers.new("CUT", dxfattribs={"color": 1})
    if ref:
        doc.layers.new("REFERENCE-DO-NOT-CUT", dxfattribs={"color": 5})
    msp = doc.modelspace()
    for _, g in ref:
        if isinstance(g, LineString):
            msp.add_lwpolyline([(x, -y) for x, y in g.coords], dxfattribs={"layer": "REFERENCE-DO-NOT-CUT"})
        else:
            for r in rings_of(g):
                msp.add_lwpolyline([(x, -y) for x, y in r], close=True, dxfattribs={"layer": "REFERENCE-DO-NOT-CUT"})
    for _, g in items:
        for r in rings_of(g):
            msp.add_lwpolyline([(x, -y) for x, y in r], close=True, dxfattribs={"layer": "CUT"})
    doc.saveas(str(stem) + ".dxf")
    return [Path(str(stem) + e).relative_to(ROOT).as_posix() for e in (".svg", ".dxf")]


def place(p, margin=1.0):
    b = p.bounds
    return translate(p, margin - b[0], margin - b[1])


