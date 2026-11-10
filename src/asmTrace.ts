// Turns one assembler run into a list of explained steps:
// Pass 1 (LOCCTR and SYMTAB, line by line), then Pass 2 (how each line becomes bits and hex),
// so the student can walk through what the assembler did with Step / Back / the timeline.
// It reads the assembler's own result, so the explanation always matches the real output.
import { Assembler } from './sicxe/assembler.ts';
import { OPCODES } from './sicxe/opcodes.ts';
import { AssemblerResult, DecodedInstruction, ListingLine, REGISTER_NAMES, RegisterId } from './sicxe/types.ts';
import { hex } from './explain.ts';
import { L, Lang, ltr } from './i18n.ts';

export type Tone = 'op' | 'ni' | 'x' | 'bp' | 'e' | 'disp' | 'reg' | 'data';
export interface Field { name: string; bits: string; tone: Tone }
export interface HowStep { t: string; tone?: Tone } // one line of the worksheet, coloured like the field it decides
export interface Encoding { how: HowStep[]; fields: Field[]; hex: string }

export interface AsmStep {
  phase: 'start' | 'p1' | 'p1done' | 'p2' | 'done';
  line?: number; // index into result.listing
  title: string;
  say: string;
  locBefore?: number;
  locAfter?: number;
  rule?: string; // why LOCCTR moved by that much
  newSymbol?: string;
  forward?: string; // symbol used before it is defined
  enc?: Encoding;
  record?: string; // what happened to the object program
}

export interface AsmTrace { result: AssemblerResult; steps: AsmStep[] }

const bin = (v: number, w: number) => (v >>> 0).toString(2).padStart(w, '0').slice(-w);
const h = (v: number, w = 4) => hex(v & 0xffffff, w);
const clean = (m?: string) => (m ?? '').toUpperCase();
const isComment = (l: ListingLine) => !l.mnemonic;

// Symbol named by an operand, without #, @, ,X and numbers
function operandSymbol(op?: string): string | null {
  if (!op) return null;
  let t = op.trim();
  if (/,\s*X$/i.test(t)) t = t.replace(/,\s*X$/i, '');
  t = t.replace(/^[#@]/, '').trim();
  if (/^-?\d+$/.test(t) || /^[CX]'/i.test(t)) return null;
  return t || null;
}

export function buildTrace(src: string, lang: Lang = 'en'): AsmTrace {
  const T = (en: string, ar: string) => L(lang, en, ar);
  const c = ltr; // keep code and numbers left-to-right inside Arabic
  const result = Assembler.assemble(src);
  const steps: AsmStep[] = [];
  const lst = result.listing;
  if (!result.success || !result.objectProgram) return { result, steps };
  const sym = result.symbolTable;
  const definedAt = new Map(result.symbolList.map((s) => [s.name, s.definedLine]));
  const obj = result.objectProgram;
  const end = result.startAddress + result.programLength;

  steps.push({
    phase: 'start',
    title: T('Source program', 'البرنامج المصدر'),
    say: T('The assembler reads the source twice. Pass 1 gives every line an address (LOCCTR) and collects the labels in SYMTAB. Pass 2 turns every line into machine code. Press Step to start.',
      `المجمّع يقرأ البرنامج مرتين. في ${c('Pass 1')} يعطي كل سطر عنواناً (${c('LOCCTR')}) ويجمع الـ labels في ${c('SYMTAB')}. في ${c('Pass 2')} يحوّل كل سطر إلى كود آلة. اضغط خطوة للبدء.`),
  });

  // ---------- Pass 1 ----------
  const real = lst.map((l, i) => ({ l, i })).filter(({ l }) => !isComment(l));
  real.forEach(({ l, i }, k) => {
    const m = clean(l.mnemonic), base = m.replace('+', '');
    const next = real[k + 1]?.l.loc ?? end;
    const before = l.loc, after = m === 'END' ? before : next;
    const step: AsmStep = { phase: 'p1', line: i, title: `Pass 1 · ${l.sourceText.trim()}`, say: '', locBefore: before, locAfter: after };
    const n = after - before;

    if (m === 'START') {
      step.rule = T(`START ${l.operand ?? '0'} sets LOCCTR = ${h(result.startAddress)}`, `${c(`START ${l.operand ?? '0'}`)} تجعل ${c(`LOCCTR = ${h(result.startAddress)}`)}`);
      step.say = T(`START gives the program its name${l.label ? ` (${l.label})` : ''} and its first address. The operand is read as hex.`,
        `${c('START')} تعطي البرنامج اسمه${l.label ? ` (${c(l.label)})` : ''} وأول عنوان له. المعامل يُقرأ بالـ hex.`);
    } else if (m === 'END') {
      step.rule = T('END: no more lines', `${c('END')}: لا مزيد من الأسطر`);
      step.say = T('END closes the source. Pass 1 is over.', `${c('END')} تُنهي البرنامج المصدر. انتهى ${c('Pass 1')}.`);
    } else if (m === 'BASE' || m === 'NOBASE') {
      step.rule = T('+0: a note to the assembler, takes no memory', `${c('+0')}: ملاحظة للمجمّع فقط، لا تأخذ مكاناً في الذاكرة`);
      step.say = T(`${m} only tells the assembler what B will hold for base-relative addressing. It is not an instruction, so LOCCTR does not move.`,
        `${c(m)} تخبر المجمّع فقط بقيمة ${c('B')} للعنونة النسبية للقاعدة. ليست تعليمة، لذلك ${c('LOCCTR')} لا يتغير.`);
    } else if (m === 'WORD') step.rule = T('+3: WORD is one 3-byte word', `${c('+3')}: ${c('WORD')} كلمة واحدة من ${c(3)} بايت`);
    else if (m === 'RESW') step.rule = T(`+3 × ${l.operand} = +${n}: RESW reserves words`, `${c(`+3 × ${l.operand} = +${n}`)}: ${c('RESW')} تحجز كلمات`);
    else if (m === 'RESB') step.rule = T(`+${l.operand}: RESB reserves bytes`, `${c(`+${l.operand}`)}: ${c('RESB')} تحجز بايتات`);
    else if (m === 'BYTE') {
      const isC = /^C'/i.test(l.operand ?? '');
      step.rule = isC ? T(`+${n}: one byte per character in ${l.operand}`, `${c(`+${n}`)}: بايت لكل حرف في ${c(l.operand ?? '')}`)
        : T(`+${n}: two hex digits per byte in ${l.operand}`, `${c(`+${n}`)}: كل رقمين hex بايت واحد في ${c(l.operand ?? '')}`);
    } else {
      const op = OPCODES[base];
      step.rule = m.startsWith('+') ? T('+4: the + prefix means format 4', `${c('+4')}: علامة ${c('+')} تعني format 4`)
        : op?.format === 2 ? T('+2: register instruction, format 2', `${c('+2')}: تعليمة سجلات، format 2`)
        : op?.format === 1 ? T('+1: format 1', `${c('+1')}: format 1`)
        : T('+3: format 3', `${c('+3')}: format 3`);
    }
    if (!step.say) step.say = T(`LOCCTR was ${h(before)}. ${step.rule}. Next line starts at ${h(after)}.`,
      `${c('LOCCTR')} كان ${c(h(before))}. ${step.rule}. السطر التالي يبدأ عند ${c(h(after))}.`);

    if (l.label && m !== 'START') {
      step.newSymbol = l.label;
      step.say = T(`${l.label} is a label, so it goes into SYMTAB with the current LOCCTR: ${l.label} = ${h(before)}. `,
        `${c(l.label)} هو label، فيدخل ${c('SYMTAB')} بقيمة ${c('LOCCTR')} الحالية: ${c(`${l.label} = ${h(before)}`)}. `) + step.say;
    } else if (l.label && m === 'START') step.newSymbol = l.label;

    const s = operandSymbol(l.operand);
    if (s && m !== 'START' && m !== 'END' && (definedAt.get(s) ?? 0) > l.lineNo) {
      step.forward = s;
      step.say += T(` ${s} is not in SYMTAB yet (a forward reference), which is why the code is written in Pass 2.`,
        ` ${c(s)} ليس في ${c('SYMTAB')} بعد (مرجع أمامي)، ولهذا يُكتب الكود في ${c('Pass 2')}.`);
    }
    steps.push(step);
  });

  steps.push({
    phase: 'p1done',
    title: T('End of Pass 1', `نهاية ${c('Pass 1')}`),
    say: T(`Every label has an address now. Program length = last LOCCTR − start = ${h(end)} − ${h(result.startAddress)} = ${h(result.programLength)} bytes.`,
      `كل label له عنوان الآن. طول البرنامج = آخر ${c('LOCCTR')} − البداية = ${c(`${h(end)} − ${h(result.startAddress)} = ${h(result.programLength)}`)} بايت.`),
  });

  // ---------- Pass 2 ----------
  let baseAddr: number | null = null, baseSym = '';
  real.forEach(({ l, i }) => {
    const m = clean(l.mnemonic);
    const step: AsmStep = { phase: 'p2', line: i, title: `Pass 2 · ${l.sourceText.trim()}`, say: '' };
    if (m === 'START') {
      step.say = T('Write the header record: program name, start address and length.', `اكتب سجل الرأس ${c('H')}: اسم البرنامج، عنوان البداية، والطول.`);
      step.record = obj.header.recordText;
    } else if (m === 'END') {
      step.say = T(`Close the last T record${obj.modRecords.length ? ', add the M records for the format 4 addresses' : ''}, and write the E record with the address of the first instruction.`,
        `أغلق آخر سجل ${c('T')}${obj.modRecords.length ? `، وأضف سجلات ${c('M')} لعناوين format 4` : ''}، واكتب سجل ${c('E')} بعنوان أول تعليمة.`);
      step.record = obj.endRecord.recordText;
    } else if (m === 'BASE') {
      baseAddr = sym.get(l.operand ?? '') ?? null; baseSym = l.operand ?? '';
      step.say = T(`From here on the assembler may use base-relative addressing, assuming B = ${baseSym} = ${baseAddr === null ? '?' : h(baseAddr)}.`,
        `من هنا يمكن للمجمّع استخدام العنونة النسبية للقاعدة، على افتراض ${c(`B = ${baseSym} = ${baseAddr === null ? '?' : h(baseAddr)}`)}.`);
    } else if (m === 'NOBASE') {
      baseAddr = null;
      step.say = T('Base-relative addressing is switched off again.', 'أُوقفت العنونة النسبية للقاعدة.');
    } else if (m === 'RESW' || m === 'RESB') {
      step.say = T(`${m} produces no object code; the space is just skipped. Because the next code is not right after the previous code, the current T record is closed here.`,
        `${c(m)} لا تنتج كود آلة؛ المساحة تُترك فقط. ولأن الكود التالي لا يأتي مباشرة بعد السابق، يُغلق سجل ${c('T')} الحالي هنا.`);
    } else {
      step.enc = encodeLine(l, sym, baseAddr, baseSym, lang);
      step.say = step.enc.how[step.enc.how.length - 1].t;
    }
    steps.push(step);
  });

  const nT = obj.textRecords.length, nM = obj.modRecords.length;
  steps.push({
    phase: 'done',
    title: T('Object program ready', `${c('Object program')} جاهز`),
    say: T(`Done. The object program has ${nT} T record${nT === 1 ? '' : 's'}${nM ? ` and ${nM} M record${nM === 1 ? '' : 's'}` : ''}. The loader puts these bytes into memory, and then the CPU can run them.`,
      `انتهى التجميع. في ${c('object program')} ${c(nT)} سجل ${c('T')}${nM ? ` و${c(nM)} سجل ${c('M')}` : ''}. الـ loader يضع هذه البايتات في الذاكرة، ثم ينفذها المعالج.`),
  });
  return { result, steps };
}

// How one line becomes machine code, as worksheet steps a student can follow, plus its bits.
export function encodeLine(l: ListingLine, sym: Map<string, number>, baseAddr: number | null, baseSym: string, lang: Lang = 'en'): Encoding {
  const T = (en: string, ar: string) => L(lang, en, ar);
  const c = ltr;
  const m = clean(l.mnemonic), name = m.replace('+', ''), code = l.objectCode;
  const how: HowStep[] = [];
  const say = (t: string, tone?: Tone) => how.push({ t, tone });
  let fields: Field[] = [];

  if (m === 'WORD') {
    const v = parseInt(l.operand ?? '0', 10);
    say(T(`WORD ${v}: one 24-bit word${v < 0 ? ' in two\'s complement' : ''}.`, `${c(`WORD ${v}`)}: كلمة واحدة من ${c(24)} بت${v < 0 ? ' بالمتمم الثنائي' : ''}.`), 'data');
    fields = [{ name: `word ${v}`, bits: bin(v & 0xffffff, 24), tone: 'data' }];
  } else if (m === 'BYTE') {
    const bytes = code.match(/../g) ?? [];
    const isC = /^C'/i.test(l.operand ?? '');
    const chars = isC ? (l.operand ?? '').slice(2, -1) : '';
    const list = Array.from(chars).map((ch, k) => `${ch} = ${bytes[k]}`).join(', ');
    say(isC ? T(`BYTE ${l.operand}: each character is stored as its ASCII code: ${list}.`, `${c(`BYTE ${l.operand}`)}: كل حرف يُخزّن بكود ${c('ASCII')} الخاص به: ${c(list)}.`)
      : T(`BYTE ${l.operand}: the hex digits are the bytes themselves.`, `${c(`BYTE ${l.operand}`)}: أرقام الـ hex هي البايتات نفسها.`), 'data');
    fields = bytes.slice(0, 6).map((b, k) => ({ name: isC ? `'${chars[k]}'` : `byte ${k + 1}`, bits: bin(parseInt(b, 16), 8), tone: 'data' as Tone }));
  } else {
    const op = OPCODES[name];
    if (op.format === 1) {
      say(T(`${name} is format 1: the whole instruction is the 8-bit opcode ${hex(op.opcode, 2)}.`, `${c(name)} من format 1: التعليمة كلها هي الـ opcode بطول ${c(8)} بت: ${c(hex(op.opcode, 2))}.`), 'op');
      fields = [{ name: 'opcode', bits: bin(op.opcode, 8), tone: 'op' }];
    } else if (op.format === 2) {
      const parts = (l.operand ?? '').split(',').map((s) => s.trim().toUpperCase());
      const reg = (r: string) => REGISTER_NAMES[r as RegisterId] ?? parseInt(r, 10);
      const r1 = reg(parts[0]);
      let r2 = 0, r2why = T('r2 is not used, so 0', `${c('r2')} غير مستخدم، فهو ${c(0)}`);
      if (name === 'SHIFTL' || name === 'SHIFTR') { r2 = parseInt(parts[1], 10) - 1; r2why = T(`shift by ${parts[1]} is stored as ${parts[1]} − 1 = ${r2}`, `الإزاحة بمقدار ${c(parts[1])} تُخزّن كـ ${c(`${parts[1]} − 1 = ${r2}`)}`); }
      else if (name !== 'CLEAR' && name !== 'TIXR') { r2 = reg(parts[1]); r2why = T(`r2 = ${parts[1]} = register ${r2}`, `${c(`r2 = ${parts[1]}`)} = السجل رقم ${c(r2)}`); }
      say(T(`${name} is format 2 (2 bytes): opcode, then two 4-bit register numbers.`, `${c(name)} من format 2 (بايتان): الـ opcode ثم رقما سجلين، كل واحد ${c(4)} بت.`));
      say(T(`Opcode of ${name} = ${hex(op.opcode, 2)} = ${bin(op.opcode, 8)}.`, `الـ opcode لـ ${c(name)} = ${c(`${hex(op.opcode, 2)} = ${bin(op.opcode, 8)}`)}.`), 'op');
      say(T(`r1 = ${parts[0]} = register ${r1}; ${r2why}.`, `${c(`r1 = ${parts[0]}`)} = السجل رقم ${c(r1)}؛ ${r2why}.`), 'reg');
      fields = [{ name: 'opcode', bits: bin(op.opcode, 8), tone: 'op' }, { name: 'r1', bits: bin(r1, 4), tone: 'reg' }, { name: 'r2', bits: bin(r2, 4), tone: 'reg' }];
    } else {
      const f4 = m.startsWith('+');
      const nb = l.nixbpe ?? { n: 1, i: 1, x: 0, b: 0, p: 0, e: f4 ? 1 : 0 };
      const len = f4 ? 4 : 3;
      let t = (l.operand ?? '').trim();
      const indexed = /,\s*X$/i.test(t);
      if (indexed) t = t.replace(/,\s*X$/i, '').trim();
      const mode = t.startsWith('#') ? 'immediate' : t.startsWith('@') ? 'indirect' : 'simple';
      t = t.replace(/^[#@]/, '').trim();

      say(f4 ? T(`${m} has the + prefix: format 4 (4 bytes), so e = 1.`, `${c(m)} فيها علامة ${c('+')}: format 4 (${c(4)} بايت)، إذن ${c('e = 1')}.`)
        : T(`${name} is format 3 (3 bytes), so e = 0.`, `${c(name)} من format 3 (${c(3)} بايت)، إذن ${c('e = 0')}.`), 'e');
      say(T(`Opcode of ${name} = ${hex(op.opcode, 2)} = ${bin(op.opcode, 8)}. Only the first 6 bits are kept: ${bin(op.opcode >> 2, 6)}.`,
        `الـ opcode لـ ${c(name)} = ${c(`${hex(op.opcode, 2)} = ${bin(op.opcode, 8)}`)}. نأخذ أول ${c(6)} بتات فقط: ${c(bin(op.opcode >> 2, 6))}.`), 'op');
      say(name === 'RSUB' ? T('RSUB has no operand: n i = 1 1 and everything else is 0.', `${c('RSUB')} بدون معامل: ${c('n i = 1 1')} وكل الباقي ${c(0)}.`)
        : mode === 'immediate' ? T('The operand starts with #: immediate, so n i = 0 1.', `المعامل يبدأ بـ ${c('#')}: عنونة فورية، إذن ${c('n i = 0 1')}.`)
        : mode === 'indirect' ? T('The operand starts with @: indirect, so n i = 1 0.', `المعامل يبدأ بـ ${c('@')}: عنونة غير مباشرة، إذن ${c('n i = 1 0')}.`)
        : T('No # or @: simple addressing, so n i = 1 1.', `لا يوجد ${c('#')} ولا ${c('@')}: عنونة بسيطة، إذن ${c('n i = 1 1')}.`), 'ni');
      if (name !== 'RSUB') say(indexed ? T('The operand ends with ,X: indexed, so x = 1.', `المعامل ينتهي بـ ${c(',X')}: عنونة فهرسية، إذن ${c('x = 1')}.`)
        : T('No ,X: x = 0.', `لا يوجد ${c(',X')}: إذن ${c('x = 0')}.`), 'x');

      let value = 0;
      if (name === 'RSUB') value = 0;
      else if (/^-?\d+$/.test(t)) {
        value = parseInt(t, 10);
        say(T(`#${value} is a number, not an address: it goes straight into the ${f4 ? 'address' : 'disp'} field as ${hex(value, f4 ? 5 : 3)}, with b = p = 0.`,
          `${c(`#${value}`)} رقم وليس عنواناً: يُكتب مباشرة في حقل ${c(f4 ? 'address' : 'disp')} كـ ${c(hex(value, f4 ? 5 : 3))}، مع ${c('b = p = 0')}.`), 'disp');
      } else {
        const ta = sym.get(t)!;
        if (f4) {
          value = ta;
          say(T(`TA = ${t} = ${h(ta, 5)}. Format 4 has room for the whole 20-bit address, so b = p = 0. Because it is an address, the loader may need to move it: an M record is written for ${h(l.loc + 1, 6)}.`,
            `${c(`TA = ${t} = ${h(ta, 5)}`)}. format 4 يتسع للعنوان كاملاً (${c(20)} بت)، إذن ${c('b = p = 0')}. ولأنه عنوان قد يحتاج الـ loader لتعديله، يُكتب سجل ${c('M')} للموقع ${c(h(l.loc + 1, 6))}.`), 'disp');
        } else {
          const pc = l.loc + len, d = ta - pc;
          say(T(`TA = ${t} = ${h(ta)}. PC = address of this instruction + ${len} = ${h(l.loc)} + ${len} = ${h(pc)}.`,
            `${c(`TA = ${t} = ${h(ta)}`)}. ${c('PC')} = عنوان هذه التعليمة + ${c(len)} = ${c(`${h(l.loc)} + ${len} = ${h(pc)}`)}.`));
          if (nb.p) {
            value = d & 0xfff;
            say(T(`disp = TA − PC = ${h(ta)} − ${h(pc)} = ${d} (decimal)${d < 0 ? `, written in 12-bit two's complement as ${hex(value, 3)}` : ` = ${hex(value, 3)} hex`}. It is inside −2048..2047, so PC-relative: p = 1, b = 0.`,
              `${c(`disp = TA − PC = ${h(ta)} − ${h(pc)} = ${d}`)} (عشري)${d < 0 ? `، ويُكتب بالمتمم الثنائي في ${c(12)} بت: ${c(hex(value, 3))}` : ` = ${c(hex(value, 3))} hex`}. داخل المدى ${c('−2048..2047')}، إذن نسبية للعداد: ${c('p = 1, b = 0')}.`), 'disp');
          } else if (nb.b) {
            const bd = ta - (baseAddr ?? 0);
            value = bd & 0xfff;
            say(T(`PC-relative would need disp = ${d} (decimal), outside −2048..2047. So try base-relative with B = ${baseSym} = ${h(baseAddr ?? 0)}: disp = TA − B = ${h(ta)} − ${h(baseAddr ?? 0)} = ${bd} (decimal) = ${hex(value, 3)} hex, inside 0..4095: b = 1, p = 0.`,
              `النسبية للعداد تحتاج ${c(`disp = ${d}`)} (عشري)، وهذا خارج ${c('−2048..2047')}. نجرب النسبية للقاعدة مع ${c(`B = ${baseSym} = ${h(baseAddr ?? 0)}`)}: ${c(`disp = TA − B = ${h(ta)} − ${h(baseAddr ?? 0)} = ${bd}`)} (عشري) = ${c(hex(value, 3))} hex، داخل ${c('0..4095')}: ${c('b = 1, p = 0')}.`), 'disp');
          } else value = ta & 0xfff;
        }
      }
      fields = [
        { name: 'opcode', bits: bin(op.opcode >> 2, 6), tone: 'op' },
        { name: 'n', bits: String(nb.n), tone: 'ni' }, { name: 'i', bits: String(nb.i), tone: 'ni' },
        { name: 'x', bits: String(nb.x), tone: 'x' },
        { name: 'b', bits: String(nb.b), tone: 'bp' }, { name: 'p', bits: String(nb.p), tone: 'bp' },
        { name: 'e', bits: String(nb.e), tone: 'e' },
        { name: f4 ? 'address' : 'disp', bits: bin(value, f4 ? 20 : 12), tone: 'disp' },
      ];
    }
  }

  const all = fields.map((f) => f.bits).join('');
  const derived = (all.match(/.{4}/g) ?? []).map((n) => parseInt(n, 2).toString(16).toUpperCase()).join('');
  const shownHex = fields.length && m === 'BYTE' && code.length > 12 ? code : derived;
  say(T(`Group the ${all.length} bits in fours and write each group in hex: ${shownHex}.`, `قسّم الـ ${c(all.length)} بت إلى مجموعات من ${c(4)} واكتب كل مجموعة بالـ hex: ${c(shownHex)}.`));
  return { how, fields, hex: shownHex };
}

// What part of the object program exists after `upTo` (an index into steps)
export function partialRecords(trace: AsmTrace, upTo: number): { text: string; fresh: boolean }[] {
  const { steps, result } = trace;
  const obj = result.objectProgram!;
  const s = steps[upTo];
  if (!s || s.phase === 'start' || s.phase === 'p1' || s.phase === 'p1done') return [];
  if (s.phase === 'done') return obj.fullText.split('\n').map((t) => ({ text: t, fresh: false }));
  // Bytes produced by Pass 2 lines processed so far
  const doneLines = new Set(steps.slice(0, upTo + 1).filter((x) => x.phase === 'p2' && x.line !== undefined).map((x) => x.line!));
  const line = result.listing[s.line!];
  const ending = clean(line.mnemonic) === 'END';
  const out: { text: string; fresh: boolean }[] = [{ text: obj.header.recordText, fresh: clean(line.mnemonic) === 'START' }];
  for (const r of obj.textRecords) {
    let codeSoFar = '', fresh = false;
    for (const [k, l] of result.listing.entries()) {
      if (!l.objectCode || !doneLines.has(k)) continue;
      if (l.loc >= r.startAddress && l.loc < r.startAddress + r.length) { codeSoFar += l.objectCode; if (k === s.line) fresh = true; }
    }
    if (!codeSoFar) continue;
    const complete = codeSoFar.length / 2 === r.length;
    out.push({ text: complete ? r.recordText : `T^${hex(r.startAddress, 6)}^..^${codeSoFar}`, fresh });
  }
  if (ending) {
    obj.modRecords.forEach((mr) => out.push({ text: mr.recordText, fresh: true }));
    out.push({ text: obj.endRecord.recordText, fresh: true });
  }
  return out;
}

// Bit fields of an instruction decoded from memory (Run mode)
export function fieldsOf(d: DecodedInstruction): Field[] {
  if (d.format === 1) return [{ name: 'opcode', bits: bin(d.opcode, 8), tone: 'op' }];
  if (d.format === 2) {
    const b1 = d.rawBytes[1] ?? 0;
    return [{ name: 'opcode', bits: bin(d.opcode, 8), tone: 'op' }, { name: 'r1', bits: bin(b1 >> 4, 4), tone: 'reg' }, { name: 'r2', bits: bin(b1 & 15, 4), tone: 'reg' }];
  }
  return [
    { name: 'opcode', bits: bin(d.opcode >> 2, 6), tone: 'op' },
    { name: 'n', bits: String(d.n ?? 0), tone: 'ni' }, { name: 'i', bits: String(d.i ?? 0), tone: 'ni' },
    { name: 'x', bits: String(d.x ?? 0), tone: 'x' },
    { name: 'b', bits: String(d.b ?? 0), tone: 'bp' }, { name: 'p', bits: String(d.p ?? 0), tone: 'bp' },
    { name: 'e', bits: String(d.e ?? 0), tone: 'e' },
    { name: d.format === 4 ? 'address' : 'disp', bits: bin(d.dispOrAddr ?? 0, d.format === 4 ? 20 : 12), tone: 'disp' },
  ];
}
