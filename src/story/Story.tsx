// "Learn": the story told before the lab. One 3D scene sits behind the page and the scroll position drives it:
// the machine opens, Pass 1 measures the program, Pass 2 turns a line into bits, the loader copies the bytes in,
// and the CPU runs them. The last screen opens the lab on the same program.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Lenis from 'lenis';
import { invalidate } from '@react-three/fiber';
import 'lenis/dist/lenis.css';
import { Languages } from 'lucide-react';
import Scene, { Pin } from './Scene.tsx';
import { Clock } from './world.ts';
import { SLine, buildStory } from './data.ts';
import { CH, COUNT, P2, RUN_DONE, START, TOTAL, addrBeat, bgAt, darkAt, locate, p1Line, p1Slot, p1Start, p2Phase, runStep, stops } from './plan.ts';
import { NAMES, T, Two, UI } from './copy.ts';
import { Lang } from '../i18n.ts';
import { explain, hex } from '../explain.ts';
import { toSigned24 } from '../sicxe/registers.ts';
import { Field } from '../asmTrace.ts';
import { io, io3, mix, seg } from '../three/kit.ts';
import './story.css';

interface Props { lang: Lang; setLang: (l: Lang) => void; onOpenLab: (line?: number) => void }

// When an element is on screen inside its chapter: fades in at `a`, out at `z` (both 0..1 of the chapter)
const when = (a: number, z = 2, d?: number) => ({ '--a': a, '--z': z, ...(d ? { '--d': d } : {}) }) as React.CSSProperties;
const ON = -1; // "from the start of the chapter"

function Rich({ s }: { s: string }) {
  return <>{s.split('`').map((part, i) => (i % 2 ? <code key={i} dir="ltr">{part}</code> : part))}</>;
}

// A headline in two voices: what we say (serif) and what the machine sees (mono)
function Head({ h, m, a = 0.02, z = 0.97, as: As = 'h2' }: { h: string; m?: string; a?: number; z?: number; as?: 'h1' | 'h2' }) {
  return (
    <As className="st-h sb" style={when(a, z)}>
      <span className="hs">{h}</span>
      {m && <span className="hm"><Rich s={m} /></span>}
    </As>
  );
}

export default function StoryPage({ lang, setLang, onOpenLab }: Props) {
  const k = lang === 'ar' ? 1 : 0;
  const tx = (two: Two) => two[k];
  const story = useMemo(() => buildStory(lang), [lang]);
  const sceneStory = useMemo(() => buildStory('en'), []); // numbers only; the scene has no words in it
  const n = story.lines.length, N = story.frames.length;

  const clock = useRef<Clock>({ u: 0, ch: 0, t: 0, rtl: lang === 'ar', pick: -1 });
  const pins = useRef(new Map<HTMLElement, Pin>());
  const [ch, setCh] = useState(0);
  const [beat, setBeat] = useState(0);
  const [pick, setPick] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const layers = useRef<(HTMLElement | null)[]>([]);
  const ghost = useRef<HTMLDivElement>(null), locEl = useRef<HTMLElement>(null), locTag = useRef<HTMLElement>(null), fill = useRef<HTMLElement>(null);
  const lenis = useRef<Lenis | null>(null);
  const goal = useRef<number | null>(null);
  const marks = useMemo(() => stops(n, N), [n, N]);

  useEffect(() => { clock.current.rtl = lang === 'ar'; }, [lang]);

  // Fade a chapter's pieces in and out as the scroll passes their marks (see `when`). Only a piece whose
  // visibility really changes is written to, so a page that stands still, or moves between two marks, costs nothing.
  const pieces = useRef<{ ch: number; list: { el: HTMLElement; a: number; z: number; d: number; o: string }[] }>({ ch: -1, list: [] });
  const showAt = useCallback((c: number, t: number) => {
    const p = pieces.current, layer = layers.current[c];
    if (!layer) return;
    if (p.ch !== c) {
      p.ch = c;
      p.list = Array.from(layer.querySelectorAll<HTMLElement>('.sb')).map((el) => {
        const num = (name: string, or: number) => { const x = parseFloat(el.style.getPropertyValue(name)); return Number.isFinite(x) ? x : or; };
        return { el, a: num('--a', -1), z: num('--z', 2), d: num('--d', 0.05), o: el.style.getPropertyValue('--o') };
      });
    }
    for (const s of p.list) {
      const o = Math.max(0, Math.min(1, (t - s.a) / s.d, (s.z - t) / s.d)).toFixed(3);
      if (o !== s.o) { s.o = o; s.el.style.setProperty('--o', o); }
    }
  }, []);
  // React may have just added or replaced pieces: look again, before the browser paints
  useLayoutEffect(() => { pieces.current.ch = -1; showAt(clock.current.ch, clock.current.t); });

  // One loop reads the scroll position and tells the page where it is. The 3D scene reads the same clock.
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.classList.add('st-on');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const l = reduced ? null : new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.current = l;
    const lines = sceneStory.lines;
    let raf = 0, lastCh = -1, lastBeat = -99, lastTheme = '', lastLoc = '', lastBg = '', lastT = '', lastGhost = '', lastU = -1, lastPick = -2, lastRtl: boolean | null = null, awake = performance.now() + 3000;
    const beatOf = (c: number, t: number) => {
      if (c === CH.PASS1) return p1Line(t, n);
      if (c === CH.PASS2) return p2Phase(t);
      if (c === CH.ADDR) return addrBeat(t);
      if (c === CH.RUN) { const r = runStep(t, N); return r.s * 2 + (r.f >= RUN_DONE ? 1 : 0); }
      return 0;
    };
    const tick = (time: number) => {
      l?.raf(time);
      const vh = window.innerHeight || 1;
      const u = (l ? l.scroll : window.scrollY) / vh;
      const { ch: c, t } = locate(u);
      const ck = clock.current; ck.u = u; ck.ch = c; ck.t = t;
      // draw only while something moves, then let the picture rest (and the laptop stay cool)
      if (Math.abs(u - lastU) > 0.00004 || ck.pick !== lastPick || ck.rtl !== lastRtl) { lastU = u; lastPick = ck.pick; lastRtl = ck.rtl; awake = time + 1400; }
      if (time < awake) invalidate();
      if (ck.pick >= 0 && (c !== CH.PASS2 || t < P2.pick - 0.03)) { ck.pick = -1; setPick(-1); }
      const el = root.current;
      if (el) {
        const dark = darkAt(u), [r, g, b] = bgAt(dark);
        const bg = `rgb(${r} ${g} ${b})`;
        if (bg !== lastBg) { lastBg = bg; el.style.setProperty('--bg', bg); }
        const theme = dark > 0.5 ? 'dark' : 'light';
        if (theme !== lastTheme) { el.dataset.theme = theme; lastTheme = theme; }
        const ts = c + ':' + t.toFixed(4);
        if (ts !== lastT) { lastT = ts; showAt(c, t); }
        if (ghost.current) {
          const o = c === CH.HERO ? 1 - seg(t, 0.2, 0.75) : 0, gs = o.toFixed(3) + '|' + (c === CH.HERO ? (-t * 90).toFixed(1) : '0');
          if (gs !== lastGhost) {
            lastGhost = gs;
            ghost.current.style.opacity = o.toFixed(3);
            ghost.current.style.transform = `translate3d(0,${c === CH.HERO ? (-t * 90).toFixed(1) : '0'}px,0)`;
            ghost.current.style.visibility = o > 0 ? '' : 'hidden';
          }
        }
        // LOCCTR: still at the start until Pass 1 measures the program, then it stays at the program's length
        let loc = lines[0].loc;
        if (c > CH.PASS1) loc = sceneStory.start + sceneStory.length;
        else if (c === CH.PASS1) { const i = p1Line(t, n); if (i >= 0) loc = mix(lines[i].loc, lines[i].locAfter, io(seg((t - p1Start(i, n)) / p1Slot(n), 0.45, 0.95))); }
        const s = hex(Math.round(loc));
        if (s !== lastLoc) {
          lastLoc = s;
          if (locEl.current) locEl.current.textContent = s;
          if (locTag.current) locTag.current.textContent = s;
          if (fill.current) fill.current.style.transform = `scaleX(${((loc - sceneStory.start) / sceneStory.length).toFixed(3)})`;
        }
      }
      if (c !== lastCh) { lastCh = c; setCh(c); }
      const bt = beatOf(c, t);
      if (bt !== lastBeat) { lastBeat = bt; setBeat(bt); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const free = () => { goal.current = null; };
    const wake = () => { awake = performance.now() + 1400; };
    window.addEventListener('resize', wake);
    window.addEventListener('wheel', free, { passive: true });
    window.addEventListener('touchstart', free, { passive: true });
    return () => {
      cancelAnimationFrame(raf); l?.destroy(); lenis.current = null;
      window.removeEventListener('wheel', free); window.removeEventListener('touchstart', free); window.removeEventListener('resize', wake);
      document.documentElement.classList.remove('st-on');
      window.scrollTo(0, 0);
    };
  }, [n, N, sceneStory, showAt]);

  // Presenting: "next" glides to the next place where the picture is complete
  const jump = useCallback((u: number) => {
    const y = Math.max(0, Math.min(TOTAL, u)) * window.innerHeight;
    const dist = Math.abs(u - clock.current.u);
    goal.current = u;
    const l = lenis.current;
    if (l) l.scrollTo(y, { duration: Math.min(3.4, Math.max(0.9, 0.7 + dist * 2.3)), easing: io3, onComplete: () => { goal.current = null; } });
    else { window.scrollTo(0, y); goal.current = null; }
  }, []);
  const go = useCallback((dir: 1 | -1) => {
    const cur = goal.current ?? clock.current.u;
    const next = dir > 0 ? marks.find((s) => s > cur + 0.012) ?? TOTAL : [...marks].reverse().find((s) => s < cur - 0.012) ?? 0;
    jump(next);
  }, [marks, jump]);
  const toChapter = (i: number) => jump(i === 0 ? 0 : marks.find((s) => s >= START[i] + 0.001) ?? START[i]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tg = e.target;
      if (tg instanceof HTMLInputElement || tg instanceof HTMLTextAreaElement || tg instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const onButton = tg instanceof HTMLButtonElement;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ArrowRight' || (e.key === ' ' && !e.shiftKey && !onButton)) { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'ArrowLeft' || (e.key === ' ' && e.shiftKey && !onButton)) { e.preventDefault(); go(-1); }
      else if (e.key === 'Home') { e.preventDefault(); jump(0); }
      else if (e.key === 'End') { e.preventDefault(); jump(TOTAL); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [go, jump]);

  // Pin a page element to a named point of the 3D scene; the scene moves it there on every frame
  const pinFns = useRef(new Map<string, (el: HTMLElement | null) => void | (() => void)>());
  const pin = useCallback((at: string) => {
    let f = pinFns.current.get(at);
    if (!f) {
      f = (el) => {
        if (!el) return;
        pins.current.set(el, { at, ch: Number(el.closest<HTMLElement>('.st-ch')?.dataset.ch ?? -1) });
        return () => { pins.current.delete(el); };
      };
      pinFns.current.set(at, f);
    }
    return f;
  }, []);
  const layer = (i: number) => ({ ref: (el: HTMLElement | null) => { layers.current[i] = el; }, 'data-ch': i, 'data-on': ch === i, 'aria-hidden': ch !== i } as const);
  const beatIn = (i: number, first: number, last: number) => (ch === i ? beat : ch > i ? last : first);

  // ---------- pieces shared by several chapters ----------
  const ldx = story.lines.find((l) => l.code)!;
  const codeHex = (l: { code: string }) => l.code;
  // Labels under the bits and hex digits above them, for a fully shown instruction
  const bitLabels = (fields: Field[], code: string, a = ON, z = 2) => {
    let at = 0;
    const out: React.ReactNode[] = fields.map((f) => {
      const lo = at, hi = at + f.bits.length - 1; at = hi + 1;
      return <div key={'f' + lo} ref={pin(`b:span:${lo}:${hi}`)} className={`st-pin st-bit sb t-${f.tone}`} style={when(a, z)}><span>{f.name}</span></div>;
    });
    Array.from(code).forEach((d, j) => out.push(<div key={'h' + j} ref={pin(`b:nib:${j}`)} className="st-pin st-hex sb" style={when(a, z)}><span>{d}</span></div>));
    return out;
  };

  // ---------- Pass 1 ----------
  const k1 = beatIn(CH.PASS1, -1, n - 1);
  const seen = story.symbols.filter((s) => s.line <= k1);

  // ---------- Pass 2 ----------
  const phase = beatIn(CH.PASS2, 0, 8);
  const picked = pick >= 0 && phase === 8 ? story.lines[pick] : null;
  const p2line: SLine = picked ?? ldx;
  const opHex = hex(parseInt(ldx.fields[0]?.bits ?? '0', 2) << 2, 2);
  const stepOf = (tone: string | undefined, nth = 0) => { const i = ldx.how.findIndex((h) => h.tone === tone); return i < 0 ? Math.min(nth, ldx.how.length - 1) : i; };
  const howIdx = phase === 1 ? stepOf('e') : phase === 2 ? stepOf('op') : phase === 3 ? stepOf('ni') : phase === 4 ? stepOf('x') : phase === 5 ? stepOf('disp') : ldx.how.length - 1;

  // ---------- Addressing ----------
  const ab = beatIn(CH.ADDR, 0, 2);
  const tix = story.lines.find((l) => l.mnemonic === 'TIX')!, jlt = story.lines.find((l) => l.mnemonic === 'JLT')!;
  const aline = ab === 0 ? tix : ab === 1 ? jlt : null;
  const afields = aline ? aline.fields : story.far?.fields ?? [];
  const ahow = aline ? aline.how : story.far?.how ?? [];
  const acode = aline ? aline.code : story.far?.hex ?? '';
  const dispAt = ahow.findIndex((h) => h.tone === 'disp');
  const signed12 = (l: SLine) => { const v = parseInt(l.fields[l.fields.length - 1].bits, 2); return v > 2047 ? v - 4096 : v; };
  const far = story.far, span = 0x1900, pos = (a: number) => `${(Math.max(0, Math.min(span, a)) / span) * 100}%`;

  // ---------- Formats ----------
  const addrLine = story.lines.find((l) => l.mnemonic === 'ADDR')!;
  const FMT: [number, string][][] = [[[8, 'opcode']], [[8, 'opcode'], [4, 'r1'], [4, 'r2']], [[6, 'opcode'], [6, 'n i x b p e'], [12, 'disp']], [[6, 'opcode'], [6, 'n i x b p e'], [20, 'address']]];

  // ---------- Run ----------
  const rb = beatIn(CH.RUN, 0, (N - 1) * 2 + 1), rs = rb >> 1, rdone = (rb & 1) === 1;
  const fr = story.frames[rs], prev = rs > 0 ? story.frames[rs - 1] : null;
  const runLine = story.lines.find((l) => l.code && l.loc === fr.step.pcBefore);
  const aNow = toSigned24(rdone ? fr.regs.A : prev ? prev.regs.A : story.initial.A);
  const changes = fr.step.registerChanges.filter((c) => c.reg !== 'PC');

  const rec = (s: string) => s.split('^');
  const H = rec(story.records.h), TR = rec(story.records.t[0] ?? ''), E = rec(story.records.e);

  // Each chapter is built again only when something it shows has changed, so a new beat in one chapter
  // leaves the other ten untouched (and the frame it happens in stays short).
  const shared = [story, lang, pin, onOpenLab, jump] as const;

  // 0 · one line
  const chHero = useMemo(() => (
    <section className="st-ch" {...layer(CH.HERO)}>
      <div className="st-copy st-bl">
        <Head as="h1" h={tx(T.hero.h)} m={tx(T.hero.m)} a={ON} z={0.72} />
        <p className="st-p sb" style={when(ON, 0.66)}>{tx(T.hero.p)}</p>
      </div>
      <div className="st-scroll sb" style={when(ON, 0.4)}><span>{tx(UI.hint)}</span><i /><small>{tx(UI.keys)}</small></div>
    </section>
  ), [...shared, ch === CH.HERO]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1 · the machine
  const chMachine = useMemo(() => (
    <section className="st-ch" {...layer(CH.MACHINE)}>
      <div className="st-copy st-tl slim">
        <Head h={tx(T.machine.h)} m={tx(T.machine.m)} a={0.02} z={0.72} />
        <p className="st-p sb" style={when(0.05, 0.27, 0.04)}><Rich s={tx(T.machine.p)} /></p>
      </div>
      {(['regs', 'cu', 'alu', 'mem', 'bus'] as const).map((id, i) => {
        const [title, text] = T.machine.parts[id][k];
        return (
          <div key={id} ref={pin('m:' + id)} className={`st-pin st-call sb ${id === 'alu' || id === 'mem' ? 'r' : 'l'}`} style={when(0.3 + i * 0.03, 0.68, 0.04)}>
            <i className="dot" /><i className="lead" />
            <div className="tx"><b>{title}</b><span><Rich s={text} /></span></div>
          </div>
        );
      })}
    </section>
  ), [...shared, ch === CH.MACHINE]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2 · bytes
  const chBytes = useMemo(() => (
    <section className="st-ch" {...layer(CH.BYTES)}>
      <div className="st-copy st-tl slim">
        <Head h={tx(T.bytes.h)} m={tx(T.bytes.m)} a={0.1} />
        <p className="st-p sb" style={when(0.2, 0.97)}><Rich s={tx(T.bytes.p)} /></p>
      </div>
      <div ref={pin('m:cell:1')} className="st-pin st-tag sb" style={when(0.66, 0.97)}><span><Rich s={tx(T.bytes.pin)} /></span></div>
    </section>
  ), [...shared, ch === CH.BYTES]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3 · Pass 1
  const chPass1 = useMemo(() => (
    <section className="st-ch" {...layer(CH.PASS1)}>
      <div className="st-copy st-tl">
        <Head h={tx(T.pass1.h)} m={tx(T.pass1.m)} a={0.02} z={0.985} />
        <div className="st-swap">
          <p className="st-p sb" style={when(0.04, 0.125, 0.03)}><Rich s={tx(T.pass1.p)} /></p>
          <div className="st-list sb" style={when(0.125, 0.985, 0.03)} dir="ltr">
            <div className="row head"><span>LOC</span><span /><span>Source</span></div>
            {story.lines.map((l, i) => (
              <div key={l.idx} className={'row' + (i === k1 ? ' cur' : '') + (i > k1 ? ' todo' : '')}>
                <span className="loc">{i <= k1 ? hex(l.loc) : ''}</span><span className="lab">{l.label ?? ''}</span><span>{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="st-tr sb" style={when(0.125, 0.985, 0.03)}><div className="st-sym" dir="ltr">
        <div className="row head"><span>SYMTAB</span><span>{seen.length}/{story.symbols.length}</span></div>
        {seen.map((s) => <div key={s.name} className={'row' + (s.line === k1 ? ' cur' : '')}><span>{s.name}</span><span>{hex(s.address)}</span></div>)}
        {!seen.length && <div className="row todo" dir={lang === 'ar' ? 'rtl' : 'ltr'}><span>{tx(T.pass1.empty)}</span></div>}
      </div></div>
      {k1 >= 0 && <p key={k1} className="st-cap st-bc sb" style={when(0.13, 0.985, 0.02)}>{k1 === n - 1 && ch === CH.PASS1 ? story.p1done : story.lines[k1].say}</p>}
      <div ref={pin('r:cursor')} className="st-pin st-tag cy sb" style={when(0.12, 0.985, 0.03)}><span dir="ltr">LOCCTR <b ref={locTag}>0000</b></span></div>
    </section>
  ), [...shared, ch === CH.PASS1, k1]); // eslint-disable-line react-hooks/exhaustive-deps

  // 4 · Pass 2
  const chPass2 = useMemo(() => (
    <section className="st-ch" {...layer(CH.PASS2)}>
      <div className="st-copy st-tl">
        <Head h={tx(T.pass2.h)} a={0.02} z={2} />
        <p className="st-eq sb" style={when(0.05)} dir="ltr">{p2line.text} <i>→</i> <b>{picked || phase >= 6 ? codeHex(p2line) : '?'}</b></p>
      </div>
      <div className="st-step st-tr sb" style={when(0.04)} key={picked ? 'p' + pick : 's' + phase}>
        {picked ? (
          <ol className="st-howlist">{picked.how.map((h, i) => <li key={i} className={h.tone ? 't-' + h.tone : ''}>{h.t}</li>)}</ol>
        ) : phase === 0 ? <p className="st-p"><Rich s={tx(T.pass2.intro)} /></p>
          : phase <= 6 ? (
            <p className={'st-how ' + (ldx.how[howIdx].tone ? 't-' + ldx.how[howIdx].tone : '')}>
              <small>{tx(T.pass2.step)} {howIdx + 1} {tx(UI.of)} {ldx.how.length}</small>{ldx.how[howIdx].t}
            </p>
          ) : <p className="st-p">{tx(phase === 7 ? T.pass2.done : T.pass2.pick)}</p>}
      </div>
      {picked ? bitLabels(picked.fields, picked.code) : (
        <>
          <div ref={pin('b:span:0:7')} className="st-pin st-bit sb t-op" style={when(P2.op + 0.03, P2.fall[0], 0.02)}><span>opcode {opHex}</span></div>
          <div ref={pin('b:span:0:5')} className="st-pin st-bit sb t-op" style={when(P2.respawn[0], 2, 0.02)}><span>opcode</span></div>
          {([['n', 6, P2.n], ['i', 7, P2.i], ['x', 8, P2.x], ['b', 9, P2.b], ['p', 10, P2.p], ['e', 11, P2.e]] as [string, number, number][]).map(([nm, i, at]) => (
            <div key={nm} ref={pin(`b:span:${i}:${i}`)} className={`st-pin st-bit sb t-${nm === 'n' || nm === 'i' ? 'ni' : nm === 'b' || nm === 'p' ? 'bp' : nm}`} style={when(at, 2, 0.02)}><span>{nm}</span></div>
          ))}
          <div ref={pin('b:span:12:23')} className="st-pin st-bit sb t-disp" style={when(P2.disp + 0.04, 2, 0.02)}><span>disp</span></div>
          {Array.from(ldx.code).map((d, j) => <div key={j} ref={pin(`b:nib:${j}`)} className="st-pin st-hex sb" style={when(P2.hex + j * P2.hexStep, 2, 0.015)}><span>{d}</span></div>)}
        </>
      )}
      {phase === 8 && ch === CH.PASS2 && (
        <div className="st-pick st-bc" dir="ltr">
          {story.lines.filter((l) => l.code).map((l) => {
            const i = story.lines.indexOf(l), on = (pick < 0 ? ldx : story.lines[pick]) === l;
            return <button key={l.idx} className={'st-chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => { clock.current.pick = i; setPick(i); }}>{l.text}</button>;
          })}
          <button className="st-btn pri" dir={lang === 'ar' ? 'rtl' : 'ltr'} onClick={() => onOpenLab(p2line.idx)}>{tx(T.pass2.open)}</button>
        </div>
      )}
    </section>
  ), [...shared, ch === CH.PASS2, phase, pick]); // eslint-disable-line react-hooks/exhaustive-deps

  // 5 · addressing
  const chAddr = useMemo(() => (
    <section className="st-ch" {...layer(CH.ADDR)}>
      <div className="st-copy st-tl">
        <Head h={tx(T.addr.h)} m={tx(T.addr.m)} a={0.02} z={2} />
        <p className="st-eq sb" style={when(0.04)} dir="ltr">{aline ? aline.text : far?.text} <i>→</i> <b>{acode}</b></p>
        {ab === 2 && <p className="st-note"><Rich s={tx(T.addr.from)} /></p>}
      </div>
      <div className="st-step st-tr sb" style={when(0.04)} key={ab}>
        <p className="st-p"><Rich s={tx(T.addr.beats[ab])} /></p>
        {dispAt > 0 && ab < 2 && <p className="st-how plain">{ahow[dispAt - 1].t}</p>}
        {dispAt >= 0 && <p className="st-how t-disp">{ahow[dispAt].t}</p>}
      </div>
      {bitLabels(afields, acode)}
      {ab < 2 && <div ref={pin('r:pc')} className="st-pin st-tag am sb" style={when(0.05, 0.66, 0.03)}><span dir="ltr">PC <b>{hex(ab === 0 ? tix.locAfter : jlt.locAfter)}</b></span></div>}
      {ab === 0 && <div ref={pin('r:arc:0')} className="st-pin st-tag am lg sb" style={when(0.2, 0.355, 0.03)}><span dir="ltr">+{signed12(tix)}</span></div>}
      {ab === 1 && <div ref={pin('r:arc:1')} className="st-pin st-tag am lg sb" style={when(0.54, 0.64, 0.03)}><span dir="ltr">−{Math.abs(signed12(jlt))}</span></div>}
      {ab === 2 && far && (
        <div className="st-range sb" style={when(0.69, 2, 0.03)} dir="ltr">
          <div className="band pc sb" style={{ ...when(0.72, 2, 0.03), left: pos(far.pc - 2048), width: `${(4095 / span) * 100}%` }}><span dir={lang === 'ar' ? 'rtl' : 'ltr'}><Rich s={tx(T.addr.pcReach)} /></span> {hex(far.pc - 2048)}…{hex(far.pc + 2047)}</div>
          <div className="axis">
            <i style={{ left: pos(far.ta) }} className="ta"><b>BUFFER</b> {hex(far.ta)}</i>
            <i style={{ left: pos(far.pc) }}><b>PC</b> {hex(far.pc)}</i>
          </div>
          <div className="band bb sb" style={{ ...when(0.82, 2, 0.03), left: pos(far.base), width: `${(4095 / span) * 100}%` }}><span dir={lang === 'ar' ? 'rtl' : 'ltr'}><Rich s={tx(T.addr.bReach)} /></span> {hex(far.base)}…{hex(far.base + 4095)}</div>
        </div>
      )}
    </section>
  ), [...shared, ch === CH.ADDR, ab]); // eslint-disable-line react-hooks/exhaustive-deps

  // 6 · formats
  const chFormats = useMemo(() => (
    <section className="st-ch" {...layer(CH.FORMATS)}>
      <div className="st-copy st-tl">
        <Head h={tx(T.formats.h)} m={tx(T.formats.m)} a={0.04} />
        <p className="st-eq sb" style={when(0.06, 0.97)} dir="ltr">{addrLine.text} <i>→</i> <b>{addrLine.code}</b></p>
        <p className="st-p sb" style={when(0.1, 0.97)}><Rich s={tx(T.formats.p)} /></p>
      </div>
      <div className="st-fmt st-tr sb" style={when(0.14, 0.97)}>
        {FMT.map((row, i) => {
          const total = row.reduce((s, [w]) => s + w, 0), [name, what] = (k ? T.formats.rowsAr : T.formats.rows)[i];
          return (
            <div key={i} className={'f' + (i === 1 ? ' cur' : '')}>
              <div className="nm"><b dir="ltr">{name}</b><span>{what}</span></div>
              <div className="bx" dir="ltr" style={{ width: `${(total / 32) * 100}%` }}>{row.map(([w, nm]) => <span key={nm} style={{ flexGrow: w }}>{nm}<small>{w}</small></span>)}</div>
            </div>
          );
        })}
      </div>
      {bitLabels(addrLine.fields, addrLine.code, 0.04, 0.97)}
    </section>
  ), [...shared, ch === CH.FORMATS]); // eslint-disable-line react-hooks/exhaustive-deps

  // 7 · object program
  const chObject = useMemo(() => (
    <section className="st-ch" {...layer(CH.OBJECT)}>
      <div className="st-copy st-tl">
        <Head h={tx(T.object.h)} m={tx(T.object.m)} a={0.06} />
        <p className="st-p sb" style={when(0.1, 0.97)}><Rich s={tx(T.object.p)} /></p>
      </div>
      <div className="st-rec st-tr sb" style={when(0.5, 0.97)}>
        {([[H, T.object.H], [TR, T.object.Tr], [E, T.object.E]] as [string[], Two[]][]).map(([parts, caps], r) => (
          <div key={r} className="rec">
            <b dir="ltr">{parts[0]}</b>
            {parts.slice(1).map((p, i) => <span key={i}><code dir="ltr">{p.trim()}</code><small>{caps[i] ? tx(caps[i]) : ''}</small></span>)}
          </div>
        ))}
      </div>
    </section>
  ), [...shared, ch === CH.OBJECT]); // eslint-disable-line react-hooks/exhaustive-deps

  // 8 · loader
  const chLoader = useMemo(() => (
    <section className="st-ch" {...layer(CH.LOADER)}>
      <div className="st-copy st-tl slim">
        <Head h={tx(T.loader.h)} m={tx(T.loader.m)} a={0.1} />
        <p className="st-p sb" style={when(0.16, 0.97)}><Rich s={tx(T.loader.p)} /></p>
      </div>
    </section>
  ), [...shared, ch === CH.LOADER]); // eslint-disable-line react-hooks/exhaustive-deps

  // 9 · run
  const chRun = useMemo(() => (
    <section className="st-ch" {...layer(CH.RUN)}>
      <div className="st-copy st-tl slim">
        <Head h={tx(T.run.h)} m={`A = ${aNow}`} a={0.01} z={2} />
        <div className="st-now sb" style={when(0.04)}>
          <small>{tx(T.run.step)} {rs + 1} {tx(UI.of)} {N}</small>
          <strong dir="ltr">{runLine?.text ?? fr.step.instruction.disassembly}</strong>
          <p>{explain(fr.step.instruction, lang)}</p>
          <p className="chg" dir="ltr">{rdone ? changes.map((c) => `${c.reg}: ${toSigned24(c.oldValue)} → ${toSigned24(c.newValue)}`).concat(fr.step.memoryChanges.length ? [`mem ${hex(fr.step.memoryChanges[0].address)}`] : []).concat(fr.cc !== (prev?.cc ?? 'EQ') ? [`CC: ${fr.cc}`] : []).join('   ') || ' ' : ' '}</p>
          {rs === N - 1 && rdone && <p className="end"><Rich s={tx(T.run.end)} /></p>}
        </div>
      </div>
      <ul className="st-legend st-br sb" style={when(0.04)}>
        {T.run.legend.map((l, i) => <li key={i} className={['cy', 'am', 'gr'][i]}>{tx(l)}</li>)}
      </ul>
    </section>
  ), [...shared, ch === CH.RUN, rb]); // eslint-disable-line react-hooks/exhaustive-deps

  // 10 · your turn
  const chOutro = useMemo(() => (
    <section className="st-ch" {...layer(CH.OUTRO)}>
      <div className="st-copy st-bl out">
        <Head h={tx(T.outro.h)} m={tx(T.outro.m)} a={0.5} z={2} />
        <p className="st-p sb" style={when(0.56)}>{tx(T.outro.p)}</p>
        <div className="st-acts sb" style={when(0.62)}>
          <button className="st-btn pri lg" onClick={() => onOpenLab()}>{tx(T.outro.open)}</button>
          <button className="st-btn" onClick={() => jump(0)}>{tx(T.outro.again)}</button>
        </div>
        <p className="st-note sb" style={when(0.7)}>{tx(T.outro.note)}</p>
      </div>
    </section>
  ), [...shared, ch === CH.OUTRO]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="st" ref={root} data-theme="light">
      <div className="st-bg" />
      <div className="st-ghost" ref={ghost} dir="ltr" aria-hidden="true">{ldx.text}</div>
      <div className="st-canvas" aria-hidden="true"><Scene story={sceneStory} clock={clock} pins={pins} /></div>

      <header className="st-top">
        <div className="brand"><b>SIC/XE</b> Lab</div>
        <div className="st-tools">
          <button className="st-btn ghost" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} aria-label={tx(UI.langLabel)} lang={lang === 'ar' ? 'en' : 'ar'}><Languages size={16} /> {tx(UI.lang)}</button>
          <button className="st-btn" onClick={() => onOpenLab()}>{tx(UI.skip)}</button>
        </div>
      </header>

      <main>
        {chHero}
        {chMachine}
        {chBytes}
        {chPass1}
        {chPass2}
        {chAddr}
        {chFormats}
        {chObject}
        {chLoader}
        {chRun}
        {chOutro}
      </main>

      <nav className="st-index" aria-label={tx(UI.chapters)}>
        {NAMES.map((nm, i) => <button key={i} className={i === ch ? 'on' : ''} aria-current={i === ch ? 'step' : undefined} onClick={() => toChapter(i)} title={nm[k]} aria-label={nm[k]} />)}
      </nav>

      <footer className="st-hud">
        <div className="where"><span dir="ltr">{String(ch).padStart(2, '0')} / {String(COUNT - 1).padStart(2, '0')}</span><b>{NAMES[ch][k]}</b></div>
        <div className="loc" dir="ltr"><span>LOCCTR</span><i><i ref={fill} /></i><b ref={locEl}>0000</b></div>
      </footer>

      <div className="st-space" style={{ height: `calc(${TOTAL + 1} * 100vh)` }} />
    </div>
  );
}

