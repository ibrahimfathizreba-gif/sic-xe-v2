import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTrace, partialRecords } from './asmTrace.ts';
import { EXAMPLES } from './sicxe/examples.ts';

// Covers every encoding path: negative PC-relative disp, base-relative, format 4 with a symbol (M record)
// and with a number, indirect, indexed, format 1 and 2, SHIFTL, RSUB, WORD (negative), BYTE C and X.
const MIXED = `MIX     START   1000
FIRST   LDA     #3
        LDB     #LENGTH
        BASE    BUF
        J       @RETADR
        STCH    BUF,X
        +JSUB   FAR
        +LDT    #4096
        SHIFTL  A,4
        COMPR   A,S
        FIX
        RSUB
LOOP    J       FIRST
LENGTH  WORD    -5
RETADR  RESW    1
EOF     BYTE    C'EOF'
DEV     BYTE    X'F1'
        RESB    3000
BUF     RESB    10
FAR     RESB    1
        END     FIRST
`;

const programs = [...EXAMPLES.map((e) => [e.id, e.source] as const), ['mixed', MIXED] as const];

test('every Pass 2 explanation produces exactly the hex the assembler produced', () => {
  for (const [id, src] of programs) {
    const tr = buildTrace(src);
    assert.equal(tr.result.success, true, `${id}: ${tr.result.errors.map((e) => e.message).join('; ')}`);
    let checked = 0;
    for (const s of tr.steps) {
      if (!s.enc) continue;
      const line = tr.result.listing[s.line!];
      assert.equal(s.enc.hex, line.objectCode, `${id}: "${line.sourceText.trim()}"`);
      assert.equal(s.enc.fields.map((f) => f.bits).join('').length % 4, 0);
      checked++;
    }
    assert.ok(checked > 0, id);
  }
});

test('Pass 1 tracks LOCCTR and SYMTAB like the assembler', () => {
  for (const [id, src] of programs) {
    const tr = buildTrace(src);
    const p1 = tr.steps.filter((s) => s.phase === 'p1');
    for (let k = 0; k < p1.length - 1; k++) assert.equal(p1[k].locAfter, p1[k + 1].locBefore, `${id} step ${k}`);
    const added = p1.filter((s) => s.newSymbol).map((s) => s.newSymbol).sort();
    assert.deepEqual(added, tr.result.symbolList.map((s) => s.name).sort(), id);
  }
});

test('forward references are spotted in Pass 1', () => {
  const tr = buildTrace(EXAMPLES.find((e) => e.id === 'sum1to5')!.source);
  const fw = tr.steps.filter((s) => s.forward).map((s) => s.forward);
  assert.deepEqual(fw, ['LIMIT', 'RESULT']);
});

test('handout examples are explained with the right numbers', () => {
  const tr = buildTrace(MIXED);
  const step = (text: string) => tr.steps.find((s) => s.enc && tr.result.listing[s.line!].sourceText.includes(text))!;
  // LDB #LENGTH: immediate + PC-relative
  assert.match(step('LDB     #LENGTH').enc!.how.join(' '), /n i = 0 1/);
  // STCH BUF,X: out of PC range, so base-relative
  const stch = step('STCH').enc!.how.join(' ');
  assert.match(stch, /outside −2048\.\.2047/);
  assert.match(stch, /b = 1, p = 0/);
  // J FIRST from further down: negative displacement in two's complement
  assert.match(step('J       FIRST').enc!.how.join(' '), /two's complement/);
  // +JSUB FAR needs an M record
  assert.match(step('+JSUB').enc!.how.join(' '), /M record/);
});

test('the object program builds up to the final text', () => {
  const tr = buildTrace(EXAMPLES[0].source);
  const last = partialRecords(tr, tr.steps.length - 1).map((r) => r.text).join('\n');
  assert.equal(last, tr.result.objectProgram!.fullText);
  const p1End = tr.steps.findIndex((s) => s.phase === 'p1done');
  assert.equal(partialRecords(tr, p1End).length, 0, 'nothing is written during Pass 1');
});
