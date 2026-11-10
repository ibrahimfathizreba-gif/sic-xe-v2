import { DecodedInstruction as D } from './sicxe/types.ts';
import { Lang, ltr } from './i18n.ts';

export const hex = (n: number, w = 4) => n.toString(16).toUpperCase().padStart(w, '0');

// Turns a decoded instruction into one plain sentence, in English or Arabic.
export function explain(d: D, lang: Lang = 'en'): string {
  return lang === 'ar' ? explainAr(d) : explainEn(d);
}

function explainEn(d: D): string {
  const m = d.mnemonic.replace('+', '');
  const ta = d.targetAddress ?? 0;
  const v = d.operandValue ?? d.dispOrAddr ?? 0;
  const at = `0x${hex(ta)}`;
  const src =
    d.addressingMode === 'immediate' ? `the number ${v}`
    : d.addressingMode === 'indirect' ? `the value that address ${at} points to`
    : `the value stored at address ${at}`;
  const r1 = d.r1 ?? '?';
  const r2 = d.r2 ?? '?';

  const ld = m.match(/^LD([AXLBST])$/);
  if (ld) return `Copy ${src} into register ${ld[1]}.`;
  const st = m.match(/^ST([AXLBST])$/);
  if (st) return `Save register ${st[1]} into memory at ${at}.`;

  switch (m) {
    case 'LDCH': return `Read one byte from ${at} into the lowest byte of A.`;
    case 'STCH': return `Write the lowest byte of A to address ${at}.`;
    case 'ADD': return `Add ${src} to A.`;
    case 'SUB': return `Subtract ${src} from A.`;
    case 'MUL': return `Multiply A by ${src}.`;
    case 'DIV': return `Divide A by ${src}.`;
    case 'AND': return `Combine A with ${src} using AND.`;
    case 'OR': return `Combine A with ${src} using OR.`;
    case 'COMP': return `Compare A with ${src}. The answer is kept in the condition code.`;
    case 'TIX': return `Add 1 to X, then compare X with ${src}.`;
    case 'J': return `Jump to address ${at}.`;
    case 'JEQ': return `Jump to ${at}, but only if the last comparison was equal.`;
    case 'JLT': return `Jump to ${at}, but only if the last comparison was less than.`;
    case 'JGT': return `Jump to ${at}, but only if the last comparison was greater than.`;
    case 'JSUB': return `Call the subroutine at ${at}. The return address is saved in L.`;
    case 'RSUB': return `Return to the address saved in L.`;
    case 'ADDR': return `Add ${r1} to ${r2}.`;
    case 'SUBR': return `Subtract ${r1} from ${r2}.`;
    case 'MULR': return `Multiply ${r2} by ${r1}.`;
    case 'DIVR': return `Divide ${r2} by ${r1}.`;
    case 'COMPR': return `Compare ${r1} with ${r2}.`;
    case 'CLEAR': return `Reset ${r1} to 0.`;
    case 'TIXR': return `Add 1 to X, then compare X with ${r1}.`;
    case 'RMO': return `Copy ${r1} into ${r2}.`;
    case 'SHIFTL': return `Shift ${r1} left by ${d.shiftAmount ?? 1} bit(s).`;
    case 'SHIFTR': return `Shift ${r1} right by ${d.shiftAmount ?? 1} bit(s).`;
  }
  return d.disassembly;
}

function explainAr(d: D): string {
  const m = d.mnemonic.replace('+', '');
  const ta = d.targetAddress ?? 0;
  const v = d.operandValue ?? d.dispOrAddr ?? 0;
  const at = ltr(`0x${hex(ta)}`);
  const src =
    d.addressingMode === 'immediate' ? `الرقم ${ltr(v)}`
    : d.addressingMode === 'indirect' ? `القيمة التي يشير إليها العنوان ${at}`
    : `القيمة المخزنة في العنوان ${at}`;
  const r1 = ltr(d.r1 ?? '?');
  const r2 = ltr(d.r2 ?? '?');
  const R = (r: string) => `السجل ${ltr(r)}`;

  const ld = m.match(/^LD([AXLBST])$/);
  if (ld) return `انسخ ${src} إلى ${R(ld[1])}.`;
  const st = m.match(/^ST([AXLBST])$/);
  if (st) return `احفظ ${R(st[1])} في الذاكرة عند ${at}.`;

  switch (m) {
    case 'LDCH': return `اقرأ بايتاً واحداً من ${at} إلى البايت الأيمن من ${ltr('A')}.`;
    case 'STCH': return `اكتب البايت الأيمن من ${ltr('A')} في العنوان ${at}.`;
    case 'ADD': return `أضف ${src} إلى ${ltr('A')}.`;
    case 'SUB': return `اطرح ${src} من ${ltr('A')}.`;
    case 'MUL': return `اضرب ${ltr('A')} في ${src}.`;
    case 'DIV': return `اقسم ${ltr('A')} على ${src}.`;
    case 'AND': return `طبّق ${ltr('AND')} بين ${ltr('A')} و${src}.`;
    case 'OR': return `طبّق ${ltr('OR')} بين ${ltr('A')} و${src}.`;
    case 'COMP': return `قارن ${ltr('A')} مع ${src}. النتيجة تُحفظ في رمز الحالة ${ltr('CC')}.`;
    case 'TIX': return `زِد ${ltr('X')} بواحد، ثم قارن ${ltr('X')} مع ${src}.`;
    case 'J': return `اقفز إلى العنوان ${at}.`;
    case 'JEQ': return `اقفز إلى ${at} فقط إذا كانت نتيجة آخر مقارنة "يساوي".`;
    case 'JLT': return `اقفز إلى ${at} فقط إذا كانت نتيجة آخر مقارنة "أصغر من".`;
    case 'JGT': return `اقفز إلى ${at} فقط إذا كانت نتيجة آخر مقارنة "أكبر من".`;
    case 'JSUB': return `استدعِ البرنامج الفرعي عند ${at}. عنوان الرجوع يُحفظ في ${ltr('L')}.`;
    case 'RSUB': return `ارجع إلى العنوان المحفوظ في ${ltr('L')}.`;
    case 'ADDR': return `أضف ${r1} إلى ${r2}.`;
    case 'SUBR': return `اطرح ${r1} من ${r2}.`;
    case 'MULR': return `اضرب ${r2} في ${r1}.`;
    case 'DIVR': return `اقسم ${r2} على ${r1}.`;
    case 'COMPR': return `قارن ${r1} مع ${r2}.`;
    case 'CLEAR': return `صفّر ${r1}.`;
    case 'TIXR': return `زِد ${ltr('X')} بواحد، ثم قارن ${ltr('X')} مع ${r1}.`;
    case 'RMO': return `انسخ ${r1} إلى ${r2}.`;
    case 'SHIFTL': return `أزِح ${r1} لليسار بمقدار ${ltr(d.shiftAmount ?? 1)} بت.`;
    case 'SHIFTR': return `أزِح ${r1} لليمين بمقدار ${ltr(d.shiftAmount ?? 1)} بت.`;
  }
  return ltr(d.disassembly);
}

// The CPU's stop messages, in Arabic when needed (the engine itself only speaks English)
export function haltReason(reason: string, lang: Lang): string {
  if (lang !== 'ar') return reason;
  if (reason.includes('normal termination')) return 'قفزة إلى نفس العنوان، وهي النهاية الطبيعية للبرنامج.';
  const n = reason.match(/Stopped after (\d+) steps/);
  if (n) return `توقف بعد ${ltr(n[1])} خطوة. ربما البرنامج عالق في حلقة لا نهائية.`;
  if (reason.includes('Division by zero')) return `خطأ: قسمة على صفر. ${ltr(reason)}`;
  if (reason.includes('moved outside loaded program range')) return `خرج ${ltr('PC')} من حدود البرنامج المحمَّل. ${ltr(reason)}`;
  if (reason.includes('Immediate addressing is illegal')) return `خطأ: لا يمكن استخدام العنونة الفورية ${ltr('#')} مع هذه التعليمة. ${ltr(reason)}`;
  if (reason.includes('not supported')) return `تعليمة غير مدعومة في المحاكي. ${ltr(reason)}`;
  return ltr(reason);
}
