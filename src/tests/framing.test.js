/**
 * framing.test.js
 * 
 * Comprehensive unit test suite for:
 * 1. Bit Stuffing and Destuffing (HDLC standard 01111110, 5 ones rule, abort sequences)
 * 2. Byte Stuffing and Unstuffing (0x7E FLAG, 0x7D ESC, UTF-8 text, malformed sequences)
 * 3. Character-Count Framing (Length header encoding, multi-frame streaming, desynchronization demo)
 */

import { describe, it, expect } from 'vitest';
import {
  BIT_FLAG,
  stuffBits,
  destuffBits,
  isValidBitString,
  textToBitString,
  bitStringToText,
} from '../core/framing/bitStuffing.js';
import {
  BYTE_FLAG,
  BYTE_ESC,
  stuffBytes,
  unstuffBytes,
  textToBytes,
  bytesToText,
  byteToHex,
} from '../core/framing/byteStuffing.js';
import {
  encodeFrame,
  encodeMultipleFrames,
  decodeFrameStream,
  simulateLengthCorruption,
} from '../core/framing/charCount.js';

describe('Bit Stuffing & Destuffing', () => {
  it('validates bit strings correctly', () => {
    expect(isValidBitString('010101')).toBe(true);
    expect(isValidBitString('')).toBe(true);
    expect(isValidBitString('01012')).toBe(false);
    expect(isValidBitString('abc')).toBe(false);
    expect(isValidBitString(null)).toBe(false);
  });

  it('stuffs a 0 immediately after five consecutive 1s', () => {
    const input = '11111';
    const result = stuffBits(input);
    expect(result.stuffedBits).toBe('111110');
    expect(result.stuffingCount).toBe(1);
    expect(result.framedBits).toBe(`${BIT_FLAG}111110${BIT_FLAG}`);
  });

  it('handles multiple stuffing events in a single payload', () => {
    // Two runs of five 1s: '11111' + '0' + '11111'
    const input = '11111011111';
    const result = stuffBits(input);
    expect(result.stuffedBits).toBe('1111100111110');
    expect(result.stuffingCount).toBe(2);
  });

  it('stuffs consecutive runs of more than five 1s properly', () => {
    // Ten consecutive 1s: first 5 -> stuff 0, next 5 -> stuff 0
    const input = '1111111111';
    const result = stuffBits(input);
    expect(result.stuffedBits).toBe('111110111110');
    expect(result.stuffingCount).toBe(2);
  });

  it('prevents accidental flag collision when payload contains the flag sequence', () => {
    // If payload contains '01111110' (the raw flag), bit stuffing turns it into '011111010'
    const input = '01111110';
    const result = stuffBits(input);
    expect(result.stuffedBits).toBe('011111010');
    expect(result.framedBits).toBe(`${BIT_FLAG}011111010${BIT_FLAG}`);
  });

  it('destuffs framed bits back to the exact original payload (round-trip)', () => {
    const testCases = [
      '0',
      '1',
      '00000000',
      '11111',
      '111110',
      '01111110',
      '1111111111',
      '0101111101111110111110',
      '1101011001101011',
    ];

    for (const testCase of testCases) {
      const stuffed = stuffBits(testCase);
      const destuffed = destuffBits(stuffed.framedBits, true);
      expect(destuffed.hasError).toBe(false);
      expect(destuffed.destuffedBits).toBe(testCase);
    }
  });

  it('handles empty bit stream correctly', () => {
    const stuffed = stuffBits('');
    expect(stuffed.stuffedBits).toBe('');
    expect(stuffed.framedBits).toBe(`${BIT_FLAG}${BIT_FLAG}`);

    const destuffed = destuffBits(stuffed.framedBits, true);
    expect(destuffed.hasError).toBe(false);
    expect(destuffed.destuffedBits).toBe('');
  });

  it('converts UTF-8 text to bit string and performs full round-trip', () => {
    const text = 'CN Lab 2026';
    const bitString = textToBitString(text);
    const stuffed = stuffBits(bitString);
    const destuffed = destuffBits(stuffed.framedBits, true);

    expect(destuffed.hasError).toBe(false);
    const recoveredText = bitStringToText(destuffed.destuffedBits);
    expect(recoveredText).toBe(text);
  });

  it('detects abort sequence / framing error with seven consecutive 1s', () => {
    // Frame containing seven consecutive 1s in payload
    const corruptFrame = `${BIT_FLAG}011111110${BIT_FLAG}`;
    const result = destuffBits(corruptFrame, true);
    expect(result.hasError).toBe(true);
    expect(result.errorMessage).toMatch(/Abort sequence/i);
  });

  it('detects missing or invalid boundary flags', () => {
    const badStart = '000000001111101111110';
    expect(destuffBits(badStart, true).hasError).toBe(true);

    const tooShort = '01111110';
    expect(destuffBits(tooShort, true).hasError).toBe(true);
  });
});

describe('Byte Stuffing & Unstuffing', () => {
  it('correctly passes normal bytes without stuffing', () => {
    const data = [0x41, 0x42, 0x43]; // 'ABC'
    const result = stuffBytes(data);
    expect(result.escapedCount).toBe(0);
    expect(Array.from(result.stuffedBytes)).toEqual([0x41, 0x42, 0x43]);
    expect(Array.from(result.framedBytes)).toEqual([BYTE_FLAG, 0x41, 0x42, 0x43, BYTE_FLAG]);
  });

  it('escapes reserved FLAG byte (0x7E) with ESC (0x7D)', () => {
    const data = [0x41, BYTE_FLAG, 0x42]; // A, FLAG, B
    const result = stuffBytes(data);
    expect(result.escapedCount).toBe(1);
    expect(Array.from(result.stuffedBytes)).toEqual([0x41, BYTE_ESC, BYTE_FLAG, 0x42]);
  });

  it('escapes reserved ESC byte (0x7D) with ESC (0x7D)', () => {
    const data = [0x41, BYTE_ESC, 0x42]; // A, ESC, B
    const result = stuffBytes(data);
    expect(result.escapedCount).toBe(1);
    expect(Array.from(result.stuffedBytes)).toEqual([0x41, BYTE_ESC, BYTE_ESC, 0x42]);
  });

  it('escapes multiple occurrences of FLAG and ESC in succession', () => {
    const data = [BYTE_FLAG, BYTE_ESC, BYTE_FLAG];
    const result = stuffBytes(data);
    expect(result.escapedCount).toBe(3);
    expect(Array.from(result.stuffedBytes)).toEqual([
      BYTE_ESC,
      BYTE_FLAG,
      BYTE_ESC,
      BYTE_ESC,
      BYTE_ESC,
      BYTE_FLAG,
    ]);
  });

  it('preserves raw byte sequences after stuffing and unstuffing round-trip', () => {
    const testCases = [
      new Uint8Array([]),
      new Uint8Array([0x00, 0xff, 0x7f]),
      new Uint8Array([BYTE_FLAG]),
      new Uint8Array([BYTE_ESC]),
      new Uint8Array([BYTE_FLAG, BYTE_ESC, BYTE_FLAG, BYTE_ESC]),
      new Uint8Array([0x10, 0x7e, 0x20, 0x7d, 0x30]),
    ];

    for (const testCase of testCases) {
      const stuffed = stuffBytes(testCase);
      const unstuffed = unstuffBytes(stuffed.framedBytes, true);
      expect(unstuffed.hasError).toBe(false);
      expect(Array.from(unstuffed.destuffedBytes)).toEqual(Array.from(testCase));
    }
  });

  it('supports UTF-8 text including emojis and international characters', () => {
    const text = 'Networks ~ Network} Data Link 🚀';
    const bytes = textToBytes(text);
    const stuffed = stuffBytes(bytes);
    const unstuffed = unstuffBytes(stuffed.framedBytes, true);

    expect(unstuffed.hasError).toBe(false);
    const recoveredText = bytesToText(unstuffed.destuffedBytes);
    expect(recoveredText).toBe(text);
  });

  it('detects dangling ESC byte at the end of the frame', () => {
    // Stuffed frame ending with ESC right before closing FLAG
    const invalidFrame = new Uint8Array([BYTE_FLAG, 0x41, BYTE_ESC, BYTE_FLAG]);
    const result = unstuffBytes(invalidFrame, true);
    expect(result.hasError).toBe(true);
    expect(result.errorMessage).toMatch(/Dangling ESC/i);
  });

  it('detects invalid escape sequence where ESC is followed by non-reserved byte', () => {
    // ESC followed by 0x41 ('A')
    const invalidFrame = new Uint8Array([BYTE_FLAG, BYTE_ESC, 0x41, BYTE_FLAG]);
    const result = unstuffBytes(invalidFrame, true);
    expect(result.hasError).toBe(true);
    expect(result.errorMessage).toMatch(/Invalid escape sequence/i);
  });

  it('detects unescaped FLAG byte inside payload', () => {
    // Payload containing unescaped 0x7E
    const invalidFrame = new Uint8Array([BYTE_FLAG, 0x41, BYTE_FLAG, 0x42, BYTE_FLAG]);
    // With hasFlags=true, first 0x7E and last 0x7E are flags, but middle 0x7E is unescaped
    const result = unstuffBytes(invalidFrame, true);
    expect(result.hasError).toBe(true);
    expect(result.errorMessage).toMatch(/Framing violation: Unescaped FLAG/i);
  });
});

describe('Character-Count Framing', () => {
  it('encodes a single frame with correct total length byte', () => {
    const payload = 'TEST'; // 4 bytes
    const encoded = encodeFrame(payload);

    // Total length = 1 (header) + 4 (payload) = 5
    expect(encoded.totalLength).toBe(5);
    expect(encoded.frameBytes[0]).toBe(5);
    expect(Array.from(encoded.frameBytes)).toEqual([5, 0x54, 0x45, 0x53, 0x54]);
  });

  it('encodes and decodes multiple consecutive frames in a byte stream', () => {
    const payloads = ['FRAME1', 'F2', 'THIRD_FRAME'];
    const encodedStream = encodeMultipleFrames(payloads);

    expect(encodedStream.frames.length).toBe(3);

    const decoded = decodeFrameStream(encodedStream.streamBytes);
    expect(decoded.hasError).toBe(false);
    expect(decoded.frames.length).toBe(3);
    expect(decoded.frames[0].payloadText).toBe('FRAME1');
    expect(decoded.frames[1].payloadText).toBe('F2');
    expect(decoded.frames[2].payloadText).toBe('THIRD_FRAME');
  });

  it('accurately calculates byte count for UTF-8 multi-byte characters', () => {
    const payload = '€'; // Euro symbol is 3 bytes in UTF-8 (0xE2, 0x82, 0xAC)
    const encoded = encodeFrame(payload);

    // Total length = 1 header + 3 bytes = 4 (whereas JS string.length is 1)
    expect(encoded.totalLength).toBe(4);
    expect(encoded.frameBytes[0]).toBe(4);

    const decoded = decodeFrameStream(encoded.frameBytes);
    expect(decoded.hasError).toBe(false);
    expect(decoded.frames[0].payloadText).toBe('€');
  });

  it('detects truncated frame where stream ends before claimed length', () => {
    // Length header claims 6 bytes, but only 3 bytes provided
    const truncatedStream = new Uint8Array([6, 0x41, 0x42]);
    const result = decodeFrameStream(truncatedStream);

    expect(result.hasError).toBe(true);
    expect(result.error.message).toMatch(/Truncated frame/i);
  });

  it('detects invalid length header < 1', () => {
    const invalidStream = new Uint8Array([0, 0x41, 0x42]);
    const result = decodeFrameStream(invalidStream);

    expect(result.hasError).toBe(true);
    expect(result.error.message).toMatch(/must be >= 1/i);
  });

  it('demonstrates catastrophic framing desynchronization when a length byte is corrupted', () => {
    const payloads = ['DATA1', 'DATA2', 'DATA3'];
    // Frame 0: 'DATA1' (len = 6: header 6, 5 bytes)
    // Frame 1: 'DATA2' (len = 6: header 6, 5 bytes)
    // Frame 2: 'DATA3' (len = 6: header 6, 5 bytes)
    // Stream: [6, D, A, T, A, 1, 6, D, A, T, A, 2, 6, D, A, T, A, 3] (total 18 bytes)

    // Corrupt Frame 0 length from 6 to 8:
    // Receiver now expects Frame 0 to be 8 bytes long (reads 7 payload bytes!)
    // It swallows: 'D','A','T','A','1', '6', 'D' as Frame 0 payload!
    // Next header is read from byte offset 8 ('A' = 0x41 = 65 in decimal!)
    // Receiver now attempts to read 65 bytes, causing an immediate framing desynchronization error!
    const sim = simulateLengthCorruption(payloads, 0, 8);

    expect(sim.hasDesynchronization).toBe(true);
    expect(sim.originalLengthValue).toBe(6);
    expect(sim.corruptedLengthValue).toBe(8);
    expect(sim.decodingError).not.toBeNull();
    expect(sim.explanation).toContain('desynchronization');
  });
});
