/* =====================================================================
 * Crownhold — game/battle.js
 * One deterministic engine for all three combat modes:
 *   raid     : the player's troops (side 'atk') attack an AI kingdom
 *   defense  : AI waves (side 'atk') attack the player's real base
 *   campaign : AI waves walk fixed roads; the player builds towers
 * Buildings always belong to side 'def'. No DOM access here.
 *
 * Ground attackers use A* over the tile grid. Walls cost extra to path
 * through, other buildings cost a lot more; when a unit's path runs into
 * a structure it stops and smashes it. Flyers ignore walls entirely.
 *
 * Events via battle.onEvent(type, data): sfx · toast · boss · end · wave ·
 * waveClear · boon · star
 * ===================================================================== */
(function () {
  const C = CH.CONFIG, B = CH.BUILDINGS, U = CH.util, T = C.T, W = C.COLS, H = C.ROWS;
  const tc = i => ((i % W) + 0.5) * T, tr = i => (Math.floor(i / W) + 0.5) * T;

  /* ---------- Tiny binary heap for A* ---------- */
  class Heap {
    constructor() { this.k = []; this.v = []; }
    push(key, val) {
      const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
      while (i > 0) { const p = (i - 1) >> 1; if (v[p] <= v[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
    }
    pop() {
      const k = this.k, v = this.v, top = k[0], lk = k.pop(), lv = v.pop();
      if (k.length) {
        k[0] = lk; v[0] = lv; let i = 0;
        for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < k.length && v[l] < v[m]) m = l; if (r < k.length && v[r] < v[m]) m = r; if (m === i) break; [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m; }
      }
      return top;
    }
    get size() { return this.k.length; }
  }
  const gScore = new Float32Array(W * H), came = new Int32Array(W * H), stamp = new Int32Array(W * H);
  let stampN = 1;

  const TOWER_PRICE = { archerTower: 100, cannon: 140, mageTower: 170, frostTower: 160, mortar: 200, teslaTower: 220, ballista: 260 };
  CH.TOWER_PRICE = TOWER_PRICE;

  class Battle {
    /**
     * cfg.mode     'raid' | 'defense' | 'campaign'
     * cfg.save     the player's save (read-only here; the UI applies rewards)
     * cfg.layout   [{type, level, tx, ty}] for raid (enemy base) or defense (player base)
     * cfg.opponent raid opponent · cfg.stage campaign stage
     */
    constructor(cfg) {
      this.mode = cfg.mode;
      this.save = cfg.save;
      this.rand = U.rng(cfg.seed != null ? cfg.seed : (Date.now() & 0xffffff));
      this.playerSide = this.mode === 'raid' ? 'atk' : 'def';
      this.buildings = []; this.units = []; this.proj = []; this.fx = []; this.areas = [];
      this.occ = new Int32Array(W * H);
      this.trapAt = new Int32Array(W * H);
      this.blocked = new Uint8Array(W * H);
      this.road = new Uint8Array(W * H);
      this.time = 0; this.result = null; this.nextId = 1; this.onEvent = null; this.shake = 0;
      this.buffs = { defDmg: 1, defRate: 1 };
      this.stats = { kills: 0, lost: 0, destroyed: 0 };
      this.boss = null;
      // Army available to deploy (copied from the save; the UI subtracts what was used afterwards).
      this.army = { ...(cfg.save.army || {}) };
      this.used = {};
      this.heroesAvail = CH.HERO_ORDER.filter(h => cfg.save.heroes[h] && cfg.save.heroes[h].unlocked);
      this.heroesUsed = {};
      this.spells = {};
      for (const sp of CH.SPELL_ORDER) this.spells[sp] = CH.State.spellUnlocked(cfg.save, sp) ? CH.SPELLS[sp].charges : 0;
      this.stepDt = 1 / 60;
      if (this.mode === 'raid') this.initRaid(cfg.opponent);
      else if (this.mode === 'defense') this.initDefense(cfg.layout);
      else if (this.mode === 'siege') this.initSiege(cfg);
      else this.initCampaign(cfg.stage);
    }

    emit(t, d) { if (this.onEvent) this.onEvent(t, d); }

    /* ================= Buildings ================= */
    addBuilding(type, level, tx, ty, extra) {
      const d = B[type];
      const b = {
        id: this.nextId++, type, def: d, level, tx, ty, size: d.size, x: tx * T, y: ty * T,
        cx: (tx + d.size / 2) * T, cy: (ty + d.size / 2) * T, hp: d.hp(level), maxHp: d.hp(level),
        cd: this.rand() * 0.5, tgt: null, dead: false, angle: -Math.PI / 2, anim: 0, frozen: 0, hit: 0,
        loot: null, lootTaken: { gold: 0, wood: 0, stone: 0, gems: 0 }, armed: d.cat === 'trap', hidden: false, ...extra,
      };
      if (d.atk) b.atk = this.towerStats(type, level);
      this.buildings.push(b);
      const idx = this.buildings.length;
      if (d.cat === 'trap') this.trapAt[ty * W + tx] = idx;
      else for (let y = ty; y < ty + d.size; y++) for (let x = tx; x < tx + d.size; x++) this.occ[y * W + x] = idx;
      return b;
    }
    towerStats(type, L) {
      const a = B[type].atk;
      return {
        kind: a.kind, dmg: a.dmg(L), rate: a.rate, range: a.range * T, min: (a.min || 0) * T, air: a.air, ground: a.ground,
        splash: (a.splash || 0) * T * (type === 'mageTower' ? 1 + 0.08 * (L - 1) : 1), magic: !!a.magic, vsLarge: a.vsLarge || 1,
        chain: a.chain ? a.chain + (L >= 4 ? 1 : 0) : 0, multishot: type === 'archerTower' && L >= 4, knock: type === 'cannon' && L >= 4,
        slow: type === 'frostTower' ? 0.3 + 0.04 * (L - 1) : 0, freezeChance: type === 'frostTower' && L >= 5 ? 0.15 : 0,
        cluster: type === 'mortar' && L >= 5, pierce: type === 'ballista' && L >= 4,
      };
    }
    bAt(i) { const k = this.occ[i]; if (!k) return null; const b = this.buildings[k - 1]; return b.dead ? null : b; }
    distToB(px, py, b) {
      const dx = Math.max(b.x - px, 0, px - (b.x + b.size * T)), dy = Math.max(b.y - py, 0, py - (b.y + b.size * T));
      return Math.hypot(dx, dy);
    }
    countsForStars(b) { const c = b.def.cat; return c !== 'wall' && c !== 'trap' && c !== 'obstacle'; }

    damageBuilding(b, dmg, src) {
      if (b.dead || b.def.cat === 'trap') return;
      dmg = Math.min(dmg, b.hp);
      b.hp -= dmg; b.hit = 0.12;
      if (this.dmgBy) this.dmgBy.atk += dmg;
      if (b.loot) for (const r in b.loot) { const take = b.loot[r] * dmg / b.maxHp; b.lootTaken[r] += take; this.lootGot[r] += take; }
      if (b.hp <= 0.01) this.destroyBuilding(b, src);
    }
    destroyBuilding(b) {
      if (b.dead) return;
      b.dead = true; b.hp = 0;
      for (let y = b.ty; y < b.ty + b.size; y++) for (let x = b.tx; x < b.tx + b.size; x++) if (this.occ[y * W + x] === this.buildings.indexOf(b) + 1) this.occ[y * W + x] = 0;
      this.burst(b.cx, b.cy, '#d8c39a', 10 + b.size * 6, 120, 'smoke');
      this.burst(b.cx, b.cy, '#ffb35a', 6 + b.size * 4, 160, 'spark');
      this.shake = Math.max(this.shake, b.size >= 3 ? 0.6 : 0.2);
      this.emit('sfx', b.def.cat === 'wall' ? 'wallBreak' : 'collapse');
      if (this.countsForStars(b)) this.stats.destroyed++;
      if (this.mode === 'raid') this.checkRaidStars(b);
      if (this.mode === 'siege') return;
      if (this.mode !== 'raid') {
        if (b.type === 'castle' || b.core) this.finish('lose', b.core ? 'Your castle has fallen.' : 'Your castle has fallen.');
        else if (b.objKey && this.stage && this.stage.obj === 'multi') this.finish('lose', 'An outpost was destroyed.');
        else if (b.objKey) { this.objLost = (this.objLost || 0) + 1; this.emit('toast', { text: 'The gold mine was destroyed! You can still win, with fewer stars.', kind: 'danger' }); }
      }
    }

    /* ================= Units ================= */
    spawnUnit(def, side, x, y, o = {}) {
      const mult = o.mult || 1;
      const u = {
        id: this.nextId++, def, key: o.key, side, x, y, hp: def.hp * mult * (o.hpMult || 1), maxHp: def.hp * mult * (o.hpMult || 1),
        dmg: def.dmg * (o.dmgMult || mult), rate: def.rate, range: def.range * T, speed: def.speed * T * (o.speedMult || 1),
        flying: !!def.flying, size: def.size * (o.elite ? 1.2 : 1), armor: def.armor || 0, magic: !!def.magic, splash: (def.splash || 0) * T,
        mode: o.mode || (side === 'atk' ? 'nav' : 'guard'), path: null, pi: 0, wp: o.wp || null, wpi: 1, pathTo: o.pathTo || null,
        ax: o.ax != null ? o.ax : x, ay: o.ay != null ? o.ay : y, tb: null, tu: null, cd: this.rand() * 0.4,
        slowT: 0, slowPct: 0, stunT: 0, rageT: 0, rageAmt: 0, hero: o.hero || null, heroLevel: o.heroLevel || 1,
        elite: !!o.elite, boss: !!def.boss, dead: false, anim: this.rand() * 10, facing: 1, swing: 0, hit: 0,
        summonT: def.summon ? def.summon.every * 0.5 : 0, minions: 0, parent: o.parent || null, abilityCd: 4, abT: {}, enraged: false,
        gold: Math.round((def.gold || 0) * (o.elite ? 3 : 1)), repath: 0,
      };
      if (def.stomp) u.abT.stomp = def.stomp.every * 0.6;
      if (def.warcry) u.abT.warcry = def.warcry.every * 0.5;
      if (def.summonE) u.abT.summonE = def.summonE.every * 0.6;
      if (def.freeze) u.abT.freeze = def.freeze.every * 0.6;
      if (def.inferno) u.abT.inferno = def.inferno.every * 0.6;
      this.units.push(u);
      if (u.boss) { this.boss = u; this.shake = 0.7; this.emit('boss', u); this.emit('sfx', 'roar'); }
      return u;
    }
    enemiesOf(side) { return side === 'atk' ? 'def' : 'atk'; }

    damageUnit(u, dmg, magic, src) {
      if (u.dead) return 0;
      if (!magic) dmg *= 1 - u.armor;
      dmg = Math.min(dmg, Math.max(0, u.hp));
      u.hp -= dmg; u.hit = 0.1;
      if (this.dmgBy) this.dmgBy[u.side === 'atk' ? 'def' : 'atk'] += dmg;
      if (src && src.def && src.def.lifesteal) src.hp = Math.min(src.maxHp, src.hp + dmg * src.def.lifesteal);
      if (this.save.settings.damageNumbers && dmg >= 60 && this.fx.length < 500) this.fx.push({ kind: 'text', x: u.x, y: u.y - u.size * 2, text: String(Math.round(dmg)), color: '#ffe08a', life: 0.6, max: 0.6, vy: -40 });
      if (u.hp <= 0) this.killUnit(u);
      return dmg;
    }
    killUnit(u) {
      if (u.dead) return;
      u.dead = true;
      this.burst(u.x, u.y - u.size, u.side === 'atk' && this.mode !== 'raid' ? '#b03a2a' : '#e8e2d0', u.boss ? 50 : 8, u.boss ? 200 : 90, 'spark');
      if (u.parent) u.parent.minions--;
      if (u.def.split) {
        for (let i = 0; i < u.def.split.count; i++) {
          const sd = CH.ENEMIES[u.def.split.unit] || CH.SUMMONS[u.def.split.unit];
          const c = this.spawnUnit(sd, u.side, u.x + (this.rand() - 0.5) * 20, u.y + (this.rand() - 0.5) * 20, { mult: u.side === 'atk' && this.mode !== 'raid' ? this.waveMult || this.stageMult || 1 : u.maxHp / u.def.hp, mode: u.mode === 'path' ? 'nav' : u.mode });
          c.tb = u.tb;
        }
      }
      if (this.mode === 'siege') { /* casualties are read from squads at the end */ }
      else if (u.side === 'atk') {
        if (this.mode !== 'raid') { this.stats.kills++; if (this.mode === 'campaign') { this.gold += u.gold; } }
        else this.stats.lost++;
      }
      if (u.boss) { if (this.boss === u) this.boss = null; this.bossKilled = true; this.shake = 1; this.emit('sfx', 'bossDeath'); this.emit('toast', { text: u.def.name + ' has been slain!', kind: 'gold' }); this.fx.push({ kind: 'ring', x: u.x, y: u.y, r0: 10, r1: 200, life: 1, max: 1, color: '#ffcf6a', w: 6 }); }
      else this.emit('sfx', u.hero ? 'heroDown' : 'death');
      if (u.hero) this.emit('toast', { text: CH.HEROES[u.hero].name + ' has fallen!', kind: 'danger' });
    }

    /* ---------- A* pathfinding for ground attackers ---------- */
    findPath(u, tb) {
      const start = this.tileOf(u.x, u.y);
      const reach = Math.max(u.range, 0.6 * T) + 0.35 * T;
      const isGoal = i => this.distToB(tc(i), tr(i), tb) <= reach;
      stampN++;
      const heap = new Heap();
      gScore[start] = 0; stamp[start] = stampN; came[start] = -1;
      heap.push(start, 0);
      const gx = tb.cx, gy = tb.cy;
      let goal = -1, iter = 0;
      while (heap.size && iter++ < 4000) {
        const cur = heap.pop();
        if (isGoal(cur)) { goal = cur; break; }
        const cx = cur % W, cy = (cur - cx) / W, gc = gScore[cur];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (this.blocked[ni]) continue;
          if (dx && dy && (this.bAt(cy * W + nx) || this.bAt(ny * W + cx) || this.blocked[cy * W + nx] || this.blocked[ny * W + cx])) continue;
          const ob = this.bAt(ni);
          let step = dx && dy ? 1.414 : 1;
          if (ob && ob !== tb) step += ob.def.cat === 'wall' ? C.WALL_PATH_COST * (0.6 + ob.hp / 1500) : C.BUILDING_PATH_COST;
          const ng = gc + step;
          if (stamp[ni] === stampN && gScore[ni] <= ng) continue;
          stamp[ni] = stampN; gScore[ni] = ng; came[ni] = cur;
          const hx = Math.abs(nx + 0.5 - gx / T), hy = Math.abs(ny + 0.5 - gy / T);
          heap.push(ni, ng + Math.max(hx, hy) + 0.414 * Math.min(hx, hy) - reach / T);
        }
      }
      const path = [];
      for (let i = goal; i !== -1 && i !== start; i = came[i]) path.push(i);
      path.reverse();
      return goal === -1 ? null : path;
    }
    tileOf(x, y) { return U.clamp(Math.floor(y / T), 0, H - 1) * W + U.clamp(Math.floor(x / T), 0, W - 1); }

    chooseBuilding(u) {
      const pref = u.def.target;
      const ok = b => !b.dead && b.def.cat !== 'trap' && b.def.cat !== 'obstacle';
      const filters = [];
      if (pref === 'defense') filters.push(b => !!b.atk);
      if (pref === 'resource') filters.push(b => ['econ', 'storage'].includes(b.def.cat) || b.type === 'castle');
      if (pref === 'walls') filters.push(b => b.def.cat === 'wall');
      filters.push(b => b.def.cat !== 'wall');
      filters.push(() => true);
      for (const f of filters) {
        let best = null, bd = Infinity;
        for (const b of this.buildings) {
          if (!ok(b) || !f(b)) continue;
          const d = this.distToB(u.x, u.y, b);
          if (d < bd) { bd = d; best = b; }
        }
        if (best) return best;
      }
      return null;
    }
    nearestUnit(u, side, radius, fromX, fromY) {
      let best = null, bd = radius * radius;
      const ranged = u.range > 1.2 * T;
      const x = fromX != null ? fromX : u.x, y = fromY != null ? fromY : u.y;
      for (const v of this.units) {
        if (v.dead || v.side !== side) continue;
        if (v.flying && !ranged && !u.flying) continue;
        const d = (v.x - x) ** 2 + (v.y - y) ** 2;
        if (d < bd) { bd = d; best = v; }
      }
      return best;
    }
    /** Moves toward (x,y); returns true once within `near` px. Waypoints use a
     *  generous `near` so crowds pushing each other apart can't deadlock. */
    moveToward(u, x, y, dt, near = 2) {
      const dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy);
      if (d < Math.max(0.5, near)) return true;
      let sp = u.speed * (u.slowT > 0 ? 1 - u.slowPct : 1) * (u.rageT > 0 ? 1 + u.rageAmt * 0.6 : 1) * (u.enraged ? 1.4 : 1) * (u.def.rage && u.hp < u.maxHp / 2 ? 1.5 : 1);
      const step = Math.min(d, sp * dt);
      u.x += dx / d * step; u.y += dy / d * step;
      if (Math.abs(dx) > 1) u.facing = dx > 0 ? 1 : -1;
      return d - step < near;
    }

    /* ---------- Attacks ---------- */
    unitDamage(u, target, isB) {
      let d = u.dmg;
      if (u.rageT > 0) d *= 1 + u.rageAmt;
      if (u.def.rage && u.hp < u.maxHp / 2) d *= 1.5;
      if (u.enraged) d *= 1.3;
      if (u.aura) d *= 1 + u.aura;
      if (!isB && target.def.large && u.def.vsLarge) d *= u.def.vsLarge;
      if (isB && u.def.vsRes && ['econ', 'storage'].includes(target.def.cat)) d *= u.def.vsRes;
      if (this.waveMod && this.waveMod.id === 'frenzy' && u.side === 'atk') d *= 1.3;
      // Class counters and siege engines (world battles and anywhere troop classes exist).
      if (u.def.siege) d *= isB ? u.def.siege : 0.35;
      else if (!isB && u.def.cls && target.def.cls) d *= (CH.COUNTER[u.def.cls] || {})[target.def.cls] || 1;
      return d;
    }
    attack(u, target, isB) {
      if (u.cd > 0) return;
      const rateMult = (u.rageT > 0 ? 1 + u.rageAmt * 0.5 : 1) * (u.def.rage && u.hp < u.maxHp / 2 ? 1.5 : 1) * (u.enraged ? 1.3 : 1);
      u.cd = 1 / (u.rate * rateMult);
      u.swing = 0.22;
      const tx = isB ? target.cx : target.x;
      if (Math.abs(tx - u.x) > 2) u.facing = tx > u.x ? 1 : -1;
      const dmg = this.unitDamage(u, target, isB);
      if (u.def.suicide) {
        const r = u.def.suicide * T;
        for (const b of this.buildings) if (!b.dead && this.distToB(u.x, u.y, b) <= r) this.damageBuilding(b, b.def.cat === 'wall' ? dmg : dmg * 0.25, u);
        this.explosionFx(u.x, u.y, r);
        u.hp = 0; this.killUnit(u);
        return;
      }
      if (u.def.proj) {
        this.proj.push({ kind: u.def.proj, x: u.x, y: u.y - u.size, target, isB, speed: 330, dmg, splash: u.splash, side: u.side, magic: u.magic, src: u, air: true, ground: true });
        this.emit('sfx', u.def.proj === 'arrow' ? 'bow' : u.def.proj === 'fire' ? 'fireShot' : u.def.proj === 'rock' ? 'mortar' : u.def.proj === 'bolt' ? 'ballista' : 'magic');
      } else {
        this.hit(u.side, target, isB, dmg, u.splash, u.magic, u, true, true);
        this.emit('sfx', u.size >= 15 ? 'smash' : 'sword');
      }
    }
    /** Applies damage at a target with optional splash to everything hostile to `side`. */
    hit(side, target, isB, dmg, splash, magic, src, air, ground, extra) {
      if (splash > 0) {
        const x = isB ? target.cx : target.x, y = isB ? target.cy : target.y;
        this.splash(side, x, y, splash, dmg, magic, src, air, ground, extra);
        return;
      }
      if (isB) this.damageBuilding(target, dmg, src);
      else { this.damageUnit(target, dmg, magic, src); if (extra) this.applyExtra(target, extra); }
    }
    splash(side, x, y, r, dmg, magic, src, air = true, ground = true, extra) {
      const foe = this.enemiesOf(side);
      for (const v of this.units) {
        if (v.dead || v.side !== foe || (v.flying && !air) || (!v.flying && !ground)) continue;
        const d = Math.hypot(v.x - x, v.y - y);
        if (d <= r + v.size * 0.5) { this.damageUnit(v, dmg * (1 - 0.35 * d / (r + 1)), magic, src); if (extra) this.applyExtra(v, extra); }
      }
      if (foe === 'def' && ground) for (const b of this.buildings) if (!b.dead && b.def.cat !== 'trap' && this.distToB(x, y, b) <= r) this.damageBuilding(b, dmg * 0.8, src);
      if (r > 0.9 * T) this.fx.push({ kind: 'ring', x, y, r0: 4, r1: r, life: 0.3, max: 0.3, color: magic ? '#c9a2ff' : '#ffb35a', w: 3 });
    }
    applyExtra(v, ex) {
      if (ex.slow && !v.boss) { v.slowPct = Math.max(v.slowT > 0 ? v.slowPct : 0, ex.slow); v.slowT = 2; }
      else if (ex.slow) { v.slowPct = ex.slow * 0.5; v.slowT = 2; }
      if (ex.stun) v.stunT = Math.max(v.stunT, v.boss ? ex.stun * 0.3 : ex.stun);
      if (ex.freeze && this.rand() < ex.freeze && !v.boss) v.stunT = Math.max(v.stunT, 1.5);
    }

    /* ================= Main update ================= */
    update(dt) {
      if (this.result) { this.updateFx(dt); return; }
      this.time += dt;
      if (this.mode === 'raid') this.updateRaid(dt);
      else if (this.mode === 'siege') this.updateSiege(dt);
      else this.updateWaves(dt);
      if (this.result) return;
      this.updateUnits(dt);
      this.updateTowers(dt);
      this.updateProjectiles(dt);
      this.updateAreas(dt);
      this.updateFx(dt);
      let w = 0;
      for (const u of this.units) if (!u.dead) this.units[w++] = u;
      this.units.length = w;
      this.checkEnd();
    }

    updateUnits(dt) {
      const us = this.units;
      for (let i = 0; i < us.length; i++) {
        const u = us[i];
        if (u.dead) continue;
        u.anim += dt; if (u.cd > 0) u.cd -= dt; if (u.swing > 0) u.swing -= dt; if (u.hit > 0) u.hit -= dt;
        if (u.slowT > 0) u.slowT -= dt; if (u.rageT > 0) u.rageT -= dt;
        if (u.def.regen) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * u.def.regen * dt);
        if (u.def.heal) for (const v of us) if (!v.dead && v !== u && v.side === u.side && v.hp < v.maxHp && (v.x - u.x) ** 2 + (v.y - u.y) ** 2 < (2.5 * T) ** 2) v.hp = Math.min(v.maxHp, v.hp + u.def.heal * dt * (u.maxHp / u.def.hp));
        if (u.hero === 'king') for (const v of us) if (!v.dead && v.side === u.side && v !== u) v.aura = (v.x - u.x) ** 2 + (v.y - u.y) ** 2 < (3 * T) ** 2 ? CH.HEROES.king.aura : 0;
        if (u.hero) {
          u.abilityCd = Math.max(0, u.abilityCd - dt);
          if (u.autoHero && u.abilityCd <= 0 && this.nearestUnit(u, this.enemiesOf(u.side), 3.5 * T)) this.castHeroAbility(u);
        }
        if (u.def.summon) this.updateSummoner(u, dt);
        if (u.boss || u.def.stomp || u.def.summonE) this.updateBossAbilities(u, dt);
        if (u.stunT > 0) { u.stunT -= dt; continue; }
        if (u.side === 'atk') this.updateAttacker(u, dt);
        else this.updateDefender(u, dt);
        if (!u.flying && u.side === 'atk' && !u.dead) {
          const tr = this.trapAt[this.tileOf(u.x, u.y)];
          if (tr) { const trap = this.buildings[tr - 1]; if (trap.armed) this.triggerTrap(trap); }
        }
      }
      // Gentle separation so crowds don't stack into one blob.
      for (let i = 0; i < us.length; i++) {
        const a = us[i];
        if (a.dead || a.flying) continue;
        for (let j = i + 1; j < us.length; j++) {
          const b = us[j];
          if (b.dead || b.flying || b.side !== a.side) continue;
          const dx = b.x - a.x, dy = b.y - a.y, min = (a.size + b.size) * 0.7, d2 = dx * dx + dy * dy;
          if (d2 > 0.01 && d2 < min * min) {
            const d = Math.sqrt(d2), push = (min - d) * 0.25;
            a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push;
          }
        }
      }
    }

    updateAttacker(u, dt) {
      // 1) Fight defenders who get close (except siege units that only want buildings).
      if (u.def.target !== 'defense' && u.def.target !== 'walls') {
        if (u.tu && (u.tu.dead || Math.hypot(u.tu.x - u.x, u.tu.y - u.y) > u.range + 3 * T)) u.tu = null;
        if (!u.tu) u.tu = this.nearestUnit(u, 'def', u.range + 1.6 * T);
        if (u.tu) {
          if (Math.hypot(u.tu.x - u.x, u.tu.y - u.y) <= u.range + u.tu.size + 4) this.attack(u, u.tu, false);
          else this.moveToward(u, u.tu.x, u.tu.y, dt);
          return;
        }
      }
      // 2) Campaign roads.
      if (u.mode === 'path') {
        const p = u.wp[u.wpi];
        if (this.moveToward(u, p.x, p.y, dt, 0.35 * T)) {
          u.wpi++;
          if (u.wpi >= u.wp.length) { u.mode = 'nav'; u.tb = u.pathTo && !u.pathTo.dead ? u.pathTo : null; u.path = null; }
        }
        return;
      }
      // 3) Buildings.
      if (!u.tb || u.tb.dead) { u.tb = this.chooseBuilding(u); u.path = null; u.pi = 0; if (!u.tb) return; }
      const tb = u.tb;
      if (this.distToB(u.x, u.y, tb) <= u.range + 0.35 * T) { this.attack(u, tb, true); return; }
      if (u.flying) { this.moveToward(u, tb.cx, tb.cy, dt); return; }
      if (!u.path) { u.path = this.findPath(u, tb) || []; u.pi = 0; }
      if (u.pi < u.path.length) {
        const k = u.path[u.pi];
        const ob = this.bAt(k);
        if (ob && ob !== tb) {
          if (this.distToB(u.x, u.y, ob) <= u.range + 0.35 * T) { this.attack(u, ob, true); return; }
        }
        if (this.moveToward(u, tc(k), tr(k), dt, 0.35 * T)) u.pi++;
      } else this.moveToward(u, tb.cx, tb.cy, dt);
    }

    updateDefender(u, dt) {
      const leash = u.leash || (u.hero ? 6 : 4.5) * T;
      if (u.tu && (u.tu.dead || Math.hypot(u.tu.x - u.ax, u.tu.y - u.ay) > leash + 2 * T)) u.tu = null;
      if (!u.tu) u.tu = this.nearestUnit(u, 'atk', leash, u.ax, u.ay);
      if (u.tu) {
        if (Math.hypot(u.tu.x - u.x, u.tu.y - u.y) <= u.range + u.tu.size + 4) this.attack(u, u.tu, false);
        else this.moveToward(u, u.tu.x, u.tu.y, dt);
      } else this.moveToward(u, u.ax, u.ay, dt);
    }

    updateSummoner(u, dt) {
      u.summonT -= dt;
      if (u.summonT > 0 || u.minions >= u.def.summon.max) return;
      u.summonT = u.def.summon.every;
      this.raiseSkeletons(u, 1);
    }
    raiseSkeletons(u, n) {
      const lvl = this.save.research.troops.necromancer || 1;
      for (let i = 0; i < n; i++) {
        const a = this.rand() * Math.PI * 2;
        const s = this.spawnUnit(CH.SUMMONS.skeleton, u.side, u.x + Math.cos(a) * 18, u.y + Math.sin(a) * 18, { mult: CH.RESEARCH.troopMult(lvl) * (u.hero ? CH.State.heroMult(u.heroLevel) : 1), parent: u, mode: u.side === 'atk' ? 'nav' : 'guard', ax: u.x + Math.cos(a) * 30, ay: u.y + Math.sin(a) * 30 });
        u.minions++;
        this.burst(s.x, s.y, '#7dffc8', 8, 60, 'spark');
      }
      this.emit('sfx', 'summon');
    }

    updateBossAbilities(u, dt) {
      const d = u.def, foe = this.enemiesOf(u.side);
      for (const k in u.abT) u.abT[k] -= dt;
      if (d.enrage && !u.enraged && u.hp < u.maxHp * d.enrage) { u.enraged = true; this.emit('toast', { text: d.name + ' is enraged!', kind: 'danger' }); this.emit('sfx', 'roar'); }
      if (d.stomp && u.abT.stomp <= 0) {
        u.abT.stomp = d.stomp.every;
        const r = d.stomp.radius * T, dmg = d.stomp.dmg * (this.waveMult || this.stageMult || 1);
        for (const v of this.units) if (!v.dead && v.side === foe && !v.flying && Math.hypot(v.x - u.x, v.y - u.y) < r) { this.damageUnit(v, dmg, true, u); v.stunT = Math.max(v.stunT, 1); }
        for (const b of this.buildings) if (!b.dead && this.distToB(u.x, u.y, b) < r) this.damageBuilding(b, dmg * 0.6, u);
        this.fx.push({ kind: 'ring', x: u.x, y: u.y, r0: 6, r1: r, life: 0.5, max: 0.5, color: '#c9a070', w: 6 });
        this.shake = Math.max(this.shake, 0.4); this.emit('sfx', 'smash');
      }
      if (d.warcry && u.abT.warcry <= 0) {
        u.abT.warcry = d.warcry.every;
        for (const v of this.units) if (!v.dead && v.side === u.side && Math.hypot(v.x - u.x, v.y - u.y) < d.warcry.radius * T) { v.rageT = d.warcry.dur; v.rageAmt = d.warcry.boost; }
        this.fx.push({ kind: 'ring', x: u.x, y: u.y, r0: 10, r1: d.warcry.radius * T, life: 0.6, max: 0.6, color: '#ff4a3a', w: 5 });
        this.emit('sfx', 'warcry');
      }
      if (d.summonE && u.abT.summonE <= 0) {
        u.abT.summonE = d.summonE.every;
        for (let i = 0; i < d.summonE.count; i++) {
          const c = this.spawnUnit(CH.ENEMIES[d.summonE.unit], u.side, u.x + (this.rand() - 0.5) * 40, u.y + (this.rand() - 0.5) * 40, { mult: this.waveMult || this.stageMult || 1, mode: 'nav' });
          c.tb = u.tb;
        }
        this.fx.push({ kind: 'ring', x: u.x, y: u.y, r0: 6, r1: 60, life: 0.5, max: 0.5, color: '#c9a2ff', w: 3 });
      }
      if (d.freeze && u.abT.freeze <= 0) {
        u.abT.freeze = d.freeze.every;
        for (const b of this.buildings) if (!b.dead && b.atk && this.distToB(u.x, u.y, b) < d.freeze.radius * T) { b.frozen = d.freeze.dur; this.burst(b.cx, b.cy, '#bfe9ff', 10, 80, 'spark'); }
        this.fx.push({ kind: 'ring', x: u.x, y: u.y, r0: 10, r1: d.freeze.radius * T, life: 0.7, max: 0.7, color: '#bfe9ff', w: 6 });
        this.emit('sfx', 'freeze');
      }
      if (d.aura) {
        for (const v of this.units) if (!v.dead && v.side === foe && Math.hypot(v.x - u.x, v.y - u.y) < d.aura.radius * T) this.damageUnit(v, d.aura.dps * dt, true, null);
      }
      if (d.inferno && u.abT.inferno <= 0 && u.tb && !u.tb.dead) {
        u.abT.inferno = d.inferno.every;
        const x = u.tb.cx, y = u.tb.cy, r = d.inferno.radius * T, dmg = d.inferno.dmg * (this.waveMult || this.stageMult || 1);
        for (const b of this.buildings) if (!b.dead && this.distToB(x, y, b) < r) this.damageBuilding(b, dmg, u);
        for (const v of this.units) if (!v.dead && v.side === foe && Math.hypot(v.x - x, v.y - y) < r) this.damageUnit(v, dmg * 0.7, true, u);
        this.fx.push({ kind: 'beam', x0: u.x, y0: u.y - u.size, x, y, life: 0.6, max: 0.6, color: '255,120,40' });
        this.explosionFx(x, y, r);
        this.emit('sfx', 'roar');
      }
    }

    triggerTrap(trap) {
      trap.armed = false; trap.hidden = false; trap.dead = true;
      const t = trap.def.trap, x = trap.cx, y = trap.cy, r = t.radius * T;
      if (trap.type === 'fireTrap') {
        this.areas.push({ kind: 'fire', x, y, r, dps: t.dps(trap.level) * (trap.fort || 1), t: t.dur, side: 'def' });
        this.emit('sfx', 'fire');
      } else {
        for (const v of this.units) if (!v.dead && v.side === 'atk' && !v.flying && Math.hypot(v.x - x, v.y - y) <= r + v.size * 0.4) this.damageUnit(v, t.dmg(trap.level) * (trap.fort || 1), false, null);
        if (trap.type === 'bombTrap') this.explosionFx(x, y, r); else this.burst(x, y, '#cfcfcf', 10, 90, 'spark');
        this.emit('sfx', trap.type === 'bombTrap' ? 'boom' : 'spike');
      }
    }

    /* ---------- Towers ---------- */
    updateTowers(dt) {
      for (const b of this.buildings) {
        if (b.dead) continue;
        if (b.hit > 0) b.hit -= dt;
        if (b.anim > 0) b.anim -= dt;
        if (!b.atk) continue;
        if (b.frozen > 0) { b.frozen -= dt; continue; }
        b.cd -= dt * this.buffs.defRate;
        if (b.cd > 0) continue;
        const a = b.atk;
        let t = b.tgt;
        const valid = v => v && !v.dead && v.side === 'atk' && (v.flying ? a.air : a.ground) && this.distToB(v.x, v.y, b) <= a.range && Math.hypot(v.x - b.cx, v.y - b.cy) >= a.min;
        if (!valid(t)) {
          t = null; let bd = Infinity;
          for (const v of this.units) { if (!valid(v)) continue; const d = this.distToB(v.x, v.y, b); if (d < bd) { bd = d; t = v; } }
          b.tgt = t;
        }
        if (!t) { b.cd = 0; continue; }
        b.cd = 1 / a.rate;
        b.anim = 0.2;
        b.angle = Math.atan2(t.y - b.cy, t.x - b.cx);
        this.fireTower(b, t);
      }
    }
    fireTower(b, t) {
      const a = b.atk, dmg = a.dmg * this.buffs.defDmg, ox = b.cx, oy = b.cy - b.size * 10;
      const mk = (kind, target, extra) => this.proj.push({ kind, x: ox, y: oy, target, isB: false, speed: kind === 'ball' ? 420 : kind === 'bolt' ? 620 : 520, dmg, splash: a.splash, side: 'def', magic: a.magic, air: a.air, ground: a.ground, vsLarge: a.vsLarge, ...extra });
      switch (a.kind) {
        case 'arrow':
          mk('arrow', t);
          if (a.multishot) { const o = this.units.find(v => v !== t && !v.dead && v.side === 'atk' && this.distToB(v.x, v.y, b) <= a.range); if (o) mk('arrow', o); }
          this.emit('sfx', 'bow'); break;
        case 'ball': mk('ball', t, { extra: a.knock ? { stun: 0.3 } : null }); this.emit('sfx', 'cannon'); break;
        case 'orb': mk('orb', t); this.emit('sfx', 'magic'); break;
        case 'frost': mk('frost', t, { extra: { slow: a.slow, freeze: a.freezeChance } }); this.emit('sfx', 'frost'); break;
        case 'bolt': mk('bolt', t, { pierce: a.pierce ? 3 : 0, hits: a.pierce ? new Set() : null, vx: (t.x - ox), vy: (t.y - oy) }); this.emit('sfx', 'ballista'); break;
        case 'shell': {
          const dur = 1.1 + Math.hypot(t.x - b.cx, t.y - b.cy) / 900;
          this.proj.push({ kind: 'shell', sx: ox, sy: oy, tx: t.x, ty: t.y, x: ox, y: oy, z: 0, t: 0, dur, dmg, splash: a.splash, side: 'def', cluster: a.cluster });
          this.emit('sfx', 'mortar'); break;
        }
        case 'zap': {
          const hitSet = new Set([t]); const pts = [{ x: ox, y: oy }, { x: t.x, y: t.y - t.size }];
          this.damageUnit(t, dmg, true, null);
          let cur = t;
          for (let k = 0; k < a.chain; k++) {
            let nx = null, bd = (2.6 * T) ** 2;
            for (const v of this.units) { if (v.dead || v.side !== 'atk' || hitSet.has(v)) continue; const d = (v.x - cur.x) ** 2 + (v.y - cur.y) ** 2; if (d < bd) { bd = d; nx = v; } }
            if (!nx) break;
            hitSet.add(nx); pts.push({ x: nx.x, y: nx.y - nx.size }); this.damageUnit(nx, dmg * 0.75, true, null); cur = nx;
          }
          this.fx.push({ kind: 'bolt', pts, life: 0.2, max: 0.2, color: '#a8e6ff' });
          this.emit('sfx', 'zap'); break;
        }
      }
    }

    updateProjectiles(dt) {
      const L = this.proj;
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        let done = false;
        if (p.kind === 'shell') {
          p.t += dt; const k = Math.min(1, p.t / p.dur);
          p.x = U.lerp(p.sx, p.tx, k); p.y = U.lerp(p.sy, p.ty, k); p.z = Math.sin(k * Math.PI) * 90;
          if (k >= 1) {
            this.splash('def', p.tx, p.ty, p.splash, p.dmg, false, null, false, true);
            this.explosionFx(p.tx, p.ty, p.splash); this.emit('sfx', 'boom');
            if (p.cluster) for (let c = 0; c < 3; c++) { const a = this.rand() * 6.28, r = 30 + this.rand() * 25; L.push({ kind: 'shell', sx: p.tx, sy: p.ty, tx: p.tx + Math.cos(a) * r, ty: p.ty + Math.sin(a) * r, x: p.tx, y: p.ty, z: 0, t: 0, dur: 0.4, dmg: p.dmg * 0.35, splash: p.splash * 0.6, side: 'def' }); }
            done = true;
          }
        } else if (p.pierce) {
          const d = Math.hypot(p.vx, p.vy) || 1;
          p.x += p.vx / d * p.speed * dt; p.y += p.vy / d * p.speed * dt; p.a = Math.atan2(p.vy, p.vx);
          p.travel = (p.travel || 0) + p.speed * dt;
          for (const v of this.units) {
            if (v.dead || v.side !== 'atk' || p.hits.has(v)) continue;
            if (Math.hypot(v.x - p.x, v.y - v.size - p.y) > v.size + 8) continue;
            p.hits.add(v); this.damageUnit(v, p.dmg * (v.def.large ? p.vsLarge : 1), false, null);
            if (--p.pierce <= 0) { done = true; break; }
          }
          if (p.travel > 9 * T) done = true;
        } else {
          const t = p.target;
          const alive = t && !t.dead;
          if (alive) { p.tx = p.isB ? t.cx : t.x; p.ty = p.isB ? t.cy : t.y - (t.size || 8) * 0.8; }
          else if (p.tx === undefined) { done = true; }
          if (!done) {
            const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
            p.a = Math.atan2(dy, dx);
            if (d <= step + 4) {
              if (alive || p.splash) {
                let dmg = p.dmg;
                if (!p.isB && alive && t.def.large && p.vsLarge) dmg *= p.vsLarge;
                if (alive) this.hit(p.side, t, p.isB, dmg, p.splash, p.magic, p.src, p.air !== false, p.ground !== false, p.extra);
                else this.splash(p.side, p.tx, p.ty, p.splash, dmg, p.magic, p.src, p.air !== false, p.ground !== false, p.extra);
                if (p.kind === 'orb' || p.kind === 'frost' || p.kind === 'fire' || p.kind === 'shadow') this.burst(p.tx, p.ty, p.kind === 'frost' ? '#bfe9ff' : p.kind === 'fire' ? '#ff9a3a' : p.kind === 'shadow' ? '#9a6ad8' : '#c9a2ff', 6, 70, 'spark');
              }
              done = true;
            } else { p.x += dx / d * step; p.y += dy / d * step; }
          }
        }
        if (done) { L[i] = L[L.length - 1]; L.pop(); }
      }
    }

    updateAreas(dt) {
      for (let i = this.areas.length - 1; i >= 0; i--) {
        const a = this.areas[i];
        a.t -= dt;
        if (a.kind === 'fire') { for (const v of this.units) if (!v.dead && v.side === 'atk' && !v.flying && Math.hypot(v.x - a.x, v.y - a.y) < a.r) this.damageUnit(v, a.dps * dt, true, null); }
        else if (a.kind === 'heal') { for (const v of this.units) if (!v.dead && v.side === a.side && Math.hypot(v.x - a.x, v.y - a.y) < a.r) v.hp = Math.min(v.maxHp, v.hp + a.hps * dt); }
        else if (a.kind === 'rage') { for (const v of this.units) if (!v.dead && v.side === a.side && Math.hypot(v.x - a.x, v.y - a.y) < a.r) { v.rageT = 0.3; v.rageAmt = a.boost; } }
        if (a.t <= 0) this.areas.splice(i, 1);
      }
    }

    /* ---------- Player actions ---------- */
    troopMult(type) { return CH.RESEARCH.troopMult(this.save.research.troops[type] || 1); }

    /** Raid: you may deploy on any tile not within 1 tile of a standing building. */
    canDeploy(x, y) {
      if (this.mode !== 'raid') return x >= 0 && y >= 0 && x < W * T && y < H * T && !this.blocked[this.tileOf(x, y)] && !this.bAt(this.tileOf(x, y));
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (this.bAt(yy * W + xx)) return false;
      }
      return true;
    }
    deployTroop(type, x, y) {
      if (this.result || !(this.army[type] > 0)) return { ok: false, reason: 'None left' };
      if (!this.canDeploy(x, y)) return { ok: false, reason: this.mode === 'raid' ? 'Deploy outside the red zone' : 'Can\'t deploy there' };
      this.army[type]--; this.used[type] = (this.used[type] || 0) + 1;
      const def = CH.TROOPS[type];
      this.spawnUnit(def, this.playerSide, x, y, { mult: this.troopMult(type), key: type, ax: x, ay: y });
      this.deployedAny = true;
      this.emit('sfx', 'deploy');
      return { ok: true };
    }
    deployHero(id, x, y) {
      if (this.result || this.heroesUsed[id] || !this.heroesAvail.includes(id)) return { ok: false, reason: 'Hero unavailable' };
      if (!this.canDeploy(x, y)) return { ok: false, reason: this.mode === 'raid' ? 'Deploy outside the red zone' : 'Can\'t deploy there' };
      const lvl = this.save.heroes[id].level, m = CH.State.heroMult(lvl);
      const u = this.spawnUnit(CH.HEROES[id], this.playerSide, x, y, { mult: m, hero: id, heroLevel: lvl, ax: x, ay: y });
      u.abilityCd = 3;
      this.heroesUsed[id] = u;
      u.skin = CH.State.heroSkin(this.save, id);
      this.deployedAny = true;
      this.emit('sfx', 'heroDeploy');
      return { ok: true, unit: u };
    }
    useAbility(id) {
      const u = this.heroesUsed[id];
      if (!u || u.dead || u.abilityCd > 0 || this.result) return false;
      return this.castHeroAbility(u);
    }
    castHeroAbility(u) {
      const foe = this.enemiesOf(u.side), ab = CH.HEROES[u.hero].ability;
      u.abilityCd = ab.cd;
      const hitArea = (x, y, r, dmg, stun) => {
        for (const v of this.units) if (!v.dead && v.side === foe && Math.hypot(v.x - x, v.y - y) < r) { this.damageUnit(v, dmg, true, u); if (stun) v.stunT = Math.max(v.stunT, v.boss ? stun * 0.3 : stun); }
        if (foe === 'def') for (const b of this.buildings) if (!b.dead && b.def.cat !== 'trap' && this.distToB(x, y, b) < r) this.damageBuilding(b, dmg, u);
      };
      switch (ab.id) {
        case 'royalCharge': hitArea(u.x, u.y, 2.5 * T, u.dmg * 3, 2); this.fx.push({ kind: 'ring', x: u.x, y: u.y, r0: 6, r1: 2.5 * T, life: 0.5, max: 0.5, color: '#ffd76a', w: 6 }); this.shake = 0.4; this.emit('sfx', 'smash'); break;
        case 'arrowStorm': {
          const targets = this.units.filter(v => !v.dead && v.side === foe && Math.hypot(v.x - u.x, v.y - u.y) < u.range * 1.4);
          const bTargets = foe === 'def' ? this.buildings.filter(b => !b.dead && b.def.cat !== 'trap' && this.distToB(u.x, u.y, b) < u.range * 1.4) : [];
          for (let k = 0; k < 10; k++) {
            if (targets.length) this.proj.push({ kind: 'arrow', x: u.x, y: u.y - 14, target: targets[k % targets.length], isB: false, speed: 520, dmg: u.dmg * 1.2, side: u.side, src: u, air: true, ground: true });
            else if (bTargets.length) this.proj.push({ kind: 'arrow', x: u.x, y: u.y - 14, target: bTargets[k % bTargets.length], isB: true, speed: 520, dmg: u.dmg * 1.2, side: u.side, src: u });
          }
          this.emit('sfx', 'bow'); break;
        }
        case 'meteor': {
          const t = u.tu || u.tb || this.nearestUnit(u, foe, 10 * T);
          const x = t ? (t.cx || t.x) : u.x, y = t ? (t.cy || t.y) : u.y;
          hitArea(x, y, 2.6 * T, u.dmg * 6, 1);
          this.fx.push({ kind: 'beam', x0: x, y0: 0, x, y, life: 0.5, max: 0.5, color: '255,150,60' });
          this.explosionFx(x, y, 2.6 * T); this.shake = 0.6; this.emit('sfx', 'boom'); break;
        }
        case 'shadowCleave': hitArea(u.x, u.y, 1.8 * T, u.dmg * 2.5, 0); u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.25); this.fx.push({ kind: 'ring', x: u.x, y: u.y, r0: 4, r1: 1.8 * T, life: 0.35, max: 0.35, color: '#a070ff', w: 7 }); this.emit('sfx', 'smash'); break;
        case 'raiseLegion': this.raiseSkeletons(u, 6); break;
      }
      return true;
    }
    castSpell(id, x, y) {
      if (this.result || !(this.spells[id] > 0)) return false;
      const sp = CH.SPELLS[id], L = this.save.research.spells[id] || 1, r = sp.radius * T;
      const foe = this.enemiesOf(this.playerSide);
      this.spells[id]--;
      if (id === 'fireball') {
        const dmg = sp.dmg(L);
        for (const v of this.units) if (!v.dead && v.side === foe && Math.hypot(v.x - x, v.y - y) < r) this.damageUnit(v, dmg, true, null);
        if (foe === 'def') for (const b of this.buildings) if (!b.dead && b.def.cat !== 'trap' && this.distToB(x, y, b) < r) this.damageBuilding(b, dmg * 0.7, null);
        this.fx.push({ kind: 'beam', x0: x - 120, y0: -40, x, y, life: 0.45, max: 0.45, color: '255,140,40' });
        this.explosionFx(x, y, r); this.emit('sfx', 'boom');
      } else if (id === 'heal') { this.areas.push({ kind: 'heal', x, y, r, hps: sp.heal(L), t: sp.dur, side: this.playerSide }); this.emit('sfx', 'heal'); }
      else if (id === 'rage') { this.areas.push({ kind: 'rage', x, y, r, boost: sp.boost(L), t: sp.dur, side: this.playerSide }); this.emit('sfx', 'warcry'); }
      return true;
    }

    /* ================= RAID ================= */
    initRaid(op) {
      this.opponent = op;
      this.lootGot = { gold: 0, wood: 0, stone: 0, gems: 0 };
      this.timeLimit = C.RAID_TIME;
      for (const l of op.layout) {
        const b = this.addBuilding(l.type, l.level, l.tx, l.ty);
        if (b.def.cat === 'trap') b.hidden = true;
      }
      // Distribute the opponent's loot across its resource buildings.
      // Shares are renormalised over the categories that exist, so all advertised loot is obtainable.
      const share = { castle: 0.2, storage: 0.5, econ: 0.3 };
      for (const r of ['gold', 'wood', 'stone']) {
        const holders = this.buildings.filter(b => b.type === 'castle' || ((b.def.cat === 'storage' || b.def.cat === 'econ') && b.def.res === r));
        const cats = ['castle', 'storage', 'econ'].map(cat => [cat, holders.filter(b => (cat === 'castle' ? b.type === 'castle' : b.def.cat === cat))]).filter(([, hs]) => hs.length);
        const tot = cats.reduce((a, [cat]) => a + share[cat], 0);
        for (const [cat, hs] of cats) for (const b of hs) { b.loot = b.loot || {}; b.loot[r] = (b.loot[r] || 0) + op.loot[r] * share[cat] / tot / hs.length; }
      }
      const castleB = this.buildings.find(b => b.type === 'castle');
      castleB.loot.gems = op.loot.gems || 0;
      this.totalForStars = this.buildings.filter(b => this.countsForStars(b)).length;
      this.stars = 0; this.starFlags = { half: false, castle: false, all: false };
    }
    get destruction() { return this.mode === 'raid' ? Math.round(this.stats.destroyed / this.totalForStars * 100) : 0; }
    checkRaidStars(b) {
      const f = this.starFlags;
      const award = (k, text) => { if (!f[k]) { f[k] = true; this.stars++; this.emit('star', { stars: this.stars, text }); this.emit('sfx', 'star'); } };
      if (b.type === 'castle') award('castle', 'Castle destroyed');
      if (this.destruction >= 50) award('half', '50% destroyed');
      if (this.destruction >= 100) award('all', 'Total destruction');
    }
    updateRaid() {
      if (this.time >= this.timeLimit) this.finish(this.stars > 0 ? 'win' : 'lose', 'Time is up.');
    }
    retreat() { if (!this.result) this.finish(this.stars > 0 ? 'win' : 'lose', 'You retreated.'); }
    canStillAttack() {
      if (this.units.some(u => !u.dead && u.side === 'atk')) return true;
      if (Object.values(this.army).some(n => n > 0)) return true;
      if (this.heroesAvail.some(h => !this.heroesUsed[h])) return true;
      return false;
    }

    /* ================= DEFENSE ================= */
    initDefense(layout) {
      for (const l of layout) if (l.level > 0 && B[l.type].cat !== 'obstacle') this.addBuilding(l.type, l.level, l.tx, l.ty);
      this.layoutCopy = layout.filter(l => l.level > 0 && B[l.type].cat !== 'obstacle');
      this.wave = 0; this.queue = []; this.spawning = false; this.breakT = 4; this.bank = { gold: 0, wood: 0, stone: 0, xp: 0, runes: 0, gems: 0 };
      this.pendingBoon = null; this.lootGot = { gold: 0, wood: 0, stone: 0, gems: 0 };
      const a = CH.State.area(this.save);
      this.area = a;
    }
    edgePoint(edge) {
      const r = this.rand();
      switch (edge) {
        case 'N': return { x: (1 + r * (W - 2)) * T, y: 0.4 * T };
        case 'S': return { x: (1 + r * (W - 2)) * T, y: (H - 0.4) * T };
        case 'E': return { x: (W - 0.4) * T, y: (1 + r * (H - 2)) * T };
        default: return { x: 0.4 * T, y: (1 + r * (H - 2)) * T };
      }
    }
    startDefenseWave() {
      if (this.result || this.spawning || this.pendingBoon) return false;
      this.wave++;
      const w = CH.Defense.wave(this.wave);
      this.waveMult = w.mult; this.waveMod = w.mod; this.waveInfo = w;
      const q = [];
      for (const g of w.groups) {
        const p0 = this.edgePoint(g.edge);
        for (let i = 0; i < g.count; i++) q.push({ t: g.delay + i * g.interval, type: g.type, elite: g.elite, x: p0.x + (this.rand() - 0.5) * 50, y: p0.y + (this.rand() - 0.5) * 50 });
      }
      q.sort((a, b) => a.t - b.t);
      this.queue = q; this.spawning = true; this.waveT = 0;
      this.emit('wave', { n: this.wave, mod: w.mod, boss: w.isBoss, mini: w.isMini });
      this.emit('sfx', 'horn');
      return true;
    }
    /* ================= CAMPAIGN ================= */
    initCampaign(st) {
      this.stage = st;
      this.gold = st.startGold;
      this.stageMult = st.hpMult;
      const cl = CH.State.castleLevel(this.save);
      const core = this.addBuilding('castle', cl, st.tpl.core.tx, st.tpl.core.ty, { core: true });
      core.hp = core.maxHp = core.maxHp * 1.2;
      const objs = {};
      for (const o of st.tpl.objs) { const ob = objs[o.key] = this.addBuilding(o.type, Math.max(1, cl), o.tx, o.ty, { objKey: o.key }); ob.hp = ob.maxHp = ob.maxHp * 3; }
      this.objectives = objs; this.core = core;
      this.roads = st.tpl.paths.map(p => {
        const pts = p.pts.map(([x, y]) => ({ x: (x + 0.5) * T, y: (y + 0.5) * T }));
        for (let i = 1; i < p.pts.length; i++) {
          const [ax, ay] = p.pts[i - 1], [bx, by] = p.pts[i];
          for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) if (x >= 0 && y >= 0 && x < W && y < H) this.road[y * W + x] = 1;
        }
        return { pts, to: p.to === 'core' ? core : objs[p.to] };
      });
      // Scenery that blocks building (never on roads or beside the core).
      const rnd = U.rng(91 + st.gi * 13);
      this.decor = [];
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H), k = y * W + x;
        if (this.road[k] || this.occ[k] || this.nearRoad(x, y, 1)) continue;
        this.blocked[k] = 1; this.decor.push({ tx: x, ty: y, kind: rnd() > 0.5 ? 'tree' : 'rock', s: rnd() });
      }
      this.waveIdx = -1; this.nWaves = st.waves.length; this.queue = []; this.spawning = false; this.breakT = 0;
      this.timeLimit = st.timeLimit;
      this.lootGot = { gold: 0, wood: 0, stone: 0, gems: 0 };
      // Tower levels in campaign follow the player's home defenses (min level 1).
      this.towerTypes = CH.BUILD_MENU[2].types.filter(t => B[t].unlock <= cl);
      this.towerBase = {};
      for (const t of this.towerTypes) this.towerBase[t] = Math.max(1, CH.State.highestLevel(this.save, t));
    }
    nearRoad(x, y, r) { for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H && this.road[yy * W + xx]) return true; return false; }
    canPlaceTower(tx, ty) {
      if (tx < 0 || ty < 0 || tx + 2 > W || ty + 2 > H) return false;
      for (let y = ty; y < ty + 2; y++) for (let x = tx; x < tx + 2; x++) { const k = y * W + x; if (this.road[k] || this.blocked[k] || this.occ[k]) return false; }
      return true;
    }
    placeTower(type, tx, ty) {
      if (this.result) return { ok: false };
      if (!this.towerTypes.includes(type)) return { ok: false, reason: 'Locked' };
      if (!this.canPlaceTower(tx, ty)) return { ok: false, reason: 'Can\'t build there' };
      if (this.gold < TOWER_PRICE[type]) return { ok: false, reason: 'Not enough battle gold' };
      this.gold -= TOWER_PRICE[type];
      const b = this.addBuilding(type, this.towerBase[type], tx, ty, { placed: true, spent: TOWER_PRICE[type] });
      this.burst(b.cx, b.cy, '#d8c9a6', 12, 90, 'smoke');
      this.emit('sfx', 'place');
      return { ok: true, building: b };
    }
    towerUpgradeCost(b) { return b.level >= Math.min(8, this.towerBase[b.type] + 2) ? null : Math.round(TOWER_PRICE[b.type] * (0.6 + 0.25 * (b.level - this.towerBase[b.type] + 1))); }
    upgradeTower(b) {
      const c = this.towerUpgradeCost(b);
      if (c === null || this.gold < c || b.dead) return false;
      this.gold -= c; b.spent += c; b.level++;
      const f = b.hp / b.maxHp; b.maxHp = b.def.hp(b.level); b.hp = b.maxHp * f; b.atk = this.towerStats(b.type, b.level);
      this.burst(b.cx, b.cy - 10, '#ffe08a', 14, 110, 'spark'); this.emit('sfx', 'upgrade');
      return true;
    }
    sellTower(b) {
      if (!b.placed || b.dead) return false;
      this.gold += Math.floor(b.spent * 0.6);
      b.dead = true;
      for (let y = b.ty; y < b.ty + 2; y++) for (let x = b.tx; x < b.tx + 2; x++) this.occ[y * W + x] = 0;
      this.buildings.splice(this.buildings.indexOf(b), 1);
      // Rebuild occupancy indices after removal.
      this.occ.fill(0);
      this.buildings.forEach((bb, i) => { if (!bb.dead && bb.def.cat !== 'trap') for (let y = bb.ty; y < bb.ty + bb.size; y++) for (let x = bb.tx; x < bb.tx + bb.size; x++) this.occ[y * W + x] = i + 1; });
      this.emit('sfx', 'sell');
      return true;
    }
    canCallWave() { return !this.result && !this.spawning && (this.mode === 'campaign' ? this.waveIdx < this.nWaves - 1 : !this.pendingBoon); }
    callWave() {
      if (!this.canCallWave()) return false;
      if (this.mode === 'defense') return this.startDefenseWave();
      if (this.waveIdx >= 0 && this.units.some(u => u.side === 'atk')) { const bonus = 20 + 5 * this.waveIdx; this.gold += bonus; this.emit('toast', { text: 'Early call: +' + bonus + ' battle gold', kind: 'gold' }); }
      this.waveIdx++;
      const w = this.stage.waves[this.waveIdx];
      const q = [];
      for (const g of w.groups) for (let i = 0; i < g.count; i++) q.push({ t: g.delay + i * g.interval, type: g.type, path: g.path, boss: g.boss });
      q.sort((a, b) => a.t - b.t);
      this.queue = q; this.spawning = true; this.waveT = 0; this.breakT = 0;
      this.emit('wave', { n: this.waveIdx + 1, total: this.nWaves, boss: w.groups.some(g => g.boss) });
      this.emit('sfx', 'horn');
      return true;
    }
    updateWaves(dt) {
      if (this.mode === 'campaign' && this.timeLimit && this.waveIdx >= 0 && this.time > this.timeLimit) { this.finish('lose', 'Time ran out.'); return; }
      if (this.spawning) {
        this.waveT += dt;
        while (this.queue.length && this.queue[0].t <= this.waveT) {
          const q = this.queue.shift();
          if (this.mode === 'campaign') {
            const road = this.roads[q.path % this.roads.length];
            const def = CH.ENEMIES[q.type];
            this.spawnUnit(def, 'atk', road.pts[0].x, road.pts[0].y + (this.rand() - 0.5) * 8, { mult: this.stageMult, hpMult: def.boss ? 0.5 : 1, mode: 'path', wp: road.pts, pathTo: road.to });
          } else {
            const def = CH.ENEMIES[q.type], mod = this.waveMod;
            this.spawnUnit(def, 'atk', q.x, q.y, { mult: this.waveMult, elite: q.elite, hpMult: (q.elite ? 2.2 : 1) * (mod && mod.id === 'ironclad' ? 1.3 : 1), speedMult: mod && mod.id === 'swift' ? 1.25 : 1 });
          }
        }
        if (!this.queue.length) this.spawning = false;
      } else if (!this.units.some(u => u.side === 'atk')) {
        if (this.mode === 'defense' && this.wave > 0 && !this.waveCleared) this.onDefenseWaveCleared();
        if (this.mode === 'campaign' && this.timeLimit && this.waveIdx >= 0 && this.waveIdx < this.nWaves - 1) this.callWave();
        else if (this.mode === 'campaign' && this.waveIdx >= 0 && this.waveIdx < this.nWaves - 1) { this.breakT += dt; if (this.breakT > 10) this.callWave(); }
        else if (this.mode === 'defense' && this.wave > 0 && !this.pendingBoon) { this.breakT -= dt; if (this.breakT <= 0) this.startDefenseWave(); }
      }
      if (this.spawning || this.units.some(u => u.side === 'atk')) this.waveCleared = false;
    }
    onDefenseWaveCleared() {
      this.waveCleared = true;
      const rw = CH.Defense.rewards(this.wave);
      for (const k in rw) this.bank[k] += rw[k];
      this.emit('waveClear', { n: this.wave, rw });
      this.breakT = 5;
      if (this.wave % 5 === 0) {
        const pool = CH.Defense.BOONS.slice();
        const pick = [];
        while (pick.length < 3) pick.push(pool.splice(Math.floor(this.rand() * pool.length), 1)[0]);
        this.pendingBoon = pick;
        this.emit('boon', pick);
      }
    }
    chooseBoon(id) {
      if (!this.pendingBoon) return false;
      switch (id) {
        case 'repair':
          for (const l of this.layoutCopy) {
            const live = this.buildings.find(b => b.tx === l.tx && b.ty === l.ty && b.type === l.type);
            if (live && !live.dead) live.hp = Math.max(live.hp, live.maxHp * 0.5);
            else if (live && live.dead && B[l.type].cat !== 'trap') {
              live.dead = false; live.hp = live.maxHp * 0.5;
              const idx = this.buildings.indexOf(live) + 1;
              for (let y = live.ty; y < live.ty + live.size; y++) for (let x = live.tx; x < live.tx + live.size; x++) this.occ[y * W + x] = idx;
            } else if (live && B[l.type].cat === 'trap') { live.dead = false; live.armed = true; }
          }
          for (const u of this.units) if (u.side === 'atk') u.path = null;
          break;
        case 'fortify': this.buffs.defDmg *= 1.2; break;
        case 'quickdraw': this.buffs.defRate *= 1.15; break;
        case 'rally':
          for (const h in this.heroesUsed) { const u = this.heroesUsed[h]; if (u.dead) delete this.heroesUsed[h]; else u.hp = u.maxHp; }
          for (const sp of CH.SPELL_ORDER) if (CH.State.spellUnlocked(this.save, sp)) this.spells[sp] = CH.SPELLS[sp].charges;
          break;
        case 'tribute': { const rw = CH.Defense.rewards(this.wave); for (const k of ['gold', 'wood', 'stone']) this.bank[k] += rw[k] * 3; break; }
      }
      this.pendingBoon = null;
      this.emit('sfx', 'upgrade');
      return true;
    }

    /* ================= SIEGE (world-map battles) ================= */
    initSiege(cfg) {
      this.cfgSiege = cfg;
      this.playerSide = cfg.playerSide || 'atk';
      this.stepDt = 1 / 30;
      this.timeLimit = cfg.timeLimit || 120;
      this.opponent = { cl: cfg.cl };
      this.homeTerrain = !!cfg.homeTerrain; this.castleSkin = cfg.castleSkin || null;
      this.dmgBy = { atk: 0, def: 0 };
      this.army = {}; this.heroesAvail = []; this.spells = {};
      const fm = cfg.fortMult || 1;
      for (const l of cfg.layout) {
        if (CH.BUILDINGS[l.type].cat === 'obstacle') continue;
        const b = this.addBuilding(l.type, Math.max(1, l.level), l.tx, l.ty);
        b.hp = b.maxHp = b.maxHp * fm; b.fort = fm;
        if (b.atk) b.atk.dmg *= fm;
        if (b.def.cat === 'trap') b.hidden = this.playerSide === 'atk';
      }
      this.totalForStars = Math.max(1, this.buildings.filter(b => this.countsForStars(b)).length);
      const castle = this.buildings.find(b => b.type === 'castle');
      const cx = castle ? castle.cx : W * T / 2, cy = castle ? castle.cy : H * T / 2;
      this.squads = [];
      // Defenders: garrison squads ring the castle.
      cfg.def.squads.forEach((q, i) => {
        const a = i * 2.39996, r = (1.8 + (i % 4) * 0.7) * T;
        const def = q.monster ? CH.ENEMIES[q.type] : CH.TROOPS[q.type];
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        this.squads.push(this.spawnSquad(def, 'def', q, x, y));
      });
      cfg.def.heroes.forEach((h, i) => {
        const u = this.spawnUnit(CH.HEROES[h.id], 'def', cx + (i ? -1 : 1) * 1.5 * T, cy + 1.6 * T, { mult: CH.State.heroMult(h.level) * 1.2, hero: h.id, heroLevel: h.level });
        u.autoHero = true; u.abilityCd = 4; u.leash = 14 * T; u.skin = h.skin;
      });
      // Attackers deploy in waves from the side they marched in from.
      this.deployQ = this.formationPlan(cfg);
    }
    spawnSquad(def, side, q, x, y) {
      const u = this.spawnUnit(def, side, x, y, { mult: q.count * q.mult, key: q.type, ax: x, ay: y });
      u.count = q.count; u.unitHp = u.maxHp / q.count; u.monster = !!q.monster;
      if (side === 'def') u.leash = 14 * T; // garrisons rally to wherever the enemy breaks in
      u.size = def.size * (1 + Math.min(0.6, Math.log10(Math.max(1, q.count)) * 0.18));
      return u;
    }
    /** Spawn points per formation; dir is the march direction (attacker → defender). */
    formationPlan(cfg) {
      const [w, h] = C.AREA[Math.min(8, cfg.cl) - 1];
      const x0 = Math.floor((W - w) / 2), y0 = Math.floor((H - h) / 2);
      const mid = { x: W / 2, y: H / 2 };
      const edgeOf = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'W' : 'E') : (dy > 0 ? 'N' : 'S'));
      const main = edgeOf(cfg.dir.x, cfg.dir.y);
      const side = { W: ['N', 'S'], E: ['N', 'S'], N: ['W', 'E'], S: ['W', 'E'] };
      const edges = cfg.formation === 'spearhead' ? [main] : cfg.formation === 'pincer' ? side[main] : ['N', 'E', 'S', 'W'];
      const pt = (edge, k, n, spread) => {
        const f = n > 1 ? (k / (n - 1) - 0.5) * spread : 0;
        switch (edge) {
          case 'N': return { x: (mid.x + f * w) * T, y: Math.max(0.6, y0 - 1.5) * T };
          case 'S': return { x: (mid.x + f * w) * T, y: Math.min(H - 0.6, y0 + h + 1.5) * T };
          case 'E': return { x: Math.min(W - 0.6, x0 + w + 1.5) * T, y: (mid.y + f * h) * T };
          default: return { x: Math.max(0.6, x0 - 1.5) * T, y: (mid.y + f * h) * T };
        }
      };
      const q = [];
      const list = cfg.atk.squads;
      const per = {}; list.forEach((_, i) => { const e = edges[i % edges.length]; per[e] = (per[e] || 0) + 1; });
      const idx = {};
      list.forEach((sq, i) => {
        const e = edges[i % edges.length]; idx[e] = (idx[e] || 0);
        const p = pt(e, idx[e]++, per[e], cfg.formation === 'spearhead' ? 0.35 : 0.8);
        q.push({ t: 0.2 + Math.floor(i / edges.length) * 0.25, sq, x: p.x + ((i * 37) % 11 - 5), y: p.y + ((i * 53) % 11 - 5) });
      });
      if (cfg.atk.hero) { const p = pt(main, 0, 1, 0); q.push({ t: 0.6, hero: cfg.atk.hero, x: p.x, y: p.y }); }
      return q.sort((a, b) => a.t - b.t);
    }
    updateSiege() {
      while (this.deployQ.length && this.deployQ[0].t <= this.time) {
        const d = this.deployQ.shift();
        if (d.hero) {
          const u = this.spawnUnit(CH.HEROES[d.hero.id], 'atk', d.x, d.y, { mult: CH.State.heroMult(d.hero.level) * 1.2 * (1 + (d.hero.might || 0) / 100), hero: d.hero.id, heroLevel: d.hero.level });
          u.autoHero = true; u.abilityCd = 3; u.skin = d.hero.skin;
        } else this.squads.push(this.spawnSquad(d.sq.monster ? CH.ENEMIES[d.sq.type] : CH.TROOPS[d.sq.type], 'atk', d.sq, d.x, d.y));
      }
    }
    checkSiegeEnd() {
      const cfg = this.cfgSiege;
      const atkAlive = this.deployQ.length || this.units.some(u => !u.dead && u.side === 'atk');
      const defAlive = this.units.some(u => !u.dead && u.side === 'def');
      const castle = this.buildings.find(b => b.type === 'castle');
      const pct = this.stats.destroyed / this.totalForStars * 100;
      let out = null;
      if (cfg.objective === 'eliminate') {
        if (!defAlive && this.time > 1) out = 'win';
        else if (!atkAlive) out = 'loss';
        else if (this.time >= this.timeLimit) out = 'loss';
      } else {
        if (castle && castle.dead) out = 'win';
        else if (!atkAlive) out = pct >= 40 ? 'partial' : 'loss';
        else if (this.time >= this.timeLimit) out = pct >= 40 ? 'partial' : 'loss';
      }
      if (!out) return;
      this.siegeOutcome = out;
      const playerWon = (out !== 'loss') === (this.playerSide === 'atk');
      this.finish(playerWon ? 'win' : 'lose', out === 'win' ? (cfg.objective === 'eliminate' ? 'The enemy was wiped out.' : 'The castle has fallen.') : out === 'partial' ? 'The attackers broke part of the defenses.' : 'The attack was repelled.');
    }
    /** Troops sent and surviving per side, damage and destruction. */
    siegeSummary() {
      const side = s => {
        const sent = {}, left = {};
        for (const u of this.squads) {
          if (u.side !== s) continue;
          sent[u.key] = (sent[u.key] || 0) + u.count;
          const alive = u.dead ? 0 : Math.min(u.count, Math.ceil(Math.max(0, u.hp) / u.unitHp - 1e-6));
          left[u.key] = (left[u.key] || 0) + alive;
        }
        for (const d of this.deployQ) if (d.sq && s === 'atk') { sent[d.sq.type] = (sent[d.sq.type] || 0) + d.sq.count; left[d.sq.type] = (left[d.sq.type] || 0) + d.sq.count; }
        const lost = {}; for (const t in sent) if (sent[t] - left[t] > 0) lost[t] = sent[t] - left[t];
        return { sent, left, lost };
      };
      return {
        outcome: this.siegeOutcome || 'loss', time: this.time, destruction: Math.round(this.stats.destroyed / this.totalForStars * 100),
        castleDown: !!(this.buildings.find(b => b.type === 'castle') || {}).dead,
        atk: side('atk'), def: side('def'), dmg: { atk: Math.round(this.dmgBy.atk), def: Math.round(this.dmgBy.def) },
      };
    }

    /* ================= End ================= */
    checkEnd() {
      if (this.result) return;
      if (this.mode === 'siege') return this.checkSiegeEnd();
      if (this.mode === 'raid') {
        if (this.destruction >= 100) this.finish('win', 'Total destruction!');
        else if (this.deployedAny && !this.canStillAttack()) this.finish(this.stars > 0 ? 'win' : 'lose', 'Your army is spent.');
      } else if (this.mode === 'campaign') {
        if (this.waveIdx === this.nWaves - 1 && !this.spawning && !this.units.some(u => u.side === 'atk')) this.finish('win', this.stage.obj === 'boss' ? 'The boss is defeated!' : 'Every wave repelled!');
      }
    }
    campaignStars() {
      const f = this.core.hp / this.core.maxHp;
      let s = f >= 0.85 ? 3 : f >= 0.5 ? 2 : 1;
      if (this.stage.obj === 'protect' && this.objLost) s = Math.max(1, s - 1);
      if (this.stage.obj === 'timed') { const left = 1 - this.time / this.timeLimit; s = Math.min(s, left >= 0.3 ? 3 : left >= 0.12 ? 2 : 1); }
      return s;
    }
    finish(result, reason) {
      if (this.result) return;
      this.result = result; this.reason = reason;
      this.emit('sfx', result === 'win' ? 'victory' : 'defeat');
      this.emit('end', { result, reason });
    }

    /* ================= Effects ================= */
    burst(x, y, color, n, speed, kind) {
      for (let i = 0; i < n && this.fx.length < 600; i++) {
        const a = this.rand() * 6.283, v = speed * (0.3 + this.rand() * 0.7);
        this.fx.push({ kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 25, life: kind === 'smoke' ? 0.9 : 0.5, max: kind === 'smoke' ? 0.9 : 0.5, size: kind === 'smoke' ? 6 + this.rand() * 5 : 2 + this.rand() * 2, color });
      }
    }
    explosionFx(x, y, r) {
      this.fx.push({ kind: 'flash', x, y, r: r * 1.3, life: 0.2, max: 0.2, color: '255,190,90' });
      this.fx.push({ kind: 'ring', x, y, r0: 4, r1: r, life: 0.3, max: 0.3, color: '#ffb35a', w: 4 });
      this.burst(x, y, '#ff9a3a', 10, 150, 'spark'); this.burst(x, y, 'rgba(70,60,55,0.7)', 6, 50, 'smoke');
      this.shake = Math.max(this.shake, 0.25);
    }
    updateFx(dt) {
      const L = this.fx;
      for (let i = L.length - 1; i >= 0; i--) {
        const f = L[i]; f.life -= dt;
        if (f.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
        if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; if (f.kind === 'spark') f.vy += 200 * dt; else { f.vx *= 0.95; f.vy *= 0.95; } }
        else if (f.vy) f.y += f.vy * dt;
      }
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.8);
    }
  }
  CH.Battle = Battle;
})();
