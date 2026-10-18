/**
 * bitStuffing.js
 * 
 * Bit Stuffing and Destuffing (HDLC / High-Level Data Link Control Standard)
 * 
 * Framing Convention:
 * - Flag sequence: 01111110 (0x7E) delimits the beginning and end of each frame.
 * - Stuffing rule: When the transmitter detects five consecutive '1' bits in the payload,
 *   it automatically injects a '0' bit immediately following the fifth '1'.
 * - Destuffing rule: When the receiver detects five consecutive '1' bits followed by a '0',
 *   the '0' is automatically discarded (destuffed).
 * - Abort / Error detection: If six consecutive '1' bits followed by a '1' (seven '1's) occur,
 *   it violates framing and is treated as a channel error or abort sequence.
 */

export const BIT_FLAG = '01111110';

/**
 * Validates that an input is a valid binary bit string (containing only '0' and '1').
 * 
 * @param {string} bitString 
 * @returns {boolean}
 */
export function isValidBitString(bitString) {
  if (typeof bitString !== 'string') return false;
  return /^[01]*$/.test(bitString);
}

/**
 * Converts UTF-8 text into a binary bit string.
 * 
 * @param {string} text 
 * @returns {string} Binary string representation of 8-bit bytes.
 */
export function textToBitString(text) {
  if (typeof text !== 'string') {
    throw new Error('Input must be a string.');
  }
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let bitString = '';
  for (let i = 0; i < bytes.length; i++) {
    bitString += bytes[i].toString(2).padStart(8, '0');
  }
  return bitString;
}

/**
 * Converts a binary bit string back into UTF-8 text.
 * 
 * @param {string} bitString 
 * @returns {string} Decoded text.
 */
export function bitStringToText(bitString) {
  if (!isValidBitString(bitString)) {
    throw new Error('Invalid bit string. Must contain only 0 and 1.');
  }
  if (bitString.length % 8 !== 0) {
    throw new Error(`Bit string length (${bitString.length}) must be a multiple of 8 to decode to text.`);
  }
  const bytes = new Uint8Array(bitString.length / 8);
  for (let i = 0; i < bitString.length; i += 8) {
    bytes[i / 8] = parseInt(bitString.substring(i, i + 8), 2);
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return decoder.decode(bytes);
}

/**
 * Stuffs a binary payload by inserting a '0' after every five consecutive '1's.
 * 
 * @param {string} payloadBits - Binary payload string.
 * @returns {Object} {
 *   originalBits: string,
 *   stuffedBits: string,
 *   framedBits: string,
 *   stuffingCount: number,
 *   insertionIndices: Array<number>, // Indices in stuffedBits where '0' was inserted
 *   trace: Array<Object>
 * }
 */
export function stuffBits(payloadBits) {
  if (!isValidBitString(payloadBits)) {
    throw new Error('Invalid payload: must be a string containing only 0 and 1.');
  }

  let stuffedBits = '';
  let consecutiveOnes = 0;
  let stuffingCount = 0;
  const insertionIndices = [];
  const trace = [];

  for (let i = 0; i < payloadBits.length; i++) {
    const bit = payloadBits[i];
    stuffedBits += bit;

    if (bit === '1') {
      consecutiveOnes++;
      if (consecutiveOnes === 5) {
        // Stuff a '0' bit
        stuffedBits += '0';
        stuffingCount++;
        const stuffedIndex = stuffedBits.length - 1;
        insertionIndices.push(stuffedIndex);
        trace.push({
          action: 'STUFF',
          originalIndex: i,
          stuffedIndex,
          description: `Detected 5 consecutive '1's ending at original index ${i}. Inserted stuffed '0' at stuffed index ${stuffedIndex}.`,
        });
        consecutiveOnes = 0; // Reset counter after stuffing
      }
    } else {
      consecutiveOnes = 0;
    }
  }

  const framedBits = `${BIT_FLAG}${stuffedBits}${BIT_FLAG}`;

  return {
    originalBits: payloadBits,
    stuffedBits,
    framedBits,
    stuffingCount,
    insertionIndices,
    trace,
  };
}

/**
 * Destuffs a received bit sequence.
 * Can handle either a full framed string (with leading and trailing flags)
 * or raw stuffed bits.
 * 
 * @param {string} receivedBits - The received binary string.
 * @param {boolean} [hasFlags=true] - Whether the stream contains boundary flags.
 * @returns {Object} {
 *   destuffedBits: string,
 *   removedCount: number,
 *   removedIndices: Array<number>,
 *   trace: Array<Object>,
 *   hasError: boolean,
 *   errorMessage: string|null
 * }
 */
export function destuffBits(receivedBits, hasFlags = true) {
  if (!isValidBitString(receivedBits)) {
    throw new Error('Invalid received bits: must contain only 0 and 1.');
  }

  let bitsToProcess = receivedBits;

  // If framed with flags, validate and strip them
  if (hasFlags) {
    if (bitsToProcess.length < BIT_FLAG.length * 2) {
      return {
        destuffedBits: '',
        removedCount: 0,
        removedIndices: [],
        trace: [],
        hasError: true,
        errorMessage: `Frame too short to contain opening and closing flags (minimum ${BIT_FLAG.length * 2} bits required).`,
      };
    }

    const startFlag = bitsToProcess.substring(0, BIT_FLAG.length);
    const endFlag = bitsToProcess.substring(bitsToProcess.length - BIT_FLAG.length);

    if (startFlag !== BIT_FLAG || endFlag !== BIT_FLAG) {
      return {
        destuffedBits: '',
        removedCount: 0,
        removedIndices: [],
        trace: [],
        hasError: true,
        errorMessage: 'Invalid framing: Missing standard opening or closing flag (01111110).',
      };
    }

    // Strip opening and closing flags
    bitsToProcess = bitsToProcess.substring(BIT_FLAG.length, bitsToProcess.length - BIT_FLAG.length);
  }

  let destuffedBits = '';
  let consecutiveOnes = 0;
  let removedCount = 0;
  const removedIndices = [];
  const trace = [];

  for (let i = 0; i < bitsToProcess.length; i++) {
    const bit = bitsToProcess[i];

    if (consecutiveOnes === 5) {
      if (bit === '0') {
        // This is a stuffed bit: remove it!
        removedCount++;
        removedIndices.push(i);
        trace.push({
          action: 'DESTUFF',
          receivedIndex: i,
          description: `Found '0' following five consecutive '1's at index ${i}. Discarded stuffed bit.`,
        });
        consecutiveOnes = 0;
        continue; // Skip appending the stuffed '0'
      } else {
        // Six consecutive ones detected in payload stream:
        // In valid stuffed data, five 1s must be followed by a stuffed 0.
        // Six consecutive 1s indicates an unescaped flag, an abort sequence, or channel noise.
        const hasMoreBits = i + 1 < bitsToProcess.length;
        const nextBit = hasMoreBits ? bitsToProcess[i + 1] : null;

        if (nextBit === '1') {
          return {
            destuffedBits,
            removedCount,
            removedIndices,
            trace,
            hasError: true,
            errorMessage: `Framing error / Abort sequence: detected seven or more consecutive '1's starting around index ${i - 5}.`,
          };
        } else if (nextBit === '0') {
          return {
            destuffedBits,
            removedCount,
            removedIndices,
            trace,
            hasError: true,
            errorMessage: `Framing violation: Unescaped delimiter flag pattern (01111110) found inside payload at index ${i - 5}.`,
          };
        } else {
          return {
            destuffedBits,
            removedCount,
            removedIndices,
            trace,
            hasError: true,
            errorMessage: `Framing error: Stream ended with six consecutive '1's without required stuffed zero at index ${i}.`,
          };
        }
      }
    }

    destuffedBits += bit;

    if (bit === '1') {
      consecutiveOnes++;
    } else {
      consecutiveOnes = 0;
    }
  }

  return {
    destuffedBits,
    removedCount,
    removedIndices,
    trace,
    hasError: false,
    errorMessage: null,
  };
}
