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
test('raiding a weak AI: real battle, loot comes home, casualties, target cooldown, grudge', () => {
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
  ok(k.res.gold < 20000 && k.grudge > 0 && k.tcd > T0);
  ok(!Wd.sendMarch(s, 'attack', { type: 'kingdom', id: k.id }, { swordsman: 10 }, null, 'surround', T0 + 700000).ok, 'cooldown');
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
test('world events rotate through all six and the dragon hunt spawns a boss', () => {
  const s = fresh(); s.shieldUntil = T0 + 1e9;
  const seen = new Set(); let t = T0, dragon = false;
  for (let i = 0; i < 40 * 7; i++) { t += 60000; Wd.tick(s, t); const e = Wd.eventAt(s.world, t); if (e.active) seen.add(e.ev.id); if (e.active && e.ev.id === 'dragonHunt' && s.world.dragon) dragon = true; }
  ok(seen.size === 6, 'events seen ' + seen.size); ok(dragon, 'no dragon');
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
