import { ipcMain } from 'electron';
import * as LocalMain from '@getflywheel/local/main';
import { IPC, SiteConfig } from '../shared/types';
import { getConfig, saveConfig } from './store';
import { runDeployPipeline } from './deploy';
import { findMysqlSocket } from './simplystatic';

async function fetchSiteInfo(siteUrl: string): Promise<{ title: string; description: string }> {
  try {
    const response = await fetch(`${siteUrl.replace(/\/$/, '')}/wp-json/`);
    const data = (await response.json()) as { name?: string; description?: string };
    return { title: data.name || 'My Site', description: data.description || '' };
  } catch {
    return { title: 'My Site', description: '' };
  }
}

async function executeDeploy(event: Electron.IpcMainEvent, siteId: string): Promise<void> {
  const send = (channel: string, data: unknown) => event.sender.send(channel, data);
  const onLog = (message: string) => send(IPC.LOG, { siteId, message });
  const onStep = (step: string) => send(IPC.STEP, { siteId, step });

  try {
    const config = getConfig(siteId);

    if (!config.cfApiToken || !config.cfAccountId || !config.cfProjectName) {
      send(IPC.ERROR, { siteId, error: 'Missing Cloudflare configuration. Fill in all fields in the Settings tab.' });
      return;
    }

    if (!config.staticOutputDir) {
      send(IPC.ERROR, { siteId, error: 'Static output directory is not set. Configure it in the Settings tab.' });
      return;
    }

    const serviceContainer = LocalMain.getServiceContainer().cradle;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const site = (serviceContainer as any).siteData.getSite(siteId);
    const siteUrl = site.url?.startsWith('http') ? site.url : `http://${site.url || 'localhost'}`;
    const { title, description } = await fetchSiteInfo(siteUrl);
    const phpVersion = site.services?.php?.version || site.phpVersion || '8.1';

    const pagesUrl = await runDeployPipeline({
      siteId,
      siteWebRoot: site.paths.webRoot,
      siteUrl,
      siteTitle: title,
      siteDescription: description,
      phpVersion,
      config,
      onLog,
      onStep,
    });

    onStep('done');
    send(IPC.DONE, { siteId, pagesUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    onLog(`Error: ${message}`);
    onStep('error');
    send(IPC.ERROR, { siteId, error: message });
  }
}

export default function(): void {
  ipcMain.on(IPC.GET_CONFIG, (event: Electron.IpcMainEvent, siteId: string) => {
    const config = getConfig(siteId);
    event.reply(IPC.CONFIG_DATA, { siteId, config });
  });

  ipcMain.on(
    IPC.SAVE_CONFIG,
    (_event: Electron.IpcMainEvent, payload: { siteId: string; config: SiteConfig }) => {
      saveConfig(payload.siteId, payload.config);
    },
  );

  ipcMain.on(IPC.START_DEPLOY, async (event: Electron.IpcMainEvent, siteId: string) => {
    const send = (channel: string, data: unknown) => event.sender.send(channel, data);

    if (!findMysqlSocket(siteId)) {
      send(IPC.SITE_NOT_RUNNING, { siteId });
      return;
    }

    await executeDeploy(event, siteId);
  });

}
