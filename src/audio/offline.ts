import { loadPack } from "./samples.ts";
import { generateEp } from "../band/ep.ts";
import { cutSeconds, GAP, LEAD } from "../band/side.ts";
import type { Mood, Part } from "../band/types.ts";
import { partsOf, performTrack } from "./perform.ts";

const SR = 44100;

export interface Rendered {
  wav: string;
  peakDb: number;
  rmsDb: number;
  seconds: number;
}

function encodeWav(buf: AudioBuffer): Uint8Array {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + n * ch * 2, true);
  str(8, "WAVEfmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c]![i]!));
      out.setInt16(44 + (i * ch + c) * 2, v * 32767, true);
    }
  }
  return new Uint8Array(out.buffer);
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function measure(buf: AudioBuffer) {
  let peak = 0;
  let sum = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    for (const v of buf.getChannelData(c)) {
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
  }
  const rms = Math.sqrt(sum / (buf.length * buf.numberOfChannels));
  return { peakDb: 20 * Math.log10(peak || 1e-9), rmsDb: 20 * Math.log10(rms || 1e-9) };
}

/**
 * Renders one track of a night's side through the same chain as live playback, including the
 * crackle up to the next track (or the run-out groove after the last). For scripts/render.mjs.
 */
export async function renderTrack(seed: string, mood: Mood, n: number, base: string, only?: Part[]): Promise<Rendered & { title: string; style: string }> {
  const track = generateEp(seed, mood).tracks[n]!;
  const seconds = cutSeconds(track);
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const pack = await loadPack(ctx, base, partsOf(track));
  performTrack(ctx, pack, track, LEAD, ctx.destination, { tail: n < 2 ? GAP : 0, only });
  const buf = await ctx.startRendering();
  return { wav: base64(encodeWav(buf)), ...measure(buf), seconds, title: track.title, style: track.style };
}
