import React, { useState } from 'react';
import FramingView from './modules/FramingView.jsx';
import ErrorControlView from './modules/ErrorControlView.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('error-control');

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-title-group">
          <h1>
            <span>Data Link Layer Protocol Simulator</span>
            <span className="badge badge-info">v0.3.0</span>
          </h1>
          <p>Computer Networks Innovative Assignment — Semester V</p>
        </div>
        <div>
          <span className="badge badge-success">Phase 5: Error Control & CRC Active</span>
        </div>
      </header>

      {/* Main Navigation Tabs */}
      <nav className="nav-tabs">
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
          <span>Error Control & CRC</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <span>📋</span>
          <span>Project Architecture & Overview</span>
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'framing' && <FramingView />}
        {activeTab === 'error-control' && <ErrorControlView />}

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
                Status: Framing & Error Control Verified | Package Manager: pnpm | Runtime: Vite + React + Vitest (94 tests)
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
                    <strong>Flow Control (Phase 6 Next):</strong> Stop-and-Wait ARQ, Go-Back-N, Selective Repeat
                  </li>
                  <li>
                    <strong>Medium Access (Phase 7):</strong> CSMA/CD Bus Contention & Exponential Backoff
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
