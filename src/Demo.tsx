import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export type Tab = 'mem' | 'sym' | 'obj' | 'log';

// What the app should show for one demo step. Every step names its program,
// so the presenter can jump to any step in any order.
export interface DemoAct {
  load: string; // example id, or 'hex' for the handout decode exercises
  asm?: { phase: 'start' | 'p1' | 'p1done' | 'p2' | 'done'; text?: string }; // show this assembler step
  steps?: number; // otherwise: Run mode, with this many instructions executed
  tab?: Tab;
  sel?: number; // instruction address to open in the decoder
  reference?: boolean;
}
export interface DemoStep { title: string; say: string; act: DemoAct }

export const DEMO_HEX = '4B101036 290000 010003 75101000 A004 B440';

export const DEMO: DemoStep[] = [
  {
    title: 'Pass 1: addresses and labels',
    say: 'Pass 1 walks through the source and gives every line an address with LOCCTR (+3 for format 3, +2 for format 2 …). Each label goes into SYMTAB. Here TIX uses LIMIT before LIMIT is defined: a forward reference, the reason an assembler needs two passes.',
    act: { load: 'sum1to5', asm: { phase: 'p1', text: 'TIX' } },
  },
  {
    title: 'Pass 2: from assembly to 0s and 1s',
    say: 'Pass 2 builds each instruction from its fields: 6 bits of opcode, the n i x b p e flags and a 12-bit displacement. TIX LIMIT becomes 001011 1 1 0 0 1 0 000000001001, and in hex 2F2009.',
    act: { load: 'sum1to5', asm: { phase: 'p2', text: 'TIX' } },
  },
  {
    title: 'A negative displacement',
    say: 'JLT LOOP jumps backwards: disp = 0006 − 000E = −8. A negative disp is stored in 12-bit two\'s complement, FF8, giving 3B2FF8.',
    act: { load: 'sum1to5', asm: { phase: 'p2', text: 'JLT' } },
  },
  {
    title: 'The object program',
    say: 'While Pass 2 works it writes the object program: an H record, T records with the code, and an E record with the first instruction. This text is what the loader reads.',
    act: { load: 'sum1to5', asm: { phase: 'done' } },
  },
  {
    title: 'Base-relative addressing',
    say: 'BUFFER is about 3000 bytes away. PC-relative would need a displacement outside −2048..2047, so the assembler uses the BASE directive: disp = TA − B, with b = 1.',
    act: { load: 'base_format4', asm: { phase: 'p2', text: 'STCH' } },
  },
  {
    title: 'Run it: first loop iteration',
    say: 'The loader puts the bytes in memory and the CPU runs them. ADDR X,A makes A = 1, TIX makes X = 2 and compares it with 6, so CC = LT and JLT jumps back to LOOP.',
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
    title: 'Decode machine code',
    say: 'The other direction: the decode exercises from the handout, loaded as raw hex. 4B101036 is +JSUB 01036, 290000 is COMP #0, A004 is COMPR A,S. Click any line to see its bits.',
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
