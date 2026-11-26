// Shared 3D kit: easing, text drawn on canvas, materials and small geometry helpers.
// Every model in the project is built from simple shapes in code, so nothing is downloaded at run time.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export * from './ease.ts';
import { clamp01, mix } from './ease.ts';

// ---------- colours (the lab's own field colours, so the story and the lab always agree) ----------
export const TONE: Record<string, string> = {
  op: '#fbbf24', ni: '#38bdf8', x: '#c4b5fd', bp: '#34d399', e: '#f472b6', disp: '#fb923c', reg: '#c4b5fd', data: '#93c5fd',
};
export const CYAN = '#38bdf8', AMBER = '#fbbf24', GREEN = '#34d399';

export const MONO = '"JetBrains Mono", ui-monospace, monospace';

// ---------- text on canvas ----------
type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
const labels = new Set<Label>();

// A small canvas with text, used as a texture. It is drawn again once the fonts have loaded.
export class Label {
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  draw: Draw;
  constructor(w: number, h: number, draw: Draw) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.draw = draw;
    labels.add(this);
    this.redraw();
  }
  redraw(draw?: Draw) {
    if (draw) this.draw = draw;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.draw(g, this.canvas.width, this.canvas.height);
    this.tex.needsUpdate = true;
  }
  dispose() { labels.delete(this); this.tex.dispose(); }
}

// Called when a texture is redrawn outside the frame loop (fonts arriving), so a paused canvas draws once more
export const hooks = { changed: () => {} };

let fontsAsked = false;
export function loadFonts() {
  if (fontsAsked || typeof document === 'undefined' || !document.fonts) return;
  fontsAsked = true;
  const want = ['500 32px "JetBrains Mono"', '700 32px "JetBrains Mono"', '800 32px "JetBrains Mono"'];
  Promise.all(want.map((f) => document.fonts.load(f).catch(() => null))).then(() => { labels.forEach((l) => l.redraw()); hooks.changed(); });
}

export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color: string, weight = 700, align: CanvasTextAlign = 'center') {
  g.font = `${weight} ${px}px ${MONO}`;
  g.textAlign = align; g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ---------- geometry ----------
const boxes = new Map<string, THREE.BufferGeometry>();
export function rbox(w: number, h: number, d: number, r = 0.04, s = 3): THREE.BufferGeometry {
  const k = [w, h, d, r, s].join('|');
  let geo = boxes.get(k);
  if (!geo) { geo = new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2, h / 2, d / 2)); boxes.set(k, geo); }
  return geo;
}
export const unitPlane = new THREE.PlaneGeometry(1, 1);

// A flat plane lying on top of something, facing up, with its text reading towards +z (the viewer)
export function topPlane(w: number, d: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(unitPlane, mat);
  m.scale.set(w, d, 1);
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ---------- textures made in code ----------
function brushed(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const y = Math.random() * 256, x = Math.random() * 256, l = 30 + Math.random() * 160, v = 100 + Math.random() * 90;
    g.fillStyle = `rgba(${v},${v},${v},${0.12 + Math.random() * 0.2})`;
    g.fillRect(x, y, l, 1);
    if (x + l > 256) g.fillRect(x - 256, y, l, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------- materials (made once, shared) ----------
export interface Mats {
  lid: THREE.MeshStandardMaterial; gold: THREE.MeshStandardMaterial; ceramic: THREE.MeshStandardMaterial;
  silicon: THREE.MeshPhysicalMaterial; copper: THREE.MeshStandardMaterial; body: THREE.MeshPhysicalMaterial;
  cap: THREE.MeshStandardMaterial; rail: THREE.MeshStandardMaterial; steel: THREE.MeshStandardMaterial;
  glow: THREE.CanvasTexture;
}
let mats: Mats | null = null;
export function M(): Mats {
  if (mats) return mats;
  const br = brushed();
  mats = {
    lid: new THREE.MeshStandardMaterial({ color: 0xc4cad3, metalness: 1, roughness: 0.42, roughnessMap: br }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe0ab4a, metalness: 1, roughness: 0.26 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0x1a1e26, metalness: 0.15, roughness: 0.58 }),
    silicon: new THREE.MeshPhysicalMaterial({ color: 0x0c1a33, metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.18 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xd08a4e, metalness: 1, roughness: 0.3 }),
    body: new THREE.MeshPhysicalMaterial({ color: 0x1b2536, metalness: 0.25, roughness: 0.46, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.65 }),
    cap: new THREE.MeshStandardMaterial({ color: 0x1d2c47, metalness: 0.3, roughness: 0.42 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x232a36, metalness: 0.85, roughness: 0.4, roughnessMap: br }),
    steel: new THREE.MeshStandardMaterial({ color: 0xaab2bf, metalness: 1, roughness: 0.3 }),
    glow: glowTexture(),
  };
  return mats;
}

// A soft dark patch laid under an object, so it sits on the page instead of floating over it
export function contactShadow(w: number, d: number, opacity = 0.5): THREE.Mesh {
  const pad = 1.6, W = w + pad * 2, D = d + pad * 2, px = 28;
  const c = document.createElement('canvas'); c.width = Math.round(W * px); c.height = Math.round(D * px);
  const g = c.getContext('2d')!;
  g.shadowColor = 'rgba(0,0,0,1)'; g.shadowBlur = pad * px * 0.55; g.shadowOffsetX = c.width * 2;
  g.fillStyle = '#000';
  roundRect(g, pad * px - c.width * 2, pad * px, w * px, d * px, 10); g.fill();
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity, depthWrite: false, toneMapped: false }));
  m.scale.set(W, D, 1); m.rotation.x = -Math.PI / 2; m.position.y = 0.004; m.renderOrder = -1;
  return m;
}

// Soft studio lighting for reflections on metal, built in code (no image file).
export function makeEnvironment(gl: THREE.WebGLRenderer): THREE.Texture {
  const pm = new THREE.PMREMGenerator(gl);
  const env = pm.fromScene(new RoomEnvironment(), 0.03).texture;
  pm.dispose();
  return env;
}

// A point walked along a polyline: returns the position at distance d from the start.
export type P3 = [number, number, number];
export function pathLength(pts: P3[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
  return L;
}
export function pathAt(pts: P3[], d: number, out: THREE.Vector3): THREE.Vector3 {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (d <= l || i === pts.length - 1) { const k = l ? clamp01(d / l) : 0; return out.set(mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)); }
    d -= l;
  }
  return out.set(pts[0][0], pts[0][1], pts[0][2]);
}
