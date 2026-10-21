# Interactive Data Link Layer Protocol Simulator

[![Vite Build](https://img.shields.io/badge/vite-v6.4.4-646CFF?logo=vite)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/react-v19.0.0-61DAFB?logo=react)](https://react.dev/)
[![Vitest](https://img.shields.io/badge/vitest-171%20passing-FCC72B?logo=vitest)](https://vitest.dev/)
[![License: Academic](https://img.shields.io/badge/license-Academic-blue.svg)](#)

> **Computer Networks Innovative Assignment — Semester V**  
> A high-fidelity, deterministic, discrete-event educational simulator and interactive visualizer demonstrating fundamental Data Link Layer (Layer 2) operations: Framing, Error Detection, Flow Control (ARQ), Medium Access Control (CSMA/CD), and an integrated End-to-End Transmission Pipeline.

---

## 1. Project Overview

The **Interactive Data Link Layer Protocol Simulator** provides computer networking students and university examiners with an authentic, mathematically sound visual environment for exploring Layer-2 protocols. Unlike superficial animation tools, this simulator is built on a **deterministic discrete-event scheduling engine** (`SimulationEngine`) operating on virtual ticks. Every timer, propagation delay, frame serialization, collision wavefront, and retransmission is governed by pure state machines.

The application delivers **two complementary learning experiences**:
1. **Learning Playground:** Dedicated standalone visualizers for isolated exploration of Framing algorithms, Error Control polynomials, Sliding Window ARQ protocols, and CSMA/CD Ethernet bus contention.
2. **End-to-End Transmission Lab:** A flagship integrated mode where an upper-layer payload traverses an authentic 8-stage physical transmission pipeline from sender segmentation, through channel propagation and fault injection, to receiver deframing, FCS verification, and upper-layer delivery.

---

## 2. Key Capabilities & Module Directory

### 📦 1. Framing Simulator (`/framing`)
- **HDLC Bit Stuffing:** Flag sequence `01111110` (0x7E), automatic zero-insertion after five consecutive `1`s, transparent bitstream destuffing, and abort sequence detection ($>6$ consecutive `1`s).
- **Byte / Octet Stuffing:**
  - **RFC 1662 PPP Mode (Default):** Escapes `0x7E` $\to$ `[0x7D, 0x5E]` and `0x7D` $\to$ `[0x7D, 0x5D]`. Receiver strips `0x7D` and inverts bit 5 (`^ 0x20`). Detects RFC 1662 abort sequences (`0x7D 0x7E`).
  - **Generic Escape Mode:** Standard Tanenbaum character escaping (`[0x7D, 0x7E]`, `[0x7D, 0x7D]`).
- **Character Count Framing:** 1-byte total frame length prefix, multi-frame streaming, and live demonstration of the **cascading desynchronization problem** when a length header is corrupted.

### 🛡️ 2. Error Detection & CRC Visualizer (`/error-control`)
- **Modulo-2 Polynomial Division:** Step-by-step bitwise XOR division table, zero-padding of generator degree $k$, codeword generation, and remainder evaluation.
- **Standard Parameterized CRC Variants:**
  - **CRC-8/SMBus:** Generator polynomial $x^8 + x^2 + x + 1$ (`0x07`), check value `0xF4` for ASCII `"123456789"`.
  - **CRC-16/CCITT-FALSE:** Generator $x^{16} + x^{12} + x^5 + 1$ (`0x1021`), initial `0xFFFF`, check value `0x29B1` for `"123456789"`.
- **16-bit Internet Checksum (RFC 1071):** Big-endian 16-bit word grouping, odd-byte zero-padding, end-around carry folding, bitwise inversion, and receiver verification ($0\text{xFFFF}$).
- **1D & 2D Parity Matrix:** Even/odd parity computation, interactive 2D grid cell toggling, single-bit coordinate localization, and multi-bit evasion demonstration.

### 🔄 3. Flow Control & ARQ Protocols (`/flow-control`)
- **Stop-and-Wait ARQ:** 1-bit sequence space ($m=1, M=2, W_s=1, W_r=1$), forward DATA transmission, reverse ACK reception, single timer, and duplicate suppression.
- **Go-Back-N ARQ:** Pipelined window transmission ($W_s \le 2^m - 1$), strictly in-order receiver ($W_r=1$), cumulative acknowledgements, single timer for oldest unacknowledged frame, and full-window retransmission on timeout.
- **Selective Repeat ARQ:** Constrained sliding windows ($W_s \le 2^{m-1}, W_r \le 2^{m-1}$), independent retransmission timers per frame, selective ACKs, receiver out-of-order buffering, and selective retransmission of only lost frames.
- **Standardized Performance Metrics:** Channel Utilization ($U_{\text{channel}}$), Transmission Success Ratio ($S_{\text{tx}}$), Useful Utilization ($U_{\text{useful}}$), and Goodput ($G$).

### 📡 4. CSMA/CD Bus Contention (`/mac`)
- **Spatial Broadcast Bus:** Linear multi-drop topology (Stations A, B, C, D) with bilateral signal propagation ($c = 200\,\text{m/\mu s}$, $\tau = 10\,\text{ticks}$, slot time $2\tau = 20\,\text{ticks}$).
- **1-Persistent Carrier Sensing:** Continuous local medium monitoring before transmission.
- **Collision Detection & Jamming:** Real-time detection of overlapping wavefronts at local station tap, immediate transmission abortion, and 32-bit jam sequence emission.
- **IEEE 802.3 Truncated Binary Exponential Backoff:** Exponent progression $k = \min(c, 10)$, random slot selection $r \in [0, 2^k - 1]$, and exact attempt limit enforcement ($A_{\max} = 16$ attempts $\to$ `EXCESSIVE_COLLISIONS` abort).

### 🔬 5. Integrated End-to-End Transmission Lab (`/transmission-lab`)
- **Flagship 8-Stage Transmission Lifecycle:**
  1. *Upper-Layer Payload & Segmentation*
  2. *Frame Header Assembly* (Seq, Ack, Type)
  3. *Error Detection Encoding* (CRC-16, CRC-8, Checksum, Parity)
  4. *Framing & Transparency* (Bit/Byte Stuffing, Char Count)
  5. *Physical Channel & Fault Injection* (Pass, Drop, Corrupt, Delay)
  6. *Physical Medium Reception*
  7. *Physical Deframing & Genuine FCS Recomputation*
  8. *Upper-Layer Delivery / ARQ State Advancement*
- **Two Architecture Profiles:**
  - **Profile A (Point-to-Point ARQ):** Full sliding-window flow control over duplex channels with interactive fault injection.
  - **Profile B (Shared-Medium Ethernet):** 4-station CSMA/CD bus with physical contention, collision detection, and delivery without sliding-window ARQ.
- **Deep Frame Inspector:** Color-coded byte breakdown (Flag: cyan, Header: purple, Payload: green, FCS: amber).

---

## 3. Technology Stack & Design Principles

| Layer | Technology / Implementation | Rationale |
| :--- | :--- | :--- |
| **Language** | Modern JavaScript (ES2022+ Modules) | Native bitwise operators, typed arrays (`Uint8Array`), zero transpilation bloat. |
| **Framework** | React 19 + Vite 6 | Fast HMR, pure declarative UI components, predictable rendering. |
| **CSS Architecture** | Pure Modular CSS (Zero UI Frameworks) | No Tailwind, MUI, or Bootstrap; clean custom CSS variables for complete transparency during examination. |
| **Test Runner** | Vitest v3.2.7 | Instant unit testing, strict mathematical vector assertions, and SSR component smoke tests. |
| **Package Manager** | pnpm | Fast, deterministic, space-efficient dependency management. |

### Strict Decoupling Philosophy
```text
src/
├── core/                  # 100% Pure JavaScript (Zero UI / DOM imports)
│   ├── engine/            # EventQueue, SimulationEngine, Channel
│   ├── framing/           # bitStuffing, byteStuffing, charCount
│   ├── error-control/     # crc, checksum, parity, errorInjection
│   ├── flow-control/      # stopAndWait, goBackN, selectiveRepeat, sequenceMath
│   ├── mac/               # SharedBus, backoff, csmaCd, CsmaCdSimulator
│   ├── frame/             # FrameContract (serialization/deserialization)
│   └── transmission/      # TransmissionLabCoordinator (8-stage pipeline orchestrator)
├── ui/                    # Pure React Presentation Layer
│   ├── modules/           # FramingView, ErrorControlView, FlowControlView, MacView, TransmissionLabView
│   └── App.jsx            # Multi-tab application shell
└── tests/                 # Vitest algorithmic and integration test suites
```

---

## 4. Quick Start & Setup

### Prerequisites
- **Node.js:** v18.0.0 or higher
- **pnpm:** v9.0.0 or higher (recommended) or npm / yarn

### Installation
```bash
# Clone or navigate to the project directory
cd "c:/Users/lenovo/OneDrive/Desktop/College Innovative Assignments/SEM V/CN"

# Install dependencies cleanly
pnpm install
```

### Running the Application
```bash
# Start Vite development server
pnpm run dev

# Open your browser at:
# http://localhost:5173/
```

### Running the Test Suite
```bash
# Run all 171 automated tests across 7 test suites
pnpm test -- --run

# Run tests in interactive watch mode
pnpm run test:watch
```

### Building for Production
```bash
# Compile and bundle production assets
pnpm run build

# Preview production build locally
pnpm run preview
```

---

## 5. Verification & Test Metrics

As of **Phase 9 Final Hardening (Commit `d5e203c`)**:
- **Vitest Test Suite:** **171 passed** (7 test suites, 0 failed, 0 skipped) in ~2.4s.
- **Production Build:** Vite bundle built in ~3.4s (`dist/assets/index-*.js`: 132 kB gzipped).
- **Dev Server:** Validated at `http://localhost:5173/` (`HTTP 200 OK`).

| Test Suite File | Test Count | Focus Areas Verified |
| :--- | :---: | :--- |
| `src/tests/sanity.test.js` | 2 | Test runner environment sanity and XOR truth table. |
| `src/tests/engine.test.js` | 22 | Priority event queue, tick ordering, timer cancellation, and channel fault injection. |
| `src/tests/framing.test.js` | 34 | HDLC bit stuffing, RFC 1662 PPP byte stuffing, character count, and abort sequences. |
| `src/tests/errorControl.test.js` | 36 | Modulo-2 division, SMBus/CCITT CRC vectors, RFC 1071 checksum, and 2D parity matrix. |
| `src/tests/flowControl.test.js` | 35 | Stop-and-Wait, Go-Back-N, Selective Repeat, sequence math, and utilization metrics. |
| `src/tests/mac.test.js` | 19 | Bilateral propagation, CSMA/CD contention, $2\tau$ collision detection, jam signal, and BEB attempt limit 16. |
| `src/tests/transmissionLab.test.js` | 23 | Integrated 8-stage pipeline, Profile A ARQ, Profile B Ethernet, genuine deframing, and SSR rendering. |
| **Total** | **171** | **100% Green** |

---

## 6. Comprehensive Documentation Index

- [**docs/ARCHITECTURE.md**](docs/ARCHITECTURE.md): Full architectural specification, state machines, packet formats, 8-stage pipeline, and Profile A vs Profile B separation.
- [**docs/DEMO_GUIDE.md**](docs/DEMO_GUIDE.md): Reproducible step-by-step viva presentation guide with exact inputs, presets, and expected metrics.
- [**docs/VIVA_GUIDE.md**](docs/VIVA_GUIDE.md): University examination defense cheat sheet containing 20+ detailed viva questions, formulas, and protocol trade-offs.
- [**docs/FINAL_AUDIT.md**](docs/FINAL_AUDIT.md): Complete technical audit report, automated verification logs, known educational limitations, and manual browser test checklist.
- [**docs/TESTING.md**](docs/TESTING.md): Cumulative test execution log across all implementation phases.
- [**docs/PROJECT_CONTEXT.md**](docs/PROJECT_CONTEXT.md): Academic scope, design assumptions, and standard references.

---

## 7. Educational & Simulation Assumptions Disclaimer

This project is an educational discrete-event simulator engineered for academic study:
1. **Virtual Time:** All delays, timeouts, and propagation times use discrete virtual ticks ($1\,\text{tick} = 10\,\mu\text{s}$ or normalized unit), eliminating unpredictable wall-clock race conditions.
2. **Channel Model:** Channels simulate bit corruption and frame drops deterministically via configurable fault plans rather than analog radio or copper noise.
3. **Layer Scope:** The simulator models Layer 2 (Data Link Layer framing, error control, flow control, and medium access) and does not implement upper transport layers (TCP/IP) or physical wire signaling voltages.

---

## 8. Authors & Academic Credit

- **Student:** CodeCrafter1319
- **Course:** Computer Networks (Semester V)
- **Institution:** Department of Computer Science & Engineering
