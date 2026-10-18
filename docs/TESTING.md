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

---

## 3. Failed Tests Log
*No failed tests to date.*

---

## 4. Known Testing Limitations & Assumptions
- **Virtual Time vs. Wall Clock:** Tests do not use wall-clock delays (`setTimeout`). All temporal assertions (timeouts, propagation delays) are evaluated using virtual engine ticks for instant and 100% deterministic test execution.
- **Node Environment:** Pure unit tests execute in a Node.js context without DOM overhead; UI component tests will be added only if React interaction testing is deemed necessary.
