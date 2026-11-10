import React from 'react';
import { Play } from 'lucide-react';
import { AsmTrace, Field, partialRecords } from './asmTrace.ts';
import { hex } from './explain.ts';
import { L, Lang } from './i18n.ts';

// The instruction as 0s and 1s, one coloured box per field, then the same bits in groups of four with their hex digit.
export function BitStrip({ fields, hex: hx, lang }: { fields: Field[]; hex: string; lang: Lang }) {
  const all = fields.map((f) => f.bits).join('');
  const tones = fields.flatMap((f) => Array.from(f.bits, () => f.tone));
  const nibbles = all.match(/.{1,4}/g) ?? [];
  return (
    <div className="bitstrip" dir="ltr" role="group" aria-label={L(lang, 'Instruction bits', 'بتات التعليمة')}>
      <div className="bs-fields">
        {fields.map((f, k) => (
          <div key={k} className={'bs-f t-' + f.tone} style={{ flexGrow: f.bits.length }}>
            <span className="bs-bits">{f.bits}</span>
            <span className="bs-name">{f.name}</span>
          </div>
        ))}
      </div>
      <div className="bs-nib" aria-hidden="true">
        {nibbles.map((n, k) => (
          <div key={k} className="bs-n">
            <span className="bs-bits">{Array.from(n).map((c, j) => <i key={j} className={'t-' + tones[k * 4 + j]}>{c}</i>)}</span>
            <b>{parseInt(n, 2).toString(16).toUpperCase()}</b>
          </div>
        ))}
      </div>
      <p className="bs-hex">= <b>{hx}</b> <span className="hint">({all.length} bits · {all.length / 8} bytes)</span></p>
    </div>
  );
}

const FLOW: [string, string][] = [['Source', 'المصدر'], ['Pass 1', 'Pass 1'], ['Pass 2', 'Pass 2'], ['Object program', 'Object program'], ['Loader', 'Loader'], ['CPU', 'المعالج']];

// What the assembler is doing at step `at`
export function AsmPanel({ trace, at, onRun, lang }: { trace: AsmTrace; at: number; onRun: () => void; lang: Lang }) {
  const T = (en: string, ar: string) => L(lang, en, ar);
  const s = trace.steps[at];
  const r = trace.result;
  const stage = s.phase === 'start' ? 0 : s.phase === 'p1' || s.phase === 'p1done' ? 1 : s.phase === 'p2' ? 2 : 3;
  return (
    <div className="asm">
      <ol className="flow" aria-label={T('Where we are', 'أين نحن')}>
        {FLOW.map(([en, ar], k) => <li key={en} className={k === stage ? 'on' : k < stage ? 'past' : ''} aria-current={k === stage ? 'step' : undefined}>{T(en, ar)}</li>)}
      </ol>

      {s.phase === 'start' && (
        <div className="passes">
          <div className="pass"><b>Pass 1</b><span>{T('gives every line an address (LOCCTR) and fills SYMTAB with the labels.', 'يعطي كل سطر عنواناً (LOCCTR) ويملأ SYMTAB بالـ labels.')}</span></div>
          <div className="pass"><b>Pass 2</b><span>{T('turns every line into bits and hex, and writes the object program.', 'يحوّل كل سطر إلى بتات و hex، ويكتب الـ object program.')}</span></div>
        </div>
      )}

      {s.phase === 'p1' && (
        <div className="p1">
          <div className="locctr" dir="ltr">
            <span className="label">LOCCTR</span>
            <span className="big2">{hex(s.locBefore!)} <span className="arrow">→</span> {hex(s.locAfter!)}</span>
          </div>
          <p className="rule">{s.rule}</p>
          {s.newSymbol && <p className="note ok">{T('New in SYMTAB:', 'جديد في SYMTAB:')} <b dir="ltr">{s.newSymbol} = {hex(s.locBefore!)}</b></p>}
          {s.forward && <p className="note warn">{T('Forward reference:', 'مرجع أمامي:')} <b dir="ltr">{s.forward}</b> {T('is used here but defined further down. Pass 1 cannot know its address yet.', 'مستخدم هنا لكنه معرّف في الأسفل. Pass 1 لا يعرف عنوانه بعد.')}</p>}
        </div>
      )}

      {s.phase === 'p1done' && (
        <div className="locctr" dir="ltr">
          <span className="label">{T('Program length', 'Program length')}</span>
          <span className="big2">{hex(r.startAddress + r.programLength)} − {hex(r.startAddress)} <span className="arrow">=</span> {hex(r.programLength)}</span>
        </div>
      )}

      {s.phase === 'p2' && s.enc && (
        <div className="p2">
          <ol className="how">{s.enc.how.map((x, k) => <li key={k} className={x.tone ? 't-' + x.tone : 'plain'}>{x.t}</li>)}</ol>
          <BitStrip fields={s.enc.fields} hex={s.enc.hex} lang={lang} />
        </div>
      )}

      {s.phase === 'done' && (
        <div className="done">
          <pre className="p objp" dir="ltr">{r.objectProgram!.fullText}</pre>
          <button className="btn pri" onClick={onRun}><Play size={18} /><span>{T('Load it and run', 'حمّله ونفّذه')}</span></button>
        </div>
      )}
    </div>
  );
}

// SYMTAB as it is at this step: rows appear as Pass 1 reaches each label
export function SymtabCard({ trace, at, lang }: { trace: AsmTrace; at: number; lang: Lang }) {
  const T = (en: string, ar: string) => L(lang, en, ar);
  const seen = trace.steps.slice(0, at + 1).filter((s) => s.phase === 'p1' && s.newSymbol).map((s) => s.newSymbol!);
  const all = trace.result.symbolList;
  const p1Over = trace.steps.slice(0, at + 1).some((s) => s.phase === 'p1done');
  const now = trace.steps[at];
  const using = now.phase === 'p2' && now.enc ? trace.result.listing[now.line!].operand?.replace(/^[#@]/, '').replace(/,\s*X$/i, '').trim() : undefined;
  const rows = all.filter((r) => p1Over || seen.includes(r.name));
  return (
    <section className="card">
      <h2>SYMTAB <span className="hint">{p1Over ? T('complete', 'مكتمل') : `${T('filled by Pass 1', 'يملؤه Pass 1')} · ${rows.length}/${all.length}`}</span></h2>
      {rows.length ? (
        <table className="sym" dir="ltr">
          <thead><tr><th>Symbol</th><th>Address</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className={(now.newSymbol === r.name ? 'fresh' : '') + (using === r.name ? ' use' : '')}>
                <td>{r.name}</td><td>{hex(r.address)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="hint">{T('Empty. Labels are added as Pass 1 meets them.', 'فارغ. الـ labels تُضاف عندما يصل إليها Pass 1.')}</p>}
      {using && all.some((r) => r.name === using) && <p className="hint" style={{ marginTop: 10 }}>{T('Pass 2 looks up', 'Pass 2 يبحث هنا عن')} <b dir="ltr">{using}</b>{T(' here.', '.')}</p>}
    </section>
  );
}

// The object program as Pass 2 writes it
export function ObjCard({ trace, at, lang }: { trace: AsmTrace; at: number; lang: Lang }) {
  const T = (en: string, ar: string) => L(lang, en, ar);
  const recs = partialRecords(trace, at);
  return (
    <section className="card">
      <h2>Object program <span className="hint">H · T · M · E</span></h2>
      {recs.length
        ? <pre className="p objp" dir="ltr">{recs.map((r, k) => <div key={k} className={r.fresh ? 'fresh' : ''}>{r.text}</div>)}</pre>
        : <p className="hint">{T('Nothing yet. Pass 1 only measures; the object program is written in Pass 2.', 'لا شيء بعد. Pass 1 يقيس فقط، والـ object program يُكتب في Pass 2.')}</p>}
    </section>
  );
}
