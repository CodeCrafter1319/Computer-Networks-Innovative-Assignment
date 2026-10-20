/**
 * mac.test.js
 * 
 * Comprehensive Test Suite for CSMA/CD Shared Bus Simulation & Binary Exponential Backoff.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  calculateBackoff,
  getSlotRange,
  isExcessiveCollisions,
} from '../core/mac/backoff.js';
import { SharedBus, SignalType, resetSignalIdCounter } from '../core/mac/SharedBus.js';
import { CsmaCdStation, StationState, PersistenceMode } from '../core/mac/csmaCd.js';
import { CsmaCdSimulator, MacPreset } from '../core/mac/CsmaCdSimulator.js';
import { SimulationEngine } from '../core/engine/SimulationEngine.js';
import MacView from '../ui/modules/MacView.jsx';
import App from '../ui/App.jsx';

describe('Binary Exponential Backoff (BEB) Algorithm', () => {
  it('correctly calculates slot ranges for collision attempt counts c = 1..16', () => {
    // Collision 1: k = 1 => 2^1 = 2 slots [0, 1]
    const r1 = getSlotRange(1);
    expect(r1.k).toBe(1);
    expect(r1.maxSlots).toBe(2);
    expect(r1.minSlot).toBe(0);
    expect(r1.maxSlot).toBe(1);

    // Collision 2: k = 2 => 2^2 = 4 slots [0, 3]
    const r2 = getSlotRange(2);
    expect(r2.k).toBe(2);
    expect(r2.maxSlots).toBe(4);
    expect(r2.maxSlot).toBe(3);

    // Collision 3: k = 3 => 2^3 = 8 slots [0, 7]
    const r3 = getSlotRange(3);
    expect(r3.k).toBe(3);
    expect(r3.maxSlots).toBe(8);

    // Collision 10: k = 10 => 2^10 = 1024 slots [0, 1023]
    const r10 = getSlotRange(10);
    expect(r10.k).toBe(10);
    expect(r10.maxSlots).toBe(1024);
    expect(r10.maxSlot).toBe(1023);

    // Collision 15: Exponent is capped at k = 10 (Truncated BEB)
    const r15 = getSlotRange(15);
    expect(r15.k).toBe(10);
    expect(r15.maxSlots).toBe(1024);
  });

  it('enforces IEEE 802.3 maximum attempt limit (16 attempts)', () => {
    // Attempts 1..15: 1..15 collisions experienced so far => attempt 16 is still permitted
    expect(isExcessiveCollisions(15)).toBe(false);
    const b15 = calculateBackoff(15, 20);
    expect(b15.exceededAttemptLimit).toBe(false);
    expect(b15.exceededMaxRetries).toBe(false);
    expect(b15.k).toBe(10); // Capped at k = 10
    expect(b15.maxSlots).toBe(1024);

    // Collision 16: All 16 transmission attempts have collided and failed => abort with EXCESSIVE_COLLISIONS
    expect(isExcessiveCollisions(16)).toBe(true);
    const backoffExceeded = calculateBackoff(16, 20);
    expect(backoffExceeded.exceededAttemptLimit).toBe(true);
    expect(backoffExceeded.exceededMaxRetries).toBe(true);
    expect(backoffExceeded.slotChosen).toBeNull();
    expect(backoffExceeded.reason).toBe('EXCESSIVE_COLLISIONS');
  });

  it('computes exact deterministic backoff wait ticks from slot choice', () => {
    // Slot time = 20 ticks (2 * tau)
    // For c = 2, slotChoice = 3 => waitTicks = 3 * 20 = 60 ticks
    const b = calculateBackoff(2, 20, { slotChoice: 3 });
    expect(b.attempt).toBe(2);
    expect(b.k).toBe(2);
    expect(b.slotChosen).toBe(3);
    expect(b.waitTicks).toBe(60);
    expect(b.exceededMaxRetries).toBe(false);
  });

  it('validates invalid slotTime or attemptCount arguments', () => {
    expect(() => calculateBackoff(0, 20)).toThrow();
    expect(() => calculateBackoff(-1, 20)).toThrow();
    expect(() => calculateBackoff(1, 0)).toThrow();
    expect(() => calculateBackoff(1, -5)).toThrow();
  });
});

describe('SharedBus Physical Medium & Propagation Delay', () => {
  let engine;
  let bus;

  beforeEach(() => {
    resetSignalIdCounter();
    engine = new SimulationEngine();
    bus = new SharedBus(engine, { busLength: 100, maxPropagationDelay: 10 });
    bus.registerStation({ id: 'A', name: 'Station A', position: 0 });
    bus.registerStation({ id: 'B', name: 'Station B', position: 25 });
    bus.registerStation({ id: 'C', name: 'Station C', position: 75 });
    bus.registerStation({ id: 'D', name: 'Station D', position: 100 });
  });

  it('calculates spatial propagation delays between stations accurately', () => {
    // End-to-end tau_max across 100 units is 10 ticks
    expect(bus.getPropagationDelay(0, 100)).toBe(10);
    expect(bus.getPropagationDelay(100, 0)).toBe(10);
    // Separation of 50 units (25 to 75) => round(50/100 * 10) = 5 ticks
    expect(bus.getPropagationDelay(25, 75)).toBe(5);
    // Separation of 25 units (0 to 25) => round(25/100 * 10) = 3 ticks
    expect(bus.getPropagationDelay(0, 25)).toBe(3);
    // Same position delay is 0
    expect(bus.getPropagationDelay(50, 50)).toBe(0);
    // Slot time 2*tau = 20 ticks
    expect(bus.getSlotTime()).toBe(20);
  });

  it('distinguishes local carrier sensing at a station from global bus activity', () => {
    // At t = 0: Station A (at x = 0) begins transmission of duration 30 ticks
    bus.transmitSignal({ stationId: 'A', duration: 30 });

    // Instantly at t = 0: Medium at A is busy
    expect(bus.isMediumBusyAt('A', 0)).toBe(true);

    // But Station D (at x = 100) has NOT yet received A's signal!
    // Signal arrives at D at t = 0 + tau(0, 100) = 10 ticks
    expect(bus.isMediumBusyAt('D', 0)).toBe(false);
    expect(bus.isMediumBusyAt('D', 5)).toBe(false);
    expect(bus.isMediumBusyAt('D', 9)).toBe(false);

    // Exactly at t = 10: Signal head arrives at D!
    expect(bus.isMediumBusyAt('D', 10)).toBe(true);
    // Global bus is busy throughout [0, 40]
    expect(bus.isBusGloballyBusy(0)).toBe(true);
    expect(bus.isBusGloballyBusy(5)).toBe(true);
  });

  it('generates spatial wavefront coordinates for visualizer rendering', () => {
    bus.transmitSignal({ stationId: 'B', duration: 20 }); // B is at x = 25
    // At t = 2: Speed is 10 units/tick => head has traveled 20 units
    // Head reaches [25 - 20, 25 + 20] = [5, 45]
    const wf = bus.getWavefronts(2);
    expect(wf.length).toBe(1);
    expect(wf[0].stationId).toBe('B');
    expect(wf[0].leftSegment[0]).toBe(5); // Head left
    expect(wf[0].rightSegment[1]).toBe(45); // Head right
  });
});

describe('CSMA/CD Protocol State Machine & Simulator Contention', () => {
  it('Scenario 1: Single station transmits cleanly when bus is idle', () => {
    const sim = new CsmaCdSimulator({
      frameTransmissionDuration: 30,
      maxPropagationDelay: 10,
    });

    const res = sim.send('A', 'Clean Test Frame', 'D');
    expect(res.success).toBe(true);

    const stA = sim.stations.get('A');
    expect(stA.state).toBe(StationState.TRANSMITTING);

    // Step clock until transmission completes at t = 30
    sim.stepTicks(30);
    expect(sim.engine.getCurrentTick()).toBe(30);
    expect(stA.state).toBe(StationState.IDLE);
    expect(stA.stats.framesDelivered).toBe(1);
    expect(stA.stats.collisionsDetected).toBe(0);

    // Step clock until signal tail reaches Station D at t = 30 + 10 = 40
    sim.stepTicks(10);
    const stD = sim.stations.get('D');
    expect(stD.stats.framesReceived).toBe(1);

    const telemetry = sim.getTelemetry();
    expect(telemetry.totalAttempts).toBe(1);
    expect(telemetry.totalDelivered).toBe(1);
    expect(telemetry.totalCollisions).toBe(0);
    expect(telemetry.totalAborted).toBe(0);
    expect(telemetry.successRatio).toBe(100.0);
  });

  it('Scenario 2: Near-simultaneous transmission produces collision and 32-bit jam signal', () => {
    // Station A at x = 0 transmits at t = 0
    // Station D at x = 100 transmits at t = 4 (before A's signal arrives at t = 10)
    // A's signal reaches D at t = 10; D's signal reaches A at t = 4 + 10 = 14
    const sim = new CsmaCdSimulator({
      frameTransmissionDuration: 30,
      maxPropagationDelay: 10,
      jamDuration: 4,
    });

    sim.send('A', 'Frame A', 'D');

    // At t = 4: Station D senses medium locally. Is it idle? Yes!
    sim.stepTicks(4);
    expect(sim.bus.isMediumBusyAt('D')).toBe(false);

    sim.send('D', 'Frame D', 'A');
    const stA = sim.stations.get('A');
    const stD = sim.stations.get('D');
    expect(stA.state).toBe(StationState.TRANSMITTING);
    expect(stD.state).toBe(StationState.TRANSMITTING);

    // Step to t = 10: A's wave arrives at D!
    // D is actively transmitting, so D detects collision!
    sim.stepTicks(6); // t = 10
    expect(sim.engine.getCurrentTick()).toBe(10);
    expect(stD.state).toBe(StationState.TRANSMITTING_JAM);
    expect(stD.stats.collisionsDetected).toBe(1);
    expect(stD.stats.abortedTransmissions).toBe(1);
    expect(stD.stats.jamSignalsEmitted).toBe(1);
    expect(stD.stats.jamBitsEmitted).toBe(32);

    // Step to t = 14: D's wave arrives at A!
    // A is actively transmitting, so A detects collision!
    sim.stepTicks(4); // t = 14
    expect(sim.engine.getCurrentTick()).toBe(14);
    expect(stA.state).toBe(StationState.TRANSMITTING_JAM);
    expect(stA.stats.collisionsDetected).toBe(1);
    expect(stA.stats.abortedTransmissions).toBe(1);
    expect(stA.stats.jamSignalsEmitted).toBe(1);

    // Verify aborted transmissions did NOT count as delivered
    expect(stA.stats.framesDelivered).toBe(0);
    expect(stD.stats.framesDelivered).toBe(0);
  });

  it('Scenario 3: Station executes Truncated Binary Exponential Backoff after collision', () => {
    const sim = new CsmaCdSimulator({
      frameTransmissionDuration: 30,
      maxPropagationDelay: 10, // slotTime = 20
      jamDuration: 4,
    });

    const stA = sim.stations.get('A');
    const stD = sim.stations.get('D');

    // Force deterministic slot choices: A chooses slot 0, D chooses slot 1
    // (For collision c = 1, k = 1 => valid slots are [0, 1])
    stA.setDeterministicSlots([0]);
    stD.setDeterministicSlots([1]);

    sim.send('A', 'Data A', 'D');
    sim.engine.scheduleEvent(3, () => {
      sim.send('D', 'Data D', 'A');
    });

    // Run until collision detection and jam completions
    // D detects collision at t = 10, finishes jam at 10 + 4 = 14
    // A detects collision at t = 13, finishes jam at 13 + 4 = 17
    sim.runUntil(s => s.stations.get('A').state === StationState.BACKING_OFF, 30);

    expect(stA.state).toBe(StationState.BACKING_OFF);
    expect(stA.collisionCount).toBe(1);
    expect(stA.lastBackoff.k).toBe(1); // k = min(1, 10) = 1
    expect(stA.lastBackoff.slotChosen).toBe(0); // Chosen slot 0
    expect(stA.lastBackoff.waitTicks).toBe(0); // 0 * 20 = 0 ticks

    expect(stD.collisionCount).toBe(1);
    expect(stD.lastBackoff.slotChosen).toBe(1); // Chosen slot 1
    expect(stD.lastBackoff.waitTicks).toBe(20); // 1 * 20 = 20 ticks
  });

  it('Scenario 4: 1-Persistent Carrier Sensing defers when medium is busy', () => {
    const sim = new CsmaCdSimulator({
      frameTransmissionDuration: 25,
      maxPropagationDelay: 10,
    });

    // Station A transmits at t = 0
    sim.send('A', 'Frame A', 'D');

    // At t = 5: A's signal has already reached Station B at x = 25 (prop delay = 3)
    sim.stepTicks(5);
    expect(sim.bus.isMediumBusyAt('B')).toBe(true);

    // Station B queues a frame at t = 5
    const sendRes = sim.send('B', 'Frame B', 'C');
    expect(sendRes.success).toBe(true);
    const stB = sim.stations.get('B');
    // B must enter SENSING state and defer
    expect(stB.state).toBe(StationState.SENSING);

    // Fast-forward until A's frame finishes passing B (A duration 25 + prop 3 = 28)
    sim.runUntil(s => s.stations.get('B').state === StationState.TRANSMITTING, 35);

    // B detects channel is now idle and automatically begins transmitting!
    expect(stB.state).toBe(StationState.TRANSMITTING);
    expect(stB.stats.transmissionAttempts).toBe(1);
  });

  it('Scenario 5: Excessive collisions terminate transmission when attemptLimit is reached', () => {
    const sim = new CsmaCdSimulator({
      frameTransmissionDuration: 20,
      maxPropagationDelay: 5,
      jamDuration: 2,
      attemptLimit: 2, // Low attempt limit for test (1 initial + 1 retry)
    });

    const stA = sim.stations.get('A');
    const stB = sim.stations.get('B');

    // Both repeatedly choose slot 0, colliding on every retry
    stA.setDeterministicSlots([0, 0, 0, 0]);
    stB.setDeterministicSlots([0, 0, 0, 0]);

    sim.send('A', 'Persistent Frame A', 'C');
    sim.send('B', 'Persistent Frame B', 'D');

    // Run until stations exceed attemptLimit = 2
    sim.runUntil(
      s => s.stations.get('A').state === StationState.ABORTED_EXCESSIVE_COLLISIONS,
      150
    );

    expect(stA.state).toBe(StationState.ABORTED_EXCESSIVE_COLLISIONS);
    expect(stA.stats.transmissionAttempts).toBe(2); // Exactly 2 attempts made
    expect(stA.collisionCount).toBe(2);
    expect(stA.stats.excessiveCollisionDrops).toBe(1);
    expect(stA.stats.framesDelivered).toBe(0);

    const tel = sim.getTelemetry();
    expect(tel.totalExcessiveDrops).toBeGreaterThanOrEqual(1);
  });

  it('Scenario 6: Simulator presets load cleanly and initialize scenario configurations', () => {
    const sim = new CsmaCdSimulator();

    sim.loadPreset(MacPreset.CLEAN_TRANSMISSION);
    expect(sim.stations.get('A').state).toBe(StationState.TRANSMITTING);

    sim.loadPreset(MacPreset.NEAR_SIMULTANEOUS_COLLISION);
    expect(sim.stations.get('A').state).toBe(StationState.TRANSMITTING);

    sim.loadPreset(MacPreset.BACKOFF_RESOLUTION);
    expect(sim.stations.get('A').state).toBe(StationState.TRANSMITTING);

    sim.reset();
    expect(sim.engine.getCurrentTick()).toBe(0);
    expect(sim.stations.get('A').state).toBe(StationState.IDLE);
  });

  it('Scenario 7: Full Contention Resolution cycle delivers both colliding frames via BEB', () => {
    // Station A and D collide; A backs off 0 slots, D backs off 1 slot (20 ticks)
    // A transmits first, D defers until A clears, then D transmits cleanly
    const sim = new CsmaCdSimulator({
      frameTransmissionDuration: 25,
      maxPropagationDelay: 10,
      jamDuration: 4,
    });

    const stA = sim.stations.get('A');
    const stD = sim.stations.get('D');

    stA.setDeterministicSlots([0]);
    stD.setDeterministicSlots([1]);

    sim.send('A', 'Resolved Frame A', 'D');
    sim.engine.scheduleEvent(3, () => {
      sim.send('D', 'Resolved Frame D', 'A');
    });

    // Run until both frames have been successfully delivered
    sim.runUntil(
      s => s.stations.get('A').stats.framesDelivered === 1 && s.stations.get('D').stats.framesDelivered === 1,
      150
    );

    expect(stA.stats.framesDelivered).toBe(1);
    expect(stD.stats.framesDelivered).toBe(1);
    expect(stA.stats.collisionsDetected).toBe(1);
    expect(stD.stats.collisionsDetected).toBe(1);

    const telemetry = sim.getTelemetry();
    expect(telemetry.totalDelivered).toBe(2);
    expect(telemetry.totalCollisions).toBe(2);
    expect(telemetry.totalJamSignals).toBe(2);
  });

  it('Scenario 8: Simulation pause, step, and reset maintain event queue integrity', () => {
    const sim = new CsmaCdSimulator();
    sim.send('A', 'Queue Integrity Test', 'D');
    sim.stepTicks(5);

    expect(sim.engine.getCurrentTick()).toBe(5);
    expect(sim.engine.getQueue().isEmpty()).toBe(false);

    // Resetting clears all scheduled events
    sim.reset();
    expect(sim.engine.getCurrentTick()).toBe(0);
    expect(sim.engine.getQueue().isEmpty()).toBe(true);
    expect(sim.bus.activeSignals.length).toBe(0);
    expect(sim.stations.get('A').state).toBe(StationState.IDLE);
  });

  it('Scenario 9: Enforces IEEE 802.3 limit of exactly 16 total transmission attempts before discard', () => {
    // Under IEEE 802.3 Clause 4.2.3.2.5, attemptLimit is 16 (1 initial attempt + 15 retries).
    // If all 16 attempts collide, the frame is discarded and attempt 17 is NEVER made.
    const sim = new CsmaCdSimulator({
      frameTransmissionDuration: 8,
      maxPropagationDelay: 2, // fast propagation
      jamDuration: 2,
      attemptLimit: 16,
    });

    const stA = sim.stations.get('A');
    const stB = sim.stations.get('B');

    // Feed slot 0 for all backoffs so A and B collide on every single attempt
    const zeroSlots = new Array(25).fill(0);
    stA.setDeterministicSlots(zeroSlots);
    stB.setDeterministicSlots([...zeroSlots]);

    sim.send('A', 'Frame A 16 attempts', 'C');
    sim.send('B', 'Frame B 16 attempts', 'D');

    // Run until Station A aborts
    sim.runUntil(
      s => s.stations.get('A').state === StationState.ABORTED_EXCESSIVE_COLLISIONS,
      800
    );

    // Verify Station A made exactly 16 transmission attempts
    expect(stA.state).toBe(StationState.ABORTED_EXCESSIVE_COLLISIONS);
    expect(stA.stats.transmissionAttempts).toBe(16);
    expect(stA.collisionCount).toBe(16);
    expect(stA.stats.excessiveCollisionDrops).toBe(1);
    expect(stA.stats.framesDelivered).toBe(0);

    // Advance clock further to guarantee no 17th transmission attempt occurs
    sim.stepTicks(50);
    expect(stA.stats.transmissionAttempts).toBe(16);
    expect(stA.state).toBe(StationState.ABORTED_EXCESSIVE_COLLISIONS);
  });

  it('Scenario 10: Allows transmission success on the 16th and final permitted attempt', () => {
    // Frame collides on attempts 1..15 (15 collisions), then succeeds on attempt 16
    const sim = new CsmaCdSimulator({
      frameTransmissionDuration: 8,
      maxPropagationDelay: 2,
      jamDuration: 2,
      attemptLimit: 16,
    });

    const stA = sim.stations.get('A');
    const stB = sim.stations.get('B');

    // On collisions 1..14: both choose slot 0 and collide
    // On collision 15: B chooses slot 5 while A chooses slot 0 => Attempt 16 of A succeeds!
    const slotsA = new Array(15).fill(0); // 15 backoffs all slot 0

    const slotsB = new Array(14).fill(0); // 14 backoffs slot 0
    slotsB.push(5); // 15th backoff chooses slot 5 (waits 5 slots = 20 ticks, allowing A to transmit clear)

    stA.setDeterministicSlots(slotsA);
    stB.setDeterministicSlots(slotsB);

    sim.send('A', 'Final Attempt 16 Frame', 'C');
    sim.send('B', 'Competing Frame', 'D');

    // Run until Station A delivers its frame
    sim.runUntil(s => s.stations.get('A').stats.framesDelivered === 1, 800);

    expect(stA.stats.framesDelivered).toBe(1);
    expect(stA.stats.transmissionAttempts).toBe(16); // Exactly 16 attempts made
    expect(stA.stats.excessiveCollisionDrops).toBe(0);
    expect(stA.state).toBe(StationState.IDLE);
  });
});

describe('MacView Component Rendering Smoke Test', () => {
  it('renders MacView component cleanly without runtime ReferenceErrors', () => {
    expect(() => {
      const html = renderToString(React.createElement(MacView));
      expect(html).toContain('Medium Access Control');
      expect(html).toContain('CSMA/CD Bus Contention Visualizer');
      expect(html).toContain('Physical Shared Bus Canvas');
      expect(html).toContain('Educational Contention Presets');
      expect(html).toContain('Real-Time MAC Protocol Event Log');
      expect(html).toContain('Viva Helper &amp; Technical Theory');
    }).not.toThrow();
  });

  it('renders App shell with active mac tab cleanly', () => {
    expect(() => {
      const html = renderToString(React.createElement(App, { defaultTab: 'mac' }));
      expect(html).toContain('Data Link Layer Protocol Simulator');
      expect(html).toContain('Phase 7: CSMA/CD Simulation Active');
      expect(html).toContain('Medium Access Control');
    }).not.toThrow();
  });
});
