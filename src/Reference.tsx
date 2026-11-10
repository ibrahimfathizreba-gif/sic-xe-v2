import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { OPCODES } from './sicxe/opcodes.ts';
import { hex } from './explain.ts';

const REGS = [
  ['A', 0, 'Accumulator: arithmetic and logic'], ['X', 1, 'Index register'], ['L', 2, 'Linkage: return address of JSUB'],
  ['B', 3, 'Base register for base-relative addressing'], ['S', 4, 'General working register'], ['T', 5, 'General working register'],
  ['F', 6, 'Floating-point accumulator (48 bits)'], ['PC', 8, 'Address of the NEXT instruction'], ['SW', 9, 'Status word; condition code (CC) in it'],
] as const;

// Bit layout of each instruction format: [label, width in bits]
const FORMATS: [string, string, [string, number][]][] = [
  ['Format 1', '1 byte', [['op', 8]]],
  ['Format 2', '2 bytes', [['op', 8], ['r1', 4], ['r2', 4]]],
  ['Format 3', '3 bytes', [['op', 6], ['n', 1], ['i', 1], ['x', 1], ['b', 1], ['p', 1], ['e', 1], ['disp', 12]]],
  ['Format 4', '4 bytes · written +OP', [['op', 6], ['n', 1], ['i', 1], ['x', 1], ['b', 1], ['p', 1], ['e', 1], ['address', 20]]],
];

export function Reference({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const ops = Object.values(OPCODES)
    .filter((o) => !q || o.mnemonic.includes(q.toUpperCase()) || o.description.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.opcode - b.opcode);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="SIC/XE reference" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-h">
          <div><h2>SIC/XE reference</h2><p className="hint">Leland Beck, System Software · press Esc to close</p></div>
          <button className="link" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </header>

        <section>
          <h3>Encode an instruction by hand</h3>
          <ol className="steps">
            <li><b>Format and length.</b> Format 2 for register instructions, <code>+</code> means format 4 (4 bytes), otherwise format 3 (3 bytes).</li>
            <li><b>Opcode + n,i.</b> Take the opcode from the table; its last two bits are replaced by <code>n i</code>: <code>#</code> → 01, <code>@</code> → 10, plain → 11.</li>
            <li><b>PC = address of this instruction + its length.</b> PC always points to the <i>next</i> instruction.</li>
            <li><b>Displacement.</b> Try PC-relative: <code>disp = TA − PC</code>, must be −2048..2047 (negative → 12-bit two's complement). If not, base-relative: <code>disp = TA − B</code>, must be 0..4095. If neither fits, use format 4.</li>
            <li><b>Write it out.</b> <code>op(6) n i x b p e disp</code> in binary, then group into hex. Example: <code>LDB #LENGTH</code> at 0003, LENGTH = 0033 → <code>69202D</code>.</li>
          </ol>
        </section>

        <section>
          <h3>Instruction formats</h3>
          {FORMATS.map(([name, size, fields]) => (
            <div key={name} className="fmt">
              <div className="fmt-n"><b>{name}</b><span className="hint">{size}</span></div>
              <div className="bits">
                {fields.map(([f, w]) => <span key={f} style={{ flexGrow: w }} className={w === 1 ? 'bit' : ''}>{f}<small>{w}</small></span>)}
              </div>
            </div>
          ))}
        </section>

        <section className="two">
          <div>
            <h3>Addressing: n i bits</h3>
            <table className="sym">
              <thead><tr><th>n i</th><th>Mode</th><th>Operand used</th></tr></thead>
              <tbody>
                <tr><td>0 1</td><td>Immediate <code>#</code></td><td>TA itself (no memory read)</td></tr>
                <tr><td>1 1</td><td>Simple</td><td>word at TA</td></tr>
                <tr><td>1 0</td><td>Indirect <code>@</code></td><td>word at (word at TA)</td></tr>
                <tr><td>0 0</td><td>SIC compatible</td><td>15-bit address, word at it</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3>Target address: x b p e bits</h3>
            <table className="sym">
              <thead><tr><th>Bit</th><th>Rule</th></tr></thead>
              <tbody>
                <tr><td>p = 1</td><td>TA = PC + disp &nbsp;(−2048..2047)</td></tr>
                <tr><td>b = 1</td><td>TA = B + disp &nbsp;(0..4095)</td></tr>
                <tr><td>b = p = 0</td><td>TA = disp (direct)</td></tr>
                <tr><td>x = 1</td><td>add X to TA (indexed, <code>,X</code>)</td></tr>
                <tr><td>e = 1</td><td>format 4: TA = 20-bit address</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="two">
          <div>
            <h3>Registers</h3>
            <table className="sym">
              <thead><tr><th>Reg</th><th>No.</th><th>Use</th></tr></thead>
              <tbody>{REGS.map(([r, n, d]) => <tr key={r}><td>{r}</td><td>{n}</td><td>{d}</td></tr>)}</tbody>
            </table>
          </div>
          <div>
            <h3>Condition code and directives</h3>
            <table className="sym">
              <tbody>
                <tr><td>CC</td><td>Set by COMP, COMPR, TIX, TIXR: LT, EQ or GT. JLT / JEQ / JGT test it.</td></tr>
                <tr><td>START / END</td><td>Program name and start address / end and first instruction</td></tr>
                <tr><td>BYTE</td><td><code>C'EOF'</code> → 454F46, <code>X'F1'</code> → F1</td></tr>
                <tr><td>WORD</td><td>One 3-byte constant</td></tr>
                <tr><td>RESB / RESW</td><td>Reserve n bytes / n words (no object code)</td></tr>
                <tr><td>BASE</td><td>Tells the assembler what B will hold</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3>
            Opcode table
            <input className="find" placeholder="Search, e.g. LD or compare" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search opcodes" />
          </h3>
          <div className="optab">
            <table className="sym">
              <thead><tr><th>Mnemonic</th><th>Opcode</th><th>Format</th><th>Effect</th></tr></thead>
              <tbody>
                {ops.map((o) => (
                  <tr key={o.mnemonic} className={o.isUnsupported ? 'off' : ''}>
                    <td>{o.mnemonic}</td><td>{hex(o.opcode, 2)}</td><td>{o.format}</td>
                    <td>{o.description.replace(' (unsupported)', '')}{o.isUnsupported && <span className="hint"> · not simulated</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
