/**
 * byteStuffing.js
 * 
 * Byte / Octet Stuffing Implementation
 * 
 * Supported Conventions:
 * 1. RFC 1662 PPP Octet Stuffing (Standard):
 *    - FLAG Byte:   0x7E (126 in decimal, '~' in ASCII, binary 01111110)
 *    - ESC Byte:    0x7D (125 in decimal, '}' in ASCII, binary 01111101)
 *    - Inversion mask (XOR): 0x20 (32 in decimal, binary 00100000, inverts bit 5/6)
 *    - When 0x7E occurs in payload -> escaped as [0x7D, 0x5E] (0x7E ^ 0x20 = 0x5E, '~' -> '^')
 *    - When 0x7D occurs in payload -> escaped as [0x7D, 0x5D] (0x7D ^ 0x20 = 0x5D, '}' -> ']')
 *    - Receiver reverses transformation by XORing the octet following 0x7D with 0x20.
 * 
 * 2. Generic Educational Character Stuffing (Tanenbaum):
 *    - Reserved FLAG byte (0x7E) is preceded by ESC (0x7D): [0x7E] -> [0x7D, 0x7E]
 *    - Reserved ESC byte (0x7D) is preceded by ESC (0x7D):  [0x7D] -> [0x7D, 0x7D]
 */

export const BYTE_FLAG = 0x7e; // 126, 01111110
export const BYTE_ESC = 0x7d;  // 125, 01111101
export const ESC_XOR = 0x20;   // 32,  00100000 (RFC 1662 5th-bit inversion mask)

export const PPP_ESCAPED_FLAG = BYTE_FLAG ^ ESC_XOR; // 0x5E ('^')
export const PPP_ESCAPED_ESC = BYTE_ESC ^ ESC_XOR;   // 0x5D (']')

export const ByteStuffingMode = Object.freeze({
  RFC1662_PPP: 'RFC1662_PPP',
  GENERIC_ESCAPE: 'GENERIC_ESCAPE',
});

/**
 * Format a byte integer as a 2-digit uppercase hex string (e.g. 0x7E).
 * 
 * @param {number} byteValue 
 * @returns {string}
 */
export function byteToHex(byteValue) {
  return '0x' + (byteValue & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Format a byte integer as an 8-bit binary string.
 * 
 * @param {number} byteValue 
 * @returns {string}
 */
export function byteToBin(byteValue) {
  return (byteValue & 0xff).toString(2).padStart(8, '0');
}

/**
 * Convert a UTF-8 text string to a Uint8Array of bytes.
 * 
 * @param {string} text 
 * @returns {Uint8Array}
 */
export function textToBytes(text) {
  if (typeof text !== 'string') {
    throw new Error('Input must be a string.');
  }
  return new TextEncoder().encode(text);
}

/**
 * Convert a Uint8Array of bytes to a UTF-8 text string.
 * 
 * @param {Uint8Array|Array<number>} bytes 
 * @returns {string}
 */
export function bytesToText(bytes) {
  const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new TextDecoder('utf-8', { fatal: true }).decode(uint8);
}

/**
 * Format an array of bytes as a human-readable hex string (e.g. "7E 48 65 6C 6C 6F 7E").
 * 
 * @param {Uint8Array|Array<number>} bytes 
 * @returns {string}
 */
export function bytesToHexString(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

/**
 * Perform byte stuffing on a payload of bytes.
 * 
 * @param {Uint8Array|Array<number>} payloadBytes - Raw input bytes.
 * @param {Object} [options={}]
 * @param {string} [options.mode=ByteStuffingMode.RFC1662_PPP] - RFC1662_PPP or GENERIC_ESCAPE.
 * @returns {Object} {
 *   originalBytes: Uint8Array,
 *   stuffedBytes: Uint8Array,
 *   framedBytes: Uint8Array,
 *   escapedCount: number,
 *   mode: string,
 *   trace: Array<Object>
 * }
 */
export function stuffBytes(payloadBytes, options = {}) {
  const mode = options.mode || ByteStuffingMode.RFC1662_PPP;
  const input = payloadBytes instanceof Uint8Array ? payloadBytes : new Uint8Array(payloadBytes);
  const stuffed = [];
  const trace = [];
  let escapedCount = 0;

  for (let i = 0; i < input.length; i++) {
    const byte = input[i];

    if (byte === BYTE_FLAG) {
      escapedCount++;
      if (mode === ByteStuffingMode.RFC1662_PPP) {
        // RFC 1662: [0x7D, 0x7E ^ 0x20] -> [0x7D, 0x5E]
        stuffed.push(BYTE_ESC);
        stuffed.push(PPP_ESCAPED_FLAG);
        trace.push({
          action: 'ESCAPE_FLAG_PPP',
          originalIndex: i,
          byteValue: byte,
          hex: byteToHex(byte),
          escapedSequence: [byteToHex(BYTE_ESC), byteToHex(PPP_ESCAPED_FLAG)],
          description: `Payload contains reserved FLAG byte (${byteToHex(byte)}). Escaped per RFC 1662 as [${byteToHex(BYTE_ESC)}, ${byteToHex(PPP_ESCAPED_FLAG)}] (0x7E XOR 0x20).`,
        });
      } else {
        // Generic educational escape: [0x7D, 0x7E]
        stuffed.push(BYTE_ESC);
        stuffed.push(BYTE_FLAG);
        trace.push({
          action: 'ESCAPE_FLAG_GENERIC',
          originalIndex: i,
          byteValue: byte,
          hex: byteToHex(byte),
          escapedSequence: [byteToHex(BYTE_ESC), byteToHex(BYTE_FLAG)],
          description: `Payload contains reserved FLAG byte (${byteToHex(byte)}). Inserted ESC (${byteToHex(BYTE_ESC)}) prefix.`,
        });
      }
    } else if (byte === BYTE_ESC) {
      escapedCount++;
      if (mode === ByteStuffingMode.RFC1662_PPP) {
        // RFC 1662: [0x7D, 0x7D ^ 0x20] -> [0x7D, 0x5D]
        stuffed.push(BYTE_ESC);
        stuffed.push(PPP_ESCAPED_ESC);
        trace.push({
          action: 'ESCAPE_ESC_PPP',
          originalIndex: i,
          byteValue: byte,
          hex: byteToHex(byte),
          escapedSequence: [byteToHex(BYTE_ESC), byteToHex(PPP_ESCAPED_ESC)],
          description: `Payload contains reserved ESC byte (${byteToHex(byte)}). Escaped per RFC 1662 as [${byteToHex(BYTE_ESC)}, ${byteToHex(PPP_ESCAPED_ESC)}] (0x7D XOR 0x20).`,
        });
      } else {
        // Generic educational escape: [0x7D, 0x7D]
        stuffed.push(BYTE_ESC);
        stuffed.push(BYTE_ESC);
        trace.push({
          action: 'ESCAPE_ESC_GENERIC',
          originalIndex: i,
          byteValue: byte,
          hex: byteToHex(byte),
          escapedSequence: [byteToHex(BYTE_ESC), byteToHex(BYTE_ESC)],
          description: `Payload contains reserved ESC byte (${byteToHex(byte)}). Inserted ESC (${byteToHex(BYTE_ESC)}) prefix.`,
        });
      }
    } else {
      stuffed.push(byte);
      trace.push({
        action: 'PASS',
        originalIndex: i,
        byteValue: byte,
        hex: byteToHex(byte),
        description: `Normal data byte (${byteToHex(byte)}), passed through without stuffing.`,
      });
    }
  }

  // Framed byte sequence: [FLAG, ...stuffed, FLAG]
  const framed = [BYTE_FLAG, ...stuffed, BYTE_FLAG];

  return {
    originalBytes: input,
    stuffedBytes: new Uint8Array(stuffed),
    framedBytes: new Uint8Array(framed),
    escapedCount,
    mode,
    trace,
  };
}

/**
 * Perform byte unstuffing on a received byte sequence.
 * 
 * @param {Uint8Array|Array<number>} receivedBytes - The received bytes.
 * @param {boolean} [hasFlags=true] - Whether the input contains leading/trailing FLAG bytes.
 * @param {Object} [options={}]
 * @param {string} [options.mode=ByteStuffingMode.RFC1662_PPP] - RFC1662_PPP or GENERIC_ESCAPE.
 * @returns {Object} {
 *   destuffedBytes: Uint8Array,
 *   removedEscapeCount: number,
 *   mode: string,
 *   trace: Array<Object>,
 *   hasError: boolean,
 *   errorMessage: string|null
 * }
 */
export function unstuffBytes(receivedBytes, hasFlags = true, options = {}) {
  const mode = options.mode || ByteStuffingMode.RFC1662_PPP;
  const input = receivedBytes instanceof Uint8Array ? receivedBytes : new Uint8Array(receivedBytes);

  let bytesToProcess = input;

  // Validate and strip framing flags if present
  if (hasFlags) {
    if (bytesToProcess.length < 2) {
      return {
        destuffedBytes: new Uint8Array(0),
        removedEscapeCount: 0,
        mode,
        trace: [],
        hasError: true,
        errorMessage: 'Frame is too short to contain opening and closing FLAG bytes.',
      };
    }

    if (bytesToProcess[0] !== BYTE_FLAG || bytesToProcess[bytesToProcess.length - 1] !== BYTE_FLAG) {
      return {
        destuffedBytes: new Uint8Array(0),
        removedEscapeCount: 0,
        mode,
        trace: [],
        hasError: true,
        errorMessage: `Missing required opening or closing FLAG byte (${byteToHex(BYTE_FLAG)}).`,
      };
    }

    // Strip leading and trailing flags
    bytesToProcess = bytesToProcess.slice(1, bytesToProcess.length - 1);
  }

  const destuffed = [];
  const trace = [];
  let removedEscapeCount = 0;

  for (let i = 0; i < bytesToProcess.length; i++) {
    const byte = bytesToProcess[i];

    if (byte === BYTE_ESC) {
      // Lookahead to the next escaped byte
      if (i + 1 >= bytesToProcess.length) {
        return {
          destuffedBytes: new Uint8Array(destuffed),
          removedEscapeCount,
          mode,
          trace,
          hasError: true,
          errorMessage: `Dangling ESC byte (${byteToHex(BYTE_ESC)}) at index ${i} with no escaped byte following.`,
        };
      }

      const nextByte = bytesToProcess[i + 1];

      if (mode === ByteStuffingMode.RFC1662_PPP) {
        // RFC 1662 validation: next byte must be 0x5E (for flag) or 0x5D (for esc)
        if (nextByte !== PPP_ESCAPED_FLAG && nextByte !== PPP_ESCAPED_ESC) {
          return {
            destuffedBytes: new Uint8Array(destuffed),
            removedEscapeCount,
            mode,
            trace,
            hasError: true,
            errorMessage: `Invalid RFC 1662 escape sequence: ESC (${byteToHex(BYTE_ESC)}) followed by unexpected octet ${byteToHex(nextByte)} at index ${i + 1}. Expected 0x5E or 0x5D.`,
          };
        }

        // Unstuff: invert 5th bit (XOR with 0x20)
        const recoveredByte = nextByte ^ ESC_XOR;
        destuffed.push(recoveredByte);
        removedEscapeCount++;
        trace.push({
          action: 'UNSTUFF_PPP',
          receivedIndex: i,
          escapedOctet: byteToHex(nextByte),
          recoveredByte: byteToHex(recoveredByte),
          description: `Discarded ESC (${byteToHex(BYTE_ESC)}) at index ${i}; unescaped octet ${byteToHex(nextByte)} ^ 0x20 -> ${byteToHex(recoveredByte)}.`,
        });
        i++; // Skip the following escaped octet
      } else {
        // Generic educational escape mode
        if (nextByte !== BYTE_FLAG && nextByte !== BYTE_ESC) {
          return {
            destuffedBytes: new Uint8Array(destuffed),
            removedEscapeCount,
            mode,
            trace,
            hasError: true,
            errorMessage: `Invalid escape sequence: ESC (${byteToHex(BYTE_ESC)}) followed by unexpected byte ${byteToHex(nextByte)} at index ${i + 1}. Expected 0x7E or 0x7D.`,
          };
        }

        destuffed.push(nextByte);
        removedEscapeCount++;
        trace.push({
          action: 'UNSTUFF_GENERIC',
          receivedIndex: i,
          byteValue: nextByte,
          hex: byteToHex(nextByte),
          description: `Discarded ESC byte at index ${i}; decoded escaped byte ${byteToHex(nextByte)}.`,
        });
        i++; // Skip the escaped byte
      }
    } else if (byte === BYTE_FLAG) {
      // Unescaped FLAG inside payload is a framing violation
      return {
        destuffedBytes: new Uint8Array(destuffed),
        removedEscapeCount,
        mode,
        trace,
        hasError: true,
        errorMessage: `Framing violation: Unescaped FLAG byte (${byteToHex(BYTE_FLAG)}) found inside payload at index ${i}.`,
      };
    } else {
      destuffed.push(byte);
      trace.push({
        action: 'PASS',
        receivedIndex: i,
        byteValue: byte,
        hex: byteToHex(byte),
        description: `Normal byte ${byteToHex(byte)} accepted literally.`,
      });
    }
  }

  return {
    destuffedBytes: new Uint8Array(destuffed),
    removedEscapeCount,
    mode,
    trace,
    hasError: false,
    errorMessage: null,
  };
}
