# PROJECT_CONTEXT.md

## 1. Project Objective
Build an **Interactive Data Link Layer Protocol Simulator** as a Computer Networks Innovative Assignment (Semester V). The application visually demonstrates fundamental Layer 2 operations:
- Framing (Bit stuffing, Byte stuffing, Character count)
- Error Control (CRC polynomial division, Checksum, Parity, interactive fault injection)
- Flow Control (Stop-and-Wait ARQ, Go-Back-N ARQ, Selective Repeat ARQ)
- Medium Access Control (CSMA/CD on a shared bus with collision detection and exponential backoff)

The simulator is designed with high academic rigor and viva explainability, prioritizing algorithmic correctness over superficial animation.

---

## 2. Architecture & Technology Stack
- **Frontend Framework:** React 19 + Vite 6 (JavaScript, ESM).
- **Package Manager:** pnpm v12.
- **Styling:** Pure CSS with CSS variables and responsive modular styles; zero heavy UI libraries.
- **Test Runner:** Vitest v3 for pure, decoupled algorithmic test suites.
- **Simulation Paradigm:** Discrete-event scheduler (`SimulationEngine`) using a virtual clock. Timers, propagation delays, and retransmissions are managed via an event queue, not uncontrolled asynchronous `setTimeout` calls.
- **Decoupling Strategy:**
  - `src/core/`: 100% pure JavaScript network algorithms, state machines, and mathematical utilities. Completely independent of React.
  - `src/ui/`: React presentation components that subscribe to engine state snapshots.
  - `src/tests/`: Vitest test suites verifying protocol correctness, edge cases, and standard test vectors.

---

## 3. Important Decisions & Assumptions
1. **Simulation Model vs. Real Networks:** The simulator explicitly models discrete-time events and virtual packet transmission. Propagation delay, transmission delay, and channel loss are simulated parameters, not actual socket traffic.
2. **Deterministic Execution:** Virtual ticks drive the simulation, allowing exact single-stepping, pause/resume, and repeatable debugging for viva presentations.
3. **Sequence Number Bounds:**
   - Stop-and-Wait ARQ: 1-bit sequence number ($0, 1$).
   - Go-Back-N ARQ: Window size $W \le 2^m - 1$ for an $m$-bit sequence space.
   - Selective Repeat ARQ: Window size $W \le 2^{m-1}$.
4. **Byte Stuffing Conventions:** Default follows standard **RFC 1662 Section 4.2** (PPP Octet Stuffing: transmitter escapes `0x7E` $\rightarrow$ `[0x7D, 0x5E]` and `0x7D` $\rightarrow$ `[0x7D, 0x5D]`). On reception, `0x7D` is removed and the following octet has bit 5 inverted (`nextOctet ^ 0x20`), meaning any octet (e.g., `[0x7D, 0x41]` $\rightarrow$ `0x61`) decodes transparently. If `0x7D` is immediately followed by `0x7E`, the frame is aborted per RFC 1662. Generic educational escape mode (`[0x7D, 0x7E]`, `[0x7D, 0x7D]`) and optional strict minimum escape checks are also supported. Full PPP features (ACCM negotiation, LCP, Address/Control compression, FCS-16/32 CRC) remain outside the scope of this framing transparency module.
5. **Bit Stuffing Flag Protection:** Payloads containing raw flag sequences (`01111110`) or multiple consecutive flags are stuffed without leaking delimiter flags into the transmission stream, and destuffing restores the exact original bitstream.
6. **CRC Calculation:** Modulo-2 polynomial division is implemented bit-by-bit to expose full step-by-step traces for examiner review.
7. **No External UI Frameworks:** Avoided Tailwind / MUI to keep the codebase transparent, lightweight, and straightforward to explain during evaluation.

---

## 4. Completed Modules
- [x] **Phase 1: Project Planning & Requirements Analysis** (Approved)
- [x] **Phase 2: Project Foundation, Git Setup & Tracking Documentation** (Vite + React + Vitest initialized, `.gitignore` created, test runner operational)
- [x] **Phase 3: Discrete-Event Simulation Engine Core** (`EventQueue.js`, `SimulationEngine.js`, `Channel.js`, and comprehensive unit tests in `src/tests/engine.test.js` passing)
- [x] **Phase 4: Framing Algorithms & Interactive Visualizer** (`bitStuffing.js`, `byteStuffing.js` with RFC 1662 & generic modes, `charCount.js`, `FramingView.jsx`, and 34 unit tests in `src/tests/framing.test.js` passing)
- [x] **Phase 5: Error Control Algorithms & Step-by-Step CRC Visualizer** (`crc.js` with educational modulo-2 division and named variants CRC-8/SMBUS & CRC-16/CCITT-FALSE, `checksum.js` with RFC 1071 16-bit 1's complement, `parity.js` with 1D/2D parity and single-bit localization, `errorInjection.js`, `ErrorControlView.jsx`, and 36 unit tests in `src/tests/errorControl.test.js` passing; 94 tests total across suite)
- [x] **Phase 6: Flow Control, ARQ Protocols & Sliding Window Visualizer** (`FrameContract.js`, `sequenceMath.js`, `stopAndWait.js`, `goBackN.js`, `selectiveRepeat.js`, `FlowControlSimulator.js`, `FlowControlView.jsx`, and 32 unit tests in `src/tests/flowControl.test.js` passing; 126 tests total across suite)

---

## 5. Known Issues
- None. All framing algorithms, error-control algorithms, and flow-control ARQ protocols execute with 100% test pass rate (126/126 tests passing). Channel serialization timing ($T_t + 2T_p$) and theoretical utilization formulas audited and confirmed numerically equal. Vite production build completes cleanly.

---

## 6. Exact Next Step
- **Phase 7: Medium Access Control — CSMA/CD Simulation**
  - Implement shared bus model with spatial distance and propagation delay.
  - Implement 1-persistent / non-persistent carrier sense and collision detection within slot time ($2\tau$).
  - Implement Jam signal propagation and Truncated Binary Exponential Backoff (BEB).
  - Build interactive bus visualizer showing colliding wavefronts.
  - Build interactive `FlowControlView.jsx` with animated multi-lane channel, packet-in-flight transitions, and click-to-corrupt / click-to-drop controls.
