/* =====================================================================
 * Crownhold — core/audio.js
 * Every sound is synthesised with the Web Audio API: no audio files to
 * download or license. Music is a small generative modal sequencer.
 * The AudioContext is created on the first user gesture (browser rule).
 * To swap in recorded audio later, replace the bodies of SFX entries.
 * ===================================================================== */

CH.Audio = (function () {
  let ctx = null, master, sfxGain, musicGain, noiseBuf = null;
  let settings = { music: 0.45, sfx: 0.7, muted: false };
  const last = {};
  const music = { timer: null, theme: null, step: 0, next: 0, pending: null };

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    apply();
    if (music.pending) { const p = music.pending; music.pending = null; startMusic(p); }
    return true;
  }

  function apply(s) {
    if (s) settings = s;
    if (!ctx) return;
    master.gain.value = settings.muted ? 0 : 1;
    sfxGain.gain.value = settings.sfx * 0.9;
    musicGain.gain.value = settings.music * 0.32;
  }

  function tone(f, dur, type, vol, f2, delay, dest) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, freq, vol, type, delay, dest) {
    const t = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || sfxGain);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  const SFX = {
    click() { tone(720, 0.05, 'triangle', 0.1); },
    bow() { noise(0.07, 2600, 0.14, 'bandpass'); tone(520, 0.06, 'triangle', 0.04, 260); },
    magic() { tone(700, 0.16, 'sine', 0.07, 1400); tone(1050, 0.12, 'triangle', 0.03, 1800, 0.02); },
    zap() { noise(0.1, 4500, 0.09, 'highpass'); tone(1800, 0.06, 'square', 0.02, 900); },
    nova() { tone(300, 0.4, 'sine', 0.12, 900); noise(0.3, 1800, 0.1, 'bandpass'); },
    cannon() { noise(0.18, 500, 0.22); tone(140, 0.15, 'sine', 0.18, 60); },
    boom() { noise(0.4, 700, 0.28); tone(90, 0.3, 'sine', 0.24, 35); },
    curse() { tone(240, 0.22, 'sawtooth', 0.035, 120); tone(180, 0.25, 'sine', 0.05, 90); },
    bone() { tone(320, 0.07, 'square', 0.03, 180); },
    summon() { tone(150, 0.35, 'sawtooth', 0.05, 330); noise(0.25, 900, 0.07, 'bandpass'); },
    death() { tone(280, 0.1, 'square', 0.03, 110); },
    leak() { tone(220, 0.3, 'sawtooth', 0.1, 90); noise(0.2, 300, 0.12); },
    place() { noise(0.12, 320, 0.22); tone(150, 0.14, 'sine', 0.18, 80); },
    upgrade() { [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'triangle', 0.09, null, i * 0.07)); },
    sell() { tone(880, 0.07, 'triangle', 0.09); tone(660, 0.12, 'triangle', 0.09, null, 0.06); },
    coin() { tone(1250, 0.05, 'square', 0.03); tone(1650, 0.08, 'square', 0.03, null, 0.05); },
    wave() { tone(196, 0.55, 'sawtooth', 0.06); tone(294, 0.55, 'sawtooth', 0.05, null, 0.06); },
    warcry() { tone(110, 0.5, 'sawtooth', 0.12, 160); noise(0.4, 600, 0.1, 'bandpass'); },
    boss() { tone(65, 1.3, 'sawtooth', 0.16, 42); noise(1.1, 220, 0.18); },
    bossDeath() { noise(1.3, 500, 0.35); tone(95, 1.1, 'sine', 0.3, 30); [392, 494, 587, 784].forEach((f, i) => tone(f, 0.4, 'triangle', 0.08, null, 0.5 + i * 0.12)); },
    smite() { noise(0.6, 3200, 0.22, 'highpass'); tone(1400, 0.45, 'sine', 0.1, 220); tone(110, 0.5, 'sine', 0.2, 50); },
    fire() { noise(0.7, 900, 0.22, 'bandpass'); tone(160, 0.6, 'sawtooth', 0.05, 80); },
    stun() { tone(520, 0.28, 'sine', 0.06, 160); noise(0.2, 2000, 0.06, 'highpass'); },
    sword() { noise(0.06, 3200, 0.08, 'highpass'); tone(900, 0.05, 'triangle', 0.03, 500); },
    smash() { noise(0.25, 300, 0.25); tone(90, 0.2, 'sine', 0.2, 45); },
    deploy() { tone(330, 0.08, 'triangle', 0.08); tone(495, 0.08, 'triangle', 0.06, null, 0.05); },
    heroDeploy() { [392, 523, 659].forEach((f, i) => tone(f, 0.25, 'triangle', 0.1, null, i * 0.06)); },
    heroDown() { tone(300, 0.6, 'sawtooth', 0.08, 90); },
    roar() { noise(0.9, 260, 0.25); tone(85, 0.9, 'sawtooth', 0.14, 50); tone(130, 0.7, 'square', 0.04, 70, 0.05); },
    collapse() { noise(0.5, 420, 0.28); tone(70, 0.4, 'sine', 0.2, 35); },
    wallBreak() { noise(0.22, 900, 0.16, 'bandpass'); },
    spike() { noise(0.08, 4000, 0.12, 'highpass'); tone(700, 0.08, 'square', 0.04, 300); },
    frost() { tone(1500, 0.18, 'sine', 0.05, 2400); noise(0.15, 6000, 0.05, 'highpass'); },
    ballista() { noise(0.1, 1200, 0.15, 'bandpass'); tone(200, 0.15, 'triangle', 0.1, 90); },
    mortar() { noise(0.2, 300, 0.2); tone(120, 0.2, 'sine', 0.16, 60); },
    fireShot() { noise(0.18, 1400, 0.1, 'bandpass'); },
    star() { [784, 988, 1319].forEach((f, i) => tone(f, 0.25, 'triangle', 0.1, null, i * 0.07)); },
    horn() { tone(196, 0.7, 'sawtooth', 0.07); tone(294, 0.7, 'sawtooth', 0.05, null, 0.06); },
    heal() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'sine', 0.05, null, i * 0.05)); },
    freeze() { noise(0.5, 5000, 0.12, 'highpass'); tone(1800, 0.4, 'sine', 0.05, 900); },
    collect() { tone(1050, 0.06, 'square', 0.04); tone(1400, 0.08, 'square', 0.04, null, 0.05); tone(1750, 0.08, 'triangle', 0.04, null, 0.1); },
    build() { noise(0.1, 500, 0.18); tone(220, 0.1, 'triangle', 0.1, 140); noise(0.1, 500, 0.15, 'lowpass', 0.15); },
    victory() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.5, 'triangle', 0.12, null, i * 0.13)); },
    defeat() { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.55, 'sawtooth', 0.06, null, i * 0.24)); },
    error() { tone(160, 0.12, 'square', 0.05); },
    unlock() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.1, null, i * 0.08)); },
  };
  const GAP = { sword: 0.04, smash: 0.12, deploy: 0.05, collapse: 0.1, wallBreak: 0.06, frost: 0.08, mortar: 0.1, fireShot: 0.06, ballista: 0.1, bow: 0.05, magic: 0.06, death: 0.035, boom: 0.06, cannon: 0.08, zap: 0.07, bone: 0.08, curse: 0.1, summon: 0.2, coin: 0.05, leak: 0.1, stun: 0.15 };

  function play(name) {
    if (!ctx || settings.muted || settings.sfx <= 0) return;
    const now = ctx.currentTime;
    if (last[name] && now - last[name] < (GAP[name] || 0.03)) return;
    last[name] = now;
    try { if (SFX[name]) SFX[name](); } catch (e) { /* audio must never break the game */ }
  }

  /* ---------- Generative music ---------- */
  const DORIAN = [0, 2, 3, 5, 7, 9, 10];
  const PHRYG = [0, 1, 3, 5, 7, 8, 10];
  const THEMES = {
    menu: { root: 50, scale: DORIAN, tempo: 0.36, prog: [0, 5, 3, 4], pattern: [0, 2, 4, 2, 7, 4, 2, 4] },
    battle: { root: 50, scale: DORIAN, tempo: 0.24, prog: [0, 0, 5, 6], pattern: [0, 4, 7, 4, 2, 4, 7, 9] },
    boss: { root: 45, scale: PHRYG, tempo: 0.18, prog: [0, 1, 0, 6], pattern: [0, 0, 7, 0, 3, 0, 8, 7], drums: true },
  };
  const mtof = n => 440 * Math.pow(2, (n - 69) / 12);

  function startMusic(name, root) {
    if (!ctx) { music.pending = name; music.pendingRoot = root; return; }
    const base = THEMES[name] || THEMES.menu;
    const theme = { ...base, root: root || (music.pendingRoot && name !== 'menu' ? music.pendingRoot : base.root) };
    music.pendingRoot = null;
    if (music.theme && music.theme.name === name && music.theme.root === theme.root) return;
    stopMusic();
    theme.name = name;
    music.theme = theme; music.step = 0; music.next = ctx.currentTime + 0.1;
    music.timer = setInterval(schedule, 90);
  }
  function stopMusic() { if (music.timer) clearInterval(music.timer); music.timer = null; music.theme = null; }

  function note(n, t, dur, type, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = mtof(n);
    f.type = 'lowpass'; f.frequency.value = 1800;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + 0.05);
  }

  function schedule() {
    const th = music.theme;
    if (!th || !ctx) return;
    while (music.next < ctx.currentTime + 0.35) {
      const step = music.step, t = music.next;
      const bar = Math.floor(step / 8) % th.prog.length;
      const deg = th.prog[bar];
      const sc = th.scale;
      const pitch = d => th.root + sc[(deg + d) % 7] + 12 * Math.floor((deg + d) / 7);
      if (step % 8 === 0) {
        for (const d of [0, 2, 4]) note(pitch(d) - 12, t, th.tempo * 8, 'triangle', 0.06);
        note(pitch(0) - 24, t, th.tempo * 8, 'sine', 0.12);
      }
      const p = th.pattern[step % 8];
      if (!(th.name === 'menu' && step % 2)) note(pitch(p) + 12, t, th.tempo * 1.8, 'triangle', 0.05);
      if (th.drums && step % 2 === 0) { noise(0.12, 180, 0.18, 'lowpass', t - ctx.currentTime, musicGain); }
      if (th.drums && step % 4 === 2) { noise(0.08, 2500, 0.06, 'highpass', t - ctx.currentTime, musicGain); }
      music.step++; music.next += th.tempo;
    }
  }

  return { ensure, apply, play, startMusic, stopMusic, ready: () => !!ctx };
})();
