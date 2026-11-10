// A program ready to run, whatever it came from: assembly source, raw hex, or a Beck object program.
// The app only talks to this shape, so Step, Back, the timeline and the 3D board work the same for all three.
import { Assembler } from './sicxe/assembler.ts';
import { Decoder } from './sicxe/decoder.ts';
import { Loader } from './sicxe/loader.ts';
import { Memory } from './sicxe/memory.ts';
import { Registers } from './sicxe/registers.ts';
import { SymbolEntry } from './sicxe/types.ts';
import { hex } from './explain.ts';

export type Source = 'asm' | 'hex' | 'obj';

export interface Line {
  key: string;
  loc: number;
  text: string; // source text, or disassembly when there is no source
  code: string; // object code in hex ('' for comments and directives)
  inspect: boolean; // can be clicked to open in the decoder
}

export interface Program {
  source: Source;
  name: string;
  start: number;
  length: number;
  load(mem: Memory, regs: Registers): void; // clears memory, loads bytes, sets PC
  lines: Line[];
  symbols: SymbolEntry[];
  objectText: string | null;
}

export interface LoadError { line?: number; message: string }
export type Built = { program: Program; errors: [] } | { program: null; errors: LoadError[] };

export function fromAssembly(src: string): Built {
  const res = Assembler.assemble(src);
  if (!res.success || !res.objectProgram) {
    return { program: null, errors: res.errors.map((e) => ({ line: e.line, message: e.message })) };
  }
  const obj = res.objectProgram;
  return {
    errors: [],
    program: {
      source: 'asm',
      name: obj.header.progName,
      start: res.startAddress,
      length: res.programLength,
      load(mem, regs) { mem.clear(); regs.reset(res.startAddress); Loader.load(obj, mem, regs); },
      lines: res.listing.map((l) => ({
        key: 'l' + l.lineNo, loc: l.loc, text: l.sourceText, code: l.objectCode,
        inspect: !!l.format && !/^(BYTE|WORD)$/i.test(l.mnemonic ?? ''), // only real instructions can be decoded
      })),
      symbols: res.symbolList,
      objectText: obj.fullText,
    },
  };
}

// Raw machine code, e.g. "4B101036 290000 010003", loaded at a given address.
export function fromHex(text: string, startText: string): Built {
  const clean = text.replace(/\s+/g, '');
  const start = parseInt(startText.trim() || '0', 16);
  const errors: LoadError[] = [];
  if (!/^[0-9A-Fa-f]*$/.test(clean)) errors.push({ message: 'Only hex digits 0-9 and A-F are allowed (spaces are fine).' });
  else if (!clean.length) errors.push({ message: 'Type or paste some machine code first.' });
  else if (clean.length % 2) errors.push({ message: `Each byte needs two hex digits; you typed ${clean.length} digits.` });
  if (!/^[0-9A-Fa-f]{1,5}$/.test(startText.trim() || '0') || isNaN(start)) errors.push({ message: 'The start address must be hex, at most 5 digits (e.g. 1000).' });
  if (errors.length) return { program: null, errors };

  const bytes = clean.match(/../g)!.map((b) => parseInt(b, 16));
  const load = (mem: Memory, regs: Registers) => { mem.clear(); Loader.loadHex(start, clean, mem, regs); };
  return {
    errors: [],
    program: {
      source: 'hex', name: 'HEX', start, length: bytes.length, load,
      lines: disassemble(load, [[start, bytes.length]]),
      symbols: [], objectText: null,
    },
  };
}

// A Beck object program (H/T/M/E records), with or without ^ separators.
export function fromObject(text: string): Built {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errors: LoadError[] = [];
  const parts = (l: string) => (l.includes('^') ? l.split('^').map((p) => p.trim()) : null);
  const ranges: [number, number][] = [];
  let header = false, end = false;

  rows.forEach((l, i) => {
    const type = l[0].toUpperCase(), line = i + 1;
    if (type === 'H') header = true;
    else if (type === 'E') end = true;
    else if (type === 'T') {
      const p = parts(l);
      const addr = p ? p[1] : l.slice(1, 7), code = p ? p[3] ?? '' : l.slice(9);
      if (!/^[0-9A-Fa-f]{1,6}$/.test(addr ?? '')) errors.push({ line, message: 'T record: the start address must be hex.' });
      else if (!/^([0-9A-Fa-f]{2})+$/.test(code)) errors.push({ line, message: 'T record: the object code must be pairs of hex digits.' });
      else ranges.push([parseInt(addr, 16), code.length / 2]);
    } else if (type === 'M') { /* relocation is not needed when loading at the assembled address */ }
    else errors.push({ line, message: `Unknown record "${type}". Expected H, T, M or E.` });
  });
  if (!header) errors.push({ message: 'Missing the H (header) record.' });
  if (!end) errors.push({ message: 'Missing the E (end) record.' });
  if (!ranges.length && !errors.length) errors.push({ message: 'No T (text) records, so there is nothing to load.' });
  if (errors.length) return { program: null, errors };

  const load = (mem: Memory, regs: Registers) => { mem.clear(); Loader.parseAndLoadText(text, mem, regs); };
  const info = Loader.parseAndLoadText(text, new Memory(), new Registers());
  const lastByte = Math.max(...ranges.map(([a, n]) => a + n));
  return {
    errors: [],
    program: {
      source: 'obj', name: info.progName, start: info.startAddr,
      length: Math.max(info.length, lastByte - info.startAddr),
      load, lines: disassemble(load, ranges.sort((a, b) => a[0] - b[0])), symbols: [], objectText: text.trim(),
    },
  };
}

// Linear disassembly of the loaded bytes. Bytes that are not a valid instruction become BYTE X'..'.
function disassemble(load: (m: Memory, r: Registers) => void, ranges: [number, number][]): Line[] {
  const mem = new Memory(), regs = new Registers();
  load(mem, regs);
  const lines: Line[] = [];
  for (const [startAddr, count] of ranges) {
    let a = startAddr;
    while (a < startAddr + count) {
      try {
        const d = Decoder.decode(a, mem, regs);
        if (a + d.length > startAddr + count) throw new Error('runs past the loaded bytes');
        // With no running program B is 0, so show base-relative operands as B+disp instead of a wrong address
        const text = d.b === 1 && d.dispOrAddr !== undefined
          ? d.disassembly.replace(/0x[0-9A-F]+/, `B+0x${hex(d.dispOrAddr, 3)}`)
          : d.disassembly;
        lines.push({ key: 'a' + a, loc: a, text, code: d.rawBytesHex, inspect: true });
        a += d.length;
      } catch {
        const b = hex(mem.getByte(a), 2);
        lines.push({ key: 'a' + a, loc: a, text: `BYTE X'${b}'`, code: b, inspect: false });
        a += 1;
      }
    }
  }
  return lines;
}
