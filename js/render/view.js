/* =====================================================================
 * Crownhold — render/view.js
 * The world canvas: camera (pan, wheel zoom, pinch zoom), pointer input
 * routing, cached terrain, and drawing of the home kingdom and battles.
 * ===================================================================== */
CH.View = (function () {
  const C = CH.CONFIG, T = C.T, WW = C.COLS * T, WH = C.ROWS * T, A = CH.Art;
  const terrainCache = {};

  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  /** Terrain image. kind: 'home' (with kingdom area), 'raid', 'campaign'. */
  function terrain(key, opts) {
    if (terrainCache[key]) return terrainCache[key];
    const cv = makeCanvas(WW, WH), c = cv.getContext('2d');
    const rnd = CH.util.rng(opts.seed || 7);
    const pal = opts.pal || { g1: '#4f8a3c', g2: '#5f9a47', g3: '#3d7230', path: '#c2a46e', edge: '#7a5d39' };
    c.fillStyle = opts.area ? '#3f7432' : pal.g1; c.fillRect(0, 0, WW, WH);
    for (let i = 0; i < 260; i++) { c.globalAlpha = 0.2 + rnd() * 0.25; A.circle(c, rnd() * WW, rnd() * WH, 14 + rnd() * 40, rnd() > 0.5 ? pal.g2 : pal.g3); }
    c.globalAlpha = 1;
    if (opts.area) {
      const a = opts.area, x = a.x * T, y = a.y * T, w = a.w * T, h = a.h * T;
      A.rrect(c, x - 6, y - 6, w + 12, h + 12, 10, 'rgba(0,0,0,0.18)');
      A.rrect(c, x - 4, y - 4, w + 8, h + 8, 10, '#a08a5c');
      A.rrect(c, x, y, w, h, 6, '#5c9a45');
      for (let i = 0; i < 160; i++) { c.globalAlpha = 0.25; A.circle(c, x + rnd() * w, y + rnd() * h, 8 + rnd() * 22, rnd() > 0.5 ? '#68a650' : '#548f3f'); }
      c.globalAlpha = 1;
      c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 1;
      for (let gx = a.x; gx <= a.x + a.w; gx++) { c.beginPath(); c.moveTo(gx * T, y); c.lineTo(gx * T, y + h); c.stroke(); }
      for (let gy = a.y; gy <= a.y + a.h; gy++) { c.beginPath(); c.moveTo(x, gy * T); c.lineTo(x + w, gy * T); c.stroke(); }
    }
    for (let i = 0; i < 900; i++) { c.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'; c.fillRect(rnd() * WW, rnd() * WH, 2, 2); }
    if (opts.roads) {
      const stroke = (w, col) => { for (const r of opts.roads) { c.beginPath(); r.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.lineWidth = w; c.strokeStyle = col; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); } };
      stroke(40, pal.edge); stroke(31, pal.path);
      for (const r of opts.roads) for (let i = 0; i < 120; i++) { const p = r[Math.floor(rnd() * (r.length - 1))], q = r[r.indexOf(p) + 1]; const k = rnd(); c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(p.x + (q.x - p.x) * k + (rnd() - 0.5) * 22, p.y + (q.y - p.y) * k + (rnd() - 0.5) * 22, 2, 2); }
    }
    // Wild scenery outside the kingdom (decorative only).
    const keepOut = opts.area ? (tx, ty) => tx >= opts.area.x - 1 && ty >= opts.area.y - 1 && tx <= opts.area.x + opts.area.w && ty <= opts.area.y + opts.area.h : opts.keepOut || (() => false);
    const decorKind = opts.decor || 'forest';
    for (let i = 0; i < (opts.area ? 110 : 40); i++) {
      const tx = Math.floor(rnd() * C.COLS), ty = Math.floor(rnd() * C.ROWS);
      if (keepOut(tx, ty)) continue;
      const x = tx * T + rnd() * 10, y = ty * T + rnd() * 10;
      sceneryPiece(c, decorKind, x, y, rnd());
    }
    if (opts.blockedDecor) for (const d of opts.blockedDecor) sceneryPiece(c, opts.decor, d.tx * T, d.ty * T - 4, d.s, d.kind);
    const vg = c.createRadialGradient(WW / 2, WH / 2, WH * 0.4, WW / 2, WH / 2, WW * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)'); c.fillStyle = vg; c.fillRect(0, 0, WW, WH);
    terrainCache[key] = cv;
    return cv;
  }
  function sceneryPiece(c, kind, x, y, r, force) {
    const k = force || (r > 0.35 ? 'tree' : 'rock');
    if (kind === 'snow' && k === 'tree') { A.ell(c, x + 18, y + 30, 12, 4, 'rgba(0,0,0,0.25)'); A.rect(c, x + 14, y + 20, 4, 10, '#4a3020'); for (let i = 0; i < 3; i++) A.poly(c, [x + 4 + i * 2, y + 22 - i * 8, x + 16, y + 4 - i * 8, x + 28 - i * 2, y + 22 - i * 8], i === 2 ? '#f2f8ff' : '#2f5a4a'); return; }
    if (kind === 'lava' && k === 'tree') { A.ell(c, x + 16, y + 20, 14, 8, '#2a1410'); A.ell(c, x + 16, y + 19, 11, 6, '#ff5a1a'); A.ell(c, x + 13, y + 18, 5, 2.5, '#ffc04a'); return; }
    if ((kind === 'swamp' || kind === 'dark') && k === 'tree') { A.line(c, x + 16, y + 30, x + 16, y + 6, '#3a2e26', 4); A.line(c, x + 16, y + 16, x + 6, y + 6, '#3a2e26', 2.5); A.line(c, x + 16, y + 12, x + 25, y + 2, '#3a2e26', 2.5); return; }
    if (k === 'tree') { A.ell(c, x + 19, y + 30, 13, 5, 'rgba(0,0,0,0.3)'); A.rect(c, x + 14, y + 16, 5, 14, '#5a3a20'); A.circle(c, x + 10, y + 12, 10, '#2c6229'); A.circle(c, x + 23, y + 11, 10, '#2f6a2c'); A.circle(c, x + 16, y + 3, 11, '#367a32'); return; }
    A.ell(c, x + 16, y + 26, 11, 4, 'rgba(0,0,0,0.3)'); A.poly(c, [x + 5, y + 26, x + 8, y + 14, x + 16, y + 10, x + 26, y + 15, x + 28, y + 26], kind === 'snow' ? '#c6d2de' : kind === 'lava' ? '#2a1f26' : '#8a857a', 'rgba(0,0,0,0.35)', 1);
  }

  /** Repeating, slightly dimmed wilderness drawn beyond the map edges so the
   *  world never looks letterboxed on tall or wide screens. */
  const fillerCache = {};
  function filler(ctx, kind, pal) {
    const key = kind + (pal ? pal.g1 : '');
    if (!fillerCache[key]) {
      const cv = makeCanvas(256, 256), c = cv.getContext('2d'), rnd = CH.util.rng(kind.length * 97 + 3);
      const p = pal || { g1: '#3f7432', g2: '#4a8239', g3: '#335f29' };
      c.fillStyle = p.g1; c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 40; i++) { c.globalAlpha = 0.3; A.circle(c, rnd() * 256, rnd() * 256, 10 + rnd() * 30, rnd() > 0.5 ? p.g2 : p.g3); }
      c.globalAlpha = 1;
      for (let i = 0; i < 9; i++) sceneryPiece(c, kind, 10 + (i % 3) * 82 + rnd() * 30, 10 + Math.floor(i / 3) * 82 + rnd() * 30, rnd() * 0.6 + 0.4);
      c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, 0, 256, 256);
      fillerCache[key] = ctx.createPattern(cv, 'repeat');
    }
    return fillerCache[key];
  }

  /* ---------------- Camera & input ---------------- */
  class View {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.cam = { x: WW / 2, y: WH / 2, zoom: 1 }; this.base = 1; this.dpr = 1;
      this.handler = null; this.pointers = new Map(); this.drag = null;
      canvas.addEventListener('pointerdown', e => this.down(e));
      canvas.addEventListener('pointermove', e => this.move(e));
      canvas.addEventListener('pointerup', e => this.up(e));
      canvas.addEventListener('pointercancel', e => { this.pointers.delete(e.pointerId); this.drag = null; });
      canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && this.handler && this.handler.hover) this.handler.hover(null); });
      canvas.addEventListener('wheel', e => { e.preventDefault(); const p = this.toWorld(e.clientX, e.clientY); this.zoomAt(p, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
      canvas.addEventListener('contextmenu', e => { e.preventDefault(); if (this.handler && this.handler.cancel) this.handler.cancel(); });
    }
    resize() {
      const r = this.canvas.parentElement.getBoundingClientRect();
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = r.width; this.h = r.height;
      this.canvas.width = Math.round(r.width * this.dpr); this.canvas.height = Math.round(r.height * this.dpr);
      this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px';
      this.base = Math.min(r.width / WW, r.height / WH);
      // Re-fit the last framed area when the screen changes size or rotates.
      if (this.lastFrame && (Math.abs(r.width - (this.prevW || 0)) > 40 || Math.abs(r.height - (this.prevH || 0)) > 40)) this.frame(this.lastFrame.rect, this.lastFrame.margin, this.lastFrame.fit, this.lastFrame.focus);
      this.prevW = r.width; this.prevH = r.height;
      this.clamp();
    }
    /** Frame a world rectangle (in tiles) so it fills the screen. */
    /** Frame a rect (tiles). fit 'height' fills the screen height and lets the
     *  player pan sideways (used for wide maps on portrait phones). */
    frame(rect, margin = 1, fit = 'contain', focus = null) {
      this.lastFrame = { rect, margin, fit, focus };
      const w = (rect.w + margin * 2) * T, h = (rect.h + margin * 2) * T;
      const z = (fit === 'height' ? this.h / h : Math.min(this.w / w, this.h / h)) / this.base;
      this.cam.zoom = Math.max(1, Math.min(3, z));
      this.cam.x = focus ? focus.x : (rect.x + rect.w / 2) * T; this.cam.y = focus ? focus.y : (rect.y + rect.h / 2) * T;
      this.clamp();
    }
    get portrait() { return this.h > this.w * 1.15; }
    get scale() { return this.base * this.cam.zoom; }
    clamp() {
      const s = this.scale, hw = this.w / s / 2, hh = this.h / s / 2;
      this.cam.x = hw * 2 >= WW ? WW / 2 : CH.util.clamp(this.cam.x, hw, WW - hw);
      this.cam.y = hh * 2 >= WH ? WH / 2 : CH.util.clamp(this.cam.y, hh, WH - hh);
    }
    toWorld(cx, cy) {
      const r = this.canvas.getBoundingClientRect(), s = this.scale;
      return { x: (cx - r.left - this.w / 2) / s + this.cam.x, y: (cy - r.top - this.h / 2) / s + this.cam.y };
    }
    toScreen(x, y) { const s = this.scale; return { x: (x - this.cam.x) * s + this.w / 2, y: (y - this.cam.y) * s + this.h / 2 }; }
    zoomAt(p, f) {
      const z = CH.util.clamp(this.cam.zoom * f, 1, 3.2);
      const k = this.cam.zoom / z;
      this.cam.x = p.x - (p.x - this.cam.x) * k; this.cam.y = p.y - (p.y - this.cam.y) * k; this.cam.zoom = z;
      this.clamp();
    }
    down(e) {
      this.canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; this.drag = null; return; }
      this.drag = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, owned: false, type: e.pointerType, shift: e.shiftKey, button: e.button };
    }
    move(e) {
      const p = this.pointers.get(e.pointerId);
      if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomAt(this.toWorld((a.x + b.x) / 2, (a.y + b.y) / 2), d / this.pinch.d); this.pinch.d = d;
        return;
      }
      const w = this.toWorld(e.clientX, e.clientY);
      if (!this.drag) { if (e.pointerType === 'mouse' && this.handler && this.handler.hover) this.handler.hover(w); return; }
      const dr = this.drag;
      if (!dr.moved && Math.hypot(e.clientX - dr.sx, e.clientY - dr.sy) > 7) {
        dr.moved = true;
        const start = this.toWorld(dr.sx, dr.sy);
        dr.owned = !!(this.handler && this.handler.dragStart && this.handler.dragStart(start, e));
      }
      if (dr.moved) {
        if (dr.owned) this.handler.dragMove(w, e);
        else { const s = this.scale; this.cam.x -= (e.clientX - dr.lx) / s; this.cam.y -= (e.clientY - dr.ly) / s; this.clamp(); }
      }
      dr.lx = e.clientX; dr.ly = e.clientY;
      if (e.pointerType === 'mouse' && this.handler && this.handler.hover) this.handler.hover(w);
    }
    up(e) {
      this.pointers.delete(e.pointerId);
      if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; this.drag = null; return; }
      const dr = this.drag; this.drag = null;
      if (!dr || dr.button === 2) return;
      const w = this.toWorld(e.clientX, e.clientY);
      if (dr.moved && dr.owned) this.handler.dragEnd(w, e);
      else if (!dr.moved && this.handler && this.handler.tap) this.handler.tap(w, { pointerType: dr.type, shiftKey: e.shiftKey });
    }
    begin(shake = 0, kind = 'forest', pal = null) {
      const c = this.ctx, s = this.scale * this.dpr;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#16210f'; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
      const sx = shake ? (Math.random() - 0.5) * shake * 10 : 0, sy = shake ? (Math.random() - 0.5) * shake * 10 : 0;
      c.setTransform(s, 0, 0, s, (this.w / 2 - this.cam.x * this.scale + sx) * this.dpr, (this.h / 2 - this.cam.y * this.scale + sy) * this.dpr);
      c.fillStyle = filler(c, kind, pal);
      c.fillRect(-WW * 2, -WH * 2, WW * 5, WH * 5);
      return c;
    }
  }

  /* ---------------- Shared helpers ---------------- */
  function wallLinks(list, isAlive) {
    const map = new Map();
    for (const b of list) if (CH.BUILDINGS[b.type].cat === 'wall' && isAlive(b)) map.set(b.tx + ',' + b.ty, b);
    const links = new Map();
    for (const [k, b] of map) {
      let m = 0;
      if (map.has((b.tx + 1) + ',' + b.ty)) m |= 1; if (map.has(b.tx + ',' + (b.ty + 1))) m |= 2;
      if (map.has((b.tx - 1) + ',' + b.ty)) m |= 4; if (map.has(b.tx + ',' + (b.ty - 1))) m |= 8;
      links.set(b, m);
    }
    return links;
  }
  function hpBar(c, x, y, w, f, col) { A.rect(c, x - 1, y - 1, w + 2, 5, 'rgba(10,10,20,0.75)'); A.rect(c, x, y, w * f, 3, col); }
  function rangeRing(c, x, y, r, min) {
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = 'rgba(255,230,150,0.10)'; c.fill();
    c.setLineDash([7, 5]); c.strokeStyle = 'rgba(255,230,150,0.8)'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
    if (min) { c.beginPath(); c.arc(x, y, min, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,120,100,0.7)'; c.stroke(); }
  }

  /* ---------------- Home scene ---------------- */
  function drawHome(view, save, ui, time) {
    const c = view.begin(0, 'forest');
    const cl = CH.State.castleLevel(save), area = CH.State.area(save);
    c.drawImage(terrain('home' + cl, { area, seed: 11 + cl }), 0, 0);
    const list = save.buildings.slice().sort((a, b) => (a.ty + CH.BUILDINGS[a.type].size) - (b.ty + CH.BUILDINGS[b.type].size) || a.tx - b.tx);
    const links = wallLinks(save.buildings, b => b.level > 0 && !(ui.moving && ui.moving.id === b.id));
    const now = Date.now();
    if (ui.selected) {
      const b = ui.selected, s = CH.BUILDINGS[b.type].size * T;
      c.fillStyle = 'rgba(255,220,120,0.22)'; c.fillRect(b.tx * T, b.ty * T, s, s);
    }
    for (const b of list) {
      if (ui.moving && ui.moving.id === b.id) continue;
      const d = CH.BUILDINGS[b.type];
      const fill = d.cat === 'storage' ? Math.min(1, save.res[d.res] / CH.State.capacity(save, d.res)) : null;
      A.drawBuilding(c, b, { time, links: links.get(b) || 0, constructing: !!b.job && b.job.kind !== 'clear', fill, angle: -0.6 + Math.sin(time * 0.5 + b.id) * 0.4 });
    }
    // overlays: timers, collect bubbles
    for (const b of save.buildings) {
      const d = CH.BUILDINGS[b.type], s = d.size * T, cx = b.tx * T + s / 2;
      if (b.job) {
        const f = CH.util.clamp(1 - (b.job.ends - now) / 1000 / b.job.total, 0, 1);
        hpBar(c, cx - 22, b.ty * T - 12, 44, f, '#7fd36a');
        c.font = '700 10px system-ui, sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.7)';
        const txt = CH.util.time((b.job.ends - now) / 1000); c.strokeText(txt, cx, b.ty * T - 16); c.fillStyle = '#fff'; c.fillText(txt, cx, b.ty * T - 16);
      } else if (d.cat === 'econ' && b.level > 0 && b.buf >= Math.max(10, d.buf(b.level) * 0.08)) {
        const y = b.ty * T - 10 + Math.sin(time * 3 + b.id) * 2;
        A.circle(c, cx, y, 10, 'rgba(20,24,40,0.85)'); A.circle(c, cx, y, 8.5, d.res === 'gold' ? '#f2c94a' : d.res === 'wood' ? '#b8803e' : '#bdb8ae');
        if (b.buf >= d.buf(b.level) * 0.999) { c.beginPath(); c.arc(cx, y, 11, 0, Math.PI * 2); c.strokeStyle = '#ffdf6a'; c.lineWidth = 2; c.stroke(); }
      }
    }
    if (ui.selected && CH.BUILDINGS[ui.selected.type].atk && !ui.moving) {
      const b = ui.selected, d = CH.BUILDINGS[b.type], cx = (b.tx + d.size / 2) * T, cy = (b.ty + d.size / 2) * T;
      rangeRing(c, cx, cy, d.atk.range * T, (d.atk.min || 0) * T);
    }
    if (ui.ghost) {
      const g = ui.ghost, d = CH.BUILDINGS[g.type], s = d.size * T;
      c.fillStyle = g.valid ? 'rgba(120,255,140,0.35)' : 'rgba(255,80,80,0.4)'; c.fillRect(g.tx * T, g.ty * T, s, s);
      c.strokeStyle = g.valid ? '#8dff9a' : '#ff8080'; c.lineWidth = 2; c.strokeRect(g.tx * T + 1, g.ty * T + 1, s - 2, s - 2);
      A.drawBuilding(c, { type: g.type, level: g.level || 1, tx: g.tx, ty: g.ty }, { time, ghost: true, links: 0 });
      if (d.atk) rangeRing(c, (g.tx + d.size / 2) * T, (g.ty + d.size / 2) * T, d.atk.range * T, (d.atk.min || 0) * T);
    }
    for (const f of ui.floaters) {
      c.globalAlpha = Math.min(1, f.life); c.font = '800 14px system-ui, sans-serif'; c.textAlign = 'center';
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.strokeText(f.text, f.x, f.y); c.fillStyle = f.color; c.fillText(f.text, f.x, f.y);
    }
    c.globalAlpha = 1;
  }

  /* ---------------- Battle scene ---------------- */
  function battleTerrain(b) {
    if (b.mode === 'campaign') {
      const st = b.stage, reg = st.region;
      return terrain('camp' + st.id, { pal: reg.pal, roads: b.roads.map(r => r.pts), decor: reg.decor, seed: 300 + st.gi, blockedDecor: b.decor, keepOut: (tx, ty) => b.road[ty * C.COLS + tx] || b.nearRoad(tx, ty, 1) || b.occ[ty * C.COLS + tx] || tx > 18 });
    }
    if (b.mode === 'siege' && b.homeTerrain) { const cl = Math.min(8, b.opponent.cl); const [w, h] = C.AREA[cl - 1]; return terrain('home' + cl, { area: { x: Math.floor((C.COLS - w) / 2), y: Math.floor((C.ROWS - h) / 2), w, h }, seed: 11 + cl }); }
    if (b.mode === 'raid' || b.mode === 'siege') { const cl = Math.min(8, b.opponent.cl); return terrain('raid' + cl, { area: (() => { const [w, h] = C.AREA[cl - 1]; return { x: Math.floor((C.COLS - w) / 2), y: Math.floor((C.ROWS - h) / 2), w, h }; })(), seed: 50 + cl }); }
    const cl = CH.State.castleLevel(b.save);
    return terrain('home' + cl, { area: CH.State.area(b.save), seed: 11 + cl });
  }

  function drawBattle(view, b, ui, time) {
    const c = b.mode === 'campaign' ? view.begin(b.shake, b.stage.region.decor, b.stage.region.pal) : view.begin(b.shake, 'forest');
    c.drawImage(battleTerrain(b), 0, 0);
    // Raid deploy restriction overlay.
    if (ui.deployMode && b.mode === 'raid') {
      c.fillStyle = 'rgba(255,60,60,0.16)';
      for (let ty = 0; ty < C.ROWS; ty++) for (let tx = 0; tx < C.COLS; tx++) if (!b.canDeploy((tx + 0.5) * T, (ty + 0.5) * T)) c.fillRect(tx * T, ty * T, T, T);
    }
    if (ui.placeTower && b.mode === 'campaign' && ui.hoverTile) {
      const { tx, ty } = ui.hoverTile, ok = b.canPlaceTower(tx, ty);
      c.fillStyle = ok ? 'rgba(120,255,140,0.35)' : 'rgba(255,80,80,0.4)'; c.fillRect(tx * T, ty * T, 2 * T, 2 * T);
      A.drawBuilding(c, { type: ui.placeTower, level: b.towerBase[ui.placeTower], tx, ty }, { time, ghost: true });
      rangeRing(c, (tx + 1) * T, (ty + 1) * T, CH.BUILDINGS[ui.placeTower].atk.range * T, (CH.BUILDINGS[ui.placeTower].atk.min || 0) * T);
    }
    for (const a of b.areas) {
      const col = a.kind === 'fire' ? '255,110,40' : a.kind === 'heal' ? '255,220,120' : '255,70,150';
      A.glow(c, a.x, a.y, a.r, col, 0.35); c.beginPath(); c.arc(a.x, a.y, a.r, 0, Math.PI * 2); c.strokeStyle = 'rgba(' + col + ',0.7)'; c.lineWidth = 2; c.stroke();
    }
    const links = wallLinks(b.buildings, x => !x.dead);
    const ents = [];
    for (const bd of b.buildings) ents.push({ y: (bd.ty + bd.size) * T, b: bd });
    for (const u of b.units) if (!u.flying) ents.push({ y: u.y, u });
    ents.sort((p, q) => p.y - q.y);
    for (const e of ents) {
      if (e.b) {
        const bd = e.b;
        if (bd.dead) {
          if (bd.def.cat === 'trap') { A.ell(c, bd.cx, bd.cy, 9, 5, 'rgba(30,20,10,0.5)'); continue; }
          rubble(c, bd); continue;
        }
        A.drawBuilding(c, bd, { time, links: links.get(bd) || 0, angle: bd.angle, anim: bd.anim > 0 ? bd.anim / 0.2 : 0, hidden: bd.hidden, armed: bd.armed, frozen: bd.frozen > 0, hit: bd.hit > 0, fill: 0.7 });
        if (bd.hp < bd.maxHp && bd.def.cat !== 'trap') hpBar(c, bd.x + 4, bd.y - 6, bd.size * T - 8, bd.hp / bd.maxHp, b.mode === 'raid' ? '#e86a4a' : '#6fd36a');
        if (ui.selectedB === bd) rangeRing(c, bd.cx, bd.cy, bd.atk ? bd.atk.range : 0, bd.atk ? bd.atk.min : 0);
      } else A.drawUnit(c, e.u, e.u.side === b.playerSide, time);
    }
    for (const u of b.units) if (u.flying) A.drawUnit(c, u, u.side === b.playerSide, time);
    drawProjectiles(c, b);
    drawFx(c, b);
    if (ui.spellAim && ui.pointer) {
      const r = CH.SPELLS[ui.spellAim].radius * T;
      c.beginPath(); c.arc(ui.pointer.x, ui.pointer.y, r, 0, Math.PI * 2); c.fillStyle = 'rgba(255,240,170,0.15)'; c.fill();
      c.setLineDash([6, 5]); c.strokeStyle = 'rgba(255,240,170,0.9)'; c.lineWidth = 2; c.stroke(); c.setLineDash([]);
    }
  }
  function rubble(c, b) {
    const s = b.size * T;
    if (b.def.cat === 'wall') { A.ell(c, b.cx, b.cy + 4, 9, 5, 'rgba(90,80,70,0.7)'); return; }
    A.rrect(c, b.x + 4, b.y + 6, s - 8, s - 10, 6, 'rgba(50,40,32,0.55)');
    for (let i = 0; i < b.size * 4; i++) { const k = (b.id * 31 + i * 17) % 100 / 100, k2 = (b.id * 13 + i * 29) % 100 / 100; A.rect(c, b.x + 6 + k * (s - 14), b.y + 8 + k2 * (s - 16), 5, 4, i % 2 ? '#8a7e6a' : '#6a5e4a'); }
  }
  function drawProjectiles(c, b) {
    for (const p of b.proj) {
      switch (p.kind) {
        case 'arrow': { const a = p.a || 0; A.line(c, p.x - Math.cos(a) * 11, p.y - Math.sin(a) * 11, p.x, p.y, '#d9b16a', 1.6); A.line(c, p.x - Math.cos(a) * 2, p.y - Math.sin(a) * 2, p.x + Math.cos(a) * 2, p.y + Math.sin(a) * 2, '#eee', 2.2); break; }
        case 'rock': A.circle(c, p.x, p.y, 5, '#8a7e6a'); A.circle(c, p.x - 1.5, p.y - 1.5, 1.8, '#b8ae9a'); break;
        case 'ball': A.circle(c, p.x, p.y, 4.5, '#1c1b20'); A.circle(c, p.x - 1.5, p.y - 1.5, 1.5, 'rgba(255,255,255,0.4)'); break;
        case 'orb': A.glow(c, p.x, p.y, 12, '190,150,255', 0.8); A.circle(c, p.x, p.y, 3, '#fff'); break;
        case 'frost': A.glow(c, p.x, p.y, 11, '170,225,255', 0.85); A.circle(c, p.x, p.y, 3, '#fff'); break;
        case 'fire': A.glow(c, p.x, p.y, 12, '255,130,40', 0.85); A.circle(c, p.x, p.y, 3, '#ffe9a0'); break;
        case 'shadow': A.glow(c, p.x, p.y, 11, '140,90,230', 0.8); A.circle(c, p.x, p.y, 2.8, '#9effa8'); break;
        case 'bolt': { const a = p.a || 0; A.line(c, p.x - Math.cos(a) * 18, p.y - Math.sin(a) * 18, p.x, p.y, '#6b4a2a', 3); A.line(c, p.x - Math.cos(a) * 3, p.y - Math.sin(a) * 3, p.x + Math.cos(a) * 3, p.y + Math.sin(a) * 3, '#ddd', 4); break; }
        case 'shell': A.ell(c, p.x, p.y, 5, 2.5, 'rgba(0,0,0,0.3)'); A.circle(c, p.x, p.y - p.z, 5.5, '#1c1b20'); A.circle(c, p.x + 3, p.y - p.z - 5, 1.6, Math.random() > 0.5 ? '#ffd04a' : '#ff7a2a'); break;
      }
    }
  }
  function drawFx(c, b) {
    for (const f of b.fx) {
      const t = f.life / f.max;
      switch (f.kind) {
        case 'spark': c.globalAlpha = t; A.circle(c, f.x, f.y, f.size * (0.5 + t * 0.5), f.color); break;
        case 'smoke': c.globalAlpha = t * 0.6; A.circle(c, f.x, f.y, f.size * (1.6 - t * 0.6), f.color); break;
        case 'ring': c.globalAlpha = t; c.beginPath(); c.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * (1 - t), 0, Math.PI * 2); c.strokeStyle = f.color; c.lineWidth = f.w * t + 0.5; c.stroke(); break;
        case 'flash': c.globalAlpha = 1; A.glow(c, f.x, f.y, f.r, f.color, 0.6 * t); break;
        case 'bolt': {
          c.globalAlpha = t; c.beginPath(); c.moveTo(f.pts[0].x, f.pts[0].y);
          for (let i = 1; i < f.pts.length; i++) { const a = f.pts[i - 1], q = f.pts[i]; for (let k = 1; k < 4; k++) c.lineTo(a.x + (q.x - a.x) * k / 4 + (Math.random() - 0.5) * 10, a.y + (q.y - a.y) * k / 4 + (Math.random() - 0.5) * 10); c.lineTo(q.x, q.y); }
          c.strokeStyle = f.color; c.lineWidth = 2.5; c.lineJoin = 'round'; c.stroke(); break;
        }
        case 'beam': { c.globalAlpha = t; c.beginPath(); c.moveTo(f.x0, f.y0); c.lineTo(f.x, f.y); c.strokeStyle = 'rgba(' + f.color + ',0.9)'; c.lineWidth = 10 * t + 2; c.lineCap = 'round'; c.stroke(); A.glow(c, f.x, f.y, 40, f.color, 0.7 * t); break; }
        case 'text': c.globalAlpha = Math.min(1, t * 2); c.font = '700 12px system-ui, sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.strokeText(f.text, f.x, f.y); c.fillStyle = f.color; c.fillText(f.text, f.x, f.y); break;
      }
    }
    c.globalAlpha = 1;
  }

  /** Mini map of a layout (raid target previews, campaign stage previews). */
  function layoutPreview(cv, layout, opts = {}) {
    const ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    cv.width = w * dpr; cv.height = h * dpr;
    const sc = Math.min(w / WW, h / WH) * dpr;
    ctx.setTransform(sc, 0, 0, sc, (w * dpr - WW * sc) / 2, (h * dpr - WH * sc) / 2);
    ctx.drawImage(opts.terrain || terrain('raid' + (opts.cl || 1), { area: opts.area, seed: 50 + (opts.cl || 1) }), 0, 0);
    const list = layout.slice().sort((a, b) => a.ty - b.ty);
    const links = wallLinks(list, () => true);
    for (const b of list) if (CH.BUILDINGS[b.type].cat !== 'trap') A.drawBuilding(ctx, b, { time: 1, links: links.get(b) || 0, fill: 0.8 });
  }

  return { View, drawHome, drawBattle, layoutPreview, terrain, WW, WH };
})();
