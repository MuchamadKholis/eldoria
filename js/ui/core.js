/* =====================================================================
 * Crownhold — ui/core.js
 * Shared UI helpers: SVG icons, cost chips, toasts, modal dialogs and
 * full-screen "sheets" layered over the kingdom.
 * ===================================================================== */
CH.UI = (function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICONS = {
    gold: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#f2c94a" stroke="#7a5212" stroke-width="1.6"/><circle cx="12" cy="12" r="5.4" fill="none" stroke="#fff3c0" stroke-width="1.3" opacity=".8"/><path d="M12 8.5v7" stroke="#7a5212" stroke-width="1.8" stroke-linecap="round"/></svg>',
    wood: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="6" rx="3" fill="#a8703a" stroke="#4a2a12" stroke-width="1.3"/><rect x="3" y="13" width="18" height="6" rx="3" fill="#8a5a2a" stroke="#4a2a12" stroke-width="1.3"/><circle cx="18" cy="9" r="2" fill="#e2c08a"/><circle cx="18" cy="16" r="2" fill="#e2c08a"/></svg>',
    stone: '<svg viewBox="0 0 24 24"><path d="M3 18 6 9l6-4 7 3 2 10z" fill="#b9b4aa" stroke="#4a463e" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 9l6 3 7-4M12 12v7" stroke="#7a756c" stroke-width="1.2" fill="none"/></svg>',
    food: '<svg viewBox="0 0 24 24"><path d="M12 21V8" stroke="#8a6a2a" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="9" cy="9" rx="2.6" ry="4" transform="rotate(-25 9 9)" fill="#f2c94a" stroke="#7a5212" stroke-width="1.1"/><ellipse cx="15" cy="9" rx="2.6" ry="4" transform="rotate(25 15 9)" fill="#f2c94a" stroke="#7a5212" stroke-width="1.1"/><ellipse cx="9.5" cy="15" rx="2.4" ry="3.6" transform="rotate(-25 9.5 15)" fill="#e2b03a" stroke="#7a5212" stroke-width="1.1"/><ellipse cx="14.5" cy="15" rx="2.4" ry="3.6" transform="rotate(25 14.5 15)" fill="#e2b03a" stroke="#7a5212" stroke-width="1.1"/><ellipse cx="12" cy="5" rx="2.2" ry="3.4" fill="#f2c94a" stroke="#7a5212" stroke-width="1.1"/></svg>',
    gems: '<svg viewBox="0 0 24 24"><path d="M12 2.5 19.5 9 12 21.5 4.5 9z" fill="#4fd18a" stroke="#0f4a2a" stroke-width="1.4" stroke-linejoin="round"/><path d="M4.5 9h15M12 2.5 9 9l3 12.5L15 9z" stroke="#c8ffe0" stroke-width="1" fill="none" opacity=".8"/></svg>',
    runes: '<svg viewBox="0 0 24 24"><path d="M12 2 20 7v10l-8 5-8-5V7z" fill="#8f6ee8" stroke="#2e1a6b" stroke-width="1.4"/><path d="M12 7v10M9 9l6 6M15 9l-6 6" stroke="#e6dcff" stroke-width="1.4" stroke-linecap="round"/></svg>',
    xp: '<svg viewBox="0 0 24 24"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="#7fc8ff" stroke="#1a4a7a" stroke-width="1.2"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="currentColor" stroke="#5a3f12" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    trophy: '<svg viewBox="0 0 24 24"><path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="#f2c94a" stroke="#7a5212" stroke-width="1.4"/><path d="M7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4" fill="none" stroke="#7a5212" stroke-width="1.4"/><path d="M10 13h4v4h3v3H7v-3h3z" fill="#c9962e" stroke="#7a5212" stroke-width="1.2"/></svg>',
    time: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#2a3560" stroke="#c9d4ff" stroke-width="1.6"/><path d="M12 7v5l3 2" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2" fill="#8a8170" stroke="#2e2a22" stroke-width="1.4"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10" fill="none" stroke="#8a8170" stroke-width="2.2"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.5 4.6-1.9.6-.6 1.5.9 1.8-1.6 1.6-1.8-.9-1.5.6-.6 1.9h-2.3l-.6-1.9-1.5-.6-1.8.9-1.6-1.6.9-1.8-.6-1.5-1.9-.6v-2.3l1.9-.6.6-1.5-.9-1.8 1.6-1.6 1.8.9 1.5-.6.6-1.9h2.3l.6 1.9 1.5.6 1.8-.9 1.6 1.6-.9 1.8.6 1.5 1.9.6z" fill="currentColor"/></svg>',
    sword: '<svg viewBox="0 0 24 24"><path d="M14.5 3H21v6.5L10 20.5 3.5 14z" fill="#d8dce4" stroke="#3a3f4a" stroke-width="1.3"/><path d="m5 13 6 6M3 21l3-3" stroke="#8a6a2a" stroke-width="2.2" stroke-linecap="round"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 2.5 19.5 5v6c0 5-3.3 8.6-7.5 10.5C7.8 19.6 4.5 16 4.5 11V5z" fill="#3b5aa0" stroke="#e2b65c" stroke-width="1.5"/><path d="M12 6v12M7.5 11h9" stroke="#e2b65c" stroke-width="1.5"/></svg>',
    hammer: '<svg viewBox="0 0 24 24"><path d="M13 7 4 16l3 3 9-9" fill="#8a5a30" stroke="#3a2412" stroke-width="1.3"/><path d="M11 4h6l3 3-3 3-6-6z" fill="#b9bec8" stroke="#3a3f4a" stroke-width="1.3"/></svg>',
    flask: '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" fill="#2a3560" stroke="#c9d4ff" stroke-width="1.5"/><path d="M7 15h10l2 4H5z" fill="#8affb4"/></svg>',
    crown: '<svg viewBox="0 0 24 24"><path d="M3.5 17 5 7l4.5 4.5L12 5l2.5 6.5L19 7l1.5 10z" fill="#f2c94a" stroke="#6b4a10" stroke-width="1.3" stroke-linejoin="round"/><rect x="3.5" y="17" width="17" height="3" rx="1" fill="#c9962e"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="#d8c08a" stroke="#5a4320" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 4v14M15 6v14" stroke="#5a4320" stroke-width="1.2"/><path d="m11 10 2 2m0-2-2 2" stroke="#b02a2a" stroke-width="1.6"/></svg>',
    swords: '<svg viewBox="0 0 24 24"><path d="M4 3l9 9M20 3l-9 9" stroke="#d8dce4" stroke-width="2.6" stroke-linecap="round"/><path d="M6 16l-3 3 2 2 3-3M18 16l3 3-2 2-3-3M8 14l2 2M16 14l-2 2" stroke="#c9962e" stroke-width="2.2" stroke-linecap="round"/></svg>',
    army: '<svg viewBox="0 0 24 24"><circle cx="8" cy="7" r="3" fill="#e8c39a"/><circle cx="16" cy="7" r="3" fill="#e8c39a"/><path d="M3 20c0-4 2-7 5-7s5 3 5 7zM11 20c0-4 2-7 5-7s5 3 5 7z" fill="#3a62c9" stroke="#1a2a5a" stroke-width="1.2"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="19" cy="12" r="2.2" fill="currentColor"/></svg>',
    skull: '<svg viewBox="0 0 24 24"><path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.4 3 5.4V19h9v-3.1c1.7-1 3-2.8 3-5.4A7.5 7.5 0 0 0 12 3z" fill="#e8e2d0" stroke="#4a4234" stroke-width="1.4"/><circle cx="9" cy="11" r="2" fill="#2a2418"/><circle cx="15" cy="11" r="2" fill="#2a2418"/></svg>',
    fireball: '<svg viewBox="0 0 24 24"><circle cx="13" cy="13" r="6" fill="#ff8a2a"/><circle cx="13" cy="13" r="3" fill="#ffe08a"/><path d="M8 8 3 3M10 6 6 2M6 10 2 6" stroke="#ff8a2a" stroke-width="2" stroke-linecap="round"/></svg>',
    heal: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#ffe08a" stroke="#7a5a12" stroke-width="1.4"/><path d="M12 7v10M7 12h10" stroke="#3a8a3a" stroke-width="3" stroke-linecap="round"/></svg>',
    rage: '<svg viewBox="0 0 24 24"><path d="M12 2c3 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3-1-3 0-5 0-7z" fill="#ff4a8a" stroke="#6a0a2a" stroke-width="1.3"/></svg>',
  };
  const icon = (n, cls) => '<i class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + (ICONS[n] || '') + '</i>';

  /** Cost chips; red when you can't afford that part. */
  function cost(c, save) {
    const parts = [];
    for (const r of ['gold', 'wood', 'stone', 'food', 'gems', 'runes']) if (c[r]) parts.push('<span class="chip' + (save && save.res[r] < c[r] ? ' short' : '') + '">' + icon(r) + CH.util.fmt(c[r]) + '</span>');
    return parts.join('') || '<span class="chip">Free</span>';
  }
  function reward(rw) {
    const parts = [];
    for (const r of ['gold', 'wood', 'stone', 'food', 'gems', 'runes', 'xp']) if (rw[r]) parts.push('<span class="chip">' + icon(r) + '+' + CH.util.fmt(rw[r]) + (r === 'xp' ? ' XP' : '') + '</span>');
    return parts.join('');
  }

  function toast(text, kind = 'info') {
    const box = $('toasts');
    const n = document.createElement('div');
    n.className = 'toast toast-' + kind; n.textContent = text;
    box.appendChild(n);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => n.classList.add('out'), 3000);
    setTimeout(() => n.remove(), 3500);
  }

  /* ---------- Modal ---------- */
  let modalOnClose = null;
  function modal(html, opts = {}) {
    const m = $('modal');
    m.innerHTML = '<div class="modal-card ' + (opts.cls || '') + '" role="dialog" aria-modal="true">' + (opts.noClose ? '' : '<button class="x-btn" data-close aria-label="Close">' + icon('close') + '</button>') + html + '</div>';
    m.classList.remove('hidden');
    modalOnClose = opts.onClose || null;
    m.onclick = e => {
      if (e.target === m && !opts.noClose) closeModal();
      else if (e.target.closest('[data-close]')) closeModal();
      else if (opts.onClick) opts.onClick(e);
    };
    paintCanvases(m);
    return m;
  }
  function closeModal() { const m = $('modal'); m.classList.add('hidden'); m.innerHTML = ''; const f = modalOnClose; modalOnClose = null; if (f) f(); }
  const modalOpen = () => !$('modal').classList.contains('hidden');

  /* ---------- Sheets (full screens) ---------- */
  let sheetStack = [];
  function sheet(name, arg, push = true) {
    const fn = CH.Screens[name];
    if (!fn) return;
    const s = $('sheet');
    if (push && !(sheetStack.length && sheetStack[sheetStack.length - 1].name === name)) sheetStack.push({ name, arg });
    else if (sheetStack.length) sheetStack[sheetStack.length - 1] = { name, arg };
    const out = fn(arg);
    s.innerHTML = '<div class="sheet-inner">' +
      '<header class="sheet-head"><button class="btn-back" data-back>' + icon('back') + '<span>Back</span></button><h2>' + out.title + '</h2>' + resBar() + '</header>' +
      '<div class="sheet-body">' + out.html + '</div></div>';
    s.classList.remove('hidden');
    s.dataset.screen = name;
    s.onclick = e => {
      if (e.target.closest('[data-back]')) { back(); return; }
      const b = e.target.closest('[data-act]');
      if (b && !b.disabled && out.on && out.on[b.dataset.act]) { CH.Audio.play('click'); out.on[b.dataset.act](b, e); }
    };
    s.oninput = out.onInput || null;
    if (out.after) out.after(s);
    paintCanvases(s);
    s.scrollTop = 0;
  }
  function refreshSheet() {
    const s = $('sheet');
    if (s.classList.contains('hidden') || !sheetStack.length) return;
    const top = s.querySelector('.sheet-body') ? s.querySelector('.sheet-body').scrollTop : 0;
    const cur = sheetStack[sheetStack.length - 1];
    sheet(cur.name, cur.arg, false);
    const body = s.querySelector('.sheet-body'); if (body) body.scrollTop = top;
  }
  function back() {
    sheetStack.pop();
    if (sheetStack.length) { const p = sheetStack[sheetStack.length - 1]; sheet(p.name, p.arg, false); }
    else closeSheets();
  }
  function closeSheets() { sheetStack = []; const s = $('sheet'); s.classList.add('hidden'); s.innerHTML = ''; CH.Home && CH.Home.refreshHud(true); }
  const sheetOpen = () => !$('sheet').classList.contains('hidden');
  const currentSheet = () => (sheetStack.length ? sheetStack[sheetStack.length - 1].name : null);

  function resBar() {
    const s = CH.App.save;
    return '<div class="mini-res">' + ['gold', 'wood', 'stone', 'food', 'gems'].map(r => '<span>' + icon(r) + CH.util.fmt(s.res[r]) + '</span>').join('') + '</div>';
  }

  /** Paints any canvas with data-unit / data-building / data-layout attributes. */
  function paintCanvases(root) {
    requestAnimationFrame(() => {
      root.querySelectorAll('canvas[data-unit]').forEach(cv => CH.Art.unitIcon(cv, cv.dataset.unit, +cv.dataset.size || 10, { bg: cv.dataset.bg }));
      root.querySelectorAll('canvas[data-building]').forEach(cv => CH.Art.buildingIcon(cv, cv.dataset.building, +cv.dataset.level || 1));
      root.querySelectorAll('canvas[data-paint]').forEach(cv => { const f = CH.UI.painters[cv.dataset.paint]; if (f) f(cv); });
    });
  }

  return { $, esc, icon, ICONS, cost, reward, toast, modal, closeModal, modalOpen, sheet, refreshSheet, back, closeSheets, sheetOpen, currentSheet, paintCanvases, painters: {} };
})();
