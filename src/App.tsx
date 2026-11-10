import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, StepForward, RotateCcw, Pencil, Check, StepBack, BookOpen, Presentation, Copy, Upload } from 'lucide-react';
import { CPU } from './sicxe/cpu.ts';
import { Memory } from './sicxe/memory.ts';
import { Registers, toSigned24 } from './sicxe/registers.ts';
import { Decoder } from './sicxe/decoder.ts';
import { EXAMPLES } from './sicxe/examples.ts';
import { ConditionCode, DecodedInstruction, RegisterId, StepResult } from './sicxe/types.ts';
import { explain, hex } from './explain.ts';
import { Stage3D } from './Stage3D.tsx';
import { memRows } from './memRows.ts';
import { Built, LoadError, Program, Source, fromAssembly, fromHex, fromObject } from './program.ts';
import { AsmTrace, buildTrace, fieldsOf } from './asmTrace.ts';
import { AsmPanel, BitStrip, ObjCard, SymtabCard } from './AsmView.tsx';
import { Reference } from './Reference.tsx';
import { DEMO, DEMO_HEX, DemoAct, DemoBar, Tab } from './Demo.tsx';

const REGS: [RegisterId, string][] = [
  ['A', 'Accumulator'], ['X', 'Index'], ['L', 'Return address'], ['B', 'Base'],
  ['S', 'General'], ['T', 'General'], ['PC', 'Next instruction'], ['SW', 'Status word'],
];
const CC: Record<ConditionCode, string> = { LT: 'Less than', EQ: 'Equal', GT: 'Greater than' };
const FLAGS = [['n', 'Indirect'], ['i', 'Immediate'], ['x', 'Indexed'], ['b', 'Base'], ['p', 'PC-rel'], ['e', 'Extended']] as const;
const SPEEDS = [{ l: 'Slow', ms: 900 }, { l: 'Normal', ms: 350 }, { l: 'Fast', ms: 80 }];
const ZERO: Record<RegisterId, number> = { A: 0, X: 0, L: 0, B: 0, S: 0, T: 0, F: 0, PC: 0, SW: 1 };
const SOURCES: [Source, string][] = [['asm', 'Assembly'], ['hex', 'Raw hex'], ['obj', 'Object program']];
// Safety stop for Play: a program that loops forever (without a jump-to-self) halts here.
const MAX_STEPS = 5000;
const ascii = (b: number) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·');
type Mode = 'asm' | 'run';

export default function App() {
  const [mem] = useState(() => new Memory());
  const [regs] = useState(() => new Registers());
  const cpu = useRef<CPU>(new CPU(mem, regs));

  // What is loaded, and the text in each of the three editors
  const [prog, setProg] = useState<Program | null>(null);
  const [errors, setErrors] = useState<LoadError[]>([]);
  const [choice, setChoice] = useState(EXAMPLES[0].id); // highlighted chip: an example id, or 'own'
  const [src, setSrc] = useState(EXAMPLES[0].source);
  const [hexSrc, setHexSrc] = useState(DEMO_HEX);
  const [hexAddr, setHexAddr] = useState('0');
  const [objSrc, setObjSrc] = useState('');
  const [editing, setEditing] = useState<Source | null>(null);

  // Assemble mode: the assembler's steps and where we are in them
  const [mode, setMode] = useState<Mode>('asm');
  const [trace, setTrace] = useState<AsmTrace | null>(null);
  const [at, setAt] = useState(0);

  // Run mode: machine state shown on screen
  const [reg, setReg] = useState<Record<RegisterId, number>>(ZERO);
  const [cc, setCc] = useState<ConditionCode>('EQ');
  const [cur, setCur] = useState<DecodedInstruction | null>(null);
  const [last, setLast] = useState<StepResult | null>(null);
  const [steps, setSteps] = useState(0);
  const [halted, setHalted] = useState(false);
  const [reason, setReason] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [maxSteps, setMax] = useState(0);

  // Controls and panels
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(350);
  const [tab, setTab] = useState<Tab>('mem');
  const [bp, setBp] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<number | null>(null);
  const [showRef, setShowRef] = useState(false);
  const [demo, setDemo] = useState<number | null>(null);
  const [goto, setGoto] = useState('');
  const [gotoAddr, setGotoAddr] = useState<number | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  const sync = useCallback(() => {
    const c = cpu.current;
    setReg(regs.cloneValues());
    setCc(regs.getConditionCode());
    setSteps(c.stepCount);
    setHalted(c.halted);
    setReason(c.haltReason ?? '');
    try { setCur(c.halted ? null : Decoder.decode(regs.get('PC'), mem, regs)); }
    catch { setCur(null); }
  }, [mem, regs]);

  // Load a program and replay n instructions. Used by Reset, Back, the timeline and the demo.
  const boot = useCallback((p: Program, n: number) => {
    setRunning(false);
    p.load(mem, regs);
    const c = new CPU(mem, regs);
    c.setProgramBounds(p.start, p.length);
    cpu.current = c;
    let r: StepResult | null = null;
    const lines: string[] = [];
    for (let i = 0; i < n && !c.halted; i++) {
      try { r = c.step(); lines.push(r.traceLine); } catch { break; }
    }
    setLast(r); setLog(lines); sync();
    setMax((m) => Math.max(m, c.stepCount));
  }, [mem, regs, sync]);

  // Switch to a new program (or show why it could not be loaded). For assembly, also build the assembler's steps.
  const use = useCallback((b: Built, asmText?: string) => {
    setRunning(false); setSel(null); setMax(0); setGotoAddr(undefined); setAt(0);
    setErrors(b.errors);
    setProg(b.program);
    const t = b.program && asmText !== undefined ? buildTrace(asmText) : null;
    setTrace(t);
    if (!t) setMode('run');
    if (b.program) boot(b.program, 0);
    else { setLast(null); setLog([]); setCur(null); setHalted(false); }
    return { program: b.program, trace: t };
  }, [boot]);

  const step = useCallback(() => {
    const c = cpu.current;
    if (c.halted) return;
    if (c.stepCount >= MAX_STEPS) {
      c.halted = true;
      c.haltReason = `Stopped after ${MAX_STEPS} steps. The program may be stuck in an endless loop.`;
      setRunning(false);
      sync();
      return;
    }
    try {
      const r = c.step();
      setLast(r);
      setLog((t) => [...t, r.traceLine]);
      sync();
      setMax((m) => Math.max(m, c.stepCount));
      if (bp.has(regs.get('PC'))) { setRunning(false); setLog((t) => [...t, `[Breakpoint] paused at 0x${hex(regs.get('PC'))}`]); }
    } catch {
      // The CPU has already stopped itself, rewound PC and stored the reason.
      setRunning(false);
      sync();
    }
  }, [sync, bp, regs]);

  const jump = useCallback((n: number) => { if (prog) boot(prog, Math.max(0, n)); }, [prog, boot]);

  // The dock buttons and arrow keys act on whichever mode is showing
  const asmMode = mode === 'asm' && !!trace;
  const asmLast = trace ? trace.steps.length - 1 : 0;
  const forward = useCallback(() => {
    if (asmMode) setAt((a) => Math.min(asmLast, a + 1));
    else step();
  }, [asmMode, asmLast, step]);
  const backward = useCallback(() => {
    if (asmMode) setAt((a) => Math.max(0, a - 1));
    else if (steps > 0) jump(steps - 1);
  }, [asmMode, steps, jump]);
  const reset = () => { if (asmMode) { setRunning(false); setAt(0); } else if (prog) boot(prog, 0); };
  const atEnd = asmMode ? at >= asmLast : halted;

  const pick = (id: string) => {
    const e = EXAMPLES.find((x) => x.id === id)!;
    setChoice(id); setSrc(e.source); setEditing(null);
    return use(fromAssembly(e.source), e.source);
  };

  const openEditor = (s: Source) => {
    setRunning(false);
    if (s === 'obj' && !objSrc && prog?.objectText) setObjSrc(prog.objectText);
    setEditing(s);
  };
  const loadEditor = () => {
    if (!editing) return;
    const b = editing === 'asm' ? fromAssembly(src) : editing === 'hex' ? fromHex(hexSrc, hexAddr) : fromObject(objSrc);
    setChoice('own');
    if (use(b, editing === 'asm' ? src : undefined).program) {
      setEditing(null);
      if (editing === 'asm') setMode('asm');
    }
  };

  // Put the app into the state a demo step describes
  const act = (a: DemoAct) => {
    let r;
    if (a.load === 'hex') {
      setChoice('own'); setHexSrc(DEMO_HEX); setHexAddr('0'); setEditing(null);
      r = use(fromHex(DEMO_HEX, '0'));
    } else r = pick(a.load);
    if (a.asm && r.trace) {
      const want = a.asm;
      const k = r.trace.steps.findIndex((s) => s.phase === want.phase && (!want.text || (s.line !== undefined && r.trace!.result.listing[s.line].sourceText.includes(want.text))));
      setMode('asm'); setAt(Math.max(0, k));
    } else {
      setMode('run');
      if (r.program && a.steps) boot(r.program, a.steps);
    }
    setSel(a.sel ?? null);
    if (a.tab) setTab(a.tab);
    setShowRef(!!a.reference);
  };
  const goDemo = (i: number) => { const k = Math.max(0, Math.min(DEMO.length - 1, i)); setDemo(k); act(DEMO[k].act); };

  const copyLog = async () => {
    try { await navigator.clipboard.writeText(log.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setCopied(false); }
  };
  const doGoto = () => {
    const t = goto.trim(), a = parseInt(t, 16);
    setGotoAddr(/^[0-9A-Fa-f]{1,5}$/.test(t) && a < mem.size ? a : undefined);
  };

  useEffect(() => { pick(EXAMPLES[0].id); }, []);
  useEffect(() => {
    if (!running) return;
    if (atEnd) { setRunning(false); return; }
    const t = setInterval(forward, asmMode ? Math.max(speed * 2.5, 300) : speed);
    return () => clearInterval(t);
  }, [running, atEnd, speed, forward, asmMode]);
  useEffect(() => { setRunning(false); }, [mode]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) return;
      if (e.key === '?') { e.preventDefault(); setShowRef((v) => !v); return; }
      if (showRef) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); forward(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); backward(); }
      else if (e.key === ' ' && !(t instanceof HTMLButtonElement)) { e.preventDefault(); setRunning((r) => !r); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [forward, backward, showRef]);

  const ok = !!prog;
  const pc = reg.PC;
  const chRegs = last?.registerChanges ?? [];
  const chMem = last?.memoryChanges ?? [];
  const base = prog ? Math.floor(prog.start / 16) * 16 : 0;
  const progRows = prog ? Math.ceil((prog.length + prog.start - base) / 16) : 0;
  // Rows that must be visible: the instruction that ran, the next one, and any memory it read or wrote
  const focus = progRows ? [
    last?.pcBefore,
    halted ? undefined : pc,
    ...chMem.map((m) => m.address),
    last && last.instruction.format >= 3 && last.instruction.addressingMode !== 'immediate' ? last.instruction.targetAddress : undefined,
  ] : [];
  const boardRows = memRows(base, progRows, 8, focus);
  const tableRows = memRows(base, progRows, 12, [...focus, gotoAddr]);
  const toggleBp = (loc: number) => setBp((b) => { const n = new Set(b); if (n.has(loc)) n.delete(loc); else n.add(loc); return n; });
  const shown = (() => { if (sel === null) return cur; try { return Decoder.decode(sel, mem, regs); } catch { return null; } })();
  const fmt34 = shown && (shown.format === 3 || shown.format === 4);

  // Assemble mode: which listing lines Pass 1 / Pass 2 have reached
  const as = asmMode ? trace!.steps[at] : null;
  const done1 = new Set<number>(), done2 = new Set<number>();
  if (asmMode) trace!.steps.slice(0, at + 1).forEach((s) => { if (s.line !== undefined) (s.phase === 'p1' ? done1 : done2).add(s.line); });
  const pastP1 = asmMode && (as!.phase === 'p2' || as!.phase === 'p1done' || as!.phase === 'done');
  const phaseLabel = !as ? '' : as.phase === 'start' ? 'Assembler · before Pass 1'
    : as.phase === 'p1' ? `Pass 1 · line ${[...done1].length} of ${trace!.steps.filter((s) => s.phase === 'p1').length}`
    : as.phase === 'p1done' ? 'Pass 1 finished'
    : as.phase === 'p2' ? `Pass 2 · line ${[...done2].length} of ${trace!.steps.filter((s) => s.phase === 'p2').length}`
    : 'Assembly finished';
  // Clicking a line in Assemble mode jumps to where that line is handled
  const goLine = (idx: number) => {
    const phase = as && (as.phase === 'p1' || as.phase === 'start') ? 'p1' : 'p2';
    const k = trace!.steps.findIndex((s) => s.phase === phase && s.line === idx);
    if (k >= 0) setAt(k);
  };

  return (
    <div className="app">
      <header className="top" data-enter>
        <div className="brand"><b>SIC/XE</b> Lab</div>
        <div className="modes" role="tablist" aria-label="Mode">
          <button role="tab" className={asmMode ? 'on' : ''} disabled={!trace} onClick={() => setMode('asm')} title={trace ? '' : 'Only assembly source can be assembled'}><b>1</b> Assemble</button>
          <button role="tab" className={!asmMode ? 'on' : ''} disabled={!ok} onClick={() => setMode('run')}><b>2</b> Run</button>
        </div>
        <nav className="chips" aria-label="Example programs">
          {EXAMPLES.map((e) => (
            <button key={e.id} className={'chip' + (e.id === choice ? ' on' : '')} onClick={() => { setDemo(null); pick(e.id); }}>
              {e.title.split(' (')[0]}
            </button>
          ))}
          <span className="sep" />
          <button className="chip tool" onClick={() => (demo === null ? goDemo(0) : setDemo(null))}><Presentation size={15} /> Demo</button>
          <button className="chip tool" onClick={() => setShowRef(true)} title="Reference sheet (?)"><BookOpen size={15} /> Reference</button>
        </nav>
      </header>

      {demo !== null && <DemoBar at={demo} go={goDemo} close={() => setDemo(null)} />}

      <section className="now" data-enter aria-live="polite">
        {!ok && errors.length ? (
          <>
            <p className="label">Fix these first</p>
            {errors.map((er, i) => <div key={i} className="msg bad">{er.line ? `Line ${er.line}: ` : ''}{er.message}</div>)}
          </>
        ) : asmMode ? (
          <>
            <p className="label">{phaseLabel}</p>
            <p className="big">{as!.line !== undefined ? trace!.result.listing[as!.line].sourceText.trim().replace(/\s+/g, ' ') : as!.title}</p>
            <p className="say">{as!.phase === 'p2' && as!.enc ? `Turning this line into machine code: ${as!.enc.hex}` : as!.say}</p>
          </>
        ) : halted ? (
          <>
            <p className="label">{reason.includes('normal termination') ? 'Finished' : 'Stopped'} after {steps} steps</p>
            <p className="big">A = {toSigned24(reg.A)}</p>
            <p className="say">{reason || 'The program stopped.'}</p>
          </>
        ) : (
          <>
            <p className="label">{steps === 0 ? 'Ready. Press Step to run the first instruction' : `Next instruction · step ${steps + 1}`}</p>
            <p className="big">{cur ? cur.disassembly : '…'}</p>
            <p className="say">{cur ? explain(cur) : 'This byte is not a valid instruction.'}</p>
            {last && (
              <p className="did">
                <b>Just ran</b> {last.instruction.disassembly}
                {chRegs.filter((c) => c.reg !== 'PC').map((c) => ` · ${c.reg}: ${toSigned24(c.oldValue)} → ${toSigned24(c.newValue)}`)}
                {chMem.length > 0 && ` · memory at 0x${hex(chMem[0].address)} updated`}
              </p>
            )}
          </>
        )}
        {ok && (asmMode ? (
          <div className="time">
            <input className="scrub" type="range" min={0} max={asmLast} value={at} onChange={(e) => setAt(+e.target.value)} aria-label="Assembler timeline" />
            <span className="hint">step {at} of {asmLast} · Pass 1, then Pass 2</span>
          </div>
        ) : (
          <div className="time">
            <input className="scrub" type="range" min={0} max={Math.max(maxSteps, 1)} value={steps} onChange={(e) => jump(+e.target.value)} aria-label="Timeline" />
            <span className="hint">step {steps} of {maxSteps || '?'} · drag to travel through the program</span>
          </div>
        ))}
      </section>

      {asmMode ? (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2>Assembler <span className="hint">how the source becomes machine code</span></h2>
          <AsmPanel trace={trace!} at={at} onRun={() => setMode('run')} />
        </section>
      ) : (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2>3D machine view</h2>
          <Stage3D reg={reg} chRegs={chRegs} chMem={chMem} mem={mem} rowAddrs={boardRows} pc={pc} halted={halted} last={last} steps={steps} />
        </section>
      )}

      <main className="grid">
        <section className="card">
          <h2>
            <span>Program {!editing && <span className="hint">· {asmMode ? 'click a line to see how the assembler handles it' : `${prog && prog.source !== 'asm' ? 'disassembled from machine code · ' : ''}click a line to inspect it, the dot to set a breakpoint`}</span>}</span>
            {editing
              ? <span className="acts"><button className="link" onClick={() => setEditing(null)}>Cancel</button><button className="link" onClick={loadEditor}><Check size={16} /> {editing === 'asm' ? 'Assemble' : 'Load'}</button></span>
              : <span className="acts"><button className="link" onClick={() => openEditor('hex')}><Upload size={14} /> Load code</button><button className="link" onClick={() => openEditor('asm')}><Pencil size={14} /> Edit</button></span>}
          </h2>
          {editing ? (
            <>
              <div className="seg" role="tablist" aria-label="What to load">
                {SOURCES.map(([k, t]) => <button key={k} role="tab" className={editing === k ? 'on' : ''} onClick={() => openEditor(k)}>{t}</button>)}
              </div>
              {editing === 'asm' && <textarea className="ed" value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} aria-label="Assembly source" />}
              {editing === 'hex' && (
                <>
                  <p className="hint">Machine code in hex, spaces allowed. It is loaded into memory as-is and disassembled, which is how you check a "decode this" exercise.</p>
                  <label className="addr">Start address (hex) <input value={hexAddr} onChange={(e) => setHexAddr(e.target.value)} spellCheck={false} /></label>
                  <textarea className="ed short" value={hexSrc} onChange={(e) => setHexSrc(e.target.value)} spellCheck={false} aria-label="Machine code in hex" />
                </>
              )}
              {editing === 'obj' && (
                <>
                  <p className="hint">A Beck object program: H, T, M and E records, with or without ^ between fields.</p>
                  <textarea className="ed short" value={objSrc} onChange={(e) => setObjSrc(e.target.value)} spellCheck={false} aria-label="Object program" placeholder={'H^PROG^000000^00001A\nT^000000^...\nE^000000'} />
                </>
              )}
            </>
          ) : asmMode ? (
            <>
              <div className="ln head"><span className="a">LOC</span><code>Source</code><span className="o">Object code</span></div>
              {prog!.lines.map((l, idx) => {
                const isNow = as!.line === idx;
                const showLoc = (pastP1 || done1.has(idx)) && !!trace!.result.listing[idx].mnemonic;
                return (
                  <div key={l.key} className={'ln' + (isNow ? ' pc' : '') + (as!.phase === 'p1' && !done1.has(idx) ? ' dim' : '')} onClick={() => goLine(idx)}>
                    <span className="a">{showLoc ? hex(l.loc) : ''}</span>
                    <code>{l.text}</code>
                    <span className={'o' + (isNow && as!.phase === 'p2' ? ' fresh' : '')}>{done2.has(idx) ? l.code : ''}</span>
                  </div>
                );
              })}
            </>
          ) : (
            prog?.lines.map((l) => (
              <div key={l.key} className={'ln' + (!halted && l.code && l.loc === pc ? ' pc' : '') + (sel === l.loc && l.inspect ? ' sel' : '')} onClick={() => l.inspect && setSel((x) => (x === l.loc ? null : l.loc))}>
                <span className="a" title="Toggle breakpoint" onClick={(e) => { e.stopPropagation(); if (l.code) toggleBp(l.loc); }}>{bp.has(l.loc) && l.code ? <i>● </i> : ''}{l.code ? hex(l.loc) : ''}</span>
                <code>{l.text}</code>
                <span className="o">{l.code}</span>
              </div>
            ))
          )}
        </section>

        {asmMode ? (
          <>
            <SymtabCard trace={trace!} at={at} />
            <ObjCard trace={trace!} at={at} />
          </>
        ) : (
          <>
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
                  <BitStrip fields={fieldsOf(shown)} hex={shown.rawBytesHex} />
                  <div className="dec">
                    <div>
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
                <>
                  <form className="goto" onSubmit={(e) => { e.preventDefault(); doGoto(); }}>
                    <label>Show address (hex) <input value={goto} onChange={(e) => setGoto(e.target.value)} placeholder="e.g. 0BD2" spellCheck={false} /></label>
                    <button className="link" type="submit">Go</button>
                    {gotoAddr !== undefined && <button className="link" type="button" onClick={() => { setGoto(''); setGotoAddr(undefined); }}>Clear</button>}
                  </form>
                  <div className="mwrap">
                    {tableRows.map((row, r) => (
                      <div key={row} className={'mrow' + (r > 0 && tableRows[r - 1] + 16 !== row ? ' gap' : '')}>
                        <span className="ma">{hex(row, 5)}</span>
                        {Array.from({ length: 16 }, (_, i) => {
                          const a = row + i;
                          const ch = chMem.some((m) => a >= m.address && a < m.address + m.newBytes.length);
                          return <span key={a + (ch ? 'c' + steps : '')} title={'0x' + hex(a)} className={'b' + (ch ? ' ch' : '') + (a === pc && !halted ? ' pc' : '') + (a === gotoAddr ? ' go' : '')}>{hex(mem.getByte(a), 2)}</span>;
                        })}
                        <span className="asc" aria-label="ASCII">{Array.from({ length: 16 }, (_, i) => ascii(mem.getByte(row + i))).join('')}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {tab === 'sym' && (prog?.symbols.length
                ? <table className="sym"><thead><tr><th>Label</th><th>Address</th><th>Defined on</th></tr></thead>
                  <tbody>{prog.symbols.map((s) => <tr key={s.name}><td>{s.name}</td><td>0x{hex(s.address)}</td><td>line {s.definedLine}</td></tr>)}</tbody></table>
                : <p className="hint">No symbols: this program was loaded as machine code, without source.</p>)}
              {tab === 'obj' && <pre className="p">{prog?.objectText ?? (prog ? 'Loaded as raw hex, so there is no object program.' : 'Load a valid program first.')}</pre>}
              {tab === 'log' && (
                <>
                  {log.length > 0 && <button className="link copy" onClick={copyLog}><Copy size={14} /> {copied ? 'Copied' : 'Copy log'}</button>}
                  <pre className="p">{log.length ? log.join('\n') : 'Nothing has run yet.'}</pre>
                </>
              )}
            </section>
          </>
        )}
      </main>

      <div className="dock" role="toolbar" aria-label="Controls">
        <button className="btn" onClick={backward} disabled={!ok || (asmMode ? at === 0 : steps === 0)} title="Back (←)"><StepBack size={18} /><span>Back</span></button>
        <button className="btn pri" onClick={forward} title="Step (→)" disabled={!ok || atEnd}><StepForward size={18} /><span>Step</span></button>
        <button className="btn" onClick={() => setRunning((r) => !r)} disabled={!ok || atEnd}>
          {running ? <Pause size={18} /> : <Play size={18} />}<span>{running ? 'Pause' : 'Play'}</span>
        </button>
        <button className="btn" onClick={reset} disabled={!ok}><RotateCcw size={18} /><span>Reset</span></button>
        <div className="speed" role="group" aria-label="Speed">
          {SPEEDS.map((s) => <button key={s.l} className={speed === s.ms ? 'on' : ''} onClick={() => setSpeed(s.ms)}>{s.l}</button>)}
        </div>
      </div>

      {showRef && <Reference onClose={() => setShowRef(false)} />}
    </div>
  );
}
