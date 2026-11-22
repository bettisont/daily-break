// audio.js: procedural Web Audio: ensureAudio, unlockAudio, tone, noise, the electric-piano chords and sfx.
// Relies on core.js (clamp, W) and state.js (ls, round state).

/* ----- audio: effects and lazy keys (no background hiss: the rain/vinyl ambience was removed 10 Nov 2026) ----- */

let rollGain = null, rollFilter = null, audio = null, master, fxBus, verb, musicBus, ambBus, noiseBuf, lastHit = 0, musicTimer = null, chordIdx = 0;
let muted = ls('dailybreak:muted') === '1', musicOn = ls('dailybreak:music') !== '0';

function ensureAudio() {
  if (!audio) {
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    master = audio.createGain(); master.gain.value = muted ? 0 : 0.9;
    master.connect(audio.createDynamicsCompressor()).connect(audio.destination);
    fxBus = audio.createGain(); fxBus.connect(master);
    verb = audio.createGain(); verb.gain.value = 0.45;
    const delay = audio.createDelay(1), fb = audio.createGain(), lp = audio.createBiquadFilter();
    delay.delayTime.value = 0.21; fb.gain.value = 0.4; lp.type = 'lowpass'; lp.frequency.value = 2000;
    verb.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(master);
    musicBus = audio.createGain(); musicBus.gain.value = musicOn ? 1 : 0; musicBus.connect(master); musicBus.connect(verb);
    ambBus = audio.createGain(); ambBus.gain.value = 1; ambBus.connect(master);
    noiseBuf = audio.createBuffer(1, audio.sampleRate * 3, audio.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    // the low rumble of balls rolling on the cloth: its level follows how fast everything is moving
    const rs = audio.createBufferSource(), rf = audio.createBiquadFilter();
    rs.buffer = noiseBuf; rs.loop = true; rf.type = 'lowpass'; rf.frequency.value = 260; rf.Q.value = 0.9;
    rollGain = audio.createGain(); rollGain.gain.value = 0; rollFilter = rf;
    rs.connect(rf).connect(rollGain).connect(fxBus); rs.start();
  }
  syncAudio();
  if (!musicTimer) { playChord(); musicTimer = setInterval(playChord, 6400); }
}
// Sounds can be placed left/right by where they happen on the table (set `pan` around a call with atX).
let pan = 0;
function atX(x, fn) { pan = clamp((x / W) * 2 - 1, -1, 1) * 0.6; try { fn(); } finally { pan = 0; } }
function out(node, bus) {
  if (pan && audio.createStereoPanner) { const p = audio.createStereoPanner(); p.pan.value = pan; node.connect(p).connect(bus); }
  else node.connect(bus);
}
// A running AudioContext keeps the phone's audio hardware and audio thread awake even when it's silent (the rolling
// rumble's noise loop and the echo run all the time), which costs battery. So it's suspended while the sound is off
// or the page is hidden, and resumed otherwise (16 Nov 2026). Nothing is scheduled while muted (tone, noise), so
// nothing piles up on the stopped clock to burst out on resume.
function syncAudio() {
  if (!audio) return;
  const want = !muted && !document.hidden;
  if (want && audio.state !== 'running') audio.resume?.().catch(() => {});
  else if (!want && audio.state === 'running') audio.suspend?.().catch(() => {});
}
function unlockAudio() {
  if (!audio) return;
  syncAudio();
  if (!unlockAudio.done) {  // a silent buffer started inside the gesture unlocks iOS Web Audio for good
    unlockAudio.done = true;
    try { const src = audio.createBufferSource(); src.buffer = audio.createBuffer(1, 1, 22050); src.connect(audio.destination); src.start(0); } catch {}
  }
}
for (const ev of ['touchend', 'click', 'keydown']) addEventListener(ev, () => { if (!audio) ensureAudio(); unlockAudio(); }, { capture: true, passive: true });
document.addEventListener('visibilitychange', syncAudio);
function tone(freq, dur, vol, type = 'sine', slide = 1, delay = 0, wet = 0.15, bus = fxBus) {
  if (!audio || muted) return;
  const t = audio.currentTime + delay, o = audio.createOscillator(), g = audio.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); out(g, bus);
  if (wet) { const w = audio.createGain(); w.gain.value = wet; g.connect(w).connect(verb); }
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, freq, type = 'lowpass', delay = 0, q = 0.7, bus = fxBus) {
  if (!audio || muted) return;
  const t = audio.currentTime + delay, src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
  src.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(Math.max(0.0002, vol), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g); out(g, bus); src.start(t, Math.random() * 2, dur + 0.05);
}
const CHORDS = [[146.83, 174.61, 220, 261.63, 329.63], [98, 174.61, 246.94, 329.63], [130.81, 164.81, 246.94, 293.66], [110, 196, 261.63, 329.63]];
function epiano(f, t, len, vol) {
  const g = audio.createGain(), trem = audio.createGain(), lfo = audio.createOscillator(), lfoG = audio.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  lfo.frequency.value = 4.2; lfoG.gain.value = 0.25; lfo.connect(lfoG).connect(trem.gain); trem.gain.value = 0.75;
  for (const [mul, v] of [[1, 1], [2, 0.18], [3, 0.05]]) {
    const o = audio.createOscillator(), og = audio.createGain();
    o.frequency.value = f * mul; og.gain.value = v; o.connect(og).connect(g); o.start(t); o.stop(t + len + 0.1);
  }
  g.connect(trem).connect(musicBus); lfo.start(t); lfo.stop(t + len + 0.1);
}
function playChord() {
  if (!audio || !musicOn || muted || document.hidden) return;
  const t = audio.currentTime + 0.05, ch = CHORDS[chordIdx++ % CHORDS.length];
  ch.forEach((f, k) => epiano(f, t + k * 0.035, 6, k ? 0.016 : 0.022));
  const mel = [523.25, 587.33, 659.25, 783.99, 880];
  for (let k = 0; k < 3; k++) if (Math.random() < 0.55) epiano(mel[Math.floor(Math.random() * mel.length)], t + 1.6 + k * 1.3 + Math.random() * 0.3, 2.2, 0.012);
}
const POT_SCALE = [392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
const sfx = {
  // ball on ball: a bright click with a woody body; harder hits are louder and a touch lower
  clack(v) { v = Math.min(1, v / 1600); if (v < 0.03) return; noise(0.03, 0.6 * v, 3200, 'bandpass', 0, 1.4); tone(2100 + Math.random() * 500 - v * 300, 0.045, 0.12 * v, 'sine', 1, 0, 0.05); tone(620 + Math.random() * 80, 0.06, 0.07 * v, 'triangle', 0.8, 0, 0.05); },
  // the cushion: a padded thud, with a rubbery bounce on a hard hit
  cushion(v) { v = Math.min(1, v / 2000); if (v < 0.03) return; noise(0.09, 0.35 * v, 380); tone(95, 0.12, 0.18 * v, 'sine', 0.7, 0, 0); if (v > 0.35) tone(210, 0.08, 0.06 * v, 'sine', 1.6, 0.01, 0); },
  // into the pocket: a deep leathery thunk, then the ball rolling away down the return
  // the ball dropping into the pocket: a deep wooden clunk as it lands, then a short roll down the pocket
  drop() {
    tone(78, 0.22, 0.5, 'sine', 0.6, 0.04, 0.05); tone(160, 0.09, 0.22, 'triangle', 0.7, 0.04, 0.1);
    noise(0.07, 0.45, 950, 'bandpass', 0.04, 3.5); noise(0.16, 0.25, 300, 'lowpass', 0.05);
    for (let k = 0; k < 3; k++) tone(260 + Math.random() * 90, 0.03, 0.03 * (1 - k / 4), 'triangle', 0.9, 0.24 + k * 0.08 + Math.random() * 0.02, 0);
  },
  // the cue tip on the ball: a clean strike is a solid "thock"; a miscue skids
  thock(p) { tone(190, 0.09, 0.22 + 0.15 * p, 'sine', 0.6, 0, 0.05); noise(0.025, 0.4 + 0.3 * p, 1800, 'bandpass', 0, 1.2); tone(1250, 0.03, 0.06, 'triangle', 1, 0, 0.1); },
  miscue() { noise(0.16, 0.35, 3400, 'highpass', 0, 0.8); tone(520, 0.14, 0.06, 'sawtooth', 0.5, 0, 0.1); },
  // spin taking hold off the object ball: draw zips back, follow surges on
  spin(kind, amt) { const up = kind === 'follow'; noise(0.22, 0.12 * amt, up ? 1500 : 900, 'bandpass', 0, 3); tone(up ? 380 : 760, 0.22, 0.05 * amt, 'sine', up ? 2 : 0.5, 0, 0.2); },
  // the pull-back cue: a little leather creak per step, and a thump when it bottoms out
  creak(p) { noise(0.03, 0.06 + 0.06 * p, 500 + p * 900, 'bandpass', 0, 6); },
  maxed() { tone(70, 0.14, 0.25, 'sine', 0.7, 0, 0); noise(0.06, 0.2, 300); },
  // the spin spot and aim strip: soft clicks whose pitch follows the setting
  notch(f) { tone(f, 0.018, 0.035, 'triangle', 1, 0, 0); },
  // a streak of 3 or more: a warm bass swell under the pot
  boom(k) { tone(55, 0.5, 0.22, 'sine', 0.9, 0.04, 0.2); tone(110 * (1 + (k % 3) * 0.25), 0.4, 0.06, 'triangle', 1, 0.06, 0.4); },
  // two or more balls in one shot
  multi(n) { [784, 988, 1175, 1568].slice(0, n + 1).forEach((f, k) => tone(f, 0.25, 0.05, 'sine', 1, 0.05 + k * 0.06, 0.5)); },
  pot() { tone(170, 0.22, 0.35, 'sine', 0.5, 0, 0.1); noise(0.14, 0.25, 700, 'lowpass', 0.03); tone(1300, 0.025, 0.05, 'triangle', 1, 0.1, 0.1); tone(950, 0.025, 0.04, 'triangle', 1, 0.17, 0.1); },
  // the gate: a woody creak and clack
  gate(v) { v = Math.min(1, v / 1500); noise(0.08, 0.25 * v + 0.05, 700, 'bandpass', 0, 3); tone(330, 0.06, 0.06 * v + 0.02, 'triangle', 0.7, 0.03, 0.05); },
  // a tunnel: a hollow drop going in, a rumble that rolls across underneath, and a thunk coming out
  tunnel(v) { v = clamp(v / 1500, 0.2, 1); tone(240, 0.28, 0.12 * v + 0.05, 'sine', 0.4, 0, 0.5); noise(0.18, 0.1 * v + 0.04, 500, 'lowpass', 0.02); tone(900, 0.03, 0.03, 'triangle', 0.8, 0, 0.2); },
  tunnelRoll(x0, x1, dur) {
    if (!audio || muted) return;
    const t = audio.currentTime + 0.05, src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
    src.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = 170; f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.06); g.gain.setValueAtTime(0.5, t + Math.max(0.07, dur - 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    if (audio.createStereoPanner) {
      const p = audio.createStereoPanner(), px = x => clamp((x / W) * 2 - 1, -1, 1) * 0.8;
      p.pan.setValueAtTime(px(x0), t); p.pan.linearRampToValueAtTime(px(x1), t + dur);
      g.connect(p).connect(fxBus);
    } else g.connect(fxBus);
    src.start(t, Math.random() * 2, dur + 0.05);
    tone(62, dur, 0.12, 'sine', 0.85, 0.05, 0);
  },
  tunnelOut(v) { v = clamp(v / 1500, 0.3, 1); tone(120, 0.16, 0.3 * v, 'sine', 0.45, 0, 0.1); noise(0.05, 0.3 * v, 1100, 'bandpass', 0, 2); tone(520, 0.05, 0.05, 'triangle', 1.4, 0.01, 0.2); },
  rattle() { for (let k = 0; k < 4; k++) tone(700 - k * 90, 0.04, 0.09, 'triangle', 0.8, k * 0.05, 0.1); noise(0.12, 0.2, 900, 'bandpass', 0, 2); },
  strike(p) { noise(0.02, 0.3 + 0.4 * p, 2400, 'bandpass', 0, 1); tone(820, 0.035, 0.08 + 0.1 * p, 'triangle', 1, 0, 0); },
  bumper() { tone(523, 0.25, 0.1, 'sine', 1.5, 0, 0.4); tone(784, 0.25, 0.06, 'sine', 1.5, 0.03, 0.4); },
  tick() { tone(1700 + Math.random() * 300, 0.01, 0.02, 'triangle', 1, 0, 0); },
  // pots climb a pentatonic scale as the streak builds; in-order pots add a bell on top
  potNote(k, gold) {
    sfx.pot();
    const f = POT_SCALE[Math.min(k, POT_SCALE.length - 1)];
    tone(f, 0.35, 0.07, 'triangle', 1, 0.06, 0.5); tone(f * 2, 0.25, 0.025, 'sine', 1, 0.08, 0.5);
    if (gold) { tone(f * 1.5, 0.5, 0.045, 'sine', 1, 0.14, 0.6); tone(f * 3, 0.4, 0.02, 'sine', 1, 0.16, 0.6); }
  },
  holed(good) { const n = good ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [523.25, 659.25, 783.99]; n.forEach((f, k) => { tone(f, 0.7, 0.08, 'triangle', 1, k * 0.09, 0.6); tone(f * 2, 0.4, 0.025, 'sine', 1, k * 0.09 + 0.02, 0.6); }); },
  stamp() { noise(0.12, 0.5, 300); tone(80, 0.18, 0.3, 'sine', 0.6, 0, 0.1); },
  penalty() { tone(330, 0.2, 0.08, 'triangle', 0.7, 0, 0.3); tone(262, 0.3, 0.08, 'triangle', 0.7, 0.15, 0.3); },
  click() { tone(660, 0.05, 0.05, 'sine', 1, 0, 0.2); },
  // trick scoring: a sound for each trick element as its ball drops, a lift as the streak climbs, and a fizzle when it ends
  trick(kind, n = 1) {
    if (kind === 'Extra') return this.multi(n);
    if (kind === 'Bank') { tone(660, 0.16, 0.08, 'triangle', 1, 0, 0.4); tone(990, 0.22, 0.08, 'triangle', 1, 0.09, 0.5); tone(1320, 0.3, 0.05, 'sine', 1, 0.18, 0.6); }
    else if (kind === 'Kick') { tone(90, 0.25, 0.3, 'sine', 0.6, 0, 0.1); tone(440, 0.3, 0.07, 'sawtooth', 2.2, 0.03, 0.4); }
    else if (kind === 'Combo') [587.33, 739.99, 880, 1174.66].forEach((f, k) => tone(f, 0.18, 0.06, 'triangle', 1, k * 0.055, 0.5));
    else if (kind === 'Cannon') { tone(70, 0.35, 0.35, 'sine', 0.5, 0, 0.3); noise(0.25, 0.3, 600, 'lowpass', 0, 1); tone(880, 0.2, 0.05, 'square', 0.5, 0.05, 0.4); }
    else if (kind === 'Target') { [1046.5, 1318.5, 1568, 2093].forEach((f, k) => tone(f, 0.22, 0.045, 'sine', 1, k * 0.04, 0.6)); }
    else if (kind === 'Quick') { tone(1200, 0.12, 0.06, 'square', 2, 0, 0.2); tone(2400, 0.1, 0.03, 'sine', 1, 0.06, 0.3); }
    else if (kind === 'Tunnel') { tone(160, 0.5, 0.18, 'sine', 3, 0, 0.5); noise(0.4, 0.15, 900, 'bandpass', 0, 2); tone(1046.5, 0.3, 0.05, 'sine', 1, 0.3, 0.6); }
    noise(0.05, 0.18, 4000, 'highpass', 0, 0.7);
  },
  // a pot or a contact on a good shot: a deep boom and a bright crack, bigger with the shot's quality (1-6)
  bang(k) { const v = k / 6; tone(60, 0.35 + 0.1 * k, 0.25 + 0.25 * v, 'sine', 0.5, 0, 0.3); noise(0.12 + 0.05 * k, 0.25 + 0.35 * v, 2600, 'bandpass', 0, 0.8); noise(0.3 + 0.08 * k, 0.08 + 0.15 * v, 500, 'lowpass', 0.02); if (k >= 3) tone(1568, 0.3, 0.04, 'sine', 1, 0.05, 0.6); },
  streakUp(n) { const f = 523.25 * Math.pow(2, Math.min(4, n - 1) / 6); tone(f, 0.25, 0.04, 'sine', 1.5, 0, 0.5); },
  fizzle() { noise(0.45, 0.16, 2500, 'highpass', 0, 0.5); tone(700, 0.4, 0.05, 'triangle', 0.4, 0, 0.3); },
  chime() { tone(1318.5, 0.25, 0.07, 'sine', 1, 0, 0.5); tone(1975.5, 0.35, 0.05, 'sine', 1, 0.06, 0.5); },
};

