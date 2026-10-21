import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  TransmissionLabCoordinator,
  ProfileType,
  FcsAlgorithm,
  FramingAlgorithm,
  FlowProtocol,
  LabPreset,
} from '../core/transmission/TransmissionLabCoordinator.js';
import { MacPreset } from '../core/mac/CsmaCdSimulator.js';
import TransmissionLabView from '../ui/modules/TransmissionLabView.jsx';
import App from '../ui/App.jsx';

describe('TransmissionLabCoordinator — Architecture & 8-Stage Transmission Pipeline', () => {
  let coordinator;

  beforeEach(() => {
    coordinator = new TransmissionLabCoordinator({
      profile: ProfileType.PROFILE_A,
      protocol: FlowProtocol.STOP_AND_WAIT,
      fcsType: FcsAlgorithm.CRC_16,
      framingType: FramingAlgorithm.BYTE_STUFFING,
      propagationDelay: 4,
      timeoutDuration: 12,
      transmissionDelay: 1,
    });
  });

  describe('Stage 1: Segmentation', () => {
    it('correctly segments a long message into discrete chunks', () => {
      coordinator.config.maxPayloadChunk = 5;
      const chunks = coordinator.segmentPayload('HELLO WORLD 123');
      expect(chunks.length).toBe(3);
      expect(chunks[0].chunkText).toBe('HELLO');
      expect(chunks[1].chunkText).toBe(' WORL');
      expect(chunks[2].chunkText).toBe('D 123');
      expect(chunks[0].chunkBytes.length).toBe(5);
    });

    it('handles empty message payload gracefully', () => {
      const chunks = coordinator.segmentPayload('');
      expect(chunks).toEqual([]);
      const res = coordinator.sendMessage('');
      expect(res.success).toBe(false);
      expect(res.reason).toBe('EMPTY_PAYLOAD');
    });
  });

  describe('Stages 2, 3, 4: Encoding Pipeline Across Algorithms', () => {
    it('supports CRC-16/CCITT-FALSE error control with Byte Stuffing', () => {
      coordinator.config.fcsType = FcsAlgorithm.CRC_16;
      coordinator.config.framingType = FramingAlgorithm.BYTE_STUFFING;
      coordinator.sendMessage('TEST');

      const allFrames = coordinator.getAllFrames();
      expect(allFrames.length).toBeGreaterThan(0);
      const frameRec = allFrames[0];

      expect(frameRec.stage1.payloadText).toBe('TEST');
      expect(frameRec.stage2.wireByteCount).toBeGreaterThan(0);
      expect(frameRec.stage3.fcsType).toBe(FcsAlgorithm.CRC_16);
      expect(frameRec.stage3.fcsHex).toMatch(/^0x[0-9A-F]{4}$/);
      expect(frameRec.stage4.framingType).toBe(FramingAlgorithm.BYTE_STUFFING);
      expect(frameRec.stage4.details.flagHex).toBe('0x7E');
    });

    it('supports CRC-8/SMBUS error control with Bit Stuffing', () => {
      coordinator.reset({
        fcsType: FcsAlgorithm.CRC_8,
        framingType: FramingAlgorithm.BIT_STUFFING,
      });
      coordinator.sendMessage('BIT_DATA');

      const allFrames = coordinator.getAllFrames();
      const frameRec = allFrames[0];
      expect(frameRec.stage3.fcsType).toBe(FcsAlgorithm.CRC_8);
      expect(frameRec.stage3.fcsHex).toMatch(/^0x[0-9A-F]{2}$/);
      expect(frameRec.stage4.framingType).toBe(FramingAlgorithm.BIT_STUFFING);
      expect(frameRec.stage4.details.flag).toBe('01111110');
    });

    it('supports RFC 1071 Internet Checksum with Character Count framing', () => {
      coordinator.reset({
        fcsType: FcsAlgorithm.CHECKSUM_16,
        framingType: FramingAlgorithm.CHARACTER_COUNT,
      });
      coordinator.sendMessage('CHECKSUM_TEST');

      const allFrames = coordinator.getAllFrames();
      const frameRec = allFrames[0];
      expect(frameRec.stage3.fcsType).toBe(FcsAlgorithm.CHECKSUM_16);
      expect(frameRec.stage3.fcsHex).toMatch(/^0x[0-9A-F]{4}$/);
      expect(frameRec.stage4.framingType).toBe(FramingAlgorithm.CHARACTER_COUNT);
      expect(frameRec.stage4.details.lengthHeader).toBeGreaterThan(0);
    });

    it('supports 1D Parity Even mode', () => {
      coordinator.reset({
        fcsType: FcsAlgorithm.PARITY_1D_EVEN,
        framingType: FramingAlgorithm.BYTE_STUFFING,
      });
      coordinator.sendMessage('PARITY');

      const allFrames = coordinator.getAllFrames();
      const frameRec = allFrames[0];
      expect(frameRec.stage3.fcsType).toBe(FcsAlgorithm.PARITY_1D_EVEN);
      expect(['0', '1']).toContain(frameRec.stage3.fcsValue);
    });
  });

  describe('Profile A: Point-to-Point ARQ End-to-End Delivery', () => {
    it('executes a clean Stop-and-Wait transmission through all 8 stages', () => {
      const sendRes = coordinator.sendMessage('CLEAN_MSG');
      expect(sendRes.success).toBe(true);

      // Run until frame is delivered and ACK is received back
      coordinator.runUntil((c) => c.getTelemetry().delivered > 0);

      const tele = coordinator.getTelemetry();
      expect(tele.delivered).toBe(1);
      expect(tele.deliveredMessages).toContain('CLEAN_MSG');
      expect(tele.retransmissions).toBe(0);

      const frameRec = coordinator.getAllFrames()[0];
      expect(frameRec.stage5.sentTick).toBe(0);
      expect(frameRec.stage6.outcome).toBe('DELIVERED');
      expect(frameRec.stage7.deframingSuccess).toBe(true);
      expect(frameRec.stage7.fcsVerified).toBe(true);
      expect(frameRec.stage7.outcome).toBe('ACCEPTED');
      expect(frameRec.stage8.delivered).toBe(true);
    });

    it('recovers from channel bit corruption via FCS detection and ARQ timeout retransmission', () => {
      // Injects corruption on first DATA attempt
      coordinator.setNextDataFault('CORRUPT');
      coordinator.sendMessage('CORRUPT_RECOVER');

      // Run through timeout and retransmission until delivered
      coordinator.runUntil((c) => c.getTelemetry().delivered > 0, 100);

      const tele = coordinator.getTelemetry();
      expect(tele.delivered).toBe(1);
      expect(tele.retransmissions).toBeGreaterThanOrEqual(1);
      expect(tele.corruptions).toBeGreaterThanOrEqual(1);
      expect(tele.deliveredMessages).toContain('CORRUPT_RECOVER');
    });

    it('recovers from channel frame drop via ARQ sender timeout', () => {
      coordinator.setNextDataFault('DROP');
      coordinator.sendMessage('DROP_RECOVER');

      coordinator.runUntil((c) => c.getTelemetry().delivered > 0, 100);

      const tele = coordinator.getTelemetry();
      expect(tele.delivered).toBe(1);
      expect(tele.retransmissions).toBeGreaterThanOrEqual(1);
      expect(tele.timeouts).toBeGreaterThanOrEqual(1);
    });

    it('suppresses duplicate frames when reverse ACK is lost in channel', () => {
      coordinator.setNextAckFault('DROP');
      coordinator.sendMessage('ACK_DROP_TEST');

      coordinator.runUntil((c) => c.getTelemetry().delivered > 0 && c.getTelemetry().duplicates > 0, 100);

      const tele = coordinator.getTelemetry();
      expect(tele.delivered).toBe(1);
      expect(tele.duplicates).toBeGreaterThanOrEqual(1);
      expect(tele.deliveredMessages.length).toBe(1); // Payload only delivered once to upper layer!
    });

    it('transmits multiple segmented frames over Go-Back-N sliding window', () => {
      coordinator.reset({
        protocol: FlowProtocol.GO_BACK_N,
        windowSize: 4,
        m: 3,
        maxPayloadChunk: 5,
        propagationDelay: 3,
        timeoutDuration: 14,
      });

      coordinator.sendMessage('ABCDEFGHIJKLMNO'); // 3 chunks of 5 characters

      coordinator.runUntil((c) => c.getTelemetry().delivered === 3, 100);

      const tele = coordinator.getTelemetry();
      expect(tele.delivered).toBe(3);
      expect(coordinator.deliveredMessages).toEqual(['ABCDE', 'FGHIJ', 'KLMNO']);
    });

    it('transmits with Selective Repeat, buffers out-of-order frames, and selectively retransmits only the dropped frame', () => {
      coordinator.reset({
        protocol: FlowProtocol.SELECTIVE_REPEAT,
        windowSize: 4,
        rxWindowSize: 4,
        m: 3,
        maxPayloadChunk: 2,
        propagationDelay: 3,
        timeoutDuration: 14,
      });

      // Drop frame #1 in transit
      coordinator.forwardChannel.setFaultPlan([{ action: 'PASS' }, { action: 'DROP' }]);

      coordinator.sendMessage('A1B2C3D4'); // 4 frames: A1, B2, C3, D4

      coordinator.runUntil((c) => c.getTelemetry().delivered === 4, 150);

      const tele = coordinator.getTelemetry();
      expect(tele.delivered).toBe(4);
      expect(tele.retransmissions).toBe(1); // Only the single lost frame retransmitted!
      expect(tele.timeouts).toBe(1);
      expect(coordinator.deliveredMessages).toEqual(['A1', 'B2', 'C3', 'D4']);
    });

    it('cleans up completely on reset without stale events contaminating a subsequent run', () => {
      coordinator.sendMessage('RUN_1');
      coordinator.stepTicks(3); // In transit

      // Reset mid-transmission
      coordinator.reset();
      expect(coordinator.engine.getCurrentTick()).toBe(0);
      expect(coordinator.engine.getQueue().isEmpty()).toBe(true);
      expect(coordinator.getAllFrames().length).toBe(0);
      expect(coordinator.deliveredMessages).toEqual([]);

      // Start completely fresh transmission
      coordinator.sendMessage('RUN_2');
      coordinator.runUntil((c) => c.getTelemetry().delivered === 1, 100);

      const tele = coordinator.getTelemetry();
      expect(tele.delivered).toBe(1);
      expect(coordinator.deliveredMessages).toEqual(['RUN_2']);
      expect(coordinator.deliveredMessages).not.toContain('RUN_1');
    });
  });

  describe('Profile B: Shared-Medium Ethernet Teaching Model', () => {
    beforeEach(() => {
      coordinator.reset({
        profile: ProfileType.PROFILE_B,
        busLength: 100,
        maxPropagationDelay: 10,
        frameTransmissionDuration: 30,
        jamDuration: 4,
      });
    });

    it('delivers a clean transmission across the shared bus from A to D', () => {
      coordinator.macSimulator.loadPreset(MacPreset.CLEAN_TRANSMISSION);

      coordinator.runUntil((c) => c.getTelemetry().totalDelivered > 0, 150);

      const tele = coordinator.getTelemetry();
      expect(tele.totalDelivered).toBe(1);
      expect(tele.totalCollisions).toBe(0);
    });

    it('detects collision, emits jam, and resolves contention via BEB backoff', () => {
      coordinator.macSimulator.loadPreset(MacPreset.NEAR_SIMULTANEOUS_COLLISION);

      coordinator.runUntil((c) => c.getTelemetry().totalDelivered >= 2, 250);

      const tele = coordinator.getTelemetry();
      expect(tele.totalCollisions).toBeGreaterThanOrEqual(1);
      expect(tele.totalJamSignals).toBeGreaterThanOrEqual(1);
      expect(tele.totalDelivered).toBe(2);
    });

    it('enforces 16-attempt limit and drops on excessive collisions', () => {
      coordinator.macSimulator.loadPreset(MacPreset.EXCESSIVE_COLLISIONS);

      coordinator.runUntil((c) => c.getTelemetry().totalExcessiveDrops > 0, 500);

      const tele = coordinator.getTelemetry();
      expect(tele.totalExcessiveDrops).toBeGreaterThanOrEqual(1);
    });

    it('transmits message via sendMessage in Profile B and delivers to destination station D without invoking ARQ', () => {
      expect(coordinator.protocolInstance).toBeNull(); // ARQ protocol is NOT initialized in Profile B!
      coordinator.sendMessage('BROADCAST_PAYLOAD');

      coordinator.runUntil((c) => c.deliveredMessages.length > 0, 150);

      const tele = coordinator.getTelemetry();
      expect(tele.totalDelivered).toBe(1);
      expect(tele.profile).toBe(ProfileType.PROFILE_B);
      expect(coordinator.deliveredMessages.length).toBeGreaterThanOrEqual(1);
      expect(coordinator.deliveredMessages[0]).toContain('BROADCAST');
      expect(coordinator.protocolInstance).toBeNull(); // Confirmed zero sliding window ARQ
    });
  });

  describe('Lab Presets Integration', () => {
    it('loads CLEAN_TRANSMISSION preset correctly', () => {
      coordinator.loadPreset(LabPreset.CLEAN_TRANSMISSION);
      expect(coordinator.config.profile).toBe(ProfileType.PROFILE_A);
      expect(coordinator.config.protocol).toBe(FlowProtocol.STOP_AND_WAIT);
      expect(coordinator.getAllFrames().length).toBe(1);
    });

    it('loads BIT_CORRUPTION_RECOVERY preset correctly and renders UI through every tick without error', () => {
      coordinator.loadPreset(LabPreset.BIT_CORRUPTION_RECOVERY);
      expect(coordinator.config.profile).toBe(ProfileType.PROFILE_A);
      expect(coordinator.getAllFrames().length).toBe(1);
      for (let i = 0; i < 40; i++) {
        coordinator.stepTick();
        expect(() => {
          renderToString(React.createElement(TransmissionLabView, { coordinator }));
        }).not.toThrow();
      }
      expect(coordinator.isComplete()).toBe(true);
      expect(coordinator.deliveredMessages).toEqual(['TEST CORRUPT']);
    });

    it('loads CSMA_CD_COLLISION_BEB preset correctly', () => {
      coordinator.loadPreset(LabPreset.CSMA_CD_COLLISION_BEB);
      expect(coordinator.config.profile).toBe(ProfileType.PROFILE_B);
    });
  });

  describe('TransmissionLabView & App React Integration', () => {
    it('renders TransmissionLabView component without runtime errors', () => {
      const html = renderToString(React.createElement(TransmissionLabView));
      expect(html).toContain('End-to-End Data Link Layer Transmission Lab');
      expect(html).toContain('Profile A: Point-to-Point ARQ');
      expect(html).toContain('Profile B: Shared-Medium CSMA/CD');
      expect(html).toContain('Explicit 8-Stage Transmission Lifecycle');
      expect(html).toContain('Live Transmission Telemetry');
    });

    it('renders TransmissionLabView through manual Corrupt DATA fault without throwing object-as-child errors', () => {
      const coord = new TransmissionLabCoordinator({
        profile: ProfileType.PROFILE_A,
        protocol: FlowProtocol.STOP_AND_WAIT,
      });
      coord.sendMessage('CRASH_AUDIT');
      coord.setNextDataFault('CORRUPT');

      // Tick through forward channel transit, corruption at receiver, and timeout recovery
      for (let t = 0; t < 35; t++) {
        coord.stepTick();
        expect(() => {
          renderToString(React.createElement(TransmissionLabView, { coordinator: coord }));
        }).not.toThrow();
      }
      expect(coord.isComplete()).toBe(true);
      expect(coord.deliveredMessages).toEqual(['CRASH_AUDIT']);
    });

    it('renders TransmissionLabView through Drop DATA and Drop ACK faults safely', () => {
      const coord = new TransmissionLabCoordinator({
        profile: ProfileType.PROFILE_A,
        protocol: FlowProtocol.STOP_AND_WAIT,
      });
      coord.sendMessage('FAULT_TEST');
      coord.setNextDataFault('DROP');
      for (let t = 0; t < 25; t++) {
        coord.stepTick();
        expect(() => {
          renderToString(React.createElement(TransmissionLabView, { coordinator: coord }));
        }).not.toThrow();
      }

      coord.setNextAckFault('DROP');
      for (let t = 0; t < 25; t++) {
        coord.stepTick();
        expect(() => {
          renderToString(React.createElement(TransmissionLabView, { coordinator: coord }));
        }).not.toThrow();
      }
    });

    it('renders App with defaultTab="transmission-lab"', () => {
      const html = renderToString(React.createElement(App, { defaultTab: 'transmission-lab' }));
      expect(html).toContain('Data Link Layer Protocol Simulator');
      expect(html).toContain('End-to-End Transmission Lab');
      expect(html).toContain('Framing Simulator');
      expect(html).toContain('Error Control &amp; CRC');
      expect(html).toContain('Flow Control &amp; ARQ');
      expect(html).toContain('CSMA/CD Bus');
    });

    it('renders all application tabs seamlessly and preserves earlier playgrounds', () => {
      const labHtml = renderToString(React.createElement(App, { defaultTab: 'transmission-lab' }));
      const framingHtml = renderToString(React.createElement(App, { defaultTab: 'framing' }));
      const errorHtml = renderToString(React.createElement(App, { defaultTab: 'error-control' }));
      const flowHtml = renderToString(React.createElement(App, { defaultTab: 'flow-control' }));
      const macHtml = renderToString(React.createElement(App, { defaultTab: 'mac' }));
      const overviewHtml = renderToString(React.createElement(App, { defaultTab: 'overview' }));

      expect(labHtml).toContain('Explicit 8-Stage Transmission Lifecycle');
      expect(framingHtml).toContain('Framing Simulator');
      expect(errorHtml).toContain('Modulo-2');
      expect(flowHtml).toContain('Flow Control');
      expect(macHtml).toContain('CSMA/CD');
      expect(overviewHtml).toContain('Project Architecture &amp; Overview');
    });

    it('renders the polished multiline textarea, collapsible guide, and instant playback controls', () => {
      const html = renderToString(React.createElement(TransmissionLabView));
      expect(html).toContain('Message Payload');
      expect(html).toContain('form-textarea');
      expect(html).toContain('How This Simulation Works (Student Architecture Guide)');
      expect(html).toContain('Instant / Complete');
      expect(html).toContain('Speed:');
      expect(html).toContain('Slow (300ms)');
      expect(html).toContain('Normal (100ms)');
      expect(html).toContain('Fast (30ms)');
    });
  });

  describe('Playback Controls, Instant Execution & Determinism (Phase 9 UX)', () => {
    it('runToCompletion drains events safely and yields identical outcome to stepped execution', () => {
      // 1. Stepped execution
      const steppedCoord = new TransmissionLabCoordinator({
        profile: ProfileType.PROFILE_A,
        protocol: FlowProtocol.STOP_AND_WAIT,
        maxPayloadChunk: 4,
      });
      steppedCoord.sendMessage('TESTING_PAYLOAD');
      steppedCoord.runUntil((c) => c.isComplete(), 150);
      const steppedTele = steppedCoord.getTelemetry();

      // 2. Instant runToCompletion
      const instantCoord = new TransmissionLabCoordinator({
        profile: ProfileType.PROFILE_A,
        protocol: FlowProtocol.STOP_AND_WAIT,
        maxPayloadChunk: 4,
      });
      instantCoord.sendMessage('TESTING_PAYLOAD');
      const completionResult = instantCoord.runToCompletion(150);
      const instantTele = instantCoord.getTelemetry();

      expect(completionResult.completed).toBe(true);
      expect(instantCoord.isComplete()).toBe(true);
      expect(instantTele.delivered).toBe(steppedTele.delivered);
      expect(instantCoord.deliveredMessages).toEqual(steppedCoord.deliveredMessages);
      expect(instantTele.totalAttempts).toBe(steppedTele.totalAttempts);
      expect(instantTele.channelUtilization).toBe(steppedTele.channelUtilization);
    });

    it('correctly tracks isComplete and semantic status transitions', () => {
      coordinator.reset();
      expect(coordinator.isComplete()).toBe(false);
      expect(coordinator.getStatus().state).toBe('READY');

      coordinator.sendMessage('DATA');
      expect(coordinator.isComplete()).toBe(false);

      coordinator.stepTick(); // In transit
      expect(coordinator.isComplete()).toBe(false);

      coordinator.runToCompletion(100);
      expect(coordinator.isComplete()).toBe(true);
      expect(coordinator.getStatus().state).toBe('COMPLETED');
    });

    it('correctly segments multiline message payloads without data corruption', () => {
      const multiline = "FIRST LINE\nSECOND LINE\nTHIRD LINE";
      const chunks = coordinator.segmentPayload(multiline);
      expect(chunks.length).toBeGreaterThan(1);
      const reassembled = chunks.map((c) => c.chunkText).join('');
      expect(reassembled).toBe(multiline);
    });
  });
});
