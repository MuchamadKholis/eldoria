/* =====================================================================
 * Eldoria — ui/world.js
 * World map screen, target panels, march dialog, marches drawer,
 * battle/scout reports, incoming-attack warnings, teleport, battle
 * replays and the "while you were away" summary.
 * ===================================================================== */
CH.WorldUI = (function () {
  const UI = CH.UI, S = CH.State, U = CH.util, $ = UI.$, TW = CH.WorldView.TW;
  const st = { sel: null, filters: { kin: true, mon: true, res: true, diff: 'all' }, teleport: null, drawer: false };
  const save = () => CH.App.save, W = () => CH.App.save.world;
  const icon = UI.icon, esc = UI.esc;
  const troopIcon = (t, n) => '<span class="tchip"><canvas data-unit="' + (CH.TROOPS[t] ? CH.TROOPS[t].sprite : (CH.ENEMIES[t] || {}).sprite || 'swordsman') + '" data-size="10"></canvas><b>' + U.fmt(n) + '</b></span>';
  const armyList = a => Object.keys(a || {}).filter(t => a[t] > 0).map(t => troopIcon(t, a[t])).join('') || '<span class="muted">none</span>';
  const fail = r => { UI.toast(r.reason || 'Not possible', 'warn'); CH.Audio.play('error'); };

  /* ---------------- Screen ---------------- */
  function open(focus) {
    const app = CH.App;
    app.mode = 'world';
    document.body.classList.add('in-world');
    $('wmap').classList.remove('hidden');
    app.wview.resize();
    const w = W();
    if (focus) app.wview.center(focus.x, focus.y); else if (!st.opened) app.wview.center(w.px, w.py);
    st.opened = true;
    app.wview.handler = { tap: onTap };
    render(); CH.Audio.startMusic('battle', 50);
  }
  function close() {
    document.body.classList.remove('in-world');
    $('wmap').classList.add('hidden'); hidePanel(); st.teleport = null;
    CH.App.goHome(false);
  }
  function render() {
    const s = save();
    $('whud').innerHTML =
      '<button class="icon-btn" data-w="home" title="Back to your kingdom">' + icon('back') + '</button>' +
      '<div class="w-coords" id="w-coords"></div>' +
      '<div class="w-btns"><button class="chip-btn" data-w="filters">' + icon('map') + 'Filter</button><button class="chip-btn" data-w="search">' + icon('crown') + 'Go to</button>' +
      '<button class="chip-btn" data-w="mine">' + icon('shield') + 'My castle</button>' +
      '<button class="chip-btn" data-w="mail">✉ <b id="w-unread">' + (s.unread || '') + '</b></button></div>';
    $('whud').onclick = onHud;
    $('wbar').onclick = onBar;
    renderBar(true);
  }
  function onHud(e) {
    const b = e.target.closest('[data-w]'); if (!b) return;
    CH.Audio.play('click');
    const k = b.dataset.w;
    if (k === 'home') close();
    else if (k === 'mine') { CH.App.wview.center(W().px, W().py); selectAt(W().px, W().py); }
    else if (k === 'mail') UI.sheet('mail');
    else if (k === 'filters') filterModal();
    else if (k === 'search') searchModal();
  }
  function filterModal() {
    const f = st.filters;
    UI.modal('<h3>Map filters</h3><div class="row">' + [['kin', 'Kingdoms'], ['mon', 'Monsters'], ['res', 'Resources']].map(([k, n]) => '<button class="tab' + (f[k] ? ' on' : '') + '" data-f="' + k + '">' + n + '</button>').join('') + '</div>' +
      '<h4 class="group">Kingdom strength (vs you)</h4><div class="row">' + [['all', 'All'], ['weak', 'Weaker'], ['even', 'Similar'], ['strong', 'Stronger']].map(([k, n]) => '<button class="tab' + (f.diff === k ? ' on' : '') + '" data-d="' + k + '">' + n + '</button>').join('') + '</div>',
    { onClick: e => { const a = e.target.closest('[data-f]'), d = e.target.closest('[data-d]'); if (a) f[a.dataset.f] = !f[a.dataset.f]; if (d) f.diff = d.dataset.d; if (a || d) { UI.closeModal(); filterModal(); } } });
  }
  function searchModal() {
    const w = W();
    const near = w.kingdoms.map(k => ({ k, d: CH.World.dist(k, { x: w.px, y: w.py }) })).sort((a, b) => a.d - b.d).slice(0, 8);
    UI.modal('<h3>Go to</h3><div class="row"><input id="gx" type="number" inputmode="numeric" placeholder="X" min="0" max="95"><input id="gy" type="number" inputmode="numeric" placeholder="Y" min="0" max="95"><button class="btn btn-gold" data-go>Go</button></div>' +
      '<h4 class="group">Nearby kingdoms</h4><div class="b-list">' + near.map(n => '<button class="b-row" data-k="' + n.k.id + '"><div class="b-info"><b>' + esc(n.k.name) + '</b><span class="muted">Castle ' + n.k.cl + ' · power ' + U.fmt(CH.World.power(n.k)) + ' · ' + n.d.toFixed(0) + ' tiles</span></div></button>').join('') + '</div>',
    { onClick: e => {
      if (e.target.closest('[data-go]')) { const x = +$('gx').value, y = +$('gy').value; if (x >= 0 && y >= 0 && x < 96 && y < 96) { UI.closeModal(); CH.App.wview.center(x, y); selectAt(x, y); } }
      const k = e.target.closest('[data-k]'); if (k) { const kk = W().kingdoms.find(z => z.id === k.dataset.k); UI.closeModal(); CH.App.wview.center(kk.x, kk.y); select({ type: 'kingdom', o: kk }); }
    } });
  }

  /* ---------------- Selection ---------------- */
  function findAt(x, y) {
    const w = W(), d = o => Math.hypot(o.x + 0.5 - x, o.y + 0.5 - y);
    let best = null, bd = 1.1;
    const consider = (type, o) => { const dd = d(o); if (dd < bd) { bd = dd; best = { type, o }; } };
    consider('home', { x: w.px, y: w.py });
    for (const k of w.kingdoms) consider('kingdom', k);
    if (st.filters.mon) { for (const c of w.camps) if (!c.dead) consider('camp', c); for (const r of w.ruins) if (!r.dead) consider('ruin', r); if (w.dragon) consider('dragon', w.dragon); }
    if (st.filters.res) for (const t of w.tiles) consider('tile', t);
    for (const f of w.forts) consider('fort', f);
    for (const m of w.marches) { const p = marchPos(m); if (Math.hypot(p.x + 0.5 - x, p.y + 0.5 - y) < 0.8 && (m.owner === 'player' || m.target.type === 'player')) { best = { type: 'march', o: m }; bd = 0; } }
    return best;
  }
  function marchPos(m) { const p = m.kind === 'gathering' ? 1 : U.clamp((Date.now() - m.t0) / (m.t1 - m.t0), 0, 1); return { x: m.fx + (m.tx - m.fx) * p, y: m.fy + (m.ty - m.fy) * p }; }
  function onTap(x, y) {
    if (st.teleport) { const tx = Math.floor(x), ty = Math.floor(y); st.teleport = { x: tx, y: ty }; teleportPanel(); return; }
    const hit = findAt(x, y);
    if (hit) select(hit); else { CH.Audio.play('click'); select({ type: 'empty', o: { x: Math.floor(x), y: Math.floor(y) } }); }
  }
  function selectAt(x, y) { const h = findAt(x + 0.5, y + 0.5); if (h) select(h); }
  function select(hit) { st.sel = hit; CH.Audio.play('click'); panel(); }
  function hidePanel() { st.sel = null; $('wpanel').classList.add('hidden'); }

  function panel() {
    const s = save(), w = W(), h = st.sel, now = Date.now();
    if (!h) return hidePanel();
    const o = h.o, dist = CH.World.dist(o, { x: w.px, y: w.py });
    let head = '', body = '', acts = '';
    const coords = '<span class="kicker">(' + Math.round(o.x) + ', ' + Math.round(o.y) + ') · ' + dist.toFixed(0) + ' tiles away</span>';
    if (h.type === 'kingdom') {
      const scout = s.reports.find(r => r.kind === 'scout' && r.targetId === o.id);
      const P = CH.PERSONALITIES[o.p], fac = CH.FACTIONS[o.f];
      head = '<h3>' + esc(o.name) + '</h3><p class="muted">' + esc(o.ruler) + ' · <span style="color:' + fac.color + '">' + fac.name + '</span></p>';
      const pow = CH.World.power(o), mine = CH.World.playerDefPower(s);
      const rel = pow < mine * 0.8 ? '<span class="good">Weaker than you</span>' : pow > mine * 1.25 ? '<span class="warn">Stronger than you</span>' : 'About your strength';
      body = '<dl class="stats">' +
        '<div><dt>Castle level</dt><dd>' + o.cl + '</dd></div><div><dt>Power (est.)</dt><dd>' + U.fmt(pow) + '</dd></div>' +
        '<div><dt>Threat</dt><dd>' + rel + '</dd></div><div><dt>Temperament</dt><dd>' + (scout ? P.name : 'Scout to learn') + '</dd></div>' +
        '<div><dt>Record</dt><dd>' + o.wins + ' wins · ' + o.losses + ' losses</dd></div>' +
        '<div><dt>Status</dt><dd>' + (o.sh > now ? '🛡 Shield ' + U.time((o.sh - now) / 1000) : o.tcd > now ? 'Recently raided (' + U.time((o.tcd - now) / 1000) + ')' : o.out ? 'Army away' : 'Open') + '</dd></div>' +
        (o.grudge ? '<div><dt>Grudge vs you</dt><dd class="warn">' + '⚔'.repeat(Math.min(5, o.grudge)) + '</dd></div>' : '') +
        '</dl>' + (scout ? '<p class="muted">Last scout ' + U.time((now - scout.t) / 1000) + ' ago: about ' + U.fmt(scout.troopsTotal) + ' troops, loot ≈ ' + U.fmt(Object.values(scout.loot).reduce((a, n) => a + n, 0)) + '.</p>' : '') +
        (o.hist.length ? '<p class="muted">Recent: ' + o.hist.slice(0, 2).map(x => esc(x.text)).join(' · ') + '</p>' : '');
      const same = s.faction != null && s.faction === o.f;
      acts = same ? '<p class="muted">An ally of your faction.</p>' : '<button class="btn" data-p="scout">' + icon('xp') + 'Scout · 100 gold</button><button class="btn btn-gold" data-p="attack">' + icon('swords') + 'Attack</button>' + (scout ? '<button class="btn btn-quiet" data-p="report">Scout report</button>' : '');
    } else if (h.type === 'camp' || h.type === 'ruin' || h.type === 'dragon') {
      const name = h.type === 'dragon' ? 'Elder Dragon' : h.type === 'ruin' ? 'Ancient Ruins' : CH.CAMP_TYPES[o.kind].name;
      const mon = CH.World.campMonsters(o, w, now), rw = CH.World.campRewards(o, w, now);
      head = '<h3>' + name + ' <span class="lv">Level ' + o.lvl + '</span></h3>';
      body = '<p class="muted">Guarded by:</p><div class="tchips">' + armyList(mon) + '</div><p class="muted">Rewards:</p><div class="chips">' + UI.reward({ ...rw.rw, xp: rw.xp }) + Object.keys(rw.items).map(i => '<span class="chip">' + CH.ITEMS[i].name + '</span>').join('') + '</div>' +
        (h.type === 'dragon' ? '<p class="warn">Event boss! Leaves in ' + U.time((o.until - now) / 1000) + '.</p>' : '');
      acts = '<button class="btn" data-p="scout">' + icon('xp') + 'Scout</button><button class="btn btn-gold" data-p="attack">' + icon('swords') + 'Attack</button>';
    } else if (h.type === 'tile') {
      const busy = o.by ? w.marches.find(m => m.id === o.by) : null;
      head = '<h3>' + CH.RES_TILES[o.type] + ' <span class="lv">Level ' + o.lvl + '</span></h3>';
      body = '<dl class="stats"><div><dt>Resource</dt><dd>' + icon(o.type) + U.fmt(o.amt) + '</dd></div><div><dt>Gather speed</dt><dd>' + U.fmt(6 * o.lvl * 3600) + ' / h' + (CH.World.evOn(w, now, 'resourceRush') ? ' ×2' : '') + '</dd></div></dl><p class="muted">Troops gather up to their carrying capacity (load). Cavalry carry the most.</p>';
      acts = busy ? '<p class="muted">' + (busy.owner === 'player' ? 'Your troops are gathering here.' : 'Occupied.') + '</p>' : '<button class="btn btn-gold" data-p="gather">' + icon(o.type) + 'Gather</button>';
    } else if (h.type === 'fort') {
      head = '<h3>' + (o.owner ? esc(o.ownerName) + '\'s fort' : 'Abandoned Fort') + ' <span class="lv">Level ' + o.lvl + '</span></h3>';
      body = '<p>Holding a fort gives <b>+6% production</b> of every resource (doubled during Castle Siege). Expansionist kingdoms will try to take it from you.</p>';
      acts = o.owner === 'player' ? '<p class="good">You hold this fort.</p>' : '<button class="btn btn-gold" data-p="attack">' + icon('swords') + 'Capture</button>';
    } else if (h.type === 'home') {
      head = '<h3>★ ' + esc(s.player.name) + '</h3><p class="muted">Your kingdom · power ' + U.fmt(S.power(s)) + '</p>';
      body = '<dl class="stats"><div><dt>Protection</dt><dd>' + (S.beginner(s) ? 'Beginner protection' : s.shieldUntil > now ? '🛡 ' + U.time((s.shieldUntil - now) / 1000) : 'None') + '</dd></div><div><dt>March slots</dt><dd>' + S.marchSlots(s) + '</dd></div></dl>';
      acts = '<button class="btn btn-gold" data-p="enter">Enter kingdom</button><button class="btn" data-p="tele-random">Random teleport (' + (s.items.teleRandom || 0) + ')</button><button class="btn" data-p="tele-pick">Advanced teleport (' + (s.items.teleAdvanced || 0) + ')</button>';
    } else if (h.type === 'march') {
      const m = o, tgt = describeTarget(m);
      head = '<h3>' + (m.owner === 'player' ? 'Your march' : '⚠ Enemy army') + '</h3><p class="muted">' + m.kind + ' → ' + esc(tgt) + '</p>';
      body = '<div class="tchips">' + (m.owner === 'player' || S.highestLevel(s, 'watchtower') >= 5 ? armyList(m.army) : '<span class="muted">Upgrade your Watchtower to see their troops.</span>') + '</div><p>Arrives in ' + U.time((m.t1 - now) / 1000) + '</p>';
      acts = m.owner === 'player' && m.kind !== 'return' ? '<button class="btn" data-p="recall" data-id="' + m.id + '">Recall</button>' : '';
    } else {
      head = '<h3>Open land</h3>';
      body = '<p class="muted">Biome: ' + CH.World.biomeAt(o.x, o.y, w.seed) + '.</p>';
      acts = '<button class="btn" data-p="tele-here">Teleport here</button>';
    }
    $('wpanel').innerHTML = '<button class="x-btn" data-p="close" aria-label="Close">' + icon('close') + '</button>' + coords + head + body + '<div class="panel-actions">' + acts + '</div>';
    $('wpanel').classList.remove('hidden');
    $('wpanel').onclick = onPanel;
    UI.paintCanvases($('wpanel'));
  }
  function describeTarget(m) {
    const w = W();
    if (m.target.type === 'player') return save().player.name;
    if (m.target.type === 'home') return 'home';
    const o = CH.World.findAny(w, m.target.id);
    return o ? (o.name || (o.kind ? CH.CAMP_TYPES[o.kind].name : o.type ? CH.RES_TILES[o.type] : o.isDragon ? 'Elder Dragon' : o.lvl ? 'Fort / ruins' : '?')) : '?';
  }
  function onPanel(e) {
    const b = e.target.closest('[data-p]'); if (!b) return;
    const h = st.sel, s = save();
    CH.Audio.play('click');
    switch (b.dataset.p) {
      case 'close': hidePanel(); break;
      case 'attack': marchDialog('attack', h); break;
      case 'gather': marchDialog('gather', h); break;
      case 'scout': {
        const type = h.type === 'dragon' ? 'camp' : h.type;
        const r = CH.World.sendMarch(s, 'scout', { type, id: h.o.id }, {}, null, null);
        if (!r.ok) return fail(r);
        UI.toast('Scouts dispatched. Report in ' + U.time((r.march.t1 - Date.now()) / 1000), 'good'); CH.App.persist(); renderBar(true); break;
      }
      case 'report': { const rep = s.reports.find(r => r.kind === 'scout' && r.targetId === h.o.id); if (rep) showReport(rep); break; }
      case 'enter': close(); break;
      case 'tele-random': { const r = CH.World.teleport(s, null, null); if (!r.ok) return fail(r); CH.Audio.play('magic'); CH.App.persist(); CH.App.wview.center(r.x, r.y); UI.toast('Teleported to (' + r.x + ', ' + r.y + ')', 'good'); hidePanel(); break; }
      case 'tele-pick': st.teleport = { x: W().px, y: W().py }; hidePanel(); UI.toast('Tap a spot on the map to teleport there', 'info'); teleportPanel(); break;
      case 'tele-here': st.teleport = { x: h.o.x, y: h.o.y }; teleportPanel(); break;
      case 'recall': if (CH.World.recall(s, b.dataset.id)) { UI.toast('March recalled', 'good'); CH.App.persist(); hidePanel(); renderBar(true); } break;
    }
  }
  function teleportPanel() {
    const s = save(), t = st.teleport, why = CH.World.canTeleport(s, t.x, t.y);
    $('wpanel').innerHTML = '<span class="kicker">Advanced teleport</span><h3>Move castle to (' + t.x + ', ' + t.y + ')?</h3><p class="' + (why ? 'warn' : 'muted') + '">' + (why || 'Uses an Advanced Teleport (you have ' + (s.items.teleAdvanced || 0) + '), or 300 gems. Incoming attacks lose track of you.') + '</p>' +
      '<div class="panel-actions"><button class="btn btn-gold" data-t="go"' + (why ? ' disabled' : '') + '>Teleport</button><button class="btn" data-t="cancel">Cancel</button></div>';
    $('wpanel').classList.remove('hidden');
    $('wpanel').onclick = e => {
      const b = e.target.closest('[data-t]'); if (!b || b.disabled) return;
      if (b.dataset.t === 'cancel') { st.teleport = null; hidePanel(); return; }
      const r = CH.World.teleport(s, t.x, t.y); if (!r.ok) return fail(r);
      st.teleport = null; CH.Audio.play('magic'); CH.App.persist(); hidePanel(); UI.toast('Castle teleported to (' + r.x + ', ' + r.y + ')', 'good');
    };
  }

  /* ---------------- March dialog ---------------- */
  function marchDialog(kind, h) {
    const s = save(), w = W(), o = h.o, type = h.type === 'dragon' ? 'camp' : h.type;
    const avail = Object.keys(s.army).filter(t => s.army[t] > 0).sort((a, b) => CH.TROOPS[b].power - CH.TROOPS[a].power);
    if (!avail.length) return fail({ reason: 'No troops at home. Train some or wait for marches to return.' });
    const sel = {}; for (const t of avail) sel[t] = kind === 'gather' ? 0 : s.army[t];
    if (kind === 'gather') { const tile = o; let need = tile.amt; for (const t of avail.slice().sort((a, b) => CH.TROOPS[b].load - CH.TROOPS[a].load)) { const n = Math.min(s.army[t], Math.ceil(need / CH.TROOPS[t].load)); sel[t] = n; need -= n * CH.TROOPS[t].load; if (need <= 0) break; } }
    const busy = CH.World.busyHeroes(s);
    const heroes = CH.HERO_ORDER.filter(id => s.heroes[id].unlocked && !busy.has(id));
    let hero = kind === 'attack' ? (heroes[0] || null) : null, formation = 'surround';
    const est = () => {
      if (type === 'kingdom') return CH.World.power(o);
      if (type === 'fort') return o.owner === 'player' ? 0 : 6000 * Math.pow(1.5, o.lvl);
      const mon = CH.World.campMonsters(o, w, Date.now()); let p = 0; for (const t in mon) p += mon[t] * Math.max(5, Math.sqrt((CH.ENEMIES[t].hp || 50) * (CH.ENEMIES[t].dmg || 5)) / 3) * (1 + 0.25 * o.lvl);
      return p;
    };
    const target = est();
    const rows = avail.map(t => '<div class="m-row"><canvas data-unit="' + CH.TROOPS[t].sprite + '" data-size="' + CH.TROOPS[t].size + '"></canvas><div class="m-name"><b>' + CH.TROOPS[t].name + '</b><span class="muted">' + CH.CLASS_NAMES[CH.TROOPS[t].cls] + ' · ' + U.fmt(s.army[t]) + ' home</span></div>' +
      '<input type="range" min="0" max="' + s.army[t] + '" value="' + sel[t] + '" data-t="' + t + '"><input type="number" inputmode="numeric" min="0" max="' + s.army[t] + '" value="' + sel[t] + '" data-n="' + t + '"></div>').join('');
    const heroRow = kind === 'attack' ? '<h4 class="group">Commander</h4><div class="row">' + ['', ...heroes].map(id => '<button class="tab' + ((hero || '') === id ? ' on' : '') + '" data-hero="' + id + '">' + (id ? CH.HEROES[id].name + ' L' + s.heroes[id].level : 'None') + '</button>').join('') + '</div>' : '';
    const formRow = kind === 'attack' && type !== 'camp' ? '<h4 class="group">Formation</h4><div class="row">' + [['surround', 'Surround', 'Attack from every side'], ['spearhead', 'Spearhead', 'One concentrated thrust'], ['pincer', 'Pincer', 'Two flanks at once']].map(([k, n, d]) => '<button class="tab' + (formation === k ? ' on' : '') + '" data-form="' + k + '" title="' + d + '">' + n + '</button>').join('') + '</div>' : '';
    const title = kind === 'gather' ? 'Gather at ' + CH.RES_TILES[o.type] : 'Attack ' + (o.name || (h.type === 'dragon' ? 'the Elder Dragon' : type === 'fort' ? 'the fort' : type === 'ruin' ? 'the ruins' : CH.CAMP_TYPES[o.kind].name));
    UI.modal('<h3>' + esc(title) + '</h3><div class="row"><button class="btn btn-quiet" data-q="all">All</button><button class="btn btn-quiet" data-q="half">Half</button><button class="btn btn-quiet" data-q="none">Clear</button></div>' +
      '<div class="m-list">' + rows + '</div>' + heroRow + formRow + '<div class="m-sum" id="m-sum"></div><button class="btn btn-gold btn-lg btn-block" data-send>March!</button>',
    { cls: 'wide', onClick: e => {
      const q = e.target.closest('[data-q]'), hb = e.target.closest('[data-hero]'), fb = e.target.closest('[data-form]');
      if (q) { for (const t of avail) sel[t] = q.dataset.q === 'all' ? s.army[t] : q.dataset.q === 'half' ? Math.floor(s.army[t] / 2) : 0; sync(); }
      if (hb) { hero = hb.dataset.hero || null; document.querySelectorAll('[data-hero]').forEach(x => x.classList.toggle('on', x === hb)); summary(); }
      if (fb) { formation = fb.dataset.form; document.querySelectorAll('[data-form]').forEach(x => x.classList.toggle('on', x === fb)); }
      if (e.target.closest('[data-send]')) {
        const r = CH.World.sendMarch(s, kind, { type, id: o.id }, { ...sel }, hero, formation);
        if (!r.ok) return fail(r);
        CH.Audio.play('horn'); UI.closeModal(); hidePanel(); CH.App.persist(); renderBar(true);
        UI.toast('Your army marches! Arrival in ' + U.time((r.march.t1 - Date.now()) / 1000), 'good');
      }
    } });
    const m = $('modal');
    m.oninput = e => { const t = e.target.dataset.t || e.target.dataset.n; if (!t) return; sel[t] = U.clamp(Math.floor(+e.target.value || 0), 0, s.army[t]); sync(e.target); };
    function sync(src) { m.querySelectorAll('[data-t]').forEach(x => { if (x !== src) x.value = sel[x.dataset.t]; }); m.querySelectorAll('[data-n]').forEach(x => { if (x !== src) x.value = sel[x.dataset.n]; }); summary(); }
    function summary() {
      const n = Object.values(sel).reduce((a, x) => a + x, 0), pow = CH.World.armyPower(sel) * (hero ? 1.1 : 1), load = CH.World.loadOf(sel);
      const secs = CH.World.marchSeconds({ x: w.px, y: w.py }, o, sel, CH.World.marchSpeedMult(s, hero), kind);
      const odds = kind === 'attack' && target ? pow / target : null;
      $('m-sum').innerHTML = '<span>' + U.fmt(n) + ' troops</span><span>Power ' + U.fmt(pow) + '</span><span>Load ' + U.fmt(load) + '</span><span>' + icon('time') + U.time(secs) + '</span>' +
        (odds ? '<span class="' + (odds > 1.3 ? 'good' : odds > 0.9 ? '' : 'warn') + '">' + (odds > 1.3 ? 'Favourable' : odds > 0.9 ? 'Even fight' : 'Risky') + ' vs ~' + U.fmt(target) + '</span>' : '');
    }
    summary();
  }

  /* ---------------- Marches drawer ---------------- */
  function renderBar(force) {
    const s = save(), w = W(), now = Date.now();
    if (!w) return;
    const mine = w.marches.filter(m => m.owner === 'player'), inc = CH.World.incoming(s);
    const key = mine.map(m => m.id + m.kind).join() + '|' + inc.length + '|' + st.drawer + '|' + Math.floor(now / 1000);
    if (!force && key === st.barKey) return;
    st.barKey = key;
    const slots = S.marchSlots(s), used = mine.filter(m => m.kind !== 'return' && m.kind !== 'scout').length;
    $('wbar').innerHTML = '<button class="chip-btn" data-b="toggle">' + icon('swords') + 'Marches ' + used + '/' + slots + (inc.length ? ' <b class="alert-dot">' + inc.length + '!</b>' : '') + '</button>' +
      (st.drawer ? '<div class="m-drawer">' + (mine.concat(inc).map(m => {
        const left = Math.max(0, (m.t1 - now) / 1000), hostile = m.owner !== 'player';
        return '<div class="m-item' + (hostile ? ' hostile' : '') + '"><span>' + (hostile ? '⚠ ' + esc(W().kingdoms.find(k => k.id === m.owner).name) + ' → you' : m.kind + ' → ' + esc(describeTarget(m))) + '</span><b>' + U.time(left) + '</b>' +
          '<button class="btn btn-quiet" data-b="go" data-x="' + m.tx + '" data-y="' + m.ty + '">View</button>' + (!hostile && m.kind !== 'return' ? '<button class="btn btn-quiet" data-b="recall" data-id="' + m.id + '">Recall</button>' : '') + '</div>';
      }).join('') || '<p class="muted">No marches.</p>') + '</div>' : '');
  }
  function onBar(e) {
    const b = e.target.closest('[data-b]'); if (!b) return;
    CH.Audio.play('click');
    if (b.dataset.b === 'toggle') st.drawer = !st.drawer;
    else if (b.dataset.b === 'go') CH.App.wview.center(+b.dataset.x, +b.dataset.y);
    else if (b.dataset.b === 'recall') { if (CH.World.recall(save(), b.dataset.id)) { CH.App.persist(); UI.toast('March recalled', 'good'); } }
    renderBar(true);
  }

  /* ---------------- Reports ---------------- */
  function sideTable(side, label) {
    if (!side) return '';
    const rows = Object.keys(side.sent || {}).map(t => '<tr><td>' + troopIcon(t, side.sent[t]) + '</td><td>' + (CH.TROOPS[t] ? CH.TROOPS[t].name : (CH.ENEMIES[t] || {}).name || t) + '</td><td class="warn">−' + U.fmt((side.lost || {})[t] || 0) + '</td></tr>').join('');
    return '<div class="rep-side"><h4>' + label + ': ' + esc(side.name) + (side.hero ? ' <span class="muted">with ' + CH.HEROES[side.hero].name + '</span>' : '') + (side.helpers ? ' <span class="good">+' + side.helpers + ' allied</span>' : '') + '</h4><table class="rep-table">' + rows + '</table></div>';
  }
  function showReport(rep) {
    const s = save();
    if (!rep.read) { rep.read = true; s.unread = s.reports.filter(x => !x.read).length; CH.App.persist(); }
    let html = '<span class="kicker">' + new Date(rep.t).toLocaleString() + (rep.coords ? ' · (' + rep.coords.join(', ') + ')' : '') + '</span><h3>' + esc(rep.title) + '</h3>';
    if (rep.kind === 'scout' && rep.res) {
      UI.painters['scout' + rep.id] = cv => CH.View.layoutPreview(cv, rep.layout, { cl: rep.cl, area: (() => { const [w2, h2] = CH.CONFIG.AREA[rep.cl - 1]; return { x: Math.floor((30 - w2) / 2), y: Math.floor((22 - h2) / 2), w: w2, h: h2 }; })() });
      html += '<dl class="stats"><div><dt>Castle</dt><dd>' + rep.cl + '</dd></div><div><dt>Temperament</dt><dd>' + rep.personality + '</dd></div><div><dt>Power</dt><dd>' + U.fmt(rep.power) + '</dd></div><div><dt>Troops</dt><dd>' + (rep.scoutLvl ? '' : '~') + U.fmt(rep.troopsTotal) + '</dd></div>' + (rep.hero ? '<div><dt>Hero</dt><dd>' + CH.HEROES[rep.hero.id].name + ' L' + rep.hero.level + '</dd></div>' : '') + '</dl>' +
        '<p class="muted">Resources' + (rep.scoutLvl >= 2 ? '' : ' (rounded)') + ':</p><div class="chips">' + UI.reward(rep.res) + '</div><p class="muted">Lootable now:</p><div class="chips">' + UI.reward(rep.loot) + '</div>' +
        (rep.troops ? '<div class="tchips">' + armyList(rep.troops) + '</div>' : rep.byClass ? '<div class="chips">' + Object.entries(rep.byClass).map(([c, n]) => '<span class="chip">' + CH.CLASS_NAMES[c] + ' ' + U.fmt(n) + '</span>').join('') + '</div>' : '<p class="muted">Research Scouting at the Academy to see their troops.</p>') +
        '<canvas class="rep-map" data-paint="scout' + rep.id + '"></canvas>' + (rep.hist && rep.hist.length ? '<p class="muted">Recent: ' + rep.hist.map(h => esc(h.text)).join(' · ') + '</p>' : '');
    } else if (rep.kind === 'scout') html += '<div class="tchips">' + armyList(rep.monsters) + '</div>';
    if (rep.atk) {
      const badge = { win: 'Victory', partial: 'Partial victory', loss: 'Defeat', bounced: 'Turned back' }[rep.outcome];
      html += '<p class="badge ' + rep.outcome + '">' + badge + (rep.time ? ' · ' + rep.time + 's' : '') + (rep.destruction != null ? ' · ' + rep.destruction + '% of buildings destroyed' : '') + '</p>' +
        '<div class="rep-sides">' + sideTable(rep.atk, 'Attacker') + sideTable(rep.def, 'Defender') + '</div>';
      if (rep.loot && Object.values(rep.loot).some(n => n > 0)) html += '<p class="muted">' + (rep.you === 'def' ? 'Resources stolen from you:' : 'Loot carried home:') + '</p><div class="chips">' + UI.reward(rep.loot) + '</div>';
      if (rep.reward && Object.values(rep.reward).some(n => n > 0)) html += '<p class="muted">Rewards:</p><div class="chips">' + UI.reward(rep.reward) + Object.keys(rep.items || {}).map(i => '<span class="chip">' + CH.ITEMS[i].name + '</span>').join('') + '</div>';
      if (rep.casualties) html += '<p class="muted">Your casualties: ' + U.fmt(rep.casualties.wounded) + ' wounded (infirmary), ' + U.fmt(rep.casualties.dead) + ' dead.</p>';
      if (rep.dmg) html += '<p class="muted">Damage dealt: attackers ' + U.fmt(rep.dmg.atk) + ' · defenders ' + U.fmt(rep.dmg.def) + '</p>';
    }
    const acts = [];
    if (rep.replay) acts.push('<button class="btn btn-gold" data-r="watch">▶ Watch battle</button>');
    if (rep.atk && rep.you === 'def' && rep.atk.id) acts.push('<button class="btn" data-r="revenge">⚔ Revenge</button>');
    if (rep.coords) acts.push('<button class="btn" data-r="map">Show on map</button>');
    UI.modal(html + '<div class="row">' + acts.join('') + '</div>', { cls: 'wide', onClick: e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      UI.closeModal();
      if (b.dataset.r === 'watch') Replay.open(rep);
      else {
        UI.closeSheets();
        const k = rep.atk && rep.atk.id ? W().kingdoms.find(x => x.id === rep.atk.id) : null;
        open({ x: rep.coords[0], y: rep.coords[1] });
        if (b.dataset.r === 'revenge' && k) select({ type: 'kingdom', o: k }); else selectAt(rep.coords[0], rep.coords[1]);
      }
    } });
  }

  /* ---------------- Incoming attacks ---------------- */
  function incomingModal() {
    const s = save(), inc = CH.World.incoming(s), now = Date.now(), wt = S.highestLevel(s, 'watchtower');
    if (!inc.length) return;
    const m = inc[0], k = W().kingdoms.find(x => x.id === m.owner);
    const n = CH.World.armyCount(m.army);
    const intel = wt >= 5 ? '<div class="tchips">' + armyList(m.army) + '</div><p class="muted">Led by ' + CH.HEROES[m.hero].name + ' (level ' + m.heroLevel + ').</p>'
      : wt >= 3 ? '<p>About <b>' + U.fmt(Math.round(n / 50) * 50) + '</b> troops. Upgrade the Watchtower to level 5 to see exact troops.</p>'
        : wt >= 1 ? '<p class="muted">Upgrade the Watchtower to level 3 to see their army size.</p>' : '<p class="muted">Build a Watchtower to learn more about incoming armies.</p>';
    const hasShield = (s.items.shield2h || 0) + (s.items.shield8h || 0);
    UI.modal('<h3 class="danger-title">⚔ ' + esc(k.name) + ' is attacking!</h3><p>Their army arrives in <b id="inc-eta">' + U.time((m.t1 - now) / 1000) + '</b>. ' + esc(k.ruler) + ' · castle ' + k.cl + (k.grudge ? ' · holds a grudge against you' : '') + '</p>' + intel +
      '<h4 class="group">Prepare</h4><ul class="bullets"><li>Every troop at home defends, together with your towers, walls and traps.</li><li>Your defense hero: <b>' + (s.defenseHero ? CH.HEROES[s.defenseHero].name : 'none') + '</b> (change it in Heroes).</li><li>Raise a Peace Shield and the army will turn back.</li><li>Teleporting away makes them lose track of you.</li></ul>' +
      '<div class="row"><button class="btn btn-gold" data-i="shield"' + (hasShield || s.res.gems >= 200 ? '' : ' disabled') + '>🛡 Peace Shield (' + (hasShield ? 'use item' : '200 gems') + ')</button><button class="btn" data-i="help">Request faction help</button><button class="btn" data-i="map">Show on map</button></div>',
    { onClick: e => {
      const b = e.target.closest('[data-i]'); if (!b || b.disabled) return;
      if (b.dataset.i === 'shield') {
        const id = s.items.shield2h ? 'shield2h' : s.items.shield8h ? 'shield8h' : null;
        if (id) S.useItem(s, id); else { s.res.gems -= 200; s.shieldUntil = Math.max(s.shieldUntil, Date.now()) + 2 * 3600e3; }
        CH.App.persist(); UI.closeModal(); UI.toast('Peace Shield raised. The enemy will turn back.', 'good'); CH.Audio.play('heal');
      } else if (b.dataset.i === 'help') { const r = CH.World.requestHelp(s); if (!r.ok) return fail(r); CH.App.persist(); UI.toast(r.troops + ' allied troops will help defend you for 30 minutes', 'good'); }
      else { UI.closeModal(); UI.closeSheets(); open({ x: m.fx + (m.tx - m.fx) * 0.5, y: m.fy + (m.ty - m.fy) * 0.5 }); }
    } });
  }

  /* ---------------- Battle replay ---------------- */
  const Replay = {
    open(rep) {
      const app = CH.App;
      UI.closeSheets(); UI.closeModal();
      this.rep = rep; this.b = CH.Siege.create(JSON.parse(JSON.stringify(rep.replay))); this.speed = 1; this.paused = false; this.acc = 0; this.wasMode = app.mode;
      this.b.onEvent = (t, d) => { if (t === 'sfx') CH.Audio.play(d); };
      app.mode = 'replay';
      document.body.classList.remove('in-world'); document.body.classList.add('in-battle');
      $('wmap').classList.add('hidden');
      app.view.handler = { tap() {}, dragStart() { return false; } };
      const cl = Math.min(8, rep.replay.cl), [w, h] = CH.CONFIG.AREA[cl - 1];
      app.view.frame({ x: (30 - w) / 2, y: (22 - h) / 2, w, h }, app.view.w < 760 ? 1 : 2.5);
      $('rhud').classList.remove('hidden');
      $('rhud').innerHTML = '<div class="r-top"><button class="icon-btn" data-rp="close">' + icon('close') + '</button><div class="r-names"><b class="blue">' + esc(rep.replay.names[rep.replay.playerSide === 'atk' ? 'atk' : 'def']) + '</b> vs <b class="red">' + esc(rep.replay.names[rep.replay.playerSide === 'atk' ? 'def' : 'atk']) + '</b></div>' +
        '<button class="hud-pill" data-rp="pause">❚❚</button><button class="hud-pill" data-rp="speed">1×</button><button class="hud-pill" data-rp="skip">⏭</button></div><div class="r-bars" id="r-bars"></div><div class="r-time" id="r-time"></div>';
      $('rhud').onclick = e => {
        const b = e.target.closest('[data-rp]'); if (!b) return;
        const k = b.dataset.rp;
        if (k === 'close') this.close();
        else if (k === 'pause') { this.paused = !this.paused; b.textContent = this.paused ? '▶' : '❚❚'; }
        else if (k === 'speed') { this.speed = this.speed >= 3 ? 1 : this.speed + 1; b.textContent = this.speed + '×'; }
        else if (k === 'skip') { while (!this.b.result) this.b.update(this.b.stepDt); }
      };
      CH.Audio.startMusic('boss');
    },
    tick(dt) {
      const b = this.b; if (!b) return;
      if (!this.paused && !b.result) { this.acc += dt * this.speed; let n = 0; while (this.acc >= b.stepDt && n++ < 20) { b.update(b.stepDt); this.acc -= b.stepDt; } }
      else if (b.result) b.updateFx(dt);
      const alive = side => { let n = 0; for (const u of b.squads) if (u.side === side && !u.dead) n += Math.ceil(Math.max(0, u.hp) / u.unitHp - 1e-6); for (const d of b.deployQ) if (d.sq && side === 'atk') n += d.sq.count; return n; };
      const ps = b.playerSide, es = ps === 'atk' ? 'def' : 'atk';
      $('r-bars').innerHTML = '<span class="blue">' + U.fmt(alive(ps)) + ' troops</span><span class="red">' + U.fmt(alive(es)) + ' troops</span>';
      $('r-time').textContent = b.result ? (b.result === 'win' ? 'Victory' : 'Defeat') + ' · ' + Math.round(b.time) + 's' : U.time(Math.max(0, b.timeLimit - b.time)) + ' left';
      CH.View.drawBattle(CH.App.view, b, {}, b.time);
      if (b.result && !this.doneShown) { this.doneShown = true; setTimeout(() => { if (this.b === b) { const rep = this.rep; this.close(); showReport(rep); } }, 2200); }
    },
    close() {
      this.b = null; this.doneShown = false;
      $('rhud').classList.add('hidden'); $('rhud').innerHTML = '';
      document.body.classList.remove('in-battle');
      if (this.wasMode === 'world') open(); else CH.App.goHome(true);
    },
  };

  /* ---------------- While you were away ---------------- */
  function offlineSummary(info) {
    const s = save();
    const lines = [];
    for (const r in info.res) if (Math.abs(info.res[r]) >= 1) lines.push('<span class="chip">' + icon(r) + (info.res[r] > 0 ? '+' : '') + U.fmt(info.res[r]) + '</span>');
    const reps = s.reports.filter(r => r.t > info.since);
    const news = s.world.news.filter(n => n.t > info.since).slice(0, 8);
    UI.modal('<h3>While you were away (' + U.time(info.sec) + ')</h3>' + (lines.length ? '<p class="muted">Resources:</p><div class="chips">' + lines.join('') + '</div>' : '') +
      (reps.length ? '<h4 class="group">Your reports</h4><div class="b-list">' + reps.slice(0, 6).map(r => '<button class="b-row" data-rep="' + r.id + '"><div class="b-info"><b>' + esc(r.title) + '</b><span class="muted">' + U.time((Date.now() - r.t) / 1000) + ' ago</span></div></button>').join('') + '</div>' : '') +
      (news.length ? '<h4 class="group">News of the realm</h4><ul class="news">' + news.map(n => '<li>' + esc(n.text) + '</li>').join('') + '</ul>' : '') +
      '<button class="btn btn-gold btn-block" data-close>To my kingdom</button>',
    { cls: 'wide', onClick: e => { const b = e.target.closest('[data-rep]'); if (b) { const r = s.reports.find(x => x.id === b.dataset.rep); if (r) showReport(r); } } });
  }

  function tick() {
    if (CH.App.mode !== 'world') return;
    const s = save(), w = W();
    const c = CH.App.wview.toWorld(CH.App.wview.canvas.getBoundingClientRect().left + CH.App.wview.w / 2, CH.App.wview.canvas.getBoundingClientRect().top + CH.App.wview.h / 2);
    const el = $('w-coords'); if (el) el.textContent = 'X ' + Math.floor(c.x / TW) + ' · Y ' + Math.floor(c.y / TW);
    const ur = $('w-unread'); if (ur) ur.textContent = s.unread || '';
    renderBar(false);
    if (st.sel && st.sel.type === 'march' && !w.marches.includes(st.sel.o)) hidePanel();
    CH.App.wview.draw(s, { now: Date.now(), filters: st.filters, selected: st.sel ? { x: st.sel.type === 'march' ? marchPos(st.sel.o).x : st.sel.o.x, y: st.sel.type === 'march' ? marchPos(st.sel.o).y : st.sel.o.y } : null, teleport: st.teleport });
  }

  return { open, close, tick, showReport, incomingModal, offlineSummary, Replay, select, state: st, renderBar };
})();
