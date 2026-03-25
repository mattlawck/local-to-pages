import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import * as http from 'node:http';
import TurndownService from 'turndown';

/** Returns YYYY-MM-DD in the given IANA timezone (e.g. "America/New_York"). */
function localDateString(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export interface WpPage {
  id: number;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  link: string;
  type: string;
}

export interface WpPost extends WpPage {
  date: string;
  categories: number[];
}

export interface WpCategory {
  id: number;
  name: string;
  slug: string;
}

/**
 * Fetches JSON from a URL, following http or https.
 */
function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch {
          reject(new Error(`Failed to parse JSON from ${url}`));
        }
      });
    }).on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error(`Request timed out: ${url}`));
    });
  });
}

/**
 * Escapes special characters for safe inclusion in XML content.
 */
export function escapeXml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Strips HTML tags and decodes basic entities for plain text excerpts.
 */
export function stripHtml(html: string): string {
  return html
    .replaceAll(/<[^>]{0,2000}>/g, ' ')
    .replaceAll(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 10)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
 * Fetches all published pages, posts, and categories from the WP REST API.
 */
export async function fetchAllContent(
  siteUrl: string,
  onLog: (msg: string) => void,
): Promise<{ pages: WpPage[]; posts: WpPost[]; categories: WpCategory[]; timezone: string }> {
  const base = siteUrl.replaceAll(/\/$/g, '');

  // Get site info: front page ID + WordPress timezone setting
  const siteInfo = await fetchJson<{ page_on_front?: number; show_on_front?: string; timezone_string?: string }>(
    `${base}/wp-json/`,
  );
  const frontPageId = siteInfo.show_on_front === 'page' ? siteInfo.page_on_front : null;
  const timezone = siteInfo.timezone_string || 'UTC';

  onLog('Fetching published pages from WordPress REST API...');
  const pages = await fetchJson<WpPage[]>(
    `${base}/wp-json/wp/v2/pages?per_page=100&status=publish&_fields=id,slug,title,content,excerpt,link,type`,
  );

  // Exclude the page set as homepage — it's served at / so its slug URL is redundant
  const filteredPages = pages.filter((p) => p.id !== frontPageId);
  onLog(`Found ${filteredPages.length} pages (front page excluded).`);

  onLog('Fetching published posts from WordPress REST API...');
  const posts = await fetchJson<WpPost[]>(
    `${base}/wp-json/wp/v2/posts?per_page=100&status=publish&_fields=id,slug,title,content,excerpt,link,type,date,categories`,
  );

  onLog(`Found ${posts.length} posts.`);

  onLog('Fetching categories from WordPress REST API...');
  const categories = await fetchJson<WpCategory[]>(
    `${base}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug`,
  );
  onLog(`Found ${categories.length} categories.`);

  return { pages: filteredPages, posts, categories, timezone };
}

/**
 * Generates a clean sitemap.xml from pages and posts, and rewrites robots.txt to point to it.
 * Replaces the WordPress-generated wp-sitemap.xml which exposes user/author URLs.
 */
export async function generateSitemap(opts: {
  publicUrl: string;
  outputDir: string;
  onLog: (msg: string) => void;
  content: { pages: WpPage[]; posts: WpPost[] };
  timezone: string;
}): Promise<void> {
  opts.onLog('Generating sitemap.xml...');

  const { pages, posts } = opts.content;
  const base = opts.publicUrl.replaceAll(/\/$/g, '');
  const tz = opts.timezone;

  const urlEntries = [...pages, ...posts].map((item) => {
    const loc = escapeXml(`${base}/${item.slug}/`);
    const lastmod = 'date' in item && typeof item.date === 'string'
      ? localDateString(new Date(item.date), tz)
      : localDateString(new Date(), tz);
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
  });

  // Always include the homepage
  const homepageLoc = escapeXml(base + '/');
  const homepageDate = localDateString(new Date(), tz);
  urlEntries.unshift(`  <url>\n    <loc>${homepageLoc}</loc>\n    <lastmod>${homepageDate}</lastmod>\n  </url>`);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join('\n')}\n</urlset>\n`;

  fs.writeFileSync(path.join(opts.outputDir, 'sitemap.xml'), xml, 'utf-8');
  opts.onLog(`sitemap.xml written with ${urlEntries.length} URLs`);

  // Rewrite robots.txt — static output has no WP paths to block
  const robots = [
    'User-agent: *',
    'Allow: /',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    '',
    'User-agent: Googlebot',
    'Allow: /',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
    '# content signals',
    '# search: yes',
    '# ai-input: yes',
    '# ai-train: no',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(opts.outputDir, 'robots.txt'), robots, 'utf-8');
  opts.onLog('robots.txt updated');
}

export interface SameAsLink {
  label: string;
  url: string;
}

export interface CareerEntry {
  company: string;
  role: string;
  start_year: number;
  end_year: string; // year string or "Present" or empty
}

export interface Opinion {
  topic: string;
  position: string;
}

export interface LlmsPluginSettings {
  role: string;
  employer_name: string;
  employer_url: string;
  knows_about: string[];
  optional_slugs: string[];
  sameAs_links: SameAsLink[];
  identity_disambiguation: string;
  career_history: CareerEntry[];
  opinions: Opinion[];
}

/**
 * Fetches settings from the Local to Pages WordPress plugin REST endpoint.
 * Returns empty defaults if the plugin is not installed.
 */
export async function fetchPluginSettings(siteUrl: string): Promise<LlmsPluginSettings> {
  const base = siteUrl.replaceAll(/\/$/g, '');
  try {
    return await fetchJson<LlmsPluginSettings>(`${base}/wp-json/local-to-pages/v1/settings`);
  } catch {
    return { role: '', employer_name: '', employer_url: '', knows_about: [], optional_slugs: [], sameAs_links: [], identity_disambiguation: '', career_history: [], opinions: [] };
  }
}

function buildIdentitySection(siteTitle: string, base: string, settings: LlmsPluginSettings): string[] {
  const hasIdentity = settings.role || settings.sameAs_links.length > 0;
  if (!hasIdentity) return [];

  const lines = ['## Core Identity', '', `- **Name:** ${siteTitle}`];
  if (settings.role) lines.push(`- **Role:** ${settings.role}`);
  return [...lines, `- **Primary Domain:** ${base}/`, ''];
}

function buildVerifyIdentitySection(settings: LlmsPluginSettings): string[] {
  if (settings.sameAs_links.length === 0) return [];

  const prefix: string[] = ['## Verify Identity', ''];
  if (settings.identity_disambiguation) {
    prefix.push(settings.identity_disambiguation, '');
  }
  const linkLines = settings.sameAs_links.map((link) => `- [${link.label}](${link.url})`);
  return [...prefix, ...linkLines, ''];
}

function buildContentSection(heading: string, items: WpPage[], base: string): string[] {
  if (items.length === 0) return [];
  const itemLines = items.map((item) => {
    const excerpt = stripHtml(item.excerpt.rendered).slice(0, 120);
    const url = `${base}/${item.slug}/`;
    return `- [${item.title.rendered}](${url})${excerpt ? ': ' + excerpt : ''}`;
  });
  return [`## ${heading}`, '', ...itemLines, ''];
}

function buildCareerSection(career: CareerEntry[]): string[] {
  if (career.length === 0) return [];
  const items = career.map(({ role, company, start_year, end_year }) => {
    const period = end_year || 'Present';
    return `- **${role}** at ${company} (${start_year}–${period})`;
  });
  return ['## Career History', '', ...items, ''];
}

function buildOpinionsSection(opinions: Opinion[]): string[] {
  if (opinions.length === 0) return [];
  const items = opinions.map(({ topic, position }) => `- **${topic}:** ${position}`);
  return ['## Original Positions', '', ...items, ''];
}

function groupPostsByCategory(
  posts: WpPost[],
  catMap: Map<number, string>,
): { clustered: Map<string, WpPost[]>; uncategorized: WpPost[] } {
  const clustered = new Map<string, WpPost[]>();
  const uncategorized: WpPost[] = [];
  for (const post of posts) {
    if (post.categories.length === 0) {
      uncategorized.push(post);
    } else {
      const catName = catMap.get(post.categories[0]) ?? 'Uncategorized';
      if (!clustered.has(catName)) clustered.set(catName, []);
      clustered.get(catName)!.push(post);
    }
  }
  return { clustered, uncategorized };
}

function buildClusterLines(clustered: Map<string, WpPost[]>, uncategorized: WpPost[], base: string): string[] {
  const lines: string[] = ['## Topic Index', ''];
  for (const [catName, catPosts] of clustered) {
    const postLines = catPosts.map((post) => {
      const url = `${base}/${post.slug}/`;
      const excerpt = stripHtml(post.excerpt.rendered).slice(0, 100);
      return `- [${post.title.rendered}](${url})${excerpt ? ': ' + excerpt : ''}`;
    });
    lines.push(`### ${catName}`, '', ...postLines, '');
  }
  if (uncategorized.length > 0) {
    const otherLines = uncategorized.map((post) => `- [${post.title.rendered}](${base}/${post.slug}/)`);
    lines.push('### Other', '', ...otherLines, '');
  }
  return lines;
}

/**
 * Groups posts by their first category to form topic clusters.
 * Returns an empty array if there is only one category or none.
 */
function buildTopicClusters(posts: WpPost[], categories: WpCategory[], base: string): string[] {
  if (posts.length === 0 || categories.length === 0) return [];
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const { clustered, uncategorized } = groupPostsByCategory(posts, catMap);
  if (clustered.size <= 1) return [];
  return buildClusterLines(clustered, uncategorized, base);
}

/**
 * Generates llms.txt — a structured markdown index for AI agents.
 * Standard: https://llmstxt.org
 */
export async function generateLlmsTxt(opts: {
  publicUrl: string;
  siteUrl: string;
  siteTitle: string;
  siteDescription: string;
  outputDir: string;
  onLog: (msg: string) => void;
  content: { pages: WpPage[]; posts: WpPost[]; categories: WpCategory[] };
  pluginSettings?: LlmsPluginSettings;
}): Promise<void> {
  opts.onLog('Generating llms.txt...');

  const { pages, posts, categories } = opts.content;
  const base = opts.publicUrl.replaceAll(/\/$/g, '');
  const settings = opts.pluginSettings ?? await fetchPluginSettings(opts.siteUrl);
  const optionalSlugs = new Set(settings.optional_slugs);
  const keyPages = pages.filter((p) => !optionalSlugs.has(p.slug));
  const optionalPages = pages.filter((p) => optionalSlugs.has(p.slug));

  const topicClusters = buildTopicClusters(posts, categories, base);
  const postSection = topicClusters.length > 0
    ? topicClusters
    : buildContentSection('Posts', posts as WpPage[], base);

  const lines: string[] = [
    `# ${opts.siteTitle}`,
    '',
    `> ${opts.siteDescription}`,
    '',
    ...buildIdentitySection(opts.siteTitle, base, settings),
    ...buildContentSection('Key Resources', keyPages, base),
    ...postSection,
    ...buildContentSection('Optional / Background', optionalPages, base),
    ...buildOpinionsSection(settings.opinions),
    ...buildVerifyIdentitySection(settings),
    '## Technical Documentation for Agents',
    '',
    `- [Full content (llms-full.txt)](${base}/llms-full.txt): Complete text of all pages and posts for AI ingestion`,
    `- [Sitemap](${base}/sitemap.xml): XML sitemap for comprehensive crawling`,
    '',
  ];

  const llmsTxtPath = path.join(opts.outputDir, 'llms.txt');
  fs.writeFileSync(llmsTxtPath, lines.join('\n'), 'utf-8');
  opts.onLog(`llms.txt written to ${llmsTxtPath}`);
}

/**
 * Generates llms-full.txt — complete site content as clean markdown for AI agents.
 */
export async function generateLlmsFullTxt(opts: {
  publicUrl: string;
  siteUrl: string;
  siteTitle: string;
  siteDescription: string;
  outputDir: string;
  onLog: (msg: string) => void;
  content: { pages: WpPage[]; posts: WpPost[]; categories: WpCategory[] };
  pluginSettings?: LlmsPluginSettings;
  timezone: string;
}): Promise<void> {
  opts.onLog('Generating llms-full.txt...');

  const { pages, posts } = opts.content;
  const settings = opts.pluginSettings ?? await fetchPluginSettings(opts.siteUrl);
  const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
  const base = opts.publicUrl.replaceAll(/\/$/g, '');
  const localBase = opts.siteUrl.replaceAll(/\/$/g, '');
  const tz = opts.timezone;
  const today = localDateString(new Date(), tz);

  const sections: string[] = [
    `# ${opts.siteTitle} - Full Content Repository`,
    '',
    `> Last Updated: ${today}`,
    `> Metadata: ${opts.siteDescription}`,
    '',
    ...buildVerifyIdentitySection(settings),
    ...buildCareerSection(settings.career_history),
    ...buildOpinionsSection(settings.opinions),
  ];

  const allContent: Array<WpPage | WpPost> = [...pages, ...posts];

  for (const item of allContent) {
    const url = `${base}/${item.slug}/`;
    const date = 'date' in item
      ? localDateString(new Date(item.date), tz)
      : today;
    const summary = stripHtml(item.excerpt.rendered).slice(0, 200);

    sections.push(
      `<article id="${item.slug}">`,
      `## ${item.title.rendered}`,
      `**Date:** ${date}`,
      `**URL:** ${url}`,
      ...(summary ? [`**Summary:** ${summary}`, ''] : ['']),
    );

    const localBaseHttp = localBase.replace(/^https?:/, 'http:');
    const localBaseHttps = localBase.replace(/^https?:/, 'https:');
    const html = item.content.rendered
      .replaceAll(localBaseHttp, base)
      .replaceAll(localBaseHttps, base);
    const markdown = td.turndown(html);
    sections.push(markdown, '', '</article>', '');
  }

  const fullPath = path.join(opts.outputDir, 'llms-full.txt');
  fs.writeFileSync(fullPath, sections.join('\n'), 'utf-8');
  opts.onLog(`llms-full.txt written to ${fullPath}`);
}
