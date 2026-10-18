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

---

## 3. Failed Tests Log
*No failed tests to date.*

---

## 4. Known Testing Limitations & Assumptions
- **Virtual Time vs. Wall Clock:** Tests do not use wall-clock delays (`setTimeout`). All temporal assertions (timeouts, propagation delays) are evaluated using virtual engine ticks for instant and 100% deterministic test execution.
- **Node Environment:** Pure unit tests execute in a Node.js context without DOM overhead; UI component tests will be added only if React interaction testing is deemed necessary.
