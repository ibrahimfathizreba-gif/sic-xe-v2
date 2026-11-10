import test from 'node:test';
import assert from 'node:assert/strict';

import { Assembler } from './assembler.ts';
import { CPU } from './cpu.ts';
import { Memory } from './memory.ts';
import { Registers, toSigned24 } from './registers.ts';
import { Loader } from './loader.ts';
import { EXAMPLES } from './examples.ts';
import { memRows, rowIndex } from '../memRows.ts';

// Assemble, load and return a ready CPU plus the symbol table.
function boot(source: string) {
  const res = Assembler.assemble(source);
  assert.equal(res.success, true, res.errors.map((e) => `line ${e.line}: ${e.message}`).join('; '));
  const memory = new Memory();
  const registers = new Registers();
  registers.reset(res.startAddress);
  Loader.load(res.objectProgram!, memory, registers);
  const cpu = new CPU(memory, registers);
  cpu.setProgramBounds(res.startAddress, res.programLength);
  const sym = (name: string) => res.symbolList.find((s) => s.name === name)!.address;
  return { cpu, memory, registers, sym };
}

const run = (id: string) => {
  const m = boot(EXAMPLES.find((e) => e.id === id)!.source);
  m.cpu.run(1000);
  return m;
};

test('sum1to5: A = 15 and RESULT = 15', () => {
  const { cpu, registers, memory, sym } = run('sum1to5');
  assert.equal(cpu.haltReason, 'Jump to self (normal termination)');
  assert.equal(cpu.stepCount, 19);
  assert.equal(toSigned24(registers.get('A')), 15);
  assert.equal(memory.getWord(sym('RESULT')), 15);
});

test('subroutine: 6 doubled twice = 24, stored in RES', () => {
  const { cpu, registers, memory, sym } = run('subroutine');
  assert.equal(cpu.haltReason, 'Jump to self (normal termination)');
  assert.equal(cpu.stepCount, 9);
  assert.equal(toSigned24(registers.get('A')), 24);
  assert.equal(memory.getWord(sym('RES')), 24);
});

test('base_format4: STCH writes "A" (0x41) to the far BUFFER via base-relative addressing', () => {
  const { cpu, registers, memory, sym } = run('base_format4');
  assert.equal(cpu.haltReason, 'Jump to self (normal termination)');
  assert.equal(cpu.stepCount, 7);
  assert.equal(registers.get('B'), sym('DATA'));
  assert.equal(registers.get('T'), 4096);
  assert.equal(memory.getByte(sym('BUFFER')), 0x41);
});

test('string_copy: DEST contains HELLO', () => {
  const { cpu, memory, sym } = run('string_copy');
  assert.equal(cpu.haltReason, 'Jump to self (normal termination)');
  assert.equal(cpu.stepCount, 23);
  const dest = Array.from(memory.getBytes(sym('DEST'), 5), (b) => String.fromCharCode(b)).join('');
  assert.equal(dest, 'HELLO');
});

test('fibonacci: FIB_N = 8', () => {
  const { cpu, registers, memory, sym } = run('fibonacci');
  assert.equal(cpu.haltReason, 'Jump to self (normal termination)');
  assert.equal(cpu.stepCount, 26);
  assert.equal(toSigned24(registers.get('A')), 8);
  assert.equal(memory.getWord(sym('FIB_N')), 8);
});

test('a faulting instruction halts the CPU and leaves PC on that instruction', () => {
  const { cpu, registers } = boot('P START 0\n LDA #5\n LDS #0\n DIVR S,A\nH J H\n END P');
  cpu.step();
  cpu.step();
  const pcOfDivr = registers.get('PC');
  assert.throws(() => cpu.step(), /Division by zero/);
  assert.equal(cpu.halted, true);
  assert.match(cpu.haltReason!, /Division by zero/);
  assert.equal(registers.get('PC'), pcOfDivr);
  assert.equal(toSigned24(registers.get('A')), 5, 'A must be unchanged');
});

test('an illegal immediate store halts without moving PC', () => {
  const { cpu, registers } = boot('P START 0\n STA #5\nH J H\n END P');
  assert.throws(() => cpu.step(), /Immediate addressing is illegal/);
  assert.equal(cpu.halted, true);
  assert.equal(registers.get('PC'), 0);
});

test('memRows keeps a far address on screen', () => {
  // Program rows 0x0000.. plus a write far away at 0x0BD2
  const rows = memRows(0, 200, 8, [0x0009, 0x000c, 0x0bd2]);
  assert.equal(rows.length, 8);
  assert.ok(rows.includes(0x0000));
  assert.ok(rows.includes(0x0bd0));
  assert.equal(rowIndex(rows, 0x0bd2), rows.indexOf(0x0bd0) * 16 + 2);
  assert.equal(rowIndex(rows, 0x0500), null);
});

test('COPY (Beck Fig. 2.5) assembles to exactly the object program printed in Beck Fig. 2.8', () => {
  const src = EXAMPLES.find((e) => e.id === 'copy')!.source;
  const res = Assembler.assemble(src);
  assert.equal(res.success, true);
  assert.equal(res.objectProgram!.fullText, [
    'H^COPY  ^000000^001077',
    'T^000000^1D^17202D69202D4B1010360320262900003320074B10105D3F2FEC032010',
    'T^00001D^13^0F20160100030F200D4B10105D3E2003454F46',
    'T^001036^1D^B410B400B44075101000E32019332FFADB2013A00433200857C003B850',
    'T^001053^1D^3B2FEA1340004F0000F1B410774000E32011332FFA53C003DF2008B850',
    'T^001070^07^3B2FEF4F000005',
    'M^000007^05',
    'M^000014^05',
    'M^000027^05',
    'E^000000',
  ].join('\n'));
  // The handout's chapter 4 worked examples
  const code = (text: string) => res.listing.find((l) => l.sourceText.replace(/\s+/g, ' ').trim().endsWith(text))!.objectCode;
  assert.equal(code('LDB #LENGTH'), '69202D');
  assert.equal(code('STCH BUFFER,X'), '57C003');
  assert.equal(code('J @RETADR'), '3E2003');
  assert.equal(code('LDA #3'), '010003');
});

test('COPY runs until the first device instruction and stops with a clear reason', () => {
  const { cpu, registers } = boot(EXAMPLES.find((e) => e.id === 'copy')!.source);
  assert.throws(() => cpu.run(1000), /TD is not supported/);
  assert.equal(cpu.halted, true);
  assert.equal(registers.get('PC'), 0x1040, 'stopped on RLOOP TD INPUT');
  assert.equal(registers.get('T'), 4096);
});
