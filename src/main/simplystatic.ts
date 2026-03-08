import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Resolves the WP-CLI phar bundled inside the Local.app bundle.
 * Local ships wp-cli.phar at:
 *   /Applications/Local.app/Contents/Resources/extraResources/bin/wp-cli/wp-cli.phar
 */
function findWpCli(): string {
  const wpCliPhar =
    '/Applications/Local.app/Contents/Resources/extraResources/bin/wp-cli/wp-cli.phar';
  if (!fs.existsSync(wpCliPhar)) {
    throw new Error(`WP-CLI phar not found at: ${wpCliPhar}`);
  }
  return wpCliPhar;
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

  // Local uses architecture-specific subdirectory (e.g. darwin-arm64)
  const archSubdirs = ['darwin-arm64', 'darwin-x64', 'darwin'];
  const phpVersionDir = path.join(localServicesBase, `php-${phpVersion}`, 'bin');

  for (const arch of archSubdirs) {
    const candidate = path.join(phpVersionDir, arch, 'bin', 'php');
    if (fs.existsSync(candidate)) return candidate;
  }

  // Fallback: find any php version
  const entries = fs.readdirSync(localServicesBase);
  const phpDirs = entries.filter((e) => e.startsWith('php-')).sort().reverse();
  for (const phpDir of phpDirs) {
    for (const arch of archSubdirs) {
      const candidate = path.join(localServicesBase, phpDir, 'bin', arch, 'bin', 'php');
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  throw new Error('PHP not found in Local lightning-services');
}

export interface WpCliOptions {
  siteId: string;
  siteWebRoot: string;
  phpVersion: string;
  onLog: (msg: string) => void;
}

/**
 * Returns the MySQL Unix socket path for a Local site.
 * Local places it at: ~/Library/Application Support/Local/run/<siteId>/mysql/mysqld.sock
 */
export function findMysqlSocket(siteId: string): string | null {
  const socketPath = path.join(
    process.env.HOME || '',
    'Library',
    'Application Support',
    'Local',
    'run',
    siteId,
    'mysql',
    'mysqld.sock',
  );
  return fs.existsSync(socketPath) ? socketPath : null;
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
    const socketPath = findMysqlSocket(opts.siteId);

    if (!socketPath) {
      return reject(
        new Error(
          `MySQL socket not found for site ${opts.siteId}. Make sure the site is running in Local.`,
        ),
      );
    }

    opts.onLog(`Running: php ${wpCli} ${args.join(' ')}`);

    execFile(
      php,
      [
        `-dmysqli.default_socket=${socketPath}`,
        `-dpdo_mysql.default_socket=${socketPath}`,
        wpCli,
        '--path=' + opts.siteWebRoot,
        '--allow-root', // Local's PHP process may run as root; this flag is required in that context
        ...args,
      ],
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

