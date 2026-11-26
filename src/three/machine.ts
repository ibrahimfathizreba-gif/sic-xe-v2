// The SIC/XE machine as one chip: a package with gold leads, a silicon die carrying the control unit,
// the registers, the ALU and a block of memory joined by copper buses, and a metal lid on top.
// The story opens it layer by layer; Run mode shows it without the lid and lights the real data path.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AMBER, CYAN, GREEN, Label, M, MONO, P3, clamp01, contactShadow, pathAt, pathLength, rbox, roundRect, text, topPlane } from './kit.ts';
import type { StepResult } from '../sicxe/types.ts';

export type PartId = 'CU' | 'IR' | 'ALU' | 'PC' | 'A' | 'X' | 'L' | 'B' | 'S' | 'T' | 'SW' | 'MEM' | 'BUS';

interface Node { id: PartId; x: number; z: number; w: number; d: number; h: number; tint: string }

// ---- Floor plan of the die (x to the right, z towards the viewer) ----
const SUB_H = 0.34, DIE_H = 0.16, TOP = SUB_H + DIE_H;
const R1 = -1.5, R2 = 1.45, BUSZ = -0.1, IFX = -0.2, ADDRZ = -0.5, DATAZ = 0.3;
const MEM = { x0: 0.7, z0: -0.82, p: 0.285, cols: 16, rows: 8, gut: 0.45, slab: 0.12, cap: 0.1 };
const DIE = { x0: -5.25, x1: 5.5, z0: -2.3, z1: 2.3 };
const PKG = 0.85; // how far the package reaches past the die
const OFFX = -(DIE.x0 + DIE.x1) / 2;
const Y_TR = TOP + 0.035, Y_MEM = TOP + MEM.slab + MEM.cap + 0.03;
const MEM_EDGE = MEM.x0 - MEM.gut;

const NODES: Node[] = [
  { id: 'CU', x: -4.3, z: R1, w: 1.0, d: 0.8, h: 0.34, tint: '#f08a5d' },
  { id: 'IR', x: -2.87, z: R1, w: 1.5, d: 0.8, h: 0.34, tint: '#38bdf8' },
  { id: 'ALU', x: -1.42, z: R1, w: 1.05, d: 0.8, h: 0.4, tint: '#fbbf24' },
  { id: 'PC', x: -0.21, z: R1, w: 1.0, d: 0.8, h: 0.34, tint: '#7dd3fc' },
  ...(['A', 'X', 'L', 'B', 'S', 'T', 'SW'] as PartId[]).map((id, i) => ({ id, x: -4.53 + i * 0.62, z: R2, w: 0.54, d: 0.8, h: 0.3, tint: '#93c5fd' })),
];
const NODE = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<PartId, Node>;
const edgeZ = (n: Node) => (n.z < BUSZ ? n.z + n.d / 2 : n.z - n.d / 2);
const toBus = (n: Node): P3[] => [[n.x, Y_TR, edgeZ(n)], [n.x, Y_TR, BUSZ]];
const link = (a: Node, b: Node): P3[] => [...toBus(a), ...toBus(b).reverse()];

// mat: the chip's own material, used only while it glows; otherwise all chips share one. rect: its display's place on the shared canvas.
interface Block { node: Node; group: THREE.Group; body: THREE.Mesh; mat: THREE.MeshStandardMaterial; rect: [number, number, number, number]; value: string; hot: number }

export interface PathStage { pts: P3[]; color: string; from?: PartId; to?: PartId; cell?: number; len: number }
export type CellMark = 'pc' | 'write' | 'read' | 'on';

export class Machine {
  group = new THREE.Group();
  pickables: THREE.Object3D[] = [];
  private gPkg = new THREE.Group(); private gDie = new THREE.Group(); private gMem = new THREE.Group();
  private gCtl = new THREE.Group(); private gRegs = new THREE.Group(); private gLid = new THREE.Group();
  private blocks = {} as Record<PartId, Block>; private all: Block[] = [];
  private idle!: THREE.MeshStandardMaterial; private faces!: Label; private facesDirty = false;
  private memLabel!: Label; private memKey = ''; private memSig: string | undefined;
  private rows: number[] = Array.from({ length: MEM.rows }, (_, i) => i * 16);
  private pulses!: THREE.InstancedMesh; private heads: THREE.Sprite[] = []; private nPulse = 0; private nHead = 0;
  private tmp = new THREE.Object3D(); private col = new THREE.Color(); private v = new THREE.Vector3();
  private mtx = new THREE.Matrix4(); private cols = new Map<string, THREE.Color>();
  private busMat!: THREE.MeshStandardMaterial;

  constructor() {
    const m = M();
    const dieW = DIE.x1 - DIE.x0, dieD = DIE.z1 - DIE.z0, cx = (DIE.x0 + DIE.x1) / 2;
    this.group.add(this.gPkg, this.gDie, this.gMem, this.gCtl, this.gRegs, this.gLid);
    for (const g of [this.gPkg, this.gDie, this.gMem, this.gCtl, this.gRegs, this.gLid]) g.position.x = OFFX;

    // Package: ceramic body, gold leads on all four sides, a dot marking pin 1
    const pkgW = dieW + PKG * 2, pkgD = dieD + PKG * 2;
    const sub = new THREE.Mesh(rbox(pkgW, SUB_H, pkgD, 0.07, 4), m.ceramic);
    sub.position.set(cx, SUB_H / 2, 0); sub.castShadow = sub.receiveShadow = true;
    this.gPkg.add(sub);
    const cs = contactShadow(pkgW + 0.5, pkgD + 0.5, 0.42); cs.position.x = cx; this.gPkg.add(cs);
    // (an instanced mesh keeps a material of its own: sharing one with ordinary meshes makes three.js re-describe the shader at every switch)
    const nx = 26, nz = 12, leads = new THREE.InstancedMesh(rbox(0.17, 0.07, 0.5, 0.02, 2), m.gold.clone(), (nx + nz) * 2);
    let li = 0;
    const put = (x: number, z: number, turn: boolean) => {
      this.tmp.position.set(x, 0.07, z); this.tmp.rotation.set(0, turn ? Math.PI / 2 : 0, 0); this.tmp.scale.set(1, 1, 1); this.tmp.updateMatrix();
      leads.setMatrixAt(li++, this.tmp.matrix);
    };
    for (let i = 0; i < nx; i++) { const x = cx - pkgW / 2 + 0.5 + (i * (pkgW - 1)) / (nx - 1); put(x, pkgD / 2 + 0.12, false); put(x, -pkgD / 2 - 0.12, false); }
    for (let i = 0; i < nz; i++) { const z = -pkgD / 2 + 0.5 + (i * (pkgD - 1)) / (nz - 1); put(cx - pkgW / 2 - 0.12, z, true); put(cx + pkgW / 2 + 0.12, z, true); }
    leads.castShadow = true; this.gPkg.add(leads);
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 24), m.gold);
    dot.position.set(cx - pkgW / 2 + 0.36, SUB_H + 0.005, pkgD / 2 - 0.36); this.gPkg.add(dot);

    // Die: a plate of silicon with the floor plan printed on it, and the copper buses
    const die = new THREE.Mesh(rbox(dieW, DIE_H, dieD, 0.03, 2), m.silicon);
    die.position.set(cx, SUB_H + DIE_H / 2, 0); die.castShadow = die.receiveShadow = true;
    this.gDie.add(die);
    const plan = new Label(1024, Math.round((1024 * dieD) / dieW), (g, w, h) => {
      const X = (x: number) => ((x - DIE.x0) / dieW) * w, Z = (z: number) => ((z - DIE.z0) / dieD) * h;
      g.fillStyle = '#0b1830'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#11264a'; g.lineWidth = 1;
      for (let x = DIE.x0; x <= DIE.x1; x += 0.25) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), h); g.stroke(); }
      for (let z = DIE.z0; z <= DIE.z1; z += 0.25) { g.beginPath(); g.moveTo(0, Z(z)); g.lineTo(w, Z(z)); g.stroke(); }
      g.strokeStyle = '#1d3d70'; g.lineWidth = 2;
      roundRect(g, X(-5.02), Z(R1 - 0.62), X(0.48) - X(-5.02), Z(R1 + 0.62) - Z(R1 - 0.62), 8); g.stroke();
      roundRect(g, X(-5.02), Z(R2 - 0.62), X(-0.3) - X(-5.02), Z(R2 + 0.62) - Z(R2 - 0.62), 8); g.stroke();
      const lab = (s: string, x: number, z: number) => { g.font = `700 15px ${MONO}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#4b77b8'; g.fillText(s, X(x), Z(z)); };
      lab('MEMORY  1 MB  00000–FFFFF', MEM.x0, -1.08);
      g.textAlign = 'right'; g.fillStyle = '#4b77b8';
      g.fillText('ADDRESS', X(IFX - 0.12), Z(ADDRZ - 0.02)); g.fillText('DATA', X(IFX - 0.12), Z(DATAZ + 0.02));
      lab('REGISTERS  24 BIT', -5.0, R2 + 0.74); lab('CONTROL', -5.0, R1 - 0.72);
      lab('SIC/XE', 4.55, 2.08);
    });
    const planMesh = topPlane(dieW, dieD, new THREE.MeshStandardMaterial({ map: plan.tex, metalness: 0.5, roughness: 0.26 }));
    planMesh.position.set(cx, TOP + 0.002, 0); planMesh.receiveShadow = true;
    this.gDie.add(planMesh);

    this.busMat = m.copper.clone();
    this.busMat.emissive = new THREE.Color('#ff9a3c'); this.busMat.emissiveIntensity = 0;
    // all the traces are one mesh, and so are the pads: fewer things to draw on every frame
    const strips: THREE.BufferGeometry[] = [];
    const trace = (a: P3, b: P3, wd = 0.07) => {
      const horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[2] - a[2]);
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]) + wd;
      strips.push(rbox(horiz ? len : wd, 0.03, horiz ? wd : len, 0.012, 1).clone().translate((a[0] + b[0]) / 2, TOP + 0.016, (a[2] + b[2]) / 2));
    };
    const joined = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts)!; for (const x of parts) x.dispose(); return g; };
    trace([-4.85, 0, BUSZ], [IFX, 0, BUSZ], 0.11);
    trace([IFX, 0, ADDRZ], [IFX, 0, DATAZ], 0.11);
    trace([IFX, 0, ADDRZ], [MEM_EDGE, 0, ADDRZ], 0.09); trace([IFX, 0, DATAZ], [MEM_EDGE, 0, DATAZ], 0.09);
    for (const n of NODES) { const [a, b] = toBus(n); trace(a, b); }
    const bus = new THREE.Mesh(joined(strips), this.busMat); bus.userData.part = 'BUS';
    this.gDie.add(bus); this.pickables.push(bus);
    this.gDie.add(new THREE.Mesh(joined(NODES.map((n) => new THREE.CylinderGeometry(0.075, 0.075, 0.04, 16).translate(n.x, TOP + 0.02, BUSZ))), m.gold));

    // Memory: a slab carrying 16 × 8 byte cells; the bytes are printed on one canvas above them
    const memW = MEM.cols * MEM.p, memD = MEM.rows * MEM.p;
    const slab = new THREE.Mesh(rbox(memW + MEM.gut + 0.14, MEM.slab, memD + 0.14, 0.03, 2), m.ceramic);
    slab.position.set(MEM.x0 + (memW - MEM.gut) / 2, TOP + MEM.slab / 2, MEM.z0 + memD / 2);
    slab.castShadow = slab.receiveShadow = true; slab.userData.part = 'MEM';
    this.gMem.add(slab); this.pickables.push(slab);
    const caps = new THREE.InstancedMesh(rbox(MEM.p - 0.05, MEM.cap, MEM.p - 0.05, 0.03, 2), m.cap, MEM.cols * MEM.rows);
    for (let i = 0; i < MEM.cols * MEM.rows; i++) {
      this.tmp.position.set(MEM.x0 + ((i % 16) + 0.5) * MEM.p, TOP + MEM.slab + MEM.cap / 2, MEM.z0 + (Math.floor(i / 16) + 0.5) * MEM.p);
      this.tmp.rotation.set(0, 0, 0); this.tmp.scale.set(1, 1, 1); this.tmp.updateMatrix(); caps.setMatrixAt(i, this.tmp.matrix);
    }
    caps.castShadow = true; caps.userData.part = 'MEM';
    this.gMem.add(caps); this.pickables.push(caps);
    const px = 72;
    this.memLabel = new Label(Math.round(((memW + MEM.gut) / MEM.p) * px), MEM.rows * px, () => {});
    const memPlane = topPlane(memW + MEM.gut, memD, new THREE.MeshBasicMaterial({ map: this.memLabel.tex, transparent: true, toneMapped: false, depthWrite: false }));
    memPlane.position.set(MEM.x0 + (memW - MEM.gut) / 2, TOP + MEM.slab + MEM.cap + 0.004, MEM.z0 + memD / 2);
    this.gMem.add(memPlane);

    // Control unit, instruction register, ALU, program counter and the registers: small chips with a display on top.
    // To keep each frame cheap, the chips share one material (their colours are painted on the geometry) and all the
    // displays are printed on one canvas, drawn as one mesh per layer.
    this.idle = m.body.clone(); this.idle.color.set(0xffffff); this.idle.vertexColors = true;
    const PAD = 8, SHEET = 1024, quads: Record<'ctl' | 'regs', number[][]> = { ctl: [[], [], []], regs: [[], [], []] };
    let ax = PAD, ay = PAD, rowH = 0;
    const placed = NODES.map((n) => {
      const pw = n.id === 'ALU' ? 0.5 : n.w - 0.12, pd = n.id === 'ALU' ? 0.36 : n.d - 0.12;
      const lw = Math.round(200 * pw / Math.min(pw, pd)), lh = Math.round(200 * pd / Math.min(pw, pd));
      if (ax + lw + PAD > SHEET) { ax = PAD; ay += rowH + PAD; rowH = 0; }
      const rect: [number, number, number, number] = [ax, ay, lw, lh];
      ax += lw + PAD; rowH = Math.max(rowH, lh);
      return { n, pw, pd, rect };
    });
    const sheetH = ay + rowH + PAD;
    for (const { n, pw, pd, rect } of placed) {
      const g = new THREE.Group(); g.position.set(n.x, TOP, n.z);
      const mat = m.body.clone(); mat.color.set(n.tint).multiplyScalar(0.16).add(new THREE.Color(0x10151f));
      mat.emissive = new THREE.Color(n.tint); mat.emissiveIntensity = 0;
      const geo = n.id === 'ALU' ? aluShape(n) : rbox(n.w, n.h, n.d, 0.05, 3).clone();
      const paint = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < paint.length; i += 3) { paint[i] = mat.color.r; paint[i + 1] = mat.color.g; paint[i + 2] = mat.color.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(paint, 3));
      const body = new THREE.Mesh(geo, this.idle);
      if (n.id !== 'ALU') body.position.y = n.h / 2;
      body.castShadow = body.receiveShadow = true; body.userData.part = n.id;
      g.add(body); this.pickables.push(body);
      const upper = n.z < BUSZ;
      (upper ? this.gCtl : this.gRegs).add(g);
      // the display: a flat rectangle on top of the chip, reading towards the viewer, showing its part of the shared canvas
      const [rx, ry, lw, lh] = rect, q = quads[upper ? 'ctl' : 'regs'], at = q[0].length / 3;
      const x = n.x, y = TOP + n.h + (n.id === 'ALU' ? 0.024 : 0.003), z = n.z + (n.id === 'ALU' ? -0.04 : 0);
      const u0 = rx / SHEET, u1 = (rx + lw) / SHEET, v1 = 1 - ry / sheetH, v0 = 1 - (ry + lh) / sheetH;
      q[0].push(x - pw / 2, y, z - pd / 2, x + pw / 2, y, z - pd / 2, x - pw / 2, y, z + pd / 2, x + pw / 2, y, z + pd / 2);
      q[1].push(u0, v1, u1, v1, u0, v0, u1, v0);
      q[2].push(at, at + 2, at + 1, at + 1, at + 2, at + 3);
      this.blocks[n.id] = { node: n, group: g, body, mat, rect, value: '', hot: 0 };
      this.all.push(this.blocks[n.id]);
    }
    this.faces = new Label(SHEET, sheetH, (g) => { for (const b of this.all) this.drawDisplay(g, b); });
    const faceMat = new THREE.MeshBasicMaterial({ map: this.faces.tex, toneMapped: false, transparent: true });
    for (const k of ['ctl', 'regs'] as const) {
      const geo = new THREE.BufferGeometry(), [pos, uv, index] = quads[k];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(index);
      (k === 'ctl' ? this.gCtl : this.gRegs).add(new THREE.Mesh(geo, faceMat));
    }

    // Lid: a thick metal cap with the name etched on it
    const lidW = dieW + 0.5, lidD = dieD + 0.5, lidH = 1.02;
    const lid = new THREE.Mesh(rbox(lidW, lidH, lidD, 0.1, 5), m.lid);
    lid.position.set(cx, SUB_H + lidH / 2, 0); lid.castShadow = true;
    this.gLid.add(lid);
    const etch = new Label(1024, Math.round((1024 * lidD) / lidW), (g, w, h) => {
      g.fillStyle = 'rgba(28,32,40,.86)';
      g.font = `800 ${h * 0.3}px ${MONO}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('SIC/XE', w * 0.07, h * 0.42);
      g.font = `500 ${h * 0.066}px ${MONO}`;
      g.fillText('24-BIT WORD   1 MB MEMORY   FORMATS 1–4', w * 0.075, h * 0.68);
      g.fillText('BECK  SYSTEM SOFTWARE', w * 0.075, h * 0.79);
      g.lineWidth = 3; g.strokeStyle = 'rgba(28,32,40,.6)';
      g.beginPath(); g.arc(w * 0.9, h * 0.2, h * 0.055, 0, Math.PI * 2); g.stroke();
    });
    const etchMesh = topPlane(lidW - 0.3, lidD - 0.3, new THREE.MeshStandardMaterial({ map: etch.tex, transparent: true, metalness: 0.6, roughness: 0.75, depthWrite: false }));
    etchMesh.position.set(cx, SUB_H + lidH + 0.003, 0);
    this.gLid.add(etchMesh);

    // Light pulses that travel along the buses
    this.pulses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 480);
    this.pulses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pulses.count = 0; this.pulses.frustumCulled = false; this.pulses.renderOrder = 5;
    this.pulses.setColorAt(0, this.col.set('#fff'));
    this.gDie.add(this.pulses);
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: m.glow, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true }));
      s.visible = false; s.renderOrder = 6; this.gDie.add(s); this.heads.push(s);
    }
    this.setMemory(() => -1);
    this.commit();
  }

  // ---- layers ----
  // k = 0: assembled. k = 1: every layer lifted apart. lid = extra lift of the lid (it leaves the frame).
  // mem = lift the memory alone, to look at it by itself.
  setExplode(k: number, lid = 0, mem = 0) {
    this.gDie.position.y = k * 0.8;
    this.gMem.position.y = k * 2.3 + mem * 4.4;
    this.gRegs.position.y = k * 3.0;
    this.gCtl.position.y = k * 4.5;
    this.gLid.position.y = k * 6.4 + lid * 16;
    this.gLid.visible = lid < 0.995;
    // closed: everything inside is hidden by the lid, so it is not drawn at all
    this.gDie.visible = this.gMem.visible = this.gRegs.visible = this.gCtl.visible = k > 0.0005 || lid > 0.0005 || mem > 0.0005;
  }
  showLid(on: boolean) { this.gLid.visible = on; }

  // ---- displays ----
  // Change what a chip's display shows. The canvas is redrawn once, by commit(), after all the changes of a frame.
  setDisplay(id: PartId, value: string) {
    const b = this.blocks[id];
    if (!b || b.value === value) return;
    b.value = value; this.facesDirty = true;
  }
  commit() { if (this.facesDirty) { this.facesDirty = false; this.faces.redraw(); } }
  private drawDisplay(g: CanvasRenderingContext2D, b: Block) {
    const n = b.node, id = n.id, value = b.value, [x, y, w, h] = b.rect;
    g.save(); g.translate(x, y);
    if (id === 'ALU') { text(g, 'ALU', w / 2, h / 2, h * 0.5, n.tint, 800); g.restore(); return; }
    roundRect(g, 4, 4, w - 8, h - 8, 16); g.fillStyle = '#050a13'; g.fill();
    g.lineWidth = 4; g.strokeStyle = n.tint + '99'; g.stroke();
    const fit = (s: string, px: number, max: number, wt = 700) => { g.font = `${wt} ${px}px ${MONO}`; const m = g.measureText(s).width; return m > max ? (px * max) / m : px; };
    if (h > w) { // a register: name above, value below
      text(g, n.id, w / 2, h * 0.27, h * 0.2, n.tint, 800);
      if (value) text(g, value, w / 2, h * 0.66, fit(value, h * 0.19, w - 34), '#ffffff', 700);
    } else if (!value) text(g, n.id, w / 2, h / 2, h * 0.34, n.tint, 800);
    else {
      text(g, n.id, 22, h * 0.25, h * 0.2, n.tint, 800, 'left');
      text(g, value, w / 2, h * 0.64, fit(value, h * 0.3, w - 40), '#ffffff', 700);
    }
    g.restore();
  }
  // Make a chip glow (0..1), in its own colour or a given one
  setHot(id: PartId, v: number, color?: string) {
    const b = this.blocks[id]; if (!b) return;
    if (color) b.mat.emissive.set(color); else b.mat.emissive.set(b.node.tint);
    this.glow(b, v * 1.6);
  }
  // a chip that glows wears its own material; the others share one, which is cheaper to draw
  private glow(b: Block, intensity: number) { b.mat.emissiveIntensity = intensity; b.body.material = intensity > 0 ? b.mat : this.idle; }
  clearHot() { for (const b of this.all) this.glow(b, 0); this.busMat.emissiveIntensity = 0; }
  setBusGlow(v: number) { this.busMat.emissiveIntensity = v; }

  // ---- memory ----
  setRows(rows: number[]) { this.rows = rows.slice(0, MEM.rows); this.memKey = ''; this.memSig = undefined; }
  // byte(addr) gives the value to print, or -1 for an empty cell.
  // sig: a caller that draws every frame can name the state it is showing; the same name twice costs nothing.
  setMemory(byte: (addr: number) => number, marks?: Map<number, CellMark>, sig?: string) {
    if (sig !== undefined) { if (sig === this.memSig) return; this.memSig = sig; } else this.memSig = undefined;
    const n = this.rows.length * 16;
    let key = this.rows.join(',') + '|';
    const vals: number[] = [];
    for (let i = 0; i < n; i++) { const a = this.rows[i >> 4] + (i & 15); const v = byte(a); vals.push(v); key += v + (marks?.get(a) ?? '') + ','; }
    if (key === this.memKey) return;
    this.memKey = key;
    this.memLabel.redraw((g, w, h) => {
      const c = h / MEM.rows, gx = w - 16 * c;
      for (let r = 0; r < this.rows.length; r++) {
        text(g, this.rows[r].toString(16).toUpperCase().padStart(4, '0'), gx - 12, (r + 0.5) * c, c * 0.3, '#6f93c9', 500, 'right');
        for (let k = 0; k < 16; k++) {
          const a = this.rows[r] + k, v = vals[r * 16 + k], mk = marks?.get(a);
          const x = gx + k * c, y = r * c;
          if (mk) {
            roundRect(g, x + 5, y + 5, c - 10, c - 10, 9);
            g.fillStyle = mk === 'pc' ? CYAN : mk === 'write' ? GREEN : mk === 'read' ? AMBER : '#0a1322'; g.fill();
            if (mk === 'on') { g.lineWidth = 4; g.strokeStyle = AMBER; g.stroke(); }
          }
          if (v >= 0) text(g, v.toString(16).toUpperCase().padStart(2, '0'), x + c / 2, y + c / 2 + 1, c * (mk ? 0.46 : 0.4), mk && mk !== 'on' ? '#04111f' : mk === 'on' ? AMBER : v ? '#c8d8f0' : '#52688c', mk ? 800 : 700);
        }
      }
    });
  }
  // Where a memory byte sits on the die (floor-plan coordinates), or null when its row is not shown
  cell(addr: number): P3 | null {
    const r = this.rows.indexOf(Math.floor(addr / 16) * 16);
    return r < 0 ? null : [MEM.x0 + ((addr % 16) + 0.5) * MEM.p, Y_MEM, MEM.z0 + (r + 0.5) * MEM.p];
  }
  private toMem(n: Node, z: number, addr: number): P3[] {
    const c = this.cell(addr) ?? [MEM.x0, Y_MEM, MEM.z0];
    const gx = MEM.x0 - 0.1;
    return [...toBus(n), [IFX, Y_TR, BUSZ], [IFX, Y_TR, z], [MEM_EDGE, Y_TR, z], [gx, Y_MEM, z], [gx, Y_MEM, c[2]], c];
  }

  // The real data path of one executed instruction, as a list of stages to light in order:
  // fetch (PC → memory → IR), decode (IR → CU), then what the instruction itself moves.
  dataPath(last: StepResult): PathStage[] {
    const out: PathStage[] = [];
    const d = last.instruction, m = d.mnemonic.replace('+', '');
    const N = (id?: string) => NODE[(id ?? 'A') as PartId] ?? NODE.A;
    const S = (pts: P3[], color: string, from?: string, to?: string, cell?: number) => out.push({ pts, color, from: from as PartId, to: to as PartId, cell, len: pathLength(pts) });
    const alu = /^(ADD|SUB|MUL|DIV|AND|OR|COMP|TIX|ADDR|SUBR|MULR|DIVR|COMPR|TIXR|SHIFTL|SHIFTR)$/.test(m);
    const dest = last.registerChanges.find((c) => c.reg !== 'PC')?.reg ?? (alu ? 'SW' : 'A');
    S(this.toMem(N('PC'), ADDRZ, last.pcBefore), CYAN, 'PC', undefined, last.pcBefore);
    S(this.toMem(N('IR'), DATAZ, last.pcBefore).reverse(), CYAN, undefined, 'IR');
    S(link(N('IR'), N('CU')), CYAN, 'IR', 'CU');
    if (last.memoryChanges.length) {
      const sr = m.match(/^ST([AXLBST])$/)?.[1] ?? 'A', ma = last.memoryChanges[0].address;
      S(this.toMem(N('CU'), ADDRZ, ma), AMBER, 'CU', undefined, ma);
      S(this.toMem(N(sr), DATAZ, ma), GREEN, sr, undefined, ma);
    } else if (d.format === 2) {
      const s1 = d.r1 ?? 'A', s2 = d.r2 ?? s1;
      if (m === 'RMO') S(link(N(s1), N(s2)), AMBER, s1, s2);
      else if (m === 'CLEAR') S(link(N('CU'), N(s1)), AMBER, 'CU', s1);
      else { S(link(N(s1), N('ALU')), AMBER, s1, 'ALU'); if (s2 !== s1) S(link(N(s2), N('ALU')), AMBER, s2, 'ALU'); S(link(N('ALU'), N(s2)), AMBER, 'ALU', s2); }
    } else if (m === 'RSUB') S(link(N('L'), N('PC')), AMBER, 'L', 'PC');
    else if (/^J/.test(m)) S(link(N('CU'), N('PC')), AMBER, 'CU', 'PC');
    else {
      const target = alu ? 'ALU' : dest;
      if (alu) S(link(N('A'), N('ALU')), AMBER, 'A', 'ALU');
      if (d.addressingMode === 'immediate') S(link(N('IR'), N(target)), AMBER, 'IR', target);
      else if (d.targetAddress !== undefined) {
        S(this.toMem(N('CU'), ADDRZ, d.targetAddress), AMBER, 'CU', undefined, d.targetAddress);
        S(this.toMem(N(target), DATAZ, d.targetAddress).reverse(), AMBER, undefined, target, d.targetAddress);
      }
      if (alu) S(link(N('ALU'), N(dest)), AMBER, 'ALU', dest);
    }
    return out;
  }

  // Draw the stages at progress f (0 = nothing yet, 1 = the last pulse has arrived). Chips glow as pulses leave or reach them.
  drawPath(stages: PathStage[], f: number) {
    this.nPulse = 0; this.nHead = 0;
    for (const b of this.all) b.hot = 0;
    const total = stages.reduce((s, x) => s + x.len, 0) || 1;
    let at = 0;
    for (const st of stages) {
      const k = (f * total - at) / st.len; // 0..1 while this stage's pulse travels
      at += st.len;
      if (k <= 0 || k > 1.35) continue;
      const head = Math.min(1, k) * st.len, fade = k > 1 ? 1 - (k - 1) / 0.35 : 1;
      this.streak(st.pts, head, Math.min(st.len, 2.6), st.color, fade);
      if (st.from && k < 0.3) this.blocks[st.from].hot = Math.max(this.blocks[st.from].hot, 1 - k / 0.3);
      if (st.to && k > 0.9) this.blocks[st.to].hot = Math.max(this.blocks[st.to].hot, fade);
    }
    for (const b of this.all) { if (b.hot > 0) b.mat.emissive.set(b.node.tint); this.glow(b, b.hot * 1.5); }
    this.pulses.count = this.nPulse;
    this.pulses.instanceMatrix.needsUpdate = true;
    if (this.pulses.instanceColor) this.pulses.instanceColor.needsUpdate = true;
    for (let i = this.nHead; i < this.heads.length; i++) this.heads[i].visible = false;
  }
  clearPath() { this.pulses.count = 0; for (const h of this.heads) h.visible = false; }

  private streak(pts: P3[], head: number, tail: number, color: string, fade: number) {
    const from = Math.max(0, head - tail), STEP = 0.16;
    let base = this.cols.get(color);
    if (!base) { base = new THREE.Color(color); this.cols.set(color, base); }
    let d0 = 0;
    for (let i = 1; i < pts.length && this.nPulse < 470; i++) {
      const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const s0 = Math.max(from, d0), s1 = Math.min(head, d0 + l);
      for (let s = s0; s < s1 && this.nPulse < 470; s += STEP) {
        const e = Math.min(s1, s + STEP), mid = (s + e) / 2 - d0, k = l ? mid / l : 0;
        const bright = fade * Math.pow(clamp01(((s + e) / 2 - from) / tail), 1.6);
        const alongX = Math.abs(b[0] - a[0]) >= Math.abs(b[2] - a[2]);
        this.mtx.makeScale(alongX ? e - s + 0.01 : 0.085, 0.022, alongX ? 0.085 : e - s + 0.01)
          .setPosition(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + 0.012, a[2] + (b[2] - a[2]) * k);
        this.pulses.setMatrixAt(this.nPulse, this.mtx);
        this.pulses.setColorAt(this.nPulse++, this.col.copy(base).multiplyScalar(bright * 1.25));
      }
      d0 += l;
    }
    if (this.nHead < this.heads.length && fade > 0) {
      const h = this.heads[this.nHead++];
      pathAt(pts, head, this.v); h.position.copy(this.v); h.position.y += 0.03;
      h.scale.setScalar(0.62); h.material.color.copy(base); h.material.opacity = fade; h.visible = true;
    }
  }

  // ---- points other things attach to (leader lines in the story, flying bytes) ----
  anchor(name: string, out: THREE.Vector3): THREE.Vector3 {
    const cx = (DIE.x0 + DIE.x1) / 2;
    if (name.startsWith('cell:')) { const c = this.cell(parseInt(name.slice(5), 10)) ?? [0, 0, 0]; return this.gMem.localToWorld(out.set(c[0], c[1], c[2])); }
    switch (name) {
      case 'lid': return this.gLid.localToWorld(out.set(cx + 3.6, SUB_H + 1.02, 1.2));
      case 'regs': return this.gRegs.localToWorld(out.set(NODE.A.x - 0.2, TOP + 0.3, R2 + 0.3));
      case 'alu': return this.gCtl.localToWorld(out.set(NODE.ALU.x + 0.2, TOP + 0.42, R1 - 0.1));
      case 'cu': return this.gCtl.localToWorld(out.set(NODE.CU.x - 0.4, TOP + 0.34, R1));
      case 'ir': return this.gCtl.localToWorld(out.set(NODE.IR.x, TOP + 0.34, R1));
      case 'pc': return this.gCtl.localToWorld(out.set(NODE.PC.x, TOP + 0.34, R1));
      case 'mem': return this.gMem.localToWorld(out.set(MEM.x0 + 4.3, Y_MEM, MEM.z0 + 1.6));
      case 'bus': return this.gDie.localToWorld(out.set(-4.7, Y_TR, BUSZ));
      case 'pkg': return this.gPkg.localToWorld(out.set(cx + 5.9, 0.1, 1.9));
      default: {
        const b = this.blocks[name as PartId];
        return b ? b.group.localToWorld(out.set(0, b.node.h, 0)) : this.group.localToWorld(out.set(0, 0, 0));
      }
    }
  }

  dispose() {
    this.memLabel.dispose();
    this.faces.dispose(); this.idle.dispose();
    for (const b of this.all) b.mat.dispose();
  }
}

// The ALU in its textbook outline: a wedge with a notch on the wide side
function aluShape(n: Node): THREE.BufferGeometry {
  const w = n.w / 2, d = n.d / 2, s = new THREE.Shape();
  s.moveTo(-w, d); s.lineTo(-0.14, d); s.lineTo(0, d - 0.2); s.lineTo(0.14, d); s.lineTo(w, d);
  s.lineTo(w - 0.26, -d); s.lineTo(-w + 0.26, -d); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: n.h - 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.02, 0);
  return g;
}
