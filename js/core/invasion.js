/* =====================================================================
 * Eldoria — core/invasion.js
 * World invasions (Alien Invasion, Demon Invasion): motherships land
 * around the map and every few minutes send a wave at EVERY castle at
 * once. Nobody's troops die in an invasion and nothing is stolen —
 * it is a race for kills. Rewards are paid from your kill count and
 * your rank among all 61 kingdoms when the event ends.
 * ===================================================================== */
CH.Invasion = (function () {
  const U = CH.util, MIN = 60000, WAVE_EVERY = 4 * MIN;
  const KINDS = {
    alienInvasion: { name: 'Alien Invasion', icon: '👽', foe: 'Aliens', units: ['alienDrone', 'alienTrooper', 'alienBrute'], boss: 'alienOverlord', color: '#5fffa0', ship: 'saucer', counter: 'alienKills' },
    demonInvasion: { name: 'Demon Invasion', icon: '😈', foe: 'Demons', units: ['imp', 'darkKnight', 'ogre'], boss: 'demonLord', color: '#c06bff', ship: 'portal', counter: 'demonKills' },
  };
  const W = s => s.world;
  const count = a => Object.values(a || {}).reduce((x, n) => x + (n || 0), 0);
  const ePow = id => { const e = CH.ENEMIES[id]; return Math.max(1, Math.sqrt(e.hp / (1 - (e.armor || 0)) * e.dmg * e.rate) / 3); };
  /** An invader army worth about `power`. */
  function horde(kind, power, boss) {
    const K = KINDS[kind], a = {}, share = [0.45, 0.35, 0.2];
    K.units.forEach((u, i) => { a[u] = Math.max(1, Math.round(power * share[i] / ePow(u))); });
    if (boss && CH.ENEMIES[K.boss]) a[K.boss] = 1;
    return a;
  }
  const active = (w, T) => w.inv && !w.inv.done && T < w.inv.end;

  function start(s, T, evId, end) {
    const w = W(s), N = CH.CONFIG.WORLD_SIZE, ships = [];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + (T / 1000 % 6.28), d = (0.55 + (i % 2) * 0.2) * N / 2;
      ships.push({ id: 'ship' + i, x: Math.round(N / 2 + Math.cos(a) * d), y: Math.round(N / 2 + Math.sin(a) * d), lvl: 5 });
    }
    w.inv = { id: evId, start: T, end, wave: 0, next: T + 30000, ships, kills: {}, done: false };
    const K = KINDS[evId];
    w.news.unshift({ t: T, text: K.icon + ' ' + K.name + '! ' + K.foe + ' have landed and will strike every castle in Eldoria at once. Kill as many as you can — your troops cannot die in this fight.', kind: 'event' });
  }

  function update(s, T, ev) {
    const w = W(s);
    if (!w.inv || w.inv.done) return;
    if (T >= w.inv.end) return finish(s, w.inv.end, ev);
    while (w.inv.next <= T && w.inv.next < w.inv.end) { launchWave(s, w.inv.next, ev); w.inv.next += WAVE_EVERY; }
  }

  function nearestShip(w, x, y) { return w.inv.ships.slice().sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]; }
  function launchWave(s, T, ev) {
    const w = W(s), inv = w.inv, kind = inv.id;
    inv.wave++;
    const f = 0.75 + 0.15 * inv.wave; // waves start strong and keep growing
    const send = (x, y, target, power, boss) => {
      const sh = nearestShip(w, x, y), secs = Math.max(45, Math.hypot(sh.x - x, sh.y - y) * 3.5);
      w.marches.push({ id: 'm' + w.nextId++, owner: 'invader', kind: 'invade', inv: kind, fx: sh.x, fy: sh.y, tx: x, ty: y, t0: T, t1: T + secs * 1000, army: horde(kind, power, boss), target, cargo: {} });
    };
    send(w.px, w.py, { type: 'player' }, CH.World.playerDefPower(s) * f, inv.wave >= 2);
    for (const k of w.kingdoms) send(k.x, k.y, { type: 'kingdom', id: k.id }, CH.World.aiDefPower(k) * f, false);
    ev.push({ kind: 'invWave', wave: inv.wave });
  }

  function addKills(s, key, n) {
    const w = W(s); if (!w.inv || !n) return;
    w.inv.kills[key] = (w.inv.kills[key] || 0) + n;
    if (key === 'player') { s.stats.kills += n; CH.Meta.track(s, KINDS[w.inv.id].counter, n); CH.Meta.track(s, 'kills', n); }
    else { const k = w.kingdoms.find(x => x.id === key); if (k) k.kills = (k.kills || 0) + n; }
  }

  /** An invader wave reaches a castle. */
  function arrive(s, m, T, ev) {
    const w = W(s);
    if (!w.inv || w.inv.done || m.inv !== w.inv.id) return;
    const K = KINDS[m.inv];
    if (m.target.type === 'kingdom') {
      const k = w.kingdoms.find(x => x.id === m.target.id); if (!k) return;
      const att = Object.keys(m.army).reduce((a, u) => a + m.army[u] * ePow(u), 0), def = CH.World.aiDefPower(k);
      const kills = Math.round(count(m.army) * U.clamp(def / Math.max(1, att) * 0.6, 0.1, 1));
      addKills(s, k.id, kills);
      if (def < att) k.burn = T + 4 * MIN; else k.smoke = T + 3 * MIN;
      return;
    }
    // Your castle: a real battle on your base. Your troops cannot die here.
    const cl = CH.State.castleLevel(s);
    const busy = CH.World.busyHeroes(s);
    const hId = s.defenseHero && s.heroes[s.defenseHero] && s.heroes[s.defenseHero].unlocked && !busy.has(s.defenseHero) ? s.defenseHero : null;
    const hero = hId ? { id: hId, level: s.heroes[hId].level, skin: CH.State.heroSkin(s, hId), might: CH.Meta.might(s, hId, 'def') } : null;
    const cfg = CH.Siege.build({
      attacker: { name: K.foe + ' (wave ' + w.inv.wave + ')', monsters: m.army, monsterMult: 1.2 + 0.05 * w.inv.wave },
      defender: { name: s.player.name, kind: 'player', cl, homeTerrain: true, layout: s.buildings.filter(b => b.level > 0).map(b => ({ type: b.type, level: b.level, tx: b.tx, ty: b.ty })), army: { ...s.army }, heroes: hero ? [hero] : [], hero, research: s.research.troops, fortBonus: 0.06 * (s.research.techs.fortification || 0) },
      formation: 'surround', dir: { x: w.px - m.fx, y: w.py - m.fy }, seed: (T % 1e9) | 0, playerSide: 'def',
    });
    cfg.castleSkin = s.equipped ? s.equipped.castle : null;
    cfg.names = { atk: K.foe, def: s.player.name };
    const r = CH.Siege.run(cfg), kills = count(r.atk.lost);
    addKills(s, 'player', kills);
    if (r.outcome === 'win') w.pburn = T + 4 * MIN; else w.psmoke = T + 3 * MIN;
    const rep = CH.World.addReport(s, { t: T, kind: 'invasion', you: 'def', outcome: r.outcome === 'loss' ? 'win' : 'partial',
      title: K.icon + ' ' + K.foe + ' wave ' + w.inv.wave + ': you slew ' + U.fmt(kills), atk: { name: K.foe, sent: r.atk.sent, lost: r.atk.lost }, def: { name: s.player.name, sent: r.def.sent, lost: {} },
      noDeaths: true, destruction: r.destruction, dmg: r.dmg, time: Math.round(r.time), replay: cfg, coords: [m.fx, m.fy] });
    ev.push({ kind: 'report', report: rep });
  }

  /** You attack a mothership / portal. No losses; the ship's guard scales with your army. */
  function attackShip(s, m, T, ev) {
    const w = W(s), back = () => w.marches.push({ id: 'm' + w.nextId++, owner: 'player', kind: 'return', fx: m.tx, fy: m.ty, tx: w.px, ty: w.py, t0: T, t1: T + Math.max(10000, m.t1 - m.t0), army: m.army, hero: m.hero, cargo: {}, target: { type: 'home' } });
    if (!active(w, T)) { back(); return; }
    const K = KINDS[w.inv.id];
    const hero = m.hero ? { id: m.hero, level: s.heroes[m.hero].level, skin: CH.State.heroSkin(s, m.hero), might: CH.Meta.might(s, m.hero) } : null;
    const cfg = CH.Siege.build({
      attacker: { name: s.player.name, army: m.army, hero, research: s.research.troops },
      defender: { name: K.name + ' ' + (K.ship === 'saucer' ? 'Mothership' : 'Hell Portal'), kind: 'camp', cl: 6, layout: [{ type: 'outpost', level: 8, tx: 14, ty: 10 }], monsters: horde(w.inv.id, CH.World.armyPower(m.army) * 1.0, true), monsterMult: 1.25, heroes: [] },
      formation: m.formation || 'surround', dir: { x: m.tx - m.fx, y: m.ty - m.fy }, seed: (T % 1e9) | 0, playerSide: 'atk',
    });
    const r = CH.Siege.run(cfg), kills = count(r.def.lost);
    addKills(s, 'player', kills);
    back();
    const rep = CH.World.addReport(s, { t: T, kind: 'invasion', you: 'atk', outcome: r.outcome, title: K.icon + ' Assault on the ' + cfg.names.def + ': ' + U.fmt(kills) + ' slain',
      atk: { name: s.player.name, sent: r.atk.sent, lost: {}, hero: m.hero }, def: { name: cfg.names.def, sent: r.def.sent, lost: r.def.lost }, noDeaths: true, time: Math.round(r.time), replay: cfg, coords: [m.tx, m.ty] });
    ev.push({ kind: 'report', report: rep });
  }

  function ranking(s) {
    const w = W(s), inv = w.inv || w.invLast; if (!inv) return [];
    return Object.entries(inv.kills).map(([k, n]) => ({ key: k, name: CH.Throne.keyName(s, k), kills: n })).sort((a, b) => b.kills - a.kills);
  }
  const rewardFor = (kills, rank) => {
    const rw = { gems: Math.min(1500, Math.floor(kills / 8)), gold: kills * 20, food: kills * 20, mats: { crystal: Math.floor(kills / 150), iron: Math.floor(kills / 20), dragonscale: kills >= 3000 ? 2 : 0 } };
    if (rank === 1) rw.gems += 500; else if (rank <= 3) rw.gems += 250; else if (rank <= 10) rw.gems += 100;
    return rw;
  };
  function finish(s, T, ev) {
    const w = W(s), inv = w.inv, K = KINDS[inv.id];
    inv.done = true;
    w.marches = w.marches.filter(m => m.kind !== 'invade');
    const rk = ranking(s), mine = rk.findIndex(r => r.key === 'player'), kills = inv.kills.player || 0;
    const rw = rewardFor(kills, mine + 1 || 99);
    CH.Meta.give(s, rw);
    w.news.unshift({ t: T, text: K.icon + ' The ' + K.name + ' is over! Top slayers: ' + rk.slice(0, 3).map((r, i) => (i + 1) + '. ' + r.name + ' (' + U.fmt(r.kills) + ')').join(', '), kind: 'event' });
    const rep = CH.World.addReport(s, { t: T, kind: 'event', outcome: 'win', title: K.icon + ' ' + K.name + ' over: you slew ' + U.fmt(kills) + (mine >= 0 ? ' (rank ' + (mine + 1) + ' of ' + rk.length + ')' : ''), reward: { gems: rw.gems, gold: rw.gold, food: rw.food }, items: {} });
    ev.push({ kind: 'report', report: rep, alert: true });
    w.invLast = { id: inv.id, kills: inv.kills, end: T };
    w.inv = null;
  }

  return { KINDS, start, update, arrive, attackShip, ranking, rewardFor, horde, active, WAVE_EVERY };
})();
