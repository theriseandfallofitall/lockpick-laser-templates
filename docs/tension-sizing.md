# Tension tool sizing: the generic answer

A tension tool has three numbers that matter. All three come from the lock, so you can scale a design to any lock with calipers.

| Number | What it is | Rule | Kwikset KW1 | Source of the numbers |
|---|---|---|---|---|
| Insertion length `L_in` | how far the tip goes into the keyway | `first_pin − pin_dia/2 − 0.1` → stops in front of pin 1 | 6.27 − 1.46 − 0.1 = **4.7 mm** | KW1 first cut 0.247", pin Ø0.115" ([LockWiki](https://www.lockwiki.com/index.php/Kwikset_Classic)) |
| Recessed length | same, for plugs set back behind the cylinder face | `L_in + recess` (default 6 mm) | **10.7 mm** | |
| Tip width | the tip's height in the keyway (flat face against the plug wall) | about ⅓ of the keyway height, ≤ 3.2 mm, leaving room for the pick | **2.4–2.8 mm** (narrow keyways), 3.3–4.0 mm (wide / Euro) | |
| Thickness | across the keyway, so it is set by the stock | TOK 0.6–1.2 mm (0.025–0.050"); BOK 0.45–0.8 mm | | Peterson, SouthOrd, Dangerfield, Multipick |
| Shaft | handle width and length | 3.0–3.4 mm wide, 76 mm (3") long | | Multipick SP33/SP45/SP57 |

This explains the published Multipick sizes. SP11–13 have a 4.7 mm short side, which equals the Kwikset `L_in`. Their 11 mm long side is the recessed version. SP14/15 use 4.5 mm, close to Schlage's `L_in` of 4.3. Drawn as flat L-shapes with legs on opposite sides, such bars are 18–22 mm tall and cannot be cut from a 12.7 mm hacksaw blade.

## Which shape to cut from a hacksaw blade

| Shape (in `generated/tension-tools-v2/`) | Fits a 12.7 mm blade | Notes |
|---|---|---|
| `TOK-C` (both short ends on one side) | yes, 9.6 mm | Same working ends as SP11–13. Turn it over to use the other end. |
| `TOK-STRAIGHT-BEND` (Peterson-style) | yes, 3.4 mm | Cut a straight strip, then bend 90° at the blue line. Hacksaw steel is hard: heat the bend to dull red and let it cool, or it snaps. Wiper inserts bend cold. |
| `BOK-STRAIGHT-BEND` | yes | The classic bent bottom-of-keyway wrench. |
| `TOK-Z`, `BOK-L`, all `ADV__` tools | no | Cut from sheet that is 25 mm wide or more. |

## Advanced designs

- **Flex-gauge tensioner:** a serpentine flexure between the head and the handle, with a pointer and tick notches. You can see, and repeat, how hard you are pushing.
- **Curved finger-pad TOK:** a waved shaft with a finger pad and a dimple, plus short and recessed ends.
- **Z-bar:** a top-of-keyway end and a bottom-of-keyway end on one tool.
- **Tension card:** 85.6 × 54 mm with 4 short TOK, 4 recessed TOK and 2 BOK tips.
- **Serrated straight bars:** 0.6 mm teeth on the bearing edge so the tip grips the plug.

## Scale to your lock

```
python build/generate_tension_tools.py --first-pin 5.87          # Schlage SC1 (0.231", unverified)
python build/generate_tension_tools.py --first-pin <mm> --recess <mm>
```

To measure `first_pin`, put a key in the lock and measure from its shoulder to the centre of the first cut. Measure `recess` from the cylinder face to the plug face.
