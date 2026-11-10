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
