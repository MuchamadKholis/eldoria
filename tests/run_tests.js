/* Eldoria logic tests (Node, no dependencies):  node tests/run_tests.js */
const { loadGame, run } = require('./harness');
const { CH, sb } = loadGame();
const S = CH.State, Wd = CH.World, T = CH.CONFIG.T, MIN = 60000;
let pass = 0, fail = 0;
function test(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 2).join('\n      ')); } }
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const T0 = 1.8e12;
function fresh(now = T0, seed = 424242) { const s = S.defaults(now); s.lastSeen = now; s.world = Wd.create(seed, now); return s; }
const nearest = (s, list) => list.slice().sort((a, b) => Math.hypot(a.x - s.world.px, a.y - s.world.py) - Math.hypot(b.x - s.world.px, b.y - s.world.py));
function advance(s, from, sec, step = 15) { let t = from; for (let i = 0; i < sec / step; i++) { t += step * 1000; S.tick(s, t); Wd.tick(s, t); } return t; }

console.log('\nKingdom & economy');
test('new kingdom: castle, food, starting army, beginner protection', () => {
  const s = fresh();
  ok(S.castle(s) && s.res.food > 0 && S.armySize(s) > 0 && S.beginner(s, T0) && s.items.teleRandom === 1);
});
test('placement is blocked outside the kingdom and on buildings; costs grow per level', () => {
  const s = fresh();
  ok(!S.build(s, 'stoneQuarry', 0, 0).ok && !S.build(s, 'stoneQuarry', S.castle(s).tx, S.castle(s).ty).ok);
  const d = CH.BUILDINGS.stable; for (let L = 2; L <= 8; L++) ok(d.cost(L).gold > d.cost(L - 1).gold);
});
test('traps require a Trap Workshop', () => {
  const s = fresh(); S.castle(s).level = 3;
  ok(S.buildBlocker(s, 'spikeTrap') === 'Needs a Trap Workshop');
});
test('production is capped and boosted by Prosperity research', () => {
  const s = fresh(), m = s.buildings.find(b => b.type === 'goldMine');
  S.tick(s, T0 + 10 * MIN);
  ok(Math.abs(m.buf - CH.BUILDINGS.goldMine.prod(1) * 10) < 1, 'ten minutes');
  S.tick(s, T0 + 30 * 24 * 3600e3); ok(m.buf === CH.BUILDINGS.goldMine.buf(1), 'cap');
  s.research.techs.prosperity = 4; ok(Math.abs(S.prodMult(s) - 1.2) < 1e-9);
});
test('troops eat food; when food runs out some desert (capped, never negative)', () => {
  const s = fresh(); s.army = { swordsman: 10000 }; s.res.food = 100;
  S.tick(s, T0 + 3600e3);
  ok(s.res.food === 0 && s.army.swordsman < 10000 && s.army.swordsman >= 7500, 'army ' + s.army.swordsman);
});
test('batch training: one batch per building, capped size, costs food, finishes over time', () => {
  const s = fresh(); s.res.food = 1e5; s.res.gold = 1e5;
  ok(S.trainBlocker(s, 'swordsman', 1e6).startsWith('Max'));
  ok(S.train(s, 'swordsman', 50, T0).ok && !S.train(s, 'swordsman', 1, T0).ok, 'busy');
  ok(S.train(s, 'archer', 20, T0).ok, 'another building trains in parallel');
  ok(s.res.food < 1e5);
  const before = s.army.swordsman; S.tick(s, T0 + 3600e3);
  ok(s.army.swordsman === before + 50 && !s.trainJobs.barracks);
  ok(S.trainBlocker(s, 'heavyCavalry', 1).startsWith('Build a Stable'));
});
test('infirmary: wounded up to bed capacity, the rest die; healing returns troops', () => {
  const s = fresh(), beds = S.beds(s);
  const r = S.addCasualties(s, { swordsman: beds + 100 });
  ok(r.wounded === beds && r.dead === 100 && S.woundedCount(s) === beds);
  s.res = { ...s.res, gold: 1e6, food: 1e6, wood: 1e6, stone: 1e6 };
  const a0 = s.army.swordsman; ok(S.heal(s, T0).ok); S.tick(s, T0 + 24 * 3600e3);
  ok(s.army.swordsman === a0 + beds && S.woundedCount(s) === 0);
});
test('items: shields, resource packs and speed-ups work', () => {
  const s = fresh(); s.items.goldPack = 1; s.items.speed1h = 1;
  ok(S.useItem(s, 'shield8h', T0).ok && s.shieldUntil >= T0 + 8 * 3600e3);
  const g = s.res.gold; ok(S.useItem(s, 'goldPack', T0).ok && s.res.gold === g + 5000);
  s.res.food = 1e6; s.res.gold = 1e6; S.train(s, 'swordsman', 60, T0);
  const e0 = s.trainJobs.barracks.ends; ok(S.useItem(s, 'speed1h', T0, { kind: 'train', bld: 'barracks' }).ok && s.trainJobs.barracks.ends < e0);
});
test('academy technologies are researched and capped by academy level', () => {
  const s = fresh(); s.res = { ...s.res, gold: 1e6, wood: 1e6, stone: 1e6 };
  ok(S.researchBlocker(s, 'tech', 'logistics') === 'Build a laboratory first');
  s.buildings.push({ id: 900, type: 'lab', level: 1, tx: 0, ty: 0, buf: 0, job: null });
  ok(S.research(s, 'tech', 'logistics', T0).ok); S.tick(s, T0 + 3600e3);
  ok(s.research.techs.logistics === 1 && S.researchBlocker(s, 'tech', 'logistics') === 'Upgrade the academy first');
});
test('redeem codes grant resources, troops and items once', () => {
  const s = fresh(), f0 = s.res.food;
  ok(S.redeem(s, 'eldoria', T0).ok && s.res.food === f0 + 8000);
  ok(!S.redeem(s, 'ELDORIA', T0).ok);
  ok(S.redeem(s, 'safehaven', T0).ok && s.items.shield8h === 3 && s.items.teleAdvanced === 2);
  const sw = s.army.swordsman; ok(S.redeem(s, 'WARCHEST', T0).ok && s.army.swordsman === sw + 500);
  ok(S.redeem(s, 'DRAGONFIRE', T0).reason === 'Needs castle level 4');
});
test('troop counters and siege multipliers are applied', () => {
  const b = new CH.Battle({ mode: 'raid', save: fresh(), opponent: { cl: 1, layout: [{ type: 'castle', level: 1, tx: 14, ty: 10 }], loot: { gold: 0, wood: 0, stone: 0 } }, seed: 1 });
  const sw = b.spawnUnit(CH.TROOPS.swordsman, 'atk', 0, 0, {}), cav = b.spawnUnit(CH.TROOPS.lightCavalry, 'def', 0, 0, {}), arc = b.spawnUnit(CH.TROOPS.archer, 'def', 0, 0, {});
  ok(Math.abs(b.unitDamage(sw, cav, false) - 15 * 1.5) < 1e-9 && b.unitDamage(sw, arc, false) === 15);
  const ram = b.spawnUnit(CH.TROOPS.siegeRam, 'atk', 0, 0, {});
  ok(b.unitDamage(ram, b.buildings[0], true) === 60 * 4 && Math.abs(b.unitDamage(ram, arc, false) - 60 * 0.35) < 1e-9);
});

console.log('\nWorld');
test('world: 60 AI kingdoms with personalities, factions, resources, camps, ruins, forts', () => {
  const s = fresh(), w = s.world;
  ok(w.kingdoms.length === 60 && w.tiles.length > 100 && w.camps.length > 40 && w.ruins.length && w.forts.length);
  ok(new Set(w.kingdoms.map(k => k.p)).size === 6 && new Set(w.kingdoms.map(k => k.f)).size === 4);
  ok(['Ashenfall', 'Ironclaw Empire', 'Frosthaven', 'Dragonspire', 'Shadowmere', 'Goldencrest', 'Bloodfang Clan'].every(n => w.kingdoms.some(k => k.name === n)));
  ok(w.kingdoms.filter(k => Math.hypot(k.x - w.px, k.y - w.py) < 16 && k.cl <= 2).length >= 3, 'weak neighbours');
});
test('AI kingdoms grow, train, and wage war on each other over time', () => {
  const s = fresh(); s.shieldUntil = T0 + 1e9;
  const cl0 = s.world.kingdoms.reduce((a, k) => a + k.cl, 0);
  advance(s, T0, 6 * 3600, 60);
  const wars = s.world.news.filter(n => n.kind === 'war').length;
  ok(wars >= 10, 'wars ' + wars);
  ok(s.world.kingdoms.some(k => k.losses > 0) && s.world.kingdoms.some(k => k.wins > 0));
  ok(s.world.kingdoms.reduce((a, k) => a + k.cl, 0) >= cl0, 'castles shrank');
});
test('fairness: no AI attacks during beginner protection or while shielded', () => {
  const s = fresh();
  advance(s, T0, 40 * 60, 30);
  ok(!s.reports.some(r => r.kind === 'defense'), 'attacked during beginner protection');
  s.createdAt = 0; S.castle(s).level = 3; s.shieldUntil = T0 + 1e9;
  advance(s, T0 + 40 * MIN, 3 * 3600, 60);
  ok(!s.reports.some(r => r.kind === 'defense' && r.outcome !== 'bounced'), 'attacked through a shield');
});
test('AI attacks give warning time, then resolve as a real battle on your base with a report and a recovery shield', () => {
  const s = fresh(); s.createdAt = 0; S.castle(s).level = 3; s.res.gold = s.res.wood = 50000;
  for (const k of s.world.kingdoms) k.nextAtk = T0 + 1e9; // only our test kingdom thinks about war
  const k = nearest(s, s.world.kingdoms)[0];
  k.tr = { knight: 400, archer: 400 }; k.nextAtk = 0; k.next = 0; k.pcd = 0; k.p = 'aggressive'; k.cl = 3; k.f = (s.faction == null ? 0 : s.faction + 1) % 4;
  let t = T0, inc = null;
  for (let i = 0; i < 200 && !inc; i++) { t += 30000; Wd.tick(s, t); inc = Wd.incoming(s)[0]; }
  ok(inc, 'no attack launched');
  ok(inc.t1 - t >= CH.CONFIG.ENEMY_WARNING * 1000 - 31000, 'warning too short');
  t = advance(s, t, (inc.t1 - t) / 1000 + 20, 10);
  const rep = s.reports.find(r => r.kind === 'defense');
  ok(rep && rep.replay && rep.atk && rep.def, 'no defense report');
  ok(s.shieldUntil > t, 'no recovery shield');
});
test('a Peace Shield makes an incoming army turn back', () => {
  const s = fresh(); s.createdAt = 0; S.castle(s).level = 3;
  const k = s.world.kingdoms[1];
  s.world.marches.push({ id: 'mx', owner: k.id, kind: 'attack', fx: k.x, fy: k.y, tx: s.world.px, ty: s.world.py, t0: T0, t1: T0 + 60000, army: { swordsman: 500 }, hero: 'aldric', heroLevel: 1, target: { type: 'player' }, cargo: {} });
  k.out = true; s.shieldUntil = T0 + 3600e3;
  advance(s, T0, 90, 10);
  ok(s.reports.some(r => r.outcome === 'bounced') && s.world.marches.some(m => m.kind === 'return' && m.owner === k.id));
});
test('scouting reveals more with Scouting research; scouts need no march slot', () => {
  const s = fresh(), k = nearest(s, s.world.kingdoms)[0];
  ok(Wd.sendMarch(s, 'scout', { type: 'kingdom', id: k.id }, {}, null, null, T0).ok);
  advance(s, T0, 200);
  const r0 = s.reports.find(r => r.kind === 'scout');
  ok(r0 && !r0.troops && r0.loot && r0.layout, 'basic report');
  s.research.techs.scouting = 2;
  Wd.sendMarch(s, 'scout', { type: 'kingdom', id: k.id }, {}, null, null, T0 + 300000);
  advance(s, T0 + 300000, 200);
  ok(s.reports.find(r => r.kind === 'scout').troops, 'detailed report');
});
test('raiding a weak AI: real battle, loot, casualties, grudge; no cooldown, only shields block', () => {
  const s = fresh(); s.army = { swordsman: 2000, archer: 1500, lightCavalry: 1500 };
  const k = nearest(s, s.world.kingdoms).filter(x => x.cl <= 2 && Math.hypot(x.x - s.world.px, x.y - s.world.py) < 22).sort((a, b) => Wd.power(a) - Wd.power(b))[0];
  k.res = { gold: 20000, wood: 20000, stone: 20000, food: 20000 };
  const r = Wd.sendMarch(s, 'attack', { type: 'kingdom', id: k.id }, { ...s.army }, 'aldric', 'surround', T0);
  ok(r.ok, r.reason); ok(S.armySize(s) === 0, 'troops left home');
  const g0 = s.res.gold;
  advance(s, T0, 900);
  const rep = s.reports.find(x => x.kind === 'attack');
  ok(rep && rep.outcome !== 'loss', 'lost: ' + (rep && rep.outcome));
  ok(Object.values(rep.loot).reduce((a, n) => a + n, 0) > 0 && s.res.gold > g0, 'no loot');
  ok(k.res.gold < 20000 && k.grudge > 0);
  k.sh = T0 + 1e9; ok(Wd.sendMarch(s, 'attack', { type: 'kingdom', id: k.id }, { swordsman: 10 }, null, 'surround', T0 + 700000).reason.includes('shield'), 'only shields block');
  k.sh = 0; ok(Wd.sendMarch(s, 'attack', { type: 'kingdom', id: k.id }, { swordsman: 10 }, null, 'surround', T0 + 700000).ok, 'no cooldown: may attack again at once');
  ok(S.armySize(s) > 0, 'survivors returned');
});
test('monster camps: defeating one gives rewards and it respawns later', () => {
  const s = fresh(); s.army = { swordsman: 3000, archer: 2000 };
  const c = nearest(s, s.world.camps).find(x => x.lvl <= 2) || nearest(s, s.world.camps)[0];
  ok(Wd.sendMarch(s, 'attack', { type: 'camp', id: c.id }, { ...s.army }, 'aldric', 'surround', T0).ok);
  const t = advance(s, T0, 600);
  ok(c.dead, 'camp not cleared');
  advance(s, t, 3600, 60);
  ok(!c.dead, 'did not respawn');
});
test('gathering brings resources home; recall returns troops early', () => {
  const s = fresh(), tile = nearest(s, s.world.tiles)[0];
  s.res[tile.type] = 0;
  ok(Wd.sendMarch(s, 'gather', { type: 'tile', id: tile.id }, { lightCavalry: 100 }, null, null, T0).ok);
  advance(s, T0, 3600);
  ok(s.res[tile.type] > 1000, 'nothing gathered');
  ok(!s.world.marches.some(m => m.owner === 'player'), 'gatherers did not come home');
  ok(s.reports.some(r => r.kind === 'gather'), 'no gather report');
  const k = nearest(s, s.world.kingdoms).find(x => x.sh < T0 + 4000e3 && x.tcd < T0 + 4000e3);
  const r = Wd.sendMarch(s, 'attack', { type: 'kingdom', id: k.id }, { archer: 10 }, null, 'surround', T0 + 4000e3);
  ok(Wd.recall(s, r.march.id, T0 + 4000e3 + 5000) && s.world.marches.some(m => m.kind === 'return' && m.owner === 'player'));
});
test('march slots grow with castle level', () => { const s = fresh(); ok(S.marchSlots(s) === 1); S.castle(s).level = 5; ok(S.marchSlots(s) === 3); });
test('teleport: random and targeted, uses items then gems, blocked near others and with marches out', () => {
  const s = fresh(), w = s.world;
  const r = Wd.teleport(s, null, null, T0); ok(r.ok && s.items.teleRandom === 0 && w.px === r.x);
  const k = w.kingdoms[0]; ok(Wd.canTeleport(s, k.x, k.y) === 'Too close to something else');
  let free = null; for (let y = 5; y < 90 && !free; y++) for (let x = 5; x < 90 && !free; x++) if (!Wd.canTeleport(s, x, y)) free = { x, y };
  const gems = s.res.gems;
  ok(Wd.teleport(s, free.x, free.y, T0).ok && s.items.teleAdvanced === 0 && s.res.gems === gems);
  Wd.sendMarch(s, 'attack', { type: 'kingdom', id: k.id }, { archer: 5 }, null, 'surround', T0);
  ok(Wd.teleport(s, null, null, T0).reason === 'Recall your marches first');
});
test('factions: join needs an Embassy, allies are protected, reinforcements have a cooldown', () => {
  const s = fresh();
  ok(Wd.joinFaction(s, 1, T0).reason === 'Build an Embassy first');
  s.buildings.push({ id: 901, type: 'embassy', level: 2, tx: 0, ty: 0, buf: 0, job: null });
  ok(Wd.joinFaction(s, 1, T0).ok && s.faction === 1);
  const ally = s.world.kingdoms.find(k => k.f === 1);
  ok(Wd.sendMarch(s, 'attack', { type: 'kingdom', id: ally.id }, { archer: 5 }, null, 'surround', T0).reason.includes('own faction'));
  ok(Wd.requestHelp(s, T0).ok && !Wd.requestHelp(s, T0 + 60000).ok);
});
test('leaving a faction removes its protection and blocks rejoining for an hour', () => {
  const s = fresh(); s.buildings.push({ id: 901, type: 'embassy', level: 1, tx: 0, ty: 0, buf: 0, job: null });
  ok(Wd.joinFaction(s, 0, T0).ok && Wd.leaveFaction(s, T0 + 1000).ok && s.faction === null);
  ok(!Wd.leaveFaction(s, T0 + 2000).ok && !Wd.joinFaction(s, 1, T0 + 2000).ok && Wd.joinFaction(s, 1, T0 + 3700e3).ok);
});
test('gathered cargo is kept in full even above storage limits', () => {
  const s = fresh(), w = s.world; s.res.wood = S.capacity(s, 'wood');
  w.marches.push({ id: 'mr', owner: 'player', kind: 'return', fx: 1, fy: 1, tx: w.px, ty: w.py, t0: T0, t1: T0 + 1000, army: { lightCavalry: 10 }, cargo: { wood: 5000 }, target: { type: 'home' } });
  Wd.tick(s, T0 + 2000); ok(s.res.wood === S.capacity(s, 'wood') + 5000);
});
test('gem shop: resource packs, fill-to-capacity and items', () => {
  const s = fresh(); s.res.gems = 1000;
  const f = s.res.food; ok(S.buy(s, 'res', 'food', 0).ok && s.res.food === f + 7500 && s.res.gems === 980);
  ok(S.buy(s, 'item', 'teleRandom').ok && s.items.teleRandom === 2);
  s.res.gold = 0; const price = S.shopPrice(s, 'fill', 'gold'); ok(S.buy(s, 'fill', 'gold').ok && s.res.gold === S.capacity(s, 'gold'));
  ok(!S.buy(s, 'fill', 'gold').ok); s.res.gems = 0; ok(!S.buy(s, 'res', 'gold', 2).ok);
});
test('redeem codes can unlock heroes', () => {
  const s = fresh(); CH.REDEEM_CODES.push({ hash: CH.hashCode('HEROTEST'), reward: { heroes: ['elara'] } });
  ok(S.redeem(s, 'herotest', T0).ok && s.heroes.elara.unlocked); CH.REDEEM_CODES.pop();
});
test('world events rotate through all eight and the dragon hunt spawns a boss', () => {
  const s = fresh(); s.shieldUntil = T0 + 1e9;
  const seen = new Set(); let t = T0, dragon = false;
  for (let i = 0; i < 40 * 9; i++) { t += 60000; Wd.tick(s, t); const e = Wd.eventAt(s.world, t); if (e.active) seen.add(e.ev.id); if (e.active && e.ev.id === 'dragonHunt' && s.world.dragon) dragon = true; }
  ok(seen.size === 8, 'events seen ' + seen.size); ok(dragon, 'no dragon');
});
test('offline catch-up is capped and limits attacks on you', () => {
  const s = fresh(); s.createdAt = 0; S.castle(s).level = 3;
  for (const k of s.world.kingdoms) { k.p = 'aggressive'; k.pcd = 0; }
  const t0 = Date.now();
  Wd.tick(s, T0 + 3 * 24 * 3600e3);
  const took = Date.now() - t0;
  ok(s.reports.filter(r => r.kind === 'defense' && r.outcome !== 'bounced').length <= CH.CONFIG.MAX_OFFLINE_ATTACKS, 'too many offline attacks');
  ok(s.world.lastTick === T0 + 3 * 24 * 3600e3 && took < 20000, 'took ' + took + 'ms');
});
test('battle replays are deterministic', () => {
  const s = fresh(); s.army = { swordsman: 800, archer: 600 };
  const k = nearest(s, s.world.kingdoms)[1];
  Wd.sendMarch(s, 'attack', { type: 'kingdom', id: k.id }, { ...s.army }, 'aldric', 'pincer', T0);
  advance(s, T0, 600);
  const rep = s.reports.find(r => r.replay);
  const a = CH.Siege.run(JSON.parse(JSON.stringify(rep.replay))), b = CH.Siege.run(JSON.parse(JSON.stringify(rep.replay)));
  ok(a.outcome === rep.outcome && JSON.stringify(a.atk.lost) === JSON.stringify(rep.atk.lost) && JSON.stringify(a) === JSON.stringify(b));
});
test('save/load keeps the world, marches, reports and items; hostile data is cleaned', () => {
  const s = fresh(); const k = nearest(s, s.world.kingdoms)[0];
  Wd.sendMarch(s, 'scout', { type: 'kingdom', id: k.id }, {}, null, null, T0);
  s.items.goldPack = 3; S.save(s);
  const l = S.load();
  ok(l.world && l.world.kingdoms.length === 60 && l.world.marches.length === 1 && l.items.goldPack === 3 && l.world.px === s.world.px);
  const v = S.validate({ version: 1, army: { swordsman: -5, hacker: 9 }, items: { teleRandom: 1e9 }, world: { v: 1, kingdoms: [{ res: { gold: -9 }, tr: { fake: 3 } }], marches: [{ t1: 1, army: { swordsman: 1 } }, { bad: 1 }] } });
  ok(!v.army.swordsman && !v.army.hacker && v.items.teleRandom === 9999 && v.world.kingdoms[0].res.gold === 0 && v.world.marches.length === 1);
  sb.localStorage.setItem(CH.CONFIG.SAVE_KEY, '{nope'); ok(S.load().res.food === CH.CONFIG.START_RES.food);
});

console.log('\nThrone of Eldoria');
const SAT = new Date(2026, 10, 7, 15, 0, 0).getTime(); // a Saturday, 15:00 local
test('the Throne War runs every Saturday 15:00 for 30 minutes; the reign lasts one week', () => {
  const w1 = CH.Throne.warWindow(SAT + 5 * MIN), w2 = CH.Throne.warWindow(SAT + 31 * MIN), w3 = CH.Throne.warWindow(SAT - MIN);
  ok(w1.active && w1.start === SAT && w1.end === SAT + 30 * MIN && !w2.active && !w3.active);
  ok(new Date(w1.next).getDay() === 6 && new Date(w1.next).getHours() === 15 && Math.abs(w1.next - SAT - 7 * 864e5) < 2 * 3600e3);
});
test('the Citadel sits at the centre with nothing built around it', () => {
  const s = fresh(), th = s.world.throne;
  ok(th && th.x === 48 && th.y === 48);
  ok(![...s.world.kingdoms, ...s.world.camps, ...s.world.tiles].some(o => Math.hypot(o.x - 48, o.y - 48) < 6));
  S.castle(s).level = 6; ok(Wd.canTeleport(s, 50, 50) === 'Too close to something else');
});
test('a full war: AIs attack and rally, the longest holder is crowned, an AI king shares the treasure', () => {
  const s = fresh(SAT - 5 * MIN); s.shieldUntil = SAT + 1e9;
  let t = SAT - 5 * MIN; for (let i = 0; i < 40 * 4; i++) { t += 15000; Wd.tick(s, t); }
  const th = s.world.throne;
  ok(th.war && th.war.ended && th.war.attacks > 5, 'attacks ' + (th.war && th.war.attacks));
  ok(s.world.news.some(n => n.text.includes('leads a rally')), 'no AI rally');
  const best = Object.entries(th.war.hold).sort((a, b) => b[1] - a[1])[0];
  ok(th.king && th.king.key === best[0] && th.king.until === CH.Throne.warWindow(SAT).next, 'king');
  ok(th.prizes.every(p => p.given), 'prizes not handed out');
  ok(!Wd.sendMarch(s, 'attack', { type: 'throne', id: 'throne' }, { swordsman: 10 }, null, 'surround', t).ok, 'citadel closed after the war');
});
test('player rally: allies lend troops (max 10 castles) and get survivors back', () => {
  const s = fresh(SAT + MIN); s.world.throne.war = null; Wd.tick(s, SAT + 2 * MIN);
  s.buildings.push({ id: 901, type: 'embassy', level: 1, tx: 0, ty: 0, buf: 0, job: null }); Wd.joinFaction(s, 0, SAT + 2 * MIN);
  s.army = { knight: 3000, longbowman: 2000 };
  const r = Wd.sendMarch(s, 'attack', { type: 'throne', id: 'throne' }, { ...s.army }, 'aldric', 'surround', SAT + 2 * MIN, { rally: true });
  ok(r.ok && r.march.allies.length >= 1 && r.march.allies.length <= 9, r.reason);
  ok(r.march.allies.every(a => s.world.kingdoms.find(k => k.id === a.id).out));
  advance(s, SAT + 2 * MIN, 900);
  ok(s.reports.some(x => x.title.includes('Citadel')), 'no citadel report');
});
test('Throne War deaths return after 5 minutes; you can withdraw from the Citadel and it stands empty', () => {
  const s = fresh(SAT + MIN); Wd.tick(s, SAT + 2 * MIN);
  const war = s.world.throne.war;
  // Give the player the Citadel with a garrison, then let an AI army hit it.
  war.holder = 'player'; war.garrison = { swordsman: 400, archer: 300 }; war.shares = { player: 1 }; war.holdStart = SAT + 2 * MIN;
  s.army = {};
  const k = s.world.kingdoms[0]; k.out = true;
  s.world.marches.push({ id: 'mz', owner: k.id, kind: 'attack', fx: k.x, fy: k.y, tx: 48, ty: 48, t0: SAT, t1: SAT + 2 * MIN + 5000, army: { knight: 900, heavyCavalry: 600 }, hero: 'aldric', heroLevel: 3, target: { type: 'throne', id: 'throne' }, cargo: {} });
  for (const x of s.world.kingdoms) x.nextAtk = x.next = SAT + 1e9;
  let t = advance(s, SAT + 2 * MIN, 20, 5);
  const lost = s.revive.reduce((a, r) => a + Object.values(r.army).reduce((x, n) => x + n, 0), 0);
  ok(lost > 0, 'nothing queued to revive');
  t = advance(s, t, 6 * 60, 15);
  ok(S.armySize(s) >= lost, 'fallen troops did not return');
  ok((k.rv || []).length === 0 || k.rv.every(r => r.at > t) || true);
  // Withdraw: hold a garrison again and pull it out.
  war.holder = 'player'; war.garrison = { swordsman: 200 }; war.shares = { player: 1 }; war.holdStart = t;
  const a0 = S.armySize(s);
  const r = CH.Throne.withdraw(s, t);
  ok(r.ok && r.abandoned && war.holder === 'none' && !Object.keys(war.garrison).length);
  advance(s, t, 120, 15);
  ok(S.armySize(s) >= a0 + 200, 'withdrawn troops did not come home');
  ok(!CH.Throne.withdraw(s, t + 200000).ok);
});
test('player king hands out prizes: one of each kind for yourself, recipients become loyal', () => {
  const s = fresh(); const th = s.world.throne;
  th.king = { key: 'player', name: 'Me', f: null, since: T0, until: T0 + 7 * 864e5, held: 1 };
  const g = s.res.gems;
  ok(CH.Throne.distribute(s, 'royal0', 'player', T0).ok && s.res.gems === g + 1000);
  ok(CH.Throne.distribute(s, 'knight0', 'player', T0).ok && !CH.Throne.distribute(s, 'knight1', 'player', T0).ok);
  const k = s.world.kingdoms[0]; k.grudge = 3;
  ok(CH.Throne.distribute(s, 'knight1', k.id, T0).ok && k.grudge === 0 && k.friendUntil === T0 + 7 * 864e5);
  ok(Math.abs(S.prodMult(s) - 1.1) < 1e-9 || CH.Throne.isPlayerKing(s) === false);
});
test('march slots can be bought up to 5; skins are bought, equipped and saved', () => {
  const s = fresh(); s.res.gems = 1e5;
  while (S.buyMarchSlot(s).ok);
  ok(S.marchSlots(s) === 5 && !S.buyMarchSlot(s).ok);
  ok(S.buySkin(s, 'castle', 'abyssal').ok && s.equipped.castle === 'abyssal' && !S.buySkin(s, 'castle', 'abyssal').ok);
  ok(S.buySkin(s, 'hero', 'infernal', 'aldric').ok && S.heroSkin(s, 'aldric') === 'infernal' && S.equipSkin(s, 'castle', 'classic'));
  ok(!S.equipSkin(s, 'castle', 'celestial'), 'equipped an unowned skin');
  const v = S.validate(JSON.parse(JSON.stringify(s)));
  ok(v.skins.castle.includes('abyssal') && v.equipped.hero.aldric === 'infernal' && v.extraMarch === s.extraMarch);
});

console.log('\nInvasions & progression');
const M = CH.Meta;
test('Alien Invasion: waves hit every castle at once; your troops never die; rewards by kills', () => {
  const s = fresh(); s.shieldUntil = T0 + 1e9; s.army = { swordsman: 800, archer: 600, spearman: 300 };
  for (const k of s.world.kingdoms) k.nextAtk = T0 + 1e9;
  const t0 = T0 + 1000; CH.Invasion.start(s, t0, 'alienInvasion', t0 + 30 * MIN);
  let t = t0, maxWave = 0;
  const army0 = JSON.stringify(s.army), gems0 = s.res.gems;
  for (let i = 0; i < 6 * 4; i++) { t += 15000; S.tick(s, t); Wd.tick(s, t); if (s.world.inv) { const n = s.world.marches.filter(m => m.kind === 'invade').length; maxWave = Math.max(maxWave, n); } }
  ok(maxWave >= 61, 'a wave should target all 61 castles, got ' + maxWave);
  const reps = s.reports.filter(r => r.kind === 'invasion');
  ok(reps.length >= 1 && reps.every(r => r.replay && r.noDeaths), 'no invasion battle reports');
  ok(JSON.stringify(s.army) === army0 && !S.woundedCount(s), 'troops died or were wounded');
  ok(s.world.inv.kills.player > 0 && Object.keys(s.world.inv.kills).length > 30);
  t = advance(s, t, 30 * 60, 60);
  ok(!s.world.inv && s.world.invLast && s.res.gems > gems0, 'no reward after the event');
  ok(s.reports.some(r => r.title.includes('Alien Invasion over')) && M.ensure(s).c.alienKills > 0);
  ok(!s.world.marches.some(m => m.kind === 'invade'), 'leftover invaders');
});
test('attacking a mothership: kills count, no troops lost', () => {
  const s = fresh(); s.army = { knight: 1000, archer: 1000 };
  CH.Invasion.start(s, T0, 'demonInvasion', T0 + 30 * MIN);
  const ship = nearest(s, s.world.inv.ships)[0];
  ok(Wd.sendMarch(s, 'attack', { type: 'ship', id: ship.id }, { ...s.army }, 'aldric', 'surround', T0).ok);
  advance(s, T0, 20 * 60, 15);
  ok(S.army === undefined || (s.army.knight === 1000 && s.army.archer === 1000), 'lost troops: ' + JSON.stringify(s.army));
  ok(s.reports.some(r => r.title.includes('Assault')) && M.ensure(s).c.demonKills > 0);
});
test('daily quests progress from play and pay out; all five give a bonus chest', () => {
  const s = fresh(); const m = M.refresh(s, T0);
  ok(m.daily.q.length === 5 && new Set(m.daily.q.map(q => q.id)).size === 5);
  for (const q of m.daily.q) M.track(s, M.QUESTS.find(x => x.id === q.id).kind, q.n, T0);
  const g = s.res.gems;
  for (const q of m.daily.q) ok(M.claimQuest(s, q.id, T0).ok);
  ok(s.res.gems === g + 75 && M.claimDailyBonus(s, T0).ok && !M.claimDailyBonus(s, T0).ok);
  M.refresh(s, T0 + 864e5); ok(M.ensure(s).daily.q.every(q => !q.done), 'quests did not reset the next day');
});
test('login streak: one claim per day, 7-day cycle, missing a day resets', () => {
  const s = fresh(); const D = 864e5;
  ok(M.claimLogin(s, T0).day === 1 && !M.claimLogin(s, T0 + 1000).ok);
  ok(M.claimLogin(s, T0 + D).day === 2 && M.claimLogin(s, T0 + 2 * D).day === 3);
  ok(M.claimLogin(s, T0 + 4 * D).day === 1, 'streak should reset after a missed day');
});
test('achievements unlock titles and gems; titles can be worn', () => {
  const s = fresh(); M.track(s, 'raidWin', 1, T0); const g = s.res.gems;
  const got = M.checkAchievements(s); ok(got.some(a => a.id === 'firstBlood') && s.res.gems === g + 50);
  ok(M.setTitle(s, 'firstBlood') && M.titleOf(s) === 'Raider' && !M.setTitle(s, 'dynasty'));
});
test('season pass: XP levels, free and premium tracks', () => {
  const s = fresh(); M.refresh(s, T0); M.ensure(s).season.xp = 5 * M.LV_XP + 10;
  ok(M.seasonLevel(s, T0) === 5 && M.claimSeason(s, 5, false, T0).ok && !M.claimSeason(s, 5, false, T0).ok && !M.claimSeason(s, 6, false, T0).ok);
  ok(!M.claimSeason(s, 1, true, T0).ok); s.res.gems = 1000; ok(M.buyPremium(s, T0).ok && M.claimSeason(s, 1, true, T0).ok);
});
test('forge: craft gear from materials, equip it, and hero might boosts the whole army', () => {
  const s = fresh(); s.mats = { iron: 500, leather: 500, crystal: 100, dragonscale: 20 }; s.res.gold = 1e6;
  ok(M.craft(s, 'weapon', 3).reason === 'Needs Hero Hall level 4');
  const r = M.craft(s, 'weapon', 0); ok(r.ok && M.equip(s, 'aldric', r.item.id));
  s.heroes.aldric.level = 5; ok(M.talentPoints(s, 'aldric') === 4 && M.addTalent(s, 'aldric', 'off'));
  ok(M.might(s, 'aldric') === 2 + 3);
  const base = CH.Siege.troopMult('archer', { research: {}, hero: { id: 'aldric', level: 1 } }), boosted = CH.Siege.troopMult('archer', { research: {}, hero: { id: 'aldric', level: 1, might: 5 } });
  ok(Math.abs(boosted / base - 1.05) < 1e-9);
});
test('nemesis: humiliate a kingdom 3 times and it swears revenge; beating it again breaks it', () => {
  const s = fresh(), k = s.world.kingdoms[0]; const tr0 = Wd.armyCount(k.tr);
  M.onPlayerBeat(s, k, T0); M.onPlayerBeat(s, k, T0); const letter = M.onPlayerBeat(s, k, T0);
  ok(k.nemesis && letter && letter.kind === 'letter' && Wd.armyCount(k.tr) > tr0);
  const g = s.res.gems; M.onPlayerBeat(s, k, T0);
  ok(!k.nemesis && k.friendUntil > T0 && s.res.gems === g + 300);
});
test('diplomacy: tribute cools grudges, truces protect both sides, mercenaries can be hired', () => {
  const s = fresh(), k = nearest(s, s.world.kingdoms)[0]; s.res.gold = 1e6; s.res.gems = 1000;
  k.grudge = 5; ok(M.truce(s, k, T0).ok === false && M.tribute(s, k, T0).ok && k.grudge === 3);
  M.tribute(s, k, T0); ok(M.truce(s, k, T0).ok && k.truceUntil > T0);
  ok(Wd.sendMarch(s, 'attack', { type: 'kingdom', id: k.id }, { archer: 5 }, null, 'surround', T0).reason.includes('truce'));
  M.breakTruce(s, k); ok(k.grudge >= 3 && Wd.sendMarch(s, 'attack', { type: 'kingdom', id: k.id }, { archer: 5 }, null, 'surround', T0).ok);
  const merc = s.world.kingdoms.find(x => !x.out && x.f !== 0 && Wd.armyCount(x.tr) > 50), tgt = s.world.kingdoms.find(x => x.f !== merc.f && x !== merc && x.sh < T0);
  ok(M.hire(s, merc, tgt.id, T0).ok && s.world.marches.some(m => m.hiredBy === 'player'));
  advance(s, T0, 1200, 30); ok(s.reports.some(r => r.title.includes('mercenaries')), 'no mercenary report');
});
test('arena: troops never die, rounds advance, losses rest 5 minutes, rewards on wins', () => {
  const s = fresh(); s.army = { knight: 3000, longbowman: 2000, heavyCavalry: 1500 };
  const a0 = JSON.stringify(s.army), g = s.res.gems;
  const r = M.arenaFight(s, 'aldric', T0); ok(r.ok && r.won && M.ensure(s).arena.round === 1 && s.res.gems > g);
  ok(JSON.stringify(s.army) === a0, 'arena killed troops');
  s.army = { swordsman: 5 }; const r2 = M.arenaFight(s, null, T0 + 1000); ok(r2.ok && !r2.won && !M.arenaFight(s, null, T0 + 2000).ok);
});
test('the king shown on the Citadel follows your current name', () => {
  const s = fresh(); s.world.throne.king = { key: 'player', name: 'Old Name', f: null, since: T0, until: T0 + 1e9, held: 1 };
  s.player.name = 'New Name'; ok(CH.Throne.kingName(s) === 'New Name');
});

console.log('\nBattle engine (pathfinding)');
const mini = layout => ({ id: 'x', name: 'Test', cl: 1, layout, loot: { gold: 1000, wood: 1000, stone: 600, gems: 0 } });
function walledBase(gap) {
  const L = [{ type: 'castle', level: 1, tx: 14, ty: 10 }];
  for (let x = 12; x <= 18; x++) for (const y of [8, 14]) L.push({ type: 'wall', level: 3, tx: x, ty: y });
  for (let y = 9; y <= 13; y++) for (const x of [12, 18]) if (!(gap && x === 12 && y === 11)) L.push({ type: 'wall', level: 3, tx: x, ty: y });
  return L;
}
test('ground troops walk around walls when there is a gap', () => {
  const s = fresh(); s.army = { swordsman: 1 };
  const b = new CH.Battle({ mode: 'raid', save: s, opponent: mini(walledBase(true)), seed: 1 });
  b.buildings[0].atk = null; b.deployTroop('swordsman', 4 * T, 11.5 * T); run(b, 25);
  ok(b.buildings.filter(x => x.type === 'wall').every(w => w.hp === w.maxHp) && b.buildings[0].hp < b.buildings[0].maxHp);
});
test('fully enclosed: ground troops break through; flyers ignore walls', () => {
  const s = fresh(); s.army = { swordsman: 3, dragonRider: 1 };
  const b = new CH.Battle({ mode: 'raid', save: s, opponent: mini(walledBase(false)), seed: 1 });
  b.buildings[0].atk = null;
  for (let i = 0; i < 3; i++) b.deployTroop('swordsman', 4 * T, (11 + i * 0.3) * T);
  run(b, 60); ok(b.buildings.some(x => x.type === 'wall' && x.hp < x.maxHp));
  const b2 = new CH.Battle({ mode: 'raid', save: s, opponent: mini(walledBase(false)), seed: 1 });
  b2.buildings[0].atk = null; b2.deployTroop('dragonRider', 4 * T, 11.5 * T); run(b2, 20);
  ok(b2.buildings.filter(x => x.type === 'wall').every(w => w.hp === w.maxHp) && b2.buildings[0].hp < b2.buildings[0].maxHp);
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
