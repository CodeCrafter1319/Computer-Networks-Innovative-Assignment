/**
 * errorControl.test.js
 * 
 * Comprehensive automated test suite for Layer-2 Error Control algorithms:
 * 1. Educational Modulo-2 Polynomial Long Division & Systematic CRC
 * 2. Named Parameterized CRC Variants (CRC-8/SMBUS & CRC-16/CCITT-FALSE)
 * 3. 16-bit Internet Checksum (RFC 1071 with odd padding & end-around carries)
 * 4. 1D and 2D Parity (VRC, LRC, Single-Bit Localization, Multi-Bit Evasion)
 * 5. Deterministic Controlled Error Injection & Channel Integration
 */

import { describe, it, expect } from 'vitest';
import {
  STANDARD_GENERATORS,
  NAMED_CRC_VARIANTS,
  validateBitString,
  validateGeneratorPolynomial,
  textToBitString,
  bytesToBitString,
  bitStringToBytes,
  xorBitStrings,
  performModulo2Division,
  generateEducationalCrc,
  verifyEducationalCrc,
  computeNamedCrc,
  verifyNamedCrc,
} from '../core/error-control/crc.js';
import {
  wordToHex,
  wordToBin,
  payloadTo16BitWords,
  calculateInternetChecksum,
  verifyInternetChecksum,
} from '../core/error-control/checksum.js';
import {
  ParityMode,
  countOnes,
  calculate1DParity,
  verify1DParity,
  calculate2DParity,
  verify2DParity,
} from '../core/error-control/parity.js';
import {
  flipBitAt,
  injectBurstError,
  corruptBitString,
  corruptTransmittedFields,
} from '../core/error-control/errorInjection.js';
import { SimulationEngine } from '../core/engine/SimulationEngine.js';
import { Channel } from '../core/engine/Channel.js';
import React from 'react';
import { renderToString } from 'react-dom/server';
import ErrorControlView from '../ui/modules/ErrorControlView.jsx';
import App from '../ui/App.jsx';

// ============================================================================
// 1. EDUCATIONAL CRC & MODULO-2 DIVISION
// ============================================================================
describe('Educational Modulo-2 Polynomial Division & CRC', () => {
  it('validates binary bit strings correctly', () => {
    expect(() => validateBitString('10101')).not.toThrow();
    expect(() => validateBitString('')).toThrow(/non-empty/i);
    expect(() => validateBitString('10201')).toThrow(/only '0' and '1'/i);
    expect(() => validateBitString('abc')).toThrow(/only '0' and '1'/i);
  });

  it('validates generator polynomials according to mathematical requirements', () => {
    // Valid polynomials
    expect(() => validateGeneratorPolynomial('10011')).not.toThrow();
    expect(() => validateGeneratorPolynomial('100000111')).not.toThrow();

    // Invalid polynomials
    expect(() => validateGeneratorPolynomial('1')).toThrow(/degree >= 1/i);
    expect(() => validateGeneratorPolynomial('01011')).toThrow(/start with '1'/i);
    expect(() => validateGeneratorPolynomial('10110')).toThrow(/end with '1'/i);
  });

  it('computes exact bitwise XOR between equal length binary strings', () => {
    expect(xorBitStrings('1100', '1010')).toBe('0110');
    expect(xorBitStrings('11111', '11111')).toBe('00000');
    expect(xorBitStrings('0000', '1111')).toBe('1111');
    expect(() => xorBitStrings('110', '11')).toThrow(/identical length/i);
  });

  it('performs known textbook modulo-2 long division with step-by-step trace', () => {
    // Classic textbook example:
    // Message: 1101011011
    // Generator: 10011 (x⁴ + x + 1), degree = 4
    // Augmented message with 4 zeros: 11010110110000
    const message = '1101011011';
    const generator = '10011';

    const result = generateEducationalCrc(message, { generator });
    expect(result.degree).toBe(4);
    expect(result.augmentedBits).toBe('11010110110000');
    expect(result.fcsBits.length).toBe(4);

    // Verify division steps are recorded
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.codewordBits).toBe(message + result.fcsBits);

    // Intact receiver verification must produce a zero remainder (0000)
    const verification = verifyEducationalCrc(result.codewordBits, generator);
    expect(verification.isValid).toBe(true);
    expect(verification.remainder).toBe('0000');
    expect(verification.isZeroRemainder).toBe(true);
  });

  it('detects single-bit transmission error with educational CRC', () => {
    const message = '1001101';
    const generator = STANDARD_GENERATORS.CRC_4.polyBits; // 10011

    const generated = generateEducationalCrc(message, { generator });
    const intactCodeword = generated.codewordBits;

    // Flip bit at index 2
    const corruptedCodeword = flipBitAt(intactCodeword, 2);

    const verification = verifyEducationalCrc(corruptedCodeword, generator);
    expect(verification.isValid).toBe(false);
    expect(verification.isZeroRemainder).toBe(false);
    expect(verification.remainder).not.toBe('0000');
    expect(verification.errorMessage).toMatch(/non-zero remainder/i);
  });

  it('detects contiguous burst errors within the generator polynomial degree', () => {
    const message = '1100101011110010';
    const generator = STANDARD_GENERATORS.CRC_8.polyBits; // 100000111 (degree 8)

    const generated = generateEducationalCrc(message, { generator });
    const intactCodeword = generated.codewordBits;

    // Burst of 4 consecutive bit flips (less than degree 8)
    const burstCorrupted = injectBurstError(intactCodeword, 5, 4);

    const verification = verifyEducationalCrc(burstCorrupted, generator);
    expect(verification.isValid).toBe(false);
    expect(verification.isZeroRemainder).toBe(false);
  });

  it('supports UTF-8 text message inputs converted to bit strings', () => {
    const text = 'CN'; // 'C' = 0x43 (01000011), 'N' = 0x4E (01001110)
    const generated = generateEducationalCrc(text, {
      generator: STANDARD_GENERATORS.CRC_4.polyBits,
      isTextInput: true,
    });

    expect(generated.messageBits).toBe('0100001101001110');
    const verification = verifyEducationalCrc(generated.codewordBits, STANDARD_GENERATORS.CRC_4.polyBits);
    expect(verification.isValid).toBe(true);
    expect(verification.remainder).toBe('0000');
  });

  it('rejects received codewords shorter than or equal to generator degree', () => {
    const tooShort = '101'; // length 3 <= degree 4
    const verification = verifyEducationalCrc(tooShort, '10011');
    expect(verification.isValid).toBe(false);
    expect(verification.errorMessage).toMatch(/must exceed generator degree/i);
  });
});

// ============================================================================
// 2. NAMED PARAMETERIZED CRC VARIANTS (CRC-8/SMBUS & CRC-16/CCITT-FALSE)
// ============================================================================
describe('Named Parameterized CRC Variants', () => {
  it('correctly computes CRC-8/SMBUS for standard ASCII check string "123456789" -> 0xF4', () => {
    // Official test vector: "123456789" (ASCII bytes [0x31..0x39]) -> 0xF4
    const checkString = '123456789';
    const result = computeNamedCrc(checkString, 'CRC-8/SMBUS');

    expect(result.variantName).toBe('CRC-8/SMBUS');
    expect(result.variant.width).toBe(8);
    expect(result.variant.poly).toBe(0x07);
    expect(result.variant.init).toBe(0x00);
    expect(result.variant.refIn).toBe(false);
    expect(result.variant.refOut).toBe(false);
    expect(result.variant.xorOut).toBe(0x00);

    expect(result.crcHex).toBe('F4');
    expect(result.crcInt).toBe(0xf4);
    expect(result.trace.length).toBe(checkString.length * 9); // 1 BYTE_START + 8 BIT_STEPs per byte
  });

  it('correctly computes CRC-16/CCITT-FALSE for standard ASCII check string "123456789" -> 0x29B1', () => {
    // Official test vector: "123456789" -> 0x29B1
    const checkString = '123456789';
    const result = computeNamedCrc(checkString, 'CRC-16/CCITT-FALSE');

    expect(result.variantName).toBe('CRC-16/CCITT-FALSE');
    expect(result.variant.width).toBe(16);
    expect(result.variant.poly).toBe(0x1021);
    expect(result.variant.init).toBe(0xffff);
    expect(result.variant.refIn).toBe(false);
    expect(result.variant.refOut).toBe(false);
    expect(result.variant.xorOut).toBe(0x0000);

    expect(result.crcHex).toBe('29B1');
    expect(result.crcInt).toBe(0x29b1);
  });

  it('verifies intact received payload and FCS for named variants', () => {
    const payload = 'Network Protocol Assignment';
    const crcResult = computeNamedCrc(payload, 'CRC-16/CCITT-FALSE');

    // Receiver verification with integer FCS
    const checkInt = verifyNamedCrc(payload, crcResult.crcInt, 'CRC-16/CCITT-FALSE');
    expect(checkInt.isValid).toBe(true);
    expect(checkInt.errorMessage).toBeNull();

    // Receiver verification with hex string FCS
    const checkHex = verifyNamedCrc(payload, crcResult.crcHex, 'CRC-16/CCITT-FALSE');
    expect(checkHex.isValid).toBe(true);
  });

  it('detects payload corruption under named CRC verification', () => {
    const payload = 'Computer Networks';
    const crcResult = computeNamedCrc(payload, 'CRC-8/SMBUS');

    // Corrupt one character in the payload
    const corruptedPayload = 'Computer Networkz';
    const verification = verifyNamedCrc(corruptedPayload, crcResult.crcHex, 'CRC-8/SMBUS');

    expect(verification.isValid).toBe(false);
    expect(verification.errorMessage).toMatch(/CRC mismatch detected/i);
    expect(verification.computedFcsHex).not.toBe(crcResult.crcHex);
  });

  it('detects received FCS corruption when payload remains intact', () => {
    const payload = 'Hello World';
    const crcResult = computeNamedCrc(payload, 'CRC-16/CCITT-FALSE');

    // Tamper with the received FCS
    const tamperedFcs = (crcResult.crcInt ^ 0x0001).toString(16).padStart(4, '0');
    const verification = verifyNamedCrc(payload, tamperedFcs, 'CRC-16/CCITT-FALSE');

    expect(verification.isValid).toBe(false);
    expect(verification.errorMessage).toMatch(/CRC mismatch detected/i);
  });

  it('supports raw Uint8Array and multi-byte UTF-8 payloads', () => {
    const rawBytes = new Uint8Array([0x00, 0xff, 0x55, 0xaa, 0x12]);
    const result = computeNamedCrc(rawBytes, 'CRC-8/SMBUS');
    expect(result.crcHex.length).toBe(2);

    const check = verifyNamedCrc(rawBytes, result.crcHex, 'CRC-8/SMBUS');
    expect(check.isValid).toBe(true);
  });
});

// ============================================================================
// 3. 16-BIT INTERNET CHECKSUM (RFC 1071)
// ============================================================================
describe('16-bit Internet Checksum (RFC 1071)', () => {
  it('correctly extracts 16-bit big-endian words and pads odd-length payloads', () => {
    // Even length (4 bytes: 'ABCD')
    const evenWords = payloadTo16BitWords('ABCD');
    expect(evenWords.hasPadding).toBe(false);
    expect(evenWords.words.length).toBe(2);
    expect(evenWords.words[0]).toBe((0x41 << 8) | 0x42); // 0x4142
    expect(evenWords.words[1]).toBe((0x43 << 8) | 0x44); // 0x4344

    // Odd length (5 bytes: 'ABCDE')
    const oddWords = payloadTo16BitWords('ABCDE');
    expect(oddWords.hasPadding).toBe(true);
    expect(oddWords.words.length).toBe(3);
    expect(oddWords.words[2]).toBe((0x45 << 8) | 0x00); // 0x4500 (padded with 0 on right)
  });

  it('calculates exact 16-bit 1s complement checksum for known even-length input', () => {
    // Payload 'ABCD':
    // Word 1: 0x4142, Word 2: 0x4344
    // Sum: 0x4142 + 0x4344 = 0x8486
    // Bitwise negation: ~0x8486 & 0xFFFF = 0x7B79
    const calc = calculateInternetChecksum('ABCD');
    expect(calc.hasPadding).toBe(false);
    expect(calc.finalSum).toBe(0x8486);
    expect(calc.checksum).toBe(0x7b79);
    expect(calc.checksumHex).toBe('0x7B79');
    expect(calc.steps.length).toBe(2);
  });

  it('calculates exact 16-bit 1s complement checksum for known odd-length input', () => {
    // Payload 'ABCDE':
    // Word 1: 0x4142, Word 2: 0x4344, Word 3: 0x4500 (padded)
    // Sum: 0x4142 + 0x4344 + 0x4500 = 0xC986
    // Bitwise negation: ~0xC986 & 0xFFFF = 0x3679
    const calc = calculateInternetChecksum('ABCDE');
    expect(calc.hasPadding).toBe(true);
    expect(calc.finalSum).toBe(0xc986);
    expect(calc.checksum).toBe(0x3679);
    expect(calc.checksumHex).toBe('0x3679');
  });

  it('folds end-around carries when 16-bit word addition overflows', () => {
    // Array of words: [0xFFFF, 0x0001]
    // 0xFFFF + 0x0001 = 0x10000 -> fold carry: 0x0000 + 1 = 0x0001
    // Inverted: ~0x0001 & 0xFFFF = 0xFFFE
    const bytes = new Uint8Array([0xff, 0xff, 0x00, 0x01]);
    const calc = calculateInternetChecksum(bytes);
    expect(calc.finalSum).toBe(0x0001);
    expect(calc.checksum).toBe(0xfffe);
    expect(calc.steps[1].hadCarry).toBe(true);
  });

  it('verifies intact transmission producing receiver sum of 0xFFFF', () => {
    const payload = 'Data Link Layer Simulation';
    const calc = calculateInternetChecksum(payload);

    const verification = verifyInternetChecksum(payload, calc.checksum);
    expect(verification.isValid).toBe(true);
    expect(verification.receiverSum).toBe(0xffff);
    expect(verification.receiverSumHex).toBe('0xFFFF');
    expect(verification.errorMessage).toBeNull();
  });

  it('detects single-byte payload corruption in receiver checksum', () => {
    const payload = 'Intact Packet';
    const calc = calculateInternetChecksum(payload);

    const corruptedPayload = 'Ontact Packet';
    const verification = verifyInternetChecksum(corruptedPayload, calc.checksum);
    expect(verification.isValid).toBe(false);
    expect(verification.receiverSum).not.toBe(0xffff);
    expect(verification.errorMessage).toMatch(/Checksum verification failure/i);
  });

  it('detects corruption in the checksum field itself', () => {
    const payload = 'Secure Packet';
    const calc = calculateInternetChecksum(payload);

    // Tamper with checksum
    const tamperedChecksum = calc.checksum ^ 0x0010;
    const verification = verifyInternetChecksum(payload, tamperedChecksum);
    expect(verification.isValid).toBe(false);
    expect(verification.receiverSum).not.toBe(0xffff);
  });

  it('handles empty payload gracefully per RFC conventions', () => {
    const calc = calculateInternetChecksum('');
    expect(calc.checksum).toBe(0xffff);
    expect(calc.words.length).toBe(0);
  });
});

// ============================================================================
// 4. ONE-DIMENSIONAL AND TWO-DIMENSIONAL PARITY
// ============================================================================
describe('Parity-Based Error Detection', () => {
  it('accurately counts 1-bits', () => {
    expect(countOnes('101010')).toBe(3);
    expect(countOnes('0000')).toBe(0);
    expect(countOnes('11111')).toBe(5);
  });

  it('generates correct 1D Even and Odd parity bits', () => {
    // 3 ones:
    // Even parity requires total ones to be even -> parity bit '1' (3 + 1 = 4)
    // Odd parity requires total ones to be odd   -> parity bit '0' (3 + 0 = 3)
    const even1 = calculate1DParity('1101', ParityMode.EVEN);
    expect(even1.parityBit).toBe('1');
    expect(even1.codewordBits).toBe('11011');

    const odd1 = calculate1DParity('1101', ParityMode.ODD);
    expect(odd1.parityBit).toBe('0');
    expect(odd1.codewordBits).toBe('11010');

    // 2 ones:
    // Even parity -> parity bit '0' (2 + 0 = 2)
    // Odd parity  -> parity bit '1' (2 + 1 = 3)
    const even2 = calculate1DParity('1100', ParityMode.EVEN);
    expect(even2.parityBit).toBe('0');
    expect(even2.codewordBits).toBe('11000');

    const odd2 = calculate1DParity('1100', ParityMode.ODD);
    expect(odd2.parityBit).toBe('1');
    expect(odd2.codewordBits).toBe('11001');
  });

  it('verifies intact 1D parity codewords and detects single-bit errors', () => {
    const data = '1011001'; // 4 ones
    const calc = calculate1DParity(data, ParityMode.EVEN);
    expect(calc.parityBit).toBe('0');

    // Intact verification
    const valid = verify1DParity(calc.codewordBits, ParityMode.EVEN);
    expect(valid.isValid).toBe(true);

    // Corrupted data bit
    const corruptedData = flipBitAt(calc.codewordBits, 1); // '11110010'
    const invalidData = verify1DParity(corruptedData, ParityMode.EVEN);
    expect(invalidData.isValid).toBe(false);
    expect(invalidData.errorMessage).toMatch(/Parity violation/i);

    // Corrupted parity bit
    const corruptedParity = flipBitAt(calc.codewordBits, calc.codewordBits.length - 1);
    const invalidParity = verify1DParity(corruptedParity, ParityMode.EVEN);
    expect(invalidParity.isValid).toBe(false);
  });

  it('demonstrates fundamental limitation: 2 bit flips evade 1D parity detection', () => {
    const data = '1100'; // 2 ones
    const calc = calculate1DParity(data, ParityMode.EVEN); // codeword '11000' (2 ones)

    // Flip 2 bits in data: index 0 ('1' -> '0') and index 2 ('0' -> '1')
    // Codeword becomes '01100' (still 2 ones!)
    const doubleCorrupted = '01100';
    const check = verify1DParity(doubleCorrupted, ParityMode.EVEN);

    // 2-bit error cancels out in parity! Parity reports valid even though data was corrupted!
    expect(check.isValid).toBe(true);
    expect(check.dataBits).not.toBe(data);
  });

  it('calculates 2D parity matrix with row, column, and corner parities', () => {
    // 4x4 matrix = 16 bits
    const bits = '1011010111100010';
    const parity2D = calculate2DParity(bits, 4, 4, ParityMode.EVEN);

    expect(parity2D.rows).toBe(4);
    expect(parity2D.cols).toBe(4);
    expect(parity2D.matrix.length).toBe(4);
    expect(parity2D.matrix[0].length).toBe(4);

    // Check row 0: '1011' (3 ones -> even parity bit is '1')
    expect(parity2D.rowParities[0]).toBe('1');
    // Check row 1: '0101' (2 ones -> even parity bit is '0')
    expect(parity2D.rowParities[1]).toBe('0');

    // Intact receiver verification
    const check = verify2DParity(
      parity2D.matrix,
      parity2D.rowParities,
      parity2D.colParities,
      parity2D.cornerParity,
      ParityMode.EVEN
    );
    expect(check.isValid).toBe(true);
    expect(check.hasError).toBe(false);
    expect(check.faultyRows.length).toBe(0);
    expect(check.faultyCols.length).toBe(0);
  });

  it('localizes and corrects a single flipped data bit in a 2D parity matrix', () => {
    const bits = '1001011011110000';
    const parity2D = calculate2DParity(bits, 4, 4, ParityMode.EVEN);

    // Copy matrix and flip bit at Row 1, Col 2 (0-indexed)
    const corruptedMatrix = parity2D.matrix.map((r) => [...r]);
    const originalBit = corruptedMatrix[1][2];
    corruptedMatrix[1][2] = originalBit === '1' ? '0' : '1';

    const check = verify2DParity(
      corruptedMatrix,
      parity2D.rowParities,
      parity2D.colParities,
      parity2D.cornerParity,
      ParityMode.EVEN
    );

    expect(check.isValid).toBe(false);
    expect(check.hasError).toBe(true);
    // Must flag Row 1 and Col 2
    expect(check.faultyRows).toEqual([1]);
    expect(check.faultyCols).toEqual([2]);

    // Single-bit localization confirmed
    expect(check.canCorrect).toBe(true);
    expect(check.localizedError).toEqual({
      type: 'DATA_BIT',
      row: 1,
      col: 2,
      originalVal: corruptedMatrix[1][2],
      correctedVal: originalBit,
    });
    expect(check.correctedMatrix[1][2]).toBe(originalBit);
  });

  it('localizes a corrupted row parity bit without modifying data matrix', () => {
    const bits = '1111000010100101';
    const parity2D = calculate2DParity(bits, 4, 4, ParityMode.EVEN);

    // Tamper with Row 2 parity bit only
    const tamperedRowParities = [...parity2D.rowParities];
    tamperedRowParities[2] = tamperedRowParities[2] === '1' ? '0' : '1';

    const check = verify2DParity(
      parity2D.matrix,
      tamperedRowParities,
      parity2D.colParities,
      parity2D.cornerParity,
      ParityMode.EVEN
    );

    expect(check.isValid).toBe(false);
    expect(check.faultyRows).toEqual([2]);
    expect(check.faultyCols.length).toBe(0);
    expect(check.localizedError.type).toBe('ROW_PARITY_BIT');
    expect(check.localizedError.row).toBe(2);
  });

  it('demonstrates ambiguous detection on multi-bit corruption in 2D parity', () => {
    const bits = '1100001110100101';
    const parity2D = calculate2DParity(bits, 4, 4, ParityMode.EVEN);

    // Flip 2 bits in the same row (Row 0, Col 0 and Col 1)
    const corruptedMatrix = parity2D.matrix.map((r) => [...r]);
    corruptedMatrix[0][0] = corruptedMatrix[0][0] === '1' ? '0' : '1';
    corruptedMatrix[0][1] = corruptedMatrix[0][1] === '1' ? '0' : '1';

    const check = verify2DParity(
      corruptedMatrix,
      parity2D.rowParities,
      parity2D.colParities,
      parity2D.cornerParity,
      ParityMode.EVEN
    );

    // Row 0 parity is unchanged because 2 flips cancel in even parity!
    // But Col 0 and Col 1 parities fail!
    expect(check.faultyRows.length).toBe(0);
    expect(check.faultyCols).toEqual([0, 1]);
    expect(check.canCorrect).toBe(false);
    expect(check.diagnosis).toMatch(/Multi-bit corruption detected/i);
  });
});

// ============================================================================
// 5. ERROR INJECTION & CHANNEL INTEGRATION
// ============================================================================
describe('Controlled Error Injection & Channel Integration', () => {
  it('flips bit at designated index and generates exact error mask', () => {
    const original = '11001010';
    const corrupted = corruptBitString(original, { type: 'SINGLE', bitIndex: 3 });

    expect(corrupted.isCorrupted).toBe(true);
    expect(corrupted.bitErrorCount).toBe(1);
    expect(corrupted.flippedIndices).toEqual([3]);
    expect(corrupted.corruptedBits).toBe('11011010');
    expect(corrupted.errorMask).toBe('00010000');
  });

  it('injects contiguous burst errors and generates exact error mask', () => {
    const original = '0000000000';
    const burst = corruptBitString(original, { type: 'BURST', startIndex: 2, burstLength: 4 });

    expect(burst.isCorrupted).toBe(true);
    expect(burst.bitErrorCount).toBe(4);
    expect(burst.flippedIndices).toEqual([2, 3, 4, 5]);
    expect(burst.corruptedBits).toBe('0011110000');
    expect(burst.errorMask).toBe('0011110000');
  });

  it('corrupts payload and FCS fields independently', () => {
    const payload = '11110000';
    const fcs = '1010';

    // Corrupt FCS field only
    const fcsCorrupt = corruptTransmittedFields(payload, fcs, {
      target: 'FCS',
      fcsBitIndex: 1,
    });
    expect(fcsCorrupt.corruptedPayload).toBe(payload);
    expect(fcsCorrupt.corruptedFcs).toBe('1110'); // bit 1 flipped
    expect(fcsCorrupt.corruptedCodeword).toBe('111100001110');

    // Corrupt payload only
    const payloadCorrupt = corruptTransmittedFields(payload, fcs, {
      target: 'PAYLOAD',
      payloadBitIndex: 0,
    });
    expect(payloadCorrupt.corruptedPayload).toBe('01110000');
    expect(payloadCorrupt.corruptedFcs).toBe(fcs);
  });

  it('transmits frame through Channel with burst corruption directive', () => {
    const engine = new SimulationEngine();
    const channel = new Channel(engine, { propagationDelay: 3 });

    const frame = {
      id: 1,
      payload: '10101010',
      fcs: '1100',
    };

    let deliveredFrame = null;
    channel.transmit(
      frame,
      (delivered) => {
        deliveredFrame = delivered;
      },
      { action: 'CORRUPT', bitIndex: 2, burstLength: 3 }
    );

    engine.step(); // Deliver frame at tick 3
    expect(deliveredFrame).not.toBeNull();
    expect(deliveredFrame.corrupted).toBe(true);
    // Indices 2, 3, 4 flipped:
    // '10101010' -> 2 ('1'->'0'), 3 ('0'->'1'), 4 ('1'->'0') -> '10010010'
    expect(deliveredFrame.payload).toBe('10010010');
    // Original frame must remain unmutated
    expect(frame.payload).toBe('10101010');
  });
});

// ============================================================================
// 6. UI COMPONENT REGRESSION & SMOKE TESTS
// ============================================================================
describe('ErrorControlView Component Rendering Smoke Test', () => {
  it('renders ErrorControlView component cleanly without runtime ReferenceErrors', () => {
    expect(() => {
      const html = renderToString(React.createElement(ErrorControlView));
      expect(html).toContain('Cyclic Redundancy Check');
      expect(html).toContain('16-bit Internet Checksum');
      expect(html).toContain('Two-Dimensional Matrix Parity');
      expect(html).toContain('A burst error of length');
    }).not.toThrow();
  });

  it('renders App shell with active error-control tab cleanly', () => {
    expect(() => {
      const html = renderToString(React.createElement(App));
      expect(html).toContain('Data Link Layer Protocol Simulator');
      expect(html).toContain('Error Control &amp; CRC');
    }).not.toThrow();
  });
});
