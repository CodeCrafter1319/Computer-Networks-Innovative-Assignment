/**
 * parity.js
 * 
 * One-Dimensional and Two-Dimensional Parity Implementation
 * 
 * Core Features:
 * 1. 1D Parity (Vertical Redundancy Check):
 *    - Even Parity: Total 1s (including parity bit) is even.
 *    - Odd Parity: Total 1s (including parity bit) is odd.
 *    - Detects all single-bit errors and any odd number of bit errors.
 *    - Fails to detect any even number of bit errors (e.g. 2 bit flips).
 * 
 * 2. 2D Parity (Matrix / Longitudinal & Vertical Redundancy Check):
 *    - Data bits arranged in a configurable R x C matrix.
 *    - Horizontal row parities + vertical column parities + overall corner parity.
 *    - Single-bit error localization: Exact row and column intersection (r, c).
 *    - Error detection limits: Multi-bit error patterns (e.g. 4-bit rectangular flips)
 *      can evade detection; 2D parity is NOT a universal forward error correction method.
 */

import { validateBitString } from './crc.js';

export const ParityMode = Object.freeze({
  EVEN: 'EVEN',
  ODD: 'ODD',
});

/**
 * Count the number of '1' bits in a binary bit string or array.
 * 
 * @param {string|Array<number|string>} bits 
 * @returns {number}
 */
export function countOnes(bits) {
  let count = 0;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1' || bits[i] === 1) {
      count++;
    }
  }
  return count;
}

// ============================================================================
// PART A: ONE-DIMENSIONAL PARITY
// ============================================================================

/**
 * Calculate a single 1D parity bit for a bit string.
 * 
 * @param {string} dataBits - Binary string of data bits.
 * @param {string} [mode=ParityMode.EVEN] - EVEN or ODD.
 * @returns {Object} {
 *   dataBits: string,
 *   mode: string,
 *   onesCount: number,
 *   parityBit: string,
 *   codewordBits: string
 * }
 */
export function calculate1DParity(dataBits, mode = ParityMode.EVEN) {
  validateBitString(dataBits, 'Data bits');

  const ones = countOnes(dataBits);
  let parityBit = '0';

  if (mode === ParityMode.EVEN) {
    // Even parity: ones count including parity bit must be even
    parityBit = ones % 2 === 0 ? '0' : '1';
  } else if (mode === ParityMode.ODD) {
    // Odd parity: ones count including parity bit must be odd
    parityBit = ones % 2 === 0 ? '1' : '0';
  } else {
    throw new Error(`Invalid parity mode '${mode}'. Use 'EVEN' or 'ODD'.`);
  }

  return {
    dataBits,
    mode,
    onesCount: ones,
    parityBit,
    codewordBits: dataBits + parityBit,
  };
}

/**
 * Receiver verification of a 1D parity codeword.
 * 
 * @param {string} receivedCodewordBits - Received bits including parity bit at end.
 * @param {string} [mode=ParityMode.EVEN] - EVEN or ODD.
 * @returns {Object} {
 *   isValid: boolean,
 *   dataBits: string,
 *   receivedParityBit: string,
 *   recalculatedParityBit: string,
 *   totalOnes: number,
 *   mode: string,
 *   errorMessage: string|null
 * }
 */
export function verify1DParity(receivedCodewordBits, mode = ParityMode.EVEN) {
  validateBitString(receivedCodewordBits, 'Received codeword bits');

  if (receivedCodewordBits.length < 2) {
    throw new Error('Received codeword must contain at least 1 data bit and 1 parity bit.');
  }

  const dataBits = receivedCodewordBits.slice(0, -1);
  const receivedParityBit = receivedCodewordBits.slice(-1);
  const totalOnes = countOnes(receivedCodewordBits);

  const calc = calculate1DParity(dataBits, mode);
  const recalculatedParityBit = calc.parityBit;

  const isValid = receivedParityBit === recalculatedParityBit;

  return {
    isValid,
    dataBits,
    receivedParityBit,
    recalculatedParityBit,
    totalOnes,
    mode,
    errorMessage: isValid
      ? null
      : `Parity violation in ${mode} mode: expected parity bit '${recalculatedParityBit}', received '${receivedParityBit}' (total 1s: ${totalOnes}).`,
  };
}

// ============================================================================
// PART B: TWO-DIMENSIONAL PARITY (MATRIX PARITY)
// ============================================================================

/**
 * Calculate Two-Dimensional Parity for a rectangular matrix of bits.
 * 
 * @param {string} dataBits - Binary bit string.
 * @param {number} [rows=4] - Number of rows.
 * @param {number} [cols=4] - Number of columns.
 * @param {string} [mode=ParityMode.EVEN] - EVEN or ODD.
 * @returns {Object} {
 *   originalBits: string,
 *   paddedBits: string,
 *   rows: number,
 *   cols: number,
 *   mode: string,
 *   matrix: Array<Array<string>>,
 *   rowParities: Array<string>,
 *   colParities: Array<string>,
 *   cornerParity: string,
 *   transmittedCodeword: string,
 *   totalTransmittedBits: number
 * }
 */
export function calculate2DParity(dataBits, rows = 4, cols = 4, mode = ParityMode.EVEN) {
  validateBitString(dataBits, 'Data bits');

  if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(cols) || cols < 1) {
    throw new Error('Matrix dimensions rows and cols must be positive integers.');
  }

  const targetSize = rows * cols;
  let paddedBits = dataBits;
  if (paddedBits.length < targetSize) {
    // Zero-pad to complete matrix
    paddedBits = paddedBits.padEnd(targetSize, '0');
  } else if (paddedBits.length > targetSize) {
    // Truncate to target size for matrix display
    paddedBits = paddedBits.slice(0, targetSize);
  }

  // Construct R x C matrix
  const matrix = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push(paddedBits[r * cols + c]);
    }
    matrix.push(row);
  }

  // Calculate row parities (Horizontal Parity)
  const rowParities = [];
  for (let r = 0; r < rows; r++) {
    const rowStr = matrix[r].join('');
    rowParities.push(calculate1DParity(rowStr, mode).parityBit);
  }

  // Calculate column parities (Longitudinal Parity)
  const colParities = [];
  for (let c = 0; c < cols; c++) {
    let colStr = '';
    for (let r = 0; r < rows; r++) {
      colStr += matrix[r][c];
    }
    colParities.push(calculate1DParity(colStr, mode).parityBit);
  }

  // Corner parity bit (parity of row parities or col parities)
  const cornerParity = calculate1DParity(rowParities.join(''), mode).parityBit;

  // Transmitted codeword representation:
  // Data matrix bits + Row parities + Column parities + Corner parity
  const transmittedCodeword =
    paddedBits + rowParities.join('') + colParities.join('') + cornerParity;

  return {
    originalBits: dataBits,
    paddedBits,
    rows,
    cols,
    mode,
    matrix,
    rowParities,
    colParities,
    cornerParity,
    transmittedCodeword,
    totalTransmittedBits: transmittedCodeword.length,
  };
}

/**
 * Receiver verification for Two-Dimensional Parity.
 * 
 * Detects parity mismatches across rows and columns.
 * If exactly one row and one column report a parity mismatch, the corrupted
 * bit is uniquely localized to the intersection cell (r, c).
 * 
 * @param {Array<Array<string>>} receivedMatrix - R x C matrix of '0'/'1' bits.
 * @param {Array<string>} receivedRowParities - Array of R row parity bits.
 * @param {Array<string>} receivedColParities - Array of C column parity bits.
 * @param {string} receivedCornerParity - Corner parity bit.
 * @param {string} [mode=ParityMode.EVEN] - EVEN or ODD.
 * @returns {Object} {
 *   isValid: boolean,
 *   hasError: boolean,
 *   faultyRows: Array<number>,
 *   faultyCols: Array<number>,
 *   cornerMismatch: boolean,
 *   localizedError: Object|null,
 *   canCorrect: boolean,
 *   correctedMatrix: Array<Array<string>>|null,
 *   mode: string,
 *   diagnosis: string
 * }
 */
export function verify2DParity(
  receivedMatrix,
  receivedRowParities,
  receivedColParities,
  receivedCornerParity,
  mode = ParityMode.EVEN
) {
  const rows = receivedMatrix.length;
  const cols = receivedMatrix[0].length;

  const faultyRows = [];
  const recalculatedRowParities = [];
  for (let r = 0; r < rows; r++) {
    const rowStr = receivedMatrix[r].join('');
    const calc = calculate1DParity(rowStr, mode).parityBit;
    recalculatedRowParities.push(calc);
    if (calc !== receivedRowParities[r]) {
      faultyRows.push(r);
    }
  }

  const faultyCols = [];
  const recalculatedColParities = [];
  for (let c = 0; c < cols; c++) {
    let colStr = '';
    for (let r = 0; r < rows; r++) {
      colStr += receivedMatrix[r][c];
    }
    const calc = calculate1DParity(colStr, mode).parityBit;
    recalculatedColParities.push(calc);
    if (calc !== receivedColParities[c]) {
      faultyCols.push(c);
    }
  }

  const recalculatedCorner = calculate1DParity(
    recalculatedRowParities.join(''),
    mode
  ).parityBit;
  const cornerMismatch = recalculatedCorner !== receivedCornerParity;

  const hasError = faultyRows.length > 0 || faultyCols.length > 0 || cornerMismatch;

  let localizedError = null;
  let canCorrect = false;
  let correctedMatrix = null;
  let diagnosis = '';

  if (!hasError) {
    diagnosis = 'All row, column, and corner parities match. No error detected.';
  } else if (faultyRows.length === 1 && faultyCols.length === 1) {
    // Single data bit corruption localized at (faultyRows[0], faultyCols[0])
    const errRow = faultyRows[0];
    const errCol = faultyCols[0];
    localizedError = {
      type: 'DATA_BIT',
      row: errRow,
      col: errCol,
      originalVal: receivedMatrix[errRow][errCol],
      correctedVal: receivedMatrix[errRow][errCol] === '1' ? '0' : '1',
    };
    canCorrect = true;

    // Create corrected matrix copy
    correctedMatrix = receivedMatrix.map((rowArr) => [...rowArr]);
    correctedMatrix[errRow][errCol] = localizedError.correctedVal;
    diagnosis = `Single-bit error localized at Row ${errRow + 1}, Col ${errCol + 1} (intersection of parity failures). Bit successfully inverted.`;
  } else if (faultyRows.length === 1 && faultyCols.length === 0) {
    localizedError = {
      type: 'ROW_PARITY_BIT',
      row: faultyRows[0],
      col: null,
    };
    diagnosis = `Row parity bit for Row ${faultyRows[0] + 1} is corrupted; payload data matrix is intact.`;
  } else if (faultyRows.length === 0 && faultyCols.length === 1) {
    localizedError = {
      type: 'COL_PARITY_BIT',
      row: null,
      col: faultyCols[0],
    };
    diagnosis = `Column parity bit for Col ${faultyCols[0] + 1} is corrupted; payload data matrix is intact.`;
  } else if (faultyRows.length === 0 && faultyCols.length === 0 && cornerMismatch) {
    localizedError = {
      type: 'CORNER_PARITY_BIT',
      row: null,
      col: null,
    };
    diagnosis = 'Corner parity bit is corrupted; all payload data and row/col parities are intact.';
  } else {
    // Multi-bit corruption
    diagnosis = `Multi-bit corruption detected (${faultyRows.length} faulty rows, ${faultyCols.length} faulty cols). Ambiguous error pattern cannot be uniquely corrected by 2D parity.`;
  }

  return {
    isValid: !hasError,
    hasError,
    rows,
    cols,
    faultyRows,
    faultyCols,
    recalculatedRowParities,
    recalculatedColParities,
    cornerMismatch,
    localizedError,
    canCorrect,
    correctedMatrix,
    mode,
    diagnosis,
  };
}
