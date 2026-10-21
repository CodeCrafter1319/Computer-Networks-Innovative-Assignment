/**
 * MacView.jsx
 * 
 * Interactive CSMA/CD Shared Bus Protocol Visualizer & Educational Sandbox.
 * 
 * Highlights:
 * 1. Physical Broadcast Bus with Spatial Wavefront Propagation.
 * 2. 4 Configurable Stations (A, B, C, D) with Carrier Sensing.
 * 3. Realistic Collision Detection during Vulnerability Window (tau).
 * 4. 32-bit Jam Signal Emission & Bus Disruption.
 * 5. Truncated Binary Exponential Backoff (BEB) Slot Countdown.
 * 6. Contention Presets & Classical Ethernet Bus Visualization.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CsmaCdSimulator, MacPreset } from '../../core/mac/CsmaCdSimulator.js';
import { StationState, PersistenceMode } from '../../core/mac/csmaCd.js';
import { SignalType } from '../../core/mac/SharedBus.js';

export default function MacView() {
  // Simulator Instance
  const simulator = useMemo(() => new CsmaCdSimulator({
    busLength: 100,
    maxPropagationDelay: 10,
    frameTransmissionDuration: 30,
    jamDuration: 4,
    persistenceMode: PersistenceMode.ONE_PERSISTENT,
    maxRetries: 16,
  }), []);

  // UI Reactive Snapshot
  const [telemetry, setTelemetry] = useState(() => simulator.getTelemetry());
  const [eventLogs, setEventLogs] = useState(() => [...simulator.eventLogs]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(150); // ms per virtual tick
  const [activePreset, setActivePreset] = useState(MacPreset.CLEAN_TRANSMISSION);

  // Custom Frame Injector State
  const [injectSource, setInjectSource] = useState('A');
  const [injectDest, setInjectDest] = useState('D');
  const [injectPayload, setInjectPayload] = useState('Manual Frame Payload');

  // Animation interval ref
  const playTimerRef = useRef(null);

  // Sync state from simulator
  const syncState = () => {
    setTelemetry(simulator.getTelemetry());
    setEventLogs([...simulator.eventLogs]);
  };

  // Playback timer loop
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        simulator.stepTick();
        syncState();
      }, playbackSpeed);
    } else {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, playbackSpeed, simulator]);

  // Load default preset on initial mount
  useEffect(() => {
    simulator.loadPreset(MacPreset.CLEAN_TRANSMISSION);
    syncState();
  }, [simulator]);

  // Handle Preset Selection
  const handleSelectPreset = (presetKey) => {
    setIsPlaying(false);
    setActivePreset(presetKey);
    simulator.loadPreset(presetKey);
    syncState();
  };

  // Step 1 Tick
  const handleStepTick = () => {
    setIsPlaying(false);
    simulator.stepTick();
    syncState();
  };

  // Step 5 Ticks
  const handleStep5Ticks = () => {
    setIsPlaying(false);
    simulator.stepTicks(5);
    syncState();
  };

  // Reset
  const handleReset = () => {
    setIsPlaying(false);
    simulator.reset();
    syncState();
  };

  // Manual Frame Send
  const handleManualSend = (e) => {
    e.preventDefault();
    if (!injectPayload.trim()) return;
    simulator.send(injectSource, injectPayload, injectDest);
    syncState();
  };

  // Helper color for station states
  const getStationStateColor = (state) => {
    switch (state) {
      case StationState.TRANSMITTING:
        return 'var(--accent-blue)';
      case StationState.TRANSMITTING_JAM:
        return 'var(--accent-rose)';
      case StationState.SENSING:
        return 'var(--accent-amber)';
      case StationState.BACKING_OFF:
        return 'var(--accent-purple)';
      case StationState.ABORTED_EXCESSIVE_COLLISIONS:
        return 'var(--accent-rose)';
      default:
        return 'var(--text-muted)';
    }
  };

  return (
    <div className="mac-container" style={{ padding: '1rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Module Title Header */}
      <div className="module-header" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>📡</span>
              <span>Medium Access Control — CSMA/CD Bus Contention Visualizer</span>
              <span className="badge badge-info">Phase 7</span>
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.3rem' }}>
              Classical IEEE 802.3 Half-Duplex Ethernet Bus Model: Spatial Wavefront Propagation, Carrier Sensing Deferral, Collision Detection (2τ), 32-bit Jamming, and Truncated BEB.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="badge badge-success">Discrete-Event Engine</span>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Slot Time: {telemetry.slotTime} ticks (2τ = 2 × {telemetry.tauMax})
            </div>
          </div>
        </div>
      </div>

      {/* Preset Scenarios Carousel / Button Bar */}
      <div className="fc-control-card" style={{ marginBottom: '1.5rem', background: 'var(--bg-card)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            🎓 Educational Contention Presets
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            1-Click Reproducible Contention Scenarios
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
          <button
            className={`preset-btn ${activePreset === MacPreset.CLEAN_TRANSMISSION ? 'active' : ''}`}
            onClick={() => handleSelectPreset(MacPreset.CLEAN_TRANSMISSION)}
            style={{
              padding: '0.6rem 0.8rem',
              borderRadius: 'var(--radius-sm)',
              border: activePreset === MacPreset.CLEAN_TRANSMISSION ? '1px solid var(--accent-emerald)' : '1px solid var(--border-subtle)',
              background: activePreset === MacPreset.CLEAN_TRANSMISSION ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              textAlign: 'left',
            }}
          >
            <div>1. Clean Single Tx</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>Station A sends to D (0 contention)</div>
          </button>

          <button
            className={`preset-btn ${activePreset === MacPreset.NEAR_SIMULTANEOUS_COLLISION ? 'active' : ''}`}
            onClick={() => handleSelectPreset(MacPreset.NEAR_SIMULTANEOUS_COLLISION)}
            style={{
              padding: '0.6rem 0.8rem',
              borderRadius: 'var(--radius-sm)',
              border: activePreset === MacPreset.NEAR_SIMULTANEOUS_COLLISION ? '1px solid var(--accent-rose)' : '1px solid var(--border-subtle)',
              background: activePreset === MacPreset.NEAR_SIMULTANEOUS_COLLISION ? 'rgba(244, 63, 94, 0.15)' : 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              textAlign: 'left',
            }}
          >
            <div>2. Near-Simultaneous Collision</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>A & D transmit within τ; collide & jam</div>
          </button>

          <button
            className={`preset-btn ${activePreset === MacPreset.CARRIER_SENSE_DEFERRAL ? 'active' : ''}`}
            onClick={() => handleSelectPreset(MacPreset.CARRIER_SENSE_DEFERRAL)}
            style={{
              padding: '0.6rem 0.8rem',
              borderRadius: 'var(--radius-sm)',
              border: activePreset === MacPreset.CARRIER_SENSE_DEFERRAL ? '1px solid var(--accent-amber)' : '1px solid var(--border-subtle)',
              background: activePreset === MacPreset.CARRIER_SENSE_DEFERRAL ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              textAlign: 'left',
            }}
          >
            <div>3. Carrier Sense Deferral</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>B senses A's busy signal; defers until idle</div>
          </button>

          <button
            className={`preset-btn ${activePreset === MacPreset.MULTI_STATION_CONTENTION ? 'active' : ''}`}
            onClick={() => handleSelectPreset(MacPreset.MULTI_STATION_CONTENTION)}
            style={{
              padding: '0.6rem 0.8rem',
              borderRadius: 'var(--radius-sm)',
              border: activePreset === MacPreset.MULTI_STATION_CONTENTION ? '1px solid var(--accent-purple)' : '1px solid var(--border-subtle)',
              background: activePreset === MacPreset.MULTI_STATION_CONTENTION ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              textAlign: 'left',
            }}
          >
            <div>4. 1-Persistent Multi-Contention</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>B & C both queue during A; collide at release</div>
          </button>

          <button
            className={`preset-btn ${activePreset === MacPreset.BACKOFF_RESOLUTION ? 'active' : ''}`}
            onClick={() => handleSelectPreset(MacPreset.BACKOFF_RESOLUTION)}
            style={{
              padding: '0.6rem 0.8rem',
              borderRadius: 'var(--radius-sm)',
              border: activePreset === MacPreset.BACKOFF_RESOLUTION ? '1px solid var(--accent-blue)' : '1px solid var(--border-subtle)',
              background: activePreset === MacPreset.BACKOFF_RESOLUTION ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              textAlign: 'left',
            }}
          >
            <div>5. BEB Contention Resolution</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>A & D collide; slots (0 vs 1) resolve contention</div>
          </button>

          <button
            className={`preset-btn ${activePreset === MacPreset.EXCESSIVE_COLLISIONS ? 'active' : ''}`}
            onClick={() => handleSelectPreset(MacPreset.EXCESSIVE_COLLISIONS)}
            style={{
              padding: '0.6rem 0.8rem',
              borderRadius: 'var(--radius-sm)',
              border: activePreset === MacPreset.EXCESSIVE_COLLISIONS ? '1px solid var(--accent-rose)' : '1px solid var(--border-subtle)',
              background: activePreset === MacPreset.EXCESSIVE_COLLISIONS ? 'rgba(244, 63, 94, 0.15)' : 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              textAlign: 'left',
            }}
          >
            <div>6. Excessive Collisions Abort</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>Retries reach max limit; frame discarded</div>
          </button>
        </div>
      </div>

      {/* Telemetry Metric Cards */}
      <div className="fc-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div className="fc-metric-card" style={{ background: 'var(--bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <span className="fc-metric-label" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Simulation Clock</span>
          <span className="fc-metric-val" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
            t = {telemetry.currentTick} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ticks</span>
          </span>
          <span className="fc-metric-sub" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Slot Time 2τ: {telemetry.slotTime}t</span>
        </div>

        <div className="fc-metric-card" style={{ background: 'var(--bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <span className="fc-metric-label" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Channel Status</span>
          <span className="fc-metric-val" style={{ fontSize: '1.25rem', fontWeight: 700, color: telemetry.mediumBusyTicks > 0 && telemetry.wavefronts.length > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
            {telemetry.wavefronts.length > 0 ? 'BUSY' : 'IDLE'}
          </span>
          <span className="fc-metric-sub" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            {telemetry.wavefronts.length} signal(s) active
          </span>
        </div>

        <div className="fc-metric-card" style={{ background: 'var(--bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <span className="fc-metric-label" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Attempts / Delivered</span>
          <span className="fc-metric-val" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {telemetry.totalAttempts} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/</span> {telemetry.totalDelivered}
          </span>
          <span className="fc-metric-sub" style={{ fontSize: '0.7rem', color: telemetry.successRatio < 100 ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
            Success Ratio: {telemetry.successRatio}%
          </span>
        </div>

        <div className="fc-metric-card" style={{ background: 'var(--bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <span className="fc-metric-label" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Collisions / Jam Signals</span>
          <span className="fc-metric-val" style={{ fontSize: '1.25rem', fontWeight: 700, color: telemetry.totalCollisions > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
            {telemetry.totalCollisions} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/</span> {telemetry.totalJamSignals}
          </span>
          <span className="fc-metric-sub" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            {telemetry.totalAborted} frames aborted
          </span>
        </div>

        <div className="fc-metric-card" style={{ background: 'var(--bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <span className="fc-metric-label" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Medium Utilization</span>
          <span className="fc-metric-val" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
            {telemetry.busUtilization}%
          </span>
          <span className="fc-metric-sub" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            {telemetry.mediumBusyTicks}t occupied
          </span>
        </div>

        <div className="fc-metric-card" style={{ background: 'var(--bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <span className="fc-metric-label" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Goodput</span>
          <span className="fc-metric-val" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-purple)' }}>
            {telemetry.goodputFramesPerTick} <span style={{ fontSize: '0.75rem' }}>f/t</span>
          </span>
          <span className="fc-metric-sub" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            Backoff: {telemetry.totalBackoffTicks}t waited
          </span>
        </div>
      </div>

      {/* Main Interactive Bus Visualization Section */}
      <div className="shared-bus-panel" style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '1.5rem', border: '1px solid var(--border-subtle)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Physical Shared Bus Canvas (Length L = 100, End-to-End Delay τ = {telemetry.tauMax} ticks)
            </span>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Wave speed v = 10 distance units / tick | Collision detection window 2τ = {telemetry.slotTime} ticks
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'var(--accent-blue)', borderRadius: '2px' }}></span>
              DATA Signal
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'var(--accent-rose)', borderRadius: '2px' }}></span>
              32-bit JAM Signal / Collision
            </div>
          </div>
        </div>

        {/* Station Nodes Positioned Relative to Bus Coordinates */}
        <div className="bus-stations-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
          {telemetry.stations.map((st) => (
            <div
              key={st.id}
              className="station-node-card"
              style={{
                background: 'var(--bg-secondary)',
                border: `1px solid ${getStationStateColor(st.state)}`,
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  🖥️ {st.name}
                </span>
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '0.15rem 0.4rem',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    background: `${getStationStateColor(st.state)}22`,
                    color: getStationStateColor(st.state),
                    border: `1px solid ${getStationStateColor(st.state)}`,
                  }}
                >
                  {st.state}
                </span>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem' }}>
                <div>Pos: <strong style={{ color: 'var(--accent-cyan)' }}>x = {st.position}</strong></div>
                <div>Sense: <strong style={{ color: st.carrierSensed ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>{st.carrierSensed ? 'BUSY' : 'IDLE'}</strong></div>
                <div>Collisions: <strong style={{ color: st.collisionCount > 0 ? 'var(--accent-rose)' : 'var(--text-muted)' }}>{st.collisionCount}</strong></div>
                <div>Delivered: <strong style={{ color: 'var(--accent-emerald)' }}>{st.stats.framesDelivered}</strong></div>
              </div>

              {st.lastBackoff && st.state === StationState.BACKING_OFF && (
                <div style={{ marginTop: '0.4rem', padding: '0.3rem 0.5rem', background: 'rgba(139, 92, 246, 0.15)', borderRadius: '2px', fontSize: '0.7rem', color: 'var(--accent-purple)' }}>
                  ⏱️ BEB: k={st.lastBackoff.k}, slot={st.lastBackoff.slotChosen}, wait={st.lastBackoff.waitTicks}t
                </div>
              )}

              {/* Station Tap Line Downward to the Coaxial Rail */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '-1rem',
                  left: '50%',
                  width: '2px',
                  height: '1rem',
                  background: getStationStateColor(st.state),
                  transform: 'translateX(-50%)',
                }}
              />
            </div>
          ))}
        </div>

        {/* Physical Bus Rail Container */}
        <div
          className="bus-rail-track"
          style={{
            position: 'relative',
            height: '60px',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '2px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            margin: '1.5rem 0 1rem 0',
            overflow: 'hidden',
          }}
        >
          {/* Terminator markers at left (x = 0) and right (x = 100) */}
          <div style={{ position: 'absolute', left: '0', top: '0', bottom: '0', width: '8px', background: 'var(--text-muted)', opacity: 0.5 }} title="50-ohm Coaxial Terminator" />
          <div style={{ position: 'absolute', right: '0', top: '0', bottom: '0', width: '8px', background: 'var(--text-muted)', opacity: 0.5 }} title="50-ohm Coaxial Terminator" />

          {/* Station tap indicators along the rail */}
          {telemetry.stations.map((st) => (
            <div
              key={`tap-${st.id}`}
              style={{
                position: 'absolute',
                left: `${st.position}%`,
                top: '0',
                bottom: '0',
                width: '3px',
                background: getStationStateColor(st.state),
                opacity: 0.8,
                zIndex: 2,
              }}
              title={`Tap for ${st.name} at x=${st.position}`}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '4px',
                  left: '5px',
                  fontSize: '0.65rem',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {st.id}
              </div>
            </div>
          ))}

          {/* Active Propagating Signal Wavefronts */}
          {telemetry.wavefronts.map((wf) => {
            const isJam = wf.type === SignalType.JAM || wf.collided;
            const waveColor = isJam ? 'rgba(244, 63, 94, 0.7)' : 'rgba(59, 130, 246, 0.7)';
            const borderCol = isJam ? 'var(--accent-rose)' : 'var(--accent-blue)';

            // Left segment: from wf.leftSegment[0] to wf.leftSegment[1]
            const leftWidth = Math.max(0, wf.leftSegment[1] - wf.leftSegment[0]);
            // Right segment: from wf.rightSegment[0] to wf.rightSegment[1]
            const rightWidth = Math.max(0, wf.rightSegment[1] - wf.rightSegment[0]);

            return (
              <React.Fragment key={`wf-${wf.signalId}`}>
                {/* Left Propagating Wave */}
                {leftWidth > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${wf.leftSegment[0]}%`,
                      width: `${leftWidth}%`,
                      top: '12px',
                      height: '36px',
                      background: waveColor,
                      borderLeft: `2px solid ${borderCol}`,
                      borderRight: `1px dashed ${borderCol}`,
                      zIndex: 3,
                      transition: 'all 0.1s linear',
                    }}
                    title={`${wf.type} wave from ${wf.stationName} (Left)`}
                  />
                )}
                {/* Right Propagating Wave */}
                {rightWidth > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${wf.rightSegment[0]}%`,
                      width: `${rightWidth}%`,
                      top: '12px',
                      height: '36px',
                      background: waveColor,
                      borderRight: `2px solid ${borderCol}`,
                      borderLeft: `1px dashed ${borderCol}`,
                      zIndex: 3,
                      transition: 'all 0.1s linear',
                    }}
                    title={`${wf.type} wave from ${wf.stationName} (Right)`}
                  />
                )}
              </React.Fragment>
            );
          })}

          {/* Recorded Active Collision Markers */}
          {telemetry.collisions.slice(-3).map((coll, idx) => (
            <div
              key={`coll-${coll.tick}-${idx}`}
              style={{
                position: 'absolute',
                left: `${coll.position}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'var(--accent-rose)',
                color: '#fff',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.2rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                boxShadow: '0 0 12px var(--accent-rose)',
                zIndex: 5,
                animation: 'pulse 1s infinite',
              }}
            >
              💥 COLLISION @ t={coll.tick}
            </div>
          ))}
        </div>

        {/* Spatial Axis Markers */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <span>0 (Terminator A)</span>
          <span>x = 25 (Station B)</span>
          <span>x = 50 (Midpoint)</span>
          <span>x = 75 (Station C)</span>
          <span>100 (Terminator D)</span>
        </div>
      </div>

      {/* Simulation Controls & Manual Frame Injection Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Playback & Stepping Controls */}
        <div style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '0.75rem' }}>
            🎮 Simulation Clock & Stepping Engine
          </span>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                padding: '0.5rem 1.2rem',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: isPlaying ? 'var(--accent-rose)' : 'var(--accent-emerald)',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play Auto'}
            </button>

            <button
              onClick={handleStepTick}
              style={{
                padding: '0.5rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Step 1 Tick (→)
            </button>

            <button
              onClick={handleStep5Ticks}
              style={{
                padding: '0.5rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Step 5 Ticks (⇉)
            </button>

            <button
              onClick={handleReset}
              style={{
                padding: '0.5rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--accent-rose)',
                background: 'transparent',
                color: 'var(--accent-rose)',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Reset Simulation
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Speed:</span>
            <input
              type="range"
              min="50"
              max="500"
              step="50"
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent-blue)' }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', minWidth: '60px' }}>
              {playbackSpeed} ms/t
            </span>
          </div>
        </div>

        {/* Custom Station Frame Injector */}
        <div style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '0.75rem' }}>
            📤 Inject Transmission Request
          </span>

          <form onSubmit={handleManualSend} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                Transmitting Station
              </label>
              <select
                value={injectSource}
                onChange={(e) => setInjectSource(e.target.value)}
                style={{ width: '100%', padding: '0.4rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              >
                <option value="A">Station A (x = 0)</option>
                <option value="B">Station B (x = 25)</option>
                <option value="C">Station C (x = 75)</option>
                <option value="D">Station D (x = 100)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                Destination Station
              </label>
              <select
                value={injectDest}
                onChange={(e) => setInjectDest(e.target.value)}
                style={{ width: '100%', padding: '0.4rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              >
                <option value="BROADCAST">Broadcast (All)</option>
                <option value="A">Station A</option>
                <option value="B">Station B</option>
                <option value="C">Station C</option>
                <option value="D">Station D</option>
              </select>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                Payload Text
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={injectPayload}
                  onChange={(e) => setInjectPayload(e.target.value)}
                  style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  placeholder="Enter frame message..."
                />
                <button
                  type="submit"
                  style={{
                    padding: '0.4rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: 'var(--accent-blue)',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Real-Time Event Log Terminal */}
      <div className="fc-log-card" style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            📜 Real-Time MAC Protocol Event Log
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Latest {eventLogs.length} events
          </span>
        </div>

        <div style={{ maxHeight: '180px', overflowY: 'auto', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', padding: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
          {eventLogs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.5rem' }}>
              No simulation events logged yet. Select a preset or step the simulation clock.
            </div>
          ) : (
            eventLogs.map((log) => (
              <div key={log.id} style={{ padding: '0.2rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--accent-cyan)', marginRight: '0.5rem' }}>[t={log.tick}]</span>
                <span style={{ fontWeight: 600, marginRight: '0.5rem', color: log.type.includes('COLLISION') ? 'var(--accent-rose)' : log.type.includes('SUCCESS') ? 'var(--accent-emerald)' : 'var(--accent-blue)' }}>
                  {log.type}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {log.type === 'TRANSMISSION_STARTED' && `Station ${log.data.stationId} began transmitting DATA (duration: ${log.data.duration}t, attempt: ${log.data.attempt})`}
                  {log.type === 'CARRIER_BUSY_DEFERRING' && `Station ${log.data.stationId} sensed medium BUSY; deferring (1-persistent)`}
                  {log.type === 'COLLISION_DETECTED' && `Station ${log.data.stationId} DETECTED COLLISION with ${log.data.foreignStationId}! (Attempt #${log.data.collisionCount})`}
                  {log.type === 'JAM_STARTED' && `Station ${log.data.stationId} emitting 32-bit JAM sequence (duration: ${log.data.duration}t)`}
                  {log.type === 'BACKOFF_STARTED' && `Station ${log.data.stationId} BEB: k=${log.data.k}, chose slot ${log.data.slotChosen}, waiting ${log.data.waitTicks} ticks`}
                  {log.type === 'BACKOFF_EXPIRED' && `Station ${log.data.stationId} backoff expired; re-sensing medium for retry`}
                  {log.type === 'TRANSMISSION_SUCCESS' && `Station ${log.data.stationId} completed transmission without collision!`}
                  {log.type === 'FRAME_RECEIVED' && `Station ${log.data.stationId} received uncorrupted DATA from ${log.data.sourceStationId}`}
                  {log.type === 'EXCESSIVE_COLLISIONS_ABORT' && `Station ${log.data.stationId} reached IEEE 802.3 attempt limit (${log.data.attempts} >= ${log.data.attemptLimit || log.data.maxRetries}) — FRAME DISCARDED`}
                  {log.type === 'FRAME_QUEUED' && `Station ${log.data.stationId} queued new frame for transmission`}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
