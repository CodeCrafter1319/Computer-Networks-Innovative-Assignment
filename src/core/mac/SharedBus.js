/**
 * SharedBus.js
 * 
 * Physical Shared-Medium Bus Model for CSMA/CD Simulation.
 * 
 * Networking Architecture & Physics:
 * 1. Linear Broadcast Medium:
 *    A shared coaxial cable / bus topology of length L (default: 100 distance units)
 *    terminated at both ends (no signal reflections).
 * 
 * 2. Spatial Propagation & Wavefronts:
 *    Signals travel along the bus at a finite propagation speed v = L / tau_max.
 *    The propagation delay between any two points x1 and x2 is:
 *      tau(x1, x2) = round(|x1 - x2| / L * tau_max)
 *    When a station at position x transmits, energy radiates bilaterally (left & right).
 * 
 * 3. Local Carrier Sensing vs. Global Activity:
 *    A station at position x senses the medium as BUSY at tick t if and only if
 *    the wave from at least one transmission currently covers position x.
 *    Distant transmissions take tau ticks to arrive; before that wavefront arrives,
 *    the station locally observes an IDLE channel. This is the fundamental physical
 *    reason why collisions occur in CSMA/CD despite carrier sensing!
 * 
 * 4. Collision Detection (Energy Anomaly):
 *    A transmitting station monitors the bus simultaneously with transmission.
 *    If an incoming foreign signal or collision wavefront arrives at the station's tap
 *    while the station is actively transmitting, a collision is detected!
 */

export const SignalType = Object.freeze({
  DATA: 'DATA',
  JAM: 'JAM',
});

export const BusCollisionState = Object.freeze({
  CLEAR: 'CLEAR',
  BUSY: 'BUSY',
  COLLISION: 'COLLISION',
});

let _globalSignalCounter = 0;

export function resetSignalIdCounter() {
  _globalSignalCounter = 0;
}

export class SharedBus {
  /**
   * @param {import('../engine/SimulationEngine.js').SimulationEngine} engine
   * @param {Object} [options={}]
   * @param {number} [options.busLength=100] - Total length of the bus in arbitrary spatial units
   * @param {number} [options.maxPropagationDelay=10] - End-to-end one-way propagation delay (tau_max) in virtual ticks
   */
  constructor(engine, options = {}) {
    if (!engine) {
      throw new Error('SharedBus requires an active SimulationEngine instance.');
    }

    this.engine = engine;
    this.busLength = options.busLength ?? 100;
    this.maxPropagationDelay = options.maxPropagationDelay ?? 10;

    // Registered stations: Map<stationId, StationInfo>
    this.stations = new Map();

    // Active signals currently in flight or propagating on the bus
    this.activeSignals = [];

    // Historical signal records for telemetry & auditing
    this.history = [];
    this.maxHistorySize = 500;

    // Recorded collision points: Array<{ tick, position, signalIds, stationIds }>
    this.collisions = [];

    // Total virtual ticks during which at least one signal was on the bus
    this._mediumBusyTicks = 0;
    this._lastBusyEvaluationTick = -1;
  }

  /**
   * Register a station onto the bus.
   * 
   * @param {Object} station
   * @param {string} station.id - Unique station identifier (e.g., 'A', 'B')
   * @param {string} [station.name] - Display name
   * @param {number} station.position - Coordinate along the bus [0, busLength]
   * @param {Function} [station.onSignalArrival] - (signal, bus) => void
   * @param {Function} [station.onSignalDeparture] - (signal, bus) => void
   * @param {Function} [station.onCollisionDetected] - (localSignal, incomingSignal, bus) => void
   */
  registerStation(station) {
    if (!station || !station.id) {
      throw new Error('Station must have a valid id.');
    }
    const pos = Math.max(0, Math.min(this.busLength, station.position ?? 0));
    this.stations.set(station.id, {
      ...station,
      position: pos,
    });
  }

  /**
   * Calculate propagation delay between two spatial coordinates along the bus.
   * 
   * @param {number} x1 - Position 1 [0, busLength]
   * @param {number} x2 - Position 2 [0, busLength]
   * @returns {number} Propagation delay in virtual ticks (integer >= 0)
   */
  getPropagationDelay(x1, x2) {
    if (x1 === x2) return 0;
    const distance = Math.abs(x1 - x2);
    const delay = Math.round((distance / this.busLength) * this.maxPropagationDelay);
    // Any non-zero spatial separation takes at least 1 virtual tick
    return Math.max(1, delay);
  }

  /**
   * Get the maximum round-trip propagation delay (Slot Time 2*tau).
   * 
   * @returns {number} 2 * tau_max in virtual ticks
   */
  getSlotTime() {
    return 2 * this.maxPropagationDelay;
  }

  /**
   * Transmit a signal onto the shared bus from a station.
   * 
   * @param {Object} params
   * @param {string} params.stationId - Identifier of transmitting station
   * @param {string} [params.type=SignalType.DATA] - 'DATA' | 'JAM'
   * @param {number} params.duration - Duration of transmission in virtual ticks
   * @param {Object} [params.frame=null] - Logical frame object being transmitted
   * @returns {Object} Transmitted signal record
   */
  transmitSignal({ stationId, type = SignalType.DATA, duration, frame = null }) {
    const station = this.stations.get(stationId);
    if (!station) {
      throw new Error(`Station '${stationId}' is not registered on this bus.`);
    }

    if (typeof duration !== 'number' || duration <= 0) {
      throw new Error(`Signal duration must be a positive number. Received: ${duration}`);
    }

    const currentTick = this.engine.getCurrentTick();
    const signalId = ++_globalSignalCounter;

    const signal = {
      id: signalId,
      stationId,
      stationName: station.name || stationId,
      sourcePosition: station.position,
      type,
      startTick: currentTick,
      endTick: currentTick + duration,
      duration,
      frame: frame ? structuredClone(frame) : null,
      aborted: false,
      abortTick: null,
      collided: false,
      collisionTicks: [],
      // Map of stationId -> { arrivalTick, departureTick, delivered: boolean }
      stationTimeline: new Map(),
    };

    this.activeSignals.push(signal);
    this._recordHistory(signal);

    // Schedule signal arrival and departure events for all stations
    for (const [targetId, targetStation] of this.stations.entries()) {
      const propDelay = this.getPropagationDelay(station.position, targetStation.position);
      const arrivalTick = currentTick + propDelay;
      const departureTick = currentTick + duration + propDelay;

      signal.stationTimeline.set(targetId, {
        arrivalTick,
        departureTick,
        delivered: false,
      });

      // 1. Schedule Arrival Event at targetStation
      this.engine.scheduleEvent(
        arrivalTick,
        () => {
          this._handleSignalArrivalAtStation(signal, targetStation);
        },
        {
          type: 'BUS_SIGNAL_ARRIVAL',
          payload: { signalId, sourceStationId: stationId, targetStationId: targetId },
        }
      );

      // 2. Schedule Departure Event at targetStation
      this.engine.scheduleEvent(
        departureTick,
        () => {
          this._handleSignalDepartureAtStation(signal, targetStation);
        },
        {
          type: 'BUS_SIGNAL_DEPARTURE',
          payload: { signalId, sourceStationId: stationId, targetStationId: targetId },
        }
      );
    }

    return signal;
  }

  /**
   * Abort an active signal transmission immediately (e.g. upon collision detection).
   * 
   * @param {number} signalId
   * @returns {boolean} True if successfully aborted
   */
  abortSignal(signalId) {
    const signal = this.activeSignals.find(s => s.id === signalId);
    if (!signal || signal.aborted) {
      return false;
    }

    const currentTick = this.engine.getCurrentTick();
    signal.aborted = true;
    signal.abortTick = currentTick;
    signal.endTick = currentTick;
    signal.duration = currentTick - signal.startTick;

    // Recalculate departure times for all stations based on the truncated endTick
    for (const [targetId, targetStation] of this.stations.entries()) {
      const propDelay = this.getPropagationDelay(signal.sourcePosition, targetStation.position);
      const timeline = signal.stationTimeline.get(targetId);
      if (timeline) {
        timeline.departureTick = currentTick + propDelay;
      }
    }

    return true;
  }

  /**
   * Internal handler when a signal wavefront arrives at a station tap.
   * @private
   */
  _handleSignalArrivalAtStation(signal, station) {
    const currentTick = this.engine.getCurrentTick();

    // Check if the station itself is currently transmitting a signal
    const localActiveSignal = this.activeSignals.find(
      s => s.stationId === station.id && !s.aborted && currentTick < s.endTick
    );

    if (localActiveSignal && localActiveSignal.id !== signal.id) {
      // COLLISION DETECTED!
      // The station is transmitting while a foreign signal arrives at its tap.
      localActiveSignal.collided = true;
      signal.collided = true;
      localActiveSignal.collisionTicks.push(currentTick);
      signal.collisionTicks.push(currentTick);

      this.collisions.push({
        tick: currentTick,
        position: station.position,
        stationId: station.id,
        signalIds: [localActiveSignal.id, signal.id],
      });

      if (typeof station.onCollisionDetected === 'function') {
        station.onCollisionDetected(localActiveSignal, signal, this);
      }
    }

    if (typeof station.onSignalArrival === 'function') {
      station.onSignalArrival(signal, this);
    }
  }

  /**
   * Internal handler when a signal tail finishes passing a station tap.
   * @private
   */
  _handleSignalDepartureAtStation(signal, station) {
    const timeline = signal.stationTimeline.get(station.id);
    if (timeline) {
      // A frame is successfully delivered to this station only if:
      // 1. It is a DATA frame
      // 2. It was not aborted
      // 3. It did not collide
      // 4. It was sent to this station (or broadcast)
      if (
        signal.type === SignalType.DATA &&
        !signal.aborted &&
        !signal.collided &&
        signal.stationId !== station.id
      ) {
        timeline.delivered = true;
      }
    }

    if (typeof station.onSignalDeparture === 'function') {
      station.onSignalDeparture(signal, this);
    }

    // Clean up finished signals from active list when all departures have passed
    this._cleanupFinishedSignals();
  }

  /**
   * Remove signals whose tails have completely cleared all ends of the bus.
   * @private
   */
  _cleanupFinishedSignals() {
    const currentTick = this.engine.getCurrentTick();
    this.activeSignals = this.activeSignals.filter(s => {
      // Maximum time a signal can exist anywhere on the bus is endTick + maxPropagationDelay
      const latestPossibleTick = s.endTick + this.maxPropagationDelay;
      return currentTick <= latestPossibleTick;
    });
  }

  /**
   * Check if a specific station perceives the transmission medium as BUSY.
   * 
   * @param {string} stationId
   * @param {number|null} [tick=null]
   * @returns {boolean} True if medium has active signal energy at this station
   */
  isMediumBusyAt(stationId, tick = null) {
    const station = this.stations.get(stationId);
    if (!station) return false;

    const t = tick ?? this.engine.getCurrentTick();

    // The medium is busy at station coordinate if at least one active signal's
    // wave energy covers this coordinate at time t
    for (const signal of this.activeSignals) {
      const propDelay = this.getPropagationDelay(signal.sourcePosition, station.position);
      const arrivalTick = signal.startTick + propDelay;
      const departureTick = signal.endTick + propDelay;

      if (t >= arrivalTick && t < departureTick) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all active signals covering a station tap at the specified tick.
   * 
   * @param {string} stationId
   * @param {number|null} [tick=null]
   * @returns {Array<Object>}
   */
  getSignalsAtStation(stationId, tick = null) {
    const station = this.stations.get(stationId);
    if (!station) return [];

    const t = tick ?? this.engine.getCurrentTick();
    const covering = [];

    for (const signal of this.activeSignals) {
      const propDelay = this.getPropagationDelay(signal.sourcePosition, station.position);
      const arrivalTick = signal.startTick + propDelay;
      const departureTick = signal.endTick + propDelay;

      if (t >= arrivalTick && t < departureTick) {
        covering.push(signal);
      }
    }
    return covering;
  }

  /**
   * Check if any signal is active anywhere on the bus.
   * 
   * @param {number|null} [tick=null]
   * @returns {boolean}
   */
  isBusGloballyBusy(tick = null) {
    const t = tick ?? this.engine.getCurrentTick();
    for (const s of this.activeSignals) {
      const latestTick = s.endTick + this.maxPropagationDelay;
      if (t >= s.startTick && t < latestTick) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get visual spatial wavefronts for rendering on UI canvas/rail.
   * Returns each active signal's left and right propagation boundaries [leftX, rightX].
   * 
   * @param {number|null} [tick=null]
   * @returns {Array<Object>} Wavefront representations for UI
   */
  getWavefronts(tick = null) {
    const t = tick ?? this.engine.getCurrentTick();
    const v = this.busLength / Math.max(1, this.maxPropagationDelay);
    const wavefronts = [];

    for (const signal of this.activeSignals) {
      const elapsedHead = t - signal.startTick;
      if (elapsedHead < 0) continue;

      const headDistance = elapsedHead * v;
      const headLeft = Math.max(0, signal.sourcePosition - headDistance);
      const headRight = Math.min(this.busLength, signal.sourcePosition + headDistance);

      let tailLeft = signal.sourcePosition;
      let tailRight = signal.sourcePosition;

      const elapsedTail = t - signal.endTick;
      if (elapsedTail > 0) {
        const tailDistance = elapsedTail * v;
        tailLeft = Math.max(0, signal.sourcePosition - tailDistance);
        tailRight = Math.min(this.busLength, signal.sourcePosition + tailDistance);
      }

      wavefronts.push({
        signalId: signal.id,
        stationId: signal.stationId,
        stationName: signal.stationName,
        type: signal.type,
        sourcePosition: signal.sourcePosition,
        collided: signal.collided,
        aborted: signal.aborted,
        // Left propagating segment: [headLeft, tailLeft]
        leftSegment: [headLeft, tailLeft],
        // Right propagating segment: [tailRight, headRight]
        rightSegment: [tailRight, headRight],
      });
    }

    return wavefronts;
  }

  /**
   * Record a signal in history.
   * @private
   */
  _recordHistory(signal) {
    this.history.push(signal);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Reset bus state for a fresh simulation run.
   */
  reset() {
    this.activeSignals = [];
    this.history = [];
    this.collisions = [];
    this._mediumBusyTicks = 0;
    this._lastBusyEvaluationTick = -1;
  }
}
