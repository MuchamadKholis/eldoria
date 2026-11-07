# Eldoria — Kingdoms at War

A single-player fantasy kingdom strategy game for the browser, in the style of Lords Mobile and Whiteout Survival. You build a kingdom on a grid, train armies, and live on a world map with **60 AI kingdoms** that grow, train, wage war on each other, raid resource-rich targets, hold grudges, and attack you.

It is plain HTML5, JavaScript and Canvas 2D, with no engine, server, accounts or paid services. All art, sound and music are generated in code. **There is no online multiplayer:** every other kingdom is simulated locally. The architecture keeps the simulation separate from the UI, so a server could replace it later.

## Run it

| Goal | How |
|---|---|
| Play | Double-click `dist/eldoria.html` (one file, works offline) |
| Play the source version | Double-click `index.html` |
| Rebuild the single file | `python3 tools/build.py` |
| Run the tests | `node tests/run_tests.js` and `python3 tests/browser_test.py` (needs Playwright) |

**Deploy** (GitHub Pages or Cloudflare Pages): upload the project folder with `index.html` at the root. GitHub Pages: Settings → Pages → deploy from branch `main`, folder `/`. Cloudflare Pages: Workers & Pages → Create → Pages → Upload assets, or connect your Git repo with no build command and output directory `/`.

Progress, including the whole world, saves in the browser (localStorage). The world keeps simulating while you're away.

---

## The core loop

**Build kingdom → train troops → explore world → scout → attack → loot → upgrade → survive AI attacks**

### Your kingdom
- **Grid building:** place, drag to move, upgrade, collect and build walls. Everything from Crownhold carries over: builders, timers that run offline, storage caps, and production that stops when full.
- **Buildings (36 types):**
  - *Economy:* Castle, Gold Mine, Lumber Mill, Stone Quarry, **Farm**, Gold/Wood/Stone storage, **Granary**, Builder Hut.
  - *Military:* **Barracks, Archery Range, Stable, Siege Workshop**, Hero Hall, **Academy**, **Infirmary**.
  - *Civic:* **Watchtower, Embassy, Trap Workshop, Trading Post**.
  - *Defenses:* seven tower types, walls, gates and three trap types.
- **What the new buildings do:**
  - **Farms** grow the food your troops eat.
  - **Storage** buildings protect 25% of their capacity from raiders.
  - **Infirmary** beds save wounded troops.
  - **Watchtower** level decides what you see about incoming attacks.
  - **Embassy** lets you join a faction and call reinforcements.
  - **Trading Post** exchanges resources.
  - **Trap Workshop** gates traps.
  - **Academy** researches technologies.
- **Food and upkeep:** every troop eats food each hour. If food runs out, 1% of your army deserts per 10 starving minutes, capped at 25%, and food never goes negative.

### Troops: 22 types in 5 classes
| Class | Troops | Trained at |
|---|---|---|
| Infantry | Swordsman, Spearman, Knight, Berserker, Paladin | Barracks |
| Ranged | Archer, Crossbowman, Longbowman, Battle Mage | Archery Range |
| Cavalry | Light Cavalry, Heavy Cavalry, Wolf Rider, Dragon Rider | Stable |
| Siege | Siege Ram, Catapult, Ballista, Trebuchet, Golem | Siege Workshop |
| Special | Skeleton Horde (eats no food), Necromancer, Griffin, Dragon | Barracks / Stable |

- **Counters:** infantry beats cavalry, cavalry beats ranged, ranged beats infantry, each for +50% damage. Siege engines deal 2–4× damage to buildings and only 35% to troops. Flyers ignore walls.
- **Troop stats:** each type has health, attack, speed, march speed, load (carrying capacity), cost including food, training time and upkeep.
- **Training:** each military building trains one batch at a time. Batch size and speed grow with building level.
- **Research:** the Academy upgrades every troop type (+14% per level).

### Heroes
| Hero | Commands | Bonus | Ability |
|---|---|---|---|
| Aldric | Infantry | +15% | Royal Charge |
| Elara | Ranged | +15% | Arrow Storm |
| Thorne | Cavalry | +15%, +10% march speed | Lance Charge |
| Magnus | Mages | +12% | Meteor |
| Morgrath | Special troops | +18% | Raises skeletons |
| Drakon | Siege | +20% | Dragonfire Cleave |

- One hero leads each march, and one hero defends your castle.
- Heroes fight in person and use their abilities automatically in world battles.
- They gain experience from battles and can also be trained with resources.

### The world map (96×96 tiles)
- **Regions:** green outer lands, then mountains, swamp, snow and dark kingdoms, with the volcanic Dragon Territory at the center.
- **What's on it:** 60 kingdoms, 150 resource tiles, 55 monster camps (goblin camps, orc warcamps, spider nests, skeleton fortresses, troll strongholds, dragon lairs), ancient ruins, abandoned forts and event bosses.
- **Navigation:** pan, zoom, filters (by type and by strength relative to you), go-to coordinates, and every target has its own panel.
- **Marches:** attack, scout, gather and recall. March time depends on distance, the slowest troop, the Logistics tech, your faction and Thorne. March slots grow with castle level; scouts are free.
- **Formations:** surround, spearhead or pincer. Your army enters the battle from the direction it marched in.
- **Teleport:** random or targeted, using items or gems. Armies already marching on you lose track and turn back.

### Battles
Battles involving you run on the full **deterministic battle engine**:
- Squads of troops (labelled with live counts) attack the enemy's actual base layout.
- Ground troops use A* pathfinding to walk around walls or break through them; towers shoot, hidden traps trigger, and the garrison rallies to the breach.
- Results are computed when the march arrives, even offline. Open the report and press **Watch battle** to see the identical fight at 1–3× speed, with pause and skip.
- **Outcomes:** victory (castle destroyed), partial victory (40% or more of buildings destroyed), or defeat.
- **Reports** list troops sent and lost per type on both sides, loot, rewards, casualties (wounded or dead), destruction and damage dealt.

### The living AI world
- **Six personalities:** Peaceful, Aggressive, Defensive, Raider, Expansionist and Balanced. They differ in economy, army size, aggression, troop mix, base layout and attack cooldowns.
- **Decision schedule:** each AI decides every ~2 minutes using readable rules: accumulate resources, upgrade its castle, train toward a target army, then pick the best target by expected loot, power ratio and distance. Retaliation targets get priority.
- **AI vs AI wars** use a fast counter-aware formula: losers lose troops and resources, winners carry loot home, and weakened kingdoms shield up. Strong kingdoms grow into regional threats, and the news feed reports it all.
- **Grudges:** raid a kingdom and it remembers you. Aggressive kingdoms become recurring enemies and will travel further to hit back.
- **Factions:** four of them, each with a bonus. Members never attack each other, and you can join one through the Embassy.
- **Forts:** captured forts give +6% production. Expansionists contest them.
- **Six rotating world events:** Resource Rush, Monster Invasion, Dragon Hunt (an Elder Dragon boss appears), Ancient Treasure, Castle Siege and Territory War (faction points race with rewards).

### Fair-play rules for AI attacks on you
- **Beginner protection:** your first 45 minutes while your castle is below level 3.
- **Warning:** at least 150 seconds before any attack lands. A red banner shows the attacker and countdown; Watchtower levels 3 and 5 reveal the army size, then exact troops and hero.
- **Respond** by raising a shield, requesting faction reinforcements, teleporting, or simply defending with your troops, towers and traps.
- **Spacing and cooldowns:** at least 60 minutes between attacks on you, and each AI attacks you at most once per 3 hours (2 if it holds a grudge).
- **Matchmaking:**
  - Attackers only come if they are reasonably matched.
  - They send an army sized to 45–70% of your defense; their hero and bonuses make up the rest.
  - Kingdoms more than 2 castle levels above you leave you alone unless provoked.
  - Members of your faction never attack.
- **Recovery shield** after every attack: 1 hour after a defense you win, 1.5 hours after a partial loss, 2 hours after a total loss.
- **Protected resources:** 1,000 per castle level plus 25% of each storage building can never be stolen.
- **Your raids:** you can't hit the same kingdom again for 30 minutes, and you can only take a share of its unprotected resources. Attacking or scouting a kingdom drops your own shield.
- **Offline:** catch-up is capped at 12 hours and at most 2 attacks on you resolve while you're away. On return you get a "While you were away" summary with resources, your reports and the realm's news.

### The Throne of Eldoria: Aurelion Citadel
- **Location:** a gleaming citadel at the centre of the world, in the heart of Dragon Territory.
- **The war:** every **Saturday at 15:00 (device time)** the **Throne War** opens for **30 minutes**. A gold banner shows the time left and who holds the Citadel.
- **Holding it:** the Citadel starts the war held by its Guardians. Whoever takes it garrisons it with their surviving troops and starts a hold clock; losing it stops the clock.
- **Attackers:** all AI kingdoms join in, alone or in faction **rallies**. You can attack, rally, or reinforce your own garrison.
- **Becoming king:** the contender with the **longest total hold time** becomes **King of Eldoria** for one week, from Saturday to Saturday, and gains +10% production.
- **The treasure:** the king hands out what is prepared in the Citadel: 1 Royal Treasure, 3 Noble Chests and 6 Knight Chests, through the **Royal Court**.
  - The king may keep one chest of each kind.
  - Kingdoms that receive a chest stay loyal and won't attack the king during the reign.
  - An AI king shares the treasure with its faction, and you receive a chest if you're in that faction.
- **Battles at the Citadel** that involve you use the full battle engine on its fortifications, with reports and replays.

### Rallies
When you attack a kingdom, fort or the Citadel and you belong to a faction, you can start a **rally**.
- **Who joins:** up to 9 nearby allies (10 castles in total) each lend 40% of their troops.
- **Timing:** the rally gathers for 60 seconds, then marches as one army.
- **Afterwards:** survivors are shared back by contribution.
- **AI factions** rally on the Citadel too.

### Leaderboards
**More → Leaderboards** has four tabs:
- **Power:** all 61 kingdoms, including you.
- **Factions:** total power, members and kills.
- **Killers:** enemy troops killed across all battles.
- **Throne:** the current king, live or last-war hold times, the war's top killers, and past kings.

### Battle scars on the world map
A castle that was **defeated burns**, and one that **survived an attack smokes**, for several minutes. This applies to AI kingdoms, your kingdom (also visible on your home screen) and the Citadel.

### Skins (More → Skins)
Four themes for your **castle** and **every hero**: **Dunia** (Verdant Crown), **Surgawi** (Celestial Sanctum), **Neraka** (Infernal Bastion) and **Kegelapan** (Abyssal Throne).
- **Where they show:** castle skins appear in your kingdom, on the world map and when you are attacked; hero skins appear in every battle.
- **What they look like:** each theme recolours the art and adds its own aura and particles (light motes, embers, shadow wisps, falling leaves).
- **Cosmetic only:** skins don't change stats.
- **Price:** castle 400–900 gems, hero 250–500 gems.

### Other systems
- **Campaign:** 36 stages across 6 regions, carried over from Crownhold.
- **Bag items:** speed-ups (5 minutes, 1 hour), Peace Shields (2 hours, 8 hours), random and advanced teleports, and resource chests.
- **Academy technologies:** Prosperity, Logistics, Fortification, Medicine, Scouting, Warfare and Agriculture.
- **Trading Post:** exchange one resource for another at 30–58%, depending on its level.
- **Gem Shop** (More → Gem Shop, or tap your gem counter):

| Item | Price |
|---|---|
| Gold, wood or stone: 5,000 / 25,000 / 100,000 | 20 / 90 / 320 gems |
| Food: 7,500 / 37,500 / 150,000 | 20 / 90 / 320 gems |
| Fill one storage to capacity | 1 gem per 300 missing |
| Speed-up 5m / 1h | 10 / 60 gems |
| Peace Shield 2h / 8h | 80 / 200 gems |
| Random / Advanced Teleport | 100 / 300 gems |
| Extra march slot (up to 5 marches in total) | 300, 600, 1,200… gems |

  Bought resources may exceed storage. Edit prices in `CH.GEM_SHOP` in `defs.js`.
- **Gathering:** send troops to a resource tile; they gather up to their load, then march home. Resources your marches carry home (gathered or looted) are always kept in full, even above storage limits.
- **Factions** can be left at any time from the Factions screen; you can join one again after 1 hour.
- **Redeem codes** (More → Redeem code):

| Code | Contents |
|---|---|
| `ELDORIA` | Resources and 100 gems |
| `WARCHEST` | Resources and 1,000 troops |
| `SAFEHAVEN` | Shields, teleports and speed-ups |
| `DRAGONFIRE` | Gems, runes and knights (needs castle level 4) |

---

## Project structure
```
index.html, css/style.css
js/data/defs.js       config, buildings, 22 troops, heroes, items, techs, enemies
js/data/content.js    campaign, base-layout generator (used for AI kingdoms), starting kingdom
js/data/codes.js      redeem codes (hashed) + hash function
js/core/state.js      your kingdom: economy, food, training, infirmary, items, research, power, save/validate
js/core/throne.js     the Aurelion Citadel: weekly Throne War, rallies, coronation, Royal Court, leaderboards
js/core/world.js      Eldoria: generation, AI simulation, marches, battles, reports, events, factions, teleport, offline catch-up
js/core/audio.js      synthesized sound and music
js/game/battle.js     battle engine (siege, raid, defense and campaign modes)
js/game/siege.js      builds world battles: squads, formations, fortifications; headless run and replay
js/render/art.js      procedural art for buildings, troops, heroes and monsters
js/render/view.js     kingdom and battle renderer, camera
js/render/worldview.js world map renderer
js/ui/*.js            HUD, screens, world map UI, battle HUD
js/main.js            app flow, game loop, offline summary
tests/                run_tests.js (39 logic tests), browser_test.py (45 checks), throne_test.py (18 checks)
tools/                build.py (single file), codegen.js (redeem codes)
```

## Extending the game
- **More AI kingdoms:** change `AI_COUNT` (and `WORLD_SIZE` for room) in `defs.js`. Names come from `NAMES`, `SYL1` and `SYL2` in `world.js`. The world is generated once per save; use Settings → Reset to regenerate it.
- **New personality:** add an entry to `CH.PERSONALITIES` in `world.js` (aggression, army, economy, send ratio, cooldown, troop mix, base archetype).
- **New building:** add it to `CH.BUILDINGS` and a `CH.BUILD_MENU` tab, and draw it with a function of the same name in `BLD` in `art.js`. Give it a real effect in `state.js` (see `beds`, `reinforce` and `rate`).
- **New troop:** add a `TR({...})` entry to `CH.TROOPS` (class, tier, building, unlock level, stats, load, cost, time, upkeep, sprite) and draw its sprite in `UNIT` in `art.js`. Training, research, counters, marches and AI armies pick it up automatically.
- **New world event:** add it to `CH.EVENTS` in `world.js` and check it where it matters with `evOn(w, T, 'yourId')`, as `resourceRush` does in gathering and `dragonHunt` does in `processUntil`.
- **New monster camp type:** add it to `CH.CAMP_TYPES` with a biome and enemy unit list, and give it a color in `WorldView.camp`.
- **New redeem code:** `node tools/codegen.js CODE gold=1000 food=5000 gems=20 swordsman=50 shield8h=1 hero=elara expires=2026-12-31 label="Gift"`, then paste the printed line into `js/data/codes.js`. Rewards can be resources (gold, wood, stone, food, gems, runes), player XP, any of the 22 troop types, any of the 10 bag items, hero unlocks (`hero=elara`) and skins (`skin=castle:celestial`, `skin=hero:infernal:aldric`). Conditions: `start=`, `expires=` and `minCastle=`.

## Testing
`node tests/run_tests.js`: 39 logic tests, including the Throne War schedule, a full war with AI rallies and coronation, player rallies, the Royal Court, march slots and skins.
- Economy: production caps, food upkeep and desertion, batch training, the infirmary, items, techs and redeem codes.
- Combat rules: counters and siege multipliers.
- The world: generation, AI growth and AI-vs-AI wars, and the fairness rules (beginner protection, shields turning armies back, warning time).
- Your actions: defense battles with reports and recovery shields, scouting detail by tech, raids with loot, cooldowns and grudges, monster camps respawning, gathering and recall, march slots, teleport rules, factions and events.
- Reliability: the offline cap, replay determinism, save/load with hostile data, and pathfinding through and around walls.

`python3 tests/browser_test.py`: 45 checks with real clicks.
- **Kingdom:** placing a building, batch training, army tabs.
- **World map:** tapping a kingdom, scouting, the march dialog with formation, the marches drawer, reports, and watching a replay.
- **Being attacked:** the incoming banner and warning, the defense battle with its report, and the recovery shield.
- **Gathering:** the full loop through the real dialog (march out, gather, march home, resources added).
- **Shop and factions:** buying resources and items with gems, joining and leaving a faction.
- **Other systems:** teleport, redeem, nine screens, persistence after reload, and phone portrait and landscape layouts. It also checks for console errors.

`python3 tests/throne_test.py`: 18 checks. It shifts the page clock to Saturday 15:02, then checks the war banner, the Citadel panel, a rally with up to 9 allies, the Citadel battle report, burning and smoking castles, the coronation after 30 minutes, every leaderboard tab, the Royal Court, buying skins and march slots, and that there are no console errors.

**Balance** was checked by simulation. A modest castle-3 player across six seeded worlds over 6 in-game hours sees 0–5 attacks and wins most defenses, though defending still costs troops. AI-vs-AI wars produce dozens of news items per hour.

Worth checking by hand on real devices: touch feel on the world map, audio on iOS (needs a first tap), and long-session pacing.

## Implemented vs. not yet
**Implemented:** everything described above.

**Not yet, or simplified:**
- **Simplified hero progression.** There is no equipment crafting or talent trees; heroes level from battle XP and resource training.
- **No daily missions or achievements.**
- **Forts:** captured forts give a production bonus and can be lost to AI expansionists, but you can't station a garrison there.
- **AI-vs-AI fights use a formula,** not the visual engine. Only battles involving you can be watched.
- **AI kingdoms don't gather resource tiles** or attack your gathering troops. Their economy is abstracted.
- **No persistent battle damage:** buildings are never left damaged after a defense. A loss costs resources and troops.
- **Balance comes from simulations,** not human playtesting. Timers are short, prototype-paced.
- **No real multiplayer or player guilds.** Factions, their reinforcements and rallies are simulated. The Throne War follows each player's own device clock.
- **Tested in headless Chromium only.**
