import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, StepForward, RotateCcw, Pencil, Check, StepBack } from 'lucide-react';
import { Assembler } from './sicxe/assembler.ts';
import { CPU } from './sicxe/cpu.ts';
import { Memory } from './sicxe/memory.ts';
import { Registers, toSigned24 } from './sicxe/registers.ts';
import { Loader } from './sicxe/loader.ts';
import { Decoder } from './sicxe/decoder.ts';
import { EXAMPLES, ExampleProgram } from './sicxe/examples.ts';
import { AssemblerResult, ConditionCode, DecodedInstruction, RegisterId, StepResult } from './sicxe/types.ts';
import { explain, hex } from './explain.ts';
import { Stage3D } from './Stage3D.tsx';

const REGS: [RegisterId, string][] = [
  ['A', 'Accumulator'], ['X', 'Index'], ['L', 'Return address'], ['B', 'Base'],
  ['S', 'General'], ['T', 'General'], ['PC', 'Next instruction'], ['SW', 'Status word'],
];
const CC: Record<ConditionCode, string> = { LT: 'Less than', EQ: 'Equal', GT: 'Greater than' };
const FLAGS = [['n', 'Indirect'], ['i', 'Immediate'], ['x', 'Indexed'], ['b', 'Base'], ['p', 'PC-rel'], ['e', 'Extended']] as const;
const SPEEDS = [{ l: 'Slow', ms: 900 }, { l: 'Normal', ms: 350 }, { l: 'Fast', ms: 80 }];
const ZERO: Record<RegisterId, number> = { A: 0, X: 0, L: 0, B: 0, S: 0, T: 0, F: 0, PC: 0, SW: 1 };

export default function App() {
  const [mem] = useState(() => new Memory());
  const [regs] = useState(() => new Registers());
  const cpu = useRef<CPU | null>(null);
  if (!cpu.current) cpu.current = new CPU(mem, regs);

  const [ex, setEx] = useState<ExampleProgram>(EXAMPLES[0]);
  const [src, setSrc] = useState(EXAMPLES[0].source);
  const [editing, setEditing] = useState(false);
  const [asm, setAsm] = useState<AssemblerResult | null>(null);
  const [reg, setReg] = useState<Record<RegisterId, number>>(ZERO);
  const [cc, setCc] = useState<ConditionCode>('EQ');
  const [cur, setCur] = useState<DecodedInstruction | null>(null);
  const [last, setLast] = useState<StepResult | null>(null);
  const [steps, setSteps] = useState(0);
  const [halted, setHalted] = useState(false);
  const [reason, setReason] = useState('');
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(350);
  const [trace, setTrace] = useState<string[]>([]);
  const [tab, setTab] = useState<'mem' | 'sym' | 'obj' | 'log'>('mem');
  const [bp, setBp] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<number | null>(null);
  const [maxSteps, setMax] = useState(0);

  const sync = useCallback(() => {
    const c = cpu.current!;
    setReg(regs.cloneValues());
    setCc(regs.getConditionCode());
    setSteps(c.stepCount);
    setHalted(c.halted);
    setReason(c.haltReason ?? '');
    try { setCur(c.halted ? null : Decoder.decode(regs.get('PC'), mem, regs)); }
    catch { setCur(null); }
  }, [mem, regs]);

  const assemble = useCallback((code: string) => {
    setRunning(false);
    const res = Assembler.assemble(code);
    setAsm(res); setLast(null); setTrace([]); setMax(0); setSel(null);
    if (res.success && res.objectProgram) {
      mem.clear();
      regs.reset(res.startAddress);
      Loader.load(res.objectProgram, mem, regs);
      cpu.current = new CPU(mem, regs);
      cpu.current.setProgramBounds(res.startAddress, res.programLength);
    }
    sync();
  }, [mem, regs, sync]);

  const step = useCallback(() => {
    const c = cpu.current!;
    if (c.halted) return;
    try {
      const r = c.step();
      setLast(r);
      setTrace((t) => [...t, r.traceLine]);
      sync();
      setMax((m) => Math.max(m, c.stepCount));
      if (bp.has(regs.get('PC'))) { setRunning(false); setTrace((t) => [...t, `[Breakpoint] paused at 0x${hex(regs.get('PC'))}`]); }
    } catch (e) {
      setRunning(false);
      sync();
      setHalted(true);
      setReason(e instanceof Error ? e.message : String(e));
    }
  }, [sync, bp, regs]);

  const reset = useCallback(() => assemble(src), [assemble, src]);
  // Time travel: rebuild the machine and replay n steps
  const jump = useCallback((n: number) => {
    if (!asm?.success || !asm.objectProgram) return;
    setRunning(false);
    mem.clear(); regs.reset(asm.startAddress);
    Loader.load(asm.objectProgram, mem, regs);
    const c = new CPU(mem, regs);
    c.setProgramBounds(asm.startAddress, asm.programLength);
    cpu.current = c;
    let r: StepResult | null = null;
    const log: string[] = [];
    for (let i = 0; i < n && !c.halted; i++) {
      try { r = c.step(); log.push(r.traceLine); } catch { break; }
    }
    setLast(r); setTrace(log); sync();
    setMax((m) => Math.max(m, c.stepCount));
  }, [asm, mem, regs, sync]);
  const pick = (e: ExampleProgram) => { setEx(e); setSrc(e.source); setEditing(false); assemble(e.source); };

  useEffect(() => { assemble(EXAMPLES[0].source); }, []);
  useEffect(() => {
    if (!running) return;
    if (halted) { setRunning(false); return; }
    const t = setInterval(step, speed);
    return () => clearInterval(t);
  }, [running, halted, speed, step]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (steps > 0) jump(steps - 1); }
      else if (e.key === ' ' && !(t instanceof HTMLButtonElement)) { e.preventDefault(); setRunning((r) => !r); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [step, jump, steps]);

  const ok = !!asm?.success;
  const pc = reg.PC;
  const chRegs = last?.registerChanges ?? [];
  const chMem = last?.memoryChanges ?? [];
  const memStart = asm?.startAddress ?? 0;
  const base = Math.floor(memStart / 16) * 16;
  const rows = asm ? Math.min(Math.ceil((asm.programLength + memStart - base) / 16), 12) : 0;
  const toggleBp = (loc: number) => setBp((b) => { const n = new Set(b); if (n.has(loc)) n.delete(loc); else n.add(loc); return n; });
  const shown = (() => { if (sel === null) return cur; try { return Decoder.decode(sel, mem, regs); } catch { return null; } })();
  const fmt34 = shown && (shown.format === 3 || shown.format === 4);

  return (
    <div className="app">
      <header className="top" data-enter>
        <div className="brand"><b>SIC/XE</b> Lab</div>
        <nav className="chips" aria-label="Example programs">
          {EXAMPLES.map((e) => (
            <button key={e.id} className={'chip' + (e.id === ex.id ? ' on' : '')} onClick={() => pick(e)}>
              {e.title.split(' (')[0]}
            </button>
          ))}
        </nav>
      </header>

      <section className="now" data-enter aria-live="polite">
        {!ok && asm ? (
          <>
            <p className="label">Fix these first</p>
            {asm.errors.map((er, i) => <div key={i} className="msg bad">Line {er.line}: {er.message}</div>)}
          </>
        ) : halted ? (
          <>
            <p className="label">Finished after {steps} steps</p>
            <p className="big">A = {toSigned24(reg.A)}</p>
            <p className="say">{reason || 'The program stopped.'}</p>
          </>
        ) : (
          <>
            <p className="label">{steps === 0 ? 'Ready. Press Step to run the first instruction' : `Next instruction · step ${steps + 1}`}</p>
            <p className="big">{cur ? cur.disassembly : '…'}</p>
            <p className="say">{cur ? explain(cur) : ex.description}</p>
            {last && (
              <p className="did">
                <b>Just ran</b> {last.instruction.disassembly}
                {chRegs.filter((c) => c.reg !== 'PC').map((c) => ` · ${c.reg}: ${toSigned24(c.oldValue)} → ${toSigned24(c.newValue)}`)}
                {chMem.length > 0 && ` · memory at 0x${hex(chMem[0].address)} updated`}
              </p>
            )}
          </>
        )}
        {ok && (
          <div className="time">
            <input className="scrub" type="range" min={0} max={Math.max(maxSteps, 1)} value={steps} onChange={(e) => jump(+e.target.value)} aria-label="Timeline" />
            <span className="hint">step {steps} of {maxSteps || '?'} · drag to travel through the program</span>
          </div>
        )}
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>3D machine view</h2>
        <Stage3D reg={reg} chRegs={chRegs} chMem={chMem} mem={mem} base={base} rows={rows} pc={pc} halted={halted} last={last} steps={steps} />
      </section>

      <main className="grid">
        <section className="card">
          <h2>
            <span>Program <span className="hint">· click a line to inspect it, the dot to set a breakpoint</span></span>
            {editing
              ? <button className="link" onClick={() => { setEditing(false); assemble(src); }}><Check size={16} /> Assemble</button>
              : <button className="link" onClick={() => { setRunning(false); setEditing(true); }}><Pencil size={14} /> Edit</button>}
          </h2>
          {editing ? (
            <textarea className="ed" value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} aria-label="Assembly source" />
          ) : (
            asm?.listing.map((l) => (
              <div key={l.lineNo} className={'ln' + (!halted && ok && l.objectCode && l.loc === pc ? ' pc' : '') + (sel === l.loc && l.format ? ' sel' : '')} onClick={() => l.format && setSel((x) => (x === l.loc ? null : l.loc))}>
                <span className="a" title="Toggle breakpoint" onClick={(e) => { e.stopPropagation(); if (l.objectCode) toggleBp(l.loc); }}>{bp.has(l.loc) && l.objectCode ? <i>● </i> : ''}{l.objectCode ? hex(l.loc) : ''}</span>
                <code>{l.sourceText}</code>
                <span className="o">{l.objectCode}</span>
              </div>
            ))
          )}
        </section>

        <section className="card">
          <h2>Registers</h2>
          <div className="regs">
            {REGS.map(([id, desc]) => {
              const c = chRegs.find((x) => x.reg === id);
              const v = reg[id];
              return (
                <div key={id + (c ? steps : '')} className={'tile' + (c ? ' ch' : '')}>
                  <div className="n">{id}</div>
                  <div className="d">{desc}</div>
                  <div className="v">{id === 'PC' ? hex(v) : toSigned24(v)}</div>
                  <div className="x">{id === 'PC' ? '' : '0x' + hex(v)}</div>
                  {c && id !== 'PC' && <div className="was">was {toSigned24(c.oldValue)}</div>}
                </div>
              );
            })}
          </div>
          <p className="cc">Last comparison: <b>{CC[cc]}</b></p>
        </section>

        <section className="card wide">
          <h2>
            <span>{sel !== null ? 'Inspecting instruction' : 'Instruction decoder'} {shown && <span className="hint">Format {shown.format} · {shown.length} bytes · {shown.addressingMode}</span>}</span>
            {sel !== null && <button className="link" onClick={() => setSel(null)}>Back to next</button>}
          </h2>
          {shown ? (
            <>
              <p className="say" style={{ fontSize: 16, marginBottom: 14 }}>{explain(shown)}</p>
              <div className="dec">
                <div>
                  <p className="bytes">{shown.rawBytesHex.match(/.{1,2}/g)?.join(' ')}</p>
                  {fmt34 ? (
                    <div className="flags">
                      {FLAGS.map(([f, t]) => <div key={f} className={'fl' + (shown[f] ? ' on' : '')}>{f}={shown[f] ?? 0}<small>{t}</small></div>)}
                    </div>
                  ) : <p className="hint">{shown.format === 2 ? `Registers: ${shown.r1 ?? ''} ${shown.r2 ?? ''}` : 'Single-byte instruction'}</p>}
                </div>
                <p className="formula">
                  {shown.taFormula ?? shown.disassembly}
                  {shown.targetAddress !== undefined && <><br />Target address = 0x{hex(shown.targetAddress)}</>}
                </p>
              </div>
            </>
          ) : <p className="hint">No instruction to decode right now.</p>}
        </section>

        <section className="card wide">
          <div className="tabs" role="tablist">
            {([['mem', 'Memory'], ['sym', 'Symbol table'], ['obj', 'Object program'], ['log', 'Execution log']] as const).map(([k, t]) => (
              <button key={k} role="tab" className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{t}</button>
            ))}
          </div>
          {tab === 'mem' && (
            <div className="mwrap">
              {Array.from({ length: rows }, (_, r) => (
                <div key={r} className="mrow">
                  <span className="ma">{hex(base + r * 16, 5)}</span>
                  {Array.from({ length: 16 }, (_, i) => {
                    const a = base + r * 16 + i;
                    const ch = chMem.some((m) => a >= m.address && a < m.address + m.newBytes.length);
                    return <span key={a + (ch ? 'c' + steps : '')} title={'0x' + hex(a)} className={'b' + (ch ? ' ch' : '') + (a === pc && !halted ? ' pc' : '')}>{hex(mem.getByte(a), 2)}</span>;
                  })}
                </div>
              ))}
            </div>
          )}
          {tab === 'sym' && (
            <table className="sym"><thead><tr><th>Label</th><th>Address</th><th>Defined on</th></tr></thead>
              <tbody>{asm?.symbolList.map((s) => <tr key={s.name}><td>{s.name}</td><td>0x{hex(s.address)}</td><td>line {s.definedLine}</td></tr>)}</tbody></table>
          )}
          {tab === 'obj' && <pre className="p">{asm?.objectProgram?.fullText ?? 'Assemble a valid program first.'}</pre>}
          {tab === 'log' && <pre className="p">{trace.length ? trace.join('\n') : 'Nothing has run yet.'}</pre>}
        </section>
      </main>

      <div className="dock" role="toolbar" aria-label="Controls">
        <button className="btn" onClick={() => jump(steps - 1)} disabled={!ok || steps === 0} title="Back (←)"><StepBack size={18} /><span>Back</span></button>
        <button className="btn pri" onClick={step} title="Step (→)" disabled={!ok || halted}><StepForward size={18} /><span>Step</span></button>
        <button className="btn" onClick={() => setRunning((r) => !r)} disabled={!ok || halted}>
          {running ? <Pause size={18} /> : <Play size={18} />}<span>{running ? 'Pause' : 'Play'}</span>
        </button>
        <button className="btn" onClick={reset}><RotateCcw size={18} /><span>Reset</span></button>
        <div className="speed" role="group" aria-label="Speed">
          {SPEEDS.map((s) => <button key={s.l} className={speed === s.ms ? 'on' : ''} onClick={() => setSpeed(s.ms)}>{s.l}</button>)}
        </div>
      </div>
    </div>
  );
}
