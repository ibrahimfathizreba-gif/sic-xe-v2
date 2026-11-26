// Small number helpers used by the scroll timetable and the 3D scene. No 3D library here, so tests can load it.
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a)); // 0 before a, 1 after b
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;
export const io = (x: number) => x * x * (3 - 2 * x); // ease in and out
export const io3 = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const out3 = (x: number) => 1 - Math.pow(1 - x, 3);
export const outBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
export const damp = (cur: number, target: number, lambda: number, dt: number) => mix(cur, target, 1 - Math.exp(-lambda * dt));
export const bump = (x: number) => Math.sin(Math.PI * clamp01(x)); // 0 → 1 → 0

