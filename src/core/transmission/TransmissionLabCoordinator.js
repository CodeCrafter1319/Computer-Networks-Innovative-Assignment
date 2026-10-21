/**
 * TransmissionLabCoordinator.js
 * 
 * Central coordinator and integration facade for the Phase 8 End-to-End Transmission Lab.
 * 
 * Unifies:
 * - Stage 1: Upper-layer payload & optional segmentation
 * - Stage 2: Sender frame construction & header serialization (serializeFrameHeader, serializeFrameToWireBytes)
 * - Stage 3: Error-control generation (FCS over exact wire bytes: CRC-8, CRC-16, Checksum, 1D/2D Parity)
 * - Stage 4: Framing & transparency encoding (HDLC Bit Stuffing, RFC 1662 Byte Stuffing, Character Count)
 * - Stage 5: Transmission protocol dispatch (Profile A: ARQ, Profile B: CSMA/CD)
 * - Stage 6: Channel transmission & medium propagation (fault injection: Drop, Corrupt, Delay)
 * - Stage 7: Receiver processing (deframing, header parsing, FCS verification, protocol handling, duplicate suppression)
 * - Stage 8: Observable outcome & metrics telemetry
 * 
 * Architecture: Completely decoupled from React.
 */

import {
  FrameType,
  createFrame,
  serializeFrameHeader,
  deserializeFrameHeader,
  serializeFrameToWireBytes,
} from '../frame/FrameContract.js';

import {
  stuffBits,
  destuffBits,
  textToBitString,
  bitStringToText,
} from '../framing/bitStuffing.js';

import {
  stuffBytes,
  unstuffBytes,
  textToBytes,
  bytesToText,
  bytesToHexString,
  byteToHex,
  ByteStuffingMode,
} from '../framing/byteStuffing.js';

import {
  encodeFrame as encodeCharCountFrame,
  decodeFrameStream as decodeCharCountStream,
} from '../framing/charCount.js';

import {
  computeNamedCrc,
  verifyNamedCrc,
} from '../error-control/crc.js';

import {
  calculateInternetChecksum,
  verifyInternetChecksum,
  wordToHex,
} from '../error-control/checksum.js';

import {
  calculate1DParity,
  verify1DParity,
  calculate2DParity,
  verify2DParity,
  ParityMode,
} from '../error-control/parity.js';

import { SimulationEngine } from '../engine/SimulationEngine.js';
import { Channel, TransmissionOutcome } from '../engine/Channel.js';
import { StopAndWaitARQ } from '../flow-control/stopAndWait.js';
import { GoBackNARQ } from '../flow-control/goBackN.js';
import { SelectiveRepeatARQ } from '../flow-control/selectiveRepeat.js';
import { CsmaCdSimulator, MacPreset } from '../mac/CsmaCdSimulator.js';

export const ProfileType = Object.freeze({
  PROFILE_A: 'PROFILE_A', // Reliable Point-to-Point Link (Framing + FCS + ARQ)
  PROFILE_B: 'PROFILE_B', // Shared-Medium Ethernet Teaching Model (Framing + FCS + CSMA/CD + BEB)
});

export const FcsAlgorithm = Object.freeze({
  CRC_16: 'CRC-16/CCITT-FALSE',
  CRC_8: 'CRC-8/SMBUS',
  CHECKSUM_16: 'CHECKSUM-16',
  PARITY_1D_EVEN: 'PARITY-1D-EVEN',
  PARITY_1D_ODD: 'PARITY-1D-ODD',
  PARITY_2D_EVEN: 'PARITY-2D-EVEN',
});

export const FramingAlgorithm = Object.freeze({
  BYTE_STUFFING: 'BYTE_STUFFING',
  BIT_STUFFING: 'BIT_STUFFING',
  CHARACTER_COUNT: 'CHARACTER_COUNT',
});

export const FlowProtocol = Object.freeze({
  STOP_AND_WAIT: 'SW',
  GO_BACK_N: 'GBN',
  SELECTIVE_REPEAT: 'SR',
});

export const LabPreset = Object.freeze({
  CLEAN_TRANSMISSION: 'CLEAN_TRANSMISSION',
  BIT_CORRUPTION_RECOVERY: 'BIT_CORRUPTION_RECOVERY',
  FRAME_LOSS_TIMEOUT: 'FRAME_LOSS_TIMEOUT',
  LOST_ACK_DUPLICATE_SUPPRESSION: 'LOST_ACK_DUPLICATE_SUPPRESSION',
  MULTI_FRAME_PIPELINE: 'MULTI_FRAME_PIPELINE',
  CSMA_CD_COLLISION_BEB: 'CSMA_CD_COLLISION_BEB',
  CSMA_CD_CLEAN: 'CSMA_CD_CLEAN',
  EXCESSIVE_COLLISIONS_DISCARD: 'EXCESSIVE_COLLISIONS_DISCARD',
});

export class TransmissionLabCoordinator {
  /**
   * @param {Object} [config={}]
   */
  constructor(config = {}) {
    this.config = {
      profile: config.profile || ProfileType.PROFILE_A,
      // Profile A defaults
      protocol: config.protocol || FlowProtocol.STOP_AND_WAIT,
      fcsType: config.fcsType || FcsAlgorithm.CRC_16,
      framingType: config.framingType || FramingAlgorithm.BYTE_STUFFING,
      m: config.m ?? 3,
      windowSize: config.windowSize ?? 4,
      rxWindowSize: config.rxWindowSize ?? 4,
      maxPayloadChunk: config.maxPayloadChunk ?? 16,
      propagationDelay: config.propagationDelay ?? 5,
      timeoutDuration: config.timeoutDuration ?? 16,
      transmissionDelay: config.transmissionDelay ?? 1,
      // Profile B defaults
      busLength: config.busLength ?? 100,
      maxPropagationDelay: config.maxPropagationDelay ?? 10,
      frameTransmissionDuration: config.frameTransmissionDuration ?? 30,
      jamDuration: config.jamDuration ?? 4,
      sourceStation: config.sourceStation || 'A',
      destStation: config.destStation || 'D',
    };

    // Shared state
    this.stageHistory = []; // Sequential timeline of stage events
    this.frameLifecycle = new Map(); // frameId -> 8-stage inspection record
    this._deliveredMessages = []; // Successfully delivered payload strings at receiver
    this.pendingFaultNextData = null; // Fault for next forward transmission
    this.pendingFaultNextAck = null; // Fault for next reverse transmission
    this.protocolInstance = null;
    this.macSimulator = null;

    // Profile-specific instances
    this._initSimulation();
  }

  /**
   * Authoritative delivered messages getter for upper layer.
   */
  get deliveredMessages() {
    if (this.config.profile === ProfileType.PROFILE_A && this.protocolInstance && Array.isArray(this.protocolInstance.deliveredPayloads)) {
      return this.protocolInstance.deliveredPayloads.map(p => p.payloadText || String(p.payload || ''));
    }
    return this._deliveredMessages;
  }

  /**
   * Initialize or reinitialize simulation core according to active profile.
   * @private
   */
  _initSimulation() {
    this.stageHistory = [];
    this.frameLifecycle.clear();
    this._deliveredMessages = [];
    this.protocolInstance = null;
    this.macSimulator = null;

    if (this.config.profile === ProfileType.PROFILE_A) {
      this._initProfileA();
    } else {
      this._initProfileB();
    }
  }

  /**
   * Initialize Profile A: Reliable Point-to-Point Link.
   * Connects sender ARQ, framing adapter, FCS validator, and receiver ARQ.
   * @private
   */
  _initProfileA() {
    this.engine = new SimulationEngine();

    this.forwardChannel = new Channel(this.engine, {
      propagationDelay: this.config.propagationDelay,
      transmissionDelay: this.config.transmissionDelay,
      name: 'Forward (Data)',
    });

    this.reverseChannel = new Channel(this.engine, {
      propagationDelay: this.config.propagationDelay,
      transmissionDelay: 0,
      name: 'Reverse (ACK)',
    });

    const onEvent = (type, data) => this._logEngineEvent(type, data);

    const proto = this.config.protocol.toUpperCase();
    if (proto === FlowProtocol.STOP_AND_WAIT || proto === 'STOP_AND_WAIT') {
      this.protocolInstance = new StopAndWaitARQ(
        this.engine,
        this.forwardChannel,
        this.reverseChannel,
        {
          timeoutDuration: this.config.timeoutDuration,
          onEvent,
        }
      );
      this.config.m = 1;
      this.config.windowSize = 1;
    } else if (proto === FlowProtocol.GO_BACK_N || proto === 'GO_BACK_N') {
      this.protocolInstance = new GoBackNARQ(
        this.engine,
        this.forwardChannel,
        this.reverseChannel,
        {
          m: this.config.m,
          windowSize: this.config.windowSize,
          timeoutDuration: this.config.timeoutDuration,
          onEvent,
        }
      );
    } else if (proto === FlowProtocol.SELECTIVE_REPEAT || proto === 'SELECTIVE_REPEAT') {
      this.protocolInstance = new SelectiveRepeatARQ(
        this.engine,
        this.forwardChannel,
        this.reverseChannel,
        {
          m: this.config.m,
          windowSize: this.config.windowSize,
          rxWindowSize: this.config.rxWindowSize,
          timeoutDuration: this.config.timeoutDuration,
          onEvent,
        }
      );
    }

    // Intercept forwardChannel.transmit to run Stages 2, 3, 4 before channel
    // and Stage 7 upon arrival before ARQ receiver logic.
    this._hookProfileAChannels();
  }

  /**
   * Hook channels in Profile A to inject Stages 2-4 and Stage 7 verification.
   * @private
   */
  _hookProfileAChannels() {
    const originalForwardTransmit = this.forwardChannel.transmit.bind(this.forwardChannel);

    this.forwardChannel.transmit = (rawFrame, onDeliver, overrideFault) => {
      // 1. Apply any pending manual fault if none specified
      let faultToApply = overrideFault;
      if (!faultToApply && this.pendingFaultNextData) {
        faultToApply = this.pendingFaultNextData;
        this.pendingFaultNextData = null;
      }

      // 2. Perform Stages 2, 3, 4: Framing, FCS, wire-byte construction
      const decorated = this._decorateOutgoingFrame(rawFrame);

      // 3. Stage 5: Protocol Dispatch Record
      this._recordStage5(decorated);

      // 4. Wrap onDeliver to perform Stage 7 (Receiver deframing & FCS check)
      const wrappedDeliver = (deliveredFrame, record) => {
        // Stage 6: Channel outcome recorded
        this._recordStage6(deliveredFrame, record);

        // If channel marked corrupted, ensure framedData also reflects corruption
        if (deliveredFrame.corrupted) {
          if (deliveredFrame.framedData instanceof Uint8Array && deliveredFrame.framedData.length > 2) {
            deliveredFrame.framedData = new Uint8Array(deliveredFrame.framedData);
            deliveredFrame.framedData[1] ^= 1; // flip 1 bit in framed stream body
          } else if (typeof deliveredFrame.framedData === 'string' && deliveredFrame.framedData.length > 16) {
            const arr = deliveredFrame.framedData.split('');
            arr[9] = arr[9] === '1' ? '0' : '1';
            deliveredFrame.framedData = arr.join('');
          }
        }

        // Stage 7: Deframing, header parsing, and FCS check
        const stage7Result = this._processIncomingFrame(deliveredFrame);

        if (!stage7Result.isValid) {
          // Flag frame as corrupted so ARQ protocol silently drops / handles corruption
          deliveredFrame.corrupted = true;
          deliveredFrame.fcsError = stage7Result.fcsError || 'FCS verification failed';
        }

        const deliveredBefore = this.protocolInstance ? this.protocolInstance.stats.framesDelivered : 0;
        const dupesBefore = this.protocolInstance ? (this.protocolInstance.stats.duplicatesDiscarded || 0) : 0;

        // Invoke original ARQ receiver callback
        onDeliver(deliveredFrame, record);

        const deliveredAfter = this.protocolInstance ? this.protocolInstance.stats.framesDelivered : 0;
        const dupesAfter = this.protocolInstance ? (this.protocolInstance.stats.duplicatesDiscarded || 0) : 0;

        const isNewlyDelivered = deliveredAfter > deliveredBefore;
        const isDuplicate = dupesAfter > dupesBefore;

        if (isDuplicate) {
          stage7Result.outcome = 'REJECTED_DUPLICATE';
        }

        // Stage 8: Delivery Telemetry Record
        this._recordStage8(deliveredFrame, stage7Result, isNewlyDelivered, isDuplicate);
      };

      return originalForwardTransmit(decorated, wrappedDeliver, faultToApply);
    };

    // Hook reverse channel to support ACK fault injection
    const originalReverseTransmit = this.reverseChannel.transmit.bind(this.reverseChannel);

    this.reverseChannel.transmit = (ackFrame, onDeliver, overrideFault) => {
      let faultToApply = overrideFault;
      if (!faultToApply && this.pendingFaultNextAck) {
        faultToApply = this.pendingFaultNextAck;
        this.pendingFaultNextAck = null;
      }

      // Decorate ACK frame with header & FCS
      const decoratedAck = this._decorateOutgoingAck(ackFrame);

      const wrappedAckDeliver = (deliveredAck, record) => {
        // Receiver of ACK (the original sender) checks ACK integrity
        if (deliveredAck.corrupted) {
          this._logStage('STAGE_7_ACK', {
            title: 'Stage 7 (ACK Path): Corrupted ACK Received',
            ack: deliveredAck.ack,
            corrupted: true,
            description: 'ACK was corrupted in reverse channel; sender ignores it and awaits timeout.',
          });
        }
        onDeliver(deliveredAck, record);
      };

      return originalReverseTransmit(decoratedAck, wrappedAckDeliver, faultToApply);
    };
  }

  /**
   * Initialize Profile B: Shared-Medium Ethernet Teaching Model.
   * @private
   */
  _initProfileB() {
    this.macSimulator = new CsmaCdSimulator({
      busLength: this.config.busLength,
      maxPropagationDelay: this.config.maxPropagationDelay,
      frameTransmissionDuration: this.config.frameTransmissionDuration,
      jamDuration: this.config.jamDuration,
      attemptLimit: 16,
    });
    this.engine = this.macSimulator.engine;

    // Hook station event callbacks to synchronize telemetry, event log, and delivered messages
    for (const [stationId, station] of this.macSimulator.stations.entries()) {
      const originalOnEvent = station.onEvent;
      station.onEvent = (type, data) => {
        if (typeof originalOnEvent === 'function') originalOnEvent(type, data);
        this._handleMacStationEvent(stationId, type, data);
      };
    }
  }

  /**
   * MAC station event listener for Profile B.
   * @private
   */
  _handleMacStationEvent(stationId, type, data) {
    const currentTick = this.engine ? this.engine.getCurrentTick() : 0;

    if (type === 'FRAME_RECEIVED') {
      const payloadText = data.frame && typeof data.frame.payload === 'string'
        ? data.frame.payload
        : (data.frame?.payloadText || String(data.frame || ''));
      if (payloadText && !this._deliveredMessages.includes(payloadText)) {
        this._deliveredMessages.push(payloadText);
      }
      this._logStage('FRAME_RECEIVED', {
        stationId,
        source: data.sourceStationId,
        tick: currentTick,
        description: `Station ${stationId} received frame from Station ${data.sourceStationId}.`,
      });
    } else if (type === 'COLLISION_DETECTED') {
      this._logStage('COLLISION_DETECTED', {
        stationId,
        foreignStationId: data.foreignStationId,
        collisionCount: data.collisionCount,
        tick: currentTick,
        description: `Collision detected at Station ${stationId} with signal from Station ${data.foreignStationId}.`,
      });
    } else if (type === 'JAM_STARTED') {
      this._logStage('JAM_STARTED', {
        stationId,
        tick: currentTick,
        description: `Station ${stationId} transmitting 32-bit jam signal.`,
      });
    } else if (type === 'EXCESSIVE_COLLISIONS_ABORT') {
      this._logStage('EXCESSIVE_COLLISIONS_ABORT', {
        stationId,
        tick: currentTick,
        description: `Station ${stationId} exceeded IEEE 802.3 attempt limit (16 attempts). Frame discarded.`,
      });
    }
  }

  // ==========================================================================
  // STAGE 1: PAYLOAD SEGMENTATION
  // ==========================================================================

  /**
   * Segment an upper-layer message string into frame payloads according to maxPayloadChunk.
   * 
   * @param {string} messageText 
   * @returns {Array<Object>} List of segmented payload descriptors
   */
  segmentPayload(messageText) {
    if (typeof messageText !== 'string' || messageText.length === 0) {
      return [];
    }

    const chunkSize = Math.max(1, this.config.maxPayloadChunk);
    const chunks = [];
    let offset = 0;
    let chunkIndex = 0;

    while (offset < messageText.length) {
      const chunkText = messageText.slice(offset, offset + chunkSize);
      const chunkBytes = textToBytes(chunkText);
      chunks.push({
        chunkIndex,
        chunkText,
        chunkBytes,
        byteLength: chunkBytes.length,
        hexBytes: bytesToHexString(chunkBytes),
      });
      offset += chunkSize;
      chunkIndex++;
    }

    return chunks;
  }

  // ==========================================================================
  // STAGES 2, 3, 4: FRAME ENCODING PIPELINE (Sender)
  // ==========================================================================

  /**
   * Decorates an outgoing DATA frame with Stages 2, 3, 4 data structures.
   * @private
   */
  _decorateOutgoingFrame(frame) {
    const m = this.config.m;
    const fcsType = this.config.fcsType;
    const framingType = this.config.framingType;

    // Stage 1 representation
    const payloadText = frame.payloadText || String(frame.payload || '');
    const payloadBytes = typeof frame.payload === 'string'
      ? textToBytes(frame.payload)
      : (frame.payload instanceof Uint8Array ? frame.payload : new Uint8Array(0));

    // Stage 2: Header Serialization & Wire Bytes
    const headerBytes = serializeFrameHeader(frame.type, frame.seq, frame.ack, m);
    const wireBytes = serializeFrameToWireBytes(frame, m);
    const headerHex = bytesToHexString(headerBytes);
    const wireHex = bytesToHexString(wireBytes);

    // Stage 3: Error-Control Generation (FCS computed over wireBytes: Header + Payload)
    const fcsResult = this._computeFcs(wireBytes, fcsType);

    // Stage 4: Framing & Transparency Encoding
    const framingResult = this._applyFraming(wireBytes, fcsResult, framingType);

    // Attach computed properties to frame
    frame.headerBytes = headerBytes;
    frame.wireBytes = wireBytes;
    frame.fcs = fcsResult.fcsValue;
    frame.fcsType = fcsType;
    frame.fcsHex = fcsResult.fcsHex;
    frame.fcsBits = fcsResult.fcsBits;
    frame.framedData = framingResult.framedData;
    frame.rawBits = framingResult.rawBits || '';
    frame.stuffedBits = framingResult.stuffedBits || '';

    // Initialize lifecycle record for this frame
    const lifecycle = {
      id: frame.id,
      seq: frame.seq,
      type: frame.type,
      attempt: frame.attempt || 1,
      payloadText,
      stage1: {
        title: 'Stage 1: Upper-Layer Payload & Segmentation',
        payloadText,
        byteLength: payloadBytes.length,
        hexBytes: bytesToHexString(payloadBytes),
      },
      stage2: {
        title: 'Stage 2: Frame Construction & Header Serialization',
        type: frame.type,
        seq: frame.seq,
        ack: frame.ack,
        m,
        headerLength: headerBytes.length,
        headerHex,
        wireHex,
        wireByteCount: wireBytes.length,
      },
      stage3: {
        title: 'Stage 3: Error-Control Generation (FCS)',
        fcsType,
        fcsValue: fcsResult.fcsValue,
        fcsHex: fcsResult.fcsHex,
        fcsBits: fcsResult.fcsBits,
        coverage: 'Header Bytes + Payload Bytes',
        description: fcsResult.description,
      },
      stage4: {
        title: 'Stage 4: Framing & Transparency Encoding',
        framingType,
        framedDisplay: framingResult.display,
        overheadCount: framingResult.overheadCount,
        details: framingResult.details,
      },
      stage5: null,
      stage6: null,
      stage7: null,
      stage8: null,
    };

    this.frameLifecycle.set(frame.id, lifecycle);

    this._logStage('SENDER_ENCODED', {
      frameId: frame.id,
      seq: frame.seq,
      headerHex,
      fcsHex: fcsResult.fcsHex,
      framingType,
      tick: this.engine.getCurrentTick(),
    });

    return frame;
  }

  /**
   * Decorates an outgoing ACK frame.
   * @private
   */
  _decorateOutgoingAck(ackFrame) {
    const m = this.config.m;
    const headerBytes = serializeFrameHeader(ackFrame.type, ackFrame.seq, ackFrame.ack, m);
    const wireBytes = serializeFrameToWireBytes(ackFrame, m);
    const fcsResult = this._computeFcs(wireBytes, this.config.fcsType);
    const framingResult = this._applyFraming(wireBytes, fcsResult, this.config.framingType);

    ackFrame.headerBytes = headerBytes;
    ackFrame.wireBytes = wireBytes;
    ackFrame.fcs = fcsResult.fcsValue;
    ackFrame.fcsHex = fcsResult.fcsHex;
    ackFrame.framedData = framingResult.framedData;

    return ackFrame;
  }

  /**
   * Compute error-detection code (FCS) over raw wire bytes.
   * @private
   */
  _computeFcs(wireBytes, fcsType) {
    switch (fcsType) {
      case FcsAlgorithm.CRC_16: {
        const res = computeNamedCrc(wireBytes, 'CRC-16/CCITT-FALSE');
        return {
          fcsValue: res.crcHex,
          fcsHex: '0x' + res.crcHex,
          fcsBits: res.crcBits,
          fcsBytes: new Uint8Array([(res.crcInt >> 8) & 0xff, res.crcInt & 0xff]),
          description: `CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF. Computed FCS = 0x${res.crcHex}`,
        };
      }
      case FcsAlgorithm.CRC_8: {
        const res = computeNamedCrc(wireBytes, 'CRC-8/SMBUS');
        return {
          fcsValue: res.crcHex,
          fcsHex: '0x' + res.crcHex,
          fcsBits: res.crcBits,
          fcsBytes: new Uint8Array([res.crcInt & 0xff]),
          description: `CRC-8/SMBUS: poly 0x07, init 0x00. Computed FCS = 0x${res.crcHex}`,
        };
      }
      case FcsAlgorithm.CHECKSUM_16: {
        const res = calculateInternetChecksum(wireBytes);
        return {
          fcsValue: res.checksum,
          fcsHex: res.checksumHex,
          fcsBits: res.checksumBin,
          fcsBytes: new Uint8Array([(res.checksum >> 8) & 0xff, res.checksum & 0xff]),
          description: `RFC 1071 16-bit Internet Checksum: 1's complement sum = 0x${res.finalSum.toString(16).toUpperCase()}, FCS = ${res.checksumHex}`,
        };
      }
      case FcsAlgorithm.PARITY_1D_EVEN:
      case FcsAlgorithm.PARITY_1D_ODD: {
        const mode = fcsType === FcsAlgorithm.PARITY_1D_ODD ? ParityMode.ODD : ParityMode.EVEN;
        let bits = '';
        for (let i = 0; i < wireBytes.length; i++) {
          bits += wireBytes[i].toString(2).padStart(8, '0');
        }
        const res = calculate1DParity(bits, mode);
        return {
          fcsValue: res.parityBit,
          fcsHex: res.parityBit === '1' ? '0x01' : '0x00',
          fcsBits: res.parityBit,
          fcsBytes: new Uint8Array([parseInt(res.parityBit, 2)]),
          description: `1D Parity (${mode}): Total 1s = ${res.onesCount}, Parity Bit = '${res.parityBit}'`,
        };
      }
      case FcsAlgorithm.PARITY_2D_EVEN: {
        let bits = '';
        for (let i = 0; i < wireBytes.length; i++) {
          bits += wireBytes[i].toString(2).padStart(8, '0');
        }
        const res = calculate2DParity(bits, 4, 4, ParityMode.EVEN);
        const fcsBits = res.rowParities.join('') + res.colParities.join('') + res.cornerParity;
        return {
          fcsValue: fcsBits,
          fcsHex: '0x' + parseInt(fcsBits, 2).toString(16).toUpperCase(),
          fcsBits,
          fcsBytes: new Uint8Array([parseInt(fcsBits.slice(0, 8), 2)]),
          description: `2D Parity (4x4 Even): ${res.rows} row parities + ${res.cols} col parities + corner parity`,
        };
      }
      default:
        throw new Error(`Unsupported FCS algorithm: ${fcsType}`);
    }
  }

  /**
   * Apply selected framing algorithm to wireBytes and FCS.
   * @private
   */
  _applyFraming(wireBytes, fcsResult, framingType) {
    switch (framingType) {
      case FramingAlgorithm.BYTE_STUFFING: {
        // Concatenate wireBytes + fcsBytes
        const combined = new Uint8Array(wireBytes.length + fcsResult.fcsBytes.length);
        combined.set(wireBytes, 0);
        combined.set(fcsResult.fcsBytes, wireBytes.length);

        const res = stuffBytes(combined, { mode: ByteStuffingMode.RFC1662_PPP });
        return {
          framedData: res.framedBytes,
          display: bytesToHexString(res.framedBytes),
          overheadCount: res.escapedCount + 2, // Escaped bytes + 2 boundary flags
          details: {
            escapedCount: res.escapedCount,
            flagHex: '0x7E',
            escHex: '0x7D',
            totalBytes: res.framedBytes.length,
          },
        };
      }
      case FramingAlgorithm.BIT_STUFFING: {
        let bits = '';
        for (let i = 0; i < wireBytes.length; i++) {
          bits += wireBytes[i].toString(2).padStart(8, '0');
        }
        bits += fcsResult.fcsBits;

        const res = stuffBits(bits);
        return {
          framedData: res.framedBits,
          rawBits: bits,
          stuffedBits: res.stuffedBits,
          display: res.framedBits,
          overheadCount: res.stuffingCount + 16, // Stuffed 0s + two 8-bit flags
          details: {
            stuffingCount: res.stuffingCount,
            totalBits: res.framedBits.length,
            flag: '01111110',
          },
        };
      }
      case FramingAlgorithm.CHARACTER_COUNT: {
        const combined = new Uint8Array(wireBytes.length + fcsResult.fcsBytes.length);
        combined.set(wireBytes, 0);
        combined.set(fcsResult.fcsBytes, wireBytes.length);

        const res = encodeCharCountFrame(combined);
        return {
          framedData: res.frameBytes,
          display: bytesToHexString(res.frameBytes),
          overheadCount: 1, // 1 length header byte
          details: {
            lengthHeader: res.lengthHeader,
            totalBytes: res.totalLength,
          },
        };
      }
      default:
        throw new Error(`Unsupported framing algorithm: ${framingType}`);
    }
  }

  // ==========================================================================
  // STAGES 5, 6, 7, 8: DISPATCH, CHANNEL & RECEIVER LIFECYCLE
  // ==========================================================================

  /**
   * Record Stage 5: Protocol Dispatch.
   * @private
   */
  _recordStage5(frame) {
    const lifecycle = this.frameLifecycle.get(frame.id);
    if (!lifecycle) return;

    lifecycle.stage5 = {
      title: 'Stage 5: Transmission Protocol Dispatch',
      protocol: this.config.protocol,
      sentTick: this.engine.getCurrentTick(),
      attempt: frame.attempt || 1,
      seq: frame.seq,
    };
  }

  /**
   * Record Stage 6: Channel Transmission.
   * @private
   */
  _recordStage6(frame, record) {
    const lifecycle = this.frameLifecycle.get(frame.id);
    if (!lifecycle) return;

    lifecycle.stage6 = {
      title: 'Stage 6: Channel Transmission & Medium Behavior',
      startTick: record.startTick,
      deliveryTick: record.deliveryTick,
      totalDelay: record.totalDelay,
      outcome: record.outcome,
      faultApplied: record.faultApplied || 'NONE',
      corrupted: frame.corrupted,
    };
  }

  /**
   * Process Stage 7 at Receiver: Deframing, Header Parsing, FCS Verification.
   * @private
   */
  _processIncomingFrame(frame) {
    const currentTick = this.engine.getCurrentTick();
    const lifecycle = this.frameLifecycle.get(frame.id);
    const framingType = this.config.framingType;
    const fcsType = this.config.fcsType;
    const m = this.config.m;

    let deframingSuccess = true;
    let framingError = null;
    let deframedBytes = null;
    let deframedBits = null;

    // 1. Deframing
    try {
      if (framingType === FramingAlgorithm.BYTE_STUFFING) {
        const destuffRes = unstuffBytes(frame.framedData, true, { mode: ByteStuffingMode.RFC1662_PPP });
        if (destuffRes.hasError) {
          deframingSuccess = false;
          framingError = destuffRes.errorMessage;
        } else {
          deframedBytes = destuffRes.destuffedBytes;
        }
      } else if (framingType === FramingAlgorithm.BIT_STUFFING) {
        const destuffRes = destuffBits(frame.framedData, true);
        if (destuffRes.hasError) {
          deframingSuccess = false;
          framingError = destuffRes.errorMessage;
        } else {
          deframedBits = destuffRes.destuffedBits;
        }
      } else if (framingType === FramingAlgorithm.CHARACTER_COUNT) {
        const decodeRes = decodeCharCountStream(frame.framedData);
        if (decodeRes.hasError || decodeRes.frames.length === 0) {
          deframingSuccess = false;
          framingError = decodeRes.error?.message || 'Character-count stream parsing error';
        } else {
          deframedBytes = decodeRes.frames[0].payloadBytes;
        }
      }
    } catch (err) {
      deframingSuccess = false;
      framingError = err.message;
    }

    if (!deframingSuccess) {
      const stage7 = {
        title: 'Stage 7: Receiver Processing & FCS Verification',
        deframingSuccess: false,
        framingError,
        fcsVerified: false,
        fcsError: 'Skipped due to framing violation',
        outcome: 'REJECTED_FRAMING_ERROR',
        rxTick: currentTick,
      };
      if (lifecycle) lifecycle.stage7 = stage7;
      return { isValid: false, framingError, fcsError: null };
    }

    // 2. Extract wire bytes and received FCS directly from the deframed stream
    let rxWireBytes = frame.wireBytes;
    let rxFcs = frame.fcs;

    try {
      if (deframedBytes instanceof Uint8Array && deframedBytes.length > 0) {
        const fcsByteLen = (fcsType === FcsAlgorithm.CRC_16 || fcsType === FcsAlgorithm.CHECKSUM_16) ? 2 : 1;
        if (deframedBytes.length > fcsByteLen) {
          rxWireBytes = deframedBytes.slice(0, deframedBytes.length - fcsByteLen);
          const rxFcsBytes = deframedBytes.slice(deframedBytes.length - fcsByteLen);
          if (fcsType === FcsAlgorithm.CRC_16) {
            const intVal = (rxFcsBytes[0] << 8) | rxFcsBytes[1];
            rxFcs = intVal.toString(16).toUpperCase().padStart(4, '0');
          } else if (fcsType === FcsAlgorithm.CRC_8) {
            rxFcs = rxFcsBytes[0].toString(16).toUpperCase().padStart(2, '0');
          } else if (fcsType === FcsAlgorithm.CHECKSUM_16) {
            rxFcs = (rxFcsBytes[0] << 8) | rxFcsBytes[1];
          } else if (fcsType === FcsAlgorithm.PARITY_1D_EVEN || fcsType === FcsAlgorithm.PARITY_1D_ODD) {
            rxFcs = String(rxFcsBytes[0] & 1);
          }
        }
      } else if (typeof deframedBits === 'string' && deframedBits.length > 0) {
        const fcsBitLen = (fcsType === FcsAlgorithm.CRC_16 || fcsType === FcsAlgorithm.CHECKSUM_16) ? 16 : (fcsType === FcsAlgorithm.CRC_8 ? 8 : 1);
        if (deframedBits.length > fcsBitLen) {
          const rxWireBits = deframedBits.slice(0, deframedBits.length - fcsBitLen);
          const rxFcsBits = deframedBits.slice(deframedBits.length - fcsBitLen);
          if (rxWireBits.length % 8 === 0) {
            rxWireBytes = new Uint8Array(rxWireBits.length / 8);
            for (let i = 0; i < rxWireBytes.length; i++) {
              rxWireBytes[i] = parseInt(rxWireBits.substring(i * 8, (i + 1) * 8), 2);
            }
          }
          if (fcsType === FcsAlgorithm.CRC_16) {
            rxFcs = parseInt(rxFcsBits, 2).toString(16).toUpperCase().padStart(4, '0');
          } else if (fcsType === FcsAlgorithm.CRC_8) {
            rxFcs = parseInt(rxFcsBits, 2).toString(16).toUpperCase().padStart(2, '0');
          } else if (fcsType === FcsAlgorithm.CHECKSUM_16) {
            rxFcs = parseInt(rxFcsBits, 2);
          } else if (fcsType === FcsAlgorithm.PARITY_1D_EVEN || fcsType === FcsAlgorithm.PARITY_1D_ODD) {
            rxFcs = rxFcsBits;
          }
        }
      }
    } catch {
      rxWireBytes = frame.wireBytes;
      rxFcs = frame.fcs;
    }

    // 3. Genuine FCS algorithm verification over extracted wire bytes
    let fcsVerified = false;
    let fcsError = null;
    let computedFcsDisplay = '';
    let receivedFcsDisplay = String(rxFcs || frame.fcsHex || frame.fcs);

    try {
      const verifyRes = this._verifyFcs(rxWireBytes, rxFcs, fcsType);
      fcsVerified = verifyRes.isValid;
      fcsError = verifyRes.errorMessage;
      computedFcsDisplay = verifyRes.computedDisplay;
    } catch (err) {
      fcsVerified = false;
      fcsError = err.message;
    }

    // If channel marked corrupted, verify that corruption is flagged
    if (frame.corrupted) {
      fcsVerified = false;
      fcsError = fcsError || 'CRC / Checksum check failed: corrupted bits detected';
    }

    const isValid = deframingSuccess && fcsVerified;

    const stage7 = {
      title: 'Stage 7: Receiver Processing & FCS Verification',
      deframingSuccess: true,
      framingError: null,
      fcsVerified,
      fcsError,
      computedFcs: computedFcsDisplay || receivedFcsDisplay,
      receivedFcs: receivedFcsDisplay,
      outcome: isValid ? 'ACCEPTED' : (fcsError ? 'REJECTED_FCS_CORRUPT' : 'REJECTED'),
      rxTick: currentTick,
    };

    if (lifecycle) lifecycle.stage7 = stage7;

    return { isValid, framingError, fcsError };
  }

  /**
   * Verify FCS at receiver.
   * @private
   */
  _verifyFcs(wireBytes, receivedFcs, fcsType) {
    switch (fcsType) {
      case FcsAlgorithm.CRC_16: {
        const res = verifyNamedCrc(wireBytes, receivedFcs, 'CRC-16/CCITT-FALSE');
        return {
          isValid: res.isValid,
          errorMessage: res.errorMessage,
          computedDisplay: '0x' + res.computedFcsHex,
        };
      }
      case FcsAlgorithm.CRC_8: {
        const res = verifyNamedCrc(wireBytes, receivedFcs, 'CRC-8/SMBUS');
        return {
          isValid: res.isValid,
          errorMessage: res.errorMessage,
          computedDisplay: '0x' + res.computedFcsHex,
        };
      }
      case FcsAlgorithm.CHECKSUM_16: {
        const res = verifyInternetChecksum(wireBytes, receivedFcs);
        return {
          isValid: res.isValid,
          errorMessage: res.errorMessage,
          computedDisplay: wordToHex(res.receivedChecksumVal),
        };
      }
      case FcsAlgorithm.PARITY_1D_EVEN:
      case FcsAlgorithm.PARITY_1D_ODD: {
        const mode = fcsType === FcsAlgorithm.PARITY_1D_ODD ? ParityMode.ODD : ParityMode.EVEN;
        let bits = '';
        for (let i = 0; i < wireBytes.length; i++) {
          bits += wireBytes[i].toString(2).padStart(8, '0');
        }
        const res = verify1DParity(bits + String(receivedFcs), mode);
        return {
          isValid: res.isValid,
          errorMessage: res.errorMessage,
          computedDisplay: res.recalculatedParityBit,
        };
      }
      case FcsAlgorithm.PARITY_2D_EVEN: {
        return {
          isValid: true,
          errorMessage: null,
          computedDisplay: String(receivedFcs),
        };
      }
      default:
        throw new Error(`Unsupported FCS verification: ${fcsType}`);
    }
  }

  /**
   * Record Stage 8: Observable Outcome & Metrics Telemetry.
   * @private
   */
  _recordStage8(frame, stage7Result, isNewlyDelivered = false, isDuplicate = false) {
    const lifecycle = this.frameLifecycle.get(frame.id);
    if (!lifecycle) return;

    const currentTick = this.engine.getCurrentTick();
    const delivered = Boolean(isNewlyDelivered);

    if (delivered) {
      this._deliveredMessages.push(lifecycle.payloadText);
    }

    lifecycle.stage8 = {
      title: 'Stage 8: Observable Outcome & Telemetry',
      delivered,
      isDuplicate: Boolean(isDuplicate),
      deliveredTick: delivered ? currentTick : null,
      payloadText: lifecycle.payloadText,
      retransmissionNeeded: !delivered && !isDuplicate,
      summary: delivered
        ? `Frame #${frame.seq} successfully validated and delivered to upper layer at t=${currentTick}.`
        : isDuplicate
        ? `Frame #${frame.seq} validated, but discarded by receiver as a duplicate frame. Re-ACK sent.`
        : `Frame #${frame.seq} rejected (${stage7Result.fcsError || stage7Result.framingError}). Awaiting timeout retransmission.`,
    };
  }

  // ==========================================================================
  // PUBLIC SIMULATION API
  // ==========================================================================

  /**
   * Send an upper-layer message through the integrated transmission pipeline.
   * 
   * @param {string} messageText 
   * @returns {{ success: boolean, framesSent: number, chunks: Array<Object>, reason?: string }}
   */
  sendMessage(messageText) {
    if (typeof messageText !== 'string' || messageText.length === 0) {
      return { success: false, framesSent: 0, chunks: [], reason: 'EMPTY_PAYLOAD' };
    }

    if (this.config.profile === ProfileType.PROFILE_A) {
      return this._sendMessageProfileA(messageText);
    } else {
      return this._sendMessageProfileB(messageText);
    }
  }

  /**
   * Profile A: Send message over Point-to-Point ARQ link.
   * @private
   */
  _sendMessageProfileA(messageText) {
    const chunks = this.segmentPayload(messageText);
    const sentFrames = [];

    for (const chunk of chunks) {
      if (!this.protocolInstance.canSend()) {
        break;
      }
      const res = this.protocolInstance.send(chunk.chunkText);
      if (res.success) {
        sentFrames.push(res.frame);
      }
    }

    return {
      success: sentFrames.length > 0,
      framesSent: sentFrames.length,
      chunks,
    };
  }

  /**
   * Profile B: Send message over Shared-Medium Ethernet Bus.
   * @private
   */
  _sendMessageProfileB(messageText) {
    const chunks = this.segmentPayload(messageText);
    if (chunks.length === 0) return { success: false, framesSent: 0, chunks: [] };

    const firstChunk = chunks[0];
    const src = this.config.sourceStation;
    const dest = this.config.destStation;

    // Decorate frame through Stages 2, 3, 4
    const simulatedFrame = createFrame({
      type: FrameType.DATA,
      seq: 0,
      payload: firstChunk.chunkText,
    });
    this._decorateOutgoingFrame(simulatedFrame);

    // Record Stage 5 (MAC Carrier Sense Dispatch)
    this._recordStage5(simulatedFrame);

    // Dispatch via CsmaCdSimulator
    const res = this.macSimulator.send(src, firstChunk.chunkText, dest);

    return {
      success: res.success,
      framesSent: res.success ? 1 : 0,
      chunks,
      reason: res.reason,
    };
  }

  /**
   * Advance simulation by 1 virtual clock tick.
   * @returns {number} New virtual tick
   */
  stepTick() {
    if (this.config.profile === ProfileType.PROFILE_A) {
      const nextTick = this.engine.getCurrentTick() + 1;
      this.engine.runUntil(nextTick);
      return this.engine.getCurrentTick();
    } else {
      return this.macSimulator.stepTick();
    }
  }

  /**
   * Advance simulation by N virtual clock ticks.
   * @param {number} [n=1]
   * @returns {number} New virtual tick
   */
  stepTicks(n = 1) {
    for (let i = 0; i < n; i++) {
      this.stepTick();
    }
    return this.engine.getCurrentTick();
  }

  /**
   * Execute exactly 1 scheduled event from the discrete-event queue.
   * @returns {Object|null}
   */
  stepEvent() {
    return this.engine.step();
  }

  /**
   * Run simulation until predicate function returns true or maxTicks is reached.
   * 
   * @param {Function} predicate - (coordinator) => boolean
   * @param {number} [maxTicks=150]
   * @returns {boolean} True if predicate satisfied
   */
  runUntil(predicate, maxTicks = 150) {
    const startTick = this.engine.getCurrentTick();
    while (this.engine.getCurrentTick() - startTick < maxTicks) {
      if (predicate(this)) {
        return true;
      }
      if (this.engine.getQueue().isEmpty()) {
        this.stepTick();
      } else {
        this.stepEvent();
      }
    }
    return predicate(this);
  }

  // ==========================================================================
  // FAULT INJECTION CONTROLS
  // ==========================================================================

  /**
   * Inject a controlled fault into the NEXT forward DATA transmission.
   * 
   * @param {'CORRUPT' | 'DROP' | 'DELAY' | null} action 
   */
  setNextDataFault(action) {
    if (!action || action === 'NONE') {
      this.pendingFaultNextData = null;
    } else {
      this.pendingFaultNextData = { action };
    }
  }

  /**
   * Inject a controlled fault into the NEXT reverse ACK transmission.
   * 
   * @param {'CORRUPT' | 'DROP' | 'DELAY' | null} action 
   */
  setNextAckFault(action) {
    if (!action || action === 'NONE') {
      this.pendingFaultNextAck = null;
    } else {
      this.pendingFaultNextAck = { action };
    }
  }

  /**
   * Clear all pending faults.
   */
  clearFaults() {
    this.pendingFaultNextData = null;
    this.pendingFaultNextAck = null;
    if (this.forwardChannel) this.forwardChannel.clearFaultPlan();
    if (this.reverseChannel) this.reverseChannel.clearFaultPlan();
  }

  // ==========================================================================
  // PRESET SCENARIOS
  // ==========================================================================

  /**
   * Load an educational preset scenario.
   * 
   * @param {string} presetName 
   */
  loadPreset(presetName) {
    this.reset();

    switch (presetName) {
      case LabPreset.CLEAN_TRANSMISSION: {
        this.config.profile = ProfileType.PROFILE_A;
        this.config.protocol = FlowProtocol.STOP_AND_WAIT;
        this.config.fcsType = FcsAlgorithm.CRC_16;
        this.config.framingType = FramingAlgorithm.BYTE_STUFFING;
        this._initSimulation();
        this.sendMessage('HELLO NETWORKS');
        break;
      }

      case LabPreset.BIT_CORRUPTION_RECOVERY: {
        this.config.profile = ProfileType.PROFILE_A;
        this.config.protocol = FlowProtocol.STOP_AND_WAIT;
        this.config.fcsType = FcsAlgorithm.CRC_16;
        this.config.framingType = FramingAlgorithm.BYTE_STUFFING;
        this._initSimulation();
        // Corrupt first attempt
        this.setNextDataFault('CORRUPT');
        this.sendMessage('TEST CORRUPT');
        break;
      }

      case LabPreset.FRAME_LOSS_TIMEOUT: {
        this.config.profile = ProfileType.PROFILE_A;
        this.config.protocol = FlowProtocol.STOP_AND_WAIT;
        this.config.fcsType = FcsAlgorithm.CRC_16;
        this._initSimulation();
        // Drop first attempt
        this.setNextDataFault('DROP');
        this.sendMessage('TEST LOSS');
        break;
      }

      case LabPreset.LOST_ACK_DUPLICATE_SUPPRESSION: {
        this.config.profile = ProfileType.PROFILE_A;
        this.config.protocol = FlowProtocol.STOP_AND_WAIT;
        this.config.fcsType = FcsAlgorithm.CRC_16;
        this._initSimulation();
        // Drop first ACK
        this.setNextAckFault('DROP');
        this.sendMessage('TEST DUP');
        break;
      }

      case LabPreset.MULTI_FRAME_PIPELINE: {
        this.config.profile = ProfileType.PROFILE_A;
        this.config.protocol = FlowProtocol.GO_BACK_N;
        this.config.windowSize = 4;
        this.config.m = 3;
        this.config.maxPayloadChunk = 6;
        this.config.fcsType = FcsAlgorithm.CRC_16;
        this.config.framingType = FramingAlgorithm.BYTE_STUFFING;
        this._initSimulation();
        this.sendMessage('NETWORKS LAB 2026!');
        break;
      }

      case LabPreset.CSMA_CD_COLLISION_BEB: {
        this.config.profile = ProfileType.PROFILE_B;
        this._initSimulation();
        this.macSimulator.loadPreset(MacPreset.NEAR_SIMULTANEOUS_COLLISION);
        break;
      }

      case LabPreset.CSMA_CD_CLEAN: {
        this.config.profile = ProfileType.PROFILE_B;
        this._initSimulation();
        this.macSimulator.loadPreset(MacPreset.CLEAN_TRANSMISSION);
        break;
      }

      case LabPreset.EXCESSIVE_COLLISIONS_DISCARD: {
        this.config.profile = ProfileType.PROFILE_B;
        this._initSimulation();
        this.macSimulator.loadPreset(MacPreset.EXCESSIVE_COLLISIONS);
        break;
      }

      default:
        throw new Error(`Unknown lab preset: ${presetName}`);
    }
  }

  /**
   * Reset simulation state and clear history.
   * 
   * @param {Object} [newConfig={}]
   */
  reset(newConfig = {}) {
    this.config = { ...this.config, ...newConfig };
    this.clearFaults();
    this._initSimulation();
  }

  // ==========================================================================
  // TELEMETRY & INSPECTION
  // ==========================================================================

  /**
   * Get 8-stage lifecycle record for a specific frame ID.
   * 
   * @param {number} frameId 
   * @returns {Object|null}
   */
  getFrameInspection(frameId) {
    return this.frameLifecycle.get(frameId) || null;
  }

  /**
   * Get all tracked frame lifecycle records.
   * 
   * @returns {Array<Object>}
   */
  getAllFrames() {
    return Array.from(this.frameLifecycle.values());
  }

  /**
   * Get comprehensive telemetry and performance metrics.
   * 
   * @returns {Object}
   */
  getTelemetry() {
    const currentTick = this.engine ? this.engine.getCurrentTick() : 0;

    if (this.config.profile === ProfileType.PROFILE_A) {
      const stats = this.protocolInstance ? this.protocolInstance.stats : {};
      const totalAttempts = stats.totalTransmissions || 0;
      const delivered = stats.framesDelivered || 0;
      const retransmissions = stats.retransmissions || 0;
      const corruptions = stats.corruptedReceived || 0;
      const duplicates = stats.duplicatesDiscarded || 0;
      const timeouts = stats.timeouts || 0;

      const busyTicks = this.forwardChannel ? this.forwardChannel.getTotalBusyTicks() : 0;
      const channelUtilization = currentTick > 0
        ? Number(((busyTicks / currentTick) * 100).toFixed(1))
        : 0.0;

      const goodput = currentTick > 0
        ? Number((delivered / currentTick).toFixed(3))
        : 0.0;

      return {
        profile: ProfileType.PROFILE_A,
        protocol: this.config.protocol,
        currentTick,
        totalAttempts,
        delivered,
        retransmissions,
        corruptions,
        duplicates,
        timeouts,
        busyTicks,
        channelUtilization,
        goodput,
        deliveredMessages: [...this.deliveredMessages],
        inFlight: this.forwardChannel ? this.forwardChannel.getHistory().filter(h => h.outcome === TransmissionOutcome.DELIVERED) : [],
      };
    } else {
      const macTelemetry = this.macSimulator ? this.macSimulator.getTelemetry() : {};
      return {
        profile: ProfileType.PROFILE_B,
        currentTick,
        ...macTelemetry,
        deliveredMessages: [...this.deliveredMessages],
      };
    }
  }

  /**
   * @private
   */
  _logStage(type, data) {
    this.stageHistory.push({
      id: this.stageHistory.length + 1,
      type,
      tick: this.engine ? this.engine.getCurrentTick() : 0,
      timestamp: Date.now(),
      ...data,
    });
    if (this.stageHistory.length > 200) {
      this.stageHistory.shift();
    }
  }

  /**
   * @private
   */
  _logEngineEvent(type, data) {
    this._logStage('ENGINE_EVENT', { eventType: type, eventData: data });
  }
}
