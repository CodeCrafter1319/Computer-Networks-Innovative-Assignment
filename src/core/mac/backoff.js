/**
 * backoff.js
 * 
 * IEEE 802.3 Truncated Binary Exponential Backoff (BEB) Implementation.
 * 
 * Networking Principles & Mathematical Foundations:
 * 1. Contention Resolution:
 *    When multiple stations simultaneously attempt to transmit on a shared medium,
 *    their signals collide. To prevent repeated collisions when stations retransmit,
 *    each colliding station waits for an independently chosen random delay.
 * 
 * 2. Attempt Count vs. Zero-Based Indexing:
 *    - c is the 1-based collision attempt count:
 *      * c = 1: First collision
 *      * c = 2: Second collision
 *      * ...
 *      * c = 16: Maximum retry attempt (standard IEEE 802.3 Ethernet)
 *    - The exponent k is calculated as:
 *      k = min(c, maxExponent)  where maxExponent = 10 by default.
 *    - Collision 1: k = 1 => r in {0, 1} (2^1 = 2 slots)
 *    - Collision 2: k = 2 => r in {0, 1, 2, 3} (2^2 = 4 slots)
 *    - Collision 3: k = 3 => r in {0, ..., 7} (2^3 = 8 slots)
 *    - ...
 *    - Collision 10+: k = 10 => r in {0, ..., 1023} (2^10 = 1024 slots)
 *    - Collision 16: If c > maxRetries (16), transmission is permanently aborted
 *      with an EXCESSIVE_COLLISIONS error.
 * 
 * 3. Slot Time Definition:
 *    - Slot Time (Tslot) is defined as twice the maximum end-to-end propagation delay
 *      across the bus (2 * tau_max). In 10 Mbps Ethernet (10BASE5), slot time is
 *      512 bit-times (51.2 microseconds), which accommodates 2 * tau plus jam signal
 *      propagation and transceiver turnaround times.
 * 
 * 4. Determinism:
 *    Accepts an optional deterministic RNG or explicit slot override for 100%
 *    reproducible test cases and predictable classroom demonstrations.
 */

export const DEFAULT_MAX_EXPONENT = 10;
export const DEFAULT_ATTEMPT_LIMIT = 16;
export const DEFAULT_MAX_RETRIES = 16; // Backward-compatible alias for attemptLimit

/**
 * Get the slot range and exponent for a given collision attempt count.
 * 
 * IEEE 802.3 Exponent Rule:
 * - After 1st collision (c = 1): k = min(1, 10) = 1 => slot range [0, 1]
 * - After 2nd collision (c = 2): k = min(2, 10) = 2 => slot range [0, 3]
 * - After 3rd collision (c = 3): k = min(3, 10) = 3 => slot range [0, 7]
 * - ...
 * - After 10th-15th collision (c = 10..15): k = 10 => slot range [0, 1023]
 * 
 * @param {number} attemptCount - 1-based collision count experienced so far (c >= 1)
 * @param {number} [maxExponent=10] - Maximum backoff exponent (standard IEEE 802.3 is 10)
 * @returns {{ k: number, maxSlots: number, minSlot: number, maxSlot: number }}
 */
export function getSlotRange(attemptCount, maxExponent = DEFAULT_MAX_EXPONENT) {
  if (typeof attemptCount !== 'number' || attemptCount < 1) {
    throw new Error(`Invalid collision attempt count: ${attemptCount}. Must be an integer >= 1.`);
  }

  const k = Math.min(Math.floor(attemptCount), maxExponent);
  const maxSlots = Math.pow(2, k);
  return {
    k,
    maxSlots,
    minSlot: 0,
    maxSlot: maxSlots - 1,
  };
}

/**
 * Check whether all transmission attempts have been exhausted under the IEEE 802.3 attempt limit.
 * 
 * Under IEEE 802.3 Clause 4.2.3.2.5, a frame is allowed at most attemptLimit (16)
 * total transmission attempts (1 initial attempt + up to 15 retransmissions).
 * If the 16th transmission attempt terminates in a collision (collisionCount >= 16),
 * all attempts have failed and the frame is discarded with excessiveCollisionError.
 * 
 * @param {number} collisionCount - 1-based count of collisions experienced by the frame (c >= 1)
 * @param {number} [attemptLimit=16] - Maximum transmission attempts allowed (standard IEEE 802.3 is 16)
 * @returns {boolean} True if the attempt limit has been exhausted (collisionCount >= attemptLimit)
 */
export function isExcessiveCollisions(collisionCount, attemptLimit = DEFAULT_ATTEMPT_LIMIT) {
  return collisionCount >= attemptLimit;
}

/**
 * Calculate the backoff result for a collision event according to Truncated BEB.
 * 
 * @param {number} attemptCount - 1-based collision count (1 for 1st collision, 2 for 2nd, up to attemptLimit - 1)
 * @param {number} slotTime - Duration of one slot in virtual ticks (typically 2 * tau_max)
 * @param {Object} [options={}] - Configuration options
 * @param {number} [options.maxExponent=10] - Truncation exponent cap (k <= 10)
 * @param {number} [options.attemptLimit=16] - Total transmission attempts allowed before discard
 * @param {number} [options.maxRetries=16] - Backward-compatible alias for attemptLimit
 * @param {Function} [options.rng=null] - Deterministic slot selector: (maxSlots, attemptCount) => number
 * @param {number|null} [options.slotChoice=null] - Direct slot override for deterministic testing
 * @returns {Object} Backoff computation report
 */
export function calculateBackoff(attemptCount, slotTime, options = {}) {
  const maxExponent = options.maxExponent ?? DEFAULT_MAX_EXPONENT;
  const attemptLimit = options.attemptLimit ?? options.maxRetries ?? DEFAULT_ATTEMPT_LIMIT;

  if (typeof slotTime !== 'number' || slotTime <= 0) {
    throw new Error(`Invalid slotTime: ${slotTime}. Slot time must be a positive number.`);
  }

  // Check if all permitted transmission attempts have terminated in collisions
  if (isExcessiveCollisions(attemptCount, attemptLimit)) {
    return {
      attempt: attemptCount,
      k: maxExponent,
      maxSlots: Math.pow(2, maxExponent),
      slotChosen: null,
      waitTicks: 0,
      slotTime,
      exceededAttemptLimit: true,
      exceededMaxRetries: true,
      reason: 'EXCESSIVE_COLLISIONS',
    };
  }

  const { k, maxSlots, maxSlot } = getSlotRange(attemptCount, maxExponent);

  let slotChosen;
  if (options.slotChoice !== null && options.slotChoice !== undefined) {
    // Explicit deterministic slot choice
    slotChosen = Math.max(0, Math.min(maxSlot, Math.floor(options.slotChoice)));
  } else if (typeof options.rng === 'function') {
    // Custom RNG provider
    const chosen = options.rng(maxSlots, attemptCount);
    slotChosen = Math.max(0, Math.min(maxSlot, Math.floor(chosen)));
  } else {
    // Standard pseudo-random selection in [0, maxSlots - 1]
    slotChosen = Math.floor(Math.random() * maxSlots);
  }

  const waitTicks = slotChosen * slotTime;

  return {
    attempt: attemptCount,
    k,
    maxSlots,
    slotChosen,
    waitTicks,
    slotTime,
    exceededAttemptLimit: false,
    exceededMaxRetries: false,
    reason: null,
  };
}
