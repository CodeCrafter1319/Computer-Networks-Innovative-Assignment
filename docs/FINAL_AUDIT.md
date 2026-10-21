# FINAL_AUDIT.md — Phase 9 Final Acceptance Audit & Verification Log

> **Project:** Interactive Data Link Layer Protocol Simulator  
> **Course:** Computer Networks (Semester V)  
> **Audit Date:** 2026-10-21  
> **Audit Status:** **PASSED & APPROVED FOR SUBMISSION**  
> **Git Checkpoint:** `d5e203c` $\to$ Phase 9 Completion

---

## 1. Audit Executive Summary & Sign-Off Status

This document records the final technical hardening audit of the **Interactive Data Link Layer Protocol Simulator**. The application has been systematically evaluated across its algorithmic correctness, mathematical integrity, discrete-event timing semantics, production build footprint, automated regression suites, and manual verification procedures.

| Audit Category | Evaluation Standard | Audit Finding | Status |
| :--- | :--- | :--- | :--- |
| **Layer-2 Framing** | HDLC Bit Stuffing, RFC 1662 PPP Byte Stuffing, Tanenbaum Character Count | Bit/byte destuffing correctly restores original stream; abort sequence `0x7D 0x7E` and 7 consecutive `1`s trigger explicit frame aborts. | **PASSED** |
| **Error Control** | Modulo-2 CRC, Named Variants (SMBus/CCITT), RFC 1071 Checksum, 1D/2D Parity | Intact frames evaluate to zero remainder or `0xFFFF`; single-bit errors localize in 2D parity; corrupt frames fail receiver integrity check. | **PASSED** |
| **Flow Control & ARQ** | Stop-and-Wait, Go-Back-N, Selective Repeat | $W_s \le 2^m - 1$ and $W_s + W_r \le 2^m$ bounds enforced; single-frame vs full-window retransmission verified; duplicate ACKs and lost ACKs handled correctly. | **PASSED** |
| **Medium Access Control** | CSMA/CD, 1-Persistent Sensing, $2\tau$ Collision Detection, 32-bit Jam, Truncated BEB | Overlapping wavefronts detected at tap; immediate abort + 32-bit jam emitted; BEB exponent capped at $k=10$; frame discarded at attempt limit 16. | **PASSED** |
| **Transmission Lab** | 8-Stage Lifecycle, Profile A (Point-to-Point ARQ) & Profile B (Shared Ethernet) | Fully connected pipeline; genuine deframing and FCS recomputation; zero sliding-window ARQ invocation in Profile B; clean reset isolation. | **PASSED** |
| **Automated Tests** | 100% Pass Rate across all suites (Vitest v3.2.7) | **171 tests passed, 0 failed, 0 skipped** across 7 test suites. | **PASSED** |
| **Production Build** | Vite v6.4.4 production bundling | Zero build errors or warnings; bundle footprint: 132 kB gzipped. | **PASSED** |
| **Dev Server Probe** | `pnpm run dev --port 5173` | Responded `HTTP 200 OK` with full initial asset loading. | **PASSED** |
| **Manual Browser Tests** | Cross-tab navigation and interactive controls | Comprehensive manual smoke-test checklist documented below for user execution. | **CHECKLIST READY** |

---

## 2. Component-by-Component Technical Verification

### 1. Framing and Error Control Integrity
- **HDLC Bit Stuffing (`bitStuffing.js`):**
  - Transmitter inserts a `0` bit immediately after five consecutive `1`s.
  - Receiver destuffing restores original payload bit-for-bit.
  - Frame opening and closing flags (`01111110`) validated; detection of 7 consecutive `1`s or unescaped delimiter flags inside the body triggers an immediate framing abort error.
- **RFC 1662 PPP Byte Stuffing (`byteStuffing.js`):**
  - Transmitter escapes `0x7E` $\to$ `[0x7D, 0x5E]` and `0x7D` $\to$ `[0x7D, 0x5D]`.
  - Receiver strips `0x7D` and inverts bit 5 (`^ 0x20`), supporting arbitrary escaped octets.
  - Sequence `[0x7D, 0x7E]` correctly triggers RFC 1662 frame abort.
- **Character Count (`charCount.js`):**
  - Length header prepended to payload; multi-frame streaming validated.
  - Truncated streams or invalid header lengths ($< 1$) safely handled.
- **Error Control (`crc.js`, `checksum.js`, `parity.js`):**
  - Educational Modulo-2 division exposes full XOR long division trace.
  - Parameterized named variants verified: `CRC-8/SMBUS` check value `0xF4`, `CRC-16/CCITT-FALSE` check value `0x29B1` on `"123456789"`.
  - RFC 1071 Checksum verifies odd zero-padding, end-around carry folding, and receiver check sum `0xFFFF`.
  - 2D Parity matrix confirms exact single-bit coordinate localization $(x, y)$ and 2-bit error evasion detection.

### 2. Flow Control & Sliding Window ARQ
- **Sequence Arithmetic (`sequenceMath.js`):**
  - Modulo arithmetic strictly circular: positive remainder `((val % M) + M) % M`.
  - Window membership `isWithinWindow(seq, base, windowSize, M)` mathematically verified.
  - Window bounds enforced: GBN $W_s \le 2^m - 1$; SR $W_s \le 2^{m-1}, W_r \le 2^{m-1}$.
- **Stop-and-Wait ARQ (`stopAndWait.js`):**
  - 1-bit sequence number space ($m=1$).
  - Clean transmission, forward frame drop recovery, corrupt frame rejection, lost ACK duplicate suppression, and timer cancellation verified.
- **Go-Back-N ARQ (`goBackN.js`):**
  - Pipelined transmission of up to $W_s$ frames.
  - Cumulative acknowledgements advance sender base $S_f$.
  - Receiver window $W_r = 1$: strictly out-of-order rejection.
  - Timeout of oldest unacknowledged frame triggers retransmission of the entire outstanding window.
- **Selective Repeat ARQ (`selectiveRepeat.js`):**
  - Independent timers per frame.
  - Receiver out-of-order buffer accepts frames within $[R_f, R_f + W_r)$.
  - Selective retransmission of *only* the dropped/timed-out frame.
  - In-order reassembly and delivery to upper layer once base frame arrives.

### 3. Medium Access Control (CSMA/CD)
- **Physical Shared Medium (`SharedBus.js`):**
  - Spatial linear bus with 4 taps: Station A ($0\,\text{m}$), Station B ($100\,\text{m}$), Station C ($200\,\text{m}$), Station D ($300\,\text{m}$).
  - Bilateral signal propagation with physical velocity $c = 200\,\text{m/\mu s}$, one-way propagation delay $\tau = 10\,\text{ticks}$, and round-trip slot time $2\tau = 20\,\text{ticks}$.
- **Station Protocol Machine (`csmaCd.js`):**
  - 1-persistent local carrier sensing.
  - Collision detection during active transmission; immediate abort and 32-bit jam signal (4 ticks) emission.
  - Truncated Binary Exponential Backoff: $k = \min(c, 10)$, slot range $r \in [0, 2^k - 1]$.
  - Exact attempt limit: Station aborts with `EXCESSIVE_COLLISIONS` after 16 total transmission attempts (1 initial + 15 retries) and never schedules attempt 17.
- **Contention Resolution (`CsmaCdSimulator.js`):**
  - Preset contention scenarios resolve deterministically.

### 4. End-to-End Transmission Lab (`TransmissionLabCoordinator.js`)
- **8-Stage Lifecycle Verification:**
  - Stage 1: Upper-layer payload chunked into segments.
  - Stage 2: Header assigned with valid sequence numbers and frame type.
  - Stage 3: FCS calculated across header and payload bytes.
  - Stage 4: Delimiter flags and stuffing applied.
  - Stage 5: Channel transmission with deterministic fault injection (Pass, Drop, Corrupt, Delay).
  - Stage 6: Physical channel arrival recorded.
  - Stage 7: Genuine deframing and wire field extraction; receiver recomputes FCS directly over extracted wire bytes.
  - Stage 8: In-sequence delivery to upper layer; ACK emitted; sliding window advanced.
- **Strict Profile Separation:**
  - Profile A executes sliding window ARQ over duplex point-to-point channels.
  - Profile B executes CSMA/CD on shared bus; verifies `this.protocolInstance === null` (zero sliding window ARQ invocation).
- **Reset Cleanliness:**
  - `coordinator.reset()` completely purges event queue, resets virtual clock to 0, clears all frame history, and resets delivered payload lists. Zero state leakage across runs.

---

## 3. Automated Test Suite Execution Audit

```text
$ vitest run "--run"

 RUN  v3.2.7 C:/Users/lenovo/OneDrive/Desktop/College Innovative Assignments/SEM V/CN

 ✓ src/tests/sanity.test.js (2 tests) 5ms
 ✓ src/tests/engine.test.js (22 tests) 24ms
 ✓ src/tests/framing.test.js (34 tests) 34ms
 ✓ src/tests/errorControl.test.js (36 tests) 92ms
 ✓ src/tests/mac.test.js (19 tests) 85ms
 ✓ src/tests/transmissionLab.test.js (23 tests) 183ms
 ✓ src/tests/flowControl.test.js (35 tests) 132ms

 Test Files  7 passed (7)
      Tests  171 passed (171)
   Duration  2.44s
```

### Detailed Breakdown
| Test Suite File | Test Count | Key Scenarios Validated |
| :--- | :---: | :--- |
| `src/tests/sanity.test.js` | 2 | Test runner operation, Galois field XOR logic truth tables. |
| `src/tests/engine.test.js` | 22 | Priority queue chronological order, FIFO for simultaneous events, event cancellation by ID, clock advancement, Channel drop, corrupt, and delay faults. |
| `src/tests/framing.test.js` | 34 | Bit stuffing 5-one insertion, 7-one abort detection, RFC 1662 PPP 0x20 inversion, 0x7D 0x7E abort, Character count framing and length desynchronization. |
| `src/tests/errorControl.test.js` | 36 | Modulo-2 division trace, CRC-8/SMBus (0xF4), CRC-16/CCITT-FALSE (0x29B1), RFC 1071 Checksum (0xFFFF), 1D/2D parity matrix single-bit localization and 2-bit evasion. |
| `src/tests/flowControl.test.js` | 35 | Sequence math, Stop-and-Wait clean/drop/corrupt/duplicate handling, GBN cumulative ACKs, Selective Repeat out-of-order buffering and retransmission, utilization timing audit, SSR renders. |
| `src/tests/mac.test.js` | 19 | Bilateral propagation delay, CSMA/CD collision detection within $2\tau$, 32-bit jam signal emission, BEB slot calculation, attempt limit 16 abort, 16th-attempt delivery, SSR renders. |
| `src/tests/transmissionLab.test.js` | 23 | Payload segmentation, CRC-16+ByteStuffing, CRC-8+BitStuffing, Checksum+CharCount, Clean S&W, Corrupt recovery, Lost ACK duplicate suppression, GBN sliding window, SR buffering & selective retransmission, Profile B contention, Profile B attempt limit 16, Profile B delivery without ARQ, Reset cleanup, SSR renders. |

---

## 4. Production Build & Server Probe Audit

### Vite 6 Production Bundle
```text
$ vite build
vite v6.4.4 building for production...
transforming...
✓ 55 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.59 kB │ gzip:   0.37 kB
dist/assets/index-BftaAQSH.css   12.26 kB │ gzip:   2.95 kB
dist/assets/index-CIHi46kH.js   488.56 kB │ gzip: 132.05 kB
✓ built in 3.72s
```
- **Zero build warnings or errors.**
- Single modular CSS stylesheet (12.26 kB raw, 2.95 kB gzipped).
- Single optimized JavaScript chunk (488.56 kB raw, 132.05 kB gzipped).

### Dev Server Probe
- Process started via `pnpm run dev --port 5173`.
- Probe request `Invoke-WebRequest -Uri "http://localhost:5173/" -UseBasicParsing` executed.
- Server returned `HTTP_STATUS: 200` with clean HTML document response.

---

## 5. Distinction: Automated Tests vs. Manual Browser Tests

> [!IMPORTANT]
> The automated test suite (171 tests in Vitest), component SSR rendering assertions, and PowerShell HTTP probes have been executed and confirmed green in this audit.
> **Actual interactive browser verification** (visual animation transitions, CSS hover states, and physical mouse click responses) cannot be executed via automated headless scripts in this environment and must be verified by the user using the following manual smoke-test checklist.

### Manual Smoke-Test Checklist for User Execution

#### 1. Navigation & Views
- [ ] Open `http://localhost:5173/` in Google Chrome, Microsoft Edge, or Mozilla Firefox.
- [ ] Verify that all 6 navigation buttons appear:
  - `End-to-End Transmission Lab`
  - `Framing Simulator`
  - `Error Control & CRC`
  - `Flow Control & ARQ`
  - `CSMA/CD Bus`
  - `Project Architecture & Overview`
- [ ] Click through each tab; verify zero blank screens and zero red errors in the browser console.

#### 2. End-to-End Transmission Lab
- [ ] **Clean Transmission:** Click **Preset 1 (Clean S&W)** $\to$ Click **Run All / Play** $\to$ Verify all 8 stages turn green, payload `"DATA"` appears in Delivered box, telemetry shows `Delivered: 1`, `Retransmissions: 0`.
- [ ] **Bit Corruption:** Click **Preset 2 (Bit Corruption)** $\to$ Click **Run All / Play** $\to$ Verify Stage 7 shows FCS mismatch error, sender times out at $t=12$, retransmission delivers cleanly, `Delivered: 1`, `Retransmissions: 1`.
- [ ] **Frame Drop:** Click **Preset 3 (Frame Loss)** $\to$ Click **Run All / Play** $\to$ Verify forward frame is dropped, sender times out, retransmission delivers cleanly.
- [ ] **Lost ACK:** Click **Preset 4 (Lost ACK)** $\to$ Click **Run All / Play** $\to$ Verify ACK is dropped, sender retransmits, receiver suppresses duplicate delivery (Delivered box contains 1 copy), re-ACK unblocks sender.
- [ ] **Profile B Contention:** Switch profile to **Profile B: Shared-Medium Ethernet** $\to$ Click **Preset 5 (CSMA/CD Contention)** $\to$ Click **Run All / Play** $\to$ Observe Station A and D collide, emit jam, back off, Station A retransmits cleanly, frame delivers to Station D without invoking ARQ.

#### 3. Standalone Learning Playgrounds
- [ ] **Framing Tab:** Select **Byte Stuffing** $\to$ Enter payload `0x7D 0x7E` $\to$ Confirm receiver flags RFC 1662 abort sequence.
- [ ] **Error Control Tab:** Select **Modulo-2 CRC** $\to$ Verify long division table displays bitwise XOR trace $\to$ Switch to **2D Parity Matrix** $\to$ Click a bit cell in the grid $\to$ Confirm $(x, y)$ coordinate is highlighted and corrected.
- [ ] **Flow Control Tab:** Select **Go-Back-N** ($W_s=4$) $\to$ Send 4 frames $\to$ Click **Drop** on frame 1 in transit $\to$ Observe receiver discard frames 2 and 3 as out-of-order $\to$ Observe sender retransmit frames 1, 2, 3.
- [ ] **CSMA/CD MAC Tab:** Click **Preset: Contention & Backoff** $\to$ Observe colored wavefronts traverse the spatial bus rail.

---

## 6. Honest Educational Limitations & Simulation Boundaries

To maintain academic rigor and transparency during evaluation:
1. **Discrete Virtual Ticks:** Time is modeled in integer virtual ticks ($1\,\text{tick} = 10\,\mu\text{s}$ or normalized clock unit), not continuous analog seconds.
2. **Deterministic Fault Injection:** Frame drops and bit flips occur via controlled user fault plans rather than analog signal attenuation, Gaussian thermal noise, or multi-path fading.
3. **Layer Scope:** The simulator strictly models Layer 2 (Data Link and MAC layers); upper-layer protocols (TCP three-way handshakes, IP routing, HTTP) and physical transceiver signaling voltages are abstracted.
4. **Medium Topologies:** The point-to-point profile models a dedicated full-duplex cable; the shared-medium profile models an unshielded linear multi-drop coaxial bus (10BASE5/10BASE2 topology).

---

## 7. Git Audit & Commit History Trail

```text
d5e203c (HEAD -> main) fix(transmission): genuine byte-level deframing extraction, Selective Repeat reassembly, and Profile B event synchronization
a9499f5 feat(transmission): implement Phase 8 integrated end-to-end transmission lab
98b907c fix(mac): audit IEEE 802.3 attemptLimit=16, resolve attempt 17 off-by-one, and verify BEB conventions
4d38e04 feat(mac): implement Phase 7 CSMA/CD shared-medium simulation with bilateral propagation, 32-bit jam, and truncated BEB
1db7e8f fix(flow-control): correct measured utilization timing and clarify theoretical assumptions
1ca73e1 feat(flow-control): implement Phase 6 Stop-and-Wait, Go-Back-N, Selective Repeat ARQ, and interactive visualizer
c0ed441 fix(ui): fix JSX curly-brace escaping in ErrorControlView LaTeX math block
23fb940 feat(error-control): implement Phase 5 error control modules (CRC, Checksum, 1D/2D Parity) and interactive visualizer
```
