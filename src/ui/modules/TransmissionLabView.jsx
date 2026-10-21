/**
 * TransmissionLabView.jsx
 * 
 * Interactive Visualizer for Phase 8: Integrated End-to-End Data Link Layer Transmission Lab.
 * 
 * Demonstrates:
 * - 8-Stage Transmission Lifecycle (Payload -> Header -> FCS -> Framing -> Protocol Dispatch -> Channel -> Receiver Deframing/FCS -> Delivery)
 * - Profile A: Reliable Point-to-Point Link (Framing + FCS + ARQ: Stop-and-Wait, Go-Back-N, Selective Repeat)
 * - Profile B: Shared-Medium Ethernet Teaching Model (Framing + FCS + CSMA/CD + Collision Detection + BEB)
 * - Interactive Fault Injection (Corrupt DATA, Drop DATA, Delay DATA, Corrupt ACK, Drop ACK)
 * - Byte-level Frame Inspector with color-coded field decomposition
 * - Real-time metrics telemetry and Viva Helper panel
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
  const [showVivaHelper, setShowVivaHelper] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

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
          // If simulation cycle has completed, halt playback cleanly
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
      // If nothing has been sent yet, initiate transmission first
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

    // Reflect preset payload in message input
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

  return (
    <div className="transmission-lab-container">
      {/* 1. Header Banner */}
      <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '4px solid var(--accent-cyan)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h2 className="card-title" style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                🔬 End-to-End Data Link Layer Transmission Lab
              </h2>
              <span className="badge badge-info">Flagship Pipeline</span>
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

      {/* 2. Collapsible Student & Viva Help Guide */}
      <details className="help-guide-card">
        <summary className="help-guide-summary">
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📘</span>
            <span>How This Simulation Works (Student &amp; Viva Guide)</span>
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>Click to Expand / Collapse</span>
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
            * Note: This simulation runs on a discrete-event virtual clock (1 tick = 10 µs). It does not send real socket traffic over your physical Wi-Fi or Ethernet card.
          </div>
        </div>
      </details>

      {/* 3. Educational Presets Bar */}
      <div className="card" style={{ padding: '0.85rem 1.25rem', marginBottom: '1.25rem', background: 'rgba(26, 34, 52, 0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>🎓 Preset Scenarios:</span>
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

      {/* 4. Configuration & Transmission Controls Card */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">1. Transmission Configuration &amp; Message Submission</h3>
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
              style={{ minWidth: '150px' }}
            >
              <span>🚀 Transmit Payload</span>
            </button>
          </div>
        </div>

        {/* Configuration Selects Grid */}
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
                  color: '#041017',
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

          {/* Fault Injection Panel (Profile A) */}
          {profile === ProfileType.PROFILE_A && (
            <div className="fault-panel-card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: 'var(--accent-rose)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    ⚡ Physical Channel Fault Injection (Interactive Testing)
                  </span>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                    Arm a fault for the next transmission to observe receiver FCS rejection or timeout retransmissions.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    className={`btn btn-sm ${pendingFaultData === 'CORRUPT' ? 'btn-danger' : 'btn-outline'}`}
                    onClick={() => handleSetDataFault(pendingFaultData === 'CORRUPT' ? null : 'CORRUPT')}
                    title="Flip a bit on the wire during forward DATA transmission"
                  >
                    ⚡ Corrupt DATA
                  </button>
                  <button
                    className={`btn btn-sm ${pendingFaultData === 'DROP' ? 'btn-danger' : 'btn-outline'}`}
                    onClick={() => handleSetDataFault(pendingFaultData === 'DROP' ? null : 'DROP')}
                    title="Silently drop next forward DATA frame in channel"
                  >
                    ❌ Drop DATA
                  </button>
                  <button
                    className={`btn btn-sm ${pendingFaultAck === 'DROP' ? 'btn-danger' : 'btn-outline'}`}
                    onClick={() => handleSetAckFault(pendingFaultAck === 'DROP' ? null : 'DROP')}
                    title="Drop next reverse ACK to test duplicate frame suppression"
                  >
                    🔁 Drop ACK
                  </button>
                  {(pendingFaultData || pendingFaultAck) && (
                    <button className="btn btn-sm btn-secondary" onClick={handleClearFaults}>
                      🧹 Clear Armed Faults
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Eight-Stage Lifecycle Pipeline Visualizer */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">2. Explicit 8-Stage Transmission Lifecycle</h3>
          {allFrames.length > 0 && (
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Inspect Frame:</span>
              {allFrames.map((f, idx) => (
                <button
                  key={f.id}
                  className={`btn btn-sm ${selectedFrameId === f.id ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setSelectedFrameId(f.id)}
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                >
                  #{f.seq ?? idx}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedInspection ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {/* Stage 1 */}
            <div className="card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '1rem' }}>
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
            <div className="card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '1rem' }}>
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
            <div className="card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '1rem' }}>
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
            <div className="card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '1rem' }}>
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
            <div className="card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '1rem' }}>
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
            <div className="card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '1rem' }}>
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
            <div className="card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '1rem' }}>
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
            <div className="card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '1rem' }}>
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
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            Submit a message or load a preset scenario above to begin end-to-end transmission.
          </div>
        )}
      </div>

      {/* 5. Telemetry & Channel Telemetry Dashboard */}
      <div className="grid-2" style={{ marginBottom: '1.25rem' }}>
        {/* Telemetry Metrics */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">3. Live Transmission Telemetry</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Total Attempts</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                {telemetry.totalAttempts ?? telemetry.totalAttempts ?? 0}
              </div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Frames Delivered</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                {telemetry.delivered ?? telemetry.totalDelivered ?? 0}
              </div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Retransmissions</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-amber)' }}>
                {telemetry.retransmissions ?? telemetry.totalAborted ?? 0}
              </div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Corruptions</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-rose)' }}>
                {telemetry.corruptions ?? telemetry.totalCollisions ?? 0}
              </div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Duplicates Discarded</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-purple)' }}>
                {telemetry.duplicates ?? 0}
              </div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Channel Utilization</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
                {telemetry.channelUtilization ?? telemetry.busUtilization ?? 0}%
              </div>
            </div>
          </div>

          {/* Upper-layer delivered message banner */}
          <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-emerald)', display: 'block', marginBottom: '0.25rem' }}>
              ✓ Receiver Upper-Layer Reconstructed Stream:
            </span>
            <div className="mono-display" style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>
              {reconstructedMessage}
            </div>
          </div>
        </div>

        {/* Chronological Event Log */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title">4. Discrete-Event Timeline Log</h3>
            <span className="badge badge-info">{stageHistory.length} Events</span>
          </div>
          <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {stageHistory.slice(-20).reverse().map((entry) => (
              <div
                key={entry.id}
                style={{
                  fontSize: '0.8rem',
                  padding: '0.4rem 0.6rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', marginRight: '0.5rem' }}>
                    t={entry.tick}
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.type}:</span>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {entry.eventType || entry.title || entry.description || `Frame #${entry.frameId ?? entry.seq ?? ''}`}
                  </span>
                </div>
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

      {/* 6. Viva Helper Panel */}
      <div className="card" style={{ borderLeft: '4px solid var(--accent-purple)' }}>
        <div
          className="card-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setShowVivaHelper(!showVivaHelper)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>🎓</span>
            <h3 className="card-title">Viva Helper &amp; Theoretical Examination Reference</h3>
          </div>
          <span className="btn btn-outline btn-sm">
            {showVivaHelper ? 'Hide FAQ ▲' : 'Show Viva FAQ ▼'}
          </span>
        </div>

        {showVivaHelper && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginTop: '1rem' }}>
            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <h4 style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                Q1: Why does FCS calculation precede Framing at the sender?
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                <strong>Layering Principle:</strong> The Frame Check Sequence (CRC or Checksum) protects the logical data
                (Header + Payload). Framing (bit/byte stuffing) ensures transparency over the physical transmission medium.
                If framing occurred first, stuffing characters could confuse the FCS or vice versa. The receiver must first
                deframe (reconstruct wire bytes) and then verify the FCS.
              </p>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <h4 style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                Q2: Why does FCS cover both the Header and Payload?
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                <strong>Integrity Coverage:</strong> If a bit flips in the sequence number (e.g., from seq=0 to seq=1)
                and FCS only covered the payload, the receiver would accept a corrupted sequence number, misalign its sliding
                window, and potentially deliver duplicate or out-of-order packets. Protecting the serialized header prevents
                undetected protocol desynchronization.
              </p>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <h4 style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                Q3: Difference between Point-to-Point ARQ and CSMA/CD?
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                <strong>Topology &amp; Layer Scope:</strong> Sliding window ARQ (Stop-and-Wait, GBN, SR) provides reliable
                flow control over a dedicated point-to-point link using acknowledgements and timers. CSMA/CD is a MAC sublayer
                protocol for shared-medium broadcast buses (Ethernet IEEE 802.3) that handles contention, collision detection (2τ),
                and backoff without sliding-window end-to-end ACKs.
              </p>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <h4 style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                Q4: How is duplicate payload delivery prevented when an ACK is lost?
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                <strong>Sequence Memory:</strong> When the receiver successfully delivers frame #0, it increments its expected
                sequence number to #1 and transmits ACK(1). If that ACK is lost, the sender times out and re-sends frame #0.
                The receiver compares the received seq (0) against expected (1), detects a duplicate, discards the payload,
                and re-transmits ACK(1) so the sender can advance.
              </p>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <h4 style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                Q5: Why must frame transmission duration $T_t \ge 2\tau$ in CSMA/CD?
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                <strong>Vulnerability Window:</strong> In the worst-case scenario, a collision occurs just before the signal
                reaches the farthest station at $t = \tau - \epsilon$. The collision wavefront takes another $\tau$ to travel
                back to the sender. If the sender finishes transmitting before $2\tau$, it would falsely assume successful transmission
                and miss detecting the collision while transmitting.
              </p>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <h4 style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                Q6: What is the Desynchronization Problem in Character Count Framing?
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                <strong>Header Cascading Error:</strong> Character count framing relies on a single length byte to locate
                the boundary of the next frame. If that length byte is corrupted, the receiver misinterprets normal payload bytes
                as the length header of subsequent frames, causing catastrophic cascading framing loss until a resynchronization
                mechanism or connection reset occurs.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
