// The director: one 3D scene for the whole story. Given the chapter and the progress inside it,
// it places the machine, the ruler, the row of bits, the lights and the camera.
// Everything here is a pure function of the scroll position, so scrolling back plays it in reverse.
import * as THREE from 'three';
import { CellMark, Machine, PartId, PathStage } from '../three/machine.ts';
import { Ruler } from '../three/ruler.ts';
import { Bit, Bits } from '../three/bits.ts';
import { AMBER, io, io3, loadFonts, makeEnvironment, mix, seg } from '../three/kit.ts';
import { toSigned24 } from '../sicxe/registers.ts';
import { Story, bitsOf } from './data.ts';
import { CH, P2, RUN_DONE, START, addrBeat, darkAt, p1Line, p1Slot, p1Start, p2BitAt, runStep } from './plan.ts';

export interface Clock { u: number; ch: number; t: number; rtl: boolean; pick: number }

type Pose = [number, number, number, number, number, number, number]; // camera x y z, target x y z, shift of the picture (fraction of the width)
const BX = 40, BITS_Y = 3.0; // the assembler's bench stands to the right of the machine
const POSE: Record<string, Pose> = {
  hero: [10.8, 9.4, 17.4, 0, 0.2, 0, 0.17],
  hero2: [9.4, 10.2, 18.2, 0, 0.3, 0, 0.17],
  stack: [14.2, 8.6, 21.4, 0, 3.7, 0, 0],
  stack2: [9.8, 10.0, 23.2, 0, 3.7, 0, 0],
  die: [1.4, 15.5, 12.2, 0.2, 0, 0.3, 0.14],
  memUp: [5.6, 8.9, 7.6, 2.45, 4.8, 0.25, 0.2],
  memUp2: [4.3, 8.6, 5.9, 2.0, 4.85, -0.15, 0.2],
  bench: [BX - 0.6, 6.4, 15.2, BX - 0.6, 2.72, 0, 0],
  bench2: [BX + 0.6, 6.2, 15.0, BX + 0.6, 2.72, 0, 0],
  bitsAll: [BX, 4.9, 15.8, BX, 2.15, 0, 0],
  bitsPick: [BX, 5.0, 16.6, BX, 2.75, 0, 0],
  bitsOp: [BX - 3.9, 4.2, 9.6, BX - 3.7, 2.6, 0, 0],
  bitsFl: [BX - 1.5, 4.2, 9.0, BX - 1.4, 2.6, 0, 0],
  bitsDp: [BX + 3.1, 4.3, 10.8, BX + 3.0, 2.6, 0, 0],
  addr: [BX, 5.0, 16.4, BX, 3.15, 0, 0],
  fmt: [BX, 5.6, 16.4, BX, 4.25, 0, 0],
  tape: [BX - 0.75, 7.4, 18.6, BX - 0.75, 2.4, 0, 0],
  load: [1.4, 17.4, 10.6, 0.2, 0, 0.3, 0.16],
  run: [0.4, 18.2, 8.9, 0, 0, 0.35, 0.16],
  run2: [-0.5, 17.6, 9.8, 0, 0, 0.35, 0.16],
};
type Key = [number, keyof typeof POSE];
const TRACK: Key[][] = [
  [[0, 'hero'], [1, 'hero2']],
  [[0, 'hero2'], [0.42, 'stack'], [0.68, 'stack2'], [1, 'die']],
  [[0, 'die'], [0.4, 'memUp'], [0.86, 'memUp2'], [1, 'die']],
  [[0, 'die'], [0.13, 'bench'], [0.93, 'bench2'], [1, 'bench2']],
  [[0, 'bench2'], [0.09, 'bitsAll'], [0.185, 'bitsAll'], [0.235, 'bitsOp'], [0.385, 'bitsOp'], [0.43, 'bitsFl'], [0.575, 'bitsFl'], [0.63, 'bitsDp'], [0.735, 'bitsDp'], [0.79, 'bitsAll'], [0.915, 'bitsAll'], [0.945, 'bitsPick'], [1, 'bitsPick']],
  [[0, 'bitsPick'], [0.08, 'addr'], [1, 'addr']],
  [[0, 'addr'], [0.14, 'fmt'], [0.9, 'fmt'], [1, 'addr']],
  [[0, 'addr'], [0.14, 'tape'], [1, 'tape']],
  [[0, 'tape'], [0.36, 'load'], [1, 'load']],
  [[0, 'load'], [0.06, 'run'], [1, 'run2']],
  [[0, 'run2'], [0.6, 'hero'], [1, 'hero']],
];

const hex = (n: number, w = 4) => n.toString(16).toUpperCase().padStart(w, '0');

export class World {
  machine = new Machine();
  ruler: Ruler; bits = new Bits();
  busy = false; // something is still settling, so the next frame is needed even if the scroll has stopped
  private root = new THREE.Group();
  private shadowSig = ''; private nth = 0; private lt = new THREE.Vector3();
  private key: THREE.DirectionalLight; private fill: THREE.DirectionalLight; private hemi: THREE.HemisphereLight;
  private floor: THREE.Mesh;
  private pose: Pose = [...POSE.hero]; private v = new THREE.Vector3(); private tgt = new THREE.Vector3();
  private lineBits: Bit[][]; private farBits: Bit[];
  private blockOf: number[]; // story line index → block index on the ruler (−1 when the line takes no room)
  private coded: number[]; // indices (into story.lines) of lines that make object code
  private paths: PathStage[][];
  private lineAt = new Map<number, string>();

  private env: THREE.Texture;

  constructor(private story: Story, private gl: THREE.WebGLRenderer, private scene: THREE.Scene) {
    loadFonts();
    // shadows are drawn again only when something that casts one has moved (see the end of update)
    gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true;
    gl.domElement.addEventListener('webglcontextrestored', this.redoShadows);
    this.env = makeEnvironment(gl);
    this.scene.environment = this.env;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8894a8, 0.55);
    this.key = new THREE.DirectionalLight(0xfff4e6, 2.6);
    this.key.castShadow = true; this.key.shadow.mapSize.set(1024, 1024);
    const sc = this.key.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 70; sc.updateProjectionMatrix();
    this.key.shadow.bias = -0.0004; this.key.shadow.normalBias = 0.03;
    this.fill = new THREE.DirectionalLight(0xbfd6ff, 0.7);
    // the floor only exists under the machine and under the bench, so most of the screen is left untouched
    const shadow = new THREE.ShadowMaterial({ opacity: 0.14 });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 26), shadow);
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.set(0, -0.01, 0); this.floor.receiveShadow = true;
    const floor2 = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), shadow);
    floor2.rotation.x = -Math.PI / 2; floor2.position.set(BX, -0.01, 0); floor2.receiveShadow = true;
    this.root.add(this.hemi, this.key, this.key.target, this.fill, this.fill.target, this.floor, floor2);

    const sized = story.lines.filter((l) => l.size > 0);
    this.blockOf = story.lines.map((l) => sized.indexOf(l));
    this.coded = story.lines.map((l, i) => (l.code ? i : -1)).filter((i) => i >= 0);
    const find = (m: string) => story.lines.findIndex((l) => l.mnemonic === m);
    const tix = story.lines[find('TIX')], jlt = story.lines[find('JLT')];
    const target = (l: typeof tix) => story.symbols.find((s) => s.name === l.operand)?.address ?? 0;
    this.ruler = new Ruler(
      sized.map((l) => ({ loc: l.loc, size: l.size, text: l.text, code: l.code })),
      story.symbols, story.length,
      [{ from: tix.locAfter, to: target(tix), color: AMBER }, { from: jlt.locAfter, to: target(jlt), color: AMBER }],
      { h: story.records.h.replace(/\^/g, ' '), e: story.records.e.replace(/\^/g, ' ') },
    );
    this.ruler.group.position.set(BX, 0, 0);
    this.bits.group.position.set(BX, BITS_Y, 0);
    this.ruler.flyTo = (loc, size, out) => {
      this.machine.anchor('cell:' + loc, out); this.machine.anchor('cell:' + (loc + size - 1), this.v);
      out.add(this.v).multiplyScalar(0.5);
    };
    this.root.add(this.machine.group, this.ruler.group, this.bits.group);
    this.scene.add(this.root);
    // the scene and its root never move; the canvas works out the world matrices once per frame, after update()
    this.root.matrixAutoUpdate = false; this.scene.matrixAutoUpdate = false; this.scene.matrixWorldAutoUpdate = false;
    this.scene.updateMatrixWorld(true);

    // Build every shader now, while the opening screen is up. Otherwise each would be built at the moment
    // its object first appears, and that frame would stall.
    void gl.compileAsync(this.scene, new THREE.PerspectiveCamera()).catch(() => {});

    this.lineBits = story.lines.map((l) => bitsOf(l.fields));
    this.farBits = story.far ? bitsOf(story.far.fields) : [];
    this.paths = story.frames.map((f) => this.machine.dataPath(f.step));
    for (const l of story.lines) if (l.code) this.lineAt.set(l.loc, l.text);
  }

  update(c: Clock, dt: number, camera: THREE.PerspectiveCamera, w: number, h: number) {
    const s = this.story, n = s.lines.length;
    const T = (i: number) => (c.ch > i ? 1 : c.ch < i ? 0 : c.t);
    const t1 = T(CH.MACHINE), t2 = T(CH.BYTES), t3 = T(CH.PASS1), t4 = T(CH.PASS2), t5 = T(CH.ADDR), t6 = T(CH.FORMATS), t7 = T(CH.OBJECT), t8 = T(CH.LOADER), t9 = T(CH.RUN), t10 = T(CH.OUTRO);
    const dark = darkAt(c.u);
    const find = (m: string) => s.lines.findIndex((l) => l.mnemonic === m);

    // ---------- the machine ----------
    const mc = this.machine;
    this.stage(mc.group, c.ch <= CH.PASS1 || c.ch >= CH.LOADER);
    const lidAway = io(seg(t1, 0.66, 0.9)) * (1 - io3(seg(t10, 0.04, 0.55)));
    const apart = io3(seg(t1, 0.04, 0.42)) * (1 - io3(seg(t1, 0.7, 0.96))), memUp = io3(seg(t2, 0.04, 0.4)) * (1 - io3(seg(t2, 0.86, 1)));
    mc.setExplode(apart, lidAway, memUp);

    const marks = new Map<number, CellMark>();
    let bytes: (a: number) => number = () => -1, memSig = '';
    let regs = s.initial, cc = 'EQ', pc = '', ir = '', showRegs = false;
    if (c.ch < CH.LOADER) {
      const first = s.lines.find((l) => l.code)!, k = first.code.length / 2;
      bytes = (a) => (a >= first.loc && a < first.loc + k && t2 > 0.5 + (a - first.loc) * 0.07 ? s.loaded[a] : -1);
      for (let a = first.loc; a < first.loc + k; a++) if (bytes(a) >= 0) marks.set(a, 'on');
      memSig = 'a' + marks.size;
    } else if (c.ch === CH.LOADER) {
      let last = -1;
      const landed = new Set<number>();
      this.coded.forEach((li, j) => { if (this.flyOf(t8, j) >= 0.97) { landed.add(li); last = li; } });
      bytes = (a) => { for (const li of landed) { const l = s.lines[li]; if (a >= l.loc && a < l.loc + l.size) return s.loaded[a]; } return -1; };
      if (last >= 0 && t8 < 0.94) { const l = s.lines[last]; for (let a = l.loc; a < l.loc + l.size; a++) marks.set(a, 'write'); }
      if (t8 > 0.94) { pc = hex(s.start); showRegs = true; marks.set(s.start, 'pc'); }
      memSig = `l${landed.size}:${last}:${t8 < 0.94 ? 0 : 1}`;
    } else {
      const N = s.frames.length, { s: k, f } = c.ch === CH.RUN ? runStep(t9, N) : { s: N - 1, f: 1 };
      const fr = s.frames[k], prev = k > 0 ? s.frames[k - 1] : null, done = f >= RUN_DONE;
      const st = this.paths[k], total = st.reduce((x, y) => x + y.len, 0) || 1;
      const fetched = ((st[0].len + st[1].len) / total) * RUN_DONE;
      regs = done ? fr.regs : prev ? prev.regs : s.initial;
      cc = done ? fr.cc : prev ? prev.cc : 'EQ';
      showRegs = true;
      pc = hex(done ? fr.regs.PC : fr.step.pcBefore);
      ir = f >= fetched ? this.lineAt.get(fr.step.pcBefore) ?? fr.step.instruction.disassembly : prev ? this.lineAt.get(prev.step.pcBefore) ?? '' : '';
      const mem = done ? fr.mem : prev ? prev.mem : s.loaded;
      bytes = (a) => (a < mem.length ? mem[a] : 0);
      if (!(done && fr.step.halted)) marks.set(done ? fr.regs.PC : fr.step.pcBefore, 'pc');
      const d = fr.step.instruction;
      if (f > fetched && !done && d.format >= 3 && d.addressingMode !== 'immediate' && d.targetAddress !== undefined && !/^J/.test(d.mnemonic) && !fr.step.memoryChanges.length) for (let a = 0; a < 3; a++) marks.set(d.targetAddress + a, 'read');
      if (done) for (const m of fr.step.memoryChanges) m.newBytes.forEach((_, i) => marks.set(m.address + i, 'write'));
      memSig = `r${k}:${done ? 1 : 0}:${f > fetched ? 1 : 0}`;
      if (c.ch === CH.RUN) mc.drawPath(st, f / RUN_DONE); else { mc.clearPath(); mc.clearHot(); }
    }
    if (c.ch !== CH.RUN && c.ch <= CH.LOADER) { mc.clearPath(); mc.clearHot(); }
    mc.setMemory(bytes, marks, memSig);
    for (const id of ['A', 'X', 'L', 'B', 'S', 'T'] as PartId[]) mc.setDisplay(id, showRegs ? String(toSigned24(regs[id as 'A'])) : '');
    mc.setDisplay('SW', showRegs ? cc : '');
    mc.setDisplay('PC', pc); mc.setDisplay('IR', ir);
    mc.commit();
    if (c.ch === CH.LOADER && t8 > 0.94) mc.setHot('PC', Math.sin(Math.PI * seg(t8, 0.94, 1)));

    // ---------- the ruler ----------
    const r = this.ruler;
    this.stage(r.group, c.ch >= CH.PASS1 && c.ch <= CH.LOADER);
    if (r.group.visible) {
      const slot = p1Slot(n), k = p1Line(t3, n);
      let codedJ = 0;
      s.lines.forEach((l, i) => {
        const b = this.blockOf[i]; if (b < 0) return;
        const a = p1Start(i, n);
        r.placed[b] = seg(t3, a + slot * 0.05, a + slot * 0.55);
        let cd = 0;
        if (l.code) {
          const j = codedJ++;
          cd = l.mnemonic === 'LDX' ? seg(t4, P2.land[0], P2.land[1])
            : l.mnemonic === 'TIX' ? seg(t5, 0.27, 0.32) : l.mnemonic === 'JLT' ? seg(t5, 0.58, 0.63)
            : l.mnemonic === 'ADDR' ? seg(t6, 0.45, 0.6) : seg(t7, 0.05 + j * 0.035, 0.11 + j * 0.035);
          r.fly[b] = this.flyOf(t8, this.coded.indexOf(i));
        } else r.fly[b] = 0;
        r.coded[b] = cd;
      });
      s.symbols.forEach((sym, j) => { const a = p1Start(Math.max(0, sym.line), n); r.flags[j] = seg(t3, a + slot * 0.3, a + slot * 0.8); });
      const cur = k < 0 ? s.lines[0].loc : mix(s.lines[k].loc, s.lines[k].locAfter, io(seg((t3 - p1Start(k, n)) / slot, 0.45, 0.95)));
      r.cursor = cur; r.cursorOn = io(seg(t3, 0.09, 0.14)) * (1 - io(seg(t4, 0, 0.05)));
      const tix = s.lines[find('TIX')], jlt = s.lines[find('JLT')];
      r.pc = mix(tix.locAfter, jlt.locAfter, io(seg(t5, 0.36, 0.42)));
      r.pcOn = io(seg(t5, 0.03, 0.08)) * (1 - io(seg(t5, 0.64, 0.69)));
      r.arcs[0] = io(seg(t5, 0.09, 0.22)) * (1 - seg(t5, 0.355, 0.385));
      r.arcs[1] = io(seg(t5, 0.43, 0.56)) * (1 - seg(t5, 0.64, 0.675));
      r.tape = io(seg(t7, 0.45, 0.62));
      r.flagsOff = c.ch === CH.ADDR ? io(seg(t5, 0.66, 0.7)) : 0;
      r.caps = seg(t7, 0.52, 0.72) * (1 - seg(t8, 0.04, 0.16));
    }

    // ---------- the row of bits ----------
    const b = this.bits;
    this.stage(b.group, c.ch >= CH.PASS2 && c.ch <= CH.OBJECT);
    let shownLine = -1; // which story line the bits belong to (−1: none on the ruler)
    if (b.group.visible) {
      const ldx = find('LDX');
      let want: (Bit | null)[] = [];
      b.fall = 0; b.respawn = 1; b.gap = 1;
      if (c.ch === CH.PASS2) {
        if (c.pick >= 0 && t4 >= P2.pick) { want = this.lineBits[c.pick]; shownLine = c.pick; } else {
          const full = this.lineBits[ldx]; shownLine = ldx;
          want = full.map((bit, i) => {
            if ((i === 6 || i === 7) && t4 < P2.respawn[0]) return t4 >= p2BitAt(i) ? { v: '0', tone: 'op' } : null;
            if (i === 6) return t4 >= P2.n ? bit : null;
            if (i === 7) return t4 >= P2.i ? bit : null;
            return t4 >= p2BitAt(i) ? bit : null;
          });
          b.fall = seg(t4, P2.fall[0], P2.fall[1]);
          b.respawn = t4 < P2.fall[0] ? 1 : seg(t4, P2.respawn[0], P2.respawn[1]);
          b.gap = io(seg(t4, P2.gap[0], P2.gap[1]));
        }
      } else if (c.ch === CH.ADDR) {
        const beat = addrBeat(t5);
        if (beat === 2) want = this.farBits; else { shownLine = find(beat === 0 ? 'TIX' : 'JLT'); want = this.lineBits[shownLine]; }
      } else { shownLine = find('ADDR'); want = this.lineBits[shownLine]; }
      b.want = want; b.count = want.length || 24;
      b.show = io(seg(t4, P2.bar[0], P2.bar[1])) * (1 - io(seg(t7, 0, 0.07)));
      const blk = shownLine >= 0 ? this.blockOf[shownLine] : -1;
      if (blk >= 0) { const sp = r.blockSpan(blk); b.beam = { on: 1, x0: sp.x0, x1: sp.x1, y: sp.y - BITS_Y }; } else b.beam.on = 0;
      b.update(dt);
    }
    this.busy = b.group.visible && b.moving;
    r.hi = shownLine >= 0 && c.ch >= CH.PASS2 && c.ch <= CH.FORMATS ? this.blockOf[shownLine] : -1;
    if (r.group.visible) r.apply();

    // ---------- camera and light ----------
    const keys = TRACK[c.ch];
    let i = 0;
    while (i < keys.length - 2 && c.t > keys[i + 1][0]) i++;
    const A = POSE[keys[i][1]], B = POSE[keys[i + 1][1]], k = io3(seg(c.t, keys[i][0], keys[i + 1][0]));
    for (let j = 0; j < 7; j++) this.pose[j] = mix(A[j], B[j], k);
    const p = this.pose, aspect = w / h, fit = Math.max(1, 1.62 / aspect);
    this.tgt.set(p[3], p[4], p[5]);
    camera.position.set(p[0], p[1], p[2]).sub(this.tgt).multiplyScalar(fit).add(this.tgt);
    camera.lookAt(this.tgt);
    const shift = (c.rtl ? -1 : 1) * p[6] * (aspect > 1.15 ? 1 : 0);
    if (shift) camera.setViewOffset(w, h, -shift * w, aspect > 1.15 ? 0 : 0, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();

    // The light stands still over the machine, or over the bench, and follows the camera only on the way between the two.
    // While it stands still and nothing that casts a shadow moves, the shadows of the last frame are simply kept.
    const over = Math.abs(this.tgt.x) < 6 ? 0 : Math.abs(this.tgt.x - BX) < 7 ? BX : NaN;
    if (Number.isNaN(over)) this.lt.copy(this.tgt); else this.lt.set(over, 2, 0);
    this.key.target.position.copy(this.lt); this.key.position.copy(this.lt).add(this.v.set(-8, 17, 9));
    this.fill.target.position.copy(this.tgt); this.fill.position.copy(this.tgt).add(this.v.set(12, 6, -4));
    const sig = Number.isNaN(over) || c.ch === CH.LOADER ? `f${c.u.toFixed(4)}`
      : over === 0 ? `m${apart.toFixed(4)}:${lidAway.toFixed(4)}:${memUp.toFixed(4)}:${mc.group.visible}`
      : `b${r.cast.toFixed(4)}:${b.group.visible ? b.cast.toFixed(4) : ''}:${b.moving ? ++this.nth : 0}`;
    if (sig !== this.shadowSig) { this.shadowSig = sig; this.gl.shadowMap.needsUpdate = true; }
    this.key.intensity = mix(2.6, 1.7, dark); this.hemi.intensity = mix(0.55, 0.32, dark);
    this.scene.environmentIntensity = mix(1.0, 0.7, dark);
    (this.floor.material as THREE.ShadowMaterial).opacity = mix(0.14, 0.4, dark);
  }

  // For trying things from the browser console: the scene without cast shadows (the soft patches under the objects stay)
  setShadows(on: boolean) { this.key.castShadow = on; (this.floor.material as THREE.ShadowMaterial).visible = on; this.gl.shadowMap.needsUpdate = true; }
  private redoShadows = () => { this.gl.shadowMap.needsUpdate = true; this.shadowSig = ''; };
  private stage(g: THREE.Object3D, on: boolean) {
    g.visible = on;
    if (on !== (g.parent === this.root)) { if (on) this.root.add(g); else this.root.remove(g); }
  }

  // How far the j-th coded block has flown towards memory (0..1)
  private flyOf(t8: number, j: number) { return j < 0 ? 0 : seg(t8, 0.26 + j * 0.068, 0.5 + j * 0.068); }

  anchor(name: string, out: THREE.Vector3): THREE.Vector3 {
    const k = name.slice(0, 2), rest = name.slice(2);
    return k === 'm:' ? this.machine.anchor(rest, out) : k === 'r:' ? this.ruler.anchor(rest, out) : this.bits.anchor(rest, out);
  }

  dispose() {
    this.scene.remove(this.root); this.scene.environment = null; this.env.dispose(); this.machine.dispose();
    this.scene.matrixAutoUpdate = this.scene.matrixWorldAutoUpdate = true; this.gl.shadowMap.autoUpdate = true;
    this.gl.domElement.removeEventListener('webglcontextrestored', this.redoShadows);
  }
}

