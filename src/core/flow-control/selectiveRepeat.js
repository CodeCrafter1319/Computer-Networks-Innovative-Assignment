/**
 * selectiveRepeat.js
 * 
 * Selective Repeat ARQ Protocol Implementation.
 * 
 * Characteristics:
 * - Modulo arithmetic: M = 2^m
 * - Window constraints: Ws <= 2^(m - 1), Wr <= 2^(m - 1)
 *   (Strictly prevents overlap between current and previous receiver windows)
 * - Independent retransmission timers for each outstanding frame
 * - Selective ACKs: ACK(seq) specifically confirms receipt of frame seq
 * - Receiver out-of-order buffering: frames within [Rf, Rf + Wr) are buffered
 * - Cumulative delivery to upper layer once base frame arrives
 * - Re-acknowledges frames in previous window [Rf - Wr, Rf) to resolve lost ACKs
 * - Retransmits ONLY the individual timed-out frame (selective retransmission)
 */

import { FrameType, createFrame } from '../frame/FrameContract.js';
import { seqDistance, seqAdvance, isWithinWindow, mod, validateWindowSize } from './sequenceMath.js';

export class SelectiveRepeatARQ {
  /**
   * @param {import('../engine/SimulationEngine.js').SimulationEngine} engine
   * @param {import('../engine/Channel.js').Channel} forwardChannel - Sender to Receiver (DATA)
   * @param {import('../engine/Channel.js').Channel} reverseChannel - Receiver to Sender (ACK)
   * @param {Object} [options={}]
   * @param {number} [options.m=3] - Sequence number width in bits
   * @param {number} [options.windowSize=4] - Sender window size Ws <= 2^(m - 1)
   * @param {number} [options.rxWindowSize] - Receiver window size Wr <= 2^(m - 1) (defaults to windowSize)
   * @param {number} [options.timeoutDuration=16] - Virtual ticks before timeout
   * @param {Function} [options.onEvent=null] - Callback: (eventType, data) => void
   */
  constructor(engine, forwardChannel, reverseChannel, options = {}) {
    if (!engine || !forwardChannel || !reverseChannel) {
      throw new Error('SelectiveRepeatARQ requires engine, forwardChannel, and reverseChannel.');
    }

    this.engine = engine;
    this.forwardChannel = forwardChannel;
    this.reverseChannel = reverseChannel;

    this.m = options.m ?? 3;
    this.M = 1 << this.m;
    this.timeoutDuration = options.timeoutDuration ?? 16;
    this.onEvent = options.onEvent || null;

    const maxAllowed = 1 << (this.m - 1);
    const requestedWindow = options.windowSize ?? Math.min(4, maxAllowed);
    const validation = validateWindowSize('SR', requestedWindow, this.m);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    this.windowSize = requestedWindow;
    this.rxWindowSize = options.rxWindowSize ?? this.windowSize;

    if (this.windowSize + this.rxWindowSize > this.M) {
      throw new Error(
        `Invalid window configuration: Ws (${this.windowSize}) + Wr (${this.rxWindowSize}) > 2^m (${this.M}). ` +
        `This violates theoretical bounds and causes receiver window ambiguity.`
      );
    }

    // Sender State
    this.base = 0;       // Sf: sequence number of oldest unacknowledged frame
    this.nextSeq = 0;    // Sn: sequence number to assign next
    this.buffer = new Map(); // seq -> { frame, acked: boolean, timerEventId: number|null, sentTick: number }

    // Receiver State
    this.rxBase = 0;     // Rf: sequence number of lowest unreceived frame
    this.rxBuffer = new Map(); // seq -> { frame, payload, tick }
    this.deliveredPayloads = [];

    // Telemetry Statistics
    this.stats = {
      totalTransmissions: 0,
      initialTransmissions: 0,
      retransmissions: 0,
      acksSent: 0,
      acksReceived: 0,
      framesDelivered: 0,
      timeouts: 0,
      corruptedReceived: 0,
      duplicatesDiscarded: 0,
      outOfOrderBuffered: 0,
    };
  }

  /**
   * Check if sender window has room for another frame.
   * 
   * @returns {boolean}
   */
  canSend() {
    return seqDistance(this.base, this.nextSeq, this.m) < this.windowSize;
  }

  /**
   * Current number of outstanding frames in the sender window.
   * 
   * @returns {number}
   */
  getOutstandingCount() {
    return seqDistance(this.base, this.nextSeq, this.m);
  }

  /**
   * Submit and send a new upper-layer payload.
   * 
   * @param {string|Uint8Array} payload 
   * @returns {{ success: boolean, frame?: Object, reason?: string }}
   */
  send(payload) {
    if (!this.canSend()) {
      return { success: false, reason: 'WINDOW_FULL' };
    }

    const currentTick = this.engine.getCurrentTick();
    const seq = this.nextSeq;

    const frame = createFrame({
      type: FrameType.DATA,
      seq,
      payload,
      sentTick: currentTick,
      attempt: 1,
    });

    // Schedule independent timer for this specific sequence number
    const timerEventId = this.engine.scheduleRelative(
      this.timeoutDuration,
      () => {
        this._handleFrameTimeout(seq);
      },
      {
        type: 'TIMEOUT',
        payload: { seq },
      }
    );

    this.buffer.set(seq, {
      frame,
      acked: false,
      timerEventId,
      sentTick: currentTick,
    });

    // Advance nextSeq
    this.nextSeq = seqAdvance(this.nextSeq, 1, this.m);

    this.stats.initialTransmissions++;
    this.stats.totalTransmissions++;

    // Transmit over forward channel
    this.forwardChannel.transmit(frame, (deliveredFrame, record) => {
      this._handleFrameArrivalAtReceiver(deliveredFrame, record);
    });

    this._emitEvent('FRAME_SENT', {
      frame,
      attempt: 1,
      base: this.base,
      nextSeq: this.nextSeq,
      tick: currentTick,
    });

    return { success: true, frame };
  }

  /**
   * Handler for individual frame timeout. Retransmits ONLY this frame.
   * @private
   */
  _handleFrameTimeout(seq) {
    const entry = this.buffer.get(seq);
    if (!entry || entry.acked) {
      return;
    }

    const currentTick = this.engine.getCurrentTick();
    this.stats.timeouts++;
    this.stats.retransmissions++;
    this.stats.totalTransmissions++;

    entry.frame.attempt++;
    entry.frame.sentTick = currentTick;

    this._emitEvent('TIMEOUT', {
      seq,
      attempt: entry.frame.attempt,
      tick: currentTick,
    });

    // Reschedule individual timer for this frame
    entry.timerEventId = this.engine.scheduleRelative(
      this.timeoutDuration,
      () => {
        this._handleFrameTimeout(seq);
      },
      {
        type: 'TIMEOUT',
        payload: { seq },
      }
    );

    // Retransmit ONLY this specific frame
    const frameToResend = entry.frame;
    this.forwardChannel.transmit(frameToResend, (deliveredFrame, record) => {
      this._handleFrameArrivalAtReceiver(deliveredFrame, record);
    });

    this._emitEvent('FRAME_SENT', {
      frame: frameToResend,
      attempt: frameToResend.attempt,
      retransmission: true,
      tick: currentTick,
    });
  }

  /**
   * Receiver-side frame arrival logic.
   * Buffers out-of-order frames, sends individual selective ACKs, and slides window.
   * @private
   */
  _handleFrameArrivalAtReceiver(frame, record) {
    const currentTick = this.engine.getCurrentTick();

    if (frame.corrupted) {
      this.stats.corruptedReceived++;
      this._emitEvent('FRAME_CORRUPTED', { frame, tick: currentTick });
      return;
    }

    const seq = frame.seq;

    // Check Case 1: seq is in current receiver window [Rf, Rf + Wr)
    if (isWithinWindow(seq, this.rxBase, this.rxWindowSize, this.m)) {
      // Send selective ACK for this frame
      this._sendSelectiveAck(seq);

      if (seq === this.rxBase) {
        // Base frame arrived! Deliver to upper layer
        this.deliveredPayloads.push({
          seq,
          payload: frame.payload,
          payloadText: frame.payloadText,
          tick: currentTick,
        });
        this.stats.framesDelivered++;

        this._emitEvent('FRAME_DELIVERED', {
          frame,
          rxBase: this.rxBase,
          tick: currentTick,
        });

        // Advance rxBase
        this.rxBase = seqAdvance(this.rxBase, 1, this.m);

        // Deliver consecutive buffered frames starting from new rxBase
        while (this.rxBuffer.has(this.rxBase)) {
          const buf = this.rxBuffer.get(this.rxBase);
          this.deliveredPayloads.push({
            seq: this.rxBase,
            payload: buf.payload,
            payloadText: buf.payloadText,
            tick: currentTick,
          });
          this.stats.framesDelivered++;
          this.rxBuffer.delete(this.rxBase);

          this._emitEvent('BUFFERED_FRAME_DELIVERED', {
            seq: this.rxBase,
            tick: currentTick,
          });

          this.rxBase = seqAdvance(this.rxBase, 1, this.m);
        }

        this._emitEvent('RX_WINDOW_SLID', {
          rxBase: this.rxBase,
          tick: currentTick,
        });
      } else {
        // Out-of-order frame inside current window: buffer it
        if (!this.rxBuffer.has(seq)) {
          this.rxBuffer.set(seq, {
            frame,
            payload: frame.payload,
            payloadText: frame.payloadText,
            tick: currentTick,
          });
          this.stats.outOfOrderBuffered++;

          this._emitEvent('FRAME_BUFFERED', {
            seq,
            rxBase: this.rxBase,
            tick: currentTick,
          });
        }
      }
      return;
    }

    // Check Case 2: seq is in previous receiver window [Rf - Wr, Rf)
    const prevBase = mod(this.rxBase - this.rxWindowSize, this.M);
    if (isWithinWindow(seq, prevBase, this.rxWindowSize, this.m)) {
      // Frame was already delivered, but sender retransmitted it (e.g. earlier ACK was lost).
      // MUST re-ACK so sender can advance and stop timing out!
      this.stats.duplicatesDiscarded++;
      this._emitEvent('DUPLICATE_DISCARDED', {
        seq,
        rxBase: this.rxBase,
        prevBase,
        tick: currentTick,
      });

      this._sendSelectiveAck(seq);
      return;
    }

    // Case 3: Outside both windows: ignore
    this._emitEvent('FRAME_IGNORED', {
      seq,
      rxBase: this.rxBase,
      tick: currentTick,
    });
  }

  /**
   * Receiver transmits selective ACK back to sender.
   * @private
   */
  _sendSelectiveAck(seq) {
    const currentTick = this.engine.getCurrentTick();
    const ackFrame = createFrame({
      type: FrameType.ACK,
      ack: seq,
      sentTick: currentTick,
    });

    this.stats.acksSent++;
    this._emitEvent('ACK_SENT', { ackFrame, ackedSeq: seq, tick: currentTick });

    this.reverseChannel.transmit(ackFrame, (deliveredAck, record) => {
      this._handleAckArrivalAtSender(deliveredAck, record);
    });
  }

  /**
   * Sender-side selective ACK arrival logic.
   * Cancels timer for specific frame, marks acked, and slides sender base if applicable.
   * @private
   */
  _handleAckArrivalAtSender(ackFrame, record) {
    const currentTick = this.engine.getCurrentTick();

    if (ackFrame.corrupted) {
      this.stats.corruptedReceived++;
      this._emitEvent('ACK_CORRUPTED', { ackFrame, tick: currentTick });
      return;
    }

    const ackedSeq = ackFrame.ack;
    const dist = seqDistance(this.base, ackedSeq, this.m);
    const outstanding = this.getOutstandingCount();

    // Check if ackedSeq is within sender window [Sf, Sn)
    if (dist < outstanding && this.buffer.has(ackedSeq)) {
      const entry = this.buffer.get(ackedSeq);

      if (!entry.acked) {
        this.stats.acksReceived++;
        entry.acked = true;

        // Cancel the individual timer for this frame
        if (entry.timerEventId !== null) {
          this.engine.getQueue().cancel(entry.timerEventId);
          entry.timerEventId = null;
        }

        this._emitEvent('ACK_RECEIVED', {
          ackFrame,
          ackedSeq,
          tick: currentTick,
        });

        // If the acknowledged frame is the base frame, slide window forward!
        if (ackedSeq === this.base) {
          const oldBase = this.base;
          while (this.buffer.has(this.base) && this.buffer.get(this.base).acked) {
            this.buffer.delete(this.base);
            this.base = seqAdvance(this.base, 1, this.m);
          }

          this._emitEvent('WINDOW_SLID', {
            oldBase,
            newBase: this.base,
            nextSeq: this.nextSeq,
            tick: currentTick,
          });
        }
      } else {
        // Already acknowledged earlier
        this._emitEvent('DUPLICATE_ACK_RECEIVED', { ackedSeq, tick: currentTick });
      }
    } else {
      // Stale or out-of-window ACK
      this._emitEvent('STALE_ACK_RECEIVED', { ackedSeq, base: this.base, tick: currentTick });
    }
  }

  /**
   * Helper to broadcast simulation events.
   * @private
   */
  _emitEvent(type, data) {
    if (typeof this.onEvent === 'function') {
      try {
        this.onEvent(type, data);
      } catch (err) {
        console.error('Error in onEvent callback:', err);
      }
    }
  }

  /**
   * Get an immutable snapshot of current protocol state.
   * 
   * @returns {Object}
   */
  getState() {
    const outstandingFrames = [];
    let cur = this.base;
    while (cur !== this.nextSeq) {
      const entry = this.buffer.get(cur);
      if (entry) {
        outstandingFrames.push({
          seq: cur,
          acked: entry.acked,
          hasTimer: entry.timerEventId !== null,
          frame: { ...entry.frame },
          sentTick: entry.sentTick,
        });
      }
      cur = seqAdvance(cur, 1, this.m);
    }

    const rxBuffered = [];
    for (const [seq, item] of this.rxBuffer.entries()) {
      rxBuffered.push({
        seq,
        payload: item.payload,
        payloadText: item.payloadText,
        tick: item.tick,
      });
    }

    return {
      protocol: 'SR',
      m: this.m,
      M: this.M,
      windowSize: this.windowSize,
      rxWindowSize: this.rxWindowSize,
      sender: {
        base: this.base,
        nextSeq: this.nextSeq,
        outstandingCount: this.getOutstandingCount(),
        buffer: outstandingFrames,
      },
      receiver: {
        rxBase: this.rxBase,
        base: this.rxBase,
        rxBuffer: rxBuffered,
        deliveredCount: this.deliveredPayloads.length,
        deliveredPayloads: [...this.deliveredPayloads],
      },
      stats: { ...this.stats },
    };
  }
}
