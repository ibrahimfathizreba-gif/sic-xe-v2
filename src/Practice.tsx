import React, { useMemo, useState } from 'react';
import { Check, Eye, RefreshCw, X } from 'lucide-react';
import { Answer, check, FieldKey, makeProblem, MISTAKE_NAMES, Result, Topic, TOPICS } from './practice.ts';
import { BitStrip } from './AsmView.tsx';
import { hex } from './explain.ts';
import { L, Lang } from './i18n.ts';

type Kind = 'encode' | 'decode';
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

// One 0/1 switch for a flag bit
function Bit({ name, v, set, tone }: { name: string; v?: number; set: (n: number) => void; tone: string }) {
  return (
    <div className={'bitpick t-' + tone}>
      <span>{name}</span>
      <div role="group" aria-label={name}>
        {[0, 1].map((b) => <button key={b} type="button" aria-pressed={v === b} className={v === b ? 'on' : ''} onClick={() => set(b)}>{b}</button>)}
      </div>
    </div>
  );
}

function Verdict({ r, k, lang }: { r: Result | null; k: FieldKey; lang: Lang }) {
  if (!r || r.ok[k] === undefined) return null;
  const m = r.mistakes.find((x) => x.key === k);
  return r.ok[k]
    ? <span className="verdict good"><Check size={15} /> {L(lang, 'right', 'صحيح')}</span>
    : <span className="verdict bad"><X size={15} /> {m?.msg}</span>;
}

export function Practice({ lang }: { lang: Lang }) {
  const T = (en: string, ar: string) => L(lang, en, ar);
  const [kind, setKind] = useState<Kind>('encode');
  const [topics, setTopics] = useState<Set<Topic>>(new Set(TOPICS.map(([t]) => t)));
  const [seed, setSeed] = useState(newSeed);
  const [a, setA] = useState<Answer>({});
  const [res, setRes] = useState<Result | null>(null);
  const [sol, setSol] = useState(false);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [counted, setCounted] = useState(false);
  const [tally, setTally] = useState<Record<string, number>>({});

  const pr = useMemo(() => {
    const list = TOPICS.map(([t]) => t).filter((t) => topics.has(t));
    const t = list[seed % list.length] ?? 'pc';
    return makeProblem(t, seed);
  }, [seed, topics]);

  const next = () => { setSeed(newSeed()); setA({}); setRes(null); setSol(false); setCounted(false); };
  const toggle = (t: Topic) => setTopics((s) => {
    const n = new Set(s);
    if (n.has(t) && n.size > 1) n.delete(t); else n.add(t);
    return n;
  });
  const set = (p: Partial<Answer>) => { setA((x) => ({ ...x, ...p })); setRes(null); };
  const doCheck = () => {
    const r = check(pr, a, kind, lang);
    setRes(r);
    if (!counted) {
      setCounted(true);
      setScore((s) => ({ right: s.right + (r.right ? 1 : 0), total: s.total + 1 }));
      setTally((tl) => { const n = { ...tl }; r.mistakes.forEach((m) => { n[m.code] = (n[m.code] ?? 0) + 1; }); return n; });
    }
    if (r.right) setSol(true);
  };

  const f = a.format;
  const showFields = f === 3 || f === 4;
  const tally2 = Object.entries(tally).sort((x, y) => y[1] - x[1]);

  return (
    <div className="practice">
      <section className="card">
        <div className="pr-head">
          <div className="seg" role="tablist" aria-label={T('Exercise type', 'نوع التمرين')}>
            <button role="tab" aria-selected={kind === 'encode'} className={kind === 'encode' ? 'on' : ''} onClick={() => { setKind('encode'); next(); }}>{T('Encode: assembly → hex', 'ترميز: أسمبلي ← hex')}</button>
            <button role="tab" aria-selected={kind === 'decode'} className={kind === 'decode' ? 'on' : ''} onClick={() => { setKind('decode'); next(); }}>{T('Decode: hex → assembly', 'فك: hex ← أسمبلي')}</button>
          </div>
          <span className="score" aria-live="polite">{T('Correct', 'صحيح')} <b dir="ltr">{score.right} / {score.total}</b></span>
        </div>
        <div className="topics" role="group" aria-label={T('Topics', 'المواضيع')}>
          {TOPICS.map(([t, en, ar]) => <button key={t} type="button" aria-pressed={topics.has(t)} className={'topic' + (topics.has(t) ? ' on' : '')} onClick={() => { toggle(t); setA({}); setRes(null); setSol(false); setCounted(false); }}>{T(en, ar)}</button>)}
        </div>
      </section>

      <div className="pr-grid">
        <section className="card question">
          <p className="label">{kind === 'encode' ? T('Encode this instruction', 'رمّز هذه التعليمة') : T('Decode this machine code', 'فك كود الآلة هذا')}</p>
          <p className="big" dir="ltr">{kind === 'encode' ? pr.instr : pr.hex}</p>
          <ul className="givens">
            <li>{T('The instruction is at address', 'التعليمة في العنوان')} <b dir="ltr">{hex(pr.loc)}</b></li>
            {kind === 'encode' && pr.givens.map((g) => <li key={g.name}>{g.name === 'B' ? T('Register B holds', 'السجل B فيه') : <><b dir="ltr">{g.name}</b> {T('is at address', 'عنوانه')}</>} <b dir="ltr">{hex(g.value)}</b>{g.name === 'B' && <span className="hint"> {T('(set by BASE)', '(من توجيه BASE)')}</span>}</li>)}
          </ul>

          <ol className="form">
            {kind === 'decode' && (
              <li className="t-op">
                <label>{T('Instruction (mnemonic)', 'التعليمة (mnemonic)')} <input dir="ltr" value={a.mnemonic ?? ''} onChange={(e) => set({ mnemonic: e.target.value })} placeholder="LDA" spellCheck={false} /></label>
                <Verdict r={res} k="mnemonic" lang={lang} />
              </li>
            )}
            <li className="t-e">
              <span className="q">{T('Format', 'الـ Format')}</span>
              <div className="seg small" role="group" aria-label="Format">
                {[2, 3, 4].map((n) => <button key={n} type="button" aria-pressed={f === n} className={f === n ? 'on' : ''} onClick={() => set({ format: n })}>{n}</button>)}
              </div>
              <Verdict r={res} k="format" lang={lang} />
            </li>

            {f === 2 && (
              <li className="t-reg">
                <span className="q">{T('Register numbers', 'أرقام السجلات')}</span>
                <label>r1 <input dir="ltr" className="short" value={a.r1 ?? ''} onChange={(e) => set({ r1: e.target.value })} placeholder="0" /></label>
                <label>r2 <input dir="ltr" className="short" value={a.r2 ?? ''} onChange={(e) => set({ r2: e.target.value })} placeholder="0" /></label>
                <Verdict r={res} k="r1" lang={lang} /><Verdict r={res} k="r2" lang={lang} />
              </li>
            )}

            {showFields && (
              <>
                <li className="t-ni"><span className="q">n i</span><div className="bits2" dir="ltr"><Bit name="n" v={a.n} set={(n) => set({ n })} tone="ni" /><Bit name="i" v={a.i} set={(i) => set({ i })} tone="ni" /></div><Verdict r={res} k="ni" lang={lang} /></li>
                <li className="t-x"><span className="q">x</span><div className="bits2" dir="ltr"><Bit name="x" v={a.x} set={(x) => set({ x })} tone="x" /></div><Verdict r={res} k="x" lang={lang} /></li>
                <li className="t-bp"><span className="q">b p</span><div className="bits2" dir="ltr"><Bit name="b" v={a.b} set={(b) => set({ b })} tone="bp" /><Bit name="p" v={a.p} set={(p) => set({ p })} tone="bp" /></div><Verdict r={res} k="bp" lang={lang} /></li>
                <li className="t-e"><span className="q">e</span><div className="bits2" dir="ltr"><Bit name="e" v={a.e} set={(e) => set({ e })} tone="e" /></div><Verdict r={res} k="e" lang={lang} /></li>
                <li className="t-disp">
                  <label>{f === 4 ? T('address (5 hex digits)', 'address (5 أرقام hex)') : T('disp (3 hex digits)', 'disp (3 أرقام hex)')} <input dir="ltr" value={a.value ?? ''} onChange={(e) => set({ value: e.target.value })} placeholder={f === 4 ? '01036' : '02D'} spellCheck={false} /></label>
                  <Verdict r={res} k="value" lang={lang} />
                </li>
              </>
            )}

            {kind === 'encode' && f !== undefined && (
              <li className="plain">
                <label>{T('Machine code (hex)', 'كود الآلة (hex)')} <input dir="ltr" value={a.hex ?? ''} onChange={(e) => set({ hex: e.target.value })} placeholder={f === 2 ? '9010' : f === 4 ? '4B101036' : '2F2009'} spellCheck={false} /></label>
                <Verdict r={res} k="hex" lang={lang} />
              </li>
            )}
          </ol>
          {f === undefined && <p className="hint">{T('Start with the format: the next fields depend on it.', 'ابدأ بالـ format: الحقول التالية تعتمد عليه.')}</p>}

          {res && <p className={'result ' + (res.right ? 'good' : 'bad')} aria-live="polite">{res.right ? T('All right. Well done.', 'كله صحيح. أحسنت.') : T(`${res.mistakes.length} to fix. The message under each field says why.`, `${res.mistakes.length} للتصحيح. السبب مكتوب تحت كل حقل.`)}</p>}

          <div className="pr-actions">
            <button className="btn pri" onClick={doCheck} disabled={f === undefined}><Check size={18} /><span>{T('Check', 'تحقق')}</span></button>
            <button className="btn" onClick={() => setSol((v) => !v)}><Eye size={18} /><span>{sol ? T('Hide solution', 'أخفِ الحل') : T('Show solution', 'اعرض الحل')}</span></button>
            <button className="btn" onClick={next}><RefreshCw size={18} /><span>{T('New question', 'سؤال جديد')}</span></button>
          </div>
        </section>

        <aside className="pr-side">
          {sol && (
            <section className="card">
              <h2>{T('Worked solution', 'الحل خطوة بخطوة')} <span className="hint" dir="ltr">{pr.instr} = {pr.hex}</span></h2>
              <ol className="how">{pr.enc.how.map((x, k) => <li key={k} className={x.tone ? 't-' + x.tone : 'plain'}>{x.t}</li>)}</ol>
              <BitStrip fields={pr.enc.fields} hex={pr.enc.hex} lang={lang} />
            </section>
          )}
          <section className="card">
            <h2>{T('Your mistakes so far', 'أخطاؤك حتى الآن')}</h2>
            {tally2.length
              ? <ul className="tally">{tally2.map(([code, n]) => <li key={code}><span>{T(...(MISTAKE_NAMES[code] ?? [code, code]))}</span><b dir="ltr">× {n}</b></li>)}</ul>
              : <p className="hint">{T('None yet. Each wrong answer is sorted by the rule it breaks, so you can see what to revise.', 'لا شيء بعد. كل إجابة خاطئة تُصنَّف حسب القاعدة التي خالفتها، لتعرف ماذا تراجع.')}</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
