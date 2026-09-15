import * as fs from 'node:fs';
import * as path from 'node:path';
import { PreflightCheck, PreflightStatus, SiteConfig } from '../shared/types';
import { findWpCli, findPhp, findMysqlSocket, lightningServicesBase, selectPhpServiceDirs } from './simplystatic';

/**
 * Preflight verifies every external contract the deploy depends on, before the
 * deploy starts.
 *
 * This pipeline runs rarely while Local, WordPress, Staatic and Cloudflare all
 * move continuously, so in practice every deploy is the first one after an
 * unknown number of upstream changes. Without this, a changed path or a
 * deactivated plugin surfaces as a stack trace partway through a publish. Each
 * check below corresponds to something that has to be true, states what it
 * found, and says what to do when it is not.
 *
 * Checks deliberately reuse the real resolvers (findWpCli, findPhp,
 * findMysqlSocket) rather than re-deriving paths, so preflight cannot drift
 * into passing while the deploy fails on a different path.
 */

export interface PreflightContext {
  siteId: string;
  siteUrl: string;
  phpVersion: string;
  config: SiteConfig;
}

function ok(name: string, detail: string): PreflightCheck {
  return { name, status: 'ok', detail };
}

function warn(name: string, detail: string, remedy?: string): PreflightCheck {
  return { name, status: 'warn', detail, remedy };
}

function fail(name: string, detail: string, remedy?: string): PreflightCheck {
  return { name, status: 'fail', detail, remedy };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Local's WP-CLI lives at a fixed path inside the app bundle. */
function checkWpCli(): PreflightCheck {
  try {
    return ok('WP-CLI', findWpCli());
  } catch (error) {
    return fail('WP-CLI', messageOf(error), 'Reinstall or update Local — the bundled wp-cli.phar has moved or is missing.');
  }
}

/**
 * Reports which PHP the deploy will actually use, and whether it matches the
 * site. A mismatch is a warning rather than a failure: the deploy still runs,
 * but on a different PHP than the site, which can produce failures that
 * reproduce nowhere else.
 */
function checkPhp(phpVersion: string): PreflightCheck {
  let binary: string;
  try {
    binary = findPhp(phpVersion);
  } catch (error) {
    return fail('PHP', messageOf(error), `Install PHP ${phpVersion} for this site in Local.`);
  }

  let installed: string[] = [];
  try {
    installed = fs.readdirSync(lightningServicesBase()).filter((entry) => entry.startsWith('php-'));
  } catch {
    // Directory listing is only used to explain a mismatch; the binary resolved.
  }

  const exact = selectPhpServiceDirs(installed, phpVersion);
  if (exact.length > 0) {
    return ok('PHP', `${phpVersion} (${exact[0]})`);
  }

  return warn(
    'PHP',
    `Site expects ${phpVersion}, which is not installed. Falling back to ${path.basename(path.dirname(path.dirname(path.dirname(binary))))}.`,
    `Install PHP ${phpVersion} in Local so the deploy runs on the same version as the site.`,
  );
}

/** The add-on shells out through the site's MySQL socket, which exists only while it runs. */
function checkSiteRunning(siteId: string): PreflightCheck {
  const socket = findMysqlSocket(siteId);
  return socket
    ? ok('Site running', socket)
    : fail('Site running', 'MySQL socket not found.', 'Start this site in Local before deploying.');
}

/** Staatic performs the static export; without it there is nothing to deploy. */
async function checkStaatic(siteWebRoot: string): Promise<PreflightCheck> {
  const pluginDir = path.join(siteWebRoot, 'wp-content', 'plugins', 'staatic');
  if (!fs.existsSync(pluginDir)) {
    return fail(
      'Staatic plugin',
      'Not found in wp-content/plugins.',
      'Install the free Staatic plugin in WordPress and configure a Local Directory deployment.',
    );
  }
  return ok('Staatic plugin', pluginDir);
}

/** The companion plugin supplies identity data for schema and llms.txt generation. */
async function checkCompanionPlugin(siteUrl: string): Promise<PreflightCheck> {
  const endpoint = `${siteUrl.replace(/\/$/, '')}/wp-json/local-to-pages/v1/settings`;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      return warn(
        'Companion plugin',
        `REST endpoint returned ${response.status}.`,
        'Activate the Local to Pages plugin in WordPress. Without it, Person schema and identity fields are skipped.',
      );
    }
    return ok('Companion plugin', endpoint);
  } catch (error) {
    return warn('Companion plugin', messageOf(error), 'Confirm the site is running and the plugin is active.');
  }
}

/** The WP REST API supplies all page and post content for sitemap and llms.txt. */
async function checkWpRest(siteUrl: string): Promise<PreflightCheck> {
  const endpoint = `${siteUrl.replace(/\/$/, '')}/wp-json/`;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      return fail('WordPress REST API', `Returned ${response.status}.`, 'The REST API must be reachable to generate sitemap.xml and llms.txt.');
    }
    return ok('WordPress REST API', endpoint);
  } catch (error) {
    return fail('WordPress REST API', messageOf(error), 'Start the site and confirm its URL in Local.');
  }
}

/** The output directory is both read and written, so writability matters, not just existence. */
function checkOutputDir(outputDir: string): PreflightCheck {
  if (!outputDir) {
    return fail('Output directory', 'Not configured.', 'Set the static output directory in the Settings tab.');
  }
  if (!path.isAbsolute(outputDir)) {
    return fail('Output directory', `Not an absolute path: ${outputDir}`, 'Use a full path beginning with /.');
  }
  if (!fs.existsSync(outputDir)) {
    return fail('Output directory', `Does not exist: ${outputDir}`, 'Run a Staatic publish once, or correct the path in Settings.');
  }
  try {
    fs.accessSync(outputDir, fs.constants.W_OK);
  } catch {
    return fail('Output directory', `Not writable: ${outputDir}`, 'Fix the directory permissions.');
  }
  return ok('Output directory', outputDir);
}

/** Wrangler runs via npx, which Electron's stripped PATH often cannot find. */
function checkNpx(): PreflightCheck {
  const candidates = [
    path.join(path.dirname(process.execPath), 'npx'),
    '/opt/homebrew/bin/npx',
    '/usr/local/bin/npx',
    '/usr/bin/npx',
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found
    ? ok('npx (for Wrangler)', found)
    : fail('npx (for Wrangler)', 'Not found in the usual locations.', 'Install Node.js from https://nodejs.org — Wrangler is run through npx.');
}

/** Presence only. Validity is not checked here; that would mean a live API call. */
function checkCloudflareConfig(config: SiteConfig): PreflightCheck {
  const missing = [
    !config.cfApiToken && 'API token',
    !config.cfAccountId && 'account ID',
    !config.cfProjectName && 'project name',
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    return fail('Cloudflare settings', `Missing: ${missing.join(', ')}.`, 'Fill these in on the Settings tab.');
  }
  return ok('Cloudflare settings', `Project "${config.cfProjectName}"`);
}

/** Worst status wins, so a single failure is not hidden by a list of passes. */
export function overallStatus(checks: PreflightCheck[]): PreflightStatus {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'ok';
}

export async function runPreflight(
  ctx: PreflightContext & { siteWebRoot: string },
): Promise<PreflightCheck[]> {
  const sync = [
    checkWpCli(),
    checkPhp(ctx.phpVersion),
    checkSiteRunning(ctx.siteId),
    checkOutputDir(ctx.config.staticOutputDir),
    checkNpx(),
    checkCloudflareConfig(ctx.config),
  ];

  // Network checks run together; each already resolves to a check rather than throwing.
  const async = await Promise.all([
    checkStaatic(ctx.siteWebRoot),
    checkWpRest(ctx.siteUrl),
    checkCompanionPlugin(ctx.siteUrl),
  ]);

  return [...sync, ...async];
}
