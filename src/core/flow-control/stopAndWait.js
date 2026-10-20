/**
 * stopAndWait.js
 * 
 * Stop-and-Wait ARQ Protocol Implementation.
 * 
 * Characteristics:
 * - 1-bit sequence number space: m = 1, M = 2, seq in { 0, 1 }
 * - Sender window size Ws = 1, Receiver window size Wr = 1
 * - Alternating sequence numbers: DATA(0) -> ACK(1) -> DATA(1) -> ACK(0)
 * - Single outstanding frame at any moment
 * - Timer for unacknowledged frame with timeout-triggered retransmissions
 * - Duplicate frame detection and suppression at receiver
 */

import { FrameType, createFrame } from '../frame/FrameContract.js';

export const SenderStatus = Object.freeze({
  IDLE: 'IDLE',
  WAITING_FOR_ACK: 'WAITING_FOR_ACK',
});

export class StopAndWaitARQ {
  /**
   * @param {import('../engine/SimulationEngine.js').SimulationEngine} engine
   * @param {import('../engine/Channel.js').Channel} forwardChannel - Sender to Receiver (DATA)
   * @param {import('../engine/Channel.js').Channel} reverseChannel - Receiver to Sender (ACK)
   * @param {Object} [options={}]
   * @param {number} [options.timeoutDuration=12] - Virtual ticks before timeout
   * @param {Function} [options.onEvent=null] - Callback for simulation events: (eventType, data) => void
   */
  constructor(engine, forwardChannel, reverseChannel, options = {}) {
    if (!engine || !forwardChannel || !reverseChannel) {
      throw new Error('StopAndWaitARQ requires engine, forwardChannel, and reverseChannel.');
    }

    this.engine = engine;
    this.forwardChannel = forwardChannel;
    this.reverseChannel = reverseChannel;
    this.timeoutDuration = options.timeoutDuration ?? 12;
    this.onEvent = options.onEvent || null;

    // Sequence bit width
    this.m = 1;
    this.M = 2;
    this.windowSize = 1;

    // Sender State
    this.senderSeq = 0; // Next seq to send: 0 or 1
    this.status = SenderStatus.IDLE;
    this.currentFrame = null;
    this.timerEventId = null;

    // Receiver State
    this.expectedSeq = 0; // Next seq expected: 0 or 1
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
   * Check if sender can accept and transmit a new frame.
   * In Stop-and-Wait, sender can only send when IDLE.
   * 
   * @returns {boolean}
   */
  canSend() {
    return this.status === SenderStatus.IDLE;
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

    const frame = createFrame({
      type: FrameType.DATA,
      seq: this.senderSeq,
      payload,
      sentTick: this.engine.getCurrentTick(),
      attempt: 1,
    });

    this.currentFrame = frame;
    this.status = SenderStatus.WAITING_FOR_ACK;
    this.stats.initialTransmissions++;
    this.stats.totalTransmissions++;

    // Schedule retransmission timer
    this._startTimer();

    // Transmit frame over forward channel
    this.forwardChannel.transmit(frame, (deliveredFrame, record) => {
      this._handleFrameArrivalAtReceiver(deliveredFrame, record);
    });

    this._emitEvent('FRAME_SENT', { frame, attempt: 1, tick: this.engine.getCurrentTick() });
    return { success: true, frame };
  }

  /**
   * Cancel any pending timeout timer.
   * @private
   */
  _stopTimer() {
    if (this.timerEventId !== null) {
      this.engine.getQueue().cancel(this.timerEventId);
      this.timerEventId = null;
    }
  }

  /**
   * Start timeout timer for current frame.
   * @private
   */
  _startTimer() {
    this._stopTimer();
    const frameSeq = this.currentFrame ? this.currentFrame.seq : this.senderSeq;
    this.timerEventId = this.engine.scheduleRelative(
      this.timeoutDuration,
      () => {
        this._handleTimeout();
      },
      {
        type: 'TIMEOUT',
        payload: { seq: frameSeq },
      }
    );
  }

  /**
   * Handler invoked when timeout timer triggers.
   * @private
   */
  _handleTimeout() {
    this.timerEventId = null;
    if (this.status !== SenderStatus.WAITING_FOR_ACK || !this.currentFrame) {
      return;
    }

    this.stats.timeouts++;
    this.stats.retransmissions++;
    this.stats.totalTransmissions++;

    this.currentFrame.attempt++;
    this.currentFrame.sentTick = this.engine.getCurrentTick();

    this._emitEvent('TIMEOUT', {
      seq: this.currentFrame.seq,
      attempt: this.currentFrame.attempt,
      tick: this.engine.getCurrentTick(),
    });

    // Reschedule timer for this retransmission
    this._startTimer();

    // Retransmit frame
    this.forwardChannel.transmit(this.currentFrame, (deliveredFrame, record) => {
      this._handleFrameArrivalAtReceiver(deliveredFrame, record);
    });

    this._emitEvent('FRAME_SENT', {
      frame: this.currentFrame,
      attempt: this.currentFrame.attempt,
      retransmission: true,
      tick: this.engine.getCurrentTick(),
    });
  }

  /**
   * Receiver-side frame arrival logic.
   * @private
   */
  _handleFrameArrivalAtReceiver(frame, record) {
    const currentTick = this.engine.getCurrentTick();

    // 1. Check if frame was corrupted in transit
    if (frame.corrupted) {
      this.stats.corruptedReceived++;
      this._emitEvent('FRAME_CORRUPTED', { frame, tick: currentTick });
      // In standard Stop-and-Wait, corrupted frames are silently discarded,
      // letting sender time out.
      return;
    }

    // 2. Check if frame matches expected sequence number
    if (frame.seq === this.expectedSeq) {
      // In-order frame received!
      this.deliveredPayloads.push({
        seq: frame.seq,
        payload: frame.payload,
        payloadText: frame.payloadText,
        tick: currentTick,
      });
      this.stats.framesDelivered++;

      // Advance expected sequence number (0 -> 1 -> 0)
      this.expectedSeq = (this.expectedSeq + 1) % 2;

      this._emitEvent('FRAME_DELIVERED', {
        frame,
        expectedSeq: this.expectedSeq,
        tick: currentTick,
      });

      // Send ACK for next expected sequence number
      this._sendAck(this.expectedSeq);
    } else {
      // Duplicate frame received (sender timed out before ACK arrived)
      this.stats.duplicatesDiscarded++;
      this._emitEvent('DUPLICATE_DISCARDED', {
        seq: frame.seq,
        expectedSeq: this.expectedSeq,
        tick: currentTick,
      });

      // Re-send ACK for the expected sequence number so sender can advance
      this._sendAck(this.expectedSeq);
    }
  }

  /**
   * Receiver sends an ACK frame back to sender.
   * @private
   */
  _sendAck(ackNum) {
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
   * Sender-side ACK arrival logic.
   * @private
   */
  _handleAckArrivalAtSender(ackFrame, record) {
    const currentTick = this.engine.getCurrentTick();

    if (ackFrame.corrupted) {
      this.stats.corruptedReceived++;
      this._emitEvent('ACK_CORRUPTED', { ackFrame, tick: currentTick });
      return;
    }

    // In Stop-and-Wait, DATA(S) expects ACK((S + 1) % 2)
    const expectedAck = (this.senderSeq + 1) % 2;

    if (this.status === SenderStatus.WAITING_FOR_ACK && ackFrame.ack === expectedAck) {
      // Valid ACK received!
      this.stats.acksReceived++;
      this._stopTimer();

      const ackedSeq = this.senderSeq;
      this.senderSeq = expectedAck;
      this.status = SenderStatus.IDLE;
      const ackedFrame = this.currentFrame;
      this.currentFrame = null;

      this._emitEvent('ACK_RECEIVED', {
        ackFrame,
        ackedSeq,
        nextSeq: this.senderSeq,
        tick: currentTick,
      });

      this._emitEvent('WINDOW_SLID', {
        senderSeq: this.senderSeq,
        expectedSeq: this.expectedSeq,
        tick: currentTick,
      });
    } else {
      // Stale or duplicate ACK received
      this._emitEvent('STALE_ACK_RECEIVED', {
        ackFrame,
        expectedAck,
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
   * Get an immutable snapshot of current protocol state.
   * 
   * @returns {Object}
   */
  getState() {
    return {
      protocol: 'SW',
      m: this.m,
      M: this.M,
      windowSize: this.windowSize,
      sender: {
        seq: this.senderSeq,
        status: this.status,
        currentFrame: this.currentFrame ? { ...this.currentFrame } : null,
        hasTimer: this.timerEventId !== null,
        base: this.senderSeq,
        nextSeq: this.status === SenderStatus.IDLE ? this.senderSeq : (this.senderSeq + 1) % 2,
      },
      receiver: {
        expectedSeq: this.expectedSeq,
        base: this.expectedSeq,
        deliveredCount: this.deliveredPayloads.length,
        deliveredPayloads: [...this.deliveredPayloads],
      },
      stats: { ...this.stats },
    };
  }
}
