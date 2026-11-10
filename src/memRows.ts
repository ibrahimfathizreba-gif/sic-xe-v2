// Which 16-byte memory rows to show on screen.
// Starts with the program's own rows, then makes sure every "focus" address
// (the instruction that ran, the next one, the byte that was read or written)
// has its row on screen, even when it is far away (e.g. after RESB 3000).
export function memRows(base: number, programRows: number, max: number, focus: (number | undefined)[]): number[] {
  const rows: number[] = [];
  for (let i = 0; i < Math.min(programRows, max); i++) rows.push(base + i * 16);

  const need: number[] = [];
  for (const f of focus) {
    if (f === undefined || f < 0) continue;
    const r = Math.floor(f / 16) * 16;
    if (!need.includes(r)) need.push(r);
  }

  for (const r of need) {
    if (rows.includes(r)) continue;
    if (rows.length < max) { rows.push(r); continue; }
    // Replace the last row on screen that nobody needs.
    for (let i = rows.length - 1; i >= 0; i--) {
      if (!need.includes(rows[i])) { rows[i] = r; break; }
    }
  }
  return rows.sort((a, b) => a - b);
}

// Position of an address inside the rows on screen, or null if it is not shown.
export function rowIndex(rows: number[], addr: number): number | null {
  const i = rows.indexOf(Math.floor(addr / 16) * 16);
  return i < 0 ? null : i * 16 + (addr % 16);
}

// "0000–002F, 0BD0–0BDF" — the address ranges on screen, merged when they touch.
export function rowRanges(rows: number[], hex: (n: number, w?: number) => string): string {
  const out: [number, number][] = [];
  for (const r of rows) {
    const lastRange = out[out.length - 1];
    if (lastRange && lastRange[1] + 1 === r) lastRange[1] = r + 15;
    else out.push([r, r + 15]);
  }
  return out.map(([a, b]) => `${hex(a, 4)}–${hex(b, 4)}`).join(', ');
}
