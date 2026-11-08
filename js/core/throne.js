/* =====================================================================
 * Eldoria — core/throne.js
 * The Aurelion Citadel at the heart of the world and the weekly
 * Throne War (Saturday 15:00 local time, 30 minutes).
 *
 *  - When the war opens, the Citadel is held by its Guardians.
 *  - Any kingdom may attack it; factions may RALLY (up to 10 castles).
 *  - Whoever takes it garrisons it with their surviving troops and
 *    starts accumulating hold time. Losing it stops the clock.
 *  - When the war ends, the contender with the LONGEST TOTAL HOLD TIME
 *    becomes King of Eldoria until the next war (one week) and may
 *    hand out the treasure prepared in the Citadel.
 * ===================================================================== */
CH.Throne = (function () {
  const C = CH.CONFIG, U = CH.util, TH = CH.THRONE, MIN = 60000, DAY = 864e5;
  const W = s => s.world;
  const armyCount = a => Object.values(a || {}).reduce((x, n) => x + (n || 0), 0);
  const sum = o => Object.values(o || {}).reduce((x, n) => x + (n || 0), 0);

  /** The war window for the week containing T (local time). */
  function warWindow(T) {
    const d = new Date(T);
    const mm = TH.warMinute || 0;
    const sat = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() - TH.warDay + 7) % 7), TH.warHour, mm, 0, 0);
    let start = sat.getTime();
    if (start > T) start = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() - 7, TH.warHour, mm).getTime();
    const end = start + TH.warMinutes * MIN;
    const next = new Date(new Date(start).getFullYear(), new Date(start).getMonth(), new Date(start).getDate() + 7, TH.warHour, mm).getTime();
    return { start, end, next, active: T >= start && T < end };
  }

  /** e.g. "Saturday 15:00" — built from the schedule in defs.js. */
  function warLabel() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[TH.warDay] + ' ' + String(TH.warHour).padStart(2, '0') + ':' + String(TH.warMinute || 0).padStart(2, '0');
  }
  function freshPrizes() { const out = []; for (const p of TH.prizes) for (let i = 0; i < p.count; i++) out.push({ id: p.tier + i, tier: p.tier, given: null }); return out; }

  /** Adds the Citadel to a world (new or old save) and clears the land around it. */
  function ensure(w) {
    const c = Math.floor(w.size || CH.CONFIG.WORLD_SIZE) / 2 | 0;
    if (!w.throne) {
      w.throne = { id: 'throne', x: c, y: c, king: null, history: [], war: null, prizes: freshPrizes(), burn: 0, smoke: 0, rallyCd: [0, 0, 0, 0] };
      // Move anything too close to the centre outwards.
      for (const L of [w.kingdoms, w.tiles, w.camps, w.ruins, w.forts]) for (const o of L) {
        const dx = o.x - c, dy = o.y - c, d = Math.hypot(dx, dy);
        if (d < 6) { const a = d ? Math.atan2(dy, dx) : Math.random() * 6.283; o.x = Math.round(c + Math.cos(a) * (7 + Math.random() * 3)); o.y = Math.round(c + Math.sin(a) * (7 + Math.random() * 3)); }
      }
      if (Math.hypot(w.px - c, w.py - c) < 6) { w.px = c + 9; w.py = c + 9; }
    }
    for (const k of w.kingdoms) { if (k.kills == null) k.kills = 0; }
    if (w.pkills == null) w.pkills = 0;
    return w.throne;
  }

  const REVIVE_MS = 5 * MIN;
  /** Troops that fall in the Throne War are not lost: they return 5 minutes later. */
  function reviveLater(s, key, army, T) {
    if (!armyCount(army) || key === 'guard' || key === 'none') return;
    const a = {}; for (const t in army) if (army[t] > 0) a[t] = Math.floor(army[t]);
    if (key === 'player') (s.revive = s.revive || []).push({ at: T + REVIVE_MS, army: a });
    else { const k = W(s).kingdoms.find(x => x.id === key); if (k) (k.rv = k.rv || []).push({ at: T + REVIVE_MS, army: a }); }
  }
  /** Splits a loss of the garrison between its owners by share. */
  function reviveGarrisonLoss(s, war, lost, T) {
    for (const key in war.shares) { const part = {}; for (const t in lost) part[t] = Math.floor(lost[t] * war.shares[key]); reviveLater(s, key, part, T); }
  }
  /** Pull your troops out of the Citadel. If you hold it, you abandon it. */
  function withdraw(s, now = Date.now()) {
    const w = W(s), th = w.throne, war = th && th.war;
    if (!war || war.ended || !(war.shares && war.shares.player > 0)) return { ok: false, reason: 'You have no troops in the Citadel' };
    const mine = war.holder === 'player';
    let sent = 0;
    if (mine) {
      sent = Math.round(armyCount(war.garrison) * war.shares.player);
      closeHold(war, now);
      releaseGarrison(s, now); // everyone's troops go home
      war.holder = 'none'; war.holderF = null; war.garrison = {}; war.shares = {}; war.holdStart = now;
      w.news.unshift({ t: now, text: s.player.name + ' withdrew from the ' + TH.name + '. It stands empty!', kind: 'war' });
    }
    return { ok: true, abandoned: mine, troops: sent };
  }
  function garrisonOf(s) {
    const war = W(s).throne && W(s).throne.war;
    if (!war || war.ended || !(war.shares && war.shares.player > 0)) return null;
    const a = {}; for (const t in war.garrison) { const n = Math.floor(war.garrison[t] * war.shares.player); if (n) a[t] = n; }
    return a;
  }
  const keyName = (s, key) => key === 'player' ? s.player.name : key === 'guard' ? 'Citadel Guardians' : key === 'none' ? 'Nobody (empty)' : (W(s).kingdoms.find(k => k.id === key) || { name: '?' }).name;
  const keyFaction = (s, key) => key === 'player' ? s.faction : (key === 'guard' || key === 'none') ? null : (W(s).kingdoms.find(k => k.id === key) || {}).f;
  /* ---------------- Royal titles & buffs ---------------- */
  const BUFF_NAMES = { atk: 'troop attack', march: 'march speed', def: 'troop defense & health', train: 'training speed', prod: 'production', research: 'research speed' };
  const fmtBuffs = b => Object.entries(b).map(([k, v]) => (v > 0 ? '+' : '') + Math.round(v * 100) + '% ' + BUFF_NAMES[k]).join(', ');
  function titleOfKey(s, key) { const th = W(s) && W(s).throne; if (!th || !th.titles) return null; for (const id in th.titles) if (th.titles[id] === key) return id; return null; }
  /** Combined buffs for a kingdom key ('player' or AI id): king + royal title + realm rule. */
  function buffs(s, key = 'player') {
    const th = W(s) && W(s).throne, out = { atk: 0, march: 0, def: 0, train: 0, prod: 0, research: 0 };
    if (!th) return out;
    const add = b => { for (const k in b) out[k] += b[k]; };
    if (th.king && th.king.key === key && th.king.until > Date.now()) add(TH.kingBuffs);
    const t = titleOfKey(s, key); if (t) add(TH.titles[t].buffs);
    if (CH.Realm) add(CH.Realm.rulerBuffs(s, key));
    return out;
  }
  /** King grants (or revokes, with key null) a title. One holder per title; one title per kingdom. */
  function grantTitle(s, titleId, key, now = Date.now()) {
    const th = W(s).throne;
    if (!isPlayerKing(s)) return { ok: false, reason: 'Only the king can grant titles' };
    if (!TH.titles[titleId]) return { ok: false, reason: 'Unknown title' };
    th.titles = th.titles || {};
    if (!key) { delete th.titles[titleId]; return { ok: true }; }
    if (key === 'player') return { ok: false, reason: 'The king already enjoys every royal buff' };
    for (const id in th.titles) if (th.titles[id] === key) delete th.titles[id];
    th.titles[titleId] = key;
    const k = W(s).kingdoms.find(x => x.id === key), T = TH.titles[titleId];
    if (k) { if (T.good) { k.grudge = 0; k.friendUntil = Math.max(k.friendUntil || 0, th.king.until); } else k.grudge = Math.min(5, (k.grudge || 0) + 2); }
    W(s).news.unshift({ t: now, text: (T.good ? '🎖 ' : '🤡 ') + TH.title + ' ' + s.player.name + ' named ' + keyName(s, key) + ' the ' + T.name + '.', kind: 'event' });
    return { ok: true };
  }
  /** An AI king hands out titles: honours to its faction, villain titles to those it hates. */
  function aiKingTitles(s, T) {
    const w = W(s), th = w.throne, kingK = w.kingdoms.find(k => k.id === th.king.key);
    th.titles = {};
    const friends = w.kingdoms.filter(k => k.f === th.king.f && k.id !== th.king.key).sort((a, b) => CH.World.power(b) - CH.World.power(a));
    const goods = Object.keys(TH.titles).filter(t => TH.titles[t].good), bads = Object.keys(TH.titles).filter(t => !TH.titles[t].good);
    if (s.faction === th.king.f) goods.splice(0, 1).forEach(t => { th.titles[t] = 'player'; });
    goods.forEach((t, i) => { if (friends[i]) th.titles[t] = friends[i].id; });
    const foes = w.kingdoms.filter(k => k.f !== th.king.f).sort((a, b) => CH.World.power(b) - CH.World.power(a));
    const hatesYou = kingK && (kingK.grudge > 0 || kingK.nemesis) && s.faction !== th.king.f;
    bads.forEach((t, i) => { if (i === 0 && hatesYou) th.titles[t] = 'player'; else if (foes[i]) th.titles[t] = foes[i].id; });
    const mine = titleOfKey(s, 'player');
    if (mine) { const Tt = TH.titles[mine]; CH.World.addReport(s, { t: T, kind: 'event', outcome: Tt.good ? 'win' : 'loss', title: (Tt.good ? '🎖 The king named you ' : '🤡 The king branded you ') + Tt.name + ' (' + fmtBuffs(Tt.buffs) + ')' }); }
  }
  const kingName = s => { const t = W(s) && W(s).throne; return t && t.king ? keyName(s, t.king.key) : null; };
  const isPlayerKing = s => { const t = W(s) && W(s).throne; return !!(t && t.king && t.king.key === 'player' && t.king.until > Date.now()); };

  /** Guardians scale with the strongest kingdoms so the first capture is a real fight. */
  function guardians(w) {
    const top = w.kingdoms.map(k => CH.World.armyPower(k.tr)).sort((a, b) => b - a).slice(0, 5);
    const p = (top.reduce((a, n) => a + n, 0) / Math.max(1, top.length)) * 0.6 + 8000;
    return { knight: Math.round(p * 0.35 / CH.troopPower('knight')), longbowman: Math.round(p * 0.3 / CH.troopPower('longbowman')), heavyCavalry: Math.round(p * 0.25 / CH.troopPower('heavyCavalry')), paladin: Math.round(p * 0.1 / CH.troopPower('paladin')) };
  }
  /** The Citadel's fortifications for battles fought there. */
  function layout() {
    const L = [{ type: 'castle', level: 8, tx: 14, ty: 10 }];
    for (let x = 9; x <= 20; x++) for (const y of [5, 16]) L.push({ type: 'wall', level: 7, tx: x, ty: y });
    for (let y = 6; y <= 15; y++) for (const x of [9, 20]) L.push({ type: 'wall', level: 7, tx: x, ty: y });
    [[10, 6, 'archerTower'], [18, 6, 'wizardTower'], [10, 14, 'cannon'], [18, 14, 'archerTower'], [12, 8, 'ballista'], [16, 12, 'infernoTower']].forEach(([x, y, t]) => L.push({ type: t, level: 6, tx: x, ty: y }));
    return L.filter(l => CH.BUILDINGS[l.type]);
  }

  function setHolder(s, key, army, shares, T) {
    const war = W(s).throne.war;
    closeHold(war, T);
    war.holder = key; war.holderF = keyFaction(s, key); war.holdStart = T; war.garrison = army; war.shares = shares || { [key]: 1 };
    war.names[key] = keyName(s, key);
  }
  function closeHold(war, T) { if (war.holder && war.holder !== 'guard') war.hold[war.holder] = (war.hold[war.holder] || 0) + Math.max(0, T - war.holdStart); war.holdStart = T; }
  /** Returns garrison troops to their owners by their share. */
  function releaseGarrison(s, T) {
    const w = W(s), war = w.throne.war;
    if (!war || !war.garrison || war.holder === 'guard') return;
    for (const key in war.shares) {
      const part = {}; for (const t in war.garrison) { const n = Math.floor(war.garrison[t] * war.shares[key]); if (n) part[t] = n; }
      if (!armyCount(part)) continue;
      if (key === 'player') w.marches.push({ id: 'm' + w.nextId++, owner: 'player', kind: 'return', fx: w.throne.x, fy: w.throne.y, tx: w.px, ty: w.py, t0: T, t1: T + 60000, army: part, cargo: {}, target: { type: 'home' } });
      else { const k = w.kingdoms.find(x => x.id === key); if (k) for (const t in part) k.tr[t] = (k.tr[t] || 0) + part[t]; }
    }
    war.garrison = {};
  }
  function addKills(s, key, n) {
    const w = W(s), war = w.throne.war;
    if (war) war.kills[key] = (war.kills[key] || 0) + n;
    if (key === 'player') { s.stats.kills += n; CH.Meta.track(s, 'kills', n); } else { const k = w.kingdoms.find(x => x.id === key); if (k) k.kills += n; }
  }

  /** Called every world step. */
  function update(s, T, ev) {
    const w = W(s), th = ensure(w), win = warWindow(T);
    if (win.active && (!th.war || th.war.id !== win.start)) {
      th.war = { id: win.start, end: win.end, holder: 'guard', holderF: null, holdStart: T, garrison: guardians(w), shares: {}, hold: {}, kills: {}, names: {}, ended: false, attacks: 0 };
      th.rallyCd = [0, 0, 0, 0];
      w.news.unshift({ t: T, text: '👑 The Throne War has begun! Seize the ' + TH.name + ' and hold it longest to become ' + TH.title + '.', kind: 'event' });
      ev.push({ kind: 'warStart' });
    }
    if (th.war && !th.war.ended && T >= th.war.end) endWar(s, th.war.end, ev);
    if (th.king && th.king.until <= T) { th.king = null; }
  }

  function endWar(s, T, ev) {
    const w = W(s), th = w.throne, war = th.war;
    closeHold(war, T);
    war.ended = true;
    releaseGarrison(s, T);
    const ranking = Object.entries(war.hold).sort((a, b) => b[1] - a[1]);
    if (ranking.length) {
      const [key, ms] = ranking[0];
      th.king = { key, name: war.names[key] || keyName(s, key), f: keyFaction(s, key), since: T, until: warWindow(T).next, held: ms };
      th.prizes = freshPrizes(); th.titles = {};
      th.history.unshift({ t: T, key, name: th.king.name, held: ms });
      if (key === 'player') CH.Meta.track(s, 'crowned', 1, T); th.history.length = Math.min(th.history.length, 10);
      w.news.unshift({ t: T, text: '👑 ' + th.king.name + ' held the ' + TH.name + ' for ' + U.time(ms / 1000) + ' and is crowned ' + TH.title + '!', kind: 'event' });
      th.burn = 0; th.smoke = T + 10 * MIN;
      if (key !== 'player') { aiKingGifts(s, T); aiKingTitles(s, T); }
      CH.World.addReport(s, { t: T, kind: 'event', title: key === 'player' ? '👑 You are the ' + TH.title + '! Hand out the Citadel\'s treasure.' : '👑 ' + th.king.name + ' is the new ' + TH.title, outcome: key === 'player' ? 'win' : 'loss', coords: [th.x, th.y] });
      ev.push({ kind: 'report', report: s.reports[0], alert: key === 'player' });
    } else {
      w.news.unshift({ t: T, text: 'The Guardians held the ' + TH.name + '. No king this week.', kind: 'event' });
    }
  }

  /** An AI king shares the treasure with its faction; you get a chest if you're in it. */
  function aiKingGifts(s, T) {
    const w = W(s), th = w.throne, f = th.king.f;
    const members = w.kingdoms.filter(k => k.f === f && k.id !== th.king.key).sort((a, b) => CH.World.power(b) - CH.World.power(a));
    let i = 0;
    for (const p of th.prizes) {
      if (s.faction === f && !th.prizes.some(x => x.given === 'player') && p.tier !== 'royal') { give(s, p, 'player', T); continue; }
      const k = p.tier === 'royal' ? null : members[i++];
      p.given = k ? k.id : th.king.key;
    }
  }
  function give(s, p, key, T) {
    const w = W(s), def = TH.prizes.find(x => x.tier === p.tier);
    p.given = key;
    if (key === 'player') {
      for (const r in def.reward) s.res[r] = (s.res[r] || 0) + def.reward[r];
      for (const i in def.items) s.items[i] = (s.items[i] || 0) + def.items[i];
      CH.World.addReport(s, { t: T, kind: 'event', title: '🎁 ' + (w.throne.king ? w.throne.king.name : 'The king') + ' gave you a ' + def.name, outcome: 'win', reward: def.reward, items: def.items });
    } else {
      const k = w.kingdoms.find(x => x.id === key);
      if (k) { for (const r in def.reward) if (k.res[r] != null) k.res[r] += def.reward[r]; if (w.throne.king && w.throne.king.key === 'player') { k.grudge = 0; k.friendUntil = w.throne.king.until; } }
    }
  }
  /** Player king hands out a prize. You may keep one chest of each tier. */
  function distribute(s, prizeId, key, now = Date.now()) {
    const th = W(s).throne;
    if (!isPlayerKing(s)) return { ok: false, reason: 'Only the king can hand out the treasure' };
    const p = th.prizes.find(x => x.id === prizeId);
    if (!p || p.given) return { ok: false, reason: 'Already given' };
    if (key === 'player' && th.prizes.some(x => x.tier === p.tier && x.given === 'player')) return { ok: false, reason: 'You already kept a ' + TH.prizes.find(x => x.tier === p.tier).name };
    if (key !== 'player' && !W(s).kingdoms.find(k => k.id === key)) return { ok: false, reason: 'Unknown kingdom' };
    give(s, p, key, now);
    if (key !== 'player') W(s).news.unshift({ t: now, text: '🎁 ' + TH.title + ' ' + s.player.name + ' rewarded ' + keyName(s, key) + ' with a ' + TH.prizes.find(x => x.tier === p.tier).name + '.', kind: 'event' });
    return { ok: true };
  }

  /* ---------------- AI during the war ---------------- */
  function aiDecide(s, k, T, ev, rnd) {
    const w = W(s), th = w.throne, war = th.war;
    if (!war || war.ended || T >= war.end || k.out) return false;
    if (war.holder === k.id) return true; // holds it: stays put
    const P = CH.PERSONALITIES[k.p];
    if (war.holderF != null && war.holderF === k.f) return true; // an ally holds it
    const inFlight = w.marches.filter(m => m.target.type === 'throne' && m.owner !== 'player').length;
    if (inFlight >= 10 || armyCount(k.tr) < 50) return false;
    if (rnd() > 0.25 + P.aggr * 0.4) return false;
    // The strongest free member of a faction leads a rally when the faction is ready.
    let allies = [];
    if (th.rallyCd[k.f] <= T) {
      const mem = w.kingdoms.filter(o => o !== k && o.f === k.f && !o.out && armyCount(o.tr) > 50 && war.holder !== o.id).sort((a, b) => CH.World.power(b) - CH.World.power(a)).slice(0, TH.rallyMax - 1);
      if (mem.length >= 2) { allies = mem; th.rallyCd[k.f] = T + 6 * MIN; }
    }
    const take = (o, f) => { const a = {}; for (const t in o.tr) { const n = Math.floor(o.tr[t] * f); if (n) { a[t] = n; o.tr[t] -= n; } } return a; };
    const army = take(k, P.send);
    const al = allies.map(o => { o.out = true; return { id: o.id, name: o.name, army: take(o, 0.4) }; }).filter(a => armyCount(a.army));
    const secs = Math.max(CH.World.marchSeconds(k, th, army), 30) + (al.length ? TH.rallyMuster : 0);
    k.out = true;
    w.marches.push({ id: 'm' + w.nextId++, owner: k.id, kind: 'attack', fx: k.x, fy: k.y, tx: th.x, ty: th.y, t0: T, t1: T + secs * 1000, army, hero: k.hero, heroLevel: k.hl, allies: al, rally: al.length > 0, target: { type: 'throne', id: 'throne' }, cargo: {} });
    if (al.length) w.news.unshift({ t: T, text: '⚔ ' + k.name + ' leads a rally of ' + (al.length + 1) + ' ' + CH.FACTIONS[k.f].name + ' castles on the ' + TH.name + '!', kind: 'war' });
    return true;
  }

  /** Splits the merged army's survivors back to the march owner and its rally allies. */
  function merged(m) { const a = { ...m.army }; for (const x of m.allies || []) for (const t in x.army) a[t] = (a[t] || 0) + x.army[t]; return a; }
  function splitSurvivors(m, sent, left) {
    const ratio = t => (sent[t] ? (left[t] || 0) / sent[t] : 0);
    const own = {}; for (const t in m.army) { const n = Math.floor(m.army[t] * ratio(t)); if (n) own[t] = n; }
    const al = (m.allies || []).map(x => { const a = {}; for (const t in x.army) { const n = Math.floor(x.army[t] * ratio(t)); if (n) a[t] = n; } return { id: x.id, army: a }; });
    return { own, allies: al };
  }
  function sharesOf(m, split) {
    const tot = armyCount(split.own) + split.allies.reduce((a, x) => a + armyCount(x.army), 0) || 1;
    const sh = { [m.owner]: armyCount(split.own) / tot };
    for (const x of split.allies) sh[x.id] = (sh[x.id] || 0) + armyCount(x.army) / tot;
    return sh;
  }
  function freeAllies(s, m) { for (const x of m.allies || []) { const k = W(s).kingdoms.find(o => o.id === x.id); if (k) k.out = false; } }

  /** A march reaches the Citadel. */
  function arrive(s, m, T, ev) {
    const w = W(s), th = ensure(w), war = th.war;
    const owner = m.owner === 'player' ? null : w.kingdoms.find(k => k.id === m.owner);
    const goHome = (army, extra) => {
      if (armyCount(army)) w.marches.push({ id: 'm' + w.nextId++, owner: m.owner, kind: 'return', fx: th.x, fy: th.y, tx: m.owner === 'player' ? w.px : m.fx, ty: m.owner === 'player' ? w.py : m.fy, t0: T, t1: T + Math.max(20000, m.t1 - m.t0 - (m.rally ? TH.rallyMuster * 1000 : 0)), army, cargo: {}, hero: m.hero, heroLevel: m.heroLevel, target: { type: 'home' }, ...(extra || {}) });
      else if (owner) owner.out = false;
    };
    const returnAllies = split => { for (const x of split.allies) { const k = w.kingdoms.find(o => o.id === x.id); if (k) { for (const t in x.army) k.tr[t] = (k.tr[t] || 0) + x.army[t]; k.out = false; } } };
    if (!war || war.ended || T >= war.end) { freeAllies(s, m); goHome(merged(m)); return; }
    const key = m.owner;
    // Reinforcing your own garrison.
    if (war.holder === key) { for (const t in m.army) war.garrison[t] = (war.garrison[t] || 0) + m.army[t]; freeAllies(s, m); return; }
    war.attacks++;
    const atkArmy = merged(m), defKey = war.holder;
    if (defKey === 'none' || !armyCount(war.garrison) && defKey !== 'guard') {
      const split0 = { own: { ...m.army }, allies: (m.allies || []).map(x => ({ id: x.id, army: { ...x.army } })) };
      releaseGarrison(s, T);
      setHolder(s, key, atkArmy, sharesOf(m, split0), T);
      freeAllies(s, m); if (owner) owner.out = false;
      w.news.unshift({ t: T, text: '👑 ' + keyName(s, key) + ' marched into the empty ' + TH.name + '!', kind: 'war' });
      if (key === 'player') { const r = CH.World.addReport(s, { t: T, kind: 'attack', you: 'atk', outcome: 'win', title: '👑 You occupied the empty ' + TH.name + '!', coords: [th.x, th.y] }); ev.push({ kind: 'report', report: r }); }
      return;
    }
    let outcome, sent = atkArmy, left = {}, defLost = {}, rep = null;
    if (key === 'player' || defKey === 'player') {
      // Full engine battle at the Citadel.
      const playerAtk = key === 'player';
      const hero = playerAtk ? (m.hero ? { id: m.hero, level: s.heroes[m.hero].level, skin: CH.State.heroSkin(s, m.hero) } : null) : { id: m.hero, level: m.heroLevel };
      const cfg = CH.Siege.build({
        attacker: { name: keyName(s, key), army: atkArmy, hero: hero && playerAtk ? { ...hero, might: CH.Meta.might(s, hero.id) } : hero, research: playerAtk ? s.research.troops : {}, atkBonus: playerAtk ? 0.03 * (s.research.techs.warfare || 0) + (s.faction === 3 ? 0.06 : 0) : 0.03 * (owner ? owner.cl : 1) },
        defender: { name: TH.name + ' (' + keyName(s, defKey) + ')', kind: 'camp', cl: 8, layout: layout(), army: defKey === 'guard' ? null : war.garrison, monsters: null, heroes: [], research: defKey === 'player' ? s.research.troops : {}, fortBonus: 0.2 },
        formation: m.formation || 'surround', dir: { x: th.x - m.fx, y: th.y - m.fy }, seed: (T % 1e9) | 0, playerSide: playerAtk ? 'atk' : 'def',
      });
      if (defKey === 'guard') { cfg.def.squads = CH.Siege.squads(war.garrison).map(q => ({ ...q, mult: 1.25 })); }
      cfg.names = { atk: keyName(s, key), def: keyName(s, defKey) };
      const r = CH.Siege.run(cfg);
      outcome = r.outcome === 'win' ? 'win' : 'loss';
      sent = r.atk.sent; left = r.atk.left; defLost = r.def.lost;
      for (const t in defLost) war.garrison[t] = Math.max(0, (war.garrison[t] || 0) - defLost[t]);
      rep = { cfg, r };
    } else {
      const res = CH.World.clash(atkArmy, 1 + 0.04 * (m.heroLevel || 1), war.garrison, 1.35, defKey === 'guard' ? 5000 : 2000);
      outcome = res.win ? 'win' : 'loss';
      for (const t in atkArmy) left[t] = Math.floor(atkArmy[t] * (1 - res.atkLoss));
      for (const t in war.garrison) { const n = Math.floor(war.garrison[t] * res.defLoss); defLost[t] = n; war.garrison[t] -= n; }
    }
    // Throne War deaths are not permanent: everyone's fallen return in 5 minutes.
    reviveGarrisonLoss(s, war, defLost, T);
    addKills(s, key, sum(defLost));
    if (defKey !== 'guard') addKills(s, defKey, sum(sent) - sum(left));
    const split = splitSurvivors(m, sent, left);
    { const lostOwn = {}; for (const t in m.army) { const n = m.army[t] - (split.own[t] || 0); if (n > 0) lostOwn[t] = n; } reviveLater(s, key, lostOwn, T);
      for (const x of m.allies || []) { const sv = (split.allies.find(a => a.id === x.id) || { army: {} }).army, l = {}; for (const t in x.army) { const n = x.army[t] - (sv[t] || 0); if (n > 0) l[t] = n; } reviveLater(s, x.id, l, T); } }
    if (outcome === 'win') {
      // The old holder's surviving garrison (if any) goes home; the attackers move in.
      releaseGarrison(s, T);
      const garrison = {}; for (const t in left) if (left[t]) garrison[t] = left[t];
      setHolder(s, key, garrison, sharesOf(m, split), T);
      for (const x of split.allies) { const k = w.kingdoms.find(o => o.id === x.id); if (k) k.out = false; }
      if (owner) owner.out = false;
      th.burn = T + 3 * MIN;
      w.news.unshift({ t: T, text: '🔥 ' + keyName(s, key) + (m.rally ? ' (rally of ' + ((m.allies || []).length + 1) + ')' : '') + ' seized the ' + TH.name + '!', kind: 'war' });
    } else {
      returnAllies(split); goHome(split.own);
      th.smoke = T + 2 * MIN;
    }
    if (rep) {
      const playerAtk = key === 'player';
      const r = CH.World.addReport(s, {
        t: T, kind: playerAtk ? 'attack' : 'defense', you: playerAtk ? 'atk' : 'def', outcome: playerAtk ? (outcome === 'win' ? 'win' : 'loss') : (outcome === 'win' ? 'loss' : 'win'),
        title: playerAtk ? (outcome === 'win' ? '👑 You seized the ' + TH.name + '!' : 'Repelled at the ' + TH.name) : (outcome === 'win' ? keyName(s, key) + ' took the ' + TH.name + ' from you' : 'You held the ' + TH.name + ' against ' + keyName(s, key)),
        atk: { name: keyName(s, key), sent: rep.r.atk.sent, lost: rep.r.atk.lost, hero: m.hero, helpers: m.rally ? (m.allies || []).length : 0 }, def: { name: keyName(s, defKey), sent: rep.r.def.sent, lost: rep.r.def.lost },
        destruction: rep.r.destruction, dmg: rep.r.dmg, time: Math.round(rep.r.time), replay: rep.cfg, coords: [th.x, th.y],
      });
      r.revive = true;
      ev.push({ kind: 'report', report: r, alert: !playerAtk });
    }
  }

  /* ---------------- Player rallies ---------------- */
  /** Picks up to 9 faction allies near you; each lends 40% of its troops. */
  function rallyAllies(s, target) {
    const w = W(s);
    if (s.faction == null) return [];
    return w.kingdoms.filter(k => k.f === s.faction && !k.out && armyCount(k.tr) > 50)
      .sort((a, b) => Math.hypot(a.x - w.px, a.y - w.py) - Math.hypot(b.x - w.px, b.y - w.py)).slice(0, TH.rallyMax - 1)
      .map(k => { const a = {}; for (const t in k.tr) { const n = Math.floor(k.tr[t] * 0.4); if (n) a[t] = n; } return { k, army: a }; });
  }

  /* ---------------- Leaderboards ---------------- */
  function leaderboards(s) {
    const w = W(s);
    const rows = w.kingdoms.map(k => ({ key: k.id, name: k.name, f: k.f, power: CH.World.power(k), kills: k.kills || 0 }));
    rows.push({ key: 'player', name: s.player.name + (CH.Meta.titleOf(s) ? ' «' + CH.Meta.titleOf(s) + '»' : ''), f: s.faction, power: CH.State.power(s), kills: s.stats.kills || 0, me: true });
    const power = rows.slice().sort((a, b) => b.power - a.power);
    const kills = rows.slice().sort((a, b) => b.kills - a.kills);
    const factions = CH.FACTIONS.map(f => { const m = rows.filter(r => r.f === f.id); return { f, members: m.length, power: m.reduce((a, r) => a + r.power, 0), kills: m.reduce((a, r) => a + r.kills, 0) }; }).sort((a, b) => b.power - a.power);
    return { power, kills, factions };
  }

  return { buffs, fmtBuffs, titleOfKey, grantTitle, BUFF_NAMES, kingName, withdraw, garrisonOf, reviveLater, REVIVE_MS, warLabel, warWindow, ensure, update, arrive, aiDecide, distribute, isPlayerKing, rallyAllies, leaderboards, layout, keyName, guardians, endWar };
})();
