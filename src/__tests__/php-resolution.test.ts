import { describe, it, expect } from 'vitest';
import { selectPhpServiceDirs, buildNumber } from '../main/simplystatic';

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
