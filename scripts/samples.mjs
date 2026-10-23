// Builds public/samples from two CC0 libraries by the same author, VCSL and VSCO-2 CE: sparse-clones
// only the folders we use, picks one velocity layer per note, converts to small mono mp3s and writes
// the manifest.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "public/samples");
const REPOS = {
  vcsl: { url: "https://github.com/sgossner/VCSL.git", cache: join(ROOT, ".cache/vcsl") },
  vsco: { url: "https://github.com/sgossner/VSCO-2-CE.git", cache: join(ROOT, ".cache/vsco") },
};

const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (n) => {
  const m = /^([A-G])(#?)(-?\d)$/.exec(n);
  if (!m) throw new Error(`bad note ${n}`);
  return (Number(m[3]) + 1) * 12 + NAMES[m[1]] + (m[2] ? 1 : 0);
};
const name = (m) => `${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][m % 12]}${Math.floor(m / 12) - 1}`;

// Each pitched part is one or more sources. `re` captures the note and, where the library has
// several, the velocity layer; `layers` is the order of preference. `transpose` is what to add to
// the library's label to get the sounding pitch: both libraries mostly call middle C "C3".
// `range` is in sounding pitch. pitchcheck.mjs verifies every sample.
const NOTE = "(?<note>[A-G]#?-?\\d)";
const PITCHED = {
  piano: [{ repo: "vcsl", dir: "Chordophones/Zithers/Grand Piano, Steinway B/Sus", re: `^JHPiano_Sus_Close_${NOTE}_vl(?<layer>\\d)_rr1\\.wav$`, layers: ["3", "2", "4"], range: ["C2", "C6"], seconds: 4, transpose: 0 }],
  keys: [{ repo: "vcsl", dir: "Electrophones/TX81Z/FM Piano", re: `^FMPiano_${NOTE}_vl2\\.wav$`, range: ["C2", "C6"], seconds: 4, transpose: 0 }],
  bass: [{ repo: "vsco", dir: "Strings/Solo Contrabass/Pizz", re: `^BKCtbss_Pizz_${NOTE}_v(?<layer>\\d)_rr1\\.wav$`, layers: ["3", "1"], range: ["E1", "G3"], seconds: 2.5, transpose: 12 }],
  sax: [{ repo: "vcsl", dir: "Aerophones/Reed Aerophones/Tenor Saxophone/Non-Vibrato", re: `^BrettTenor_NV_Main_${NOTE}_vl2_rr1\\.wav$`, range: ["A2", "E5"], seconds: 3, transpose: 12 }],
  trumpet: [{ repo: "vsco", dir: "Brass/Trumpet/harmonM-sus", re: `^Sum_SHTrumpet_harmonM-sus_${NOTE}_v(?<layer>\\d)_rr1\\.wav$`, layers: ["3", "1"], range: ["E3", "C6"], seconds: 3, transpose: 12 }],
  trombone: [{ repo: "vsco", dir: "Brass/Tenor Trombone/sus", re: `^tenortbn_sus_${NOTE}_v(?<layer>\\d)_1\\.wav$`, layers: ["2", "3", "1"], range: ["E2", "F4"], seconds: 3, transpose: 12 }],
  flute: [{ repo: "vsco", dir: "Woodwinds/Flute/susNV", re: `^LDFlute_susNV_${NOTE}_v(?<layer>\\d)_1\\.wav$`, layers: ["1", "2", "3"], range: ["C4", "C7"], seconds: 3, transpose: 12 }],
  clarinet: [{ repo: "vsco", dir: "Woodwinds/Clarinet/susLong", re: `^DCClar_susLong_${NOTE}_v(?<layer>\\d)_rr1_sum\\.wav$`, layers: ["2", "1", "3"], range: ["D3", "D6"], seconds: 3, transpose: 12 }],
  vibes: [{ repo: "vcsl", dir: "Idiophones/Struck Idiophones/Vibraphone/Soft Mallets", re: `^Vibes_soft_${NOTE}_v2_rr1_Main\\.wav$`, range: ["F3", "F6"], seconds: 4, transpose: 12 }],
  harmonica: [{ repo: "vcsl", dir: "Aerophones/Free Aerophones/Harmonica-Hohner-Special20-C/Sustains/Normal", re: `^Hohner-Special20_Normal_${NOTE}\\.wav$`, range: ["C4", "C6"], seconds: 3, transpose: 12 }],
  // one string section across the range: cellos low, violas in the middle, violins on top
  strings: [
    { repo: "vsco", dir: "Strings/Cello Section/susvib", re: `^susvib_${NOTE}_v(?<layer>\\d)_1\\.wav$`, layers: ["1", "3"], range: ["C2", "G3"], seconds: 4, transpose: 12 },
    { repo: "vsco", dir: "Strings/Viola Section/susvib", re: `^ViolaEns_susvib_${NOTE}_v(?<layer>\\d)_1\\.wav$`, layers: ["1", "2"], range: ["G#3", "B4"], seconds: 4, transpose: 12 },
    { repo: "vsco", dir: "Strings/Violin Section/susVib", re: `^VlnEns_susVib_${NOTE}_v(?<layer>\\d)\\.wav$`, layers: ["1", "2"], range: ["C5", "D6"], seconds: 4, transpose: 12 },
  ],
  marimba: [{ repo: "vcsl", dir: "Idiophones/Struck Idiophones/Marimba", re: `^Marimba_hit_Outrigger_${NOTE}_med_01\\.wav$`, range: ["C3", "C6"], seconds: 2, transpose: 12 }],
  glock: [{ repo: "vcsl", dir: "Idiophones/Struck Idiophones/Glockenspiel", re: `^glock_medium_${NOTE}_01\\.wav$`, range: ["G5", "C8"], seconds: 2.5, transpose: 12 }],
};

const SNARE = "Membranophones/Struck Membranophones/Snare Drum, Modern 1";
const SUS1 = "Idiophones/Struck Idiophones/Suspended Cymbal 1";
const SUS2 = "Idiophones/Struck Idiophones/Suspended Cymbal 2";
const CONGA = "Membranophones/Struck Membranophones/Conga";
const BONGO = "Membranophones/Struck Membranophones/Bongos";
const DRUMS = {
  hat: { dir: "Idiophones/Struck Idiophones/Hi-Hat Cymbal", files: { closed: "HiHat_HitC_v2_rr1_Mid.wav", closed2: "HiHat_HitC_v2_rr2_Mid.wav", ghost: "HiHat_HitC_v1_rr1_Mid.wav", open: "HiHat_HitLoose_rr1_Mid.wav" }, seconds: 1.2 },
  snare: {
    dir: SNARE,
    files: { hit: "Snare2_HitSN_v5_rr1_Mid.wav", hit2: "Snare2_HitSN_v5_rr2_Mid.wav", ghost: "Snare2_HitSN_v3_rr1_Mid.wav", rim: "Snare2_stick_v1_rr1_Mid.wav", tap: "Snare2_taps_v4_rr1_Mid.wav", roll: "Snare2_rollSN_v4_rr1_Mid.wav" },
    seconds: 1.2,
    long: { roll: 2.5 },
  },
  shaker: { dir: "Idiophones/Struck Idiophones/Shaker, Small", files: { down: "Mid_ShakerDouble_Down_rr1.wav", up: "Mid_ShakerDouble_Up_rr1.wav" }, seconds: 0.6 },
  // a suspended cymbal hit with a stick, played soft, is the ride; the bell and a crash from the other cymbal
  ride: { dir: SUS2, files: { ride: "susCymb2_hit_stick_mp1.wav", soft: "susCymb2_hit_stick_pp1.wav", bell: "susCymb2_hit_bell_p1.wav" }, seconds: 2.5 },
  crash: { dir: SUS1, files: { crash: "susCymb1_hit_f1.wav", swell: "susCymb1_cresc_2s.wav" }, seconds: 3.5 },
  tom: { dir: "Membranophones/Struck Membranophones", files: { high: "Tom 1/Stick/TomH_HitS_v3_rr1_Mid.wav", low: "Tom 2/Stick/TomL_HitS_v3_rr1_Mid.wav" }, seconds: 1.2 },
  conga: { dir: CONGA, files: { open: "Conga_HitN_v2_rr1_Sum.wav", mute: "Conga_HitFM_v2_rr1_Sum.wav", high: "Quinto_HitN_v2_rr1_Sum.wav", low: "Tumba_HitN_v2_rr1_Sum.wav" }, seconds: 1 },
  bongo: { dir: BONGO, files: { high: "BongoH_Hit1_v2_rr1_Mid.wav", low: "BongoL_Hit1_v2_rr1_Mid.wav", mute: "BongoH_HitMuted1_v2_rr1_Mid.wav" }, seconds: 0.8 },
  clave: { dir: "Idiophones/Struck Idiophones/Claves", files: { hit: "Claves1_Hit_v2_rr1_Mid.wav" }, seconds: 0.5 },
};

function clone() {
  const want = { vcsl: Object.values(DRUMS).map((d) => d.dir), vsco: [] };
  for (const sources of Object.values(PITCHED)) for (const s of sources) want[s.repo].push(s.dir);
  for (const [repo, dirs] of Object.entries(want)) {
    const { url, cache } = REPOS[repo];
    if (!existsSync(join(cache, ".git"))) {
      mkdirSync(join(ROOT, ".cache"), { recursive: true });
      execFileSync("git", ["clone", "--quiet", "--depth=1", "--filter=blob:none", "--sparse", url, cache], { stdio: "inherit" });
    }
    execFileSync("git", ["-C", cache, "sparse-checkout", "set", "--no-cone", ...[...new Set(dirs)].map((d) => `/${d}/`)], { stdio: "inherit" });
  }
}

/** Peak level in dB of the trimmed sample, so every sample can be normalized to -1 dBFS. */
function peakDb(src, trim) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", src, "-af", `${trim},volumedetect`, "-f", "null", "-"], { encoding: "utf8" });
  const m = /max_volume: (-?[\d.]+) dB/.exec(r.stderr);
  if (!m) throw new Error(`no level for ${src}`);
  return Number(m[1]);
}

// Both libraries are recorded with lots of headroom (some samples peak near -30 dBFS); normalize each one.
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

for (const [inst, sources] of Object.entries(PITCHED)) {
  manifest[inst] = [];
  const seen = new Set();
  for (const cfg of sources) {
    const dir = join(REPOS[cfg.repo].cache, cfg.dir);
    const re = new RegExp(cfg.re);
    const [lo, hi] = cfg.range.map(midi);
    // the preferred layer of each note in range
    const best = new Map();
    for (const f of readdirSync(dir)) {
      const m = re.exec(f);
      if (!m) continue;
      const note = midi(m.groups.note) + cfg.transpose;
      if (note < lo - 2 || note > hi + 2) continue;
      const rank = cfg.layers ? cfg.layers.indexOf(m.groups.layer) : 0;
      if (rank < 0) continue;
      const cur = best.get(note);
      if (!cur || rank < cur.rank) best.set(note, { f, rank });
    }
    for (const note of [...best.keys()].sort((a, b) => a - b)) {
      if (seen.has(note)) continue;
      seen.add(note);
      const file = `${inst}-${name(note).replace("#", "s")}.mp3`;
      convert(join(dir, best.get(note).f), join(OUT, file), cfg.seconds);
      manifest[inst].push({ note: name(note), file });
    }
  }
  manifest[inst].sort((a, b) => midi(a.note) - midi(b.note));
  if (!manifest[inst].length) throw new Error(`${inst}: no samples`);
  console.log(`${inst}: ${manifest[inst].map((s) => s.note).join(" ")}`);
}

for (const [inst, cfg] of Object.entries(DRUMS)) {
  manifest[inst] = [];
  for (const [variant, f] of Object.entries(cfg.files)) {
    const src = join(REPOS.vcsl.cache, cfg.dir, f);
    if (!existsSync(src)) throw new Error(`${inst}/${variant}: no ${f}`);
    const file = `${inst}-${variant}.mp3`;
    convert(src, join(OUT, file), cfg.long?.[variant] ?? cfg.seconds);
    manifest[inst].push({ note: variant, file, source: f });
  }
  console.log(`${inst}: ${Object.keys(cfg.files).join(" ")}`);
}

writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
