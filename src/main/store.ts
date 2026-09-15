import Store from 'electron-store';
import { app, safeStorage } from 'electron';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SiteConfig } from '../shared/types';

const STORE_NAME = 'local-to-pages-config';
const KEY_FILE = 'local-to-pages.key';

const EMPTY_CONFIG: SiteConfig = {
  cfApiToken: '',
  cfAccountId: '',
  cfProjectName: '',
  publicUrl: '',
  staticOutputDir: '',
  customRedirects: '',
};

/** How the config store ended up in its current state, for surfacing in the UI. */
export type StoreStatus =
  | { kind: 'ok' }
  | { kind: 'reset'; backupPath: string; reason: string }
  | { kind: 'unencrypted'; reason: string };

let storeStatus: StoreStatus = { kind: 'ok' };

export function getStoreStatus(): StoreStatus {
  return storeStatus;
}

function keyFilePath(): string {
  return path.join(app.getPath('userData'), KEY_FILE);
}

function configFilePath(): string {
  return path.join(app.getPath('userData'), `${STORE_NAME}.json`);
}

/**
 * Returns the AES-256 key for the config store, or null only when the Keychain
 * itself cannot serve us at all.
 *
 * If an existing key blob will not decrypt — which happens when it was sealed
 * by a differently-signed build of Local — it is preserved alongside and a
 * fresh key is minted. Returning null in that case would be actively harmful:
 * the caller would fall back to an unencrypted store and write the Cloudflare
 * API token to disk in plaintext.
 */
function loadEncryptionKey(): string | null {
  const keyPath = keyFilePath();

  if (fs.existsSync(keyPath)) {
    try {
      return safeStorage.decryptString(fs.readFileSync(keyPath));
    } catch {
      // Unusable blob. Keep it (a future OS/Keychain state might read it) but
      // move it aside so a working key can take its place.
      try {
        fs.renameSync(keyPath, `${keyPath}.${Date.now()}.bak`);
      } catch {
        // If it cannot be moved it will simply be overwritten below.
      }
    }
  }

  try {
    const newKey = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyPath, safeStorage.encryptString(newKey), { mode: 0o600 });
    return newKey;
  } catch {
    return null;
  }
}

/**
 * True when a config file exists and holds more than an empty object, i.e. it
 * has real content that should have deserialized into settings.
 */
function hasStoredContent(): boolean {
  try {
    return fs.statSync(configFilePath()).size > 2;
  } catch {
    return false;
  }
}

/** Moves an unreadable config aside instead of letting it be read or overwritten keyless. */
function setAsideConfig(reason: string): void {
  const configPath = configFilePath();
  if (!fs.existsSync(configPath)) return;

  const backupPath = `${configPath}.${Date.now()}.bak`;
  try {
    fs.renameSync(configPath, backupPath);
    storeStatus = { kind: 'reset', backupPath, reason };
  } catch {
    // Nothing further to try; start empty rather than blocking the add-on.
  }
}

function buildStore(): Store<Record<string, SiteConfig>> {
  const baseOptions = { name: STORE_NAME, clearInvalidConfig: true };
  const encryptionKey = safeStorage.isEncryptionAvailable() ? loadEncryptionKey() : null;

  if (encryptionKey) {
    let opened: Store<Record<string, SiteConfig>>;
    try {
      opened = new Store<Record<string, SiteConfig>>({ ...baseOptions, encryptionKey });
    } catch {
      // Key is usable but the payload still will not decrypt — preserve and reset.
      setAsideConfig('Saved settings could not be decrypted and were reset.');
      return new Store<Record<string, SiteConfig>>({ ...baseOptions, encryptionKey });
    }

    // `clearInvalidConfig` turns an unreadable config into an empty one without
    // throwing, so the failure is otherwise invisible and the stale file is left
    // on disk. A file with real content that deserialized to nothing did not
    // decrypt — set it aside so it cannot linger, which matters especially when
    // the stale file is unencrypted and holds an API token.
    if (opened.size === 0 && hasStoredContent()) {
      setAsideConfig('Saved settings could not be decrypted and were reset.');
      return new Store<Record<string, SiteConfig>>({ ...baseOptions, encryptionKey });
    }

    return opened;
  }

  // No key at all: the Keychain is unavailable, not merely holding a stale blob.
  // An existing config is encrypted, so an unencrypted store must never be
  // pointed at it — that is what previously fed ciphertext to JSON.parse.
  if (fs.existsSync(configFilePath())) {
    setAsideConfig(
      'The macOS Keychain was unavailable, so saved settings could not be read and were reset.',
    );
  }

  // This store cannot encrypt, so the Cloudflare API token would rest on disk in
  // plaintext. Record it so the UI can say so rather than failing silently.
  storeStatus = {
    kind: 'unencrypted',
    reason:
      'The macOS Keychain is unavailable, so settings are stored unencrypted. Your Cloudflare API token is written to disk in plaintext.',
  };

  return new Store<Record<string, SiteConfig>>(baseOptions);
}

/**
 * The store is created lazily, on first read or write — never at module scope.
 *
 * Local imports an add-on's main.js early in startup, and `safeStorage` is not
 * dependable until Electron has emitted `ready`. Building the store at import
 * time raced that: when `safeStorage.isEncryptionAvailable()` came back false,
 * the old code fell back to an *unencrypted* store aimed at the same file, fed
 * the AES ciphertext straight to JSON.parse, and threw
 *
 *   SyntaxError: Unexpected token 'K', "K\xfc@\xd5\x1c0\xb5f\xf55"... is not valid JSON
 *
 * out of module load — which Local reports as "Error Loading Add-on" and the
 * add-on never activates. (The giveaway that no decryption was attempted: the
 * bytes in that message are the config file's own first bytes, not garbled
 * plaintext.)
 *
 * Deferring construction to first use means every access happens well after
 * `ready`, so safeStorage answers correctly and the existing config decrypts
 * normally instead of being needlessly reset.
 */
let store: Store<Record<string, SiteConfig>> | null = null;

function getStore(): Store<Record<string, SiteConfig>> {
  store ??= buildStore();
  return store;
}

export function getConfig(siteId: string): SiteConfig {
  try {
    return getStore().get(siteId, EMPTY_CONFIG);
  } catch {
    // Never let a config read take down the caller.
    return { ...EMPTY_CONFIG };
  }
}

export function saveConfig(siteId: string, config: SiteConfig): void {
  getStore().set(siteId, config);
  restrictConfigPermissions();
}

/**
 * Restricts the config file to owner-only access.
 *
 * conf creates it with the process umask, which left it world-readable
 * (rw-rw-rw-). That matters because the file holds a Cloudflare API token —
 * and matters most in the degraded case where it could not be encrypted.
 */
function restrictConfigPermissions(): void {
  try {
    fs.chmodSync(configFilePath(), 0o600);
  } catch {
    // Best effort; never block a save over file permissions.
  }
}
