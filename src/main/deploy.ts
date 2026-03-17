import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WpCliOptions } from './simplystatic';
import { runStaaticPublish } from './staatic';
import { fetchAllContent, generateLlmsTxt, generateLlmsFullTxt, generateSitemap } from './llms';
import { deployToCloudflarePages } from './cloudflare';
import { SiteConfig } from '../shared/types';

export interface DeployContext {
  siteId: string;
  siteWebRoot: string;
  siteUrl: string; // e.g. http://yoursite.local or http://localhost:10000
  siteTitle: string;
  siteDescription: string;
  phpVersion: string;
  config: SiteConfig;
  onLog: (msg: string) => void;
  onStep: (step: string) => void;
}

/**
 * Full deploy pipeline:
 * 1. Staatic export
 * 2. Generate llms.txt + llms-full.txt
 * 3. Deploy to Cloudflare Pages
 *
 * Returns the deployed Pages URL.
 */
export async function runDeployPipeline(ctx: DeployContext): Promise<string> {
  // Validate staticOutputDir before touching the filesystem
  const outputDir = ctx.config.staticOutputDir;
  if (!path.isAbsolute(outputDir)) {
    throw new Error(`Static output directory must be an absolute path: "${outputDir}"`);
  }
  if (!fs.existsSync(outputDir)) {
    throw new Error(`Static output directory does not exist: "${outputDir}"`);
  }
  if (!outputDir.startsWith(os.homedir())) {
    throw new Error(`Static output directory must be inside your home directory: "${outputDir}"`);
  }

  const wpCliOpts: WpCliOptions = {
    siteId: ctx.siteId,
    siteWebRoot: ctx.siteWebRoot,
    phpVersion: ctx.phpVersion,
    onLog: ctx.onLog,
  };

  // Step 1: Static export
  ctx.onStep('exporting');
  ctx.onLog('--- Step 1: Exporting static site via Staatic ---');
  await runStaaticPublish(wpCliOpts);

  // Step 2: llms.txt generation
  ctx.onStep('generating-llms');
  ctx.onLog('--- Step 2: Generating llms.txt and llms-full.txt ---');

  const publicUrl = ctx.config.publicUrl || `https://${ctx.config.cfProjectName}.pages.dev`;
  const content = await fetchAllContent(ctx.siteUrl, ctx.onLog);
  const llmsOpts = {
    publicUrl,
    siteUrl: ctx.siteUrl,
    siteTitle: ctx.siteTitle,
    siteDescription: ctx.siteDescription,
    outputDir: ctx.config.staticOutputDir,
    onLog: ctx.onLog,
    content,
  };

  await generateSitemap({ publicUrl, outputDir: ctx.config.staticOutputDir, onLog: ctx.onLog, content });
  await generateLlmsTxt(llmsOpts);
  await generateLlmsFullTxt(llmsOpts);

  // Step 2.5: Harden the static output + copy favicon + inject head tags
  ctx.onStep('hardening');
  ctx.onLog('--- Step 2.5: Writing security headers, redirect rules, favicon, and head tags ---');
  writeSecurityFiles(ctx.config.staticOutputDir, ctx.onLog, ctx.config.customRedirects);
  copyFavicon(ctx.config.staticOutputDir, ctx.onLog);
  injectHeadTags(ctx.config.staticOutputDir, ctx.onLog);

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

/**
 * Copies favicon.svg from the addon's favicon-assets dir to the static output root.
 * WordPress handles PNG/ICO favicons via the Site Icon setting; we add the SVG
 * for crisp rendering in modern browsers at any resolution.
 */
function copyFavicon(outputDir: string, onLog: (msg: string) => void): void {
  const assetsDir = path.join(__dirname, '..', '..', 'favicon-assets');
  if (!fs.existsSync(assetsDir)) {
    onLog('Warning: favicon-assets/ not found — skipping favicon copy');
    return;
  }

  const files = [
    'favicon.ico',
    'favicon.svg',
    'favicon-16.png',
    'favicon-32.png',
    'favicon-180.png',
    'favicon-512.png',
  ];

  for (const file of files) {
    const src = path.join(assetsDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outputDir, file));
      onLog(`Copied: ${file}`);
    }
  }
}

/**
 * Injects favicon and apple-touch-icon link tags into the <head> of every HTML file.
 * Cloudflare Pages serves favicon.ico automatically but browsers need explicit link
 * tags for the SVG favicon and apple-touch-icon.
 */
function injectHeadTags(outputDir: string, onLog: (msg: string) => void): void {
  const tags = [
    '<link rel="icon" type="image/x-icon" href="/favicon.ico">',
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    '<link rel="apple-touch-icon" href="/favicon-180.png">',
  ].join('\n  ');

  let count = 0;

  function processDir(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        processDir(fullPath);
      } else if (entry.name.endsWith('.html')) {
        const html = fs.readFileSync(fullPath, 'utf-8');
        // Skip if already injected
        if (html.includes('favicon.svg')) continue;
        const updated = html.replace('</head>', `  ${tags}\n</head>`);
        if (updated !== html) {
          fs.writeFileSync(fullPath, updated, 'utf-8');
          count++;
        }
      }
    }
  }

  processDir(outputDir);
  onLog(`Injected favicon tags into ${count} HTML files`);
}

/**
 * Writes Cloudflare Pages _headers and _redirects files to harden the static output:
 * - Blocks WordPress-specific paths that leak stack info
 * - Adds security headers (CSP, HSTS, X-Frame-Options, etc.)
 * - Removes sensitive files from the output directory
 */
function writeSecurityFiles(outputDir: string, onLog: (msg: string) => void, customRedirects?: string): void {
  // Paths to scrub from the static output entirely
  const pathsToRemove = [
    'wp-json',
    'wp-includes',
    'feed',
    'comments',
  ];

  // Remove all WordPress-generated sitemap files (replaced by our clean sitemap.xml)
  const wpSitemaps = fs.readdirSync(outputDir).filter((f) => f.startsWith('wp-sitemap'));
  for (const f of wpSitemaps) pathsToRemove.push(f);

  for (const p of pathsToRemove) {
    const target = path.join(outputDir, p);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      onLog(`Removed: ${p}`);
    }
  }

  // Cloudflare Pages _headers file — applied to every response
  const headers = `/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'
`;
  fs.writeFileSync(path.join(outputDir, '_headers'), headers);
  onLog('Written: _headers');

  // Cloudflare Pages _redirects — user custom rules first, then WP security blocks
  const wpRedirects = `/wp-json/* /404_not_found 404
/wp-admin/* /404_not_found 404
/wp-login.php /404_not_found 404
/xmlrpc.php /404_not_found 404
/author/* /404_not_found 404
/feed/* /404_not_found 404
/comments/* /404_not_found 404
`;
  const custom = customRedirects?.trim();
  const redirects = custom ? `${custom}\n${wpRedirects}` : wpRedirects;
  fs.writeFileSync(path.join(outputDir, '_redirects'), redirects);
  onLog('Written: _redirects');
}
