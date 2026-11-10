import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, StepForward, RotateCcw, Pencil, Check, StepBack, BookOpen, Presentation, Copy, Upload, Languages, ChevronDown, ChevronUp } from 'lucide-react';
import { CPU } from './sicxe/cpu.ts';
import { Memory } from './sicxe/memory.ts';
import { Registers, toSigned24 } from './sicxe/registers.ts';
import { Decoder } from './sicxe/decoder.ts';
import { EXAMPLES } from './sicxe/examples.ts';
import { ConditionCode, DecodedInstruction, RegisterId, StepResult } from './sicxe/types.ts';
import { explain, haltReason, hex } from './explain.ts';
import { Stage3D } from './Stage3D.tsx';
import { memRows } from './memRows.ts';
import { Built, LoadError, Program, Source, fromAssembly, fromHex, fromObject } from './program.ts';
import { AsmTrace, buildTrace, fieldsOf } from './asmTrace.ts';
import { AsmPanel, BitStrip, ObjCard, SymtabCard } from './AsmView.tsx';
import { Reference } from './Reference.tsx';
import { DEMO, DEMO_HEX, DemoAct, DemoBar, Tab } from './Demo.tsx';
import { L, Lang, loadLang, saveLang, ui } from './i18n.ts';
import { Practice } from './Practice.tsx';

const REGS: [RegisterId, string, string][] = [
  ['A', 'Accumulator', 'المركم'], ['X', 'Index', 'الفهرسة'], ['L', 'Return address', 'عنوان الرجوع'], ['B', 'Base', 'القاعدة'],
  ['S', 'General', 'عام'], ['T', 'General', 'عام'], ['PC', 'Next instruction', 'التعليمة التالية'], ['SW', 'Status word', 'كلمة الحالة'],
];
const CC: Record<ConditionCode, [string, string]> = { LT: ['Less than', 'أصغر من'], EQ: ['Equal', 'يساوي'], GT: ['Greater than', 'أكبر من'] };
const FLAGS = [['n', 'Indirect', 'غير مباشر'], ['i', 'Immediate', 'فوري'], ['x', 'Indexed', 'فهرسي'], ['b', 'Base', 'قاعدة'], ['p', 'PC-rel', 'نسبي للعداد'], ['e', 'Extended', 'ممتد']] as const;
const SPEEDS = [{ k: 'slow', ms: 900 }, { k: 'normal', ms: 350 }, { k: 'fast', ms: 80 }] as const;
const ZERO: Record<RegisterId, number> = { A: 0, X: 0, L: 0, B: 0, S: 0, T: 0, F: 0, PC: 0, SW: 1 };
const SOURCES: [Source, 'srcAsm' | 'srcHex' | 'srcObj'][] = [['asm', 'srcAsm'], ['hex', 'srcHex'], ['obj', 'srcObj']];
// Safety stop for Play: a program that loops forever (without a jump-to-self) halts here.
const MAX_STEPS = 5000;
const ascii = (b: number) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·');
type Mode = 'asm' | 'run' | 'practice';

export default function App() {
  const [mem] = useState(() => new Memory());
  const [regs] = useState(() => new Registers());
  const cpu = useRef<CPU>(new CPU(mem, regs));

  // Language: English by default, Arabic on request (right-to-left, code stays left-to-right)
  const [lang, setLang] = useState<Lang>(loadLang);
  const t = ui(lang);
  const T = (en: string, ar: string) => L(lang, en, ar);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    saveLang(lang);
  }, [lang]);

  // What is loaded, and the text in each of the three editors
  const [prog, setProg] = useState<Program | null>(null);
  const [errors, setErrors] = useState<LoadError[]>([]);
  const [choice, setChoice] = useState(EXAMPLES[0].id); // the example shown, or 'own'
  const [src, setSrc] = useState(EXAMPLES[0].source);
  const [asmSrc, setAsmSrc] = useState<string | null>(EXAMPLES[0].source); // source behind the loaded program
  const [hexSrc, setHexSrc] = useState(DEMO_HEX);
  const [hexAddr, setHexAddr] = useState('0');
  const [objSrc, setObjSrc] = useState('');
  const [editing, setEditing] = useState<Source | null>(null);

  // Assemble mode: the assembler's steps (rebuilt when the language changes) and where we are in them
  const [mode, setMode] = useState<Mode>('asm');
  const trace: AsmTrace | null = useMemo(() => (asmSrc !== null && prog ? buildTrace(asmSrc, lang) : null), [asmSrc, prog, lang]);
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
  const [show3d, setShow3d] = useState(true);
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

  // Switch to a new program (or show why it could not be loaded). Assembly source can also be walked through in Assemble mode.
  const use = useCallback((b: Built, asmText?: string) => {
    setRunning(false); setSel(null); setMax(0); setGotoAddr(undefined); setAt(0);
    setErrors(b.errors);
    setProg(b.program);
    setAsmSrc(b.program && asmText !== undefined ? asmText : null);
    if (!(b.program && asmText !== undefined)) setMode('run');
    if (b.program) boot(b.program, 0);
    else { setLast(null); setLog([]); setCur(null); setHalted(false); }
    return b.program;
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
      setLog((x) => [...x, r.traceLine]);
      sync();
      setMax((m) => Math.max(m, c.stepCount));
      if (bp.has(regs.get('PC'))) { setRunning(false); setLog((x) => [...x, `[Breakpoint] paused at 0x${hex(regs.get('PC'))}`]); }
    } catch {
      // The CPU has already stopped itself, rewound PC and stored the reason.
      setRunning(false);
      sync();
    }
  }, [sync, bp, regs]);

  const jump = useCallback((n: number) => { if (prog) boot(prog, Math.max(0, n)); }, [prog, boot]);

  // The controls act on whichever mode is showing
  const asmMode = mode === 'asm' && !!trace;
  const practice = mode === 'practice';
  const runMode = !asmMode && !practice;
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
    const b = editing === 'asm' ? fromAssembly(src) : editing === 'hex' ? fromHex(hexSrc, hexAddr, lang) : fromObject(objSrc, lang);
    setChoice('own');
    if (use(b, editing === 'asm' ? src : undefined)) {
      setEditing(null);
      if (editing === 'asm') setMode('asm');
    }
  };

  // Put the app into the state a demo step describes
  const act = (a: DemoAct) => {
    let p: Program | null;
    if (a.load === 'hex') {
      setChoice('own'); setHexSrc(DEMO_HEX); setHexAddr('0'); setEditing(null);
      p = use(fromHex(DEMO_HEX, '0', lang));
    } else p = pick(a.load);
    if (a.practice) { setMode('practice'); setShowRef(false); return; }
    if (a.asm) {
      const want = a.asm;
      const tr = buildTrace(EXAMPLES.find((x) => x.id === a.load)!.source, lang);
      const k = tr.steps.findIndex((s) => s.phase === want.phase && (!want.text || (s.line !== undefined && tr.result.listing[s.line].sourceText.includes(want.text))));
      setMode('asm'); setAt(Math.max(0, k));
    } else {
      setMode('run');
      if (p && a.steps) boot(p, a.steps);
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
    const g = goto.trim(), a = parseInt(g, 16);
    setGotoAddr(/^[0-9A-Fa-f]{1,5}$/.test(g) && a < mem.size ? a : undefined);
  };

  useEffect(() => { pick(EXAMPLES[0].id); }, []);
  useEffect(() => {
    if (!running) return;
    if (atEnd) { setRunning(false); return; }
    const id = setInterval(forward, asmMode ? Math.max(speed * 2.5, 300) : speed);
    return () => clearInterval(id);
  }, [running, atEnd, speed, forward, asmMode]);
  useEffect(() => { setRunning(false); }, [mode]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tg = e.target;
      if (tg instanceof HTMLTextAreaElement || tg instanceof HTMLInputElement || tg instanceof HTMLSelectElement) return;
      if (e.key === '?') { e.preventDefault(); setShowRef((v) => !v); return; }
      if (showRef || practice) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); forward(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); backward(); }
      else if (e.key === ' ' && !(tg instanceof HTMLButtonElement)) { e.preventDefault(); setRunning((r) => !r); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [forward, backward, showRef, practice]);

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
  const n1 = trace ? trace.steps.filter((s) => s.phase === 'p1').length : 0;
  const n2 = trace ? trace.steps.filter((s) => s.phase === 'p2').length : 0;
  const phaseLabel = !as ? '' : as.phase === 'start' ? T('Assembler · before Pass 1', 'المجمّع · قبل Pass 1')
    : as.phase === 'p1' ? `Pass 1 · ${t('line')} ${done1.size} ${t('of')} ${n1}`
    : as.phase === 'p1done' ? T('Pass 1 finished', 'انتهى Pass 1')
    : as.phase === 'p2' ? `Pass 2 · ${t('line')} ${done2.size} ${t('of')} ${n2}`
    : T('Assembly finished', 'انتهى التجميع');
  // Clicking a line in Assemble mode jumps to where that line is handled
  const goLine = (idx: number) => {
    const phase = as && (as.phase === 'p1' || as.phase === 'start') ? 'p1' : 'p2';
    const k = trace!.steps.findIndex((s) => s.phase === phase && s.line === idx);
    if (k >= 0) setAt(k);
  };

  const nowCard = (
    <section className="now card" aria-live="polite">
      {!ok && errors.length ? (
        <>
          <p className="label">{t('fixFirst')}</p>
          {errors.map((er, i) => <div key={i} className="msg bad">{er.line ? `${t('line')} ${er.line}: ` : ''}{er.message}</div>)}
        </>
      ) : asmMode ? (
        <>
          <p className="label">{phaseLabel}</p>
          {as!.line !== undefined
            ? <p className="big" dir="ltr">{trace!.result.listing[as!.line].sourceText.trim().replace(/\s+/g, ' ')}{as!.enc && <span className="to"> → {as!.enc.hex}</span>}</p>
            : <p className="big">{as!.title}</p>}
          <p className="say">{as!.phase === 'p2' && as!.enc ? T('Read the steps below: each one decides some of the bits, in the same colour.', 'اقرأ الخطوات بالأسفل: كل خطوة تحدد جزءاً من البتات، وبنفس اللون.') : as!.say}</p>
        </>
      ) : halted ? (
        <>
          <p className="label">{reason.includes('normal termination') ? t('finished') : t('stopped')} {steps} {t('steps')}</p>
          <p className="big" dir="ltr">A = {toSigned24(reg.A)}</p>
          <p className="say">{haltReason(reason, lang) || T('The program stopped.', 'توقف البرنامج.')}</p>
        </>
      ) : (
        <>
          <p className="label">{steps === 0 ? t('ready') : `${t('nextInstr')} ${steps + 1}`}</p>
          <p className="big" dir="ltr">{cur ? cur.disassembly : '…'}</p>
          <p className="say">{cur ? explain(cur, lang) : t('notInstr')}</p>
          {last && (
            <p className="did">
              <b>{t('justRan')}</b> <span dir="ltr">{last.instruction.disassembly}
                {chRegs.filter((c) => c.reg !== 'PC').map((c) => ` · ${c.reg}: ${toSigned24(c.oldValue)} → ${toSigned24(c.newValue)}`)}
                {chMem.length > 0 && ` · mem 0x${hex(chMem[0].address)}`}</span>
            </p>
          )}
        </>
      )}
      {ok && (
        <div className="time" dir="ltr">
          {asmMode
            ? <input className="scrub" type="range" min={0} max={asmLast} value={at} onChange={(e) => setAt(+e.target.value)} aria-label={T('Assembler timeline', 'شريط زمن المجمّع')} />
            : <input className="scrub" type="range" min={0} max={Math.max(maxSteps, 1)} value={steps} onChange={(e) => jump(+e.target.value)} aria-label={T('Timeline', 'شريط الزمن')} />}
          <span className="hint" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{t('stepOf')} {asmMode ? at : steps} {t('of')} {asmMode ? asmLast : maxSteps || '?'} · {asmMode ? t('asmTimeHint') : t('timeHint')}</span>
        </div>
      )}
    </section>
  );

  const programCard = (
    <section className="card code">
      <h2>
        <span>{t('program')}</span>
        {editing
          ? <span className="acts"><button className="link" onClick={() => setEditing(null)}>{t('cancel')}</button><button className="link" onClick={loadEditor}><Check size={16} /> {editing === 'asm' ? t('assembleBtn') : t('load')}</button></span>
          : <span className="acts"><button className="link" onClick={() => openEditor('hex')}><Upload size={14} /> {t('loadCode')}</button><button className="link" onClick={() => openEditor('asm')}><Pencil size={14} /> {t('edit')}</button></span>}
      </h2>
      {!editing && <p className="hint sub">{asmMode ? t('clickAsm') : `${prog && prog.source !== 'asm' ? t('disasm') + ' · ' : ''}${t('clickRun')}`}</p>}
      {editing ? (
        <>
          <div className="seg" role="tablist" aria-label={T('What to load', 'ماذا تحمّل')}>
            {SOURCES.map(([k, key]) => <button key={k} role="tab" aria-selected={editing === k} className={editing === k ? 'on' : ''} onClick={() => openEditor(k)}>{t(key)}</button>)}
          </div>
          {editing === 'asm' && <textarea className="ed" dir="ltr" value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} aria-label={T('Assembly source', 'كود الأسمبلي')} />}
          {editing === 'hex' && (
            <>
              <p className="hint">{t('hexHelp')}</p>
              <label className="addr">{t('startAddr')} <input dir="ltr" value={hexAddr} onChange={(e) => setHexAddr(e.target.value)} spellCheck={false} /></label>
              <textarea className="ed short" dir="ltr" value={hexSrc} onChange={(e) => setHexSrc(e.target.value)} spellCheck={false} aria-label={T('Machine code in hex', 'كود الآلة بالـ hex')} />
            </>
          )}
          {editing === 'obj' && (
            <>
              <p className="hint">{t('objHelp')}</p>
              <textarea className="ed short" dir="ltr" value={objSrc} onChange={(e) => setObjSrc(e.target.value)} spellCheck={false} aria-label={T('Object program', 'Object program')} placeholder={'H^PROG^000000^00001A\nT^000000^...\nE^000000'} />
            </>
          )}
        </>
      ) : (
        <div className="listing" dir="ltr">
          <div className="ln head"><span className="a">LOC</span><code>Source</code><span className="o">Object code</span></div>
          {asmMode
            ? prog!.lines.map((l, idx) => {
              const isNow = as!.line === idx;
              const showLoc = (pastP1 || done1.has(idx)) && !!trace!.result.listing[idx].mnemonic;
              return (
                <div key={l.key} className={'ln' + (isNow ? ' pc' : '') + (as!.phase === 'p1' && !done1.has(idx) ? ' dim' : '')} onClick={() => goLine(idx)}>
                  <span className="a">{showLoc ? hex(l.loc) : ''}</span>
                  <code>{l.text}</code>
                  <span className={'o' + (isNow && as!.phase === 'p2' ? ' fresh' : '')}>{done2.has(idx) ? l.code : ''}</span>
                </div>
              );
            })
            : prog?.lines.map((l) => (
              <div key={l.key} className={'ln' + (!halted && l.code && l.loc === pc ? ' pc' : '') + (sel === l.loc && l.inspect ? ' sel' : '')} onClick={() => l.inspect && setSel((x) => (x === l.loc ? null : l.loc))}>
                <span className="a" title={T('Toggle breakpoint', 'نقطة توقف')} onClick={(e) => { e.stopPropagation(); if (l.code) toggleBp(l.loc); }}>{bp.has(l.loc) && l.code ? <i>● </i> : ''}{l.code ? hex(l.loc) : ''}</span>
                <code>{l.text}</code>
                <span className="o">{l.code}</span>
              </div>
            ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="app">
      <a className="skip" href="#work">{T('Skip to the program', 'انتقل إلى البرنامج')}</a>
      <header className="top" data-enter>
        <div className="brand"><b>SIC/XE</b> Lab</div>
        <div className="modes" role="tablist" aria-label={t('modeLabel')}>
          <button role="tab" aria-selected={asmMode} className={asmMode ? 'on' : ''} disabled={!trace} onClick={() => setMode('asm')} title={trace ? '' : t('asmOnly')}><b>1</b> {t('assemble')}</button>
          <span className="arrowsep" aria-hidden="true">{lang === 'ar' ? '←' : '→'}</span>
          <button role="tab" aria-selected={runMode} className={runMode ? 'on' : ''} disabled={!ok} onClick={() => setMode('run')}><b>2</b> {t('run')}</button>
          <span className="arrowsep" aria-hidden="true">·</span>
          <button role="tab" aria-selected={practice} className={practice ? 'on' : ''} onClick={() => setMode('practice')}><b>3</b> {t('practice')}</button>
        </div>
        <div className="tools">
          <label className="pick">
            <span>{t('example')}</span>
            <select value={choice} onChange={(e) => { setDemo(null); pick(e.target.value); }} aria-label={t('examplesLabel')}>
              {EXAMPLES.map((e) => <option key={e.id} value={e.id}>{e.title.split(' (')[0]}</option>)}
              {choice === 'own' && <option value="own" disabled>{t('ownProgram')}</option>}
            </select>
          </label>
          <button className="chip tool" onClick={() => (demo === null ? goDemo(0) : setDemo(null))} aria-pressed={demo !== null}><Presentation size={16} /> {t('demo')}</button>
          <button className="chip tool" onClick={() => setShowRef(true)} title={`${t('reference')} (?)`}><BookOpen size={16} /> {t('reference')}</button>
          <button className="chip tool" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} aria-label={t('langLabel')} lang={lang === 'ar' ? 'en' : 'ar'}><Languages size={16} /> {t('langBtn')}</button>
        </div>
      </header>

      {demo !== null && <DemoBar at={demo} go={goDemo} close={() => setDemo(null)} lang={lang} />}

      {practice ? <main id="work"><Practice lang={lang} /></main> : <main className="work" id="work">
        <div className="area-code">{programCard}</div>
        <div className="area-now">{nowCard}</div>

        <div className="area-rest">
          {asmMode ? (
            <>
              <section className="card">
                <h2>{T('Assembler', 'المجمّع')} <span className="hint">{T('how the source becomes machine code', 'كيف يصبح المصدر كود آلة')}</span></h2>
                <AsmPanel trace={trace!} at={at} onRun={() => setMode('run')} lang={lang} />
              </section>
              <div className="pair">
                <SymtabCard trace={trace!} at={at} lang={lang} />
                <ObjCard trace={trace!} at={at} lang={lang} />
              </div>
            </>
          ) : (
            <>
              <section className="card">
                <h2>
                  <span>{sel !== null ? t('inspecting') : t('decoder')} {shown && <span className="hint" dir="ltr">Format {shown.format} · {shown.length} bytes · {shown.addressingMode}</span>}</span>
                  {sel !== null && <button className="link" onClick={() => setSel(null)}>{t('backToNext')}</button>}
                </h2>
                {shown ? (
                  <>
                    <p className="say small">{explain(shown, lang)}</p>
                    <BitStrip fields={fieldsOf(shown)} hex={shown.rawBytesHex} lang={lang} />
                    <div className="dec">
                      {fmt34 ? (
                        <div className="flags" dir="ltr">
                          {FLAGS.map(([f, en, ar]) => <div key={f} className={'fl' + (shown[f] ? ' on' : '')}>{f}={shown[f] ?? 0}<small>{T(en, ar)}</small></div>)}
                        </div>
                      ) : <p className="hint" dir="ltr">{shown.format === 2 ? `r1 = ${shown.r1 ?? ''}, r2 = ${shown.r2 ?? ''}` : 'Format 1'}</p>}
                      <p className="formula" dir="ltr">
                        {shown.taFormula ?? shown.disassembly}
                        {shown.targetAddress !== undefined && <><br />Target address = 0x{hex(shown.targetAddress)}</>}
                      </p>
                    </div>
                  </>
                ) : <p className="hint">{t('noDecode')}</p>}
              </section>

              <section className="card">
                <h2>{t('registers')} <span className="hint">{t('lastCompare')}: <b>{T(...CC[cc])}</b></span></h2>
                <div className="regs">
                  {REGS.map(([id, en, ar]) => {
                    const c = chRegs.find((x) => x.reg === id);
                    const v = reg[id];
                    return (
                      <div key={id + (c ? steps : '')} className={'tile' + (c ? ' ch' : '')}>
                        <div className="n">{id}</div>
                        <div className="d">{T(en, ar)}</div>
                        <div className="v" dir="ltr">{id === 'PC' ? hex(v) : toSigned24(v)}</div>
                        <div className="x" dir="ltr">{id === 'PC' ? '' : '0x' + hex(v)}</div>
                        {c && id !== 'PC' && <div className="was">{T('was', 'كان')} <span dir="ltr">{toSigned24(c.oldValue)}</span></div>}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="card">
                <h2>
                  <span>{t('board3d')}</span>
                  <button className="link" onClick={() => setShow3d((v) => !v)} aria-expanded={show3d}>{show3d ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {show3d ? t('hide3d') : t('show3d')}</button>
                </h2>
                {show3d && <Stage3D reg={reg} chRegs={chRegs} chMem={chMem} mem={mem} rowAddrs={boardRows} pc={pc} halted={halted} last={last} steps={steps} />}
              </section>

              <section className="card">
                <div className="tabs" role="tablist">
                  {([['mem', 'memory'], ['sym', 'symtab'], ['obj', 'objProg'], ['log', 'log']] as const).map(([k, key]) => (
                    <button key={k} role="tab" aria-selected={tab === k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{t(key)}</button>
                  ))}
                </div>
                {tab === 'mem' && (
                  <>
                    <form className="goto" onSubmit={(e) => { e.preventDefault(); doGoto(); }}>
                      <label>{t('showAddr')} <input dir="ltr" value={goto} onChange={(e) => setGoto(e.target.value)} placeholder="0BD2" spellCheck={false} /></label>
                      <button className="link" type="submit">{t('go')}</button>
                      {gotoAddr !== undefined && <button className="link" type="button" onClick={() => { setGoto(''); setGotoAddr(undefined); }}>{t('clear')}</button>}
                    </form>
                    <div className="mwrap" dir="ltr">
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
                  ? <table className="sym" dir="ltr"><thead><tr><th>Label</th><th>Address</th><th>Line</th></tr></thead>
                    <tbody>{prog.symbols.map((s) => <tr key={s.name}><td>{s.name}</td><td>0x{hex(s.address)}</td><td>{s.definedLine}</td></tr>)}</tbody></table>
                  : <p className="hint">{t('noSymbols')}</p>)}
                {tab === 'obj' && <pre className="p" dir="ltr">{prog?.objectText ?? (prog ? t('noObj') : t('loadFirst'))}</pre>}
                {tab === 'log' && (
                  <>
                    {log.length > 0 && <button className="link copy" onClick={copyLog}><Copy size={14} /> {copied ? t('copied') : t('copyLog')}</button>}
                    <pre className="p" dir="ltr">{log.length ? log.join('\n') : t('nothingRan')}</pre>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </main>}

      {!practice && <div className="dock" role="toolbar" aria-label={t('controls')} dir="ltr">
        <button className="btn" onClick={backward} disabled={!ok || (asmMode ? at === 0 : steps === 0)} title={`${t('back')} (←)`}><StepBack size={18} /><span>{t('back')}</span></button>
        <button className="btn pri" onClick={forward} title={`${t('step')} (→)`} disabled={!ok || atEnd}><StepForward size={18} /><span>{t('step')}</span></button>
        <button className="btn" onClick={() => setRunning((r) => !r)} disabled={!ok || atEnd}>
          {running ? <Pause size={18} /> : <Play size={18} />}<span>{running ? t('pause') : t('play')}</span>
        </button>
        <button className="btn" onClick={reset} disabled={!ok}><RotateCcw size={18} /><span>{t('reset')}</span></button>
        <div className="speed" role="group" aria-label={t('speed')}>
          {SPEEDS.map((s) => <button key={s.k} aria-pressed={speed === s.ms} className={speed === s.ms ? 'on' : ''} onClick={() => setSpeed(s.ms)}>{t(s.k)}</button>)}
        </div>
      </div>}

      {showRef && <Reference onClose={() => setShowRef(false)} lang={lang} />}
    </div>
  );
}
