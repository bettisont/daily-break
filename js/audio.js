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
  if (!ARC.timer) ARC.timer = setInterval(arcadeTick, 30);
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
  if (!audio || !musicOn || muted || document.hidden || round?.trick) return;   // (the timed trial has its own soundtrack)
  const t = audio.currentTime + 0.05, ch = CHORDS[chordIdx++ % CHORDS.length];
  ch.forEach((f, k) => epiano(f, t + k * 0.035, 6, k ? 0.016 : 0.022));
  const mel = [523.25, 587.33, 659.25, 783.99, 880];
  for (let k = 0; k < 3; k++) if (Math.random() < 0.55) epiano(mel[Math.floor(Math.random() * mel.length)], t + 1.6 + k * 1.3 + Math.random() * 0.3, 2.2, 0.012);
}
// The timed trial's soundtrack (reworked 23 Nov, after a playtest found the chiptune version "a bit cringey"): a dark
// synthwave groove in A minor, after the vertical layering in Tetris Effect, Lumines and Rez rather than a tune that
// bounces. Only the multiplier moves it, never the clock (23 Nov playtest). arcadeTick runs every 30 ms and schedules arcadeStep 16ths ARC_AHEAD seconds ahead on the
// audio clock. The run drives it:
// - the tempo rises with the multiplier (112 bpm at x1, 6 more per step, 136 from x5), and a low-pass filter over the
//   synths opens with it (about 700 Hz at x1, wide open by x4);
// - layers come in by multiplier: kick, rolling 16th bass, pad and off-beat hats from the start; an arpeggio from
//   x1.5; a clap and 16th hats from x2; a sparse lead from x3; an open hat from x4;
// - the multiplier going up gives the filter a push and a breath of air; going down drops the drums out until the
//   next bar but one (the Lumines-style "burst"), with the filter pulled low, and they come back on the downbeat;
// - the pad and bass duck under every kick (sidechain pump), and a reverse-cymbal swell leads into every fourth bar.
// ARC_SONG: eight 4-bar sections (64 s) over three progressions; the arpeggio's shape changes each section.
const ARC = { next: 0, step: 0, timer: null, mult: 1, cut: 0, dropTo: -1 }, ARC_AHEAD = 0.15;
const arcBpm = m => 112 + (m - 1) * 6;
const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
// chords as MIDI notes (low to high), one per bar
const ARC_PROG = {
  A: [[57, 60, 64, 67], [53, 57, 60, 64], [50, 53, 57, 60], [52, 55, 59, 62]],   // Am7 Fmaj7 Dm7 Em7
  B: [[53, 57, 60, 64], [55, 59, 62, 67], [52, 55, 59, 62], [57, 60, 64, 67]],   // Fmaj7 G Em7 Am7
  C: [[50, 53, 57, 60], [57, 60, 64, 67], [46, 50, 53, 57], [52, 56, 59, 64]],   // Dm7 Am7 Bbmaj7 E (the lift)
};
// the lead: per bar, [16th step, MIDI note, length in 16ths]; long notes, lots of space
const ARC_LEAD = {
  A: [[[0, 76, 6], [6, 74, 2], [8, 72, 8]], [[0, 69, 12]], [[0, 74, 4], [4, 76, 4], [8, 77, 8]], [[0, 76, 14]]],
  B: [[[0, 72, 8], [8, 69, 8]], [[0, 71, 8], [8, 74, 8]], [[0, 76, 12], [12, 74, 4]], [[0, 72, 8], [8, 71, 4], [12, 69, 4]]],
  C: [[[0, 77, 8], [8, 76, 8]], [[0, 72, 16]], [[0, 74, 8], [8, 77, 8]], [[0, 68, 8], [8, 71, 8]]],
};
// arpeggio shapes: indexes into the chord's notes plus the octave above (0-7)
const ARC_ARPS = [[0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7], [0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 4, 3, 1],
  [7, 5, 6, 4, 5, 3, 4, 2, 7, 5, 6, 4, 5, 3, 4, 2], [0, 4, 2, 6, 1, 5, 3, 7, 0, 4, 2, 6, 1, 5, 3, 7]];
const ARC_SONG = ['A', 'B', 'A', 'B', 'C', 'B', 'A', 'C'];
const ARC_LEN = ARC_SONG.length * 64;
let arcadeBus = null, arcSynth = null, arcPump = null, arcDelay = null, arcEcho = null;
function arcadeNodes() {
  // drums go straight to arcadeBus; synths go through the pump (sidechain) and the multiplier's filter; the arp and lead
  // also feed a dotted-8th echo
  arcadeBus = audio.createGain(); arcadeBus.gain.value = 0.55; arcadeBus.connect(master);
  arcSynth = audio.createBiquadFilter(); arcSynth.type = 'lowpass'; arcSynth.Q.value = 3; arcSynth.frequency.value = 700;
  arcSynth.connect(arcadeBus);
  arcPump = audio.createGain(); arcPump.connect(arcSynth);
  const d = arcEcho = audio.createDelay(1), fb = audio.createGain(), lp = audio.createBiquadFilter(), wet = audio.createGain();
  d.delayTime.value = 3 * 15 / arcBpm(1); fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 2400; wet.gain.value = 0.5;
  arcDelay = audio.createGain(); arcDelay.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet).connect(arcSynth);
}
// one synth voice: oscillators (detuned for width) with an attack, a hold and a release
function arcVoice(type, f, t, dur, vol, dest, a = 0.005, r = 0.08, dets = [0], send = 0) {
  const g = audio.createGain(), end = t + dur;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.setValueAtTime(vol, Math.max(t + a, end - r)); g.gain.linearRampToValueAtTime(0, end);
  for (const det of dets) { const o = audio.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; o.connect(g); o.start(t); o.stop(end + 0.02); }
  g.connect(dest);
  if (send) { const s = audio.createGain(); s.gain.value = send; g.connect(s).connect(arcDelay); }
}
// a noise swell that rises into the next downbeat (a reversed cymbal)
function arcSwell(t, dur, vol) {
  const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
  src.buffer = noiseBuf; f.type = 'highpass'; f.frequency.setValueAtTime(800, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.95); g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(f).connect(g).connect(arcadeBus); src.start(t, Math.random() * 2, dur + 0.05);
}
const arcCut = m => Math.min(9000, 700 * Math.pow(2.2, m - 1));
function arcadeTick() {
  if (!audio || audio.state !== 'running' || !round?.trick || round.done || !musicOn || muted || document.hidden) { ARC.next = 0; ARC.step = 0; ARC.dropTo = -1; ARC.mult = hs?.mult || 1; return; }   // (each run starts from the top)
  if (!arcadeBus) arcadeNodes();
  const now = audio.currentTime, mult = hs?.mult || 1, m = Math.min(mult, 5), s16 = 15 / arcBpm(m);
  arcEcho.delayTime.setTargetAtTime(3 * s16, now, 0.3);   // the echo stays a dotted 8th as the tempo moves
  if (ARC.next < now) ARC.next = now + 0.05;
  const cut = arcCut(m), fq = arcSynth.frequency;
  if (mult > ARC.mult + 0.01) {   // up: push the filter open and let it settle back, with a breath of air
    fq.cancelScheduledValues(now); fq.setValueAtTime(fq.value, now);
    fq.linearRampToValueAtTime(Math.min(14000, cut * 3), now + 0.08); fq.setTargetAtTime(cut, now + 0.1, 0.5);
    arcSwell(now, 0.35, 0.05); ARC.cut = cut;
  } else if (mult < ARC.mult - 0.01) {   // down: the drums drop out until the next bar but one, the filter dips
    fq.cancelScheduledValues(now); fq.setValueAtTime(fq.value, now);
    fq.exponentialRampToValueAtTime(350, now + 0.15); fq.setTargetAtTime(cut, now + 1.2, 0.8);
    ARC.dropTo = (Math.floor(ARC.step / 16) + 2) * 16 % ARC_LEN; ARC.cut = cut;
  } else if (Math.abs(cut - ARC.cut) > 1) { fq.setTargetAtTime(cut, now, 0.6); ARC.cut = cut; }
  ARC.mult = mult;
  while (ARC.next < now + ARC_AHEAD) {
    arcadeStep(ARC.step, ARC.next, m, s16);
    ARC.next += s16; ARC.step = (ARC.step + 1) % ARC_LEN;
    if (ARC.step === ARC.dropTo) ARC.dropTo = -1;
  }
}
function arcadeStep(st, t, m, s16) {
  const secIdx = Math.floor(st / 64), sec = ARC_SONG[secIdx], bar = Math.floor(st / 16) % 4, i = st % 16, B = arcadeBus;
  const ch = ARC_PROG[sec][bar], drums = ARC.dropTo < 0, root = mtof(36 + ch[0] % 12);   // the chord's root in the bass octave (C2-B2)
  // kick on every beat, and the pad and bass duck under it
  if (drums && i % 4 === 0) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(B); o.start(t); o.stop(t + 0.32);
    arcPump.gain.setValueAtTime(0.3, t); arcPump.gain.setTargetAtTime(1, t + 0.02, 0.06);
  }
  // rolling bass: a plucked saw on the 16ths, rests on the beat, the octave on the last 16th of the bar
  if (i % 4 !== 0 || !drums) arcVoice('sawtooth', root * (i === 15 ? 2 : 1), t, s16 * 0.8, i % 2 ? 0.05 : 0.035, arcPump, 0.004, 0.05, [-6, 6]);
  // pad: the chord held for the bar, wide and soft
  if (i === 0) ch.forEach(n => arcVoice('sawtooth', mtof(n), t, s16 * 16, 0.008, arcPump, 0.25, 0.4, [-12, 9]));
  // arpeggio from x1.5, an octave above the pad
  if (m >= 1.5) {
    const idx = ARC_ARPS[secIdx % ARC_ARPS.length][i], n = ch[idx % 4] + 12 * (1 + (idx >> 2));
    arcVoice('square', mtof(n), t, s16 * 0.7, i % 4 === 2 ? 0.022 : 0.015, arcSynth, 0.003, 0.06, [0], 0.45);
  }
  // lead from x3: long notes that swell in, with a lot of echo
  const ln = m >= 3 && ARC_LEAD[sec][bar].find(([s]) => s === i);
  if (ln) arcVoice('sawtooth', mtof(ln[1]), t, ln[2] * s16, 0.02, arcSynth, 0.04, 0.2, [-7, 7], 0.6);
  if (!drums) return;
  // hats: off-beat 8ths, 16ths from x2; an open hat on the off-beats from x4
  const hat16 = m >= 2;
  if (i % 4 === 2) noise(0.04, 0.03, 8500, 'highpass', t - audio.currentTime, 0.7, B);
  else if (hat16 && i % 2) noise(0.025, 0.012, 9500, 'highpass', t - audio.currentTime, 0.7, B);
  if (m >= 4 && i % 4 === 2) noise(0.22, 0.018, 7000, 'highpass', t - audio.currentTime, 0.5, B);
  // clap on 2 and 4 from x2
  if (m >= 2 && (i === 4 || i === 12)) {
    const d = t - audio.currentTime;
    noise(0.16, 0.08, 1500, 'bandpass', d, 1.2, B); noise(0.05, 0.05, 1100, 'bandpass', d + 0.012, 1.5, B);
  }
  // a reverse-cymbal swell into every fourth bar
  if (i === 8 && bar === 3) arcSwell(t, s16 * 8, 0.035);
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
    else if (kind === 'Tunnel') { tone(160, 0.5, 0.18, 'sine', 3, 0, 0.5); noise(0.4, 0.15, 900, 'bandpass', 0, 2); tone(1046.5, 0.3, 0.05, 'sine', 1, 0.3, 0.6); }
    noise(0.05, 0.18, 4000, 'highpass', 0, 0.7);
  },
  // a pot or a contact on a good shot: a bright crack and a burst of air, bigger with the shot's quality (1-6). No low
  // boom of its own (23 Nov sweep: with the drop and the pot's thump it made three low thumps at once)
  bang(k) { const v = k / 6; noise(0.12 + 0.05 * k, 0.25 + 0.35 * v, 2600, 'bandpass', 0, 0.8); noise(0.3 + 0.08 * k, 0.06 + 0.12 * v, 900, 'bandpass', 0.02, 0.7); tone(392 * (1 + 0.25 * Math.min(k, 4) / 4), 0.25, 0.03 + 0.03 * v, 'triangle', 1.5, 0, 0.4); if (k >= 3) tone(1568, 0.3, 0.04, 'sine', 1, 0.05, 0.6); },
  // a multiplier landing: a bright major arpeggio with a bell on top and a shimmer, on a tuned root that climbs with
  // the multiplier (x1.5 E5, x2 G5, x2.5 A5, x3 C6: golden x2 then streak x2.5 no longer clash)
  // the timed trial's last ten seconds: a soft tick each second, higher as it runs out; and the "last shot" call
  clockTick(left) { tone(1318.5 + (10 - Math.ceil(left)) * 40, 0.05, 0.035, 'triangle', 1, 0, 0.1); },
  lastShot() { tone(659.25, 0.18, 0.06, 'triangle', 1, 0, 0.3); tone(523.25, 0.3, 0.06, 'triangle', 1, 0.16, 0.4); },
  // a time call-out: two soft rising notes, three and tighter for 10 s, the falling "last shot" at 0
  timeCall(s) {
    if (s === 0) return this.lastShot();
    const ns = s <= 10 ? [880, 880, 1174.66] : [659.25, 987.77];
    ns.forEach((f, k) => { tone(f, 0.22, 0.05, 'triangle', 1, k * (s <= 10 ? 0.09 : 0.12), 0.35); tone(f * 2, 0.15, 0.015, 'sine', 1, k * (s <= 10 ? 0.09 : 0.12) + 0.01, 0.4); });
  },
  ding(m = 2) {
    const base = m >= 3 ? 1046.5 : m >= 2.5 ? 880 : m >= 2 ? 783.99 : 659.25;   // (x3 and over: C6)
    [1, 1.25, 1.5, 2].forEach((r, i) => { tone(base * r, 0.55 + 0.12 * i, 0.045, 'triangle', 1, i * 0.05, 0.6); tone(base * r * 2, 0.4, 0.014, 'sine', 1, i * 0.05 + 0.012, 0.7); });
    noise(0.45, 0.03, 7000, 'highpass', 0.08, 0.5);
  },
  fizzle() { noise(0.45, 0.16, 2500, 'highpass', 0, 0.5); tone(700, 0.4, 0.05, 'triangle', 0.4, 0, 0.3); },
  chime() { tone(1318.5, 0.25, 0.07, 'sine', 1, 0, 0.5); tone(1975.5, 0.35, 0.05, 'sine', 1, 0.06, 0.5); },
};

