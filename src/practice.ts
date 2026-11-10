// Exam-style practice for Pass 2: encode an instruction by hand, or decode a hex instruction.
// Every problem is written as a small real program and run through the project's own assembler,
// so the answer key is exactly what the assembler produces, and the worked solution is the same
// explanation the Assemble mode shows.
import { buildTrace, Encoding } from './asmTrace.ts';
import { hex } from './explain.ts';
import { L, Lang, ltr as c } from './i18n.ts';
import { REGISTER_NAMES, RegisterId } from './sicxe/types.ts';

export type Topic = 'pc' | 'neg' | 'base' | 'imm' | 'ind' | 'idx' | 'f4' | 'f2';
export const TOPICS: [Topic, string, string][] = [
  ['pc', 'PC-relative', 'نسبية للعداد'],
  ['neg', 'Negative disp', 'disp سالب'],
  ['base', 'Base-relative', 'نسبية للقاعدة'],
  ['imm', 'Immediate #', 'فورية #'],
  ['ind', 'Indirect @', 'غير مباشرة @'],
  ['idx', 'Indexed ,X', 'فهرسية ,X'],
  ['f4', 'Format 4 (+)', 'Format 4 (+)'],
  ['f2', 'Format 2', 'Format 2'],
];

export interface Problem {
  topic: Topic;
  instr: string; // e.g. "STCH BUFFER,X"
  loc: number;
  givens: { name: string; value: number }[]; // symbol addresses and B, as the question states them
  base?: number;
  format: 2 | 3 | 4;
  len: number;
  ta?: number; // target address of a symbol operand
  hex: string; // the answer: object code
  nixbpe?: { n: number; i: number; x: number; b: number; p: number; e: number };
  value?: number; // disp or address field
  r1?: number; r2?: number;
  enc: Encoding; // worked solution (Pass 2 explanation + bits)
  source: string; // the program behind the problem
}

// ---------- random helpers (seedable so a problem can be shared or tested) ----------
export function rng(seed: number) {
  let s = (Math.imul(seed >>> 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1; // spread small seeds apart
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
  for (let k = 0; k < 4; k++) next();
  return next;
}
const pickOf = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const int = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

const SYMS = ['BUFFER', 'LENGTH', 'RETADR', 'LIMIT', 'TABLE', 'COUNT', 'RESULT', 'ALPHA', 'TOTAL', 'INDEX'];
const JUMPS = ['FIRST', 'LOOP', 'RDREC', 'WRREC', 'CLOOP', 'ENDFIL'];
const MEM3 = ['LDA', 'LDX', 'LDS', 'LDT', 'STA', 'STX', 'STL', 'STCH', 'LDCH', 'ADD', 'SUB', 'COMP', 'TIX', 'MUL'];
const IMM = ['LDA', 'LDX', 'LDB', 'LDS', 'LDT', 'ADD', 'SUB', 'COMP', 'MUL'];
const JMP = ['J', 'JEQ', 'JLT', 'JGT', 'JSUB'];
const REGS = ['A', 'X', 'L', 'B', 'S', 'T'];

// Lay the pieces out at their addresses and fill the gaps with RESB
function program(items: { addr: number; text: string; size: number }[], baseSym?: string): string {
  const sorted = [...items].sort((a, b) => a.addr - b.addr);
  const start = sorted[0].addr;
  const lines = [`PRACT   START   ${hex(start, 4)}`];
  if (baseSym) lines.push(`        BASE    ${baseSym}`);
  let cur = start;
  for (const it of sorted) {
    if (it.addr > cur) lines.push(`        RESB    ${it.addr - cur}`);
    lines.push(it.text);
    cur = it.addr + it.size;
  }
  lines.push('        END     PRACT');
  return lines.join('\n') + '\n';
}
const pad = (s: string) => s.padEnd(8, ' ');
const symLine = (name: string) => `${pad(name)}RESW    1`;
const overlaps = (a: number, al: number, b: number, bl: number) => a < b + bl && b < a + al;

export function makeProblem(topic: Topic, seed: number): Problem {
  const r = rng(seed);
  for (let attempt = 0; attempt < 50; attempt++) {
    const loc = int(r, 0, 0x0c00);
    let instr = '', items: { addr: number; text: string; size: number }[] = [], baseSym: string | undefined, base: number | undefined;
    const givens: { name: string; value: number }[] = [];
    let ta: number | undefined, len = 3, format: 2 | 3 | 4 = 3;
    const sym = pickOf(r, topic === 'pc' || topic === 'neg' ? [...SYMS, ...JUMPS] : SYMS);

    if (topic === 'f2') {
      format = 2; len = 2;
      const op = pickOf(r, ['ADDR', 'SUBR', 'COMPR', 'RMO', 'MULR', 'CLEAR', 'TIXR'] as const);
      const r1 = pickOf(r, REGS);
      let r2 = pickOf(r, REGS);
      if (r2 === r1) r2 = REGS[(REGS.indexOf(r1) + 1) % REGS.length];
      instr = op === 'CLEAR' || op === 'TIXR' ? `${op} ${r1}` : `${op} ${r1},${r2}`;
    } else if (topic === 'imm' && r() < 0.5) {
      // #number: goes straight into disp
      const n = r() < 0.6 ? int(r, 1, 99) : int(r, 100, 4095);
      instr = `${pickOf(r, IMM)} #${n}`;
    } else if (topic === 'f4') {
      format = 4; len = 4;
      if (r() < 0.35) instr = `+${pickOf(r, ['LDT', 'LDA', 'LDS'])} #${int(r, 4096, 99999)}`;
      else {
        ta = int(r, 0x1000, 0x7fff);
        instr = `+${pickOf(r, ['JSUB', 'LDA', 'STA', 'LDT', 'J'])} ${sym}`;
      }
    } else {
      const d = topic === 'neg' ? -int(r, 4, 400) : topic === 'base' ? 0 : int(r, 3, 400);
      ta = loc + 3 + d;
      if (topic === 'base') {
        ta = loc + 3 + int(r, 2048, 3500);
        base = ta - int(r, 3, 600);
        baseSym = pickOf(r, SYMS.filter((x) => x !== sym));
      }
      const op = topic === 'imm' ? pickOf(r, IMM) : topic === 'ind' ? pickOf(r, ['J', 'JSUB', 'LDA']) : topic === 'neg' && JUMPS.includes(sym) ? pickOf(r, JMP)
        : topic === 'pc' && JUMPS.includes(sym) ? pickOf(r, JMP) : pickOf(r, MEM3);
      const operand = topic === 'imm' ? `#${sym}` : topic === 'ind' ? `@${sym}` : topic === 'idx' || (topic === 'base' && r() < 0.6) ? `${sym},X` : sym;
      instr = `${op} ${operand}`;
    }

    // Place the instruction and the symbols it needs, without overlaps
    if (ta !== undefined && (ta < 0 || overlaps(ta, 3, loc, len))) continue;
    if (base !== undefined && (base < 0 || overlaps(base, 3, loc, len) || overlaps(base, 3, ta!, 3))) continue;
    items.push({ addr: loc, text: `        ${instr.split(' ')[0].padEnd(8, ' ')}${instr.split(' ').slice(1).join(' ')}`, size: len });
    if (ta !== undefined) { items.push({ addr: ta, text: symLine(sym), size: 3 }); givens.push({ name: sym, value: ta }); }
    if (base !== undefined && baseSym) { items.push({ addr: base, text: symLine(baseSym), size: 3 }); givens.push({ name: 'B', value: base }); }

    const source = program(items, baseSym);
    const tr = buildTrace(source);
    if (!tr.result.success) continue;
    const idx = tr.result.listing.findIndex((l) => l.loc === loc && !!l.objectCode && l.mnemonic && !/^(RESW|RESB|WORD|BYTE)$/i.test(l.mnemonic));
    const step = tr.steps.find((s) => s.phase === 'p2' && s.line === idx && s.enc);
    if (!step) continue;
    const line = tr.result.listing[idx];
    // The problem must really test its topic (e.g. base-relative really used b = 1)
    const nb = line.nixbpe;
    if (topic === 'base' && !nb?.b) continue;
    if ((topic === 'pc' || topic === 'neg' || topic === 'ind' || topic === 'idx') && !nb?.p) continue;

    const p: Problem = {
      topic, instr, loc, givens, base, format, len, ta, hex: line.objectCode, nixbpe: nb, enc: step.enc!, source,
    };
    if (format === 2) {
      const b1 = parseInt(line.objectCode.slice(2, 4), 16);
      p.r1 = b1 >> 4; p.r2 = b1 & 15;
    } else {
      const v = parseInt(line.objectCode, 16);
      p.value = format === 4 ? v & 0xfffff : v & 0xfff;
    }
    return p;
  }
  throw new Error(`Could not make a ${topic} problem`);
}

// ---------- checking an answer, field by field ----------
export interface Answer {
  mnemonic?: string; // decode only
  format?: number;
  n?: number; i?: number; x?: number; b?: number; p?: number; e?: number;
  r1?: string; r2?: string;
  value?: string; // disp / address in hex
  hex?: string; // encode only
}
export type FieldKey = 'mnemonic' | 'format' | 'ni' | 'x' | 'bp' | 'e' | 'r1' | 'r2' | 'value' | 'hex';
export interface Mistake { key: FieldKey; code: string; msg: string }
export interface Result { ok: Partial<Record<FieldKey, boolean>>; mistakes: Mistake[]; right: boolean }

const cleanHex = (s?: string) => (s ?? '').trim().toUpperCase().replace(/^0X/, '').replace(/\s+/g, '');
const asHex = (s?: string) => { const t = cleanHex(s); return /^-?[0-9A-F]+$/.test(t) ? parseInt(t, 16) : NaN; };

export function check(pr: Problem, a: Answer, mode: 'encode' | 'decode', lang: Lang): Result {
  const T = (en: string, ar: string) => L(lang, en, ar);
  const ok: Result['ok'] = {};
  const mistakes: Mistake[] = [];
  const miss = (key: FieldKey, code: string, msg: string) => { ok[key] = false; mistakes.push({ key, code, msg }); };
  const name = pr.instr.split(' ')[0].replace('+', '');
  const operand = pr.instr.split(' ').slice(1).join(' ');

  if (mode === 'decode') {
    const m = (a.mnemonic ?? '').trim().toUpperCase().replace(/^\+/, '');
    if (m === name) ok.mnemonic = true;
    else {
      const b0 = parseInt(pr.hex.slice(0, 2), 16);
      miss('mnemonic', 'opcode', pr.format === 2
        ? T(`The first byte ${hex(b0, 2)} is the whole opcode in format 2: ${hex(b0, 2)} = ${name}.`, `البايت الأول ${c(hex(b0, 2))} هو الـ opcode كاملاً في format 2: ${c(`${hex(b0, 2)} = ${name}`)}.`)
        : T(`The first byte ${hex(b0, 2)} = ${b0.toString(2).padStart(8, '0')}. Its last two bits are n and i, so the opcode is ${hex(b0 & 0xfc, 2)} = ${name}.`,
          `البايت الأول ${c(`${hex(b0, 2)} = ${b0.toString(2).padStart(8, '0')}`)}. آخر بتين فيه هما ${c('n i')}، فالـ opcode هو ${c(`${hex(b0 & 0xfc, 2)} = ${name}`)}.`));
    }
  }

  if (a.format === pr.format) ok.format = true;
  else miss('format', 'format', pr.format === 4
    ? T(mode === 'encode' ? 'The + in front means format 4 (4 bytes).' : 'e = 1 in the second byte means format 4 (4 bytes).', mode === 'encode' ? `علامة ${c('+')} في البداية تعني format 4 (${c(4)} بايت).` : `${c('e = 1')} في البايت الثاني تعني format 4 (${c(4)} بايت).`)
    : pr.format === 2 ? T('Register-to-register instructions are format 2 (2 bytes).', `تعليمات السجلات من format 2 (بايتان).`)
    : T(mode === 'encode' ? 'No + in front, so format 3 (3 bytes).' : 'e = 0 in the second byte, so format 3 (3 bytes).', mode === 'encode' ? `لا توجد ${c('+')}، إذن format 3 (${c(3)} بايت).` : `${c('e = 0')} في البايت الثاني، إذن format 3 (${c(3)} بايت).`));

  if (pr.format === 2) {
    const regNo = (s?: string) => { const t = (s ?? '').trim().toUpperCase(); return REGISTER_NAMES[t as RegisterId] ?? (t === '' ? NaN : Number(t)); };
    const one = name === 'CLEAR' || name === 'TIXR';
    if (regNo(a.r1) === pr.r1) ok.r1 = true;
    else miss('r1', 'reg', T('Register numbers: A=0, X=1, L=2, B=3, S=4, T=5, F=6.', `أرقام السجلات: ${c('A=0, X=1, L=2, B=3, S=4, T=5, F=6')}.`));
    if (regNo(a.r2) === pr.r2) ok.r2 = true;
    else miss('r2', one ? 'reg-unused' : 'reg', one ? T(`${name} uses one register, so r2 = 0.`, `${c(name)} تستخدم سجلاً واحداً، إذن ${c('r2 = 0')}.`)
      : T('Register numbers: A=0, X=1, L=2, B=3, S=4, T=5, F=6.', `أرقام السجلات: ${c('A=0, X=1, L=2, B=3, S=4, T=5, F=6')}.`));
  } else {
    const nb = pr.nixbpe!;
    if (a.n === nb.n && a.i === nb.i) ok.ni = true;
    else miss('ni', 'ni', operand.startsWith('#') ? T('# means immediate: n i = 0 1.', `${c('#')} تعني عنونة فورية: ${c('n i = 0 1')}.`)
      : operand.startsWith('@') ? T('@ means indirect: n i = 1 0.', `${c('@')} تعني عنونة غير مباشرة: ${c('n i = 1 0')}.`)
      : T('No # or @ means simple addressing: n i = 1 1.', `بدون ${c('#')} أو ${c('@')} العنونة بسيطة: ${c('n i = 1 1')}.`));
    if (a.x === nb.x) ok.x = true;
    else miss('x', 'x', nb.x ? T(',X at the end means indexed: x = 1.', `${c(',X')} في النهاية تعني فهرسية: ${c('x = 1')}.`) : T('No ,X: x = 0.', `لا يوجد ${c(',X')}: ${c('x = 0')}.`));
    if (a.b === nb.b && a.p === nb.p) ok.bp = true;
    else if (nb.b) miss('bp', 'base', T(`PC-relative would need disp = ${pr.ta! - (pr.loc + pr.len)}, outside −2048..2047, so the assembler uses B: b = 1, p = 0.`, `النسبية للعداد تحتاج ${c(`disp = ${pr.ta! - (pr.loc + pr.len)}`)} وهذا خارج ${c('−2048..2047')}، فيستخدم المجمّع ${c('B')}: ${c('b = 1, p = 0')}.`));
    else if (nb.p) miss('bp', 'pc-first', T('Always try PC-relative first; this disp fits −2048..2047, so p = 1, b = 0.', `جرّب النسبية للعداد أولاً دائماً؛ هذا الـ ${c('disp')} داخل ${c('−2048..2047')}، إذن ${c('p = 1, b = 0')}.`));
    else miss('bp', 'direct', pr.format === 4 ? T('Format 4 holds the full address: b = p = 0.', `format 4 يحمل العنوان كاملاً: ${c('b = p = 0')}.`) : T('#number is not an address, so no PC or B: b = p = 0.', `${c('#رقم')} ليس عنواناً، فلا ${c('PC')} ولا ${c('B')}: ${c('b = p = 0')}.`));
    if (a.e === nb.e) ok.e = true;
    else miss('e', 'e', nb.e ? T('Format 4: e = 1.', `format 4: ${c('e = 1')}.`) : T('Format 3: e = 0.', `format 3: ${c('e = 0')}.`));

    // The displacement / address field, with the usual mistakes named
    const want = pr.value!, got = asHex(a.value), w = pr.format === 4 ? 5 : 3;
    const raw = cleanHex(a.value);
    if (got === want && raw !== '') ok.value = true;
    else if (pr.ta !== undefined && pr.format === 3 && nb.p) {
      const pc = pr.loc + pr.len, d = pr.ta - pc;
      if (raw.startsWith('-')) miss('value', 'twos', T(`A negative disp is written in 12-bit two's complement: ${d} → ${hex(d & 0xfff, 3)}.`, `الـ ${c('disp')} السالب يُكتب بالمتمم الثنائي في ${c(12)} بت: ${c(`${d} → ${hex(d & 0xfff, 3)}`)}.`));
      else if (got === ((pr.ta - pr.loc) & 0xfff)) miss('value', 'pc-next', T(`PC is the address of the NEXT instruction: ${hex(pr.loc)} + ${pr.len} = ${hex(pc)}, not ${hex(pr.loc)}.`, `الـ ${c('PC')} هو عنوان التعليمة التالية: ${c(`${hex(pr.loc)} + ${pr.len} = ${hex(pc)}`)}، وليس ${c(hex(pr.loc))}.`));
      else if (d < 0 && got === -d) miss('value', 'twos', T(`TA is before PC, so disp is negative (${d}); write it in two's complement: ${hex(d & 0xfff, 3)}.`, `الـ ${c('TA')} قبل الـ ${c('PC')}، فالـ ${c('disp')} سالب (${c(d)})؛ اكتبه بالمتمم الثنائي: ${c(hex(d & 0xfff, 3))}.`));
      else if (got === ((pc - pr.ta) & 0xfff)) miss('value', 'order', T(`disp = TA − PC, not PC − TA: ${hex(pr.ta)} − ${hex(pc)}.`, `${c('disp = TA − PC')} وليس ${c('PC − TA')}: ${c(`${hex(pr.ta)} − ${hex(pc)}`)}.`));
      else miss('value', 'disp', T(`disp = TA − PC = ${hex(pr.ta)} − ${hex(pc)} = ${d} → ${hex(want, 3)}.`, `${c(`disp = TA − PC = ${hex(pr.ta)} − ${hex(pc)} = ${d} → ${hex(want, 3)}`)}.`));
    } else if (pr.ta !== undefined && nb.b) {
      const pcd = (pr.ta - (pr.loc + pr.len)) & 0xfff;
      if (got === pcd) miss('value', 'base', T(`That is the PC-relative disp, which does not fit. Use B: disp = TA − B = ${hex(pr.ta)} − ${hex(pr.base!)} = ${hex(want, 3)}.`, `هذا الـ ${c('disp')} النسبي للعداد، وهو لا يصلح. استخدم ${c('B')}: ${c(`disp = TA − B = ${hex(pr.ta)} − ${hex(pr.base!)} = ${hex(want, 3)}`)}.`));
      else miss('value', 'disp', T(`disp = TA − B = ${hex(pr.ta)} − ${hex(pr.base!)} = ${hex(want, 3)}.`, `${c(`disp = TA − B = ${hex(pr.ta)} − ${hex(pr.base!)} = ${hex(want, 3)}`)}.`));
    } else if (pr.ta === undefined && name !== 'RSUB') {
      const dec = parseInt(operand.replace('#', ''), 10);
      if (raw !== '' && parseInt(raw, 10) === dec && got !== want) miss('value', 'dec-hex', T(`#${dec} is decimal; the field holds it in hex: ${dec} = ${hex(want, w)}.`, `${c(`#${dec}`)} بالعشري؛ والحقل يحمله بالـ hex: ${c(`${dec} = ${hex(want, w)}`)}.`));
      else miss('value', 'disp', T(`The number goes straight into the field: ${hex(want, w)}.`, `الرقم يُكتب مباشرة في الحقل: ${c(hex(want, w))}.`));
    } else miss('value', 'addr', T(`Format 4 holds TA itself: ${hex(want, 5)}.`, `format 4 يحمل الـ ${c('TA')} نفسه: ${c(hex(want, 5))}.`));
  }

  if (mode === 'encode') {
    if (cleanHex(a.hex) === pr.hex) ok.hex = true;
    else {
      const fieldsRight = mistakes.length === 0;
      miss('hex', fieldsRight ? 'group' : 'hex', fieldsRight
        ? T(`Your fields are right. Write the bits one after another and read them in groups of four: ${pr.hex}.`, `حقولك صحيحة. اكتب البتات وراء بعضها واقرأها كل ${c(4)} بتات: ${c(pr.hex)}.`)
        : T(`Fix the fields above first; the hex follows from them.`, `صحّح الحقول التي فوق أولاً؛ الـ hex يأتي منها.`));
    }
  }
  return { ok, mistakes, right: mistakes.length === 0 };
}

// The answer a student would give if they did everything right (used by tests and "fill in")
export function correctAnswer(pr: Problem): Answer {
  const a: Answer = { mnemonic: pr.instr.split(' ')[0], format: pr.format, hex: pr.hex };
  if (pr.format === 2) { a.r1 = String(pr.r1); a.r2 = String(pr.r2); }
  else { Object.assign(a, pr.nixbpe); a.value = hex(pr.value!, pr.format === 4 ? 5 : 3); }
  return a;
}

// Short names for the mistake tally
export const MISTAKE_NAMES: Record<string, [string, string]> = {
  'pc-next': ['Used LOC instead of PC (next instruction)', 'استخدام LOC بدل PC (التعليمة التالية)'],
  twos: ["Negative disp not in two's complement", 'disp سالب بدون المتمم الثنائي'],
  order: ['Subtracted PC − TA instead of TA − PC', 'طرح PC − TA بدل TA − PC'],
  base: ['Used PC-relative when it does not fit', 'استخدام النسبية للعداد وهي لا تصلح'],
  'pc-first': ['Did not try PC-relative first', 'عدم تجربة النسبية للعداد أولاً'],
  'dec-hex': ['Wrote a decimal number as if it were hex', 'كتابة رقم عشري كأنه hex'],
  ni: ['n i bits (#, @)', 'البتان n i (# و @)'],
  x: ['x bit (,X)', 'البت x (,X)'],
  e: ['e bit', 'البت e'],
  format: ['Format / length', 'الـ format والطول'],
  reg: ['Register numbers', 'أرقام السجلات'],
  'reg-unused': ['Unused r2 is 0', 'r2 غير المستخدم = 0'],
  opcode: ['Reading the opcode from the first byte', 'قراءة الـ opcode من البايت الأول'],
  direct: ['b p for a number or format 4', 'b p مع رقم أو format 4'],
  disp: ['Displacement arithmetic', 'حساب الـ disp'],
  addr: ['Format 4 address', 'عنوان format 4'],
  group: ['Grouping bits into hex', 'تجميع البتات إلى hex'],
  hex: ['Final hex', 'الـ hex النهائي'],
};
