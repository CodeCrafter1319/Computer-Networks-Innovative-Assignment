/**
 * FlowControlSimulator.js
 * 
 * Unified coordinator and facade for Data Link Layer Flow Control protocols.
 * Bundles SimulationEngine, forward & reverse Channels, protocol state machine,
 * event logging, in-flight frame inspection, and theoretical performance metrics.
 */

import { SimulationEngine } from '../engine/SimulationEngine.js';
import { Channel, TransmissionOutcome } from '../engine/Channel.js';
import { StopAndWaitARQ } from './stopAndWait.js';
import { GoBackNARQ } from './goBackN.js';
import { SelectiveRepeatARQ } from './selectiveRepeat.js';
import { validateWindowSize } from './sequenceMath.js';

export const FlowControlProtocol = Object.freeze({
  STOP_AND_WAIT: 'SW',
  GO_BACK_N: 'GBN',
  SELECTIVE_REPEAT: 'SR',
});

export class FlowControlSimulator {
  /**
   * @param {Object} [config={}]
   * @param {string} [config.protocol='GBN'] - 'SW' | 'GBN' | 'SR'
   * @param {number} [config.m=3] - Sequence number bit width (M = 2^m)
   * @param {number} [config.windowSize=4] - Sender window size
   * @param {number} [config.rxWindowSize] - Receiver window size (SR only)
   * @param {number} [config.propagationDelay=5] - Base propagation delay in virtual ticks
   * @param {number} [config.timeoutDuration=16] - Virtual ticks before frame retransmission
   * @param {number} [config.transmissionDelay=1] - Virtual ticks per frame serialization
   */
  constructor(config = {}) {
    this.config = {
      protocol: config.protocol || FlowControlProtocol.GO_BACK_N,
      m: config.m ?? 3,
      windowSize: config.windowSize ?? 4,
      rxWindowSize: config.rxWindowSize ?? 4,
      propagationDelay: config.propagationDelay ?? 5,
      timeoutDuration: config.timeoutDuration ?? 16,
      transmissionDelay: config.transmissionDelay ?? 1,
    };

    this.engine = new SimulationEngine();
    this.forwardChannel = new Channel(this.engine, {
      propagationDelay: this.config.propagationDelay,
      name: 'Forward (Data)',
    });
    this.reverseChannel = new Channel(this.engine, {
      propagationDelay: this.config.propagationDelay,
      name: 'Reverse (ACK)',
    });

    this.eventLogs = [];
    this.maxLogs = 300;

    this._initProtocol();
  }

  /**
   * Initialize or re-initialize the active protocol instance.
   * @private
   */
  _initProtocol() {
    const onEvent = (type, data) => this._logEvent(type, data);

    const p = this.config.protocol.toUpperCase();
    if (p === 'SW' || p === 'STOP_AND_WAIT') {
      this.protocolInstance = new StopAndWaitARQ(
        this.engine,
        this.forwardChannel,
        this.reverseChannel,
        {
          timeoutDuration: this.config.timeoutDuration,
          onEvent,
        }
      );
      this.config.m = 1;
      this.config.windowSize = 1;
    } else if (p === 'GBN' || p === 'GO_BACK_N') {
      this.protocolInstance = new GoBackNARQ(
        this.engine,
        this.forwardChannel,
        this.reverseChannel,
        {
          m: this.config.m,
          windowSize: this.config.windowSize,
          timeoutDuration: this.config.timeoutDuration,
          onEvent,
        }
      );
    } else if (p === 'SR' || p === 'SELECTIVE_REPEAT') {
      this.protocolInstance = new SelectiveRepeatARQ(
        this.engine,
        this.forwardChannel,
        this.reverseChannel,
        {
          m: this.config.m,
          windowSize: this.config.windowSize,
          rxWindowSize: this.config.rxWindowSize,
          timeoutDuration: this.config.timeoutDuration,
          onEvent,
        }
      );
    } else {
      throw new Error(`Unsupported protocol: ${this.config.protocol}`);
    }
  }

  /**
   * Log an event into internal trace log.
   * @private
   */
  _logEvent(type, data) {
    const entry = {
      id: this.eventLogs.length + 1,
      tick: this.engine.getCurrentTick(),
      type,
      data,
      timestamp: Date.now(),
    };
    this.eventLogs.push(entry);
    if (this.eventLogs.length > this.maxLogs) {
      this.eventLogs.shift();
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
    this.forwardChannel.clearHistory();
    this.forwardChannel.clearFaultPlan();
    this.forwardChannel.setPropagationDelay(this.config.propagationDelay);
    this.reverseChannel.clearHistory();
    this.reverseChannel.clearFaultPlan();
    this.reverseChannel.setPropagationDelay(this.config.propagationDelay);
    this.eventLogs = [];
    this._initProtocol();
  }

  /**
   * Attempt to submit and transmit an upper-layer payload.
   * 
   * @param {string|Uint8Array} payload 
   * @returns {{ success: boolean, frame?: Object, reason?: string }}
   */
  send(payload) {
    return this.protocolInstance.send(payload);
  }

  /**
   * Submit a batch of payloads (e.g. 5 sequential frames).
   * 
   * @param {number} count 
   * @param {string} [prefix='Frame'] 
   * @returns {Array<Object>} Successfully transmitted frames
   */
  sendBatch(count, prefix = 'Frame') {
    const sent = [];
    for (let i = 0; i < count; i++) {
      if (!this.protocolInstance.canSend()) {
        break;
      }
      const res = this.protocolInstance.send(`${prefix} #${i}`);
      if (res.success) {
        sent.push(res.frame);
      }
    }
    return sent;
  }

  /**
   * Advance the simulation by executing exactly 1 scheduled event.
   * 
   * @returns {Object|null} Executed event or null if queue empty
   */
  stepEvent() {
    return this.engine.step();
  }

  /**
   * Advance the virtual clock by advancing exactly 1 tick.
   * Executes all events scheduled up to this tick, then advances clock.
   * 
   * @returns {number} New virtual tick
   */
  stepTick() {
    const nextTick = this.engine.getCurrentTick() + 1;
    this.engine.runUntil(nextTick);
    return this.engine.getCurrentTick();
  }

  /**
   * Advance virtual clock by N ticks.
   * 
   * @param {number} n 
   */
  stepTicks(n = 1) {
    for (let i = 0; i < n; i++) {
      this.stepTick();
    }
    return this.engine.getCurrentTick();
  }

  /**
   * Run simulation until predicate function returns true or maxTicks is reached.
   * 
   * @param {Function} predicate - (simulator) => boolean
   * @param {number} [maxTicks=100]
   * @returns {boolean} True if predicate satisfied
   */
  runUntil(predicate, maxTicks = 100) {
    const startTick = this.engine.getCurrentTick();
    while (this.engine.getCurrentTick() - startTick < maxTicks) {
      if (predicate(this)) {
        return true;
      }
      if (this.engine.getQueue().isEmpty()) {
        // Nothing scheduled; advance clock
        this.stepTick();
      } else {
        this.engine.step();
      }
    }
    return predicate(this);
  }

  /**
   * Interactively drop a frame that is currently in-flight in a channel.
   * Finds the scheduled event in the engine queue and cancels it.
   * 
   * @param {number} eventId - Engine event ID
   * @returns {boolean} True if dropped
   */
  dropInFlight(eventId) {
    const cancelled = this.engine.getQueue().cancel(eventId);
    if (cancelled) {
      this._logEvent('FRAME_DROPPED_INTERACTIVE', { eventId, tick: this.engine.getCurrentTick() });
      this.protocolInstance.stats.duplicatesDiscarded = this.protocolInstance.stats.duplicatesDiscarded || 0;
    }
    return cancelled;
  }

  /**
   * Interactively corrupt an in-flight frame by flipping bits or mutating payload.
   * 
   * @param {number} eventId - Engine event ID
   * @returns {boolean} True if corrupted
   */
  corruptInFlight(eventId) {
    const queue = this.engine.getQueue();
    // Inspect event queue to locate target event
    const event = queue.toArray().find(e => e.id === eventId);
    if (event && event.payload) {
      const transmissionId = event.payload.transmissionId;
      // Search channel history for this transmission record
      const fwdRecord = this.forwardChannel.getHistory().find(r => r.transmissionId === transmissionId);
      if (fwdRecord && fwdRecord.transmittedFrame) {
        fwdRecord.transmittedFrame.corrupted = true;
        if (typeof fwdRecord.transmittedFrame.payload === 'string') {
          fwdRecord.transmittedFrame.payload += ' [CORRUPTED]';
        }
        this._logEvent('FRAME_CORRUPTED_INTERACTIVE', { eventId, transmissionId, tick: this.engine.getCurrentTick() });
        return true;
      }
      const revRecord = this.reverseChannel.getHistory().find(r => r.transmissionId === transmissionId);
      if (revRecord && revRecord.transmittedFrame) {
        revRecord.transmittedFrame.corrupted = true;
        this._logEvent('ACK_CORRUPTED_INTERACTIVE', { eventId, transmissionId, tick: this.engine.getCurrentTick() });
        return true;
      }
    }
    return false;
  }

  /**
   * Get all active in-flight frames currently traveling along channels.
   * 
   * @returns {Array<Object>}
   */
  getInFlightFrames() {
    const currentTick = this.engine.getCurrentTick();
    const queueEvents = this.engine.getQueue().toArray();

    const inFlight = [];
    for (const evt of queueEvents) {
      if (evt.type === 'FRAME_DELIVERY' && evt.payload?.transmissionId) {
        const txId = evt.payload.transmissionId;
        const fwdRec = this.forwardChannel.getHistory().find(r => r.transmissionId === txId);
        if (fwdRec && fwdRec.outcome !== TransmissionOutcome.DROPPED) {
          const totalDelay = fwdRec.totalDelay || this.config.propagationDelay;
          const elapsed = currentTick - fwdRec.startTick;
          const progress = Math.min(1, Math.max(0, elapsed / Math.max(1, totalDelay)));
          inFlight.push({
            eventId: evt.id,
            transmissionId: txId,
            direction: 'FORWARD',
            channelName: 'Forward',
            frame: fwdRec.transmittedFrame,
            startTick: fwdRec.startTick,
            deliveryTick: fwdRec.deliveryTick,
            progress,
            corrupted: fwdRec.transmittedFrame.corrupted || false,
          });
          continue;
        }

        const revRec = this.reverseChannel.getHistory().find(r => r.transmissionId === txId);
        if (revRec && revRec.outcome !== TransmissionOutcome.DROPPED) {
          const totalDelay = revRec.totalDelay || this.config.propagationDelay;
          const elapsed = currentTick - revRec.startTick;
          const progress = Math.min(1, Math.max(0, elapsed / Math.max(1, totalDelay)));
          inFlight.push({
            eventId: evt.id,
            transmissionId: txId,
            direction: 'REVERSE',
            channelName: 'Reverse',
            frame: revRec.transmittedFrame,
            startTick: revRec.startTick,
            deliveryTick: revRec.deliveryTick,
            progress,
            corrupted: revRec.transmittedFrame.corrupted || false,
          });
        }
      }
    }
    return inFlight;
  }

  /**
   * Calculate theoretical performance metrics for current configuration.
   * 
   * Formulas:
   * - Propagation time: Tp = propagationDelay
   * - Transmission time: Tt = transmissionDelay (assume frame size / bandwidth = 1)
   * - a = Tp / Tt
   * - Stop-and-Wait efficiency: eta = 1 / (1 + 2*a)
   * - Go-Back-N ideal efficiency: eta = min(1, W / (1 + 2*a))
   * - Selective Repeat ideal efficiency: eta = min(1, W / (1 + 2*a))
   * - Bandwidth-Delay Product (in frames): BDP = 2 * a
   * 
   * @returns {Object} Theoretical performance metrics
   */
  getTheoreticalMetrics() {
    const Tp = this.config.propagationDelay;
    const Tt = Math.max(1, this.config.transmissionDelay);
    const a = Tp / Tt;
    const rtt = 2 * Tp + Tt;
    const W = this.config.windowSize;

    let theoreticalEfficiency = 0;
    if (this.config.protocol === FlowControlProtocol.STOP_AND_WAIT) {
      theoreticalEfficiency = 1 / (1 + 2 * a);
    } else {
      // GBN and SR ideal efficiency without error
      theoreticalEfficiency = Math.min(1, W / (1 + 2 * a));
    }

    const stats = this.protocolInstance.stats;
    const measuredEfficiency = stats.totalTransmissions > 0
      ? (stats.framesDelivered / stats.totalTransmissions)
      : 0;

    const currentTick = this.engine.getCurrentTick();
    const throughput = currentTick > 0
      ? (stats.framesDelivered / currentTick)
      : 0;

    return {
      Tp,
      Tt,
      a: Number(a.toFixed(3)),
      rtt,
      bandwidthDelayProduct: Number((2 * a).toFixed(2)),
      theoreticalEfficiency: Number((theoreticalEfficiency * 100).toFixed(1)),
      measuredEfficiency: Number((measuredEfficiency * 100).toFixed(1)),
      throughput: Number(throughput.toFixed(3)),
      optimalWindowSize: Math.ceil(1 + 2 * a),
    };
  }

  /**
   * Get an immutable, complete snapshot of simulator state for UI rendering.
   * 
   * @returns {Object}
   */
  getSnapshot() {
    return {
      protocol: this.config.protocol,
      config: { ...this.config },
      virtualTick: this.engine.getCurrentTick(),
      protocolState: this.protocolInstance.getState(),
      inFlightFrames: this.getInFlightFrames(),
      eventLogs: [...this.eventLogs],
      metrics: this.getTheoreticalMetrics(),
      queueSize: this.engine.getQueue().size(),
    };
  }
}
