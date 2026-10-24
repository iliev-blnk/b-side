/**
 * A take: what someone played over a night's side, small enough to live in the link. Notes are
 * kept as steps on the band's grid and pads, not pitches, so the record plays them back exactly.
 * Knob moves are kept in hundredths of a second on the side.
 */

export interface TakeNote {
  /** Which track, and which of its sixteenths. */
  n: number;
  step: number;
  pad: number;
  /** In sixteenths. */
  len: number;
}

export type Knob = "intensity" | "room";

export interface KnobMove {
  /** Hundredths of a second from the needle drop. */
  t: number;
  knob: Knob;
  /** 0..20, a twentieth of the knob's travel each. */
  value: number;
}

export interface Take {
  notes: TakeNote[];
  moves: KnobMove[];
}

export const KNOBS: Knob[] = ["intensity", "room"];
/** Where each knob sits as the record was written. */
export const KNOB_HOME = 10;
export const MAX_LEN = 64;
const VERSION = 1;
/** Steps are counted across the side, a track's worth of room each. */
const TRACK_ROOM = 8192;

export const emptyTake = (): Take => ({ notes: [], moves: [] });

function sorted(t: Take): Take {
  const at = (x: TakeNote) => x.n * TRACK_ROOM + x.step;
  return {
    notes: [...t.notes].sort((a, b) => at(a) - at(b) || a.pad - b.pad),
    moves: [...t.moves].sort((a, b) => a.t - b.t),
  };
}

function varint(out: number[], v: number) {
  let x = Math.max(0, Math.floor(v));
  while (x >= 0x80) {
    out.push((x & 0x7f) | 0x80);
    x = Math.floor(x / 0x80);
  }
  out.push(x);
}

export function encodeTake(take: Take): string {
  const t = sorted(take);
  const out: number[] = [VERSION];
  varint(out, t.notes.length);
  let prev = 0;
  for (const x of t.notes) {
    const at = x.n * TRACK_ROOM + x.step;
    varint(out, at - prev);
    prev = at;
    varint(out, (Math.min(MAX_LEN, Math.max(1, x.len)) - 1) * 9 + x.pad);
  }
  varint(out, t.moves.length);
  prev = 0;
  for (const m of t.moves) {
    varint(out, m.t - prev);
    prev = m.t;
    varint(out, KNOBS.indexOf(m.knob) * 21 + m.value);
  }
  let s = "";
  for (const b of out) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The take in a link, or null if it isn't one. */
export function decodeTake(text: string): Take | null {
  try {
    const raw = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Array.from(raw, (c) => c.charCodeAt(0));
    let i = 0;
    const read = () => {
      let v = 0;
      let mul = 1;
      for (;;) {
        if (i >= bytes.length) throw new Error("short");
        const b = bytes[i++]!;
        v += (b & 0x7f) * mul;
        if (b < 0x80) return v;
        mul *= 0x80;
      }
    };
    if (read() !== VERSION) return null;
    const take = emptyTake();
    let at = 0;
    for (let k = read(); k > 0; k--) {
      at += read();
      const v = read();
      take.notes.push({ n: Math.floor(at / TRACK_ROOM), step: at % TRACK_ROOM, pad: v % 9, len: Math.floor(v / 9) + 1 });
    }
    let t = 0;
    for (let k = read(); k > 0; k--) {
      t += read();
      const v = read();
      const knob = KNOBS[Math.floor(v / 21)];
      if (!knob) return null;
      take.moves.push({ t, knob, value: v % 21 });
    }
    if (i !== bytes.length || take.notes.some((x) => x.n > 2 || x.len > MAX_LEN)) return null;
    return take;
  } catch {
    return null;
  }
}

/** Where a knob is at `t` (hundredths), from the moves in the take. */
export function knobAt(take: Take, knob: Knob, t: number): number {
  let v = KNOB_HOME;
  for (const m of take.moves) {
    if (m.t > t) break;
    if (m.knob === knob) v = m.value;
  }
  return v;
}
