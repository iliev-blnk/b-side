// Builds public/samples from VCSL (CC0): sparse-clones only the folders we use,
// picks one velocity layer per note, converts to small mono mp3s and writes the manifest.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = join(ROOT, ".cache/vcsl");
const OUT = join(ROOT, "public/samples");

const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (n) => {
  const m = /^([A-G])(#?)(-?\d)$/.exec(n);
  if (!m) throw new Error(`bad note ${n}`);
  return (Number(m[3]) + 1) * 12 + NAMES[m[1]] + (m[2] ? 1 : 0);
};
const name = (m) => `${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][m % 12]}${Math.floor(m / 12) - 1}`;

// transpose: semitones to add to the VCSL label to get the sounding pitch. Most VCSL folders call
// middle C "C3"; pitchcheck.mjs verifies every sample.
const PITCHED = {
  piano: { dir: "Chordophones/Zithers/Upright Piano, Knight/Sustains", re: /^Player_vl2_rr1_([A-G]#?-?\d)\.wav$/, range: ["C2", "C6"], seconds: 4, transpose: 12 },
  keys: { dir: "Electrophones/TX81Z/FM Piano", re: /^FMPiano_([A-G]#?-?\d)_vl2\.wav$/, range: ["C2", "C6"], seconds: 4, transpose: 0 },
  sax: { dir: "Aerophones/Reed Aerophones/Tenor Saxophone/Non-Vibrato", re: /^BrettTenor_NV_Main_([A-G]#?-?\d)_vl2_rr1\.wav$/, range: ["A2", "E5"], seconds: 3, transpose: 12 },
  vibes: { dir: "Idiophones/Struck Idiophones/Vibraphone/Soft Mallets", re: /^Vibes_soft_([A-G]#?-?\d)_v2_rr1_Main\.wav$/, range: ["F3", "F6"], seconds: 4, transpose: 12 },
  harmonica: { dir: "Aerophones/Free Aerophones/Harmonica-Hohner-Special20-C/Sustains/Normal", re: /^Hohner-Special20_Normal_([A-G]#?-?\d)\.wav$/, range: ["C4", "C6"], seconds: 3, transpose: 12 },
};

const DRUMS = {
  hat: { dir: "Idiophones/Struck Idiophones/Hi-Hat Cymbal", files: { closed: "HiHat_HitC_v2_rr1_Mid.wav", closed2: "HiHat_HitC_v2_rr2_Mid.wav", ghost: "HiHat_HitC_v1_rr1_Mid.wav", open: "HiHat_HitLoose_rr1_Mid.wav" }, seconds: 1.2 },
  snare: { dir: "Membranophones/Struck Membranophones/Snare Drum, Modern 1", files: {}, seconds: 1.2 },
  shaker: { dir: "Idiophones/Struck Idiophones/Shaker, Small", files: { down: "Mid_ShakerDouble_Down_rr1.wav", up: "Mid_ShakerDouble_Up_rr1.wav" }, seconds: 0.6 },
};

function clone() {
  const dirs = [...Object.values(PITCHED), ...Object.values(DRUMS)].map((x) => x.dir);
  if (!existsSync(join(CACHE, ".git"))) {
    mkdirSync(join(ROOT, ".cache"), { recursive: true });
    execFileSync("git", ["clone", "--quiet", "--depth=1", "--filter=blob:none", "--sparse", "https://github.com/sgossner/VCSL.git", CACHE], { stdio: "inherit" });
  }
  execFileSync("git", ["-C", CACHE, "sparse-checkout", "set", "--no-cone", ...dirs.map((d) => `/${d}/`)], { stdio: "inherit" });
}

/** Peak level in dB of the trimmed sample, so every sample can be normalized to -1 dBFS. */
function peakDb(src, trim) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", src, "-af", `${trim},volumedetect`, "-f", "null", "-"], { encoding: "utf8" });
  const m = /max_volume: (-?[\d.]+) dB/.exec(r.stderr);
  if (!m) throw new Error(`no level for ${src}`);
  return Number(m[1]);
}

// VCSL is recorded with lots of headroom (some samples peak near -30 dBFS); normalize each one.
function convert(src, dst, seconds) {
  const trim = `silenceremove=start_periods=1:start_threshold=-50dB,atrim=0:${seconds},afade=t=out:st=${seconds - 0.05}:d=0.05`;
  const gain = -1 - peakDb(src, trim);
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y", "-i", src,
    "-af", `${trim},volume=${gain.toFixed(2)}dB`,
    "-ac", "1", "-ar", "32000", "-c:a", "libmp3lame", "-q:a", "5", dst,
  ]);
}

clone();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const manifest = {};

for (const [inst, cfg] of Object.entries(PITCHED)) {
  const [lo, hi] = cfg.range.map(midi);
  const files = readdirSync(join(CACHE, cfg.dir))
    .map((f) => ({ f, m: cfg.re.exec(f) }))
    .filter((x) => x.m)
    .map((x) => ({ f: x.f, note: midi(x.m[1]) + cfg.transpose }))
    .filter((x) => x.note >= lo - 2 && x.note <= hi + 2)
    .sort((a, b) => a.note - b.note);
  // one sample per pitch
  const seen = new Set();
  manifest[inst] = [];
  for (const { f, note } of files) {
    if (seen.has(note)) continue;
    seen.add(note);
    const file = `${inst}-${name(note).replace("#", "s")}.mp3`;
    convert(join(CACHE, cfg.dir, f), join(OUT, file), cfg.seconds);
    manifest[inst].push({ note: name(note), file });
  }
  console.log(`${inst}: ${manifest[inst].map((s) => s.note).join(" ")}`);
}

const snareDir = join(CACHE, DRUMS.snare.dir);
const snares = readdirSync(snareDir);
DRUMS.snare.files = {
  hit: snares.find((f) => /^Snare2_HitSN_v[45]_rr1/.test(f)) ?? snares.find((f) => f.startsWith("Snare2_HitSN")),
  hit2: snares.find((f) => /^Snare2_HitSN_v[45]_rr2/.test(f)) ?? snares.find((f) => f.startsWith("Snare2_HitSN")),
  ghost: snares.find((f) => /^Snare2_HitSN_v[12]_rr1/.test(f)) ?? snares.find((f) => f.startsWith("Snare2_taps")),
  rim: snares.find((f) => f.startsWith("Snare2_stick")),
};
for (const [inst, cfg] of Object.entries(DRUMS)) {
  manifest[inst] = [];
  for (const [variant, f] of Object.entries(cfg.files)) {
    if (!f) throw new Error(`${inst}/${variant}: no source file`);
    const file = `${inst}-${variant}.mp3`;
    convert(join(CACHE, cfg.dir, f), join(OUT, file), cfg.seconds);
    manifest[inst].push({ note: variant, file, source: f });
  }
  console.log(`${inst}: ${Object.entries(cfg.files).map(([v, f]) => `${v}=${f}`).join(" ")}`);
}

writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
