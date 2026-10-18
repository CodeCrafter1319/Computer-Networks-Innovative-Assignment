# TASKS.md — Project Task Tracker

## 1. Current Status Overview
- **Active Phase:** Phase 3 Complete (Awaiting User Sign-off to advance to Phase 4)
- **Current Task:** Verification of Discrete-Event Simulation Engine Core & Deterministic Channel
- **Next Task:** Phase 4 — Framing Algorithms & UI Visualizer

---

## 2. Completed Tasks
- [x] **Task 1.1:** Inspect workspace directory (`CN`) and report initial environment state.
- [x] **Task 1.2:** Produce Phase 1 Comprehensive Architectural Design & Implementation Roadmap.
- [x] **Task 1.3:** Gather user decisions, approve technology stack (pnpm, React, Vite, Vitest, Pure CSS).
- [x] **Task 2.1:** Initialize Git repository and write `.gitignore`.
- [x] **Task 2.2:** Configure `package.json` with React, Vite, Vitest, and clean execution scripts.
- [x] **Task 2.3:** Install dependencies using pnpm and resolve build approval requirements.
- [x] **Task 2.4:** Configure `vite.config.js` with React and Vitest support.
- [x] **Task 2.5:** Establish clean UI entry point (`index.html`, `src/main.jsx`, `src/ui/App.jsx`, `src/styles/index.css`).
- [x] **Task 2.6:** Set up initial Vitest test suite (`src/tests/sanity.test.js`) and verify test pipeline.
- [x] **Task 2.7:** Initialize living documentation (`docs/PROJECT_CONTEXT.md`, `docs/TASKS.md`, `docs/TESTING.md`).
- [x] **Task 3.1:** Implement `src/core/engine/EventQueue.js` (tick-ordered min-priority queue with binary-search insertion).
- [x] **Task 3.2:** Implement `src/core/engine/SimulationEngine.js` (virtual clock, tick stepping, scheduling, timer cancellation, pause/resume/reset).
- [x] **Task 3.3:** Implement `src/core/engine/Channel.js` (non-mutating frame transmission, propagation delay, fault injection: drop, corrupt, delay).
- [x] **Task 3.4:** Write Vitest unit tests in `src/tests/engine.test.js` (22 tests covering ordering, timer cancel, step execution, immutability, and faults).

---

## 3. Pending Tasks (Roadmap)

### Phase 4: Framing Implementation & Visualizer
- [ ] **Task 4.1:** Implement pure Bit Stuffing and Destuffing algorithms (`01111110` flag, zero-insertion after five `1`s).
- [ ] **Task 4.2:** Implement Byte Stuffing (character escaping with `ESC` and `FLAG`).
- [ ] **Task 4.3:** Implement Character Count framing with desynchronization edge-case demo.
- [ ] **Task 4.4:** Write unit tests covering boundary and payload-flag collision edge cases.
- [ ] **Task 4.5:** Build interactive Framing UI View with bit-level visual breakdown.

### Phase 5: Error Control & Modulo-2 Division Visualizer
- [ ] **Task 5.1:** Implement Modulo-2 polynomial division with full intermediate XOR traces.
- [ ] **Task 5.2:** Implement standard CRC generators (CRC-8, CRC-16-CCITT).
- [ ] **Task 5.3:** Implement Internet Checksum (16-bit 1's complement sum) and Simple/2D Parity.
- [ ] **Task 5.4:** Write unit tests for CRC against known textbook vectors and burst-error detection.
- [ ] **Task 5.5:** Build interactive CRC Division Step-by-Step UI and Channel Fault Injector.

### Phase 6: Flow Control — ARQ Protocols & Sliding Window Visualizer
- [ ] **Task 6.1:** Implement Stop-and-Wait ARQ state machine with sequence bit ($0/1$), ACK, timeout, and duplicate detection.
- [ ] **Task 6.2:** Implement Go-Back-N ARQ state machine with cumulative ACKs and sliding window $[S_f, S_n)$.
- [ ] **Task 6.3:** Implement Selective Repeat ARQ state machine with receiver buffer and individual timer tracking.
- [ ] **Task 6.4:** Write unit tests simulating packet loss, ACK loss, delayed ACK, and window wraparound.
- [ ] **Task 6.5:** Build animated multi-lane channel UI with interactive packet click-to-corrupt / click-to-drop.

### Phase 7: Medium Access Control — CSMA/CD Simulation
- [ ] **Task 7.1:** Implement multi-station shared bus model with spatial propagation delay.
- [ ] **Task 7.2:** Implement Carrier Sense (1-persistent / non-persistent) and collision detection within slot time ($2\tau$).
- [ ] **Task 7.3:** Implement Jam signal propagation and Truncated Binary Exponential Backoff (BEB).
- [ ] **Task 7.4:** Write unit tests for contention resolution and collision detection.
- [ ] **Task 7.5:** Build bus visualization showing transmission wavefronts and collision points.

### Phase 8: Telemetry, Protocol Comparison & Viva Helper
- [ ] **Task 8.1:** Build real-time event-driven telemetry dashboard (throughput, loss rate, link efficiency).
- [ ] **Task 8.2:** Implement side-by-side protocol comparison mode (GBN vs. SR under variable error rate).
- [ ] **Task 8.3:** Create Viva Helper / Theory drawer with formulas, protocol limitations, and examiner Q&A.

### Phase 9: Final Hardening, Edge-Case Audit & Presentation Package
- [ ] **Task 9.1:** End-to-end regression testing and cross-browser visual verification.
- [ ] **Task 9.2:** Project report, README, and viva defense cheat sheet.

---

## 4. Phase 2 Acceptance Criteria (Verified)
- [x] Clean Git repository initialized.
- [x] `pnpm install` completes without warnings or unapproved build scripts.
- [x] Vitest runs and executes unit test suites cleanly.
- [x] Vite build completes without errors.
- [x] Tracking documentation (`PROJECT_CONTEXT.md`, `TASKS.md`, `TESTING.md`) created and aligned.
