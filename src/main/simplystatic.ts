import { execFile } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Resolves the WP-CLI phar bundled inside the Local.app bundle.
 * Local ships wp-cli.phar at:
 *   /Applications/Local.app/Contents/Resources/extraResources/bin/wp-cli/wp-cli.phar
 */
export function findWpCli(): string {
  const wpCliPhar =
    '/Applications/Local.app/Contents/Resources/extraResources/bin/wp-cli/wp-cli.phar';
  if (!fs.existsSync(wpCliPhar)) {
    throw new Error(`WP-CLI phar not found at: ${wpCliPhar}`);
  }
  return wpCliPhar;
}

/** Local uses an architecture-specific subdirectory (e.g. darwin-arm64). */
const PHP_ARCH_SUBDIRS = ['darwin-arm64', 'darwin-x64', 'darwin'];

export function lightningServicesBase(): string {
  return path.join(
    process.env.HOME || '',
    'Library',
    'Application Support',
    'Local',
    'lightning-services',
  );
}

/** Returns the php binary inside a lightning-services directory, or null. */
function phpBinaryIn(baseDir: string, serviceDir: string): string | null {
  for (const arch of PHP_ARCH_SUBDIRS) {
    const candidate = path.join(baseDir, serviceDir, 'bin', arch, 'bin', 'php');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Compares Local's build suffix, so php-8.2.27+10 sorts above php-8.2.27+9.
 * Missing or non-numeric suffixes sort lowest.
 */
export function buildNumber(serviceDir: string): number {
  const suffix = serviceDir.split('+')[1];
  const parsed = Number.parseInt(suffix ?? '', 10);
  return Number.isNaN(parsed) ? -1 : parsed;
}

/**
 * Orders lightning-services directories newest first, comparing version
 * segments numerically.
 *
 * A default `.sort()` compares UTF-16 code units, which gets version strings
 * wrong the moment digit counts differ: "php-8.2.9" sorts above "php-8.2.29"
 * because '9' > '2'. That is the same mistake this module already made by
 * string-matching the version, so the fallback ordering is explicit too.
 */
export function compareServiceDirsNewestFirst(a: string, b: string): number {
  const segments = (dir: string): number[] =>
    (dir.split('+')[0].split('-')[1] ?? '')
      .split('.')
      .map((part) => {
        const n = Number.parseInt(part, 10);
        return Number.isNaN(n) ? -1 : n;
      });

  const left = segments(a);
  const right = segments(b);

  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (right[i] ?? -1) - (left[i] ?? -1);
    if (diff !== 0) return diff;
  }

  return buildNumber(b) - buildNumber(a);
}

/**
 * Picks the lightning-services directories serving a given PHP version,
 * newest build first.
 *
 * Matching is on the version segment alone because Local names directories
 * with a build suffix ("php-8.2.27+1") while reporting a bare version
 * ("8.2.27"), so an equality check against the reported string never matches.
 */
export function selectPhpServiceDirs(dirs: string[], phpVersion: string): string[] {
  return dirs
    .filter((entry) => entry.split('+')[0] === `php-${phpVersion}`)
    .sort((a, b) => buildNumber(b) - buildNumber(a));
}

/**
 * Resolves the PHP binary for a site's PHP version.
 *
 * Local reports a bare version (services.php.version is "8.2.27") but names
 * the directory with a build suffix ("php-8.2.27+1"), so joining the reported
 * version directly never matches. That miss was silent: the old code fell
 * through to "newest php-* directory", which on a machine with 8.2.27 and
 * 8.2.29 installed ran WP-CLI on 8.2.29 while the site itself ran 8.2.27.
 *
 * Directories for the requested version are matched on the version segment
 * alone and the highest build is preferred. Falling back to a different
 * version is still better than failing the deploy, but it is now reported
 * through onLog instead of happening invisibly.
 */
export function findPhp(phpVersion: string, onLog?: (msg: string) => void): string {
  const baseDir = lightningServicesBase();

  let entries: string[];
  try {
    entries = fs.readdirSync(baseDir);
  } catch {
    throw new Error(`Local lightning-services directory not found at: ${baseDir}`);
  }

  const phpDirs = entries.filter((entry) => entry.startsWith('php-'));
  const matching = selectPhpServiceDirs(phpDirs, phpVersion);

  for (const dir of matching) {
    const binary = phpBinaryIn(baseDir, dir);
    if (binary) return binary;
  }

  // Fall back to the newest available PHP, but say so — running WP-CLI on a
  // different PHP than the site is a real difference in behaviour.
  const fallbacks = [...phpDirs].sort(compareServiceDirsNewestFirst);
  for (const dir of fallbacks) {
    const binary = phpBinaryIn(baseDir, dir);
    if (binary) {
      onLog?.(
        `Warning: PHP ${phpVersion} not found in Local; using ${dir} instead. ` +
          'The deploy may behave differently from the running site.',
      );
      return binary;
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
    const php = findPhp(opts.phpVersion, opts.onLog);
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

