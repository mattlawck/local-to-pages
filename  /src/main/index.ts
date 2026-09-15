import { ipcMain, IpcMainEvent } from 'electron';
import { IPC, SiteConfig } from '../shared/types';
import { getConfig, saveConfig } from './store';
import { runDeployPipeline } from './deploy';

// Local by Flywheel injects `localMain` as a global in the main process.
// We declare it loosely here to avoid needing the full type definition at build time.
declare const localMain: {
  getServiceContainer: () => {
    cradle: {
      siteData: {
        get: (id: string) => LocalSite;
      };
    };
  };
};

interface LocalSite {
  id: string;
  name: string;
  path: string;
  url: string;
  phpVersion: string;
  paths: {
    webRoot: string;
  };
  services?: {
    php?: { version: string };
  };
}

/**
 * Resolves the local URL for a site (e.g. http://mattlawck.local).
 * Local stores this on site.url.
 */
function resolveSiteUrl(site: LocalSite): string {
  if (site.url) {
    return site.url.startsWith('http') ? site.url : `http://${site.url}`;
  }
  return 'http://localhost';
}

/**
 * Fetches basic site info from WP options via REST API.
 */
async function fetchSiteInfo(
  siteUrl: string,
): Promise<{ title: string; description: string }> {
  try {
    const url = `${siteUrl.replace(/\/$/, '')}/wp-json/`;
    const response = await fetch(url);
    const data = (await response.json()) as { name?: string; description?: string };
    return {
      title: data.name || 'My Site',
      description: data.description || '',
    };
  } catch {
    return { title: 'My Site', description: '' };
  }
}

export default function bootstrap(): void {
  // Handle config retrieval
  ipcMain.on(IPC.GET_CONFIG, (event: IpcMainEvent, siteId: string) => {
    const config = getConfig(siteId);
    event.reply(IPC.CONFIG_DATA, { siteId, config });
  });

  // Handle config save
  ipcMain.on(
    IPC.SAVE_CONFIG,
    (_event: IpcMainEvent, payload: { siteId: string; config: SiteConfig }) => {
      saveConfig(payload.siteId, payload.config);
    },
  );

  // Handle deploy request
  ipcMain.on(
    IPC.START_DEPLOY,
    async (event: IpcMainEvent, siteId: string) => {
      const send = (channel: string, data: unknown) =>
        event.sender.send(channel, data);

      const onLog = (message: string) =>
        send(IPC.LOG, { siteId, message });

      const onStep = (step: string) =>
        send(IPC.STEP, { siteId, step });

      try {
        const config = getConfig(siteId);

        if (!config.cfApiToken || !config.cfAccountId || !config.cfProjectName) {
          send(IPC.ERROR, {
            siteId,
            error:
              'Missing Cloudflare configuration. Please fill in all fields in the Settings tab.',
          });
          return;
        }

        if (!config.staticOutputDir) {
          send(IPC.ERROR, {
            siteId,
            error:
              'Static output directory is not set. Configure it in Simply Static settings and add the path in the Settings tab.',
          });
          return;
        }

        const site = localMain
          .getServiceContainer()
          .cradle.siteData.get(siteId);

        const siteUrl = resolveSiteUrl(site);
        const { title, description } = await fetchSiteInfo(siteUrl);

        const phpVersion =
          site.services?.php?.version || site.phpVersion || '8.1';

        onStep('exporting');

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
    },
  );
}
