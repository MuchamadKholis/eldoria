/* =====================================================================
 * Eldoria — core/state.js
 * Everything about the persistent kingdom: resources, buildings,
 * construction timers, production, army training, research, heroes,
 * player level and saving. Pure logic (no DOM) so Node tests can use it.
 * Timers are wall-clock timestamps, so they keep running while offline.
 * ===================================================================== */
CH.State = (function () {
  const C = CH.CONFIG, B = CH.BUILDINGS, U = CH.util;
  const RES = ['gold', 'wood', 'stone', 'food'];

  function defaults(now = Date.now()) {
    const troops = {}; for (const t of CH.TROOP_ORDER) troops[t] = 1;
    const spells = {}; for (const s of CH.SPELL_ORDER) spells[s] = 1;
    const heroes = {}; for (const h of CH.HERO_ORDER) heroes[h] = { unlocked: h === 'aldric', level: 1, xp: 0 };
    const techs = {}; for (const t of CH.TECH_ORDER) techs[t] = 0;
    const buildings = CH.START_LAYOUT.map((b, i) => ({ id: i + 1, type: b.type, level: b.level, tx: b.tx, ty: b.ty, buf: 0, job: null }));
    return {
      version: 1, res: { ...C.START_RES }, buildings, nextId: buildings.length + 1,
      army: { swordsman: 300, archer: 200, lightCavalry: 100 }, train: [], trainJobs: {}, wounded: {}, healJob: null,
      research: { troops, spells, techs }, rjob: null, heroes, defenseHero: 'aldric',
      items: { shield8h: 1, teleRandom: 1, teleAdvanced: 1, speed5m: 5, speed1h: 1 },
      shieldUntil: 0, createdAt: now, faction: null, factionChangedAt: 0, helpUsedAt: 0, reports: [], unread: 0, world: null,
      campaign: {}, raid: { trophies: 0, seed: 1000 + Math.floor(Math.random() * 1e6), opponents: [], wins: 0, attacks: 0 },
      defense: { best: 0, runs: 0, claimed: [] },
      player: { name: 'Lord of Eldoria', xp: 0, level: 1 },
      stats: { battlesWon: 0, enemiesSlain: 0, buildingsRaided: 0, obstaclesCleared: 0, attacksWon: 0, attacksLost: 0, defensesWon: 0, defensesLost: 0, troopsLost: 0, resourcesLooted: 0, monstersSlain: 0, deserted: 0 },
      settings: { music: 0.45, sfx: 0.7, muted: false, damageNumbers: true },
      redeemed: [],
      introSeen: false, lastSeen: now,
    };
  }

  /* ---------- Queries ---------- */
  const castle = s => s.buildings.find(b => b.type === 'castle');
  const castleLevel = s => Math.max(1, (castle(s) || { level: 1 }).level);
  function area(s, cl) {
    const [w, h] = C.AREA[(cl || castleLevel(s)) - 1];
    return { x: Math.floor((C.COLS - w) / 2), y: Math.floor((C.ROWS - h) / 2), w, h };
  }
  const byId = (s, id) => s.buildings.find(b => b.id === id);
  const countOf = (s, type) => s.buildings.filter(b => b.type === type).length;
  const maxCount = (s, type) => (B[type].unlock > castleLevel(s) ? 0 : B[type].counts[castleLevel(s) - 1] || 0);
  const maxLevelFor = (s, type) => (type === 'castle' ? B.castle.maxLevel : Math.min(B[type].maxLevel, castleLevel(s) + 1));
  const highestLevel = (s, type) => s.buildings.filter(b => b.type === type).reduce((m, b) => Math.max(m, b.level), 0);
  const buildingLevel = (s, type) => highestLevel(s, type);

  function capacity(s, r) {
    if (r === 'gems' || r === 'runes') return Infinity;
    let cap = B.castle.cap(castleLevel(s));
    for (const b of s.buildings) if (B[b.type].cat === 'storage' && B[b.type].res === r && b.level > 0) cap += B[b.type].cap(b.level);
    return cap;
  }
  /** Production multiplier from Prosperity research, faction and captured territory. */
  function prodMult(s) {
    let m = 1 + 0.05 * ((s.research.techs || {}).prosperity || 0);
    if (s.faction != null && CH.FACTIONS && CH.FACTIONS[s.faction].bonus.prod) m += CH.FACTIONS[s.faction].bonus.prod;
    if (CH.World && s.world) m += CH.World.territoryBonus(s);
    return m;
  }
  function productionPerMin(s, r) {
    let p = 0;
    for (const b of s.buildings) if (B[b.type].cat === 'econ' && B[b.type].res === r && b.level > 0) p += B[b.type].prod(b.level);
    return p * prodMult(s);
  }
  /** Food eaten per hour by every troop you own (home, marching and wounded). */
  function upkeepPerHour(s) {
    const agri = 1 - 0.05 * ((s.research.techs || {}).agriculture || 0);
    let n = 0;
    const add = army => { for (const t in army) if (CH.TROOPS[t]) n += army[t] * CH.TROOPS[t].upkeep; };
    add(s.army); add(s.wounded || {});
    if (s.world) for (const m of s.world.marches) if (m.owner === 'player') add(m.army);
    return n * agri;
  }
  /** Resources a raider can never take: 1000 per castle level + 25% of each storage building. */
  function protectedAmount(s, r) {
    let p = 1000 * castleLevel(s);
    for (const b of s.buildings) if (B[b.type].cat === 'storage' && B[b.type].res === r && b.level > 0) p += B[b.type].cap(b.level) * 0.25;
    return p;
  }
  const builders = s => s.buildings.filter(b => b.type === 'builderHut' && b.level > 0).length;
  const busy = s => s.buildings.filter(b => b.job).length;
  const freeBuilders = s => builders(s) - busy(s);

  function canAfford(s, cost) { return RES.every(r => (cost[r] || 0) <= s.res[r]) && (cost.gems || 0) <= s.res.gems && (cost.runes || 0) <= s.res.runes; }
  function pay(s, cost) { for (const r of [...RES, 'gems', 'runes']) s.res[r] -= cost[r] || 0; }
  /** Adds resources, respecting storage caps. Returns what was actually added. */
  function give(s, rw) {
    const got = {};
    for (const r of [...RES, 'gems', 'runes']) {
      if (!rw[r]) continue;
      const cap = capacity(s, r);
      const add = Math.max(0, Math.min(rw[r], cap - s.res[r]));
      s.res[r] += add; got[r] = Math.floor(add);
    }
    if (rw.xp) got.levels = addXp(s, rw.xp);
    return got;
  }
  function missing(s, cost) {
    const m = {};
    for (const r of [...RES, 'gems', 'runes']) if ((cost[r] || 0) > s.res[r]) m[r] = cost[r] - s.res[r];
    return m;
  }

  /* ---------- Player level ---------- */
  const xpFor = L => Math.round(80 * Math.pow(L, 1.55));
  function addXp(s, n) {
    s.player.xp += Math.round(n);
    const ups = [];
    while (s.player.xp >= xpFor(s.player.level)) {
      s.player.xp -= xpFor(s.player.level);
      s.player.level++;
      const gems = 3 + Math.floor(s.player.level / 2);
      s.res.gems += gems;
      ups.push({ level: s.player.level, gems });
    }
    return ups;
  }

  /* ---------- Placement ---------- */
  function tilesFree(s, tx, ty, size, ignoreId) {
    const a = area(s);
    if (tx < a.x || ty < a.y || tx + size > a.x + a.w || ty + size > a.y + a.h) return false;
    for (const b of s.buildings) {
      if (b.id === ignoreId) continue;
      const bs = B[b.type].size;
      if (tx < b.tx + bs && tx + size > b.tx && ty < b.ty + bs && ty + size > b.ty) return false;
    }
    return true;
  }

  function buildCost(s, type) {
    if (type === 'builderHut') return B.builderHut.countCost(countOf(s, 'builderHut'));
    return B[type].cost(1);
  }

  /** Why a type can't be built right now (or null if it can). */
  function buildBlocker(s, type) {
    const d = B[type];
    if (d.unlock > castleLevel(s)) return 'Needs castle level ' + d.unlock;
    if (d.requires && !highestLevel(s, d.requires)) return 'Needs a ' + B[d.requires].name;
    if (countOf(s, type) >= maxCount(s, type)) return maxCount(s, type) === 0 ? 'Needs a higher castle level' : 'Limit reached (' + maxCount(s, type) + ')';
    if (!d.instant && type !== 'builderHut' && freeBuilders(s) <= 0) return 'All builders are busy';
    if (!canAfford(s, buildCost(s, type))) return 'Not enough resources';
    return null;
  }

  function build(s, type, tx, ty, now = Date.now()) {
    const d = B[type];
    const why = buildBlocker(s, type);
    if (why) return { ok: false, reason: why };
    if (!tilesFree(s, tx, ty, d.size)) return { ok: false, reason: 'That spot is blocked' };
    pay(s, buildCost(s, type));
    const b = { id: s.nextId++, type, level: 0, tx, ty, buf: 0, job: null };
    // Walls, traps and builder huts appear instantly; everything else takes a builder.
    if (d.instant || type === 'builderHut') b.level = 1;
    else b.job = { kind: 'build', to: 1, ends: now + d.time(1) * 1000, total: d.time(1) };
    s.buildings.push(b);
    if (b.level) addXp(s, 5);
    return { ok: true, building: b };
  }

  function upgradeBlocker(s, b) {
    const d = B[b.type];
    if (d.cat === 'obstacle' || d.cat === 'objective') return 'Can\'t be upgraded';
    if (b.job) return 'Already under construction';
    if (b.level >= d.maxLevel) return 'Maximum level';
    if (b.level >= maxLevelFor(s, b.type)) return 'Upgrade the castle first';
    if (d.requires && b.level >= highestLevel(s, d.requires)) return 'Upgrade the ' + B[d.requires].name + ' first';
    if (b.type === 'castle' && b.level >= C.MAX_CASTLE) return 'Maximum level';
    if (!d.instant && freeBuilders(s) <= 0) return 'All builders are busy';
    if (!canAfford(s, d.cost(b.level + 1))) return 'Not enough resources';
    return null;
  }

  function upgrade(s, id, now = Date.now()) {
    const b = byId(s, id);
    if (!b) return { ok: false, reason: 'No building' };
    const why = upgradeBlocker(s, b);
    if (why) return { ok: false, reason: why };
    const d = B[b.type], L = b.level + 1;
    pay(s, d.cost(L));
    if (d.instant) { b.level = L; addXp(s, 2 + L); return { ok: true, instant: true }; }
    b.job = { kind: 'upgrade', to: L, ends: now + d.time(L) * 1000, total: d.time(L) };
    return { ok: true };
  }

  function move(s, id, tx, ty) {
    const b = byId(s, id);
    if (!b) return false;
    if (!tilesFree(s, tx, ty, B[b.type].size, id)) return false;
    b.tx = tx; b.ty = ty;
    return true;
  }

  function clearObstacle(s, id, now = Date.now()) {
    const b = byId(s, id);
    if (!b || B[b.type].cat !== 'obstacle') return { ok: false, reason: 'Not an obstacle' };
    if (b.job) return { ok: false, reason: 'Already being cleared' };
    const cl = CH.OBSTACLE_CLEAR[b.type];
    if (freeBuilders(s) <= 0) return { ok: false, reason: 'All builders are busy' };
    if (!canAfford(s, cl.cost)) return { ok: false, reason: 'Not enough resources' };
    pay(s, cl.cost);
    b.job = { kind: 'clear', to: 0, ends: now + cl.time * 1000, total: cl.time };
    return { ok: true };
  }

  function speedUpCost(b, now = Date.now()) { return b.job ? Math.max(1, Math.ceil((b.job.ends - now) / 1000 / 30)) : 0; }
  function speedUp(s, id, now = Date.now()) {
    const b = byId(s, id);
    if (!b || !b.job) return false;
    const c = speedUpCost(b, now);
    if (s.res.gems < c) return false;
    s.res.gems -= c;
    b.job.ends = now;
    tick(s, now);
    return true;
  }

  /* ---------- Producers ---------- */
  function collect(s, id) {
    const b = byId(s, id);
    if (!b || B[b.type].cat !== 'econ') return 0;
    const r = B[b.type].res;
    const room = capacity(s, r) - s.res[r];
    const amt = Math.floor(Math.min(b.buf, room));
    s.res[r] += amt; b.buf -= amt;
    return amt;
  }
  function collectAll(s) {
    const got = { gold: 0, wood: 0, stone: 0 };
    for (const b of s.buildings) if (B[b.type].cat === 'econ') got[B[b.type].res] += collect(s, b.id);
    return got;
  }

  /* ---------- Army ---------- */
  const barracksLevel = s => highestLevel(s, 'barracks');
  /** Each military building trains one batch at a time. */
  const batchCap = (s, bld) => (highestLevel(s, bld) ? B[bld].batch(highestLevel(s, bld)) : 0);
  const trainTimeEach = (s, type) => CH.TROOPS[type].time * (1 - 0.04 * (highestLevel(s, CH.TROOPS[type].building) - 1));
  function trainCost(type, n) { const c = CH.TROOPS[type].cost; return { gold: c.gold * n, wood: c.wood * n, stone: c.stone * n, food: c.food * n }; }
  function trainBlocker(s, type, n = 1) {
    const d = CH.TROOPS[type], lvl = highestLevel(s, d.building);
    if (!lvl) return 'Build a ' + B[d.building].name + ' first';
    if (lvl < d.unlock) return 'Needs ' + B[d.building].name + ' level ' + d.unlock;
    if (s.trainJobs[d.building]) return B[d.building].name + ' is busy';
    if (n < 1) return 'Choose an amount';
    if (n > batchCap(s, d.building)) return 'Max ' + batchCap(s, d.building) + ' per batch';
    if (!canAfford(s, trainCost(type, n))) return 'Not enough resources';
    return null;
  }
  function train(s, type, n = 1, now = Date.now()) {
    n = Math.floor(n);
    const why = trainBlocker(s, type, n);
    if (why) return { ok: false, reason: why };
    pay(s, trainCost(type, n));
    const total = Math.max(1, Math.round(trainTimeEach(s, type) * n));
    s.trainJobs[CH.TROOPS[type].building] = { type, n, ends: now + total * 1000, total };
    return { ok: true };
  }
  function cancelTrain(s, bld) {
    const j = s.trainJobs[bld]; if (!j) return false;
    const c = trainCost(j.type, j.n);
    for (const r of RES) s.res[r] += Math.floor(c[r] * 0.5);
    delete s.trainJobs[bld];
    return true;
  }
  /** Infirmary */
  const beds = s => Math.floor(s.buildings.filter(b => b.type === 'infirmary' && b.level > 0).reduce((a, b) => a + B.infirmary.beds(b.level), 0) * (1 + 0.12 * ((s.research.techs || {}).medicine || 0)));
  const woundedCount = s => Object.values(s.wounded || {}).reduce((a, n) => a + n, 0);
  /** Adds casualties: wounded go to the infirmary while beds last, the rest die. Returns {wounded, dead}. */
  function addCasualties(s, lost) {
    let free = Math.max(0, beds(s) - woundedCount(s)), w = 0, dead = 0;
    for (const t in lost) {
      const n = lost[t]; if (!n) continue;
      const k = Math.min(free, n); free -= k; w += k; dead += n - k;
      if (k) s.wounded[t] = (s.wounded[t] || 0) + k;
    }
    s.stats.troopsLost += dead;
    return { wounded: w, dead };
  }
  function healCost(s) { let c = { gold: 0, wood: 0, stone: 0, food: 0 }; for (const t in s.wounded) { const k = trainCost(t, s.wounded[t]); for (const r of RES) c[r] += Math.ceil(k[r] * 0.4); } return c; }
  function healTime(s) { let tm = 0; for (const t in s.wounded) tm += CH.TROOPS[t].time * s.wounded[t] * 0.35; return Math.max(1, Math.round(tm * (1 - 0.1 * ((s.research.techs || {}).medicine || 0)))); }
  function heal(s, now = Date.now()) {
    if (s.healJob) return { ok: false, reason: 'Already healing' };
    if (!woundedCount(s)) return { ok: false, reason: 'No wounded troops' };
    const c = healCost(s);
    if (!canAfford(s, c)) return { ok: false, reason: 'Not enough resources' };
    pay(s, c);
    const total = healTime(s);
    s.healJob = { army: { ...s.wounded }, ends: now + total * 1000, total };
    s.wounded = {};
    return { ok: true };
  }
  /** Items */
  function useItem(s, id, now = Date.now(), target) {
    const it = CH.ITEMS[id];
    if (!it || !(s.items[id] > 0)) return { ok: false, reason: 'You have none' };
    if (it.kind === 'shield') { s.shieldUntil = Math.max(s.shieldUntil, now) + it.ms; if (CH.World && s.world) CH.World.onShield(s, now); }
    else if (it.kind === 'res') { for (const r in it.res) s.res[r] += it.res[r]; }
    else if (it.kind === 'speed') { if (!applySpeed(s, target, it.sec * 1000, now)) return { ok: false, reason: 'Nothing to speed up' }; }
    else if (it.kind === 'teleport') return { ok: false, reason: 'Use teleports from the world map' };
    s.items[id]--;
    return { ok: true };
  }
  /** target: {kind:'building', id} | {kind:'train', bld} | {kind:'research'} | {kind:'heal'} */
  function applySpeed(s, target, ms, now) {
    let job = null;
    if (!target) return false;
    if (target.kind === 'building') { const b = byId(s, target.id); job = b && b.job; }
    else if (target.kind === 'train') job = s.trainJobs[target.bld];
    else if (target.kind === 'research') job = s.rjob;
    else if (target.kind === 'heal') job = s.healJob;
    if (!job) return false;
    job.ends = Math.max(now, job.ends - ms);
    return true;
  }
  function gemFinishCost(job, now = Date.now()) { return job ? Math.max(1, Math.ceil((job.ends - now) / 1000 / 30)) : 0; }
  function gemFinish(s, target, now = Date.now()) {
    const job = target.kind === 'train' ? s.trainJobs[target.bld] : target.kind === 'research' ? s.rjob : target.kind === 'heal' ? s.healJob : null;
    if (!job) return false;
    const c = gemFinishCost(job, now);
    if (s.res.gems < c) return false;
    s.res.gems -= c; job.ends = now;
    return true;
  }
  const shielded = (s, now = Date.now()) => s.shieldUntil > now;
  const beginner = (s, now = Date.now()) => castleLevel(s) < 3 && now - (s.createdAt || now) < C.BEGINNER_MIN * 60000;
  /** Total military + development power, shown everywhere and used for AI matchmaking. */
  function power(s) {
    let p = 0;
    const add = a => { for (const t in a) if (CH.TROOPS[t]) p += a[t] * CH.TROOPS[t].power; };
    add(s.army); if (s.world) for (const m of s.world.marches) if (m.owner === 'player') add(m.army);
    for (const b of s.buildings) p += b.level * (b.type === 'castle' ? 600 : CH.BUILDINGS[b.type].atk ? 120 : 30);
    for (const h in s.heroes) if (s.heroes[h].unlocked) p += 300 * s.heroes[h].level;
    for (const t in s.research.techs) p += 150 * s.research.techs[t];
    return Math.round(p);
  }
  const marchSlots = s => 1 + Math.floor((castleLevel(s) + 1) / 3);
  function trade(s, from, to, amount) {
    const lvl = highestLevel(s, 'tradingPost');
    if (!lvl) return { ok: false, reason: 'Build a Trading Post' };
    amount = Math.floor(amount);
    if (!(amount > 0) || s.res[from] < amount || from === to) return { ok: false, reason: 'Not enough ' + from };
    const got = Math.floor(amount * B.tradingPost.rate(lvl));
    s.res[from] -= amount; s.res[to] += got;
    return { ok: true, got };
  }
  const armySize = s => Object.values(s.army).reduce((a, n) => a + n, 0);
  const housingUsed = s => armySize(s);

  /* ---------- Research ---------- */
  const labLevel = s => highestLevel(s, 'lab');
  function researchCost(kind, id, L) { return kind === 'troop' ? CH.RESEARCH.troopCost(id, L) : kind === 'tech' ? CH.RESEARCH.techCost(L) : CH.RESEARCH.spellCost(L); }
  const resLevel = (s, kind, id) => (kind === 'troop' ? s.research.troops[id] : kind === 'tech' ? s.research.techs[id] || 0 : s.research.spells[id]);
  function researchBlocker(s, kind, id) {
    if (!labLevel(s)) return 'Build a laboratory first';
    if (s.rjob) return 'The lab is busy';
    const cur = resLevel(s, kind, id);
    if (kind === 'tech') { if (cur >= CH.TECHS[id].max) return 'Maximum level'; if (cur >= labLevel(s)) return 'Upgrade the academy first'; }
    else if (cur >= CH.RESEARCH.maxLevel(labLevel(s))) return cur >= 6 ? 'Maximum level' : 'Upgrade the academy first';
    if (kind === 'troop' && highestLevel(s, CH.TROOPS[id].building) < CH.TROOPS[id].unlock) return 'Unlock this troop first';
    if (kind === 'spell' && CH.SPELLS[id].unlock > labLevel(s)) return 'Needs lab level ' + CH.SPELLS[id].unlock;
    if (!canAfford(s, researchCost(kind, id, cur + 1))) return 'Not enough resources';
    return null;
  }
  function research(s, kind, id, now = Date.now()) {
    const why = researchBlocker(s, kind, id);
    if (why) return { ok: false, reason: why };
    const L = resLevel(s, kind, id) + 1;
    pay(s, researchCost(kind, id, L));
    const tm = kind === 'tech' ? CH.RESEARCH.techTime(L) : CH.RESEARCH.time(L);
    s.rjob = { kind, id, to: L, ends: now + tm * 1000, total: tm };
    return { ok: true };
  }
  const spellUnlocked = (s, id) => labLevel(s) >= CH.SPELLS[id].unlock || (id === 'fireball');

  /* ---------- Heroes ---------- */
  const heroHallLevel = s => highestLevel(s, 'heroHall');
  const heroMaxLevel = s => heroHallLevel(s) * 2;
  function heroBlocker(s, id) {
    const h = s.heroes[id], d = CH.HEROES[id];
    if (!h.unlocked) {
      if (heroHallLevel(s) < d.unlock) return 'Needs Hero Hall level ' + d.unlock;
      if (!canAfford(s, d.cost)) return 'Not enough resources';
      return null;
    }
    if (h.level >= heroMaxLevel(s)) return h.level >= 10 ? 'Maximum level' : 'Upgrade the Hero Hall first';
    if (!canAfford(s, CH.heroUpgradeCost(h.level + 1))) return 'Not enough resources';
    return null;
  }
  function heroAction(s, id) {
    const why = heroBlocker(s, id);
    if (why) return { ok: false, reason: why };
    const h = s.heroes[id];
    if (!h.unlocked) { pay(s, CH.HEROES[id].cost); h.unlocked = true; addXp(s, 40); return { ok: true, unlocked: true }; }
    pay(s, CH.heroUpgradeCost(h.level + 1));
    h.level++; addXp(s, 15 * h.level);
    return { ok: true };
  }
  const heroMult = L => 1 + 0.1 * (L - 1);

  /* ---------- Time ---------- */
  /** Advances every timer to `now`. Returns a list of finished events for toasts. */
  function tick(s, now = Date.now()) {
    const events = [];
    const dt = U.clamp((now - (s.lastSeen || now)) / 1000, 0, 7 * 24 * 3600);
    s.lastSeen = now;
    const cleared = [], pm = prodMult(s);
    // Food upkeep. If food runs out, 1% of the army deserts per 10 starving minutes (capped at 25%).
    const need = upkeepPerHour(s) / 3600 * dt;
    if (need > 0) {
      if (s.res.food >= need) s.res.food -= need;
      else {
        const starveSec = (need - s.res.food) / (need / dt);
        s.res.food = 0;
        const frac = Math.min(0.25, 0.01 * starveSec / 600);
        let lost = 0;
        for (const t in s.army) { const k = Math.floor(s.army[t] * frac); s.army[t] -= k; lost += k; }
        if (lost) { s.stats.deserted += lost; events.push({ kind: 'starving', lost }); }
      }
    }
    for (const b of s.buildings) {
      const d = B[b.type];
      if (d.cat === 'econ' && b.level > 0) b.buf = Math.min(d.buf(b.level), (b.buf || 0) + d.prod(b.level) * pm / 60 * dt);
      if (b.job && b.job.ends <= now) {
        if (b.job.kind === 'clear') {
          const cl = CH.OBSTACLE_CLEAR[b.type];
          const got = give(s, cl.yield);
          const gems = (b.id * 7919) % 3 === 0 ? 2 + (b.id % 3) : 0;
          s.res.gems += gems;
          s.stats.obstaclesCleared++;
          cleared.push(b);
          events.push({ kind: 'cleared', type: b.type, got, gems });
          continue;
        }
        b.level = b.job.to; b.job = null;
        const lv = addXp(s, 10 + 8 * b.level * (b.type === 'castle' ? 3 : 1));
        events.push({ kind: 'built', type: b.type, level: b.level, levels: lv });
      }
    }
    for (const b of cleared) s.buildings.splice(s.buildings.indexOf(b), 1);
    for (const bld in s.trainJobs) {
      const j = s.trainJobs[bld];
      if (j.ends <= now) { s.army[j.type] = (s.army[j.type] || 0) + j.n; delete s.trainJobs[bld]; addXp(s, Math.ceil(j.n / 20)); events.push({ kind: 'trained', type: j.type, n: j.n }); }
    }
    if (s.healJob && s.healJob.ends <= now) {
      let n = 0; for (const t in s.healJob.army) { s.army[t] = (s.army[t] || 0) + s.healJob.army[t]; n += s.healJob.army[t]; }
      s.healJob = null; events.push({ kind: 'healed', n });
    }
    if (s.rjob && s.rjob.ends <= now) {
      const j = s.rjob; s.rjob = null;
      if (j.kind === 'troop') s.research.troops[j.id] = j.to; else if (j.kind === 'tech') s.research.techs[j.id] = j.to; else s.research.spells[j.id] = j.to;
      addXp(s, 20 * j.to);
      events.push({ kind: 'research', id: j.id, rkind: j.kind, level: j.to });
    }
    return events;
  }

  /* ---------- Guidance: what to do next ---------- */
  function goals(s) {
    const out = [];
    const cl = castleLevel(s);
    const has = t => s.buildings.some(b => b.type === t && b.level > 0);
    const canBuildMore = t => countOf(s, t) < maxCount(s, t);
    if (!has('stoneQuarry') && canBuildMore('stoneQuarry')) out.push({ text: 'Build a Stone Quarry', act: 'build', type: 'stoneQuarry' });
    if (countOf(s, 'builderHut') < 2) out.push({ text: 'Build a second Builder Hut to work twice as fast', act: 'build', type: 'builderHut' });
    if (!s.campaign['0-0']) out.push({ text: 'Win your first Campaign battle', act: 'campaign' });
    if (!has('goldStorage') && canBuildMore('goldStorage')) out.push({ text: 'Build a Gold Vault to store more gold', act: 'build', type: 'goldStorage' });
    if (cl >= 2 && !has('lab') && canBuildMore('lab')) out.push({ text: 'Build an Academy for research', act: 'build', type: 'lab' });
    if (!s.reports.some(r => r.kind === 'scout')) out.push({ text: 'Open the World map and scout a nearby kingdom', act: 'world' });
    if (!s.stats.attacksWon) out.push({ text: 'Raid a weak kingdom for loot', act: 'world' });
    if (!s.stats.monstersSlain) out.push({ text: 'Clear a monster camp on the World map', act: 'world' });
    if (!Object.keys(s.trainJobs).length && armySize(s) < 400 * cl) out.push({ text: 'Train more troops for your army', act: 'army' });
    if (!highestLevel(s, 'farm') || productionPerMin(s, 'food') * 60 < upkeepPerHour(s)) out.push({ text: 'Build or upgrade Farms: your army eats more than you grow', act: 'build', type: 'farm' });
    if (cl >= 2 && !highestLevel(s, 'watchtower')) out.push({ text: 'Build a Watchtower to spot incoming attacks', act: 'build', type: 'watchtower' });
    if (cl >= 2 && !highestLevel(s, 'embassy')) out.push({ text: 'Build an Embassy and join a faction', act: 'build', type: 'embassy' });
    for (const t of CH.BUILD_MENU[2].types) if (B[t].unlock <= cl && canBuildMore(t)) { out.push({ text: 'Build a ' + B[t].name, act: 'build', type: t }); break; }
    if (countOf(s, 'wall') < maxCount(s, 'wall')) out.push({ text: 'Place walls around your castle (' + countOf(s, 'wall') + '/' + maxCount(s, 'wall') + ')', act: 'build', type: 'wall' });
    if (cl < C.MAX_CASTLE) out.push({ text: 'Upgrade the Castle to level ' + (cl + 1) + ' to unlock ' + unlocksAt(cl + 1).slice(0, 3).join(', '), act: 'castle' });
    return out;
  }
  /** Human-readable list of things a castle level unlocks. */
  function unlocksAt(L) {
    const out = [];
    for (const t in B) {
      const d = B[t];
      if (d.cat === 'obstacle' || d.cat === 'objective') continue;
      if (d.unlock === L) out.push(d.name);
      else if (d.unlock < L && d.counts[L - 1] > d.counts[L - 2]) out.push('+' + (d.counts[L - 1] - d.counts[L - 2]) + ' ' + d.name + (d.counts[L - 1] - d.counts[L - 2] > 1 ? 's' : ''));
    }
    for (const r of CH.REGIONS) if (r.castle === L && L > 1) out.unshift('Region: ' + r.name);
    if ((L + 1) % 3 === 0) out.push('One more march slot');
    out.push('Larger kingdom area');
    return out;
  }

  /* ---------- Redeem codes ---------- */
  /** Redeems a code once per save. Rewards may exceed storage (they are a gift). */
  function redeem(s, input, now = Date.now()) {
    const code = String(input || '').trim();
    if (!code) return { ok: false, reason: 'Enter a code' };
    const h = CH.hashCode(code);
    const entry = (CH.REDEEM_CODES || []).find(c => c.hash === h);
    if (!entry) return { ok: false, reason: 'That code isn\'t valid' };
    if (s.redeemed.includes(h)) return { ok: false, reason: 'You already redeemed this code' };
    const day = new Date(now).toISOString().slice(0, 10);
    if (entry.start && day < entry.start) return { ok: false, reason: 'This code isn\'t active yet' };
    if (entry.expires && day > entry.expires) return { ok: false, reason: 'This code has expired' };
    if (entry.minCastle && castleLevel(s) < entry.minCastle) return { ok: false, reason: 'Needs castle level ' + entry.minCastle };
    const rw = entry.reward || {};
    for (const r of [...RES, 'gems', 'runes']) if (rw[r]) s.res[r] += Math.max(0, Math.floor(rw[r]));
    if (rw.troops) for (const t in rw.troops) if (CH.TROOPS[t]) s.army[t] = (s.army[t] || 0) + Math.max(0, Math.floor(rw.troops[t]));
    if (rw.items) for (const i in rw.items) if (CH.ITEMS[i]) s.items[i] = (s.items[i] || 0) + Math.max(0, Math.floor(rw.items[i]));
    const levels = rw.xp ? addXp(s, rw.xp) : [];
    s.redeemed.push(h);
    return { ok: true, entry, levels };
  }

  /* ---------- Save / load ---------- */
  function validate(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object' || raw.version !== 1) return d;
    const num = (v, lo, hi, df) => (typeof v === 'number' && isFinite(v) ? U.clamp(v, lo, hi) : df);
    for (const r of [...RES, 'gems', 'runes']) d.res[r] = Math.floor(num(raw.res && raw.res[r], 0, 1e9, d.res[r]));
    // Buildings: keep valid ones that don't overlap; always keep a castle.
    if (Array.isArray(raw.buildings)) {
      const out = [];
      const occ = new Set();
      const sorted = raw.buildings.slice().sort((a, b) => (a && a.type === 'castle' ? -1 : 0) - (b && b.type === 'castle' ? -1 : 0));
      for (const b of sorted) {
        if (!b || !B[b.type] || B[b.type].cat === 'objective') continue;
        const size = B[b.type].size;
        const tx = num(b.tx, 0, C.COLS - size, -1), ty = num(b.ty, 0, C.ROWS - size, -1);
        if (tx < 0 || ty < 0) continue;
        const tiles = [];
        let clash = false;
        for (let y = ty; y < ty + size; y++) for (let x = tx; x < tx + size; x++) { const k = y * 100 + x; if (occ.has(k)) clash = true; tiles.push(k); }
        if (clash) continue;
        tiles.forEach(k => occ.add(k));
        const job = b.job && typeof b.job.ends === 'number' && ['build', 'upgrade', 'clear'].includes(b.job.kind) ? { kind: b.job.kind, to: num(b.job.to, 0, 8, 1), ends: b.job.ends, total: num(b.job.total, 0, 1e7, 1) } : null;
        out.push({ id: Math.floor(num(b.id, 1, 1e9, 0)) || 0, type: b.type, level: Math.floor(num(b.level, 0, B[b.type].maxLevel, 1)), tx: Math.floor(tx), ty: Math.floor(ty), buf: num(b.buf, 0, 1e9, 0), job });
      }
      if (out.some(b => b.type === 'castle')) {
        let id = 1; const seen = new Set();
        for (const b of out) { if (!b.id || seen.has(b.id)) b.id = 0; seen.add(b.id); }
        for (const b of out) if (!b.id) { while (seen.has(id)) id++; b.id = id; seen.add(id); }
        d.buildings = out;
        d.nextId = Math.max(...out.map(b => b.id)) + 1;
      }
    }
    if (raw.army && typeof raw.army === 'object') { d.army = {}; for (const t of CH.TROOP_ORDER) if (raw.army[t]) d.army[t] = Math.floor(num(raw.army[t], 0, 999, 0)); }
    if (Array.isArray(raw.train)) d.train = raw.train.filter(q => q && CH.TROOPS[q.type]).slice(0, 200).map(q => ({ type: q.type, left: num(q.left, 0, 3600, 1) }));
    if (raw.research) {
      for (const t of CH.TROOP_ORDER) d.research.troops[t] = Math.floor(num(raw.research.troops && raw.research.troops[t], 1, 6, 1));
      for (const sp of CH.SPELL_ORDER) d.research.spells[sp] = Math.floor(num(raw.research.spells && raw.research.spells[sp], 1, 6, 1));
    }
    if (raw.rjob && typeof raw.rjob.ends === 'number' && ((raw.rjob.kind === 'troop' && CH.TROOPS[raw.rjob.id]) || (raw.rjob.kind === 'spell' && CH.SPELLS[raw.rjob.id]))) d.rjob = { kind: raw.rjob.kind, id: raw.rjob.id, to: Math.floor(num(raw.rjob.to, 2, 6, 2)), ends: raw.rjob.ends, total: num(raw.rjob.total, 0, 1e7, 1) };
    if (raw.heroes) for (const h of CH.HERO_ORDER) { const r = raw.heroes[h]; if (r) d.heroes[h] = { unlocked: !!r.unlocked, level: Math.floor(num(r.level, 1, 10, 1)) }; }
    if (raw.campaign) for (const k in raw.campaign) if (/^[0-5]-[0-5]$/.test(k)) d.campaign[k] = Math.floor(num(raw.campaign[k], 1, 3, 1));
    if (raw.raid) {
      d.raid.trophies = Math.floor(num(raw.raid.trophies, 0, 1e6, 0));
      d.raid.seed = Math.floor(num(raw.raid.seed, 0, 1e12, d.raid.seed));
      d.raid.wins = Math.floor(num(raw.raid.wins, 0, 1e9, 0));
      d.raid.attacks = Math.floor(num(raw.raid.attacks, 0, 1e9, 0));
      if (Array.isArray(raw.raid.opponents)) d.raid.opponents = raw.raid.opponents.filter(o => o && Array.isArray(o.layout) && o.loot).slice(0, 6);
    }
    if (raw.defense) {
      d.defense.best = Math.floor(num(raw.defense.best, 0, 1e6, 0));
      d.defense.runs = Math.floor(num(raw.defense.runs, 0, 1e9, 0));
      d.defense.claimed = Array.isArray(raw.defense.claimed) ? raw.defense.claimed.filter(n => typeof n === 'number') : [];
    }
    if (raw.player) { d.player.level = Math.floor(num(raw.player.level, 1, 999, 1)); d.player.xp = Math.floor(num(raw.player.xp, 0, 1e9, 0)); if (typeof raw.player.name === 'string') d.player.name = raw.player.name.slice(0, 24) || d.player.name; }
    if (raw.stats) for (const k in d.stats) d.stats[k] = Math.floor(num(raw.stats[k], 0, 1e12, 0));
    if (raw.settings) {
      d.settings.music = num(raw.settings.music, 0, 1, d.settings.music);
      d.settings.sfx = num(raw.settings.sfx, 0, 1, d.settings.sfx);
      d.settings.muted = !!raw.settings.muted;
      d.settings.damageNumbers = raw.settings.damageNumbers !== false;
    }
    if (Array.isArray(raw.redeemed)) d.redeemed = raw.redeemed.filter(h => typeof h === 'string').slice(0, 500);
    const troopMap = (o, max = 1e8) => { const r = {}; if (o && typeof o === 'object') for (const t in o) if (CH.TROOPS[t]) { const n = Math.floor(num(o[t], 0, max, 0)); if (n) r[t] = n; } return r; };
    if (raw.army) d.army = troopMap(raw.army);
    d.wounded = troopMap(raw.wounded);
    d.trainJobs = {};
    if (raw.trainJobs && typeof raw.trainJobs === 'object') for (const bld in raw.trainJobs) { const j = raw.trainJobs[bld]; if (j && CH.TROOPS[j.type] && CH.TROOPS[j.type].building === bld && typeof j.ends === 'number') d.trainJobs[bld] = { type: j.type, n: Math.floor(num(j.n, 1, 1e6, 1)), ends: j.ends, total: num(j.total, 1, 1e8, 1) }; }
    if (raw.healJob && typeof raw.healJob.ends === 'number') d.healJob = { army: troopMap(raw.healJob.army), ends: raw.healJob.ends, total: num(raw.healJob.total, 1, 1e8, 1) };
    if (raw.research && raw.research.techs) for (const t of CH.TECH_ORDER) d.research.techs[t] = Math.floor(num(raw.research.techs[t], 0, CH.TECHS[t].max, 0));
    if (raw.rjob && raw.rjob.kind === 'tech' && CH.TECHS[raw.rjob.id] && typeof raw.rjob.ends === 'number') d.rjob = { kind: 'tech', id: raw.rjob.id, to: Math.floor(num(raw.rjob.to, 1, 8, 1)), ends: raw.rjob.ends, total: num(raw.rjob.total, 0, 1e8, 1) };
    if (raw.heroes) for (const h of CH.HERO_ORDER) if (raw.heroes[h]) d.heroes[h].xp = Math.floor(num(raw.heroes[h].xp, 0, 1e9, 0));
    d.heroes.aldric.unlocked = true;
    d.defenseHero = CH.HEROES[raw.defenseHero] ? raw.defenseHero : 'aldric';
    d.items = {}; if (raw.items && typeof raw.items === 'object') for (const i of CH.ITEM_ORDER) { const n = Math.floor(num(raw.items[i], 0, 9999, 0)); if (n) d.items[i] = n; }
    d.shieldUntil = num(raw.shieldUntil, 0, Date.now() + 30 * 24 * 3600e3, 0);
    d.createdAt = num(raw.createdAt, 0, Date.now(), Date.now());
    d.faction = Number.isInteger(raw.faction) && raw.faction >= 0 && raw.faction < 4 ? raw.faction : null;
    d.factionChangedAt = num(raw.factionChangedAt, 0, Date.now(), 0); d.helpUsedAt = num(raw.helpUsedAt, 0, Date.now(), 0);
    d.reports = Array.isArray(raw.reports) ? raw.reports.filter(r => r && typeof r.t === 'number' && typeof r.kind === 'string').slice(0, 60) : [];
    d.unread = Math.floor(num(raw.unread, 0, 999, 0));
    d.world = CH.World ? CH.World.validate(raw.world) : null;
    d.introSeen = !!raw.introSeen;
    d.lastSeen = num(raw.lastSeen, 0, Date.now(), Date.now());
    return d;
  }
  function storage() { try { const ls = window.localStorage; ls.setItem('__ch', '1'); ls.removeItem('__ch'); return ls; } catch (e) { return null; } }
  let memory = null;
  function load() {
    try {
      const ls = storage();
      const raw = ls ? ls.getItem(C.SAVE_KEY) : memory;
      return raw ? validate(JSON.parse(raw)) : defaults();
    } catch (e) { console.warn('[Eldoria] save unreadable, starting fresh', e); return defaults(); }
  }
  function save(s) { const j = JSON.stringify(s); try { const ls = storage(); if (ls) ls.setItem(C.SAVE_KEY, j); else memory = j; return true; } catch (e) { memory = j; return false; } }
  function reset() { try { const ls = storage(); if (ls) ls.removeItem(C.SAVE_KEY); } catch (e) { /* */ } memory = null; return defaults(); }

  return {
    RES, defaults, validate, load, save, reset, persistent: () => !!storage(),
    castle, castleLevel, area, byId, countOf, maxCount, maxLevelFor, highestLevel, buildingLevel, capacity, productionPerMin,
    builders, busy, freeBuilders, canAfford, pay, give, missing, xpFor, addXp,
    tilesFree, buildCost, buildBlocker, build, upgradeBlocker, upgrade, move, clearObstacle, speedUpCost, speedUp,
    collect, collectAll, barracksLevel, housingUsed, trainBlocker, train, cancelTrain, armySize, batchCap, trainTimeEach, trainCost,
    beds, woundedCount, addCasualties, healCost, healTime, heal, useItem, applySpeed, gemFinishCost, gemFinish, shielded, beginner, power, marchSlots, trade,
    prodMult, upkeepPerHour, protectedAmount, resLevel,
    labLevel, researchCost, researchBlocker, research, spellUnlocked, heroHallLevel, heroMaxLevel, heroBlocker, heroAction, heroMult,
    tick, goals, unlocksAt, redeem,
  };
})();
