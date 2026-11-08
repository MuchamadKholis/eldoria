/* =====================================================================
 * Eldoria — core/realm.js
 * Realm Conquest: three times a week a portal opens to another world
 * (alien Xyrrath, hellish Infernum, heavenly Elysium). Fight through
 * three gates and storm the realm's citadel to rule that world for a
 * week. Rule Eldoria and all three realms at once: Emperor of the Four
 * Worlds. Fallen troops return after 5 minutes, like the Throne War.
 * ===================================================================== */
CH.REALMS = {
  /* ===== REALM SCHEDULE (edit here) — day: 0 Sunday … 6 Saturday, hour 0–23, minute, minutes open ===== */
  alien: { name: 'Xyrrath', full: 'Xyrrath, the Alien World', icon: '👽', day: 2, hour: 20, minute: 0, minutes: 60, color: '#5fffa0',
    units: ['alienDrone', 'alienTrooper', 'alienBrute'], boss: 'alienOverlord', title: 'Conqueror of Xyrrath', buffs: { march: 0.10, atk: 0.05 } },
  hell: { name: 'Infernum', full: 'Infernum, the Burning Realm', icon: '🔥', day: 4, hour: 20, minute: 0, minutes: 60, color: '#ff6a3a',
    units: ['imp', 'darkKnight', 'ogre'], boss: 'demonLord', title: 'Lord of Infernum', buffs: { atk: 0.10 } },
  heaven: { name: 'Elysium', full: 'Elysium, the Celestial Realm', icon: '✨', day: 0, hour: 20, minute: 0, minutes: 60, color: '#ffe9a0',
    units: ['seraph', 'celestialKnight', 'valkyrie'], boss: 'archangel', title: 'Sovereign of Elysium', buffs: { def: 0.10, research: 0.10 } },
};
CH.REALM_ORDER = ['alien', 'hell', 'heaven'];
CH.Realm = (function () {
  const U = CH.util, MIN = 60000, DAY = 864e5;
  const STAGES = [
    { name: 'Outer Gate', mult: 0.55 }, { name: 'Legion Camp', mult: 0.7 }, { name: 'Inner Sanctum', mult: 0.85 }, { name: 'Realm Citadel', mult: 1.0, citadel: true },
  ];
  const W = s => s.world;
  function window_(id, T) {
    const R = CH.REALMS[id], d = new Date(T);
    let st = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() - R.day + 7) % 7), R.hour, R.minute || 0).getTime();
    if (st > T) st = new Date(new Date(st).getFullYear(), new Date(st).getMonth(), new Date(st).getDate() - 7, R.hour, R.minute || 0).getTime();
    const next = new Date(new Date(st).getFullYear(), new Date(st).getMonth(), new Date(st).getDate() + 7, R.hour, R.minute || 0).getTime();
    return { start: st, end: st + R.minutes * MIN, next, active: T >= st && T < st + R.minutes * MIN };
  }
  const label = id => { const R = CH.REALMS[id]; return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][R.day] + ' ' + String(R.hour).padStart(2, '0') + ':' + String(R.minute || 0).padStart(2, '0'); };
  function ensure(w) { w.realms = w.realms || {}; for (const id of CH.REALM_ORDER) w.realms[id] = w.realms[id] || { win: 0, stage: 0, cd: 0, ruler: null, history: [] }; return w.realms; }
  const ruler = (s, id, T = Date.now()) => { const r = ensure(W(s))[id]; return r.ruler && r.ruler.until > T ? r.ruler : null; };
  function rulerBuffs(s, key) { const out = {}; if (!W(s)) return out; for (const id of CH.REALM_ORDER) { const r = ruler(s, id); if (r && r.key === key) for (const b in CH.REALMS[id].buffs) out[b] = (out[b] || 0) + CH.REALMS[id].buffs[b]; } return out; }
  const ePow = id => { const e = CH.ENEMIES[id]; return Math.max(1, Math.sqrt(e.hp / (1 - (e.armor || 0)) * e.dmg * e.rate) / 3); };

  /** Enemy strength scales with the strongest armies around so the realms stay hard. */
  function stageArmy(s, id, i) {
    const R = CH.REALMS[id], w = W(s);
    const top = w.kingdoms.map(k => CH.World.armyPower(k.tr)).sort((a, b) => b - a).slice(0, 5);
    // Strong but beatable: tied to the world's strongest armies, and never trivial for you.
    const base = Math.max(CH.World.armyPower(s.army) * 0.75, top.reduce((a, n) => a + n, 0) / Math.max(1, top.length) * 0.8, 6000);
    const p = base * STAGES[i].mult, a = {}, share = [0.45, 0.35, 0.2];
    R.units.forEach((u, k) => { a[u] = Math.max(1, Math.round(p * share[k] / ePow(u))); });
    if (STAGES[i].citadel && CH.ENEMIES[R.boss]) a[R.boss] = Math.min(3, 1 + Math.floor(base / 250000));
    return a;
  }
  function stageReward(i) { return i === 3 ? { gems: 800, mats: { crystal: 20, dragonscale: 5 }, items: { shield8h: 1, speed1h: 3 } } : { gems: 80 + i * 60, mats: { iron: 20 + i * 15, leather: 20 + i * 15, crystal: 2 + i * 3 } }; }

  function update(s, T, ev) {
    const w = W(s), rs = ensure(w);
    for (const id of CH.REALM_ORDER) {
      const r = rs[id], win = window_(id, T);
      if (win.active && r.win !== win.start) {
        r.win = win.start; r.stage = 0; r.cd = 0; r.closed = false;
        w.news.unshift({ t: T, text: CH.REALMS[id].icon + ' A portal to ' + CH.REALMS[id].full + ' has opened for ' + CH.REALMS[id].minutes + ' minutes! Storm its citadel to rule that world for a week.', kind: 'event' });
        ev.push({ kind: 'realmOpen', id });
      }
      if (r.win && !r.closed && T >= r.win + CH.REALMS[id].minutes * MIN) {
        r.closed = true;
        if (!(r.ruler && r.ruler.key === 'player' && r.ruler.since >= r.win)) {
          // The strongest AI kingdom claims the realm if you didn't.
          const champ = w.kingdoms.slice().sort((a, b) => CH.World.power(b) - CH.World.power(a))[0];
          r.ruler = { key: champ.id, since: T, until: window_(id, T).next };
          w.news.unshift({ t: T, text: CH.REALMS[id].icon + ' ' + champ.name + ' conquered ' + CH.REALMS[id].name + ' and rules it this week.', kind: 'event' });
        }
      }
    }
    checkEmperor(s, T, ev);
  }

  /** Fight the next stage. Your whole home army fights; the fallen return in 5 minutes. */
  function fight(s, id, heroId, T = Date.now()) {
    const w = W(s), r = ensure(w)[id], R = CH.REALMS[id], win = window_(id, T);
    if (!win.active) return { ok: false, reason: 'The portal to ' + R.name + ' opens ' + label(id) };
    if (r.win !== win.start) { r.win = win.start; r.stage = 0; r.cd = 0; }
    if (r.stage >= 4) return { ok: false, reason: 'You already rule ' + R.name + ' this week' };
    if (r.cd > T) return { ok: false, reason: 'Your army regroups: ' + U.time((r.cd - T) / 1000) };
    const army = {}; for (const t in s.army) if (s.army[t] > 0) army[t] = s.army[t];
    if (!Object.keys(army).length) return { ok: false, reason: 'You need troops at home' };
    const i = r.stage, ST = STAGES[i];
    const hero = heroId && s.heroes[heroId] && s.heroes[heroId].unlocked ? { id: heroId, level: s.heroes[heroId].level, skin: CH.State.heroSkin(s, heroId), might: CH.Meta.might(s, heroId) } : null;
    const cfg = CH.Siege.build({
      attacker: { name: s.player.name, army, hero, research: s.research.troops, atkBonus: 0.03 * (s.research.techs.warfare || 0) + CH.Throne.buffs(s).atk },
      defender: { name: R.name + ' · ' + ST.name, kind: 'camp', cl: ST.citadel ? 6 : 5, layout: ST.citadel ? CH.Throne.layout() : [{ type: 'outpost', level: 6 + i, tx: 14, ty: 10 }], monsters: stageArmy(s, id, i), monsterMult: 1.05 + 0.07 * i, heroes: [] },
      formation: 'surround', dir: { x: 1, y: 0.3 }, seed: (T % 1e9) | 0, playerSide: 'atk',
    });
    cfg.names = { atk: s.player.name, def: R.name + ' · ' + ST.name };
    const res = CH.Siege.run(cfg), won = res.outcome === 'win';
    // The fallen return home after 5 minutes.
    CH.Throne.reviveLater(s, 'player', res.atk.lost, T);
    for (const t in res.atk.lost) s.army[t] = Math.max(0, (s.army[t] || 0) - res.atk.lost[t]);
    const kills = Object.values(res.def.lost).reduce((a, n) => a + n, 0);
    s.stats.kills += kills; CH.Meta.track(s, 'kills', kills, T);
    let rw = null;
    if (won) {
      r.stage++; rw = stageReward(i); CH.Meta.give(s, rw);
      if (r.stage >= 4) {
        r.ruler = { key: 'player', since: T, until: win.next };
        r.history.unshift({ t: T, key: 'player' }); r.history.length = Math.min(r.history.length, 8);
        CH.Meta.track(s, 'realmWin', 1, T); CH.Meta.track(s, 'realm_' + id, 1, T);
        w.news.unshift({ t: T, text: R.icon + ' ' + s.player.name + ' stormed the citadel of ' + R.name + ' and rules ' + R.full + '!', kind: 'event' });
      }
    } else r.cd = T + 3 * MIN;
    const rep = CH.World.addReport(s, { t: T, kind: 'realm', you: 'atk', outcome: won ? 'win' : 'loss',
      title: R.icon + ' ' + R.name + ' · ' + ST.name + (won ? (r.stage >= 4 ? ': CONQUERED! You rule ' + R.name : ': cleared') : ': repelled'),
      atk: { name: s.player.name, sent: res.atk.sent, lost: res.atk.lost, hero: heroId }, def: { name: cfg.names.def, sent: res.def.sent, lost: res.def.lost },
      reward: rw ? { gems: rw.gems, mats: rw.mats } : {}, items: rw && rw.items || {}, revive: true, time: Math.round(res.time), replay: cfg });
    if (rw && rw.items) for (const it in rw.items) { /* already given by Meta.give */ }
    const ev = []; checkEmperor(s, T, ev);
    return { ok: true, won, stage: r.stage, report: rep, emperor: ev.length > 0 };
  }

  /** King of Eldoria + ruler of all three realms at the same time. */
  function checkEmperor(s, T, ev) {
    const m = CH.Meta.ensure(s), w = W(s);
    const all = CH.Throne.isPlayerKing(s) && CH.REALM_ORDER.every(id => { const r = ruler(s, id, T); return r && r.key === 'player'; });
    const week = Math.floor(T / (7 * DAY));
    if (all && m.emperorWeek !== week) {
      m.emperorWeek = week; CH.Meta.track(s, 'emperor', 1, T); CH.Meta.give(s, { gems: 2000, mats: { dragonscale: 10, crystal: 40 } });
      w.news.unshift({ t: T, text: '🌌 ' + s.player.name + ' rules Eldoria, Xyrrath, Infernum and Elysium: EMPEROR OF THE FOUR WORLDS!', kind: 'event' });
      const rep = CH.World.addReport(s, { t: T, kind: 'event', outcome: 'win', title: '🌌 You are the Emperor of the Four Worlds! +2,000 gems', reward: { gems: 2000 } });
      ev.push({ kind: 'report', report: rep, alert: true });
    }
  }
  const isEmperor = (s, T = Date.now()) => CH.Throne.isPlayerKing(s) && CH.REALM_ORDER.every(id => { const r = ruler(s, id, T); return r && r.key === 'player'; });

  return { STAGES, window: window_, label, ensure, ruler, rulerBuffs, stageArmy, stageReward, update, fight, isEmperor };
})();
