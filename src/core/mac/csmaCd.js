/**
 * csmaCd.js
 * 
 * CSMA/CD Station Protocol State Machine (IEEE 802.3).
 * 
 * Protocol States & Transitions:
 * 1. IDLE:
 *    Station has no queued frames. Continues to listen to the bus.
 * 2. SENSING / DEFERRING:
 *    A frame is queued. Under 1-persistent CSMA, the station continuously monitors
 *    the channel until the local tap becomes IDLE, then transmits immediately.
 * 3. TRANSMITTING:
 *    Station is actively transmitting frame bits onto the physical medium.
 *    Simultaneously executes Collision Detection (CD) by listening to its tap.
 * 4. TRANSMITTING_JAM:
 *    Collision detected! Station aborts frame transmission and emits a 32-bit
 *    jam sequence to ensure all colliding stations reliably detect the collision.
 * 5. BACKING_OFF:
 *    Waiting for Truncated Binary Exponential Backoff (BEB) delay (r * Tslot).
 * 6. ABORTED_EXCESSIVE_COLLISIONS:
 *    Collision count exceeded maximum retry limit (16 attempts). Frame discarded.
 */

import { SignalType } from './SharedBus.js';
import { calculateBackoff, DEFAULT_MAX_EXPONENT, DEFAULT_MAX_RETRIES } from './backoff.js';

export const StationState = Object.freeze({
  IDLE: 'IDLE',
  SENSING: 'SENSING',
  TRANSMITTING: 'TRANSMITTING',
  TRANSMITTING_JAM: 'TRANSMITTING_JAM',
  BACKING_OFF: 'BACKING_OFF',
  ABORTED_EXCESSIVE_COLLISIONS: 'ABORTED_EXCESSIVE_COLLISIONS',
});

export const PersistenceMode = Object.freeze({
  ONE_PERSISTENT: '1-PERSISTENT',
  NON_PERSISTENT: 'NON-PERSISTENT',
});

export class CsmaCdStation {
  /**
   * @param {Object} options
   * @param {string} options.id - Station identifier ('A', 'B', 'C', 'D')
   * @param {string} [options.name] - Display label
   * @param {number} options.position - Coordinate along the bus [0, busLength]
   * @param {import('../engine/SimulationEngine.js').SimulationEngine} options.engine
   * @param {import('./SharedBus.js').SharedBus} options.bus
   * @param {Object} [options.config={}]
   * @param {number} [options.config.frameTransmissionDuration=30] - Frame serialization time Tt
   * @param {number} [options.config.jamDuration=4] - 32-bit jam duration in virtual ticks
   * @param {string} [options.config.persistenceMode=PersistenceMode.ONE_PERSISTENT]
   * @param {number} [options.config.maxRetries=16]
   * @param {number} [options.config.maxExponent=10]
   * @param {Function} [options.onEvent=null] - Protocol telemetry callback: (type, data) => void
   */
  constructor({ id, name, position, engine, bus, config = {}, onEvent = null }) {
    if (!id || !engine || !bus) {
      throw new Error('CsmaCdStation requires id, engine, and bus.');
    }

    this.id = id;
    this.name = name || `Station ${id}`;
    this.position = position ?? 0;
    this.engine = engine;
    this.bus = bus;
    this.onEvent = onEvent;

    this.config = {
      frameTransmissionDuration: config.frameTransmissionDuration ?? 30,
      jamDuration: config.jamDuration ?? 4,
      persistenceMode: config.persistenceMode || PersistenceMode.ONE_PERSISTENT,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      maxExponent: config.maxExponent ?? DEFAULT_MAX_EXPONENT,
    };

    // Protocol State
    this.state = StationState.IDLE;
    this.collisionCount = 0; // c: 1-based count of collisions for current frame
    this.currentFrame = null;
    this.currentSignal = null;
    this.lastBackoff = null; // Last BEB calculation result { k, slotChosen, waitTicks }

    // Scheduled Event Tracking
    this.txCompleteEventId = null;
    this.jamCompleteEventId = null;
    this.backoffExpiredEventId = null;
    this.sensePollingEventId = null;

    // Deterministic Backoff Queue (for tests & repeatable presentations)
    this.deterministicSlots = [];

    // Telemetry Statistics
    this.stats = {
      framesQueued: 0,
      transmissionAttempts: 0,
      framesDelivered: 0,
      framesReceived: 0,
      collisionsDetected: 0,
      abortedTransmissions: 0,
      jamSignalsEmitted: 0,
      jamBitsEmitted: 0,
      totalBackoffTicks: 0,
      excessiveCollisionDrops: 0,
    };

    // Register station tap onto the physical bus
    this.bus.registerStation({
      id: this.id,
      name: this.name,
      position: this.position,
      onSignalArrival: (sig, b) => this._handleSignalArrival(sig, b),
      onSignalDeparture: (sig, b) => this._handleSignalDeparture(sig, b),
      onCollisionDetected: (localSig, incomingSig, b) => this._handleCollision(localSig, incomingSig, b),
    });
  }

  /**
   * Set deterministic backoff slot choices for subsequent collisions.
   * 
   * @param {Array<number>} slots - e.g. [0, 1, 3]
   */
  setDeterministicSlots(slots) {
    this.deterministicSlots = Array.isArray(slots) ? [...slots] : [];
  }

  /**
   * Submit an application payload for transmission.
   * 
   * @param {string|Object} payload - Upper layer data
   * @param {string} [destinationStationId='BROADCAST']
   * @returns {{ success: boolean, reason?: string }}
   */
  send(payload, destinationStationId = 'BROADCAST') {
    if (this.state !== StationState.IDLE) {
      return { success: false, reason: `STATION_BUSY_${this.state}` };
    }

    this.currentFrame = {
      payload,
      source: this.id,
      destination: destinationStationId,
      queuedTick: this.engine.getCurrentTick(),
      attempts: 0,
    };

    this.collisionCount = 0;
    this.lastBackoff = null;
    this.stats.framesQueued++;

    this._emit('FRAME_QUEUED', {
      stationId: this.id,
      frame: this.currentFrame,
      tick: this.engine.getCurrentTick(),
    });

    // Begin carrier sense procedure
    this._performCarrierSense();
    return { success: true };
  }

  /**
   * Execute carrier sensing and apply persistence policy.
   * @private
   */
  _performCarrierSense() {
    const isBusy = this.bus.isMediumBusyAt(this.id);

    if (!isBusy) {
      // Channel is IDLE: begin transmitting immediately!
      this._startTransmission();
    } else {
      // Channel is BUSY: enter SENSING state and defer
      this.state = StationState.SENSING;
      this._emit('CARRIER_BUSY_DEFERRING', {
        stationId: this.id,
        tick: this.engine.getCurrentTick(),
      });

      if (this.config.persistenceMode === PersistenceMode.ONE_PERSISTENT) {
        // 1-Persistent: Poll or wait for bus clearance
        this._pollUntilIdle();
      } else {
        // Non-Persistent: Schedule backoff before re-sensing
        const randomWait = Math.floor(Math.random() * this.bus.getSlotTime()) + 1;
        this.engine.scheduleRelative(randomWait, () => {
          if (this.state === StationState.SENSING) {
            this._performCarrierSense();
          }
        });
      }
    }
  }

  /**
   * Poll channel state on next tick if currently busy (1-persistent deferral).
   * @private
   */
  _pollUntilIdle() {
    if (this.sensePollingEventId !== null) return;

    this.sensePollingEventId = this.engine.scheduleRelative(1, () => {
      this.sensePollingEventId = null;
      if (this.state !== StationState.SENSING) return;

      if (!this.bus.isMediumBusyAt(this.id)) {
        // Channel has become IDLE: transmit immediately!
        this._startTransmission();
      } else {
        // Still busy: continue deferring
        this._pollUntilIdle();
      }
    });
  }

  /**
   * Begin physical frame transmission onto the shared bus.
   * @private
   */
  _startTransmission() {
    const currentTick = this.engine.getCurrentTick();
    this.state = StationState.TRANSMITTING;
    this.stats.transmissionAttempts++;
    this.currentFrame.attempts++;

    // Transmit DATA signal on bus
    this.currentSignal = this.bus.transmitSignal({
      stationId: this.id,
      type: SignalType.DATA,
      duration: this.config.frameTransmissionDuration,
      frame: this.currentFrame,
    });

    this._emit('TRANSMISSION_STARTED', {
      stationId: this.id,
      signalId: this.currentSignal.id,
      duration: this.config.frameTransmissionDuration,
      attempt: this.currentFrame.attempts,
      tick: currentTick,
    });

    // Schedule local completion event at startTick + Tt
    this.txCompleteEventId = this.engine.scheduleEvent(
      currentTick + this.config.frameTransmissionDuration,
      () => {
        this._handleTransmissionComplete();
      },
      {
        type: 'STATION_TX_COMPLETE',
        payload: { stationId: this.id, signalId: this.currentSignal.id },
      }
    );
  }

  /**
   * Handler when frame transmission duration Tt elapses with no collision.
   * @private
   */
  _handleTransmissionComplete() {
    this.txCompleteEventId = null;
    if (this.state !== StationState.TRANSMITTING || !this.currentSignal) {
      return;
    }

    // Frame was successfully serialized onto the medium without local collision!
    this.stats.framesDelivered++;
    this._emit('TRANSMISSION_SUCCESS', {
      stationId: this.id,
      signalId: this.currentSignal.id,
      frame: this.currentFrame,
      tick: this.engine.getCurrentTick(),
    });

    this.state = StationState.IDLE;
    this.currentFrame = null;
    this.currentSignal = null;
    this.collisionCount = 0;
  }

  /**
   * Collision Detection Handler (invoked by SharedBus when a foreign signal arrives while transmitting).
   * @private
   */
  _handleCollision(localSignal, incomingSignal, bus) {
    if (this.state !== StationState.TRANSMITTING) {
      return;
    }

    const currentTick = this.engine.getCurrentTick();

    // 1. Cancel pending normal transmission completion
    if (this.txCompleteEventId !== null) {
      this.engine.cancelEvent(this.txCompleteEventId);
      this.txCompleteEventId = null;
    }

    // 2. Abort data signal on physical bus
    this.bus.abortSignal(localSignal.id);

    // 3. Update collision counters
    this.collisionCount++;
    this.stats.collisionsDetected++;
    this.stats.abortedTransmissions++;

    this._emit('COLLISION_DETECTED', {
      stationId: this.id,
      localSignalId: localSignal.id,
      incomingSignalId: incomingSignal.id,
      foreignStationId: incomingSignal.stationId,
      collisionCount: this.collisionCount,
      tick: currentTick,
    });

    // 4. Emit 32-bit Jam Signal
    this.state = StationState.TRANSMITTING_JAM;
    this.stats.jamSignalsEmitted++;
    this.stats.jamBitsEmitted += 32;

    const jamSignal = this.bus.transmitSignal({
      stationId: this.id,
      type: SignalType.JAM,
      duration: this.config.jamDuration,
      frame: null,
    });

    this._emit('JAM_STARTED', {
      stationId: this.id,
      jamSignalId: jamSignal.id,
      duration: this.config.jamDuration,
      tick: currentTick,
    });

    // Schedule jam completion
    this.jamCompleteEventId = this.engine.scheduleEvent(
      currentTick + this.config.jamDuration,
      () => {
        this._handleJamComplete();
      },
      {
        type: 'STATION_JAM_COMPLETE',
        payload: { stationId: this.id },
      }
    );
  }

  /**
   * Handler when 32-bit jam transmission completes.
   * @private
   */
  _handleJamComplete() {
    this.jamCompleteEventId = null;
    if (this.state !== StationState.TRANSMITTING_JAM) {
      return;
    }

    const currentTick = this.engine.getCurrentTick();

    // Check if max retry attempts are exhausted
    if (this.collisionCount > this.config.maxRetries) {
      this.state = StationState.ABORTED_EXCESSIVE_COLLISIONS;
      this.stats.excessiveCollisionDrops++;

      this._emit('EXCESSIVE_COLLISIONS_ABORT', {
        stationId: this.id,
        attempts: this.collisionCount,
        maxRetries: this.config.maxRetries,
        tick: currentTick,
      });

      this.currentFrame = null;
      this.currentSignal = null;
      return;
    }

    // Compute Truncated Binary Exponential Backoff
    const slotTime = this.bus.getSlotTime();
    let slotChoice = null;
    if (this.deterministicSlots.length > 0) {
      slotChoice = this.deterministicSlots.shift();
    }

    const backoff = calculateBackoff(this.collisionCount, slotTime, {
      maxExponent: this.config.maxExponent,
      maxRetries: this.config.maxRetries,
      slotChoice,
    });

    this.lastBackoff = backoff;
    this.stats.totalBackoffTicks += backoff.waitTicks;
    this.state = StationState.BACKING_OFF;

    this._emit('BACKOFF_STARTED', {
      stationId: this.id,
      attempt: this.collisionCount,
      k: backoff.k,
      slotChosen: backoff.slotChosen,
      waitTicks: backoff.waitTicks,
      slotTime,
      tick: currentTick,
    });

    // Schedule backoff expiration
    this.backoffExpiredEventId = this.engine.scheduleEvent(
      currentTick + backoff.waitTicks,
      () => {
        this._handleBackoffExpired();
      },
      {
        type: 'STATION_BACKOFF_EXPIRED',
        payload: { stationId: this.id },
      }
    );
  }

  /**
   * Handler when backoff delay timer expires.
   * @private
   */
  _handleBackoffExpired() {
    this.backoffExpiredEventId = null;
    if (this.state !== StationState.BACKING_OFF) {
      return;
    }

    this._emit('BACKOFF_EXPIRED', {
      stationId: this.id,
      attempt: this.collisionCount,
      tick: this.engine.getCurrentTick(),
    });

    // Re-enter sensing procedure for retry
    this._performCarrierSense();
  }

  /**
   * Internal hook when any signal wavefront reaches this station.
   * @private
   */
  _handleSignalArrival(signal, bus) {
    // If we were deferring in 1-persistent mode, ensure polling is active
    if (this.state === StationState.SENSING) {
      this._pollUntilIdle();
    }
  }

  /**
   * Internal hook when any signal tail departs this station.
   * @private
   */
  _handleSignalDeparture(signal, bus) {
    // If a clean DATA frame arrives for this station, mark as received
    if (
      signal.type === SignalType.DATA &&
      !signal.aborted &&
      !signal.collided &&
      signal.stationId !== this.id
    ) {
      this.stats.framesReceived++;
      this._emit('FRAME_RECEIVED', {
        stationId: this.id,
        sourceStationId: signal.stationId,
        frame: signal.frame,
        tick: this.engine.getCurrentTick(),
      });
    }

    // If channel just became idle and we were deferring, re-check carrier sense
    if (this.state === StationState.SENSING && !this.bus.isMediumBusyAt(this.id)) {
      this._startTransmission();
    }
  }

  /**
   * Emit an event to registered telemetry callback.
   * @private
   */
  _emit(type, data) {
    if (typeof this.onEvent === 'function') {
      this.onEvent(type, data);
    }
  }

  /**
   * Reset station state for fresh simulation run.
   */
  reset() {
    this.state = StationState.IDLE;
    this.collisionCount = 0;
    this.currentFrame = null;
    this.currentSignal = null;
    this.lastBackoff = null;
    this.txCompleteEventId = null;
    this.jamCompleteEventId = null;
    this.backoffExpiredEventId = null;
    this.sensePollingEventId = null;
    this.deterministicSlots = [];
    this.stats = {
      framesQueued: 0,
      transmissionAttempts: 0,
      framesDelivered: 0,
      framesReceived: 0,
      collisionsDetected: 0,
      abortedTransmissions: 0,
      jamSignalsEmitted: 0,
      jamBitsEmitted: 0,
      totalBackoffTicks: 0,
      excessiveCollisionDrops: 0,
    };
  }
}
