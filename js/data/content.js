/* =====================================================================
 * Crownhold — data/content.js
 *  - CH.REGIONS / CH.Campaign : 6 regions × 6 stages with objectives
 *  - CH.Raid                  : seeded AI enemy-kingdom generator (no real multiplayer)
 *  - CH.Defense               : endless defense wave generator and rewards
 *  - CH.START_LAYOUT          : the kingdom a new player starts with
 * ===================================================================== */
(function () {
  const C = CH.CONFIG, U = CH.util;

  CH.REGIONS = [
    { id: 'greenwood', name: 'Greenwood Kingdom', sub: 'Goblin raiders in the emerald woods', castle: 1,
      pal: { g1: '#4f8a3c', g2: '#5f9a47', g3: '#3d7230', path: '#c2a46e', edge: '#7a5d39', accent: '#7fd36a' }, decor: 'forest',
      pool: [{ t: 'goblin', from: 0, w: 6 }, { t: 'wolf', from: 1, w: 5 }, { t: 'bat', from: 2, w: 3 }, { t: 'orc', from: 3, w: 3 }], boss: 'trollChief' },
    { id: 'orcmount', name: 'Orc Mountains', sub: 'Iron clans and their war beasts', castle: 2,
      pal: { g1: '#7d7060', g2: '#8c7f6c', g3: '#685d50', path: '#b3a184', edge: '#4f4538', accent: '#e0a868' }, decor: 'rocks',
      pool: [{ t: 'orc', from: 0, w: 6 }, { t: 'goblin', from: 0, w: 4 }, { t: 'wolf', from: 0, w: 4 }, { t: 'sapper', from: 1, w: 3 }, { t: 'troll', from: 3, w: 1 }], boss: 'orcWarlord' },
    { id: 'swamp', name: 'Cursed Swamp', sub: 'Where the drowned dead still walk', castle: 3,
      pal: { g1: '#36503f', g2: '#41604a', g3: '#2a4033', path: '#6e5d47', edge: '#2f271d', accent: '#9be38e' }, decor: 'swamp',
      pool: [{ t: 'skeleton', from: 0, w: 6 }, { t: 'spider', from: 0, w: 5 }, { t: 'skeletonMage', from: 1, w: 3 }, { t: 'bat', from: 1, w: 3 }, { t: 'troll', from: 3, w: 1 }], boss: 'broodmother' },
    { id: 'frozen', name: 'Frozen Empire', sub: 'Ice-locked halls of a fallen order', castle: 4,
      pal: { g1: '#cfdcea', g2: '#e1ebf4', g3: '#b5c7d9', path: '#8498ae', edge: '#4d5f74', accent: '#a8dcff' }, decor: 'snow',
      pool: [{ t: 'wolf', from: 0, w: 5 }, { t: 'skeleton', from: 0, w: 5 }, { t: 'darkKnight', from: 1, w: 3 }, { t: 'skeletonMage', from: 1, w: 3 }, { t: 'ogre', from: 3, w: 1 }], boss: 'frostGiant' },
    { id: 'dark', name: 'Dark Kingdom', sub: 'The usurper\'s black citadel', castle: 5,
      pal: { g1: '#3b3346', g2: '#463c54', g3: '#2e2838', path: '#655a6e', edge: '#211b29', accent: '#c79bff' }, decor: 'dark',
      pool: [{ t: 'darkKnight', from: 0, w: 5 }, { t: 'imp', from: 0, w: 5 }, { t: 'skeletonMage', from: 0, w: 3 }, { t: 'spider', from: 1, w: 3 }, { t: 'ogre', from: 2, w: 1 }], boss: 'demonLord' },
    { id: 'dragon', name: 'Dragon\'s Territory', sub: 'Ash, obsidian and the last great wyrm', castle: 6,
      pal: { g1: '#4a2e26', g2: '#58372c', g3: '#38221c', path: '#6a4a3e', edge: '#1e1210', accent: '#ff9a5a' }, decor: 'lava',
      pool: [{ t: 'imp', from: 0, w: 5 }, { t: 'whelp', from: 0, w: 3 }, { t: 'darkKnight', from: 0, w: 4 }, { t: 'troll', from: 1, w: 1 }, { t: 'ogre', from: 2, w: 1 }], boss: 'dragon' },
  ];

  /* Campaign map templates. Path end tiles touch the building they attack. */
  const TEMPLATES = {
    A: { paths: [{ pts: [[-1, 4], [7, 4], [7, 17], [15, 17], [15, 5], [22, 5], [22, 10]], to: 'core' }], objs: [] },
    B: { paths: [{ pts: [[-1, 3], [11, 3], [11, 10], [22, 10]], to: 'core' }, { pts: [[-1, 18], [11, 18], [11, 10], [22, 10]], to: 'core' }], objs: [] },
    C: { paths: [{ pts: [[-1, 10], [6, 10], [6, 4], [22, 4], [22, 9]], to: 'core' }, { pts: [[-1, 13], [3, 13], [3, 20], [11, 20], [11, 17], [14, 17]], to: 'objA' }], objs: [{ key: 'objA', type: 'goldMine', tx: 15, ty: 16 }] },
    D: { paths: [{ pts: [[-1, 10], [6, 10], [6, 4], [22, 4], [22, 9]], to: 'core' }, { pts: [[-1, 13], [3, 13], [3, 20], [11, 20], [11, 17], [14, 17]], to: 'objA' }, { pts: [[30, 15], [27, 15], [27, 20], [22, 20], [22, 15]], to: 'objB' }],
      objs: [{ key: 'objA', type: 'outpost', tx: 15, ty: 16 }, { key: 'objB', type: 'outpost', tx: 21, ty: 13 }] },
  };
  const CORE = { tx: 23, ty: 9 };

  function mirror(t) {
    const mx = x => 29 - x;
    return {
      core: { tx: 30 - CORE.tx - 3, ty: CORE.ty },
      paths: t.paths.map(p => ({ to: p.to, pts: p.pts.map(([x, y]) => [mx(x), y]) })),
      objs: t.objs.map(o => ({ ...o, tx: 30 - o.tx - 2 })),
    };
  }

  const STAGE_PLAN = [
    { obj: 'survive', tpl: 'A', title: 'Hold the line' },
    { obj: 'protect', tpl: 'C', title: 'Guard the mine' },
    { obj: 'timed', tpl: 'B', title: 'Swift justice' },
    { obj: 'survive', tpl: 'B', title: 'Pincer attack' },
    { obj: 'multi', tpl: 'D', title: 'Three fronts' },
    { obj: 'boss', tpl: 'A', title: 'Boss battle' },
  ];
  CH.OBJECTIVES = {
    survive: 'Survive every wave.',
    protect: 'Keep the castle standing and protect the gold mine. Losing the mine costs stars.',
    timed: 'Defeat every enemy before time runs out.',
    multi: 'Defend the castle and both outposts. Losing any of them means defeat.',
    boss: 'Defeat the boss that leads the final wave.',
  };

  const cache = {};
  function stage(r, s) {
    const key = r + '-' + s;
    if (cache[key]) return cache[key];
    const reg = CH.REGIONS[r], plan = STAGE_PLAN[s];
    const gi = r * 6 + s;
    const rnd = U.rng(5003 + gi * 977);
    const base = TEMPLATES[plan.tpl];
    const tpl = (r + s) % 2 ? mirror(base) : { core: CORE, paths: base.paths, objs: base.objs };
    const nWaves = 5 + Math.floor(s / 2) + Math.floor(r / 2);
    const pool = reg.pool.filter(p => p.from <= s);
    const waves = [];
    for (let w = 0; w < nWaves; w++) {
      const budget = (4 + 3.2 * w + 0.45 * w * w) * (1 + 0.1 * r) * (s >= 4 ? 1.1 : 1);
      const groups = [];
      const nG = 1 + (w >= 2 ? 1 : 0) + (w >= 5 ? 1 : 0);
      let delay = 0;
      for (let k = 0; k < nG; k++) {
        const share = budget / nG;
        const opts = pool.filter(p => (CH.ENEMIES[p.t].threat || 1) <= Math.max(4, share / 2));
        const tot = opts.reduce((a, p) => a + p.w, 0);
        let pick = rnd() * tot, choice = opts[0];
        for (const p of opts) { pick -= p.w; if (pick <= 0) { choice = p; break; } }
        const def = CH.ENEMIES[choice.t];
        const count = U.clamp(Math.round(share / (def.threat || 1)), 1, 30);
        groups.push({ type: choice.t, count, interval: U.clamp(1.1 / def.speed, 0.35, 1.2), delay, path: (w + k) % tpl.paths.length });
        delay += count * 0.4 + 2;
      }
      if (plan.obj === 'boss' && w === nWaves - 1) groups.push({ type: reg.boss, count: 1, interval: 1, delay: delay + 2, path: 0, boss: true });
      waves.push({ groups });
    }
    const baseR = 220 + 160 * gi;
    const st = {
      id: key, r, s, gi, name: plan.title, obj: plan.obj, region: reg, tpl, waves,
      hpMult: 1 + 0.055 * gi + 0.0012 * gi * gi,
      startGold: 400 + 80 * r + 25 * s,
      timeLimit: plan.obj === 'timed' ? 34 * nWaves + 45 : 0,
      reward: { gold: baseR, wood: baseR, stone: Math.round(baseR * 0.6), xp: 30 + 12 * gi, gems: s === 5 ? 6 + r : 0, runes: s === 5 ? 1 + Math.floor(r / 2) : (s === 4 ? 1 : 0) },
    };
    cache[key] = st;
    return st;
  }

  CH.Campaign = {
    STAGES: 6,
    stage,
    regionUnlocked(save, r) {
      if (r === 0) return true;
      return CH.State.castleLevel(save) >= CH.REGIONS[r].castle && !!save.campaign[(r - 1) + '-5'];
    },
    stageUnlocked(save, r, s) {
      if (!this.regionUnlocked(save, r)) return false;
      return s === 0 || !!save.campaign[r + '-' + (s - 1)];
    },
  };

  /* ------------------------------------------------------------------
   * ENDLESS RAID — AI kingdoms generated from a seed.
   * Every opponent can be attacked once, then it leaves the list.
   * ---------------------------------------------------------------- */
  const ARCH = {
    beginner: { name: 'Beginner village', defMult: 0.5, lvl: -1, rings: 0, loot: 0.8, res: 1, desc: 'Barely defended. Easy pickings.' },
    resource: { name: 'Resource hoard', defMult: 0.6, lvl: 0, rings: 1, loot: 1.7, res: 1.6, desc: 'Overflowing storehouses guarded lightly.' },
    balanced: { name: 'Balanced kingdom', defMult: 0.85, lvl: 0, rings: 1, loot: 1.1, res: 1, desc: 'A well-rounded base.' },
    heavy: { name: 'Heavy defenses', defMult: 1.0, lvl: 0, rings: 2, loot: 0.95, res: 0.8, desc: 'Defenses packed behind two wall rings.' },
    fortress: { name: 'High fortress', defMult: 1.0, lvl: 1, rings: 2, loot: 1.6, res: 1.2, gems: true, desc: 'Strong and rich. Holds rare gems.' },
  };
  const SYL1 = ['Ash', 'Iron', 'Raven', 'Thorn', 'Storm', 'Gold', 'Black', 'Frost', 'Wolf', 'Ember', 'Stone', 'Silver', 'Bram', 'Oak', 'Grim'];
  const SYL2 = ['hold', 'vale', 'mere', 'keep', 'ford', 'watch', 'gate', 'crest', 'reach', 'fall', 'helm', 'moor', 'spire'];
  const LORDS = ['Baron', 'Countess', 'Warlord', 'Duke', 'Lady', 'Jarl', 'Chieftain', 'Margrave'];
  const NAMES = ['Ulric', 'Morgana', 'Hask', 'Edda', 'Torvin', 'Seren', 'Bregor', 'Ilsa', 'Corvin', 'Wren'];

  function generateOpponent(seed, playerCL, trophies) {
    const rnd = U.rng(seed);
    const tier = Math.floor(trophies / 200);
    const weights = { beginner: Math.max(0, 5 - tier * 2), resource: 3, balanced: 4, heavy: 2 + tier, fortress: Math.max(0, tier - 1) + (playerCL >= 3 ? 1 : 0) };
    let tot = 0; for (const k in weights) tot += weights[k];
    let pk = rnd() * tot, archKey = 'balanced';
    for (const k in weights) { pk -= weights[k]; if (pk <= 0) { archKey = k; break; } }
    const arch = ARCH[archKey];
    const cl = U.clamp(playerCL - 1 + Math.floor(rnd() * 2) + arch.lvl + Math.min(2, Math.floor(tier / 2)), 1, 8);
    const layout = layoutFor(rnd, cl, arch);
    // Loot available is scaled to the PLAYER's level so raids stay useful but can't snowball.
    const pool = (260 + 360 * Math.pow(playerCL, 1.6)) * arch.loot;
    const loot = { gold: Math.round(pool), wood: Math.round(pool), stone: Math.round(pool * 0.65), gems: arch.gems ? 2 + Math.floor(rnd() * 4) : 0 };
    const diff = Math.round((layout.filter(b => CH.BUILDINGS[b.type].cat === 'defense').reduce((a, b) => a + b.level, 0)) / Math.max(1, playerCL));
    return {
      id: 'op' + seed, seed, archetype: archKey, archName: arch.name, archDesc: arch.desc, cl,
      name: U.pick(SYL1, rnd) + U.pick(SYL2, rnd), lord: U.pick(LORDS, rnd) + ' ' + U.pick(NAMES, rnd),
      layout, loot, trophyWin: 14 + Math.floor(rnd() * 8) + (cl - playerCL) * 4, trophyLoss: 10 + Math.floor(rnd() * 5), threat: diff,
    };
  }

  function layoutFor(rnd, cl, arch) {
    const [aw, ah] = C.AREA[cl - 1];
    const x0 = Math.floor((C.COLS - aw) / 2), y0 = Math.floor((C.ROWS - ah) / 2);
    const occ = new Uint8Array(C.COLS * C.ROWS);
    const out = [];
    const maxL = (type) => Math.min(CH.BUILDINGS[type].maxLevel, cl + 1);
    const lvlFor = type => U.clamp(cl + arch.lvl - (rnd() < 0.5 ? 1 : 0), 1, maxL(type));
    const free = (tx, ty, s) => {
      if (tx < x0 || ty < y0 || tx + s > x0 + aw || ty + s > y0 + ah) return false;
      for (let y = ty; y < ty + s; y++) for (let x = tx; x < tx + s; x++) if (occ[y * C.COLS + x]) return false;
      return true;
    };
    const put = (type, tx, ty, level) => {
      const s = CH.BUILDINGS[type].size;
      for (let y = ty; y < ty + s; y++) for (let x = tx; x < tx + s; x++) occ[y * C.COLS + x] = 1;
      out.push({ type, level, tx, ty });
    };
    const placeIn = (type, rect, level) => {
      const s = CH.BUILDINGS[type].size;
      for (let i = 0; i < 300; i++) {
        const tx = rect.x + Math.floor(rnd() * Math.max(1, rect.w - s + 1)), ty = rect.y + Math.floor(rnd() * Math.max(1, rect.h - s + 1));
        if (free(tx, ty, s)) { put(type, tx, ty, level); return true; }
      }
      return false;
    };
    const cx = Math.floor(C.COLS / 2) - 1, cy = Math.floor(C.ROWS / 2) - 1;
    put('castle', cx, cy, cl);
    const r = 2 + Math.floor(cl / 2);
    const inner = { x: cx - r, y: cy - r, w: 3 + 2 * r, h: 3 + 2 * r };
    const whole = { x: x0, y: y0, w: aw, h: ah };
    // Reserve the wall rings so buildings don't sit on them.
    const ringRects = [];
    if (arch.rings >= 1) ringRects.push({ x: inner.x - 1, y: inner.y - 1, w: inner.w + 2, h: inner.h + 2 });
    if (arch.rings >= 2) ringRects.push({ x: inner.x - 4, y: inner.y - 4, w: inner.w + 8, h: inner.h + 8 });
    const ringTiles = [];
    for (const R of ringRects) {
      for (let x = R.x; x < R.x + R.w; x++) for (const y of [R.y, R.y + R.h - 1]) ringTiles.push([x, y]);
      for (let y = R.y + 1; y < R.y + R.h - 1; y++) for (const x of [R.x, R.x + R.w - 1]) ringTiles.push([x, y]);
    }
    const inArea = (x, y) => x >= x0 && y >= y0 && x < x0 + aw && y < y0 + ah;
    for (const [x, y] of ringTiles) if (inArea(x, y)) occ[y * C.COLS + x] = 2;
    const innerFree = { x: inner.x, y: inner.y, w: inner.w, h: inner.h };

    // Defenses
    for (const t of CH.BUILD_MENU[2].types) {
      const d = CH.BUILDINGS[t];
      if (d.unlock > cl) continue;
      const n = Math.max(t === 'archerTower' ? 1 : 0, Math.round(d.counts[cl - 1] * arch.defMult));
      for (let i = 0; i < n; i++) {
        const zone = arch.rings && (i % 3 !== 2 || archKeyHeavy(arch)) ? innerFree : whole;
        if (!placeIn(t, zone, lvlFor(t))) placeIn(t, whole, lvlFor(t));
      }
    }
    // Storages: inside the walls for defensive bases, outside for resource hoards.
    for (const t of ['goldStorage', 'woodStorage', 'stoneStorage']) {
      const n = Math.max(1, Math.round(CH.BUILDINGS[t].counts[cl - 1] * Math.min(1.5, arch.res)));
      for (let i = 0; i < n; i++) placeIn(t, arch.res > 1.2 ? whole : innerFree, lvlFor(t)) || placeIn(t, whole, lvlFor(t));
    }
    for (const t of ['goldMine', 'lumberMill', 'stoneQuarry']) {
      const n = Math.max(1, Math.round(CH.BUILDINGS[t].counts[cl - 1] * arch.res));
      for (let i = 0; i < n; i++) placeIn(t, whole, lvlFor(t));
    }
    placeIn('barracks', whole, lvlFor('barracks'));
    placeIn('builderHut', whole, 1); placeIn('builderHut', whole, 1);
    if (cl >= 2) placeIn('heroHall', whole, Math.min(5, lvlFor('heroHall')));
    if (cl >= 3) placeIn('lab', whole, Math.min(5, lvlFor('lab')));
    // Walls
    let walls = CH.BUILDINGS.wall.counts[cl - 1];
    const wl = U.clamp(cl + arch.lvl, 1, 8);
    for (const [x, y] of ringTiles) {
      if (walls <= 0) break;
      if (!inArea(x, y) || occ[y * C.COLS + x] === 1) continue;
      occ[y * C.COLS + x] = 1;
      out.push({ type: 'wall', level: wl, tx: x, ty: y });
      walls--;
    }
    // Traps near the middle
    for (const t of ['spikeTrap', 'bombTrap', 'fireTrap']) {
      const d = CH.BUILDINGS[t];
      if (d.unlock > cl) continue;
      const n = Math.round(d.counts[cl - 1] * arch.defMult);
      for (let i = 0; i < n; i++) placeIn(t, { x: inner.x - 3, y: inner.y - 3, w: inner.w + 6, h: inner.h + 6 }, Math.min(5, cl));
    }
    for (let y = 0; y < C.ROWS; y++) for (let x = 0; x < C.COLS; x++) if (occ[y * C.COLS + x] === 2) occ[y * C.COLS + x] = 0;
    return out;
  }
  const archKeyHeavy = arch => arch.rings >= 2;

  CH.Raid = {
    ARCH,
    /** Base layout for a world kingdom (deterministic from seed). */
    layout: (seed, cl, archKey) => layoutFor(U.rng(seed), cl, ARCH[archKey] || ARCH.balanced),
    generate: generateOpponent,
    searchCost: cl => 30 * cl,
    /** Builds a fresh list of opponents; seeds advance so the same base never comes back. */
    refresh(save) {
      const cl = CH.State.castleLevel(save);
      save.raid.opponents = [];
      for (let i = 0; i < 4; i++) save.raid.opponents.push(generateOpponent(save.raid.seed++, cl, save.raid.trophies));
    },
    league: t => (t < 100 ? 'Bronze' : t < 300 ? 'Silver' : t < 600 ? 'Gold' : t < 1000 ? 'Crystal' : 'Champion'),
  };

  /* ------------------------------------------------------------------
   * ENDLESS DEFENSE — AI waves attack the player's real base layout.
   * ---------------------------------------------------------------- */
  const D_POOL = [
    { t: 'goblin', from: 1, w: 6 }, { t: 'wolf', from: 2, w: 5 }, { t: 'orc', from: 3, w: 4 }, { t: 'bat', from: 4, w: 3 },
    { t: 'sapper', from: 5, w: 3 }, { t: 'skeleton', from: 6, w: 4 }, { t: 'spider', from: 8, w: 3 }, { t: 'skeletonMage', from: 9, w: 3 },
    { t: 'darkKnight', from: 12, w: 3 }, { t: 'imp', from: 14, w: 3 }, { t: 'whelp', from: 16, w: 2 }, { t: 'troll', from: 18, w: 1 },
  ];
  const BOSSES = ['trollChief', 'orcWarlord', 'broodmother', 'frostGiant', 'demonLord', 'dragon'];
  const MODS = [
    { id: 'swift', name: 'Swift', desc: 'Enemies move 25% faster.' },
    { id: 'ironclad', name: 'Ironclad', desc: 'Enemies have 30% more health.' },
    { id: 'frenzy', name: 'Frenzy', desc: 'Enemies deal 30% more damage.' },
    { id: 'swarm', name: 'Swarm', desc: '50% more enemies.' },
  ];

  CH.Defense = {
    MODS,
    wave(n) {
      const rnd = U.rng(777 + n * 131);
      const isBoss = n % 10 === 0 && n >= 20;
      const isMini = n % 5 === 0 && !isBoss && n >= 10;
      const mod = n > 20 ? MODS[Math.floor(rnd() * MODS.length)] : null;
      let budget = 4 + 2.6 * n + 0.17 * n * n;
      if (mod && mod.id === 'swarm') budget *= 1.5;
      const pool = D_POOL.filter(p => p.from <= n);
      const nG = Math.min(4, 1 + Math.floor(n / 6));
      const edges = ['N', 'S', 'E', 'W'];
      const groups = [];
      for (let k = 0; k < nG; k++) {
        const tot = pool.reduce((a, p) => a + p.w, 0);
        let pk = rnd() * tot, ch = pool[0];
        for (const p of pool) { pk -= p.w; if (pk <= 0) { ch = p; break; } }
        const def = CH.ENEMIES[ch.t];
        groups.push({ type: ch.t, count: U.clamp(Math.round(budget / nG / def.threat), 1, 28), edge: U.pick(edges, rnd), delay: k * 3, interval: 0.4 });
      }
      if (isMini) groups.push({ type: n % 10 === 0 ? 'ogre' : 'troll', count: 1 + Math.floor(n / 25), edge: U.pick(edges, rnd), delay: 4, interval: 1.5, elite: true });
      if (isBoss) groups.push({ type: BOSSES[(n / 10 - 2) % BOSSES.length], count: 1, edge: U.pick(edges, rnd), delay: 5, interval: 1, boss: true });
      if (n >= 7 && n % 3 === 1) groups.push({ type: pool[pool.length - 1].t, count: 1 + Math.floor(n / 12), edge: U.pick(edges, rnd), delay: 6, interval: 1, elite: true });
      const mult = 1 + 0.06 * (n - 1) + 0.0018 * (n - 1) * (n - 1);
      return { n, groups, mult, mod, isBoss, isMini };
    },
    rewards(n) {
      return {
        gold: 45 + 18 * n, wood: 45 + 18 * n, stone: 28 + 11 * n, xp: 6 + 2 * n,
        runes: n % 5 === 0 ? 1 + Math.floor(n / 15) : 0, gems: n % 10 === 0 && n >= 20 ? 3 : 0,
      };
    },
    MILESTONES: [{ wave: 5, gems: 5, runes: 1 }, { wave: 10, gems: 10, runes: 2 }, { wave: 20, gems: 20, runes: 4 }, { wave: 30, gems: 30, runes: 6 }, { wave: 50, gems: 50, runes: 10 }],
    BOONS: [
      { id: 'repair', name: 'Master Masons', desc: 'Rebuild destroyed buildings and restore 50% health to all.' },
      { id: 'fortify', name: 'Fortify', desc: 'All defenses deal 20% more damage for the rest of the run.' },
      { id: 'rally', name: 'Rally the Heroes', desc: 'Fully heal and revive your heroes, and refill spell charges.' },
      { id: 'tribute', name: 'Royal Tribute', desc: 'Bank a big resource bonus right now.' },
      { id: 'quickdraw', name: 'Quick Draw', desc: 'All defenses attack 15% faster for the rest of the run.' },
    ],
  };

  /* ------------------------------------------------------------------ */
  CH.START_LAYOUT = [
    { type: 'castle', level: 1, tx: 13, ty: 9 },
    { type: 'builderHut', level: 1, tx: 9, ty: 6 },
    { type: 'goldMine', level: 1, tx: 17, ty: 6 },
    { type: 'lumberMill', level: 1, tx: 9, ty: 13 },
    { type: 'farm', level: 1, tx: 11, ty: 6 },
    { type: 'barracks', level: 1, tx: 18, ty: 10 },
    { type: 'archeryRange', level: 1, tx: 10, ty: 10 },
    { type: 'heroHall', level: 1, tx: 15, ty: 13 },
    { type: 'infirmary', level: 1, tx: 12, ty: 13 },
    { type: 'archerTower', level: 1, tx: 17, ty: 13 },
    { type: 'tree', level: 1, tx: 19, ty: 15 },
    { type: 'rock', level: 1, tx: 20, ty: 6 },
    { type: 'rock', level: 1, tx: 14, ty: 6 },
  ];
})();
