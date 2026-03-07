import Store from 'electron-store';
import { app, safeStorage } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { SiteConfig } from '../shared/types';

/**
 * Returns the AES-256 encryption key for the config store.
 *
 * On first run: generates a random 32-byte key, encrypts it using the macOS
 * Keychain via Electron's safeStorage API, and saves the encrypted blob to disk.
 *
 * On subsequent runs: loads the encrypted blob and decrypts it via the Keychain.
 *
 * This means the config file is encrypted at rest, and the encryption key is
 * protected by the user's macOS login credentials.
 */
function getEncryptionKey(): string {
  const keyPath = path.join(app.getPath('userData'), 'local-to-pages.key');

  if (fs.existsSync(keyPath)) {
    const encryptedKey = fs.readFileSync(keyPath);
    return safeStorage.decryptString(encryptedKey);
  }

  const newKey = crypto.randomBytes(32).toString('hex');
  const encryptedKey = safeStorage.encryptString(newKey);
  fs.writeFileSync(keyPath, encryptedKey);
  return newKey;
}

function createStore(): Store<Record<string, SiteConfig>> {
  // safeStorage requires the app to be ready and available
  if (safeStorage.isEncryptionAvailable()) {
    return new Store<Record<string, SiteConfig>>({
      name: 'local-to-pages-config',
      encryptionKey: getEncryptionKey(),
    });
  }

  // Fallback: unencrypted store if safeStorage is unavailable
  // (shouldn't happen on macOS but handles edge cases gracefully)
  return new Store<Record<string, SiteConfig>>({
    name: 'local-to-pages-config',
  });
}

const store = createStore();

export function getConfig(siteId: string): SiteConfig {
  return store.get(siteId, {
    cfApiToken: '',
    cfAccountId: '',
    cfProjectName: '',
    publicUrl: '',
    staticOutputDir: '',
    customRedirects: '',
  });
}

export function saveConfig(siteId: string, config: SiteConfig): void {
  store.set(siteId, config);
}
