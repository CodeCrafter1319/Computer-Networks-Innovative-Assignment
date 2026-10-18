/**
 * byteStuffing.js
 * 
 * Byte / Character Stuffing (PPP / Tanenbaum Data Link Layer Standard)
 * 
 * Explicit Conventions:
 * - FLAG Byte:   0x7E (126 in decimal, '~' in ASCII)
 * - ESCAPE Byte: 0x7D (125 in decimal, '}' in ASCII)
 * 
 * Framing Rules:
 * - Each frame begins and ends with the FLAG byte (0x7E).
 * - If a FLAG byte (0x7E) appears inside the payload, it is escaped by inserting an ESC byte
 *   immediately before it: [0x7E] -> [0x7D, 0x7E].
 * - If an ESC byte (0x7D) appears inside the payload, it is escaped by inserting an ESC byte
 *   immediately before it: [0x7D] -> [0x7D, 0x7D].
 * - All other bytes pass through unchanged.
 * 
 * Receiver Unstuffing Rules:
 * - The receiver strips the leading and trailing FLAG bytes.
 * - When an ESC byte (0x7D) is encountered, it is discarded, and the following byte is taken literally.
 * - An ESC byte at the very end of the payload without a following byte is an invalid escape error.
 */

export const BYTE_FLAG = 0x7e; // 126, 01111110
export const BYTE_ESC = 0x7d;  // 125, 01111101

/**
 * Format a byte integer as a 2-digit uppercase hex string (e.g. 0x7E).
 * 
 * @param {number} byteValue 
 * @returns {string}
 */
export function byteToHex(byteValue) {
  return '0x' + byteValue.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Format a byte integer as an 8-bit binary string.
 * 
 * @param {number} byteValue 
 * @returns {string}
 */
export function byteToBin(byteValue) {
  return byteValue.toString(2).padStart(8, '0');
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
 * @returns {Object} {
 *   originalBytes: Uint8Array,
 *   stuffedBytes: Uint8Array,
 *   framedBytes: Uint8Array,
 *   escapedCount: number,
 *   trace: Array<Object>
 * }
 */
export function stuffBytes(payloadBytes) {
  const input = payloadBytes instanceof Uint8Array ? payloadBytes : new Uint8Array(payloadBytes);
  const stuffed = [];
  const trace = [];
  let escapedCount = 0;

  for (let i = 0; i < input.length; i++) {
    const byte = input[i];

    if (byte === BYTE_FLAG) {
      // Escape FLAG: insert ESC followed by FLAG
      stuffed.push(BYTE_ESC);
      stuffed.push(BYTE_FLAG);
      escapedCount++;
      trace.push({
        action: 'ESCAPE_FLAG',
        originalIndex: i,
        byteValue: byte,
        hex: byteToHex(byte),
        description: `Payload contains reserved FLAG byte (${byteToHex(byte)}). Inserted ESC (${byteToHex(BYTE_ESC)}) prefix.`,
      });
    } else if (byte === BYTE_ESC) {
      // Escape ESC: insert ESC followed by ESC
      stuffed.push(BYTE_ESC);
      stuffed.push(BYTE_ESC);
      escapedCount++;
      trace.push({
        action: 'ESCAPE_ESC',
        originalIndex: i,
        byteValue: byte,
        hex: byteToHex(byte),
        description: `Payload contains reserved ESC byte (${byteToHex(byte)}). Inserted ESC (${byteToHex(BYTE_ESC)}) prefix.`,
      });
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
    trace,
  };
}

/**
 * Perform byte unstuffing on a received byte sequence.
 * 
 * @param {Uint8Array|Array<number>} receivedBytes - The received bytes.
 * @param {boolean} [hasFlags=true] - Whether the input contains leading/trailing FLAG bytes.
 * @returns {Object} {
 *   destuffedBytes: Uint8Array,
 *   removedEscapeCount: number,
 *   trace: Array<Object>,
 *   hasError: boolean,
 *   errorMessage: string|null
 * }
 */
export function unstuffBytes(receivedBytes, hasFlags = true) {
  const input = receivedBytes instanceof Uint8Array ? receivedBytes : new Uint8Array(receivedBytes);

  let bytesToProcess = input;

  // Validate and strip framing flags if present
  if (hasFlags) {
    if (bytesToProcess.length < 2) {
      return {
        destuffedBytes: new Uint8Array(0),
        removedEscapeCount: 0,
        trace: [],
        hasError: true,
        errorMessage: 'Frame is too short to contain opening and closing FLAG bytes.',
      };
    }

    if (bytesToProcess[0] !== BYTE_FLAG || bytesToProcess[bytesToProcess.length - 1] !== BYTE_FLAG) {
      return {
        destuffedBytes: new Uint8Array(0),
        removedEscapeCount: 0,
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
          trace,
          hasError: true,
          errorMessage: `Dangling ESC byte (${byteToHex(BYTE_ESC)}) at index ${i} with no escaped byte following.`,
        };
      }

      const nextByte = bytesToProcess[i + 1];
      if (nextByte !== BYTE_FLAG && nextByte !== BYTE_ESC) {
        return {
          destuffedBytes: new Uint8Array(destuffed),
          removedEscapeCount,
          trace,
          hasError: true,
          errorMessage: `Invalid escape sequence: ESC (${byteToHex(BYTE_ESC)}) followed by unexpected byte ${byteToHex(nextByte)} at index ${i + 1}.`,
        };
      }

      // Unstuff: discard the ESC byte and accept nextByte literally
      destuffed.push(nextByte);
      removedEscapeCount++;
      trace.push({
        action: 'UNSTUFF_ESC',
        receivedIndex: i,
        byteValue: nextByte,
        hex: byteToHex(nextByte),
        description: `Discarded ESC byte at index ${i}; decoded escaped byte ${byteToHex(nextByte)}.`,
      });
      i++; // Skip the escaped byte in next loop iteration
    } else if (byte === BYTE_FLAG) {
      // Unescaped FLAG inside payload is a framing violation
      return {
        destuffedBytes: new Uint8Array(destuffed),
        removedEscapeCount,
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
    trace,
    hasError: false,
    errorMessage: null,
  };
}
