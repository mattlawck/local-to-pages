import { runSimplyStaticExport, WpCliOptions } from './simplystatic';
import { runStaaticPublish } from './staatic';
import { generateLlmsTxt, generateLlmsFullTxt } from './llms';
import { deployToCloudflarePages } from './cloudflare';
import { SiteConfig } from '../shared/types';

export interface DeployContext {
  siteId: string;
  siteWebRoot: string;
  siteUrl: string; // e.g. http://mattlawck.local or http://localhost:10000
  siteTitle: string;
  siteDescription: string;
  phpVersion: string;
  config: SiteConfig;
  onLog: (msg: string) => void;
  onStep: (step: string) => void;
}

/**
 * Full deploy pipeline:
 * 1. Simply Static export
 * 2. Generate llms.txt + llms-full.txt
 * 3. Deploy to Cloudflare Pages
 *
 * Returns the deployed Pages URL.
 */
export async function runDeployPipeline(ctx: DeployContext): Promise<string> {
  const wpCliOpts: WpCliOptions = {
    siteWebRoot: ctx.siteWebRoot,
    phpVersion: ctx.phpVersion,
    onLog: ctx.onLog,
  };

  // Step 1: Static export
  ctx.onStep('exporting');
  if (ctx.config.exportPlugin === 'staatic') {
    ctx.onLog('--- Step 1: Exporting static site via Staatic ---');
    await runStaaticPublish(wpCliOpts);
  } else {
    ctx.onLog('--- Step 1: Exporting static site via Simply Static ---');
    await runSimplyStaticExport(wpCliOpts);
  }

  // Step 2: llms.txt generation
  ctx.onStep('generating-llms');
  ctx.onLog('--- Step 2: Generating llms.txt and llms-full.txt ---');

  const llmsOpts = {
    siteUrl: ctx.siteUrl,
    siteTitle: ctx.siteTitle,
    siteDescription: ctx.siteDescription,
    outputDir: ctx.config.staticOutputDir,
    onLog: ctx.onLog,
  };

  await generateLlmsTxt(llmsOpts);
  await generateLlmsFullTxt(llmsOpts);

  // Step 3: Deploy to Cloudflare Pages
  ctx.onStep('deploying');
  ctx.onLog('--- Step 3: Deploying to Cloudflare Pages ---');

  const pagesUrl = await deployToCloudflarePages({
    cfApiToken: ctx.config.cfApiToken,
    cfAccountId: ctx.config.cfAccountId,
    cfProjectName: ctx.config.cfProjectName,
    staticOutputDir: ctx.config.staticOutputDir,
    onLog: ctx.onLog,
  });

  ctx.onLog(`Deployment complete: ${pagesUrl}`);
  return pagesUrl;
}
