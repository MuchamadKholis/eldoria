/* =====================================================================
 * Eldoria — data/codes.js
 * REDEEM CODES. Each entry stores a HASH of the code, not the code itself,
 * so players can't simply read valid codes from the page source.
 *
 * To add a code:  node tools/codegen.js MYCODE2026
 * then paste the printed line into CH.REDEEM_CODES below and rebuild.
 *
 * reward: gold, wood, stone, food, gems, runes, xp, troops: { swordsman: 10 } and/or items: { shield8h: 1, teleAdvanced: 1 }
 *         (redeem rewards may exceed storage limits; they are a gift)
 * start / expires: optional 'YYYY-MM-DD' dates (expires = last valid day)
 * minCastle: optional minimum castle level
 * Each code can be redeemed once per save.
 * ===================================================================== */

/** Small, fast non-cryptographic hash (cyrb53). Obfuscation, not security. */
CH.hashCode = function (code) {
  const str = 'crownhold:' + String(code).trim().toUpperCase().replace(/\s+/g, '');
  let h1 = 0xdeadbeef ^ 7, h2 = 0x41c6ce57 ^ 7;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
};

CH.REDEEM_CODES = [
  // ELDORIA
  {hash: "d9d5e6d8852a8", label: "Welcome to Eldoria", reward: {gold: 5000, wood: 5000, stone: 3000, food: 8000, gems: 100}},
  // WARCHEST
  {hash: "7efbedcb728b5", label: "War chest", reward: {gold: 10000, food: 10000, troops: {swordsman: 500, archer: 300, lightCavalry: 200}}},
  // SAFEHAVEN
  {hash: "171f90d5312e06", label: "Safe haven", reward: {gems: 50, items: {shield8h: 2, teleRandom: 1, teleAdvanced: 1, speed1h: 3}}},
  // DRAGONFIRE
  {hash: "131953c0355b25", label: "Rewards for Developer", reward: {gems: 1000, runes: 1000, troops: {knight: 10000, archer: 10000, swordsman: 10000, lightCavalry: 10000}}, minCastle: 1},
];
