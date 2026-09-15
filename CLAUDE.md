# local-to-pages

A Local by WP Engine add-on that publishes a WordPress site to Cloudflare Pages as static HTML, with `llms.txt`, sitemap and schema generation along the way.

## Before pushing, run `npm run verify`

```bash
npm run verify    # typecheck && lint && test && build
```

**Run all four, not a subset.** They look redundant and are not — each catches things the others structurally cannot. Two real examples, both from 2026-09-15:

- **`npm test` does not type-check.** Vitest transpiles and runs; type errors pass straight through. A test helper written `(status: PreflightStatus, name = status)` inferred `name` as `PreflightStatus`, so `check('ok', 'a')` was a `TS2345` error. Green suite locally, red CI.
- **`npm run typecheck` does not catch what the bundler does.** `createRequire(import.meta.url)` passed `tsc --noEmit` and then failed `npm run build` with `TS1343`, because ts-loader compiles files under this project's CommonJS module setting.

This matters most when adding a new file under `src/` — webpack type-checks everything the tsconfig includes, test files included.

## Versions are pinned to what Local ships, deliberately

`react`, `react-dom`, `@types/react` and `electron` are pinned to the versions Local supplies at runtime, **not** the newest published. Local provides them; the declared versions exist so TypeScript describes the API the add-on will actually run against.

Getting this wrong is silent. The project shipped for months with `@types/react` on 19 against a react 16 runtime and `electron` types on 44 against Local's 42 — everything compiled, and a React 18+ or Electron 43+ API would have typechecked and then failed inside Local.

`src/__tests__/electron-version-alignment.test.ts` is the tripwire: it asserts the declared majors match what `@getflywheel/local` depends on. **When a Local upgrade brings new versions, that test failing is the signal to re-pin** — not a test to relax. Dependabot ignores majors for these packages for the same reason (see `.github/dependabot.yml`).

## Do not reintroduce `--legacy-peer-deps`

Install with plain `npm install --include=dev`. The flag disables peer checking *project-wide*, which is how `typescript@7` once installed against `@typescript-eslint`'s `<6.1.0` cap and failed later, at runtime, inside ESLint with `Cannot read properties of undefined (reading 'Cjs')`.

The two genuine conflicts are handled narrowly instead — an `overrides` entry for `eslint-plugin-react`, and pinned react versions. A dependency that cannot resolve should fail loudly at install with a message naming the constraint.

## Regenerating the lockfile

```bash
rm -rf node_modules package-lock.json && npm install --include=dev
```

**Delete `node_modules` too.** With it present, npm prefers already-installed versions that satisfy a range rather than querying the registry, so the "fresh" lockfile is rebuilt from whatever stale tree is on disk. That silently walked 39 packages backwards once, reverting two merged dependency PRs and reopening two HIGH advisories. CI stayed green throughout, because downgrades break nothing.

After regenerating, diff resolved versions against the previous lockfile and confirm every downgrade is intentional.

## External assumptions

The add-on depends on undocumented Local internals and third-party CLIs. `src/main/preflight.ts` is the inventory — each check names a contract, and running "Check environment" in the Deploy tab verifies them all against the current machine. When something upstream moves, start there.

- WP-CLI phar at a fixed path inside `Local.app`
- PHP under `lightning-services/php-<version>+<build>/bin/<arch>/bin/php` — note the build suffix; Local reports the bare version
- MySQL socket under `Local/run/<siteId>/mysql/mysqld.sock`, present only while the site runs
- `LocalMain.getServiceContainer().cradle.siteData` — an internal
- the `siteInfoToolsItem` renderer hook
- `wp staatic publish` from the third-party Staatic plugin
- `npx wrangler@3` for deployment

## Workflow

Branch, PR, squash-merge — `main` is protected and rejects direct pushes. Only `ci` is a required check, so **a red SonarCloud gate does not block a merge**; read it before merging anyway, since it caught a real version-ordering bug that CI, ESLint and CodeQL all passed over.
