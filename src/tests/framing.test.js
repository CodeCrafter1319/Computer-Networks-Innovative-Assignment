/**
 * framing.test.js
 * 
 * Comprehensive unit test suite for:
 * 1. Bit Stuffing and Destuffing (HDLC standard 01111110, 5 ones rule, abort sequences, flag collisions)
 * 2. Byte Stuffing and Unstuffing (RFC 1662 PPP 0x7D 0x5E / 0x7D 0x5D + Generic Educational Escape)
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
  ESC_XOR,
  PPP_ESCAPED_FLAG,
  PPP_ESCAPED_ESC,
  ByteStuffingMode,
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
    const input = '11111011111';
    const result = stuffBits(input);
    expect(result.stuffedBits).toBe('1111100111110');
    expect(result.stuffingCount).toBe(2);
  });

  it('stuffs consecutive runs of more than five 1s properly', () => {
    const input = '1111111111';
    const result = stuffBits(input);
    expect(result.stuffedBits).toBe('111110111110');
    expect(result.stuffingCount).toBe(2);
  });

  it('prevents accidental flag collision when payload contains the exact raw flag sequence', () => {
    const input = '01111110';
    const result = stuffBits(input);
    // 0 + 11111 (stuff 0) + 1 + 0 = 011111010
    expect(result.stuffedBits).toBe('011111010');
    // Stuffed payload itself must NOT contain 01111110
    expect(result.stuffedBits.includes(BIT_FLAG)).toBe(false);
    expect(result.framedBits).toBe(`${BIT_FLAG}011111010${BIT_FLAG}`);

    // Destuffing must recover the exact original flag
    const destuffed = destuffBits(result.framedBits, true);
    expect(destuffed.hasError).toBe(false);
    expect(destuffed.destuffedBits).toBe('01111110');
  });

  it('handles multiple consecutive raw flags in payload without flag leakage', () => {
    const input = '0111111001111110';
    const result = stuffBits(input);
    expect(result.stuffedBits).toBe('011111010011111010');
    expect(result.stuffedBits.includes(BIT_FLAG)).toBe(false);

    const destuffed = destuffBits(result.framedBits, true);
    expect(destuffed.hasError).toBe(false);
    expect(destuffed.destuffedBits).toBe(input);
  });

  it('handles payload ending with five consecutive 1s', () => {
    const input = '0011111';
    const result = stuffBits(input);
    expect(result.stuffedBits).toBe('00111110');

    const destuffed = destuffBits(result.framedBits, true);
    expect(destuffed.hasError).toBe(false);
    expect(destuffed.destuffedBits).toBe('0011111');
  });

  it('handles 15 consecutive 1s correctly', () => {
    const input = '111111111111111'; // 15 ones
    const result = stuffBits(input);
    expect(result.stuffingCount).toBe(3);
    expect(result.stuffedBits).toBe('111110111110111110');

    const destuffed = destuffBits(result.framedBits, true);
    expect(destuffed.hasError).toBe(false);
    expect(destuffed.destuffedBits).toBe(input);
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
    const corruptFrame = `${BIT_FLAG}011111110${BIT_FLAG}`;
    const result = destuffBits(corruptFrame, true);
    expect(result.hasError).toBe(true);
    expect(result.errorMessage).toMatch(/Abort sequence/i);
  });

  it('detects unescaped delimiter flag pattern inside payload', () => {
    // Six 1s followed by 0 inside payload without prior stuffing
    const corruptFrame = `${BIT_FLAG}0001111110000${BIT_FLAG}`;
    const result = destuffBits(corruptFrame, true);
    expect(result.hasError).toBe(true);
    expect(result.errorMessage).toMatch(/Unescaped delimiter flag pattern/i);
  });

  it('detects missing or invalid boundary flags', () => {
    const badStart = '000000001111101111110';
    expect(destuffBits(badStart, true).hasError).toBe(true);

    const tooShort = '01111110';
    expect(destuffBits(tooShort, true).hasError).toBe(true);
  });
});

describe('Byte Stuffing & Unstuffing (RFC 1662 PPP & Generic)', () => {
  it('correctly passes normal bytes without stuffing in RFC 1662 PPP mode', () => {
    const data = [0x41, 0x42, 0x43]; // 'ABC'
    const result = stuffBytes(data);
    expect(result.escapedCount).toBe(0);
    expect(Array.from(result.stuffedBytes)).toEqual([0x41, 0x42, 0x43]);
    expect(Array.from(result.framedBytes)).toEqual([BYTE_FLAG, 0x41, 0x42, 0x43, BYTE_FLAG]);
  });

  it('implements RFC 1662 section 4.2: escapes FLAG (0x7E) as [0x7D, 0x5E]', () => {
    // 0x7E ^ 0x20 = 0x5E
    expect(BYTE_FLAG ^ ESC_XOR).toBe(0x5e);

    const data = [0x41, BYTE_FLAG, 0x42]; // A, FLAG, B
    const result = stuffBytes(data, { mode: ByteStuffingMode.RFC1662_PPP });

    expect(result.escapedCount).toBe(1);
    expect(Array.from(result.stuffedBytes)).toEqual([0x41, BYTE_ESC, PPP_ESCAPED_FLAG, 0x42]);
    expect(Array.from(result.stuffedBytes)).toEqual([0x41, 0x7d, 0x5e, 0x42]);
  });

  it('implements RFC 1662 section 4.2: escapes ESC (0x7D) as [0x7D, 0x5D]', () => {
    // 0x7D ^ 0x20 = 0x5D
    expect(BYTE_ESC ^ ESC_XOR).toBe(0x5d);

    const data = [0x41, BYTE_ESC, 0x42]; // A, ESC, B
    const result = stuffBytes(data, { mode: ByteStuffingMode.RFC1662_PPP });

    expect(result.escapedCount).toBe(1);
    expect(Array.from(result.stuffedBytes)).toEqual([0x41, BYTE_ESC, PPP_ESCAPED_ESC, 0x42]);
    expect(Array.from(result.stuffedBytes)).toEqual([0x41, 0x7d, 0x5d, 0x42]);
  });

  it('correctly unstuffs RFC 1662 sequences via 0x20 bit-inversion', () => {
    // [FLAG, A, 0x7D, 0x5E, B, 0x7D, 0x5D, FLAG]
    const framed = new Uint8Array([BYTE_FLAG, 0x41, 0x7d, 0x5e, 0x42, 0x7d, 0x5d, BYTE_FLAG]);
    const result = unstuffBytes(framed, true, { mode: ByteStuffingMode.RFC1662_PPP });

    expect(result.hasError).toBe(false);
    expect(result.removedEscapeCount).toBe(2);
    expect(Array.from(result.destuffedBytes)).toEqual([0x41, BYTE_FLAG, 0x42, BYTE_ESC]);
  });

  it('supports Generic Educational Character Stuffing mode when explicitly selected', () => {
    const data = [0x41, BYTE_FLAG, BYTE_ESC, 0x42];
    const result = stuffBytes(data, { mode: ByteStuffingMode.GENERIC_ESCAPE });

    expect(result.escapedCount).toBe(2);
    // Generic mode maps 0x7E -> [0x7D, 0x7E] and 0x7D -> [0x7D, 0x7D]
    expect(Array.from(result.stuffedBytes)).toEqual([
      0x41,
      BYTE_ESC,
      BYTE_FLAG,
      BYTE_ESC,
      BYTE_ESC,
      0x42,
    ]);

    const unstuffed = unstuffBytes(result.framedBytes, true, {
      mode: ByteStuffingMode.GENERIC_ESCAPE,
    });
    expect(unstuffed.hasError).toBe(false);
    expect(Array.from(unstuffed.destuffedBytes)).toEqual(data);
  });

  it('preserves raw byte sequences across RFC 1662 round-trip', () => {
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

  it('supports UTF-8 text including emojis and international characters in RFC 1662 mode', () => {
    const text = 'Networks ~ Network} Data Link 🚀';
    const bytes = textToBytes(text);
    const stuffed = stuffBytes(bytes);
    const unstuffed = unstuffBytes(stuffed.framedBytes, true);

    expect(unstuffed.hasError).toBe(false);
    const recoveredText = bytesToText(unstuffed.destuffedBytes);
    expect(recoveredText).toBe(text);
  });

  it('detects dangling ESC byte at the end of the frame', () => {
    const invalidFrame = new Uint8Array([BYTE_FLAG, 0x41, BYTE_ESC, BYTE_FLAG]);
    const result = unstuffBytes(invalidFrame, true);
    expect(result.hasError).toBe(true);
    expect(result.errorMessage).toMatch(/Dangling ESC/i);
  });

  it('detects invalid RFC 1662 escape sequence where ESC is followed by an unexpected octet', () => {
    // 0x7D followed by 0x41 ('A') instead of 0x5E or 0x5D
    const invalidFrame = new Uint8Array([BYTE_FLAG, BYTE_ESC, 0x41, BYTE_FLAG]);
    const result = unstuffBytes(invalidFrame, true, { mode: ByteStuffingMode.RFC1662_PPP });
    expect(result.hasError).toBe(true);
    expect(result.errorMessage).toMatch(/Invalid RFC 1662 escape sequence/i);
  });

  it('detects unescaped FLAG byte inside payload', () => {
    const invalidFrame = new Uint8Array([BYTE_FLAG, 0x41, BYTE_FLAG, 0x42, BYTE_FLAG]);
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
    const sim = simulateLengthCorruption(payloads, 0, 8);

    expect(sim.hasDesynchronization).toBe(true);
    expect(sim.originalLengthValue).toBe(6);
    expect(sim.corruptedLengthValue).toBe(8);
    expect(sim.decodingError).not.toBeNull();
    expect(sim.explanation).toContain('desynchronization');
  });
});
