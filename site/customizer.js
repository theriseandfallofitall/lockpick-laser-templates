// Pick and tension-tool customiser: builds the outline in the browser and downloads SVG / DXF (mm, 1:1).
// Pure functions at the top (also run under Node for tests: `node site/customizer.js --selftest <dir>`).
"use strict";

const CK = (() => {
  const BLADE_USABLE = 10.7; // 12.7 mm blade minus tooth margin and spine clearance

  // ---------- defaults (also the "Reset all" values) and presets
  const PICK_BASE = { handle: "full", handleL: 62, handleH: 9, handleEnd: "round", holes: true, holeD: 3.4, hole1: 15, hole2: 50,
    tangW: 5.8, tangL: 10, shoulderL: 2, shoulderW: 10, tangHole: false, tangHoleD: 2.2, tangHoleX: 5, tangHole2: false, tangHole2X: 10, flatEdge: false, neckL: 18, shaftL: 40, shaftH: 1.2, sweep: 0,
    tip: "hook", tipH: 3.0, tipW: 0.9, tipL: 10, bendR: 1.8, peaks: 3, waveStyle: "up", lean: 8, n: 5, pitch: 3.81, first: 6.27, custom: "0 2.2 0.6 2.8 1.2 2.4 0" };
  const TENSION_BASE = { length: 76, shaftW: 3.4, dirA: "up", tipA: 2.4, linA: 4.7, dirB: "up", tipB: 2.8, linB: 4.7, serr: false,
    outer: "round", outerR: 0.3, tipCorner: "sharp", tipCornerR: 0.5, legCorner: "round", legCornerR: 0.8, ovalStretch: 1.6, wave: 0, waves: 1 };
  const BASE = { tool: "pick", ...PICK_BASE, ...TENSION_BASE };
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
      ["warded", "Warded L bit", { tip: "warded", tipH: 4, tipW: 3.2 }],
      ["lever", "Lever lifter (UK mortice)", { tip: "hook", tipH: 3.5, tipW: 1.2, bendR: 1.8, lean: 5, shaftH: 2.0, shaftL: 60 }],
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
    ],
  };

  // ---------- picks: outline = top edge (left->right) + bottom edge (right->left), as functions of x
  function pick(o) {
    o = { ...PICK_BASE, ...o };
    // flat-edge X-Acto: the stop is on one side only, as tall as one side of the centred shoulders
    // (same as build/generate_home_workshop.py xacto_flat_edge)
    if (o.flatEdge && o.handle === "xacto" && flatTip(o)) o.shoulderW = (o.shoulderW + o.tangW) / 2;
    const sh = o.shaftH, half = sh / 2;
    let x0, handleTop, handleBot, holes = [];
    if (o.handle === "xacto") {
      const tw = o.tangW, tl = o.tangL, c = 0.4;
      x0 = tl + o.shoulderL;                         // shoulders end
      handleTop = x => x < c ? -tw / 2 + c - x : x < tl ? -tw / 2 : -o.shoulderW / 2;
      handleBot = x => -handleTop(x);
    } else {
      const L = o.handleL, H = o.handleH;
      x0 = L;
      let edge;
      if (o.handleEnd === "square") edge = () => 0;
      else if (o.handleEnd === "point") { const p = Math.min(12, L / 3), k = Math.max(0, H / 2 - 1); edge = x => x < p ? k * (1 - x / p) : 0; }
      else { const r = Math.min(2, H / 2); edge = x => x < r ? r - Math.sqrt(Math.max(0, r * r - (r - x) * (r - x))) : 0; }
      handleTop = x => -H / 2 + edge(x);
      handleBot = x => H / 2 - edge(x);
      if (o.holes) holes = [[o.hole1, 0], [o.hole2, 0]];
    }
    const rootHalf = o.handle === "xacto" ? o.shoulderW / 2 : o.handleH / 2;      // full shoulder / handle width: no step where the neck starts
    // comb (comb_tool() in build/generate_home_workshop.py): no neck or shaft. A stop block joins the handle
    // (the last 2 mm of a flat handle, or 8 mm after the X-Acto shoulders) and the comb runs along the handle's bottom edge.
    const comb = o.tip === "comb";
    if (comb) o.combStop = o.handle === "xacto" ? 8 : 2;
    const neckStart = comb ? (o.handle === "xacto" ? x0 : x0 - 2) : o.handle === "xacto" ? x0 - Math.min(1.0, o.shoulderL / 2) : x0 - 4;
    const neckEnd = comb ? neckStart : neckStart + o.neckL;
    const tipStart = comb ? neckStart : neckEnd + o.shaftL;
    const tip = TIPS[o.tip](o);
    const xEnd = tipStart + tip.len;
    // shaft centreline: optional sweep (smooth rise / drop over the shaft)
    const ss = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    const centre = comb ? () => rootHalf - half : x => o.sweep * ss((x - neckEnd) / Math.max(1, o.shaftL));
    const cos01 = t => 0.5 * (1 + Math.cos(Math.PI * Math.min(1, Math.max(0, t))));
    function topAt(x) {
      if (x < neckStart) return handleTop(x);
      if (x < neckEnd) { const k = cos01((x - neckStart) / (neckEnd - neckStart)); return -(half + (rootHalf - half) * k); }
      if (x < tipStart) return centre(x) - half;
      return centre(tipStart) - half - tip.up(x - tipStart);
    }
    function botAt(x) {
      if (x < neckStart) return handleBot(x);
      if (x < neckEnd) { const k = cos01((x - neckStart) / (neckEnd - neckStart)); return half + (rootHalf - half) * k; }
      if (x < tipStart) return centre(x) + half;
      return centre(tipStart) + half + tip.down(x - tipStart);
    }
    const xs = [];
    for (let x = 0; x < xEnd - 1e-6; x += x < tipStart - 1 ? 0.25 : 0.04) xs.push(+x.toFixed(4));
    const breaks = o.handle === "xacto" ? [0.4, o.tangL, x0] : [];   // feature edges: sample both sides so steps stay square
    for (const b of breaks.concat([neckStart, neckEnd, tipStart])) if (b > 0 && b < xEnd) xs.push(+(b - 1e-4).toFixed(4), +b.toFixed(4));
    xs.sort((a, b) => a - b);
    for (let i = xs.length - 1; i > 0; i--) if (xs[i] - xs[i - 1] < 5e-5) xs.splice(i, 1);
    while (xs.length && xs[xs.length - 1] >= xEnd - 1e-6) xs.pop();
    xs.push(xEnd);
    // flat edge: shift every column down so the underside is one straight line from butt to tip (lay it on the
    // hacksaw blade's smooth back: that side needs no cutting). Column heights, and so the tip shape, are unchanged.
    const flatOk = o.flatEdge && flatTip(o);
    const nomBot = x => x < neckStart ? (o.handle === "xacto" ? (x < o.tangL ? o.tangW / 2 : o.shoulderW / 2) : o.handleH / 2) : x < tipStart ? botAt(x) : centre(tipStart) + half;
    const fe = x => flatOk ? rootHalf - nomBot(x) : 0;
    const top = xs.map(x => [x, topAt(x) + fe(x)]), bot = xs.slice().reverse().map(x => [x, botAt(x) + fe(x)]);
    const ring = top.concat(bot);
    const circles = holes.map(([hx, hy]) => ({ x: hx, y: hy + fe(hx), r: o.holeD / 2 }));
    // optional hole through the tang: a cone-point grub screw in the DIY bar handle seats in it (stops pull-out)
    if (o.handle === "xacto" && o.tangHole) { const hx = o.tangL - o.tangHoleX; circles.push({ x: hx, y: fe(hx), r: o.tangHoleD / 2 }); }
    // optional second hole (second grub screw in the DIY bar handle); needs a longer tang, e.g. 14 mm with holes at 4 / 10
    if (o.handle === "xacto" && o.tangHole && o.tangHole2) { const hx = o.tangL - o.tangHole2X; circles.push({ x: hx, y: fe(hx), r: o.tangHoleD / 2 }); }
    // dimension marks for the preview (display only): [label, x from, x to] in raw coordinates
    const marks = o.handle === "xacto"
      ? [["tang", 0, o.tangL], ["shoulder", o.tangL, x0], ["neck", neckStart, neckEnd], ["shaft", neckEnd, tipStart], ["tip", tipStart, xEnd]]
      : [["handle", 0, x0], ["neck", neckStart, neckEnd], ["shaft", neckEnd, tipStart], ["tip", tipStart, xEnd]];
    // vertical dimension marks: [label, x, y top, y bottom] in raw coordinates
    let pk = tipStart, pkY = topAt(tipStart) + fe(tipStart);          // highest point of the tip
    for (let x = tipStart; x <= xEnd; x += 0.02) { const xx = Math.min(x, xEnd - 1e-6), y = topAt(xx) + fe(xx); if (y < pkY) { pkY = y; pk = x; } }
    const sx = comb ? tipStart + o.combStop + 0.6 : (neckEnd + tipStart) / 2, hx = o.handle === "xacto" ? o.tangL / 2 : Math.min(8, neckStart / 2);
    const vmarks = [
      [o.handle === "xacto" ? "tang" : "handle", hx, topAt(hx) + fe(hx), botAt(hx) + fe(hx)],
      [o.tip === "comb" ? "comb body" : "shaft", sx, topAt(sx) + fe(sx), botAt(sx) + fe(sx)],
      [["ball", "doubleBall", "halfBall"].includes(o.tip) ? "ball above shaft" : o.tip === "comb" ? "stop above body" : "tip above shaft", pk, pkY, centre(tipStart) - half + fe(tipStart)],
    ];
    if (o.tip === "comb") {   // tooth height at the front tooth (the tallest point is the stop)
      const xt = tipStart + o.combStop + o.first + (Math.max(1, Math.round(o.n)) - 1) * o.pitch;
      vmarks.push(["tooth", xt, topAt(xt) + fe(xt), centre(tipStart) - half + fe(tipStart)]);
    }
    if (o.handle === "xacto") vmarks.splice(1, 0, ["shoulder", o.tangL + o.shoulderL / 2, -o.shoulderW / 2 + fe(o.tangL + 0.1), o.shoulderW / 2 + fe(o.tangL + 0.1)]);
    // peaks closer than ~1.2 mm leave valleys narrower than a kerf / needle file
    const notes = [];
    if (o.tip === "rake" && o.tipL / o.peaks < 1.2) notes.push(`Rake peaks are ${(o.tipL / o.peaks).toFixed(2)} mm apart - lengthen the tip or use fewer peaks (min 1.2 mm)`);
    if (o.tip === "comb") {   // COMB in build/pick_shapes.py: slide in under the pins, lift until the body meets the keyway ceiling (~8.5 mm)
      if (o.shaftH + o.tipH > 7.5) notes.push(`Comb is ${(o.shaftH + o.tipH).toFixed(1)} mm tall: it may not slide in under the pins (keep body + teeth near 7 mm)`);
      if (8.5 + o.tipH < 13.0) notes.push(`Teeth ${o.tipH} mm: lifted, they reach about ${(8.5 + o.tipH).toFixed(1)} mm, short of the 12.7 mm shear line (use about 5 mm)`);
    }
    if (o.tip === "custom") {
      const h = parseHeights(o.custom), st = o.tipL / Math.max(1, h.length - 1), pk = h.map((v, i) => i > 0 && i < h.length - 1 && v > h[i - 1] && v >= h[i + 1] ? i : -1).filter(i => i >= 0);
      const gap = Math.min(...pk.slice(1).map((v, i) => (v - pk[i]) * st));
      if (gap < 1.2) notes.push(`Tip peaks are ${gap.toFixed(2)} mm apart - lengthen the tip (min 1.2 mm between peaks)`);
    }
    return finish({ rings: [ring], circles, guides: [], marks, vmarks, notes });
  }

  const flat = () => 0;
  const FLAT_TIPS = ["hook", "curve", "swept", "gem", "halfDiamond", "rake", "saw", "halfBall", "comb", "warded", "lever", "custom"];   // flat underside
  const flatTip = o => FLAT_TIPS.includes(o.tip) && !(o.tip === "rake" && o.waveStyle === "both");   // a snake dips below the shaft
  const circ = (c, r, d) => Math.sqrt(Math.max(0, r * r - (d - c) * (d - c)));
  const parseHeights = s => String(s).split(/[ ,;]+/).map(Number).filter(v => !isNaN(v) && v !== "");
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
  // hook centreline: arc of radius R turning up by th, then a straight riser up to the nose (hook_centre() in pick_shapes.py)
  function hookTip(o, R, thDeg) {
    const sh = o.shaftH, w = o.tipW, rise = Math.max(0.05, o.tipH + sh / 2 - w / 2);
    R = Math.max(0.3, R);
    let th = Math.max(5, Math.min(90, thDeg)) * Math.PI / 180, ar = R * (1 - Math.cos(th));
    if (ar > rise) { th = Math.acos(1 - rise / R); ar = rise; }
    const Ls = (rise - ar) / Math.sin(th), La = R * th, total = La + Ls;
    const c = t => { const s = t * total; if (s <= La) { const a = s / R; return [R * Math.sin(a), R * (1 - Math.cos(a))]; }
      const d = s - La; return [R * Math.sin(th) + d * Math.cos(th), ar + d * Math.sin(th)]; };
    return stripTip(o, c, t => sh + (w - sh) * t, total);
  }
  const sweptTip = o => { const rise = o.tipH + o.shaftH / 2 - o.tipW / 2, th = Math.min(Math.PI / 2, 2 * Math.atan2(rise, o.tipL));
    return hookTip(o, o.tipL / Math.sin(th), th * 180 / Math.PI); };
  const TIPS = {
    // hook: bent strip, bend radius bendR, tip leaning forward by `lean` degrees ("gem" kept for old links)
    hook: o => hookTip(o, o.bendR, 90 - o.lean),
    gem: o => hookTip(o, o.bendR, 90 - o.lean),
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
    // warded L bit: flat-topped post with a centre slot (half depth)
    warded: o => { const W = Math.max(1.5, o.tipW), sl = Math.max(0.25, W / 6);   // slot >= 0.5 mm wide (kerf)
      return { len: 1 + W, down: flat, up: d => d < 1 ? 0 : Math.abs(d - 1 - W / 2) < sl ? o.tipH * 0.5 : o.tipH }; },
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
      // a relief at the tip corner needs a longer shoulder step to sit in: widen the leg just enough
      const rel = (o.tipCorner === "mouse" || o.tipCorner === "oval") ? o.tipCornerR * (o.tipCorner === "oval" ? o.ovalStretch : 1) : 0;
      const lw = Math.max(tw + 0.9, SW, tw + 2.2 * rel + 0.4), xo = side ? L : 0, s = side ? -1 : 1, y0 = dir * SW / 2;
      const yS = dir * (SW / 2 + S), yE = yS + dir * lin;
      const pts = [[xo, yE, "outer"], [xo + s * tw, yE, "outer"]];
      if (o.serr) {   // small V-notches along the inner (bearing) edge of the tip
        const p = 1.2, a = 0.5, dep = 0.35, n = Math.max(0, Math.floor((lin - 1.2 - (o.tipCorner === "sharp" ? 0 : o.tipCornerR)) / p));
        for (let k = 0; k < n; k++) { const yc = yE - dir * (0.6 + a + k * p);
          pts.push([xo + s * tw, yc + dir * a, "serr"], [xo + s * (tw - dep), yc, "serr"], [xo + s * tw, yc - dir * a, "serr"]); }
      }
      return pts.concat([[xo + s * tw, yS, "tip"], [xo + s * lw, yS, "outer"], [xo + s * lw, y0, "leg"]]);
    };
    const A = o.endA, B = o.endB, on = e => e && e.type !== "none";
    // optional wave: the whole shaft (both edges) follows k half-sine bumps of amplitude `wave`, zero at the ends
    const wavy = (x0, x1, y, reverse) => {
      if (!o.wave || x1 - x0 < 4) return [];
      const out = [];
      for (let x = x0 + 1; x < x1 - 0.5; x += 1) out.push([x, y + o.wave * Math.sin(Math.PI * o.waves * (x - x0) / (x1 - x0)), "wave"]);
      return reverse ? out.reverse() : out;
    };
    const lTop = on(A) && A.dir < 0 ? legPts(0, -1, A.tip, A.lin) : [[0, -SW / 2, "outer"]];
    const rTop = on(B) && B.dir < 0 ? legPts(1, -1, B.tip, B.lin).reverse() : [[L, -SW / 2, "outer"]];
    const rBot = on(B) && B.dir > 0 ? legPts(1, 1, B.tip, B.lin) : [[L, SW / 2, "outer"]];
    const lBot = on(A) && A.dir > 0 ? legPts(0, 1, A.tip, A.lin).reverse() : [[0, SW / 2, "outer"]];
    const legReach = o.legCorner === "sharp" ? 0 : o.legCornerR;
    const pad = 0.6 + 2 * legReach;                       // wave starts clear of any leg-corner relief or fillet
    const xa = Math.max(lTop[lTop.length - 1][0], lBot[0][0]) + pad, xb = Math.min(rTop[0][0], rBot[rBot.length - 1][0]) - pad;
    const top = lTop.concat(wavy(xa, xb, -SW / 2, false), rTop);
    const bot = rBot.concat(wavy(xa, xb, SW / 2, true), lBot);
    const ring = corners(top.concat(bot), {
      outer: [o.outer, o.outerR], tip: [o.tipCorner, o.tipCornerR], leg: [o.legCorner, o.legCornerR], stretch: o.ovalStretch });
    const off = o.wave ? o.wave * Math.sin(Math.PI * o.waves * ((L / 2 - xa) / Math.max(1, xb - xa))) : 0;   // follow the wave at mid-length
    const vmarks = [["bar height", L / 2, -SW / 2 + off, SW / 2 + off]], marks = [];
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
  const build = (tool, o) => tool === "tension" ? tensionFromForm(o) : pick(o);

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
    g.vmarks = (g.vmarks || []).map(([l, x, a, b]) => [l, x - minX + m, a - minY + m, b - minY + m]);
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
  return { FLAT_TIPS, flatTip, pick, tension, tensionFromForm, build, validate, toSVG, toDXF, TIPS, BLADE_USABLE, BASE, PICK_BASE, TENSION_BASE, PRESETS, parseHeights };
})();

if (typeof module !== "undefined") module.exports = CK;

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
  console.log(count, "files written,", warned, "with warnings");
  if (warned) process.exitCode = 1;
}

// ---------- browser UI
if (typeof document !== "undefined") {
  const P = "pick", T = "tension";
  const num = (tool, grp, label, u, min, max, step, x = {}) => ({ tool, grp, label, u, min, max, step, ...x });
  const sel = (tool, grp, label, opts, x = {}) => ({ tool, grp, label, type: "select", opts, ...x });
  const hasHoles = o => o.handle === "full" && o.holes;
  const F = {
    tool: sel(null, null, "Make a", [["pick", "Pick"], ["tension", "Tension bar"]], { bar: true }),
    // handle
    handle: sel(P, "Handle", "Handle type", [["full", "Flat handle"], ["xacto", "X-Acto / DIY bar tang"]], { simple: true }),
    holes: { tool: P, grp: "Handle", label: "Two screw holes (to bolt on handle scales)", type: "check", simple: true, only: o => o.handle === "full" },
    handleL: num(P, "Handle", "Handle length", "mm", 40, 90, 1, { only: o => o.handle === "full" }),
    handleH: num(P, "Handle", "Handle height (top to bottom)", "mm", 6, 12, 0.1, { only: o => o.handle === "full" }),
    handleEnd: sel(P, "Handle", "Handle end shape", [["round", "Rounded"], ["square", "Square"], ["point", "Pointed"]], { only: o => o.handle === "full" }),
    holeD: num(P, "Handle", "Screw hole diameter (3.4 fits M3)", "mm", 2, 5, 0.05, { only: hasHoles }),
    hole1: num(P, "Handle", "Hole 1: distance from the handle end", "mm", 5, 85, 0.5, { only: hasHoles }),
    hole2: num(P, "Handle", "Hole 2: distance from the handle end", "mm", 5, 85, 0.5, { only: hasHoles }),
    tangW: num(P, "Handle", "Tang width (the part the knife grips; cut the fit tests to find yours)", "mm", 5.0, 6.4, 0.05, { only: o => o.handle === "xacto" }),
    tangL: num(P, "Handle", "Tang length (how far it goes into the knife)", "mm", 6, 16, 0.5, { only: o => o.handle === "xacto" }),
    shoulderL: num(P, "Handle", "Shoulder thickness (along the pick)", "mm", 0.8, 6, 0.1, { only: o => o.handle === "xacto" }),
    shoulderW: num(P, "Handle", "Shoulder width (stop against the collet)", "mm", 7, 14, 0.1, { only: o => o.handle === "xacto" }),
    tangHole: { tool: P, grp: "Handle", label: "Hole through the tang (for the DIY bar grub screw)", type: "check", simple: true, only: o => o.handle === "xacto" },
    tangHoleD: num(P, "Handle", "Tang hole diameter", "mm", 1.2, 3.5, 0.05, { only: o => o.handle === "xacto" && o.tangHole }),
    tangHoleX: num(P, "Handle", "Tang hole, distance in front of the shoulders", "mm", 2, 15, 0.1, { only: o => o.handle === "xacto" && o.tangHole }),
    tangHole2: { tool: P, grp: "Handle", label: "Second tang hole (two grub screws; lengthen the tang to ~14 mm)", type: "check", only: o => o.handle === "xacto" && o.tangHole },
    tangHole2X: num(P, "Handle", "Second hole, distance in front of the shoulders", "mm", 2, 15, 0.1, { only: o => o.handle === "xacto" && o.tangHole && o.tangHole2 }),
    flatEdge: { tool: P, grp: "Handle", label: "Flat edge: one straight side from butt to tip (lay it on the hacksaw blade's back, no cutting on that side)", type: "check", simple: true,
      only: o => !["ball", "doubleBall"].includes(o.tip) },
    // shaft
    neckL: num(P, "Shaft", "Neck length (where the handle narrows to the shaft)", "mm", 6, 30, 0.5, { only: o => o.tip !== "comb" }),
    shaftL: num(P, "Shaft", "Shaft length (the thin part before the tip)", "mm", 15, 75, 0.5, { simple: true, only: o => o.tip !== "comb" }),
    shaftH: num(P, "Shaft", o => o.tip === "comb" ? "Comb body height (under the teeth; 2 mm slides under the pins)" : "Shaft height (taller = stiffer, but less room in the keyway)", "mm", 0.8, 3, 0.05, { simple: true }),
    sweep: num(P, "Shaft", "Shaft offset at the tip (minus = up, plus = down)", "mm", -4, 4, 0.1, { only: o => !o.flatEdge && o.tip !== "comb" }),
    // tip
    tip: sel(P, "Tip", "Tip shape", [["hook", "Hook"], ["swept", "Swept hook (shaft curves up)"], ["halfDiamond", "Half-diamond"], ["rake", "Rake (waves)"], ["saw", "Sawtooth strokes"],
      ["halfBall", "Half-ball"], ["ball", "Ball"], ["doubleBall", "Double ball"], ["comb", "Comb"], ["warded", "Warded L bit"], ["custom", "Custom / drawn"]]),
    tipH: num(P, "Tip", o => ({ comb: "Tooth height (5 mm reaches past the shear line)", ball: "Ball diameter", doubleBall: "Front ball diameter", halfBall: "Half-ball diameter", rake: "Hump height above the shaft (front hump)", warded: "Bit height above the shaft" })[o.tip] || "Tip height above the shaft", "mm", 0.5, 6, 0.1, { simple: true }),
    tipW: num(P, "Tip", o => ({ comb: "Tooth width (pin holes are about 2.9 mm)", warded: "Bit width", rake: "Strip width at the tip" })[o.tip] || "Width of the hook at its tip", "mm", 0.6, 4, 0.05, { only: o => ["hook", "curve", "swept", "gem", "warded", "lever", "comb", "rake"].includes(o.tip) }),
    tipL: num(P, "Tip", o => ({ swept: "Reach: how far forward the curve runs", curve: "Reach: how far forward the curve runs", halfDiamond: "Back slope length (longer = gentler)", rake: "Length of the wavy part" })[o.tip] || "Tip length", "mm", 1, 25, 0.1, { only: o => ["halfDiamond", "rake", "custom", "curve", "swept"].includes(o.tip) }),
    bendR: num(P, "Tip", "Bend radius where the shaft turns up (bigger = gentler)", "mm", 0.6, 6, 0.1, { only: o => ["hook", "gem", "lever"].includes(o.tip) }),
    lean: num(P, "Tip", "Tip lean forward (0 = straight up)", "deg", 0, 60, 1, { only: o => ["hook", "gem"].includes(o.tip) }),
    waveStyle: sel(P, "Tip", "Wave direction", [["up", "Up only (Bogota)"], ["both", "Up and down (snake)"]], { only: o => o.tip === "rake" }),
    peaks: num(P, "Tip", "Number of humps", "", 1, 6, 1, { only: o => o.tip === "rake" }),
    n: num(P, "Tip", o => o.tip === "comb" ? "Number of teeth (one per pin)" : "Number of teeth", "", 2, 8, 1, { only: o => ["comb", "saw"].includes(o.tip) }),
    pitch: num(P, "Tip", o => o.tip === "comb" ? "Tooth spacing (Kwikset 3.81, Schlage 3.96)" : "Tooth spacing", "mm", 1.5, 6, 0.01, { only: o => ["comb", "saw"].includes(o.tip) }),
    first: num(P, "Tip", "First tooth from the stop (Kwikset 6.27, Schlage 5.87)", "mm", 3, 9, 0.01, { only: o => o.tip === "comb" }),
    draw: { tool: P, grp: "Tip", type: "draw", label: "Draw the top edge of the tip (click or drag)", simple: true, only: o => o.tip === "custom" },
    custom: { tool: P, grp: "Tip", label: "Tip heights in mm, evenly spaced, front to back (end on -shaft height for a pointed nose)", type: "text", only: o => o.tip === "custom" },
    // tension
    length: num(T, "Shaft", "Overall length", "mm", 50, 110, 0.5, { simple: true }),
    shaftW: num(T, "Shaft", "Bar height (top to bottom edge)", "mm", 2.4, 5, 0.1, { simple: true }),
    dirA: sel(T, "Tension ends", "Left end: tip points", [["up", "Up"], ["down", "Down"], ["none", "None"]]),
    tipA: num(T, "Tension ends", "Left tip width (how much of the keyway height it fills)", "mm", 1.8, 4.5, 0.1, { simple: true, only: o => o.dirA !== "none" }),
    linA: num(T, "Tension ends", "Left tip length into the lock (4.7 stops before pin 1)", "mm", 2, 14, 0.1, { simple: true, only: o => o.dirA !== "none" }),
    dirB: sel(T, "Tension ends", "Right end: tip points", [["up", "Up"], ["down", "Down"], ["none", "None"]]),
    tipB: num(T, "Tension ends", "Right tip width", "mm", 1.8, 4.5, 0.1, { only: o => o.dirB !== "none" }),
    linB: num(T, "Tension ends", "Right tip length into the lock (10.7 for recessed plugs)", "mm", 2, 14, 0.1, { only: o => o.dirB !== "none" }),
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
    // body shape
    wave: num(T, "Body", "Body wave height (0 = straight bar)", "mm", -4, 4, 0.1),
    waves: num(T, "Body", "Number of bends in the body", "", 1, 4, 1, { only: o => o.wave !== 0 }),
  };
  for (const [k, fl] of Object.entries(F)) fl.v = k === "tool" ? "pick" : CK.BASE[k];
  const DEF = { pick: "hookM", tension: "U" };

  const root = document.getElementById("ck-form"), view = document.getElementById("ck-view"), info = document.getElementById("ck-info"), warnEl = document.getElementById("ck-warn");
  if (root) {
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
    const els = {}, rngs = {}, rows = {}, sets = {}, labs = {};
    const labelOf = (fl, o) => typeof fl.label === "function" ? fl.label(o) : fl.label;
    const bar = mk("div", "ck-bar"); root.append(bar);
    const advBox = document.createElement("input"); advBox.type = "checkbox"; advBox.id = "ck-adv"; advBox.checked = true;   // all fields shown by default; untick for the short list
    const start = document.createElement("select"); start.id = "ck-start";
    let lastStart = { ...DEF }, canvas = null, applied = { ...DEF };   // applied: preset last loaded (kept while you edit)
    const curTool = () => els.tool.value;
    const fillStart = () => {
      start.innerHTML = ""; start.add(new Option("Custom (your own values)", ""));
      CK.PRESETS[curTool()].forEach(([id, label]) => start.add(new Option(label, id)));
      start.value = lastStart[curTool()] || "";
    };
    const touch = k => { if (k === "tool") fillStart(); else { lastStart[curTool()] = ""; start.value = ""; } draw(); };
    for (const [k, fl] of Object.entries(F)) {
      const row = mk("div", "f"); row.dataset.k = k; rows[k] = row;
      let input;
      if (fl.type === "draw") {
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
        const lab = mk("label", "t", labelOf(fl, CK.BASE)); lab.htmlFor = input.id; labs[k] = lab;
        if (fl.type === "check") { row.classList.add("chk"); row.append(input, lab); input.addEventListener("change", () => {
          if (k === "tangHole2" && input.checked && clampNum(F.tangL, els.tangL.value) < 14) { setVal("tangL", 14); setVal("tangHoleX", 4); setVal("tangHole2X", 10); }
          touch(k); }); }
        else if (fl.min !== undefined) {
          const r = document.createElement("input"); r.type = "range"; Object.assign(r, { min: fl.min, max: fl.max, step: fl.step, value: fl.v }); r.id = "ck-" + k + "-r"; rngs[k] = r;
          const rw = mk("div", "row"), u = mk("span", "u", fl.u || "");
          r.addEventListener("input", () => { input.value = r.value; touch(k); });
          input.addEventListener("input", () => { r.value = input.value; touch(k); });
          input.addEventListener("change", () => { const v = clampNum(fl, input.value); if (+input.value !== v || input.value.trim() === "") { input.value = r.value = v; touch(k); } });
          rw.append(r, input, u); row.append(lab, rw);
        } else { row.append(lab, input); input.addEventListener(fl.type === "select" ? "change" : "input", () => touch(k)); }
      }
      if (k !== "tool" && fl.type !== "draw") {     // per-field reset: back to the started-from preset's value, else the default
        const rs = mk("button", "rs", "↺"); rs.type = "button"; rs.title = "Reset this field"; rs.setAttribute("aria-label", "Reset " + labelOf(fl, CK.BASE));
        rs.onclick = () => {
          const id = applied[curTool()], p = id ? (CK.PRESETS[curTool()].find(x => x[0] === id) || [])[2] : null;
          setVal(k, p && k in p ? p[k] : fl.v); draw();
        };
        row.append(rs);
      }
      if (fl.bar) { bar.append(row); continue; }
      const gk = fl.tool + "|" + fl.grp;
      if (!sets[gk]) { const fs = mk("fieldset"); fs.append(mk("legend", "", fl.grp)); sets[gk] = fs; root.append(fs); }
      sets[gk].append(row);
    }
    // toolbar: start-from preset, advanced toggle, reset
    const sRow = mk("div", "f"), sl = mk("label", "t", "Start from"); sl.htmlFor = "ck-start"; sRow.append(sl, start);
    const aRow = mk("div", "ck-actions"), al = mk("label", "chk", ""); al.append(advBox, document.createTextNode(" Advanced (all fields)"));
    const reset = mk("button", "", "Reset all"); reset.type = "button"; reset.id = "ck-reset";
    const dimBox = document.createElement("input"); dimBox.type = "checkbox"; dimBox.id = "ck-dims"; dimBox.checked = true;
    const dl = mk("label", "chk", ""); dl.append(dimBox, document.createTextNode(" Show dimensions"));
    dimBox.addEventListener("change", () => draw());
    aRow.append(al, dl, reset); bar.append(sRow, aRow);
    fillStart();

    // typed values are clamped to the field's range; empty or non-numeric falls back to the default
    const clampNum = (fl, s) => { const v = parseFloat(s); return String(s).trim() === "" || !isFinite(v) ? fl.v : Math.min(fl.max, Math.max(fl.min, v)); };
    const read = () => Object.fromEntries(Object.entries(F).filter(([, fl]) => fl.type !== "draw").map(([k, fl]) => {
      const el = els[k];
      return [k, fl.type === "check" ? el.checked : (fl.type === "select" || fl.type === "text") ? el.value : clampNum(fl, el.value)];
    }));
    const setVal = (k, v) => { const fl = F[k]; if (fl.type === "draw") return; if (fl.type === "check") els[k].checked = !!v; else { els[k].value = v; if (rngs[k]) rngs[k].value = v; } };
    start.addEventListener("change", () => {
      const id = start.value; if (!id) { lastStart[curTool()] = ""; return; }
      const tool = curTool(), p = CK.PRESETS[tool].find(x => x[0] === id)[2], vals = { ...CK.BASE, ...p };
      for (const [k, fl] of Object.entries(F)) if (fl.tool === tool && !(tool === P && fl.grp === "Handle")) setVal(k, vals[k]);   // handle choices are kept
      lastStart[tool] = id; applied[tool] = id; draw();
    });
    // Reset all: keep the tool (pick / tension bar) and the chosen design; put every value back to that design's values
    reset.onclick = () => {
      const tool = curTool(), id = applied[tool] || lastStart[tool] || DEF[tool];
      const p = (CK.PRESETS[tool].find(x => x[0] === id) || [])[2] || {}, vals = { ...CK.BASE, ...p };
      for (const [k, fl] of Object.entries(F)) if (k !== "tool") setVal(k, fl.tool === tool && k in vals ? vals[k] : fl.v);
      lastStart[tool] = id; applied[tool] = id; fillStart(); draw();
    };
    // Library page hook: load a library design (URL query string) into the customiser as a preset
    window.ckLoad = query => {
      const q = new URLSearchParams(query), tool = q.get("tool") === "tension" ? "tension" : "pick", p = {};
      for (const [k, v] of q) {
        if (k === "tool" || k === "name" || !(k in F) || F[k].type === "draw") continue;
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
      for (const [k, fl] of Object.entries(F)) if (k !== "tool") setVal(k, fl.tool === tool && k in vals ? vals[k] : fl.v);
      lastStart[tool] = "lib"; applied[tool] = "lib"; fillStart(); draw();
    };
    advBox.addEventListener("change", draw);

    // ---------- tip drawing canvas: heights sampled every 0.5 mm along tipL, snapped to 0.1 mm; kept in sync with the text box
    const CH = 6;   // canvas height in mm
    const sampleN = () => Math.max(3, Math.round(+els.tipL.value / 0.5) + 1);
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
    function preview(g, dims) {
      const body = CK.toSVG(g, "").replace(/^.*?<\/title>/, "").replace(/<\/svg>$/, "")
        .replace(/fill="none" stroke="#ff0000" stroke-width="0.05"/g, 'fill="#3a1b1d" stroke="#ff6b6b" stroke-width="1.4" vector-effect="non-scaling-stroke"');
      if (!dims) return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${g.w} ${g.h}">${body}</svg>`;
      const vm = (g.vmarks || []).filter(([, , a, b]) => b - a >= 0.2);
      const fs = Math.max(2.0, Math.min(4, g.w / 42)), padR = fs * 5;
      // lengths along the top: each label goes in the lowest row where neither it nor its dimension line touches another
      const tops = [], lanes = [];
      g.marks.filter(([, a, b]) => b - a >= 0.5).sort((p, q) => p[1] - q[1]).forEach(([l, a, b]) => {
        const txt = `${l} ${(b - a).toFixed(1)}`, tw = txt.length * fs * 0.56, fits = b - a > tw + fs * 0.6;
        const side = !fits && b + fs * 0.4 + tw > g.w + padR ? "left" : fits ? "" : "right";
        const lo = Math.min(a, side === "left" ? a - fs * 0.4 - tw : fits ? (a + b - tw) / 2 : a) - fs * 0.3;
        const hi = Math.max(b, side === "right" ? b + fs * 0.4 + tw : fits ? (a + b + tw) / 2 : b) + fs * 0.3;
        let k = 0; while ((lanes[k] || []).some(([p, q]) => lo < q && hi > p)) k++;
        (lanes[k] = lanes[k] || []).push([lo, hi]); tops.push({ txt, a, b, side, k });
      });
      const padT = lanes.length ? fs * (1.7 * lanes.length + 0.5) : 1;
      const rowY = g.h - 1 + fs * 1.9, padB = (vm.length ? fs * 2.2 : 0) + fs * 3.2;   // label row, then the overall length
      const ln = (x1, y1, x2, y2, c = "#7d8b95") => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      const tx = (x, y, t, a = "middle", c = "#cfd8de") => `<text x="${x}" y="${y}" font-size="${fs}" fill="${c}" text-anchor="${a}" font-family="system-ui">${t}</text>`;
      const hdim = (a, b, y, label, c) => ln(a, y, b, y, c) + ln(a, y - fs * 0.5, a, y + fs * 0.5, c) + ln(b, y - fs * 0.5, b, y + fs * 0.5, c) + tx((a + b) / 2, y - fs * 0.35, label, "middle", c);
      let d = "";
      const x0 = 1, x1 = g.w - 1, y0 = 1, y1 = g.h - 1;
      d += hdim(x0, x1, y1 + padB - fs * 0.8, `${(x1 - x0).toFixed(1)} mm overall`, "#ff8080");               // overall length
      d += ln(x1 + padR * 0.35, y0, x1 + padR * 0.35, y1, "#ff8080") + ln(x1 + padR * 0.2, y0, x1 + padR * 0.5, y0, "#ff8080") +
           ln(x1 + padR * 0.2, y1, x1 + padR * 0.5, y1, "#ff8080") + tx(x1 + padR * 0.45, (y0 + y1) / 2 + fs * 0.35, `${(y1 - y0).toFixed(1)}`, "start", "#ff8080");
      tops.forEach(({ txt, a, b, side, k }) => {
        const y = y0 - fs * (0.9 + 1.7 * k);
        d += side ? hdim(a, b, y, "") + tx(side === "left" ? a - fs * 0.4 : b + fs * 0.4, y + fs * 0.35, txt, side === "left" ? "end" : "start")
                  : hdim(a, b, y, txt);
      });
      // heights: a thin dimension line on the feature, its label in a row below the outline (never on top of it),
      // labels pushed apart left to right so they cannot overlap, a dashed leader from the feature to its label
      const c = "#8fd3ff", t = fs * 0.32, fl = fs * 0.85, gap = fs * 0.8;
      const labs = vm.map(([l, x, a, b]) => ({ x, a, b, s: `${l} ${(b - a).toFixed(1)}` })).sort((p, q) => p.x - q.x);
      labs.forEach(L => { L.w = L.s.length * fl * 0.56; L.cx = L.x; });
      for (let i = 0; i < labs.length; i++) labs[i].cx = Math.max(labs[i].cx, i ? labs[i - 1].cx + (labs[i - 1].w + labs[i].w) / 2 + gap : labs[i].w / 2);
      const right = g.w + padR - 1;
      for (let i = labs.length - 1; i >= 0; i--) labs[i].cx = Math.min(labs[i].cx, i < labs.length - 1 ? labs[i + 1].cx - (labs[i + 1].w + labs[i].w) / 2 - gap : right - labs[i].w / 2);
      labs.forEach(({ x, a, b, s: txt, cx }) => {
        d += ln(x, a, x, b, c) + ln(x - t, a, x + t, a, c) + ln(x - t, b, x + t, b, c) +
             `<path d="M${x} ${b} L${x} ${rowY - fl * 1.3} L${cx} ${rowY - fl * 0.95}" fill="none" stroke="${c}" stroke-width="1" stroke-dasharray="2 2" opacity="0.6" vector-effect="non-scaling-stroke"/>` +
             `<text x="${cx}" y="${rowY}" font-size="${fl}" fill="${c}" text-anchor="middle" font-family="system-ui">${txt}</text>`;
      });
      return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 ${-padT} ${g.w + padR} ${g.h + padT + padB}">${body}${d}</svg>`;
    }
    function draw() {
      const o = read(), adv = advBox.checked;
      for (const [k, fl] of Object.entries(F)) {
        if (fl.bar) continue;
        rows[k].hidden = !(!(fl.tool && fl.tool !== o.tool) && !(fl.only && !fl.only(o)) && (adv || fl.simple));
        if (labs[k] && typeof fl.label === "function") labs[k].textContent = fl.label(o);
      }
      for (const fs of Object.values(sets)) fs.hidden = !fs.querySelector(".f:not([hidden])");
      if (o.tool === "pick" && o.tip === "custom") drawCanvas(o);
      g = CK.build(o.tool, o);
      name = o.tool === "pick" ? `custom-pick__${o.tip}-${o.tipH}__${o.handle === "xacto" ? "tang-" + o.tangW + (o.tangHole ? (o.tangHole2 ? "-2holes-" : "-hole-") + o.tangHoleD : "") : (o.holes ? "holes" : "no-holes")}${o.flatEdge && CK.flatTip(o) ? "__flat-edge" : ""}`
        : `custom-tension__${o.dirA}-${o.dirB}__tip-${o.tipA}`;
      view.innerHTML = preview(g, document.getElementById("ck-dims") ? document.getElementById("ck-dims").checked : true);
      const w = CK.validate(g);
      warnEl.textContent = w.length ? "Warning: " + w.join(" / ") : "";
      info.innerHTML = `Overall length <b>${g.length.toFixed(1)} mm</b> × height ${g.height.toFixed(1)} mm · ` +
        (g.fitsBlade ? '<span class="ok">fits a 12.7 mm hacksaw blade</span>' : '<span class="no">too tall for a hacksaw blade - use wider sheet</span>');
    }
    const save = (text, ext, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name + "." + ext; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    document.getElementById("ck-svg").onclick = () => save(CK.toSVG(g, name), "svg", "image/svg+xml");
    document.getElementById("ck-dxf").onclick = () => save(CK.toDXF(g), "dxf", "application/dxf");
    // print at true size: a plain page with the outline in mm and a 50 mm check bar, then the browser's print dialog
    const pr = document.getElementById("ck-print");
    if (pr) pr.onclick = e => {
      e.preventDefault();
      const svg = CK.toSVG(g, name).replace(/stroke="#ff0000"/g, 'stroke="#000"').replace(/stroke-width="0.05"/g, 'stroke-width="0.15"');
      const w = window.open("", "_blank");
      if (!w) { warnEl.textContent = "The print window was blocked: allow pop-ups for this page and try again."; return; }
      w.document.write(`<!doctype html><title>${name} (print at 100 %)</title><style>@page{size:A4 ${g.w > 186 ? "landscape" : "portrait"};margin:10mm}` +
        `body{margin:0;font:9pt system-ui;color:#000;background:#fff}.bar{width:50mm;border-bottom:0.3mm solid #000;margin:2mm 0 6mm}</style>` +
        `<p>${name} · print at 100 % / Actual size (no “fit to page”). The bar must measure 50 mm.</p><div class="bar"></div>${svg}` +
        `<script>onload=()=>setTimeout(()=>print(),200)<\/script>`);
      w.document.close();
    };
    draw();
    const fromHash = () => { if (location.hash.startsWith("#custom?")) window.ckLoad(location.hash.slice(location.hash.indexOf("?") + 1)); };
    fromHash();
    addEventListener("hashchange", fromHash);
  }
}
