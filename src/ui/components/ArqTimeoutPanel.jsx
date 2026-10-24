/**
 * ArqTimeoutPanel.jsx
 * 
 * Live ARQ Timeout Countdown and Retransmission Visualization.
 * Continuously synchronized with the discrete-event simulation engine's virtual clock
 * and actual ARQ protocol timers.
 */

import React from 'react';

/**
 * @param {Object} props
 * @param {Object} props.timerState - Live timer state from protocol / coordinator
 * @param {number} [props.timeoutDuration] - Configured timeout duration in ticks
 * @param {string} [props.protocol] - 'SW' | 'GBN' | 'SR' | 'CSMA_CD'
 * @param {number} [props.currentTick] - Current virtual clock tick
 * @param {boolean} [props.compact=false] - If true, renders a more compact card variant
 */
export default function ArqTimeoutPanel({
  timerState,
  timeoutDuration = 14,
  protocol = 'SW',
  currentTick = 0,
  compact = false,
}) {
  const isCsmaCd = protocol === 'CSMA_CD' || timerState?.protocol === 'CSMA_CD';

  if (isCsmaCd) {
    return (
      <div className="arq-timeout-panel arq-timeout-idle">
        <div className="timeout-header">
          <span className="timeout-title">
            <span className="timeout-icon">⏱️</span>
            <strong>ARQ Retransmission Timer</strong>
          </span>
          <span className="badge badge-secondary">Shared Medium</span>
        </div>
        <div className="timeout-body">
          <p className="timeout-desc" style={{ color: 'var(--text-muted)' }}>
            CSMA/CD uses 1-persistent carrier sense and truncated binary exponential backoff (BEB). ARQ sliding-window timeout does not apply to this shared Ethernet bus.
          </p>
        </div>
      </div>
    );
  }

  const active = Boolean(timerState?.active);
  const status = timerState?.status || 'IDLE';
  const duration = timerState?.duration || timeoutDuration || 14;
  const remainingTicks = typeof timerState?.remainingTicks === 'number'
    ? timerState.remainingTicks
    : (timerState?.deadlineTick != null ? Math.max(0, timerState.deadlineTick - currentTick) : 0);
  const deadlineTick = timerState?.deadlineTick;
  const frameSeq = timerState?.frameSeq;
  const attempt = timerState?.attempt || 1;
  const timers = timerState?.timers || [];
  const lastEvent = timerState?.lastEvent;
  const faultContext = timerState?.faultContext;

  // Percentage for progress countdown bar: 100% when full, 0% at deadline
  const progressPercent = duration > 0 ? Math.max(0, Math.min(100, (remainingTicks / duration) * 100)) : 0;

  // Dynamic status badge & theme class
  let statusBadgeClass = 'badge-secondary';
  let statusText = 'No active timeout timer';
  let themeClass = 'arq-timeout-idle';
  let progressBarClass = 'progress-bar-normal';

  if (active) {
    themeClass = 'arq-timeout-active';
    statusBadgeClass = 'badge-warning';
    statusText = 'Waiting for ACK';

    if (remainingTicks <= 3 && remainingTicks > 0) {
      progressBarClass = 'progress-bar-critical';
    } else if (progressPercent <= 50) {
      progressBarClass = 'progress-bar-warning';
    } else {
      progressBarClass = 'progress-bar-normal';
    }
  } else if (status === 'TIMEOUT' || lastEvent?.type === 'TIMEOUT') {
    themeClass = 'arq-timeout-expired';
    statusBadgeClass = 'badge-danger';
    statusText = 'Timeout Expired';
    progressBarClass = 'progress-bar-critical';
  } else if (status === 'ACK_RECEIVED' || lastEvent?.type === 'ACK_RECEIVED') {
    themeClass = 'arq-timeout-cancelled';
    statusBadgeClass = 'badge-success';
    statusText = 'ACK Received — Timer Stopped';
    progressBarClass = 'progress-bar-success';
  }

  // Derive human-readable event narration based strictly on verified simulator events
  let explanation = 'No active timeout timer. Waiting for upper-layer transmission.';
  if (active) {
    if (faultContext === 'DATA_CORRUPTED') {
      explanation = `Receiver detected and rejected a corrupted frame. Sender is waiting for ACK before deadline at t=${deadlineTick}.`;
    } else if (faultContext === 'DATA_DROPPED') {
      explanation = `The DATA frame was dropped in the channel before arrival. Sender timer is counting down to timeout at t=${deadlineTick}.`;
    } else if (faultContext === 'ACK_DROPPED') {
      explanation = `The receiver accepted DATA, but the reverse ACK was lost in transit! Sender timer will expire at t=${deadlineTick}.`;
    } else if (protocol === 'GBN') {
      explanation = `Go-Back-N timer running for oldest unacknowledged frame Sf = #${timerState?.base ?? frameSeq ?? 0}. Retransmits window on deadline.`;
    } else if (protocol === 'SR') {
      explanation = `Selective Repeat independent timer running for frame #${frameSeq ?? 0} (attempt #${attempt}).`;
    } else {
      explanation = `DATA #${frameSeq ?? 0} transmitted. Sender is waiting for acknowledgment before deadline at t=${deadlineTick}.`;
    }
  } else if (status === 'TIMEOUT' || lastEvent?.type === 'TIMEOUT') {
    if (protocol === 'GBN') {
      explanation = `TIMEOUT at t=${currentTick} — ACK not received! Go-Back-N is retransmitting all unacknowledged frames in window.`;
    } else if (protocol === 'SR') {
      explanation = `TIMEOUT at t=${currentTick} — ACK not received! Selective Repeat is retransmitting frame #${lastEvent?.seq ?? frameSeq ?? 0}.`;
    } else {
      explanation = `TIMEOUT at t=${currentTick} — ACK not received! Retransmitting DATA #${lastEvent?.seq ?? frameSeq ?? 0} (Attempt #${attempt}).`;
    }
  } else if (status === 'ACK_RECEIVED' || lastEvent?.type === 'ACK_RECEIVED') {
    explanation = `ACK successfully processed before timeout deadline. Associated retransmission timer cancelled.`;
  }

  return (
    <div className={`arq-timeout-panel ${themeClass} ${compact ? 'arq-timeout-compact' : ''}`}>
      {/* Header with Title and Status Badge */}
      <div className="timeout-header">
        <span className="timeout-title">
          <span className="timeout-icon">⏱️</span>
          <strong>ARQ Retransmission Countdown</strong>
        </span>
        <span className={`badge ${statusBadgeClass}`}>
          {statusText}
        </span>
      </div>

      {/* Main Countdown Display */}
      <div className="timeout-body">
        {active ? (
          <>
            <div className="timeout-stats-row">
              <div className="timeout-stat-block">
                <span className="timeout-stat-label">Outstanding Target</span>
                <span className="timeout-stat-val">
                  {protocol === 'GBN'
                    ? `Oldest Base: #${timerState?.base ?? frameSeq ?? 0}`
                    : `DATA #${frameSeq ?? 0}`}
                  {attempt > 1 && (
                    <span className="timeout-attempt-pill">Attempt #{attempt}</span>
                  )}
                </span>
              </div>

              <div className="timeout-stat-block" style={{ textAlign: 'center' }}>
                <span className="timeout-stat-label">Virtual Deadline</span>
                <span className="timeout-stat-val" style={{ fontFamily: 'var(--font-mono)' }}>
                  t = {deadlineTick} (now: {currentTick})
                </span>
              </div>

              <div className="timeout-stat-block" style={{ textAlign: 'right' }}>
                <span className="timeout-stat-label">Time Remaining</span>
                <span className="timeout-countdown-digits">
                  <strong>{remainingTicks}</strong>
                  <span className="timeout-unit"> / {duration} ticks</span>
                </span>
              </div>
            </div>

            {/* Visual Countdown Progress Bar */}
            <div className="timeout-progress-track" title={`${remainingTicks} ticks remaining out of ${duration}`}>
              <div
                className={`timeout-progress-fill ${progressBarClass}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Selective Repeat: Secondary Per-Frame Active Timers */}
            {protocol === 'SR' && timers.length > 1 && (
              <div className="sr-active-timers-list">
                <span className="sr-timers-label">Active Window Timers:</span>
                <div className="sr-timer-chips">
                  {timers.map((t) => (
                    <div key={t.frameSeq} className="sr-timer-chip">
                      <span className="chip-seq">Frame #{t.frameSeq}</span>
                      <span className="chip-countdown">{t.remainingTicks}t</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="timeout-idle-state">
            <span className="timeout-idle-msg">
              {status === 'TIMEOUT' || lastEvent?.type === 'TIMEOUT'
                ? `⚠️ Timeout expired at t=${currentTick}! Initiating ARQ recovery.`
                : status === 'ACK_RECEIVED' || lastEvent?.type === 'ACK_RECEIVED'
                ? `✅ Valid ACK received at t=${currentTick} — Timer stopped.`
                : `No active timeout timer (Sender is idle or transmission complete).`}
            </span>
          </div>
        )}

        {/* Explanatory Event-Driven Educational Note */}
        <div className="timeout-explanation-footer">
          <span className="explanation-prefix">💡 Context:</span>
          <span className="explanation-text">{explanation}</span>
        </div>
      </div>
    </div>
  );
}
