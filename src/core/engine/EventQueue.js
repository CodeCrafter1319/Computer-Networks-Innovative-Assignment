/**
 * EventQueue.js
 * 
 * Min-priority queue for the discrete-event simulation engine.
 * Events are ordered primarily by virtual-time tick (ascending),
 * and secondarily by insertion order (FIFO for simultaneous events).
 */

export class EventQueue {
  constructor() {
    this._queue = [];
    this._nextId = 1;
    this._insertionCounter = 0;
  }

  /**
   * Enqueue a new event into the priority queue.
   * 
   * @param {number} time - Absolute virtual tick (non-negative integer).
   * @param {Function} handler - Function to execute when event triggers: (event, engine) => void.
   * @param {Object} [options={}] - Additional metadata.
   * @param {string} [options.type='EVENT'] - Event type identifier.
   * @param {any} [options.payload=null] - Optional contextual payload.
   * @returns {number} Unique eventId assigned to this event.
   */
  enqueue(time, handler, options = {}) {
    if (typeof time !== 'number' || !Number.isInteger(time) || time < 0) {
      throw new Error(`Invalid event time: ${time}. Event time must be a non-negative integer.`);
    }

    if (typeof handler !== 'function') {
      throw new Error('Event handler must be an executable function.');
    }

    const event = {
      id: this._nextId++,
      time,
      handler,
      type: options.type || 'EVENT',
      payload: options.payload ?? null,
      insertionOrder: this._insertionCounter++,
      cancelled: false,
    };

    // Find insertion index via binary search to maintain ascending (time, insertionOrder)
    const index = this._findInsertionIndex(event.time, event.insertionOrder);
    this._queue.splice(index, 0, event);

    return event.id;
  }

  /**
   * Remove and return the next active event from the queue.
   * Returns null if queue is empty.
   * 
   * @returns {Object|null} The next event object or null.
   */
  dequeue() {
    this._purgeLeadingCancelled();
    if (this._queue.length === 0) {
      return null;
    }
    return this._queue.shift();
  }

  /**
   * Peek at the next active event without removing it.
   * 
   * @returns {Object|null} The next event object or null.
   */
  peek() {
    this._purgeLeadingCancelled();
    if (this._queue.length === 0) {
      return null;
    }
    return this._queue[0];
  }

  /**
   * Cancel an event by its ID.
   * 
   * @param {number} eventId - The ID of the event to cancel.
   * @returns {boolean} True if found and cancelled; false if not found or already cancelled.
   */
  cancel(eventId) {
    if (typeof eventId !== 'number') {
      return false;
    }

    const index = this._queue.findIndex((ev) => ev.id === eventId && !ev.cancelled);
    if (index === -1) {
      return false;
    }

    // Mark as cancelled and remove from array
    this._queue[index].cancelled = true;
    this._queue.splice(index, 1);
    return true;
  }

  /**
   * Number of pending, non-cancelled events in the queue.
   * 
   * @returns {number}
   */
  size() {
    this._purgeLeadingCancelled();
    return this._queue.length;
  }

  /**
   * Check if queue has no pending events.
   * 
   * @returns {boolean}
   */
  isEmpty() {
    return this.size() === 0;
  }

  /**
   * Clear all scheduled events and reset ID counters.
   */
  clear() {
    this._queue = [];
    this._insertionCounter = 0;
  }

  /**
   * Returns a shallow copy array of all currently queued events (useful for UI inspection/testing).
   * 
   * @returns {Array<Object>}
   */
  toArray() {
    this._purgeLeadingCancelled();
    return [...this._queue];
  }

  /**
   * Internal binary search to determine insertion position.
   * Priority: lowest time first; if times are equal, lowest insertionOrder first.
   * 
   * @private
   */
  _findInsertionIndex(time, insertionOrder) {
    let low = 0;
    let high = this._queue.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const midEvent = this._queue[mid];

      if (
        midEvent.time < time ||
        (midEvent.time === time && midEvent.insertionOrder <= insertionOrder)
      ) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }

  /**
   * Removes any cancelled events from the front of the queue.
   * 
   * @private
   */
  _purgeLeadingCancelled() {
    while (this._queue.length > 0 && this._queue[0].cancelled) {
      this._queue.shift();
    }
  }
}
