import test from 'node:test';
import assert from 'node:assert/strict';

import { fromAssembly, fromHex, fromObject } from './program.ts';
import { CPU } from './sicxe/cpu.ts';
import { Memory } from './sicxe/memory.ts';
import { Registers, toSigned24 } from './sicxe/registers.ts';
import { EXAMPLES } from './sicxe/examples.ts';

test('raw hex: the handout decode exercises disassemble to the right instructions', () => {
  const built = fromHex('4B101036 290000 010003 75101000 A004 B440', '0');
  assert.equal(built.errors.length, 0);
  const text = built.program!.lines.map((l) => [l.code, l.text]);
  assert.deepEqual(text, [
    ['4B101036', '+JSUB 0x01036'],
    ['290000', 'COMP #0'],
    ['010003', 'LDA #3'],
    ['75101000', '+LDT #4096'],
    ['A004', 'COMPR A, S'],
    ['B440', 'CLEAR S'],
  ]);
});

test('raw hex: loads at the given address and runs', () => {
  // LDA #5 ; ADD #3 ; J * (jump to self)
  const p = fromHex('010005 190003 3F2FFD', '1000').program!;
  const mem = new Memory(), regs = new Registers();
  p.load(mem, regs);
  assert.equal(regs.get('PC'), 0x1000);
  const cpu = new CPU(mem, regs);
  cpu.setProgramBounds(p.start, p.length);
  cpu.run(100);
  assert.equal(cpu.haltReason, 'Jump to self (normal termination)');
  assert.equal(toSigned24(regs.get('A')), 8);
});

test('raw hex: rejects bad input with a clear message', () => {
  assert.match(fromHex('4B1G', '0').errors[0].message, /Only hex digits/);
  assert.match(fromHex('4B1', '0').errors[0].message, /two hex digits/);
  assert.match(fromHex('', '0').errors[0].message, /paste some machine code/);
  assert.match(fromHex('00', 'XYZ').errors[0].message, /start address/);
});

test('object program: the assembler output loads back and gives the same result', () => {
  for (const ex of EXAMPLES) {
    const asm = fromAssembly(ex.source).program!;
    const obj = fromObject(asm.objectText!);
    assert.equal(obj.errors.length, 0, ex.id);
    const run = (p: typeof asm) => {
      const mem = new Memory(), regs = new Registers();
      p.load(mem, regs);
      const cpu = new CPU(mem, regs);
      cpu.setProgramBounds(p.start, p.length);
      cpu.run(1000);
      return { a: regs.get('A'), steps: cpu.stepCount, reason: cpu.haltReason };
    };
    assert.deepEqual(run(obj.program!), run(asm), ex.id);
  }
});

test('object program: column format without ^ also loads', () => {
  const p = fromObject('HPROG  000000000006\nT00000006010005190003\nE000000').program!;
  assert.equal(p.name, 'PROG');
  assert.equal(p.lines[0].text, 'LDA #5');
});

test('object program: reports missing records', () => {
  const errs = fromObject('T^000000^03^010005').errors.map((e) => e.message).join(' ');
  assert.match(errs, /Missing the H/);
  assert.match(errs, /Missing the E/);
  assert.match(fromObject('H^P^000000^000003\nX^1\nE^000000').errors[0].message, /Unknown record "X"/);
});
