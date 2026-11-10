import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { OPCODES } from './sicxe/opcodes.ts';
import { hex } from './explain.ts';
import { L, Lang } from './i18n.ts';

const REGS: [string, number, string, string][] = [
  ['A', 0, 'Accumulator: arithmetic and logic', 'المركم: العمليات الحسابية والمنطقية'],
  ['X', 1, 'Index register', 'سجل الفهرسة'],
  ['L', 2, 'Linkage: return address of JSUB', 'سجل الربط: عنوان الرجوع من JSUB'],
  ['B', 3, 'Base register for base-relative addressing', 'سجل القاعدة للعنونة النسبية للقاعدة'],
  ['S', 4, 'General working register', 'سجل عام'],
  ['T', 5, 'General working register', 'سجل عام'],
  ['F', 6, 'Floating-point accumulator (48 bits)', 'مركم الفاصلة العائمة (48 بت)'],
  ['PC', 8, 'Address of the NEXT instruction', 'عنوان التعليمة التالية'],
  ['SW', 9, 'Status word; condition code (CC) in it', 'كلمة الحالة، وفيها رمز الحالة CC'],
];

// Bit layout of each instruction format: [label, size en, size ar, fields as [name, width in bits]]
const FORMATS: [string, string, string, [string, number][]][] = [
  ['Format 1', '1 byte', 'بايت واحد', [['op', 8]]],
  ['Format 2', '2 bytes', 'بايتان', [['op', 8], ['r1', 4], ['r2', 4]]],
  ['Format 3', '3 bytes', '3 بايت', [['op', 6], ['n', 1], ['i', 1], ['x', 1], ['b', 1], ['p', 1], ['e', 1], ['disp', 12]]],
  ['Format 4', '4 bytes · written +OP', '4 بايت · تُكتب ‎+OP', [['op', 6], ['n', 1], ['i', 1], ['x', 1], ['b', 1], ['p', 1], ['e', 1], ['address', 20]]],
];

export function Reference({ onClose, lang }: { onClose: () => void; lang: Lang }) {
  const T = (en: string, ar: string) => L(lang, en, ar);
  const [q, setQ] = useState('');
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const ops = Object.values(OPCODES)
    .filter((o) => !q || o.mnemonic.includes(q.toUpperCase()) || o.description.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.opcode - b.opcode);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={T('SIC/XE reference', 'مرجع SIC/XE')} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-h">
          <div><h2>{T('SIC/XE reference', 'مرجع SIC/XE')}</h2><p className="hint">Leland Beck, System Software · {T('press Esc to close', 'اضغط Esc للإغلاق')}</p></div>
          <button className="link icon" onClick={onClose} aria-label={T('Close', 'إغلاق')}><X size={20} /></button>
        </header>

        <section>
          <h3>{T('Encode an instruction by hand', 'ترميز تعليمة يدوياً')}</h3>
          {lang === 'ar' ? (
            <ol className="steps">
              <li><b>الـ format والطول.</b> format 2 لتعليمات السجلات، وعلامة <code>+</code> تعني format 4 (4 بايت)، وغير ذلك format 3 (3 بايت).</li>
              <li><b>الـ opcode مع n و i.</b> خذ الـ opcode من الجدول؛ آخر بتين فيه يُستبدلان بـ <code>n i</code>: <code>#</code> ← <code>01</code>، و<code>@</code> ← <code>10</code>، وبدونهما ← <code>11</code>.</li>
              <li><b><code>PC</code> = عنوان هذه التعليمة + طولها.</b> الـ <code>PC</code> يشير دائماً إلى التعليمة <i>التالية</i>.</li>
              <li><b>الإزاحة.</b> جرّب النسبية للعداد: <code>disp = TA − PC</code>، ويجب أن تكون بين <code>−2048..2047</code> (السالب بالمتمم الثنائي في 12 بت). وإلا فالنسبية للقاعدة: <code>disp = TA − B</code>، بين <code>0..4095</code>. وإن لم تصلح أي منهما فاستخدم format 4.</li>
              <li><b>اكتبها.</b> <code>op(6) n i x b p e disp</code> بالثنائي، ثم قسّمها إلى مجموعات من أربع بتات بالـ hex. مثال: <code>LDB #LENGTH</code> عند <code>0003</code> و <code>LENGTH = 0033</code> ← <code>69202D</code>.</li>
            </ol>
          ) : (
            <ol className="steps">
              <li><b>Format and length.</b> Format 2 for register instructions, <code>+</code> means format 4 (4 bytes), otherwise format 3 (3 bytes).</li>
              <li><b>Opcode + n,i.</b> Take the opcode from the table; its last two bits are replaced by <code>n i</code>: <code>#</code> → 01, <code>@</code> → 10, plain → 11.</li>
              <li><b>PC = address of this instruction + its length.</b> PC always points to the <i>next</i> instruction.</li>
              <li><b>Displacement.</b> Try PC-relative: <code>disp = TA − PC</code>, must be −2048..2047 (negative → 12-bit two's complement). If not, base-relative: <code>disp = TA − B</code>, must be 0..4095. If neither fits, use format 4.</li>
              <li><b>Write it out.</b> <code>op(6) n i x b p e disp</code> in binary, then group into hex. Example: <code>LDB #LENGTH</code> at 0003, LENGTH = 0033 → <code>69202D</code>.</li>
            </ol>
          )}
        </section>

        <section>
          <h3>{T('Instruction formats', 'صيغ التعليمات')}</h3>
          {FORMATS.map(([name, en, ar, fields]) => (
            <div key={name} className="fmt">
              <div className="fmt-n"><b>{name}</b><span className="hint">{T(en, ar)}</span></div>
              <div className="bits" dir="ltr">
                {fields.map(([f, w]) => <span key={f} style={{ flexGrow: w }} className={w === 1 ? 'bit' : ''}>{f}<small>{w}</small></span>)}
              </div>
            </div>
          ))}
        </section>

        <section className="two">
          <div>
            <h3>{T('Addressing: n i bits', 'العنونة: البتان n i')}</h3>
            <table className="sym">
              <thead><tr><th>n i</th><th>{T('Mode', 'النوع')}</th><th>{T('Operand used', 'القيمة المستخدمة')}</th></tr></thead>
              <tbody>
                <tr><td>0 1</td><td>{T('Immediate', 'فورية')} <code>#</code></td><td>{T('TA itself (no memory read)', 'TA نفسه (بدون قراءة الذاكرة)')}</td></tr>
                <tr><td>1 1</td><td>{T('Simple', 'بسيطة')}</td><td>{T('word at TA', 'الكلمة عند TA')}</td></tr>
                <tr><td>1 0</td><td>{T('Indirect', 'غير مباشرة')} <code>@</code></td><td>{T('word at (word at TA)', 'الكلمة عند (الكلمة عند TA)')}</td></tr>
                <tr><td>0 0</td><td>{T('SIC compatible', 'متوافقة مع SIC')}</td><td>{T('15-bit address, word at it', 'عنوان 15 بت، والكلمة عنده')}</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3>{T('Target address: x b p e bits', 'عنوان الهدف: البتات x b p e')}</h3>
            <table className="sym">
              <thead><tr><th>{T('Bit', 'البت')}</th><th>{T('Rule', 'القاعدة')}</th></tr></thead>
              <tbody>
                <tr><td>p = 1</td><td dir="ltr">TA = PC + disp &nbsp;(−2048..2047)</td></tr>
                <tr><td>b = 1</td><td dir="ltr">TA = B + disp &nbsp;(0..4095)</td></tr>
                <tr><td>b = p = 0</td><td>{T('TA = disp (direct)', 'TA = disp (مباشر)')}</td></tr>
                <tr><td>x = 1</td><td>{T('add X to TA (indexed, ', 'أضف X إلى TA (فهرسية، ')}<code>,X</code>)</td></tr>
                <tr><td>e = 1</td><td>{T('format 4: TA = 20-bit address', 'format 4: TA عنوان من 20 بت')}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="two">
          <div>
            <h3>{T('Registers', 'السجلات')}</h3>
            <table className="sym">
              <thead><tr><th>{T('Reg', 'السجل')}</th><th>{T('No.', 'رقمه')}</th><th>{T('Use', 'الاستخدام')}</th></tr></thead>
              <tbody>{REGS.map(([r, n, en, ar]) => <tr key={r}><td>{r}</td><td>{n}</td><td>{T(en, ar)}</td></tr>)}</tbody>
            </table>
          </div>
          <div>
            <h3>{T('Condition code and directives', 'رمز الحالة والتوجيهات')}</h3>
            <table className="sym">
              <tbody>
                <tr><td>CC</td><td>{T('Set by COMP, COMPR, TIX, TIXR: LT, EQ or GT. JLT / JEQ / JGT test it.', 'تضبطه COMP و COMPR و TIX و TIXR: ‏LT أو EQ أو GT. وتختبره JLT / JEQ / JGT.')}</td></tr>
                <tr><td>START / END</td><td>{T('Program name and start address / end and first instruction', 'اسم البرنامج وعنوان بدايته / النهاية وأول تعليمة')}</td></tr>
                <tr><td>BYTE</td><td><code>C'EOF'</code> → 454F46, <code>X'F1'</code> → F1</td></tr>
                <tr><td>WORD</td><td>{T('One 3-byte constant', 'ثابت واحد من 3 بايت')}</td></tr>
                <tr><td>RESB / RESW</td><td>{T('Reserve n bytes / n words (no object code)', 'حجز n بايت / n كلمة (بدون كود آلة)')}</td></tr>
                <tr><td>BASE</td><td>{T('Tells the assembler what B will hold', 'تخبر المجمّع بقيمة B')}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3>
            {T('Opcode table', 'جدول الـ opcodes')}
            <input className="find" placeholder={T('Search, e.g. LD or compare', 'ابحث، مثلاً LD أو compare')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={T('Search opcodes', 'ابحث في الـ opcodes')} />
          </h3>
          <div className="optab">
            <table className="sym">
              <thead><tr><th>Mnemonic</th><th>Opcode</th><th>Format</th><th>{T('Effect', 'العمل')}</th></tr></thead>
              <tbody>
                {ops.map((o) => (
                  <tr key={o.mnemonic} className={o.isUnsupported ? 'off' : ''}>
                    <td>{o.mnemonic}</td><td>{hex(o.opcode, 2)}</td><td>{o.format}</td>
                    <td dir="ltr" style={{ textAlign: 'start' }}>{o.description.replace(' (unsupported)', '')}{o.isUnsupported && <span className="hint"> · {T('not simulated', 'غير مدعومة في المحاكي')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
