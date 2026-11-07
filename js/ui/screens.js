/* =====================================================================
 * Eldoria — ui/screens.js
 * Full-screen sheets. Each returns { title, html, on: {act: fn}, after }.
 * Buttons use data-act="name" and are dispatched by CH.UI.sheet().
 * ===================================================================== */
CH.Screens = (function () {
  const UI = CH.UI, S = CH.State, B = CH.BUILDINGS, U = CH.util, T = CH.CONFIG.T;
  const save = () => CH.App.save;
  const persist = () => CH.App.persist();
  const icon = UI.icon, esc = UI.esc;
  const stars = (n, max = 3) => '<span class="stars">' + Array.from({ length: max }, (_, i) => '<span class="star' + (i < n ? ' on' : '') + '">' + UI.ICONS.star + '</span>').join('') + '</span>';
  const fail = r => { UI.toast(r.reason || 'Not possible', 'warn'); CH.Audio.play('error'); };
  const roadsPx = tpl => tpl.paths.map(p => p.pts.map(([x, y]) => ({ x: (x + 0.5) * T, y: (y + 0.5) * T })));

  /* ---------------- Build shop ---------------- */
  function shop(focus) {
    const s = save();
    const tab = focus ? CH.BUILD_MENU.find(m => m.types.includes(focus)).id : (shop.tab || 'econ');
    shop.tab = tab;
    const cat = CH.BUILD_MENU.find(m => m.id === tab);
    const cards = cat.types.map(t => {
      const d = B[t], why = S.buildBlocker(s, t), cnt = S.countOf(s, t), max = S.maxCount(s, t);
      const locked = d.unlock > S.castleLevel(s);
      return '<button class="shop-card' + (why ? ' blocked' : '') + (focus === t ? ' focus' : '') + '" data-act="place" data-type="' + t + '"' + (locked ? ' disabled' : '') + '>' +
        '<canvas data-building="' + t + '" data-level="1"></canvas><b>' + d.name + '</b>' +
        (locked ? '<span class="req">' + icon('lock') + 'Castle level ' + d.unlock + '</span>' :
          '<span class="count">' + cnt + ' / ' + max + ' built</span><span class="costs">' + UI.cost(S.buildCost(s, t), s) + '</span>' +
          '<span class="meta">' + icon('time') + (d.instant || t === 'builderHut' ? 'Instant' : U.time(d.time(1))) + '</span>' +
          (why && why !== 'Not enough resources' ? '<span class="req">' + why + '</span>' : '')) +
        '<span class="desc">' + d.desc + '</span></button>';
    }).join('');
    return {
      title: 'Build',
      html: '<div class="tabs">' + CH.BUILD_MENU.map(m => '<button class="tab' + (m.id === tab ? ' on' : '') + '" data-act="tab" data-tab="' + m.id + '">' + m.name + '</button>').join('') + '</div><div class="shop-grid">' + cards + '</div>',
      on: { tab: b => { shop.tab = b.dataset.tab; UI.refreshSheet(); }, place: b => CH.Home.startPlacement(b.dataset.type) },
    };
  }

  /* ---------------- Campaign ---------------- */
  function campaign() {
    const s = save();
    const cards = CH.REGIONS.map((r, i) => {
      const open = CH.Campaign.regionUnlocked(s, i);
      let st = 0, cleared = 0; for (let k = 0; k < 6; k++) { st += s.campaign[i + '-' + k] || 0; if (s.campaign[i + '-' + k]) cleared++; }
      UI.painters['region' + i] = cv => paintTerrain(cv, CH.View.terrain('region' + r.id, { pal: r.pal, decor: r.decor, seed: 900 + i, roads: roadsPx(CH.Campaign.stage(i, 0).tpl) }));
      const lockText = i === 0 ? '' : S.castleLevel(s) < r.castle ? 'Castle level ' + r.castle + ' required' : 'Defeat ' + CH.ENEMIES[CH.REGIONS[i - 1].boss].name;
      return '<button class="region-card' + (open ? '' : ' locked') + '" style="--accent:' + r.pal.accent + '" data-act="region" data-r="' + i + '"' + (open ? '' : ' disabled') + '>' +
        '<canvas data-paint="region' + i + '"></canvas><div class="rc-body"><span class="kicker">Region ' + (i + 1) + '</span><h3>' + r.name + '</h3><p>' + r.sub + '</p>' +
        (open ? '<div class="rc-meta">' + stars(1, 1) + st + ' / 18 · ' + cleared + ' of 6 cleared</div>' : '<div class="rc-meta">' + icon('lock') + lockText + '</div>') + '</div></button>';
    }).join('');
    return { title: 'Campaign', html: '<p class="lead">Defend the realm region by region. Build towers along the roads, deploy your troops and heroes, and protect your castle.</p><div class="region-grid">' + cards + '</div>', on: { region: b => UI.sheet('stages', +b.dataset.r) } };
  }
  function paintTerrain(cv, img) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return; cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d'), sc = Math.max(cv.width / img.width, cv.height / img.height);
    c.drawImage(img, (cv.width - img.width * sc) / 2, (cv.height - img.height * sc) / 2, img.width * sc, img.height * sc);
  }

  function stages(r) {
    r = +r; const s = save(), reg = CH.REGIONS[r];
    const list = Array.from({ length: 6 }, (_, k) => {
      const st = CH.Campaign.stage(r, k), open = CH.Campaign.stageUnlocked(s, r, k), got = s.campaign[st.id] || 0;
      const types = [...new Set(st.waves.flatMap(w => w.groups.map(g => g.type)))];
      UI.painters['stage' + st.id] = cv => {
        paintTerrain(cv, CH.View.terrain('prev' + st.id, { pal: reg.pal, roads: roadsPx(st.tpl), decor: reg.decor, seed: 400 + st.gi }));
        const c = cv.getContext('2d'), sc = cv.width / (CH.CONFIG.COLS * T);
        c.save(); c.scale(sc, sc * (cv.height / cv.width) / (CH.CONFIG.ROWS / CH.CONFIG.COLS));
        CH.Art.drawBuilding(c, { type: 'castle', level: 2, tx: st.tpl.core.tx, ty: st.tpl.core.ty }, { time: 1 });
        for (const o of st.tpl.objs) CH.Art.drawBuilding(c, { type: o.type, level: 2, tx: o.tx, ty: o.ty }, { time: 1 });
        c.restore();
      };
      const rw = got ? { gold: Math.round(st.reward.gold * 0.25), wood: Math.round(st.reward.wood * 0.25), stone: Math.round(st.reward.stone * 0.25), xp: Math.round(st.reward.xp * 0.3) } : st.reward;
      return '<article class="stage-card' + (open ? '' : ' locked') + '">' +
        '<canvas data-paint="stage' + st.id + '"></canvas>' +
        '<div class="sc-body"><div class="sc-top"><span class="kicker">Stage ' + (r + 1) + '-' + (k + 1) + '</span>' + (st.obj === 'boss' ? '<span class="tag boss">' + icon('crown') + 'Boss</span>' : '') + (got ? stars(got) : '') + '</div>' +
        '<h3>' + st.name + '</h3><p class="obj">' + icon('flag' in UI.ICONS ? 'flag' : 'map') + CH.OBJECTIVES[st.obj] + '</p>' +
        '<div class="enemy-row">' + types.map(t => '<canvas title="' + esc(CH.ENEMIES[t].name) + '" data-unit="' + CH.ENEMIES[t].sprite + '" data-size="' + Math.min(16, CH.ENEMIES[t].size) + '"></canvas>').join('') + '</div>' +
        '<div class="sc-meta"><span>' + st.waves.length + ' waves</span><span>' + icon('gold') + st.startGold + ' battle gold</span>' + (st.timeLimit ? '<span>' + icon('time') + U.time(st.timeLimit) + '</span>' : '') + '</div>' +
        '<div class="sc-reward"><span class="label">' + (got ? 'Replay reward' : 'First clear') + '</span>' + UI.reward(rw) + (!got && st.reward.gems ? '' : '') + (got < 3 ? '<span class="chip">' + icon('gems') + '+2 for 3 stars</span>' : '') + '</div>' +
        (open ? '<button class="btn btn-gold btn-block" data-act="play" data-id="' + st.id + '">' + (got ? 'Play again' : 'Defend') + '</button>' : '<button class="btn btn-block" disabled>' + icon('lock') + 'Clear the previous stage</button>') +
        '</div></article>';
    }).join('');
    return {
      title: reg.name,
      html: '<p class="lead">' + reg.sub + '. Towers you build here use your kingdom\'s defense levels, so upgrading at home makes you stronger in the campaign.</p><div class="stage-grid">' + list + '</div>',
      on: { play: b => { const [rr, kk] = b.dataset.id.split('-').map(Number); CH.App.startBattle({ mode: 'campaign', stage: CH.Campaign.stage(rr, kk) }); } },
    };
  }

  /* ---------------- Endless ---------------- */
  function endless() {
    const s = save(), cl = S.castleLevel(s), locked = cl < 2;
    const ms = CH.Defense.MILESTONES.find(m => !s.defense.claimed.includes(m.wave));
    return {
      title: 'Endless Battle',
      html: '<p class="lead">Two different wars. In a <b>raid</b> you attack AI-controlled enemy kingdoms. In a <b>defense</b>, endless AI armies attack your own base, exactly as you built it. (Opponents are computer-generated; there is no online multiplayer.)</p>' +
        '<div class="mode-grid">' +
        '<button class="mode-card raid" data-act="raid"' + (locked ? ' disabled' : '') + '>' + icon('swords') + '<h3>Endless Raid</h3><p>Choose an enemy kingdom, scout its defenses and loot, deploy troops and heroes, and steal its resources.</p>' +
        '<div class="mode-stats"><span>' + icon('trophy') + s.raid.trophies + ' trophies · ' + CH.Raid.league(s.raid.trophies) + ' league</span><span>' + s.raid.wins + ' raids won</span></div>' + (locked ? '<span class="req">' + icon('lock') + 'Castle level 2 required</span>' : '') + '</button>' +
        '<button class="mode-card defense" data-act="defense"' + (locked ? ' disabled' : '') + '>' + icon('shield') + '<h3>Endless Defense</h3><p>Wave after wave attacks your kingdom from every side. Pick a blessing every 5 waves. Survive as long as you can.</p>' +
        '<div class="mode-stats"><span>' + icon('flag' in UI.ICONS ? 'flag' : 'crown') + 'Best: wave ' + s.defense.best + '</span>' + (ms ? '<span>Next record reward: wave ' + ms.wave + ' (' + icon('gems') + ms.gems + ')</span>' : '') + '</div>' + (locked ? '<span class="req">' + icon('lock') + 'Castle level 2 required</span>' : '') + '</button></div>',
      on: { raid: () => UI.sheet('raidTargets'), defense: () => defensePrep() },
    };
  }
  function defensePrep() {
    const s = save(), heroes = CH.HERO_ORDER.filter(h => s.heroes[h].unlocked);
    UI.modal('<h3>Endless Defense</h3><p>Your real base layout is the battlefield. Enemies come from every side; walls and traps matter. Your heroes and army can join the defense. Rewards are banked each wave and paid when the run ends.</p>' +
      '<ul class="bullets"><li>Wave 10: mini-boss. Wave 20: boss. After 20, waves gain random modifiers.</li><li>Every 5 waves, choose a blessing: repairs, damage boosts and more.</li><li>Best so far: wave ' + s.defense.best + '</li></ul>' +
      '<p class="muted">' + (heroes.length ? 'Heroes ready: ' + heroes.map(h => CH.HEROES[h].name).join(', ') : 'Recruit heroes in the Hero Hall to bring them along.') + ' · Army: ' + S.armySize(s) + ' troops</p>' +
      '<button class="btn btn-gold btn-lg btn-block" data-go>Defend my kingdom</button>', { onClick: e => { if (e.target.closest('[data-go]')) { UI.closeModal(); CH.App.startBattle({ mode: 'defense' }); } } });
  }

  function raidTargets() {
    const s = save();
    if (!s.raid.opponents.length) { CH.Raid.refresh(s); persist(); }
    const cards = s.raid.opponents.map(op => {
      UI.painters['op' + op.id] = cv => CH.View.layoutPreview(cv, op.layout, { cl: op.cl, area: areaFor(op.cl) });
      const defs = op.layout.filter(b => B[b.type].cat === 'defense').length;
      return '<article class="op-card"><canvas data-paint="op' + op.id + '"></canvas><div class="op-body">' +
        '<div class="op-top"><span class="kicker">' + op.archName + '</span><span class="tag">Castle ' + op.cl + '</span></div>' +
        '<h3>' + esc(op.name) + '</h3><p class="muted">' + esc(op.lord) + ' · ' + op.archDesc + '</p>' +
        '<div class="loot-row"><span class="label">Available loot</span>' + UI.reward({ gold: op.loot.gold, wood: op.loot.wood, stone: op.loot.stone, gems: op.loot.gems }) + '</div>' +
        '<div class="op-meta"><span>' + defs + ' defenses</span><span>' + op.layout.filter(b => b.type === 'wall').length + ' walls</span><span>' + icon('trophy') + '+' + Math.max(5, op.trophyWin) + ' / −' + op.trophyLoss + '</span></div>' +
        '<button class="btn btn-gold btn-block" data-act="scout" data-id="' + op.id + '">Scout and attack</button></div></article>';
    }).join('');
    const cost = CH.Raid.searchCost(S.castleLevel(s));
    return {
      title: 'Choose a target',
      html: '<div class="row-between"><p class="lead">Each kingdom can be raided once. Loot is split across its vaults, mines and castle; you take a share of everything you damage.</p><button class="btn" data-act="search">Find new kingdoms ' + UI.cost({ gold: cost }, s) + '</button></div><div class="op-grid">' + cards + '</div>',
      on: {
        scout: b => UI.sheet('raidPrep', b.dataset.id),
        search: () => { if (s.res.gold < cost) return fail({ reason: 'Not enough gold' }); s.res.gold -= cost; CH.Raid.refresh(s); persist(); UI.refreshSheet(); },
      },
    };
  }
  function areaFor(cl) { const [w, h] = CH.CONFIG.AREA[cl - 1]; return { x: Math.floor((CH.CONFIG.COLS - w) / 2), y: Math.floor((CH.CONFIG.ROWS - h) / 2), w, h }; }
  function raidPrep(id) {
    const s = save(), op = s.raid.opponents.find(o => o.id === id);
    if (!op) return raidTargets();
    UI.painters['big' + op.id] = cv => CH.View.layoutPreview(cv, op.layout, { cl: op.cl, area: areaFor(op.cl) });
    const army = CH.TROOP_ORDER.filter(t => s.army[t] > 0);
    const heroes = CH.HERO_ORDER.filter(h => s.heroes[h].unlocked);
    const spells = CH.SPELL_ORDER.filter(sp => S.spellUnlocked(s, sp));
    return {
      title: esc(op.name),
      html: '<div class="prep"><canvas class="prep-map" data-paint="big' + op.id + '"></canvas><div class="prep-side panel">' +
        '<span class="kicker">' + op.archName + ' · Castle ' + op.cl + '</span><h3>' + esc(op.lord) + '</h3>' +
        '<div class="loot-row"><span class="label">Estimated loot</span>' + UI.reward(op.loot) + '</div>' +
        '<p class="muted">Stars: 50% destroyed, the castle destroyed, 100% destroyed. One star is a victory. Traps are hidden. You have 3 minutes.</p>' +
        '<h4>Your army</h4>' + (army.length ? '<div class="army-row">' + army.map(t => '<span class="unit-chip"><canvas data-unit="' + CH.TROOPS[t].sprite + '" data-size="' + CH.TROOPS[t].size + '"></canvas><b>×' + s.army[t] + '</b></span>').join('') + '</div>' : '<p class="warn">You have no troops. Train some in the Army screen.</p>') +
        (heroes.length ? '<h4>Heroes</h4><div class="army-row">' + heroes.map(h => '<span class="unit-chip hero"><canvas data-unit="' + CH.HEROES[h].sprite + '" data-size="' + CH.HEROES[h].size + '"></canvas><b>' + CH.HEROES[h].name.split(' ').pop() + '</b></span>').join('') + '</div>' : '') +
        (spells.length ? '<h4>Spells</h4><div class="army-row">' + spells.map(sp => '<span class="chip">' + icon(sp) + CH.SPELLS[sp].name + ' ×' + CH.SPELLS[sp].charges + '</span>').join('') + '</div>' : '') +
        '<div class="row"><button class="btn" data-act="army">Train troops</button><button class="btn btn-gold btn-lg" data-act="attack"' + (army.length || heroes.length ? '' : ' disabled') + '>Attack!</button></div></div></div>',
      on: { attack: () => CH.App.startBattle({ mode: 'raid', opponent: op }), army: () => UI.sheet('army') },
    };
  }

  /* ---------------- Army (training per military building) ---------------- */
  const TRAINERS = ['barracks', 'archeryRange', 'stable', 'siegeWorkshop'];
  function jobBox(job, target, label) {
    const s = save(), now = Date.now();
    if (!job) return '';
    const left = Math.max(0, (job.ends - now) / 1000);
    return '<div class="panel r-job">' + icon('time') + '<div><b>' + label + '</b><div class="bar"><i style="width:' + Math.round((1 - left / job.total) * 100) + '%"></i></div><span class="muted">' + U.time(left) + ' left</span></div>' +
      '<div class="row">' + ['speed5m', 'speed1h'].filter(i => s.items[i] > 0).map(i => '<button class="btn" data-act="item" data-item="' + i + '" data-target=\'' + JSON.stringify(target) + '\'>' + CH.ITEMS[i].name.replace('Speed-up ', '−') + ' (' + s.items[i] + ')</button>').join('') +
      '<button class="btn btn-gem" data-act="gem" data-target=\'' + JSON.stringify(target) + '\'>Finish ' + icon('gems') + S.gemFinishCost(job) + '</button></div></div>';
  }
  const jobActions = {
    item: b => { const r = S.useItem(save(), b.dataset.item, Date.now(), JSON.parse(b.dataset.target)); if (!r.ok) return fail(r); CH.App.handleEvents(S.tick(save())); persist(); UI.refreshSheet(); },
    gem: b => { if (!S.gemFinish(save(), JSON.parse(b.dataset.target))) return fail({ reason: 'Not enough gems' }); CH.App.handleEvents(S.tick(save())); persist(); UI.refreshSheet(); },
  };
  function army(bld) {
    const s = save();
    bld = TRAINERS.includes(bld) ? bld : (army.tab || 'barracks'); army.tab = bld;
    const lvl = S.highestLevel(s, bld), cap = S.batchCap(s, bld), job = s.trainJobs[bld];
    if (!army.amount) army.amount = {};
    const cards = CH.TROOP_ORDER.filter(t => CH.TROOPS[t].building === bld).map(t => {
      const d = CH.TROOPS[t], locked = lvl < d.unlock, m = CH.RESEARCH.troopMult(s.research.troops[t]);
      const n = Math.min(cap, army.amount[t] || Math.min(cap, 50));
      const strong = Object.keys(CH.COUNTER[d.cls] || {}).map(c => CH.CLASS_NAMES[c]).join(', ');
      return '<div class="troop-card' + (locked ? ' locked' : '') + '"><canvas data-unit="' + d.sprite + '" data-size="' + d.size + '" data-bg="120,170,255"></canvas>' +
        '<div class="tc-body"><div class="tc-top"><b>' + d.name + '</b><span class="tag">' + CH.CLASS_NAMES[d.cls] + ' · T' + d.tier + '</span></div>' +
        '<span class="tc-stats">❤ ' + U.fmt(d.hp * m) + ' ⚔ ' + U.fmt(d.dmg * m) + ' · load ' + d.load + ' · 🍞 ' + d.upkeep + '/h</span>' +
        '<span class="desc">' + d.desc + (strong ? ' Strong vs ' + strong + '.' : '') + (d.siege ? ' ×' + d.siege + ' vs buildings.' : '') + (d.flying ? ' Flies over walls.' : '') + '</span>' +
        '<span class="have">Owned ' + U.fmt(s.army[t] || 0) + (s.wounded[t] ? ' · ' + s.wounded[t] + ' wounded' : '') + '</span>' +
        (locked ? '<span class="req">' + icon('lock') + CH.BUILDINGS[bld].name + ' level ' + d.unlock + '</span>' :
          '<div class="tc-buy"><input type="number" inputmode="numeric" min="1" max="' + cap + '" value="' + n + '" data-amt="' + t + '"><button class="btn btn-gold" data-act="train" data-t="' + t + '"' + (job ? ' disabled' : '') + '>Train</button></div>' +
          '<span class="muted tc-cost" data-cost="' + t + '">' + UI.cost(S.trainCost(t, n), s) + ' · ' + U.time(S.trainTimeEach(s, t) * n) + '</span>') + '</div></div>';
    }).join('');
    return {
      title: 'Army',
      html: '<div class="tabs">' + TRAINERS.map(x => '<button class="tab' + (x === bld ? ' on' : '') + '" data-act="tab" data-b="' + x + '">' + CH.BUILDINGS[x].name + '</button>').join('') + '</div>' +
        '<div class="panel army-sum"><span>' + icon('army') + U.fmt(S.armySize(s)) + ' troops home</span><span>Power ' + U.fmt(S.power(s)) + '</span><span>🍞 ' + U.fmt(S.upkeepPerHour(s)) + '/h eaten · ' + U.fmt(S.productionPerMin(s, 'food') * 60) + '/h grown</span></div>' +
        (S.upkeepPerHour(s) > S.productionPerMin(s, 'food') * 60 ? '<p class="warn">Your army eats more food than your farms grow. If food runs out, troops desert.</p>' : '') +
        (lvl ? '<p class="muted">' + CH.BUILDINGS[bld].name + ' level ' + lvl + ': up to ' + U.fmt(cap) + ' troops per batch, one batch at a time.</p>' : '<p class="warn">Build a ' + CH.BUILDINGS[bld].name + ' first.</p>') +
        (job ? jobBox(job, { kind: 'train', bld }, 'Training ' + job.n + ' × ' + CH.TROOPS[job.type].name) : '') +
        '<div class="troop-grid">' + cards + '</div>',
      on: {
        ...jobActions,
        tab: b => UI.sheet('army', b.dataset.b, false),
        train: b => { const t = b.dataset.t, n = +document.querySelector('[data-amt="' + t + '"]').value; army.amount[t] = n; const r = S.train(s, t, n); if (!r.ok) return fail(r); CH.Audio.play('deploy'); persist(); UI.refreshSheet(); },
      },
      onInput: e => { const t = e.target.dataset.amt; if (!t) return; const n = U.clamp(Math.floor(+e.target.value || 0), 0, cap); army.amount[t] = n; const el = document.querySelector('[data-cost="' + t + '"]'); if (el) el.innerHTML = UI.cost(S.trainCost(t, n), s) + ' · ' + U.time(S.trainTimeEach(s, t) * n); },
    };
  }

  function infirmary() {
    const s = save(), beds = S.beds(s), w = S.woundedCount(s);
    return {
      title: 'Infirmary',
      html: '<div class="panel army-sum"><span>🛏 ' + U.fmt(w) + ' / ' + U.fmt(beds) + ' beds</span></div><p class="lead">Wounded troops wait here instead of dying. Troops wounded when the infirmary is full are lost, so keep it large.</p>' +
        (s.healJob ? jobBox(s.healJob, { kind: 'heal' }, 'Healing ' + U.fmt(Object.values(s.healJob.army).reduce((a, n) => a + n, 0)) + ' troops') : '') +
        (w ? '<div class="tchips">' + Object.keys(s.wounded).map(t => '<span class="tchip"><canvas data-unit="' + CH.TROOPS[t].sprite + '" data-size="10"></canvas><b>' + U.fmt(s.wounded[t]) + '</b></span>').join('') + '</div>' +
          '<p>' + UI.cost(S.healCost(s), s) + ' · ' + U.time(S.healTime(s)) + '</p><button class="btn btn-gold" data-act="heal"' + (s.healJob ? ' disabled' : '') + '>Heal all</button>' : '<p class="muted">No wounded troops.</p>'),
      on: { ...jobActions, heal: () => { const r = S.heal(s); if (!r.ok) return fail(r); CH.Audio.play('heal'); persist(); UI.refreshSheet(); } },
    };
  }

  function bag() {
    const s = save();
    const list = CH.ITEM_ORDER.filter(i => s.items[i] > 0);
    return {
      title: 'Bag',
      html: (list.length ? '<div class="b-list">' + list.map(i => { const it = CH.ITEMS[i]; return '<div class="b-row">' + icon(it.icon, 'big-ico') + '<div class="b-info"><b>' + it.name + ' ×' + s.items[i] + '</b><span class="muted">' + it.desc + '</span></div>' +
        (it.kind === 'shield' || it.kind === 'res' ? '<button class="btn btn-gold" data-act="use" data-i="' + i + '">Use</button>' : it.kind === 'teleport' ? '<button class="btn" data-act="world">World map</button>' : '<span class="muted">Use from a timer</span>') + '</div>'; }).join('') + '</div>' : '<p class="muted">Your bag is empty. Items come from monster camps, events, ruins and redeem codes.</p>') +
        '<p class="muted">Shield status: ' + (s.shieldUntil > Date.now() ? '🛡 ' + U.time((s.shieldUntil - Date.now()) / 1000) : S.beginner(s) ? 'Beginner protection' : 'unprotected') + '</p>',
      on: {
        use: b => { const r = S.useItem(s, b.dataset.i); if (!r.ok) return fail(r); CH.Audio.play('upgrade'); persist(); UI.toast(CH.ITEMS[b.dataset.i].name + ' used', 'good'); UI.refreshSheet(); CH.Home.refreshHud(true); },
        world: () => { UI.closeSheets(); CH.WorldUI.open(); },
      },
    };
  }

  function factions() {
    const s = save(), w = s.world, emb = S.highestLevel(s, 'embassy');
    const cards = CH.FACTIONS.map(f => {
      const mem = w.kingdoms.filter(k => k.f === f.id), pow = mem.reduce((a, k) => a + CH.World.power(k), 0);
      const mine = s.faction === f.id;
      return '<div class="panel fac' + (mine ? ' mine' : '') + '" style="--fc:' + f.color + '"><h3>' + f.name + '</h3><p class="muted">' + mem.length + ' kingdoms · power ' + U.fmt(pow) + '</p><p><b>Bonus:</b> ' + f.desc + '</p>' +
        (mine ? '<p class="good">Your faction</p>' : '<button class="btn btn-gold" data-act="join" data-f="' + f.id + '"' + (emb ? '' : ' disabled') + '>Join</button>') + '</div>';
    }).join('');
    const ev = CH.World.eventAt(w, Date.now());
    return {
      title: 'Factions',
      html: '<p class="lead">Factions are alliances of AI kingdoms (simulated; there is no online multiplayer). Members never attack each other, you get the faction bonus, and allies can send reinforcements when you are attacked (Embassy required). Joining one makes its members friendly, but other factions remain hostile.</p>' +
        (emb ? '' : '<p class="warn">Build an Embassy to join a faction.</p>') +
        (s.faction != null ? '<div class="row"><button class="btn" data-act="help">Request reinforcements</button><button class="btn btn-danger-quiet" data-act="leave">Leave faction</button><span class="muted">' + (Date.now() - (s.helpUsedAt || 0) < 3600e3 ? 'Available again in ' + U.time((3600e3 - (Date.now() - s.helpUsedAt)) / 1000) : 'Ready') + '</span></div>' : '') +
        (ev.active && ev.ev.id === 'territoryWar' ? '<p class="good">Territory War points: ' + CH.FACTIONS.map((f, i) => f.name + ' ' + w.fpts[i]).join(' · ') + '</p>' : '') +
        '<div class="k-grid">' + cards + '</div>',
      on: {
        join: b => { const r = CH.World.joinFaction(s, +b.dataset.f); if (!r.ok) return fail(r); CH.Audio.play('heroDeploy'); persist(); UI.refreshSheet(); },
        leave: () => {
          UI.modal('<h3>Leave ' + CH.FACTIONS[s.faction].name + '?</h3><p>You lose the faction bonus and reinforcements, and its members may attack you again. You can join a faction again after 1 hour.</p><div class="row"><button class="btn btn-danger" data-lv>Leave</button><button class="btn" data-close>Stay</button></div>',
            { onClick: e => { if (e.target.closest('[data-lv]')) { const r = CH.World.leaveFaction(s); UI.closeModal(); if (!r.ok) return fail(r); persist(); UI.toast('You left the ' + r.old, 'info'); UI.refreshSheet(); } } });
        },
        help: () => { const r = CH.World.requestHelp(s); if (!r.ok) return fail(r); persist(); UI.toast(r.troops + ' allied troops will defend you for 30 minutes', 'good'); UI.refreshSheet(); },
      },
    };
  }

  function events() {
    const s = save(), w = s.world, now = Date.now(), e = CH.World.eventAt(w, now);
    const upcoming = [1, 2, 3].map(i => CH.EVENTS[(((e.idx + i) % CH.EVENTS.length) + CH.EVENTS.length) % CH.EVENTS.length]);
    return {
      title: 'World events',
      html: '<div class="panel ev-now"><span class="kicker">' + (e.active ? 'Live now · ends in ' + U.time((e.ends - now) / 1000) : 'Next event in ' + U.time((e.next - now) / 1000)) + '</span><h3>' + e.ev.name + '</h3><p>' + e.ev.desc + '</p>' +
        (e.active && e.ev.id === 'dragonHunt' && w.dragon ? '<button class="btn btn-gold" data-act="dragon">Find the dragon</button>' : '') + '</div>' +
        '<h4 class="group">Coming up</h4><div class="b-list">' + upcoming.map(x => '<div class="b-row"><div class="b-info"><b>' + x.name + '</b><span class="muted">' + x.desc + '</span></div></div>').join('') + '</div>' +
        '<h4 class="group">News of the realm</h4><ul class="news">' + w.news.slice(0, 20).map(n => '<li><span class="muted">' + U.time((now - n.t) / 1000) + ' ago</span> ' + esc(n.text) + '</li>').join('') + '</ul>',
      on: { dragon: () => { UI.closeSheets(); CH.WorldUI.open(w.dragon); } },
    };
  }

  function trade() {
    const s = save(), lvl = S.highestLevel(s, 'tradingPost');
    if (!trade.from) { trade.from = 'gold'; trade.to = 'food'; }
    const rate = lvl ? CH.BUILDINGS.tradingPost.rate(lvl) : 0;
    const R = ['gold', 'wood', 'stone', 'food'];
    return {
      title: 'Trading Post',
      html: lvl ? '<p class="lead">Exchange resources at ' + Math.round(rate * 100) + '% (better with each Trading Post level).</p>' +
        '<h4 class="group">Give</h4><div class="row">' + R.map(r => '<button class="tab' + (trade.from === r ? ' on' : '') + '" data-act="from" data-r="' + r + '">' + icon(r) + r + '</button>').join('') + '</div>' +
        '<h4 class="group">Receive</h4><div class="row">' + R.map(r => '<button class="tab' + (trade.to === r ? ' on' : '') + '" data-act="to" data-r="' + r + '">' + icon(r) + r + '</button>').join('') + '</div>' +
        '<div class="row">' + [1000, 5000, 20000].map(n => '<button class="btn" data-act="do" data-n="' + n + '">Trade ' + U.fmt(n) + ' → ' + U.fmt(n * rate) + '</button>').join('') + '</div>'
        : '<p class="warn">Build a Trading Post (castle level 3).</p>',
      on: {
        from: b => { trade.from = b.dataset.r; UI.refreshSheet(); }, to: b => { trade.to = b.dataset.r; UI.refreshSheet(); },
        do: b => { const r = S.trade(s, trade.from, trade.to, +b.dataset.n); if (!r.ok) return fail(r); CH.Audio.play('collect'); persist(); UI.toast('Received ' + U.fmt(r.got) + ' ' + trade.to, 'good'); UI.refreshSheet(); CH.Home.refreshHud(true); },
      },
    };
  }

  function mail() {
    const s = save(), tab = mail.tab || 'all';
    const list = s.reports.filter(r => tab === 'all' || (tab === 'battle' ? ['attack', 'defense', 'monster', 'fort'].includes(r.kind) : r.kind === tab));
    const ico = r => ({ attack: '⚔', defense: '🛡', scout: '👁', monster: '🐉', gather: '⛏', fort: '🏰', event: '★' }[r.kind] || '✉');
    return {
      title: 'Reports',
      html: '<div class="tabs">' + [['all', 'All'], ['battle', 'Battles'], ['scout', 'Scouting'], ['gather', 'Gathering']].map(([k, n]) => '<button class="tab' + (tab === k ? ' on' : '') + '" data-act="tab" data-t="' + k + '">' + n + '</button>').join('') + '<button class="btn btn-quiet" data-act="readall">Mark all read</button></div>' +
        (list.length ? '<div class="b-list">' + list.map(r => '<button class="b-row rep-row ' + (r.read ? '' : 'unread ') + (r.outcome || '') + '" data-act="open" data-id="' + r.id + '"><span class="rep-ico">' + ico(r) + '</span><div class="b-info"><b>' + esc(r.title) + '</b><span class="muted">' + U.time((Date.now() - r.t) / 1000) + ' ago' + (r.replay ? ' · replay available' : '') + '</span></div></button>').join('') + '</div>' : '<p class="muted">No reports yet.</p>'),
      on: {
        tab: b => { mail.tab = b.dataset.t; UI.refreshSheet(); },
        open: b => { const r = s.reports.find(x => x.id === b.dataset.id); if (r) CH.WorldUI.showReport(r); setTimeout(() => UI.refreshSheet(), 50); },
        readall: () => { for (const r of s.reports) r.read = true; s.unread = 0; persist(); UI.refreshSheet(); },
      },
    };
  }

  /* ---------------- Gem shop ---------------- */
  function store() {
    const s = save(), G = CH.GEM_SHOP, R = ['gold', 'wood', 'stone', 'food'];
    const resCards = R.map(r => '<div class="panel store-card"><div class="k-head">' + icon(r, 'big-ico') + '<div><h3>' + r[0].toUpperCase() + r.slice(1) + '</h3><span class="muted">' + U.fmt(s.res[r]) + ' / ' + U.fmt(S.capacity(s, r)) + '</span></div></div>' +
      '<div class="store-btns">' + G.resources.map((p, i) => '<button class="btn btn-gem" data-act="res" data-r="' + r + '" data-i="' + i + '"' + (s.res.gems >= p.gems ? '' : ' disabled') + '><span>+' + U.fmt(p.amount * (r === 'food' ? G.foodBonus : 1)) + ' ' + r + '</span><span class="price">' + icon('gems') + p.gems + '</span></button>').join('') +
      (S.shopPrice(s, 'fill', r) > 0 ? '<button class="btn" data-act="fill" data-r="' + r + '"' + (s.res.gems >= S.shopPrice(s, 'fill', r) ? '' : ' disabled') + '><span>Fill storage</span><span class="price">' + icon('gems') + S.shopPrice(s, 'fill', r) + '</span></button>' : '<span class="muted">Storage full</span>') + '</div></div>').join('');
    const itemCards = Object.keys(G.items).map(id => '<div class="b-row">' + icon(CH.ITEMS[id].icon, 'big-ico') + '<div class="b-info"><b>' + CH.ITEMS[id].name + '</b><span class="muted">' + CH.ITEMS[id].desc + ' · You have ' + (s.items[id] || 0) + '</span></div><button class="btn btn-gem" data-act="item" data-id="' + id + '"' + (s.res.gems >= G.items[id] ? '' : ' disabled') + '>' + icon('gems') + G.items[id] + '</button></div>').join('');
    return {
      title: 'Gem Shop',
      html: '<div class="panel army-sum"><span>' + icon('gems') + '<b>' + U.fmt(s.res.gems) + '</b> gems</span><span class="muted">Earn gems from player levels, monster camps, ruins, events, 3-star campaign stages and redeem codes.</span></div>' +
        '<h4 class="group">Resources</h4><p class="muted">Bought resources are added straight to your kingdom and can go above your storage limit.</p><div class="k-grid">' + resCards + '</div>' +
        '<h4 class="group">Items</h4><div class="b-list">' + itemCards + '</div>',
      on: {
        res: b => doBuy('res', b.dataset.r, +b.dataset.i), fill: b => doBuy('fill', b.dataset.r), item: b => doBuy('item', b.dataset.id),
      },
    };
    function doBuy(kind, a, i) {
      const r = S.buy(s, kind, a, i);
      if (!r.ok) return fail(r);
      CH.Audio.play('collect'); persist(); CH.Home.refreshHud(true);
      UI.toast(kind === 'item' ? 'Bought ' + CH.ITEMS[a].name + ' (in your Bag)' : '+' + U.fmt(r.got) + ' ' + a + ' for ' + r.price + ' gems', 'good');
      UI.refreshSheet();
    }
  }

  /* ---------------- Heroes ---------------- */
  function heroes() {
    const s = save(), hl = S.heroHallLevel(s);
    const cards = CH.HERO_ORDER.map(id => {
      const d = CH.HEROES[id], h = s.heroes[id], why = S.heroBlocker(s, id), m = CH.State.heroMult(h.level);
      const next = h.unlocked ? CH.heroUpgradeCost(h.level + 1) : d.cost;
      return '<article class="hero-card' + (h.unlocked ? '' : ' locked') + '"><canvas data-unit="' + d.sprite + '" data-size="' + d.size + '" data-bg="255,210,120"></canvas>' +
        '<div class="hc-body"><h3>' + d.name + '</h3><p class="kicker">' + d.title + ' · ' + d.role + '</p>' +
        '<p>' + d.desc + '</p><div class="ability"><b>' + d.ability.name + '</b> (' + d.ability.cd + 's cooldown): ' + d.ability.desc + '</div>' +
        '<div class="tc-stats">' + (h.unlocked ? 'Level ' + h.level + ' / ' + S.heroMaxLevel(s) + ' · ' : '') + '❤ ' + U.fmt(d.hp * m) + ' · ⚔ ' + U.fmt(d.dmg * m) + (d.proj ? ' ranged' : '') + '</div>' +
        '<div class="muted">Commands ' + CH.CLASS_NAMES[d.cls] + ': +' + Math.round(d.bonus * (1 + 0.1 * (h.level - 1)) * 100) + '% their attack and health.</div>' +
        (h.unlocked ? '<div class="bar"><i style="width:' + Math.min(100, Math.round((h.xp || 0) / CH.heroXpFor(h.level) * 100)) + '%"></i></div><span class="muted">' + (h.xp || 0) + ' / ' + CH.heroXpFor(h.level) + ' battle XP</span>' +
          (s.defenseHero === id ? '<span class="good">🛡 Defends your kingdom</span>' : '<button class="btn btn-quiet" data-act="defender" data-id="' + id + '">Set as castle defender</button>') : '') +
        (hl < d.unlock ? '<span class="req">' + icon('lock') + 'Hero Hall level ' + d.unlock + '</span>' :
          '<button class="btn btn-gold btn-block" data-act="hero" data-id="' + id + '"' + (why ? ' disabled' : '') + '>' + (h.unlocked ? 'Train to level ' + (h.level + 1) : 'Recruit') + ' ' + UI.cost(next, s) + '</button>' + (why && why !== 'Not enough resources' ? '<span class="req">' + why + '</span>' : '')) +
        '</div></article>';
    }).join('');
    return {
      title: 'Heroes',
      html: '<p class="lead">Heroes lead your marches (one per march) and defend your castle. Each boosts one troop class and uses its ability automatically in world battles. They gain experience in battle and can be trained with resources; levels above 3 also need runes from monster camps and ruins. Max level = Hero Hall level × 2.</p><div class="hero-grid">' + cards + '</div>',
      on: {
        hero: b => { const r = S.heroAction(s, b.dataset.id); if (!r.ok) return fail(r); CH.Audio.play(r.unlocked ? 'heroDeploy' : 'upgrade'); persist(); UI.refreshSheet(); },
        defender: b => { s.defenseHero = b.dataset.id; persist(); UI.refreshSheet(); },
      },
    };
  }

  /* ---------------- Buildings overview ---------------- */
  function buildings() {
    const s = save(), now = Date.now();
    const groups = CH.BUILD_MENU.concat([{ id: 'core', name: 'Castle', types: ['castle'] }]).reverse();
    const html = groups.map(g => {
      const list = s.buildings.filter(b => g.types.includes(b.type) && b.type !== 'wall');
      if (!list.length) return '';
      return '<h4 class="group">' + g.name + '</h4><div class="b-list">' + list.map(b => {
        const d = B[b.type], why = S.upgradeBlocker(s, b), max = S.maxLevelFor(s, b.type);
        return '<div class="b-row"><canvas data-building="' + b.type + '" data-level="' + Math.max(1, b.level) + '"></canvas><div class="b-info"><b>' + d.name + '</b><span class="muted">Level ' + b.level + ' / ' + max + (b.job ? ' · ' + (b.job.kind === 'clear' ? 'clearing' : 'upgrading') + ' ' + U.time((b.job.ends - now) / 1000) : '') + '</span></div>' +
          (d.maxLevel > 1 && !b.job ? '<button class="btn' + (why ? '' : ' btn-gold') + '" data-act="up" data-id="' + b.id + '"' + (why === 'Maximum level' ? ' disabled' : '') + '>' + (why && why !== 'Not enough resources' ? why : 'Upgrade') + '</button>' : '') +
          '<button class="btn btn-quiet" data-act="show" data-id="' + b.id + '">Show</button></div>';
      }).join('') + '</div>';
    }).join('');
    const walls = s.buildings.filter(b => b.type === 'wall');
    const wallLv = {}; walls.forEach(w => wallLv[w.level] = (wallLv[w.level] || 0) + 1);
    return {
      title: 'Buildings',
      html: '<div class="builders panel">' + icon('hammer') + '<b>' + S.freeBuilders(s) + ' of ' + S.builders(s) + ' builders free.</b> Each Builder Hut is one builder; build more to work faster.</div>' + html +
        '<h4 class="group">Walls</h4><p class="muted">' + walls.length + ' / ' + S.maxCount(s, 'wall') + ' placed · ' + Object.entries(wallLv).map(([l, n]) => n + ' at level ' + l).join(', ') + '</p>',
      on: {
        up: b => { const bb = S.byId(s, +b.dataset.id); if (bb) CH.Home.upgradeDialog(bb); },
        show: b => { const bb = S.byId(s, +b.dataset.id); UI.closeSheets(); if (bb) CH.Home.select(bb); },
      },
    };
  }

  /* ---------------- Research ---------------- */
  function lab() {
    const s = save(), ll = S.labLevel(s), now = Date.now(), j = s.rjob;
    const row = (kind, id, name, sprite, size, lvl, extra) => {
      if (kind === 'tech') { const why = S.researchBlocker(s, kind, id), c = S.researchCost(kind, id, lvl + 1);
        return '<div class="r-row">' + icon('flask', 'big-ico') + '<div class="b-info"><b>' + name + '</b><span class="muted">Level ' + lvl + ' / ' + CH.TECHS[id].max + ' · ' + extra + '</span></div>' + (why === 'Maximum level' ? '<span class="maxed">Max</span>' : '<button class="btn' + (why ? '' : ' btn-gold') + '" data-act="research" data-kind="tech" data-id="' + id + '"' + (why ? ' disabled' : '') + '>' + (why && why !== 'Not enough resources' ? why : UI.cost(c, s) + ' · ' + U.time(CH.RESEARCH.techTime(lvl + 1))) + '</button>') + '</div>'; }
      const why = S.researchBlocker(s, kind, id), c = S.researchCost(kind, id, lvl + 1);
      return '<div class="r-row">' + (sprite ? '<canvas data-unit="' + sprite + '" data-size="' + size + '"></canvas>' : icon(id, 'big-ico')) + '<div class="b-info"><b>' + name + '</b><span class="muted">Level ' + lvl + ' / ' + CH.RESEARCH.maxLevel(Math.max(1, ll)) + (extra ? ' · ' + extra : '') + '</span></div>' +
        (why === 'Maximum level' ? '<span class="maxed">Max</span>' : '<button class="btn' + (why ? '' : ' btn-gold') + '" data-act="research" data-kind="' + kind + '" data-id="' + id + '"' + (why ? ' disabled title="' + why + '"' : '') + '>' + (why && why !== 'Not enough resources' ? why : UI.cost(c, s) + ' · ' + U.time(CH.RESEARCH.time(lvl + 1))) + '</button>') + '</div>';
    };
    return {
      title: 'Academy',
      html: (ll ? '' : '<p class="warn">Build an Arcane Laboratory (castle level 3) to start research.</p>') +
        (j ? '<div class="panel r-job">' + icon('flask') + '<div><b>Researching ' + (j.kind === 'troop' ? CH.TROOPS[j.id].name : j.kind === 'tech' ? CH.TECHS[j.id].name : CH.SPELLS[j.id].name) + ' level ' + j.to + '</b><div class="bar"><i style="width:' + Math.round((1 - (j.ends - now) / 1000 / j.total) * 100) + '%"></i></div><span class="muted">' + U.time((j.ends - now) / 1000) + ' left</span></div><button class="btn btn-gem" data-act="rush">Finish ' + icon('gems') + Math.max(1, Math.ceil((j.ends - now) / 30000)) + '</button></div>' : '') +
        (j ? '<div class="row">' + ['speed5m', 'speed1h'].filter(i => s.items[i] > 0).map(i => '<button class="btn" data-act="item" data-item="' + i + '" data-target=\'{"kind":"research"}\'>' + CH.ITEMS[i].name + ' (' + s.items[i] + ')</button>').join('') + '</div>' : '') +
        '<p class="lead">Technologies boost your whole kingdom. Each troop level adds 14% health and damage. The Academy level caps research.</p>' +
        '<h4 class="group">Technologies</h4>' + CH.TECH_ORDER.map(t => row('tech', t, CH.TECHS[t].name, null, 0, s.research.techs[t] || 0, CH.TECHS[t].desc)).join('') +
        '<h4 class="group">Troops</h4>' + CH.TROOP_ORDER.map(t => row('troop', t, CH.TROOPS[t].name, CH.TROOPS[t].sprite, CH.TROOPS[t].size, s.research.troops[t])).join('') +
        '<h4 class="group">Spells</h4>' + CH.SPELL_ORDER.map(sp => row('spell', sp, CH.SPELLS[sp].name, null, 0, s.research.spells[sp], CH.SPELLS[sp].desc)).join(''),
      on: {
        research: b => { const r = S.research(s, b.dataset.kind, b.dataset.id); if (!r.ok) return fail(r); CH.Audio.play('magic'); persist(); UI.refreshSheet(); },
        rush: () => { const c = Math.max(1, Math.ceil((s.rjob.ends - Date.now()) / 30000)); if (s.res.gems < c) return fail({ reason: 'Not enough gems' }); s.res.gems -= c; s.rjob.ends = Date.now(); CH.App.handleEvents(S.tick(s)); persist(); UI.refreshSheet(); },
        ...jobActions,
      },
    };
  }

  /* ---------------- Resources ---------------- */
  function resources() {
    const s = save();
    const rows = ['gold', 'wood', 'stone', 'food'].map(r => {
      const cap = S.capacity(s, r), p = S.productionPerMin(s, r);
      return '<div class="res-card panel">' + icon(r, 'big-ico') + '<div><h3>' + r[0].toUpperCase() + r.slice(1) + '</h3><b>' + U.fmt(s.res[r]) + ' / ' + U.fmt(cap) + '</b><div class="bar"><i style="width:' + Math.min(100, s.res[r] / cap * 100) + '%"></i></div>' +
        '<p class="muted">Production ' + U.fmt(p * 60) + ' per hour' + (r === 'food' ? ', troops eat ' + U.fmt(S.upkeepPerHour(s)) + ' per hour' : '') + '. Protected from raiders: ' + U.fmt(S.protectedAmount(s, r)) + '. Producers hold about 40 minutes of output until you collect it.</p></div></div>';
    }).join('');
    return {
      title: 'Resources',
      html: '<div class="res-grid">' + rows +
        '<div class="res-card panel">' + icon('gems', 'big-ico') + '<div><h3>Gems</h3><b>' + s.res.gems + '</b><p class="muted">Rare. Earned from player levels, 3-star campaign clears, boss stages, defense records, high fortresses and clearing obstacles. Spend them to finish timers instantly.</p></div></div>' +
        '<div class="res-card panel">' + icon('runes', 'big-ico') + '<div><h3>Runes</h3><b>' + s.res.runes + '</b><p class="muted">Rare material from campaign stages 5 and 6 and every 5 Endless Defense waves. Needed for hero levels above 3.</p></div></div></div>' +
        '<h4 class="group">Where resources come from</h4><ul class="bullets"><li><b>Home:</b> mines, mills and quarries produce over time, even while you\'re away.</li><li><b>Campaign:</b> first clears pay the most; replays pay 25%.</li><li><b>Endless Raid:</b> steal loot from AI kingdoms, plus a star bonus.</li><li><b>Endless Defense:</b> every wave banks rewards, with runes every 5 waves.</li></ul>',
    };
  }

  /* ---------------- Profile ---------------- */
  function profile() {
    const s = save(), cl = S.castleLevel(s);
    let camp = 0; for (const k in s.campaign) camp += s.campaign[k];
    const road = [];
    for (let L = cl + 1; L <= Math.min(8, cl + 3); L++) road.push('<div class="road-step"><b>Castle level ' + L + '</b><ul>' + S.unlocksAt(L).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>');
    const ms = CH.Defense.MILESTONES.map(m => '<span class="chip' + (s.defense.claimed.includes(m.wave) ? ' done' : '') + '">Wave ' + m.wave + ': ' + icon('gems') + m.gems + ' ' + icon('runes') + m.runes + (s.defense.claimed.includes(m.wave) ? ' ✓' : '') + '</span>').join('');
    return {
      title: 'Profile',
      html: '<div class="profile panel"><div class="big-lvl">' + s.player.level + '</div><div><label class="label" for="pname">Ruler name</label><input id="pname" maxlength="24" value="' + esc(s.player.name) + '">' +
        '<div class="bar"><i style="width:' + Math.round(s.player.xp / S.xpFor(s.player.level) * 100) + '%"></i></div><span class="muted">' + s.player.xp + ' / ' + S.xpFor(s.player.level) + ' XP to level ' + (s.player.level + 1) + ' (each level gives gems)</span></div></div>' +
        '<div class="stat-grid">' +
        [['Power', U.fmt(S.power(s))], ['Castle level', cl], ['Faction', s.faction != null ? CH.FACTIONS[s.faction].name : 'None'], ['Campaign stars', camp + ' / 108'], ['Raids won', s.stats.attacksWon + ' / ' + (s.stats.attacksWon + s.stats.attacksLost)], ['Defenses won', s.stats.defensesWon + ' / ' + (s.stats.defensesWon + s.stats.defensesLost)], ['Resources looted', U.fmt(s.stats.resourcesLooted)], ['Monsters slain', U.fmt(s.stats.monstersSlain)], ['Troops lost', U.fmt(s.stats.troopsLost)], ['Deserted (hunger)', U.fmt(s.stats.deserted)]]
          .map(([k, v]) => '<div class="panel"><span class="label">' + k + '</span><b>' + v + '</b></div>').join('') + '</div>' +

        '<h4 class="group">What\'s next</h4><div class="road">' + (road.join('') || '<p>Your castle is at its maximum level.</p>') + '</div>',
      onInput: e => { if (e.target.id === 'pname') { s.player.name = e.target.value.trim().slice(0, 24) || 'Lord of Crownhold'; persist(); CH.Home.refreshHud(true); } },
    };
  }

  /* ---------------- Redeem codes ---------------- */
  function redeem() {
    const s = save();
    const got = (CH.REDEEM_CODES || []).filter(c => s.redeemed.includes(c.hash));
    const describe = rw => UI.reward(rw) + (rw.troops ? Object.entries(rw.troops).map(([t, n]) => '<span class="chip">' + n + '× ' + (CH.TROOPS[t] ? CH.TROOPS[t].name : t) + '</span>').join('') : '') + (rw.items ? Object.entries(rw.items).map(([i, n]) => '<span class="chip">' + n + '× ' + (CH.ITEMS[i] ? CH.ITEMS[i].name : i) + '</span>').join('') : '') + (rw.heroes ? rw.heroes.map(h => '<span class="chip">Hero: ' + (CH.HEROES[h] ? CH.HEROES[h].name : h) + '</span>').join('') : '');
    return {
      title: 'Redeem code',
      html: '<div class="redeem panel"><label class="label" for="rcode">Enter a gift code</label>' +
        '<div class="redeem-row"><input id="rcode" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="e.g. ELDORIA"><button class="btn btn-gold" data-act="go">Redeem</button></div>' +
        '<p class="muted">Codes are not case-sensitive. Each code works once per kingdom. Gifts can go past your storage limits.</p><div id="rmsg" aria-live="polite"></div></div>' +
        '<h4 class="group">Redeemed</h4>' + (got.length ? '<div class="b-list">' + got.map(c => '<div class="b-row"><div class="b-info"><b>' + esc(c.label || 'Gift') + '</b></div><div class="chips">' + describe(c.reward || {}) + '</div></div>').join('') + '</div>' : '<p class="muted">No codes redeemed yet.</p>'),
      on: {
        go: () => {
          const inp = document.getElementById('rcode'), r = S.redeem(s, inp.value);
          if (!r.ok) { document.getElementById('rmsg').innerHTML = '<p class="warn">' + esc(r.reason) + '</p>'; CH.Audio.play('error'); return; }
          persist(); CH.Audio.play('star');
          (r.levels || []).forEach(l => UI.toast('Player level ' + l.level + '! +' + l.gems + ' gems', 'good'));
          UI.refreshSheet(); CH.Home.refreshHud(true);
          UI.modal('<h3>' + esc(r.entry.label || 'Gift received') + '</h3><p>Added to your kingdom:</p><div class="chips">' + describe(r.entry.reward || {}) + '</div><button class="btn btn-gold btn-block" data-close style="margin-top:14px">Wonderful</button>');
        },
      },
      after: el => { const inp = el.querySelector('#rcode'); if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('[data-act=go]').click(); }); },
    };
  }

  /* ---------------- Settings ---------------- */
  function settings() {
    const st = save().settings;
    const slider = (k, l) => '<label class="set-row"><span>' + l + '</span><input type="range" min="0" max="100" value="' + Math.round(st[k] * 100) + '" data-set="' + k + '"><output>' + Math.round(st[k] * 100) + '%</output></label>';
    const tog = (k, l) => '<label class="set-row"><span>' + l + '</span><input type="checkbox" data-set="' + k + '"' + (st[k] ? ' checked' : '') + '></label>';
    return {
      title: 'Settings',
      html: '<div class="settings"><section class="panel"><h4>Sound</h4>' + slider('music', 'Music volume') + slider('sfx', 'Effects volume') + tog('muted', 'Mute everything') + '</section>' +
        '<section class="panel"><h4>Battle</h4>' + tog('damageNumbers', 'Show big damage numbers') + '</section>' +
        '<section class="panel"><h4>Gift codes</h4><button class="btn" data-act="redeem">Redeem a code</button></section>' +
        '<section class="panel"><h4>Progress</h4><p class="muted">Saved automatically in this browser' + (S.persistent() ? '' : ' (storage is blocked here, so progress lasts only this session)') + '.</p>' +
        (settings.confirm ? '<p class="warn">This erases your kingdom, army, heroes and records. It can\'t be undone.</p><div class="row"><button class="btn btn-danger" data-act="reset2">Erase everything</button><button class="btn" data-act="keep">Keep my kingdom</button></div>' : '<button class="btn btn-danger-quiet" data-act="reset">Reset progress…</button>') + '</section>' +
        '<p class="muted">Crownhold v' + CH.CONFIG.VERSION + '. All art, sound and music are generated in code. Raid opponents are AI-generated; there is no online multiplayer.</p></div>',
      on: {
        redeem: () => UI.sheet('redeem'),
        reset: () => { settings.confirm = true; UI.refreshSheet(); },
        keep: () => { settings.confirm = false; UI.refreshSheet(); },
        reset2: () => { settings.confirm = false; const keep = save().settings; CH.App.save = S.reset(); CH.App.save.settings = keep; persist(); UI.closeSheets(); CH.App.goHome(true); UI.toast('A new kingdom begins.', 'good'); },
      },
      onInput: e => {
        const el = e.target, k = el.dataset.set; if (!k) return;
        if (el.type === 'range') { st[k] = el.value / 100; el.nextElementSibling.textContent = el.value + '%'; } else st[k] = el.checked;
        CH.Audio.apply(st); persist();
      },
    };
  }

  function howto() {
    return {
      title: 'How to play',
      html: '<div class="howto">' +
        '<section class="panel"><h4>The core loop</h4><ol><li><b>Build</b> your kingdom: mines, mills, quarries and farms produce resources; storage protects them.</li><li><b>Train</b> troops in the Barracks, Archery Range, Stable and Siege Workshop. Every troop eats food each hour.</li><li><b>Explore</b> the World map: 60 AI kingdoms live, grow and fight each other in real time, and keep going while you are offline.</li><li><b>Scout</b> a kingdom, then <b>attack</b> with an army, a hero and a formation. Loot comes home with your troops.</li><li><b>Survive</b>: aggressive kingdoms will raid you. Watch for the red warning, then defend with your troops, towers, walls and traps, raise a shield, or teleport away.</li></ol></section>' +
        '<section class="panel"><h4>Combat</h4><ul class="bullets"><li>Infantry beat cavalry, cavalry beat ranged, ranged beat infantry (+50% damage).</li><li>Siege engines wreck walls and towers but are weak against troops. Flyers ignore walls.</li><li>Battles are real simulations. Open a report and tap <b>Watch battle</b> to see exactly what happened.</li><li>Wounded troops go to the Infirmary if there are beds; heal them for a fraction of their cost.</li></ul></section>' +
        '<section class="panel"><h4>Fair play rules</h4><ul class="bullets"><li>Beginner protection: your first 45 minutes, while your castle is below level 3.</li><li>After any attack on you, a ' + CH.CONFIG.POST_ATTACK_SHIELD_MIN + '-minute shield. AIs space attacks at least ' + CH.CONFIG.INCOMING_GAP_MIN + ' minutes apart and match their army to your strength.</li><li>Part of every resource is protected by your castle and storage buildings.</li><li>You can\'t raid the same kingdom again for ' + CH.CONFIG.TARGET_COOLDOWN_MIN + ' minutes, and shielded kingdoms can\'t be attacked.</li><li>Attacking or scouting a kingdom drops your own shield.</li></ul></section>' +
        '<section class="panel"><h4>Controls</h4><ul class="bullets"><li>Drag to pan, scroll or pinch to zoom, on both the kingdom and the world map.</li><li>Tap anything on the world map to inspect it; use Filter to show weaker or stronger kingdoms.</li><li>Your castle panel on the map offers random and advanced teleports.</li></ul></section></div>',
    };
  }

  return { store, shop, campaign, stages, endless, raidTargets, raidPrep, army, heroes, buildings, lab, resources, profile, settings, howto, redeem, infirmary, bag, factions, events, trade, mail };
})();
