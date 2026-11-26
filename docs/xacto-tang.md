# X-Acto tang review (2026-11-26)

## Verdict

An earlier tang (6.20 × 12 mm, thinned to 0.40 mm) is **too wide**. It was a guess, never measured, and in practice the sides had to be ground down before it would go into the handle. The current tang is in the `generated/xacto-tang-v2/` files.

## Evidence

| Dimension | Value | Source | Confidence |
|---|---|---|---|
| No.11 blade thickness | 0.51 mm (0.020") nominal; catalogue 0.53 mm (0.021") | McMaster, EIS, Stanley; a No. 11 blade reference | medium |
| No.11 blade height | 8.7–9.5 mm | Zoro, McMaster, razorbladeco | medium |
| "Shank width" | 6.35 mm (0.25") nominal; 5.8 mm (0.23") for the titanium No.11 | McMaster | medium-low: catalogue rounding |
| Collet slot width / depth | not published anywhere found | — | none |
| Field result | 6.20 mm had to be ground narrower | user | high |

## v2 defaults (`build/generate_home_workshop.py`)

| | v1 | v2 | Why |
|---|---|---|---|
| Tang width | 6.20 | **5.80** | 6.20 did not fit; 5.80 = titanium-blade shank figure |
| Insertion length | 12.0 | **10.0** | shorter than a No.11 shank sits; the shoulder still stops it |
| Tang thickness | thin everything to 0.40 | **no thinning for 0.40 / 0.50 stock** | a No.11 blade is ~0.51 mm, so the collet already clamps 0.50 |
| 0.60–0.65 mm hacksaw steel | thin to 0.40 (0.10 per face) | lap tang to ~0.50 (0.05–0.08 per face) | less grinding, less risk to temper |
| Shoulders | 10 × 2 mm | unchanged | stop sits on the collet nose; 10 mm still fits a 12.7 mm blade |

## Confirm on your own handle

1. Measure the tang you already ground to fit, across the flats, with calipers. That is your real width.
2. If it is not 5.80, regenerate everything: `python build/generate_home_workshop.py --tang-width <width>`.
3. Or cut the fit-test series in `generated/xacto-tang-v2/fit-tests/` (5.40–6.00 mm; hole count = position, 1 hole = narrowest) and use the widest one that clamps firmly without forcing.
4. #2 and #5 handles use different collets; test them separately.
