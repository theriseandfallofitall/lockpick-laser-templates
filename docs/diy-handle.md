# DIY grub-screw handle (replaces the X-Acto handle)

A handle that takes every X-Acto-tang pick and can be made with hand tools. The drawing and a paper marking wrap are in `generated/diy-handle/` (print at 100 %). The generator is `build/generate_diy_handle.py` (`--bar`, `--length`, `--slot-depth`, `--screw-x`).

The tang hole position matches the screw position (`--screw-x` here, `--tang-hole-x` in `build/generate_home_workshop.py`, both 5 mm by default). Shoulder thickness and width can be changed with `--shoulder-length` and `--shoulder-width`, or in the site's Customise tab.

For two screws, make the tang longer (about 14 mm) with holes at 4 and 10 mm in the customiser. Then run `python build/generate_diy_handle.py --screw-x 4 --screw2-x 10`; the slot is deepened to match.

## Why a solid bar, not a tube

- A thin-wall tube leaves the 5.80 mm tang loose in a round bore, so it turns. A slot across a solid bar stops it turning.
- A 1 mm tube wall only holds about two M3 threads. Solid bar gives the full thread depth.
- The pick's 10 mm shoulders butt against the 10 mm bar end, so the pick seats at the same depth every time.

## Hand tools

You need a vice, a hacksaw, a drill, a Ø2.5 mm drill bit, an M3 tap and a file.

1. Cut 100 mm of Ø10 aluminium or brass bar. Square and chamfer both ends.
2. Print the drawing PDF at 100 %. Wrap the page-2 strip round one end and mark the slot line and the hole.
3. Hacksaw a slot 12 mm deep across the end, through the centre. One blade kerf (about 0.8 mm) clears a 0.5–0.65 mm tang.
4. Drill Ø2.5 mm at 5 mm from the end, at 90° to the slot, into the slot. Tap the hole M3.
5. Fit an M3 × 5 grub screw. A cup point clamps the flat face of the tang. For a pick that cannot pull out, use the **X-Acto + hole** files (a Ø2.2 hole through the tang, 5 mm in front of the shoulders) and a **cone-point** M3 grub screw, which seats in the hole.
6. Repeat on the other end if you want a double-ended handle.

## Lathe

- Face and chamfer both ends at 0.5 × 45°.
- Knurl the middle 60 mm.
- Part off at 100 mm.
- Cut the slot and tap the hole as above, or mill the slot to 0.7 mm for a closer fit.
- Optional: turn a 6 mm spigot on a separate end cap if you want a stub handle.

## Tube version

Use 10 × 2 mm tube (6 mm bore). Make a 10 mm long Ø6 plug, slot it as above and fit it into each end with retaining compound. The grub screw goes through the tube and the plug.

The design has not been tested yet. Make one handle and try one pick before making a batch.
