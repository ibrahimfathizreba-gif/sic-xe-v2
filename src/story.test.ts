// The story (Learn) shows the assembler's and the CPU's own results. These tests keep it that way:
// every number it displays must match what the engine produces, in both languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bitsOf, buildStory } from './story/data.ts';
import { CH, COUNT, LEN, START, TOTAL, locate, p1Line, p1Start, p2BitAt, p2Phase, runStep, stops } from './story/plan.ts';

for (const lang of ['en', 'ar'] as const) {
  test(`story data comes from the engine (${lang})`, () => {
    const s = buildStory(lang);
    assert.equal(s.lines.length, 11);
    assert.equal(s.length, 0x1a);
    assert.deepEqual(s.symbols.map((x) => `${x.name}=${x.address.toString(16)}`), ['PROG=0', 'LOOP=6', 'HALT=11', 'LIMIT=14', 'RESULT=17']);
    // sizes add up to the program length, and each line starts where the one before ended
    assert.equal(s.lines.reduce((n, l) => n + l.size, 0), s.length);
    s.lines.forEach((l, i) => { if (i) assert.equal(l.loc, s.lines[i - 1].locAfter); });
    // the bits shown for a line, grouped in fours, are exactly its object code
    for (const l of s.lines.filter((x) => x.code)) {
      const bits = bitsOf(l.fields).map((b) => b.v).join('');
      const hex = (bits.match(/.{4}/g) ?? []).map((n) => parseInt(n, 2).toString(16).toUpperCase()).join('');
      assert.equal(hex, l.code, l.text);
      assert.ok(l.how.length > 0 && l.rule.length > 0, l.text);
    }
    assert.equal(s.lines[1].code, '050001');
    assert.equal(s.records.h, 'H^PROG  ^000000^00001A');
    assert.equal(s.records.e, 'E^000000');
    assert.ok(s.p1done.length > 0);
  });

  test(`story run reaches A = 15 (${lang})`, () => {
    const s = buildStory(lang);
    assert.equal(s.frames.length, 19);
    const last = s.frames[s.frames.length - 1];
    assert.equal(last.regs.A, 15);
    assert.equal(last.step.halted, true);
    assert.deepEqual(last.mem.slice(0x17, 0x1a), [0, 0, 15]);
    assert.deepEqual(s.loaded.slice(0, 3), [0x05, 0x00, 0x01]);
  });
}

test('story base-relative example is Beck\'s STCH BUFFER,X = 57C003', () => {
  const far = buildStory('en').far!;
  assert.equal(far.hex, '57C003');
  assert.ok(far.ta - far.pc < -2048, 'too far for PC-relative');
  assert.ok(far.ta - far.base >= 0 && far.ta - far.base <= 4095, 'within reach of B');
});

test('story timetable is consistent', () => {
  assert.equal(LEN.length, COUNT);
  assert.equal(START[0], 0);
  assert.ok(Math.abs(START[COUNT - 1] + LEN[COUNT - 1] - TOTAL) < 1e-9);
  for (let i = 0; i < COUNT; i++) {
    const mid = locate(START[i] + LEN[i] / 2);
    assert.equal(mid.ch, i);
    assert.ok(Math.abs(mid.t - 0.5) < 1e-9);
  }
  const end = locate(TOTAL);
  assert.equal(end.ch, COUNT - 1);
  assert.ok(end.t > 0.999999);
  // Pass 1 visits every line once, in order
  const seen = new Set<number>();
  for (let t = 0; t <= 1; t += 0.001) seen.add(p1Line(t, 11));
  assert.deepEqual([...seen].sort((a, b) => a - b), [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(p1Start(10, 11) < 1);
  // Pass 2 decides every bit before the result is shown
  for (let i = 0; i < 24; i++) assert.ok(p2BitAt(i) > 0.1 && p2BitAt(i) < 0.74, `bit ${i}`);
  assert.equal(p2Phase(0), 0); assert.equal(p2Phase(0.99), 8);
  // Run walks through all instructions
  assert.deepEqual(runStep(0, 19), { s: 0, f: 0 });
  assert.equal(runStep(1, 19).s, 18); assert.equal(runStep(1, 19).f, 1);
  // presenter stops: sorted, inside the story, and one in every chapter
  const st = stops(11, 19);
  assert.deepEqual([...st].sort((a, b) => a - b), st);
  assert.ok(st[0] === 0 && st[st.length - 1] === TOTAL);
  for (let i = 0; i < COUNT; i++) assert.ok(st.some((u) => u >= START[i] && u <= START[i] + LEN[i]), `chapter ${i}`);
  assert.equal(CH.OUTRO, COUNT - 1);
});
