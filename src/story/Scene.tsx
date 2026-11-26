// The story's canvas. It builds the 3D world once and, on every frame, hands it the scroll clock
// and pins the page's labels to their points in the scene.
import React, { useEffect, useMemo } from 'react';
import { Canvas, invalidate, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Clock, World } from './world.ts';
import { Story } from './data.ts';
import { hooks } from '../three/kit.ts';

export interface SceneProps {
  story: Story;
  clock: React.RefObject<Clock>;
  pins: React.RefObject<Map<HTMLElement, string>>; // page elements pinned to named points of the scene
}

function Rig({ story, clock, pins }: SceneProps) {
  const gl = useThree((s) => s.gl), scene = useThree((s) => s.scene);
  const world = useMemo(() => new World(story, gl, scene), [story, gl, scene]);
  useEffect(() => { hooks.changed = () => invalidate(); return () => { hooks.changed = () => {}; world.dispose(); }; }, [world]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, dt) => {
    const cam = state.camera as THREE.PerspectiveCamera, { width, height } = state.size;
    world.update(clock.current!, Math.min(dt, 0.05), cam, width, height);
    if (world.busy) state.invalidate();
    scene.updateMatrixWorld();
    cam.updateMatrixWorld();
    pins.current!.forEach((name, el) => {
      world.anchor(name, v).project(cam);
      const x = (v.x * 0.5 + 0.5) * width, y = (-v.y * 0.5 + 0.5) * height;
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      el.style.display = v.z > 1 || v.z < -1 ? 'none' : '';
    });
  });
  return null;
}

// If WebGL is not available the story still reads as text; the canvas is simply left out.
class Safe extends React.Component<{ children: React.ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  render() { return this.state.bad ? null : this.props.children; }
}

export default function Scene(props: SceneProps) {
  return (
    <Safe>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.6]}
        shadows
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 30, near: 0.1, far: 300, position: [8.5, 7.6, 13.5] }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; gl.shadowMap.type = THREE.VSMShadowMap; gl.setClearColor(0x000000, 0); }}
      >
        <Rig {...props} />
      </Canvas>
    </Safe>
  );
}
