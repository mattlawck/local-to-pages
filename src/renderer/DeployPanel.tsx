import * as React from 'react';
import { DeployStep } from '../shared/types';

interface Props {
  siteId: string;
  step: DeployStep;
  logs: string[];
  pagesUrl?: string;
  error?: string;
  onDeploy: () => void;
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

          return (
            <div key={s.key} style={styles.stepRow}>
              <div
                style={{
                  ...styles.stepDot,
                  background: isError
                    ? '#e53e3e'
                    : isDone
                    ? '#38a169'
                    : isActive
                    ? '#7b61ff'
                    : '#d0d0d0',
                }}
              >
                {isDone ? '✓' : isActive && !isError ? '…' : i + 1}
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

      {/* Deploy button */}
      <button
        onClick={onDeploy}
        disabled={isRunning}
        style={{
          ...styles.deployButton,
          opacity: isRunning ? 0.6 : 1,
          cursor: isRunning ? 'not-allowed' : 'pointer',
        }}
      >
        {isRunning ? 'Deploying...' : step === 'done' ? 'Deploy Again' : 'Deploy'}
      </button>

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
            <div key={i} style={styles.logLine}>
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
    background: '#7b61ff',
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
    color: '#7b61ff',
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
};
