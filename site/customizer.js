// Pick and tension-tool customiser: builds the outline in the browser and downloads SVG / DXF (mm, 1:1).
// Pure functions at the top (also run under Node for tests: `node site/customizer.js --selftest <dir>`).
"use strict";

const CK = (() => {
  const BLADE_USABLE = 10.7; // 12.7 mm blade minus tooth margin and spine clearance

  // ---------- defaults (also the "Reset all" values) and presets
  const PICK_BASE = { handle: "full", handleL: 62, handleH: 9, handleEnd: "round", holes: true, holeD: 3.4, hole1: 15, hole2: 50,
    tangW: 5.8, tangL: 10, neckL: 18, shaftL: 40, shaftH: 1.2, sweep: 0,
    tip: "hook", tipH: 2.6, tipW: 1.0, tipL: 10, peaks: 3, lean: 0, n: 5, pitch: 3.2, custom: "0 2.2 0.6 2.8 1.2 2.4 0" };
  const TENSION_BASE = { length: 76, shaftW: 3.4, dirA: "up", tipA: 2.4, linA: 4.7, dirB: "up", tipB: 2.8, linB: 4.7, serr: false };
  const BASE = { tool: "pick", ...PICK_BASE, ...TENSION_BASE };
  const PRESETS = {
    pick: [
      ["hookM", "Medium hook", { tip: "hook", tipH: 2.6 }],
      ["hookS", "Short hook", { tip: "hook", tipH: 1.6 }],
      ["hookD", "Deep hook", { tip: "hook", tipH: 4, tipW: 1.2 }],
      ["gem", "Gem / offset hook (leaning)", { tip: "gem", tipH: 3, tipW: 1.4, lean: 35 }],
      ["diaS", "Small half-diamond", { tip: "halfDiamond", tipH: 2, tipL: 6 }],
      ["diaL", "Large half-diamond", { tip: "halfDiamond", tipH: 3.2, tipL: 10 }],
      ["bogota", "Bogota triple", { tip: "custom", tipL: 12, custom: "0 2.6 0.7 3.4 0.7 2.6 0" }],
      ["snake", "Snake rake", { tip: "rake", tipH: 2.2, tipL: 14, peaks: 4 }],
      ["city", "City rake", { tip: "custom", tipL: 14, custom: "0 3 1.2 3.6 1 2.8 0.8 3.4 0" }],
      ["saw", "Sawtooth rake (strokes)", { tip: "saw", tipH: 2.4, n: 5, pitch: 2.4 }],
      ["ball", "Single ball", { tip: "ball", tipH: 4 }],
      ["halfBall", "Half ball", { tip: "halfBall", tipH: 4 }],
      ["snowman", "Double ball (snowman)", { tip: "doubleBall", tipH: 4 }],
      ["comb5", "5-pin comb", { tip: "comb", n: 5, pitch: 3.2, tipW: 1.2, tipH: 2.4 }],
      ["warded", "Warded L bit", { tip: "warded", tipH: 4, tipW: 3.2 }],
      ["lever", "Lever lifter", { tip: "lever", tipH: 1.4, tipL: 8, tipW: 1.4, shaftH: 1.0 }],
      ["draw", "Draw your own tip", { tip: "custom", tipL: 14, custom: "0 1.5 2.5 3 2.5 1.5 0" }],
    ],
    tension: [
      ["U", "Blade-fit U-bar (both ends up)", {}],
      ["single", "Single-ended", { dirB: "none", tipA: 2.8 }],
      ["Z", "SP-style Z (short up, recessed down)", { dirB: "down", tipB: 2.8, linB: 10.7 }],
      ["BOK", "BOK L-wrench (long thin tip)", { length: 70, shaftW: 3, tipA: 1.8, linA: 12, dirB: "none", serr: true }],
    ],
  };

  // ---------- picks: outline = top edge (left->right) + bottom edge (right->left), as functions of x
  function pick(o) {
    o = { ...PICK_BASE, ...o };
    const sh = o.shaftH, half = sh / 2;
    let x0, handleTop, handleBot, holes = [];
    if (o.handle === "xacto") {
      const tw = o.tangW, tl = o.tangL, c = 0.4;
      x0 = tl + 2;                                   // shoulders end
      handleTop = x => x < c ? -tw / 2 + c - x : x < tl ? -tw / 2 : -5;
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
    const rootHalf = o.handle === "xacto" ? 5 : o.handleH / 2;      // full shoulder / handle width: no step where the neck starts
    const neckStart = o.handle === "xacto" ? x0 - 1.0 : x0 - 4;
    const neckEnd = neckStart + o.neckL;
    const tipStart = neckEnd + o.shaftL;
    const tip = TIPS[o.tip](o);
    const xEnd = tipStart + tip.len;
    // shaft centreline: optional sweep (smooth rise / drop over the shaft)
    const ss = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    const centre = x => o.sweep * ss((x - neckEnd) / Math.max(1, o.shaftL));
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
    while (xs.length && xs[xs.length - 1] >= xEnd - 1e-6) xs.pop();
    xs.push(xEnd);
    const top = xs.map(x => [x, topAt(x)]), bot = xs.slice().reverse().map(x => [x, botAt(x)]);
    const ring = top.concat(bot);
    const circles = holes.map(([hx, hy]) => ({ x: hx, y: hy, r: o.holeD / 2 }));
    return finish({ rings: [ring], circles, guides: [] });
  }

  const flat = () => 0;
  const circ = (c, r, d) => Math.sqrt(Math.max(0, r * r - (d - c) * (d - c)));
  const leanRun = o => o.lean > 0 ? Math.min(8, o.tipH * Math.tan(Math.min(70, o.lean) * Math.PI / 180)) : 0;
  const parseHeights = s => String(s).split(/[ ,;]+/).map(Number).filter(v => !isNaN(v) && v !== "");
  const TIPS = {
    // hook: vertical post; "lean" slopes the rear face (post leans forward, top edge stays a function of x)
    hook: o => { const run = leanRun(o), h = o.tipH;
      return { len: 1 + run + o.tipW, down: flat, up: d => d < 1 ? 0 : d < 1 + run ? h * (d - 1) / run : h }; },
    // gem: leaning rear face, short flat top, chamfered front
    gem: o => { const run = leanRun(o), h = o.tipH, a = 0.8, W = o.tipW, c = Math.min(0.8, W * 0.5 + 0.2);
      return { len: a + run + W + c, down: flat, up: d => d < a ? 0 : d < a + run ? h * (d - a) / run : d < a + run + W ? h : h - 0.4 * h * (d - a - run - W) / c }; },
    halfDiamond: o => ({ len: o.tipL, up: d => o.tipH * (1 - Math.abs(2 * d / o.tipL - 1)), down: flat }),
    ball: o => { const r = o.tipH / 2, p = d => Math.max(0, circ(r, r, d) - o.shaftH / 2); return { len: o.tipH, up: p, down: p }; },
    doubleBall: o => { const r1 = o.tipH / 2, r2 = r1 * 0.64, c2 = r1 + (r1 + r2) * 0.8, half = o.shaftH / 2;
      const p = d => Math.max(0, Math.max(circ(r1, r1, d), circ(c2, r2, d)) - half); return { len: c2 + r2, up: p, down: p }; },
    halfBall: o => ({ len: o.tipH, up: d => circ(o.tipH / 2, o.tipH / 2, d), down: flat }),
    rake: o => ({ len: o.tipL, up: d => o.tipH * (0.5 - 0.5 * Math.cos(2 * Math.PI * o.peaks * d / o.tipL)), down: flat }),
    // sawtooth "strokes": n ramps rising to tipH over `pitch`, then dropping
    saw: o => { const n = Math.max(1, Math.round(o.n)), p = o.pitch;
      return { len: n * p, down: flat, up: d => { const k = Math.min(n - 1, Math.floor(d / p)); return o.tipH * (d - k * p) / p; } }; },
    // comb: n square teeth, `pitch` apart, tipW wide, tipH tall
    comb: o => { const n = Math.max(1, Math.round(o.n)), p = o.pitch, tw = Math.min(o.tipW, p - 0.3);
      return { len: (n - 1) * p + tw, down: flat, up: d => { const k = Math.min(n - 1, Math.floor(d / p)); return d - k * p <= tw ? o.tipH : 0; } }; },
    // warded L bit: flat-topped post with a centre slot (half depth)
    warded: o => { const W = o.tipW; return { len: 1 + W, down: flat, up: d => d < 1 ? 0 : Math.abs(d - 1 - W / 2) < W / 6 ? o.tipH * 0.5 : o.tipH }; },
    // lever lifter: long gentle ramp ending in a short flat lip
    lever: o => ({ len: o.tipL + o.tipW, down: flat, up: d => d < o.tipL ? o.tipH * d / o.tipL : o.tipH }),
    custom: o => {
      const h = parseHeights(o.custom);
      const n = Math.max(2, h.length), step = o.tipL / (n - 1);
      return { len: o.tipL, down: flat, up: d => { const i = Math.min(n - 2, Math.floor(d / step)), t = d / step - i;
        return Math.max(0, (h[i] || 0) * (1 - t) + (h[i + 1] || 0) * t); } };
    },
  };

  // ---------- tension bars: explicit orthogonal outline with a step shoulder on each working end
  function tension(o) {
    o = { ...TENSION_BASE, ...o };
    const SW = o.shaftW, S = 1.5, L = o.length;
    const legPts = (side, dir, tw, lin) => {   // side: 0 left / 1 right; dir: -1 up / +1 down. Returns points along the edge.
      const lw = Math.max(tw + 0.9, SW), xo = side ? L : 0, s = side ? -1 : 1, y0 = dir * SW / 2;
      const yS = dir * (SW / 2 + S), yE = yS + dir * lin;
      const pts = [[xo, yE], [xo + s * tw, yE]];
      if (o.serr) {   // small V-notches along the inner (bearing) edge of the tip
        const p = 1.2, a = 0.5, dep = 0.35, n = Math.max(0, Math.floor((lin - 1.2) / p));
        for (let k = 0; k < n; k++) { const yc = yE - dir * (0.6 + a + k * p);
          pts.push([xo + s * tw, yc + dir * a], [xo + s * (tw - dep), yc], [xo + s * tw, yc - dir * a]); }
      }
      return pts.concat([[xo + s * tw, yS], [xo + s * lw, yS], [xo + s * lw, y0 + dir * 0.6], [xo + s * (lw + 0.6), y0]]);
    };
    const A = o.endA, B = o.endB, on = e => e && e.type !== "none";
    // top edge, left -> right
    const top = (on(A) && A.dir < 0 ? legPts(0, -1, A.tip, A.lin) : [[0, -SW / 2]])
      .concat(on(B) && B.dir < 0 ? legPts(1, -1, B.tip, B.lin).reverse() : [[L, -SW / 2]]);
    // bottom edge, right -> left
    const bot = (on(B) && B.dir > 0 ? legPts(1, 1, B.tip, B.lin) : [[L, SW / 2]])
      .concat(on(A) && A.dir > 0 ? legPts(0, 1, A.tip, A.lin).reverse() : [[0, SW / 2]]);
    const ring = top.concat(bot);
    return finish({ rings: [ring], circles: [], guides: [] });
  }
  // flat form values -> tension geometry
  function tensionFromForm(o) {
    o = { ...TENSION_BASE, ...o };
    const e = (d, t, l) => d === "none" ? { type: "none" } : { type: "tok", dir: d === "up" ? -1 : 1, tip: t, lin: l };
    return tension({ length: o.length, shaftW: o.shaftW, serr: o.serr, endA: e(o.dirA, o.tipA, o.linA), endB: e(o.dirB, o.tipB, o.linB) });
  }
  const build = (tool, o) => tool === "tension" ? tensionFromForm(o) : pick(o);

  // ---------- validation: self-intersection and hole clearance
  function validate(g, minWall = 1.2) {
    const warn = [], R = g.rings[0], n = R.length;
    const segs = [];
    for (let i = 0; i < n; i++) { const a = R[i], b = R[(i + 1) % n]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) segs.push([a, b]); }
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
    return warn;
  }

  function finish(g) {
    const pts = g.rings.flat().concat(g.circles.flatMap(c => [[c.x - c.r, c.y - c.r], [c.x + c.r, c.y + c.r]]));
    const minX = Math.min(...pts.map(p => p[0])), minY = Math.min(...pts.map(p => p[1]));
    const m = 1;
    g.rings = g.rings.map(r => r.map(([x, y]) => [x - minX + m, y - minY + m]));
    g.circles = g.circles.map(c => ({ ...c, x: c.x - minX + m, y: c.y - minY + m }));
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
  return { pick, tension, tensionFromForm, build, validate, toSVG, toDXF, TIPS, BLADE_USABLE, BASE, PICK_BASE, TENSION_BASE, PRESETS, parseHeights };
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
  emit("extra-square-end", "pick", { ...B, handleEnd: "square" });
  emit("extra-point-end", "pick", { ...B, handleEnd: "point", handleL: 70 });
  emit("extra-ball-sweep", "pick", { ...B, tip: "ball", tipH: 4, sweep: -1.5, holes: false });
  emit("extra-hook-lean", "pick", { ...B, tip: "hook", tipH: 3, lean: 45 });
  emit("extra-holes-moved", "pick", { ...B, holeD: 4, hole1: 12, hole2: 44 });
  emit("extra-tension-serr-U", "tension", { ...B, serr: true });
  emit("extra-tension-downdown", "tension", { ...B, dirA: "down", dirB: "down", serr: true });
  emit("extra-tension-Zserr", "tension", { ...B, dirB: "down", linB: 10.7, serr: true });
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
    handle: sel(P, "Handle", "Type", [["full", "Flat handle"], ["xacto", "X-Acto / DIY bar tang"]], { simple: true }),
    holes: { tool: P, grp: "Handle", label: "Screw holes", type: "check", simple: true, only: o => o.handle === "full" },
    handleL: num(P, "Handle", "Length", "mm", 40, 90, 1, { only: o => o.handle === "full" }),
    handleH: num(P, "Handle", "Height", "mm", 6, 12, 0.1, { only: o => o.handle === "full" }),
    handleEnd: sel(P, "Handle", "End shape", [["round", "Rounded"], ["square", "Square"], ["point", "Pointed"]], { only: o => o.handle === "full" }),
    holeD: num(P, "Handle", "Hole diameter", "mm", 2, 5, 0.05, { only: hasHoles }),
    hole1: num(P, "Handle", "Hole 1 position", "mm", 5, 85, 0.5, { only: hasHoles }),
    hole2: num(P, "Handle", "Hole 2 position", "mm", 5, 85, 0.5, { only: hasHoles }),
    tangW: num(P, "Handle", "Tang width (measure your collet)", "mm", 5.0, 6.4, 0.05, { only: o => o.handle === "xacto" }),
    tangL: num(P, "Handle", "Tang length", "mm", 6, 16, 0.5, { only: o => o.handle === "xacto" }),
    // shaft
    neckL: num(P, "Shaft", "Neck taper length", "mm", 6, 30, 0.5),
    shaftL: num(P, "Shaft", "Shaft length", "mm", 15, 75, 0.5, { simple: true }),
    shaftH: num(P, "Shaft", "Shaft height (thicker = stiffer)", "mm", 0.8, 3, 0.05, { simple: true }),
    sweep: num(P, "Shaft", "Sweep (- rises, + drops to tip)", "mm", -3, 3, 0.1),
    // tip
    tip: sel(P, "Tip", "Profile", [["hook", "Hook"], ["gem", "Gem hook (leaning)"], ["halfDiamond", "Half-diamond"], ["rake", "Rake (waves)"], ["saw", "Sawtooth strokes"],
      ["halfBall", "Half-ball"], ["ball", "Ball"], ["doubleBall", "Double ball"], ["comb", "Comb"], ["warded", "Warded L bit"], ["lever", "Lever lifter"], ["custom", "Custom / drawn"]]),
    tipH: num(P, "Tip", "Tip height", "mm", 0.5, 6, 0.1, { simple: true }),
    tipW: num(P, "Tip", "Tip width / tooth width", "mm", 0.6, 4, 0.05, { only: o => ["hook", "gem", "warded", "lever", "comb"].includes(o.tip) }),
    tipL: num(P, "Tip", "Tip length", "mm", 2, 25, 0.2, { only: o => ["halfDiamond", "rake", "custom", "lever"].includes(o.tip) }),
    lean: num(P, "Tip", "Lean (forward)", "deg", 0, 60, 1, { only: o => ["hook", "gem"].includes(o.tip) }),
    peaks: num(P, "Tip", "Peaks", "", 1, 6, 0.5, { only: o => o.tip === "rake" }),
    n: num(P, "Tip", "Teeth / strokes", "", 2, 8, 1, { only: o => ["comb", "saw"].includes(o.tip) }),
    pitch: num(P, "Tip", "Pitch", "mm", 1.5, 6, 0.1, { only: o => ["comb", "saw"].includes(o.tip) }),
    draw: { tool: P, grp: "Tip", type: "draw", label: "Draw the tip top edge (click / drag)", simple: true, only: o => o.tip === "custom" },
    custom: { tool: P, grp: "Tip", label: "Heights along the tip, mm", type: "text", only: o => o.tip === "custom" },
    // tension
    length: num(T, "Shaft", "Overall length", "mm", 50, 110, 0.5, { simple: true }),
    shaftW: num(T, "Shaft", "Bar width", "mm", 2.4, 5, 0.1, { simple: true }),
    dirA: sel(T, "Tension ends", "End A leg", [["up", "Up"], ["down", "Down"], ["none", "None"]]),
    tipA: num(T, "Tension ends", "End A tip width", "mm", 1.8, 4.5, 0.1, { simple: true, only: o => o.dirA !== "none" }),
    linA: num(T, "Tension ends", "End A insertion (4.7 Kwikset)", "mm", 2, 14, 0.1, { simple: true, only: o => o.dirA !== "none" }),
    dirB: sel(T, "Tension ends", "End B leg", [["up", "Up"], ["down", "Down"], ["none", "None"]]),
    tipB: num(T, "Tension ends", "End B tip width", "mm", 1.8, 4.5, 0.1, { only: o => o.dirB !== "none" }),
    linB: num(T, "Tension ends", "End B insertion (recessed 10.7)", "mm", 2, 14, 0.1, { only: o => o.dirB !== "none" }),
    serr: { tool: T, grp: "Tension ends", label: "Serrations (V-notches on tip)", type: "check" },
  };
  for (const [k, fl] of Object.entries(F)) fl.v = k === "tool" ? "pick" : CK.BASE[k];
  const DEF = { pick: "hookM", tension: "U" };

  const root = document.getElementById("ck-form"), view = document.getElementById("ck-view"), info = document.getElementById("ck-info"), warnEl = document.getElementById("ck-warn");
  if (root) {
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
    const els = {}, rngs = {}, rows = {}, sets = {};
    const bar = mk("div", "ck-bar"); root.append(bar);
    const advBox = document.createElement("input"); advBox.type = "checkbox"; advBox.id = "ck-adv";
    const start = document.createElement("select"); start.id = "ck-start";
    let lastStart = { ...DEF }, canvas = null;
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
        row.append(mk("span", "t", fl.label), canvas, b); els[k] = canvas;
        cl.onclick = () => setHeights(new Array(sampleN()).fill(0));
        sm.onclick = () => { const h = heights(); setHeights(h.map((v, i) => (h[Math.max(0, i - 1)] + v + h[Math.min(h.length - 1, i + 1)]) / 3)); };
      } else {
        if (fl.type === "select") { input = document.createElement("select"); fl.opts.forEach(([v, t]) => input.add(new Option(t, v, false, v === fl.v))); }
        else if (fl.type === "check") { input = document.createElement("input"); input.type = "checkbox"; input.checked = fl.v; }
        else if (fl.type === "text") { input = document.createElement("input"); input.type = "text"; input.value = fl.v; }
        else { input = document.createElement("input"); input.type = "number"; Object.assign(input, { min: fl.min, max: fl.max, step: fl.step, value: fl.v }); }
        input.id = "ck-" + k; els[k] = input;
        const lab = mk("label", "t", fl.label); lab.htmlFor = input.id;
        if (fl.type === "check") { row.classList.add("chk"); row.append(input, lab); input.addEventListener("change", () => touch(k)); }
        else if (fl.min !== undefined) {
          const r = document.createElement("input"); r.type = "range"; Object.assign(r, { min: fl.min, max: fl.max, step: fl.step, value: fl.v }); r.id = "ck-" + k + "-r"; rngs[k] = r;
          const rw = mk("div", "row"), u = mk("span", "u", fl.u || "");
          r.addEventListener("input", () => { input.value = r.value; touch(k); });
          input.addEventListener("input", () => { r.value = input.value; touch(k); });
          rw.append(r, input, u); row.append(lab, rw);
        } else { row.append(lab, input); input.addEventListener(fl.type === "select" ? "change" : "input", () => touch(k)); }
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
    aRow.append(al, reset); bar.append(sRow, aRow);
    fillStart();

    const read = () => Object.fromEntries(Object.entries(F).filter(([, fl]) => fl.type !== "draw").map(([k, fl]) => {
      const el = els[k];
      return [k, fl.type === "check" ? el.checked : (fl.type === "select" || fl.type === "text") ? el.value : +el.value];
    }));
    const setVal = (k, v) => { const fl = F[k]; if (fl.type === "draw") return; if (fl.type === "check") els[k].checked = !!v; else { els[k].value = v; if (rngs[k]) rngs[k].value = v; } };
    start.addEventListener("change", () => {
      const id = start.value; if (!id) { lastStart[curTool()] = ""; return; }
      const tool = curTool(), p = CK.PRESETS[tool].find(x => x[0] === id)[2], vals = { ...CK.BASE, ...p };
      for (const [k, fl] of Object.entries(F)) if (fl.tool === tool && !(tool === P && fl.grp === "Handle")) setVal(k, vals[k]);   // handle choices are kept
      lastStart[tool] = id; draw();
    });
    reset.onclick = () => { for (const [k, fl] of Object.entries(F)) setVal(k, fl.v); lastStart = { ...DEF }; fillStart(); draw(); };
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
    function draw() {
      const o = read(), adv = advBox.checked;
      for (const [k, fl] of Object.entries(F)) {
        if (fl.bar) continue;
        rows[k].hidden = !(!(fl.tool && fl.tool !== o.tool) && !(fl.only && !fl.only(o)) && (adv || fl.simple));
      }
      for (const fs of Object.values(sets)) fs.hidden = !fs.querySelector(".f:not([hidden])");
      if (o.tool === "pick" && o.tip === "custom") drawCanvas(o);
      g = CK.build(o.tool, o);
      name = o.tool === "pick" ? `custom-pick__${o.tip}-${o.tipH}__${o.handle === "xacto" ? "tang-" + o.tangW : (o.holes ? "holes" : "no-holes")}`
        : `custom-tension__${o.dirA}-${o.dirB}__tip-${o.tipA}`;
      view.innerHTML = CK.toSVG(g, name).replace(/width="[^"]*mm" height="[^"]*mm"/, 'width="100%"').replace(/fill="none" stroke="#ff0000" stroke-width="0.05"/g, 'fill="#3a1b1d" stroke="#ff6b6b" stroke-width="1.4" vector-effect="non-scaling-stroke"');
      const w = CK.validate(g);
      warnEl.textContent = w.length ? "Warning: " + w.join(" / ") : "";
      info.innerHTML = `Overall length <b>${g.length.toFixed(1)} mm</b> × height ${g.height.toFixed(1)} mm · ` +
        (g.fitsBlade ? '<span class="ok">fits a 12.7 mm hacksaw blade</span>' : '<span class="no">too tall for a hacksaw blade - use wider sheet</span>');
    }
    const save = (text, ext, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name + "." + ext; a.click(); };
    document.getElementById("ck-svg").onclick = () => save(CK.toSVG(g, name), "svg", "image/svg+xml");
    document.getElementById("ck-dxf").onclick = () => save(CK.toDXF(g), "dxf", "application/dxf");
    draw();
  }
}
