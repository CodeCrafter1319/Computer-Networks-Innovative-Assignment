/**
 * engine.test.js
 * 
 * Comprehensive unit test suite for:
 * 1. EventQueue (Min-priority virtual time ordering & cancellation)
 * 2. SimulationEngine (Discrete-event stepping, clock advancement, pause/resume/reset)
 * 3. Channel (Deterministic propagation delay, drop, corruption, and frame immutability)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventQueue } from '../core/engine/EventQueue.js';
import { SimulationEngine, EngineState } from '../core/engine/SimulationEngine.js';
import { Channel, TransmissionOutcome } from '../core/engine/Channel.js';

describe('EventQueue', () => {
  let queue;

  beforeEach(() => {
    queue = new EventQueue();
  });

  it('orders events chronologically by virtual tick', () => {
    queue.enqueue(30, () => 'event 30');
    queue.enqueue(10, () => 'event 10');
    queue.enqueue(20, () => 'event 20');

    expect(queue.size()).toBe(3);
    expect(queue.dequeue().time).toBe(10);
    expect(queue.dequeue().time).toBe(20);
    expect(queue.dequeue().time).toBe(30);
    expect(queue.isEmpty()).toBe(true);
  });

  it('preserves insertion order (FIFO) for simultaneous events', () => {
    const idA = queue.enqueue(10, () => 'first', { payload: 'A' });
    const idB = queue.enqueue(10, () => 'second', { payload: 'B' });
    const idC = queue.enqueue(10, () => 'third', { payload: 'C' });

    expect(queue.dequeue().payload).toBe('A');
    expect(queue.dequeue().payload).toBe('B');
    expect(queue.dequeue().payload).toBe('C');
  });

  it('cancels scheduled events successfully by event ID', () => {
    const executed = [];
    const id1 = queue.enqueue(5, () => executed.push(1));
    const id2 = queue.enqueue(10, () => executed.push(2));
    const id3 = queue.enqueue(15, () => executed.push(3));

    const cancelSuccess = queue.cancel(id2);
    expect(cancelSuccess).toBe(true);
    expect(queue.size()).toBe(2);

    const first = queue.dequeue();
    first.handler();
    const second = queue.dequeue();
    second.handler();

    expect(executed).toEqual([1, 3]);
  });

  it('returns false safely when cancelling a nonexistent ID', () => {
    queue.enqueue(5, () => {});
    expect(queue.cancel(9999)).toBe(false);
    expect(queue.cancel('invalid_id')).toBe(false);
  });

  it('handles empty queue behavior safely', () => {
    expect(queue.isEmpty()).toBe(true);
    expect(queue.size()).toBe(0);
    expect(queue.peek()).toBeNull();
    expect(queue.dequeue()).toBeNull();
  });

  it('rejects invalid scheduling inputs with descriptive errors', () => {
    expect(() => queue.enqueue(-5, () => {})).toThrow(/non-negative integer/);
    expect(() => queue.enqueue(3.14, () => {})).toThrow(/non-negative integer/);
    expect(() => queue.enqueue('10', () => {})).toThrow(/non-negative integer/);
    expect(() => queue.enqueue(10, null)).toThrow(/executable function/);
  });

  it('clears all queued events on clear()', () => {
    queue.enqueue(5, () => {});
    queue.enqueue(10, () => {});
    expect(queue.size()).toBe(2);

    queue.clear();
    expect(queue.size()).toBe(0);
    expect(queue.isEmpty()).toBe(true);
  });
});

describe('SimulationEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new SimulationEngine();
  });

  it('initializes with tick 0 and state IDLE', () => {
    expect(engine.getCurrentTick()).toBe(0);
    expect(engine.getState()).toBe(EngineState.IDLE);
    expect(engine.getQueue().isEmpty()).toBe(true);
  });

  it('advances virtual clock to event times as steps occur', () => {
    engine.scheduleEvent(5, () => {});
    engine.scheduleEvent(15, () => {});

    expect(engine.getCurrentTick()).toBe(0);

    const step1 = engine.step();
    expect(step1.executed).toBe(true);
    expect(step1.tick).toBe(5);
    expect(engine.getCurrentTick()).toBe(5);

    const step2 = engine.step();
    expect(step2.executed).toBe(true);
    expect(step2.tick).toBe(15);
    expect(engine.getCurrentTick()).toBe(15);

    const step3 = engine.step();
    expect(step3.executed).toBe(false);
    expect(step3.reason).toBe('QUEUE_EMPTY');
  });

  it('executes exactly one event per manual step()', () => {
    let count = 0;
    engine.scheduleEvent(2, () => count++);
    engine.scheduleEvent(4, () => count++);

    expect(count).toBe(0);
    engine.step();
    expect(count).toBe(1);
    engine.step();
    expect(count).toBe(2);
  });

  it('supports scheduleRelative using current virtual tick', () => {
    engine.scheduleEvent(10, (ev, eng) => {
      // At tick 10, schedule something 5 ticks in the future (tick 15)
      eng.scheduleRelative(5, () => {});
    });

    engine.step(); // jumps to tick 10 and schedules event for tick 15
    expect(engine.getCurrentTick()).toBe(10);
    expect(engine.getQueue().peek().time).toBe(15);

    engine.step(); // jumps to tick 15
    expect(engine.getCurrentTick()).toBe(15);
  });

  it('does not execute cancelled events', () => {
    const executed = [];
    const eventId = engine.scheduleRelative(10, () => executed.push('should_not_run'));
    engine.scheduleRelative(12, () => executed.push('should_run'));

    const cancelled = engine.cancelEvent(eventId);
    expect(cancelled).toBe(true);

    engine.runUntilEmpty();
    expect(executed).toEqual(['should_run']);
    expect(engine.getCurrentTick()).toBe(12);
  });

  it('handles event handler errors without corrupting queue or clock', () => {
    engine.scheduleEvent(5, () => {
      throw new Error('Handler simulated error');
    });
    engine.scheduleEvent(10, () => {});

    const outcome = engine.step();
    expect(outcome.executed).toBe(false);
    expect(outcome.reason).toBe('HANDLER_ERROR');
    expect(outcome.error.message).toBe('Handler simulated error');
    expect(engine.getState()).toBe(EngineState.ERROR);
    expect(engine.getCurrentTick()).toBe(5);

    // Remaining event is still intact in the queue
    expect(engine.getQueue().size()).toBe(1);
    expect(engine.getQueue().peek().time).toBe(10);
  });

  it('supports runUntilEmpty and pauses/resumes correctly', () => {
    const steps = [];
    engine.scheduleEvent(1, () => steps.push(1));
    engine.scheduleEvent(2, () => {
      steps.push(2);
      engine.pause();
    });
    engine.scheduleEvent(3, () => steps.push(3));

    const result1 = engine.runUntilEmpty();
    expect(steps).toEqual([1, 2]);
    expect(result1.stoppedReason).toBe('PAUSED');
    expect(engine.getCurrentTick()).toBe(2);

    engine.resume();
    const result2 = engine.runUntilEmpty();
    expect(steps).toEqual([1, 2, 3]);
    expect(result2.stoppedReason).toBe('QUEUE_EMPTY');
    expect(engine.getCurrentTick()).toBe(3);
  });

  it('resets completely to initial state on reset()', () => {
    engine.scheduleEvent(10, () => {});
    engine.step();
    expect(engine.getCurrentTick()).toBe(10);

    engine.reset();
    expect(engine.getCurrentTick()).toBe(0);
    expect(engine.getState()).toBe(EngineState.IDLE);
    expect(engine.getQueue().isEmpty()).toBe(true);
    expect(engine.getExecutionLog()).toEqual([]);
  });

  it('runs until target tick with runUntil()', () => {
    engine.scheduleEvent(2, () => {});
    engine.scheduleEvent(5, () => {});
    engine.scheduleEvent(10, () => {});

    engine.runUntil(5);
    expect(engine.getCurrentTick()).toBe(5);
    expect(engine.getQueue().size()).toBe(1);
    expect(engine.getQueue().peek().time).toBe(10);
  });
});

describe('Channel', () => {
  let engine;
  let channel;

  beforeEach(() => {
    engine = new SimulationEngine();
    channel = new Channel(engine, { propagationDelay: 4 });
  });

  it('delivers a normal frame at expected virtual time (startTick + propagationDelay)', () => {
    const deliveredFrames = [];
    const originalFrame = { seq: 0, data: '1011001' };

    channel.transmit(originalFrame, (delivered) => {
      deliveredFrames.push(delivered);
    });

    expect(deliveredFrames.length).toBe(0);

    // Step the engine to trigger delivery event
    engine.runUntilEmpty();

    expect(deliveredFrames.length).toBe(1);
    expect(deliveredFrames[0].seq).toBe(0);
    expect(deliveredFrames[0].data).toBe('1011001');
    expect(engine.getCurrentTick()).toBe(4); // 0 + 4
  });

  it('guarantees the original frame object is never mutated by channel operations', () => {
    const original = { seq: 1, data: '11111111' };

    channel.transmit(
      original,
      () => {},
      { action: 'CORRUPT', bitIndex: 2 }
    );

    engine.runUntilEmpty();

    // Original must remain pristine
    expect(original.data).toBe('11111111');
    expect(original.corrupted).toBeUndefined();
  });

  it('does not deliver a dropped frame', () => {
    const deliveredFrames = [];
    const frame = { seq: 2, data: '0011' };

    const record = channel.transmit(
      frame,
      (delivered) => {
        deliveredFrames.push(delivered);
      },
      { action: 'DROP' }
    );

    expect(record.outcome).toBe(TransmissionOutcome.DROPPED);
    expect(record.eventId).toBeNull();

    engine.runUntilEmpty();

    expect(deliveredFrames.length).toBe(0);
    expect(engine.getCurrentTick()).toBe(0); // No events scheduled, clock did not advance
  });

  it('corrupts a frame in a deterministic, reproducible manner', () => {
    const deliveredFrames = [];
    const frame = { seq: 3, data: '10000000' };

    channel.transmit(
      frame,
      (delivered) => {
        deliveredFrames.push(delivered);
      },
      { action: 'CORRUPT', bitIndex: 0 }
    );

    engine.runUntilEmpty();

    expect(deliveredFrames.length).toBe(1);
    expect(deliveredFrames[0].corrupted).toBe(true);
    // Bit 0 flipped from '1' to '0'
    expect(deliveredFrames[0].data).toBe('00000000');
  });

  it('applies additional delay to transmission when configured', () => {
    const frame = { seq: 4, data: '101' };

    channel.transmit(
      frame,
      () => {},
      { action: 'DELAY', extraDelay: 6 } // 4 base + 6 extra = 10 ticks
    );

    engine.runUntilEmpty();
    expect(engine.getCurrentTick()).toBe(10);
  });

  it('executes a deterministic sequential fault plan across multiple frames', () => {
    channel.setFaultPlan([
      { action: 'PASS' },
      { action: 'DROP' },
      { action: 'CORRUPT', bitIndex: 1 },
    ]);

    const results = [];
    for (let seq = 0; seq < 3; seq++) {
      channel.transmit({ seq, data: '1111' }, (delivered, record) => {
        results.push({ seq: delivered.seq, corrupted: !!delivered.corrupted, data: delivered.data });
      });
    }

    engine.runUntilEmpty();

    // Frame 0: PASS -> delivered intact
    // Frame 1: DROP -> never delivered
    // Frame 2: CORRUPT -> delivered with bit 1 flipped ('1011')
    expect(results.length).toBe(2);
    expect(results[0]).toEqual({ seq: 0, corrupted: false, data: '1111' });
    expect(results[1]).toEqual({ seq: 2, corrupted: true, data: '1011' });
  });
});
