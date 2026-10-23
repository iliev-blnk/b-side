import { parseNote } from "../music/theory.ts";
import type { Part } from "../music/types.ts";

export type Manifest = Record<string, { note: string; file: string }[]>;

interface Entry {
  file: string;
  /** Sounding pitch, or null for drum hits. */
  midi: number | null;
  variant: string;
}

export type PackIndex = Record<string, Entry[]>;

export interface Pack {
  index: PackIndex;
  buffers: Map<string, AudioBuffer>;
}

export function indexPack(manifest: Manifest): PackIndex {
  const index: PackIndex = {};
  for (const [inst, samples] of Object.entries(manifest)) {
    index[inst] = samples.map((s) => {
      let midi: number | null = null;
      try {
        midi = parseNote(s.note);
      } catch {
        midi = null;
      }
      return { file: s.file, midi, variant: s.note };
    });
  }
  return index;
}

/**
 * The sample to play for a note: the nearest recorded pitch, and the playback rate that bends it
 * there (distance is in semitones, positive when the sample is played faster). Drums look up by variant.
 */
export function nearestSample(index: PackIndex, part: Part, note: number | string): { file: string; rate: number; distance: number } {
  const entries = index[part];
  if (!entries?.length) throw new Error(`no samples for ${part}`);
  if (typeof note === "string") {
    const e = entries.find((x) => x.variant === note) ?? entries[0]!;
    return { file: e.file, rate: 1, distance: 0 };
  }
  let best = entries[0]!;
  for (const e of entries) {
    if (e.midi === null) continue;
    if (best.midi === null || Math.abs(e.midi - note) < Math.abs(best.midi - note)) best = e;
  }
  const distance = best.midi === null ? 0 : note - best.midi;
  return { file: best.file, rate: 2 ** (distance / 12), distance };
}

export async function loadPack(ctx: BaseAudioContext, base: string): Promise<Pack> {
  const manifest: Manifest = await (await fetch(`${base}manifest.json`)).json();
  const index = indexPack(manifest);
  const files = Object.values(index).flatMap((es) => es.map((e) => e.file));
  const buffers = new Map<string, AudioBuffer>();
  await Promise.all(
    files.map(async (f) => {
      const data = await (await fetch(`${base}${f}`)).arrayBuffer();
      buffers.set(f, await ctx.decodeAudioData(data));
    }),
  );
  return { index, buffers };
}
