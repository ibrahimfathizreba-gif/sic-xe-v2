# SIC/XE Lab

[![CI](https://github.com/ibrahimfathizreba-gif/sic-xe-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/ibrahimfathizreba-gif/sic-xe-v2/actions/workflows/ci.yml)

A two-pass assembler and step-by-step visual simulator for Leland Beck's **SIC/XE** machine (*System Software*), built with TypeScript and React. Runs entirely in the browser.

**Live:** https://ibrahimfathizreba-gif.github.io/sic-xe-v2/

---

## Quick start

```bash
npm ci          # install exactly the locked dependencies
npm run dev     # open http://localhost:3000
npm test        # engine tests (assembler, CPU, all examples)
npm run lint    # type-check
npm run build   # production build in dist/
```

Requires Node.js 20.19+ or 22.12+.

---

## 1. Features

- **Two-pass assembler**
  - **Pass 1**: computes `LOCCTR`, identifies formats 1–4 and the directives `START`, `END`, `BYTE`, `WORD`, `RESB`, `RESW`, `BASE`, `NOBASE`, and builds the symbol table.
  - **Pass 2**: emits machine code following Beck's rules: PC-relative first (`-2048..2047`), base-relative when `BASE` is active (`0..4095`), otherwise asks for format 4 (`+`).
  - **Object program**: `H`, `T`, `M` and `E` records.
  - **Errors** shown per line: duplicate labels, undefined symbols, out-of-range displacements.

- **Layout**: the program stays on one side and the explanation on the other, so the line, its steps and its bits are on screen together. Two modes at the top: **1 Assemble → 2 Run**.
- **English / Arabic**: one button switches the whole interface and every generated explanation to Arabic (right-to-left); code, hex and bits stay left-to-right. English is the default; the choice is remembered (`?lang=ar` also works).
- **Assemble mode (step by step)**: walk through what the assembler does, with Step, Back and a timeline.
  - **Pass 1**, line by line: LOCCTR before → after and why (+3 format 3, +4 for `+`, 3 × n for RESW …), each label entering SYMTAB, forward references flagged.
  - **Pass 2**, line by line: the encoding worked out like on paper (opcode, `n i`, `x`, PC = LOC + length, `disp = TA − PC` and the range check, falling back to base-relative), then the instruction **as 0s and 1s**, field by field in colour, grouped in fours into hex.
  - The **object program** builds up as Pass 2 writes it (H, T, M, E records).
  - Every explanation is checked by a test to produce exactly the hex the assembler produced.

- **CPU simulator**
  - 1 MB byte-addressable memory, 24-bit big-endian words; registers `A X L B S T PC SW`.
  - Fetch → decode → execute, with the `n i x b p e` bits and the target-address formula shown for every instruction.
  - A plain-English sentence explaining what each instruction will do.
  - **Step, Back, Play/Pause, Reset** and a **timeline** to travel to any earlier step (keyboard: `→`, `←`, `Space`).
  - **Breakpoints**: click the dot next to a line in the listing.
  - A faulting instruction (division by zero, illegal immediate store, unsupported opcode) stops the machine with the reason, and PC stays on the instruction that failed.

- **3D machine view**: CPU blocks, registers and memory on a board. Light pulses follow the real data path of the last instruction (cyan = fetch, amber = execute, green = store). Memory rows far from the program (for example a buffer after `RESB 3000`) are brought onto the board when an instruction uses them.

- **Load machine code directly**: paste raw hex at any start address, or a Beck object program (H/T/M/E, with or without `^`). It is disassembled, and Step, Back and the timeline work as usual. Handy for checking "decode this hex" exercises.
- **Reference sheet** (`?`): the hand-encoding method, bit layouts of formats 1–4, `n i` and `x b p e` rules, registers, directives and a searchable opcode table.
- **Demo walkthrough**: nine steps that drive the app on their own (assembler output, object program, decoding `TIX`, a loop, going back, base-relative and format 4, decoding the handout's hex). Press Next to present.
- **Memory tools**: ASCII column, jump to any address, copy the execution log.

- **Five example programs**: sum 1..5, subroutine call, base-relative and format 4, buffer copy, Fibonacci. Each one is checked by an automatic test.

---

## 2. Design Decisions

Where Leland Beck's *System Software* specification was silent or allowed implementation choices:

1. **Condition Code (CC) Representation**:
   - `LT` = `00` (binary 0)
   - `EQ` = `01` (binary 1)
   - `GT` = `10` (binary 2)
   - Stored in the low two bits of `SW` (`SW & 0x03`). Initial CC after reset is `EQ` (`SW = 1`).

2. **Halt Detection**:
   - Normal completion: An unconditional jump `J` to its own address (`HALT J HALT`). The simulator terminates with reason `"Jump to self (normal termination)"`.
   - Out-of-bounds: When PC moves outside the loaded program bounds or outside the 1 MB memory space.
   - Max step threshold: Play stops after 5,000 steps (100,000 for `CPU.run()`) to catch infinite loops.
   - Step count for `sum1to5.asm`: 19 instructions (LDX, LDA, 5 iterations of ADDR/TIX/JLT = 15, STA, plus the final halting J = 19).

3. **Format 3 Displacement Selection Precedence**:
   1. `#number` (immediate numeric literal): If `0 <= n <= 4095`, uses direct displacement (`b=0, p=0`). If outside this range, flags an error to use Format 4 (`+`).
   2. Target symbol:
      - First checks PC-relative: `disp = TA - (LOC + 3)`. If `-2048 <= disp <= 2047`, sets `p=1, b=0`.
      - If outside PC-relative range and `BASE` is active: `disp = TA - BASEADDR`. If `0 <= disp <= 4095`, sets `b=1, p=0`.
      - Otherwise flags an error: `"displacement out of range; use format 4 (+)"`.

4. **Modification (M) Records**:
   - Emitted for Format 4 instructions whose operand is a symbol (relocatable addresses). The length is 5 half-bytes (`M^address^05`). Numeric constants do not emit M-records.

5. **Directives**:
   - `START hex`: Program name from label (up to 6 characters, space-padded), initial LOCCTR.
   - `END [label]`: Optional entry point; defaults to START address if unspecified.
   - `WORD n`: 3 bytes, signed 24-bit two's complement.
   - `BYTE C'...'`: ASCII characters.
   - `BYTE X'...'`: Hex bytes (must be an even number of hex digits).
   - `RESB n` / `RESW n`: Reserve space (breaks T-records).

---

## 3. Supported Instruction Set

### Core Format 3/4
- **Load & Store**: `LDA`, `LDX`, `LDL`, `LDB`, `LDS`, `LDT`, `LDCH`, `STA`, `STX`, `STL`, `STB`, `STS`, `STT`, `STCH`
- **Arithmetic & Logic**: `ADD`, `SUB`, `MUL`, `DIV`, `AND`, `OR`
- **Compare & Test**: `COMP`, `TIX`
- **Jumps & Subroutines**: `J`, `JEQ`, `JGT`, `JLT`, `JSUB`, `RSUB`

### Core Format 2
- `ADDR`, `SUBR`, `MULR`, `DIVR`, `COMPR`, `CLEAR`, `TIXR`, `RMO`, `SHIFTL`, `SHIFTR`

### Unsupported Instructions
- Floating point (`FLOAT`, `FIX`, `NORM`, `LDF`, `STF`, `ADDF`, `SUBF`, `MULF`, `DIVF`, `COMPF`), I/O instructions (`RD`, `WD`, `TD`, `SIO`, `HIO`, `TIO`), and privileged instructions (`SVC`, `LPS`, `STI`, `STSW`, `SSK`) are identified and clearly raise `UnsupportedInstructionException` without crashing.

---

## 4. Tests

```bash
npm test
```

- `src/sicxe/sicxe.test.ts`: single-instruction encodings, assembler output and the CPU trace for `sum1to5`.
- `src/sicxe/examples.test.ts`: runs every example to completion and checks its result; checks that faults halt the CPU without moving PC.
- `src/asmTrace.test.ts`: the step-by-step explanation gives the same hex as the assembler for every line (all examples plus a program covering negative displacements, base-relative, format 4, indirect, format 1 and 2, BYTE and WORD); LOCCTR and SYMTAB match Pass 1.
- `src/program.test.ts`: raw-hex and object-program loading, including the handout decode exercises (`4B101036` → `+JSUB 01036`, …).

The same checks run on every push through GitHub Actions (`.github/workflows/ci.yml`), which also publishes the site to GitHub Pages.
