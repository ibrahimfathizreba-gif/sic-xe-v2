// Run mode's 3D machine: the same chip the story opens, now driven by the real CPU.
// After each step, light pulses follow the instruction's data path (cyan = fetch, amber = execute, green = store).
// Drag to turn it; press a part to read what it does and what it holds right now.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, invalidate, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import { CellMark, Machine, PartId, PathStage } from './three/machine.ts';
import { AMBER, hooks, loadFonts, makeEnvironment } from './three/kit.ts';
import { Memory } from './sicxe/memory.ts';
import { MemoryChange, RegisterChange, RegisterId, StepResult } from './sicxe/types.ts';
import { toSigned24 } from './sicxe/registers.ts';
import { hex } from './explain.ts';
import { rowRanges } from './memRows.ts';
import { L, Lang } from './i18n.ts';

interface Props {
  reg: Record<RegisterId, number>;
  chRegs: RegisterChange[];
  chMem: MemoryChange[];
  mem: Memory;
  rowAddrs: number[]; // start address of each 16-byte memory row on the board
  pc: number;
  halted: boolean;
  last: StepResult | null;
  steps: number;
  lang: Lang;
}

interface View { az: number; pol: number; dist: number }
const HOME: View = { az: 0.2, pol: 0.6, dist: 20.5 };
const PULSE_MS = 1500;
const CC = ['LT', 'EQ', 'GT'];

// What each part is, in one or two sentences
const PARTS: Record<PartId, { name: [string, string]; does: [string, string] }> = {
  CU: { name: ['Control unit', 'وحدة التحكم'], does: ['Reads the instruction held in IR, works out what it asks for, and tells the other parts what to do.', 'تقرأ التعليمة الموجودة في IR، وتفهم المطلوب، ثم توجّه بقية الأجزاء.'] },
  IR: { name: ['Instruction register (IR)', 'سجل التعليمة (IR)'], does: ['Holds the instruction that is being executed right now.', 'يحمل التعليمة التي تُنفَّذ الآن.'] },
  ALU: { name: ['Arithmetic and logic unit (ALU)', 'وحدة الحساب والمنطق (ALU)'], does: ['Does the arithmetic and the comparisons: add, subtract, multiply, divide, compare.', 'تجري الحساب والمقارنة: جمع وطرح وضرب وقسمة ومقارنة.'] },
  PC: { name: ['Program counter (PC)', 'عداد البرنامج (PC)'], does: ['The address of the next instruction. It moves forward after every fetch, and a jump changes it.', 'عنوان التعليمة التالية. يتقدم بعد كل جلب، والقفز يغيّره.'] },
  A: { name: ['Register A, the accumulator', 'السجل A، المركم'], does: ['Where arithmetic happens and where results land.', 'هنا تُجرى العمليات الحسابية وتُحفظ نتائجها.'] },
  X: { name: ['Register X, the index', 'السجل X، الفهرسة'], does: ['Counts the turns of a loop, and is added to an address when the operand ends with ,X.', 'يعدّ دورات الحلقة، ويُضاف إلى العنوان عندما ينتهي المعامل بـ ‎,X‎.'] },
  L: { name: ['Register L, the linkage', 'السجل L، عنوان الرجوع'], does: ['JSUB stores the return address here, and RSUB jumps back to it.', 'تحفظ JSUB عنوان الرجوع هنا، ثم تقفز RSUB إليه.'] },
  B: { name: ['Register B, the base', 'السجل B، القاعدة'], does: ['The starting point for base-relative addressing.', 'نقطة البداية في العنونة النسبية للقاعدة.'] },
  S: { name: ['Register S', 'السجل S'], does: ['A general register, free for the program to use.', 'سجل عام يستخدمه البرنامج كما يشاء.'] },
  T: { name: ['Register T', 'السجل T'], does: ['A general register, free for the program to use.', 'سجل عام يستخدمه البرنامج كما يشاء.'] },
  SW: { name: ['Status word (SW)', 'كلمة الحالة (SW)'], does: ['Keeps the result of the last comparison: less, equal or greater. Conditional jumps read it.', 'تحفظ نتيجة آخر مقارنة: أصغر أو يساوي أو أكبر. وتقرؤها تعليمات القفز المشروط.'] },
  MEM: { name: ['Memory', 'الذاكرة'], does: ['1 MB of bytes. The program and its data live here. The board shows the rows this program uses.', '1 ميغابايت من البايتات، فيها البرنامج وبياناته. اللوحة تعرض الصفوف التي يستخدمها هذا البرنامج.'] },
  BUS: { name: ['Bus', 'الناقل'], does: ['Copper lines that carry addresses and data between the parts. A pulse of light shows what has just travelled.', 'خطوط نحاسية تنقل العناوين والبيانات بين الأجزاء. نبضة الضوء تبيّن ما انتقل للتو.'] },
};

interface Api { pick: (x: number, y: number) => PartId | null }

function Rig({ p, view, sel, hover, api }: { p: Props; view: React.RefObject<View>; sel: PartId | null; hover: PartId | null; api: React.RefObject<Api | null> }) {
  const gl = useThree((s) => s.gl), scene = useThree((s) => s.scene), camera = useThree((s) => s.camera);
  const machine = useMemo(() => {
    loadFonts();
    const m = new Machine();
    m.setExplode(0, 1); // no lid: we are looking inside
    return m;
  }, []);
  const anim = useRef<{ start: number; stages: PathStage[] | null }>({ start: 0, stages: null });

  useEffect(() => {
    const env = makeEnvironment(gl);
    scene.environment = env; scene.environmentIntensity = 0.75;
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8894a8, 0.35);
    const key = new THREE.DirectionalLight(0xfff4e6, 1.9); key.position.set(-8, 17, 9);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 50; sc.updateProjectionMatrix();
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    const fill = new THREE.DirectionalLight(0xbfd6ff, 0.6); fill.position.set(12, 6, -4);
    scene.add(machine.group, hemi, key, fill);
    // nothing that casts a shadow ever moves here, so the shadows are drawn once and kept
    gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true;
    const redo = () => { gl.shadowMap.needsUpdate = true; invalidate(); };
    gl.domElement.addEventListener('webglcontextrestored', redo);
    hooks.changed = () => invalidate();
    const ray = new THREE.Raycaster(), v = new THREE.Vector2();
    api.current = {
      pick: (x, y) => {
        v.set(x, y); ray.setFromCamera(v, camera);
        return (ray.intersectObjects(machine.pickables, false)[0]?.object.userData.part as PartId) ?? null;
      },
    };
    return () => { hooks.changed = () => {}; gl.shadowMap.autoUpdate = true; gl.domElement.removeEventListener('webglcontextrestored', redo); scene.remove(machine.group, hemi, key, fill); scene.environment = null; env.dispose(); machine.dispose(); api.current = null; };
  }, [gl, scene, camera, machine, api]);

  // Show the machine's state after the last step, and start the pulses for it
  const rowsKey = p.rowAddrs.join(',');
  useEffect(() => {
    machine.setRows(p.rowAddrs);
    const marks = new Map<number, CellMark>();
    if (!p.halted) marks.set(p.pc, 'pc');
    for (const c of p.chMem) c.newBytes.forEach((_, i) => marks.set(c.address + i, 'write'));
    machine.setMemory((a) => (a < p.mem.size ? p.mem.getByte(a) : 0), marks);
    for (const id of ['A', 'X', 'L', 'B', 'S', 'T'] as const) {
      const u = p.reg[id], s = String(toSigned24(u));
      machine.setDisplay(id, s.length <= 6 ? s : hex(u, 6));
    }
    machine.setDisplay('SW', CC[p.reg.SW & 3] ?? '');
    machine.setDisplay('PC', hex(p.pc, 4));
    machine.setDisplay('IR', p.last ? p.last.instruction.disassembly : '');
    machine.commit();
    anim.current = { start: performance.now(), stages: p.last ? machine.dataPath(p.last) : null };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine, p.steps, p.last, rowsKey, p.pc, p.halted, p.mem]);
  useEffect(() => { invalidate(); }, [sel, hover]);

  useFrame((state) => {
    const w = view.current!, cam = state.camera;
    const r = w.dist * Math.max(1, 1.5 / (state.size.width / state.size.height));
    cam.position.set(Math.sin(w.az) * Math.sin(w.pol) * r, Math.cos(w.pol) * r, Math.cos(w.az) * Math.sin(w.pol) * r + 0.2);
    cam.lookAt(0, 0, 0.2);
    const a = anim.current, f = (performance.now() - a.start) / PULSE_MS;
    if (a.stages && f < 1.25) { machine.drawPath(a.stages, f * 1.2); state.invalidate(); }
    else { machine.clearPath(); machine.clearHot(); }
    // registers that just changed glow amber for a moment
    if (f < 1) for (const c of p.chRegs) if (c.reg !== 'PC' && c.reg !== 'F') machine.setHot(c.reg as PartId, Math.max(0, 1 - f) * 0.9, AMBER);
    if (hover && hover !== 'MEM' && hover !== 'BUS') machine.setHot(hover, 0.35);
    if (sel && sel !== 'MEM' && sel !== 'BUS') machine.setHot(sel, 0.7);
    machine.setBusGlow(sel === 'BUS' ? 0.6 : hover === 'BUS' ? 0.3 : 0);
  });
  return null;
}

class Safe extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  render() { return this.state.bad ? this.props.fallback : this.props.children; }
}

export default function Machine3D(p: Props) {
  const T = (en: string, ar: string) => L(p.lang, en, ar);
  const view = useRef<View>({ ...HOME });
  const api = useRef<Api | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);
  const [sel, setSel] = useState<PartId | null>(null);
  const [hover, setHover] = useState<PartId | null>(null);

  const at = (e: React.PointerEvent): PartId | null => {
    const r = box.current!.getBoundingClientRect();
    return api.current?.pick(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1) ?? null;
  };
  const zoom = (k: number) => { view.current.dist = Math.max(8, Math.min(30, view.current.dist * k)); invalidate(); };

  const now = (id: PartId): string => {
    if (id === 'PC') return hex(p.pc, 4);
    if (id === 'IR') return p.last ? p.last.instruction.disassembly : T('nothing yet', 'لا شيء بعد');
    if (id === 'SW') return ({ LT: T('less than', 'أصغر من'), EQ: T('equal', 'يساوي'), GT: T('greater than', 'أكبر من') } as Record<string, string>)[CC[p.reg.SW & 3]] ?? '';
    if (id === 'MEM') return rowRanges(p.rowAddrs, hex);
    if (id === 'CU' || id === 'ALU' || id === 'BUS') return '';
    const u = p.reg[id as RegisterId];
    return `${toSigned24(u)}  (0x${hex(u, 6)})`;
  };

  return (
    <div
      className="stage" ref={box}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button,.stageinfo')) return; drag.current = { x: e.clientX, y: e.clientY, moved: 0 }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) { const h = at(e); if (h !== hover) setHover(h); return; }
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
        view.current.az -= dx * 0.006;
        view.current.pol = Math.max(0.12, Math.min(1.38, view.current.pol - dy * 0.005));
        invalidate();
      }}
      onPointerUp={(e) => { const d = drag.current; drag.current = null; if (d && d.moved < 6) setSel(at(e)); }}
      onPointerLeave={() => setHover(null)}
      style={hover ? { cursor: 'pointer' } : undefined}
    >
      <Safe fallback={<p className="hint stagehint">{T('The 3D view needs WebGL, which this browser has switched off.', 'العرض ثلاثي الأبعاد يحتاج WebGL، وهو غير مفعّل في هذا المتصفح.')}</p>}>
        <Canvas frameloop="demand" dpr={[1, 1.5]} shadows="percentage" gl={{ antialias: true, alpha: true }} camera={{ fov: 30, near: 0.1, far: 200 }}
          onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; gl.setClearColor(0x000000, 0); }}>
          <Rig p={p} view={view} sel={sel} hover={hover} api={api} />
        </Canvas>
      </Safe>
      <span className="hint stagehint">{T('Drag to turn · press a part to see what it does', 'اسحب للتدوير · اضغط على قطعة لترى وظيفتها')}</span>
      <span className="hint stagemem"><i className="k cy" />{T('fetch', 'جلب')} <i className="k am" />{T('execute', 'تنفيذ')} <i className="k gr" />{T('store', 'تخزين')}</span>
      <div className="stagetools">
        <button className="link icon" onClick={() => zoom(0.85)} aria-label={T('Zoom in', 'تكبير')} title={T('Zoom in', 'تكبير')}><Plus size={18} /></button>
        <button className="link icon" onClick={() => zoom(1.18)} aria-label={T('Zoom out', 'تصغير')} title={T('Zoom out', 'تصغير')}><Minus size={18} /></button>
        <button className="link icon" onClick={() => { view.current = { ...HOME }; invalidate(); }} aria-label={T('Reset view', 'إعادة العرض')} title={T('Reset view', 'إعادة العرض')}><RotateCcw size={17} /></button>
      </div>
      {sel && (
        <aside className="stageinfo" aria-live="polite">
          <button className="link icon" onClick={() => setSel(null)} aria-label={T('Close', 'إغلاق')}><X size={17} /></button>
          <h3>{PARTS[sel].name[p.lang === 'ar' ? 1 : 0]}</h3>
          <p>{PARTS[sel].does[p.lang === 'ar' ? 1 : 0]}</p>
          {now(sel) && <p className="val"><span>{sel === 'MEM' ? T('On the board', 'على اللوحة') : T('Now', 'الآن')}</span> <b dir="ltr">{now(sel)}</b></p>}
        </aside>
      )}
    </div>
  );
}
