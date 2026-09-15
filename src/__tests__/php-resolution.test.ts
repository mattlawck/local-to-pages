import { describe, it, expect } from 'vitest';
import { selectPhpServiceDirs, buildNumber, compareServiceDirsNewestFirst } from '../main/simplystatic';

// Local reports a bare version (services.php.version === "8.2.27") but names the
// directory with a build suffix ("php-8.2.27+1"). Matching the reported string
// directly never hit, and the silent fallback ran WP-CLI on a different PHP than
// the site itself.
describe('selectPhpServiceDirs', () => {
  const installed = ['php-8.2.27+1', 'php-8.2.29+0', 'php-7.4.30+7'];

  it('matches a version whose directory carries a build suffix', () => {
    expect(selectPhpServiceDirs(installed, '8.2.27')).toEqual(['php-8.2.27+1']);
  });

  it('does not return a different patch version', () => {
    // The regression: 8.2.27 previously resolved to php-8.2.29+0.
    expect(selectPhpServiceDirs(installed, '8.2.27')).not.toContain('php-8.2.29+0');
  });

  it('returns nothing when the requested version is absent', () => {
    expect(selectPhpServiceDirs(installed, '8.3.0')).toEqual([]);
  });

  it('prefers the highest build of the requested version', () => {
    const dirs = ['php-8.2.27+1', 'php-8.2.27+9', 'php-8.2.27+10'];
    expect(selectPhpServiceDirs(dirs, '8.2.27')[0]).toBe('php-8.2.27+10');
  });

  it('matches a directory with no build suffix', () => {
    expect(selectPhpServiceDirs(['php-8.1.0'], '8.1.0')).toEqual(['php-8.1.0']);
  });

  it('does not treat a version as a prefix of a longer one', () => {
    expect(selectPhpServiceDirs(['php-8.2.270+1'], '8.2.27')).toEqual([]);
  });

  it('ignores non-php service directories', () => {
    expect(selectPhpServiceDirs(['mysql-8.0.35+4', 'nginx-1.26.1+3'], '8.0.35')).toEqual([]);
  });
});

describe('buildNumber', () => {
  it('parses the build suffix', () => {
    expect(buildNumber('php-8.2.27+1')).toBe(1);
  });

  it('orders numerically rather than lexically', () => {
    expect(buildNumber('php-8.2.27+10')).toBeGreaterThan(buildNumber('php-8.2.27+9'));
  });

  it('sorts a missing suffix lowest', () => {
    expect(buildNumber('php-8.1.0')).toBe(-1);
  });

  it('sorts a non-numeric suffix lowest', () => {
    expect(buildNumber('php-8.1.0+beta')).toBe(-1);
  });
});

// A default `.sort()` compares UTF-16 code units, so "php-8.2.9" sorts above
// "php-8.2.29" because '9' > '2'. The fallback picked the newest PHP that way,
// which is wrong whenever a single-digit patch meets a double-digit one.
describe('compareServiceDirsNewestFirst', () => {
  const newest = (dirs: string[]) => [...dirs].sort(compareServiceDirsNewestFirst)[0];

  it('orders double-digit patches above single-digit ones', () => {
    expect(newest(['php-8.2.9+0', 'php-8.2.29+0'])).toBe('php-8.2.29+0');
  });

  it('is the case a lexical sort gets wrong', () => {
    // Guards the regression directly: the old `.sort().reverse()` returned
    // php-8.2.9+0 here.
    expect([...['php-8.2.9+0', 'php-8.2.29+0']].sort().reverse()[0]).toBe('php-8.2.9+0');
    expect(newest(['php-8.2.9+0', 'php-8.2.29+0'])).not.toBe('php-8.2.9+0');
  });

  it('compares minor versions numerically', () => {
    expect(newest(['php-8.9.0+0', 'php-8.10.0+0'])).toBe('php-8.10.0+0');
  });

  it('compares major versions numerically', () => {
    expect(newest(['php-9.0.0+0', 'php-10.0.0+0'])).toBe('php-10.0.0+0');
  });

  it('falls back to the build number when versions are equal', () => {
    expect(newest(['php-8.2.27+1', 'php-8.2.27+10'])).toBe('php-8.2.27+10');
  });

  it('ranks a longer version above its prefix', () => {
    expect(newest(['php-8.2', 'php-8.2.1'])).toBe('php-8.2.1');
  });

  it('is a stable total order (sorting twice is idempotent)', () => {
    const dirs = ['php-8.2.9+0', 'php-8.2.29+0', 'php-7.4.30+7', 'php-8.2.27+1'];
    const once = [...dirs].sort(compareServiceDirsNewestFirst);
    expect([...once].sort(compareServiceDirsNewestFirst)).toEqual(once);
    expect(once[0]).toBe('php-8.2.29+0');
  });
});
