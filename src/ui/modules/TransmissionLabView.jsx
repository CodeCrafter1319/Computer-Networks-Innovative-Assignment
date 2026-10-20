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
  const [playSpeedMs, setPlaySpeedMs] = useState(300);
  const [selectedFrameId, setSelectedFrameId] = useState(null);
  const [showVivaHelper, setShowVivaHelper] = useState(false);

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
    coordinatorRef.current.sendMessage(messageInput);
    syncState();
  };

  // Preset loader handler
  const handleLoadPreset = (presetName) => {
    setIsPlaying(false);
    coordinatorRef.current.loadPreset(presetName);
    setProfile(coordinatorRef.current.config.profile);
    setProtocol(coordinatorRef.current.config.protocol);
    setFcsType(coordinatorRef.current.config.fcsType);
    setFramingType(coordinatorRef.current.config.framingType);
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

      {/* 2. Educational Presets Bar */}
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

      {/* 3. Configuration & Transmission Controls */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">1. Transmission Configuration &amp; Message Submission</h3>
          <span className="badge badge-info">Virtual Tick: t = {telemetry.currentTick}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          {/* Message Input */}
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label className="form-label">Upper-Layer Message Payload:</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="form-input"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Enter text to transmit..."
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <button className="btn btn-primary" onClick={handleSendMessage}>
                <span>🚀 Transmit</span>
              </button>
            </div>
            <span className="form-hint">
              Payload size: {messageInput.length} chars. Max chunk: {maxPayloadChunk} chars → Splits into {Math.ceil(messageInput.length / maxPayloadChunk) || 1} frame(s).
            </span>
          </div>

          {/* Framing Algorithm */}
          <div className="form-group">
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
          <div className="form-group">
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

          {/* Protocol Selection (Profile A only) */}
          {profile === ProfileType.PROFILE_A && (
            <div className="form-group">
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
          )}

          {/* Chunk size */}
          <div className="form-group">
            <label className="form-label">Max Chunk (chars/frame):</label>
            <input
              type="number"
              className="form-input"
              min="1"
              max="64"
              value={maxPayloadChunk}
              onChange={(e) => {
                const val = Math.max(1, parseInt(e.target.value) || 1);
                setMaxPayloadChunk(val);
                handleReset({ maxPayloadChunk: val });
              }}
            />
          </div>
        </div>

        {/* Playback Controls & Fault Injection Action Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
          {/* Simulation Stepper */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleStepTick}>
              ⏭ Step Tick (+1)
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleStepEvent}>
              ⏩ Step Event
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => handleReset()}>
              🔄 Reset
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              <span>Speed:</span>
              <input
                type="range"
                min="100"
                max="800"
                step="50"
                value={playSpeedMs}
                onChange={(e) => setPlaySpeedMs(parseInt(e.target.value))}
                style={{ width: '80px' }}
              />
              <span>{playSpeedMs}ms</span>
            </div>
          </div>

          {/* Fault Injection Buttons (Profile A) */}
          {profile === ProfileType.PROFILE_A && (
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Fault Injection:</span>
              <button
                className={`btn btn-sm ${pendingFaultData === 'CORRUPT' ? 'btn-danger' : 'btn-outline'}`}
                onClick={() => handleSetDataFault(pendingFaultData === 'CORRUPT' ? null : 'CORRUPT')}
                title="Inject bit corruption in next outgoing DATA frame"
              >
                ⚡ Corrupt DATA
              </button>
              <button
                className={`btn btn-sm ${pendingFaultData === 'DROP' ? 'btn-danger' : 'btn-outline'}`}
                onClick={() => handleSetDataFault(pendingFaultData === 'DROP' ? null : 'DROP')}
                title="Drop next outgoing DATA frame in channel"
              >
                ❌ Drop DATA
              </button>
              <button
                className={`btn btn-sm ${pendingFaultAck === 'DROP' ? 'btn-danger' : 'btn-outline'}`}
                onClick={() => handleSetAckFault(pendingFaultAck === 'DROP' ? null : 'DROP')}
                title="Drop next reverse ACK frame to test duplicate detection"
              >
                🔁 Drop ACK
              </button>
              {(pendingFaultData || pendingFaultAck) && (
                <button className="btn btn-sm btn-secondary" onClick={handleClearFaults}>
                  🧹 Clear Fault
                </button>
              )}
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
