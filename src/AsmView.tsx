import React from 'react';
import { Play } from 'lucide-react';
import { AsmTrace, Field, partialRecords } from './asmTrace.ts';
import { hex } from './explain.ts';

// The instruction as 0s and 1s, one coloured box per field, then the same bits in groups of four with their hex digit.
export function BitStrip({ fields, hex: hx }: { fields: Field[]; hex: string }) {
  const all = fields.map((f) => f.bits).join('');
  const tones = fields.flatMap((f) => Array.from(f.bits, () => f.tone));
  const nibbles = all.match(/.{1,4}/g) ?? [];
  return (
    <div className="bitstrip">
      <div className="bs-fields">
        {fields.map((f, k) => (
          <div key={k} className={'bs-f t-' + f.tone} style={{ flexGrow: f.bits.length }}>
            <span className="bs-bits">{f.bits}</span>
            <span className="bs-name">{f.name}</span>
          </div>
        ))}
      </div>
      <div className="bs-nib">
        {nibbles.map((n, k) => (
          <div key={k} className="bs-n">
            <span className="bs-bits">{Array.from(n).map((c, j) => <i key={j} className={'t-' + tones[k * 4 + j]}>{c}</i>)}</span>
            <b>{parseInt(n, 2).toString(16).toUpperCase()}</b>
          </div>
        ))}
      </div>
      <p className="bs-hex">= <b>{hx}</b> <span className="hint">({all.length} bits, {all.length / 8} bytes)</span></p>
    </div>
  );
}

const FLOW = ['Source', 'Pass 1', 'Pass 2', 'Object program', 'Loader', 'CPU'];

// What the assembler is doing at step `at`
export function AsmPanel({ trace, at, onRun }: { trace: AsmTrace; at: number; onRun: () => void }) {
  const s = trace.steps[at];
  const stage = s.phase === 'start' ? 0 : s.phase === 'p1' || s.phase === 'p1done' ? 1 : s.phase === 'p2' ? 2 : 3;
  return (
    <div className="asm">
      <ol className="flow" aria-label="Where we are">
        {FLOW.map((f, k) => <li key={f} className={k === stage ? 'on' : k < stage ? 'past' : ''}>{f}</li>)}
      </ol>

      {s.phase === 'p1' && (
        <div className="p1">
          <div className="locctr">
            <span className="label">LOCCTR</span>
            <span className="big2">{hex(s.locBefore!)} <span className="arrow">→</span> {hex(s.locAfter!)}</span>
            <span className="rule">{s.rule}</span>
          </div>
          {s.newSymbol && <p className="note ok">New in SYMTAB: <b>{s.newSymbol} = {hex(s.locBefore!)}</b></p>}
          {s.forward && <p className="note warn">Forward reference: <b>{s.forward}</b> is used here but defined further down. Pass 1 cannot know its address yet.</p>}
        </div>
      )}

      {s.phase === 'p2' && s.enc && (
        <div className="p2">
          <ol className="how">{s.enc.how.map((t, k) => <li key={k}>{t}</li>)}</ol>
          <BitStrip fields={s.enc.fields} hex={s.enc.hex} />
        </div>
      )}
      {s.phase === 'p2' && !s.enc && <p className="say">{s.say}</p>}

      {(s.phase === 'start' || s.phase === 'p1done') && <p className="say">{s.say}</p>}

      {s.phase === 'done' && (
        <div className="done">
          <p className="say">{s.say}</p>
          <button className="btn pri" onClick={onRun}><Play size={18} /><span>Load it and run</span></button>
        </div>
      )}
    </div>
  );
}

// SYMTAB as it is at this step: rows appear as Pass 1 reaches each label
export function SymtabCard({ trace, at }: { trace: AsmTrace; at: number }) {
  const seen = trace.steps.slice(0, at + 1).filter((s) => s.phase === 'p1' && s.newSymbol).map((s) => s.newSymbol!);
  const all = trace.result.symbolList;
  const p1Over = trace.steps.slice(0, at + 1).some((s) => s.phase === 'p1done');
  const now = trace.steps[at];
  const using = now.phase === 'p2' && now.enc ? trace.result.listing[now.line!].operand?.replace(/^[#@]/, '').replace(/,\s*X$/i, '').trim() : undefined;
  const rows = all.filter((r) => p1Over || seen.includes(r.name));
  return (
    <section className="card">
      <h2>SYMTAB <span className="hint">{p1Over ? 'complete' : `filled by Pass 1 · ${rows.length} of ${all.length}`}</span></h2>
      {rows.length ? (
        <table className="sym">
          <thead><tr><th>Symbol</th><th>Address</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className={(now.newSymbol === r.name ? 'fresh' : '') + (using === r.name ? ' use' : '')}>
                <td>{r.name}</td><td>{hex(r.address)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="hint">Empty. Labels are added as Pass 1 meets them.</p>}
      {using && all.some((r) => r.name === using) && <p className="hint" style={{ marginTop: 10 }}>Pass 2 looks up {using} here.</p>}
    </section>
  );
}

// The object program as Pass 2 writes it
export function ObjCard({ trace, at }: { trace: AsmTrace; at: number }) {
  const recs = partialRecords(trace, at);
  return (
    <section className="card wide">
      <h2>Object program <span className="hint">written by Pass 2 · H header, T text (code), M modification, E end</span></h2>
      {recs.length
        ? <pre className="p objp">{recs.map((r, k) => <div key={k} className={r.fresh ? 'fresh' : ''}>{r.text}</div>)}</pre>
        : <p className="hint">Nothing yet. Pass 1 only measures; the object program is written in Pass 2.</p>}
    </section>
  );
}
