/* =====================================================================
 * Eldoria — render/art.js
 * All art is drawn in code (2.5D: top-down ground, buildings with height
 * facing the viewer). No image files, no licensing questions.
 * Buildings change look at level tiers 1-2 / 3-5 / 6-8.
 * ===================================================================== */
CH.Art = (function () {
  const TAU = Math.PI * 2, T = CH.CONFIG.T;
  const circle = (c, x, y, r, f) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = f; c.fill(); };
  const ell = (c, x, y, rx, ry, f) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = f; c.fill(); };
  const rect = (c, x, y, w, h, f) => { c.fillStyle = f; c.fillRect(x, y, w, h); };
  const poly = (c, p, f, s, lw) => { c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); if (f) { c.fillStyle = f; c.fill(); } if (s) { c.strokeStyle = s; c.lineWidth = lw || 1; c.stroke(); } };
  const line = (c, a, b, d, e, col, w) => { c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.stroke(); };
  const glow = (c, x, y, r, rgb, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
  const rrect = (c, x, y, w, h, r, f, s) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); if (f) { c.fillStyle = f; c.fill(); } if (s) { c.strokeStyle = s; c.lineWidth = 1.5; c.stroke(); } };
  const tierOf = L => (L <= 2 ? 0 : L <= 5 ? 1 : 2);
  const STONE = ['#9b8f7a', '#a9a6a0', '#d9d4c8'], STONE_D = ['#6d6352', '#77746e', '#a49e90'];
  const TRIM = ['#6b4a2a', '#5a5f6b', '#d4a843'];

  /** A front-facing block building: walls of height wh, gabled roof of height rh. */
  function house(c, cx, by, w, wh, rh, wall, roof, t, opts = {}) {
    rect(c, cx - w / 2, by - wh, w, wh, wall);
    rect(c, cx - w / 2, by - wh, w, 3, 'rgba(0,0,0,0.15)');
    if (opts.beams) { line(c, cx - w / 2 + 2, by - wh, cx - w / 2 + 2, by, 'rgba(60,35,15,0.6)', 2); line(c, cx + w / 2 - 2, by - wh, cx + w / 2 - 2, by, 'rgba(60,35,15,0.6)', 2); }
    poly(c, [cx - w / 2 - 4, by - wh + 1, cx, by - wh - rh, cx + w / 2 + 4, by - wh + 1], roof, 'rgba(0,0,0,0.35)', 1.2);
    poly(c, [cx, by - wh - rh, cx + w / 2 + 4, by - wh + 1, cx, by - wh + 1], 'rgba(0,0,0,0.14)');
    if (opts.door !== false) { c.beginPath(); c.arc(cx, by - 7, 5, Math.PI, 0); c.lineTo(cx + 5, by); c.lineTo(cx - 5, by); c.closePath(); c.fillStyle = '#3a2614'; c.fill(); }
    if (t >= 1) line(c, cx - w / 2 - 4, by - wh + 1, cx + w / 2 + 4, by - wh + 1, TRIM[t], 2);
  }
  function pad(c, x, y, s, t) {
    rrect(c, x + 2, y + 3, s - 4, s - 4, 6, 'rgba(0,0,0,0.25)');
    rrect(c, x + 2, y + 2, s - 4, s - 4, 6, t >= 2 ? '#bdb5a3' : t ? '#a59c88' : '#8f7f62');
    rrect(c, x + 5, y + 5, s - 10, s - 10, 4, t >= 2 ? '#cfc8b8' : t ? '#b6ae9b' : '#9f906f');
  }
  function flag(c, x, y, col, time) { line(c, x, y, x, y - 16, '#4a3420', 1.5); const w = Math.sin(time * 4 + x) * 1.5; poly(c, [x, y - 16, x + 10, y - 14 + w, x, y - 11], col); }
  function stars(c, cx, y, L) { c.font = '700 9px system-ui, sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.65)'; c.strokeText(L, cx, y); c.fillStyle = '#ffe08a'; c.fillText(L, cx, y); }

  /* ---------------- Buildings ---------------- */
  const BLD = {
    castle(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 10;
      pad(c, x, y, s, tt);
      const st = STONE[tt], sd = STONE_D[tt], roof = ['#3b5aa8', '#a83b3b', '#5b3aa8'][tt];
      // back towers
      for (const dx of [-30, 30]) { rect(c, cx + dx - 9, by - 52 - L * 2, 18, 30, sd); poly(c, [cx + dx - 11, by - 52 - L * 2, cx + dx, by - 72 - L * 2, cx + dx + 11, by - 52 - L * 2], roof); }
      // curtain wall
      rect(c, cx - 40, by - 30, 80, 30, st); rect(c, cx - 40, by - 30, 80, 4, 'rgba(0,0,0,0.12)');
      for (let i = -40; i < 40; i += 9) rect(c, cx + i, by - 36, 6, 6, st);
      c.strokeStyle = 'rgba(0,0,0,0.13)'; c.lineWidth = 1;
      for (let r = 0; r < 4; r++) for (let k = -40 + (r % 2) * 5; k < 38; k += 10) c.strokeRect(cx + k, by - 28 + r * 7, 10, 7);
      // keep
      rect(c, cx - 16, by - 56 - L * 3, 32, 28 + L * 3, st);
      for (let i = -16; i < 16; i += 8) rect(c, cx + i, by - 61 - L * 3, 5, 5, st);
      poly(c, [cx - 19, by - 58 - L * 3, cx, by - 84 - L * 4, cx + 19, by - 58 - L * 3], roof, 'rgba(0,0,0,0.35)', 1.2);
      rect(c, cx - 3, by - 46 - L * 3, 6, 8, '#2a1e12');
      if (tt >= 1) { line(c, cx - 40, by - 30, cx + 40, by - 30, TRIM[tt], 2); line(c, cx - 16, by - 56 - L * 3, cx + 16, by - 56 - L * 3, TRIM[tt], 2); }
      // gate
      c.beginPath(); c.arc(cx, by - 10, 8, Math.PI, 0); c.lineTo(cx + 8, by); c.lineTo(cx - 8, by); c.closePath(); c.fillStyle = '#2a1d12'; c.fill();
      for (let i = -6; i <= 6; i += 4) line(c, cx + i, by - 16, cx + i, by, '#6b5233', 1.2);
      // front towers
      for (const dx of [-40, 40]) { rect(c, cx + dx - 8, by - 40, 16, 40, st); rect(c, cx + dx - 8, by - 40, 16, 40, 'rgba(0,0,0,0.06)'); poly(c, [cx + dx - 10, by - 40, cx + dx, by - 56, cx + dx + 10, by - 40], roof, 'rgba(0,0,0,0.3)', 1); }
      flag(c, cx, by - 84 - L * 4, tt === 2 ? '#e2b65c' : '#d4a843', time);
      if (tt === 2) { glow(c, cx, by - 70 - L * 4, 14, '255,215,120', 0.4); }
    },
    builderHut(c, x, y, s, L, t, time) {
      const cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, 0);
      house(c, cx, by, 34, 18, 16, '#b88a55', '#7a4a2a', 0, { beams: true });
      line(c, cx + 16, by - 4, cx + 26, by - 16, '#6b4a2a', 2.5); rect(c, cx + 22, by - 20, 8, 5, '#9a9a9a');
    },
    goldMine(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt);
      poly(c, [x + 6, by, x + 14, by - 26, cx, by - 36 - tt * 3, x + s - 14, by - 26, x + s - 6, by], '#7d6e58', 'rgba(0,0,0,0.3)', 1);
      poly(c, [cx - 9, by, cx - 9, by - 16, cx + 9, by - 16, cx + 9, by], '#2a1d12');
      rect(c, cx - 11, by - 19, 22, 4, TRIM[tt]); rect(c, cx - 11, by - 19, 3, 19, TRIM[tt]); rect(c, cx + 8, by - 19, 3, 19, TRIM[tt]);
      for (let i = 0; i < 4 + tt * 2; i++) circle(c, x + 12 + (i * 9) % (s - 24), by - 22 - (i % 3) * 5, 2, '#ffd34a');
      ell(c, cx + 20, by - 4, 8, 4, '#5a4632'); circle(c, cx + 18, by - 8, 3, '#ffcf3a'); circle(c, cx + 22, by - 8, 3, '#ffdf6a');
      if (Math.sin(time * 3 + x) > 0.85) glow(c, cx - 14, by - 24, 6, '255,240,150', 0.9);
    },
    lumberMill(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt);
      house(c, cx - 4, by, 36, 20 + tt * 3, 16, tt ? '#a07040' : '#b88a55', tt === 2 ? '#3b6a3a' : '#6a4a2a', tt, { beams: true, door: false });
      c.save(); c.translate(cx + 18, by - 20); c.rotate(time * 6);
      circle(c, 0, 0, 9, '#c9ccd2'); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; poly(c, [Math.cos(a) * 9, Math.sin(a) * 9, Math.cos(a + 0.3) * 12, Math.sin(a + 0.3) * 12, Math.cos(a + 0.4) * 8, Math.sin(a + 0.4) * 8], '#9a9da5'); }
      circle(c, 0, 0, 3, '#555'); c.restore();
      for (let i = 0; i < 3; i++) { ell(c, x + 12 + i * 7, by - 3 - (i % 2) * 5, 4, 4, '#8a5a30'); circle(c, x + 12 + i * 7, by - 3 - (i % 2) * 5, 2, '#d8b07a'); }
    },
    stoneQuarry(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt);
      poly(c, [x + 6, by, x + 8, by - 30, cx, by - 38, x + s - 8, by - 28, x + s - 6, by], '#8e8a84', 'rgba(0,0,0,0.3)', 1);
      poly(c, [x + 8, by - 30, cx, by - 38, cx - 4, by - 20, x + 12, by - 16], '#b4b0a8');
      for (let i = 0; i < 2 + tt; i++) rrect(c, x + 10 + i * 13, by - 10, 11, 8, 1, '#c9c4ba', 'rgba(0,0,0,0.3)');
      line(c, x + s - 14, by, x + s - 14, by - 40, '#6b4a2a', 3); line(c, x + s - 14, by - 40, cx - 2, by - 32, '#6b4a2a', 2);
      line(c, cx - 2, by - 32, cx - 2, by - 22 + Math.sin(time * 2) * 3, '#444', 1);
    },
    goldStorage(c, x, y, s, L, t, time, o) { storage(c, x, y, s, L, '#ffd34a', '#b8862a', 'gold', o); },
    woodStorage(c, x, y, s, L, t, time, o) { storage(c, x, y, s, L, '#a8703a', '#6a4422', 'wood', o); },
    stoneStorage(c, x, y, s, L, t, time, o) { storage(c, x, y, s, L, '#c9c4ba', '#8a857c', 'stone', o); },
    barracks(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt);
      house(c, cx, by, 44, 22 + tt * 3, 18, STONE[tt], ['#9a2f2a', '#a82a2a', '#7a1a3a'][tt], tt, { beams: tt === 0 });
      line(c, cx - 7, by - 32 - tt * 3, cx + 7, by - 20 - tt * 3, '#ccc', 2); line(c, cx + 7, by - 32 - tt * 3, cx - 7, by - 20 - tt * 3, '#ccc', 2);
      flag(c, x + 8, by - 6, '#3a62c9', time);
    },
    heroHall(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt + 1);
      for (const dx of [-16, -6, 6, 16]) rect(c, cx + dx - 2, by - 28, 4, 28, '#e8e2d0');
      poly(c, [cx - 24, by - 28, cx, by - 46 - tt * 3, cx + 24, by - 28], '#5a3aa8', 'rgba(0,0,0,0.3)', 1.2);
      rect(c, cx - 24, by - 30, 48, 3, '#d4a843');
      glow(c, cx, by - 38, 10, '255,215,120', 0.5); poly(c, [cx - 6, by - 36, cx - 6, by - 42, cx - 3, by - 39, cx, by - 44, cx + 3, by - 39, cx + 6, by - 42, cx + 6, by - 36], '#ffcf4a');
    },
    lab(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt + 1);
      rect(c, cx - 14, by - 34, 28, 34, STONE[tt]); c.beginPath(); c.arc(cx, by - 34, 15, Math.PI, 0); c.fillStyle = '#4a3a8a'; c.fill();
      for (let i = 0; i < 4; i++) circle(c, cx - 9 + i * 6, by - 40 - (i % 2) * 4, 1, '#ffe9a0');
      const p = 0.5 + Math.sin(time * 3) * 0.3; glow(c, cx + 18, by - 18, 12, '140,255,180', p);
      poly(c, [cx + 15, by - 6, cx + 21, by - 6, cx + 24, by, cx + 12, by], '#8affb4'); rect(c, cx + 16, by - 14, 4, 8, '#cfe');
      rect(c, cx - 4, by - 24, 8, 10, '#2a1e12');
    },
    archerTower(c, x, y, s, L, t, time, o) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8, h = 26 + L * 2; pad(c, x, y, s, tt);
      poly(c, [cx - 12, by, cx - 9, by - h, cx + 9, by - h, cx + 12, by], tt ? STONE[tt] : '#8a5a30', 'rgba(0,0,0,0.35)', 1.2);
      if (!tt) for (let yy = by - 5; yy > by - h; yy -= 6) line(c, cx - 10, yy, cx + 10, yy, 'rgba(40,20,8,0.45)', 1);
      rect(c, cx - 14, by - h - 5, 28, 6, tt ? STONE_D[tt] : '#5e3d22');
      for (let i = -14; i < 14; i += 7) rect(c, cx + i, by - h - 10, 5, 5, tt ? STONE_D[tt] : '#5e3d22');
      if (tt) poly(c, [cx - 15, by - h - 10, cx, by - h - 28, cx + 15, by - h - 10], tt === 2 ? '#2f6a8a' : '#3b8a45', 'rgba(0,0,0,0.3)', 1);
      circle(c, cx, by - h - 12, 3.5, '#e2c39a');
      c.save(); c.translate(cx, by - h - 10); c.rotate(o.angle || -1.2);
      c.beginPath(); c.arc(-(o.anim || 0) * 8, 0, 7, -1.2, 1.2); c.strokeStyle = '#d9b16a'; c.lineWidth = 1.8; c.stroke(); c.restore();
    },
    cannon(c, x, y, s, L, t, time, o) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 10; pad(c, x, y, s, tt);
      ell(c, cx, by - 10, 22, 14, STONE_D[tt]); ell(c, cx, by - 14, 20, 12, STONE[tt]);
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8; rect(c, cx + Math.cos(a) * 18 - 3, by - 14 + Math.sin(a) * 10 - 5, 6, 5, STONE_D[tt]); }
      c.save(); c.translate(cx, by - 18); c.rotate(o.angle || 0); const bl = 18 + L - (o.anim || 0) * 25;
      rect(c, -3, -5 - tt, bl, 10 + tt * 2, '#2b2a2e'); rect(c, bl - 5, -6 - tt, 5, 12 + tt * 2, tt === 2 ? '#d4a843' : '#46444a'); c.restore();
      circle(c, cx, by - 18, 6, '#3a383d');
    },
    mageTower(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8, h = 30 + L * 2.5; pad(c, x, y, s, tt);
      poly(c, [cx - 10, by, cx - 8, by - h, cx + 8, by - h, cx + 8, by, cx + 10, by], ['#cfd5e6', '#d9def0', '#efe9ff'][tt], 'rgba(0,0,0,0.3)', 1.2);
      poly(c, [cx - 13, by - h, cx, by - h - 22 - tt * 4, cx + 13, by - h], ['#3e4fa8', '#5a3aa8', '#7a2aa8'][tt], 'rgba(0,0,0,0.3)', 1);
      const oy = by - h - 30 - tt * 4 + Math.sin(time * 3) * 2;
      glow(c, cx, oy, 14, '170,140,255', 0.6); circle(c, cx, oy, 4.5, '#e0d4ff'); circle(c, cx, oy, 2, '#fff');
      if (tt === 2) for (let i = 0; i < 3; i++) { const a = time * 2 + i * TAU / 3; circle(c, cx + Math.cos(a) * 10, oy + Math.sin(a) * 4, 1.6, '#ffd7ff'); }
    },
    frostTower(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt);
      glow(c, cx, by - 30, 26, '170,225,255', 0.35);
      poly(c, [cx - 14, by, cx - 8, by - 22, cx - 4, by], '#9fd4ff', '#5a8ab0', 1);
      poly(c, [cx - 6, by, cx, by - 46 - L * 2, cx + 6, by], '#cfeaff', '#5a8ab0', 1);
      poly(c, [cx + 4, by, cx + 10, by - 28, cx + 15, by], '#b2dcff', '#5a8ab0', 1);
      line(c, cx - 1, by - 8, cx - 1, by - 36 - L * 2, 'rgba(255,255,255,0.7)', 1.5);
    },
    mortar(c, x, y, s, L, t, time, o) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 10; pad(c, x, y, s, tt);
      ell(c, cx, by - 8, 20, 11, STONE_D[tt]); ell(c, cx, by - 11, 18, 9, STONE[tt]);
      const k = (o.anim || 0) * 18;
      ell(c, cx, by - 20 + k * 0.2, 11, 13, '#3a383d'); ell(c, cx, by - 30 + k * 0.2, 8, 4, '#1a191c');
      if (tt) rect(c, cx - 11, by - 22, 22, 3, TRIM[tt]);
    },
    teslaTower(c, x, y, s, L, t, time, o) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt);
      rect(c, cx - 5, by - 36, 10, 36, '#5a5f6b');
      for (let i = 0; i < 5; i++) ell(c, cx, by - 8 - i * 6, 9 - i * 0.6, 3, '#c98a4a');
      const p = (o.anim || 0) > 0 ? 1 : 0.4 + 0.2 * Math.sin(time * 9);
      glow(c, cx, by - 44, 16, '160,220,255', p); circle(c, cx, by - 44, 6, '#dff4ff');
      if (Math.random() < 0.3) line(c, cx, by - 44, cx + (Math.random() - 0.5) * 24, by - 44 + (Math.random() - 0.5) * 20, '#bfe8ff', 1);
    },
    ballista(c, x, y, s, L, t, time, o) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 10; pad(c, x, y, s, tt);
      rect(c, cx - 16, by - 12, 32, 12, tt ? STONE[tt] : '#8a5a30');
      c.save(); c.translate(cx, by - 18); c.rotate(o.angle || -1.57);
      rect(c, -6, -3, 28, 6, '#6b4a2a');
      c.beginPath(); c.moveTo(4, -18); c.quadraticCurveTo(14 - (o.anim || 0) * 20, 0, 4, 18); c.strokeStyle = tt === 2 ? '#d4a843' : '#8a5a30'; c.lineWidth = 3; c.stroke();
      line(c, 4, -18, -2 - (o.anim || 0) * 20, 0, '#eee', 1); line(c, 4, 18, -2 - (o.anim || 0) * 20, 0, '#eee', 1);
      c.restore();
    },
    outpost(c, x, y, s, L, t, time) {
      const cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, 1);
      rect(c, cx - 20, by - 22, 40, 22, '#a9a6a0');
      for (let i = -20; i < 20; i += 8) rect(c, cx + i, by - 27, 5, 5, '#a9a6a0');
      rect(c, cx - 7, by - 38, 14, 16, '#9b9690'); poly(c, [cx - 9, by - 38, cx, by - 50, cx + 9, by - 38], '#3b5aa8');
      flag(c, cx, by - 50, '#d4a843', time); rect(c, cx - 4, by - 10, 8, 10, '#2a1d12');
    },
    farm(c, x, y, s, L, t, time) {
      const tt = tierOf(L), by = y + s - 6; pad(c, x, y, s, tt);
      for (let i = 0; i < 4; i++) rect(c, x + 6, y + 10 + i * 9, s - 26, 6, i % 2 ? '#c9b14a' : '#8fbf4a');
      for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) circle(c, x + 9 + k * 6, y + 13 + i * 9, 1.3, i % 2 ? '#f2d86a' : '#5fa83a');
      house(c, x + s - 12, by, 18, 14, 10, '#a8503a', '#6a2a1a', tt, { door: false });
    },
    granary(c, x, y, s, L, t, time, o) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt);
      rect(c, cx - 12, by - 30, 24, 30, tt ? STONE[tt] : '#c9a46a'); ell(c, cx, by - 30, 12, 4, '#a8803a');
      poly(c, [cx - 14, by - 30, cx, by - 46, cx + 14, by - 30], tt === 2 ? '#3b6a3a' : '#8a5a2a', 'rgba(0,0,0,0.3)', 1);
      for (let i = 0; i < 1 + Math.round((o.fill || 0.5) * 3); i++) ell(c, x + 8 + i * 6, by - 3, 4, 5, '#e2c88a');
    },
    archeryRange(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt);
      house(c, cx - 6, by, 30, 18 + tt * 2, 14, '#9a7040', tt === 2 ? '#2f6a3a' : '#3b8a45', tt, { beams: true });
      const tx = x + s - 12, ty = by - 18;
      line(c, tx, by, tx, ty, '#6b4a2a', 2); circle(c, tx, ty - 6, 8, '#f2ecd8'); circle(c, tx, ty - 6, 5.5, '#d94a3a'); circle(c, tx, ty - 6, 3, '#f2ecd8'); circle(c, tx, ty - 6, 1.3, '#d94a3a');
    },
    stable(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt);
      house(c, cx, by, 46, 18 + tt * 2, 14, '#a8603a', '#5a3a22', tt, { beams: true, door: false });
      for (const dx of [-12, 0, 12]) { rect(c, cx + dx - 4, by - 12, 8, 12, '#3a2614'); }
      ell(c, x + s - 8, by - 2, 6, 4, '#e2c86a');
      circle(c, cx, by - 24 - tt * 2, 3.5, '#d4a843'); circle(c, cx, by - 24 - tt * 2, 2, '#5a3a22');
    },
    siegeWorkshop(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt);
      house(c, cx - 5, by, 36, 20 + tt * 2, 12, STONE[tt], '#5a5048', tt, { door: false });
      rect(c, cx - 14, by - 14, 18, 14, '#3a2614');
      c.save(); c.translate(x + s - 12, by - 10); c.rotate(-0.9 + Math.sin(time) * 0.1); rect(c, -2, -22, 4, 24, '#7a5a3a'); ell(c, 0, -22, 5, 3, '#5a3a22'); c.restore();
      c.save(); c.translate(cx + 8, by - 30 - tt * 2); c.rotate(time * 0.8); for (let i = 0; i < 6; i++) { c.rotate(Math.PI / 3); rect(c, -1.5, -7, 3, 4, '#9a9aa6'); } circle(c, 0, 0, 4.5, '#9a9aa6'); circle(c, 0, 0, 1.8, '#444'); c.restore();
    },
    infirmary(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt);
      house(c, cx, by, 42, 22 + tt * 2, 14, '#ece6da', '#b8463a', tt);
      rect(c, cx - 2.5, by - 30 - tt * 2, 5, 13, '#d94a3a'); rect(c, cx - 6.5, by - 26 - tt * 2, 13, 5, '#d94a3a');
    },
    watchtower(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8, h = 34 + L * 3; pad(c, x, y, s, tt);
      poly(c, [cx - 8, by, cx - 5, by - h, cx + 5, by - h, cx + 8, by], tt ? STONE[tt] : '#8a5a30', 'rgba(0,0,0,0.35)', 1.2);
      rect(c, cx - 10, by - h - 6, 20, 7, tt ? STONE_D[tt] : '#5e3d22');
      poly(c, [cx - 11, by - h - 6, cx, by - h - 20, cx + 11, by - h - 6], '#2f4a8a');
      const f = Math.sin(time * 9) * 1.5; glow(c, cx, by - h - 26, 10, '255,160,60', 0.7); poly(c, [cx - 3, by - h - 20, cx, by - h - 30 - f, cx + 3, by - h - 20], '#ffb34a');
    },
    embassy(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt + 1);
      house(c, cx, by, 40, 22 + tt * 2, 12, STONE[Math.min(2, tt + 1)], '#3a4a9a', tt + 1);
      ['#e2b65c', '#a8b4c4', '#8fc8ff', '#e0503a'].forEach((col, i) => flag(c, x + 7 + i * 9, by - 26 - tt * 2, col, time + i));
    },
    trapWorkshop(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt);
      house(c, cx - 4, by, 34, 18 + tt * 2, 12, '#7a6a5a', '#4a4038', tt);
      circle(c, x + s - 10, by - 6, 6, '#2a2a30'); line(c, x + s - 7, by - 11, x + s - 4, by - 15, '#a08060', 1.5);
      for (let i = 0; i < 3; i++) poly(c, [x + 6 + i * 5, by, x + 8 + i * 5, by - 7, x + 10 + i * 5, by], '#d0d4dc');
    },
    tradingPost(c, x, y, s, L, t, time) {
      const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt);
      rect(c, cx - 18, by - 16, 36, 16, '#8a5a30');
      for (let i = 0; i < 6; i++) poly(c, [cx - 21 + i * 7, by - 16, cx - 18 + i * 7, by - 28, cx - 14 + i * 7, by - 16], i % 2 ? '#f2ecd8' : '#d94a3a');
      rect(c, cx - 14, by - 10, 9, 8, '#c9a46a'); rect(c, cx - 2, by - 10, 9, 8, '#a8703a'); circle(c, cx + 12, by - 6, 3.5, '#f2c94a');
    },
    tree(c, x, y, s) {
      const cx = x + s / 2, by = y + s - 6;
      ell(c, cx + 3, by, s * 0.38, 6, 'rgba(0,0,0,0.3)'); rect(c, cx - 3, by - 14, 6, 14, '#5a3a20');
      circle(c, cx - 9, by - 20, 12, '#2f6a2c'); circle(c, cx + 9, by - 21, 12, '#2c6229'); circle(c, cx, by - 31, 13, '#367a32'); circle(c, cx - 4, by - 34, 5, 'rgba(170,230,120,0.25)');
    },
    rock(c, x, y, s) {
      const cx = x + s / 2, by = y + s - 6;
      ell(c, cx + 2, by, 13, 4, 'rgba(0,0,0,0.3)');
      poly(c, [cx - 12, by, cx - 9, by - 12, cx - 1, by - 16, cx + 9, by - 11, cx + 12, by], '#8a857a', '#4a463e', 1.2);
      poly(c, [cx - 9, by - 12, cx - 1, by - 16, cx + 2, by - 8, cx - 5, by - 5], '#aaa498');
    },
  };
  function storage(c, x, y, s, L, col, dark, kind, o) {
    const tt = tierOf(L), cx = x + s / 2, by = y + s - 8; pad(c, x, y, s, tt);
    const fill = o.fill != null ? o.fill : 0.6;
    if (kind === 'gold') {
      rect(c, cx - 20, by - 22, 40, 22, STONE[tt]); rect(c, cx - 22, by - 26, 44, 5, TRIM[tt]);
      const h = 6 + fill * 14; poly(c, [cx - 16, by - 26, cx, by - 26 - h, cx + 16, by - 26], col, dark, 1);
      for (let i = 0; i < 5; i++) circle(c, cx - 10 + i * 5, by - 27 - (i % 2) * 3 - fill * 6, 2, '#fff1a0');
      rect(c, cx - 6, by - 14, 12, 10, '#5a3a14'); circle(c, cx, by - 9, 2, '#d4a843');
    } else if (kind === 'wood') {
      const rows = 1 + Math.round(fill * 3);
      for (let r = 0; r < rows; r++) for (let i = 0; i < 4 - (r % 2); i++) { const lx = cx - 15 + i * 10 + (r % 2) * 5, ly = by - 6 - r * 8; ell(c, lx, ly, 5, 4.5, col); circle(c, lx, ly, 2.5, '#e2c08a'); }
      line(c, cx - 20, by, cx - 20, by - 34, TRIM[tt], 3); line(c, cx + 20, by, cx + 20, by - 34, TRIM[tt], 3);
      poly(c, [cx - 23, by - 34, cx, by - 42, cx + 23, by - 34], tt === 2 ? '#3b6a3a' : '#7a4a2a');
    } else {
      const rows = 1 + Math.round(fill * 3);
      for (let r = 0; r < rows; r++) for (let i = 0; i < 3; i++) rrect(c, cx - 18 + i * 12 + (r % 2) * 4, by - 9 - r * 8, 11, 8, 1, r % 2 ? col : '#b8b2a6', 'rgba(0,0,0,0.35)');
      if (tt) rect(c, cx - 20, by - 2, 40, 3, TRIM[tt]);
    }
  }

  /** Walls connect to neighbours; `links` bitmask: 1=E 2=S 4=W 8=N. */
  function wall(c, x, y, L, links, isGate, time) {
    const tt = tierOf(L), cx = x + T / 2, by = y + T / 2 + 6, h = 12 + tt * 3;
    const col = tt === 0 ? '#9a6a3a' : STONE[tt], top = tt === 0 ? '#b88a55' : tt === 2 ? '#e8e2d4' : '#c4c0b8', dark = tt === 0 ? '#5e3d22' : STONE_D[tt];
    const seg = (x2, y2) => {
      const x0 = Math.min(cx, x2) - 5, y0 = Math.min(by, y2) - 5, w = Math.abs(x2 - cx) + 10, hh = Math.abs(y2 - by) + 10;
      rect(c, x0, y0 + 2, w, hh, 'rgba(0,0,0,0.25)');
      rect(c, x0, y0 - h + 6, w, hh, top);
      rect(c, x0, y0 + hh - 6 - 0, w, 6, dark);
    };
    if (links & 1) seg(x + T, by);
    if (links & 2) seg(cx, by + T / 2 + 2);
    if (links & 4) seg(x, by);
    if (links & 8) seg(cx, y - 2);
    if (isGate) {
      rect(c, cx - 8, by - h - 6, 16, h + 10, dark); rect(c, cx - 7, by - h - 4, 14, h + 6, '#6b4422');
      line(c, cx, by - h - 4, cx, by + 2, '#3a2412', 1.5); circle(c, cx - 3, by - 2, 1, '#d4a843'); circle(c, cx + 3, by - 2, 1, '#d4a843');
      if (tt) rect(c, cx - 8, by - h - 7, 16, 2, TRIM[tt]);
    } else {
      rect(c, cx - 6, by - h - 2, 12, h + 6, col);
      rect(c, cx - 6, by - h - 4, 12, 4, top);
      if (tt === 0) { line(c, cx - 3, by - h - 4, cx - 3, by + 4, 'rgba(60,35,15,0.5)', 1); line(c, cx + 3, by - h - 4, cx + 3, by + 4, 'rgba(60,35,15,0.5)', 1); }
      if (tt === 2) rect(c, cx - 6, by - h, 12, 1.5, '#d4a843');
    }
  }
  function trap(c, x, y, type, L, armed) {
    const cx = x + T / 2, cy = y + T / 2;
    if (type === 'spikeTrap') { rrect(c, cx - 10, cy - 8, 20, 16, 2, '#5a5f6b', '#2a2e36'); for (let i = 0; i < 6; i++) poly(c, [cx - 8 + (i % 3) * 7, cy - 2 + Math.floor(i / 3) * 7, cx - 6 + (i % 3) * 7, cy - 8 + Math.floor(i / 3) * 7, cx - 4 + (i % 3) * 7, cy - 2 + Math.floor(i / 3) * 7], '#d0d4dc'); }
    else if (type === 'bombTrap') { ell(c, cx, cy + 4, 9, 4, 'rgba(0,0,0,0.3)'); circle(c, cx, cy, 8, '#2a2a30'); circle(c, cx - 3, cy - 3, 2, 'rgba(255,255,255,0.4)'); line(c, cx + 4, cy - 6, cx + 8, cy - 11, '#a08060', 1.5); if (armed) circle(c, cx + 8, cy - 11, 1.8, '#ffb33a'); }
    else { rrect(c, cx - 11, cy - 9, 22, 18, 3, '#3a2a22', '#1a120c'); for (let i = -8; i <= 8; i += 4) line(c, cx + i, cy - 7, cx + i, cy + 7, '#6a4a3a', 1.5); glow(c, cx, cy, 10, '255,120,40', 0.45); }
  }

  /** Draw any building. o: {time, angle, anim, fill, links, ghost, valid, hidden, constructing, progress} */
  function drawBuilding(c, b, o = {}) {
    const d = CH.BUILDINGS[b.type], s = d.size * T, x = b.tx * T, y = b.ty * T, L = Math.max(1, b.level || 1), time = o.time || 0;
    c.save();
    if (o.ghost) c.globalAlpha = 0.65;
    if (d.cat === 'wall') wall(c, x, y, L, o.links || 0, b.type === 'gate', time);
    else if (d.cat === 'trap') { if (!o.hidden) trap(c, x, y, b.type, L, o.armed !== false); }
    else if (BLD[b.type]) BLD[b.type](c, x, y, s, L, d, time, o);
    if (o.constructing) {
      c.globalAlpha = 0.85;
      c.strokeStyle = '#c8a060'; c.lineWidth = 2;
      for (let i = 4; i < s; i += 10) { line(c, x + i, y + s - 4, x + i, y + 8, '#a07a40', 2); }
      line(c, x + 4, y + s * 0.4, x + s - 4, y + s * 0.4, '#a07a40', 2); line(c, x + 4, y + s * 0.75, x + s - 4, y + s * 0.75, '#a07a40', 2);
      c.globalAlpha = 1;
    }
    if (o.frozen) { c.globalAlpha = 0.5; rrect(c, x + 4, y - 20, s - 8, s + 12, 6, 'rgba(190,235,255,0.6)', 'rgba(255,255,255,0.8)'); }
    c.restore();
    if (o.hit) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, x + s / 2, y + s / 2 - 10, s * 0.6, '255,255,255', 0.25); c.restore(); }
  }

  /* ---------------- Units ---------------- */
  // Generic humanoid facing right with feet at (0,0).
  function humanoid(c, s, a, o) {
    const bob = Math.abs(Math.sin(a * 11)) * s * 0.08, k = Math.sin(a * 11) * s * 0.25;
    if (o.cape) poly(c, [-s * 0.45, -s * 1.7 - bob, -s * 0.85, -s * 0.3, -s * 0.1, -s * 0.5 - bob], o.cape);
    line(c, -s * 0.2, -s * 0.6, -s * 0.2 + k, 0, o.legs || '#3a3a44', s * 0.24);
    line(c, s * 0.2, -s * 0.6, s * 0.2 - k, 0, o.legs || '#3a3a44', s * 0.24);
    if (o.robe) poly(c, [-s * 0.55, -s * 0.05, -s * 0.38, -s * 1.5 - bob, s * 0.38, -s * 1.5 - bob, s * 0.55, -s * 0.05], o.body);
    else ell(c, 0, -s * 1.0 - bob, s * 0.5, s * 0.6, o.body);
    if (o.belt) rect(c, -s * 0.48, -s * 0.85 - bob, s * 0.96, s * 0.14, o.belt);
    circle(c, s * 0.08, -s * 1.75 - bob, s * 0.36, o.skin || '#e8c39a');
    if (o.helm) { c.beginPath(); c.arc(s * 0.08, -s * 1.8 - bob, s * 0.39, Math.PI, 0); c.fillStyle = o.helm; c.fill(); if (o.visor) rect(c, s * 0.1, -s * 1.82 - bob, s * 0.34, s * 0.08, '#222'); }
    if (o.hood) { c.beginPath(); c.arc(s * 0.05, -s * 1.78 - bob, s * 0.42, Math.PI * 0.95, Math.PI * 0.05 + TAU); c.fillStyle = o.hood; c.fill(); circle(c, s * 0.18, -s * 1.72 - bob, s * 0.07, o.eyes || '#222'); }
    if (o.hat) poly(c, [-s * 0.35, -s * 1.95 - bob, s * 0.15, -s * 3.0 - bob, s * 0.5, -s * 1.95 - bob], o.hat);
    if (o.crown) poly(c, [-s * 0.22, -s * 2.0 - bob, -s * 0.22, -s * 2.35 - bob, -s * 0.08, -s * 2.15 - bob, s * 0.08, -s * 2.4 - bob, s * 0.22, -s * 2.15 - bob, s * 0.36, -s * 2.35 - bob, s * 0.36, -s * 2.0 - bob], '#ffcf4a', '#7a5a12', 0.8);
    if (o.plume) poly(c, [s * 0.05, -s * 2.15 - bob, -s * 0.5, -s * 2.5 - bob, -s * 0.3, -s * 2.0 - bob], o.plume);
    if (o.hair) poly(c, [-s * 0.3, -s * 1.95 - bob, s * 0.45, -s * 2.15 - bob, s * 0.2, -s * 1.85 - bob], o.hair);
    if (!o.helm && !o.hood && o.eyes !== false) circle(c, s * 0.25, -s * 1.78 - bob, s * 0.06, '#222');
    const sw = o.swing ? -o.swing * 4 : 0;
    const hy = -s * 1.05 - bob;
    switch (o.weapon) {
      case 'sword': c.save(); c.translate(s * 0.45, hy); c.rotate(-0.9 + sw); line(c, 0, 0, s * 1.1, 0, '#d8dce4', s * 0.13); line(c, s * 0.1, -s * 0.18, s * 0.1, s * 0.18, '#8a6a2a', s * 0.1); c.restore(); break;
      case 'axe': c.save(); c.translate(s * 0.45, hy); c.rotate(-0.8 + sw); line(c, 0, 0, s * 1.0, 0, '#6b4a2a', s * 0.12); poly(c, [s * 0.8, -s * 0.05, s * 1.05, -s * 0.4, s * 1.15, s * 0.1], '#c0c4cc'); c.restore(); break;
      case 'hammer': c.save(); c.translate(s * 0.45, hy); c.rotate(-0.9 + sw); line(c, 0, 0, s * 1.0, 0, '#6b4a2a', s * 0.12); rect(c, s * 0.8, -s * 0.25, s * 0.3, s * 0.5, '#e8d38a'); c.restore(); break;
      case 'spear': line(c, -s * 0.2, hy + s * 0.3, s * 1.5 + (o.swing ? s * 0.4 : 0), hy - s * 0.25, '#7a5a3a', s * 0.1); poly(c, [s * 1.5 + (o.swing ? s * 0.4 : 0), hy - s * 0.4, s * 1.85 + (o.swing ? s * 0.4 : 0), hy - s * 0.3, s * 1.5 + (o.swing ? s * 0.4 : 0), hy - s * 0.1], '#d8dce4'); break;
      case 'bow': c.beginPath(); c.arc(s * 0.4, hy, s * 0.7, -1.2, 1.2); c.strokeStyle = '#a07a40'; c.lineWidth = s * 0.12; c.stroke(); line(c, s * 0.65, hy - s * 0.65, s * 0.65, hy + s * 0.65, 'rgba(255,255,255,0.6)', 0.6); break;
      case 'staff': line(c, s * 0.5, 0, s * 0.6, -s * 2.2, '#6b4a2a', s * 0.12); glow(c, s * 0.6, -s * 2.3, s * 0.7, o.orb || '150,200,255', 0.8); circle(c, s * 0.6, -s * 2.3, s * 0.18, '#fff'); break;
      case 'club': c.save(); c.translate(s * 0.4, hy); c.rotate(-1.0 + sw); line(c, 0, 0, s * 1.0, 0, '#6b4a2a', s * 0.25); circle(c, s * 1.0, 0, s * 0.25, '#5a3a20'); c.restore(); break;
    }
    if (o.shield) { ell(c, -s * 0.35, -s * 1.0 - bob, s * 0.32, s * 0.45, o.shield); ell(c, -s * 0.35, -s * 1.0 - bob, s * 0.14, s * 0.22, 'rgba(255,255,255,0.35)'); }
  }

  const P = { tunic: '#3a62c9', tunic2: '#2a4a9a', steel: '#b9bec8', gold: '#e2b65c' };
  const UNIT = {
    swordsman: (c, s, a, o) => humanoid(c, s, a, { body: P.tunic, helm: P.steel, weapon: 'sword', shield: '#8a5a30', belt: '#5a3a1a', swing: o.swing }),
    archer: (c, s, a, o) => humanoid(c, s, a, { body: '#3a8a4a', hood: '#2f6a3a', weapon: 'bow', belt: '#5a3a1a', swing: o.swing }),
    spearman: (c, s, a, o) => humanoid(c, s, a, { body: P.tunic2, helm: '#8a8f99', weapon: 'spear', belt: '#5a3a1a', swing: o.swing }),
    knight: (c, s, a, o) => humanoid(c, s, a, { body: P.steel, legs: '#7a7f88', helm: '#d0d4dc', visor: true, plume: '#c93a3a', weapon: 'sword', shield: P.tunic, cape: P.tunic2, swing: o.swing }),
    mage: (c, s, a, o) => humanoid(c, s, a, { body: '#3a4ab0', robe: true, hat: '#2a3a90', weapon: 'staff', orb: '170,140,255', swing: o.swing }),
    berserker: (c, s, a, o) => humanoid(c, s, a, { body: '#e0a878', skin: '#e0a878', hair: '#c9532a', legs: '#5a3a2a', weapon: 'axe', belt: '#3a2a1a', swing: o.swing }),
    paladin: (c, s, a, o) => humanoid(c, s, a, { body: '#e8e4d8', legs: '#b8b4a8', helm: P.gold, weapon: 'hammer', shield: '#e8e4d8', cape: '#d4a843', swing: o.swing }),
    necromancer: (c, s, a, o) => humanoid(c, s, a, { body: '#2a3a3a', robe: true, hood: '#1a2a2a', eyes: '#4fffc0', weapon: 'staff', orb: '80,255,180', swing: o.swing }),
    giant: (c, s, a, o) => humanoid(c, s, a, { body: '#c9946a', skin: '#d9a47a', legs: '#6a4a2a', belt: '#5a3a1a', hair: '#7a4a2a', weapon: 'club', swing: o.swing }),
    golem(c, s, a, o) {
      const bob = Math.abs(Math.sin(a * 6)) * 2, k = Math.sin(a * 6) * s * 0.2;
      rect(c, -s * 0.5 + k, -s * 0.6, s * 0.35, s * 0.6, '#6a6a74'); rect(c, s * 0.15 - k, -s * 0.6, s * 0.35, s * 0.6, '#6a6a74');
      rrect(c, -s * 0.75, -s * 1.7 - bob, s * 1.5, s * 1.15, 4, '#8a8a96', '#4a4a54'); rrect(c, -s * 0.4, -s * 2.2 - bob, s * 0.8, s * 0.55, 3, '#9a9aa6', '#4a4a54');
      circle(c, s * 0.12, -s * 1.95 - bob, s * 0.08, '#7dffc8'); line(c, -s * 0.4, -s * 1.2 - bob, s * 0.3, -s * 1.0 - bob, '#7dffc8', 1.5);
      rrect(c, s * 0.6, -s * 1.5 - bob + (o.swing ? s * 0.3 : 0), s * 0.45, s * 0.7, 3, '#7a7a86', '#4a4a54');
    },
    dragonRider(c, s, a, o) { dragon(c, s * 0.75, a, '#3a6ac9', '#e2b65c', false); humanoid(c, s * 0.35, a, { body: P.tunic, helm: P.gold, weapon: 'spear', eyes: false }); },
    skeleton(c, s, a, o) {
      const k = Math.sin(a * 12) * s * 0.25, bob = Math.abs(Math.sin(a * 12));
      line(c, -s * 0.2, -s * 0.6, -s * 0.2 + k, 0, '#e8e2d0', s * 0.16); line(c, s * 0.2, -s * 0.6, s * 0.2 - k, 0, '#e8e2d0', s * 0.16);
      line(c, 0, -s * 0.5, 0, -s * 1.45 - bob, '#e8e2d0', s * 0.16);
      for (let i = 0; i < 3; i++) line(c, -s * 0.32, -s * (0.8 + i * 0.2) - bob, s * 0.32, -s * (0.8 + i * 0.2) - bob, '#efe9d8', s * 0.1);
      circle(c, s * 0.05, -s * 1.75 - bob, s * 0.4, '#f2ecdc');
      const eye = o.friendly ? '#4fffc0' : '#ff4a3a'; circle(c, s * 0.0, -s * 1.78 - bob, s * 0.09, eye); circle(c, s * 0.2, -s * 1.78 - bob, s * 0.09, eye);
      c.save(); c.translate(s * 0.4, -s * 1.0 - bob); c.rotate(-0.9 - (o.swing || 0) * 4); line(c, 0, 0, s * 1.0, 0, '#c6cad1', s * 0.12); c.restore();
    },
    crossbowman: (c, s, a, o) => humanoid(c, s, a, { body: '#5a6a8a', helm: '#8a8f99', weapon: 'bow', belt: '#5a3a1a', swing: o.swing }),
    longbowman: (c, s, a, o) => humanoid(c, s, a, { body: '#2f6a3a', hood: '#24502e', weapon: 'bow', cape: '#3a5a2a', swing: o.swing }),
    lightCav(c, s, a, o) { horse(c, s, a, '#8a6a4a', '#3a2614'); c.save(); c.translate(0, -s * 0.9); humanoid(c, s * 0.62, a * 0.3, { body: P.tunic, helm: P.steel, weapon: 'sword', eyes: false, swing: o.swing }); c.restore(); },
    heavyCav(c, s, a, o) { horse(c, s, a, '#5a5a62', '#222', true); c.save(); c.translate(0, -s * 0.9); humanoid(c, s * 0.62, a * 0.3, { body: P.steel, helm: '#d0d4dc', visor: true, plume: '#c93a3a', weapon: 'spear', eyes: false, swing: o.swing }); c.restore(); },
    wolfRider(c, s, a, o) { UNIT.wolf(c, s * 0.95, a); c.save(); c.translate(-s * 0.1, -s * 0.9); humanoid(c, s * 0.55, a * 0.3, { body: '#6b4a2b', skin: '#7cb24a', weapon: 'axe', eyes: false, swing: o.swing }); c.restore(); },
    thorne(c, s, a, o) { horse(c, s, a, '#f2ecd8', '#c9a24a', true); c.save(); c.translate(0, -s * 0.9); humanoid(c, s * 0.62, a * 0.3, { body: '#c9a24a', helm: P.gold, plume: '#3a62c9', cape: '#3a62c9', weapon: 'spear', eyes: false, swing: o.swing }); c.restore(); },
    griffin(c, s, a) {
      const wy = Math.sin(a * 10) * s * 0.7;
      poly(c, [-s * 0.2, -s * 1.3, -s * 1.7, -s * 2.3 + wy, -s * 1.1, -s * 1.1], '#c9a46a', 'rgba(0,0,0,0.3)', 1);
      poly(c, [s * 0.2, -s * 1.3, s * 1.3, -s * 2.5 + wy, s * 1.0, -s * 1.1], '#b8925a', 'rgba(0,0,0,0.3)', 1);
      ell(c, 0, -s * 1.0, s * 0.85, s * 0.45, '#c9a46a');
      circle(c, s * 0.8, -s * 1.4, s * 0.38, '#f2ecd8'); poly(c, [s * 1.1, -s * 1.45, s * 1.45, -s * 1.3, s * 1.1, -s * 1.25], '#e2b65c');
      circle(c, s * 0.9, -s * 1.5, s * 0.07, '#222');
      poly(c, [-s * 0.8, -s * 1.0, -s * 1.4, -s * 0.7, -s * 0.8, -s * 0.8], '#a8803a');
    },
    siegeRam(c, s, a, o) {
      const k = o.swing ? s * 0.4 : 0;
      for (const wx of [-s * 0.7, s * 0.5]) { circle(c, wx, -s * 0.25, s * 0.28, '#5a3a22'); circle(c, wx, -s * 0.25, s * 0.1, '#9a8a6a'); }
      poly(c, [-s, -s * 0.5, -s * 0.7, -s * 1.5, s * 0.7, -s * 1.5, s, -s * 0.5], '#8a5a30', '#3a2412', 1);
      rect(c, -s * 0.6 + k, -s * 0.95, s * 1.8, s * 0.22, '#6b4a2a'); poly(c, [s * 1.2 + k, -s * 1.1, s * 1.5 + k, -s * 0.84, s * 1.2 + k, -s * 0.6], '#9a9aa6');
    },
    catapult(c, s, a, o) {
      for (const wx of [-s * 0.6, s * 0.6]) { circle(c, wx, -s * 0.25, s * 0.25, '#5a3a22'); }
      rect(c, -s * 0.8, -s * 0.6, s * 1.6, s * 0.25, '#8a5a30');
      c.save(); c.translate(-s * 0.3, -s * 0.6); c.rotate(o.swing ? -0.2 : -1.1); rect(c, -s * 0.08, -s * 1.4, s * 0.16, s * 1.4, '#6b4a2a'); ell(c, 0, -s * 1.4, s * 0.25, s * 0.15, '#4a3220'); if (!o.swing) circle(c, 0, -s * 1.5, s * 0.15, '#8a857a'); c.restore();
    },
    ballistaCrew(c, s, a, o) {
      for (const wx of [-s * 0.6, s * 0.6]) circle(c, wx, -s * 0.25, s * 0.25, '#5a3a22');
      rect(c, -s * 0.8, -s * 0.65, s * 1.6, s * 0.3, '#8a5a30');
      rect(c, -s * 0.5, -s * 0.95, s * 1.6, s * 0.14, '#6b4a2a');
      c.beginPath(); c.moveTo(s * 0.7, -s * 1.5); c.quadraticCurveTo(s * 0.95 - (o.swing ? s * 0.3 : 0), -s * 0.9, s * 0.7, -s * 0.3); c.strokeStyle = '#8a5a30'; c.lineWidth = s * 0.12; c.stroke();
    },
    trebuchet(c, s, a, o) {
      for (const wx of [-s * 0.7, s * 0.7]) circle(c, wx, -s * 0.22, s * 0.22, '#5a3a22');
      rect(c, -s * 0.9, -s * 0.5, s * 1.8, s * 0.2, '#8a5a30');
      line(c, -s * 0.4, -s * 0.5, 0, -s * 1.8, '#6b4a2a', s * 0.14); line(c, s * 0.4, -s * 0.5, 0, -s * 1.8, '#6b4a2a', s * 0.14);
      c.save(); c.translate(0, -s * 1.8); c.rotate(o.swing ? 0.9 : -0.6); line(c, -s * 0.6, 0, s * 1.4, 0, '#7a5a3a', s * 0.12); rect(c, -s * 0.8, -s * 0.1, s * 0.4, s * 0.5, '#4a4038'); c.restore();
    },
    king: (c, s, a, o) => humanoid(c, s, a, { body: '#b02a2a', legs: '#5a1a1a', crown: true, cape: '#7a1a1a', weapon: 'sword', shield: P.gold, belt: P.gold, hair: '#c9a24a', swing: o.swing }),
    queen: (c, s, a, o) => humanoid(c, s, a, { body: '#6a3ab0', robe: true, crown: true, hair: '#e8c060', cape: '#4a2a8a', weapon: 'bow', swing: o.swing }),
    archmage: (c, s, a, o) => humanoid(c, s, a, { body: '#e8e4f8', robe: true, hat: '#3a3ab0', weapon: 'staff', orb: '255,200,120', hair: '#ddd', swing: o.swing }),
    darkKnight: (c, s, a, o) => humanoid(c, s, a, { body: '#2a2a34', legs: '#1a1a22', helm: '#3a3a46', visor: true, plume: '#8a2aff', weapon: 'sword', cape: '#3a1a5a', swing: o.swing }),
    necroHero: (c, s, a, o) => humanoid(c, s, a, { body: '#1a1a24', robe: true, hood: '#2a1a3a', eyes: '#7dffc8', cape: '#3a2a5a', weapon: 'staff', orb: '120,255,190', swing: o.swing }),
    // Enemies
    goblin: (c, s, a, o) => { humanoid(c, s * 0.9, a, { body: '#6b4a2b', skin: '#7cb24a', weapon: 'sword', swing: o.swing }); poly(c, [-s * 0.2, -s * 1.65, -s * 0.85, -s * 1.95, -s * 0.25, -s * 1.45], '#7cb24a'); poly(c, [s * 0.35, -s * 1.7, s * 0.95, -s * 2.0, s * 0.4, -s * 1.45], '#7cb24a'); },
    sapper: (c, s, a, o) => { UNIT.goblin(c, s, a, o); circle(c, -s * 0.2, -s * 2.3, s * 0.45, '#2a2a30'); line(c, s * 0.0, -s * 2.7, s * 0.2, -s * 3.0, '#a08060', 1.5); circle(c, s * 0.2, -s * 3.0, 1.8, Math.sin(a * 20) > 0 ? '#ffd04a' : '#ff6a2a'); },
    orc: (c, s, a, o) => { humanoid(c, s, a, { body: '#5e5a55', skin: '#5f8a3e', legs: '#3a3022', weapon: 'axe', belt: '#3a2a1a', swing: o.swing }); poly(c, [s * 0.2, -s * 1.55, s * 0.28, -s * 1.8, s * 0.36, -s * 1.55], '#f2ecd8'); },
    wolf(c, s, a) {
      const k = Math.sin(a * 16) * s * 0.3;
      line(c, -s * 0.7, -s * 0.5, -s * 0.7 + k, 0, '#4b4f57', s * 0.2); line(c, s * 0.6, -s * 0.5, s * 0.6 - k, 0, '#4b4f57', s * 0.2);
      ell(c, 0, -s * 0.7, s * 1.1, s * 0.48, '#6e737d'); poly(c, [-s, -s * 0.8, -s * 1.8, -s * 1.2 + k * 0.3, -s * 1.1, -s * 0.5], '#5b6069');
      ell(c, s * 1.05, -s, s * 0.48, s * 0.38, '#7b808a'); poly(c, [s * 1.3, -s, s * 1.85, -s * 0.85, s * 1.3, -s * 0.75], '#7b808a');
      poly(c, [s * 0.75, -s * 1.25, s * 0.85, -s * 1.7, s * 1.05, -s * 1.3], '#5b6069'); circle(c, s * 1.25, -s * 1.08, s * 0.1, '#ffd54a');
    },
    bat(c, s, a) {
      const wy = Math.sin(a * 22) * s * 0.9;
      poly(c, [0, -s * 1.6, -s * 1.9, -s * 1.9 + wy, -s * 1.3, -s * 1.3 + wy * 0.5, -s * 0.9, -s * 1.5 + wy * 0.6, 0, -s * 1.1], '#4a2f5e');
      poly(c, [0, -s * 1.6, s * 1.9, -s * 1.9 + wy, s * 1.3, -s * 1.3 + wy * 0.5, s * 0.9, -s * 1.5 + wy * 0.6, 0, -s * 1.1], '#4a2f5e');
      ell(c, 0, -s * 1.45, s * 0.42, s * 0.5, '#2e1c3c'); circle(c, s * 0.15, -s * 1.55, s * 0.09, '#ff5a5a');
    },
    skeletonMage(c, s, a, o) { humanoid(c, s, a, { body: '#3d2a5c', robe: true, skin: '#f2ecdc', hood: '#4b3470', eyes: '#c58bff', weapon: 'staff', orb: '197,139,255', swing: o.swing }); },
    spider(c, s, a) {
      for (let i = 0; i < 4; i++) { const k = Math.sin(a * 18 + i) * s * 0.2, x = -s * 0.5 + i * s * 0.35; line(c, x, -s * 0.6, x - s * 0.5 + k, 0, '#1b1b1f', s * 0.12); line(c, x, -s * 0.6, x + s * 0.5 - k, 0, '#1b1b1f', s * 0.12); }
      ell(c, -s * 0.35, -s * 0.75, s * 0.75, s * 0.6, '#2a2a33'); circle(c, s * 0.45, -s * 0.7, s * 0.4, '#33333d');
      rect(c, -s * 0.6, -s * 1.05, s * 0.5, s * 0.12, '#b33a3a'); circle(c, s * 0.62, -s * 0.78, s * 0.08, '#ff4040'); circle(c, s * 0.74, -s * 0.66, s * 0.08, '#ff4040');
    },
    troll: (c, s, a, o) => humanoid(c, s, a, { body: '#76806a', skin: '#8f9a80', legs: '#4a5244', weapon: 'club', belt: '#5a3d22', swing: o.swing }),
    ogre: (c, s, a, o) => humanoid(c, s, a, { body: '#b59a72', skin: '#c9ac80', legs: '#5a4a32', weapon: 'club', belt: '#3a2a1a', hair: '#3a2a1a', swing: o.swing }),
    darkKnightEnemy: (c, s, a, o) => humanoid(c, s, a, { body: '#2a2a34', legs: '#1a1a22', helm: '#3a3a46', visor: true, plume: '#c92a2a', weapon: 'sword', shield: '#4a1a1a', swing: o.swing }),
    imp(c, s, a, o) { glow(c, 0, -s, s * 1.4, '255,120,40', 0.35); humanoid(c, s, a, { body: '#c2401f', skin: '#e2582b', legs: '#7a2010', weapon: 'none', eyes: false, swing: o.swing }); poly(c, [-s * 0.2, -s * 2.0, -s * 0.4, -s * 2.5, 0, -s * 2.1], '#3a1208'); poly(c, [s * 0.3, -s * 2.05, s * 0.5, -s * 2.5, s * 0.55, -s * 2.0], '#3a1208'); circle(c, s * 0.3, -s * 1.8, s * 0.08, '#ffe05a'); },
    whelp: (c, s, a) => dragon(c, s * 0.8, a, '#b8402a', '#e8a04a', false),
    trollChief: (c, s, a, o) => { UNIT.troll(c, s, a, o); poly(c, [-s * 0.2, -s * 2.05, -s * 0.2, -s * 2.4, 0, -s * 2.2, s * 0.15, -s * 2.45, s * 0.3, -s * 2.2, s * 0.45, -s * 2.4, s * 0.45, -s * 2.05], '#ffcf4a'); },
    orcWarlord: (c, s, a, o) => { UNIT.orc(c, s, a, o); poly(c, [-s * 0.2, -s * 2.0, -s * 0.7, -s * 2.6, -s * 0.05, -s * 2.15], '#e8e2d0'); poly(c, [s * 0.35, -s * 2.0, s * 0.8, -s * 2.6, s * 0.2, -s * 2.15], '#e8e2d0'); line(c, -s * 0.9, 0, -s * 0.9, -s * 2.6, '#4a3220', 2); poly(c, [-s * 0.9, -s * 2.6, -s * 1.7, -s * 2.4 + Math.sin(a * 5) * 2, -s * 0.9, -s * 2.0], '#9a1f1f'); },
    broodmother: (c, s, a) => { UNIT.spider(c, s, a); for (let i = 0; i < 4; i++) circle(c, -s * 0.6 + i * s * 0.25, -s * 1.15, s * 0.07, '#ff4040'); },
    frostGiant(c, s, a, o) { humanoid(c, s, a, { body: '#8fb4d6', skin: '#a9cbe8', legs: '#5a7a96', weapon: 'club', belt: '#4a6a8a', swing: o.swing }); poly(c, [-s * 0.25, -s * 1.7, s * 0.1, -s * 1.1, s * 0.45, -s * 1.7], '#f2fbff'); poly(c, [-s * 0.3, -s * 2.05, -s * 0.25, -s * 2.5, -s * 0.05, -s * 2.15, s * 0.15, -s * 2.6, s * 0.35, -s * 2.15, s * 0.55, -s * 2.5, s * 0.55, -s * 2.05], '#dff4ff', '#6aa6d6', 1); },
    demonLord(c, s, a, o) {
      glow(c, 0, -s, s * 2.2, '255,60,30', 0.35);
      const w = Math.sin(a * 4) * s * 0.3;
      poly(c, [-s * 0.3, -s * 1.5, -s * 1.8, -s * 2.6 + w, -s * 1.4, -s * 1.4, -s * 0.6, -s * 1.0], '#3a0a0a'); poly(c, [s * 0.3, -s * 1.5, s * 1.8, -s * 2.6 + w, s * 1.4, -s * 1.4, s * 0.6, -s * 1.0], '#3a0a0a');
      humanoid(c, s, a, { body: '#8a1a1a', skin: '#b02a1a', legs: '#4a0a0a', weapon: 'axe', belt: '#e2b65c', eyes: false, swing: o.swing });
      poly(c, [-s * 0.25, -s * 2.0, -s * 0.6, -s * 2.6, -s * 0.05, -s * 2.1], '#1a1a1a'); poly(c, [s * 0.35, -s * 2.0, s * 0.75, -s * 2.6, s * 0.2, -s * 2.1], '#1a1a1a');
      circle(c, s * 0.25, -s * 1.8, s * 0.08, '#ffe05a');
    },
    dragon: (c, s, a) => dragon(c, s, a, '#7a1f1a', '#e2b65c', true),
  };
  function horse(c, s, a, col, mane, armored) {
    const k = Math.sin(a * 14) * s * 0.3;
    for (const [x, ph] of [[-s * 0.6, 1], [-s * 0.35, -1], [s * 0.45, -1], [s * 0.7, 1]]) line(c, x, -s * 0.5, x + k * ph, 0, col, s * 0.16);
    ell(c, 0, -s * 0.75, s * 0.95, s * 0.4, col);
    poly(c, [s * 0.7, -s * 0.9, s * 1.05, -s * 1.5, s * 1.35, -s * 1.35, s * 0.95, -s * 0.7], col);
    poly(c, [s * 0.8, -s * 1.2, s * 0.95, -s * 1.55, s * 0.7, -s * 1.1], mane);
    line(c, -s * 0.9, -s * 0.85, -s * 1.3, -s * 0.4 + k * 0.2, mane, s * 0.15);
    if (armored) { rect(c, -s * 0.6, -s * 1.05, s * 1.2, s * 0.35, 'rgba(200,205,215,0.85)'); }
  }
  function dragon(c, s, a, body, belly, big) {
    const f = Math.sin(a * (big ? 5 : 8)), wy = f * s * 0.8;
    poly(c, [-s * 0.2, -s * 1.3, -s * 1.6, -s * 2.4 + wy, -s * 2.2, -s * 1.4 + wy * 0.5, -s * 1.4, -s * 1.5 + wy * 0.4, -s * 0.9, -s], body, 'rgba(0,0,0,0.4)', 1);
    poly(c, [s * 0.2, -s * 1.3, s, -s * 2.6 + wy, s * 1.6, -s * 1.7 + wy * 0.5, s * 1.1, -s * 1.5 + wy * 0.4, s * 0.6, -s], body, 'rgba(0,0,0,0.4)', 1);
    c.beginPath(); c.moveTo(-s * 0.6, -s); c.quadraticCurveTo(-s * 1.6, -s * 0.6 + f * 3, -s * 2.1, -s * 1.2); c.strokeStyle = body; c.lineWidth = s * 0.22; c.lineCap = 'round'; c.stroke();
    ell(c, 0, -s * 1.05, s * 0.9, s * 0.5, body); ell(c, s * 0.1, -s * 0.9, s * 0.6, s * 0.25, belly);
    c.beginPath(); c.moveTo(s * 0.6, -s * 1.2); c.quadraticCurveTo(s, -s * 1.9, s * 1.35, -s * 1.8); c.strokeStyle = body; c.lineWidth = s * 0.32; c.stroke();
    ell(c, s * 1.45, -s * 1.8, s * 0.42, s * 0.26, body); poly(c, [s * 1.3, -s * 2.0, s * 1.15, -s * 2.4, s * 1.45, -s * 2.05], belly);
    circle(c, s * 1.55, -s * 1.85, s * 0.07, '#ffe05a');
    if (big) glow(c, s * 1.85, -s * 1.75, s * 0.5, '255,140,40', 0.4 + 0.3 * Math.abs(f));
  }

  /** Draw a battle unit. `mine` = belongs to the player (blue ring) vs hostile (red ring). */
  function drawUnit(c, u, mine, time) {
    const s = u.size;
    c.save(); c.translate(u.x, u.y);
    const lift = u.flying ? -18 - Math.sin(u.anim * 3) * 3 : 0;
    ell(c, 0, 1, s * (u.flying ? 0.7 : 0.9), s * 0.32, 'rgba(0,0,0,0.3)');
    c.beginPath(); c.ellipse(0, 1, s * 1.0, s * 0.38, 0, 0, TAU); c.strokeStyle = mine ? 'rgba(90,160,255,0.85)' : 'rgba(255,80,60,0.75)'; c.lineWidth = u.hero || u.boss ? 2.5 : 1.5; c.stroke();
    if (u.elite) { c.beginPath(); c.ellipse(0, 1, s * 1.25, s * 0.48, 0, 0, TAU); c.strokeStyle = 'rgba(255,207,74,' + (0.6 + Math.sin(time * 6) * 0.3) + ')'; c.lineWidth = 2; c.stroke(); }
    if (u.boss) glow(c, 0, -s, s * 2.2, u.enraged ? '255,60,30' : '255,180,80', 0.22);
    if (u.rageT > 0) glow(c, 0, -s, s * 1.6, '255,60,120', 0.35);
    c.translate(0, lift);
    c.save(); c.scale(u.facing, 1);
    (UNIT[u.def.sprite] || UNIT.swordsman)(c, s, u.anim, { swing: u.swing > 0 ? u.swing : 0, friendly: mine });
    c.restore();
    if (u.hit > 0) { c.globalCompositeOperation = 'lighter'; glow(c, 0, -s, s * 1.3, '255,255,255', 0.45); c.globalCompositeOperation = 'source-over'; }
    if (u.slowT > 0) { c.beginPath(); c.ellipse(0, -1, s * 0.9, s * 0.3, 0, 0, TAU); c.strokeStyle = 'rgba(140,210,255,0.9)'; c.lineWidth = 2; c.stroke(); }
    if (u.stunT > 0) for (let i = 0; i < 3; i++) { const a = time * 5 + i * 2.1; circle(c, Math.cos(a) * s * 0.7, -s * 2.6 + Math.sin(a) * 2, 1.8, '#ffe08a'); }
    if (u.count > 1) {
      const n = Math.max(0, Math.ceil(u.hp / u.unitHp - 1e-6));
      c.font = '800 9px system-ui, sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.7)';
      c.strokeText(n, 0, -s * 2.7 - 9); c.fillStyle = mine ? '#bfe0ff' : '#ffc8b8'; c.fillText(n, 0, -s * 2.7 - 9);
    }
    if (!u.boss && (u.hp < u.maxHp || u.hero)) {
      const w = Math.max(16, s * 2.2), y = -s * 2.7 - 5, f = Math.max(0, u.hp / u.maxHp);
      rect(c, -w / 2 - 1, y - 1, w + 2, 5, 'rgba(10,10,20,0.75)');
      rect(c, -w / 2, y, w * f, 3, mine ? (u.hero ? '#ffd76a' : '#5fb0ff') : f > 0.5 ? '#6fd36a' : f > 0.25 ? '#e8c34a' : '#e25a4a');
    }
    c.restore();
  }

  /** Small preview of a unit into a canvas element (UI cards). */
  function unitIcon(cv, sprite, size, opts = {}) {
    const ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
    cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    if (opts.bg) glow(ctx, w / 2, h * 0.6, w * 0.55, opts.bg, 0.4);
    const span = size * (['dragon', 'whelp', 'dragonRider', 'demonLord'].includes(sprite) ? 4.4 : 3.3);
    const sc = Math.min(w, h) / span;
    ctx.translate(w / 2, h * 0.86); ctx.scale(sc, sc);
    (UNIT[sprite] || UNIT.swordsman)(ctx, size, 0.4, { friendly: true });
  }
  function buildingIcon(cv, type, level) {
    const ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
    cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const s = CH.BUILDINGS[type].size;
    const span = s * T + 30;
    const sc = Math.min(w, h) / span;
    ctx.translate(w / 2 - s * T / 2 * sc, h - (s * T + 6) * sc); ctx.scale(sc, sc);
    drawBuilding(ctx, { type, level, tx: 0, ty: 0 }, { time: 1, links: CH.BUILDINGS[type].cat === 'wall' ? 5 : 0, fill: 0.7 });
  }

  return { drawBuilding, drawUnit, unitIcon, buildingIcon, glow, circle, ell, rect, poly, line, rrect, tierOf };
})();
