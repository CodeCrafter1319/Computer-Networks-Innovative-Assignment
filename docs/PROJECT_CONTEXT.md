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
4. **CRC Calculation:** Modulo-2 polynomial division is implemented bit-by-bit to expose full step-by-step traces for examiner review.
5. **No External UI Frameworks:** Avoided Tailwind / MUI to keep the codebase transparent, lightweight, and straightforward to explain during evaluation.

---

## 4. Completed Modules
- [x] **Phase 1: Project Planning & Requirements Analysis** (Approved)
- [x] **Phase 2: Project Foundation, Git Setup & Tracking Documentation** (Vite + React + Vitest initialized, `.gitignore` created, test runner operational)
- [x] **Phase 3: Discrete-Event Simulation Engine Core** (`EventQueue.js`, `SimulationEngine.js`, `Channel.js`, and comprehensive unit tests in `src/tests/engine.test.js` passing)

---

## 5. Known Issues
- None. Discrete-event scheduling, virtual clock progression, event cancellation, and deterministic channel fault injection pass all unit tests without wall-clock dependencies.

---

## 6. Exact Next Step
- **Phase 4: Framing Algorithms & UI Visualizer**
  - Implement `src/core/framing/bitStuffing.js` (Flag `01111110`, zero-insertion after five consecutive `1`s, destuffing recovery).
  - Implement `src/core/framing/byteStuffing.js` (Byte/character stuffing with `FLAG` and `ESC` escape characters).
  - Implement `src/core/framing/charCount.js` (Character-count length framing + framing error desynchronization scenario).
  - Create `src/tests/framing.test.js` with comprehensive edge cases (consecutive flags, payload flag collision, escape escaping escape).
  - Build interactive `FramingView.jsx` with bit-by-bit visual inspector.
