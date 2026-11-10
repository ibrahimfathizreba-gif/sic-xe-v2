import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export type Tab = 'mem' | 'sym' | 'obj' | 'log';

// What the app should show for one demo step. Every step names its program,
// so the presenter can jump to any step in any order.
export interface DemoAct {
  load: string; // example id, or 'hex' for the handout decode exercises
  steps: number; // how many instructions to have executed
  tab?: Tab;
  sel?: number; // instruction address to open in the decoder
  reference?: boolean;
}
export interface DemoStep { title: string; say: string; act: DemoAct }

export const DEMO_HEX = '4B101036 290000 010003 75101000 A004 B440';

export const DEMO: DemoStep[] = [
  {
    title: 'The assembler output',
    say: 'Pass 1 gave every line an address and filled the symbol table: LOOP = 0006, LIMIT = 0014, RESULT = 0017. Pass 2 produced the object code next to each line.',
    act: { load: 'sum1to5', steps: 0, tab: 'sym' },
  },
  {
    title: 'The object program',
    say: 'Pass 2 also wrote the H, T and E records. The program is 1A bytes long and starts executing at 000000. This text is what a loader reads.',
    act: { load: 'sum1to5', steps: 0, tab: 'obj' },
  },
  {
    title: 'Decode one instruction by hand',
    say: 'TIX LIMIT at 0008 is 2F2009. Opcode 2C with n = i = 1 gives 2F. PC = 0008 + 3 = 000B, so disp = 0014 − 000B = 009 and p = 1.',
    act: { load: 'sum1to5', steps: 0, sel: 0x0008 },
  },
  {
    title: 'First loop iteration',
    say: 'LDX #1, LDA #0, then ADDR X,A makes A = 1. TIX adds 1 to X (X = 2) and compares it with 6, so CC = LT and JLT jumps back to LOOP. The pulses on the board follow each instruction.',
    act: { load: 'sum1to5', steps: 5, tab: 'log' },
  },
  {
    title: 'Go back in time',
    say: 'Back (←) or the timeline rebuild the machine at any earlier step. Here we are again just before TIX ran.',
    act: { load: 'sum1to5', steps: 3, tab: 'log' },
  },
  {
    title: 'Run to the end',
    say: 'After five rounds X reaches 6, CC becomes EQ and JLT falls through. STA writes 15 into RESULT (0017) and J HALT, a jump to itself, stops the machine.',
    act: { load: 'sum1to5', steps: 19, tab: 'mem' },
  },
  {
    title: 'Base-relative and format 4',
    say: '+LDB and +LDT are 4-byte instructions. BUFFER is about 3000 bytes away, out of PC-relative range (−2048..2047), so STCH uses B: TA = B + disp. The board brings that far memory row into view.',
    act: { load: 'base_format4', steps: 5, sel: 0x000d, tab: 'mem' },
  },
  {
    title: 'Decode machine code',
    say: 'The decode exercises from the handout, loaded as raw hex: 4B101036 is +JSUB 01036, 290000 is COMP #0, A004 is COMPR A,S. Click any line to see its bits.',
    act: { load: 'hex', steps: 0, sel: 0x0000 },
  },
  {
    title: 'Reference sheet',
    say: 'Formats, n i x b p e, the addressing rules, the hand-encoding method and the opcode table are always one key away: press ?.',
    act: { load: 'sum1to5', steps: 0, reference: true },
  },
];

export function DemoBar({ at, go, close }: { at: number; go: (i: number) => void; close: () => void }) {
  const s = DEMO[at];
  return (
    <section className="demo" aria-live="polite">
      <div className="demo-top">
        <span className="label">Demo · {at + 1} of {DEMO.length}</span>
        <div className="dots">
          {DEMO.map((d, i) => <button key={i} className={i === at ? 'on' : ''} onClick={() => go(i)} aria-label={`Demo step ${i + 1}: ${d.title}`} />)}
        </div>
        <button className="link" onClick={close} aria-label="Close demo"><X size={18} /></button>
      </div>
      <h3>{s.title}</h3>
      <p>{s.say}</p>
      <div className="demo-nav">
        <button className="btn" onClick={() => go(at - 1)} disabled={at === 0}><ChevronLeft size={18} /><span>Previous</span></button>
        {at < DEMO.length - 1
          ? <button className="btn pri" onClick={() => go(at + 1)}><span>Next</span><ChevronRight size={18} /></button>
          : <button className="btn pri" onClick={close}><span>Finish</span></button>}
      </div>
    </section>
  );
}
