import { execFile } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { app } from 'electron';

/**
 * Finds the npx binary. Electron's main process runs with a stripped PATH
 * that often excludes Homebrew, so we probe common install locations.
 */
function findNpx(): string {
  const candidates = [
    // npx next to the node that launched this process
    path.join(path.dirname(process.execPath), 'npx'),
    // Homebrew on Apple Silicon
    '/opt/homebrew/bin/npx',
    // Homebrew on Intel / standard unix
    '/usr/local/bin/npx',
    '/usr/bin/npx',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'npx not found. Make sure Node.js is installed (https://nodejs.org).',
  );
}

export interface DeployOptions {
  cfApiToken: string;
  cfAccountId: string;
  cfProjectName: string;
  staticOutputDir: string;
  onLog: (msg: string) => void;
}

/**
 * Deploys the static export directory to Cloudflare Pages using Wrangler via npx.
 * Returns the deployed Pages URL.
 */
export function deployToCloudflarePages(
  opts: DeployOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const npx = findNpx();
    const args = [
      'wrangler@3',
      'pages',
      'deploy',
      opts.staticOutputDir,
      '--project-name',
      opts.cfProjectName,
      '--branch',
      'main',
    ];

    opts.onLog(
      `Deploying ${opts.staticOutputDir} to Cloudflare Pages project "${opts.cfProjectName}"...`,
    );

    // Electron's PATH is stripped — add common Node.js locations so wrangler can find `node`
    const extraPaths = [
      '/opt/homebrew/bin',   // Apple Silicon Homebrew
      '/usr/local/bin',      // Intel Homebrew / standard
      path.dirname(npx), // same dir as npx
    ].join(':');

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${extraPaths}:${process.env.PATH || ''}`,
      HOME: app.getPath('home'),
      CLOUDFLARE_API_TOKEN: opts.cfApiToken,
      CLOUDFLARE_ACCOUNT_ID: opts.cfAccountId,
    };

    let allOutput = '';
    const proc = execFile(npx, args, { env, cwd: app.getPath('home'), maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Wrangler failed (exit ${err.code}):\n${allOutput || stderr || err.message}`));
        return;
      }

      // Extract the deployment URL from wrangler output
      const urlMatch = (stdout + stderr).match(
        /https:\/\/[a-z0-9-]+\.pages\.dev/,
      );
      const pagesUrl = urlMatch
        ? urlMatch[0]
        : `https://${opts.cfProjectName}.pages.dev`;

      resolve(pagesUrl);
    });

    // Stream output in real time and accumulate for error reporting
    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      allOutput += text;
      if (text.trim()) opts.onLog(text.trim());
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      allOutput += text;
      if (text.trim()) opts.onLog(text.trim());
    });
  });
}
