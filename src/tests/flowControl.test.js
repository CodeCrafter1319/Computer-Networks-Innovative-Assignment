import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SimulationEngine } from '../core/engine/SimulationEngine.js';
import { Channel, TransmissionOutcome } from '../core/engine/Channel.js';
import {
  FrameType,
  createFrame,
  resetFrameIdCounter,
  serializeFrameHeader,
  deserializeFrameHeader,
  serializeFrameToWireBytes,
} from '../core/frame/FrameContract.js';
import {
  mod,
  seqDistance,
  isWithinWindow,
  seqAdvance,
  getMaxWindowSize,
  validateWindowSize,
} from '../core/flow-control/sequenceMath.js';
import { StopAndWaitARQ, SenderStatus } from '../core/flow-control/stopAndWait.js';
import { GoBackNARQ } from '../core/flow-control/goBackN.js';
import { SelectiveRepeatARQ } from '../core/flow-control/selectiveRepeat.js';
import { FlowControlSimulator, FlowControlProtocol } from '../core/flow-control/FlowControlSimulator.js';
import FlowControlView from '../ui/modules/FlowControlView.jsx';
import FramingView from '../ui/modules/FramingView.jsx';
import ErrorControlView from '../ui/modules/ErrorControlView.jsx';
import App from '../ui/App.jsx';
import ArqTimeoutPanel from '../ui/components/ArqTimeoutPanel.jsx';

describe('Sequence Math & Window Limits', () => {
  it('correctly calculates modulo for positive and negative values', () => {
    expect(mod(5, 8)).toBe(5);
    expect(mod(8, 8)).toBe(0);
    expect(mod(9, 8)).toBe(1);
    expect(mod(-1, 8)).toBe(7);
    expect(mod(-3, 8)).toBe(5);
  });

  it('calculates forward circular distance with wraparound', () => {
    // m = 3, M = 8 (0..7)
    expect(seqDistance(0, 3, 3)).toBe(3);
    expect(seqDistance(2, 6, 3)).toBe(4);
    expect(seqDistance(6, 2, 3)).toBe(4); // 6 -> 7 -> 0 -> 1 -> 2
    expect(seqDistance(7, 0, 3)).toBe(1);
    expect(seqDistance(5, 5, 3)).toBe(0);
  });

  it('tests window membership with isWithinWindow', () => {
    // Window [0, 4) in M=8: contains 0, 1, 2, 3
    expect(isWithinWindow(0, 0, 4, 3)).toBe(true);
    expect(isWithinWindow(2, 0, 4, 3)).toBe(true);
    expect(isWithinWindow(3, 0, 4, 3)).toBe(true);
    expect(isWithinWindow(4, 0, 4, 3)).toBe(false);

    // Wraparound window: [6, 2) of size 4 in M=8: contains 6, 7, 0, 1
    expect(isWithinWindow(6, 6, 4, 3)).toBe(true);
    expect(isWithinWindow(7, 6, 4, 3)).toBe(true);
    expect(isWithinWindow(0, 6, 4, 3)).toBe(true);
    expect(isWithinWindow(1, 6, 4, 3)).toBe(true);
    expect(isWithinWindow(2, 6, 4, 3)).toBe(false);
    expect(isWithinWindow(5, 6, 4, 3)).toBe(false);
  });

  it('advances sequence numbers in modulo 2^m', () => {
    expect(seqAdvance(6, 1, 3)).toBe(7);
    expect(seqAdvance(7, 1, 3)).toBe(0);
    expect(seqAdvance(7, 3, 3)).toBe(2);
  });

  it('enforces theoretical window size limits', () => {
    expect(getMaxWindowSize('SW', 1)).toBe(1);
    expect(getMaxWindowSize('GBN', 3)).toBe(7); // 2^3 - 1
    expect(getMaxWindowSize('GBN', 4)).toBe(15);
    expect(getMaxWindowSize('SR', 3)).toBe(4); // 2^(3-1)
    expect(getMaxWindowSize('SR', 4)).toBe(8);

    expect(validateWindowSize('GBN', 7, 3).valid).toBe(true);
    expect(validateWindowSize('GBN', 8, 3).valid).toBe(false);
    expect(validateWindowSize('SR', 4, 3).valid).toBe(true);
    expect(validateWindowSize('SR', 5, 3).valid).toBe(false);
    expect(validateWindowSize('SR', 0, 3).valid).toBe(false);
  });
});

describe('FrameContract & Serialization', () => {
  beforeEach(() => {
    resetFrameIdCounter();
  });

  it('creates canonical plain frame objects', () => {
    const frame = createFrame({
      type: FrameType.DATA,
      seq: 2,
      ack: 0,
      payload: 'Hello',
    });

    expect(frame.id).toBe(1);
    expect(frame.type).toBe('DATA');
    expect(frame.seq).toBe(2);
    expect(frame.payload).toBe('Hello');
    expect(frame.payloadText).toBe('Hello');
    expect(frame.corrupted).toBe(false);
  });

  it('serializes and deserializes compact 1-byte headers (m <= 3)', () => {
    const header = serializeFrameHeader(FrameType.DATA, 5, 3, 3);
    expect(header).toBeInstanceOf(Uint8Array);
    expect(header.length).toBe(1);

    const parsed = deserializeFrameHeader(header, 3);
    expect(parsed.type).toBe(FrameType.DATA);
    expect(parsed.seq).toBe(5);
    expect(parsed.ack).toBe(3);
  });

  it('serializes and deserializes 2-byte headers (m > 3)', () => {
    const header = serializeFrameHeader(FrameType.ACK, 14, 10, 4);
    expect(header.length).toBe(2);

    const parsed = deserializeFrameHeader(header, 4);
    expect(parsed.type).toBe(FrameType.ACK);
    expect(parsed.seq).toBe(14);
    expect(parsed.ack).toBe(10);
  });

  it('serializes frame into wire bytes for FCS computation', () => {
    const frame = createFrame({
      type: FrameType.DATA,
      seq: 1,
      ack: 0,
      payload: 'ABC',
    });
    const wireBytes = serializeFrameToWireBytes(frame, 3);
    expect(wireBytes).toBeInstanceOf(Uint8Array);
    expect(wireBytes.length).toBe(1 + 3); // 1 byte header + 3 bytes ASCII
    expect(wireBytes[1]).toBe(0x41); // 'A'
  });
});

describe('Stop-and-Wait ARQ Protocol', () => {
  let engine, forwardChannel, reverseChannel, sw;

  beforeEach(() => {
    engine = new SimulationEngine();
    forwardChannel = new Channel(engine, { propagationDelay: 4 });
    reverseChannel = new Channel(engine, { propagationDelay: 4 });
    sw = new StopAndWaitARQ(engine, forwardChannel, reverseChannel, { timeoutDuration: 12 });
  });

  it('successfully transmits and acknowledges a single frame', () => {
    expect(sw.canSend()).toBe(true);
    const res = sw.send('Packet 0');
    expect(res.success).toBe(true);
    expect(sw.status).toBe(SenderStatus.WAITING_FOR_ACK);
    expect(sw.canSend()).toBe(false);

    // Run until delivered and ACKed
    while (!engine.getQueue().isEmpty()) {
      engine.step();
    }

    expect(sw.status).toBe(SenderStatus.IDLE);
    expect(sw.timerEventId).toBeNull();
    expect(sw.senderSeq).toBe(1);
    expect(sw.stats.framesDelivered).toBe(1);
    expect(sw.stats.acksReceived).toBe(1);
    expect(sw.deliveredPayloads[0].payload).toBe('Packet 0');
  });

  it('alternates sequence numbers across multiple successful deliveries', () => {
    // Send frame 0
    sw.send('Msg 0');
    while (!engine.getQueue().isEmpty()) engine.step();
    expect(sw.senderSeq).toBe(1);

    // Send frame 1
    sw.send('Msg 1');
    while (!engine.getQueue().isEmpty()) engine.step();
    expect(sw.senderSeq).toBe(0);

    // Send frame 0 again
    sw.send('Msg 2');
    while (!engine.getQueue().isEmpty()) engine.step();
    expect(sw.senderSeq).toBe(1);

    expect(sw.stats.framesDelivered).toBe(3);
    expect(sw.deliveredPayloads.map(p => p.payload)).toEqual(['Msg 0', 'Msg 1', 'Msg 2']);
  });

  it('handles lost DATA frame with timeout and retransmission', () => {
    // Inject drop fault on forward channel for first transmission
    forwardChannel.addFault({ action: 'DROP' });

    sw.send('Important Data');
    expect(forwardChannel.getHistory()[0].outcome).toBe('DROPPED');

    // Run simulation to let timeout fire and retransmission succeed
    while (!engine.getQueue().isEmpty()) {
      engine.step();
    }

    expect(sw.stats.timeouts).toBe(1);
    expect(sw.stats.retransmissions).toBe(1);
    expect(sw.stats.framesDelivered).toBe(1);
    expect(sw.deliveredPayloads[0].payload).toBe('Important Data');
  });

  it('handles lost ACK frame with duplicate detection and ACK re-sending', () => {
    // Drop first ACK frame from receiver
    reverseChannel.addFault({ action: 'DROP' });

    sw.send('Data with lost ACK');

    // Run until completion
    while (!engine.getQueue().isEmpty()) {
      engine.step();
    }

    expect(sw.stats.timeouts).toBe(1);
    expect(sw.stats.retransmissions).toBe(1);
    expect(sw.stats.duplicatesDiscarded).toBe(1);
    expect(sw.stats.framesDelivered).toBe(1); // Receiver delivered only once!
  });

  it('discards corrupted frames and recovers via timeout', () => {
    // Corrupt first data frame
    forwardChannel.addFault({ action: 'CORRUPT', bitIndex: 0 });

    sw.send('Data to Corrupt');

    while (!engine.getQueue().isEmpty()) {
      engine.step();
    }

    expect(sw.stats.corruptedReceived).toBe(1);
    expect(sw.stats.timeouts).toBe(1);
    expect(sw.stats.retransmissions).toBe(1);
    expect(sw.stats.framesDelivered).toBe(1);
  });
});

describe('Go-Back-N ARQ Protocol', () => {
  let engine, forwardChannel, reverseChannel, gbn;

  beforeEach(() => {
    engine = new SimulationEngine();
    forwardChannel = new Channel(engine, { propagationDelay: 5 });
    reverseChannel = new Channel(engine, { propagationDelay: 5 });
    gbn = new GoBackNARQ(engine, forwardChannel, reverseChannel, {
      m: 3,
      windowSize: 4,
      timeoutDuration: 18,
    });
  });

  it('allows sending up to window size Ws frames then blocks', () => {
    expect(gbn.send('F0').success).toBe(true);
    expect(gbn.send('F1').success).toBe(true);
    expect(gbn.send('F2').success).toBe(true);
    expect(gbn.send('F3').success).toBe(true);

    expect(gbn.canSend()).toBe(false);
    const blocked = gbn.send('F4');
    expect(blocked.success).toBe(false);
    expect(blocked.reason).toBe('WINDOW_FULL');
  });

  it('delivers all in-order frames and cumulative ACKs advance window', () => {
    gbn.send('A');
    gbn.send('B');
    gbn.send('C');
    gbn.send('D');

    while (!engine.getQueue().isEmpty()) {
      engine.step();
    }

    expect(gbn.stats.framesDelivered).toBe(4);
    expect(gbn.base).toBe(4);
    expect(gbn.canSend()).toBe(true);
  });

  it('discards out-of-order frames when an intermediate frame is lost and retransmits full window on timeout', () => {
    // Transmit F0 normally
    gbn.send('F0');
    // Drop F1
    forwardChannel.addFault({ action: 'DROP' });
    gbn.send('F1');
    // Transmit F2, F3
    gbn.send('F2');
    gbn.send('F3');

    // Run engine to completion
    while (!engine.getQueue().isEmpty()) {
      engine.step();
    }

    // F0 was delivered. F1 was dropped. F2, F3 arrived out-of-order and were discarded by receiver.
    // Timer for F1 timed out -> sender retransmitted F1, F2, F3 -> receiver accepted F1, F2, F3 in order!
    expect(gbn.stats.timeouts).toBeGreaterThanOrEqual(1);
    expect(gbn.stats.framesDelivered).toBe(4);
    expect(gbn.deliveredPayloads.map(p => p.payload)).toEqual(['F0', 'F1', 'F2', 'F3']);
    expect(gbn.base).toBe(4);
  });

  it('correctly handles sequence number wraparound across 2^m boundaries', () => {
    // Send 7 frames to wrap around modulo 8
    for (let i = 0; i < 7; i++) {
      while (!gbn.canSend()) {
        engine.step();
      }
      gbn.send(`Payload ${i}`);
    }

    while (!engine.getQueue().isEmpty()) {
      engine.step();
    }

    expect(gbn.stats.framesDelivered).toBe(7);
    expect(gbn.base).toBe(7);

    // Next frame wraps sequence number to 0
    gbn.send('Wrap Frame 8');
    while (!engine.getQueue().isEmpty()) {
      engine.step();
    }

    expect(gbn.stats.framesDelivered).toBe(8);
    expect(gbn.base).toBe(0);
  });
});

describe('Selective Repeat ARQ Protocol', () => {
  let engine, forwardChannel, reverseChannel, sr;

  beforeEach(() => {
    engine = new SimulationEngine();
    forwardChannel = new Channel(engine, { propagationDelay: 5 });
    reverseChannel = new Channel(engine, { propagationDelay: 5 });
    sr = new SelectiveRepeatARQ(engine, forwardChannel, reverseChannel, {
      m: 3,
      windowSize: 4,
      rxWindowSize: 4,
      timeoutDuration: 18,
    });
  });

  it('rejects illegal window configurations where Ws + Wr > 2^m', () => {
    expect(() => {
      new SelectiveRepeatARQ(engine, forwardChannel, reverseChannel, {
        m: 3,
        windowSize: 5, // 5 + 5 = 10 > 8
      });
    }).toThrow();
  });

  it('buffers out-of-order frames and retransmits ONLY the lost frame', () => {
    // Send F0 (success)
    sr.send('F0');

    // Drop F1
    forwardChannel.addFault({ action: 'DROP' });
    sr.send('F1');

    // Send F2, F3 (success)
    sr.send('F2');
    sr.send('F3');

    // Run until all events settle
    while (!engine.getQueue().isEmpty()) {
      engine.step();
    }

    // F0 was delivered. F1 was dropped and selectively retransmitted.
    // F2 and F3 were buffered out of order at the receiver.
    // Once F1 arrived, F1, F2, F3 were delivered in order!
    expect(sr.stats.timeouts).toBe(1);
    expect(sr.stats.retransmissions).toBe(1); // Only F1 retransmitted!
    expect(sr.stats.outOfOrderBuffered).toBe(2); // F2 and F3 were buffered
    expect(sr.stats.framesDelivered).toBe(4);
    expect(sr.deliveredPayloads.map(p => p.payload)).toEqual(['F0', 'F1', 'F2', 'F3']);
    expect(sr.base).toBe(4);
    expect(sr.rxBase).toBe(4);
  });

  it('re-acknowledges frames in previous window when ACK is lost to prevent sender deadlock', () => {
    // Drop ACK for F0
    reverseChannel.addFault({ action: 'DROP' });

    sr.send('F0');

    // Run until completion
    while (!engine.getQueue().isEmpty()) {
      engine.step();
    }

    // F0 was received and delivered by receiver on first pass.
    // ACK 0 was dropped.
    // Sender timed out on F0 and selectively retransmitted F0.
    // Receiver saw F0 in previous window, did NOT deliver duplicate payload,
    // and re-sent ACK 0, unblocking the sender!
    expect(sr.stats.timeouts).toBe(1);
    expect(sr.stats.retransmissions).toBe(1);
    expect(sr.stats.framesDelivered).toBe(1); // Delivered exactly once
    expect(sr.base).toBe(1);
  });

  it('correctly handles sequence number wraparound across 2^m boundaries', () => {
    // Send 7 frames to wrap around modulo 8
    for (let i = 0; i < 7; i++) {
      while (!sr.canSend()) {
        engine.step();
      }
      sr.send(`SR Payload ${i}`);
    }

    while (!engine.getQueue().isEmpty()) {
      engine.step();
    }

    expect(sr.stats.framesDelivered).toBe(7);
    expect(sr.base).toBe(7);
    expect(sr.rxBase).toBe(7);

    // Next frame wraps sequence number to 0
    sr.send('SR Wrap Frame 8');
    while (!engine.getQueue().isEmpty()) {
      engine.step();
    }

    expect(sr.stats.framesDelivered).toBe(8);
    expect(sr.base).toBe(0);
    expect(sr.rxBase).toBe(0);
  });
});

describe('FlowControlSimulator Facade & Diagnostics', () => {
  it('runs stepTick and calculates theoretical metrics correctly', () => {
    const sim = new FlowControlSimulator({
      protocol: FlowControlProtocol.GO_BACK_N,
      m: 3,
      windowSize: 4,
      propagationDelay: 5,
      timeoutDuration: 16,
    });

    const metrics = sim.getTheoreticalMetrics();
    expect(metrics.Tp).toBe(5);
    expect(metrics.a).toBe(5);
    expect(metrics.theoreticalEfficiency).toBeGreaterThan(0);
    expect(metrics.optimalWindowSize).toBe(11); // 1 + 2*5 = 11

    sim.sendBatch(3, 'BatchItem');
    sim.stepTicks(15);

    const snapshot = sim.getSnapshot();
    expect(snapshot.protocol).toBe('GBN');
    expect(snapshot.protocolState.receiver.deliveredCount).toBe(3);
    expect(snapshot.virtualTick).toBe(15);
  });

  it('distinguishes channel time utilization from transmission goodput', () => {
    const sim = new FlowControlSimulator({
      protocol: FlowControlProtocol.STOP_AND_WAIT,
      propagationDelay: 5,
      transmissionDelay: 1, // a = 5, RTT = 11 ticks, ideal eta = 1 / (1 + 10) = 9.09%
    });

    sim.send('Frame 1');
    // Run until full round trip finishes (ACK received and sender returns to IDLE)
    sim.runUntil(s => s.protocolInstance.status === 'IDLE', 30);

    const metrics = sim.getTheoreticalMetrics();
    expect(metrics.theoreticalEfficiency).toBe(9.1);
    // Transmitted cleanly without loss -> transmission efficiency is 100%
    expect(metrics.transmissionEfficiency).toBe(100);
    // Channel utilization over round trip (1 transmission tick / 11 elapsed ticks) = 9.09% -> 9.1%
    expect(metrics.channelUtilization).toBe(9.1);
    expect(metrics.channelUtilization).toBe(metrics.theoreticalEfficiency);
  });

  it('verifies exact Stop-and-Wait channel utilization against a worked timing example with explicit assumptions', () => {
    // Explicit assumptions:
    // 1. Data frame transmission time: Tt = 2 virtual ticks
    // 2. Link one-way propagation delay: Tp = 4 virtual ticks
    // 3. ACK transmission time: Tack = 0 virtual ticks (negligible control frame)
    // 4. Processing delay: Tproc = 0 virtual ticks
    // 5. Parameter a = Tp / Tt = 4 / 2 = 2.0
    // 6. Expected cycle duration: Tcycle = Tt + Tp + Tack + Tp = 2 + 4 + 0 + 4 = 10 ticks
    // 7. Theoretical ideal utilization: eta = 1 / (1 + 2*a) = 1 / (1 + 4) = 1/5 = 0.20 = 20.0%
    const sim = new FlowControlSimulator({
      protocol: FlowControlProtocol.STOP_AND_WAIT,
      propagationDelay: 4,
      transmissionDelay: 2,
      timeoutDuration: 20,
    });

    expect(sim.engine.getCurrentTick()).toBe(0);

    // At t = 0: Sender begins transmission of Frame 0
    sim.send('Worked Example Frame');

    // Transmitter is active during [0, 2]
    expect(sim.forwardChannel.getHistory()[0].startTick).toBe(0);
    expect(sim.forwardChannel.getHistory()[0].txStartTick).toBe(0);
    expect(sim.forwardChannel.getHistory()[0].txEndTick).toBe(2);
    // Trailing bit reaches receiver at txEnd + Tp = 2 + 4 = 6
    expect(sim.forwardChannel.getHistory()[0].deliveryTick).toBe(6);

    // Step until Frame 0 is delivered at receiver: exactly at t = 6
    sim.stepTicks(6);
    expect(sim.engine.getCurrentTick()).toBe(6);
    expect(sim.protocolInstance.stats.framesDelivered).toBe(1);

    // Receiver transmits ACK at t = 6; propagates in Tp = 4 ticks, arriving at t = 10
    expect(sim.reverseChannel.getHistory()[0].startTick).toBe(6);
    expect(sim.reverseChannel.getHistory()[0].deliveryTick).toBe(10);

    // Step until ACK arrives and sender returns to IDLE: exactly at t = 10
    sim.stepTicks(4);
    expect(sim.engine.getCurrentTick()).toBe(10);
    expect(sim.protocolInstance.status).toBe(SenderStatus.IDLE);

    // Verify exact numerical utilization:
    // Useful transmission time = 1 frame * 2 ticks = 2 ticks
    // Total elapsed time = 10 ticks
    // Measured utilization = 2 / 10 = 20.0%
    // Theoretical utilization = 1 / (1 + 2 * (4/2)) = 1 / 5 = 20.0%
    const metrics = sim.getTheoreticalMetrics();
    expect(metrics.Tp).toBe(4);
    expect(metrics.Tt).toBe(2);
    expect(metrics.a).toBe(2);
    expect(metrics.theoreticalEfficiency).toBe(20.0);
    expect(metrics.channelUtilization).toBe(20.0);
    expect(metrics.channelUtilization).toBe(metrics.theoreticalEfficiency);
  });

  it('supports interactive frame dropping in-flight', () => {
    const sim = new FlowControlSimulator({
      protocol: FlowControlProtocol.STOP_AND_WAIT,
      propagationDelay: 6,
    });

    sim.send('FrameToDrop');
    sim.stepTicks(2); // In flight

    const inFlight = sim.getInFlightFrames();
    expect(inFlight.length).toBe(1);

    const dropped = sim.dropInFlight(inFlight[0].eventId);
    expect(dropped).toBe(true);

    // Fast-forward to timeout and recovery
    sim.runUntil(s => s.protocolInstance.stats.framesDelivered === 1, 50);

    expect(sim.protocolInstance.stats.timeouts).toBe(1);
    expect(sim.protocolInstance.stats.framesDelivered).toBe(1);
  });

  it('supports interactive frame corruption in-flight', () => {
    const sim = new FlowControlSimulator({
      protocol: FlowControlProtocol.STOP_AND_WAIT,
      propagationDelay: 6,
    });

    sim.send('FrameToCorrupt');
    sim.stepTicks(2);

    const inFlight = sim.getInFlightFrames();
    expect(inFlight.length).toBe(1);

    const corrupted = sim.corruptInFlight(inFlight[0].eventId);
    expect(corrupted).toBe(true);

    // Run until delivered after timeout retransmission
    sim.runUntil(s => s.protocolInstance.stats.framesDelivered === 1, 60);

    expect(sim.protocolInstance.stats.corruptedReceived).toBe(1);
    expect(sim.protocolInstance.stats.timeouts).toBe(1);
    expect(sim.protocolInstance.stats.framesDelivered).toBe(1);
  });

  it('resets cleanly with new protocol and configuration', () => {
    const sim = new FlowControlSimulator({
      protocol: FlowControlProtocol.STOP_AND_WAIT,
    });
    sim.send('Test');
    sim.stepTicks(5);

    sim.reset({
      protocol: FlowControlProtocol.SELECTIVE_REPEAT,
      m: 3,
      windowSize: 4,
      propagationDelay: 4,
    });

    expect(sim.config.protocol).toBe('SR');
    expect(sim.engine.getCurrentTick()).toBe(0);
    expect(sim.eventLogs.length).toBe(0);
    expect(sim.protocolInstance.base).toBe(0);
  });

  it('validates constructor arguments strictly', () => {
    expect(() => new StopAndWaitARQ()).toThrow();
    expect(() => new GoBackNARQ()).toThrow();
    expect(() => new SelectiveRepeatARQ()).toThrow();

    const dummyEngine = new SimulationEngine();
    const fwd = new Channel(dummyEngine);
    const rev = new Channel(dummyEngine);

    expect(() => new GoBackNARQ(dummyEngine, fwd, rev, { m: 3, windowSize: 8 })).toThrow();
  });
});

describe('Flow Control Metric Semantics & Channel Utilization Audits', () => {
  it('Scenario A: Single clean transmission with zero retransmissions', () => {
    // Parameters: Tt = 1, Tp = 5, timeout = 20
    // Expected transaction timeline:
    // t = 0: Sender begins DATA #0 transmission (busy during [0, 1])
    // t = 1: Trailing bit leaves transmitter; forward channel occupied for 1 tick
    // t = 6: DATA #0 reaches receiver; receiver delivers frame and sends ACK #1
    // t = 11: ACK #1 reaches sender; sender returns to IDLE
    // Telapsed = 11 ticks
    const sim = new FlowControlSimulator({
      protocol: FlowControlProtocol.STOP_AND_WAIT,
      propagationDelay: 5,
      transmissionDelay: 1,
      timeoutDuration: 20,
    });

    sim.send('Clean DATA');
    sim.stepTicks(11);

    expect(sim.engine.getCurrentTick()).toBe(11);
    expect(sim.protocolInstance.status).toBe(SenderStatus.IDLE);
    expect(sim.protocolInstance.stats.totalTransmissions).toBe(1);
    expect(sim.protocolInstance.stats.initialTransmissions).toBe(1);
    expect(sim.protocolInstance.stats.retransmissions).toBe(0);
    expect(sim.protocolInstance.stats.framesDelivered).toBe(1);
    expect(sim.protocolInstance.stats.duplicatesDiscarded).toBe(0);

    const metrics = sim.getTheoreticalMetrics();
    expect(metrics.channelOccupiedTicks).toBe(1);
    // U = 1 / 11 * 100 = 9.1%
    expect(metrics.channelUtilization).toBe(9.1);
    // Stx = (1 / 1) * 100 = 100.0%
    expect(metrics.transmissionSuccessRatio).toBe(100.0);
    // Useful utilization = (1 * 1 / 11) * 100 = 9.1%
    expect(metrics.usefulUtilization).toBe(9.1);
    // Theoretical efficiency = 1 / (1 + 2 * (5/1)) = 1 / 11 = 9.1%
    expect(metrics.theoreticalEfficiency).toBe(9.1);
    // Goodput = 1 / 11 = 0.091 frames/tick
    expect(metrics.goodputFramesPerTick).toBe(0.091);
    expect(metrics.totalDeliveredBits).toBe('Clean DATA'.length * 8);
  });

  it('Scenario B: Lost DATA frame followed by timeout and successful retransmission', () => {
    // Parameters: Tt = 1, Tp = 5, timeout = 16
    // Timeline:
    // t = 0: Sender transmits DATA #0 (attempt 1, busy [0, 1]). Forward channel DROPS frame.
    // t = 16: Sender timer expires; retransmits DATA #0 (attempt 2, busy [16, 17]).
    // t = 17: Trailing bit leaves transmitter; forward channel occupied for 2 ticks total.
    // t = 22: DATA #0 reaches receiver; receiver delivers frame and sends ACK #1.
    // t = 27: ACK #1 reaches sender; sender returns to IDLE.
    // Telapsed = 27 ticks
    const sim = new FlowControlSimulator({
      protocol: FlowControlProtocol.STOP_AND_WAIT,
      propagationDelay: 5,
      transmissionDelay: 1,
      timeoutDuration: 16,
    });

    // Program deterministic drop for the first forward transmission
    sim.forwardChannel.setFaultPlan([{ action: 'DROP', outcome: TransmissionOutcome.DROPPED }]);

    sim.send('Lost DATA');
    sim.stepTicks(27);

    expect(sim.engine.getCurrentTick()).toBe(27);
    expect(sim.protocolInstance.status).toBe(SenderStatus.IDLE);
    expect(sim.protocolInstance.stats.totalTransmissions).toBe(2);
    expect(sim.protocolInstance.stats.initialTransmissions).toBe(1);
    expect(sim.protocolInstance.stats.retransmissions).toBe(1);
    expect(sim.protocolInstance.stats.timeouts).toBe(1);
    expect(sim.protocolInstance.stats.framesDelivered).toBe(1);
    expect(sim.protocolInstance.stats.duplicatesDiscarded).toBe(0);

    const metrics = sim.getTheoreticalMetrics();
    // Physical channel occupancy counts both attempts: 1 + 1 = 2 ticks
    expect(metrics.channelOccupiedTicks).toBe(2);
    // U = 2 / 27 * 100 = 7.4%
    expect(metrics.channelUtilization).toBe(7.4);
    // Stx = (1 / 2) * 100 = 50.0%
    expect(metrics.transmissionSuccessRatio).toBe(50.0);
    // Useful utilization = (1 * 1 / 27) * 100 = 3.7%
    expect(metrics.usefulUtilization).toBe(3.7);
    // Verifying relationship: U_useful = U * (Stx / 100) (within rounding precision)
    expect(metrics.usefulUtilization).toBe(Number(((metrics.channelUtilization * (metrics.transmissionSuccessRatio / 100))).toFixed(1)));
    expect(metrics.goodputFramesPerTick).toBe(Number((1 / 27).toFixed(3)));
  });

  it('Scenario C: Lost ACK causing timeout retransmission where duplicate payload is suppressed', () => {
    // Parameters: Tt = 1, Tp = 5, timeout = 16
    // Timeline:
    // t = 0: Sender transmits DATA #0 (attempt 1, busy [0, 1]).
    // t = 6: DATA #0 reaches receiver; receiver delivers payload, sends ACK #1.
    // Reverse channel DROPS the first ACK!
    // t = 16: Sender timer expires; retransmits DATA #0 (attempt 2, busy [16, 17]).
    // t = 22: DATA #0 reaches receiver; receiver recognizes duplicate, SUPPRESSES delivery, re-sends ACK #1.
    // t = 27: ACK #1 reaches sender; sender returns to IDLE.
    // Telapsed = 27 ticks
    const sim = new FlowControlSimulator({
      protocol: FlowControlProtocol.STOP_AND_WAIT,
      propagationDelay: 5,
      transmissionDelay: 1,
      timeoutDuration: 16,
    });

    // Program deterministic drop for the first reverse ACK transmission
    sim.reverseChannel.setFaultPlan([{ action: 'DROP', outcome: TransmissionOutcome.DROPPED }]);

    sim.send('Duplicate DATA');
    sim.stepTicks(27);

    expect(sim.engine.getCurrentTick()).toBe(27);
    expect(sim.protocolInstance.status).toBe(SenderStatus.IDLE);
    expect(sim.protocolInstance.stats.totalTransmissions).toBe(2);
    expect(sim.protocolInstance.stats.initialTransmissions).toBe(1);
    expect(sim.protocolInstance.stats.retransmissions).toBe(1);
    expect(sim.protocolInstance.stats.timeouts).toBe(1);
    // Exactly 1 frame delivered, 1 duplicate suppressed
    expect(sim.protocolInstance.stats.framesDelivered).toBe(1);
    expect(sim.protocolInstance.stats.duplicatesDiscarded).toBe(1);
    expect(sim.protocolInstance.deliveredPayloads.length).toBe(1);

    const metrics = sim.getTheoreticalMetrics();
    // Physical forward channel occupancy counts both transmissions: 1 + 1 = 2 ticks
    expect(metrics.channelOccupiedTicks).toBe(2);
    // U = 2 / 27 * 100 = 7.4%
    expect(metrics.channelUtilization).toBe(7.4);
    // Stx = 1 delivered / 2 attempts * 100 = 50.0%
    expect(metrics.transmissionSuccessRatio).toBe(50.0);
    // Useful utilization = 1 / 27 * 100 = 3.7%
    expect(metrics.usefulUtilization).toBe(3.7);
    expect(metrics.goodputFramesPerTick).toBe(Number((1 / 27).toFixed(3)));
  });
});

describe('FlowControlView Component Rendering Smoke Test', () => {
  it('renders FlowControlView component cleanly without runtime ReferenceErrors', () => {
    expect(() => {
      const html = renderToString(React.createElement(FlowControlView));
      expect(html).toContain('Flow Control &amp; Sliding Window Visualizer');
      expect(html).toContain('Stop-and-Wait ARQ');
      expect(html).toContain('Go-Back-N ARQ');
      expect(html).toContain('Selective Repeat ARQ');
      expect(html).toContain('Channel Utilization (U)');
      expect(html).toContain('Success Ratio (Stx)');
      expect(html).toContain('Goodput');
      expect(html).toContain('Live Discrete-Event Packet Trace');
    }).not.toThrow();
  });

  it('renders App shell with active flow-control tab cleanly', () => {
    expect(() => {
      const html = renderToString(React.createElement(App));
      expect(html).toContain('Data Link Layer Protocol Simulator');
      expect(html).toContain('Computer Networks Innovative Assignment');
      expect(html).toContain('Flow Control &amp; Sliding Window Visualizer');
    }).not.toThrow();
  });

  it('renders all views (Framing, ErrorControl, FlowControl) without runtime exceptions', () => {
    expect(() => {
      const framingHtml = renderToString(React.createElement(FramingView));
      expect(framingHtml).toContain('HDLC Bit Stuffing &amp; Destuffing Simulator');

      const errorHtml = renderToString(React.createElement(ErrorControlView));
      expect(errorHtml).toContain('Cyclic Redundancy Check');

      const fcHtml = renderToString(React.createElement(FlowControlView));
      expect(fcHtml).toContain('Flow Control &amp; Sliding Window Visualizer');
    }).not.toThrow();
  });

  it('renders the visual learning canvas, message input, concrete queue, and live narration in FlowControlView', () => {
    const html = renderToString(React.createElement(FlowControlView));
    expect(html).toContain('Message Payload &amp; Discrete Frame Creation');
    expect(html).toContain('Concrete Segmented Frame Queue');
    expect(html).toContain('Live Wire Narration');
    expect(html).toContain('Physical Duplex Link');
    expect(html).toContain('Station A (Sender)');
    expect(html).toContain('Station B (Receiver)');
    expect(html).toContain('Sender Sliding Window');
    expect(html).toContain('Receiver Window');
    expect(html).toContain('Educational Scenario Presets');
    expect(html).toContain('Sliding Window Mathematics &amp; Protocol Theory');
  });

  it('FlowControlSimulator isComplete and runToCompletion drain events cleanly', () => {
    const sim = new FlowControlSimulator({
      protocol: FlowControlProtocol.GO_BACK_N,
      m: 3,
      windowSize: 4,
    });
    expect(sim.isComplete()).toBe(true);

    sim.send('Frame 0');
    expect(sim.isComplete()).toBe(false);

    const completion = sim.runToCompletion(100);
    expect(completion.completed).toBe(true);
    expect(sim.isComplete()).toBe(true);
    expect(sim.protocolInstance.stats.framesDelivered).toBe(1);
  });

  it('identifies ACK frames traveling along reverse path as direction REVERSE in getInFlightFrames', () => {
    const sim = new FlowControlSimulator({
      protocol: FlowControlProtocol.STOP_AND_WAIT,
      propagationDelay: 4,
      transmissionDelay: 1,
    });

    sim.send('Hello SW');

    // At t=1, DATA frame is traveling forward
    sim.stepTicks(1);
    const forwardInFlight = sim.getInFlightFrames();
    expect(forwardInFlight.length).toBe(1);
    expect(forwardInFlight[0].direction).toBe('FORWARD');
    expect(forwardInFlight[0].channelName).toBe('Forward');
    expect(forwardInFlight[0].frame.payload).toBe('Hello SW');

    // At t=5, DATA frame arrives at receiver; receiver emits ACK scheduled for arrival at t=9
    sim.stepTicks(4); // now t=5
    sim.stepTicks(1); // now t=6: ACK is in-flight on reverse channel
    const reverseInFlight = sim.getInFlightFrames();
    expect(reverseInFlight.length).toBe(1);
    expect(reverseInFlight[0].direction).toBe('REVERSE');
    expect(reverseInFlight[0].channelName).toBe('Reverse');
    expect(reverseInFlight[0].frame.type).toBe(FrameType.ACK);
    expect(reverseInFlight[0].progress).toBeGreaterThan(0);
    expect(reverseInFlight[0].progress).toBeLessThan(1);

    // Step to completion: ACK arrives at sender, sender window clears
    sim.runToCompletion(50);
    expect(sim.isComplete()).toBe(true);
    expect(sim.getInFlightFrames().length).toBe(0);
    expect(sim.protocolInstance.status).toBe('IDLE');
    expect(sim.protocolInstance.stats.framesDelivered).toBe(1);
  });

  it('renders segmented concrete queue with status badges and exact 3 frames for NETWORKS LAB 2026 in FlowControlView', () => {
    const html = renderToString(React.createElement(FlowControlView));
    expect(html).toContain('Concrete Segmented Frame Queue (3 Frames)');
    expect(html).toContain('NETWORKS');
    expect(html).toContain(' LAB 202');
    expect(html).toContain('6');
    expect(html).toContain('WAITING');
  });

  describe('Live ARQ Timeout Countdown and Retransmission Visualization', () => {
    it('starts timeout countdown on DATA send and calculates remaining ticks correctly from virtual clock', () => {
      const sim = new FlowControlSimulator({
        protocol: FlowControlProtocol.STOP_AND_WAIT,
        timeoutDuration: 14,
        propagationDelay: 4,
        transmissionDelay: 1,
      });

      // Before send
      let timerState = sim.getTimerState();
      expect(timerState.active).toBe(false);
      expect(timerState.remainingTicks).toBe(0);

      // Send Frame 0 at t=0
      sim.send('Frame 0');
      timerState = sim.getTimerState();
      expect(timerState.active).toBe(true);
      expect(timerState.status).toBe('WAITING_FOR_ACK');
      expect(timerState.deadlineTick).toBe(14);
      expect(timerState.duration).toBe(14);
      expect(timerState.remainingTicks).toBe(14);
      expect(timerState.frameSeq).toBe(0);
      expect(timerState.attempt).toBe(1);

      // Step virtual clock to t=3 (3 ticks elapsed)
      sim.stepTicks(3);
      timerState = sim.getTimerState();
      expect(sim.engine.getCurrentTick()).toBe(3);
      expect(timerState.active).toBe(true);
      expect(timerState.remainingTicks).toBe(11); // 14 - 3 = 11

      // Step virtual clock to t=8 (5 more ticks elapsed)
      sim.stepTicks(5);
      timerState = sim.getTimerState();
      expect(sim.engine.getCurrentTick()).toBe(8);
      expect(timerState.active).toBe(true);
      expect(timerState.remainingTicks).toBe(6); // 14 - 8 = 6
    });

    it('freezes countdown while simulation is paused without decreasing virtual time', () => {
      const sim = new FlowControlSimulator({
        protocol: FlowControlProtocol.STOP_AND_WAIT,
        timeoutDuration: 14,
      });
      sim.send('Pause Test');
      sim.stepTicks(4); // t=4, remaining=10

      const frozenVal1 = sim.getTimerState().remainingTicks;
      expect(frozenVal1).toBe(10);

      // Virtual clock does not advance
      const frozenVal2 = sim.getTimerState().remainingTicks;
      expect(frozenVal2).toBe(10);
      expect(sim.getTimerState().currentTick).toBe(4);
    });

    it('cancels timer upon receipt of valid ACK', () => {
      const sim = new FlowControlSimulator({
        protocol: FlowControlProtocol.STOP_AND_WAIT,
        timeoutDuration: 14,
        propagationDelay: 4,
        transmissionDelay: 1,
      });

      sim.send('Ack Cancel Test');
      expect(sim.getTimerState().active).toBe(true);

      // t=0: DATA sent. t=5: DATA arrives at receiver, ACK emitted. t=9: ACK arrives at sender.
      sim.stepTicks(9);
      expect(sim.engine.getCurrentTick()).toBe(9);

      const timerState = sim.getTimerState();
      expect(timerState.active).toBe(false);
      expect(timerState.status).toBe('ACK_RECEIVED');
      expect(timerState.remainingTicks).toBe(0);
      expect(timerState.lastEvent?.type).toBe('ACK_RECEIVED');
    });

    it('expires at exact deadline and initiates retransmission on Corrupt DATA', () => {
      const sim = new FlowControlSimulator({
        protocol: FlowControlProtocol.STOP_AND_WAIT,
        timeoutDuration: 12,
        propagationDelay: 3,
        transmissionDelay: 1,
      });

      // Inject bit corruption on forward channel
      sim.forwardChannel.setFaultPlan([{ transmissionIndex: 1, action: 'CORRUPT' }]);
      sim.send('Corrupt Test');

      // t=0: sent, timer starts with deadline t=12
      expect(sim.getTimerState().deadlineTick).toBe(12);

      // t=4: arrives at receiver with corruption. Discarded silently. No ACK sent.
      sim.stepTicks(4);
      expect(sim.protocolInstance.stats.corruptedReceived).toBe(1);
      expect(sim.protocolInstance.stats.acksSent).toBe(0);
      expect(sim.getTimerState().active).toBe(true);
      expect(sim.getTimerState().remainingTicks).toBe(8); // 12 - 4 = 8

      // Step to t=12 (exact timeout deadline)
      sim.stepTicks(8);
      expect(sim.engine.getCurrentTick()).toBe(12);

      // Timeout occurred, attempt incremented to 2, new timeout deadline at t=24
      const timerState = sim.getTimerState();
      expect(sim.protocolInstance.stats.timeouts).toBe(1);
      expect(sim.protocolInstance.stats.retransmissions).toBe(1);
      expect(timerState.active).toBe(true);
      expect(timerState.attempt).toBe(2);
      expect(timerState.deadlineTick).toBe(24);
      expect(timerState.remainingTicks).toBe(12);

      // Run to full completion: retransmission arrives cleanly and is ACKed
      sim.runToCompletion(100);
      expect(sim.isComplete()).toBe(true);
      expect(sim.protocolInstance.stats.framesDelivered).toBe(1);
      expect(sim.getTimerState().active).toBe(false);
    });

    it('handles Dropped DATA with timeout and retransmission', () => {
      const sim = new FlowControlSimulator({
        protocol: FlowControlProtocol.STOP_AND_WAIT,
        timeoutDuration: 10,
        propagationDelay: 3,
        transmissionDelay: 1,
      });

      // Drop DATA in channel
      sim.forwardChannel.setFaultPlan([{ transmissionIndex: 1, action: 'DROP' }]);
      sim.send('Drop DATA Test');

      expect(sim.getTimerState().deadlineTick).toBe(10);

      // Step to t=10
      sim.stepTicks(10);
      expect(sim.engine.getCurrentTick()).toBe(10);
      expect(sim.protocolInstance.stats.timeouts).toBe(1);
      expect(sim.protocolInstance.stats.retransmissions).toBe(1);
      expect(sim.protocolInstance.stats.framesDelivered).toBe(0);

      // Run to completion: retransmission delivers successfully
      sim.runToCompletion(100);
      expect(sim.isComplete()).toBe(true);
      expect(sim.protocolInstance.stats.framesDelivered).toBe(1);
    });

    it('handles Dropped ACK with sender timeout, duplicate DATA, and duplicate suppression', () => {
      const sim = new FlowControlSimulator({
        protocol: FlowControlProtocol.STOP_AND_WAIT,
        timeoutDuration: 12,
        propagationDelay: 3,
        transmissionDelay: 1,
      });

      // Drop first reverse ACK
      sim.reverseChannel.setFaultPlan([{ transmissionIndex: 1, action: 'DROP' }]);
      sim.send('Drop ACK Test');

      // t=4: DATA delivered, ACK 1 emitted on reverse channel.
      sim.stepTicks(4);
      expect(sim.protocolInstance.stats.framesDelivered).toBe(1);
      expect(sim.protocolInstance.stats.acksSent).toBe(1);

      // Step to t=12: ACK was dropped, sender times out
      sim.stepTicks(8);
      expect(sim.engine.getCurrentTick()).toBe(12);
      expect(sim.protocolInstance.stats.timeouts).toBe(1);

      // Retransmission occurs with attempt 2
      expect(sim.getTimerState().attempt).toBe(2);

      // Run to completion: receiver suppresses duplicate, sends ACK again, sender accepts
      sim.runToCompletion(100);
      expect(sim.isComplete()).toBe(true);
      expect(sim.protocolInstance.stats.duplicatesDiscarded).toBe(1);
      expect(sim.protocolInstance.stats.framesDelivered).toBe(1);
      expect(sim.getTimerState().active).toBe(false);
    });

    it('Go-Back-N tracks oldest unacknowledged frame timer and retransmits entire window on timeout', () => {
      const sim = new FlowControlSimulator({
        protocol: FlowControlProtocol.GO_BACK_N,
        m: 3,
        windowSize: 4,
        timeoutDuration: 16,
        propagationDelay: 5,
        transmissionDelay: 1,
      });

      // Drop first DATA frame
      sim.forwardChannel.setFaultPlan([{ transmissionIndex: 1, action: 'DROP' }]);
      sim.send('GBN-0');
      sim.send('GBN-1');
      sim.send('GBN-2');

      const timerState = sim.getTimerState();
      expect(timerState.active).toBe(true);
      expect(timerState.base).toBe(0);
      expect(timerState.duration).toBe(16);
      expect(timerState.deadlineTick).toBe(16);

      // Step to t=16
      sim.stepTicks(16);
      expect(sim.protocolInstance.stats.timeouts).toBe(1);
      // All 3 frames retransmitted
      expect(sim.protocolInstance.stats.retransmissions).toBe(3);

      sim.runToCompletion(150);
      expect(sim.isComplete()).toBe(true);
      expect(sim.protocolInstance.stats.framesDelivered).toBe(3);
    });

    it('Selective Repeat tracks independent per-frame timers and selectively retransmits only expired frame', () => {
      const sim = new FlowControlSimulator({
        protocol: FlowControlProtocol.SELECTIVE_REPEAT,
        m: 3,
        windowSize: 4,
        timeoutDuration: 16,
        propagationDelay: 4,
        transmissionDelay: 1,
      });

      // Drop frame 0, deliver frame 1
      sim.forwardChannel.setFaultPlan([{ transmissionIndex: 1, action: 'DROP' }]);
      sim.send('SR-0');
      sim.send('SR-1');

      let timerState = sim.getTimerState();
      expect(timerState.active).toBe(true);
      expect(timerState.timers.length).toBe(2);
      expect(timerState.timers[0].frameSeq).toBe(0);
      expect(timerState.timers[1].frameSeq).toBe(1);

      // Step until frame 1 is delivered and ACKed (t=10)
      sim.stepTicks(10);
      timerState = sim.getTimerState();
      // Frame 1 ACKed (timer cancelled), only frame 0 has active timer
      expect(timerState.timers.length).toBe(1);
      expect(timerState.timers[0].frameSeq).toBe(0);

      // Step to t=16: Frame 0 timer expires and retransmits ONLY frame 0
      sim.stepTicks(6);
      expect(sim.protocolInstance.stats.timeouts).toBe(1);
      expect(sim.protocolInstance.stats.retransmissions).toBe(1); // ONLY 1 retransmission, not the whole window!

      sim.runToCompletion(150);
      expect(sim.isComplete()).toBe(true);
      expect(sim.protocolInstance.stats.framesDelivered).toBe(2);
    });

    it('renders ArqTimeoutPanel component across active, expired, cancelled, and idle states', () => {
      // 1. Idle state
      const idleHtml = renderToString(React.createElement(ArqTimeoutPanel, {
        timerState: { active: false, status: 'IDLE' },
        timeoutDuration: 14,
        currentTick: 0,
      }));
      expect(idleHtml).toContain('ARQ Retransmission Countdown');
      expect(idleHtml).toContain('No active timeout timer');

      // 2. Active countdown state
      const activeHtml = renderToString(React.createElement(ArqTimeoutPanel, {
        timerState: {
          active: true,
          status: 'WAITING_FOR_ACK',
          frameSeq: 2,
          attempt: 1,
          duration: 14,
          deadlineTick: 14,
          remainingTicks: 9,
        },
        timeoutDuration: 14,
        currentTick: 5,
        protocol: 'SW',
      }));
      expect(activeHtml).toContain('Waiting for ACK');
      expect(activeHtml).toContain('DATA #2');
      expect(activeHtml).toContain('9');
      expect(activeHtml).toContain('ticks');

      // 3. Expired state
      const expiredHtml = renderToString(React.createElement(ArqTimeoutPanel, {
        timerState: {
          active: false,
          status: 'TIMEOUT',
          lastEvent: { type: 'TIMEOUT', seq: 0 },
        },
        timeoutDuration: 14,
        currentTick: 14,
      }));
      expect(expiredHtml).toContain('Timeout Expired');

      // 4. Cancelled state
      const cancelledHtml = renderToString(React.createElement(ArqTimeoutPanel, {
        timerState: {
          active: false,
          status: 'ACK_RECEIVED',
          lastEvent: { type: 'ACK_RECEIVED' },
        },
        timeoutDuration: 14,
        currentTick: 9,
      }));
      expect(cancelledHtml).toContain('ACK Received — Timer Stopped');

      // 5. CSMA/CD Profile B state
      const csmaHtml = renderToString(React.createElement(ArqTimeoutPanel, {
        protocol: 'CSMA_CD',
        timerState: { protocol: 'CSMA_CD', active: false },
      }));
      expect(csmaHtml).toContain('CSMA/CD');
      expect(csmaHtml).toContain('Shared Medium');
    });

    it('renders live ARQ timeout countdown in FlowControlView', () => {
      const html = renderToString(React.createElement(FlowControlView));
      expect(html).toContain('ARQ Retransmission Countdown');
      expect(html).toContain('No active timeout timer');
    });
  });
});
