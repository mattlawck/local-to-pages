import * as React from 'react';
import { DeployStep } from '../shared/types';

interface Props {
  siteId: string;
  step: DeployStep;
  logs: string[];
  pagesUrl?: string;
  error?: string;
  onDeploy: () => void;
  siteNotRunning?: boolean;
  onCancelNotRunning?: () => void;
}

const STEPS: Array<{ key: DeployStep; label: string }> = [
  { key: 'exporting', label: 'Export static site' },
  { key: 'generating-llms', label: 'Generate llms.txt + llms-full.txt' },
  { key: 'deploying', label: 'Deploy to Cloudflare Pages' },
  { key: 'done', label: 'Complete' },
];

function stepIndex(step: DeployStep): number {
  return STEPS.findIndex((s) => s.key === step);
}

export const DeployPanel: React.FC<Props> = ({
  step,
  logs,
  pagesUrl,
  error,
  onDeploy,
  siteNotRunning,
  onCancelNotRunning,
}) => {
  const logRef = React.useRef<HTMLDivElement>(null);
  const isRunning =
    step === 'exporting' || step === 'generating-llms' || step === 'deploying';
  const currentIdx = stepIndex(step);

  React.useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  let deployLabel = 'Deploy';
  if (isRunning) deployLabel = 'Deploying...';
  else if (step === 'done') deployLabel = 'Deploy Again';

  return (
    <div style={styles.container}>
      <h3 style={styles.heading}>Deploy to Cloudflare Pages</h3>

      {/* Step indicators */}
      <div style={styles.steps}>
        {STEPS.map((s, i) => {
          const isDone =
            step === 'done' || (currentIdx > i && step !== 'error');
          const isActive = s.key === step;
          const isError = step === 'error' && isActive;

          let dotBackground = '#d0d0d0';
          if (isError) dotBackground = '#e53e3e';
          else if (isDone) dotBackground = '#38a169';
          else if (isActive) dotBackground = '#51bb7b';

          let dotLabel: React.ReactNode = i + 1;
          if (isDone) dotLabel = '✓';
          else if (isActive && !isError) dotLabel = '…';

          return (
            <div key={s.key} style={styles.stepRow}>
              <div style={{ ...styles.stepDot, background: dotBackground }}>
                {dotLabel}
              </div>
              <span
                style={{
                  ...styles.stepLabel,
                  color: isDone || isActive ? '#1d1d1d' : '#aaa',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Site not running prompt */}
      {siteNotRunning && !isRunning && (
        <div style={styles.warningBox}>
          <div style={styles.warningText}>Your Local site is not running. Start it in Local, then click Retry.</div>
          <div style={styles.warningActions}>
            <button style={styles.startButton} onClick={onDeploy}>
              Retry
            </button>
            <button style={styles.cancelButton} onClick={onCancelNotRunning}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Deploy button */}
      {!siteNotRunning && (
        <button
          onClick={onDeploy}
          disabled={isRunning}
          style={{
            ...styles.deployButton,
            opacity: isRunning ? 0.6 : 1,
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          {deployLabel}
        </button>
      )}

      {/* Success URL */}
      {pagesUrl && step === 'done' && (
        <div style={styles.successBox}>
          <span style={styles.successLabel}>Live at:</span>{' '}
          <a
            href={pagesUrl}
            target="_blank"
            rel="noreferrer"
            style={styles.link}
          >
            {pagesUrl}
          </a>
        </div>
      )}

      {/* Error */}
      {error && step === 'error' && (
        <div style={styles.errorBox}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Log output */}
      {logs.length > 0 && (
        <div ref={logRef} style={styles.logBox}>
          {logs.map((line, i) => (
            <div key={`${i}:${line}`} style={styles.logLine}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    maxWidth: '700px',
  },
  heading: {
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '20px',
    color: '#1d1d1d',
  },
  steps: {
    marginBottom: '24px',
  },
  stepRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '10px',
    gap: '10px',
  },
  stepDot: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  stepLabel: {
    fontSize: '13px',
  },
  deployButton: {
    padding: '10px 28px',
    background: '#51bb7b',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 700,
    marginBottom: '16px',
  },
  successBox: {
    padding: '10px 14px',
    background: '#f0fff4',
    border: '1px solid #38a169',
    borderRadius: '4px',
    fontSize: '13px',
    marginBottom: '16px',
  },
  successLabel: {
    color: '#38a169',
    fontWeight: 600,
  },
  link: {
    color: '#51bb7b',
    textDecoration: 'none',
  },
  errorBox: {
    padding: '10px 14px',
    background: '#fff5f5',
    border: '1px solid #e53e3e',
    borderRadius: '4px',
    fontSize: '13px',
    color: '#e53e3e',
    marginBottom: '16px',
  },
  logBox: {
    background: '#1a1a1a',
    borderRadius: '4px',
    padding: '12px',
    maxHeight: '280px',
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: '11px',
    lineHeight: '1.6',
  },
  logLine: {
    color: '#d0d0d0',
    wordBreak: 'break-all',
  },
  warningBox: {
    padding: '12px 14px',
    background: '#fffbeb',
    border: '1px solid #d97706',
    borderRadius: '4px',
    fontSize: '13px',
    marginBottom: '16px',
  },
  warningText: {
    color: '#92400e',
    marginBottom: '10px',
  },
  warningActions: {
    display: 'flex',
    gap: '8px',
  },
  startButton: {
    padding: '8px 16px',
    background: '#51bb7b',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  cancelButton: {
    padding: '8px 16px',
    background: 'none',
    color: '#5d5e5e',
    border: '1px solid #e7e7e7',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
  },
};
