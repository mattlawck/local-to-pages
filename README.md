# Local to Cloudflare Pages

A [Local by WP Engine](https://localwp.com/) add-on that deploys your WordPress site as a static site to Cloudflare Pages.

> **macOS only.** This add-on uses macOS-specific paths for Local and PHP and will not run on Windows or Linux.

## What it does

On each deploy:

1. Runs **Staatic** (via WP-CLI) to export your WordPress site as static HTML
2. Generates **llms.txt** and **llms-full.txt** — AI-readable content indexes built from your WordPress content
3. Writes a clean sitemap, security headers, and redirect rules
4. Deploys everything to **Cloudflare Pages** via Wrangler

## Prerequisites

### Local & WordPress
- [Local by WP Engine](https://localwp.com/) with your site running
- [Staatic](https://wordpress.org/plugins/staatic/) (free) installed and activated in WordPress
  - In your WordPress admin, go to **Staatic → Settings → Publishing**
  - Set the deployment method to **Local Directory** and note the output path — you'll need it during setup
- WordPress REST API enabled (on by default)

### Cloudflare
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)
- An API token with **Cloudflare Pages: Edit** permission
- Your Account ID (visible in the right sidebar of your Cloudflare dashboard)

### Node.js
- [Node.js](https://nodejs.org/) v18 or later installed on your Mac
- Verify by opening Terminal and running `node --version`

## Installation

1. Download or clone this repo into Local's add-ons directory:
   ```
   ~/Library/Application Support/Local/addons/local-to-pages/
   ```
   To open this folder in Finder: press **⌘ Shift G**, paste the path above, and press Enter.

2. Open Terminal and run:
   ```bash
   cd ~/Library/Application\ Support/Local/addons/local-to-pages
   npm install --include=dev --legacy-peer-deps
   npm run build
   ```

3. Restart Local — the add-on appears in the site sidebar under **Cloudflare Pages**

## Configuration

Open the **Settings** tab in the add-on panel and fill in:

| Field | Description |
|---|---|
| CF API Token | Create at [dash.cloudflare.com](https://dash.cloudflare.com) → My Profile → API Tokens. Needs **Cloudflare Pages: Edit** permission. |
| CF Account ID | Found in the right sidebar of your Cloudflare dashboard homepage. |
| Pages Project Name | The slug for your Cloudflare Pages project (e.g. `my-site`). Created automatically on first deploy. |
| Public URL | Your live site's full URL (e.g. `https://example.com`). Used in the sitemap and robots.txt. Leave blank to use the default `*.pages.dev` URL. |
| Static Output Directory | The full path to Staatic's local directory output. Find it in **Staatic → Settings → Publishing** in your WordPress admin. |
| Custom Redirects | Optional. Cloudflare Pages redirect rules, one per line (e.g. `/old-page/ /new-page/ 301`). |

Your settings are saved locally on your machine, separately for each Local site.

## Workflow

```
Edit content in WordPress (Local)
  ↓
Click "Deploy" in the add-on panel
  ↓
Staatic exports static HTML → output directory
  ↓
llms.txt + llms-full.txt generated from WordPress REST API
  ↓
Sitemap, security headers, and redirect rules written
  ↓
Wrangler deploys to Cloudflare Pages
  ↓
Live at your-project.pages.dev (or your custom domain after DNS cutover)
```

## DNS cutover

To point your custom domain at Cloudflare Pages:

1. Verify the site looks correct at `your-project.pages.dev`
2. In Cloudflare Pages → **Custom Domains** → add your domain
3. At your domain registrar → update the nameserver records to Cloudflare's NS values
4. Wait for DNS propagation — usually under an hour, but can take up to 48 hours
5. Confirm your domain loads correctly from Cloudflare Pages
6. Keep your old hosting active for a few extra days before canceling, to ensure propagation is complete everywhere

## llms.txt / llms-full.txt

These files are generated from your WordPress content and deployed alongside your site:

- `yourdomain.com/llms.txt` — a structured index of all your pages and posts, formatted for AI agents
- `yourdomain.com/llms-full.txt` — the full text of every page and post as clean markdown

See [llmstxt.org](https://llmstxt.org) for the specification.

## File structure

```
src/
  main/
    index.ts          Entry point, IPC handlers
    deploy.ts         Pipeline orchestration
    simplystatic.ts   WP-CLI utilities (PHP, MySQL socket, wp-cli.phar resolution)
    staatic.ts        Staatic publish via WP-CLI
    llms.ts           llms.txt + llms-full.txt + sitemap generation
    cloudflare.ts     Wrangler deployment
    store.ts          Per-site config (encrypted via macOS Keychain)
  renderer/
    index.tsx         Add-on registration with Local
    App.tsx           Root component + IPC listeners
    DeployPanel.tsx   Deploy button, step progress, live logs
    ConfigPanel.tsx   Settings form
  shared/
    types.ts          Shared types and IPC event names
```
