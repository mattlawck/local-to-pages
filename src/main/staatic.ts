import { runWpCli, WpCliOptions } from './simplystatic';

/**
 * Triggers a full Staatic publish via WP-CLI.
 * Staatic must be installed and configured in WordPress with a local directory deployment.
 * WP-CLI command is included in Staatic's free version.
 */
export async function runStaaticPublish(opts: WpCliOptions): Promise<void> {
  opts.onLog('Starting Staatic publish...');

  // `wp staatic publish` crawls the site and writes static files to the configured output directory
  await runWpCli(['staatic', 'publish'], opts);

  opts.onLog('Staatic publish complete.');
}
