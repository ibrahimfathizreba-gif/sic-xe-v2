// An instruction as a row of bits: one cube per bit, coloured by the field it belongs to.
// A cube turns over to show its 0 or 1 when the assembler decides it.
import * as THREE from 'three';
import { Label, M, MONO, TONE, clamp01, damp, io, outBack, rbox, unitPlane } from './kit.ts';

export interface Bit { v: string; tone: string } // v is '0' or '1'
export const BIT_PITCH = 0.5;
const SIZE = 0.41, MAX = 32, NIB_GAP = 0.3;

interface Cube {
  col: THREE.Color; // the body's colour now (it eases towards the field's colour)
  face: string[]; // the digit on each of the four printed faces: top, front, bottom, back ('' = none)
  shown: string; // what the cube shows now ('' = blank), as tone+value
  angle: number; target: number; x: number; scale: number;
}

const decalMats = new Map<string, THREE.MeshBasicMaterial>();
// The digit printed on a cube: dark on the cube's colour, like the lab's highlighted bytes
function decal(v: string): THREE.MeshBasicMaterial {
  let m = decalMats.get(v);
  if (!m) {
    const L = new Label(128, 128, (g, w, h) => {
      g.font = `800 ${h * 0.78}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#06101e'; g.fillText(v, w / 2, h / 2 + 6);
    });
    m = new THREE.MeshBasicMaterial({ map: L.tex, transparent: true, toneMapped: false, depthWrite: false });
    decalMats.set(v, m);
  }
  return m;
}

export class Bits {
  group = new THREE.Group();
  // ---- what the director sets every frame ----
  want: (Bit | null)[] = []; // the bit each slot should show; null = still blank
  count = 24; show = 0; gap = 0; fall = 0; respawn = 1;
  beam = { on: 0, x0: 0, x1: 0, y: 0 }; // the wedge joining a block on the ruler to this row (in this group's coordinates)
  moving = false; // true while a cube is still sliding, growing or turning over
  // A number that changes whenever the row's shape has changed (cubes turning over are covered by `moving`)
  get cast() { return this.count + this.show * 3 + this.gap * 5 + this.fall * 7 + this.respawn * 11; }

  private cubes: Cube[] = [];
  // All the cubes are one instanced mesh, and so are all the 0s and all the 1s printed on them:
  // four things to draw instead of a hundred.
  private bodies: THREE.InstancedMesh; private digits: Record<string, THREE.InstancedMesh>;
  private faceM: THREE.Matrix4[]; private m = new THREE.Matrix4(); private m2 = new THREE.Matrix4();
  private pos = new THREE.Vector3(); private quat = new THREE.Quaternion(); private scl = new THREE.Vector3(); private eul = new THREE.Euler();
  private beamMesh: THREE.Mesh; private beamPos: THREE.BufferAttribute;
  private neutral = new THREE.Color(0x141d2e); private c = new THREE.Color();

  constructor() {
    const mat = M().body.clone();
    mat.color.set(0xffffff); mat.roughness = 0.5; mat.metalness = 0.05; mat.envMapIntensity = 0.5;
    // each cube also glows faintly in its own colour
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )\n\ttotalEmissiveRadiance += vColor.rgb * 0.16;\n#endif');
    };
    this.bodies = new THREE.InstancedMesh(rbox(SIZE, SIZE, SIZE, 0.07, 3), mat, MAX);
    this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodies.castShadow = true; this.bodies.frustumCulled = false; this.bodies.count = 0;
    this.bodies.setColorAt(0, this.neutral); this.bodies.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.bodies);
    this.digits = {};
    for (const v of ['0', '1']) {
      const d = new THREE.InstancedMesh(unitPlane, decal(v), MAX * 4);
      d.instanceMatrix.setUsage(THREE.DynamicDrawUsage); d.frustumCulled = false; d.count = 0;
      this.digits[v] = d; this.group.add(d);
    }
    // two faces show the bit to a viewer above and in front; the two opposite faces carry the next value and come round on a half turn
    const h = SIZE / 2 + 0.002, s = SIZE * 0.8, face = (x: number, y: number, z: number, rx: number) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(s, s, 1));
    this.faceM = [face(0, h, 0, -Math.PI / 2), face(0, 0, h, 0), face(0, -h, 0, Math.PI / 2), face(0, 0, -h, Math.PI)]; // top, front, bottom, back
    for (let i = 0; i < MAX; i++) this.cubes.push({ col: this.neutral.clone(), face: ['', '', '', ''], shown: '', angle: 0, target: 0, x: 0, scale: 0 });
    const g = new THREE.BufferGeometry();
    this.beamPos = new THREE.BufferAttribute(new Float32Array(12), 3);
    g.setAttribute('position', this.beamPos); g.setIndex([0, 1, 2, 2, 1, 3]);
    this.beamMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.beamMesh.frustumCulled = false; this.group.add(this.beamMesh);
  }

  // x of slot i when the row holds `count` bits
  slotX(i: number, count = this.count, gap = this.gap) {
    const nibs = count / 4;
    return (i - (count - 1) / 2) * BIT_PITCH + (Math.floor(i / 4) - (nibs - 1) / 2) * NIB_GAP * gap;
  }

  update(dt: number) {
    let moving = false, nBody = 0;
    const nDigit: Record<string, number> = { 0: 0, 1: 0 }, ease = 1 - Math.exp(-8 * dt);
    for (let i = 0; i < MAX; i++) {
      const q = this.cubes[i], inRow = i < this.count;
      // appear one after another, left to right
      const a = (i / this.count) * 0.6, base = inRow ? outBack(clamp01((this.show - a) / 0.4)) : 0;
      let scale = base, y = 0, tilt = 0;
      if (i === 6 || i === 7) { // the two low opcode bits fall away, then the slots come back empty for n and i
        if (this.respawn > 0) scale = base * outBack(clamp01(this.respawn));
        else { const k = io(clamp01(this.fall)); y = -3.4 * k * k; tilt = k * 2.2 * (i === 6 ? -1 : 1); scale = base * (1 - k * 0.999); }
      }
      q.scale = Math.abs(q.scale - scale) < 0.002 ? scale : damp(q.scale, scale, 14, dt);
      const tx = this.slotX(Math.min(i, this.count - 1));
      q.x = Math.abs(q.x - tx) > 6 || Math.abs(q.x - tx) < 0.002 ? tx : damp(q.x, tx, 12, dt);
      if (q.scale !== scale || q.x !== tx) moving = true;

      // turn over when the content changes: put the new value on the hidden pair of faces, then half a turn
      const w = inRow ? this.want[i] ?? null : null, key = w ? w.tone + w.v : '';
      if (key !== q.shown) {
        const hidden = (Math.round(q.target / Math.PI) + 1) % 2;
        q.face[hidden * 2] = q.face[hidden * 2 + 1] = w ? w.v : '';
        q.target += Math.PI; q.shown = key;
      }
      q.angle = damp(q.angle, q.target, 11, dt);
      if (q.target - q.angle < 0.002) q.angle = q.target; else moving = true;
      const tone = w ? TONE[w.tone] ?? '#ffffff' : null;
      q.col.lerp(tone ? this.c.set(tone) : this.neutral, ease);

      if (q.scale <= 0.004) continue; // not there (yet)
      this.pos.set(q.x, y, 0); this.quat.setFromEuler(this.eul.set(0, 0, tilt)); this.scl.setScalar(Math.max(0.001, q.scale));
      this.m.compose(this.pos, this.quat, this.scl).multiply(this.m2.makeRotationX(q.angle));
      this.bodies.setMatrixAt(nBody, this.m); this.bodies.setColorAt(nBody++, q.col);
      for (let k = 0; k < 4; k++) {
        const v = q.face[k];
        if (v) this.digits[v].setMatrixAt(nDigit[v]++, this.m2.multiplyMatrices(this.m, this.faceM[k]));
      }
    }
    this.bodies.count = nBody; this.bodies.instanceMatrix.needsUpdate = true; this.bodies.instanceColor!.needsUpdate = true;
    for (const v of ['0', '1']) { this.digits[v].count = nDigit[v]; this.digits[v].instanceMatrix.needsUpdate = true; }
    this.moving = moving;
    const b = this.beam, on = clamp01(b.on) * clamp01(this.show);
    this.beamMesh.visible = on > 0.01;
    if (this.beamMesh.visible) {
      const xa = this.slotX(0) - SIZE / 2, xb = this.slotX(this.count - 1) + SIZE / 2, yb = -SIZE / 2 - 0.06;
      this.beamPos.setXYZ(0, b.x0, b.y, 0); this.beamPos.setXYZ(1, b.x1, b.y, 0);
      this.beamPos.setXYZ(2, xa, yb, 0); this.beamPos.setXYZ(3, xb, yb, 0);
      this.beamPos.needsUpdate = true;
      (this.beamMesh.material as THREE.MeshBasicMaterial).opacity = 0.1 * on;
    }
  }

  // name: "span:lo:hi" (just under bits lo..hi) or "nib:j" (just above the j-th group of four)
  anchor(name: string, out: THREE.Vector3): THREE.Vector3 {
    const [k, a, b] = name.split(':');
    if (k === 'span') return this.group.localToWorld(out.set((this.slotX(+a) + this.slotX(+b)) / 2, -SIZE / 2 - 0.1, SIZE / 2));
    if (k === 'nib') return this.group.localToWorld(out.set((this.slotX(+a * 4) + this.slotX(+a * 4 + 3)) / 2, SIZE / 2 + 0.16, 0));
    return this.group.localToWorld(out.set(0, 0, 0));
  }
}
