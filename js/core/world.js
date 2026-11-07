/* =====================================================================
 * Eldoria — core/world.js
 * The living world: generation, AI kingdom simulation, marches, battles,
 * reports, events, factions, territory and teleporting.
 *
 * SIMULATION MODEL (event-driven, cheap):
 *  - AI resources accrue lazily from timestamps (no per-frame work).
 *  - Each AI "thinks" every ~2 minutes: upgrade, train, maybe march.
 *  - Marches carry absolute arrival times; arrivals are resolved in order.
 *  - Offline time is replayed in coarse steps, capped at OFFLINE_CAP_H.
 *  - AI vs AI battles use a fast counter-aware formula; battles involving
 *    the player run the full deterministic engine (CH.Siege) and keep a
 *    replay you can watch.
 * ===================================================================== */
(function () {
  const C = CH.CONFIG, U = CH.util, N = C.WORLD_SIZE;
  const MIN = 60000;

  CH.FACTIONS = [
    { id: 0, name: 'Order of the Lion', color: '#e2b65c', bonus: { prod: 0.05 }, desc: '+5% resource production' },
    { id: 1, name: 'Iron Pact', color: '#a8b4c4', bonus: { fort: 0.08 }, desc: '+8% building health and tower damage' },
    { id: 2, name: 'Silver Moon', color: '#8fc8ff', bonus: { march: 0.1 }, desc: '+10% march speed' },
    { id: 3, name: 'Crimson Horde', color: '#e0503a', bonus: { atk: 0.06 }, desc: '+6% troop attack' },
  ];
  CH.PERSONALITIES = {
    peaceful: { name: 'Peaceful', aggr: 0.15, army: 0.75, eco: 1.35, send: 0.5, cd: 180, mix: { infantry: 3, ranged: 3, cavalry: 1, siege: 0 }, arch: 'resource', desc: 'Builds its economy and rarely starts wars.' },
    aggressive: { name: 'Aggressive', aggr: 1.0, army: 1.3, eco: 0.9, send: 0.75, cd: 25, mix: { infantry: 3, ranged: 2, cavalry: 4, siege: 1 }, arch: 'balanced', desc: 'Attacks neighbours often and holds grudges.' },
    defensive: { name: 'Defensive', aggr: 0.2, army: 1.1, eco: 1.0, send: 0.5, cd: 120, fort: 0.3, mix: { infantry: 4, ranged: 4, cavalry: 1, siege: 0 }, arch: 'heavy', desc: 'Strong walls and towers; strikes back when provoked.' },
    raider: { name: 'Raider', aggr: 0.8, army: 1.0, eco: 0.9, send: 0.6, cd: 30, loot: 1.6, mix: { infantry: 1, ranged: 2, cavalry: 6, siege: 0 }, arch: 'balanced', desc: 'Hunts resource-rich kingdoms with fast cavalry.' },
    expansionist: { name: 'Expansionist', aggr: 0.6, army: 1.15, eco: 1.1, send: 0.65, cd: 40, mix: { infantry: 3, ranged: 2, cavalry: 3, siege: 2 }, arch: 'fortress', desc: 'Seizes forts and territory.' },
    balanced: { name: 'Balanced', aggr: 0.45, army: 1.0, eco: 1.0, send: 0.6, cd: 60, mix: { infantry: 2, ranged: 2, cavalry: 2, siege: 1 }, arch: 'balanced', desc: 'Grows economy and army evenly.' },
  };
  const PKEYS = Object.keys(CH.PERSONALITIES);
  CH.EVENTS = [
    { id: 'resourceRush', name: 'Resource Rush', desc: 'Gathering on resource tiles is twice as fast.' },
    { id: 'monsterInvasion', name: 'Monster Invasion', desc: 'Monster camps respawn quickly and drop 50% more loot.' },
    { id: 'dragonHunt', name: 'Dragon Hunt', desc: 'An Elder Dragon has landed near the heart of Eldoria. Slay it for huge rewards.' },
    { id: 'ancientTreasure', name: 'Ancient Treasure', desc: 'Ancient ruins hold double treasure.' },
    { id: 'castleSiege', name: 'Castle Siege', desc: 'Captured forts give double bonuses; expansionists fight hard for them.' },
    { id: 'territoryWar', name: 'Territory War', desc: 'Every battle won earns points for your faction. The winning faction is rewarded.' },
    { id: 'alienInvasion', name: 'Alien Invasion', desc: 'Motherships strike every castle at once in waves. Troops can\'t die; rewards are paid by your kill count and rank.' },
    { id: 'demonInvasion', name: 'Demon Invasion', desc: 'Hell portals open and demons assault every castle at once. Troops can\'t die; rewards are paid by your kill count and rank.' },
  ];
  const EVENT_LEN = 30 * MIN, EVENT_CYCLE = 40 * MIN;
  CH.CAMP_TYPES = {
    goblinCamp: { name: 'Goblin Camp', biome: 'green', units: ['goblin', 'wolf'] },
    orcCamp: { name: 'Orc Warcamp', biome: 'mountain', units: ['orc', 'goblin', 'sapper'] },
    spiderNest: { name: 'Spider Nest', biome: 'swamp', units: ['spider', 'skeleton'] },
    skeletonFort: { name: 'Skeleton Fortress', biome: 'dark', units: ['skeleton', 'skeletonMage', 'darkKnight'] },
    trollHold: { name: 'Troll Stronghold', biome: 'snow', units: ['troll', 'wolf', 'ogre'] },
    dragonLair: { name: 'Dragon Lair', biome: 'lava', units: ['whelp', 'imp'], boss: 'dragon' },
  };
  CH.RES_TILES = { gold: 'Gold Vein', wood: 'Ancient Forest', stone: 'Stone Quarry', food: 'Wheat Fields' };
  const NAMES = ['Ashenfall', 'Ironclaw Empire', 'Frosthaven', 'Dragonspire', 'Shadowmere', 'Goldencrest', 'Bloodfang Clan'];
  const SYL1 = ['Raven', 'Thorn', 'Storm', 'Wolf', 'Ember', 'Silver', 'Bram', 'Oak', 'Grim', 'Moon', 'Sun', 'Black', 'White', 'Red', 'Star', 'Winter', 'Gloom', 'High', 'Deep', 'Stone'];
  const SYL2 = ['hold', 'vale', 'mere', 'keep', 'ford', 'watch', 'gate', 'crest', 'reach', 'fall', 'helm', 'moor', 'spire', 'haven', 'march', 'garde', 'wick', 'barrow'];
  const LORDS = ['Baron', 'Countess', 'Warlord', 'Duke', 'Lady', 'Jarl', 'Chieftain', 'Margrave', 'Queen', 'King', 'Archon', 'High Lord'];
  const RULERS = ['Ulric', 'Morgana', 'Hask', 'Edda', 'Torvin', 'Seren', 'Bregor', 'Ilsa', 'Corvin', 'Wren', 'Vasha', 'Odric', 'Lyss', 'Garran', 'Nyx', 'Bael'];

  /* ---------------- Geography ---------------- */
  function biomeAt(x, y, seed = 1) {
    const dx = x - N / 2, dy = y - N / 2, d = Math.hypot(dx, dy) / (N / 2);
    const n = Math.sin(x * 0.31 + seed) * 0.05 + Math.cos(y * 0.27 + seed * 2) * 0.05;
    if (d + n < 0.2) return 'lava';
    if (d + n < 0.58) { const a = Math.atan2(dy, dx); return a > -2.36 && a <= -0.79 ? 'snow' : a > -0.79 && a <= 0.79 ? 'dark' : a > 0.79 && a <= 2.36 ? 'swamp' : 'mountain'; }
    return 'green';
  }
  const ring = (x, y) => Math.hypot(x - N / 2, y - N / 2) / (N / 2);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /* ---------------- AI helpers ---------------- */
  const aiProd = (k) => 45 * Math.pow(1.38, k.cl - 1) * CH.PERSONALITIES[k.p].eco;
  const aiCap = cl => 8000 * Math.pow(1.7, cl - 1);
  const aiMaxArmy = k => Math.round(150 * Math.pow(1.75, k.cl - 1) * CH.PERSONALITIES[k.p].army);
  const aiCastleCost = cl => 5000 * Math.pow(1.75, cl - 1);
  const tierMax = cl => Math.min(4, 1 + Math.floor((cl - 1) / 2));
  const armyCount = a => Object.values(a || {}).reduce((x, n) => x + n, 0);
  const armyPower = a => { let p = 0; for (const t in a) p += (a[t] || 0) * CH.troopPower(t); return p; };
  const byClass = (a) => { const o = { infantry: 0, ranged: 0, cavalry: 0, siege: 0, special: 0 }; for (const t in a) if (CH.TROOPS[t]) o[CH.TROOPS[t].cls] += a[t] * CH.troopPower(t); return o; };

  function trainAI(k, n, rnd) {
    const P = CH.PERSONALITIES[k.p], tm = tierMax(k.cl);
    const mix = P.mix, tot = mix.infantry + mix.ranged + mix.cavalry + mix.siege;
    for (const cls of ['infantry', 'ranged', 'cavalry', 'siege']) {
      if (!mix[cls]) continue;
      const share = Math.round(n * mix[cls] / tot);
      const opts = CH.TROOP_ORDER.filter(t => CH.TROOPS[t].cls === cls && CH.TROOPS[t].tier <= tm && CH.TROOPS[t].tier >= tm - 1);
      if (!opts.length || !share) continue;
      const pick = opts[Math.floor(rnd() * opts.length)];
      k.tr[pick] = (k.tr[pick] || 0) + share;
    }
  }

  function makeKingdom(id, name, x, y, cl, rnd) {
    const p = PKEYS[Math.floor(rnd() * PKEYS.length)];
    const a = Math.atan2(y - N / 2, x - N / 2);
    let f = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 4) % 4;
    if (rnd() < 0.2) f = Math.floor(rnd() * 4);
    const k = {
      id, name, ruler: U.pick(LORDS, rnd) + ' ' + U.pick(RULERS, rnd), x, y, f, p, cl,
      res: {}, tr: {}, wd: {}, hl: Math.max(1, cl - 1) + Math.floor(rnd() * 2), seed: Math.floor(rnd() * 1e9),
      sh: 0, last: 0, next: 0, nextAtk: 0, pcd: 0, tcd: 0, grudge: 0, lastBy: null, wins: 0, losses: 0, hist: [], out: false,
    };
    for (const r of ['gold', 'wood', 'stone', 'food']) k.res[r] = Math.round(aiCap(cl) * (0.25 + rnd() * 0.45));
    trainAI(k, Math.round(aiMaxArmy(k) * (0.6 + rnd() * 0.4)), rnd);
    const hClass = Object.entries(byClass(k.tr)).sort((x, y2) => y2[1] - x[1])[0][0];
    k.hero = CH.HERO_ORDER.find(h => CH.HEROES[h].cls === hClass) || 'aldric';
    return k;
  }

  /* ---------------- Generation ---------------- */
  function create(seed, now) {
    const rnd = U.rng(seed);
    const w = { v: 1, seed, epoch: now, lastTick: now, nextId: 1, kingdoms: [], tiles: [], camps: [], ruins: [], forts: [], marches: [], news: [], px: 0, py: 0,
      lastIncomingAt: 0, offline: 0, eventIdx: -1, fpts: [0, 0, 0, 0], territoryAward: -1 };
    const taken = [];
    const free = (x, y, r) => x > 1 && y > 1 && x < N - 2 && y < N - 2 && Math.hypot(x - N / 2, y - N / 2) > 7 && !taken.some(p => Math.abs(p.x - x) < r && Math.abs(p.y - y) < r);
    const place = (minR, maxR, r, tries = 400) => {
      for (let i = 0; i < tries; i++) {
        const a = rnd() * Math.PI * 2, d = (minR + rnd() * (maxR - minR)) * N / 2;
        const x = Math.round(N / 2 + Math.cos(a) * d), y = Math.round(N / 2 + Math.sin(a) * d);
        if (free(x, y, r)) { taken.push({ x, y }); return { x, y }; }
      }
      return null;
    };
    // Player first, on the peaceful outer ring.
    const pp = place(0.72, 0.85, 4); w.px = pp.x; w.py = pp.y;
    const usedNames = new Set();
    const nameFor = () => { let n; let g = 0; do { n = U.pick(SYL1, rnd) + U.pick(SYL2, rnd); n = n[0].toUpperCase() + n.slice(1); } while (usedNames.has(n) && g++ < 50); usedNames.add(n); return n; };
    for (let i = 0; i < C.AI_COUNT; i++) {
      // A few guaranteed weak neighbours near the player.
      let pos = null;
      if (i < 5) { for (let t = 0; t < 300 && !pos; t++) { const x = pp.x + Math.round((rnd() - 0.5) * 22), y = pp.y + Math.round((rnd() - 0.5) * 22); if (free(x, y, 4)) { taken.push({ x, y }); pos = { x, y }; } } }
      if (!pos) pos = place(0.08, 0.95, 4);
      if (!pos) continue;
      const rr = ring(pos.x, pos.y);
      let cl = U.clamp(Math.round(1 + (1 - rr) * 6 + rnd() * 2 - 0.5), 1, 8);
      if (i < 5) cl = 1 + (i % 2);
      const name = i < NAMES.length ? NAMES[i] : nameFor();
      usedNames.add(name);
      w.kingdoms.push(makeKingdom('k' + w.nextId++, name, pos.x, pos.y, cl, rnd));
    }
    for (let i = 0; i < 150; i++) {
      const p = place(0.1, 0.97, 2); if (!p) continue;
      const lvl = U.clamp(Math.round(1 + (1 - ring(p.x, p.y)) * 4 + rnd()), 1, 5);
      const type = U.pick(['gold', 'wood', 'stone', 'food', 'food', 'wood'], rnd);
      w.tiles.push({ id: 't' + w.nextId++, x: p.x, y: p.y, type, lvl, amt: Math.round(4000 * Math.pow(lvl, 1.5)), by: null });
    }
    const campKeys = Object.keys(CH.CAMP_TYPES);
    for (let i = 0; i < 55; i++) {
      const p = place(0.1, 0.97, 2); if (!p) continue;
      const b = biomeAt(p.x, p.y, seed);
      const kind = campKeys.find(k => CH.CAMP_TYPES[k].biome === b) || 'goblinCamp';
      const lvl = U.clamp(Math.round(1 + (1 - ring(p.x, p.y)) * 5 + rnd() * 1.5), 1, 7);
      w.camps.push({ id: 'c' + w.nextId++, x: p.x, y: p.y, kind, lvl, dead: false, respawnAt: 0 });
    }
    for (let i = 0; i < 8; i++) { const p = place(0.25, 0.8, 3); if (p) w.ruins.push({ id: 'r' + w.nextId++, x: p.x, y: p.y, lvl: 3 + Math.floor(rnd() * 4), dead: false, respawnAt: 0 }); }
    const fortBonus = ['gold', 'wood', 'stone', 'food', 'atk', 'prod'];
    for (let i = 0; i < 6; i++) { const p = place(0.3, 0.6, 4); if (p) w.forts.push({ id: 'f' + w.nextId++, x: p.x, y: p.y, lvl: 4 + Math.floor(rnd() * 3), bonus: fortBonus[i], owner: null, ownerName: null, ownerF: null }); }
    for (const k of w.kingdoms) { k.last = now; k.next = now + Math.floor(rnd() * C.AI_THINK * 1000); k.nextAtk = now + (5 + rnd() * 20) * MIN; }
    w.news.push({ t: now, text: 'The realm of Eldoria awakens. ' + w.kingdoms.length + ' kingdoms vie for power.', kind: 'world' });
    if (CH.Throne) CH.Throne.ensure(w);
    return w;
  }

  /* ---------------- Queries ---------------- */
  const W = s => s.world;
  const findAny = (w, id) => id === 'throne' ? w.throne : (w.inv && String(id).startsWith('ship')) ? w.inv.ships.find(x => x.id === id) : findAny0(w, id);
  const findAny0 = (w, id) => w.kingdoms.find(k => k.id === id) || w.camps.find(c => c.id === id) || w.tiles.find(t => t.id === id) || w.ruins.find(r => r.id === id) || w.forts.find(f => f.id === id) || (w.dragon && w.dragon.id === id ? w.dragon : null);
  function eventAt(w, T) {
    const i = Math.floor((T - w.epoch) / EVENT_CYCLE);
    const inside = (T - w.epoch) % EVENT_CYCLE < EVENT_LEN;
    return { idx: i, ev: CH.EVENTS[((i % CH.EVENTS.length) + CH.EVENTS.length) % CH.EVENTS.length], active: inside, ends: w.epoch + i * EVENT_CYCLE + EVENT_LEN, next: w.epoch + (i + 1) * EVENT_CYCLE };
  }
  const evOn = (w, T, id) => { const e = eventAt(w, T); return e.active && e.ev.id === id; };
  function accrue(k, T) {
    if (k.rv && k.rv.length) k.rv = k.rv.filter(r => { if (r.at > T) return true; for (const t in r.army) k.tr[t] = (k.tr[t] || 0) + r.army[t]; return false; });
    const dt = Math.max(0, (T - k.last) / 60000);
    if (dt > 0) {
      const cap = aiCap(k.cl), r = aiProd(k) * dt;
      for (const x of ['gold', 'wood', 'stone', 'food']) k.res[x] = Math.min(cap, (k.res[x] || 0) + r * (x === 'food' ? 1.3 : 1));
      // Wounded AI troops recover over ~30 minutes.
      const heal = Math.min(1, dt / 30);
      for (const t in k.wd) { const h = Math.floor(k.wd[t] * heal); if (h) { k.tr[t] = (k.tr[t] || 0) + h; k.wd[t] -= h; } }
      k.last = T;
    }
  }
  const aiDefPower = k => armyPower(k.tr) * (1 + 0.08 * k.cl) * (1 + (CH.PERSONALITIES[k.p].fort || 0)) + 400 * Math.pow(1.6, k.cl);
  function playerDefPower(s) {
    let p = armyPower(s.army) * (1 + 0.08 * CH.State.castleLevel(s));
    for (const b of s.buildings) if (CH.BUILDINGS[b.type].atk) p += b.level * 120 * CH.Siege.fortScale(CH.State.castleLevel(s)) * 0.05;
    return p + 400 * Math.pow(1.6, CH.State.castleLevel(s));
  }
  function lootable(res, keepFrac) { const o = {}; for (const r of ['gold', 'wood', 'stone', 'food']) o[r] = Math.floor(Math.max(0, (res[r] || 0) * (1 - keepFrac))); return o; }
  const loadOf = army => { let l = 0; for (const t in army) l += (army[t] || 0) * (CH.TROOPS[t] ? CH.TROOPS[t].load : 0); return l; };
  /** Take up to `cap` total from `pool` proportionally. */
  function takeLoot(pool, cap) {
    const total = Object.values(pool).reduce((a, n) => a + n, 0);
    const f = total > 0 ? Math.min(1, cap / total) : 0, out = {};
    for (const r in pool) out[r] = Math.floor(pool[r] * f);
    return out;
  }
  function territoryBonus(s) {
    const w = W(s); if (!w) return 0;
    let b = 0; const dbl = evOn(w, Date.now(), 'castleSiege') ? 2 : 1;
    for (const f of w.forts) if (f.owner === 'player') b += 0.06 * dbl;
    return b;
  }
  function marchSpeedMult(s, heroId) {
    let m = 1 + 0.06 * (s.research.techs.logistics || 0);
    if (s.faction === 2) m += 0.1;
    if (heroId === 'thorne') m += 0.1;
    if (CH.Meta) m += CH.Meta.marchBonus(s, heroId);
    return m;
  }
  function marchSeconds(from, to, army, mult = 1, kind) {
    if (kind === 'scout') return Math.max(15, dist(from, to) * 1.6);
    let slow = 3;
    for (const t in army) if (army[t] > 0 && CH.TROOPS[t]) slow = Math.min(slow, CH.TROOPS[t].march);
    return Math.max(20, dist(from, to) * C.SEC_PER_TILE / (slow * mult));
  }
  function news(w, T, text, kind = 'war') { w.news.unshift({ t: T, text, kind }); if (w.news.length > 60) w.news.length = 60; }
  function hist(k, T, text) { k.hist.unshift({ t: T, text }); if (k.hist.length > 6) k.hist.length = 6; }

  /* ---------------- Reports ---------------- */
  function addReport(s, r) {
    r.id = 'rep' + (W(s).nextId++); r.read = false;
    s.reports.unshift(r);
    // Keep replays only for the newest 15 battle reports to bound save size.
    let withReplay = 0;
    for (const x of s.reports) if (x.replay) { withReplay++; if (withReplay > 15) delete x.replay; }
    if (s.reports.length > 60) s.reports.length = 60;
    s.unread = s.reports.filter(x => !x.read).length;
    return r;
  }

  /* ---------------- AI decisions ---------------- */
  function decide(s, k, T, ev) {
    const w = W(s), P = CH.PERSONALITIES[k.p];
    const rnd = U.rng((k.seed ^ Math.floor(T / 1000)) >>> 0);
    accrue(k, T);
    // Grow: castle upgrade
    if (k.cl < 8) {
      const c = aiCastleCost(k.cl + 1);
      if (k.res.gold >= c && k.res.wood >= c && k.res.stone >= c * 0.8) {
        k.res.gold -= c; k.res.wood -= c; k.res.stone -= c * 0.8; k.cl++;
        k.hl = Math.max(k.hl, k.cl - 1);
        hist(k, T, 'Upgraded the castle to level ' + k.cl);
        if (k.cl >= 6) news(w, T, k.name + ' raised its castle to level ' + k.cl + '. A new power is rising.', 'growth');
      }
    }
    // Train toward its target army size.
    const cur = armyCount(k.tr), target = aiMaxArmy(k);
    if (cur < target) {
      const per = 30 + 25 * tierMax(k.cl);
      const n = Math.floor(Math.min(target - cur, Math.max(0, k.res.food) / per, Math.max(0, k.res.gold) / per, (target - cur) * 0.45 + 20));
      if (n > 0) { trainAI(k, n, rnd); k.res.food -= n * per * 0.8; k.res.gold -= n * per * 0.8; }
    }
    // During the Throne War the Citadel comes first.
    if (CH.Throne && CH.Throne.aiDecide(s, k, T, ev, rnd)) return;
    // War
    if (k.out || T < k.nextAtk || armyCount(k.tr) < target * 0.4) return;
    const myPow = armyPower(k.tr) * P.send * (1 + 0.04 * k.hl);
    const R = 16 + k.cl * 2.5;
    let best = null, bestScore = 0;
    for (const o of w.kingdoms) {
      if (o === k || o.sh > T) continue;
      if (o.f === k.f && k.lastBy !== o.id) continue;
      const d = dist(k, o); if (d > R) continue;
      const ratio = myPow / Math.max(1, aiDefPower(o));
      if (ratio < 1.05 && k.lastBy !== o.id) continue;
      const loot = Object.values(lootable(o.res, 0.3)).reduce((a, n) => a + n, 0);
      const score = (loot * (P.loot || 1) + (k.lastBy === o.id ? 20000 : 0)) * Math.min(2, ratio) / (1 + d / 8);
      if (score > bestScore) { bestScore = score; best = { kind: 'kingdom', o }; }
    }
    // The player, under fairness rules.
    const pTarget = canTargetPlayer(s, k, T);
    if (pTarget) {
      const d = dist(k, { x: w.px, y: w.py });
      const loot = Object.values(playerLootable(s)).reduce((a, n) => a + n, 0);
      const score = (loot * (P.loot || 1) + k.grudge * 15000) / (1 + d / 8) * 1.1 * (k.nemesis ? 20 : 1);
      if (score > bestScore) { bestScore = score; best = { kind: 'player' }; }
    }
    // Expansionists (and everyone during Castle Siege) go for forts.
    if (k.p === 'expansionist' || evOn(w, T, 'castleSiege')) for (const f of w.forts) {
      if (f.owner === k.id || (f.ownerF === k.f && f.owner !== 'player') || (f.owner === 'player' && s.faction === k.f)) continue;
      const d = dist(k, f); if (d > R * 1.3) continue;
      const score = 30000 / (1 + d / 8);
      if (myPow > fortGuard(s, f) * 1.1 && score > bestScore) { bestScore = score; best = { kind: 'fort', o: f }; }
    }
    if (!best || (rnd() > P.aggr && !(k.nemesis && best.kind === 'player'))) { k.nextAtk = T + P.cd * MIN * 0.5; return; }
    launchAI(s, k, best, T, ev, rnd);
    k.nextAtk = T + P.cd * MIN * (0.8 + rnd() * 0.4);
  }

  function playerLootable(s) {
    const o = {};
    for (const r of ['gold', 'wood', 'stone', 'food']) o[r] = Math.max(0, s.res[r] - CH.State.protectedAmount(s, r));
    return o;
  }

  /** Fairness: when may an AI attack the player? */
  function canTargetPlayer(s, k, T) {
    const w = W(s);
    if (s.shieldUntil > T) return false;
    if (CH.State.beginner(s, T)) return false;
    if (s.faction != null && s.faction === k.f) return false;
    if (T - w.lastIncomingAt < C.INCOMING_GAP_MIN * MIN * (k.nemesis ? 0.5 : 1)) return false;
    if (w.marches.some(m => m.target && m.target.type === 'player' && m.kind === 'attack')) return false;
    if (k.pcd > T) return false;
    if (k.friendUntil > T) return false; // rewarded by you as king: loyal for your reign
    if (w.offline >= 0 && w.offlineAttacks >= C.MAX_OFFLINE_ATTACKS) return false;
    const myPow = armyPower(k.tr) * CH.PERSONALITIES[k.p].send;
    const pp = playerDefPower(s);
    if (myPow < pp * 0.55) return false;          // too weak to bother
    if (k.nemesis) return true; // a Nemesis ignores distance, loot and spacing rules (shields still stop it)
    if (k.cl > CH.State.castleLevel(s) + 2 && !k.grudge) return false; // no stomping newcomers
    const loot = Object.values(playerLootable(s)).reduce((a, n) => a + n, 0);
    if (loot < 1500 && !k.grudge) return false;
    if (dist(k, { x: w.px, y: w.py }) > 16 + k.cl * 2.5 + k.grudge * 6) return false;
    return true;
  }

  function fortGuard(s, f) { return f.owner === 'player' ? playerDefPower(s) * 0.35 : f.owner ? 9000 * f.lvl : 6000 * Math.pow(1.5, f.lvl); }

  function launchAI(s, k, best, T, ev, rnd) {
    const w = W(s), P = CH.PERSONALITIES[k.p];
    let frac = P.send;
    if (best.kind === 'player') {
      // Difficulty scaling: send roughly a match for the player's defence, not everything.
      const want = playerDefPower(s) * (0.45 + rnd() * 0.25); // their hero and bonuses make up the rest
      frac = U.clamp(want / Math.max(1, armyPower(k.tr)), 0.25, P.send);
    }
    const army = {};
    for (const t in k.tr) { const n = Math.floor(k.tr[t] * frac); if (n > 0) { army[t] = n; k.tr[t] -= n; } }
    if (!armyCount(army)) return;
    const to = best.kind === 'player' ? { x: w.px, y: w.py } : best.o;
    let secs = marchSeconds(k, to, army);
    if (best.kind === 'player') secs = Math.max(secs, C.ENEMY_WARNING);
    const m = { id: 'm' + w.nextId++, owner: k.id, kind: 'attack', fx: k.x, fy: k.y, tx: to.x, ty: to.y, t0: T, t1: T + secs * 1000, army, hero: k.hero, heroLevel: k.hl,
      target: best.kind === 'player' ? { type: 'player' } : { type: best.kind, id: best.o.id }, cargo: {} };
    w.marches.push(m);
    k.out = true;
    if (best.kind === 'player') { k.pcd = T + C.AI_PLAYER_COOLDOWN_H * 3600e3 / (k.grudge ? 1.5 : 1); w.lastIncomingAt = T; if (w.offline >= 0) w.offlineAttacks++; ev.push({ kind: 'incoming', march: m }); }
  }

  /* ---------------- Formula battles (AI vs AI / neutral) ---------------- */
  function effPower(army, foe, bonus = 1) {
    const mine = byClass(army), them = byClass(foe), tot = Object.values(them).reduce((a, n) => a + n, 0) || 1;
    let p = 0;
    for (const c in mine) { let m = 1; for (const d in them) m += (them[d] / tot) * (((CH.COUNTER[c] || {})[d] || 1) - 1); p += mine[c] * m; }
    return p * bonus;
  }
  function applyLoss(army, frac) { const lost = {}; for (const t in army) { const n = Math.floor(army[t] * frac); if (n) { army[t] -= n; lost[t] = n; } } return lost; }
  function clash(atkArmy, atkBonus, defArmy, defBonus, defFlat) {
    const a = effPower(atkArmy, defArmy, atkBonus), d = effPower(defArmy, atkArmy, defBonus) + defFlat;
    const r = a / Math.max(1, d);
    return { win: r > 1, r, atkLoss: r > 1 ? U.clamp(0.3 / r, 0.04, 0.6) : U.clamp(0.55 / r, 0.3, 0.95), defLoss: r > 1 ? U.clamp(0.45 * r, 0.25, 0.9) : U.clamp(0.3 * r, 0.03, 0.5) };
  }

  /* ---------------- Arrivals ---------------- */
  function returnMarch(w, m, T, army, cargo, extra = {}) {
    const dur = Math.max(10000, (m.t1 - m.t0));
    w.marches.push({ id: 'm' + w.nextId++, owner: m.owner, kind: 'return', fx: m.tx, fy: m.ty, tx: m.fx, ty: m.fy, t0: T, t1: T + dur, army, hero: m.hero, heroLevel: m.heroLevel, cargo, target: { type: 'home' }, ...extra });
  }
  function resolve(s, m, T, ev) {
    const w = W(s);
    w.marches.splice(w.marches.indexOf(m), 1);
    const owner = m.owner === 'player' ? null : w.kingdoms.find(k => k.id === m.owner);
    if (m.kind === 'return') {
      if (m.owner === 'player') {
        for (const t in m.army) s.army[t] = (s.army[t] || 0) + m.army[t];
        // Cargo carried home (gathering, loot) is always kept in full, even above storage limits.
        const got = {};
        for (const r in m.cargo || {}) if (m.cargo[r] > 0) { s.res[r] = (s.res[r] || 0) + m.cargo[r]; got[r] = Math.floor(m.cargo[r]); }
        if (m.cargo && Object.values(m.cargo).some(n => n > 0)) ev.push({ kind: 'returned', cargo: got });
      } else if (owner) {
        for (const t in m.army) owner.tr[t] = (owner.tr[t] || 0) + m.army[t];
        accrue(owner, T);
        for (const r in m.cargo || {}) owner.res[r] = Math.min(aiCap(owner.cl) * 1.5, (owner.res[r] || 0) + m.cargo[r]);
        owner.out = false;
      }
      return;
    }
    if (m.kind === 'gathering') {
      const tile = w.tiles.find(t => t.id === m.target.id);
      const took = Math.min(m.gatherAmt, tile ? tile.amt : 0);
      if (tile) { tile.amt -= took; tile.by = null; if (tile.amt <= 0) { tile.amt = Math.round(4000 * Math.pow(tile.lvl, 1.5)); } }
      // Head home from the tile (the castle may have teleported meanwhile).
      w.marches.push({ id: 'm' + w.nextId++, owner: 'player', kind: 'return', fx: m.tx, fy: m.ty, tx: w.px, ty: w.py, t0: T, t1: T + (m.travel || 30000),
        army: m.army, hero: m.hero, heroLevel: m.heroLevel, cargo: { [tile ? tile.type : 'food']: took }, target: { type: 'home' } });
      addReport(s, { t: T, kind: 'gather', title: 'Gathered ' + U.fmt(took) + ' ' + (tile ? tile.type : ''), outcome: 'win', coords: [m.tx, m.ty] });
      CH.Meta.track(s, 'gather', took, T);
      ev.push({ kind: 'report', report: s.reports[0] });
      return;
    }
    if (m.kind === 'gather') {
      const tile = w.tiles.find(t => t.id === m.target.id);
      if (!tile || (tile.by && tile.by !== m.id)) { returnMarch(w, m, T, m.army, {}); return; }
      const load = loadOf(m.army), rate = 6 * tile.lvl * (evOn(w, T, 'resourceRush') ? 2 : 1); // per second
      const amt = Math.min(load, tile.amt);
      tile.by = m.id;
      w.marches.push({ ...m, kind: 'gathering', gatherAmt: amt, t0: T, t1: T + Math.max(10, amt / rate) * 1000, arrivedAt: T, travel: m.t1 - m.t0, fx: m.tx, fy: m.ty });
      return;
    }
    if (m.kind === 'scout') { CH.Meta.track(s, 'scout', 1, T); scoutReport(s, m, T, ev); returnMarch(w, m, T, m.army, {}); return; }
    // ---- attacks ----
    const tgt = m.target;
    if (m.kind === 'invade') return CH.Invasion.arrive(s, m, T, ev);
    if (tgt.type === 'ship') return CH.Invasion.attackShip(s, m, T, ev);
    if (tgt.type === 'throne') return CH.Throne.arrive(s, m, T, ev);
    if (tgt.type === 'player') return defendPlayer(s, m, owner, T, ev);
    if (m.owner === 'player') return playerAttack(s, m, T, ev);
    // AI vs AI / neutral
    if (!owner) return;
    if (tgt.type === 'kingdom') {
      const d = w.kingdoms.find(k => k.id === tgt.id);
      if (!d || d.sh > T) { returnMarch(w, m, T, m.army, {}); return; }
      accrue(d, T);
      const res = clash(m.army, 1 + 0.04 * m.heroLevel, d.tr, (1 + 0.08 * d.cl) * (1 + (CH.PERSONALITIES[d.p].fort || 0)), 400 * Math.pow(1.6, d.cl));
      const aLost = applyLoss(m.army, res.atkLoss), dLost = applyLoss(d.tr, res.defLoss);
      for (const t in dLost) d.wd[t] = (d.wd[t] || 0) + Math.floor(dLost[t] * 0.5);
      let loot = {};
      if (res.win) { loot = takeLoot(lootable(d.res, 0.3), loadOf(m.army) * (CH.PERSONALITIES[owner.p].loot || 1)); for (const r in loot) d.res[r] -= loot[r]; }
      owner.wins += res.win ? 1 : 0; owner.losses += res.win ? 0 : 1; d.losses += res.win ? 1 : 0;
      owner.kills = (owner.kills || 0) + armyCount(dLost); d.kills = (d.kills || 0) + armyCount(aLost);
      if (res.win) d.burn = T + 10 * MIN; else d.smoke = T + 6 * MIN;
      d.lastBy = owner.id;
      if (res.win && (d.p === 'defensive' || d.p === 'peaceful')) d.sh = T + 60 * MIN;
      const tot = Object.values(loot).reduce((a, n) => a + n, 0);
      news(w, T, res.win ? owner.name + ' sacked ' + d.name + (tot ? ', carrying off ' + U.fmt(tot) + ' resources' : '') + '.' : d.name + ' repelled an attack from ' + owner.name + '.', 'war');
      hist(owner, T, (res.win ? 'Defeated ' : 'Was repelled by ') + d.name); hist(d, T, (res.win ? 'Sacked by ' : 'Repelled ') + owner.name);
      if (evOn(w, T, 'territoryWar') && res.win) w.fpts[owner.f] += 10;
      if (armyCount(m.army)) returnMarch(w, m, T, m.army, loot); else owner.out = false;
      if (m.hiredBy === 'player') { const r = addReport(s, { t: T, kind: 'event', outcome: res.win ? 'win' : 'loss', title: '💰 Your mercenaries from ' + owner.name + (res.win ? ' sacked ' : ' were repelled by ') + d.name, coords: [d.x, d.y] }); ev.push({ kind: 'report', report: r }); }
      ev.push({ kind: 'news' });
      return;
    }
    if (tgt.type === 'fort') {
      const f = w.forts.find(x => x.id === tgt.id); if (!f) return;
      const guard = fortGuard(s, f);
      const a = effPower(m.army, {}, 1 + 0.04 * m.heroLevel), win = a > guard;
      applyLoss(m.army, win ? U.clamp(0.3 * guard / a, 0.05, 0.5) : 0.6);
      if (win) {
        const prev = f.owner;
        f.owner = owner.id; f.ownerName = owner.name; f.ownerF = owner.f;
        news(w, T, owner.name + ' captured the fort at (' + f.x + ',' + f.y + ').', 'territory');
        if (prev === 'player') { addReport(s, { t: T, kind: 'fort', title: 'Your fort was captured by ' + owner.name, outcome: 'loss', coords: [f.x, f.y] }); ev.push({ kind: 'report', report: s.reports[0] }); }
      }
      if (armyCount(m.army)) returnMarch(w, m, T, m.army, {}); else owner.out = false;
      return;
    }
    returnMarch(w, m, T, m.army, {});
  }

  /** An AI army arrives at the player's castle. Full engine battle on the real base layout. */
  function defendPlayer(s, m, owner, T, ev) {
    const w = W(s);
    if (!owner) return;
    if (s.shieldUntil > T || m.bounce) {
      news(w, T, owner.name + '\'s army turned back: your kingdom was protected.', 'defense');
      returnMarch(w, m, T, m.army, {});
      addReport(s, { t: T, kind: 'defense', title: owner.name + ' turned back', outcome: 'bounced', attacker: owner.name });
      ev.push({ kind: 'report', report: s.reports[0] });
      return;
    }
    const cl = CH.State.castleLevel(s);
    const homeHeroes = [];
    let defHero = null;
    const busy = new Set(w.marches.filter(x => x.owner === 'player').map(x => x.hero));
    if (s.defenseHero && s.heroes[s.defenseHero] && s.heroes[s.defenseHero].unlocked && !busy.has(s.defenseHero)) { defHero = { id: s.defenseHero, level: s.heroes[s.defenseHero].level, skin: CH.State.heroSkin(s, s.defenseHero), might: CH.Meta.might(s, s.defenseHero, 'def') }; homeHeroes.push(defHero); }
    const garrison = { ...s.army };
    let helpers = 0;
    if (s.helpUntil > T && s.faction != null) {
      const cap = CH.BUILDINGS.embassy.reinforce(CH.State.highestLevel(s, 'embassy') || 1);
      const tm = tierMax(cl);
      const pick = t => CH.TROOP_ORDER.find(x => CH.TROOPS[x].cls === t && CH.TROOPS[x].tier === Math.max(1, tm - 1)) || 'swordsman';
      garrison[pick('infantry')] = (garrison[pick('infantry')] || 0) + Math.round(cap * 0.5);
      garrison[pick('ranged')] = (garrison[pick('ranged')] || 0) + Math.round(cap * 0.5);
      helpers = cap;
    }
    const fortBonus = 0.06 * (s.research.techs.fortification || 0) + (s.faction === 1 ? 0.08 : 0);
    const cfg = CH.Siege.build({
      attacker: { name: owner.name, army: m.army, hero: { id: m.hero, level: m.heroLevel }, research: {}, atkBonus: 0.03 * owner.cl },
      defender: { name: s.player.name, kind: 'player', cl, homeTerrain: true, layout: s.buildings.filter(b => b.level > 0).map(b => ({ type: b.type, level: b.level, tx: b.tx, ty: b.ty })),
        army: garrison, heroes: homeHeroes, hero: defHero, research: s.research.troops, fortBonus },
      formation: U.pick(['surround', 'spearhead', 'pincer'], U.rng(T % 1e9)), dir: { x: w.px - m.fx, y: w.py - m.fy }, seed: (T % 1e9) | 0, playerSide: 'def',
    });
    cfg.castleSkin = s.equipped ? s.equipped.castle : null;
    const sum = CH.Siege.run(cfg);
    // Defender casualties (only the player's own troops; helpers' losses are theirs).
    const ownLost = {};
    for (const t in sum.def.lost) { const own = Math.min(s.army[t] || 0, Math.round(sum.def.lost[t] * ((s.army[t] || 0) / Math.max(1, garrison[t])))); if (own) { ownLost[t] = own; s.army[t] -= own; } }
    const cas = CH.State.addCasualties(s, ownLost);
    // Attacker casualties: dead.
    for (const t in sum.atk.lost) m.army[t] = Math.max(0, (m.army[t] || 0) - sum.atk.lost[t]);
    let loot = {};
    const outcome = sum.outcome; // from attacker's view
    if (outcome !== 'loss') {
      const pool = playerLootable(s); const f = outcome === 'win' ? 0.35 : 0.15;
      for (const r in pool) pool[r] *= f;
      loot = takeLoot(pool, loadOf(m.army));
      for (const r in loot) s.res[r] = Math.max(0, s.res[r] - loot[r]);
    }
    // Recovery period: the worse it went for you, the longer the protection.
    s.shieldUntil = Math.max(s.shieldUntil, T + C.POST_ATTACK_SHIELD_MIN * MIN * (outcome === 'win' ? 2 : outcome === 'partial' ? 1.5 : 1));
    s.stats.kills += armyCount(sum.atk.lost); owner.kills = (owner.kills || 0) + armyCount(sum.def.lost); CH.Meta.track(s, 'kills', armyCount(sum.atk.lost), T);
    if (outcome === 'win') w.pburn = T + 10 * MIN; else w.psmoke = T + 6 * MIN;
    owner.grudge = outcome === 'loss' ? Math.min(5, owner.grudge + (CH.PERSONALITIES[owner.p].aggr > 0.5 ? 1 : 0)) : owner.grudge;
    let reward = {};
    if (outcome === 'loss') {
      reward = { gold: 300 * cl, food: 300 * cl, xp: 40 + 10 * cl };
      CH.State.give(s, reward); s.stats.defensesWon++; CH.Meta.track(s, 'defendWin', 1, T);
      if (homeHeroes[0]) heroXp(s, homeHeroes[0].id, 60 + armyPower(sum.atk.lost) / 40);
    } else s.stats.defensesLost++;
    owner.wins += outcome !== 'loss' ? 1 : 0; owner.losses += outcome === 'loss' ? 1 : 0;
    hist(owner, T, (outcome === 'loss' ? 'Was repelled by ' : 'Raided ') + s.player.name);
    news(w, T, outcome === 'loss' ? s.player.name + ' repelled ' + owner.name + '!' : owner.name + ' raided ' + s.player.name + '.', 'defense');
    if (armyCount(m.army)) returnMarch(w, m, T, m.army, loot); else owner.out = false;
    const rep = addReport(s, {
      t: T, kind: 'defense', you: 'def', outcome: outcome === 'loss' ? 'win' : outcome === 'partial' ? 'partial' : 'loss',
      title: outcome === 'loss' ? 'You repelled ' + owner.name : outcome === 'partial' ? owner.name + ' broke through part of your defenses' : owner.name + ' raided your kingdom',
      atk: { name: owner.name, id: owner.id, sent: sum.atk.sent, lost: sum.atk.lost, hero: m.hero }, def: { name: s.player.name, sent: sum.def.sent, lost: sum.def.lost, hero: homeHeroes[0] && homeHeroes[0].id, helpers },
      loot, reward, casualties: cas, destruction: sum.destruction, dmg: sum.dmg, time: Math.round(sum.time), replay: cfg, coords: [owner.x, owner.y],
    });
    ev.push({ kind: 'report', report: rep, alert: true });
  }

  function heroXp(s, id, xp) {
    const h = s.heroes[id]; if (!h || !h.unlocked) return;
    h.xp = (h.xp || 0) + Math.round(xp);
    const cap = Math.max(1, CH.State.heroMaxLevel(s));
    while (h.level < cap && h.xp >= CH.heroXpFor(h.level)) { h.xp -= CH.heroXpFor(h.level); h.level++; }
  }

  function campMonsters(c, w, T) {
    const ct = c.isDragon ? { units: ['whelp', 'imp'], boss: 'dragon' } : c.isRuin ? { units: ['darkKnight', 'skeletonMage', 'ogre'] } : CH.CAMP_TYPES[c.kind];
    const total = Math.round(40 * Math.pow(c.lvl, 1.75));
    const out = {};
    ct.units.forEach((u, i) => { out[u] = Math.round(total * (i === 0 ? 0.55 : 0.45 / (ct.units.length - 1))); });
    if (ct.boss && c.lvl >= 5) out[ct.boss] = 1;
    return out;
  }
  function campRewards(c, w, T) {
    const mult = (evOn(w, T, 'monsterInvasion') ? 1.5 : 1) * (c.isRuin && evOn(w, T, 'ancientTreasure') ? 2 : 1) * (c.isDragon ? 4 : c.isRuin ? 2 : 1);
    const base = Math.round(500 * Math.pow(c.lvl, 1.7) * mult);
    const rw = { gold: base, wood: Math.round(base * 0.8), stone: Math.round(base * 0.6), food: base };
    const items = {};
    if (c.lvl >= 3) rw.runes = c.lvl - 2;
    if (c.lvl >= 4 || c.isRuin) items.speed1h = 1;
    if (c.isRuin || c.isDragon) { rw.gems = 20 * c.lvl; items.goldPack = 1; }
    if (c.isDragon) items.shield8h = 1;
    return { rw, items, xp: 60 * c.lvl * (c.isDragon ? 3 : 1) };
  }

  /** The player's march arrives at its target: build and run the battle. */
  function playerAttack(s, m, T, ev) {
    const w = W(s), tgt = m.target;
    const hero = m.hero ? { id: m.hero, level: s.heroes[m.hero].level, skin: CH.State.heroSkin(s, m.hero), might: CH.Meta.might(s, m.hero) } : null;
    const own = m.army, mergedArmy = { ...m.army };
    for (const x of m.allies || []) for (const t in x.army) mergedArmy[t] = (mergedArmy[t] || 0) + x.army[t];
    const attacker = { name: s.player.name + (m.allies && m.allies.length ? ' (rally of ' + (m.allies.length + 1) + ')' : ''), army: mergedArmy, hero, research: s.research.troops, atkBonus: 0.03 * (s.research.techs.warfare || 0) + (s.faction === 3 ? 0.06 : 0) };
    const dir = { x: m.tx - m.fx, y: m.ty - m.fy }, seed = (T % 1e9) | 0;
    let cfg, defender, target;
    if (tgt.type === 'kingdom') {
      target = w.kingdoms.find(k => k.id === tgt.id);
      if (!target || target.sh > T) { returnMarch(w, m, T, m.army, {}); addReport(s, { t: T, kind: 'attack', title: (target ? target.name : 'Target') + ' was shielded', outcome: 'bounced' }); ev.push({ kind: 'report', report: s.reports[0] }); return; }
      accrue(target, T);
      const P = CH.PERSONALITIES[target.p];
      defender = { name: target.name, kind: 'kingdom', cl: target.cl, layout: CH.Raid.layout(target.seed + target.cl * 7, target.cl, target.cl <= 1 ? 'beginner' : P.arch), army: target.tr, heroes: [{ id: target.hero, level: target.hl }], research: {}, fortBonus: P.fort || 0 };
    } else {
      target = findAny(w, tgt.id);
      if (!target || target.dead) { returnMarch(w, m, T, m.army, {}); addReport(s, { t: T, kind: 'monster', title: 'The target was already gone', outcome: 'bounced' }); ev.push({ kind: 'report', report: s.reports[0] }); return; }
      if (tgt.type === 'fort') {
        const guardArmy = target.owner && target.owner !== 'player' ? { knight: 60 * target.lvl, crossbowman: 60 * target.lvl, heavyCavalry: 30 * target.lvl } : { swordsman: 120 * target.lvl, archer: 120 * target.lvl, knight: 30 * target.lvl };
        defender = { name: target.ownerName ? target.ownerName + '\'s fort' : 'Abandoned Fort', kind: 'kingdom', cl: Math.min(8, target.lvl), layout: CH.Raid.layout(target.x * 131 + target.y, Math.min(8, target.lvl), 'heavy'), army: guardArmy, heroes: [], research: {} };
      } else {
        const lvl = target.lvl;
        defender = { name: target.isDragon ? 'Elder Dragon' : target.isRuin ? 'Ancient Ruins' : CH.CAMP_TYPES[target.kind].name, kind: 'camp', cl: Math.min(8, lvl), layout: campLayout(target), monsters: campMonsters(target, w, T), monsterMult: 1 + 0.25 * lvl, heroes: [] };
      }
    }
    cfg = CH.Siege.build({ attacker, defender, formation: m.formation || 'surround', dir, seed, playerSide: 'atk' });
    const sum = CH.Siege.run(cfg);
    // Survivors are shared out by contribution; rally allies take theirs home.
    const ratio = t => (sum.atk.sent[t] ? (sum.atk.left[t] || 0) / sum.atk.sent[t] : 0);
    const ownLost = {};
    for (const t in own) { const keep = Math.floor(own[t] * ratio(t)); if (own[t] - keep > 0) ownLost[t] = own[t] - keep; m.army[t] = keep; }
    for (const x of m.allies || []) { const k = w.kingdoms.find(o => o.id === x.id); if (k) { for (const t in x.army) k.tr[t] = (k.tr[t] || 0) + Math.floor(x.army[t] * ratio(t)); k.out = false; } }
    // Your casualties: half wounded (infirmary), half dead.
    const half = {}; for (const t in ownLost) half[t] = Math.floor(ownLost[t] * 0.5);
    const cas = CH.State.addCasualties(s, half);
    cas.dead += armyCount(ownLost) - armyCount(half);
    s.stats.kills += armyCount(sum.def.lost);
    CH.Meta.track(s, 'kills', armyCount(sum.def.lost), T);
    const won = sum.outcome !== 'loss';
    let loot = {}, reward = {}, items = {};
    if (tgt.type === 'kingdom') {
      const k = target;
      for (const t in sum.def.lost) { const n = Math.min(k.tr[t] || 0, sum.def.lost[t]); k.tr[t] -= n; k.wd[t] = (k.wd[t] || 0) + Math.floor(n * 0.5); }
      if (won) {
        const pool = lootable(k.res, 0.3), f = sum.outcome === 'win' ? 0.8 : 0.4;
        for (const r in pool) pool[r] *= f;
        loot = takeLoot(pool, loadOf(m.army));
        for (const r in loot) k.res[r] -= loot[r];
        s.stats.resourcesLooted += Object.values(loot).reduce((a, n) => a + n, 0);
        k.losses++;
      } else k.wins++;
      k.kills = (k.kills || 0) + armyCount(sum.atk.lost);
      if (sum.outcome === 'win') k.burn = T + 10 * MIN; else k.smoke = T + 6 * MIN;
      k.grudge = Math.min(5, k.grudge + (CH.PERSONALITIES[k.p].aggr >= 0.45 ? 2 : 1));
      k.lastBy = 'player';
      if (won && (k.p === 'defensive' || k.p === 'peaceful')) k.sh = T + 45 * MIN;
      hist(k, T, (won ? 'Raided by ' : 'Repelled ') + s.player.name);
      news(w, T, won ? s.player.name + ' raided ' + k.name + '!' : k.name + ' repelled ' + s.player.name + '.', 'war');
      reward = { xp: 30 + 8 * k.cl + Math.round(armyPower(sum.def.lost) / 60) };
      if (won) s.stats.attacksWon++; else s.stats.attacksLost++;
      if (won) { CH.Meta.track(s, 'raidWin', 1, T); const nr = CH.Meta.onPlayerBeat(s, k, T); if (nr) ev.push({ kind: 'report', report: nr, alert: true }); }
      if (evOn(w, T, 'territoryWar') && won && s.faction != null) w.fpts[s.faction] += 15;
    } else if (tgt.type === 'fort') {
      if (sum.outcome === 'win') { target.owner = 'player'; target.ownerName = s.player.name; target.ownerF = s.faction; news(w, T, s.player.name + ' captured the fort at (' + target.x + ',' + target.y + ').', 'territory'); }
      reward = { xp: 120 * target.lvl };
    } else {
      if (sum.outcome === 'win') {
        const r = campRewards(target, w, T);
        loot = { gold: r.rw.gold, wood: r.rw.wood, stone: r.rw.stone, food: r.rw.food };
        reward = { gems: r.rw.gems || 0, runes: r.rw.runes || 0, xp: 20 + target.lvl * 10 }; items = r.items;
        for (const i in items) s.items[i] = (s.items[i] || 0) + items[i];
        const mats = CH.Meta.campMats(target.lvl, target.isDragon ? 'dragon' : target.isRuin ? 'ruin' : 'camp'); CH.Meta.give(s, { mats }); reward.mats = mats;
        CH.Meta.track(s, 'campWin', 1, T); if (target.isDragon) CH.Meta.track(s, 'dragon', 1, T);
        target.dead = true; target.respawnAt = T + (evOn(w, T, 'monsterInvasion') ? 5 : 20) * MIN * (target.isRuin ? 6 : 1);
        if (target.isDragon) { w.dragon = null; news(w, T, s.player.name + ' slew the Elder Dragon!', 'event'); }
        s.stats.monstersSlain += Object.values(sum.def.lost).reduce((a, n) => a + n, 0);
        if (hero) heroXp(s, hero.id, r.xp);
      }
    }
    if (reward.xp) CH.State.addXp(s, reward.xp);
    if (reward.gems) s.res.gems += reward.gems;
    if (reward.runes) s.res.runes += reward.runes;
    if (hero && tgt.type !== 'camp' && tgt.type !== 'ruin') heroXp(s, hero.id, 40 + armyPower(sum.def.lost) / 30);
    if (armyCount(m.army)) returnMarch(w, m, T, m.army, loot);
    const rep = addReport(s, {
      t: T, kind: tgt.type === 'kingdom' || tgt.type === 'fort' ? 'attack' : 'monster', you: 'atk', outcome: sum.outcome,
      title: (sum.outcome === 'win' ? 'Victory at ' : sum.outcome === 'partial' ? 'Partial victory at ' : 'Defeat at ') + defender.name,
      atk: { name: s.player.name, sent: sum.atk.sent, lost: sum.atk.lost, hero: m.hero }, def: { name: defender.name, id: target.id, sent: sum.def.sent, lost: sum.def.lost, hero: defender.heroes && defender.heroes[0] && defender.heroes[0].id },
      loot, reward, items, casualties: cas, destruction: sum.destruction, dmg: sum.dmg, time: Math.round(sum.time), replay: cfg, coords: [m.tx, m.ty], targetType: tgt.type,
    });
    ev.push({ kind: 'report', report: rep });
  }

  function campLayout(c) {
    const L = [{ type: 'outpost', level: Math.min(8, c.lvl), tx: 14, ty: 10 }];
    if (c.lvl >= 3) for (let x = 12; x <= 17; x++) for (const y of [8, 13]) L.push({ type: 'wall', level: Math.min(8, c.lvl - 1), tx: x, ty: y });
    return L;
  }

  function scoutReport(s, m, T, ev) {
    const w = W(s), k = w.kingdoms.find(x => x.id === m.target.id) || findAny(w, m.target.id);
    if (!k) return;
    const lvl = s.research.techs.scouting || 0;
    let rep;
    if (m.target.type === 'kingdom') {
      accrue(k, T);
      const P = CH.PERSONALITIES[k.p];
      const loot = lootable(k.res, 0.3);
      rep = { t: T, kind: 'scout', title: 'Scout report: ' + k.name, outcome: 'win', coords: [k.x, k.y], targetId: k.id, scoutLvl: lvl,
        cl: k.cl, personality: P.name, ruler: k.ruler, faction: k.f, hero: lvl >= 2 ? { id: k.hero, level: k.hl } : null,
        res: lvl >= 2 ? { ...k.res } : Object.fromEntries(Object.entries(k.res).map(([r, v]) => [r, Math.round(v / 1000) * 1000])),
        loot, troopsTotal: lvl >= 1 ? armyCount(k.tr) : Math.round(armyCount(k.tr) / 100) * 100,
        byClass: lvl >= 1 ? Object.fromEntries(Object.entries(k.tr).reduce((m2, [t, n]) => { const c = CH.TROOPS[t].cls; m2.set(c, (m2.get(c) || 0) + n); return m2; }, new Map())) : null,
        troops: lvl >= 2 ? { ...k.tr } : null, power: Math.round(aiDefPower(k)),
        layout: CH.Raid.layout(k.seed + k.cl * 7, k.cl, k.cl <= 1 ? 'beginner' : P.arch), hist: k.hist.slice(0, 3) };
    } else if (m.target.type === 'throne') {
      const war = k.war && !k.war.ended ? k.war : null;
      rep = { t: T, kind: 'scout', title: 'Scout report: ' + CH.THRONE.name, outcome: 'win', coords: [k.x, k.y], targetId: 'throne', monsters: war ? war.garrison : {},
        note: war ? 'Held by ' + CH.Throne.keyName(s, war.holder) : 'No war in progress. The Citadel opens on ' + CH.Throne.warLabel() + '.' };
    } else {
      rep = { t: T, kind: 'scout', title: 'Scout report: (' + k.x + ',' + k.y + ')', outcome: 'win', coords: [k.x, k.y], targetId: k.id, monsters: campMonsters(k, w, T) };
    }
    const r = addReport(s, rep);
    ev.push({ kind: 'report', report: r });
  }

  /* ---------------- World tick ---------------- */
  function processUntil(s, T, ev) {
    const w = W(s);
    if (CH.Throne) CH.Throne.update(s, T, ev);
    // Arrivals in time order.
    for (;;) {
      let nxt = null;
      for (const m of w.marches) if (m.t1 <= T && (!nxt || m.t1 < nxt.t1)) nxt = m;
      if (!nxt) break;
      resolve(s, nxt, nxt.t1, ev);
    }
    // AI decisions on their schedules.
    for (const k of w.kingdoms) if (k.next <= T) { decide(s, k, T, ev); k.next = T + C.AI_THINK * 1000 * (0.7 + ((k.seed + Math.floor(T / 1000)) % 60) / 100); }
    // Respawns
    for (const c of w.camps.concat(w.ruins)) if (c.dead && c.respawnAt <= T) c.dead = false;
    // Events
    const e = eventAt(w, T);
    if (e.idx !== w.eventIdx) {
      const prev = w.eventIdx >= 0 ? CH.EVENTS[w.eventIdx % CH.EVENTS.length] : null;
      if (prev && prev.id === 'territoryWar' && w.territoryAward !== w.eventIdx) {
        const win = w.fpts.indexOf(Math.max(...w.fpts));
        w.territoryAward = w.eventIdx;
        news(w, T, CH.FACTIONS[win].name + ' won the Territory War!', 'event');
        if (s.faction === win) { s.res.gems += 100; s.items.speed1h = (s.items.speed1h || 0) + 2; addReport(s, { t: T, kind: 'event', title: 'Your faction won the Territory War: +100 gems, 2× Speed-up 1h', outcome: 'win' }); }
      }
      w.eventIdx = e.idx; w.fpts = [0, 0, 0, 0];
      news(w, T, 'World event: ' + e.ev.name + '. ' + e.ev.desc, 'event');
      if (e.ev.id === 'dragonHunt') {
        const a = (e.idx * 2.4) % (Math.PI * 2);
        w.dragon = { id: 'dragon' + e.idx, x: Math.round(N / 2 + Math.cos(a) * 6), y: Math.round(N / 2 + Math.sin(a) * 6), lvl: 7, isDragon: true, dead: false, until: e.ends };
      }
      if (CH.Invasion.KINDS[e.ev.id] && e.active) CH.Invasion.start(s, T, e.ev.id, e.ends);
      ev.push({ kind: 'event', ev: e.ev });
    }
    CH.Invasion.update(s, T, ev);
    if (w.dragon && T > w.dragon.until) w.dragon = null;
  }

  function tick(s, now = Date.now()) {
    const w = W(s), ev = [];
    if (!w) return ev;
    let t = w.lastTick;
    if (now - t > C.OFFLINE_CAP_H * 3600e3) {
      // The world "rests" beyond the cap: shift timers so nothing explodes.
      const shift = now - t - C.OFFLINE_CAP_H * 3600e3;
      t += shift;
      for (const k of w.kingdoms) { k.last += shift; k.next += shift; k.nextAtk += shift; }
      for (const m of w.marches) { m.t0 += shift; m.t1 += shift; }
    }
    const gap = now - t;
    w.offline = gap > 5 * MIN ? 0 : -1;
    w.offlineAttacks = 0;
    const step = gap > 10 * MIN ? Math.max(60000, gap / 240) : gap;
    while (t < now) { const t2 = Math.min(now, t + Math.max(1, step)); processUntil(s, t2, ev); t = t2; }
    w.lastTick = now; w.offline = -1;
    return ev;
  }

  /* ---------------- Player actions ---------------- */
  function ensure(s, now = Date.now()) {
    if (!s.world) s.world = create(Math.floor(Math.random() * 1e9) + 1, now);
    if (CH.Throne) CH.Throne.ensure(s.world);
    if (CH.Meta) CH.Meta.ensure(s);
    return s.world;
  }
  function playerMarches(s) { return W(s).marches.filter(m => m.owner === 'player'); }
  function busyHeroes(s) { return new Set(playerMarches(s).map(m => m.hero).filter(Boolean)); }

  /** kind: 'attack' | 'scout' | 'gather'. target: {type, id}. */
  function sendMarch(s, kind, target, army, heroId, formation, now = Date.now(), opts = {}) {
    const w = W(s);
    if (target.type === 'throne') {
      const war = w.throne.war;
      if (kind === 'scout') { /* allowed any time */ }
      else if (!war || war.ended || now >= war.end) return { ok: false, reason: 'The Citadel can only be attacked during the Throne War (' + CH.Throne.warLabel() + ')' };
    }
    if (opts.rally && s.faction == null) return { ok: false, reason: 'Join a faction to start a rally' };
    if (target.type === 'ship' && !CH.Invasion.active(w, now)) return { ok: false, reason: 'The invaders are gone' };
    if (kind !== 'scout' && playerMarches(s).filter(m => m.kind !== 'return' && m.kind !== 'scout').length >= CH.State.marchSlots(s)) return { ok: false, reason: 'All march slots are in use (' + CH.State.marchSlots(s) + ')' };
    const obj = target.type === 'kingdom' ? w.kingdoms.find(k => k.id === target.id) : findAny(w, target.id);
    if (!obj) return { ok: false, reason: 'Target not found' };
    if (target.type === 'kingdom') {
      if (s.faction != null && obj.f === s.faction) return { ok: false, reason: 'You can\'t attack a member of your own faction' };
      if (obj.sh > now) return { ok: false, reason: obj.name + ' is protected by a shield' };
      if (obj.truceUntil > now) return { ok: false, reason: 'You have a truce with ' + obj.name + '. Break it from their panel first.' };
    }
    if ((target.type === 'camp' || target.type === 'ruin') && obj.dead) return { ok: false, reason: 'Nothing left here. It returns in ' + U.time((obj.respawnAt - now) / 1000) };
    if (target.type === 'tile' && obj.by) return { ok: false, reason: 'Someone is already gathering here' };
    if (target.type === 'fort' && obj.owner === 'player') return { ok: false, reason: 'You already hold this fort' };
    if (kind === 'scout') army = {};
    else {
      let n = 0;
      for (const t in army) { army[t] = Math.floor(army[t] || 0); if (army[t] < 0 || army[t] > (s.army[t] || 0)) return { ok: false, reason: 'Not enough troops' }; n += army[t]; }
      if (n <= 0) return { ok: false, reason: 'Choose some troops' };
    }
    if (kind === 'scout' && s.res.gold < 100) return { ok: false, reason: 'Scouting costs 100 gold' };
    if (heroId && (busyHeroes(s).has(heroId) || !s.heroes[heroId] || !s.heroes[heroId].unlocked)) return { ok: false, reason: 'That hero is busy' };
    for (const t in army) { s.army[t] -= army[t]; if (!s.army[t]) delete s.army[t]; }
    if (kind === 'scout') s.res.gold -= 100;
    if (target.type === 'kingdom' && s.shieldUntil > now) s.shieldUntil = 0; // attacking or scouting a kingdom drops your shield
    const from = { x: w.px, y: w.py };
    const secs = marchSeconds(from, obj, army, marchSpeedMult(s, heroId), kind);
    const m = { id: 'm' + w.nextId++, owner: 'player', kind, fx: w.px, fy: w.py, tx: obj.x, ty: obj.y, t0: now, t1: now + secs * 1000, army: { ...army }, hero: kind === 'scout' ? null : heroId || null,
      heroLevel: heroId ? s.heroes[heroId].level : 0, formation: formation || 'surround', target: { type: target.type, id: target.id }, cargo: {} };
    if (opts.rally && kind === 'attack') {
      const al = CH.Throne.rallyAllies(s, obj);
      m.allies = al.map(x => { for (const t in x.army) x.k.tr[t] -= x.army[t]; x.k.out = true; return { id: x.k.id, name: x.k.name, army: x.army }; });
      m.rally = true; m.t1 += CH.THRONE.rallyMuster * 1000;
    }
    w.marches.push(m);
    return { ok: true, march: m };
  }
  function recall(s, id, now = Date.now()) {
    const w = W(s), m = w.marches.find(x => x.id === id && x.owner === 'player');
    if (!m || m.kind === 'return') return false;
    w.marches.splice(w.marches.indexOf(m), 1);
    if (m.kind === 'gathering') {
      const tile = w.tiles.find(t => t.id === m.target.id);
      const frac = U.clamp((now - m.t0) / (m.t1 - m.t0), 0, 1), got = Math.floor(m.gatherAmt * frac);
      if (tile) { tile.amt -= got; tile.by = null; }
      w.marches.push({ ...m, id: 'm' + w.nextId++, kind: 'return', fx: m.tx, fy: m.ty, tx: w.px, ty: w.py, t0: now, t1: now + (m.travel || 30000), cargo: tile ? { [tile.type]: got } : {}, target: { type: 'home' } });
      return true;
    }
    for (const x of m.allies || []) { const k = w.kingdoms.find(o => o.id === x.id); if (k) { for (const t in x.army) k.tr[t] = (k.tr[t] || 0) + x.army[t]; k.out = false; } }
    const f = U.clamp((now - m.t0) / (m.t1 - m.t0), 0, 1);
    const cx = m.fx + (m.tx - m.fx) * f, cy = m.fy + (m.ty - m.fy) * f;
    w.marches.push({ ...m, id: 'm' + w.nextId++, kind: 'return', fx: cx, fy: cy, tx: m.fx, ty: m.fy, t0: now, t1: now + Math.max(5000, now - m.t0), cargo: {}, target: { type: 'home' } });
    return true;
  }
  function occupiedNear(w, x, y, r = 2) {
    if (w.throne && Math.hypot(w.throne.x - x, w.throne.y - y) < 6) return true;
    if (Math.abs(w.px - x) <= r && Math.abs(w.py - y) <= r) return true;
    for (const L of [w.kingdoms, w.tiles, w.camps, w.ruins, w.forts]) for (const o of L) if (Math.abs(o.x - x) <= r && Math.abs(o.y - y) <= r) return true;
    return false;
  }
  function canTeleport(s, x, y) {
    const w = W(s);
    if (x < 2 || y < 2 || x > N - 3 || y > N - 3) return 'Out of bounds';
    if (biomeAt(x, y, w.seed) === 'lava' && CH.State.castleLevel(s) < 6) return 'Dragon Territory needs castle level 6';
    if (occupiedNear(w, x, y, 1)) return 'Too close to something else';
    if (playerMarches(s).some(m => m.kind !== 'return')) return 'Recall your marches first';
    return null;
  }
  /** Moves the castle. Pays with an item or gems. Incoming attacks lose track of you. */
  function teleport(s, x, y, now = Date.now()) {
    const w = W(s);
    const random = x == null;
    if (playerMarches(s).some(m => m.kind !== 'return')) return { ok: false, reason: 'Recall your marches first' };
    if (random) {
      const rnd = U.rng(now % 1e9);
      for (let i = 0; i < 500; i++) { const a = rnd() * 6.283, d = (0.6 + rnd() * 0.35) * N / 2; const xx = Math.round(N / 2 + Math.cos(a) * d), yy = Math.round(N / 2 + Math.sin(a) * d); if (!canTeleport(s, xx, yy)) { x = xx; y = yy; break; } }
      if (x == null) return { ok: false, reason: 'No free spot found' };
    }
    const why = canTeleport(s, x, y); if (why) return { ok: false, reason: why };
    const item = random ? 'teleRandom' : 'teleAdvanced', gemCost = random ? 100 : 300;
    if (s.items[item] > 0) s.items[item]--;
    else if (s.res.gems >= gemCost) s.res.gems -= gemCost;
    else return { ok: false, reason: 'You need a ' + CH.ITEMS[item].name + ' or ' + gemCost + ' gems' };
    w.px = x; w.py = y;
    for (const m of w.marches) if (m.target && m.target.type === 'player' && m.kind === 'attack') { m.bounce = true; m.tx = x; m.ty = y; }
    for (const m of w.marches) if (m.owner === 'player' && m.kind === 'return') { m.tx = x; m.ty = y; }
    news(w, now, s.player.name + '\'s castle vanished in a flash of light and reappeared at (' + x + ',' + y + ').', 'world');
    return { ok: true, x, y };
  }
  function onShield(s, now) { /* hostile marches already on the way will turn back on arrival */ }
  function requestHelp(s, now = Date.now()) {
    if (s.faction == null) return { ok: false, reason: 'Join a faction first' };
    if (!CH.State.highestLevel(s, 'embassy')) return { ok: false, reason: 'Build an Embassy first' };
    if (now - (s.helpUsedAt || 0) < 60 * MIN) return { ok: false, reason: 'Allies can help again in ' + U.time((60 * MIN - (now - s.helpUsedAt)) / 1000) };
    s.helpUsedAt = now; s.helpUntil = now + 30 * MIN;
    return { ok: true, troops: CH.BUILDINGS.embassy.reinforce(CH.State.highestLevel(s, 'embassy')) };
  }
  function joinFaction(s, f, now = Date.now()) {
    if (!CH.State.highestLevel(s, 'embassy')) return { ok: false, reason: 'Build an Embassy first' };
    if (s.faction === f) return { ok: false, reason: 'Already a member' };
    if (s.factionChangedAt && now - s.factionChangedAt < 60 * MIN) return { ok: false, reason: 'You can join a faction again in ' + U.time((60 * MIN - (now - s.factionChangedAt)) / 1000) };
    s.faction = f; s.factionChangedAt = now;
    return { ok: true };
  }
  function leaveFaction(s, now = Date.now()) {
    if (s.faction == null) return { ok: false, reason: 'You are not in a faction' };
    const old = CH.FACTIONS[s.faction].name;
    s.faction = null; s.factionChangedAt = now; s.helpUntil = 0;
    news(W(s), now, s.player.name + ' left the ' + old + '.', 'world');
    return { ok: true, old };
  }
  function incoming(s) { return W(s) ? W(s).marches.filter(m => m.kind === 'attack' && m.target.type === 'player') : []; }
  function power(k) { return Math.round(aiDefPower(k)); }

  function validate(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1 || !Array.isArray(raw.kingdoms) || !Array.isArray(raw.marches)) return null;
    const now = Date.now();
    if (typeof raw.lastTick !== 'number' || raw.lastTick > now + 60000) raw.lastTick = now;
    raw.marches = raw.marches.filter(m => m && typeof m.t1 === 'number' && m.army && typeof m.army === 'object');
    for (const m of raw.marches) for (const t in m.army) if (!CH.TROOPS[t] || !(m.army[t] >= 0)) delete m.army[t];
    for (const k of raw.kingdoms) { for (const r of ['gold', 'wood', 'stone', 'food']) k.res[r] = Math.max(0, +k.res[r] || 0); for (const t in k.tr) if (!CH.TROOPS[t] || !(k.tr[t] >= 0)) delete k.tr[t]; if (k.last > now) k.last = now; }
    for (const L of ['tiles', 'camps', 'ruins', 'forts', 'news']) if (!Array.isArray(raw[L])) raw[L] = [];
    if (!Array.isArray(raw.fpts)) raw.fpts = [0, 0, 0, 0];
    if (CH.Throne) CH.Throne.ensure(raw);
    return raw;
  }

  CH.World = {
    create, ensure, tick, validate, biomeAt, eventAt, evOn, accrue, aiDefPower, playerDefPower, armyPower, armyCount, byClass, loadOf, lootable,
    sendMarch, recall, teleport, canTeleport, requestHelp, joinFaction, leaveFaction, incoming, power, playerMarches, busyHeroes, marchSeconds, marchSpeedMult,
    territoryBonus, onShield, findAny, campMonsters, clash, addReport, campRewards, dist, N, heroXp, PKEYS,
  };
})();
