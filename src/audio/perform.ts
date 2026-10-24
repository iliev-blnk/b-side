import { STYLES } from "../band/styles.ts";
import { RUNOUT } from "../band/side.ts";
import { secondsAt, spbAt } from "../band/time.ts";
import { RING } from "../band/track.ts";
import { isDrum, type NoteEvent, type Part, type Track } from "../band/types.ts";
import { rng } from "../music/rng.ts";
import { createMaster, type Master } from "./master.ts";
import { nearestSample, type Pack } from "./samples.ts";
import { brushBuffer, crackleBuffer, kickBuffer } from "./synth.ts";

/**
 * Level and place in the stereo field of every part. The samples are peak-normalized, so the leads'
 * gains even out how loud each instrument really sounds (scripts/stems.mjs checks the balance).
 */
export const MIX: Record<Part, { gain: number; pan: number }> = {
  kick: { gain: 0.8, pan: 0 },
  snare: { gain: 0.8, pan: 0.05 },
  hat: { gain: 1.0, pan: 0.25 },
  ride: { gain: 0.55, pan: -0.28 },
  crash: { gain: 0.45, pan: 0.3 },
  tom: { gain: 0.7, pan: -0.1 },
  shaker: { gain: 1.3, pan: -0.25 },
  conga: { gain: 0.7, pan: 0.35 },
  bongo: { gain: 0.6, pan: -0.35 },
  clave: { gain: 0.5, pan: 0.2 },
  brush: { gain: 0.9, pan: 0.08 },
  bass: { gain: 0.6, pan: 0 },
  piano: { gain: 1.6, pan: -0.15 },
  keys: { gain: 1.0, pan: -0.15 },
  sax: { gain: 0.61, pan: 0.12 },
  trumpet: { gain: 1.0, pan: 0.1 },
  trombone: { gain: 0.84, pan: -0.08 },
  flute: { gain: 0.7, pan: 0.14 },
  clarinet: { gain: 0.52, pan: 0.12 },
  vibes: { gain: 0.67, pan: 0.18 },
  harmonica: { gain: 0.84, pan: 0.15 },
  strings: { gain: 0.7, pan: 0 },
  marimba: { gain: 0.6, pan: 0.3 },
  glock: { gain: 0.9, pan: 0.32 },
};

/** Attack and release in seconds. Struck things start at once and ring on; breath and bows ease in. */
const ENVELOPE: Partial<Record<Part, [attack: number, release: number]>> = {
  bass: [0.004, 0.08],
  piano: [0.002, 0.5],
  keys: [0.002, 0.35],
  vibes: [0.002, 0.9],
  marimba: [0.002, 0.3],
  glock: [0.002, 1.2],
  sax: [0.03, 0.12],
  trumpet: [0.025, 0.1],
  trombone: [0.035, 0.12],
  flute: [0.05, 0.15],
  clarinet: [0.03, 0.12],
  harmonica: [0.03, 0.1],
  strings: [0.28, 0.7],
};

/** Parts that hold a note as long as it is written; their samples loop to sustain. */
const SUSTAINED = new Set<Part>(["sax", "trumpet", "trombone", "flute", "clarinet", "harmonica", "strings"]);
/** Horns lean into long notes from just under the pitch. */
const SCOOP = new Set<Part>(["sax", "trumpet", "trombone", "clarinet"]);

/** The parts a track needs loaded (synthesized ones excluded). */
export function partsOf(t: Track): Part[] {
  return [...new Set(t.events.map((e) => e.part))].filter((p) => p !== "kick" && p !== "brush");
}

const loops = new WeakMap<AudioBuffer, { buffer: AudioBuffer; start: number; end: number }>();

/**
 * A copy of the sample that loops seamlessly: the stretch just before the loop end is crossfaded
 * with the stretch just before the loop start, so the jump back is inaudible.
 */
function loopable(ctx: BaseAudioContext, src: AudioBuffer) {
  const hit = loops.get(src);
  if (hit) return hit;
  const sr = src.sampleRate;
  const out = ctx.createBuffer(src.numberOfChannels, src.length, sr);
  const start = Math.floor(src.length * 0.4);
  const end = src.length - Math.floor(sr * 0.12);
  const xf = Math.min(Math.floor(sr * 0.25), Math.floor((end - start) / 3));
  for (let c = 0; c < src.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    d.set(src.getChannelData(c));
    for (let i = 0; i < xf; i++) {
      const a = i / xf;
      const wa = Math.sqrt(1 - a);
      const wb = Math.sqrt(a);
      d[end - xf + i] = d[end - xf + i]! * wa + d[start - xf + i]! * wb;
    }
  }
  const res = { buffer: out, start: start / sr, end: end / sr };
  loops.set(src, res);
  return res;
}

export interface Playing {
  stop(): void;
  /** Context time when the last note has rung out. */
  end: number;
  master: Master;
  /** A gain after each part's mix level, for thinning the band out or pushing it. */
  trim(part: Part): GainNode;
  /**
   * Plays one more note on `part` through the band's own bus, at context time `at`. With `seconds`
   * it is written out; without, it holds until `release` is called.
   */
  voice(part: Part, midi: number, at: number, vel: number, seconds?: number): { release(at: number): void };
}

export interface PerformOptions {
  /** Seconds of crackle after the ring-out, before the next track. */
  tail?: number;
  /** Only these parts (stems, for balancing the mix). */
  only?: Part[];
  /** Context time to start from: anything before it is left out (playing from the middle of a side). */
  from?: number;
}

/**
 * Plays a track at context time `at` through its own master (the style's room), on to `out`.
 * Applies swing, the ending's slowdown, a little human timing, and the production: filtered intros
 * and breakdowns, the bass and keys ducking under the boom-bap kick, the fade, the tape stop, and
 * after the last track the needle in the run-out groove.
 */
export function performTrack(ctx: BaseAudioContext, pack: Pack, track: Track, at: number, out: AudioNode, opts: PerformOptions = {}): Playing {
  const master = createMaster(ctx, track.mood, STYLES[track.style].room);
  master.output.connect(out);
  const human = rng(`${track.seed}/${track.mood}/${track.n}/human`);
  const sources: AudioScheduledSourceNode[] = [];
  const kick = kickBuffer(ctx);
  const brushes = { sweep: brushBuffer(ctx, "sweep"), tap: brushBuffer(ctx, "tap") };
  const meter = track.meter;
  const sections = track.sections;
  const last = sections.at(-1)!;
  const endBeat = (last.startBar + last.bars) * meter;
  const timeOf = (beat: number) => at + secondsAt(track, beat);
  const from = Math.max(at, opts.from ?? at);
  /** Automation from before the context began (picking the side up late) is moved to its start. */
  const T = (x: number) => Math.max(0, x);

  // drums go straight to the master; everything else through a bus the kick can push down
  const music = ctx.createGain();
  music.connect(master.input);
  const buses = new Map<Part, { input: GainNode; trim: GainNode }>();
  const bus = (part: Part) => {
    let node = buses.get(part);
    if (!node) {
      const g = ctx.createGain();
      g.gain.value = MIX[part].gain;
      const trim = ctx.createGain();
      const p = ctx.createStereoPanner();
      p.pan.value = MIX[part].pan;
      g.connect(trim).connect(p).connect(isDrum(part) ? master.input : music);
      node = { input: g, trim };
      buses.set(part, node);
    }
    return node;
  };

  // strings spread out by pitch: cellos left, violins right
  const panFor = (part: Part, midi: number | undefined) => (part === "strings" ? Math.max(-0.5, Math.min(0.5, ((midi ?? 60) - 62) / 40)) : null);

  let end = at + track.lengthSec;
  const tapeStop = track.ending === "runout" ? timeOf((last.startBar + 1) * meter) : null;
  const tapeLen = 0.9;
  const events = opts.only ? track.events.filter((e) => opts.only!.includes(e.part)) : track.events;

  /** One note: the sample, its envelope, and the tape stop if it is still sounding then. */
  const sound = (part: Part, note: number | string | undefined, variant: string | undefined, t: number, vel: number, seconds: number | null, long: boolean) => {
    const src = ctx.createBufferSource();
    const amp = ctx.createGain();
    let rate = 1;
    let dest: AudioNode = bus(part).input;
    const pan = panFor(part, typeof note === "number" ? note : undefined);
    if (pan !== null) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(dest);
      dest = p;
    }

    let buffer: AudioBuffer;
    if (part === "kick") buffer = kick;
    else if (part === "brush") buffer = variant === "tap" ? brushes.tap : brushes.sweep;
    else {
      const s = nearestSample(pack.index, part, note ?? variant ?? "");
      const b = pack.buffers.get(s.file);
      if (!b) return null;
      buffer = b;
      rate = s.rate;
    }
    if (SUSTAINED.has(part) && (seconds === null || seconds > (buffer.duration / rate) * 0.8)) {
      const l = loopable(ctx, buffer);
      buffer = l.buffer;
      src.loop = true;
      src.loopStart = l.start;
      src.loopEnd = l.end;
    }
    src.buffer = buffer;
    src.playbackRate.value = rate;
    src.connect(amp).connect(dest);
    src.start(t);
    sources.push(src);

    const level = vel * vel;
    const env = ENVELOPE[part];
    const close = (off: number) => {
      let stopAt: number;
      if (env) {
        const release = env[1];
        amp.gain.cancelScheduledValues(off);
        amp.gain.setValueAtTime(level, off);
        amp.gain.exponentialRampToValueAtTime(0.0001, off + release);
        stopAt = off + release + 0.05;
        end = Math.max(end, off + release);
      } else {
        // one-shots ring for as long as written (cymbals, rolls), at least their natural length
        stopAt = Math.max(off, t + buffer.duration / rate) + 0.05;
      }
      if (tapeStop !== null && stopAt > tapeStop) {
        // the reels wind down: everything sounding slides down in pitch and out
        src.playbackRate.setValueAtTime(rate, Math.max(t, tapeStop));
        src.playbackRate.exponentialRampToValueAtTime(rate * 0.12, tapeStop + tapeLen);
        stopAt = Math.min(stopAt, tapeStop + tapeLen + 0.05);
      }
      src.stop(stopAt);
    };
    if (env) {
      const attack = env[0];
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(level, t + attack);
      if (SCOOP.has(part) && long) {
        src.playbackRate.setValueAtTime(rate * 2 ** (-0.35 / 12), t);
        src.playbackRate.linearRampToValueAtTime(rate, t + 0.09);
      }
    } else amp.gain.value = level;
    if (seconds !== null) close(Math.max(t + (env?.[0] ?? 0), t + seconds));
    return { release: (off: number) => close(Math.max(t + (env?.[0] ?? 0), off)) };
  };

  for (const e of events) {
    bus(e.part);
    const t = Math.max(at, timeOf(e.beat) + (human.next() * 2 - 1) * 0.008);
    if (tapeStop !== null && t > tapeStop + tapeLen) continue;
    const vel = Math.max(0.02, Math.min(1, e.vel * (1 + (human.next() * 2 - 1) * 0.1)));
    if (t < from) continue;
    sound(e.part, e.midi, e.variant, t, vel, e.dur * spbAt(track, e.beat), e.dur >= 1);
  }

  // the bass and keys duck a little under every boom-bap kick
  if (track.style === "boombap") {
    for (const e of events) {
      if (e.part !== "kick" || e.vel < 0.5) continue;
      const t = timeOf(e.beat);
      if (t < from) continue;
      music.gain.setTargetAtTime(0.72, T(t), 0.004);
      music.gain.setTargetAtTime(1, T(t + 0.04), 0.07);
    }
  }

  // section filters: boom-bap intros come in through a closed filter that opens on the head;
  // breakdowns close it half way
  const f = master.filter.frequency;
  for (const s of sections) {
    const t0 = timeOf(s.startBar * meter);
    if (s.kind === "intro" && track.style === "boombap") {
      f.setValueAtTime(650, T(t0));
      const t1 = timeOf((s.startBar + s.bars) * meter);
      f.setValueAtTime(650, T(t1 - 0.5));
      f.exponentialRampToValueAtTime(20000, T(t1));
    } else if (s.treatment === "break") {
      f.setValueAtTime(20000, T(t0 - 0.3));
      f.exponentialRampToValueAtTime(1800, T(t0));
      const t1 = timeOf((s.startBar + s.bars) * meter);
      f.setValueAtTime(1800, T(t1 - 0.4));
      f.exponentialRampToValueAtTime(20000, T(t1));
    }
  }

  const g = master.fader.gain;
  if (track.ending === "fade") {
    const t0 = timeOf(last.startBar * meter);
    const t1 = timeOf(endBeat);
    g.setValueAtTime(1, T(t0));
    g.linearRampToValueAtTime(0.0001, T(t1));
    end = Math.min(end, t1 + 0.5);
  }
  if (tapeStop !== null) {
    g.setValueAtTime(1, T(tapeStop));
    g.setTargetAtTime(0, T(tapeStop + tapeLen * 0.4), 0.12);
    end = Math.min(end, tapeStop + tapeLen + 0.3);
  }

  // the record: crackle under everything, and after the last track the needle rides the run-out groove
  const tail = opts.tail ?? 0;
  const groove = track.n === 2 ? RUNOUT : 0;
  const crackleEnd = Math.max(end, at + secondsAt(track, endBeat, false) + RING[track.ending]) + tail + groove;
  const crackle = ctx.createBufferSource();
  crackle.buffer = crackleBuffer(ctx, Math.max(1, crackleEnd - at), track.n + 1);
  crackle.connect(master.crackle);
  crackle.start(from, from - at);
  sources.push(crackle);
  if (groove > 0) {
    // 33⅓ rpm: one turn every 1.8 seconds, a soft thump where the groove locks
    const thump = ctx.createBiquadFilter();
    thump.type = "lowpass";
    thump.frequency.value = 160;
    thump.connect(master.crackle);
    const g0 = crackleEnd - groove;
    for (let k = 0; k < 4; k++) {
      const s = ctx.createBufferSource();
      s.buffer = kick;
      const a = ctx.createGain();
      a.gain.value = 0.6 * (1 - k / 4);
      s.connect(a).connect(thump);
      if (g0 + 0.4 + k * 1.8 < from) continue;
      s.start(g0 + 0.4 + k * 1.8);
      sources.push(s);
    }
    const cg = ctx.createGain();
    master.crackle.disconnect();
    master.crackle.connect(cg).connect(master.output);
    cg.gain.setValueAtTime(1, T(crackleEnd - 1.5));
    cg.gain.linearRampToValueAtTime(0, crackleEnd);
  }
  end = crackleEnd;

  return {
    end,
    master,
    trim: (part) => bus(part).trim,
    voice(part, midi, t, vel, seconds) {
      return sound(part, midi, undefined, Math.max(t, ctx.currentTime), vel, seconds ?? null, false) ?? { release() {} };
    },
    stop() {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          // already stopped
        }
      }
      master.output.disconnect();
    },
  };
}
