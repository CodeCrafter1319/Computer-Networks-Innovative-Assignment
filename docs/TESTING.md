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


---

## 3. Failed Tests Log
*No failed tests to date.*

---

## 4. Known Testing Limitations & Assumptions
- **Virtual Time vs. Wall Clock:** Tests do not use wall-clock delays (`setTimeout`). All temporal assertions (timeouts, propagation delays) are evaluated using virtual engine ticks for instant and 100% deterministic test execution.
- **Node Environment:** Pure unit tests execute in a Node.js context without DOM overhead; UI component tests will be added only if React interaction testing is deemed necessary.
