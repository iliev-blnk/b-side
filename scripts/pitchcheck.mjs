// Checks that every pitched sample sounds at the note the manifest says (within 50 cents).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = new URL("../public/samples", import.meta.url).pathname;
const SR = 32000;
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (n) => {
  const m = /^([A-G])(#?)(-?\d)$/.exec(n);
  return m ? (Number(m[3]) + 1) * 12 + NAMES[m[1]] + (m[2] ? 1 : 0) : null;
};

function pcm(file) {
  const buf = execFileSync("ffmpeg", ["-loglevel", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"], { maxBuffer: 1 << 26 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/** YIN f0 estimate on x[start..start+size], searching 30 Hz–2 kHz. */
function yin(x, start, size) {
  const minLag = Math.floor(SR / 2000);
  const maxLag = Math.floor(SR / 30);
  const d = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < size; i++) {
      const diff = x[start + i] - x[start + i + lag];
      s += diff * diff;
    }
    d[lag] = s;
  }
  let running = 0;
  const cmnd = new Float64Array(maxLag + 1);
  cmnd[0] = 1;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += d[lag];
    cmnd[lag] = (d[lag] * lag) / (running || 1);
  }
  let lag = -1;
  for (let l = minLag; l <= maxLag; l++) {
    if (cmnd[l] < 0.1) {
      while (l + 1 <= maxLag && cmnd[l + 1] < cmnd[l]) l++;
      lag = l;
      break;
    }
  }
  if (lag < 0) {
    let best = Infinity;
    for (let l = minLag; l <= maxLag; l++) if (cmnd[l] < best) { best = cmnd[l]; lag = l; }
  }
  const a = cmnd[lag - 1] ?? cmnd[lag];
  const b = cmnd[lag];
  const c = cmnd[lag + 1] ?? cmnd[lag];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return SR / (lag + shift);
}

/** Magnitude of frequency f in x[start..start+size] (Goertzel, Hann-windowed). */
function magnitude(x, start, size, f) {
  const w = (2 * Math.PI * f) / SR;
  const k = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < size; i++) {
    const s0 = x[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size)) + k * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - k * s1 * s2);
}

/**
 * YIN can lock onto a strong 2nd harmonic. If the odd harmonics of f/2 (f/2, 3f/2, 5f/2) carry
 * real energy next to the harmonics of f, the note is really f/2.
 */
function pitch(x, start, size) {
  let f = yin(x, start, size);
  // ...or slip an octave low when the period doubles; then there is nothing at f itself
  // (low strings legitimately have a weak fundamental, so only above 150 Hz)
  while (f > 150 && magnitude(x, start, size, f) < 0.05 * magnitude(x, start, size, 2 * f)) f *= 2;
  const sum = (fs) => fs.reduce((t, h) => t + magnitude(x, start, size, h), 0);
  const odd = sum([f / 2, (3 * f) / 2, (5 * f) / 2]);
  const own = sum([f, 2 * f, 3 * f]);
  // a plucked bass string has noise between its harmonics, so the subharmonic itself must be there too
  const sub = f / 2 >= 40 && magnitude(x, start, size, f / 2) > 0.15 * magnitude(x, start, size, f);
  return odd > 0.1 * own && sub ? f / 2 : f;
}

const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
let bad = 0;
let total = 0;
for (const [inst, samples] of Object.entries(manifest)) {
  for (const s of samples) {
    const want = midi(s.note);
    // above 2 kHz the estimator cannot follow (the top of the glockenspiel)
    if (want === null || want > 95) continue;
    total++;
    const x = pcm(join(DIR, s.file));
    // median over three windows: struck instruments are bright at the attack and settle later
    const size = Math.floor(0.25 * SR);
    const ests = [0.3, 0.6, 0.9]
      .map((t) => Math.floor(t * SR))
      .filter((start) => x.length >= start + size + SR / 30 + 2)
      .map((start) => 69 + 12 * Math.log2(pitch(x, start, size) / 440))
      .sort((a, b) => a - b);
    if (!ests.length) { console.log(`${s.file}: too short`); bad++; continue; }
    const got = ests[Math.floor(ests.length / 2)];
    const cents = Math.round((got - want) * 100);
    const octave = Math.round((got - want) / 12);
    const ok = Math.abs(cents) <= 50;
    if (!ok) bad++;
    console.log(`${ok ? "ok " : "BAD"} ${inst.padEnd(9)} ${s.note.padEnd(4)} ${cents >= 0 ? "+" : ""}${cents}c${octave ? `  (octave ${octave > 0 ? "+" : ""}${octave})` : ""}`);
  }
}
if (bad) {
  console.error(`${bad} of ${total} samples off by more than 50 cents`);
  process.exit(1);
}
console.log(`all ${total} samples within 50 cents`);
