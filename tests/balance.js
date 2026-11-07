/* Campaign balance sweep: a simple bot plays every stage with a kingdom at the
 * castle level each region requires (defenses upgraded to match).
 *   node tests/balance.js */
const { loadGame } = require('./harness');
const { CH } = loadGame();
const T = CH.CONFIG.T;
function profile(cl) { if (process.env.WEAK) return weak(cl);
  const s = CH.State.defaults(1e12);
  CH.State.castle(s).level = cl;
  for (const t of CH.BUILD_MENU[2].types) if (CH.BUILDINGS[t].unlock <= cl) s.buildings.push({ id: 500 + s.buildings.length, type: t, level: Math.min(8, cl), tx: 0, ty: 0, buf: 0, job: null });
  s.army = { swordsman: 8 + 2 * cl, archer: 6 + 2 * cl };
  if (cl >= 2) { s.heroes.king = { unlocked: true, level: Math.min(10, cl * 2 - 2) }; }
  if (cl >= 3) { s.heroes.queen = { unlocked: true, level: Math.min(10, cl * 2 - 3) }; s.buildings.push({ id: 900, type: 'lab', level: Math.min(5, cl - 1), tx: 0, ty: 0, buf: 0, job: null }); }
  for (const t of CH.TROOP_ORDER) s.research.troops[t] = Math.max(1, Math.min(6, cl - 1));
  return s;
}
function play(st, s, seed) {
  const b = new CH.Battle({ mode: 'campaign', save: s, stage: st, seed });
  if (process.env.TRACE) { const o = b.destroyBuilding.bind(b); b.destroyBuilding = x => { if (!x.placed) console.log('  destroyed', x.type, x.objKey || '', 't=' + b.time.toFixed(0), 'wave', b.waveIdx + 1, 'by', b.units.filter(u => u.side === 'atk' && u.tb === x).map(u => u.def.name).slice(0, 3).join(',')); o(x); }; }
  // Score cells per road, weighting the last stretch before each road's target.
  const perRoad = b.roads.map(road => {
    const pts = road.pts, tiles = [];
    for (let i = 1; i < pts.length; i++) {
      const ax = Math.floor(pts[i - 1].x / T), ay = Math.floor(pts[i - 1].y / T), bx = Math.floor(pts[i].x / T), by = Math.floor(pts[i].y / T);
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) tiles.push([x, y]);
    }
    const tail = tiles.slice(-14);
    const cells = [];
    for (let ty = 0; ty < 21; ty++) for (let tx = 0; tx < 29; tx++) {
      let cov = 0; for (const [x, y] of tail) if (Math.abs(x - tx - 0.5) <= 3.5 && Math.abs(y - ty - 0.5) <= 3.5) cov++;
      if (cov) cells.push({ tx, ty, cov });
    }
    return cells.sort((a, c) => c.cov - a.cov);
  });
  const types = b.towerTypes.slice().sort((a, c) => CH.TOWER_PRICE[c] - CH.TOWER_PRICE[a]);
  let k = 0, deployed = false;
  for (let i = 0; i < 60 * 900 && !b.result; i++) {
    if (i % 20 === 0) {
      for (let guard = 0; guard < 6; guard++) {
        const t = types[k % types.length], cells = perRoad[k % perRoad.length];
        if (b.gold < CH.TOWER_PRICE[t]) break;
        const c = cells.find(c => b.canPlaceTower(c.tx, c.ty));
        if (c) b.placeTower(t, c.tx, c.ty);
        k++;
      }
      for (const t of b.buildings) if (t.placed) { const c = b.towerUpgradeCost(t); if (c !== null && b.gold >= c + 60) b.upgradeTower(t); }
      if (!deployed && b.waveIdx >= 0) {
        deployed = true;
        const end = b.roads[0].pts[b.roads[0].pts.length - 2];
        for (const h of b.heroesAvail) b.deployHero(h, end.x, end.y);
        for (const t of ['swordsman', 'archer']) while (b.army[t] > 0) b.deployTroop(t, end.x + (Math.random() - 0.5) * 40, end.y + (Math.random() - 0.5) * 40);
      }
      if (b.canCallWave() && !b.units.some(u => u.side === 'atk')) b.callWave();
      for (const sp of ['fireball']) if (b.spells[sp] > 0) { const e = b.units.find(u => u.side === 'atk' && (u.boss || u.def.large)); if (e) b.castSpell(sp, e.x, e.y); }
    }
    b.update(1 / 60);
  }
  return { r: b.result, stars: b.result === 'win' ? b.campaignStars() : 0, core: Math.round(b.core.hp / b.core.maxHp * 100), reason: b.reason, wave: b.waveIdx + 1, left: b.units.filter(u => u.side === 'atk').slice(0, 2).map(u => 'tu=' + (u.tu ? u.tu.def.name + '@' + Math.round(u.tu.x / T) + ',' + Math.round(u.tu.y / T) + ' fly' + u.tu.flying : 'none') + ' path=' + JSON.stringify(u.path && u.path.slice(u.pi, u.pi + 4).map(k => [k % 30, Math.floor(k / 30), b.occ[k] ? b.buildings[b.occ[k] - 1].type + (b.buildings[b.occ[k] - 1].dead ? 'DEAD' : '') : 0])) + ' cd=' + u.cd.toFixed(2) + ' ' + u.def.name + ':' + u.mode + ':' + (u.tb && u.tb.type) + '@' + Math.round(u.x / T) + ',' + Math.round(u.y / T) + ' hp' + Math.round(u.hp)) };
}
let wins = 0; if (process.argv[2]) { const [r, s] = process.argv[2].split("-").map(Number); const st = CH.Campaign.stage(r, s); const res = play(st, profile(CH.REGIONS[r].castle), 11); console.log(res); process.exit(0); }
for (let r = 0; r < 6; r++) {
  const cl = CH.REGIONS[r].castle;
  const row = [];
  for (let s = 0; s < 6; s++) {
    const st = CH.Campaign.stage(r, s);
    let res = play(st, profile(cl), 11), tries = 1;
    if (res.r !== 'win') { res = play(st, profile(cl), 77); tries++; }
    if (res.r === 'win') wins++;
    row.push((res.r === 'win' ? res.stars + '★' : 'X ') + (tries > 1 ? '*' : ' ') + String(res.core).padStart(3) + '%');
  }
  console.log(CH.REGIONS[r].name.padEnd(20), 'castle', cl, '|', row.join(' | '));
}
console.log('Stages won:', wins, '/ 36   (* = needed a retry, % = castle health left)');
function weak(cl) {
  const s = CH.State.defaults(1e12); CH.State.castle(s).level = cl;
  for (const t of CH.BUILD_MENU[2].types) if (CH.BUILDINGS[t].unlock <= cl) s.buildings.push({ id: 500 + s.buildings.length, type: t, level: Math.max(1, cl - 1), tx: 0, ty: 0, buf: 0, job: null });
  s.army = { swordsman: 6, archer: 4 };
  return s;
}
