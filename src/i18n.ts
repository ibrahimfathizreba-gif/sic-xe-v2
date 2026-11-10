// English / Arabic. English is the default; the choice is remembered in this browser.
export type Lang = 'en' | 'ar';

// Pick the text for the current language
export const L = (lang: Lang, en: string, ar: string) => (lang === 'ar' ? ar : en);

// Inside Arabic text, code, hex and arithmetic must keep left-to-right order:
// wrap them in a Unicode isolate (LRI … PDI) so "0014 − 000B" never turns around.
export const ltr = (s: string | number) => `⁦${s}⁩`;

export function loadLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'ar' || q === 'en') return q;
    const s = window.localStorage.getItem('sicxe-lang');
    return s === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

export function saveLang(lang: Lang) {
  try { window.localStorage.setItem('sicxe-lang', lang); } catch { /* private mode: not remembered */ }
}

// Interface text. Keys are short English names.
const UI = {
  assemble: ['Assemble', 'التجميع'],
  run: ['Run', 'التنفيذ'],
  example: ['Example', 'المثال'],
  ownProgram: ['Your program', 'برنامجك'],
  demo: ['Demo', 'جولة'],
  reference: ['Reference', 'المرجع'],
  back: ['Back', 'رجوع'],
  step: ['Step', 'خطوة'],
  play: ['Play', 'تشغيل'],
  pause: ['Pause', 'إيقاف'],
  reset: ['Reset', 'من البداية'],
  slow: ['Slow', 'بطيء'],
  normal: ['Normal', 'عادي'],
  fast: ['Fast', 'سريع'],
  program: ['Program', 'البرنامج'],
  loadCode: ['Load code', 'تحميل كود'],
  edit: ['Edit', 'تعديل'],
  cancel: ['Cancel', 'إلغاء'],
  load: ['Load', 'تحميل'],
  assembleBtn: ['Assemble', 'جمّع'],
  srcAsm: ['Assembly', 'أسمبلي'],
  srcHex: ['Raw hex', 'Hex مباشر'],
  srcObj: ['Object program', 'Object program'],
  loc: ['LOC', 'العنوان'],
  source: ['Source', 'المصدر'],
  objCode: ['Object code', 'كود الآلة'],
  fixFirst: ['Fix these first', 'صحّح هذه أولاً'],
  line: ['Line', 'سطر'],
  registers: ['Registers', 'السجلات'],
  lastCompare: ['Last comparison', 'نتيجة آخر مقارنة'],
  decoder: ['Instruction decoder', 'فك التعليمة'],
  inspecting: ['Inspecting instruction', 'فحص تعليمة'],
  backToNext: ['Back to next', 'رجوع للتالية'],
  noDecode: ['No instruction to decode right now.', 'لا توجد تعليمة لفكها الآن.'],
  memory: ['Memory', 'الذاكرة'],
  symtab: ['Symbol table', 'جدول الرموز'],
  objProg: ['Object program', 'Object program'],
  log: ['Execution log', 'سجل التنفيذ'],
  showAddr: ['Show address (hex)', 'اعرض عنواناً (hex)'],
  go: ['Go', 'اذهب'],
  clear: ['Clear', 'مسح'],
  copyLog: ['Copy log', 'نسخ السجل'],
  copied: ['Copied', 'تم النسخ'],
  nothingRan: ['Nothing has run yet.', 'لم يُنفَّذ شيء بعد.'],
  board3d: ['3D machine view', 'المعالج ثلاثي الأبعاد'],
  show3d: ['Show 3D view', 'اعرض المعالج ثلاثي الأبعاد'],
  hide3d: ['Hide 3D view', 'أخفِ المعالج ثلاثي الأبعاد'],
  ready: ['Ready. Press Step to run the first instruction', 'جاهز. اضغط خطوة لتنفيذ أول تعليمة'],
  nextInstr: ['Next instruction · step', 'التعليمة التالية · خطوة'],
  justRan: ['Just ran', 'نُفّذت للتو'],
  finished: ['Finished after', 'انتهى بعد'],
  stopped: ['Stopped after', 'توقف بعد'],
  steps: ['steps', 'خطوة'],
  notInstr: ['This byte is not a valid instruction.', 'هذا البايت ليس تعليمة صحيحة.'],
  timeHint: ['drag to travel through the program', 'اسحب للتنقل في البرنامج'],
  asmTimeHint: ['Pass 1, then Pass 2', 'Pass 1 ثم Pass 2'],
  stepOf: ['step', 'خطوة'],
  of: ['of', 'من'],
  langBtn: ['عربي', 'English'],
  langLabel: ['Switch to Arabic', 'التبديل إلى الإنجليزية'],
  modeLabel: ['Mode', 'الوضع'],
  examplesLabel: ['Example programs', 'برامج جاهزة'],
  controls: ['Controls', 'التحكم'],
  speed: ['Speed', 'السرعة'],
  clickAsm: ['click a line to see how the assembler handles it', 'اضغط على سطر لترى كيف يعالجه المجمّع'],
  clickRun: ['click a line to inspect it, the dot to set a breakpoint', 'اضغط على سطر لفحصه، وعلى النقطة لوضع نقطة توقف'],
  disasm: ['disassembled from machine code', 'مفكوك من كود الآلة'],
  hexHelp: ['Machine code in hex, spaces allowed. It is loaded into memory as-is and disassembled, which is how you check a "decode this" exercise.', 'كود آلة بالـ hex، والمسافات مسموحة. يُحمَّل في الذاكرة كما هو ثم يُفك، وهكذا تتحقق من سؤال "فك هذه التعليمة".'],
  startAddr: ['Start address (hex)', 'عنوان البداية (hex)'],
  objHelp: ['A Beck object program: H, T, M and E records, with or without ^ between fields.', 'Object program بصيغة Beck: سجلات H و T و M و E، مع ^ بين الحقول أو بدونها.'],
  noSymbols: ['No symbols: this program was loaded as machine code, without source.', 'لا توجد رموز: هذا البرنامج حُمّل ككود آلة بدون مصدر.'],
  noObj: ['Loaded as raw hex, so there is no object program.', 'حُمّل كـ hex مباشر، فلا يوجد object program.'],
  loadFirst: ['Load a valid program first.', 'حمّل برنامجاً صحيحاً أولاً.'],
  asmOnly: ['Only assembly source can be assembled', 'يمكن تجميع كود الأسمبلي فقط'],
} as const;

export type UIKey = keyof typeof UI;
export const ui = (lang: Lang) => (k: UIKey) => UI[k][lang === 'ar' ? 1 : 0];
