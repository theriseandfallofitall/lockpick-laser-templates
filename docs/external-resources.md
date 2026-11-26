# External resources (searched 2026-11-26)

No manufacturer publishes drawings or DXFs of tension wrenches. Product pages and lock specifications do give enough numbers to size them from first principles; see `docs/tension-sizing.md`. 

## Tension and other-lock dimensions (second search)

| Item | Value | Source |
|---|---|---|
| Multipick SP33 TOK | 76.2 long, 3.4 shaft, 2.28 tip, 0.8 thick | [Multipick](https://dev.multipick.com/en/elite-tok-tensioner-flat-double-ended-sp33-0.8-mm) |
| Multipick SP45 | 75.2 long, tips 2.3 / 3.0, ends 7.1 / 13.5 outer | [Multipick](https://multipick.com/en/elite-double-sided-tension-wrench-sp45-0.8-mm/) |
| Multipick SP57 BOK | 76 long, 3.0 shaft, 0.8–1.4 tapered tip | [Multipick](https://multipick.com/en/elite-tapered-bok-bent-tension-wrench-0.8-1.4mm/) |
| Peterson Pry Bar | 1.27 thick (Lite 1.02), serrated | [CLK](https://clksupplies.com/products/pry-bar-0-050-tok-top-of-keyway-tension-wrench-by-peterson) |
| SouthOrd BOK | 3.07 × 0.79 standard, 2.44 × 0.46 thin, 2.24 × 0.79 Euro | [CLK](https://clksupplies.com/products/standard-tension-wrench) |
| Kwikset KW1 | first cut 0.247", spacing 0.150", plug ≈ 0.498" | [LockWiki](https://www.lockwiki.com/index.php/Kwikset_Classic) |
| Dimple tensioners | 1.2–1.5 thick, 2.5–4.0 wide | [Multipick SP-66](https://multipick.com/en/elite-dimple-lock-tensioner-sp-66-1.5-x-3-mm), [BMS-10](https://multipick.com/en/elite-dimple-pin-tension-wrench-bms-10/) |
| Lever pick blades | 0.4–0.6 thick, 120 long | [Multipick lever set](https://multipick.com/en/lever-lock-pick-set-20-pieces/) |
| Dimple keys (ASSA CY110, MTL400) | 2.9–3.0 thick | [ASSA datasheet](https://www.assaabloy.com/ae/en/product-assets/keys-and-cylinders/cy110/cy110-key/assets/document/CY110-Key-Technical-Datasheet-ME.pdf) |

Not found anywhere: serration pitch, bend radii, curtain-wrench bit size, lever pitch, Euro and Schlage keyway dimensions (DIN 18252 is paywalled). Measure these on your own locks.

## Templates worth a look

| Resource | What | Licence |
|---|---|---|
| [Phreak87/PickGenerator](https://github.com/Phreak87/PickGenerator) | HTML/JS generator that outputs SVG picks | not checked |
| [LP101 template collection](https://www.lockpicking101.com/viewtopic.php?p=452129) | PNG and SVG pick sets, revised later in the thread | not stated |
| [LP101 TOK wrench template](https://www.lockpicking101.com/viewtopic.php?p=469119) | TOK wrench, Sparrows-like | not stated |
| [Instructables: Lock Picks 99 vs 101](https://www.instructables.com/Lock-Picks-99-vs-101) | printable template, hacksaw-blade stock | not stated |
| [Printables TOK/BOK tensioner](https://www.printables.com/model/1103439-lock-pick-tensioner-tokbok) | 3D-print only | related model CC BY-NC-SA |

## Dimensions used for the other-lock picks

| Item | Value | Source |
|---|---|---|
| Dimple flat flag | 2.0 × 2.5 mm | [Multipick](https://multipick.com/en/elite-g-pro-dimple-pick-13-lr1-flat-flag) |
| Ball pick | Ø4.05 mm ball, 0.4 mm blade | [Multipick](https://multipick.com/en/elite-ball-slim-pick-0.4-mm-v10) |
| Comb spacing, first cut | Kwikset 3.81 / 6.27; Schlage 3.96 / 5.87 (Schlage not checked) | [LockWiki](https://www.lockwiki.com/index.php/Kwikset_Classic), common key specs |
| Kwikset shear line | #1 cut 0.329" + #1 key pin 0.172" = 0.501" (12.7 mm) above the key bottom | [LockWiki](https://www.lockwiki.com/index.php/Kwikset_Classic) |
| Comb tooth height (5 mm) | worked out from the line above: `docs/pick-profiles.md` | — |
| Warded bit sizes | design choices, unverified | — |

## Stock

| Stock | Value | Source |
|---|---|---|
| Hacksaw blade | 300 mm pin centres; 12–13 mm wide; 0.60–0.65 mm thick | ISO 2336-1; [RS](https://uk.rs-online.com/web/p/hand-saw-blades/0218470) |
| Wiper insert | 6–8.5 mm wide | [Supercheap Auto](https://www.supercheapauto.com.au/p/tridon-tridon-metal-rail-wiper-refills-6.5mm-2-pack-mrn24-2/213379.html) |

Measure your own blade width, thickness and pin-hole position before relying on the blade layouts. The generator takes `--blade-width` and `--tooth-margin`.
