import React, { useState, useMemo } from 'react';
import {
  STANDARD_GENERATORS,
  NAMED_CRC_VARIANTS,
  validateBitString,
  validateGeneratorPolynomial,
  textToBitString,
  generateEducationalCrc,
  verifyEducationalCrc,
  computeNamedCrc,
  verifyNamedCrc,
} from '../../core/error-control/crc.js';
import {
  calculateInternetChecksum,
  verifyInternetChecksum,
  wordToHex,
  wordToBin,
} from '../../core/error-control/checksum.js';
import {
  ParityMode,
  calculate1DParity,
  verify1DParity,
  calculate2DParity,
  verify2DParity,
} from '../../core/error-control/parity.js';
import {
  flipBitAt,
  corruptBitString,
  corruptTransmittedFields,
} from '../../core/error-control/errorInjection.js';

const ERROR_TECHNIQUES = {
  CRC: 'CRC',
  CHECKSUM: 'CHECKSUM',
  PARITY_1D: 'PARITY_1D',
  PARITY_2D: 'PARITY_2D',
};

const CRC_MODES = {
  EDUCATIONAL: 'EDUCATIONAL',
  NAMED_VARIANT: 'NAMED_VARIANT',
};

export default function ErrorControlView() {
  const [technique, setTechnique] = useState(ERROR_TECHNIQUES.CRC);

  // ==========================================
  // CRC STATE
  // ==========================================
  const [crcMode, setCrcMode] = useState(CRC_MODES.EDUCATIONAL);
  const [crcInputText, setCrcInputText] = useState('1101011011');
  const [isCrcTextMode, setIsCrcTextMode] = useState(false);
  const [selectedGeneratorKey, setSelectedGeneratorKey] = useState('CRC_4');
  const [customGenerator, setCustomGenerator] = useState('10011');
  const [namedVariantKey, setNamedVariantKey] = useState('CRC-16/CCITT-FALSE');
  const [crcStepLimit, setCrcStepLimit] = useState(null); // null = all steps

  // CRC Error Injection
  const [injectCrcError, setInjectCrcError] = useState(false);
  const [crcErrorType, setCrcErrorType] = useState('SINGLE'); // 'SINGLE' | 'BURST' | 'FCS'
  const [crcFlipBitIndex, setCrcFlipBitIndex] = useState(3);
  const [crcBurstLength, setCrcBurstLength] = useState(3);

  // ==========================================
  // CHECKSUM STATE
  // ==========================================
  const [checksumInput, setChecksumInput] = useState('Networks 2026');
  const [injectChecksumError, setInjectChecksumError] = useState(false);
  const [checksumErrorTarget, setChecksumErrorTarget] = useState('PAYLOAD'); // 'PAYLOAD' | 'CHECKSUM'
  const [checksumCorruptByteIndex, setChecksumCorruptByteIndex] = useState(0);

  // ==========================================
  // 1D PARITY STATE
  // ==========================================
  const [parity1DInput, setParity1DInput] = useState('1101001');
  const [parity1DMode, setParity1DMode] = useState(ParityMode.EVEN);
  const [injectParity1DError, setInjectParity1DError] = useState(false);
  const [parity1DErrorType, setParity1DErrorType] = useState('SINGLE'); // 'SINGLE' | 'DOUBLE' (evasion)

  // ==========================================
  // 2D PARITY STATE
  // ==========================================
  const [parity2DInput, setParity2DInput] = useState('1011010111100010');
  const [parity2DRows, setParity2DRows] = useState(4);
  const [parity2DCols, setParity2DCols] = useState(4);
  const [parity2DMode, setParity2DMode] = useState(ParityMode.EVEN);
  const [interactiveMatrixOverrides, setInteractiveMatrixOverrides] = useState({}); // { "r,c": bit }

  // Viva Drawer State
  const [showViva, setShowViva] = useState(true);

  // ==========================================
  // CRC COMPUTATIONS
  // ==========================================
  const crcResult = useMemo(() => {
    try {
      if (crcMode === CRC_MODES.EDUCATIONAL) {
        const poly =
          selectedGeneratorKey === 'CUSTOM'
            ? customGenerator.trim()
            : STANDARD_GENERATORS[selectedGeneratorKey].polyBits;

        validateGeneratorPolynomial(poly);

        const gen = generateEducationalCrc(crcInputText, {
          generator: poly,
          isTextInput: isCrcTextMode,
        });

        // Error injection handling
        let receivedCodeword = gen.codewordBits;
        let flippedIndices = [];

        if (injectCrcError) {
          if (crcErrorType === 'SINGLE') {
            const idx = Math.min(crcFlipBitIndex, gen.codewordBits.length - 1);
            receivedCodeword = flipBitAt(receivedCodeword, idx);
            flippedIndices = [idx];
          } else if (crcErrorType === 'BURST') {
            const start = Math.min(crcFlipBitIndex, gen.codewordBits.length - 1);
            const burst = corruptBitString(receivedCodeword, {
              type: 'BURST',
              startIndex: start,
              burstLength: crcBurstLength,
            });
            receivedCodeword = burst.corruptedBits;
            flippedIndices = burst.flippedIndices;
          } else if (crcErrorType === 'FCS') {
            // Corrupt bit in FCS portion
            const fcsStart = gen.messageBits.length;
            const idx = fcsStart + Math.min(crcFlipBitIndex % gen.degree, gen.degree - 1);
            receivedCodeword = flipBitAt(receivedCodeword, idx);
            flippedIndices = [idx];
          }
        }

        const verification = verifyEducationalCrc(receivedCodeword, poly);

        return {
          mode: CRC_MODES.EDUCATIONAL,
          generator: poly,
          degree: gen.degree,
          messageBits: gen.messageBits,
          fcsBits: gen.fcsBits,
          codewordBits: gen.codewordBits,
          steps: gen.steps,
          quotient: gen.quotient,
          receivedCodeword,
          flippedIndices,
          verification,
          overheadPct: ((gen.degree / gen.messageBits.length) * 100).toFixed(1),
        };
      } else {
        // Named Variant mode
        const calc = computeNamedCrc(crcInputText, namedVariantKey);

        let receivedPayload = crcInputText;
        let receivedFcsHex = calc.crcHex;
        let errorDescription = null;

        if (injectCrcError) {
          if (crcErrorType === 'FCS') {
            // Invert least significant nibble of FCS
            const fcsVal = (calc.crcInt ^ 0x01) & ((1 << calc.variant.width) - 1);
            receivedFcsHex = fcsVal.toString(16).toUpperCase().padStart(calc.variant.width / 4, '0');
            errorDescription = `Corrupted received FCS from 0x${calc.crcHex} to 0x${receivedFcsHex}.`;
          } else {
            // Corrupt one character in payload
            const chars = crcInputText.split('');
            const idx = Math.min(crcFlipBitIndex, chars.length - 1);
            chars[idx] = String.fromCharCode(chars[idx].charCodeAt(0) ^ 0x01);
            receivedPayload = chars.join('');
            errorDescription = `Inverted bit in payload character at index ${idx} ('${crcInputText[idx]}' -> '${chars[idx]}').`;
          }
        }

        const verification = verifyNamedCrc(receivedPayload, receivedFcsHex, namedVariantKey);

        return {
          mode: CRC_MODES.NAMED_VARIANT,
          variantName: namedVariantKey,
          variant: calc.variant,
          payloadBytes: calc.payloadBytes,
          crcHex: calc.crcHex,
          crcBits: calc.crcBits,
          trace: calc.trace,
          receivedPayload,
          receivedFcsHex,
          verification,
          errorDescription,
        };
      }
    } catch (err) {
      return { error: err.message };
    }
  }, [
    crcMode,
    crcInputText,
    isCrcTextMode,
    selectedGeneratorKey,
    customGenerator,
    namedVariantKey,
    injectCrcError,
    crcErrorType,
    crcFlipBitIndex,
    crcBurstLength,
  ]);

  // ==========================================
  // CHECKSUM COMPUTATIONS
  // ==========================================
  const checksumResult = useMemo(() => {
    try {
      const calc = calculateInternetChecksum(checksumInput);

      let receivedPayload = checksumInput;
      let receivedChecksumVal = calc.checksum;
      let errorDescription = null;

      if (injectChecksumError) {
        if (checksumErrorTarget === 'CHECKSUM') {
          // Flip a bit in the checksum field
          receivedChecksumVal = (calc.checksum ^ 0x0001) & 0xffff;
          errorDescription = `Tampered with transmitted Checksum: 0x${calc.checksumHex} -> ${wordToHex(receivedChecksumVal)}.`;
        } else {
          // Flip a byte in the payload
          const bytes = new TextEncoder().encode(checksumInput);
          if (bytes.length > 0) {
            const idx = Math.min(checksumCorruptByteIndex, bytes.length - 1);
            bytes[idx] ^= 0x01;
            receivedPayload = bytes;
            errorDescription = `Corrupted payload byte at index ${idx}.`;
          }
        }
      }

      const verification = verifyInternetChecksum(receivedPayload, receivedChecksumVal);

      return {
        calc,
        receivedPayload,
        receivedChecksumVal,
        receivedChecksumHex: wordToHex(receivedChecksumVal),
        verification,
        errorDescription,
      };
    } catch (err) {
      return { error: err.message };
    }
  }, [checksumInput, injectChecksumError, checksumErrorTarget, checksumCorruptByteIndex]);

  // ==========================================
  // 1D PARITY COMPUTATIONS
  // ==========================================
  const parity1DResult = useMemo(() => {
    try {
      validateBitString(parity1DInput, '1D Parity input');
      const calc = calculate1DParity(parity1DInput, parity1DMode);

      let receivedCodeword = calc.codewordBits;
      let flippedIndices = [];
      let errorNote = null;

      if (injectParity1DError) {
        if (parity1DErrorType === 'SINGLE') {
          receivedCodeword = flipBitAt(receivedCodeword, 0);
          flippedIndices = [0];
          errorNote = 'Single bit flip injected at index 0.';
        } else if (parity1DErrorType === 'DOUBLE') {
          // Flip two bits: index 0 and index 1
          if (receivedCodeword.length >= 2) {
            receivedCodeword = flipBitAt(receivedCodeword, 0);
            receivedCodeword = flipBitAt(receivedCodeword, 1);
            flippedIndices = [0, 1];
            errorNote = 'Two bit flips injected at indices 0 and 1 (demonstrating evasion of 1D parity).';
          }
        }
      }

      const verification = verify1DParity(receivedCodeword, parity1DMode);

      return {
        calc,
        receivedCodeword,
        flippedIndices,
        verification,
        errorNote,
      };
    } catch (err) {
      return { error: err.message };
    }
  }, [parity1DInput, parity1DMode, injectParity1DError, parity1DErrorType]);

  // ==========================================
  // 2D PARITY COMPUTATIONS
  // ==========================================
  const parity2DResult = useMemo(() => {
    try {
      validateBitString(parity2DInput, '2D Parity input');
      const baseCalc = calculate2DParity(
        parity2DInput,
        parity2DRows,
        parity2DCols,
        parity2DMode
      );

      // Apply any interactive cell flips from user clicks
      const effectiveMatrix = baseCalc.matrix.map((rowArr, r) =>
        rowArr.map((bit, c) => {
          const key = `${r},${c}`;
          return interactiveMatrixOverrides[key] !== undefined
            ? interactiveMatrixOverrides[key]
            : bit;
        })
      );

      // Verify received matrix against transmitted parities
      const verification = verify2DParity(
        effectiveMatrix,
        baseCalc.rowParities,
        baseCalc.colParities,
        baseCalc.cornerParity,
        parity2DMode
      );

      return {
        baseCalc,
        effectiveMatrix,
        verification,
      };
    } catch (err) {
      return { error: err.message };
    }
  }, [
    parity2DInput,
    parity2DRows,
    parity2DCols,
    parity2DMode,
    interactiveMatrixOverrides,
  ]);

  // Helper to toggle bit in 2D parity matrix
  const handleToggleMatrixCell = (r, c) => {
    const key = `${r},${c}`;
    const currentVal =
      interactiveMatrixOverrides[key] !== undefined
        ? interactiveMatrixOverrides[key]
        : parity2DResult.baseCalc.matrix[r][c];
    const toggled = currentVal === '1' ? '0' : '1';
    setInteractiveMatrixOverrides((prev) => ({
      ...prev,
      [key]: toggled,
    }));
  };

  const handleReset2DOverrides = () => {
    setInteractiveMatrixOverrides({});
  };

  return (
    <div>
      {/* ======================================================== */}
      {/* ERROR CONTROL TECHNIQUE SELECTOR */}
      {/* ======================================================== */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h2 className="card-title">Select Error Control Algorithm</h2>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className={`btn ${technique === ERROR_TECHNIQUES.CRC ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTechnique(ERROR_TECHNIQUES.CRC)}
          >
            <span>🔄</span> CRC & Polynomial Division
          </button>
          <button
            className={`btn ${technique === ERROR_TECHNIQUES.CHECKSUM ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTechnique(ERROR_TECHNIQUES.CHECKSUM)}
          >
            <span>➕</span> 16-bit Internet Checksum
          </button>
          <button
            className={`btn ${technique === ERROR_TECHNIQUES.PARITY_1D ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTechnique(ERROR_TECHNIQUES.PARITY_1D)}
          >
            <span>⚖️</span> One-Dimensional Parity
          </button>
          <button
            className={`btn ${technique === ERROR_TECHNIQUES.PARITY_2D ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTechnique(ERROR_TECHNIQUES.PARITY_2D)}
          >
            <span>▦</span> Two-Dimensional Matrix Parity
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODULE 1: CRC & POLYNOMIAL DIVISION */}
      {/* ======================================================== */}
      {technique === ERROR_TECHNIQUES.CRC && (
        <div>
          <div className="card">
            <div
              className="card-header"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div>
                <h2 className="card-title">Cyclic Redundancy Check (CRC) Visualizer</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Modulo-2 polynomial division with step-by-step intermediate XOR traces.
                </p>
              </div>

              {/* Mode Toggle: Educational vs Named Variants */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  className={`btn btn-sm ${crcMode === CRC_MODES.EDUCATIONAL ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCrcMode(CRC_MODES.EDUCATIONAL)}
                >
                  Educational Modulo-2
                </button>
                <button
                  className={`btn btn-sm ${crcMode === CRC_MODES.NAMED_VARIANT ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCrcMode(CRC_MODES.NAMED_VARIANT)}
                >
                  Named Variants (SMBus / CCITT)
                </button>
              </div>
            </div>

            {/* Input Controls */}
            <div className="form-group">
              <label className="form-label">
                {crcMode === CRC_MODES.EDUCATIONAL
                  ? isCrcTextMode
                    ? 'Message Payload (Text String)'
                    : 'Message Payload (Binary Bit String)'
                  : 'Message Payload (ASCII / UTF-8 Text)'}
              </label>
              <textarea
                className="input-textarea"
                rows={2}
                value={crcInputText}
                onChange={(e) => setCrcInputText(e.target.value)}
                placeholder="Enter bits or text..."
              />

              <div className="samples-bar">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                  Presets:
                </span>
                {crcMode === CRC_MODES.EDUCATIONAL ? (
                  <>
                    <button
                      className="sample-chip"
                      onClick={() => {
                        setCrcInputText('1101011011');
                        setIsCrcTextMode(false);
                        setSelectedGeneratorKey('CRC_4');
                      }}
                    >
                      Textbook 1101011011 (CRC-4)
                    </button>
                    <button
                      className="sample-chip"
                      onClick={() => {
                        setCrcInputText('1010001101');
                        setIsCrcTextMode(false);
                        setSelectedGeneratorKey('CRC_4');
                      }}
                    >
                      Alternate 1010001101
                    </button>
                    <button
                      className="sample-chip"
                      onClick={() => {
                        setCrcInputText('CN');
                        setIsCrcTextMode(true);
                      }}
                    >
                      UTF-8 "CN" (16 bits)
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="sample-chip"
                      onClick={() => {
                        setCrcInputText('123456789');
                        setNamedVariantKey('CRC-8/SMBUS');
                      }}
                    >
                      SMBus Standard Check ("123456789" &rarr; 0xF4)
                    </button>
                    <button
                      className="sample-chip"
                      onClick={() => {
                        setCrcInputText('123456789');
                        setNamedVariantKey('CRC-16/CCITT-FALSE');
                      }}
                    >
                      CCITT-FALSE Check ("123456789" &rarr; 0x29B1)
                    </button>
                    <button
                      className="sample-chip"
                      onClick={() => {
                        setCrcInputText('Computer Networks Semester V');
                        setNamedVariantKey('CRC-16/CCITT-FALSE');
                      }}
                    >
                      Sentence Sample
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Educational Generator Selection */}
            {crcMode === CRC_MODES.EDUCATIONAL ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label className="form-label">Generator Polynomial</label>
                  <select
                    value={selectedGeneratorKey}
                    onChange={(e) => setSelectedGeneratorKey(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <option value="CRC_4">CRC-4: 10011 (x⁴ + x + 1)</option>
                    <option value="CRC_8">CRC-8: 100000111 (x⁸ + x² + x + 1)</option>
                    <option value="CRC_16">CRC-16-CCITT: 10001000000100001 (x¹⁶ + x¹² + x⁵ + 1)</option>
                    <option value="CUSTOM">Custom Generator Polynomial</option>
                  </select>
                </div>

                {selectedGeneratorKey === 'CUSTOM' && (
                  <div>
                    <label className="form-label">Custom Generator Bits (Must start & end with 1)</label>
                    <input
                      type="text"
                      className="input-textarea"
                      style={{ minHeight: '38px', padding: '0.4rem 0.6rem' }}
                      value={customGenerator}
                      onChange={(e) => setCustomGenerator(e.target.value)}
                      placeholder="e.g. 10011"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">Named CRC Variant Specification</label>
                <select
                  value={namedVariantKey}
                  onChange={(e) => setNamedVariantKey(e.target.value)}
                  style={{
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                    padding: '0.5rem 0.8rem',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <option value="CRC-8/SMBUS">CRC-8/SMBUS (Width: 8, Poly: 0x07, Init: 0x00, Check: 0xF4)</option>
                  <option value="CRC-16/CCITT-FALSE">CRC-16/CCITT-FALSE (Width: 16, Poly: 0x1021, Init: 0xFFFF, Check: 0x29B1)</option>
                </select>
              </div>
            )}

            {/* Error Injection Controls */}
            <div
              style={{
                background: 'rgba(244, 63, 94, 0.05)',
                border: '1px solid rgba(244, 63, 94, 0.2)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem 1rem',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem',
                alignItems: 'center',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={injectCrcError}
                  onChange={(e) => setInjectCrcError(e.target.checked)}
                />
                <span style={{ fontWeight: 600, color: injectCrcError ? 'var(--accent-rose)' : 'inherit' }}>
                  Inject Transmission Error
                </span>
              </label>

              {injectCrcError && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Fault Type:</span>
                    <select
                      value={crcErrorType}
                      onChange={(e) => setCrcErrorType(e.target.value)}
                      style={{
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <option value="SINGLE">Single Bit Flip</option>
                      <option value="BURST">Contiguous Burst Error</option>
                      <option value="FCS">Corrupt FCS Field Bit</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Start Bit Index:</span>
                    <input
                      type="number"
                      min={0}
                      value={crcFlipBitIndex}
                      onChange={(e) => setCrcFlipBitIndex(Math.max(0, parseInt(e.target.value) || 0))}
                      style={{
                        width: '60px',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                        padding: '0.2rem 0.4rem',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    />
                  </div>

                  {crcErrorType === 'BURST' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Burst Length (bits):</span>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={crcBurstLength}
                        onChange={(e) => setCrcBurstLength(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          width: '50px',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                          padding: '0.2rem 0.4rem',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* CRC Execution Output */}
          {crcResult.error ? (
            <div className="alert alert-error">{crcResult.error}</div>
          ) : crcResult.mode === CRC_MODES.EDUCATIONAL ? (
            <div>
              {/* Telemetry Grid */}
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Message Length (K)</div>
                  <div className="stat-value">{crcResult.messageBits.length} bits</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Generator Degree (R)</div>
                  <div className="stat-value" style={{ color: 'var(--accent-purple)' }}>
                    {crcResult.degree} bits
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Total Codeword (N)</div>
                  <div className="stat-value">{crcResult.codewordBits.length} bits</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Overhead %</div>
                  <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>
                    {crcResult.overheadPct}%
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Receiver Verification</div>
                  <div className="stat-value">
                    {crcResult.verification.isValid ? (
                      <span className="badge badge-success">ZERO REMAINDER (PASS)</span>
                    ) : (
                      <span
                        className="badge badge-info"
                        style={{ background: 'rgba(244, 63, 94, 0.2)', color: 'var(--accent-rose)' }}
                      >
                        CORRUPT DETECTED (FAIL)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Pipeline: Codeword Representation */}
              <div className="pipeline-container">
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Transmitted Codeword (Message + FCS Remainder)</span>
                    <span className="badge badge-info">FCS: {crcResult.fcsBits}</span>
                  </div>
                  <div className="stream-display">
                    {crcResult.codewordBits.split('').map((bit, idx) => {
                      const isFcs = idx >= crcResult.messageBits.length;
                      return (
                        <div
                          key={idx}
                          className={`bit-cell ${isFcs ? 'cell-esc' : 'cell-normal'}`}
                        >
                          <span>{bit}</span>
                          <span className="cell-label">{isFcs ? `FCS${idx - crcResult.messageBits.length}` : `M${idx}`}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Received Stream & Error Highlighting */}
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Received Stream Across Channel</span>
                    {crcResult.flippedIndices.length > 0 ? (
                      <span className="badge badge-info" style={{ background: 'rgba(244, 63, 94, 0.25)', color: 'var(--accent-rose)' }}>
                        {crcResult.flippedIndices.length} BIT(S) FLIPPED
                      </span>
                    ) : (
                      <span className="badge badge-success">PRISTINE TRANSMISSION</span>
                    )}
                  </div>
                  <div className="stream-display">
                    {crcResult.receivedCodeword.split('').map((bit, idx) => {
                      const isFlipped = crcResult.flippedIndices.includes(idx);
                      const isFcs = idx >= crcResult.messageBits.length;
                      return (
                        <div
                          key={idx}
                          className={`bit-cell ${isFlipped ? 'cell-corrupt' : isFcs ? 'cell-esc' : 'cell-normal'}`}
                        >
                          <span>{bit}</span>
                          <span className="cell-label">{isFlipped ? 'FLIP' : idx}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Step-by-Step Long Division Trace Table */}
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Step-by-Step Modulo-2 Polynomial Long Division</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Generator: {crcResult.generator} | Augmented: {crcResult.messageBits} + {'0'.repeat(crcResult.degree)}
                    </span>
                  </div>

                  <div style={{ overflowX: 'auto', maxHeight: '350px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                          <th style={{ padding: '0.4rem 0.6rem' }}>Step</th>
                          <th style={{ padding: '0.4rem 0.6rem' }}>Current Window</th>
                          <th style={{ padding: '0.4rem 0.6rem' }}>Divisor (Generator)</th>
                          <th style={{ padding: '0.4rem 0.6rem' }}>XOR Result</th>
                          <th style={{ padding: '0.4rem 0.6rem' }}>Quotient Bit</th>
                          <th style={{ padding: '0.4rem 0.6rem' }}>Next Bit</th>
                          <th style={{ padding: '0.4rem 0.6rem' }}>Resulting Remainder</th>
                        </tr>
                      </thead>
                      <tbody>
                        {crcResult.steps.map((st) => (
                          <tr
                            key={st.stepIndex}
                            style={{
                              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                              background: st.isXor ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                            }}
                          >
                            <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)' }}>#{st.stepIndex + 1}</td>
                            <td style={{ padding: '0.4rem 0.6rem', color: 'var(--accent-cyan)' }}>{st.currentWindow}</td>
                            <td style={{ padding: '0.4rem 0.6rem', color: st.isXor ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
                              {st.divisor}
                            </td>
                            <td style={{ padding: '0.4rem 0.6rem' }}>{st.xorResult}</td>
                            <td style={{ padding: '0.4rem 0.6rem', fontWeight: 700, color: st.isXor ? 'var(--accent-emerald)' : 'inherit' }}>
                              {st.quotientBit}
                            </td>
                            <td style={{ padding: '0.4rem 0.6rem', color: 'var(--accent-purple)' }}>{st.nextBit ?? '[None]'}</td>
                            <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600 }}>{st.resultingWindow}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                    Final FCS Remainder: <strong style={{ color: 'var(--accent-purple)' }}>{crcResult.fcsBits}</strong> |
                    Quotient: <span style={{ color: 'var(--text-secondary)' }}>{crcResult.quotient}</span>
                  </div>
                </div>

                {/* Receiver Division Verification Box */}
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Receiver Verification Division</span>
                    <span className={`badge ${crcResult.verification.isValid ? 'badge-success' : 'badge-info'}`}>
                      Remainder: {crcResult.verification.remainder}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    The receiver divides the complete received codeword ({crcResult.receivedCodeword}) by the generator ({crcResult.generator}).
                  </p>
                  {crcResult.verification.isValid ? (
                    <div className="alert alert-success" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: 'var(--accent-emerald)' }}>
                      ✓ Remainder is exactly {crcResult.verification.remainder} (Zero). Frame is mathematically verified intact with no detected transmission errors.
                    </div>
                  ) : (
                    <div className="alert alert-error">
                      ⚠ Transmission error detected! Non-zero remainder ({crcResult.verification.remainder}) violates generator polynomial congruence. Frame will be discarded.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Named CRC Variant Display */
            <div>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Variant Name</div>
                  <div className="stat-value" style={{ fontSize: '1rem', color: 'var(--accent-cyan)' }}>
                    {crcResult.variantName}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Polynomial (Hex)</div>
                  <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>
                    0x{crcResult.variant.poly.toString(16).toUpperCase()}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Initial Register</div>
                  <div className="stat-value" style={{ color: 'var(--accent-purple)' }}>
                    0x{crcResult.variant.init.toString(16).toUpperCase()}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Computed FCS</div>
                  <div className="stat-value" style={{ color: 'var(--accent-emerald)' }}>
                    0x{crcResult.crcHex}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Receiver Check</div>
                  <div className="stat-value">
                    {crcResult.verification.isValid ? (
                      <span className="badge badge-success">MATCH (0x{crcResult.crcHex})</span>
                    ) : (
                      <span className="badge badge-info" style={{ background: 'rgba(244, 63, 94, 0.25)', color: 'var(--accent-rose)' }}>
                        MISMATCH (FAIL)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {crcResult.errorDescription && (
                <div className="alert alert-error" style={{ marginTop: '1rem' }}>
                  {crcResult.errorDescription}
                </div>
              )}

              {/* Per-bit Register Update Trace */}
              <div className="pipeline-step" style={{ marginTop: '1rem' }}>
                <div className="pipeline-step-header">
                  <span className="pipeline-step-title">Per-Bit Register Shift Trace</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Showing first 32 bit operations
                  </span>
                </div>
                <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Byte #</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Bit #</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Bit Val</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>MSB Shifted Out</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Poly Applied</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Register (Hex)</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Register (Binary)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crcResult.trace
                        .filter((t) => t.type === 'BIT_STEP')
                        .slice(0, 32)
                        .map((step, idx) => (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                              background: step.polyApplied ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                            }}
                          >
                            <td style={{ padding: '0.35rem 0.5rem' }}>{step.byteIndex}</td>
                            <td style={{ padding: '0.35rem 0.5rem' }}>{step.bitIndex}</td>
                            <td style={{ padding: '0.35rem 0.5rem' }}>{step.bitValue}</td>
                            <td style={{ padding: '0.35rem 0.5rem', color: step.msbSet ? 'var(--accent-rose)' : 'inherit' }}>
                              {step.msbSet ? '1 (Overflow)' : '0'}
                            </td>
                            <td style={{ padding: '0.35rem 0.5rem', color: step.polyApplied ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
                              {step.polyApplied ? 'XOR 0x' + crcResult.variant.poly.toString(16).toUpperCase() : 'None'}
                            </td>
                            <td style={{ padding: '0.35rem 0.5rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                              0x{step.regHex}
                            </td>
                            <td style={{ padding: '0.35rem 0.5rem', color: 'var(--text-secondary)' }}>
                              {step.regBits}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODULE 2: 16-BIT INTERNET CHECKSUM (RFC 1071) */}
      {/* ======================================================== */}
      {technique === ERROR_TECHNIQUES.CHECKSUM && (
        <div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">16-bit Internet Checksum Visualizer (RFC 1071)</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                One's complement addition of 16-bit big-endian words with end-around carry folding.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Payload Text</label>
              <textarea
                className="input-textarea"
                rows={2}
                value={checksumInput}
                onChange={(e) => setChecksumInput(e.target.value)}
                placeholder="Enter string to checksum..."
              />

              <div className="samples-bar">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                  Presets:
                </span>
                <button
                  className="sample-chip"
                  onClick={() => setChecksumInput('ABCD')}
                >
                  Even Length 4 Bytes ('ABCD' &rarr; 0x7B79)
                </button>
                <button
                  className="sample-chip"
                  onClick={() => setChecksumInput('ABCDE')}
                >
                  Odd Length 5 Bytes ('ABCDE' &rarr; 0x3679 with Pad)
                </button>
                <button
                  className="sample-chip"
                  onClick={() => setChecksumInput('Internet Protocol Version 4')}
                >
                  IPv4 Header Style Text
                </button>
              </div>
            </div>

            {/* Checksum Error Injection */}
            <div
              style={{
                background: 'rgba(244, 63, 94, 0.05)',
                border: '1px solid rgba(244, 63, 94, 0.2)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem 1rem',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem',
                alignItems: 'center',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={injectChecksumError}
                  onChange={(e) => setInjectChecksumError(e.target.checked)}
                />
                <span style={{ fontWeight: 600, color: injectChecksumError ? 'var(--accent-rose)' : 'inherit' }}>
                  Inject Transmission Error
                </span>
              </label>

              {injectChecksumError && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Target Field:</span>
                    <select
                      value={checksumErrorTarget}
                      onChange={(e) => setChecksumErrorTarget(e.target.value)}
                      style={{
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <option value="PAYLOAD">Corrupt Payload Data Byte</option>
                      <option value="CHECKSUM">Corrupt Transmitted Checksum Word</option>
                    </select>
                  </div>

                  {checksumErrorTarget === 'PAYLOAD' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Byte Index:</span>
                      <input
                        type="number"
                        min={0}
                        value={checksumCorruptByteIndex}
                        onChange={(e) => setChecksumCorruptByteIndex(Math.max(0, parseInt(e.target.value) || 0))}
                        style={{
                          width: '60px',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                          padding: '0.2rem 0.4rem',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Checksum Result Display */}
          {checksumResult.error ? (
            <div className="alert alert-error">{checksumResult.error}</div>
          ) : (
            <div>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Payload Size</div>
                  <div className="stat-value">{checksumResult.calc.bytes.length} bytes</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">16-Bit Word Count</div>
                  <div className="stat-value" style={{ color: 'var(--accent-cyan)' }}>
                    {checksumResult.calc.words.length} words
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Odd Length Zero-Pad</div>
                  <div className="stat-value" style={{ color: checksumResult.calc.hasPadding ? 'var(--accent-amber)' : 'inherit' }}>
                    {checksumResult.calc.hasPadding ? 'Padded (+0x00)' : 'None'}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Computed Checksum</div>
                  <div className="stat-value" style={{ color: 'var(--accent-emerald)' }}>
                    {checksumResult.calc.checksumHex}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Receiver Sum</div>
                  <div className="stat-value">
                    {checksumResult.verification.isValid ? (
                      <span className="badge badge-success">0xFFFF (PASS)</span>
                    ) : (
                      <span className="badge badge-info" style={{ background: 'rgba(244, 63, 94, 0.25)', color: 'var(--accent-rose)' }}>
                        {checksumResult.verification.receiverSumHex} (FAIL)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {checksumResult.errorDescription && (
                <div className="alert alert-error" style={{ marginTop: '1rem' }}>
                  {checksumResult.errorDescription}
                </div>
              )}

              {/* 16-bit Word Breakdown */}
              <div className="pipeline-container">
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">16-Bit Big-Endian Words Breakdown</span>
                    {checksumResult.calc.hasPadding && (
                      <span className="badge badge-info" style={{ background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)' }}>
                        RFC 1071 Right-Hand Zero Pad Applied
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {checksumResult.calc.words.map((w, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          padding: '0.5rem 0.75rem',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Word {idx + 1}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                          {wordToHex(w)}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                          {wordToBin(w)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Step-by-Step 1s Complement Addition Table */}
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Step-by-Step One's Complement Accumulation</span>
                  </div>
                  <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                          <th style={{ padding: '0.4rem 0.5rem' }}>Step</th>
                          <th style={{ padding: '0.4rem 0.5rem' }}>Word Added</th>
                          <th style={{ padding: '0.4rem 0.5rem' }}>Sum Before</th>
                          <th style={{ padding: '0.4rem 0.5rem' }}>Raw Sum</th>
                          <th style={{ padding: '0.4rem 0.5rem' }}>Carry Folded</th>
                          <th style={{ padding: '0.4rem 0.5rem' }}>Accumulated Sum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {checksumResult.calc.steps.map((st) => (
                          <tr key={st.stepIndex} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '0.4rem 0.5rem' }}>#{st.stepIndex}</td>
                            <td style={{ padding: '0.4rem 0.5rem', color: 'var(--accent-cyan)' }}>
                              {st.wordHex} {st.isOddPadWord ? '(Padded)' : ''}
                            </td>
                            <td style={{ padding: '0.4rem 0.5rem' }}>{st.sumBefore}</td>
                            <td style={{ padding: '0.4rem 0.5rem', color: st.hadCarry ? 'var(--accent-amber)' : 'inherit' }}>
                              {st.rawSum}
                            </td>
                            <td style={{ padding: '0.4rem 0.5rem', color: st.hadCarry ? 'var(--accent-rose)' : 'var(--text-muted)' }}>
                              {st.hadCarry ? `+${st.carryValue} Carry` : '0'}
                            </td>
                            <td style={{ padding: '0.4rem 0.5rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                              {st.sumAfterFold}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                    Accumulated Sum: <strong>{wordToHex(checksumResult.calc.finalSum)}</strong> |
                    Bitwise Inverted Checksum (~Sum): <strong style={{ color: 'var(--accent-emerald)' }}>{checksumResult.calc.checksumHex}</strong> ({checksumResult.calc.checksumBin})
                  </div>
                </div>

                {/* Receiver Verification */}
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Receiver Verification Check</span>
                    <span className={`badge ${checksumResult.verification.isValid ? 'badge-success' : 'badge-info'}`}>
                      Receiver Sum: {checksumResult.verification.receiverSumHex}
                    </span>
                  </div>
                  {checksumResult.verification.isValid ? (
                    <div className="alert alert-success" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: 'var(--accent-emerald)' }}>
                      ✓ Receiver sum of all payload words + checksum word equals <strong>0xFFFF</strong> (all 1s, negative zero in 1's complement). Payload integrity verified.
                    </div>
                  ) : (
                    <div className="alert alert-error">
                      ⚠ Checksum verification failed! Receiver sum is <strong>{checksumResult.verification.receiverSumHex}</strong> instead of 0xFFFF. Transmission corruption detected.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODULE 3: ONE-DIMENSIONAL PARITY */}
      {/* ======================================================== */}
      {technique === ERROR_TECHNIQUES.PARITY_1D && (
        <div>
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 className="card-title">One-Dimensional Parity Visualizer</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Single-bit parity checking with demonstration of single-bit detection and 2-bit error evasion.
                </p>
              </div>

              {/* Mode Toggle */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Convention:</span>
                <button
                  className={`btn btn-sm ${parity1DMode === ParityMode.EVEN ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setParity1DMode(ParityMode.EVEN)}
                >
                  Even Parity
                </button>
                <button
                  className={`btn btn-sm ${parity1DMode === ParityMode.ODD ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setParity1DMode(ParityMode.ODD)}
                >
                  Odd Parity
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Binary Data Bits</label>
              <input
                type="text"
                className="input-textarea"
                style={{ minHeight: '38px', padding: '0.4rem 0.6rem' }}
                value={parity1DInput}
                onChange={(e) => setParity1DInput(e.target.value)}
                placeholder="e.g. 1101001"
              />

              <div className="samples-bar">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                  Presets:
                </span>
                <button className="sample-chip" onClick={() => setParity1DInput('1101001')}>
                  1101001 (4 ones)
                </button>
                <button className="sample-chip" onClick={() => setParity1DInput('1101011')}>
                  1101011 (5 ones)
                </button>
                <button className="sample-chip" onClick={() => setParity1DInput('11111111')}>
                  11111111 (8 ones)
                </button>
              </div>
            </div>

            {/* Error Injection */}
            <div
              style={{
                background: 'rgba(244, 63, 94, 0.05)',
                border: '1px solid rgba(244, 63, 94, 0.2)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem 1rem',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem',
                alignItems: 'center',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={injectParity1DError}
                  onChange={(e) => setInjectParity1DError(e.target.checked)}
                />
                <span style={{ fontWeight: 600, color: injectParity1DError ? 'var(--accent-rose)' : 'inherit' }}>
                  Inject Parity Error
                </span>
              </label>

              {injectParity1DError && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Error Scenario:</span>
                  <select
                    value={parity1DErrorType}
                    onChange={(e) => setParity1DErrorType(e.target.value)}
                    style={{
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                      padding: '0.25rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <option value="SINGLE">Single Bit Flip (Guaranteed Detected)</option>
                    <option value="DOUBLE">Two Bit Flips (Undetected - Evasion Demo)</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {parity1DResult.error ? (
            <div className="alert alert-error">{parity1DResult.error}</div>
          ) : (
            <div>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Data 1-Count</div>
                  <div className="stat-value">{parity1DResult.calc.onesCount} ones</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Parity Mode</div>
                  <div className="stat-value" style={{ color: 'var(--accent-cyan)' }}>
                    {parity1DMode}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Generated Parity Bit</div>
                  <div className="stat-value" style={{ color: 'var(--accent-purple)' }}>
                    {parity1DResult.calc.parityBit}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Receiver Status</div>
                  <div className="stat-value">
                    {parity1DResult.verification.isValid ? (
                      <span className="badge badge-success">VALID (PASS)</span>
                    ) : (
                      <span className="badge badge-info" style={{ background: 'rgba(244, 63, 94, 0.25)', color: 'var(--accent-rose)' }}>
                        PARITY ERROR
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {parity1DResult.errorNote && (
                <div className="alert alert-error" style={{ marginTop: '1rem' }}>
                  {parity1DResult.errorNote}
                </div>
              )}

              {/* Codeword Display */}
              <div className="pipeline-container">
                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Transmitted Codeword (Data + Parity Bit)</span>
                  </div>
                  <div className="stream-display">
                    {parity1DResult.calc.codewordBits.split('').map((bit, idx) => {
                      const isParity = idx === parity1DResult.calc.codewordBits.length - 1;
                      return (
                        <div key={idx} className={`bit-cell ${isParity ? 'cell-esc' : 'cell-normal'}`}>
                          <span>{bit}</span>
                          <span className="cell-label">{isParity ? 'PARITY' : `D${idx}`}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pipeline-step">
                  <div className="pipeline-step-header">
                    <span className="pipeline-step-title">Received Codeword</span>
                    {parity1DResult.flippedIndices.length > 0 && (
                      <span className="badge badge-info" style={{ background: 'rgba(244, 63, 94, 0.2)', color: 'var(--accent-rose)' }}>
                        {parity1DResult.flippedIndices.length} BIT(S) INVERTED
                      </span>
                    )}
                  </div>
                  <div className="stream-display">
                    {parity1DResult.receivedCodeword.split('').map((bit, idx) => {
                      const isFlipped = parity1DResult.flippedIndices.includes(idx);
                      const isParity = idx === parity1DResult.receivedCodeword.length - 1;
                      return (
                        <div key={idx} className={`bit-cell ${isFlipped ? 'cell-corrupt' : isParity ? 'cell-esc' : 'cell-normal'}`}>
                          <span>{bit}</span>
                          <span className="cell-label">{isFlipped ? 'FLIP' : isParity ? 'P' : idx}</span>
                        </div>
                      );
                    })}
                  </div>

                  {parity1DErrorType === 'DOUBLE' && injectParity1DError && (
                    <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>
                      ⚠ <strong>Critical Observation for Viva:</strong> Notice that when TWO bits are flipped, the parity of the bit stream changes by an even amount (either +2, 0, or -2 ones). The receiver checks parity and reports <strong>VALID (PASS)</strong> even though data corruption occurred! This proves why 1D parity is inadequate for reliable network communication.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODULE 4: TWO-DIMENSIONAL MATRIX PARITY */}
      {/* ======================================================== */}
      {technique === ERROR_TECHNIQUES.PARITY_2D && (
        <div>
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 className="card-title">Two-Dimensional Matrix Parity Visualizer</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Horizontal row parities + vertical column parities. Interactive click-to-flip cell error localization.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Dimensions:</span>
                <select
                  value={`${parity2DRows}x${parity2DCols}`}
                  onChange={(e) => {
                    const [r, c] = e.target.value.split('x').map(Number);
                    setParity2DRows(r);
                    setParity2DCols(c);
                    setInteractiveMatrixOverrides({});
                  }}
                  style={{
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                    padding: '0.25rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="3x3">3 × 3 (9 bits)</option>
                  <option value="4x4">4 × 4 (16 bits)</option>
                  <option value="4x8">4 × 8 (32 bits)</option>
                </select>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleReset2DOverrides}
                >
                  Reset Bit Flips
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Data Bit String (Padded to {parity2DRows * parity2DCols} bits)</label>
              <input
                type="text"
                className="input-textarea"
                style={{ minHeight: '38px', padding: '0.4rem 0.6rem' }}
                value={parity2DInput}
                onChange={(e) => {
                  setParity2DInput(e.target.value);
                  setInteractiveMatrixOverrides({});
                }}
                placeholder="e.g. 1011010111100010"
              />

              <div className="samples-bar">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                  Presets:
                </span>
                <button
                  className="sample-chip"
                  onClick={() => {
                    setParity2DInput('1011010111100010');
                    setParity2DRows(4);
                    setParity2DCols(4);
                    setInteractiveMatrixOverrides({});
                  }}
                >
                  4×4 Sample 1
                </button>
                <button
                  className="sample-chip"
                  onClick={() => {
                    setParity2DInput('1111000011110000');
                    setParity2DRows(4);
                    setParity2DCols(4);
                    setInteractiveMatrixOverrides({});
                  }}
                >
                  4×4 Alternating Blocks
                </button>
                <button
                  className="sample-chip"
                  onClick={() => {
                    // Simulate 1 bit flip at Row 1, Col 2
                    setInteractiveMatrixOverrides({ '1,2': parity2DResult.baseCalc.matrix[1][2] === '1' ? '0' : '1' });
                  }}
                >
                  Inject 1-Bit Flip (Auto-Localize Demo)
                </button>
                <button
                  className="sample-chip"
                  onClick={() => {
                    // 4-bit rectangular flip (Row 0,1 & Col 0,1) to demonstrate undetected 2D error pattern
                    const m = parity2DResult.baseCalc.matrix;
                    setInteractiveMatrixOverrides({
                      '0,0': m[0][0] === '1' ? '0' : '1',
                      '0,1': m[0][1] === '1' ? '0' : '1',
                      '1,0': m[1][0] === '1' ? '0' : '1',
                      '1,1': m[1][1] === '1' ? '0' : '1',
                    });
                  }}
                >
                  Inject 4-Bit Rectangle (Undetected Pattern Demo)
                </button>
              </div>
            </div>
          </div>

          {parity2DResult.error ? (
            <div className="alert alert-error">{parity2DResult.error}</div>
          ) : (
            <div>
              {/* Diagnosis Alert */}
              <div
                className={`alert ${
                  parity2DResult.verification.isValid
                    ? 'alert-success'
                    : parity2DResult.verification.canCorrect
                    ? 'alert-info'
                    : 'alert-error'
                }`}
                style={{
                  background: parity2DResult.verification.isValid
                    ? 'rgba(16, 185, 129, 0.1)'
                    : parity2DResult.verification.canCorrect
                    ? 'rgba(6, 182, 212, 0.1)'
                    : 'rgba(244, 63, 94, 0.15)',
                  border: `1px solid ${
                    parity2DResult.verification.isValid
                      ? 'rgba(16, 185, 129, 0.3)'
                      : parity2DResult.verification.canCorrect
                      ? 'rgba(6, 182, 212, 0.4)'
                      : 'rgba(244, 63, 94, 0.4)'
                  }`,
                }}
              >
                <span>ℹ️</span>
                <div>
                  <strong>{parity2DResult.verification.diagnosis}</strong>
                  {parity2DResult.verification.canCorrect && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          const err = parity2DResult.verification.localizedError;
                          setInteractiveMatrixOverrides((prev) => ({
                            ...prev,
                            [`${err.row},${err.col}`]: err.correctedVal,
                          }));
                        }}
                      >
                        Auto-Correct Bit at (Row {parity2DResult.verification.localizedError.row + 1}, Col {parity2DResult.verification.localizedError.col + 1})
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Interactive 2D Matrix Grid */}
              <div className="pipeline-step">
                <div className="pipeline-step-header">
                  <span className="pipeline-step-title">Interactive 2D Parity Matrix Grid (Click any data cell to flip its bit)</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Mode: {parity2DMode} | Green/Blue: Parity Bits | Red: Parity Mismatch
                  </span>
                </div>

                <div style={{ overflowX: 'auto', padding: '1rem 0' }}>
                  <table
                    style={{
                      margin: '0 auto',
                      borderCollapse: 'separate',
                      borderSpacing: '6px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ padding: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}></th>
                        {Array.from({ length: parity2DCols }).map((_, c) => {
                          const isColFaulty = parity2DResult.verification.faultyCols.includes(c);
                          return (
                            <th
                              key={c}
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.75rem',
                                color: isColFaulty ? 'var(--accent-rose)' : 'var(--text-secondary)',
                                fontWeight: isColFaulty ? 700 : 400,
                              }}
                            >
                              Col {c + 1}
                              {isColFaulty && <div style={{ fontSize: '0.65rem' }}>FAIL</div>}
                            </th>
                          );
                        })}
                        <th style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--accent-purple)' }}>
                          Row Parity
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parity2DResult.effectiveMatrix.map((rowArr, r) => {
                        const isRowFaulty = parity2DResult.verification.faultyRows.includes(r);
                        return (
                          <tr key={r}>
                            <td
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.75rem',
                                color: isRowFaulty ? 'var(--accent-rose)' : 'var(--text-secondary)',
                                fontWeight: isRowFaulty ? 700 : 400,
                              }}
                            >
                              Row {r + 1}
                              {isRowFaulty && <span style={{ color: 'var(--accent-rose)', marginLeft: '4px' }}>⚠</span>}
                            </td>

                            {/* Data Cells */}
                            {rowArr.map((cellBit, c) => {
                              const isOverridden = interactiveMatrixOverrides[`${r},${c}`] !== undefined;
                              const isLocalized =
                                parity2DResult.verification.localizedError?.row === r &&
                                parity2DResult.verification.localizedError?.col === c;

                              return (
                                <td key={c}>
                                  <button
                                    onClick={() => handleToggleMatrixCell(r, c)}
                                    title={`Row ${r + 1}, Col ${c + 1}: Click to flip`}
                                    style={{
                                      width: '42px',
                                      height: '42px',
                                      fontSize: '1.1rem',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      borderRadius: 'var(--radius-sm)',
                                      border: isLocalized
                                        ? '2px solid var(--accent-cyan)'
                                        : isOverridden
                                        ? '2px solid var(--accent-rose)'
                                        : '1px solid var(--border-subtle)',
                                      background: isLocalized
                                        ? 'rgba(6, 182, 212, 0.25)'
                                        : isOverridden
                                        ? 'rgba(244, 63, 94, 0.25)'
                                        : 'var(--bg-primary)',
                                      color: isOverridden ? 'var(--accent-rose)' : 'var(--text-primary)',
                                      boxShadow: isLocalized ? '0 0 10px rgba(6, 182, 212, 0.5)' : 'none',
                                      transition: 'all 0.15s ease',
                                    }}
                                  >
                                    {cellBit}
                                  </button>
                                </td>
                              );
                            })}

                            {/* Row Parity Cell */}
                            <td>
                              <div
                                style={{
                                  width: '42px',
                                  height: '42px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: '1rem',
                                  fontWeight: 700,
                                  background: isRowFaulty ? 'rgba(244, 63, 94, 0.2)' : 'rgba(139, 92, 246, 0.15)',
                                  color: isRowFaulty ? 'var(--accent-rose)' : 'var(--accent-purple)',
                                  border: `1px solid ${isRowFaulty ? 'var(--accent-rose)' : 'rgba(139, 92, 246, 0.4)'}`,
                                }}
                              >
                                {parity2DResult.baseCalc.rowParities[r]}
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {/* Column Parity Row */}
                      <tr>
                        <td style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
                          Col Parity
                        </td>
                        {parity2DResult.baseCalc.colParities.map((colParity, c) => {
                          const isColFaulty = parity2DResult.verification.faultyCols.includes(c);
                          return (
                            <td key={c}>
                              <div
                                style={{
                                  width: '42px',
                                  height: '42px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: '1rem',
                                  fontWeight: 700,
                                  background: isColFaulty ? 'rgba(244, 63, 94, 0.2)' : 'rgba(6, 182, 212, 0.15)',
                                  color: isColFaulty ? 'var(--accent-rose)' : 'var(--accent-cyan)',
                                  border: `1px solid ${isColFaulty ? 'var(--accent-rose)' : 'rgba(6, 182, 212, 0.4)'}`,
                                }}
                              >
                                {colParity}
                              </div>
                            </td>
                          );
                        })}

                        {/* Corner Parity Cell */}
                        <td>
                          <div
                            style={{
                              width: '42px',
                              height: '42px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '1rem',
                              fontWeight: 700,
                              background: parity2DResult.verification.cornerMismatch
                                ? 'rgba(244, 63, 94, 0.2)'
                                : 'rgba(245, 158, 11, 0.15)',
                              color: parity2DResult.verification.cornerMismatch
                                ? 'var(--accent-rose)'
                                : 'var(--accent-amber)',
                              border: `1px solid ${
                                parity2DResult.verification.cornerMismatch
                                  ? 'var(--accent-rose)'
                                  : 'rgba(245, 158, 11, 0.4)'
                              }`,
                            }}
                            title="Corner Parity (Parity of row/col parities)"
                          >
                            {parity2DResult.baseCalc.cornerParity}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* VIVA HELPER & THEORY PANEL */}
      {/* ======================================================== */}
      <div className="viva-box" style={{ marginTop: '2rem' }}>
        <div className="viva-box-header">
          <div className="viva-title">
            <span>🎓 Viva Helper & Technical Theory Panel (Error Control)</span>
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
            <div className="viva-q">Q1: Why is Error Control implemented at the Data Link Layer when the Physical Layer exists?</div>
            <div className="viva-a">
              The Physical Layer is an analog transmission medium subject to thermal noise, electromagnetic interference, attenuation, and distortion. It simply transmits raw pulses or waveforms without any semantics. The Data Link Layer must transform this raw, error-prone bit stream into a reliable link by framing bits, adding redundancy (FCS/checksum/parity), detecting corruptions, and triggering retransmissions.
            </div>

            <div className="viva-q">Q2: How does Modulo-2 polynomial division differ from ordinary integer division?</div>
            <div className="viva-a">
              Modulo-2 division is performed in the Galois field <strong>GF(2)</strong>. There are <strong>no carries</strong> in addition and <strong>no borrows</strong> in subtraction. Both addition and subtraction are mathematically identical and equivalent to the bitwise <strong>XOR</strong> operation ($0 \oplus 0 = 0$, $0 \oplus 1 = 1$, $1 \oplus 0 = 1$, $1 \oplus 1 = 0$). When the leftmost bit of the active window is 1, we XOR with the generator polynomial; when it is 0, we simply advance.
            </div>

            <div className="viva-q">Q3: What types of transmission errors are guaranteed to be detected by a CRC of degree R?</div>
            <div className="viva-a">
              A CRC polynomial of degree $R$ with a non-zero constant term ($x^0 = 1$) guarantees:
              <ul style={{ paddingLeft: '1.25rem', marginTop: '0.4rem', lineHeight: '1.6' }}>
                <li>All <strong>single-bit errors</strong>.</li>
                <li>All <strong>double-bit errors</strong> as long as the generator does not divide $x^k + 1$ for any $k \le$ frame length.</li>
                <li>Any <strong>odd number of bit errors</strong>, provided the polynomial contains $(x + 1)$ as a factor.</li>
                <li>All <strong>burst errors of length $\le R$</strong> bits.</li>
                <li>A burst error of length $R + 1$ with probability $1 - 2^{-(R - 1)}$.</li>
                <li>Longer burst errors with probability $1 - 2^{-R}$ (e.g. 99.998% detection for CRC-16).</li>
              </ul>
            </div>

            <div className="viva-q">Q4: Why does the 16-bit Internet Checksum sum to 0xFFFF at the receiver instead of 0x0000?</div>
            <div className="viva-a">
              The Internet Checksum (RFC 1071) uses <strong>one's-complement arithmetic</strong>. In one's complement, the negative of a number $S$ is its bitwise complement $\sim S$. When the transmitter sums all payload words to get $S$, it transmits the checksum $C = \sim S$. At the receiver, summing all payload words plus $C$ computes $S + \sim S$. In one's complement addition, adding any number to its bitwise complement always results in all 1s (<code>0xFFFF</code>, which represents negative zero in one's complement).
            </div>

            <div className="viva-q">Q5: Why can 2D Parity localize and correct a single-bit error, but fails on general multi-bit errors?</div>
            <div className="viva-a">
              In Two-Dimensional Parity, a single flipped data bit causes exactly <strong>one row parity mismatch</strong> and <strong>one column parity mismatch</strong>. The intersection $(r, c)$ uniquely pinpoints the faulty bit, enabling single-bit correction. However, if two bits in the same row are flipped, the row parity is unchanged (two flips cancel in modulo-2 arithmetic), but two columns report errors. The receiver knows an error occurred, but cannot determine which rows were affected. Furthermore, a <strong>4-bit rectangular flip pattern</strong> leaves all row and column parities untouched, escaping detection completely.
            </div>

            <div className="viva-q">Q6: What is the difference between Error Detection and Error Correction (FEC)?</div>
            <div className="viva-a">
              <strong>Error Detection</strong> adds minimal redundancy (e.g., 16 or 32 CRC bits) sufficient to detect corruptions, relying on Automatic Repeat reQuest (ARQ) retransmissions when errors occur. <strong>Forward Error Correction (FEC)</strong> (like Hamming or Reed-Solomon codes) adds substantial redundancy so the receiver can reconstruct corrupted bits without retransmission. In wired or low-error links, error detection + ARQ provides far higher throughput and lower overhead than heavy FEC.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
