# Local to Cloudflare Pages

A Local by WP Engine add-on that deploys your WordPress site as a static site to Cloudflare Pages.

## What it does

On each deploy:
1. Triggers **Simply Static Pro** to export your WordPress site as static HTML
2. Queries the WordPress REST API to generate **llms.txt** and **llms-full.txt** (AI agent-friendly content index)
3. Deploys the static output to **Cloudflare Pages** via Wrangler

## Prerequisites

### WordPress (in Local)
- [Simply Static Pro](https://simplystatic.com/) ($99/yr) installed and configured
  - Set deployment method to **Local Directory** and note the output path
- [Rank Math](https://rankmath.com/) (free) installed for SEO meta tags and schema markup
- WordPress REST API enabled (it is by default)

### Cloudflare
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)
- A Cloudflare Pages project created (or the add-on creates it on first deploy)
- An API token with **Cloudflare Pages: Edit** permissions
- Your Account ID (visible on the Cloudflare dashboard sidebar)

### DNS (for custom domain)
- Add `mattlawck.com` to Cloudflare as a site
- Update nameservers in AWS Route 53 to Cloudflare's nameservers
- Add `mattlawck.com` as a custom domain in your Cloudflare Pages project

## Installation

1. Clone or copy this repo into Local's add-ons directory:
   ```
   ~/Library/Application Support/Local/addons/local-to-pages/
   ```

2. Install dependencies:
   ```bash
   npm install --include=dev --legacy-peer-deps
   ```

3. Build the add-on:
   ```bash
   npm run build
   ```

4. Restart Local — the add-on appears in the site sidebar under **Cloudflare Pages**

## Configuration

Open the **Settings** tab in the add-on panel and fill in:

| Field | Where to find it |
|---|---|
| CF API Token | dash.cloudflare.com → My Profile → API Tokens |
| CF Account ID | Right sidebar on dash.cloudflare.com homepage |
| Pages Project Name | The slug you want (e.g. `mattlawck`) |
| Static Output Dir | Staatic's default: `/Users/matt/Local Sites/mattlawckcom/app/public/wp-content/uploads/staatic/deploy` |

Settings are stored per-site using `electron-store` and never leave your machine.

## Workflow

```
Edit content in WordPress (Local)
  ↓
Click "Deploy" in the add-on panel
  ↓
Simply Static exports static HTML → output directory
  ↓
llms.txt + llms-full.txt generated from WP REST API
  ↓
Wrangler deploys to Cloudflare Pages
  ↓
Live at mattlawck.pages.dev (or mattlawck.com after DNS cutover)
```

## File structure

```
src/
  main/
    index.ts          Entry point, IPC handlers
    deploy.ts         Pipeline orchestration
    simplystatic.ts   WP-CLI → Simply Static export
    llms.ts           llms.txt + llms-full.txt generation
    cloudflare.ts     Wrangler deployment
    store.ts          Per-site config persistence
  renderer/
    index.tsx         Add-on registration with Local
    App.tsx           Root component + IPC listeners
    DeployPanel.tsx   Deploy button, step progress, live logs
    ConfigPanel.tsx   Settings form
  shared/
    types.ts          Shared types and IPC event names
```

## DNS cutover (WP Engine → Cloudflare Pages)

1. Verify the site looks correct on `mattlawck.pages.dev`
2. In Cloudflare Pages → Custom Domains → add `mattlawck.com`
3. In AWS Route 53 → update the nameserver records to Cloudflare's NS values
4. Wait for propagation (usually under an hour)
5. Confirm `mattlawck.com` resolves to Cloudflare Pages
6. Cancel WP Engine hosting

## llms.txt / llms-full.txt

These files are placed in the root of your static export and deployed alongside your site:

- `yourdomain.com/llms.txt` — structured markdown index of all pages and posts for AI agents
- `yourdomain.com/llms-full.txt` — complete content of all pages/posts as clean markdown

See [llmstxt.org](https://llmstxt.org) for the specification.
