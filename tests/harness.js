/* Loads Crownhold's DOM-free logic into a Node VM (window === global). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = ['js/data/defs.js', 'js/data/content.js', 'js/data/codes.js', 'js/core/state.js', 'js/game/battle.js', 'js/game/siege.js', 'js/core/world.js', 'js/core/throne.js'];
function loadGame() {
  const store = new Map();
  const sb = { console, localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) } };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { CH: sb.CH, sb };
}
function run(b, sec) { const n = Math.round(sec * 60); for (let i = 0; i < n && !b.result; i++) b.update(1 / 60); }
module.exports = { loadGame, run };
