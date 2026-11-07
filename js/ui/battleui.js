/* =====================================================================
 * Crownhold — ui/battleui.js
 * Battle HUD for all three modes: top info bar, boss bar, deploy bar
 * (troops / heroes / spells / campaign towers), tower panel, blessings
 * and the results screen. Input goes through CH.View's handler.
 * ===================================================================== */
CH.BattleUI = (function () {
  const UI = CH.UI, U = CH.util, T = CH.CONFIG.T, $ = UI.$;
  const st = { b: null, sel: null, pointer: null, hoverTile: null, speed: 1, paused: false, selB: null, key: '', dragLast: null };

  function open(b) {
    st.b = b; st.sel = null; st.selB = null; st.speed = 1; st.paused = false; st.key = '';
    const firstTroop = CH.TROOP_ORDER.find(t => b.army[t] > 0);
    if (b.mode === 'raid' && firstTroop) st.sel = { kind: 'troop', id: firstTroop };
    if (b.mode === 'campaign') st.sel = { kind: 'tower', id: b.towerTypes[0] };
    $('bhud').classList.remove('hidden');
    $('bhud').innerHTML =
      '<div class="b-top"><button class="icon-btn" id="b-quit" title="Leave">' + UI.icon('close') + '</button><div class="bt-info" id="b-info"></div>' +
      '<button class="hud-pill" id="b-speed">1×</button></div>' +
      '<button class="btn btn-gold b-call" id="b-call"></button>' +
      '<div class="b-boss hidden" id="b-boss"><span id="b-boss-name"></span><div class="bar"><i id="b-boss-bar"></i></div></div>' +
      '<div class="b-banner" id="b-banner"></div>' +
      '<div class="b-tower hidden" id="b-tower"></div>' +
      '<nav class="b-bar" id="b-bar"></nav>';
    $('b-quit').onclick = quit;
    $('b-speed').onclick = () => { st.speed = st.speed === 1 ? 2 : st.speed === 2 ? 3 : 1; $('b-speed').textContent = st.speed + '×'; };
    $('b-call').onclick = () => { if (st.b.canCallWave && st.b.canCallWave()) st.b.callWave(); };
    $('b-bar').onclick = onBar;
    $('b-tower').onclick = onTowerPanel;
    renderBar(true);
    const intro = b.mode === 'raid' ? 'Raid ' + b.opponent.name : b.mode === 'defense' ? 'Endless Defense' : 'Stage ' + (b.stage.r + 1) + '-' + (b.stage.s + 1) + ': ' + b.stage.name;
    banner(intro, b.mode === 'raid' ? 'Deploy outside the red zone · drag to deploy a line' : b.mode === 'defense' ? 'Place your heroes, then start the first wave' : CH.OBJECTIVES[b.stage.obj] + (CH.App.view.portrait ? ' Drag to look around.' : ''));
  }
  function close() { st.b = null; $('bhud').classList.add('hidden'); $('bhud').innerHTML = ''; }

  let bannerT;
  function banner(t, sub, cls) {
    const el = $('b-banner'); if (!el) return;
    el.className = 'b-banner'; el.innerHTML = '<b>' + UI.esc(t) + '</b>' + (sub ? '<span>' + UI.esc(sub) + '</span>' : '');
    void el.offsetWidth; el.className = 'b-banner show ' + (cls || '');
    clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------- Deploy bar ---------- */
  function renderBar(force) {
    const b = st.b; if (!b) return;
    const key = JSON.stringify([b.army, b.spells, Object.keys(b.heroesUsed).map(h => [h, b.heroesUsed[h].dead, Math.ceil(b.heroesUsed[h].abilityCd)]), st.sel, b.mode === 'campaign' ? Math.floor(b.gold / 10) : 0]);
    if (!force && key === st.key) return;
    st.key = key;
    const items = [];
    const isSel = (k, id) => st.sel && st.sel.kind === k && st.sel.id === id ? ' sel' : '';
    if (b.mode === 'campaign') for (const t of b.towerTypes) {
      const price = CH.TOWER_PRICE[t];
      items.push('<button class="b-card tower' + isSel('tower', t) + (b.gold < price ? ' poor' : '') + '" data-k="tower" data-id="' + t + '"><canvas data-building="' + t + '" data-level="' + b.towerBase[t] + '"></canvas><span class="n">' + CH.BUILDINGS[t].name.split(' ')[0] + '</span><span class="c">' + UI.icon('gold') + price + '</span></button>');
    }
    for (const t of CH.TROOP_ORDER) if ((b.army[t] || 0) > 0 || b.used[t]) {
      const d = CH.TROOPS[t];
      items.push('<button class="b-card' + isSel('troop', t) + (b.army[t] ? '' : ' empty') + '" data-k="troop" data-id="' + t + '"><canvas data-unit="' + d.sprite + '" data-size="' + d.size + '"></canvas><span class="n">' + d.name + '</span><span class="c">×' + (b.army[t] || 0) + '</span></button>');
    }
    for (const h of b.heroesAvail) {
      const d = CH.HEROES[h], u = b.heroesUsed[h];
      let state = 'Deploy';
      if (u) state = u.dead ? 'Fallen' : u.abilityCd > 0 ? Math.ceil(u.abilityCd) + 's' : d.ability.name;
      items.push('<button class="b-card hero' + isSel('hero', h) + (u && u.dead ? ' empty' : '') + (u && !u.dead && u.abilityCd <= 0 ? ' ready' : '') + '" data-k="hero" data-id="' + h + '"><canvas data-unit="' + d.sprite + '" data-size="' + d.size + '"></canvas><span class="n">' + d.name.split(' ').pop() + '</span><span class="c">' + state + '</span>' + (u && !u.dead && u.abilityCd > 0 ? '<i class="cd" style="--cd:' + (u.abilityCd / d.ability.cd).toFixed(2) + '"></i>' : '') + '</button>');
    }
    for (const sp of CH.SPELL_ORDER) if (CH.State.spellUnlocked(b.save, sp)) {
      items.push('<button class="b-card spell' + isSel('spell', sp) + (b.spells[sp] ? '' : ' empty') + '" data-k="spell" data-id="' + sp + '">' + UI.icon(sp, 'sp') + '<span class="n">' + CH.SPELLS[sp].name.split(' ').pop() + '</span><span class="c">×' + b.spells[sp] + '</span></button>');
    }
    if (!items.length) items.push('<p class="b-empty">No troops, heroes or spells. Train an army at home.</p>');
    $('b-bar').innerHTML = items.join('');
    UI.paintCanvases($('b-bar'));
    positionCall();
  }
  /** Keep the wave / end-battle button just above the deploy bar when they would overlap. */
  function positionCall() {
    const call = $('b-call'), bar = $('b-bar');
    if (!call || !bar) return;
    call.style.bottom = '';
    const c = call.getBoundingClientRect(), r = bar.getBoundingClientRect();
    const overlapX = c.left < r.right && c.right > r.left, overlapY = c.bottom > r.top - 6;
    if (overlapX && overlapY) call.style.bottom = Math.round(window.innerHeight - r.top + 8) + 'px';
  }
  window.addEventListener('resize', () => setTimeout(positionCall, 50));

  function onBar(e) {
    const c = e.target.closest('.b-card'); if (!c || !st.b) return;
    const k = c.dataset.k, id = c.dataset.id, b = st.b;
    CH.Audio.play('click');
    if (k === 'hero' && b.heroesUsed[id]) { if (!b.useAbility(id)) UI.toast(b.heroesUsed[id].dead ? 'This hero has fallen.' : 'Ability recharging.', 'warn'); renderBar(true); return; }
    st.sel = st.sel && st.sel.kind === k && st.sel.id === id ? null : { kind: k, id };
    hideTowerPanel();
    renderBar(true);
  }

  /* ---------- Campaign tower panel ---------- */
  function showTowerPanel(bd) {
    st.selB = bd;
    const b = st.b, c = b.towerUpgradeCost(bd);
    $('b-tower').innerHTML = '<b>' + CH.BUILDINGS[bd.type].name + ' · level ' + bd.level + '</b><span>' + Math.round(bd.atk.dmg) + ' damage · range ' + (bd.atk.range / T).toFixed(1) + '</span>' +
      '<div class="row">' + (c === null ? '<button class="btn" disabled>Max</button>' : '<button class="btn btn-gold" data-t="up"' + (b.gold >= c ? '' : ' disabled') + '>Upgrade ' + UI.icon('gold') + c + '</button>') +
      '<button class="btn btn-danger-quiet" data-t="sell">Sell +' + Math.floor(bd.spent * 0.6) + '</button><button class="icon-btn" data-t="x">' + UI.icon('close') + '</button></div>';
    $('b-tower').classList.remove('hidden');
  }
  function hideTowerPanel() { st.selB = null; const el = $('b-tower'); if (el) el.classList.add('hidden'); }
  function onTowerPanel(e) {
    const a = e.target.closest('[data-t]'); if (!a || a.disabled || !st.selB) return;
    if (a.dataset.t === 'up') { st.b.upgradeTower(st.selB); showTowerPanel(st.selB); }
    else if (a.dataset.t === 'sell') { st.b.sellTower(st.selB); hideTowerPanel(); }
    else hideTowerPanel();
  }

  /* ---------- World input ---------- */
  function act(p, fromDrag) {
    const b = st.b; if (!b || b.result) return false;
    const s = st.sel;
    if (!s) {
      if (b.mode === 'campaign' && !fromDrag) {
        const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), k = b.occ[ty * CH.CONFIG.COLS + tx];
        const bd = k ? b.buildings[k - 1] : null;
        if (bd && bd.placed && !bd.dead) { showTowerPanel(bd); return true; }
        hideTowerPanel();
      }
      return false;
    }
    let r;
    if (s.kind === 'tower') {
      const tx = Math.round(p.x / T - 1), ty = Math.round(p.y / T - 1);
      const k = b.occ[Math.floor(p.y / T) * CH.CONFIG.COLS + Math.floor(p.x / T)];
      if (!fromDrag && k && b.buildings[k - 1].placed) { showTowerPanel(b.buildings[k - 1]); return true; }
      r = b.placeTower(s.id, tx, ty);
      if (!r.ok && !fromDrag) { UI.toast(r.reason || 'Can\'t build there', 'warn'); CH.Audio.play('error'); }
      return r.ok;
    }
    if (s.kind === 'troop') { r = b.deployTroop(s.id, p.x, p.y); if (!r.ok && !fromDrag) { UI.toast(r.reason, 'warn'); CH.Audio.play('error'); } if (!b.army[s.id]) st.sel = null; }
    else if (s.kind === 'hero') { r = b.deployHero(s.id, p.x, p.y); if (!r.ok) { UI.toast(r.reason, 'warn'); CH.Audio.play('error'); } else st.sel = null; }
    else if (s.kind === 'spell') { r = { ok: b.castSpell(s.id, p.x, p.y) }; if (!r.ok) UI.toast('No charges left', 'warn'); st.sel = b.spells[s.id] ? s : null; }
    renderBar(true);
    return r && r.ok;
  }
  const handler = {
    tap(p) { act(p, false); },
    hover(p) { st.pointer = p; st.hoverTile = p ? { tx: Math.round(p.x / T - 1), ty: Math.round(p.y / T - 1) } : null; },
    dragStart(p) { if (st.b && st.b.mode === 'raid' && st.sel && st.sel.kind === 'troop') { st.dragLast = p; act(p, true); return true; } return false; },
    dragMove(p) { st.pointer = p; if (st.dragLast && Math.hypot(p.x - st.dragLast.x, p.y - st.dragLast.y) > 14) { st.dragLast = p; act(p, true); } },
    dragEnd() { st.dragLast = null; },
    cancel() { st.sel = null; hideTowerPanel(); renderBar(true); },
  };

  /* ---------- Per-frame HUD ---------- */
  function tick(dt) {
    const b = st.b; if (!b) return;
    if (!st.paused && !b.pendingBoon && !CH.UI.modalOpen()) {
      const steps = Math.round(dt * 60 * st.speed);
      for (let i = 0; i < Math.min(steps, 12) && !b.result; i++) b.update(1 / 60);
    }
    let info = '', call = '', callOn = false;
    if (b.mode === 'raid') {
      const left = Math.max(0, b.timeLimit - b.time);
      const lg = b.lootGot;
      info = '<span class="pill">' + UI.icon('time') + U.time(left) + '</span><span class="pill stars-pill">' + [0, 1, 2].map(i => '<span class="star' + (i < b.stars ? ' on' : '') + '">' + UI.ICONS.star + '</span>').join('') + '</span><span class="pill">' + b.destruction + '% destroyed</span>' +
        '<span class="pill">' + UI.icon('gold') + U.fmt(lg.gold) + ' ' + UI.icon('wood') + U.fmt(lg.wood) + ' ' + UI.icon('stone') + U.fmt(lg.stone) + '</span>';
      call = 'End battle'; callOn = true;
      $('b-call').onclick = () => { if (!b.result) b.retreat(); };
    } else if (b.mode === 'defense') {
      info = '<span class="pill">Wave ' + b.wave + (b.waveMod ? ' · ' + b.waveMod.name : '') + '</span><span class="pill">Best ' + b.save.defense.best + '</span><span class="pill">' + b.stats.kills + ' slain</span>' +
        '<span class="pill">Banked ' + UI.icon('gold') + U.fmt(b.bank.gold) + ' ' + UI.icon('runes') + b.bank.runes + '</span>';
      const busy = b.spawning || b.units.some(u => u.side === 'atk');
      call = b.wave === 0 ? 'Start wave 1' : busy ? 'Wave in progress' : 'Next wave (' + Math.ceil(Math.max(0, b.breakT)) + ')';
      callOn = !busy && !b.pendingBoon;
    } else {
      const core = b.core;
      info = '<span class="pill">Wave ' + Math.max(0, b.waveIdx + 1) + ' / ' + b.nWaves + '</span><span class="pill gold-pill">' + UI.icon('gold') + Math.floor(b.gold) + '</span>' +
        '<span class="pill">Castle <span class="bar mini"><i style="width:' + Math.round(core.hp / core.maxHp * 100) + '%"></i></span></span>' +
        (b.timeLimit ? '<span class="pill">' + UI.icon('time') + U.time(Math.max(0, b.timeLimit - b.time)) + '</span>' : '');
      const busy = b.spawning || b.units.some(u => u.side === 'atk');
      call = b.waveIdx < 0 ? 'Start wave 1' : b.waveIdx >= b.nWaves - 1 ? 'Final wave' : busy ? 'Call next wave' : 'Next wave (' + Math.ceil(Math.max(0, 10 - b.breakT)) + ')';
      callOn = b.canCallWave();
    }
    if (st.info !== info) { st.info = info; $('b-info').innerHTML = info; }
    const btn = $('b-call');
    if (btn.textContent !== call) btn.textContent = call;
    btn.disabled = !callOn;
    btn.classList.toggle('pulse', callOn && (b.mode !== 'raid') && !b.units.some(u => u.side === 'atk'));
    const boss = b.boss && !b.boss.dead ? b.boss : null;
    $('b-boss').classList.toggle('hidden', !boss);
    if (boss) { $('b-boss-name').textContent = boss.def.name + (boss.enraged ? ' (enraged)' : ''); $('b-boss-bar').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%'; }
    renderBar(false);
    if (st.selB && b.mode === 'campaign' && st.selB.dead) hideTowerPanel();
  }

  /* ---------- Events ---------- */
  function onEvent(type, d) {
    const b = st.b;
    switch (type) {
      case 'sfx': CH.Audio.play(d); break;
      case 'toast': UI.toast(d.text, d.kind === 'gold' ? 'good' : d.kind === 'danger' ? 'bad' : 'info'); break;
      case 'boss': banner(d.def.name, d.def.desc, 'boss'); CH.Audio.startMusic('boss'); break;
      case 'star': banner('★ ' + d.text, d.stars + (d.stars === 1 ? ' star' : ' stars'), 'star'); break;
      case 'wave': banner('Wave ' + d.n + (d.total ? ' of ' + d.total : ''), d.mod ? d.mod.name + ': ' + d.mod.desc : d.boss ? 'The boss approaches!' : d.mini ? 'A mini-boss leads this wave' : ''); break;
      case 'waveClear': UI.toast('Wave ' + d.n + ' cleared · banked ' + U.fmt(d.rw.gold) + ' gold' + (d.rw.runes ? ', ' + d.rw.runes + ' rune' + (d.rw.runes > 1 ? 's' : '') : ''), 'good'); break;
      case 'boon': boonModal(d); break;
      case 'end': setTimeout(() => CH.App.endBattle(b), 1300); break;
    }
  }
  function boonModal(list) {
    UI.modal('<h3>Wave ' + st.b.wave + ' survived!</h3><p>Choose a blessing for your kingdom.</p><div class="boons">' +
      list.map(x => '<button class="boon" data-boon="' + x.id + '"><b>' + x.name + '</b><span>' + x.desc + '</span></button>').join('') + '</div>',
    { noClose: true, onClick: e => { const c = e.target.closest('[data-boon]'); if (c && st.b) { st.b.chooseBoon(c.dataset.boon); UI.closeModal(); } } });
  }
  function quit() {
    const b = st.b; if (!b || b.result) return;
    const msg = b.mode === 'raid' ? 'End the raid now? You keep the loot you have taken.' : b.mode === 'defense' ? 'End the defense now? You keep everything banked so far.' : 'Leave this stage? Troops you deployed are lost.';
    UI.modal('<h3>Leave battle?</h3><p>' + msg + '</p><div class="row"><button class="btn btn-gold" data-q>Leave</button><button class="btn" data-close>Keep fighting</button></div>',
      { onClick: e => { if (e.target.closest('[data-q]')) { UI.closeModal(); if (b.mode === 'raid') b.retreat(); else b.finish(b.mode === 'defense' ? 'lose' : 'lose', 'You left the battle.'); } } });
  }

  function drawUi() { return { deployMode: st.sel && (st.sel.kind === 'troop' || st.sel.kind === 'hero'), placeTower: st.sel && st.sel.kind === 'tower' ? st.sel.id : null, hoverTile: st.hoverTile, spellAim: st.sel && st.sel.kind === 'spell' ? st.sel.id : null, pointer: st.pointer, selectedB: st.selB }; }

  return { open, close, tick, handler, onEvent, drawUi, state: st };
})();
