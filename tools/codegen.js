/* Generate a redeem-code entry for js/data/codes.js
 *   node tools/codegen.js MYCODE2026 [gold=1000] [food=5000] [gems=20] [runes=2] [swordsman=10] [shield8h=1] [teleAdvanced=1] [expires=2026-12-31] [label="Event gift"]
 * Items: speed5m speed1h shield2h shield8h teleRandom teleAdvanced goldPack woodPack stonePack foodPack
 * Prints a line to paste into CH.REDEEM_CODES. The real code is NOT stored. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const sb = { window: {} }; sb.window = sb; sb.CH = {};
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'codes.js'), 'utf8').replace(/\nCH\.REDEEM_CODES = [[\s\S]*$/, ''), sb);
const [code, ...args] = process.argv.slice(2);
if (!code) { console.log('Usage: node tools/codegen.js CODE [gold=1000] [gems=20] [swordsman=10] [expires=YYYY-MM-DD] [label="..."]'); process.exit(1); }
const RES = ['gold', 'wood', 'stone', 'food', 'gems', 'runes', 'xp'];
const ITEMS = ['speed5m', 'speed1h', 'shield2h', 'shield8h', 'teleRandom', 'teleAdvanced', 'goldPack', 'woodPack', 'stonePack', 'foodPack'];
const entry = { hash: sb.CH.hashCode(code), label: 'Gift', reward: {} };
for (const a of args) {
  const [k, ...rest] = a.split('='); const v = rest.join('=');
  if (RES.includes(k)) entry.reward[k] = Number(v);
  else if (['expires', 'start', 'label'].includes(k)) entry[k] = v;
  else if (k === 'minCastle') entry.minCastle = Number(v);
  else if (ITEMS.includes(k)) { entry.reward.items = entry.reward.items || {}; entry.reward.items[k] = Number(v); }
  else { entry.reward.troops = entry.reward.troops || {}; entry.reward.troops[k] = Number(v); }
}
if (!Object.keys(entry.reward).length) entry.reward = { gold: 1000, wood: 1000, stone: 500, gems: 10 };
console.log('  // ' + code.trim().toUpperCase());
console.log('  ' + JSON.stringify(entry).replace(/"(\w+)":/g, '$1: ').replace(/,(?=\S)/g, ', ') + ',');
