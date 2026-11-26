// Memory drawn as a ruler, one mark per byte. Pass 1 lays each source line on it as a block as long as its bytes,
// plants a flag for every label, and the location counter (LOCCTR) slides along as it measures.
// Later the same blocks receive their object code, become the T record, and fly into the machine's memory.
import * as THREE from 'three';
import { AMBER, CYAN, Label, M, MONO, clamp01, contactShadow, io, mix, outBack, rbox, roundRect, text, unitPlane } from './kit.ts';

export interface RLine { loc: number; size: number; text: string; code: string }
export interface RSymbol { name: string; address: number }
export interface RArc { from: number; to: number; color: string }

export const PITCH = 0.5;
const RAIL_H = 0.12, BLOCK_H = 0.46, BLOCK_D = 0.56;
const hex = (n: number, w = 4) => n.toString(16).toUpperCase().padStart(w, '0');

interface Block {
  line: RLine; group: THREE.Group; mat: THREE.MeshPhysicalMaterial; src: THREE.MeshBasicMaterial; code: THREE.MeshBasicMaterial;
  home: THREE.Vector3; w: number;
}

export class Ruler {
  group = new THREE.Group();
  // ---- what the director sets every frame ----
  placed: number[]; coded: number[]; flags: number[]; fly: number[];
  cursor = 0; cursorOn = 0; pc = 0; pcOn = 0; arcs: number[]; hi = -1; tape = 0; caps = 0; flagsOff = 0;
  flyTo: ((loc: number, size: number, out: THREE.Vector3) => void) | null = null;

  private n: number;
  private blocks: Block[] = [];
  private flagObjs: THREE.Group[] = [];
  private cur: THREE.Group; private pcMark: THREE.Group;
  private arcObjs: { mesh: THREE.Mesh; tip: THREE.Mesh; segs: number; curve: THREE.QuadraticBezierCurve3 }[] = [];
  private capH: THREE.Group; private capE: THREE.Group;
  private v = new THREE.Vector3();

  constructor(lines: RLine[], symbols: RSymbol[], length: number, arcs: RArc[], records: { h: string; e: string }) {
    const m = M();
    this.n = length;
    this.placed = lines.map(() => 0); this.coded = lines.map(() => 0); this.fly = lines.map(() => 0);
    this.flags = symbols.map(() => 0); this.arcs = arcs.map(() => 0);

    // The rail, with a tick and a two-digit address for every byte
    const from = -1.5, to = length + 3.5, len = (to - from) * PITCH, depth = 1.0;
    const rail = new THREE.Mesh(rbox(len, RAIL_H, depth, 0.03, 2), m.rail);
    rail.position.set(this.x((from + to) / 2), RAIL_H / 2, 0.08); rail.castShadow = rail.receiveShadow = true;
    this.group.add(rail);
    const cs = contactShadow(len, depth, 0.4); cs.position.set(this.x((from + to) / 2), 0.004, 0.08); this.group.add(cs);
    const px = 72;
    const marks = new Label(Math.round((to - from) * px), Math.round((depth / PITCH) * px), (g, w, h) => {
      for (let b = Math.ceil(from); b <= to; b++) {
        const x = (b - from) * px, inside = b >= 0 && b < length;
        g.fillStyle = inside || b === length ? '#9fb4d4' : '#4c5d78';
        g.fillRect(x - 1, h * 0.66, 2, b % 4 === 0 ? h * 0.12 : h * 0.07);
        if (b >= 0 && b < to - 0.5) text(g, hex(b, 2), x + px / 2, h * 0.87, px * 0.26, inside ? '#c8d8f0' : '#52688c', 500);
      }
    });
    const top = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ map: marks.tex, transparent: true, toneMapped: false, depthWrite: false }));
    top.scale.set(len, depth, 1); top.rotation.x = -Math.PI / 2; top.position.set(this.x((from + to) / 2), RAIL_H + 0.003, 0.08);
    this.group.add(top);

    // One block per line that takes room in memory
    lines.forEach((line) => {
      const w = line.size * PITCH - 0.06, g = new THREE.Group();
      const mat = m.body.clone(); mat.color.set(line.code ? 0x31445f : 0x1b2434);
      mat.emissive = new THREE.Color(AMBER); mat.emissiveIntensity = 0;
      if (!line.code) { mat.transparent = true; mat.opacity = 0.55; }
      const body = new THREE.Mesh(rbox(w, BLOCK_H, BLOCK_D, 0.05, 3), mat);
      body.castShadow = true; body.receiveShadow = true; g.add(body);
      const fw = w - 0.1, fh = BLOCK_H - 0.1, cw = Math.round(fw * 240), ch = Math.round(fh * 240);
      const fit = (c: CanvasRenderingContext2D, s: string, px0: number, max: number, wt: number) => { c.font = `${wt} ${px0}px ${MONO}`; const mw = c.measureText(s).width; return mw > max ? (px0 * max) / mw : px0; };
      const srcL = new Label(cw, ch, (c, W, H) => text(c, line.text, W / 2, H / 2 + 2, fit(c, line.text, H * 0.5, W - 12, 700), '#eef4ff', 700));
      const codeL = new Label(cw, ch, (c, W, H) => {
        const s = (line.code.match(/../g) ?? []).join(' ');
        text(c, s, W / 2, H / 2 + 2, fit(c, s, H * 0.56, W - 12, 800), AMBER, 800);
      });
      const src = new THREE.MeshBasicMaterial({ map: srcL.tex, transparent: true, toneMapped: false, depthWrite: false });
      const code = new THREE.MeshBasicMaterial({ map: codeL.tex, transparent: true, toneMapped: false, depthWrite: false, opacity: 0 });
      for (const [mt, z] of [[src, 0.002], [code, 0.004]] as const) {
        const p = new THREE.Mesh(unitPlane, mt); p.scale.set(fw, fh, 1); p.position.set(0, 0, BLOCK_D / 2 + z); g.add(p);
      }
      // the same source text on the top face, so the block keeps its name once the code is on the front
      const topL = new Label(cw, Math.round((BLOCK_D - 0.1) * 240), (c, W, H) => text(c, line.text, W / 2, H / 2 + 2, fit(c, line.text, H * 0.36, W - 12, 500), '#a9bbd6', 500));
      const tp = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ map: topL.tex, transparent: true, toneMapped: false, depthWrite: false }));
      tp.scale.set(fw, BLOCK_D - 0.1, 1); tp.rotation.x = -Math.PI / 2; tp.position.y = BLOCK_H / 2 + 0.003; g.add(tp);
      const home = new THREE.Vector3(this.x(line.loc) + (line.size * PITCH) / 2, RAIL_H + BLOCK_H / 2, 0);
      g.position.copy(home); g.visible = false;
      this.group.add(g);
      this.blocks.push({ line, group: g, mat, src, code, home, w });
    });

    // A flag for every label: a pole at its address and its name
    symbols.forEach((s) => {
      const g = new THREE.Group(); g.position.set(this.x(s.address) + 0.03, RAIL_H, -0.34);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.28, 10), m.gold);
      pole.position.y = 0.64; pole.castShadow = true; g.add(pole);
      const L = new Label(300, 96, (c, W, H) => {
        roundRect(c, 2, 2, W - 4, H - 4, 10); c.fillStyle = '#0b1526'; c.fill(); c.lineWidth = 3; c.strokeStyle = CYAN; c.stroke();
        text(c, s.name, 16, H / 2 + 2, 38, '#ffffff', 700, 'left');
        text(c, hex(s.address), W - 14, H / 2 + 2, 32, CYAN, 500, 'right');
      });
      const ban = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ map: L.tex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
      ban.scale.set(0.96, 0.31, 1); ban.position.set(0.5, 1.12, 0); ban.name = 'banner'; g.add(ban);
      g.scale.set(1, 0, 1); g.visible = false;
      this.group.add(g); this.flagObjs.push(g);
    });

    // LOCCTR and PC markers: a blade standing on the rail
    const blade = (color: string) => {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true });
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.5, 0.035), mat); stem.position.y = 0.75; g.add(stem);
      const foot = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), mat); foot.rotation.x = Math.PI; foot.position.y = 0.1; g.add(foot);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: m.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true, opacity: 0.7 }));
      glow.scale.setScalar(0.9); glow.position.y = 0.1; g.add(glow);
      g.position.set(0, RAIL_H, BLOCK_D / 2 + 0.12); g.visible = false; g.userData.mat = mat;
      this.group.add(g); return g;
    };
    this.cur = blade(CYAN); this.pcMark = blade(AMBER);

    // Arcs for displacements: from PC to the target address
    arcs.forEach((a) => {
      const y0 = RAIL_H + BLOCK_H + 0.04, x0 = this.x(a.from), x1 = this.x(a.to) + 0.02;
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x0, y0, 0), new THREE.Vector3((x0 + x1) / 2, y0 + 2.0 + Math.abs(x1 - x0) * 0.08, 0), new THREE.Vector3(x1, y0, 0));
      const segs = 64, mat = new THREE.MeshBasicMaterial({ color: a.color, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.032, 8, false), mat);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 12), mat);
      mesh.visible = tip.visible = false;
      this.group.add(mesh, tip); this.arcObjs.push({ mesh, tip, segs, curve });
    });

    // End caps of the object program: the H record before the code, the E record after it
    const cap = (s: string, w: number) => {
      const g = new THREE.Group();
      const mat = m.body.clone(); mat.color.set(0x0f2a44);
      const body = new THREE.Mesh(rbox(w, BLOCK_H, BLOCK_D, 0.05, 3), mat); body.castShadow = true; g.add(body);
      const L = new Label(Math.round((w - 0.1) * 240), Math.round((BLOCK_H - 0.1) * 240), (c, W, H) => {
        c.font = `700 ${H * 0.5}px ${MONO}`; const mw = c.measureText(s).width, px0 = mw > W - 12 ? (H * 0.5 * (W - 12)) / mw : H * 0.5;
        text(c, s, W / 2, H / 2 + 2, px0, '#9ae4ff', 700);
      });
      const p = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ map: L.tex, transparent: true, toneMapped: false, depthWrite: false }));
      p.scale.set(w - 0.1, BLOCK_H - 0.1, 1); p.position.z = BLOCK_D / 2 + 0.003; g.add(p);
      g.visible = false; this.group.add(g); return g;
    };
    this.capH = cap(records.h, 2.9); this.capE = cap(records.e, 1.5);
    const codeEnd = lines.filter((l) => l.code).reduce((e, l) => Math.max(e, l.loc + l.size), 0);
    this.capH.position.set(this.x(0) - 2.9 / 2 - 0.08, 0, 0);
    this.capE.position.set(this.x(codeEnd) + 1.5 / 2 + 0.08, 0, 0);
  }

  // x of the left edge of a byte
  x(loc: number) { return (loc - this.n / 2) * PITCH; }

  apply() {
    const lift = this.tape * 0.95;
    this.blocks.forEach((b, i) => {
      const p = clamp01(this.placed[i]), f = clamp01(this.fly[i]);
      b.group.visible = p > 0.001 && f < 0.999;
      if (!b.group.visible) return;
      const s = outBack(p);
      b.group.position.copy(b.home);
      b.group.position.y += (1 - io(p)) * 2.4 + (b.line.code ? lift : 0);
      b.group.scale.setScalar(Math.max(0.001, s));
      if (f > 0 && this.flyTo) {
        this.flyTo(b.line.loc, b.line.size, this.v);
        this.group.worldToLocal(this.v);
        const k = 1 - Math.pow(1 - f, 3), y0 = b.group.position.y;
        b.group.position.lerp(this.v, k);
        b.group.position.y = mix(y0, this.v.y, k) + Math.sin(Math.PI * k) * 3.2;
        const q = k * k * k * k; // stay full size for most of the flight, shrink to the cells at the end
        b.group.scale.set(mix(1, (b.line.size * 0.285) / b.w, q), mix(1, 0.2, q), mix(1, 0.45, q));
      }
      const c = clamp01(this.coded[i]);
      b.code.opacity = c; b.src.opacity = 1 - c;
      // the block in focus glows cool; a block receiving its code, or flying to memory, flashes amber
      const flash = Math.sin(Math.PI * c) * 0.45 + Math.sin(Math.PI * f) * 0.5;
      b.mat.emissive.set(flash > 0.04 ? AMBER : CYAN);
      b.mat.emissiveIntensity = flash > 0.04 ? flash : this.hi === i ? 0.3 : 0;
    });
    this.flagObjs.forEach((g, j) => {
      const k = clamp01(this.flags[j]) * (1 - this.tape) * (1 - this.flagsOff);
      g.visible = k > 0.001;
      g.scale.set(1, Math.max(0.001, outBack(k)), 1);
      const ban = g.getObjectByName('banner')!; ban.scale.x = 0.96 * clamp01(k * 1.6);
    });
    this.place(this.cur, this.cursor, this.cursorOn);
    this.place(this.pcMark, this.pc, this.pcOn);
    this.arcObjs.forEach((a, i) => {
      const k = clamp01(this.arcs[i]);
      a.mesh.visible = k > 0.001;
      a.mesh.geometry.setDrawRange(0, Math.floor(k * a.segs) * 8 * 6);
      a.tip.visible = k > 0.97;
      if (a.tip.visible) {
        a.curve.getPoint(1, a.tip.position);
        a.curve.getTangent(1, this.v);
        a.tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.v.normalize());
        a.tip.position.addScaledVector(this.v, -0.1);
      }
    });
    for (const g of [this.capH, this.capE]) {
      g.visible = this.caps > 0.001;
      g.position.y = RAIL_H + BLOCK_H / 2 + lift;
      g.scale.setScalar(Math.max(0.001, outBack(clamp01(this.caps))));
    }
  }
  private place(g: THREE.Group, loc: number, on: number) {
    g.visible = on > 0.01;
    g.position.x = this.x(loc);
    g.scale.set(1, Math.max(0.001, on), 1);
    (g.userData.mat as THREE.MeshBasicMaterial).opacity = on;
  }

  blockIndexAt(loc: number) { return this.blocks.findIndex((b) => b.line.loc === loc && b.line.size > 0); }
  // local x range and top of a block, for the "magnifier" beam of the bit bar
  blockSpan(i: number) { const b = this.blocks[i]; return { x0: b.home.x - b.w / 2, x1: b.home.x + b.w / 2, y: b.home.y + BLOCK_H / 2 + (b.line.code ? this.tape * 0.95 : 0) }; }

  anchor(name: string, out: THREE.Vector3): THREE.Vector3 {
    const [k, a] = name.split(':');
    if (k === 'cursor') return this.group.localToWorld(out.set(this.x(this.cursor), RAIL_H + 1.62, BLOCK_D / 2 + 0.12));
    if (k === 'pc') return this.group.localToWorld(out.set(this.x(this.pc), RAIL_H + 1.62, BLOCK_D / 2 + 0.12));
    if (k === 'arc') { const o = this.arcObjs[+a]; o.curve.getPoint(0.5, out); out.y += 0.16; return this.group.localToWorld(out); }
    if (k === 'loc') return this.group.localToWorld(out.set(this.x(+a), RAIL_H + BLOCK_H, 0));
    return this.group.localToWorld(out.set(0, 0, 0));
  }
}
