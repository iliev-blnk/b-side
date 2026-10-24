import { cutSeconds, GAP, LEAD } from "../band/side.ts";
import type { Part, Track } from "../band/types.ts";
import { type Playing, performTrack } from "../audio/perform.ts";
import type { Pack } from "../audio/samples.ts";
import { addPlayed, clearPlayed } from "../film/cues.ts";
import type { Film } from "../film/film.ts";
import { roomFor, trimFor } from "./mix.ts";
import { nearestStep, padPitch, stepsOf, stepTime } from "./pads.ts";
import { type Knob, KNOB_HOME, KNOBS, knobAt, type Take, type TakeNote } from "./take.ts";

/**
 * A night's side, live: the three tracks played on the side's clock, a take played back over them
 * and added to as someone sits in, and the two knobs. Tracks are scheduled a few seconds before
 * they start, and take notes a little ahead of the needle, so the side can be picked up anywhere.
 */

/** How hard the pads play. */
const VEL = 0.82;
/** How far ahead take notes and knob moves are scheduled. */
const AHEAD = 0.4;

interface Sounding {
  note: TakeNote;
  release(at: number): void;
}

export class Session {
  readonly knobs: Record<Knob, number> = { intensity: KNOB_HOME, room: KNOB_HOME };
  /** Called when a knob moves on its own, from the take. */
  onKnob: (knob: Knob, value: number) => void = () => {};
  private out: GainNode;
  private at0 = 0;
  private from = 0;
  private playing: (Playing | null)[] = [null, null, null];
  /** Take notes already sounded since the needle went down. */
  private sounded = new Set<TakeNote>();
  private knobsUpTo = 0;
  /** Bumped whenever the needle is lifted, so knob moves already timed for the old run are dropped. */
  private run = 0;

  constructor(
    readonly ctx: AudioContext,
    readonly pack: Pack,
    readonly film: Film,
    readonly take: Take,
    dest: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.connect(dest);
    film.cues.forEach(clearPlayed);
    for (const note of take.notes) this.mark(note);
  }

  get length() {
    return this.film.length;
  }

  private get tracks(): Track[] {
    return this.film.ep.tracks;
  }

  /** Seconds on the side, as it is being heard. */
  time(): number {
    return this.ctx.currentTime - this.at0 - (this.ctx.outputLatency || 0);
  }

  /** Puts the needle down at `from` seconds on the side. */
  start(from: number) {
    this.halt();
    this.from = Math.max(0, Math.min(this.length - 0.5, from));
    this.at0 = this.ctx.currentTime + 0.12 - this.from;
    this.sounded.clear();
    this.knobsUpTo = Math.round(this.from * 100);
    for (const k of KNOBS) this.set(k, knobAt(this.take, k, this.knobsUpTo), false);
    this.tick();
  }

  /** Schedules what is coming: the next track, take notes and knob moves. Call it often. */
  tick() {
    const now = this.ctx.currentTime - this.at0;
    const starts = this.film.starts;
    this.tracks.forEach((track, n) => {
      if (this.playing[n]) return;
      const cutStart = starts[n]! - LEAD;
      if (cutStart + cutSeconds(track) <= this.from || now < cutStart - 3) return;
      const p = performTrack(this.ctx, this.pack, track, this.at0 + starts[n]!, this.out, { tail: n < 2 ? GAP : 0, from: this.at0 + this.from });
      this.playing[n] = p;
      this.mix(n, true);
    });
    for (const note of this.take.notes) {
      if (this.sounded.has(note)) continue;
      const at = starts[note.n]! + stepTime(this.tracks[note.n]!, note.step);
      if (at < this.from || at > now + AHEAD) continue;
      this.sounded.add(note);
      const track = this.tracks[note.n]!;
      const p = this.playing[note.n];
      if (!p) continue;
      const end = starts[note.n]! + stepTime(track, note.step + note.len);
      p.voice(track.band.lead, padPitch(track, note.pad, note.step / 4), this.at0 + at, VEL, end - at);
    }
    const until = Math.round((now + AHEAD) * 100);
    for (const m of this.take.moves) {
      if (m.t <= this.knobsUpTo || m.t > until) continue;
      const delay = Math.max(0, m.t / 100 - now) * 1000;
      const run = this.run;
      setTimeout(() => {
        if (run !== this.run) return;
        this.set(m.knob, m.value, false);
        this.onKnob(m.knob, m.value);
      }, delay);
    }
    this.knobsUpTo = Math.max(this.knobsUpTo, until);
  }

  /** Which track is under the needle at side time `t`, and how far into it; null in the crackle. */
  where(t: number): { n: number; x: number } | null {
    const starts = this.film.starts;
    for (let n = 2; n >= 0; n--) {
      const x = t - starts[n]!;
      if (x >= 0) return x <= this.tracks[n]!.lengthSec ? { n, x } : null;
    }
    return null;
  }

  /** Someone hit pad `pad`. Returns what to call when they let go, or null if there's no band to play with. */
  press(pad: number): Sounding | null {
    const t = this.time();
    const w = this.where(t);
    if (!w) return null;
    const track = this.tracks[w.n]!;
    const p = this.playing[w.n];
    if (!p) return null;
    const step = Math.min(stepsOf(track) - 1, nearestStep(track, w.x));
    const note: TakeNote = { n: w.n, step, pad, len: 1 };
    const at = this.film.starts[w.n]! + stepTime(track, step);
    const midi = padPitch(track, pad, step / 4);
    const v = p.voice(track.band.lead, midi, this.at0 + at, VEL);
    this.take.notes.push(note);
    this.sounded.add(note);
    this.mark(note);
    return {
      note,
      release: () => {
        const held = this.time() - at;
        const sixteenth = 15 / track.bpm;
        note.len = Math.max(1, Math.min(64, Math.round(held / sixteenth)));
        v.release(this.ctx.currentTime);
      },
    };
  }

  /** Turns a knob (0..20); when someone does it, it goes in the take. */
  set(knob: Knob, value: number, record = true) {
    this.knobs[knob] = value;
    if (record) {
      const t = Math.max(0, Math.round(this.time() * 100));
      this.take.moves.push({ t, knob, value });
      this.take.moves.sort((a, b) => a.t - b.t);
    }
    this.playing.forEach((p, n) => p && this.mix(n, false));
  }

  private mix(n: number, at: boolean) {
    const p = this.playing[n]!;
    const track = this.tracks[n]!;
    const when = this.ctx.currentTime;
    const parts = new Set<Part>(track.events.map((e) => e.part));
    for (const part of parts) {
      const g = p.trim(part).gain;
      const v = trimFor(track, part, this.knobs.intensity / 20);
      if (at) g.value = v;
      else g.setTargetAtTime(v, when, 0.06);
    }
    const r = roomFor(p.master.base, this.knobs.room / 20);
    if (at) {
      p.master.wet.gain.value = r.wet;
      p.master.tone.frequency.value = r.cutoff;
    } else {
      p.master.wet.gain.setTargetAtTime(r.wet, when, 0.1);
      p.master.tone.frequency.setTargetAtTime(r.cutoff, when, 0.1);
    }
  }

  /** Puts a take note into the film, so the town and the horn answer it. */
  private mark(note: TakeNote) {
    const track = this.tracks[note.n]!;
    const t = stepTime(track, note.step);
    addPlayed(this.film.cues[note.n]!, { t, dur: stepTime(track, note.step + note.len) - t, midi: padPitch(track, note.pad, note.step / 4), vel: VEL });
  }

  /** Forgets what was played. */
  clear() {
    this.take.notes.length = 0;
    this.take.moves.length = 0;
    this.film.cues.forEach(clearPlayed);
    this.sounded.clear();
  }

  private halt() {
    this.run++;
    for (const p of this.playing) p?.stop();
    this.playing = [null, null, null];
  }

  stop() {
    this.halt();
    this.out.disconnect();
  }
}
