import { describe, it, expect } from 'vitest';
import { overallStatus } from '../main/preflight';
import { PreflightCheck } from '../shared/types';

const check = (status: PreflightCheck['status'], name: string = status): PreflightCheck => ({
  name,
  status,
  detail: 'detail',
});

describe('overallStatus', () => {
  it('is ok when everything passes', () => {
    expect(overallStatus([check('ok'), check('ok')])).toBe('ok');
  });

  it('is warn when something warns but nothing fails', () => {
    expect(overallStatus([check('ok'), check('warn')])).toBe('warn');
  });

  it('is fail when anything fails', () => {
    expect(overallStatus([check('ok'), check('warn'), check('fail')])).toBe('fail');
  });

  it('does not let a majority of passes mask a single failure', () => {
    // The point of preflight: one blocking problem must not be averaged away
    // by a list of green checks.
    const checks = [check('ok', 'a'), check('ok', 'b'), check('ok', 'c'), check('fail', 'd')];
    expect(overallStatus(checks)).toBe('fail');
  });

  it('treats an empty list as ok', () => {
    expect(overallStatus([])).toBe('ok');
  });
});
