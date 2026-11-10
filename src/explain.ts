import { DecodedInstruction as D } from './sicxe/types.ts';

export const hex = (n: number, w = 4) => n.toString(16).toUpperCase().padStart(w, '0');

// Turns a decoded instruction into one plain-English sentence.
export function explain(d: D): string {
  const m = d.mnemonic.replace('+', '');
  const ta = d.targetAddress ?? 0;
  const v = d.operandValue ?? d.dispOrAddr ?? 0;
  const at = `0x${hex(ta)}`;
  const src =
    d.addressingMode === 'immediate' ? `the number ${v}`
    : d.addressingMode === 'indirect' ? `the value that address ${at} points to`
    : `the value stored at address ${at}`;
  const r1 = d.r1 ?? '?';
  const r2 = d.r2 ?? '?';

  const ld = m.match(/^LD([AXLBST])$/);
  if (ld) return `Copy ${src} into register ${ld[1]}.`;
  const st = m.match(/^ST([AXLBST])$/);
  if (st) return `Save register ${st[1]} into memory at ${at}.`;

  switch (m) {
    case 'LDCH': return `Read one byte from ${at} into the lowest byte of A.`;
    case 'STCH': return `Write the lowest byte of A to address ${at}.`;
    case 'ADD': return `Add ${src} to A.`;
    case 'SUB': return `Subtract ${src} from A.`;
    case 'MUL': return `Multiply A by ${src}.`;
    case 'DIV': return `Divide A by ${src}.`;
    case 'AND': return `Combine A with ${src} using AND.`;
    case 'OR': return `Combine A with ${src} using OR.`;
    case 'COMP': return `Compare A with ${src}. The answer is kept in the condition code.`;
    case 'TIX': return `Add 1 to X, then compare X with ${src}.`;
    case 'J': return `Jump to address ${at}.`;
    case 'JEQ': return `Jump to ${at}, but only if the last comparison was equal.`;
    case 'JLT': return `Jump to ${at}, but only if the last comparison was less than.`;
    case 'JGT': return `Jump to ${at}, but only if the last comparison was greater than.`;
    case 'JSUB': return `Call the subroutine at ${at}. The return address is saved in L.`;
    case 'RSUB': return `Return to the address saved in L.`;
    case 'ADDR': return `Add ${r1} to ${r2}.`;
    case 'SUBR': return `Subtract ${r1} from ${r2}.`;
    case 'MULR': return `Multiply ${r2} by ${r1}.`;
    case 'DIVR': return `Divide ${r2} by ${r1}.`;
    case 'COMPR': return `Compare ${r1} with ${r2}.`;
    case 'CLEAR': return `Reset ${r1} to 0.`;
    case 'TIXR': return `Add 1 to X, then compare X with ${r1}.`;
    case 'RMO': return `Copy ${r1} into ${r2}.`;
    case 'SHIFTL': return `Shift ${r1} left by ${d.shiftAmount ?? 1} bit(s).`;
    case 'SHIFTR': return `Shift ${r1} right by ${d.shiftAmount ?? 1} bit(s).`;
  }
  return d.disassembly;
}
