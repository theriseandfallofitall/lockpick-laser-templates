// Pick and tension-tool customiser: builds the outline in the browser and downloads SVG / DXF (mm, 1:1).
// Pure functions at the top (also run under Node for tests: `node site/customizer.js --selftest <dir>`).
"use strict";

const CK = (() => {
  const BLADE_USABLE = 10.7; // 12.7 mm blade minus tooth margin and spine clearance

  // ---------- defaults (also the "Reset all" values) and presets
  const PICK_BASE = { handle: "full", handleL: 62, handleH: 9, handleEnd: "round", holes: true, holeD: 3.4, hole1: 15, hole2: 50,
    tangW: 5.8, tangL: 10, shoulderL: 2, shoulderW: 10, tangHole: false, tangHoleD: 2.2, tangHoleX: 5, tangHole2: false, tangHole2X: 10, flatEdge: false, neckL: 18, shaftL: 40, shaftH: 1.2, sweep: 0,
    tip: "hook", tipH: 3.0, tipW: 0.9, tipL: 10, bendR: 1.8, peaks: 3, waveStyle: "up", lean: 8, n: 5, pitch: 3.81, first: 6.27, custom: "0 2.2 0.6 2.8 1.2 2.4 0",
    curl: 40, wardSlot: false, tilt: 0, fillet: false, filletR: 0.4, filletA: 30,
    gripButt: 2.0, gripBelly: 0.8, gripWaist: 1.5, gripWaistPos: 0.8, gripSlope: 0 };
  const TENSION_BASE = { length: 76, shaftW: 3.4, dirA: "up", tipA: 2.4, linA: 4.7, dirB: "up", tipB: 2.8, linB: 4.7, serr: false,
    outer: "round", outerR: 0.3, tipCorner: "sharp", tipCornerR: 0.5, legCorner: "round", legCornerR: 0.8, ovalStretch: 1.6, wave: 0, waves: 1,
    tipStyle: "square", stepW: 0.6, pad: 0, padL: 24 };
  const OUTLINE_BASE = { olPts: "", olLen: 100, olSmooth: 2, olSnap: 0, olMix: "whole", olSplit: 50, olBlend: 8, olHoles: false };
  // stock the part is cut from: a 12.7 mm hacksaw blade (10.7 mm usable) by default, any sheet height, or no limit
  const STOCK_BASE = { stock: "blade", stockH: 25 };
  const BASE = { tool: "pick", ...PICK_BASE, ...TENSION_BASE, ...OUTLINE_BASE, ...STOCK_BASE };
  const PRESETS = {
    pick: [
      // same shapes and numbers as build/pick_shapes.py (hooks and rakes are bent strips: no right-angle corners)
      ["hookM", "Medium hook", { tip: "hook", tipH: 3.0, tipW: 0.9, bendR: 1.8, lean: 8 }],
      ["hookS", "Short hook", { tip: "hook", tipH: 2.0, tipW: 0.9, bendR: 1.6, lean: 10 }],
      ["hookD", "Deep hook", { tip: "hook", tipH: 4.2, tipW: 0.9, bendR: 2.0, lean: 6 }],
      ["hookO", "Offset hook (tip leans forward)", { tip: "hook", tipH: 3.0, tipW: 0.9, bendR: 1.8, lean: 28 }],
      ["sweptS", "Swept hook, short (shaft curves up)", { tip: "swept", tipH: 1.6, tipL: 2.9, tipW: 0.9 }],
      ["sweptM", "Swept hook, medium", { tip: "swept", tipH: 3.0, tipL: 4.0, tipW: 0.9 }],
      ["sweptD", "Swept hook, deep", { tip: "swept", tipH: 5.0, tipL: 5.6, tipW: 0.9 }],
      ["diaS", "Small half-diamond", { tip: "halfDiamond", tipH: 1.6, tipL: 1.6 }],
      ["diaM", "Medium half-diamond", { tip: "halfDiamond", tipH: 2.0, tipL: 2.0 }],
      ["diaL", "Large half-diamond", { tip: "halfDiamond", tipH: 2.6, tipL: 2.6 }],
      ["diaD", "Steep half-diamond", { tip: "halfDiamond", tipH: 3.2, tipL: 1.8 }],
      ["bogota2", "Bogota, two humps", { tip: "rake", waveStyle: "up", peaks: 2, tipL: 9, tipH: 1.65, tipW: 0.9 }],
      ["bogota", "Bogota, three humps", { tip: "rake", waveStyle: "up", peaks: 3, tipL: 13.5, tipH: 1.65, tipW: 0.9 }],
      ["snake", "Snake rake", { tip: "rake", waveStyle: "both", peaks: 4, tipL: 12, tipH: 0.85, tipW: 0.9 }],
      ["city", "City rake (L-rake)", { tip: "custom", tipL: 12.6, custom: "0 2.2 2.2 0.6 0.6 2.8 2.8 1.2 1.2 2.4 2.4 -1.2" }],
      ["triple", "Triple-peak rake", { tip: "custom", tipL: 8.6, custom: "0 2.4 0.9 2.8 0.9 2.4 -1.2" }],
      ["saw", "Sawtooth rake (strokes)", { tip: "saw", tipH: 2.4, n: 5, pitch: 2.4 }],
      ["ball", "Single ball", { tip: "ball", tipH: 4 }],
      ["halfBall", "Half ball", { tip: "halfBall", tipH: 4 }],
      ["snowman", "Double ball (snowman)", { tip: "doubleBall", tipH: 4 }],
      ["combK", "Comb, Kwikset 5-pin", { tip: "comb", n: 5, pitch: 3.81, first: 6.27, tipW: 1.6, tipH: 5.0, shaftH: 2.0 }],
      ["combS", "Comb, Schlage 5-pin", { tip: "comb", n: 5, pitch: 3.96, first: 5.87, tipW: 1.6, tipH: 5.0, shaftH: 2.0 }],
      ["warded", "Warded L bit", { tip: "warded", tipH: 4, tipW: 2.0, shaftH: 2.2 }],
      ["lever", "Lever lifter (UK mortice)", { tip: "hook", tipH: 3.5, tipW: 1.2, bendR: 1.8, lean: 5, shaftH: 2.0, shaftL: 60 }],
      ["paw", "High hook, tip curls forward (monkey-paw style)", { tip: "paw", tipH: 4.0, tipW: 0.9, bendR: 1.6, lean: 0, curl: 45 }],
      ["gonzo", "Tall round-nose hook (Gonzo-style)", { tip: "hook", tipH: 3.6, tipW: 1.2, bendR: 1.6, lean: 4 }],
      ["deforest", "Short hook, tip angled forward (DeForest-style)", { tip: "hook", tipH: 2.2, tipW: 0.9, bendR: 1.0, lean: 35 }],
      ["reach", "Long-reach swept hook (Reach-style)", { tip: "swept", tipH: 3.4, tipL: 7.0, tipW: 0.9 }],
      ["worm", "Worm rake (four low humps)", { tip: "rake", waveStyle: "up", peaks: 4, tipL: 14, tipH: 1.2, tipW: 0.9 }],
      ["wrake", "W-rake (three sharp peaks)", { tip: "custom", tipL: 9, custom: "0 2.2 0.5 2.2 0.5 2.2 -1.2" }],
      ["wardT", "Warded T bit", { tip: "wardedT", tipH: 3.5, tipW: 2.0, shaftH: 2.2 }],
      ["curtain", "Curtain wrench (lever locks)", { tip: "curtain", tipH: 6, tipW: 3.5, shaftH: 2.2, shaftL: 56 }],
      ["dimple", "Dimple pick blank (bend the flag)", { tip: "dimple", tipL: 2.0, tipW: 2.5, shaftH: 1.6 }],
      ["draw", "Draw your own tip", { tip: "custom", tipL: 14, custom: "0 1.5 2.5 3 2.5 1.5 0" }],
    ],
    tension: [
      ["U", "Blade-fit U-bar (both ends up)", {}],
      ["single", "Single-ended", { dirB: "none", tipA: 2.8 }],
      ["Z", "SP-style Z (short up, recessed down)", { dirB: "down", tipB: 2.8, linB: 10.7 }],
      ["BOK", "BOK L-wrench (long thin tip)", { length: 70, shaftW: 3, tipA: 1.8, linA: 12, dirB: "none", serr: true }],
      ["reaper", "Reaper-style: S-curve body, oval reliefs, serrated", { shaftW: 4.2, dirB: "down", tipA: 2.4, tipB: 2.8, linB: 10.7, serr: true,
        tipCorner: "oval", tipCornerR: 0.8, legCorner: "round", legCornerR: 1.5, ovalStretch: 1.8, wave: 2.5, waves: 1, outerR: 0.5 }],
      ["flush", "Flush-fit U-bar (mouse-bite tip corners)", { tipCorner: "mouse", tipCornerR: 0.5 }],
      ["tulip", "Stepped tips (tulip / staircase)", { tipStyle: "stepped", stepW: 0.7, linA: 7, linB: 7 }],
      ["pointT", "Pointed tip (bottom-of-keyway diamond)", { dirB: "none", tipStyle: "point", tipA: 2.4, linA: 6 }],
      ["pad", "Thumb-pad bar (wider in the middle)", { pad: 1.2, padL: 26, outer: "round", outerR: 0.4 }],
    ],
    outline: [["start", "The medium hook as an outline (draw over it or redraw)", {}]],
  };

  // ---------- picks: outline = top edge (left->right) + bottom edge (right->left), as functions of x
  function pick(o) {
    o = { ...PICK_BASE, ...o };
    const flatOk = o.flatEdge && flatTip(o) && o.handle !== "contour";
    // flat-edge X-Acto: the stop is on one side only, as tall as one side of the centred shoulders
    // (same as build/generate_home_workshop.py xacto_flat_edge)
    if (flatOk && o.handle === "xacto") o.shoulderW = (o.shoulderW + o.tangW) / 2;
    const sh = o.shaftH, half = sh / 2;
    let x0, handleTop, handleBot, holes = [], midAt = () => 0;
    if (o.handle === "xacto") {
      const tw = o.tangW, tl = o.tangL, c = 0.4;
      x0 = tl + o.shoulderL;                         // shoulders end
      handleTop = x => x < c ? -tw / 2 + c - x : x < tl ? -tw / 2 : -o.shoulderW / 2;
      handleBot = x => -handleTop(x);
    } else if (o.handle === "contour") {
      const gp = gripProfile(o);
      x0 = o.handleL; handleTop = gp.top; handleBot = gp.bot;
      if (o.holes) holes = [o.hole1, o.hole2]; midAt = gp.mid;
    } else {
      const L = o.handleL, H = o.handleH;
      x0 = L;
      let edge;
      if (o.handleEnd === "square") edge = () => 0;
      else if (o.handleEnd === "point") { const p = Math.min(12, L / 3), k = Math.max(0, H / 2 - 1); edge = x => x < p ? k * (1 - x / p) : 0; }
      else { const r = Math.min(2, H / 2); edge = x => x < r ? r - Math.sqrt(Math.max(0, r * r - (r - x) * (r - x))) : 0; }
      handleTop = x => -H / 2 + edge(x);
      handleBot = x => H / 2 - edge(x);
      if (o.holes) holes = [o.hole1, o.hole2];
    }
    // comb (comb_tool() in build/generate_home_workshop.py): no neck or shaft. A stop block joins the handle
    // (the last 2 mm of a flat handle, or 8 mm after the X-Acto shoulders) and the comb runs along the handle's bottom edge.
    const comb = o.tip === "comb";
    if (comb) o.combStop = o.handle === "xacto" ? 8 : 2;
    const neckStart = comb ? (o.handle === "xacto" ? x0 : x0 - 2) : o.handle === "xacto" ? x0 - Math.min(1.0, o.shoulderL / 2) : x0 - 4;
    const neckEnd = comb ? neckStart : neckStart + o.neckL;
    const tipStart = comb ? neckStart : neckEnd + o.shaftL;
    const tip = TIPS[o.tip](o);
    const xEnd = tipStart + tip.len;
    // flat edge: the X-Acto tang drops so its underside lines up with the shoulders (a flat handle already does)
    const feH = x => flatOk && o.handle === "xacto" ? o.shoulderW / 2 - (x < o.tangL ? o.tangW / 2 : o.shoulderW / 2) : 0;
    const rT = handleTop(neckStart) + feH(neckStart), rB = handleBot(neckStart) + feH(neckStart);   // handle edges where the neck starts
    const ss = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    const cos01 = t => 0.5 * (1 + Math.cos(Math.PI * Math.min(1, Math.max(0, t))));
    const sweep = flatOk || comb ? 0 : o.sweep;
    // columns for a shaft centred at yc where it leaves the neck. Flat edge / comb: the shaft's underside is on the handle's.
    function cols(yc) {
      const centre = x => yc + sweep * ss((x - neckEnd) / Math.max(1, o.shaftL));
      const k = x => cos01((x - neckStart) / Math.max(1e-6, neckEnd - neckStart));
      const topAt = x => x < neckStart ? handleTop(x) + feH(x) : x < neckEnd ? (yc - half) + (rT - (yc - half)) * k(x)
        : x < tipStart ? centre(x) - half : centre(tipStart) - half - tip.up(x - tipStart);
      const botAt = x => x < neckStart ? handleBot(x) + feH(x) : x < neckEnd ? (yc + half) + (rB - (yc + half)) * k(x)
        : x < tipStart ? centre(x) + half : centre(tipStart) + half + tip.down(x - tipStart);
      return { centre, topAt, botAt };
    }
    // tilt: the shaft bends up (+) or down (-) over its first few mm, then runs straight at that angle; the tip goes with it
    const tilt = comb ? 0 : (o.tilt || 0) * Math.PI / 180, Lb = Math.min(6, Math.max(2, o.shaftL / 4));
    const bendAt = yc => (x, y) => {
      if (!tilt || x <= neckEnd) return [x, y];
      const s = x - neckEnd, n = y - yc, R = Lb / tilt, ph = tilt * Math.min(s, Lb) / Lb;
      let cx = neckEnd + R * Math.sin(ph), cy = yc - R * (1 - Math.cos(ph));
      if (s > Lb) { cx += (s - Lb) * Math.cos(tilt); cy -= (s - Lb) * Math.sin(tilt); }
      return [cx + n * Math.sin(ph), cy + n * Math.cos(ph)];
    };
    const xs = [];
    for (let x = 0; x < xEnd - 1e-6; x += x < tipStart - 1 ? 0.25 : 0.04) xs.push(+x.toFixed(4));
    const breaks = o.handle === "xacto" ? [0.4, o.tangL, x0] : [];   // feature edges: sample both sides so steps stay square
    for (const b of breaks.concat([neckStart, neckEnd, tipStart])) if (b > 0 && b < xEnd) xs.push(+(b - 1e-4).toFixed(4), +b.toFixed(4));
    xs.sort((a, b) => a - b);
    for (let i = xs.length - 1; i > 0; i--) if (xs[i] - xs[i - 1] < 5e-5) xs.splice(i, 1);
    while (xs.length && xs[xs.length - 1] >= xEnd - 1e-6) xs.pop();
    xs.push(xEnd);
    // ring points carry their unbent x as a third value (the fillet keeps the X-Acto tang square; the close-up finds the tip)
    const mk = yc => { const C = cols(yc), B = bendAt(yc);
      const top = xs.map(x => [...B(x, C.topAt(x)), x]), bot = xs.slice().reverse().map(x => [...B(x, C.botAt(x)), x]);
      return { C, B, yc, ring: top.concat(bot) }; };
    // flat edge: the handle's underside is one straight line; with a downward tilt the shaft starts higher so it ends on that line
    let S = mk(flatOk || comb ? rB - half : (rT + rB) / 2);
    if (flatOk && tilt) { const ymax = Math.max(...S.ring.filter(p => p[2] > neckEnd).map(p => p[1])); if (ymax > rB + 1e-6) S = mk(S.yc - (ymax - rB)); }
    const { C, B } = S, bx = x => B(x, C.centre(x))[0];
    // screw holes: where asked, else moved (up to 15 mm) to the nearest spot with 1.2 mm of metal all round inside the handle
    // (a short handle would otherwise put a hole in the neck or on the edge)
    const hr = o.holeD / 2, hw = 1.2, notes = [], placed = [];
    holes.forEach((h, n) => {
      const fits = x => { const y = midAt(x); return x >= hr + hw && x <= neckStart - hr - hw && y - hr - handleTop(x) >= hw && handleBot(x) - y - hr >= hw &&
        placed.every(c => Math.hypot(c.x - x, c.y - y) >= 2 * hr + hw); };
      let x = null;
      for (let k = 0; k <= 120 && x === null; k++) { const t = h + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.25; if (fits(t)) x = t; }
      if (x === null) { notes.push(`Hole ${n + 1} left out: no room for a Ø${o.holeD} hole in this handle`); return; }
      placed.push({ x, y: midAt(x) });
      if (Math.abs(x - h) > 0.1) notes.push(`Hole ${n + 1} moved to ${x.toFixed(1)} mm so it sits inside the handle`);
    });
    const circles = placed.map(c => ({ x: c.x, y: c.y + feH(c.x), r: hr }));
    // optional hole through the tang: a cone-point grub screw in the DIY bar handle seats in it (stops pull-out)
    if (o.handle === "xacto" && o.tangHole) { const hx = o.tangL - o.tangHoleX; circles.push({ x: hx, y: feH(hx), r: o.tangHoleD / 2 }); }
    // optional second hole (second grub screw in the DIY bar handle); needs a longer tang, e.g. 14 mm with holes at 4 / 10
    if (o.handle === "xacto" && o.tangHole && o.tangHole2) { const hx = o.tangL - o.tangHole2X; circles.push({ x: hx, y: feH(hx), r: o.tangHoleD / 2 }); }
    const xRight = Math.max(...S.ring.map(p => p[0]));
    // dimension marks for the preview (display only): [label, x from, x to] in raw coordinates
    const marks = o.handle === "xacto"
      ? [["tang", 0, o.tangL], ["shoulder", o.tangL, x0], ["neck", neckStart, neckEnd], ["shaft", neckEnd, bx(tipStart)], ["tip", bx(tipStart), xRight]]
      : [[o.handle === "contour" ? "grip" : "handle", 0, x0], ["neck", neckStart, neckEnd], ["shaft", neckEnd, bx(tipStart)], ["tip", bx(tipStart), xRight]];
    if (comb) marks.splice(-3, 2);
    // vertical dimension marks: [label, x, y top, y bottom, outside] in raw coordinates; "outside" ones are drawn right of the tip
    let pk = tipStart, pkY = C.topAt(tipStart);          // highest point of the tip (measured before any tilt)
    for (let x = tipStart; x <= xEnd; x += 0.02) { const xx = Math.min(x, xEnd - 1e-6), y = C.topAt(xx); if (y < pkY) { pkY = y; pk = x; } }
    const base = C.centre(tipStart) - half, tipH = base - pkY, baseB = B(tipStart, base), pkB = B(Math.min(pk, xEnd - 1e-6), pkY);
    const sx = comb ? tipStart + o.combStop + 0.6 : (neckEnd + tipStart) / 2, hx = o.handle === "xacto" ? o.tangL / 2 : Math.min(8, neckStart / 2);
    const sT = B(sx, C.topAt(sx)), sB = B(sx, C.botAt(sx));
    const vmarks = [
      [o.handle === "xacto" ? "tang" : o.handle === "contour" ? "grip" : "handle", hx, C.topAt(hx), C.botAt(hx)],
      [comb ? "comb body" : "shaft", sT[0], sT[1], sT[1] + Math.hypot(sB[0] - sT[0], sB[1] - sT[1])],
      [["ball", "doubleBall", "halfBall"].includes(o.tip) ? "ball above shaft" : comb ? "stop above body" : "tip above shaft", pkB[0], baseB[1] - tipH, baseB[1], true],
    ];
    if (comb) {   // tooth height at the front tooth (the tallest point is the stop)
      const xt = tipStart + o.combStop + o.first + (Math.max(1, Math.round(o.n)) - 1) * o.pitch;
      vmarks.push(["tooth", xt, C.topAt(xt), base]);
    }
    if (o.handle === "xacto") vmarks.splice(1, 0, ["shoulder", o.tangL + o.shoulderL / 2, -o.shoulderW / 2 + feH(o.tangL + 0.1), o.shoulderW / 2 + feH(o.tangL + 0.1)]);
    // peaks closer than ~1.2 mm leave valleys narrower than a kerf / needle file
    if (o.tip === "rake" && o.tipL / o.peaks < 1.2) notes.push(`Rake peaks are ${(o.tipL / o.peaks).toFixed(2)} mm apart - lengthen the tip or use fewer peaks (min 1.2 mm)`);
    if (comb) {   // COMB in build/pick_shapes.py: slide in under the pins, lift until the body meets the keyway ceiling (~8.5 mm)
      if (o.shaftH + o.tipH > 7.5) notes.push(`Comb is ${(o.shaftH + o.tipH).toFixed(1)} mm tall: it may not slide in under the pins (keep body + teeth near 7 mm)`);
      if (8.5 + o.tipH < 13.0) notes.push(`Teeth ${o.tipH} mm: lifted, they reach about ${(8.5 + o.tipH).toFixed(1)} mm, short of the 12.7 mm shear line (use about 5 mm)`);
    }
    if (o.tip === "custom") {
      const h = parseHeights(o.custom), st = o.tipL / Math.max(1, h.length - 1), pk = h.map((v, i) => i > 0 && i < h.length - 1 && v > h[i - 1] && v >= h[i + 1] ? i : -1).filter(i => i >= 0);
      const gap = Math.min(...pk.slice(1).map((v, i) => (v - pk[i]) * st));
      if (gap < 1.2) notes.push(`Tip peaks are ${gap.toFixed(2)} mm apart - lengthen the tip (min 1.2 mm between peaks)`);
    }
    if (flatOk && tilt && S.yc - half < rT - 0.01) notes.push("The downward tilt starts the shaft above the handle: reduce the tilt or shorten the shaft");
    // close-up window: the tip plus 5 mm of shaft
    const near = S.ring.filter(p => p[2] >= tipStart - 5);
    const focus = { x0: Math.min(...near.map(p => p[0])), x1: Math.max(...near.map(p => p[0])), y0: Math.min(...near.map(p => p[1])), y1: Math.max(...near.map(p => p[1])) };
    let ring = S.ring;
    if (o.fillet && o.filletR > 0) ring = fillet(ring, o.filletR, o.filletA, p => o.handle === "xacto" && p[2] <= o.tangL + 1e-3);   // the tang stays square: it seats in the collet
    return finish({ rings: [ring.map(p => [p[0], p[1]])], circles, guides: [], marks, vmarks, notes, focus, cuts: [neckStart, neckEnd] });
  }

  // contoured grip (own parametric shape, not traced from anyone's handle): a butt that swells downward, a belly under
  // the fingers, a finger notch near the front and a collar before the neck. Edges are smooth curves through stations.
  function gripProfile(o) {
    const L = o.handleL, h = o.handleH / 2, sl = Math.tan((o.gripSlope || 0) * Math.PI / 180);
    const wp = Math.min(0.92, Math.max(0.55, o.gripWaistPos)), wd = Math.min(h - 0.8, Math.max(0, o.gripWaist));
    const col = Math.max(o.shaftH, h * 0.72), bu = Math.max(0, o.gripButt), be = o.gripBelly;
    const X = [0, 0.1, 0.32, 0.55, wp - 0.1, wp, Math.min(0.97, wp + 0.07), 1].map(f => f * L);
    const T = [h * 0.8, h, h * 0.9, h * 0.95, h, h - wd, col, col];
    const Bo = [h * 0.8 + bu, h + bu * 0.55, h * 0.95 + be * 0.4, h + be, h, h - wd * 0.6, col, col];
    const herm = (Y, x) => {   // cubic Hermite through the stations, flat at both ends
      const n = X.length; if (x <= X[0]) return Y[0]; if (x >= X[n - 1]) return Y[n - 1];
      let i = 0; while (x > X[i + 1]) i++;
      const m = j => j <= 0 || j >= n - 1 ? 0 : (Y[j + 1] - Y[j - 1]) / (X[j + 1] - X[j - 1]);
      const d = X[i + 1] - X[i], t = (x - X[i]) / d, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * Y[i] + (t3 - 2 * t2 + t) * d * m(i) + (-2 * t3 + 3 * t2) * Y[i + 1] + (t3 - t2) * d * m(i + 1);
    };
    const c = Math.min(3, L / 10), cap = x => x >= c ? 1 : Math.sqrt(Math.max(0, 1 - (1 - x / c) ** 2));
    const cy = x => -sl * (L - x);   // + slope raises the butt
    const top = x => cy(x) - herm(T, x) * cap(x), bot = x => cy(x) + herm(Bo, x) * cap(x);
    return { top, bot, mid: x => (top(x) + bot(x)) / 2 };
  }

  // round every corner sharper than minDeg with a tangent curve of radius r (quadratic Bezier, corner as control point).
  // R: closed ring of [x, y, tag]; keep(p) true leaves that corner sharp.
  function fillet(R, r, minDeg, keep) {
    const P = [];
    for (const p of R) if (!P.length || Math.hypot(p[0] - P[P.length - 1][0], p[1] - P[P.length - 1][1]) > 2e-3) P.push(p);
    while (P.length > 3 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) <= 2e-3) P.pop();
    const n = P.length; if (n < 4) return R;
    const s = [0]; for (let i = 1; i <= n; i++) s.push(s[i - 1] + Math.hypot(P[i % n][0] - P[i - 1][0], P[i % n][1] - P[i - 1][1]));
    const Lt = s[n];
    const at = d => { d = ((d % Lt) + Lt) % Lt; let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= d) lo = m; else hi = m; }
      const a = P[lo], b = P[(lo + 1) % n], t = (d - s[lo]) / Math.max(1e-12, s[lo + 1] - s[lo]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2]]; };
    const dl = 0.06, thr = minDeg * Math.PI / 180, turn = new Float64Array(n);
    for (let i = 0; i < n; i++) { const p = at(s[i] - dl), q = at(s[i] + dl), V = P[i];
      let d = Math.abs(Math.atan2(q[1] - V[1], q[0] - V[0]) - Math.atan2(V[1] - p[1], V[0] - p[0])); if (d > Math.PI) d = 2 * Math.PI - d; turn[i] = d; }
    const fwd = (i, k) => ((s[k] - s[i]) % Lt + Lt) % Lt;
    const C = [];
    for (let i = 0; i < n; i++) {
      if (turn[i] < thr || (keep && keep(P[i]))) continue;
      let best = true;   // the strongest turn within dl either side
      for (let j = 1; j < n && best; j++) { const k = (i + j) % n; if (fwd(i, k) > dl) break; if (turn[k] > turn[i]) best = false; }
      for (let j = 1; j < n && best; j++) { const k = (i - j + n) % n; if (fwd(k, i) > dl) break; if (turn[k] >= turn[i]) best = false; }
      if (best) C.push({ i });
    }
    if (!C.length) return R;
    C.forEach((c, m) => { const p = C[(m - 1 + C.length) % C.length], q = C[(m + 1) % C.length];
      const dp = C.length > 1 ? fwd(p.i, c.i) : Lt, dn = C.length > 1 ? fwd(c.i, q.i) : Lt;
      c.t = Math.min(r * Math.tan(Math.min(turn[c.i], 3.0) / 2), 0.45 * dp, 0.45 * dn, 4 * r); });
    const out = [];
    C.forEach((c, m) => {
      const p = C[(m - 1 + C.length) % C.length];
      let from = s[p.i] + p.t; const to = s[c.i] - c.t;
      if (from >= to) from -= Lt;
      for (let k = -n; k < n; k++) { const sk = s[(k + n) % n] - (k < 0 ? Lt : 0); if (sk > from && sk < to) out.push(P[(k + n) % n]); }
      const a = at(s[c.i] - c.t), b = at(s[c.i] + c.t), V = P[c.i];
      for (let k = 0; k <= 12; k++) { const u = k / 12;
        out.push([(1 - u) ** 2 * a[0] + 2 * u * (1 - u) * V[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * u * (1 - u) * V[1] + u * u * b[1], V[2]]); }
    });
    return out;
  }

  // ---------- freehand / traced outline (tool "outline"): points "x,y x,y" in mm, closed ring
  const parsePts = s => String(s || "").trim().split(/\s+/).map(t => t.split(",").map(Number)).filter(p => p.length === 2 && p.every(isFinite));
  const ptsToStr = P => P.map(p => (+p[0].toFixed(2)) + "," + (+p[1].toFixed(2))).join(" ");
  function rdp(P, tol) {
    if (P.length < 3) return P.slice();
    const [a, b] = [P[0], P[P.length - 1]], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    let k = 0, best = -1;
    for (let i = 1; i < P.length - 1; i++) { const d = L < 1e-12 ? Math.hypot(P[i][0] - a[0], P[i][1] - a[1]) : Math.abs(dy * (P[i][0] - a[0]) - dx * (P[i][1] - a[1])) / L; if (d > best) { best = d; k = i; } }
    if (best <= tol) return [a, b];
    return rdp(P.slice(0, k + 1), tol).slice(0, -1).concat(rdp(P.slice(k), tol));
  }
  function rdpClosed(P, tol) {
    if (P.length < 5) return P.map(p => [p[0], p[1]]);
    let k = 0, best = -1; for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]); if (d > best) { best = d; k = i; } }
    const a = rdp(P.slice(0, k + 1), tol), b = rdp(P.slice(k).concat([P[0]]), tol);
    return a.slice(0, -1).concat(b.slice(0, -1)).map(p => [p[0], p[1]]);
  }
  const chaikin = (P, n) => { for (let k = 0; k < n; k++) { const Q = []; P.forEach((a, i) => { const b = P[(i + 1) % P.length];
    Q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); }); P = Q; } return P; };
  // straighten: segments within deg of level (or upright) are made exactly level (upright)
  function straighten(P, deg) {
    const t = Math.tan(deg * Math.PI / 180); P = P.map(p => p.slice());
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1];
      if (Math.abs(dx) > 0.3 && Math.abs(dy) <= t * Math.abs(dx)) a[1] = b[1] = (a[1] + b[1]) / 2;
      else if (Math.abs(dy) > 0.3 && Math.abs(dx) <= t * Math.abs(dy)) a[0] = b[0] = (a[0] + b[0]) / 2; }
    return P;
  }
  let defaultOutline = null;
  const outlineRaw = o => {
    let P = parsePts(o.olPts);
    if (P.length < 3) P = defaultOutline || (defaultOutline = rdpClosed(pick(PICK_BASE).rings[0], 0.03));
    const x0 = Math.min(...P.map(p => p[0])), y0 = Math.min(...P.map(p => p[1])), w = Math.max(...P.map(p => p[0])) - x0, k = (o.olLen || w) / Math.max(1e-6, w);
    return P.map(([x, y]) => [(x - x0) * k, (y - y0) * k]);
  };
  const spans = (P, x) => { const ys = [];   // where a vertical line crosses the outline, top to bottom
    P.forEach((a, i) => { const b = P[(i + 1) % P.length]; if ((a[0] <= x) !== (b[0] <= x)) ys.push(a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])); });
    return ys.sort((p, q) => p - q); };
  const env = (P, x) => { const ys = spans(P, x); return ys.length >= 2 ? [ys[0], ys[ys.length - 1]] : null; };   // top and bottom edge at x
  // mix: your outline as the handle with the pick's neck, shaft and tip from Pick settings ("handle"), or the pick's handle
  // with your outline as the working end ("tip"). Joined at olSplit (mm along your outline), centres lined up. Your outline is cut
  // straight at the join: its end cap (the rounded end of a traced or drawn shape) is skipped, and each edge runs into the other
  // part's edge along a tangent-continuous curve olBlend mm long (0 = a hard join), so there is no waist unless the shapes have
  // one. Built as columns, so overhangs (a nose that curls back) are filled in.
  function mixOutline(P, o) {
    const g = pick({ ...o, fillet: false }), Q = g.rings[0], [nS] = g.cuts;
    const qx0 = Math.min(...Q.map(p => p[0])), qx1 = Math.max(...Q.map(p => p[0])), px0 = Math.min(...P.map(p => p[0])), px1 = Math.max(...P.map(p => p[0]));
    const tipMode = o.olMix === "tip", st = 0.1, Bl = Math.max(0, +o.olBlend || 0), cen = e => (e[0] + e[1]) / 2;
    const S = Math.min(px1 - 0.5, Math.max(tipMode ? px0 : px0 + 0.5, o.olSplit));
    const top = [], bot = [], push = (x, e) => { if (e) { top.push([x, e[0]]); bot.push([x, e[1]]); } };
    const hgt = (R, x) => { const e = env(R, x); return e ? e[1] - e[0] : 0; };
    // end cap: from the cut, the first column within 4 mm that is 90 % as tall as the tallest one there
    const dir = tipMode ? 1 : -1, cap = (() => { let hm = 0; for (let d = 0; d <= 4; d += st) hm = Math.max(hm, hgt(P, S + dir * d));
      for (let d = 0; d <= 4; d += st) if (hgt(P, S + dir * d) >= 0.9 * hm) return S + dir * d; return S; })();
    // edge slope over 1.5 mm, limited so a ragged traced edge cannot make the blend overshoot
    const slope = (R, x, k) => { const a = env(R, x - 0.5), b = env(R, x + 1); return a && b ? Math.max(-0.5, Math.min(0.5, (b[k] - a[k]) / 1.5)) : 0; };
    // cubic Hermite from (xa, ya, slope ma) to (xb, yb, slope mb)
    // monotone (Fritsch-Carlson): an end slope against the rise, or steeper than 3x it, is cut back, so an edge never dips past
    // either end and the join is never narrower than both parts
    const herm = (xa, ya, ma, xb, yb, mb, x) => { const L = xb - xa, t = (x - xa) / L, t2 = t * t, t3 = t2 * t, dd = (yb - ya) / L;
      const lim = m => Math.abs(dd) < 1e-9 || Math.sign(m) !== Math.sign(dd) ? 0 : Math.sign(dd) * Math.min(Math.abs(m), 3 * Math.abs(dd)); ma = lim(ma); mb = lim(mb);
      return (2 * t3 - 3 * t2 + 1) * ya + (t3 - 2 * t2 + t) * L * ma + (-2 * t3 + 3 * t2) * yb + (t3 - t2) * L * mb; };
    let circles = [];
    if (!tipMode) {
      // your handle up to the cap, then the blend into the pick's handle end where its neck starts, then neck, shaft and tip
      const xa = Math.max(px0 + 0.5, cap - (Bl > 0 ? 0 : 0)), ea = env(P, xa) || [0, 0], eQ = env(Q, nS + 1e-3) || [0, 0], dy = cen(ea) - cen(eQ);
      for (let x = px0; x < xa; x += st) push(x, env(P, x));
      const xb = xa + Bl;
      if (Bl > 0) for (let x = xa; x < xb; x += st) push(x, [0, 1].map(k => herm(xa, ea[k], slope(P, xa - 0.5, k), xb, eQ[k] + dy, slope(Q, nS, k), x)));
      for (let xp = nS; xp <= qx1; xp += st) { const q = env(Q, xp); if (q) push(xb + xp - nS, [q[0] + dy, q[1] + dy]); }
    } else {
      // the pick's handle (no neck) up to the join, the blend, then your working end from the cap on
      const eH = env(Q, nS - 1e-3) || [0, 0], xb = Math.min(px1 - 0.2, Math.max(cap, S + Bl)), eb = env(P, xb) || [0, 0];
      const dy = cen(eb) - cen(eH), x0 = S;   // the handle ends at the join
      for (let xp = qx0; xp < nS; xp += st) { const q = env(Q, xp); if (q) push(x0 - (nS - xp), [q[0] + dy, q[1] + dy]); }
      circles = g.circles.filter(k => k.x < nS).map(k => ({ x: x0 - (nS - k.x), y: k.y + dy, r: k.r }));   // the handle's screw holes
      if (xb > x0) for (let x = x0; x < xb; x += st) push(x, [0, 1].map(k => herm(x0, eH[k] + dy, slope(Q, nS - 0.6, k), xb, eb[k], slope(P, xb, k), x)));
      for (let x = xb; x <= px1; x += st) push(x, env(P, x));
    }
    return { ring: top.concat(bot.reverse()), circles };
  }
  // holes: as far along as asked, moved (up to 15 mm) to the nearest spot with at least 1.2 mm of metal all round
  function placeHoles(R, o) {
    const r = o.holeD / 2, wall = 1.2, x0 = Math.min(...R.map(p => p[0])), out = [], notes = [];
    const clear = (x, y) => { let d = Infinity; R.forEach((a, i) => { const b = R[(i + 1) % R.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0; d = Math.min(d, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)); }); return d; };
    [o.hole1, o.hole2].forEach((h, n) => {
      let best = null;
      for (let k = 0; k <= 60 && !best; k++) {
        const x = x0 + h + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.25, ys = spans(R, x);
        for (let i = 0; i + 1 < ys.length; i += 2) { const y = (ys[i] + ys[i + 1]) / 2;
          if (clear(x, y) >= r + wall && out.every(c => Math.hypot(c.x - x, c.y - y) >= 2 * r + wall) && (!best || ys[i + 1] - ys[i] > best.h)) best = { x, y, h: ys[i + 1] - ys[i] }; }
      }
      if (best) { out.push({ x: best.x, y: best.y, r }); if (Math.abs(best.x - x0 - h) > 0.1) notes.push(`Hole ${n + 1} moved to ${(best.x - x0).toFixed(1)} mm so it sits inside the outline`); }
      else notes.push(`Hole ${n + 1} left out: no room for a Ø${o.holeD} hole near ${h} mm`);
    });
    return { circles: out, notes };
  }
  // the finished outline in the raw (normalised) frame: straighten, smooth, mix with the pick, round the corners, holes
  function outlineParts(o) {
    o = { ...PICK_BASE, ...OUTLINE_BASE, ...o };
    let P = outlineRaw(o);
    if (o.olSnap > 0) P = straighten(P, o.olSnap);
    if (o.olSmooth > 0) P = chaikin(P, Math.round(o.olSmooth));
    const mix = o.olMix === "handle" || o.olMix === "tip";
    if (!mix) {   // smoothing pulls the ends in: scale back about the middle so the overall length is the one asked for
      const xa = Math.min(...P.map(p => p[0])), xb = Math.max(...P.map(p => p[0])), ya = Math.min(...P.map(p => p[1])), yb = Math.max(...P.map(p => p[1]));
      const k = o.olLen / Math.max(1e-6, xb - xa), cx = (xa + xb) / 2, cy = (ya + yb) / 2;
      P = P.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
    }
    let carried = [];
    if (mix) { const m = mixOutline(P, o); P = m.ring; carried = m.circles; }
    if (o.fillet && o.filletR > 0) P = fillet(P.map(p => [p[0], p[1], 0]), o.filletR, o.filletA).map(p => [p[0], p[1]]);
    const h = o.olMix === "tip" ? { circles: carried, notes: [] } : o.olHoles ? placeHoles(P, o) : { circles: [], notes: [] };
    return { ring: P, circles: h.circles, notes: h.notes };
  }
  const outlineRing = o => outlineParts(o).ring;
  function outline(o) {
    const { ring, circles, notes } = outlineParts(o);
    return finish({ rings: [ring], circles, guides: [], marks: [], vmarks: [], notes });
  }

  const flat = () => 0;
  const FLAT_TIPS = ["hook", "curve", "swept", "gem", "paw", "halfDiamond", "rake", "saw", "halfBall", "comb", "warded", "curtain", "lever", "custom"];   // flat underside
  const flatTip = o => FLAT_TIPS.includes(o.tip) && !(o.tip === "rake" && o.waveStyle === "both");   // a snake dips below the shaft
  const circ = (c, r, d) => Math.sqrt(Math.max(0, r * r - (d - c) * (d - c)));
  const parseHeights = s => String(s).split(/[\s,;]+/).filter(t => t !== "").map(Number).filter(v => isFinite(v));
  // bent strip: discs of varying width along a centreline (same as strip() in build/pick_shapes.py),
  // sampled once into top / bottom columns. cen(t) -> [x, y up], wid(t) -> mm, t in 0..1.
  function stripTip(o, cen, wid, total) {
    const n = Math.max(80, Math.ceil(total / 0.04)), D = [];
    for (let i = 0; i <= n; i++) { const t = i / n, [x, y] = cen(t); D.push([x, y, wid(t) / 2]); }
    let len = 0; for (const [x, , r] of D) len = Math.max(len, x + r);
    const step = 0.01, m = Math.ceil(len / step) + 2, hi = new Float64Array(m), lo = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      const d = j * step; let a = -Infinity, b = Infinity;
      for (const [x, y, r] of D) { const dx = d - x; if (dx * dx < r * r) { const h = Math.sqrt(r * r - dx * dx); if (y + h > a) a = y + h; if (y - h < b) b = y - h; } }
      if (a === -Infinity) a = b = j ? (hi[j - 1] + lo[j - 1]) / 2 : 0;   // past the nose: close at the nose's height
      hi[j] = a; lo[j] = b;
    }
    const at = (arr, d) => { const f = Math.min(m - 1, Math.max(0, d / step)), i = Math.min(m - 2, Math.floor(f)), t = f - i; return arr[i] * (1 - t) + arr[i + 1] * t; };
    const half = o.shaftH / 2;
    return { len, up: d => at(hi, d) - half, down: d => -at(lo, d) - half };
  }
  // hook centreline: arc of radius R turning up by th, a straight riser, then (paw) a small arc curling the nose forward
  // by curl degrees (hook_centre() in pick_shapes.py, without the curl)
  function hookTip(o, R, thDeg, curlDeg = 0) {
    const sh = o.shaftH, w = o.tipW, rise = Math.max(0.05, o.tipH + sh / 2 - w / 2);
    R = Math.max(0.3, R);
    let th = Math.max(5, Math.min(90, thDeg)) * Math.PI / 180, ar = R * (1 - Math.cos(th));
    if (ar > rise) { th = Math.acos(1 - rise / R); ar = rise; }
    const cu = Math.max(0, Math.min(th - 0.05, curlDeg * Math.PI / 180));
    let rc = Math.max(0.4, 1.4 * w), yc = rc * (Math.cos(th - cu) - Math.cos(th));
    if (cu && ar + yc > rise) { rc *= (rise - ar) / Math.max(1e-6, yc); yc = rise - ar; }
    const Ls = Math.max(0, (rise - ar - yc) / Math.sin(th)), La = R * th, Lc = rc * cu, total = La + Ls + Lc;
    const c = t => { const s = t * total; if (s <= La) { const a = s / R; return [R * Math.sin(a), R * (1 - Math.cos(a))]; }
      const px = R * Math.sin(th), py = ar;
      if (s <= La + Ls) { const d = s - La; return [px + d * Math.cos(th), py + d * Math.sin(th)]; }
      const ph = th - (s - La - Ls) / rc, qx = px + Ls * Math.cos(th), qy = py + Ls * Math.sin(th);
      return [qx + rc * (Math.sin(th) - Math.sin(ph)), qy + rc * (Math.cos(ph) - Math.cos(th))]; };
    return stripTip(o, c, t => sh + (w - sh) * t, total);
  }
  const sweptTip = o => { const rise = o.tipH + o.shaftH / 2 - o.tipW / 2, th = Math.min(Math.PI / 2, 2 * Math.atan2(rise, o.tipL));
    return hookTip(o, o.tipL / Math.sin(th), th * 180 / Math.PI); };
  const TIPS = {
    // hook: bent strip, bend radius bendR, tip leaning forward by `lean` degrees ("gem" kept for old links)
    hook: o => hookTip(o, o.bendR, 90 - o.lean),
    gem: o => hookTip(o, o.bendR, 90 - o.lean),
    // high hook whose nose curls forward (monkey-paw style)
    paw: o => hookTip(o, o.bendR, 90 - o.lean, o.curl),
    // swept hook: one long arc, reach tipL ("curve" kept for old links)
    swept: sweptTip,
    curve: sweptTip,
    // half-diamond: back slope tipL long up to tipH, front slope straight down to the bottom edge (pointed nose)
    halfDiamond: o => { const b = o.tipL, h = o.tipH, sh = o.shaftH, f = 0.85 * (h + sh);
      return { len: b + f, down: flat, up: d => d < b ? h * d / b : h - (h + sh) * (d - b) / f }; },
    ball: o => { const r = o.tipH / 2, p = d => Math.max(0, circ(r, r, d) - o.shaftH / 2); return { len: o.tipH, up: p, down: p }; },
    doubleBall: o => { const r1 = o.tipH / 2, r2 = r1 * 0.64, c2 = r1 + (r1 + r2) * 0.8, half = o.shaftH / 2;
      const p = d => Math.max(0, Math.max(circ(r1, r1, d), circ(c2, r2, d)) - half); return { len: c2 + r2, up: p, down: p }; },
    halfBall: o => ({ len: o.tipH, up: d => circ(o.tipH / 2, o.tipH / 2, d), down: flat }),
    // rake: a strip that waves `peaks` times over tipL; humps up only (Bogota) or up and down (snake). Humps tipH above the shaft top.
    rake: o => { const sh = o.shaftH, w = o.tipW, A = Math.max(0.1, o.tipH + sh / 2 - w / 2), L = o.tipL, k = Math.max(1, Math.round(o.peaks));
      const cy = o.waveStyle === "both" ? t => A * Math.sin(Math.PI * k * t) : t => A * 0.5 * (1 - Math.cos(2 * Math.PI * k * t));
      return stripTip(o, t => [L * t, cy(t)], t => sh + (w - sh) * t, L * 1.5); },
    // sawtooth "strokes": n ramps rising to tipH over `pitch`, then dropping
    saw: o => { const n = Math.max(1, Math.round(o.n)), p = o.pitch;
      return { len: n * p, down: flat, up: d => { const k = Math.min(n - 1, Math.floor(d / p)); return o.tipH * (d - k * p) / p; } }; },
    // comb (COMB in build/pick_shapes.py): stop block (combStop: 2 mm on a flat handle, 8 mm after X-Acto shoulders) rising 10.2 mm above the comb's bottom edge (rests on the lock face),
    // then round-topped teeth tipH tall at first + k * pitch from the stop face. The shaft is the comb body.
    comb: o => { const n = Math.max(1, Math.round(o.n)), p = o.pitch, tw = Math.max(0.3, Math.min(o.tipW, p - 0.5)), r = tw / 2, S = o.combStop || 2;
      const stopUp = Math.max(0, 10.2 - o.shaftH);
      return { len: S + o.first + (n - 1) * p + r + 1.2, down: flat, up: d => {
        if (d < S) return stopUp;
        const k = Math.min(n - 1, Math.max(0, Math.round((d - S - o.first) / p))), dx = Math.abs(d - S - o.first - k * p);
        return dx >= r ? 0 : o.tipH - r + Math.sqrt(r * r - dx * dx); } }; },
    // warded L bit (tip_warded_L in build/generate_home_workshop.py): 1 mm of shaft, then a post tipW wide rising tipH;
    // optional centre slot (half depth) for a ward
    warded: o => { const W = Math.max(1.0, o.tipW), sl = Math.max(0.25, W / 6);
      return { len: 1 + W, down: flat, up: d => d < 1 ? 0 : o.wardSlot && Math.abs(d - 1 - W / 2) < sl ? o.tipH * 0.5 : o.tipH }; },
    // warded T bit (tip_warded_T): the post rises tipH above and below the shaft
    wardedT: o => { const W = Math.max(1.0, o.tipW), f = d => d < 1 ? 0 : o.tipH; return { len: 1 + W, down: f, up: f }; },
    // curtain wrench (tip_curtain): a post tipW wide at the very end, tipH above the shaft
    curtain: o => ({ len: Math.max(1.0, o.tipW), down: flat, up: () => o.tipH }),
    // dimple pick blank (tip_dimple_flag): 6 mm more shaft, then a flag tipL long and tipW tall (bent 90 degrees at the notches)
    dimple: o => { const fl = Math.max(0.5, o.tipL), fw = Math.max(o.shaftH, o.tipW), e = d => d >= 6 ? (fw - o.shaftH) / 2 : Math.abs(d - 6) < 0.15 ? -0.25 : 0;
      return { len: 6 + fl, up: e, down: e }; },
    // lever lifter (old links): a hook with a 5 degree lean
    lever: o => hookTip(o, o.bendR, 85),
    // custom: heights along the tip; a final -shaft height ends on the bottom edge (sloped nose)
    custom: o => {
      const h = parseHeights(o.custom);
      const n = Math.max(2, h.length), step = o.tipL / (n - 1);
      return { len: o.tipL, down: flat, up: d => { const i = Math.min(n - 2, Math.floor(d / step)), t = d / step - i;
        return Math.min(6, Math.max(-o.shaftH, (h[i] || 0) * (1 - t) + (h[i + 1] || 0) * t)); } };
    },
  };

  // ---------- tension bars: orthogonal outline with a step shoulder on each working end, then corner treatments
  // Points carry a tag so each corner can be styled: outer (convex) corners, the tip corner (tip meets its shoulder)
  // and the leg corner (leg meets the shaft).
  function tension(o) {
    o = { ...TENSION_BASE, ...o };
    o.waves = Math.max(1, Math.round(o.waves) || 1);   // whole half-waves only: a fraction leaves a step at the wave end
    const SW = o.shaftW, S = 1.5, L = o.length;
    const legPts = (side, dir, tw, lin) => {   // side: 0 left / 1 right; dir: -1 up / +1 down. Points along the edge.
      // tip style: square end, pointed end (diamond, for the bottom of the keyway) or stepped (front half narrower: tulip locks)
      const st = o.tipStyle, step = st === "stepped" ? Math.max(0.2, o.stepW) : 0, tw2 = tw + step;
      // a relief at the tip corner needs a longer shoulder step to sit in: widen the leg just enough
      const rel = (o.tipCorner === "mouse" || o.tipCorner === "oval") ? o.tipCornerR * (o.tipCorner === "oval" ? o.ovalStretch : 1) : 0;
      const lw = Math.max(tw2 + 0.9, SW, tw2 + 2.2 * rel + 0.4), xo = side ? L : 0, s = side ? -1 : 1, y0 = dir * SW / 2;
      const yS = dir * (SW / 2 + S), yE = yS + dir * lin, c = st === "point" ? Math.min(lin * 0.5, tw * 0.6) : 0, yM = yE - dir * lin * 0.5;
      const pts = c ? [[xo, yE - dir * c, "outer"], [xo + s * tw / 2, yE, "outer"], [xo + s * tw, yE - dir * c, "outer"]] : [[xo, yE, "outer"], [xo + s * tw, yE, "outer"]];
      if (o.serr) {   // small V-notches along the inner (bearing) edge of the tip (front step only on a stepped tip)
        const p = 1.2, a = 0.5, dep = 0.35, room = (step ? lin * 0.5 - 0.3 : lin - (o.tipCorner === "sharp" ? 0 : o.tipCornerR)) - c - 1.2;
        const n = Math.max(0, Math.floor(room / p));
        for (let k = 0; k < n; k++) { const yc = yE - dir * (c + 0.6 + a + k * p);
          pts.push([xo + s * tw, yc + dir * a, "serr"], [xo + s * (tw - dep), yc, "serr"], [xo + s * tw, yc - dir * a, "serr"]); }
      }
      if (step) pts.push([xo + s * tw, yM, "step"], [xo + s * tw2, yM, "outer"]);
      return pts.concat([[xo + s * tw2, yS, "tip"], [xo + s * lw, yS, "outer"], [xo + s * lw, y0, "leg"]]);
    };
    const A = o.endA, B = o.endB, on = e => e && e.type !== "none";
    // optional wave: the whole shaft (both edges) follows k half-sine bumps of amplitude `wave`, zero at the ends;
    // optional thumb pad: the bar swells by `pad` on both edges over padL in the middle
    const wavy = (x0, x1, y, reverse, sg) => {
      if ((!o.wave && !o.pad) || x1 - x0 < 4) return [];
      const out = [], mid = (x0 + x1) / 2, hw = Math.max(1, Math.min(o.padL / 2, (x1 - x0) / 2 - 1));
      const pad = x => !o.pad || Math.abs(x - mid) >= hw ? 0 : o.pad * 0.5 * (1 + Math.cos(Math.PI * (x - mid) / hw));
      for (let x = x0 + 1; x < x1 - 0.5; x += 0.5) out.push([x, y + (o.wave ? o.wave * Math.sin(Math.PI * o.waves * (x - x0) / (x1 - x0)) : 0) + sg * pad(x), "wave"]);
      return reverse ? out.reverse() : out;
    };
    const lTop = on(A) && A.dir < 0 ? legPts(0, -1, A.tip, A.lin) : [[0, -SW / 2, "outer"]];
    const rTop = on(B) && B.dir < 0 ? legPts(1, -1, B.tip, B.lin).reverse() : [[L, -SW / 2, "outer"]];
    const rBot = on(B) && B.dir > 0 ? legPts(1, 1, B.tip, B.lin) : [[L, SW / 2, "outer"]];
    const lBot = on(A) && A.dir > 0 ? legPts(0, 1, A.tip, A.lin).reverse() : [[0, SW / 2, "outer"]];
    const legReach = o.legCorner === "sharp" ? 0 : o.legCornerR;
    const pad = 0.6 + 2 * legReach;                       // wave starts clear of any leg-corner relief or fillet
    const xa = Math.max(lTop[lTop.length - 1][0], lBot[0][0]) + pad, xb = Math.min(rTop[0][0], rBot[rBot.length - 1][0]) - pad;
    const top = lTop.concat(wavy(xa, xb, -SW / 2, false, -1), rTop);
    const bot = rBot.concat(wavy(xa, xb, SW / 2, true, 1), lBot);
    const ring = corners(top.concat(bot), {
      outer: [o.outer, o.outerR], tip: [o.tipCorner, o.tipCornerR], leg: [o.legCorner, o.legCornerR], stretch: o.ovalStretch });
    const off = o.wave ? o.wave * Math.sin(Math.PI * o.waves * ((L / 2 - xa) / Math.max(1, xb - xa))) : 0;   // follow the wave at mid-length
    const vmarks = [["bar height", L / 2, -SW / 2 + off - o.pad, SW / 2 + off + o.pad]], marks = [];
    const endMarks = (e, side) => {
      if (!on(e)) return;
      const yS = e.dir * (SW / 2 + S), yE = yS + e.dir * e.lin, x = side ? L - e.tip / 2 : e.tip / 2;
      vmarks.push(["into lock", x, Math.min(yS, yE), Math.max(yS, yE)]);
      marks.push(["tip width", side ? L - e.tip : 0, side ? L : e.tip]);
    };
    endMarks(A, 0); endMarks(B, 1);
    return finish({ rings: [ring], circles: [], guides: [], marks, vmarks });
  }

  // corner treatments: round (tangent fillet), chamfer, mouse (round relief cut past the corner) or oval relief
  function corners(R, opt) {
    const n = R.length, area = R.reduce((a, p, i) => { const q = R[(i + 1) % n]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
    const inside = (x, y) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const [xi, yi] = R[i], [xj, yj] = R[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    // distance from V along unit direction u to the first crossing of the original outline (material depth)
    const depth = (V, u) => { let best = 1e9;
      for (let i = 0; i < n; i++) { const a = R[i], b = R[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1];
        const den = u[0] * ey - u[1] * ex; if (Math.abs(den) < 1e-12) continue;
        const t = ((a[0] - V[0]) * ey - (a[1] - V[1]) * ex) / den, w = ((a[0] - V[0]) * u[1] - (a[1] - V[1]) * u[0]) / den;
        if (t > 1e-6 && w >= 0 && w <= 1) best = Math.min(best, t); }
      return best; };
    const out = [];
    for (let i = 0; i < n; i++) {
      const P = R[(i - 1 + n) % n], V = R[i], N = R[(i + 1) % n], tag = V[2];
      let [style, size] = opt[tag] || ["sharp", 0];
      if (tag === "leg" && (style === "mouse" || style === "oval")) style = "round";
      if (!style || style === "sharp" || !(size > 0)) { out.push([V[0], V[1]]); continue; }
      const l1 = Math.hypot(V[0] - P[0], V[1] - P[1]), l2 = Math.hypot(N[0] - V[0], N[1] - V[1]);
      if (l1 < 1e-6 || l2 < 1e-6) { out.push([V[0], V[1]]); continue; }
      const d1 = [(V[0] - P[0]) / l1, (V[1] - P[1]) / l1], d2 = [(N[0] - V[0]) / l2, (N[1] - V[1]) / l2];
      if (style === "round" || style === "chamfer") {
        const t = Math.min(size, 0.45 * l1, 0.45 * l2), a = [V[0] - d1[0] * t, V[1] - d1[1] * t], b = [V[0] + d2[0] * t, V[1] + d2[1] * t];
        if (style === "chamfer") { out.push(a, b); continue; }
        for (let k = 0; k <= 10; k++) { const u = k / 10;   // quadratic Bezier with the corner as control point: tangent both ends
          out.push([(1 - u) ** 2 * a[0] + 2 * u * (1 - u) * V[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * u * (1 - u) * V[1] + u * u * b[1]]); }
        continue;
      }
      // reliefs (mouse / oval): an ellipse centred on the corner, axes along the two edges, cut through the material
      const st = style === "oval" ? (opt.stretch || 1.6) : 1;
      let r1 = size * (Math.abs(d1[0]) > Math.abs(d1[1]) ? st : 1), r2 = size * (Math.abs(d2[0]) > Math.abs(d2[1]) ? st : 1);
      r1 = Math.min(r1, 0.5 * l1); r2 = Math.min(r2, 0.5 * l2);   // half an edge each: never meets the next corner
      // and never deeper than 40 % of the metal behind the corner (the arc passes V - d2*r2 and V + d1*r1)
      r2 = Math.min(r2, 0.4 * depth(V, [-d2[0], -d2[1]])); r1 = Math.min(r1, 0.4 * depth(V, d1));   // keep >= 60 % of the section
      const pt = t => [V[0] - d1[0] * r1 * Math.cos(t) + d2[0] * r2 * Math.sin(t), V[1] - d1[1] * r1 * Math.cos(t) + d2[1] * r2 * Math.sin(t)];
      // t = 0 -> on the incoming edge, t = pi/2 -> on the outgoing edge; take the sweep whose middle is inside the material
      const mid = pt(-Math.PI / 2 - Math.PI / 4), dir = inside(mid[0], mid[1]) ? -1 : 1;
      const span = dir < 0 ? -1.5 * Math.PI : 0.5 * Math.PI;
      for (let k = 0; k <= 24; k++) out.push(pt(span * k / 24));
    }
    return out;
  }
  // flat form values -> tension geometry
  function tensionFromForm(o) {
    o = { ...TENSION_BASE, ...o };
    const e = (d, t, l) => d === "none" ? { type: "none" } : { type: "tok", dir: d === "up" ? -1 : 1, tip: t, lin: l };
    return tension({ ...o, endA: e(o.dirA, o.tipA, o.linA), endB: e(o.dirB, o.tipB, o.linB) });
  }
  const build = (tool, o) => fits(tool === "tension" ? tensionFromForm(o) : tool === "outline" ? outline(o) : pick(o), o);
  // does it fit the stock? blade: 10.7 mm usable of a 12.7 mm blade; sheet: the height typed in; none: no limit
  const stockLimit = o => !o || !o.stock || o.stock === "blade" ? BLADE_USABLE : o.stock === "sheet" ? +o.stockH || Infinity : Infinity;
  function fits(g, o) { g.stockLimit = stockLimit(o); g.fitsStock = g.height <= g.stockLimit; return g; }

  // ---------- validation: self-intersection and hole clearance
  function validate(g, minWall = 1.2) {
    const warn = [], R = [];
    // merge repeated points (dropping a zero-length segment instead would break the ring and upset the hole test)
    for (const q of g.rings[0]) if (!R.length || Math.hypot(q[0] - R[R.length - 1][0], q[1] - R[R.length - 1][1]) > 1e-9) R.push(q);
    if (R.length > 1 && Math.hypot(R[0][0] - R[R.length - 1][0], R[0][1] - R[R.length - 1][1]) <= 1e-9) R.pop();
    const n = R.length, segs = [];
    for (let i = 0; i < n; i++) segs.push([R[i], R[(i + 1) % n]]);
    const m = segs.length, orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    let cross = 0;
    for (let i = 0; i < m && cross < 1; i++) {
      const [a, b] = segs[i];
      for (let j = i + 2; j < m; j++) {
        if (i === 0 && j === m - 1) continue;
        const [c, d] = segs[j];
        if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) ||
            Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) continue;
        const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
        if (o1 * o2 < -1e-12 && o3 * o4 < -1e-12) { cross++; break; }
      }
    }
    if (cross) warn.push("Outline crosses itself - change the tip or shaft values");
    const dseg = (p, [a, b]) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / l2)) : 0; return Math.hypot(p.x - a[0] - t * dx, p.y - a[1] - t * dy); };
    g.circles.forEach((c, i) => {
      let inside = false;
      for (const [a, b] of segs) if ((a[1] > c.y) !== (b[1] > c.y) && c.x < (b[0] - a[0]) * (c.y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      const wall = Math.min(...segs.map(s => dseg(c, s))) - c.r;
      if (!inside) warn.push(`Hole ${i + 1} is outside the outline`);
      else if (wall < minWall) warn.push(`Hole ${i + 1} has only ${Math.max(0, wall).toFixed(1)} mm of metal around it (min ${minWall})`);
    });
    g.circles.forEach((c, i) => g.circles.slice(i + 1).forEach((d, j) => {
      const gap = Math.hypot(c.x - d.x, c.y - d.y) - c.r - d.r;
      if (gap < minWall) warn.push(`Holes ${i + 1} and ${i + j + 2} are ${gap < 0 ? "overlapping" : "only " + gap.toFixed(1) + " mm apart"} (min ${minWall})`);
    }));
    return warn.concat(g.notes || []);
  }

  function finish(g) {
    const pts = g.rings.flat().concat(g.circles.flatMap(c => [[c.x - c.r, c.y - c.r], [c.x + c.r, c.y + c.r]]));
    const minX = Math.min(...pts.map(p => p[0])), minY = Math.min(...pts.map(p => p[1]));
    const m = 1;
    g.rings = g.rings.map(r => r.map(([x, y]) => [x - minX + m, y - minY + m]));
    g.circles = g.circles.map(c => ({ ...c, x: c.x - minX + m, y: c.y - minY + m }));
    g.marks = (g.marks || []).map(([l, a, b]) => [l, a - minX + m, b - minX + m]);
    g.vmarks = (g.vmarks || []).map(([l, x, a, b, out]) => [l, x - minX + m, a - minY + m, b - minY + m, out]);
    if (g.cuts) g.cuts = g.cuts.map(x => x - minX + m);
    if (g.focus) g.focus = { x0: g.focus.x0 - minX + m, x1: g.focus.x1 - minX + m, y0: g.focus.y0 - minY + m, y1: g.focus.y1 - minY + m };
    const all = g.rings.flat();
    g.w = Math.max(...all.map(p => p[0])) + m; g.h = Math.max(...all.map(p => p[1])) + m;
    g.length = g.w - 2 * m; g.height = g.h - 2 * m; g.fitsBlade = g.height <= BLADE_USABLE;
    return g;
  }

  const f = v => (+v).toFixed(4);
  function toSVG(g, title) {
    const d = g.rings.map(r => "M " + r.map(p => f(p[0]) + "," + f(p[1])).join(" L ") + " Z").join(" ");
    const c = g.circles.map(k => `<circle cx="${f(k.x)}" cy="${f(k.y)}" r="${f(k.r)}" fill="none" stroke="#ff0000" stroke-width="0.05"/>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(g.w)}mm" height="${f(g.h)}mm" viewBox="0 0 ${f(g.w)} ${f(g.h)}"><title>${title || "custom"}: mm 1:1, no kerf</title>` +
      `<path d="${d}" fill="none" stroke="#ff0000" stroke-width="0.05"/>${c}</svg>`;
  }
  function toDXF(g) {   // R12 ASCII, millimetres, closed POLYLINEs + CIRCLEs on layer CUT (y flipped: DXF is y-up)
    const L = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "4", "9", "$MEASUREMENT", "70", "1",
      "0", "ENDSEC", "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", "1", "0", "LAYER", "2", "CUT", "70", "0", "62", "1", "6", "CONTINUOUS",
      "0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
    for (const r of g.rings) {
      L.push("0", "POLYLINE", "8", "CUT", "66", "1", "70", "1");
      for (const [x, y] of r) L.push("0", "VERTEX", "8", "CUT", "10", f(x), "20", f(-y));
      L.push("0", "SEQEND", "8", "CUT");
    }
    for (const c of g.circles) L.push("0", "CIRCLE", "8", "CUT", "10", f(c.x), "20", f(-c.y), "40", f(c.r));
    L.push("0", "ENDSEC", "0", "EOF");
    return L.join("\n") + "\n";
  }
  return { FLAT_TIPS, flatTip, pick, tension, tensionFromForm, outline, outlineRing, build, validate, toSVG, toDXF, TIPS, BLADE_USABLE, BASE, PICK_BASE, TENSION_BASE,
    OUTLINE_BASE, PRESETS, parseHeights, parsePts, ptsToStr, rdpClosed, fillet, stockLimit, outlineParts };
})();

if (typeof module !== "undefined") module.exports = CK;

// ---------- Node: write one design from a customiser query (build/import_submissions.py)
//   node site/customizer.js --emit "tool=pick&tip=hook&tipH=3" out/stem   -> out/stem.svg + out/stem.dxf
if (typeof process !== "undefined" && process.argv && process.argv.includes("--emit")) {
  const fs = require("fs"), path = require("path"), i = process.argv.indexOf("--emit");
  const query = process.argv[i + 1], stem = process.argv[i + 2];
  try {
    if (!query || !stem) throw new Error("usage: --emit <query> <out-stem>");
    const q = new URLSearchParams(query), tool = ["tension", "outline"].includes(q.get("tool")) ? q.get("tool") : "pick", o = { ...CK.BASE, tool };
    for (const [k, v] of q) {
      if (k === "tool" || k === "name" || !(k in CK.BASE)) continue;
      const d = CK.BASE[k];
      o[k] = typeof d === "boolean" ? v === "1" || v === "true" : typeof d === "number" ? +v : v;
      if (typeof d === "number" && !isFinite(o[k])) throw new Error("bad number for " + k);
    }
    if (tool === "pick" && !(o.tip in CK.TIPS)) throw new Error("unknown tip " + o.tip);
    const g = CK.build(tool, o);
    if (!g.rings[0] || g.rings[0].length < 3 || !isFinite(g.w)) throw new Error("no outline");
    fs.mkdirSync(path.dirname(path.resolve(stem)), { recursive: true });
    fs.writeFileSync(stem + ".svg", CK.toSVG(g, q.get("name") || path.basename(stem))); fs.writeFileSync(stem + ".dxf", CK.toDXF(g));
    const w = CK.validate(g); if (w.length) console.log("WARN " + w.join("; "));
  } catch (e) { console.error(String(e.message || e)); process.exitCode = 1; }
}

// ---------- Node self-test: write one SVG + DXF per preset (and a few extra cases) for the Python checker
if (typeof process !== "undefined" && process.argv && process.argv.includes("--selftest")) {
  const fs = require("fs"), path = require("path");
  const out = process.argv[process.argv.indexOf("--selftest") + 1] || ".";
  fs.mkdirSync(out, { recursive: true });
  let warned = 0, count = 0;
  const emit = (k, tool, o) => {
    const g = CK.build(tool, o), w = CK.validate(g);
    fs.writeFileSync(path.join(out, k + ".svg"), CK.toSVG(g, k)); fs.writeFileSync(path.join(out, k + ".dxf"), CK.toDXF(g));
    count++; if (w.length) warned++;
    console.log(k.padEnd(22), g.length.toFixed(1).padStart(6), "x", g.height.toFixed(1).padStart(5), g.fitsBlade ? "blade-fit" : "tall     ", w.length ? "WARN " + w.join("; ") : "");
  };
  for (const [id, , p] of CK.PRESETS.pick) emit("pick-" + id, "pick", { ...CK.BASE, ...p });
  for (const [id, , p] of CK.PRESETS.tension) emit("tension-" + id, "tension", { ...CK.BASE, ...p });
  // extras: handle variants, X-Acto tang, sweep, lean, serrations, mixed leg directions, drawn profile
  const B = CK.BASE;
  emit("extra-xacto-rake", "pick", { ...B, handle: "xacto", tip: "rake", tipH: 2.2 });
  emit("extra-xacto-tang-hole-big-shoulders", "pick", { ...B, handle: "xacto", tangHole: true, tangHoleD: 2.4, shoulderL: 3.5, shoulderW: 12 });
  emit("extra-xacto-two-tang-holes", "pick", { ...B, handle: "xacto", tangL: 14, tangHole: true, tangHoleX: 4, tangHole2: true, tangHole2X: 10 });
  emit("extra-square-end", "pick", { ...B, handleEnd: "square" });
  emit("extra-point-end", "pick", { ...B, handleEnd: "point", handleL: 70 });
  emit("extra-ball-sweep", "pick", { ...B, tip: "ball", tipH: 4, sweep: -1.5, holes: false });
  emit("extra-hook-lean", "pick", { ...B, tip: "hook", tipH: 3, lean: 45 });
  emit("extra-holes-moved", "pick", { ...B, holeD: 4, hole1: 12, hole2: 44 });
  emit("extra-xacto-flat-edge-swept", "pick", { ...B, handle: "xacto", tip: "swept", tipH: 3, tipL: 4, tipW: 0.9, flatEdge: true });
  emit("extra-xacto-flat-edge-curve", "pick", { ...B, handle: "xacto", tip: "curve", tipH: 2.8, tipL: 3, tipW: 0.9, flatEdge: true, tangHole: true });
  emit("extra-flat-handle-flat-edge-rake", "pick", { ...B, tip: "rake", tipH: 2.2, tipL: 14, peaks: 4, flatEdge: true });
  emit("extra-tension-serr-U", "tension", { ...B, serr: true });
  emit("extra-tension-downdown", "tension", { ...B, dirA: "down", dirB: "down", serr: true });
  emit("extra-tension-Zserr", "tension", { ...B, dirB: "down", linB: 10.7, serr: true });
  emit("extra-tension-chamfer", "tension", { ...B, outer: "chamfer", outerR: 0.6, legCorner: "chamfer", legCornerR: 1.0 });
  emit("extra-tension-mouse-serr", "tension", { ...B, tipCorner: "mouse", legCorner: "round", legCornerR: 1.5, serr: true });
  emit("extra-tension-oval-big-wave", "tension", { ...B, dirB: "down", linB: 10.7, tipCorner: "oval", tipCornerR: 1.2, ovalStretch: 2.5, legCorner: "round", legCornerR: 2.5, wave: -3, waves: 2 });
  // drawn profile: 0.5 mm samples snapped to 0.1 mm over 17 mm (what the canvas produces)
  const drawn = Array.from({ length: 35 }, (_, i) => Math.max(0, +(2.5 + 1.8 * Math.sin(i * 0.5) * Math.cos(i * 0.11)).toFixed(1)));
  drawn[0] = 0; drawn[34] = 0.4;
  emit("extra-drawn-tip", "pick", { ...B, tip: "custom", tipL: 17, custom: drawn.join(" ") });
  // new: tilt (also with the flat edge), fillet, contoured grip, curled hook, warded T, dimple, tension tip styles, thumb pad, outline
  emit("extra-tilt-up", "pick", { ...B, tilt: 6 });
  emit("extra-flat-edge-tilt-down", "pick", { ...B, flatEdge: true, tilt: -4 });
  emit("extra-xacto-flat-edge-tilt-up", "pick", { ...B, handle: "xacto", flatEdge: true, tilt: 5, fillet: true, filletR: 0.4 });
  emit("extra-fillet-diamond", "pick", { ...B, tip: "halfDiamond", tipH: 2, tipL: 2, fillet: true, filletR: 0.5, handleEnd: "square" });
  emit("extra-contour-grip", "pick", { ...B, handle: "contour", handleH: 10, gripSlope: 4 });
  emit("extra-contour-paw-fillet", "pick", { ...B, handle: "contour", tip: "paw", tipH: 4, curl: 50, fillet: true, filletR: 0.3 });
  emit("extra-warded-slot", "pick", { ...B, tip: "warded", tipH: 4, tipW: 2.4, wardSlot: true, shaftH: 2.2 });
  emit("extra-tension-stepped-serr", "tension", { ...B, tipStyle: "stepped", stepW: 0.8, linA: 8, linB: 8, serr: true });
  emit("extra-tension-point-pad", "tension", { ...B, tipStyle: "point", pad: 1.5, padL: 30, wave: 1.5 });
  emit("extra-outline-default", "outline", { ...B, olHoles: true, fillet: true, filletR: 0.5 });
  emit("extra-outline-mix-handle", "outline", { ...B, olPts: "0,4 30,0 60,1 70,3 70,6 60,8 30,10 2,8", olLen: 70, olMix: "handle", olSplit: 66, olHoles: true, tip: "paw", tipH: 4 });
  emit("extra-outline-mix-tip", "outline", { ...B, olPts: "0,1 20,1 24,-3 25,-3 26,1 27,2 0,2", olLen: 27, olMix: "tip", olSplit: 6, olSmooth: 1, handle: "contour" });
  emit("extra-outline-drawn", "outline", { ...B, olPts: "0,4 30,0 90,2 120,3 121,5 90,6 30,9 2,8", olLen: 110, olSmooth: 3, olSnap: 4 });
  console.log(count, "files written,", warned, "with warnings");
  if (warned) process.exitCode = 1;
}

// ---------- browser UI
if (typeof document !== "undefined") {
  const P = "pick", T = "tension";
  const num = (tool, grp, label, u, min, max, step, x = {}) => ({ tool, grp, label, u, min, max, step, ...x });
  const sel = (tool, grp, label, opts, x = {}) => ({ tool, grp, label, type: "select", opts, ...x });
  const O = "outline", PO = [P, O];
  const hasHoles = o => o.tool === O ? o.olHoles : o.handle !== "xacto" && o.holes;
  const flatHandle = o => o.handle === "full" || o.handle === "contour";
  const HOOKISH = ["hook", "gem", "paw", "lever"];
  const F = {
    tool: sel(null, null, "Make a", [["pick", "Pick"], ["tension", "Tension bar"], ["outline", "Freehand / traced outline"]], { bar: true }),
    stock: sel(null, null, "Cut from", [["blade", "Hacksaw blade, 12.7 mm (10.7 usable)"], ["sheet", "Sheet or other stock (I give its height)"], ["none", "No size limit"]], { bar: true }),
    stockH: num(null, null, "Usable height of your stock", "mm", 5, 300, 0.5, { bar: true, only: o => o.stock === "sheet" }),
    // freehand outline (the editor is site/freehand.js)
    olEdit: { tool: O, grp: "Outline", type: "outline", label: "", simple: true },
    olLen: num(O, "Outline", o => o.olMix === "whole" ? "Overall length (scales the whole outline)" : o.olMix === "tip" ? "Length of your working end (scales your drawing / trace)" : "Length of your handle (scales your drawing / trace)", "mm", 20, 250, 0.5, { simple: true }),
    olSmooth: num(O, "Outline", "Smoothing (0 = keep every corner)", "", 0, 4, 1, { simple: true }),
    olSnap: num(O, "Outline", "Straighten lines within this angle of level or upright (0 = off)", "deg", 0, 15, 0.5),
    olMix: sel(O, "Outline", "Use my outline as", [["whole", "The whole pick"], ["handle", "The handle: add the neck, shaft and tip from Pick settings"],
      ["tip", "The working end: add the handle and neck from Pick settings"]], { simple: true }),
    olSplit: num(O, "Outline", o => o.olMix === "tip" ? "Where your working end starts (mm from the left; drag the blue line)" : "Where your handle ends (mm from the left; drag the blue line)",
      "mm", 0, 250, 0.5, { simple: true, only: o => o.olMix !== "whole" }),
    olBlend: num(O, "Outline", "Blend at the join (mm; 0 = a hard join)", "mm", 0, 30, 0.5, { simple: true, only: o => o.olMix !== "whole" }),
    olPts: { tool: O, grp: "Outline", label: "Outline points, x,y in mm (copy or paste a whole outline)", type: "text" },
    olHoles: { tool: O, grp: "Handle", label: "Two screw holes (moved if needed so they sit inside the outline)", type: "check", simple: true, only: o => o.olMix !== "tip" },
    // handle
    handle: sel(P, "Handle", "Handle type", [["full", "Flat handle"], ["contour", "Contoured grip (own shape: butt, belly, finger notch)"], ["xacto", "X-Acto / DIY bar tang"]], { simple: true }),
    handleL: num(P, "Handle", "Handle length", "mm", 30, 90, 1, { only: flatHandle }),
    handleH: num(P, "Handle", "Handle height (top to bottom)", "mm", 6, 14, 0.1, { only: flatHandle }),
    handleEnd: sel(P, "Handle", "Handle end shape", [["round", "Rounded"], ["square", "Square"], ["point", "Pointed"]], { only: o => o.handle === "full" }),
    gripButt: num(P, "Handle", "Butt swell: how far the end drops below the grip", "mm", 0, 4, 0.1, { only: o => o.handle === "contour" }),
    gripBelly: num(P, "Handle", "Belly: bulge under the fingers (minus = hollow)", "mm", -1.5, 3, 0.1, { only: o => o.handle === "contour" }),
    gripWaist: num(P, "Handle", "Finger notch depth", "mm", 0, 3, 0.1, { only: o => o.handle === "contour" }),
    gripWaistPos: num(P, "Handle", "Finger notch position (0.55 = mid grip, 0.92 = near the neck)", "", 0.55, 0.92, 0.01, { only: o => o.handle === "contour" }),
    gripSlope: num(P, "Handle", "Grip slope: butt raised (+) or lowered (−)", "deg", -12, 12, 0.5, { only: o => o.handle === "contour" }),
    flatEdge: { tool: P, grp: "Handle", label: "Flat edge: the handle's underside is one straight line (lay it on a blade's back or a sheet edge: no cutting on that side)", type: "check", simple: true,
      only: o => !["ball", "doubleBall", "wardedT", "dimple"].includes(o.tip) && o.handle !== "contour" },
    holes: { tool: P, grp: "Handle", label: "Two screw holes (to bolt on handle scales)", type: "check", simple: true, only: o => o.handle !== "xacto" },
    holeD: num(PO, "Handle", "Screw hole diameter (3.4 fits M3)", "mm", 2, 5, 0.05, { only: hasHoles }),
    hole1: num(PO, "Handle", "Hole 1: distance from the handle end", "mm", 5, 85, 0.5, { only: hasHoles }),
    hole2: num(PO, "Handle", "Hole 2: distance from the handle end", "mm", 5, 85, 0.5, { only: hasHoles }),
    tangW: num(P, "Handle", "Tang width (the part the knife grips; cut the fit tests to find yours)", "mm", 5.0, 6.4, 0.05, { only: o => o.handle === "xacto" }),
    tangL: num(P, "Handle", "Tang length (how far it goes into the knife)", "mm", 6, 16, 0.5, { only: o => o.handle === "xacto" }),
    shoulderL: num(P, "Handle", "Shoulder thickness (along the pick)", "mm", 0.8, 6, 0.1, { only: o => o.handle === "xacto" }),
    shoulderW: num(P, "Handle", "Shoulder width (stop against the collet)", "mm", 7, 14, 0.1, { only: o => o.handle === "xacto" }),
    tangHole: { tool: P, grp: "Handle", label: "Hole through the tang (for the DIY bar grub screw)", type: "check", simple: true, only: o => o.handle === "xacto" },
    tangHoleD: num(P, "Handle", "Tang hole diameter", "mm", 1.2, 3.5, 0.05, { only: o => o.handle === "xacto" && o.tangHole }),
    tangHoleX: num(P, "Handle", "Tang hole, distance in front of the shoulders", "mm", 2, 15, 0.1, { only: o => o.handle === "xacto" && o.tangHole }),
    tangHole2: { tool: P, grp: "Handle", label: "Second tang hole (two grub screws; lengthen the tang to ~14 mm)", type: "check", only: o => o.handle === "xacto" && o.tangHole },
    tangHole2X: num(P, "Handle", "Second hole, distance in front of the shoulders", "mm", 2, 15, 0.1, { only: o => o.handle === "xacto" && o.tangHole && o.tangHole2 }),
    // shaft
    neckL: num(P, "Shaft", "Neck length (where the handle narrows to the shaft)", "mm", 6, 30, 0.5, { only: o => o.tip !== "comb" }),
    shaftL: num(P, "Shaft", "Shaft length (the thin part before the tip)", "mm", 15, 75, 0.5, { simple: true, only: o => o.tip !== "comb" }),
    shaftH: num(P, "Shaft", o => o.tip === "comb" ? "Comb body height (under the teeth; 2 mm slides under the pins)" : "Shaft height (taller = stiffer, but less room in the keyway)", "mm", 0.8, 3, 0.05, { simple: true }),
    tilt: num(P, "Shaft", o => o.flatEdge ? "Tilt the shaft and tip up (+) or down (−) — works with the flat edge" : "Tilt the shaft and tip up (+) or down (−)", "deg", -15, 15, 0.5, { simple: true, only: o => o.tip !== "comb" }),
    sweep: num(P, "Shaft", "Shaft offset at the tip (minus = up, plus = down)", "mm", -4, 4, 0.1, { only: o => !o.flatEdge && o.tip !== "comb" }),
    // tip
    tip: sel(P, "Tip", "Tip shape", [["hook", "Hook"], ["paw", "High hook, curled nose (monkey-paw style)"], ["swept", "Swept hook (shaft curves up)"], ["halfDiamond", "Half-diamond"],
      ["rake", "Rake (waves)"], ["saw", "Sawtooth strokes"], ["halfBall", "Half-ball"], ["ball", "Ball"], ["doubleBall", "Double ball"], ["comb", "Comb"],
      ["warded", "Warded L bit"], ["wardedT", "Warded T bit"], ["curtain", "Curtain wrench (lever locks)"], ["dimple", "Dimple blank (flag)"], ["custom", "Custom / drawn"]]),
    tipH: num(P, "Tip", o => ({ comb: "Tooth height (5 mm reaches past the shear line)", ball: "Ball diameter", doubleBall: "Front ball diameter", halfBall: "Half-ball diameter",
      rake: "Hump height above the shaft (front hump)", warded: "Bit height above the shaft", wardedT: "Bit height each side of the shaft", curtain: "Bit height above the shaft" })[o.tip] || "Tip height above the shaft",
      "mm", 0.5, 8, 0.1, { simple: true, only: o => !["dimple", "custom"].includes(o.tip) }),
    tipW: num(P, "Tip", o => ({ comb: "Tooth width (pin holes are about 2.9 mm)", warded: "Bit width", wardedT: "Bit width", curtain: "Bit width", rake: "Strip width at the tip", dimple: "Flag width (across the shaft)" })[o.tip] || "Width of the hook at its tip",
      "mm", 0.6, 4, 0.05, { only: o => ["hook", "curve", "swept", "gem", "paw", "warded", "wardedT", "curtain", "dimple", "lever", "comb", "rake"].includes(o.tip) }),
    tipL: num(P, "Tip", o => ({ swept: "Reach: how far forward the curve runs", curve: "Reach: how far forward the curve runs", halfDiamond: "Back slope length (longer = gentler)", rake: "Length of the wavy part", dimple: "Flag length (the part you bend)" })[o.tip] || "Tip length",
      "mm", 0.5, 25, 0.1, { only: o => ["halfDiamond", "rake", "custom", "curve", "swept", "dimple"].includes(o.tip) }),
    bendR: num(P, "Tip", "Bend radius where the shaft turns up (bigger = gentler)", "mm", 0.6, 6, 0.1, { only: o => HOOKISH.includes(o.tip) }),
    lean: num(P, "Tip", "Tip lean forward (0 = straight up)", "deg", 0, 60, 1, { only: o => ["hook", "gem", "paw"].includes(o.tip) }),
    curl: num(P, "Tip", "Nose curl: how far the top of the hook turns forward", "deg", 0, 80, 1, { only: o => o.tip === "paw" }),
    wardSlot: { tool: P, grp: "Tip", label: "Slot in the bit (clears a centre ward)", type: "check", only: o => o.tip === "warded" },
    waveStyle: sel(P, "Tip", "Wave direction", [["up", "Up only (Bogota)"], ["both", "Up and down (snake)"]], { only: o => o.tip === "rake" }),
    peaks: num(P, "Tip", "Number of humps", "", 1, 6, 1, { only: o => o.tip === "rake" }),
    n: num(P, "Tip", o => o.tip === "comb" ? "Number of teeth (one per pin)" : "Number of teeth", "", 2, 8, 1, { only: o => ["comb", "saw"].includes(o.tip) }),
    pitch: num(P, "Tip", o => o.tip === "comb" ? "Tooth spacing (Kwikset 3.81, Schlage 3.96)" : "Tooth spacing", "mm", 1.5, 6, 0.01, { only: o => ["comb", "saw"].includes(o.tip) }),
    first: num(P, "Tip", "First tooth from the stop (Kwikset 6.27, Schlage 5.87)", "mm", 3, 9, 0.01, { only: o => o.tip === "comb" }),
    draw: { tool: P, grp: "Tip", type: "draw", label: "Draw the top edge of the tip (click or drag)", simple: true, only: o => o.tip === "custom" },
    custom: { tool: P, grp: "Tip", label: "Tip heights in mm, evenly spaced, front to back (end on -shaft height for a pointed nose)", type: "text", only: o => o.tip === "custom" },
    // finish (picks and outlines)
    fillet: { tool: PO, grp: "Finish", label: "Round off sharp corners (fillet)", type: "check", simple: true },
    filletR: num(PO, "Finish", "Fillet radius", "mm", 0.1, 3, 0.05, { simple: true, only: o => o.fillet }),
    filletA: num(PO, "Finish", "Round corners sharper than (90 = right angles only)", "deg", 10, 120, 1, { only: o => o.fillet }),
    // tension
    length: num(T, "Bar", "Overall length", "mm", 50, 110, 0.5, { simple: true }),
    shaftW: num(T, "Bar", "Bar height (top to bottom edge)", "mm", 2.4, 5, 0.1, { simple: true }),
    wave: num(T, "Bar", "Body wave height (0 = straight bar)", "mm", -4, 4, 0.1),
    waves: num(T, "Bar", "Number of bends in the body", "", 1, 4, 1, { only: o => o.wave !== 0 }),
    pad: num(T, "Bar", "Thumb pad: how much the middle swells each side (0 = none)", "mm", 0, 3, 0.1),
    padL: num(T, "Bar", "Thumb pad length", "mm", 8, 60, 0.5, { only: o => o.pad > 0 }),
    dirA: sel(T, "Tension ends", "Left end: tip points", [["up", "Up"], ["down", "Down"], ["none", "None"]]),
    tipA: num(T, "Tension ends", "Left tip width (how much of the keyway height it fills)", "mm", 1.8, 4.5, 0.1, { simple: true, only: o => o.dirA !== "none" }),
    linA: num(T, "Tension ends", "Left tip length into the lock (4.7 stops before pin 1)", "mm", 2, 14, 0.1, { simple: true, only: o => o.dirA !== "none" }),
    dirB: sel(T, "Tension ends", "Right end: tip points", [["up", "Up"], ["down", "Down"], ["none", "None"]]),
    tipB: num(T, "Tension ends", "Right tip width", "mm", 1.8, 4.5, 0.1, { only: o => o.dirB !== "none" }),
    linB: num(T, "Tension ends", "Right tip length into the lock (10.7 for recessed plugs)", "mm", 2, 14, 0.1, { only: o => o.dirB !== "none" }),
    tipStyle: sel(T, "Tension ends", "Tip shape", [["square", "Square end"], ["stepped", "Stepped (staircase, for tulip locks)"], ["point", "Pointed (diamond, bottom of the keyway)"]], { simple: true }),
    stepW: num(T, "Tension ends", "Step: how much wider the back half of the tip is", "mm", 0.2, 1.5, 0.05, { only: o => o.tipStyle === "stepped" }),
    serr: { tool: T, grp: "Tension ends", label: "Grip notches on the tips (serrations)", type: "check" },
    // corners
    outer: sel(T, "Corners", "Outside corners", [["sharp", "Sharp"], ["round", "Rounded (fillet)"], ["chamfer", "Chamfer"]], { simple: true }),
    outerR: num(T, "Corners", "Outside corner radius / chamfer size", "mm", 0.1, 2, 0.05, { only: o => o.outer !== "sharp" }),
    tipCorner: sel(T, "Corners", "Tip corner (tip meets its shoulder)",
      [["sharp", "Sharp"], ["round", "Rounded"], ["mouse", "Mouse bite (sits flush on the plug face)"], ["oval", "Oval relief (Reaper-style scoop)"]], { simple: true }),
    tipCornerR: num(T, "Corners", "Tip corner radius / relief size", "mm", 0.2, 1.5, 0.05, { only: o => o.tipCorner !== "sharp" }),
    legCorner: sel(T, "Corners", "Leg corner (leg meets the bar)",            // no reliefs here: they undercut the shoulder
      [["sharp", "Sharp"], ["round", "Rounded"], ["chamfer", "Chamfer"]]),
    legCornerR: num(T, "Corners", "Leg corner radius / chamfer size", "mm", 0.2, 3, 0.05, { only: o => o.legCorner !== "sharp" }),
    ovalStretch: num(T, "Corners", "Oval relief stretch (1 = round)", "×", 1, 3, 0.1, { only: o => o.tipCorner === "oval" }),
  };
  for (const [k, fl] of Object.entries(F)) fl.v = k === "tool" ? "pick" : CK.BASE[k];
  const DEF = { pick: "hookM", tension: "U", outline: "start" };
  const has = (fl, t) => !!fl.tool && [].concat(fl.tool).includes(t);
  // outline tool, mixed: "tip only" borrows the pick's handle and neck, "handle only" its shaft and tip
  const mixShow = (k, fl, o) => o.tool === O && has(fl, P) && (o.olMix === "tip" ? fl.grp === "Handle" : o.olMix === "handle" ? fl.grp === "Shaft" || fl.grp === "Tip" : false);
  // short labels for the step layout (the full label is behind the "?" and in "Show every setting")
  const SHORT = { stockH: "Stock height", olLen: o => o.olMix === "whole" ? "Overall length" : o.olMix === "tip" ? "Working-end length" : "Handle length",
    olSmooth: "Smoothing", olSnap: "Straighten lines", olMix: "My outline is", olSplit: o => o.olMix === "tip" ? "Working end starts at" : "Handle ends at",
    olBlend: "Blend at the join", olPts: "Outline points (x,y mm)", olHoles: "Two screw holes", handleH: "Handle height", handleEnd: "End shape",
    gripButt: "Butt swell", gripBelly: "Belly bulge", gripWaist: "Finger notch depth", gripWaistPos: "Finger notch position", gripSlope: "Grip slope",
    flatEdge: "Flat bottom edge", holes: "Two screw holes", holeD: "Hole diameter", hole1: "Hole 1 position", hole2: "Hole 2 position",
    tangW: "Tang width", tangL: "Tang length", shoulderL: "Shoulder thickness", shoulderW: "Shoulder width", tangHole: "Hole through the tang",
    tangHoleX: "Tang hole position", tangHole2: "Second tang hole", tangHole2X: "Second hole position", neckL: "Neck length", shaftL: "Shaft length",
    shaftH: o => o.tip === "comb" ? "Comb body height" : "Shaft height", tilt: "Shaft tilt", sweep: "Shaft offset at the tip",
    tipH: o => ({ comb: "Tooth height", ball: "Ball diameter", doubleBall: "Front ball diameter", halfBall: "Half-ball diameter", rake: "Hump height",
      warded: "Bit height", wardedT: "Bit height", curtain: "Bit height" })[o.tip] || "Tip height",
    tipW: o => ({ comb: "Tooth width", warded: "Bit width", wardedT: "Bit width", curtain: "Bit width", rake: "Strip width", dimple: "Flag width" })[o.tip] || "Hook width at the tip",
    tipL: o => ({ swept: "Reach", curve: "Reach", halfDiamond: "Back slope length", rake: "Wavy part length", dimple: "Flag length" })[o.tip] || "Tip length",
    bendR: "Bend radius", lean: "Tip lean", curl: "Nose curl", wardSlot: "Slot in the bit", pitch: "Tooth spacing", first: "First tooth position",
    custom: "Tip heights (mm)", fillet: "Round sharp corners", filletA: "Only corners sharper than", shaftW: "Bar height", wave: "Body wave height",
    waves: "Number of bends", pad: "Thumb pad swell", dirA: "Left tip points", tipA: "Left tip width", linA: "Left tip length", dirB: "Right tip points",
    tipB: "Right tip width", linB: "Right tip length", stepW: "Step width", serr: "Grip notches", outerR: "Outside corner size", tipCorner: "Tip corner",
    tipCornerR: "Tip corner size", legCorner: "Leg corner", legCornerR: "Leg corner size", ovalStretch: "Oval relief stretch" };
  const shortOf = (k, o) => typeof SHORT[k] === "function" ? SHORT[k](o) : SHORT[k];

  const root = document.getElementById("ck-form"), view = document.getElementById("ck-view"), info = document.getElementById("ck-info"), warnEl = document.getElementById("ck-warn");
  { const pin = view.closest(".ck-pin"), res = pin && pin.querySelector(".ck-res");   // the preview can be folded away (it stays small while you edit)
    if (res) { const b = document.createElement("button"); b.type = "button"; b.className = "ck-hide"; b.id = "ck-pin-toggle"; b.textContent = "Hide preview";
      b.onclick = () => { const m = pin.classList.toggle("min"); b.textContent = m ? "Show preview" : "Hide preview"; }; res.appendChild(b); } }
  if (root) {
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
    const els = {}, rngs = {}, rows = {}, sets = {}, labs = {}, rss = {};
    const labelOf = (fl, o) => typeof fl.label === "function" ? fl.label(o) : fl.label;
    // "Neck length (where the handle narrows)": the main words stay bright, the bracket becomes a muted hint; the full text is the tooltip
    // step layout: the short label (.ls) shows instead (CSS), the full text goes behind the "?" (el._q, made in the step-layout block)
    const setLab = (el, t, s) => {
      const m = /^(.*?[^\s(])\s+\(([^()]{5,})\)$/.exec(t); el.textContent = ""; el.title = t;
      const ll = mk("span", "ll", m ? m[1] : t); if (m) { const h = mk("span", "hint", "(" + m[2] + ")"); ll.append(" ", h); }
      el.append(ll, mk("span", "ls", s || (m ? m[1] : t))); el.dataset.more = s && s !== t || m ? "1" : "";
      if (el._q) el._q.title = t;
    };
    const bar = mk("div", "ck-bar"); root.append(bar);
    const advBox = document.createElement("input"); advBox.type = "checkbox"; advBox.id = "ck-adv"; advBox.checked = false;   // ticked: every setting in groups (the old layout); unticked: the step layout
    const start = document.createElement("select"); start.id = "ck-start";
    let lastStart = { ...DEF }, canvas = null, applied = { ...DEF };   // applied: preset last loaded (kept while you edit)
    const curTool = () => els.tool.value;
    const fillStart = () => {
      start.innerHTML = ""; start.add(new Option("Custom (your own values)", ""));
      CK.PRESETS[curTool()].forEach(([id, label]) => start.add(new Option(label, id)));
      start.value = lastStart[curTool()] || "";
    };
    const touch = k => {
      if (k === "olMix") {   // tip only: the whole drawing is the working end (join at 0, ~40 mm); handle only: join at its end
        const m = els.olMix.value, L = clampNum(F.olLen, els.olLen.value);
        if (m === "tip") { if (L > 70) setVal("olLen", 40); setVal("olSplit", 0); }
        if (m === "handle") { const L2 = L > 100 ? 62 : L; setVal("olLen", L2); setVal("olSplit", L2); }
      }
      if (k === "tool") fillStart(); else { lastStart[curTool()] = ""; start.value = ""; } draw();
    };
    let olHost = null;
    for (const [k, fl] of Object.entries(F)) {
      const row = mk("div", "f"); row.dataset.k = k; rows[k] = row;
      // per-field reset: back to the started-from preset's value, else the default
      let rs = null;
      if (!fl.bar && fl.type !== "draw" && fl.type !== "outline") {
        rs = mk("button", "rs", "↺"); rs.type = "button"; rs.title = "Reset this field"; rs.setAttribute("aria-label", "Reset " + labelOf(fl, CK.BASE));
        rs.onclick = () => {
          const id = applied[curTool()], p = id ? (CK.PRESETS[curTool()].find(x => x[0] === id) || [])[2] : null;
          setVal(k, p && k in p ? p[k] : fl.v); draw();
        };
      }
      if (rs) rss[k] = rs;
      const hd = lab => { const h = mk("div", "hd"); h.append(lab); if (rs) h.append(rs); return h; };
      let input;
      if (fl.type === "outline") { olHost = mk("div", ""); olHost.id = "ck-ol-host"; row.append(olHost); els[k] = olHost; }
      else if (fl.type === "draw") {
        canvas = document.createElement("canvas"); canvas.id = "ck-canvas"; canvas.width = 500; canvas.height = 120;
        const b = mk("div", "ck-draw-btns"), cl = mk("button", "", "Clear"), sm = mk("button", "", "Smooth");
        cl.type = sm.type = "button"; cl.id = "ck-clear"; sm.id = "ck-smooth"; b.append(cl, sm);
        row.append(mk("span", "t", labelOf(fl, CK.BASE)), canvas, b); els[k] = canvas;
        cl.onclick = () => setHeights(new Array(sampleN()).fill(0));
        sm.onclick = () => { const h = heights(); setHeights(h.map((v, i) => (h[Math.max(0, i - 1)] + v + h[Math.min(h.length - 1, i + 1)]) / 3)); };
      } else {
        if (fl.type === "select") { input = document.createElement("select"); fl.opts.forEach(([v, t]) => input.add(new Option(t, v, false, v === fl.v))); }
        else if (fl.type === "check") { input = document.createElement("input"); input.type = "checkbox"; input.checked = fl.v; }
        else if (fl.type === "text") { input = document.createElement("input"); input.type = "text"; input.value = fl.v; }
        else { input = document.createElement("input"); input.type = "number"; Object.assign(input, { min: fl.min, max: fl.max, step: fl.step, value: fl.v }); }
        input.id = "ck-" + k; els[k] = input;
        const lab = mk("label", "t"); setLab(lab, labelOf(fl, CK.BASE), shortOf(k, CK.BASE)); lab.htmlFor = input.id; labs[k] = lab;
        if (fl.type === "check") { row.classList.add("chk"); row.append(input, lab); if (rs) row.append(rs); input.addEventListener("change", () => {
          if (k === "tangHole2" && input.checked && clampNum(F.tangL, els.tangL.value) < 14) { setVal("tangL", 14); setVal("tangHoleX", 4); setVal("tangHole2X", 10); }
          touch(k); }); }
        else if (fl.min !== undefined) {
          const r = document.createElement("input"); r.type = "range"; Object.assign(r, { min: fl.min, max: fl.max, step: fl.step, value: fl.v }); r.id = "ck-" + k + "-r"; rngs[k] = r;
          const rw = mk("div", "row"), u = mk("span", "u", fl.u || "");
          r.addEventListener("input", () => { input.value = r.value; touch(k); });
          input.addEventListener("input", () => { r.value = input.value; touch(k); });
          const lim = mk("span", "lim"); input.title = r.title = `${fl.min}–${fl.max} ${fl.u || ""}`.trim();
          input.addEventListener("change", () => { const t = input.value.trim(), v = clampNum(fl, input.value);
            if (+input.value !== v || t === "") { input.value = r.value = v; touch(k);
              lim.textContent = t === "" ? `Empty: back to ${v} ${fl.u || ""}` : `Allowed ${fl.min}–${fl.max} ${fl.u || ""}: ${t} was changed to ${v}`;
              clearTimeout(lim._t); lim._t = setTimeout(() => { lim.textContent = ""; }, 6000); } });
          rw.append(r, input, u); row.append(hd(lab), rw, lim);
        } else { row.append(hd(lab), input); input.addEventListener(fl.type === "select" ? "change" : "input", () => touch(k)); }
      }
      if (fl.bar) { bar.append(row); continue; }
      if (!sets[fl.grp]) { const fs = mk("details", "grp"), gb = mk("div", "gb"); fs.open = true; fs.append(mk("summary", "", fl.grp), gb); fs._b = gb; sets[fl.grp] = fs; root.append(fs); }
      sets[fl.grp]._b.append(row);
    }
    // toolbar: start-from preset, advanced toggle, reset
    const sRow = mk("div", "f"), sl = mk("label", "t", "Start from"); sl.htmlFor = "ck-start"; sRow.append(sl, start);
    const aRow = mk("div", "ck-actions"), al = mk("label", "chk", ""); al.append(advBox, document.createTextNode(" Show every setting")); al.title = "Every field on one page, in groups, instead of step by step";
    const reset = mk("button", "", "Reset all"); reset.type = "button"; reset.id = "ck-reset"; reset.title = "Put every value back to the design you started from";
    const dimBox = document.createElement("input"); dimBox.type = "checkbox"; dimBox.id = "ck-dims"; dimBox.checked = true;
    const dl = mk("label", "chk", ""); dl.append(dimBox, document.createTextNode(" Show dimensions")); dl.title = "Dimension lines on the preview only; downloads never include them";
    dimBox.addEventListener("change", () => draw());
    aRow.append(dl, al, reset); bar.insertBefore(sRow, rows.stock); bar.append(aRow);
    fillStart();

    // typed values are clamped to the field's range; empty or non-numeric falls back to the default
    const clampNum = (fl, s) => { const v = parseFloat(s); return String(s).trim() === "" || !isFinite(v) ? fl.v : Math.min(fl.max, Math.max(fl.min, v)); };
    const read = () => Object.fromEntries(Object.entries(F).filter(([, fl]) => fl.type !== "draw" && fl.type !== "outline").map(([k, fl]) => {
      const el = els[k];
      return [k, fl.type === "check" ? el.checked : (fl.type === "select" || fl.type === "text") ? el.value : clampNum(fl, el.value)];
    }));
    const setVal = (k, v) => { const fl = F[k]; if (fl.type === "draw" || fl.type === "outline") return; if (fl.type === "check") els[k].checked = !!v; else {
      if (fl.type !== "select" && fl.type !== "text" && typeof fl.min === "number" && String(v).trim() !== "" && isFinite(+v)) v = Math.min(fl.max, Math.max(fl.min, +v));   // the field shows what is used
      els[k].value = v; if (rngs[k]) rngs[k].value = v; } };
    const checkpoint = () => { if (curTool() === "outline" && window.CKFreehand && window.CKFreehand.checkpoint) window.CKFreehand.checkpoint(); };   // Undo can bring the outline back
    const unclear = () => { if (window.CKFreehand && window.CKFreehand.unclear) window.CKFreehand.unclear(); };   // a preset refills an outline wiped by Clear outline
    start.addEventListener("change", () => {
      const id = start.value; if (!id) { lastStart[curTool()] = ""; return; }
      checkpoint();
      const tool = curTool(), p = CK.PRESETS[tool].find(x => x[0] === id)[2], vals = { ...CK.BASE, ...p };
      for (const [k, fl] of Object.entries(F)) if (has(fl, tool) && !(tool === P && fl.grp === "Handle")) setVal(k, vals[k]);   // handle choices are kept
      lastStart[tool] = id; applied[tool] = id; unclear(); draw();
    });
    // Reset all: keep the tool (pick / tension bar) and the chosen design; put every value back to that design's values
    reset.onclick = () => {
      checkpoint();
      const tool = curTool(), id = applied[tool] || lastStart[tool] || DEF[tool];
      const p = (CK.PRESETS[tool].find(x => x[0] === id) || [])[2] || {}, vals = { ...CK.BASE, ...p };
      for (const [k, fl] of Object.entries(F)) if (!fl.bar) setVal(k, has(fl, tool) && k in vals ? vals[k] : fl.v);   // the stock setting is kept
      lastStart[tool] = id; applied[tool] = id; fillStart(); unclear(); draw();
    };
    // Library page hook: load a library design (URL query string) into the customiser as a preset
    window.ckLoad = query => {
      const q = new URLSearchParams(query), tool = ["tension", "outline"].includes(q.get("tool")) ? q.get("tool") : "pick", p = {};
      for (const [k, v] of q) {
        if (k === "tool" || k === "name" || !(k in F) || F[k].type === "draw" || F[k].type === "outline" || F[k].bar) continue;
        const fl = F[k];
        if (fl.type === "check") p[k] = v === "1" || v === "true";
        else if (fl.type === "select") { if ([...els[k].options].some(o => o.value === v)) p[k] = v; }
        else if (fl.type === "text") p[k] = v;
        else p[k] = clampNum(fl, v);
      }
      CK.PRESETS[tool] = CK.PRESETS[tool].filter(x => x[0] !== "lib");
      CK.PRESETS[tool].unshift(["lib", "From the library: " + (q.get("name") || "design"), p]);
      setVal("tool", tool);
      const vals = { ...CK.BASE, ...p };
      const used = (k, fl) => has(fl, tool) || mixShow(k, fl, { ...vals, tool });   // outline + Tip only / Handle only: the pick's handle / tip fields too
      for (const [k, fl] of Object.entries(F)) if (!fl.bar) setVal(k, used(k, fl) && k in vals ? vals[k] : fl.v);
      lastStart[tool] = "lib"; applied[tool] = "lib"; fillStart(); unclear(); draw();
      if (window.ckStep) window.ckStep(q.get("step") || "shape");   // a library design opens on its Shape step (or &step=)
    };
    advBox.addEventListener("change", draw);

    // ---------- tip drawing canvas: heights sampled every 0.5 mm along tipL, snapped to 0.1 mm; kept in sync with the text box
    const CH = 6;   // canvas height in mm
    const sampleN = () => Math.max(3, Math.round(clampNum(F.tipL, els.tipL.value) / 0.5) + 1);
    const heights = () => {   // resample the text heights to the canvas samples
      const h = CK.parseHeights(els.custom.value), N = sampleN(); if (h.length < 2) return new Array(N).fill(0);
      return Array.from({ length: N }, (_, i) => { const x = i / (N - 1) * (h.length - 1), a = Math.floor(x), t = x - a; return (h[a] || 0) * (1 - t) + (h[Math.min(h.length - 1, a + 1)] || 0) * t; });
    };
    const snap = v => Math.max(0, Math.min(CH, Math.round(v * 10) / 10));
    function setHeights(h) { els.custom.value = h.map(v => +snap(v).toFixed(1)).join(" "); lastStart[curTool()] = ""; start.value = ""; draw(); }
    function drawCanvas(o) {
      const c = canvas, x = c.getContext("2d"), W = c.width, H = c.height, L = o.tipL, h = heights();
      x.fillStyle = "#0d1114"; x.fillRect(0, 0, W, H);
      x.strokeStyle = "#243038"; x.lineWidth = 1; x.beginPath();
      for (let i = 0; i <= L + 1e-6; i++) { const px = Math.round(i / L * W) + 0.5; x.moveTo(px, 0); x.lineTo(px, H); }
      for (let j = 0; j <= CH; j++) { const py = H - Math.round(j / CH * H) + 0.5; x.moveTo(0, py); x.lineTo(W, py); }
      x.stroke();
      x.beginPath(); x.moveTo(0, H);
      h.forEach((v, i) => x.lineTo(i / (h.length - 1) * W, H - v / CH * H)); x.lineTo(W, H); x.closePath();
      x.fillStyle = "#3a1b1d"; x.fill(); x.strokeStyle = "#ff6b6b"; x.lineWidth = 2; x.stroke();
      x.fillStyle = "#6f7d87"; x.font = "11px system-ui"; x.fillText(`${L} mm long, ${CH} mm high, 1 mm grid`, 6, 13);
    }
    let dragging = false, lastI = -1, lastV = 0;
    const paint = e => {
      const r = canvas.getBoundingClientRect(), N = sampleN(), h = heights();
      const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      const i = Math.round(px * (N - 1)), v = snap((1 - py) * CH);
      if (lastI >= 0 && lastI !== i) { const a = Math.min(i, lastI), b = Math.max(i, lastI); for (let j = a; j <= b; j++) h[j] = lastV + (v - lastV) * (j - lastI) / (i - lastI); } else h[i] = v;
      lastI = i; lastV = v; setHeights(h);
    };
    canvas.addEventListener("pointerdown", e => { dragging = true; lastI = -1; canvas.setPointerCapture(e.pointerId); paint(e); });
    canvas.addEventListener("pointermove", e => { if (dragging) paint(e); });
    const stop = () => { dragging = false; lastI = -1; };
    canvas.addEventListener("pointerup", stop); canvas.addEventListener("pointercancel", stop);

    let g = null, name = "";
    // preview: the outline plus dimension lines (mm). Display only: downloads never include the dimensions.
    // Every label is the same size and sits in one of two rows: lengths in a row above the part, heights in a row below,
    // each pushed sideways so none overlap, with a dashed leader to its dimension. Nothing is drawn across the tip:
    // the tip height is dimensioned to the right of the part.
    const svgBody = g => CK.toSVG(g, "").replace(/^.*?<\/title>/, "").replace(/<\/svg>$/, "")
      .replace(/fill="none" stroke="#ff0000" stroke-width="0.05"/g, 'fill="#3a1b1d" stroke="#ff6b6b" stroke-width="1.4" vector-effect="non-scaling-stroke"');
    const ln = (x1, y1, x2, y2, c, dash) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="1" vector-effect="non-scaling-stroke"${dash ? ' stroke-dasharray="2 2" opacity="0.6"' : ""}/>`;
    const tx = (x, y, t, fs, c, a = "middle") => `<text x="${x}" y="${y}" font-size="${fs}" fill="${c}" text-anchor="${a}" font-family="system-ui">${t}</text>`;
    // spread labels (sorted by x) so neighbours keep a gap, inside [lo, hi]
    function spread(L, gap, lo, hi) {
      L.sort((p, q) => p.x - q.x); L.forEach(l => l.cx = l.x);
      for (let i = 0; i < L.length; i++) L[i].cx = Math.max(L[i].cx, i ? L[i - 1].cx + (L[i - 1].w + L[i].w) / 2 + gap : lo + L[i].w / 2);
      for (let i = L.length - 1; i >= 0; i--) L[i].cx = Math.min(L[i].cx, i < L.length - 1 ? L[i + 1].cx - (L[i + 1].w + L[i].w) / 2 - gap : hi - L[i].w / 2);
      return L;
    }
    function preview(g, dims) {
      const body = svgBody(g);
      if (!dims) return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${g.w} ${g.h}">${body}</svg>`;
      const fs = Math.max(2.0, Math.min(4, g.w / 42)), cw = 0.56, gap = fs * 0.8, t = fs * 0.32;
      const x0 = 1, x1 = g.w - 1, y0 = 1, y1 = g.h - 1;
      const vm = (g.vmarks || []).filter(([, , a, b]) => b - a >= 0.2), outs = vm.filter(v => v[4]);
      const outX = i => x1 + fs * (0.9 + 1.2 * i), ohX = x1 + fs * (0.9 + 1.2 * outs.length + 0.3);
      const padR = ohX - x1 + fs * 3.4, right = g.w + padR - 1;
      let d = "";
      // lengths: dimension lines in lanes just above the part, all labels in one row above the lanes
      const lanes = [], H = [];
      (g.marks || []).filter(([, a, b]) => b - a >= 0.5).sort((p, q) => p[1] - q[1]).forEach(([l, a, b]) => {
        let k = 0; while ((lanes[k] || []).some(([p, q]) => a < q - 0.05 && b > p + 0.05)) k++;
        (lanes[k] = lanes[k] || []).push([a, b]);
        const s = `${l} ${(b - a).toFixed(1)}`; H.push({ a, b, k, s, x: (a + b) / 2, w: s.length * fs * cw });
      });
      const laneY = k => y0 - fs * (0.8 + 0.9 * k), topRow = laneY(Math.max(0, lanes.length - 1)) - fs * 1.2;
      const padT = lanes.length ? y0 - topRow + fs * 1.3 : 1;
      const ch = "#cfd8de", cl = "#7d8b95";
      spread(H, gap, 0, right).forEach(({ a, b, k, s, x, cx }) => {
        const y = laneY(k);
        d += ln(a, y, b, y, cl) + ln(a, y - t, a, y + t, cl) + ln(b, y - t, b, y + t, cl) +
             `<path d="M${x} ${y - t} L${x} ${topRow + fs * 0.45} L${cx} ${topRow + fs * 0.3}" fill="none" stroke="${cl}" stroke-width="1" stroke-dasharray="2 2" opacity="0.6" vector-effect="non-scaling-stroke"/>` +
             tx(cx, topRow, s, fs, ch);
      });
      // heights: a dimension on the feature (or right of the tip), its label in one row under the part
      const cv = "#8fd3ff", rowY = y1 + fs * 2.2;
      const V = vm.map(v => { const out = v[4] ? outX(outs.indexOf(v)) : null, x = out ?? v[1], s = `${v[0]} ${(v[3] - v[2]).toFixed(1)}`;
        return { v, out, x, s, w: s.length * fs * cw }; });
      spread(V, gap, 0, right).forEach(({ v: [, fx, a, b], out, x, s, cx }) => {
        d += ln(x, a, x, b, cv) + ln(x - t, a, x + t, a, cv) + ln(x - t, b, x + t, b, cv);
        if (out !== null) d += ln(fx, a, x + t, a, cv, true) + ln(x1 + 0.2, b, x + t, b, cv, true);   // extension lines from the tip
        d += `<path d="M${x} ${b} L${x} ${Math.max(b, y1) + fs * 0.6} L${cx} ${rowY - fs * 0.95}" fill="none" stroke="${cv}" stroke-width="1" stroke-dasharray="2 2" opacity="0.6" vector-effect="non-scaling-stroke"/>` +
             tx(cx, rowY, s, fs, cv);
      });
      // overall length and height
      const cr = "#ff8080", oy = rowY + fs * 1.8;
      d += ln(x0, oy, x1, oy, cr) + ln(x0, oy - t * 1.5, x0, oy + t * 1.5, cr) + ln(x1, oy - t * 1.5, x1, oy + t * 1.5, cr) + tx((x0 + x1) / 2, oy - fs * 0.35, `${(x1 - x0).toFixed(1)} mm overall`, fs, cr);
      d += ln(ohX, y0, ohX, y1, cr) + ln(ohX - t * 1.5, y0, ohX + t * 1.5, y0, cr) + ln(ohX - t * 1.5, y1, ohX + t * 1.5, y1, cr) + tx(ohX + fs * 0.4, (y0 + y1) / 2 + fs * 0.35, (y1 - y0).toFixed(1), fs, cr, "start");
      const padB = oy - y1 + fs * 0.9;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 ${-padT} ${g.w + padR} ${g.h + padT + padB}">${body}${d}</svg>`;
    }
    // tip close-up: the tip and 5 mm of shaft, enlarged on a 1 mm grid, with its length and height
    function closeup(g, dims) {
      const f = g.focus; if (!f) return "";
      const x0 = f.x0 - 0.3, x1 = f.x1 + 0.6, y0 = f.y0 - 0.8, y1 = f.y1 + 0.8, w = x1 - x0, h = y1 - y0;
      const fs = Math.max(0.45, Math.min(1.1, Math.max(w, h * 3) / 26)), t = fs * 0.3;
      let grid = "";
      for (let x = Math.ceil(x0); x <= x1; x++) grid += ln(x, y0, x, y1, x % 5 ? "#1d262d" : "#2c3a44");
      for (let y = Math.ceil(y0); y <= y1; y++) grid += ln(x0, y, x1, y, y % 5 ? "#1d262d" : "#2c3a44");
      const clip = `<clipPath id="ck-cu"><rect x="${x0}" y="${y0}" width="${w}" height="${h}"/></clipPath>`;
      let d = "", padR = 0.6, padB = 0.4;
      if (dims) {
        const tm = (g.marks || []).find(m => m[0] === "tip"), vt = (g.vmarks || []).find(v => v[4]);
        if (tm) { const y = y1 + fs * 0.6, c = "#cfd8de"; padB = fs * 2.2;
          d += ln(tm[1], y, tm[2], y, c) + ln(tm[1], y - t, tm[1], y + t, c) + ln(tm[2], y - t, tm[2], y + t, c) + ln(tm[1], f.y1, tm[1], y + t, c, true) + ln(tm[2], f.y1, tm[2], y + t, c, true) +
               tx((tm[1] + tm[2]) / 2, y + fs * 1.3, `tip ${(tm[2] - tm[1]).toFixed(1)}`, fs, c); }
        if (vt) { const [l, fx, a, b] = vt, x = x1 + fs * 0.5, c = "#8fd3ff"; padR = fs * 0.9 + (`${(b - a).toFixed(1)}`.length + 1) * fs * 0.6;
          d += ln(x, a, x, b, c) + ln(x - t, a, x + t, a, c) + ln(x - t, b, x + t, b, c) + ln(fx, a, x + t, a, c, true) + ln(f.x1, b, x + t, b, c, true) +
               tx(x + fs * 0.4, (a + b) / 2 + fs * 0.35, (b - a).toFixed(1), fs, c, "start") + tx(x - fs * 0.3, a - fs * 0.4, l, fs * 0.85, c, "end"); }
      }
      return `<svg class="cu" xmlns="http://www.w3.org/2000/svg" style="width:auto;height:150px;max-width:100%;display:block" viewBox="${x0} ${y0 - fs * 1.4} ${w + padR} ${h + fs * 1.4 + padB}"><defs>${clip}</defs>` +
        `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#0f1418"/>${grid}<g clip-path="url(#ck-cu)">${svgBody(g)}</g>${d}</svg>`;
    }
    function draw() {
      let o = read(); const adv = advBox.checked;
      // the outline editor sits above the preview (wide column); it may seed or rescale the points first, so read again
      if (olHost) olHost.hidden = o.tool !== "outline";
      if (o.tool === "outline" && window.CKFreehand) { window.CKFreehand.render(o); o = read(); }
      for (const [k, fl] of Object.entries(F)) {
        const show = !(fl.tool && !has(fl, o.tool) && !mixShow(k, fl, o)) && !(fl.only && !fl.only(o));   // step layout: non-simple fields sit under Advanced
        rows[k].hidden = !show;
        if (labs[k] && (typeof fl.label === "function" || typeof SHORT[k] === "function")) setLab(labs[k], labelOf(fl, o), shortOf(k, o));
      }
      for (const fs of Object.values(sets)) fs.hidden = !fs.querySelector(".f:not([hidden])");
      { const id = applied[o.tool], pr = id ? (CK.PRESETS[o.tool].find(x => x[0] === id) || [])[2] : null;
        for (const [k, b] of Object.entries(rss)) { const base = pr && k in pr ? pr[k] : F[k].v;
          b.classList.toggle("same", typeof base === "number" ? Math.abs(+o[k] - base) < 1e-9 : o[k] === base); } }
      { const cu = view.closest(".custom"); if (cu) cu.classList.toggle("ol", o.tool === "outline"); }   // outline: preview pinned smaller, editor below
      if (o.tool === "pick" && o.tip === "custom") drawCanvas(o);
      const empty = o.tool === "outline" && window.CKFreehand && window.CKFreehand.isEmpty && window.CKFreehand.isEmpty();
      for (const id of ["ck-svg", "ck-dxf", "ck-print", "ck-submit"]) { const b = document.getElementById(id); if (b) { b.style.opacity = empty ? ".4" : ""; b.style.pointerEvents = empty ? "none" : ""; b.setAttribute("aria-disabled", empty); } }
      if (empty) {
        g = null; name = "custom-outline";
        view.innerHTML = `<p class="cap">No outline yet: draw one or trace a photo in the editor. Undo brings the cleared one back.</p>`;
        warnEl.textContent = ""; info.textContent = "No outline yet: nothing to download.";
        if (draw.wiz) draw.wiz(o, null);
        return;
      }
      g = CK.build(o.tool, o);
      name = o.tool === "pick" ? `custom-pick__${o.tip}-${o.tipH}__${o.handle === "xacto" ? "tang-" + o.tangW + (o.tangHole ? (o.tangHole2 ? "-2holes-" : "-hole-") + o.tangHoleD : "") : (o.handle === "contour" ? "grip-" : "") + (o.holes ? "holes" : "no-holes")}${o.flatEdge && CK.flatTip(o) && o.handle !== "contour" ? "__flat-edge" : ""}${o.tilt ? "__tilt-" + o.tilt : ""}${o.fillet ? "__fillet-" + o.filletR : ""}`
        : o.tool === "outline" ? `custom-outline__${g.length.toFixed(1)}mm${o.holes ? "__holes" : ""}` : `custom-tension__${o.dirA}-${o.dirB}__tip-${o.tipA}${o.tipStyle !== "square" ? "-" + o.tipStyle : ""}`;
      const dims = dimBox.checked, cu = o.tool === "pick" ? closeup(g, dims) : "";
      view.innerHTML = preview(g, dims) + (cu ? `<p class="cap">Tip close-up · 1 mm grid</p>${cu}` : "");
      const w = CK.validate(g);
      warnEl.textContent = w.length ? "Warning: " + w.join(" / ") : "";
      const stockName = o.stock === "sheet" ? `your ${(+o.stockH).toFixed(1)} mm stock` : "a 12.7 mm hacksaw blade";
      info.innerHTML = `Overall length <b>${g.length.toFixed(1)} mm</b> × height ${g.height.toFixed(1)} mm` + (o.stock === "none" ? "" : " · " +
        (g.fitsStock ? `<span class="ok">fits ${stockName}</span>` : `<span class="no">${(g.height - g.stockLimit).toFixed(1)} mm too tall for ${stockName}</span>` +
          (o.stock === "blade" ? " (pick “Cut from: sheet or other stock” above if you are not using a blade)" : "")));
      if (o.tool === "outline" && window.CKFreehand) window.CKFreehand.render(o);   // again, so the editor shows the final points
      if (draw.wiz) draw.wiz(o, g);
    }
    const save = (text, ext, type) => { if (!g) return; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name + "." + ext; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    document.getElementById("ck-svg").onclick = () => g && save(CK.toSVG(g, name), "svg", "image/svg+xml");
    document.getElementById("ck-dxf").onclick = () => g && save(CK.toDXF(g), "dxf", "application/dxf");
    // print at true size: a plain page with the outline in mm and a 50 mm check bar, then the browser's print dialog
    const pr = document.getElementById("ck-print");
    if (pr) pr.onclick = e => {
      e.preventDefault(); if (!g) return;
      const svg = CK.toSVG(g, name).replace(/stroke="#ff0000"/g, 'stroke="#000"').replace(/stroke-width="0.05"/g, 'stroke-width="0.15"');
      const w = window.open("", "_blank");
      if (!w) { warnEl.textContent = "The print window was blocked: allow pop-ups for this page and try again."; return; }
      w.document.write(`<!doctype html><title>${name} (print at 100 %)</title><style>@page{size:A4 ${g.w > 186 ? "landscape" : "portrait"};margin:10mm}` +
        `body{margin:0;font:9pt system-ui;color:#000;background:#fff}.bar{width:50mm;border-bottom:0.3mm solid #000;margin:2mm 0 6mm}</style>` +
        `<p>${name} · print at 100 % / Actual size (no “fit to page”). The bar must measure 50 mm.</p><div class="bar"></div>${svg}` +
        `<script>onload=()=>setTimeout(()=>print(),200)<\/script>`);
      w.document.close();
    };
    // freehand / traced outline editor (site/freehand.js)
    if (olHost) { const slot = document.getElementById("ck-ol-slot"); if (slot) slot.append(olHost); else view.parentNode.insertBefore(olHost, view); rows.olEdit.remove(); }
    if (olHost && window.CKFreehand) window.CKFreehand.mount(olHost, {
      get: () => els.olPts.value,
      setQuiet: v => { els.olPts.value = v; },
      commit: v => { els.olPts.value = v; touch("olPts"); },
      getLen: () => clampNum(F.olLen, els.olLen.value),
      setLenQuiet: v => setVal("olLen", +(+v).toFixed(2)),
      lenRange: () => [F.olLen.min, F.olLen.max],
      setField: (k, v, commit) => { setVal(k, v); if (commit) touch(k); },
      read,
      geom: tool => CK.build(tool, { ...read(), tool }),
    });
    // current design for the submit dialog (site/submit.js): query reloads it through #custom?<query>
    window.ckState = () => {
      const o = read(), tool = o.tool, values = {};
      for (const [k, fl] of Object.entries(F)) if (k in o && (k === "tool" || has(fl, tool) || mixShow(k, fl, o))) values[k] = o[k];
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(values)) q.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
      q.set("name", name);
      if (!g) return { tool, name, query: q.toString(), values, svg: "", dxf: "", warnings: ["No outline yet: draw one or trace a photo"] };
      return { tool, name, query: q.toString(), values, svg: CK.toSVG(g, name), dxf: CK.toDXF(g), warnings: CK.validate(g) };
    };
    // ---------- step layout: Start > Photo > Shape > Handle > Finish > Export (docs/research/customiser-ui.md).
    // The fields above stay the one source of truth. This block only moves their rows between the step panels and the
    // grouped "Show every setting" layout (#ck-adv ticked), and shows / hides them. draw() calls draw.wiz at its end.
    {
      const STEPS = [["start", "Start"], ["photo", "Photo"], ["shape", "Shape"], ["handle", "Handle"], ["finish", "Finish"], ["export", "Export"]];
      const ORDER = STEPS.map(s => s[0]), TITLE = Object.fromEntries(STEPS);
      const STEP_K = { tool: "start", stock: "start", stockH: "start", olMix: "handle", olSplit: "handle", olBlend: "handle", serr: "finish" };
      const STEP_G = { Outline: "shape", Shaft: "shape", Tip: "shape", Bar: "shape", "Tension ends": "shape", Handle: "handle", Finish: "finish", Corners: "finish" };
      const MAIN = new Set(["tip", "tipL", "tipW", "peaks", "n", "pitch", "dirB"]);   // key fields kept outside Advanced besides the simple ones
      const INTRO = {
        start: () => "What are you making? A pick or tension bar starts from a preset; your own shape is drawn or traced from a photo.",
        photo: () => "Crop, turn and size the photo, then press Trace image. The editor shows the photo and the trace.",
        shape: o => o.tool === "outline" ? "Draw or edit the outline in the editor. More tools has add / delete points, tidy and the large view."
          : o.tool === "tension" ? "Length, bar height and the two working ends." : "The tip shape and the shaft.",
        handle: o => o.tool === "outline" ? "Use your outline as the whole pick, or only as the handle or the working end." : "Handle type, holes and the flat edge. Sizes are under Advanced.",
        finish: () => "Round off sharp corners.",
        export: () => "Check the list, then download the file or print it at 1:1.",
      };
      const wiz = () => !advBox.checked;
      const outer = root.closest(".custom") || root.parentNode;
      const wrap = document.getElementById("ck-ol-wrap");
      const phBox = document.getElementById("ck-photo"), side = phBox && phBox.parentNode, ctl = side && side.querySelector("details.imgctl");
      const imgLoaded = () => !!phBox && !phBox.hidden;
      const fileIn = () => olHost && olHost.querySelector("input[type=file]");
      let step = "start", src = "draw", lastO = null, lastG = null, more = null;

      // mode line ("Show every setting"), step strip, one panel per step (main + Advanced), Back / Next
      const modeRow = mk("div", "ck-mode"); modeRow.append(al);
      const strip = mk("div", "ck-steps"); strip.id = "ck-steps"; strip.setAttribute("role", "navigation"); strip.setAttribute("aria-label", "Steps");   // not <nav>: the page script owns "nav button"
      const pbox = mk("div", "ck-panels"), panels = {}, sbtn = {};
      for (const [id, t] of STEPS) {
        const b = mk("button", ""); b.type = "button"; b.id = "ck-step-" + id; b.append(mk("span", "n", ""), document.createTextNode(t)); b.onclick = () => go(id, true); strip.append(b); sbtn[id] = b;
        const sec = mk("div", "ck-step"); sec.id = "ck-panel-" + id; sec.dataset.step = id;   // not a <section>: the page script hides every "main section" but the open tab
        const intro = mk("p", "ck-intro"), main = mk("div", "ck-main"), ad = mk("details", "ck-advd"), ab = mk("div", "ck-advb");
        ad.append(mk("summary", "", "Advanced"), ab); sec.append(mk("h2", "", t), intro, main, ad); pbox.append(sec);
        panels[id] = { sec, intro, main, ad, ab };
      }
      const nav = mk("div", "ck-nav"), back = mk("button", "", "‹ Back"), next = mk("button", "", "Next ›");
      back.type = next.type = "button"; back.id = "ck-back"; next.id = "ck-next"; nav.append(back, next);
      root.prepend(modeRow, strip, pbox, nav);
      const avail = o => ORDER.filter(id => id === "start" || id === "export" || (id === "photo" ? o.tool === "outline" && (src === "photo" || imgLoaded())
        : id === "shape" && o.tool === "outline" ? true : !!panels[id].sec.querySelector(".ck-main .f:not([hidden]), .ck-advb .f:not([hidden])")));
      back.onclick = () => { const a = avail(lastO), k = a.indexOf(step); if (k > 0) go(a[k - 1], true); };
      next.onclick = () => { const a = avail(lastO), k = a.indexOf(step); if (k < a.length - 1) go(a[k + 1], true); };

      // Start: what to make (cards), preset gallery with thumbnails, cut from
      const cards = mk("div", "ck-cards"), card = {};
      [["pick", "Pick", "Hooks, rakes, combs, balls, warded"], ["tension", "Tension bar", "U-bar, Z-bar, BOK, Reaper-style"],
       ["draw", "Draw my own", "A freehand outline"], ["photo", "From a photo", "Trace a photo of a pick"]].forEach(([id, t, d]) => {
        const b = mk("button", "ck-card"); b.type = "button"; b.id = "ck-card-" + id; b.append(mk("b", "", t), mk("span", "", d)); b.onclick = () => choose(id); cards.append(b); card[id] = b;
      });
      function choose(id) {
        const tool = id === "draw" || id === "photo" ? "outline" : id;
        if (tool === "outline") src = id;
        if (els.tool.value !== tool) { setVal("tool", tool); touch("tool"); }
        if (id === "photo") { go("photo", true); const f = fileIn(); if (f && !imgLoaded()) f.click(); }
        else if (id === "draw") go("shape", true);
        else sync();
      }
      const gal = mk("div", "ck-gal"); gal.id = "ck-gallery"; let galKey = "";
      function fillGal(tool) {
        const list = CK.PRESETS[tool] || [], key = tool + JSON.stringify(list);
        if (key === galKey) return; galKey = key; gal.innerHTML = "";
        if (tool === "outline") return;
        list.forEach(([id, label, p], i) => {
          const b = mk("button", "ck-pre"), th = mk("span", "th"); b.type = "button"; b.dataset.id = id; b.title = label;
          b.append(th, mk("span", "lb", label.replace(/\s*\([^)]*\)$/, ""))); gal.append(b);
          b.onclick = () => { start.value = id; start.dispatchEvent(new Event("change")); };
          setTimeout(() => { if (galKey !== key) return;   // thumbnails one by one so the page stays responsive
            try { const t = CK.build(tool, { ...CK.BASE, ...p, tool }); th.innerHTML = `<svg viewBox="0 0 ${t.w} ${t.h}" preserveAspectRatio="xMidYMid meet">${svgBody(t)}</svg>`; } catch (e) { /* no thumbnail */ } }, 15 * i);
        });
      }

      // Photo: the editor's Photo block moves here and its Image & trace block (the separate trace settings) under the step's
      // Advanced; both go back into the editor for Large view or every setting
      const phHost = mk("div", ""); phHost.id = "ck-photo-host";
      const phAdv = mk("div", ""); phAdv.id = "ck-photo-adv"; panels.photo.ab.append(phAdv);
      const phPick = mk("button", "", "Choose a photo…"); phPick.type = "button"; phPick.id = "ck-photo-pick"; phPick.onclick = () => { const f = fileIn(); if (f) f.click(); };
      const phTip = mk("p", "ck-intro", "Best: the pick flat on plain paper, photographed from straight above, tip to the right.");
      panels.photo.main.append(phPick, phTip, phHost);
      { const fst = olHost && olHost.querySelector("style");   // freehand.js scopes its styles to #ck-ol-wrap: copy them for the host
        if (fst) { const s2 = document.createElement("style"); s2.textContent = ["#ck-photo-host", "#ck-photo-adv"].map(h => fst.textContent.split("#ck-ol-wrap").join(h)).join("\n"); document.head.append(s2); } }
      function placePhoto() {
        if (!phBox || !side) return;
        const inForm = wiz() && !(wrap && wrap.classList.contains("big"));
        if (inForm && phBox.parentNode !== phHost) { phHost.append(phBox); if (ctl) phAdv.append(ctl); }
        else if (!inForm && phBox.parentNode !== side) side.prepend(phBox, ...(ctl ? [ctl] : []));
      }
      if (wrap) new MutationObserver(placePhoto).observe(wrap, { attributes: true, attributeFilter: ["class"] });
      // tracing is only reliable after a tight crop: Crop and turn first, then What's in the photo, then Trace (with a hint until cropped)
      const crop = () => { const s = window.CKFreehand && window.CKFreehand._state && window.CKFreehand._state(); return !!(s && s.ph && s.ph.crop); };
      const cropHint = mk("p", "help", "Crop tight round the pick first (drag the yellow box): an uncropped photo traces as a blob."); cropHint.id = "ck-photo-crop-hint";
      { const secs = phBox ? [...phBox.children].filter(e => e.classList.contains("sec")) : [], tr = document.getElementById("ck-photo-trace");
        if (secs.length >= 3) secs[2].after(secs[0]);
        if (tr && tr.parentNode && tr.parentNode.parentNode === phBox) tr.parentNode.before(cropHint); }
      if (wrap) wrap.addEventListener("pointerup", () => setTimeout(() => { cropHint.hidden = crop(); }, 0));   // a crop dragged on the canvas
      if (phBox) phBox.addEventListener("click", () => setTimeout(() => { cropHint.hidden = crop(); }, 0));
      const cropFirst = () => { if (wiz() && step === "photo" && imgLoaded() && !crop()) { const b = document.getElementById("ck-photo-crop"); if (b && !b.classList.contains("on")) b.click(); } };
      if (phBox) new MutationObserver(() => { if (imgLoaded() && lastO && lastO.tool === "outline") src = "photo"; sync(); cropFirst(); }).observe(phBox, { attributes: true, attributeFilter: ["hidden"] });

      // editor toolbar: Draw / Select / Move and Undo up front, the rest under "More tools"
      if (wrap) {
        const tb = wrap.querySelector(".tb"), bs = tb ? [...tb.querySelectorAll("button")] : [], f = t => bs.find(b => b.textContent.trim() === t);
        const m = ["Draw", "Select", "Move"].map(f), u = f("Undo"), rd = f("Redo");
        if (tb && m.every(Boolean) && u) {
          const row = mk("div", "tb ck-tb-main"), g1 = mk("div", "grp"), seg = mk("div", "seg tools"), g2 = mk("div", "grp");
          seg.append(...m); g1.append(seg); { const ub = mk("div", "btns"); ub.append(u); if (rd) ub.append(rd); g2.append(ub); } row.append(g1, g2);
          more = mk("details", "ck-more"); more.append(mk("summary", "", "More tools"));
          wrap.insertBefore(row, tb); wrap.insertBefore(more, tb); more.append(tb);
        }
      }

      // Export: the downloads again, a pass / fail list, Show dimensions and Reset all
      const xb = mk("div", "ck-xbtns"), xbtn = {};
      [["svg", "Download SVG"], ["dxf", "Download DXF"], ["print", "Print 1:1"], ["submit", "Submit to the library"]].forEach(([id, t]) => {
        const a = document.getElementById("ck-" + id); if (!a) return;
        const b = mk("button", "", t); b.type = "button"; b.id = "ck-x-" + id; b.onclick = () => a.click(); xb.append(b); xbtn[id] = b;
      });
      const chk = mk("ul", "ck-check"); chk.id = "ck-check";

      // "?" after each label: the full explanation (tooltip, and shown under the field when pressed)
      for (const [k, l] of Object.entries(labs)) {
        const q = mk("button", "qm", "?"); q.type = "button"; q.title = l.title; q.setAttribute("aria-label", "Explain: " + l.title); l._q = q; l.after(q);
        q.onclick = () => { let x = rows[k].querySelector(".exp"); if (x && !x.hidden) { x.hidden = true; return; }
          if (!x) { x = mk("p", "exp"); rows[k].append(x); } x.textContent = l.title; x.hidden = false; };
      }

      function place() {
        const w = wiz();
        for (const [k, fl] of Object.entries(F)) {
          if (k === "olEdit") continue;
          if (w) { const P = panels[STEP_K[k] || STEP_G[fl.grp] || "shape"]; (k !== "tool" && (fl.simple || fl.bar || MAIN.has(k)) ? P.main : P.ab).append(rows[k]); }
          else if (!fl.bar) sets[fl.grp]._b.append(rows[k]);
        }
        if (w) { panels.start.main.append(cards, sRow, gal, rows.stock, rows.stockH); panels.export.main.append(xb, chk, aRow); }
        else bar.append(rows.tool, sRow, rows.stock, rows.stockH, aRow);
        if (more) more.open = !w;
        root.classList.toggle("ck-wiz", w); outer.classList.toggle("ck-wiz", w);
        placePhoto();
      }
      function go(id, user) {
        if (!panels[id]) return; step = id; sync(); cropFirst();
        if (!user || !wiz()) return;
        const r = root.getBoundingClientRect(), hdr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hdr")) || 0;
        const pin = outer.querySelector(".ck-pin"), off = hdr + (matchMedia("(max-width:800px)").matches && pin ? pin.offsetHeight : 0) + 8;
        if (r.top < off) scrollBy({ top: r.top - off });
      }
      window.ckStep = id => go(id, false);
      function sync(o = lastO, gg = lastG) {
        if (!o) return; lastO = o; lastG = gg;
        const w = wiz(), a = avail(o);
        if (!a.includes(step)) { let i = ORDER.indexOf(step); while (i > 0 && !a.includes(ORDER[i])) i--; step = ORDER[i]; }
        outer.dataset.step = w ? step : "all";
        let n = 0;
        for (const id of ORDER) {
          const on = a.includes(id), P = panels[id];
          sbtn[id].hidden = !on; sbtn[id].firstChild.textContent = on ? ++n + " " : "";
          sbtn[id].classList.toggle("on", id === step); if (id === step) sbtn[id].setAttribute("aria-current", "step"); else sbtn[id].removeAttribute("aria-current");
          P.sec.hidden = id !== step; P.intro.textContent = INTRO[id](o); P.ad.hidden = !P.ab.querySelector(".f:not([hidden])");
        }
        const k = a.indexOf(step); back.disabled = k <= 0; next.hidden = k >= a.length - 1; if (k < a.length - 1) next.textContent = `Next: ${TITLE[a[k + 1]]} ›`;
        for (const [id, b] of Object.entries(card)) b.classList.toggle("on", id === o.tool || (o.tool === "outline" && id === src));
        fillGal(o.tool); gal.hidden = o.tool === "outline";
        for (const b of gal.children) b.classList.toggle("on", b.dataset.id === start.value);
        const slot = document.getElementById("ck-ol-slot");
        if (slot) slot.hidden = o.tool !== "outline" || (w && !["photo", "shape", "handle"].includes(step));
        phPick.textContent = imgLoaded() ? "Choose another photo…" : "Choose a photo…"; phTip.hidden = imgLoaded(); cropHint.hidden = crop();
        for (const l of Object.values(labs)) if (l._q) l._q.hidden = !l.dataset.more;
        // the pass / fail list
        const items = [];
        if (!gg) items.push([false, "No outline yet: draw one or trace a photo"]);
        else {
          const wv = CK.validate(gg), stockName = o.stock === "sheet" ? `your ${(+o.stockH).toFixed(1)} mm stock` : "a 12.7 mm hacksaw blade";
          items.push(o.stock === "none" ? [true, "No size limit set"] : gg.fitsStock ? [true, `Fits ${stockName}`] : [false, `${(gg.height - gg.stockLimit).toFixed(1)} mm too tall for ${stockName}`]);
          items.push([!wv.some(x => /crosses itself/.test(x)), "Outline closed, does not cross itself"]);
          if (gg.circles.length || wv.some(x => /^Holes? /.test(x))) items.push([!wv.some(x => /^Holes? /.test(x)), "Holes inside, 1.2 mm of metal round them"]);
          wv.filter(x => !/crosses itself|^Holes? /.test(x)).forEach(x => items.push([null, x]));
        }
        chk.innerHTML = "";
        for (const [ok, t] of items) { const li = mk("li", ok === true ? "ok" : ok === false ? "no" : "nb"); li.append(mk("b", "", ok === true ? "✓" : ok === false ? "✗" : "!"), document.createTextNode(" " + t)); chk.append(li); }
        for (const b of Object.values(xbtn)) b.disabled = !gg;
      }
      draw.wiz = sync;
      try { advBox.checked = localStorage.getItem("ck-all") === "1"; } catch (e) { /* private window */ }
      advBox.addEventListener("change", () => { try { localStorage.setItem("ck-all", advBox.checked ? "1" : "0"); } catch (e) { /* ignore */ } place(); draw(); });
      place();
    }
    draw();
    const fromHash = () => { if (location.hash.startsWith("#custom?")) window.ckLoad(location.hash.slice(location.hash.indexOf("?") + 1)); };
    fromHash();
    addEventListener("hashchange", fromHash);
  }
}
