/**
 * errorInjection.js
 * 
 * Deterministic, Controlled Transmission Error Injection
 * 
 * Supports:
 * 1. Single Bit Flip: Invert a specific bit at a designated index.
 * 2. Contiguous Burst Flip: Invert a block of B consecutive bits starting at index S.
 * 3. Field-Isolated Corruption: Corrupt the FCS/checksum field independently of the payload.
 * 4. Error Mask Generation: Compute exact bitwise error mask (E = Transmitted XOR Received).
 */

import { validateBitString, xorBitStrings } from './crc.js';

/**
 * Invert a single bit ('0' -> '1', '1' -> '0') in a binary string.
 * 
 * @param {string} bitString 
 * @param {number} index - 0-indexed position.
 * @returns {string}
 */
export function flipBitAt(bitString, index) {
  validateBitString(bitString, 'Bit string');
  if (index < 0 || index >= bitString.length) {
    throw new Error(`Bit index ${index} out of bounds (length ${bitString.length}).`);
  }
  const current = bitString[index];
  const inverted = current === '1' ? '0' : '1';
  return bitString.substring(0, index) + inverted + bitString.substring(index + 1);
}

/**
 * Inject a contiguous burst of bit flips into a binary string.
 * 
 * @param {string} bitString 
 * @param {number} startIndex - 0-indexed start position.
 * @param {number} burstLength - Number of contiguous bits to invert.
 * @returns {string}
 */
export function injectBurstError(bitString, startIndex, burstLength) {
  validateBitString(bitString, 'Bit string');
  if (startIndex < 0 || startIndex >= bitString.length) {
    throw new Error(`Burst start index ${startIndex} out of bounds (length ${bitString.length}).`);
  }
  if (!Number.isInteger(burstLength) || burstLength < 1) {
    throw new Error('burstLength must be a positive integer.');
  }

  const endIndex = Math.min(bitString.length, startIndex + burstLength);
  let result = bitString.substring(0, startIndex);
  for (let i = startIndex; i < endIndex; i++) {
    result += bitString[i] === '1' ? '0' : '1';
  }
  result += bitString.substring(endIndex);
  return result;
}

/**
 * Apply deterministic, configurable corruption to a bit string.
 * 
 * @param {string} bitString - Original binary string.
 * @param {Object} options
 * @param {string} [options.type='SINGLE'] - 'NONE' | 'SINGLE' | 'BURST' | 'CUSTOM'
 * @param {number} [options.bitIndex=0] - For SINGLE bit flip.
 * @param {number} [options.startIndex=0] - For BURST error.
 * @param {number} [options.burstLength=3] - For BURST error.
 * @param {Array<number>} [options.customIndices=[]] - For CUSTOM error pattern.
 * @returns {Object} {
 *   originalBits: string,
 *   corruptedBits: string,
 *   flippedIndices: Array<number>,
 *   errorMask: string,
 *   bitErrorCount: number,
 *   isCorrupted: boolean
 * }
 */
export function corruptBitString(bitString, options = {}) {
  validateBitString(bitString, 'Bit string');
  const type = options.type || 'SINGLE';

  let corrupted = bitString;
  const flippedSet = new Set();

  if (type === 'NONE') {
    // Intact pass-through
  } else if (type === 'SINGLE') {
    const idx = options.bitIndex ?? 0;
    if (idx >= 0 && idx < bitString.length) {
      corrupted = flipBitAt(corrupted, idx);
      flippedSet.add(idx);
    }
  } else if (type === 'BURST') {
    const start = Math.max(0, Math.min(options.startIndex ?? 0, bitString.length - 1));
    const len = Math.max(1, options.burstLength ?? 3);
    const end = Math.min(bitString.length, start + len);
    for (let i = start; i < end; i++) {
      flippedSet.add(i);
    }
    corrupted = injectBurstError(bitString, start, len);
  } else if (type === 'CUSTOM') {
    const indices = options.customIndices || [];
    for (const idx of indices) {
      if (idx >= 0 && idx < bitString.length) {
        flippedSet.add(idx);
      }
    }
    let chars = bitString.split('');
    for (const idx of flippedSet) {
      chars[idx] = chars[idx] === '1' ? '0' : '1';
    }
    corrupted = chars.join('');
  }

  const flippedIndices = Array.from(flippedSet).sort((a, b) => a - b);
  const errorMask = xorBitStrings(bitString, corrupted);

  return {
    originalBits: bitString,
    corruptedBits: corrupted,
    flippedIndices,
    errorMask,
    bitErrorCount: flippedIndices.length,
    isCorrupted: flippedIndices.length > 0,
  };
}

/**
 * Corrupt a payload and/or FCS field independently.
 * 
 * @param {string} payloadBits 
 * @param {string} fcsBits 
 * @param {Object} options
 * @param {'PAYLOAD'|'FCS'|'BOTH'|'NONE'} [options.target='PAYLOAD']
 * @param {number} [options.payloadBitIndex=0]
 * @param {number} [options.fcsBitIndex=0]
 * @returns {Object}
 */
export function corruptTransmittedFields(payloadBits, fcsBits, options = {}) {
  const target = options.target || 'PAYLOAD';

  let curPayload = payloadBits;
  let curFcs = fcsBits;
  const flippedPayloadIndices = [];
  const flippedFcsIndices = [];

  if (target === 'PAYLOAD' || target === 'BOTH') {
    const pIdx = Math.max(0, Math.min(options.payloadBitIndex ?? 0, payloadBits.length - 1));
    curPayload = flipBitAt(curPayload, pIdx);
    flippedPayloadIndices.push(pIdx);
  }

  if (target === 'FCS' || target === 'BOTH') {
    const fIdx = Math.max(0, Math.min(options.fcsBitIndex ?? 0, fcsBits.length - 1));
    curFcs = flipBitAt(curFcs, fIdx);
    flippedFcsIndices.push(fIdx);
  }

  return {
    originalPayload: payloadBits,
    originalFcs: fcsBits,
    originalCodeword: payloadBits + fcsBits,
    corruptedPayload: curPayload,
    corruptedFcs: curFcs,
    corruptedCodeword: curPayload + curFcs,
    target,
    flippedPayloadIndices,
    flippedFcsIndices,
    isCorrupted: flippedPayloadIndices.length > 0 || flippedFcsIndices.length > 0,
  };
}
