// Photo tracing helpers for the customiser: pure image processing (RGBA in, mask / outline out).
// Runs in the browser (window.CKTrace) and under Node. Pixel coords: x right, y down.
"use strict";

const CKTrace = (() => {
  // settings that traced the Evo4 photo (see docs); the UI can start from these
  const RECOMMENDED = { mode: "bg", threshold: null /* use otsu() */, contrast: 0, brightness: 0, blur: 2, clean: 1, crop: null, bg: null };
  const CHROMA_W = 2;
  const EDGE_UNIT = 8, EDGE_FLOOR = 1, EDGE_CHROMA = 3, EDGE_LO = 0.4, EDGE_LINK = 0.05;
  // the edge modes: the threshold Auto threshold suggests, and the blur / threshold / clean-up values Auto settings tries
  const EDGE = { edge: { auto: 50, blurs: [4, 6], tries: [40, 60], cleans: [1, 2] }, edgec: { auto: 35, blurs: [3, 5], tries: [25, 35, 50], cleans: [2] } };
  const DEF = { mode: "dark", threshold: 128, contrast: 0, brightness: 0, blur: 0, clean: 0, crop: null, bg: null };

  const norm = (o) => ({ ...DEF, ...(o || {}) });
  // crop rect clamped to the image; x1/y1 are exclusive
  function region(w, h, crop) {
    if (!crop) return { x0: 0, y0: 0, x1: w, y1: h };
    const x0 = Math.max(0, Math.min(w, Math.floor(Math.min(crop.x0, crop.x1))));
    const x1 = Math.max(0, Math.min(w, Math.ceil(Math.max(crop.x0, crop.x1))));
    const y0 = Math.max(0, Math.min(h, Math.floor(Math.min(crop.y0, crop.y1))));
    const y1 = Math.max(0, Math.min(h, Math.ceil(Math.max(crop.y0, crop.y1))));
    return { x0, y0, x1, y1 };
  }
  const cfac = (c) => { const k = Math.max(-100, Math.min(100, c)) * 2.55; return (259 * (k + 255)) / (255 * (259 - k)); };

  // ---------- blur: separable box blur, 2-3 passes (gaussian-ish), edge-clamped, O(n) per pass
  function boxPass(a, t, w, h, k) {
    const n = 2 * k + 1;
    for (let y = 0; y < h; y++) { // horizontal a -> t
      const b = y * w;
      let s = a[b] * (k + 1);
      for (let i = 1; i <= k; i++) s += a[b + Math.min(i, w - 1)];
      for (let x = 0; x < w; x++) {
        t[b + x] = s / n;
        s += a[b + Math.min(x + k + 1, w - 1)] - a[b + Math.max(x - k, 0)];
      }
    }
    const acc = new Float64Array(w); // vertical t -> a, one row at a time (cache friendly)
    for (let x = 0; x < w; x++) {
      let s = t[x] * (k + 1);
      for (let i = 1; i <= k; i++) s += t[Math.min(i, h - 1) * w + x];
      acc[x] = s;
    }
    for (let y = 0; y < h; y++) {
      const b = y * w, ad = Math.min(y + k + 1, h - 1) * w, rm = Math.max(y - k, 0) * w;
      for (let x = 0; x < w; x++) { a[b + x] = acc[x] / n; acc[x] += t[ad + x] - t[rm + x]; }
    }
  }
  function blur(a, w, h, r) {
    if (!(r > 0) || w < 2 || h < 2) return;
    const k = Math.max(1, Math.round(r / 2)), t = new Float32Array(w * h);
    for (let p = 0, P = r < 2 ? 2 : 3; p < P; p++) boxPass(a, t, w, h, k);
  }

  const median = (arr) => { const s = Float32Array.from(arr).sort(); return s.length ? s[s.length >> 1] : 0; };

  // processed values (0..255 floats) inside the crop region. Returns {v, x0,y0,rw,rh, bg}
  function values(rgba, w, h, o) {
    const { x0, y0, x1, y1 } = region(w, h, o.crop), rw = x1 - x0, rh = y1 - y0, n = rw * rh;
    const out = { v: new Float32Array(n), x0, y0, rw, rh, bg: null };
    if (n <= 0) return out;
    const f = cfac(o.contrast), br = o.brightness;
    if (EDGE[o.mode]) return edgeValues(rgba, w, o, out, f, br);
    if (o.mode !== "bg") {
      const v = out.v;
      for (let y = 0, i = 0; y < rh; y++) for (let x = 0; x < rw; x++, i++) {
        const p = ((y + y0) * w + x + x0) * 4;
        const g = 0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2];
        v[i] = Math.max(0, Math.min(255, (g - 128) * f + 128 + br));
      }
      blur(v, rw, rh, o.blur);
      return out;
    }
    const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let y = 0, i = 0; y < rh; y++) for (let x = 0; x < rw; x++, i++) {
      const p = ((y + y0) * w + x + x0) * 4;
      ch[0][i] = rgba[p]; ch[1][i] = rgba[p + 1]; ch[2][i] = rgba[p + 2];
    }
    for (const c of ch) blur(c, rw, rh, o.blur);
    // background model: explicit colour, else a gradient between the two long crop edges (median of a 3 px band in a
    // sliding window), so a lit / mottled background that drifts along the part does not leak into the shape
    const horiz = rw >= rh, L = horiz ? rw : rh, A = horiz ? rh : rw, band = Math.min(3, A);
    let edge = null;
    if (!o.bg && A >= 6) {
      const W = Math.max(6, Math.round(L / 20)), step = 4, ns = Math.ceil(L / step) + 1;
      edge = [0, 1].map(() => [0, 1, 2].map(() => new Float32Array(L)));
      for (let e = 0; e < 2; e++) for (let c = 0; c < 3; c++) {
        const samp = new Float32Array(ns), buf = [];
        for (let si = 0; si < ns; si++) {
          const lo = Math.max(0, si * step - W), hi = Math.min(L - 1, si * step + W);
          buf.length = 0;
          for (let u = lo; u <= hi; u += 2) for (let k = 0; k < band; k++) {
            const a = e ? A - 1 - k : k;
            buf.push(ch[c][horiz ? a * rw + u : u * rw + a]);
          }
          samp[si] = median(buf);
        }
        for (let u = 0; u < L; u++) { const f = u / step, i0 = Math.min(ns - 2, f | 0); edge[e][c][u] = samp[i0] + (samp[i0 + 1] - samp[i0]) * (f - i0); }
      }
    }
    const idx = [];
    for (let x = 0; x < rw; x++) { idx.push(x); if (rh > 1) idx.push((rh - 1) * rw + x); }
    for (let y = 1; y < rh - 1; y++) { idx.push(y * rw); if (rw > 1) idx.push(y * rw + rw - 1); }
    const bg = o.bg || ch.map((c) => median(idx.map((i) => c[i])));
    out.bg = bg;
    // distance = luma difference plus CHROMA_W x chroma difference: chroma separates a moulded handle from a mottled
    // background of similar brightness, luma alone does not
    const v = out.v;
    for (let y = 0, i = 0; y < rh; y++) for (let x = 0; x < rw; x++, i++) {
      let b0 = bg[0], b1 = bg[1], b2 = bg[2];
      if (edge) {
        const u = horiz ? x : y, t = (horiz ? y : x) / (A - 1);
        b0 = edge[0][0][u] + (edge[1][0][u] - edge[0][0][u]) * t;
        b1 = edge[0][1][u] + (edge[1][1][u] - edge[0][1][u]) * t;
        b2 = edge[0][2][u] + (edge[1][2][u] - edge[0][2][u]) * t;
      }
      const dr = ch[0][i] - b0, dg = ch[1][i] - b1, db = ch[2][i] - b2;
      const yl = 0.2126 * dr + 0.7152 * dg + 0.0722 * db, cr = dr - yl, cg = dg - yl, cb = db - yl;
      v[i] = Math.max(0, Math.min(255, Math.sqrt(yl * yl + CHROMA_W * CHROMA_W * (cr * cr + cg * cg + cb * cb)) * f + br));
    }
    return out;
  }

  // edge modes: gradient magnitude and the direction of the strongest channel, quantised to 4 (0 = horizontal gradient, 1 = /,
  // 2 = vertical, 3 = \) for thinning. Channels: blurred luma and the two chroma differences. "edge": chroma counts EDGE_CHROMA x
  // luma (a pick on a plain or a light / dark background). "edgec" (colour edges): each channel is divided by its own typical
  // (median) gradient over the crop, so the background's texture counts as about EDGE_UNIT whatever it is: on light / dark
  // speckled stone the luma edges are muted and a hue change (steel on blue-grey stone) carries the outline.
  function edgeValues(rgba, w, o, out, f, br) {
    const { x0, y0, rw, rh, v } = out, n = rw * rh, dir = new Uint8Array(n);
    out.dir = dir;
    if (rw < 3 || rh < 3) return out;
    const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let y = 0, i = 0; y < rh; y++) for (let x = 0; x < rw; x++, i++) {
      const p = ((y + y0) * w + x + x0) * 4, r = rgba[p], g = rgba[p + 1], b = rgba[p + 2], l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      ch[0][i] = l; ch[1][i] = r - l; ch[2][i] = b - l;
    }
    let c0 = 0;
    const G = ch.map(a => { blur(a, rw, rh, Math.max(1, o.blur)); const gx = new Float32Array(n), gy = new Float32Array(n);
      for (let y = 1; y < rh - 1; y++) for (let x = 1; x < rw - 1; x++) { const i = y * rw + x;
        gx[i] = a[i - rw + 1] + 2 * a[i + 1] + a[i + rw + 1] - a[i - rw - 1] - 2 * a[i - 1] - a[i + rw - 1];
        gy[i] = a[i + rw - 1] + 2 * a[i + rw] + a[i + rw + 1] - a[i - rw - 1] - 2 * a[i - rw] - a[i - rw + 1]; }
      const smp = []; for (let i = rw + 1; i < n - rw - 1; i += 7) smp.push(Math.hypot(gx[i], gy[i]));
      return { gx, gy, k: o.mode === "edgec" ? EDGE_UNIT / Math.max(EDGE_FLOOR, median(smp)) : c0++ ? EDGE_CHROMA : 1 }; });
    const T1 = Math.tan(Math.PI / 8), T2 = Math.tan(3 * Math.PI / 8);
    for (let y = 1; y < rh - 1; y++) for (let x = 1; x < rw - 1; x++) {
      const i = y * rw + x; let s = 0, bx = 0, by = 0, bm = -1;
      for (const c of G) { const gx = c.gx[i] * c.k, gy = c.gy[i] * c.k, m2 = gx * gx + gy * gy; s += m2; if (m2 > bm) { bm = m2; bx = gx; by = gy; } }
      v[i] = Math.max(0, Math.min(255, Math.sqrt(s) * f + br));
      const ax = Math.abs(bx), ay = Math.abs(by);
      dir[i] = ay <= ax * T1 ? 0 : ay >= ax * T2 ? 2 : (bx > 0) === (by > 0) ? 3 : 1;
    }
    return out;
  }
  // marker watershed (Meyer flooding, 4-connected, 256 buckets): every unlabelled pixel takes the label of the marker that reaches it
  // over the lowest gradient. lab: 0 = unknown, else the marker label; filled in place
  function watershed(g, lab, w, h) {
    const N = w * h, B = Array.from({ length: 256 }, () => []); let cur = 0;
    const push = (j, l) => { if (!lab[j]) { lab[j] = 255; B[Math.max(cur, Math.min(255, g[j] | 0))].push(j, l); } };   // 255 = queued
    const nb = (i, l) => { const x = i % w; if (x > 0) push(i - 1, l); if (x < w - 1) push(i + 1, l); if (i >= w) push(i - w, l); if (i < N - w) push(i + w, l); };
    for (let i = 0; i < N; i++) if (lab[i] && lab[i] !== 255) nb(i, lab[i]);
    for (; cur < 256; cur++) { const b = B[cur]; while (b.length) { const l = b.pop(), j = b.pop(); lab[j] = l; nb(j, l); } }
  }
  // close gaps in thin edges: each loose end (an edge pixel with one neighbour) is joined by a straight line to the nearest edge
  // pixel of another piece ahead of it (within `D` px and 50 degrees of the direction the edge was running). A pick's tip, where
  // the two edges already meet, has no loose end, so it is not cut off the way a wide closing would cut it.
  function linkGaps(E, w, h, D) {
    const L = labels(E, w, h).lab, ends = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; if (!E[i]) continue;
      let c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && E[i + dy * w + dx]) c++;
      if (c === 1) ends.push(i);
    }
    const lines = [], cosMax = Math.cos(50 * Math.PI / 180), R = 7;
    for (const e of ends) {
      const ex = e % w, ey = (e / w) | 0;
      // running direction: from the centroid of the edge within R px (connected to the end) to the end
      let sx = 0, sy = 0, n = 0; const seen = new Map([[e, 0]]), q = [e];
      while (q.length) { const i = q.shift(), d = seen.get(i), x = i % w, y = (i / w) | 0; sx += x; sy += y; n++;
        if (d >= R) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx; if (E[j] && !seen.has(j)) { seen.set(j, d + 1); q.push(j); } } }
      if (n < 4) continue;
      let ux = ex - sx / n, uy = ey - sy / n; const ul = Math.hypot(ux, uy); if (ul < 1) continue; ux /= ul; uy /= ul;
      let best = -1, bc = Infinity;
      for (let dy = -D; dy <= D; dy++) { const yy = ey + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -D; dx <= D; dx++) { const xx = ex + dx; if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx; if (!E[j] || seen.has(j)) continue;
          const d = Math.hypot(dx, dy); if (d > D || d < 1) continue;
          const cs = (dx * ux + dy * uy) / d; if (cs < cosMax) continue;
          if (L[j] === L[e] && d < 3 * R) continue;   // its own edge bending back
          const cost = d * (2 - cs); if (cost < bc) { bc = cost; best = j; } } }
      if (best >= 0) lines.push([ex, ey, best % w, (best / w) | 0]);
    }
    for (const [x0, y0, x1, y1] of lines) {   // draw after the search, so a new line is not linked to
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let t = 0; t <= n; t++) { const x = Math.round(x0 + (x1 - x0) * t / n), y = Math.round(y0 + (y1 - y0) * t / n); E[y * w + x] = 1; }
    }
  }
  // edge mode mask (Canny-like): thin the gradient to its ridge, keep strong edges (>= threshold, extended along >= threshold / 2),
  // drop short pieces (stone speckle), thicken by `clean` px to close gaps. The regions those walls enclose are the parts; kept
  // unless they are background (3+ crop sides, or long contact with a long side of the crop), specks, or run across the crop (a
  // vein or a shadow crossing the pick). The kept regions are grown back over their walls, which also joins neighbouring regions.
  function edgeMaskFrom(rgba, w, h, o, V) {
    const { rw, rh, dir } = V, N = rw * rh, g = V.v, hi = Math.max(1, o.threshold), lo = hi * EDGE_LO, m = new Uint8Array(w * h);
    if (rw < 8 || rh < 8) return m;
    const OFF = [1, rw - 1, rw, rw + 1], nm = new Float32Array(N);
    for (let y = 1; y < rh - 1; y++) for (let x = 1; x < rw - 1; x++) {
      const i = y * rw + x, d = OFF[dir[i]], a = g[i];
      if (a >= g[i - d] && a >= g[i + d]) nm[i] = a;
    }
    const E = new Uint8Array(N), stack = new Int32Array(N);
    for (let s = 0; s < N; s++) {
      if (nm[s] < hi || E[s]) continue;
      let sp = 0; stack[sp++] = s; E[s] = 1;
      while (sp) {
        const i = stack[--sp], x = i % rw, y = (i / rw) | 0;
        for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= rh) continue;
          for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= rw) continue;
            const j = yy * rw + xx; if (!E[j] && nm[j] >= lo) { E[j] = 1; stack[sp++] = j; } } }
      }
    }
    const minLen = Math.max(12, Math.round(0.06 * Math.max(rw, rh)));
    { const L = labels(E, rw, rh); for (let i = 0; i < N; i++) if (E[i]) { const s = L.stats[L.lab[i]]; if (Math.max(s.x1 - s.x0, s.y1 - s.y0) + 1 < minLen) E[i] = 0; } }
    linkGaps(E, rw, rh, Math.max(8, Math.round(EDGE_LINK * Math.max(rw, rh))));
    const r = Math.max(1, Math.round(o.clean)), W = morph(E, rw, rh, r, false);
    for (let i = 0; i < N; i++) W[i] = W[i] ? 0 : 1;   // W: the free space between the walls
    const RL = labels(W, rw, rh), ns = RL.stats.length, horiz = rw >= rh, long = horiz ? rw : rh, short = horiz ? rh : rw;
    const touch = new Int32Array(ns);   // pixels on a long side of the crop
    for (let t = 0; t < long; t++) for (const e of [0, short - 1]) { const i = horiz ? e * rw + t : t * rw + e; if (RL.lab[i]) touch[RL.lab[i]]++; }
    const minA = Math.max(30, 0.002 * N), keep = new Uint8Array(ns);
    for (let k = 1; k < ns; k++) {
      const s = RL.stats[k], bw = s.x1 - s.x0 + 1, bh = s.y1 - s.y0 + 1, along = horiz ? bw : bh, across = horiz ? bh : bw;
      const sides = (s.x0 <= 0) + (s.y0 <= 0) + (s.x1 >= rw - 1) + (s.y1 >= rh - 1);
      if (sides >= 3 || touch[k] > 0.12 * long) { keep[k] = 2; continue; }
      if (s.n < minA) { keep[k] = 3; continue; }
      if (across > along && across >= 0.3 * short) { keep[k] = 4; continue; }   // runs across the crop: a vein or a shadow
      keep[k] = 1;
    }
    // the kept regions seed the part, every other region seeds the background; a watershed on the gradient then shares out the
    // walls, so the outline sits on the edge's ridge (and a thin tip with no region of its own goes with the part along it)
    const lab = new Uint8Array(N); let any = false;
    for (let i = 0; i < N; i++) { const c = RL.lab[i] ? keep[RL.lab[i]] : 0; if (c === 1) { lab[i] = 1; any = true; } else if (c) lab[i] = 2; }
    if (!any) return m;
    for (let t = 0; t < long; t++) for (const e of [0, short - 1]) { const i = horiz ? e * rw + t : t * rw + e; if (!lab[i]) lab[i] = 2; }
    const gw = Float32Array.from(g); for (let i = 0; i < N; i++) if (E[i]) gw[i] = 255;   // the edges (and the gap links) are the dams
    watershed(gw, lab, rw, rh);
    let K = lab; for (let i = 0; i < N; i++) K[i] = K[i] === 1 ? 1 : 0;
    K = morph(morph(K, rw, rh, r + 2, false), rw, rh, r + 2, true);   // closing: no crack along a dam between two parts of the pick
    for (let y = 0, i = 0; y < rh; y++) { const b = (y + V.y0) * w + V.x0; for (let x = 0; x < rw; x++, i++) m[b + x] = K[i]; }
    return m;
  }

  // alpha test: only when the image really has transparency
  function transparent(rgba, w, h) {
    for (let i = 3, n = w * h * 4; i < n; i += 4) if (rgba[i] < 200) return true;
    return false;
  }

  // ---------- morphology: square window, separable running counts (O(n) regardless of radius)
  // erode: outside counts as shape (touching the edge is not eroded); dilate: outside counts as empty
  function morph(m, w, h, r, erode) {
    const t = new Uint8Array(w * h), o = new Uint8Array(w * h), key = erode ? 0 : 1;
    for (let y = 0; y < h; y++) {
      const b = y * w;
      let c = 0;
      for (let i = 0; i <= Math.min(r, w - 1); i++) if (m[b + i] === key) c++;
      for (let x = 0; x < w; x++) {
        t[b + x] = erode ? (c === 0 ? 1 : 0) : (c > 0 ? 1 : 0);
        if (x + r + 1 < w && m[b + x + r + 1] === key) c++;
        if (x - r >= 0 && m[b + x - r] === key) c--;
      }
    }
    const cnt = new Int32Array(w);
    for (let y = 0; y <= Math.min(r, h - 1); y++) for (let x = 0, b = y * w; x < w; x++) if (t[b + x] === key) cnt[x]++;
    for (let y = 0; y < h; y++) {
      const b = y * w;
      for (let x = 0; x < w; x++) o[b + x] = erode ? (cnt[x] === 0 ? 1 : 0) : (cnt[x] > 0 ? 1 : 0);
      if (y + r + 1 < h) for (let x = 0, a = (y + r + 1) * w; x < w; x++) if (t[a + x] === key) cnt[x]++;
      if (y - r >= 0) for (let x = 0, a = (y - r) * w; x < w; x++) if (t[a + x] === key) cnt[x]--;
    }
    return o;
  }
  function clean(m, w, h, r) {
    r = Math.round(r);
    if (r < 1) return m;
    m = morph(morph(m, w, h, r, true), w, h, r, false); // opening: drops speckle
    return morph(morph(m, w, h, r, false), w, h, r, true); // closing: fills grooves and text
  }

  // ---------- public
  function processed(rgba, w, h, opts) {
    const o = norm(opts), V = values(rgba, w, h, o), out = new Uint8ClampedArray(w * h * 4);
    const outside = o.mode === "dark" ? 255 : 0; // outside the crop reads as background
    for (let i = 0; i < w * h; i++) { const p = i * 4; out[p] = out[p + 1] = out[p + 2] = outside; out[p + 3] = 255; }
    for (let y = 0, i = 0; y < V.rh; y++) for (let x = 0; x < V.rw; x++, i++) {
      const p = ((y + V.y0) * w + x + V.x0) * 4, g = Math.round(V.v[i]);
      out[p] = out[p + 1] = out[p + 2] = g;
    }
    return out;
  }

  function mask(rgba, w, h, opts) {
    const o = norm(opts);
    return maskFrom(rgba, w, h, o, values(rgba, w, h, o), transparent(rgba, w, h));
  }
  function maskFrom(rgba, w, h, o, V, alpha) {
    if (EDGE[o.mode]) return edgeMaskFrom(rgba, w, h, o, V);
    const m = new Uint8Array(w * h);
    const thr = o.threshold, dark = o.mode === "dark";
    for (let y = 0, i = 0; y < V.rh; y++) {
      const b = (y + V.y0) * w + V.x0;
      for (let x = 0; x < V.rw; x++, i++) {
        if (alpha && rgba[(b + x) * 4 + 3] < 128) continue;
        m[b + x] = (dark ? V.v[i] < thr : V.v[i] > thr) ? 1 : 0;
      }
    }
    return o.clean >= 1 ? clean(m, w, h, o.clean) : m;
  }

  function otsu(rgba, w, h, opts) {
    const o = norm(opts);
    if (EDGE[o.mode]) return EDGE[o.mode].auto;
    return otsuFrom(rgba, w, h, values(rgba, w, h, o), transparent(rgba, w, h));
  }
  function otsuFrom(rgba, w, h, V, alpha) {
    const hist = new Float64Array(256);
    let total = 0;
    for (let y = 0, i = 0; y < V.rh; y++) for (let x = 0; x < V.rw; x++, i++) {
      if (alpha && rgba[((y + V.y0) * w + x + V.x0) * 4 + 3] < 128) continue;
      hist[Math.max(0, Math.min(255, Math.round(V.v[i])))]++; total++;
    }
    if (!total) return 128;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let wB = 0, sB = 0, best = -1, thr = 128;
    for (let t = 0; t < 255; t++) {
      wB += hist[t]; sB += t * hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      const d = sB / wB - (sum - sB) / wF, s = wB * wF * d * d;
      if (s > best) { best = s; thr = t; }
    }
    return thr;
  }

  // 8-connected flood fill of set pixels from index s into vis; returns pixel count
  function flood(m, w, h, s, vis, stack) {
    let sp = 0, n = 0;
    stack[sp++] = s; vis[s] = 1;
    while (sp) {
      const i = stack[--sp], x = i % w, y = (i / w) | 0;
      n++;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (m[j] && !vis[j]) { vis[j] = 1; stack[sp++] = j; }
        }
      }
    }
    return n;
  }

  function component(m, w, h, seed) {
    const N = w * h, stack = new Int32Array(N);
    let start = -1;
    if (seed) {
      const sx = Math.max(0, Math.min(w - 1, Math.round(seed[0]))), sy = Math.max(0, Math.min(h - 1, Math.round(seed[1])));
      if (m[sy * w + sx]) start = sy * w + sx;
      else { // nearest set pixel
        let bd = Infinity;
        for (let i = 0; i < N; i++) if (m[i]) {
          const dx = (i % w) - sx, dy = ((i / w) | 0) - sy, d = dx * dx + dy * dy;
          if (d < bd) { bd = d; start = i; }
        }
      }
    } else { // largest component
      const vis = new Uint8Array(N);
      let bn = 0;
      for (let i = 0; i < N; i++) if (m[i] && !vis[i]) { const c = flood(m, w, h, i, vis, stack); if (c > bn) { bn = c; start = i; } }
    }
    if (start < 0) return null;
    const comp = new Uint8Array(N);
    flood(m, w, h, start, comp, stack);
    // fill holes: 4-connected flood of the background from the border; unreached non-shape is interior
    const out = new Uint8Array(N); // 1 = reached background
    let sp = 0;
    const push = (i) => { if (!comp[i] && !out[i]) { out[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp) {
      const i = stack[--sp], x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < N - w) push(i + w);
    }
    for (let i = 0; i < N; i++) out[i] = out[i] ? 0 : 1;
    return out;
  }

  // 8-connected labels with per-label pixel count and bounding box
  function labels(m, w, h) {
    const N = w * h, lab = new Int32Array(N), stack = new Int32Array(N), stats = [null];
    for (let s = 0; s < N; s++) {
      if (!m[s] || lab[s]) continue;
      const id = stats.length, st = { id, n: 0, x0: w, y0: h, x1: -1, y1: -1 }; stats.push(st);
      let sp = 0; stack[sp++] = s; lab[s] = id;
      while (sp) {
        const i = stack[--sp], x = i % w, y = (i / w) | 0;
        st.n++; if (x < st.x0) st.x0 = x; if (x > st.x1) st.x1 = x; if (y < st.y0) st.y0 = y; if (y > st.y1) st.y1 = y;
        for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx; if (m[j] && !lab[j]) { lab[j] = id; stack[sp++] = j; } } }
      }
    }
    return { lab, stats };
  }
  function maxN(stats) { let b = 0; for (let k = 1; k < stats.length; k++) if (stats[k].n > b) b = stats[k].n; return b; }
  const aspect = st => { const a = st.x1 - st.x0 + 1, b = st.y1 - st.y0 + 1; return Math.max(a, b) / Math.max(1, Math.min(a, b)); };
  // one label as a mask with its holes filled
  function fillLabel(lab, w, h, id) {
    const N = w * h, comp = new Uint8Array(N); for (let i = 0; i < N; i++) if (lab[i] === id) comp[i] = 1;
    return fillHoles(comp, w, h);
  }
  function fillHoles(comp, w, h) {
    const N = w * h, out = new Uint8Array(N), stack = new Int32Array(N); let sp = 0;
    const push = i => { if (!comp[i] && !out[i]) { out[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp) { const i = stack[--sp], x = i % w; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (i >= w) push(i - w); if (i < N - w) push(i + w); }
    for (let i = 0; i < N; i++) out[i] = out[i] ? 0 : 1;
    return out;
  }
  // Choose the shape to trace from a mask. Order: the component that overlaps `ref` most (the previous trace, so a re-trace stays
  // on the same part instead of jumping to a speck under the seed); the one under / nearest `seed`; else the largest long-and-thin
  // one (a pick), else the largest. The choice may have merged with something of another colour (a marble vein crossing the
  // pick): it is split by colour (2 clusters on chroma) and the piece that is as long but thinner is kept (the one under the seed
  // when there is one). Returns { comp (holes filled), n, bbox, split } or null.
  function choose(rgba, w, h, m, sel) {
    sel = sel || {};
    const { lab, stats } = labels(m, w, h); if (stats.length < 2) return null;
    let id = 0;
    if (sel.ref && sel.ref.length === w * h) { const ov = new Float64Array(stats.length); for (let i = 0; i < lab.length; i++) if (lab[i] && sel.ref[i]) ov[lab[i]]++;
      let b = 0; for (let k = 1; k < ov.length; k++) if (ov[k] > b) { b = ov[k]; id = k; } }
    const sx = sel.seed ? Math.max(0, Math.min(w - 1, Math.round(sel.seed[0]))) : 0, sy = sel.seed ? Math.max(0, Math.min(h - 1, Math.round(sel.seed[1]))) : 0;
    if (!id && sel.seed) {
      id = lab[sy * w + sx];
      if (!id) { let bd = Infinity; const big = maxN(stats) * 0.02;   // nearest pixel of a non-speck component
        for (let i = 0; i < lab.length; i++) if (lab[i] && stats[lab[i]].n >= big) { const dx = (i % w) - sx, dy = ((i / w) | 0) - sy, d = dx * dx + dy * dy; if (d < bd) { bd = d; id = lab[i]; } } }
    }
    if (!id) {   // no seed: skip background (touches 3+ sides of the image); prefer a long, level shape (a pick), then the largest
      const big = maxN(stats), sides = s => (s.x0 === 0) + (s.y0 === 0) + (s.x1 === w - 1) + (s.y1 === h - 1);
      const level = s => (s.x1 - s.x0 + 1) / (s.y1 - s.y0 + 1);
      const tiers = [s => sides(s) <= 2 && level(s) >= 2 && s.n >= big * 0.05, s => sides(s) <= 2 && s.n >= big * 0.05, () => true];
      for (const ok of tiers) { let b = -1; for (const s of stats.slice(1)) if (ok(s) && s.n > b) { b = s.n; id = s.id; } if (id) break; } }
    let st = stats[id], comp = fillLabel(lab, w, h, id), split = false;
    if (st.n >= 60 && !transparent(rgba, w, h)) {
      const r = splitByColour(rgba, w, h, lab, id, st, sel.seed ? [sx, sy] : null);
      if (r) { comp = r.comp; st = r.st; split = true; }
    }
    return { comp, n: st.n, bbox: { x0: st.x0, y0: st.y0, x1: st.x1, y1: st.y1 }, split };
  }
  function splitByColour(rgba, w, h, lab, id, st, seed) {
    const idx = []; for (let y = st.y0; y <= st.y1; y++) for (let x = st.x0; x <= st.x1; x++) { const i = y * w + x; if (lab[i] === id) idx.push(i); }
    const ch = i => { const p = i * 4, r = rgba[p], g = rgba[p + 1], b = rgba[p + 2], l = 0.2126 * r + 0.7152 * g + 0.0722 * b; return [r - l, b - l]; };
    // 2-means on chroma, started from the two extremes of the first axis
    let c0 = [Infinity, 0], c1 = [-Infinity, 0];
    for (const i of idx) { const c = ch(i); if (c[0] - c[1] < c0[0] - c0[1]) c0 = c; if (c[0] - c[1] > c1[0] - c1[1]) c1 = c; }
    const asg = new Uint8Array(idx.length);
    for (let it = 0; it < 8; it++) {
      const s = [[0, 0, 0], [0, 0, 0]];
      idx.forEach((i, k) => { const c = ch(i), a = (c[0] - c0[0]) ** 2 + (c[1] - c0[1]) ** 2 > (c[0] - c1[0]) ** 2 + (c[1] - c1[1]) ** 2 ? 1 : 0; asg[k] = a; s[a][0] += c[0]; s[a][1] += c[1]; s[a][2]++; });
      if (!s[0][2] || !s[1][2]) return null;
      c0 = [s[0][0] / s[0][2], s[0][1] / s[0][2]]; c1 = [s[1][0] / s[1][2], s[1][1] / s[1][2]];
    }
    if (Math.hypot(c0[0] - c1[0], c0[1] - c1[1]) < 12) return null;   // one colour: nothing to split
    let best = null;
    for (const k of [0, 1]) {
      let m = new Uint8Array(w * h); idx.forEach((i, j) => { if (asg[j] === k) m[i] = 1; });
      m = clean(m, w, h, 1);
      const L = labels(m, w, h); if (L.stats.length < 2) continue;
      let pid = seed ? L.lab[seed[1] * w + seed[0]] : 0;
      if (!pid) { let b = -1; for (const s of L.stats.slice(1)) if (s.n > b) { b = s.n; pid = s.id; } }
      const s = L.stats[pid];
      // keep a piece only if it is as long as the whole and clearly thinner: a vein or a shadow across the part was cut away, not
      // a differently coloured handle (that would shorten it)
      const W0 = st.x1 - st.x0 + 1, H0 = st.y1 - st.y0 + 1, w1 = s.x1 - s.x0 + 1, h1 = s.y1 - s.y0 + 1, horiz = W0 >= H0;
      const maj = horiz ? w1 / W0 : h1 / H0, min = horiz ? h1 / H0 : w1 / W0;
      if (s.n < st.n * 0.3 || maj < 0.9 || min > 0.85) continue;
      const hasSeed = !!seed && L.lab[seed[1] * w + seed[0]] === pid;
      if (!best || hasSeed > best.hasSeed || (hasSeed === best.hasSeed && s.n > best.st.n)) best = { lab: L.lab, pid, st: s, hasSeed };
    }
    if (!best) return null;
    // give back the other colour where it touches the kept piece (an edge in shadow or a highlight is part of it), so only what
    // sticks out further than a few px (the vein) is cut away
    const piece = new Uint8Array(w * h); for (let i = 0; i < piece.length; i++) if (best.lab[i] === best.pid) piece[i] = 1;
    const grown = morph(piece, w, h, Math.max(4, Math.round(Math.min(w, h) / 25)), false);
    for (let i = 0; i < grown.length; i++) grown[i] = grown[i] && lab[i] === id ? 1 : 0;
    const L = labels(grown, w, h); let pid = 0, bn = -1;
    for (const s of L.stats.slice(1)) if (s.n > bn) { bn = s.n; pid = s.id; }
    const s = L.stats[pid], horiz = st.x1 - st.x0 >= st.y1 - st.y0;
    if ((horiz ? (s.y1 - s.y0 + 1) / (st.y1 - st.y0 + 1) : (s.x1 - s.x0 + 1) / (st.x1 - st.x0 + 1)) > 0.92) return null;   // nothing really cut
    return { comp: fillLabel(L.lab, w, h, pid), st: s };
  }


  // ---------- auto-tune: try a small grid of settings and keep the most pick-like result
  // Region of the crop as inclusive pixel bounds.
  function regionIncl(w, h, crop) { const r = region(w, h, crop); return { x0: r.x0, y0: r.y0, x1: r.x1 - 1, y1: r.y1 - 1 }; }
  // score a component (stats s) inside region R; higher = more pick-like. -1 = rejected
  function pickScore(s, R) {
    const rw = R.x1 - R.x0 + 1, rh = R.y1 - R.y0 + 1, bw = s.x1 - s.x0 + 1, bh = s.y1 - s.y0 + 1;
    const L = Math.max(bw, bh), T = Math.max(1, Math.min(bw, bh)), ratio = L / T, fill = s.n / (bw * bh);
    const sides = (s.x0 <= R.x0) + (s.y0 <= R.y0) + (s.x1 >= R.x1) + (s.y1 >= R.y1);
    if (sides >= 3 || s.n < 0.002 * rw * rh || L < 0.2 * Math.max(rw, rh) || T < 3) return -1;
    if (bw * bh > 0.6 * rw * rh && ratio < 3) return -1;
    const thick = T / Math.min(rw, rh);   // plausible pick: a modest fraction of the short side
    let sc = 0.3 * Math.min(ratio, 6) / 6 + 0.15 * Math.min(fill / 0.5, 1) + 0.4 * Math.min(L / Math.max(rw, rh), 1)
      + (thick <= 0.85 ? 0.1 : 0);
    if (sides >= 2 && T > 0.95 * Math.min(rw, rh)) sc -= 0.3;   // spans the crop both ways: the background strip
    if (sides === 2) sc -= 0.2;
    if (ratio < 2.5) sc -= 0.2;
    if (ratio > 30) sc -= 0.3;   // thinner than any pick (a wire, a crack, an edge highlight)
    return sc;
  }
  // ragged-edge measure of a filled mask: total turning of its outline (lightly smoothed) in full turns. A smooth pick reads about
  // 2-3 (a hook or a wavy blade a little more); a trace that wandered into the background texture 8 or more
  function roughness(comp, w, h) {
    let P = boundary(comp, w, h); if (!P || P.length < 12) return 1;
    for (let pass = 0; pass < 2; pass++) { const Q = []; for (let i = 0; i < P.length; i++) { let sx = 0, sy = 0;
      for (let j = -2; j <= 2; j++) { const q = P[(i + j + P.length) % P.length]; sx += q[0]; sy += q[1]; } Q.push([sx / 5, sy / 5]); } P = Q; }
    const S = P.filter((_, i) => i % 3 === 0); let t = 0;
    for (let i = 0; i < S.length; i++) { const a = S[(i - 1 + S.length) % S.length], c = S[i], d = S[(i + 1) % S.length];
      let da = Math.atan2(d[1] - c[1], d[0] - c[0]) - Math.atan2(c[1] - a[1], c[0] - a[0]);
      while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; t += Math.abs(da); }
    return t / (2 * Math.PI);
  }
  const roughPenalty = r => 0.3 * Math.max(0, Math.min(1, (r - 4) / 8));
  // crop region of an RGBA image, averaged down by integer f
  function subImage(rgba, w, h, R, f) {
    const sw = Math.max(1, Math.floor((R.x1 - R.x0 + 1) / f)), sh = Math.max(1, Math.floor((R.y1 - R.y0 + 1) / f)), out = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const q = (y * sw + x) * 4; let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) { const p = ((R.y0 + y * f + dy) * w + R.x0 + x * f + dx) * 4; a0 += rgba[p]; a1 += rgba[p + 1]; a2 += rgba[p + 2]; a3 += rgba[p + 3]; }
      const k = f * f; out[q] = a0 / k; out[q + 1] = a1 / k; out[q + 2] = a2 / k; out[q + 3] = a3 / k;
    }
    return { rgba: out, w: sw, h: sh };
  }
  // Try modes (bg/dark/light) x blur x thresholds around Otsu x clean-up and return { opts, score, choice } for the most pick-like
  // result. `base` supplies contrast/brightness/crop/bg; `sel` = { seed, ref } as for choose(). The search runs on the crop region
  // (averaged down by 2 when it is large); the best few are re-checked at full size.
  function autoTune(rgba, w, h, base, sel) {
    sel = sel || {};
    const b = norm(base), R = regionIncl(w, h, b.crop), rw = R.x1 - R.x0 + 1, rh = R.y1 - R.y0 + 1;
    const f = Math.max(rw, rh) > 520 ? 2 : 1;
    const seedIn = (S, g) => sel.seed ? [Math.max(0, Math.min(S.w - 1, (sel.seed[0] - R.x0) / g)), Math.max(0, Math.min(S.h - 1, (sel.seed[1] - R.y0) / g))] : null;
    const run = (S, g, o, selS) => { const m = mask(S.rgba, S.w, S.h, { ...o, crop: null, blur: Math.round(o.blur / g), clean: Math.round(o.clean / g) }); return { m, ch: choose(S.rgba, S.w, S.h, m, selS) }; };
    const S1 = subImage(rgba, w, h, R, f), SR = { x0: 0, y0: 0, x1: S1.w - 1, y1: S1.h - 1 };
    const seedS = seedIn(S1, f), seedId = seedS ? Math.round(seedS[1]) * S1.w + Math.round(seedS[0]) : -1;
    const alpha = transparent(S1.rgba, S1.w, S1.h), cands = [];
    for (const mode of ["bg", "dark", "light"]) for (const bl of [0, 2]) {
      const o0 = { ...b, crop: null, mode, blur: Math.round(bl / f), threshold: 128, clean: 0 }, V = values(S1.rgba, S1.w, S1.h, o0), t0 = otsuFrom(S1.rgba, S1.w, S1.h, V, alpha);
      const seen = new Set();
      for (const fa of [0.6, 0.8, 1, 1.25, 1.5]) {
        const thr = Math.max(1, Math.min(254, Math.round(t0 * fa)));
        if (seen.has(thr)) continue; seen.add(thr);
        const o = { ...o0, threshold: thr }, raw = maskFrom(S1.rgba, S1.w, S1.h, o, V, alpha), done = new Set();
        for (const cl of [0, 1, 2]) {
          const cs = Math.round(cl / f); if (done.has(cs)) continue; done.add(cs);
          const m = cs ? clean(raw, S1.w, S1.h, cs) : raw, L = labels(m, S1.w, S1.h);
          let best = -1;
          for (let k = 1; k < L.stats.length; k++) {
            let sc = pickScore(L.stats[k], SR); if (sc < 0) continue;
            if (seedId >= 0 && L.lab[seedId] === k) sc += 0.3;
            if (sc > best) best = sc;
          }
          if (best >= 0) cands.push({ o: { ...b, mode, blur: bl, threshold: thr, clean: cl }, score: best });
        }
      }
    }
    cands.sort((x, y) => y.score - x.score);
    // what choose() really picks differs from the best label: re-score the leaders on its choice
    const seedSel = { seed: seedS }, lead = [];
    for (const c of cands.slice(0, 14)) {
      const r = run(S1, f, c.o, seedSel); if (!r.ch) continue;
      const sc = pickScore({ n: r.ch.n, ...r.ch.bbox }, SR); if (sc < 0) continue;
      lead.push({ o: c.o, score: sc - roughPenalty(roughness(r.ch.comp, S1.w, S1.h)) + (seedId >= 0 && r.ch.comp[seedId] ? 0.3 : 0) });
    }
    lead.sort((x, y) => y.score - x.score); cands.length = 0; cands.push(...lead);
    // the real pipeline (crop edges are not eroded like image edges in the sub-image): verify the best few on the full image
    const sd = sel.seed ? Math.round(sel.seed[1]) * w + Math.round(sel.seed[0]) : -1;
    let out = null;
    for (const c of cands.slice(0, 3)) {
      const ch = choose(rgba, w, h, mask(rgba, w, h, c.o), sel); if (!ch) continue;
      const sc = pickScore({ n: ch.n, ...ch.bbox }, R); if (sc < 0) continue;
      const tot = sc - roughPenalty(roughness(ch.comp, w, h)) + (sd >= 0 && ch.comp[sd] ? 0.3 : 0);
      if (!out || tot > out.score) out = { opts: c.o, score: tot, choice: ch };
    }
    // the edge modes run on the full image (their thresholds do not carry over to the half-size search image)
    for (const mode in EDGE) for (const bl of EDGE[mode].blurs) {
      const V = values(rgba, w, h, { ...b, mode, blur: bl });
      for (const thr of EDGE[mode].tries) for (const cl of EDGE[mode].cleans) {
        const o = { ...b, mode, blur: bl, threshold: thr, clean: cl }, ch = choose(rgba, w, h, edgeMaskFrom(rgba, w, h, o, V), sel); if (!ch) continue;
        const sc = pickScore({ n: ch.n, ...ch.bbox }, R); if (sc < 0) continue;
        const tot = sc - roughPenalty(roughness(ch.comp, w, h)) + (sd >= 0 && ch.comp[sd] ? 0.3 : 0);
        if (!out || tot > out.score) out = { opts: o, score: tot, choice: ch };
      }
    }
    if (out) return out;
    const o = { ...b, threshold: otsu(rgba, w, h, b) };   // nothing plausible: the plain settings
    return { opts: o, score: 0, choice: choose(rgba, w, h, mask(rgba, w, h, o), sel) };
  }
  // null when the chosen part looks like a pick; else a short hint for the user
  function plausible(choice, w, h, crop) {
    if (!choice) return "Nothing traced: lower the threshold, or try Dark/Light mode or Pick background";
    const R = regionIncl(w, h, crop), rw = R.x1 - R.x0 + 1, rh = R.y1 - R.y0 + 1, s = choice.bbox;
    const bw = s.x1 - s.x0 + 1, bh = s.y1 - s.y0 + 1, L = Math.max(bw, bh), T = Math.max(1, Math.min(bw, bh)), ratio = L / T;
    const sides = (s.x0 <= R.x0) + (s.y0 <= R.y0) + (s.x1 >= R.x1) + (s.y1 >= R.y1);
    if (sides >= 3 || (bw > 0.9 * rw && bh > 0.9 * rh)) return "Looks like background: try Dark/Light mode or Pick background";
    if (choice.n < 0.002 * rw * rh || L < 0.2 * Math.max(rw, rh) || T < 3 || choice.n / (bw * bh) < 0.12)
      return "Very thin/broken: lower the threshold or raise Clean up";
    if (ratio < 2.5) return "The trace is " + (bh >= bw ? "taller" : "wider") + " than a pick: crop tighter round the pick, or click the part";
    return null;
  }

  // Moore-neighbour tracing, Jacob's stopping criterion; start = first set pixel in scan order
  const DX = [-1, -1, 0, 1, 1, 1, 0, -1], DY = [0, -1, -1, -1, 0, 1, 1, 1]; // clockwise from west (y down)
  function boundary(m, w, h) {
    let s = -1;
    for (let i = 0, N = w * h; i < N; i++) if (m[i]) { s = i; break; }
    if (s < 0) return null;
    const sx = s % w, sy = (s / w) | 0, pts = [];
    const set = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
    let px = sx, py = sy, b = 0, d0 = -1;
    for (let it = w * h * 4; it > 0; it--) {
      let moved = false;
      for (let i = 1; i <= 8; i++) {
        const d = (b + i) & 7, qx = px + DX[d], qy = py + DY[d];
        if (!set(qx, qy)) continue;
        if (px === sx && py === sy) {
          if (d0 < 0) d0 = d;
          else if (d === d0) return pts; // left the start the same way again: closed
        }
        pts.push([px, py]);
        const pd = (d + 7) & 7, ex = px + DX[pd], ey = py + DY[pd], ddx = ex - qx, ddy = ey - qy;
        for (let k = 0; k < 8; k++) if (DX[k] === ddx && DY[k] === ddy) { b = k; break; }
        px = qx; py = qy; moved = true;
        break;
      }
      if (!moved) return [[sx, sy]]; // isolated pixel
    }
    return pts;
  }

  function bgAt(rgba, w, h, x, y, r = 3) {
    x = Math.round(x); y = Math.round(y);
    let R = 0, G = 0, B = 0, n = 0;
    for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++)
      for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
        const p = (yy * w + xx) * 4; R += rgba[p]; G += rgba[p + 1]; B += rgba[p + 2]; n++;
      }
    return n ? [R / n, G / n, B / n] : [0, 0, 0];
  }

  return { RECOMMENDED, processed, mask, otsu, component, choose, boundary, bgAt, autoTune, plausible, roughness };
})();
if (typeof module !== "undefined") module.exports = CKTrace;
if (typeof window !== "undefined") window.CKTrace = CKTrace;
