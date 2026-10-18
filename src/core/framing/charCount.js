/**
 * charCount.js
 * 
 * Character-Count / Byte-Count Framing (Tanenbaum Standard)
 * 
 * Explicit Framing Convention:
 * - Each frame begins with a 1-byte header containing the TOTAL length of the frame
 *   in bytes (including the length byte itself).
 * - For example, a payload of 4 bytes ('D','A','T','A') is encoded as:
 *   [5, 'D', 'A', 'T', 'A'] (Total Length = 1 byte header + 4 payload bytes = 5).
 * - Consecutive frames are concatenated in a single transmission stream:
 *   [5, 'D', 'A', 'T', 'A', 4, 'C', 'N', '1'] -> Frame 1 (len 5), Frame 2 (len 4).
 * 
 * The Desynchronization Problem:
 * - If a single length field is corrupted during transmission, the receiver looks for the
 *   next frame header at the wrong offset. This causes catastrophic cascading desynchronization,
 *   as normal payload bytes are misinterpreted as length headers.
 */

import { textToBytes, bytesToText, byteToHex } from './byteStuffing.js';

export const MAX_FRAME_PAYLOAD_SIZE = 254; // 1 byte length header can represent lengths up to 255 (255 - 1)

/**
 * Encode a single payload into a length-prefixed frame.
 * 
 * @param {Uint8Array|string} payload - Raw bytes or text string.
 * @returns {Object} {
 *   originalBytes: Uint8Array,
 *   totalLength: number,
 *   lengthHeader: number,
 *   frameBytes: Uint8Array,
 *   trace: Object
 * }
 */
export function encodeFrame(payload) {
  const bytes = typeof payload === 'string' ? textToBytes(payload) : new Uint8Array(payload);

  if (bytes.length > MAX_FRAME_PAYLOAD_SIZE) {
    throw new Error(
      `Payload size (${bytes.length} bytes) exceeds maximum allowable 1-byte length count (${MAX_FRAME_PAYLOAD_SIZE} bytes).`
    );
  }

  const totalLength = bytes.length + 1; // 1 byte for length header itself
  const frameBytes = new Uint8Array(totalLength);
  frameBytes[0] = totalLength;
  frameBytes.set(bytes, 1);

  return {
    originalBytes: bytes,
    totalLength,
    lengthHeader: totalLength,
    frameBytes,
    trace: {
      payloadByteCount: bytes.length,
      headerByteCount: 1,
      totalLengthByte: totalLength,
      hexHeader: byteToHex(totalLength),
      description: `Payload of ${bytes.length} bytes encoded with length header ${totalLength} (1 header + ${bytes.length} payload).`,
    },
  };
}

/**
 * Encode multiple payloads into a continuous byte stream of concatenated frames.
 * 
 * @param {Array<Uint8Array|string>} payloads - List of payloads.
 * @returns {Object} {
 *   frames: Array<Object>,
 *   streamBytes: Uint8Array,
 *   totalBytes: number,
 *   trace: Array<Object>
 * }
 */
export function encodeMultipleFrames(payloads) {
  if (!Array.isArray(payloads) || payloads.length === 0) {
    return {
      frames: [],
      streamBytes: new Uint8Array(0),
      totalBytes: 0,
      trace: [],
    };
  }

  const encodedFrames = payloads.map((p, idx) => {
    const encoded = encodeFrame(p);
    return {
      frameIndex: idx,
      ...encoded,
    };
  });

  const totalBytesCount = encodedFrames.reduce((acc, f) => acc + f.totalLength, 0);
  const streamBytes = new Uint8Array(totalBytesCount);

  let offset = 0;
  for (const f of encodedFrames) {
    streamBytes.set(f.frameBytes, offset);
    offset += f.totalLength;
  }

  return {
    frames: encodedFrames,
    streamBytes,
    totalBytes: totalBytesCount,
    trace: encodedFrames.map((f) => ({
      frameIndex: f.frameIndex,
      headerValue: f.lengthHeader,
      payloadLength: f.originalBytes.length,
      ...f.trace,
    })),
  };
}

/**
 * Decode a continuous stream of character-count length-prefixed frames.
 * 
 * @param {Uint8Array|Array<number>} streamBytes - The byte stream to parse.
 * @returns {Object} {
 *   frames: Array<Object>,
 *   hasError: boolean,
 *   error: Object|null,
 *   trace: Array<Object>
 * }
 */
export function decodeFrameStream(streamBytes) {
  const bytes = streamBytes instanceof Uint8Array ? streamBytes : new Uint8Array(streamBytes);
  const frames = [];
  const trace = [];
  let offset = 0;
  let frameIndex = 0;

  if (bytes.length === 0) {
    return {
      frames: [],
      hasError: false,
      error: null,
      trace: [],
    };
  }

  while (offset < bytes.length) {
    const headerOffset = offset;
    const lengthHeader = bytes[offset];

    // Validation 1: Length header must be at least 1 (the header byte itself)
    if (lengthHeader < 1) {
      const error = {
        frameIndex,
        offset: headerOffset,
        lengthHeader,
        message: `Invalid frame length header ${lengthHeader} at byte offset ${headerOffset}. Total length must be >= 1.`,
      };
      trace.push({ action: 'ERROR', ...error });
      return { frames, hasError: true, error, trace };
    }

    const payloadLength = lengthHeader - 1;
    const frameEndOffset = offset + lengthHeader;

    // Validation 2: Ensure stream contains the full claimed frame length
    if (frameEndOffset > bytes.length) {
      const error = {
        frameIndex,
        offset: headerOffset,
        lengthHeader,
        expectedBytesRemaining: lengthHeader,
        actualBytesRemaining: bytes.length - offset,
        message: `Truncated frame: Length header at offset ${headerOffset} specifies ${lengthHeader} bytes, but only ${bytes.length - offset} bytes remain in stream.`,
      };
      trace.push({ action: 'ERROR', ...error });
      return { frames, hasError: true, error, trace };
    }

    // Extract payload bytes
    const payloadBytes = bytes.slice(offset + 1, frameEndOffset);

    // Try text decoding safely
    let payloadText = null;
    try {
      payloadText = bytesToText(payloadBytes);
    } catch {
      payloadText = '[Binary Data]';
    }

    const frameRecord = {
      frameIndex,
      headerOffset,
      lengthHeader,
      payloadLength,
      payloadBytes,
      payloadText,
      totalLength: lengthHeader,
    };

    frames.push(frameRecord);
    trace.push({
      action: 'DECODE_FRAME',
      frameIndex,
      headerOffset,
      lengthHeader,
      payloadLength,
      description: `Decoded Frame ${frameIndex}: Length ${lengthHeader} at offset ${headerOffset} -> Extracted ${payloadLength} payload bytes.`,
    });

    // Advance offset to the next frame
    offset = frameEndOffset;
    frameIndex++;
  }

  return {
    frames,
    hasError: false,
    error: null,
    trace,
  };
}

/**
 * Demonstrates framing desynchronization by injecting an intentional error into a length header.
 * 
 * @param {Array<string>} payloads - List of text payloads.
 * @param {number} targetFrameIndex - Which frame's length header to corrupt.
 * @param {number} corruptedLengthValue - The altered length header byte value.
 * @returns {Object} Full comparison report between clean and corrupted streams.
 */
export function simulateLengthCorruption(payloads, targetFrameIndex = 0, corruptedLengthValue = 8) {
  // 1. Clean encode
  const cleanEncoding = encodeMultipleFrames(payloads);
  const cleanDecoding = decodeFrameStream(cleanEncoding.streamBytes);

  // 2. Locate target frame's length byte in the stream
  let targetByteOffset = 0;
  for (let i = 0; i < targetFrameIndex; i++) {
    if (cleanEncoding.frames[i]) {
      targetByteOffset += cleanEncoding.frames[i].totalLength;
    }
  }

  // 3. Create corrupted stream copy
  const corruptedStream = new Uint8Array(cleanEncoding.streamBytes);
  const originalLengthValue = corruptedStream[targetByteOffset];
  corruptedStream[targetByteOffset] = corruptedLengthValue;

  // 4. Attempt decoding of corrupted stream
  const corruptedDecoding = decodeFrameStream(corruptedStream);

  return {
    cleanStream: cleanEncoding.streamBytes,
    corruptedStream,
    targetFrameIndex,
    targetByteOffset,
    originalLengthValue,
    corruptedLengthValue,
    cleanFrames: cleanDecoding.frames,
    corruptedFrames: corruptedDecoding.frames,
    hasDesynchronization:
      corruptedDecoding.hasError ||
      corruptedDecoding.frames.length !== cleanDecoding.frames.length,
    decodingError: corruptedDecoding.error,
    trace: corruptedDecoding.trace,
    explanation:
      `Corrupted length header of Frame ${targetFrameIndex} from ${originalLengthValue} to ${corruptedLengthValue} at offset ${targetByteOffset}. ` +
      `The receiver reads ${corruptedLengthValue} bytes for Frame ${targetFrameIndex}, shifting the next frame header offset from ` +
      `${targetByteOffset + originalLengthValue} to ${targetByteOffset + corruptedLengthValue}. ` +
      (corruptedDecoding.hasError
        ? `Result: Receiver hit a fatal desynchronization error: "${corruptedDecoding.error?.message}".`
        : `Result: Receiver decoded ${corruptedDecoding.frames.length} frames instead of ${cleanDecoding.frames.length} expected frames due to boundary shift.`),
  };
}
