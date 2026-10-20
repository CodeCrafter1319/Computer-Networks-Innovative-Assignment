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
export const DEFAULT_MAX_RETRIES = 16;

/**
 * Get the slot range and exponent for a given collision attempt count.
 * 
 * @param {number} attemptCount - 1-based collision attempt count (c >= 1)
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
 * Check whether the collision attempt count exceeds the maximum retry limit.
 * 
 * @param {number} attemptCount - 1-based collision count
 * @param {number} [maxRetries=16] - Maximum allowed collision attempts before aborting
 * @returns {boolean} True if retries are exhausted
 */
export function isExcessiveCollisions(attemptCount, maxRetries = DEFAULT_MAX_RETRIES) {
  return attemptCount > maxRetries;
}

/**
 * Calculate the backoff result for a collision event according to Truncated BEB.
 * 
 * @param {number} attemptCount - 1-based collision attempt count (1 for 1st collision, 2 for 2nd, etc.)
 * @param {number} slotTime - Duration of one slot in virtual ticks (typically 2 * tau_max)
 * @param {Object} [options={}] - Configuration options
 * @param {number} [options.maxExponent=10] - Truncation exponent cap (k <= 10)
 * @param {number} [options.maxRetries=16] - Maximum retry attempts before permanent failure
 * @param {Function} [options.rng=null] - Deterministic slot selector: (maxSlots, attemptCount) => number
 * @param {number|null} [options.slotChoice=null] - Direct slot override for deterministic testing
 * @returns {Object} Backoff computation report
 */
export function calculateBackoff(attemptCount, slotTime, options = {}) {
  const maxExponent = options.maxExponent ?? DEFAULT_MAX_EXPONENT;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  if (typeof slotTime !== 'number' || slotTime <= 0) {
    throw new Error(`Invalid slotTime: ${slotTime}. Slot time must be a positive number.`);
  }

  // Check if retries are exhausted
  if (isExcessiveCollisions(attemptCount, maxRetries)) {
    return {
      attempt: attemptCount,
      k: maxExponent,
      maxSlots: Math.pow(2, maxExponent),
      slotChosen: null,
      waitTicks: 0,
      slotTime,
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
    exceededMaxRetries: false,
    reason: null,
  };
}
