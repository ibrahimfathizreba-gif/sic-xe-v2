import test from 'node:test';
import assert from 'node:assert/strict';

import { Answer, check, correctAnswer, makeProblem, TOPICS } from './practice.ts';
import { Assembler } from './sicxe/assembler.ts';
import { Decoder } from './sicxe/decoder.ts';
import { Memory } from './sicxe/memory.ts';
import { Registers } from './sicxe/registers.ts';
import { hex } from './explain.ts';

const topics = TOPICS.map(([t]) => t);

test('every topic produces valid problems whose answer is what the assembler outputs', () => {
  for (const t of topics) {
    for (let seed = 1; seed <= 150; seed++) {
      const p = makeProblem(t, seed * 7919 + t.length);
      const res = Assembler.assemble(p.source);
      assert.equal(res.success, true, `${t}/${seed}: ${res.errors.map((e) => e.message).join('; ')}`);
      const line = res.listing.find((l) => l.loc === p.loc && l.objectCode && l.objectCode.length === p.len * 2);
      assert.equal(line?.objectCode, p.hex, `${t}/${seed} ${p.instr}`);
      assert.equal(p.enc.hex, p.hex, `${t}/${seed} worked solution matches`);
    }
  }
});

test('problems really test their topic', () => {
  for (let seed = 1; seed <= 100; seed++) {
    assert.equal(makeProblem('base', seed).nixbpe!.b, 1);
    assert.ok(makeProblem('neg', seed).value! >= 0x800, 'negative disp has its top bit set');
    assert.equal(makeProblem('idx', seed).nixbpe!.x, 1);
    assert.equal(makeProblem('ind', seed).nixbpe!.n, 1);
    assert.equal(makeProblem('ind', seed).nixbpe!.i, 0);
    assert.equal(makeProblem('f4', seed).format, 4);
    assert.equal(makeProblem('f2', seed).format, 2);
  }
});

test('the decoder reads every generated hex back as the same instruction', () => {
  for (const t of topics) {
    for (let seed = 1; seed <= 60; seed++) {
      const p = makeProblem(t, seed);
      const mem = new Memory();
      mem.loadBytes(0, p.hex.match(/../g)!.map((b) => parseInt(b, 16)));
      const d = Decoder.decode(0, mem, new Registers());
      assert.equal(d.mnemonic, p.instr.split(' ')[0].replace('+', ''), `${t}/${seed}`);
      assert.equal(d.format, p.format);
    }
  }
});

test('a fully correct answer is accepted, in both modes and both languages', () => {
  for (const t of topics) {
    for (let seed = 1; seed <= 60; seed++) {
      const p = makeProblem(t, seed);
      for (const lang of ['en', 'ar'] as const) {
        assert.equal(check(p, correctAnswer(p), 'encode', lang).right, true, `${t}/${seed} encode`);
        assert.equal(check(p, correctAnswer(p), 'decode', lang).right, true, `${t}/${seed} decode`);
      }
    }
  }
});

test('common mistakes are recognised by name', () => {
  // Using the address of this instruction instead of PC
  const pc = makeProblem('pc', 11);
  const wrongPc: Answer = { ...correctAnswer(pc), value: hex((pc.ta! - pc.loc) & 0xfff, 3) };
  assert.ok(check(pc, wrongPc, 'encode', 'en').mistakes.some((m) => m.code === 'pc-next'));

  // A negative disp typed with a minus sign, or as its absolute value
  const ng = makeProblem('neg', 5);
  const d = ng.ta! - (ng.loc + 3);
  assert.ok(check(ng, { ...correctAnswer(ng), value: String(d) }, 'encode', 'en').mistakes.some((m) => m.code === 'twos'));
  assert.ok(check(ng, { ...correctAnswer(ng), value: hex(-d, 3) }, 'encode', 'en').mistakes.some((m) => m.code === 'twos'));

  // Base-relative problem answered with PC-relative
  const bs = makeProblem('base', 3);
  const r = check(bs, { ...correctAnswer(bs), b: 0, p: 1, value: hex((bs.ta! - (bs.loc + 3)) & 0xfff, 3) }, 'encode', 'en');
  assert.ok(r.mistakes.some((m) => m.code === 'base' && m.key === 'bp'));
  assert.ok(r.mistakes.some((m) => m.code === 'base' && m.key === 'value'));

  // #number written in decimal
  let imm = makeProblem('imm', 1);
  for (let s = 1; !/^\S+ #\d+$/.test(imm.instr) || +imm.instr.split('#')[1] < 10; s++) imm = makeProblem('imm', s);
  const n = imm.instr.split('#')[1];
  assert.ok(check(imm, { ...correctAnswer(imm), value: n }, 'encode', 'en').mistakes.some((m) => m.code === 'dec-hex'));

  // Right fields, wrong final hex
  assert.ok(check(pc, { ...correctAnswer(pc), hex: '000000' }, 'encode', 'en').mistakes.some((m) => m.code === 'group'));

  // Decode: wrong mnemonic is explained from the first byte
  assert.ok(check(pc, { ...correctAnswer(pc), mnemonic: 'XYZ' }, 'decode', 'en').mistakes.some((m) => m.code === 'opcode'));
});

test('the same seed always gives the same problem (shareable)', () => {
  assert.deepEqual(makeProblem('base', 42).instr, makeProblem('base', 42).instr);
  assert.equal(makeProblem('f4', 9).hex, makeProblem('f4', 9).hex);
});
