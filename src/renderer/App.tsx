import * as React from 'react';
import { IPC, SiteConfig, DeployStep, DeployState } from '../shared/types';
import { ConfigPanel } from './ConfigPanel';
import { DeployPanel } from './DeployPanel';

type Tab = 'deploy' | 'settings';

interface IpcRenderer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(channel: string, listener: (event: any, ...args: any[]) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeListener(channel: string, listener: (...args: any[]) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(channel: string, ...args: any[]): void;
}

interface Props {
  siteId: string;
  ipcRenderer: IpcRenderer;
}

export const App: React.FC<Props> = ({ siteId, ipcRenderer }) => {
  const [tab, setTab] = React.useState<Tab>('deploy');
  const [config, setConfig] = React.useState<SiteConfig>({
    cfApiToken: '',
    cfAccountId: '',
    cfProjectName: '',
    publicUrl: '',
    staticOutputDir: '',
    customRedirects: '',
  });

  const [deployState, setDeployState] = React.useState<DeployState>({
    step: 'idle',
    logs: [],
  });
  const [siteNotRunning, setSiteNotRunning] = React.useState(false);

  React.useEffect(() => {
    ipcRenderer.send(IPC.GET_CONFIG, siteId);

    const onConfig = (_: unknown, payload: { siteId: string; config: SiteConfig }) => {
      if (payload.siteId === siteId) setConfig(payload.config);
    };
    const onLog = (_: unknown, payload: { siteId: string; message: string }) => {
      if (payload.siteId !== siteId) return;
      setDeployState((prev) => ({ ...prev, logs: [...prev.logs, payload.message] }));
    };
    const onStep = (_: unknown, payload: { siteId: string; step: DeployStep }) => {
      if (payload.siteId !== siteId) return;
      setDeployState((prev) => ({ ...prev, step: payload.step }));
    };
    const onDone = (_: unknown, payload: { siteId: string; pagesUrl: string }) => {
      if (payload.siteId !== siteId) return;
      setDeployState((prev) => ({ ...prev, step: 'done', pagesUrl: payload.pagesUrl }));
    };
    const onError = (_: unknown, payload: { siteId: string; error: string }) => {
      if (payload.siteId !== siteId) return;
      setDeployState((prev) => ({ ...prev, step: 'error', error: payload.error }));
    };
    const onSiteNotRunning = (_: unknown, payload: { siteId: string }) => {
      if (payload.siteId !== siteId) return;
      setSiteNotRunning(true);
      setDeployState((prev) => ({ ...prev, step: 'idle' }));
    };

    ipcRenderer.on(IPC.CONFIG_DATA, onConfig);
    ipcRenderer.on(IPC.LOG, onLog);
    ipcRenderer.on(IPC.STEP, onStep);
    ipcRenderer.on(IPC.DONE, onDone);
    ipcRenderer.on(IPC.ERROR, onError);
    ipcRenderer.on(IPC.SITE_NOT_RUNNING, onSiteNotRunning);

    return () => {
      ipcRenderer.removeListener(IPC.CONFIG_DATA, onConfig);
      ipcRenderer.removeListener(IPC.LOG, onLog);
      ipcRenderer.removeListener(IPC.STEP, onStep);
      ipcRenderer.removeListener(IPC.DONE, onDone);
      ipcRenderer.removeListener(IPC.ERROR, onError);
      ipcRenderer.removeListener(IPC.SITE_NOT_RUNNING, onSiteNotRunning);
    };
  }, [siteId, ipcRenderer]);

  const handleSaveConfig = (updated: SiteConfig) => {
    setConfig(updated);
    ipcRenderer.send(IPC.SAVE_CONFIG, { siteId, config: updated });
  };

  const handleDeploy = () => {
    setSiteNotRunning(false);
    setDeployState({ step: 'exporting', logs: [] });
    ipcRenderer.send(IPC.START_DEPLOY, siteId);
  };

  const handleCancelNotRunning = () => {
    setSiteNotRunning(false);
    setDeployState((prev) => ({ ...prev, step: 'idle' }));
  };

  return (
    <div style={styles.root}>
      <div style={styles.tabBar}>
        <TabButton label="Deploy" active={tab === 'deploy'} onClick={() => setTab('deploy')} />
        <TabButton label="Settings" active={tab === 'settings'} onClick={() => setTab('settings')} />
      </div>
      <div style={styles.content}>
        {tab === 'deploy' ? (
          <DeployPanel
            siteId={siteId}
            step={deployState.step}
            logs={deployState.logs}
            pagesUrl={deployState.pagesUrl}
            error={deployState.error}
            onDeploy={handleDeploy}
            siteNotRunning={siteNotRunning}
            onCancelNotRunning={handleCancelNotRunning}
          />
        ) : (
          <ConfigPanel siteId={siteId} config={config} onSave={handleSaveConfig} />
        )}
      </div>
    </div>
  );
};

const TabButton: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({
  label, active, onClick,
}) => (
  <button
    onClick={onClick}
    style={{
      ...styles.tab,
      borderBottom: active ? '2px solid #51bb7b' : '2px solid transparent',
      color: active ? '#51bb7b' : '#666',
      fontWeight: active ? 600 : 400,
    }}
  >
    {label}
  </button>
);

const styles: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #e0e0e0',
    padding: '0 12px',
  },
  tab: {
    padding: '10px 16px',
    background: 'none',
    border: 'none',
    fontSize: '13px',
    cursor: 'pointer',
    marginRight: '4px',
  },
  content: { flex: 1, overflowY: 'auto' },
};
