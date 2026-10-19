/**
 * checksum.js
 * 
 * 16-bit Internet Checksum Implementation (RFC 1071)
 * 
 * Mathematical Specification:
 * 1. Payload bytes are grouped into 16-bit words in Network Byte Order (Big-Endian).
 * 2. Odd-Length Padding Convention:
 *    If the payload contains an odd number of octets, the final octet is padded
 *    on the right with 0x00 (least significant byte) for checksum computation
 *    as specified in RFC 1071 Section 2.(B).
 * 3. One's-Complement Addition:
 *    Words are accumulated with end-around carry folding until the result fits
 *    within 16 bits (sum <= 0xFFFF).
 * 4. Checksum Field:
 *    The final 16-bit accumulated sum is bitwise inverted (~sum & 0xFFFF).
 * 5. Receiver Verification:
 *    Summing all received words plus the received checksum word with end-around
 *    carry folding produces 0xFFFF (all 1s, negative zero in 1's complement)
 *    for an uncorrupted transmission.
 */

/**
 * Format a 16-bit integer as a 4-digit hex string (e.g. "0x2A1F").
 * 
 * @param {number} num 
 * @returns {string}
 */
export function wordToHex(num) {
  return '0x' + (num & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Format a 16-bit integer as a 16-bit binary string.
 * 
 * @param {number} num 
 * @returns {string}
 */
export function wordToBin(num) {
  return (num & 0xffff).toString(2).padStart(16, '0');
}

/**
 * Convert raw payload input (string or byte array) to an array of 16-bit big-endian words.
 * 
 * @param {string|Uint8Array|Array<number>} input 
 * @returns {Object} {
 *   bytes: Uint8Array,
 *   words: Array<number>,
 *   hasPadding: boolean,
 *   paddedBytesCount: number
 * }
 */
export function payloadTo16BitWords(input) {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
      ? input
      : new Uint8Array(input || []);

  const words = [];
  const hasPadding = bytes.length % 2 !== 0;

  for (let i = 0; i < bytes.length; i += 2) {
    const highByte = bytes[i];
    const lowByte = i + 1 < bytes.length ? bytes[i + 1] : 0x00;
    const word = ((highByte << 8) | lowByte) >>> 0;
    words.push(word);
  }

  return {
    bytes,
    words,
    hasPadding,
    paddedBytesCount: hasPadding ? bytes.length + 1 : bytes.length,
  };
}

/**
 * Calculate the 16-bit Internet Checksum per RFC 1071.
 * 
 * @param {string|Uint8Array|Array<number>} input - Payload data.
 * @returns {Object} {
 *   bytes: Uint8Array,
 *   words: Array<number>,
 *   wordsHex: Array<string>,
 *   hasPadding: boolean,
 *   intermediateSum: number,
 *   finalSum: number,
 *   checksum: number,
 *   checksumHex: string,
 *   checksumBin: string,
 *   steps: Array<Object>
 * }
 */
export function calculateInternetChecksum(input) {
  const { bytes, words, hasPadding } = payloadTo16BitWords(input);

  if (words.length === 0) {
    // Empty payload RFC convention: sum is 0, checksum is 0xFFFF (or 0)
    return {
      bytes,
      words: [],
      wordsHex: [],
      hasPadding: false,
      intermediateSum: 0,
      finalSum: 0,
      checksum: 0xffff,
      checksumHex: '0xFFFF',
      checksumBin: '1111111111111111',
      steps: [
        {
          stepIndex: 0,
          description: 'Empty payload: sum is 0x0000; bitwise inverted checksum is 0xFFFF.',
        },
      ],
    };
  }

  let accumulator = 0;
  const steps = [];

  for (let idx = 0; idx < words.length; idx++) {
    const word = words[idx];
    const sumBefore = accumulator;
    accumulator += word;

    const hadCarry = accumulator > 0xffff;
    const carryValue = accumulator >>> 16;
    if (hadCarry) {
      accumulator = (accumulator & 0xffff) + carryValue;
    }

    steps.push({
      stepIndex: idx + 1,
      wordIndex: idx,
      word,
      wordHex: wordToHex(word),
      wordBin: wordToBin(word),
      sumBefore: wordToHex(sumBefore),
      rawSum: '0x' + (sumBefore + word).toString(16).toUpperCase(),
      hadCarry,
      carryValue,
      sumAfterFold: wordToHex(accumulator),
      isOddPadWord: hasPadding && idx === words.length - 1,
    });
  }

  // Ensure any lingering carries are completely folded
  while (accumulator > 0xffff) {
    accumulator = (accumulator & 0xffff) + (accumulator >>> 16);
  }

  const finalSum = accumulator & 0xffff;
  const checksum = (~finalSum) & 0xffff;

  return {
    bytes,
    words,
    wordsHex: words.map(wordToHex),
    hasPadding,
    finalSum,
    checksum,
    checksumHex: wordToHex(checksum),
    checksumBin: wordToBin(checksum),
    steps,
  };
}

/**
 * Receiver verification of received payload and received checksum.
 * 
 * In 1's complement arithmetic, adding all words plus the checksum word
 * yields 0xFFFF if the transmission is uncorrupted.
 * 
 * @param {string|Uint8Array|Array<number>} receivedPayload 
 * @param {number|string} receivedChecksum - Integer or hex string (e.g. 0x2A1F, '0x2A1F', '2A1F').
 * @returns {Object} {
 *   isValid: boolean,
 *   receiverSum: number,
 *   receiverSumHex: string,
 *   expectedSumHex: string,
 *   receivedChecksumVal: number,
 *   receivedChecksumHex: string,
 *   steps: Array<Object>,
 *   errorMessage: string|null
 * }
 */
export function verifyInternetChecksum(receivedPayload, receivedChecksum) {
  let checksumVal = 0;
  if (typeof receivedChecksum === 'number') {
    checksumVal = receivedChecksum & 0xffff;
  } else if (typeof receivedChecksum === 'string') {
    checksumVal = parseInt(receivedChecksum.trim().replace(/^0x/i, ''), 16) & 0xffff;
    if (isNaN(checksumVal)) {
      throw new Error(`Invalid receivedChecksum hex string: '${receivedChecksum}'.`);
    }
  } else {
    throw new Error('receivedChecksum must be a number or hex string.');
  }

  const { words, hasPadding } = payloadTo16BitWords(receivedPayload);
  const steps = [];
  let accumulator = 0;

  for (let idx = 0; idx < words.length; idx++) {
    const word = words[idx];
    const sumBefore = accumulator;
    accumulator += word;

    const hadCarry = accumulator > 0xffff;
    const carry = accumulator >>> 16;
    if (hadCarry) {
      accumulator = (accumulator & 0xffff) + carry;
    }

    steps.push({
      stepIndex: idx + 1,
      type: 'PAYLOAD_WORD',
      word,
      wordHex: wordToHex(word),
      sumBefore: wordToHex(sumBefore),
      hadCarry,
      sumAfterFold: wordToHex(accumulator),
    });
  }

  // Add the transmitted checksum word
  const sumBeforeChecksum = accumulator;
  accumulator += checksumVal;
  const carryAfterChecksum = accumulator >>> 16;
  if (carryAfterChecksum > 0) {
    accumulator = (accumulator & 0xffff) + carryAfterChecksum;
  }

  while (accumulator > 0xffff) {
    accumulator = (accumulator & 0xffff) + (accumulator >>> 16);
  }

  const receiverSum = accumulator & 0xffff;
  const isValid = receiverSum === 0xffff;

  steps.push({
    stepIndex: words.length + 1,
    type: 'CHECKSUM_WORD',
    word: checksumVal,
    wordHex: wordToHex(checksumVal),
    sumBefore: wordToHex(sumBeforeChecksum),
    hadCarry: carryAfterChecksum > 0,
    sumAfterFold: wordToHex(receiverSum),
  });

  return {
    isValid,
    receiverSum,
    receiverSumHex: wordToHex(receiverSum),
    expectedSumHex: '0xFFFF',
    receivedChecksumVal: checksumVal,
    receivedChecksumHex: wordToHex(checksumVal),
    hasPadding,
    steps,
    errorMessage: isValid
      ? null
      : `Checksum verification failure: receiver sum is ${wordToHex(receiverSum)}, expected 0xFFFF. Transmission is corrupted.`,
  };
}
