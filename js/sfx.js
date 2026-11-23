// =====================================================================
//  Природні звуки сцен (синтез WebAudio, без звукових файлів):
//  • bell()  — великий церковний дзвін (реальні обертони дзвона, биття, удар язика)
//  • horn()  — далекий гудок поїзда (м'який «тифон», тихий, але помітний)
//  Звук іде через AudioContext головної сторінки — вона вже отримала дотик користувача.
// =====================================================================
let AC = null, BUS = null;

export function audio() {
  try {
    if (!AC) {
      try { if (window.parent !== window && window.parent.__sharedAudio) AC = window.parent.__sharedAudio(); } catch (e) { AC = null; }
      if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AC = new C(); }
      BUS = makeBus(AC);
    }
    if (AC.state === 'suspended') AC.resume().catch(() => {});
  } catch (e) { return null; }
  return AC;
}
export const ready = () => !!(audio() && AC.state === 'running');

// Імпульсна характеристика «відкритого простору»: ранні відлуння від будинків + темніючий хвіст
function impulse(ac, sec, damp) {
  const len = Math.floor(ac.sampleRate * sec), ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len, k = 0.15 + 0.8 * Math.pow(t, 0.6) * damp; // з часом хвіст темнішає
      lp += (1 - k) * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - t, 2.4);
    }
    // кілька ранніх відбиттів (луна від стін)
    for (const [ms, g] of [[38, 0.5], [71, 0.35], [119, 0.25], [187, 0.16]]) { const j = Math.floor(ac.sampleRate * (ms + c * 7) / 1000); if (j < len) d[j] += g; }
  }
  return ir;
}
function makeBus(ac) {
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 2.5; comp.attack.value = 0.01; comp.release.value = 0.4;
  comp.connect(ac.destination);
  const master = ac.createGain(); master.gain.value = 0.9; master.connect(comp);
  const verb = ac.createConvolver(); verb.buffer = impulse(ac, 4.2, 0.9);
  const wet = ac.createGain(); wet.gain.value = 0.32; verb.connect(wet); wet.connect(master);
  // «повітря»: далекі звуки втрачають високі частоти
  const air = ac.createBiquadFilter(); air.type = 'lowpass'; air.frequency.value = 6500; air.Q.value = 0.5; air.connect(master);
  return { master, verb, air };
}
function send(node, dry, wet) {
  const d = AC.createGain(); d.gain.value = dry; node.connect(d); d.connect(BUS.air);
  const w = AC.createGain(); w.gain.value = wet; node.connect(w); w.connect(BUS.verb);
}

// ---------------------------------------------------------------- ДЗВІН
// Обертони реального дзвона відносно «номінала»: hum, prime, tierce (мала терція), quint, nominal…
// [частота, гучність, час згасання T60 у секундах]
const BELL = [
  [0.5, 0.42, 16], [1.0, 0.55, 10], [1.188, 0.5, 8], [1.5, 0.22, 6], [2.0, 0.6, 5.5],
  [2.508, 0.26, 3.6], [2.664, 0.22, 3.0], [3.011, 0.24, 2.4], [4.166, 0.13, 1.6], [5.433, 0.08, 1.1], [6.79, 0.05, 0.8]
];
/** Удар великого дзвона. when — затримка в секундах, vol — 0…1 */
export function bell(when = 0, vol = 1, nominal = 196) {
  if (!ready()) return;
  const t0 = AC.currentTime + 0.03 + when;
  const out = AC.createGain(); out.gain.value = 0.22 * vol;
  const pan = AC.createStereoPanner ? AC.createStereoPanner() : null;
  if (pan) { pan.pan.value = -0.15; out.connect(pan); send(pan, 0.85, 0.55); } else send(out, 0.85, 0.55);
  const f0 = nominal * (1 + (Math.random() - 0.5) * 0.004);
  BELL.forEach(([r, a, t60], k) => {
    // кожен обертон — «дублет» двох близьких мод: дає живе биття («вау-вау») дзвона
    const beat = 0.35 + Math.random() * 1.1;
    for (const s of [-1, 1]) {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = 'sine'; o.frequency.value = f0 * r + s * beat / 2;
      const A = a * (s < 0 ? 0.55 : 0.45) * (0.9 + Math.random() * 0.2), tau = t60 / 6.9;
      const att = k < 2 ? 0.025 : 0.003; // низькі обертони «розквітають» трохи повільніше
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(A, t0 + att); g.gain.setTargetAtTime(0, t0 + att, tau);
      o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + att + t60 + 0.5);
    }
  });
  // удар язика: короткий металевий клац + глухий поштовх
  const n = Math.floor(AC.sampleRate * 0.05), nb = AC.createBuffer(1, n, AC.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < n; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const ns = AC.createBufferSource(), bp = AC.createBiquadFilter(), ng = AC.createGain();
  ns.buffer = nb; bp.type = 'bandpass'; bp.frequency.value = f0 * 9; bp.Q.value = 2.5; ng.gain.value = 0.35;
  ns.connect(bp); bp.connect(ng); ng.connect(out); ns.start(t0);
  const th = AC.createOscillator(), tg = AC.createGain(); th.frequency.setValueAtTime(f0 * 0.5, t0); th.frequency.exponentialRampToValueAtTime(f0 * 0.25, t0 + 0.12);
  tg.gain.setValueAtTime(0.25, t0); tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15); th.connect(tg); tg.connect(out); th.start(t0); th.stop(t0 + 0.2);
}

// ---------------------------------------------------------------- ГУДОК
// Тембр тифона: гармонічний ряд з м'яким спадом + «повітря». Без різкої пилки.
let HORNWAVE = null;
function hornWave() {
  if (HORNWAVE) return HORNWAVE;
  const N = 14, re = new Float32Array(N), im = new Float32Array(N);
  const amps = [0, 1, 0.62, 0.48, 0.3, 0.22, 0.14, 0.1, 0.065, 0.045, 0.03, 0.02, 0.012, 0.008];
  for (let i = 1; i < N; i++) im[i] = amps[i];
  HORNWAVE = AC.createPeriodicWave(re, im);
  return HORNWAVE;
}
function tone(t0, dur, freqs, vol, out) {
  const env = AC.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(vol, t0 + 0.16);            // тиск повітря наростає
  env.gain.setValueAtTime(vol, t0 + dur);
  env.gain.setTargetAtTime(0, t0 + dur, 0.09);                 // м'яке згасання
  env.connect(out);
  for (const f of freqs) for (const c of [-4, 4]) {             // дві «труби» трохи розстроєні — об'ємний звук
    const o = AC.createOscillator(); o.setPeriodicWave(hornWave()); o.detune.value = c;
    o.frequency.setValueAtTime(f * 0.965, t0); o.frequency.exponentialRampToValueAtTime(f, t0 + 0.2); // висота «встає» на початку
    o.frequency.setValueAtTime(f, t0 + dur); o.frequency.exponentialRampToValueAtTime(f * 0.985, t0 + dur + 0.3);
    o.connect(env); o.start(t0); o.stop(t0 + dur + 0.6);
  }
  // шум повітря
  const n = Math.floor(AC.sampleRate * (dur + 0.4)), nb = AC.createBuffer(1, n, AC.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;
  const ns = AC.createBufferSource(), bp = AC.createBiquadFilter(), ng = AC.createGain();
  ns.buffer = nb; bp.type = 'bandpass'; bp.frequency.value = freqs[0] * 3; bp.Q.value = 1.2; ng.gain.value = 0.05;
  ns.connect(bp); bp.connect(ng); ng.connect(env); ns.start(t0);
}
/** Гудок поїзда. kind 0 — електропоїзд (два короткі тони), 1 — локомотив (довгий низький акорд) */
export function horn(kind = 0, vol = 1) {
  if (!ready()) return;
  const t0 = AC.currentTime + 0.05;
  // «далеко»: зрізаємо низ і верх, більше луни — тихо, але помітно
  const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 160;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900; lp.Q.value = 0.6;
  const body = AC.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 700; body.Q.value = 1.1; body.gain.value = 4;
  hp.connect(lp); lp.connect(body); send(body, 0.55, 0.75);
  const v = 0.032 * vol;
  if (kind === 1) tone(t0, 1.5, [233, 294], v, hp);
  else { tone(t0, 0.42, [440, 554], v, hp); tone(t0 + 0.62, 0.95, [370, 466], v, hp); }
}
