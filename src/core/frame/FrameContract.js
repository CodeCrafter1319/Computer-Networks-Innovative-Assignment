/**
 * FrameContract.js
 * 
 * Reusable Data Link Layer Frame Contract and Serialization Model.
 * 
 * Design Principles:
 * 1. Plain Object Representation: Uses pure serializable JavaScript objects so that
 *    cloning (structuredClone / JSON) never loses prototypes or methods.
 * 2. Distinct Layer Separation:
 *    - Logical Frame: Semantic fields (type, seq, ack, payload).
 *    - Serialized Wire Bytes: Header bytes + payload bytes (what FCS is computed over).
 *    - Encoded Physical Stream: Delimited and stuffed bit/byte stream (output of framing).
 * 3. Error-Detection Transparency: Error detection (CRC / Checksum) is computed over
 *    the exact serialized header and payload bytes, NOT over arbitrary JSON stringifications.
 */

export const FrameType = Object.freeze({
  DATA: 'DATA',
  ACK: 'ACK',
  NACK: 'NACK',
});

let _globalFrameCounter = 0;

/**
 * Reset the global frame ID counter (primarily for test repeatability).
 */
export function resetFrameIdCounter() {
  _globalFrameCounter = 0;
}

/**
 * Factory function creating a canonical, serializable plain Frame object.
 * 
 * @param {Object} options
 * @param {string} [options.type=FrameType.DATA] - 'DATA' | 'ACK' | 'NACK'
 * @param {number} [options.seq=0] - Sequence number (integer >= 0)
 * @param {number} [options.ack=0] - Acknowledgement number (integer >= 0)
 * @param {string|Uint8Array} [options.payload=''] - Upper-layer data payload
 * @param {string} [options.payloadText=''] - Human-readable text representation
 * @param {string|number|null} [options.fcs=null] - Computed error-detection code
 * @param {string} [options.fcsType='NONE'] - 'CRC_4' | 'CRC_8' | 'CRC_16' | 'CHECKSUM' | 'PARITY' | 'NONE'
 * @param {string} [options.rawBits=''] - Serialized header + payload + fcs in binary bits
 * @param {string} [options.stuffedBits=''] - Delimited and stuffed physical stream
 * @param {number|null} [options.sentTick=null] - Virtual clock tick at transmission
 * @param {number|null} [options.deliveryTick=null] - Expected arrival tick
 * @param {number} [options.attempt=1] - Transmission attempt count
 * @param {number} [options.id] - Optional custom ID; if omitted, automatically assigned
 * @returns {Object} Plain JavaScript Frame object
 */
export function createFrame(options = {}) {
  const type = options.type || FrameType.DATA;
  const seq = typeof options.seq === 'number' ? options.seq : 0;
  const ack = typeof options.ack === 'number' ? options.ack : 0;
  const id = options.id ?? ++_globalFrameCounter;

  let payload = options.payload ?? '';
  let payloadText = options.payloadText ?? '';
  if (typeof payload === 'string' && !payloadText) {
    payloadText = payload;
  } else if (payload instanceof Uint8Array && !payloadText) {
    try {
      payloadText = new TextDecoder().decode(payload);
    } catch {
      payloadText = '[Binary Data]';
    }
  }

  return {
    id,
    type,
    seq,
    ack,
    payload,
    payloadText,
    fcs: options.fcs ?? null,
    fcsType: options.fcsType || 'NONE',
    rawBits: options.rawBits || '',
    stuffedBits: options.stuffedBits || '',
    sentTick: options.sentTick ?? null,
    deliveryTick: options.deliveryTick ?? null,
    attempt: options.attempt ?? 1,
    corrupted: false,
    metadata: options.metadata ? { ...options.metadata } : {},
  };
}

/**
 * Serialize frame header fields into a 1-byte or 2-byte network representation.
 * 
 * Header byte format (for sequence space m <= 3, fits in 1 byte):
 * - Bit 7..6: Frame Type (00 = DATA, 01 = ACK, 10 = NACK)
 * - Bit 5..3: Sequence Number (3 bits: 0..7)
 * - Bit 2..0: Acknowledgement Number (3 bits: 0..7)
 * 
 * For m > 3, uses 2 bytes:
 * - Byte 0: [Type: 2 bits, Seq: 6 bits]
 * - Byte 1: [Ack: 8 bits]
 * 
 * @param {string} type - 'DATA' | 'ACK' | 'NACK'
 * @param {number} seq - Sequence number
 * @param {number} ack - Acknowledgement number
 * @param {number} [m=3] - Sequence number width in bits
 * @returns {Uint8Array} Serialized header bytes
 */
export function serializeFrameHeader(type, seq, ack, m = 3) {
  let typeCode = 0;
  if (type === FrameType.ACK) typeCode = 1;
  else if (type === FrameType.NACK) typeCode = 2;

  const maxVal = (1 << m) - 1;
  const cleanSeq = seq & maxVal;
  const cleanAck = ack & maxVal;

  if (m <= 3) {
    // 1-byte compact header
    const headerByte = (typeCode << 6) | (cleanSeq << 3) | cleanAck;
    return new Uint8Array([headerByte]);
  } else {
    // 2-byte header
    const byte0 = (typeCode << 6) | (cleanSeq & 0x3f);
    const byte1 = cleanAck & 0xff;
    return new Uint8Array([byte0, byte1]);
  }
}

/**
 * Deserialize a raw header byte buffer into logical header fields.
 * 
 * @param {Uint8Array} headerBytes 
 * @param {number} [m=3] 
 * @returns {Object} { type: string, seq: number, ack: number, headerLength: number }
 */
export function deserializeFrameHeader(headerBytes, m = 3) {
  if (!(headerBytes instanceof Uint8Array) || headerBytes.length === 0) {
    throw new Error('headerBytes must be a non-empty Uint8Array.');
  }

  if (m <= 3) {
    const b = headerBytes[0];
    const typeCode = (b >> 6) & 0x03;
    const seq = (b >> 3) & 0x07;
    const ack = b & 0x07;

    let type = FrameType.DATA;
    if (typeCode === 1) type = FrameType.ACK;
    else if (typeCode === 2) type = FrameType.NACK;

    return { type, seq, ack, headerLength: 1 };
  } else {
    if (headerBytes.length < 2) {
      throw new Error('Header requires at least 2 bytes when m > 3.');
    }
    const b0 = headerBytes[0];
    const b1 = headerBytes[1];
    const typeCode = (b0 >> 6) & 0x03;
    const seq = b0 & 0x3f;
    const ack = b1;

    let type = FrameType.DATA;
    if (typeCode === 1) type = FrameType.ACK;
    else if (typeCode === 2) type = FrameType.NACK;

    return { type, seq, ack, headerLength: 2 };
  }
}

/**
 * Serialize a full logical frame into wire bytes [Header Bytes + Payload Bytes].
 * This is the exact byte stream over which FCS (CRC / Checksum) is computed.
 * 
 * @param {Object} frame - Plain Frame object
 * @param {number} [m=3] - Sequence number width in bits
 * @returns {Uint8Array} Wire bytes
 */
export function serializeFrameToWireBytes(frame, m = 3) {
  const header = serializeFrameHeader(frame.type, frame.seq, frame.ack, m);

  let payloadBytes;
  if (typeof frame.payload === 'string') {
    payloadBytes = new TextEncoder().encode(frame.payload);
  } else if (frame.payload instanceof Uint8Array) {
    payloadBytes = frame.payload;
  } else {
    payloadBytes = new Uint8Array(0);
  }

  const wireBytes = new Uint8Array(header.length + payloadBytes.length);
  wireBytes.set(header, 0);
  wireBytes.set(payloadBytes, header.length);
  return wireBytes;
}
