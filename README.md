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
- **Local to Pages WordPress plugin** — download `local-to-pages-wordpress-plugin.zip` from the [Releases page](https://github.com/mattlawck/local-to-pages/releases) and install it in WordPress (**Plugins → Add New → Upload Plugin**)
  - After activation, go to **Settings → Local to Pages** and fill in your identity fields (role, GitHub URL, LinkedIn URL, employer, areas of expertise)
  - These fields power the `llms.txt` Core Identity section and the Person JSON-LD schema injected into every page
- [The SEO Framework](https://wordpress.org/plugins/autodescription/) (free) — recommended SEO plugin, compatible with static export
  - Outputs WebSite and WebPage JSON-LD schemas that complement the Person schema added by the add-on
- WordPress REST API enabled (on by default)

### Cloudflare
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)
- An API token with **Cloudflare Pages: Edit** permission
- Your Account ID (visible in the right sidebar of your Cloudflare dashboard)

### Node.js
- [Node.js](https://nodejs.org/) v18 or later installed on your Mac
- Verify by opening Terminal and running `node --version`

## Installation

1. Go to the [Releases page](https://github.com/mattlawck/local-to-pages/releases) and download the `.tgz` file from the latest release (listed under **Assets**).

2. Open **Local by WP Engine**.

3. In the menu bar, click **Local** → **Preferences** (or press **⌘,**), then go to the **Add-ons** tab.

4. Click **Install add-on from disk**, select the `.tgz` file you downloaded, and click **Open**.

5. Restart Local when prompted — the add-on appears in the site sidebar under **Cloudflare Pages**.

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

## Person schema

The add-on injects a `schema.org/Person` JSON-LD block into the `<head>` of every HTML file at deploy time — after the static export, so it's guaranteed to be present regardless of SEO plugin configuration.

The schema is built from your **Local to Pages plugin settings** and your site title/URL:

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Your Name",
  "url": "https://yoursite.com",
  "jobTitle": "Your Role",
  "worksFor": { "@type": "Organization", "name": "Employer", "url": "https://employer.com" },
  "knowsAbout": ["Topic 1", "Topic 2"],
  "sameAs": ["https://github.com/you", "https://linkedin.com/in/you"]
}
```

Fields are only included when set — an empty plugin settings form produces no schema injection.

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
