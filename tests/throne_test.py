"""Eldoria Throne War browser test: shifts the page clock to Saturday 15:02 and plays a war.
Run: python3 tests/throne_test.py [path/to/index.html]"""
import sys, os
from playwright.sync_api import sync_playwright
URL='file://'+os.path.abspath(sys.argv[1] if len(sys.argv)>1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'index.html'))
SH=os.environ.get('SHOTS', '/tmp/war_shots'); os.makedirs(SH, exist_ok=True)
res=[]; errs=[]
def check(n,c,i=''): res.append(c); print(('  PASS ' if c else '  FAIL ')+n+(' ['+str(i)+']' if i and not c else ''))
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1366,'height':800})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    # Shift the clock to Saturday 15:02 local time.
    pg.add_init_script("""(()=>{const d=new Date();const sat=new Date(d.getFullYear(),d.getMonth(),d.getDate()+((6-d.getDay()+7)%7),15,2,0);
      const off=sat.getTime()-Date.now()+(window.__extra||0);const _n=Date.now.bind(Date);window.__off=off;Date.now=()=>_n()+window.__off;})()""")
    pg.goto(URL); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.click('#t-play'); pg.wait_for_timeout(300); pg.click('.modal [data-close]'); pg.wait_for_timeout(1200)
    check('war started on Saturday 15:00', pg.evaluate("(()=>{const w=CH.App.save.world.throne.war;return !!w&&!w.ended})()"))
    check('gold war banner on the kingdom screen', pg.is_visible('#warbar') and 'Throne War' in pg.inner_text('#warbar'))
    pg.screenshot(path=SH+'/home_war.png')
    pg.evaluate("""(()=>{const s=CH.App.save; s.buildings.push({id:9999,type:'embassy',level:3,tx:0,ty:0,buf:0,job:null}); CH.World.joinFaction(s,0); s.army={knight:4000,longbowman:3000,heavyCavalry:3000,swordsman:4000}; s.res.gems=5000;})()""")
    pg.click('#warbar'); pg.wait_for_timeout(700); pg.screenshot(path=SH+'/citadel.png')
    check('banner opens the Citadel panel', pg.is_visible('#wpanel') and 'Aurelion Citadel' in pg.inner_text('#wpanel'))
    pg.click('[data-p=attack]'); pg.wait_for_timeout(400)
    check('march dialog offers a faction rally', pg.is_visible('[data-rally]') and 'Rally with' in pg.inner_text('[data-rally]'))
    pg.click('[data-rally]'); pg.screenshot(path=SH+'/rally.png'); pg.click('[data-send]'); pg.wait_for_timeout(300)
    m = pg.evaluate("(()=>{const m=CH.App.save.world.marches.find(m=>m.owner==='player'&&m.target.type==='throne');return m&&{allies:m.allies.length}})()")
    check('rally march toward the Citadel (up to 9 allies)', m and 1 <= m['allies'] <= 9, m)
    # fast-forward 4 minutes of war
    eta = pg.evaluate("Math.ceil((CH.App.save.world.marches.find(m=>m.owner==='player'&&m.target.type==='throne').t1-Date.now())/15000)")
    for i in range(eta + 2):
        pg.evaluate("window.__off+=15000"); pg.wait_for_timeout(500)
    reps = pg.evaluate("CH.App.save.reports.map(r=>r.title)")
    check('your Citadel battle produced a report', any('Citadel' in r for r in reps), reps[:4])
    pg.evaluate("(()=>{const th=CH.App.save.world.throne;CH.App.wview.center(th.x,th.y);CH.App.wview.cam.zoom=0.55})()"); pg.wait_for_timeout(500)
    pg.evaluate("CH.WorldUI.select({type:'throne',o:CH.App.save.world.throne})"); pg.wait_for_timeout(300)
    pg.screenshot(path=SH+'/citadel_war.png')
    fx = pg.evaluate("(()=>{const n=Date.now();const w=CH.App.save.world;return {burn:w.kingdoms.filter(k=>k.burn>n).length+(w.throne.burn>n?1:0),smoke:w.kingdoms.filter(k=>k.smoke>n).length+(w.throne.smoke>n?1:0)}})()")
    check('defeated castles burn, survivors smoke', fx['burn'] + fx['smoke'] > 0, fx)
    # show a burning kingdom
    pg.evaluate("(()=>{const n=Date.now();const w=CH.App.save.world;const k=w.kingdoms.find(k=>k.burn>n)||w.kingdoms[0];k.burn=n+600000;const k2=w.kingdoms.find(x=>x!==k&&Math.hypot(x.x-k.x,x.y-k.y)<12)||w.kingdoms[1];k2.smoke=n+600000;k2.burn=0;CH.App.wview.center((k.x+k2.x)/2,(k.y+k2.y)/2);CH.App.wview.cam.zoom=1.1;CH.WorldUI.select({type:'kingdom',o:k})})()")
    pg.wait_for_timeout(500); pg.screenshot(path=SH+'/burn_smoke.png')
    # jump past the end of the war
    pg.evaluate("window.__off+=27*60000"); pg.wait_for_timeout(1500)
    king = pg.evaluate("(()=>{const t=CH.App.save.world.throne;return {ended:t.war.ended,king:t.king&&t.king.name,until:t.king&&t.king.until}})()")
    check('war ends after 30 minutes and a king is crowned for a week', king['ended'] and king['king'] and king['until'] - pg.evaluate("Date.now()") > 6.9 * 864e5, king)
    pg.evaluate("CH.WorldUI.close(); CH.UI.sheet('ranks','throne')"); pg.wait_for_timeout(300); pg.screenshot(path=SH+'/ranks_throne.png')
    check('throne leaderboard shows the king and hold times', 'King' in pg.inner_text('.sheet-body') or king['king'] in pg.inner_text('.sheet-body'))
    for t in ['power','factions','kills']:
        pg.click('[data-act=tab][data-t=%s]' % t); pg.wait_for_timeout(200)
        check('leaderboard tab: '+t, pg.locator('.rank-row').count() >= 4)
    pg.screenshot(path=SH+'/ranks_kills.png')
    # make the player king to test the Royal Court
    pg.evaluate("(()=>{const s=CH.App.save,t=s.world.throne;t.king={key:'player',name:s.player.name,f:s.faction,since:Date.now(),until:Date.now()+7*864e5,held:600000};t.prizes=t.prizes.map(p=>({...p,given:null}));})()")
    pg.evaluate("CH.UI.closeSheets(); CH.WorldUI.royalCourt()"); pg.wait_for_timeout(300)
    g0 = pg.evaluate("CH.App.save.res.gems")
    pg.select_option('[data-pz=royal0]', 'player'); pg.wait_for_timeout(300)
    check('king keeps the Royal Treasure', pg.evaluate("CH.App.save.res.gems") == g0 + 1000)
    kid = pg.evaluate("document.querySelector('[data-pz=noble0]').options[2].value")
    pg.select_option('[data-pz=noble0]', kid); pg.wait_for_timeout(300)
    check('king rewards another kingdom, which becomes loyal', pg.evaluate("k=>{const x=CH.App.save.world.kingdoms.find(z=>z.id===k);return x.friendUntil>Date.now()}", kid))
    pg.screenshot(path=SH+'/court.png'); pg.evaluate("CH.UI.closeModal()")
    # skins & march slots
    pg.evaluate("CH.UI.sheet('skins')"); pg.wait_for_timeout(400); pg.screenshot(path=SH+'/skins_castle.png')
    pg.click('[data-act=buy][data-k=castle][data-id=infernal]'); pg.wait_for_timeout(300)
    check('castle skin bought and equipped', pg.evaluate("CH.App.save.equipped.castle")=='infernal')
    pg.click('[data-act=tab][data-t=hero]'); pg.wait_for_timeout(300)
    pg.click('[data-act=buy][data-k=hero][data-id=celestial][data-h=aldric]'); pg.wait_for_timeout(300)
    check('hero skin bought and equipped', pg.evaluate("CH.State.heroSkin(CH.App.save,'aldric')")=='celestial')
    pg.screenshot(path=SH+'/skins_hero.png')
    pg.evaluate("CH.UI.closeSheets(); CH.UI.sheet('store')"); pg.wait_for_timeout(300)
    n0 = pg.evaluate("CH.State.marchSlots(CH.App.save)")
    for i in range(6):
        if pg.locator('[data-act=march]').count(): pg.click('[data-act=march]'); pg.wait_for_timeout(200)
    check('march slots can be bought up to 5', pg.evaluate("CH.State.marchSlots(CH.App.save)") == 5 and n0 < 5, n0)
    pg.evaluate("CH.UI.closeSheets()"); pg.wait_for_timeout(500); pg.screenshot(path=SH+'/home_skin.png')
    pg.evaluate("CH.WorldUI.open(); const w=CH.App.save.world; CH.App.wview.center(w.px,w.py); CH.App.wview.cam.zoom=1.3"); pg.wait_for_timeout(500); pg.screenshot(path=SH+'/map_skin.png')
    b.close()
check('no runtime errors', not errs, errs[:3])
print("%d passed, %d failed" % (sum(res), len(res)-sum(res))); sys.exit(0 if all(res) else 1)
