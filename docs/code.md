# Code map

| File | Does |
|---|---|
| `build/laser_io.py` | Shared SVG/DXF writer: mm 1:1, unfilled closed outlines, CUT and REFERENCE-DO-NOT-CUT layers |
| `build/pick_shapes.py` | Pick tip shapes shared by the generators and matched by the customiser: bent-strip hooks and rakes, half-diamonds, combs (`docs/pick-profiles.md`) |
| `build/generate_tension_tools.py` | Tension tools sized from lock geometry (`--first-pin`, `--recess`) → `generated/tension-tools-v2/` |
| `build/generate_home_workshop.py` | Picks (flat handle with / without holes, X-Acto tang), fit tests, hacksaw-blade layouts and jig (`--tang-width`, `--blade-width`, `--gap`) |
| `build/generate_diy_handle.py` | DIY grub-screw bar handle drawing, marking wrap and end disc → `generated/diy-handle/` |
| `build/build_print_sheets.py` | A4 print sheets → `generated/print-sheets/`, plus one PDF per design beside its SVG/DXF (long parts tiled across A4) |
| `build/build_site.py` | The site page (`--page index.html`) and its thumbnails in `previews/laser-index/`. Adds a "Customise this" link to every design the customiser can draw |
| `build/import_submissions.py` | Imports reviewed community submissions into generated/community/ (created on first import) via `node site/customizer.js --emit`; the page then shows a Community tab |
| `site/trace-image.js`, `site/freehand.js`, `site/submit.js` | Customiser add-ons: image tracing, the freehand / image-trace outline editor; the Submit dialog (downloads the design JSON, opens a prefilled GitHub issue) |
| `tools/check_laser_files.py` | Every SVG/DXF: mm units, closed outlines, SVG = DXF, fits a hacksaw blade → `validation/LASER-FILE-CHECKS.json` |
| `site/customizer.js` | In-browser customiser. `node site/customizer.js --selftest <dir>` writes samples for the checker |
