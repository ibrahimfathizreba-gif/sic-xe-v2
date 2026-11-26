// The story's timetable: which chapter covers which stretch of scrolling, and when each thing happens inside it.
// The page (text) and the 3D scene both read this file, so they can never drift apart.
import { clamp01, io, seg } from '../three/ease.ts';

export const CH = { HERO: 0, MACHINE: 1, BYTES: 2, PASS1: 3, PASS2: 4, ADDR: 5, FORMATS: 6, OBJECT: 7, LOADER: 8, RUN: 9, OUTRO: 10 } as const;
export const COUNT = 11;
// Length of each chapter, in screens of scrolling
export const LEN = [1.0, 2.8, 1.6, 3.8, 4.6, 3.4, 1.6, 2.4, 2.2, 4.4, 1.2];
export const START = LEN.map((_, i) => LEN.slice(0, i).reduce((a, b) => a + b, 0));
export const TOTAL = LEN.reduce((a, b) => a + b, 0);

// u = scroll position in screens. Returns the chapter and the progress inside it (0..1).
export function locate(u: number): { ch: number; t: number } {
  const x = Math.max(0, Math.min(TOTAL, u));
  let ch = COUNT - 1;
  for (let i = 0; i < COUNT; i++) if (x < START[i] + LEN[i]) { ch = i; break; }
  return { ch, t: clamp01((x - START[ch]) / LEN[ch]) };
}

// The page turns dark at the moment text becomes bits (Pass 2) and stays dark into the lab.
export const darkAt = (u: number) => io(seg(u, START[CH.PASS2] - 0.05, START[CH.PASS2] + 0.4));
const LIGHT = [233, 238, 243], DARK = [8, 14, 25];
export const bgAt = (dark: number) => LIGHT.map((c, i) => Math.round(c + (DARK[i] - c) * dark));

// ---- Pass 1: one slot of scrolling per source line ----
export const P1 = { a: 0.14, b: 0.93 };
export const p1Slot = (n: number) => (P1.b - P1.a) / n;
export const p1Start = (k: number, n: number) => P1.a + k * p1Slot(n);
export const p1Line = (t: number, n: number) => (t < P1.a ? -1 : Math.min(n - 1, Math.floor((t - P1.a) / p1Slot(n))));

// ---- Pass 2 on the first instruction: when each bit is decided ----
export const P2 = { bar: [0.02, 0.1], e: 0.13, op: 0.2, opStep: 0.012, fall: [0.31, 0.36], respawn: [0.36, 0.385], n: 0.41, i: 0.44, x: 0.53, b: 0.6, p: 0.615, disp: 0.63, dispStep: 0.007, gap: [0.75, 0.81], hex: 0.78, hexStep: 0.012, land: [0.88, 0.92], pick: 0.93 };
// Phase of the worksheet: 0 intro, 1 e, 2 opcode, 3 n i, 4 x, 5 disp, 6 group, 7 done, 8 try another line
export const p2Phase = (t: number) => (t < 0.1 ? 0 : t < 0.18 ? 1 : t < 0.38 ? 2 : t < 0.5 ? 3 : t < 0.58 ? 4 : t < 0.74 ? 5 : t < 0.87 ? 6 : t < P2.pick ? 7 : 8);
// When slot i of a 24-bit instruction shows its value
export function p2BitAt(i: number): number {
  if (i < 8) return P2.op + i * P2.opStep;
  if (i === 8) return P2.x;
  if (i === 9) return P2.b;
  if (i === 10) return P2.p;
  if (i === 11) return P2.e;
  return P2.disp + (i - 12) * P2.dispStep;
}

// ---- Addressing: three examples ----
export const addrBeat = (t: number) => (t < 0.36 ? 0 : t < 0.66 ? 1 : 2);

// ---- Run: one stretch of scrolling per executed instruction ----
export const RUNSPAN = [0.05, 0.97];
export function runStep(t: number, n: number): { s: number; f: number } {
  const x = seg(t, RUNSPAN[0], RUNSPAN[1]) * n;
  const s = Math.min(n - 1, Math.floor(x));
  return { s, f: Math.min(1, x - s) };
}
export const RUN_DONE = 0.86; // from here on a step shows its result

// ---- Places where the presenter's "next" key stops ----
export function stops(nLines: number, nFrames: number): number[] {
  const at = (ch: number, t: number) => START[ch] + t * LEN[ch];
  const out: number[] = [0];
  out.push(at(CH.MACHINE, 0.55), at(CH.MACHINE, 0.99));
  out.push(at(CH.BYTES, 0.72));
  for (let k = 0; k < nLines; k++) out.push(at(CH.PASS1, p1Start(k, nLines) + p1Slot(nLines) * 0.97));
  for (const t of [0.095, 0.17, 0.3, 0.375, 0.49, 0.57, 0.73, 0.86, 0.925, 0.985]) out.push(at(CH.PASS2, t));
  for (const t of [0.3, 0.62, 0.97]) out.push(at(CH.ADDR, t));
  out.push(at(CH.FORMATS, 0.7));
  out.push(at(CH.OBJECT, 0.4), at(CH.OBJECT, 0.9));
  out.push(at(CH.LOADER, 0.97));
  const run = (s: number) => at(CH.RUN, RUNSPAN[0] + ((s + 0.97) / nFrames) * (RUNSPAN[1] - RUNSPAN[0]));
  for (const s of [0, 1, 2, 3, 4]) if (s < nFrames) out.push(run(s));
  for (let s = 7; s < nFrames - 2; s += 3) out.push(run(s));
  if (nFrames > 6) out.push(run(nFrames - 2));
  out.push(run(nFrames - 1));
  out.push(TOTAL);
  return out.sort((a, b) => a - b);
}
