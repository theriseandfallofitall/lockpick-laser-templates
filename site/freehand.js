// Freehand / image-trace outline editor for the customiser's "Outline" tool. Loads before customizer.js;
// uses the global CK (parsePts, ptsToStr, rdpClosed, outlineRing) only at call time. Browser only; pure helpers on CKFreehand._t.
// Raw points (olPts) stay normalised: bbox min = 0,0 and width = olLen, so a change to the length field rescales the outline.
"use strict";

window.CKFreehand = (() => {
  let W = 1000, H = 300;             // canvas internal size (the large view resizes it to the screen)
  const r2 = v => Math.round(v * 100) / 100;

  // ---------- pure helpers
  function bbox(p) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }
  // translate to 0,0 then scale so the width is len (no scale when len is missing): p' = (p + d) * k
  function normalise(p, len) {
    const b = bbox(p), k = len > 0 && b.w > 0 ? len / b.w : 1;
    return { pts: p.map(q => [(q[0] - b.x0) * k, (q[1] - b.y0) * k]), dx: -b.x0, dy: -b.y0, k };
  }
  function isNormal(p, len) { const b = bbox(p); return Math.abs(b.x0) < 0.01 && Math.abs(b.y0) < 0.01 && Math.abs(b.w - len) < 0.01; }
  // rotate about the centroid so the principal (long) axis is horizontal; perimeter-weighted so vertex density does not matter
  function level(p) {
    const n = p.length; let per = 0;
    for (let i = 0; i < n; i++) per += Math.hypot(p[(i + 1) % n][0] - p[i][0], p[(i + 1) % n][1] - p[i][1]);
    const step = per / 400 || 1, S = [];
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n], m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let j = 0; j < m; j++) S.push([a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m]);
    }
    let cx = 0, cy = 0; for (const q of S) { cx += q[0]; cy += q[1]; } cx /= S.length; cy /= S.length;
    let sxx = 0, syy = 0, sxy = 0; for (const q of S) { const dx = q[0] - cx, dy = q[1] - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), c = Math.cos(th), s = Math.sin(th);
    return p.map(q => { const dx = q[0] - cx, dy = q[1] - cy; return [cx + dx * c + dy * s, cy - dx * s + dy * c]; });
  }
  function segPt(px, py, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy;
    let t = L > 0 ? ((px - a[0]) * vx + (py - a[1]) * vy) / L : 0; t = Math.max(0, Math.min(1, t));
    const x = a[0] + vx * t, y = a[1] + vy * t; return { d: Math.hypot(px - x, py - y), x, y };
  }
  function nearestVertex(p, x, y, tol) {
    let bi = -1, bd = tol;
    p.forEach((q, i) => { const d = Math.hypot(q[0] - x, q[1] - y); if (d <= bd) { bd = d; bi = i; } });
    return bi;
  }
  // insert a point on the nearest segment (closed ring) when within tol; null if none
  // at: true puts the new point where you clicked (Add points), else on the line
  function insertPoint(p, x, y, tol, at) {
    let bi = -1, bd = tol, bp = null;
    for (let i = 0; i < p.length; i++) { const s = segPt(x, y, p[i], p[(i + 1) % p.length]); if (s.d <= bd) { bd = s.d; bi = i; bp = s; } }
    if (bi < 0) return null;
    const out = p.map(q => q.slice()); out.splice(bi + 1, 0, at ? [r2(x), r2(y)] : [r2(bp.x), r2(bp.y)]); return out;
  }
  function deletePoint(p, i) { return p.length <= 3 || i < 0 || i >= p.length ? null : p.filter((_, j) => j !== i); }
  // mask from RGBA: real transparency -> alpha, else darkness (XOR invert)
  function makeMask(d, w, h, thr, invert) {
    const n = w * h, m = new Uint8Array(n); let transp = false;
    for (let i = 0; i < n; i++) if (d[i * 4 + 3] < 200) { transp = true; break; }
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      m[i] = transp ? (d[j + 3] >= 128 ? 1 : 0) : ((0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2] < thr) !== !!invert ? 1 : 0);
    }
    return m;
  }
  // largest 4-connected component (iterative BFS), then its outer boundary by Moore-neighbour tracing; pixel coords, or null
  function traceMask(mask, w, h) {
    const N = w * h, lab = new Int32Array(N), q = new Int32Array(N);
    let best = 0, bestN = 0, nl = 0;
    for (let s = 0; s < N; s++) {
      if (!mask[s] || lab[s]) continue;
      nl++; let qh = 0, qt = 0; q[qt++] = s; lab[s] = nl;
      while (qh < qt) {
        const c = q[qh++], x = c % w;
        if (x > 0 && mask[c - 1] && !lab[c - 1]) { lab[c - 1] = nl; q[qt++] = c - 1; }
        if (x < w - 1 && mask[c + 1] && !lab[c + 1]) { lab[c + 1] = nl; q[qt++] = c + 1; }
        if (c >= w && mask[c - w] && !lab[c - w]) { lab[c - w] = nl; q[qt++] = c - w; }
        if (c < N - w && mask[c + w] && !lab[c + w]) { lab[c + w] = nl; q[qt++] = c + w; }
      }
      if (qt > bestN) { bestN = qt; best = nl; }
    }
    if (!best || bestN < 10) return null;
    const fg = (x, y) => x >= 0 && y >= 0 && x < w && y < h && lab[y * w + x] === best;
    let s0 = 0; while (lab[s0] !== best) s0++;
    const sx = s0 % w, sy = (s0 - sx) / w;
    const D = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];   // clockwise on screen, starting west
    let cx = sx, cy = sy, bd = 0; const out = [[cx, cy]];
    for (let it = 0, cap = N * 4; it < cap; it++) {
      let f = -1;
      for (let k = 1; k <= 8; k++) { const d = (bd + k) % 8; if (fg(cx + D[d][0], cy + D[d][1])) { f = d; break; } }
      if (f < 0) break;                                              // single pixel
      const pd = (f + 7) % 8, bx = cx + D[pd][0], by = cy + D[pd][1];
      cx += D[f][0]; cy += D[f][1];
      if (cx === sx && cy === sy) break;
      const ex = bx - cx, ey = by - cy; bd = D.findIndex(e => e[0] === ex && e[1] === ey);
      out.push([cx, cy]);
    }
    return out;
  }
  // y of the middle of the outline's vertical span at x (holes sit there)
  function midYAt(ring, x) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) { const y = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    }
    if (lo > hi) { const b = bbox(ring); return (b.y0 + b.y1) / 2; }
    return (lo + hi) / 2;
  }

  // ---------- browser UI
  let api = null, ui = null, lastO = null;
  let mode = "draw", view = null, stroke = null, drag = null, lastTap = null, pan = null, manual = false, big = false, wrapEl = null, helpEl = null;
  // img: { el, x, y, w } = the prepared photo (a canvas: rotated and cropped) in mm (top-left, width; height from aspect)
  let img = null, showImg = true, fitImg = false, traced = false, split = null;   // fitImg: frame the image until it is traced; split: dragging the join line
  const undo = [], redo = [];
  let cv, ctx, st, undoBtn, redoBtn = null, modeBtns, ctl, wIn, showIn, smIn, modeSel, warnEl, closeBtn, dopts, sopts, phBox;
  // Select tool: selected point indices (valid while the points string equals selKey), spare shapes kept beside the outline (mm,
  // same frame as the outline; they move with it like the image), the chosen spare, the rubber-band box; cleared: outline wiped on purpose
  let sel = new Set(), selKey = null, spares = [], selSpare = -1, box = null, cleared = false, editing = false;
  const sliders = {};
  function syncSliders() { for (const k in sliders) { sliders[k].value = T[k]; if (sliders[k]._o) sliders[k]._o.textContent = T[k]; } if (modeSel) modeSel.value = T.mode; }

  const CSS = `#ck-ol-wrap{display:flex;flex-direction:column;gap:8px;margin:0 0 12px;font:12px system-ui;color:#cfd8de}
#ck-ol-wrap [hidden]{display:none!important}
#ck-ol-wrap button{background:#1a2127;color:#cfd8de;border:1px solid #2f3d46;border-radius:4px;padding:4px 9px;font:inherit;cursor:pointer}
#ck-ol-wrap button:hover:not(:disabled){border-color:#ff5a5a}
#ck-ol-wrap button.on{background:#ff5a5a;border-color:#ff5a5a;color:#0d1114}
#ck-ol-wrap button.pri{background:#ff5a5a;border-color:#ff5a5a;color:#0d1114;font-weight:600;padding:5px 14px}
#ck-ol-wrap button.pri:hover:not(:disabled){background:#ff8080;border-color:#ff8080}
#ck-ol-wrap button:disabled{opacity:.4;cursor:default}
#ck-ol-wrap canvas{width:100%;display:block;touch-action:none;background:#0d1114;border:1px solid #243038;border-radius:4px}
#ck-ol-wrap .help,#ck-ol-wrap .st{color:#8a98a2}
#ck-ol-wrap label{display:inline-flex;gap:5px;align-items:center}
#ck-ol-wrap input[type=number]{width:70px}
#ck-ol-wrap.big{position:fixed;inset:10px;z-index:60;background:#12171b;border:1px solid #33424c;border-radius:10px;padding:12px;margin:0;box-shadow:0 0 0 100vmax #000a}
#ck-ol-wrap .help b{color:#cfd8de;font-weight:600}
#ck-ol-wrap select{background:#0d1114;color:#cfd8de;border:1px solid #2f3d46;border-radius:4px;padding:3px 6px;font:inherit;max-width:100%}
#ck-ol-wrap .warn{color:#ffb454}#ck-ol-wrap .warn:empty{display:none}
#ck-ol-wrap .tb{display:flex;flex-wrap:wrap;gap:6px 18px;align-items:flex-end}
#ck-ol-wrap .grp{display:flex;flex-direction:column;gap:3px}
#ck-ol-wrap .cap{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6f7d87}
#ck-ol-wrap .btns{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
#ck-ol-wrap .seg{display:inline-flex}
#ck-ol-wrap .seg button{border-radius:0;margin-left:-1px;position:relative}
#ck-ol-wrap .seg button:first-child{border-radius:4px 0 0 4px;margin-left:0}
#ck-ol-wrap .seg button:last-child{border-radius:0 4px 4px 0}
#ck-ol-wrap .seg button.on{z-index:1}
#ck-ol-wrap .seg.tools button{padding:5px 14px;font-weight:600}
#ck-ol-wrap .dopts{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:6px 8px;border:1px solid #243038;border-radius:6px;background:#10161a}
#ck-ol-wrap .dopts .lbl{color:#8a98a2}
#ck-ol-wrap .stage{display:flex;flex-direction:column;gap:6px;min-width:0}
#ck-ol-wrap .body{display:flex;flex-direction:column;gap:8px}
#ck-ol-wrap.big .body{flex:1 1 auto;min-height:0;flex-direction:row}
#ck-ol-wrap.big .stage{flex:1 1 auto}
#ck-ol-wrap.big canvas{flex:1 1 auto;min-height:200px;height:0}
#ck-ol-wrap.big .side{flex:0 0 340px;overflow:auto}
@media(max-width:760px){#ck-ol-wrap.big .body{flex-direction:column}#ck-ol-wrap.big .side{flex:0 1 40%}}
#ck-ol-wrap details.imgctl{border:1px solid #243038;border-radius:6px;background:#10161a;padding:0 10px 8px}
#ck-ol-wrap details.imgctl>summary{padding:7px 0;font-weight:600;cursor:pointer;color:#e3eaee}
#ck-ol-wrap details.sub{border-top:1px solid #243038;padding-top:6px;margin-top:8px}
#ck-ol-wrap details.sub>summary{cursor:pointer;color:#8a98a2;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
#ck-ol-wrap .sec{display:flex;flex-direction:column;gap:6px;margin-top:8px}
#ck-ol-wrap .sliders{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px 16px;margin-top:8px}
#ck-ol-wrap .sl{display:flex;flex-direction:column;align-items:stretch;gap:2px}
#ck-ol-wrap .sl .t{display:flex;justify-content:space-between;gap:6px}
#ck-ol-wrap .sl output{color:#8a98a2;font-variant-numeric:tabular-nums}
#ck-ol-wrap input[type=range]{width:100%;accent-color:#ff5a5a;margin:0}
#ck-ol-wrap .row{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}
#ck-ol-wrap .st.warn{color:#ffb454}
#ck-photo{border:1px solid #5a4a24;border-radius:6px;background:#15140f;padding:0 10px 8px;margin-bottom:8px}
#ck-photo>summary{padding:7px 0;font-weight:600;cursor:pointer;color:#ffd166}
#ck-photo .q{color:#e3eaee;font-weight:600}
#ck-photo .sl{max-width:420px}`;

  const cur = () => drag && drag.pts ? drag.pts : CK.parsePts(api.get());
  function partsFor(raw) { try { return CK.outlineParts({ ...(lastO || api.read()), olPts: CK.ptsToStr(raw), ...(split ? { olSplit: split.v } : {}) }); } catch (e) { return null; } }
  const splitX = () => !lastO || !["handle", "tip"].includes(lastO.olMix) ? null : split ? split.v : +lastO.olSplit;
  const copySp = S => S.map(s => s.map(q => q.slice()));
  // a snapshot is everything Undo / Redo bring back: the points, every form field, the image placement, spare shapes and the trace
  // state (so a restored drawing is not traced over by the next slider move)
  const snapshot = () => ({ s: api.get(), len: api.getLen(), img: img ? { x: img.x, y: img.y, w: img.w } : null, sp: copySp(spares), cl: cleared, vals: api.read(),
    tr: traced, he: handEdited, lc: lastComp, pm: paint });
  const imgH = () => img ? img.w * img.el.height / img.el.width : 0;
  const say = (t, warn) => { st.textContent = t || ""; st.classList.toggle("warn", !!warn); };

  function syncUndo() { undoBtn.disabled = !undo.length; if (redoBtn) redoBtn.disabled = !redo.length; }
  function syncImgUI() { ctl.hidden = !img; if (img) { wIn.value = r2(img.w); syncSliders(); } }

  // set pts as the new outline: round, shift to 0,0 (image follows), width -> olLen, commit
  let inTrace = false, handEdited = false;
  // newSel: the selection to keep (same point order); otherwise the selection is dropped
  function edit(newPts, snap, newSel) {
    if (!inTrace) handEdited = true;
    let p = newPts.map(q => [r2(q[0]), r2(q[1])]);
    const n = normalise(p); p = n.pts.map(q => [r2(q[0]), r2(q[1])]);
    const w = r2(bbox(p).w);
    if (!(w > 0.01) || p.length < 3) return false;
    record(snap || snapshot());
    if (img) { img.x += n.dx; img.y += n.dy; }
    spares = spares.map(s => s.map(q => [q[0] + n.dx, q[1] + n.dy]));
    cleared = false; sel = newSel || new Set(); if (!newSel) selSpare = -1;
    editing = true; try { api.setLenQuiet(w); api.commit(CK.ptsToStr(p)); } finally { editing = false; }
    selKey = api.get(); syncSelBar();
    // the length field has limits: say so when the outline was resized to fit them
    lenNote = Math.abs(api.getLen() - w) > 0.01 ? ` Your outline is ${w} mm long; the Length field allows ${api.lenRange ? api.lenRange().join("–") : "20–250"} mm, so it is shown at ${api.getLen()} mm.` : "";
    if (lenNote && !inTrace) say(lenNote.trim(), true);
    return true;
  }
  let lenNote = "";
  // every change goes through here: a new change clears Redo
  function record(s) { undo.push(s); if (undo.length > 50) undo.shift(); redo.length = 0; syncUndo(); }
  function pushUndo() { record(snapshot()); }
  // wipe the outline (the image stays); Undo brings it back
  function clearOutline() {
    if (open) { open = null; syncOpen(); }
    if (cleared && !spares.length) return;
    pushUndo(); cleared = true; spares = []; sel = new Set(); selSpare = -1; traced = false; syncSelBar();
    editing = true; try { api.commit(""); } finally { editing = false; }
    selKey = api.get(); setMode("draw");
    say("Outline cleared. Draw a new one, or trace the image. Undo brings the old one back.");
  }
  function fromGeom(tool) {
    const g = api.geom(tool); let ring = null, ba = -1;
    for (const r of g.rings) { const b = bbox(r), a = b.w * b.h; if (a > ba) { ba = a; ring = r; } }
    return ring ? CK.rdpClosed(ring, 0.03) : null;
  }
  function restore(u) {
    restoring = true;
    try {
      if (img && u.img) { img.x = u.img.x; img.y = u.img.y; img.w = u.img.w; }
      spares = u.sp || []; cleared = !!u.cl; sel = new Set(); selSpare = -1; syncSelBar();
      traced = !!u.tr; handEdited = !!u.he; lastComp = u.lc || null; if (u.pm !== undefined) { paint = u.pm; paintView(); }
      clearTimeout(pvTimer);
      if (u.vals) for (const k in u.vals) if (k !== "olPts" && k !== "tool" && k !== "olLen") api.setField(k, u.vals[k], false);
      syncImgUI(); api.setLenQuiet(u.len); api.commit(u.s);
    } finally { restoring = false; }
    baseline = snapshot(); syncUndo();
  }
  function doUndo() { const u = undo.pop(); if (!u) return; redo.push(snapshot()); restore(u); say("Undone. Redo (Ctrl+Y) brings it back."); }
  function doRedo() { const u = redo.pop(); if (!u) return; undo.push(snapshot()); restore(u); say("Redone."); }
  // the form's fields (handle length, tip, ...) changed outside the editor: the state before is an Undo step. Typing in one field
  // within a second is one step.
  let baseline = null, restoring = false, own = false, lastAuto = null;
  const ownSet = (k, v) => { own = true; try { api.setField(k, v, true); } finally { own = false; } };
  function autoCheckpoint(o) {
    if (!baseline || restoring || editing || own || drag || stroke || split) return;
    const b = baseline.vals, keys = Object.keys(o).filter(k => k !== "tool" && String(o[k]) !== String(b[k]));
    if (api.get() !== baseline.s && !keys.length) keys.push("olPts");
    if (!keys.length) return;
    const now = Date.now(), key = keys.join(",");
    if (!(lastAuto && lastAuto.key === key && now - lastAuto.t < 1200)) record(baseline);
    lastAuto = { key, t: now };
  }
  function checkpoint() { if (baseline) autoCheckpoint(api.read()); baseline = snapshot(); lastAuto = null; }

  function refit(force) {
    if (manual && !force) return;
    const p = cur(), parts = p.length > 2 ? partsFor(p) : null, q = (parts && parts.ring.length > 2 ? p.concat(parts.ring) : p).concat(...spares);
    let b = q.length ? bbox(q) : { x0: 0, y0: 0, x1: 60, y1: 10 };
    let x0 = b.x0, y0 = b.y0, x1 = b.x1, y1 = b.y1;
    const pad = Math.max(3, 0.06 * (x1 - x0)); x0 -= pad - 3; x1 += pad - 3; y0 -= pad - 3; y1 += pad - 3;
    if (img && showImg && photoMode()) { const f = fullRect(); x0 = f.x; y0 = f.y; x1 = f.x + f.w; y1 = f.y + f.h; }   // preparing the photo: fit the photo
    else if (img && showImg && fitImg) { const f = { x: img.x, y: img.y, w: img.w, h: imgH() };
      x0 = Math.min(x0, f.x); y0 = Math.min(y0, f.y); x1 = Math.max(x1, f.x + f.w); y1 = Math.max(y1, f.y + f.h); }
    x0 -= 3; y0 -= 3; x1 += 3; y1 += 3;
    const s = Math.min(W / Math.max(1e-6, x1 - x0), H / Math.max(1e-6, y1 - y0));
    view = { s, ox: (W - (x1 - x0) * s) / 2 - x0 * s, oy: (H - (y1 - y0) * s) / 2 - y0 * s };
  }

  function draw() {
    if (!view) refit();
    const x = ctx, { s, ox, oy } = view, X = v => ox + v * s, Y = v => oy + v * s;
    x.fillStyle = "#0d1114"; x.fillRect(0, 0, W, H);
    // grid: 1 mm (only when >= 4 px/mm), 5 mm and 10 mm brighter
    x.lineWidth = 1;
    const gx0 = Math.ceil(-ox / s), gx1 = Math.floor((W - ox) / s), gy0 = Math.ceil(-oy / s), gy1 = Math.floor((H - oy) / s);
    const line = (i, isX) => {
      if (i % 5 !== 0 && s < 4) return;
      x.strokeStyle = i % 10 === 0 ? "#4a5d69" : i % 5 === 0 ? "#34444e" : "#243038";
      x.beginPath();
      if (isX) { const px = Math.round(X(i)) + 0.5; x.moveTo(px, 0); x.lineTo(px, H); } else { const py = Math.round(Y(i)) + 0.5; x.moveTo(0, py); x.lineTo(W, py); }
      x.stroke();
    };
    for (let i = gx0; i <= gx1 && i - gx0 < 4000; i++) line(i, true);
    for (let i = gy0; i <= gy1 && i - gy0 < 4000; i++) line(i, false);
    drawImageLayer(x, X, Y, s);
    const raw = cur(), parts = raw.length > 2 ? partsFor(raw) : null;
    if (!editing && selKey !== api.get()) { sel = new Set(); selKey = api.get(); }
    const ring = parts && parts.ring.length > 2 ? parts.ring : raw;
    const path = pts => { x.beginPath(); pts.forEach((q, i) => i ? x.lineTo(X(q[0]), Y(q[1])) : x.moveTo(X(q[0]), Y(q[1]))); x.closePath(); };
    spares.forEach((sp, i) => { path(sp); x.globalAlpha = i === selSpare ? 0.45 : 0.2; x.fillStyle = i === selSpare ? "#8fd3ff" : "#9aa7b0"; x.fill(); x.globalAlpha = 1;
      x.setLineDash([4, 3]); x.strokeStyle = i === selSpare ? "#8fd3ff" : "#9aa7b0"; x.lineWidth = i === selSpare ? 2 : 1; x.stroke(); x.setLineDash([]); });
    if (raw.length < 3 && !open && !stroke) { x.fillStyle = "#8a98a2"; x.font = "14px system-ui"; x.textAlign = "center";
      x.fillText("Empty outline: draw one, or trace the image", W / 2, 24); x.textAlign = "start"; }
    if (ring.length > 2) { path(ring); x.globalAlpha = olOp; x.fillStyle = "#7a2a2e"; x.fill(); x.globalAlpha = 1; x.strokeStyle = "#ff6b6b"; x.lineWidth = 2; x.stroke(); }
    for (const c of parts ? parts.circles : []) {
      x.beginPath(); x.arc(X(c.x), Y(c.y), c.r * s, 0, 7);
      x.fillStyle = "#0d1114"; x.fill(); x.strokeStyle = "#ff6b6b"; x.lineWidth = 1.5; x.stroke();
    }
    const sx = splitX();   // join line between your outline and the part from Pick settings
    if (sx !== null) { x.setLineDash([6, 4]); x.strokeStyle = "#8fd3ff"; x.lineWidth = 2; x.beginPath(); x.moveTo(X(sx), 0); x.lineTo(X(sx), H); x.stroke(); x.setLineDash([]);
      x.fillStyle = "#8fd3ff"; x.font = "11px system-ui"; x.fillText(lastO.olMix === "tip" ? "◀ handle from Pick settings | your working end" : "your handle | shaft and tip from Pick settings ▶", Math.min(W - 280, X(sx) + 6), 14); }
    if (raw.length > 1) { path(raw); x.setLineDash([5, 4]); x.strokeStyle = "rgba(207,216,222,.7)"; x.lineWidth = 1; x.stroke(); x.setLineDash([]); }
    if (mode !== "draw" && !photoMode()) raw.forEach((q, i) => { const hi = (drag && drag.i === i && !drag.sel) || sel.has(i);
      x.beginPath(); x.arc(X(q[0]), Y(q[1]), hi ? 5 : 3.5, 0, 7); x.fillStyle = hi ? "#fff" : "#ff5a5a"; x.fill();
      if (sel.has(i)) { x.strokeStyle = "#ff5a5a"; x.lineWidth = 1.5; x.stroke(); } });
    if (sel.size > 1 && raw.length > 2) {   // selected sections: the lines between two selected points
      x.strokeStyle = "#fff"; x.lineWidth = 3;
      raw.forEach((q, i) => { const j = (i + 1) % raw.length; if (sel.has(i) && sel.has(j)) { x.beginPath(); x.moveTo(X(q[0]), Y(q[1])); x.lineTo(X(raw[j][0]), Y(raw[j][1])); x.stroke(); } });
    }
    if (box) { x.setLineDash([4, 3]); x.strokeStyle = "#8fd3ff"; x.lineWidth = 1.5;
      x.strokeRect(X(Math.min(box.a[0], box.b[0])), Y(Math.min(box.a[1], box.b[1])), Math.abs(box.b[0] - box.a[0]) * s, Math.abs(box.b[1] - box.a[1]) * s); x.setLineDash([]); }
    drawPhotoTools(x, X, Y, s);
    if (open && open.length > 1) {   // unfinished line: yellow, with its two ends marked
      x.beginPath(); open.forEach((q, i) => i ? x.lineTo(X(q[0]), Y(q[1])) : x.moveTo(X(q[0]), Y(q[1])));
      x.strokeStyle = "#ffd166"; x.lineWidth = 2; x.stroke();
      for (const q of [open[0], open[open.length - 1]]) { x.beginPath(); x.arc(X(q[0]), Y(q[1]), 6, 0, 7); x.fillStyle = "#ffd166"; x.fill(); }
    }
    if (stroke && stroke.pts.length > 1) {
      x.beginPath(); stroke.pts.forEach((q, i) => i ? x.lineTo(X(q[0]), Y(q[1])) : x.moveTo(X(q[0]), Y(q[1])));
      x.strokeStyle = "#ff5a5a"; x.lineWidth = 2; x.stroke();
    }
    const b = raw.length ? bbox(raw) : { w: 0, h: 0 };
    x.fillStyle = "#6f7d87"; x.font = "11px system-ui"; x.fillText(`1 mm grid · ${r2(b.w)} × ${r2(b.h)} mm`, 6, H - 7);
  }

  // ---------- pointer input
  const scale = () => W / cv.getBoundingClientRect().width;          // canvas px per screen px
  function toMm(e) {
    const r = cv.getBoundingClientRect();
    return [((e.clientX - r.left) * W / r.width - view.ox) / view.s, ((e.clientY - r.top) * H / r.height - view.oy) / view.s];
  }
  const tolMm = px => px * scale() / view.s;

  function onDown(e) {
    if (drag || stroke || pan || box || phDrag) return;
    if (e.pointerType === "mouse" && e.button === 1 || e.shiftKey) {   // pan the view
      e.preventDefault(); if (!view) refit(); try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy }; manual = true; return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault(); if (!view) refit();
    if (photoMode()) { photoDown(e, toMm(e)); return; }
    if (mode === "seed" || mode === "bgpick") { imageDown(e, toMm(e)); return; }
    if (mode === "padd" || mode === "pdel") { if (!img || !src) { say("Import an image first."); return; }
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      paintStroke = { id: e.pointerId, v: mode === "padd" ? 1 : -1, copied: false, snap: snapshot() }; paintAt(toMm(e), paintStroke.v); paintView(); draw(); return; }
    if (mode === "sel") { selDown(e, toMm(e)); return; }
    if (mode === "add" || mode === "del") {
      const m0 = toMm(e), p = CK.parsePts(api.get());
      if (mode === "add") { const q = insertPoint(p, m0[0], m0[1], tolMm(30), true); if (q) edit(q); else say("Click on or near the outline to add a point there."); }
      else { const i = nearestVertex(p, m0[0], m0[1], tolMm(12)); const q = i >= 0 ? deletePoint(p, i) : null; if (q) edit(q); else say(i >= 0 ? "An outline needs at least 3 points." : "Click a point to delete it."); }
      return;
    }
    try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const m = toMm(e), sx = splitX();
    if (sx !== null && Math.abs(m[0] - sx) <= tolMm(8)) { split = { id: e.pointerId, v: sx }; draw(); return; }
    if (mode === "draw") { stroke = { id: e.pointerId, pts: [m] }; draw(); return; }
    const p = CK.parsePts(api.get()), i = nearestVertex(p, m[0], m[1], tolMm(10));
    drag = { id: e.pointerId, i, pts: p, snap: snapshot(), moved: false, sx: e.clientX, sy: e.clientY, off: i >= 0 ? [p[i][0] - m[0], p[i][1] - m[1]] : [0, 0] };
    draw();
  }
  function onMove(e) {
    if (pan && e.pointerId === pan.id) { const k = scale(); view.ox = pan.ox + (e.clientX - pan.x) * k; view.oy = pan.oy + (e.clientY - pan.y) * k; draw(); return; }
    if (!split && !drag && !stroke && view) { const sx = splitX(); cv.style.cursor = sx !== null && Math.abs(toMm(e)[0] - sx) <= tolMm(8) ? "ew-resize" : CURSOR[mode]; }
    if (split && e.pointerId === split.id) { split.v = Math.max(1, Math.round(toMm(e)[0] * 2) / 2); draw(); return; }
    if (photoMove(e)) return;
    if (paintStroke && e.pointerId === paintStroke.id) { paintAt(toMm(e), paintStroke.v); paintView(); draw(); return; }
    if (box && e.pointerId === box.id) { box.b = toMm(e); draw(); return; }
    if (drag && drag.sel && e.pointerId === drag.id) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.moved = true; const m = toMm(e), dx = m[0] - drag.start[0], dy = m[1] - drag.start[1];
      drag.pts = drag.base.map((q, i) => sel.has(i) ? [q[0] + dx, q[1] + dy] : q); draw(); return;
    }
    if (stroke && e.pointerId === stroke.id) {
      const m = toMm(e), l = stroke.pts[stroke.pts.length - 1];
      if (Math.hypot(m[0] - l[0], m[1] - l[1]) >= 0.25) { stroke.pts.push(m); draw(); }
    } else if (drag && e.pointerId === drag.id) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.moved = true;
      if (drag.i >= 0) { const m = toMm(e); drag.pts[drag.i] = [m[0] + drag.off[0], m[1] + drag.off[1]]; draw(); }
    }
  }
  function onUp(e) {
    if (pan && e.pointerId === pan.id) { pan = null; return; }
    if (photoUp(e)) return;
    if (paintStroke && e.pointerId === paintStroke.id) { const s0 = paintStroke.snap; paintStroke = null; refreshPreview(); trace(false, s0);
      if (undo[undo.length - 1] !== s0) record(s0);   // one Undo takes the stroke back, traced or not
      say((traced ? "Traced again with your brush strokes." : "") + " Green = always part of the shape, red = never. Undo takes a stroke back.", false); return; }
    if (box && e.pointerId === box.id) { boxUp(e); return; }
    if (drag && drag.sel && e.pointerId === drag.id) {
      const d = drag; drag = null;
      if (d.moved) edit(d.pts, d.snap, new Set(sel));
      else { const now = Date.now();   // double-click: select the whole shape
        if (lastTap && now - lastTap.t < 400 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 14) { lastTap = null; sel = new Set(d.base.map((_, i) => i)); syncSelBar(); }
        else lastTap = { t: now, x: e.clientX, y: e.clientY }; }
      refit(); draw(); return;
    }
    if (split && e.pointerId === split.id) { const v = split.v; split = null; if (v !== +api.read().olSplit) { pushUndo(); ownSet("olSplit", v); } else draw(); return; }
    if (stroke && e.pointerId === stroke.id) {
      const sp = stroke.pts; stroke = null;
      const b = bbox(sp);
      if (sp.length > 1 && Math.max(b.w, b.h) > 0.5) addStroke(sp);
      refit(); draw();
    } else if (drag && e.pointerId === drag.id) {
      const d = drag; drag = null;
      if (d.moved && d.i >= 0) edit(d.pts, d.snap);
      else if (!d.moved) {
        const now = Date.now();
        if (lastTap && now - lastTap.t < 400 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 14) { lastTap = null; dbl(toMm(e)); }
        else lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
      refit(); draw();
    }
  }
  function onCancel(e) {
    if ((stroke && e.pointerId === stroke.id) || (drag && e.pointerId === drag.id) || (split && e.pointerId === split.id) || (box && e.pointerId === box.id) ||
      (phDrag && e.pointerId === phDrag.id)) { stroke = null; drag = null; split = null; box = null; phDrag = null; refit(); draw(); }
  }
  const CURSOR = { padd: "crosshair", pdel: "crosshair", draw: "crosshair", move: "grab", add: "copy", del: "not-allowed", sel: "default", seed: "cell", bgpick: "cell", crop: "crosshair", level: "crosshair", measure: "crosshair" };

  // ---------- Select tool: click a point (Ctrl/Cmd adds), click a line for its two ends, drag a box, double-click for the whole shape;
  // drag a selected point to move the selection; click a grey spare shape to choose it
  function inPoly(m, P) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j];
      if ((a[1] > m[1]) !== (b[1] > m[1]) && m[0] < (b[0] - a[0]) * (m[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
    return c;
  }
  function selDown(e, m) {
    const p = CK.parsePts(api.get()), add = e.ctrlKey || e.metaKey;
    if (selKey !== api.get()) { sel = new Set(); selKey = api.get(); }
    try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    let hit = null; const i = nearestVertex(p, m[0], m[1], tolMm(10));
    if (i >= 0) hit = [i];
    else if (p.length > 2) { let bd = tolMm(7), bi = -1; for (let k = 0; k < p.length; k++) { const s = segPt(m[0], m[1], p[k], p[(k + 1) % p.length]); if (s.d <= bd) { bd = s.d; bi = k; } }
      if (bi >= 0) hit = [bi, (bi + 1) % p.length]; }
    if (hit) {
      selSpare = -1;
      if (add) { for (const h of hit) sel.has(h) && hit.length === 1 ? sel.delete(h) : sel.add(h); syncSelBar(); draw(); return; }
      if (!hit.every(h => sel.has(h))) sel = new Set(hit);
      drag = { id: e.pointerId, sel: true, i: -1, base: p, pts: p, start: m, snap: snapshot(), moved: false, sx: e.clientX, sy: e.clientY };
      syncSelBar(); draw(); return;
    }
    for (let k = spares.length - 1; k >= 0; k--) if (inPoly(m, spares[k]) && !(p.length > 2 && inPoly(m, p))) {
      selSpare = k; sel = new Set(); syncSelBar(); say("Spare shape selected: Use this shape makes it the outline (the current one becomes a spare)."); draw(); return;
    }
    box = { id: e.pointerId, a: m, b: m, add }; draw();
  }
  function boxUp() {
    const b = box; box = null;
    const x0 = Math.min(b.a[0], b.b[0]), x1 = Math.max(b.a[0], b.b[0]), y0 = Math.min(b.a[1], b.b[1]), y1 = Math.max(b.a[1], b.b[1]);
    if (!b.add) sel = new Set();
    if (x1 - x0 > tolMm(3) || y1 - y0 > tolMm(3)) CK.parsePts(api.get()).forEach((q, i) => { if (q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1) sel.add(i); });
    else selSpare = -1;
    selKey = api.get(); syncSelBar(); draw();
  }
  function syncSelBar() {
    if (!sopts) return;
    const n = sel.size; sopts.querySelector(".cnt").textContent = selSpare >= 0 ? "Spare shape selected" : n ? `${n} point${n > 1 ? "s" : ""} selected` : "Nothing selected";
    for (const b of sopts.querySelectorAll("[data-need=pts]")) b.disabled = !n;
    for (const b of sopts.querySelectorAll("[data-need=spare]")) b.disabled = selSpare < 0;
  }
  const selPts = () => { const p = CK.parsePts(api.get()); if (selKey !== api.get()) { sel = new Set(); selKey = api.get(); } return p; };
  function selDelete() {
    const p = selPts(); if (!sel.size) return;
    const q = p.filter((_, i) => !sel.has(i)); if (q.length < 3) { say("An outline needs at least 3 points: select fewer.", true); return; }
    edit(q); say(`Deleted ${p.length - q.length} point(s).`);
  }
  function selSmooth() {
    const p = selPts(); if (!sel.size || p.length < 3) return;
    edit(p.map((a, i) => { if (!sel.has(i)) return a; const b = p[(i - 1 + p.length) % p.length], c = p[(i + 1) % p.length]; return [(b[0] + 2 * a[0] + c[0]) / 4, (b[1] + 2 * a[1] + c[1]) / 4]; }), null, new Set(sel));
  }
  // each run of neighbouring selected points becomes a straight line between its two ends (the points between are removed)
  function selStraighten() {
    const p = selPts(), n = p.length; if (sel.size < 3) { say("Select a section of at least 3 points (drag a box over it) to straighten.", true); return; }
    if (sel.size >= n) { say("Select a section, not the whole outline.", true); return; }
    let s0 = 0; while (sel.has(s0)) s0++;   // start just after an unselected point so runs do not wrap
    const drop = new Set(), ends = new Set();
    for (let k = 1; k <= n; k++) { const i = (s0 + k) % n; if (!sel.has(i)) continue;
      let L = 0; while (L < n && sel.has((i + L) % n)) L++;
      for (let j = 1; j < L - 1; j++) drop.add((i + j) % n); ends.add(i); ends.add((i + L - 1) % n); k += L - 1; }
    if (!drop.size) { say("Already straight: select 3 or more neighbouring points.", true); return; }
    const keep = [], ns = new Set(); p.forEach((q, i) => { if (drop.has(i)) return; if (ends.has(i)) ns.add(keep.length); keep.push(q); });
    if (keep.length < 3) { say("That would leave fewer than 3 points.", true); return; }
    edit(keep, null, ns); say(`Straightened: ${drop.size} point(s) removed.`);
  }
  function useSpare() {
    if (selSpare < 0) return;
    const snap = snapshot(), p = CK.parsePts(api.get()), s = spares[selSpare];
    spares = spares.filter((_, k) => k !== selSpare); if (p.length >= 3) spares.push(p);
    if (!edit(s, snap)) { spares = snap.sp; return; } selSpare = -1; syncSelBar(); say("That shape is now the outline; the old one is kept as a spare.");
  }
  function mergeSpare() {
    if (selSpare < 0) return;
    const snap = snapshot(), p = CK.parsePts(api.get()), s = spares[selSpare];
    const u = p.length >= 3 ? union([p, s]) : { pts: s };
    if (!u) { say("Could not combine the shapes.", true); return; }
    spares = spares.filter((_, k) => k !== selSpare);
    if (!edit(u.pts, snap)) { spares = snap.sp; return; }
    say(u.dropped ? "The shapes don't touch: only the bigger piece is kept as the outline." : "Merged into the outline.");
  }
  function deleteSpare() { if (selSpare < 0) return; pushUndo(); spares = spares.filter((_, k) => k !== selSpare); selSpare = -1; syncSelBar(); draw(); }
  // wheel: zoom about the pointer (the view then stays put until Fit view)
  function onWheel(e) {
    e.preventDefault(); if (!view) refit();
    const r = cv.getBoundingClientRect(), px = (e.clientX - r.left) * W / r.width, py = (e.clientY - r.top) * H / r.height;
    // about 10 % per wheel notch (a notch is 100 px, or 3 lines); a trackpad's small deltas zoom in proportion
    const d = Math.max(-1, Math.min(1, e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 300 : 1) / 100));
    const f = Math.pow(1.1, -d), mx = (px - view.ox) / view.s, my = (py - view.oy) / view.s;
    view.s = Math.min(400, Math.max(0.5, view.s * f)); view.ox = px - mx * view.s; view.oy = py - my * view.s; manual = true; draw();
  }
  // large view: the editor fills the window; Esc or the button closes it
  function sizeCanvas() {
    if (big) { const d = Math.min(2, window.devicePixelRatio || 1); W = Math.max(300, Math.round(cv.clientWidth * d)); H = Math.max(200, Math.round(cv.clientHeight * d)); }
    else { W = 1000; H = 300;   // preparing a photo: the canvas takes the photo's shape (up to 3:2 tall) so the photo fills it
      if (img && photoMode()) { const f = fullRect(); H = Math.round(Math.max(300, Math.min(660, 1000 * f.h / Math.max(1e-6, f.w) + 40))); } }
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    refit(true); draw();
  }
  function setBig(on) {
    big = on; wrapEl.classList.toggle("big", on);
    // the page column is its own stacking layer under the sticky header: lift the editor to <body> while large
    if (on) { homeEl = wrapEl.parentNode; document.body.appendChild(wrapEl); } else if (homeEl) homeEl.appendChild(wrapEl); bigBtn.textContent = on ? "Close large view (Esc)" : "Large view";
    document.body.style.overflow = on ? "hidden" : ""; requestAnimationFrame(sizeCanvas);
  }
  let bigBtn = null, homeEl = null;
  // double-click / double-tap in Move mode: delete a point, or add one on a line
  function dbl(m) {
    const p = CK.parsePts(api.get()), i = nearestVertex(p, m[0], m[1], tolMm(10));
    if (i >= 0) { const q = deletePoint(p, i); if (q) edit(q); return; }   // (also: Add points / Delete points modes)
    const q = insertPoint(p, m[0], m[1], tolMm(8)); if (q) edit(q);
  }

  // ---------- image: cached at <= 900 px; trace settings (site/trace-image.js) with a live black-and-white / mask view
  let src = null, pv = null, pvKind = "", pvTimer = 0, traceUndo = -1, lastComp = null;
  // paint: Int8Array over the trace pixels, +1 = always part of the shape, -1 = never (the brushes); copied on write so Undo keeps old ones
  let paint = null, paintCv = null, brushR = 3, paintStroke = null, tuned = false;   // lastComp: the traced part's pixels (re-traces stay on it)
  const T = { mode: "bg", threshold: 40, contrast: 0, brightness: 0, blur: 2, clean: 1, crop: null, bg: null, seed: null };
  let imgView = "photo", imgOp = 0.6, olOp = 0.35, live = true;
  const TR = () => window.CKTrace;
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  // ---------- photo preparation: crop, rotate, straighten, scale. The photo is kept as `base` (<= 2000 px); `rotC` is base rotated by
  // ph.rot (degrees, clockwise), the prepared image (img.el) is ph.crop of rotC (rotC px, null = all). ph.scale: mm per photo px (set by
  // measuring), else the trace is sized by the length field. The image's mm position follows every change so the photo stays put.
  let userSet = false;
  let base = null, rotC = null, bgFill = null, phDrag = null, phLine = null, mixing = false;
  let phMix = null, phAng = null, phMm = null, phInfo = null, phUndoBtn = null, phFine = 0;
  function syncPhotoUI(force) {
    if (!phBox) return;
    phBox.hidden = !img; if (!img) return;
    phFine = Math.round((ph.rot - Math.round(ph.rot / 90) * 90) * 10) / 10;
    if (force || document.activeElement !== phAng) { phAng.value = phFine; phAng._o.textContent = phFine; }
    phUndoBtn.disabled = !phUndo.length;
    phInfo.textContent = ph.scale ? `Scale: ${r2(1 / ph.scale)} px per mm. Traces come out true size.` : phLine ? `Line: ${Math.round(phLine.px)} px. Type its length and press Set scale.` :
      "No scale: the trace takes the length in the Length field.";
  }
  let ph = { rot: 0, crop: null, scale: null, flip: false }; const phUndo = [];
  const photoMode = () => !!img && (mode === "crop" || mode === "level" || mode === "measure");
  const FMT = "JPG, PNG, WebP, GIF, BMP or AVIF";
  function loadImage(file) {
    const ext = (/\.([a-z0-9]+)$/i.exec(file.name || "") || [, ""])[1].toLowerCase();
    const bad = why => say(`Can't open "${file.name}"${why}. Save or export it as ${FMT} and import that.`, true);
    if (file.type && !/^image\//.test(file.type)) { bad(" — it is not an image"); return; }
    const url = URL.createObjectURL(file), el = new Image();
    el.onload = () => { URL.revokeObjectURL(url); if (!el.naturalWidth) { bad(""); return; } setPhoto(el); };
    el.onerror = () => { URL.revokeObjectURL(url);
      bad(/^(jxl|heic|heif|tif|tiff|psd|raw|cr2|cr3|nef|arw|dng|svgz)$/.test(ext) ? `: this browser can't read .${ext} images` : ": this browser can't read that image format"); };
    el.src = url;
  }
  function setPhoto(el) {
    const nw = el.naturalWidth, nh = el.naturalHeight, sc = Math.min(1, 2000 / Math.max(nw, nh));
    base = canvas(nw * sc, nh * sc); base.getContext("2d").drawImage(el, 0, 0, base.width, base.height);
    // fill for the corners a rotation uncovers: transparent if the photo has transparency, else the median border colour
    const t = canvas(Math.min(200, base.width), Math.min(200, base.height)), tc = t.getContext("2d", { willReadFrequently: true });
    tc.drawImage(base, 0, 0, t.width, t.height); const d = tc.getImageData(0, 0, t.width, t.height).data;
    let transp = false; for (let i = 3; i < d.length; i += 4) if (d[i] < 200) { transp = true; break; }
    if (transp) bgFill = null;
    else { const R = [], G = [], B = [], push = i => { R.push(d[i * 4]); G.push(d[i * 4 + 1]); B.push(d[i * 4 + 2]); };
      for (let x = 0; x < t.width; x++) { push(x); push((t.height - 1) * t.width + x); } for (let y = 0; y < t.height; y++) { push(y * t.width); push(y * t.width + t.width - 1); }
      const med = a => a.sort((p, q) => p - q)[a.length >> 1]; bgFill = `rgb(${med(R)},${med(G)},${med(B)})`; }
    // a second photo starts a new part: the old outline goes back to the pick settings (one Undo brings it back)
    if (img && (traced || handEdited || cleared)) { const snap = snapshot(), p = fromGeom("pick");
      if (p) { spares = []; open = null; edit(p, snap); handEdited = false;
        const mix = api.read().olMix; if (mix !== "whole") { mixing = true; try { ownSet("olMix", mix); } finally { mixing = false; } } } }   // Tip / Handle only: their usual length
    ph = { rot: 0, crop: null, scale: null, flip: false }; phUndo.length = 0; phLine = null;
    img = { el: null, x: 0, y: 0, w: api.getLen() || 60 }; fitImg = true; traced = false; manual = false;
    buildRot(); buildPrep();
    Object.assign(T, { crop: null, bg: null, seed: null }); showIn.checked = true; showImg = true; tuned = false; userSet = false;
    kind = "auto"; detail = 5; detBase = null; syncDetail();
    if (TR() && TR().otsu) T.threshold = Math.round(TR().otsu(src.data, src.w, src.h, opts()));
    syncImgUI(); syncPhotoUI(true); setMode("crop"); phBox.open = true;
    say("Photo loaded. Choose what's in it, drag the crop handles round the pick, straighten it if needed, then press Trace image."); sizeCanvas();
  }
  const rotDims = () => { const t = ph.rot * Math.PI / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
    return [Math.round(base.width * c + base.height * s), Math.round(base.width * s + base.height * c)]; };
  function buildRot() {
    const [W2, H2] = rotDims(); rotC = canvas(W2, H2); const c = rotC.getContext("2d");
    if (bgFill) { c.fillStyle = bgFill; c.fillRect(0, 0, W2, H2); }
    c.translate(W2 / 2, H2 / 2); c.rotate(ph.rot * Math.PI / 180); if (ph.flip) c.scale(-1, 1); c.drawImage(base, -base.width / 2, -base.height / 2);
  }
  // base px <-> rotC px for the current ph.rot (ph.flip mirrors the photo before it is turned)
  function rotPt(u, v) { const t = ph.rot * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), dx = (u - base.width / 2) * (ph.flip ? -1 : 1), dy = v - base.height / 2;
    return [rotC.width / 2 + dx * c - dy * s, rotC.height / 2 + dx * s + dy * c]; }
  function unrotPt(x, y) { const t = ph.rot * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), dx = x - rotC.width / 2, dy = y - rotC.height / 2;
    return [base.width / 2 + (dx * c + dy * s) * (ph.flip ? -1 : 1), base.height / 2 - dx * s + dy * c]; }
  const cropOf = () => ph.crop || { x0: 0, y0: 0, x1: rotC.width, y1: rotC.height };
  const kpx = () => img.w / img.el.width;   // mm per photo px
  // the whole rotated photo in mm (the prepared image is the crop of it)
  function fullRect() { const c = cropOf(), k = kpx(); return { x: img.x - c.x0 * k, y: img.y - c.y0 * k, w: rotC.width * k, h: rotC.height * k, k }; }
  // the prepared image: crop of rotC; the trace works on a copy of it at <= 900 px
  function buildPrep() {
    const c = cropOf(), w = c.x1 - c.x0, h = c.y1 - c.y0, pc = canvas(w, h);
    pc.getContext("2d").drawImage(rotC, c.x0, c.y0, w, h, 0, 0, w, h); img.el = pc;
    const sc = Math.min(1, 900 / Math.max(w, h)), cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
    const oc = canvas(cw, ch), x = oc.getContext("2d", { willReadFrequently: true }); x.drawImage(pc, 0, 0, cw, ch);
    src = { data: x.getImageData(0, 0, cw, ch).data, w: cw, h: ch };
    pv = canvas(cw, ch); pvKind = ""; lastComp = null; paint = null; paintCv = canvas(cw, ch);
  }
  function pushPhoto() { phUndo.push({ rot: ph.rot, crop: ph.crop && { ...ph.crop }, scale: ph.scale, flip: ph.flip, img: { x: img.x, y: img.y, w: img.w } }); if (phUndo.length > 40) phUndo.shift(); syncPhotoUI(); }
  // the prepared image changed: the click-the-part point no longer applies; suggest a threshold again; live trace runs
  function afterPhoto() {
    T.seed = null; if (!traced) { tuned = false; if (kind === "auto") detBase = null; } if (TR() && TR().otsu) T.threshold = Math.round(TR().otsu(src.data, src.w, src.h, opts()));
    syncSliders(); syncImgUI(); syncPhotoUI(); if (photoMode()) sizeCanvas(); else refit(); changed();
  }
  function setCrop(c) {
    const f = fullRect(), W2 = rotC.width, H2 = rotC.height;
    c = { x0: Math.max(0, Math.round(Math.min(c.x0, c.x1))), y0: Math.max(0, Math.round(Math.min(c.y0, c.y1))), x1: Math.min(W2, Math.round(Math.max(c.x0, c.x1))), y1: Math.min(H2, Math.round(Math.max(c.y0, c.y1))) };
    if (c.x1 - c.x0 < 8 || c.y1 - c.y0 < 8) { say("That crop is too small.", true); draw(); return; }
    pushPhoto(); phLine = null;
    ph.crop = c.x0 <= 0 && c.y0 <= 0 && c.x1 >= W2 && c.y1 >= H2 ? null : c;
    buildPrep(); const n = cropOf(); img.x = f.x + n.x0 * f.k; img.y = f.y + n.y0 * f.k; img.w = (n.x1 - n.x0) * f.k;
    afterPhoto();
  }
  // rotate to `deg`; the middle of the crop stays where it is (in the photo and on screen); a quarter turn swaps the crop's sides
  function setRot(deg, noPush) {
    deg = ((deg % 360) + 540) % 360 - 180; if (Math.abs(deg - ph.rot) < 1e-6) return;
    if (!noPush) pushPhoto();
    phLine = null;
    const k = kpx(), c = cropOf(), had = !!ph.crop, cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
    const cmm = [img.x + (cx - c.x0) * k, img.y + (cy - c.y0) * k], cb = unrotPt(cx, cy);
    const q = Math.abs((((deg - ph.rot) % 180) + 180) % 180 - 90) < 1;
    ph.rot = deg; buildRot();
    const p2 = rotPt(cb[0], cb[1]);
    if (had) { let w = c.x1 - c.x0, h = c.y1 - c.y0; if (q) [w, h] = [h, w];
      const W2 = rotC.width, H2 = rotC.height;
      const n = { x0: Math.max(0, Math.round(p2[0] - w / 2)), y0: Math.max(0, Math.round(p2[1] - h / 2)), x1: Math.min(W2, Math.round(p2[0] + w / 2)), y1: Math.min(H2, Math.round(p2[1] + h / 2)) };
      ph.crop = n.x1 - n.x0 >= 8 && n.y1 - n.y0 >= 8 ? n : null; }
    buildPrep(); const n = cropOf();
    img.w = (n.x1 - n.x0) * k; img.x = cmm[0] - (p2[0] - n.x0) * k; img.y = cmm[1] - (p2[1] - n.y0) * k;
    afterPhoto();
  }
  // mirror the photo left-right as it is shown (a tip-left photo becomes tip-right); the crop is mirrored with it
  function flipPhoto() {
    if (!img) return;
    pushPhoto(); phLine = null; const f = fullRect(), W2 = rotC.width;
    ph.flip = !ph.flip; ph.rot = ph.rot ? -ph.rot : 0; buildRot();
    if (ph.crop) ph.crop = { x0: W2 - ph.crop.x1, x1: W2 - ph.crop.x0, y0: ph.crop.y0, y1: ph.crop.y1 };
    buildPrep(); const n = cropOf(); img.x = f.x + n.x0 * f.k; img.y = f.y + n.y0 * f.k;
    afterPhoto();
  }
  // the photo's true scale: mm per px. The outline (if any) and the image are resized together through the length field
  function setScale(mmPerPx) {
    pushPhoto(); phUndo[phUndo.length - 1].snap = snapshot(); ph.scale = mmPerPx; applyScale(); syncPhotoUI();
  }
  function applyScale() {
    if (!ph.scale || !img) return;
    const f = ph.scale / kpx(); if (Math.abs(f - 1) < 1e-4) return;
    if (traced && !handEdited) { trace(false); return; }
    const p = CK.parsePts(api.get());
    if (p.length >= 3) { const want = r2(api.getLen() * f); mixing = true; try { ownSet("olLen", want); } finally { mixing = false; }
      if (Math.abs(api.getLen() - want) > 0.01) say(`At this scale the outline would be ${want} mm; the Length field allows ${api.lenRange ? api.lenRange().join("–") : "20–250"} mm, so it is shown at ${api.getLen()} mm.`, true); }
    else { img.x *= f; img.y *= f; img.w *= f; }
    syncImgUI(); refit(); draw();
  }
  function undoPhoto() {
    const u = phUndo.pop(); if (!u) return;
    ph = { rot: u.rot, crop: u.crop, scale: u.scale, flip: u.flip }; buildRot(); buildPrep(); Object.assign(img, u.img);
    if (u.snap) { restore(u.snap); refreshPreview(); refit(); draw(); syncPhotoUI(); return; }   // Set scale also resized the outline
    afterPhoto();
  }
  function resetPhoto() {
    if (!ph.rot && !ph.crop && !ph.scale && !ph.flip) return;
    pushPhoto(); const k = kpx(), f = fullRect(), cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    ph = { rot: 0, crop: null, scale: null, flip: false }; buildRot(); buildPrep(); phLine = null;
    img.w = rotC.width * k; img.x = cx - img.w / 2; img.y = cy - imgH() / 2; afterPhoto();
  }
  // "What's in the photo?" / "My outline is": tip only or handle only adds the rest from Pick settings. A measured scale keeps its true size.
  function setMix(v) {
    if (api.read().olMix === v) return;
    pushUndo(); mixing = true; try { ownSet("olMix", v); } finally { mixing = false; }
    if (ph.scale && img) applyScale();
  }
  // crop box handles, in screen px from the box: corners and edge middles
  function cropHit(m) {
    const f = fullRect(), c = cropOf(), X = x => f.x + x * f.k, Y = y => f.y + y * f.k, t = tolMm(ph.crop ? 10 : 5);   // no crop yet: a drag near the edge draws a box
    const xs = { l: X(c.x0), r: X(c.x1), m: (X(c.x0) + X(c.x1)) / 2 }, ys = { t: Y(c.y0), b: Y(c.y1), m: (Y(c.y0) + Y(c.y1)) / 2 };
    for (const [h, hx, hy] of [["tl", "l", "t"], ["tr", "r", "t"], ["bl", "l", "b"], ["br", "r", "b"], ["t", "m", "t"], ["b", "m", "b"], ["l", "l", "m"], ["r", "r", "m"]])
      if (Math.abs(m[0] - xs[hx]) <= t && Math.abs(m[1] - ys[hy]) <= t) return h;
    if (m[0] > xs.l && m[0] < xs.r && m[1] > ys.t && m[1] < ys.b) return "in";
    return "out";
  }
  const toRotPx = m => { const f = fullRect(); return [(m[0] - f.x) / f.k, (m[1] - f.y) / f.k]; };
  function photoDown(e, m) {
    try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (mode === "crop") { let h = cropHit(m); const c = cropOf(), r = toRotPx(m);
      if (h === "in" && !ph.crop) h = "out";   // no crop yet: dragging over the photo draws the box
      phDrag = { id: e.pointerId, h, c0: { ...c }, r0: r, c: h === "out" ? { x0: r[0], y0: r[1], x1: r[0], y1: r[1] } : { ...c } }; }
    else { phDrag = { id: e.pointerId, a: m, b: m }; phLine = null; }
    draw();
  }
  function photoMove(e) {
    if (!view || !img) return false;
    if (!phDrag && mode === "crop" && photoMode()) { const h = cropHit(toMm(e));
      cv.style.cursor = { tl: "nwse-resize", br: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize", t: "ns-resize", b: "ns-resize", l: "ew-resize", r: "ew-resize", in: "move", out: "crosshair" }[h]; }
    if (!phDrag || e.pointerId !== phDrag.id) return false;
    const m = toMm(e);
    if (mode === "crop") { const r = toRotPx(m), d = phDrag, c = d.c, W2 = rotC.width, H2 = rotC.height;
      if (d.h === "out") { c.x1 = r[0]; c.y1 = r[1]; }
      else if (d.h === "in") { const w = d.c0.x1 - d.c0.x0, h = d.c0.y1 - d.c0.y0;
        const x0 = Math.max(0, Math.min(W2 - w, d.c0.x0 + r[0] - d.r0[0])), y0 = Math.max(0, Math.min(H2 - h, d.c0.y0 + r[1] - d.r0[1]));
        Object.assign(c, { x0, y0, x1: x0 + w, y1: y0 + h }); }
      else { const g = 8;   // a handle stops short of the opposite side
        if (d.h.includes("l")) c.x0 = Math.max(0, Math.min(c.x1 - g, r[0])); if (d.h.includes("r")) c.x1 = Math.min(W2, Math.max(c.x0 + g, r[0]));
        if (d.h.includes("t")) c.y0 = Math.max(0, Math.min(c.y1 - g, r[1])); if (d.h.includes("b")) c.y1 = Math.min(H2, Math.max(c.y0 + g, r[1])); } }
    else phDrag.b = m;
    draw(); return true;
  }
  function photoUp(e) {
    if (!phDrag || e.pointerId !== phDrag.id) return false;
    const d = phDrag; phDrag = null;
    if (mode === "crop") { const c = d.c, W2 = rotC.width, H2 = rotC.height;
      if (d.h === "out" && Math.abs(c.x1 - c.x0) < 8 && Math.abs(c.y1 - c.y0) < 8) { draw(); return true; }   // a click, not a box
      setCrop({ x0: Math.max(0, c.x0), y0: Math.max(0, c.y0), x1: Math.min(W2, c.x1), y1: Math.min(H2, c.y1) });
      say(ph.crop ? "Cropped: only the part inside the box is traced. Drag the handles to change it." : "Crop: the whole photo is used."); return true; }
    const L = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
    if (L < tolMm(12)) { say("Drag a longer line.", true); draw(); return true; }
    if (mode === "level") {
      let a = Math.atan2(d.b[1] - d.a[1], d.b[0] - d.a[0]) * 180 / Math.PI; if (a > 90) a -= 180; if (a <= -90) a += 180;
      setRot(ph.rot - a); setMode("crop"); say(`Straightened: turned ${r2(-a)}°. Your line is now level.`); return true;
    }
    phLine = { a: d.a, b: d.b, px: L / kpx() };
    syncPhotoUI(); const mmIn = phBox.querySelector("#ck-photo-scale-mm"); mmIn.focus(); mmIn.select();
    say(`Measured ${Math.round(phLine.px)} px. Type its real length in mm and press Set scale.`); draw(); return true;
  }
  // crop box, straighten / measure line, over the photo
  function drawPhotoTools(x, X, Y, s) {
    if (!photoMode() || !showImg) return;
    if (mode === "crop") {
      const f = fullRect(), c = phDrag && phDrag.c ? phDrag.c : cropOf();
      const bx = X(f.x + Math.min(c.x0, c.x1) * f.k), by = Y(f.y + Math.min(c.y0, c.y1) * f.k), bw = Math.abs(c.x1 - c.x0) * f.k * s, bh = Math.abs(c.y1 - c.y0) * f.k * s;
      x.fillStyle = "rgba(0,0,0,.55)"; x.beginPath(); x.rect(X(f.x), Y(f.y), f.w * s, f.h * s); x.rect(bx, by, bw, bh); x.fill("evenodd");
      x.strokeStyle = "#ffd166"; x.lineWidth = 2; x.strokeRect(bx, by, bw, bh);
      x.fillStyle = "#ffd166";
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [.5, 0], [.5, 1], [0, .5], [1, .5]]) x.fillRect(bx + u * bw - 5, by + v * bh - 5, 10, 10);
    }
    const l = phDrag && phDrag.a ? phDrag : mode === "measure" ? phLine : null;
    if (l) { x.strokeStyle = mode === "level" ? "#8fd3ff" : "#ffd166"; x.lineWidth = 2; x.beginPath(); x.moveTo(X(l.a[0]), Y(l.a[1])); x.lineTo(X(l.b[0]), Y(l.b[1])); x.stroke();
      x.fillStyle = x.strokeStyle; for (const q of [l.a, l.b]) { x.beginPath(); x.arc(X(q[0]), Y(q[1]), 4, 0, 7); x.fill(); } }
  }
  function applyPaint(m) { if (paint) for (let i = 0; i < m.length; i++) if (paint[i]) m[i] = paint[i] > 0 ? 1 : 0; return m; }
  function paintView() {   // green = added, red = removed, drawn over the image
    if (!paintCv || !src) return; const c = paintCv.getContext("2d"), id = c.createImageData(src.w, src.h);
    if (paint) for (let i = 0, j = 0; i < paint.length; i++, j += 4) if (paint[i]) { id.data[j] = paint[i] > 0 ? 60 : 255; id.data[j + 1] = paint[i] > 0 ? 220 : 70; id.data[j + 2] = 90; id.data[j + 3] = 150; }
    c.putImageData(id, 0, 0);
  }
  function paintAt(m, v) {
    const q = pxOf(m), rr = Math.max(1, brushR / kpxTrace());
    if (!paintStroke.copied) { paint = paint ? paint.slice() : new Int8Array(src.w * src.h); paintStroke.copied = true; }
    const x0 = Math.max(0, Math.floor(q[0] - rr)), x1 = Math.min(src.w - 1, Math.ceil(q[0] + rr)), y0 = Math.max(0, Math.floor(q[1] - rr)), y1 = Math.min(src.h - 1, Math.ceil(q[1] + rr));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x - q[0]) ** 2 + (y - q[1]) ** 2 <= rr * rr) paint[y * src.w + x] = v;
  }
  const kpxTrace = () => img.w / src.w;   // mm per trace pixel
  // Auto settings: try several modes / thresholds / blur / clean-up and keep the most pick-like result (site/trace-image.js)
  function autoSettings(quiet) {
    const t = TR(); if (!src || !t || !t.autoTune) return false;
    const res = t.autoTune(src.data, src.w, src.h, opts(), { seed: T.seed });
    if (!res || !res.opts) { if (!quiet) say("Auto settings found nothing better: crop tighter, or click the part to trace.", true); return false; }
    for (const k of ["mode", "threshold", "contrast", "brightness", "blur", "clean"]) if (res.opts[k] !== undefined) T[k] = res.opts[k];
    syncSliders(); tuned = true; kind = "auto"; rebase(); return true;
  }
  // ---------- the Photo block's one-slider trace: a kind (Auto / Dark on light / Light on dark) gives base settings, and Detail
  // (0-10, 5 = the base) moves threshold, blur, clean-up and smoothing together. The separate sliders stay under Image & trace
  // (Advanced in the step layout); moving one of them makes the current settings the new base.
  let kind = "auto", detail = 5, detBase = null, kindBtns = null, detIn = null;
  const DMODE = { dark: 1, light: -1, bg: -1, edge: -0.8, edgec: -0.8 };   // which way (and how far) the threshold moves for more detail
  function rebase() { detBase = { mode: T.mode, threshold: T.threshold, blur: T.blur, clean: T.clean, smooth: smIn ? +smIn.value : 3 }; detail = 5; syncDetail(); }
  function syncDetail() {
    if (detIn) { detIn.value = detail; detIn._o.textContent = detail === 5 ? "5 (as found)" : String(detail); }
    if (kindBtns) for (const k in kindBtns) { kindBtns[k].classList.toggle("on", k === kind); kindBtns[k].setAttribute("aria-pressed", String(k === kind)); }
  }
  // the settings for this detail from the base: more detail = less blur and clean-up, less smoothing, a threshold that takes in more
  function applyDetail() {
    if (!src) return;
    const d = detail;
    if (!detBase) { if (kind === "auto") autoSettings(true); if (!detBase) rebase(); }
    detail = d;
    const B = detBase, dl = (detail - 5) / 5, edge = B.mode === "edge" || B.mode === "edgec", clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));
    // the edge modes keep their blur and clean-up (they set the edge scale and the gap closing, which do not trade off smoothly)
    T.mode = B.mode; T.blur = edge ? B.blur : clamp(B.blur - 2.5 * dl, 0, 8); T.clean = edge ? B.clean : clamp(B.clean - 1.5 * dl, 0, 8);
    T.threshold = clamp(B.threshold * (1 + 0.25 * dl * (DMODE[B.mode] || -1)), 1, 254);
    if (smIn) { smIn.value = clamp(B.smooth - 3 * dl, 0, 10); smIn._o.textContent = smIn.value; }
    userSet = true; syncSliders(); syncDetail(); changed();
  }
  // a kind button: Auto runs Auto settings; Dark on light / Light on dark set that mode with a suggested threshold
  function setKind(k) {
    if (!src) return;
    const d = detail;
    if (k === "auto") { userSet = false; tuned = false; if (!autoSettings(false)) rebase(); }
    else { T.mode = k; T.blur = 2; T.clean = 1; if (TR() && TR().otsu) T.threshold = Math.round(TR().otsu(src.data, src.w, src.h, opts())); userSet = true; syncSliders(); rebase(); }
    kind = k; detail = d; applyDetail();
    if (!traced) say(k === "auto" ? "Auto: the most pick-like settings are chosen. Press Trace image." : "Press Trace image; move Detail if the outline is too rough or misses parts.");
  }
  const opts = () => ({ mode: T.mode, threshold: T.threshold, contrast: T.contrast, brightness: T.brightness, blur: T.blur, clean: T.clean, crop: T.crop, bg: T.bg });
  // the live layer: the photo, the black-and-white image the threshold works on, or the trace mask over the photo
  function refreshPreview() {
    pvKind = "";
    if (!src || imgView === "photo") return;
    const t = TR(); if (!t) return;
    const c = pv.getContext("2d"), id = c.createImageData(src.w, src.h);
    if (imgView === "bw") id.data.set(t.processed(src.data, src.w, src.h, opts()));
    else {
      let m = applyPaint(t.mask(src.data, src.w, src.h, opts()));
      const c = t.choose ? t.choose(src.data, src.w, src.h, m, { seed: T.seed, ref: lastComp }) : null, one = c && c.comp;
      for (let i = 0, j = 0; i < m.length; i++, j += 4) {
        const on = m[i], pick = one && one[i];
        id.data[j] = pick ? 80 : on ? 0 : 0; id.data[j + 1] = pick ? 220 : on ? 160 : 0; id.data[j + 2] = pick ? 255 : on ? 200 : 0; id.data[j + 3] = on || pick ? 170 : 0;
      }
    }
    c.putImageData(id, 0, 0); pvKind = imgView;
  }
  // a setting changed: redraw the live layer now; trace again (live) a moment later
  function changed() {
    refreshPreview(); draw();
    clearTimeout(pvTimer);
    if (live && traced && !handEdited) pvTimer = setTimeout(() => trace(true), 180);
    else if (live && traced && handEdited) say("You have edited the outline by hand, so live trace is paused (it would replace your edits). Press Trace image to trace again from the photo.");
  }
  const pxOf = m => [(m[0] - img.x) / img.w * src.w, (m[1] - img.y) / imgH() * src.h];
  const mmOf = q => [img.x + q[0] / src.w * img.w, img.y + q[1] / src.h * imgH()];
  function drawImageLayer(x, X, Y, s) {
    if (!img || !showImg) return;
    x.globalAlpha = photoMode() ? Math.max(imgOp, 0.85) : imgOp;
    if (photoMode()) { const f = fullRect(); x.drawImage(rotC, X(f.x), Y(f.y), f.w * s, f.h * s); }   // the whole photo while preparing it
    if (imgView === "bw" && pvKind === "bw") x.drawImage(pv, X(img.x), Y(img.y), img.w * s, imgH() * s);
    else if (!photoMode()) x.drawImage(img.el, X(img.x), Y(img.y), img.w * s, imgH() * s);
    if (imgView === "mask" && pvKind === "mask") { x.globalAlpha = Math.min(1, imgOp + 0.25); x.drawImage(pv, X(img.x), Y(img.y), img.w * s, imgH() * s); }
    x.globalAlpha = 1;
    if (paint && paintCv && !photoMode()) x.drawImage(paintCv, X(img.x), Y(img.y), img.w * s, imgH() * s);
    if (!src) return;
    if (T.seed) { const m = mmOf(T.seed); x.beginPath(); x.arc(X(m[0]), Y(m[1]), 7, 0, 7); x.strokeStyle = "#ffd166"; x.lineWidth = 2; x.stroke();
      x.beginPath(); x.moveTo(X(m[0]) - 11, Y(m[1])); x.lineTo(X(m[0]) + 11, Y(m[1])); x.moveTo(X(m[0]), Y(m[1]) - 11); x.lineTo(X(m[0]), Y(m[1]) + 11); x.stroke(); }
  }
  // image tools that use the pointer: click the part to trace, click the background colour
  function imageDown(e, m) {
    if (!img || !src) { say("Import an image first."); return true; }
    const q = pxOf(m).map(Math.round);
    if (q[0] < 0 || q[1] < 0 || q[0] >= src.w || q[1] >= src.h) { say("Click on the image."); return true; }
    if (mode === "seed") { T.seed = q; lastComp = null; say("Traces the shape under the cross."); changed(); if (!traced) trace(); return true; }
    if (mode === "bgpick" && TR()) { T.bg = TR().bgAt(src.data, src.w, src.h, q[0], q[1], 4); T.mode = "bg"; modeSel.value = "bg";
      if (TR().otsu) { T.threshold = Math.round(TR().otsu(src.data, src.w, src.h, opts())); syncSliders(); }   // a threshold for the new background
      say("Background colour set: the trace keeps what looks different from it."); changed(); if (!traced) trace(); return true; }
    return false;
  }
  function trace(isLive, snap0) {
    if (!img || !src) { say("Import an image first."); return; }
    const t = TR(), fail = "No shape found: change the threshold, the mode, or click the part to trace";
    let px = null;
    let chosen = null;
    // first trace of a photo with the settings untouched: let Auto settings choose them
    if (t && !traced && !isLive && !tuned && !userSet) autoSettings(true);
    if (t) { const m = applyPaint(t.mask(src.data, src.w, src.h, opts())); chosen = t.choose(src.data, src.w, src.h, m, { seed: T.seed, ref: traced ? lastComp : null });
      // a speck (a few px, or a sliver) is not a part: keep the outline there is rather than collapse onto it
      if (chosen) { const b = chosen.bbox, bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
        if (chosen.n < Math.max(40, src.w * src.h * 0.0004) || Math.min(bw, bh) < 3) {
          say(traced ? "These settings only find a speck there, so your outline was kept. Change the threshold back, or click the part to trace." :
            "Only a speck found: change the threshold or the mode, crop round the pick, or click the part to trace.", true); return; } }
      px = chosen ? t.boundary(chosen.comp, src.w, src.h) : null; }
    else px = traceMask(makeMask(src.data, src.w, src.h, T.threshold, T.mode === "light"), src.w, src.h);
    if (!px) { say(fail, true); return; }
    const n = +smIn.value, sm = smoothRing(px, n);   // average away the pixel staircase
    const mx = img.w / src.w, my = imgH() / src.h;
    let mm = sm.map(q => [img.x + (q[0] + 0.5) * mx, img.y + (q[1] + 0.5) * my]);
    // size: a measured photo scale gives true size; otherwise the traced shape takes the length in the field (first trace and
    // every re-trace, so Tip only's 40 mm or a typed length is kept). The image (and spare shapes) are scaled to match.
    const oldLen = api.getLen();
    const k = ph.scale ? ph.scale / kpx() : (oldLen || 100) / Math.max(1e-6, bbox(mm).w);
    // live re-traces replace each other in Undo: reuse the snapshot from before the first of them
    const popped = !!(isLive && traceUndo === undo.length && undo.length), snap = snap0 || (popped ? undo.pop() : snapshot());
    mm = mm.map(q => [q[0] * k, q[1] * k]); const old = { x: img.x, y: img.y, w: img.w }, oldSp = spares;
    img.x *= k; img.y *= k; img.w *= k; spares = spares.map(s => s.map(q => [q[0] * k, q[1] * k]));
    const p = CK.rdpClosed(mm, Math.max(0.04, (0.3 + 0.08 * n) * mx * k));
    inTrace = true; const ok = p.length >= 3 && edit(p, snap); inTrace = false;
    if (!ok) { Object.assign(img, old); spares = oldSp; if (popped) undo.push(snap); syncUndo(); say(fail, true); return; }
    traceUndo = undo.length; handEdited = false; if (chosen) lastComp = chosen.comp;
    const mix = lastO && lastO.olMix, newLen = api.getLen();   // handle only: the join stays at the end of your handle
    if (mix === "handle" && lastO && Math.abs(+lastO.olSplit - oldLen) < 0.6 && Math.abs(newLen - oldLen) > 0.01) ownSet("olSplit", newLen);
    const was = traced; traced = true; fitImg = false; if (!was) manual = false; syncImgUI(); refit(); draw();
    // a result that does not look like a pick gets a hint what to try (not just "too tall for the blade")
    const hint = t && t.plausible && chosen ? t.plausible(chosen, src.w, src.h) : null;
    say(`Traced ${p.length} points, ${r2(bbox(CK.parsePts(api.get())).w)} mm long${ph.scale ? " (true size from your scale)" : ""}.` + (hint ? " " + hint : "") + lenNote +
      (live && !hint ? " Live: changing a setting traces again." : "") +
      (!hint && (mix === "whole" || !mix) ? " Only a tip or a handle in the photo? Choose it under \"What's in the photo?\" to add the rest from our designs." : ""), !!hint || !!lenNote);
  }

  // ---------- drawing in several strokes: an unfinished line grows from either end until it closes
  let open = null, drawAdd = false, autoClose = false;
  const near = (a, b, t) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= t;
  const pathLen = P => P.reduce((L, q, i) => i ? L + Math.hypot(q[0] - P[i - 1][0], q[1] - P[i - 1][1]) : 0, 0);
  function addStroke(sp) {
    const t = tolMm(15);
    if (open) {
      const a = open[0], z = open[open.length - 1];
      if (near(z, sp[0], t)) open = open.concat(sp);
      else if (near(z, sp[sp.length - 1], t)) open = open.concat(sp.slice().reverse());
      else if (near(a, sp[sp.length - 1], t)) open = sp.concat(open);
      else if (near(a, sp[0], t)) open = sp.slice().reverse().concat(open);
      else { open = sp; say("Started a new line (it didn't start at an end of the unfinished one)."); }
    } else open = sp;
    if (open.length > 2 && ((near(open[0], open[open.length - 1], t) && pathLen(open) > 4 * t) || (autoClose && pathLen(open) > 3 * t))) closeOpen();
    else syncOpen();
  }
  function closeOpen() {
    if (!open || open.length < 3) { open = null; syncOpen(); return; }
    let poly = CK.rdpClosed(open, 0.15); open = null; syncOpen();
    const cur0 = CK.parsePts(api.get()), snap = snapshot();
    if (drawAdd && cur0.length >= 3) { const u = union([cur0, poly]); if (!u) { say("Could not combine the shapes."); return; } poly = u.pts; if (u.dropped) say("The new shape doesn't touch the outline: only the bigger piece is kept."); }
    // replacing a drawn or traced outline keeps the old one as a grey spare shape (the Select tool can bring it back)
    const keep = !drawAdd && cur0.length >= 3 && (traced || handEdited);
    if (keep) spares.push(cur0);
    if (poly.length >= 3 && edit(poly, snap)) { if (keep) say("New outline. The old one is kept as a grey spare shape: pick between them with Select."); }
    else if (keep) spares.pop();
  }
  function syncOpen() { warnEl.textContent = open ? "Outline not closed yet: keep drawing from either end (yellow dots) until the ends meet, or press Close outline." : ""; closeBtn.disabled = !open; draw(); }
  // union of closed shapes: fill them on a fine grid, keep the outer edge of the biggest joined piece
  function union(polys) {
    const all = polys.flat(), b = bbox(all), res = Math.max(0.02, Math.max(b.w, b.h) / 2400), pad = 3;
    const w = Math.ceil(b.w / res) + 2 * pad, h = Math.ceil(b.h / res) + 2 * pad;
    const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#000";
    for (const P of polys) { x.beginPath(); P.forEach((q, i) => { const X = (q[0] - b.x0) / res + pad, Y = (q[1] - b.y0) / res + pad; i ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.closePath(); x.fill(); }
    const d = x.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
    const t = TR(); let px, dropped = false;
    if (t) { const one = t.component(m, w, h, null); if (!one) return null; dropped = one.reduce((a, v) => a + v, 0) < m.reduce((a, v) => a + v, 0) * 0.98; px = t.boundary(one, w, h); }
    else px = traceMask(m, w, h);
    if (!px) return null;
    const mm = smoothRing(px, 1).map(q => [b.x0 + (q[0] - pad + 0.5) * res, b.y0 + (q[1] - pad + 0.5) * res]);
    return { pts: CK.rdpClosed(mm, Math.max(0.03, res * 0.7)), dropped };
  }

  // moving average round a closed ring, `n` passes of a 2n+1 window (pixel contours -> smooth curves)
  function smoothRing(P, n) {
    if (!(n > 0) || P.length < 8) return P;
    const w = Math.min(Math.floor(P.length / 6), Math.round(n * 1.5));
    for (let pass = 0; pass < 2; pass++) {
      const Q = []; for (let i = 0; i < P.length; i++) { let sx = 0, sy = 0;
        for (let j = -w; j <= w; j++) { const q = P[(i + j + P.length) % P.length]; sx += q[0]; sy += q[1]; }
        Q.push([sx / (2 * w + 1), sy / (2 * w + 1)]); }
      P = Q;
    }
    return P;
  }

  // ---------- mount / render
  // Layout: a toolbar of captioned groups (Start / Edit / Tidy / View), then the canvas, then (only with an image loaded)
  // the "Image & trace" panel. In the large view the panel moves to a side column and the canvas takes the rest.
  function mount(host, a) {
    api = a;
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
    const sty = document.createElement("style"); sty.textContent = CSS; host.appendChild(sty);
    const wrap = mk("div"); wrap.id = "ck-ol-wrap"; host.appendChild(wrap);
    const btn = (par, txt, fn, tip) => { const b = mk("button", "", txt); b.type = "button"; b.addEventListener("click", fn); if (tip) b.title = tip; par.appendChild(b); return b; };
    const group = (par, cap, cls) => { const g = mk("div", "grp"); if (cap) g.appendChild(mk("div", "cap", cap)); const b = mk("div", cls || "btns"); g.appendChild(b); par.appendChild(g); return b; };

    const tb = mk("div", "tb"); wrap.appendChild(tb);
    // 1 Start
    const gs = group(tb, "1 · Start");
    // replacing a trace or drawing asks first (Undo also brings it back)
    const replaceWith = tool => {
      if ((traced || handEdited) && !confirm("Replace your traced / drawn outline with the " + tool + " from the settings?\n\nTo KEEP your outline and add our handle or tip to it, press Cancel and choose \"Tip only\" or \"Handle only\" under \"My outline is\".")) return;
      const p = fromGeom(tool); if (p) { manual = false; edit(p); traced = false; handEdited = false; }
    };
    btn(gs, "From pick settings", () => replaceWith("pick"), "Replace the outline with the pick currently set in the Pick fields (asks first if you have traced or drawn)");
    btn(gs, "From tension settings", () => replaceWith("tension"), "Replace the outline with the tension bar currently set in the Tension fields (asks first if you have traced or drawn)");
    const file = mk("input"); file.type = "file"; file.accept = "image/*"; file.hidden = true;
    file.addEventListener("change", () => { if (file.files[0]) loadImage(file.files[0]); file.value = ""; });
    gs.appendChild(file);
    btn(gs, "Import image…", () => file.click(), "Load a photo or drawing to trace; the Photo and Image & trace panels then appear");
    btn(gs, "Clear outline", clearOutline, "Wipe the outline and start a fresh one (the image stays; Undo brings it back)").id = "ck-ol-clear";
    // what the outline is: the whole pick, or only the handle / only the working end with the rest from our designs
    const gm = group(tb, "My outline is", "seg");
    mixBtns = {
      whole: btn(gm, "Whole pick", () => setMix("whole"), "Your drawing / trace is the whole pick"),
      handle: btn(gm, "Handle only", () => setMix("handle"), "Your drawing / trace is the handle; the neck, shaft and tip come from the Shaft and Tip fields"),
      tip: btn(gm, "Tip only", () => setMix("tip"), "Your drawing / trace is the working end; the handle and neck come from the Handle fields (flat, contoured grip or X-Acto)"),
    };
    // 2 Edit outline: segmented tool bar
    const ge = group(tb, "2 · Edit outline", "seg tools");
    modeBtns = {
      draw: btn(ge, "Draw", () => setMode("draw"), "Draw the outline freehand, in as many strokes as you like"),
      sel: btn(ge, "Select", () => setMode("sel"), "Select points or a section (click, Ctrl+click, drag a box), then move, delete, smooth or straighten just that part; or pick one of several shapes"),
      move: btn(ge, "Move", () => setMode("move"), "Drag a red point to move it. Double-click a line to add a point, a point to delete it"),
      add: btn(ge, "+ Add", () => setMode("add"), "Click on or near the outline to add a point exactly where you click"),
      del: btn(ge, "− Delete", () => setMode("del"), "Click a red point to remove it"),
    };
    // 3 Tidy
    const gt = group(tb, "3 · Tidy");
    btn(gt, "Smooth points", () => { const p = CK.parsePts(api.get()); if (p.length >= 3) { const q = p.map((a, i) => { const b = p[(i - 1 + p.length) % p.length], c = p[(i + 1) % p.length];
      return [(b[0] + 2 * a[0] + c[0]) / 4, (b[1] + 2 * a[1] + c[1]) / 4]; }); edit(q); } }, "Average each point with its neighbours (press again for more)");
    btn(gt, "Level it", () => { const p = CK.parsePts(api.get()); if (p.length >= 3) edit(level(p)); }, "Rotate the outline so its long axis is horizontal");
    // View (Undo is always visible)
    const gv = group(tb, "View");
    undoBtn = btn(gv, "Undo", doUndo, "Undo the last change, up to 50 (Ctrl+Z)"); undoBtn.disabled = true; undoBtn.id = "ck-ol-undo";
    redoBtn = btn(gv, "Redo", doRedo, "Redo what Undo took back (Ctrl+Y or Ctrl+Shift+Z)"); redoBtn.disabled = true; redoBtn.id = "ck-ol-redo";
    btn(gv, "Fit view", () => { manual = false; refit(true); draw(); }, "Reset zoom and pan to show the whole outline");
    bigBtn = btn(gv, "Large view", () => setBig(!big), "Fill the window with the editor (Esc closes it)");

    // options that only matter while Draw is active
    dopts = mk("div", "dopts"); wrap.appendChild(dopts);
    closeBtn = btn(dopts, "Close outline", closeOpen, "Join the two ends of the unfinished line with a straight line"); closeBtn.disabled = true;
    const acBtn = btn(dopts, "Auto-close", () => { autoClose = !autoClose; acBtn.classList.toggle("on", autoClose); acBtn.setAttribute("aria-pressed", autoClose);
      if (autoClose && open) closeOpen(); }, "On: every stroke closes itself (a straight line joins its ends). Off: build the outline from several strokes, then press Close outline.");
    acBtn.setAttribute("aria-pressed", "false");
    dopts.appendChild(mk("span", "lbl", "New shapes:"));
    const nsg = mk("div", "seg"); dopts.appendChild(nsg);
    const repBtn = btn(nsg, "Replace outline", () => { drawAdd = false; repBtn.classList.add("on"); addBtn.classList.remove("on"); }, "A newly closed shape replaces the current outline");
    const addBtn = btn(nsg, "Add to outline", () => { drawAdd = true; addBtn.classList.add("on"); repBtn.classList.remove("on"); }, "A newly closed shape is merged with the current outline where they overlap");
    repBtn.classList.add("on");
    // options that only matter while Select is active
    sopts = mk("div", "dopts"); wrap.appendChild(sopts); sopts.hidden = true;
    sopts.appendChild(mk("span", "lbl cnt", "Nothing selected"));
    const sb = (txt, fn, tip, need) => { const b = btn(sopts, txt, fn, tip); if (need) b.dataset.need = need; return b; };
    sb("All", () => { const p = selPts(); sel = new Set(p.map((_, i) => i)); selSpare = -1; syncSelBar(); draw(); }, "Select every point (A)");
    sb("None", () => { sel = new Set(); selSpare = -1; syncSelBar(); draw(); }, "Clear the selection (Esc)");
    sb("Delete", selDelete, "Remove the selected points (Delete key)", "pts");
    sb("Smooth", selSmooth, "Average the selected points with their neighbours (press again for more)", "pts");
    sb("Straighten", selStraighten, "Make each selected section a straight line between its two ends", "pts");
    sb("Use this shape", useSpare, "Make the selected grey spare shape the outline (the current outline becomes a spare)", "spare");
    sb("Merge into outline", mergeSpare, "Join the selected spare shape to the outline where they overlap", "spare");
    sb("Delete shape", deleteSpare, "Remove the selected spare shape", "spare");

    const body = mk("div", "body"); wrap.appendChild(body);
    const stage = mk("div", "stage"); body.appendChild(stage);
    cv = mk("canvas"); cv.width = W; cv.height = H; stage.appendChild(cv); ctx = cv.getContext("2d");
    warnEl = mk("div", "warn"); stage.appendChild(warnEl);
    helpEl = mk("div", "help"); stage.appendChild(helpEl);
    st = mk("div", "st"); stage.appendChild(st);

    // Image & trace panel (only with an image loaded)
    const side = mk("div", "side"); body.appendChild(side);
    const lab = (par, txt, el, tip) => { const l = mk("label", "", txt); l.appendChild(el); if (tip) l.title = tip; par.appendChild(l); return l; };
    const slider = (par, txt, el, tip) => { const l = mk("label", "sl"), t = mk("span", "t"), o = mk("output", "", el.value); t.append(mk("span", "", txt), o); l.append(t, el); if (tip) l.title = tip; par.appendChild(l); el._o = o; return l; };
    const idb = (par, id, txt, fn, tip) => { const b = btn(par, txt, fn, tip); b.id = id; return b; };

    // Photo block (only with an image loaded): what's in it, crop, rotate / straighten, scale. Ids start ck-photo-.
    phBox = mk("details"); phBox.id = "ck-photo"; phBox.open = true; phBox.hidden = true; side.appendChild(phBox);
    phBox.appendChild(mk("summary", "", "Photo"));
    const p1 = mk("div", "sec"); phBox.appendChild(p1);
    p1.appendChild(mk("div", "q", "What's in the photo?"));
    const pm = mk("div", "seg"); p1.appendChild(pm);
    phMix = {
      whole: idb(pm, "ck-photo-mix-whole", "Whole pick", () => setMix("whole"), "The photo shows the whole pick: the trace is used as it is"),
      tip: idb(pm, "ck-photo-mix-tip", "Tip only", () => setMix("tip"), "The photo shows the working end: the handle and neck come from the Handle fields"),
      handle: idb(pm, "ck-photo-mix-handle", "Handle only", () => setMix("handle"), "The photo shows the handle: the neck, shaft and tip come from the Shaft and Tip fields"),
    };
    const p2 = mk("div", "sec"); phBox.appendChild(p2);
    p2.appendChild(mk("div", "cap", "Crop and turn"));
    const pr1 = mk("div", "btns"); p2.appendChild(pr1);
    modeBtns.crop = idb(pr1, "ck-photo-crop", "Crop", () => setMode("crop"), "Drag the handles (or drag a new box) round the pick; only the part inside is traced");
    idb(pr1, "ck-photo-crop-all", "Whole photo", () => { if (img && ph.crop) { setCrop({ x0: 0, y0: 0, x1: rotC.width, y1: rotC.height }); } }, "Undo the crop: use the whole photo");
    idb(pr1, "ck-photo-rot-ccw", "⟲ 90°", () => img && setRot(ph.rot - 90), "Turn the photo a quarter turn anticlockwise");
    idb(pr1, "ck-photo-rot-cw", "⟳ 90°", () => img && setRot(ph.rot + 90), "Turn the photo a quarter turn clockwise");
    idb(pr1, "ck-photo-flip", "Flip ⇆", flipPhoto, "Mirror the photo left to right (for a photo with the tip on the left)");
    modeBtns.level = idb(pr1, "ck-photo-straighten", "Straighten", () => setMode("level"), "Drag a line along an edge that should be level (e.g. the pick's bottom edge); the photo turns to make it horizontal");
    phAng = mk("input"); phAng.type = "range"; phAng.min = -45; phAng.max = 45; phAng.step = 0.1; phAng.value = 0; phAng.id = "ck-photo-angle";
    slider(p2, "Fine turn (°)", phAng, "Turn the photo by a few degrees");
    let angPending = null, angPushed = false, angBase = 0;
    phAng.addEventListener("input", () => {
      if (!img) return; phAng._o.textContent = phAng.value;
      if (!angPushed) { pushPhoto(); angPushed = true; angBase = ph.rot - phFine; }
      if (angPending === null) requestAnimationFrame(() => { const v = angPending; angPending = null; setRot(angBase + v, true); });
      angPending = +phAng.value;
    });
    phAng.addEventListener("change", () => { angPushed = false; });
    const p3 = mk("div", "sec"); phBox.appendChild(p3);
    p3.appendChild(mk("div", "cap", "True size (optional)"));
    const pr3 = mk("div", "row"); p3.appendChild(pr3);
    modeBtns.measure = idb(pr3, "ck-photo-scale", "Measure", () => setMode("measure"), "Drag a line across something of known length in the photo (a ruler, the pick's width), then type that length");
    phMm = mk("input"); phMm.type = "number"; phMm.min = 0.1; phMm.step = 0.1; phMm.id = "ck-photo-scale-mm"; phMm.placeholder = "mm";
    const setS = () => { const v = +phMm.value; if (!phLine) { say("Press Measure and drag a line across a known length first.", true); return; }
      if (!(v > 0)) { say("Type the line's real length in mm.", true); return; }
      setScale(v / phLine.px); say(`Scale set: ${Math.round(phLine.px / v * 100) / 100} px per mm. The trace is now true size.`); };
    phMm.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); setS(); } });
    lab(pr3, "is", phMm, "The real length of the line you measured"); pr3.appendChild(mk("span", "", "mm"));
    idb(pr3, "ck-photo-scale-set", "Set scale", setS, "Use this length to size the trace");
    idb(pr3, "ck-photo-scale-clear", "Clear scale", () => { if (ph.scale) { pushPhoto(); ph.scale = null; phLine = null; syncPhotoUI(); draw(); say("Scale cleared: the trace is sized by the length field."); } }, "Forget the measured scale");
    phInfo = mk("div", "help"); phInfo.id = "ck-photo-scale-info"; p3.appendChild(phInfo);
    // trace: what kind of photo, and one Detail slider (the separate settings are in Image & trace)
    const p5 = mk("div", "sec"); p5.id = "ck-photo-tracebox"; phBox.appendChild(p5);
    p5.appendChild(mk("div", "cap", "Trace"));
    const pk = mk("div", "seg"); p5.appendChild(pk);
    kindBtns = {
      auto: idb(pk, "ck-photo-kind-auto", "Auto", () => setKind("auto"), "Try several ways of tracing and keep the most pick-like outline"),
      dark: idb(pk, "ck-photo-kind-dark", "Dark on light", () => setKind("dark"), "A dark pick on a light background"),
      light: idb(pk, "ck-photo-kind-light", "Light on dark", () => setKind("light"), "A light (shiny) pick on a dark background"),
    };
    detIn = mk("input"); detIn.type = "range"; detIn.min = 0; detIn.max = 10; detIn.step = 1; detIn.value = 5; detIn.id = "ck-photo-detail";
    slider(p5, "Detail", detIn, "Less: a smoother, simpler outline. More: follows small features (and photo noise). Moves threshold, blur, clean-up and smoothing together");
    detIn.addEventListener("input", () => { detail = +detIn.value; applyDetail(); });
    p5.appendChild(mk("div", "help", "Less detail: a smoother outline. More: follows small features. The separate settings are under Image & trace."));
    const p4 = mk("div", "row"); p4.style.marginTop = "8px"; phBox.appendChild(p4);
    const ptr = idb(p4, "ck-photo-trace", "Trace image", () => { trace(false); if (traced && photoMode()) setMode("move"); }, "Trace the pick from the prepared photo"); ptr.classList.add("pri");
    phUndoBtn = idb(p4, "ck-photo-undo", "Undo photo", undoPhoto, "Undo the last crop, turn or scale");
    idb(p4, "ck-photo-reset", "Reset photo", resetPhoto, "Back to the photo as imported: no crop, no turn, no scale");

    ctl = mk("details", "imgctl"); ctl.open = true; ctl.hidden = true; side.appendChild(ctl);
    ctl.appendChild(mk("summary", "", "Image & trace"));
    const rng = (par, txt, k, min, max, step, tip) => { const el = mk("input"); el.type = "range"; el.min = min; el.max = max; el.step = step; el.value = T[k];
      el.id = "ck-ol-" + k; el.addEventListener("input", () => { T[k] = +el.value; el._o.textContent = el.value; userSet = true; rebase(); changed(); }); slider(par, txt, el, tip); sliders[k] = el; return el; };
    // a. what to trace
    const s1 = mk("div", "sec"); ctl.appendChild(s1);
    s1.appendChild(mk("div", "cap", "a · What to trace (optional)"));
    const r1 = mk("div", "btns"); s1.appendChild(r1);
    modeBtns.seed = btn(r1, "Click the part", () => setMode("seed"), "Click the pick in the image; the trace keeps the shape under the cross");
    modeBtns.bgpick = btn(r1, "Pick background", () => setMode("bgpick"), "Click the background; the trace then keeps whatever looks different from that colour");
    // fix a trace by hand: paint what belongs to the part, or what does not
    const r1b = mk("div", "btns"); s1.appendChild(r1b);
    modeBtns.padd = btn(r1b, "Paint to add", () => setMode("padd"), "Paint over parts of the pick the trace missed (green)"); modeBtns.padd.id = "ck-ol-paint-add";
    modeBtns.pdel = btn(r1b, "Paint to remove", () => setMode("pdel"), "Paint over background the trace took in (red)"); modeBtns.pdel.id = "ck-ol-paint-del";
    const bz = mk("input"); bz.type = "number"; bz.min = 0.5; bz.max = 20; bz.step = 0.5; bz.value = brushR; bz.id = "ck-ol-brush";
    bz.addEventListener("input", () => { if (+bz.value > 0) brushR = +bz.value; }); lab(r1b, "Brush (mm)", bz, "Brush radius in mm");
    btn(r1b, "Clear paint", () => { if (!paint) return; pushUndo(); paint = null; paintView(); refreshPreview(); if (traced) trace(false); else draw(); }, "Remove all brush strokes").id = "ck-ol-paint-clear";
    // b. settings
    const sd = mk("details", "sub"); sd.open = true; ctl.appendChild(sd); sd.appendChild(mk("summary", "", "b · Trace settings"));
    const r2 = mk("div", "row"); r2.style.marginTop = "8px"; sd.appendChild(r2);
    modeSel = mk("select"); modeSel.id = "ck-ol-trace-mode"; [["dark", "Dark shape on a light background"], ["light", "Light shape on a dark background"], ["bg", "Anything different from the background colour"],
      ["edge", "Outline edges (a pick on stone, wood or cloth)"], ["edgec", "Colour edges (pick and speckled background differ in hue)"]].forEach(([v, t]) => modeSel.add(new Option(t, v)));
    modeSel.addEventListener("change", () => { T.mode = modeSel.value; userSet = true; if (TR() && TR().otsu) { T.threshold = Math.round(TR().otsu(src.data, src.w, src.h, opts())); syncSliders(); } rebase(); changed(); });
    lab(r2, "Trace", modeSel);
    const ab = btn(r2, "Auto settings", () => { if (autoSettings(false)) { if (traced) trace(false); else trace(false); } }, "Try several modes and settings and keep the most pick-like trace"); ab.id = "ck-ol-auto";
    btn(r2, "Auto threshold", () => { if (src && TR() && TR().otsu) { T.threshold = Math.round(TR().otsu(src.data, src.w, src.h, opts())); syncSliders(); rebase(); changed(); } }, "Suggest a threshold for the current mode and crop");
    const sg = mk("div", "sliders"); sd.appendChild(sg);
    rng(sg, "Threshold", "threshold", 0, 255, 1, "Brightness cut-off between shape and background");
    rng(sg, "Contrast", "contrast", -100, 100, 1); rng(sg, "Brightness", "brightness", -100, 100, 1);
    rng(sg, "Blur", "blur", 0, 8, 1, "Blur: ignores texture");
    rng(sg, "Clean up", "clean", 0, 8, 1, "Clean up: fills engraving and drops specks");
    smIn = mk("input"); smIn.id = "ck-ol-smooth"; smIn.type = "range"; smIn.min = 0; smIn.max = 10; smIn.step = 1; smIn.value = 3; slider(sg, "Outline smoothing", smIn, "Averages away the pixel staircase of the traced edge");
    smIn.addEventListener("input", () => { smIn._o.textContent = smIn.value; rebase(); changed(); });
    syncDetail();
    // c. trace
    const s3 = mk("div", "sec"); ctl.appendChild(s3);
    s3.appendChild(mk("div", "cap", "c · Trace"));
    const r3 = mk("div", "row"); s3.appendChild(r3);
    const tbtn = btn(r3, "Trace image", () => trace(false), "Trace the outline from the image with these settings"); tbtn.classList.add("pri");
    const lv = mk("input"); lv.type = "checkbox"; lv.checked = live; lv.addEventListener("change", () => { live = lv.checked; }); lab(r3, "Live trace", lv, "Trace again whenever a setting changes (paused after you edit the outline by hand)");
    s3.appendChild(mk("div", "help", "Trace keeps the outer outline of one shape (the one you clicked, else the biggest); holes inside it are ignored."));
    // d. display
    const dd = mk("details", "sub"); dd.open = true; ctl.appendChild(dd); dd.appendChild(mk("summary", "", "d · Display"));
    const r4 = mk("div", "row"); r4.style.marginTop = "8px"; dd.appendChild(r4);
    const viewSel = mk("select"); [["photo", "the photo"], ["bw", "black and white (what the threshold sees)"], ["mask", "the trace mask (blue = traced part)"]].forEach(([v, t]) => viewSel.add(new Option(t, v)));
    viewSel.addEventListener("change", () => { imgView = viewSel.value; refreshPreview(); draw(); }); lab(r4, "Show", viewSel);
    showIn = mk("input"); showIn.type = "checkbox"; showIn.checked = true;
    showIn.addEventListener("change", () => { showImg = showIn.checked; refit(); draw(); }); lab(r4, "Show image", showIn);
    wIn = mk("input"); wIn.type = "number"; wIn.min = 1; wIn.step = 0.5;
    wIn.addEventListener("input", () => { const v = +wIn.value; if (img && v > 0) { img.w = v; if (ph.scale) { ph.scale = kpx(); syncPhotoUI(); } refit(); draw(); } }); lab(r4, "Image width (mm)", wIn, "Scale the image; the outline keeps its size");
    const sg2 = mk("div", "sliders"); dd.appendChild(sg2);
    const io = mk("input"); io.type = "range"; io.min = 0; io.max = 1; io.step = 0.05; io.value = imgOp; io.addEventListener("input", () => { imgOp = +io.value; draw(); }); slider(sg2, "Image opacity", io);
    const oo = mk("input"); oo.type = "range"; oo.min = 0; oo.max = 1; oo.step = 0.05; oo.value = olOp; oo.addEventListener("input", () => { olOp = +oo.value; draw(); }); slider(sg2, "Outline fill opacity", oo);
    io.addEventListener("input", () => { io._o.textContent = io.value; }); oo.addEventListener("input", () => { oo._o.textContent = oo.value; });
    const r5 = mk("div", "row"); r5.style.marginTop = "8px"; ctl.appendChild(r5);
    btn(r5, "Clear image", () => { const pm = photoMode() || ["seed", "bgpick"].includes(mode); img = null; src = null; base = rotC = null; phLine = null; phUndo.length = 0;
      ph = { rot: 0, crop: null, scale: null, flip: false }; lastComp = null; if (pm) setMode("draw"); syncImgUI(); syncPhotoUI(); say(""); refit(); draw(); }, "Remove the image (the outline stays)");

    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onCancel);
    cv.addEventListener("contextmenu", e => e.preventDefault());
    cv.addEventListener("wheel", onWheel, { passive: false });
    addEventListener("keydown", e => {
      if (e.key === "Escape" && open) { open = null; syncOpen(); return; }
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || "") || (e.target && e.target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && !typing && !e.altKey && wrapEl.offsetParent !== null) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
        if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); doRedo(); return; }
      }
      if (mode === "sel" && !typing && wrapEl.offsetParent !== null) {
        if (e.key === "Escape" && (sel.size || selSpare >= 0)) { sel = new Set(); selSpare = -1; syncSelBar(); draw(); return; }
        if (e.key === "Delete" || e.key === "Backspace") { if (selSpare >= 0) deleteSpare(); else if (sel.size) selDelete(); e.preventDefault(); return; }
        if ((e.key === "a" || e.key === "A") && !e.ctrlKey && !e.metaKey) { sel = new Set(selPts().map((_, i) => i)); syncSelBar(); draw(); return; }
      }
      if (e.key === "Escape" && big) setBig(false);
    });
    addEventListener("resize", () => { if (big) sizeCanvas(); });
    wrapEl = wrap; ui = wrap; setMode("draw");
  }
  function setMode(m) {
    if (m !== "draw" && open) { say("The unfinished line was closed with a straight line between its ends."); closeOpen(); }
    if (["crop", "level", "measure"].includes(m) && !img) { say("Import an image first."); return; }
    const wasPhoto = photoMode();
    mode = m; for (const k in modeBtns) modeBtns[k].classList.toggle("on", k === m);
    if (cv) cv.style.cursor = CURSOR[m];
    if (dopts) dopts.hidden = m !== "draw";
    if (sopts) { sopts.hidden = m !== "sel"; syncSelBar(); }
    if (m !== "sel") { box = null; }
    if (ui && wasPhoto !== photoMode()) sizeCanvas();
    if (helpEl) helpEl.innerHTML = ({
      draw: "<b>Draw:</b> draw in as many strokes as you like; carry on from either end (yellow dots) and the outline closes when the ends meet, or press Close outline.",
      sel: "<b>Select:</b> click a point or a line, Ctrl+click to add, drag a box round several, double-click for the whole shape. Drag a selected point to move the selection; Delete, Smooth or Straighten work on it. Click a grey spare shape to choose it.",
      crop: "<b>Crop:</b> drag the yellow handles (or drag a new box) round the pick. Only the part inside is traced.",
      level: "<b>Straighten:</b> drag a line along an edge that should be level, such as the pick's bottom edge; the photo turns so that line is horizontal.",
      measure: "<b>Measure:</b> drag a line across something of known length (a ruler, a coin), then type its length in mm and press Set scale.",
      move: "<b>Move:</b> drag a red point. Double-click a line to add a point, a point to delete it.",
      add: "<b>Add:</b> click on or near the outline; the point goes exactly where you click. Fine-tune it with Move.",
      del: "<b>Delete:</b> click a red point to remove it.",
      padd: "<b>Paint to add:</b> paint over the parts of the pick the trace missed; it traces again when you let go.",
      pdel: "<b>Paint to remove:</b> paint over background the trace took in; it traces again when you let go.",
      seed: "<b>Click the part:</b> click on the pick in the image; the trace keeps the shape under the cross.",
      bgpick: "<b>Pick background:</b> click the background; the trace then keeps whatever looks different from it.",
    })[m] + " <span title=\"Scroll to zoom, Shift+drag or middle button to pan, Fit view to reset\">Scroll = zoom · Shift+drag = pan.</span> Smoothing, straightening and holes are in the fields.";
    if (ui) draw();
  }

  let mixBtns = null;
  function render(o) {
    lastO = o; if (!ui) return;
    autoCheckpoint(o);
    for (const B of [mixBtns, phMix]) if (B) for (const k in B) B[k].classList.toggle("on", k === (o.olMix || "whole"));
    if (!drag && !stroke && !split) {
      let p = CK.parsePts(api.get() || "");
      if (p.length >= 3) cleared = false;
      if (p.length < 3 && !cleared) {                                // seed from the current pick (not after Clear outline)
        const ring = fromGeom("pick");
        if (ring) { const n = normalise(ring); api.setLenQuiet(r2(bbox(n.pts).w)); api.setQuiet(CK.ptsToStr(n.pts)); p = CK.parsePts(api.get()); }
      } else if (p.length >= 3) {
        const len = api.getLen();
        if (len > 0 && !isNormal(p, len)) {                          // length field changed (or points drifted): rescale, image follows
          const n = normalise(p, len);
          api.setQuiet(CK.ptsToStr(n.pts));
          if (img) { img.x = (img.x + n.dx) * n.k; img.y = (img.y + n.dy) * n.k; img.w *= n.k; syncImgUI(); if (ph.scale && !mixing) { ph.scale = kpx(); syncPhotoUI(); } }
          spares = spares.map(s => s.map(q => [(q[0] + n.dx) * n.k, (q[1] + n.dy) * n.k]));
        }
      }
      refit();
    }
    if (!restoring && !drag && !stroke && !split) baseline = snapshot();
    draw();
  }

  // _state: read-only view of the editor for browser tests (canvas mapping, photo state)
  const _state = () => ({ view, W, H, mode, img: img && { x: img.x, y: img.y, w: img.w, h: imgH() }, full: img && rotC ? fullRect() : null, ph: { ...ph },
    sel: [...sel], spares: spares.length, selSpare, undo: undo.length, phUndo: phUndo.length, traced, cleared });
  // Undo step before a preset / Reset all replaces the outline (site/customizer.js)
  const isEmpty = () => cleared && CK.parsePts(api ? api.get() : "").length < 3;
  const unclear = () => { cleared = false; };
  return { mount, render, isEmpty, unclear, checkpoint, _state, _t: { bbox, normalise, isNormal, level, nearestVertex, insertPoint, deletePoint, makeMask, traceMask, midYAt, smoothRing } };
})();
