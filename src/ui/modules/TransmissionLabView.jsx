/**
 * TransmissionLabView.jsx
 * 
 * Interactive Visualizer for Phase 8: Integrated End-to-End Data Link Layer Transmission Lab.
 * 
 * Features:
 * - Dominant Visual Simulation Canvas: Animated physical medium showing frame & ACK transit in real-time
 * - Concrete Frame Queue & Segmentation View: Visual breakdown of payload into [Flag][Header][Payload][FCS][Flag]
 * - Video-like Narration & Playback: Plain-English commentary explaining the active protocol events conditionally
 * - Warm, accessible, educational light theme with high contrast and accessible controls
 * - Interactive Fault Injection: Corrupt DATA, Drop DATA, Delay DATA, Drop ACK
 * - Collapsible Technical Inspectors: 8-Stage wire lifecycle and discrete-event trace log
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  TransmissionLabCoordinator,
  ProfileType,
  FcsAlgorithm,
  FramingAlgorithm,
  FlowProtocol,
  LabPreset,
} from '../../core/transmission/TransmissionLabCoordinator.js';

export default function TransmissionLabView() {
  // Profile Selection: Profile A (Point-to-Point ARQ) vs Profile B (Shared-Medium CSMA/CD)
  const [profile, setProfile] = useState(ProfileType.PROFILE_A);

  // Profile A Configuration
  const [protocol, setProtocol] = useState(FlowProtocol.STOP_AND_WAIT);
  const [fcsType, setFcsType] = useState(FcsAlgorithm.CRC_16);
  const [framingType, setFramingType] = useState(FramingAlgorithm.BYTE_STUFFING);
  const [maxPayloadChunk, setMaxPayloadChunk] = useState(8);
  const [windowSize, setWindowSize] = useState(4);
  const [propagationDelay, setPropagationDelay] = useState(4);
  const [timeoutDuration, setTimeoutDuration] = useState(14);

  // Profile B Configuration
  const [sourceStation, setSourceStation] = useState('A');
  const [destStation, setDestStation] = useState('D');

  // Message Input
  const [messageInput, setMessageInput] = useState('NETWORKS LAB 2026');

  // Animation & Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeedMs, setPlaySpeedMs] = useState(100); // Default to Normal (100ms)
  const [selectedFrameId, setSelectedFrameId] = useState(null);

  // Coordinator Instance Ref
  const coordinatorRef = useRef(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = new TransmissionLabCoordinator({
      profile,
      protocol,
      fcsType,
      framingType,
      maxPayloadChunk,
      windowSize,
      propagationDelay,
      timeoutDuration,
      sourceStation,
      destStation,
    });
  }

  // Reactive state synced with coordinator
  const [telemetry, setTelemetry] = useState(() => coordinatorRef.current.getTelemetry());
  const [allFrames, setAllFrames] = useState(() => coordinatorRef.current.getAllFrames());
  const [stageHistory, setStageHistory] = useState(() => [...coordinatorRef.current.stageHistory]);
  const [pendingFaultData, setPendingFaultData] = useState(null);
  const [pendingFaultAck, setPendingFaultAck] = useState(null);

  // Re-sync UI state from coordinator
  const syncState = () => {
    if (coordinatorRef.current) {
      setTelemetry(coordinatorRef.current.getTelemetry());
      const frames = coordinatorRef.current.getAllFrames();
      setAllFrames(frames);
      setStageHistory([...coordinatorRef.current.stageHistory]);
      setPendingFaultData(coordinatorRef.current.pendingFaultNextData?.action || null);
      setPendingFaultAck(coordinatorRef.current.pendingFaultNextAck?.action || null);

      if (frames.length > 0 && selectedFrameId === null) {
        setSelectedFrameId(frames[0].id);
      }
    }
  };

  // Reset or reinitialize coordinator
  const handleReset = (newOverrides = {}) => {
    setIsPlaying(false);
    const newConfig = {
      profile,
      protocol,
      fcsType,
      framingType,
      maxPayloadChunk,
      windowSize,
      propagationDelay,
      timeoutDuration,
      sourceStation,
      destStation,
      ...newOverrides,
    };
    coordinatorRef.current.reset(newConfig);
    setSelectedFrameId(null);
    syncState();
  };

  // Handle Profile Switch
  const handleProfileChange = (newProfile) => {
    setProfile(newProfile);
    handleReset({ profile: newProfile });
  };

  // Playback Loop
  useEffect(() => {
    let intervalId = null;
    if (isPlaying) {
      intervalId = setInterval(() => {
        if (coordinatorRef.current) {
          if (coordinatorRef.current.isComplete && coordinatorRef.current.isComplete()) {
            setIsPlaying(false);
            syncState();
            return;
          }
          coordinatorRef.current.stepTick();
          syncState();
        }
      }, playSpeedMs);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPlaying, playSpeedMs]);

  // Transmit Message handler
  const handleSendMessage = () => {
    if (!messageInput.trim()) return;
    coordinatorRef.current.sendMessage(messageInput.trim());
    syncState();
  };

  // Play/Pause Toggle with smart auto-transmit if empty
  const handleTogglePlay = () => {
    if (!isPlaying) {
      if (coordinatorRef.current && coordinatorRef.current.getAllFrames().length === 0 && messageInput.trim()) {
        coordinatorRef.current.sendMessage(messageInput.trim());
        syncState();
      }
    }
    setIsPlaying(!isPlaying);
  };

  // Instant / Run to Completion Handler
  const handleRunToCompletion = () => {
    setIsPlaying(false);
    if (coordinatorRef.current) {
      if (coordinatorRef.current.getAllFrames().length === 0 && messageInput.trim()) {
        coordinatorRef.current.sendMessage(messageInput.trim());
      }
      coordinatorRef.current.runToCompletion(500);
      syncState();
    }
  };

  // Preset loader handler
  const handleLoadPreset = (presetName) => {
    setIsPlaying(false);
    coordinatorRef.current.loadPreset(presetName);
    setProfile(coordinatorRef.current.config.profile);
    setProtocol(coordinatorRef.current.config.protocol);
    setFcsType(coordinatorRef.current.config.fcsType);
    setFramingType(coordinatorRef.current.config.framingType);
    setMaxPayloadChunk(coordinatorRef.current.config.maxPayloadChunk);

    const frames = coordinatorRef.current.getAllFrames();
    if (frames.length > 0 && frames[0].payloadText) {
      const presetPayload = frames.map((f) => f.payloadText).join('');
      setMessageInput(presetPayload);
    }
    syncState();
  };

  // Fault injection handlers
  const handleSetDataFault = (faultType) => {
    coordinatorRef.current.setNextDataFault(faultType);
    syncState();
  };

  const handleSetAckFault = (faultType) => {
    coordinatorRef.current.setNextAckFault(faultType);
    syncState();
  };

  const handleClearFaults = () => {
    coordinatorRef.current.clearFaults();
    syncState();
  };

  // Step 1 Tick
  const handleStepTick = () => {
    coordinatorRef.current.stepTick();
    syncState();
  };

  // Step 1 Event
  const handleStepEvent = () => {
    coordinatorRef.current.stepEvent();
    syncState();
  };

  // Live segmentation calculation
  const chunkInfo = useMemo(() => {
    const len = messageInput.length;
    const chunkSz = Math.max(1, maxPayloadChunk);
    const count = len > 0 ? Math.ceil(len / chunkSz) : 0;
    return {
      charCount: len,
      chunkSize: chunkSz,
      frameCount: count,
      summary:
        count === 0
          ? 'Enter text to begin'
          : count === 1
          ? '1 single frame'
          : `${count} frames (${Math.min(len, chunkSz)} chars/frame max)`,
    };
  }, [messageInput, maxPayloadChunk]);

  // Derived simulation status & badges
  const simStatus = useMemo(() => {
    if (isPlaying) {
      return {
        state: 'RUNNING',
        label: 'Simulating (Playing)',
        description: `Discrete-event clock advancing at ${playSpeedMs} ms/tick.`,
        badgeClass: 'sim-status-running',
      };
    }
    const current =
      telemetry.status ||
      (coordinatorRef.current
        ? coordinatorRef.current.getStatus()
        : { state: 'READY', label: 'Ready to Transmit', description: '' });

    let badgeClass = 'sim-status-ready';
    if (current.state === 'COMPLETED') badgeClass = 'sim-status-completed';
    else if (current.state === 'WAITING_FOR_ACK') badgeClass = 'sim-status-waiting';
    else if (current.state === 'COLLISION') badgeClass = 'sim-status-retransmitting';
    else if (current.state === 'BACKING_OFF') badgeClass = 'sim-status-waiting';
    else if (current.state === 'TRANSMITTING') badgeClass = 'sim-status-running';
    else if (current.state === 'PAUSED') badgeClass = 'sim-status-paused';

    return { ...current, badgeClass };
  }, [isPlaying, telemetry.status, playSpeedMs]);

  // Currently selected frame inspection record
  const selectedInspection = useMemo(() => {
    if (selectedFrameId !== null) {
      return coordinatorRef.current.getFrameInspection(selectedFrameId);
    }
    return allFrames.length > 0 ? allFrames[0] : null;
  }, [selectedFrameId, allFrames]);

  // Reconstructed delivered text at receiver
  const reconstructedMessage = useMemo(() => {
    if (telemetry.deliveredMessages && telemetry.deliveredMessages.length > 0) {
      return telemetry.deliveredMessages.join('');
    }
    return '(No payload delivered yet)';
  }, [telemetry.deliveredMessages]);

  // Active in-flight packet records on forward channel
  const activeInFlightData = useMemo(() => {
    if (!telemetry.forwardHistory || telemetry.forwardHistory.length === 0) return null;
    const curTick = telemetry.currentTick;
    // Find the latest transmission that is currently within its transit window
    for (let i = telemetry.forwardHistory.length - 1; i >= 0; i--) {
      const h = telemetry.forwardHistory[i];
      if (curTick >= h.startTick) {
        if (h.deliveryTick !== null && curTick < h.deliveryTick) {
          return h;
        }
        if (h.outcome === 'DROPPED' && curTick <= h.startTick + (h.propagationDelay || 4)) {
          return h;
        }
      }
    }
    return null;
  }, [telemetry.forwardHistory, telemetry.currentTick]);

  // Active in-flight packet records on reverse channel (ACK)
  const activeInFlightAck = useMemo(() => {
    if (!telemetry.reverseHistory || telemetry.reverseHistory.length === 0) return null;
    const curTick = telemetry.currentTick;
    for (let i = telemetry.reverseHistory.length - 1; i >= 0; i--) {
      const h = telemetry.reverseHistory[i];
      if (curTick >= h.startTick) {
        if (h.deliveryTick !== null && curTick < h.deliveryTick) {
          return h;
        }
        if (h.outcome === 'DROPPED' && curTick <= h.startTick + (h.propagationDelay || 4)) {
          return h;
        }
      }
    }
    return null;
  }, [telemetry.reverseHistory, telemetry.currentTick]);

  // Live Plain-English Simulation Narration
  const liveNarration = useMemo(() => {
    const isComplete = coordinatorRef.current ? coordinatorRef.current.isComplete() : false;
    const curTick = telemetry.currentTick;

    if (allFrames.length === 0) {
      return {
        icon: '💡',
        className: 'state-waiting',
        text: 'Ready to transmit. Enter a message above and click "Transmit Payload" or "▶ Play" to begin the animated journey.',
      };
    }

    if (isComplete || telemetry.status?.state === 'COMPLETED') {
      return {
        icon: '🎉',
        className: 'state-completed',
        text: `Transmission Complete! All ${telemetry.delivered || allFrames.length} frame(s) successfully delivered, FCS verified, and reassembled into the upper-layer message.`,
      };
    }

    if (profile === ProfileType.PROFILE_A) {
      if (activeInFlightData) {
        const seq = activeInFlightData.transmittedFrame?.seq ?? 0;
        const payload = activeInFlightData.transmittedFrame?.payloadText ?? '';
        if (activeInFlightData.outcome === 'CORRUPTED') {
          return {
            icon: '⚡',
            className: 'state-fault',
            text: `Fault Injected: Frame #${seq} ("${payload}") is traversing the physical channel with corrupted bits! Receiver FCS verification will detect mismatch.`,
          };
        }
        if (activeInFlightData.outcome === 'DROPPED') {
          return {
            icon: '❌',
            className: 'state-fault',
            text: `Channel Fault: Frame #${seq} was DROPPED in the channel! Sender's ARQ timer is running; a timeout will trigger automatic retransmission.`,
          };
        }
        return {
          icon: '📡',
          className: 'state-transmitting',
          text: `Frame #${seq} ("${payload}") is traversing the forward physical medium toward Receiver (t = ${activeInFlightData.startTick} → ${activeInFlightData.deliveryTick}).`,
        };
      }

      if (activeInFlightAck) {
        const ackNum = activeInFlightAck.transmittedFrame?.ack ?? activeInFlightAck.transmittedFrame?.seq ?? 1;
        if (activeInFlightAck.outcome === 'DROPPED') {
          return {
            icon: '🔁',
            className: 'state-fault',
            text: `Reverse Link Fault: ACK #${ackNum} was dropped! Sender will time out and retransmit the frame. Receiver will suppress the duplicate.`,
          };
        }
        return {
          icon: '📩',
          className: 'state-transmitting',
          text: `Receiver accepted frame and generated ACK #${ackNum}. ACK is traversing the reverse channel back to Sender.`,
        };
      }

      if (telemetry.status?.state === 'WAITING_FOR_ACK') {
        return {
          icon: '⏱️',
          className: 'state-waiting',
          text: `Sender (${protocol}) is waiting for incoming ACK or timer expiration. Channel is currently idle.`,
        };
      }

      if (telemetry.retransmissions > 0) {
        return {
          icon: '🔁',
          className: 'state-fault',
          text: `Timeout expired! Sender initiated automatic retransmission for unacknowledged frame(s).`,
        };
      }

      return {
        icon: '🔄',
        className: 'state-transmitting',
        text: `Processing discrete-event queue at t = ${curTick} virtual ticks.`,
      };
    } else {
      // Profile B: CSMA/CD
      if (telemetry.status?.state === 'COLLISION') {
        return {
          icon: '💥',
          className: 'state-fault',
          text: `COLLISION DETECTED on the shared bus! Participating stations aborted transmission and emitted 32-bit jam signals.`,
        };
      }
      if (telemetry.status?.state === 'BACKING_OFF') {
        return {
          icon: '⏳',
          className: 'state-waiting',
          text: `Collided stations are executing Truncated Binary Exponential Backoff (BEB) to choose a random deferral slot.`,
        };
      }
      if (telemetry.status?.state === 'TRANSMITTING') {
        return {
          icon: '📡',
          className: 'state-transmitting',
          text: `Station is transmitting onto shared coaxial medium. Spatial signal wavefront is propagating along the bus.`,
        };
      }
      return {
        icon: '📡',
        className: 'state-transmitting',
        text: `Shared bus carrier sensing active. Stations listening before transmitting on coaxial medium.`,
      };
    }
  }, [
    profile,
    protocol,
    telemetry,
    allFrames,
    activeInFlightData,
    activeInFlightAck,
  ]);

  // Compute forward data progress percentage (8% to 90%)
  const dataProgressPct = useMemo(() => {
    if (!activeInFlightData) return 50;
    const { startTick, deliveryTick } = activeInFlightData;
    const curTick = telemetry.currentTick;
    const dur = Math.max(1, (deliveryTick || startTick + (activeInFlightData.propagationDelay || 4)) - startTick);
    const elapsed = curTick - startTick;
    const ratio = Math.max(0, Math.min(1, elapsed / dur));
    return Math.round(8 + ratio * 82);
  }, [activeInFlightData, telemetry.currentTick]);

  // Compute reverse ACK progress percentage (90% to 8%)
  const ackProgressPct = useMemo(() => {
    if (!activeInFlightAck) return 50;
    const { startTick, deliveryTick } = activeInFlightAck;
    const curTick = telemetry.currentTick;
    const dur = Math.max(1, (deliveryTick || startTick + (activeInFlightAck.propagationDelay || 4)) - startTick);
    const elapsed = curTick - startTick;
    const ratio = Math.max(0, Math.min(1, elapsed / dur));
    return Math.round(90 - ratio * 82);
  }, [activeInFlightAck, telemetry.currentTick]);

  return (
    <div className="transmission-lab-container">
      {/* 1. Header Banner */}
      <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '4px solid var(--accent-blue)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h2 className="card-title" style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                🔬 End-to-End Data Link Layer Transmission Lab
              </h2>
              <span className="badge badge-info">Flagship Visual Simulation</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '850px' }}>
              Observe an upper-layer payload traverse all 8 stages of Data Link Layer processing: segmentation,
              header serialization, FCS error protection, framing transparency, channel transmission with fault injection,
              receiver deframing, FCS validation, and protocol delivery.
            </p>
          </div>

          {/* Profile Switcher Pills */}
          <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-secondary)', padding: '0.35rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <button
              className={`btn btn-sm ${profile === ProfileType.PROFILE_A ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handleProfileChange(ProfileType.PROFILE_A)}
            >
              <span>🔗 Profile A: Point-to-Point ARQ</span>
            </button>
            <button
              className={`btn btn-sm ${profile === ProfileType.PROFILE_B ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handleProfileChange(ProfileType.PROFILE_B)}
            >
              <span>📡 Profile B: Shared-Medium CSMA/CD</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Educational Architecture Guide */}
      <details className="help-guide-card">
        <summary className="help-guide-summary">
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📘</span>
            <span>How This Simulation Works (Student Architecture Guide)</span>
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--accent-blue)' }}>Click to Expand / Collapse</span>
        </summary>
        <div className="help-guide-content">
          <p style={{ marginBottom: '0.5rem' }}>
            This laboratory models the exact Layer-2 physical transmission lifecycle across a discrete-event virtual clock:
          </p>
          <div className="help-steps-list">
            <div className="help-step-item">
              <div className="help-step-number">1. Payload Segmentation</div>
              The upper-layer application message is split into discrete chunks of at most {maxPayloadChunk} characters.
            </div>
            <div className="help-step-item">
              <div className="help-step-number">2. Header Assembly</div>
              The protocol state machine assigns the next valid sequence number, expected ACK, and frame type (DATA/ACK).
            </div>
            <div className="help-step-item">
              <div className="help-step-number">3. Error Detection (FCS)</div>
              The selected algorithm (CRC, Checksum, or Parity) calculates mathematical redundancy bits over exact wire bytes.
            </div>
            <div className="help-step-item">
              <div className="help-step-number">4. Framing &amp; Transparency</div>
              Delimiter flags (e.g. 0x7E or 01111110) are applied; bit/byte stuffing escapes reserved flags to prevent premature frame termination.
            </div>
            <div className="help-step-item">
              <div className="help-step-number">5. Channel &amp; Propagation</div>
              A simulated transmission channel schedules serialization and physical propagation delay events. Fault injection can drop or corrupt frames.
            </div>
            <div className="help-step-item">
              <div className="help-step-number">6. Deframing &amp; FCS Check</div>
              The receiver destuffs the wire stream, extracts fields, and independently recalculates the FCS. If corrupted, the frame is rejected.
            </div>
            <div className="help-step-item">
              <div className="help-step-number">7. ARQ Protocols (Profile A)</div>
              Sliding-window state machines (Stop-and-Wait, GBN, Selective Repeat) manage timers, acknowledgements, and retransmissions.
            </div>
            <div className="help-step-item">
              <div className="help-step-number">8. CSMA/CD MAC (Profile B)</div>
              Demonstrates shared-bus Ethernet contention, 2τ collision detection, 32-bit jam signals, and Truncated BEB without sliding-window ARQ.
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            * Note: This simulation runs on a discrete-event virtual clock (1 tick = 10 µs). It does not send real socket traffic over physical interfaces.
          </div>
        </div>
      </details>

      {/* 3. Educational Presets Bar */}
      <div className="card" style={{ padding: '0.85rem 1.25rem', marginBottom: '1.25rem', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>⚡ Preset Scenarios:</span>
          </span>
          {profile === ProfileType.PROFILE_A ? (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => handleLoadPreset(LabPreset.CLEAN_TRANSMISSION)}>
                ✓ Clean Stop-and-Wait
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => handleLoadPreset(LabPreset.BIT_CORRUPTION_RECOVERY)}>
                ⚡ Bit Corruption &amp; FCS Recovery
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => handleLoadPreset(LabPreset.FRAME_LOSS_TIMEOUT)}>
                📦 Frame Loss &amp; Retransmission
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => handleLoadPreset(LabPreset.LOST_ACK_DUPLICATE_SUPPRESSION)}>
                🔁 Lost ACK &amp; Duplicate Suppression
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => handleLoadPreset(LabPreset.MULTI_FRAME_PIPELINE)}>
                🌊 Multi-Frame Pipelined Window (GBN)
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => handleLoadPreset(LabPreset.CSMA_CD_CLEAN)}>
                ✓ Clean Bus Transmission (A → D)
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => handleLoadPreset(LabPreset.CSMA_CD_COLLISION_BEB)}>
                💥 Collision, Jam &amp; BEB Backoff
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => handleLoadPreset(LabPreset.EXCESSIVE_COLLISIONS_DISCARD)}>
                🛑 16-Attempt Discard
              </button>
            </>
          )}
        </div>
      </div>

      {/* 4. Message Input & Configuration Section */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">1. Transmission Configuration &amp; Frame Segmentation</h3>
          <span className="badge badge-info" style={{ fontFamily: 'var(--font-mono)' }}>
            Virtual Clock: t = {telemetry.currentTick} ticks
          </span>
        </div>

        {/* Multiline Message Input Section */}
        <div className="lab-message-section">
          <div className="lab-message-header">
            <label className="form-label" style={{ marginBottom: 0 }}>
              <span>Message Payload</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'none' }}>
                {chunkInfo.charCount} characters entered
              </span>
            </label>
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Quick Samples:</span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                onClick={() => setMessageInput('NETWORKS LAB 2026')}
              >
                NETWORKS
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                onClick={() => setMessageInput('HELLO WORLD')}
              >
                HELLO
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                onClick={() => setMessageInput('FLAG TEST: ~0x7E~')}
              >
                FLAGS (~0x7E~)
              </button>
            </div>
          </div>

          <textarea
            className="form-textarea"
            rows={3}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Type the message you want to transmit (e.g., NETWORKS LAB 2026)..."
          />

          <div className="lab-message-footer">
            <div className="chunk-segment-pill">
              <span>📦 Segmentation:</span>
              <strong>
                {chunkInfo.frameCount === 0
                  ? '0 frames (Empty)'
                  : `${chunkInfo.frameCount} frame(s) at max ${maxPayloadChunk} chars/frame`}
              </strong>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleSendMessage}
              disabled={!messageInput.trim() || isPlaying}
              style={{ minWidth: '160px' }}
            >
              <span>🚀 Transmit Payload</span>
            </button>
          </div>

          {/* Concrete Frame Queue & Segmentation Ribbon */}
          {allFrames.length > 0 && (
            <div className="segmentation-queue-container">
              <div className="segmentation-queue-header">
                <span className="segmentation-queue-title">
                  <span>🎞️ Concrete Frame Queue ({allFrames.length} Frames):</span>
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Click any frame card to inspect wire fields
                </span>
              </div>
              <div className="frame-cards-row">
                {allFrames.map((f, idx) => {
                  const isSelected = selectedFrameId === f.id;
                  let statusLabel = 'PENDING';
                  let statusClass = 'frame-status-pending';

                  if (f.stage8?.delivered) {
                    statusLabel = 'DELIVERED';
                    statusClass = 'frame-status-delivered';
                  } else if (f.stage7 && !f.stage7.fcsVerified) {
                    statusLabel = 'CORRUPTED';
                    statusClass = 'frame-status-corrupted';
                  } else if (activeInFlightData && activeInFlightData.transmittedFrame?.id === f.id) {
                    statusLabel = 'IN TRANSIT';
                    statusClass = 'frame-status-in-flight';
                  } else if (f.attempt > 0) {
                    statusLabel = `ATTEMPT #${f.attempt}`;
                    statusClass = 'frame-status-transmitting';
                  }

                  return (
                    <div
                      key={f.id}
                      className={`frame-queue-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedFrameId(f.id)}
                    >
                      <div className="frame-card-top">
                        <span className="frame-seq-badge">Frame #{f.seq ?? idx}</span>
                        <span className={`frame-status-badge ${statusClass}`}>{statusLabel}</span>
                      </div>
                      <div className="frame-wire-preview">
                        <span className="wire-tag wire-flag">Flag</span>
                        <span className="wire-tag wire-header">Seq:{f.seq ?? idx}</span>
                        <span className="wire-tag wire-payload">&quot;{f.payloadText}&quot;</span>
                        <span className="wire-tag wire-fcs">FCS</span>
                        <span className="wire-tag wire-flag">Flag</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Configuration Parameters Grid */}
        <div className="lab-config-grid" style={{ marginBottom: '1.25rem' }}>
          {/* Framing Algorithm */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Framing Algorithm:</label>
            <select
              className="form-select"
              value={framingType}
              onChange={(e) => {
                setFramingType(e.target.value);
                handleReset({ framingType: e.target.value });
              }}
            >
              <option value={FramingAlgorithm.BYTE_STUFFING}>RFC 1662 PPP Byte Stuffing (0x7E/0x7D)</option>
              <option value={FramingAlgorithm.BIT_STUFFING}>HDLC Bit Stuffing (01111110 Flag)</option>
              <option value={FramingAlgorithm.CHARACTER_COUNT}>Character Count (Total Length Prefix)</option>
            </select>
          </div>

          {/* Error Control (FCS) */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Error-Control Algorithm (FCS):</label>
            <select
              className="form-select"
              value={fcsType}
              onChange={(e) => {
                setFcsType(e.target.value);
                handleReset({ fcsType: e.target.value });
              }}
            >
              <option value={FcsAlgorithm.CRC_16}>CRC-16/CCITT-FALSE (x¹⁶ + x¹² + x⁵ + 1)</option>
              <option value={FcsAlgorithm.CRC_8}>CRC-8/SMBUS (x⁸ + x² + x + 1)</option>
              <option value={FcsAlgorithm.CHECKSUM_16}>16-bit Internet Checksum (RFC 1071)</option>
              <option value={FcsAlgorithm.PARITY_1D_EVEN}>1D Parity (Even Parity Bit)</option>
              <option value={FcsAlgorithm.PARITY_2D_EVEN}>2D Matrix Parity (4x4 Even)</option>
            </select>
          </div>

          {/* Protocol Selection (Profile A) or Station Selection (Profile B) */}
          {profile === ProfileType.PROFILE_A ? (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Flow Control &amp; ARQ Protocol:</label>
              <select
                className="form-select"
                value={protocol}
                onChange={(e) => {
                  setProtocol(e.target.value);
                  handleReset({ protocol: e.target.value });
                }}
              >
                <option value={FlowProtocol.STOP_AND_WAIT}>Stop-and-Wait ARQ (Ws=1)</option>
                <option value={FlowProtocol.GO_BACK_N}>Go-Back-N ARQ (Ws=4, Cumulative ACK)</option>
                <option value={FlowProtocol.SELECTIVE_REPEAT}>Selective Repeat ARQ (Ws=4, Selective ACK)</option>
              </select>
            </div>
          ) : (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Bus Source &amp; Destination:</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <select
                  className="form-select"
                  value={sourceStation}
                  onChange={(e) => {
                    setSourceStation(e.target.value);
                    handleReset({ sourceStation: e.target.value });
                  }}
                >
                  <option value="A">Station A (0m)</option>
                  <option value="B">Station B (100m)</option>
                  <option value="C">Station C (200m)</option>
                  <option value="D">Station D (300m)</option>
                </select>
                <select
                  className="form-select"
                  value={destStation}
                  onChange={(e) => {
                    setDestStation(e.target.value);
                    handleReset({ destStation: e.target.value });
                  }}
                >
                  <option value="D">To Station D (300m)</option>
                  <option value="C">To Station C (200m)</option>
                  <option value="B">To Station B (100m)</option>
                  <option value="A">To Station A (0m)</option>
                </select>
              </div>
            </div>
          )}

          {/* Max Payload Chunk Size */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              <span>Max Chunk Size:</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Range: 1–64</span>
            </label>
            <input
              type="number"
              className="form-input"
              min="1"
              max="64"
              value={maxPayloadChunk}
              onChange={(e) => {
                const val = Math.max(1, Math.min(64, parseInt(e.target.value) || 1));
                setMaxPayloadChunk(val);
                handleReset({ maxPayloadChunk: val });
              }}
            />
          </div>
        </div>

        {/* Playback Controls & Status Toolbar */}
        <div className="playback-card">
          <div className="playback-toolbar">
            {/* Simulation Actions */}
            <div className="playback-actions">
              <button
                className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'}`}
                onClick={handleTogglePlay}
                title={isPlaying ? 'Pause simulation playback' : 'Start simulation playback'}
              >
                {isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleStepTick}
                disabled={isPlaying}
                title="Advance simulation by exactly 1 virtual clock tick"
              >
                ⏭ Step Tick (+1)
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleStepEvent}
                disabled={isPlaying}
                title="Execute next scheduled discrete event from priority queue"
              >
                ⏩ Step Event
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleRunToCompletion}
                title="Safely drain queue and process all events to completion instantly without skipping protocol logic"
                style={{
                  background: 'var(--accent-emerald)',
                  borderColor: 'var(--accent-emerald)',
                  color: '#ffffff',
                  fontWeight: 700,
                }}
              >
                ⚡ Instant / Complete
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => handleReset()}
                title="Stop playback and reset simulation state to tick 0"
              >
                🔄 Reset
              </button>
            </div>

            {/* Playback Speed Segmented Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Speed:
              </span>
              <div className="speed-segment-control">
                <button
                  type="button"
                  className={`speed-segment-btn ${playSpeedMs === 300 ? 'active' : ''}`}
                  onClick={() => setPlaySpeedMs(300)}
                  title="Slow mode: 300 ms per virtual tick (recommended for step inspection)"
                >
                  Slow (300ms)
                </button>
                <button
                  type="button"
                  className={`speed-segment-btn ${playSpeedMs === 100 ? 'active' : ''}`}
                  onClick={() => setPlaySpeedMs(100)}
                  title="Normal mode: 100 ms per virtual tick (recommended default)"
                >
                  Normal (100ms)
                </button>
                <button
                  type="button"
                  className={`speed-segment-btn ${playSpeedMs === 30 ? 'active' : ''}`}
                  onClick={() => setPlaySpeedMs(30)}
                  title="Fast mode: 30 ms per virtual tick (10x faster)"
                >
                  Fast (30ms)
                </button>
              </div>
            </div>

            {/* Simulation Status Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className={`sim-status-banner ${simStatus.badgeClass}`}>
                <span className="sim-status-dot" />
                <span>{simStatus.label}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Live Plain-English Narration Banner */}
      <div className={`narration-banner ${liveNarration.className}`}>
        <span className="narration-icon">{liveNarration.icon}</span>
        <span className="narration-text">{liveNarration.text}</span>
      </div>

      {/* 6. DOMINANT VISUAL SIMULATION CANVAS */}
      <div className="dominant-canvas-card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h3 className="card-title" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🌐</span>
              <span>Physical Transmission Medium &amp; End-to-End Canvas</span>
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Animated physical propagation across virtual clock ticks
            </span>
          </div>
          <span className="badge badge-info" style={{ fontFamily: 'var(--font-mono)' }}>
            One-Way Delay: {propagationDelay} ticks
          </span>
        </div>

        {profile === ProfileType.PROFILE_A ? (
          /* Profile A: Point-to-Point ARQ Visual Canvas */
          <div className="canvas-layout-grid">
            {/* Sender Node Card */}
            <div className="canvas-station-card sender-station">
              <div>
                <div className="station-card-header">
                  <span className="station-name">🖥️ Station A (Sender)</span>
                  <span className="badge badge-info">TX</span>
                </div>
                <div style={{ marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Protocol: </span>
                    <strong style={{ color: 'var(--accent-blue)' }}>{protocol}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Window Status: </span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>
                      {protocol === FlowProtocol.STOP_AND_WAIT
                        ? `Ws=1 (Wait ACK)`
                        : `[Base: ${telemetry.senderState?.base ?? 0}, Next: ${telemetry.senderState?.nextSeq ?? 0}]`}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Frames Queued: </span>
                    <strong>{allFrames.length}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Timeout Timer: </span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>{timeoutDuration} ticks</strong>
                  </div>
                </div>
              </div>
              <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Upper Layer Input:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                  &quot;{messageInput || '(empty)'}&quot;
                </span>
              </div>
            </div>

            {/* Central Transmission Medium Lanes */}
            <div className="canvas-medium-track">
              {/* Forward Channel Track (DATA ->) */}
              <div className="medium-lane-container">
                <span className="lane-direction-badge">
                  <span>➡️</span> Forward Link: Station A → Station B (DATA Frames)
                </span>
                {activeInFlightData ? (
                  <div
                    className={`in-flight-packet in-flight-data ${
                      activeInFlightData.outcome === 'CORRUPTED'
                        ? 'in-flight-corrupted'
                        : activeInFlightData.outcome === 'DROPPED'
                        ? 'in-flight-dropped'
                        : ''
                    }`}
                    style={{ left: `${dataProgressPct}%` }}
                  >
                    <span>📦 DATA #{activeInFlightData.transmittedFrame?.seq ?? 0}</span>
                    <span style={{ color: 'var(--text-muted)' }}>|</span>
                    <span>&quot;{activeInFlightData.transmittedFrame?.payloadText ?? ''}&quot;</span>
                    {activeInFlightData.outcome === 'CORRUPTED' && <span>⚡ [CORRUPT]</span>}
                    {activeInFlightData.outcome === 'DROPPED' && <span>❌ [DROPPED]</span>}
                  </div>
                ) : (
                  <div className="lane-idle-notice">── Forward Link Idle (Ready for Transmission) ──</div>
                )}
              </div>

              {/* Reverse Channel Track (ACK <-) */}
              <div className="medium-lane-container">
                <span className="lane-direction-badge">
                  <span>⬅️</span> Reverse Link: Station B → Station A (ACK Frames)
                </span>
                {activeInFlightAck ? (
                  <div
                    className={`in-flight-packet in-flight-ack ${
                      activeInFlightAck.outcome === 'DROPPED' ? 'in-flight-dropped' : ''
                    }`}
                    style={{ left: `${ackProgressPct}%` }}
                  >
                    <span>📩 ACK #{activeInFlightAck.transmittedFrame?.ack ?? activeInFlightAck.transmittedFrame?.seq ?? 1}</span>
                    {activeInFlightAck.outcome === 'DROPPED' && <span>❌ [DROPPED]</span>}
                  </div>
                ) : (
                  <div className="lane-idle-notice">── Reverse Link Idle ──</div>
                )}
              </div>

              {/* Physical Channel Fault Injection Controls */}
              <div className="fault-panel-card" style={{ marginTop: 0, padding: '0.65rem 0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-rose)' }}>
                    ⚡ Channel Fault Injection:
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className={`btn btn-sm ${pendingFaultData === 'CORRUPT' ? 'btn-danger' : 'btn-outline'}`}
                      onClick={() => handleSetDataFault(pendingFaultData === 'CORRUPT' ? null : 'CORRUPT')}
                      title="Flip bit during forward DATA transmission"
                    >
                      ⚡ Corrupt DATA
                    </button>
                    <button
                      className={`btn btn-sm ${pendingFaultData === 'DROP' ? 'btn-danger' : 'btn-outline'}`}
                      onClick={() => handleSetDataFault(pendingFaultData === 'DROP' ? null : 'DROP')}
                      title="Silently drop next forward DATA frame"
                    >
                      ❌ Drop DATA
                    </button>
                    <button
                      className={`btn btn-sm ${pendingFaultAck === 'DROP' ? 'btn-danger' : 'btn-outline'}`}
                      onClick={() => handleSetAckFault(pendingFaultAck === 'DROP' ? null : 'DROP')}
                      title="Drop next reverse ACK to test duplicate suppression"
                    >
                      🔁 Drop ACK
                    </button>
                    {(pendingFaultData || pendingFaultAck) && (
                      <button className="btn btn-sm btn-secondary" onClick={handleClearFaults}>
                        🧹 Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Receiver Node Card */}
            <div className="canvas-station-card receiver-station">
              <div>
                <div className="station-card-header">
                  <span className="station-name">🖥️ Station B (Receiver)</span>
                  <span className="badge badge-success">RX</span>
                </div>
                <div style={{ marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Expected Seq: </span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>
                      #{telemetry.receiverState?.expectedSeq ?? 0}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>FCS Check: </span>
                    <strong style={{ color: 'var(--accent-emerald)' }}>
                      {telemetry.corruptions > 0 && selectedInspection?.stage7 && !selectedInspection.stage7.fcsVerified
                        ? 'INVALID (REJECTED)'
                        : 'VALID (MATCH)'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Delivered Frames: </span>
                    <strong>{telemetry.delivered ?? 0}</strong>
                  </div>
                  {protocol === FlowProtocol.SELECTIVE_REPEAT && (
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Buffered Out-of-Order: </span>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>
                        {telemetry.receiverState?.receiverBuffer?.length > 0
                          ? `[${telemetry.receiverState.receiverBuffer.join(', ')}]`
                          : 'None'}
                      </strong>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--accent-emerald)', display: 'block', fontWeight: 700 }}>
                  ✓ Reconstructed Payload:
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                  &quot;{reconstructedMessage}&quot;
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Profile B: Shared-Medium CSMA/CD Visual Bus */
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
              {['A', 'B', 'C', 'D'].map((stationId) => {
                const isSource = sourceStation === stationId;
                const isDest = destStation === stationId;
                return (
                  <div
                    key={stationId}
                    className="canvas-station-card"
                    style={{
                      borderTop: isSource
                        ? '4px solid var(--accent-blue)'
                        : isDest
                        ? '4px solid var(--accent-emerald)'
                        : '4px solid var(--border-subtle)',
                    }}
                  >
                    <div className="station-card-header">
                      <span className="station-name">Station {stationId}</span>
                      <span className="badge badge-info">
                        {isSource ? 'SRC' : isDest ? 'DEST' : 'TAPPED'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Position: {stationId === 'A' ? '0m' : stationId === 'B' ? '100m' : stationId === 'C' ? '200m' : '300m'}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="medium-lane-container" style={{ minHeight: '90px' }}>
              <span className="lane-direction-badge">
                <span>📡</span> Shared Coaxial Cable Bus (IEEE 802.3 Classical Ethernet)
              </span>
              <div className="lane-idle-notice">
                {telemetry.status?.state === 'TRANSMITTING'
                  ? `Signal Wavefront propagating from Station ${sourceStation} → Station ${destStation}...`
                  : telemetry.status?.state === 'COLLISION'
                  ? `💥 COLLISION IN PROGRESS: Signals superimposing in medium (|V1 + V2| > Vth). 32-bit Jam active!`
                  : `── Shared Bus Medium Idle (Listening Before Transmitting) ──`}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 7. Collapsible Technical Inspector: Detailed 8-Stage Wire Lifecycle */}
      <details className="technical-inspector-card" open={allFrames.length > 0}>
        <summary className="technical-inspector-summary">
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🔍</span>
            <strong>Detailed 8-Stage Wire Inspector (Selected Frame #{selectedInspection?.seq ?? 0})</strong>
          </span>
          <span className="badge badge-info">Explicit 8-Stage Transmission Lifecycle</span>
        </summary>
        <div className="technical-inspector-content">
          {selectedInspection ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {/* Stage 1 */}
              <div className="card" style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', padding: '1rem', margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong style={{ color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>Stage 1: Upper-Layer Payload</strong>
                  <span className="badge badge-info">{selectedInspection.stage1?.byteLength || 0} bytes</span>
                </div>
                <div className="mono-display" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                  Text: &quot;{selectedInspection.stage1?.payloadText}&quot;
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  Hex: {selectedInspection.stage1?.hexBytes}
                </div>
              </div>

              {/* Stage 2 */}
              <div className="card" style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', padding: '1rem', margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong style={{ color: 'var(--accent-blue)', fontSize: '0.85rem' }}>Stage 2: Header Serialization</strong>
                  <span className="badge badge-info">m={selectedInspection.stage2?.m} bits</span>
                </div>
                <div className="mono-display" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                  Type: {selectedInspection.stage2?.type} | Seq: {selectedInspection.stage2?.seq} | Ack: {selectedInspection.stage2?.ack}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  Header Hex: {selectedInspection.stage2?.headerHex} | Wire Total: {selectedInspection.stage2?.wireByteCount}B
                </div>
              </div>

              {/* Stage 3 */}
              <div className="card" style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', padding: '1rem', margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong style={{ color: 'var(--accent-emerald)', fontSize: '0.85rem' }}>Stage 3: Error Control (FCS)</strong>
                  <span className="badge badge-success">Protected</span>
                </div>
                <div className="mono-display" style={{ fontSize: '0.8rem', marginBottom: '0.5rem', color: 'var(--accent-emerald)' }}>
                  FCS: {selectedInspection.stage3?.fcsHex} ({selectedInspection.stage3?.fcsType})
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Computed over exact Wire Bytes (Header + Payload).
                </div>
              </div>

              {/* Stage 4 */}
              <div className="card" style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', padding: '1rem', margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong style={{ color: 'var(--accent-purple)', fontSize: '0.85rem' }}>Stage 4: Framing &amp; Stuffing</strong>
                  <span className="badge badge-info">+{selectedInspection.stage4?.overheadCount} overhead</span>
                </div>
                <div className="mono-display" style={{ fontSize: '0.75rem', marginBottom: '0.5rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                  {selectedInspection.stage4?.framedDisplay}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Mode: {selectedInspection.stage4?.framingType}
                </div>
              </div>

              {/* Stage 5 */}
              <div className="card" style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', padding: '1rem', margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong style={{ color: 'var(--accent-amber)', fontSize: '0.85rem' }}>Stage 5: Protocol Dispatch</strong>
                  <span className="badge badge-info">{profile === ProfileType.PROFILE_A ? protocol : 'CSMA/CD'}</span>
                </div>
                <div className="mono-display" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                  Dispatch Tick: t = {selectedInspection.stage5?.sentTick ?? 'Pending'} | Attempt: #{selectedInspection.attempt}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {profile === ProfileType.PROFILE_A ? 'Dispatched via Sliding Window ARQ queue' : 'Sensing carrier on shared linear medium'}
                </div>
              </div>

              {/* Stage 6 */}
              <div className="card" style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', padding: '1rem', margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong style={{ color: 'var(--accent-rose)', fontSize: '0.85rem' }}>Stage 6: Channel Transit</strong>
                  <span className={`badge ${selectedInspection.stage6?.faultApplied !== 'NONE' ? 'badge-danger' : 'badge-info'}`}>
                    {selectedInspection.stage6?.faultApplied || 'TRANSIT'}
                  </span>
                </div>
                <div className="mono-display" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                  {selectedInspection.stage6 ? (
                    `t=${selectedInspection.stage6.startTick} → t=${selectedInspection.stage6.deliveryTick} (${selectedInspection.stage6.outcome})`
                  ) : (
                    'In transit across physical medium...'
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Propagation Delay: {propagationDelay} ticks. Fault: {selectedInspection.stage6?.faultApplied || 'NONE'}.
                </div>
              </div>

              {/* Stage 7 */}
              <div className="card" style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', padding: '1rem', margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong style={{ color: 'var(--accent-emerald)', fontSize: '0.85rem' }}>Stage 7: Receiver Processing</strong>
                  {selectedInspection.stage7 && (
                    <span className={`badge ${selectedInspection.stage7.outcome === 'ACCEPTED' ? 'badge-success' : 'badge-danger'}`}>
                      {selectedInspection.stage7.outcome}
                    </span>
                  )}
                </div>
                <div className="mono-display" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                  {selectedInspection.stage7 ? (
                    `Deframing: ${selectedInspection.stage7.deframingSuccess ? 'OK' : 'FAIL'} | FCS: ${selectedInspection.stage7.fcsVerified ? 'VALID' : 'INVALID'}`
                  ) : (
                    'Awaiting arrival at receiver...'
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {selectedInspection.stage7?.fcsError || 'FCS matched receiver recomputation.'}
                </div>
              </div>

              {/* Stage 8 */}
              <div className="card" style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', padding: '1rem', margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong style={{ color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>Stage 8: Delivery &amp; Telemetry</strong>
                  {selectedInspection.stage8?.delivered ? (
                    <span className="badge badge-success">DELIVERED</span>
                  ) : (
                    <span className="badge badge-warning">{selectedInspection.stage8?.isDuplicate ? 'DUPLICATE DISCARDED' : 'PENDING'}</span>
                  )}
                </div>
                <div className="mono-display" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                  {selectedInspection.stage8?.summary || 'Transmission in progress...'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Delivered Tick: {selectedInspection.stage8?.deliveredTick ?? '—'}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
              Submit a message or load a preset scenario above to begin end-to-end transmission.
            </div>
          )}
        </div>
      </details>

      {/* 8. Collapsible Technical Inspector: Telemetry & Discrete-Event Timeline Log */}
      <details className="technical-inspector-card">
        <summary className="technical-inspector-summary">
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📊</span>
            <strong>Live Transmission Telemetry &amp; Discrete-Event Log</strong>
          </span>
          <span className="badge badge-info">{stageHistory.length} Events Recorded</span>
        </summary>
        <div className="technical-inspector-content">
          <div className="grid-2" style={{ marginBottom: 0 }}>
            {/* Telemetry Metrics */}
            <div>
              <h4 style={{ fontSize: '0.92rem', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                Protocol Metrics &amp; Performance
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="stat-card">
                  <div className="stat-label">Total Attempts</div>
                  <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>
                    {telemetry.totalAttempts ?? 0}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Delivered</div>
                  <div className="stat-value" style={{ color: 'var(--accent-emerald)' }}>
                    {telemetry.delivered ?? telemetry.totalDelivered ?? 0}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Retransmissions</div>
                  <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>
                    {telemetry.retransmissions ?? telemetry.totalAborted ?? 0}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Corruptions</div>
                  <div className="stat-value" style={{ color: 'var(--accent-rose)' }}>
                    {telemetry.corruptions ?? telemetry.totalCollisions ?? 0}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Duplicates</div>
                  <div className="stat-value" style={{ color: 'var(--accent-purple)' }}>
                    {telemetry.duplicates ?? 0}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Utilization</div>
                  <div className="stat-value" style={{ color: 'var(--accent-cyan)' }}>
                    {telemetry.channelUtilization ?? telemetry.busUtilization ?? 0}%
                  </div>
                </div>
              </div>
            </div>

            {/* Chronological Event Log */}
            <div>
              <h4 style={{ fontSize: '0.92rem', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                Discrete-Event Timeline Log
              </h4>
              <div className="trace-log-container" style={{ maxHeight: '240px' }}>
                {stageHistory.slice(-20).reverse().map((entry) => (
                  <div key={entry.id} className="trace-row">
                    <span className="trace-tick">t={entry.tick}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', minWidth: '90px' }}>
                      {entry.type}:
                    </span>
                    <span style={{ color: 'var(--text-secondary)', flex: 1, fontSize: '0.78rem' }}>
                      {entry.eventType || entry.title || entry.description || `Frame #${entry.frameId ?? entry.seq ?? ''}`}
                    </span>
                    {entry.corrupted && <span className="badge badge-danger">CORRUPT</span>}
                  </div>
                ))}
                {stageHistory.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem' }}>
                    No events recorded yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
