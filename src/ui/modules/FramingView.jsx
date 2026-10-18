import React, { useState, useMemo } from 'react';
import {
  BIT_FLAG,
  stuffBits,
  destuffBits,
  isValidBitString,
  textToBitString,
  bitStringToText,
} from '../../core/framing/bitStuffing.js';
import {
  BYTE_FLAG,
  BYTE_ESC,
  stuffBytes,
  unstuffBytes,
  textToBytes,
  bytesToText,
  byteToHex,
  byteToBin,
  bytesToHexString,
} from '../../core/framing/byteStuffing.js';
import {
  encodeFrame,
  encodeMultipleFrames,
  decodeFrameStream,
  simulateLengthCorruption,
} from '../../core/framing/charCount.js';

const TECHNIQUES = {
  BIT_STUFFING: 'BIT_STUFFING',
  BYTE_STUFFING: 'BYTE_STUFFING',
  CHAR_COUNT: 'CHAR_COUNT',
};

export default function FramingView() {
  const [technique, setTechnique] = useState(TECHNIQUES.BIT_STUFFING);

  // Bit stuffing state
  const [bitInput, setBitInput] = useState('0111111011111001');
  const [isBitTextMode, setIsBitTextMode] = useState(false);
  const [injectBitError, setInjectBitError] = useState(false);

  // Byte stuffing state
  const [byteTextInput, setByteTextInput] = useState('Data~Link}Protocol~2026');
  const [injectByteError, setInjectByteError] = useState(false);

  // Character count state
  const [charCountInput, setCharCountInput] = useState('FRAME1,FRAME2,FRAME3');
  const [injectCharDesync, setInjectCharDesync] = useState(false);
  const [corruptedLengthVal, setCorruptedLengthVal] = useState(8);

  // Show viva drawer toggle
  const [showViva, setShowViva] = useState(true);

  // ==========================================
  // BIT STUFFING COMPUTATIONS
  // ==========================================
  const bitResult = useMemo(() => {
    let payloadBits = bitInput.trim();
    if (isBitTextMode) {
      try {
        payloadBits = textToBitString(bitInput);
      } catch (err) {
        return { error: 'Failed to convert text to bits: ' + err.message };
      }
    } else if (!isValidBitString(payloadBits)) {
      return { error: 'Invalid bit string. Must contain only 0 and 1.' };
    }

    try {
      const stuffed = stuffBits(payloadBits);
      let receivedStream = stuffed.framedBits;

      if (injectBitError) {
        // Inject abort sequence (seven consecutive ones) into the framed stream
        receivedStream = `${BIT_FLAG}011111110${BIT_FLAG}`;
      }

      const destuffed = destuffBits(receivedStream, true);

      let decodedText = null;
      if (!destuffed.hasError && destuffed.destuffedBits.length > 0 && destuffed.destuffedBits.length % 8 === 0) {
        try {
          decodedText = bitStringToText(destuffed.destuffedBits);
        } catch {
          decodedText = null;
        }
      }

      const match = !destuffed.hasError && destuffed.destuffedBits === payloadBits;

      return {
        payloadBits,
        stuffed,
        receivedStream,
        destuffed,
        decodedText,
        match,
        overheadPct: payloadBits.length > 0
          ? (((stuffed.framedBits.length - payloadBits.length) / payloadBits.length) * 100).toFixed(1)
          : '0',
      };
    } catch (err) {
      return { error: err.message };
    }
  }, [bitInput, isBitTextMode, injectBitError]);

  // ==========================================
  // BYTE STUFFING COMPUTATIONS
  // ==========================================
  const byteResult = useMemo(() => {
    try {
      const rawBytes = textToBytes(byteTextInput);
      const stuffed = stuffBytes(rawBytes);

      let receivedBytes = new Uint8Array(stuffed.framedBytes);
      if (injectByteError) {
        // Corrupt by introducing a dangling ESC right before the end flag
        const corrupt = new Uint8Array(stuffed.framedBytes.length + 1);
        corrupt.set(stuffed.framedBytes.slice(0, -1), 0);
        corrupt[corrupt.length - 2] = BYTE_ESC; // Insert dangling ESC
        corrupt[corrupt.length - 1] = BYTE_FLAG;
        receivedBytes = corrupt;
      }

      const destuffed = unstuffBytes(receivedBytes, true);

      let decodedText = null;
      if (!destuffed.hasError) {
        try {
          decodedText = bytesToText(destuffed.destuffedBytes);
        } catch {
          decodedText = '[Binary Bytes]';
        }
      }

      const match = !destuffed.hasError && bytesToHexString(rawBytes) === bytesToHexString(destuffed.destuffedBytes);

      return {
        rawBytes,
        stuffed,
        receivedBytes,
        destuffed,
        decodedText,
        match,
        overheadPct: rawBytes.length > 0
          ? (((stuffed.framedBytes.length - rawBytes.length) / rawBytes.length) * 100).toFixed(1)
          : '0',
      };
    } catch (err) {
      return { error: err.message };
    }
  }, [byteTextInput, injectByteError]);

  // ==========================================
  // CHARACTER COUNT COMPUTATIONS
  // ==========================================
  const charCountResult = useMemo(() => {
    try {
      const payloads = charCountInput.split(',').map((s) => s.trim()).filter(Boolean);
      if (payloads.length === 0) {
        return { error: 'Please enter at least one frame payload.' };
      }

      if (injectCharDesync) {
        const sim = simulateLengthCorruption(payloads, 0, corruptedLengthVal);
        return {
          payloads,
          isDesync: true,
          sim,
        };
      } else {
        const encoded = encodeMultipleFrames(payloads);
        const decoded = decodeFrameStream(encoded.streamBytes);

        return {
          payloads,
          isDesync: false,
          encoded,
          decoded,
          match: !decoded.hasError && decoded.frames.length === payloads.length,
        };
      }
    } catch (err) {
      return { error: err.message };
    }
  }, [charCountInput, injectCharDesync, corruptedLengthVal]);

  return (
    <div>
      {/* Secondary Sub-Tabs for Framing Techniques */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          className={`btn ${technique === TECHNIQUES.BIT_STUFFING ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTechnique(TECHNIQUES.BIT_STUFFING)}
        >
          Bit Stuffing (HDLC)
        </button>
        <button
          className={`btn ${technique === TECHNIQUES.BYTE_STUFFING ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTechnique(TECHNIQUES.BYTE_STUFFING)}
        >
          Byte / Character Stuffing (PPP)
        </button>
        <button
          className={`btn ${technique === TECHNIQUES.CHAR_COUNT ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTechnique(TECHNIQUES.CHAR_COUNT)}
        >
          Character-Count Framing
        </button>
      </div>

      {/* ======================================================== */}
      {/* TECHNIQUE 1: BIT STUFFING VIEW */}
      {/* ======================================================== */}
      {technique === TECHNIQUES.BIT_STUFFING && (
        <div>
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 className="card-title">HDLC Bit Stuffing & Destuffing Simulator</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Flag: <code style={{ color: 'var(--accent-amber)' }}>01111110</code>. Injects a <code style={{ color: 'var(--accent-rose)' }}>0</code> after every five consecutive <code style={{ color: 'var(--accent-cyan)' }}>1</code>s.
                </p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isBitTextMode}
                  onChange={(e) => {
                    setIsBitTextMode(e.target.checked);
                    if (e.target.checked) setBitInput('HELLO');
                    else setBitInput('0111111011111001');
                  }}
                />
                Input as UTF-8 Text
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">
                {isBitTextMode ? 'Text Payload' : 'Binary Bit Stream Payload (0 & 1)'}
              </label>
              <textarea
                className="input-textarea"
                rows={2}
                value={bitInput}
                onChange={(e) => setBitInput(e.target.value)}
                placeholder={isBitTextMode ? 'Type text...' : 'Enter 0s and 1s...'}
              />
              <div className="samples-bar">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Presets:</span>
                <button
                  className="sample-chip"
                  onClick={() => {
                    setIsBitTextMode(false);
                    setBitInput('01111110'); // Exact flag collision
                  }}
                >
                  Raw Flag Collision (01111110)
                </button>
                <button
                  className="sample-chip"
                  onClick={() => {
                    setIsBitTextMode(false);
                    setBitInput('1111100011111'); // Five 1s in two spots
                  }}
                >
                  Five 1s Pattern
                </button>
                <button
                  className="sample-chip"
                  onClick={() => {
                    setIsBitTextMode(false);
                    setBitInput('1111111111'); // Ten consecutive 1s
                  }}
                >
                  Ten Consecutive 1s
                </button>
                <button
                  className="sample-chip"
                  onClick={() => {
                    setIsBitTextMode(true);
                    setBitInput('CN 2026');
                  }}
                >
                  ASCII "CN 2026"
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={injectBitError}
                  onChange={(e) => setInjectBitError(e.target.checked)}
                />
                <span style={{ color: injectBitError ? 'var(--accent-rose)' : 'inherit' }}>
                  Inject Channel Abort Error (Seven 1s)
                </span>
              </label>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setBitInput('');
                  setInjectBitError(false);
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {bitResult.error ? (
            <div className="alert alert-error">{bitResult.error}</div>
          ) : (
            <div>
              {/* Telemetry Summary Cards */}
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Original Payload Size</div>
                  <div className="stat-value">{bitResult.payloadBits.length} bits</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Stuffed Zeros Added</div>
                  <div className="stat-value" style={{ color: 'var(--accent-rose)' }}>
                    +{bitResult.stuffed.stuffingCount} bits
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Total Framed Length</div>
                  <div className="stat-value">{bitResult.stuffed.framedBits.length} bits</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Framing Overhead</div>
                  <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>
                    {bitResult.overheadPct}%
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Round-Trip Status</div>
                  <div className="stat-value">
                    {bitResult.match ? (
                      <span className="badge badge-success">VERIFIED PASS</span>
                    ) : (
                      <span className="badge badge-info" style={{ background: 'rgba(244, 63, 94, 0.2)', color: 'var(--accent-rose)' }}>
                        {bitResult.destuffed.hasError ? 'FRAMING ERROR' : 'MISMATCH'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Transformation Pipeline */}
              <div className="pipeline-container">
                {/* Stage 1 */}
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Stage 1: Raw Original Payload</span>
                    <span className="badge badge-info">{bitResult.payloadBits.length} bits</span>
                  </div>
                  <div className="stream-display">
                    {bitResult.payloadBits.split('').map((bit, idx) => (
                      <span key={idx} className="bit-cell cell-normal">
                        {bit}
                        <span className="cell-label">{idx}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Stage 2 */}
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">
                      Stage 2: Stuffed & Framed Transmission Stream (Sender Output)
                    </span>
                    <span className="badge badge-info" style={{ background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)' }}>
                      Flags + Payload + Stuffed 0s
                    </span>
                  </div>
                  <div className="stream-display">
                    {/* Opening Flag */}
                    <span className="bit-cell cell-flag" title="Opening Flag 01111110">
                      FLAG: {BIT_FLAG}
                      <span className="cell-label">Header</span>
                    </span>

                    {/* Stuffed Payload */}
                    {bitResult.stuffed.stuffedBits.split('').map((bit, idx) => {
                      const isStuffed = bitResult.stuffed.insertionIndices.includes(idx);
                      return (
                        <span
                          key={idx}
                          className={`bit-cell ${isStuffed ? 'cell-stuffed' : 'cell-normal'}`}
                          title={isStuffed ? 'Stuffed bit inserted after five 1s' : `Data bit at ${idx}`}
                        >
                          {bit}
                          <span className="cell-label">{isStuffed ? 'STUFF' : idx}</span>
                        </span>
                      );
                    })}

                    {/* Closing Flag */}
                    <span className="bit-cell cell-flag" title="Closing Flag 01111110">
                      FLAG: {BIT_FLAG}
                      <span className="cell-label">Trailer</span>
                    </span>
                  </div>
                </div>

                {/* Stage 3 */}
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Stage 3: Received Stream & Channel Inspection</span>
                    {injectBitError && (
                      <span className="badge" style={{ background: 'rgba(244, 63, 94, 0.2)', color: 'var(--accent-rose)' }}>
                        Injected 7 Consecutive 1s (Abort)
                      </span>
                    )}
                  </div>
                  <div className="mono-display" style={{ color: injectBitError ? 'var(--accent-rose)' : 'var(--accent-cyan)' }}>
                    {bitResult.receivedStream}
                  </div>
                </div>

                {/* Stage 4 */}
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Stage 4: Destuffed Decoded Payload (Receiver Output)</span>
                    <span className="badge badge-success">
                      {bitResult.destuffed.removedCount} Stuffed Zeros Removed
                    </span>
                  </div>
                  {bitResult.destuffed.hasError ? (
                    <div className="alert alert-error">
                      <strong>Receiver Error:</strong> {bitResult.destuffed.errorMessage}
                    </div>
                  ) : (
                    <div>
                      <div className="stream-display">
                        {bitResult.destuffed.destuffedBits.split('').map((bit, idx) => (
                          <span key={idx} className="bit-cell cell-normal">
                            {bit}
                            <span className="cell-label">{idx}</span>
                          </span>
                        ))}
                      </div>
                      {bitResult.decodedText && (
                        <p style={{ marginTop: '0.75rem', color: 'var(--accent-cyan)', fontSize: '0.9rem' }}>
                          Recovered Text: <strong>"{bitResult.decodedText}"</strong>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Transformation Trace Log */}
              {bitResult.stuffed.trace.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Step-by-Step Transmitter Stuffing Trace</h3>
                  </div>
                  <ul style={{ listStyle: 'none', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {bitResult.stuffed.trace.map((item, idx) => (
                      <li key={idx} style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span className="badge badge-info" style={{ marginRight: '0.5rem' }}>Step {idx + 1}</span>
                        {item.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TECHNIQUE 2: BYTE STUFFING VIEW */}
      {/* ======================================================== */}
      {technique === TECHNIQUES.BYTE_STUFFING && (
        <div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">PPP / Byte Stuffing & Unstuffing Simulator</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                FLAG Byte = <code style={{ color: 'var(--accent-amber)' }}>0x7E</code> (126, '~') |
                ESC Byte = <code style={{ color: 'var(--accent-purple)' }}>0x7D</code> (125, {'\'}\''}) |
                Any occurrence of FLAG or ESC in the payload is preceded by an ESC byte.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Text Payload (Supports ASCII & UTF-8 Symbols)</label>
              <textarea
                className="input-textarea"
                rows={2}
                value={byteTextInput}
                onChange={(e) => setByteTextInput(e.target.value)}
                placeholder="Enter text to stuff..."
              />
              <div className="samples-bar">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Presets:</span>
                <button
                  className="sample-chip"
                  onClick={() => setByteTextInput('Hello~World')}
                >
                  FLAG (~) in Payload
                </button>
                <button
                  className="sample-chip"
                  onClick={() => setByteTextInput('Header}Payload')}
                >
                  ESC (&#125;) in Payload
                </button>
                <button
                  className="sample-chip"
                  onClick={() => setByteTextInput('~A}B~C}D~')}
                >
                  Multiple FLAG & ESC
                </button>
                <button
                  className="sample-chip"
                  onClick={() => setByteTextInput('Networks 🌐 Assignment €100')}
                >
                  UTF-8 Multi-byte
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={injectByteError}
                  onChange={(e) => setInjectByteError(e.target.checked)}
                />
                <span style={{ color: injectByteError ? 'var(--accent-rose)' : 'inherit' }}>
                  Inject Dangling ESC Error
                </span>
              </label>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setByteTextInput('');
                  setInjectByteError(false);
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {byteResult.error ? (
            <div className="alert alert-error">{byteResult.error}</div>
          ) : (
            <div>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Original Payload Size</div>
                  <div className="stat-value">{byteResult.rawBytes.length} bytes</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Escaped Bytes Inserted</div>
                  <div className="stat-value" style={{ color: 'var(--accent-purple)' }}>
                    +{byteResult.stuffed.escapedCount} ESC
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Total Framed Length</div>
                  <div className="stat-value">{byteResult.stuffed.framedBytes.length} bytes</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Framing Overhead</div>
                  <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>
                    {byteResult.overheadPct}%
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Round-Trip Status</div>
                  <div className="stat-value">
                    {byteResult.match ? (
                      <span className="badge badge-success">VERIFIED PASS</span>
                    ) : (
                      <span className="badge badge-info" style={{ background: 'rgba(244, 63, 94, 0.2)', color: 'var(--accent-rose)' }}>
                        {byteResult.destuffed.hasError ? 'FRAMING ERROR' : 'MISMATCH'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Transformation Pipeline */}
              <div className="pipeline-container">
                {/* Stage 1 */}
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Stage 1: Raw Original Bytes (Hex & Char)</span>
                    <span className="badge badge-info">{byteResult.rawBytes.length} bytes</span>
                  </div>
                  <div className="stream-display">
                    {Array.from(byteResult.rawBytes).map((b, idx) => (
                      <span key={idx} className="byte-cell cell-normal">
                        <strong>{byteToHex(b)}</strong>
                        <span className="cell-label">{String.fromCharCode(b) || '·'}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Stage 2 */}
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Stage 2: Stuffed & Framed Byte Stream</span>
                    <span className="badge badge-info" style={{ background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent-purple)' }}>
                      FLAG (0x7E) Delimited
                    </span>
                  </div>
                  <div className="stream-display">
                    {Array.from(byteResult.stuffed.framedBytes).map((b, idx) => {
                      const isFlag = b === BYTE_FLAG;
                      const isEsc = b === BYTE_ESC;
                      return (
                        <span
                          key={idx}
                          className={`byte-cell ${isFlag ? 'cell-flag' : isEsc ? 'cell-esc' : 'cell-normal'}`}
                        >
                          <strong>{byteToHex(b)}</strong>
                          <span className="cell-label">
                            {isFlag ? 'FLAG' : isEsc ? 'ESC' : String.fromCharCode(b) || '·'}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Stage 3 */}
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Stage 3: Unstuffed & Decoded Result</span>
                    <span className="badge badge-success">
                      {byteResult.destuffed.removedEscapeCount} ESC Bytes Stripped
                    </span>
                  </div>
                  {byteResult.destuffed.hasError ? (
                    <div className="alert alert-error">
                      <strong>Receiver Error:</strong> {byteResult.destuffed.errorMessage}
                    </div>
                  ) : (
                    <div>
                      <div className="stream-display">
                        {Array.from(byteResult.destuffed.destuffedBytes).map((b, idx) => (
                          <span key={idx} className="byte-cell cell-normal">
                            <strong>{byteToHex(b)}</strong>
                            <span className="cell-label">{String.fromCharCode(b) || '·'}</span>
                          </span>
                        ))}
                      </div>
                      <p style={{ marginTop: '0.75rem', color: 'var(--accent-cyan)', fontSize: '0.9rem' }}>
                        Decoded Text Output: <strong>"{byteResult.decodedText}"</strong>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TECHNIQUE 3: CHARACTER COUNT VIEW */}
      {/* ======================================================== */}
      {technique === TECHNIQUES.CHAR_COUNT && (
        <div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Character / Byte Count Framing & Desynchronization Demo</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Each frame is prefixed with a 1-byte header specifying the <strong>total frame length</strong> (Header + Payload).
                Notice how a single corrupted length header shifts frame boundaries, destroying all subsequent frames.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Comma-Separated Consecutive Frames</label>
              <input
                className="input-textarea"
                style={{ minHeight: 'auto', height: '42px' }}
                value={charCountInput}
                onChange={(e) => setCharCountInput(e.target.value)}
                placeholder="FRAME1, FRAME2, FRAME3"
              />
              <div className="samples-bar">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Presets:</span>
                <button
                  className="sample-chip"
                  onClick={() => setCharCountInput('DATA1,DATA2,DATA3')}
                >
                  Standard 3 Frames
                </button>
                <button
                  className="sample-chip"
                  onClick={() => setCharCountInput('HELLO,WORLD,NETWORKS,LAYER2')}
                >
                  4 Frames
                </button>
                <button
                  className="sample-chip"
                  onClick={() => setCharCountInput('Short,A,B,LongerMessageHere')}
                >
                  Variable Length Frames
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={injectCharDesync}
                  onChange={(e) => setInjectCharDesync(e.target.checked)}
                />
                <span style={{ color: injectCharDesync ? 'var(--accent-rose)' : 'inherit', fontWeight: 600 }}>
                  Inject Length Header Corruption (Frame 0)
                </span>
              </label>

              {injectCharDesync && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <span>Altered Length Value:</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={corruptedLengthVal}
                    onChange={(e) => setCorruptedLengthVal(parseInt(e.target.value, 10) || 1)}
                    style={{
                      width: '60px',
                      padding: '4px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--accent-rose)',
                      color: 'var(--text-primary)',
                      borderRadius: '4px',
                      textAlign: 'center',
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {charCountResult.error ? (
            <div className="alert alert-error">{charCountResult.error}</div>
          ) : charCountResult.isDesync ? (
            <div>
              <div className="alert alert-error" style={{ display: 'block' }}>
                <h4 style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                  Cascading Framing Desynchronization Triggered!
                </h4>
                <p>{charCountResult.sim.explanation}</p>
              </div>

              <div className="pipeline-container">
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Clean Stream vs. Corrupted Stream Byte Array</span>
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Clean Stream:</div>
                    <div className="stream-display">
                      {Array.from(charCountResult.sim.cleanStream).map((b, idx) => (
                        <span key={idx} className={`byte-cell ${idx === 0 ? 'cell-header' : 'cell-normal'}`}>
                          <strong>{b}</strong>
                          <span className="cell-label">{idx === 0 ? 'LEN' : String.fromCharCode(b)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent-rose)' }}>Corrupted Stream:</div>
                    <div className="stream-display">
                      {Array.from(charCountResult.sim.corruptedStream).map((b, idx) => {
                        const isCorrupted = idx === charCountResult.sim.targetByteOffset;
                        return (
                          <span key={idx} className={`byte-cell ${isCorrupted ? 'cell-corrupt' : 'cell-normal'}`}>
                            <strong>{b}</strong>
                            <span className="cell-label">
                              {isCorrupted ? 'MUTATED' : String.fromCharCode(b)}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Receiver Decoded Output</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {charCountResult.sim.corruptedFrames.map((f, idx) => (
                      <div key={idx} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                        <strong>Frame {idx}:</strong> Read length <code>{f.lengthHeader}</code> from offset{' '}
                        <code>{f.headerOffset}</code> &rarr; Payload bytes: <code>"{f.payloadText}"</code>
                      </div>
                    ))}
                    {charCountResult.sim.decodingError && (
                      <div style={{ color: 'var(--accent-rose)', marginTop: '0.5rem' }}>
                        &times; Stream terminated prematurely: {charCountResult.sim.decodingError.message}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="pipeline-container">
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Concatenated Encoded Byte Stream</span>
                    <span className="badge badge-info">{charCountResult.encoded.totalBytes} bytes total</span>
                  </div>
                  <div className="stream-display">
                    {charCountResult.encoded.frames.map((frame, fIdx) => (
                      <React.Fragment key={fIdx}>
                        <span className="byte-cell cell-header" title={`Frame ${fIdx} Length Header`}>
                          <strong>{frame.lengthHeader}</strong>
                          <span className="cell-label">F{fIdx} LEN</span>
                        </span>
                        {Array.from(frame.originalBytes).map((b, bIdx) => (
                          <span key={bIdx} className="byte-cell cell-normal">
                            <strong>{String.fromCharCode(b) || byteToHex(b)}</strong>
                            <span className="cell-label">{byteToHex(b)}</span>
                          </span>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Receiver Decoded Frames</span>
                    <span className="badge badge-success">ALL {charCountResult.decoded.frames.length} FRAMES RECOVERED</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {charCountResult.decoded.frames.map((frame, idx) => (
                      <div key={idx} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span className="badge badge-info" style={{ marginRight: '0.5rem' }}>Frame {idx + 1}</span>
                        Total Length: <strong>{frame.totalLength} bytes</strong> |
                        Payload: <strong style={{ color: 'var(--accent-cyan)' }}>"{frame.payloadText}"</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* VIVA HELPER PANEL (COMMON TO ALL TECHNIQUES) */}
      {/* ======================================================== */}
      <div className="viva-box">
        <div className="viva-box-header">
          <div className="viva-title">
            <span>🎓 Viva Helper & Technical Theory Panel</span>
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setShowViva(!showViva)}
          >
            {showViva ? 'Hide Viva Guide' : 'Show Viva Guide'}
          </button>
        </div>

        {showViva && (
          <div>
            <div className="viva-q">Q1: Why is framing necessary at the Data Link Layer?</div>
            <div className="viva-a">
              The Physical Layer simply transmits an unformatted, continuous stream of raw bits. The Data Link Layer must break this raw bit stream into discrete packets called <strong>frames</strong> so that the receiver can recognize where each transmission begins and ends, perform error detection (CRC/checksum), and handle flow control (ACKs).
            </div>

            <div className="viva-q">Q2: How does HDLC Bit Stuffing prevent accidental delimiter flag collisions?</div>
            <div className="viva-a">
              The reserved flag is <code>01111110</code> (six consecutive 1s). Whenever the transmitter notices five consecutive 1s in the user payload data, it unconditionally injects a <code>0</code> bit. Therefore, the pattern <code>01111110</code> can never accidentally appear inside the payload. On the receiving end, whenever five consecutive 1s are followed by a 0, the receiver discards the 0, restoring the exact original payload.
            </div>

            <div className="viva-q">Q3: Why is Character-Count framing rarely used in modern production protocols?</div>
            <div className="viva-a">
              Character-count framing suffers from <strong>catastrophic framing desynchronization</strong>. If transmission noise flips even a single bit in a length field, the receiver counts the wrong number of bytes, misinterprets ordinary payload bytes as the length header of the next frame, and permanently loses frame synchronization for all subsequent frames. Modern protocols instead use flag bytes with stuffing or physical layer code violations.
            </div>

            <div className="viva-q">Q4: What is the maximum overhead of Bit Stuffing?</div>
            <div className="viva-a">
              In the worst-case scenario where the user payload consists entirely of <code>1</code> bits, a <code>0</code> bit must be stuffed after every five 1s. This yields an overhead of 1 bit per 5 payload bits, or exactly <strong>20% (1/5)</strong> payload expansion, plus the 16-bit opening and closing flag delimiters.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
