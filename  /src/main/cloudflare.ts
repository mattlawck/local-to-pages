import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Finds the npx binary to invoke wrangler without a global install.
 */
function findNpx(): string {
  // Prefer the npx that ships with the node used to run this process
  const nodeDir = path.dirname(process.execPath);
  const npx = path.join(nodeDir, 'npx');
  if (fs.existsSync(npx)) return npx;
  return 'npx'; // fallback to PATH
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
      'wrangler@latest',
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

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CLOUDFLARE_API_TOKEN: opts.cfApiToken,
      CLOUDFLARE_ACCOUNT_ID: opts.cfAccountId,
    };

    const proc = execFile(npx, args, { env }, (err, stdout, stderr) => {
      if (stdout) opts.onLog(stdout.trim());
      if (stderr) opts.onLog(stderr.trim());

      if (err) {
        reject(new Error(stderr || err.message));
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

    // Stream output in real time
    proc.stdout?.on('data', (chunk: string) => opts.onLog(chunk.toString().trim()));
    proc.stderr?.on('data', (chunk: string) => opts.onLog(chunk.toString().trim()));
  });
}
