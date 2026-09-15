import * as React from 'react';
import { DeployStep, PreflightCheck } from '../shared/types';

interface Props {
  step: DeployStep;
  logs: string[];
  pagesUrl?: string;
  error?: string;
  onDeploy: () => void;
  siteNotRunning?: boolean;
  onCancelNotRunning?: () => void;
  preflight?: PreflightCheck[] | null;
  preflightRunning?: boolean;
  onRunPreflight?: () => void;
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
  preflight,
  preflightRunning,
  onRunPreflight,
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

      <PreflightSection
        checks={preflight}
        running={preflightRunning}
        onRun={onRunPreflight}
        disabled={isRunning}
      />

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

const STATUS_STYLE: Record<PreflightCheck['status'], { icon: string; color: string }> = {
  ok: { icon: '✓', color: '#38a169' },
  warn: { icon: '!', color: '#b7791f' },
  fail: { icon: '✕', color: '#e53e3e' },
};

/**
 * Environment checks, shown above the deploy button.
 *
 * This pipeline runs infrequently while Local, WordPress and Staatic keep
 * moving, so a deploy is usually the first run after an unknown number of
 * upstream changes. Surfacing what broke — and what to do — beats discovering
 * it from a stack trace partway through a publish.
 */
const PreflightSection: React.FC<{
  checks?: PreflightCheck[] | null;
  running?: boolean;
  onRun?: () => void;
  disabled?: boolean;
}> = ({ checks, running, onRun, disabled }) => {
  if (!onRun) return null;

  const failures = checks?.filter((c) => c.status === 'fail').length ?? 0;
  const warnings = checks?.filter((c) => c.status === 'warn').length ?? 0;

  let summary: React.ReactNode = null;
  if (checks) {
    if (failures > 0) {
      summary = <span style={{ color: '#e53e3e' }}>{failures} blocking issue{failures > 1 ? 's' : ''}</span>;
    } else if (warnings > 0) {
      summary = <span style={{ color: '#b7791f' }}>Ready, with {warnings} warning{warnings > 1 ? 's' : ''}</span>;
    } else {
      summary = <span style={{ color: '#38a169' }}>All checks passed</span>;
    }
  }

  return (
    <div style={{ marginBottom: 16, border: '1px solid #e0e0e0', borderRadius: 4, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={onRun}
          disabled={running || disabled}
          style={{
            padding: '5px 12px',
            fontSize: 12,
            cursor: running || disabled ? 'default' : 'pointer',
            border: '1px solid #c8c8c8',
            borderRadius: 3,
            background: '#fafafa',
            opacity: running || disabled ? 0.6 : 1,
          }}
        >
          {running ? 'Checking…' : 'Check environment'}
        </button>
        <span style={{ fontSize: 12 }}>{summary}</span>
      </div>

      {checks && (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, fontSize: 12 }}>
          {checks.map((check) => {
            const tone = STATUS_STYLE[check.status];
            return (
              <li key={check.name} style={{ marginBottom: 6, lineHeight: 1.45 }}>
                <span style={{ color: tone.color, fontWeight: 700, marginRight: 6 }}>{tone.icon}</span>
                <strong>{check.name}</strong>
                <div style={{ marginLeft: 18, color: '#555', wordBreak: 'break-all' }}>{check.detail}</div>
                {check.remedy && (
                  <div style={{ marginLeft: 18, color: tone.color }}>{check.remedy}</div>
                )}
              </li>
            );
          })}
        </ul>
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
