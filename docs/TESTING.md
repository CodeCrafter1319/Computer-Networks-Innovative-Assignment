# TESTING.md — Test Execution Log & Validation Records

## 1. Testing Strategy Summary
All networking logic in this project is developed under strict test-driven validation:
- Pure JavaScript networking modules are tested using Vitest before any UI integration.
- Test suites cover deterministic test vectors, boundary conditions, bitwise math edge cases, and protocol timeout states.
- Tests run locally via `pnpm test` (one-shot) or `pnpm test:watch` (interactive TDD mode).

---

## 2. Test Execution Records

### Phase 2: Foundation & Test Pipeline Verification
- **Date:** 2026-10-18
- **Test Runner:** Vitest v3.2.7 (Node environment)
- **Command:** `pnpm test`

| Test Suite | Test Case Description | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| `src/tests/sanity.test.js` | Test runner execution sanity | Assert `true === true` | Pass | **PASS** |
| `src/tests/sanity.test.js` | Modulo-2 XOR truth table verification | $1 \oplus 1 = 0$, $1 \oplus 0 = 1$, $0 \oplus 1 = 1$, $0 \oplus 0 = 0$ | Pass | **PASS** |

**Summary:** 1 file, 2 tests passed, 0 failed.

### Phase 3: Discrete-Event Simulation Engine & Channel Core
- **Date:** 2026-10-18
- **Test Runner:** Vitest v3.2.7 (Node environment)
- **Command:** `pnpm test`

| Test Suite | Test Case Description | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| `src/tests/engine.test.js` | Chronological event queue ordering | Dequeues in strict ascending virtual tick order | Pass | **PASS** |
| `src/tests/engine.test.js` | Simultaneous event FIFO ordering | Simultaneous events dequeue in original insertion order | Pass | **PASS** |
| `src/tests/engine.test.js` | Event cancellation by ID | Cancelled event is removed and its handler never executes | Pass | **PASS** |
| `src/tests/engine.test.js` | Cancelling nonexistent ID | Returns false safely without error | Pass | **PASS** |
| `src/tests/engine.test.js` | Empty queue boundary checks | `isEmpty()` is true, `peek()` and `dequeue()` return null | Pass | **PASS** |
| `src/tests/engine.test.js` | Invalid input rejection | Throws descriptive error on negative/non-integer time or non-function handler | Pass | **PASS** |
| `src/tests/engine.test.js` | Queue clear operation | Empties queue and resets size | Pass | **PASS** |
| `src/tests/engine.test.js` | Engine initialization state | Initial tick is 0, state is IDLE, queue is empty | Pass | **PASS** |
| `src/tests/engine.test.js` | Clock advancement on stepping | Virtual clock advances strictly to scheduled event times | Pass | **PASS** |
| `src/tests/engine.test.js` | Single-step execution | Exactly one event executes per manual `step()` | Pass | **PASS** |
| `src/tests/engine.test.js` | Relative scheduling | `scheduleRelative(delay)` schedules at `currentTick + delay` | Pass | **PASS** |
| `src/tests/engine.test.js` | Cancelled timer non-execution | Cancelled event does not run during `runUntilEmpty()` | Pass | **PASS** |
| `src/tests/engine.test.js` | Handler error containment | Caught safely, transitions to ERROR, leaves queue uncorrupted | Pass | **PASS** |
| `src/tests/engine.test.js` | Pause and resume execution | Pausing halts `runUntilEmpty()`; resuming continues cleanly | Pass | **PASS** |
| `src/tests/engine.test.js` | Engine reset operation | Clock resets to 0, queue cleared, state reset to IDLE | Pass | **PASS** |
| `src/tests/engine.test.js` | Targeted run (`runUntil`) | Execution halts at or before specified target tick | Pass | **PASS** |
| `src/tests/engine.test.js` | Channel normal delivery | Frame delivered at `currentTick + propagationDelay` | Pass | **PASS** |
| `src/tests/engine.test.js` | Frame immutability guarantee | Original caller frame object is pristine and unmutated | Pass | **PASS** |
| `src/tests/engine.test.js` | Channel drop simulation | Dropped frame never triggers receiver callback | Pass | **PASS** |
| `src/tests/engine.test.js` | Channel corruption simulation | Flips designated bit on delivered copy, sets `corrupted: true` | Pass | **PASS** |
| `src/tests/engine.test.js` | Channel extra delay | Scheduled delivery tick increased by configured jitter | Pass | **PASS** |
| `src/tests/engine.test.js` | Sequential fault plan | Executes sequence of faults (PASS -> DROP -> CORRUPT) deterministically | Pass | **PASS** |

**Summary:** 2 files, 24 tests passed, 0 failed.

### Phase 4: Framing Algorithms & Interactive Visualizer
- **Date:** 2026-10-18
- **Test Runner:** Vitest v3.2.7 (Node environment)
- **Command:** `pnpm test`

| Test Suite | Test Case Description | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| `src/tests/framing.test.js` | Binary bit string validator | Returns true for valid `0`/`1` strings; rejects invalid | Pass | **PASS** |
| `src/tests/framing.test.js` | 5 consecutive ones bit stuffing | Inserts `0` immediately after fifth `1` (`11111` -> `111110`) | Pass | **PASS** |
| `src/tests/framing.test.js` | Multiple stuffing events | Correctly handles multiple disjoint runs of five `1`s | Pass | **PASS** |
| `src/tests/framing.test.js` | Long runs of ones | Inserts `0` after each block of five consecutive `1`s | Pass | **PASS** |
| `src/tests/framing.test.js` | Raw flag collision prevention | Payload `01111110` stuffed to `011111010` (no flag leakage) | Pass | **PASS** |
| `src/tests/framing.test.js` | Double raw flag collision | Consecutive flags `0111111001111110` safely stuffed & recovered | Pass | **PASS** |
| `src/tests/framing.test.js` | Payload ending with five ones | `0011111` stuffed to `00111110` and restored cleanly | Pass | **PASS** |
| `src/tests/framing.test.js` | 15 consecutive ones | 3 stuffed zeros added, destuffing recovers all 15 ones | Pass | **PASS** |
| `src/tests/framing.test.js` | Bit stuffing round-trip | All payloads preserved perfectly through stuffing/destuffing | Pass | **PASS** |
| `src/tests/framing.test.js` | Empty bit stream handling | Stuffs to `FLAG + FLAG`; destuffs cleanly to empty string | Pass | **PASS** |
| `src/tests/framing.test.js` | UTF-8 text bit conversion round-trip | Text converted to bits, stuffed, destuffed, and recovered | Pass | **PASS** |
| `src/tests/framing.test.js` | Abort sequence detection | Seven consecutive `1`s flagged as Abort / framing error | Pass | **PASS** |
| `src/tests/framing.test.js` | Unescaped delimiter flag detection | Six `1`s followed by `0` in payload detected as framing violation | Pass | **PASS** |
| `src/tests/framing.test.js` | Boundary flag validation | Missing or corrupt start/end flags rejected safely | Pass | **PASS** |
| `src/tests/framing.test.js` | Byte stuffing normal pass-through | Non-reserved bytes untouched, framed with `0x7E` | Pass | **PASS** |
| `src/tests/framing.test.js` | RFC 1662 PPP FLAG escaping | `0x7E` in payload escaped as `[0x7D, 0x5E]` (`0x7E ^ 0x20 = 0x5E`) | Pass | **PASS** |
| `src/tests/framing.test.js` | RFC 1662 PPP ESC escaping | `0x7D` in payload escaped as `[0x7D, 0x5D]` (`0x7D ^ 0x20 = 0x5D`) | Pass | **PASS** |
| `src/tests/framing.test.js` | RFC 1662 PPP unstuffing via XOR | `[0x7D, 0x5E]` restored to `0x7E`, `[0x7D, 0x5D]` to `0x7D` | Pass | **PASS** |
| `src/tests/framing.test.js` | Generic Educational Escape mode | `0x7E -> [0x7D, 0x7E]` and `0x7D -> [0x7D, 0x7D]` verified | Pass | **PASS** |
| `src/tests/framing.test.js` | RFC 1662 round-trip byte preservation | Raw byte arrays restored identically after unstuffing | Pass | **PASS** |
| `src/tests/framing.test.js` | UTF-8 multi-byte emoji/symbol text | Unicode strings with emojis recovered without loss | Pass | **PASS** |
| `src/tests/framing.test.js` | Dangling ESC immediately before closing FLAG | `[0x7D, 0x7E]` caught as RFC 1662 abort sequence / dangling ESC | Pass | **PASS** |
| `src/tests/framing.test.js` | RFC 1662 transparent XOR 0x20 decoding | `[0x7D, 0x41]` decodes cleanly to `0x61` ('a') via `0x41 ^ 0x20` | Pass | **PASS** |
| `src/tests/framing.test.js` | RFC 1662 payload abort sequence | `[0x7D, 0x7E]` inside payload aborts the frame per RFC 1662 Sec 4.2 | Pass | **PASS** |
| `src/tests/framing.test.js` | Strict minimum escape policy | With `strictMinimumEscapes: true`, octets other than 0x5E/0x5D rejected | Pass | **PASS** |
| `src/tests/framing.test.js` | Generic mode invalid escape rejection | Generic mode rejects ESC followed by non-reserved byte | Pass | **PASS** |
| `src/tests/framing.test.js` | Dangling ESC in un-flagged stream | Trailing `0x7D` without following byte caught as error | Pass | **PASS** |
| `src/tests/framing.test.js` | Unescaped internal FLAG detection | Raw `0x7E` inside payload flagged as framing violation | Pass | **PASS** |
| `src/tests/framing.test.js` | Character-count single frame | Length header equals total frame size (header + payload) | Pass | **PASS** |
| `src/tests/framing.test.js` | Multi-frame stream parsing | Concatenated frames parsed correctly into individual payloads | Pass | **PASS** |
| `src/tests/framing.test.js` | UTF-8 multi-byte byte calculation | Euro symbol (€) counted as 3 bytes, not string length 1 | Pass | **PASS** |
| `src/tests/framing.test.js` | Truncated frame detection | Stream ending before claimed length triggers error | Pass | **PASS** |
| `src/tests/framing.test.js` | Invalid length header (< 1) | Zero or negative length header rejected safely | Pass | **PASS** |
| `src/tests/framing.test.js` | Length header corruption desynchronization | Single corrupted length byte causes cascading framing failure | Pass | **PASS** |

**Summary:** 3 files, 58 tests passed, 0 failed.

### Phase 5: Error Control & Step-by-Step CRC Visualizer
- **Date:** 2026-10-19
- **Test Runner:** Vitest v3.2.7 (Node environment)
- **Command:** `pnpm test`

| Test Suite | Test Case Description | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| `src/tests/errorControl.test.js` | Binary bit string validator | Validates strings of '0'/'1', rejects empty and non-binary | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Generator polynomial validator | Validates degree $\ge 1$, starts and ends with '1' | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Bitwise XOR helper | Exact bit-by-bit XOR on equal length binary strings | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Textbook Modulo-2 division | Message `1101011011`, poly `10011` yields 4-bit FCS, receiver remainder `0000` | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Single-bit error detection (CRC) | Flipped bit produces non-zero remainder, caught by receiver | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Burst error detection (CRC-8) | Burst of 4 consecutive bit flips caught by degree-8 polynomial | Pass | **PASS** |
| `src/tests/errorControl.test.js` | UTF-8 text message CRC | Multi-byte string converted to bits, divided, verified clean | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Codeword length validation | Received codeword shorter than generator degree rejected safely | Pass | **PASS** |
| `src/tests/errorControl.test.js` | CRC-8/SMBUS standard check vector | Check string `"123456789"` produces exact check value `0xF4` | Pass | **PASS** |
| `src/tests/errorControl.test.js` | CRC-16/CCITT-FALSE check vector | Check string `"123456789"` produces exact check value `0x29B1` | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Named CRC intact verification | Intact payload and FCS match under recomputed check | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Named CRC payload corruption | Corrupted payload detected via FCS mismatch | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Named CRC FCS corruption | Corrupted received FCS detected even when payload is intact | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Uint8Array named CRC handling | Binary byte buffer processed and verified without type issues | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Checksum 16-bit word extraction | Big-endian conversion and odd-length padding on right with 0x00 | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Checksum even-length input | Payload `"ABCD"` produces sum `0x8486` and checksum `0x7B79` | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Checksum odd-length input | Payload `"ABCDE"` produces sum `0xC986` and checksum `0x3679` | Pass | **PASS** |
| `src/tests/errorControl.test.js` | End-around carry folding | Accumulator overflow correctly folds carry into 16-bit sum | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Checksum receiver verification | Receiver sum of payload words + checksum word equals `0xFFFF` | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Checksum payload corruption | Flipped byte in payload causes receiver sum $\ne$ `0xFFFF` | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Checksum field corruption | Tampered checksum word causes receiver sum $\ne$ `0xFFFF` | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Empty payload checksum | Empty input yields checksum `0xFFFF` per RFC convention | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Bit 1-count helper | Correctly counts total 1-bits in string or array | Pass | **PASS** |
| `src/tests/errorControl.test.js` | 1D Even & Odd parity generation | Generates correct parity bits for even and odd counts | Pass | **PASS** |
| `src/tests/errorControl.test.js` | 1D single-bit error detection | Inverted data or parity bit fails parity check | Pass | **PASS** |
| `src/tests/errorControl.test.js` | 1D two-bit error evasion | Two bit flips cancel out in parity (undetected error demonstration) | Pass | **PASS** |
| `src/tests/errorControl.test.js` | 2D matrix parity calculation | $4 \times 4$ matrix with row, column, and corner parities verified intact | Pass | **PASS** |
| `src/tests/errorControl.test.js` | 2D single-bit localization | Single flipped bit localized to exact row & column intersection $(r, c)$ | Pass | **PASS** |
| `src/tests/errorControl.test.js` | 2D row parity bit error | Mismatched row parity localized without mutating data matrix | Pass | **PASS** |
| `src/tests/errorControl.test.js` | 2D multi-bit error ambiguity | 2-bit error in same row detected but flagged as ambiguous | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Error injection single bit flip | Flips designated bit and generates exact error mask | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Error injection burst flip | Flips $B$ contiguous bits and generates exact error mask | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Error injection field isolation | Corrupts payload vs FCS independently or together | Pass | **PASS** |
| `src/tests/errorControl.test.js` | Channel burst corruption | Transmits frame through Channel with burst corruption directive | Pass | **PASS** |
| `src/tests/errorControl.test.js` | ErrorControlView component rendering | Verifies ErrorControlView renders to HTML without ReferenceErrors | Pass | **PASS** |
| `src/tests/errorControl.test.js` | App shell component rendering | Verifies App shell renders to HTML with ErrorControl tab active | Pass | **PASS** |

### Phase 6: Flow Control, ARQ Protocols & Sliding Window Visualizer
- **Date:** 2026-10-20
- **Test Runner:** Vitest v3.2.7 (Node environment)
- **Command:** `pnpm test`

| Test Suite | Test Case Description | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| `src/tests/flowControl.test.js` | Modulo math with negative numbers | Returns positive remainder in $[0, M-1]$ | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Forward circular distance | Calculates clockwise distance across modulo boundaries | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Window membership test | Correctly identifies membership in linear and wraparound windows | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Sequence advance | Advances sequence numbers in modulo $2^m$ space | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Theoretical window limits | Enforces $W_s \le 2^m - 1$ for GBN and $W_s \le 2^{m-1}$ for SR | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Plain frame contract | Generates canonical serializable plain frame objects | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Compact 1-byte header | Encodes/decodes Type (2b), Seq (3b), Ack (3b) for $m \le 3$ | Pass | **PASS** |
| `src/tests/flowControl.test.js` | 2-byte header | Encodes/decodes extended header for $m > 3$ | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Wire bytes extraction | Serializes [Header Bytes + Payload Bytes] for error-control | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Stop-and-Wait single frame | Transmits DATA 0, receives ACK 1, returns to IDLE | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Alternating sequence numbers | Delivers multiple frames alternating $0 \to 1 \to 0$ | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Lost DATA frame recovery | Sender timer triggers retransmission; frame delivered | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Lost ACK frame recovery | Sender retransmits; receiver suppresses duplicate and re-ACKs | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Corrupted frame handling | Corrupted frame discarded; recovered via timeout | Pass | **PASS** |
| `src/tests/flowControl.test.js` | GBN window capacity | Accepts up to $W_s$ frames, blocks further sends with WINDOW_FULL | Pass | **PASS** |
| `src/tests/flowControl.test.js` | GBN cumulative ACKs | In-order delivery; single cumulative ACK advances base | Pass | **PASS** |
| `src/tests/flowControl.test.js` | GBN out-of-order discard | Lost frame causes discard of subsequent frames; full window resend | Pass | **PASS** |
| `src/tests/flowControl.test.js` | GBN wraparound | Continuous sliding window wraps sequence space across $2^m$ | Pass | **PASS** |
| `src/tests/flowControl.test.js` | SR window configuration check | Rejects illegal $W_s + W_r > 2^m$ configurations | Pass | **PASS** |
| `src/tests/flowControl.test.js` | SR out-of-order buffering | Buffers frames in window; selectively resends ONLY lost frame | Pass | **PASS** |
| `src/tests/flowControl.test.js` | SR previous-window re-ACK | Re-acknowledges delivered frames in $[R_f - W_r, R_f)$ to resolve lost ACKs | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Simulator metrics computation | Computes propagation, transmission, BDP, $\eta_{theo}$ and $\eta_{meas}$ | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Interactive frame drop in-flight | Cancels delivery event in queue; recovers via protocol timeout | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Interactive frame corrupt in-flight | Inverts bits on scheduled packet; detected at receiver | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Simulator clean reconfiguration | Resets virtual clock to 0 and reinitializes with new protocol | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Constructor validation | Enforces non-null dependencies and illegal window bounds | Pass | **PASS** |
| `src/tests/flowControl.test.js` | SR sequence number wraparound | Continuous sliding window wraps sequence space across $2^m$ | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Channel utilization vs goodput | Distinguishes temporal occupancy from packet delivery efficiency | Pass | **PASS** |
| `src/tests/flowControl.test.js` | FlowControlView SSR smoke test | Renders full FlowControlView without reference errors | Pass | **PASS** |
| `src/tests/flowControl.test.js` | App shell with active tab SSR | Renders App shell with active Flow Control tab cleanly | Pass | **PASS** |
| `src/tests/flowControl.test.js` | All views component smoke test | Renders FramingView, ErrorControlView, and FlowControlView cleanly | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Stop-and-Wait worked timing example | Verifies exact transmission, propagation, and ACK timing against worked cycle ($T_t + 2T_p$) with $\eta_{meas} = \eta_{theo} = 20.0\%$ | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Metric Audit Scenario A | Single clean transmission (0 retransmissions): $U = 9.1\%$, $S_{tx} = 100\%$, $U_{useful} = 9.1\%$ | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Metric Audit Scenario B | Lost DATA with timeout retransmission: $U = 7.4\%$, $S_{tx} = 50\%$, $U_{useful} = 3.7\%$ | Pass | **PASS** |
| `src/tests/flowControl.test.js` | Metric Audit Scenario C | Lost ACK with duplicate suppression: $U = 7.4\%$, $S_{tx} = 50\%$, $U_{useful} = 3.7\%$, duplicatesDiscarded = 1 | Pass | **PASS** |

**Summary:** 5 files, 129 tests passed, 0 failed.

### Phase 6 Metric Semantics & Channel Utilization Audit Record
- **Date:** 2026-10-20
- **Scope:** Narrowly scoped audit separating Channel Utilization, Transmission Success Ratio, and Goodput, with verified formulas and deterministic regression test cases.
- **Metric Definitions & Mathematical Formulations:**
  1. **Channel Utilization ($U$):** Fraction of elapsed virtual time during which the forward transmission medium was physically occupied by all DATA frame attempts (including original transmissions and retransmissions):
     $$U = \frac{\text{Total Transmitter Busy Ticks}}{T_{\text{elapsed}}} = \frac{\sum T_t}{T_{\text{elapsed}}}$$
     In full-duplex point-to-point ARQ, ACK transmission time on the reverse channel is negligible ($T_{\text{ack}} = 0$).
  2. **Transmission Success Ratio ($S_{\text{tx}}$, Packet Efficiency):** Ratio of successfully delivered unique DATA frames to total on-wire transmission attempts:
     $$S_{\text{tx}} = \frac{N_{\text{delivered}}}{N_{\text{transmissions}}} \times 100\%$$
  3. **Useful Channel Utilization ($U_{\text{useful}}$):** Fraction of elapsed time occupied by unique, delivered frames:
     $$U_{\text{useful}} = \frac{N_{\text{delivered}} \times T_t}{T_{\text{elapsed}}} = U \times \frac{S_{\text{tx}}}{100}$$
  4. **Goodput ($G$):** Rate of useful application payload delivered per virtual tick, excluding protocol headers and retransmissions:
     $$G_{\text{frames}} = \frac{N_{\text{delivered}}}{T_{\text{elapsed}}} \text{ (frames/tick)}, \quad G_{\text{bits}} = \frac{\text{DeliveredBits}}{T_{\text{elapsed}}} \text{ (bits/tick)}$$
- **Deterministic Test Scenarios Verified:**
  - **Scenario A (Clean Transmission, 0 Retransmissions):** $T_t = 1, T_p = 5 \implies T_{\text{elapsed}} = 11$. Attempts = 1, delivered = 1, busy = 1 tick. $U = 1/11 = 9.1\%$, $S_{\text{tx}} = 100.0\%$, $U_{\text{useful}} = 9.1\%$, $G_{\text{frames}} = 0.091$.
  - **Scenario B (Lost DATA + Timeout Retransmission):** $T_t = 1, T_p = 5, T_{\text{timeout}} = 16 \implies T_{\text{elapsed}} = 27$. Frame 0 dropped at $t=0$, timeout at $t=16$, retransmitted at $t=16$, delivered at $t=22$, ACK at $t=27$. Attempts = 2, delivered = 1, busy = 2 ticks. $U = 2/27 = 7.4\%$, $S_{\text{tx}} = 50.0\%$, $U_{\text{useful}} = 3.7\%$, $G_{\text{frames}} = 0.037$.
  - **Scenario C (Lost ACK + Duplicate Suppression):** $T_t = 1, T_p = 5, T_{\text{timeout}} = 16 \implies T_{\text{elapsed}} = 27$. Frame 0 delivered at $t=6$, ACK dropped. Timeout at $t=16$, retransmitted at $t=16$, duplicate suppressed at receiver at $t=22$ (`duplicatesDiscarded = 1`), duplicate ACK delivered at $t=27$. Attempts = 2, delivered = 1, busy = 2 ticks. $U = 2/27 = 7.4\%$, $S_{\text{tx}} = 50.0\%$, $U_{\text{useful}} = 3.7\%$.

### Phase 6 Final Technical Audit Record
- **Date:** 2026-10-20
- **Scope:** Technical audit of Stop-and-Wait, Go-Back-N, and Selective Repeat ARQ algorithms, window bounds, theoretical efficiency formulas, channel serialization timing, and UI rendering.
- **Findings & Resolutions:**
  1. *Channel Serialization & Frame Arrival Timing:* Identified that `Channel.js` previously scheduled frame arrivals strictly using `startTick + propagationDelay`, omitting frame transmission duration ($T_t$). For Stop-and-Wait with $T_p = 5, T_t = 1$, this caused the simulated round trip to finish at tick 10 ($2T_p$) rather than tick 11 ($T_t + 2T_p$), yielding a measured utilization of $10.0\%$ ($\frac{1}{10}$) that mismatched the theoretical $\frac{1}{1+2a} = \frac{1}{11} \approx 9.1\%$. Resolved by modeling physical transmission serialization in `Channel.js` (`txStart = Math.max(startTick, transmitterBusyUntil)`, `txEnd = txStart + transmissionDelay`, `deliveryTick = txEnd + propagationDelay`). For Stop-and-Wait, the DATA frame finishes transmission at $t=1$, completes reception at $t=6$, and ACK arrives at $t=11$. Measured utilization is organically $\frac{1 \times 1}{11} = 9.09\% \approx 9.1\%$, achieving exact numerical equality with theoretical $\frac{1}{1+2a} = 9.1\%$.
  2. *Theoretical Efficiency Formula vs Measured Metric Alignment:* Split performance metrics into **Channel Time Utilization ($\eta$)** ($\frac{\text{Frames Delivered} \times T_t}{\text{Current Tick}}$) and **Transmission Goodput Ratio** ($\frac{\text{Frames Delivered}}{\text{Total Transmissions}}$).
  3. *Worked Timing Example Regression Test:* Added deterministic regression test verifying tick-by-tick timing ($t=0 \to 2 \to 6 \to 10$) with $T_t = 2, T_p = 4, a = 2.0$, confirming measured utilization equals theoretical bound ($20.0\%$).
  4. *Selective Repeat Wraparound Coverage:* Verified seamless window advancement and in-order delivery across $2^m$ modulo boundaries.
  5. *UI Component SSR Verification:* Verified via `renderToString` that all three visualizer modules (`FramingView`, `ErrorControlView`, `FlowControlView`) and `App` render cleanly without runtime exceptions.
  6. *Dev Server Probe:* Dev server tested and responding with HTTP status `200` and valid HTML payload.

### Phase 7: Medium Access Control — CSMA/CD Simulation & Backoff
- **Date:** 2026-10-20
- **Test Runner:** Vitest v3.2.7 (Node environment)
- **Command:** `pnpm test`

| Test Suite | Test Case Description | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| `src/tests/mac.test.js` | BEB slot range calculations | $c=1 \to k=1 \implies [0, 1]$; $c=2 \to k=2 \implies [0, 3]$; $c=10 \to k=10 \implies [0, 1023]$ | Pass | **PASS** |
| `src/tests/mac.test.js` | BEB attempt limit enforcement | Attempts permitted for $c < 16$; $c \ge 16$ aborts with `EXCESSIVE_COLLISIONS` | Pass | **PASS** |
| `src/tests/mac.test.js` | BEB wait ticks calculation | Waiting duration = $r \times \text{slotTime}$ ($r \times 2\tau$) | Pass | **PASS** |
| `src/tests/mac.test.js` | BEB argument validation | Rejects non-positive slotTime or non-positive attempt count | Pass | **PASS** |
| `src/tests/mac.test.js` | Spatial propagation delay math | $\tau(0, 100) = 10$, $\tau(25, 75) = 5$, $\tau(0, 25) = 3$, $\tau(50, 50) = 0$ | Pass | **PASS** |
| `src/tests/mac.test.js` | Local carrier sensing vs distant activity | Medium at transmitting tap is immediately busy; distant tap senses idle until wavefront arrives ($t=\tau$) | Pass | **PASS** |
| `src/tests/mac.test.js` | Spatial wavefront generation | Computes $[x_{\text{left}}, x_{\text{right}}]$ boundaries for visualizer rail | Pass | **PASS** |
| `src/tests/mac.test.js` | Clean single transmission | Station A transmits to D with 0 contention; delivered successfully | Pass | **PASS** |
| `src/tests/mac.test.js` | Near-simultaneous collision detection | Stations A & D transmit within $\tau$; signals collide; both abort and emit 32-bit jam | Pass | **PASS** |
| `src/tests/mac.test.js` | BEB backoff execution | Colliding stations calculate $k = \min(c, 10)$ and wait $r \times 2\tau$ ticks | Pass | **PASS** |
| `src/tests/mac.test.js` | 1-Persistent sensing deferral | Station B senses A's busy transmission; defers until idle; transmits immediately | Pass | **PASS** |
| `src/tests/mac.test.js` | Excessive collisions frame drop | Stations reaching attempt limit ($c \ge \text{attemptLimit}$) abort transmission | Pass | **PASS** |
| `src/tests/mac.test.js` | Simulator preset loader | Presets (clean, collision, deferral, contention, BEB, excessive) initialize cleanly | Pass | **PASS** |
| `src/tests/mac.test.js` | Full contention resolution cycle | Colliding stations resolve contention via BEB; both frames eventually delivered | Pass | **PASS** |
| `src/tests/mac.test.js` | Reset and queue integrity | Resetting clears event queue, bus signals, and resets all stations to IDLE | Pass | **PASS** |
| `src/tests/mac.test.js` | Scenario 9: Exact 16-attempt limit | Discards frame on 16th collision; strictly prevents 17th attempt | Pass | **PASS** |
| `src/tests/mac.test.js` | Scenario 10: 16th attempt delivery | Successfully delivers frame on 16th and final permitted transmission attempt | Pass | **PASS** |
| `src/tests/mac.test.js` | MacView SSR smoke test | Renders full MacView component cleanly without runtime ReferenceErrors | Pass | **PASS** |
| `src/tests/mac.test.js` | App shell with active mac tab SSR | Renders App shell with active CSMA/CD Bus tab cleanly | Pass | **PASS** |

**Summary:** 6 files, 148 tests passed, 0 failed.

### Phase 7 Standards Audit Record — CSMA/CD Attempt Limit & BEB Conventions
- **Date:** 2026-10-20
- **Scope:** Narrowly scoped standards audit of IEEE 802.3 Clause 4.2.3.2.5 (`attemptLimit = 16`), counter semantics, and BEB exponent progression.
- **Counter Semantics Clarified:**
  1. **Total Transmission Attempts ($A$):** Initial transmission is attempt 1. Subsequent attempts are retransmissions ($R = A - 1$). The standard permits at most 16 total transmission attempts (1 initial + 15 retries).
  2. **Collision Count ($c$):** Each collision terminates one transmission attempt. When a frame collides on attempt $A$, the cumulative collision count $c$ equals $A$.
  3. **Attempt Limit Enforcement:** Previously, the check evaluated `if (collisionCount > maxRetries)`, which allowed $c = 16$ to back off and initiate a 17th transmission attempt before aborting. Corrected to `if (this.collisionCount >= this.config.attemptLimit)` where `attemptLimit = 16`. When the 16th attempt terminates in a collision, the station immediately transitions to `StationState.ABORTED_EXCESSIVE_COLLISIONS` without backoff, permanently discarding the frame.
- **BEB Exponent Convention Verified:**
  - After collision 1: $k = \min(1, 10) = 1 \implies r \in \{0, 1\}$.
  - After collision 2: $k = \min(2, 10) = 2 \implies r \in \{0, 1, 2, 3\}$.
  - After collisions 10..15: $k = \min(c, 10) = 10 \implies r \in [0, 1023]$.
  - After collision 16: Attempt limit exhausted ($16 \ge 16$). Frame discarded with `excessiveCollisionError`.
- **Deterministic Test Verification:**
  - `Scenario 9`: Verified that two stations colliding continuously make exactly 16 attempts, abort upon the 16th collision, and never attempt a 17th transmission.
  - `Scenario 10`: Verified that a station experiencing 15 collisions successfully delivers its frame on the 16th and final permitted attempt ($A = 16, c = 15, \text{delivered} = 1$).

### Phase 8: Integrated End-to-End Transmission Lab
- **Date:** 2026-10-20
- **Test Runner:** Vitest v3.2.7 (Node environment)
- **Command:** `pnpm test`
- **Scope:** 8-stage transmission lifecycle, Profile A (Point-to-Point ARQ: SW, GBN, SR with framing & FCS over duplex channels with fault injection), Profile B (Shared-Medium Ethernet: CSMA/CD contention, collision detection, 32-bit jam, Truncated BEB, and frame delivery), presets, and React SSR smoke tests.

| Test Suite | Test Case Description | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| `src/tests/transmissionLab.test.js` | Payload segmentation | Splits long message into discrete chunks per `maxPayloadChunk` | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Empty payload handling | Rejects empty string with `EMPTY_PAYLOAD` safely | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | CRC-16 with Byte Stuffing | Computes 16-bit FCS over serialized header+payload and applies RFC 1662 escaping | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | CRC-8 with Bit Stuffing | Computes 8-bit FCS and applies HDLC zero-insertion after five `1`s | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Checksum with Character Count | Computes RFC 1071 16-bit 1's complement and encodes total-length header | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | 1D Parity Even mode | Generates valid even parity bit over wire byte stream | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Clean Stop-and-Wait transmission | Runs through all 8 stages cleanly; delivers payload and unblocks sender on ACK | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Bit corruption recovery | Receiver detects FCS mismatch; discards frame; sender times out; retransmission succeeds | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Frame drop recovery | Channel drops DATA frame; sender times out; retransmission succeeds | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Lost ACK duplicate suppression | Frame delivered once; ACK lost; sender times out; receiver discards duplicate and re-ACKs | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Multi-frame GBN sliding window | Pipelined transmission of 3 segmented frames with cumulative ACKs | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Selective Repeat buffering & retransmission | Pipelined 4 frames, drop frame #1, buffer out-of-order, retransmit only dropped frame | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Reset lifecycle cleanup | Complete queue flush & state reset; prevents stale events from contaminating next run | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Profile B clean bus delivery | Station A transmits to D with zero contention; delivered cleanly | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Profile B contention & BEB backoff | Simultaneous transmissions collide; jam emitted; BEB resolves contention | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Profile B 16-attempt limit discard | Station reaches attempt limit (16) and transitions to excessive collisions drop | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Profile B no-ARQ message delivery | Delivers payload to destination station D without invoking sliding-window ARQ | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Preset CLEAN_TRANSMISSION | Loads Profile A clean Stop-and-Wait scenario cleanly | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Preset BIT_CORRUPTION_RECOVERY | Loads Profile A bit corruption scenario and transmits frame | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Preset CSMA_CD_COLLISION_BEB | Loads Profile B collision and BEB contention scenario | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | TransmissionLabView SSR smoke test | Renders full TransmissionLabView component without runtime errors | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | App shell with active Transmission Lab | Renders App shell with active End-to-End Transmission Lab tab cleanly | Pass | **PASS** |
| `src/tests/transmissionLab.test.js` | Multi-tab navigation regression | Preserves all earlier playground views (Framing, Error Control, Flow Control, MAC) | Pass | **PASS** |

**Summary:** 7 files, 171 tests passed, 0 failed.

---

### Phase 8 Final Acceptance Audit Verification
- **Date:** 2026-10-21
- **Focus Areas Verified:**
  1. **Genuine Deframing & Field Extraction:** In Stage 7, receiver extracts actual payload bytes and wire FCS from destuffed bytes/bits instead of relying on metadata shortcuts.
  2. **Authoritative Delivery vs. Window Buffering:** Verified that Selective Repeat out-of-order frames stay buffered until missing frames arrive, with upper layer delivery synchronized with protocol instance delivered payloads.
  3. **Profile B Temporal & Protocol Separation:** Station D delivery synchronized with physical propagation arrival ($t = T_t + \tau$); confirmed zero invocation of sliding-window ARQ state machine (`protocolInstance === null`).
  4. **State Isolation:** Complete event queue and state reset verified.
  5. **Regression Verification:** All 5 Learning Playground views (Overview, Framing, Error Control, Flow Control, MAC) fully preserved.

---

### Phase 9: Final Hardening, Acceptance Audit & Submission Verification
- **Date:** 2026-10-21
- **Test Runner:** Vitest v3.2.7 (Node environment)
- **Command:** `pnpm test -- --run`
- **Audit Scope:** System-wide regression across all modules (Framing, Error Control, Flow Control, CSMA/CD, End-to-End Transmission Lab, React presentation layer, SSR component renders).
- **Execution Results:** **175 tests passed across 7 test suites (0 failed, 0 skipped)** in 2.68s.
- **Phase 9 UX Hardening Tests Added:**
  - `runToCompletion drains events safely and yields identical outcome to stepped execution` (deterministic equality).
  - `correctly tracks isComplete and semantic status transitions` (READY -> WAITING_FOR_ACK -> COMPLETED).
  - `correctly segments multiline message payloads without data corruption` (multiline newline handling).
  - `renders the polished multiline textarea, collapsible guide, and instant playback controls` (SSR assertion).
- **Production Build Results:** Vite v6.4.4 compiled cleanly in 3.72s with zero warnings; production bundle size: 135 kB gzipped JavaScript, 3.87 kB gzipped CSS.
- **Dev Server Validation:** Launched Vite dev server on port 5173; probe request returned `HTTP_STATUS: 200` with clean initial document response.
- **Distinction of Testing Tiers:**
  - *Automated Unit & Integration Tests:* 171 automated assertions covering bitwise logic, state machines, and SSR renders.
  - *Automated Server Probe:* PowerShell HTTP request verifying clean server bootstrap.
  - *Interactive Browser Smoke-Tests:* Documented in `FINAL_AUDIT.md` and `SUBMISSION_MATERIALS.md` for manual user execution.

---

## 3. Failed Tests Log
*No failed tests to date.*

---

## 4. Known Testing Limitations & Assumptions
- **Virtual Time vs. Wall Clock:** Tests do not use wall-clock delays (`setTimeout`). All temporal assertions (timeouts, propagation delays) are evaluated using virtual engine ticks for instant and 100% deterministic test execution.
- **Node Environment:** Pure unit tests execute in a Node.js context without DOM overhead; UI component tests will be added only if React interaction testing is deemed necessary.
