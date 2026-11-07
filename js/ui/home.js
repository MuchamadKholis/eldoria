/* =====================================================================
 * Crownhold — ui/home.js
 * The interactive kingdom: HUD, goals, dock, selecting buildings,
 * the building panel, the upgrade dialog, the build shop, and placing
 * or moving buildings (tap, drag, or the ✓/✗ bar).
 * ===================================================================== */
CH.Home = (function () {
  const UI = CH.UI, S = CH.State, B = CH.BUILDINGS, U = CH.util, T = CH.CONFIG.T, $ = UI.$;
  const st = { selected: null, ghost: null, moving: null, floaters: [], hud: {} };
  const save = () => CH.App.save;
  const persist = () => CH.App.persist();

  /* ---------------- HUD ---------------- */
  function buildHud() {
    $('hud').innerHTML =
      '<button class="player" id="hud-player" aria-label="Player profile"><span class="lvl" id="hud-lvl">1</span><span class="pname"><b id="hud-name"></b><span class="xpbar"><i id="hud-xp"></i></span></span></button>' +
      '<div class="res-row">' + ['gold', 'wood', 'stone', 'food'].map(r => '<button class="res" data-res="' + r + '" title="' + r[0].toUpperCase() + r.slice(1) + '">' + UI.icon(r) + '<span class="res-txt"><b id="hud-' + r + '">0</b><span class="cap"><i id="hud-' + r + '-bar"></i></span></span></button>').join('') +
      '<button class="res gem" data-res="gems" title="Gems">' + UI.icon('gems') + '<b id="hud-gems">0</b></button>' +
      '<button class="res gem" data-res="runes" title="Runes (rare material)">' + UI.icon('runes') + '<b id="hud-runes">0</b></button></div>' +
      '<button class="icon-btn mail-btn" id="hud-mail" aria-label="Reports">✉<b id="hud-unread"></b></button>' +
      '<button class="icon-btn" id="hud-settings" aria-label="Settings">' + UI.icon('gear') + '</button>';
    $('alert').onclick = () => { CH.Audio.play('click'); CH.WorldUI.incomingModal(); };
    $('warbar').onclick = () => { CH.Audio.play('click'); const th = CH.App.save.world.throne; CH.WorldUI.open(th); CH.WorldUI.select({ type: 'throne', o: th }); };
    $('hud').onclick = e => {
      if (e.target.closest('#hud-player')) UI.sheet('profile');
      else if (e.target.closest('#hud-settings')) UI.sheet('settings');
      else if (e.target.closest('#hud-mail')) UI.sheet('mail');
      else if (e.target.closest('[data-res="gems"]')) UI.sheet('store');
      else if (e.target.closest('[data-res]')) UI.sheet('resources');
    };
    $('dock').innerHTML =
      '<button class="dock-btn big red" data-dock="world">' + UI.icon('swords') + '<span>World</span></button>' +
      '<button class="dock-btn big" data-dock="campaign">' + UI.icon('map') + '<span>Campaign</span></button>' +
      '<button class="dock-btn" data-dock="build">' + UI.icon('hammer') + '<span>Build</span></button>' +
      '<button class="dock-btn" data-dock="army">' + UI.icon('army') + '<span>Army</span></button>' +
      '<button class="dock-btn" data-dock="heroes">' + UI.icon('crown') + '<span>Heroes</span></button>' +
      '<button class="dock-btn" data-dock="more">' + UI.icon('more') + '<span>More</span></button>';
    $('dock').onclick = e => {
      const b = e.target.closest('[data-dock]'); if (!b) return;
      CH.Audio.play('click'); cancelPlacement(); deselect();
      const k = b.dataset.dock;
      if (k === 'world') CH.WorldUI.open();
      else if (k === 'build') UI.sheet('shop');
      else if (k === 'more') moreMenu();
      else UI.sheet(k);
    };
    $('sidebar').onclick = e => {
      const g = e.target.closest('[data-goal]');
      if (g) { CH.Audio.play('click'); runGoal(JSON.parse(g.dataset.goal)); return; }
      if (e.target.closest('#tasks-toggle')) { st.tasksOpen = !tasksOpen(); CH.Audio.play('click'); refreshHud(true); return; }
      if (e.target.closest('#collect-all')) collectAll();
      if (e.target.closest('#builders-chip')) UI.sheet('buildings');
    };
    $('placebar').onclick = e => {
      if (e.target.closest('[data-place=ok]')) confirmPlacement();
      else if (e.target.closest('[data-place=no]')) cancelPlacement();
    };
    $('panel').onclick = onPanelClick;
  }
  function moreMenu() {
    UI.modal('<h3>Kingdom</h3><div class="more-grid">' +
      [['ranks', 'crown', 'Leaderboards'], ['skins', 'shield', 'Skins'], ['store', 'gems', 'Gem Shop'], ['mail', 'map', 'Reports'], ['bag', 'crown', 'Bag'], ['infirmary', 'heal', 'Infirmary'], ['factions', 'shield', 'Factions'], ['events', 'crown', 'Events'], ['trade', 'gold', 'Trading Post'],
        ['buildings', 'hammer', 'Buildings'], ['lab', 'flask', 'Academy'], ['resources', 'stone', 'Resources'], ['profile', 'crown', 'Profile'], ['settings', 'gear', 'Settings'], ['redeem', 'gems', 'Redeem code'], ['howto', 'map', 'How to play']]
        .map(([k, i, n]) => '<button class="more-btn" data-more="' + k + '">' + UI.icon(i) + '<span>' + n + '</span></button>').join('') + '</div>',
    { onClick: e => { const b = e.target.closest('[data-more]'); if (b) { UI.closeModal(); UI.sheet(b.dataset.more); } } });
  }
  function runGoal(g) {
    if (g.act === 'build') UI.sheet('shop', g.type);
    else if (g.act === 'campaign') UI.sheet('campaign');
    else if (g.act === 'endless' || g.act === 'world') CH.WorldUI.open();
    else if (g.act === 'army') UI.sheet('army');
    else if (g.act === 'castle') { select(S.castle(save())); CH.App.view.frame(S.area(save()), 2); }
  }

  function setText(id, v) { if (st.hud[id] !== v) { st.hud[id] = v; const n = $(id); if (n) n.textContent = v; } }
  function refreshHud(force) {
    const s = save();
    if (force) st.hud = {};
    for (const r of ['gold', 'wood', 'stone', 'food']) {
      setText('hud-' + r, U.fmt(s.res[r]));
      const f = Math.min(1, s.res[r] / S.capacity(s, r));
      const key = 'bar' + r, v = Math.round(f * 100);
      if (st.hud[key] !== v) { st.hud[key] = v; const el = $('hud-' + r + '-bar'); if (el) { el.style.width = v + '%'; el.classList.toggle('full', v >= 100); } }
    }
    setText('hud-gems', U.fmt(s.res.gems)); setText('hud-runes', U.fmt(s.res.runes));
    setText('hud-unread', s.unread ? String(s.unread) : '');
    CH.WorldUI.warBanner();
    // Incoming attack banner
    const inc = s.world ? CH.World.incoming(s) : [];
    const ab = $('alert');
    if (inc.length) {
      const m = inc[0], k = s.world.kingdoms.find(x => x.id === m.owner);
      const txt = '⚔ ' + (k ? k.name : 'An army') + ' attacks in ' + U.time((m.t1 - Date.now()) / 1000) + ' · tap to prepare';
      if (st.hud.alert !== txt) { st.hud.alert = txt; ab.textContent = txt; }
      ab.classList.remove('hidden');
    } else { ab.classList.add('hidden'); st.hud.alert = ''; }
    setText('hud-lvl', String(s.player.level)); setText('hud-name', s.player.name);
    const xp = Math.round(s.player.xp / S.xpFor(s.player.level) * 100);
    if (st.hud.xp !== xp) { st.hud.xp = xp; $('hud-xp').style.width = xp + '%'; }
    // Sidebar: builders, collect, goals
    const goals = S.goals(s).slice(0, 3);
    const sideKey = S.busy(s) + '/' + S.builders(s) + '|' + goals.map(g => g.text).join('|') + '|' + canCollect() + '|' + tasksOpen();
    if (st.hud.side !== sideKey || force) {
      st.hud.side = sideKey;
      $('sidebar').innerHTML =
        '<div class="side-row"><button class="chip-btn" id="builders-chip" title="Builders busy / total">' + UI.icon('hammer') + 'Builders ' + (S.builders(s) - S.busy(s)) + '/' + S.builders(s) + ' free</button>' +
        (canCollect() ? '<button class="chip-btn gold" id="collect-all">' + UI.icon('gold') + 'Collect all</button>' : '') + '</div>' +
        (goals.length ? '<div class="goals' + (tasksOpen() ? ' open' : '') + '"><button class="goals-head" id="tasks-toggle" aria-expanded="' + tasksOpen() + '"><span>📜 Tasks</span><b>' + goals.length + '</b><i class="chev">' + (tasksOpen() ? '▴' : '▾') + '</i></button>' +
          goals.map((g, i) => '<button class="goal' + (i === 0 ? ' first' : '') + '" data-goal=\'' + UI.esc(JSON.stringify(g)) + '\'>' + UI.esc(g.text) + '</button>').join('') + '</div>' : '');
    }
    if (st.selected) renderPanel(false);
  }
  // Tasks start expanded on wide screens and collapsed (first task only) on phones.
  const tasksOpen = () => (st.tasksOpen === undefined ? window.innerWidth > 760 : st.tasksOpen);
  const canCollect = () => save().buildings.some(b => B[b.type].cat === 'econ' && b.buf >= 10);

  /* ---------------- Selection & panel ---------------- */
  function buildingAt(x, y) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    const s = save();
    for (let i = s.buildings.length - 1; i >= 0; i--) { const b = s.buildings[i], sz = B[b.type].size; if (tx >= b.tx && ty >= b.ty && tx < b.tx + sz && ty < b.ty + sz) return b; }
    return null;
  }
  function select(b) { st.selected = b; st.panelKey = ''; renderPanel(true); }
  function deselect() { st.selected = null; $('panel').classList.add('hidden'); }

  function statLines(type, L) {
    const d = B[type], out = [];
    if (!L) return out;
    if (d.hp && d.cat !== 'trap' && d.cat !== 'obstacle') out.push(['Health', U.fmt(d.hp(L))]);
    if (d.prod) out.push(['Production', U.fmt(d.prod(L) * 60) + ' / hour'], ['Holds', U.fmt(d.buf(L))]);
    if (d.cap && type !== 'castle') out.push(['Storage', '+' + U.fmt(d.cap(L))]);
    if (type === 'castle') out.push(['Storage (each)', U.fmt(d.cap(L))], ['Kingdom size', CH.CONFIG.AREA[L - 1].join(' × ')]);
    if (d.atk) out.push(['Damage', U.fmt(d.atk.dmg(L)) + (d.atk.splash ? ' (area)' : '')], ['Attacks / sec', d.atk.rate], ['Range', d.atk.range + ' tiles'], ['Targets', (d.atk.ground ? 'Ground' : '') + (d.atk.ground && d.atk.air ? ' & ' : '') + (d.atk.air ? 'Air' : '')]);
    if (d.trap) out.push(['Damage', U.fmt(d.trap.dmg ? d.trap.dmg(L) : d.trap.dps(L) + '/s')]);
    if (d.trains) out.push(['Batch size', U.fmt(d.batch(L))], ['Training speed', '+' + 4 * (L - 1) + '%'], ['Troops', CH.TROOP_ORDER.filter(t => CH.TROOPS[t].building === type && CH.TROOPS[t].unlock <= L).map(t => CH.TROOPS[t].name).join(', ') || '—']);
    if (type === 'infirmary') out.push(['Beds', U.fmt(d.beds(L))]);
    if (type === 'embassy') out.push(['Reinforcements', U.fmt(d.reinforce(L)) + ' troops']);
    if (type === 'tradingPost') out.push(['Trade rate', Math.round(d.rate(L) * 100) + '%']);
    if (type === 'watchtower') out.push(['Intel', L >= 5 ? 'Exact troops & hero' : L >= 3 ? 'Army size' : 'Attacker & ETA']);
    if (type === 'trapWorkshop') out.push(['Max trap level', L]);
    if (type === 'heroHall') out.push(['Heroes', CH.HERO_ORDER.filter(h => CH.HEROES[h].unlock <= L).length], ['Hero level cap', L * 2]);
    if (type === 'lab') out.push(['Research cap', 'Level ' + CH.RESEARCH.maxLevel(L)]);
    return out;
  }

  function renderPanel(force) {
    const b = st.selected, s = save();
    if (!b || !s.buildings.includes(b)) return deselect();
    const now = Date.now();
    const key = b.level + '|' + (b.job ? Math.ceil((b.job.ends - now) / 1000) : '-') + '|' + Math.floor(b.buf / 5) + '|' + s.res.gold + s.res.wood + s.res.stone + s.res.gems + '|' + S.freeBuilders(s);
    if (!force && key === st.panelKey) return;
    st.panelKey = key;
    const d = B[b.type];
    let status = '', actions = [];
    if (d.cat === 'obstacle') {
      const cl = CH.OBSTACLE_CLEAR[b.type];
      status = b.job ? 'Clearing… ' + U.time((b.job.ends - now) / 1000) : 'Clear it for ' + UI.reward(cl.yield) + ' and a chance of gems.';
      if (!b.job) actions.push('<button class="btn btn-gold" data-p="clear">Clear ' + UI.cost(cl.cost, s) + '</button>');
    } else {
      if (b.job) status = (b.job.kind === 'build' ? 'Building' : 'Upgrading to level ' + b.job.to) + ' · ' + U.time((b.job.ends - now) / 1000) + ' left';
      if (d.cat === 'econ' && b.level) status = (status ? status + ' · ' : '') + U.fmt(b.buf) + ' / ' + U.fmt(d.buf(b.level)) + ' ready';
      if (b.job) actions.push('<button class="btn btn-gem" data-p="speed"' + (s.res.gems >= S.speedUpCost(b) ? '' : ' disabled') + '>Finish now ' + UI.icon('gems') + S.speedUpCost(b) + '</button>');
      if (b.job) for (const it of ['speed5m', 'speed1h']) if (s.items[it] > 0) actions.push('<button class="btn" data-p="item" data-item="' + it + '">' + CH.ITEMS[it].name.replace('Speed-up ', '−') + ' (' + s.items[it] + ')</button>');
      if (d.cat === 'econ' && b.level) actions.push('<button class="btn" data-p="collect"' + (b.buf >= 1 ? '' : ' disabled') + '>Collect</button>');
      if (!b.job && d.maxLevel > 1) {
        const why = S.upgradeBlocker(s, b);
        const maxed = b.level >= Math.min(d.maxLevel, b.type === 'castle' ? 8 : 99);
        actions.push(maxed ? '<button class="btn" disabled>Max level</button>' : '<button class="btn btn-gold" data-p="upgrade">Upgrade…</button>');
        if (why && !maxed && why !== 'Not enough resources') status = (status ? status + ' · ' : '') + why;
      }
      if (d.trains) actions.push('<button class="btn" data-p="army" data-bld="' + b.type + '">Train</button>');
      if (b.type === 'infirmary') actions.push('<button class="btn" data-p="infirmary">Heal</button>');
      if (b.type === 'embassy') actions.push('<button class="btn" data-p="factions">Factions</button>');
      if (b.type === 'tradingPost') actions.push('<button class="btn" data-p="trade">Trade</button>');
      if (b.type === 'watchtower') actions.push('<button class="btn" data-p="watch">Incoming</button>');
      if (b.type === 'heroHall') actions.push('<button class="btn" data-p="heroes">Heroes</button>');
      if (b.type === 'lab') actions.push('<button class="btn" data-p="lab">Research</button>');
      if (b.type === 'wall') actions.push('<button class="btn" data-p="walls">Upgrade all L' + b.level + '</button>');
      actions.push('<button class="btn btn-quiet" data-p="move">Move</button>');
    }
    $('panel').innerHTML =
      '<div class="panel-head"><canvas data-building="' + b.type + '" data-level="' + Math.max(1, b.level) + '"></canvas><div><h3>' + d.name + (d.maxLevel > 1 ? ' <span class="lv">Level ' + b.level + '</span>' : '') + '</h3><p>' + (status || d.desc) + '</p></div>' +
      '<button class="x-btn" data-p="close" aria-label="Close">' + UI.icon('close') + '</button></div>' +
      '<dl class="stats">' + statLines(b.type, b.level).map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('') + '</dl>' +
      '<div class="panel-actions">' + actions.join('') + '</div>';
    $('panel').classList.remove('hidden');
    UI.paintCanvases($('panel'));
  }

  function onPanelClick(e) {
    const a = e.target.closest('[data-p]'); if (!a || a.disabled) return;
    const b = st.selected, s = save();
    CH.Audio.play('click');
    switch (a.dataset.p) {
      case 'close': deselect(); break;
      case 'collect': collectOne(b); break;
      case 'speed': if (S.speedUp(s, b.id)) { CH.App.handleEvents(S.tick(s)); persist(); select(b); } break;
      case 'upgrade': upgradeDialog(b); break;
      case 'move': startMove(b); break;
      case 'army': UI.sheet('army', a.dataset.bld); break;
      case 'infirmary': UI.sheet('infirmary'); break;
      case 'factions': UI.sheet('factions'); break;
      case 'trade': UI.sheet('trade'); break;
      case 'watch': if (CH.World.incoming(s).length) CH.WorldUI.incomingModal(); else UI.toast('No armies are marching on you right now.', 'good'); break;
      case 'item': { const r = S.useItem(s, a.dataset.item, Date.now(), { kind: 'building', id: b.id }); if (!r.ok) { UI.toast(r.reason, 'warn'); break; } CH.App.handleEvents(S.tick(s)); persist(); select(b); break; }
      case 'heroes': UI.sheet('heroes'); break;
      case 'lab': UI.sheet('lab'); break;
      case 'clear': { const r = S.clearObstacle(s, b.id); if (!r.ok) { UI.toast(r.reason, 'warn'); CH.Audio.play('error'); } else { CH.Audio.play('build'); persist(); select(b); } break; }
      case 'walls': {
        let n = 0;
        for (const w of s.buildings.filter(x => x.type === 'wall' && x.level === b.level)) if (S.upgrade(s, w.id).ok) n++;
        if (n) { UI.toast(n + ' wall' + (n > 1 ? 's' : '') + ' upgraded', 'good'); CH.Audio.play('upgrade'); persist(); } else UI.toast('Not enough stone', 'warn');
        select(b); break;
      }
    }
  }

  /** The upgrade interface: current vs next level, cost and time. */
  function upgradeDialog(b) {
    const s = save(), d = B[b.type], L = b.level + 1;
    const cur = Object.fromEntries(statLines(b.type, b.level)), nxt = statLines(b.type, L);
    const why = S.upgradeBlocker(s, b);
    const unlocks = b.type === 'castle' ? '<div class="unlocks"><h4>Unlocks at castle level ' + L + '</h4><ul>' + S.unlocksAt(L).map(x => '<li>' + UI.esc(x) + '</li>').join('') + '</ul></div>' : '';
    UI.modal('<div class="up-head"><canvas data-building="' + b.type + '" data-level="' + L + '"></canvas><div><h3>Upgrade ' + d.name + '</h3><p>Level ' + b.level + ' → ' + L + (d.special ? '<br><small>' + d.special + '</small>' : '') + '</p></div></div>' +
      '<dl class="stats compare">' + nxt.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + (cur[k] !== undefined && String(cur[k]) !== String(v) ? '<s>' + cur[k] + '</s> ' : '') + '<b>' + v + '</b></dd></div>').join('') + '</dl>' + unlocks +
      '<div class="up-cost"><div>' + UI.cost(d.cost(L), s) + '</div><span class="chip">' + UI.icon('time') + (d.instant ? 'Instant' : U.time(d.time(L))) + '</span></div>' +
      (why ? '<p class="warn">' + why + '</p>' : '') +
      '<button class="btn btn-gold btn-lg btn-block" data-up' + (why ? ' disabled' : '') + '>Upgrade</button>',
    { onClick: e => {
      if (!e.target.closest('[data-up]')) return;
      const r = S.upgrade(s, b.id);
      if (r.ok) { CH.Audio.play(r.instant ? 'upgrade' : 'build'); persist(); UI.closeModal(); select(b); refreshHud(true); }
      else { UI.toast(r.reason, 'warn'); CH.Audio.play('error'); }
    } });
  }

  /* ---------------- Collecting ---------------- */
  function floater(x, y, text, color) { st.floaters.push({ x, y, text, color, life: 1.4 }); }
  function collectOne(b) {
    const d = B[b.type], amt = S.collect(save(), b.id);
    if (amt > 0) { floater((b.tx + 1) * T, b.ty * T, '+' + U.fmt(amt), d.res === 'gold' ? '#ffe07a' : d.res === 'wood' ? '#e8b878' : '#e0ddd6'); CH.Audio.play('collect'); persist(); refreshHud(); }
    else if (b.buf >= 1) { UI.toast('Your ' + (d.res === 'gold' ? 'gold vaults are' : d.res === 'wood' ? 'timber yards are' : 'stone depots are') + ' full. Build or upgrade storage.', 'warn'); CH.Audio.play('error'); }
  }
  function collectAll() {
    const s = save(), before = s.buildings.filter(b => B[b.type].cat === 'econ').map(b => ({ b, buf: b.buf }));
    const got = S.collectAll(s);
    for (const { b, buf } of before) if (buf - b.buf >= 1) floater((b.tx + 1) * T, b.ty * T, '+' + U.fmt(buf - b.buf), '#ffe07a');
    if (got.gold + got.wood + got.stone > 0) { CH.Audio.play('collect'); persist(); refreshHud(true); } else UI.toast('Storage is full. Upgrade your storage buildings.', 'warn');
  }

  /* ---------------- Placement & moving ---------------- */
  function nearestFree(type, cx, cy) {
    const s = save(), sz = B[type].size;
    let best = null, bd = Infinity;
    const a = S.area(s);
    for (let ty = a.y; ty <= a.y + a.h - sz; ty++) for (let tx = a.x; tx <= a.x + a.w - sz; tx++) {
      if (!S.tilesFree(s, tx, ty, sz)) continue;
      const d = (tx + sz / 2 - cx) ** 2 + (ty + sz / 2 - cy) ** 2;
      if (d < bd) { bd = d; best = { tx, ty }; }
    }
    return best;
  }
  function startPlacement(type) {
    const s = save();
    const why = S.buildBlocker(s, type);
    if (why) { UI.toast(why, 'warn'); CH.Audio.play('error'); return; }
    UI.closeSheets(); deselect();
    const v = CH.App.view, c = v.toWorld(v.canvas.getBoundingClientRect().left + v.w / 2, v.canvas.getBoundingClientRect().top + v.h / 2);
    const spot = nearestFree(type, c.x / T, c.y / T);
    if (!spot) { UI.toast('No free space. Clear obstacles or upgrade the castle to expand.', 'warn'); return; }
    st.ghost = { type, tx: spot.tx, ty: spot.ty, valid: true, mode: 'new' };
    showPlacebar(B[type].name + ' · ' + UI.cost(S.buildCost(s, type), s));
  }
  function startMove(b) {
    st.moving = b;
    st.ghost = { type: b.type, level: b.level, tx: b.tx, ty: b.ty, valid: true, mode: 'move', id: b.id };
    $('panel').classList.add('hidden');
    showPlacebar('Move ' + B[b.type].name);
  }
  function showPlacebar(label) {
    $('placebar').innerHTML = '<span>' + label + '</span><button class="round-btn ok" data-place="ok" aria-label="Confirm">' + UI.icon('check') + '</button><button class="round-btn no" data-place="no" aria-label="Cancel">' + UI.icon('close') + '</button>';
    $('placebar').classList.remove('hidden');
  }
  function setGhost(x, y) {
    const g = st.ghost, sz = B[g.type].size;
    g.tx = Math.round(x / T - sz / 2); g.ty = Math.round(y / T - sz / 2);
    g.valid = S.tilesFree(save(), g.tx, g.ty, sz, g.mode === 'move' ? g.id : undefined);
  }
  function confirmPlacement() {
    const g = st.ghost; if (!g) return;
    const s = save();
    if (g.mode === 'move') {
      if (S.move(s, g.id, g.tx, g.ty)) { CH.Audio.play('place'); persist(); const b = st.moving; cancelPlacement(); select(b); }
      else { UI.toast('That spot is blocked', 'warn'); CH.Audio.play('error'); }
      return;
    }
    const r = S.build(s, g.type, g.tx, g.ty);
    if (!r.ok) { UI.toast(r.reason, 'warn'); CH.Audio.play('error'); if (r.reason !== 'That spot is blocked') cancelPlacement(); return; }
    CH.Audio.play(B[g.type].instant ? 'place' : 'build');
    persist(); refreshHud(true);
    // Walls and traps keep placing; everything else selects the new building.
    if (B[g.type].instant && !S.buildBlocker(s, g.type)) {
      const nx = g.tx + (B[g.type].cat === 'wall' ? 1 : 2);
      st.ghost = { ...g, tx: nx, ty: g.ty };
      st.ghost.valid = S.tilesFree(s, st.ghost.tx, st.ghost.ty, B[g.type].size);
      showPlacebar(B[g.type].name + ' · ' + UI.cost(S.buildCost(s, g.type), s) + ' · ' + S.countOf(s, g.type) + '/' + S.maxCount(s, g.type));
    } else { cancelPlacement(); select(r.building); }
  }
  function cancelPlacement() { st.ghost = null; st.moving = null; $('placebar').classList.add('hidden'); }

  /* ---------------- Pointer handler for the kingdom view ---------------- */
  const handler = {
    tap(p, e) {
      if (st.ghost) {
        const g = st.ghost, sz = B[g.type].size;
        const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
        const onGhost = tx >= g.tx && ty >= g.ty && tx < g.tx + sz && ty < g.ty + sz;
        if (e.pointerType === 'mouse' || onGhost) { if (e.pointerType === 'mouse') setGhost(p.x, p.y); confirmPlacement(); }
        else setGhost(p.x, p.y);
        return;
      }
      const b = buildingAt(p.x, p.y);
      if (!b) return deselect();
      if (B[b.type].cat === 'econ' && b.level && b.buf >= Math.max(10, B[b.type].buf(b.level) * 0.08) && st.selected !== b) { collectOne(b); select(b); return; }
      CH.Audio.play('click');
      select(b);
    },
    hover(p) { if (st.ghost && p && st.ghost.mode === 'new') setGhost(p.x, p.y); },
    dragStart(p) {
      if (st.ghost) { const g = st.ghost, sz = B[g.type].size, tx = Math.floor(p.x / T), ty = Math.floor(p.y / T); if (tx >= g.tx - 1 && ty >= g.ty - 1 && tx <= g.tx + sz && ty <= g.ty + sz) { st.dragGhost = true; return true; } return false; }
      const b = buildingAt(p.x, p.y);
      if (b && b === st.selected) { startMove(b); st.dragGhost = true; st.dragRelease = true; return true; }
      return false;
    },
    dragMove(p) { if (st.ghost) setGhost(p.x, p.y); },
    dragEnd() { st.dragGhost = false; if (st.dragRelease) { st.dragRelease = false; if (st.ghost && st.ghost.valid) confirmPlacement(); } },
    cancel() { cancelPlacement(); deselect(); },
  };

  function update(dt) {
    for (const f of st.floaters) { f.life -= dt; f.y -= 28 * dt; }
    st.floaters = st.floaters.filter(f => f.life > 0);
  }

  return { buildHud, refreshHud, handler, state: st, update, select, deselect, startPlacement, cancelPlacement, statLines, upgradeDialog };
})();
