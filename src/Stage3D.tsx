import React, { useMemo, useRef, useState } from 'react';
import { Memory } from './sicxe/memory.ts';
import { MemoryChange, RegisterChange, RegisterId, StepResult } from './sicxe/types.ts';
import { toSigned24 } from './sicxe/registers.ts';
import { hex } from './explain.ts';
import { rowIndex, rowRanges } from './memRows.ts';

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
}

type Pt = [number, number];
interface Node { x: number; z: number; e: number; w: number; d: number; c: string }

// ---- Board layout (ground plane: x right, z toward viewer) ----
const BUS = -45, ADDR_Z = -58, DATA_Z = -32, IFX = -8, CHIPX = 64, SPEED = 650;
const NODES: Record<string, Node> = {};
(['CU', 'IR', 'ALU', 'PC'] as const).forEach((id, i) => {
  NODES[id] = { x: -280 + i * 75, z: -105, e: -82, w: 72, d: 46, c: { CU: '#c2562b', IR: '#1f8fb5', ALU: '#b8860b', PC: '#2b6fc4' }[id] };
});
(['A', 'X', 'L', 'B', 'S', 'T', 'SW'] as RegisterId[]).forEach((id, i) => {
  NODES[id] = { x: -293 + i * 44, z: -5, e: -28, w: 38, d: 46, c: '#2b5d9c' };
});
const toBus = (n: Node): Pt[] => [[n.x, n.e], [n.x, BUS]];
const link = (a: Node, b: Node): Pt[] => [...toBus(a), ...toBus(b).reverse()];
const cellAt = (n: number): Pt => [76 + (n % 16) * 16, -92 + Math.floor(n / 16) * 16];
const toMem = (a: Node, z: number, cell: Pt): Pt[] => [...toBus(a), [IFX, BUS], [IFX, z], [CHIPX, z], [CHIPX, cell[1]], cell];
const TRACES: Pt[][] = [
  [[-300, BUS], [IFX, BUS]], [[IFX, ADDR_Z], [IFX, DATA_Z]],
  [[IFX, ADDR_Z], [CHIPX, ADDR_Z]], [[IFX, DATA_Z], [CHIPX, DATA_Z]],
  ...Object.values(NODES).map(toBus),
];

function Slab(p: { x: number; z: number; w: number; d: number; h: number; c: string; lift?: number; label?: string; sub?: string; cls?: string; hit?: number }) {
  const st = { '--w': p.w + 'px', '--d': p.d + 'px', '--h': p.h + 'px', '--c': p.c, '--hd': (p.hit ?? 0) + 's', transform: `translate3d(${p.x}px,${-(p.lift ?? 0)}px,${p.z}px)` } as React.CSSProperties;
  return (
    <div className={'sl ' + (p.cls ?? '') + (p.hit !== undefined ? ' hit' : '')} style={st}>
      <i className="sf s1" /><i className="sf s2" /><i className="sf s3" /><i className="sf s4" />
      <i className="sf s0"><b>{p.label}</b>{p.sub}</i>
    </div>
  );
}

// A flat strip lying on the board between two ground points
function Flat({ a, b, cls, delay, color, y }: { a: Pt; b: Pt; cls: string; delay?: number; color?: string; y: number }) {
  const horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const st = {
    transform: `translate3d(${Math.min(a[0], b[0])}px,${y}px,${Math.min(a[1], b[1])}px) rotateX(90deg)${horiz ? '' : ' rotateZ(90deg)'}`,
    width: Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) + 3,
    animationDelay: (delay ?? 0) + 's',
    '--c': color,
  } as React.CSSProperties;
  return <div className={cls} style={st} />;
}

export function Stage3D({ reg, chRegs, chMem, mem, rowAddrs, pc, halted, last, steps }: Props) {
  const START = { x: -45, y: -18 };
  const [rot, setRot] = useState(START);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const win = rowAddrs.length * 16;
  const rowsKey = rowAddrs.join(',');

  // The logical data path of the last executed instruction, as lightning pieces along the traces
  const plan = useMemo(() => {
    const stages: { pts: Pt[]; color: string; ids: [string?, string?] }[] = [];
    const hits: Record<string, number> = {};
    const pieces: { a: Pt; b: Pt; delay: number; color: string; y: number }[] = [];
    if (last) {
      const d = last.instruction, m = d.mnemonic.replace('+', '');
      const N = (id?: string) => NODES[id ?? 'A'] ?? NODES.A;
      // Address not on the board (should not happen: App always adds the rows it needs) -> stop at the chip edge
      const cell = (a: number): Pt => { const i = rowIndex(rowAddrs, a); return i === null ? [CHIPX, -92] : cellAt(i); };
      const S = (pts: Pt[], color: string, from?: string, to?: string) => stages.push({ pts, color, ids: [from, to] });
      const cy = '#38bdf8', am = '#fbbf24', gr = '#34d399';
      const alu = /^(ADD|SUB|MUL|DIV|AND|OR|COMP|TIX|ADDR|SUBR|MULR|DIVR|COMPR|TIXR|SHIFTL|SHIFTR)$/.test(m);
      const dest = last.registerChanges.find((c) => c.reg !== 'PC')?.reg ?? (alu ? 'SW' : 'A');
      S(toMem(N('PC'), ADDR_Z, cell(last.pcBefore)), cy, 'PC');                      // 1. fetch: PC -> address bus -> memory
      S([...toMem(N('IR'), DATA_Z, cell(last.pcBefore))].reverse(), cy, undefined, 'IR'); // 2. memory -> data bus -> IR
      S(link(N('IR'), N('CU')), cy, 'IR', 'CU');                                     // 3. decode
      if (last.memoryChanges.length) {                                               // store
        const sr = m.match(/^ST([AXLBST])$/)?.[1] ?? 'A', ma = last.memoryChanges[0].address;
        S(toMem(N('CU'), ADDR_Z, cell(ma)), am, 'CU');
        S(toMem(N(sr), DATA_Z, cell(ma)), gr, sr);
      } else if (d.format === 2) {                                                   // register-to-register
        const s1 = d.r1 ?? 'A', s2 = d.r2 ?? s1;
        if (m === 'RMO') S(link(N(s1), N(s2)), am, s1, s2);
        else if (m === 'CLEAR') S(link(N('CU'), N(s1)), am, 'CU', s1);
        else { S(link(N(s1), N('ALU')), am, s1, 'ALU'); if (s2 !== s1) S(link(N(s2), N('ALU')), am, s2, 'ALU'); S(link(N('ALU'), N(s2)), am, 'ALU', s2); }
      } else if (m === 'RSUB') S(link(N('L'), N('PC')), am, 'L', 'PC');
      else if (/^J/.test(m)) S(link(N('CU'), N('PC')), am, 'CU', 'PC');             // jump: CU loads PC
      else {                                                                         // load / arithmetic with a memory or immediate operand
        const target = alu ? 'ALU' : dest;
        if (alu) S(link(N('A'), N('ALU')), am, 'A', 'ALU');
        if (d.addressingMode === 'immediate') S(link(N('IR'), N(target)), am, 'IR', target);
        else if (d.targetAddress !== undefined) {
          S(toMem(N('CU'), ADDR_Z, cell(d.targetAddress)), am, 'CU');
          S([...toMem(N(target), DATA_Z, cell(d.targetAddress))].reverse(), am, undefined, target);
        }
        if (alu) S(link(N('ALU'), N(dest)), am, 'ALU', dest);
      }
      let t = 0;
      for (const st of stages) {
        let dist = 0;
        for (let k = 0; k < st.pts.length - 1; k++) {
          const [x0, z0] = st.pts[k], [x1, z1] = st.pts[k + 1];
          const L = Math.abs(x1 - x0) + Math.abs(z1 - z0), n = Math.max(1, Math.ceil(L / 24));
          for (let i = 0; i < n; i++) {
            const a: Pt = [x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n];
            const b: Pt = [x0 + ((x1 - x0) * (i + 1)) / n, z0 + ((z1 - z0) * (i + 1)) / n];
            pieces.push({ a, b, delay: t + (dist + (L * i) / n) / SPEED, color: st.color, y: a[0] > CHIPX ? -18 : -7 });
          }
          dist += L;
        }
        if (st.ids[0]) hits[st.ids[0]] = Math.min(hits[st.ids[0]] ?? 99, t);
        if (st.ids[1]) hits[st.ids[1]] = Math.min(hits[st.ids[1]] ?? 99, t + dist / SPEED);
        t += dist / SPEED + 0.05;
      }
    }
    return { pieces, hits };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last, steps, rowsKey]);

  const fmt = (id: string) => {
    if (id === 'IR') return last ? last.instruction.disassembly : '—';
    if (id === 'PC') return hex(pc, 4);
    if (id === 'CU' || id === 'ALU') return '';
    const u = reg[id as RegisterId], v = toSigned24(u);
    return String(v).length <= 5 ? String(v) : hex(u, 6);
  };
  const s = typeof window !== 'undefined' ? Math.max(0.45, Math.min(1, window.innerWidth / 800)) : 1;

  return (
    <div
      className="stage"
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
        drag.current = { x: e.clientX, y: e.clientY };
        setRot((r) => ({ x: Math.max(-85, Math.min(-10, r.x - dy * 0.4)), y: r.y + dx * 0.4 }));
      }}
      onPointerUp={() => { drag.current = null; }}
    >
      <span className="hint stagehint">Drag to rotate · cyan = fetch · amber = execute · green = store</span>
      <span className="hint stagemem">Memory on board: {rowRanges(rowAddrs, hex)}</span>
      <button className="link stagereset" onPointerDown={(e) => e.stopPropagation()} onClick={() => setRot(START)}>Reset view</button>
      <div className="scene" style={{ transform: `scale(${s}) rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}>
        <div className="floor" />
        <div key={steps} className="world">
          <Slab x={-155} z={-45} w={330} d={262} h={5} c="#0f2a47" cls="die" label="CPU" />
          <Slab x={194} z={-25} w={272} d={170} h={5} c="#0f2a47" cls="die" label="MEMORY" />
          {TRACES.map((poly, i) => poly.slice(1).map((q, k) => <Flat key={i + '-' + k} a={poly[k]} b={q} cls="tr" y={-6} />))}
          {Object.entries(NODES).map(([id, n]) => (
            <Slab key={id} x={n.x} z={n.z} w={n.w} d={n.d} h={id === 'ALU' ? 20 : 14} lift={5} c={n.c} label={id} sub={fmt(id)}
              cls={chRegs.some((c) => c.reg === id) && id !== 'PC' ? 'hot' : ''} hit={plan.hits[id]} />
          ))}
          {Array.from({ length: win }, (_, n) => {
            const a = rowAddrs[Math.floor(n / 16)] + (n % 16), [cx, cz] = cellAt(n), v = mem.getByte(a);
            const isPc = a === pc && !halted, ch = chMem.some((m) => a >= m.address && a < m.address + m.newBytes.length);
            return <Slab key={a} x={cx} z={cz} w={12} d={12} h={3 + (v / 255) * 8} lift={5} c={isPc ? '#38bdf8' : ch ? '#34d399' : `hsl(215 55% ${18 + (v / 255) * 34}%)`} cls={isPc || ch ? 'lit' : ''} />;
          })}
          {plan.pieces.map((p, i) => <Flat key={i} a={p.a} b={p.b} cls="pu" delay={p.delay} color={p.color} y={p.y} />)}
        </div>
      </div>
    </div>
  );
}
