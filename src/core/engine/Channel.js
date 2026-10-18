/**
 * Channel.js
 * 
 * Lightweight, deterministic transmission medium abstraction for data link simulation.
 * Connects sender and receiver through the virtual clock of SimulationEngine.
 * 
 * Core Guarantees:
 * 1. Non-mutating: The caller's original frame is never modified.
 * 2. Deterministic: Faults (loss, corruption, delay) occur strictly according to
 *    configured rules or sequential fault plans, enabling 100% reproducible test cases.
 * 3. Event-Driven: Transmissions are scheduled via the SimulationEngine virtual clock.
 */

export const TransmissionOutcome = Object.freeze({
  DELIVERED: 'DELIVERED',
  DROPPED: 'DROPPED',
  CORRUPTED: 'CORRUPTED',
});

export class Channel {
  /**
   * @param {import('./SimulationEngine.js').SimulationEngine} engine - The simulation engine instance.
   * @param {Object} [options={}] - Configuration options.
   * @param {number} [options.propagationDelay=5] - Base virtual ticks for propagation across medium.
   * @param {string} [options.name='Channel'] - Identifier name for telemetry/logs.
   */
  constructor(engine, options = {}) {
    if (!engine) {
      throw new Error('Channel requires an active SimulationEngine instance.');
    }

    this._engine = engine;
    this._propagationDelay = options.propagationDelay ?? 5;
    this._name = options.name || 'Channel';

    this._transmissionCounter = 0;
    this._history = [];
    this._maxHistorySize = 500;

    // Deterministic fault plan: queue of fault directives consumed sequentially
    // e.g. [{ action: 'DROP' }, { action: 'CORRUPT', bitIndex: 1 }, { action: 'DELAY', extraDelay: 8 }]
    this._faultPlan = [];
    
    // Persistent fault rules (e.g. drop every 3rd packet, or always corrupt frames with seqNum 2)
    this._faultRule = null;
  }

  /**
   * Base propagation delay in virtual ticks.
   * 
   * @returns {number}
   */
  getPropagationDelay() {
    return this._propagationDelay;
  }

  /**
   * Set base propagation delay.
   * 
   * @param {number} delay - Non-negative integer.
   */
  setPropagationDelay(delay) {
    if (typeof delay !== 'number' || !Number.isInteger(delay) || delay < 0) {
      throw new Error('Propagation delay must be a non-negative integer.');
    }
    this._propagationDelay = delay;
  }

  /**
   * Configure a deterministic sequential fault plan.
   * Each entry in the array will apply to the corresponding subsequent transmit() call.
   * 
   * @param {Array<Object>} plan - Array of fault directives.
   */
  setFaultPlan(plan) {
    if (!Array.isArray(plan)) {
      throw new Error('Fault plan must be an array of fault directives.');
    }
    this._faultPlan = [...plan];
  }

  /**
   * Add a single fault directive to the end of the fault plan queue.
   * 
   * @param {Object} faultDirective
   */
  addFault(faultDirective) {
    this._faultPlan.push(faultDirective);
  }

  /**
   * Clear the active fault plan.
   */
  clearFaultPlan() {
    this._faultPlan = [];
  }

  /**
   * Set a dynamic predicate rule to govern faults.
   * 
   * @param {Function|null} ruleFn - (frame, transmissionIndex) => FaultDirective|null
   */
  setFaultRule(ruleFn) {
    if (ruleFn !== null && typeof ruleFn !== 'function') {
      throw new Error('Fault rule must be a function or null.');
    }
    this._faultRule = ruleFn;
  }

  /**
   * Transmit a frame through the channel to a receiver callback.
   * 
   * @param {Object|any} frame - The frame to transmit (will NOT be mutated).
   * @param {Function} onDeliver - Callback invoked upon arrival: (deliveredFrame, transmissionRecord) => void.
   * @param {Object} [overrideFault=null] - Optional one-off fault directive for this specific transmission.
   * @returns {Object} Transmission record detailing scheduled delivery and outcome.
   */
  transmit(frame, onDeliver, overrideFault = null) {
    if (typeof onDeliver !== 'function') {
      throw new Error('onDeliver must be an executable callback function.');
    }

    const transmissionId = ++this._transmissionCounter;
    const startTick = this._engine.getCurrentTick();

    // 1. Deep clone frame to guarantee immutability of the caller's original object
    let frameCopy = this._cloneFrame(frame);

    // 2. Resolve fault directive (Precedence: 1. overrideFault -> 2. faultPlan shift -> 3. faultRule)
    let fault = null;
    if (overrideFault) {
      fault = overrideFault;
    } else if (this._faultPlan.length > 0) {
      fault = this._faultPlan.shift();
    } else if (this._faultRule) {
      fault = this._faultRule(frameCopy, transmissionId);
    }

    const action = fault?.action?.toUpperCase() || 'PASS';
    let outcome = TransmissionOutcome.DELIVERED;
    let extraDelay = fault?.extraDelay || 0;
    let scheduledEventId = null;

    if (action === 'DROP') {
      outcome = TransmissionOutcome.DROPPED;
    } else if (action === 'CORRUPT') {
      outcome = TransmissionOutcome.CORRUPTED;
      frameCopy = this._applyCorruption(frameCopy, fault);
    } else if (action === 'DELAY') {
      outcome = TransmissionOutcome.DELIVERED;
      extraDelay = fault.extraDelay || this._propagationDelay;
    }

    const totalDelay = this._propagationDelay + extraDelay;
    const deliveryTick = startTick + totalDelay;

    const record = {
      transmissionId,
      channelName: this._name,
      originalFrame: frame, // caller's reference
      transmittedFrame: frameCopy,
      outcome,
      startTick,
      deliveryTick: outcome === TransmissionOutcome.DROPPED ? null : deliveryTick,
      totalDelay: outcome === TransmissionOutcome.DROPPED ? null : totalDelay,
      eventId: null,
      faultApplied: fault ? { ...fault } : null,
    };

    // If frame is NOT dropped, schedule arrival in the simulation engine
    if (outcome !== TransmissionOutcome.DROPPED) {
      scheduledEventId = this._engine.scheduleRelative(
        totalDelay,
        () => {
          onDeliver(frameCopy, record);
        },
        {
          type: 'FRAME_DELIVERY',
          payload: { transmissionId, outcome },
        }
      );
      record.eventId = scheduledEventId;
    }

    this._recordHistory(record);
    return record;
  }

  /**
   * Get all past transmission records.
   * 
   * @returns {Array<Object>}
   */
  getHistory() {
    return [...this._history];
  }

  /**
   * Clear transmission history.
   */
  clearHistory() {
    this._history = [];
    this._transmissionCounter = 0;
  }

  /**
   * Deep clone helper to ensure the sender's frame is never mutated.
   * 
   * @private
   */
  _cloneFrame(frame) {
    if (frame === null || typeof frame !== 'object') {
      return frame;
    }
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(frame);
      } catch {
        // Fall back to JSON clone if structuredClone fails on simple objects
        return JSON.parse(JSON.stringify(frame));
      }
    }
    return JSON.parse(JSON.stringify(frame));
  }

  /**
   * Controlled bit/field corruption.
   * 
   * @private
   */
  _applyCorruption(frame, fault) {
    // If the frame is an object, mark it corrupted and mutate bitstream if present
    if (typeof frame === 'object' && frame !== null) {
      frame.corrupted = true;

      // If bitIndex is specified and frame has a payload/data bit string
      if (typeof frame.data === 'string' && frame.data.length > 0) {
        const bitIdx =
          typeof fault.bitIndex === 'number'
            ? Math.min(Math.max(0, fault.bitIndex), frame.data.length - 1)
            : 0;
        const currentBit = frame.data[bitIdx];
        const flippedBit = currentBit === '1' ? '0' : '1';
        frame.data =
          frame.data.substring(0, bitIdx) + flippedBit + frame.data.substring(bitIdx + 1);
      } else if (typeof frame.payload === 'string' && frame.payload.length > 0) {
        const bitIdx =
          typeof fault.bitIndex === 'number'
            ? Math.min(Math.max(0, fault.bitIndex), frame.payload.length - 1)
            : 0;
        const currentBit = frame.payload[bitIdx];
        const flippedBit = currentBit === '1' ? '0' : '1';
        frame.payload =
          frame.payload.substring(0, bitIdx) + flippedBit + frame.payload.substring(bitIdx + 1);
      }
    } else if (typeof frame === 'string') {
      const bitIdx =
        typeof fault.bitIndex === 'number'
          ? Math.min(Math.max(0, fault.bitIndex), frame.length - 1)
          : 0;
      const currentBit = frame[bitIdx];
      const flippedBit = currentBit === '1' ? '0' : '1';
      return frame.substring(0, bitIdx) + flippedBit + frame.substring(bitIdx + 1);
    }

    return frame;
  }

  /**
   * @private
   */
  _recordHistory(record) {
    this._history.push(record);
    if (this._history.length > this._maxHistorySize) {
      this._history.shift();
    }
  }
}
