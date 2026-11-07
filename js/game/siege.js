/* =====================================================================
 * Eldoria — game/siege.js
 * Builds world-map battles (march vs kingdom / your kingdom / monsters)
 * for the battle engine in mode 'siege'.
 *
 * Armies number in the thousands, so they are split into SQUADS: one
 * battle unit = `count` troops of one type, with hp and damage scaled by
 * count. Casualties are read back per squad when the battle ends.
 *
 * Battles are DETERMINISTIC: the same cfg (including seed) always gives
 * the same result, so a battle can be resolved headlessly when a march
 * arrives (even offline) and replayed later for the player to watch.
 * ===================================================================== */
CH.Siege = (function () {
  const C = CH.CONFIG, T = C.T;
  const MAX_SQUADS = 40;

  /** Typical troops per squad for a castle level; scales buildings to army sizes. */
  const fortScale = cl => Math.max(1, 150 * Math.pow(1.75, cl - 1) / MAX_SQUADS * 1.1);

  /** Split {type: n} into squads [{type, count}] with at most `max` squads. */
  function squads(army, max = MAX_SQUADS) {
    const types = Object.keys(army).filter(t => army[t] > 0);
    const total = types.reduce((a, t) => a + army[t], 0);
    const out = [];
    if (!total) return out;
    for (const t of types) {
      const k = Math.max(1, Math.min(army[t], Math.round(max * army[t] / total)));
      const base = Math.floor(army[t] / k);
      let rem = army[t] - base * k;
      for (let i = 0; i < k; i++) { out.push({ type: t, count: base + (rem > 0 ? 1 : 0) }); rem--; }
    }
    return out;
  }

  /** Per-troop multiplier from research level, hero class bonus, faction and Warfare tech. */
  function troopMult(type, opts) {
    const d = CH.TROOPS[type];
    let m = CH.RESEARCH.troopMult((opts.research && opts.research[type]) || 1);
    if (opts.hero && d && CH.HEROES[opts.hero.id].cls === d.cls) m *= 1 + CH.HEROES[opts.hero.id].bonus * (1 + 0.1 * (opts.hero.level - 1));
    return m;
  }

  /**
   * attacker: { name, army, hero:{id,level}|null, research, atkBonus, side:'player'|'ai' }
   * defender: { name, kind:'kingdom'|'camp'|'player', cl, layout, army (troops) | monsters ({enemyType:n}),
   *             heroes:[{id,level}], research, fortBonus, homeTerrain }
   * dir: unit vector from attacker toward defender on the world map
   */
  function build({ attacker, defender, formation = 'surround', dir = { x: 1, y: 0 }, seed = 1, playerSide = 'atk' }) {
    const atkSq = squads(attacker.army).map(q => ({ ...q, mult: troopMult(q.type, attacker) * (1 + (attacker.atkBonus || 0)) }));
    let defSq = [];
    // Defenders fight on home turf: +15%.
    if (defender.army) defSq = squads(defender.army).map(q => ({ ...q, mult: troopMult(q.type, defender) * 1.15 }));
    if (defender.monsters) defSq = defSq.concat(squads(defender.monsters, 24).map(q => ({ ...q, monster: true, mult: defender.monsterMult || 1 })));
    return {
      mode: 'siege', seed, playerSide,
      names: { atk: attacker.name, def: defender.name },
      cl: defender.cl || 1, homeTerrain: !!defender.homeTerrain, kind: defender.kind,
      layout: defender.layout || [],
      fortMult: fortScale(defender.cl || 1) * (1 + (defender.fortBonus || 0)),
      objective: defender.kind === 'camp' ? 'eliminate' : 'castle',
      timeLimit: 120, formation, dir,
      atk: { squads: atkSq, hero: attacker.hero || null },
      def: { squads: defSq, heroes: defender.heroes || [] },
    };
  }

  /** A minimal save-like object so the engine never touches the real save. */
  const snapshot = () => ({ buildings: [], army: {}, heroes: {}, research: { troops: {}, spells: { fireball: 1, heal: 1, rage: 1 }, techs: {} }, settings: { damageNumbers: false } });

  function create(cfg) { return new CH.Battle({ ...cfg, save: snapshot() }); }

  /** Runs a battle to completion with no rendering. Returns the engine's summary. */
  function run(cfg) {
    const b = create(cfg);
    let guard = 0;
    while (!b.result && guard++ < 6000) b.update(b.stepDt);
    return b.siegeSummary();
  }

  return { build, run, create, squads, fortScale, troopMult, MAX_SQUADS };
})();
