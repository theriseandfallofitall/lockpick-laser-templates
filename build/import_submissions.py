#!/usr/bin/env python3
"""Import reviewed community design submissions (opt-in, CC BY 4.0) into generated/community/.

  python build/import_submissions.py

Reads submissions/*.lockpick-design.json. For each one, runs the customiser's own emitter
(node site/customizer.js --emit "<query>" <out-stem>) to write <slug>.svg and <slug>.dxf into
generated/community/<slug>/, then writes generated/community/designs.json and README.md.
Repo-relative. Review each file by hand before putting it in submissions/ (see submissions/README.md).
Run tools/check_laser_files.py and build/build_site.py afterwards.
"""
import json, re, shutil, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUB, OUT = ROOT / "submissions", ROOT / "generated/community"


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "design"


if OUT.exists():   # rebuilt from submissions/ each run, so removing a file withdraws the design
    shutil.rmtree(OUT)
designs, used = [], set()
for f in sorted(SUB.glob("*.lockpick-design.json")):
    d = json.loads(f.read_text(encoding="utf-8"))
    if d.get("format") != "lockpick-design/1" or d.get("licence") != "CC-BY-4.0" or not d.get("title") or not d.get("query"):
        print("skipped (not a lockpick-design/1 CC-BY-4.0 file with title and query):", f.name)
        continue
    s, n = slug(d["title"]), 2
    while s in used:
        s, n = f"{slug(d['title'])}-{n}", n + 1
    used.add(s)
    folder = OUT / s
    folder.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["node", "site/customizer.js", "--emit", d["query"], (folder / s).as_posix()], cwd=ROOT, capture_output=True, text=True)
    files = [f"generated/community/{s}/{s}.svg", f"generated/community/{s}/{s}.dxf"]
    if r.returncode or not all((ROOT / p).exists() for p in files):
        print("failed:", f.name, (r.stderr or r.stdout).strip()[-300:])
        shutil.rmtree(folder, ignore_errors=True)
        continue
    designs.append(dict(title=d["title"], credit=d.get("credit", ""), licence="CC-BY-4.0", tool=d.get("tool", ""),
                        query=d["query"], files=files, notes=d.get("notes", ""), created=d.get("created", "")))
    print("imported", s)

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "designs.json").write_text(json.dumps(designs, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
(OUT / "README.md").write_text(
    "# Community designs\n\nDesigns submitted through the customiser's Submit button, each shared under CC BY 4.0 with the "
    "designer's consent and reviewed before import. Credit and licence are in `designs.json` and on the library page.\n\n"
    "Built by `build/import_submissions.py` from `submissions/`; do not edit by hand. Cut a test piece first.\n\n"
    + "".join(f"- {d['title']}" + (f" by {d['credit']}" if d["credit"] else "") + "\n" for d in designs), encoding="utf-8")
print(len(designs), "designs")
