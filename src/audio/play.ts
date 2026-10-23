import { rng } from "../music/rng.ts";
import type { NoteEvent, Part, Score } from "../music/types.ts";
import type { Master } from "./master.ts";
import { nearestSample, type Pack } from "./samples.ts";
import { bassBuffer, crackleBuffer, kickBuffer } from "./synth.ts";

/** Moves off-beat positions toward the swing point (MPC-style), keeping downbeats fixed. */
export function swingBeat(beat: number, swing: number): number {
  const whole = Math.floor(beat);
  const f = beat - whole;
  return whole + (f < 0.5 ? f * (swing / 0.5) : swing + (f - 0.5) * ((1 - swing) / 0.5));
}

const MIX: Record<Part, { gain: number; pan: number }> = {
  kick: { gain: 0.95, pan: 0 },
  snare: { gain: 0.6, pan: 0.05 },
  hat: { gain: 0.3, pan: 0.25 },
  shaker: { gain: 0.32, pan: -0.25 },
  bass: { gain: 0.7, pan: 0 },
  keys: { gain: 0.34, pan: -0.15 },
  piano: { gain: 0.38, pan: -0.12 },
  sax: { gain: 0.42, pan: 0.12 },
  vibes: { gain: 0.36, pan: 0.18 },
  harmonica: { gain: 0.3, pan: 0.15 },
};

/** How long a note rings after its written length (struck things keep ringing; breath stops). */
const RELEASE: Partial<Record<Part, number>> = { sax: 0.12, harmonica: 0.1, keys: 0.35, piano: 0.5, vibes: 0.9 };

export interface Playing {
  stop(): void;
  /** Context time when the last note has rung out. */
  end: number;
}

/** Schedules a whole score at context time `at`. */
export function schedule(ctx: BaseAudioContext, pack: Pack, score: Score, at: number, master: Master): Playing {
  const spb = 60 / score.bpm;
  const human = rng(`${score.seed}/${score.mood}/human`);
  const sources: AudioScheduledSourceNode[] = [];
  const kick = kickBuffer(ctx);
  const bassCache = new Map<string, AudioBuffer>();

  const buses = new Map<Part, AudioNode>();
  const bus = (part: Part) => {
    let node = buses.get(part);
    if (!node) {
      const g = ctx.createGain();
      g.gain.value = MIX[part].gain;
      const p = ctx.createStereoPanner();
      p.pan.value = MIX[part].pan;
      g.connect(p).connect(master.input);
      buses.set(part, g);
      node = g;
    }
    return node;
  };

  const timeOf = (e: NoteEvent) => at + swingBeat(e.beat, score.swing) * spb + (human.next() * 2 - 1) * 0.008;
  let end = at + score.lengthSec;

  for (const e of score.events) {
    const t = Math.max(at, timeOf(e));
    const vel = Math.max(0.02, Math.min(1, e.vel * (1 + (human.next() * 2 - 1) * 0.1)));
    const src = ctx.createBufferSource();
    const amp = ctx.createGain();
    let rate = 1;

    if (e.part === "kick") {
      src.buffer = kick;
    } else if (e.part === "bass") {
      const secs = Math.round(e.dur * spb * 20) / 20;
      const key = `${e.midi}/${secs}`;
      let b = bassCache.get(key);
      if (!b) {
        b = bassBuffer(ctx, e.midi!, secs, bassCache.size);
        bassCache.set(key, b);
      }
      src.buffer = b;
    } else {
      const s = nearestSample(pack.index, e.part, e.midi ?? e.variant ?? "");
      const b = pack.buffers.get(s.file);
      if (!b) continue;
      src.buffer = b;
      rate = s.rate;
    }
    src.playbackRate.value = rate;

    const level = vel * vel;
    const release = RELEASE[e.part];
    if (release !== undefined) {
      const off = t + e.dur * spb;
      const attack = e.part === "sax" || e.part === "harmonica" ? 0.03 : 0.004;
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(level, t + attack);
      amp.gain.setValueAtTime(level, Math.max(t + attack, off));
      amp.gain.exponentialRampToValueAtTime(0.0001, Math.max(t + attack, off) + release);
      src.stop(off + release + 0.05);
      end = Math.max(end, off + release);
      // a horn player leans into long notes from just under the pitch
      if (e.part === "sax" && e.dur >= 1) {
        src.playbackRate.setValueAtTime(rate * 2 ** (-0.35 / 12), t);
        src.playbackRate.linearRampToValueAtTime(rate, t + 0.09);
      }
    } else {
      amp.gain.value = level;
    }
    src.connect(amp).connect(bus(e.part));
    src.start(t);
    sources.push(src);
  }

  const crackle = ctx.createBufferSource();
  crackle.buffer = crackleBuffer(ctx, Math.max(1, end - at + 1.5), 1);
  crackle.connect(master.crackle);
  crackle.start(at);
  sources.push(crackle);
  end += 1.5;

  return {
    end,
    stop() {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          // already stopped
        }
      }
      for (const b of buses.values()) b.disconnect();
    },
  };
}
