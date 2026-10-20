/**
 * CsmaCdSimulator.js
 * 
 * High-Level Simulation Facade for CSMA/CD Multi-Station Contention.
 * 
 * Coordinates:
 * - SimulationEngine (discrete-event virtual clock)
 * - SharedBus (spatial linear broadcast medium)
 * - 4 CsmaCdStation instances (A, B, C, D)
 * - Deterministic Contention Presets
 * - Comprehensive Telemetry & Educational Metrics
 */

import { SimulationEngine } from '../engine/SimulationEngine.js';
import { SharedBus, resetSignalIdCounter } from './SharedBus.js';
import { CsmaCdStation, StationState, PersistenceMode } from './csmaCd.js';

export const MacPreset = Object.freeze({
  CLEAN_TRANSMISSION: 'CLEAN_TRANSMISSION',
  NEAR_SIMULTANEOUS_COLLISION: 'NEAR_SIMULTANEOUS_COLLISION',
  CARRIER_SENSE_DEFERRAL: 'CARRIER_SENSE_DEFERRAL',
  MULTI_STATION_CONTENTION: 'MULTI_STATION_CONTENTION',
  BACKOFF_RESOLUTION: 'BACKOFF_RESOLUTION',
  EXCESSIVE_COLLISIONS: 'EXCESSIVE_COLLISIONS',
});

export class CsmaCdSimulator {
  /**
   * @param {Object} [config={}]
   * @param {number} [config.busLength=100] - Bus length in spatial units
   * @param {number} [config.maxPropagationDelay=10] - End-to-end tau_max in virtual ticks
   * @param {number} [config.frameTransmissionDuration=30] - Frame serialization time Tt (must be >= 2*tau)
   * @param {number} [config.jamDuration=4] - 32-bit jam duration in ticks
   * @param {string} [config.persistenceMode=PersistenceMode.ONE_PERSISTENT]
   * @param {number} [config.maxRetries=16]
   * @param {Array<Object>} [config.stations] - Custom station placements
   */
  constructor(config = {}) {
    this.config = {
      busLength: config.busLength ?? 100,
      maxPropagationDelay: config.maxPropagationDelay ?? 10,
      frameTransmissionDuration: config.frameTransmissionDuration ?? 30,
      jamDuration: config.jamDuration ?? 4,
      persistenceMode: config.persistenceMode || PersistenceMode.ONE_PERSISTENT,
      maxRetries: config.maxRetries ?? 16,
      maxExponent: config.maxExponent ?? 10,
    };

    this.engine = new SimulationEngine();
    this.bus = new SharedBus(this.engine, {
      busLength: this.config.busLength,
      maxPropagationDelay: this.config.maxPropagationDelay,
    });

    this.stations = new Map();
    this.eventLogs = [];
    this.maxLogs = 300;

    this._initStations(config.stations);
  }

  /**
   * Initialize 4 default stations (A, B, C, D) along the bus.
   * @private
   */
  _initStations(customStations = null) {
    resetSignalIdCounter();
    this.stations.clear();

    const defaultPlacements = [
      { id: 'A', name: 'Station A', position: 0 },
      { id: 'B', name: 'Station B', position: 25 },
      { id: 'C', name: 'Station C', position: 75 },
      { id: 'D', name: 'Station D', position: 100 },
    ];

    const placements = customStations || defaultPlacements;

    for (const p of placements) {
      const station = new CsmaCdStation({
        id: p.id,
        name: p.name,
        position: p.position,
        engine: this.engine,
        bus: this.bus,
        config: this.config,
        onEvent: (type, data) => this._logEvent(type, data),
      });
      this.stations.set(p.id, station);
    }
  }

  /**
   * Reset the simulator with optionally updated configuration.
   * 
   * @param {Object} [newConfig={}]
   */
  reset(newConfig = {}) {
    this.config = { ...this.config, ...newConfig };
    this.engine.reset();
    this.bus.reset();
    this.eventLogs = [];
    this._initStations(newConfig.stations);
  }

  /**
   * Submit a frame for transmission from a specific station.
   * 
   * @param {string} stationId - 'A' | 'B' | 'C' | 'D'
   * @param {string|Object} payload - Data payload
   * @param {string} [destination='BROADCAST']
   * @returns {{ success: boolean, reason?: string }}
   */
  send(stationId, payload, destination = 'BROADCAST') {
    const station = this.stations.get(stationId);
    if (!station) {
      return { success: false, reason: `STATION_NOT_FOUND: ${stationId}` };
    }
    return station.send(payload, destination);
  }

  /**
   * Advance simulation virtual clock by 1 tick.
   * 
   * @returns {number} New virtual tick
   */
  stepTick() {
    const nextTick = this.engine.getCurrentTick() + 1;
    this.engine.runUntil(nextTick);
    return this.engine.getCurrentTick();
  }

  /**
   * Advance simulation virtual clock by N ticks.
   * 
   * @param {number} n
   * @returns {number} New virtual tick
   */
  stepTicks(n = 1) {
    for (let i = 0; i < n; i++) {
      this.stepTick();
    }
    return this.engine.getCurrentTick();
  }

  /**
   * Step a single discrete event from the queue.
   * 
   * @returns {Object}
   */
  stepEvent() {
    return this.engine.step();
  }

  /**
   * Run until predicate returns true or maxTicks is reached.
   * 
   * @param {Function} predicate - (simulator) => boolean
   * @param {number} [maxTicks=200]
   * @returns {boolean}
   */
  runUntil(predicate, maxTicks = 200) {
    const startTick = this.engine.getCurrentTick();
    while (this.engine.getCurrentTick() - startTick < maxTicks) {
      if (predicate(this)) {
        return true;
      }
      if (this.engine.getQueue().isEmpty()) {
        this.stepTick();
      } else {
        this.engine.step();
      }
    }
    return predicate(this);
  }

  /**
   * Load and initialize an educational contention preset.
   * 
   * @param {string} presetName
   */
  loadPreset(presetName) {
    this.reset();

    switch (presetName) {
      case MacPreset.CLEAN_TRANSMISSION: {
        // Station A transmits to D with zero contention
        this.send('A', 'Payload from A to D', 'D');
        break;
      }

      case MacPreset.NEAR_SIMULTANEOUS_COLLISION: {
        // Station A transmits at t = 0
        this.send('A', 'Frame A', 'D');
        // Station D transmits at t = 4 (before A's wave arrives at t = 10)
        this.engine.scheduleEvent(4, () => {
          this.send('D', 'Frame D', 'A');
        }, { type: 'PRESET_TRIGGER', payload: { stationId: 'D' } });
        break;
      }

      case MacPreset.CARRIER_SENSE_DEFERRAL: {
        // Station A transmits at t = 0
        this.send('A', 'Long Frame from A', 'D');
        // Station B wants to transmit at t = 5, when A's signal has already arrived at B (arrival at t = 3)
        // B will sense the medium BUSY and defer until A finishes
        this.engine.scheduleEvent(5, () => {
          this.send('B', 'Deferred Frame from B', 'C');
        }, { type: 'PRESET_TRIGGER', payload: { stationId: 'B' } });
        break;
      }

      case MacPreset.MULTI_STATION_CONTENTION: {
        // Station A transmits at t = 0
        this.send('A', 'Initial Frame from A', 'D');
        // Both Station B and Station C queue frames while A is transmitting
        this.engine.scheduleEvent(10, () => {
          this.send('B', 'Frame B queued during A', 'A');
        }, { type: 'PRESET_TRIGGER', payload: { stationId: 'B' } });

        this.engine.scheduleEvent(15, () => {
          this.send('C', 'Frame C queued during A', 'D');
        }, { type: 'PRESET_TRIGGER', payload: { stationId: 'C' } });
        break;
      }

      case MacPreset.BACKOFF_RESOLUTION: {
        // Configure deterministic backoff: Station A chooses slot 0, Station D chooses slot 1
        const stA = this.stations.get('A');
        const stD = this.stations.get('D');
        if (stA) stA.setDeterministicSlots([0]);
        if (stD) stD.setDeterministicSlots([1]);

        this.send('A', 'Data A', 'D');
        this.engine.scheduleEvent(3, () => {
          this.send('D', 'Data D', 'A');
        }, { type: 'PRESET_TRIGGER', payload: { stationId: 'D' } });
        break;
      }

      case MacPreset.EXCESSIVE_COLLISIONS: {
        // Set maxRetries to 2 for quick demonstration
        this.reset({ maxRetries: 2 });
        const stA = this.stations.get('A');
        const stB = this.stations.get('B');
        // Keep selecting slot 0 so they collide on every retry until maxRetries is exceeded
        if (stA) stA.setDeterministicSlots([0, 0, 0, 0]);
        if (stB) stB.setDeterministicSlots([0, 0, 0, 0]);

        this.send('A', 'Persistent Frame A', 'C');
        this.send('B', 'Persistent Frame B', 'D');
        break;
      }

      default:
        throw new Error(`Unknown MAC preset: ${presetName}`);
    }
  }

  /**
   * Log an event into the simulator's chronological trace.
   * @private
   */
  _logEvent(type, data) {
    const entry = {
      id: this.eventLogs.length + 1,
      type,
      tick: this.engine.getCurrentTick(),
      data,
      timestamp: Date.now(),
    };
    this.eventLogs.unshift(entry);
    if (this.eventLogs.length > this.maxLogs) {
      this.eventLogs.pop();
    }
  }

  /**
   * Compute comprehensive telemetry, statistics, and educational metrics.
   * 
   * @returns {Object} Telemetry report
   */
  getTelemetry() {
    const currentTick = this.engine.getCurrentTick();
    const slotTime = this.bus.getSlotTime();

    let totalQueued = 0;
    let totalAttempts = 0;
    let totalDelivered = 0;
    let totalReceived = 0;
    let totalCollisions = 0;
    let totalAborted = 0;
    let totalJamSignals = 0;
    let totalJamBits = 0;
    let totalBackoffTicks = 0;
    let totalExcessiveDrops = 0;

    const stationReports = [];
    for (const [id, station] of this.stations.entries()) {
      const s = station.stats;
      totalQueued += s.framesQueued;
      totalAttempts += s.transmissionAttempts;
      totalDelivered += s.framesDelivered;
      totalReceived += s.framesReceived;
      totalCollisions += s.collisionsDetected;
      totalAborted += s.abortedTransmissions;
      totalJamSignals += s.jamSignalsEmitted;
      totalJamBits += s.jamBitsEmitted;
      totalBackoffTicks += s.totalBackoffTicks;
      totalExcessiveDrops += s.excessiveCollisionDrops;

      stationReports.push({
        id: station.id,
        name: station.name,
        position: station.position,
        state: station.state,
        collisionCount: station.collisionCount,
        carrierSensed: this.bus.isMediumBusyAt(station.id),
        lastBackoff: station.lastBackoff,
        stats: { ...s },
      });
    }

    // Success Ratio: Delivered unique frames / total transmission attempts
    const successRatio = totalAttempts > 0
      ? Number(((totalDelivered / totalAttempts) * 100).toFixed(1))
      : 100.0;

    // Medium Utilization: Active signal ticks / elapsed ticks
    // Evaluated from bus history
    let mediumBusyTicks = 0;
    for (let t = 0; t < currentTick; t++) {
      if (this.bus.isBusGloballyBusy(t)) {
        mediumBusyTicks++;
      }
    }

    const busUtilization = currentTick > 0
      ? Number(((mediumBusyTicks / currentTick) * 100).toFixed(1))
      : 0.0;

    const goodputFramesPerTick = currentTick > 0
      ? Number((totalDelivered / currentTick).toFixed(3))
      : 0.0;

    return {
      currentTick,
      slotTime,
      tauMax: this.config.maxPropagationDelay,
      busLength: this.config.busLength,
      frameDuration: this.config.frameTransmissionDuration,
      jamDuration: this.config.jamDuration,
      persistenceMode: this.config.persistenceMode,
      maxRetries: this.config.maxRetries,

      // Aggregate Counters
      totalQueued,
      totalAttempts,
      totalDelivered,
      totalReceived,
      totalCollisions,
      totalAborted,
      totalJamSignals,
      totalJamBits,
      totalBackoffTicks,
      totalExcessiveDrops,

      // Performance Metrics
      successRatio,
      busUtilization,
      mediumBusyTicks,
      goodputFramesPerTick,

      // Per-Station Status
      stations: stationReports,
      // Active Bus Collisions
      collisions: [...this.bus.collisions],
      // Active In-Flight Wavefronts for Visualizer
      wavefronts: this.bus.getWavefronts(currentTick),
    };
  }
}
