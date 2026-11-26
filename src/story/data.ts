// Everything the story shows comes from the project's own assembler and CPU, run on the first example
// ("Sum 1 to 5"). Nothing is typed in by hand, so the story can never disagree with the lab.
import { EXAMPLES } from '../sicxe/examples.ts';
import { Field, HowStep, buildTrace } from '../asmTrace.ts';
import { Memory } from '../sicxe/memory.ts';
import { Registers } from '../sicxe/registers.ts';
import { CPU } from '../sicxe/cpu.ts';
import { Loader } from '../sicxe/loader.ts';
import { ConditionCode, RegisterId, StepResult } from '../sicxe/types.ts';
import { Lang } from '../i18n.ts';

export interface SLine {
  idx: number;          // index in the assembler listing
  label?: string; mnemonic: string; operand: string;
  text: string;         // "LDX #1"
  loc: number; locAfter: number; size: number;
  code: string;         // object code in hex, '' when the line makes none
  fields: Field[]; how: HowStep[]; // Pass 2: the bits and the worksheet steps
  rule: string; say: string; newSymbol?: string; forward?: string; // Pass 1
}
export interface Frame { step: StepResult; regs: Record<RegisterId, number>; cc: ConditionCode; mem: number[] }
export interface Far { text: string; fields: Field[]; how: HowStep[]; hex: string; pc: number; ta: number; base: number }

export interface Story {
  source: string;
  lines: SLine[];                 // every real line (START … END)
  symbols: { name: string; address: number; line: number }[]; // line = index into lines
  start: number; length: number;
  records: { h: string; t: string[]; e: string };
  loaded: number[];               // the first 128 bytes of memory right after loading
  initial: Record<RegisterId, number>;
  frames: Frame[];                // one per executed instruction
  far: Far | null;                // a base-relative instruction from Beck's COPY program
  p1done: string;                 // the sentence that closes Pass 1
}

export const STORY_EXAMPLE = EXAMPLES[0];

export function buildStory(lang: Lang): Story {
  const source = STORY_EXAMPLE.source;
  const { result, steps } = buildTrace(source, lang);
  const obj = result.objectProgram!;
  const lines: SLine[] = [];
  result.listing.forEach((l, idx) => {
    if (!l.mnemonic) return;
    const p1 = steps.find((s) => s.phase === 'p1' && s.line === idx)!, p2 = steps.find((s) => s.phase === 'p2' && s.line === idx)!;
    lines.push({
      idx, label: l.label, mnemonic: l.mnemonic.toUpperCase(), operand: l.operand ?? '',
      text: `${l.mnemonic.toUpperCase()} ${l.operand ?? ''}`.trim(),
      loc: p1.locBefore!, locAfter: p1.locAfter!, size: p1.locAfter! - p1.locBefore!,
      code: l.objectCode, fields: p2.enc?.fields ?? [], how: p2.enc?.how ?? [],
      rule: p1.rule ?? '', say: p1.say, newSymbol: p1.newSymbol, forward: p1.forward,
    });
  });
  const symbols = result.symbolList.map((s) => ({ name: s.name, address: s.address, line: lines.findIndex((l) => l.newSymbol === s.name) }));

  const mem = new Memory(), regs = new Registers();
  mem.clear(); regs.reset(result.startAddress); Loader.load(obj, mem, regs);
  const snap = () => Array.from({ length: 128 }, (_, a) => mem.getByte(a));
  const loaded = snap(), initial = regs.cloneValues();
  const cpu = new CPU(mem, regs); cpu.setProgramBounds(result.startAddress, result.programLength);
  const frames: Frame[] = [];
  while (!cpu.halted && frames.length < 200) {
    try { const step = cpu.step(); frames.push({ step, regs: regs.cloneValues(), cc: regs.getConditionCode(), mem: snap() }); } catch { break; }
  }

  let far: Far | null = null;
  const copy = EXAMPLES.find((e) => e.id === 'copy');
  if (copy) {
    const tr = buildTrace(copy.source, lang);
    const st = tr.steps.find((s) => s.phase === 'p2' && s.line !== undefined && /STCH\s+BUFFER,X/.test(tr.result.listing[s.line].sourceText) && s.enc);
    if (st?.enc) {
      const sym = tr.result.symbolTable;
      far = { text: 'STCH BUFFER,X', fields: st.enc.fields, how: st.enc.how, hex: st.enc.hex, pc: tr.result.listing[st.line!].loc + 3, ta: sym.get('BUFFER') ?? 0, base: sym.get('LENGTH') ?? 0 };
    }
  }

  return {
    source, lines, symbols, start: result.startAddress, length: result.programLength,
    records: { h: obj.header.recordText, t: obj.textRecords.map((t) => t.recordText), e: obj.endRecord.recordText },
    loaded, initial, frames, far, p1done: steps.find((x) => x.phase === 'p1done')?.say ?? '',
  };
}

// The bits of a line, one entry per bit, each with the colour of its field
export function bitsOf(fields: Field[]): { v: string; tone: string }[] {
  return fields.flatMap((f) => Array.from(f.bits, (v) => ({ v, tone: f.tone })));
}
