/* =====================================================================
 * Eldoria — render/worldview.js
 * The world map: a cached overview image of the biomes plus per-tile
 * detail when zoomed in, entity icons, labels and marching armies.
 * Coordinates: tiles (x, y); 1 tile = TW world pixels.
 * ===================================================================== */
CH.WorldView = (function () {
  const TW = 48, A = CH.Art;
  const BIOME = { green: ['#5a9a48', '#4e8a3e', '#69a854'], mountain: ['#8a7f6c', '#7a705e', '#9a8e7a'], swamp: ['#3f5e4a', '#35503f', '#4a6a54'],
    snow: ['#dfe8f2', '#cfdbe8', '#eef4fa'], dark: ['#4a4258', '#3e374b', '#574e66'], lava: ['#5a342a', '#4a2a22', '#6a3e30'] };

  class WorldView {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.cam = { x: 0, y: 0, zoom: 0.6 }; this.dpr = 1; this.handler = null; this.pointers = new Map(); this.drag = null;
      canvas.addEventListener('pointerdown', e => this.down(e));
      canvas.addEventListener('pointermove', e => this.move(e));
      canvas.addEventListener('pointerup', e => this.up(e));
      canvas.addEventListener('pointercancel', e => { this.pointers.delete(e.pointerId); this.drag = null; this.pinch = null; });
      canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoomAt(this.toWorld(e.clientX, e.clientY), e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    }
    resize() {
      const r = this.canvas.parentElement.getBoundingClientRect();
      this.dpr = Math.min(2, window.devicePixelRatio || 1); this.w = r.width; this.h = r.height;
      this.canvas.width = Math.round(r.width * this.dpr); this.canvas.height = Math.round(r.height * this.dpr);
      this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px';
    }
    center(x, y) { this.cam.x = (x + 0.5) * TW; this.cam.y = (y + 0.5) * TW; this.clamp(); }
    clamp() { const N = CH.CONFIG.WORLD_SIZE * TW; this.cam.x = CH.util.clamp(this.cam.x, 0, N); this.cam.y = CH.util.clamp(this.cam.y, 0, N); }
    toWorld(cx, cy) { const r = this.canvas.getBoundingClientRect(), z = this.cam.zoom; return { x: (cx - r.left - this.w / 2) / z + this.cam.x, y: (cy - r.top - this.h / 2) / z + this.cam.y }; }
    toScreen(x, y) { const z = this.cam.zoom; return { x: (x - this.cam.x) * z + this.w / 2, y: (y - this.cam.y) * z + this.h / 2 }; }
    zoomAt(p, f) { const z = CH.util.clamp(this.cam.zoom * f, 0.12, 1.8), k = this.cam.zoom / z; this.cam.x = p.x - (p.x - this.cam.x) * k; this.cam.y = p.y - (p.y - this.cam.y) * k; this.cam.zoom = z; this.clamp(); }
    down(e) {
      this.canvas.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; this.drag = null; return; }
      this.drag = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
    }
    move(e) {
      const p = this.pointers.get(e.pointerId); if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (this.pinch && this.pointers.size === 2) { const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y); this.zoomAt(this.toWorld((a.x + b.x) / 2, (a.y + b.y) / 2), d / this.pinch.d); this.pinch.d = d; return; }
      const dr = this.drag; if (!dr) return;
      if (!dr.moved && Math.hypot(e.clientX - dr.sx, e.clientY - dr.sy) > 7) dr.moved = true;
      if (dr.moved) { this.cam.x -= (e.clientX - dr.lx) / this.cam.zoom; this.cam.y -= (e.clientY - dr.ly) / this.cam.zoom; this.clamp(); }
      dr.lx = e.clientX; dr.ly = e.clientY;
    }
    up(e) {
      this.pointers.delete(e.pointerId);
      if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; this.drag = null; return; }
      const dr = this.drag; this.drag = null;
      if (dr && !dr.moved && this.handler) { const w = this.toWorld(e.clientX, e.clientY); this.handler.tap(w.x / TW, w.y / TW); }
    }

    /** Biome overview image, 8px per tile, built once per world seed. */
    overview(w) {
      if (this.ov && this.ovSeed === w.seed) return this.ov;
      const N = CH.CONFIG.WORLD_SIZE, P = 8, cv = document.createElement('canvas'); cv.width = cv.height = N * P;
      const c = cv.getContext('2d'), rnd = CH.util.rng(w.seed);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const pal = BIOME[CH.World.biomeAt(x, y, w.seed)];
        c.fillStyle = pal[Math.floor(rnd() * 3)]; c.fillRect(x * P, y * P, P, P);
      }
      for (let i = 0; i < 2600; i++) {
        const x = rnd() * N, y = rnd() * N, b = CH.World.biomeAt(Math.floor(x), Math.floor(y), w.seed);
        c.fillStyle = b === 'green' ? 'rgba(30,70,25,0.45)' : b === 'snow' ? 'rgba(255,255,255,0.7)' : b === 'lava' ? 'rgba(255,110,40,0.5)' : b === 'swamp' ? 'rgba(20,40,30,0.5)' : 'rgba(0,0,0,0.18)';
        c.beginPath(); c.arc(x * P, y * P, 1.5 + rnd() * 2.5, 0, 6.283); c.fill();
      }
      // Rivers of the realm: a few soft curves for flavour.
      c.strokeStyle = 'rgba(80,140,200,0.55)'; c.lineWidth = 6;
      for (let r = 0; r < 3; r++) { c.beginPath(); let x = rnd() * N * P, y = 0; c.moveTo(x, y); for (let i = 0; i < 12; i++) { x += (rnd() - 0.5) * 120; y += N * P / 12; c.lineTo(x, y); } c.stroke(); }
      this.ov = cv; this.ovSeed = w.seed;
      return cv;
    }

    draw(s, ui) {
      const w = s.world, c = this.ctx, z = this.cam.zoom, now = ui.now, N = CH.CONFIG.WORLD_SIZE;
      c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0b1028'; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
      const k = z * this.dpr;
      c.setTransform(k, 0, 0, k, (this.w / 2 - this.cam.x * z) * this.dpr, (this.h / 2 - this.cam.y * z) * this.dpr);
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.drawImage(this.overview(w), 0, 0, N * TW, N * TW);
      const x0 = Math.max(0, Math.floor((this.cam.x - this.w / 2 / z) / TW) - 1), x1 = Math.min(N, Math.ceil((this.cam.x + this.w / 2 / z) / TW) + 1);
      const y0 = Math.max(0, Math.floor((this.cam.y - this.h / 2 / z) / TW) - 1), y1 = Math.min(N, Math.ceil((this.cam.y + this.h / 2 / z) / TW) + 1);
      const vis = o => o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1;
      // Detail scenery when zoomed in.
      if (z > 0.45) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        if (h % 7 > 1) continue;
        const b = CH.World.biomeAt(x, y, w.seed), px = x * TW + (h % 20), py = y * TW + ((h >> 5) % 20);
        if (b === 'green') { A.circle(c, px + 10, py + 10, 9, '#3e7a32'); A.circle(c, px + 16, py + 6, 7, '#4a8a3a'); }
        else if (b === 'snow') A.poly(c, [px + 2, py + 22, px + 12, py, px + 22, py + 22], '#2f5a4a');
        else if (b === 'mountain') A.poly(c, [px, py + 24, px + 12, py + 2, px + 24, py + 24], '#6a6258');
        else if (b === 'lava') A.circle(c, px + 10, py + 10, 6, '#ff6a2a');
        else if (b === 'dark') A.poly(c, [px + 6, py + 20, px + 10, py + 2, px + 14, py + 20], '#2a2436');
        else A.ell(c, px + 12, py + 12, 10, 5, '#2a4a3a');
      }
      const f = ui.filters;
      if (f.res) for (const t of w.tiles) if (vis(t)) this.resTile(c, t);
      if (f.mon) { for (const m of w.camps) if (vis(m) && !m.dead) this.camp(c, m); for (const r of w.ruins) if (vis(r) && !r.dead) this.ruin(c, r); if (w.dragon) this.dragonIcon(c, w.dragon, now); }
      for (const fo of w.forts) if (vis(fo)) this.fort(c, fo);
      if (w.throne) this.citadel(c, w.throne, now, s);
      if (w.inv) for (const sh of w.inv.ships) this.ship(c, sh, w.inv.id, now);
      { const id = CH.REALM_ORDER.find(r => CH.Realm.window(r, now).active); if (id && w.throne) this.portal(c, w.throne.x + 6, w.throne.y - 5, id, now); }
      const pPow = CH.State.power(s);
      if (f.kin) for (const k2 of w.kingdoms) if (vis(k2) && this.passDiff(f.diff, CH.World.power(k2), pPow)) this.kingdom(c, k2, now, false);
      this.kingdom(c, { x: w.px, y: w.py, cl: CH.State.castleLevel(s), f: s.faction, sh: s.shieldUntil, name: s.player.name, burn: w.pburn, smoke: w.psmoke, skin: s.equipped && s.equipped.castle }, now, true);
      // Marches
      for (const m of w.marches) {
        const mine = m.owner === 'player', hostile = m.target && m.target.type === 'player', inv = m.kind === 'invade';
        if (!mine && !hostile && z < 0.3) continue;
        const col = mine ? '#5fb0ff' : inv ? (CH.Invasion.KINDS[m.inv] || {}).color || '#5fffa0' : hostile ? '#ff5a4a' : 'rgba(230,230,230,0.55)';
        const sx = (m.fx + 0.5) * TW, sy = (m.fy + 0.5) * TW, ex = (m.tx + 0.5) * TW, ey = (m.ty + 0.5) * TW;
        const p = m.kind === 'gathering' ? 1 : CH.util.clamp((now - m.t0) / (m.t1 - m.t0), 0, 1);
        c.save(); c.setLineDash([10, 8]); c.lineDashOffset = -now / 40; c.strokeStyle = col; c.lineWidth = (mine || hostile ? 3 : 1.5) / Math.max(0.5, z);
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke(); c.restore();
        const mx = sx + (ex - sx) * p, my = sy + (ey - sy) * p, r = (mine || hostile ? 9 : 6) / Math.max(0.5, z);
        A.circle(c, mx, my, r + 2 / z, 'rgba(0,0,0,0.5)'); A.circle(c, mx, my, r, col);
        if (m.kind === 'scout') A.circle(c, mx, my, r * 0.4, '#fff');
        else { const a = Math.atan2(ey - sy, ex - sx); A.poly(c, [mx + Math.cos(a) * r * 0.7, my + Math.sin(a) * r * 0.7, mx + Math.cos(a + 2.4) * r * 0.6, my + Math.sin(a + 2.4) * r * 0.6, mx + Math.cos(a - 2.4) * r * 0.6, my + Math.sin(a - 2.4) * r * 0.6], '#fff'); }
      }
      if (ui.selected) {
        const sx = (ui.selected.x + 0.5) * TW, sy = (ui.selected.y + 0.5) * TW;
        c.beginPath(); c.arc(sx, sy, 34, 0, 6.283); c.strokeStyle = '#ffe08a'; c.lineWidth = 3 / Math.max(0.6, z); c.setLineDash([8, 6]); c.lineDashOffset = now / 60; c.stroke(); c.setLineDash([]);
      }
      if (ui.teleport) {
        const ok = !CH.World.canTeleport(s, ui.teleport.x, ui.teleport.y);
        c.fillStyle = ok ? 'rgba(120,255,140,0.35)' : 'rgba(255,80,80,0.4)'; c.fillRect((ui.teleport.x - 0.5) * TW, (ui.teleport.y - 0.5) * TW, TW * 2, TW * 2);
      }
      // Screen-space labels
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (z > 0.32) {
        c.textAlign = 'center'; c.font = '800 11px Nunito, system-ui, sans-serif';
        const label = (x, y, txt, col, dy) => { const p = this.toScreen((x + 0.5) * TW, (y + 0.5) * TW + dy); c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.strokeText(txt, p.x, p.y); c.fillStyle = col; c.fillText(txt, p.x, p.y); };
        if (f.kin) for (const k2 of w.kingdoms) if (vis(k2) && this.passDiff(f.diff, CH.World.power(k2), pPow)) label(k2.x, k2.y, (k2.nemesis ? '☠ ' : k2.truceUntil > now ? '🕊 ' : '') + k2.name + ' · ' + CH.util.fmt(CH.World.power(k2)), k2.nemesis ? '#ff5a4a' : k2.sh > now ? '#9fd4ff' : CH.FACTIONS[k2.f].color, 34);
        label(w.px, w.py, '★ ' + s.player.name + (CH.Meta.titleOf(s) ? ' «' + CH.Meta.titleOf(s) + '»' : ''), '#ffe08a', 36);
        if (w.throne) { const th = w.throne, war = th.war && !th.war.ended && now < th.war.end ? th.war : null;
          label(th.x, th.y, '👑 ' + CH.THRONE.name, '#ffe9a8', 92);
          label(th.x, th.y, war ? '⚔ Held by ' + CH.Throne.keyName(s, war.holder) : th.king ? 'King: ' + CH.Throne.kingName(s) : 'No king', war ? '#ff9a8a' : '#e8f0ff', 108); }
        if (z > 0.6 && f.mon) for (const m of w.camps) if (vis(m) && !m.dead) label(m.x, m.y, 'Lv ' + m.lvl, '#ffb3a8', 24);
        if (z > 0.6 && f.res) for (const t of w.tiles) if (vis(t)) label(t.x, t.y, 'Lv ' + t.lvl, '#e8f2d8', 22);
      }
    }
    /** Realm portal next to the Citadel while a Realm Conquest is open. */
    portal(c, x0, y0, id, now) {
      const R = CH.REALMS[id], x = (x0 + 0.5) * TW, y = (y0 + 0.5) * TW, t = now / 1000;
      const rgb = { alien: '120,255,170', hell: '255,110,60', heaven: '255,236,160' }[id];
      c.save(); c.translate(x, y);
      c.globalCompositeOperation = 'lighter'; A.glow(c, 0, 0, 80, rgb, 0.45); c.globalCompositeOperation = 'source-over';
      A.rect(c, -34, -10, 10, 50, '#d8d0bc'); A.rect(c, 24, -10, 10, 50, '#d8d0bc'); A.rect(c, -38, -16, 76, 10, '#e8e0cc');
      for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(0, 14, 22 - i * 4, 26 - i * 5, 0, 0, 6.283); c.strokeStyle = 'rgba(' + rgb + ',' + (0.9 - i * 0.15) + ')'; c.lineWidth = 4; c.setLineDash([10, 6]); c.lineDashOffset = (i % 2 ? 1 : -1) * t * 40; c.stroke(); }
      c.setLineDash([]); c.font = '900 22px system-ui'; c.textAlign = 'center'; c.fillText(R.icon, 0, 22);
      c.restore();
    }
    /** Invasion mothership (aliens) or hell portal (demons). */
    ship(c, sh, kind, now) {
      const x = (sh.x + 0.5) * TW, y = (sh.y + 0.5) * TW, t = now / 1000;
      c.save(); c.translate(x, y);
      if (CH.Invasion.KINDS[kind].ship === 'saucer') {
        c.globalCompositeOperation = 'lighter'; A.poly(c, [-22, 0, 22, 0, 40, 70, -40, 70], 'rgba(120,255,170,' + (0.18 + Math.sin(t * 3) * 0.06) + ')'); A.glow(c, 0, -30, 70, '120,255,170', 0.3); c.globalCompositeOperation = 'source-over';
        const b = Math.sin(t * 2) * 4;
        A.ell(c, 0, -30 + b, 62, 16, '#8a94a8'); A.ell(c, 0, -34 + b, 48, 10, '#c4ccdc'); A.ell(c, 0, -44 + b, 22, 16, 'rgba(140,255,190,0.9)');
        for (let i = 0; i < 8; i++) A.circle(c, Math.cos(i / 8 * 6.283 + t) * 50, -30 + b + Math.sin(i / 8 * 6.283 + t) * 10, 3, i % 2 ? '#5fffa0' : '#ffe05a');
      } else {
        c.globalCompositeOperation = 'lighter'; A.glow(c, 0, -10, 70, '200,90,255', 0.35); c.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(0, -10, 40 - i * 7, 26 - i * 4, t * (i % 2 ? 1.5 : -1.5), 0, 6.283); c.strokeStyle = i % 2 ? '#c06bff' : '#ff4a6a'; c.lineWidth = 4; c.stroke(); }
        A.ell(c, 0, -10, 12, 8, '#1a0a20');
      }
      c.restore();
    }
    /** The Aurelion Citadel: the Throne of Eldoria. */
    citadel(c, th, now, s) {
      const x = (th.x + 0.5) * TW, y = (th.y + 0.5) * TW, t = now / 1000;
      const war = th.war && !th.war.ended && now < th.war.end;
      c.save(); c.translate(x, y);
      c.globalCompositeOperation = 'lighter'; A.glow(c, 0, -30, 150, war ? '255,90,60' : '255,220,140', 0.28 + Math.sin(t * 1.5) * 0.06); c.globalCompositeOperation = 'source-over';
      A.ell(c, 0, 40, 130, 34, 'rgba(0,0,0,0.35)');
      A.ell(c, 0, 34, 120, 30, '#c9bfa8'); A.ell(c, 0, 26, 104, 25, '#e2dac6'); A.ell(c, 0, 20, 88, 21, '#f2ecdc');
      A.rect(c, -78, -16, 156, 38, '#eee6d2'); for (let i = -78; i < 78; i += 12) A.rect(c, i, -22, 7, 6, '#eee6d2');
      for (const dx of [-80, -40, 40, 80]) { A.rect(c, dx - 10, -50, 20, 72, '#f6f0e2'); A.poly(c, [dx - 13, -50, dx, -76, dx + 13, -50], '#d4a843'); A.circle(c, dx, -78, 3, '#ffe08a'); }
      A.rect(c, -24, -90, 48, 112, '#fbf7ec'); A.poly(c, [-28, -90, 0, -150, 28, -90], '#e8c25a', 'rgba(120,80,10,0.6)', 2);
      A.rect(c, -9, -6, 18, 28, '#3a2614'); A.circle(c, 0, -6, 9, '#3a2614');
      for (const dy of [-70, -45]) A.rect(c, -6, dy, 12, 14, '#7ab8ff');
      const cy = -168 + Math.sin(t * 2) * 5;
      A.poly(c, [-18, cy + 10, -18, cy - 6, -9, cy + 2, 0, cy - 12, 9, cy + 2, 18, cy - 6, 18, cy + 10], '#ffd34a', '#8a5a10', 2);
      for (const dx of [-18, 0, 18]) A.circle(c, dx, cy - (dx ? 7 : 13), 3, '#ff5a5a');
      const hk = war ? th.war.holder : th.king ? th.king.key : null;
      const col = hk === 'player' ? '#5fb0ff' : hk && hk !== 'guard' ? (CH.FACTIONS[(s.world.kingdoms.find(k => k.id === hk) || {}).f] || { color: '#bbb' }).color : '#f2ecdc';
      for (const dx of [-80, 80]) { A.line(c, dx, -78, dx, -104, '#5a3a1a', 2); A.poly(c, [dx, -104, dx + 22, -98 + Math.sin(t * 4 + dx) * 2, dx, -90], col); }
      if (war) { c.beginPath(); c.arc(0, 0, 150 + Math.sin(t * 4) * 6, 0, 6.283); c.strokeStyle = 'rgba(255,80,60,0.7)'; c.lineWidth = 4; c.setLineDash([16, 10]); c.lineDashOffset = -t * 30; c.stroke(); c.setLineDash([]); }
      if (th.burn > now) { A.fireFx(c, -40, 10, 30, t); A.fireFx(c, 40, 10, 30, t + 1); A.fireFx(c, 0, -40, 34, t + 2); }
      else if (th.smoke > now) { A.smokeFx(c, -30, -60, 26, t); A.smokeFx(c, 30, -50, 26, t + 1.5); }
      c.restore();
    }
    passDiff(d, p, mine) { if (!d || d === 'all') return true; const r = p / Math.max(1, mine); return d === 'weak' ? r < 0.8 : d === 'even' ? r >= 0.8 && r <= 1.25 : r > 1.25; }

    kingdom(c, k, now, mine) {
      const x = (k.x + 0.5) * TW, y = (k.y + 0.5) * TW, sc = 0.7 + k.cl * 0.07;
      const sk = k.skin && k.skin !== 'classic' ? CH.SKINS[k.skin] : null;
      const roof = sk ? sk.roof : mine ? '#3a62c9' : k.f != null ? CH.FACTIONS[k.f].color : '#888';
      if (sk) { c.save(); c.globalCompositeOperation = 'lighter'; A.glow(c, x, y - 8 * sc, 46 * sc, sk.aura, 0.3); c.restore(); }
      c.save(); c.translate(x, y); c.scale(sc, sc);
      A.ell(c, 0, 14, 30, 9, 'rgba(0,0,0,0.3)');
      if (mine) { c.beginPath(); c.arc(0, 0, 34, 0, 6.283); c.strokeStyle = '#ffe08a'; c.lineWidth = 3; c.stroke(); }
      const st = sk ? sk.wall : k.cl >= 6 ? '#d9d4c8' : k.cl >= 3 ? '#a9a6a0' : '#9b8f7a';
      A.rect(c, -18, -10, 36, 22, st); for (let i = -18; i < 18; i += 7) A.rect(c, i, -14, 4, 4, st);
      for (const dx of [-18, 18]) { A.rect(c, dx - 6, -22, 12, 34, st); A.poly(c, [dx - 8, -22, dx, -34, dx + 8, -22], roof); }
      A.rect(c, -7, -26, 14, 18, st); A.poly(c, [-9, -26, 0, -42, 9, -26], roof);
      A.rect(c, -4, 3, 8, 9, '#2a1d12');
      A.circle(c, 0, -46, 7, 'rgba(10,14,30,0.85)'); c.font = '900 9px system-ui'; c.textAlign = 'center'; c.fillStyle = '#ffe08a'; c.fillText(k.cl, 0, -43);
      if (k.sh > now) { c.beginPath(); c.arc(0, -6, 30, 0, 6.283); c.fillStyle = 'rgba(120,190,255,0.18)'; c.fill(); c.strokeStyle = 'rgba(160,215,255,0.8)'; c.lineWidth = 2; c.stroke(); }
      if (sk) A.skinParticles(c, sk.fx, 0, -14, 26, now / 1000);
      if (k.burn > now) { A.fireFx(c, -12, 10, 24, now / 1000); A.fireFx(c, 14, 4, 20, now / 1000 + 1.3); }
      else if (k.smoke > now) A.smokeFx(c, 0, -26, 22, now / 1000, 0.6);
      c.restore();
    }
    resTile(c, t) {
      const x = (t.x + 0.5) * TW, y = (t.y + 0.5) * TW;
      const col = { gold: '#f2c94a', wood: '#8a5a2a', stone: '#a9a49a', food: '#c9d84a' }[t.type];
      A.ell(c, x, y + 8, 16, 6, 'rgba(0,0,0,0.25)');
      if (t.type === 'wood') { A.circle(c, x - 6, y - 2, 8, '#2f6a2c'); A.circle(c, x + 6, y - 4, 9, '#367a32'); A.rect(c, x - 1, y + 2, 3, 7, '#5a3a20'); }
      else if (t.type === 'food') { for (let i = -2; i <= 2; i++) A.line(c, x + i * 4, y + 8, x + i * 4 + 1, y - 6, '#c9a83a', 2); }
      else { A.poly(c, [x - 12, y + 8, x - 6, y - 6, x + 4, y - 9, x + 12, y + 8], t.type === 'gold' ? '#7a6a52' : '#8a857a', 'rgba(0,0,0,0.3)', 1); A.circle(c, x - 2, y - 1, 3, col); A.circle(c, x + 4, y + 3, 2.4, col); }
      if (t.by) { A.circle(c, x + 12, y - 10, 5, '#5fb0ff'); }
    }
    camp(c, m) {
      const x = (m.x + 0.5) * TW, y = (m.y + 0.5) * TW;
      const col = { goblinCamp: '#7cb24a', orcCamp: '#8a5a3a', spiderNest: '#3a3a44', skeletonFort: '#d9d2bd', trollHold: '#8fb4d6', dragonLair: '#c2401f' }[m.kind];
      A.ell(c, x, y + 10, 20, 7, 'rgba(0,0,0,0.3)');
      A.poly(c, [x - 16, y + 10, x, y - 14, x + 16, y + 10], col, 'rgba(0,0,0,0.4)', 1.5);
      A.poly(c, [x - 4, y + 10, x, y, x + 4, y + 10], '#2a1d12');
      A.circle(c, x + 13, y - 12, 6.5, 'rgba(20,10,10,0.9)'); A.circle(c, x + 13, y - 12, 4, '#e8e2d0');
    }
    ruin(c, r) {
      const x = (r.x + 0.5) * TW, y = (r.y + 0.5) * TW;
      A.glow(c, x, y, 26, '200,160,255', 0.35);
      for (const dx of [-12, -2, 9]) A.rect(c, x + dx, y - 14 + Math.abs(dx) * 0.4, 5, 22 - Math.abs(dx) * 0.4, '#b8b0a0');
      A.rect(c, x - 14, y + 8, 28, 4, '#8a8478');
    }
    fort(c, f) {
      const x = (f.x + 0.5) * TW, y = (f.y + 0.5) * TW;
      const col = f.owner === 'player' ? '#5fb0ff' : f.ownerF != null ? CH.FACTIONS[f.ownerF].color : '#777';
      A.ell(c, x, y + 14, 26, 8, 'rgba(0,0,0,0.3)');
      A.rect(c, x - 20, y - 6, 40, 20, '#7a7468'); for (let i = -20; i < 20; i += 7) A.rect(c, x + i, y - 10, 4, 4, '#7a7468');
      A.rect(c, x - 6, y - 22, 12, 16, '#6a6458');
      A.line(c, x, y - 22, x, y - 36, '#3a2a1a', 1.5); A.poly(c, [x, y - 36, x + 12, y - 33, x, y - 30], col);
    }
    dragonIcon(c, d, now) {
      const x = (d.x + 0.5) * TW, y = (d.y + 0.5) * TW;
      A.glow(c, x, y, 50 + Math.sin(now / 300) * 6, '255,90,40', 0.45);
      A.circle(c, x, y, 16, '#7a1f1a'); A.poly(c, [x - 30, y - 6, x - 6, y - 4, x - 10, y + 4], '#5a1410'); A.poly(c, [x + 30, y - 6, x + 6, y - 4, x + 10, y + 4], '#5a1410'); A.circle(c, x + 6, y - 4, 2.5, '#ffe05a');
    }
  }
  WorldView.TW = TW;
  return WorldView;
})();
