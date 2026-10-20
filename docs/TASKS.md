# TASKS.md — Project Task Tracker

## 1. Current Status Overview
- **Active Phase:** Phase 8 Complete (Awaiting User Sign-off to advance to Phase 9)
- **Current Task:** Verification of Phase 8 Integrated End-to-End Data Link Layer Transmission Lab
- **Next Task:** Phase 9 — Final Hardening, Edge-Case Audit & Presentation Package

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
- [x] **Task 4.1:** Implement pure Bit Stuffing and Destuffing algorithms (`01111110` flag, zero-insertion after five `1`s, trace generation, abort sequence detection).
- [x] **Task 4.2:** Implement Byte Stuffing and Unstuffing (RFC 1662 section 4.2 PPP octet stuffing standard `0x7E -> [0x7D, 0x5E]` and `0x7D -> [0x7D, 0x5D]`, plus Generic Educational Escape mode).
- [x] **Task 4.3:** Implement Character-Count framing with total length header, multi-frame streaming, and desynchronization simulation.
- [x] **Task 4.4:** Write Vitest unit tests in `src/tests/framing.test.js` (34 tests covering boundary conditions, raw flag payloads, RFC 1662 escaping, and error states).
- [x] **Task 4.5:** Build interactive `FramingView.jsx` with pipeline visualization, live bit/byte rendering, presets, error injection, convention toggle, and Viva Helper panel.
- [x] **Task 4.6:** Technical audit verification of byte stuffing standards (RFC 1662 Sec 4.2 transparent $0\text{x}20$ decoding, abort sequences `0x7D 0x7E`, strict minimum escape option, and raw flag collision protection; 34 framing tests passing).
- [x] **Task 5.1:** Implement Modulo-2 polynomial division with full intermediate XOR traces (`src/core/error-control/crc.js`).
- [x] **Task 5.2:** Implement standard named CRC variants (`CRC-8/SMBUS` check `0xF4`, `CRC-16/CCITT-FALSE` check `0x29B1`) with per-bit register update traces.
- [x] **Task 5.3:** Implement 16-bit Internet Checksum (RFC 1071 with odd zero-pad, end-around carry folding, receiver sum $0\text{xFFFF}$) (`src/core/error-control/checksum.js`).
- [x] **Task 5.4:** Implement 1D even/odd parity and 2D matrix parity with single-bit error localization and multi-bit evasion demonstration (`src/core/error-control/parity.js`).
- [x] **Task 5.5:** Implement deterministic controlled error injection (`src/core/error-control/errorInjection.js`) and enhance `Channel.js` with burst and field corruption.
- [x] **Task 5.6:** Write comprehensive Vitest unit tests in `src/tests/errorControl.test.js` (36 tests covering known vectors, bursts, 2-bit evasion, and UI component rendering; 94 tests passing across suite).
- [x] **Task 5.7:** Build interactive `ErrorControlView.jsx` with step-by-step long division table, register shift log, interactive 2D grid cell toggling, error injection controls, and Viva Helper panel (resolved LaTeX math `{-(R-1)}` JSX ReferenceError).
- [x] **Task 6.1:** Implement reusable `FrameContract.js` with plain serializable frame objects, compact/extended header serialization, and wire byte extraction.
- [x] **Task 6.2:** Implement `sequenceMath.js` with positive modulo, circular forward distance, window membership tests, and theoretical window size bounds.
- [x] **Task 6.3:** Implement Stop-and-Wait ARQ state machine with 1-bit sequence alternating, timeouts, ACK handling, and duplicate detection (`stopAndWait.js`).
- [x] **Task 6.4:** Implement Go-Back-N ARQ state machine with sliding window $W_s \le 2^m - 1$, cumulative ACKs, single timer for oldest frame, full window retransmission, and out-of-order discard (`goBackN.js`).
- [x] **Task 6.5:** Implement Selective Repeat ARQ state machine with window constraints $W_s \le 2^{m-1}, W_r \le 2^{m-1}$, independent frame timers, selective ACKs, receiver out-of-order buffering, selective retransmissions, and previous-window re-acknowledgement (`selectiveRepeat.js`).
- [x] **Task 6.6:** Implement `FlowControlSimulator.js` facade coordinating SimulationEngine, duplex channels, protocol instances, interactive in-flight frame drop/corrupt, trace logs, and theoretical metric calculations.
- [x] **Task 6.7:** Write comprehensive Vitest unit tests in `src/tests/flowControl.test.js` (32 tests covering sequence math, lost frames, lost ACKs, timeouts, duplicate handling, selective buffering, worked timing cycle, and interactive controls; 126 tests passing across suite).
- [x] **Task 6.8:** Build rich interactive `FlowControlView.jsx` with multi-lane animation track, click-to-corrupt / click-to-drop controls, sliding window slot visualizer with timer indicators, live event log, telemetry row, and Viva Helper panel.
- [x] **Task 6.9:** Perform Phase 6 Technical Audit: audit channel serialization timing ($T_t + 2T_p$), verify theoretical utilization formulas against discrete-event clock, confirm SSR rendering across all modules, and probe Vite dev server.
- [x] **Task 6.10:** Perform Final Metric Semantics Audit: rigorously separate Channel Utilization ($U_{\text{channel}}$), Transmission Success Ratio ($S_{\text{tx}}$), Useful Utilization ($U_{\text{useful}}$), and Goodput ($G$); implement transmitter busy tracking in `Channel.js`; update UI metrics & Viva Q5 in `FlowControlView.jsx`; add deterministic regression tests for clean transmission, lost DATA retransmission, and lost ACK duplicate suppression (129 tests passing across suite).
- [x] **Task 7.1:** Implement `src/core/mac/SharedBus.js` multi-station spatial linear broadcast medium with bilateral propagation delays, local carrier sensing, and active wavefront tracking.
- [x] **Task 7.2:** Implement `src/core/mac/backoff.js` IEEE 802.3 Truncated Binary Exponential Backoff with exponent cap $k \le 10$, slot range calculation, retry limit (16 attempts), and deterministic test hooks.
- [x] **Task 7.3:** Implement `src/core/mac/csmaCd.js` 1-persistent and non-persistent station state machine with concurrent carrier sensing, collision detection, immediate abortion, 32-bit jam signal emission, and backoff timer management.
- [x] **Task 7.4:** Implement `src/core/mac/CsmaCdSimulator.js` facade coordinating 4 stations (A, B, C, D), spatial bus, 6 educational presets, and real-time telemetry metrics.
- [x] **Task 7.5:** Write comprehensive Vitest unit tests in `src/tests/mac.test.js` (17 tests covering delay math, carrier sensing, collisions, jam signals, BEB calculations, max retry limits, contention resolution, and UI SSR smoke tests; 146 tests passing across suite).
- [x] **Task 7.6:** Build interactive `MacView.jsx` visualizer with physical bus rail, animated propagating wavefronts, collision markers, station status cards, preset buttons, manual frame injector, live event log terminal, and 6-question CSMA/CD Viva Helper panel.
- [x] **Task 7.7:** Perform Phase 7 Standards Audit: enforce exact IEEE 802.3 `attemptLimit = 16` (1 initial + 15 retries), resolve attempt 17 off-by-one execution flaw, verify BEB exponent progression ($k=1 \implies [0, 1]$, $k=2 \implies [0, 3]$, $k=10 \implies [0, 1023]$), and add deterministic regression tests for 16-attempt discard and 16th-attempt delivery (148 tests passing across suite).
- [x] **Task 8.1:** Design integrated multi-layer pipeline architecture connecting Upper-Layer Segmentation, Header Serialization, FCS Error-Control, Framing Transparency, and ARQ/MAC protocol dispatch (`TransmissionLabCoordinator.js`).
- [x] **Task 8.2:** Implement Profile A (Point-to-Point ARQ: Stop-and-Wait, Go-Back-N, Selective Repeat over duplex channels with Drop, Corrupt, Delay fault injection) and Profile B (Shared-Medium Ethernet with CSMA/CD, collision detection, 32-bit jam, and Truncated BEB).
- [x] **Task 8.3:** Build rich interactive `TransmissionLabView.jsx` visualizer with profile switcher, preset loader, 8-stage lifecycle breadcrumb stepper, byte-by-byte color-coded frame inspector, live event log, telemetry counters, and comprehensive 6-question Viva Helper panel.
- [x] **Task 8.4:** Write comprehensive Vitest integration tests in `src/tests/transmissionLab.test.js` (20 tests covering segmentation, algorithm interoperability, clean transmission, bit corruption recovery, frame loss timeout, duplicate suppression, multi-frame windowing, CSMA/CD contention, and SSR rendering; 168 tests total passing across repository).

---

## 3. Pending Tasks (Roadmap)

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
