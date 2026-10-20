/**
 * sequenceMath.js
 * 
 * Modular sequence number arithmetic for sliding window flow control protocols.
 * All operations take sequence bit width `m`, where the sequence number space is M = 2^m.
 */

/**
 * Standard positive modulo operation: n mod M in [0, M - 1].
 * 
 * @param {number} n 
 * @param {number} M 
 * @returns {number}
 */
export function mod(n, M) {
  return ((n % M) + M) % M;
}

/**
 * Calculate the forward circular distance from `from` to `to` in modulo 2^m.
 * Represents how many steps forward in sequence space are needed to reach `to` from `from`.
 * 
 * @param {number} from - Starting sequence number (0 <= from < 2^m)
 * @param {number} to - Destination sequence number (0 <= to < 2^m)
 * @param {number} m - Sequence number width in bits
 * @returns {number} Distance in [0, 2^m - 1]
 */
export function seqDistance(from, to, m) {
  const M = 1 << m;
  return mod(to - from, M);
}

/**
 * Check if sequence number `seq` lies within the half-open circular window [base, base + windowSize).
 * 
 * @param {number} seq - Sequence number to test
 * @param {number} base - Starting sequence number of window
 * @param {number} windowSize - Number of slots in window (1 <= windowSize <= 2^m)
 * @param {number} m - Sequence number width in bits
 * @returns {boolean} True if seq is inside the window
 */
export function isWithinWindow(seq, base, windowSize, m) {
  if (windowSize <= 0) return false;
  const dist = seqDistance(base, seq, m);
  return dist < windowSize;
}

/**
 * Advance a sequence number by `step` forward in modulo 2^m.
 * 
 * @param {number} seq - Current sequence number
 * @param {number} [step=1] - Steps to advance
 * @param {number} m - Sequence number width in bits
 * @returns {number} New sequence number in [0, 2^m - 1]
 */
export function seqAdvance(seq, step = 1, m) {
  const M = 1 << m;
  return mod(seq + step, M);
}

/**
 * Get the maximum permissible sender window size for a given protocol and sequence bit width m.
 * 
 * Mathematical limits:
 * - Stop-and-Wait: W = 1 (m = 1, M = 2)
 * - Go-Back-N: W <= 2^m - 1 (Receiver window = 1)
 * - Selective Repeat: W <= 2^(m - 1) (Sender & Receiver window <= 2^(m - 1) to avoid overlap)
 * 
 * @param {string} protocol - 'SW' | 'STOP_AND_WAIT' | 'GBN' | 'GO_BACK_N' | 'SR' | 'SELECTIVE_REPEAT'
 * @param {number} m - Sequence number width in bits
 * @returns {number} Maximum allowed window size
 */
export function getMaxWindowSize(protocol, m) {
  const p = (protocol || '').toUpperCase();
  if (p === 'SW' || p === 'STOP_AND_WAIT') {
    return 1;
  }
  if (p === 'GBN' || p === 'GO_BACK_N') {
    return (1 << m) - 1;
  }
  if (p === 'SR' || p === 'SELECTIVE_REPEAT') {
    return 1 << (m - 1);
  }
  throw new Error(`Unknown protocol: ${protocol}`);
}

/**
 * Validate whether a window size complies with theoretical limits.
 * 
 * @param {string} protocol 
 * @param {number} windowSize 
 * @param {number} m 
 * @returns {{ valid: boolean, error: string|null, maxAllowed: number }}
 */
export function validateWindowSize(protocol, windowSize, m) {
  const maxAllowed = getMaxWindowSize(protocol, m);
  if (!Number.isInteger(windowSize) || windowSize < 1) {
    return {
      valid: false,
      error: `Window size must be a positive integer >= 1 (got ${windowSize}).`,
      maxAllowed,
    };
  }
  if (windowSize > maxAllowed) {
    return {
      valid: false,
      error: `Window size ${windowSize} exceeds theoretical maximum of ${maxAllowed} for ${protocol} with m=${m}.`,
      maxAllowed,
    };
  }
  return { valid: true, error: null, maxAllowed };
}
