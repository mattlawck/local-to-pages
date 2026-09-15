import Store from 'electron-store';
import { SiteConfig } from '../shared/types';

const store = new Store<Record<string, SiteConfig>>({
  name: 'local-to-pages-config',
});

export function getConfig(siteId: string): SiteConfig {
  return store.get(siteId, {
    cfApiToken: '',
    cfAccountId: '',
    cfProjectName: '',
    staticOutputDir: '',
    exportPlugin: 'staatic',
  });
}

export function saveConfig(siteId: string, config: SiteConfig): void {
  store.set(siteId, config);
}
