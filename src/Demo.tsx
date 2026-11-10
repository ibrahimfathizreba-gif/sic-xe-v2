import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { L, Lang, ltr as c } from './i18n.ts';

export type Tab = 'mem' | 'sym' | 'obj' | 'log';

// What the app should show for one demo step. Every step names its program,
// so the presenter can jump to any step in any order.
export interface DemoAct {
  load: string; // example id, or 'hex' for the handout decode exercises
  asm?: { phase: 'start' | 'p1' | 'p1done' | 'p2' | 'done'; text?: string }; // show this assembler step
  steps?: number; // otherwise: Run mode, with this many instructions executed
  tab?: Tab;
  sel?: number; // instruction address to open in the decoder
  reference?: boolean;
  practice?: boolean; // open the Practice mode
}
export interface DemoStep { title: [string, string]; say: [string, string]; act: DemoAct }

export const DEMO_HEX = '4B101036 290000 010003 75101000 A004 B440';

export const DEMO: DemoStep[] = [
  {
    title: ['Pass 1: addresses and labels', `${c('Pass 1')}: العناوين والـ labels`],
    say: [
      'Pass 1 walks through the source and gives every line an address with LOCCTR (+3 for format 3, +2 for format 2 …). Each label goes into SYMTAB. Here TIX uses LIMIT before LIMIT is defined: a forward reference, the reason an assembler needs two passes.',
      `في ${c('Pass 1')} يمر المجمّع على البرنامج ويعطي كل سطر عنواناً بـ ${c('LOCCTR')} (${c('+3')} لـ format 3، و${c('+2')} لـ format 2 …). وكل label يدخل ${c('SYMTAB')}. هنا ${c('TIX')} تستخدم ${c('LIMIT')} قبل تعريفه: هذا مرجع أمامي، وهو سبب حاجة المجمّع لمرورين.`,
    ],
    act: { load: 'sum1to5', asm: { phase: 'p1', text: 'TIX' } },
  },
  {
    title: ['Pass 2: from assembly to 0s and 1s', `${c('Pass 2')}: من الأسمبلي إلى 0 و 1`],
    say: [
      'Pass 2 builds each instruction from its fields: 6 bits of opcode, the n i x b p e flags and a 12-bit displacement. TIX LIMIT becomes 001011 1 1 0 0 1 0 000000001001, and in hex 2F2009.',
      `في ${c('Pass 2')} تُبنى كل تعليمة من حقولها: ${c(6)} بتات للـ opcode، ثم البتات ${c('n i x b p e')}، ثم ${c('disp')} من ${c(12)} بت. ${c('TIX LIMIT')} تصبح ${c('001011 1 1 0 0 1 0 000000001001')}، وبالـ hex ${c('2F2009')}.`,
    ],
    act: { load: 'sum1to5', asm: { phase: 'p2', text: 'TIX' } },
  },
  {
    title: ['A negative displacement', `${c('disp')} سالب`],
    say: [
      "JLT LOOP jumps backwards: disp = 0006 − 000E = −8. A negative disp is stored in 12-bit two's complement, FF8, giving 3B2FF8.",
      `${c('JLT LOOP')} تقفز للخلف: ${c('disp = 0006 − 000E = −8')}. الـ ${c('disp')} السالب يُخزّن بالمتمم الثنائي في ${c(12)} بت: ${c('FF8')}، فتصبح التعليمة ${c('3B2FF8')}.`,
    ],
    act: { load: 'sum1to5', asm: { phase: 'p2', text: 'JLT' } },
  },
  {
    title: ['The object program', `الـ ${c('Object program')}`],
    say: [
      'While Pass 2 works it writes the object program: an H record, T records with the code, and an E record with the first instruction. This text is what the loader reads.',
      `أثناء ${c('Pass 2')} يُكتب الـ ${c('object program')}: سجل ${c('H')}، وسجلات ${c('T')} فيها الكود، وسجل ${c('E')} بعنوان أول تعليمة. هذا النص هو ما يقرؤه الـ ${c('loader')}.`,
    ],
    act: { load: 'sum1to5', asm: { phase: 'done' } },
  },
  {
    title: ['Base-relative addressing', 'العنونة النسبية للقاعدة'],
    say: [
      'BUFFER is about 3000 bytes away. PC-relative would need a displacement outside −2048..2047, so the assembler uses the BASE directive: disp = TA − B, with b = 1.',
      `${c('BUFFER')} بعيد بحوالي ${c(3000)} بايت. النسبية للعداد تحتاج ${c('disp')} خارج ${c('−2048..2047')}، فيستخدم المجمّع توجيه ${c('BASE')}: ${c('disp = TA − B')}، مع ${c('b = 1')}.`,
    ],
    act: { load: 'base_format4', asm: { phase: 'p2', text: 'STCH' } },
  },
  {
    title: ['Run it: first loop iteration', 'التنفيذ: أول دورة في الحلقة'],
    say: [
      'The loader puts the bytes in memory and the CPU runs them. ADDR X,A makes A = 1, TIX makes X = 2 and compares it with 6, so CC = LT and JLT jumps back to LOOP.',
      `الـ ${c('loader')} يضع البايتات في الذاكرة والمعالج ينفذها. ${c('ADDR X,A')} تجعل ${c('A = 1')}، و${c('TIX')} تجعل ${c('X = 2')} وتقارنه بـ ${c(6)}، فيصبح ${c('CC = LT')} وتقفز ${c('JLT')} إلى ${c('LOOP')}.`,
    ],
    act: { load: 'sum1to5', steps: 5, tab: 'log' },
  },
  {
    title: ['Go back in time', 'الرجوع في الزمن'],
    say: [
      'Back (←) or the timeline rebuild the machine at any earlier step. Here we are again just before TIX ran.',
      `زر رجوع (${c('←')}) أو شريط الزمن يعيدان بناء الآلة عند أي خطوة سابقة. نحن الآن قبل تنفيذ ${c('TIX')} مباشرة.`,
    ],
    act: { load: 'sum1to5', steps: 3, tab: 'log' },
  },
  {
    title: ['Run to the end', 'التنفيذ حتى النهاية'],
    say: [
      'After five rounds X reaches 6, CC becomes EQ and JLT falls through. STA writes 15 into RESULT (0017) and J HALT, a jump to itself, stops the machine.',
      `بعد خمس دورات يصل ${c('X')} إلى ${c(6)}، فيصبح ${c('CC = EQ')} ولا تقفز ${c('JLT')}. ثم تكتب ${c('STA')} القيمة ${c(15)} في ${c('RESULT (0017)')}، و${c('J HALT')} تقفز لنفسها فتتوقف الآلة.`,
    ],
    act: { load: 'sum1to5', steps: 19, tab: 'mem' },
  },
  {
    title: ['Decode machine code', 'فك كود الآلة'],
    say: [
      'The other direction: the decode exercises from the handout, loaded as raw hex. 4B101036 is +JSUB 01036, 290000 is COMP #0, A004 is COMPR A,S. Click any line to see its bits.',
      `الاتجاه المعاكس: أسئلة فك الترميز من المذكّرة، محمّلة كـ hex مباشر. ${c('4B101036')} هي ${c('+JSUB 01036')}، و${c('290000')} هي ${c('COMP #0')}، و${c('A004')} هي ${c('COMPR A,S')}. اضغط أي سطر لترى بتاته.`,
    ],
    act: { load: 'hex', steps: 0, sel: 0x0000 },
  },
  {
    title: ['Now you do it: Practice', 'دورك: التدريب'],
    say: [
      'Practice turns Pass 2 into exam questions. Pick the format, set n i x b p e, compute disp and write the hex; each field is checked on its own and a wrong answer is named (for example "PC is the address of the NEXT instruction"). Every question is assembled by the project\'s own assembler, so the answer key is always right.',
      `وضع التدريب يحوّل ${c('Pass 2')} إلى أسئلة امتحان. اختر الـ format، واضبط ${c('n i x b p e')}، واحسب الـ ${c('disp')}، واكتب الـ hex؛ كل حقل يُصحَّح وحده، والخطأ يُسمّى باسمه (مثلاً "${c('PC')} هو عنوان التعليمة التالية"). وكل سؤال يجمّعه مجمّع المشروع نفسه، فالإجابة النموذجية صحيحة دائماً.`,
    ],
    act: { load: 'sum1to5', practice: true },
  },
  {
    title: ['Reference sheet', 'ورقة المرجع'],
    say: [
      'Formats, n i x b p e, the addressing rules, the hand-encoding method and the opcode table are always one key away: press ?.',
      `الـ formats، والبتات ${c('n i x b p e')}، وقواعد العنونة، وطريقة الترميز اليدوي، وجدول الـ opcodes، كلها بضغطة زر: اضغط ${c('?')}.`,
    ],
    act: { load: 'sum1to5', steps: 0, reference: true },
  },
];

export function DemoBar({ at, go, close, lang }: { at: number; go: (i: number) => void; close: () => void; lang: Lang }) {
  const s = DEMO[at];
  const k = lang === 'ar' ? 1 : 0;
  return (
    <section className="demo" aria-live="polite">
      <div className="demo-top">
        <span className="label">{L(lang, 'Demo', 'جولة')} · {at + 1} {L(lang, 'of', 'من')} {DEMO.length}</span>
        <div className="dots">
          {DEMO.map((d, i) => <button key={i} className={i === at ? 'on' : ''} onClick={() => go(i)} aria-label={`${L(lang, 'Demo step', 'خطوة')} ${i + 1}: ${d.title[k]}`} />)}
        </div>
        <button className="link icon" onClick={close} aria-label={L(lang, 'Close demo', 'إغلاق الجولة')}><X size={18} /></button>
      </div>
      <h3>{s.title[k]}</h3>
      <p>{s.say[k]}</p>
      <div className="demo-nav">
        <button className="btn" onClick={() => go(at - 1)} disabled={at === 0}>{lang === 'ar' ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}<span>{L(lang, 'Previous', 'السابق')}</span></button>
        {at < DEMO.length - 1
          ? <button className="btn pri" onClick={() => go(at + 1)}><span>{L(lang, 'Next', 'التالي')}</span>{lang === 'ar' ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}</button>
          : <button className="btn pri" onClick={close}><span>{L(lang, 'Finish', 'إنهاء')}</span></button>}
      </div>
    </section>
  );
}
