// An instruction as a row of bits: one cube per bit, coloured by the field it belongs to.
// A cube turns over to show its 0 or 1 when the assembler decides it.
import * as THREE from 'three';
import { Label, M, MONO, TONE, clamp01, damp, io, outBack, rbox, unitPlane } from './kit.ts';

export interface Bit { v: string; tone: string } // v is '0' or '1'
export const BIT_PITCH = 0.5;
const SIZE = 0.41, MAX = 32, NIB_GAP = 0.3;

interface Cube {
  group: THREE.Group; spin: THREE.Group; mat: THREE.MeshPhysicalMaterial; decals: THREE.Mesh[];
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

  private cubes: Cube[] = [];
  private beamMesh: THREE.Mesh; private beamPos: THREE.BufferAttribute;
  private neutral = new THREE.Color(0x141d2e); private c = new THREE.Color();

  constructor() {
    const m = M(), geo = rbox(SIZE, SIZE, SIZE, 0.07, 3), h = SIZE / 2 + 0.002, s = SIZE * 0.8;
    for (let i = 0; i < MAX; i++) {
      const group = new THREE.Group(), spin = new THREE.Group();
      const mat = m.body.clone(); mat.color.copy(this.neutral); mat.emissive = new THREE.Color(0x000000); mat.roughness = 0.5; mat.metalness = 0.05; mat.envMapIntensity = 0.5;
      const body = new THREE.Mesh(geo, mat); body.castShadow = true; spin.add(body);
      // two faces show the bit to a viewer above and in front; the two opposite faces carry the next value and come round on a half turn
      const decals = [0, 1, 2, 3].map((k) => {
        const p = new THREE.Mesh(unitPlane, decal('0')); p.scale.set(s, s, 1); p.visible = false;
        if (k === 0) { p.position.y = h; p.rotation.x = -Math.PI / 2; }      // top
        else if (k === 1) p.position.z = h;                                   // front
        else if (k === 2) { p.position.y = -h; p.rotation.x = Math.PI / 2; }  // bottom
        else { p.position.z = -h; p.rotation.x = Math.PI; }                   // back
        spin.add(p); return p;
      });
      group.add(spin); group.scale.setScalar(0.001); group.visible = false;
      this.group.add(group);
      this.cubes.push({ group, spin, mat, decals, shown: '', angle: 0, target: 0, x: 0, scale: 0 });
    }
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
    let moving = false;
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
      q.group.visible = q.scale > 0.004;
      q.group.position.set(q.x, y, 0);
      q.group.rotation.z = tilt;
      q.group.scale.setScalar(Math.max(0.001, q.scale));

      // turn over when the content changes: put the new value on the hidden pair of faces, then half a turn
      const w = inRow ? this.want[i] ?? null : null, key = w ? w.tone + w.v : '';
      if (key !== q.shown) {
        const hidden = (Math.round(q.target / Math.PI) + 1) % 2;
        for (const k of [hidden * 2, hidden * 2 + 1]) { q.decals[k].visible = !!w; if (w) q.decals[k].material = decal(w.v); }
        q.target += Math.PI; q.shown = key;
      }
      q.angle = damp(q.angle, q.target, 11, dt);
      if (q.target - q.angle < 0.002) q.angle = q.target; else moving = true;
      q.spin.rotation.x = q.angle;
      const tone = w ? TONE[w.tone] ?? '#ffffff' : null;
      this.c.set(tone ?? 0x000000);
      q.mat.emissive.lerp(this.c, 1 - Math.exp(-8 * dt));
      q.mat.emissiveIntensity = 0.16;
      q.mat.color.lerp(tone ? this.c.set(tone) : this.c.copy(this.neutral), 1 - Math.exp(-8 * dt));
    }
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
