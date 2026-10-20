/**
 * FlowControlView.jsx
 * 
 * Interactive Visualizer for Data Link Layer Flow Control & ARQ Protocols:
 * - Stop-and-Wait ARQ
 * - Go-Back-N ARQ
 * - Selective Repeat ARQ
 * 
 * Features:
 * - Interactive multi-lane physical medium showing in-flight packets with click-to-corrupt / click-to-drop.
 * - Circular/linear sliding window slots displaying sender window, receiver window, timers, and sequence wraparound.
 * - Live discrete-event simulation engine controls: Play/Pause, Step Tick, Step Event, Send Frame, Send Batch.
 * - Real-time metrics tracking: throughput, measured efficiency, theoretical efficiency, and BDP.
 * - Viva Helper & Theory Panel with formulas, mathematical proofs, and common oral questions.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FlowControlSimulator,
  FlowControlProtocol,
} from '../../core/flow-control/FlowControlSimulator.js';
import { getMaxWindowSize, validateWindowSize, isWithinWindow } from '../../core/flow-control/sequenceMath.js';

export default function FlowControlView() {
  // Protocol Selection
  const [protocol, setProtocol] = useState(FlowControlProtocol.GO_BACK_N);

  // Configuration Parameters
  const [m, setM] = useState(3);
  const [windowSize, setWindowSize] = useState(4);
  const [rxWindowSize, setRxWindowSize] = useState(4);
  const [propagationDelay, setPropagationDelay] = useState(5);
  const [timeoutDuration, setTimeoutDuration] = useState(16);
  const [transmissionDelay, setTransmissionDelay] = useState(1);

  // Payload input
  const [customPayload, setCustomPayload] = useState('Data Msg');

  // Animation & Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeedMs, setPlaySpeedMs] = useState(300); // ms per virtual tick
  const [traceFilter, setTraceFilter] = useState('ALL');

  // Helper to create a simulator instance
  const createSimulator = (proto, bitWidth, win, propDelay, toDuration, txDelay) => {
    const maxWin = getMaxWindowSize(proto, bitWidth);
    const safeWin = proto === FlowControlProtocol.STOP_AND_WAIT ? 1 : Math.min(win, maxWin);
    const safeRxWin = proto === FlowControlProtocol.SELECTIVE_REPEAT ? safeWin : 1;
    return new FlowControlSimulator({
      protocol: proto,
      m: bitWidth,
      windowSize: safeWin,
      rxWindowSize: safeRxWin,
      propagationDelay: propDelay,
      timeoutDuration: toDuration,
      transmissionDelay: txDelay,
    });
  };

  // Simulator instance ref (persists across renders)
  const simulatorRef = useRef(null);
  if (!simulatorRef.current) {
    simulatorRef.current = createSimulator(protocol, m, windowSize, propagationDelay, timeoutDuration, transmissionDelay);
  }

  // Snapshot of simulator state for rendering
  const [snapshot, setSnapshot] = useState(() => simulatorRef.current.getSnapshot());

  // Re-create simulator when fundamental protocol configuration changes
  const initSimulator = (overrides = {}) => {
    const proto = overrides.protocol ?? protocol;
    const bitWidth = proto === FlowControlProtocol.STOP_AND_WAIT ? 1 : (overrides.m ?? m);
    const win = overrides.windowSize ?? windowSize;
    const propDelay = overrides.propagationDelay ?? propagationDelay;
    const toDuration = overrides.timeoutDuration ?? timeoutDuration;
    const txDelay = overrides.transmissionDelay ?? transmissionDelay;

    const sim = createSimulator(proto, bitWidth, win, propDelay, toDuration, txDelay);
    simulatorRef.current = sim;
    setSnapshot(sim.getSnapshot());
  };

  useEffect(() => {
    initSimulator();
    return () => {
      setIsPlaying(false);
    };
  }, [protocol, m]);

  // Sync snapshot
  const updateSnapshot = () => {
    if (simulatorRef.current) {
      setSnapshot(simulatorRef.current.getSnapshot());
    }
  };

  // Playback timer loop
  useEffect(() => {
    let intervalId = null;
    if (isPlaying) {
      intervalId = setInterval(() => {
        if (simulatorRef.current) {
          simulatorRef.current.stepTick();
          updateSnapshot();
        }
      }, playSpeedMs);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPlaying, playSpeedMs]);

  // Handler: Change Protocol
  const handleProtocolChange = (newProto) => {
    setIsPlaying(false);
    setProtocol(newProto);
    if (newProto === FlowControlProtocol.STOP_AND_WAIT) {
      setM(1);
      setWindowSize(1);
      setRxWindowSize(1);
    } else if (newProto === FlowControlProtocol.GO_BACK_N) {
      setM(3);
      setWindowSize(4);
      setRxWindowSize(1);
    } else if (newProto === FlowControlProtocol.SELECTIVE_REPEAT) {
      setM(3);
      setWindowSize(4);
      setRxWindowSize(4);
    }
  };

  // Handler: Change Window Size
  const handleWindowSizeChange = (newSize) => {
    const parsed = parseInt(newSize, 10);
    const maxWin = getMaxWindowSize(protocol, m);
    if (parsed >= 1 && parsed <= maxWin) {
      setWindowSize(parsed);
      setRxWindowSize(parsed);
      if (simulatorRef.current) {
        simulatorRef.current.reset({ windowSize: parsed, rxWindowSize: parsed });
        updateSnapshot();
      }
    }
  };

  // Simulator controls
  const handleStepTick = () => {
    setIsPlaying(false);
    if (simulatorRef.current) {
      simulatorRef.current.stepTick();
      updateSnapshot();
    }
  };

  const handleStepEvent = () => {
    setIsPlaying(false);
    if (simulatorRef.current) {
      simulatorRef.current.stepEvent();
      updateSnapshot();
    }
  };

  const handleSendFrame = () => {
    if (simulatorRef.current) {
      const res = simulatorRef.current.send(customPayload || 'Frame Data');
      updateSnapshot();
    }
  };

  const handleSendBatch = (count = 4) => {
    if (simulatorRef.current) {
      simulatorRef.current.sendBatch(count, 'Batch');
      updateSnapshot();
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    if (simulatorRef.current) {
      simulatorRef.current.reset();
      updateSnapshot();
    }
  };

  // Interactive drop / corrupt
  const handleDropPacket = (eventId) => {
    if (simulatorRef.current) {
      simulatorRef.current.dropInFlight(eventId);
      updateSnapshot();
    }
  };

  const handleCorruptPacket = (eventId) => {
    if (simulatorRef.current) {
      simulatorRef.current.corruptInFlight(eventId);
      updateSnapshot();
    }
  };

  // Presets
  const applyPreset = (presetName) => {
    setIsPlaying(false);
    if (!simulatorRef.current) return;

    if (presetName === 'CLEAN') {
      simulatorRef.current.reset();
      simulatorRef.current.sendBatch(3, 'Clean');
      updateSnapshot();
    } else if (presetName === 'DROP_DATA') {
      simulatorRef.current.reset();
      simulatorRef.current.send('Packet #0 (OK)');
      simulatorRef.current.forwardChannel.addFault({ action: 'DROP' });
      simulatorRef.current.send('Packet #1 (Dropped)');
      simulatorRef.current.send('Packet #2 (Buffered/Discarded)');
      updateSnapshot();
    } else if (presetName === 'DROP_ACK') {
      simulatorRef.current.reset();
      simulatorRef.current.reverseChannel.addFault({ action: 'DROP' });
      simulatorRef.current.send('Packet (Lost ACK)');
      updateSnapshot();
    } else if (presetName === 'CORRUPT') {
      simulatorRef.current.reset();
      simulatorRef.current.forwardChannel.addFault({ action: 'CORRUPT', bitIndex: 1 });
      simulatorRef.current.send('Damaged Packet');
      updateSnapshot();
    }
  };

  if (!snapshot) {
    return <div className="card">Initializing Flow Control Simulator...</div>;
  }

  const { protocolState, inFlightFrames, metrics, virtualTick, eventLogs } = snapshot;
  const seqModulus = 1 << m;

  // Filtered trace logs
  const filteredLogs = eventLogs
    .filter((log) => {
      if (traceFilter === 'ALL') return true;
      if (traceFilter === 'FRAMES') return log.type.includes('FRAME');
      if (traceFilter === 'ACKS') return log.type.includes('ACK');
      if (traceFilter === 'FAULTS') return log.type.includes('CORRUPT') || log.type.includes('DROP') || log.type.includes('TIMEOUT');
      return true;
    })
    .slice(-40)
    .reverse();

  return (
    <div className="flow-control-container">
      {/* Module Title Banner */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="card-title">Flow Control & Sliding Window Visualizer</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
              Deterministic discrete-event modeling of Stop-and-Wait, Go-Back-N, and Selective Repeat ARQ.
            </p>
          </div>
          <span className="badge badge-success">Phase 6 Verified</span>
        </div>

        {/* Protocol Selector Tabs */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className={`btn ${protocol === FlowControlProtocol.STOP_AND_WAIT ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleProtocolChange(FlowControlProtocol.STOP_AND_WAIT)}
          >
            🔄 Stop-and-Wait ARQ
          </button>
          <button
            className={`btn ${protocol === FlowControlProtocol.GO_BACK_N ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleProtocolChange(FlowControlProtocol.GO_BACK_N)}
          >
            ⏩ Go-Back-N ARQ
          </button>
          <button
            className={`btn ${protocol === FlowControlProtocol.SELECTIVE_REPEAT ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleProtocolChange(FlowControlProtocol.SELECTIVE_REPEAT)}
          >
            🎯 Selective Repeat ARQ
          </button>
        </div>
      </div>

      {/* Configuration & Parameter Bar */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ fontSize: '1rem' }}>Protocol Parameters & Presets</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          {protocol !== FlowControlProtocol.STOP_AND_WAIT && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Sequence Bits (m)</label>
              <select
                className="input-textarea"
                style={{ minHeight: 'auto', padding: '0.4rem' }}
                value={m}
                onChange={(e) => setM(parseInt(e.target.value, 10))}
              >
                <option value={2}>m = 2 (M = 4 slots)</option>
                <option value={3}>m = 3 (M = 8 slots)</option>
                <option value={4}>m = 4 (M = 16 slots)</option>
              </select>
            </div>
          )}

          {protocol !== FlowControlProtocol.STOP_AND_WAIT && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                Window Size Ws (Max {getMaxWindowSize(protocol, m)})
              </label>
              <input
                type="number"
                min={1}
                max={getMaxWindowSize(protocol, m)}
                value={windowSize}
                onChange={(e) => handleWindowSizeChange(e.target.value)}
                className="input-textarea"
                style={{ minHeight: 'auto', padding: '0.4rem' }}
              />
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Propagation Delay (tp)</label>
            <input
              type="number"
              min={1}
              max={20}
              value={propagationDelay}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10) || 1;
                setPropagationDelay(val);
                if (simulatorRef.current) {
                  simulatorRef.current.forwardChannel.setPropagationDelay(val);
                  simulatorRef.current.reverseChannel.setPropagationDelay(val);
                  updateSnapshot();
                }
              }}
              className="input-textarea"
              style={{ minHeight: 'auto', padding: '0.4rem' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Timeout Duration (ticks)</label>
            <input
              type="number"
              min={5}
              max={50}
              value={timeoutDuration}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10) || 5;
                setTimeoutDuration(val);
                if (simulatorRef.current) {
                  simulatorRef.current.protocolInstance.timeoutDuration = val;
                  updateSnapshot();
                }
              }}
              className="input-textarea"
              style={{ minHeight: 'auto', padding: '0.4rem' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Playback Speed</label>
            <select
              className="input-textarea"
              style={{ minHeight: 'auto', padding: '0.4rem' }}
              value={playSpeedMs}
              onChange={(e) => setPlaySpeedMs(parseInt(e.target.value, 10))}
            >
              <option value={600}>Slow (600ms/tick)</option>
              <option value={300}>Normal (300ms/tick)</option>
              <option value={100}>Fast (100ms/tick)</option>
              <option value={30}>Ultra (30ms/tick)</option>
            </select>
          </div>
        </div>

        {/* Guided Educational Scenario Presets */}
        <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginRight: '0.5rem' }}>
            Guided Scenarios:
          </span>
          <div className="samples-bar" style={{ display: 'inline-flex' }}>
            <button className="sample-chip" onClick={() => applyPreset('CLEAN')}>
              ✓ Clean Pipeline
            </button>
            <button className="sample-chip" onClick={() => applyPreset('DROP_DATA')}>
              ⚠️ Lost DATA Frame (Timeout & Resend)
            </button>
            <button className="sample-chip" onClick={() => applyPreset('DROP_ACK')}>
              ⚠️ Lost ACK Frame (Duplicate Detection)
            </button>
            <button className="sample-chip" onClick={() => applyPreset('CORRUPT')}>
              💥 Corrupted Frame in Transit
            </button>
          </div>
        </div>
      </div>

      {/* Discrete-Event Engine Controls */}
      <div className="card" style={{ background: 'var(--bg-secondary)' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play Auto'}
            </button>

            <button className="btn btn-secondary" onClick={handleStepTick}>
              ⏭ Step Tick (+1)
            </button>

            <button className="btn btn-secondary" onClick={handleStepEvent}>
              ⚡ Step Event
            </button>

            <button className="btn btn-outline" onClick={handleReset}>
              🔄 Reset T=0
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              value={customPayload}
              onChange={(e) => setCustomPayload(e.target.value)}
              placeholder="Frame payload..."
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-mono)',
              }}
            />
            <button className="btn btn-primary" onClick={handleSendFrame}>
              📤 Send 1 Frame
            </button>
            {protocol !== FlowControlProtocol.STOP_AND_WAIT && (
              <button className="btn btn-secondary" onClick={() => handleSendBatch(4)}>
                📦 Send Batch (4)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Telemetry & Metrics Row */}
      <div className="fc-metrics-row">
        <div className="fc-metric-card">
          <span className="fc-metric-label">Virtual Clock</span>
          <span className="fc-metric-val" style={{ color: 'var(--accent-cyan)' }}>
            T = {virtualTick}
          </span>
          <span className="fc-metric-sub">Discrete ticks</span>
        </div>

        <div className="fc-metric-card">
          <span className="fc-metric-label">Delivered Frames</span>
          <span className="fc-metric-val" style={{ color: 'var(--accent-emerald)' }}>
            {protocolState.stats.framesDelivered}
          </span>
          <span className="fc-metric-sub">In-order at receiver</span>
        </div>

        <div className="fc-metric-card">
          <span className="fc-metric-label">Retransmissions</span>
          <span className="fc-metric-val" style={{ color: protocolState.stats.retransmissions > 0 ? 'var(--accent-amber)' : 'var(--text-primary)' }}>
            {protocolState.stats.retransmissions}
          </span>
          <span className="fc-metric-sub">{protocolState.stats.timeouts} timeouts</span>
        </div>

        <div className="fc-metric-card">
          <span className="fc-metric-label">Channel Utilization (U)</span>
          <span className="fc-metric-val" style={{ color: 'var(--accent-blue)' }}>
            {metrics.channelUtilization}%
          </span>
          <span className="fc-metric-sub">Occupied: {metrics.channelOccupiedTicks}t | Ideal: {metrics.theoreticalEfficiency}%</span>
        </div>

        <div className="fc-metric-card">
          <span className="fc-metric-label">Success Ratio (Stx)</span>
          <span className="fc-metric-val" style={{ color: metrics.transmissionSuccessRatio < 100 ? 'var(--accent-amber)' : 'var(--text-primary)' }}>
            {metrics.transmissionSuccessRatio}%
          </span>
          <span className="fc-metric-sub">{protocolState.stats.framesDelivered} deliv / {protocolState.stats.totalTransmissions} tx</span>
        </div>

        <div className="fc-metric-card">
          <span className="fc-metric-label">Goodput</span>
          <span className="fc-metric-val" style={{ color: 'var(--accent-purple)' }}>
            {metrics.goodputBitsPerTick} <span style={{ fontSize: '0.75rem' }}>bits/t</span>
          </span>
          <span className="fc-metric-sub">{metrics.goodputFramesPerTick} frames/t ({metrics.usefulUtilization}% useful)</span>
        </div>

        <div className="fc-metric-card">
          <span className="fc-metric-label">Bandwidth-Delay (BDP)</span>
          <span className="fc-metric-val">
            {metrics.bandwidthDelayProduct}
          </span>
          <span className="fc-metric-sub">Optimal W: {metrics.optimalWindowSize} frames</span>
        </div>
      </div>

      {/* Multi-Lane Transmission Medium Visualization */}
      <div className="channel-visualizer">
        <div className="channel-nodes-header">
          <div className="node-badge node-badge-sender">
            <div>
              <div className="node-title">📡 SENDER NODE</div>
              <div className="node-subtitle">
                {protocol === FlowControlProtocol.STOP_AND_WAIT
                  ? `Status: ${protocolState.sender.status} | Seq: ${protocolState.sender.seq}`
                  : `Sf (Base): ${protocolState.sender.base} | Sn (Next): ${protocolState.sender.nextSeq} | In-flight: ${protocolState.sender.outstandingCount}`}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Duplex Channel (Delay = {propagationDelay} ticks)
            </span>
          </div>

          <div className="node-badge node-badge-receiver">
            <div style={{ textAlign: 'right' }}>
              <div className="node-title">📥 RECEIVER NODE</div>
              <div className="node-subtitle">
                {protocol === FlowControlProtocol.SELECTIVE_REPEAT
                  ? `Rf (Base): ${protocolState.receiver.rxBase} | Buffered: ${protocolState.receiver.rxBuffer.length}`
                  : `Rn (Expected): ${protocolState.receiver.expectedSeq} | Delivered: ${protocolState.receiver.deliveredCount}`}
              </div>
            </div>
          </div>
        </div>

        {/* Forward Lane (DATA frames: Sender -> Receiver) */}
        <div className="channel-lane">
          <span className="lane-label">Forward Path (DATA Frames ➔)</span>
          {inFlightFrames
            .filter((p) => p.direction === 'FORWARD')
            .map((pkt) => {
              const leftPercent = Math.min(95, Math.max(5, pkt.progress * 100));
              return (
                <div
                  key={pkt.eventId}
                  className={`packet-pill packet-data ${pkt.corrupted ? 'packet-corrupted' : ''}`}
                  style={{ left: `${leftPercent}%` }}
                >
                  <span>📦 DATA #{pkt.frame.seq}</span>
                  {pkt.frame.attempt > 1 && <span style={{ opacity: 0.8 }}>(Att #{pkt.frame.attempt})</span>}
                  <div className="packet-controls">
                    <button
                      className="packet-btn"
                      title="Simulate channel packet drop"
                      onClick={() => handleDropPacket(pkt.eventId)}
                    >
                      ✕ Drop
                    </button>
                    {!pkt.corrupted && (
                      <button
                        className="packet-btn"
                        title="Simulate bit corruption"
                        onClick={() => handleCorruptPacket(pkt.eventId)}
                      >
                        ⚡ Corrupt
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Reverse Lane (ACK frames: Receiver -> Sender) */}
        <div className="channel-lane">
          <span className="lane-label">Reverse Path (ACK Frames ⬅)</span>
          {inFlightFrames
            .filter((p) => p.direction === 'REVERSE')
            .map((pkt) => {
              // ACK moves Right to Left (100% progress means reaching left)
              const leftPercent = Math.min(95, Math.max(5, (1 - pkt.progress) * 100));
              return (
                <div
                  key={pkt.eventId}
                  className={`packet-pill packet-ack ${pkt.corrupted ? 'packet-corrupted' : ''}`}
                  style={{ left: `${leftPercent}%` }}
                >
                  <span>✓ ACK #{pkt.frame.ack}</span>
                  <div className="packet-controls">
                    <button
                      className="packet-btn"
                      title="Simulate lost ACK"
                      onClick={() => handleDropPacket(pkt.eventId)}
                    >
                      ✕ Drop
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Sliding Window State Visualizer (Slots Array) */}
      <div className="grid-2">
        {/* Sender Sliding Window */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title" style={{ fontSize: '1rem' }}>
              Sender Sliding Window [Sf .. Sf + Ws)
            </h3>
            <span className="badge badge-info">
              Window Ws = {snapshot.config.windowSize} / {seqModulus} slots
            </span>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            Slots in green are acknowledged. Slots in amber are transmitted awaiting ACK with active timer.
            Slots in cyan are available for immediate transmission.
          </p>

          <div className="window-strip">
            {Array.from({ length: seqModulus }).map((_, slotIdx) => {
              const base = protocol === FlowControlProtocol.STOP_AND_WAIT
                ? protocolState.sender.seq
                : protocolState.sender.base;
              const nextSeq = protocol === FlowControlProtocol.STOP_AND_WAIT
                ? (protocolState.sender.status === 'IDLE' ? protocolState.sender.seq : (protocolState.sender.seq + 1) % 2)
                : protocolState.sender.nextSeq;

              const inWin = isWithinWindow(slotIdx, base, snapshot.config.windowSize, m);
              const isBase = slotIdx === base;
              const isNext = slotIdx === nextSeq;

              // Check outstanding status
              let isOutstanding = false;
              let isAcked = false;
              if (protocol === FlowControlProtocol.STOP_AND_WAIT) {
                isOutstanding = protocolState.sender.status === 'WAITING_FOR_ACK' && slotIdx === base;
              } else if (protocol === FlowControlProtocol.GO_BACK_N) {
                isOutstanding = protocolState.sender.buffer.some((b) => b.seq === slotIdx);
              } else if (protocol === FlowControlProtocol.SELECTIVE_REPEAT) {
                const b = protocolState.sender.buffer.find((b) => b.seq === slotIdx);
                isOutstanding = b && !b.acked;
                isAcked = b && b.acked;
              }

              let slotClass = 'slot-disabled';
              if (isAcked) {
                slotClass = 'slot-acked';
              } else if (isOutstanding) {
                slotClass = 'slot-outstanding';
              } else if (inWin) {
                slotClass = 'slot-ready';
              }

              return (
                <div
                  key={slotIdx}
                  className={`window-slot-item ${inWin ? 'slot-in-window' : ''} ${slotClass}`}
                >
                  {isBase && <span className="slot-base-marker">Sf</span>}
                  <span className="slot-index">{slotIdx}</span>
                  <span className="slot-subtext">
                    {isAcked ? 'ACK' : isOutstanding ? '⏳' : inWin ? 'Ready' : '-'}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
            <span>🟡 Sf: Oldest Unacked Base</span>
            <span>🔵 Ready: In-window available</span>
            <span>🟢 ACKed: Confirmed</span>
          </div>
        </div>

        {/* Receiver Sliding Window */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title" style={{ fontSize: '1rem' }}>
              Receiver Sliding Window {protocol === FlowControlProtocol.SELECTIVE_REPEAT ? '[Rf .. Rf + Wr)' : '(Wr = 1)'}
            </h3>
            <span className="badge badge-success">
              Wr = {protocol === FlowControlProtocol.SELECTIVE_REPEAT ? snapshot.config.rxWindowSize : 1}
            </span>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            {protocol === FlowControlProtocol.SELECTIVE_REPEAT
              ? 'Selective Repeat buffers out-of-order frames in purple. Base advances upon arrival of Rf.'
              : 'Go-Back-N & Stop-and-Wait strictly require in-order delivery. Out-of-order frames are discarded.'}
          </p>

          <div className="window-strip">
            {Array.from({ length: seqModulus }).map((_, slotIdx) => {
              const rxBase = protocol === FlowControlProtocol.SELECTIVE_REPEAT
                ? protocolState.receiver.rxBase
                : protocolState.receiver.expectedSeq;
              const rxWinSize = protocol === FlowControlProtocol.SELECTIVE_REPEAT
                ? snapshot.config.rxWindowSize
                : 1;

              const inWin = isWithinWindow(slotIdx, rxBase, rxWinSize, m);
              const isBase = slotIdx === rxBase;

              const isBuffered = protocol === FlowControlProtocol.SELECTIVE_REPEAT &&
                protocolState.receiver.rxBuffer.some((b) => b.seq === slotIdx);

              let slotClass = 'slot-disabled';
              if (isBuffered) {
                slotClass = 'slot-buffered';
              } else if (isBase) {
                slotClass = 'slot-ready';
              } else if (inWin) {
                slotClass = 'slot-ready';
              }

              return (
                <div
                  key={slotIdx}
                  className={`window-slot-item ${inWin ? 'slot-in-window' : ''} ${slotClass}`}
                >
                  {isBase && <span className="slot-base-marker" style={{ background: 'var(--accent-emerald)', color: '#fff' }}>Rf</span>}
                  <span className="slot-index">{slotIdx}</span>
                  <span className="slot-subtext">
                    {isBuffered ? 'Buffer' : isBase ? 'Expect' : inWin ? 'Accept' : '-'}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
            <span>🟢 Rf: Next In-Order Expected</span>
            {protocol === FlowControlProtocol.SELECTIVE_REPEAT && <span>🟣 Buffered: Out-of-order received</span>}
          </div>
        </div>
      </div>

      {/* Packet Trace & Event Log */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title" style={{ fontSize: '1rem' }}>Live Discrete-Event Packet Trace</h3>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {['ALL', 'FRAMES', 'ACKS', 'FAULTS'].map((f) => (
              <button
                key={f}
                className={`btn btn-sm ${traceFilter === f ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setTraceFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="trace-log-container">
          {filteredLogs.length === 0 ? (
            <div style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              No events logged yet. Send a frame to start the transmission trace.
            </div>
          ) : (
            filteredLogs.map((log) => {
              let badgeColor = 'var(--accent-blue)';
              let bg = 'rgba(59, 130, 246, 0.15)';
              if (log.type.includes('DELIVER') || log.type.includes('ACK_RECEIVED')) {
                badgeColor = 'var(--accent-emerald)';
                bg = 'rgba(16, 185, 129, 0.15)';
              } else if (log.type.includes('TIMEOUT') || log.type.includes('CORRUPT')) {
                badgeColor = 'var(--accent-rose)';
                bg = 'rgba(244, 63, 94, 0.15)';
              } else if (log.type.includes('BUFFER') || log.type.includes('DISCARD')) {
                badgeColor = 'var(--accent-amber)';
                bg = 'rgba(245, 158, 11, 0.15)';
              }

              return (
                <div key={log.id} className="trace-row">
                  <span className="trace-tick">T={log.tick}</span>
                  <span
                    className="trace-badge"
                    style={{ color: badgeColor, background: bg, border: `1px solid ${badgeColor}` }}
                  >
                    {log.type}
                  </span>
                  <span style={{ color: 'var(--text-primary)', flex: 1 }}>
                    {log.type === 'FRAME_SENT' && `Transmitted DATA #${log.data.frame.seq} (Attempt ${log.data.attempt})`}
                    {log.type === 'FRAME_DELIVERED' && `Receiver accepted in-order DATA #${log.data.frame.seq}`}
                    {log.type === 'ACK_SENT' && `Receiver sent ACK #${log.data.ackFrame.ack}`}
                    {log.type === 'ACK_RECEIVED' && `Sender confirmed ACK #${log.data.ackFrame.ack}; sliding window`}
                    {log.type === 'TIMEOUT' && `Retransmission timer expired (seq: ${log.data.seq ?? log.data.base})`}
                    {log.type === 'FRAME_CORRUPTED' && `Corrupted frame rejected at receiver`}
                    {log.type === 'FRAME_BUFFERED' && `Out-of-order frame #${log.data.seq} buffered in receiver window`}
                    {log.type === 'OUT_OF_ORDER_DISCARDED' && `Out-of-order frame #${log.data.seq} discarded by GBN receiver`}
                    {log.type === 'DUPLICATE_DISCARDED' && `Duplicate frame #${log.data.seq} suppressed`}
                    {log.type === 'WINDOW_SLID' && `Sender base advanced to ${log.data.newBase ?? log.data.senderSeq}`}
                    {log.type === 'FRAME_DROPPED_INTERACTIVE' && `User interactively dropped packet in channel`}
                    {log.type === 'FRAME_CORRUPTED_INTERACTIVE' && `User interactively corrupted packet in flight`}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Viva Helper & Theory Panel */}
      <div className="viva-box">
        <div className="viva-box-header">
          <div className="viva-title">
            <span>🎓</span>
            <span>Viva Helper & Technical Theory — Flow Control & ARQ</span>
          </div>
          <span className="badge badge-info">CS Computer Networks Oral Exam Preparation</span>
        </div>

        {/* Theoretical Derivations & Mathematical Proofs */}
        <div style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.7' }}>
          <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '0.4rem', fontSize: '0.95rem' }}>
            Mathematical Proof of Window Size Limits
          </h4>
          <p style={{ marginBottom: '0.5rem' }}>
            Given an <em>m</em>-bit sequence number space, the available sequence identifiers are{' '}
            <code style={{ color: 'var(--accent-amber)' }}>M = 2^m</code> (ranging from 0 to 2^m - 1).
          </p>
          <ul style={{ listStylePosition: 'inside', marginBottom: '1rem' }}>
            <li>
              <strong>Stop-and-Wait ARQ:</strong> <code style={{ color: 'var(--accent-cyan)' }}>Ws = 1, Wr = 1, m = 1</code>.
              Alternating 1-bit sequence space (0 and 1) is sufficient to detect duplicate frames caused by delayed or lost ACKs.
            </li>
            <li>
              <strong>Go-Back-N ARQ:</strong> <code style={{ color: 'var(--accent-cyan)' }}>Ws ≤ 2^m - 1, Wr = 1</code>.
              If window size were <code style={{ color: 'var(--accent-rose)' }}>Ws = 2^m</code>, and all ACKs for a full window were lost,
              the sender would retransmit frame 0. The receiver, having wrapped around to 0, would mistakenly accept the retransmission as
              a completely new frame! Setting <code style={{ color: 'var(--accent-emerald)' }}>Ws ≤ 2^m - 1</code> ensures the receiver's expected
              sequence number can never overlap with the sender's unacknowledged base.
            </li>
            <li>
              <strong>Selective Repeat ARQ:</strong> <code style={{ color: 'var(--accent-cyan)' }}>Ws ≤ 2^(m - 1) and Wr ≤ 2^(m - 1)</code>.
              Because the receiver buffers out-of-order packets, the sum of sender and receiver window sizes must satisfy{' '}
              <code style={{ color: 'var(--accent-emerald)' }}>Ws + Wr ≤ 2^m</code>. For symmetric windows,{' '}
              <code style={{ color: 'var(--accent-emerald)' }}>W ≤ 2^(m - 1)</code>. If <code style={{ color: 'var(--accent-rose)' }}>W &gt; 2^(m - 1)</code>,
              the receiver's current window and its previous window would overlap modulo 2^m, creating ambiguity as to whether an incoming
              frame is a retransmission of old data or a new frame.
            </li>
          </ul>

          <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '0.4rem', fontSize: '0.95rem' }}>
            Protocol Efficiency & The Parameter 'a'
          </h4>
          <p style={{ marginBottom: '0.5rem' }}>
            Let <code style={{ color: 'var(--accent-amber)' }}>tp</code> be one-way propagation delay, and{' '}
            <code style={{ color: 'var(--accent-amber)' }}>ttx</code> be frame transmission time on the wire.
            The dimensionless parameter is <code style={{ color: 'var(--accent-emerald)' }}>a = tp / ttx</code>.
          </p>
          <ul style={{ listStylePosition: 'inside' }}>
            <li>
              <strong>Stop-and-Wait Efficiency:</strong>{' '}
              <code style={{ color: 'var(--accent-cyan)' }}>η = 1 / (1 + 2a)</code>.
              For high-latency links (e.g. satellite where <code style={{ color: 'var(--accent-amber)' }}>a &gt;&gt; 1</code>),
              efficiency drops toward 0% because the sender sits idle waiting for the round-trip propagation time.
            </li>
            <li>
              <strong>Pipelined (GBN & SR) Efficiency:</strong>{' '}
              <code style={{ color: 'var(--accent-cyan)' }}>η = min(1, W / (1 + 2a))</code>.
              To achieve 100% link utilization without transmission errors, the window size must fill the pipe:{' '}
              <code style={{ color: 'var(--accent-emerald)' }}>W ≥ 1 + 2a</code> (the Bandwidth-Delay Product plus transmission time).
            </li>
          </ul>
        </div>

        {/* High-Yield Oral Exam Questions & Answers */}
        <div className="viva-q">Q1: Why does Go-Back-N require Ws ≤ 2^m - 1 instead of 2^m?</div>
        <div className="viva-a">
          Consider m = 2 (modulus M = 4, sequence numbers 0, 1, 2, 3). Suppose Ws = 4. The sender transmits frames 0, 1, 2, 3.
          The receiver receives all four frames, delivers them to the upper layer, and expects frame 0 next.
          However, all four ACKs are lost in the reverse channel. The sender's timer expires and it retransmits frame 0.
          When frame 0 arrives at the receiver, the receiver is expecting frame 0 from the NEXT window!
          The receiver cannot distinguish whether this frame 0 is a duplicate of the old frame or the brand-new frame 0.
          Restricting Ws to 2^m - 1 (Ws = 3) prevents this sequence overlap.
        </div>

        <div className="viva-q">Q2: In Selective Repeat, why must the receiver re-acknowledge frames that fall into the previous window [Rf - Wr, Rf)?</div>
        <div className="viva-a">
          If the receiver successfully received a frame and advanced its window, but the corresponding ACK was lost in transit,
          the sender will eventually time out and retransmit that frame. The retransmitted frame will arrive at the receiver
          with a sequence number in the PREVIOUS window. If the receiver simply ignores this frame because it was already delivered,
          the sender will never receive an ACK, will keep timing out indefinitely, and the entire connection will deadlock.
          Therefore, the receiver MUST send an ACK for any correctly received frame in [Rf - Wr, Rf) without delivering it again.
        </div>

        <div className="viva-q">Q3: How does timer management differ between Go-Back-N and Selective Repeat?</div>
        <div className="viva-a">
          In Go-Back-N, the sender maintains only a SINGLE timer for the oldest unacknowledged frame (Sf / base).
          When an ACK arrives that advances the base, if there are still outstanding unacknowledged frames, the single timer is restarted.
          If timeout occurs, ALL outstanding frames in the window are retransmitted.
          In Selective Repeat, the sender maintains INDEPENDENT timers for each unacknowledged frame in the window.
          On timeout, ONLY the specific frame that timed out is retransmitted, significantly saving bandwidth on noisy channels.
        </div>

        <div className="viva-q">Q4: What is the Bandwidth-Delay Product (BDP) and why is it critical for protocol design?</div>
        <div className="viva-a">
          BDP = Bandwidth (bits/sec) × Round-Trip Time (sec). It represents the maximum volume of unacknowledged data that can be
          'in flight' inside the transmission medium at any instant. If the sender's window size W is smaller than 1 + 2a,
          the sender will exhaust its window and be forced to idle while the pipe is empty, wasting channel capacity.
          Selecting W ≥ 1 + 2a keeps the transmission pipe continuously full.
        </div>

        <div className="viva-q">Q5: What is the distinction between Channel Utilization, Transmission Success Ratio, and Goodput?</div>
        <div className="viva-a">
          These three metrics measure fundamentally different aspects of protocol performance:
          <br /><br />
          1. <strong>Channel Utilization (U):</strong> Measures physical medium temporal occupancy — the fraction of elapsed virtual time during which the forward channel was actively occupied serializing DATA frames (including both original attempts and retransmissions):
          <br />
          <code style={{ color: 'var(--accent-cyan)' }}>U = (Total Channel Busy Ticks) / Elapsed Virtual Ticks = (N_transmissions × Tt) / Telapsed</code>.
          In a noiseless Stop-and-Wait link with Tt = 1 and Tp = 5, one frame transaction occupies 1 tick out of an 11-tick RTT cycle, yielding U = 1 / 11 ≈ 9.1% (matching the theoretical bound 1 / (1 + 2a)). Retransmissions increase physical channel occupancy.
          <br /><br />
          2. <strong>Transmission Success Ratio (Stx, Packet Efficiency):</strong> Measures frame conservation and loss overhead — the ratio of successfully delivered unique frames to total on-wire transmission attempts:
          <br />
          <code style={{ color: 'var(--accent-emerald)' }}>Stx = (FramesDelivered / TotalTransmissions) × 100%</code>.
          On a noiseless link, Stx is 100% even if channel utilization is low. If 1 frame is dropped and retransmitted once successfully, Stx = 1 / 2 = 50%.
          <br /><br />
          3. <strong>Goodput (G):</strong> Measures effective application-layer delivery rate per unit time, excluding protocol headers, dropped packets, and duplicate retransmissions:
          <br />
          <code style={{ color: 'var(--accent-purple)' }}>G_frames = FramesDelivered / Telapsed (frames/tick)</code> and <code style={{ color: 'var(--accent-purple)' }}>G_bits = DeliveredBits / Telapsed (bits/tick)</code>.
          Useful channel utilization is related by: <code style={{ color: 'var(--accent-amber)' }}>U_useful = (FramesDelivered × Tt) / Telapsed = U × (Stx / 100)</code>.
        </div>
      </div>
    </div>
  );
}
