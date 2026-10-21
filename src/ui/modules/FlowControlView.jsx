/**
 * FlowControlView.jsx
 * 
 * Interactive Visualizer for Data Link Layer Flow Control & ARQ Protocols:
 * - Stop-and-Wait ARQ (Alternating Bit 0/1, Ws=1, Wr=1)
 * - Go-Back-N ARQ (Sliding Window, Cumulative ACKs, Retransmit from Base, Wr=1)
 * - Selective Repeat ARQ (Independent Windows, Individual ACKs, Out-of-Order Receiver Buffer, Wr=Ws)
 * 
 * Features:
 * - Real message payload input with live chunking into concrete frames.
 * - Prominent animated transmission medium with forward DATA and reverse ACK pipelines.
 * - Distinct textbook visual behaviors for SW, GBN, and SR.
 * - Event-driven plain-English narration explaining wire activities in real time.
 * - Color-coded interactive sliding window strips for sender and receiver.
 * - Collapsible technical inspector with sliding window math, telemetry counters, and discrete-event trace log.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FlowControlSimulator,
  FlowControlProtocol,
} from '../../core/flow-control/FlowControlSimulator.js';
import {
  getMaxWindowSize,
  validateWindowSize,
  isWithinWindow,
  seqDistance,
} from '../../core/flow-control/sequenceMath.js';

export default function FlowControlView() {
  // Protocol Selection: SW | GBN | SR
  const [protocol, setProtocol] = useState(FlowControlProtocol.GO_BACK_N);

  // Configuration Parameters
  const [m, setM] = useState(3);
  const [windowSize, setWindowSize] = useState(4);
  const [rxWindowSize, setRxWindowSize] = useState(4);
  const [propagationDelay, setPropagationDelay] = useState(4);
  const [timeoutDuration, setTimeoutDuration] = useState(16);
  const [transmissionDelay, setTransmissionDelay] = useState(1);

  // Message & Payload Segmentation
  const [messageInput, setMessageInput] = useState('NETWORKS LAB 2026');
  const [chunkSize, setChunkSize] = useState(8);
  const [pendingQueue, setPendingQueue] = useState([]);

  // Channel Fault State
  const [pendingDataFault, setPendingDataFault] = useState(null);
  const [pendingAckFault, setPendingAckFault] = useState(null);

  // Playback & Animation State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeedMs, setPlaySpeedMs] = useState(100); // Default to Normal (100ms)
  const [traceFilter, setTraceFilter] = useState('ALL');

  // Helper to construct a clean simulator instance
  const createSimulator = (proto, bitWidth, win, propDelay, toDuration, txDelay) => {
    const maxWin = getMaxWindowSize(proto, bitWidth);
    const safeWin = proto === FlowControlProtocol.STOP_AND_WAIT ? 1 : Math.min(win, maxWin);
    const safeRxWin = proto === FlowControlProtocol.SELECTIVE_REPEAT ? safeWin : 1;
    return new FlowControlSimulator({
      protocol: proto,
      m: bitWidth,
      windowSize: safeWin,
      rxWindowSize: safeRxWin,
      propagationDelay: propDelay,
      timeoutDuration: toDuration,
      transmissionDelay: txDelay,
    });
  };

  // Simulator instance ref (persists across renders)
  const simulatorRef = useRef(null);
  if (!simulatorRef.current) {
    simulatorRef.current = createSimulator(protocol, m, windowSize, propagationDelay, timeoutDuration, transmissionDelay);
  }

  // Snapshot of simulator state for rendering
  const [snapshot, setSnapshot] = useState(() => simulatorRef.current.getSnapshot());

  // Synchronous snapshot updater
  const updateSnapshot = () => {
    if (simulatorRef.current) {
      setSnapshot(simulatorRef.current.getSnapshot());
    }
  };

  // Switch Protocol handler: synchronously resets simulator and state to prevent mismatched renders
  const handleProtocolChange = (newProto) => {
    setIsPlaying(false);
    let newM = m;
    let newWin = windowSize;
    let newRxWin = rxWindowSize;

    if (newProto === FlowControlProtocol.STOP_AND_WAIT) {
      newM = 1;
      newWin = 1;
      newRxWin = 1;
    } else if (newProto === FlowControlProtocol.GO_BACK_N) {
      newM = 3;
      newWin = 4;
      newRxWin = 1;
    } else if (newProto === FlowControlProtocol.SELECTIVE_REPEAT) {
      newM = 3;
      newWin = 4;
      newRxWin = 4;
    }

    setProtocol(newProto);
    setM(newM);
    setWindowSize(newWin);
    setRxWindowSize(newRxWin);
    setPendingDataFault(null);
    setPendingAckFault(null);
    setPendingQueue([]);

    // Synchronously instantiate new simulator and capture fresh snapshot
    const newSim = createSimulator(newProto, newM, newWin, propagationDelay, timeoutDuration, transmissionDelay);
    simulatorRef.current = newSim;
    setSnapshot(newSim.getSnapshot());
  };

  // Window size change handler
  const handleWindowSizeChange = (newSize) => {
    const parsed = parseInt(newSize, 10);
    const maxWin = getMaxWindowSize(protocol, m);
    if (parsed >= 1 && parsed <= maxWin) {
      setWindowSize(parsed);
      const safeRx = protocol === FlowControlProtocol.SELECTIVE_REPEAT ? parsed : 1;
      setRxWindowSize(safeRx);
      if (simulatorRef.current) {
        simulatorRef.current.reset({ windowSize: parsed, rxWindowSize: safeRx });
        updateSnapshot();
      }
    }
  };

  // Playback timer loop
  useEffect(() => {
    let intervalId = null;
    if (isPlaying) {
      intervalId = setInterval(() => {
        if (simulatorRef.current) {
          if (simulatorRef.current.isComplete && simulatorRef.current.isComplete() && pendingQueue.length === 0) {
            setIsPlaying(false);
            updateSnapshot();
            return;
          }

          // If there are pending queue items and protocol has capacity, send next
          let currentPending = pendingQueue;
          if (currentPending.length > 0) {
            const protoInstance = simulatorRef.current.protocolInstance;
            let canSendMore = false;
            if (protocol === FlowControlProtocol.STOP_AND_WAIT) {
              canSendMore = protoInstance.status === 'IDLE';
            } else if (protoInstance.canSend) {
              canSendMore = protoInstance.canSend();
            }
            if (canSendMore) {
              const [nextChunk, ...rest] = currentPending;
              currentPending = rest;
              setPendingQueue(rest);
              simulatorRef.current.send(nextChunk);
            }
          }

          simulatorRef.current.stepTick();

          // Check if window opened during this tick (e.g. ACK arrived)
          if (currentPending.length > 0) {
            const protoInstance = simulatorRef.current.protocolInstance;
            let canSendMore = false;
            if (protocol === FlowControlProtocol.STOP_AND_WAIT) {
              canSendMore = protoInstance.status === 'IDLE';
            } else if (protoInstance.canSend) {
              canSendMore = protoInstance.canSend();
            }
            if (canSendMore) {
              const [nextChunk, ...rest] = currentPending;
              setPendingQueue(rest);
              simulatorRef.current.send(nextChunk);
            }
          }

          updateSnapshot();
        }
      }, playSpeedMs);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPlaying, playSpeedMs, pendingQueue, protocol]);

  // Stepping controls
  const handleStepTick = () => {
    setIsPlaying(false);
    if (simulatorRef.current) {
      let currentPending = pendingQueue;
      if (currentPending.length > 0) {
        const protoInstance = simulatorRef.current.protocolInstance;
        let canSendMore = false;
        if (protocol === FlowControlProtocol.STOP_AND_WAIT) {
          canSendMore = protoInstance.status === 'IDLE';
        } else if (protoInstance.canSend) {
          canSendMore = protoInstance.canSend();
        }
        if (canSendMore) {
          const [nextChunk, ...rest] = currentPending;
          currentPending = rest;
          setPendingQueue(rest);
          simulatorRef.current.send(nextChunk);
        }
      }

      simulatorRef.current.stepTick();

      // Check if window opened during this tick
      if (currentPending.length > 0) {
        const protoInstance = simulatorRef.current.protocolInstance;
        let canSendMore = false;
        if (protocol === FlowControlProtocol.STOP_AND_WAIT) {
          canSendMore = protoInstance.status === 'IDLE';
        } else if (protoInstance.canSend) {
          canSendMore = protoInstance.canSend();
        }
        if (canSendMore) {
          const [nextChunk, ...rest] = currentPending;
          setPendingQueue(rest);
          simulatorRef.current.send(nextChunk);
        }
      }

      updateSnapshot();
    }
  };

  const handleStepEvent = () => {
    setIsPlaying(false);
    if (simulatorRef.current) {
      simulatorRef.current.stepEvent();

      // Check if window opened after event execution
      if (pendingQueue.length > 0) {
        const protoInstance = simulatorRef.current.protocolInstance;
        let canSendMore = false;
        if (protocol === FlowControlProtocol.STOP_AND_WAIT) {
          canSendMore = protoInstance.status === 'IDLE';
        } else if (protoInstance.canSend) {
          canSendMore = protoInstance.canSend();
        }
        if (canSendMore) {
          const [nextChunk, ...rest] = pendingQueue;
          setPendingQueue(rest);
          simulatorRef.current.send(nextChunk);
        }
      }

      updateSnapshot();
    }
  };

  const handleRunToCompletion = () => {
    setIsPlaying(false);
    if (simulatorRef.current) {
      // Dispatch all pending queue items as capacity allows
      let currentQueue = [...pendingQueue];
      let guard = 0;
      while ((currentQueue.length > 0 || !simulatorRef.current.isComplete()) && guard < 300) {
        guard++;
        const protoInstance = simulatorRef.current.protocolInstance;
        let canSendMore = false;
        if (protocol === FlowControlProtocol.STOP_AND_WAIT) {
          canSendMore = protoInstance.status === 'IDLE';
        } else if (protoInstance.canSend) {
          canSendMore = protoInstance.canSend();
        }
        if (canSendMore && currentQueue.length > 0) {
          const nextChunk = currentQueue.shift();
          simulatorRef.current.send(nextChunk);
        }
        simulatorRef.current.stepTick();
      }
      setPendingQueue(currentQueue);
      updateSnapshot();
    }
  };

  // Reset simulator
  const handleReset = () => {
    setIsPlaying(false);
    setPendingDataFault(null);
    setPendingAckFault(null);
    setPendingQueue([]);
    if (simulatorRef.current) {
      simulatorRef.current.reset();
      updateSnapshot();
    }
  };

  // Concrete Message Segmentation into Chunks
  const messageChunks = useMemo(() => {
    const text = messageInput;
    if (typeof text !== 'string' || text.length === 0) return [];
    const sz = Math.max(1, chunkSize);
    const chunks = [];
    for (let i = 0; i < text.length; i += sz) {
      chunks.push({
        id: Math.floor(i / sz),
        text: text.slice(i, i + sz),
      });
    }
    return chunks;
  }, [messageInput, chunkSize]);

  // Transmit whole message: pushes chunks into flow control pipeline
  const handleTransmitMessage = () => {
    if (!messageChunks || messageChunks.length === 0 || !simulatorRef.current) return;

    // Dispatch as many frames as the window allows immediately; queue the rest
    const chunksToSend = messageChunks.map((c) => c.text);
    const protoInstance = simulatorRef.current.protocolInstance;

    let queue = [];
    for (let i = 0; i < chunksToSend.length; i++) {
      const chunk = chunksToSend[i];
      let canSendMore = false;
      if (protocol === FlowControlProtocol.STOP_AND_WAIT) {
        canSendMore = protoInstance.status === 'IDLE' && i === 0;
      } else if (protoInstance.canSend) {
        canSendMore = protoInstance.canSend();
      }

      if (canSendMore) {
        simulatorRef.current.send(chunk);
      } else {
        queue.push(chunk);
      }
    }

    setPendingQueue(queue);
    updateSnapshot();
  };

  // Transmit single frame
  const handleSendSingleFrame = () => {
    if (simulatorRef.current) {
      simulatorRef.current.send('Data');
      updateSnapshot();
    }
  };

  // Transmit batch of frames
  const handleSendBatch = (count = 4) => {
    if (simulatorRef.current) {
      simulatorRef.current.sendBatch(count, 'Pkt');
      updateSnapshot();
    }
  };

  // Fault Injection Handlers
  const handleToggleDataFault = (action) => {
    if (pendingDataFault === action) {
      setPendingDataFault(null);
      if (simulatorRef.current) simulatorRef.current.forwardChannel.clearFaultPlan();
    } else {
      setPendingDataFault(action);
      if (simulatorRef.current) {
        simulatorRef.current.forwardChannel.clearFaultPlan();
        simulatorRef.current.forwardChannel.addFault({ action, bitIndex: 1 });
      }
    }
    updateSnapshot();
  };

  const handleToggleAckFault = (action) => {
    if (pendingAckFault === action) {
      setPendingAckFault(null);
      if (simulatorRef.current) simulatorRef.current.reverseChannel.clearFaultPlan();
    } else {
      setPendingAckFault(action);
      if (simulatorRef.current) {
        simulatorRef.current.reverseChannel.clearFaultPlan();
        simulatorRef.current.reverseChannel.addFault({ action });
      }
    }
    updateSnapshot();
  };

  const handleClearFaults = () => {
    setPendingDataFault(null);
    setPendingAckFault(null);
    if (simulatorRef.current) {
      simulatorRef.current.forwardChannel.clearFaultPlan();
      simulatorRef.current.reverseChannel.clearFaultPlan();
    }
    updateSnapshot();
  };

  // Interactive drop / corrupt of specific in-flight packets
  const handleDropPacket = (eventId) => {
    if (simulatorRef.current) {
      simulatorRef.current.dropInFlight(eventId);
      updateSnapshot();
    }
  };

  const handleCorruptPacket = (eventId) => {
    if (simulatorRef.current) {
      simulatorRef.current.corruptInFlight(eventId);
      updateSnapshot();
    }
  };

  // Preset scenarios
  const applyPreset = (presetName) => {
    setIsPlaying(false);
    setPendingDataFault(null);
    setPendingAckFault(null);
    setPendingQueue([]);
    if (!simulatorRef.current) return;

    if (presetName === 'CLEAN') {
      simulatorRef.current.reset();
      simulatorRef.current.sendBatch(3, 'Frame');
      updateSnapshot();
    } else if (presetName === 'DROP_DATA') {
      simulatorRef.current.reset();
      simulatorRef.current.send('Packet #0 (OK)');
      simulatorRef.current.forwardChannel.addFault({ action: 'DROP' });
      simulatorRef.current.send('Packet #1 (Dropped)');
      if (protocol !== FlowControlProtocol.STOP_AND_WAIT) {
        simulatorRef.current.send('Packet #2 (Out-of-Order)');
      }
      updateSnapshot();
    } else if (presetName === 'DROP_ACK') {
      simulatorRef.current.reset();
      simulatorRef.current.reverseChannel.addFault({ action: 'DROP' });
      simulatorRef.current.send('Frame (Lost ACK)');
      updateSnapshot();
    } else if (presetName === 'CORRUPT') {
      simulatorRef.current.reset();
      simulatorRef.current.forwardChannel.addFault({ action: 'CORRUPT', bitIndex: 1 });
      simulatorRef.current.send('Damaged Frame');
      updateSnapshot();
    }
  };

  // Safe fallback if snapshot is empty
  if (!snapshot) {
    return <div className="card">Initializing Flow Control Simulator...</div>;
  }

  const { protocolState, inFlightFrames, metrics, virtualTick, eventLogs } = snapshot;
  const seqModulus = 1 << m;

  // Reconstructed delivered text at receiver
  const reconstructedPayload = useMemo(() => {
    const delivered = protocolState?.receiver?.deliveredPayloads || [];
    return delivered.map((p) => p.payloadText || String(p.payload || '')).join('');
  }, [protocolState?.receiver?.deliveredPayloads]);

  // Live Plain-English Simulation Narration
  const liveNarration = useMemo(() => {
    const inFlight = inFlightFrames || [];
    const latestEvent = eventLogs && eventLogs.length > 0 ? eventLogs[eventLogs.length - 1] : null;

    if (inFlight.length > 0) {
      const dataFrames = inFlight.filter((p) => p.direction === 'FORWARD');
      const ackFrames = inFlight.filter((p) => p.direction === 'REVERSE');

      if (dataFrames.length > 0) {
        const firstData = dataFrames[0];
        if (firstData.corrupted) {
          return {
            icon: '⚡',
            className: 'state-fault',
            text: `Channel Fault Injected! DATA Frame #${firstData.frame?.seq ?? 0} ("${firstData.frame?.payloadText || firstData.frame?.payload || ''}") is traversing the forward medium with corrupted bits. Receiver will discard it!`,
          };
        }
        if (protocol === FlowControlProtocol.STOP_AND_WAIT) {
          return {
            icon: '📡',
            className: 'state-transmitting',
            text: `Stop-and-Wait: DATA Frame #${firstData.frame?.seq ?? 0} (Alternating Bit ${firstData.frame?.seq ?? 0}) is traversing forward medium. Sender is paused awaiting ACK before proceeding.`,
          };
        }
        return {
          icon: '📡',
          className: 'state-transmitting',
          text: `${protocol === FlowControlProtocol.GO_BACK_N ? 'Go-Back-N' : 'Selective Repeat'}: ${dataFrames.length} DATA frame(s) in flight across the pipelined channel (Frames: ${dataFrames.map((d) => '#' + (d.frame?.seq ?? 0)).join(', ')}).`,
        };
      }

      if (ackFrames.length > 0) {
        const firstAck = ackFrames[0];
        if (protocol === FlowControlProtocol.GO_BACK_N) {
          return {
            icon: '📩',
            className: 'state-transmitting',
            text: `Receiver emitted Cumulative ACK #${firstAck.frame?.ack ?? 1}. Acknowledges all frames up to #${(firstAck.frame?.ack ?? 1) - 1}. Returning to Sender.`,
          };
        } else if (protocol === FlowControlProtocol.SELECTIVE_REPEAT) {
          return {
            icon: '🎯',
            className: 'state-transmitting',
            text: `Receiver emitted Selective ACK #${firstAck.frame?.ack ?? 0}. Confirms reception of frame #${firstAck.frame?.ack ?? 0} specifically. Returning to Sender.`,
          };
        } else {
          return {
            icon: '📩',
            className: 'state-transmitting',
            text: `Receiver accepted frame and emitted ACK #${firstAck.frame?.ack ?? 1} (expecting next bit ${firstAck.frame?.ack ?? 1}). Returning to Sender.`,
          };
        }
      }
    }

    if (latestEvent) {
      if (latestEvent.type === 'TIMEOUT') {
        return {
          icon: '⏱️',
          className: 'state-fault',
          text: `Timeout Expired! ${
            protocol === FlowControlProtocol.GO_BACK_N
              ? 'Go-Back-N timer expired for base Sf. Retransmitting all outstanding frames in window!'
              : protocol === FlowControlProtocol.SELECTIVE_REPEAT
              ? `Selective Repeat timer expired for frame #${latestEvent.payload?.seq ?? ''}. Retransmitting only the timed-out frame.`
              : 'Stop-and-Wait timer expired. Retransmitting unacknowledged frame.'
          }`,
        };
      }
      if (latestEvent.type === 'FRAME_DISCARDED_OUT_OF_ORDER') {
        return {
          icon: '🚫',
          className: 'state-fault',
          text: `Out-of-Order Discard! Go-Back-N receiver received frame #${latestEvent.frame?.seq ?? ''} but expected #${latestEvent.expectedSeq}. Discarded and re-sent cumulative ACK.`,
        };
      }
      if (latestEvent.type === 'FRAME_BUFFERED_OUT_OF_ORDER') {
        return {
          icon: '🟣',
          className: 'state-waiting',
          text: `Out-of-Order Buffered! Selective Repeat accepted frame #${latestEvent.frame?.seq ?? ''} into receiver memory buffer while awaiting missing earlier frame.`,
        };
      }
      if (latestEvent.type === 'FRAME_CORRUPTED' || latestEvent.type === 'ACK_CORRUPTED') {
        return {
          icon: '⚡',
          className: 'state-fault',
          text: `Corrupted packet detected! Discarded silently. Sender ARQ timer will trigger recovery.`,
        };
      }
    }

    const deliveredCount =
      protocolState?.receiver?.deliveredCount ?? protocolState?.receiver?.deliveredPayloads?.length ?? 0;
    if (deliveredCount > 0 && inFlight.length === 0) {
      return {
        icon: '🎉',
        className: 'state-completed',
        text: `Transmissions Settled! ${deliveredCount} payload frame(s) successfully delivered. Reconstructed message: "${reconstructedPayload}"`,
      };
    }

    return {
      icon: '💡',
      className: 'state-waiting',
      text: `Ready to simulate ${
        protocol === FlowControlProtocol.STOP_AND_WAIT
          ? 'Stop-and-Wait ARQ (Alternating Bit)'
          : protocol === FlowControlProtocol.GO_BACK_N
          ? 'Go-Back-N ARQ (Sliding Window & Cumulative ACK)'
          : 'Selective Repeat ARQ (Independent Windows & Buffer)'
      }. Enter a message payload above and click Transmit.`,
    };
  }, [snapshot, protocol, inFlightFrames, eventLogs, protocolState, reconstructedPayload]);

  // Filtered trace logs
  const filteredLogs = (eventLogs || [])
    .filter((log) => {
      if (traceFilter === 'ALL') return true;
      if (traceFilter === 'FRAMES') return log.type && log.type.includes('FRAME');
      if (traceFilter === 'ACKS') return log.type && log.type.includes('ACK');
      if (traceFilter === 'FAULTS')
        return (
          log.type &&
          (log.type.includes('CORRUPT') || log.type.includes('DROP') || log.type.includes('TIMEOUT'))
        );
      return true;
    })
    .slice(-40)
    .reverse();

  return (
    <div className="flow-control-container">
      {/* 1. Header & Protocol Selector */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="card-title">Flow Control &amp; Sliding Window Visualizer</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
              Deterministic discrete-event modeling of Stop-and-Wait, Go-Back-N, and Selective Repeat ARQ.
            </p>
          </div>
          <span className="badge badge-info">Interactive ARQ Lab</span>
        </div>

        {/* Protocol Selector Tabs */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className={`btn ${protocol === FlowControlProtocol.STOP_AND_WAIT ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleProtocolChange(FlowControlProtocol.STOP_AND_WAIT)}
          >
            🔄 Stop-and-Wait ARQ
          </button>
          <button
            className={`btn ${protocol === FlowControlProtocol.GO_BACK_N ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleProtocolChange(FlowControlProtocol.GO_BACK_N)}
          >
            ⏩ Go-Back-N ARQ
          </button>
          <button
            className={`btn ${protocol === FlowControlProtocol.SELECTIVE_REPEAT ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleProtocolChange(FlowControlProtocol.SELECTIVE_REPEAT)}
          >
            🎯 Selective Repeat ARQ
          </button>
        </div>
      </div>

      {/* 2. Message Payload Input & Concrete Frame Segmentation */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title" style={{ fontSize: '1rem' }}>
            ✉️ Message Payload &amp; Discrete Frame Creation
          </h3>
          <span className="badge badge-info">
            {messageChunks.length} Frame(s) Created | Chunk Size: {chunkSize}B
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <label className="form-label">Upper-Layer Message Payload:</label>
            <textarea
              className="input-textarea"
              rows={2}
              style={{ minHeight: '60px', width: '100%', fontFamily: 'var(--font-mono)' }}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Type a message to segment into flow control frames..."
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '180px' }}>
            <label className="form-label">Chunk Size (chars):</label>
            <select
              className="input-textarea"
              style={{ minHeight: 'auto', padding: '0.45rem' }}
              value={chunkSize}
              onChange={(e) => setChunkSize(parseInt(e.target.value, 10))}
            >
              <option value={2}>2 chars / frame</option>
              <option value={4}>4 chars / frame</option>
              <option value={8}>8 chars / frame</option>
              <option value={16}>16 chars / frame</option>
            </select>
          </div>
        </div>

        {/* Concrete Frame Queue Ribbon */}
        {messageChunks.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{`🎞️ Concrete Segmented Frame Queue (${messageChunks.length} Frames):`}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {protocol === FlowControlProtocol.STOP_AND_WAIT
                  ? 'Stop-and-Wait ARQ: 1 frame at a time; subsequent frames wait for ACK'
                  : 'Sliding Window ARQ: Pipeline up to Ws unacknowledged frames'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
              {messageChunks.map((chunk, idx) => {
                const deliveredCount = protocolState?.receiver?.deliveredCount ?? 0;
                const ackInFlight = (inFlightFrames || []).some((p) => p.direction === 'REVERSE');
                const dataInFlight = (inFlightFrames || []).some(
                  (p) => p.direction === 'FORWARD' && p.frame?.payloadText === chunk.text
                );

                let status = 'WAITING';
                let statusBg = '#f1f5f9';
                let statusColor = '#64748b';
                let statusIcon = '⏳';

                if (idx < deliveredCount) {
                  if (idx === deliveredCount - 1 && ackInFlight) {
                    status = 'RECEIVED';
                    statusBg = '#dcfce7';
                    statusColor = '#15803d';
                    statusIcon = '📥';
                  } else {
                    status = 'ACKNOWLEDGED';
                    statusBg = '#bbf7d0';
                    statusColor = '#166534';
                    statusIcon = '✅';
                  }
                } else if (dataInFlight) {
                  const flightPkt = (inFlightFrames || []).find(
                    (p) => p.direction === 'FORWARD' && p.frame?.payloadText === chunk.text
                  );
                  if (flightPkt?.frame?.attempt > 1 || flightPkt?.corrupted) {
                    status = flightPkt?.corrupted ? 'CORRUPTED' : 'RETRANSMITTING';
                    statusBg = flightPkt?.corrupted ? '#ffe4e6' : '#fef3c7';
                    statusColor = flightPkt?.corrupted ? '#be123c' : '#b45309';
                    statusIcon = flightPkt?.corrupted ? '⚡' : '🔄';
                  } else {
                    status = 'IN TRANSIT';
                    statusBg = '#dbeafe';
                    statusColor = '#1d4ed8';
                    statusIcon = '🚀';
                  }
                } else if (
                  protocolState?.sender?.status === 'WAITING_FOR_ACK' &&
                  idx === deliveredCount
                ) {
                  const currentAttempt = protocolState?.sender?.currentFrame?.attempt || 1;
                  if (currentAttempt > 1) {
                    status = 'RETRANSMITTING';
                    statusBg = '#fef3c7';
                    statusColor = '#b45309';
                    statusIcon = '🔄';
                  } else {
                    status = 'IN TRANSIT';
                    statusBg = '#dbeafe';
                    statusColor = '#1d4ed8';
                    statusIcon = '🚀';
                  }
                }

                return (
                  <div
                    key={chunk.id}
                    style={{
                      background: '#ffffff',
                      border: '1.5px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.45rem 0.65rem',
                      minWidth: '135px',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.3rem',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: 'var(--accent-blue)' }}>Frame #{idx}</strong>
                      <span
                        style={{
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          padding: '0.12rem 0.4rem',
                          borderRadius: '4px',
                          background: statusBg,
                          color: statusColor,
                          textTransform: 'uppercase',
                        }}
                      >
                        {statusIcon} {status}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>&quot;{chunk.text}&quot;</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {chunk.text.length} char{chunk.text.length === 1 ? '' : 's'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Transmission Trigger Buttons */}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={handleTransmitMessage} disabled={messageChunks.length === 0}>
            🚀 Transmit Message ({messageChunks.length} Frames)
          </button>
          <button className="btn btn-secondary" onClick={handleSendSingleFrame}>
            + Send 1 Frame
          </button>
          {protocol !== FlowControlProtocol.STOP_AND_WAIT && (
            <button className="btn btn-secondary" onClick={() => handleSendBatch(4)}>
              + Send Batch (4 Frames)
            </button>
          )}
          {pendingQueue.length > 0 && (
            <span className="badge badge-warning" style={{ alignSelf: 'center' }}>
              {pendingQueue.length} Frame(s) Waiting for Window Capacity
            </span>
          )}
        </div>
      </div>

      {/* 3. Live Plain-English Narration Banner */}
      <div className={`live-narration-banner ${liveNarration.className}`} style={{ marginBottom: '1.25rem' }}>
        <span className="narration-icon">{liveNarration.icon}</span>
        <div className="narration-body">
          <div className="narration-title">Live Wire Narration</div>
          <div className="narration-text">{liveNarration.text}</div>
        </div>
      </div>

      {/* 4. Playback Controls Toolbar */}
      <div className="card" style={{ padding: '0.75rem 1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className={`btn btn-sm ${isPlaying ? 'btn-danger' : 'btn-success'}`}
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
            <button className="btn btn-sm btn-outline" onClick={handleStepTick}>
              ⏭ Step 1 Tick
            </button>
            <button className="btn btn-sm btn-outline" onClick={handleStepEvent}>
              ⏩ Step 1 Event
            </button>
            <button className="btn btn-sm btn-outline" onClick={handleRunToCompletion}>
              ⚡ Instant / Complete
            </button>
            <button className="btn btn-sm btn-secondary" onClick={handleReset}>
              🔄 Reset
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Speed:</span>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <button
                className={`btn btn-sm ${playSpeedMs === 300 ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setPlaySpeedMs(300)}
              >
                Slow
              </button>
              <button
                className={`btn btn-sm ${playSpeedMs === 100 ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setPlaySpeedMs(100)}
              >
                Normal
              </button>
              <button
                className={`btn btn-sm ${playSpeedMs === 30 ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setPlaySpeedMs(30)}
              >
                Fast
              </button>
            </div>
            <span className="badge badge-info" style={{ fontFamily: 'var(--font-mono)' }}>
              t = {virtualTick} ticks
            </span>
          </div>
        </div>
      </div>

      {/* 5. Dominant Visual Animation Canvas: Dual Station Nodes & Multi-Lane Duplex Medium */}
      <div className="channel-visualizer">
        {/* Node Station Badges */}
        <div className="channel-nodes-header">
          {/* Station A (Sender Node) */}
          <div className="node-badge node-badge-sender">
            <div>
              <div className="node-title">📡 Station A (Sender)</div>
              <div className="node-subtitle">
                {protocol === FlowControlProtocol.STOP_AND_WAIT ? (
                  `Status: ${protocolState?.sender?.status ?? 'IDLE'} | Seq Bit: ${protocolState?.sender?.seq ?? 0}`
                ) : (
                  `Sf (Base): ${protocolState?.sender?.base ?? 0} | Sn (Next): ${protocolState?.sender?.nextSeq ?? 0} | Ws: ${snapshot.config?.windowSize ?? 4}`
                )}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Timer: {protocolState?.sender?.hasTimer ? '⏱️ Active' : 'Idle'} | Timeout: {timeoutDuration} ticks
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Physical Duplex Link (Propagation Delay = {propagationDelay} ticks)
            </span>
          </div>

          {/* Station B (Receiver Node) */}
          <div className="node-badge node-badge-receiver">
            <div style={{ textAlign: 'right' }}>
              <div className="node-title">🖥️ Station B (Receiver)</div>
              <div className="node-subtitle">
                {protocol === FlowControlProtocol.SELECTIVE_REPEAT ? (
                  `Rf (Base): ${protocolState?.receiver?.rxBase ?? 0} | Buffered: ${protocolState?.receiver?.rxBuffer?.length ?? 0}`
                ) : (
                  `Rn (Expected): ${protocolState?.receiver?.expectedSeq ?? 0} | Delivered: ${protocolState?.receiver?.deliveredCount ?? 0}`
                )}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--accent-emerald)', marginTop: '2px', fontWeight: 600 }}>
                Reconstructed: &quot;{reconstructedPayload}&quot;
              </div>
            </div>
          </div>
        </div>

        {/* Forward Lane (DATA frames: Sender ➔ Receiver) */}
        <div className="channel-lane">
          <span className="lane-label">Forward Path (DATA Frames ➔)</span>
          {(inFlightFrames || [])
            .filter((p) => p.direction === 'FORWARD')
            .map((pkt) => {
              const leftPercent = Math.min(92, Math.max(8, pkt.progress * 100));
              return (
                <div
                  key={pkt.eventId}
                  className={`packet-pill packet-data ${pkt.corrupted ? 'packet-corrupted' : ''}`}
                  style={{ left: `${leftPercent}%` }}
                >
                  <span>📦 DATA #{pkt.frame?.seq ?? 0}</span>
                  {pkt.frame?.payloadText && (
                    <span style={{ opacity: 0.85 }}>&quot;{pkt.frame.payloadText}&quot;</span>
                  )}
                  {pkt.corrupted && <span style={{ color: 'var(--accent-rose)' }}>⚡ [CORRUPT]</span>}
                  <div className="packet-controls">
                    <button
                      className="packet-btn"
                      title="Corrupt bit in flight"
                      onClick={() => handleCorruptPacket(pkt.eventId)}
                    >
                      ⚡
                    </button>
                    <button
                      className="packet-btn"
                      title="Drop packet from channel"
                      onClick={() => handleDropPacket(pkt.eventId)}
                    >
                      ❌
                    </button>
                  </div>
                </div>
              );
            })}
          {(inFlightFrames || []).filter((p) => p.direction === 'FORWARD').length === 0 && (
            <div style={{ width: '100%', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              ── Forward Medium Idle ──
            </div>
          )}
        </div>

        {/* Reverse Lane (ACK frames: Receiver ⬅ Sender) */}
        <div className="channel-lane" style={{ marginBottom: '1rem' }}>
          <span className="lane-label">Reverse Path (ACK Frames ⬅)</span>
          {(inFlightFrames || [])
            .filter((p) => p.direction === 'REVERSE')
            .map((pkt) => {
              // ACK moves Right to Left (progress = 0 at Receiver, progress = 1 at Sender)
              const leftPercent = Math.min(92, Math.max(8, (1 - pkt.progress) * 100));
              return (
                <div
                  key={pkt.eventId}
                  className={`packet-pill packet-ack ${pkt.corrupted ? 'packet-corrupted' : ''}`}
                  style={{ left: `${leftPercent}%` }}
                >
                  <span>
                    📩 {protocol === FlowControlProtocol.GO_BACK_N ? 'Cum-ACK' : protocol === FlowControlProtocol.SELECTIVE_REPEAT ? 'Sel-ACK' : 'ACK'} #{pkt.frame?.ack ?? 0}
                  </span>
                  {pkt.corrupted && <span style={{ color: 'var(--accent-rose)' }}>⚡ [CORRUPT]</span>}
                  <div className="packet-controls">
                    <button
                      className="packet-btn"
                      title="Corrupt ACK in flight"
                      onClick={() => handleCorruptPacket(pkt.eventId)}
                    >
                      ⚡
                    </button>
                    <button
                      className="packet-btn"
                      title="Drop ACK from channel"
                      onClick={() => handleDropPacket(pkt.eventId)}
                    >
                      ❌
                    </button>
                  </div>
                </div>
              );
            })}
          {(inFlightFrames || []).filter((p) => p.direction === 'REVERSE').length === 0 && (
            <div style={{ width: '100%', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              ── Reverse Medium Idle ──
            </div>
          )}
        </div>

        {/* Channel Fault Injection Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-rose)' }}>
            ⚡ Channel Fault Injection:
          </span>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className={`btn btn-sm ${pendingDataFault === 'CORRUPT' ? 'btn-danger' : 'btn-outline'}`}
              onClick={() => handleToggleDataFault('CORRUPT')}
              title="Flip bit in next forward DATA transmission"
            >
              ⚡ Corrupt DATA
            </button>
            <button
              className={`btn btn-sm ${pendingDataFault === 'DROP' ? 'btn-danger' : 'btn-outline'}`}
              onClick={() => handleToggleDataFault('DROP')}
              title="Drop next forward DATA frame"
            >
              ❌ Drop DATA
            </button>
            <button
              className={`btn btn-sm ${pendingAckFault === 'DROP' ? 'btn-danger' : 'btn-outline'}`}
              onClick={() => handleToggleAckFault('DROP')}
              title="Drop next reverse ACK to test duplicate handling"
            >
              🔁 Drop ACK
            </button>
            {(pendingDataFault || pendingAckFault) && (
              <button className="btn btn-sm btn-secondary" onClick={handleClearFaults}>
                🧹 Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 6. Interactive Sliding Window Slot Strips */}
      <div className="grid-2" style={{ marginBottom: '1.25rem' }}>
        {/* Sender Sliding Window Strip */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title" style={{ fontSize: '1rem' }}>
              Sender Sliding Window {protocol === FlowControlProtocol.STOP_AND_WAIT ? '(Ws = 1, Bit 0/1)' : `[Sf .. Sf + Ws)`}
            </h3>
            <span className="badge badge-info">
              Ws = {protocol === FlowControlProtocol.STOP_AND_WAIT ? 1 : (snapshot.config?.windowSize ?? 4)}
            </span>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            {protocol === FlowControlProtocol.STOP_AND_WAIT
              ? 'Stop-and-Wait uses an alternating sequence bit (0 or 1). Exactly one frame is sent at a time.'
              : 'Window spans [Sf .. Sf + Ws - 1]. Blue slots are ready to transmit. Yellow Sf is the oldest unacked frame.'}
          </p>

          <div className="window-strip">
            {Array.from({ length: seqModulus }).map((_, slotIdx) => {
              const base = protocol === FlowControlProtocol.STOP_AND_WAIT
                ? (protocolState?.sender?.seq ?? 0)
                : (protocolState?.sender?.base ?? 0);
              const nextSeq = protocol === FlowControlProtocol.STOP_AND_WAIT
                ? (protocolState?.sender?.status === 'IDLE' ? protocolState?.sender?.seq ?? 0 : ((protocolState?.sender?.seq ?? 0) + 1) % 2)
                : (protocolState?.sender?.nextSeq ?? 0);

              const inWin = isWithinWindow(slotIdx, base, snapshot.config?.windowSize ?? 1, m);
              const isBase = slotIdx === base;

              // Check outstanding / acked status
              let isOutstanding = false;
              let isAcked = false;
              if (protocol === FlowControlProtocol.STOP_AND_WAIT) {
                isOutstanding = protocolState?.sender?.status === 'WAITING_FOR_ACK' && slotIdx === base;
              } else if (protocol === FlowControlProtocol.GO_BACK_N) {
                const buffer = protocolState?.sender?.buffer || [];
                isOutstanding = buffer.some((b) => b.seq === slotIdx);
              } else if (protocol === FlowControlProtocol.SELECTIVE_REPEAT) {
                const buffer = protocolState?.sender?.buffer || [];
                const b = buffer.find((item) => item.seq === slotIdx);
                isOutstanding = b && !b.acked;
                isAcked = b && b.acked;
              }

              let slotClass = 'slot-disabled';
              if (isAcked) {
                slotClass = 'slot-acked';
              } else if (isOutstanding) {
                slotClass = 'slot-outstanding';
              } else if (inWin) {
                slotClass = 'slot-ready';
              }

              return (
                <div
                  key={slotIdx}
                  className={`window-slot-item ${inWin ? 'slot-in-window' : ''} ${slotClass}`}
                >
                  {isBase && <span className="slot-base-marker">Sf</span>}
                  <span className="slot-index">{slotIdx}</span>
                  <span className="slot-subtext">
                    {isAcked ? 'ACK' : isOutstanding ? '⏳' : inWin ? 'Ready' : '-'}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
            <span>🟡 Sf: Oldest Base</span>
            <span>🔵 Ready: In Window</span>
            <span>⏳ In Flight</span>
            <span>🟢 Confirmed ACK</span>
          </div>
        </div>

        {/* Receiver Sliding Window Strip */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title" style={{ fontSize: '1rem' }}>
              Receiver Window {protocol === FlowControlProtocol.SELECTIVE_REPEAT ? '[Rf .. Rf + Wr)' : '(Wr = 1)'}
            </h3>
            <span className="badge badge-success">
              Wr = {protocol === FlowControlProtocol.SELECTIVE_REPEAT ? (snapshot.config?.rxWindowSize ?? 4) : 1}
            </span>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            {protocol === FlowControlProtocol.SELECTIVE_REPEAT
              ? 'Selective Repeat buffers out-of-order frames in purple. Base Rf advances when the lowest frame arrives.'
              : 'Go-Back-N & Stop-and-Wait require strictly in-order arrival (Wr = 1). Out-of-order frames are discarded.'}
          </p>

          <div className="window-strip">
            {Array.from({ length: seqModulus }).map((_, slotIdx) => {
              const rxBase = protocol === FlowControlProtocol.SELECTIVE_REPEAT
                ? (protocolState?.receiver?.rxBase ?? 0)
                : (protocolState?.receiver?.expectedSeq ?? 0);
              const rxWinSize = protocol === FlowControlProtocol.SELECTIVE_REPEAT
                ? (snapshot.config?.rxWindowSize ?? 4)
                : 1;

              const inWin = isWithinWindow(slotIdx, rxBase, rxWinSize, m);
              const isBase = slotIdx === rxBase;

              const isBuffered = protocol === FlowControlProtocol.SELECTIVE_REPEAT &&
                (protocolState?.receiver?.rxBuffer || []).some((b) => b.seq === slotIdx);

              let slotClass = 'slot-disabled';
              if (isBuffered) {
                slotClass = 'slot-buffered';
              } else if (isBase) {
                slotClass = 'slot-ready';
              } else if (inWin) {
                slotClass = 'slot-ready';
              }

              return (
                <div
                  key={slotIdx}
                  className={`window-slot-item ${inWin ? 'slot-in-window' : ''} ${slotClass}`}
                >
                  {isBase && (
                    <span className="slot-base-marker" style={{ background: 'var(--accent-emerald)', color: '#fff' }}>
                      Rf
                    </span>
                  )}
                  <span className="slot-index">{slotIdx}</span>
                  <span className="slot-subtext">
                    {isBuffered ? 'Buffer' : isBase ? 'Expect' : inWin ? 'Accept' : '-'}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
            <span>🟢 Rf: Expected Base</span>
            {protocol === FlowControlProtocol.SELECTIVE_REPEAT && <span>🟣 Buffered Out-of-Order</span>}
            <span>🔵 In Receive Window</span>
          </div>
        </div>
      </div>

      {/* 7. Educational Scenario Presets */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-header">
          <h3 className="card-title" style={{ fontSize: '1rem' }}>🎓 Educational Scenario Presets</h3>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={() => applyPreset('CLEAN')}>
            ✓ Clean Pipelined Transmission
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => applyPreset('CORRUPT')}>
            ⚡ Channel Bit Corruption &amp; Recovery
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => applyPreset('DROP_DATA')}>
            ❌ Frame Loss &amp; Timeout Retransmission
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => applyPreset('DROP_ACK')}>
            🔁 Lost ACK &amp; Duplicate Suppression
          </button>
        </div>
      </div>

      {/* 8. Collapsible Technical Inspector: Sliding Window Math & Protocol Formulas */}
      <details className="card" style={{ marginBottom: '1.25rem' }}>
        <summary style={{ cursor: 'pointer', padding: '0.5rem 0', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📐 Sliding Window Mathematics &amp; Protocol Theory</span>
          <span className="badge badge-info">Academic Viva Guide</span>
        </summary>
        <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', marginTop: '0.5rem' }}>
          <table className="table" style={{ width: '100%', marginBottom: '1rem', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>Protocol Property</th>
                <th>Stop-and-Wait ARQ</th>
                <th>Go-Back-N ARQ</th>
                <th>Selective Repeat ARQ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Sender Window (Ws)</strong></td>
                <td>Ws = 1</td>
                <td>Ws &le; 2^m - 1 (e.g. 7 for m=3)</td>
                <td>Ws &le; 2^(m-1) (e.g. 4 for m=3)</td>
              </tr>
              <tr>
                <td><strong>Receiver Window (Wr)</strong></td>
                <td>Wr = 1</td>
                <td>Wr = 1</td>
                <td>Wr = Ws &le; 2^(m-1)</td>
              </tr>
              <tr>
                <td><strong>Acknowledgment Type</strong></td>
                <td>Alternating Bit (0/1)</td>
                <td>Cumulative ACK(Rn)</td>
                <td>Individual Selective ACK(seq)</td>
              </tr>
              <tr>
                <td><strong>Out-of-Order Policy</strong></td>
                <td>Discarded</td>
                <td>Discarded &amp; Re-ACK</td>
                <td>Buffered in Receiver Memory</td>
              </tr>
              <tr>
                <td><strong>Retransmission Policy</strong></td>
                <td>Single frame</td>
                <td>Entire window from Sf (Go Back N)</td>
                <td>Only the specific missing frame</td>
              </tr>
              <tr>
                <td><strong>Theoretical Efficiency (&eta;)</strong></td>
                <td>&eta; = 1 / (1 + 2a)</td>
                <td>&eta; = min(1, Ws / (1 + 2a))</td>
                <td>&eta; = min(1, Ws / (1 + 2a))</td>
              </tr>
            </tbody>
          </table>

          <div className="grid-2" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <div>
              <strong>Why Ws + Wr &le; 2^m?</strong>
              <p style={{ marginTop: '0.25rem' }}>
                If the combined window sizes exceed the sequence modulus 2^m, an acknowledgment ambiguity occurs where
                retransmissions cannot be distinguished from newly generated frames with wrapped sequence numbers.
              </p>
            </div>
            <div>
              <strong>Delay Ratio &amp; Bandwidth-Delay Product (BDP):</strong>
              <p style={{ marginTop: '0.25rem' }}>
                a = Tp / Tt = {metrics.a} | Round-Trip Time RTT = 2&middot;Tp + Tt = {metrics.rtt} ticks | Optimal Window Size Wopt = {metrics.optimalWindowSize} frames.
              </p>
            </div>
          </div>
        </div>
      </details>

      {/* 9. Collapsible Technical Inspector: Telemetry Counters & Goodput */}
      <details className="card" style={{ marginBottom: '1.25rem' }}>
        <summary style={{ cursor: 'pointer', padding: '0.5rem 0', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📊 Telemetry Metrics &amp; Performance Counters</span>
          <span className="badge badge-success">Efficiency: {metrics.channelUtilization}%</span>
        </summary>
        <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', marginTop: '0.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="stat-card">
              <div className="stat-label">Channel Utilization (U)</div>
              <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>
                {metrics.channelUtilization}%
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Success Ratio (Stx)</div>
              <div className="stat-value" style={{ color: 'var(--accent-emerald)' }}>
                {metrics.transmissionSuccessRatio}%
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Goodput</div>
              <div className="stat-value" style={{ color: 'var(--accent-cyan)' }}>
                {metrics.goodputFramesPerTick} f/t
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Delivered Frames</div>
              <div className="stat-value" style={{ color: 'var(--accent-emerald)' }}>
                {protocolState?.stats?.framesDelivered ?? 0}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Retransmissions</div>
              <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>
                {protocolState?.stats?.retransmissions ?? 0}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Timeouts</div>
              <div className="stat-value" style={{ color: 'var(--accent-rose)' }}>
                {protocolState?.stats?.timeouts ?? 0}
              </div>
            </div>
          </div>
        </div>
      </details>

      {/* 10. Collapsible Technical Inspector: Live Discrete-Event Packet Trace */}
      <details className="card">
        <summary style={{ cursor: 'pointer', padding: '0.5rem 0', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📜 Live Discrete-Event Packet Trace Log</span>
          <span className="badge badge-info">{filteredLogs.length} Events</span>
        </summary>
        <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', marginTop: '0.5rem' }}>
          {/* Trace Filter Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {['ALL', 'FRAMES', 'ACKS', 'FAULTS'].map((f) => (
              <button
                key={f}
                className={`btn btn-sm ${traceFilter === f ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setTraceFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="trace-log-container" style={{ maxHeight: '220px' }}>
            {filteredLogs.map((log) => (
              <div key={log.id} className="trace-row">
                <span className="trace-tick">t={log.tick}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', minWidth: '100px' }}>
                  {log.type}:
                </span>
                <span style={{ color: 'var(--text-secondary)', flex: 1, fontSize: '0.78rem' }}>
                  {log.data?.frame?.seq !== undefined && `Frame #${log.data.frame.seq} `}
                  {log.data?.ackFrame?.ack !== undefined && `ACK #${log.data.ackFrame.ack} `}
                  {log.data?.expectedSeq !== undefined && `(Expected: #${log.data.expectedSeq}) `}
                  {log.data?.attempt !== undefined && `(Attempt #${log.data.attempt}) `}
                  {typeof log.data === 'string' ? log.data : ''}
                </span>
                {log.type?.includes('CORRUPT') && <span className="badge badge-danger">CORRUPT</span>}
                {log.type?.includes('DROP') && <span className="badge badge-danger">DROP</span>}
                {log.type?.includes('TIMEOUT') && <span className="badge badge-warning">TIMEOUT</span>}
              </div>
            ))}
            {filteredLogs.length === 0 && (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                No events matching filter.
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
