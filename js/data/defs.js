/* =====================================================================
 * Eldoria — data/defs.js
 * Global config + every data-driven definition in the game.
 * Ranges and speeds are in TILES; the engine converts to pixels.
 * Add content here; the engine, UI and save system pick it up.
 * ===================================================================== */
window.CH = window.CH || {};

CH.CONFIG = {
  VERSION: '1.0.0',
  SAVE_KEY: 'eldoria.save.v1',
  COLS: 30, ROWS: 22, T: 32,
  STEP: 1 / 60,
  MAX_CASTLE: 8,
  // Buildable kingdom area (cols, rows) for each castle level; it grows when the castle is upgraded.
  AREA: [[14, 12], [16, 13], [18, 14], [20, 15], [22, 16], [24, 17], [26, 18], [26, 18]],
  START_RES: { gold: 1500, wood: 1500, stone: 1000, food: 3000, gems: 200, runes: 0 },
  // ---- World (Eldoria) ----
  WORLD_SIZE: 96,          // world map is WORLD_SIZE × WORLD_SIZE tiles
  AI_COUNT: 60,            // AI kingdoms generated (architecture supports many more)
  SEC_PER_TILE: 6,         // base march time per tile (seconds), divided by troop march speed
  ENEMY_WARNING: 150,      // AI attacks on you always give at least this many seconds of warning
  AI_THINK: 120,           // seconds between an AI kingdom's decisions
  OFFLINE_CAP_H: 12,       // offline catch-up is capped (the world "rests" beyond this)
  BEGINNER_MIN: 45,        // beginner protection: first 45 minutes AND castle level < 3
  POST_ATTACK_SHIELD_MIN: 60,  // after you win a defense (90 after a partial loss, 120 after a total loss)
  INCOMING_GAP_MIN: 60,    // minimum gap between two AI attacks on you
  AI_PLAYER_COOLDOWN_H: 3, // one AI won't attack you again for 3h (2h if it holds a grudge)
  TARGET_COOLDOWN_MIN: 30, // you can't raid the same kingdom again for 30 minutes
  MAX_OFFLINE_ATTACKS: 2,
  RAID_TIME: 180,
  WALL_PATH_COST: 7,      // extra A* cost for walking through a wall tile (attackers break it)
  BUILDING_PATH_COST: 22, // extra A* cost for walking through any other building
};

CH.util = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  geo: (base, growth, L) => Math.round(base * Math.pow(growth, L - 1)),
  rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  },
  pick: (arr, rnd) => arr[Math.floor(rnd() * arr.length)],
  // Troops in the thousands: 12.3k / 1.2M
  fmt(n) { n = Math.floor(n); return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(n); },
  time(s) { s = Math.max(0, Math.ceil(s)); if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return m + 'm ' + (s % 60) + 's'; return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; },
};

const g = CH.util.geo;
const costFn = (gold, wood, stone, gr) => L => ({ gold: gold ? g(gold, gr, L) : 0, wood: wood ? g(wood, gr, L) : 0, stone: stone ? g(stone, gr, L) : 0 });

/* ---------------------------------------------------------------------
 * BUILDINGS
 *  cat: core | econ | storage | army | defense | wall | trap | obstacle | objective
 *  counts[castleLevel-1] = how many you may own at that castle level
 *  cost(L) / time(L): price and seconds to build or upgrade TO level L
 *  Max building level is min(maxLevel, castleLevel + 1) (castle: maxLevel)
 * ------------------------------------------------------------------- */
CH.BUILDINGS = {
  castle: { name: 'Castle', cat: 'core', size: 3, unlock: 1, counts: [1, 1, 1, 1, 1, 1, 1, 1], maxLevel: 8,
    cost: costFn(450, 450, 300, 2.05), time: L => g(12, 1.75, L - 1), hp: L => g(2600, 1.35, L),
    cap: L => g(6000, 1.6, L), loot: 0.3,
    atk: { kind: 'arrow', dmg: L => g(20, 1.3, L), rate: 1.0, range: 5, air: true, ground: true },
    desc: 'The heart of your kingdom. Its garrison of archers defends it. Its level caps every other building and unlocks new structures, regions and modes. If it falls in a defense, the battle is lost.' },
  builderHut: { name: 'Builder Hut', cat: 'core', size: 2, unlock: 1, counts: [2, 2, 3, 3, 3, 4, 4, 5], maxLevel: 1,
    cost: () => ({ gold: 0, wood: 0, stone: 0 }), countCost: n => ({ gold: g(900, 2.6, n - 1), wood: g(600, 2.6, n - 1), stone: 0 }),
    time: () => 5, hp: () => 400, desc: 'Each hut is one builder. More builders let you construct more things at once.' },
  goldMine: { name: 'Gold Mine', cat: 'econ', size: 2, unlock: 1, counts: [1, 2, 2, 3, 3, 3, 4, 4], maxLevel: 8, res: 'gold',
    cost: costFn(0, 140, 50, 1.85), time: L => g(4, 1.8, L), hp: L => g(420, 1.3, L),
    prod: L => g(36, 1.4, L), buf: L => g(36, 1.4, L) * 40, loot: 0.5, desc: 'Digs up gold over time. Tap it to collect.' },
  lumberMill: { name: 'Lumber Mill', cat: 'econ', size: 2, unlock: 1, counts: [1, 2, 2, 3, 3, 3, 4, 4], maxLevel: 8, res: 'wood',
    cost: costFn(140, 0, 50, 1.85), time: L => g(4, 1.8, L), hp: L => g(420, 1.3, L),
    prod: L => g(36, 1.4, L), buf: L => g(36, 1.4, L) * 40, loot: 0.5, desc: 'Cuts wood over time. Tap it to collect.' },
  stoneQuarry: { name: 'Stone Quarry', cat: 'econ', size: 2, unlock: 1, counts: [1, 1, 2, 2, 3, 3, 3, 4], maxLevel: 8, res: 'stone',
    cost: costFn(140, 100, 0, 1.85), time: L => g(5, 1.8, L), hp: L => g(460, 1.3, L),
    prod: L => g(26, 1.4, L), buf: L => g(26, 1.4, L) * 40, loot: 0.5, desc: 'Quarries stone for walls, defenses and research.' },
  goldStorage: { name: 'Gold Vault', cat: 'storage', size: 2, unlock: 1, counts: [1, 1, 2, 2, 2, 3, 3, 3], maxLevel: 8, res: 'gold',
    cost: costFn(0, 220, 120, 1.9), time: L => g(5, 1.8, L), hp: L => g(700, 1.3, L), cap: L => g(2000, 1.7, L), loot: 0.25,
    desc: 'Raises how much gold you can hold.' },
  woodStorage: { name: 'Timber Yard', cat: 'storage', size: 2, unlock: 1, counts: [1, 1, 2, 2, 2, 3, 3, 3], maxLevel: 8, res: 'wood',
    cost: costFn(220, 0, 120, 1.9), time: L => g(5, 1.8, L), hp: L => g(700, 1.3, L), cap: L => g(2000, 1.7, L), loot: 0.25,
    desc: 'Raises how much wood you can hold.' },
  stoneStorage: { name: 'Stone Depot', cat: 'storage', size: 2, unlock: 1, counts: [1, 1, 1, 2, 2, 2, 3, 3], maxLevel: 8, res: 'stone',
    cost: costFn(220, 160, 0, 1.9), time: L => g(5, 1.8, L), hp: L => g(800, 1.3, L), cap: L => g(1600, 1.7, L), loot: 0.25,
    desc: 'Raises how much stone you can hold.' },
  barracks: { name: 'Barracks', cat: 'army', size: 2, unlock: 1, counts: [1, 1, 1, 1, 1, 1, 1, 1], maxLevel: 8, trains: 'barracks',
    cost: costFn(180, 260, 0, 1.95), time: L => g(5, 1.8, L), hp: L => g(600, 1.3, L), batch: L => g(60, 1.55, L),
    desc: 'Trains infantry and undead. Higher levels unlock stronger troops, bigger batches and faster training.' },
  archeryRange: { name: 'Archery Range', cat: 'army', size: 2, unlock: 1, counts: [1, 1, 1, 1, 1, 1, 1, 1], maxLevel: 8, trains: 'archeryRange',
    cost: costFn(160, 280, 0, 1.95), time: L => g(5, 1.8, L), hp: L => g(560, 1.3, L), batch: L => g(60, 1.55, L),
    desc: 'Trains archers, crossbowmen, longbowmen and mages.' },
  stable: { name: 'Stable', cat: 'army', size: 2, unlock: 2, counts: [0, 1, 1, 1, 1, 1, 1, 1], maxLevel: 8, trains: 'stable',
    cost: costFn(260, 300, 60, 1.95), time: L => g(8, 1.8, L), hp: L => g(640, 1.3, L), batch: L => g(50, 1.55, L),
    desc: 'Trains cavalry, griffins and dragons.' },
  siegeWorkshop: { name: 'Siege Workshop', cat: 'army', size: 2, unlock: 3, counts: [0, 0, 1, 1, 1, 1, 1, 1], maxLevel: 8, trains: 'siegeWorkshop',
    cost: costFn(300, 400, 200, 1.95), time: L => g(10, 1.8, L), hp: L => g(700, 1.3, L), batch: L => g(30, 1.55, L),
    desc: 'Builds rams, catapults, ballistae, trebuchets and golems: deadly against walls and towers.' },
  farm: { name: 'Farm', cat: 'econ', size: 2, unlock: 1, counts: [2, 2, 3, 3, 4, 4, 5, 5], maxLevel: 8, res: 'food',
    cost: costFn(100, 120, 0, 1.85), time: L => g(4, 1.8, L), hp: L => g(380, 1.3, L),
    prod: L => g(60, 1.4, L), buf: L => g(60, 1.4, L) * 40, loot: 0.5, desc: 'Grows food. Every troop eats food each hour.' },
  granary: { name: 'Granary', cat: 'storage', size: 2, unlock: 1, counts: [1, 1, 2, 2, 2, 3, 3, 3], maxLevel: 8, res: 'food',
    cost: costFn(180, 200, 0, 1.9), time: L => g(5, 1.8, L), hp: L => g(700, 1.3, L), cap: L => g(4000, 1.7, L), loot: 0.25,
    desc: 'Stores food and protects part of it from raiders.' },
  infirmary: { name: 'Infirmary', cat: 'civic', size: 2, unlock: 1, counts: [1, 1, 1, 2, 2, 2, 3, 3], maxLevel: 8,
    cost: costFn(220, 180, 120, 1.9), time: L => g(6, 1.8, L), hp: L => g(600, 1.3, L), beds: L => g(150, 1.6, L),
    desc: 'Wounded troops recover here instead of dying, up to its bed capacity.' },
  watchtower: { name: 'Watchtower', cat: 'civic', size: 2, unlock: 2, counts: [0, 1, 1, 1, 1, 1, 1, 1], maxLevel: 8,
    cost: costFn(250, 250, 150, 1.9), time: L => g(8, 1.8, L), hp: L => g(650, 1.3, L),
    desc: 'Reveals incoming attacks. Level 1: attacker and arrival time. Level 3: army size. Level 5: exact troops and hero.' },
  embassy: { name: 'Embassy', cat: 'civic', size: 2, unlock: 2, counts: [0, 1, 1, 1, 1, 1, 1, 1], maxLevel: 8,
    cost: costFn(300, 300, 200, 1.9), time: L => g(10, 1.8, L), hp: L => g(700, 1.3, L), reinforce: L => g(200, 1.6, L),
    desc: 'Lets you join a faction and receive reinforcements from allies when you are attacked.' },
  trapWorkshop: { name: 'Trap Workshop', cat: 'civic', size: 2, unlock: 2, counts: [0, 1, 1, 1, 1, 1, 1, 1], maxLevel: 8,
    cost: costFn(260, 200, 260, 1.9), time: L => g(8, 1.8, L), hp: L => g(600, 1.3, L),
    desc: 'Required to build traps. Trap level can\'t exceed this workshop\'s level.' },
  tradingPost: { name: 'Trading Post', cat: 'civic', size: 2, unlock: 3, counts: [0, 0, 1, 1, 1, 1, 1, 1], maxLevel: 8,
    cost: costFn(400, 300, 300, 1.9), time: L => g(10, 1.8, L), hp: L => g(650, 1.3, L), rate: L => 0.3 + 0.04 * (L - 1),
    desc: 'Trade one resource for another. Higher levels give better rates.' },
  heroHall: { name: 'Hero Hall', cat: 'army', size: 2, unlock: 1, counts: [1, 1, 1, 1, 1, 1, 1, 1], maxLevel: 5,
    cost: costFn(700, 300, 450, 2.2), time: L => g(15, 1.9, L), hp: L => g(900, 1.3, L),
    desc: 'Recruits heroes. Each level unlocks a new hero and raises the hero level cap by 2.' },
  lab: { name: 'Academy', cat: 'army', size: 2, unlock: 2, counts: [0, 1, 1, 1, 1, 1, 1, 1], maxLevel: 8,
    cost: costFn(500, 400, 400, 2.0), time: L => g(12, 1.85, L), hp: L => g(800, 1.3, L),
    desc: 'Researches technologies, troop upgrades and spells.' },

  archerTower: { name: 'Archer Tower', cat: 'defense', size: 2, unlock: 1, counts: [1, 2, 2, 3, 3, 4, 4, 5], maxLevel: 8,
    cost: costFn(200, 160, 0, 1.85), time: L => g(5, 1.8, L), hp: L => g(520, 1.3, L),
    atk: { kind: 'arrow', dmg: L => g(17, 1.28, L), rate: 1.4, range: 5.5, air: true, ground: true },
    special: 'Level 4+: fires a second arrow at another target.',
    desc: 'Fast, long-range single-target arrows. Hits ground and air.' },
  cannon: { name: 'Cannon', cat: 'defense', size: 2, unlock: 2, counts: [0, 1, 2, 2, 3, 3, 4, 4], maxLevel: 8,
    cost: costFn(250, 0, 220, 1.85), time: L => g(6, 1.8, L), hp: L => g(700, 1.3, L),
    atk: { kind: 'ball', dmg: L => g(48, 1.3, L), rate: 0.6, range: 4.6, air: false, ground: true },
    special: 'Level 4+: shots knock enemies back and briefly stun them.',
    desc: 'Heavy, slow shots. Ground only.' },
  mageTower: { name: 'Mage Tower', cat: 'defense', size: 2, unlock: 3, counts: [0, 0, 1, 1, 2, 2, 3, 3], maxLevel: 8,
    cost: costFn(330, 100, 260, 1.9), time: L => g(8, 1.8, L), hp: L => g(480, 1.3, L),
    atk: { kind: 'orb', dmg: L => g(30, 1.3, L), rate: 0.7, range: 4.6, air: true, ground: true, splash: 1.0, magic: true },
    special: 'Blast radius grows with level. Ignores armor.',
    desc: 'Arcane blasts that damage everything in an area.' },
  frostTower: { name: 'Frost Spire', cat: 'defense', size: 2, unlock: 4, counts: [0, 0, 0, 1, 1, 2, 2, 2], maxLevel: 8,
    cost: costFn(380, 0, 320, 1.9), time: L => g(9, 1.8, L), hp: L => g(520, 1.3, L),
    atk: { kind: 'frost', dmg: L => g(9, 1.3, L), rate: 1.0, range: 4.2, air: true, ground: true, splash: 1.2, magic: true },
    special: 'Slows enemies by 30% (+4% per level). Level 5+: chance to freeze solid.',
    desc: 'Chills groups of enemies so other towers get more shots.' },
  mortar: { name: 'Mortar', cat: 'defense', size: 2, unlock: 4, counts: [0, 0, 0, 1, 1, 2, 2, 3], maxLevel: 8,
    cost: costFn(420, 0, 400, 1.9), time: L => g(9, 1.8, L), hp: L => g(640, 1.3, L),
    atk: { kind: 'shell', dmg: L => g(42, 1.3, L), rate: 0.25, range: 8.5, min: 2.5, air: false, ground: true, splash: 1.5 },
    special: 'Huge range but a blind spot up close. Level 5+: cluster shells.',
    desc: 'Lobs explosive shells across the map. Ground only.' },
  teslaTower: { name: 'Tesla Coil', cat: 'defense', size: 2, unlock: 5, counts: [0, 0, 0, 0, 1, 2, 2, 3], maxLevel: 8,
    cost: costFn(500, 0, 380, 1.9), time: L => g(10, 1.8, L), hp: L => g(600, 1.3, L),
    atk: { kind: 'zap', dmg: L => g(38, 1.3, L), rate: 0.9, range: 4.0, air: true, ground: true, chain: 2, magic: true },
    special: 'Lightning chains to 2 more enemies (3 at level 4+).',
    desc: 'Instant chain lightning. Great against swarms.' },
  ballista: { name: 'Ballista', cat: 'defense', size: 2, unlock: 6, counts: [0, 0, 0, 0, 0, 1, 1, 2], maxLevel: 8,
    cost: costFn(650, 400, 400, 1.9), time: L => g(12, 1.8, L), hp: L => g(800, 1.3, L),
    atk: { kind: 'bolt', dmg: L => g(150, 1.3, L), rate: 0.35, range: 6.5, air: true, ground: true, vsLarge: 2 },
    special: 'Double damage to large units and bosses. Level 4+: bolts pierce.',
    desc: 'Giant crossbow built to fell giants, trolls and dragons.' },

  wall: { name: 'Wall', cat: 'wall', size: 1, unlock: 1, counts: [12, 25, 40, 55, 70, 85, 100, 120], maxLevel: 8, instant: true,
    cost: costFn(0, 0, 25, 1.9), time: () => 0, hp: L => g(420, 1.45, L), desc: 'Blocks ground enemies, who must break through or walk around.' },
  gate: { name: 'Gate', cat: 'wall', size: 1, unlock: 2, counts: [0, 1, 2, 2, 3, 3, 4, 4], maxLevel: 8, instant: true,
    cost: costFn(0, 90, 120, 1.9), time: () => 0, hp: L => g(1300, 1.45, L), desc: 'A reinforced wall section with three times the health.' },
  spikeTrap: { requires: 'trapWorkshop', name: 'Spike Trap', cat: 'trap', size: 1, unlock: 2, counts: [0, 2, 3, 4, 5, 6, 7, 8], maxLevel: 5, instant: true,
    cost: costFn(90, 40, 0, 1.9), time: () => 0, hp: () => 1, trap: { dmg: L => g(110, 1.4, L), radius: 0.6 },
    desc: 'Hidden spikes that hit the first ground enemy to step on them.' },
  bombTrap: { requires: 'trapWorkshop', name: 'Bomb Trap', cat: 'trap', size: 1, unlock: 3, counts: [0, 0, 2, 3, 4, 4, 5, 6], maxLevel: 5, instant: true,
    cost: costFn(160, 0, 60, 1.9), time: () => 0, hp: () => 1, trap: { dmg: L => g(140, 1.4, L), radius: 1.6 },
    desc: 'A hidden explosive that damages every ground enemy nearby.' },
  fireTrap: { requires: 'trapWorkshop', name: 'Fire Trap', cat: 'trap', size: 1, unlock: 5, counts: [0, 0, 0, 0, 1, 2, 2, 3], maxLevel: 5, instant: true,
    cost: costFn(260, 120, 0, 1.9), time: () => 0, hp: () => 1, trap: { dps: L => g(45, 1.4, L), radius: 1.6, dur: 5 },
    desc: 'Erupts into a burning field that scorches enemies for 5 seconds.' },

  tree: { name: 'Old Tree', cat: 'obstacle', size: 2, unlock: 99, counts: [0], maxLevel: 1, hp: () => 1, desc: 'Clear it to free space. Sometimes hides gems.' },
  rock: { name: 'Boulder', cat: 'obstacle', size: 1, unlock: 99, counts: [0], maxLevel: 1, hp: () => 1, desc: 'Clear it to free space. Sometimes hides gems.' },
  outpost: { name: 'Outpost', cat: 'objective', size: 2, unlock: 99, counts: [0], maxLevel: 8, hp: L => g(1800, 1.3, L),
    atk: { kind: 'arrow', dmg: L => g(18, 1.3, L), rate: 1.0, range: 4.5, air: true, ground: true }, desc: 'A frontier fort with a small archer garrison. You must protect it.' },
};
// Clearing obstacles: small cost, a resource yield and a chance of gems (a free gem source).
CH.OBSTACLE_CLEAR = { tree: { cost: { gold: 60, wood: 0, stone: 0 }, yield: { wood: 120 }, time: 5 }, rock: { cost: { gold: 0, wood: 60, stone: 0 }, yield: { stone: 90 }, time: 5 } };

CH.BUILD_MENU = [
  { id: 'econ', name: 'Economy', types: ['goldMine', 'lumberMill', 'stoneQuarry', 'farm', 'goldStorage', 'woodStorage', 'stoneStorage', 'granary', 'builderHut'] },
  { id: 'army', name: 'Military', types: ['barracks', 'archeryRange', 'stable', 'siegeWorkshop', 'heroHall', 'lab', 'infirmary'] },
  { id: 'civic', name: 'Civic', types: ['watchtower', 'embassy', 'trapWorkshop', 'tradingPost'] },
  { id: 'defense', name: 'Defense', types: ['archerTower', 'cannon', 'mageTower', 'frostTower', 'mortar', 'teslaTower', 'ballista'] },
  { id: 'walls', name: 'Walls & traps', types: ['wall', 'gate', 'spikeTrap', 'bombTrap', 'fireTrap'] },
];

/* ---------------------------------------------------------------------
 * UNITS — shared by player troops, summons and enemies
 *  target: any | defense | resource | walls      (building preference)
 *  proj: projectile kind for ranged attackers (omit = melee)
 *  size: body radius in px · large: counts as large for ballista/spearman
 * ------------------------------------------------------------------- */
/* 22 troop types in 5 classes. Stats are PER TROOP; battles group troops into squads.
 * cls counters: infantry > cavalry > ranged > infantry (×1.5). Siege deals ×siege to buildings, ×0.35 to troops.
 * march: world-map speed factor · load: resources carried · upkeep: food per hour */
const TR = (o) => ({ armor: 0, target: 'any', march: 1, ...o, power: Math.round(Math.sqrt(o.hp / (1 - (o.armor || 0)) * o.dmg * o.rate) / 3) || 1 });
CH.TROOPS = {
  // Infantry — Barracks
  swordsman: TR({ name: 'Swordsman', cls: 'infantry', tier: 1, building: 'barracks', unlock: 1, hp: 110, dmg: 15, rate: 1.0, range: 0.6, speed: 1.5, load: 10, cost: { gold: 20, wood: 0, stone: 0, food: 20 }, time: 0.6, upkeep: 1, size: 9, sprite: 'swordsman', desc: 'Cheap, sturdy frontline infantry.' }),
  spearman: TR({ name: 'Spearman', cls: 'infantry', tier: 1, building: 'barracks', unlock: 2, hp: 130, dmg: 17, rate: 0.9, range: 1.2, speed: 1.4, vsLarge: 2.5, load: 10, cost: { gold: 25, wood: 10, stone: 0, food: 20 }, time: 0.7, upkeep: 1, size: 9, sprite: 'spearman', desc: 'Long reach; 2.5× damage to large units.' }),
  skeletonArmy: TR({ name: 'Skeleton Horde', cls: 'special', tier: 1, building: 'barracks', unlock: 3, hp: 80, dmg: 12, rate: 1.0, range: 0.6, speed: 1.6, load: 4, cost: { gold: 18, wood: 0, stone: 6, food: 0 }, time: 0.4, upkeep: 0, size: 8, sprite: 'skeleton', desc: 'Undead: weak, but they never eat.' }),
  knight: TR({ name: 'Knight', cls: 'infantry', tier: 2, building: 'barracks', unlock: 4, hp: 440, dmg: 30, rate: 0.9, range: 0.7, speed: 1.2, armor: 0.3, load: 20, cost: { gold: 80, wood: 0, stone: 30, food: 60 }, time: 1.5, upkeep: 3, size: 11, sprite: 'knight', desc: 'Heavily armored infantry.' }),
  berserker: TR({ name: 'Berserker', cls: 'infantry', tier: 2, building: 'barracks', unlock: 5, hp: 260, dmg: 30, rate: 1.5, range: 0.6, speed: 1.8, rage: true, load: 15, cost: { gold: 70, wood: 20, stone: 0, food: 50 }, time: 1.3, upkeep: 3, size: 10, sprite: 'berserker', desc: 'Frenzies below half health.' }),
  necromancer: TR({ name: 'Necromancer', cls: 'special', tier: 3, building: 'barracks', unlock: 6, hp: 170, dmg: 20, rate: 0.8, range: 3.0, speed: 1.2, proj: 'shadow', magic: true, summon: { unit: 'skeleton', every: 6, max: 4 }, load: 8, cost: { gold: 150, wood: 0, stone: 60, food: 60 }, time: 2.6, upkeep: 4, size: 10, sprite: 'necromancer', desc: 'Raises skeletons in battle.' }),
  paladin: TR({ name: 'Paladin', cls: 'infantry', tier: 3, building: 'barracks', unlock: 7, hp: 620, dmg: 26, rate: 0.9, range: 0.8, speed: 1.15, armor: 0.25, heal: 14, load: 25, cost: { gold: 160, wood: 0, stone: 80, food: 100 }, time: 3, upkeep: 5, size: 11, sprite: 'paladin', desc: 'Heals nearby allies.' }),
  // Ranged — Archery Range
  archer: TR({ name: 'Archer', cls: 'ranged', tier: 1, building: 'archeryRange', unlock: 1, hp: 55, dmg: 14, rate: 1.0, range: 3.5, speed: 1.4, proj: 'arrow', load: 8, cost: { gold: 20, wood: 15, stone: 0, food: 20 }, time: 0.6, upkeep: 1, size: 8, sprite: 'archer', desc: 'Shoots over walls.' }),
  crossbowman: TR({ name: 'Crossbowman', cls: 'ranged', tier: 2, building: 'archeryRange', unlock: 3, hp: 90, dmg: 28, rate: 0.7, range: 3.8, speed: 1.3, proj: 'arrow', load: 10, cost: { gold: 50, wood: 40, stone: 0, food: 40 }, time: 1.2, upkeep: 2, size: 9, sprite: 'crossbowman', desc: 'Heavy bolts at long range.' }),
  mage: TR({ name: 'Battle Mage', cls: 'ranged', tier: 3, building: 'archeryRange', unlock: 5, hp: 100, dmg: 38, rate: 0.7, range: 3.2, speed: 1.3, proj: 'orb', splash: 1.0, magic: true, load: 8, cost: { gold: 140, wood: 0, stone: 60, food: 70 }, time: 2.6, upkeep: 4, size: 9, sprite: 'mage', desc: 'Area magic that ignores armor.' }),
  longbowman: TR({ name: 'Longbowman', cls: 'ranged', tier: 3, building: 'archeryRange', unlock: 6, hp: 110, dmg: 34, rate: 0.9, range: 5.0, speed: 1.3, proj: 'arrow', load: 12, cost: { gold: 110, wood: 90, stone: 0, food: 70 }, time: 2.5, upkeep: 4, size: 9, sprite: 'longbowman', desc: 'Outranges most towers.' }),
  // Cavalry — Stable
  lightCavalry: TR({ name: 'Light Cavalry', cls: 'cavalry', tier: 1, building: 'stable', unlock: 1, hp: 140, dmg: 16, rate: 1.2, range: 0.7, speed: 2.6, march: 1.5, load: 20, cost: { gold: 30, wood: 0, stone: 0, food: 30 }, time: 0.8, upkeep: 2, size: 11, sprite: 'lightCav', desc: 'Fast raiders; great loot capacity.' }),
  heavyCavalry: TR({ name: 'Heavy Cavalry', cls: 'cavalry', tier: 2, building: 'stable', unlock: 3, hp: 460, dmg: 30, rate: 0.9, range: 0.7, speed: 2.0, march: 1.3, armor: 0.3, load: 30, cost: { gold: 90, wood: 0, stone: 40, food: 70 }, time: 1.6, upkeep: 4, size: 12, sprite: 'heavyCav', desc: 'Armored lancers.' }),
  wolfRider: TR({ name: 'Wolf Rider', cls: 'cavalry', tier: 2, building: 'stable', unlock: 4, hp: 300, dmg: 34, rate: 1.3, range: 0.7, speed: 2.8, march: 1.6, load: 25, cost: { gold: 80, wood: 20, stone: 0, food: 70 }, time: 1.5, upkeep: 4, size: 12, sprite: 'wolfRider', desc: 'Savage and very fast.' }),
  griffin: TR({ name: 'Griffin', cls: 'special', tier: 3, building: 'stable', unlock: 6, hp: 520, dmg: 40, rate: 1.1, range: 0.8, speed: 2.4, march: 1.4, flying: true, target: 'defense', large: true, load: 30, cost: { gold: 150, wood: 60, stone: 0, food: 100 }, time: 3.5, upkeep: 6, size: 13, sprite: 'griffin', desc: 'Flies over walls and dives onto defenses.' }),
  dragonRider: TR({ name: 'Dragon Rider', cls: 'cavalry', tier: 4, building: 'stable', unlock: 7, hp: 1150, dmg: 60, rate: 0.6, range: 2.5, speed: 1.3, march: 1.2, flying: true, proj: 'fire', splash: 1.2, large: true, load: 40, cost: { gold: 420, wood: 0, stone: 200, food: 250 }, time: 8, upkeep: 10, size: 16, sprite: 'dragonRider', desc: 'Flying cavalry that burns everything below.' }),
  dragon: TR({ name: 'Dragon', cls: 'special', tier: 4, building: 'stable', unlock: 8, hp: 3000, dmg: 120, rate: 0.6, range: 2.6, speed: 1.2, march: 1.1, flying: true, proj: 'fire', splash: 1.5, large: true, load: 80, cost: { gold: 800, wood: 0, stone: 400, food: 500 }, time: 15, upkeep: 25, size: 22, sprite: 'dragon', desc: 'The ultimate beast of war.' }),
  // Siege — Siege Workshop
  siegeRam: TR({ name: 'Siege Ram', cls: 'siege', tier: 1, building: 'siegeWorkshop', unlock: 1, hp: 420, dmg: 60, rate: 0.5, range: 0.7, speed: 0.9, march: 0.7, target: 'walls', siege: 4, large: true, load: 40, cost: { gold: 40, wood: 80, stone: 0, food: 30 }, time: 1.5, upkeep: 2, size: 13, sprite: 'siegeRam', desc: 'Smashes walls and gates.' }),
  catapult: TR({ name: 'Catapult', cls: 'siege', tier: 2, building: 'siegeWorkshop', unlock: 2, hp: 160, dmg: 40, rate: 0.4, range: 6, speed: 0.8, march: 0.7, target: 'defense', proj: 'rock', splash: 0.8, siege: 3, large: true, load: 30, cost: { gold: 60, wood: 120, stone: 60, food: 40 }, time: 2, upkeep: 3, size: 13, sprite: 'catapult', desc: 'Lobs boulders at towers from range.' }),
  ballistaCrew: TR({ name: 'Ballista', cls: 'siege', tier: 2, building: 'siegeWorkshop', unlock: 4, hp: 180, dmg: 70, rate: 0.5, range: 5.5, speed: 0.8, march: 0.7, proj: 'bolt', vsLarge: 2.5, siege: 2, large: true, load: 20, cost: { gold: 80, wood: 140, stone: 80, food: 50 }, time: 2.5, upkeep: 3, size: 13, sprite: 'ballistaCrew', desc: 'Huge bolts that fell large units and towers.' }),
  trebuchet: TR({ name: 'Trebuchet', cls: 'siege', tier: 3, building: 'siegeWorkshop', unlock: 6, hp: 260, dmg: 120, rate: 0.3, range: 8, speed: 0.7, march: 0.6, target: 'defense', proj: 'rock', splash: 1.2, siege: 4, large: true, load: 40, cost: { gold: 120, wood: 260, stone: 200, food: 80 }, time: 4, upkeep: 5, size: 15, sprite: 'trebuchet', desc: 'Devastating long-range siege engine.' }),
  golem: TR({ name: 'Golem', cls: 'siege', tier: 4, building: 'siegeWorkshop', unlock: 8, hp: 3400, dmg: 40, rate: 0.6, range: 0.8, speed: 0.65, march: 0.6, target: 'defense', armor: 0.25, siege: 2.5, large: true, split: { unit: 'golemite', count: 2 }, load: 60, cost: { gold: 400, wood: 0, stone: 600, food: 0 }, time: 12, upkeep: 0, size: 18, sprite: 'golem', desc: 'A walking fortress made of stone. Needs no food.' }),
};
CH.COUNTER = { infantry: { cavalry: 1.5 }, cavalry: { ranged: 1.5, siege: 1.5 }, ranged: { infantry: 1.5 }, siege: {}, special: {} };
CH.CLASS_NAMES = { infantry: 'Infantry', ranged: 'Ranged', cavalry: 'Cavalry', siege: 'Siege', special: 'Special' };
CH.TROOP_ORDER = Object.keys(CH.TROOPS);

CH.SUMMONS = {
  skeleton: { name: 'Skeleton', hp: 80, dmg: 12, rate: 1.0, range: 0.6, speed: 1.6, target: 'any', size: 8, sprite: 'skeleton' },
  golemite: { name: 'Golemite', hp: 700, dmg: 18, rate: 0.7, range: 0.7, speed: 0.9, target: 'defense', armor: 0.2, size: 11, sprite: 'golem' },
};

/* Heroes command a march (or your home defense). Each boosts one troop class. */
CH.HEROES = {
  aldric: { name: 'Aldric', title: 'The Lion King', role: 'Infantry commander', cls: 'infantry', bonus: 0.15, unlock: 1, cost: { gold: 1000, wood: 500, stone: 0 },
    hp: 1700, dmg: 70, rate: 1.0, range: 0.8, speed: 1.4, armor: 0.3, size: 13, sprite: 'king', aura: 0.2,
    ability: { id: 'royalCharge', name: 'Royal Charge', desc: 'Slams the ground: damage and a 2s stun nearby.', cd: 22 }, desc: '+15% infantry attack and health. Boosts nearby allies by 20%.' },
  elara: { name: 'Elara', title: 'Queen of the Longbow', role: 'Ranged commander', cls: 'ranged', bonus: 0.15, unlock: 2, cost: { gold: 2000, wood: 1500, stone: 0 },
    hp: 750, dmg: 62, rate: 1.2, range: 4.5, speed: 1.5, size: 11, sprite: 'queen', proj: 'arrow',
    ability: { id: 'arrowStorm', name: 'Arrow Storm', desc: 'A volley of 10 arrows.', cd: 18 }, desc: '+15% ranged attack and health.' },
  thorne: { name: 'Thorne', title: 'The Iron Lance', role: 'Cavalry commander', cls: 'cavalry', bonus: 0.15, unlock: 3, cost: { gold: 3000, wood: 1000, stone: 1500 },
    hp: 1500, dmg: 85, rate: 1.0, range: 0.8, speed: 2.4, armor: 0.25, size: 13, sprite: 'thorne', lifesteal: 0.15,
    ability: { id: 'royalCharge', name: 'Lance Charge', desc: 'Crashes into the enemy: damage and stun.', cd: 18 }, desc: '+15% cavalry attack and health; +10% march speed.' },
  magnus: { name: 'Magnus', title: 'Archmage of Eldoria', role: 'Mage commander', cls: 'ranged', bonus: 0.12, unlock: 4, cost: { gold: 4000, wood: 0, stone: 2500 },
    hp: 640, dmg: 80, rate: 0.7, range: 4.0, speed: 1.3, size: 11, sprite: 'archmage', proj: 'orb', splash: 1.3, magic: true,
    ability: { id: 'meteor', name: 'Meteor', desc: 'A meteor devastates a wide area.', cd: 24 }, desc: '+12% ranged; his meteor wrecks buildings and crowds.' },
  morgrath: { name: 'Morgrath', title: 'The Bone Whisperer', role: 'Necromancer commander', cls: 'special', bonus: 0.18, unlock: 5, cost: { gold: 5000, wood: 0, stone: 3500 },
    hp: 800, dmg: 50, rate: 0.9, range: 3.5, speed: 1.3, size: 11, sprite: 'necroHero', proj: 'shadow', magic: true, summon: { unit: 'skeleton', every: 8, max: 3 },
    ability: { id: 'raiseLegion', name: 'Raise Legion', desc: 'Raises 6 skeletons at once.', cd: 25 }, desc: '+18% special troops (undead, griffins, dragons).' },
  drakon: { name: 'Drakon', title: 'The Dragonlord', role: 'Siege commander', cls: 'siege', bonus: 0.2, unlock: 5, cost: { gold: 7000, wood: 3000, stone: 4000 },
    hp: 1400, dmg: 95, rate: 0.9, range: 0.8, speed: 1.5, armor: 0.25, lifesteal: 0.3, size: 13, sprite: 'darkKnight',
    ability: { id: 'shadowCleave', name: 'Dragonfire Cleave', desc: 'A spinning strike that heals him.', cd: 16 }, desc: '+20% siege attack and health.' },
};
CH.HERO_ORDER = Object.keys(CH.HEROES);
CH.heroXpFor = L => Math.round(120 * Math.pow(L, 1.6));
CH.heroUpgradeCost = L => ({ gold: g(900, 1.5, L), wood: 0, stone: g(500, 1.5, L), runes: L >= 4 ? L - 3 : 0 });

CH.SPELLS = {
  fireball: { name: 'Fireball', unlock: 1, charges: 2, radius: 2.0, dmg: L => g(260, 1.35, L), desc: 'Explodes in an area, hurting enemy units and buildings.' },
  heal: { name: 'Healing Rain', unlock: 2, charges: 1, radius: 2.5, heal: L => g(70, 1.3, L), dur: 5, desc: 'Heals your units in an area every second for 5 seconds.' },
  rage: { name: 'Battle Rage', unlock: 3, charges: 1, radius: 2.5, boost: L => 0.35 + 0.05 * L, dur: 7, desc: 'Your units in the area deal more damage and move faster.' },
};
CH.SPELL_ORDER = Object.keys(CH.SPELLS);

/* Research: troop level L multiplies hp and damage by (1 + 0.14·(L-1)). Max troop level = lab level + 1 (max 6). */
CH.RESEARCH = {
  troopMult: L => 1 + 0.14 * (L - 1),
  troopCost: (t, L) => ({ gold: g(150 + CH.TROOPS[t].cost * 4, 1.85, L - 1), wood: 0, stone: g(80 + CH.TROOPS[t].cost * 3, 1.85, L - 1) }),
  spellCost: L => ({ gold: g(500, 1.9, L - 1), wood: 0, stone: g(400, 1.9, L - 1) }),
  time: L => g(10, 1.9, L - 1),
  maxLevel: labL => Math.min(6, labL + 1),
};

/* ---------------------------------------------------------------------
 * ENEMIES (AI attackers in Campaign and Endless Defense)
 * gold = battle gold in campaign · threat = wave budget cost
 * ------------------------------------------------------------------- */
CH.ENEMIES = {
  goblin: { name: 'Goblin', hp: 60, dmg: 10, rate: 1.1, range: 0.6, speed: 1.9, target: 'resource', vsRes: 2, size: 8, sprite: 'goblin', threat: 1, gold: 5, desc: 'Fast looters that go for resource buildings.' },
  wolf: { name: 'Dire Wolf', hp: 85, dmg: 12, rate: 1.2, range: 0.6, speed: 2.5, target: 'any', size: 9, sprite: 'wolf', threat: 1.5, gold: 6, desc: 'Very fast pack hunters.' },
  orc: { name: 'Orc Brute', hp: 280, dmg: 24, rate: 0.8, range: 0.7, speed: 1.1, target: 'any', armor: 0.35, size: 11, sprite: 'orc', threat: 4, gold: 12, desc: 'Armored and tough.' },
  sapper: { name: 'Goblin Sapper', hp: 70, dmg: 260, rate: 1, range: 0.7, speed: 1.8, target: 'walls', suicide: 1.5, size: 8, sprite: 'sapper', threat: 2.5, gold: 8, desc: 'Runs at your walls and blows them up.' },
  bat: { name: 'Cave Bat', hp: 55, dmg: 9, rate: 1.2, range: 0.6, speed: 2.0, target: 'defense', flying: true, size: 8, sprite: 'bat', threat: 1.6, gold: 5, desc: 'Flies over walls.' },
  skeleton: { name: 'Skeleton', hp: 140, dmg: 15, rate: 1.0, range: 0.6, speed: 1.4, target: 'any', armor: 0.2, size: 9, sprite: 'skeleton', threat: 2.5, gold: 8, desc: 'The undead rank and file.' },
  skeletonMage: { name: 'Skeleton Mage', hp: 110, dmg: 24, rate: 0.7, range: 3.0, speed: 1.2, target: 'any', proj: 'shadow', magic: true, splash: 0.8, size: 9, sprite: 'skeletonMage', threat: 4, gold: 10, desc: 'Ranged magic that hits groups.' },
  spider: { name: 'Giant Spider', hp: 170, dmg: 16, rate: 1.2, range: 0.6, speed: 2.0, target: 'any', split: { unit: 'spiderling', count: 3 }, size: 11, sprite: 'spider', threat: 4, gold: 9, desc: 'Bursts into spiderlings when killed.' },
  spiderling: { name: 'Spiderling', hp: 35, dmg: 6, rate: 1.4, range: 0.5, speed: 2.4, target: 'any', size: 6, sprite: 'spider', threat: 0.5, gold: 1 },
  troll: { name: 'Troll', hp: 1200, dmg: 45, rate: 0.6, range: 0.8, speed: 0.8, target: 'defense', regen: 0.015, large: true, size: 16, sprite: 'troll', threat: 22, gold: 45, desc: 'Regenerates and smashes defenses.' },
  ogre: { name: 'Ogre', hp: 1600, dmg: 55, rate: 0.5, range: 0.9, speed: 0.8, target: 'defense', armor: 0.25, large: true, stomp: { every: 6, radius: 1.8, dmg: 60 }, size: 17, sprite: 'ogre', threat: 30, gold: 60, desc: 'Stomps the ground, damaging everything around it.' },
  darkKnight: { name: 'Dark Knight', hp: 520, dmg: 34, rate: 0.9, range: 0.7, speed: 1.15, target: 'any', armor: 0.45, size: 11, sprite: 'darkKnightEnemy', threat: 8, gold: 18, desc: 'Heavy armor shrugs off arrows and cannonballs. Use magic.' },
  imp: { name: 'Imp', hp: 90, dmg: 14, rate: 1.2, range: 2.4, speed: 1.9, target: 'any', proj: 'fire', magic: true, size: 8, sprite: 'imp', threat: 2.5, gold: 6, desc: 'Fast fire-flinging demons.' },
  whelp: { name: 'Dragon Whelp', hp: 380, dmg: 26, rate: 0.8, range: 2.2, speed: 1.6, target: 'any', flying: true, proj: 'fire', splash: 0.9, size: 12, sprite: 'whelp', threat: 8, gold: 18, desc: 'Young dragons that fly over walls.' },
  // Bosses
  trollChief: { name: 'Grumak the Troll Chief', hp: 5200, dmg: 80, rate: 0.6, range: 1.0, speed: 0.8, target: 'any', regen: 0.008, large: true, boss: true, stomp: { every: 7, radius: 2.2, dmg: 90 }, size: 22, sprite: 'trollChief', gold: 250, desc: 'Regenerates and stomps.' },
  orcWarlord: { name: 'Warlord Gorthak', hp: 6500, dmg: 90, rate: 0.7, range: 1.0, speed: 0.9, target: 'any', armor: 0.2, large: true, boss: true, warcry: { every: 8, radius: 4, boost: 0.5, dur: 4 }, summonE: { unit: 'orc', every: 14, count: 2 }, size: 21, sprite: 'orcWarlord', gold: 300, desc: 'War cries send nearby enemies into a frenzy.' },
  broodmother: { name: 'The Broodmother', hp: 7000, dmg: 70, rate: 0.9, range: 1.0, speed: 1.0, target: 'any', large: true, boss: true, summonE: { unit: 'spider', every: 6, count: 2 }, split: { unit: 'spiderling', count: 10 }, size: 22, sprite: 'broodmother', gold: 320, desc: 'Endlessly births spiders.' },
  frostGiant: { name: 'Ymrik the Frost Giant', hp: 9000, dmg: 110, rate: 0.5, range: 1.1, speed: 0.7, target: 'defense', armor: 0.3, large: true, boss: true, freeze: { every: 9, radius: 4, dur: 2.5 }, size: 23, sprite: 'frostGiant', gold: 380, desc: 'Freezes nearby towers solid.' },
  demonLord: { name: 'Azgaroth the Demon Lord', hp: 12000, dmg: 120, rate: 0.7, range: 1.2, speed: 0.9, target: 'any', armor: 0.3, large: true, boss: true, summonE: { unit: 'imp', every: 7, count: 3 }, aura: { radius: 2.5, dps: 40 }, size: 24, sprite: 'demonLord', gold: 450, desc: 'Burns everything near him and summons imps.' },
  dragon: { name: 'Vyrathax the Ashen Dragon', hp: 14000, dmg: 90, rate: 0.6, range: 3.0, speed: 0.9, target: 'any', flying: true, proj: 'fire', splash: 1.6, large: true, boss: true, inferno: { every: 9, radius: 3, dmg: 260 }, enrage: 0.5, size: 26, sprite: 'dragon', gold: 600, desc: 'Flies, breathes fire, and enrages when wounded.' },
};

/* ---------------------------------------------------------------------
 * ITEMS (bag) — from redeem codes, monster camps, events and rewards
 * ------------------------------------------------------------------- */
CH.ITEMS = {
  speed5m: { name: 'Speed-up 5m', kind: 'speed', sec: 300, icon: 'time', desc: 'Cuts 5 minutes from a building, research, training or healing timer.' },
  speed1h: { name: 'Speed-up 1h', kind: 'speed', sec: 3600, icon: 'time', desc: 'Cuts 1 hour from a timer.' },
  shield2h: { name: 'Peace Shield 2h', kind: 'shield', ms: 2 * 3600e3, icon: 'shield', desc: 'No kingdom can attack or scout you for 2 hours. Marching on others drops it.' },
  shield8h: { name: 'Peace Shield 8h', kind: 'shield', ms: 8 * 3600e3, icon: 'shield', desc: 'No kingdom can attack or scout you for 8 hours. Marching on others drops it.' },
  teleRandom: { name: 'Random Teleport', kind: 'teleport', random: true, icon: 'map', desc: 'Moves your castle to a random safe spot.' },
  teleAdvanced: { name: 'Advanced Teleport', kind: 'teleport', icon: 'map', desc: 'Moves your castle to a tile you choose on the world map.' },
  goldPack: { name: 'Gold Chest', kind: 'res', res: { gold: 5000 }, icon: 'gold', desc: '+5,000 gold.' },
  woodPack: { name: 'Timber Bundle', kind: 'res', res: { wood: 5000 }, icon: 'wood', desc: '+5,000 wood.' },
  stonePack: { name: 'Stone Crate', kind: 'res', res: { stone: 5000 }, icon: 'stone', desc: '+5,000 stone.' },
  foodPack: { name: 'Food Wagon', kind: 'res', res: { food: 8000 }, icon: 'food', desc: '+8,000 food.' },
};
CH.ITEM_ORDER = Object.keys(CH.ITEMS);

/* Gem shop. Resources bought here are added directly and may exceed storage (like a gift). */
CH.GEM_SHOP = {
  resources: [
    { amount: 5000, gems: 20 }, { amount: 25000, gems: 90 }, { amount: 100000, gems: 320 },
  ],
  foodBonus: 1.5, // food packs contain 50% more
  items: { speed5m: 10, speed1h: 60, shield2h: 80, shield8h: 200, teleRandom: 100, teleAdvanced: 300 },
  fillPerGem: 300, // "top up to capacity": 1 gem per 300 resources missing
};

/* Skins: four themes for your castle and every hero. Cosmetic. */
CH.SKINS = {
  classic: { name: 'Classic', theme: 'Default', castle: 0, hero: 0 },
  verdant: { name: 'Verdant Crown', theme: 'Dunia · Earthly', tint: 'rgba(80,170,60,0.38)', aura: '140,230,120', fx: 'leaf', wall: '#8f9a72', roof: '#3f8a3a', castle: 400, hero: 250 },
  celestial: { name: 'Celestial Sanctum', theme: 'Surgawi · Heavenly', tint: 'rgba(255,246,215,0.55)', aura: '255,236,160', fx: 'light', wall: '#f4efe2', roof: '#e8c25a', castle: 900, hero: 500 },
  infernal: { name: 'Infernal Bastion', theme: 'Neraka · Hellfire', tint: 'rgba(190,35,15,0.48)', aura: '255,90,30', fx: 'ember', wall: '#3a2624', roof: '#c2401f', castle: 900, hero: 500 },
  abyssal: { name: 'Abyssal Throne', theme: 'Kegelapan · Darkness', tint: 'rgba(45,15,80,0.58)', aura: '170,90,255', fx: 'shadow', wall: '#2a2436', roof: '#6a3aa8', castle: 900, hero: 500 },
};
CH.SKIN_ORDER = Object.keys(CH.SKINS);
CH.GEM_SHOP.marchSlot = n => 300 * Math.pow(2, n); // price of the (n+1)th extra march slot
CH.MAX_MARCHES = 5;
/* The Throne of Eldoria */
CH.THRONE = {
  name: 'Aurelion Citadel', title: 'King of Eldoria',
  warDay: 6, warHour: 15, warMinutes: 30, // Saturday 15:00 local time, 30 minutes
  rallyMax: 10, rallyMuster: 60, // up to 10 castles; rallies gather for 60 s before marching
  kingBonus: { prod: 0.1, atk: 0.05 },
  prizes: [
    { tier: 'royal', name: 'Royal Treasure', count: 1, reward: { gems: 1000, gold: 100000, food: 100000 }, items: { shield8h: 2, teleAdvanced: 1, speed1h: 5 } },
    { tier: 'noble', name: 'Noble Chest', count: 3, reward: { gems: 300, gold: 50000, food: 50000 }, items: { speed1h: 2 } },
    { tier: 'knight', name: 'Knight Chest', count: 6, reward: { gems: 100, gold: 20000, wood: 20000 }, items: { speed5m: 5 } },
  ],
};

/* Academy technologies (on top of troop research). Max level = academy level. */
CH.TECHS = {
  prosperity: { name: 'Prosperity', desc: '+5% production of all resources per level.', max: 8 },
  logistics: { name: 'Logistics', desc: '+6% march speed per level.', max: 8 },
  fortification: { name: 'Fortification', desc: '+6% building health and tower damage per level.', max: 8 },
  medicine: { name: 'Medicine', desc: '+12% infirmary beds and 10% faster healing per level.', max: 8 },
  scouting: { name: 'Scouting', desc: 'Level 1: troops by class. Level 2: exact troops, hero and resources.', max: 3 },
  warfare: { name: 'Warfare', desc: '+3% attack for all troops per level.', max: 8 },
  agriculture: { name: 'Agriculture', desc: '-5% troop food upkeep per level.', max: 6 },
};
CH.TECH_ORDER = Object.keys(CH.TECHS);
CH.RESEARCH.techCost = L => ({ gold: g(600, 1.9, L), wood: g(400, 1.9, L), stone: g(400, 1.9, L) });
CH.RESEARCH.techTime = L => g(20, 1.9, L);
CH.troopPower = t => CH.TROOPS[t] ? CH.TROOPS[t].power : 1;
