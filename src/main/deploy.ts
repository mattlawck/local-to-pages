import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WpCliOptions } from './simplystatic';
import { runStaaticPublish } from './staatic';
import { fetchAllContent, fetchPluginSettings, generateLlmsTxt, generateLlmsFullTxt, generateSitemap, stripHtml, LlmsPluginSettings, WpPost } from './llms';
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
  const pluginSettings = await fetchPluginSettings(ctx.siteUrl);
  const llmsOpts = {
    publicUrl,
    siteUrl: ctx.siteUrl,
    siteTitle: ctx.siteTitle,
    siteDescription: ctx.siteDescription,
    outputDir: ctx.config.staticOutputDir,
    onLog: ctx.onLog,
    content,
    pluginSettings,
    timezone: content.timezone,
  };

  const sitemapExclude = [pluginSettings.page_404_slug, ...pluginSettings.optional_slugs].filter(Boolean);
  await generateSitemap({ publicUrl, outputDir: ctx.config.staticOutputDir, onLog: ctx.onLog, content, timezone: content.timezone, excludeSlugs: sitemapExclude });
  await generateLlmsTxt(llmsOpts);
  await generateLlmsFullTxt(llmsOpts);

  // Step 2.5: Harden the static output + copy favicon + inject head tags
  ctx.onStep('hardening');
  ctx.onLog('--- Step 2.5: Writing security headers, redirect rules, favicon, and head tags ---');
  copy404Page(ctx.config.staticOutputDir, pluginSettings.page_404_slug, ctx.onLog);
  writeSecurityFiles(ctx.config.staticOutputDir, ctx.onLog, ctx.config.customRedirects, pluginSettings.page_404_slug);
  copyFavicon(ctx.config.staticOutputDir, ctx.onLog);
  injectHeadTags(ctx.config.staticOutputDir, ctx.onLog);
  injectPersonSchema(ctx.config.staticOutputDir, ctx.siteTitle, publicUrl, pluginSettings, ctx.onLog);
  injectBlogPostingSchema(ctx.config.staticOutputDir, content.posts, ctx.siteTitle, publicUrl, ctx.onLog);
  injectAnswerCapsules(ctx.config.staticOutputDir, content.posts, ctx.onLog);

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
    '<link rel="preload" as="font" type="font/woff2" href="/wp-content/themes/powder/assets/fonts/google-sans/google-sans.woff2" crossorigin>',
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
        const updated = html.replaceAll('</head>', `  ${tags}\n</head>`);
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
 * Returns true if the string is a valid http/https URL.
 */
function isValidHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Strips characters outside the printable ASCII range and limits length.
 * Used to sanitize network-sourced label strings before writing to disk.
 */
function sanitizeLabel(s: string): string {
  return s.replaceAll(/[^\x20-\x7E]/g, '').trim().slice(0, 300);
}

/**
 * Validates a year string: accepts a 4-digit year or "Present".
 * Returns an empty string for anything else.
 */
function sanitizeYear(s: string): string {
  return /^\d{4}$/.test(s) || s === 'Present' ? s : '';
}

/**
 * Injects a Person JSON-LD schema block into the <head> of every HTML file.
 * Only runs if at least one identity field is present in plugin settings.
 */
function injectPersonSchema(
  outputDir: string,
  siteTitle: string,
  publicUrl: string,
  settings: LlmsPluginSettings,
  onLog: (msg: string) => void,
): void {
  const sameAs: string[] = settings.sameAs_links
    .map((link) => link.url)
    .filter(isValidHttpUrl);

  if (!settings.role && sameAs.length === 0) return;

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    'name': siteTitle,
    'url': publicUrl.replaceAll(/\/$/g, ''),
  };
  if (settings.role) schema['jobTitle'] = sanitizeLabel(settings.role);
  if (settings.employer_name) {
    schema['worksFor'] = {
      '@type': 'Organization',
      'name': sanitizeLabel(settings.employer_name),
      ...(settings.employer_url && isValidHttpUrl(settings.employer_url) ? { 'url': settings.employer_url } : {}),
    };
  }
  if (settings.knows_about.length > 0) schema['knowsAbout'] = settings.knows_about.map(sanitizeLabel);
  if (sameAs.length > 0) schema['sameAs'] = sameAs;
  if (settings.career_history.length > 0) {
    schema['hasOccupation'] = settings.career_history.map((entry) => {
      const endYear = sanitizeYear(entry.end_year);
      const occ: Record<string, unknown> = {
        '@type': 'Role',
        'roleName': sanitizeLabel(entry.role),
        'startDate': String(entry.start_year),
        'worksFor': { '@type': 'Organization', 'name': sanitizeLabel(entry.company) },
      };
      if (endYear && endYear !== 'Present') {
        occ['endDate'] = endYear;
      }
      return occ;
    });
  }

  // Escape </script> sequences to prevent script tag injection from network-sourced field values
  const safeJson = JSON.stringify(schema, null, 2).replaceAll('</', String.raw`<\/`);
  const block = `<script type="application/ld+json">\n${safeJson}\n</script>`;

  let count = 0;

  function processDir(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        processDir(fullPath);
      } else if (entry.name.endsWith('.html')) {
        const html = fs.readFileSync(fullPath, 'utf-8');
        if (html.includes('"@type": "Person"')) continue;
        const updated = html.replaceAll('</head>', `  ${block}\n</head>`);
        if (updated !== html) {
          fs.writeFileSync(fullPath, updated, 'utf-8');
          count++;
        }
      }
    }
  }

  processDir(outputDir);
  onLog(`Injected Person schema into ${count} HTML files`);
}

/**
 * Injects a BlogPosting JSON-LD schema into each post's index.html.
 * Includes datePublished, dateModified, headline, author, url, and featured image if present.
 */
function injectBlogPostingSchema(
  outputDir: string,
  posts: WpPost[],
  siteTitle: string,
  publicUrl: string,
  onLog: (msg: string) => void,
): void {
  const base = publicUrl.replaceAll(/\/$/g, '');
  let count = 0;
  for (const post of posts) {
    const filePath = path.join(outputDir, post.slug, 'index.html');
    let html: string;
    try {
      html = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    if (html.includes('"@type": "BlogPosting"')) continue;

    const schema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      'headline': sanitizeLabel(stripHtml(post.title.rendered)),
      'datePublished': post.date.slice(0, 10),
      'dateModified': post.modified.slice(0, 10),
      'url': `${base}/${post.slug}/`,
      'author': { '@type': 'Person', 'name': siteTitle, 'url': base },
    };
    if (post.featured_image_url && isValidHttpUrl(post.featured_image_url)) {
      // Rewrite local WP host to publicUrl, then reconstruct to break the taint chain
      try {
        const localPath = new URL(post.featured_image_url).pathname;
        const imageUrl = new URL(localPath, base).href;
        schema['image'] = { '@type': 'ImageObject', 'url': imageUrl };
      } catch { /* skip invalid URLs */ }
    }

    const safeJson = JSON.stringify(schema, null, 2).replaceAll('</', String.raw`<\/`);
    const block = `<script type="application/ld+json">\n${safeJson}\n</script>`;
    const updated = html.replaceAll('</head>', `  ${block}\n</head>`);
    if (updated !== html) {
      fs.writeFileSync(filePath, updated, 'utf-8'); // codeql[js/http-to-file-access] filePath is local, not network-controlled
      count++;
    }
  }
  onLog(`Injected BlogPosting schema into ${count} post HTML files`);
}

/**
 * Injects a hidden <div class="ai-summary"> containing the post excerpt into each post's
 * index.html. The div is machine-readable for AI crawlers and RAG pipelines but hidden
 * from visual rendering via inline style and aria-hidden.
 */
function injectAnswerCapsules(outputDir: string, posts: WpPost[], onLog: (msg: string) => void): void {
  let count = 0;
  for (const post of posts) {
    const filePath = path.join(outputDir, post.slug, 'index.html');
    let html: string;
    try {
      html = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    if (html.includes('class="ai-summary"')) continue;
    const summary = sanitizeLabel(stripHtml(post.excerpt.rendered).slice(0, 300).replace(/\s\S*$/, ''));
    if (!summary) continue;
    const capsule = `<div class="ai-summary" style="display:none" aria-hidden="true">${summary}</div>`;
    const updated = html.replace(/<body([^>]*)>/, `<body$1>\n${capsule}`);
    if (updated !== html) {
      fs.writeFileSync(filePath, updated, 'utf-8'); // codeql[js/http-to-file-access] filePath is local, not network-controlled
      count++;
    }
  }
  onLog(`Injected answer capsules into ${count} post HTML files`);
}

/**
 * Copies the designated 404 page from the static output to 404.html in the root.
 * Cloudflare Pages serves 404.html automatically for unmatched routes.
 */
function copy404Page(outputDir: string, slug: string, onLog: (msg: string) => void): void {
  if (!slug) return;
  const src = path.join(outputDir, slug, 'index.html');
  const dest = path.join(outputDir, '404.html');
  let html: string;
  try {
    html = fs.readFileSync(src, 'utf-8');
  } catch {
    onLog(`Warning: 404 page slug "${slug}" not found in static output — skipping`);
    return;
  }
  fs.writeFileSync(dest, html, 'utf-8');
  onLog(`404.html written from /${slug}/`);
}

/**
 * Writes Cloudflare Pages _headers and _redirects files to harden the static output:
 * - Blocks WordPress-specific paths that leak stack info
 * - Adds security headers (CSP, HSTS, X-Frame-Options, etc.)
 * - Removes sensitive files from the output directory
 */
function writeSecurityFiles(outputDir: string, onLog: (msg: string) => void, customRedirects?: string, page404Slug?: string): void {
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
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; worker-src blob:; frame-ancestors 'none'
`;
  fs.writeFileSync(path.join(outputDir, '_headers'), headers);
  onLog('Written: _headers');

  // Cloudflare Pages _redirects — user custom rules first, then WP security blocks, then catch-all
  const notFound = page404Slug ? '/404.html' : '/404_not_found';
  const wpBlocks = [
    `/wp-json/* ${notFound} 404`,
    `/wp-admin/* ${notFound} 404`,
    `/wp-login.php ${notFound} 404`,
    `/xmlrpc.php ${notFound} 404`,
    `/author/* ${notFound} 404`,
    `/feed/* ${notFound} 404`,
    `/comments/* ${notFound} 404`,
    ...(page404Slug ? ['/* /404.html 404'] : []),
  ].join('\n');
  const custom = customRedirects?.trim();
  const customBlock = custom ? `${custom}\n` : '';
  const redirects = `${customBlock}${wpBlocks}\n`;
  fs.writeFileSync(path.join(outputDir, '_redirects'), redirects);
  onLog('Written: _redirects');
}
