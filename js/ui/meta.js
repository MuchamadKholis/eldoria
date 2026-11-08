/* =====================================================================
 * Eldoria — ui/meta.js
 * Screens for daily quests & login, achievements & titles, season pass,
 * arena, hero forge & talents. Registered into CH.Screens.
 * ===================================================================== */
(function () {
  const UI = CH.UI, S = CH.State, M = CH.Meta, U = CH.util, icon = UI.icon, esc = UI.esc;
  const save = () => CH.App.save, persist = () => CH.App.persist();
  const fail = r => { UI.toast(r.reason || 'Not possible', 'warn'); CH.Audio.play('error'); };
  const rwHtml = rw => UI.reward({ gold: rw.gold, wood: rw.wood, stone: rw.stone, food: rw.food, gems: rw.gems }) +
    Object.entries(rw.items || {}).map(([i, n]) => '<span class="chip">' + n + '× ' + CH.ITEMS[i].name + '</span>').join('') +
    Object.entries(rw.mats || {}).filter(([, n]) => n).map(([k, n]) => '<span class="chip mat-' + k + '">' + n + '× ' + M.MATS[k] + '</span>').join('') +
    (rw.skins || []).map(k => '<span class="chip">Skin: ' + CH.SKINS[k.split(':')[1]].name + '</span>').join('');
  const bar = (p, n) => '<div class="bar"><i style="width:' + Math.min(100, Math.round(p / Math.max(1, n) * 100)) + '%"></i></div>';
  const got = (rw, what) => { CH.Audio.play('victory'); persist(); CH.Home.refreshHud(true); UI.toast('🎁 ' + what, 'good'); UI.refreshSheet(); };

  function daily(tab) {
    const s = save(), m = M.refresh(s); tab = tab || daily.tab || 'quests'; daily.tab = tab;
    let html;
    if (tab === 'quests') {
      const c = S.castleLevel(s), q = m.daily.q.map(q => { const d = M.QUESTS.find(x => x.id === q.id); return '<div class="b-row"><div class="b-info"><b>' + d.text.replace('{n}', U.fmt(q.n)) + '</b>' + bar(q.p, q.n) + '<span class="muted">' + U.fmt(q.p) + ' / ' + U.fmt(q.n) + '</span></div>' +
        (q.done ? '<span class="good">✓ Claimed</span>' : '<button class="btn' + (q.p >= q.n ? ' btn-gold' : '') + '" data-act="q" data-id="' + q.id + '"' + (q.p >= q.n ? '' : ' disabled') + '>' + UI.reward({ gems: 15, gold: 1500 * c }) + '</button>') + '</div>'; }).join('');
      const all = m.daily.q.every(x => x.done);
      html = '<p class="lead">Five new quests every day at midnight. Finish all five for a bonus chest. Quests also give Season Pass XP.</p><div class="b-list">' + q + '</div>' +
        '<div class="panel army-sum"><span>🎁 Bonus chest: ' + rwHtml({ gems: 60, items: { speed1h: 1 }, mats: { iron: 10, leather: 10, crystal: 2 } }) + '</span>' + (m.daily.bonus ? '<span class="good">✓ Claimed</span>' : '<button class="btn btn-gold" data-act="bonus"' + (all ? '' : ' disabled') + '>Open</button>') + '</div>';
    } else {
      const st = M.loginState(s);
      html = '<p class="lead">Log in every day. The 7th day pays the most; missing a day restarts the streak. Current streak: <b>' + st.streak + '</b> day(s).</p><div class="login-grid">' +
        M.LOGIN.map((rw, i) => { const d = i + 1, done = st.can ? d < st.day : d <= st.day, today = st.can && d === st.day;
          return '<div class="panel login-day' + (today ? ' today' : '') + (done ? ' done' : '') + '"><b>Day ' + d + '</b><div class="chips">' + rwHtml(rw) + '</div>' + (today ? '<button class="btn btn-gold" data-act="login">Claim</button>' : done ? '<span class="good">✓</span>' : '') + '</div>'; }).join('') + '</div>';
    }
    return {
      title: 'Daily',
      html: '<div class="tabs"><button class="tab' + (tab === 'quests' ? ' on' : '') + '" data-act="tab" data-t="quests">Quests</button><button class="tab' + (tab === 'login' ? ' on' : '') + '" data-act="tab" data-t="login">Login rewards' + (M.loginState(s).can ? ' ●' : '') + '</button></div>' + html,
      on: {
        tab: b => UI.sheet('daily', b.dataset.t, false),
        q: b => { const r = M.claimQuest(s, b.dataset.id); if (!r.ok) return fail(r); got(r.rw, 'Quest reward claimed'); },
        bonus: () => { const r = M.claimDailyBonus(s); if (!r.ok) return fail(r); got(r.rw, 'Bonus chest opened!'); },
        login: () => { const r = M.claimLogin(s); if (!r.ok) return fail(r); got(r.rw, 'Day ' + r.day + ' reward claimed!'); },
      },
    };
  }

  function achievements() {
    const s = save(), m = M.ensure(s);
    const rows = M.ACH.map(a => '<div class="b-row' + (m.ach[a.id] ? '' : ' locked') + '"><span class="rep-ico">' + (m.ach[a.id] ? '🏆' : '🔒') + '</span><div class="b-info"><b>' + a.name + '</b><span class="muted">' + a.desc + ' · title «' + a.title + '» · ' + a.gems + ' gems</span></div>' +
      (m.ach[a.id] ? (m.title === a.id ? '<span class="good">Worn</span>' : '<button class="btn" data-act="wear" data-id="' + a.id + '">Wear title</button>') : '') + '</div>').join('');
    return {
      title: 'Achievements',
      html: '<p class="lead">' + Object.keys(m.ach).length + ' of ' + M.ACH.length + ' unlocked. Your title appears next to your name on the world map and in the rankings.' + (m.title ? ' Current title: <b>«' + M.titleOf(s) + '»</b> <button class="btn btn-quiet" data-act="wear" data-id="">Remove</button>' : '') + '</p><div class="b-list">' + rows + '</div>',
      on: { wear: b => { M.setTitle(s, b.dataset.id); persist(); UI.refreshSheet(); } },
    };
  }

  function season() {
    const s = save(), m = M.refresh(s), se = m.season, L = M.seasonLevel(s), now = Date.now();
    const rows = []; for (let i = 1; i <= M.SEASON_LV; i++) {
      const fr = M.seasonFree(i), pr = M.seasonPrem(i), reached = i <= L;
      rows.push('<div class="season-row' + (reached ? ' reached' : '') + '"><b class="lv">' + i + '</b>' +
        '<div class="season-cell"><div class="chips">' + rwHtml(fr) + '</div>' + (reached ? (se.free.includes(i) ? '<span class="good">✓</span>' : '<button class="btn btn-gold" data-act="claim" data-l="' + i + '">Claim</button>') : '') + '</div>' +
        '<div class="season-cell prem"><div class="chips">' + rwHtml(pr) + '</div>' + (reached && se.prem ? (se.paid.includes(i) ? '<span class="good">✓</span>' : '<button class="btn btn-gem" data-act="claimP" data-l="' + i + '">Claim</button>') : '') + '</div></div>');
    }
    return {
      title: 'Season Pass',
      html: '<div class="panel army-sum"><span>Season ' + (se.id + 1) + ' · ends in ' + U.time((M.seasonEnds(now) - now) / 1000) + '</span><span><b>Level ' + L + '</b> / ' + M.SEASON_LV + '</span><span style="flex:1;min-width:140px">' + bar(se.xp % M.LV_XP, M.LV_XP) + U.fmt(se.xp % M.LV_XP) + ' / ' + M.LV_XP + ' XP</span>' +
        (se.prem ? '<span class="good">Premium unlocked</span>' : '<button class="btn btn-gem" data-act="prem">Unlock Premium · ' + icon('gems') + M.PREMIUM_PRICE + '</button>') + '</div>' +
        '<p class="muted">Earn XP from daily quests, raids, monster camps, defenses, arena wins, kills and invasions. Premium adds a second reward track with skins at levels 15 and 30.</p>' +
        '<div class="season-head"><span></span><b>Free</b><b>Premium</b></div><div class="season">' + rows.join('') + '</div>',
      on: {
        claim: b => { const r = M.claimSeason(s, +b.dataset.l, false); if (!r.ok) return fail(r); got(r.rw, 'Season reward claimed'); },
        claimP: b => { const r = M.claimSeason(s, +b.dataset.l, true); if (!r.ok) return fail(r); got(r.rw, 'Premium reward claimed'); },
        prem: () => { const r = M.buyPremium(s); if (!r.ok) return fail(r); got({}, 'Premium pass unlocked!'); },
      },
    };
  }

  function arena() {
    const s = save(), m = M.refresh(s), a = m.arena, now = Date.now(), heroes = CH.HERO_ORDER.filter(h => s.heroes[h].unlocked);
    arena.hero = arena.hero !== undefined ? arena.hero : heroes[0];
    const ladder = M.ARENA_NAMES.map((n, i) => '<div class="rank-row' + (i === a.round ? ' me' : '') + '"><span class="rk">' + (i < a.round ? '✓' : i + 1) + '</span><b>' + n + '</b><span class="muted">~' + U.fmt(CH.World.armyPower(M.arenaArmy(i))) + ' power</span><span class="rv">' + UI.reward({ gems: M.arenaReward(i + 1).gems }) + '</span></div>').join('');
    return {
      title: 'Arena',
      html: '<p class="lead">Eight champions every week (new ones on Monday). Your whole home army fights, but <b>troops never die in the arena</b>. Lose and your troops rest for 5 minutes.</p>' +
        '<div class="panel army-sum"><span>Your army: ' + U.fmt(S.armySize(s)) + ' troops · power ' + U.fmt(CH.World.armyPower(s.army)) + '</span><span>Hero: ' + ['', ...heroes].map(h => '<button class="tab' + ((arena.hero || '') === h ? ' on' : '') + '" data-act="hero" data-h="' + h + '">' + (h ? CH.HEROES[h].name : 'None') + '</button>').join('') + '</span></div>' +
        (a.round >= 8 ? '<p class="good">🏆 You are this week\'s Arena Champion!</p>' : a.cd > now ? '<p class="warn">Troops resting: ' + U.time((a.cd - now) / 1000) + '</p>' : '<button class="btn btn-gold btn-lg" data-act="fight">⚔ Fight ' + M.ARENA_NAMES[a.round] + '</button>') +
        '<div class="ranks">' + ladder + '</div>',
      on: {
        hero: b => { arena.hero = b.dataset.h || null; UI.refreshSheet(); },
        fight: () => { const r = M.arenaFight(s, arena.hero); if (!r.ok) return fail(r); persist(); CH.Audio.play(r.won ? 'victory' : 'defeat'); UI.refreshSheet(); CH.WorldUI.showReport(r.report); },
      },
    };
  }

  function forge(hero) {
    const s = save(); M.ensure(s);
    hero = hero || forge.hero || 'aldric'; forge.hero = hero;
    const H = s.heroes[hero], d = CH.HEROES[hero], tp = M.talentPoints(s, hero);
    const slots = ['weapon', 'armor', 'trinket'].map(sl => { const it = s.gear.find(g => g.id === H.gear[sl]); const t = it && M.TIERS[it.tier];
      return '<div class="panel gear-slot"><span class="kicker">' + sl + '</span>' + (it ? '<b style="color:' + t.color + '">' + it.name + '</b><span class="muted">' + t.name + ' · +' + t.might + '% might</span><button class="btn btn-quiet" data-act="off" data-sl="' + sl + '">Unequip</button>' : '<span class="muted">Empty</span>') + '</div>'; }).join('');
    const inv = s.gear.filter(g => !CH.HERO_ORDER.some(h => Object.values(s.heroes[h].gear || {}).includes(g.id))).sort((a, b) => b.tier - a.tier)
      .map(g => '<span class="gear-pair"><button class="chip gear-item" data-act="eq" data-id="' + g.id + '" style="border-color:' + M.TIERS[g.tier].color + '">' + g.name + ' <i>' + g.slot + ' +' + M.TIERS[g.tier].might + '%</i></button><button class="btn btn-quiet" data-act="smelt" data-id="' + g.id + '" title="Smelt into Iron Ore">🔥 ' + Math.floor(M.TIERS[g.tier].cost.iron * 0.6) + ' ore</button></span>').join('') || '<span class="muted">No spare gear. Forge some below.</span>';
    const recipes = M.TIERS.map((t, i) => '<div class="b-row"><div class="b-info"><b style="color:' + t.color + '">' + t.name + '</b><span class="muted">+' + t.might + '% might · Hero Hall ' + t.hall + ' · ' +
      Object.entries(t.cost).map(([k, n]) => (k === 'gold' ? U.fmt(n) + ' gold' : n + ' ' + M.MATS[k])).join(', ') + '</span></div><div class="row">' + ['weapon', 'armor', 'trinket'].map(sl => '<button class="btn" data-act="craft" data-sl="' + sl + '" data-t="' + i + '">' + sl + '</button>').join('') + '</div></div>').join('');
    const tal = Object.entries(M.TALENTS).map(([k, t]) => '<div class="b-row"><div class="b-info"><b>' + t.name + ' ' + H.tal[k] + '/10</b><span class="muted">' + t.desc + '</span></div><button class="btn" data-act="tal" data-b="' + k + '"' + (tp > 0 && H.tal[k] < 10 ? '' : ' disabled') + '>+1</button></div>').join('');
    return {
      title: 'Forge & Talents',
      html: '<div class="tabs">' + CH.HERO_ORDER.map(h => '<button class="tab' + (h === hero ? ' on' : '') + '" data-act="hero" data-h="' + h + '">' + CH.HEROES[h].name + '</button>').join('') + '</div>' +
        '<div class="panel army-sum"><span><b>' + d.name + '</b> level ' + H.level + (H.unlocked ? '' : ' (not recruited)') + '</span><span>Might: <b>+' + M.might(s, hero) + '%</b> attack & health for the army ' + d.name + ' leads</span><span>Materials: ' + Object.entries(M.MATS).map(([k, n]) => n + ' ' + U.fmt(s.mats[k] || 0)).join(' · ') + '</span></div>' +
        '<h4 class="group">Equipped</h4><div class="k-grid">' + slots + '</div><h4 class="group">Spare gear (tap to equip on ' + d.name + ')</h4><div class="chips">' + inv + '</div>' +
        '<h4 class="group">Talents · ' + tp + ' point(s) free</h4><div class="b-list">' + tal + '</div><button class="btn btn-quiet" data-act="reset">Reset talents (free)</button>' +
        '<h4 class="group">Buy materials</h4><div class="row">' + Object.entries(CH.GEM_SHOP.mats).map(([k, o]) => '<button class="btn btn-gem" data-act="buymat" data-k="' + k + '">+' + o.n + ' ' + M.MATS[k] + ' · 💎' + o.gems + '</button>').join('') + '</div>' +
        '<h4 class="group">Forge</h4><p class="muted">Materials drop from monster camps, ruins, the Elder Dragon, invasions, the arena, daily quests and the season pass.</p><div class="b-list">' + recipes + '</div>',
      on: {
        hero: b => UI.sheet('forge', b.dataset.h, false),
        craft: b => { const r = M.craft(s, b.dataset.sl, +b.dataset.t); if (!r.ok) return fail(r); M.equip(s, hero, r.item.id); CH.Audio.play('upgrade'); persist(); UI.toast('Forged ' + r.item.name + ' and equipped it on ' + d.name, 'good'); UI.refreshSheet(); },
        eq: b => { M.equip(s, hero, b.dataset.id); persist(); UI.refreshSheet(); },
        smelt: b => { const r = M.smelt(s, b.dataset.id); if (!r.ok) return fail(r); CH.Audio.play('cannon'); persist(); UI.toast('Smelted into ' + r.got.iron + ' Iron Ore' + (r.got.crystal ? ' and ' + r.got.crystal + ' Arcane Crystal' : ''), 'good'); UI.refreshSheet(); },
        buymat: b => { const r = M.buyMat(s, b.dataset.k); if (!r.ok) return fail(r); persist(); UI.toast('+' + r.n + ' ' + M.MATS[b.dataset.k], 'good'); UI.refreshSheet(); },
        off: b => { M.unequip(s, hero, b.dataset.sl); persist(); UI.refreshSheet(); },
        tal: b => { if (M.addTalent(s, hero, b.dataset.b)) { persist(); UI.refreshSheet(); } },
        reset: () => { M.resetTalents(s, hero); persist(); UI.refreshSheet(); },
      },
    };
  }

  function realms(id) {
    const s = save(), now = Date.now(), Rm = CH.Realm, rs = Rm.ensure(s.world);
    id = id || realms.id || CH.REALM_ORDER.find(x => Rm.window(x, now).active) || 'alien'; realms.id = id;
    const R = CH.REALMS[id], win = Rm.window(id, now), r = rs[id], ru = Rm.ruler(s, id, now);
    const heroes = CH.HERO_ORDER.filter(h => s.heroes[h].unlocked); realms.hero = realms.hero !== undefined ? realms.hero : heroes[0];
    const stage = win.active && r.win === win.start ? r.stage : 0;
    const ladder = Rm.STAGES.map((st, i) => '<div class="rank-row' + (i === stage && win.active ? ' me' : '') + '"><span class="rk">' + (win.active && i < stage ? '✓' : i + 1) + '</span><b>' + (st.citadel ? '🏰 ' : '') + st.name + '</b><span class="muted">~' + U.fmt(Object.entries(Rm.stageArmy(s, id, i)).reduce((a, [u, n]) => a + n, 0)) + ' foes</span><span class="rv">' + UI.reward({ gems: Rm.stageReward(i).gems }) + '</span></div>').join('');
    const emperor = CH.REALM_ORDER.map(x => { const q = Rm.ruler(s, x, now); return CH.REALMS[x].icon + ' ' + CH.REALMS[x].name + ': ' + (q ? (q.key === 'player' ? '<b class="good">you</b>' : esc(CH.Throne.keyName(s, q.key))) : 'nobody'); }).join(' · ') + ' · 👑 Eldoria: ' + (CH.Throne.kingName(s) ? (CH.Throne.isPlayerKing(s) ? '<b class="good">you</b>' : esc(CH.Throne.kingName(s))) : 'nobody');
    return {
      title: 'Realm Conquest',
      html: '<div class="tabs">' + CH.REALM_ORDER.map(x => '<button class="tab' + (x === id ? ' on' : '') + '" data-act="realm" data-id="' + x + '">' + CH.REALMS[x].icon + ' ' + CH.REALMS[x].name + (Rm.window(x, now).active ? ' ●' : '') + '</button>').join('') + '</div>' +
        '<div class="panel ev-now realm-' + id + '"><span class="kicker">' + (win.active ? 'PORTAL OPEN · closes in ' + U.time((win.end - now) / 1000) : 'Portal opens ' + Rm.label(id) + ' · in ' + U.time(((win.start > now ? win.start : win.next) - now) / 1000)) + '</span><h3>' + R.icon + ' ' + R.full + '</h3>' +
        '<p>Ruler this week: <b>' + (ru ? esc(CH.Throne.keyName(s, ru.key)) : 'nobody') + '</b>. Ruler\'s title «' + R.title + '»: ' + CH.Throne.fmtBuffs(R.buffs) + '.</p>' +
        '<p class="muted">Fight through three gates and storm the citadel. Your whole home army fights; <b>the fallen return home after 5 minutes</b>. Lose and your army regroups for 3 minutes.</p></div>' +
        (win.active ? (stage >= 4 ? '<p class="good">👑 You rule ' + R.name + ' this week!</p>' : r.cd > now ? '<p class="warn">Regrouping: ' + U.time((r.cd - now) / 1000) + '</p>' :
          '<div class="panel army-sum"><span>Army ' + U.fmt(S.armySize(s)) + ' · power ' + U.fmt(CH.World.armyPower(s.army)) + '</span><span>Hero: ' + ['', ...heroes].map(h => '<button class="tab' + ((realms.hero || '') === h ? ' on' : '') + '" data-act="hero" data-h="' + h + '">' + (h ? CH.HEROES[h].name : 'None') + '</button>').join('') + '</span></div><button class="btn btn-gold btn-lg" data-act="fight">⚔ Enter the portal: ' + Rm.STAGES[stage].name + '</button>') : '') +
        '<div class="ranks">' + ladder + '</div>' +
        '<h4 class="group">🌌 Emperor of the Four Worlds</h4><p class="muted">Be King of Eldoria and ruler of all three realms at the same time for the title «Emperor of the Four Worlds» and 2,000 gems.</p><p>' + emperor + '</p>',
      on: {
        realm: b => UI.sheet('realms', b.dataset.id, false),
        hero: b => { realms.hero = b.dataset.h || null; UI.refreshSheet(); },
        fight: () => { const r = Rm.fight(s, id, realms.hero); if (!r.ok) return fail(r); persist(); CH.Audio.play(r.won ? 'victory' : 'defeat'); UI.refreshSheet(); CH.WorldUI.showReport(r.report); },
      },
    };
  }

  /** Everything coming up, with times: rotating world events, Throne War and realm portals. */
  function schedule(s, now = Date.now(), n = 8) {
    const w = s.world, out = [], cyc = 40 * 60000, len = 30 * 60000;
    const e = CH.World.eventAt(w, now);
    for (let i = e.active ? 1 : 0, k = 0; k < n; i++, k++) { const idx = e.idx + i, ev = CH.EVENTS[((idx % CH.EVENTS.length) + CH.EVENTS.length) % CH.EVENTS.length]; const st = w.epoch + idx * cyc; if (st > now) out.push({ t: st, end: st + len, name: ev.name, desc: ev.desc }); }
    const tw = CH.Throne.warWindow(now); out.push({ t: tw.start > now ? tw.start : tw.next, name: '👑 Throne War', desc: 'Seize the Aurelion Citadel (' + CH.Throne.warLabel() + ')' });
    for (const id of CH.REALM_ORDER) { const rw = CH.Realm.window(id, now); out.push({ t: rw.start > now ? rw.start : rw.next, name: CH.REALMS[id].icon + ' Portal to ' + CH.REALMS[id].name, desc: 'Realm Conquest (' + CH.Realm.label(id) + ')' }); }
    return out.sort((a, b) => a.t - b.t);
  }

  Object.assign(CH.Screens, { daily, achievements, season, arena, forge, realms });
  CH.MetaUI = { schedule };
})();
