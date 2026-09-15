import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Reads a package.json from the project root. Deliberately not using
 * `createRequire(import.meta.url)`: this project compiles as CommonJS and
 * webpack type-checks these files, where `import.meta` is a TS1343 error.
 * Vitest runs from the project root, so cwd-relative paths resolve correctly.
 */
function readPkg(...segments: string[]): Record<string, never> & {
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
} {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), ...segments), 'utf-8'));
}

/**
 * Local supplies electron at runtime, so our declared version exists only to
 * make TypeScript describe the API the add-on will actually run against.
 *
 * `@getflywheel/local` is published in lockstep with the Local app (package
 * 10.1.2 matches app 10.1.2) and declares the electron version that release
 * ships. That makes it the source of truth, and this test the tripwire: when a
 * Local update brings a new electron major, bumping @getflywheel/local fails
 * CI here until our electron pin is moved to match.
 *
 * Without this, drift is silent — types would describe one electron major
 * while the add-on runs on another, and tsc would happily approve an API that
 * does not exist at runtime. That is the same failure mode that put
 * @types/react on 19 against a react 16 runtime.
 */
function majorOf(range: string): number {
  const match = /(\d+)\./.exec(range.replace(/^[^\d]*/, ''));
  if (!match) throw new Error(`Could not parse a major version from "${range}"`);
  return Number.parseInt(match[1], 10);
}

describe('electron version alignment with Local', () => {
  const ourRange = readPkg('package.json').peerDependencies!.electron;
  const localPkg = readPkg('node_modules', '@getflywheel', 'local', 'package.json');
  const localRange = localPkg.dependencies!.electron;

  it('declares an explicit electron version rather than a wildcard', () => {
    // "*" resolves to the newest electron published, which is how this project
    // ended up typechecking against 44 while Local shipped 42.
    expect(ourRange).not.toBe('*');
    expect(ourRange).toMatch(/\d+\./);
  });

  it('matches the electron major that @getflywheel/local depends on', () => {
    expect(majorOf(ourRange)).toBe(majorOf(localRange));
  });

  it('resolves an installed electron on that same major', () => {
    const installed = readPkg('node_modules', 'electron', 'package.json');
    expect(majorOf(installed.version)).toBe(majorOf(localRange));
  });
});

describe('react version alignment with Local', () => {
  const localPkg = readPkg('node_modules', '@getflywheel', 'local', 'package.json');

  it('keeps react and its typings on the major Local ships', () => {
    const localReactMajor = majorOf(localPkg.dependencies!.react);
    const ourReact = readPkg('node_modules', 'react', 'package.json');
    const ourTypes = readPkg('node_modules', '@types', 'react', 'package.json');

    expect(majorOf(ourReact.version)).toBe(localReactMajor);
    expect(majorOf(ourTypes.version)).toBe(localReactMajor);
  });
});
