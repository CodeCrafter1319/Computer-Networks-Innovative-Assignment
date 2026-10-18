import React from 'react';

export default function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-title-group">
          <h1>
            <span>Data Link Layer Protocol Simulator</span>
            <span className="badge badge-info">v0.1.0</span>
          </h1>
          <p>Computer Networks Innovative Assignment — Semester V</p>
        </div>
        <div>
          <span className="badge badge-success">Phase 2: Foundation Verified</span>
        </div>
      </header>

      <main className="app-main">
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
            Status: Engine Foundation Ready | Package Manager: pnpm | Runtime: Vite + React + Vitest
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Planned Modules</h3>
            </div>
            <ul style={{ listStylePosition: 'inside', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              <li><strong>Framing:</strong> Bit Stuffing (MVP), Byte Stuffing, Character Count</li>
              <li><strong>Error Control:</strong> Modulo-2 CRC (MVP), Internet Checksum, Parity</li>
              <li><strong>Flow Control:</strong> Stop-and-Wait ARQ (MVP), Go-Back-N, Selective Repeat</li>
              <li><strong>Medium Access:</strong> CSMA/CD Bus Contention & Exponential Backoff</li>
            </ul>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Academic & Viva Design Principles</h3>
            </div>
            <ul style={{ listStylePosition: 'inside', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              <li><strong>Deterministic Simulation:</strong> Discrete-event clock, zero race conditions</li>
              <li><strong>Pure Unit Tests:</strong> Every algorithm mathematically verified before UI integration</li>
              <li><strong>Viva Helper Panel:</strong> Integrated theory, formulas, and examiner FAQ</li>
              <li><strong>Authentic Telemetry:</strong> Metrics derived strictly from live simulated events</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
