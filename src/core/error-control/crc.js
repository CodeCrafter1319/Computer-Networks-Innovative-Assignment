/**
 * crc.js
 * 
 * Comprehensive Cyclic Redundancy Check (CRC) Module
 * 
 * Supports:
 * 1. Educational Modulo-2 Polynomial Long Division:
 *    - Configurable binary generator polynomials (e.g. x^4+x+1, CRC-8, CRC-16-CCITT).
 *    - Explicit zero-padding of generator degree (k = poly.length - 1).
 *    - Step-by-step bitwise XOR division trace.
 *    - Codeword generation (Message + FCS).
 *    - Receiver verification: intact codeword produces zero remainder.
 * 
 * 2. Explicitly Parameterized Named CRC Variants:
 *    - CRC-8/SMBUS (Width: 8, Poly: 0x07, Init: 0x00, RefIn: false, RefOut: false, XorOut: 0x00)
 *      Check value for ASCII "123456789": 0xF4
 *    - CRC-16/CCITT-FALSE (Width: 16, Poly: 0x1021, Init: 0xFFFF, RefIn: false, RefOut: false, XorOut: 0x0000)
 *      Check value for ASCII "123456789": 0x29B1
 *    - Per-bit register update execution trace.
 *    - Receiver-side FCS recomputation and comparison.
 */

// Predefined educational generator polynomials
export const STANDARD_GENERATORS = Object.freeze({
  CRC_4: {
    name: 'CRC-4 (x⁴ + x + 1)',
    polyBits: '10011',
    degree: 4,
    description: 'Degree 4 generator polynomial widely used in textbook examples.',
  },
  CRC_8: {
    name: 'CRC-8 (x⁸ + x² + x + 1)',
    polyBits: '100000111',
    degree: 8,
    description: 'Degree 8 polynomial (ATM HEC / SMBus polynomial representation).',
  },
  CRC_16: {
    name: 'CRC-16-CCITT (x¹⁶ + x¹² + x⁵ + 1)',
    polyBits: '10001000000100001',
    degree: 16,
    description: 'Degree 16 CCITT polynomial used in X.25, HDLC, and Bluetooth.',
  },
});

// Explicitly parameterized named CRC specifications
export const NAMED_CRC_VARIANTS = Object.freeze({
  'CRC-8/SMBUS': {
    name: 'CRC-8/SMBUS',
    width: 8,
    poly: 0x07,
    init: 0x00,
    refIn: false,
    refOut: false,
    xorOut: 0x00,
    checkHex: 'F4',
    description: 'Standard SMBus 8-bit CRC. Check value for "123456789" is 0xF4.',
  },
  'CRC-16/CCITT-FALSE': {
    name: 'CRC-16/CCITT-FALSE',
    width: 16,
    poly: 0x1021,
    init: 0xffff,
    refIn: false,
    refOut: false,
    xorOut: 0x0000,
    checkHex: '29B1',
    description: 'Standard 16-bit CCITT without reflection. Check value for "123456789" is 0x29B1.',
  },
});

/**
 * Validate that a string contains only binary '0' and '1' characters.
 * 
 * @param {string} bits 
 * @param {string} [name='Input'] 
 * @throws {Error} If string is invalid or empty.
 */
export function validateBitString(bits, name = 'Input') {
  if (typeof bits !== 'string' || bits.length === 0) {
    throw new Error(`${name} must be a non-empty string of '0' and '1' characters.`);
  }
  if (!/^[01]+$/.test(bits)) {
    throw new Error(`${name} must contain only '0' and '1' characters.`);
  }
}

/**
 * Validate a generator polynomial binary bit string.
 * Must be at least 2 bits, start with '1', and end with '1'.
 * 
 * @param {string} generatorBits 
 * @throws {Error}
 */
export function validateGeneratorPolynomial(generatorBits) {
  validateBitString(generatorBits, 'Generator polynomial');
  if (generatorBits.length < 2) {
    throw new Error('Generator polynomial must have degree >= 1 (length >= 2 bits).');
  }
  if (!generatorBits.startsWith('1')) {
    throw new Error("Generator polynomial must start with '1' (highest degree coefficient must be non-zero).");
  }
  if (!generatorBits.endsWith('1')) {
    throw new Error("Generator polynomial must end with '1' (constant term x⁰ must be non-zero for effective error detection).");
  }
}

/**
 * Convert a UTF-8 string to an 8-bit MSB-first binary string.
 * 
 * @param {string} text 
 * @returns {string}
 */
export function textToBitString(text) {
  if (typeof text !== 'string') {
    throw new Error('Input must be a string.');
  }
  const bytes = new TextEncoder().encode(text);
  return bytesToBitString(bytes);
}

/**
 * Convert a Uint8Array or byte array into an 8-bit MSB-first binary bit string.
 * 
 * @param {Uint8Array|Array<number>} bytes 
 * @returns {string}
 */
export function bytesToBitString(bytes) {
  const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bits = '';
  for (let i = 0; i < uint8.length; i++) {
    bits += uint8[i].toString(2).padStart(8, '0');
  }
  return bits;
}

/**
 * Convert a binary bit string into a Uint8Array.
 * If bit length is not a multiple of 8, left-pads with '0' to the next byte boundary.
 * 
 * @param {string} bitString 
 * @returns {Uint8Array}
 */
export function bitStringToBytes(bitString) {
  validateBitString(bitString, 'Bit string');
  const remainder = bitString.length % 8;
  const padded = remainder === 0 ? bitString : bitString.padStart(bitString.length + (8 - remainder), '0');
  const byteArray = new Uint8Array(padded.length / 8);
  for (let i = 0; i < byteArray.length; i++) {
    byteArray[i] = parseInt(padded.slice(i * 8, (i + 1) * 8), 2);
  }
  return byteArray;
}

/**
 * Perform bitwise XOR between two equal-length binary strings.
 * 
 * @param {string} a 
 * @param {string} b 
 * @returns {string}
 */
export function xorBitStrings(a, b) {
  if (a.length !== b.length) {
    throw new Error(`XOR operands must have identical length (got ${a.length} and ${b.length}).`);
  }
  let res = '';
  for (let i = 0; i < a.length; i++) {
    res += a[i] === b[i] ? '0' : '1';
  }
  return res;
}

// ============================================================================
// PART A: EDUCATIONAL MODULO-2 POLYNOMIAL DIVISION
// ============================================================================

/**
 * Core Modulo-2 binary polynomial long-division algorithm.
 * 
 * Operates on bitstrings directly and records every intermediate shift,
 * XOR alignment, and remainder calculation.
 * 
 * @param {string} dividendBits - The bit string to be divided.
 * @param {string} generatorBits - The generator polynomial bit string.
 * @returns {Object} {
 *   dividendBits: string,
 *   generatorBits: string,
 *   quotient: string,
 *   remainder: string,
 *   steps: Array<Object>
 * }
 */
export function performModulo2Division(dividendBits, generatorBits) {
  validateBitString(dividendBits, 'Dividend');
  validateGeneratorPolynomial(generatorBits);

  const polyLen = generatorBits.length;
  const degree = polyLen - 1;

  if (dividendBits.length < polyLen) {
    // If dividend is shorter than generator, quotient is 0 and remainder is padded dividend
    return {
      dividendBits,
      generatorBits,
      quotient: '0',
      remainder: dividendBits.padStart(degree, '0'),
      steps: [
        {
          stepIndex: 0,
          currentWindow: dividendBits,
          divisor: '0'.repeat(polyLen),
          xorResult: dividendBits,
          quotientBit: '0',
          nextBit: null,
          comment: 'Dividend length is shorter than divisor; quotient is 0.',
        },
      ],
    };
  }

  let quotient = '';
  const steps = [];
  
  // Current working window of bits (length equal to polyLen)
  let currentWindow = dividendBits.slice(0, polyLen);
  let nextBitIndex = polyLen;
  let stepIndex = 0;

  while (true) {
    const isXor = currentWindow[0] === '1';
    const divisor = isXor ? generatorBits : '0'.repeat(polyLen);
    const quotientBit = isXor ? '1' : '0';
    quotient += quotientBit;

    const xorResult = xorBitStrings(currentWindow, divisor);
    
    // In polynomial long division, the leading bit (now 0) is dropped,
    // and the next bit from the dividend is brought down.
    const hasNextBit = nextBitIndex < dividendBits.length;
    const nextBit = hasNextBit ? dividendBits[nextBitIndex] : null;
    const nextWindow = xorResult.slice(1) + (hasNextBit ? nextBit : '');

    steps.push({
      stepIndex: stepIndex++,
      bitIndex: nextBitIndex - 1,
      currentWindow,
      divisor,
      isXor,
      xorResult,
      quotientBit,
      nextBit,
      resultingWindow: nextWindow,
      comment: isXor
        ? `Leading bit is 1: XOR with generator (${generatorBits}). Quotient bit: 1.`
        : `Leading bit is 0: Advance without generator XOR. Quotient bit: 0.`,
    });

    if (!hasNextBit) {
      // Division is complete. The remaining (polyLen - 1) bits form the remainder.
      const remainder = xorResult.slice(1);
      return {
        dividendBits,
        generatorBits,
        quotient,
        remainder,
        steps,
      };
    }

    currentWindow = nextWindow;
    nextBitIndex++;
  }
}

/**
 * Educational CRC Generator.
 * 
 * Takes a message bit string or UTF-8 text, appends `degree` zero bits,
 * performs modulo-2 division by the generator polynomial, extracts the FCS,
 * and forms the transmitted systematic codeword.
 * 
 * @param {string} messageInput - Binary bit string or UTF-8 text.
 * @param {Object} [options={}]
 * @param {string} [options.generator='10011'] - Binary generator polynomial string.
 * @param {boolean} [options.isTextInput=false] - Whether messageInput is raw text to convert to bits.
 * @returns {Object}
 */
export function generateEducationalCrc(messageInput, options = {}) {
  const generator = options.generator || STANDARD_GENERATORS.CRC_4.polyBits;
  validateGeneratorPolynomial(generator);

  const degree = generator.length - 1;
  const messageBits = options.isTextInput
    ? textToBitString(messageInput)
    : messageInput;

  validateBitString(messageBits, 'Message payload bits');

  // Systematic CRC: Append k zeros to the original message
  const zerosPadding = '0'.repeat(degree);
  const augmentedBits = messageBits + zerosPadding;

  const divisionResult = performModulo2Division(augmentedBits, generator);
  const fcsBits = divisionResult.remainder;
  const codewordBits = messageBits + fcsBits;

  return {
    messageBits,
    generator,
    degree,
    augmentedBits,
    quotient: divisionResult.quotient,
    fcsBits,
    codewordBits,
    steps: divisionResult.steps,
    totalSteps: divisionResult.steps.length,
  };
}

/**
 * Educational CRC Receiver Verification.
 * 
 * Divides the complete received codeword by the generator polynomial.
 * An intact transmission produces a zero remainder.
 * 
 * @param {string} receivedCodewordBits - The complete received bit string (Data + FCS).
 * @param {string} generator - Binary generator polynomial.
 * @returns {Object} {
 *   isValid: boolean,
 *   remainder: string,
 *   isZeroRemainder: boolean,
 *   receivedCodewordBits: string,
 *   generator: string,
 *   steps: Array<Object>,
 *   errorMessage: string|null
 * }
 */
export function verifyEducationalCrc(receivedCodewordBits, generator) {
  validateBitString(receivedCodewordBits, 'Received codeword bits');
  validateGeneratorPolynomial(generator);

  const degree = generator.length - 1;
  if (receivedCodewordBits.length <= degree) {
    return {
      isValid: false,
      remainder: '',
      isZeroRemainder: false,
      receivedCodewordBits,
      generator,
      steps: [],
      errorMessage: `Codeword length (${receivedCodewordBits.length}) must exceed generator degree (${degree}).`,
    };
  }

  const divisionResult = performModulo2Division(receivedCodewordBits, generator);
  const isZeroRemainder = /^0+$/.test(divisionResult.remainder);

  return {
    isValid: isZeroRemainder,
    remainder: divisionResult.remainder,
    isZeroRemainder,
    receivedCodewordBits,
    generator,
    steps: divisionResult.steps,
    errorMessage: isZeroRemainder
      ? null
      : `CRC check failed: non-zero remainder (${divisionResult.remainder}) indicates transmission corruption.`,
  };
}

// ============================================================================
// PART B: EXPLICITLY PARAMETERIZED NAMED CRC VARIANTS
// ============================================================================

/**
 * Compute an explicitly parameterized standard CRC variant.
 * 
 * Implements the standard bit-by-bit shift register model (non-reflected):
 * - Register initialized to `variant.init`.
 * - Top bit of byte aligned with MSB of register.
 * - Shift left by 1; if top bit before shift was 1, XOR with `variant.poly`.
 * - Final register XORed with `variant.xorOut`.
 * 
 * Returns full execution trace with per-bit register updates.
 * 
 * @param {string|Uint8Array|Array<number>} input - Text string or byte array.
 * @param {string} [variantName='CRC-16/CCITT-FALSE'] - Key in NAMED_CRC_VARIANTS.
 * @returns {Object} {
 *   variantName: string,
 *   variant: Object,
 *   payloadBytes: Uint8Array,
 *   crcInt: number,
 *   crcHex: string,
 *   crcBits: string,
 *   trace: Array<Object>
 * }
 */
export function computeNamedCrc(input, variantName = 'CRC-16/CCITT-FALSE') {
  const variant = NAMED_CRC_VARIANTS[variantName];
  if (!variant) {
    throw new Error(
      `Unknown named CRC variant '${variantName}'. Supported: ${Object.keys(NAMED_CRC_VARIANTS).join(', ')}`
    );
  }

  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
      ? input
      : new Uint8Array(input);

  const { width, poly, init, xorOut } = variant;
  const mask = ((1 << width) - 1) >>> 0;
  const topBit = (1 << (width - 1)) >>> 0;

  let reg = init & mask;
  const trace = [];

  for (let byteIdx = 0; byteIdx < bytes.length; byteIdx++) {
    const byteVal = bytes[byteIdx];

    // In MSB-first non-reflected mode, XOR byte into MSB of register
    const regBeforeByte = reg;
    reg = (reg ^ (byteVal << (width - 8))) & mask;

    trace.push({
      type: 'BYTE_START',
      byteIndex: byteIdx,
      byteValue: byteVal,
      byteHex: '0x' + byteVal.toString(16).toUpperCase().padStart(2, '0'),
      regBefore: regBeforeByte,
      regAfterByteXor: reg,
      regHex: reg.toString(16).toUpperCase().padStart(width / 4, '0'),
    });

    for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
      const bitVal = (byteVal >> (7 - bitIdx)) & 1;
      const msbSet = (reg & topBit) !== 0;
      const regBeforeShift = reg;

      if (msbSet) {
        reg = (((reg << 1) & mask) ^ poly) & mask;
      } else {
        reg = (reg << 1) & mask;
      }

      trace.push({
        type: 'BIT_STEP',
        byteIndex: byteIdx,
        bitIndex: bitIdx,
        bitValue: bitVal,
        msbSet,
        regBefore: regBeforeShift,
        regAfter: reg,
        polyApplied: msbSet,
        regHex: reg.toString(16).toUpperCase().padStart(width / 4, '0'),
        regBits: reg.toString(2).padStart(width, '0'),
      });
    }
  }

  const finalCrc = (reg ^ xorOut) & mask;
  const hexWidth = width / 4;
  const crcHex = finalCrc.toString(16).toUpperCase().padStart(hexWidth, '0');
  const crcBits = finalCrc.toString(2).padStart(width, '0');

  return {
    variantName,
    variant: { ...variant },
    payloadBytes: bytes,
    crcInt: finalCrc,
    crcHex,
    crcBits,
    trace,
  };
}

/**
 * Receiver verification for named CRC variants.
 * 
 * Separates the received payload and received FCS, recomputes the expected
 * CRC using the exact specified variant, and verifies match.
 * 
 * @param {string|Uint8Array|Array<number>} receivedPayload - Received payload data.
 * @param {number|string} receivedFcs - Received FCS as integer or hex string (e.g. 0xF4, 'F4', '0xF4').
 * @param {string} [variantName='CRC-16/CCITT-FALSE']
 * @returns {Object} {
 *   isValid: boolean,
 *   variantName: string,
 *   computedFcsHex: string,
 *   receivedFcsHex: string,
 *   errorMessage: string|null
 * }
 */
export function verifyNamedCrc(receivedPayload, receivedFcs, variantName = 'CRC-16/CCITT-FALSE') {
  const variant = NAMED_CRC_VARIANTS[variantName];
  if (!variant) {
    throw new Error(`Unknown named CRC variant '${variantName}'.`);
  }

  const computed = computeNamedCrc(receivedPayload, variantName);
  const hexWidth = variant.width / 4;

  let cleanRxHex = '';
  if (typeof receivedFcs === 'number') {
    cleanRxHex = (receivedFcs & ((1 << variant.width) - 1))
      .toString(16)
      .toUpperCase()
      .padStart(hexWidth, '0');
  } else if (typeof receivedFcs === 'string') {
    cleanRxHex = receivedFcs.trim().replace(/^0x/i, '').toUpperCase().padStart(hexWidth, '0');
  } else {
    throw new Error('receivedFcs must be a hex string or integer.');
  }

  const isValid = computed.crcHex === cleanRxHex;

  return {
    isValid,
    variantName,
    computedFcsHex: computed.crcHex,
    receivedFcsHex: cleanRxHex,
    errorMessage: isValid
      ? null
      : `CRC mismatch detected under ${variantName}: computed 0x${computed.crcHex}, received 0x${cleanRxHex}.`,
  };
}
