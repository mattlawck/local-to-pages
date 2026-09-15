import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Resolves the WP-CLI binary bundled with Local by Flywheel.
 * Local stores its services under ~/Library/Application Support/Local/lightning-services/
 * We find the latest wp-cli version available.
 */
function findWpCli(): string {
  const localServicesBase = path.join(
    process.env.HOME || '',
    'Library',
    'Application Support',
    'Local',
    'lightning-services',
  );

  if (!fs.existsSync(localServicesBase)) {
    throw new Error(
      `Local services directory not found at: ${localServicesBase}`,
    );
  }

  const entries = fs.readdirSync(localServicesBase);
  const wpCliDir = entries
    .filter((e) => e.startsWith('wp-cli-'))
    .sort()
    .reverse()[0];

  if (!wpCliDir) {
    throw new Error('WP-CLI not found in Local lightning-services');
  }

  // Local bundles WP-CLI as a PHP phar — the wrapper script lives here
  const wpCli = path.join(localServicesBase, wpCliDir, 'bin', 'wp-cli.phar');
  if (!fs.existsSync(wpCli)) {
    throw new Error(`WP-CLI phar not found at: ${wpCli}`);
  }

  return wpCli;
}

/**
 * Finds the PHP binary for a given site's PHP version.
 */
function findPhp(phpVersion: string): string {
  const localServicesBase = path.join(
    process.env.HOME || '',
    'Library',
    'Application Support',
    'Local',
    'lightning-services',
  );

  const phpDir = path.join(
    localServicesBase,
    `php-${phpVersion}`,
    'bin',
    'darwin',
    'bin',
    'php',
  );

  if (!fs.existsSync(phpDir)) {
    // Fallback: find any php binary
    const entries = fs.readdirSync(localServicesBase);
    const anyPhp = entries
      .filter((e) => e.startsWith('php-'))
      .sort()
      .reverse()[0];
    if (!anyPhp) throw new Error('PHP not found in Local lightning-services');
    return path.join(
      localServicesBase,
      anyPhp,
      'bin',
      'darwin',
      'bin',
      'php',
    );
  }

  return phpDir;
}

export interface WpCliOptions {
  siteWebRoot: string;
  phpVersion: string;
  onLog: (msg: string) => void;
}

/**
 * Runs a WP-CLI command in the context of the Local site.
 */
export function runWpCli(
  args: string[],
  opts: WpCliOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const php = findPhp(opts.phpVersion);
    const wpCli = findWpCli();

    opts.onLog(`Running: php ${wpCli} ${args.join(' ')}`);

    execFile(
      php,
      [wpCli, '--path=' + opts.siteWebRoot, '--allow-root', ...args],
      { cwd: opts.siteWebRoot, env: { ...process.env } },
      (err, stdout, stderr) => {
        if (stdout) opts.onLog(stdout.trim());
        if (stderr) opts.onLog(stderr.trim());
        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve(stdout.trim());
        }
      },
    );
  });
}

/**
 * Triggers a full Simply Static export via WP-CLI.
 * Simply Static must be installed and configured in WordPress.
 */
export async function runSimplyStaticExport(
  opts: WpCliOptions,
): Promise<void> {
  opts.onLog('Starting Simply Static export...');

  // Simply Static Pro exposes WP-CLI commands under `simply-static`
  await runWpCli(['simply-static', 'run'], opts);

  opts.onLog('Simply Static export complete.');
}
