// The story's canvas. It builds the 3D world once and, on every frame, hands it the scroll clock
// and pins the page's labels to their points in the scene.
import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, invalidate, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Clock, World } from './world.ts';
import { Story } from './data.ts';
import { hooks } from '../three/kit.ts';

// A page element pinned to a named point of the scene. ch: the chapter it sits in (−1: none).
// tr and off remember what was last written to the element, so nothing is written twice.
export interface Pin { at: string; ch: number; tr?: string; off?: boolean }
export interface SceneProps {
  story: Story;
  clock: React.RefObject<Clock>;
  pins: React.RefObject<Map<HTMLElement, Pin>>;
}

const TOP_DPR = 1.5; // sharper than this costs a lot and shows little
const SLOW_MS = 22;  // a slower average than this while the picture moves: draw fewer pixels
const REST_MS = 260; // the picture has stood still this long: draw it once more at full sharpness
const WARM_MS = 2500; // the first moments compile shaders and load fonts; they say nothing about the machine

// The resolutions to fall back through, sharpest first
function ladder(top: number) {
  const floor = Math.min(top, 0.75), out: number[] = [];
  for (const k of [1, 0.82, 0.67, 0.55]) { const d = Math.max(floor, top * k); if (!out.length || out[out.length - 1] - d > 0.01) out.push(d); }
  return out;
}

function Rig({ story, clock, pins }: SceneProps) {
  const gl = useThree((s) => s.gl), scene = useThree((s) => s.scene), setDpr = useThree((s) => s.setDpr);
  const world = useMemo(() => new World(story, gl, scene), [story, gl, scene]);
  useEffect(() => { hooks.changed = () => invalidate(); return () => { hooks.changed = () => {}; world.dispose(); }; }, [world]);
  const v = useMemo(() => new THREE.Vector3(), []);
  const was = useRef(-1);

  // Keeping the motion smooth on any machine. While the picture moves and most frames come slowly, it is drawn with
  // fewer pixels: a step or two down, kept only if that really made frames come faster (if it did not, something
  // else holds this machine back and the pixels are given back). As soon as the picture stands still it is drawn
  // once more at full sharpness, which is what an audience looks at while someone talks. The words and labels are
  // HTML and stay sharp throughout.
  const pace = useRef({ level: 0, fixed: false, n: 0, sum: 0, slow: 0, runs: 0, base: 0, tries: 0, lastU: -1, movedAt: 0, born: performance.now() });
  useEffect(() => {
    const w = window as unknown as { __story?: unknown };
    w.__story = { world, gl, pace: pace.current }; // for looking at the scene from the browser console
    return () => { delete w.__story; };
  }, [world, gl]);

  useFrame((state, dt) => {
    const c = clock.current!, q = pace.current, now = performance.now();
    const top = Math.min(window.devicePixelRatio || 1, TOP_DPR), steps = ladder(top), last = steps.length - 1;
    if (Math.abs(c.u - q.lastU) > 1e-5 || world.busy) q.movedAt = now;
    q.lastU = c.u;
    const moving = now - q.movedAt < REST_MS;
    if (moving && !q.fixed && now - q.born > WARM_MS && dt > 0 && dt < 0.25) { // a longer gap is a pause, not a slow frame
      if (++q.n > 0) { q.sum += dt * 1000; if (dt * 1000 > SLOW_MS) q.slow++; } // (n starts below zero after a resize, to let it settle)
      if (q.n >= 30 || (q.n >= 10 && q.sum > 1500)) { // thirty frames, or a second and a half on a machine that crawls
        const avg = q.sum / q.n, slow = q.slow >= q.n * 0.6;
        q.n = q.sum = q.slow = 0;
        if (q.base) { // one or two steps down are being tried
          if (avg < q.base * 0.9) q.base = 0; // it helped: keep it
          else if (q.tries < 2 && q.level < last) { q.level++; q.tries++; }
          else { q.level -= q.tries; q.base = 0; q.fixed = true; } // it bought nothing: pixels are not what is slow here
          q.runs = 0;
        } else if (slow) {
          if (++q.runs >= 2) { q.runs = 0; if (q.level < last) { q.base = avg; q.tries = 1; q.level++; } else q.fixed = true; }
        } else q.runs = 0;
      }
    }
    const dpr = moving ? steps[Math.min(q.level, last)] : top;
    if (Math.abs(state.viewport.dpr - dpr) > 0.001) { setDpr(dpr); q.n = Math.min(q.n, -3); } // resizes the canvas now; the frame drawn below fills it

    const cam = state.camera as THREE.PerspectiveCamera, { width, height } = state.size;
    world.update(c, Math.min(dt, 0.05), cam, width, height);
    if (world.busy) state.invalidate();
    scene.updateMatrixWorld();
    cam.updateMatrixWorld();
    // only the labels of the chapter on screen (and of the one just left) need to follow the scene
    pins.current!.forEach((p, el) => {
      if (p.ch >= 0 && p.ch !== c.ch && p.ch !== was.current) return;
      world.anchor(p.at, v).project(cam);
      const tr = `translate3d(${((v.x * 0.5 + 0.5) * width).toFixed(1)}px,${((-v.y * 0.5 + 0.5) * height).toFixed(1)}px,0)`;
      if (tr !== p.tr) { p.tr = tr; el.style.transform = tr; }
      const off = v.z > 1 || v.z < -1;
      if (off !== p.off) { p.off = off; el.style.display = off ? 'none' : ''; }
    });
    was.current = c.ch;
  });
  return null;
}

// If WebGL is not available the story still reads as text; the canvas is simply left out.
class Safe extends React.Component<{ children: React.ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  render() { return this.state.bad ? null : this.props.children; }
}

function Scene(props: SceneProps) {
  return (
    <Safe>
      <Canvas
        frameloop="demand"
        dpr={[1, TOP_DPR]}
        shadows="percentage"
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 30, near: 0.1, far: 300, position: [8.5, 7.6, 13.5] }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; gl.setClearColor(0x000000, 0); }}
      >
        <Rig {...props} />
      </Canvas>
    </Safe>
  );
}

// its props never change, so the page's own re-renders do not reach the canvas
export default React.memo(Scene);
