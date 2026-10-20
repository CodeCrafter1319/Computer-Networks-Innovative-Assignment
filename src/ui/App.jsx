import React, { useState } from 'react';
import FramingView from './modules/FramingView.jsx';
import ErrorControlView from './modules/ErrorControlView.jsx';
import FlowControlView from './modules/FlowControlView.jsx';
import MacView from './modules/MacView.jsx';
import TransmissionLabView from './modules/TransmissionLabView.jsx';

export default function App({ defaultTab = 'flow-control' } = {}) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-title-group">
          <h1>
            <span>Data Link Layer Protocol Simulator</span>
            <span className="badge badge-info">v0.6.0</span>
          </h1>
          <p>Computer Networks Innovative Assignment — Semester V</p>
        </div>
        <div>
          <span className="badge badge-success">Phase 6: Flow Control &amp; ARQ Active | Phase 7: CSMA/CD Simulation Active | Phase 8: End-to-End Transmission Lab Active</span>
        </div>
      </header>

      {/* Main Navigation Tabs */}
      <nav className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'transmission-lab' ? 'active' : ''}`}
          onClick={() => setActiveTab('transmission-lab')}
        >
          <span>🔬</span>
          <span>End-to-End Transmission Lab</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'framing' ? 'active' : ''}`}
          onClick={() => setActiveTab('framing')}
        >
          <span>📦</span>
          <span>Framing Simulator</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'error-control' ? 'active' : ''}`}
          onClick={() => setActiveTab('error-control')}
        >
          <span>🛡️</span>
          <span>Error Control &amp; CRC</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'flow-control' ? 'active' : ''}`}
          onClick={() => setActiveTab('flow-control')}
        >
          <span>🔄</span>
          <span>Flow Control &amp; ARQ</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'mac' ? 'active' : ''}`}
          onClick={() => setActiveTab('mac')}
        >
          <span>📡</span>
          <span>CSMA/CD Bus</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <span>📋</span>
          <span>Project Architecture &amp; Overview</span>
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'transmission-lab' && <TransmissionLabView />}
        {activeTab === 'framing' && <FramingView />}
        {activeTab === 'error-control' && <ErrorControlView />}
        {activeTab === 'flow-control' && <FlowControlView />}
        {activeTab === 'mac' && <MacView />}

        {activeTab === 'overview' && (
          <div>
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Project Initialization & Architectural Foundation</h2>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                The core architecture is established with complete decoupling between networking
                algorithms and the React user interface. Vitest is configured to run pure algorithmic
                unit tests for Framing, Error Control, Flow Control, and Medium Access.
              </p>
              <div className="mono-display">
                Status: Framing, Error Control, Flow Control & CSMA/CD MAC Verified | Package Manager: pnpm | Runtime: Vite + React + Vitest (142+ tests)
              </div>
            </div>

            <div className="grid-2">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Completed & Planned Modules</h3>
                </div>
                <ul style={{ listStylePosition: 'inside', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                  <li>
                    <strong style={{ color: 'var(--accent-emerald)' }}>✓ Framing (Phase 4 Complete):</strong>{' '}
                    Bit Stuffing, Byte Stuffing, Character Count
                  </li>
                  <li>
                    <strong style={{ color: 'var(--accent-emerald)' }}>✓ Error Control (Phase 5 Complete):</strong>{' '}
                    Modulo-2 CRC, Named Variants (SMBus/CCITT), Internet Checksum, 1D & 2D Parity
                  </li>
                  <li>
                    <strong style={{ color: 'var(--accent-emerald)' }}>✓ Flow Control (Phase 6 Complete):</strong>{' '}
                    Stop-and-Wait ARQ, Go-Back-N ARQ, Selective Repeat ARQ
                  </li>
                  <li>
                    <strong style={{ color: 'var(--accent-emerald)' }}>✓ Medium Access (Phase 7 Complete):</strong>{' '}
                    CSMA/CD Bus Contention, Collision Detection (2τ), Jamming & Truncated BEB
                  </li>
                  <li>
                    <strong style={{ color: 'var(--accent-emerald)' }}>✓ End-to-End Transmission Lab (Phase 8 Complete):</strong>{' '}
                    Integrated 8-Stage Transmission Lifecycle (Point-to-Point ARQ &amp; Shared-Medium CSMA/CD)
                  </li>
                </ul>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Academic & Viva Design Principles</h3>
                </div>
                <ul style={{ listStylePosition: 'inside', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                  <li>
                    <strong>Deterministic Simulation:</strong> Discrete-event clock, zero race conditions
                  </li>
                  <li>
                    <strong>Pure Unit Tests:</strong> Every algorithm mathematically verified before UI integration
                  </li>
                  <li>
                    <strong>Two Complementary Experiences:</strong> Standalone Learning Playground + Integrated Transmission Lab
                  </li>
                  <li>
                    <strong>Mathematical Rigor:</strong> Exact modulo 2^m arithmetic, RFC 1662 compliance, CRC step traces
                  </li>
                  <li>
                    <strong>Viva Helper Panel:</strong> Integrated theory, formulas, and examiner FAQ
                  </li>
                  <li>
                    <strong>Authentic Telemetry:</strong> Metrics derived strictly from live simulated events
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
