/**
 * SimulationEngine.js
 * 
 * Deterministic discrete-event simulation engine for computer networks protocols.
 * All time progression is driven strictly by an integer virtual clock (ticks).
 * No wall-clock timers (setTimeout/setInterval) are used.
 */

import { EventQueue } from './EventQueue.js';

export const EngineState = Object.freeze({
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  STOPPED: 'STOPPED',
  ERROR: 'ERROR',
});

export class SimulationEngine {
  constructor() {
    this._virtualTick = 0;
    this._eventQueue = new EventQueue();
    this._state = EngineState.IDLE;
    this._lastExecutedEvent = null;
    this._lastError = null;
    this._executionLog = [];
    this._maxLogSize = 500;
    this._listeners = new Set();
  }

  /**
   * Current integer virtual tick.
   * 
   * @returns {number}
   */
  getCurrentTick() {
    return this._virtualTick;
  }

  /**
   * Current operational state of the engine.
   * 
   * @returns {string} One of EngineState values.
   */
  getState() {
    return this._state;
  }

  /**
   * Last error caught during event execution, if any.
   * 
   * @returns {Error|null}
   */
  getLastError() {
    return this._lastError;
  }

  /**
   * Direct reference to the internal event queue.
   * 
   * @returns {EventQueue}
   */
  getQueue() {
    return this._eventQueue;
  }

  /**
   * Schedule an event at an absolute virtual time tick.
   * 
   * @param {number} time - Absolute tick (must be >= current virtual tick).
   * @param {Function} handler - Function to execute: (event, engine) => void.
   * @param {Object} [options={}] - Metadata (type, payload).
   * @returns {number} Unique eventId.
   */
  scheduleEvent(time, handler, options = {}) {
    if (typeof time !== 'number' || !Number.isInteger(time) || time < this._virtualTick) {
      throw new Error(
        `Invalid schedule time: ${time}. Event time must be an integer >= current virtual tick (${this._virtualTick}).`
      );
    }
    const id = this._eventQueue.enqueue(time, handler, options);
    this._notifyListeners('EVENT_SCHEDULED', { eventId: id, time });
    return id;
  }

  /**
   * Schedule an event at a relative offset from the current virtual tick.
   * 
   * @param {number} delay - Relative tick offset (must be an integer >= 0).
   * @param {Function} handler - Function to execute: (event, engine) => void.
   * @param {Object} [options={}] - Metadata (type, payload).
   * @returns {number} Unique eventId.
   */
  scheduleRelative(delay, handler, options = {}) {
    if (typeof delay !== 'number' || !Number.isInteger(delay) || delay < 0) {
      throw new Error(`Invalid delay: ${delay}. Delay must be a non-negative integer.`);
    }
    return this.scheduleEvent(this._virtualTick + delay, handler, options);
  }

  /**
   * Cancel a previously scheduled event by ID (e.g., when an ACK arrives before a timer expires).
   * 
   * @param {number} eventId - Unique event identifier.
   * @returns {boolean} True if found and cancelled; false otherwise.
   */
  cancelEvent(eventId) {
    const cancelled = this._eventQueue.cancel(eventId);
    if (cancelled) {
      this._notifyListeners('EVENT_CANCELLED', { eventId });
    }
    return cancelled;
  }

  /**
   * Advance simulation time to the next scheduled event and execute exactly one event.
   * 
   * @returns {Object} Execution outcome report:
   *   { executed: boolean, tick: number, event?: Object, error?: Error, reason?: string }
   */
  step() {
    if (this._eventQueue.isEmpty()) {
      return {
        executed: false,
        tick: this._virtualTick,
        reason: 'QUEUE_EMPTY',
      };
    }

    const event = this._eventQueue.dequeue();
    if (!event) {
      return {
        executed: false,
        tick: this._virtualTick,
        reason: 'QUEUE_EMPTY',
      };
    }

    // Monotonically advance virtual clock to the event's scheduled time
    this._virtualTick = event.time;

    try {
      event.handler(event, this);
      this._lastExecutedEvent = event;
      this._recordExecution(event);

      const outcome = {
        executed: true,
        tick: this._virtualTick,
        event,
      };

      this._notifyListeners('STEP_EXECUTED', outcome);
      return outcome;
    } catch (err) {
      this._state = EngineState.ERROR;
      this._lastError = err;

      const outcome = {
        executed: false,
        tick: this._virtualTick,
        event,
        error: err,
        reason: 'HANDLER_ERROR',
      };

      this._notifyListeners('STEP_ERROR', outcome);
      return outcome;
    }
  }

  /**
   * Execute steps in a synchronous loop until the event queue is empty,
   * the engine is paused, or an error occurs.
   * 
   * @param {Object} [options={}]
   * @param {number} [options.maxSteps=10000] - Safety guard against infinite loops.
   * @returns {Object} Summary { totalSteps, finalTick, stoppedReason }
   */
  runUntilEmpty(options = {}) {
    const maxSteps = options.maxSteps ?? 10000;
    this._state = EngineState.RUNNING;
    let stepCount = 0;

    while (!this._eventQueue.isEmpty() && this._state === EngineState.RUNNING) {
      if (stepCount >= maxSteps) {
        this._state = EngineState.PAUSED;
        return {
          totalSteps: stepCount,
          finalTick: this._virtualTick,
          stoppedReason: 'MAX_STEPS_EXCEEDED',
        };
      }

      const result = this.step();
      stepCount++;

      if (!result.executed) {
        return {
          totalSteps: stepCount,
          finalTick: this._virtualTick,
          stoppedReason: result.reason || 'STEP_FAILED',
        };
      }
    }

    const stoppedReason =
      this._state === EngineState.PAUSED
        ? 'PAUSED'
        : this._state === EngineState.ERROR
        ? 'ERROR'
        : 'QUEUE_EMPTY';

    if (this._state !== EngineState.ERROR && this._state !== EngineState.PAUSED) {
      this._state = EngineState.STOPPED;
    }

    return {
      totalSteps: stepCount,
      finalTick: this._virtualTick,
      stoppedReason,
    };
  }

  /**
   * Run simulation until the virtual clock reaches or exceeds targetTick.
   * 
   * @param {number} targetTick - Target virtual tick.
   * @returns {Object} Summary { totalSteps, finalTick, stoppedReason }
   */
  runUntil(targetTick) {
    if (typeof targetTick !== 'number' || targetTick < this._virtualTick) {
      throw new Error(`Target tick must be >= current virtual tick (${this._virtualTick})`);
    }

    this._state = EngineState.RUNNING;
    let stepCount = 0;

    while (
      !this._eventQueue.isEmpty() &&
      this._state === EngineState.RUNNING &&
      this._eventQueue.peek() &&
      this._eventQueue.peek().time <= targetTick
    ) {
      const result = this.step();
      stepCount++;
      if (!result.executed) {
        break;
      }
    }

    // If clock hasn't reached target and no more events exist before it, advance clock
    if (this._virtualTick < targetTick && (this._eventQueue.isEmpty() || this._eventQueue.peek().time > targetTick)) {
      this._virtualTick = targetTick;
    }

    return {
      totalSteps: stepCount,
      finalTick: this._virtualTick,
      stoppedReason: this._state === EngineState.PAUSED ? 'PAUSED' : 'TARGET_REACHED',
    };
  }

  /**
   * Pause simulation execution.
   */
  pause() {
    this._state = EngineState.PAUSED;
    this._notifyListeners('STATE_CHANGED', { state: this._state });
  }

  /**
   * Resume simulation execution.
   */
  resume() {
    this._state = EngineState.RUNNING;
    this._notifyListeners('STATE_CHANGED', { state: this._state });
  }

  /**
   * Reset the engine to its initial clean state:
   * Virtual tick reset to 0, queue cleared, state set to IDLE.
   */
  reset() {
    this._virtualTick = 0;
    this._eventQueue.clear();
    this._state = EngineState.IDLE;
    this._lastExecutedEvent = null;
    this._lastError = null;
    this._executionLog = [];
    this._notifyListeners('RESET', { tick: 0 });
  }

  /**
   * Read recent event execution log.
   * 
   * @returns {Array<Object>}
   */
  getExecutionLog() {
    return [...this._executionLog];
  }

  /**
   * Subscribe a listener callback to engine lifecycle events.
   * 
   * @param {Function} listener - Callback: (eventType, data) => void.
   * @returns {Function} Unsubscribe function.
   */
  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new Error('Listener must be a function');
    }
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * @private
   */
  _recordExecution(event) {
    this._executionLog.push({
      id: event.id,
      time: event.time,
      type: event.type,
      payload: event.payload,
    });
    if (this._executionLog.length > this._maxLogSize) {
      this._executionLog.shift();
    }
  }

  /**
   * @private
   */
  _notifyListeners(eventType, data) {
    for (const listener of this._listeners) {
      try {
        listener(eventType, data);
      } catch (err) {
        console.error('SimulationEngine listener error:', err);
      }
    }
  }
}
