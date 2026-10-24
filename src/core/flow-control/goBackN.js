/**
 * goBackN.js
 * 
 * Go-Back-N ARQ Protocol Implementation.
 * 
 * Characteristics:
 * - Modulo arithmetic: M = 2^m
 * - Sender window: Ws <= 2^m - 1
 * - Receiver window: Wr = 1 (strictly in-order delivery, no out-of-order buffering)
 * - Single timer: associated with the oldest unacknowledged frame (Sf / base)
 * - Cumulative ACKs: ACK(k) acknowledges all frames up to (k - 1) mod M
 * - On timeout: sender retransmits ALL unacknowledged frames currently in window [Sf, Sn)
 */

import { FrameType, createFrame } from '../frame/FrameContract.js';
import { seqDistance, seqAdvance, validateWindowSize } from './sequenceMath.js';

export class GoBackNARQ {
  /**
   * @param {import('../engine/SimulationEngine.js').SimulationEngine} engine
   * @param {import('../engine/Channel.js').Channel} forwardChannel - Sender to Receiver (DATA)
   * @param {import('../engine/Channel.js').Channel} reverseChannel - Receiver to Sender (ACK)
   * @param {Object} [options={}]
   * @param {number} [options.m=3] - Sequence number width in bits
   * @param {number} [options.windowSize=4] - Sender window size Ws <= 2^m - 1
   * @param {number} [options.timeoutDuration=16] - Virtual ticks before timeout
   * @param {Function} [options.onEvent=null] - Callback: (eventType, data) => void
   */
  constructor(engine, forwardChannel, reverseChannel, options = {}) {
    if (!engine || !forwardChannel || !reverseChannel) {
      throw new Error('GoBackNARQ requires engine, forwardChannel, and reverseChannel.');
    }

    this.engine = engine;
    this.forwardChannel = forwardChannel;
    this.reverseChannel = reverseChannel;

    this.m = options.m ?? 3;
    this.M = 1 << this.m;
    this.timeoutDuration = options.timeoutDuration ?? 16;
    this.onEvent = options.onEvent || null;

    const requestedWindow = options.windowSize ?? Math.min(4, this.M - 1);
    const validation = validateWindowSize('GBN', requestedWindow, this.m);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    this.windowSize = requestedWindow;

    // Sender State
    this.base = 0;       // Sf: oldest unacknowledged sequence number
    this.nextSeq = 0;    // Sn: next sequence number to send
    this.buffer = new Map(); // seq -> { frame, sentTick }
    this.timerEventId = null;
    this.timerDeadline = null;
    this.timerDuration = this.timeoutDuration;
    this.timerBase = null;
    this.timerFrameId = null;
    this.timerAttempt = 1;
    this.timerStatus = 'IDLE';
    this.lastTimerEvent = null;

    // Receiver State
    this.expectedSeq = 0; // Rn: next expected sequence number
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
   * Current number of outstanding (unacknowledged) frames in the sender window.
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

    this.buffer.set(seq, { frame, sentTick: currentTick });

    // If this is the only unacknowledged frame (Sf === Sn before increment), start the single timer
    if (this.base === this.nextSeq) {
      this._startTimer();
    }

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
   * Start or restart the single timer for the oldest frame (base).
   * @private
   */
  _startTimer() {
    this._stopTimer();
    const currentTick = this.engine.getCurrentTick();
    const currentBase = this.base;
    const entry = this.buffer.get(currentBase);
    const frameId = entry ? entry.frame.id : null;
    const attempt = entry ? (entry.frame.attempt || 1) : 1;

    this.timerDeadline = currentTick + this.timeoutDuration;
    this.timerDuration = this.timeoutDuration;
    this.timerBase = currentBase;
    this.timerFrameId = frameId;
    this.timerAttempt = attempt;
    this.timerStatus = 'WAITING_FOR_ACK';
    this.lastTimerEvent = {
      type: 'STARTED',
      tick: currentTick,
      base: currentBase,
      frameId,
      attempt,
      deadlineTick: this.timerDeadline,
      message: `Timer started for oldest frame Sf = #${currentBase} (attempt #${attempt}). Deadline: t=${this.timerDeadline}`,
    };

    this.timerEventId = this.engine.scheduleRelative(
      this.timeoutDuration,
      () => {
        this._handleTimeout();
      },
      {
        type: 'TIMEOUT',
        payload: { base: currentBase },
      }
    );
  }

  /**
   * Cancel the active timer.
   * @private
   */
  _stopTimer() {
    if (this.timerEventId !== null) {
      this.engine.getQueue().cancel(this.timerEventId);
      this.timerEventId = null;
      const currentTick = this.engine.getCurrentTick();
      if (this.timerStatus === 'WAITING_FOR_ACK') {
        this.timerStatus = 'ACK_RECEIVED';
        this.lastTimerEvent = {
          type: 'ACK_RECEIVED',
          tick: currentTick,
          base: this.timerBase,
          message: `ACK received at t=${currentTick}. Window advanced, timer cancelled.`,
        };
      }
      this.timerDeadline = null;
    }
  }

  /**
   * Handler for timeout of the oldest unacknowledged frame.
   * Retransmits ALL frames currently in sender buffer [base, nextSeq).
   * @private
   */
  _handleTimeout() {
    this.timerEventId = null;
    this.timerDeadline = null;
    const currentTick = this.engine.getCurrentTick();

    if (this.buffer.size === 0 || this.base === this.nextSeq) {
      this.timerStatus = 'IDLE';
      return;
    }

    this.timerStatus = 'TIMEOUT';
    this.lastTimerEvent = {
      type: 'TIMEOUT',
      tick: currentTick,
      base: this.base,
      outstanding: this.getOutstandingCount(),
      message: `TIMEOUT at t=${currentTick} for base frame #${this.base}! Retransmitting all ${this.getOutstandingCount()} frames in window.`,
    };

    this.stats.timeouts++;

    this._emitEvent('TIMEOUT', {
      base: this.base,
      outstanding: this.getOutstandingCount(),
      tick: currentTick,
    });

    // In Go-Back-N, restart timer for base
    this._startTimer();

    // Retransmit all frames in window from base to (nextSeq - 1)
    let cur = this.base;
    while (cur !== this.nextSeq) {
      const entry = this.buffer.get(cur);
      if (entry) {
        entry.frame.attempt++;
        entry.frame.sentTick = currentTick;
        this.stats.retransmissions++;
        this.stats.totalTransmissions++;

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
      cur = seqAdvance(cur, 1, this.m);
    }
  }

  /**
   * Receiver-side frame arrival logic.
   * Discards corrupted frames and out-of-order frames.
   * @private
   */
  _handleFrameArrivalAtReceiver(frame, record) {
    const currentTick = this.engine.getCurrentTick();

    if (frame.corrupted) {
      this.stats.corruptedReceived++;
      this._emitEvent('FRAME_CORRUPTED', { frame, tick: currentTick });
      return;
    }

    if (frame.seq === this.expectedSeq) {
      // In-order frame received!
      this.deliveredPayloads.push({
        seq: frame.seq,
        payload: frame.payload,
        payloadText: frame.payloadText,
        tick: currentTick,
      });
      this.stats.framesDelivered++;

      // Advance expectedSeq
      this.expectedSeq = seqAdvance(this.expectedSeq, 1, this.m);

      this._emitEvent('FRAME_DELIVERED', {
        frame,
        expectedSeq: this.expectedSeq,
        tick: currentTick,
      });

      // Send cumulative ACK for next expected seq
      this._sendCumulativeAck(this.expectedSeq);
    } else {
      // Out of order or duplicate frame
      this.stats.duplicatesDiscarded++;
      this._emitEvent('OUT_OF_ORDER_DISCARDED', {
        seq: frame.seq,
        expectedSeq: this.expectedSeq,
        tick: currentTick,
      });

      // In Go-Back-N, receiver re-sends cumulative ACK for expectedSeq
      this._sendCumulativeAck(this.expectedSeq);
    }
  }

  /**
   * Receiver transmits cumulative ACK back to sender.
   * @private
   */
  _sendCumulativeAck(ackNum) {
    const currentTick = this.engine.getCurrentTick();
    const ackFrame = createFrame({
      type: FrameType.ACK,
      ack: ackNum,
      sentTick: currentTick,
    });

    this.stats.acksSent++;
    this._emitEvent('ACK_SENT', { ackFrame, tick: currentTick });

    this.reverseChannel.transmit(ackFrame, (deliveredAck, record) => {
      this._handleAckArrivalAtSender(deliveredAck, record);
    });
  }

  /**
   * Sender-side cumulative ACK arrival logic.
   * @private
   */
  _handleAckArrivalAtSender(ackFrame, record) {
    const currentTick = this.engine.getCurrentTick();

    if (ackFrame.corrupted) {
      this.stats.corruptedReceived++;
      this._emitEvent('ACK_CORRUPTED', { ackFrame, tick: currentTick });
      return;
    }

    const k = ackFrame.ack;
    const dist = seqDistance(this.base, k, this.m);
    const outstanding = this.getOutstandingCount();

    // In GBN, ACK(k) acknowledges all frames in [base, k - 1].
    // Valid if 0 < dist <= outstanding.
    if (dist > 0 && dist <= outstanding) {
      this.stats.acksReceived++;
      const oldBase = this.base;

      // Remove acknowledged frames from buffer
      let cur = oldBase;
      while (cur !== k) {
        this.buffer.delete(cur);
        cur = seqAdvance(cur, 1, this.m);
      }

      this.base = k;

      // Timer management
      if (this.base === this.nextSeq) {
        // All outstanding frames acknowledged: stop timer
        this._stopTimer();
      } else {
        // Still unacknowledged frames outstanding: restart timer for new base
        this._startTimer();
      }

      this._emitEvent('ACK_RECEIVED', {
        ackFrame,
        oldBase,
        newBase: this.base,
        framesAcked: dist,
        tick: currentTick,
      });

      this._emitEvent('WINDOW_SLID', {
        base: this.base,
        nextSeq: this.nextSeq,
        tick: currentTick,
      });
    } else {
      // Duplicate or stale ACK
      this._emitEvent('STALE_ACK_RECEIVED', {
        ackFrame,
        base: this.base,
        tick: currentTick,
      });
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
   * Get immutable snapshot of current retransmission timer countdown state.
   * 
   * @returns {Object}
   */
  getTimerState() {
    const currentTick = this.engine.getCurrentTick();
    const hasActiveTimer = this.timerEventId !== null && this.timerDeadline !== null;
    const remainingTicks = hasActiveTimer ? Math.max(0, this.timerDeadline - currentTick) : 0;
    const curBase = hasActiveTimer ? this.timerBase : (this.timerBase ?? this.base);
    const entry = this.buffer.get(curBase);
    const frameId = entry ? entry.frame.id : this.timerFrameId;
    const attempt = entry ? (entry.frame.attempt || 1) : this.timerAttempt;

    return {
      protocol: 'GBN',
      active: hasActiveTimer,
      status: hasActiveTimer ? 'WAITING_FOR_ACK' : this.timerStatus,
      frameSeq: curBase,
      base: this.base,
      frameId,
      attempt,
      duration: this.timeoutDuration,
      deadlineTick: this.timerDeadline,
      remainingTicks,
      currentTick,
      outstandingCount: this.getOutstandingCount(),
      lastEvent: this.lastTimerEvent,
      timers: hasActiveTimer
        ? [
            {
              frameSeq: curBase,
              base: this.base,
              frameId,
              attempt,
              duration: this.timeoutDuration,
              deadlineTick: this.timerDeadline,
              remainingTicks,
              status: 'WAITING_FOR_ACK',
            },
          ]
        : [],
    };
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
          frame: { ...entry.frame },
          sentTick: entry.sentTick,
        });
      }
      cur = seqAdvance(cur, 1, this.m);
    }

    return {
      protocol: 'GBN',
      m: this.m,
      M: this.M,
      windowSize: this.windowSize,
      sender: {
        base: this.base,
        nextSeq: this.nextSeq,
        outstandingCount: this.getOutstandingCount(),
        hasTimer: this.timerEventId !== null,
        buffer: outstandingFrames,
      },
      receiver: {
        expectedSeq: this.expectedSeq,
        base: this.expectedSeq,
        deliveredCount: this.deliveredPayloads.length,
        deliveredPayloads: [...this.deliveredPayloads],
      },
      stats: { ...this.stats },
      timerState: this.getTimerState(),
    };
  }
}
