/* =====================================================================
 * Eldoria — core/meta.js
 * Long-term progression around the core loop:
 *   daily quests + 7-day login streak, achievements + titles,
 *   season pass, hero equipment (forge, materials) + talents,
 *   nemesis kingdoms, diplomacy (tribute, truce, mercenaries), arena.
 * Every system is fed by CH.Meta.track(save, kind, amount).
 * ===================================================================== */
CH.Meta = (function () {
  const U = CH.util, DAY = 864e5, MIN = 60000;
  const dayKey = T => { const d = new Date(T); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const cl = s => CH.State.castleLevel(s);

  /* ---------------- Data ---------------- */
  const QUESTS = [
    { id: 'train', kind: 'train', text: 'Train {n} troops', n: c => 150 * c },
    { id: 'raid', kind: 'raidWin', text: 'Win {n} raids against kingdoms', n: () => 2 },
    { id: 'camp', kind: 'campWin', text: 'Clear {n} monster camps', n: () => 2 },
    { id: 'gather', kind: 'gather', text: 'Gather {n} resources from the map', n: c => 4000 * c },
    { id: 'collect', kind: 'collect', text: 'Collect {n} resources from your buildings', n: c => 3000 * c },
    { id: 'scout', kind: 'scout', text: 'Scout {n} times', n: () => 3 },
    { id: 'build', kind: 'build', text: 'Finish {n} constructions or upgrades', n: () => 2 },
    { id: 'kills', kind: 'kills', text: 'Defeat {n} enemy troops', n: c => 250 * c },
    { id: 'heal', kind: 'heal', text: 'Heal {n} wounded troops', n: c => 40 * c },
    { id: 'arena', kind: 'arenaWin', text: 'Win {n} arena fights', n: () => 1 },
  ];
  const QUEST_REWARD = c => ({ gems: 15, gold: 1500 * c, food: 1500 * c });
  const ALL_DONE = { gems: 60, items: { speed1h: 1 }, mats: { iron: 10, leather: 10, crystal: 2 } };
  const LOGIN = [
    { gold: 5000, food: 5000 }, { gems: 30, items: { speed5m: 3 } }, { wood: 10000, stone: 8000, mats: { iron: 10, leather: 10 } },
    { gems: 60, items: { shield2h: 1 } }, { gold: 20000, food: 20000, mats: { crystal: 5 } }, { gems: 100, items: { speed1h: 2 } },
    { gems: 250, items: { teleRandom: 1, shield8h: 1 }, mats: { crystal: 10, dragonscale: 2 } },
  ];
  const MATS = { iron: 'Iron Ore', leather: 'Thick Leather', crystal: 'Arcane Crystal', dragonscale: 'Dragon Scale' };
  const TIERS = [
    { name: 'Common', color: '#c4c4c4', might: 2, hall: 1, cost: { iron: 5, leather: 5, gold: 2000 } },
    { name: 'Uncommon', color: '#5fd17a', might: 4, hall: 2, cost: { iron: 15, leather: 10, crystal: 1, gold: 6000 } },
    { name: 'Rare', color: '#5fb0ff', might: 7, hall: 3, cost: { iron: 30, leather: 25, crystal: 5, gold: 15000 } },
    { name: 'Epic', color: '#b57bff', might: 11, hall: 4, cost: { iron: 60, leather: 40, crystal: 15, dragonscale: 2, gold: 40000 } },
    { name: 'Legendary', color: '#ffc94a', might: 16, hall: 5, cost: { iron: 120, leather: 80, crystal: 40, dragonscale: 10, gold: 100000 } },
  ];
  const SLOTS = { weapon: ['Sword', 'Blade', 'Warblade', 'Runeblade', 'Kingsbane'], armor: ['Jerkin', 'Mail', 'Plate', 'Aegis', 'Celestial Plate'], trinket: ['Charm', 'Amulet', 'Seal', 'Relic', 'Crown Jewel'] };
  const TALENTS = { off: { name: 'Offense', desc: '+3% attack and health for the hero\'s army', per: 3 }, def: { name: 'Defense', desc: '+3% attack and health when defending your castle', per: 3 }, cmd: { name: 'Command', desc: '+3% march speed', per: 3 } };
  const ACH = [
    { id: 'firstBlood', name: 'First Blood', desc: 'Win a raid', title: 'Raider', test: c => c.raidWin >= 1, gems: 50 },
    { id: 'conqueror', name: 'Conqueror', desc: 'Win 50 raids', title: 'Conqueror', test: c => c.raidWin >= 50, gems: 300 },
    { id: 'warlord', name: 'Warlord', desc: 'Defeat 10,000 enemy troops', title: 'Warlord', test: c => c.kills >= 1e4, gems: 200 },
    { id: 'ruin', name: 'Bringer of Ruin', desc: 'Defeat 100,000 enemy troops', title: 'Bringer of Ruin', test: c => c.kills >= 1e5, gems: 500 },
    { id: 'bane', name: 'Monster Bane', desc: 'Clear 25 monster camps', title: 'Monster Bane', test: c => c.campWin >= 25, gems: 200 },
    { id: 'dragonslayer', name: 'Dragonslayer', desc: 'Slay the Elder Dragon', title: 'Dragonslayer', test: c => c.dragon >= 1, gems: 300 },
    { id: 'shieldwall', name: 'Shieldwall', desc: 'Win 10 defenses', title: 'Shieldwall', test: c => c.defendWin >= 10, gems: 150 },
    { id: 'quartermaster', name: 'Quartermaster', desc: 'Gather 1,000,000 resources', title: 'Quartermaster', test: c => c.gather >= 1e6, gems: 200 },
    { id: 'king', name: 'Crowned', desc: 'Become King of Eldoria', title: 'King of Eldoria', test: c => c.crowned >= 1, gems: 500 },
    { id: 'dynasty', name: 'Eternal Dynasty', desc: 'Be crowned 3 times', title: 'Eternal Monarch', test: c => c.crowned >= 3, gems: 1000 },
    { id: 'highlord', name: 'High Lord', desc: 'Reach castle level 8', title: 'High Lord', test: (c, s) => cl(s) >= 8, gems: 300 },
    { id: 'legend', name: 'Legend Maker', desc: 'Raise a hero to level 10', title: 'Legend Maker', test: (c, s) => Object.values(s.heroes).some(h => h.level >= 10), gems: 300 },
    { id: 'smith', name: 'Master Smith', desc: 'Forge a Legendary item', title: 'Master Smith', test: c => c.legendary >= 1, gems: 400 },
    { id: 'starslayer', name: 'Star Slayer', desc: 'Defeat 1,000 alien invaders', title: 'Star Slayer', test: c => c.alienKills >= 1000, gems: 300 },
    { id: 'exorcist', name: 'Exorcist', desc: 'Defeat 1,000 demon invaders', title: 'Exorcist', test: c => c.demonKills >= 1000, gems: 300 },
    { id: 'nemesis', name: 'Nemesis Breaker', desc: 'Defeat your Nemesis', title: 'Nemesis Breaker', test: c => c.nemesisWin >= 1, gems: 300 },
    { id: 'arena', name: 'Arena Champion', desc: 'Clear all 8 arena rounds', title: 'Arena Champion', test: c => c.arenaTop >= 8, gems: 400 },
    { id: 'realm', name: 'Realm Breaker', desc: 'Conquer another world through its portal', title: 'Realm Breaker', test: c => c.realmWin >= 1, gems: 400 },
    { id: 'emperor', name: 'Emperor of the Four Worlds', desc: 'Rule Eldoria, Xyrrath, Infernum and Elysium at the same time', title: 'Emperor of the Four Worlds', test: c => c.emperor >= 1, gems: 3000 },
    { id: 'faithful', name: 'Faithful', desc: 'Log in 7 days in a row', title: 'The Faithful', test: c => c.streak >= 7, gems: 200 },
  ];
  /* Season pass: 30 levels, 500 XP each, one season = 30 days. */
  const SEASON_EPOCH = new Date(2026, 0, 1).getTime(), SEASON_LEN = 30 * DAY, LV_XP = 500, SEASON_LV = 30, PREMIUM_PRICE = 500;
  const seasonFree = L => (L % 5 === 0 ? { gems: 40 + L * 2 } : L % 2 ? { gold: 3000 * L, food: 3000 * L } : { mats: { iron: 5 + L, leather: 5 + L } });
  const seasonPrem = L => (L === 15 ? { skins: ['castle:verdant'], gems: 100 } : L === 30 ? { skins: ['castle:celestial'], gems: 300 } : L % 5 === 0 ? { gems: 100, mats: { crystal: 5, dragonscale: 1 } } : { gems: 20, items: { speed5m: 2 }, mats: { crystal: 1 } });
  const XP_FOR = { quest: 120, raidWin: 40, campWin: 30, defendWin: 40, arenaWin: 30, kills: 0.05, alienKills: 0.2, demonKills: 0.2, crowned: 500, build: 15 };

  /* ---------------- State ---------------- */
  function ensure(s) {
    if (!s.meta || typeof s.meta !== 'object') s.meta = {};
    const m = s.meta;
    m.c = m.c || {}; m.ach = m.ach || {}; m.title = m.title || null;
    m.daily = m.daily || { day: '', q: [], bonus: false };
    m.login = m.login || { last: '', streak: 0 };
    m.season = m.season || { id: -1, xp: 0, prem: false, free: [], paid: [] };
    m.arena = m.arena || { week: -1, round: 0, cd: 0 };
    m.diplo = m.diplo || {};
    s.mats = s.mats || { iron: 0, leather: 0, crystal: 0, dragonscale: 0 };
    s.gear = Array.isArray(s.gear) ? s.gear : [];
    for (const h of CH.HERO_ORDER) { const H = s.heroes[h]; H.gear = H.gear || { weapon: null, armor: null, trinket: null }; H.tal = H.tal || { off: 0, def: 0, cmd: 0 }; }
    return m;
  }
  function seasonId(T) { return Math.floor((T - SEASON_EPOCH) / SEASON_LEN); }
  function refresh(s, T = Date.now()) {
    const m = ensure(s), dk = dayKey(T);
    if (m.daily.day !== dk) {
      let h = 0; for (const ch of dk) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const rnd = U.rng(h), pool = QUESTS.slice(), pick = [];
      while (pick.length < 5) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      m.daily = { day: dk, q: pick.map(q => ({ id: q.id, n: Math.round(q.n(cl(s))), p: 0, done: false })), bonus: false };
    }
    const sid = seasonId(T);
    if (m.season.id !== sid) m.season = { id: sid, xp: 0, prem: false, free: [], paid: [] };
    const wk = Math.floor((T - SEASON_EPOCH + 3 * DAY) / (7 * DAY)); // weeks start on Monday
    if (m.arena.week !== wk) m.arena = { week: wk, round: 0, cd: 0 };
    return m;
  }

  /** The one entry point for progress. */
  function track(s, kind, n = 1, T = Date.now()) {
    if (!(n > 0)) return;
    const m = refresh(s, T);
    m.c[kind] = (m.c[kind] || 0) + n;
    for (const q of m.daily.q) { const d = QUESTS.find(x => x.id === q.id); if (d.kind === kind && !q.done) q.p = Math.min(q.n, q.p + n); }
    if (XP_FOR[kind]) m.season.xp += XP_FOR[kind] * n;
  }

  function give(s, rw) {
    if (!rw) return;
    for (const r of ['gold', 'wood', 'stone', 'food', 'gems', 'runes']) if (rw[r]) s.res[r] += rw[r];
    for (const i in rw.items || {}) s.items[i] = (s.items[i] || 0) + rw.items[i];
    for (const x in rw.mats || {}) s.mats[x] = (s.mats[x] || 0) + rw.mats[x];
    for (const k of rw.skins || []) { const [kind, id] = k.split(':'); if (kind === 'castle' && !s.skins.castle.includes(id)) s.skins.castle.push(id); }
  }

  /* Daily quests */
  function claimQuest(s, id, T = Date.now()) {
    const m = refresh(s, T), q = m.daily.q.find(x => x.id === id);
    if (!q || q.done) return { ok: false, reason: 'Already claimed' };
    if (q.p < q.n) return { ok: false, reason: 'Not finished yet' };
    q.done = true; const rw = QUEST_REWARD(cl(s)); give(s, rw); m.season.xp += XP_FOR.quest;
    return { ok: true, rw };
  }
  function claimDailyBonus(s, T = Date.now()) {
    const m = refresh(s, T);
    if (m.daily.bonus) return { ok: false, reason: 'Already claimed' };
    if (!m.daily.q.every(q => q.done)) return { ok: false, reason: 'Claim all five quests first' };
    m.daily.bonus = true; give(s, ALL_DONE); return { ok: true, rw: ALL_DONE };
  }
  /* Login streak: claim once per calendar day; missing a day resets it. */
  function loginState(s, T = Date.now()) {
    const m = refresh(s, T), today = dayKey(T), yest = dayKey(T - DAY);
    const can = m.login.last !== today;
    const streak = m.login.last === yest || m.login.last === today ? m.login.streak : 0;
    return { can, streak, day: can ? (streak % 7) + 1 : ((streak - 1) % 7) + 1 };
  }
  function claimLogin(s, T = Date.now()) {
    const m = refresh(s, T), st = loginState(s, T);
    if (!st.can) return { ok: false, reason: 'Come back tomorrow' };
    m.login.streak = st.streak + 1; m.login.last = dayKey(T);
    m.c.streak = Math.max(m.c.streak || 0, m.login.streak);
    const rw = LOGIN[(m.login.streak - 1) % 7]; give(s, rw);
    return { ok: true, rw, day: ((m.login.streak - 1) % 7) + 1 };
  }

  /* Achievements */
  function checkAchievements(s) {
    const m = ensure(s), out = [];
    for (const a of ACH) if (!m.ach[a.id] && a.test(m.c, s)) { m.ach[a.id] = true; s.res.gems += a.gems; out.push(a); }
    return out;
  }
  function setTitle(s, id) { const m = ensure(s); if (id && !m.ach[id]) return false; m.title = id || null; return true; }
  const titleOf = s => { const m = s.meta; const a = m && m.title && ACH.find(x => x.id === m.title); return a ? a.title : null; };

  /* Season pass */
  const seasonLevel = (s, T = Date.now()) => Math.min(SEASON_LV, Math.floor(refresh(s, T).season.xp / LV_XP));
  function claimSeason(s, L, paid, T = Date.now()) {
    const m = refresh(s, T), se = m.season;
    if (L < 1 || L > seasonLevel(s, T)) return { ok: false, reason: 'Reach level ' + L + ' first' };
    if (paid && !se.prem) return { ok: false, reason: 'Unlock the Premium pass first' };
    const list = paid ? se.paid : se.free;
    if (list.includes(L)) return { ok: false, reason: 'Already claimed' };
    list.push(L); const rw = paid ? seasonPrem(L) : seasonFree(L); give(s, rw); return { ok: true, rw };
  }
  function buyPremium(s, T = Date.now()) { const m = refresh(s, T); if (m.season.prem) return { ok: false, reason: 'Already unlocked' }; if (s.res.gems < PREMIUM_PRICE) return { ok: false, reason: 'Not enough gems (' + PREMIUM_PRICE + ')' }; s.res.gems -= PREMIUM_PRICE; m.season.prem = true; return { ok: true }; }
  const seasonEnds = T => SEASON_EPOCH + (seasonId(T) + 1) * SEASON_LEN;

  /* Hero gear and talents */
  function craft(s, slot, tier) {
    ensure(s);
    const t = TIERS[tier];
    if (!t || !SLOTS[slot]) return { ok: false, reason: 'Unknown item' };
    if (CH.State.heroHallLevel(s) < t.hall) return { ok: false, reason: 'Needs Hero Hall level ' + t.hall };
    for (const k in t.cost) { const have = k === 'gold' ? s.res.gold : s.mats[k] || 0; if (have < t.cost[k]) return { ok: false, reason: 'Not enough ' + (MATS[k] || k) }; }
    for (const k in t.cost) { if (k === 'gold') s.res.gold -= t.cost[k]; else s.mats[k] -= t.cost[k]; }
    const it = { id: 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), slot, tier, name: SLOTS[slot][tier] };
    s.gear.push(it);
    if (tier === 4) track(s, 'legendary', 1);
    return { ok: true, item: it };
  }
  /** Melt an unused item back into Iron Ore (60% of its iron, plus a little crystal for rare+). */
  function smelt(s, itemId) {
    ensure(s); const it = s.gear.find(g => g.id === itemId);
    if (!it) return { ok: false, reason: 'Item not found' };
    if (CH.HERO_ORDER.some(h => Object.values(s.heroes[h].gear).includes(itemId))) return { ok: false, reason: 'Unequip it first' };
    const c = TIERS[it.tier].cost, got = { iron: Math.floor(c.iron * 0.6), crystal: it.tier >= 2 ? Math.floor((c.crystal || 0) * 0.3) : 0 };
    s.gear = s.gear.filter(g => g !== it); s.mats.iron += got.iron; s.mats.crystal += got.crystal;
    return { ok: true, got };
  }
  function buyMat(s, k) {
    ensure(s); const o = CH.GEM_SHOP.mats[k];
    if (!o) return { ok: false, reason: 'Not for sale' };
    if (s.res.gems < o.gems) return { ok: false, reason: 'Not enough gems (' + o.gems + ')' };
    s.res.gems -= o.gems; s.mats[k] = (s.mats[k] || 0) + o.n; return { ok: true, n: o.n };
  }
  function equip(s, hero, itemId) {
    ensure(s); const it = s.gear.find(g => g.id === itemId), H = s.heroes[hero];
    if (!it || !H) return false;
    for (const h of CH.HERO_ORDER) for (const sl in s.heroes[h].gear) if (s.heroes[h].gear[sl] === itemId) s.heroes[h].gear[sl] = null;
    H.gear[it.slot] = itemId; return true;
  }
  function unequip(s, hero, slot) { ensure(s); s.heroes[hero].gear[slot] = null; }
  const talentPoints = (s, h) => Math.max(0, s.heroes[h].level - 1) - Object.values(ensure(s) && s.heroes[h].tal).reduce((a, n) => a + n, 0);
  function addTalent(s, h, br) { ensure(s); if (!TALENTS[br] || talentPoints(s, h) <= 0 || s.heroes[h].tal[br] >= 10) return false; s.heroes[h].tal[br]++; return true; }
  function resetTalents(s, h) { ensure(s); s.heroes[h].tal = { off: 0, def: 0, cmd: 0 }; }
  /** Hero might (% bonus to the whole army it leads). ctx 'atk' or 'def'. */
  function might(s, h, ctx = 'atk') {
    if (!h || !s.heroes[h]) return 0;
    ensure(s); const H = s.heroes[h];
    let m = 0; for (const sl in H.gear) { const it = s.gear.find(g => g.id === H.gear[sl]); if (it) m += TIERS[it.tier].might; }
    m += H.tal.off * TALENTS.off.per + (ctx === 'def' ? H.tal.def * TALENTS.def.per : 0);
    return m;
  }
  const marchBonus = (s, h) => (h && s.heroes[h] && s.heroes[h].tal ? s.heroes[h].tal.cmd * TALENTS.cmd.per / 100 : 0);
  /** Monster camp material drops. */
  function campMats(lvl, kind) {
    const m = { iron: 3 * lvl, leather: 3 * lvl };
    if (lvl >= 3) m.crystal = lvl - 2;
    if (lvl >= 6 || kind === 'dragon') m.dragonscale = kind === 'dragon' ? 5 : 1;
    return m;
  }

  /* Nemesis: a kingdom you keep humiliating swears revenge. */
  function onPlayerBeat(s, k, T) {
    const w = s.world;
    k.beaten = (k.beaten || 0) + 1;
    if (k.nemesis) {
      k.nemesis = false; k.beaten = 0; k.grudge = 0; k.friendUntil = T + 3 * DAY;
      track(s, 'nemesisWin', 1, T);
      const rw = { gems: 300, mats: { crystal: 10, dragonscale: 3 } }; give(s, rw);
      w.news.unshift({ t: T, text: '☠ ' + s.player.name + ' broke the Nemesis ' + k.name + '! It bends the knee for 3 days.', kind: 'war' });
      return CH.World.addReport(s, { t: T, kind: 'event', title: '☠ Nemesis defeated: ' + k.name + ' bends the knee', outcome: 'win', reward: rw, items: {} });
    }
    if (k.beaten >= 3 && !w.kingdoms.some(x => x.nemesis)) {
      k.nemesis = true; k.grudge = 5; k.pcd = 0;
      for (const t in k.tr) k.tr[t] = Math.round(k.tr[t] * 1.4 + 50);
      k.hl += 2;
      w.news.unshift({ t: T, text: '☠ ' + k.name + ' has sworn eternal vengeance on ' + s.player.name + '!', kind: 'war' });
      return CH.World.addReport(s, { t: T, kind: 'letter', title: '☠ A letter from ' + k.ruler + ' of ' + k.name, outcome: 'loss',
        letter: 'You have shamed ' + k.name + ' for the last time. I have doubled my levies and my hero sharpens his blade. Wherever your castle hides, my armies will find it. Defeat me if you can — the reward will be worth it.' });
    }
    return null;
  }

  /* Diplomacy */
  const tributeCost = k => 2000 * k.cl;
  const truceCost = k => ({ gold: 5000 * k.cl, gems: 20 });
  const hireCost = k => 3000 * k.cl;
  function tribute(s, k, T = Date.now()) {
    const c = tributeCost(k); if (s.res.gold < c) return { ok: false, reason: 'Needs ' + U.fmt(c) + ' gold' };
    s.res.gold -= c; k.res.gold += c; k.grudge = Math.max(0, k.grudge - 2);
    if (!k.grudge && !k.nemesis) k.friendUntil = Math.max(k.friendUntil || 0, T + 2 * 3600e3);
    return { ok: true, msg: k.name + ' accepts your tribute' + (k.grudge ? '. Their anger cools.' : ' and will leave you in peace for 2 hours.') };
  }
  function truce(s, k, T = Date.now()) {
    if (k.nemesis) return { ok: false, reason: k.name + ' spits on your offer. A Nemesis never makes peace.' };
    if (k.grudge >= 4) return { ok: false, reason: k.name + ' refuses: their grudge is too deep. Send tribute first.' };
    const c = truceCost(k); if (s.res.gold < c.gold || s.res.gems < c.gems) return { ok: false, reason: 'Needs ' + U.fmt(c.gold) + ' gold and ' + c.gems + ' gems' };
    s.res.gold -= c.gold; s.res.gems -= c.gems;
    k.friendUntil = T + 12 * 3600e3; k.truceUntil = T + 12 * 3600e3; k.grudge = 0;
    return { ok: true, msg: 'Truce signed with ' + k.name + ' for 12 hours.' };
  }
  function breakTruce(s, k) { k.truceUntil = 0; k.friendUntil = 0; k.grudge = Math.min(5, (k.grudge || 0) + 3); }
  function hire(s, k, targetId, T = Date.now()) {
    const w = s.world, t = w.kingdoms.find(x => x.id === targetId);
    if (!t || t === k) return { ok: false, reason: 'Choose a target' };
    if (k.out) return { ok: false, reason: k.name + '\'s army is away' };
    if (t.sh > T) return { ok: false, reason: t.name + ' is shielded' };
    if (t.f === k.f) return { ok: false, reason: k.name + ' won\'t attack its own faction' };
    const c = hireCost(k); if (s.res.gold < c) return { ok: false, reason: 'Needs ' + U.fmt(c) + ' gold' };
    const army = {}; for (const x in k.tr) { const n = Math.floor(k.tr[x] * 0.6); if (n) { army[x] = n; k.tr[x] -= n; } }
    if (!Object.keys(army).length) return { ok: false, reason: k.name + ' has no army to send' };
    s.res.gold -= c; k.out = true;
    const secs = Math.max(30, CH.World.marchSeconds(k, t, army));
    w.marches.push({ id: 'm' + w.nextId++, owner: k.id, kind: 'attack', fx: k.x, fy: k.y, tx: t.x, ty: t.y, t0: T, t1: T + secs * 1000, army, hero: k.hero, heroLevel: k.hl, target: { type: 'kingdom', id: t.id }, cargo: {}, hiredBy: 'player' });
    return { ok: true, msg: k.name + ' marches on ' + t.name + ' for your gold. Arrival in ' + U.time(secs) + '.' };
  }

  /* Arena: 8 champions per week. Troops never die in the arena. */
  const ARENA_NAMES = ['Squire Bren', 'Captain Moss', 'Lady Vex', 'The Iron Twins', 'Warden Halvar', 'Queen Sable', 'The Ashen Knight', 'Grand Champion Auric'];
  function arenaArmy(r) {
    const p = 3000 * Math.pow(1.75, r);
    const mix = r < 3 ? { swordsman: 0.4, archer: 0.35, lightCavalry: 0.25 } : r < 6 ? { knight: 0.35, crossbowman: 0.35, heavyCavalry: 0.3 } : { paladin: 0.3, longbowman: 0.3, dragonRider: 0.25, trebuchet: 0.15 };
    const a = {}; for (const t in mix) a[t] = Math.max(1, Math.round(p * mix[t] / CH.troopPower(t)));
    return a;
  }
  const arenaReward = r => ({ gems: 20 + r * 15, mats: { iron: 5 + r * 3, leather: 5 + r * 3, crystal: r >= 3 ? r - 2 : 0 } });
  function arenaFight(s, heroId, T = Date.now()) {
    const m = refresh(s, T), a = m.arena;
    if (a.round >= 8) return { ok: false, reason: 'You are this week\'s champion! New champions arrive on Monday.' };
    if (a.cd > T) return { ok: false, reason: 'Your troops are resting: next fight in ' + U.time((a.cd - T) / 1000) };
    const army = { ...s.army }; if (!Object.keys(army).some(t => army[t] > 0)) return { ok: false, reason: 'You need troops at home' };
    const hero = heroId && s.heroes[heroId] && s.heroes[heroId].unlocked ? { id: heroId, level: s.heroes[heroId].level, skin: CH.State.heroSkin(s, heroId), might: might(s, heroId) } : null;
    const cfg = CH.Siege.build({
      attacker: { name: s.player.name, army, hero, research: s.research.troops, atkBonus: 0.03 * (s.research.techs.warfare || 0) },
      defender: { name: ARENA_NAMES[a.round], kind: 'camp', cl: Math.min(8, a.round + 1), layout: [], army: arenaArmy(a.round), heroes: [{ id: CH.HERO_ORDER[a.round % 6], level: 2 + a.round * 2 }], research: {} },
      formation: 'spearhead', dir: { x: 1, y: 0 }, seed: (T % 1e9) | 0, playerSide: 'atk',
    });
    cfg.names = { atk: s.player.name, def: ARENA_NAMES[a.round] };
    const r = CH.Siege.run(cfg), won = r.outcome === 'win', round = a.round + 1;
    let rw = null;
    if (won) { a.round++; rw = arenaReward(round); give(s, rw); track(s, 'arenaWin', 1, T); m.c.arenaTop = Math.max(m.c.arenaTop || 0, a.round); }
    else a.cd = T + 5 * MIN;
    const rep = CH.World.addReport(s, { t: T, kind: 'arena', you: 'atk', outcome: won ? 'win' : 'loss', title: (won ? '🏟 Arena round ' + round + ' won vs ' : '🏟 Arena round ' + round + ' lost vs ') + ARENA_NAMES[round - 1],
      atk: { name: s.player.name, sent: r.atk.sent, lost: r.atk.lost, hero: heroId }, def: { name: ARENA_NAMES[round - 1], sent: r.def.sent, lost: r.def.lost }, reward: rw || {}, time: Math.round(r.time), replay: cfg, arena: true });
    return { ok: true, won, round, rw, report: rep };
  }

  /** Counts of things waiting to be claimed (for the HUD badge). */
  function claimable(s, T = Date.now()) {
    const m = refresh(s, T);
    let n = m.daily.q.filter(q => !q.done && q.p >= q.n).length + (loginState(s, T).can ? 1 : 0) + (!m.daily.bonus && m.daily.q.every(q => q.done) ? 1 : 0);
    const L = seasonLevel(s, T); for (let i = 1; i <= L; i++) { if (!m.season.free.includes(i)) n++; if (m.season.prem && !m.season.paid.includes(i)) n++; }
    return n;
  }

  return {
    QUESTS, LOGIN, MATS, TIERS, SLOTS, TALENTS, ACH, ARENA_NAMES, SEASON_LV, LV_XP, PREMIUM_PRICE, seasonFree, seasonPrem, seasonEnds,
    ensure, refresh, track, give, claimQuest, claimDailyBonus, loginState, claimLogin, checkAchievements, setTitle, titleOf,
    seasonLevel, claimSeason, buyPremium, craft, equip, unequip, talentPoints, addTalent, resetTalents, might, marchBonus, campMats,
    smelt, buyMat, onPlayerBeat, tributeCost, truceCost, hireCost, tribute, truce, breakTruce, hire, arenaArmy, arenaReward, arenaFight, claimable, dayKey,
  };
})();
