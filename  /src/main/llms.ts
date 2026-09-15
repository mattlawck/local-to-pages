import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import TurndownService from 'turndown';

interface WpPage {
  id: number;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  link: string;
  type: string;
}

interface WpPost extends WpPage {
  date: string;
}

/**
 * Fetches JSON from a URL, following http or https.
 */
function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Strips HTML tags and decodes basic entities for plain text excerpts.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetches all published pages and posts from the WP REST API.
 */
async function fetchAllContent(
  siteUrl: string,
  onLog: (msg: string) => void,
): Promise<{ pages: WpPage[]; posts: WpPost[] }> {
  const base = siteUrl.replace(/\/$/, '');

  onLog('Fetching published pages from WordPress REST API...');
  const pages = await fetchJson<WpPage[]>(
    `${base}/wp-json/wp/v2/pages?per_page=100&status=publish&_fields=id,slug,title,content,excerpt,link,type`,
  );

  onLog(`Found ${pages.length} pages.`);

  onLog('Fetching published posts from WordPress REST API...');
  const posts = await fetchJson<WpPost[]>(
    `${base}/wp-json/wp/v2/posts?per_page=100&status=publish&_fields=id,slug,title,content,excerpt,link,type,date`,
  );

  onLog(`Found ${posts.length} posts.`);

  return { pages, posts };
}

/**
 * Generates llms.txt — a structured markdown index for AI agents.
 * Standard: https://llmstxt.org
 */
export async function generateLlmsTxt(opts: {
  siteUrl: string;
  siteTitle: string;
  siteDescription: string;
  outputDir: string;
  onLog: (msg: string) => void;
}): Promise<void> {
  opts.onLog('Generating llms.txt...');

  const { pages, posts } = await fetchAllContent(opts.siteUrl, opts.onLog);

  const publicBase = opts.siteUrl.replace(/\/$/, '');

  const lines: string[] = [
    `# ${opts.siteTitle}`,
    '',
    `> ${opts.siteDescription}`,
    '',
  ];

  if (pages.length > 0) {
    lines.push('## Pages', '');
    for (const page of pages) {
      const excerpt = stripHtml(page.excerpt.rendered);
      const url = `/${page.slug}/`;
      lines.push(
        `- [${page.title.rendered}](${url})${excerpt ? ': ' + excerpt : ''}`,
      );
    }
    lines.push('');
  }

  if (posts.length > 0) {
    lines.push('## Posts', '');
    for (const post of posts as WpPost[]) {
      const excerpt = stripHtml(post.excerpt.rendered);
      const url = `/${post.slug}/`;
      lines.push(
        `- [${post.title.rendered}](${url})${excerpt ? ': ' + excerpt : ''}`,
      );
    }
    lines.push('');
  }

  const llmsTxtPath = path.join(opts.outputDir, 'llms.txt');
  fs.writeFileSync(llmsTxtPath, lines.join('\n'), 'utf-8');
  opts.onLog(`llms.txt written to ${llmsTxtPath}`);
}

/**
 * Generates llms-full.txt — complete site content as clean markdown for AI agents.
 */
export async function generateLlmsFullTxt(opts: {
  siteUrl: string;
  siteTitle: string;
  siteDescription: string;
  outputDir: string;
  onLog: (msg: string) => void;
}): Promise<void> {
  opts.onLog('Generating llms-full.txt...');

  const { pages, posts } = await fetchAllContent(opts.siteUrl, opts.onLog);
  const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });

  const sections: string[] = [
    `# ${opts.siteTitle}`,
    '',
    `> ${opts.siteDescription}`,
    '',
    '---',
    '',
  ];

  const allContent: Array<WpPage | WpPost> = [...pages, ...posts];

  for (const item of allContent) {
    const url = `/${item.slug}/`;
    sections.push(`## [${item.title.rendered}](${url})`, '');

    const markdown = td.turndown(item.content.rendered);
    sections.push(markdown, '', '---', '');
  }

  const fullPath = path.join(opts.outputDir, 'llms-full.txt');
  fs.writeFileSync(fullPath, sections.join('\n'), 'utf-8');
  opts.onLog(`llms-full.txt written to ${fullPath}`);
}
